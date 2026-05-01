# Tasks: Area-Label GitHub Sync

**Input**: Design documents from `/specs/006-area-label-github-sync/`
**Prerequisites**: plan.md (✓), spec.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓), quickstart.md (✓)
**Design Concept**: `docs/ai/specs/SPEC-006-design-concept.md` (source of truth for scoping decisions)

**Tests**: REQUIRED. The spec mandates TDD per FR-048..FR-051 and Constitution Article IV. Every implementation task is preceded by its red-phase test task (`[T-RED]`).

**Organization**: Tasks grouped by user story (US1..US7) so each story is independently testable. P5-AC1..P5-AC9 traceability called out per task.

**Strict-scope guardrails** (Article J / plan §Strict Scope):

- NO new TS/TSX modules under `src/`. Every implementation extends an existing file.
  - Backend: `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/github/route.ts`.
  - UI: `src/components/modals/project-manager-modal.tsx` (exact file pinned by tasks).
- NO new `github-area-routing*.ts` module, NO `area-routing-admin-panel*.tsx`, NO `task_templates` table, NO change to legacy `(workspace_id, github_repo, github_issue_number)` unique constraint, NO re-route on subsequent label changes (FR-015).
- Test files under `src/lib/__tests__/` and `tests/e2e/` ARE allowed (per plan §Project Structure note — Playwright specs are test fixtures, not strict-scope production modules).

**Format**: `- [ ] T### [P?] [Story?] Description with file path`

- `[P]` = parallel-safe (different file, no dependency on incomplete tasks)
- `[T-RED]` prefix on test descriptions = red-phase test that MUST be written and FAIL before its paired implementation task is started
- `[Story]` = `[US1]`..`[US7]`; setup/foundational/polish phases have no story label

---

## Phase 1: Setup

**Purpose**: Lock the scope guard and capture pre-migration baseline before any code change.

- [X] T001 Capture pre-migration EXPLAIN QUERY PLAN baseline for the canonical legacy query set (agent-queue selection, task-list filter-by-workspace, task select-by-id, sync-owner-less poller selection — full SQL list pinned inside the test fixture) and write the plans under `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json`. The harness re-runs post-migration in T012; any planner delta fails CI per plan.md regression-safety gates.
- [X] T002 [P] Create the strict-scope guardrail script `scripts/check-strict-scope.sh` that runs `git diff origin/main...HEAD --name-only --diff-filter=A | grep -E '^src/.*\\.(ts|tsx)$'` and fails when output is non-empty (per plan §Strict Scope reviewer guard). Wire it into `pnpm test:all` via `package.json` script `check:strict-scope`. NO new TS/TSX modules MUST be introduced.

**Checkpoint**: Baseline captured, scope guard active.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema delta + label map exports. Every user story depends on this.

**⚠️ CRITICAL**: No US-phase task may begin until Phase 2 is complete.

### Migration M62/M63 (FR-003..FR-008, US7-AC1/2/3)

- [ ] T003 [T-RED] [P] Write failing migration tests in `src/lib/__tests__/migrations-spec006.test.ts` asserting: (a) on empty DB, M62 adds columns `projects.area_slug TEXT NULL`, `projects.is_triage_project INTEGER DEFAULT 0`, `projects.is_repo_sync_owner INTEGER DEFAULT 0`, `tasks.area_routing_backfilled_at INTEGER NULL`; (b) all four target indexes exist (`idx_projects_workspace_area_slug`, `idx_projects_one_sync_owner_per_repo` partial unique on `is_repo_sync_owner=1`, `idx_projects_one_triage_per_workspace` partial unique on `is_triage_project=1`, `idx_tasks_area_routing_backfill_pending` partial on `github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL`); (c) NO NOT NULL on any new column; (d) on a populated DB with two `(workspace_id, github_repo)` groups (one with two `github_sync_enabled=1` projects, one with a mix of enabled and disabled projects), `MIN(projects.id)` per group with at least one enabled project becomes the elected owner, disabled-only groups elect zero owners (FR-005); (e) re-running M62 is idempotent (no UNIQUE violation); (f) legacy `(workspace_id, github_repo, github_issue_number)` unique constraint still present (FR-008). Maps to P5-AC8.
- [ ] T004 [US-foundation] Implement migration M62 in `src/lib/migrations.ts` using `addColumnIfMissing` for the four new columns, `CREATE INDEX IF NOT EXISTS` for the three new non-partial/partial indexes, and the deterministic owner-election UPDATE per data-model.md §3. Must pass T003. Maps to FR-003, FR-004, FR-005, FR-007 (id reconcile note in commit message).
- [ ] T005 [P] [US-foundation] Add `docs/migrations/rollback-M62.sql` dropping the four indexes (in reverse order) and four columns; document the SQLite `DROP COLUMN` rerun caveat at the file head. Append a row for M62 to `docs/migrations/rollback-procedure.md` and mark `M62 (or M63)` row in `docs/migrations/migration-id-reservations.md`. Maps to FR-006, FR-007, US7-AC3, P5-AC8.

### Static area label map (FR-030, FR-031, FR-032)

- [ ] T006 [T-RED] [P] Write failing tests in `src/lib/__tests__/github-label-map.test.ts` (extending the existing file) asserting: (a) `AREA_LABEL_MAP` snapshot covers exactly the 12 names/colors/descriptions in FR-030 (snapshot-pinned to detect drift); (b) `ALL_AREA_LABEL_NAMES` equals `Object.values(AREA_LABEL_MAP).map(l => l.name)` and is identical-shaped to `ALL_STATUS_LABEL_NAMES` / `ALL_PRIORITY_LABEL_NAMES` exports; (c) `areaLabelsForWorkspace(db, workspaceId)` returns the union of `AREA_LABEL_MAP` values plus synthesized `LabelDef`s for non-NULL `projects.area_slug` values not already in the static map. Maps to FR-030..FR-032.
- [ ] T007 [US-foundation] Implement `AREA_LABEL_MAP`, `ALL_AREA_LABEL_NAMES`, and `areaLabelsForWorkspace(db, workspaceId): LabelDef[]` in `src/lib/github-label-map.ts` (extending the existing file — no new module). Must pass T006. Maps to FR-030..FR-032.

**Checkpoint**: Migration applied, indexes present, owner election deterministic, label map exports ready.

---

## Phase 3: User Story 1 — Flag-OFF parity preserved (Priority: P1) 🎯 MVP-blocker

**Goal**: With `FEATURE_AREA_LABEL_ROUTING` unset for every workspace, every observable behavior of GitHub sync is byte-identical to the pre-SPEC-006 baseline.

**Independent Test**: Run the GitHub sync e2e suite against a workspace with the flag unset; assert poller SQL, outbound label set, label initialization, and activity-log shape match the pre-SPEC-006 snapshot.

**Why this priority**: Production safety floor. A regression here breaks every currently deployed Mission Control instance.

### Tests for User Story 1 (TDD red phase)

