# Tasks: Pilot Evidence Surfaces

**Input**: Design documents from `/specs/009e-pilot-evidence-surfaces/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/task-evidence.openapi.yaml`, `quickstart.md`, `docs/ai/specs/SPEC-009E-design-concept.md`, `specs/009d-pilot-review-lifecycle/contracts/pilot-review-packet.md`

**Tests**: Required. SPEC-009E is TDD-first and includes API/helper/component tests plus a real Playwright task-detail journey with screenshot evidence.

**Organization**: Tasks are grouped by independently testable user story. Route/helper tasks that touch the same file are serialized.

## Phase 1: Setup and RED Contract Fixtures

**Purpose**: Establish strict-scope entries and failing fixtures before implementation.

- [x] T001 Confirm package manager from `pnpm-lock.yaml` and record focused commands from `specs/009e-pilot-evidence-surfaces/quickstart.md`
- [x] T002 Add planned SPEC-009E modules to `tsconfig.spec-strict.json`
- [x] T003 Add planned SPEC-009E modules to `eslint.config.mjs`
- [x] T004 [P] Create failing stored-evidence fixture builders for eligible, local-only, partial-proof, artifact-unavailable, unsafe-text, and deferred cases in `src/lib/__tests__/task-evidence.fixtures.ts`
- [x] T005 [P] Create failing route contract fixture assertions for `task_evidence.v1` response and error envelopes in `src/app/api/tasks/[id]/evidence/__tests__/route.test.ts`
- [x] T006 [P] Create failing task-detail UI render fixtures for loading, loaded, no-stored-evidence, route-error, incomplete, stale/unavailable, unsafe-text, and deferred states in `src/components/panels/__tests__/task-evidence-section.test.tsx`

---

## Phase 2: Foundational Stored Evidence Derivation

**Purpose**: Build the read-only task evidence contract and derivation helper required by every story.

- [x] T007 Define task evidence v1 TypeScript types, allowed state constants, section-state matrices, warning codes, and deferral constants in `src/lib/task-evidence.ts`
- [x] T008 Add RED helper tests proving section states accept only the `data-model.md` v1 state values in `src/lib/__tests__/task-evidence.test.ts`
- [x] T009 Add RED helper tests proving local-only packet state maps to `not_eligible` and malformed or oversized evidence maps to warning reason codes in `src/lib/__tests__/task-evidence.test.ts`
- [x] T010 Add RED helper tests proving stored strings with Markdown links, raw HTML, autolinks, and unsafe URL schemes remain inert display text in `src/lib/__tests__/task-evidence.test.ts`
- [x] T011 Add RED helper tests proving `buildTaskEvidence()` never calls `buildPilotReviewPacket()` or any packet publication path in `src/lib/__tests__/task-evidence.test.ts`
- [x] T012 Implement read-only stored evidence derivation for task, eligibility, identity, packet artifacts, smoke, current stage, warnings, deferrals, and source map in `src/lib/task-evidence.ts`
- [x] T013 Implement artifact-storage disabled and unavailable section degradation with `section_unavailable` warnings in `src/lib/task-evidence.ts`
- [x] T014 Implement retained issue #50 / PR #51 and cleaned-UAT archived proof mapping without claiming cleaned rows as live state in `src/lib/task-evidence.ts`
- [x] T015 Implement typed reference validation and inert text normalization for GitHub, artifact, source-map, checklist, and static UAT references in `src/lib/task-evidence.ts`
- [x] T016 Add direct-insert/read-only guard tests proving helper code performs no database writes, job enqueues, activity/audit writes, artifact mutation, quarantine/supersession/redaction updates, refresh, repair, or backfill in `src/lib/__tests__/task-evidence.test.ts`

**Checkpoint**: Shared evidence derivation is testable without HTTP or UI.

---

## Phase 3: User Story 1 - Review task-local pilot evidence (Priority: P1)

**Goal**: Operators can open task detail and review retained pilot trail evidence from stored task-local sources.

**Independent Test**: Open a retained live task or disposable UAT carrier linked to issue #50 / PR #51 and verify task detail shows eligibility, identity, packet, smoke, stage, warnings, source-map pointers, and deferrals.

### Tests for User Story 1

- [x] T017 [P] [US1] Add RED API contract tests for `GET /api/tasks/[id]/evidence` success envelope, schema version, required sections, and safe metadata-only packet references in `src/app/api/tasks/[id]/evidence/__tests__/route.test.ts`
- [x] T018 [P] [US1] Add RED component tests for Evidence section loaded pilot state, accessible labels, GitHub references, packet references, smoke proof, current stage, warnings, and source-map pointers in `src/components/panels/__tests__/task-evidence-section.test.tsx`
- [x] T019 [P] [US1] Add RED Playwright journey for retained issue #50 / PR #51 task detail evidence loaded state and screenshot capture in `tests/e2e/task-detail-evidence.spec.ts`

