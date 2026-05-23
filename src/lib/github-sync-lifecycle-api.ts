import {
  GITHUB_SYNC_AUTOMATION_FLAG,
  GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION,
  GITHUB_SYNC_LIFECYCLE_VERSION,
  type LifecycleControlPatch,
  type LifecycleEnvelope,
  type LifecycleScopeStatus,
} from './github-sync-lifecycle-types'

type ValidationErrorCode =
  | 'workspace_id_required'
  | 'github_repo_required'
  | 'interval_out_of_bounds'
  | 'max_pages_out_of_bounds'
  | 'max_issues_out_of_bounds'
  | 'max_duration_out_of_bounds'

export type LifecycleValidationResult =
  | { ok: true; value: LifecycleControlPatch }
  | { ok: false; status: 400; code: ValidationErrorCode; error: string }

const SAFE_PAYLOAD_FIELDS = new Set([
  'workspace_id',
  'github_repo',
  'run_id',
  'trigger',
  'result',
  'project_id',
  'owner_project_id',
  'cursor_advanced',
  'failure_category',
  'partial_run_reason',
  'backoff_seconds',
  'next_retry_at',
  'retry_after_seconds',
  'lease_expires_at',
  'sanitized_message',
  'redaction_applied',
  'status_code_class',
  'github_request_id',
  'endpoint_category',
  'rate_limit_remaining',
  'rate_limit_reset',
  'retry_count',
  'timestamp',
  'correlation_id',
  'manual_fallback_available',
])

const SECRET_VALUE_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/i,
  /github_pat_[A-Za-z0-9_]{20,}/i,
  /sk-proj-[A-Za-z0-9_-]+/i,
  /sk-[A-Za-z0-9_-]{20,}/i,
  /Authorization\s*:/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
  /api[_-]?key\s*=/i,
  /GITHUB_TOKEN/i,
]

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function validationError(code: ValidationErrorCode, field: string): LifecycleValidationResult {
  return { ok: false, status: 400, code, error: `${field} is required` }
}

export function validateLifecycleControlPatch(input: unknown): LifecycleValidationResult {
  if (!input || typeof input !== 'object') {
    return validationError('workspace_id_required', 'workspace_id')
  }
  const body = input as Record<string, unknown>
  const workspaceId = integer(body['workspace_id'])
  if (workspaceId === null || workspaceId <= 0) {
    return validationError('workspace_id_required', 'workspace_id')
  }
  const githubRepo = typeof body['github_repo'] === 'string' ? body['github_repo'].trim() : ''
  if (githubRepo.length === 0) {
    return validationError('github_repo_required', 'github_repo')
  }

  const interval = integer(body['interval_seconds'] ?? 300)
  if (interval === null || interval < 60) {
    return { ok: false, status: 400, code: 'interval_out_of_bounds', error: 'interval_seconds is out of bounds' }
  }
  const maxPages = integer(body['max_pages'] ?? 10)
  if (maxPages === null || maxPages < 1 || maxPages > 100) {
    return { ok: false, status: 400, code: 'max_pages_out_of_bounds', error: 'max_pages is out of bounds' }
  }
  const maxIssues = integer(body['max_issues'] ?? 1000)
  if (maxIssues === null || maxIssues < 1 || maxIssues > 5000) {
    return { ok: false, status: 400, code: 'max_issues_out_of_bounds', error: 'max_issues is out of bounds' }
  }
  const maxDuration = integer(body['max_duration_seconds'] ?? 45)
  if (maxDuration === null || maxDuration < 5 || maxDuration > 600) {
    return {
      ok: false,
      status: 400,
      code: 'max_duration_out_of_bounds',
      error: 'max_duration_seconds is out of bounds',
    }
  }

  const value: LifecycleControlPatch = {
    workspace_id: workspaceId,
    github_repo: githubRepo,
    interval_seconds: interval,
    max_pages: maxPages,
    max_issues: maxIssues,
    max_duration_seconds: maxDuration,
  }
  if (typeof body['enabled'] === 'boolean') value.enabled = body['enabled']
  if (typeof body['disabled_reason'] === 'string') value.disabled_reason = body['disabled_reason']
  if (body['reset_backoff'] === true) value.reset_backoff = true

  return { ok: true, value }
}

export function assertSafeLifecyclePayload(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_PAYLOAD_FIELDS.has(key)) {
      throw new Error(`unsafe lifecycle field: ${key}`)
    }
    if (typeof value === 'string' && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`secret-shaped lifecycle value: ${key}`)
    }
  }
}

export function serializeLifecycleEnvelope(input: {
  generated_at: string
  flag: { key: typeof GITHUB_SYNC_AUTOMATION_FLAG; enabled: boolean; reason: string }
  scopes: LifecycleScopeStatus[]
  scheduler_task_registered: boolean
  schema_version?: typeof GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION | 'unavailable'
}): LifecycleEnvelope {
  return {
    version: GITHUB_SYNC_LIFECYCLE_VERSION,
    generated_at: input.generated_at,
    flag: input.flag,
    scopes: input.scopes,
    diagnostics: {
      scheduler_task_registered: input.scheduler_task_registered,
      schema_version: input.schema_version ?? GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION,
      telemetry_service: 'none',
    },
  }
}

export { GITHUB_SYNC_AUTOMATION_FLAG, GITHUB_SYNC_LIFECYCLE_SCHEMA_VERSION, GITHUB_SYNC_LIFECYCLE_VERSION }