- [ ] T008 [T-RED] [P] [US1] Write failing flag-OFF poller-selection test in `src/lib/__tests__/github-sync-poller.test.ts` asserting that with `FEATURE_AREA_LABEL_ROUTING` unset, the poller's SELECT statement does NOT reference `is_repo_sync_owner` and selects per-project as today. Maps to FR-002, FR-018 (OFF branch), US1-AC1, P5-AC1.
- [ ] T009 [T-RED] [P] [US1] Write failing flag-OFF outbound-emission test in `src/lib/__tests__/github-sync-engine.test.ts` asserting that `pushTaskToGitHub` for a flag-OFF workspace emits ONLY `mc:*` and `priority:*` labels even when the task's project has `area_slug='qa'` set (no `area:*` label on the outbound). Maps to FR-002, FR-017, US1-AC2.
- [ ] T010 [T-RED] [P] [US1] Write failing flag-OFF `initializeLabels(repo)` (1-arg legacy signature) test in `src/lib/__tests__/github-label-map.test.ts` (or sibling `github-sync-engine.test.ts`) asserting the 1-arg call creates ONLY the legacy `mc:*` and `priority:*` set, no `area:*` labels — independent of any workspace flag state. Then add a second test for the 2-arg call with flag OFF that asserts identical behavior to the 1-arg call. Maps to FR-053, US1-AC3, P5-AC1.
- [ ] T011 [T-RED] [P] [US1] Write failing flag-OFF activity-log shape test in `src/lib/__tests__/github-sync-engine.test.ts` asserting that after a full sync cycle in a flag-OFF workspace, the activity log contains zero rows of `kind='area_routing_resolved'` or `kind='area_routing_unresolved'`. Maps to FR-002, FR-044, US1-AC4, SC-010.
- [ ] T012 [T-RED] [P] [US1] Write failing post-migration EXPLAIN QUERY PLAN regression test in `src/lib/__tests__/explain-query-plan.test.ts` that re-runs the canonical legacy query set after M62 and asserts none of the four new indexes appears in the planner output for any legacy query (compares against the T001 baseline fixture). Per plan.md regression-safety gates. Maps to FR-002, P5-AC1.
- [ ] T013 [T-RED] [P] [US1] Write failing per-row `resolveFlag` mixed-tenant test (FR-052) in `src/lib/__tests__/github-sync-poller.test.ts` seeding two workspaces in the same poller cycle — one flag-ON, one flag-OFF — and asserting (a) the OFF workspace is polled by the legacy per-project query, (b) the ON workspace is polled by the owner-filtered query, (c) neither workspace's behavior changes when the other workspace's flag value changes. This is the canonical guard against the mass-mode pitfall. Maps to FR-052, P5-AC1.
- [ ] T014 [T-RED] [P] [US1] Write failing forward-compat activity renderer test in `src/components/__tests__/activity-feed.test.tsx` (extending an existing component test file; if none exists, place this in the nearest existing component test file — DO NOT create a new test file with no production peer) rendering an activity-feed fixture row with `kind='__unknown_future_kind__'` and asserting the feed renders surrounding rows normally without throwing. Maps to FR-054.

### Implementation for User Story 1

- [ ] T015 [US1] Wire the per-row `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` evaluation into `src/lib/github-sync-poller.ts` so each candidate `(workspace_id, github_repo)` row's selection branches into the legacy per-project query when flag is OFF and the owner-filtered query when flag is ON. Must pass T008, T013. Maps to FR-001, FR-002, FR-018, FR-052.
- [ ] T016 [US1] Extend `src/lib/github-sync-engine.ts` `pushTaskToGitHub` so it consults `resolveFlag` per call and emits `area:*` only when flag is ON AND `projects.area_slug` is non-NULL; otherwise emits the legacy `mc:*` + `priority:*` set unchanged. Must pass T009. Maps to FR-016, FR-017, US1-AC2.
- [ ] T017 [US1] Update `initializeLabels` signature in `src/lib/github-label-map.ts` (or wherever the existing function lives — pin in task PR description) to accept an optional second arg `workspaceId?: number` with default `undefined`. Behavior: 1-arg call creates legacy labels only; 2-arg call with flag OFF behaves identically to 1-arg; 2-arg call with flag ON delegates to FR-025 logic (implemented in T044). Must pass T010. Maps to FR-025, FR-053, US1-AC3.
- [ ] T018 [US1] Ensure `src/lib/github-sync-engine.ts` writes zero `area_routing_*` activity rows when the flag is OFF — verify by code path, not just test pass. Add an explicit `if (flagOn) { ... }` guard around all area-routing activity inserts. Must pass T011. Maps to FR-002, FR-044, SC-010.
- [ ] T019 [US1] Verify the activity-feed renderer (existing component) gracefully handles unknown `kind` values — extend the existing renderer's `switch` (or equivalent) with a `default` branch that renders a generic placeholder row. Must pass T014. Maps to FR-054.

**Checkpoint**: Flag-OFF parity proven; mixed-tenant fixture green; planner snapshots stable.

---

## Phase 4: User Story 2 — Single owner polls a shared monorepo (Priority: P1)

**Goal**: Exactly one `is_repo_sync_owner=1` project per `(workspace_id, github_repo)` polls the repo when the flag is ON. Operators can transfer ownership atomically.

**Independent Test**: Two projects A and B share `github_repo`; flag ON. Run poller; assert only one issues GitHub API calls. Submit transfer-owner PUT; assert atomic swap.

### Tests for User Story 2 (TDD red phase)

