# Tasks: Production Triage Outcome Routing

**Input**: Design documents from `specs/009f-production-triage-routing/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/triage-routing-contract.md`, `quickstart.md`, completed checklists

**Tests**: Required. SPEC-009F is TDD-first by constitution and workflow gate G5. Every behavior task below starts with RED tests before implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after foundational payload, fixture, and guard seams exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because ownership is disjoint and no incomplete task dependency exists
- **[Story]**: Maps to the user stories in `spec.md`
- Every task includes exact file paths

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare SPEC-009F-owned files and strict-scope entries without adding dependencies, migrations, routes, or successors.

- [x] T001 Create SPEC-009F guard script placeholder in `scripts/spec-009f/check-scope-guards.mjs`
- [x] T002 [P] Add SPEC-009F production/test file entries to `tsconfig.spec-strict.json`
- [x] T003 [P] Add SPEC-009F production/test file entries to `eslint.config.mjs`
- [x] T004 [P] Create SPEC-009F UAT evidence section skeleton in `docs/qa/pilot-smoke-checklist.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared RED tests and shared helper contracts that block all routed stories.

**CRITICAL**: No user story implementation begins until this phase is complete.

- [x] T005 [P] Add RED common envelope, schema version, supported-disposition, proposed-label normalization, and safe evidence reference tests in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [x] T006 Add RED text normalization/security tests for limits, C0/C1 controls, newline caps, stripped query/fragments, unsafe schemes, non-allowlisted destinations, and sanitized failure reasons in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [x] T007 [P] Add RED fixture builders for six SPEC-009F non-remediation outcomes and disposable cleanup metadata in `src/lib/__tests__/task-evidence.fixtures.ts`
- [x] T008 [P] Add RED routing gate tests for `PILOT_MISSION_CONTROL_E2E`, `mission-control_issue_triage`, `racecraft-lab/mission-control`, unsupported dispositions, and `ACTIONABLE_REMEDIATION` preservation in `src/lib/__tests__/triage-routing.test.ts`
- [x] T009 [P] Add RED static guard expectations for no GitHub mutation, no label application, no remediation/non-remediation successors, no claim/runner/sandbox/adapter/auto-merge drift, no migrations, no new runtime dependency, and no committed `test-results/` screenshots in `scripts/spec-009f/check-scope-guards.mjs`
- [x] T010 Implement shared SPEC-009F constants, disposition/lane/artifact type maps, normalized string utilities, proposed label normalization, safe evidence reference validation, validation result types, and idempotency key builder in `src/lib/triage-routing-payloads.ts`
- [x] T011 Implement routing helper scaffolding for source-task gates, supported-disposition dispatch, `ACTIONABLE_REMEDIATION` skip result, failure result shapes, and no-successor/no-external-mutation seams in `src/lib/triage-routing.ts`

**Checkpoint**: Shared payload contracts, fixture seeds, guard script, and source gates are ready for story implementation.

---

## Phase 3: User Story 1 - Route Spec-Ready Triage Exits (Priority: P1) MVP

**Goal**: `NEEDS_SPEC` routes to a SpecKit-ready handoff artifact on the completed source task with no setup, successor, or external mutation.

**Independent Test**: Route a deterministic `NEEDS_SPEC` triage fixture and verify the source task is `done`, a typed handoff artifact exists, `triage_routing_recorded` exists, no successor exists, proposed labels are metadata only, and `deferred_setup_action.automatic_setup` is `false`.

### Tests for User Story 1

- [x] T012 [P] [US1] Add RED `NEEDS_SPEC` payload validator tests for `triage_speckit_handoff`, `proposed_scope`, `non_goals`, `deferred_setup_action.automatic_setup: false`, proposed labels, and deferred setup side effect in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [x] T013 [P] [US1] Add RED `NEEDS_SPEC` routing tests for terminal `done` source task, handoff artifact publish, `triage_routing_recorded`, no Issue Remediation successor, no non-remediation successor, no GitHub mutation, and no SpecKit setup/worktree creation in `src/lib/__tests__/triage-routing.test.ts`
- [x] T014 [P] [US1] Add RED task Evidence tests for `NEEDS_SPEC` `triage_routing` state, `speckit_handoff` lane detail, artifact/activity reference, proposed labels with `applied: false`, deferred setup side effect, and safe link rendering data in `src/lib/__tests__/task-evidence.test.ts`

### Implementation for User Story 1

- [x] T015 [US1] Implement `NEEDS_SPEC` handoff payload builder and validator in `src/lib/triage-routing-payloads.ts`
- [x] T016 [US1] Implement `NEEDS_SPEC` routing artifact/activity recording and source-task terminal evidence in `src/lib/triage-routing.ts`
- [x] T017 [US1] Extend six-outcome fixture helpers with deterministic `NEEDS_SPEC` rows, artifact metadata, activity metadata, and cleanup ids in `src/lib/__tests__/task-evidence.fixtures.ts`
- [x] T018 [US1] Extend server-side task Evidence derivation for `NEEDS_SPEC` `triage_routing` output in `src/lib/task-evidence.ts`

**Checkpoint**: User Story 1 can be verified independently with:

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts
```

