# Tasks: SPEC-013C - Retry/Backoff and Debug API Surfaces

**Input**: Design documents from `specs/013c-retry-debug-surfaces/`, plus `docs/ai/specs/SPEC-013C-design-concept.md` and `docs/ai/specs/SPEC-013C-workflow.md`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/task-claim-control-api.md`, `quickstart.md`, and completed checklists under `checklists/`

**Tests**: Required. SPEC-013C mutates claim/runtime state, persistence, audit evidence, API behavior, and read-model eligibility. Every behavior-changing implementation task starts with a failing Vitest, route, migration, or static boundary test.

**Reviewability**: Primary surface is API/debug authority. Keep implementation scoped to `POST /api/tasks/[id]/claim-control`, the existing `GET /api/tasks/[id]/claim-reconciliation` read model, the claim-control domain/idempotency modules, M79 schema support, audit evidence, OpenAPI/API index docs, and SpecKit evidence. Do not add in-app controls, CLI/MCP actions, dashboard surfaces, sandbox lifecycle, adapters, harness execution, direct GitHub mutation, successor selection, or task creation.

**Ratified exception**: SPEC-013C carries the setup transition exception because retry/release/cancel semantics, idempotency, compare-and-set, audit, read-model fields, and migration support must agree transactionally. The UI adoption gap remains split to SPEC-013D.

## Implementation Evidence

- Worktree/runtime/package manager verified from `pnpm-lock.yaml`, `AGENTS.md`, and the SPEC-013C workflow: branch `013c-retry-debug-surfaces`, pnpm, Node `v22.22.2` through `direnv exec .`.
- Focused migration/domain/route/read-model cluster passed: `direnv exec . pnpm exec vitest run src/lib/__tests__/migrations-M79-task-claim-control.test.ts src/lib/__tests__/task-claim-control-idempotency.test.ts src/lib/__tests__/task-claim-control.test.ts src/lib/__tests__/task-claim-control-route.test.ts src/lib/__tests__/task-claim-reconciliation.test.ts src/lib/__tests__/task-claim-reconciliation-route.test.ts --reporter=verbose` => 6 files passed, 39 tests passed.
- Type/lint/API/scope gates passed: `direnv exec . pnpm typecheck`, `direnv exec . pnpm lint`, `direnv exec . pnpm api:parity`, and `direnv exec . pnpm check:strict-scope`.
- Full unit suite passed outside the Codex sandbox after the known provisioner socket sandbox failure: `direnv exec . pnpm test` => 308 files passed, 3190 tests passed, 3 skipped, 84 todo.
- Production build passed outside the Codex sandbox after the known Turbopack sandbox port-binding failure: `direnv exec . pnpm build`.
- Documentation checks passed: `direnv exec . pnpm knowledge:index:check` and `git diff --check`.
- No browser-visible UI files changed under `src/components/**`; `pnpm test:e2e` was not run for SPEC-013C because the implemented surface is API/debug authority only and SPEC-013D owns the operator UI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or adds independent failing coverage.
- **[Story]**: Maps a task to User Story 1, User Story 2, User Story 3, User Story 4, or User Story 5 from `spec.md`.
- Every task includes an exact file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Register strict ownership, fixtures, rollback placeholders, and reviewability guardrails before behavior work.

- [X] T001 Verify package manager/runtime/worktree assumptions from `pnpm-lock.yaml`, `package.json`, `AGENTS.md`, and `docs/ai/specs/SPEC-013C-workflow.md`, then record the reviewability checkpoint in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T002 [P] Add SPEC-013C strict-owned pure module and test paths to `tsconfig.spec-strict.json`
- [X] T003 [P] Add SPEC-013C module, route, and test lint ownership entries to `eslint.config.mjs`
- [X] T004 [P] Extend reusable claim-control fixture builders in `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`
- [X] T005 [P] Add M79 rollback placeholder for claim-control schema support in `docs/migrations/rollback-M79.sql`
- [X] T006 [P] Confirm OpenAPI/API index update targets for claim-control route and read-model extension in `openapi.json` and `src/app/api/index/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add schema, closed contracts, idempotency replay helpers, and static scope guardrails that all user stories depend on.

**CRITICAL**: No user story implementation should begin until M79, closed types, idempotency helpers, and no-forbidden-authority guard coverage are ready.

- [X] T007 [P] Write failing M79 migration tests for `task_stage_claims.release_reason` accepting `operator_released`, `operator_cancelled`, and `operator_retry_requested` while preserving existing M78 rows, indexes, foreign keys, and active-claim uniqueness in `src/lib/__tests__/migrations-M79-task-claim-control.test.ts`
- [X] T008 [P] Write failing M79 migration tests for `task_claim_control_idempotency_keys` shape, primary key, indexes, hashed-key storage, 24-hour TTL fields, rerun idempotency, and rollback refusal while operator-reason rows exist in `src/lib/__tests__/migrations-M79-task-claim-control.test.ts`
- [X] T009 Implement M79 release-reason constraint expansion and `task_claim_control_idempotency_keys` creation in `src/lib/migrations.ts`
- [X] T010 Implement guarded, idempotent rollback SQL for M79 in `docs/migrations/rollback-M79.sql`
- [X] T011 Run the focused M79 migration test command from `specs/013c-retry-debug-surfaces/quickstart.md` and keep failure/pass evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T012 [P] Write failing validation tests for closed action, outcome, reason, error-category, expected-state, backoff, read-model, and response-envelope types in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T013 Implement closed claim-control contracts and validation helpers in `src/lib/task-claim-control-types.ts`
- [X] T014 [P] Write failing idempotency helper tests for key hashing, canonical request hashing, same-key same-body replay, same-key different-body mismatch, TTL expiry, and non-2xx non-caching in `src/lib/__tests__/task-claim-control-idempotency.test.ts`
- [X] T015 Implement hashed idempotency lookup, mismatch detection, successful-response recording, and expiry cleanup helpers in `src/lib/task-claim-control-idempotency.ts`
- [X] T016 [P] Write failing static boundary tests proving `src/lib/task-claim-control.ts` and `src/app/api/tasks/[id]/claim-control/route.ts` do not import `advanceTaskChain`, `createTask`, GitHub mutation clients, runner, harness, sandbox, adapter, CLI, MCP, or UI modules in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T017 Create the narrow claim-control module shell with no forbidden imports in `src/lib/task-claim-control.ts`

**Checkpoint**: Foundation is ready when M79 and idempotency helpers have failing-then-passing focused tests and the claim-control module has no forbidden authority imports.

---

## Phase 3: User Story 1 - Inspect Claim Control Eligibility (Priority: P1) MVP

**Goal**: Operators can read one authoritative debug model that explains retry, release, cancel, backoff, last operator action, sanitized error state, and exact expected-state predicates without mutating state.

**Independent Test**: Seed controlled claimed, failed, deferred, cancelled, and ineligible states, then call the read model and verify `claim_control` eligibility fields without any row-count side effects.

### Tests for User Story 1

- [X] T018 [P] [US1] Write failing read-model tests for `claim_control.authorization`, `available_actions`, `retry_eligibility`, `backoff`, `expected_state`, `last_operator_action`, and `last_sanitized_error` in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [X] T019 [P] [US1] Write failing side-effect-free read-model tests that snapshot `tasks`, `task_stage_claims`, `task_stage_attempts`, `task_stage_attempt_events`, `activities`, and `task_claim_control_idempotency_keys` before/after read calls in `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [X] T020 [P] [US1] Write failing route tests for viewer/operator/admin read access, current-role reporting, flag-off shape, no mutation URLs, and expected-state serialization in `src/lib/__tests__/task-claim-reconciliation-route.test.ts`

### Implementation for User Story 1

- [X] T021 [US1] Extend `buildTaskClaimReconciliationReadModel` with optional `claim_control` eligibility fields in `src/lib/task-claim-reconciliation.ts`
- [X] T022 [US1] Add bounded last-operator-action and last-sanitized-error derivation from SPEC-013C activities in `src/lib/task-claim-reconciliation.ts`
- [X] T023 [US1] Ensure `GET /api/tasks/[id]/claim-reconciliation` passes caller role context without granting mutation authority in `src/app/api/tasks/[id]/claim-reconciliation/route.ts`
- [X] T024 [US1] Update read-model API documentation for optional `claim_control` fields in `openapi.json` and `src/app/api/index/route.ts`
- [X] T025 [US1] Run focused US1 tests for `src/lib/__tests__/task-claim-reconciliation.test.ts` and `src/lib/__tests__/task-claim-reconciliation-route.test.ts`

**Checkpoint**: User Story 1 is independently functional and gives SPEC-013D one read-only eligibility source.

---

## Phase 4: User Story 2 - Retry A Recoverable Stage (Priority: P1)

**Goal**: Operators can request retry for active or retry-eligible stage evidence, respecting backoff by default and recording explicit audited overrides.

**Independent Test**: Seed failed, stuck, deferred, cancelled, active-claim, and active-backoff fixtures; call `retry`; verify state transition, backoff decision, idempotency, audit, and read-model reflection.

### Tests for User Story 2

- [X] T026 [P] [US2] Write failing retry eligibility tests for active claims, failed attempts, cancelled attempts, stale recovery, governance deferral, boundary deferral, dispatch failure, terminal task states, terminal GitHub states, local-only tasks, repo-only tasks, and non-assigned tasks in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T027 [P] [US2] Write failing retry backoff tests for no-backoff ready, active-backoff respected, override without reason rejected, override with reason accepted, previous/new backoff evidence, and cancel-block clearing in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T028 [P] [US2] Write failing retry route/idempotency tests for `task_claim_control.v1`, stable same-key replay, body mismatch, response hashes, and no duplicate audit in `src/lib/__tests__/task-claim-control-route.test.ts`

### Implementation for User Story 2

- [X] T029 [US2] Implement retry eligibility classification and expected-state validation in `src/lib/task-claim-control.ts`
- [X] T030 [US2] Implement retry active-claim retirement with `operator_retry_requested` and non-active retry-ready transitions in `src/lib/task-claim-control.ts`
- [X] T031 [US2] Implement backoff-respected and explicit override behavior with bounded actor/reason evidence in `src/lib/task-claim-control.ts`
- [X] T032 [US2] Wire `retry` into `POST /api/tasks/[id]/claim-control` with transaction, idempotency, and response-envelope handling in `src/app/api/tasks/[id]/claim-control/route.ts`
- [X] T033 [US2] Run focused US2 tests for `src/lib/__tests__/task-claim-control.test.ts`, `src/lib/__tests__/task-claim-control-idempotency.test.ts`, and `src/lib/__tests__/task-claim-control-route.test.ts`

**Checkpoint**: User Story 2 is independently functional when retry is accepted, delayed by backoff, or rejected with clear bounded outcomes.

---

## Phase 5: User Story 3 - Release Or Cancel An Active Claim (Priority: P1)

**Goal**: Operators can release or cancel active ownership distinctly, without scheduling work or marking the whole task done/failed.

**Independent Test**: Seed active claims and cancellable running/stuck evidence; call `release` and `cancel` in separate fixtures; verify claim, attempt, audit, read-model, and scheduler eligibility outcomes.

### Tests for User Story 3

- [X] T034 [P] [US3] Write failing release tests for active-claim compare-and-set, `operator_released`, attempt `released` evidence, no immediate retry eligibility, and no whole-task terminal mutation in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T035 [P] [US3] Write failing cancel tests for active claim, explicitly cancellable running/stuck evidence, `operator_cancelled`, attempt `cancelled` evidence, automatic-pickup block, and no whole-task terminal mutation in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T036 [P] [US3] Write failing release/cancel route tests for same-key replay, new-key `already_applied`, stale expected claim/run ids, and distinct response outcomes in `src/lib/__tests__/task-claim-control-route.test.ts`

### Implementation for User Story 3

- [X] T037 [US3] Implement active-claim release semantics with `operator_released` in `src/lib/task-claim-control.ts`
- [X] T038 [US3] Implement cancel semantics, cancellable evidence detection, cancel-block persistence, and attempt lifecycle evidence in `src/lib/task-claim-control.ts`
- [X] T039 [US3] Implement `already_applied` detection for release and cancel without duplicate state transition or duplicate audit in `src/lib/task-claim-control.ts`
- [X] T040 [US3] Wire `release` and `cancel` into `POST /api/tasks/[id]/claim-control` response handling in `src/app/api/tasks/[id]/claim-control/route.ts`
- [X] T041 [US3] Reflect release/cancel/cancel-block state in the read-model `claim_control` extension in `src/lib/task-claim-reconciliation.ts`
- [X] T042 [US3] Run focused US3 tests for `src/lib/__tests__/task-claim-control.test.ts` and `src/lib/__tests__/task-claim-control-route.test.ts`

**Checkpoint**: User Story 3 is independently functional when release and cancel remain distinct and cancel blocks automatic pickup until retry.

---

## Phase 6: User Story 4 - Preserve Audit Safety And Race Clarity (Priority: P2)

**Goal**: Every mutation and semantic rejection is reconstructable through bounded evidence, while stale clients, scheduler races, unsafe payloads, and unauthorized callers fail without unsafe persistence.

**Independent Test**: Exercise unauthorized callers, feature-flag-off scope, stale predicates, concurrent state changes, repeated clicks, unsafe payloads, and rate limits; verify closed outcomes, bounded audit, and no forbidden payload persistence.

### Tests for User Story 4

- [X] T043 [P] [US4] Write failing authorization tests for unauthenticated, viewer, operator, and admin mutation requests in `src/lib/__tests__/task-claim-control-route.test.ts`
- [X] T044 [P] [US4] Write failing flag-off, malformed JSON, invisible task, missing idempotency key, and rate-limit no-audit tests in `src/lib/__tests__/task-claim-control-route.test.ts`
- [X] T045 [P] [US4] Write failing audit allowlist and redaction tests for raw idempotency key, raw body, prompt, transcript, auth header, GitHub body, provider payload, token-shaped value, secret scanner failure, and closed sanitized categories in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T046 [P] [US4] Write failing stale-state, conflict, scheduler-race, concurrent-operator, and partial-mutation rollback tests in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T047 [P] [US4] Write failing idempotency race tests for concurrent same-key same-body calls, concurrent same-stage different actions, body mismatch, storage failure, TTL expiry, and selected response-header replay in `src/lib/__tests__/task-claim-control-idempotency.test.ts`

### Implementation for User Story 4

- [X] T048 [US4] Implement operator/admin authorization, workspace visibility, feature-flag gating, mutation rate-limit ordering, and parse-error handling in `src/app/api/tasks/[id]/claim-control/route.ts`
- [X] T049 [US4] Implement positive allowlist audit writer, redaction proof, bounded operator strings, and secret-scan fail-closed behavior in `src/lib/task-claim-control.ts`
- [X] T050 [US4] Implement transaction-level compare-and-set, stale-state, conflict, not-eligible, and rollback behavior in `src/lib/task-claim-control.ts`
- [X] T051 [US4] Implement closed HTTP/error envelope mapping for claim-control transport and business outcomes in `src/app/api/tasks/[id]/claim-control/route.ts`
- [X] T052 [US4] Harden idempotency helper concurrency and storage-failure handling in `src/lib/task-claim-control-idempotency.ts`
- [X] T053 [US4] Run focused US4 tests for `src/lib/__tests__/task-claim-control.test.ts`, `src/lib/__tests__/task-claim-control-idempotency.test.ts`, and `src/lib/__tests__/task-claim-control-route.test.ts`

**Checkpoint**: User Story 4 is independently functional when races and unsafe inputs produce bounded outcomes without duplicate mutation or unsafe persistence.

---

## Phase 7: User Story 5 - Handoff To Operator UX And Harness Work (Priority: P3)

**Goal**: SPEC-013D and SPEC-014C implementers receive a stable backend contract, traceability, and explicit adoption boundary without recomputing claim state or inventing retry semantics.

**Independent Test**: Review contract, docs, PR packet, UAT evidence, OpenAPI/API index, and read-model output to confirm SPEC-013D is the UI follow-up and SPEC-014C remains blocked until SPEC-013D plus SPEC-014B.

### Tests for User Story 5

- [X] T054 [P] [US5] Write failing API documentation parity tests for `POST /api/tasks/[id]/claim-control` and `claim_control` read-model fields in `src/lib/__tests__/task-claim-control-route.test.ts`
- [X] T055 [P] [US5] Write failing scope-boundary tests proving no SPEC-013C changes under `src/components/`, no new dashboard route, no CLI/MCP action surface, no sandbox/adapter/harness imports, and no direct GitHub mutation in `src/lib/__tests__/task-claim-control.test.ts`
- [X] T056 [P] [US5] Write failing PR/UAT wording tests or documentation assertions for SPEC-013D operator UX blocker and SPEC-014C adoption blocker in `src/lib/__tests__/task-claim-control.test.ts`

### Implementation for User Story 5

- [X] T057 [US5] Update API documentation for claim-control mutation and read-model extension in `openapi.json` and `src/app/api/index/route.ts`
- [X] T058 [US5] Update UAT and rollback instructions with final API examples and evidence fields in `specs/013c-retry-debug-surfaces/quickstart.md`
- [X] T059 [US5] Create API-and-audit UAT report scaffold with disposable-scope fixture matrix in `specs/013c-retry-debug-surfaces/uat-report.md`
- [X] T060 [US5] Update roadmap/workflow closeout wording and SPEC-013D/SPEC-014C dependency evidence in `docs/ai/rc-factory-technical-roadmap.md` and `docs/ai/specs/SPEC-013C-workflow.md`
- [X] T061 [US5] Generate the PR review packet with review order, scope budget, traceability, verification evidence, known gaps, rollback/flag notes, and SPEC-013D follow-up in `docs/ai/specs/SPEC-013C-pr-review-packet.md`
- [X] T062 [US5] Run focused US5 tests for `src/lib/__tests__/task-claim-control.test.ts` and `src/lib/__tests__/task-claim-control-route.test.ts`

**Checkpoint**: User Story 5 is independently functional when docs and API contracts make the UI/harness adoption boundary explicit.

---

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: Validate the complete feature, guard against scope drift, and prepare implementation evidence.

- [X] T063 Run focused migration verification from `specs/013c-retry-debug-surfaces/quickstart.md` for `src/lib/__tests__/migrations-M79-task-claim-control.test.ts`
- [X] T064 Run focused idempotency verification from `specs/013c-retry-debug-surfaces/quickstart.md` for `src/lib/__tests__/task-claim-control-idempotency.test.ts`
- [X] T065 Run focused domain verification from `specs/013c-retry-debug-surfaces/quickstart.md` for `src/lib/__tests__/task-claim-control.test.ts`
- [X] T066 Run focused route/read-model verification from `specs/013c-retry-debug-surfaces/quickstart.md` for `src/lib/__tests__/task-claim-control-route.test.ts` and `src/lib/__tests__/task-claim-reconciliation.test.ts`
- [X] T067 Run `direnv exec . pnpm typecheck` using `package.json` and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T068 Run `direnv exec . pnpm lint` using `package.json` and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T069 Run `direnv exec . pnpm test` outside the Codex sandbox per `AGENTS.md` and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T070 Run `direnv exec . pnpm build` and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T071 Run `direnv exec . pnpm test:e2e` only if a browser-visible surface changed or the repo gate requires it, otherwise record the no-UI-change decision in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T072 Run `direnv exec . pnpm knowledge:index:check` after roadmap/API/spec docs change and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T073 Run `git diff --check` and record evidence in `specs/013c-retry-debug-surfaces/tasks.md`
- [X] T074 Update `docs/ai/specs/SPEC-013C-workflow.md` implementation results, task metrics, analysis results, and verification evidence
- [X] T075 Update `docs/ai/specs/autopilot-state.json` with completed task, analyze, implementation, verification, cleanup, review, and PR workflow statuses

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories because M79, closed types, idempotency, and scope guardrails are shared.
- **Phase 3 User Story 1**: Depends on Phase 2 and is the MVP read-only eligibility contract.
- **Phase 4 User Story 2**: Depends on Phase 2 and uses US1 read-model expectations for retry reflection.
- **Phase 5 User Story 3**: Depends on Phase 2 and shares route/domain machinery with US2.
- **Phase 6 User Story 4**: Depends on US2/US3 mutation paths and hardens auth, audit, race, and idempotency behavior.
- **Phase 7 User Story 5**: Depends on all behavior stories for final docs, contract, UAT, and adoption-boundary evidence.
- **Phase 8 Polish**: Depends on all desired user stories.

### User Story Dependencies

- **User Story 1 (P1)**: MVP. Requires foundational schema/types/idempotency only.
- **User Story 2 (P1)**: Requires foundational domain and idempotency helpers; may proceed after US1 tests define read-model reflection.
- **User Story 3 (P1)**: Requires foundational domain and idempotency helpers; may proceed alongside US2 after shared route shell exists.
- **User Story 4 (P2)**: Requires mutation paths from US2 and US3.
- **User Story 5 (P3)**: Requires final contract behavior from US1 through US4.

### Within Each User Story

- Write failing tests first and confirm they fail.
- Implement only enough code for that story's tests.
- Run the focused test command before moving to the next story.
- Preserve feature-flag-off parity, closed vocabularies, no raw payload persistence, and no successor/task-creation side effects in every story.

---

## Parallel Opportunities

- T002 through T006 can run in parallel after T001.
- T007, T008, T012, T014, and T016 can be written in parallel before their implementations.
- T018 through T020 can be written in parallel for US1.
- T026 through T028 can be written in parallel for US2.
- T034 through T036 can be written in parallel for US3.
- T043 through T047 can be written in parallel for US4.
- T054 through T056 can be written in parallel for US5.
- T063 through T066 can run independently once implementation is complete.

## Parallel Example: User Story 2

```bash
Task: "Write failing retry eligibility tests in src/lib/__tests__/task-claim-control.test.ts"
Task: "Write failing retry backoff tests in src/lib/__tests__/task-claim-control.test.ts"
Task: "Write failing retry route/idempotency tests in src/lib/__tests__/task-claim-control-route.test.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Write failing authorization and feature-flag route tests in src/lib/__tests__/task-claim-control-route.test.ts"
Task: "Write failing audit allowlist/redaction tests in src/lib/__tests__/task-claim-control.test.ts"
Task: "Write failing idempotency race tests in src/lib/__tests__/task-claim-control-idempotency.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 / User Story 1.
3. Stop and validate that the read model exposes complete eligibility without side effects.

### Mutation Increment

1. Add retry through User Story 2.
2. Add release/cancel through User Story 3.
3. Harden races, auth, audit, redaction, and idempotency through User Story 4.

### Closeout

1. Complete User Story 5 docs, contract, UAT scaffold, and PR packet.
2. Run focused and full verification from `quickstart.md`.
3. Update workflow/state evidence before PR creation.