- [ ] T020 [T-RED] [P] [US2] Write failing flag-ON poller filter test in `src/lib/__tests__/github-sync-poller.test.ts` asserting that with two `github_sync_enabled=1` projects sharing `github_repo='org/repo'` and the flag ON, the poller selects only the project with `is_repo_sync_owner=1` and issues exactly one GitHub API request per cycle (down from N). Maps to FR-018, US2-AC2, SC-002, P5-AC2.
- [ ] T021 [T-RED] [P] [US2] Write failing PUT validation precedence test in `src/app/api/projects/[id]/__tests__/route.test.ts` (or extend the nearest existing route test file) covering FR-057 ordering: 401 → 403 → 404 → 400 (flag-OFF defense-in-depth) → 400 (regex/format) → 409 area_slug → 409 triage → 409 owner → 200. For each adjacent pair, send a request that violates both rules and assert the lower-numbered rule's error is returned. Maps to FR-057.
- [ ] T022 [T-RED] [P] [US2] Write failing 409 priority test in the same route test file asserting a single PUT request that triggers all three uniqueness conflicts simultaneously returns exactly the `area_slug_conflict` shape and that no SELECT for triage or owner uniqueness is executed once the area_slug conflict is identified. Maps to FR-058.
- [ ] T023 [T-RED] [P] [US2] Write failing transfer-owner clear-then-set transaction test in the same route test file asserting: (a) `transfer_owner=true` performs `clear A → set B → INSERT activity 'sync_owner_transferred'` inside one `db.transaction` block; (b) reversing the order (set-first) raises a UNIQUE violation against `idx_projects_one_sync_owner_per_repo` (assert via a separate scratch test that swaps the order and expects the error); (c) the activity row's `data` carries `previous_owner_project_id`, `new_owner_project_id`, `github_repo`, `workspace_id`, `actor_user_id` (integer `users.id`, not email/display name per FR-043a). Maps to FR-037, FR-043a, FR-055, US2-AC3, P5-AC3.
- [ ] T024 [T-RED] [P] [US2] Write failing 409 owner_conflict-without-transfer test asserting a request with `is_repo_sync_owner=true` (no `transfer_owner`) where another project already holds ownership returns 409 with body `{ error: 'owner_conflict', existing_owner_project_id, existing_owner_project_slug, hint: 'Set transfer_owner=true to swap ownership in one transaction', message }` and the database state is unchanged. Maps to FR-037, US2-AC4, P5-AC2.
- [ ] T025 [T-RED] [P] [US2] Write failing idempotent re-assertion test asserting a PUT with `is_repo_sync_owner=true` where the target project ALREADY holds ownership returns 200 with no UPDATE, no `sync_owner_transferred` activity, no `initializeLabels` invocation; same idempotency holds for `transfer_owner=true|false|omitted`. Maps to FR-059.
- [ ] T026 [T-RED] [P] [US2] Write failing concurrent-transfer atomicity test (FR-055 a/b/c) covering: (a) two `transfer_owner=true` requests on different targets in the same group — one wins, the other 409s with the winning project surfaced; (b) one `transfer_owner=true` and one `transfer_owner=false` request — writer-serialization order determines which arrives first, second always returns 409; (c) a process crash injected between the clear and set statements — after recovery, the previous owner is still the owner and zero `sync_owner_transferred` activity rows exist for the aborted attempt. Maps to FR-055.

### Implementation for User Story 2

- [ ] T027 [US2] Extend `src/lib/github-sync-poller.ts` so when flag is ON for a workspace, the candidate query joins `projects WHERE is_repo_sync_owner=1` for that `(workspace_id, github_repo)` group; verify the partial unique index `idx_projects_one_sync_owner_per_repo` is the chosen plan. Must pass T020. Maps to FR-018, P5-AC2.
- [ ] T028 [US2] Implement validation precedence in `src/app/api/projects/[id]/route.ts` (PUT handler) per FR-057: auth → role → project scope → flag-OFF defense-in-depth (FR-040a) → body type/regex (FR-034) → uniqueness pre-check chain (FR-058 ordering) → atomic write inside `db.transaction`. The flag-OFF rejection MUST trigger when ANY of `area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner` is present in the parsed body with a non-undefined value (covers `area_slug=null` clear case). Must pass T021. Maps to FR-033, FR-034, FR-040a, FR-057, FR-058.
- [ ] T029 [US2] Implement transfer-owner atomic swap in the PUT handler: when `is_repo_sync_owner=true && transfer_owner=true && existing owner exists`, run `db.transaction(() => { clear A; set B; INSERT activity sync_owner_transferred; })`. The clear-then-set order is REQUIRED (SQLite UNIQUE constraints are immediate, not deferrable). On UNIQUE violation race, translate back to 409 `owner_conflict` (never leak as 500). Must pass T023, T024, T026. Maps to FR-037, FR-055, US2-AC3, P5-AC3.
- [ ] T030 [US2] Implement idempotent re-assertion no-op in the PUT handler: when `is_repo_sync_owner=true` is asserted on a project that already holds ownership, short-circuit before any UPDATE/activity-INSERT/initializeLabels invocation; return 200 with the unchanged project record. Same for `is_repo_sync_owner=false` on the current owner (group transitions to zero owners cleanly per FR-004 partial unique index allowing zero). Must pass T025. Maps to FR-059.
- [ ] T031 [US2] Add the project settings UI for the sync-owner field to `src/components/modals/project-manager-modal.tsx` (extend existing file): checkbox for `is_repo_sync_owner`. When the user toggles it ON for a project where another project in the same `(workspace_id, github_repo)` group holds ownership, surface the 409 inline with the conflicting project's name and a "Transfer ownership" button that re-submits the PUT with `transfer_owner=true`. NO new TSX module. Maps to FR-040, FR-041, P5-AC2.
- [ ] T032 [US2] Emit structured log line `event='sync_owner_transfer_activity_failed'` when the transfer transaction's activity-INSERT step fails (FR-027b). The log payload includes `event`, `workspace_id`, `github_repo`, `error_message` (sanitized per FR-027a — no Authorization headers, no GitHub tokens, no API keys, no email/PII), `error_class`. Maps to FR-027b.

**Checkpoint**: Single-owner polling proven; transfer flow atomic; UI surface live.

---

## Phase 5: User Story 3 — Triage project absorbs ambiguous issues (Priority: P1)

**Goal**: One project per workspace flagged as `is_triage_project=1` receives no-label / multi-label / no-match issues. Activity log records every routing decision.

**Independent Test**: Workspace with three area projects + one triage project. Inject GitHub issues covering each ambiguity case; assert each lands in triage with the correct `reason` code.

### Tests for User Story 3 (TDD red phase)

- [ ] T033 [T-RED] [P] [US3] Write failing `is_triage_project` exclusivity test in `src/app/api/projects/[id]/__tests__/route.test.ts` asserting a PUT setting `is_triage_project=true` on project B when project A in the same workspace already holds the flag returns 409 `triage_conflict` with `existing_triage_project_id` / `existing_triage_project_slug`. Verify the partial unique index `idx_projects_one_triage_per_workspace` enforces it at the SQL layer too. Maps to FR-036, US3-AC4, P5-AC4.
- [ ] T034 [T-RED] [P] [US3] Write failing no-triage-banner test in `src/components/__tests__/project-manager-modal.test.tsx` (extend existing test file or sibling) asserting that when `FEATURE_AREA_LABEL_ROUTING` is ON and no project in the workspace has `is_triage_project=1`, the project settings modal renders a yellow banner with the FR-040b text; and that the banner disappears when any project is set as triage (re-render from project list state, no new API endpoint). Maps to FR-040b, P5-AC4.

### Implementation for User Story 3

- [ ] T035 [US3] Implement `triage_conflict` 409 in the PUT handler (per FR-058 priority order — fires AFTER `area_slug_conflict` but BEFORE `owner_conflict`). Wire the partial unique index UNIQUE-violation translator to return the same structured 409 shape. Must pass T033. Maps to FR-036, FR-058.
- [ ] T036 [US3] Add the `is_triage_project` checkbox to the project settings UI in `src/components/modals/project-manager-modal.tsx`. NO new TSX module. Surface the 409 `triage_conflict` inline with the conflicting project's name (FR-041). Maps to FR-040, FR-041, P5-AC4.
- [ ] T037 [US3] Add the no-triage-designated yellow banner to `src/components/modals/project-manager-modal.tsx`: visible when flag is ON and `projects` list contains no `is_triage_project=1` row in the active workspace; auto-hides when one is set. Must pass T034. Maps to FR-040b, P5-AC4.

