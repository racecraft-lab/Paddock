# Tasks: SPEC-013A Run-State Persistence Spine

**Input**: Design documents from `specs/013a-run-state-spine/`
**Prerequisites**: `specs/013a-run-state-spine/plan.md`, `specs/013a-run-state-spine/spec.md`, `specs/013a-run-state-spine/research.md`, `specs/013a-run-state-spine/data-model.md`, `specs/013a-run-state-spine/contracts/task-stage-attempts-api.md`, `specs/013a-run-state-spine/quickstart.md`, `docs/ai/specs/SPEC-013A-design-concept.md`
**Package manager**: `pnpm` from `pnpm-lock.yaml`

**Tests**: Required. Constitution and spec require TDD-first migration/helper/route/component/guard/Playwright coverage. RED tests must be committed before implementation tasks for the same behavior.

**Reviewability checkpoint**: Transition exception ratified for this tasks phase because SPEC-013A intentionally spans schema, helper, route, and compact UI as the minimum durable run-state spine. Stop if implementation expands beyond the planned primary files in `specs/013a-run-state-spine/plan.md` or introduces any fixture write endpoint, claim/retry/release/cancel controls, scheduler launch, GitHub reconciliation, sandbox lifecycle, harness adapter, or auto-merge behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel only when file ownership is disjoint
- **[Story]**: Maps to user stories in `specs/013a-run-state-spine/spec.md`
- All tasks include exact file paths

---

## Phase 1: Setup and Scope Guardrails

**Purpose**: Confirm implementation boundaries and add failing guard/test scaffolding before production edits.

- [x] T001 Confirm `pnpm-lock.yaml` is the package-manager source and record the `pnpm` decision in `specs/013a-run-state-spine/tasks.md`
- [x] T002 [P] Add RED strict-scope entries for SPEC-013A planned modules in `tsconfig.spec-strict.json`
- [x] T003 [P] Add RED lint/strict coverage for SPEC-013A planned modules in `eslint.config.mjs`
- [x] T004 [P] Add RED forbidden-scope guard fixtures for attempt table/runtime isolation and direct production task inserts in `scripts/spec-013a/check-run-state-scope-guards.mjs`
- [x] T005 [P] Add RED API documentation/index assertions for `GET /api/tasks/[id]/stage-attempts` in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [x] T006 Record Archive Sweep startup/dry-run evidence, current-target exclusion, and screenshot artifact policy in `docs/ai/specs/SPEC-013A-workflow.md`
- [x] T007 Verify reviewability budget against `specs/013a-run-state-spine/plan.md` and record continue/split decision in `docs/ai/specs/SPEC-013A-workflow.md`

---

## Phase 2: Foundational Migration, Flag, and Helper Spine

**Purpose**: Build the shared persistence and model layer required before any user story can pass.

**Critical**: No user story implementation can begin until this phase is complete.

- [x] T008 [P] Add RED migration tests for idempotent migration `076_task_stage_attempts`, required tables, columns, status checks, uniqueness, and inspection indexes in `src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts`
- [x] T009 [P] Add RED rollback SQL tests for child-first drops, marker cleanup, foreign-key check guidance, and operator history-loss warning in `src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts`
- [x] T010 [P] Add RED helper tests for lifecycle vocabulary, create attempt, append lifecycle event, projection update transactionality, optional `run_id`, ordering, and bounded metadata in `src/lib/__tests__/task-stage-attempts.test.ts`
- [x] T011 [P] Add RED helper tests for unknown-state fail-closed writes, invalid stored-state reads, lifecycle snippet max of 10, missing/unavailable run summaries, and projection-drift warnings in `src/lib/__tests__/task-stage-attempts.test.ts`
- [x] T012 Add default-off `FEATURE_TASK_CONTROL_PLANE` typed registry test coverage using `resolveFlag` in `src/lib/__tests__/feature-flags.test.ts`
- [x] T013 Implement migration `076_task_stage_attempts` for `task_stage_attempts` and `task_stage_attempt_events` in `src/lib/migrations.ts`
- [x] T014 Add idempotent rollback SQL for migration `076_task_stage_attempts` in `docs/migrations/rollback-M76.sql`
- [x] T015 Add `FEATURE_TASK_CONTROL_PLANE` as a default-off typed registry entry in `src/lib/feature-flags.ts`
- [x] T016 Implement task-stage attempt validation, lifecycle append, projection update, archive projection, run summary serialization, ordering, and warning helpers in `src/lib/task-stage-attempts.ts`
- [x] T017 Implement SPEC-013A scope guardrails for inline flag reads, runtime table references/imports, direct production `INSERT INTO tasks`, and SPEC-013B/014 drift in `scripts/spec-013a/check-run-state-scope-guards.mjs`
- [x] T018 Run the focused foundational RED-to-green tests and record results in `docs/ai/specs/SPEC-013A-workflow.md`

