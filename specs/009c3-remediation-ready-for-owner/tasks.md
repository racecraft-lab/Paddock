# Tasks: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

**Input**: Design documents from `specs/009c3-remediation-ready-for-owner/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/remediation-readiness-contract.md`, and all files in `checklists/`
**Package Manager**: `pnpm`
**Node Path**: `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH`

**Tests**: Required. SPEC-009C3 follows TDD. RED tests must be written and confirmed failing before production changes for review `fix`, Aegis `rejected`, Aegis `approved`, required artifact evidence, advisory governance evidence, deterministic PR fixture identity, ready-for-owner transition, and regression guardrails.

**Primary Review Surface**: Scheduler/runtime task-chain execution in `src/lib/task-dispatch.ts`
**Secondary Surfaces**: `src/lib/task-artifacts.ts`, `src/lib/task-status.ts`, `src/app/api/quality-review/`, workflow contract YAML/importer, smoke docs, and focused tests only.

**Scope Boundary**: No manual merge reconciliation, no `ready_for_owner -> done`, no durable claim/run/control-plane tables, no automatic poller, no sandbox lifecycle, no harness adapters, no dedicated pilot evidence UI, and no broad workflow slug migration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after dependencies are met because it touches different files or isolated test sections
- **[Story]**: User story label for story phases only
- Every task includes exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish SPEC-009C3 branch context, validation boundaries, and fixture scaffolding before any story work.

