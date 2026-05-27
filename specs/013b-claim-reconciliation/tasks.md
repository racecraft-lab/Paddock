# Tasks: SPEC-013B - Claim and Reconciliation Authority

**Input**: Design documents from `specs/013b-claim-reconciliation/`, plus `docs/ai/specs/SPEC-013B-design-concept.md`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. This feature changes scheduler admission, persistence, dispatch integration, and read-model evidence. Every behavior-changing implementation task starts with a failing Vitest or contract test task.

**Reviewability**: Primary surface is scheduler/runtime claim authority. Planned production files remain within the plan budget: `src/lib/migrations.ts`, `src/lib/task-claim-reconciliation.ts`, `src/lib/task-dispatch.ts`, `src/app/api/tasks/[id]/claim-reconciliation/route.ts`, `src/app/api/index/route.ts`, and `openapi.json`. Keep SPEC-013B out of sandbox, harness, adapter, runner, manual release/retry/cancel controls, primary dashboard UI, auto-merge, automatic triage, and Issue Remediation execution.

**Ratified exception**: The tasks-mode reviewability gate computes synthetic reviewable LOC as `task_count * 40`. SPEC-013B intentionally keeps 57 small TDD tasks so every claim/reconciliation behavior starts with a failing test, but the implementation remains constrained to the one-primary-surface plan budget: about 650 reviewable LOC, 5 production files, and about 14 total files. This exception accepts the task-list granularity warning without expanding scope beyond the plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or only adds independent failing coverage.
- **[Story]**: Maps a task to User Story 1, User Story 2, User Story 3, or User Story 4 from `spec.md`.
- Every task includes an exact file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare strict-scope configuration, shared fixtures, migration/rollback placeholders, and scope guardrails before story work.

- [x] T001 Verify reviewability scope against `specs/013b-claim-reconciliation/plan.md` and record any split decision in `specs/013b-claim-reconciliation/tasks.md`
- [x] T002 [P] Add SPEC-013B isolated strict-scope paths, including `src/lib/task-claim-reconciliation.ts`, `src/lib/__tests__/migrations-M78-task-stage-claims.test.ts`, `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`, and `src/lib/__tests__/task-claim-reconciliation.test.ts`, to `tsconfig.spec-strict.json`
- [x] T003 [P] Add all SPEC-013B planned TS module/test/fixture paths, including `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`, to `eslint.config.mjs`
- [x] T004 [P] Create reusable claim/reconciliation test fixture builders in `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`
- [x] T005 [P] Add rollback placeholder for M78 in `docs/migrations/rollback-M78.sql`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the database authority that all stories depend on. No user story implementation can proceed until this phase passes.

- [x] T006 [P] Add failing M78 migration tests for `task_stage_claims` table shape, indexes, active partial unique predicate, and `UNIQUE(task_stage_attempt_id)` in `src/lib/__tests__/migrations-M78-task-stage-claims.test.ts`
- [x] T007 [P] Add failing M78 migration tests for release reason CHECK vocabulary including `attempt_terminal_reconciled`, active `release_reason=NULL`, historical row coexistence, marker rerun idempotency, and rollback idempotency in `src/lib/__tests__/migrations-M78-task-stage-claims.test.ts`
- [x] T008 Implement additive migration `078_task_stage_claims` in `src/lib/migrations.ts`
- [x] T009 Implement idempotent manual rollback SQL for M78 in `docs/migrations/rollback-M78.sql`
- [x] T010 Run focused M78 migration test command from `specs/013b-claim-reconciliation/quickstart.md` and keep the result available for the implementation evidence packet

**Checkpoint**: M78 claim persistence and rollback coverage are ready.

---

## Phase 3: User Story 1 - Prevent Duplicate Stage Launch (Priority: P1) MVP

**Goal**: Concurrent scheduler ticks admit at most one launch handoff for the same eligible GitHub issue-linked assigned task stage.

**Independent Test**: Run concurrent same-stage claim acquisition and dispatch intake against one eligible task; verify one admitted launch path, duplicate-prevention evidence for competitors, and flag-off legacy parity.

### Tests for User Story 1