**Checkpoint**: Foundation ready. Migration, rollback, feature flag, helper, and scope guards are available for user-story work.

---

## Phase 3: User Story 1 - Inspect Task-Stage Attempt State (Priority: P1) MVP

**Goal**: Authenticated operators can inspect durable task-stage attempts, lifecycle history, current projection, archive evidence, workflow context, and optional runtime-run linkage through a dedicated read route and compact task-detail section.

**Independent Test**: Seed representative attempts with no run, linked run, missing run, multiple attempts, invalid stored state, and projection drift; verify the route and task detail UI expose the `task_stage_attempts.v1` envelope and read-only UI without touching scheduler or harness execution.

### Tests for User Story 1

- [x] T019 [P] [US1] Add RED route auth and workspace masking tests for unauthenticated, viewer-or-higher, malformed scope `400`, forbidden scope `403`, and masked `404 task_not_found` in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [x] T020 [P] [US1] Add RED route envelope tests for no attempts, active attempts, multiple attempt ordering, linked run, missing/unavailable run, invalid stored state, and bounded lifecycle snippets in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [x] T021 [P] [US1] Add RED route projection-drift tests for `status`, `updated_at`, `started_at`, `completed_at`, and `archived_at` warnings with no read-time mutation in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [x] T022 [P] [US1] Add RED OpenAPI and API-index parity tests for the read-only task-scoped route in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [x] T023 [P] [US1] Add RED component tests for loading, no-attempts, active attempt, linked run, missing run, invalid-state warning, projection-drift warning, bounded lifecycle, and no action controls in `src/components/panels/__tests__/task-stage-attempts-section.test.tsx`
- [x] T024 [P] [US1] Add RED accessibility component tests for named region, status semantics, alert semantics, non-color-only state labels, read-only link wording, and absent buttons/forms/menus in `src/components/panels/__tests__/task-stage-attempts-section.test.tsx`
- [x] T025 [P] [US1] Add RED Playwright task-detail journey for no attempts, mixed attempts, linked/missing run, invalid-state warning, projection-drift warning, screenshots, and responsive text-fit in `tests/e2e/spec-013a-task-stage-attempts.spec.ts`

### Implementation for User Story 1

- [x] T026 [US1] Implement `GET /api/tasks/[id]/stage-attempts` as a viewer-authenticated read-only route in `src/app/api/tasks/[id]/stage-attempts/route.ts`
- [x] T027 [US1] Update API documentation for `GET /api/tasks/[id]/stage-attempts` as read-only viewer task inspection in `openapi.json`
- [x] T028 [US1] Update the local API index entry for `GET /api/tasks/[id]/stage-attempts` in `src/app/api/index/route.ts`
- [x] T029 [US1] Implement the compact read-only `Run state` / `Stage attempts` section in `src/components/panels/task-stage-attempts-section.tsx`
- [x] T030 [US1] Mount the run-state section near the existing Evidence surface without moving Evidence logic in `src/components/panels/task-board-panel.tsx`
- [x] T031 [US1] Add deterministic e2e seed setup for representative attempts and runs in `tests/e2e/spec-013a-task-stage-attempts.spec.ts`
- [x] T032 [US1] Run US1 route/component/e2e tests and record independent-test evidence in `docs/ai/specs/SPEC-013A-workflow.md`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Archive Attempts Non-Destructively (Priority: P2)

**Goal**: Archived attempts remain queryable with `status='archived'`, `archived_at`, and an `archived` lifecycle entry, while the UI clearly distinguishes archived and non-archived attempts.

