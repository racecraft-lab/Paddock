# Tasks: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

**Input**: Design documents from `specs/009c4-owner-merge-reconciliation/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/manual-github-sync-reconciliation.md`, `docs/ai/specs/SPEC-009C4-design-concept.md`
**Tests**: Required. SPEC-009C4 is TDD-first and production changes are allowed only after focused RED coverage proves a gap.
**Primary Files**: `src/lib/__tests__/github-sync-ready-for-owner.test.ts`, `src/lib/github-sync-engine.ts`, `docs/qa/pilot-smoke-checklist.md`
**Scope Guard**: Do not add polling, webhooks, scheduler lifecycle, claim/run schema, sandbox lifecycle, harness adapters, review packet tables, lifecycle snapshot APIs, evidence dashboards, packet UI, new migrations, or new runtime dependencies.

## Phase 1: Setup (Shared Evidence Baseline)

**Purpose**: Confirm the branch, feature artifacts, package manager, and no-new-surface boundaries before writing RED tests.

- [x] T001 Verify the worktree remains on branch `009c4-owner-merge-reconciliation`, verify prerequisite-backed SpecKit commands use `SPECIFY_FEATURE=009-owner-merge-reconciliation` plus `SPECIFY_FEATURE_DIRECTORY=specs/009c4-owner-merge-reconciliation`, and record both checks in `docs/ai/specs/SPEC-009C4-workflow.md`
- [x] T002 Verify `pnpm-lock.yaml` is the package-manager lockfile and record `pnpm` command usage in `specs/009c4-owner-merge-reconciliation/quickstart.md`
- [x] T003 [P] Verify `specs/009c4-owner-merge-reconciliation/spec.md`, `specs/009c4-owner-merge-reconciliation/plan.md`, and `docs/ai/specs/SPEC-009C4-design-concept.md` remain aligned on manual sync and `G_PILOT_MERGE`
- [x] T004 [P] Verify archive-sweep startup evidence excludes `specs/009c4-owner-merge-reconciliation` as the current target in `docs/ai/specs/SPEC-009C4-workflow.md`
- [x] T005 [P] Inventory existing manual sync and task-chain seams in `src/lib/github-sync-engine.ts`, `src/app/api/github/sync/route.ts`, and `src/lib/task-dispatch.ts` without making production edits

---

## Phase 2: Foundational (Blocking RED Harness)

**Purpose**: Establish focused test helpers and baseline assertions before any production behavior change.

**CRITICAL**: No production code change in `src/lib/github-sync-engine.ts` may occur until the relevant RED task in this phase or a user-story test task fails for the intended reason.

