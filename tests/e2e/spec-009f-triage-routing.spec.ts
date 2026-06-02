import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import Database from 'better-sqlite3'
import {
  API_KEY_HEADER,
  dismissOnboardingForE2E,
  enableWorkspaceSwitcherFlagForE2E,
  loginAsE2EAdmin,
} from '../helpers'

const E2E_DB_PATH = process.env.PADDOCK_DB_PATH ??
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'paddock.db')
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'spec-009f-triage-routing')
const FIXTURE_MARKER = 'seeded by SPEC-009F triage routing e2e'
const FIXTURE_NOW = 1_779_500_000
const WORKSPACE_ID = 1
const ISSUE_TRIAGE_TEMPLATE_SLUG = 'paddock_issue_triage'
const OUTCOMES = [
  'NEEDS_SPEC',
  'NEEDS_HUMAN',
  'NEEDS_SPECIALIST',
  'DUPLICATE',
  'OBSOLETE',
  'INVALID',
] as const
const SPEC_009F_TRIAGE_OUTPUT_SCHEMA = JSON.stringify({
  type: 'object',
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
})

interface CreatedTask {
  id: number
  title: string
  outcome: typeof OUTCOMES[number]
  artifactId: number
  activityId: number
  issueNumber: number
  successorCount: number
}

const createdTasks: CreatedTask[] = []
const originalWorkspaceFlags = new Map<number, string | null>()
const workflowTemplateRestores = new Map<number, {
  id: number
  inserted: boolean
  output_schema: string | null
  routing_rules: string | null
  next_template_slug: string | null
  allow_redacted_artifacts: number | null
  created_by: string | null
}>()
let restoreWorkspaceSwitcher: (() => void) | null = null

function parseFlags(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function sqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

function checkpoint(db: Database.Database): void {
  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch {
    // The app server may hold a transient reader; committed rows are still visible.
  }
}

function enableSpec009fFlags(db: Database.Database, workspaceId: number): void {
  const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1').get(workspaceId) as {
    feature_flags: string | null
  } | undefined
  if (!row) return
  if (!originalWorkspaceFlags.has(workspaceId)) {
    originalWorkspaceFlags.set(workspaceId, row.feature_flags)
  }
  const flags = parseFlags(row.feature_flags)
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?').run(
    JSON.stringify({
      ...flags,
      FEATURE_TASK_PIPELINES: true,
      FEATURE_TASK_ARTIFACTS: true,
      FEATURE_DISPOSITION_LOGGING: true,
      PILOT_PADDOCK_E2E: true,
    }),
    workspaceId,
  )
}

