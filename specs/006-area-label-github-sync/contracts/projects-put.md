# Contract: `PUT /api/projects/[id]` (extended)

**Spec**: SPEC-006 — Area-Label GitHub Sync
**Covers**: FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-040a (defense-in-depth), FR-041

## Summary

The existing `PUT /api/projects/[id]` route gains four optional request fields and three new 409 Conflict response shapes. Operator-only authorization is unchanged. The handler performs a clear-then-set atomic transfer when `is_repo_sync_owner=true` is paired with `transfer_owner=true`. When the transition writes change `area_slug` or `is_triage_project`, the handler invokes `initializeLabels` for every repo owned by an `is_repo_sync_owner=1` project in the workspace.

## Authorization

Unchanged — operator role required (existing `requireRole(request, 'operator')` pattern).

## Request

### Headers

Unchanged.

### Body (JSON)

The existing fields (`name`, `slug`, `description`, `ticket_prefix`, `status`, `github_repo`, `deadline`, `color`, `github_sync_enabled`, `github_default_branch`) are unchanged. SPEC-006 adds:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `area_slug` | `string \| null` | No | Format `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` (FR-034). `null` clears the slug. |
| `is_triage_project` | `boolean` | No | One per workspace (FR-036). |
| `is_repo_sync_owner` | `boolean` | No | One per `(workspace_id, github_repo)` (FR-037). |
| `transfer_owner` | `boolean` | No | Required when overriding an existing owner. Has no effect when paired with `is_repo_sync_owner=false` or omitted. |

### Flag-OFF defense-in-depth (FR-040a)

When `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` is `false` for the project's workspace, the handler MUST reject any non-undefined value of `area_slug`, `is_triage_project`, `is_repo_sync_owner`, or `transfer_owner` with **400 Bad Request** and body:

```json
{
  "error": "feature_flag_disabled",
  "message": "FEATURE_AREA_LABEL_ROUTING is not enabled for this workspace; area-routing fields cannot be set.",
  "fields": ["area_slug", "is_triage_project", "is_repo_sync_owner", "transfer_owner"]
}
```

(Only the fields actually present in the request are listed.) The UI mirrors this with disabled inputs + tooltip (FR-040a).

## Validation order (flag ON)

1. **Authorization** — operator required.
2. **Project exists and is in the caller's workspace scope** — existing 404 path.
3. **Body parse and field-by-field validation**:
   - `area_slug`: if non-null, MUST match the regex; otherwise return **400** with `{ error: 'invalid_area_slug', message, field: 'area_slug' }`.
   - `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`: MUST be boolean if present.
4. **Uniqueness pre-checks** (run BEFORE the UPDATE so the 409 error message can name the conflicting project):
   - **`area_slug` uniqueness** (FR-035): `SELECT id, slug FROM projects WHERE workspace_id=? AND area_slug=? AND id != ? LIMIT 1`. On hit, return **409** per shape below.
   - **`is_triage_project` uniqueness** (FR-036): `SELECT id, slug FROM projects WHERE workspace_id=? AND is_triage_project=1 AND id != ? LIMIT 1`. On hit, return **409**.
   - **`is_repo_sync_owner` uniqueness** (FR-037): `SELECT id, slug FROM projects WHERE workspace_id=? AND github_repo=? AND is_repo_sync_owner=1 AND id != ? LIMIT 1`. On hit AND `transfer_owner !== true`, return **409**.
5. **Atomic write** — see "Transactional behavior" below.

## Transactional behavior

All writes for a single PUT request happen inside one `db.transaction(() => { ... })` block.

### Standard update (no transfer)

```sql
UPDATE projects
SET area_slug = ?, is_triage_project = ?, is_repo_sync_owner = ?, ...
WHERE id = ?;
```

(Plus any other fields from the existing PUT body.)

### Transfer-owner update (`is_repo_sync_owner=true` AND `transfer_owner=true` AND existing owner is a different project in the same `(workspace_id, github_repo)` group)

The transaction MUST execute three statements in this order. **Reversing any of these (set-first) violates the partial unique index because SQLite UNIQUE constraints are immediate, NOT deferrable** (R-001):

