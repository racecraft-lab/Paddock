import Database from 'better-sqlite3'

export const LIFECYCLE_NOW = 1_779_500_000
export const LIFECYCLE_NOW_ISO = new Date(LIFECYCLE_NOW * 1000).toISOString()
export const DEFAULT_WORKSPACE_ID = 4
export const DEFAULT_REPO = 'racecraft-lab/Paddock'

export function createLifecycleTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE github_sync_lifecycle_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      max_pages INTEGER NOT NULL DEFAULT 10,
      max_issues INTEGER NOT NULL DEFAULT 1000,
      max_duration_seconds INTEGER NOT NULL DEFAULT 45,
      owner_project_id INTEGER,
      disabled_reason TEXT,
      next_retry_at INTEGER,
      next_retry_reason TEXT,
      backoff_seconds INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      lease_run_id TEXT,
      lease_owner TEXT,
      lease_started_at INTEGER,
      lease_expires_at INTEGER,
      last_started_at INTEGER,
      last_completed_at INTEGER,
      last_success_cursor TEXT,
      last_error TEXT,
      latest_partial_run_reason TEXT,
      total_successes INTEGER NOT NULL DEFAULT 0,
      total_failures INTEGER NOT NULL DEFAULT 0,
      total_partials INTEGER NOT NULL DEFAULT 0,
      total_overlap_rejections INTEGER NOT NULL DEFAULT 0,
      skipped_owner_count INTEGER NOT NULL DEFAULT 0,
      skipped_non_owner_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(workspace_id, github_repo)
    );

    CREATE TABLE github_sync_lifecycle_runs (
      run_id TEXT PRIMARY KEY,
      sync_id INTEGER,
      workspace_id INTEGER NOT NULL,
      github_repo TEXT NOT NULL,
      project_id INTEGER,
      trigger TEXT NOT NULL,
      requested_by TEXT,
      lease_owner TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
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
      diagnostics_json TEXT
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
  `)
  return db
}

export function lifecycleScope(overrides: Partial<{ workspace_id: number; github_repo: string }> = {}) {
  return {
    workspace_id: overrides.workspace_id ?? DEFAULT_WORKSPACE_ID,
    github_repo: overrides.github_repo ?? DEFAULT_REPO,
  }
}

export function seedLifecycleControl(
  db: Database.Database,
  overrides: Record<string, unknown> = {},
): void {
  const row = {
    workspace_id: DEFAULT_WORKSPACE_ID,
    github_repo: DEFAULT_REPO,
    enabled: 1,
    interval_seconds: 300,
    max_pages: 10,
    max_issues: 1000,
    max_duration_seconds: 45,
    created_at: LIFECYCLE_NOW,
    updated_at: LIFECYCLE_NOW,
    ...overrides,
  }
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, owner_project_id, disabled_reason, next_retry_at,
      next_retry_reason, backoff_seconds, consecutive_failures, lease_run_id,
      lease_owner, lease_started_at, lease_expires_at, last_started_at,
      last_completed_at, last_success_cursor, last_error, latest_partial_run_reason,
      total_successes, total_failures, total_partials, total_overlap_rejections,
      skipped_owner_count, skipped_non_owner_count, created_at, updated_at
    ) VALUES (
      @workspace_id, @github_repo, @enabled, @interval_seconds, @max_pages, @max_issues,
      @max_duration_seconds, @owner_project_id, @disabled_reason, @next_retry_at,
      @next_retry_reason, @backoff_seconds, @consecutive_failures, @lease_run_id,
      @lease_owner, @lease_started_at, @lease_expires_at, @last_started_at,
      @last_completed_at, @last_success_cursor, @last_error, @latest_partial_run_reason,
      @total_successes, @total_failures, @total_partials, @total_overlap_rejections,
      @skipped_owner_count, @skipped_non_owner_count, @created_at, @updated_at
    )
  `).run({
    owner_project_id: null,
    disabled_reason: null,
    next_retry_at: null,
    next_retry_reason: null,
    backoff_seconds: 0,
    consecutive_failures: 0,
    lease_run_id: null,
    lease_owner: null,
    lease_started_at: null,
    lease_expires_at: null,
    last_started_at: null,
    last_completed_at: null,
    last_success_cursor: null,
    last_error: null,
    latest_partial_run_reason: null,
    total_successes: 0,
    total_failures: 0,
    total_partials: 0,
    total_overlap_rejections: 0,
    skipped_owner_count: 0,
    skipped_non_owner_count: 0,
    ...row,
  })
}
