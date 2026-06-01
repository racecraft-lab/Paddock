#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const dbPath = process.env.MISSION_CONTROL_DB_PATH
if (!dbPath) {
  console.error('MISSION_CONTROL_DB_PATH is required')
  process.exit(1)
}

const outputPath = process.env.MC_SPEC_013D_FIXTURE_FILE ||
  path.join(path.dirname(dbPath), 'spec-013d-fixture.json')
const adminUser = process.env.AUTH_USER || 'testadmin'
const marker = 'seeded by SPEC-013D claim control db e2e'
const stageKey = 'assigned_dispatch'
const now = 1_790_000_000
const scenarios = ['retry', 'release', 'cancel', 'stale', 'viewer', 'flagOff', 'backoff']

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
}

function parseFlags(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function checkpoint(db) {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    db.pragma('wal_checkpoint(PASSIVE)')
  }
}

function scenarioTicketPrefix(scenario) {
  return `S13D${scenario.slice(0, 3).toUpperCase()}`
}

const db = new Database(dbPath)

try {
  const workspace = db.prepare(`
    SELECT id, tenant_id, feature_flags
    FROM workspaces
    WHERE LOWER(TRIM(slug)) <> 'facility'
      AND LOWER(TRIM(name)) <> 'facility'
    ORDER BY id ASC
    LIMIT 1
  `).get()
  if (!workspace?.id || !workspace.tenant_id) {
    throw new Error(`No product-line workspace found in ${dbPath}`)
  }

  const user = db.prepare(`
    SELECT id, workspace_id
    FROM users
    WHERE username = ?
    LIMIT 1
  `).get(adminUser)
  if (!user?.id) {
    throw new Error(`No E2E admin user found for ${adminUser}`)
  }

  const originalSessions = tableExists(db, 'user_sessions')
    ? db.prepare(`
        SELECT id, workspace_id, tenant_id
        FROM user_sessions
        WHERE user_id = ?
        ORDER BY id ASC
      `).all(user.id)
    : []

  const flags = parseFlags(workspace.feature_flags)
  db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
    .run(JSON.stringify({
      ...flags,
      FEATURE_WORKSPACE_SWITCHER: true,
      FEATURE_TASK_CONTROL_PLANE: true,
    }), workspace.id)
  db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(workspace.id, user.id)
  if (tableExists(db, 'user_sessions')) {
    db.prepare('UPDATE user_sessions SET workspace_id = ?, tenant_id = ? WHERE user_id = ?')
      .run(workspace.id, workspace.tenant_id, user.id)
  }

  const scenarioRows = scenarios.map((scenario) => {
    const stamp = `${String(Date.now())}-${scenario}`
    const title = `SPEC-013D Claim Control DB Fixture ${scenario} ${stamp}`
    const githubRepo = `racecraft-lab/spec-013d-${stamp}`
    const projectId = Number(db.prepare(`
      INSERT INTO projects (
        workspace_id, name, slug, ticket_prefix, ticket_counter, github_repo,
        github_sync_enabled, is_repo_sync_owner, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, 1, 1, 'active', ?, ?)
    `).run(
      workspace.id,
      `SPEC-013D Fixture ${stamp}`,
      `spec-013d-fixture-${stamp}`,
      scenarioTicketPrefix(scenario),
      githubRepo,
      now,
      now,
    ).lastInsertRowid)

    const taskId = Number(db.prepare(`
      INSERT INTO tasks (
        title, description, status, priority, assigned_to, created_by,
        created_at, updated_at, tags, metadata, workspace_id, project_id,
        project_ticket_no, github_repo, github_issue_number, github_synced_at,
        workflow_template_slug
      ) VALUES (?, ?, 'assigned', 'high', 'spec-013d-operator', 'SPEC-013D',
        ?, ?, '[]', '{}', ?, ?, 1, ?, 72, ?, ?)
    `).run(
      title,
      `${title} ${marker}`,
      now,
      now,
      workspace.id,
      projectId,
      githubRepo,
      now,
      stageKey,
    ).lastInsertRowid)

    const backoffActive = scenario === 'backoff'
    const lifecycleControlId = tableExists(db, 'github_sync_lifecycle_controls')
      ? Number(db.prepare(`
          INSERT INTO github_sync_lifecycle_controls (
            workspace_id, github_repo, enabled, interval_seconds, owner_project_id,
            next_retry_at, next_retry_reason, backoff_seconds,
            last_completed_at, total_successes, updated_at
          ) VALUES (?, ?, 1, 300, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          workspace.id,
          githubRepo,
          projectId,
          backoffActive ? now + 180 : null,
          backoffActive ? 'retry backoff active' : null,
          backoffActive ? 180 : 0,
          now,
          now,
        ).lastInsertRowid)
      : 0

    const attemptStatus = backoffActive ? 'failed' : 'running'
    const attemptId = Number(db.prepare(`
      INSERT INTO task_stage_attempts (
        workspace_id, task_id, stage_key, attempt_number, status,
        created_at, updated_at, started_at, completed_at, archived_at,
        run_id, workflow_template_id, workflow_template_slug, metadata_json
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)
    `).run(
      workspace.id,
      taskId,
      stageKey,
      attemptStatus,
      '2026-05-30T17:00:00.000Z',
      '2026-05-30T17:00:00.000Z',
      '2026-05-30T17:00:00.000Z',
      'spec-013d-db-run',
      stageKey,
      JSON.stringify({ fixture: marker }),
    ).lastInsertRowid)

    if (tableExists(db, 'task_stage_attempt_events')) {
      db.prepare(`
        INSERT INTO task_stage_attempt_events (
          attempt_id, workspace_id, task_id, stage_key, attempt_number,
          status, observed_at, actor_type, actor_id, message, metadata_json
        ) VALUES (?, ?, ?, ?, 1, ?, ?, 'test', 'spec-013d-e2e', ?, ?)
      `).run(
        attemptId,
        workspace.id,
        taskId,
        stageKey,
        attemptStatus,
        '2026-05-30T17:00:00.000Z',
        `SPEC-013D claim-control DB fixture ${attemptStatus} attempt`,
        JSON.stringify({ fixture: marker }),
      )
    }

    const claimId = backoffActive
      ? null
      : Number(db.prepare(`
          INSERT INTO task_stage_claims (
            workspace_id, task_id, stage_key, task_stage_attempt_id, claim_state,
            lease_owner, claim_run_id, lease_started_at, lease_expires_at,
            release_reason, released_at, released_by_run_id, stale_recovered_from_claim_id,
            metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
        `).run(
          workspace.id,
          taskId,
          stageKey,
          attemptId,
          'spec-013d-operator',
          'spec-013d-db-run',
          now,
          now + 3600,
          JSON.stringify({ fixture: marker }),
          now,
          now,
        ).lastInsertRowid)

    return {
      scenario,
      task: {
        id: taskId,
        title,
        workspaceId: workspace.id,
        tenantId: workspace.tenant_id,
        projectId,
        githubRepo,
      },
      seeded: {
        taskId,
        workspaceId: workspace.id,
        projectId,
        attemptId,
        claimId,
        lifecycleControlId,
        originalFeatureFlags: workspace.feature_flags ?? null,
      },
    }
  })

  const fixture = {
    scenarios: scenarioRows,
    authBaseline: {
      userId: user.id,
      originalUserWorkspaceId: user.workspace_id ?? null,
      originalSessions: originalSessions.map((session) => ({
        id: session.id,
        workspaceId: session.workspace_id ?? null,
        tenantId: session.tenant_id ?? null,
      })),
    },
  }

  checkpoint(db)
  fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
  console.log(`[e2e-docker] seeded ${scenarioRows.length} SPEC-013D claim-control fixture tasks in workspace ${workspace.id}`)
} finally {
  db.close()
}
