# Tasks: GitHub Pilot Issue Ingest and Eligibility

**Input**: Design documents from `/specs/009c1-pilot-issue-ingest/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pilot-ingest-contract.md, quickstart.md, docs/ai/specs/SPEC-009C1-design-concept.md
**Tests**: Required. Follow red-green-refactor: each production behavior change starts with a failing Vitest test.

**Scope Guardrails**: Reuse existing GitHub sync, label map, task creation, API, and script conventions. Do not add automatic GitHub sync polling/cron, production eligibility UI/API, Issue Triage/Remediation execution, scheduler claim authority, dispatch/runner/sandbox/harness behavior, workflow-contract tracker-label semantic changes, or schema migrations.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks
- **[Story]**: User-story label for tasks inside story phases only
- Every task includes an exact file path

---

## Phase 1: Setup And Red Test Baseline

**Purpose**: Establish the required failing test coverage before any production behavior changes.

- [x] T001 Add failing Vitest coverage for eligible live issue fixture ingest in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T002 Add failing Vitest coverage for duplicate synced task prevention in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T003 Add failing Vitest coverage for local-only task rejection from pilot evidence in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T004 [P] Add failing Vitest coverage for synthetic fallback find/create idempotency and no-live-mutation defaults in `src/lib/__tests__/pilot-issue-smoke.test.ts`
- [x] T005 Add failing Vitest coverage for no-dispatch/no-successor/no-run side-effect absence in `src/lib/__tests__/pilot-issue-eligibility.test.ts`

---

## Phase 2: Foundational

**Purpose**: Shared scaffolding that must exist before story implementation.

**Critical**: No story implementation begins until the red baseline tests exist.

- [x] T006 Add shared pilot issue fixtures and project/area routing builders in `src/lib/__tests__/fixtures/pilot-issue-fixtures.ts`
- [x] T007 Create typed pilot candidate, decision, identity proof, and side-effect snapshot skeletons in `src/lib/pilot-issue-eligibility.ts`
- [x] T008 Register SPEC-009C1-owned TypeScript files in `tsconfig.spec-strict.json`
- [x] T009 Register SPEC-009C1-owned TypeScript files in `eslint.config.mjs`

**Checkpoint**: The test suite has failing red coverage and the new strict-owned files are visible to TypeScript and ESLint.

---

## Phase 3: User Story 1 - Ingest One Eligible Pilot Issue (Priority: P1, MVP)

**Goal**: One eligible `racecraft-lab/mission-control` GitHub issue enters Mission Control as exactly one GitHub-linked pilot root task through existing GitHub ingest/sync.

**Independent Test**: Fixture-driven sync admits a qualifying issue and proves one root `tasks` row with `workspace_id`, `github_repo`, `github_issue_number`, `github_synced_at`, and `parent_task_id IS NULL`.

### Tests for User Story 1

- [x] T010 [US1] Expand eligible ingest assertions for repository identity, open issue-not-PR identity, `mc:inbox`, `priority:*`, exactly one routable `area:*`, no linked PR, and no terminal state in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T011 [US1] Add failing identity proof assertions for exactly one GitHub-linked root task before and after existing sync in `src/lib/__tests__/pilot-issue-eligibility.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement candidate payload validation and normalized label extraction in `src/lib/pilot-issue-eligibility.ts`
- [x] T013 [US1] Implement eligible admission using existing area routing and label semantics from `src/lib/github-label-map.ts` in `src/lib/pilot-issue-eligibility.ts`
- [x] T014 [US1] Verify pilot ingest reuses the existing `pullFromGitHub`/`createTask({ source: 'github_sync' })` seam without changing production sync semantics, adding polling, or adding cron behavior in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T015 [US1] Implement the exact one-root-task identity proof helper and current-schema side-effect snapshot helper in `src/lib/pilot-issue-eligibility.ts`

**Checkpoint**: User Story 1 is independently testable with fixture sync and no local-only creation path.

---

## Phase 4: User Story 2 - Reject Unsafe or Duplicate Pilot Candidates (Priority: P1)

**Goal**: Duplicate, ambiguous, unsafe, malformed, and wrong-repository candidates are rejected with inspectable reasons or distinct error states.

**Independent Test**: Fixture matrix rejects missing labels, ambiguous routing, linked PRs, terminal states, duplicate synced tasks, wrong repository, and malformed payloads without creating pilot tasks.

### Tests for User Story 2

