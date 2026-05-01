# Feature Specification: Area-Label GitHub Sync

**Feature Branch**: `006-area-label-github-sync`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "SPEC-006 — RC Factory Phase 5 — area:* label routing and repo-level sync ownership for GitHub-synced product-line monorepos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag-OFF parity is preserved (Priority: P1)

An existing operator has Mission Control workspaces using project-level GitHub sync today (one project per repo). After the area-label routing capability is shipped but before the operator opts in by enabling the workspace-level feature flag, every observable behavior of GitHub sync — inbound issue ingestion, outbound task push, label initialization on connect, polling cadence, and activity log shape — remains byte-identical to the prior release.

**Why this priority**: Existing single-project-per-repo deployments are the production baseline. A regression in flag-OFF behavior would break every currently-deployed Mission Control instance, regardless of whether the operator wants area routing. This is the safety floor for the entire feature.

**Independent Test**: Run the full GitHub sync e2e suite against a workspace where `FEATURE_AREA_LABEL_ROUTING` is not set in `workspaces.feature_flags`. Assert that the sync engine emits the same outbound labels (`mc:*`, `priority:*` only — no `area:*`), the poller selects projects via the existing per-project query (no `is_repo_sync_owner` filter applied), `initializeLabels` creates only the existing label set, and no `area_routing_resolved` or `area_routing_unresolved` activities are written. Capture before/after snapshot of poller selection SQL and label set used.

**Acceptance Scenarios**:

1. **Given** a workspace with `FEATURE_AREA_LABEL_ROUTING` unset and a project with `github_sync_enabled=1`, **When** the poller runs, **Then** the poller selects the project using the legacy per-project query without referencing `is_repo_sync_owner`, and inbound issues are routed to that project regardless of any `area:*` labels on the issue.
2. **Given** the same flag-OFF workspace and a task in a project, **When** `pushTaskToGitHub` runs, **Then** the outbound label set on the GitHub issue contains only the existing `mc:*` and `priority:*` labels — no `area:*` label is emitted even if the project has `area_slug` set.
3. **Given** the flag-OFF workspace and a freshly-connected GitHub repo, **When** `initializeLabels(repo)` is invoked from the connect handler, **Then** only the legacy label set is created on the repo and no `area:*` labels are touched.
4. **Given** the flag-OFF workspace, **When** any sync activity occurs, **Then** the activity log contains no rows with `kind='area_routing_resolved'` or `kind='area_routing_unresolved'`.

---

### User Story 2 - Single owner polls a shared monorepo (Priority: P1)

A product-line operator has a monorepo (for example, `racecraft/product-line-a`) that serves four department kanbans (Dev, QA, Infra, Docs) via four projects in the same workspace. With the feature flag enabled, exactly one of those four projects is elected to poll the repo. The other three projects are visible recipients of routed tasks but never independently call the GitHub API for that repo. Polling duplicate-ingest collisions disappear.

**Why this priority**: The duplicate-ingest collision is the primary production failure that motivates this spec. Without single-owner election, two projects sharing a repo race to ingest each issue and the unique constraint on `(workspace_id, github_repo, github_issue_number)` produces unpredictable ownership. P1 because it is the foundation that area routing depends on.

**Independent Test**: Set up a workspace with two projects sharing `github_repo='org/repo'`, both with `github_sync_enabled=1`. Enable the flag for the workspace. Run the poller and assert that exactly one project (the one with `is_repo_sync_owner=1`) issues GitHub API calls for the repo, while the other project issues none. Assert that newly-ingested issues land in the resolved area project (or triage), not the polling owner by default.

**Acceptance Scenarios**:

1. **Given** two projects A and B in the same workspace with the same `github_repo`, both with `github_sync_enabled=1`, and the feature flag enabled, **When** migration M62 runs, **Then** exactly one of A or B has `is_repo_sync_owner=1` (the one with the lower `projects.id`) and the other has `is_repo_sync_owner=0`.
2. **Given** the elected sync-owner project, **When** the poller runs, **Then** only the sync-owner project's row is selected for repo-level polling and only one GitHub API request per polling cycle is issued for that `(workspace_id, github_repo)`.
3. **Given** an operator wishes to transfer ownership from project A to project B, **When** they submit a project update with `is_repo_sync_owner=true` and `transfer_owner=true`, **Then** the transfer succeeds atomically — A is cleared and B is set in the same transaction — and subsequent polls use B as the owner.
4. **Given** an operator submits `is_repo_sync_owner=true` for project B without `transfer_owner=true` while project A holds ownership, **When** the request is validated, **Then** the system returns a 409 Conflict response identifying project A as the existing owner and the database state is unchanged.

---

### User Story 3 - Triage project absorbs ambiguous issues (Priority: P1)

