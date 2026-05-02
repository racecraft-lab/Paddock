/**
 * scripts/seed-spec-007.ts — Deterministic seed for SPEC-007 E2E coverage.
 *
 * Provides:
 *   - A reusable async `seedSpec007E2E()` helper consumed by Playwright specs
 *     (`tests/e2e/spec-007-ui-visual.spec.ts`) inside `test.beforeAll`.
 *   - A `cleanup()` returned function used in `test.afterAll`.
 *
 * Mirrors the `seedProductLineE2EData` shape in `tests/helpers.ts` (per
 * Phase Executor task brief): fixture-named slugs, fixed timestamps,
 * idempotent cleanup, two product-line workspaces / 4 agents / 6 dispositions /
 * 30 days, ~50 dispositions in the last 7 days for dashboard coverage,
 * and ~12 artifacts in mixed states.
 *
 * The script is intentionally importable (no top-level CLI side effects); the
 * project does not bundle `tsx`/`ts-node`, so e2e specs invoke the seed
 * function directly. Running this file as a CLI (`pnpm exec tsx
 * scripts/seed-spec-007.ts`) is supported when `tsx` is available locally,
 * but is NOT a requirement for the SPEC-007 quality gate.
 *
 * Determinism: all timestamps derive from `SPEC_007_FIXED_NOW`
 * (2026-05-02T12:00:00.000Z) so Argos screenshots are byte-stable.
 *
 * Strict-scope note: this file is registered in the SPEC-007 allowlist via
 * `ALLOWED_PREFIXES` in `src/lib/__tests__/task-artifacts.enums.test.ts`
 * (`'scripts/seed-spec-007.ts'`).
 */

import type { APIRequestContext } from '@playwright/test'
import path from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'

import { API_KEY_HEADER } from '../tests/helpers'

// ---------------------------------------------------------------------------
// Fixed clock + fixture identifiers.
// ---------------------------------------------------------------------------

export const SPEC_007_FIXED_NOW = new Date('2026-05-02T12:00:00.000Z')
const SPEC_007_FIXED_NOW_SECONDS = Math.floor(SPEC_007_FIXED_NOW.getTime() / 1000)

export const SPEC_007_FIXTURE = {
  alphaWorkspace: { name: 'Spec 007 Alpha', slug: 'spec-007-alpha' },
  betaWorkspace: { name: 'Spec 007 Beta', slug: 'spec-007-beta' },
  alphaProject: { name: 'Spec 007 Alpha Project', ticketPrefix: 'SP7A' },
  betaProject: { name: 'Spec 007 Beta Project', ticketPrefix: 'SP7B' },
  agents: [
    'spec-007-agent-alpha-triager',
    'spec-007-agent-alpha-reviewer',
    'spec-007-agent-beta-triager',
    'spec-007-agent-beta-reviewer',
  ] as const,
  dispositions: [
    'merged',
    'closed',
    'rejected',
    'rerouted',
    'duplicate',
    'completed',
    'abandoned',
    'unknown',
  ] as const,
} as const

export type Spec007DispositionValue = (typeof SPEC_007_FIXTURE.dispositions)[number]

// Counts (per task brief): ~250 dispositions across 30 days, ~50 in last 7d,
// ~12 artifacts in mixed states.
const TOTAL_DISPOSITIONS = 250
const LAST_7D_DISPOSITIONS = 50
const ARTIFACT_TARGETS = {
  cleanInline: 4,
  redactedInline: 2,
  quarantined: 2,
  fileBacked: 2,
  hashMismatch: 1,
  superseded: 1,
} as const

// ---------------------------------------------------------------------------
// Types returned to test specs.
// ---------------------------------------------------------------------------

export interface SeededWorkspace {
  id: number
  name: string
  slug: string
}

export interface SeededAgent {
  id: number
  name: string
  workspaceId: number
}

export interface SeededTask {
  id: number
  workspaceId: number
}

export interface SeededDisposition {
  id: number
  workspace_id: number
  task_id: number
  disposition: Spec007DispositionValue
  triaged_at: number
  triaged_by_agent_id: number | null
  reason: string | null
}

export interface SeededArtifact {
  id: number
  workspace_id: number
  task_id: number
  redaction_status: string
  security_scan_status: string
  storage_kind: string
  byte_size: number | null
  sha256: string | null
}

