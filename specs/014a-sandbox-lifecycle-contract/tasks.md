# Tasks: SPEC-014A - Sandbox Ownership and Lifecycle Contract

**Input**: Design documents from `specs/014a-sandbox-lifecycle-contract/`, plus `docs/ai/specs/SPEC-014A-design-concept.md`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. This feature adds lifecycle persistence, bounded path/key validation, fake owner behavior, and a read-only API. Every behavior-changing implementation task starts with a failing Vitest or contract test task.

**Reviewability**: Primary surface is server-side sandbox lifecycle persistence/helper/read API. Planned production files stay within the ratified lifecycle-safety split exception: `src/lib/migrations.ts`, `src/lib/agent-sandbox-lifecycle.ts`, `src/lib/feature-flags.ts`, `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts`, `src/app/api/index/route.ts`, and `openapi.json`. Keep UI, runtime inventory, adapter manifests, real harness launch/resume/stop, retry/release/cancel/debug controls, tracker truth, successor selection, governance policy changes, token accounting, and auto-merge out of SPEC-014A.

**Ratified exception**: The tasks-mode reviewability gate computes synthetic reviewable LOC as `task_count * 40`. SPEC-014A intentionally keeps small TDD tasks so every lifecycle safety behavior starts with a failing test, while the implementation remains constrained to one server-side lifecycle surface and defers UI, adapter registry, real execution, and retry controls to later specs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or only adds independent failing coverage.
- **[Story]**: Maps to User Story 1 through User Story 5 from `spec.md`.
- Every task includes an exact file path.

## Phase 1: Setup

**Purpose**: Prepare strict-scope config, fixtures, rollback placeholder, and scope guardrails.

- [X] T001 Verify reviewability scope against `specs/014a-sandbox-lifecycle-contract/plan.md` and keep the ratified split exception in `specs/014a-sandbox-lifecycle-contract/tasks.md`
- [X] T002 [P] Add SPEC-014A strict-compatible helper and test paths to `tsconfig.spec-strict.json`; keep the route and M79 migration test covered by normal app typecheck/Vitest because those imports pull legacy auth/db/migration dependencies outside the strict subproject boundary
- [X] T003 [P] Add SPEC-014A planned TS route/helper/test/e2e guard paths to `eslint.config.mjs`
- [X] T004 [P] Create reusable sandbox lifecycle test fixtures in `src/lib/__tests__/agent-sandbox-lifecycle-fixtures.ts`
- [X] T005 [P] Add rollback placeholder for M79 in `docs/migrations/rollback-M79.sql`

---

## Phase 2: Foundational

**Purpose**: Add additive persistence and the closed contract vocabulary that all user stories depend on.

- [X] T006 [P] Add failing M79 migration tests for `agent_sandbox_lifecycles` columns, owner/status CHECK constraints, `(workspace_id, sandbox_key)` uniqueness, and rerun idempotency in `src/lib/__tests__/migrations-M79-agent-sandbox-lifecycles.test.ts`
- [X] T007 [P] Add failing M79 event-table tests for `agent_sandbox_lifecycle_events` columns, lifecycle FK, append-only ordering indexes, task-order indexes, and rollback idempotency in `src/lib/__tests__/migrations-M79-agent-sandbox-lifecycles.test.ts`
- [X] T008 Implement additive migration `079_agent_sandbox_lifecycles` in `src/lib/migrations.ts`
- [X] T009 Implement idempotent manual rollback SQL for M79 in `docs/migrations/rollback-M79.sql`
- [X] T010 Add `FEATURE_AGENT_RUNNER_SANDBOXES` to the feature-flag type/key registry with hard-default OFF and appropriate dependencies in `src/lib/feature-flags.ts`
- [X] T011 Run focused M79 migration tests and capture the command for `specs/014a-sandbox-lifecycle-contract/quickstart.md`

**Checkpoint**: M79 lifecycle persistence and flag registry are ready.

---

## Phase 3: User Story 1 - Create Inspectable Sandboxes For Already-Claimed Work (Priority: P1)

**Goal**: Fake Mission Control, OpenClaw, and external-harness owners create deterministic lifecycle evidence for already-claimed task stages without launching a real harness.

**Independent Test**: Enable the flag in a disposable workspace, create/prepare/run/terminal fake lifecycles for all three owners, and verify owner, key, status, sanitized path evidence, and events.

### Tests for User Story 1

- [X] T012 [P] [US1] Add failing tests for closed owner enum validation, lifecycle status vocabulary, sandbox key shape, and safe read-model serialization in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T013 [P] [US1] Add failing tests for fake `mission_control`, `openclaw`, and `external_harness` owners exercising create, prepare, mark_running, mark_terminal, and cleanup without real launches in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T014 [P] [US1] Add failing tests proving fake owners do not import or call OpenClaw command runners, Codex/Claude/Hermes/OpenCode launch code, gateway launch, or adapter manifest code in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