- [x] T011 [P] [US1] Add failing tests for canonical stage-key derivation, lease defaults/cap, one active claim per `(workspace_id, task_id, stage_key)`, and duplicate-prevented outcome in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T012 [P] [US1] Add failing stale recovery tests for expired active claim transition, distinct replacement attempt id, and late stale-owner release no-op in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T013 [P] [US1] Add failing dispatch integration tests for flag-off parity, flag-on one-claim/one-launch admission, duplicate-prevented skip, and release after launch handoff in `src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Implement claim enums, release reason vocabulary, stage-key derivation, lease normalization, and secret-safe metadata allowlist scaffolding in `src/lib/task-claim-reconciliation.ts`
- [x] T015 [US1] Implement `reconcileAndAcquireTaskStageClaim` active-claim insert, duplicate-prevention handling, attempt linkage, and claim acquisition activity writes in `src/lib/task-claim-reconciliation.ts`
- [x] T016 [US1] Implement stale active claim recovery and late stale-owner-safe release behavior in `src/lib/task-claim-reconciliation.ts`
- [x] T017 [US1] Integrate claim admission inside the `dispatchAssignedTasks` per-task loop before the legacy `in_progress` mutation in `src/lib/task-dispatch.ts`
- [x] T018 [US1] Release active claims with `launch_handoff_completed` or `dispatch_failed` around the existing launch handoff in `src/lib/task-dispatch.ts`
- [x] T019 [US1] Run focused US1 test commands for `src/lib/__tests__/task-claim-reconciliation.test.ts` and `src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Reconcile Tracker And Governance Truth Before Claim (Priority: P2)

**Goal**: Stale, terminal, non-issue-linked, or governance-blocked work does not acquire an active claim or launch.

**Independent Test**: Present assigned tasks with missing issue linkage, invalid repo identity, stale GitHub truth, terminal task/GitHub state, and governance block/defer; verify each avoids launch and records structured deferral evidence.

### Tests for User Story 2

- [x] T020 [P] [US2] Add failing eligibility tests for assigned state, assignee, canonical `owner/repo`, positive issue number, same-workspace sync owner, and local-only exclusion in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T021 [P] [US2] Add failing GitHub repository validation tests for URL, scp-like, path traversal, whitespace/control character, multi-segment, missing-owner, missing-repo, and `.git` suffix values in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T022 [P] [US2] Add failing stale GitHub truth and lifecycle health tests for missing `github_synced_at`, stale age threshold, disabled lifecycle, unhealthy lifecycle, and stale lease deferral in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T023 [P] [US2] Add failing governance tests for `allow`, `block`, and `defer` outcomes before claim acquisition in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T024 [P] [US2] Add failing terminal reconciliation tests for local `done`/`failed`, GitHub issue terminal, GitHub PR terminal, terminal passive attempt statuses `succeeded`/`failed`/`released`/`cancelled`, and non-terminal `awaiting_owner`/`ready_for_owner` behavior in `src/lib/__tests__/task-claim-reconciliation.test.ts`

### Implementation for User Story 2

- [x] T025 [US2] Implement `validateGitHubRepositoryFullName` and issue-linked assigned-task eligibility checks in `src/lib/task-claim-reconciliation.ts`
- [x] T026 [US2] Implement persisted GitHub truth freshness and SPEC-013A1 lifecycle health checks in `src/lib/task-claim-reconciliation.ts`
- [x] T027 [US2] Implement pre-claim resource governance evaluation and governance deferral/block evidence in `src/lib/task-claim-reconciliation.ts`
- [x] T028 [US2] Implement terminal local task, GitHub issue, GitHub PR, and passive attempt terminal reconciliation release/prevention in `src/lib/task-claim-reconciliation.ts`
- [x] T029 [US2] Wire dispatch skip handling for `not_claimable`, `stale_truth_deferred`, `governance_deferred`, `terminal_reconciled`, and `boundary_deferred` outcomes in `src/lib/task-dispatch.ts`
- [x] T030 [US2] Run focused US2 test command for `src/lib/__tests__/task-claim-reconciliation.test.ts`

**Checkpoint**: User Stories 1 and 2 both work independently without launching stale or gated work.

---

## Phase 5: User Story 3 - Persist Auditable Claim And Release Evidence (Priority: P3)

**Goal**: Claim, release, stale recovery, reconciliation deferral, and read-model evidence can reconstruct scheduler behavior without treating attempt status as the active lock.

**Independent Test**: Exercise claim acquisition, launch release, terminal release, governance deferral, stale recovery, payload sanitization, and the read-only API route; verify task-stage attempt links, activities, and no read-model side effects.

### Tests for User Story 3

