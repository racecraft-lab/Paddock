# Quickstart: Enabling Area-Label GitHub Sync

**Spec**: SPEC-006 — Area-Label GitHub Sync
**Audience**: Mission Control workspace operators
**Estimated time**: 5–10 minutes (excluding the auto-backfill, which runs unattended)

This guide walks an operator from a freshly-deployed Mission Control with the SPEC-006 migration applied through enabling `FEATURE_AREA_LABEL_ROUTING` for one workspace, verifying the auto-backfill, and rolling back if needed. Follow the steps in order; each step has a verification command you can run from the project root.

---

## Prerequisites

- Mission Control is running (`pnpm dev`, `node .next/standalone/server.js`, or Docker compose).
- Migration M62 (or M63 after SPEC-004 rebase) has been applied. Verify:
  ```bash
  sqlite3 .data/mission-control.db "SELECT id FROM schema_migrations WHERE id LIKE '%area%' OR id LIKE '%62%' OR id LIKE '%63%';"
  ```
  At least one row should reference the area-label routing migration.
- The companion rollback file is committed at `docs/migrations/rollback-M62.sql` (or `rollback-M63.sql`).
  ```bash
  ls docs/migrations/rollback-M*.sql
  ```
- You hold the operator role for the target workspace.
- The workspace's repo (e.g., `racecraft/product-line-a`) is already connected via `POST /api/github` and has working `mc:*` and `priority:*` labels.

---

## Step 1 — Inspect the schema

Confirm the four new columns and four new indexes exist:

```bash
sqlite3 .data/mission-control.db <<'SQL'
.schema projects
.schema tasks
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_projects_%area%';
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_projects_one_%';
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tasks_area_%';
SQL
```

Expected:

- `projects.area_slug TEXT`, `projects.is_triage_project INTEGER DEFAULT 0`, `projects.is_repo_sync_owner INTEGER DEFAULT 0` (no `NOT NULL` clause per FR-003 / Constitution Article VII; `DEFAULT 0` provides the intended initial value for existing rows).
- `tasks.area_routing_backfilled_at INTEGER`.
- Indexes: `idx_projects_workspace_area_slug`, `idx_projects_one_sync_owner_per_repo`, `idx_projects_one_triage_per_workspace`, `idx_tasks_area_routing_backfill_pending`.

---

## Step 2 — Verify the migration backfilled exactly one sync owner per repo

For every `(workspace_id, github_repo)` group with at least one project at `github_sync_enabled=1`, exactly one project should now hold `is_repo_sync_owner=1`:

```bash
sqlite3 .data/mission-control.db <<'SQL'
SELECT workspace_id, github_repo, COUNT(*) AS owner_count
FROM projects
WHERE is_repo_sync_owner = 1
GROUP BY workspace_id, github_repo
HAVING COUNT(*) != 1;
SQL
```

Expected: **zero rows** (the partial unique index would have rejected the migration if any group had more than one). This is the FR-046 preflight check.

---

## Step 3 — Designate area projects in the UI

Open the project settings panel for each department project in the target workspace.

For each project that should receive area-routed issues, set:

- `area_slug` to the matching slug, e.g. `qa`, `dev`, `infra`, `docs`. The text input validates against the regex `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` (RFC 1123 / Kubernetes DNS label). The input rejects `Q A!`, leading/trailing hyphens, and uppercase. Hover the inline help for guidance.

For exactly one project per workspace, also enable:

- `is_triage_project` checkbox.

For exactly one project per `(workspace, repo)`, also confirm:

- `is_repo_sync_owner` checkbox is checked. If you want to transfer ownership to a different project, check the box on the new project and confirm the transfer-owner action when prompted (this triggers the atomic clear → set → audit transaction; FR-037).

If you see a 409 Conflict inline error, the form names the existing conflicting project. For sync-owner conflicts, click **Transfer ownership** to swap atomically.

When `FEATURE_AREA_LABEL_ROUTING` is OFF for the workspace, the three new fields render visible-but-disabled with a tooltip: *"Available after FEATURE_AREA_LABEL_ROUTING is enabled for this workspace."* (FR-040a).

---

## Step 4 — Enable the feature flag

Workspace flags live in `workspaces.feature_flags JSON`. Enable the flag with a SQL update or via your operator tooling:

```bash
WORKSPACE_ID=12  # adjust
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_patch(
  COALESCE(feature_flags, '{}'),
  json_object('FEATURE_AREA_LABEL_ROUTING', json('true'))
)
WHERE id = $WORKSPACE_ID;
SQL
```

Confirm:

```bash
sqlite3 .data/mission-control.db "SELECT json_extract(feature_flags, '$.FEATURE_AREA_LABEL_ROUTING') FROM workspaces WHERE id=$WORKSPACE_ID;"
```

Expected: `1` (or `true`).

The next time `pullFromGitHub` runs for this workspace's sync owner, it will:

1. Invoke `initializeLabels(repo, workspaceId, { trigger: 'bootstrap' })` once — provisioning all `area:*` labels on the repo (default set + workspace-specific slugs not in the static map).
2. Invoke `backfillAreaRouting(workspaceId)` once because the completion marker is unset.
3. Begin polling normally with the `is_repo_sync_owner=1` filter applied (FR-018).

---

## Step 5 — Verify the auto-backfill ran exactly once

After the next sync cycle (poller default cadence), the completion marker should be set on the workspace:

```bash
sqlite3 .data/mission-control.db "SELECT json_extract(feature_flags, '$.area_label_routing_backfill_completed_at') FROM workspaces WHERE id=$WORKSPACE_ID;"
```

Expected: a non-null timestamp.

Verify per-task progress (every backfilled task has a non-null `area_routing_backfilled_at`):

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT
  COUNT(*) FILTER (WHERE area_routing_backfilled_at IS NULL) AS pending,
  COUNT(*) FILTER (WHERE area_routing_backfilled_at IS NOT NULL) AS done
FROM tasks
WHERE workspace_id = $WORKSPACE_ID
  AND github_issue_number IS NOT NULL;
SQL
```

Expected: `pending=0`, `done` equals the count of GitHub-synced tasks for the workspace's repo.

Inspect the activity log for backfill rows:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT kind, json_extract(data, '$.reason') AS reason, COUNT(*) AS n
FROM activities
WHERE workspace_id = $WORKSPACE_ID
  AND kind IN ('area_routing_resolved', 'area_routing_unresolved')
  AND json_extract(data, '$.source') = 'backfill'
GROUP BY 1, 2;
SQL
```

Expected: counts add up to the total backfilled task count, distributed across the five `reason` codes.

---

## Step 6 — Verify steady-state inbound and outbound

### Inbound (issue → task)

Create a GitHub issue on the connected repo with the label `area:qa` and a title. After the next sync cycle:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT t.id, t.project_id, p.area_slug, p.slug, t.github_issue_number
FROM tasks t
JOIN projects p ON p.id = t.project_id
WHERE t.workspace_id = $WORKSPACE_ID
ORDER BY t.id DESC
LIMIT 1;
SQL
```

Expected: `area_slug='qa'`, the QA project's `slug`, and the issue number.

The corresponding `activities` row:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT kind, json_extract(data, '$.reason'), json_extract(data, '$.source')
FROM activities
WHERE workspace_id = $WORKSPACE_ID
ORDER BY id DESC
LIMIT 5;
SQL
```

Expected: `area_routing_resolved | single_match | ingest`.

### Outbound (task → issue)

Create a task in the QA project. After the next push cycle, the GitHub issue's labels include `area:qa` alongside `mc:*` and `priority:*`. Verify in the GitHub UI or via the API.

For tasks in projects with NULL `area_slug`, no `area:*` label is emitted.

---

## Step 7 — Inspect the missing-triage banner (optional)

If at any point the workspace has the flag ON but no project with `is_triage_project=1`, the project settings panel renders a yellow banner:

> No triage project designated. Unresolvable issues will route to the sync-owner project until you designate one.

Designate one project as triage to make the banner disappear (FR-040b).

---

## Rollback

### Soft rollback — disable the feature

Flip the flag OFF for the workspace:

```bash
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_patch(feature_flags, json_object('FEATURE_AREA_LABEL_ROUTING', json('false')))
WHERE id = $WORKSPACE_ID;
SQL
```

Effect:

- Inbound stops parsing `area:*` labels.
- Outbound stops emitting `area:*` labels.
- Poller falls back to the per-project query (no `is_repo_sync_owner` filter).
- No `area_routing_*` activities are written.
- `area_label_routing_backfill_completed_at` remains set; if you re-enable the flag later, the backfill does NOT re-run. To force a fresh backfill, manually clear the marker:
  ```sql
  UPDATE workspaces
  SET feature_flags = json_remove(feature_flags, '$.area_label_routing_backfill_completed_at')
  WHERE id = $WORKSPACE_ID;
  ```

### Hard rollback — drop the schema

Apply `docs/migrations/rollback-M62.sql` (or `rollback-M63.sql`) per the rollback procedure documented at `docs/migrations/rollback-procedure.md`. This drops:

- All four new columns (`projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`).
- All four new indexes.

The legacy unique constraint `(workspace_id, github_repo, github_issue_number)` and all unrelated columns are untouched. The schema returns to a state functionally equivalent to the pre-SPEC-006 baseline (SC-009).

---

## Common questions

**Q: I enabled the flag but no labels appeared on the GitHub repo.**
A: Check the activity log for a recent `kind='label_provisioning_failed'` row; GitHub rate-limits and 4xx errors are caught and recorded but do not abort the sync. The function retries on the next explicit trigger (connect, area_slug change, or first-flag-on bootstrap; FR-027).

**Q: An existing task moved to a different project after I changed the GitHub label. Is that expected?**
A: No — once a task is created, subsequent label changes do NOT move it (FR-015, US4-AC2). If you see this, file a bug. To re-route manually, edit the task's project from the task detail UI.

**Q: I cleared `area_label_routing_backfill_completed_at` and re-ran sync. The backfill ran again. Is that safe?**
A: Yes — that is the supported recovery path. Each task's per-task transaction is idempotent: `area_routing_backfilled_at` is updated to the new timestamp, and one new `area_routing_*` activity is written with `source='backfill'`.

**Q: I deleted the project that held `is_repo_sync_owner=1`. Polling stopped. What now?**
A: This is documented out-of-scope behavior (Article XII; design concept Q-Open-4). The operator preflight (FR-046) lists this as a self-check. Designate a new owner via the project settings panel (`is_repo_sync_owner=true` on the chosen project; the partial unique index permits zero owners during the transient handoff).