### Implementation for User Story 1

- [X] T015 [US1] Implement owner/status/event vocabularies, public types, and safe serialization helpers in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T016 [US1] Implement deterministic sandbox key construction and lifecycle read-model serialization in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T017 [US1] Implement production-code fake owners for `mission_control`, `openclaw`, and `external_harness` behind `FEATURE_AGENT_RUNNER_SANDBOXES` in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T018 [US1] Run focused US1 tests for `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

**Checkpoint**: User Story 1 is independently testable as the MVP.

---

## Phase 4: User Story 2 - Block All Mutations When The Feature Is Disabled (Priority: P1)

**Goal**: Flag-off behavior creates no lifecycle rows, no lifecycle events, and no fake artifacts while reads remain available with disabled-state evidence.

**Independent Test**: With the flag disabled, attempt every mutation hook and verify row counts and fake artifact counts remain unchanged.

### Tests for User Story 2

- [X] T019 [P] [US2] Add failing flag-off no-row/no-event tests for create, prepare, mark_running, mark_terminal, cleanup, and rollback in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T020 [P] [US2] Add failing flag-off fake artifact no-touch tests and disabled evidence assertions in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T021 [P] [US2] Add failing read-model tests proving existing authorized lifecycle rows remain readable with disabled-state evidence in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

### Implementation for User Story 2

- [X] T022 [US2] Implement feature-flag resolution through `resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', ctx)` in every lifecycle mutation path in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T023 [US2] Implement disabled-state mutation results before validation, row insertion, event insertion, or fake artifact work in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T024 [US2] Implement disabled read-model evidence while preserving authorized historical lifecycle rows in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T025 [US2] Run focused US2 tests for `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

**Checkpoint**: Flag OFF preserves existing installs.

---

## Phase 5: User Story 3 - Reject Unsafe Sandbox Keys And Paths (Priority: P1)

**Goal**: Bounded path and key validation fails closed for unsafe input and persists only sanitized relative evidence.

**Independent Test**: Run the adversarial corpus against the helper and verify zero lifecycle rows/events for rejected input.

### Tests for User Story 3

- [X] T026 [P] [US3] Add failing adversarial corpus tests for traversal, absolute paths, separators, dot segments, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized values, overlong segments, and root escape in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T027 [P] [US3] Add failing persistence-safety tests proving absolute host paths, raw path fragments, prompts, tokens, auth headers, provider payloads, raw session data, and secret-shaped strings are rejected or redacted in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T028 [P] [US3] Add failing duplicate normalized sandbox key/path conflict tests in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

### Implementation for User Story 3

