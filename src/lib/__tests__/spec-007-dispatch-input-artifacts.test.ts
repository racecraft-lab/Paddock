/**
 * SPEC-007 US9 — Successor Dispatch metadata.input_artifacts wiring.
 *
 * Covers tasks T600..T603, T611..T613 (TDD red-first) for the dispatch half
 * of US9. The GET /api/task-artifacts/[id] route tests live alongside the
 * route handler under src/app/api/task-artifacts/__tests__/route-by-id.test.ts.
 *
 * Strict scope: this test file lives under src/lib/__tests__/ which is on
 * the SPEC-007 allowlist. The implementation under test is in
 *   src/lib/task-dispatch.ts (input_artifacts attachment + quarantined-skip)
 *
 * Test outline:
 *   - flag-OFF: input_artifacts key MUST NOT be present.
 *   - flag-ON, no artifacts: input_artifacts === [] (key present, empty).
 *   - flag-ON, inline + file: shape matches FR-040/FR-042 (preview_text rules).
 *   - flag-ON, supersede: only the latest non-superseded row appears.
 *   - flag-ON, quarantined: silently skipped + artifact_skipped_quarantined_in_dispatch
 *     activity row written (UNTHROTTLED -- one per skipped artifact per dispatch).
 */

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openDbs: Database.Database[] = []

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close()
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/event-bus')
  vi.doUnmock('@/lib/github-sync-engine')
  vi.doUnmock('@/lib/logger')
  vi.resetModules()
})

function createDb(opts: { flagTaskArtifacts?: boolean } = {}): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT,
      feature_flags TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER,
      ticket_prefix TEXT,
      ticket_counter INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      github_repo TEXT,
      github_sync_enabled INTEGER DEFAULT 0
    );
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL
    );
    CREATE TABLE project_agent_assignments (
      project_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      workspace_id INTEGER NOT NULL
    );
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
      workspace_id INTEGER,
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
    CREATE TABLE task_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL,
      storage_kind TEXT NOT NULL,
      content_json TEXT,
      content_markdown TEXT,
      storage_uri TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      sha256 TEXT,
      preview_text TEXT,
      redaction_status TEXT NOT NULL DEFAULT 'pending',
      security_scan_status TEXT NOT NULL DEFAULT 'pending',
      supersedes_artifact_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  const flags: Record<string, boolean> = { FEATURE_TASK_PIPELINES: true }
  if (opts.flagTaskArtifacts) flags.FEATURE_TASK_ARTIFACTS = true
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)')
    .run('alpha', JSON.stringify(flags))

  db.prepare('INSERT INTO projects (id, workspace_id, ticket_prefix) VALUES (10, 1, ?)').run('ALP')
  db.prepare('INSERT INTO agents (id, name, workspace_id) VALUES (1, ?, 1)').run('builder')
  db.prepare('INSERT INTO project_agent_assignments (project_id, role, agent_name, workspace_id) VALUES (10, ?, ?, 1)')
    .run('builder', 'builder')
  return db
}

function addPipelineTemplate(db: Database.Database, id: number, slug: string, nextSlug: string | null = null): void {
  db.prepare(`
    INSERT INTO workflow_templates (id, name, task_prompt, workspace_id, slug, agent_role, output_schema, next_template_slug)
    VALUES (?, ?, 'p', 1, ?, 'builder', NULL, ?)
  `).run(id, slug, slug, nextSlug)
}

function addParentTask(db: Database.Database, templateId: number, slug: string): number {
  const result = db
    .prepare(`
      INSERT INTO tasks (title, status, priority, assigned_to, project_id, resolution, workspace_id, workflow_template_id, workflow_template_slug)
      VALUES ('Parent', 'done', 'high', 'builder', 10, NULL, 1, ?, ?)
    `)
    .run(templateId, slug)
  return Number(result.lastInsertRowid)
}

interface ArtifactSeed {
  task_id: number
  workspace_id: number
  artifact_type: string
  storage_kind: 'inline_json' | 'inline_markdown' | 'file'
  mime_type: string
  byte_size: number
  sha256: string
  preview_text: string | null
  redaction_status?: 'pending' | 'clean' | 'redacted' | 'rejected' | 'quarantined' | 'superseded'
  supersedes_artifact_id?: number | null
  content_json?: string | null
  content_markdown?: string | null
  storage_uri?: string | null
  created_at?: number
}