- [x] T016 [US2] Add failing rejection matrix coverage for missing `mc:inbox`, missing `priority:*`, zero/multiple routable `area:*`, linked PR, terminal state, and wrong repository in `src/lib/__tests__/pilot-issue-eligibility.test.ts`
- [x] T017 [US2] Add failing coverage that malformed or partial issue payloads produce `malformed_issue_payload` errors rather than ineligible, duplicate, or successful no-op results in `src/lib/__tests__/pilot-issue-eligibility.test.ts`

### Implementation for User Story 2

- [x] T018 [US2] Implement stable rejection reason codes for unsafe candidates in `src/lib/pilot-issue-eligibility.ts`
- [x] T019 [US2] Implement workspace-scoped duplicate synced task detection by GitHub repository and issue number in `src/lib/pilot-issue-eligibility.ts`
- [x] T020 [US2] Implement distinct malformed payload and operator sync failure result handling in `src/lib/pilot-issue-eligibility.ts`

**Checkpoint**: User Story 2 can reject each unsafe case independently and preserves one-task idempotency on repeated sync.

---

## Phase 5: User Story 3 - Keep Local-Only Tasks Out of the Pilot Lane (Priority: P2)

**Goal**: Local-only Mission Control tasks remain supported for non-pilot work but cannot count as pilot root task evidence.

**Independent Test**: Creating local-only tasks through existing paths never satisfies pilot evidence because GitHub repository, issue number, and synced timestamp linkage are absent.

### Tests for User Story 3

- [x] T021 [US3] Expand local-only rejection coverage for title/label lookalikes without GitHub linkage in `src/lib/__tests__/pilot-issue-eligibility.test.ts`

### Implementation for User Story 3

- [x] T022 [US3] Implement local-only exclusion in the pilot identity and evidence helpers in `src/lib/pilot-issue-eligibility.ts`
- [x] T023 [US3] Add regression coverage proving existing local task creation remains valid for non-pilot work while local-only rows cannot satisfy pilot identity evidence in `src/lib/__tests__/pilot-issue-eligibility.test.ts`

**Checkpoint**: User Story 3 proves local-only tasks remain valid outside the pilot lane and never become pilot source-of-truth evidence.

---

## Phase 6: User Story 4 - Record Manual Live Smoke Evidence (Priority: P2)

**Goal**: Provide operator-controlled live smoke evidence without production evidence UI/API and without live GitHub mutation from tests or normal runtime.

**Independent Test**: Smoke script behavior is fixture/mocked-client tested; checklist review confirms live candidate selection, synthetic fallback, sync proof, duplicate prevention, local-only exclusion, side-effect checks, cleanup, and redaction guidance.

### Tests for User Story 4

- [x] T024 [US4] Add failing mocked-client coverage for existing synthetic issue reuse, explicit create opt-in, missing opt-in, missing credentials, insufficient permission, GitHub create failure, and label mismatch in `src/lib/__tests__/pilot-issue-smoke.test.ts`
- [x] T025 [US4] Add failing mocked coverage for operator-triggered sync failure being distinct from ineligible, duplicate, and successful no-op outcomes in `src/lib/__tests__/pilot-issue-smoke.test.ts`

### Implementation for User Story 4

- [x] T026 [US4] Implement explicit synthetic fallback find-before-create behavior with live-mutation opt-in in `scripts/pilot-issue-smoke.mjs`
- [x] T027 [US4] Implement redacted operator error output for credentials, permissions, GitHub API, label mismatch, and create failures in `scripts/pilot-issue-smoke.mjs`
- [x] T028 [US4] Implement operator-triggered sync invocation through the existing sync path without adding production UI/API, poller, or cron behavior in `scripts/pilot-issue-smoke.mjs`
- [x] T029 [US4] Write manual live smoke evidence checklist covering candidate selection, synthetic fallback, ingest/sync proof, duplicate prevention, local-only exclusion, side-effect checks, cleanup, and evidence redaction in `docs/qa/pilot-smoke-checklist.md`

**Checkpoint**: User Story 4 is fully reviewable through deterministic tests and the manual smoke checklist.

---

## Phase 7: Polish And Cross-Cutting Concerns

**Purpose**: Finish documentation, roadmap/status traceability, and verification.

- [x] T030 [P] Update SPEC-009C1 status and approved future SPEC-013A1/SPEC-009E references in `docs/ai/rc-factory-technical-roadmap.md`
- [x] T031 [P] Update SPEC-009C1 workflow/status references for generated task coverage in `docs/ai/specs/SPEC-009C1-workflow.md`
- [x] T032 Run focused pilot tests with `pnpm exec vitest run src/lib/__tests__/pilot-issue-eligibility.test.ts src/lib/__tests__/pilot-issue-smoke.test.ts`
- [x] T033 Run strict type checking with `pnpm typecheck` for `src/lib/pilot-issue-eligibility.ts` and `scripts/pilot-issue-smoke.mjs`
- [x] T034 Run lint with `pnpm lint` for `src/lib/pilot-issue-eligibility.ts`, `scripts/pilot-issue-smoke.mjs`, and SPEC-009C1 test files
- [x] T035 Run full unit suite with `pnpm test` for the repository test surface
- [x] T036 Run production build with `pnpm build` for the Next.js application

