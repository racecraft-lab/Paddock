# Tasks: Aegis Facility Singleton Refactor

**Input**: Design documents from `/specs/003-global-aegis/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm spec inputs and capture the live Aegis reference surface before implementation.

- [ ] T001 Confirm the spec artifact set and working tree scope in `specs/003-global-aegis/` and record the generated feature context from `specs/003-global-aegis/plan.md`
- [ ] T002 [P] Capture the exact live Aegis reference locations for the implementation baseline in `src/lib/task-dispatch.ts`, `src/lib/feature-flags.ts`, `src/lib/scheduler.ts`, `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/lib/validation.ts`, `src/components/panels/task-board-panel.tsx`, and `src/components/chat/chat-workspace.tsx`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared resolver contract, feature-flag behavior, and guardrail coverage needed by all user stories.

- [ ] T003 [P] Add resolver-focused Vitest coverage for `src/lib/aegis.ts` in `src/lib/__tests__/aegis.test.ts` to prove the module contract before implementation
- [ ] T004 [P] Extend feature-flag tests in `src/lib/__tests__/feature-flags.test.ts` and `src/lib/__tests__/feature-flags-route.test.ts` to cover `FEATURE_GLOBAL_AEGIS` workspace-context evaluation, malformed workspace flag JSON, env `0` kill switch behavior, env `1` non-enablement, and the `FEATURE_WORKSPACE_SWITCHER` dependency/preflight blocker
- [ ] T005 Add shared resolver helpers in `src/lib/aegis.ts` for `getAegis(db, workspace_id?)`, lowest-id tie breaking, workspace-first/global-first precedence, gateway fallback shape, and `aegis_local_shadowed` activity insertion
- [ ] T006 Update the task-dispatch contract tests in `src/lib/__tests__/task-dispatch.test.ts` to cover `resolveGatewayAgentIdForReviewAgent` with database-backed config, malformed config fallback, and the gateway `aegis` fallback

## Phase 3: User Story 1 - Workspace-First Compatibility (Priority: P1)

**Goal**: Keep `FEATURE_GLOBAL_AEGIS` off behavior workspace-first while preserving existing review gate semantics.

**Independent Test**: A workspace with a local Aegis row still resolves that row when the flag is off, and scheduler review dispatch completes with the same `quality_reviews.reviewer='aegis'` gate behavior.

- [ ] T007 [P] [US1] Add flag-off workspace-first resolver coverage in `src/lib/__tests__/aegis.test.ts` for local-row precedence and global fallback only when no local row exists
- [ ] T008 [US1] Implement the flag-off path in `src/lib/aegis.ts` so `getAegis(db, workspace_id?)` resolves workspace rows first, then global rows, and returns the gateway `aegis` fallback when no database row exists
- [ ] T009 [P] [US1] Add regression coverage in `src/lib/__tests__/task-dispatch.test.ts` for `runAegisReviews` preserving task selection, retry handling, and `quality_reviews.reviewer='aegis'` gate checks while sourcing the reviewer through `getAegis`

## Phase 4: User Story 2 - Facility-Wide Aegis (Priority: P2)

**Goal**: Enable a single global Aegis row to serve workspaces that do not have a local Aegis row.

**Independent Test**: A workspace with no local Aegis row resolves the global Aegis row when the flag is on, and repeated resolver calls do not change the review gate contract.

- [ ] T010 [P] [US2] Add flag-on global-first resolver coverage in `src/lib/__tests__/aegis.test.ts` for global-only lookup and workspace fallback when the global row is missing
- [ ] T011 [US2] Implement the flag-on path in `src/lib/aegis.ts` so `getAegis(db, workspace_id?)` prefers the global singleton for workspace-scoped review dispatch
- [ ] T012 [P] [US2] Wire `runAegisReviews` in `src/lib/task-dispatch.ts` to call `getAegis(db, task.workspace_id)` and keep gateway routing through `resolveGatewayAgentIdForReviewAgent`

## Phase 5: User Story 3 - Shadowed Local Visibility (Priority: P3)

**Goal**: Preserve legacy local fallback while recording shadowed-local audit activity when the global row wins.

**Independent Test**: When both local and global Aegis rows exist under the enabled flag, the global row is chosen and exactly one `aegis_local_shadowed` activity exists for the requested workspace/global/local tuple.

- [ ] T013 [P] [US3] Add shadow-audit coverage in `src/lib/__tests__/aegis.test.ts` for idempotent `activities` insertion when global Aegis shadows a local row
- [ ] T014 [US3] Implement idempotent `aegis_local_shadowed` activity writes in `src/lib/aegis.ts` with the requested workspace id, global agent id, local agent id, actor `system`, and deterministic data payload
- [ ] T015 [P] [US3] Update scheduler and task-dispatch regression tests in `src/lib/__tests__/task-dispatch.test.ts` to prove repeated ticks do not duplicate the shadow audit row and still fall back to gateway `aegis` when no database Aegis row exists

## Phase 6: Aegis Reference Sweep & Contract Preservation

**Purpose**: Update the smallest remaining task, validation, and UI/chat reference surfaces so they keep the same reviewer contract without introducing task-pipeline behavior.

- [ ] T016 [P] Refactor the task route approval gate checks in `src/app/api/tasks/route.ts` and `src/app/api/tasks/[id]/route.ts` to keep using `quality_reviews.reviewer='aegis'` while avoiding any `quality_reviews.agent_id` dependency
- [ ] T017 [P] Update validation defaults and Aegis-facing display references in `src/lib/validation.ts`, `src/components/panels/task-board-panel.tsx`, and `src/components/chat/chat-workspace.tsx` so they reflect the shared resolver source without adding task pipeline or `ready_for_owner` behavior
- [ ] T018 Add prohibited-drift grep guardrails in `specs/003-global-aegis/quickstart.md` or a companion verification note under `specs/003-global-aegis/` for inline `process.env.FEATURE_GLOBAL_AEGIS` reads, direct Aegis lookup bypasses, `aegisAgentByWorkspace`, `quality_reviews.agent_id`, and downstream leakage into `FEATURE_TASK_PIPELINES`, `ready_for_owner`, `FEATURE_AREA_LABEL_ROUTING`, artifact store, governance, pilot behavior, product-line skill/session ownership, multi-facility modeling, or CrabTrap

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification that the resolver, routes, and guardrails behave as specified.

- [ ] T019 Run focused verification for `src/lib/__tests__/aegis.test.ts`, `src/lib/__tests__/task-dispatch.test.ts`, `src/lib/__tests__/feature-flags.test.ts`, `src/lib/__tests__/feature-flags-route.test.ts`, `src/app/api/tasks/route.ts`, and `src/app/api/tasks/[id]/route.ts`
- [ ] T020 Run the static guardrail commands from `specs/003-global-aegis/quickstart.md` and confirm zero matches for direct Aegis bypasses outside `src/lib/aegis.ts`
- [ ] T021 Update `specs/003-global-aegis/quickstart.md` status notes after verification so the documented checks match the implemented resolver and review-gate behavior

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 must complete before Phase 2.
- Phase 2 blocks all user story work.
- Phase 3, Phase 4, and Phase 5 follow in priority order and each depends on Phase 2.
- Phase 6 depends on the resolver and dispatch work from Phases 2-5.
- Phase 7 depends on all implementation and reference updates.

### User Story Dependencies

- US1 is the compatibility baseline and should land first.
- US2 depends on the shared resolver and feature-flag behavior established for US1.
- US3 depends on the global-first resolver path and audit write support from US2.

### Parallel Execution Examples

- Phase 1:
  - `T002` can run while `T001` is being completed.
- Phase 2:
  - `T003` and `T004` can run in parallel because they touch different test files.
- US1:
  - `T007` and `T009` can run in parallel after `T005` exists.
- US2:
  - `T010` can run in parallel with `T012` once `T008` is stable.
- US3:
  - `T013` and `T015` can run in parallel after `T014` is in place.

## Implementation Strategy

### MVP First

1. Complete Phases 1 and 2.
2. Deliver US1 in Phase 3.
3. Validate the workspace-first regression path before expanding scope.

### Incremental Delivery

1. Land the shared resolver in `src/lib/aegis.ts`.
2. Switch scheduler dispatch to the resolver.
3. Add global-first behavior and shadow-audit writes.
4. Finish the route, validation, UI/chat reference sweep, then run guardrails.