An issue triager has designated one project per workspace as the triage project (`is_triage_project=1`). When a GitHub issue arrives with no `area:*` label, multiple `area:*` labels, or a single `area:*` label that does not match any project's `area_slug` in the workspace, the issue is routed to the triage project rather than silently landing in whichever project polled first. Each routing decision is recorded in the activity log with an explicit reason code so the triager can audit how each issue ended up where it did.

**Why this priority**: Without an explicit triage destination, ambiguous issues get assigned to the polling owner by accident, creating a silent data-quality problem that the operator may not notice until a department lead asks why their kanban is full of irrelevant issues. P1 because it makes ambiguous routing observable and recoverable.

**Independent Test**: Create a workspace with three area projects (`area_slug='qa'`, `'dev'`, `'docs'`) and one triage project (`is_triage_project=1`). Inject GitHub issues into the mocked client with each ambiguity case (no label, two labels, unknown label) and run the inbound sync. Assert each issue lands in the triage project and an `area_routing_unresolved` activity is written with the correct `reason` code (`no_label`, `multi_label`, `no_match`).

**Acceptance Scenarios**:

1. **Given** a workspace with a triage project and an issue with no `area:*` label, **When** the issue is ingested for the first time, **Then** the resulting task's `project_id` is the triage project and an `area_routing_unresolved` activity is written with `reason='no_label'`, `area_labels=[]`, and `source='ingest'`.
2. **Given** the same workspace and an issue with `area:qa` and `area:dev` both applied, **When** the issue is ingested, **Then** the task's `project_id` is the triage project and an activity is written with `reason='multi_label'` and `area_labels=['qa','dev']` (lowercased, prefix-stripped).
3. **Given** the same workspace and an issue with a single `area:marketing` label where no project has `area_slug='marketing'`, **When** the issue is ingested, **Then** the task's `project_id` is the triage project and an activity is written with `reason='no_match'` and `area_labels=['marketing']`.
4. **Given** a workspace with the flag enabled but no `is_triage_project=1` project, **When** an ambiguous issue is ingested, **Then** the task is routed to the sync-owner project as a fallback and an `area_routing_unresolved` activity is written with `reason='no_triage'` so the operator can see the missing-triage state.

---

### User Story 4 - Department issues route on initial ingest only, no thrash (Priority: P1)

A department lead labels a GitHub issue with `area:qa`. The corresponding project in Mission Control has `area_slug='qa'`. On first ingest, the resulting task's `project_id` is set to the QA project and an `area_routing_resolved` activity is recorded. If the issue's labels later change on GitHub — for example, someone adds `area:dev` or removes `area:qa` — the existing task does not move between projects. Operators who want to re-assign manually can do so via the task detail UI.

**Why this priority**: Re-routing on every label edit would create a thrashing experience where tasks visibly bounce between department kanbans whenever GitHub labels are tweaked. P1 because the no-thrash guarantee is a documented acceptance criterion (P5-AC5) and is what makes area routing predictable for department leads.

**Independent Test**: Ingest an issue with `area:qa`. Assert the task lands in the QA project. Modify the issue's labels in the mocked GitHub client to remove `area:qa` and add `area:dev`. Re-run sync. Assert the task remains in the QA project and no new `area_routing_*` activity is written for the existing task.

**Acceptance Scenarios**:

1. **Given** a workspace with a QA project (`area_slug='qa'`) and an issue with the single label `area:qa`, **When** the issue is ingested for the first time (no existing task for `(workspace_id, github_repo, github_issue_number)`), **Then** the task is created with `project_id` equal to the QA project's id and an `area_routing_resolved` activity is written with `reason='single_match'` and `source='ingest'`.
2. **Given** the same task already exists in the QA project from a prior sync, **When** a subsequent sync runs and the GitHub issue's labels now include `area:dev` instead of `area:qa`, **Then** the task's `project_id` remains the QA project, no new `area_routing_*` activity is written for that task, and the issue's title/body/labels metadata is updated as usual.
3. **Given** the same QA-resolved task, **When** the GitHub issue's labels are removed entirely, **Then** the task's `project_id` remains the QA project on subsequent syncs.
4. **Given** a workspace with the flag enabled, **When** `pushTaskToGitHub` runs for a task in a project with `area_slug='qa'`, **Then** the outbound label set on the GitHub issue includes `area:qa` alongside the existing `mc:*` and `priority:*` labels.
5. **Given** a workspace with the flag enabled, **When** `pushTaskToGitHub` runs for a task in a project with `area_slug` unset (NULL), **Then** the outbound label set contains no `area:*` label.

---

### User Story 5 - First-time enable backfills existing tasks (Priority: P2)

A workspace operator enables `FEATURE_AREA_LABEL_ROUTING` for a workspace whose monorepo has been syncing under the legacy per-project model for months. On the first sync poll after the flag is enabled, the system re-evaluates every existing GitHub-synced task in the workspace, parses each task's stored GitHub labels, and routes the task to the correct area project (or triage). Each task move is recorded in the activity log with `source='backfill'`. The backfill is idempotent — if interrupted (process killed, error) and re-attempted, already-evaluated tasks are skipped — and a completion marker is set on the workspace's `feature_flags` JSON when the run finishes so subsequent flag toggles do not re-run it.