---

## Success Criteria Traceability

| Success Criterion | Functional Requirements | Tasks |
|---|---|---|
| SC-001 | FR-001, FR-007, FR-008 | T001, T010, T011, T014, T015 |
| SC-002 | FR-005, FR-008, FR-009 | T002, T011, T015, T019 |
| SC-003 | FR-002, FR-003, FR-004, FR-005, FR-006 | T016, T018, T019 |
| SC-004 | FR-007, FR-010 | T003, T021, T022, T023 |
| SC-005 | FR-014, FR-015 | T005, T015 |
| SC-006 | FR-011, FR-018, FR-023 | T026, T027, T028, T029 |
| SC-007 | FR-012, FR-019, FR-020, FR-021, FR-022, FR-023 | T004, T017, T020, T024, T025, T027 |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup And Red Test Baseline)**: No dependencies; starts immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 red tests
- **Phase 3 (US1)**: Depends on Phase 2; MVP scope
- **Phase 4 (US2)**: Depends on Phase 2 and can run alongside US1 after shared helpers stabilize
- **Phase 5 (US3)**: Depends on Phase 2 and the identity proof helper from US1
- **Phase 6 (US4)**: Depends on Phase 2; independent from production sync changes except the existing sync invocation contract
- **Phase 7 (Polish)**: Depends on the desired stories being complete

### User Story Dependencies

- **US1 (P1)**: MVP; no dependency on other stories after Foundation
- **US2 (P1)**: Independent rejection matrix after Foundation; duplicate detection shares identity helper with US1
- **US3 (P2)**: Depends on the US1 identity proof shape but remains independently testable
- **US4 (P2)**: Independent operator path after Foundation; does not require production UI/API

### Within Each User Story

- Tests must be written and observed failing before implementation
- Candidate/types before services and sync integration
- Existing GitHub sync and task creation seams before any operator smoke script sync invocation
- Story checkpoint before moving to lower-priority scope

---

## Parallel Execution Examples

### Setup

```text
Task: "Add failing Vitest coverage for synthetic fallback find/create idempotency and no-live-mutation defaults in src/lib/__tests__/pilot-issue-smoke.test.ts"
```

### User Story 1

```text
Task: "Expand eligible ingest assertions for repository identity, open issue-not-PR identity, mc:inbox, priority:*, exactly one routable area:*, no linked PR, and no terminal state in src/lib/__tests__/pilot-issue-eligibility.test.ts"
Task: "Implement candidate payload validation and normalized label extraction in src/lib/pilot-issue-eligibility.ts"
```

### User Story 4

```text
Task: "Add failing mocked-client coverage for existing synthetic issue reuse, explicit create opt-in, missing opt-in, missing credentials, insufficient permission, GitHub create failure, and label mismatch in src/lib/__tests__/pilot-issue-smoke.test.ts"
Task: "Write manual live smoke evidence checklist covering candidate selection, synthetic fallback, ingest/sync proof, duplicate prevention, local-only exclusion, side-effect checks, cleanup, and evidence redaction in docs/qa/pilot-smoke-checklist.md"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 and confirm the red tests fail for the required pilot slices.
2. Complete Phase 2 shared scaffolding.
3. Complete Phase 3 for eligible ingest and exact one-root-task proof.
4. Validate US1 with `pnpm test -- pilot-issue` before broadening to rejection and smoke paths.

### Incremental Delivery

1. Add US1 to prove one eligible GitHub issue becomes one GitHub-linked root task.
2. Add US2 to lock down duplicate and unsafe rejection reasons.
3. Add US3 to prove local-only tasks remain outside pilot evidence.
4. Add US4 to provide operator-controlled synthetic fallback and manual smoke evidence.
5. Run focused, typecheck, lint, full unit, and build verification.

### Non-Goal Enforcement

- No tasks create a schema migration.
- No tasks add automatic GitHub sync polling, cron lifecycle, or ownerless discovery.
- No tasks add production eligibility UI or a production evidence API.
- No tasks execute Issue Triage, Issue Remediation, successor creation, claim, dispatch, runner, sandbox, harness, or auto-merge behavior.
- No tasks change workflow-contract tracker-label semantics.