- [X] T029 [US3] Implement printable ASCII segment validation, Unicode/control/reserved-name rejection, segment length limits, and duplicate-normalization detection in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T030 [US3] Implement bounded root resolution for `<MISSION_CONTROL_DATA_DIR>/sandboxes` and reviewed per-workspace roots without persisting absolute paths in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T031 [US3] Implement positive-allowlisted metadata validation and redaction helpers in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T032 [US3] Run focused US3 tests for `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

**Checkpoint**: Path/key safety is independently verified.

---

## Phase 6: User Story 4 - Make Duplicate Creates And Cleanup Reviewable (Priority: P2)

**Goal**: Duplicate create, conflicts, rollback, cleanup success, and cleanup failure are deterministic and audit-preserving.

**Independent Test**: Create the same lifecycle twice, conflict on owner/path, force partial-create rollback, force cleanup success, and force cleanup failure.

### Tests for User Story 4

- [X] T033 [P] [US4] Add failing idempotent create and `create_reused` event tests in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T034 [P] [US4] Add failing conflicting owner/root/path duplicate create tests proving no mutation of existing lifecycle in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T035 [P] [US4] Add failing rollback, cleanup success, cleanup failure, stale `cleanup_pending`, and durable-row-retention tests in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

### Implementation for User Story 4

- [X] T036 [US4] Implement transactional lifecycle create/reuse/conflict behavior and append-only event writes in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T037 [US4] Implement transition enforcement for create, prepare, mark_running, mark_terminal, cleanup_pending, cleaned_up, rolled_back, and cleanup_failed in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T038 [US4] Implement best-effort fake artifact cleanup/rollback and safe failure evidence in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T039 [US4] Run focused US4 tests for `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`

**Checkpoint**: Cleanup and idempotency behavior are reviewable.

---

## Phase 7: User Story 5 - Expose Read-Only Lifecycle Evidence For Future Runtime Inventory (Priority: P3)

**Goal**: Provide a task-authorized `sandbox_lifecycle.v1` read model for SPEC-014B without adding UI or controls.

**Independent Test**: Query task-scoped and lifecycle-filtered reads, verify auth/workspace scope, disabled evidence, bounded events, and API/OpenAPI parity.

### Tests for User Story 5

- [X] T040 [P] [US5] Add failing route tests for viewer auth, invalid task ids, workspace scope filtering, cross-workspace rejection, task-scoped lifecycle list, lifecycle filter, and disabled-state evidence in `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts`
- [X] T041 [P] [US5] Add failing route side-effect tests that snapshot row counts before and after GET for lifecycle/event, tasks, attempts, claims, and activities in `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts`
- [X] T042 [P] [US5] Add failing API index and OpenAPI parity assertions for `GET /api/tasks/{id}/sandbox-lifecycles` in `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts`

### Implementation for User Story 5

- [X] T043 [US5] Implement `buildSandboxLifecycleReadModel` with `sandbox_lifecycle.v1`, bounded recent events, disabled-state evidence, and no unsafe payload fields in `src/lib/agent-sandbox-lifecycle.ts`
- [X] T044 [US5] Implement read-only `GET /api/tasks/[id]/sandbox-lifecycles` with viewer auth and workspace scope filtering in `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts`
- [X] T045 [US5] Register the read-only sandbox lifecycle route in `src/app/api/index/route.ts` and `openapi.json`
- [X] T046 [US5] Run focused US5 tests for `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts`

**Checkpoint**: SPEC-014B has a stable read-only lifecycle source.

---

## Phase 8: Polish And Verification

**Purpose**: Validate full behavior, guard against scope drift, and prepare UAT evidence.

- [X] T047 [P] Add static scope guard tests proving SPEC-014A does not add UI, adapter manifests, real launch/resume/stop, OpenClaw command execution, retry/release/cancel/debug controls, successor selection, governance policy changes, token accounting, or auto-merge in `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
- [X] T048 [P] Update `specs/014a-sandbox-lifecycle-contract/quickstart.md` with exact focused test commands, API curl examples, migration marker checks, and cleanup SQL for disposable UAT rows
- [X] T049 [P] Update `docs/migrations/rollback-procedure.md` with the M79 rollback entry and reference `docs/migrations/rollback-M79.sql`
- [X] T050 Run focused Vitest commands for M79 migration, lifecycle helper, and lifecycle route tests
- [X] T051 Run `pnpm typecheck`
- [X] T052 Run `pnpm lint`
- [X] T053 Run `pnpm build`
- [X] T054 Run `pnpm test`
- [X] T055 Run `pnpm test:e2e` only if implementation unexpectedly changes a UI/browser route surface; otherwise record N/A because SPEC-014A adds no UI
- [X] T056 Run `pnpm test:all` or record the repository-approved equivalent if Playwright is N/A for this server-only spec
- [X] T057 Run `pnpm api:parity` or the existing API parity command from `package.json`
- [X] T058 Run manual UAT from `specs/014a-sandbox-lifecycle-contract/quickstart.md` in a disposable workspace and record enabled fake lifecycle plus flag-off read evidence

---

## Dependencies And Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all stories.
- **Phase 3 US1**: Depends on M79 and flag registry. MVP.
- **Phase 4 US2**: Depends on shared mutation helpers from US1.
- **Phase 5 US3**: Depends on key/path helper entry points from US1 and flag-off row-count fixtures from US2.
- **Phase 6 US4**: Depends on transactional create and path safety.
- **Phase 7 US5**: Depends on lifecycle persistence/read-model helper.
- **Phase 8 Polish**: Depends on all desired user stories.

### Parallel Opportunities

- T002, T003, T004, and T005 can run in parallel after T001.
- T006 and T007 can be written in parallel before T008/T009.
- T012, T013, and T014 can be written in parallel before US1 implementation.
- T019, T020, and T021 can be written in parallel before US2 implementation.
- T026, T027, and T028 can be written in parallel before US3 implementation.
- T033, T034, and T035 can be written in parallel before US4 implementation.
- T040, T041, and T042 can be written in parallel before US5 implementation.
- T047, T048, and T049 can run in parallel once implementation is complete.

## Scope Guard

Do not add runtime inventory UI, lifecycle controls, adapter manifests, fake adapter registry, real harness execution, OpenClaw launch, Codex/Claude/Hermes/OpenCode runner calls, retry/release/cancel/debug controls, auto-reaper, task successor behavior, GitHub mutation, governance policy changes, token accounting, or auto-merge. Defer first operator-visible runtime-inventory integration to SPEC-014B.
