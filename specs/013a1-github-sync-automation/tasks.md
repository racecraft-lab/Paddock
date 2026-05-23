# Tasks: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

**Input**: Design documents from `specs/013a1-github-sync-automation/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/github-sync-lifecycle-api.md`, `quickstart.md`, and resolved checklist remediations under `checklists/`
**Tests**: Required. This feature is TDD-first per the constitution, plan, and workflow prompt.
**Reviewability**: Warning accepted in spec and plan. Keep implementation scoped to the ratified scheduler/runtime primary surface plus API, UI, schema/migration, and docs/process secondary surfaces.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish spec-owned file boundaries, fixtures, and reviewability checks before behavioral work starts.

- [x] T001 Verify package manager and runtime assumptions from `pnpm-lock.yaml`, `package.json`, and `docs/ai/specs/SPEC-013A1-workflow.md`
- [x] T002 Add SPEC-013A1 file ownership entries for new strict modules in `tsconfig.spec-strict.json`
- [x] T003 Add SPEC-013A1 lint ownership entries for new strict modules in `eslint.config.mjs`
- [x] T004 [P] Create shared lifecycle API/test fixtures in `src/lib/__tests__/fixtures/github-sync-lifecycle-fixtures.ts`
- [x] T005 [P] Create e2e lifecycle fixture helpers in `tests/e2e/fixtures/github-sync-lifecycle.ts`
- [x] T006 Record reviewability budget checkpoint and accepted split exception in `specs/013a1-github-sync-automation/tasks.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define schema, types, lifecycle primitives, guardrails, and contract tests that all stories rely on.

**CRITICAL**: No user story implementation should begin until this phase is complete.

- [x] T007 Write failing M77 migration idempotence, index, unique-scope, rollback, and rerun tests in `src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts`
- [x] T008 Add additive M77 `077_github_sync_lifecycle` tables and indexes in `src/lib/migrations.ts`
- [x] T009 Add manual rollback SQL for M77 lifecycle tables and schema marker cleanup in `docs/migrations/rollback-M77.sql`
- [x] T010 [P] Define lifecycle control, run, diagnostics, backoff, health, and API envelope types in `src/lib/github-sync-lifecycle-types.ts`
- [x] T011 [P] Write failing lifecycle validation and serialization tests in `src/lib/__tests__/github-sync-lifecycle-api.test.ts`
- [x] T012 Implement lifecycle request/response validation, safe-field allowlists, and serialization helpers in `src/lib/github-sync-lifecycle-api.ts`
- [x] T013 Write failing lifecycle service tests for control state, run history, lease acquire/release, activity evidence, and health derivation in `src/lib/__tests__/github-sync-lifecycle.test.ts`
- [x] T014 Implement lifecycle control/run persistence, lease helpers, activity emission, diagnostics allowlisting, and health summary derivation in `src/lib/github-sync-lifecycle.ts`
- [x] T015 Write failing GitHub boundary classification and retry signal tests in `src/lib/__tests__/github-sync-lifecycle-errors.test.ts`
- [x] T016 Implement GitHub failure classification, sanitized messages, retry signal precedence, cap/fallback diagnostics, and secret-redaction enforcement in `src/lib/github-sync-lifecycle.ts`
- [x] T017 Add `FEATURE_GITHUB_SYNC_AUTOMATION` default-off registry coverage tests in `src/lib/__tests__/feature-flags.test.ts`
- [x] T018 Register `FEATURE_GITHUB_SYNC_AUTOMATION` through the existing `resolveFlag` path in `src/lib/feature-flags.ts`
- [x] T019 Add SPEC-013A1 forbidden-authority guard fixture that rejects claim, dispatch, remediation, harness, sandbox, auto-merge, and automatic triage behavior in `scripts/spec-013a1/check-github-sync-scope.mjs`
- [x] T020 Add package script for the SPEC-013A1 guard in `package.json`

**Checkpoint**: Foundation ready. Story work may start after migration, lifecycle primitives, flag registration, and guard coverage exist.

Foundation evidence:
- Package manager/runtime: `pnpm-lock.yaml`, `package.json`, and `docs/ai/specs/SPEC-013A1-workflow.md` verified under `direnv exec .` Node 22.22.2 after the initial Node 26 install attempt failed `better-sqlite3` native compilation.
- Reviewability checkpoint: SPEC-013A1 remains under the accepted transition exception from setup/G5; current implementation is still limited to migration, lifecycle primitives, feature flag registration, fixtures, strict-scope ownership, and guardrails.
- Verification: `pnpm exec vitest run src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts` (5 passed); `pnpm exec vitest run src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/github-sync-lifecycle-api.test.ts src/lib/__tests__/github-sync-lifecycle.test.ts src/lib/__tests__/github-sync-lifecycle-errors.test.ts` (46 passed); `pnpm guardrails:spec-013a1`; targeted ESLint over changed foundation files; `git diff --check`.

---

## Phase 3: User Story 1 - Enable and Observe Automatic GitHub Polling (Priority: P1) - MVP

**Goal**: Operators can enable scoped automatic GitHub polling and observe enabled, running, successful, failed, delayed, disabled, and partial state without affecting unrelated Product Line/workspace scopes.

**Independent Test**: Enable one Product Line/workspace scope, execute one scheduler-owned tick, and verify lifecycle control state, running/last-run status, counters, cursor, next eligible time, diagnostics, activity evidence, API envelope, and UI status while another scope remains idle.
**Acceptance References**: FR-001 through FR-005, FR-011 through FR-013, FR-025, FR-027 through FR-030, FR-035 through FR-040, FR-044 through FR-049, SC-001, SC-007, SC-008.

### Tests for User Story 1

- [x] T021 [P] [US1] Write failing `GET /api/github/sync` lifecycle envelope tests for flag-off/default-off, scope filtering, schema diagnostics, health severity, and compatibility fields in `src/app/api/github/sync/__tests__/route.test.ts`
- [x] T022 [P] [US1] Write failing `PATCH /api/github/sync/control` tests for enable, disable, interval/bounds validation, feature-flag-disabled 403, reset backoff, and disable-while-active response in `src/app/api/github/sync/control/__tests__/route.test.ts`
- [x] T023 [P] [US1] Write failing scheduler registration and runtime tick tests for flag/control re-check, bounded candidate selection, shutdown future-tick stop, and no singleton product contract in `src/lib/__tests__/scheduler-github-sync-automation.test.ts`
- [x] T024 [P] [US1] Write failing GitHub Sync panel tests for distinct automatic lifecycle section, disabled/running/success/partial/error labels, backoff reset affordance, and accessible status updates in `src/components/panels/__tests__/github-sync-panel.test.tsx`
- [x] T025 [P] [US1] Write failing Playwright journey for enabling one scope, observing a scheduler tick, disabling automation, and preserving manual fallback in `tests/e2e/spec-013a1-github-sync-automation.spec.ts`

### Implementation for User Story 1

- [x] T026 [US1] Enrich `GET /api/github/sync` with `github_sync_lifecycle.v1` while preserving existing `syncs` and `poller` fields in `src/app/api/github/sync/route.ts`
- [x] T027 [US1] Implement operator-only `PATCH /api/github/sync/control` enable, disable, bounds update, and idempotent backoff reset in `src/app/api/github/sync/control/route.ts`
- [x] T028 [US1] Replace automatic product reliance on the lazy singleton with scheduler-owned `github_sync_automation` registration and bounded tick entrypoints in `src/lib/scheduler.ts`
- [x] T029 [US1] Refactor automatic tick helpers for scoped lifecycle execution while preserving test-only tick seams in `src/lib/github-sync-poller.ts`
- [x] T030 [US1] Add bounded cursor-aware automatic pull options without changing manual defaults in `src/lib/github-sync-engine.ts`
- [x] T031 [US1] Render automatic lifecycle status, controls, diagnostics, health severity, and accessible status messages in `src/components/panels/github-sync-panel.tsx`
- [x] T032 [US1] Add focused lifecycle control subcomponent if needed to keep the existing panel reviewable in `src/components/panels/github-sync-lifecycle-section.tsx`
- [x] T033 [US1] Add UI copy mapping for disabled, running, success, failed/backoff, partial bounded stop, skipped overlap, rejected overlap, skipped owner, skipped non-owner, ownership unresolved, and stale recovered states in `src/components/panels/github-sync-panel.tsx`

**Checkpoint**: User Story 1 is independently functional when scoped automatic polling can be enabled, observed, disabled, and verified through API, UI, activity, and lifecycle state.

US1 evidence:
- API/control TDD: GET lifecycle envelope and PATCH control tests added for compatibility fields, flag-off/default-off diagnostics, scoped filtering, health severity, enable/disable, bounds validation, feature-flag-disabled 403, reset backoff, and disable-while-active active-run visibility.
- Scheduler/runtime TDD: scheduler-owned `github_sync_automation`, bounded candidate selection, flag/control re-check, future-tick shutdown, lifecycle automatic tick seams, and manual-default compatibility are covered by focused scheduler/engine lifecycle tests.
- UI/e2e TDD: GitHub Sync panel component tests cover the separate automatic lifecycle section, disabled/running/success/partial/error labels, backoff reset affordance, scoped PATCH bodies, accessible live status, and manual fallback visibility. Playwright covers enable, observe scheduler state, disable, and manual `trigger-all` fallback on `/github`.
- Verification: `pnpm exec vitest run src/app/api/github/sync/__tests__/route.test.ts src/app/api/github/sync/control/__tests__/route.test.ts src/lib/__tests__/scheduler-github-sync-automation.test.ts src/lib/__tests__/github-sync-engine-lifecycle.test.ts src/components/panels/__tests__/github-sync-panel.test.tsx` (5 files, 18 tests passed); `pnpm exec playwright test tests/e2e/spec-013a1-github-sync-automation.spec.ts --project=chromium` (1 passed); targeted ESLint over US1 files; `pnpm typecheck`; `pnpm guardrails:spec-013a1`; `git diff --check`.

---

## Phase 4: User Story 2 - Preserve Manual Sync During Automation (Priority: P2)

**Goal**: Existing manual sync remains an independent fallback with deterministic same-scope conflict behavior and independent non-overlapping scope behavior.

**Independent Test**: Run automatic and manual sync requests against same and different scopes, verifying one same-scope owner, deterministic 409 manual conflicts, skipped automatic overlap records, and no behavioral regression to successful manual response shapes.
**Acceptance References**: FR-006 through FR-008, FR-019 through FR-021, FR-026 through FR-027, FR-036, FR-040, SC-001, SC-005, SC-007.

### Tests for User Story 2

- [x] T034 [P] [US2] Write failing manual `POST /api/github/sync` compatibility tests for unchanged `trigger` and `trigger-all` success responses in `src/app/api/github/sync/__tests__/route.test.ts`
- [x] T035 [P] [US2] Write failing same-scope overlap tests for manual 409 `github_sync_overlap`, trigger-all preflight conflicts, automatic skipped-overlap, lease release, and non-overlapping scope independence in `src/app/api/github/sync/__tests__/route.test.ts`
- [x] T036 [P] [US2] Write failing lifecycle service tests for manual fallback activity evidence, rejected overlap run detail, skipped overlap run detail, retry guidance, and cursor preservation in `src/lib/__tests__/github-sync-lifecycle.test.ts`

### Implementation for User Story 2

- [x] T037 [US2] Wrap manual project sync and trigger-all sync in lifecycle lease preflight and conflict handling while preserving success bodies in `src/app/api/github/sync/route.ts`
- [x] T038 [US2] Record manual fallback completed/failed, rejected overlap, skipped overlap, and lease release transitions in `src/lib/github-sync-lifecycle.ts`
- [x] T039 [US2] Make automatic ticks record skipped-overlap terminal outcomes without GitHub ingestion when same-scope manual or automatic leases exist in `src/lib/github-sync-poller.ts`
- [x] T040 [US2] Surface same-scope conflict active-run details and retry guidance in the GitHub Sync panel without relabeling manual sync as lifecycle control in `src/components/panels/github-sync-panel.tsx`

**Checkpoint**: User Story 2 is independently functional when manual sync is preserved, same-scope overlap is deterministic, and independent scopes can still sync.

- Implementation evidence: Manual `trigger`/`trigger-all` now wrap idle lifecycle scopes with manual leases while preserving legacy success response bodies; same-scope manual requests return deterministic 409 `github_sync_overlap` responses with active-run and retry guidance; trigger-all preflights conflicts before ingestion; non-overlapping scopes still sync; automatic ticks record `skipped_overlap` without calling GitHub ingestion.
- Lifecycle/UI evidence: manual fallback completion/failure activity, rejected/skipped overlap terminal rows, cursor preservation, overlap counters, amber `overlap_blocked` health, and GitHub Sync panel retry details are covered.
- Verification: `pnpm exec vitest run src/lib/__tests__/github-sync-lifecycle.test.ts src/app/api/github/sync/__tests__/route.test.ts src/lib/__tests__/scheduler-github-sync-automation.test.ts src/components/panels/__tests__/github-sync-panel.test.tsx` (4 files, 25 tests passed); targeted ESLint over US2 files; `pnpm typecheck`.

---

## Phase 5: User Story 3 - Recover From Failures Without Losing Cursor Integrity (Priority: P3)

**Goal**: Failed, malformed, partial, bounded, backoff, and stale-recovered sync attempts are observable, bounded, sanitized, and never corrupt the last success cursor.

**Independent Test**: Force failures, malformed pages, page/issue/duration bounds, rate-limit retry signals, disable-while-running, and stale leases, then verify cursor preservation, partial state, bounded retry visibility, sanitized diagnostics, activity evidence, and recovery behavior.
**Acceptance References**: FR-014 through FR-020, FR-023, FR-029, FR-035 through FR-043, SC-002, SC-003, SC-006, SC-007.

### Tests for User Story 3

- [x] T041 [P] [US3] Write failing success-only cursor tests for failed automatic runs, malformed first page, malformed later page, partial safe-boundary behavior, skipped outcomes, and stale recovery in `src/lib/__tests__/github-sync-lifecycle.test.ts`
- [x] T042 [P] [US3] Write failing bounded pagination and duration tests for max pages, max issues, max duration, partial-run reason, consumed bounds, and next-run resume state in `src/lib/__tests__/github-sync-engine-lifecycle.test.ts`
- [x] T043 [P] [US3] Write failing stale lease acquisition/recovery tests for expired lease detection, recovery run detail, replacement lease, and no operator data repair in `src/lib/__tests__/github-sync-lifecycle.test.ts`
- [x] T044 [P] [US3] Write failing retry/backoff tests for `Retry-After`, `X-RateLimit-Reset`, invalid/past retry headers, exponential fallback, cap visibility, and next retry API/UI fields in `src/lib/__tests__/github-sync-lifecycle-errors.test.ts`
- [x] T045 [P] [US3] Write failing observability redaction tests for API JSON, activity payloads, lifecycle diagnostics, health summaries, and token-shaped/raw-provider samples in `src/lib/__tests__/github-sync-lifecycle-redaction.test.ts`
- [x] T046 [P] [US3] Extend Playwright coverage for failed/backoff, partial bounded stop, stale recovery, sanitized failure text, health severity, and no forbidden authority copy in `tests/e2e/spec-013a1-github-sync-automation.spec.ts`

### Implementation for User Story 3

- [x] T047 [US3] Implement success-only cursor advancement and preserve cursor on failed, partial, skipped, rejected, unresolved, and stale-recovered results in `src/lib/github-sync-lifecycle.ts`
- [x] T048 [US3] Implement bounded page, issue, and duration execution with partial result metadata and malformed-page handling in `src/lib/github-sync-engine.ts`
- [x] T049 [US3] Implement stale lease recovery, recovery activity evidence, replacement lease acquisition, and schema-unavailable health handling in `src/lib/github-sync-lifecycle.ts`
- [x] T050 [US3] Implement retry/backoff cap and signal-source exposure in lifecycle controls, API envelope, and UI state in `src/lib/github-sync-lifecycle.ts`
- [x] T051 [US3] Expose sanitized failure categories, last error, next retry, partial reason, skipped counters, and health severity in `src/app/api/github/sync/route.ts`
- [x] T052 [US3] Render failure, backoff, partial, stale-recovered, skipped, health, and manual fallback diagnostics in `src/components/panels/github-sync-panel.tsx`

**Checkpoint**: User Story 3 is independently functional when every failure and partial path is bounded, visible, sanitized, and cursor-safe.

---

## Phase 6: User Story 4 - Avoid Duplicate Ingestion for Shared Repositories (Priority: P4)

**Goal**: Shared repositories are grouped by `(workspace_id, github_repo)` and only the selected owner polls, while non-owner or unresolved scopes record explicit non-ingesting lifecycle evidence.

**Independent Test**: Configure multiple active projects that share one repository, verify exactly one owner polls, non-owners record skipped outcomes, unresolved ownership records a red health state, and no duplicate GitHub issue ingestion occurs.
**Acceptance References**: FR-009 through FR-010, FR-024, FR-031 through FR-034, FR-036 through FR-040, SC-004.

### Tests for User Story 4

- [ ] T053 [P] [US4] Write failing SPEC-006 owner-selection tests for single project, exactly one owner, non-owner skipped outcomes, no owner, multiple owners, and no `FEATURE_AREA_LABEL_ROUTING` dependency in `src/lib/__tests__/github-sync-lifecycle-ownership.test.ts`
- [ ] T054 [P] [US4] Write failing duplicate-ingestion prevention tests for grouped candidates and shared repositories in `src/lib/__tests__/spec006-poller.test.ts`
- [ ] T055 [P] [US4] Write failing API/UI tests for skipped owner, skipped non-owner, ownership unresolved, skipped counters, owner diagnostics, and health severity in `src/app/api/github/sync/__tests__/route.test.ts`
- [ ] T056 [P] [US4] Extend Playwright shared-repository coverage for owner polling, skipped non-owner visibility, ownership-unresolved visibility, and no duplicate issue rows in `tests/e2e/spec-013a1-github-sync-automation.spec.ts`

### Implementation for User Story 4

- [ ] T057 [US4] Implement candidate grouping and ownership decisions by `(workspace_id, github_repo)` in `src/lib/github-sync-poller.ts`
- [ ] T058 [US4] Record skipped owner, skipped non-owner, and ownership-unresolved terminal lifecycle transitions without GitHub ingestion in `src/lib/github-sync-lifecycle.ts`
- [ ] T059 [US4] Preserve SPEC-006 owner semantics independently from `FEATURE_AREA_LABEL_ROUTING` in `src/lib/github-sync-poller.ts`
- [ ] T060 [US4] Surface ownership decisions, skipped counters, owner project IDs, unresolved ownership, and duplicate-prevention diagnostics in `src/app/api/github/sync/route.ts`
- [ ] T061 [US4] Render shared-repository ownership, skipped non-owner, and ownership-unresolved labels in `src/components/panels/github-sync-panel.tsx`

**Checkpoint**: User Story 4 is independently functional when shared repositories cannot duplicate automatic ingestion and every skipped ownership decision is reviewable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, docs, evidence, rollback validation, and review packet preparation.

- [ ] T062 [P] Update SPEC-013A1 quickstart verification notes with exact focused commands and observed evidence expectations in `specs/013a1-github-sync-automation/quickstart.md`
- [ ] T063 [P] Update rollback procedure references for M77 lifecycle disablement and SQL rollback in `docs/runbook/migration-rollback.md`
- [ ] T064 [P] Update OpenAPI/API index entries for `GET /api/github/sync`, `POST /api/github/sync`, and `PATCH /api/github/sync/control` in `openapi.json` and `src/app/api/index/route.ts`
- [ ] T065 [P] Update repo knowledge index for SPEC-013A1 source, API, migration, UI, and verification artifacts in `docs/ai/repo-knowledge-index.json`
- [ ] T066 Run Archive Sweep dry-run/current-target exclusion evidence and record recovery-command status in `specs/013a1-github-sync-automation/tasks.md`
- [ ] T067 Run screenshot/evidence guard verification and document no committed binary screenshot exception in `specs/013a1-github-sync-automation/tasks.md`
- [ ] T068 Run SPEC-013A1 forbidden-authority guard script and record results in `specs/013a1-github-sync-automation/tasks.md`
- [ ] T069 Run focused unit/API tests and record evidence in `specs/013a1-github-sync-automation/tasks.md`: `pnpm test -- src/lib/__tests__/github-sync-lifecycle.test.ts src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts src/app/api/github/sync/__tests__/route.test.ts src/app/api/github/sync/control/__tests__/route.test.ts`
- [ ] T070 Run focused UI/e2e journey and record evidence in `specs/013a1-github-sync-automation/tasks.md`: `pnpm test:e2e -- tests/e2e/spec-013a1-github-sync-automation.spec.ts`
- [ ] T071 Run full verification and record evidence in `specs/013a1-github-sync-automation/tasks.md`: `pnpm api:parity && pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
- [ ] T072 Generate PR review packet with review order, scope budget, traceability, verification evidence, known gaps, rollback/flag notes, and deferred SPEC-013B+/SPEC-014+ boundaries in `docs/ai/specs/013a1-github-sync-automation-review-packet.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2; MVP.
- **Phase 4 US2**: Depends on Phase 2 and may reuse US1 lifecycle/API surfaces.
- **Phase 5 US3**: Depends on Phase 2 and lifecycle execution paths from US1/US2.
- **Phase 6 US4**: Depends on Phase 2 and automatic candidate selection from US1.
- **Phase 7 Polish**: Depends on completed target user stories.

### User Story Dependencies

- **US1 (P1)**: Enables and observes automatic polling; MVP after Foundation.
- **US2 (P2)**: Manual fallback and overlap behavior; can start after Foundation but final route integration should reconcile with US1.
- **US3 (P3)**: Failure, partial, backoff, and stale recovery; can start after Foundation but depends on lifecycle execution seams.
- **US4 (P4)**: Shared-repository ownership; can start after Foundation but depends on automatic candidate grouping.

### Parallel Opportunities

- Setup fixtures T004-T005 can run in parallel.
- Foundational type/API test tasks T010-T012 and migration work T007-T009 can be split by file.
- US1 tests T021-T025 can be written in parallel before implementation.
- US2 tests T034-T036 can be written in parallel before implementation.
- US3 tests T041-T046 can be written in parallel before implementation.
- US4 tests T053-T056 can be written in parallel before implementation.
- Documentation/index updates T062-T065 can run in parallel after implementation stabilizes.

---

## Parallel Example: User Story 1

```bash
# After Phase 2, write US1 failing tests in parallel:
Task: "T021 GET lifecycle envelope tests in src/app/api/github/sync/__tests__/route.test.ts"
Task: "T022 PATCH control route tests in src/app/api/github/sync/control/__tests__/route.test.ts"
Task: "T023 Scheduler registration tests in src/lib/__tests__/scheduler-github-sync-automation.test.ts"
Task: "T024 GitHub Sync panel lifecycle tests in src/components/panels/__tests__/github-sync-panel.test.tsx"
Task: "T025 Playwright enable/observe/disable journey in tests/e2e/spec-013a1-github-sync-automation.spec.ts"
```

## Parallel Example: User Story 3

```bash
# After lifecycle seams exist, split failure/recovery coverage:
Task: "T041 Cursor integrity tests in src/lib/__tests__/github-sync-lifecycle.test.ts"
Task: "T042 Bounded pagination tests in src/lib/__tests__/github-sync-engine-lifecycle.test.ts"
Task: "T044 Retry/backoff tests in src/lib/__tests__/github-sync-lifecycle-errors.test.ts"
Task: "T045 Redaction tests in src/lib/__tests__/github-sync-lifecycle-redaction.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 setup and Phase 2 foundational migration/type/lifecycle primitives.
2. Write and fail US1 tests T021-T025.
3. Implement US1 tasks T026-T033.
4. Validate with focused US1 unit/API/component/e2e coverage before proceeding.

### Incremental Delivery

1. Foundation: M77 schema, lifecycle primitives, feature flag, validation, guard script.
2. US1: scheduler-owned enable/observe/disable lifecycle.
3. US2: manual fallback preservation and overlap semantics.
4. US3: cursor-safe failure, partial, backoff, redaction, stale recovery.
5. US4: shared-repository owner selection and duplicate-prevention evidence.
6. Polish: docs, API index, guardrails, rollback, review packet, full verification.

### Verification Commands

```bash
pnpm test -- src/lib/__tests__/github-sync-lifecycle.test.ts
pnpm test -- src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts
pnpm test -- src/app/api/github/sync/__tests__/route.test.ts
pnpm test -- src/app/api/github/sync/control/__tests__/route.test.ts
pnpm test:e2e -- tests/e2e/spec-013a1-github-sync-automation.spec.ts
pnpm typecheck
pnpm lint
pnpm build
pnpm api:parity
pnpm test
pnpm test:e2e
pnpm api:parity && pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```