export interface Spec007E2EFixture {
  alpha: {
    workspace: SeededWorkspace
    project: { id: number; name: string }
    agents: SeededAgent[]
    tasks: SeededTask[]
    dispositions: SeededDisposition[]
    artifacts: SeededArtifact[]
  }
  beta: {
    workspace: SeededWorkspace
    project: { id: number; name: string }
    agents: SeededAgent[]
    tasks: SeededTask[]
    dispositions: SeededDisposition[]
    artifacts: SeededArtifact[]
  }
  fixedNow: Date
  cleanup: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Database helpers.
// ---------------------------------------------------------------------------

function getE2EDbPath(): string {
  return (
    process.env.MISSION_CONTROL_DB_PATH ||
    path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
  )
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
  )
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

function deleteWhereIn(
  db: Database.Database,
  table: string,
  column: string,
  values: readonly unknown[],
): void {
  if (values.length === 0 || !tableExists(db, table)) return
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(values)})`).run(...values)
}

function selectIdsWhereIn(
  db: Database.Database,
  table: string,
  column: string,
  values: readonly unknown[],
): number[] {
  if (values.length === 0 || !tableExists(db, table)) return []
  return db
    .prepare(`SELECT id FROM ${table} WHERE ${column} IN (${placeholders(values)})`)
    .all(...values)
    .map((row) => (row as { id: number }).id)
}

function mergeFeatureFlags(raw: string | null, updates: Record<string, unknown>): string {
  let flags: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        flags = parsed as Record<string, unknown>
      }
    } catch {
      flags = {}
    }
  }
  return JSON.stringify({ ...flags, ...updates })
}

function enableSpec007WorkspaceFlags(): () => void {
  const db = new Database(getE2EDbPath())
  try {
    const rows = db
      .prepare('SELECT id, feature_flags FROM workspaces')
      .all() as Array<{ id: number; feature_flags: string | null }>
    const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    for (const row of rows) {
      update.run(
        mergeFeatureFlags(row.feature_flags, {
          FEATURE_WORKSPACE_SWITCHER: true,
          FEATURE_DISPOSITION_LOGGING: true,
          FEATURE_TASK_ARTIFACTS: true,
        }),
        row.id,
      )
    }
    db.pragma('wal_checkpoint(TRUNCATE)')

    return () => {
      const restoreDb = new Database(getE2EDbPath())
      try {
        const restore = restoreDb.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
        for (const row of rows) {
          restore.run(row.feature_flags, row.id)
        }
        restoreDb.pragma('wal_checkpoint(TRUNCATE)')
      } finally {
        restoreDb.close()
      }
    }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Idempotent reset — purge any previously-seeded SPEC-007 fixtures.
// ---------------------------------------------------------------------------

export function resetSpec007Fixtures(): void {
  const dbPath = getE2EDbPath()
  const db = new Database(dbPath)
  try {
    db.transaction(() => {
      const workspaceSlugs = [
        SPEC_007_FIXTURE.alphaWorkspace.slug,
        SPEC_007_FIXTURE.betaWorkspace.slug,
      ]
      const workspaceIds = selectIdsWhereIn(db, 'workspaces', 'slug', workspaceSlugs)
      const taskIds = selectIdsWhereIn(db, 'tasks', 'workspace_id', workspaceIds)

      // Child rows first.
      deleteWhereIn(db, 'task_artifacts', 'workspace_id', workspaceIds)
      deleteWhereIn(db, 'task_dispositions', 'workspace_id', workspaceIds)
      deleteWhereIn(db, 'activities', 'workspace_id', workspaceIds)
      deleteWhereIn(db, 'comments', 'task_id', taskIds)
      deleteWhereIn(db, 'task_subscriptions', 'task_id', taskIds)
      deleteWhereIn(db, 'quality_reviews', 'task_id', taskIds)
      deleteWhereIn(db, 'tasks', 'id', taskIds)

      // Agents named under the SPEC-007 namespace.
      deleteWhereIn(db, 'agents', 'name', SPEC_007_FIXTURE.agents)
      deleteWhereIn(db, 'agents', 'workspace_id', workspaceIds)

      // Projects in the seeded workspaces.
      deleteWhereIn(db, 'projects', 'workspace_id', workspaceIds)

      // Workspaces last.
      deleteWhereIn(db, 'workspaces', 'id', workspaceIds)
    })()
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// REST helpers (workspace/project/agent/task creation through the API to
// preserve auth + scope semantics).
// ---------------------------------------------------------------------------

function withWorkspaceScope(pathname: string, workspaceId: number): string {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}workspace_id=${encodeURIComponent(String(workspaceId))}`
}

