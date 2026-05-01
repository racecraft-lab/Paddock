# Phase 1 Data Model: Area-Label GitHub Sync

**Feature**: SPEC-006 — Area-Label GitHub Sync
**Date**: 2026-05-01
**Migration**: M62 (or M63 after SPEC-004 rebase per FR-007)

This document specifies the schema delta, all indexes, the migration backfill, and the runtime entities that consume the new columns. Every change is additive and NULL-default.

---

## 1. Schema delta

### 1.1 `projects` table — three NULLable columns

```sql
ALTER TABLE projects ADD COLUMN area_slug TEXT;
ALTER TABLE projects ADD COLUMN is_triage_project INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN is_repo_sync_owner INTEGER DEFAULT 0;
```

> Implemented via `addColumnIfMissing(db, 'projects', 'area_slug', 'area_slug TEXT')` etc., consistent with the existing migration helper precedent (`028_github_sync_v2`). Boolean columns use SQLite's `INTEGER` storage class with `0`/`1` semantics. Per FR-003, NO `NOT NULL` constraint is added on any new column; the `DEFAULT 0` clause alone produces the intended `0` value for existing rows while leaving the column nullable in DDL terms (additive-migration policy, Constitution Article VII).

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `area_slug` | `TEXT` | NULL allowed; format `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` enforced by application | The slug used to resolve `area:<slug>` GitHub labels to this project (FR-009..FR-014). NULL means the project is not an area-routing target. |
| `is_triage_project` | `INTEGER` (BOOLEAN) | NULL allowed; `DEFAULT 0`; partial unique index per workspace | Marks the project as the workspace's triage destination for unresolvable issues (FR-014, US3). |
| `is_repo_sync_owner` | `INTEGER` (BOOLEAN) | NULL allowed; `DEFAULT 0`; partial unique index per `(workspace_id, github_repo)` | Marks the project as the sole poller for its `github_repo` when the flag is ON (FR-018, US2). |

### 1.2 `tasks` table — one NULLable column

```sql
ALTER TABLE tasks ADD COLUMN area_routing_backfilled_at INTEGER;
```

> SQLite `TIMESTAMP` is conventionally stored as `INTEGER` Unix-epoch seconds in this codebase. NULL means "not yet processed by `backfillAreaRouting`."

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `area_routing_backfilled_at` | `INTEGER` (Unix epoch) | NULL allowed | Backfill resume marker (R-002). Set to `unixepoch()` inside each per-task transaction during `backfillAreaRouting` (FR-021). NULL = pending. |

### 1.3 `workspaces.feature_flags` JSON — one new key

No DDL. Added at runtime via `UPDATE workspaces SET feature_flags = json_patch(feature_flags, ?)` once the backfill completes for that workspace.

| Key | Type | Purpose |
|-----|------|---------|
| `area_label_routing_backfill_completed_at` | ISO-8601 string or Unix epoch (engine choice; spec records it as a TIMESTAMP) | Idempotent guard for the one-shot backfill (FR-022, US5-AC2). Set after processing all eligible tasks. |

The existing `FEATURE_AREA_LABEL_ROUTING` boolean continues to live under `workspaces.feature_flags.FEATURE_AREA_LABEL_ROUTING` and is consumed via `resolveFlag`.

---

## 2. Indexes

Four new indexes are created in the same migration:

```sql
-- 2.1 Non-unique lookup index for inbound routing cache
CREATE INDEX IF NOT EXISTS idx_projects_workspace_area_slug
  ON projects(workspace_id, area_slug);

-- 2.2 Partial unique index — one sync owner per (workspace, repo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_sync_owner_per_repo
  ON projects(workspace_id, github_repo)
  WHERE is_repo_sync_owner = 1;

-- 2.3 Partial unique index — one triage project per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_triage_per_workspace
  ON projects(workspace_id)
  WHERE is_triage_project = 1;

-- 2.4 Partial index — backfill resume scan stays O(remaining-tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_area_routing_backfill_pending
  ON tasks(workspace_id)
  WHERE github_issue_number IS NOT NULL
    AND area_routing_backfilled_at IS NULL;
```