### Implementation for User Story 1

- [x] T020 [US1] Implement authenticated read-only `GET /api/tasks/[id]/evidence` route using `buildTaskEvidence()` in `src/app/api/tasks/[id]/evidence/route.ts`
- [x] T021 [US1] Implement route boundary responses `401 unauthenticated`, `400 invalid_workspace_scope`, `403 forbidden_workspace_scope`, and masked `404 task_not_found` in `src/app/api/tasks/[id]/evidence/route.ts`
- [x] T022 [US1] Prove the route does not create activities, mutate task/artifact/packet/smoke/GitHub sync state, enqueue jobs, call GitHub, call packet generation, or parse `docs/qa/pilot-smoke-checklist.md` at runtime in `src/app/api/tasks/[id]/evidence/__tests__/route.test.ts`
- [x] T023 [US1] Create compact read-only Evidence section component with loading, loaded, empty, route-error, warning, source-map, and artifact-reference rendering in `src/components/panels/task-evidence-section.tsx`
- [x] T024 [US1] Mount the Evidence section inside the existing Details tab near task/GitHub metadata in `src/components/panels/task-board-panel.tsx`
- [x] T025 [US1] Wire Details-tab fetch state as ephemeral in-memory state only, with no evidence persistence in localStorage, sessionStorage, IndexedDB, Cache Storage, cookies, URL parameters, Zustand persistence, or app cache in `src/components/panels/task-board-panel.tsx`
- [x] T026 [US1] Ensure active links are constructed only from allowlisted typed GitHub, artifact, source-map, checklist, or static UAT references in `src/components/panels/task-evidence-section.tsx`
- [x] T027 [US1] Run focused API/helper/component tests with `pnpm test -- task-evidence` and `pnpm test -- route.test.ts task-evidence-section`

**Checkpoint**: US1 works as an MVP task-local evidence read route plus Details-tab UI.

---

## Phase 4: User Story 2 - Identify incomplete or ineligible tasks (Priority: P2)

**Goal**: Reviewers can distinguish local-only, no-evidence, and partial-proof tasks from valid pilot evidence.

**Independent Test**: Open representative local-only and partial-proof tasks and verify `not_eligible` or `incomplete` states list specific missing proof reasons without implying pilot proof exists.

### Tests for User Story 2

- [x] T028 [P] [US2] Add RED helper tests for missing issue, missing PR, packet-without-smoke, smoke-without-packet, stale artifact, unavailable artifact store, redacted, quarantined, superseded, oversized, malformed, unsafe, secret-bearing, and conflicting-source states in `src/lib/__tests__/task-evidence.test.ts`
- [x] T029 [P] [US2] Add RED API tests proving readable non-pilot, local-only, partial-proof, and artifact-unavailable tasks return `200` domain states instead of empty success bodies or HTTP errors in `src/app/api/tasks/[id]/evidence/__tests__/route.test.ts`
- [x] T030 [P] [US2] Add RED component tests for compact not-eligible, no-stored-evidence, incomplete, missing-proof, stale, unavailable, redacted, quarantined, superseded, and unsupported unknown-state rendering in `src/components/panels/__tests__/task-evidence-section.test.tsx`
- [x] T031 [P] [US2] Extend Playwright journey for local-only and partial-proof task detail states with screenshot capture in `tests/e2e/task-detail-evidence.spec.ts`

### Implementation for User Story 2

- [x] T032 [US2] Complete helper derivation for local-only, no-stored-evidence, incomplete, stale, unavailable, redacted, quarantined, superseded, oversized, malformed, unsafe, secret-bearing, and conflicting-source cases in `src/lib/task-evidence.ts`
- [x] T033 [US2] Complete route serialization for local-only, no-stored-evidence, incomplete, stale, unavailable, redacted, quarantined, superseded, and warning states in `src/app/api/tasks/[id]/evidence/route.ts`
- [x] T034 [US2] Complete Evidence UI rendering for compact negative states, missing proof categories, unavailable warnings, unsupported unknown API state, and color-independent labels in `src/components/panels/task-evidence-section.tsx`
- [x] T035 [US2] Add overflow-safe wrapping or full-text access for long packet names, GitHub references, source-map pointers, warning reason codes, and missing-proof labels in `src/components/panels/task-evidence-section.tsx`
- [x] T036 [US2] Run focused incomplete/ineligible test set with `pnpm test -- task-evidence` and `pnpm test -- task-evidence-section`

**Checkpoint**: US2 negative states are explicit and independently reviewable.

---

