# Tasks: SPEC-014B - Harness Adapter Manifest and Fake Registry

**Input**: Design documents from `specs/014b-adapter-manifest-fakes/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/runtime-inventory-api.md`, `quickstart.md`, completed checklists, and `docs/ai/specs/SPEC-014B-design-concept.md`

**Tests**: Required. SPEC-014B changes runtime contracts, a read-only API, and the Agents UI, so every behavioral slice starts with failing Vitest, route, component, guard, or Playwright tasks.

**Reviewability**: Primary surface is the harness adapter contract in `src/lib/harness-adapters/`. Secondary projections are the read-only API route and read-only Agents evidence. Stop and split if implementation exceeds 800 reviewable LOC, 8 production files, 25 total files, or adds a second primary surface.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on an incomplete task.
- **[Story]**: User story label for story phases only.
- Every task includes an exact file path.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the planned file boundaries and verification hooks.

- [ ] T001 Verify package manager and commands in `pnpm-lock.yaml`, `package.json`, and `docs/ai/specs/autopilot-state.json`
- [ ] T002 Create `src/lib/harness-adapters/` and `src/lib/harness-adapters/__tests__/` directories for the new harness adapter boundary
- [ ] T003 Create `src/app/api/agents/runtime-inventory/` for the dedicated read-only route
- [ ] T004 Create `src/components/agents/` and `src/components/agents/__tests__/` for the read-only Agents runtime inventory evidence component
- [ ] T005 Create `scripts/spec-014b/` for static scope guards
- [ ] T006 Add planned SPEC-014B TypeScript and TSX paths to `tsconfig.spec-strict.json`
- [ ] T007 Add planned SPEC-014B TypeScript, TSX, and guard paths to `eslint.config.mjs`
- [ ] T008 Record the reviewability budget checkpoint and split boundary in `specs/014b-adapter-manifest-fakes/tasks.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and guardrails that every story depends on.

**Critical**: No user story implementation starts until this phase is complete.

- [ ] T009 [P] Write failing strict type surface tests for public manifest, reason-code, policy, evidence, validation, and runtime inventory types in `src/lib/harness-adapters/__tests__/validation.test.ts`
- [ ] T010 [P] Write failing static scope guard tests proving forbidden import/call patterns are detected in `scripts/spec-014b/check-harness-adapter-scope.mjs`
- [ ] T011 Implement closed public type definitions, enums, and schema-version constants in `src/lib/harness-adapters/types.ts`
- [ ] T012 Implement initial static scope guard scanner for migrations, real harness calls, gateway/process execution, scheduler dispatch, claim-control/retry mutation, lifecycle-control mutation, GitHub mutation, governance mutation, successor selection, and auto-merge in `scripts/spec-014b/check-harness-adapter-scope.mjs`
- [ ] T013 Run the foundational red tests and guard command, confirm they fail for missing implementation or positive fixtures, then update evidence notes in `specs/014b-adapter-manifest-fakes/tasks.md`

**Checkpoint**: Shared types and static scope guard shell are ready.

---

## Phase 3: User Story 1 - Review Declared Harness Capabilities (Priority: P1) MVP

**Goal**: Checked-in fake manifests validate through one closed contract without invoking any real harness, gateway, process, or provider.

**Independent Test**: Manifest validator tests prove both fake postures validate, malformed fixtures fail with `harness_manifest_validation.v1`, duplicate/missing/unknown manifest ids fail closed, and no unsafe values are exposed.

### Tests for User Story 1

- [ ] T014 [P] [US1] Write failing tests for valid `paddock_owned_sandbox_fake` and `external_harness_fake` manifests in `src/lib/harness-adapters/__tests__/validation.test.ts`
- [ ] T015 [P] [US1] Write failing tests for missing capability declarations, boolean/null support, unknown properties, missing unsupported reason codes, and invalid policy objects in `src/lib/harness-adapters/__tests__/validation.test.ts`
- [ ] T016 [P] [US1] Write failing tests for duplicate manifest ids, missing required manifests, unknown v1 manifest ids, and deterministic registry ordering in `src/lib/harness-adapters/__tests__/validation.test.ts`
- [ ] T017 [P] [US1] Write failing tests for bounded `harness_manifest_validation.v1` issue caps, field paths, rejected property names, and no raw value/schema/stack exposure in `src/lib/harness-adapters/__tests__/validation.test.ts`
- [ ] T018 [P] [US1] Write failing tests for secret-shaped values, raw HTML/Markdown, provider payloads, host paths, prompt bodies, token payloads, transcripts, raw tool payloads, and unsafe URIs in manifest/evidence text fields in `src/lib/harness-adapters/__tests__/validation.test.ts`

### Implementation for User Story 1

- [ ] T019 [US1] Implement closed fake manifest fixtures in `src/lib/harness-adapters/fixtures.ts`
- [ ] T020 [US1] Implement manifest support-object and policy validation in `src/lib/harness-adapters/validation.ts`
- [ ] T021 [US1] Implement registry validation, duplicate detection, missing-required detection, unknown-id detection, and deterministic registry ordering in `src/lib/harness-adapters/validation.ts`
- [ ] T022 [US1] Implement bounded validation issue helpers and safe diagnostics in `src/lib/harness-adapters/validation.ts`
- [ ] T023 [US1] Implement plain-text and secret-shaped value rejection helpers in `src/lib/harness-adapters/evidence.ts`
- [ ] T024 [US1] Run `pnpm test -- src/lib/harness-adapters/__tests__/validation.test.ts` and make US1 tests pass

**Checkpoint**: US1 validates the harness adapter manifest contract independently.

---

## Phase 4: User Story 2 - Distinguish Visibility From Eligibility (Priority: P1)

**Goal**: The runtime inventory read model produces `visible`, `unassigned`, `assigned`, `eligible`, and `blocked` states from authorized evidence without persistence or mutation.

**Independent Test**: Runtime inventory tests prove state precedence, summary counts, eligibility gates, same-scope lifecycle evidence, feature-flag behavior, and `/api/agents/runtime-inventory` response contracts.

### Tests for User Story 2

- [ ] T025 [P] [US2] Write failing runtime inventory tests for `visible`, `unassigned`, `assigned`, `eligible`, and `blocked` state precedence in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T026 [P] [US2] Write failing runtime inventory tests for feature-flag, assignment, requested capability, governance, tracker-linked task, SPEC-014A lifecycle, authorization, and evidence-safety gates in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T027 [P] [US2] Write failing tests for no `eligible` without `task_id`, no `eligible` from absent/stale/cross-workspace/cross-scope lifecycle evidence, and lifecycle status mapping in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T028 [P] [US2] Write failing tests for unique entry ids, deterministic ordering, single generated timestamp, single feature-flag resolution, and summary counts matching returned entries in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T029 [P] [US2] Write failing route tests for `GET /api/agents/runtime-inventory` auth, workspace/facility scope, `task_id`, `project_id`, `role`, `requested_capability`, `state`, and `manifest_id` filters in `src/app/api/agents/runtime-inventory/route.test.ts`
- [ ] T030 [P] [US2] Write failing route tests for `/api/agents` response compatibility and no default runtime inventory embedding in `src/app/api/agents/runtime-inventory/route.test.ts`
- [ ] T031 [P] [US2] Write failing API index and OpenAPI parity tests for `/api/agents/runtime-inventory` in `src/app/api/agents/runtime-inventory/route.test.ts`

### Implementation for User Story 2

- [ ] T032 [US2] Implement request-local runtime inventory derivation, state precedence, summary generation, and deterministic entry ids in `src/lib/harness-adapters/runtime-inventory.ts`
- [ ] T033 [US2] Implement project-role assignment, task, governance, feature-flag, authorization, and SPEC-014A lifecycle gate inputs in `src/lib/harness-adapters/runtime-inventory.ts`
- [ ] T034 [US2] Implement lifecycle evidence qualification for same-scope `created`, `prepared`, or `running` statuses in `src/lib/harness-adapters/runtime-inventory.ts`
- [ ] T035 [US2] Implement the read-only route handler in `src/app/api/agents/runtime-inventory/route.ts`
- [ ] T036 [US2] Register `/api/agents/runtime-inventory` in `src/app/api/index/route.ts`
- [ ] T037 [US2] Add `/api/agents/runtime-inventory` schema and path documentation to `openapi.json`
- [ ] T038 [US2] Run `pnpm test -- src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/app/api/agents/runtime-inventory/route.test.ts` and make US2 tests pass

**Checkpoint**: US2 exposes the read-only runtime inventory API independently.

---

## Phase 5: User Story 3 - Fail Closed For Unsupported Capabilities And Policies (Priority: P1)

**Goal**: Unsupported capabilities, unsupported policies, expired timeout budgets, and unsafe evidence fail closed with stable bounded evidence and no fallback or mutation.

**Independent Test**: Capability-resolution tests and route tests prove fail-closed reason codes, error precedence, sanitized evidence rejection, and no state mutation.

### Tests for User Story 3

- [ ] T039 [P] [US3] Write failing tests for `capability_unsupported`, `approval_unsupported`, `user_input_unsupported`, and `timeout_budget_expired` capability-resolution outcomes in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T040 [P] [US3] Write failing tests for multiple failed gates returning deterministic reason-code order in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T041 [P] [US3] Write failing tests for unsafe evidence returning `sanitized_evidence_rejected`, omitting unsafe objects, and exposing only bounded rejection metadata in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`
- [ ] T042 [P] [US3] Write failing route tests for request-level error precedence `401`, `400`, `403`, `422`, bounded `500`, and no partial `entries` in `src/app/api/agents/runtime-inventory/route.test.ts`
- [ ] T043 [P] [US3] Write failing no-side-effect tests that snapshot task, artifact, claim, lifecycle, governance, GitHub sync, scheduler, tracker, successor, and auto-merge tables/state around blocked runtime inventory reads in `src/app/api/agents/runtime-inventory/route.test.ts`