---

## Phase 4: User Story 2 - Route Human and Specialist Recommendations (Priority: P1)

**Goal**: `NEEDS_HUMAN` and `NEEDS_SPECIALIST` expose clarification and specialist recommendation lanes with explicit missing/unassigned states when safe metadata is unavailable.

**Independent Test**: Route one `NEEDS_HUMAN` fixture and two `NEEDS_SPECIALIST` fixtures, one deterministic recommendation and one unassigned fallback, then verify typed artifacts, terminal evidence, proposed labels, missing/unassigned details, and no assignment/dispatch/successor.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add RED `NEEDS_HUMAN` payload validator tests for `triage_clarification_request`, `blocking_questions`, `target_audience`, `evidence_needed`, `no_external_message_sent: true`, and sanitized inert strings in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [ ] T020 [US2] Add RED `NEEDS_SPECIALIST` payload validator tests for `triage_specialist_recommendation`, recommended state, unassigned state, deterministic confidence, matching basis, missing metadata, owner action, and no free-form issue/body inference fields in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [ ] T021 [P] [US2] Add RED routing tests for `NEEDS_HUMAN` clarification artifact, no external message, no successor, and metadata-only labels in `src/lib/__tests__/triage-routing.test.ts`
- [ ] T022 [US2] Add RED routing tests for `NEEDS_SPECIALIST` deterministic same-workspace owner recommendation, unassigned fallback for missing/ambiguous metadata, no assignment, no dispatch, and no `mission-control_specialist_route` successor in `src/lib/__tests__/triage-routing.test.ts`
- [ ] T023 [P] [US2] Add RED task Evidence tests for clarification and specialist `triage_routing` lane details, `Specialist unassigned`, missing metadata, owner action, deferred side effects, and no raw unsafe content in `src/lib/__tests__/task-evidence.test.ts`

### Implementation for User Story 2

- [ ] T024 [US2] Implement `NEEDS_HUMAN` clarification payload builder and validator in `src/lib/triage-routing-payloads.ts`
- [ ] T025 [US2] Implement `NEEDS_SPECIALIST` recommendation and unassigned payload builders and validators in `src/lib/triage-routing-payloads.ts`
- [ ] T026 [US2] Implement deterministic specialist metadata resolution from source task/workspace, `projects.area_slug`, normalized `area:*` routing evidence, `project_agent_assignments`, and same-workspace `agents` in `src/lib/triage-routing.ts`
- [ ] T027 [US2] Implement `NEEDS_HUMAN` and `NEEDS_SPECIALIST` routing artifact/activity recording with no message, assignment, dispatch, or successor writes in `src/lib/triage-routing.ts`
- [ ] T028 [US2] Extend fixture helpers with deterministic `NEEDS_HUMAN`, recommended `NEEDS_SPECIALIST`, and unassigned `NEEDS_SPECIALIST` rows and cleanup ids in `src/lib/__tests__/task-evidence.fixtures.ts`
- [ ] T029 [US2] Extend server-side task Evidence derivation for clarification and specialist `triage_routing` output in `src/lib/task-evidence.ts`