function ensureIssueTriageTemplate(db: Database.Database, workspaceId: number): number {
  const existing = db.prepare(`
    SELECT id, output_schema, routing_rules, next_template_slug, allow_redacted_artifacts, created_by
    FROM workflow_templates
    WHERE workspace_id = ? AND slug = ?
    LIMIT 1
  `).get(workspaceId, ISSUE_TRIAGE_TEMPLATE_SLUG) as {
    id: number
    output_schema: string | null
    routing_rules: string | null
    next_template_slug: string | null
    allow_redacted_artifacts: number | null
    created_by: string | null
  } | undefined

  if (existing) {
    if (!workflowTemplateRestores.has(workspaceId)) {
      workflowTemplateRestores.set(workspaceId, { ...existing, inserted: existing.created_by === 'spec-009f-e2e' })
    }
    db.prepare(`
      UPDATE workflow_templates
      SET output_schema = ?,
          routing_rules = '[]',
          next_template_slug = NULL,
          allow_redacted_artifacts = 0,
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(SPEC_009F_TRIAGE_OUTPUT_SCHEMA, FIXTURE_NOW, existing.id, workspaceId)
    return existing.id
  }

  const info = db.prepare(`
    INSERT INTO workflow_templates (
      name, task_prompt, workspace_id, slug, agent_role, output_schema,
      routing_rules, next_template_slug, produces_pr, allow_redacted_artifacts,
      enabled, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'qa-specialist', ?, '[]', NULL, 0, 0, 1, 'spec-009f-e2e', ?, ?)
  `).run(
    'SPEC-009F Issue Triage',
    'Classify the issue without mutating GitHub.',
    workspaceId,
    ISSUE_TRIAGE_TEMPLATE_SLUG,
    SPEC_009F_TRIAGE_OUTPUT_SCHEMA,
    FIXTURE_NOW,
    FIXTURE_NOW,
  )
  const templateId = Number(info.lastInsertRowid)
  workflowTemplateRestores.set(workspaceId, {
    id: templateId,
    inserted: true,
    output_schema: null,
    routing_rules: null,
    next_template_slug: null,
    allow_redacted_artifacts: null,
    created_by: 'spec-009f-e2e',
  })
  return templateId
}

function restoreWorkflowTemplates(db: Database.Database): void {
  for (const [workspaceId, original] of workflowTemplateRestores.entries()) {
    if (original.inserted) {
      db.prepare('DELETE FROM workflow_templates WHERE id = ? AND workspace_id = ?').run(original.id, workspaceId)
    } else {
      db.prepare(`
        UPDATE workflow_templates
        SET output_schema = ?,
            routing_rules = ?,
            next_template_slug = ?,
            allow_redacted_artifacts = ?,
            updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(
        original.output_schema,
        original.routing_rules,
        original.next_template_slug,
        original.allow_redacted_artifacts,
        FIXTURE_NOW,
        original.id,
        workspaceId,
      )
    }
  }
  workflowTemplateRestores.clear()
}

function restoreWorkspaceState(): void {
  if (originalWorkspaceFlags.size === 0 && workflowTemplateRestores.size === 0) return
  const db = new Database(E2E_DB_PATH)
  try {
    const restore = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    for (const [workspaceId, flags] of originalWorkspaceFlags.entries()) {
      restore.run(flags, workspaceId)
    }
    restoreWorkflowTemplates(db)
    checkpoint(db)
  } finally {
    db.close()
  }
  originalWorkspaceFlags.clear()
}

async function createFixtureTask(page: Page, outcome: typeof OUTCOMES[number], index: number): Promise<CreatedTask> {
  const title = `SPEC-009F ${outcome} routing fixture`
  const response = await page.request.post(`/api/tasks?workspace_id=${String(WORKSPACE_ID)}`, {
    headers: API_KEY_HEADER,
    data: {
      title,
      description: `${title} ${FIXTURE_MARKER}`,
      priority: 'medium',
      status: 'review',
    },
  })
  const body = await response.json().catch(() => ({})) as { task?: { id?: number; title?: string } }
  expect(response.status(), JSON.stringify(body)).toBe(201)
  if (!body.task?.id || !body.task.title) {
    throw new Error(`SPEC-009F e2e task create failed: ${JSON.stringify(body)}`)
  }
  const seeded = await seedRoutingRows(page, body.task.id, body.task.title, outcome, index)
  createdTasks.push(seeded)
  return seeded
}