**Checkpoint**: Triage destination configurable; banner visible when missing.

---

## Phase 6: User Story 4 — Department issues route on initial ingest only (Priority: P1)

**Goal**: First-ingest routing assigns `task.project_id` from the issue's `area:*` label. Subsequent label changes do NOT move the task (no-thrash). Outbound emission is symmetric.

**Independent Test**: Ingest issue with `area:qa`; assert task lands in QA project. Modify GitHub labels to `area:dev`; re-run sync; assert task remains in QA project, no new activity row.

### Tests for User Story 4 (TDD red phase)

- [ ] T038 [T-RED] [P] [US4] Write failing `loadAreaRoutingCache` test in `src/lib/__tests__/github-sync-engine.test.ts` asserting the cache is built once per `pullFromGitHub` call via a single `SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?` and exposes a `Map<area_slug, project_id>` plus a `triageProjectId: number | null`. Maps to FR-009.
- [ ] T039 [T-RED] [P] [US4] Write failing inbound routing tests covering all five paths in `src/lib/__tests__/github-sync-engine.test.ts`: (a) `single_match` — `area:qa` + project with `area_slug='qa'` → task.project_id = QA, activity `kind='area_routing_resolved'` with `reason='single_match'`, `source='ingest'`; (b) `no_label` — empty `area:*` set → triage, activity `kind='area_routing_unresolved'` with `reason='no_label'`; (c) `multi_label` — `area:qa` + `area:dev` → triage, `reason='multi_label'`, `area_labels=['qa','dev']` (lowercased, prefix-stripped); (d) `no_match` — `area:marketing` with no project for it → triage, `reason='no_match'`; (e) `no_triage` — ambiguous issue, no triage project designated → sync-owner fallback, `reason='no_triage'`. Also assert: `area:` (empty value) is skipped during parsing; `area:QA` and `area:qa` resolve identically (case-insensitive after prefix strip); `area_slug='triage'` on a non-triage project resolves `area:triage`-labeled issues as `single_match` (NOT as the triage destination per FR-014 — triage authority is the flag, not the slug string). Maps to FR-010..FR-014, FR-042, FR-043, FR-043a, US3-AC1/2/3/4, US4-AC1, P5-AC4, P5-AC5.
- [ ] T040 [T-RED] [P] [US4] Write failing no-thrash test in `src/lib/__tests__/github-sync-engine.test.ts` asserting that for an existing task in the QA project, a subsequent sync where the GitHub issue's labels change to `area:dev` (or are removed entirely) leaves `task.project_id` unchanged AND writes zero new `area_routing_*` activity rows for that task. Maps to FR-015, FR-044, US4-AC2/3, SC-005, P5-AC5.
- [ ] T041 [T-RED] [P] [US4] Write failing outbound `area:*` emission test in `src/lib/__tests__/github-sync-engine.test.ts` asserting (a) `pushTaskToGitHub` for a task in a project with `area_slug='qa'` and flag ON emits `area:qa` alongside `mc:*` and `priority:*`; (b) project with `area_slug=NULL` and flag ON emits no `area:*`; (c) flag OFF never emits `area:*` (already covered by T009). Maps to FR-016, FR-017, US4-AC4/5.
- [ ] T042 [T-RED] [P] [US4] Write failing `area_slug` regex test (FR-034) in the route test file asserting (a) valid: `q`, `qa`, `qa-1`, `area-name-32-chars-aaaaaaaaaaaaa` (32 char); (b) invalid: `Q A!`, ` qa `, `qa-`, `-qa`, 33+ chars, empty string ⇒ all return 400 `invalid_area_slug` with no DB write; (c) consecutive interior hyphens (`a--b`) ARE permitted per RFC 1123 / K8s convention. Maps to FR-034, US6-AC1.
- [ ] T043 [T-RED] [P] [US4] Write failing `area_slug_conflict` 409 test asserting a PUT setting `area_slug='qa'` on project B when project A in the same workspace already holds it returns 409 with body `{ error: 'area_slug_conflict', existing_area_slug_project_id, existing_area_slug_project_slug, message }`. Maps to FR-035, US3-AC2, US6-AC2.

### Implementation for User Story 4

- [ ] T044 [US4] Implement `loadAreaRoutingCache(db, workspaceId): { slugToProjectId: Map<string, number>, triageProjectId: number | null }` as a non-exported helper inside `src/lib/github-sync-engine.ts`. Built once per `pullFromGitHub` call. Must pass T038. Maps to FR-009.
- [ ] T045 [US4] Implement inbound routing in `pullFromGitHub` inside `src/lib/github-sync-engine.ts`: parse `area:*` labels (lowercase, slice(5), skip empty), apply the five-path resolution against the cache, set `tasks.project_id` on first ingest only (gate on absence of an existing task row for `(workspace_id, github_repo, github_issue_number)`), write the activity row with the FR-043 `data` shape and `source='ingest'`. Triage authority is the `is_triage_project=1` flag — `area_slug='triage'` on a non-triage project routes as `single_match` only (FR-014). Must pass T039, T040. Maps to FR-010..FR-015, FR-042, FR-043, FR-044.
- [ ] T046 [US4] Implement outbound `area:*` emission in `pushTaskToGitHub` inside `src/lib/github-sync-engine.ts`: when flag is ON and resolved project has non-NULL `area_slug`, append `area:<area_slug>` to the outbound label set. Must pass T041. Maps to FR-016, FR-017.
- [ ] T047 [US4] Implement `area_slug` regex validation in the PUT handler `src/app/api/projects/[id]/route.ts` per FR-034 (`^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`). Reject with 400 `invalid_area_slug` BEFORE any uniqueness SELECT (FR-057 ordering — format wins over conflict). Wrap conflict-check + UPDATE in a single `db.transaction` block; translate any UNIQUE-violation race back to the matching structured 409 (FR-034 last paragraph). Must pass T042. Maps to FR-034.
- [ ] T048 [US4] Implement `area_slug_conflict` 409 pre-check in the PUT handler (highest 409 priority per FR-058). Must pass T043. Maps to FR-035.
- [ ] T049 [US4] Add the `area_slug` text input with inline regex format-validation feedback to `src/components/modals/project-manager-modal.tsx`. Surface 409 `area_slug_conflict` inline with the conflicting project name. NO new TSX module. Maps to FR-040, FR-041, P5-AC4.

**Checkpoint**: Inbound routing exhaustive; outbound emission symmetric; no-thrash proven; UI handles regex + 409.

---

## Phase 7: User Story 5 — First-time enable backfills existing tasks (Priority: P2)

**Goal**: On first sync poll after flag-on for a workspace, every existing GitHub-synced task is re-evaluated and routed using its stored labels. Idempotent, resumable, completion marker set.

