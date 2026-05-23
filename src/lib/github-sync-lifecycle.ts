import { assertSafeLifecyclePayload } from './github-sync-lifecycle-api'
import {
  type LifecycleBackoffReason,
  type LifecycleClassifiedFailure,
  type LifecycleControlStatus,
  type LifecycleFailureCategory,
  type LifecycleHealthSummary,
  type LifecycleRetryPlan,
  type LifecycleRetrySignalSource,
  type LifecycleRunResult,
  type LifecycleScope,
  type LifecycleScopeStatus,
  type LifecycleTrigger,
} from './github-sync-lifecycle-types'
import type Database from 'better-sqlite3'


interface ControlRow {
  workspace_id: number
  github_repo: string
  enabled: number
  interval_seconds: number
  max_pages: number
  max_issues: number
  max_duration_seconds: number
  owner_project_id: number | null
  disabled_reason: string | null
  next_retry_at: number | null
  next_retry_reason: string | null
  backoff_seconds: number
  consecutive_failures: number
  lease_run_id: string | null
  lease_owner: string | null
  lease_started_at: number | null
  lease_expires_at: number | null
  last_started_at: number | null
  last_completed_at: number | null
  last_success_cursor: string | null
  last_error: string | null
  latest_partial_run_reason: string | null
  total_successes: number
  total_failures: number
  total_partials: number
  total_overlap_rejections: number
  skipped_owner_count: number
  skipped_non_owner_count: number
  updated_at: number
}

interface RunRow {
  run_id: string
  workspace_id: number
  github_repo: string
  project_id: number | null
  trigger: LifecycleTrigger
  lease_owner: string | null
  started_at: number
  completed_at: number | null
  result: LifecycleRunResult
  failure_reason: LifecycleFailureCategory | null
  partial_run_reason: string | null
  cursor_before: string | null
  cursor_after: string | null
  cursor_advanced: number
  issues_pulled: number
  issues_pushed: number
  diagnostics_json: string | null
}

const NETWORK_CODES = new Set(['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT'])

function toIso(epochSeconds: number | null): string | null {
  return epochSeconds === null ? null : new Date(epochSeconds * 1000).toISOString()
}

function readControl(db: Database.Database, scope: LifecycleScope): ControlRow | undefined {
  return db.prepare(`
    SELECT *
    FROM github_sync_lifecycle_controls
    WHERE workspace_id = ? AND github_repo = ?
  `).get(scope.workspace_id, scope.github_repo) as ControlRow | undefined
}