- [x] T001 Verify branch/worktree status and package manager from `pnpm-lock.yaml`; record any pre-existing changes before edits in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T002 [P] Add SPEC-009C3 fixture seed helpers for root issue, remediation plan task, PR-producing dev task, review task, Aegis review, and governance evidence in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T003 [P] Add reusable stage-artifact payload builders for `spec-009c3.v1` envelopes in `src/lib/__tests__/task-artifacts-publish.test.ts`
- [x] T004 [P] Add reusable quality-review fixture helpers for reviewer `aegis` approval/rejection and wrong-workspace rows in `src/app/api/quality-review/__tests__/route.test.ts`
- [x] T005 [P] Add deterministic workflow-contract fixture expectations for `mission-control_dev_implementation` PR-producing semantics in `src/lib/__tests__/workflow-contracts/importer.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Write RED coverage and checkpoint reviewability before production implementation begins.

**Critical**: No production implementation task may start until T006-T014 are complete and focused RED failures are observed.

- [x] T006 [P] Write RED tests for required stage-artifact envelope validation, schema version, storage kind, MIME type, workspace scope, root issue identity, PR dev task identity, and secret-exclusion rejection in `src/lib/__tests__/task-artifacts-publish.test.ts`
- [x] T007 [P] Write RED tests for artifact publish/supersede failure activity and readiness blocking in `src/lib/__tests__/task-artifacts-publish.test.ts`
- [x] T008 [P] Write RED tests for C3 readiness happy-path predicates, deterministic PR fixture identity, and only-dev-task `ready_for_owner` transition in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T009 [P] Write RED tests for review `fix`, unsupported review verdict, stale successor suppression, retry without evidence loss, and no owner-ready side effects in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T010 [P] Write RED tests for Aegis `approved`, Aegis `rejected`, wrong reviewer, wrong workspace, missing canonical quality review, and bounded retry behavior in `src/app/api/quality-review/__tests__/route.test.ts`
- [x] T011 [P] Write RED tests for advisory governance evidence allow/block decisions, blocked budget/window/resource-policy outcomes, and `readiness_blocked=true` in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T012 [P] Write RED tests proving non-pilot task-chain behavior and non-remediation PR-producing SPEC-005 ready-for-owner behavior do not require SPEC-009C3 evidence gates in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T013 [P] Write RED tests proving workflow slugs remain stable while `mission-control_dev_implementation` keeps `produces_pr` and `external_terminal_event: github_pr_merged` in `src/lib/__tests__/workflow-contracts/importer.test.ts`
- [x] T014 Perform the reviewability checkpoint against `specs/009c3-remediation-ready-for-owner/plan.md` and `specs/009c3-remediation-ready-for-owner/tasks.md`, confirming primary surface, secondary surfaces, deferred work, and RED test coverage before production edits
- [x] T015 Run focused RED verification with `pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts` and record failing test names in `specs/009c3-remediation-ready-for-owner/tasks.md`

**Checkpoint**: RED coverage and reviewability are ready. Production implementation can begin.

---

## Phase 3: User Story 1 - Advance Approved Remediation To Owner Readiness (Priority: P1) - MVP

**Goal**: Advance a remediation chain to `ready_for_owner` only on the PR-producing `mission-control_dev_implementation` task after plan evidence, PR linkage, dev verification, review `pass`, Aegis `approved`, and governance allow evidence are present.

**Independent Test**: Seed a pilot remediation chain with deterministic fixture PR identity, record all required evidence, run task-chain advancement, and verify only the PR-producing dev task reaches `ready_for_owner`.

### Tests for User Story 1

- [x] T016 [P] [US1] Extend happy-path RED assertions for root issue traceability, remediation-plan evidence, dev-task PR ownership, review `pass`, Aegis approval, governance allow, and absence of merge/done effects in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T017 [P] [US1] Extend artifact RED assertions for `remediation_plan`, `dev_verification`, `review_verdict`, `aegis_approval`, and `governance_evidence` payload minimum fields in `src/lib/__tests__/task-artifacts-publish.test.ts`

### Implementation for User Story 1

- [x] T018 [US1] Implement SPEC-009C3 readiness-subject detection for `mission-control_dev_implementation` pilot chains in `src/lib/task-dispatch.ts`
- [x] T019 [US1] Implement required remediation-plan and dev-verification evidence lookup on or linked/superseded onto the PR-producing dev task in `src/lib/task-dispatch.ts`
- [x] T020 [US1] Implement deterministic PR linkage validation requiring `github_repo`, `github_pr_number`, and fixture/live source metadata before C3 success in `src/lib/task-dispatch.ts`
- [x] T021 [US1] Implement review `pass` handling that bypasses owner-review for SPEC-009C3 and evaluates Aegis/readiness against the PR-producing dev task in `src/lib/task-dispatch.ts`
- [x] T022 [US1] Implement Aegis `approved` readiness gate using the canonical `quality_reviews` row for reviewer `aegis`, matching task, and matching workspace in `src/app/api/quality-review/route.ts`
- [x] T023 [US1] Implement governance allow evidence lookup and readiness-blocker evaluation in `src/lib/task-dispatch.ts`
- [x] T024 [US1] Implement the final `ready_for_owner` transition so only the PR-producing dev task changes status and helper/root/review tasks remain non-owner-ready in `src/lib/task-status.ts`
- [x] T025 [US1] Ensure ready-for-owner activities for the happy path preserve readiness-subject `workspace_id`, root issue context, and PR-producing dev task context in `src/lib/task-dispatch.ts`
- [x] T026 [US1] Keep `mission-control_dev_implementation` PR-producing contract fields explicit in `docs/ai/workflows/mission-control/workflow-contract.yaml`
- [x] T027 [US1] Update workflow-contract import/apply assertions for stable slugs, `produces_pr`, and `external_terminal_event: github_pr_merged` in `src/lib/workflow-contracts/importer.ts`
- [x] T028 [US1] Run green focused verification for US1 with `pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts`

**Checkpoint**: User Story 1 is independently functional and testable as the MVP.

---

## Phase 4: User Story 2 - Block Failed Review Before Aegis Or Owner Readiness (Priority: P2)

**Goal**: A review `fix` verdict records evidence and loops or blocks remediation before Aegis, owner-review, or `ready_for_owner`.

**Independent Test**: Advance a PR-producing dev task to review, record `verdict='fix'`, and verify review evidence remains while no Aegis successor, owner-review successor, or owner-ready side effect is created.

### Tests for User Story 2

- [x] T029 [P] [US2] Extend review `fix` RED assertions for verdict evidence retention, stale successor suppression, no Aegis advancement, no owner-review advancement, no `ready_for_owner`, and no owner-ready side effects in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T030 [P] [US2] Extend retry RED assertions proving corrected work can later record review `pass` without deleting prior `fix` evidence or duplicating stale successors in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T031 [P] [US2] Extend artifact RED assertions for unsupported review verdict values and sanitized failure activity on artifact publish/supersede failures in `src/lib/__tests__/task-artifacts-publish.test.ts`

### Implementation for User Story 2

- [x] T032 [US2] Implement latest-applicable review verdict selection for the PR-producing dev task while preserving prior verdict artifacts in `src/lib/task-dispatch.ts`
- [x] T033 [US2] Implement review `fix` fail-closed routing before static `mission-control_review.next_template_slug` fallback can create owner-review or Aegis successors in `src/lib/task-dispatch.ts`
- [x] T034 [US2] Implement bounded review retry activity and duplicate-successor suppression using existing task-chain retry/activity surfaces in `src/lib/task-dispatch.ts`
- [x] T035 [US2] Implement unsupported review verdict failure handling with no owner-ready status write, notification, sync, successor, or owner packet in `src/lib/task-dispatch.ts`
- [x] T036 [US2] Implement sanitized artifact publish/supersede failure activity for review-verdict evidence failures in `src/lib/task-artifacts.ts`
- [x] T037 [US2] Run green focused verification for US2 with `pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-artifacts-publish.test.ts`

**Checkpoint**: Review `fix` is independently functional and blocks readiness before Aegis/owner side effects.

---

## Phase 5: User Story 3 - Require Aegis Approval And Handle Rejection (Priority: P2)

**Goal**: Aegis `approved` is the final automated readiness gate, while Aegis `rejected` records evidence and blocks owner readiness with bounded retry behavior.

**Independent Test**: Record Aegis outcomes against the PR-producing dev task and verify `approved` gates readiness while `rejected`, wrong reviewer, wrong workspace, or missing canonical review blocks readiness.

### Tests for User Story 3

- [x] T038 [P] [US3] Extend Aegis `approved` RED assertions for canonical `quality_reviews` linkage, reviewer `aegis`, same workspace, same dev task, and matching `aegis_approval` artifact in `src/app/api/quality-review/__tests__/route.test.ts`
- [x] T039 [P] [US3] Extend Aegis `rejected` RED assertions for rejection evidence retention, bounded retry activity, no `ready_for_owner`, and no owner-ready side effects in `src/app/api/quality-review/__tests__/route.test.ts`
- [x] T040 [P] [US3] Extend wrong-workspace, wrong-reviewer, missing-row, and artifact-only approval RED assertions in `src/lib/__tests__/task-dispatch.test.ts`

### Implementation for User Story 3

- [x] T041 [US3] Implement Aegis quality-review lookup by readiness-subject task id, workspace id, reviewer `aegis`, and status in `src/app/api/quality-review/route.ts`
- [x] T042 [US3] Implement `aegis_approval` artifact validation requiring canonical `quality_review_id`, reviewer `aegis`, supported status, workspace match, and reason in `src/lib/task-artifacts.ts`
- [x] T043 [US3] Implement Aegis `rejected` fail-closed routing with rejection evidence and bounded retry activity before owner-ready side effects in `src/lib/task-dispatch.ts`
- [x] T044 [US3] Implement guard that an `aegis_approval` artifact cannot approve readiness without the matching canonical `quality_reviews` row in `src/lib/task-dispatch.ts`
- [x] T045 [US3] Ensure Aegis review API responses and activity records preserve readiness-subject workspace scope and bounded root/dev task context in `src/app/api/quality-review/route.ts`
- [x] T046 [US3] Run green focused verification for US3 with `pnpm test src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-artifacts-publish.test.ts`

**Checkpoint**: Aegis approval/rejection is independently functional and readiness is blocked unless the canonical approval gate passes.

---

## Phase 6: User Story 4 - Preserve Deterministic Evidence And Scope Boundaries (Priority: P3)

**Goal**: Keep validation deterministic by default, document live draft PR smoke as explicit UAT only, and prove no later roadmap surfaces enter SPEC-009C3.

**Independent Test**: Run fixture validation and guardrail checks that prove deterministic PR identity, required evidence, advisory governance, stable slugs, and absence of out-of-scope merge/control-plane/UI/sandbox/poller work.

### Tests for User Story 4

- [x] T047 [P] [US4] Add RED guard tests proving fixture PR identity is accepted only for automated validation and never treated as live GitHub proof in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T048 [P] [US4] Add RED guard tests for optional live draft PR smoke failure cases: missing PR identity, non-draft identity, wrong-task identity, mutation beyond draft creation, merge/done reconciliation, and missing cleanup evidence in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T049 [P] [US4] Add RED guard tests proving governance blockers prevent readiness and produce zero owner-ready side effects in `src/lib/__tests__/task-dispatch.test.ts`
- [x] T050 [P] [US4] Add static guard script assertions for no manual merge reconciliation, no claim/run/control-plane schema, no sandbox/adapter work, no automatic poller, no dedicated evidence UI, and no broad workflow slug migration in `scripts/spec-009c3/check-scope-guards.mjs`
- [x] T051 [P] [US4] Add RED contract assertions that non-pilot task-chain and ordinary SPEC-005 PR-producing ready-for-owner fixtures still pass without C3 artifacts in `src/lib/__tests__/task-dispatch.test.ts`

### Implementation for User Story 4

- [x] T052 [US4] Implement fixture/live PR identity source checks and fixture-only acceptance boundaries in `src/lib/task-dispatch.ts`
- [x] T053 [US4] Implement optional live draft PR smoke validation logic as explicit input validation only, with no automatic GitHub mutation in `src/lib/task-dispatch.ts`
- [x] T054 [US4] Implement governance-blocked fail-closed behavior before owner-ready writes, notifications, activities, outbound sync, successors, or owner packets in `src/lib/task-dispatch.ts`
- [x] T055 [US4] Implement scope-guard script checks for forbidden tables, pollers, sandbox/adapters, merge/done reconciliation, dedicated evidence UI paths, and slug rewrites in `scripts/spec-009c3/check-scope-guards.mjs`
- [x] T056 [US4] Update fixture validation and optional live draft PR smoke instructions with deterministic-first commands, explicit operator opt-in, draft-only limits, and cleanup evidence in `specs/009c3-remediation-ready-for-owner/quickstart.md`
- [x] T057 [US4] Update pilot smoke checklist with deterministic fixture PR validation and optional live draft PR cleanup expectations in `docs/qa/pilot-smoke-checklist.md`
- [x] T058 [US4] Update roadmap/status evidence reaffirming SPEC-009C4 merge reconciliation, SPEC-009D/E review packet/evidence UI, and SPEC-013/SPEC-014 control-plane/sandbox/adapter deferrals in `docs/ai/rc-factory-technical-roadmap.md`
- [x] T059 [US4] Run green guardrail verification with `node scripts/spec-009c3/check-scope-guards.mjs` and `pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts`

**Checkpoint**: Deterministic validation and roadmap boundaries are independently functional and documented.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finalize evidence, strictness, docs, and full verification after selected user stories are complete.

- [x] T060 [P] Add any new SPEC-009C3-owned TypeScript modules to `tsconfig.spec-strict.json`; if no new modules were introduced, record N/A in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T061 [P] Add any new SPEC-009C3-owned TypeScript modules or scripts to `eslint.config.mjs`; if no new lint scope is needed, record N/A in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T062 [P] Review existing Task Board, PR link, Aegis badge/status, and owner-action notification surfaces for accuracy; if changed, add focused Playwright coverage in `tests/e2e/`
- [x] T063 [P] Run `pnpm test` and record pass/fail evidence in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T064 [P] Run `pnpm typecheck` and record pass/fail evidence in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T065 [P] Run `pnpm lint` and record pass/fail evidence in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T066 Run `pnpm build` and record pass/fail evidence in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T067 Run `pnpm test:e2e` only if T062 changes existing UI/operator surfaces; otherwise record UI e2e N/A with rationale in `specs/009c3-remediation-ready-for-owner/tasks.md`
- [x] T068 Run quickstart fixture validation from `specs/009c3-remediation-ready-for-owner/quickstart.md` and confirm zero real GitHub PR creation, update, merge, or `done` reconciliation
- [x] T069 Run optional live draft PR smoke from `specs/009c3-remediation-ready-for-owner/quickstart.md` only if explicitly operator-approved; otherwise record not-run because live smoke is opt-in UAT
- [x] T070 Perform final scope audit against `specs/009c3-remediation-ready-for-owner/contracts/remediation-readiness-contract.md` and `scripts/spec-009c3/check-scope-guards.mjs`, confirming no deferred roadmap work entered the diff

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 - Setup**: No dependencies; can start immediately.
- **Phase 2 - Foundational**: Depends on Phase 1; blocks all production implementation.
- **Phase 3 - US1 MVP**: Depends on Phase 2 RED tests and reviewability checkpoint.
- **Phase 4 - US2**: Depends on the US1 readiness-subject/evidence foundation, but review-fix tests can be prepared after Phase 2.
- **Phase 5 - US3**: Depends on the US1 Aegis-readiness foundation, but Aegis tests can be prepared after Phase 2.
- **Phase 6 - US4**: Depends on the core readiness/evidence predicates from US1 and can proceed in parallel with US2/US3 for docs and guard scripts.
- **Phase 7 - Polish**: Depends on all selected story phases.

### User Story Dependencies

- **US1 (P1)**: MVP. Establishes the happy path and readiness subject.
- **US2 (P2)**: Depends on US1 readiness-subject detection and evidence lookup; independently proves review `fix` fail-closed behavior.
- **US3 (P2)**: Depends on US1 readiness-subject detection and quality-review linkage; independently proves Aegis approval/rejection behavior.
- **US4 (P3)**: Depends on US1 core predicates; independently proves deterministic validation and scope boundaries.

### Red-Green-Refactor Order

1. Complete T006-T015 and observe RED failures.
2. For each story, complete story-specific RED tests before its implementation tasks.
3. Implement the smallest production change that turns the story tests green.
4. Run focused verification at each story checkpoint.
5. Run full verification and scope audit in Phase 7.

---

## Parallel Opportunities

- T002-T005 can run in parallel after T001.
- T006-T013 can run in parallel because they add isolated RED coverage areas.
- T016-T017 can run in parallel for US1 tests before T018.
- T029-T031 can run in parallel for US2 tests before T032.
- T038-T040 can run in parallel for US3 tests before T041.
- T047-T051 can run in parallel for US4 tests and guard script setup before T052.
- T060-T065 can run in parallel after story implementation, except shared verification output updates must be serialized if they edit the same section of `tasks.md`.

## Parallel Example: User Story 1

```text
Task: "T016 [P] [US1] Extend happy-path RED assertions in src/lib/__tests__/task-dispatch.test.ts"
Task: "T017 [P] [US1] Extend artifact RED assertions in src/lib/__tests__/task-artifacts-publish.test.ts"
```

After T016-T017 fail as expected, serialize production changes through T018-T027 because they touch shared task-chain/readiness behavior.

## Parallel Example: User Story 4

```text
Task: "T047 [P] [US4] Add fixture/live PR identity guard tests in src/lib/__tests__/task-dispatch.test.ts"
Task: "T050 [P] [US4] Add static scope guard script in scripts/spec-009c3/check-scope-guards.mjs"
Task: "T056 [US4] Update quickstart smoke documentation in specs/009c3-remediation-ready-for-owner/quickstart.md"
```

Coordinate edits to `src/lib/__tests__/task-dispatch.test.ts` if multiple agents work on US1, US2, US3, or US4 simultaneously.

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 RED tests and reviewability checkpoint.
3. Complete Phase 3 US1.
4. Stop and validate US1 with focused tests before adding failure-loop behavior.

### Incremental Delivery

1. US1 proves the happy path reaches `ready_for_owner` only on the PR-producing dev task.
2. US2 proves review `fix` blocks Aegis/owner readiness without losing evidence.
3. US3 proves Aegis `approved` gates readiness and `rejected` blocks readiness.
4. US4 proves deterministic validation and deferred-scope guardrails.
5. Phase 7 verifies full project quality and documents any UI/live-smoke N/A decisions.

### Scope Enforcement

- Keep production changes centered on `src/lib/task-dispatch.ts`.
- Add helper extraction only if it reduces real complexity; new TS/TSX modules must be added to `tsconfig.spec-strict.json` and `eslint.config.mjs`.
- Do not add schema migrations unless implementation proves an existing table cannot satisfy the contract; the current plan assumes no schema migration.
- Do not add new runtime dependencies.
- Do not create a dedicated evidence UI.

---

## Coverage Notes

- **Review `fix`**: T009, T029-T037.
- **Aegis `rejected`**: T010, T039, T043, T046.
- **Aegis `approved`**: T010, T038, T041-T046.
- **Required artifact evidence**: T006-T007, T017, T036, T042.
- **Advisory governance evidence**: T011, T023, T049, T054.
- **Deterministic PR fixture identity**: T008, T020, T047, T052, T068.
- **Ready-for-owner transition**: T008, T016, T024-T025.
- **No manual merge reconciliation / `done` transition**: T016, T048, T050, T055, T068, T070.
- **No claim/run/control-plane tables**: T050, T055, T070.
- **No sandbox/adapters/harness execution**: T050, T055, T070.
- **No automatic poller**: T050, T055, T070.
- **No dedicated evidence UI**: T050, T055, T062, T070.
- **No broad workflow slug migration**: T013, T026-T027, T050, T055.
- **Quickstart deterministic fixture PR validation**: T056, T068.
- **Optional explicit live draft PR validation**: T056-T057, T069.

## Unresolved For Consensus

None. The generated tasks encode the current spec, plan, contract, quickstart, design concept, and checklist boundaries.

## Verification Commands

Run from the dedicated worktree:

```bash
cd /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/009c3-remediation-ready-for-owner
export PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH
pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts
node scripts/spec-009c3/check-scope-guards.mjs
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e # only if existing UI/operator surfaces change
```

### Implementation Evidence

- **Worktree/package-manager guard (T001):** branch `009c3-remediation-ready-for-owner`; package manager `pnpm` from `pnpm-lock.yaml`; no main-checkout archive cleanup edits were touched.
- **RED evidence (T015):** initial focused C3 verification failed before production changes: artifact envelope validation did not reject invalid C3 artifacts; review `fix`/missing-readiness cases followed the static successor path; C3 quality-review approvals incorrectly produced owner-ready side effects; workflow contract lacked the PR-merged terminal event.
- **Focused GREEN evidence (T028/T037/T046/T059):** `pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/app/api/quality-review/__tests__/route.test.ts` passed with 3 files and 53 tests.
- **Full unit/integration evidence (T063):** `pnpm test` passed outside the sandbox with 276 files passed, 32 skipped; 2876 tests passed, 1 skipped, 84 todo.
- **Type/lint/build evidence (T064-T066):** `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed on Node 22.22.2.
- **Scope guard evidence (T050/T055/T059/T070):** `node scripts/spec-009c3/check-scope-guards.mjs` passed with 12 changed files checked; no claim/run tables, sandbox/adapter work, automatic poller, merge/done reconciliation, evidence UI, or broad slug migration entered the diff.
- **Strict-scope config evidence (T060-T061):** no new SPEC-009C3 TypeScript/TSX modules were introduced; the new `scripts/spec-009c3/check-scope-guards.mjs` is covered by the existing repository ESLint scan, so `tsconfig.spec-strict.json` and `eslint.config.mjs` required no edits.
- **UI/e2e evidence (T062/T067):** no existing operator UI/browser surface changed; Playwright/e2e is N/A for this implementation.
- **Fixture smoke evidence (T068):** deterministic fixture-linked PR validation is covered by the C3 task-dispatch, artifact, quality-review, and workflow-contract tests plus the scope guard; the automated path creates, updates, merges, and reconciles zero real GitHub PRs.
- **Live smoke evidence (T069):** optional live draft PR smoke was not run because it is explicit operator-approved UAT only.
