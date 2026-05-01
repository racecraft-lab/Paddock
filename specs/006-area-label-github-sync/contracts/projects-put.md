# Contract: `PUT /api/projects/[id]` (extended)

**Spec**: SPEC-006 — Area-Label GitHub Sync
**Covers**: FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-040a (defense-in-depth), FR-041, FR-057 (validation precedence), FR-058 (deterministic 409 priority), FR-059 (idempotent owner re-assertion), FR-060 (initializeLabels trigger precision), FR-061 (200 response shape), FR-062 (stable error-code enum), FR-064 (OpenAPI documentation)

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

## Validation order (canonical, FR-057)

The handler MUST evaluate validity in this fixed order. The first failing step returns the corresponding error and performs zero DB writes. This ordering is canonical — the spec gates and tests pin it explicitly.

1. **Authentication** — caller is authenticated; otherwise 401 (existing path).
2. **Authorization** — caller has operator role per existing `requireRole(request, 'operator')`; otherwise 403 (existing path).
3. **Project exists and is in the caller's workspace scope** — existing 404 path.
4. **Flag-OFF defense-in-depth (FR-040a, FR-057)** — if `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` is `false` AND any of the four new fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`) is PRESENT in the parsed request body (any non-undefined value, including `area_slug: null` clear, `false` booleans, and `true` booleans), return **400 `feature_flag_disabled`** listing only the present fields. Authorization always wins over flag evaluation, so non-operator callers see 403 not 400. This resolves the FR-033/FR-040a precedence question.
5. **Body type/format validation**:
   - `area_slug`: if non-null, MUST match the regex `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`; otherwise return **400** with `{ error: 'invalid_area_slug', message, field: 'area_slug' }`. `area_slug: null` is valid and skips the regex (clears the slug, subject to step 4 flag-OFF gating).
   - `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`: MUST be boolean if present; otherwise return **400** with `{ error: 'invalid_<field>', message, field: '<field>' }`.
6. **Idempotent / no-op short-circuit (FR-059)** — before running uniqueness SELECTs, the handler MUST check the new field values against the project's CURRENT stored values:
   - If `is_repo_sync_owner=true` AND the target project ALREADY has `is_repo_sync_owner=1`, treat as a no-op for the owner-transfer code path (no UNIQUE check, no transfer activity). The PUT proceeds to write any other changed fields normally.
   - If `is_repo_sync_owner=false` AND the target project currently has `is_repo_sync_owner=1`, write the clear inside the transaction (leaves zero owners in the group, permitted by the partial unique index).
   - If `is_triage_project=true` AND the target project ALREADY has `is_triage_project=1`, treat as a no-op for the triage-uniqueness check (the `id != ?` exclusion in the SELECT below already accomplishes this for the SELECT shape, but explicit short-circuit avoids the SELECT entirely).
   - If `area_slug=<value>` AND the target project's current `area_slug` already equals `<value>`, treat as a no-op for the area_slug-uniqueness check.
7. **Uniqueness pre-checks (FR-058 priority order)** — run in fixed order, short-circuit on first conflict; do NOT execute later SELECTs once a conflict is identified:
   - **`area_slug_conflict`** (FR-035): `SELECT id, slug FROM projects WHERE workspace_id=? AND area_slug=? AND id != ? LIMIT 1`. On hit, return **409** per shape below.
   - **`triage_conflict`** (FR-036): `SELECT id, slug FROM projects WHERE workspace_id=? AND is_triage_project=1 AND id != ? LIMIT 1`. On hit, return **409**.
   - **`owner_conflict`** (FR-037): `SELECT id, slug FROM projects WHERE workspace_id=? AND github_repo=? AND is_repo_sync_owner=1 AND id != ? LIMIT 1`. On hit AND `transfer_owner !== true`, return **409**. **First-time-set edge case**: if no row matches (no existing owner for the `(workspace_id, github_repo)` group), no 409 is returned regardless of the value of `transfer_owner` — the request proceeds to the UPDATE and succeeds as a first-time set.
8. **Atomic write** — see "Transactional behavior" below.

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

### Post-write side effect — label provisioning (FR-038, FR-060)

Trigger condition (precise): the post-commit `initializeLabels` invocation runs **if and only if** the committed transaction CHANGED the value of `projects.area_slug` (NULL→value, value→NULL, value-A→value-B) OR the value of `projects.is_triage_project` (0→1 or 1→0). Specifically:

- A PUT that ONLY changes `is_repo_sync_owner` (including the transfer-owner atomic swap) MUST NOT trigger `initializeLabels` — no new slug entered the workspace, no labels need provisioning.
- A PUT whose body contains `area_slug` or `is_triage_project` but whose parsed value equals the project's existing stored value (no-op write) MUST NOT trigger `initializeLabels`.
- A PUT that changes BOTH `area_slug` AND `is_repo_sync_owner` in one request triggers `initializeLabels` exactly once after the single transaction commits.

```ts
const slugTransitioned = previousAreaSlug !== nextAreaSlug;
const triageTransitioned = previousIsTriage !== nextIsTriage;
if (slugTransitioned || triageTransitioned) {
  for (const repo of reposOwnedByThisWorkspace) {
    await initializeLabels(repo, workspaceId, { trigger: 'area_slug_change' });
  }
}
```

Failures inside `initializeLabels` are swallowed at the per-label level and aggregated into one throttled `kind='label_provisioning_failed'` activity per `(workspace_id, github_repo)` per 24h (FR-027). The PUT response is unaffected by `initializeLabels` outcomes — 200 is returned regardless.

## Responses

### 200 OK — success (FR-061)

Body shape is the existing project record with three additive new persisted fields:

| Field | Type | Notes |
|-------|------|-------|
| `area_slug` | `string \| null` | Always present; `null` for projects that have not set it. |
| `is_triage_project` | `boolean` | Always present; `false` for projects that have not set it. |
| `is_repo_sync_owner` | `boolean` | Always present; `false` for projects that have not set it. |

The response MUST NOT include `transfer_owner` — it is a request-only behavior modifier, not a stored field on `projects`. A snapshot test pins the 200 response shape so accidental drift is caught at CI.

The 200 shape for callers that omit all four new request fields is byte-identical to the pre-SPEC-006 baseline EXCEPT for the additive presence of the three persisted fields above (always present, with the documented defaults).

#### Idempotent owner re-assertion (FR-059)

A PUT with `is_repo_sync_owner=true` (with or without `transfer_owner`) on a project that ALREADY holds `is_repo_sync_owner=1` returns 200 OK as a no-op: no UPDATE writes a different value to `is_repo_sync_owner`, no `sync_owner_transferred` activity is written, no `initializeLabels` is invoked from the transfer code path. Same for `is_repo_sync_owner=false` on the current owner — succeeds as 200, leaves the `(workspace_id, github_repo)` group with zero owners (permitted by the partial unique index).

#### First-time owner set (no existing owner)

A PUT with `is_repo_sync_owner=true` for a `(workspace_id, github_repo)` group that has zero existing owners MUST return 200 OK regardless of the value of `transfer_owner` — the request is a first-time set, not a transfer, so no 409 is appropriate. The `transfer_owner` flag is benign in this case.

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

## Test matrix (FR-049, FR-051, FR-057–FR-064)

| # | Case | Expected |
|---|------|----------|
| 1 | `area_slug='Q A!'` (uppercase + space) | 400 `invalid_area_slug`, no DB write |
| 2 | `area_slug='q'` (single char) | 200, slug saved |
| 3 | `area_slug=null` on flag-ON project that previously had `area_slug='qa'` | 200, slug cleared; `initializeLabels` invoked (slug transitioned value→NULL) |
| 4 | `area_slug='qa'` while another project in same workspace has `area_slug='qa'` | 409 `area_slug_conflict`, no DB write |
| 5 | `is_triage_project=true` while another project in same workspace has `is_triage_project=1` | 409 `triage_conflict`, no DB write |
| 6 | `is_repo_sync_owner=true` (no `transfer_owner`) while another project in same `(workspace, repo)` has `is_repo_sync_owner=1` | 409 `owner_conflict` with `hint`, no DB write |
| 7 | `is_repo_sync_owner=true` AND `transfer_owner=true` (different existing owner) | 200, atomic clear→set→activity, partial unique index never violated |
| 8 | Set-first ordering inside transfer transaction (developer regression test) | UNIQUE violation raised — proves clear-then-set is required |
| 9 | Flag OFF, body contains any of the four new fields (any non-undefined value) | 400 `feature_flag_disabled`, no DB write |
| 10 | Flag OFF, body contains `area_slug: null` (clear attempt) | 400 `feature_flag_disabled`, no DB write (FR-057 step 4) |
| 11 | Flag ON, `area_slug` transitions NULL→'qa' | 200; `initializeLabels` invoked post-commit for each repo owned in the workspace |
| 12 | **First-time set**: `is_repo_sync_owner=true` for a `(workspace, repo)` group with zero existing owners, no `transfer_owner` | 200, project becomes owner, no 409, no `sync_owner_transferred` activity (not a transfer) |
| 13 | **First-time set with stray flag**: same as #12 but `transfer_owner=true` also passed | 200, project becomes owner, no 409 (transfer_owner benign when no existing owner) |
| 14 | **Idempotent re-assert**: `is_repo_sync_owner=true` on a project that already owns | 200 no-op, no UPDATE, no `sync_owner_transferred` activity |
| 15 | **Idempotent re-assert with transfer_owner=true** | 200 no-op (same as #14 — no transfer occurs because target == current owner) |
| 16 | **Clear current owner**: `is_repo_sync_owner=false` on the current owner | 200, project loses ownership, group has zero owners, no 409 |
| 17 | **Idempotent slug write**: `area_slug='qa'` on a project whose stored value is already `'qa'` | 200 no-op write, `initializeLabels` NOT invoked (no transition) (FR-060) |
| 18 | **Owner-only change**: `is_repo_sync_owner=true` + `transfer_owner=true` (no `area_slug`, no `is_triage_project` in body) | 200, atomic transfer, `initializeLabels` NOT invoked (no slug/triage transitioned) (FR-060) |
| 19 | **Combined transfer + slug change**: `is_repo_sync_owner=true` + `transfer_owner=true` + `area_slug='dev'` (new slug) | 200, atomic transfer + slug write, `initializeLabels` invoked exactly once post-commit |
| 20 | **Multi-conflict priority**: `area_slug='qa'` (collides) + `is_triage_project=true` (collides) + `is_repo_sync_owner=true` no-transfer (collides) | 409 `area_slug_conflict` returned first; SQL trace shows zero SELECTs for triage or owner uniqueness (FR-058) |
| 21 | **Auth precedes flag**: non-operator caller, body contains `area_slug='qa'`, flag OFF | 403, NOT 400 (auth wins, FR-057 step 2) |
| 22 | **Format precedes uniqueness**: `area_slug='Q A!'` (bad regex) AND value collides with another project's slug | 400 `invalid_area_slug`, no SELECT-for-conflict runs |
| 23 | **Response shape**: 200 OK body for any successful PUT | Includes `area_slug`, `is_triage_project`, `is_repo_sync_owner`; does NOT include `transfer_owner` (FR-061) |
| 24 | **Stable error-code enum snapshot**: snapshot of all `error` codes returned by this route | Locked to `feature_flag_disabled`, `invalid_area_slug`, `area_slug_conflict`, `triage_conflict`, `owner_conflict` (FR-062) |
| 25 | **OpenAPI snapshot**: `openapi.json` PUT request and response schemas for `/api/projects/{id}` | Match documented shape; CI fails on drift (FR-064) |