function emitActivity(
  db: Database.Database,
  type: string,
  scope: LifecycleScope,
  data: Record<string, unknown>,
  now: number,
): void {
  assertSafeLifecyclePayload(data)
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES (?, 'github_sync_lifecycle', ?, 'github-sync-lifecycle', ?, ?, ?, ?)
  `).run(
    type,
    scope.workspace_id,
    type.replaceAll('_', ' '),
    JSON.stringify(data),
    scope.workspace_id,
    now,
  )
}

function manualAwareActivityType(result: Exclude<LifecycleRunResult, 'running'>, trigger: LifecycleTrigger): string {
  if (trigger === 'manual' && result === 'success') return 'github_sync_manual_fallback_completed'
  if (trigger === 'manual' && result === 'failed') return 'github_sync_manual_fallback_failed'
  if (result === 'success') return 'github_sync_run_succeeded'
  if (result === 'partial') return 'github_sync_partial_bounded_stop'
  return 'github_sync_run_failed'
}

export function upsertLifecycleControl(
  db: Database.Database,
  input: LifecycleScope & {
    enabled: boolean
    interval_seconds: number
    max_pages: number
    max_issues: number
    max_duration_seconds: number
    owner_project_id?: number | null
    disabled_reason?: string | null
    now: number
  },
): LifecycleControlStatus {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_controls (
      workspace_id, github_repo, enabled, interval_seconds, max_pages, max_issues,
      max_duration_seconds, owner_project_id, disabled_reason, next_retry_at,
      backoff_seconds, consecutive_failures, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ON CONFLICT(workspace_id, github_repo) DO UPDATE SET
      enabled = excluded.enabled,
      interval_seconds = excluded.interval_seconds,
      max_pages = excluded.max_pages,
      max_issues = excluded.max_issues,
      max_duration_seconds = excluded.max_duration_seconds,
      owner_project_id = excluded.owner_project_id,
      disabled_reason = excluded.disabled_reason,
      next_retry_at = excluded.next_retry_at,
      updated_at = excluded.updated_at
  `).run(
    input.workspace_id,
    input.github_repo,
    input.enabled ? 1 : 0,
    input.interval_seconds,
    input.max_pages,
    input.max_issues,
    input.max_duration_seconds,
    input.owner_project_id ?? null,
    input.enabled ? null : (input.disabled_reason ?? 'operator_disabled'),
    input.enabled ? input.now + input.interval_seconds : null,
    input.now,
    input.now,
  )

  emitActivity(
    db,
    input.enabled ? 'github_sync_automation_enabled' : 'github_sync_automation_disabled',
    input,
    {
      workspace_id: input.workspace_id,
      github_repo: input.github_repo,
      result: input.enabled ? 'enabled' : 'disabled',
    },
    input.now,
  )

  const row = readControl(db, input)
  if (!row) throw new Error('failed to read lifecycle control after upsert')
  return {
    workspace_id: row.workspace_id,
    github_repo: row.github_repo,
    enabled: row.enabled === 1,
    interval_seconds: row.interval_seconds,
    max_pages: row.max_pages,
    max_issues: row.max_issues,
    max_duration_seconds: row.max_duration_seconds,
    owner_project_id: row.owner_project_id,
    disabled_reason: row.disabled_reason,
    next_eligible_at: toIso(row.next_retry_at),
  }
}

export function acquireLifecycleLease(
  db: Database.Database,
  input: LifecycleScope & {
    run_id: string
    lease_owner: string
    now: number
    max_duration_seconds: number
  },
):
  | { acquired: true; lease_expires_at: number; stale_recovered_from_run_id?: string }
  | { acquired: false; conflict: { run_id: string; lease_owner: string | null; retry_after_seconds: number } } {
  const ttl = Math.min(600, Math.max(120, input.max_duration_seconds * 2))
  const leaseExpiresAt = input.now + ttl
  const control = readControl(db, input)
  if (!control) throw new Error('lifecycle control not found')

  if (control.lease_run_id && control.lease_expires_at && control.lease_expires_at > input.now) {
    return {
      acquired: false,
      conflict: {
        run_id: control.lease_run_id,
        lease_owner: control.lease_owner,
        retry_after_seconds: Math.max(0, control.lease_expires_at - input.now),
      },
    }
  }

  const staleRunId = control.lease_run_id ?? undefined
  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET lease_run_id = ?, lease_owner = ?, lease_started_at = ?, lease_expires_at = ?,
        last_started_at = ?, updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(
    input.run_id,
    input.lease_owner,
    input.now,
    leaseExpiresAt,
    input.now,
    input.now,
    input.workspace_id,
    input.github_repo,
  )

  if (staleRunId) {
    emitActivity(
      db,
      'github_sync_stale_recovered',
      input,
      {
        workspace_id: input.workspace_id,
        github_repo: input.github_repo,
        run_id: input.run_id,
        lease_expires_at: toIso(leaseExpiresAt),
      },
      input.now,
    )
  }

  const acquired: { acquired: true; lease_expires_at: number } = {
    acquired: true,
    lease_expires_at: leaseExpiresAt,
  }
  if (staleRunId) return { ...acquired, stale_recovered_from_run_id: staleRunId }
  return acquired
}

