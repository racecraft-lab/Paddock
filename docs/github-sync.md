# GitHub Sync

Paddock syncs tasks bidirectionally with GitHub Issues. The legacy
flow is per-project: each project with `github_repo` set polls and pushes
its own issues. SPEC-006 (`FEATURE_AREA_LABEL_ROUTING`) layers a workspace-aware
routing model on top — one elected sync owner per `(workspace_id,
github_repo)` polls the repo, ingests issues, routes them by `area:*` label
into department projects, and falls back to a designated triage project
when routing is ambiguous.

This document covers both flows. Behavior under flag-OFF is byte-identical
to pre-SPEC-006 (FR-002).

## Connect / Disconnect

Connecting a repo writes `projects.github_repo` and triggers
`initializeLabels(repo, workspaceId, { trigger: 'connect' })` (FR-039,
FR-063). The connect handler at `POST /api/github` is unchanged in shape;
only the internal label-init call carries workspace context.

Disconnecting clears `github_repo` (and downgrades any owner flag for that
project). Existing tasks retain their `github_issue_number` for audit but
stop polling.

## Label Initialization

`initializeLabels(repo, workspaceId?, { trigger? })` (FR-025) provisions:

- `pd:*` status labels (legacy, always)
- `priority:*` labels (legacy, always)
- `area:*` labels (NEW, when flag ON for the workspace) — derived from
  `AREA_LABEL_MAP` plus any non-NULL `projects.area_slug` values via
  `areaLabelsForWorkspace(db, workspaceId)` (FR-030..FR-032)

Idempotent — existing labels with different color/description are NOT
modified (FR-026). Per-label failures are isolated: aggregated into one
`label_provisioning_failed` activity with a 24-hour throttle window
(FR-027), with per-label `event='label_provisioning_failed'` structured
logs emitted unconditionally (FR-027b).

Triggers:

- `'connect'` — repo is connected via the API
- `'area_slug_change'` — operator changed `area_slug` or
  `is_triage_project` on a project (post-PUT, FR-038/FR-060)
- `'bootstrap'` — first sync poll after `FEATURE_AREA_LABEL_ROUTING`
  transitions OFF → ON for a workspace (FR-019)

## Polling

### Per-project polling (flag OFF, legacy)

Every project with `github_sync_enabled=1 AND github_repo IS NOT NULL`
polls its repo. Two projects sharing one repo issue two API calls per
cycle. This is the pre-SPEC-006 baseline (FR-002, FR-018 OFF branch).

### Owner-based polling (flag ON)

For each `(workspace_id, github_repo)` group, exactly one project is
elected sync owner via `is_repo_sync_owner=1`. The poller filters
candidates with `is_repo_sync_owner=1`, so two projects sharing a repo
produce one API call per cycle (SC-002). The partial unique index
`idx_projects_one_sync_owner_per_repo` enforces uniqueness at the SQL
layer (FR-004).

Per-row flag resolution (`resolveFlag(name, { workspaceId })`, FR-052)
means a single poller cycle can process flag-ON and flag-OFF workspaces
side-by-side without cross-talk.

## Inbound Issue Handling

For each polled issue, the engine:

1. Dedupes by `(workspace_id, github_repo, github_issue_number)` (FR-008).
2. On NEW issues only, applies area-routing per the cache loaded once per
   `pullFromGitHub` call (FR-009). Five resolution paths (FR-010..FR-014):
   - `single_match` — exactly one `area:*` label and one project with
     matching `area_slug` → route to that project
   - `no_label` — no `area:*` labels → triage project
   - `multi_label` — multiple `area:*` labels → triage project
   - `no_match` — `area:*` label with no matching `area_slug` → triage
     project
   - `no_triage` — ambiguous AND no triage project designated → sync-owner
     fallback
3. Writes one `area_routing_resolved` or `area_routing_unresolved`
   activity (FR-042..FR-044) with `source='ingest'`.
4. Subsequent label changes on the SAME issue do NOT re-route the task
   (FR-015 no-thrash).

Triage authority is the `is_triage_project=1` flag — a non-triage project
with `area_slug='triage'` resolves `area:triage`-labeled issues as
`single_match`, NOT as the triage destination (FR-014).

## Outbound Task Push

When pushing a task to GitHub via `pushTaskToGitHub`, the outbound label
set is:

- Always: `pd:<status>`, `priority:<priority>`
- When flag ON AND `projects.area_slug` is non-NULL: append
  `area:<area_slug>` (FR-016, FR-017)

Flag OFF emits the legacy `pd:*` + `priority:*` set unchanged regardless
of `area_slug` (US1-AC2).

## Sync Owner Election And Transfer

### Election

Migration M63 elects an initial owner deterministically: `MIN(projects.id)`
per `(workspace_id, github_repo)` group with at least one
`github_sync_enabled=1` project (FR-005). Disabled-only groups elect zero
owners.

### Transfer