## Phase 5: User Story 3 - Preserve clear future-state boundaries (Priority: P3)

**Goal**: Future implementers can see deferred run, sync, claim, retry, sandbox, adapter, and harness categories without mistaking them for current capabilities.

**Independent Test**: Inspect a pilot task evidence surface and verify all seven future-state categories are labeled `deferred` with the owning future spec family and no controls.

### Tests for User Story 3

- [x] T037 [P] [US3] Add RED helper tests for seven canonical deferral categories and owner specs in `src/lib/__tests__/task-evidence.test.ts`
- [x] T038 [P] [US3] Add RED component tests for deferred labels, accessible descriptions, no action controls, and no client-side state reinterpretation in `src/components/panels/__tests__/task-evidence-section.test.tsx`
- [x] T039 [P] [US3] Extend Playwright journey to verify all seven deferred categories and absence of refresh, packet generation, sync, smoke execution, retry, claim, sandbox, adapter, and harness controls in `tests/e2e/task-detail-evidence.spec.ts`

### Implementation for User Story 3

- [x] T040 [US3] Implement deferral output for run state, sync automation, claim authority, retry/debug controls, sandbox lifecycle, adapter registry, and real harness execution in `src/lib/task-evidence.ts`
- [x] T041 [US3] Render deferrals as display-only rows with owner specs and no controls in `src/components/panels/task-evidence-section.tsx`
- [x] T042 [US3] Run focused deferral coverage with `pnpm test -- task-evidence` and `pnpm test -- task-evidence-section`

**Checkpoint**: US3 deferred boundaries are visible, stable, and non-mutating.

---

## Phase 6: Security, Accessibility, and Browser Verification

**Purpose**: Validate read-only guardrails, accessibility, browser rendering, and full app gates.

- [x] T043 [P] Add route security tests for auth/scope masking, malformed workspace scope, forbidden workspace scope, and no task-existence leakage in `src/app/api/tasks/[id]/evidence/__tests__/route.test.ts`
- [x] T044 [P] Add accessibility assertions for labelled section, heading, polite async loading/error announcements, keyboard-reachable links, and color-independent state text in `src/components/panels/__tests__/task-evidence-section.test.tsx`
- [x] T045 [P] Add unsafe stored text and unsafe typed URL rendering coverage to the Playwright journey in `tests/e2e/task-detail-evidence.spec.ts`
- [x] T046 Run `pnpm typecheck`
- [x] T047 Run `pnpm lint`
- [x] T048 Run `pnpm test`
- [x] T049 Run `pnpm build`
- [x] T050 Run `pnpm test:e2e -- tests/e2e/task-detail-evidence.spec.ts`
- [x] T051 When Docker is available, run the task-detail Evidence UI journey against the repository Docker build with a disposable data directory and record command, data directory, and screenshot artifact locations in `docs/qa/pilot-smoke-checklist.md`
- [x] T052 Review failing e2e output and screenshots for known UI defects before any PR update in `docs/qa/pilot-smoke-checklist.md`

---

## Phase 7: UAT Checklist, PR Evidence, Roadmap, and Workflow Updates

**Purpose**: Record operator evidence and keep tracking artifacts aligned.

