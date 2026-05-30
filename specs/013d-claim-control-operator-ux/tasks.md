# Tasks: SPEC-013D Claim-Control Operator UX

**Input**: Design documents from `specs/013d-claim-control-operator-ux/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/claim-control-ui-contract.md`, `quickstart.md`, and completed checklists under `checklists/`
**Primary Review Surface**: UI in the existing task detail Details tab, plus narrow route-client integration with existing SPEC-013C endpoints.
**Reviewability**: Stay under the accepted UI-primary budget. Split if implementation expands into backend semantics, migrations, dashboards, scheduler, sandbox, adapter, harness, direct GitHub mutation, successor selection, or a second primary surface. Reviewability transition exception applies only to the tasks-gate heuristic counting existing route-contract citations, SpecKit docs, and forbidden-scope guard strings as extra surfaces; the implementation primary surface remains UI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with adjacent [P] tasks when files are disjoint.
- **[Story]**: User story label from `spec.md`.
- Every runtime-code task follows red-green-refactor: write/observe failing test first, implement the minimum, then refactor with tests green.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare strict scope and fixture/evidence scaffolding before user-story code.

- [ ] T001 Add planned SPEC-013D strict-scope entries to `tsconfig.spec-strict.json` and `eslint.config.mjs` for the new component, tests, story, and e2e files.
- [ ] T002 [P] Add a SPEC-013D fixture/evidence constant block to `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts` with marker prefix `spec013d-claim-control-*`, required screenshot names, and fixture export filename.
- [ ] T003 [P] Add an empty Storybook shell file at `src/components/panels/claim-control-section.stories.tsx` with visual tags `visual` and `spec-013d`.
- [ ] T004 [P] Add the initial component test file `src/components/panels/__tests__/claim-control-section.test.tsx` with shared mock read-model builders.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts and helpers required before individual stories.

**CRITICAL**: No user story implementation begins until this phase is complete.

- [ ] T005 [P] Write failing closed-copy-map tests for actions, outcomes, sanitized errors, and default reason labels in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T006 [P] Write failing request-shaping tests for expected-state copying, reason defaults, override fields, client correlation id, and raw idempotency redaction in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T007 Implement closed claim-control copy helpers in `src/components/panels/claim-control-copy.ts`.
- [ ] T008 Create the typed `ClaimControlSection` prop and draft/receipt model in `src/components/panels/claim-control-section.tsx`.
- [ ] T009 Implement a local request-draft builder in `src/components/panels/claim-control-section.tsx` or `src/components/panels/claim-control-copy.ts` without importing backend mutation authority.
- [ ] T010 Run the focused component test file and keep expected RED failures documented before story work begins.

**Checkpoint**: Foundation ready when closed copy, component prop types, and request-draft tests fail for missing implementation.

---

## Phase 3: User Story 1 - Inspect Claim-Control State (Priority: P1) MVP

**Goal**: Operators can understand the backend-provided claim-control state in the existing task detail Details tab.

**Independent Test**: Component tests render active, disabled, absent, flag-off, loading, and backend-error read states without mutation behavior.

### Tests for User Story 1

- [ ] T011 [P] [US1] Write failing component tests for active claim-control state rendering in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T012 [P] [US1] Write failing component tests for disabled action descriptors and backend-provided unavailable reasons in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T013 [P] [US1] Write failing component tests for absent `claim_control`, feature-flag-off, loading, and read error states in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T014 [P] [US1] Write failing task-detail integration test coverage for fetching `GET /api/tasks/[id]/claim-reconciliation` with product-line scope in `src/components/panels/__tests__/claim-control-section.test.tsx` or the nearest task-board test file.

### Implementation for User Story 1

