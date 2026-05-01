# Tasks: Task Pipeline Engine and Declarative Routing

**Input**: Design documents from `specs/004-task-pipeline-engine/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Branch**: `004-task-pipeline-engine`
**Tests**: TDD is required for SPEC-004. Write the focused Vitest, route, scheduler/advancement, validator, evaluator, UI, migration, guardrail, and Playwright tests before implementation tasks in each phase.

**Organization**: Tasks are dependency ordered and grouped by independently testable user-story increments after shared setup and foundation work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallel-safe with other tasks in the same phase because it touches different files or contracts.
- **[Story]**: User-story task labels map to `US1` through `US5` from `spec.md`.
- Every task includes at least one concrete file path.

---

## Phase 1: Setup and Evidence Baseline

**Purpose**: Establish SPEC-004 evidence, dependency, schema, and guardrail baselines before user-story work.

- [x] T001 Record Archive Sweep startup evidence, current-target exclusion, dependency verification, and recovery-command provenance in `docs/ai/specs/SPEC-004-workflow.md`
- [x] T002 Verify SPEC-001 task-chain columns and workflow-template fields in `src/lib/migrations.ts`; record stop/report evidence for missing dependencies in `docs/ai/specs/SPEC-004-workflow.md`
- [x] T003 Discover every production `INSERT INTO tasks` callsite outside `src/lib/task-create.ts` and record the migration matrix in `docs/ai/specs/SPEC-004-workflow.md`
- [x] T004 Add exact direct runtime pins `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and `safe-regex@2.1.1` in `package.json` and `pnpm-lock.yaml`
- [x] T005 Run `pnpm audit --audit-level high` against the current branch baseline and record required audit-remediation package/lockfile changes in `docs/ai/specs/SPEC-004-workflow.md`
- [x] T006 Add SPEC-004 strict-scope module coverage for `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts` in `tsconfig.spec-strict.json` and `eslint.config.mjs`
- [x] T007 Add M62 rollback documentation for the partial unique successor index in `docs/migrations/rollback-M62.sql`
- [x] T008 Add SPEC-004 guardrail command placeholders for dependency pins, validator safety, evaluator safety, direct task inserts, and downstream-scope drift in `.github/workflows/quality-gate.yml`

**Checkpoint**: Baseline evidence and dependency constraints are ready for implementation.

---

## Phase 2: Foundational Strict-Scope Surfaces

**Purpose**: Create shared modules, fixtures, and migration surfaces that later stories depend on.

- [x] T009 [P] Define workflow-template chain-field and routing-rule types in `src/types/workflow-template.ts`
- [x] T010 [P] Create validator corpus fixture directories and fixture manifest in `src/lib/__tests__/fixtures/schema-corpus/`
- [x] T011 [P] Create routing evaluator fixture directories and fixture manifest in `src/lib/__tests__/fixtures/routing/`
- [x] T012 Add public `createTask()` source-profile contract scaffolding in `src/lib/task-create.ts`
- [x] T013 Add bounded validator result types and exported constants in `src/lib/output-schema-validator.ts`
- [x] T014 Add bounded routing evaluator result types and exported constants in `src/lib/routing-rule-evaluator.ts`
- [x] T015 Add `advanceTaskChain` and `retry_chain_advancement` integration seams in `src/lib/task-dispatch.ts` without changing runtime behavior
- [x] T016 Add M62 forward migration scaffolding and duplicate preflight wiring in `src/lib/migrations.ts`

**Checkpoint**: Shared SPEC-004 surfaces exist and compile behind no-op behavior.

---

## Phase 3: User Story 1 - Preserve Current Task Behavior (Priority: P1)

**Goal**: Keep flag-off, unbound, null-default, and existing task creation behavior equivalent while routing all production task creation through `createTask()`.

**Independent Test**: With `FEATURE_TASK_PIPELINES` disabled and with enabled-but-unbound/null-chain tasks, current creation, completion, sync, notification, subscription, ticket, activity, and outbound sync behavior remains unchanged and no successor task is created.