### Implementation for User Story 3

- [ ] T044 [US3] Implement capability and policy resolution helpers in `src/lib/harness-adapters/runtime-inventory.ts`
- [ ] T045 [US3] Implement deterministic reason-code collection and precedence in `src/lib/harness-adapters/runtime-inventory.ts`
- [ ] T046 [US3] Implement sanitized evidence acceptance and rejection behavior in `src/lib/harness-adapters/evidence.ts`
- [ ] T047 [US3] Implement route-level error precedence and bounded `runtime_inventory_error.v1` responses in `src/app/api/agents/runtime-inventory/route.ts`
- [ ] T048 [US3] Run `pnpm test -- src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/app/api/agents/runtime-inventory/route.test.ts` and make US3 tests pass

**Checkpoint**: US3 proves fail-closed behavior independently.

---

## Phase 6: User Story 4 - Inspect Runtime Inventory In The Existing Agents Surface (Priority: P2)

**Goal**: Operators can inspect runtime inventory evidence in the existing Agents surface without new mutation controls.

**Independent Test**: Component and Playwright tests cover runtime inventory state labels, selected manifest, reasons, lifecycle references, sanitized evidence, loading/error/empty/flag-off states, responsive layout, keyboard/screen-reader behavior, and absence of launch/mutation controls.