function seedArtifact(db: Database.Database, seed: ArtifactSeed): number {
  const result = db
    .prepare(
      `INSERT INTO task_artifacts (
        task_id, workspace_id, artifact_type, storage_kind,
        content_json, content_markdown, storage_uri, mime_type,
        byte_size, sha256, preview_text, redaction_status,
        security_scan_status, supersedes_artifact_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      seed.task_id,
      seed.workspace_id,
      seed.artifact_type,
      seed.storage_kind,
      seed.content_json ?? null,
      seed.content_markdown ?? null,
      seed.storage_uri ?? null,
      seed.mime_type,
      seed.byte_size,
      seed.sha256,
      seed.preview_text,
      seed.redaction_status ?? 'pending',
      'scanned_clean',
      seed.supersedes_artifact_id ?? null,
      seed.created_at ?? Math.floor(Date.now() / 1000),
    )
  return Number(result.lastInsertRowid)
}

async function importDispatch(db: Database.Database) {
  vi.doMock('@/lib/db', () => ({ getDatabase: () => db, db_helpers: { logActivity: vi.fn() } }))
  vi.doMock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
  vi.doMock('@/lib/github-sync-engine', () => ({ syncTaskOutbound: vi.fn() }))
  vi.doMock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
  return import('@/lib/task-dispatch')
}

describe('US9 baseline: flag-OFF -- input_artifacts key MUST NOT be present', () => {
  it('input_artifacts key absent when FEATURE_TASK_ARTIFACTS is OFF', async () => {
    const db = createDb({ flagTaskArtifacts: false })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    expect(result.advanced).toBe(true)
    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)
    expect('input_artifacts' in metadata).toBe(false)
    expect(metadata).toHaveProperty('task_pipeline')
  })
})

describe('T603 (US9): flag-ON, zero artifacts -> input_artifacts === []', () => {
  it('produces an empty array when the producer task has no artifact rows', async () => {
    const db = createDb({ flagTaskArtifacts: true })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    expect(result.advanced).toBe(true)
    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)
    expect('input_artifacts' in metadata).toBe(true)
    expect(Array.isArray(metadata.input_artifacts)).toBe(true)
    expect(metadata.input_artifacts).toEqual([])
  })
})

describe('T600 (US9): flag-ON, inline JSON + file PDF -> shape per FR-040/FR-042', () => {
  it('inline JSON contributes preview_text; file (PDF) contributes binary stub', async () => {
    const db = createDb({ flagTaskArtifacts: true })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    const inlineJson = JSON.stringify({ message: 'hello world' })
    const inlinePreview = inlineJson.slice(0, 4096)
    const inlineSha = 'a'.repeat(64)
    const inlineId = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'plan',
      storage_kind: 'inline_json',
      content_json: inlineJson,
      mime_type: 'application/json',
      byte_size: Buffer.byteLength(inlineJson, 'utf8'),
      sha256: inlineSha,
      preview_text: inlinePreview,
      redaction_status: 'clean',
      created_at: 1000,
    })
    const fileSha = 'b'.repeat(64)
    const fileBytes = 12_345
    const fileStub = `(binary, ${fileBytes} bytes, sha256=${fileSha.slice(0, 12)})`
    const fileId = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'report',
      storage_kind: 'file',
      storage_uri: '/tmp/fake.pdf',
      mime_type: 'application/pdf',
      byte_size: fileBytes,
      sha256: fileSha,
      preview_text: fileStub,
      redaction_status: 'clean',
      created_at: 2000,
    })

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    expect(result.advanced).toBe(true)
    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)

    expect(Array.isArray(metadata.input_artifacts)).toBe(true)
    expect(metadata.input_artifacts).toHaveLength(2)
    const items = metadata.input_artifacts as Array<Record<string, unknown>>
    const first = items[0]!
    const second = items[1]!
    expect(first.id).toBe(inlineId)
    expect(first.type).toBe('plan')
    expect(first.sha256).toBe(inlineSha)
    expect(first.storage_kind).toBe('inline_json')
    expect(first.byte_size).toBe(Buffer.byteLength(inlineJson, 'utf8'))
    expect(first.preview_text).toBe(inlinePreview)

    expect(second.id).toBe(fileId)
    expect(second.type).toBe('report')
    expect(second.sha256).toBe(fileSha)
    expect(second.storage_kind).toBe('file')
    expect(second.byte_size).toBe(fileBytes)
    expect(second.preview_text).toBe(fileStub)
  })
})

describe('T601 (US9): supersede excludes the predecessor', () => {
  it('A1 superseded by A2 -> input_artifacts contains only A2', async () => {
    const db = createDb({ flagTaskArtifacts: true })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    const a1Id = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'plan',
      storage_kind: 'inline_json',
      content_json: '{"v":1}',
      mime_type: 'application/json',
      byte_size: 7,
      sha256: '1'.repeat(64),
      preview_text: '{"v":1}',
      redaction_status: 'superseded',
      created_at: 1000,
    })
    const a2Id = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'plan',
      storage_kind: 'inline_json',
      content_json: '{"v":2}',
      mime_type: 'application/json',
      byte_size: 7,
      sha256: '2'.repeat(64),
      preview_text: '{"v":2}',
      redaction_status: 'clean',
      supersedes_artifact_id: a1Id,
      created_at: 2000,
    })

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)
    expect(metadata.input_artifacts).toHaveLength(1)
    expect((metadata.input_artifacts as Array<{ id: number }>)[0]!.id).toBe(a2Id)
  })
})

describe('T602 (US9): quarantined artifact silently skipped + activity row written', () => {
  it('quarantined row excluded AND artifact_skipped_quarantined_in_dispatch row written', async () => {
    const db = createDb({ flagTaskArtifacts: true })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    const quarantinedId = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'plan',
      storage_kind: 'inline_json',
      content_json: '{"k":"v"}',
      mime_type: 'application/json',
      byte_size: 9,
      sha256: 'q'.repeat(64),
      preview_text: '{"k":"v"}',
      redaction_status: 'quarantined',
      created_at: 1000,
    })
    const cleanId = seedArtifact(db, {
      task_id: parentId,
      workspace_id: 1,
      artifact_type: 'report',
      storage_kind: 'inline_markdown',
      content_markdown: '# heading',
      mime_type: 'text/markdown',
      byte_size: 9,
      sha256: 'c'.repeat(64),
      preview_text: '# heading',
      redaction_status: 'clean',
      created_at: 2000,
    })

    const { advanceTaskChain } = await importDispatch(db)
    const result = advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })
    expect(result.advanced).toBe(true)
    const successor = db
      .prepare('SELECT metadata FROM tasks WHERE id = ?')
      .get(result.successorTaskId!) as { metadata: string }
    const metadata = JSON.parse(successor.metadata)

    const ids = (metadata.input_artifacts as Array<{ id: number }>).map((a) => a.id)
    expect(ids).toEqual([cleanId])
    expect(ids).not.toContain(quarantinedId)

    const skipActivities = db
      .prepare(
        "SELECT type, data FROM activities WHERE type = 'artifact_skipped_quarantined_in_dispatch'",
      )
      .all() as Array<{ type: string; data: string }>
    expect(skipActivities).toHaveLength(1)
    const payload = JSON.parse(skipActivities[0]!.data) as Record<string, unknown>
    expect(payload.artifact_id).toBe(quarantinedId)
    expect(payload.producer_task_id).toBe(parentId)
    expect(payload.successor_task_id).toBe(result.successorTaskId)
    expect(payload.workspace_id).toBe(1)
    expect(payload.reason).toBe('quarantined')
  })

  it('multiple quarantined artifacts -> multiple activity rows (UNTHROTTLED, one per skip)', async () => {
    const db = createDb({ flagTaskArtifacts: true })
    addPipelineTemplate(db, 1, 'start', 'next')
    addPipelineTemplate(db, 2, 'next', null)
    const parentId = addParentTask(db, 1, 'start')

    for (let i = 0; i < 3; i++) {
      seedArtifact(db, {
        task_id: parentId,
        workspace_id: 1,
        artifact_type: `q${i}`,
        storage_kind: 'inline_json',
        content_json: `{"i":${i}}`,
        mime_type: 'application/json',
        byte_size: 7,
        sha256: String(i).repeat(64).slice(0, 64),
        preview_text: `{"i":${i}}`,
        redaction_status: 'quarantined',
        created_at: 1000 + i,
      })
    }

    const { advanceTaskChain } = await importDispatch(db)
    advanceTaskChain({
      taskId: parentId,
      workspaceId: 1,
      previousStatus: 'review',
      trigger: 'detail_task_update',
    })

    const skipActivities = db
      .prepare("SELECT id FROM activities WHERE type = 'artifact_skipped_quarantined_in_dispatch'")
      .all() as Array<{ id: number }>
    expect(skipActivities).toHaveLength(3)
  })
})