- [ ] T015 [US1] Implement read-only state rendering in `src/components/panels/claim-control-section.tsx` with stage key, authorization, retry eligibility, backoff, last action, sanitized error, and all backend action descriptors.
- [ ] T016 [US1] Implement quiet absent-state and compact flag-off/error states in `src/components/panels/claim-control-section.tsx`.
- [ ] T017 [US1] Add claim-reconciliation fetch state to `TaskDetailModal` in `src/components/panels/task-board-panel.tsx` using `appendScopeToPath`.
- [ ] T018 [US1] Render `ClaimControlSection` near `TaskEvidenceSection` and `TaskStageAttemptsSection` in `src/components/panels/task-board-panel.tsx`.
- [ ] T019 [US1] Ensure `TaskDetailModal` refreshes claim reconciliation when the selected task or active product-line scope changes in `src/components/panels/task-board-panel.tsx`.
- [ ] T020 [US1] Run focused component/integration tests for US1 and update assertions until active, disabled, absent, loading, and flag-off states pass.
- [ ] T021 [US1] Add a no-regression assertion that absent `claim_control` leaves existing Evidence and Run state sections unchanged in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T022 [US1] Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck` after US1 integration.

**Checkpoint**: US1 is independently complete when the Details tab can display backend-provided claim-control state without enabling mutation.

---

## Phase 4: User Story 2 - Confirm And Submit Eligible Actions (Priority: P2)

**Goal**: Operators can submit eligible retry, release, and cancel actions through inline confirmation and inspect refreshed bounded receipts.

**Independent Test**: Component and task-detail tests cover confirmation, request construction, idempotency lifecycle, refresh sequencing, and receipts for eligible actions.

### Tests for User Story 2

- [ ] T023 [P] [US2] Write failing component tests for inline retry, release, and cancel confirmation states in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T024 [P] [US2] Write failing component tests for cancel reason required, release default reason, submit disabled states, and bounded reason echoing in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T025 [P] [US2] Write failing task-detail tests for `POST /api/tasks/[id]/claim-control` request body construction and `Idempotency-Key` header handling in `src/components/panels/__tests__/claim-control-section.test.tsx` or the nearest task-board test file.
- [ ] T026 [P] [US2] Write failing refresh sequencing tests proving claim reconciliation refreshes before final availability and evidence/stage-attempt/task-list refreshes are requested after bounded server responses in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T027 [P] [US2] Write failing receipt tests for success, already-applied, idempotent replay, stale/conflict, and sanitized error categories in `src/components/panels/__tests__/claim-control-section.test.tsx`.

### Implementation for User Story 2

- [ ] T028 [US2] Implement inline confirmation state and reason fields in `src/components/panels/claim-control-section.tsx`.
- [ ] T029 [US2] Implement submit intent emission from `ClaimControlSection` without direct route calls in `src/components/panels/claim-control-section.tsx`.
- [ ] T030 [US2] Implement mutation request handling in `TaskDetailModal` in `src/components/panels/task-board-panel.tsx` with generated per-confirmation idempotency keys.
- [ ] T031 [US2] Implement same-submission network retry state in `TaskDetailModal` and clear raw keys on response, close, cancel, task change, expected-state refresh, changed body, or new decision.
- [ ] T032 [US2] Implement post-response refresh orchestration for claim reconciliation, task evidence, stage attempts, and task-list item state in `src/components/panels/task-board-panel.tsx`.
- [ ] T033 [US2] Implement bounded outcome receipt rendering in `src/components/panels/claim-control-section.tsx`.
- [ ] T034 [US2] Add redaction assertions so receipts and test fixtures never render raw idempotency keys, raw request bodies, auth headers, prompts, transcripts, provider payloads, tokens, or GitHub bodies.
- [ ] T035 [US2] Run focused tests for US2 request construction, idempotency, refresh, and receipt behavior.
- [ ] T036 [US2] Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint` after US2 integration.

**Checkpoint**: US2 is independently complete when retry, release, and cancel submit through the existing route contract and show refreshed bounded receipts.

---

## Phase 5: User Story 3 - Override Retry Backoff With Reason (Priority: P3)

**Goal**: Operators can see active retry backoff and supply a bounded override reason only when the backend allows override.

**Independent Test**: Component tests cover disabled default retry, override reason entry, request body override fields, and receipt after submit.

### Tests for User Story 3

- [ ] T037 [P] [US3] Write failing component tests for active backoff disabled retry and backend backoff reason display in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T038 [P] [US3] Write failing component tests for override reason required, override submit enablement, and overlong/empty override validation in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T039 [P] [US3] Write failing request-shaping tests for `override_backoff=true` and bounded `override_reason` in `src/components/panels/__tests__/claim-control-section.test.tsx`.