- [x] T053 Update `docs/qa/pilot-smoke-checklist.md` with a SPEC-009E UAT section covering retained issue #50 / PR #51, packet/source-map proof, smoke/checklist proof, current or archived stage, warnings, source-map pointers, all seven deferred categories, screenshots, owner, timestamp, and commands
- [x] T054 If disposable UAT carrier rows are created, record backup/export location, before/after counts, owner, timestamp, cleanup scope, retained GitHub issue/PR evidence, and checklist evidence in `docs/qa/pilot-smoke-checklist.md`
- [x] T055 [P] Update `docs/ai/specs/SPEC-009E-workflow.md` with Tasks phase completion notes, verification commands, UAT evidence pointers, and no-migration/no-write/no-global-dashboard scope confirmation
- [x] T056 [P] Update `.specify/memory/changelog.md` with SPEC-009E generated-artifact provenance, current-target archive exclusion, and recovery notes for `specs/009e-pilot-evidence-surfaces/tasks.md`
- [x] T057 [P] Update `docs/ai/rc-factory-technical-roadmap.md` with SPEC-009E implementation and UAT status
- [x] T058 Assemble PR review packet source notes with change summary, non-goals, review order, scope budget, FR/SC traceability, verification commands, Playwright screenshot artifact locations, known gaps, and rollback/no-database-rollback notes in `docs/qa/pilot-smoke-checklist.md`
- [x] T059 Record verification that no migration, dependency addition, write-action, GitHub sync trigger, packet-generation action, global dashboard, runner, claim, sandbox, adapter, or harness task leaked into the implementation diff in `docs/qa/pilot-smoke-checklist.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies; creates strict-scope entries and RED fixtures.
- **Phase 2**: Depends on Phase 1; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 and delivers the MVP route/helper/UI path.
- **Phase 4 (US2)**: Depends on Phase 2; can start after shared helper contracts exist, but route/UI edits should coordinate with US1 file ownership.
- **Phase 5 (US3)**: Depends on Phase 2; can start after deferral constants exist, but UI edits should coordinate with US1/US2 file ownership.
- **Phase 6**: Depends on implemented stories targeted for PR.
- **Phase 7**: Depends on verification and UAT evidence from Phase 6.

### User Story Dependencies

- **US1 (P1)**: MVP; no dependency on US2 or US3 after Phase 2.
- **US2 (P2)**: Uses the same helper, route, and UI files as US1; tests can be prepared in parallel, implementation should serialize same-file edits.
- **US3 (P3)**: Uses the same helper and UI files; tests can be prepared in parallel, implementation should serialize same-file edits.

### Parallel Opportunities

- T004, T005, and T006 can run in parallel.
- T017, T018, and T019 can run in parallel.
- T028, T029, T030, and T031 can run in parallel.
- T037, T038, and T039 can run in parallel.
- T043, T044, and T045 can run in parallel.
- T055, T056, and T057 can run in parallel after verification evidence exists.

## Parallel Examples

### User Story 1

```text
Task: "T017 [P] [US1] Add RED API contract tests for GET /api/tasks/[id]/evidence success envelope, schema version, required sections, and safe metadata-only packet references in src/app/api/tasks/[id]/evidence/__tests__/route.test.ts"
Task: "T018 [P] [US1] Add RED component tests for Evidence section loaded pilot state, accessible labels, GitHub references, packet references, smoke proof, current stage, warnings, and source-map pointers in src/components/panels/__tests__/task-evidence-section.test.tsx"
Task: "T019 [P] [US1] Add RED Playwright journey for retained issue #50 / PR #51 task detail evidence loaded state and screenshot capture in tests/e2e/task-detail-evidence.spec.ts"
```

### User Story 2

```text
Task: "T028 [P] [US2] Add RED helper tests for missing issue, missing PR, packet-without-smoke, smoke-without-packet, stale artifact, unavailable artifact store, redacted, quarantined, superseded, oversized, malformed, unsafe, secret-bearing, and conflicting-source states in src/lib/__tests__/task-evidence.test.ts"
Task: "T029 [P] [US2] Add RED API tests proving readable non-pilot, local-only, partial-proof, and artifact-unavailable tasks return 200 domain states instead of empty success bodies or HTTP errors in src/app/api/tasks/[id]/evidence/__tests__/route.test.ts"
Task: "T030 [P] [US2] Add RED component tests for compact not-eligible, no-stored-evidence, incomplete, missing-proof, stale, unavailable, redacted, quarantined, superseded, and unsupported unknown-state rendering in src/components/panels/__tests__/task-evidence-section.test.tsx"
Task: "T031 [P] [US2] Extend Playwright journey for local-only and partial-proof task detail states with screenshot capture in tests/e2e/task-detail-evidence.spec.ts"
```

### User Story 3

```text
Task: "T037 [P] [US3] Add RED helper tests for seven canonical deferral categories and owner specs in src/lib/__tests__/task-evidence.test.ts"
Task: "T038 [P] [US3] Add RED component tests for deferred labels, accessible descriptions, no action controls, and no client-side state reinterpretation in src/components/panels/__tests__/task-evidence-section.test.tsx"
Task: "T039 [P] [US3] Extend Playwright journey to verify all seven deferred categories and absence of refresh, packet generation, sync, smoke execution, retry, claim, sandbox, adapter, and harness controls in tests/e2e/task-detail-evidence.spec.ts"
```

## Implementation Strategy

### MVP First

Complete Phases 1-3 to deliver the generic read-only route, helper, and compact Details-tab Evidence section for retained pilot evidence.

### Incremental Delivery

1. Land the helper state model and RED fixtures.
2. Implement US1 route/UI success path.
3. Add US2 negative-state coverage and rendering.
4. Add US3 deferral rendering.
5. Run Phase 6 verification and record Phase 7 UAT/PR evidence.

### Review Order

1. `src/lib/task-evidence.ts` and `src/lib/__tests__/task-evidence.test.ts`
2. `src/app/api/tasks/[id]/evidence/route.ts` and route tests
3. `src/components/panels/task-evidence-section.tsx` and task board integration
4. `tests/e2e/task-detail-evidence.spec.ts`
5. `docs/qa/pilot-smoke-checklist.md` and tracking artifacts