**Independent Test**: Seed a workspace with 50 tasks in a legacy project; enable flag; trigger sync; assert backfill ran exactly once with correct distribution and the completion marker is set.

### Tests for User Story 5 (TDD red phase)

- [X] T050 [T-RED] [P] [US5] Write failing per-task transaction test in `src/lib/__tests__/github-sync-engine.test.ts` asserting `backfillAreaRouting`'s per-task block COMMITs `(SELECT, label resolution, UPDATE project_id + area_routing_backfilled_at = unixepoch(), INSERT activity)` atomically. Cover: (a) success case sets all four results; (b) activity-INSERT failure rolls back and leaves `area_routing_backfilled_at` NULL; (c) NULL `tasks.github_labels` is treated as `no_label` (route to triage with `reason='no_label'`, or sync-owner with `reason='no_triage'` if no triage project); (d) unparseable JSON in `tasks.github_labels` is treated identically to NULL with the parse failure logged but the per-task transaction NOT aborted; (e) tasks already in their correct project still get `area_routing_backfilled_at` set on COMMIT (no `project_id` change but the marker is set). Maps to FR-021, US5-AC4/5, P5-AC6.
- [X] T051 [T-RED] [P] [US5] Write failing `area_routing_backfilled_at` monotonicity test in `src/lib/__tests__/github-sync-engine.test.ts` asserting that no production code path (inbound sync, outbound push, PUT route, manual operator action — the test exercises each via fixtures) ever resets `area_routing_backfilled_at` to NULL once set, nor decreases its value across full sync cycles. Per FR-021a, FR-056. Maps to FR-021a, FR-056.
- [X] T052 [T-RED] [P] [US5] Write failing first-flag-on bootstrap test asserting that when flag transitions OFF→ON for a workspace and the backfill completion marker is unset, the next sync poll invokes `backfillAreaRouting(workspaceId)` exactly once; subsequent polls do NOT re-invoke because the marker is set. Maps to FR-019, FR-022, US5-AC1/2.
- [X] T053 [T-RED] [P] [US5] Write failing completion-marker test asserting (a) the marker is set ONLY after the SELECT predicate `WHERE workspace_id=? AND github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL` returns zero rows; (b) if a per-task transaction fails (its `area_routing_backfilled_at` stays NULL), the marker stays unset; (c) the marker UPDATE runs in a separate transaction from the last per-task transaction; (d) if the marker UPDATE itself fails after the per-task loop drains, the next bootstrap finds zero pending tasks and sets the marker without reprocessing. Maps to FR-022, US5-AC2/3.
- [X] T054 [T-RED] [P] [US5] Write failing idempotent-resume test asserting that with `WHERE area_routing_backfilled_at IS NULL` predicate, a backfill interrupted partway (kill the process after 25 of 50 tasks) skips the 25 already-completed tasks on the resumed run via the partial index `idx_tasks_area_routing_backfill_pending`. Resume scan is O(remaining tasks). Maps to FR-023, US5-AC3.
- [X] T055 [T-RED] [P] [US5] Write failing single-task-failure-isolation test asserting one task that throws during label parse / DB write does NOT abort the run; the failure is logged via FR-027b structured log `event='backfill_task_failed'`, counted, and the next task processes in its own independent transaction. Maps to FR-021, FR-027b, US5-AC4.
- [X] T056 [T-RED] [P] [US5] Write failing repeat-failure-no-permanent-skip test asserting that repeat failures on the same task across runs are logged (FR-027b) and the scan continues to retry such tasks on every resume cycle (no implicit permanent-skip sentinel). Per Clarify session 1 / FR-022. Maps to FR-022 (resolution paragraph).
- [X] T057 [T-RED] [P] [US5] Write failing UNIQUE-constraint-not-violated regression test in `src/lib/__tests__/github-sync-engine.test.ts` asserting backfill moving a task between two projects sharing the same `(workspace_id, github_repo)` updates `task.project_id` cleanly, writes exactly one `area_routing_resolved` activity with `reason='single_match'` and `source='backfill'`, and never raises a UNIQUE violation against `(workspace_id, github_repo, github_issue_number)`. Maps to FR-008, FR-050.

### Implementation for User Story 5

- [X] T058 [US5] Implement `backfillAreaRouting(workspaceId)` in `src/lib/github-sync-engine.ts` (non-exported function inside the existing module). Iterates `tasks WHERE workspace_id=? AND github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL` for repos owned by `is_repo_sync_owner=1` projects in the workspace; per-task transaction wraps `(SELECT, parse stored github_labels, resolve via the same FR-011..FR-014 rules, UPDATE project_id + area_routing_backfilled_at, INSERT activity with source='backfill')`. Failure isolation per task; failed parses/transactions logged via FR-027b structured log `event='backfill_task_failed'`. Must pass T050, T051, T055, T056, T057. Maps to FR-020, FR-021, FR-021a, FR-023, FR-024.
- [X] T059 [US5] Implement first-flag-on bootstrap in `src/lib/github-sync-poller.ts`: on each poll cycle, if `resolveFlag` is true for the workspace AND `workspaces.feature_flags.area_label_routing_backfill_completed_at` is unset, invoke `backfillAreaRouting(workspaceId)` once before continuing the regular poll; per FR-019, also invoke `initializeLabels(repo, workspaceId, { trigger: 'bootstrap' })` for each repo owned by an `is_repo_sync_owner=1` project (this part is finalized in T072). Must pass T052. Maps to FR-019, US5-AC1.
- [X] T060 [US5] Implement completion-marker UPDATE inside `backfillAreaRouting`: AFTER the per-task loop terminates, in a separate transaction, run `UPDATE workspaces SET feature_flags = json_patch(feature_flags, ?)` only when the SELECT predicate returns zero pending rows for the workspace. Must pass T053. Maps to FR-022, US5-AC2/3.

**Checkpoint**: Backfill processes existing tasks once per workspace; resumable; idempotent; failure-isolated.

---

## Phase 8: User Story 6 — Operators configure routing via existing UI (Priority: P2)

> NOTE: Most of US6's UI surface is delivered alongside US2 (T031), US3 (T036/T037), and US4 (T049) because each of those user stories already needed a slice of the project settings panel. This phase consolidates the e2e journey, the OpenAPI contract update, the response-shape snapshot, and the closed-enum guard.

### Tests for User Story 6 (TDD red phase)