**Why this priority**: Without auto-backfill, an operator enabling the flag must manually re-assign every existing task by hand or accept a permanent split between legacy and post-flag tasks. P2 because the manual workaround exists (operator can re-assign via task UI), but the experience is dramatically better with automatic backfill on first enable.

**Independent Test**: Seed a workspace with 50 GitHub-synced tasks in a single legacy project, with mixed `area:*` labels stored in `tasks.github_labels`. Enable the flag. Trigger a sync poll. Assert the backfill ran exactly once: tasks with `area:qa` moved to the QA project, multi-label tasks moved to triage with `reason='multi_label'`, no-label tasks moved to triage with `reason='no_label'`, and the completion marker `area_label_routing_backfill_completed_at` is set on the workspace. Trigger a second sync poll and assert the backfill did not run again.

**Acceptance Scenarios**:

1. **Given** a workspace with N existing GitHub-synced tasks in a legacy project and the flag freshly enabled, **When** the first sync poll for that workspace runs, **Then** `backfillAreaRouting` is invoked once, each task's `project_id` is updated according to its stored labels, and an `area_routing_resolved` or `area_routing_unresolved` activity with `source='backfill'` is recorded per task.
2. **Given** the backfill completes successfully, **When** the next sync poll runs, **Then** the backfill is not re-invoked because `workspaces.feature_flags.area_label_routing_backfill_completed_at` is set.
3. **Given** the backfill is interrupted partway through (for example, a single task transaction fails or the process is killed), **When** sync runs again, **Then** the failed/unprocessed tasks are re-evaluated using the resume mechanism without re-processing already-completed tasks, and the completion marker is set only after the resumed run finishes.
4. **Given** a single task fails during backfill (database error, malformed label data), **When** the next task is processed, **Then** the failure is caught and counted, the run continues, and the failure does not abort the backfill.
5. **Given** the backfill is running, **When** each task is processed, **Then** the SELECT, label resolution, UPDATE, and activity INSERT for that task are wrapped in their own transaction so a failure on one task does not corrupt another.

---

### User Story 6 - Operators can configure routing via existing surfaces (Priority: P2)

An operator visits the project settings panel for an existing project in the Mission Control UI and sees three new optional fields: an `area_slug` text input with format guidance and inline validation, an `is_triage_project` checkbox, and an `is_repo_sync_owner` checkbox. The operator sets `area_slug='qa'`, saves, and the system validates the slug format (`^[a-z0-9-]{1,32}$`) and uniqueness within the workspace. If a collision exists (another project already has `area_slug='qa'`, or another project already holds `is_triage_project=1` or `is_repo_sync_owner=1` for the same repo), the form surfaces an inline 409 error message identifying the conflicting project and offers a transfer flow for sync-owner conflicts. On successful save, label initialization runs for affected repos so the new `area:*` label is created on GitHub.

**Why this priority**: Operators need a way to configure the new fields. P2 because the underlying API is independently usable, but operator adoption requires a UI affordance — without it, operators would need to use direct API calls to configure routing.

**Independent Test**: Open the project settings panel in the Playwright browser journey. Set `area_slug='qa'` on project A and save successfully. On project B in the same workspace, attempt to set `area_slug='qa'` and assert the inline 409 error mentions project A by name. Set `is_triage_project=true` on project A and save. On project B, attempt to set `is_triage_project=true` and assert the inline 409 error names project A. Attempt to set `is_repo_sync_owner=true` on project B without `transfer_owner=true` and assert the inline error offers a transfer-owner action.

**Acceptance Scenarios**:

1. **Given** the project settings panel for project A, **When** the operator types `Q A!` (invalid characters) into the `area_slug` field and submits, **Then** the form rejects the value with inline validation feedback indicating the allowed pattern, no API call is made, and the database is unchanged.
2. **Given** project A already has `area_slug='qa'` in workspace W, **When** the operator submits a project update for project B in workspace W with `area_slug='qa'`, **Then** the API returns 409 Conflict identifying project A as the conflicting project and the form displays the conflict inline.
3. **Given** project A has `is_triage_project=1` in workspace W, **When** the operator submits a project update for project B in workspace W with `is_triage_project=true`, **Then** the API returns 409 Conflict identifying project A as the existing triage project.
4. **Given** project A has `is_repo_sync_owner=1` for `(workspace_id=W, github_repo=R)`, **When** the operator submits a project update for project B (also in workspace W with `github_repo=R`) with `is_repo_sync_owner=true` but without `transfer_owner=true`, **Then** the API returns 409 Conflict identifying project A as the current owner.
5. **Given** the same conflict, **When** the operator submits the request with both `is_repo_sync_owner=true` and `transfer_owner=true`, **Then** the API performs an atomic swap (clear A, set B) within a single transaction and returns success.
6. **Given** an operator changes `area_slug` from NULL to `'qa'` on a project, **When** the request succeeds, **Then** `initializeLabels(repo, workspaceId)` is invoked for every repo owned by `is_repo_sync_owner=1` projects in that workspace so the `area:qa` label is created on GitHub if not already present.

