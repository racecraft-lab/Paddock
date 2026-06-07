# Tasks: Harness-Gardening Drift Guards

**Input**: Design documents from `specs/012b-harness-gardening-guards/`, `docs/ai/specs/.process/SPEC-012B-design-concept.md`, `docs/ai/specs/.process/SPEC-012B-workflow.md`, and completed checklists.

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/harness-gardening-report.schema.json`, and all completed checklists.

**Tests**: Required. Start with RED fixture-backed tests before guard implementation.

**Scope**: Process/tooling only. No runtime product behavior, migrations, UI, API endpoint, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub writes, live Paddock task creation, auto-merge, live-state validation, network fetches, or automatic `specs/**` cleanup.

**Ratified reviewability exception**: The setup transition exception is carried forward for the task gate because SPEC-012B intentionally names fixture, contract, workflow, and harness-gardening process paths that trigger false-positive primary-surface heuristics. The completed scope-control checklist and consensus ratified this as one process/tooling surface only. Implementation remains limited to `scripts/spec-012b/**`, `specs/012b-harness-gardening-guards/**`, `package.json`, `scripts/check-guardrails.mjs`, `docs/ai/repo-knowledge-index.json`, and `AGENTS.md`; no runtime source, migration, UI/API, scheduler, dispatch, harness adapter, live mutation, or automatic cleanup surface is allowed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks.
- **[Story]**: User-story phase task label.
- Every task names exact file paths.

---

## Phase 1: RED Fixture Tests (TDD Setup)

**Purpose**: Create failing fixture-backed tests for every supported drift class and policy branch before implementation.

> Run each test task after writing it and confirm it fails for missing SPEC-012B implementation, not for syntax or fixture-shape errors.

- [X] T001 [P] Add RED fresh-fixture tests proving zero active findings for stale claims, missing evidence, feature flags, low-value tests, strict scope, source links, and cleanup eligibility in `scripts/spec-012b/__tests__/fresh-fixtures.test.mjs` with fixtures under `scripts/spec-012b/fixtures/fresh/`
- [X] T002 [P] Add RED hard stale-status and missing-evidence fixture tests in `scripts/spec-012b/__tests__/hard-status-evidence.test.mjs` with fixtures under `scripts/spec-012b/fixtures/hard/stale-status/` and `scripts/spec-012b/fixtures/hard/missing-evidence/`
- [X] T003 [P] Add RED hard stale-feature-flag and strict-scope fixture tests in `scripts/spec-012b/__tests__/hard-feature-flag-scope.test.mjs` with fixtures under `scripts/spec-012b/fixtures/hard/feature-flag/` and `scripts/spec-012b/fixtures/hard/strict-scope/`
- [X] T004 [P] Add RED broken required repo-owned source-link fixture tests in `scripts/spec-012b/__tests__/hard-source-links.test.mjs` with fixtures under `scripts/spec-012b/fixtures/hard/source-links/`
- [X] T005 [P] Add RED warning-policy fixture tests for deterministic low-value tests, unknown owners, freshness-only staleness, optional links, external URLs, and wiki-style links in `scripts/spec-012b/__tests__/warning-fixtures.test.mjs` with fixtures under `scripts/spec-012b/fixtures/warning/`
- [X] T006 [P] Add RED `specs/**` cleanup recommendation-only tests that assert no folder deletion or archive-state mutation in `scripts/spec-012b/__tests__/archive-cleanup-fixtures.test.mjs` with fixtures under `scripts/spec-012b/fixtures/warning/specs-cleanup/`
- [X] T007 [P] Add RED stable ID, normalized `owner_key`, deterministic sort, dedupe, sorted evidence/warning merge, and `error > warning` severity aggregation tests in `scripts/spec-012b/__tests__/dedupe-report.test.mjs` with fixtures under `scripts/spec-012b/fixtures/dedupe/`
- [X] T008 [P] Add RED JSON Schema, recommendation-parent equality, summary-count, and deterministic byte-for-byte JSON tests in `scripts/spec-012b/__tests__/report-contract.test.mjs` using `specs/012b-harness-gardening-guards/contracts/harness-gardening-report.schema.json`
- [X] T009 [P] Add RED sanitized error tests for every closed error code, oversize limits, `redacted` true/false behavior, optional detector skips, and fixture containment escapes in `scripts/spec-012b/__tests__/error-handling.test.mjs` with fixtures under `scripts/spec-012b/fixtures/errors/`
- [X] T010 [P] Add RED focused-command, report-path, guardrails-suite, unknown-suite, and SPEC-012A compatibility tests in `scripts/spec-012b/__tests__/guardrails-integration.test.mjs` covering `package.json`, `scripts/check-guardrails.mjs`, and `scripts/spec-012a/verify-repo-knowledge-index.mjs`

**Checkpoint**: RED fixture tests exist and fail before any implementation task starts.

---

## Phase 2: Foundational Guard Infrastructure

**Purpose**: Build shared process-only helpers required by all user stories.

- [X] T011 Create process-only script skeletons and fixture README boundaries in `scripts/spec-012b/harness-gardening-check.mjs`, `scripts/spec-012b/harness-gardening-report.mjs`, `scripts/spec-012b/check-scope-control.mjs`, and `scripts/spec-012b/fixtures/README.md`
- [X] T012 Implement report schema constants, closed drift-class enums, closed error-code enums, freshness defaults, size limits, and stable JSON formatting in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T013 Implement `stable_finding_id` hashing, deterministic sort, duplicate grouping, sorted unique evidence/warning merge, severity aggregation, and summary-count helpers in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T014 Implement owner derivation from repo knowledge exact path, longest prefix, link/source path, SPEC family, roadmap/path class, and unknown fallback in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T015 Implement safe repo-artifact and fixture readers with repo-relative path normalization, fixture containment-before-read, byte-limit checks, parse handling, and sanitized guard errors in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T016 Implement report contract validation and generator assertions for recommendation equality, `recommendation_id == stable_finding_id`, summary counts, and stable sorting in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T017 Implement deterministic JSON and Markdown report rendering, including default writes to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json` and `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`
- [X] T018 Implement CLI argument parsing, `--fixtures`, `--json`, `--as-of YYYY-MM-DD`, default local report paths, detector-status output, and hard-failure exit policy in `scripts/spec-012b/harness-gardening-check.mjs`

**Checkpoint**: Shared report, CLI, owner, safety, and fixture helpers are available for story detectors.

---

## Phase 3: User Story 1 - Detect High-Confidence Repo Drift (Priority: P1)

**Goal**: The guard deterministically detects repo-owned hard drift and fails CI with exact evidence and one narrow recommendation per finding.

**Independent Test**: Run `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures/hard --as-of 2026-06-06`; hard fixtures fail with stable findings, evidence, owners or owner warnings, and cleanup-task payloads.

### Implementation for User Story 1

- [X] T019 [US1] Implement stale PRD, roadmap, workflow, and autopilot status-pointer detection in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T020 [US1] Implement missing required evidence-marker detection for closeout fields, UAT run IDs, verification rows, and workflow evidence in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T021 [US1] Implement stale feature-flag contradiction detection for absent flags, unsafe defaults, enablement contradictions, and completed-evidence contradictions in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T022 [US1] Implement strict-scope drift detection for forbidden owned surfaces and missing strict-scope evidence in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T023 [US1] Implement source-of-truth link classification and broken required repo-owned link detection in `scripts/spec-012b/harness-gardening-check.mjs`
- [X] T024 [US1] Emit error-severity findings, hard-failure counts, detector statuses, and narrow remediation summaries for all hard-drift detectors in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T025 [US1] Verify fresh hard-drift fixture cases produce zero active findings by updating expectations in `scripts/spec-012b/fixtures/fresh/`
- [X] T026 [US1] Record US1 hard-drift fixture evidence in `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`

**Checkpoint**: User Story 1 is independently testable and does not require live HAL, GitHub, Paddock, database, service, scheduler, or runtime state.

---

## Phase 4: User Story 2 - Generate Narrow Cleanup Recommendations (Priority: P2)

**Goal**: Each finding produces exactly one deterministic non-mutating cleanup recommendation with owner metadata, Paddock import draft, optional GitHub export draft, and no live side effects.

**Independent Test**: Run fixture and JSON report tests for dedupe, owner derivation, schema validation, recommendation equality, deterministic sorting, and guardrail command integration.

### Implementation for User Story 2

- [X] T027 [US2] Implement the `harness_gardening_recommendation.v1` builder with copied parent fields and `recommendation_id == stable_finding_id` in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T028 [US2] Implement non-mutating `paddock_cleanup_task_import_draft.v1` payloads with `live_mutation: false`, inbox status, metadata, tags, and optional workspace/project hints in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T029 [US2] Implement optional export-only GitHub issue draft fields with `export_only: true`, `live_mutation: false`, repository, title, body, and proposed metadata in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T030 [US2] Implement recommendation dedupe so each stable finding ID emits exactly one active recommendation with merged evidence and warnings in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T031 [US2] Implement warning records for unknown owners while preserving recommendation emission and hard-drift failure causes in `scripts/spec-012b/harness-gardening-report.mjs`
- [X] T032 [US2] Add the single focused `spec:012b:harness-gardening` package script to `package.json` without adding new dependencies to `pnpm-lock.yaml`
- [X] T033 [US2] Register the separate `harness-gardening` suite in `scripts/check-guardrails.mjs` without deleting, renaming, or inlining `task-pipeline`, `spec-evidence-screenshots`, or `repo-knowledge-index`
- [X] T034 [US2] Preserve selected-suite behavior, full-suite behavior, and unknown-suite diagnostics listing `harness-gardening` plus existing suite keys in `scripts/check-guardrails.mjs`
- [X] T035 [US2] Leave `scripts/spec-012a/verify-repo-knowledge-index.mjs` unchanged and verify compatibility through assertions in `scripts/spec-012b/__tests__/guardrails-integration.test.mjs`
- [X] T036 [US2] Write deterministic default JSON and Markdown reports to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json` and `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`

**Checkpoint**: User Story 2 is independently testable and creates no live Paddock task, GitHub issue, label, assignment, milestone, project field, or apply-mode side effect.

---

## Phase 5: User Story 3 - Preserve Advisory Signals Without Blocking CI (Priority: P3)

**Goal**: Warning-level cleanup signals remain useful and deterministic without causing CI failures.

**Independent Test**: Run warning and fresh fixtures; warning fixtures emit recommendations with warning severity and fresh fixtures emit no active findings.

### Implementation for User Story 3

- [ ] T037 [US3] Implement deterministic fixture-backed low-value test warning detection only for no-assertion, snapshot-only/static fixture, and duplicate stale fixture patterns in `scripts/spec-012b/harness-gardening-check.mjs`
- [ ] T038 [US3] Implement freshness-only, optional-link, external-URL, and wiki-style source-link warning policy in `scripts/spec-012b/harness-gardening-check.mjs`
- [ ] T039 [US3] Implement `specs/**` cleanup eligibility as warning-level recommendation-only output with archive gate blockers in `scripts/spec-012b/harness-gardening-check.mjs`
- [ ] T040 [US3] Prove `specs/**` cleanup detection never deletes source folders, moves specs, mutates archive state, or invokes archive apply behavior by updating `scripts/spec-012b/__tests__/archive-cleanup-fixtures.test.mjs`
- [ ] T041 [US3] Implement static scope-control self-test fixtures for allowed paths, blocked paths, forbidden tokens, and docs/process exemptions in `scripts/spec-012b/check-scope-control.mjs` and `scripts/spec-012b/fixtures/scope-control/`
- [ ] T042 [US3] Implement static scope-control current-diff mode with changed-file allowlist, runtime/control-plane blocklist, changed-file counts, and scanned-entry counts in `scripts/spec-012b/check-scope-control.mjs`
- [ ] T043 [US3] Implement forbidden live-mutation/runtime token scanning for GitHub mutation, Paddock live task creation, scheduler, dispatch, claim/retry, sandbox, harness adapter, auto-merge, runtime feature flags, external OpenAI fetches, and archive delete/move/apply behavior in `scripts/spec-012b/check-scope-control.mjs`
- [ ] T044 [US3] Verify warning-only detectors do not increase hard-failure exit status by updating report expectations in `scripts/spec-012b/fixtures/warning/`

**Checkpoint**: User Story 3 is independently testable and all advisory findings remain warning-only unless another hard-drift rule applies.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Final docs, integration, scope, compatibility, and review evidence.

- [ ] T045 [P] Verify or update SPEC-012B discoverability entries for the design concept, workflow ledger, spec folder, and report artifacts in `docs/ai/repo-knowledge-index.json`
- [ ] T046 [P] Verify or update concise SPEC-012B pointers without premature command-success claims in `AGENTS.md`
- [ ] T047 [P] Update Phase 5 task-result evidence in `docs/ai/specs/.process/SPEC-012B-workflow.md`
- [ ] T048 Run `node scripts/spec-012b/check-scope-control.mjs --self-test` and record self-test evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T049 Run `node scripts/spec-012b/check-scope-control.mjs` in current-diff mode and record zero-failure changed-file and scanned-entry counts in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T050 Run `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06` and record hard-versus-warning fixture evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T051 Run `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06 --json` twice, compare byte-for-byte output, and record deterministic JSON evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T052 Run `pnpm guardrails -- --suite harness-gardening` and record focused-suite evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T053 Run `pnpm guardrails`, `pnpm knowledge:index:check`, and `pnpm guardrails -- --suite repo-knowledge-index`, then record compatibility evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T054 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `git diff --check`, then record verification evidence in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`
- [ ] T055 Finalize the PR review packet with what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, and rollback or feature-flag notes in `specs/012b-harness-gardening-guards/.process/pr-review-packet.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 RED Fixture Tests**: No dependencies. Must complete before implementation.
- **Phase 2 Foundational Guard Infrastructure**: Depends on Phase 1 RED tests being written and failing for expected missing implementation.
- **Phase 3 User Story 1**: Depends on Phase 2.
- **Phase 4 User Story 2**: Depends on Phase 2 and can run after shared report helpers exist; guardrail wiring can proceed in parallel with US1 detector implementation if file ownership is separated.
- **Phase 5 User Story 3**: Depends on Phase 2 and can run after shared warning/report helpers exist.
- **Phase 6 Polish & Cross-Cutting Verification**: Depends on selected user stories and all package/guardrail wiring.

### User Story Dependencies

- **US1 (P1)**: MVP. No dependency on US2 or US3 after Phase 2.
- **US2 (P2)**: Depends on shared report helpers from Phase 2. It can integrate with US1 findings but remains independently testable through dedupe/report fixtures.
- **US3 (P3)**: Depends on shared warning/report helpers from Phase 2. It does not depend on live-state or mutation behavior.

### Within Each User Story

- Confirm relevant RED tests fail before implementation.
- Implement the minimum detector/report behavior to pass fixtures.
- Re-run story-specific fixtures before proceeding.
- Preserve repo-artifact-only execution and process/tooling scope.

---

## Parallel Opportunities

- Phase 1 test files T001-T010 can be created in parallel because they use distinct test files and fixture folders.
- Foundational report helpers T012-T014 can proceed in parallel with safe-reader implementation T015 if module ownership is coordinated.
- US1 detector tasks are sequential by default because they share `scripts/spec-012b/harness-gardening-check.mjs`.
- US2 recommendation/report tasks T027-T031 share `scripts/spec-012b/harness-gardening-report.mjs`; package and guardrail tasks T032-T034 can be parallel once report behavior is stable.
- US3 warning detectors T037-T040 share `scripts/spec-012b/harness-gardening-check.mjs`; static scope-control tasks T041-T043 can proceed in parallel in `scripts/spec-012b/check-scope-control.mjs`.
- Polish docs tasks T045-T047 can run in parallel with command verification tasks after implementation is complete.

## Parallel Example: Phase 1 RED Tests

```text
Task: "Add RED hard stale-status and missing-evidence fixture tests in scripts/spec-012b/__tests__/hard-status-evidence.test.mjs"
Task: "Add RED warning-policy fixture tests in scripts/spec-012b/__tests__/warning-fixtures.test.mjs"
Task: "Add RED JSON Schema and deterministic output tests in scripts/spec-012b/__tests__/report-contract.test.mjs"
```

## Parallel Example: Integration Wiring

```text
Task: "Add the focused package script in package.json"
Task: "Register the harness-gardening suite in scripts/check-guardrails.mjs"
Task: "Verify or update SPEC-012B discoverability entries in docs/ai/repo-knowledge-index.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 RED tests and Phase 2 foundational helpers.
2. Complete US1 hard-drift detectors and hard-failure policy.
3. Validate with hard and fresh fixtures.
4. Stop and confirm no runtime/live-mutation scope entered the diff.

### Incremental Delivery

1. Add US1 hard-drift detection and fail-closed policy.
2. Add US2 recommendation payloads, dedupe, schema, package script, and guardrails integration.
3. Add US3 warning-only advisory detectors and static scope-control guard.
4. Complete Polish verification and PR review packet.

### G5 Readiness Check

- Tasks are TDD-first with RED fixtures before implementation.
- Every user story has an independent test path.
- `specs/**` cleanup remains recommendation-only.
- SPEC-012A `pnpm knowledge:index:check` compatibility is verified, not replaced.
- Static scope-control tasks explicitly guard against runtime, migration, UI/API, scheduler, dispatch, claim/retry, sandbox, harness adapter, live mutation, auto-merge, network-fetch, and archive-cleanup apply paths.
