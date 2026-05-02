# Tasks: SPEC-005 ready_for_owner State and Two-Step Terminal Event

**Input**: Design documents from `specs/005-ready-for-owner/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `docs/ai/specs/SPEC-005-design-concept.md`, and roadmap P4 acceptance criteria recorded in `docs/ai/specs/SPEC-005-workflow.md`
**Tests**: Required. SPEC-005 is TDD-first and must use red-green-refactor for transition guards, GitHub merge handling, notification behavior, labels, and Kanban UI.

**Scope guard**: Do not add DB migrations, task status DB CHECKs, a terminal-event table, issue timeline inference, operator override policy, SPEC-007 artifacts, SPEC-008 governance, SPEC-009 pilot seed behavior, SPEC-010 onboarding, or SPEC-011 CrabTrap behavior.

## Phase 1: Setup and Status Hygiene Verification

**Purpose**: Confirm the pre-SPEC status hygiene was already completed and prepare strict project surfaces for SPEC-005 implementation.

- [X] T001 Verify Phase 0 status hygiene and Archive Sweep evidence are already recorded in `docs/ai/specs/SPEC-005-workflow.md` and `docs/ai/specs/autopilot-state.json`, with no new status-hygiene edits required before runtime work.
- [X] T002 Verify no SPEC-005 migration, task status DB CHECK, enum constraint, or terminal-event table exists by checking `src/lib/migrations.ts`, `docs/migrations`, and `specs/005-ready-for-owner/`.
- [X] T003 [P] Add planned strict-scope inclusion for `src/lib/task-status.ts` in `tsconfig.spec-strict.json`.
- [X] T004 [P] Add planned lint inclusion for `src/lib/task-status.ts` in `eslint.config.mjs`.
- [X] T005 [P] Confirm package-manager command map uses `pnpm` by checking `pnpm-lock.yaml` before running SPEC-005 build, lint, typecheck, and test commands.

---

## Phase 2: Foundational Status Vocabulary and Shared Transition Boundary

**Purpose**: Create the shared application-level status vocabulary and feature-flag-aware write guard that every story depends on.

**Critical**: No user story work can complete until this shared guard exists, because every live path that can write `done` must call the same transition decision.

- [X] T006 [P] Add failing red tests for `TASK_STATUSES`, `READY_FOR_OWNER_STATUS`, `READY_FOR_OWNER_TERMINAL_EVENT`, and `transitionConflict()` in `src/lib/__tests__/task-status.test.ts`.
- [X] T007 [P] Add failing red tests for flag OFF, flag ON with `produces_pr=false`, flag ON with `produces_pr=true`, blocked non-merge `done`, and flag OFF `ready_for_owner` writes in `src/lib/__tests__/task-status.test.ts`.
- [X] T008 Implement `src/lib/task-status.ts` with `ready_for_owner` vocabulary, `github_pr_merged` terminal event constant, `ready_for_owner_pr_merge_required` conflict body, and `resolveTaskTerminalTransition()`.
- [X] T009 Refactor `src/lib/task-status.ts` to keep read vocabulary separate from write authorization and to accept workspace flag context without reading `process.env` directly.
- [X] T010 [P] Add failing red tests proving static read schemas accept existing `ready_for_owner` rows while write validation still delegates to the transition guard in `src/lib/__tests__/validation.test.ts`.
- [X] T011 Update `src/lib/validation.ts` to include `ready_for_owner` in read/status vocabulary and to guard new writes through `src/lib/task-status.ts`.
- [X] T012 [P] Add `ready_for_owner` to exported task status types and counters in `src/store/index.ts`.
- [X] T013 [P] Add `ready_for_owner` to package-level exported task status unions in `src/index.ts`.
- [X] T014 Run the focused foundational red-green-refactor check with `pnpm test src/lib/__tests__/task-status.test.ts src/lib/__tests__/validation.test.ts`.

**Checkpoint**: Application-level vocabulary exists, reads can return `ready_for_owner`, and every implementation path can call a single transition guard.

---

## Phase 3: User Story 1 - Preserve Existing Completion Behavior When Disabled (Priority: P1)

**Goal**: With `FEATURE_TWO_STEP_TERMINAL` disabled, existing completion behavior remains intact and existing `ready_for_owner` rows stay readable and visible while new writes into that state are blocked.

**Independent Test**: Disable the flag, approve PR-producing and non-PR-producing tasks, verify both complete to `done`, verify an existing `ready_for_owner` row is readable and visible, and verify a new write into `ready_for_owner` is rejected or normalized.

### Tests for User Story 1

- [X] T015 [P] [US1] Add failing red tests for flag OFF existing `ready_for_owner` row reads and new `ready_for_owner` write blocking in `src/lib/__tests__/task-status.test.ts`.
- [X] T016 [P] [US1] Add failing red tests proving flag OFF Aegis approval for PR-producing and non-PR-producing tasks still writes `done` in `src/lib/__tests__/task-dispatch.test.ts`.
- [X] T017 [P] [US1] Add failing red tests proving flag OFF quality-review approval still writes `done` in `src/app/api/quality-review/__tests__/route.test.ts`.
- [X] T018 [P] [US1] Add failing red tests proving flag OFF bulk and detail task updates do not create new `ready_for_owner` writes in `src/lib/__tests__/tasks-route-ready-for-owner.test.ts`.

### Implementation for User Story 1

- [X] T019 [US1] Update `src/lib/task-dispatch.ts` so flag OFF Aegis approvals preserve current `quality_review` to `done` behavior for all templates.
- [X] T020 [US1] Update `src/app/api/tasks/[id]/route.ts` and `src/app/api/tasks/route.ts` so flag OFF new writes into `ready_for_owner` are blocked or normalized before mutation.
- [X] T021 [US1] Update `src/app/api/quality-review/route.ts` so flag OFF approvals preserve existing direct `done` behavior and do not emit ready-for-owner side effects.
- [X] T022 [US1] Refactor the flag OFF transition guard calls in `src/lib/task-dispatch.ts`, `src/app/api/quality-review/route.ts`, `src/app/api/tasks/route.ts`, and `src/app/api/tasks/[id]/route.ts` to use the shared helper consistently.
- [X] T023 [US1] Run `pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/tasks-route-ready-for-owner.test.ts`.

**Checkpoint**: P4-AC1 is covered and independently testable.

---

## Phase 4: User Story 2 - Route Approved PR-Producing Work To Owner Merge Gate (Priority: P1)

**Goal**: With the flag enabled, approved PR-producing work stops at `ready_for_owner`, approved non-PR work still reaches `done`, no chain advancement runs at `ready_for_owner`, and missing PR linkage creates operator action evidence.

**Independent Test**: Enable the flag, approve one `produces_pr=false` task and one `produces_pr=true` task, verify only the PR-producing task stops at `ready_for_owner`, verify missing PR linkage activity/notification, and verify `advanceTaskChain` is not called.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add failing red tests for flag ON with `produces_pr=false` direct Aegis and quality-review completion in `src/lib/__tests__/task-dispatch.test.ts` and `src/app/api/quality-review/__tests__/route.test.ts`.
- [ ] T025 [P] [US2] Add failing red tests for flag ON with `produces_pr=true` routing Aegis and quality-review approval to `ready_for_owner` in `src/lib/__tests__/task-dispatch.test.ts` and `src/app/api/quality-review/__tests__/route.test.ts`.
- [ ] T026 [P] [US2] Add failing red tests for missing explicit PR linkage creating ready-for-owner activity and notification without completing the task in `src/lib/__tests__/task-dispatch.test.ts`.
- [ ] T027 [P] [US2] Add failing red tests proving `advanceTaskChain` is not called when approval moves a task to `ready_for_owner` in `src/lib/__tests__/task-dispatch.test.ts`.

### Implementation for User Story 2

- [ ] T028 [US2] Update `src/lib/task-dispatch.ts` to load workflow template `produces_pr` and `external_terminal_event` for reviewable tasks before approved transitions.
- [ ] T029 [US2] Update `src/lib/task-dispatch.ts` to route approved PR-producing tasks to `ready_for_owner` when the workspace flag is ON and leave non-PR tasks on the existing `done` path.
- [ ] T030 [US2] Update `src/app/api/quality-review/route.ts` to use the same guard outcome for approved reviews, including `ready_for_owner` routing and direct `done` completion.
- [ ] T031 [US2] Add missing PR linkage activity and `task_ready_for_owner` notification creation in `src/lib/task-dispatch.ts` for PR-producing tasks that enter `ready_for_owner` without `github_repo` or `github_pr_number`.
- [ ] T032 [US2] Refactor ready-for-owner entry side effects in `src/lib/task-dispatch.ts` and `src/app/api/quality-review/route.ts` so chain advancement, notification, label sync, and activity ordering are deterministic.
- [ ] T033 [US2] Run `pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts`.

**Checkpoint**: P4-AC2 and P4-AC3 are covered and independently testable.

---

## Phase 5: User Story 3 - Complete PR-Producing Work Only After Verified Merge (Priority: P1)

**Goal**: A PR-producing task reaches `done` only after explicit linked PR merge evidence, while every non-merge completion path returns the uniform side-effect-free `409 Conflict`.

**Independent Test**: Put a PR-producing task in `ready_for_owner` with explicit PR linkage, reconcile merged and unmerged terminal evidence, and attempt Aegis, quality-review, bulk, detail, failed-to-done, and closed-issue completion paths.

### Tests for User Story 3

- [ ] T034 [P] [US3] Add failing red tests for uniform `409 Conflict` response shape from `transitionConflict()` in `src/lib/__tests__/task-status.test.ts`.
- [ ] T035 [P] [US3] Add failing red tests for side-effect-free blocked bulk `done` writes with all affected `task_ids` in `src/lib/__tests__/tasks-route-ready-for-owner.test.ts`.
- [ ] T036 [P] [US3] Add failing red tests for side-effect-free blocked detail `done` writes with a one-item `task_ids` array in `src/lib/__tests__/tasks-route-ready-for-owner.test.ts`.
- [ ] T037 [P] [US3] Add failing red tests for blocked quality-review and Aegis non-merge attempts to write PR-producing tasks to `done` in `src/app/api/quality-review/__tests__/route.test.ts` and `src/lib/__tests__/task-dispatch.test.ts`.
- [ ] T038 [P] [US3] Add failing red tests for failed-to-done recovery attempts being blocked by the same guard in `src/lib/__tests__/tasks-route-ready-for-owner.test.ts`.
- [ ] T039 [P] [US3] Add failing red tests for `pullFromGitHub(project, workspaceId, { webhookFixture })` accepting test-only terminal evidence while production callsites pass no fixture in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [ ] T040 [P] [US3] Add failing red tests for matched merged PR evidence moving `ready_for_owner` to `done` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [ ] T041 [P] [US3] Add failing red tests for closed issue without merged linked PR leaving the task in `ready_for_owner` and deduping reconciliation activity/notification in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [ ] T042 [P] [US3] Add failing red tests proving `advanceTaskChain` runs only after verified PR merge successfully writes `done` with trigger `github_pr_merged` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.

### Implementation for User Story 3

- [ ] T043 [US3] Update `src/app/api/tasks/route.ts` to preflight bulk `done` updates, return uniform `409 Conflict`, and avoid partial status, activity, notification, label, timestamp, or chain side effects.
- [ ] T044 [US3] Update `src/app/api/tasks/[id]/route.ts` to guard detail `done` and `ready_for_owner` writes before mutation and return the one-id conflict body when blocked.
- [ ] T045 [US3] Update `src/lib/github-sync-engine.ts` to add optional `opts?: { webhookFixture?: GitHubTerminalFixture }`, match explicit `github_repo` plus `github_pr_number`, and accept merge evidence only from `merged=true`, `merged_at`, or `merge_commit_sha`.
- [ ] T046 [US3] Update `src/lib/github-sync-engine.ts` so verified linked PR merge writes `done`, sets completion state through existing behavior, and calls `advanceTaskChain` only after the successful write with `github_pr_merged`.
- [ ] T047 [US3] Update `src/lib/github-sync-engine.ts` so closed linked issues without merged PR evidence leave tasks in `ready_for_owner`, write one `github_terminal_reconciliation_required` activity, and create one deduped `task_ready_for_owner` reconciliation notification.
- [ ] T048 [US3] Refactor `src/lib/github-sync-engine.ts`, `src/app/api/tasks/route.ts`, and `src/app/api/tasks/[id]/route.ts` to keep issue timeline inference, operator overrides, and terminal-event table behavior out of SPEC-005.
- [ ] T049 [US3] Run `pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts src/lib/__tests__/tasks-route-ready-for-owner.test.ts src/lib/__tests__/task-status.test.ts`.

**Checkpoint**: P4-AC4, P4-AC4a, P4-AC4b, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016a, FR-021, and FR-022 are covered and independently testable.

---

## Phase 6: User Story 4 - Show A Dedicated Ready For Owner Lane And Label (Priority: P2)

**Goal**: Operators can see waiting-for-merge tasks in a dedicated accessible Kanban lane, and linked GitHub issues receive the idempotent `mc:ready-for-owner` status label.

**Independent Test**: Move tasks into `quality_review`, `ready_for_owner`, `awaiting_owner`, and `done`, view Kanban, verify lane order/accessibility, and verify linked GitHub issues receive the label without duplicate status labels.

### Tests for User Story 4

- [ ] T050 [P] [US4] Add failing red tests for `mc:ready-for-owner` label mapping, color `14b8a6`, description `Mission Control: ready for owner`, inverse mapping, and status-label replacement in `src/lib/__tests__/github-label-map.test.ts`.
- [ ] T051 [P] [US4] Add failing red tests for label application when a task enters `ready_for_owner` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [ ] T052 [P] [US4] Add failing Playwright test for Kanban lane order, existing `ready_for_owner` visibility with flag OFF, and distinct `awaiting_owner` placement in `tests/e2e/ready-for-owner-kanban.spec.ts`.
- [ ] T053 [P] [US4] Add failing Playwright accessibility assertions for `Ready for Owner` lane region name including count, keyboard-reachable task cards, and visible focus behavior in `tests/e2e/ready-for-owner-kanban.spec.ts`.

### Implementation for User Story 4

- [ ] T054 [US4] Update `src/lib/github-label-map.ts` to provision and map `ready_for_owner` to `mc:ready-for-owner` idempotently and replace prior `mc:*` status labels.
- [ ] T055 [US4] Update `src/lib/github-sync-engine.ts` and ready-for-owner entry callsites to apply `mc:ready-for-owner` when a task enters `ready_for_owner`.
- [ ] T056 [US4] Update `src/components/panels/task-board-panel.tsx` so `ready_for_owner` renders between `quality_review` and `done`, uses teal styling, and leaves `awaiting_owner` semantics and placement unchanged.
- [ ] T057 [US4] Update `messages/en.json`, `messages/es.json`, `messages/fr.json`, `messages/de.json`, `messages/ja.json`, `messages/ko.json`, `messages/pt.json`, `messages/ru.json`, `messages/zh.json`, and `messages/ar.json` with Ready for Owner lane and status copy.
- [ ] T058 [US4] Refactor `src/components/panels/task-board-panel.tsx` so the lane has a screen-reader-identifiable region name with the `Ready for Owner` label and task count, and owner-merge meaning is never represented by teal styling alone.
- [ ] T059 [US4] Run `pnpm test src/lib/__tests__/github-label-map.test.ts src/lib/__tests__/github-sync-ready-for-owner.test.ts` and `pnpm test:e2e tests/e2e/ready-for-owner-kanban.spec.ts`.

**Checkpoint**: P4-AC5, P4-AC6, FR-017, FR-019, FR-019a, FR-020, and SC-006 are covered and independently testable.

---

## Phase 7: User Story 5 - Notify Owners That Merge Action Is Required (Priority: P2)

**Goal**: Assignees or creators receive distinct action-required notifications when tasks enter `ready_for_owner` or when reconciliation finds a closed issue without merged PR evidence.

**Independent Test**: Move a task into `ready_for_owner` and reconcile a closed issue without merged PR evidence, then verify notification type, title, message, recipient fallback, panel rendering, delivery formatting, and accessible action-required text.

### Tests for User Story 5

- [ ] T060 [P] [US5] Add failing red tests for normal `task_ready_for_owner` notification creation with assignee-first and creator-fallback routing in `src/lib/__tests__/db-helpers.test.ts`.
- [ ] T061 [P] [US5] Add failing red tests for reconciliation `task_ready_for_owner` notification title, message, source fields, and dedupe behavior in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [ ] T062 [P] [US5] Add failing red tests for notification delivery formatting with `Owner action required` wording in `src/app/api/notifications/deliver/__tests__/route.test.ts`.
- [ ] T063 [P] [US5] Add failing component or route-level tests for notification panel rendering of `Ready for owner merge` and `Owner merge reconciliation required` in `src/components/panels/__tests__/notifications-panel.test.tsx`.
- [ ] T064 [P] [US5] Add Playwright assertions that unread ready-for-owner notification actions are keyboard reachable, visibly focused, and identifiable by title/message/type text in `tests/e2e/ready-for-owner-kanban.spec.ts`.

### Implementation for User Story 5

- [ ] T065 [US5] Update `src/lib/db.ts` notification creation helpers or callsites so `task_ready_for_owner` rows use `source_type="task"`, `source_id=<task id>`, and assignee then creator fallback routing.
- [ ] T066 [US5] Update `src/components/panels/notifications-panel.tsx` to render normal and reconciliation `task_ready_for_owner` notifications with action-required wording on existing card surfaces.
- [ ] T067 [US5] Update `src/app/api/notifications/deliver/route.ts` so `formatNotificationMessage` includes `Owner action required` for `task_ready_for_owner`.
- [ ] T068 [US5] Update `messages/en.json`, `messages/es.json`, `messages/fr.json`, `messages/de.json`, `messages/ja.json`, `messages/ko.json`, `messages/pt.json`, `messages/ru.json`, `messages/zh.json`, and `messages/ar.json` with normal and reconciliation notification copy.
- [ ] T069 [US5] Refactor ready-for-owner notification callsites in `src/lib/task-dispatch.ts`, `src/app/api/quality-review/route.ts`, and `src/lib/github-sync-engine.ts` so notification payloads are consistent and reconciliation dedupe keys are unchanged-task, issue, and reason.
- [ ] T070 [US5] Run `pnpm test src/lib/__tests__/db-helpers.test.ts src/app/api/notifications/deliver/__tests__/route.test.ts src/lib/__tests__/github-sync-ready-for-owner.test.ts` and `pnpm test:e2e tests/e2e/ready-for-owner-kanban.spec.ts`.

**Checkpoint**: FR-016, FR-018, FR-019a, SC-005, and SC-006 notification requirements are covered and independently testable.

---

## Phase 8: Polish, Guardrails, and Final Verification

**Purpose**: Validate cross-cutting scope boundaries, run the command map, and record completion evidence without widening into downstream specs.

- [ ] T071 [P] Add guardrail grep evidence for no DB migration, no task status DB CHECK, no terminal-event table, no issue timeline inference, and no operator override in `specs/005-ready-for-owner/quickstart.md`.
- [ ] T072 [P] Add implementation evidence notes for P4-AC1 through P4-AC6 and FR-019a/SC-006 accessibility coverage in `specs/005-ready-for-owner/quickstart.md`.
- [ ] T073 [P] Verify production GitHub sync callsites pass no `{ webhookFixture }` by checking `src/app/api/github/sync/route.ts`, `src/app/api/github/route.ts`, and `src/lib/github-sync-engine.ts`.
- [ ] T074 Run `pnpm typecheck` from the repository root.
- [ ] T075 Run `pnpm lint` from the repository root.
- [ ] T076 Run `pnpm test` from the repository root.
- [ ] T077 Run `pnpm build` from the repository root.
- [ ] T078 Run `pnpm test:e2e` from the repository root.
- [ ] T079 Update SPEC-005 implementation tracking in `docs/ai/specs/SPEC-005-workflow.md` after implementation evidence is complete, without marking downstream SPEC-007, SPEC-008, SPEC-009, SPEC-010, or SPEC-011 artifacts complete.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 - Setup and Status Hygiene Verification**: No dependencies.
- **Phase 2 - Foundational Status Vocabulary and Shared Transition Boundary**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 - US1 Flag OFF rollback behavior**: Depends on Phase 2.
- **Phase 4 - US2 Owner merge gate routing**: Depends on Phase 2 and can run after US1 tests define flag OFF baselines.
- **Phase 5 - US3 Verified merge completion and blocked non-merge paths**: Depends on Phase 2 and the ready-for-owner entry behavior from US2.
- **Phase 6 - US4 Kanban lane and GitHub label**: Depends on Phase 2 and can proceed in parallel with US5 after ready-for-owner entry callsites exist.
- **Phase 7 - US5 Notifications**: Depends on Phase 2 and can proceed in parallel with US4 after ready-for-owner entry callsites exist.
- **Phase 8 - Polish, Guardrails, and Final Verification**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1 (P1)**: MVP rollback safety. Can start after Phase 2.
- **US2 (P1)**: Core routing. Can start after Phase 2; uses US1 baselines to prevent flag OFF regression.
- **US3 (P1)**: Merge authority. Requires ready-for-owner entry behavior from US2.
- **US4 (P2)**: Operator lane and label. Requires status vocabulary and ready-for-owner entry callsites.
- **US5 (P2)**: Owner notifications. Requires status vocabulary and ready-for-owner entry callsites.

### Acceptance Criteria Coverage

- **P4-AC1**: T015, T016, T017, T018, T019, T020, T021, T022, T023, T052.
- **P4-AC2**: T024, T028, T029, T030, T033.
- **P4-AC3**: T025, T026, T027, T029, T030, T031, T032, T033.
- **P4-AC4**: T039, T040, T042, T045, T046, T049.
- **P4-AC4a**: T041, T047, T061, T069, T070.
- **P4-AC4b**: T024, T028, T029, T033.
- **P4-AC5**: T052, T053, T056, T058, T059.
- **P4-AC6**: T050, T051, T054, T055, T059.
- **FR-019a / SC-006 accessibility remediation**: T053, T058, T064, T066, T067, T070.

---

## Parallel Execution Examples

### User Story 1

```text
Task: "Add failing red tests for flag OFF existing ready_for_owner row reads and new ready_for_owner write blocking in src/lib/__tests__/task-status.test.ts"
Task: "Add failing red tests proving flag OFF Aegis approval for PR-producing and non-PR-producing tasks still writes done in src/lib/__tests__/task-dispatch.test.ts"
Task: "Add failing red tests proving flag OFF quality-review approval still writes done in src/app/api/quality-review/__tests__/route.test.ts"
Task: "Add failing red tests proving flag OFF bulk and detail task updates do not create new ready_for_owner writes in src/lib/__tests__/tasks-route-ready-for-owner.test.ts"
```

### User Story 3

```text
Task: "Add failing red tests for side-effect-free blocked bulk done writes with all affected task_ids in src/lib/__tests__/tasks-route-ready-for-owner.test.ts"
Task: "Add failing red tests for matched merged PR evidence moving ready_for_owner to done in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
Task: "Add failing red tests proving advanceTaskChain runs only after verified PR merge successfully writes done with trigger github_pr_merged in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
```

### User Stories 4 and 5

```text
Task: "Add failing Playwright accessibility assertions for Ready for Owner lane region name including count, keyboard-reachable task cards, and visible focus behavior in tests/e2e/ready-for-owner-kanban.spec.ts"
Task: "Add failing red tests for normal task_ready_for_owner notification creation with assignee-first and creator-fallback routing in src/lib/__tests__/db-helpers.test.ts"
Task: "Update src/lib/github-label-map.ts to provision and map ready_for_owner to mc:ready-for-owner idempotently and replace prior mc:* status labels"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1, US2, and US3 in order.
3. Stop and validate the core terminal contract with focused Vitest tests.
4. Proceed to US4 and US5 operator visibility only after the core transition behavior is stable.

### Red-Green-Refactor Discipline

1. Write each story's failing tests first.
2. Implement the smallest code path that makes the focused tests pass.
3. Refactor shared side-effect ordering and helper boundaries only after tests pass.
4. Re-run focused tests after each story, then run the full command map in Phase 8.

### Final Command Map

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```
