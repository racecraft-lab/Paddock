export const GITHUB_SYNC_LIFECYCLE_VERSION = 'github_sync_lifecycle.v1' as const
export const GITHUB_SYNC_AUTOMATION_FLAG = 'FEATURE_GITHUB_SYNC_AUTOMATION' as const
export const GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION = '077_github_sync_lifecycle' as const

export type LifecycleTrigger = 'manual' | 'automatic'
export type LifecycleRunResult =
  | 'running'
  | 'success'
  | 'failed'
  | 'partial'
  | 'skipped_disabled'
  | 'skipped_overlap'
  | 'rejected_overlap'
  | 'skipped_non_owner'
  | 'skipped_owner'
  | 'ownership_unresolved'
  | 'stale_recovered'

export type LifecycleFailureCategory =
  | 'transport_timeout'
  | 'transport_network'
  | 'github_rate_limited'
  | 'github_auth_or_scope'
  | 'github_not_found'
  | 'github_http_4xx'
  | 'github_http_5xx'
  | 'github_malformed_json'
  | 'github_unexpected_shape'
  | 'github_issue_schema_invalid'
  | 'database_error'
  | 'unknown'

export type LifecycleBackoffReason =
  | 'github_retry_after'
  | 'github_rate_limit_reset'
  | 'exponential_backoff'
  | 'manual_reset'
  | null

export type LifecycleRetrySignalSource = 'retry_after' | 'x_ratelimit_reset' | 'exponential' | 'none'
export type LifecycleHealthSeverity = 'disabled' | 'green' | 'amber' | 'red'

export interface LifecycleScope {
  workspace_id: number
  github_repo: string
  owner_project_id?: number | null
}

export interface LifecycleControlPatch {
  workspace_id: number
  github_repo: string
  enabled?: boolean
  interval_seconds: number
  max_pages: number
  max_issues: number
  max_duration_seconds: number
  disabled_reason?: string | null
  reset_backoff?: boolean
}

export interface LifecycleControlStatus {
  workspace_id: number
  github_repo: string
  enabled: boolean
  interval_seconds: number
  max_pages: number
  max_issues: number
  max_duration_seconds: number
  owner_project_id: number | null
  disabled_reason: string | null
  next_eligible_at: string | null
}

export interface LifecycleActiveRun {
  run_id: string
  trigger: LifecycleTrigger
  lease_owner: string | null
  started_at: string
  lease_expires_at: string | null
}

export interface LifecycleLastRun {
  run_id: string
  trigger: LifecycleTrigger
  result: LifecycleRunResult
  started_at: string
  completed_at: string | null
  pulled: number
  pushed: number
  partial_run_reason: string | null
  failure_reason: LifecycleFailureCategory | null
  cursor_advanced: boolean
}

export interface LifecycleBackoffStatus {
  seconds: number
  next_retry_at: string | null
  reason: LifecycleBackoffReason
  signal_source: LifecycleRetrySignalSource | null
  cap_applied: boolean
  fallback_applied: boolean
}

export interface LifecycleCounters {
  successes: number
  failures: number
  partials: number
  overlap_rejections: number
}

export interface LifecycleSkippedCounters {
  owner: number
  non_owner: number
}

export interface LifecycleHealthSummary {
  severity: LifecycleHealthSeverity
  reason: string
  source_updated_at: string
  state_drivers: string[]
  manual_fallback_available: boolean
  runbook_links: { id: string; href: string }[]
  recovery_affordances: { id: string; endpoint: string }[]
}

export interface LifecycleFailureDiagnostics {
  category: LifecycleFailureCategory | null
  sanitized_message: string | null
  redaction_applied: boolean
}

export interface LifecycleOwnershipDiagnostics {
  decision: string | null
  project_id: number | null
  owner_project_id: number | null
  eligible_project_ids: number[]
  skipped_project_ids: number[]
  reason: string | null
}

export interface LifecycleScopeStatus {
  scope: LifecycleScope
  controls: Omit<LifecycleControlStatus, 'workspace_id' | 'github_repo' | 'owner_project_id'>
  active_run: LifecycleActiveRun | null
  last_run: LifecycleLastRun | null
  last_success_cursor: string | null
  last_error: string | null
  backoff: LifecycleBackoffStatus
  counters: LifecycleCounters
  skipped: LifecycleSkippedCounters
  diagnostics: {
    latest_partial_run_reason: string | null
    ownership: string | null
    ownership_detail: LifecycleOwnershipDiagnostics | null
    lease: { age_seconds: number | null; stale: boolean }
    cursor_effect: string | null
    manual_fallback_available: boolean
    failure: LifecycleFailureDiagnostics
    health_summary: LifecycleHealthSummary
  }
}

export interface LifecycleEnvelope {
  version: typeof GITHUB_SYNC_LIFECYCLE_VERSION
  generated_at: string
  flag: { key: typeof GITHUB_SYNC_AUTOMATION_FLAG; enabled: boolean; reason: string }
  scopes: LifecycleScopeStatus[]
  diagnostics: {
    scheduler_task_registered: boolean
    schema_version: typeof GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION | 'unavailable'
    telemetry_service: 'none'
  }
}

export interface LifecycleClassifiedFailure {
  category: LifecycleFailureCategory
  sanitized_message: string
  redaction_applied: boolean
}

export interface LifecycleRetryPlan {
  seconds: number
  next_retry_at: number
  reason: Exclude<LifecycleBackoffReason, null>
  signal_source: Exclude<LifecycleRetrySignalSource, 'none'>
  cap_applied: boolean
  fallback_applied: boolean
}
