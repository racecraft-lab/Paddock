import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

const TASK_ARTIFACTS_TABLE_SQL = `
  CREATE TABLE task_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    project_id INTEGER,
    producer_agent_id INTEGER,
    workflow_template_slug TEXT,
    artifact_type TEXT NOT NULL,
    schema_version TEXT,
    storage_kind TEXT NOT NULL,
    content_json TEXT,
    content_markdown TEXT,
    storage_uri TEXT,
    original_filename TEXT,
    mime_type TEXT,
    byte_size INTEGER,
    sha256 TEXT,
    preview_text TEXT,
    redaction_status TEXT NOT NULL DEFAULT 'pending',
    security_scan_status TEXT NOT NULL DEFAULT 'pending',
    supersedes_artifact_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

function createChainDb(opts: {
  flagDispositionLogging?: boolean
  flagTaskArtifacts?: boolean
} = {}): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, slug TEXT, feature_flags TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, workspace_id INTEGER NOT NULL, ticket_prefix TEXT, ticket_counter INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, github_sync_enabled INTEGER NOT NULL DEFAULT 0, github_repo TEXT);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT NOT NULL, workspace_id INTEGER NOT NULL);
    CREATE TABLE project_agent_assignments (project_id INTEGER NOT NULL, role TEXT NOT NULL, agent_name TEXT NOT NULL, workspace_id INTEGER NOT NULL);
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      task_prompt TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      slug TEXT,
      agent_role TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_to TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT 1,
      completed_at INTEGER,
      project_id INTEGER,
      project_ticket_no INTEGER,
      resolution TEXT,
      error_message TEXT,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      workspace_id INTEGER NOT NULL,
      workflow_template_id INTEGER,
      workflow_template_slug TEXT,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage INTEGER
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT,
      workspace_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE task_dispositions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      disposition TEXT NOT NULL,
      reason TEXT,
      triaged_by_agent_id INTEGER,
      triaged_at INTEGER,
      workspace_id INTEGER NOT NULL
    );
    ${TASK_ARTIFACTS_TABLE_SQL}
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE task_subscriptions (task_id INTEGER NOT NULL, agent_name TEXT NOT NULL, UNIQUE(task_id, agent_name));
  `)
  const flags: Record<string, boolean> = { FEATURE_TASK_PIPELINES: true }
  if (opts.flagDispositionLogging) flags.FEATURE_DISPOSITION_LOGGING = true
  if (opts.flagTaskArtifacts) flags.FEATURE_TASK_ARTIFACTS = true
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run('alpha', JSON.stringify(flags))
  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)').run('builder', 'builder')
  return db
}

const PILOT_TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['disposition', 'rationale'],
  properties: {
    disposition: {
      type: 'string',
      enum: [
        'ACTIONABLE_REMEDIATION',
        'DUPLICATE',
        'OBSOLETE',
        'INVALID',
        'NEEDS_HUMAN',
        'NEEDS_SPECIALIST',
        'NEEDS_SPEC',
      ],
    },
    rationale: { type: 'string' },
  },
} as const