**Independent Test**: Archive a representative attempt and verify the row and lifecycle history remain inspectable, are not moved/deleted/exported, and are structurally distinguishable in the route and UI.

### Tests for User Story 2

- [ ] T033 [P] [US2] Add RED helper tests for non-destructive archive behavior, archived projection fields, archived lifecycle event, and unchanged row identity in `src/lib/__tests__/task-stage-attempts.test.ts`
- [ ] T034 [P] [US2] Add RED route tests proving archived attempts remain in the default `task_stage_attempts.v1` response with archive evidence in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [ ] T035 [P] [US2] Add RED component tests for archived marker text, archive timestamp display, active-vs-archived structural distinction, and no release/cancel controls in `src/components/panels/__tests__/task-stage-attempts-section.test.tsx`
- [ ] T036 [P] [US2] Add RED Playwright assertions and screenshots for archived and non-archived attempts in `tests/e2e/spec-013a-task-stage-attempts.spec.ts`

### Implementation for User Story 2

- [ ] T037 [US2] Complete archive helper behavior and serialization in `src/lib/task-stage-attempts.ts`
- [ ] T038 [US2] Ensure archived attempts are returned by default with distinct archive evidence in `src/app/api/tasks/[id]/stage-attempts/route.ts`
- [ ] T039 [US2] Render archived attempts with visible text/structural labels and compact wrapping in `src/components/panels/task-stage-attempts-section.tsx`
- [ ] T040 [US2] Run US2 helper/route/component/e2e tests and record independent-test evidence in `docs/ai/specs/SPEC-013A-workflow.md`

**Checkpoint**: User Stories 1 and 2 both work independently, including archive preservation.

---

## Phase 5: User Story 3 - Prove Flag-Off Runtime Safety (Priority: P3)

**Goal**: With `FEATURE_TASK_CONTROL_PLANE=false`, existing scheduler, dispatch, task-chain, Aegis, GitHub sync/poller, runtime runs, pilot review packet, and existing task evidence behavior remain table-blind while read-only inspection stays available.

**Independent Test**: Seed attempt rows with the feature flag off, run static guardrails and focused runtime/evidence checks, and verify existing paths neither import attempt helpers nor reference attempt tables while the dedicated read route still works.

### Tests for User Story 3

- [ ] T041 [P] [US3] Add RED static guard tests for scheduler, dispatch, task-chain, Aegis, GitHub sync/poller, runtime runs, pilot review packet, and evidence table-blindness in `scripts/spec-013a/check-run-state-scope-guards.mjs`
- [ ] T042 [P] [US3] Add RED evidence-route table-blind assertions for existing task evidence behavior in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [ ] T043 [P] [US3] Add RED flag-off route test proving read-only inspection remains available when `FEATURE_TASK_CONTROL_PLANE=false` in `src/lib/__tests__/task-stage-attempts-route.test.ts`
- [ ] T044 [P] [US3] Add RED guard assertions against claim/retry/release/cancel authority, scheduler launch, GitHub mutation, sandbox lifecycle, harness adapter, and auto-merge drift in `scripts/spec-013a/check-run-state-scope-guards.mjs`

### Implementation for User Story 3

- [ ] T045 [US3] Finalize runtime table-blind allowlists and forbidden path checks in `scripts/spec-013a/check-run-state-scope-guards.mjs`
- [ ] T046 [US3] Verify existing task evidence route remains table-blind without importing attempt helpers in `src/app/api/tasks/[id]/evidence/route.ts`
- [ ] T047 [US3] Verify task-control-plane flag reads use `resolveFlag` only and no inline env reads exist outside `src/lib/feature-flags.ts`
- [ ] T048 [US3] Run `node scripts/check-guardrails.mjs --suite task-pipeline` and record direct task-insert guard evidence in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T049 [US3] Run `node scripts/spec-013a/check-run-state-scope-guards.mjs` and record runtime-isolation evidence in `docs/ai/specs/SPEC-013A-workflow.md`

**Checkpoint**: All user stories are independently functional and SPEC-013A remains a persistence/read-inspection slice only.

---

## Phase 6: Polish, Verification, and Review Evidence

**Purpose**: Final verification, documentation parity, and review packet evidence.