- [x] T006 Add or extend fixture helpers for linked PR-producing tasks, exact PR evidence, mismatched PR evidence, closed issue evidence, failed sync evidence, activities, notifications, labels, and task-chain calls in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T007 Add helper assertions for "no terminal side effects" including no `done` status, no done label projection, no stale ready-label removal, no `github_pr_merged` terminal activity, no `advanceTaskChain`, no duplicate launch, and no cleanup call in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T008 Add helper assertions for successful terminal evidence including `tasks.status='done'`, `completed_at`, exact PR identity, `github_synced_at`, done label projection, stale ready-label removal, terminal activity, bounded notifications, and one task-chain advancement in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T009 Run the focused Vitest file and confirm any new SPEC-009C4 tests are RED before implementation using `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

**Checkpoint**: Test harness is ready; user story phases can proceed with RED tests first.

---

## Phase 3: User Story 1 - Owner Completes The Pilot Merge Gate (Priority: P1) MVP

**Goal**: The pilot remains `ready_for_owner` until the operator manually performs `G_PILOT_MERGE`, and smoke evidence names a fresh C4 PR instead of SPEC-009C3 PR #49.

**Independent Test**: Prepare a linked PR-producing pilot task at `ready_for_owner`, run manual sync before merge, verify no completion or launch, then document a fresh PR merge gate in the smoke checklist.

### Tests for User Story 1

- [x] T010 [P] [US1] Write a RED test proving a linked `ready_for_owner` task with no `G_PILOT_MERGE` evidence remains `ready_for_owner` with no terminal side effects in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T011 [P] [US1] Write a RED test proving unmerged exact PR evidence does not complete the linked task and records reconciliation-required evidence in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T012 [P] [US1] Write a RED checklist assertion that `docs/qa/pilot-smoke-checklist.md` requires fresh C4 PR identity, pre-merge `ready_for_owner`, manual `G_PILOT_MERGE`, and explicit non-use of SPEC-009C3 PR #49 in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Patch `src/lib/github-sync-engine.ts` only if T010 or T011 proves the existing pre-merge or unmerged-PR path can complete or launch incorrectly
- [x] T014 [US1] Add the `G_PILOT_MERGE` live smoke evidence template and SPEC-009C3 PR #49 exclusion language in `docs/qa/pilot-smoke-checklist.md`
- [x] T015 [US1] Run the focused tests for the owner merge gate and confirm T010, T011, and T012 are GREEN in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

**Checkpoint**: US1 proves the owner gate can be reviewed independently.

---

## Phase 4: User Story 2 - Operator Reconciles Done Through Manual Sync (Priority: P1)

**Goal**: Existing manual GitHub sync reconciles the exact merged linked PR from `ready_for_owner` to `done` with status, label, activity, notification, and one successor outcome.

**Independent Test**: Run manual sync with exact merged PR evidence and inspect the linked task, labels, activities, notifications, and task-chain call count.

### Tests for User Story 2

- [x] T016 [P] [US2] Write a RED test proving exact merged PR evidence for the linked `github_repo` and `github_pr_number` transitions the task from `ready_for_owner` to `done` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T017 [P] [US2] Write a RED test proving successful reconciliation applies or projects `mc:done` and removes stale `mc:ready-for-owner` projection in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T018 [P] [US2] Write a RED test proving successful reconciliation records terminal `github_pr_merged` activity and bounded notification evidence in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T019 [P] [US2] Write a RED test proving `advanceTaskChain` runs only after verified exact merged PR evidence and produces exactly one successor launch or terminal advancement in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T020 [P] [US2] Write a RED contract-level assertion for `POST /api/github/sync` trigger shape and `pullFromGitHub(project, workspaceId)` reuse in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

### Implementation for User Story 2

- [x] T021 [US2] Patch exact merged PR reconciliation in `src/lib/github-sync-engine.ts` only for proven failures from T016, T017, T018, or T019
- [x] T022 [US2] Patch `src/app/api/github/sync/route.ts` only if T020 proves the manual API route bypasses the existing `pullFromGitHub(project, workspaceId)` path
- [x] T023 [US2] Verify no new sync API, webhook, poller, or scheduler entrypoint was added while implementing US2 in `src/app/api/github/sync/route.ts`
- [x] T024 [US2] Run the focused tests for exact merged PR reconciliation and confirm T016 through T020 are GREEN in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

**Checkpoint**: US2 proves the production manual sync happy path independently.

---

## Phase 5: User Story 3 - Reconciliation Fails Closed For Wrong Or Missing PR Evidence (Priority: P2)

**Goal**: Closed issues, missing PR evidence, unrelated merged PRs, and sync failures leave the linked task `ready_for_owner` with reviewable fail-closed evidence.

**Independent Test**: Sync each negative evidence shape and verify the task remains `ready_for_owner`, emits reconciliation-required or failed-sync evidence, and has no terminal side effects.

### Tests for User Story 3

- [x] T025 [P] [US3] Write a RED test proving closed issue evidence or supporting-only PR metadata (`merged_at`/`merge_commit_sha` without explicit merged PR truth) leaves the task `ready_for_owner` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T026 [P] [US3] Write a RED test proving a merged PR with the wrong PR number does not complete the linked task in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T027 [P] [US3] Write a RED test proving a merged PR from the wrong repository does not complete the linked task in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T028 [P] [US3] Write a RED test proving GitHub transport, auth, permission, rate-limit, timeout, or upstream API failure records failed-sync evidence and leaves the task `ready_for_owner` in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T029 [P] [US3] Write a RED test proving fixture or mocked PR evidence cannot be passed through production API/UI callsites as live smoke proof in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T030 [P] [US3] Write a RED test proving local-only `done` mutation without current exact merged PR evidence cannot satisfy the C4 terminal gate in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

### Implementation for User Story 3

- [x] T031 [US3] Patch fail-closed PR identity handling in `src/lib/github-sync-engine.ts` only for proven failures from T025, T026, or T027
- [x] T032 [US3] Patch failed-sync handling in `src/lib/github-sync-engine.ts` only if T028 proves transport/API failures can write terminal side effects
- [x] T033 [US3] Patch fixture-boundary handling in `src/lib/github-sync-engine.ts` or `src/app/api/github/sync/route.ts` only if T029 proves test fixtures can reach production callsites
- [x] T034 [US3] Run the focused negative-case tests and confirm T025 through T030 are GREEN in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

**Checkpoint**: US3 proves the fail-closed cases independently.

---

## Phase 6: User Story 4 - Duplicate Sync Is Idempotent And Reviewable (Priority: P3)

**Goal**: Repeated manual sync after successful reconciliation remains side-effect safe and produces bounded source evidence for SPEC-009D.

**Independent Test**: Sync exact merged PR evidence at least twice and verify one terminal outcome, stable labels/status, bounded activities/notifications, no duplicate launch, and no duplicate cleanup work.

### Tests for User Story 4

- [x] T035 [P] [US4] Write a RED test proving duplicate manual sync keeps task status stable at `done` and does not create duplicate terminal completion in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T036 [P] [US4] Write a RED test proving duplicate sync does not call `advanceTaskChain` or launch downstream work more than once in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T037 [P] [US4] Write a RED test proving duplicate sync does not flood terminal activities, owner-action notifications, reconciliation-required notifications, or cleanup evidence in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- [x] T038 [P] [US4] Write a RED evidence-source assertion for SPEC-009D handoff fields from tasks, activities, notifications, task artifacts, quality reviews, GitHub labels, and smoke checklist text in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

### Implementation for User Story 4

- [x] T039 [US4] Patch duplicate-sync idempotency in `src/lib/github-sync-engine.ts` only for proven failures from T035, T036, or T037
- [x] T040 [US4] Update SPEC-009D handoff source mapping in `docs/qa/pilot-smoke-checklist.md` without adding packet YAML, JSON, table, API, dashboard, or UI
- [x] T041 [US4] Run the focused duplicate-sync and handoff tests and confirm T035 through T038 are GREEN in `src/lib/__tests__/github-sync-ready-for-owner.test.ts`

**Checkpoint**: US4 proves duplicate sync and handoff evidence independently.

---

## Phase 7: Guardrails, Live Smoke, Cleanup, And Verification

**Purpose**: Prove future-spec boundaries, execute fresh C4 smoke evidence, clean UAT residue, and run the required verification commands.

- [x] T042 [P] Verify no new webhook, poller, scheduler, or sync API path was introduced in `src/app/api/github/sync/route.ts`, `src/lib/github-sync-engine.ts`, and `src/lib/task-dispatch.ts`
- [x] T043 [P] Verify no claim/run schema, sandbox lifecycle, harness adapter, review packet table, lifecycle snapshot API, evidence dashboard, packet UI, new migration, or new runtime dependency was introduced in `src/`, `scripts/`, `package.json`, and `pnpm-lock.yaml`
- [x] T044 [P] Verify no new SPEC-009C4-owned TypeScript module requires additions to `tsconfig.spec-strict.json` or `eslint.config.mjs`; if a new module was necessary, add exact entries in `tsconfig.spec-strict.json` and `eslint.config.mjs`
- [x] T045 Create a fresh synthetic draft PR for C4 live UAT and record its URL/number, target repo, workspace/project identity, linked task id, and pre-merge `ready_for_owner` state in `docs/qa/pilot-smoke-checklist.md`
- [x] T046 Manually merge the fresh synthetic C4 PR at `G_PILOT_MERGE` and record timestamp, operator, target deployment, and explicit non-use of SPEC-009C3 PR #49 in `docs/qa/pilot-smoke-checklist.md`
- [x] T047 Run manual GitHub sync via `POST /api/github/sync` or the GitHub Sync panel and record sync result, task status, done label projection, stale ready-label removal, terminal activity, notification evidence, and duplicate sync evidence in `docs/qa/pilot-smoke-checklist.md`
- [x] T048 Clean disposable Mission Control UAT residue after evidence capture and record before/after counts, cleanup owner, timestamp, retained GitHub audit trail, and retention rationale in `docs/qa/pilot-smoke-checklist.md`
- [x] T049 If live UAT cleanup fails, record failed cleanup step, owner, timestamp, before/after counts when available, sanitized failure reason, retained local rows or GitHub artifacts, and follow-up owner in `docs/qa/pilot-smoke-checklist.md`
- [x] T050 Run `pnpm build` and record the result in `docs/qa/pilot-smoke-checklist.md`
- [x] T051 Run `pnpm typecheck` and record the result in `docs/qa/pilot-smoke-checklist.md`
- [x] T052 Run `pnpm lint` and record the result in `docs/qa/pilot-smoke-checklist.md`
- [x] T053 Run `pnpm test` and record the result in `docs/qa/pilot-smoke-checklist.md`
- [x] T054 Run `pnpm test:all` for the final PR gate, record the result in `docs/qa/pilot-smoke-checklist.md`, and separately record the no-new-UI-journey rationale if C4 changed only library tests and Markdown checklist evidence
- [x] T055 Update C4 roadmap/status hygiene after implementation and live UAT evidence are complete in `docs/ai/rc-factory-technical-roadmap.md` and `docs/ai/specs/SPEC-009C4-workflow.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; start immediately.
- **Phase 2 Foundational**: Depends on Phase 1; blocks all production edits.
- **Phase 3 US1**: Depends on Phase 2; MVP owner-gate proof.
- **Phase 4 US2**: Depends on Phase 2 and can proceed after US1 test harness is present; exact merge happy path.
- **Phase 5 US3**: Depends on Phase 2 and can proceed after US1/US2 helper assertions are available.
- **Phase 6 US4**: Depends on US2 success path; duplicate sync requires a terminal reconciliation baseline.
- **Phase 7 Guardrails/Smoke/Cleanup/Verification**: Depends on all targeted user stories being GREEN.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2; validates the owner merge gate before completion.
- **US2 (P1)**: Independent after Phase 2 but relies on the exact-PR helper assertions from T008.
- **US3 (P2)**: Independent after Phase 2; negative cases can run in parallel with US1/US2 once helpers exist.
- **US4 (P3)**: Depends on the US2 successful reconciliation path to test duplicate sync.