---

### User Story 7 - Migration is additive, reversible, and label-init failures do not abort sync (Priority: P2)

A security and rollout reviewer inspects the migration that ships SPEC-006 and confirms three properties before approving the rollout: every column added is nullable (no NOT NULL clauses, no destructive ALTERs); a `rollback-M62.sql` (or matching migration id) exists alongside the migration body and drops the new columns and indexes; and label-provisioning failures during `initializeLabels` (GitHub rate-limit, network error, 4xx response) are caught per-label, logged, and do not abort the larger sync run.

**Why this priority**: P2 because the operational and rollback story is what gates production deployment of any feature-flagged migration. Without an explicit rollback path and proven failure isolation in label provisioning, a single GitHub rate-limit hiccup could halt the entire sync engine for a workspace.

**Independent Test**: Run the migration on an empty database and on a populated database. Assert all three new columns (`area_slug`, `is_triage_project`, `is_repo_sync_owner`) accept NULL. Apply the rollback SQL and assert all three columns and the three indexes are removed cleanly. Inject a 429 Too Many Requests response into the mocked GitHub client during `initializeLabels`. Assert the function logs the rate-limit, continues to the next label, and returns successfully even if some labels were skipped. Assert no exception bubbles up to the caller.

**Acceptance Scenarios**:

1. **Given** the migration body, **When** it runs on an empty database, **Then** the three new columns and three new indexes are created and no NOT NULL constraint is added to any new column.
2. **Given** the migration body, **When** it runs on a populated database with multiple workspaces and projects, **Then** for each `(workspace_id, github_repo)` group with one or more projects with `github_sync_enabled=1`, exactly one project (the one with the lowest `projects.id`) ends up with `is_repo_sync_owner=1` and the rest with `is_repo_sync_owner=0`.
3. **Given** the rollback SQL committed alongside the migration, **When** it runs on a database with the migration applied, **Then** the three columns and three indexes are dropped and existing data in unrelated columns is preserved.
4. **Given** a workspace with five area projects each contributing a unique `area_slug`, **When** `initializeLabels(repo, workspaceId)` runs and the mocked GitHub client returns 429 for two of the labels and success for three, **Then** the function logs the two rate-limit failures, completes successfully for the three labels that succeeded, and returns without throwing.
4. **Given** the same scenario, **When** the sync poller continues after `initializeLabels`, **Then** the inbound poll, area routing, and outbound push proceed normally — the label-provisioning partial failure does not block the rest of the sync run.

---

### Edge Cases

- **Existing tasks during backfill use stored labels, not a fresh GitHub fetch**: backfill resolves `area:*` from each task's stored `tasks.github_labels` data — it does not call GitHub. Operators who want fresh-from-GitHub re-evaluation must trigger a manual sync first.
- **Empty `area:*` value (`area:`) on a GitHub issue**: an empty value after the colon is treated as no `area:*` label (skipped during parsing); routing falls into the `no_label` path if there are no other `area:*` labels.
- **Case sensitivity**: `area:QA` and `area:qa` resolve identically — the parser lowercases after stripping the `area:` prefix before lookup.
- **Workspace has no projects with `area_slug` set but flag is ON**: every issue routes to triage (or sync-owner fallback). The configuration is valid but trivial; the activity log clearly shows `reason='no_match'` or `reason='no_label'` for every issue.
- **Sync owner project is deleted**: out of scope for this spec — operator must explicitly re-assign sync ownership before sync resumes for that repo. (Captured as a deferred follow-up in design concept Q4.)
- **Operator clears the backfill completion marker manually**: re-running the flag-on path triggers a fresh backfill that reprocesses every task. Documented as the supported recovery path for operators who need a re-evaluation pass.
- **`area_slug` collides with a static `AREA_LABEL_MAP` entry**: the dynamic value wins for label-emission purposes when the project sets it, but the static map's color/description is used for label provisioning if the project's slug exactly matches a static entry's name. No collision error.
- **Migration id collision with SPEC-004**: if SPEC-004 ships first as M62, this spec uses M63 (or next available); the migration body is unchanged. Reconciled at rebase time, not at spec time.
- **Subsequent sync of an existing task encounters an `area:*` label change**: the task remains in its current project; no activity row is written. Operators who want to re-route after a label change must do so manually via task detail UI.
- **Per-task transaction failure during backfill**: the failure is logged, counted, and the next task is processed. If the same task fails on retry, it is skipped on subsequent runs unless the resume mechanism explicitly retries failed tasks (resolved in Clarify session 1).