function addTemplate(
  db: Database.Database,
  values: {
    id: number
    slug: string
    name?: string
    role?: string | null
    outputSchema?: unknown
    routingRules?: unknown[]
    nextTemplateSlug?: string | null
  },
) {
  db.prepare(`
    INSERT INTO workflow_templates
      (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, routing_rules, next_template_slug)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    values.id,
    values.name ?? values.slug,
    `Prompt for ${values.slug}`,
    values.slug,
    values.role ?? 'builder',
    values.outputSchema === undefined ? null : JSON.stringify(values.outputSchema),
    values.routingRules === undefined ? null : JSON.stringify(values.routingRules),
    values.nextTemplateSlug ?? null,
  )
}

function addParent(db: Database.Database, templateId: number, slug: string, resolution: unknown, status = 'done'): number {
  const result = db.prepare(`
    INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
    VALUES (?, ?, 'high', 'builder', 10, ?, 1, ?, ?)
  `).run('Parent', status, resolution === null ? null : JSON.stringify(resolution), templateId, slug)
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({
    getDatabase: () => db,
    db_helpers: { logActivity: vi.fn() },
  }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

function successors(db: Database.Database, parentId: number) {
  return db.prepare(`
    SELECT id, title, assigned_to, workflow_template_id, workflow_template_slug, parent_task_id
    FROM tasks
    WHERE parent_task_id = ?
    ORDER BY id
  `).all(parentId)
}

describe('advanceTaskChain routing', () => {
  it('creates one successor from the first matching ordered routing rule', async () => {
    const db = createChainDb()
    addTemplate(db, {
      id: 1,
      slug: 'triage',
      outputSchema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'] },
      routingRules: [
        { when: '$.kind == "docs"', next_template_slug: 'docs' },
        { when: '$.kind == "build"', next_template_slug: 'build' },
      ],
      nextTemplateSlug: 'fallback',
    })
    addTemplate(db, { id: 2, slug: 'docs' })
    addTemplate(db, { id: 3, slug: 'build' })
    addTemplate(db, { id: 4, slug: 'fallback' })
    const parentId = addParent(db, 1, 'triage', { kind: 'build' })
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })
    expect(successors(db, parentId)).toEqual([
      { id: result.successorTaskId, title: 'build', assigned_to: 'builder', workflow_template_id: 3, workflow_template_slug: 'build', parent_task_id: parentId },
    ])
  })

  it('uses static fallback and terminates normally when no next template is selected', async () => {
    const db = createChainDb()
    addTemplate(db, { id: 1, slug: 'start', nextTemplateSlug: 'fallback' })
    addTemplate(db, { id: 2, slug: 'fallback' })
    const parentId = addParent(db, 1, 'start', null)
    const { advanceTaskChain } = await importDispatch(db)

    expect(advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'assigned', trigger: 'bulk_task_update' }))
      .toMatchObject({ advanced: true, successorTaskId: expect.any(Number) })

    addTemplate(db, { id: 3, slug: 'terminal', routingRules: [{ when: '$.kind == "never"', next_template_slug: 'fallback' }] })
    const terminalParentId = addParent(db, 3, 'terminal', { kind: 'done' })
    expect(advanceTaskChain({ taskId: terminalParentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' }))
      .toMatchObject({ advanced: false, reason: 'chain_terminated' })
    expect(successors(db, terminalParentId)).toEqual([])
  })

  it('creates exactly one remediation-plan successor for ACTIONABLE_REMEDIATION and records pilot evidence', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      name: 'Mission Control Issue Triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'The issue is reproducible and has a bounded fix path.',
    })
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: true, reason: 'successor_created', successorTaskId: expect.any(Number) })
    expect(successors(db, parentId)).toEqual([
      {
        id: result.successorTaskId,
        title: 'Mission Control Remediation Plan',
        assigned_to: 'builder',
        workflow_template_id: 2,
        workflow_template_slug: 'mission-control_remediation_plan',
        parent_task_id: parentId,
      },
    ])
    expect(db.prepare('SELECT disposition, reason FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({
      disposition: 'ACTIONABLE_REMEDIATION',
      reason: 'The issue is reproducible and has a bounded fix path.',
    })
    const artifact = db.prepare(`
      SELECT artifact_type, storage_kind, content_json
      FROM task_artifacts
      WHERE task_id = ?
    `).get(parentId) as { artifact_type: string; storage_kind: string; content_json: string }
    expect(artifact.artifact_type).toBe('triage_outcome')
    expect(artifact.storage_kind).toBe('inline_json')
    expect(JSON.parse(artifact.content_json)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      successor_task_id: result.successorTaskId,
      target_template_slug: 'mission-control_remediation_plan',
    })
    const activity = db.prepare(`
      SELECT entity_type, entity_id, data
      FROM activities
      WHERE type = 'pilot_triage_outcome_recorded'
    `).get() as { entity_type: string; entity_id: number; data: string }
    expect(activity.entity_type).toBe('task')
    expect(activity.entity_id).toBe(parentId)
    expect(JSON.parse(activity.data)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      artifact_type: 'triage_outcome',
      successor_task_id: result.successorTaskId,
    })
  })

  it('returns successor_exists for duplicate actionable handoff attempts without duplicate pilot evidence', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'First handoff wins.',
    })
    const { advanceTaskChain } = await importDispatch(db)

    const first = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })
    const second = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(first).toMatchObject({ advanced: true, reason: 'successor_created' })
    expect(second).toMatchObject({ advanced: false, reason: 'successor_exists', successorTaskId: first.successorTaskId })
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ?').get(parentId)).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({ count: 1 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_artifacts WHERE task_id = ? AND artifact_type = 'triage_outcome'").get(parentId)).toEqual({ count: 1 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity_type = 'task' AND entity_id = ? AND type = 'pilot_triage_outcome_recorded'").get(parentId)).toEqual({ count: 1 })
  })

  it('does not freeze actionable pilot evidence while handoff is stalled and records successor context after recovery', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'Target template is temporarily missing.',
    })
    const { advanceTaskChain } = await importDispatch(db)

    const stalled = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(stalled).toMatchObject({ advanced: false, reason: 'stalled', reasonCode: 'task_pipeline_target_missing' })
    expect(db.prepare('SELECT disposition, reason FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({
      disposition: 'ACTIONABLE_REMEDIATION',
      reason: 'Target template is temporarily missing.',
    })
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_artifacts WHERE task_id = ? AND artifact_type = 'triage_outcome'").get(parentId)).toEqual({ count: 0 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE entity_type = 'task' AND entity_id = ? AND type = 'pilot_triage_outcome_recorded'").get(parentId)).toEqual({ count: 0 })

    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const recovered = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'retry_chain_advancement' })

    expect(recovered).toMatchObject({ advanced: true, reason: 'successor_created', successorTaskId: expect.any(Number) })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({ count: 1 })
    const artifact = db.prepare(`
      SELECT content_json
      FROM task_artifacts
      WHERE task_id = ? AND artifact_type = 'triage_outcome'
    `).get(parentId) as { content_json: string }
    expect(JSON.parse(artifact.content_json)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      successor_task_id: recovered.successorTaskId,
      target_template_slug: 'mission-control_remediation_plan',
    })
    const activity = db.prepare("SELECT data FROM activities WHERE type = 'pilot_triage_outcome_recorded' AND entity_type = 'task' AND entity_id = ?").get(parentId) as { data: string }
    expect(JSON.parse(activity.data)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      successor_task_id: recovered.successorTaskId,
    })
  })

  it('promotes an existing unknown disposition to the corrected pilot disposition and records evidence on retry', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'NOT_A_REAL_DISPOSITION',
      rationale: 'The first output is invalid.',
    })
    const { advanceTaskChain } = await importDispatch(db)

    const invalid = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(invalid).toMatchObject({ advanced: false, reason: 'validation_failed' })
    expect(db.prepare('SELECT disposition, reason FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({
      disposition: 'unknown',
      reason: 'The first output is invalid.',
    })

    const correctedResolution = JSON.stringify({
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'The corrected output is actionable.',
    })
    db.prepare('UPDATE tasks SET status = ?, resolution = ? WHERE id = ?').run('done', correctedResolution, parentId)
    const recovered = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'failed', trigger: 'retry_chain_advancement' })

    expect(recovered).toMatchObject({ advanced: true, reason: 'successor_created', successorTaskId: expect.any(Number) })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({ count: 1 })
    expect(db.prepare('SELECT disposition, reason FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({
      disposition: 'ACTIONABLE_REMEDIATION',
      reason: 'The corrected output is actionable.',
    })
    const artifact = db.prepare(`
      SELECT content_json
      FROM task_artifacts
      WHERE task_id = ? AND artifact_type = 'triage_outcome'
    `).get(parentId) as { content_json: string }
    expect(JSON.parse(artifact.content_json)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      successor_task_id: recovered.successorTaskId,
    })
  })

  it('backfills missing pilot evidence when disposition insert succeeded before artifact publish failed', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'Artifact table is temporarily unavailable.',
    })
    db.exec('DROP TABLE task_artifacts')
    const { advanceTaskChain } = await importDispatch(db)

    const first = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(first).toMatchObject({ advanced: true, reason: 'successor_created', successorTaskId: expect.any(Number) })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'pilot_triage_artifact_publish_failed' AND entity_id = ?").get(parentId)).toEqual({ count: 1 })

    db.exec(TASK_ARTIFACTS_TABLE_SQL)
    const second = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'retry_chain_advancement' })

    expect(second).toMatchObject({ advanced: false, reason: 'successor_exists', successorTaskId: first.successorTaskId })
    expect(db.prepare('SELECT COUNT(*) AS count FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({ count: 1 })
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_artifacts WHERE task_id = ? AND artifact_type = 'triage_outcome'").get(parentId)).toEqual({ count: 1 })
    const activity = db.prepare("SELECT data FROM activities WHERE type = 'pilot_triage_outcome_recorded' AND entity_type = 'task' AND entity_id = ?").get(parentId) as { data: string }
    expect(JSON.parse(activity.data)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      successor_task_id: first.successorTaskId,
    })
  })

  it.each([
    'DUPLICATE',
    'OBSOLETE',
    'INVALID',
    'NEEDS_HUMAN',
    'NEEDS_SPECIALIST',
    'NEEDS_SPEC',
  ])('terminates %s with evidence and no remediation successor', async (disposition) => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition,
      rationale: `${disposition} does not route to remediation.`,
    })
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: false, reason: 'chain_terminated' })
    expect(successors(db, parentId)).toEqual([])
    expect(db.prepare('SELECT disposition, reason FROM task_dispositions WHERE task_id = ?').get(parentId)).toEqual({
      disposition,
      reason: `${disposition} does not route to remediation.`,
    })
    expect(db.prepare("SELECT COUNT(*) AS count FROM task_artifacts WHERE task_id = ? AND artifact_type = 'triage_outcome'").get(parentId)).toEqual({ count: 1 })
    const activity = db.prepare("SELECT data FROM activities WHERE type = 'pilot_triage_outcome_recorded' AND entity_type = 'task' AND entity_id = ?").get(parentId) as { data: string }
    expect(JSON.parse(activity.data)).toMatchObject({
      disposition,
      successor_task_id: null,
      target_template_slug: null,
    })
  })

  it('records task-scoped artifact publish failure activity without complete pilot evidence', async () => {
    const db = createChainDb({ flagDispositionLogging: true, flagTaskArtifacts: true })
    addTemplate(db, {
      id: 1,
      slug: 'mission-control_issue_triage',
      outputSchema: PILOT_TRIAGE_SCHEMA,
      routingRules: [
        { when: '$.disposition == "ACTIONABLE_REMEDIATION"', next_template_slug: 'mission-control_remediation_plan' },
      ],
    })
    addTemplate(db, { id: 2, slug: 'mission-control_remediation_plan', name: 'Mission Control Remediation Plan' })
    const parentId = addParent(db, 1, 'mission-control_issue_triage', {
      disposition: 'ACTIONABLE_REMEDIATION',
      rationale: 'Artifact publish is forced to fail.',
    })
    db.exec('DROP TABLE task_artifacts')
    const { advanceTaskChain } = await importDispatch(db)

    const result = advanceTaskChain({ taskId: parentId, workspaceId: 1, previousStatus: 'review', trigger: 'detail_task_update' })

    expect(result).toMatchObject({ advanced: true, reason: 'successor_created' })
    expect(db.prepare("SELECT COUNT(*) AS count FROM activities WHERE type = 'pilot_triage_outcome_recorded' AND entity_id = ?").get(parentId)).toEqual({ count: 0 })
    const failure = db.prepare(`
      SELECT entity_type, entity_id, data
      FROM activities
      WHERE type = 'pilot_triage_artifact_publish_failed'
    `).get() as { entity_type: string; entity_id: number; data: string }
    expect(failure.entity_type).toBe('task')
    expect(failure.entity_id).toBe(parentId)
    expect(JSON.parse(failure.data)).toMatchObject({
      disposition: 'ACTIONABLE_REMEDIATION',
      artifact_type: 'triage_outcome',
    })
  })
})