### Tests for User Story 4

- [ ] T049 [P] [US4] Write failing component tests for state labels, selected manifest, reason codes, lifecycle references, sanitized evidence, generated timestamp, and truncated diagnostics in `src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx`
- [ ] T050 [P] [US4] Write failing component tests for loading, background refresh, no entries, feature-flag-off, unauthorized, invalid-filter, unsupported-capability, blocked, stale-lifecycle, and truncated-diagnostics states in `src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx`
- [ ] T051 [P] [US4] Write failing accessibility tests for visible text labels, color-not-sole-signal, semantic section labels, keyboard focus order, and screen-reader names in `src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx`
- [ ] T052 [P] [US4] Write failing integration tests proving `AgentSquadPanel` fetches the dedicated route, preserves existing `/api/agents` behavior, and does not add launch/assignment/retry/lifecycle controls in `src/components/panels/__tests__/agent-runtime-inventory.test.tsx`
- [ ] T053 [P] [US4] Add Playwright UAT coverage for flag-off, visible, unassigned, assigned, eligible, blocked, unsupported capability, sanitized evidence rejection, mobile, and desktop states in `tests/e2e/agents-runtime-inventory.spec.ts`

### Implementation for User Story 4

- [ ] T054 [US4] Implement typed read-only runtime inventory UI models in `src/components/agents/RuntimeInventoryEvidence.tsx`
- [ ] T055 [US4] Implement state badges, manifest evidence, eligibility reasons, lifecycle references, sanitized evidence, diagnostics, and bounded error/empty states in `src/components/agents/RuntimeInventoryEvidence.tsx`
- [ ] T056 [US4] Integrate `RuntimeInventoryEvidence` into `src/components/panels/agent-squad-panel.tsx` using the dedicated runtime inventory route and existing scope helpers
- [ ] T057 [US4] Ensure runtime inventory UI wraps or truncates long ids without overlap and does not infer or retain stale eligible state client-side in `src/components/agents/RuntimeInventoryEvidence.tsx`
- [ ] T058 [US4] Run `pnpm test -- src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx src/components/panels/__tests__/agent-runtime-inventory.test.tsx` and make US4 component tests pass
- [ ] T059 [US4] Run `pnpm test:e2e -- tests/e2e/agents-runtime-inventory.spec.ts` or document the environment limitation with manual browser evidence in `specs/014b-adapter-manifest-fakes/quickstart.md`