## Requirements *(mandatory)*

### Functional Requirements

#### Feature flag and gating

- **FR-001**: Workspace runtime behavior MUST gate every new code path through `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })`. The system MUST NOT introduce any inline `process.env.FEATURE_AREA_LABEL_ROUTING` reads in production code paths.
- **FR-002**: When `resolveFlag` returns false for a workspace, all GitHub sync behavior — poller selection, inbound ingestion, outbound push, label initialization, and activity log shape — MUST be byte-identical to the pre-SPEC-006 baseline. No `area:*` labels are emitted on push, no `area_routing_*` activities are written, and the poller does not filter by `is_repo_sync_owner`.

#### Schema and migration

- **FR-003**: A migration (M62 or next available, reconciled with SPEC-004 at rebase time) MUST add three nullable columns to `projects`: `area_slug TEXT NULL`, `is_triage_project BOOLEAN DEFAULT 0`, and `is_repo_sync_owner BOOLEAN DEFAULT 0`. No NOT NULL constraint MUST be added to any new column.
- **FR-004**: The migration MUST create three indexes: a non-unique index `idx_projects_workspace_area_slug` on `(workspace_id, area_slug)`, a partial unique index `idx_projects_one_sync_owner_per_repo` on `(workspace_id, github_repo) WHERE is_repo_sync_owner=1`, and a partial unique index `idx_projects_one_triage_per_workspace` on `(workspace_id) WHERE is_triage_project=1`.
- **FR-005**: The migration MUST backfill `is_repo_sync_owner=1` for the project with `MIN(projects.id)` per `(workspace_id, github_repo)` group where `github_sync_enabled=1`, leaving all other projects in the group at `is_repo_sync_owner=0`.
- **FR-006**: A `docs/migrations/rollback-M62.sql` (or matching migration id) MUST be committed alongside the migration. The rollback MUST drop the three new columns and three new indexes and MUST NOT alter existing data in unrelated columns.
- **FR-007**: Migration ordering with SPEC-004 MUST be reconciled at rebase time. If SPEC-004 ships first under M62, this feature MUST use the next available migration id (M63 or higher). The migration body and behavior MUST be unchanged regardless of final id.
- **FR-008**: The legacy unique constraint `(workspace_id, github_repo, github_issue_number)` MUST remain in place. SPEC-006 MUST NOT alter or remove it.

#### Inbound area routing

- **FR-009**: For each `pullFromGitHub` invocation in a flag-ON workspace, the system MUST build an in-memory routing cache once per call: a map from non-NULL `area_slug` to `project_id` and a single `triageProjectId` (or null) for the workspace.
- **FR-010**: For each ingested issue in a flag-ON workspace, the system MUST parse `area:*` labels by lowercasing and stripping the `area:` prefix, ignoring empty values (`area:` alone), and produce an `area_labels: string[]` for routing decisions and activity logs.
- **FR-011**: When an issue has exactly one `area:*` label that matches a project's `area_slug` in the workspace, the system MUST resolve the routing decision as `single_match` and assign the resulting task's `project_id` to that project on first ingest.
- **FR-012**: When an issue has zero `area:*` labels, the system MUST resolve the routing decision as `no_label` and route the task to the triage project, falling back to the sync-owner project with `reason='no_triage'` if no triage project is designated.
- **FR-013**: When an issue has more than one `area:*` label (regardless of whether each individually matches a project), the system MUST resolve the routing decision as `multi_label` and route the task to the triage project, with the same sync-owner fallback if absent.
- **FR-014**: When an issue has exactly one `area:*` label that does not match any project's `area_slug` in the workspace, the system MUST resolve the routing decision as `no_match` and route the task to the triage project, with the same sync-owner fallback if absent.
- **FR-015**: Routing assignment MUST happen on first ingest only, identified by the absence of an existing task row for `(workspace_id, github_repo, github_issue_number)`. On subsequent syncs of an existing task, the system MUST NOT change `task.project_id` regardless of GitHub label changes, and MUST NOT write a new `area_routing_*` activity for that task.

#### Outbound area emission

- **FR-016**: When `pushTaskToGitHub` runs for a flag-ON workspace and the resolved project has a non-NULL `area_slug`, the outbound label set on the GitHub issue MUST include `area:<projects.area_slug>` alongside the existing `mc:*` and `priority:*` labels.
- **FR-017**: When the resolved project has NULL `area_slug` (or the flag is OFF), the outbound label set MUST NOT include any `area:*` label.

#### Sync ownership and polling

- **FR-018**: When `resolveFlag` returns true for a workspace, the GitHub sync poller MUST select only projects with `is_repo_sync_owner=1` for that workspace. When the flag is false, the poller's existing per-project selection MUST be unchanged.
- **FR-019**: The poller MUST perform a one-shot per-workspace bootstrap on first flag-on for a workspace. The bootstrap MUST: (a) invoke `initializeLabels(repo, workspaceId)` for each repo owned by an `is_repo_sync_owner=1` project, and (b) invoke `backfillAreaRouting(workspaceId)` if `workspaces.feature_flags.area_label_routing_backfill_completed_at` is unset.

