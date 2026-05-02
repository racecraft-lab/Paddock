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
// Seed helpers.
// ---------------------------------------------------------------------------

function withWorkspaceScope(pathname: string, workspaceId: number): string {
  const separator = pathname.includes('?') ? '&' : '?'
  return `${pathname}${separator}workspace_id=${encodeURIComponent(String(workspaceId))}`
}

function columnsFor(db: Database.Database, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set()
  return new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map((row) => (row as { name: string }).name),
  )
}

function insertRow(
  db: Database.Database,
  table: string,
  values: Record<string, unknown>,
): number {
  const columns = columnsFor(db, table)
  const entries = Object.entries(values).filter(([column]) => columns.has(column))
  if (entries.length === 0) throw new Error(`No insertable columns found for ${table}`)
  const names = entries.map(([column]) => column)
  const marks = names.map(() => '?').join(', ')
  const info = db.prepare(`
    INSERT INTO ${table} (${names.join(', ')})
    VALUES (${marks})
  `).run(...entries.map(([, value]) => value))
  return Number(info.lastInsertRowid)
}

function slugifySeed(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function createWorkspace(
  db: Database.Database,
  name: string,
  slug: string,
): SeededWorkspace {
  const id = insertRow(db, 'workspaces', {
    name,
    slug,
    tenant_id: 1,
    feature_flags: JSON.stringify({
      FEATURE_WORKSPACE_SWITCHER: true,
      FEATURE_DISPOSITION_LOGGING: true,
      FEATURE_TASK_ARTIFACTS: true,
    }),
    created_at: SPEC_007_FIXED_NOW_SECONDS,
    updated_at: SPEC_007_FIXED_NOW_SECONDS,
  })
  return { id, name, slug }
}

function createProject(
  db: Database.Database,
  workspaceId: number,
  name: string,
  ticketPrefix: string,
): { id: number; name: string } {
  const id = insertRow(db, 'projects', {
    workspace_id: workspaceId,
    name,
    slug: slugifySeed(name),
    ticket_prefix: ticketPrefix,
    ticket_counter: 2,
    status: 'active',
    created_at: SPEC_007_FIXED_NOW_SECONDS,
    updated_at: SPEC_007_FIXED_NOW_SECONDS,
  })
  return { id, name }
}

function createAgent(
  db: Database.Database,
  workspaceId: number,
  name: string,
): SeededAgent {
  const id = insertRow(db, 'agents', {
    name,
    role: 'tester',
    status: 'offline',
    created_at: SPEC_007_FIXED_NOW_SECONDS,
    updated_at: SPEC_007_FIXED_NOW_SECONDS,
    config: JSON.stringify({ e2e_fixture: 'spec-007' }),
    workspace_id: workspaceId,
  })
  return { id, name, workspaceId }
}

function createTask(
  db: Database.Database,
  workspaceId: number,
  projectId: number,
  title: string,
  assignedTo: string,
  ticketNo: number,
): SeededTask {
  const id = insertRow(db, 'tasks', {
    title,
    description: `${title} seeded by SPEC-007 e2e fixture`,
    priority: 'medium',
    status: 'inbox',
    project_id: projectId,
    project_ticket_no: ticketNo,
    assigned_to: assignedTo,
    created_by: 'e2e',
    workspace_id: workspaceId,
    tags: JSON.stringify(['spec-007']),
    metadata: JSON.stringify({ e2e_fixture: 'spec-007' }),
    created_at: SPEC_007_FIXED_NOW_SECONDS,
    updated_at: SPEC_007_FIXED_NOW_SECONDS,
  })
  return { id, workspaceId }
}

function readOne<T>(
  db: Database.Database,
  sql: string,
  params: readonly unknown[],
  label: string,
): T {
  const row = db.prepare(sql).get(...params) as T | undefined
  if (!row) throw new Error(`Missing SPEC-007 preseeded fixture row: ${label}`)
  return row
}

function readPreseededSpec007Fixture(): Spec007E2EFixture {
  const db = new Database(getE2EDbPath())
  try {
    const alphaWorkspace = readOne<SeededWorkspace>(
      db,
      'SELECT id, name, slug FROM workspaces WHERE slug = ?',
      [SPEC_007_FIXTURE.alphaWorkspace.slug],
      SPEC_007_FIXTURE.alphaWorkspace.slug,
    )
    const betaWorkspace = readOne<SeededWorkspace>(
      db,
      'SELECT id, name, slug FROM workspaces WHERE slug = ?',
      [SPEC_007_FIXTURE.betaWorkspace.slug],
      SPEC_007_FIXTURE.betaWorkspace.slug,
    )
    const alphaProject = readOne<{ id: number; name: string }>(
      db,
      'SELECT id, name FROM projects WHERE workspace_id = ? AND name = ?',
      [alphaWorkspace.id, SPEC_007_FIXTURE.alphaProject.name],
      SPEC_007_FIXTURE.alphaProject.name,
    )
    const betaProject = readOne<{ id: number; name: string }>(
      db,
      'SELECT id, name FROM projects WHERE workspace_id = ? AND name = ?',
      [betaWorkspace.id, SPEC_007_FIXTURE.betaProject.name],
      SPEC_007_FIXTURE.betaProject.name,
    )
    const alphaAgents = db
      .prepare(`
        SELECT id, name, workspace_id AS workspaceId
        FROM agents
        WHERE workspace_id = ? AND name IN (?, ?)
        ORDER BY id ASC
      `)
      .all(
        alphaWorkspace.id,
        SPEC_007_FIXTURE.agents[0],
        SPEC_007_FIXTURE.agents[1],
      ) as SeededAgent[]
    const betaAgents = db
      .prepare(`
        SELECT id, name, workspace_id AS workspaceId
        FROM agents
        WHERE workspace_id = ? AND name IN (?, ?)
        ORDER BY id ASC
      `)
      .all(
        betaWorkspace.id,
        SPEC_007_FIXTURE.agents[2],
        SPEC_007_FIXTURE.agents[3],
      ) as SeededAgent[]
    const alphaTasks = db
      .prepare(`
        SELECT id, workspace_id AS workspaceId
        FROM tasks
        WHERE workspace_id = ? AND title LIKE 'SPEC-007 Alpha task %'
        ORDER BY id ASC
      `)
      .all(alphaWorkspace.id) as SeededTask[]
    const betaTasks = db
      .prepare(`
        SELECT id, workspace_id AS workspaceId
        FROM tasks
        WHERE workspace_id = ? AND title LIKE 'SPEC-007 Beta task %'
        ORDER BY id ASC
      `)
      .all(betaWorkspace.id) as SeededTask[]
    if (alphaAgents.length !== 2 || betaAgents.length !== 2) {
      throw new Error('Missing SPEC-007 preseeded agents')
    }
    if (alphaTasks.length !== 2 || betaTasks.length !== 2) {
      throw new Error('Missing SPEC-007 preseeded tasks')
    }

    const readDispositions = (workspaceId: number) => db
      .prepare(`
        SELECT id, workspace_id, task_id, disposition, triaged_at,
               triaged_by_agent_id, reason
        FROM task_dispositions
        WHERE workspace_id = ?
        ORDER BY id ASC
      `)
      .all(workspaceId) as SeededDisposition[]
    const readArtifacts = (workspaceId: number) => db
      .prepare(`
        SELECT id, workspace_id, task_id, redaction_status,
               security_scan_status, storage_kind, byte_size, sha256
        FROM task_artifacts
        WHERE workspace_id = ?
        ORDER BY id ASC
      `)
      .all(workspaceId) as SeededArtifact[]

    return {
      alpha: {
        workspace: alphaWorkspace,
        project: alphaProject,
        agents: alphaAgents,
        tasks: alphaTasks,
        dispositions: readDispositions(alphaWorkspace.id),
        artifacts: readArtifacts(alphaWorkspace.id),
      },
      beta: {
        workspace: betaWorkspace,
        project: betaProject,
        agents: betaAgents,
        tasks: betaTasks,
        dispositions: readDispositions(betaWorkspace.id),
        artifacts: readArtifacts(betaWorkspace.id),
      },
      fixedNow: SPEC_007_FIXED_NOW,
      cleanup: async () => undefined,
    }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Direct-DB inserts for dispositions + artifacts. These tables are app-level
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
  if (process.env.MC_SPEC_007_PRESEEDED === '1') {
    return readPreseededSpec007Fixture()
  }

  // 1) Idempotent reset.
  resetSpec007Fixtures()
  const restoreWorkspaceFlags = enableSpec007WorkspaceFlags()
  try {
    return await seedUnpreseededSpec007E2E(request, restoreWorkspaceFlags)
  } catch (err) {
    resetSpec007Fixtures()
    restoreWorkspaceFlags()
    throw err
  }
}

async function seedUnpreseededSpec007E2E(
  request: APIRequestContext,
  restoreWorkspaceFlags: () => void,
): Promise<Spec007E2EFixture> {
  const dbPath = getE2EDbPath()
  const db = new Database(dbPath)
  db.pragma('busy_timeout = 5000')

  let alphaWorkspace: SeededWorkspace | null = null
  let betaWorkspace: SeededWorkspace | null = null
  let alphaProject: { id: number; name: string } | null = null
  let betaProject: { id: number; name: string } | null = null
  let alphaAgents: SeededAgent[] = []
  let betaAgents: SeededAgent[] = []
  const alphaTasks: SeededTask[] = []
  const betaTasks: SeededTask[] = []
  let alphaDispositions: SeededDisposition[] = []
  let betaDispositions: SeededDisposition[] = []
  let alphaArtifacts: SeededArtifact[] = []
  let betaArtifacts: SeededArtifact[] = []

  try {
    // 2) Build the two product-line workspaces, projects, agents, and parent
    // tasks directly in the same mounted DB connection used for artifact and
    // disposition rows. Docker e2e runs the app in a container while Playwright
    // runs on the host; keeping the whole SPEC-007 fixture on one host-side
    // connection avoids SQLite WAL visibility gaps between API writes and
    // direct high-volume inserts.
    alphaWorkspace = createWorkspace(
      db,
      SPEC_007_FIXTURE.alphaWorkspace.name,
      SPEC_007_FIXTURE.alphaWorkspace.slug,
    )
    betaWorkspace = createWorkspace(
      db,
      SPEC_007_FIXTURE.betaWorkspace.name,
      SPEC_007_FIXTURE.betaWorkspace.slug,
    )

    alphaProject = createProject(
      db,
      alphaWorkspace.id,
      SPEC_007_FIXTURE.alphaProject.name,
      SPEC_007_FIXTURE.alphaProject.ticketPrefix,
    )
    betaProject = createProject(
      db,
      betaWorkspace.id,
      SPEC_007_FIXTURE.betaProject.name,
      SPEC_007_FIXTURE.betaProject.ticketPrefix,
    )

    alphaAgents = [
      createAgent(db, alphaWorkspace.id, SPEC_007_FIXTURE.agents[0]),
      createAgent(db, alphaWorkspace.id, SPEC_007_FIXTURE.agents[1]),
    ]
    betaAgents = [
      createAgent(db, betaWorkspace.id, SPEC_007_FIXTURE.agents[2]),
      createAgent(db, betaWorkspace.id, SPEC_007_FIXTURE.agents[3]),
    ]

    // Two tasks per workspace as triage parents.
    for (let i = 0; i < 2; i++) {
      alphaTasks.push(
        createTask(
          db,
          alphaWorkspace.id,
          alphaProject.id,
          `SPEC-007 Alpha task ${String(i)}`,
          alphaAgents[i % alphaAgents.length]!.name,
          i + 1,
        ),
      )
    }
    for (let i = 0; i < 2; i++) {
      betaTasks.push(
        createTask(
          db,
          betaWorkspace.id,
          betaProject.id,
          `SPEC-007 Beta task ${String(i)}`,
          betaAgents[i % betaAgents.length]!.name,
          i + 1,
        ),
      )
    }

    // 3) Direct DB inserts for dispositions + artifacts.
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

  if (!alphaWorkspace || !betaWorkspace || !alphaProject || !betaProject) {
    throw new Error('SPEC-007 seed did not initialize all required fixture records')
  }
  const seededAlphaWorkspace = alphaWorkspace
  const seededBetaWorkspace = betaWorkspace
  const seededAlphaProject = alphaProject
  const seededBetaProject = betaProject

  const cleanup = async (): Promise<void> => {
    // Best-effort API cleanup, followed by direct DB cleanup for rows created
    // by the host-side seed connection.
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
        withWorkspaceScope(
          `/api/projects/${String(seededAlphaProject.id)}?mode=delete`,
          seededAlphaWorkspace.id,
        ),
        { headers: API_KEY_HEADER },
      )
      .catch(() => undefined)
    await request
      .delete(
        withWorkspaceScope(
          `/api/projects/${String(seededBetaProject.id)}?mode=delete`,
          seededBetaWorkspace.id,
        ),
        { headers: API_KEY_HEADER },
      )
      .catch(() => undefined)
    await request
      .delete(`/api/workspaces/${String(seededAlphaWorkspace.id)}`, { headers: API_KEY_HEADER })
      .catch(() => undefined)
    await request
      .delete(`/api/workspaces/${String(seededBetaWorkspace.id)}`, { headers: API_KEY_HEADER })
      .catch(() => undefined)

    // Final pass: scrub any direct-DB rows the API didn't catch.
    resetSpec007Fixtures()
    restoreWorkspaceFlags()
  }

  return {
    alpha: {
      workspace: seededAlphaWorkspace,
      project: seededAlphaProject,
      agents: alphaAgents,
      tasks: alphaTasks,
      dispositions: alphaDispositions,
      artifacts: alphaArtifacts,
    },
    beta: {
      workspace: seededBetaWorkspace,
      project: seededBetaProject,
      agents: betaAgents,
      tasks: betaTasks,
      dispositions: betaDispositions,
      artifacts: betaArtifacts,
    },
    fixedNow: SPEC_007_FIXED_NOW,
    cleanup,
  }
}