async function seedRoutingRows(
  page: Page,
  taskId: number,
  title: string,
  outcome: typeof OUTCOMES[number],
  index: number,
): Promise<CreatedTask> {
  const rationale = `SPEC-009F e2e ${outcome} local fixture. No live GitHub mutation.`
  const db = new Database(E2E_DB_PATH)
  try {
    const row = db.prepare('SELECT workspace_id FROM tasks WHERE id = ? LIMIT 1').get(taskId) as {
      workspace_id: number
    } | undefined
    if (!row) throw new Error(`SPEC-009F e2e task not found after create: ${String(taskId)}`)
    enableSpec009fFlags(db, row.workspace_id)
    const templateId = ensureIssueTriageTemplate(db, row.workspace_id)
    const issueNumber = 1_090 + index
    db.prepare(`
      UPDATE tasks
      SET github_repo = 'racecraft-lab/Paddock',
          github_issue_number = ?,
          github_pr_number = NULL,
          github_synced_at = ?,
          workflow_template_id = ?,
          workflow_template_slug = ?,
          chain_stage = 'issue_triage',
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      issueNumber,
      FIXTURE_NOW + index,
      templateId,
      ISSUE_TRIAGE_TEMPLATE_SLUG,
      FIXTURE_NOW + index,
      taskId,
      row.workspace_id,
    )
    db.prepare(`
      INSERT INTO quality_reviews (task_id, reviewer, status, notes, workspace_id, created_at)
      VALUES (?, 'aegis', 'approved', 'SPEC-009F local UAT fixture approval', ?, ?)
    `).run(taskId, row.workspace_id, FIXTURE_NOW + index)
    checkpoint(db)
  } finally {
    db.close()
  }

  const updateResponse = await page.request.put(`/api/tasks/${String(taskId)}?workspace_id=${String(WORKSPACE_ID)}`, {
    headers: API_KEY_HEADER,
    data: {
      status: 'done',
      resolution: JSON.stringify({ disposition: outcome, rationale }),
    },
  })
  const updateBody = await updateResponse.json().catch(() => ({})) as Record<string, unknown>
  expect(updateResponse.status(), JSON.stringify(updateBody)).toBe(200)

  const verificationDb = new Database(E2E_DB_PATH)
  try {
    const artifact = verificationDb.prepare(`
      SELECT id
      FROM task_artifacts
      WHERE task_id = ?
        AND workspace_id = ?
        AND schema_version = 'spec-009f.triage_routing.v1'
      ORDER BY id DESC
      LIMIT 1
    `).get(taskId, WORKSPACE_ID) as { id: number } | undefined
    const activity = verificationDb.prepare(`
      SELECT id
      FROM activities
      WHERE entity_id = ?
        AND workspace_id = ?
        AND type = 'triage_routing_recorded'
      ORDER BY id DESC
      LIMIT 1
    `).get(taskId, WORKSPACE_ID) as { id: number } | undefined
    if (!artifact || !activity) {
      throw new Error(`SPEC-009F e2e route failed for ${outcome}: ${JSON.stringify({ artifact, activity })}`)
    }
    const successorCount = (verificationDb
      .prepare('SELECT COUNT(*) AS count FROM tasks WHERE parent_task_id = ? OR root_task_id = ?')
      .get(taskId, taskId) as { count: number }).count
    checkpoint(verificationDb)
    return {
      id: taskId,
      title,
      outcome,
      artifactId: artifact.id,
      activityId: activity.id,
      issueNumber: 1_090 + index,
      successorCount,
    }
  } finally {
    verificationDb.close()
  }
}

function cleanupDirectRows(): void {
  const db = new Database(E2E_DB_PATH)
  try {
    const markerRows = db.prepare(`
      SELECT id
      FROM tasks
      WHERE workspace_id = ?
        AND description LIKE ?
    `).all(WORKSPACE_ID, `%${FIXTURE_MARKER}%`) as { id: number }[]
    const taskIds = Array.from(new Set([
      ...createdTasks.map((task) => task.id),
      ...markerRows.map((task) => task.id),
    ]))
    if (taskIds.length === 0) return
    const placeholders = sqlPlaceholders(taskIds)
    db.prepare(`DELETE FROM activities WHERE entity_type = 'task' AND entity_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM task_artifacts WHERE task_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM task_dispositions WHERE task_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM quality_reviews WHERE task_id IN (${placeholders})`).run(...taskIds)
    db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...taskIds)
    checkpoint(db)
  } finally {
    db.close()
  }
}

async function openTaskEvidence(page: Page, title: string) {
  const card = page.getByRole('button', { name: new RegExp(title, 'i') }).first()
  await expect(card).toBeVisible()
  await card.click()
  const region = page.getByRole('region', { name: /task evidence/i })
  await expect(region).toBeVisible()
  await expect(region.getByText('Triage routing')).toBeVisible()
  return region
}

async function closeTaskDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: /close/i }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function attachEvidenceScreenshot(
  region: Awaited<ReturnType<typeof openTaskEvidence>>,
  testInfo: TestInfo,
  task: CreatedTask,
): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const fileName = `spec-009f-${task.outcome.toLowerCase().replaceAll('_', '-')}.png`
  const filePath = path.join(OUTPUT_DIR, fileName)
  await writeFile(filePath, await region.screenshot())
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })
  return filePath
}

async function attachFixtureExport(testInfo: TestInfo, screenshotPaths: Record<string, string>): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, 'spec-009f-triage-routing-fixture-export.json')
  const payload = {
    schema_version: 'spec-009f.e2e-export.v1',
    generated_at: new Date().toISOString(),
    no_live_side_effects: true,
    route_source: 'local SQLite fixture rows plus /api/tasks status update through advanceTaskChain',
    outcomes: createdTasks.map((task) => ({
      outcome: task.outcome,
      task_id: task.id,
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: task.issueNumber,
      artifact_id: task.artifactId,
      activity_id: task.activityId,
      successor_count: task.successorCount,
      screenshot_path: screenshotPaths[task.outcome],
    })),
    cleanup_scope: 'afterAll removes activities, task artifacts, dispositions, disposable tasks, and restores workspace feature flags',
  }
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
  await testInfo.attach('spec-009f-triage-routing-fixture-export', {
    path: filePath,
    contentType: 'application/json',
  })
}

test.describe.serial('SPEC-009F triage routing task Evidence', () => {
  test.beforeAll(() => {
    cleanupDirectRows()
  })

  test.beforeEach(async ({ page, request }) => {
    await page.context().addInitScript(() => {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    })
    const cookieHeader = await loginAsE2EAdmin(page, request)
    await dismissOnboardingForE2E(request, cookieHeader)
    restoreWorkspaceSwitcher ??= await enableWorkspaceSwitcherFlagForE2E(request)
  })

  test.afterAll(async ({ request }) => {
    cleanupDirectRows()
    for (const task of [...createdTasks].reverse()) {
      await request.delete(`/api/tasks/${String(task.id)}?workspace_id=${String(WORKSPACE_ID)}`, { headers: API_KEY_HEADER }).catch(() => undefined)
    }
    restoreWorkspaceState()
    restoreWorkspaceSwitcher?.()
    restoreWorkspaceSwitcher = null
  })

  test('shows six routed outcomes in read-only task Evidence with review artifacts', async ({ page }, testInfo) => {
    const screenshotPaths: Record<string, string> = {}
    for (const [index, outcome] of OUTCOMES.entries()) {
      await createFixtureTask(page, outcome, index)
    }

    await page.goto(`/tasks?workspace_id=${String(WORKSPACE_ID)}`)
    await expect(page.getByRole('region', { name: /^Task Board$/i })).toBeVisible()

    for (const task of createdTasks) {
      const region = await openTaskEvidence(page, task.title)
      await expect(region.getByText('Routing recorded')).toBeVisible()
      await expect(region.getByText(task.outcome).first()).toBeVisible()
      await expect(region.getByText(/Deferred side effects/i)).toBeVisible()
      await expect(region.getByText(/applied: false/i).first()).toBeVisible()
      await expect(region.locator('button, form, [role="menu"]')).toHaveCount(0)

      const links = await region.getByRole('link').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href))
      expect(links.every((href) => href.startsWith('https://github.com/racecraft-lab/Paddock/'))).toBe(true)
      expect(links.some((href) => /^javascript:|^data:/i.test(href))).toBe(false)
      expect(task.successorCount).toBe(0)

      screenshotPaths[task.outcome] = await attachEvidenceScreenshot(region, testInfo, task)
      await closeTaskDetail(page)
    }

    await attachFixtureExport(testInfo, screenshotPaths)
  })
})