#### Backfill

- **FR-020**: `backfillAreaRouting(workspaceId)` MUST iterate over tasks with `workspace_id=? AND github_issue_number IS NOT NULL` for repos owned by `is_repo_sync_owner=1` projects in the workspace, parse each task's stored GitHub labels, and re-evaluate routing using the same rules as inbound (FR-011 through FR-014).
- **FR-021**: Each task processed by the backfill MUST be wrapped in its own transaction: SELECT, label resolution, UPDATE `tasks.project_id`, INSERT activity row, COMMIT. A failure on one task MUST be caught, logged, and counted without aborting the run.
- **FR-022**: The backfill MUST set the completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` only after processing all eligible tasks. Subsequent flag-on triggers MUST skip the backfill if the marker is set.
- **FR-023**: The backfill MUST be resumable after interruption. Already-evaluated tasks MUST be skipped on a resumed run via the resume mechanism (the choice between a `tasks.area_routing_backfilled_at TIMESTAMP NULL` column and an activity-log lookup is deferred to the Clarify phase, recorded as Clarify session 1).
- **FR-024**: Activities written by the backfill MUST set `data.source='backfill'` (versus `source='ingest'` for inbound activities).

#### Label provisioning

- **FR-025**: `initializeLabels(repo, workspaceId?)` MUST accept an optional `workspaceId` argument. When provided, it MUST fetch the union of static `AREA_LABEL_MAP` defaults and `LabelDef`s synthesized from non-NULL `projects.area_slug` values in the workspace not already covered by the static map, and call the GitHub create-label API for each label not already present on the repo.
- **FR-026**: `initializeLabels` MUST NOT modify existing labels on the repo whose color or description differs from the desired definition. Existing labels are left untouched.
- **FR-027**: GitHub API failures during `initializeLabels` (rate-limit, 4xx, network errors) MUST be caught per-label, logged, and not abort either the function itself or the larger sync run that called it. The function MUST return successfully even on partial failure.
- **FR-028**: `initializeLabels(repo, workspaceId)` MUST be invoked at three trigger points: (a) when a workspace's repo is connected via `POST /api/github`, (b) when `area_slug` or `is_triage_project` transitions to a new value via `PUT /api/projects/[id]`, and (c) once on the first sync poll after flag-on per workspace as part of the bootstrap (FR-019).
- **FR-029**: After the initial bootstrap, subsequent polls MUST NOT re-run `initializeLabels`. Re-runs occur only on the explicit triggers in FR-028.

#### Label map source of truth

- **FR-030**: A static `AREA_LABEL_MAP: Record<string, LabelDef>` MUST be defined in `src/lib/github-label-map.ts` covering curated default area names. The exact contents (recommended set: `qa`, `dev`, `design`, `infra`, `security`, `docs`, `ops`, `frontend`, `backend`, `data`, `ml`, `triage`) MUST be reconciled in Clarify session 1. Each entry MUST have a stable name, color, and description; a snapshot test MUST guard accidental drift.
- **FR-031**: A function `areaLabelsForWorkspace(db, workspaceId): LabelDef[]` MUST return the union of `AREA_LABEL_MAP` values plus `LabelDef`s synthesized from non-NULL `projects.area_slug` values for that workspace not already present in the static map.
- **FR-032**: An export `ALL_AREA_LABEL_NAMES: ReadonlySet<string>` MUST cover the static defaults only (parallel to the existing `ALL_STATUS_LABEL_NAMES` export pattern).

#### API surface

- **FR-033**: `PUT /api/projects/[id]` MUST accept four optional fields in the request body: `area_slug`, `is_triage_project`, `is_repo_sync_owner`, and `transfer_owner`. Operator-only authorization MUST remain unchanged.
- **FR-034**: When `area_slug` is non-NULL, it MUST match `^[a-z0-9-]{1,32}$` or the request MUST return 400 Bad Request with a format-error message.
- **FR-035**: `(workspace_id, area_slug)` MUST be unique across non-NULL values. A request that would create a duplicate MUST return 409 Conflict identifying the conflicting project's id.
- **FR-036**: `is_triage_project=1` MUST be exclusive per `workspace_id`. A request that would create a duplicate MUST return 409 Conflict identifying the existing triage project's id.
- **FR-037**: `is_repo_sync_owner=1` MUST be exclusive per `(workspace_id, github_repo)`. A request that would create a duplicate without `transfer_owner=true` MUST return 409 Conflict identifying the existing owner's id. With `transfer_owner=true`, the system MUST perform an atomic swap (clear previous owner, set new owner) in a single transaction.
- **FR-038**: When `area_slug` or `is_triage_project` transitions to a new value via PUT, the system MUST invoke `initializeLabels(repo, workspaceId)` for every repo owned by an `is_repo_sync_owner=1` project in the workspace.
- **FR-039**: `POST /api/github` (the connect handler) MUST pass the resolved `workspaceId` to `initializeLabels` so area labels are created on connect when the flag is ON.

#### UI surface

- **FR-040**: The existing project settings UI panel MUST expose three new optional fields: a text input for `area_slug` with regex format validation feedback, a checkbox for `is_triage_project`, and a checkbox for `is_repo_sync_owner`. No new TSX modules MUST be introduced.
- **FR-041**: When the API returns 409 Conflict for any of the four uniqueness checks (FR-035 through FR-037), the form MUST surface the error inline with a reference to the conflicting project. For sync-owner conflicts, the form MUST offer a transfer-owner action that re-submits with `transfer_owner=true`.

#### Activity log

- **FR-042**: Activities of `kind='area_routing_resolved'` MUST be written for `single_match` resolutions only. Activities of `kind='area_routing_unresolved'` MUST be written for `no_label`, `multi_label`, `no_match`, and `no_triage` reasons.
- **FR-043**: Each activity's `data` field MUST include the following keys: `area_labels: string[]`, `resolved_project_id: number | null`, `reason: 'single_match'|'no_label'|'multi_label'|'no_match'|'no_triage'`, `source: 'ingest'|'backfill'`, `github_issue_number: number`, `workspace_id: number`, and `github_repo: string`.
- **FR-044**: Activities MUST be written on first ingest and during backfill only. Subsequent syncs of an existing task MUST NOT write area-routing activities (per FR-015).

#### Documentation

- **FR-045**: A new `docs/github-sync.md` MUST be added covering: connect/disconnect, label initialization (mc/priority/area), per-project polling vs. owner-based polling, inbound issue handling (dedupe, area routing, triage, no-thrash), outbound task push, sync owner election and transfer, triage project designation, area_slug configuration, auto-backfill on first flag-on, recovery procedures, and rollback (flag OFF; columns retained but ignored).
- **FR-046**: `docs/feature-flags-runbook.md` MUST be updated with a `FEATURE_AREA_LABEL_ROUTING` preflight checklist (verify at least one project has `area_slug` set, verify exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)`, verify triage project designated if expected).
- **FR-047**: If `docs/orchestration.md` contains a project-routing section, it MUST be updated with a pointer to `docs/github-sync.md`.