| Index | Kind | Purpose |
|-------|------|---------|
| `idx_projects_workspace_area_slug` | Non-unique B-tree | Powers `loadAreaRoutingCache` (FR-009) and the conflict check in `PUT /api/projects/[id]` (FR-035). |
| `idx_projects_one_sync_owner_per_repo` | Partial unique | Enforces FR-018 invariant. Set-first-then-clear ordering would violate this immediately because SQLite UNIQUE indexes are not deferrable (R-001). |
| `idx_projects_one_triage_per_workspace` | Partial unique | Enforces FR-036 invariant. |
| `idx_tasks_area_routing_backfill_pending` | Partial non-unique | Powers the resume scan in `backfillAreaRouting` (FR-023). Without this index the resume scan would be O(N tasks); with it, O(remaining tasks). |

The legacy unique constraint `(workspace_id, github_repo, github_issue_number)` MUST remain (FR-008). SPEC-006 does not alter it.

---

## 3. Migration backfill — sync-owner election

Inside the same M62 migration body, after the columns and indexes exist:

```sql
-- For each (workspace_id, github_repo) group with at least one project where
-- github_sync_enabled=1, mark MIN(projects.id) as the sync owner.
UPDATE projects
SET is_repo_sync_owner = 1
WHERE id IN (
  SELECT MIN(id)
  FROM projects
  WHERE github_sync_enabled = 1
    AND github_repo IS NOT NULL
  GROUP BY workspace_id, github_repo
);
```

Properties:

- **Deterministic**: `MIN(id)` always elects the same project for a given group.
- **Idempotent**: Running the migration twice produces the same end state (the partial unique index would block any second `UPDATE` that tried to elect a second owner; this UPDATE only sets rows already at the elected `id`).
- **Non-destructive**: Existing rows in unrelated columns (`name`, `slug`, `github_repo`, `github_sync_enabled`, etc.) are not touched.
- **Workspaces with zero `github_sync_enabled` projects**: the migration writes nothing for them. They remain at `is_repo_sync_owner=0` for every project, which is correct (no sync owner = no polling).

Per FR-005, US7-AC2 verifies this on a populated database.

---

## 4. Rollback (`docs/migrations/rollback-M62.sql`)

The companion rollback SQL drops every artifact added by the migration:

```sql
-- Drop indexes first (SQLite tolerates index drops on dropped tables;
-- explicit drops keep the rollback re-runnable on partial state).
DROP INDEX IF EXISTS idx_tasks_area_routing_backfill_pending;
DROP INDEX IF EXISTS idx_projects_one_triage_per_workspace;
DROP INDEX IF EXISTS idx_projects_one_sync_owner_per_repo;
DROP INDEX IF EXISTS idx_projects_workspace_area_slug;

-- SQLite supports DROP COLUMN since 3.35.0 (March 2021) and the project
-- pin is well above that. Rerun-safe via IF EXISTS isn't supported on
-- DROP COLUMN, so the rollback document covers a manual two-step path
-- if the operator runs it twice. See docs/migrations/rollback-procedure.md.
ALTER TABLE projects DROP COLUMN area_slug;
ALTER TABLE projects DROP COLUMN is_triage_project;
ALTER TABLE projects DROP COLUMN is_repo_sync_owner;
ALTER TABLE tasks DROP COLUMN area_routing_backfilled_at;
```

After rollback, the schema is functionally equivalent to the pre-SPEC-006 baseline (SC-009, US7-AC3). The legacy `(workspace_id, github_repo, github_issue_number)` unique constraint is untouched.

If SPEC-004 ships first, the rollback file is renamed to `rollback-M63.sql` per FR-007; contents are unchanged.

---

## 5. Runtime entities

### 5.1 `Project` (extended)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | `number` | existing | Used for `MIN(id)` sync-owner election. |
| `workspace_id` | `number` | existing | Routing cache scope. |
| `github_repo` | `string \| null` | existing | Sync-owner uniqueness key. |
| `github_sync_enabled` | `boolean` | existing | Filters which projects are eligible for owner election. |
| `area_slug` | `string \| null` | **new** | Routing target on inbound; emitted on outbound. |
| `is_triage_project` | `boolean` | **new** | Receives unresolvable inbound. |
| `is_repo_sync_owner` | `boolean` | **new** | Polls the repo when the flag is ON. |

### 5.2 `Task` (extended)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id`, `workspace_id`, `project_id`, `github_repo`, `github_issue_number`, `github_labels` | various | existing | Routing reads `github_labels` during backfill (R-002 — uses the stored labels, not a fresh GitHub fetch). |
| `area_routing_backfilled_at` | `number \| null` (Unix epoch) | **new** | Backfill resume marker. NULL ⇒ not yet processed. |

