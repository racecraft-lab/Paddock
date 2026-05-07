# Tasks: Mission Control Product-Line Seed and Flag Activation

**Input**: Design documents from `/specs/009b-mission-control-seed/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. SPEC-009B uses TDD for seed, preflight, idempotency, redaction, workflow import, governance, and non-dispatch guardrails.

**Organization**: Tasks are grouped by independently testable user story so each increment can be implemented and verified without launching the self-hosting pilot.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or does not depend on incomplete tasks.
- **[Story]**: User-story label for story phases only.
- Every task names the exact target file.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish SPEC-009B-owned files, strict-mode coverage, and fixtures before story work.

- [ ] T001 [P] Add SPEC-009B owned module and script entries to `tsconfig.spec-strict.json`
- [ ] T002 [P] Add SPEC-009B lint coverage for `src/lib/mission-control-seed/**` and `scripts/seed-mission-control-product-line.ts` in `eslint.config.mjs`
- [ ] T003 [P] Add an optional `seed:mission-control` package script that wraps the canonical Node type-stripping command in `package.json`
- [ ] T004 [P] Create the focused SQLite seed fixture helper in `src/lib/__tests__/mission-control-seed/test-db.ts`
- [ ] T005 [P] Create sanitized operator evidence fixtures for cron, OpenClaw/gateway, and `ssh hall` cleanup surfaces in `src/lib/__tests__/mission-control-seed/fixtures/operator-evidence.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared typed contracts and redaction behavior required by all user stories.

**Critical**: No user story work can begin until this phase is complete.

- [ ] T006 [P] Define seed constants, result shapes, residue summaries, evidence schema, and governance identities in `src/lib/mission-control-seed/types.ts`
- [ ] T007 [P] Write failing redaction tests for secrets, tokens, Authorization headers, API keys, credential substrings, and allowed identifiers in `src/lib/__tests__/mission-control-seed/redaction.test.ts`
- [ ] T008 Implement reusable evidence redaction helpers in `src/lib/mission-control-seed/redaction.ts`
- [ ] T009 Add redaction helper exports and type imports used by seed, preflight, and evidence modules in `src/lib/mission-control-seed/types.ts`

**Checkpoint**: Foundation ready - story tests and implementation can proceed.

---

## Phase 3: User Story 1 - Seed Mission Control Product Line A (Priority: P1) - MVP

**Goal**: Seed `mission-control` as Product Line A with Facility preserved, six departments, QA triage/sync ownership, and six required role assignments.

**Independent Test**: Run the focused seed tests against a clean fixture database and verify one `mission-control` Product Line, one preserved `facility` workspace, six department projects, QA as the only triage/repo sync owner, no product-surface departments, and six project-scoped role assignments.

### Tests for User Story 1

Write these tests first and confirm they fail before implementation.

- [ ] T010 [P] [US1] Write failing clean Product Line and Facility preservation tests in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T011 [P] [US1] Write failing department shape tests for QA, Development, DevSecOps, Marketing, Customer Service, Finance, and no macOS/UI/website/docs departments in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T012 [P] [US1] Write failing QA triage/inbox and `racecraft-lab/mission-control` repo sync-owner tests in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T013 [P] [US1] Write failing project-scoped role assignment tests that reject any `project_agent_assignments.workspace_id` dependency in `src/lib/__tests__/mission-control-seed/seed.test.ts`

### Implementation for User Story 1

- [ ] T014 [US1] Implement idempotent `facility` preservation and `mission-control` workspace upserts in `src/lib/mission-control-seed/seed.ts`
- [ ] T015 [US1] Implement six department project upserts with stable slugs, ticket prefixes, area slugs, and product-surface exclusions in `src/lib/mission-control-seed/seed.ts`
- [ ] T016 [US1] Implement QA-only triage/inbox and repository sync-owner assignment for `racecraft-lab/mission-control` in `src/lib/mission-control-seed/seed.ts`
- [ ] T017 [US1] Implement required role-to-platform-agent assignment upserts through `project_id`, `agent_name`, and `role` in `src/lib/mission-control-seed/seed.ts`
- [ ] T018 [US1] Emit workspace, department, QA sync-owner, and role assignment counts in `src/lib/mission-control-seed/evidence.ts`

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - Preserve Mission Control GitHub Intake Safely (Priority: P1)

**Goal**: Preserve existing `racecraft-lab/mission-control` issue sync metadata as QA triage/intake while blocking non-Mission-Control residue before mutation with redacted cleanup guidance.

**Independent Test**: Run focused tests with Mission Control issue fixtures and non-Mission-Control residue fixtures, verifying preservation, re-home behavior, blocked preflight `mutation_status: "not_mutated"`, unchanged residue snapshots, redaction, and cleanup checklist references.

### Tests for User Story 2

Write these tests first and confirm they fail before implementation.

- [ ] T019 [P] [US2] Write failing Mission Control issue linkage and sync metadata preservation tests in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T020 [P] [US2] Write failing preflight tests for non-Mission-Control project, task, repo config, cron, OpenClaw/gateway, and FocusEngine residue in `src/lib/__tests__/mission-control-seed/preflight.test.ts`
- [ ] T021 [P] [US2] Write failing blocked-preflight snapshot tests that assert `mutation_status: "not_mutated"` and unchanged residue rows/files in `src/lib/__tests__/mission-control-seed/preflight.test.ts`
- [ ] T022 [P] [US2] Write failing blocked-output redaction and cleanup-checklist-reference tests in `src/lib/__tests__/mission-control-seed/preflight.test.ts`
- [ ] T023 [P] [US2] Write failing runbook checklist tests for backup/export-first, explicit operator confirmation, destructive cleanup warnings, and post-cleanup verification in `src/lib/__tests__/mission-control-seed/evidence.test.ts`

### Implementation for User Story 2

- [ ] T024 [US2] Implement non-mutating residue scans for project/task GitHub sync state in `src/lib/mission-control-seed/preflight.ts`
- [ ] T025 [US2] Implement sanitized operator evidence loading for issue-sync cron, OpenClaw/gateway agents, and `ssh hall` FocusEngine residue in `src/lib/mission-control-seed/preflight.ts`
- [ ] T026 [US2] Integrate preflight-before-mutation blocking into apply mode in `src/lib/mission-control-seed/seed.ts`
- [ ] T027 [US2] Re-home existing `racecraft-lab/mission-control` issue tasks to QA triage/intake while preserving GitHub linkage and sync metadata in `src/lib/mission-control-seed/seed.ts`
- [ ] T028 [US2] Emit blocked-preflight residue summaries, unchanged snapshot hashes, redaction proof, and cleanup checklist path in `src/lib/mission-control-seed/evidence.ts`
- [ ] T029 [US2] Create the backup/export-first operator cleanup checklist and `ssh hall` FocusEngine cleanup verification flow in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T030 [US2] Implement `preflight` mode and blocked-preflight exit code `2` in `scripts/seed-mission-control-product-line.ts`

**Checkpoint**: User Stories 1 and 2 are independently functional and preserve tracker truth without destructive cleanup.

---

## Phase 5: User Story 3 - Activate Workflow, Flag, and Governance Policy Shape (Priority: P2)

**Goal**: Apply repo-owned Mission Control workflow families, canonical pilot flags, and conservative governance rows without starting autonomous work.

**Independent Test**: Run focused tests that validate required workflow slugs from the contract path, canonical `PILOT_MISSION_CONTROL_E2E` flag normalization, future flags off, advisory budget rows enabled, WIP visibility inactive, and no normal pilot-intake governance block.

### Tests for User Story 3

Write these tests first and confirm they fail before implementation.

- [ ] T031 [P] [US3] Write failing workflow-contract readiness tests for missing/stale Mission Control slugs and stale tracker identity in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T032 [P] [US3] Write failing workflow import tests for the nine required Issue Triage and Issue Remediation slugs in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T033 [P] [US3] Write failing canonical pilot flag tests that enable `PILOT_MISSION_CONTROL_E2E` and reject persisted `PILOT_PRODUCT_LINE_A_E2E` in `src/lib/__tests__/mission-control-seed/seed.test.ts`
- [ ] T034 [P] [US3] Write failing future-flag guard tests for task-control-plane, runner, sandbox, harness, and auto-merge flags in `src/lib/__tests__/mission-control-seed/guardrails.test.ts`
- [ ] T035 [P] [US3] Write failing governance policy tests for advisory token/USD budgets, evaluator-inactive WIP visibility, no blackout/degraded-window rows, and no normal-intake defer/block decision in `src/lib/__tests__/mission-control-seed/evidence.test.ts`

### Implementation for User Story 3

- [ ] T036 [US3] Correct the Mission Control workflow contract slugs and tracker repo identity narrowly in `docs/ai/workflows/mission-control/workflow-contract.yaml`
- [ ] T037 [US3] Regenerate the workflow contract Markdown review export after the narrow contract correction in `docs/ai/workflows/mission-control/exports/workflow-contract.md`
- [ ] T038 [US3] Reuse `loadWorkflowContractFromFile()` and `importWorkflowContract()` with the seeded Product Line workspace id in `src/lib/mission-control-seed/seed.ts`
- [ ] T039 [US3] Add the canonical `PILOT_MISSION_CONTROL_E2E` registry/runtime support and legacy drift handling in `src/lib/feature-flags.ts`
- [ ] T040 [US3] Update canonical pilot flag operator wording in `docs/feature-flags-runbook.md`
- [ ] T041 [US3] Implement Product Line A feature-flag upsert logic with Phase 1-7 prerequisites enabled and future flags disabled or absent in `src/lib/mission-control-seed/seed.ts`
- [ ] T042 [US3] Implement idempotent governance policy upserts for the three stable `resource_policies.notes` identities in `src/lib/mission-control-seed/seed.ts`
- [ ] T043 [US3] Emit workflow slugs, contract run/hash, canonical flag state, governance identities, and normal-intake governance allow evidence in `src/lib/mission-control-seed/evidence.ts`

**Checkpoint**: User Stories 1, 2, and 3 work independently without creating pilot execution state.

---

## Phase 6: User Story 4 - Prove Idempotency and Non-Dispatch Readiness (Priority: P3)

**Goal**: Prove repeatable seed behavior and verify SPEC-009B creates no synthetic issue, pilot task, successor record, claim, dispatch, runner state, sandbox lifecycle, auto-merge, or reconciliation path.

**Independent Test**: Run apply twice against the same eligible target, then run verify mode and guardrail tests to confirm stable identity counts and zero forbidden execution side effects.

### Tests for User Story 4

Write these tests first and confirm they fail before implementation.

- [ ] T044 [P] [US4] Write failing two-run idempotency tests for stable workspace, Facility, department, assignment, workflow, flag, governance, and issue-intake counts in `src/lib/__tests__/mission-control-seed/evidence.test.ts`
- [ ] T045 [P] [US4] Write failing non-dispatch tests for zero new pilot tasks, zero successor records, zero per-agent seed tasks, no claims, and no dispatched state in `src/lib/__tests__/mission-control-seed/guardrails.test.ts`
- [ ] T046 [P] [US4] Write failing static guardrail tests for no synthetic GitHub issue, scheduler launch, runner state, sandbox lifecycle, auto-merge, post-merge reconciliation, or generic Product Line B seeder scope in `src/lib/__tests__/mission-control-seed/guardrails.test.ts`
- [ ] T047 [P] [US4] Write failing CLI verify-mode contract tests for exit code `4` on invariant failure and redacted error output in `src/lib/__tests__/mission-control-seed/evidence.test.ts`

### Implementation for User Story 4

- [ ] T048 [US4] Implement stable row snapshot and identity-count hashing for idempotency evidence in `src/lib/mission-control-seed/evidence.ts`
- [ ] T049 [US4] Implement `apply` and `verify` modes, exit codes `0`, `2`, `3`, `4`, and `5`, and JSON output in `scripts/seed-mission-control-product-line.ts`
- [ ] T050 [US4] Add non-dispatch database assertions for tasks, workflow-chain successor records, claims, dispatches, runner rows, sandbox rows, and auto-merge markers in `src/lib/mission-control-seed/evidence.ts`
- [ ] T051 [US4] Add SPEC-009B-owned static forbidden-scope checks for scheduler, runner, sandbox, harness adapter, synthetic issue, generic Product Line B, and auto-merge code paths in `src/lib/__tests__/mission-control-seed/guardrails.test.ts`
- [ ] T052 [US4] Record verify-mode usage, idempotent rerun evidence expectations, and zero pilot task/chain record assertions in `docs/runbooks/mission-control-seed-predeploy.md`

**Checkpoint**: All user stories are independently functional and SPEC-009B remains seed-only.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, status updates, and verification evidence that span all stories.

- [ ] T053 [P] Update operator quickstart commands and expected verification outputs in `specs/009b-mission-control-seed/quickstart.md`
- [ ] T054 [P] Update SPEC-009B status and validation evidence in `docs/ai/rc-factory-technical-roadmap.md`
- [ ] T055 Update Phase 5 metrics, implementation-readiness notes, and later phase status in `docs/ai/specs/SPEC-009B-workflow.md`
- [ ] T056 [P] Record `pnpm exec vitest run src/lib/__tests__/mission-control-seed` results in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T057 [P] Record `pnpm typecheck` results in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T058 [P] Record `pnpm lint` results in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T059 Record `pnpm test` and `pnpm build` results or justified focused alternatives in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T060 Record full seed twice plus verify-mode evidence for a clean eligible target in `docs/runbooks/mission-control-seed-predeploy.md`
- [ ] T061 Confirm no unresolved clarification, gap, critical, or forbidden-scope markers remain in `specs/009b-mission-control-seed/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup completion and blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and can be implemented alongside US1 after shared contracts exist, but final preservation behavior needs the QA project from US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and can proceed after US1 workspace identity exists.
- **User Story 4 (Phase 6)**: Depends on US1, US2, and US3 because it verifies full seed idempotency and non-dispatch state.
- **Polish (Phase 7)**: Depends on all desired user stories and validation evidence.

### User Story Dependencies

- **US1 (P1)**: Required MVP baseline for Mission Control Product Line A, departments, QA ownership, and assignments.
- **US2 (P1)**: Requires the QA triage destination from US1 for re-homed Mission Control issue intake.
- **US3 (P2)**: Requires the seeded Product Line identity from US1 for workflow, flags, and governance policy scope.
- **US4 (P3)**: Requires US1, US2, and US3 to produce full idempotency and non-dispatch evidence.

### Within Each User Story

- Tests must be written first and fail before implementation.
- Fixture setup precedes tests that depend on clean or residue target databases.
- Preflight tests and implementation precede any apply-mode mutation.
- Workflow contract correction precedes workflow import application.
- Evidence and verification tasks follow seed behavior.

---

## Parallel Opportunities

- Setup tasks T001-T005 can run in parallel.
- Foundational type and redaction test tasks T006-T007 can run in parallel; T008-T009 depend on T007.
- US1 test tasks T010-T013 can run in parallel before implementation.
- US2 test tasks T019-T023 can run in parallel before implementation.
- US3 test tasks T031-T035 can run in parallel before implementation.
- US4 test tasks T044-T047 can run in parallel before implementation.
- Documentation/status tasks T053-T054 and validation recording tasks T056-T058 can run in parallel after implementation evidence exists.

## Parallel Example: User Story 2

```bash
Task: "Write failing Mission Control issue linkage and sync metadata preservation tests in src/lib/__tests__/mission-control-seed/seed.test.ts"
Task: "Write failing preflight tests for non-Mission-Control project, task, repo config, cron, OpenClaw/gateway, and FocusEngine residue in src/lib/__tests__/mission-control-seed/preflight.test.ts"
Task: "Write failing runbook checklist tests for backup/export-first, explicit operator confirmation, destructive cleanup warnings, and post-cleanup verification in src/lib/__tests__/mission-control-seed/evidence.test.ts"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1 Product Line A seed.
4. Stop and validate US1 independently with focused Vitest tests.

### Incremental Delivery

1. Add US2 to preserve Mission Control intake and block unsafe residue.
2. Add US3 to apply workflow families, canonical flags, and governance policy shape.
3. Add US4 to prove idempotency and non-dispatch readiness.
4. Complete Phase 7 documentation, roadmap/workflow status, and verification evidence.
