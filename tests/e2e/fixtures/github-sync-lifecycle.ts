import path from 'node:path'
import Database from 'better-sqlite3'

const E2E_DB_PATH = process.env['MISSION_CONTROL_DB_PATH'] ??
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')

export interface GitHubSyncLifecycleE2EState {
  workspaceId?: number
  githubRepo?: string
  projectId?: number
  enabled?: boolean
  intervalSeconds?: number
  lastStartedAt?: string | null
  lastCompletedAt?: string | null
  lastSuccessCursor?: string | null
  lastError?: string | null
  latestPartialRunReason?: string | null
  totalSuccesses?: number
  totalFailures?: number
  totalPartials?: number
  skippedOwnerCount?: number
  skippedNonOwnerCount?: number
  runId?: string
  result?: 'succeeded' | 'failed' | 'partial' | 'skipped_overlap' | 'rejected_overlap'
}

export function seedGitHubSyncLifecycleForE2E(state: GitHubSyncLifecycleE2EState = {}) {
  const db = new Database(E2E_DB_PATH)
  try {
    ensureTables(db)
    const now = new Date().toISOString()
    const workspaceId = state.workspaceId ?? 1
    const githubRepo = state.githubRepo ?? 'racecraft-lab/Paddock'
    const projectId = state.projectId ?? 1
    const runId = state.runId ?? 'e2e-github-sync-lifecycle-run'

    db.transaction(() => {
      db.prepare(
        `
          DELETE FROM github_sync_lifecycle_runs
          WHERE workspace_id = ? AND github_repo = ?
        `,
      ).run(workspaceId, githubRepo)
      db.prepare(
        `
          DELETE FROM github_sync_lifecycle_controls
          WHERE workspace_id = ? AND github_repo = ?
        `,
      ).run(workspaceId, githubRepo)

      db.prepare(
        `
          INSERT INTO github_sync_lifecycle_controls (
            workspace_id,
            github_repo,
            enabled,
            interval_seconds,
            owner_project_id,
            last_started_at,
            last_completed_at,
            last_success_cursor,
            last_error,
            latest_partial_run_reason,
            total_successes,
            total_failures,
            total_partials,
            skipped_owner_count,
            skipped_non_owner_count,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        workspaceId,
        githubRepo,
        state.enabled === false ? 0 : 1,
        state.intervalSeconds ?? 300,
        projectId,
        state.lastStartedAt ?? now,
        state.lastCompletedAt ?? now,
        state.lastSuccessCursor ?? now,
        state.lastError ?? null,
        state.latestPartialRunReason ?? null,
        state.totalSuccesses ?? 1,
        state.totalFailures ?? 0,
        state.totalPartials ?? 0,
        state.skippedOwnerCount ?? 0,
        state.skippedNonOwnerCount ?? 0,
        now,
        now,
      )

      db.prepare(
        `
          INSERT INTO github_sync_lifecycle_runs (
            run_id,
            workspace_id,
            github_repo,
            project_id,
            trigger,
            started_at,
            completed_at,
            result,
            cursor_after,
            cursor_advanced,
            diagnostics_json
          ) VALUES (?, ?, ?, ?, 'automatic', ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        runId,
        workspaceId,
        githubRepo,
        projectId,
        state.lastStartedAt ?? now,
        state.lastCompletedAt ?? now,
        state.result ?? 'succeeded',
        state.lastSuccessCursor ?? now,
        state.result === 'succeeded' ? 1 : 0,
        JSON.stringify({ source: 'e2e' }),
      )
    })()
    db.pragma('wal_checkpoint(PASSIVE)')
  } finally {
    db.close()
  }
}

function ensureTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_sync_lifecycle_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      owner_project_id INTEGER,
      disabled_reason TEXT,
      next_retry_at TEXT,
      next_retry_reason TEXT,
      backoff_seconds INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      lease_run_id TEXT,
      lease_owner TEXT,
      lease_started_at TEXT,
      lease_expires_at TEXT,
      last_started_at TEXT,
      last_completed_at TEXT,
      last_success_cursor TEXT,
      last_error TEXT,
      latest_partial_run_reason TEXT,
      total_successes INTEGER NOT NULL DEFAULT 0,
      total_failures INTEGER NOT NULL DEFAULT 0,
      total_partials INTEGER NOT NULL DEFAULT 0,
      total_overlap_rejections INTEGER NOT NULL DEFAULT 0,
      skipped_owner_count INTEGER NOT NULL DEFAULT 0,
      skipped_non_owner_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, github_repo)
    );
    CREATE TABLE IF NOT EXISTS github_sync_lifecycle_runs (
      run_id TEXT PRIMARY KEY,
      sync_id INTEGER,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      project_id INTEGER,
      trigger TEXT NOT NULL,
      requested_by TEXT,
      lease_owner TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      result TEXT NOT NULL,
      failure_reason TEXT,
      partial_run_reason TEXT,
      cursor_before TEXT,
      cursor_after TEXT,
      cursor_advanced INTEGER NOT NULL DEFAULT 0,
      pages_fetched INTEGER NOT NULL DEFAULT 0,
      issues_seen INTEGER NOT NULL DEFAULT 0,
      issues_pulled INTEGER NOT NULL DEFAULT 0,
      issues_pushed INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      stale_recovered_from_run_id TEXT,
      diagnostics_json TEXT NOT NULL DEFAULT '{}'
    );
  `)
}
