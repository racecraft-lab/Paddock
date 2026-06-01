import { expect, test, type Page, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  loginAsE2EAdmin,
} from '../helpers'

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ||
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')
const EVIDENCE_OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'spec-009e-task-evidence')
const SPEC_009E_MARKER = 'seeded by SPEC-009E task evidence e2e'
const EVIDENCE_TITLES = {
  eligible: 'SPEC-009E Evidence - Retained Pilot Trail',
  localOnly: 'SPEC-009E Evidence - Local Only',
  partial: 'SPEC-009E Evidence - Partial Proof',
} as const
const FIXTURE_NOW = 1_779_300_000

interface CreatedTask {
  id: number
  title: string
}

interface TaskRow {
  id: number
  workspace_id: number
}

const insertedArtifactIds: number[] = []
const insertedActivityIds: number[] = []
const insertedReviewIds: number[] = []
const insertedGovernanceIds: number[] = []
const insertedSyncIds: number[] = []
const originalWorkspaceFlags = new Map<number, string | null>()

function sqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function checkpoint(db: Database.Database): void {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // The app server may hold a transient reader; committed rows are still visible.
  }
}

function parseFlags(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function enableTaskArtifactsFlag(db: Database.Database, workspaceId: number): void {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(workspaceId) as {
    feature_flags: string | null
  } | undefined
  if (!row) return
  if (!originalWorkspaceFlags.has(workspaceId)) {
    originalWorkspaceFlags.set(workspaceId, row.feature_flags)
  }
  const flags = parseFlags(row.feature_flags)
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    .run(JSON.stringify({ ...flags, FEATURE_TASK_ARTIFACTS: true }), workspaceId)
}

function restoreWorkspaceFlags(): void {
  if (originalWorkspaceFlags.size === 0) return
  const db = new Database(E2E_DB_PATH)
  try {
    const restore = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    for (const [workspaceId, flags] of originalWorkspaceFlags.entries()) {
      restore.run(flags, workspaceId)
    }
    checkpoint(db)
  } finally {
    db.close()
  }
  originalWorkspaceFlags.clear()
}

function seedEvidenceRows(tasks: Record<keyof typeof EVIDENCE_TITLES, CreatedTask>): void {
  const db = new Database(E2E_DB_PATH)
  try {
    const taskRows = db.prepare(`
      SELECT id, workspace_id FROM tasks
      WHERE id IN (?, ?, ?)
    `).all(tasks.eligible.id, tasks.localOnly.id, tasks.partial.id) as TaskRow[]
    const workspaceByTask = new Map(taskRows.map((row) => [row.id, row.workspace_id]))
    const eligibleWorkspace = workspaceByTask.get(tasks.eligible.id)
    const localWorkspace = workspaceByTask.get(tasks.localOnly.id)
    const partialWorkspace = workspaceByTask.get(tasks.partial.id)
    if (!eligibleWorkspace || !localWorkspace || !partialWorkspace) {
      throw new Error(`SPEC-009E e2e task workspace lookup failed: ${JSON.stringify(taskRows)}`)
    }

    enableTaskArtifactsFlag(db, eligibleWorkspace)
    enableTaskArtifactsFlag(db, localWorkspace)
    enableTaskArtifactsFlag(db, partialWorkspace)

    db.prepare(`
      UPDATE tasks
      SET status = 'ready_for_owner',
          github_repo = 'racecraft-lab/Paddock',
          github_issue_number = 50,
          github_pr_number = 51,
          github_synced_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(FIXTURE_NOW, FIXTURE_NOW, tasks.eligible.id)
    db.prepare(`
      UPDATE tasks
      SET status = 'review',
          github_repo = 'racecraft-lab/Paddock',
          github_issue_number = 52,
          github_pr_number = NULL,
          github_synced_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(FIXTURE_NOW, FIXTURE_NOW, tasks.partial.id)

    insertedArtifactIds.push(Number(db.prepare(`
      INSERT INTO task_artifacts (
        task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
        byte_size, sha256, preview_text, redaction_status, security_scan_status, created_at
      )
      VALUES (?, ?, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
        512, ?, 'SPEC-009D packet references smoke checklist proof.', 'clean', 'scanned_clean', ?)
    `).run(tasks.eligible.id, eligibleWorkspace, 'a'.repeat(64), FIXTURE_NOW + 10).lastInsertRowid))
    insertedArtifactIds.push(Number(db.prepare(`
      INSERT INTO task_artifacts (
        task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
        byte_size, sha256, preview_text, redaction_status, security_scan_status, created_at
      )
      VALUES (?, ?, 'pilot_review_packet_markdown', 'spec-009d.packet.v1', 'inline_markdown', 'text/markdown',
        256, ?, 'Packet markdown export with inert [unsafe](javascript:alert(1)) text.', 'redacted', 'scanned_clean', ?)
    `).run(tasks.eligible.id, eligibleWorkspace, 'b'.repeat(64), FIXTURE_NOW + 11).lastInsertRowid))
    insertedArtifactIds.push(Number(db.prepare(`
      INSERT INTO task_artifacts (
        task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
        byte_size, sha256, preview_text, redaction_status, security_scan_status, created_at
      )
      VALUES (?, ?, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
        131072, ?, 'Oversized packet metadata only.', 'clean', 'scanned_clean', ?)
    `).run(tasks.partial.id, partialWorkspace, 'c'.repeat(64), FIXTURE_NOW + 12).lastInsertRowid))
    insertedArtifactIds.push(Number(db.prepare(`
      INSERT INTO task_artifacts (
        task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
        byte_size, sha256, preview_text, redaction_status, security_scan_status, supersedes_artifact_id, created_at
      )
      VALUES (?, ?, 'review_verdict', 'spec-009c3.v1', 'inline_json', 'application/json',
        128, ?, 'Quarantined preview must not render.', 'quarantined', 'scanned_with_findings', NULL, ?)
    `).run(tasks.partial.id, partialWorkspace, 'd'.repeat(64), FIXTURE_NOW + 13).lastInsertRowid))

    insertedActivityIds.push(Number(db.prepare(`
      INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
      VALUES ('task_ready_for_owner', 'task', ?, 'mission-control', 'Ready for owner after retained pilot smoke', ?, ?, ?)
    `).run(tasks.eligible.id, JSON.stringify({ smoke_checklist: true, github_pr_number: 51 }), eligibleWorkspace, FIXTURE_NOW + 20).lastInsertRowid))

    if (tableExists(db, 'quality_reviews')) {
      insertedReviewIds.push(Number(db.prepare(`
        INSERT INTO quality_reviews (task_id, workspace_id, reviewer, status, notes, created_at)
        VALUES (?, ?, 'aegis', 'approved', 'Aegis approved retained pilot evidence.', ?)
      `).run(tasks.eligible.id, eligibleWorkspace, FIXTURE_NOW + 30).lastInsertRowid))
    }

    if (tableExists(db, 'resource_policy_events') && columnExists(db, 'resource_policy_events', 'workspace_id')) {
      insertedGovernanceIds.push(Number(db.prepare(`
        INSERT INTO resource_policy_events (task_id, workspace_id, decision, reason, details_json, created_at)
        VALUES (?, ?, 'allow', 'Within pilot budget', '{"source":"spec-009e-e2e"}', ?)
      `).run(tasks.eligible.id, eligibleWorkspace, FIXTURE_NOW + 40).lastInsertRowid))
    } else if (tableExists(db, 'resource_policy_events') && columnExists(db, 'resource_policy_events', 'metadata')) {
      insertedGovernanceIds.push(Number(db.prepare(`
        INSERT INTO resource_policy_events (task_id, decision, reason, metadata, created_at)
        VALUES (?, 'allow', 'Within pilot budget', '{"source":"spec-009e-e2e"}', ?)
      `).run(tasks.eligible.id, FIXTURE_NOW + 40).lastInsertRowid))
    } else if (tableExists(db, 'resource_policy_events') && columnExists(db, 'resource_policy_events', 'details_json')) {
      insertedGovernanceIds.push(Number(db.prepare(`
        INSERT INTO resource_policy_events (task_id, decision, reason, details_json, created_at)
        VALUES (?, 'allow', 'Within pilot budget', '{"source":"spec-009e-e2e"}', ?)
      `).run(tasks.eligible.id, FIXTURE_NOW + 40).lastInsertRowid))
    }

    if (tableExists(db, 'github_syncs')) {
      insertedSyncIds.push(Number(db.prepare(`
        INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, workspace_id, created_at)
        VALUES ('racecraft-lab/Paddock', ?, 1, 'inbound', 'success', ?, ?)
      `).run(FIXTURE_NOW + 50, eligibleWorkspace, FIXTURE_NOW + 50).lastInsertRowid))
    }

    checkpoint(db)
  } finally {
    db.close()
  }
}

function cleanupDirectRows(): void {
  const db = new Database(E2E_DB_PATH)
  try {
    if (insertedArtifactIds.length > 0 && tableExists(db, 'task_artifacts')) {
      db.prepare(`DELETE FROM task_artifacts WHERE id IN (${sqlPlaceholders(insertedArtifactIds)})`)
        .run(...insertedArtifactIds)
      insertedArtifactIds.length = 0
    }
    if (insertedActivityIds.length > 0 && tableExists(db, 'activities')) {
      db.prepare(`DELETE FROM activities WHERE id IN (${sqlPlaceholders(insertedActivityIds)})`)
        .run(...insertedActivityIds)
      insertedActivityIds.length = 0
    }
    if (insertedReviewIds.length > 0 && tableExists(db, 'quality_reviews')) {
      db.prepare(`DELETE FROM quality_reviews WHERE id IN (${sqlPlaceholders(insertedReviewIds)})`)
        .run(...insertedReviewIds)
      insertedReviewIds.length = 0
    }
    if (insertedGovernanceIds.length > 0 && tableExists(db, 'resource_policy_events')) {
      db.prepare(`DELETE FROM resource_policy_events WHERE id IN (${sqlPlaceholders(insertedGovernanceIds)})`)
        .run(...insertedGovernanceIds)
      insertedGovernanceIds.length = 0
    }
    if (insertedSyncIds.length > 0 && tableExists(db, 'github_syncs')) {
      db.prepare(`DELETE FROM github_syncs WHERE id IN (${sqlPlaceholders(insertedSyncIds)})`)
        .run(...insertedSyncIds)
      insertedSyncIds.length = 0
    }
    checkpoint(db)
  } finally {
    db.close()
  }
}

function cleanupDisposableTasks(tasks: readonly CreatedTask[]): void {
  if (tasks.length === 0) return
  const taskIds = tasks.map((task) => task.id)
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare(`DELETE FROM tasks WHERE id IN (${sqlPlaceholders(taskIds)})`)
      .run(...taskIds)
    checkpoint(db)
  } finally {
    db.close()
  }
}

async function createEvidenceTask(page: Page, title: string): Promise<CreatedTask> {
  const response = await page.request.post('/api/tasks', {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} ${SPEC_009E_MARKER}`,
      priority: 'medium',
      status: 'review',
    },
  })
  const body = await response.json().catch(() => ({})) as { task?: { id?: number; title?: string } }
  expect(response.status(), JSON.stringify(body)).toBe(201)
  if (!body.task?.id || !body.task.title) {
    throw new Error(`SPEC-009E e2e task create failed: ${JSON.stringify(body)}`)
  }
  return { id: body.task.id, title: body.task.title }
}

async function openTaskEvidence(page: Page, title: string) {
  const card = page.getByRole('button', { name: new RegExp(title, 'i') }).first()
  await expect(card).toBeVisible()
  await card.click()
  const region = page.getByRole('region', { name: /task evidence/i })
  await expect(region).toBeVisible()
  await expect(region.getByRole('status', { name: /loading evidence/i })).toHaveCount(0)
  return region
}

async function closeTaskDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: /close/i }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function attachEvidenceScreenshot(region: Awaited<ReturnType<typeof openTaskEvidence>>, testInfo: TestInfo, name: string): Promise<void> {
  await mkdir(EVIDENCE_OUTPUT_DIR, { recursive: true })
  const filePath = path.join(EVIDENCE_OUTPUT_DIR, `${name}.png`)
  const body = await region.screenshot()
  await writeFile(filePath, body)
  await testInfo.attach(name, {
    path: filePath,
    contentType: 'image/png',
  })
}

async function attachFixtureExport(tasks: Record<keyof typeof EVIDENCE_TITLES, CreatedTask>, testInfo: TestInfo): Promise<void> {
  await mkdir(EVIDENCE_OUTPUT_DIR, { recursive: true })
  const filePath = path.join(EVIDENCE_OUTPUT_DIR, 'spec-009e-evidence-fixture-export.json')
  const payload = {
    schema_version: 'spec-009e.e2e-export.v1',
    generated_at: new Date().toISOString(),
    retained_github_evidence: {
      repository: 'racecraft-lab/Paddock',
      issue: 50,
      pull_request: 51,
    },
    disposable_tasks: tasks,
    inserted_rows: {
      task_artifacts: insertedArtifactIds,
      activities: insertedActivityIds,
      quality_reviews: insertedReviewIds,
      resource_policy_events: insertedGovernanceIds,
      github_syncs: insertedSyncIds,
    },
    cleanup_scope: 'afterAll deletes inserted evidence rows, deletes disposable tasks through /api/tasks/[id], and restores workspace feature flags',
  }
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
  await testInfo.attach('spec-009e-evidence-fixture-export', {
    path: filePath,
    contentType: 'application/json',
  })
}

test.describe.serial('SPEC-009E task detail evidence', () => {
  const createdTasks: CreatedTask[] = []

  test.beforeEach(async ({ page, request }) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
  })

  test.afterAll(async ({ request }) => {
    cleanupDirectRows()
    for (const task of [...createdTasks].reverse()) {
      await request.delete(`/api/tasks/${String(task.id)}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    cleanupDisposableTasks(createdTasks)
    restoreWorkspaceFlags()
  })

  test('shows retained pilot, local-only, partial-proof, and deferred evidence states without action controls', async ({ page }, testInfo) => {
    const eligible = await createEvidenceTask(page, EVIDENCE_TITLES.eligible)
    const localOnly = await createEvidenceTask(page, EVIDENCE_TITLES.localOnly)
    const partial = await createEvidenceTask(page, EVIDENCE_TITLES.partial)
    createdTasks.push(eligible, localOnly, partial)
    seedEvidenceRows({ eligible, localOnly, partial })
    await attachFixtureExport({ eligible, localOnly, partial }, testInfo)

    await page.goto('/tasks')
    await expect(page.getByRole('region', { name: /^Task Board$/i })).toBeVisible()

    const eligibleEvidence = await openTaskEvidence(page, eligible.title)
    await expect(eligibleEvidence.getByText('eligible')).toBeVisible()
    await expect(eligibleEvidence.getByText('ready_for_owner')).toBeVisible()
    await expect(eligibleEvidence.getByRole('link', { name: /racecraft-lab\/Paddock#50/i }))
      .toHaveAttribute('href', 'https://github.com/racecraft-lab/Paddock/issues/50')
    await expect(eligibleEvidence.getByRole('link', { name: /PR #51/i }))
      .toHaveAttribute('href', 'https://github.com/racecraft-lab/Paddock/pull/51')
    await expect(eligibleEvidence.getByText(/pilot review packet json/i).first()).toBeVisible()
    await expect(eligibleEvidence.getByText(/docs\/qa\/pilot-smoke-checklist\.md#spec-009e/i).first()).toBeVisible()
    await expect(eligibleEvidence.locator('span').filter({ hasText: /^deferred$/ })).toHaveCount(7)
    await expect(eligibleEvidence.getByRole('button', { name: /refresh|generate|sync|retry|claim|sandbox|harness/i })).toHaveCount(0)
    await attachEvidenceScreenshot(eligibleEvidence, testInfo, 'spec-009e-evidence-eligible')
    await closeTaskDetail(page)

    const localEvidence = await openTaskEvidence(page, localOnly.title)
    await expect(localEvidence.getByText('not_eligible')).toBeVisible()
    await expect(localEvidence.getByText('missing_github_repo').first()).toBeVisible()
    await expect(localEvidence.getByText('missing_github_issue_number').first()).toBeVisible()
    await attachEvidenceScreenshot(localEvidence, testInfo, 'spec-009e-evidence-local-only')
    await closeTaskDetail(page)

    const partialEvidence = await openTaskEvidence(page, partial.title)
    await expect(partialEvidence.getByText('incomplete')).toBeVisible()
    await expect(partialEvidence.getByText('missing_github_pr_number').first()).toBeVisible()
    await expect(partialEvidence.getByText('oversized').first()).toBeVisible()
    await expect(partialEvidence.getByText('unsafe').first()).toBeVisible()
    await expect(partialEvidence.getByText('quarantined').first()).toBeVisible()
    await attachEvidenceScreenshot(partialEvidence, testInfo, 'spec-009e-evidence-partial-proof')
  })
})