#### Testing

- **FR-048**: Every P5-AC1 through P5-AC7 acceptance criterion MUST have at least one direct test assertion. Coverage budget at the analyze gate (G7) is one or more direct assertions per AC.
- **FR-049**: Unit tests MUST cover label parsing (mixed `area:*` + `mc:*` + `priority:*`), all four resolution paths, `is_repo_sync_owner` filtering in poller selection, outbound emission with and without `area_slug`, backfill logic with idempotency, and per-sync cache correctness across multiple issues.
- **FR-050**: Integration tests with a mocked GitHub client MUST cover full `pullFromGitHub` cycles with mixed-label issue sets, full `pushTaskToGitHub` cycles for area projects, `initializeLabels` with a workspace context (including partial-failure scenarios), and auto-backfill on first flag-on.
- **FR-051**: A Playwright e2e journey MUST verify the project settings UI exposes the three new fields with regex format validation, surfaces 409 errors inline for all uniqueness conflicts, and supports the transfer-owner flow for sync-owner conflicts.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for SPEC-006 and considers only previously merged specs (SPEC-001, SPEC-002, SPEC-002A, SPEC-003).
- The current target spec (`specs/006-area-label-github-sync/`) is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands; recovery commands use `git show <merge-sha>:specs/<feature>/spec.md` form.
- Generated UI screenshots from the Playwright e2e in FR-051 are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Project**: A Mission Control project owned by a workspace. SPEC-006 adds three optional attributes — `area_slug` (slug used to resolve `area:<slug>` GitHub labels to this project), `is_triage_project` (one per workspace; receives ambiguous issues), and `is_repo_sync_owner` (one per `(workspace_id, github_repo)`; the only project that polls the repo when the flag is ON). All three default to NULL/0 and are operator-managed.
- **Workspace**: An existing Mission Control entity that owns projects. SPEC-006 reads the workspace's `feature_flags JSON` for two keys: `FEATURE_AREA_LABEL_ROUTING` (the gate) and `area_label_routing_backfill_completed_at` (the idempotent completion marker for the one-shot backfill).
- **Task**: A Mission Control task linked to a GitHub issue via `(workspace_id, github_repo, github_issue_number)`. SPEC-006 sets `project_id` based on the area resolution on first ingest only; subsequent syncs do not move the task between projects.
- **Activity**: A Mission Control activity log row. SPEC-006 introduces two new `kind` values (`area_routing_resolved`, `area_routing_unresolved`) and a fixed `data` shape for routing decisions, with `source` distinguishing `ingest` from `backfill`.
- **AREA_LABEL_MAP**: A static map of curated default area-label definitions (name, color, description) shipped in code. Augmented at runtime with workspace-specific `area_slug` values to produce the full label set provisioned on a repo.
- **Routing decision**: A computed value with fields `resolved_project_id: number | null` and `reason: 'single_match'|'no_label'|'multi_label'|'no_match'|'no_triage'`. Drives both the task's `project_id` assignment and the activity row written.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With `FEATURE_AREA_LABEL_ROUTING` unset for every workspace, the GitHub sync e2e suite passes with zero changes from the pre-SPEC-006 baseline (same outbound labels, same poller queries, same activity log shape).
- **SC-002**: For workspaces with two or more projects sharing a `(workspace_id, github_repo)` and the flag enabled, exactly one GitHub API request per polling cycle is issued for that repo (down from N requests, where N is the number of projects sharing the repo).
- **SC-003**: For ingested GitHub issues in a flag-ON workspace, 100 percent of routing decisions produce exactly one of five `reason` codes (`single_match`, `no_label`, `multi_label`, `no_match`, `no_triage`) and a corresponding activity row, observable by a triager via the activity log.
- **SC-004**: An issue ingested with `area:qa` lands in the project with `area_slug='qa'` on first ingest in 100 percent of cases when the flag is enabled and exactly one project in the workspace has `area_slug='qa'`.
- **SC-005**: After an existing task is ingested into a project, subsequent syncs of the same GitHub issue with changed `area:*` labels result in zero `project_id` changes for the task (the no-thrash guarantee).
- **SC-006**: For a workspace newly enabling the flag with N existing GitHub-synced tasks, the auto-backfill processes all N tasks within a single backfill run, sets the completion marker, and writes exactly N `area_routing_*` activities with `source='backfill'`. Re-running the trigger does not re-process tasks.
- **SC-007**: GitHub label-provisioning failures during `initializeLabels` (rate-limit, network, 4xx) caught at a per-label level result in zero aborted sync runs and zero unhandled exceptions bubbling up to the poller. Failed labels are logged and retried on the next explicit trigger (connect, area_slug change, or first-flag-on bootstrap).
- **SC-008**: An operator can configure `area_slug`, `is_triage_project`, and `is_repo_sync_owner` for a project from the existing project settings UI in under 60 seconds without consulting documentation, including responding inline to a 409 collision and (for sync-owner conflicts) confirming a transfer.
- **SC-009**: The migration is fully reversible — applying the migration then applying `rollback-M62.sql` returns the database schema to a state functionally equivalent to the pre-SPEC-006 baseline (no orphan columns, no orphan indexes), validated by schema diff.
- **SC-010**: For a workspace with the flag OFF, the activity log contains zero rows of `kind='area_routing_resolved'` or `kind='area_routing_unresolved'` after a full sync cycle, including the bootstrap that would otherwise apply if the flag were on.

