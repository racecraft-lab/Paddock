# Contract: Activity-log shapes (new kinds)

**Spec**: SPEC-006 — Area-Label GitHub Sync
**Covers**: FR-027a, FR-037, FR-042, FR-043, FR-044

## Summary

SPEC-006 introduces four new `activities.kind` values. Each has a fixed `data` JSON shape so consumers (operator UI, audit queries, future dashboards) can rely on predictable keys. All four are written through the existing activity-write helper inside `src/lib/github-sync-engine.ts`; no new activity helper is introduced.

## 1. `area_routing_resolved`

Written when the inbound or backfill routing resolves an issue to exactly one project via `single_match`.

```json
{
  "kind": "area_routing_resolved",
  "workspace_id": 12,
  "project_id": 42,
  "user_id": null,
  "data": {
    "area_labels": ["qa"],
    "resolved_project_id": 42,
    "reason": "single_match",
    "source": "ingest",
    "github_issue_number": 1024,
    "workspace_id": 12,
    "github_repo": "racecraft/product-line-a"
  }
}
```

Keys (FR-043):

| Key | Type | Notes |
|-----|------|-------|
| `area_labels` | `string[]` | Lowercased, prefix-stripped. For `single_match` always exactly one element. |
| `resolved_project_id` | `number` | Always set for `area_routing_resolved`. |
| `reason` | `'single_match'` | Only `single_match` qualifies for `_resolved`. |
| `source` | `'ingest' \| 'backfill'` | `'ingest'` on first ingest; `'backfill'` during the one-shot backfill. |
| `github_issue_number` | `number` | Issue number on the GitHub repo. |
| `workspace_id` | `number` | Echoed for audit query convenience. |
| `github_repo` | `string` | `'org/repo'` form. |

Written:

- On first ingest only when the routing decision is `single_match` (FR-011).
- On backfill, once per task whose stored labels resolve to exactly one project (FR-024).
- NOT written on subsequent syncs of an existing task (FR-015, FR-044).

## 2. `area_routing_unresolved`

Written when the routing decision is `no_label`, `multi_label`, `no_match`, or `no_triage`.

```json
{
  "kind": "area_routing_unresolved",
  "workspace_id": 12,
  "project_id": 7,
  "user_id": null,
  "data": {
    "area_labels": ["qa", "dev"],
    "resolved_project_id": 7,
    "reason": "multi_label",
    "source": "ingest",
    "github_issue_number": 1025,
    "workspace_id": 12,
    "github_repo": "racecraft/product-line-a"
  }
}
```

Keys: same shape as `area_routing_resolved` with these differences:

| Key | Type | Notes |
|-----|------|-------|
| `area_labels` | `string[]` | May be empty (`[]`) when `reason='no_label'`. |
| `resolved_project_id` | `number \| null` | Triage project id when `is_triage_project=1` exists; sync-owner project id when `reason='no_triage'`; `null` only if neither exists (extreme edge — workspace has no projects). |
| `reason` | `'no_label' \| 'multi_label' \| 'no_match' \| 'no_triage'` | The four `_unresolved` reasons. |
| `source` | `'ingest' \| 'backfill'` | Same semantics as `_resolved`. |

Written: same triggers as `area_routing_resolved` for the four `_unresolved` reasons.

## 3. `label_provisioning_failed` (FR-027, FR-027a)

Written by `initializeLabels` when one or more per-label GitHub API calls fail. Throttled to one row per `(workspace_id, github_repo)` per 24-hour rolling window. The throttle is enforced by querying:

```sql
SELECT 1 FROM activities
WHERE kind = 'label_provisioning_failed'
  AND workspace_id = ?
  AND json_extract(data, '$.github_repo') = ?
  AND created_at >= unixepoch() - 86400
LIMIT 1;
```

The `>=` operator is canonical per spec FR-027 — it closes the same-second boundary so the same operator action cannot produce two rows in the same epoch second. T072 (tasks.md) asserts this boundary explicitly.

If a row exists, the function logs but does not insert.