**Checkpoint**: US4 provides read-only operator visibility in the existing Agents surface.

---

## Phase 7: User Story 5 - Preserve Existing Control-Plane Boundaries (Priority: P3)

**Goal**: SPEC-014B reuses existing harness-adjacent surfaces as read inputs or compatibility boundaries without adding real execution or mutations.

**Independent Test**: Static guards, route side-effect tests, API compatibility tests, and repo knowledge index checks prove no forbidden side-effect path or documentation drift.

### Tests for User Story 5

- [ ] T060 [P] [US5] Add positive and negative static guard fixtures for forbidden imports/calls in `scripts/spec-014b/check-harness-adapter-scope.mjs`
- [ ] T061 [P] [US5] Add guard assertions for no migration files, no `src/lib/adapters` widening, no gateway/process execution, no scheduler dispatch, no claim-control/retry/lifecycle-control mutation, no GitHub/governance/successor/auto-merge path in `scripts/spec-014b/check-harness-adapter-scope.mjs`
- [ ] T062 [P] [US5] Add route side-effect regression tests for `/api/agents`, `/api/adapters`, task dispatch, claim reconciliation/control, and sandbox lifecycle compatibility in `src/app/api/agents/runtime-inventory/route.test.ts`
- [ ] T063 [P] [US5] Add API index, OpenAPI, and repo knowledge index drift checks for the new route and guard script in `docs/ai/repo-knowledge-index.json`

### Implementation for User Story 5

- [ ] T064 [US5] Finish static scope guard implementation and ensure `node scripts/spec-014b/check-harness-adapter-scope.mjs` passes
- [ ] T065 [US5] Update `docs/ai/repo-knowledge-index.json` for new SPEC-014B files, route, tests, and guard script
- [ ] T066 [US5] Run `pnpm knowledge:index:check`, `pnpm knowledge:index:smoke`, and `pnpm guardrails -- --suite repo-knowledge-index`
- [ ] T067 [US5] Run compatibility-focused tests for existing `/api/agents`, `/api/adapters`, claim reconciliation/control, and sandbox lifecycle read behavior

**Checkpoint**: US5 proves the control-plane boundaries remain intact.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, docs, UAT evidence, and review packet preparation.