async function expectJsonOk<T>(
  res: Awaited<ReturnType<APIRequestContext['post']>>,
  label: string,
): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | null
  if (!res.ok() || body == null) {
    throw new Error(`${label} failed (${String(res.status())}): ${JSON.stringify(body)}`)
  }
  return body
}

async function createWorkspace(
  request: APIRequestContext,
  name: string,
  slug: string,
): Promise<SeededWorkspace> {
  const res = await request.post('/api/workspaces', {
    headers: API_KEY_HEADER,
    data: { name, slug },
  })
  const body = await expectJsonOk<{ workspace?: SeededWorkspace }>(res, `create workspace ${name}`)
  if (!body.workspace?.id) throw new Error(`workspace ${name} missing id`)
  return body.workspace
}

async function createProject(
  request: APIRequestContext,
  workspaceId: number,
  name: string,
  ticketPrefix: string,
): Promise<{ id: number; name: string }> {
  const res = await request.post(withWorkspaceScope('/api/projects', workspaceId), {
    headers: API_KEY_HEADER,
    data: { name, ticket_prefix: ticketPrefix },
  })
  const body = await expectJsonOk<{ project?: { id: number; name: string } }>(
    res,
    `create project ${name}`,
  )
  if (!body.project?.id) throw new Error(`project ${name} missing id`)
  return body.project
}

async function createAgent(
  request: APIRequestContext,
  workspaceId: number,
  name: string,
): Promise<SeededAgent> {
  const res = await request.post(withWorkspaceScope('/api/agents', workspaceId), {
    headers: API_KEY_HEADER,
    data: { name, role: 'tester', status: 'offline' },
  })
  const body = await expectJsonOk<{ agent?: { id: number; name: string } }>(
    res,
    `create agent ${name}`,
  )
  if (!body.agent?.id) throw new Error(`agent ${name} missing id`)
  return { id: body.agent.id, name: body.agent.name, workspaceId }
}