## Assumptions

- Mission Control runs against a SQLite database via `better-sqlite3` and applies migrations in numeric order from `src/lib/migrations.ts`. Existing migration patterns (additive, rerun-safe, rollback SQL committed alongside the migration) are reused.
- Workspace-level feature flags are stored as JSON in `workspaces.feature_flags` (added by SPEC-001) and resolved via `resolveFlag(name, ctx)` (added by SPEC-002). SPEC-006 adds runtime usage but no flag-resolution infrastructure.
- One repo per product-line workspace is the supported topology. Multi-repo product-line workspaces are out of scope for this spec and are deferred to SPEC-009/SPEC-010.
- GitHub sync remains polling-driven (no webhooks). The polling cadence and rate-limit handling configured by the existing sync engine are unchanged by this spec.
- The static `AREA_LABEL_MAP` exact contents and the backfill resume mechanism (per-task timestamp column vs. activity-log lookup) are deferred to Clarify session 1; the spec records the recommended defaults but reserves final selection for the clarify phase.
- The existing project settings UI panel exists and can be extended without a new TSX module. The exact filename is identified during plan-phase artifact mapping.
- The legacy unique constraint `(workspace_id, github_repo, github_issue_number)` enforces inbound dedupe and remains the inbound dedupe guardrail. Backfill changes `tasks.project_id` only; it does not violate this constraint.
- Operator-only authorization (existing) is sufficient for the new PUT fields. No new authorization tier is introduced.
- Re-routing of existing tasks on subsequent GitHub label changes is explicitly out of scope (the no-thrash decision). Operators who need a re-evaluation can clear the backfill completion marker manually.
- Automatic ownership re-election when the sync-owner project is deleted is out of scope; operator must reassign explicitly. Captured as a deferred follow-up.
- Migration id reconciliation with SPEC-004 happens at rebase time. Either spec landing first uses M62; the second uses M63. The migration body is unchanged either way.