- [ ] T068 [P] Update `specs/014b-adapter-manifest-fakes/quickstart.md` with exact focused commands, expected evidence paths, and any environment limitations discovered during implementation
- [ ] T069 [P] Update `docs/ai/specs/SPEC-014B-workflow.md` with implementation, verification, UAT, and post-gate evidence
- [ ] T070 [P] Update `docs/ai/specs/autopilot-state.json` with completed implementation and post-gate state
- [ ] T071 Run `pnpm typecheck`
- [ ] T072 Run `pnpm lint`
- [ ] T073 Run `pnpm test`
- [ ] T074 Run `pnpm build`
- [ ] T075 Run `pnpm test:e2e` or record the environment limitation and manual browser proof in `specs/014b-adapter-manifest-fakes/quickstart.md`
- [ ] T076 Run `node scripts/spec-014b/check-harness-adapter-scope.mjs`
- [ ] T077 Run the 2.6.1 verify implementation gate and write `specs/014b-adapter-manifest-fakes/verify-report.md`
- [ ] T078 Run the 2.6.1 verify-tasks phantom check and write `specs/014b-adapter-manifest-fakes/verify-tasks-report.md`
- [ ] T079 Run code review, errors, tests, types, simplify, and comments review gates or record bounded deferrals in `docs/ai/specs/SPEC-014B-workflow.md`
- [ ] T080 Run Archive Sweep dry-run evidence, confirm current target exclusion, cleanup safety, and recovery-command evidence in `docs/ai/specs/SPEC-014B-workflow.md`
- [ ] T081 Generate `specs/014b-adapter-manifest-fakes/uat-runbook.md` for disposable-workspace manual UAT
- [ ] T082 Generate the PR review packet with scope budget, file review order, traceability, verification evidence, rollback/flag notes, and known gaps in `specs/014b-adapter-manifest-fakes/pr-review-packet.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **US1 Manifest Contract**: Depends on Phase 2 and is the MVP.
- **US2 Runtime Inventory**: Depends on US1 types, fixtures, and validation.
- **US3 Fail-Closed Behavior**: Depends on US1 and US2 runtime inventory foundations.
- **US4 Agents UI**: Depends on US2 API response shape and US3 sanitized evidence behavior.
- **US5 Boundary Preservation**: Can start after Phase 2 guard shell, but final assertions depend on all implementation surfaces.
- **Polish**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1 (P1)**: First deliverable; no dependency on later stories.
- **US2 (P1)**: Requires US1 manifest validation and fixtures.
- **US3 (P1)**: Requires US2 capability-resolution/read-model path.
- **US4 (P2)**: Requires the dedicated API route and response schema from US2/US3.
- **US5 (P3)**: Runs throughout, finalizes after all production surfaces exist.

### Parallel Opportunities

- T009 and T010 can run in parallel after setup.
- US1 test tasks T014-T018 can run in parallel.
- US2 test tasks T025-T031 can run in parallel once US1 types exist.
- US3 test tasks T039-T043 can run in parallel once runtime inventory scaffolding exists.
- US4 test tasks T049-T053 can run in parallel once the API contract stabilizes.
- US5 guard and compatibility tasks T060-T063 can run in parallel with late implementation tasks.
- Polish documentation tasks T068-T070 can run in parallel after implementation evidence exists.

---

## Parallel Example: User Story 2

```bash
Task: "Write failing runtime inventory state precedence tests in src/lib/harness-adapters/__tests__/runtime-inventory.test.ts"
Task: "Write failing route filter/auth tests in src/app/api/agents/runtime-inventory/route.test.ts"
Task: "Write failing API index and OpenAPI parity tests in src/app/api/agents/runtime-inventory/route.test.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Write failing RuntimeInventoryEvidence component state tests in src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx"
Task: "Write failing AgentSquadPanel integration tests in src/components/panels/__tests__/agent-runtime-inventory.test.tsx"
Task: "Add Playwright UAT coverage in tests/e2e/agents-runtime-inventory.spec.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 manifest fixtures, validators, and registry integrity.
3. Stop and validate US1 with `pnpm test -- src/lib/harness-adapters/__tests__/validation.test.ts` and `node scripts/spec-014b/check-harness-adapter-scope.mjs`.

### Incremental Delivery

1. Add US2 runtime inventory read model and API, then validate route and API parity.
2. Add US3 fail-closed unsupported capability/policy/evidence behavior, then validate no side effects.
3. Add US4 read-only Agents UI evidence, then validate component and browser journeys.
4. Add US5 final static guard, compatibility, and repo knowledge index coverage.
5. Run Phase 8 full verification and prepare UAT/PR artifacts.

### Reviewability Stop Rules

- Stop and split if the implementation needs a migration or durable runtime inventory persistence.
- Stop and split if real harness execution, process launch, gateway RPC, scheduler dispatch, assignment controls, retry/release/cancel controls, lifecycle controls, GitHub mutation, governance mutation, successor selection, or auto-merge behavior becomes necessary.
- Stop and split if reviewable LOC, production file count, or total file count crosses the hard reviewability caps recorded in `plan.md`.