**Checkpoint**: User Story 2 can be verified independently with:

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts
```

---

## Phase 5: User Story 3 - Route Closure Recommendations (Priority: P2)

**Goal**: `DUPLICATE`, `OBSOLETE`, and `INVALID` use one closure-recommendation model with required outcome-specific fields and no live closure behavior.

**Independent Test**: Route separate closure fixtures for `DUPLICATE`, `OBSOLETE`, and `INVALID`, then verify shared closure payload shape, outcome-specific details, typed artifacts, terminal evidence, no issue close/comment/label/assignment, and no successor.

### Tests for User Story 3

- [ ] T030 [P] [US3] Add RED closure payload validator tests for shared `triage_closure_recommendation`, `DUPLICATE` suspected duplicate target and comparison rationale, `OBSOLETE` superseding condition and non-actionability rationale, and `INVALID` invalidity reason, validation evidence, and missing reproducibility context in `src/lib/__tests__/triage-routing-payloads.test.ts`
- [ ] T031 [P] [US3] Add RED closure routing tests for `DUPLICATE`, `OBSOLETE`, and `INVALID` artifacts, `triage_routing_recorded`, terminal source task, metadata-only proposed labels, no GitHub close/comment/label/assignment, and no successor in `src/lib/__tests__/triage-routing.test.ts`
- [ ] T032 [P] [US3] Add RED task Evidence tests for closure `triage_routing` lane detail variants, outcome-specific fields, recommended next action, deferred side effects, and safe/inert evidence references in `src/lib/__tests__/task-evidence.test.ts`

### Implementation for User Story 3

- [ ] T033 [US3] Implement shared closure recommendation payload builder and validator for `DUPLICATE`, `OBSOLETE`, and `INVALID` in `src/lib/triage-routing-payloads.ts`
- [ ] T034 [US3] Implement closure recommendation routing artifact/activity recording with no external issue mutation and no successor writes in `src/lib/triage-routing.ts`
- [ ] T035 [US3] Extend fixture helpers with deterministic `DUPLICATE`, `OBSOLETE`, and `INVALID` rows, route artifacts, activities, and cleanup ids in `src/lib/__tests__/task-evidence.fixtures.ts`
- [ ] T036 [US3] Extend server-side task Evidence derivation for closure recommendation `triage_routing` output in `src/lib/task-evidence.ts`

**Checkpoint**: User Story 3 can be verified independently with:

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts
```

---

## Phase 6: User Story 4 - Preserve Idempotent Evidence Display (Priority: P3)

**Goal**: Repeat routing and task-local Evidence display remain stable, current-only, traceable, accessible, and read-only.

**Independent Test**: Route the same supported outcome repeatedly, including unchanged payload, changed same-outcome payload, changed disposition, validation failure, artifact publish failure, and missing-activity backfill; then verify exactly one current active route summary plus trace-only superseded artifacts and compact UI display.

### Tests for User Story 4

- [ ] T037 [P] [US4] Add RED routing tests for unchanged same-outcome retry, changed same-outcome supersession, changed-disposition conflict, missing-activity backfill, validation failure before artifact publish, and artifact-publish failure isolation in `src/lib/__tests__/triage-routing.test.ts`
- [ ] T038 [P] [US4] Add RED task Evidence tests for `available`, `missing`, `incomplete`, `unavailable`, `conflict`, and trace-only `superseded` `triage_routing` states, newest current artifact selection, warnings, missing fields, and `source_map` entries in `src/lib/__tests__/task-evidence.test.ts`
- [ ] T039 [P] [US4] Add RED component tests for compact `Triage routing` block labels, empty/recorded/incomplete/unavailable/superseded/unassigned states, proposed labels with `applied: false`, deferred side effects, no buttons/forms/menus, inert text, and safe-link-only keyboard focus in `src/components/panels/__tests__/task-evidence-section.test.tsx`
- [ ] T040 [P] [US4] Add RED OpenAPI contract assertion in `src/lib/__tests__/api-contract-parity.test.ts` that checked-in `openapi.json` includes `triage_routing` on the existing `GET /api/tasks/{id}/evidence` response with no new triage-routing path or operation

