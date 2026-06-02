# Data Model: SPEC-014A - Sandbox Ownership and Lifecycle Contract

## agent_sandbox_lifecycles

Current-state projection for one deterministic sandbox key.

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Yes | Lifecycle id. |
| `workspace_id` | INTEGER | Yes | Workspace authorization and lookup scope. |
| `task_id` | INTEGER | Yes | Task owning the stage. |
| `stage_key` | TEXT | Yes | Non-empty workflow stage key. |
| `sandbox_attempt_key` | TEXT | Yes | Required key segment for `attempt/<attempt_id>`; may mirror `task_stage_attempt_id` when present. |
| `task_stage_attempt_id` | INTEGER | No | Passive evidence link to M76 attempts. Not a lock. |
| `task_stage_claim_id` | INTEGER | No | Evidence link to M78 claims. Not a lock. |
| `owner` | TEXT | Yes | Closed enum: `paddock`, `openclaw`, `external_harness`. |
| `sandbox_key` | TEXT | Yes | Deterministic stable key. Unique within workspace. |
| `root_id` | TEXT | Yes | Logical root identifier, not an absolute path. |
| `sanitized_relative_path` | TEXT | Yes | Safe bounded relative path evidence. |
| `handle_id` | TEXT | No | Optional opaque external handle id. |
| `status` | TEXT | Yes | Closed lifecycle status. |
| `created_at` | TEXT | Yes | ISO timestamp. |
| `updated_at` | TEXT | Yes | ISO timestamp. |
| `prepared_at` | TEXT | No | Set by `prepare`. |
| `running_at` | TEXT | No | Set by `mark_running`. |
| `terminal_at` | TEXT | No | Set by `mark_terminal`. |
| `cleanup_requested_at` | TEXT | No | Set when cleanup begins. |
| `cleaned_up_at` | TEXT | No | Set on `cleaned_up` or `rolled_back`. |
| `metadata_json` | TEXT | No | Positive-allowlisted safe metadata only. |

### Lifecycle Status

Allowed values: `created`, `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, `cleanup_failed`.

### Required Indexes

- Unique: `(workspace_id, sandbox_key)`.
- Lookup: `(workspace_id, task_id, stage_key, status, updated_at DESC)`.
- Partial lookup: `(workspace_id, task_stage_attempt_id)` where `task_stage_attempt_id IS NOT NULL`.
- Partial lookup: `(workspace_id, task_stage_claim_id)` where `task_stage_claim_id IS NOT NULL`.

## agent_sandbox_lifecycle_events

Append-only evidence for lifecycle transitions, idempotent reuse, validation failure, cleanup, and rollback.

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Yes | Event id. |
| `lifecycle_id` | INTEGER | Yes | FK to `agent_sandbox_lifecycles(id)`. |
| `workspace_id` | INTEGER | Yes | Denormalized for scoped reads. |
| `task_id` | INTEGER | Yes | Denormalized for scoped reads. |
| `stage_key` | TEXT | Yes | Denormalized for scoped reads. |
| `sandbox_key` | TEXT | Yes | Denormalized lifecycle identity. |
| `event_type` | TEXT | Yes | Closed event type. |
| `status` | TEXT | No | Status after the event when applicable. |
| `reason_code` | TEXT | No | Safe closed or redacted reason. |
| `observed_at` | TEXT | Yes | ISO timestamp. |
| `actor_type` | TEXT | No | `system`, `operator`, `test`, or `fake_owner`. |
| `actor_id` | TEXT | No | Safe actor identifier. |
| `metadata_json` | TEXT | No | Positive-allowlisted safe metadata only. |

### Required Indexes

- Event order: `(lifecycle_id, observed_at ASC, id ASC)`.
- Task order: `(workspace_id, task_id, stage_key, observed_at ASC, id ASC)`.
- Sandbox order: `(workspace_id, sandbox_key, observed_at ASC, id ASC)`.

## Event Types

Minimum event types: `created`, `prepared`, `running_marked`, `terminal_marked`, `cleanup_requested`, `cleaned_up`, `rolled_back`, `cleanup_failed`, `create_reused`, `validation_failed`, `mutation_blocked_flag_off`.

## Invariants

- Flag-off mutation attempts insert no lifecycle rows and no event rows.
- Duplicate create for the same nonterminal `(workspace_id, sandbox_key)` with matching owner/root/path evidence returns the existing lifecycle and appends `create_reused`.
- Duplicate create with conflicting owner, root, or path evidence fails closed without mutating the existing lifecycle.
- Cleanup and rollback remove physical fake artifacts but retain lifecycle/event rows.
- `task_stage_attempt_id` and `task_stage_claim_id` are evidence links only; they do not define active claim ownership.
- Persisted metadata must not include raw prompts, tokens, provider responses, auth headers, raw session payloads, raw path fragments, or absolute host paths.