- [x] T031 [P] [US3] Add failing structured activity and task-stage attempt event tests for acquired, duplicate-prevented, released, stale-recovered, governance-deferred, terminal-reconciled, stale-truth-deferred, boundary-deferred, and `task_stage_claim_not_claimable` / `not_claimable` outcomes in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T032 [P] [US3] Add failing payload safety tests for allowlisted metadata, secret-shaped value redaction/rejection, raw provider payload rejection, raw SQLite error suppression, and sanitized boundary categories in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T033 [P] [US3] Add failing read-only route tests for viewer/workspace scoping, `task_claim_reconciliation.v1` envelope, flag-off response shape, bounded history, attempt links, closed enums, OpenAPI registration, and no mutation affordances in `src/lib/__tests__/task-claim-reconciliation-route.test.ts`
- [x] T034 [P] [US3] Add failing read-only side-effect tests that snapshot row counts before/after GET for `tasks`, `task_stage_claims`, `task_stage_attempts`, `task_stage_attempt_events`, `activities`, `github_sync_lifecycle_controls`, and `github_sync_lifecycle_runs` in `src/lib/__tests__/task-claim-reconciliation-route.test.ts`

### Implementation for User Story 3

- [x] T035 [US3] Implement structured activity writers and task-stage attempt lifecycle metadata append paths in `src/lib/task-claim-reconciliation.ts`
- [x] T036 [US3] Implement positive allowlist validation and secret-shaped metadata redaction/rejection for persisted and exposed claim evidence in `src/lib/task-claim-reconciliation.ts`
- [x] T037 [US3] Implement `buildTaskClaimReconciliationReadModel` with closed states, closed reasons, bounded history, active claim, attempt links, diagnostics, and flag-off legacy shape in `src/lib/task-claim-reconciliation.ts`
- [x] T038 [US3] Implement read-only `GET /api/tasks/[id]/claim-reconciliation` with viewer auth and workspace scoping in `src/app/api/tasks/[id]/claim-reconciliation/route.ts`
- [x] T039 [US3] Register the read-only claim reconciliation route in `src/app/api/index/route.ts` and `openapi.json`
- [x] T040 [US3] Run focused US3 test commands for `src/lib/__tests__/task-claim-reconciliation.test.ts` and `src/lib/__tests__/task-claim-reconciliation-route.test.ts`

**Checkpoint**: User Story 3 provides auditable, read-only, side-effect-free evidence.

---

## Phase 6: User Story 4 - Preserve Dispatch And Successor Authority (Priority: P4)

**Goal**: SPEC-013B remains a narrow claim/reconciliation layer around assigned-task dispatch and does not introduce runner, sandbox, retry, manual controls, or successor-selection behavior.

**Independent Test**: Verify local-only and non-issue-linked tasks are excluded, successor selection remains outside the claim module, and dispatch behavior changes only at the assigned-task claim boundary.

### Tests for User Story 4

- [x] T041 [P] [US4] Add failing static import guard test proving `src/lib/task-claim-reconciliation.ts` does not import `advanceTaskChain`, `createTask`, runner, harness, sandbox, adapter, or external tracker clients in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [x] T042 [P] [US4] Add failing dispatch boundary tests proving SPEC-013B does not admit local-only, repo-only, arbitrary non-terminal, non-issue-linked, or non-`assigned` tasks into autonomous claim intake in `src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts`
- [x] T043 [P] [US4] Add failing boundary-error tests proving SQLite constraint races map to duplicate prevention while SQLite busy/database errors, malformed inputs, governance evaluator errors, release compare failures, and unknown exceptions fail closed for only that task in `src/lib/__tests__/task-claim-reconciliation.test.ts`

### Implementation for User Story 4

- [x] T044 [US4] Implement `classifyClaimBoundaryError` and sanitized `boundary_deferred` activity handling in `src/lib/task-claim-reconciliation.ts`
- [x] T045 [US4] Ensure `dispatchAssignedTasks` continues the scheduler tick after one claim/release boundary deferral and does not call successor-selection logic from the claim path in `src/lib/task-dispatch.ts`
- [x] T046 [US4] Remove or reject any SPEC-013B action URL, POST/PATCH/DELETE route, retry/release/cancel control, runner, harness, sandbox, adapter, auto-merge, automatic triage, or Issue Remediation execution code from `src/lib/task-claim-reconciliation.ts`, `src/lib/task-dispatch.ts`, `src/app/api/tasks/[id]/claim-reconciliation/route.ts`, `src/app/api/index/route.ts`, and `openapi.json`
- [x] T047 [US4] Run focused US4 test commands for `src/lib/__tests__/task-claim-reconciliation.test.ts` and `src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts`

**Checkpoint**: SPEC-013B preserves dispatch and successor authority boundaries.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Validate the complete feature, guard against scope drift, and prepare operator evidence.