### Implementation for User Story 3

- [ ] T040 [US3] Implement backoff display and override affordance in `src/components/panels/claim-control-section.tsx`.
- [ ] T041 [US3] Implement override reason validation and confirmation copy in `src/components/panels/claim-control-section.tsx`.
- [ ] T042 [US3] Wire override request body fields through `TaskDetailModal` mutation handling in `src/components/panels/task-board-panel.tsx`.
- [ ] T043 [US3] Run focused backoff override tests and ensure raw reason text remains bounded/sanitized in receipts.
- [ ] T044 [US3] Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck` after US3.

**Checkpoint**: US3 is independently complete when backoff override is disabled by default and enabled only with an operator reason.

---

## Phase 6: User Story 4 - Understand Read-Only Access (Priority: P4)

**Goal**: Viewers can inspect claim-control state but cannot mutate scheduler state.

**Independent Test**: Component and Playwright tests show read-only state with disabled controls and backend authorization reasons.

### Tests for User Story 4

- [ ] T045 [P] [US4] Write failing component tests for `authorization.can_mutate=false` viewer state and disabled retry/release/cancel controls in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T046 [P] [US4] Write failing tests proving disabled viewer controls do not emit submit intents in `src/components/panels/__tests__/claim-control-section.test.tsx`.
- [ ] T047 [P] [US4] Add a read-only viewer fixture path to `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.

### Implementation for User Story 4

- [ ] T048 [US4] Implement viewer/read-only disabled rendering and reason association in `src/components/panels/claim-control-section.tsx`.
- [ ] T049 [US4] Ensure `TaskDetailModal` does not locally override backend authorization state in `src/components/panels/task-board-panel.tsx`.
- [ ] T050 [US4] Run focused viewer/read-only tests and ensure mutation callbacks are not called from disabled controls.

**Checkpoint**: US4 is independently complete when viewers see backend state and cannot submit mutations.

---

## Phase 7: User Story 5 - Review Stable Visual States (Priority: P5)

**Goal**: Reviewers have durable browser and Storybook evidence for normal, disabled, backoff, stale/conflict, viewer, flag-off, loading, and error states.

**Independent Test**: Playwright produces the required fixture export and screenshots; Storybook covers the stable component states without backend mutation.

### Tests and Evidence for User Story 5

- [ ] T051 [P] [US5] Add Storybook states for enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error in `src/components/panels/claim-control-section.stories.tsx`.
- [ ] T052 [P] [US5] Write Playwright fixture helpers for disposable task creation, SPEC-013B/C row seeding, feature-flag restoration, and cleanup proof in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.
- [ ] T053 [P] [US5] Add Playwright fixture export generation with seeded row ids/counts, cleanup scope, screenshot names, visual manifest names, and redaction assertions in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.
- [ ] T054 [P] [US5] Add Playwright steps for before active, confirm retry, and after retry screenshots in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.
- [ ] T055 [P] [US5] Add Playwright steps for disabled reasons, backoff override, stale/conflict, viewer read-only, and flag-off screenshots in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.
- [ ] T056 [P] [US5] Add `captureVisualSnapshot` calls for primary before/after and key disabled, backoff, conflict, viewer, and flag-off states in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.

### Implementation for User Story 5

- [ ] T057 [US5] Ensure Storybook stories use only component props and do not depend on backend mutation in `src/components/panels/claim-control-section.stories.tsx`.
- [ ] T058 [US5] Ensure Playwright cleanup removes disposable tasks, claim rows, stage-attempt rows, idempotency rows, activities, fixture evidence rows, and restores feature flags in `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`.
- [ ] T059 [US5] Run the SPEC-013D Playwright file locally and retain screenshot/fixture evidence under `test-results/`.
- [ ] T060 [US5] Run Storybook visual test command or document environment limitation in `specs/013d-claim-control-operator-ux/quickstart.md`.
- [ ] T061 [US5] Run Playwright visual manifest verification or document why visual snapshots were disabled in this environment.
- [ ] T062 [US5] Add any required visual evidence notes to `docs/ai/specs/SPEC-013D-workflow.md`.
- [ ] T063 [US5] Review screenshot output for clipped text, overlapping controls, wrong data, inaccessible controls, and unsafe payload exposure before PR work.