### Tests for User Story 1

- [x] T017 [P] [US1] Add `createTask()` contract tests for API creation source defaults, bounded result shape, and side-effect records in `src/lib/__tests__/task-create.api.test.ts`
- [x] T018 [P] [US1] Add `createTask()` contract tests for GitHub issue import duplicate detection, metadata preservation, and no notification/push defaults in `src/lib/__tests__/task-create.github-import.test.ts`
- [x] T019 [P] [US1] Add `createTask()` contract tests for GitHub sync import anti-ping-pong behavior and no broadcast/ticket/push defaults in `src/lib/__tests__/task-create.github-sync.test.ts`
- [x] T020 [P] [US1] Add `createTask()` contract tests for recurring spawn transaction behavior, ticket allocation when project-bound, and recurrence metadata atomicity in `src/lib/__tests__/task-create.recurring.test.ts`
- [x] T021 [P] [US1] Add pipeline successor `createTask()` call-count, caller-owned transaction, post-commit outbound intent, and duplicate-successor no-op tests in `src/lib/__tests__/task-create.pipeline-successor.test.ts`
- [x] T022 [US1] Add flag-off, unbound-task, flag-on-null, slug-only, and downstream-metadata-only regression tests across `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/lib/task-dispatch.ts`, and `src/app/api/quality-review/route.ts`
- [x] T023 [US1] Add source-specific callsite behavior matrix tests for API, GitHub import, GitHub sync, recurring spawn, and successor creation in `src/lib/__tests__/task-create.callsite-matrix.test.ts`

### Implementation for User Story 1

- [x] T024 [US1] Implement `createTask()` source profiles, per-effect options, bounded result shape, and caller-owned transaction support in `src/lib/task-create.ts`
- [x] T025 [US1] Migrate API task creation to `createTask()` while preserving tickets, activities, subscriptions, mentions, assignee notifications, GitHub/GNAP push intent, broadcast, and response shape in `src/app/api/tasks/route.ts`
- [x] T026 [US1] Migrate GitHub issue import task creation to `createTask()` while preserving duplicate detection and GitHub metadata in `src/app/api/github/route.ts`
- [x] T027 [US1] Migrate GitHub sync task import to `createTask()` while preserving canonical GitHub columns and sync-created activity behavior in `src/lib/github-sync-engine.ts`
- [x] T028 [US1] Migrate recurring task spawn to `createTask()` inside the existing recurrence transaction in `src/lib/recurring-tasks.ts`
- [x] T029 [US1] Migrate pipeline successor creation to call `createTask()` exactly once from `src/lib/task-dispatch.ts`
- [x] T030 [US1] Add a production-source guard test that fails on direct `INSERT INTO tasks` outside `src/lib/task-create.ts` in `src/lib/__tests__/task-create.direct-insert-guard.test.ts`

**Checkpoint**: Existing task behavior is preserved and all task creation callsites share one helper.

---

## Phase 4: User Story 3 - Validate Agent Output Safely (Priority: P1)

**Goal**: Validate structured output and routing expressions with bounded, deterministic, safe profiles before they influence chain advancement.

**Independent Test**: Adversarial schema, output, and routing fixtures produce deterministic accept/reject/stall/termination outcomes without uncaught exceptions, unsafe primitives, script execution, or unbounded synchronous work.

### Tests for User Story 3