- [x] T048 [P] Update the UAT replay guide with required fields from `specs/013b-claim-reconciliation/quickstart.md` in `specs/013b-claim-reconciliation/quickstart.md`
- [x] T049 [P] Verify Archive Sweep startup/dry-run evidence excludes current target `013b-claim-reconciliation` and preserves recovery-command policy in `specs/013b-claim-reconciliation/quickstart.md`
- [x] T050 Run `pnpm lint` using script definitions in `package.json`
- [x] T051 Run `pnpm typecheck` using script definitions in `package.json`
- [x] T052 Run focused Vitest commands from `specs/013b-claim-reconciliation/quickstart.md`
- [x] T053 Run `pnpm test` using `package.json` outside the Codex sandbox per repository guidance in `AGENTS.md`
- [x] T054 Run `pnpm build` using script definitions in `package.json`
- [x] T055 Run `pnpm test:e2e` using script definitions in `package.json`
- [x] T056 Run `pnpm test:all` using script definitions in `package.json`
- [x] T057 Generate or update the implementation evidence packet with focused test output, full gate output, reviewability scope, flag/rollback notes, and UAT replay instructions in `specs/013b-claim-reconciliation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories because M78 is the active claim authority.
- **Phase 3 User Story 1**: Depends on Phase 2 and is the MVP.
- **Phase 4 User Story 2**: Depends on Phase 2; can be implemented after or alongside US1 helper work once shared claim types exist, but must not bypass US1 duplicate-prevention semantics.
- **Phase 5 User Story 3**: Depends on claim/reconciliation outcomes from US1 and US2.
- **Phase 6 User Story 4**: Depends on US1 and US2 dispatch/helper boundaries; can add guard tests while US3 route work proceeds.
- **Phase 7 Polish**: Depends on all desired user stories.

### User Story Dependencies

- **User Story 1 (P1)**: MVP. Requires only foundational M78 work.
- **User Story 2 (P2)**: Requires M78 and shared helper types; extends the same claim boundary with tracker/governance truth.
- **User Story 3 (P3)**: Requires persisted outcomes from US1/US2 for read-model evidence.
- **User Story 4 (P4)**: Requires dispatch/helper boundaries from US1/US2; validates non-goals and successor isolation.

### Within Each User Story

- Write failing tests first and confirm they fail.
- Implement only enough code for that story's tests.
- Run the focused test command before moving to the next story.
- Preserve flag-off parity and closed enum vocabularies in every story.

---

## Parallel Opportunities

- T002, T003, T004, and T005 can run in parallel after T001.
- T006 and T007 can be written in parallel before T008/T009.
- T011, T012, and T013 can be written in parallel before US1 implementation.
- T020 through T024 can be written in parallel before US2 implementation.
- T031 through T034 can be written in parallel before US3 implementation.
- T041 through T043 can be written in parallel before US4 implementation.
- T048 and T049 can run in parallel once implementation is complete.

## Parallel Example: User Story 1

```bash
Task: "Add failing tests for canonical stage-key derivation, lease defaults/cap, one active claim per tuple, and duplicate-prevented outcome in src/lib/__tests__/task-claim-reconciliation.test.ts"
Task: "Add failing stale recovery tests for expired active claim transition, distinct replacement attempt id, and late stale-owner release no-op in src/lib/__tests__/task-claim-reconciliation.test.ts"
Task: "Add failing dispatch integration tests for flag-off parity, flag-on one-claim/one-launch admission, duplicate-prevented skip, and release after launch handoff in src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Add failing eligibility tests for assigned state, assignee, canonical owner/repo, positive issue number, same-workspace sync owner, and local-only exclusion in src/lib/__tests__/task-claim-reconciliation.test.ts"
Task: "Add failing stale GitHub truth and lifecycle health tests in src/lib/__tests__/task-claim-reconciliation.test.ts"
Task: "Add failing governance and terminal reconciliation tests in src/lib/__tests__/task-claim-reconciliation.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for duplicate stage-launch prevention.
3. Run the focused US1 tests.
4. Stop and validate exactly one admitted launch path plus flag-off parity before expanding to reconciliation cases.

### Incremental Delivery

1. Add M78 claim persistence and rollback coverage.
2. Add US1 duplicate-prevention authority.
3. Add US2 tracker/governance reconciliation.
4. Add US3 evidence/read model.
5. Add US4 scope guards and boundary-failure validation.
6. Run focused tests, full repo gates, and UAT replay preparation.

### Scope Guard

Do not add sandbox lifecycle, harness adapters, fake or real runners, manual release/retry/cancel controls, primary dashboard UI, auto-merge, automatic triage, Issue Remediation execution, local-only autonomous claim intake, `task_stage_attempts.status = running` active-lock semantics, or any `advanceTaskChain`/`createTask` call from the claim authority.