```json
{
  "kind": "label_provisioning_failed",
  "workspace_id": 12,
  "project_id": null,
  "user_id": null,
  "data": {
    "workspace_id": 12,
    "github_repo": "racecraft/product-line-a",
    "failed_labels": ["area:design", "area:ml"],
    "error_count": 2,
    "sample_error": "GitHub API 429 Too Many Requests (truncated)",
    "trigger": "connect"
  }
}
```

Keys (FR-027a):

| Key | Type | Notes |
|-----|------|-------|
| `workspace_id` | `number` | |
| `github_repo` | `string` | |
| `failed_labels` | `string[]` | Names of labels whose GitHub API call failed in this invocation. |
| `error_count` | `number` | `failed_labels.length`. |
| `sample_error` | `string` | One representative error message, truncated. **MUST NOT contain auth headers, tokens, or PII.** Per Article XIII the sample carries the rule code or status, never the offending substring of a secret. |
| `trigger` | `'connect' \| 'area_slug_change' \| 'bootstrap'` | Which trigger point invoked `initializeLabels` (FR-028). |

Aggregation rule: all per-label failures from a single `initializeLabels` invocation collapse into one row. Multiple invocations within the 24h window collapse into the first row only — subsequent failures are logged via `logger` but not duplicated in the activity log.

## 4. `sync_owner_transferred` (FR-037)

Written inside the same transaction that performs the clear-then-set transfer.

```json
{
  "kind": "sync_owner_transferred",
  "workspace_id": 12,
  "project_id": 7,
  "user_id": 3,
  "data": {
    "previous_owner_project_id": 9,
    "new_owner_project_id": 7,
    "github_repo": "racecraft/product-line-a",
    "workspace_id": 12,
    "actor_user_id": 3
  }
}
```

Keys:

| Key | Type | Notes |
|-----|------|-------|
| `previous_owner_project_id` | `number` | The project that just had `is_repo_sync_owner` cleared. |
| `new_owner_project_id` | `number` | The project that just had `is_repo_sync_owner` set. |
| `github_repo` | `string` | The `(workspace_id, github_repo)` group whose ownership was transferred. |
| `workspace_id` | `number` | Echoed. |
| `actor_user_id` | `number` | The operator who initiated the transfer. |

The row's outer `project_id` references the new owner so the existing activity-by-project queries surface the transfer for the project that gained ownership.

## Cross-cutting rules

- **Activities are write-only on routing decisions** (FR-044). Subsequent syncs that update title/body/labels of an existing task MUST NOT write any of these four kinds.
- **No raw secrets in `data`** (Article XIII). The `sample_error` field is the only free-text string and is truncated and sanitized.
- **Workspace scoping** — every row carries `workspace_id` both as a column and inside `data` so audit queries can filter by either path.
- **`source: 'ingest' \| 'backfill'`** distinguishes the two write triggers for the `area_routing_*` kinds. Operators reading the activity log can filter by source to separate first-time-flag-on backfill from steady-state ingest.

## Test matrix (FR-049)

| Activity kind | Trigger | Assertion |
|---------------|---------|-----------|
| `area_routing_resolved` | First ingest with single matching `area:*` | One row with `reason='single_match'`, `source='ingest'`, exact `data` shape. |
| `area_routing_resolved` | Backfill with single matching label | One row with `reason='single_match'`, `source='backfill'`. |
| `area_routing_unresolved` | Issue with no `area:*` labels | One row with `reason='no_label'`, `area_labels=[]`. |
| `area_routing_unresolved` | Issue with two `area:*` labels | One row with `reason='multi_label'`, both labels in `area_labels`. |
| `area_routing_unresolved` | Issue with one unknown `area:*` label | One row with `reason='no_match'`, label in `area_labels`. |
| `area_routing_unresolved` | Issue with `area:*` but no triage project | One row with `reason='no_triage'`, fallback to sync-owner `resolved_project_id`. |
| `area_routing_*` (any) | Subsequent sync of existing task with changed labels | **Zero new rows** (FR-015, FR-044). |
| `label_provisioning_failed` | First failure within 24h | One row with `failed_labels`, `error_count`, `trigger`. |
| `label_provisioning_failed` | Second failure within 24h | **Zero new rows** (throttled). |
| `sync_owner_transferred` | PUT with `transfer_owner=true` | One row inside the same transaction as the clear-then-set; `previous_owner_project_id` and `new_owner_project_id` populated. |