- [x] T031 [P] [US3] Add validator bound fixtures for schema size, output size, depth, keys, arrays, strings, pattern length, malformed schemas, and oversized payloads in `src/lib/__tests__/output-schema-validator.bounds.test.ts`
- [x] T032 [P] [US3] Add AJV safety-option fixtures for strict mode, schema validation, `$data=false`, `validateFormats=false`, no mutation/default/coercion/removal/all-errors behavior, no async, no remote refs, and no custom formats/keywords in `src/lib/__tests__/output-schema-validator.ajv-safety.test.ts`
- [x] T033 [P] [US3] Add conservative pattern-subset fixtures with positive, negative, near-match, non-match, unsafe-regex, and validation-budget cases in `src/lib/__tests__/output-schema-validator.patterns.test.ts`
- [x] T034 [P] [US3] Add validator LRU cache and p95 budget tests over the fixed schema corpus in `src/lib/__tests__/output-schema-validator.performance.test.ts`
- [x] T035 [P] [US3] Add routing allowlist, valid route, static no-match termination, malformed JSONPath, and bounded no-exception tests in `src/lib/__tests__/routing-rule-evaluator.validity.test.ts`
- [x] T036 [P] [US3] Add routing adversarial tests for JSONPath filter/script rejection, prototype access, forbidden primitives, unsupported operators, regex right sides, oversized literals, and dynamic execution hooks in `src/lib/__tests__/routing-rule-evaluator.adversarial.test.ts`
- [x] T037 [P] [US3] Add routing pre-validation cap, token, nesting, JSONPath result cap, and timeout-budget tests in `src/lib/__tests__/routing-rule-evaluator.budget.test.ts`
- [x] T038 [US3] Add exact advancement stall activity reason-code assertions for routing expression rejection and routing budget exceeded in `src/lib/__tests__/task-chain-routing-stalls.test.ts`

### Implementation for User Story 3

- [x] T039 [US3] Implement constrained AJV compilation, pre-validation caps, forbidden-feature rejection, conservative pattern enforcement, bounded errors, and `(template_id, schema_sha256)` LRU cache in `src/lib/output-schema-validator.ts`
- [x] T040 [US3] Implement fixed-corpus validator p95 measurement hooks and no-output-leak result shaping in `src/lib/output-schema-validator.ts`
- [x] T041 [US3] Implement the hand-written routing parser, allowlisted boolean grammar, expression caps, JSONPath pre-screening, and disabled JavaScript traversal in `src/lib/routing-rule-evaluator.ts`
- [x] T042 [US3] Implement routing timeout-budget handling, result caps, bounded rejection/stall results, and no routing-trace leakage in `src/lib/routing-rule-evaluator.ts`
- [x] T043 [US3] Add SPEC-004 unsafe primitive and `ajv-formats` guardrail tests for strict-scope modules in `src/lib/__tests__/task-pipeline-static-guardrails.test.ts`

**Checkpoint**: Untrusted output validation and routing evaluation are safe, bounded, and independently testable.

---

## Phase 5: User Story 2 - Configure Declarative Workflow Routing (Priority: P1)

**Goal**: Let operators configure workflow-template chain fields and let completed eligible tasks create exactly one deterministic successor, stall, or terminate normally.

**Independent Test**: Create/edit/read/delete workflow-template chain fields in the running app, complete representative pipeline-bound tasks, and verify valid routing, static fallback, target stalls, no-successor termination, and delete compatibility.

### Tests for User Story 2

- [x] T044 [P] [US2] Add `/api/workflows` create/update contract tests for `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts` persistence in `src/app/api/workflows/route.test.ts`
- [x] T045 [P] [US2] Add `/api/workflows` validation tests for rejecting `routing_rules` without `output_schema` and allowing static `next_template_slug` without schema in `src/app/api/workflows/route.test.ts`
- [x] T046 [P] [US2] Add `/api/workflows` Product Line scope tests for list, create, update, usage tracking, delete, Facility aggregate rejection, unauthorized workspace rejection, and no `auth.user.workspace_id` fallback in `src/app/api/workflows/route.scope.test.ts`
- [x] T047 [P] [US2] Add `DELETE /api/workflows?id=...` query-parameter compatibility and optional JSON-body backward-compatibility tests in `src/app/api/workflows/route.delete.test.ts`
- [x] T048 [P] [US2] Add Workflows editor tests for chain-field create/edit/read-back UI state and validation-error surfacing in `src/components/panels/orchestration-bar.test.tsx`
- [x] T049 [US2] Add valid routing, ordered-rule selection, static `next_template_slug`, fallback, normal chain termination, and no-successor tests in `src/lib/__tests__/task-chain-advancement.routing.test.ts`
- [x] T050 [US2] Add missing, duplicate, cross-workspace, and live-disabled target template advancement-stall tests with exact `data.reason_code` assertions in `src/lib/__tests__/task-chain-advancement.targets.test.ts`
- [x] T051 [US2] Add terminal-success advancement coverage for Aegis review approval, quality-review approval, bulk task status update, detail task status update, and detail retry action in `src/lib/__tests__/task-chain-advancement.transitions.test.ts`
- [x] T052 [US2] Add combined terminal-success overhead p95 tests comparing flag-off and null-chain baselines to eligible pipeline advancement in `src/lib/__tests__/task-chain-advancement.performance.test.ts`