**Checkpoint**: US5 is independently complete when real browser evidence and stable component visual states exist for review.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, guardrails, documentation, and closeout prep.

- [ ] T064 [P] Add static no-drift assertions proving SPEC-013D did not add a migration, backend route, dashboard, scheduler behavior, sandbox, adapter, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation in `src/components/panels/__tests__/claim-control-section.test.tsx` or a focused guard test.
- [ ] T065 [P] Update `specs/013d-claim-control-operator-ux/quickstart.md` with actual verification commands and evidence locations after implementation.
- [ ] T066 [P] Update `docs/ai/specs/SPEC-013D-workflow.md` implementation progress, verification evidence, and known gaps.
- [ ] T067 Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck`.
- [ ] T068 Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint`.
- [ ] T069 Run focused Vitest and Playwright commands from `specs/013d-claim-control-operator-ux/quickstart.md`.
- [ ] T070 Run `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm build`.
- [ ] T071 Run reviewability diff gate and record the result in `docs/ai/specs/SPEC-013D-workflow.md`.
- [ ] T072 Run the Docker-backed Playwright evidence path from `specs/013d-claim-control-operator-ux/quickstart.md` when Docker is available, or record the environment limitation in `docs/ai/specs/SPEC-013D-workflow.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user-story implementation.
- **US1 (Phase 3)**: Depends on Foundational and is the MVP.
- **US2 (Phase 4)**: Depends on US1 component and task-detail read integration.
- **US3 (Phase 5)**: Depends on US2 confirmation/request path.
- **US4 (Phase 6)**: Depends on US1 disabled-state rendering and US2 submit-intent separation.
- **US5 (Phase 7)**: Depends on US1-US4 states being implemented.
- **Polish (Phase 8)**: Depends on desired user stories and evidence completion.

### User Story Dependencies

- **US1**: Independent MVP after Foundational.
- **US2**: Builds on US1 read model and component shell.
- **US3**: Builds on US2 confirmation and request-draft path.
- **US4**: Can run after US1 disabled rendering exists; final no-submit assertions depend on US2 callbacks.
- **US5**: Requires all UI states from US1-US4.

### Parallel Opportunities

- Setup scaffolding tasks T002-T004 can run in parallel.
- Foundational RED tests T005-T006 can run in parallel before implementation tasks T007-T009.
- Component test tasks within US1, US2, US3, and US4 marked [P] can run in parallel before their implementation tasks.
- US5 Storybook and Playwright fixture-writing tasks T051-T056 are parallel-safe after UI states exist.
- Polish documentation/guard tasks T064-T066 are parallel-safe after implementation stabilizes.

## Parallel Example: User Story 2

```text
Task: "T023 [P] [US2] Write failing component tests for inline retry, release, and cancel confirmation states"
Task: "T024 [P] [US2] Write failing component tests for cancel reason required, release default reason, submit disabled states, and bounded reason echoing"
Task: "T025 [P] [US2] Write failing task-detail tests for POST request body construction and Idempotency-Key header handling"
Task: "T026 [P] [US2] Write failing refresh sequencing tests"
Task: "T027 [P] [US2] Write failing receipt tests"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational tasks.
2. Complete US1 so the task detail can inspect backend claim-control state without mutation.
3. Validate US1 independently with focused component tests and typecheck.

### Incremental Delivery

1. Add US2 mutation confirmations and refreshed receipts.
2. Add US3 backoff override.
3. Add US4 read-only behavior.
4. Add US5 Playwright and Storybook evidence.
5. Finish polish/verification and update workflow evidence.

### Agent Routing Notes

- UI/component work: `implement-executor` or project UI implementation agent if available.
- Playwright fixture work: `implement-executor` with fixture cleanup ownership.
- Documentation/workflow updates: parent orchestrator or a single implementation worker.
- Avoid more than two live workers at once in this recovery thread; close or avoid further spawns if the Codex agent pool cannot release completed sessions.