### Implementation for User Story 4

- [ ] T041 [US4] Implement idempotency, normalized payload comparison, supersession, conflict activity, validation-failure activity, artifact-publish failure activity, and missing-activity backfill behavior in `src/lib/triage-routing.ts`
- [ ] T042 [US4] Implement `buildTriageRoutingEvidence()` current artifact selection, failed/conflict activity mapping, superseded trace references, source-map entries, missing/warnings output, and validated payload projection in `src/lib/task-evidence.ts`
- [ ] T043 [US4] Implement compact read-only `Triage routing` UI block with preserved `Task evidence` region semantics, specified labels, accessible text, no action controls, and active links only for allowlisted typed references in `src/components/panels/task-evidence-section.tsx`
- [ ] T044 [US4] Update checked-in task Evidence OpenAPI response schema with `triage_routing` fields/enums and preserve the existing operation only in `openapi.json`

**Checkpoint**: User Story 4 can be verified independently with:

```bash
pnpm test src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx
pnpm api:parity
```

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete UAT fixtures, review evidence, guardrails, and full verification without widening scope.

- [ ] T045 [P] Add focused six-outcome Playwright journey for `/tasks`, `Task evidence` region inspection, `Triage routing` block assertions, no mutation/action controls, safe-link keyboard focus, fixture export, screenshot attachments, and cleanup in `tests/e2e/spec-009f-triage-routing.spec.ts`
- [ ] T046 [P] Complete SPEC-009F diff/static guard implementation for forbidden GitHub mutation, label application, remediation/non-remediation successors, claim/runner/sandbox/adapter/auto-merge drift, migrations, runtime dependency changes, API route additions, and committed screenshot binaries in `scripts/spec-009f/check-scope-guards.mjs`
- [ ] T047 [P] Record SPEC-009F UAT evidence placeholders for branch/commit, command, fixture export path, six-outcome matrix, screenshot paths, cleanup counts, and explicit no-live-side-effect statement in `docs/qa/pilot-smoke-checklist.md`
- [ ] T048 Run focused unit/component verification command and fix SPEC-009F regressions in `src/lib/__tests__/triage-routing-payloads.test.ts`, `src/lib/__tests__/triage-routing.test.ts`, `src/lib/__tests__/task-evidence.test.ts`, and `src/components/panels/__tests__/task-evidence-section.test.tsx`: `pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx`
- [ ] T049 Run API parity and guard verification and fix SPEC-009F drift in `openapi.json` and `scripts/spec-009f/check-scope-guards.mjs`: `pnpm api:parity && node scripts/spec-009f/check-scope-guards.mjs`
- [ ] T050 Run focused e2e UAT verification and update non-committed review artifacts under `test-results/spec-009f-triage-routing/`: `pnpm test:e2e tests/e2e/spec-009f-triage-routing.spec.ts`
- [ ] T051 Run build verification and fix SPEC-009F build issues in `src/lib/triage-routing-payloads.ts`, `src/lib/triage-routing.ts`, `src/lib/task-evidence.ts`, `src/components/panels/task-evidence-section.tsx`, `openapi.json`, and `scripts/spec-009f/check-scope-guards.mjs`: `pnpm build`
- [ ] T052 Run typecheck verification and fix SPEC-009F type issues in `src/lib/triage-routing-payloads.ts`, `src/lib/triage-routing.ts`, `src/lib/task-evidence.ts`, `src/components/panels/task-evidence-section.tsx`, `tsconfig.spec-strict.json`, and `eslint.config.mjs`: `pnpm typecheck`
- [ ] T053 Run lint verification and fix SPEC-009F lint issues in `src/lib/triage-routing-payloads.ts`, `src/lib/triage-routing.ts`, `src/lib/task-evidence.ts`, `src/components/panels/task-evidence-section.tsx`, `scripts/spec-009f/check-scope-guards.mjs`, and `eslint.config.mjs`: `pnpm lint`
- [ ] T054 Run full unit verification outside the Codex sandbox if sandbox runtime resources fail, and fix SPEC-009F regressions in `src/lib/__tests__/triage-routing-payloads.test.ts`, `src/lib/__tests__/triage-routing.test.ts`, `src/lib/__tests__/task-evidence.test.ts`, and `src/components/panels/__tests__/task-evidence-section.test.tsx`: `pnpm test`
- [ ] T055 Run full e2e verification and fix SPEC-009F regressions in `tests/e2e/spec-009f-triage-routing.spec.ts` and `docs/qa/pilot-smoke-checklist.md`: `pnpm test:e2e`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational; can run after or alongside US1 once shared helper ownership is coordinated.
- **User Story 3 (Phase 5)**: Depends on Foundational; can run after or alongside US1/US2 once shared helper ownership is coordinated.
- **User Story 4 (Phase 6)**: Depends on US1-US3 route artifact shapes and fixture helpers.
- **Polish (Phase 7)**: Depends on selected user stories; full UAT depends on all stories.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational for `NEEDS_SPEC`.
- **US2 (P1)**: Independent after Foundational for `NEEDS_HUMAN` and `NEEDS_SPECIALIST`.
- **US3 (P2)**: Independent after Foundational for closure recommendations.
- **US4 (P3)**: Depends on route shapes from US1-US3 for full idempotent Evidence display.