async function createTask(
  request: APIRequestContext,
  workspaceId: number,
  projectId: number,
  title: string,
  assignedTo: string,
): Promise<SeededTask> {
  const res = await request.post(withWorkspaceScope('/api/tasks', workspaceId), {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} seeded by SPEC-007 e2e fixture`,
      priority: 'medium',
      status: 'inbox',
      project_id: projectId,
      assigned_to: assignedTo,
    },
  })
  const body = await expectJsonOk<{ task?: { id: number } }>(res, `create task ${title}`)
  if (!body.task?.id) throw new Error(`task ${title} missing id`)
  return { id: body.task.id, workspaceId }
}

// ---------------------------------------------------------------------------
// Direct-DB inserts for dispositions + artifacts. Both tables are app-level
// (no public REST POST in v1 for direct admin seeding), so we write through
// `better-sqlite3` mirroring the schemas declared in M057 / M058.
// ---------------------------------------------------------------------------

interface DispositionPlan {
  workspace_id: number
  task_id: number
  disposition: Spec007DispositionValue
  triaged_at: number
  triaged_by_agent_id: number | null
  reason: string | null
}

function buildDispositionPlan(
  workspace: SeededWorkspace,
  agents: SeededAgent[],
  tasks: SeededTask[],
): DispositionPlan[] {
  const plans: DispositionPlan[] = []
  const dayCount = 30
  const last7DayCutoff = SPEC_007_FIXED_NOW_SECONDS - 7 * 24 * 60 * 60

  // Phase 1: spread roughly 200 across days 7..30 (older window).
  const olderTarget = TOTAL_DISPOSITIONS - LAST_7D_DISPOSITIONS
  for (let i = 0; i < olderTarget; i++) {
    const dayOffset = 7 + (i % (dayCount - 7)) // days 7..29
    const triaged_at = SPEC_007_FIXED_NOW_SECONDS - dayOffset * 24 * 60 * 60 - (i % 86_400)
    plans.push({
      workspace_id: workspace.id,
      task_id: tasks[i % tasks.length]!.id,
      disposition: SPEC_007_FIXTURE.dispositions[i % SPEC_007_FIXTURE.dispositions.length]!,
      triaged_at,
      triaged_by_agent_id: agents[i % agents.length]!.id,
      reason: i % 5 === 0 ? `seed reason ${String(i)}` : null,
    })
  }

  // Phase 2: 50 dispositions in the last 7 days, distributed across all 7 days
  // for the dashboard widget rollup.
  for (let i = 0; i < LAST_7D_DISPOSITIONS; i++) {
    const dayOffset = i % 7 // days 0..6
    const triaged_at = SPEC_007_FIXED_NOW_SECONDS - dayOffset * 24 * 60 * 60 - (i % 3600)
    plans.push({
      workspace_id: workspace.id,
      task_id: tasks[i % tasks.length]!.id,
      disposition: SPEC_007_FIXTURE.dispositions[i % SPEC_007_FIXTURE.dispositions.length]!,
      triaged_at: Math.max(triaged_at, last7DayCutoff + 1),
      triaged_by_agent_id: agents[i % agents.length]!.id,
      reason: null,
    })
  }
  return plans
}

function insertDispositions(
  db: Database.Database,
  plans: DispositionPlan[],
): SeededDisposition[] {
  if (plans.length === 0) return []
  if (!tableExists(db, 'task_dispositions')) return []
  const stmt = db.prepare(
    `INSERT INTO task_dispositions
       (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const out: SeededDisposition[] = []
  const tx = db.transaction((rows: DispositionPlan[]) => {
    for (const p of rows) {
      const info = stmt.run(
        p.task_id,
        p.disposition,
        p.reason,
        p.triaged_by_agent_id,
        p.triaged_at,
        p.workspace_id,
      )
      out.push({
        id: Number(info.lastInsertRowid),
        workspace_id: p.workspace_id,
        task_id: p.task_id,
        disposition: p.disposition,
        triaged_at: p.triaged_at,
        triaged_by_agent_id: p.triaged_by_agent_id,
        reason: p.reason,
      })
    }
  })
  tx(plans)
  return out
}

interface ArtifactPlan {
  workspace_id: number
  task_id: number
  artifact_type: string
  storage_kind: 'inline_json' | 'inline_markdown' | 'file' | 'external_uri'
  storage_uri: string | null
  redaction_status: string
  security_scan_status: string
  byte_size: number | null
  mime: string | null
  content_json: string | null
  content_markdown: string | null
  sha256: string | null
  schema_version: string | null
  workflow_template_slug: string | null
  original_filename: string | null
  producer_agent_id: number | null
  supersedes_artifact_id: number | null
  created_at: number
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function buildArtifactPlans(
  workspace: SeededWorkspace,
  agents: SeededAgent[],
  tasks: SeededTask[],
): ArtifactPlan[] {
  const baseTs = SPEC_007_FIXED_NOW_SECONDS - 24 * 60 * 60
  const plans: ArtifactPlan[] = []
  let cursor = 0
  const nextTask = () => tasks[cursor++ % tasks.length]!

  // 4 clean inline_json
  for (let i = 0; i < ARTIFACT_TARGETS.cleanInline; i++) {
    const task = nextTask()
    const json = JSON.stringify({ outcome: 'ok', index: i })
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      storage_uri: null,
      redaction_status: 'clean',
      security_scan_status: 'scanned_clean',
      byte_size: Buffer.byteLength(json, 'utf8'),
      mime: 'application/json',
      content_json: json,
      content_markdown: null,
      sha256: sha256(json),
      schema_version: '2026-05',
      workflow_template_slug: 'spec-007-triage',
      original_filename: null,
      producer_agent_id: agents[i % agents.length]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + i,
    })
  }

  // 2 redacted text-like (inline_markdown content with redacted status)
  for (let i = 0; i < ARTIFACT_TARGETS.redactedInline; i++) {
    const task = nextTask()
    const md = `Redacted preview ${String(i)}: <REDACTED:secret>\n`
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_markdown',
      storage_uri: null,
      redaction_status: 'redacted',
      security_scan_status: 'scanned_with_findings',
      byte_size: Buffer.byteLength(md, 'utf8'),
      mime: 'text/markdown',
      content_json: null,
      content_markdown: md,
      sha256: sha256(md),
      schema_version: null,
      workflow_template_slug: 'spec-007-triage',
      original_filename: null,
      producer_agent_id: agents[(i + 1) % agents.length]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + 100 + i,
    })
  }

  // 2 quarantined (one inline, one file-backed for variety)
  for (let i = 0; i < ARTIFACT_TARGETS.quarantined; i++) {
    const task = nextTask()
    const isFile = i === 1
    const content = `Quarantined sample ${String(i)}`
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'triage_outcome',
      storage_kind: isFile ? 'file' : 'inline_markdown',
      storage_uri: isFile
        ? `${workspace.id}/2026/05/quarantined-${String(i)}.bin`
        : null,
      redaction_status: 'quarantined',
      security_scan_status: 'scanned_with_findings',
      byte_size: Buffer.byteLength(content, 'utf8'),
      mime: isFile ? 'application/octet-stream' : 'text/markdown',
      content_json: null,
      content_markdown: isFile ? null : content,
      sha256: sha256(content),
      schema_version: null,
      workflow_template_slug: 'spec-007-triage',
      original_filename: isFile ? `quarantined-${String(i)}.bin` : null,
      producer_agent_id: agents[i % agents.length]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + 200 + i,
    })
  }

  // 2 file-backed clean
  for (let i = 0; i < ARTIFACT_TARGETS.fileBacked; i++) {
    const task = nextTask()
    const content = `File-backed payload ${String(i)}`
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'attachment',
      storage_kind: 'file',
      storage_uri: `${workspace.id}/2026/05/clean-${String(i)}.txt`,
      redaction_status: 'clean',
      security_scan_status: 'scanned_clean',
      byte_size: Buffer.byteLength(content, 'utf8'),
      mime: 'text/plain',
      content_json: null,
      content_markdown: null,
      sha256: sha256(content),
      schema_version: null,
      workflow_template_slug: null,
      original_filename: `clean-${String(i)}.txt`,
      producer_agent_id: agents[(i + 2) % agents.length]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + 300 + i,
    })
  }

  // 1 hash_mismatch
  {
    const task = nextTask()
    const content = `Hash mismatch sample`
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'attachment',
      storage_kind: 'file',
      storage_uri: `${workspace.id}/2026/05/hash-mismatch.txt`,
      redaction_status: 'clean',
      security_scan_status: 'hash_mismatch',
      byte_size: Buffer.byteLength(content, 'utf8'),
      mime: 'text/plain',
      content_json: null,
      content_markdown: null,
      sha256: sha256(content),
      schema_version: null,
      workflow_template_slug: null,
      original_filename: 'hash-mismatch.txt',
      producer_agent_id: agents[0]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + 400,
    })
  }

  // 1 superseded — references the first clean inline as predecessor (we will
  // wire `supersedes_artifact_id` after insert; placeholder = null at plan time
  // and a post-insert UPDATE statement records the lineage).
  {
    const task = nextTask()
    const json = JSON.stringify({ outcome: 'superseded', revision: 2 })
    plans.push({
      workspace_id: workspace.id,
      task_id: task.id,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      storage_uri: null,
      redaction_status: 'superseded',
      security_scan_status: 'scanned_clean',
      byte_size: Buffer.byteLength(json, 'utf8'),
      mime: 'application/json',
      content_json: json,
      content_markdown: null,
      sha256: sha256(json),
      schema_version: '2026-05',
      workflow_template_slug: 'spec-007-triage',
      original_filename: null,
      producer_agent_id: agents[1]?.id ?? null,
      supersedes_artifact_id: null,
      created_at: baseTs + 500,
    })
  }
  return plans
}