- [ ] T050 [P] Capture live migration schema evidence after applying migration `076_task_stage_attempts` twice using the SQL listed in `specs/013a-run-state-spine/quickstart.md`
- [ ] T051 [P] Verify rollback SQL manually against `docs/migrations/rollback-M76.sql` and record child-first/marker/foreign-key/history-loss evidence in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T052 [P] Verify `GET /api/tasks/[id]/stage-attempts` API parity in `openapi.json` and `src/app/api/index/route.ts`
- [ ] T053 Run focused Vitest coverage for migration/helper/route/component tests and record output in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T054 Run Playwright journey `pnpm exec playwright test tests/e2e/spec-013a-task-stage-attempts.spec.ts` and record screenshot/accessibility evidence in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T055 Run `pnpm typecheck` and record output in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T056 Run `pnpm lint` and record output in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T057 Run `pnpm build` and record output in `docs/ai/specs/SPEC-013A-workflow.md`
- [ ] T058 Update final SPEC-013A task-generation/implementation status, known deferred SPEC-013B/C/014 work, and verification notes in `docs/ai/specs/SPEC-013A-workflow.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; can start immediately.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2 and is the MVP.
- **Phase 4 US2**: Depends on Phase 2 and can start after archive helper tests are defined; route/UI archive display builds on US1 surfaces.
- **Phase 5 US3**: Depends on Phase 2 and can run in parallel with US1/US2 after guardrail file ownership is coordinated.
- **Phase 6 Polish**: Depends on selected user stories and all verification surfaces.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on US2/US3.
- **US2 (P2)**: Starts after Phase 2; shares helper/route/component files with US1, so sequence file edits carefully.
- **US3 (P3)**: Starts after Phase 2; mostly independent guard/evidence verification, but must run after route/helper paths exist for final allowlist checks.

### Within Each User Story

- RED tests must be written and fail before implementation.
- Helper behavior precedes route behavior.
- Route contract precedes API documentation and UI fetch integration.
- Component tests precede task-detail mounting.
- Playwright journey follows deterministic seed setup and component integration.
- Verification evidence is recorded only after the relevant command actually runs.

---

## Parallel Opportunities

- T002, T003, T004, T005, T006 can be prepared in parallel because they touch disjoint files.
- T008, T009, T010, T011 can be authored in parallel if migration and helper test ownership is coordinated by file.
- T019-T025 can be authored in parallel across route, component, and e2e files.
- T033-T036 can be authored in parallel across helper, route, component, and e2e files.
- T041-T044 can be authored in parallel if one owner controls `scripts/spec-013a/check-run-state-scope-guards.mjs` and another owns route tests.
- T050-T052 can be verified in parallel after implementation is green.

## Parallel Example: User Story 1

```bash
# Route contract and UI tests can be authored by separate owners:
Task: "T019-T022 route tests in src/lib/__tests__/task-stage-attempts-route.test.ts"
Task: "T023-T024 component tests in src/components/panels/__tests__/task-stage-attempts-section.test.tsx"
Task: "T025 Playwright journey in tests/e2e/spec-013a-task-stage-attempts.spec.ts"
```

## Parallel Example: User Story 3

```bash
# Guardrail and route flag-off checks can proceed independently:
Task: "T041/T044 guardrail assertions in scripts/spec-013a/check-run-state-scope-guards.mjs"
Task: "T042/T043 route safety assertions in src/lib/__tests__/task-stage-attempts-route.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup and Phase 2 foundation.
2. Complete Phase 3 US1 route/helper/UI inspection.
3. Stop and validate US1 independently with focused Vitest and Playwright journey.
4. Confirm no fixture write endpoint or runtime control behavior was introduced.

### Incremental Delivery

1. Foundation: migration, rollback, typed flag, helper, and guardrails.
2. US1: read route and compact task-detail inspection.
3. US2: archive preservation and distinct display.
4. US3: flag-off runtime safety and table-blind guardrails.
5. Polish: migration evidence, API parity, accessibility screenshots, and full verification gates.

### Deferred Work Boundary

SPEC-013A deliberately defers claim ownership, one-active-attempt enforcement, scheduler launch, retry/backoff policy, release/cancel controls, GitHub/task reconciliation, sandbox lifecycle, harness adapters, global dashboard behavior, and auto-merge behavior to later specs.