### Within Each User Story

- RED tests first; they must fail before implementation.
- Payload validator tests before payload builders.
- Routing tests before routing helper behavior.
- Task Evidence tests before `src/lib/task-evidence.ts` changes.
- Component tests before `src/components/panels/task-evidence-section.tsx` changes.
- OpenAPI assertion before `openapi.json` update.

---

## Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001 because they touch disjoint files.
- T005, T007, T008, and T009 can run in parallel after Setup because they establish disjoint RED coverage or guard ownership; T006 follows T005 in the same payload test file.
- In US1, T012, T013, and T014 can run in parallel before T015-T018.
- In US2, T019, T021, and T023 can run in parallel before T024-T029; T020 follows T019 in the same payload test file, and T022 follows T021 in the same routing test file.
- In US3, T030 through T032 can run in parallel before T033-T036.
- In US4, T037 through T040 can run in parallel before T041-T044.
- T045, T046, and T047 can run in parallel after US1-US4 implementation because they own disjoint e2e, guard, and docs files.

---

## Parallel Example: User Story 2

```bash
Task: "Add RED NEEDS_HUMAN payload validator tests in src/lib/__tests__/triage-routing-payloads.test.ts"
Task: "Add RED NEEDS_HUMAN clarification routing tests in src/lib/__tests__/triage-routing.test.ts"
Task: "Add RED task Evidence tests for clarification and specialist triage_routing lane details in src/lib/__tests__/task-evidence.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for `NEEDS_SPEC`.
3. Validate with the US1 focused command.
4. Stop for review if reviewability budget is exceeded before proceeding.

### Incremental Delivery

1. Add US1 `NEEDS_SPEC` handoff routing.
2. Add US2 human/specialist recommendations.
3. Add US3 closure recommendations.
4. Add US4 idempotent Evidence display and OpenAPI contract.
5. Complete UAT, guardrails, and full verification.

### Reviewability Budget

- Planned production files: 5 (`src/lib/triage-routing-payloads.ts`, `src/lib/triage-routing.ts`, `src/lib/task-evidence.ts`, `src/components/panels/task-evidence-section.tsx`, `scripts/spec-009f/check-scope-guards.mjs`).
- Planned total touched files: 14 plus generated `tasks.md`.
- Split immediately if implementation requires a migration, new runtime dependency, new route surface, successor templates, live GitHub mutation, operator action controls, claim/runner/sandbox/adapter/auto-merge work, or more than 6 production files.

### Final Verification Commands

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx
pnpm api:parity
node scripts/spec-009f/check-scope-guards.mjs
pnpm test:e2e tests/e2e/spec-009f-triage-routing.spec.ts
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

`pnpm test` may need to run outside the Codex sandbox per project guidance.