- [ ] T061 [T-RED] [P] [US6] Write failing 200 OK response-shape snapshot test in `src/app/api/projects/[id]/__tests__/route.test.ts` asserting (a) the response body includes the three persisted new fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`); (b) `transfer_owner` is NEVER returned (request-only flag, not stored); (c) projects that never set the new fields render with defaults `null` / `false` / `false`; (d) the byte-shape for callers that omit all four new fields is identical to the pre-SPEC-006 baseline EXCEPT for the additive presence of the three persisted fields. Snapshot-pinned. Maps to FR-061.
- [ ] T062 [T-RED] [P] [US6] Write failing closed-enum error-code test asserting that the structured `error` codes returned by `PUT /api/projects/[id]` are exactly the closed set `{ feature_flag_disabled, invalid_area_slug, area_slug_conflict, triage_conflict, owner_conflict }` and no others. Snapshot-pin the enum. Maps to FR-062.
- [ ] T063 [T-RED] [P] [US6] Write failing OpenAPI snapshot test in `tests/contract/openapi-projects-put.test.ts` (or extend nearest existing OpenAPI test file — DO NOT create a new contract test directory if not already in repo conventions) asserting `openapi.json` documents (a) the four new optional request fields with types/nullability/`area_slug` regex constraint; (b) the three new persisted fields on the project response schema (always present, defaults `null`/`false`/`false`); (c) the 400 shapes for `invalid_area_slug` and `feature_flag_disabled`; (d) the three 409 shapes with `existing_*_project_id` / `existing_*_project_slug` / `hint` fields; (e) preserves all non-SPEC-006 fields unchanged. Maps to FR-064.
- [ ] T064 [T-RED] [P] [US6] Write failing `POST /api/github` connect-handler public-contract test in `src/app/api/github/__tests__/route.test.ts` asserting the request body, response body, status codes, and authorization shape are byte-identical to the pre-SPEC-006 baseline; only the internal `initializeLabels(repo)` call is upgraded to `initializeLabels(repo, workspaceId, { trigger: 'connect' })`. Per-label provisioning failures inside `initializeLabels` MUST NOT affect the connect HTTP response (FR-027 isolation). Maps to FR-039, FR-063.
- [ ] T065 [T-RED] [P] [US6] Write failing flag-OFF UI disabled-state test in `src/components/__tests__/project-manager-modal.test.tsx` asserting that when `resolveFlag` returns false for the workspace, the three new fields are visible but rendered with HTML `disabled` attribute on inputs and `aria-disabled='true'` on the wrapping element, with a tooltip reading "Available after FEATURE_AREA_LABEL_ROUTING is enabled for this workspace." Maps to FR-040a, P5-AC9.

### Implementation for User Story 6

- [ ] T066 [US6] Update `openapi.json` per FR-064 a–e. Run JSON-schema parse / OpenAPI validator step in `pnpm test:all`. Must pass T063. Maps to FR-064.
- [ ] T067 [US6] Wire the closed enum + 200 response shape guarantees through the PUT handler such that T061 and T062 pass. Add an explicit shape-check assertion in `src/app/api/projects/[id]/route.ts` to filter `transfer_owner` out of the response. Maps to FR-061, FR-062.
- [ ] T068 [US6] Update `src/app/api/github/route.ts` (the connect handler) to pass the resolved `workspaceId` (via the existing `resolveWorkspaceScopeFromRequest` helper) into `initializeLabels(repo, workspaceId, { trigger: 'connect' })`. NO change to request/response shape, status codes, or authorization. Must pass T064. Maps to FR-039, FR-063.
- [ ] T069 [US6] Render the three new fields with `disabled` + `aria-disabled='true'` + tooltip in `src/components/modals/project-manager-modal.tsx` when `resolveFlag` returns false for the workspace. Must pass T065. Maps to FR-040a.
- [ ] T070 [P] [US6] Add a Playwright e2e journey at `tests/e2e/project-settings-area-routing.spec.ts` that boots the app, signs in via the supported auth seam, seeds a workspace with two projects sharing one `github_repo`, opens the project settings modal, and asserts: (a) inline 400 on bad regex (`Q A!`) with no API call; (b) inline 409 on `area_slug` collision identifying the conflicting project by slug; (c) inline 409 on `is_triage_project` collision; (d) inline 409 on `is_repo_sync_owner` collision with a working transfer-owner action; (e) visible-but-disabled state with tooltip when the flag is OFF (FR-040a); (f) yellow no-triage banner appears when flag is ON and no triage project exists, disappears when one is set (FR-040b). Capture before/during/after screenshots — CI/Argos artifacts only, NO committed binaries unless a manifest-backed exception lands in the same diff. Argos metadata: include `spec:006-area-label-github-sync` tag, test identity, and source location. Maps to FR-051, P5-AC9.

**Checkpoint**: Operator can configure all three fields via the existing UI in <60s including 409 + transfer flow.

---

## Phase 9: User Story 7 — Migration is additive, reversible, label-init failures isolated (Priority: P2)

**Goal**: Migration is additive and rollback-clean; `initializeLabels` failures are caught per-label and do NOT abort sync.

> NOTE: Migration safety is delivered in T003–T005 (Phase 2). Owner-election determinism is delivered in T003. This phase delivers label-provisioning failure isolation, the 24-hour throttled activity, structured logging, and the slug-or-triage-only post-PUT trigger.

### Tests for User Story 7 (TDD red phase)

- [ ] T071 [T-RED] [P] [US7] Write failing label-provisioning failure-isolation test in `src/lib/__tests__/github-label-map.test.ts` (or `github-sync-engine.test.ts`) asserting that when `initializeLabels(repo, workspaceId)` is invoked and the mocked GitHub client returns 429 / 4xx / 5xx / network-error / unknown-error for two labels and success for three, the function logs every per-label failure (FR-027b structured log `event='label_provisioning_failed'`), aggregates them into ONE `kind='label_provisioning_failed'` activity with `data: { workspace_id, github_repo, failed_labels: string[], error_count: number, sample_error: string ≤500 chars sanitized of Authorization headers / `gh[posru]_` tokens / API keys / emails / PII, trigger: 'connect'|'area_slug_change'|'bootstrap' }`, returns successfully with no thrown exception, and the larger sync run is unaffected. Maps to FR-026, FR-027, FR-027a, FR-027b, US7-AC4, P5-AC7.
- [ ] T072 [T-RED] [P] [US7] Write failing 24-hour throttle test asserting that a second invocation of `initializeLabels` for the same `(workspace_id, github_repo)` within 24h with new failures emits the per-label structured logs (FR-027b) but does NOT write a second `label_provisioning_failed` activity row (the throttle SELECT `WHERE created_at >= unixepoch() - 86400` blocks it). Verify the `>=` boundary closes the same-second case. Maps to FR-027.
- [X] T073 [T-RED] [P] [US7] Write failing slug-or-triage-only post-PUT trigger test (FR-060) asserting `initializeLabels(repo, workspaceId, { trigger: 'area_slug_change' })` is invoked exactly once after the single transaction commits, IFF the committed transaction CHANGED the value of `projects.area_slug` (NULL→value, value→NULL, A→B) OR `projects.is_triage_project` (0→1 or 1→0). A PUT that changes only `is_repo_sync_owner` (including transfer-owner swap) MUST NOT trigger; an idempotent slug-write (parsed value equals stored value) MUST NOT trigger; a combined `area_slug` + `is_repo_sync_owner` change MUST trigger exactly once. Maps to FR-038, FR-060.

### Implementation for User Story 7

- [X] T074 [US7] Implement `initializeLabels(repo, workspaceId?)` body in `src/lib/github-label-map.ts` (or wherever the existing `initializeLabels` lives — pin in PR description) per FR-025: when `workspaceId` provided AND flag ON, fetch `areaLabelsForWorkspace(db, workspaceId)` (T007) and call GitHub create-label for each label not present on the repo. Per-label try/catch covers HTTP 429 / 4xx / 5xx / network errors (DNS, TLS, connection reset, timeout) AND a default catch-all for unknown error classes. Existing labels with different color/description are NOT modified (FR-026). Aggregate per-label failures into ONE `label_provisioning_failed` activity with the FR-027a `data` shape; sanitize `sample_error` ≤500 chars stripping Authorization headers, `gh[posru]_` tokens, API keys, emails, and PII at the call site (NOT a deferred redaction pass). Throttle the activity insert with `created_at >= unixepoch() - 86400`. Always emit per-label structured logs via FR-027b even when the activity is throttled. Must pass T071, T072. Maps to FR-025, FR-026, FR-027, FR-027a, FR-027b, FR-053.
- [X] T075 [US7] Implement post-PUT `initializeLabels` trigger in `src/app/api/projects/[id]/route.ts` per FR-060: AFTER the transaction commits, compute `(area_slug_changed OR is_triage_changed)` from the pre/post values and invoke `initializeLabels(repo, workspaceId, { trigger: 'area_slug_change' })` IFF that boolean is true. Owner-only changes (including transfer-owner) MUST NOT trigger. Idempotent no-op writes MUST NOT trigger. Combined slug + owner change MUST trigger exactly once. Must pass T073. Maps to FR-038, FR-060.
- [X] T076 [US7] Wire the FR-027b structured logger into all four failure surfaces in `src/lib/github-sync-engine.ts` and `src/app/api/projects/[id]/route.ts`: `event='label_provisioning_failed'` (T074), `event='backfill_task_failed'` (T058), `event='sync_owner_transfer_activity_failed'` (T032), `event='project_put_validation_failed'` (any 400/409 from PUT). Shared payload shape: `{ event, workspace_id, github_repo?, error_message (sanitized), error_class (RateLimitError|NetworkError|HttpClientError|HttpServerError|UnknownError) }`. Maps to FR-027b.

**Checkpoint**: Migration reversible; label-init failures isolated and observable; throttle proven.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T077 [P] Add `docs/github-sync.md` covering: connect/disconnect, label initialization (mc/priority/area), per-project polling vs. owner-based polling, inbound issue handling (dedupe, area routing, triage, no-thrash), outbound task push, sync owner election + transfer, triage project designation, `area_slug` configuration, auto-backfill on first flag-on, recovery procedures, and rollback. Per FR-045.
- [ ] T078 [P] Update `docs/feature-flags-runbook.md` with the `FEATURE_AREA_LABEL_ROUTING` preflight checklist: verify ≥1 project has `area_slug` set, verify exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)` group, verify a triage project is designated if expected. Per FR-046.
- [ ] T079 [P] Update `docs/orchestration.md` with a pointer to `docs/github-sync.md` IFF the file currently has a project-routing section. Per FR-047.
- [ ] T080 Run the strict-scope guardrail (T002) and assert empty output: `git diff origin/main...HEAD --name-only --diff-filter=A | grep -E '^src/.*\\.(ts|tsx)$'` returns empty; `find src -type f \\( -name 'github-area-routing*.ts' -o -name 'area-routing-admin-panel*.tsx' \\) | wc -l` returns `0`. Per plan §Strict Scope.
- [ ] T081 Run `pnpm typecheck` and assert zero errors. Per Constitution Article IV.
- [ ] T082 Run `pnpm lint` and assert zero errors.
- [ ] T083 Run `pnpm test` (full vitest suite) and assert 100% pass with no skipped tests added by SPEC-006.
- [ ] T084 Run `pnpm test:e2e` (Playwright) and assert the FR-051 journey (T070) passes; capture Argos run id and verify metadata includes `spec:006-area-label-github-sync` tag.
- [ ] T085 Run `pnpm build` (standalone) and assert clean build with no SPEC-006 warnings.
- [ ] T086 Run quickstart.md procedure end-to-end against a disposable workspace; verify each step produces the expected outcome (migration applied → fields configurable → flag enable → backfill runs once → outbound `area:*` emitted → flag OFF rolls back behavior).
- [ ] T087 Archive Sweep verification: confirm Phase 0 sweep ran against previously merged specs (SPEC-001, SPEC-002, SPEC-002A, SPEC-003) only; confirm `specs/006-area-label-github-sync/` is excluded from same-run archival; record provenance (PR URL, merge SHA, CI/Argos links, recovery commands `git show <merge-sha>:specs/006-area-label-github-sync/spec.md`); cleanup mode is `dry-run` until merged. Per FR Spec Evidence And Archive Policy + plan §Archive Sweep gate.
- [ ] T088 Screenshot/evidence guard: `git diff --name-only --diff-filter=A origin/main...HEAD | grep -E '\\.(png|jpg|jpeg|gif|webp)$'` MUST return empty unless a manifest-backed exception lands in the same diff. The FR-051 e2e screenshots stay in CI/Argos. Per plan §Archive Sweep gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001 (planner baseline) and T002 (scope guard) run independently; both block the migration.
- **Phase 2 (Foundational)**: depends on Phase 1. T003→T004→T005 sequenced (test before migration before rollback). T006→T007 sequenced. T004 and T007 are independent files so [P] across the two pairs is allowed AFTER each pair's red test passes.
- **Phase 3..9 (User Stories)**: each depends on Phase 2 completion. US1 (Phase 3) blocks merge — it is the safety floor. US2..US7 can proceed in parallel after Phase 2 with the cross-references noted below.
- **Phase 10 (Polish)**: depends on all desired user stories complete.