export function releaseLifecycleLease(
  db: Database.Database,
  input: LifecycleScope & { run_id: string; now: number },
): boolean {
  const result = db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET lease_run_id = NULL, lease_owner = NULL, lease_started_at = NULL, lease_expires_at = NULL,
        updated_at = ?
    WHERE workspace_id = ? AND github_repo = ? AND lease_run_id = ?
  `).run(input.now, input.workspace_id, input.github_repo, input.run_id)
  return result.changes > 0
}

export function recordLifecycleRunStarted(
  db: Database.Database,
  input: LifecycleScope & {
    run_id: string
    trigger: LifecycleTrigger
    lease_owner?: string | null
    project_id?: number | null
    cursor_before?: string | null
    now: number
  },
): void {
  db.prepare(`
    INSERT INTO github_sync_lifecycle_runs (
      run_id, workspace_id, github_repo, project_id, trigger, lease_owner, started_at,
      result, cursor_before, cursor_after, diagnostics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
  `).run(
    input.run_id,
    input.workspace_id,
    input.github_repo,
    input.project_id ?? null,
    input.trigger,
    input.lease_owner ?? null,
    input.now,
    input.cursor_before ?? null,
    input.cursor_before ?? null,
    JSON.stringify({ cursor_effect: 'unchanged' }),
  )
  emitActivity(
    db,
    'github_sync_run_started',
    input,
    {
      workspace_id: input.workspace_id,
      github_repo: input.github_repo,
      run_id: input.run_id,
      trigger: input.trigger,
      result: 'running',
    },
    input.now,
  )
}

export function completeLifecycleRun(
  db: Database.Database,
  input: {
    run_id: string
    result: Exclude<LifecycleRunResult, 'running'>
    failure_reason?: LifecycleFailureCategory | null
    failure_message?: string | null
    partial_run_reason?: string | null
    cursor_after?: string | null
    backoff_seconds?: number
    next_retry_at?: number | null
    next_retry_reason?: LifecycleBackoffReason
    retry_plan?: LifecycleRetryPlan
    failure_redaction_applied?: boolean
    now: number
  },
): void {
  const run = db.prepare(`
    SELECT *
    FROM github_sync_lifecycle_runs
    WHERE run_id = ?
  `).get(input.run_id) as RunRow | undefined
  if (!run) throw new Error('lifecycle run not found')

  const cursorAdvanced = input.result === 'success' && input.cursor_after != null && input.cursor_after !== run.cursor_before
  const sanitizedFailure = input.failure_message ? sanitizeLifecycleMessage(input.failure_message) : null
  const failureRedactionApplied = [
    sanitizedFailure?.redaction_applied,
    input.failure_redaction_applied,
  ].some((value) => value === true)
  const diagnostics = {
    failure: {
      category: input.failure_reason ?? null,
      sanitized_message: sanitizedFailure?.message ?? null,
      redaction_applied: failureRedactionApplied,
    },
    cursor_effect: cursorAdvanced ? 'advanced' : 'unchanged',
    retry: input.retry_plan ?? null,
  }

  db.prepare(`
    UPDATE github_sync_lifecycle_runs
    SET completed_at = ?, result = ?, failure_reason = ?, partial_run_reason = ?,
        cursor_after = ?, cursor_advanced = ?, diagnostics_json = ?
    WHERE run_id = ?
  `).run(
    input.now,
    input.result,
    input.failure_reason ?? null,
    input.partial_run_reason ?? null,
    input.cursor_after ?? run.cursor_before,
    cursorAdvanced ? 1 : 0,
    JSON.stringify(diagnostics),
    input.run_id,
  )

  const successIncrements = input.result === 'success' ? 'total_successes = total_successes + 1, consecutive_failures = 0,' : ''
  const failureIncrements = input.result === 'failed' ? 'total_failures = total_failures + 1, consecutive_failures = consecutive_failures + 1,' : ''
  const partialIncrements = input.result === 'partial' ? 'total_partials = total_partials + 1,' : ''
  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET
      ${successIncrements}
      ${failureIncrements}
      ${partialIncrements}
      lease_run_id = NULL,
      lease_owner = NULL,
      lease_started_at = NULL,
      lease_expires_at = NULL,
      last_completed_at = ?,
      last_success_cursor = CASE WHEN ? = 1 THEN ? ELSE last_success_cursor END,
      last_error = ?,
      latest_partial_run_reason = ?,
      backoff_seconds = ?,
      next_retry_at = ?,
      next_retry_reason = ?,
      updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(
    input.now,
    cursorAdvanced ? 1 : 0,
    input.cursor_after ?? null,
    sanitizedFailure?.message ?? null,
    input.partial_run_reason ?? null,
    input.backoff_seconds ?? 0,
    input.next_retry_at ?? null,
    input.retry_plan?.reason ?? input.next_retry_reason ?? (input.backoff_seconds ? 'exponential_backoff' : null),
    input.now,
    run.workspace_id,
    run.github_repo,
  )

  const activityType = manualAwareActivityType(input.result, run.trigger)
  emitActivity(
    db,
    activityType,
    run,
    {
      workspace_id: run.workspace_id,
      github_repo: run.github_repo,
      run_id: input.run_id,
      trigger: run.trigger,
      result: input.result,
      cursor_advanced: cursorAdvanced,
      failure_category: input.failure_reason ?? undefined,
      partial_run_reason: input.partial_run_reason ?? undefined,
      backoff_seconds: input.backoff_seconds ?? undefined,
      next_retry_at: input.next_retry_at ? toIso(input.next_retry_at) : undefined,
    },
    input.now,
  )
}

type OverlapLifecycleInput = LifecycleScope & {
  run_id: string
  trigger: LifecycleTrigger
  project_id?: number | null
  cursor_before?: string | null
  conflicting_run_id: string
  retry_after_seconds: number
  lease_expires_at: number
  now: number
}

function recordLifecycleOverlap(
  db: Database.Database,
  input: OverlapLifecycleInput,
  result: 'rejected_overlap' | 'skipped_overlap',
  activityType: 'github_sync_rejected_overlap' | 'github_sync_skipped_overlap',
): void {
  const cursor = input.cursor_before ?? null
  const leaseExpiresAt = toIso(input.lease_expires_at)
  db.prepare(`
    INSERT INTO github_sync_lifecycle_runs (
      run_id, workspace_id, github_repo, project_id, trigger, started_at, completed_at,
      result, cursor_before, cursor_after, cursor_advanced, diagnostics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    input.run_id,
    input.workspace_id,
    input.github_repo,
    input.project_id ?? null,
    input.trigger,
    input.now,
    input.now,
    result,
    cursor,
    cursor,
    JSON.stringify({
      cursor_effect: 'unchanged',
      overlap: {
        conflicting_run_id: input.conflicting_run_id,
        retry_after_seconds: input.retry_after_seconds,
        lease_expires_at: leaseExpiresAt,
      },
    }),
  )

  db.prepare(`
    UPDATE github_sync_lifecycle_controls
    SET total_overlap_rejections = total_overlap_rejections + 1,
        last_completed_at = ?,
        updated_at = ?
    WHERE workspace_id = ? AND github_repo = ?
  `).run(input.now, input.now, input.workspace_id, input.github_repo)

  const payload: Record<string, unknown> = {
    workspace_id: input.workspace_id,
    github_repo: input.github_repo,
    run_id: input.run_id,
    trigger: input.trigger,
    result,
    cursor_advanced: false,
    retry_after_seconds: input.retry_after_seconds,
    lease_expires_at: leaseExpiresAt,
  }
  if (input.project_id != null) payload['project_id'] = input.project_id
  emitActivity(db, activityType, input, payload, input.now)
}

export function recordLifecycleRejectedOverlap(db: Database.Database, input: OverlapLifecycleInput): void {
  recordLifecycleOverlap(db, input, 'rejected_overlap', 'github_sync_rejected_overlap')
}

export function recordLifecycleSkippedOverlap(db: Database.Database, input: OverlapLifecycleInput): void {
  recordLifecycleOverlap(db, input, 'skipped_overlap', 'github_sync_skipped_overlap')
}

export function getLifecycleStatusForScope(
  db: Database.Database,
  input: LifecycleScope & { now: number },
): LifecycleScopeStatus {
  const control = readControl(db, input)
  if (!control) throw new Error('lifecycle control not found')
  const lastRun = db.prepare(`
    SELECT *
    FROM github_sync_lifecycle_runs
    WHERE workspace_id = ? AND github_repo = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(input.workspace_id, input.github_repo) as RunRow | undefined
  const diagnostics = lastRun?.diagnostics_json ? JSON.parse(lastRun.diagnostics_json) as Record<string, unknown> : {}
  const failure = (diagnostics['failure'] ?? {}) as {
    category?: LifecycleFailureCategory | null
    sanitized_message?: string | null
    redaction_applied?: boolean
  }
  const retry = (diagnostics['retry'] ?? {}) as Partial<LifecycleRetryPlan>

  const status: LifecycleScopeStatus = {
    scope: {
      workspace_id: control.workspace_id,
      github_repo: control.github_repo,
      owner_project_id: control.owner_project_id,
    },
    controls: {
      enabled: control.enabled === 1,
      interval_seconds: control.interval_seconds,
      max_pages: control.max_pages,
      max_issues: control.max_issues,
      max_duration_seconds: control.max_duration_seconds,
      disabled_reason: control.disabled_reason,
      next_eligible_at: toIso(control.next_retry_at),
    },
    active_run: control.lease_run_id
      ? {
          run_id: control.lease_run_id,
          trigger: lastRun?.trigger ?? 'automatic',
          lease_owner: control.lease_owner,
          started_at: toIso(control.lease_started_at) ?? toIso(control.last_started_at) ?? new Date(0).toISOString(),
          lease_expires_at: toIso(control.lease_expires_at),
        }
      : null,
    last_run: lastRun
      ? {
          run_id: lastRun.run_id,
          trigger: lastRun.trigger,
          result: lastRun.result,
          started_at: toIso(lastRun.started_at) ?? new Date(0).toISOString(),
          completed_at: toIso(lastRun.completed_at),
          pulled: lastRun.issues_pulled,
          pushed: lastRun.issues_pushed,
          partial_run_reason: lastRun.partial_run_reason,
          failure_reason: lastRun.failure_reason,
          cursor_advanced: lastRun.cursor_advanced === 1,
        }
      : null,
    last_success_cursor: control.last_success_cursor,
    last_error: control.last_error,
    backoff: {
      seconds: control.backoff_seconds,
      next_retry_at: toIso(control.next_retry_at),
      reason: control.next_retry_reason as LifecycleBackoffReason,
      signal_source: retry.signal_source ?? retrySignalSource(control.next_retry_reason as LifecycleBackoffReason),
      cap_applied: retry.cap_applied ?? false,
      fallback_applied: retry.fallback_applied ?? control.next_retry_reason === 'exponential_backoff',
    },
    counters: {
      successes: control.total_successes,
      failures: control.total_failures,
      partials: control.total_partials,
      overlap_rejections: control.total_overlap_rejections,
    },
    skipped: {
      owner: control.skipped_owner_count,
      non_owner: control.skipped_non_owner_count,
    },
    diagnostics: {
      latest_partial_run_reason: control.latest_partial_run_reason,
      ownership: control.owner_project_id ? 'owner_selected' : null,
      lease: {
        age_seconds: control.lease_started_at ? input.now - control.lease_started_at : null,
        stale: Boolean(control.lease_expires_at && control.lease_expires_at <= input.now),
      },
      cursor_effect: typeof diagnostics['cursor_effect'] === 'string' ? diagnostics['cursor_effect'] : null,
      manual_fallback_available: true,
      failure: {
        category: failure.category ?? null,
        sanitized_message: failure.sanitized_message ?? null,
        redaction_applied: failure.redaction_applied ?? false,
      },
      health_summary: placeholderHealth(input.now),
    },
  }
  status.diagnostics.health_summary = deriveLifecycleHealthSummary(status)
  return status
}

function retrySignalSource(reason: LifecycleBackoffReason): LifecycleRetrySignalSource | null {
  if (reason === 'github_retry_after') return 'retry_after'
  if (reason === 'github_rate_limit_reset') return 'x_ratelimit_reset'
  if (reason === 'exponential_backoff') return 'exponential'
  return null
}

function placeholderHealth(now: number): LifecycleHealthSummary {
  return {
    severity: 'green',
    reason: 'last run succeeded',
    source_updated_at: toIso(now) ?? new Date(0).toISOString(),
    state_drivers: [],
    manual_fallback_available: true,
    runbook_links: [{ id: 'github_sync_lifecycle', href: '/docs/runbook/migration-rollback.md' }],
    recovery_affordances: [
      { id: 'manual_sync', endpoint: '/api/github/sync' },
      { id: 'reset_backoff', endpoint: '/api/github/sync/control' },
    ],
  }
}

export function deriveLifecycleHealthSummary(status: LifecycleScopeStatus): LifecycleHealthSummary {
  const sourceUpdatedAt = status.last_run?.completed_at ?? status.last_run?.started_at ?? new Date(0).toISOString()
  if (!status.controls.enabled) {
    return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'disabled', reason: 'lifecycle control disabled', source_updated_at: sourceUpdatedAt, state_drivers: ['control_disabled'] }
  }
  if (status.diagnostics.lease.stale) {
    return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'red', reason: 'stale lifecycle lease detected', source_updated_at: sourceUpdatedAt, state_drivers: ['stale_lease'] }
  }
  if (status.counters.failures >= 3) {
    return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'red', reason: 'repeated sync failures', source_updated_at: sourceUpdatedAt, state_drivers: ['repeated_failure'] }
  }
  if (status.last_run?.result === 'skipped_overlap' || status.last_run?.result === 'rejected_overlap') {
    return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'amber', reason: 'sync overlap blocked latest attempt', source_updated_at: sourceUpdatedAt, state_drivers: ['overlap_blocked'] }
  }
  if (status.backoff.seconds > 0 || status.last_run?.result === 'failed' || status.last_run?.result === 'partial') {
    return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'amber', reason: status.backoff.seconds > 0 ? 'backoff scheduled' : 'latest run needs attention', source_updated_at: sourceUpdatedAt, state_drivers: status.backoff.seconds > 0 ? ['active_backoff'] : ['latest_terminal_attention'] }
  }
  return { ...placeholderHealth(Date.parse(sourceUpdatedAt) / 1000), severity: 'green', reason: 'last run succeeded', source_updated_at: sourceUpdatedAt }
}

export function sanitizeLifecycleMessage(message: unknown): { message: string; redaction_applied: boolean } {
  let text = stringifyLifecycleScalar(message)
  const original = text
  text = text.replace(/\{[\s\S]*\}/g, '[redacted body]')
  text = text.replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted authorization]')
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer [redacted]')
  text = text.replace(/github_pat_[A-Za-z0-9_]+/gi, '[redacted]')
  text = text.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/gi, '[redacted]')
  text = text.replace(/sk-proj-[A-Za-z0-9_-]+/gi, '[redacted]')
  text = text.replace(/sk-[A-Za-z0-9_-]{20,}/gi, '[redacted]')
  text = text.replace(/api[_-]?key\s*=\s*[^ \n]+/gi, 'api_key=[redacted]')
  if (text.length > 240) text = `${text.slice(0, 237)}...`
  return {
    message: text,
    redaction_applied: text !== original,
  }
}

export function classifyGitHubSyncFailure(error: unknown): LifecycleClassifiedFailure {
  const record = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>
  const status = typeof record['status'] === 'number' ? record['status'] : null
  const headers = (record['headers'] && typeof record['headers'] === 'object' ? record['headers'] : {}) as Record<string, unknown>
  const code = typeof record['code'] === 'string' ? record['code'] : null
  const name = typeof record['name'] === 'string' ? record['name'] : null
  const kind = typeof record['kind'] === 'string' ? record['kind'] : null

  let category: LifecycleFailureCategory = 'unknown'
  if (name === 'AbortError' || code === 'ETIMEDOUT') category = 'transport_timeout'
  else if (code && NETWORK_CODES.has(code)) category = 'transport_network'
  else if (kind === 'malformed_json') category = 'github_malformed_json'
  else if (kind === 'unexpected_shape') category = 'github_unexpected_shape'
  else if (kind === 'issue_schema_invalid') category = 'github_issue_schema_invalid'
  else if (code?.startsWith('SQLITE_')) category = 'database_error'
  else if (status === 403 && headerValue(headers, 'x-ratelimit-remaining') === '0') category = 'github_rate_limited'
  else if (status === 401 || status === 403) category = 'github_auth_or_scope'
  else if (status === 404) category = 'github_not_found'
  else if (status !== null && status >= 400 && status < 500) category = 'github_http_4xx'
  else if (status !== null && status >= 500) category = 'github_http_5xx'

  const rawMessage =
    typeof record['message'] === 'string'
      ? record['message']
      : status !== null
        ? `GitHub API error ${String(status)}`
        : error instanceof Error
          ? error.message
          : 'Unknown GitHub sync failure'
  const sanitized = sanitizeLifecycleMessage(rawMessage)
  return {
    category,
    sanitized_message: sanitized.message,
    redaction_applied: sanitized.redaction_applied,
  }
}

function stringifyLifecycleScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString()
  return 'Unknown lifecycle failure'
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | null {
  if (!headers) return null
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  if (!found) return null
  if (typeof found[1] === 'string') return found[1]
  if (typeof found[1] === 'number' || typeof found[1] === 'boolean' || typeof found[1] === 'bigint') {
    return found[1].toString()
  }
  return null
}

function capRetry(seconds: number, max: number): { seconds: number; cap_applied: boolean } {
  return seconds > max ? { seconds: max, cap_applied: true } : { seconds, cap_applied: false }
}

export function computeLifecycleRetry(input: {
  now: number
  failure_count: number
  max_backoff_seconds: number
  headers?: Record<string, unknown>
}): LifecycleRetryPlan {
  const retryAfter = Number(headerValue(input.headers, 'retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    const capped = capRetry(Math.ceil(retryAfter), input.max_backoff_seconds)
    return {
      seconds: capped.seconds,
      next_retry_at: input.now + capped.seconds,
      reason: 'github_retry_after',
      signal_source: 'retry_after',
      cap_applied: capped.cap_applied,
      fallback_applied: false,
    }
  }

  const reset = Number(headerValue(input.headers, 'x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > input.now) {
    const capped = capRetry(Math.ceil(reset - input.now), input.max_backoff_seconds)
    return {
      seconds: capped.seconds,
      next_retry_at: input.now + capped.seconds,
      reason: 'github_rate_limit_reset',
      signal_source: 'x_ratelimit_reset',
      cap_applied: capped.cap_applied,
      fallback_applied: false,
    }
  }

  const exponential = Math.max(60, 60 * 2 ** Math.max(0, input.failure_count - 1))
  const capped = capRetry(exponential, input.max_backoff_seconds)
  return {
    seconds: capped.seconds,
    next_retry_at: input.now + capped.seconds,
    reason: 'exponential_backoff',
    signal_source: 'exponential',
    cap_applied: capped.cap_applied,
    fallback_applied: true,
  }
}

export type { LifecycleRetrySignalSource }