### Implementation for User Story 2

- [x] T053 [US2] Implement workflow-template chain-field validation helpers in `src/lib/validation.ts`
- [x] T054 [US2] Persist and return workflow-template chain fields, scoped reads/writes, usage-tracking preservation, and query-parameter delete behavior in `src/app/api/workflows/route.ts`
- [x] T055 [US2] Add Workflows editor controls, scoped API calls through `appendScopeToPath`, validation display, usage-tracking preservation, and query-parameter delete calls in `src/components/panels/orchestration-bar.tsx`
- [x] T056 [US2] Implement `advanceTaskChain` eligibility for feature flag, non-`done` to `done`, template binding, and advancement-driving metadata in `src/lib/task-dispatch.ts`
- [x] T057 [US2] Implement output validation handoff, ordered routing evaluation, static fallback, target-template resolution, stall reason-code activity writes, and normal chain termination in `src/lib/task-dispatch.ts`
- [x] T058 [US2] Wire chain advancement into every live terminal-success callsite in `src/lib/task-dispatch.ts`, `src/app/api/quality-review/route.ts`, `src/app/api/tasks/route.ts`, and `src/app/api/tasks/[id]/route.ts`

**Checkpoint**: Operators can configure chains and terminal-success tasks advance, stall, or terminate through tested contracts.

---

## Phase 6: User Story 4 - Recover Failed or Stalled Chains Explicitly (Priority: P2)

**Goal**: Provide operator-only retry for the latest eligible validation failure or advancement stall without implicit replay, duplicate successors, or untracked drift.

**Independent Test**: Force each retry-eligible failure and stall, attempt ordinary task edits, then use the retry action to verify eligibility, provenance, drift confirmation, idempotency, recovery activities, bounded responses, and side-effect-free conflicts.

### Tests for User Story 4

- [x] T059 [P] [US4] Add failed-parent retry tests for missing output, invalid output, latest eligible activity selection, no `activity_id` override, older-activity replay rejection, ordinary failed-to-`done` no-retry behavior, and corrected-output success in `src/app/api/tasks/[id]/route.retry-output.test.ts`
- [x] T060 [P] [US4] Add advancement-stall retry tests for routing rejection, routing timeout, missing/disabled/duplicate/cross-workspace target, missing assignee, latest eligible activity selection, and terminal-success preservation in `src/app/api/tasks/[id]/route.retry-stall.test.ts`
- [x] T061 [P] [US4] Add retry conflict tests for ineligible states/reasons, missing selected-activity hash provenance, missing-provenance no drift-confirm bypass, unconfirmed drift, side-effect-free `409 Conflict`, no activity, no attempt increment, and response body `{ "retry_rejection_reason": "<enum>" }` in `src/app/api/tasks/[id]/route.retry-conflict.test.ts`
- [x] T062 [P] [US4] Add retry success response-contract tests for normal task detail shape plus `chain_retry`, all recovery outcomes, `successor_task_id`, `chain_terminated`, `idempotent_successor`, no full corrected-output/parsed-output/routing-trace leakage, and `data.reason_code='task_pipeline_retry_chain_advancement'` in `src/app/api/tasks/[id]/route.retry-response.test.ts`
- [x] T063 [P] [US4] Add retry provenance and drift tests for current-template use, drift conflict, confirmed drift, canonical hash parity, and monotonic per-parent `retry_attempt` shared across recovery classes in `src/app/api/tasks/[id]/route.retry-provenance.test.ts`
- [x] T064 [US4] Add repeated validation failure and repeated stalled retry tests proving no hard retry cap while unresolved and no successor if the stall remains in `src/app/api/tasks/[id]/route.retry-repeat.test.ts`
- [x] T065 [US4] Add chain-termination recovery tests for no matching rule/no static next, `recovery_outcome='chain_terminated'`, post-termination side-effect-free `409 retry_not_eligible`, and existing-successor post-recovery `200 OK successor_already_exists` in `src/app/api/tasks/[id]/route.retry-terminal.test.ts`