### User Story Dependencies

- **US1 (P1, Phase 3)**: depends only on Foundational; gates the entire feature merge per Constitution Article I.
- **US2 (P1, Phase 4)**: depends on Foundational. T028 (PUT precedence) is shared infrastructure consumed by US3/US4/US6 — once T028 lands, US3/US4/US6 PUT-handler work can proceed in parallel.
- **US3 (P1, Phase 5)**: depends on Foundational + T028 (PUT precedence shared with US2/US4).
- **US4 (P1, Phase 6)**: depends on Foundational + T028 (PUT precedence). Routing (T044, T045) is independent of the PUT layer and can proceed alongside US2.
- **US5 (P2, Phase 7)**: depends on Foundational + US4's routing rules (FR-011..FR-014 are reused by backfill). T058 (backfill function) depends on T045 being committed so the routing logic is in one place.
- **US6 (P2, Phase 8)**: depends on Foundational + the UI deliverables embedded in US2/US3/US4 (T031/T036/T037/T049). T070 e2e covers all.
- **US7 (P2, Phase 9)**: depends on Foundational + T007 (`areaLabelsForWorkspace`). T074 (`initializeLabels` body) gates T059's bootstrap call (US5).

### Within Each User Story

- Tests (`[T-RED]`) are written and FAIL before paired implementation tasks begin.
- Migration (T003/T004/T005) sequenced strictly — no parallelism inside the migration triplet.
- Within UI tasks, the existing `project-manager-modal.tsx` is a single file: T031, T036, T037, T049, T069 sequence on the same file (NOT parallel) but each adds one logical surface and is independently reviewable.