### Red-Green-Refactor Order

- Write the RED tests in each story phase before touching `src/lib/github-sync-engine.ts`.
- Patch production code only for a failing test that proves a real gap.
- Re-run the focused story tests immediately after each patch.
- Refactor only after story tests are GREEN and guardrail scope remains unchanged.

## Parallel Opportunities

- T003, T004, and T005 can run in parallel during setup.
- T010, T011, and T012 can be written in parallel after foundational helpers exist.
- T016 through T020 can be written in parallel because they target distinct assertions in the same test file but should be merged carefully to avoid conflicts.
- T025 through T030 can be written in parallel as separate negative-case tests.
- T035 through T038 can be written in parallel once the happy path is GREEN.
- T042, T043, and T044 can run in parallel as guardrail verification tasks.

## Parallel Example: Negative PR Evidence

```bash
Task: "Write closed issue without merged PR RED coverage in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
Task: "Write wrong PR number RED coverage in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
Task: "Write wrong repository RED coverage in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
Task: "Write GitHub sync failure RED coverage in src/lib/__tests__/github-sync-ready-for-owner.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 owner merge gate tests and smoke checklist template.
3. Stop and validate that no linked task can complete before `G_PILOT_MERGE`.

### Incremental Delivery

1. Add US2 exact merged PR reconciliation.
2. Add US3 fail-closed negative cases.
3. Add US4 duplicate-sync idempotency.
4. Finish guardrails, fresh live smoke, cleanup, and verification.

### Reviewability Notes

- Keep production changes centered on `src/lib/github-sync-engine.ts`; touch `src/app/api/github/sync/route.ts` only if the manual route fails the reuse contract.
- Keep the review under the plan budget where possible: fewer than 6 production files and fewer than 15 total files.
- Do not create new runtime dependencies, migrations, packet persistence, lifecycle APIs, evidence UI, scheduler/poller/webhook paths, or future-spec placeholder schema.
- Treat `docs/qa/pilot-smoke-checklist.md` as text evidence only; committed binary screenshots require a manifest-backed exception outside this task list.

## Notes

- [P] tasks affect separate assertions or verification surfaces and can run in parallel if merge conflicts are coordinated.
- Each user story has independent test criteria and a GREEN checkpoint.
- G5-relevant evidence is concentrated in T045 through T049: fresh PR identity, manual `G_PILOT_MERGE`, sync result, duplicate sync evidence, cleanup/retention, and explicit non-use of SPEC-009C3 PR #49.