### Implementation for User Story 4

- [x] T066 [US4] Implement operator-authorized `retry_chain_advancement` request handling with no `activity_id` override support in `src/app/api/tasks/[id]/route.ts`
- [x] T067 [US4] Implement latest eligible activity selection, retry eligibility, side-effect-free conflict responses, and rejection reason enums in `src/app/api/tasks/[id]/route.ts`
- [x] T068 [US4] Implement template provenance hashing, missing-provenance conflict, unconfirmed drift conflict, and confirmed-drift retry parity in `src/lib/task-dispatch.ts`
- [x] T069 [US4] Implement failed-parent retry revalidation, failed-state preservation on still-invalid output, terminal-success restoration after valid output, and recovery-class metadata in `src/lib/task-dispatch.ts`
- [x] T070 [US4] Implement terminal-success advancement-stall retry preservation, stall persistence, successor creation, existing-successor idempotency, and chain termination outcomes in `src/lib/task-dispatch.ts`
- [x] T071 [US4] Implement bounded retry response shaping and recovery activity metadata without full corrected output, parsed output, or routing trace leakage in `src/app/api/tasks/[id]/route.ts`

**Checkpoint**: Operators can explicitly recover eligible failures and stalls with audited, bounded, idempotent behavior.

---

## Phase 7: User Story 5 - Trace Pipeline Lineage for Downstream Specs (Priority: P2)

**Goal**: Record task-chain lineage and one-successor guarantees needed by downstream specs without implementing downstream behavior.

**Independent Test**: Advance first-hop and later-hop chains, inspect lineage fields, verify assignee resolution and transaction rollback, prove one-successor-per-parent enforcement, and confirm downstream-scope behavior is absent.

### Tests for User Story 5

- [x] T072 [P] [US5] Add first-hop parent lineage initialization and successor lineage inheritance tests for `parent_task_id`, `root_task_id`, `chain_id`, `chain_stage`, workspace, project, workflow-template id, and slug snapshot in `src/lib/__tests__/task-chain-lineage.test.ts`
- [x] T073 [P] [US5] Add assignee resolution tests using `project_agent_assignments.agent_name`, `project_agent_assignments.role`, and `agents.name`, with no `agent_id` assumptions in `src/lib/__tests__/task-chain-assignee.test.ts`
- [x] T074 [P] [US5] Add missing-assignee advancement-stall tests with exact `task_pipeline_successor_assignee_missing` activity code in `src/lib/__tests__/task-chain-assignee.test.ts`
- [x] T075 [P] [US5] Add transaction rollback tests that force failures after parent lineage initialization, validation failure writes, stall activity writes, duplicate-successor guard checks, and successor insertion, then assert no partial lineage, activity, state, or successor rows persist in `src/lib/__tests__/task-chain-transaction-rollback.test.ts`
- [x] T076 [P] [US5] Add M62 migration tests proving duplicate preflight fails closed, partial unique index rejects a second non-null `parent_task_id`, multiple NULL `parent_task_id` rows remain valid, and rollback drops the index in `src/lib/__tests__/migrations.M62-task-successor-index.test.ts`
- [x] T077 [US5] Add downstream-scope drift guard tests excluding SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, SPEC-011 state, artifact, governance, area-routing, pilot, and CrabTrap behavior in `src/lib/__tests__/task-pipeline-downstream-scope-guard.test.ts`