```sql
-- Step 1: clear the previous owner.
UPDATE projects
SET is_repo_sync_owner = 0
WHERE workspace_id = ?
  AND github_repo = ?
  AND is_repo_sync_owner = 1
  AND id != ?;  -- exclude the new owner just in case

-- Step 2: set the new owner.
UPDATE projects
SET is_repo_sync_owner = 1, area_slug = ?, is_triage_project = ?, ...
WHERE id = ?;

-- Step 3: write the audit activity.
INSERT INTO activities (kind, workspace_id, project_id, user_id, data, created_at)
VALUES ('sync_owner_transferred', ?, ?, ?, ?, unixepoch());
```

A unit test (FR-049) MUST assert that set-first ordering raises a UNIQUE violation, locking the rule against future regressions.

### Post-write side effect — label provisioning

If the transaction successfully transitioned `area_slug` or `is_triage_project` to a new value (NULL→value or value-A→value-B), AFTER the transaction commits the handler invokes:

```ts
for (const repo of reposOwnedByThisWorkspace) {
  await initializeLabels(repo, workspaceId, { trigger: 'area_slug_change' });
}
```

Failures inside `initializeLabels` are swallowed at the per-label level and aggregated into one throttled `kind='label_provisioning_failed'` activity per `(workspace_id, github_repo)` per 24h (FR-027). The PUT response is unaffected.

## Responses

### 200 OK — success

Body shape unchanged from the existing PUT (returns the updated project record), with the three new fields included in the JSON.

### 400 Bad Request — invalid input or flag OFF

Two distinct cases:

```json
// Bad regex (FR-034)
{
  "error": "invalid_area_slug",
  "message": "area_slug must match ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ (RFC 1123 / Kubernetes DNS label).",
  "field": "area_slug"
}
```

```json
// Flag OFF defense-in-depth (FR-040a)
{
  "error": "feature_flag_disabled",
  "message": "FEATURE_AREA_LABEL_ROUTING is not enabled for this workspace; area-routing fields cannot be set.",
  "fields": ["area_slug"]
}
```

### 404 Not Found — project not in caller's scope

Unchanged.

### 409 Conflict — uniqueness violation (hybrid shape per FR-041)

The form keys on the structured `error` code, NOT on regex-parsing of `message`.

#### `area_slug_conflict` (FR-035)

```json
{
  "error": "area_slug_conflict",
  "message": "Another project in this workspace already uses area_slug 'qa': 'quality-assurance'.",
  "existing_area_slug_project_id": 42,
  "existing_area_slug_project_slug": "quality-assurance"
}
```

#### `triage_conflict` (FR-036)

```json
{
  "error": "triage_conflict",
  "message": "This workspace already has a triage project: 'triage-inbox'.",
  "existing_triage_project_id": 17,
  "existing_triage_project_slug": "triage-inbox"
}
```

#### `owner_conflict` (FR-037)

```json
{
  "error": "owner_conflict",
  "message": "Repo 'racecraft/product-line-a' already has a sync owner: 'dev-kanban'. Set transfer_owner=true to swap ownership.",
  "existing_owner_project_id": 9,
  "existing_owner_project_slug": "dev-kanban",
  "hint": "Set transfer_owner=true to swap ownership in one transaction"
}
```

The form's transfer-owner button re-submits the same request body with `transfer_owner: true`.

### 500 Internal Server Error

Unchanged. Per Article XIII, error responses MUST include actionable context (operation type, offending ids, failure reason) and MUST NOT include raw matched substrings of secrets.

## Test matrix (FR-049, FR-051)

| Case | Expected |
|------|----------|
| `area_slug='Q A!'` (uppercase + space) | 400 `invalid_area_slug`, no DB write |
| `area_slug='q'` (single char) | 200, slug saved |
| `area_slug='qa'` while another project in same workspace has `area_slug='qa'` | 409 `area_slug_conflict`, no DB write |
| `is_triage_project=true` while another project in same workspace has `is_triage_project=1` | 409 `triage_conflict`, no DB write |
| `is_repo_sync_owner=true` (no `transfer_owner`) while another project in same `(workspace, repo)` has `is_repo_sync_owner=1` | 409 `owner_conflict` with `hint`, no DB write |
| `is_repo_sync_owner=true` AND `transfer_owner=true` | 200, atomic clear→set→activity, partial unique index never violated |
| Set-first ordering inside transfer transaction (developer regression test) | UNIQUE violation raised — proves clear-then-set is required |
| Flag OFF, body contains any of the four new fields | 400 `feature_flag_disabled`, no DB write |
| Flag ON, `area_slug` transitions NULL→'qa' | 200; `initializeLabels` invoked post-commit for each repo owned in the workspace |