### 5.3 `Workspace` (extended)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `feature_flags` | `JSON` | existing | Adds `area_label_routing_backfill_completed_at` runtime key. Adds `FEATURE_AREA_LABEL_ROUTING` boolean (read via `resolveFlag`). |

### 5.4 `Activity` (extended)

| `kind` value | Source | `data` shape |
|--------------|--------|--------------|
| `area_routing_resolved` | **new** (FR-042) | `{ area_labels, resolved_project_id, reason: 'single_match', source: 'ingest'|'backfill', github_issue_number, workspace_id, github_repo }` |
| `area_routing_unresolved` | **new** (FR-042) | Same shape as above with `reason: 'no_label'|'multi_label'|'no_match'|'no_triage'`. `resolved_project_id` may be `null`. |
| `label_provisioning_failed` | **new** (FR-027a) | `{ workspace_id, github_repo, failed_labels: string[], error_count, sample_error: string, trigger: 'connect'|'area_slug_change'|'bootstrap' }` |
| `sync_owner_transferred` | **new** (FR-037) | `{ previous_owner_project_id: number, new_owner_project_id: number, github_repo: string, workspace_id: number, actor_user_id: number }` — `actor_user_id` is the integer `users.id` foreign key only; never an email or display name (FR-043a). |

See [`contracts/activities-shapes.md`](./contracts/activities-shapes.md) for canonical JSON examples.

### 5.5 `RoutingDecision` (in-memory only — not persisted)

```ts
type RoutingDecision = {
  resolved_project_id: number | null;
  reason: 'single_match' | 'no_label' | 'multi_label' | 'no_match' | 'no_triage';
  area_labels: string[]; // lowercased, prefix-stripped
};
```

Computed by the (non-exported) routing function inside `src/lib/github-sync-engine.ts`. Drives both the `tasks.project_id` UPDATE and the `activities` row written.

### 5.6 `LabelDef` (existing — extended consumer)

```ts
type LabelDef = { name: string; color: string; description: string };
```

Already exported from `src/lib/github-label-map.ts`. SPEC-006 adds:

- `AREA_LABEL_MAP: Record<string, LabelDef>` — 12 static defaults (FR-030).
- `ALL_AREA_LABEL_NAMES: string[]` — `Object.values(AREA_LABEL_MAP).map(l => l.name)` (FR-032).
- `areaLabelsForWorkspace(db, workspaceId): LabelDef[]` — union of defaults + workspace-specific (FR-031).

---

## 6. Validation rules (cross-reference)

Application-enforced invariants over the new columns. Each is asserted in unit tests per FR-049:

1. **`area_slug` format**: `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` — FR-034. Single character allowed via the optional outer group.
2. **`area_slug` uniqueness per workspace**: SELECT existing row before INSERT/UPDATE; on hit, return 409 with `error: 'area_slug_conflict'` — FR-035.
3. **`is_triage_project` exclusivity**: partial unique index + pre-check returning 409 with `error: 'triage_conflict'` — FR-036.
4. **`is_repo_sync_owner` exclusivity**: partial unique index + pre-check returning 409 with `error: 'owner_conflict'` and `hint` for transfer-owner — FR-037. Transfer is atomic clear → set → activity.
5. **Backfill predicate**: `WHERE workspace_id=? AND github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL` — FR-023.
6. **Triage authority**: only `is_triage_project=1` routes unresolvable issues. `area_slug='triage'` on a non-triage project routes `area:triage`-labeled issues as `single_match` and never receives unresolvable fallbacks — FR-014, edge-case row in spec.

---

## 7. Forbidden / out-of-scope

- **No RENAME of any existing column** — Article II.
- **No NOT NULL on any new column** (the boolean `DEFAULT 0` is the documented additive pattern; existing rows get `0` automatically) — FR-003.
- **No alteration of the legacy unique constraint `(workspace_id, github_repo, github_issue_number)`** — FR-008.
- **No new `tasks.*` column tracking the OLD `project_id` for backfill audit** — the `activities` row carries the audit; speculative generality rejected per Article XII.
- **No automatic sync-owner re-election on owner deletion** — deferred (Article XII); operator preflight (FR-046) covers it.
- **No `kind='sync_owner_lost'` activity** — deferred (Article XII).
- **No backfill bookend kinds (`area_routing_backfill_started`, `area_routing_backfill_completed`)** — deferred (Article XII); SC-006 is testable from per-task counts plus the workspace completion marker.