### Implementation for User Story 5

- [x] T078 [US5] Implement first-hop parent lineage initialization and successor lineage inheritance in `src/lib/task-dispatch.ts`
- [x] T079 [US5] Implement successor assignee resolution through the live `project_agent_assignments.agent_name` to `agents.name` relationship in `src/lib/task-dispatch.ts`
- [x] T080 [US5] Implement transactional advancement boundaries for lineage initialization, validation failure writes, stall activity writes, duplicate guard checks, successor insertion, and post-commit outbound intents in `src/lib/task-dispatch.ts`
- [x] T081 [US5] Implement M62 partial unique successor index, duplicate preflight failure, and rollback compatibility in `src/lib/migrations.ts` and `docs/migrations/rollback-M62.sql`
- [x] T082 [US5] Implement existing-successor recovery and automated advancement idempotency without duplicate successor rows in `src/lib/task-dispatch.ts`

**Checkpoint**: SPEC-004 lineage and duplicate protections are reliable without downstream behavior drift.

---

## Phase 8: Polish, Documentation, Playwright, and Quality Gates

**Purpose**: Complete operator documentation, running-app verification, CI guardrails, audit remediation, and final evidence.

- [x] T083 [P] Update feature-flagged declarative task-chain lifecycle terminology, retry behavior, workflow-template configuration, and current limitations in `docs/orchestration.md`
- [x] T084 [P] Add real running-app Playwright journey for operator-auth workflow-template create, edit, read-back, routing-rules-without-schema rejection, static `next_template_slug` without schema, scoped usage update, and query-parameter delete behavior in `tests/e2e/task-pipeline-workflow-templates.spec.ts`
- [x] T085 Add SPEC-004 dependency-pin, audit, AJV safety, pattern-subset, unsafe primitive, direct task insert, and downstream-scope guardrail steps plus `pnpm audit:high` coverage in `.github/workflows/quality-gate.yml`
- [x] T086 Apply audit-remediation package and lockfile updates required for `pnpm audit --audit-level high` to pass in `package.json` and `pnpm-lock.yaml`
- [x] T087 Run and record `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm audit --audit-level high` evidence in `docs/ai/specs/SPEC-004-workflow.md`
- [x] T088 Record branch commit evidence for SPEC-004 docs and task-pipeline implementation completion in `docs/ai/specs/SPEC-004-workflow.md`

**Checkpoint**: Documentation, running-app verification, audit, CI guardrails, and final evidence are complete.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1** has no dependencies.
- **Phase 2** depends on Phase 1.
- **US1 Phase 3** depends on Phase 2 because all callsites require the shared helper surface.
- **US3 Phase 4** depends on Phase 2 and blocks safe routing in US2.
- **US2 Phase 5** depends on US1 shared creation and US3 safe validation/evaluation.
- **US4 Phase 6** depends on US2 advancement outcomes and US3 validation/evaluation behavior.
- **US5 Phase 7** depends on US1 shared creation and US2 advancement wiring, but its tests can be written after Phase 2.
- **Phase 8** depends on the desired implementation scope being complete.

### User Story Dependencies

- **US1 (P1)**: MVP foundation for task creation parity and regression safety.
- **US3 (P1)**: Safe validation/evaluation can proceed after strict-scope scaffolding and is required before routing logic is trusted.
- **US2 (P1)**: Depends on US1 for successor creation parity and US3 for safe routing.
- **US4 (P2)**: Depends on US2 advancement failures, stalls, and termination outcomes.
- **US5 (P2)**: Depends on US2 advancement and US1 `createTask()` integration.

### Parallel Opportunities