### Parallel Opportunities

- **Phase 1**: T001 [P] T002.
- **Phase 2 red tests**: T003 [P] T006.
- **Phase 3 red tests**: T008..T014 all [P] (different test files or different test cases inside `__tests__/`).
- **Phase 4 red tests**: T020..T026 all [P].
- **Phase 5 red tests**: T033 [P] T034.
- **Phase 6 red tests**: T038..T043 all [P].
- **Phase 7 red tests**: T050..T057 all [P].
- **Phase 8 red tests**: T061..T065 all [P]; T070 [P] (new e2e file, no conflict).
- **Phase 9 red tests**: T071..T073 all [P].
- **Phase 10**: T077, T078, T079 all [P] (different doc files); verification tasks (T080..T088) sequential.

---

## Parallel Example: User Story 4 red phase

```bash
# Launch all Phase 6 red tests together — different test files / test cases:
Task: "T038 [T-RED] [US4] loadAreaRoutingCache test in src/lib/__tests__/github-sync-engine.test.ts"
Task: "T039 [T-RED] [US4] inbound routing five-path test in src/lib/__tests__/github-sync-engine.test.ts"
Task: "T040 [T-RED] [US4] no-thrash test in src/lib/__tests__/github-sync-engine.test.ts"
Task: "T041 [T-RED] [US4] outbound area:* emission test in src/lib/__tests__/github-sync-engine.test.ts"
Task: "T042 [T-RED] [US4] area_slug regex test in src/app/api/projects/[id]/__tests__/route.test.ts"
Task: "T043 [T-RED] [US4] area_slug_conflict 409 test in src/app/api/projects/[id]/__tests__/route.test.ts"
```

> Note: `github-sync-engine.test.ts` is one file but each red test is an independent `describe`/`it` block — agents may parallelize at the test-case level.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001-T002) → baseline + scope guard.
2. Phase 2 (T003-T007) → migration + label map.
3. Phase 3 (T008-T019) → flag-OFF parity proven.
4. **STOP and VALIDATE**: existing GitHub sync e2e suite passes byte-identical to pre-SPEC-006. This IS the merge gate per Constitution Article I.

### Incremental Delivery

1. Setup + Foundational + US1 → Flag-OFF safe (gate to merge).
2. Add US2 → single-owner polling + transfer flow → demo: duplicate-ingest gone.
3. Add US3 + US4 → triage + on-ingest routing → demo: department kanbans receive their own work.
4. Add US5 → auto-backfill → demo: legacy tasks re-routed on first flag-on.
5. Add US6 + US7 → polish UI + label provisioning isolation → ship.

### Parallel Team Strategy

After Phase 2 (Foundational) lands:

- **Developer A**: US1 (gates merge — finish first).
- **Developer B**: US2 (sync ownership + PUT precedence).
- **Developer C**: US4 routing logic (T044, T045, T046) — independent of PUT layer.
- **Developer D**: US7 `initializeLabels` body (T074) — independent of routing.
- After US2's T028 lands: Developer C/D pick up US3/US6 UI extensions on the modal.

---

## Notes

- `[P]` tasks = different files OR independent test cases inside the same file with no shared mutable state in the test setup.
- `[T-RED]` test tasks MUST be written and FAIL (assert the unimplemented behavior) before the paired implementation task starts.
- Commit after each `[T-RED]` test task and after each implementation task (Conventional Commits per project CLAUDE.md: `test:`, `feat:`, `docs:`, `refactor:`).
- Do NOT add `Co-Authored-By` trailers (project CLAUDE.md no-AI-attribution rule).
- Stop at any checkpoint to validate independence.
- Avoid: vague tasks, cross-story file conflicts that block parallelism, new TS/TSX modules, changes to the legacy `(workspace_id, github_repo, github_issue_number)` constraint, re-route on subsequent label changes.

### Coverage Summary

- **P5-AC1** (flag-OFF parity): T008, T010, T011, T012, T013, T014, T015, T017, T018, T019.
- **P5-AC2** (single-owner polling): T020, T024, T027, T031.
- **P5-AC3** (atomic transfer): T023, T026, T029.
- **P5-AC4** (triage + 409 + UI): T033, T034, T035, T036, T037, T039, T043, T048, T049.
- **P5-AC5** (no-thrash + on-ingest routing): T039, T040, T045.
- **P5-AC6** (per-task transaction backfill): T050, T051, T053, T054, T055, T056, T057, T058, T060.
- **P5-AC7** (label-provisioning isolation): T071, T072, T074.
- **P5-AC8** (additive migration + rollback): T003, T004, T005.
- **P5-AC9** (UI flag-OFF disabled state + e2e): T065, T069, T070.

- **FR coverage**: FR-001 (T015), FR-002 (T008-T019), FR-003 (T003-T004), FR-004 (T003-T004), FR-005 (T003-T004), FR-006 (T005), FR-007 (T005), FR-008 (T003, T057), FR-009 (T038, T044), FR-010-014 (T039, T045), FR-015 (T040, T045), FR-016-017 (T041, T046), FR-018 (T020, T027), FR-019 (T052, T059), FR-020 (T058), FR-021 (T050, T058), FR-021a (T051), FR-022 (T053, T060), FR-023 (T054, T058), FR-024 (T058), FR-025 (T071, T074), FR-026 (T071, T074), FR-027 (T071, T072, T074), FR-027a (T071, T074), FR-027b (T032, T055, T071, T076), FR-028 (T059, T068, T075), FR-029 (T059), FR-030-032 (T006, T007), FR-033 (T028), FR-034 (T042, T047), FR-035 (T043, T048), FR-036 (T033, T035), FR-037 (T023, T024, T029), FR-038 (T073, T075), FR-039 (T064, T068), FR-040 (T031, T036, T049), FR-040a (T065, T069), FR-040b (T034, T037), FR-041 (T031, T036, T049), FR-042-044 (T011, T039, T045, T058), FR-043a (T023, T039), FR-045 (T077), FR-046 (T078), FR-047 (T079), FR-048-051 (test tasks throughout + T070), FR-052 (T013, T015), FR-053 (T010, T017, T074), FR-054 (T014, T019), FR-055 (T026, T029), FR-056 (T051), FR-057 (T021, T028), FR-058 (T022, T028, T035, T048), FR-059 (T025, T030), FR-060 (T073, T075), FR-061 (T061, T067), FR-062 (T062, T067), FR-063 (T064, T068), FR-064 (T063, T066).