function insertArtifacts(
  db: Database.Database,
  plans: ArtifactPlan[],
): SeededArtifact[] {
  if (plans.length === 0) return []
  if (!tableExists(db, 'task_artifacts')) return []
  const stmt = db.prepare(
    `INSERT INTO task_artifacts
       (task_id, workspace_id, artifact_type, storage_kind, storage_uri,
        redaction_status, security_scan_status, sha256, byte_size, mime_type,
        content_json, content_markdown, preview_text, schema_version,
        workflow_template_slug, original_filename, producer_agent_id,
        supersedes_artifact_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const out: SeededArtifact[] = []
  const insertedIds: number[] = []
  const tx = db.transaction((rows: ArtifactPlan[]) => {
    for (const p of rows) {
      const info = stmt.run(
        p.task_id,
        p.workspace_id,
        p.artifact_type,
        p.storage_kind,
        p.storage_uri,
        p.redaction_status,
        p.security_scan_status,
        p.sha256,
        p.byte_size,
        p.mime,
        p.content_json,
        p.content_markdown,
        // preview_text — left null; live publish path computes it.
        null,
        p.schema_version,
        p.workflow_template_slug,
        p.original_filename,
        p.producer_agent_id,
        p.supersedes_artifact_id,
        p.created_at,
      )
      insertedIds.push(Number(info.lastInsertRowid))
      out.push({
        id: Number(info.lastInsertRowid),
        workspace_id: p.workspace_id,
        task_id: p.task_id,
        redaction_status: p.redaction_status,
        security_scan_status: p.security_scan_status,
        storage_kind: p.storage_kind,
        byte_size: p.byte_size,
        sha256: p.sha256,
      })
    }
  })
  tx(plans)

  // Link the superseded row (last in the plan) to the first clean inline (first row).
  if (out.length >= 2 && tableExists(db, 'task_artifacts')) {
    const supersededId = out[out.length - 1]!.id
    const predecessorId = out[0]!.id
    db.prepare(
      `UPDATE task_artifacts SET supersedes_artifact_id = ? WHERE id = ?`,
    ).run(predecessorId, supersededId)
  }
  return out
}

// ---------------------------------------------------------------------------
// Top-level seed entrypoint.
// ---------------------------------------------------------------------------

export async function seedSpec007E2E(
  request: APIRequestContext,
): Promise<Spec007E2EFixture> {
  // 1) Idempotent reset.
  resetSpec007Fixtures()
  const restoreWorkspaceFlags = enableSpec007WorkspaceFlags()
  try {

  // 2) Build the two product-line workspaces with one project each through the API.
  const alphaWorkspace = await createWorkspace(
    request,
    SPEC_007_FIXTURE.alphaWorkspace.name,
    SPEC_007_FIXTURE.alphaWorkspace.slug,
  )
  const betaWorkspace = await createWorkspace(
    request,
    SPEC_007_FIXTURE.betaWorkspace.name,
    SPEC_007_FIXTURE.betaWorkspace.slug,
  )

  const alphaProject = await createProject(
    request,
    alphaWorkspace.id,
    SPEC_007_FIXTURE.alphaProject.name,
    SPEC_007_FIXTURE.alphaProject.ticketPrefix,
  )
  const betaProject = await createProject(
    request,
    betaWorkspace.id,
    SPEC_007_FIXTURE.betaProject.name,
    SPEC_007_FIXTURE.betaProject.ticketPrefix,
  )

  const alphaAgents = [
    await createAgent(request, alphaWorkspace.id, SPEC_007_FIXTURE.agents[0]),
    await createAgent(request, alphaWorkspace.id, SPEC_007_FIXTURE.agents[1]),
  ]
  const betaAgents = [
    await createAgent(request, betaWorkspace.id, SPEC_007_FIXTURE.agents[2]),
    await createAgent(request, betaWorkspace.id, SPEC_007_FIXTURE.agents[3]),
  ]

  // Two tasks per workspace as triage parents.
  const alphaTasks: SeededTask[] = []
  for (let i = 0; i < 2; i++) {
    alphaTasks.push(
      await createTask(
        request,
        alphaWorkspace.id,
        alphaProject.id,
        `SPEC-007 Alpha task ${String(i)}`,
        alphaAgents[i % alphaAgents.length]!.name,
      ),
    )
  }
  const betaTasks: SeededTask[] = []
  for (let i = 0; i < 2; i++) {
    betaTasks.push(
      await createTask(
        request,
        betaWorkspace.id,
        betaProject.id,
        `SPEC-007 Beta task ${String(i)}`,
        betaAgents[i % betaAgents.length]!.name,
      ),
    )
  }

  // 3) Direct DB inserts for dispositions + artifacts.
  const dbPath = getE2EDbPath()
  const db = new Database(dbPath)
  let alphaDispositions: SeededDisposition[] = []
  let betaDispositions: SeededDisposition[] = []
  let alphaArtifacts: SeededArtifact[] = []
  let betaArtifacts: SeededArtifact[] = []
  try {
    const alphaPlans = buildDispositionPlan(alphaWorkspace, alphaAgents, alphaTasks)
    const betaPlans = buildDispositionPlan(betaWorkspace, betaAgents, betaTasks)
    alphaDispositions = insertDispositions(db, alphaPlans)
    betaDispositions = insertDispositions(db, betaPlans)

    alphaArtifacts = insertArtifacts(
      db,
      buildArtifactPlans(alphaWorkspace, alphaAgents, alphaTasks),
    )
    betaArtifacts = insertArtifacts(
      db,
      buildArtifactPlans(betaWorkspace, betaAgents, betaTasks),
    )

    // Enable both feature flags on the seeded workspaces (idempotent JSON merge).
    if (tableExists(db, 'workspaces')) {
      const updateFlags = db.prepare(
        `SELECT feature_flags FROM workspaces WHERE id = ?`,
      )
      const setFlags = db.prepare(
        `UPDATE workspaces SET feature_flags = ? WHERE id = ?`,
      )
      for (const ws of [alphaWorkspace, betaWorkspace]) {
        const row = updateFlags.get(ws.id) as { feature_flags: string | null } | undefined
        let flags: Record<string, unknown> = {}
        if (row?.feature_flags) {
          try {
            const parsed: unknown = JSON.parse(row.feature_flags)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              flags = parsed as Record<string, unknown>
            }
          } catch {
            flags = {}
          }
        }
        flags.FEATURE_WORKSPACE_SWITCHER = true
        flags.FEATURE_DISPOSITION_LOGGING = true
        flags.FEATURE_TASK_ARTIFACTS = true
        setFlags.run(JSON.stringify(flags), ws.id)
      }
    }

    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }

  const cleanup = async (): Promise<void> => {
    // Delete tasks, agents, projects, workspaces through the API for symmetry,
    // best-effort; resetSpec007Fixtures handles direct-DB child rows.
    for (const task of [...alphaTasks, ...betaTasks].reverse()) {
      await request
        .delete(withWorkspaceScope(`/api/tasks/${String(task.id)}`, task.workspaceId), {
          headers: API_KEY_HEADER,
        })
        .catch(() => undefined)
    }
    for (const agent of [...alphaAgents, ...betaAgents].reverse()) {
      await request
        .delete(withWorkspaceScope(`/api/agents/${String(agent.id)}`, agent.workspaceId), {
          headers: API_KEY_HEADER,
        })
        .catch(() => undefined)
    }
    await request
      .delete(
        withWorkspaceScope(`/api/projects/${String(alphaProject.id)}?mode=delete`, alphaWorkspace.id),
        { headers: API_KEY_HEADER },
      )
      .catch(() => undefined)
    await request
      .delete(
        withWorkspaceScope(`/api/projects/${String(betaProject.id)}?mode=delete`, betaWorkspace.id),
        { headers: API_KEY_HEADER },
      )
      .catch(() => undefined)
    await request
      .delete(`/api/workspaces/${String(alphaWorkspace.id)}`, { headers: API_KEY_HEADER })
      .catch(() => undefined)
    await request
      .delete(`/api/workspaces/${String(betaWorkspace.id)}`, { headers: API_KEY_HEADER })
      .catch(() => undefined)

    // Final pass: scrub any direct-DB rows the API didn't catch.
    resetSpec007Fixtures()
    restoreWorkspaceFlags()
  }

  return {
    alpha: {
      workspace: alphaWorkspace,
      project: alphaProject,
      agents: alphaAgents,
      tasks: alphaTasks,
      dispositions: alphaDispositions,
      artifacts: alphaArtifacts,
    },
    beta: {
      workspace: betaWorkspace,
      project: betaProject,
      agents: betaAgents,
      tasks: betaTasks,
      dispositions: betaDispositions,
      artifacts: betaArtifacts,
    },
    fixedNow: SPEC_007_FIXED_NOW,
    cleanup,
  }
  } catch (err) {
    resetSpec007Fixtures()
    restoreWorkspaceFlags()
    throw err
  }
}