- Phase 2 fixture/type tasks `T009` through `T011` can run in parallel.
- US1 test tasks `T017` through `T021` can run in parallel before `T024`.
- US3 test tasks `T031` through `T037` can run in parallel by fixture domain.
- US2 API/UI route tests `T044` through `T048` can run in parallel.
- US4 retry test files `T059` through `T063` can run in parallel.
- US5 lineage, assignee, transaction, and migration tests `T072` through `T076` can run in parallel.
- Final docs and Playwright authoring `T083` and `T084` can run in parallel after implementation behavior is stable.

---

## Parallel Example Commands

### US1 Test Batch

```bash
pnpm test src/lib/__tests__/task-create.api.test.ts src/lib/__tests__/task-create.github-import.test.ts src/lib/__tests__/task-create.github-sync.test.ts src/lib/__tests__/task-create.recurring.test.ts src/lib/__tests__/task-create.pipeline-successor.test.ts
```

### US3 Fixture Batch

```bash
pnpm test src/lib/__tests__/output-schema-validator.bounds.test.ts src/lib/__tests__/output-schema-validator.ajv-safety.test.ts src/lib/__tests__/output-schema-validator.patterns.test.ts src/lib/__tests__/routing-rule-evaluator.adversarial.test.ts
```

### US4 Retry Batch

```bash
pnpm test src/app/api/tasks/[id]/route.retry-output.test.ts src/app/api/tasks/[id]/route.retry-stall.test.ts src/app/api/tasks/[id]/route.retry-conflict.test.ts src/app/api/tasks/[id]/route.retry-response.test.ts src/app/api/tasks/[id]/route.retry-provenance.test.ts
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 to preserve existing behavior and migrate shared task creation.
3. Complete US3 validation/evaluation safety before using routing behavior.
4. Complete US2 workflow-template configuration and chain advancement.
5. Validate with focused Vitest plus running-app Playwright before proceeding to P2 recovery and lineage polish.

### Incremental Delivery

1. Setup and strict-scope scaffolding.
2. Shared task creation and regression safety.
3. Safe validator and routing evaluator.
4. Workflow-template configuration and advancement.
5. Explicit retry recovery.
6. Lineage, transaction rollback, migration, docs, CI, audit, and final verification.

---

## Required Coverage Mapping

| Acceptance coverage | Task coverage |
|---------------------|---------------|
| P3-AC1 flag-off preservation | T022, T056, T058 |
| P3-AC2 unbound/null-chain preservation | T022, T056 |
| P3-AC3 valid routing, static fallback, rejection, termination | T044, T045, T049, T053-T058 |
| P3-AC4 output validation failures and output retry recovery | T031-T034, T038-T040, T059, T061-T069, T071 |
| P3-AC4a advancement-stall retry recovery | T050, T060-T071 |
| P3-AC4b retry response contract | T061-T067, T071 |
| P3-AC5 adversarial validation/evaluation safety | T031-T043 |
| P3-AC6 lineage and assignee resolution | T072-T074, T078-T080 |
| P3-AC6a shared creation and direct insert guard | T017-T030 |
| P3-AC6b transaction rollback and M62 uniqueness | T075, T076, T080-T082 |
| P3-AC7 routing rules, fallback, target stalls, termination | T035-T038, T049-T058 |
| P3-AC8 dependency pins, audit, CI guardrails | T004-T008, T043, T085, T086 |
| P3-AC9 safe evaluation fixtures and reason codes | T031-T043, T050 |
| P3-AC10 validator cache and performance budgets | T034, T040, T052 |
| P3-AC11 documentation and branch evidence | T083, T088 |
| P3-AC12 running-app workflow-template journey | T084 |

## Notes

- All tests in story phases must fail before their paired implementation task is completed.
- Direct fixture `INSERT INTO tasks` usage is allowed only in tests that deliberately verify runtime behavior and must be excluded from production guardrails.
- Screenshots from Playwright remain CI artifacts unless a manifest-backed exception is explicitly added.