`PUT /api/projects/[id]` with `is_repo_sync_owner=true` and
`transfer_owner=true` performs an atomic swap inside one
`db.transaction`:

1. Clear current owner (`is_repo_sync_owner=0` for the existing owner)
2. Set new owner (`is_repo_sync_owner=1` for the target project)
3. INSERT `sync_owner_transferred` activity row

The clear-then-set order is REQUIRED — SQLite UNIQUE constraints
(including partial unique indexes) are immediate, not deferrable. A
set-first ordering raises a UNIQUE violation against
`idx_projects_one_sync_owner_per_repo`. UNIQUE-violation races are
translated back to 409 `owner_conflict`, never leaking as 500 (FR-055).

Without `transfer_owner=true`, asserting ownership on a project where
another holds it returns 409 `owner_conflict` with the existing owner
identified (FR-037, US2-AC4).

Idempotent re-assertion (`is_repo_sync_owner=true` on the current owner)
short-circuits with no UPDATE and no activity write (FR-059).

## Triage Project Designation

Exactly one project per workspace may carry `is_triage_project=1`,
enforced by partial unique index `idx_projects_one_triage_per_workspace`
(FR-036). A second-write attempt returns 409 `triage_conflict`. The
project settings modal renders a yellow banner when flag is ON and no
triage project is designated (FR-040b).

## `area_slug` Configuration

`projects.area_slug` is a workspace-scoped slug matching the
RFC 1123 / Kubernetes DNS label regex
`^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` (FR-034, max 32 chars). Uniqueness
is enforced by `PUT /api/projects/[id]` route validation (FR-035). The
`idx_projects_workspace_area_slug` index is a non-unique lookup index for
routing/cache queries, not the collision authority. Collisions return
409 `area_slug_conflict`.

Setting/clearing `area_slug` (or toggling `is_triage_project`) post-PUT
fires `initializeLabels` once per owner-held repo in the workspace with
`trigger='area_slug_change'` (FR-038, FR-060). Owner-only changes
(including `transfer_owner` swaps) do NOT trigger.

## Auto-Backfill On First Flag-On

When `FEATURE_AREA_LABEL_ROUTING` transitions OFF → ON for a workspace
and the backfill completion marker
(`workspaces.feature_flags.area_label_routing_backfill_completed_at`) is
unset, the next sync poll invokes `backfillAreaRouting(workspaceId)`
exactly once (FR-019, FR-022). Each existing GitHub-synced task is
re-evaluated against its stored `github_labels`, routed via the same
five-path resolution (FR-011..FR-014), and gets
`area_routing_backfilled_at` set inside a per-task transaction
(FR-020/FR-021). Activity rows carry `source='backfill'`.

The marker is set only after the SELECT predicate
`WHERE workspace_id=? AND github_issue_number IS NOT NULL AND
area_routing_backfilled_at IS NULL` returns zero rows (FR-022). Resumable
via the partial index `idx_tasks_area_routing_backfill_pending` — a
process kill mid-run scans only the remaining tasks on resume (FR-023).

`area_routing_backfilled_at` is monotonic — no production code path
resets it to NULL or decreases its value (FR-021a, FR-056).

## Recovery Procedures

| Scenario | Recovery |
|---|---|
| Wrong project elected as owner | `PUT /api/projects/[id]` with `is_repo_sync_owner=true, transfer_owner=true` |
| Stale `area_routing_backfilled_at` (rare) | None — markers are monotonic; re-disable + re-enable does NOT re-backfill (FR-022 marker is per-workspace, not per-flag-toggle) |
| Mis-routed task | Manually move via task PATCH; subsequent label changes will not re-route (FR-015) |
| Triage project missing | Set `is_triage_project=true` on the intended project; UI banner auto-hides (FR-040b) |
| Per-label provisioning failure | Inspect `activities WHERE type='label_provisioning_failed'`; correct repo permissions; re-trigger via `area_slug` re-edit |

## Rollback

Flag OFF is the rollback path. With `FEATURE_AREA_LABEL_ROUTING` cleared
or set to `0`:

- Polling reverts to per-project (FR-002, FR-018 OFF)
- Outbound pushes drop `area:*` labels (FR-017 OFF)
- Inbound issues land in the project that owns the repo (legacy)
- `area_slug`, `is_triage_project`, `is_repo_sync_owner` columns remain
  populated but are IGNORED by all sync code paths
- Migration M63 columns / indexes are retained — `docs/migrations/rollback-M63.sql`
  is provided for the (rare) full rollback case

## Operator Preflight Checklist

Before enabling `FEATURE_AREA_LABEL_ROUTING` for a workspace, confirm:

- At least one project has `area_slug` set (otherwise no inbound routing
  can resolve `single_match`)
- Exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)`
  group (M63 election handles this, but verify if projects were added
  post-migration)
- A triage project is designated if ambiguous-issue routing is expected
  (otherwise `no_triage` fallback routes to the sync owner)

See `docs/feature-flags-runbook.md` for the full preflight UI flow.
