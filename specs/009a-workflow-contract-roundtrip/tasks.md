---
description: "Task list for SPEC-009A Workflow Contract Format and Roundtrip"
---

# Tasks: SPEC-009A Workflow Contract Format and Roundtrip

**Input**: Design documents from `/specs/009a-workflow-contract-roundtrip/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md, and four Phase 4 checklists.

**Tests**: Tests are mandatory. Implementation must follow RED/GREEN/REFACTOR: write the listed failing tests first, confirm the focused test fails for the expected reason, implement the smallest production code, then rerun the focused test and broader verification.

**Organization**: Tasks are grouped by the six user stories in `spec.md`. Foundation tasks block all user-story implementation. User-story tasks remain independently testable and do not activate product-line seed, claim/reconciliation, dispatch, runner, sandbox lifecycle, harness adapter, or governance enforcement behavior.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallel-safe, different files, no dependency on incomplete tasks.
- **[Story]**: User story tag, US1 through US6.
- **[T-RED]**: Test-first task; the focused test must fail before paired implementation.
- Every task includes an exact file path.

## Path Conventions

- Workflow-contract library: `src/lib/workflow-contracts/`
- Unit tests: `src/lib/__tests__/workflow-contracts/`
- Diagnostics API: `src/app/api/workflow-contracts/diagnostics/route.ts`
- Diagnostics UI: `src/components/panels/orchestration-bar.tsx` plus extracted workflow-contract component files if needed.
- CLI entrypoint: `scripts/workflow-contracts/workflow-contract-cli.ts` executed by `node --experimental-strip-types` from the package script; do not add `tsx` or `ts-node`.
- Canonical contract: `docs/ai/workflows/mission-control/workflow-contract.yaml`
- Generated review export: `docs/ai/workflows/mission-control/exports/workflow-contract.md`
- Migrations and rollback: `src/lib/migrations.ts`, `docs/migrations/rollback-M71.sql`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add direct dependency, script wiring, canonical fixture locations, migration shell, and strict-scope entries before feature code.

- [ ] T001 Add exact direct production dependency `yaml@2.8.2` to `package.json` and `pnpm-lock.yaml`.
- [ ] T002 Add `workflow-contract` script to `package.json` that runs `node --experimental-strip-types scripts/workflow-contracts/workflow-contract-cli.ts` without adding `tsx` or `ts-node`.
- [ ] T003 [P] Create canonical Mission Control workflow contract fixture at `docs/ai/workflows/mission-control/workflow-contract.yaml`.
- [ ] T004 [P] Create invalid contract fixture directory `src/lib/__tests__/workflow-contracts/fixtures/`.
- [ ] T005 Add additive migration `071_workflow_contract_diagnostics` to `src/lib/migrations.ts`.
- [ ] T006 [P] Add rollback SQL for M71 in `docs/migrations/rollback-M71.sql`.
- [ ] T007 Add SPEC-009A-owned TypeScript paths to `tsconfig.spec-strict.json` and matching lint scope in `eslint.config.mjs`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Typed model, parser wrapper, schema profile, hash envelope, diff engine, and shared diagnostics primitives. No user story can be implemented before this phase is complete.

- [ ] T008 [P] [T-RED] Author YAML loader red tests in `src/lib/__tests__/workflow-contracts/yaml-loader.test.ts` covering valid YAML, invalid YAML, multi-doc, non-mapping root, duplicate keys, custom tags, anchors, aliases, merge keys, and literal block scalar enforcement.
- [ ] T009 [P] [T-RED] Author validator red tests in `src/lib/__tests__/workflow-contracts/validator.test.ts` covering unknown fields, unknown variables, tracker identity, capabilities, adapter requirements, feature-flag dependencies, governance, concurrency, retry, sandbox, prompt version, routing hash, and output schema hash.
- [ ] T010 [P] [T-RED] Author hash red tests in `src/lib/__tests__/workflow-contracts/hash.test.ts` covering `workflow-contract-hash-v1`, stable sorted JSON, LF prompt normalization, excluded timestamps/row ids/diagnostic ids/local paths/Markdown bytes, routing-rule hashes, and output-schema hashes.
- [ ] T011 [P] [T-RED] Author diff red tests in `src/lib/__tests__/workflow-contracts/diff.test.ts` covering create, update, disable, unchanged, and unrelated template preservation.
- [ ] T012 Create canonical workflow contract model types in `src/lib/workflow-contracts/types.ts`.
- [ ] T013 Implement YAML loading and prompt scalar validation in `src/lib/workflow-contracts/yaml-loader.ts`.
- [ ] T014 Implement schema construction and existing AJV strict-profile reuse in `src/lib/workflow-contracts/schema.ts` and `src/lib/workflow-contracts/validator.ts`.
- [ ] T015 Implement canonical hash envelope and per-template hash helpers in `src/lib/workflow-contracts/hash.ts`.
- [ ] T016 Implement contract diff classification in `src/lib/workflow-contracts/diff.ts`.
- [ ] T017 Implement shared error, redaction, and result helpers in `src/lib/workflow-contracts/errors.ts`.
- [ ] T018 Implement diagnostics persistence primitives in `src/lib/workflow-contracts/diagnostics.ts`.

**Checkpoint**: Parser, validator, hashing, diffing, and diagnostics primitives have focused GREEN tests and no runtime mutation path.

---

## Phase 3: User Story 1 - Preview Contract Changes (Priority: P1)

**Goal**: Operator can run import dry-run and inspect exact template diff without mutating runtime data.

**Independent Test**: `pnpm exec vitest run src/lib/__tests__/workflow-contracts/importer.test.ts -t "dry-run"` shows validation and diff output while `workflow_templates` rows remain unchanged.

### Tests for User Story 1

- [ ] T019 [P] [US1] [T-RED] Author dry-run importer tests in `src/lib/__tests__/workflow-contracts/importer.test.ts` proving default import computes diff, mutates no `workflow_templates` or snapshots, and persists a reusable diagnostics run summary and diff record for operator visibility.
- [ ] T020 [P] [US1] [T-RED] Author CLI dry-run tests in `src/lib/__tests__/workflow-contracts/cli.test.ts` proving default mode, `--dry-run`, deterministic success output, deterministic validation exit code, and redacted/truncated CLI validation details.

### Implementation for User Story 1

- [ ] T021 [US1] Implement dry-run import orchestration in `src/lib/workflow-contracts/importer.ts`.
- [ ] T022 [US1] Implement CLI argument parsing and import dry-run command in `scripts/workflow-contracts/workflow-contract-cli.ts`.
- [ ] T023 [US1] Wire CLI execution through `package.json` script `workflow-contract`.
- [ ] T024 [US1] Document dry-run usage and output in `specs/009a-workflow-contract-roundtrip/quickstart.md`.

**Checkpoint**: US1 is independently testable with dry-run import and no runtime mutation.

---

## Phase 4: User Story 2 - Apply Valid Contract Transactionally (Priority: P1)

**Goal**: Operator can explicitly apply a valid contract transactionally while preserving unrelated workflow templates and recording last-known-good state.

**Independent Test**: `pnpm exec vitest run src/lib/__tests__/workflow-contracts/importer.test.ts -t "apply"` shows owned-template upsert, unrelated preservation, rollback on failure, diagnostics write, and last-known-good snapshot write in one transaction.

### Tests for User Story 2

- [ ] T025 [P] [US2] [T-RED] Extend `src/lib/__tests__/workflow-contracts/importer.test.ts` with apply transaction, rollback, idempotent upsert by workspace plus slug, and unrelated-template preservation cases.
- [ ] T026 [P] [US2] [T-RED] Author last-known-good snapshot tests in `src/lib/__tests__/workflow-contracts/recovery.test.ts`.

### Implementation for User Story 2

- [ ] T027 [US2] Implement apply-mode transaction in `src/lib/workflow-contracts/importer.ts`.
- [ ] T028 [US2] Implement last-known-good snapshot writes and deterministic recovery command storage in `src/lib/workflow-contracts/recovery.ts`.
- [ ] T029 [US2] Implement diagnostics writes for import dry-run success, apply success, validation failure, storage failure, transaction rollback status, export success/failure, and recovery dry-run/apply outcomes in `src/lib/workflow-contracts/diagnostics.ts`.
- [ ] T030 [US2] Add `--apply` and mutually exclusive mode validation to `scripts/workflow-contracts/workflow-contract-cli.ts`.
- [ ] T031 [US2] Add M71 migration test coverage in `src/lib/__tests__/migrations-009a.test.ts`.

**Checkpoint**: US2 applies valid contracts transactionally and leaves pre-existing workflow behavior untouched unless explicit apply is used.

---

## Phase 5: User Story 3 - Export Reviewable Markdown With Roundtrip Parity (Priority: P1)

**Goal**: Operator can export contract-owned runtime templates to deterministic Markdown review output and verify no-op parity through stable hashes.

**Independent Test**: `pnpm exec vitest run src/lib/__tests__/workflow-contracts/exporter.test.ts` proves repeated export ordering and hashes are stable and Markdown bytes are not canonical hash input.

### Tests for User Story 3

- [ ] T032 [P] [US3] [T-RED] Author exporter tests in `src/lib/__tests__/workflow-contracts/exporter.test.ts` covering deterministic ordering, default output path, Markdown-as-review-output behavior, and redaction/truncation in generated Markdown.
- [ ] T033 [P] [US3] [T-RED] Author no-op parity tests in `src/lib/__tests__/workflow-contracts/hash.test.ts` covering three consecutive unchanged import/export cycles.

### Implementation for User Story 3

- [ ] T034 [US3] Implement runtime-to-canonical export in `src/lib/workflow-contracts/exporter.ts`.
- [ ] T035 [US3] Implement Markdown review renderer in `src/lib/workflow-contracts/exporter.ts`.
- [ ] T036 [US3] Add `export` command and default output path handling to `scripts/workflow-contracts/workflow-contract-cli.ts`.
- [ ] T037 [US3] Generate review export at `docs/ai/workflows/mission-control/exports/workflow-contract.md`.

**Checkpoint**: US3 produces deterministic Markdown review output and stable canonical parity hashes.

---

## Phase 6: User Story 4 - Fail Closed And Recover From Last Known Good (Priority: P1)

**Goal**: Invalid contracts fail before mutation and operators can dry-run then explicitly apply last-known-good recovery.

**Independent Test**: `pnpm exec vitest run src/lib/__tests__/workflow-contracts/validator.test.ts src/lib/__tests__/workflow-contracts/recovery.test.ts` rejects every invalid fixture before mutation and proves LKG remains available after failed reload/import.

### Tests for User Story 4

- [ ] T038 [P] [US4] [T-RED] Add invalid YAML and invalid model fixtures under `src/lib/__tests__/workflow-contracts/fixtures/`.
- [ ] T039 [P] [US4] [T-RED] Extend `src/lib/__tests__/workflow-contracts/validator.test.ts` for unknown variable, invalid tracker identity, invalid capability/adapter requirement, invalid feature-flag dependency, invalid governance/concurrency/retry/sandbox, and hash mismatch fixtures.
- [ ] T040 [P] [US4] [T-RED] Extend `src/lib/__tests__/workflow-contracts/recovery.test.ts` for no snapshot, dry-run recovery, explicit apply recovery, and LKG preservation after failed reload/import.

### Implementation for User Story 4

- [ ] T041 [US4] Implement stable validation error codes, paths, template slug, hints, mutation status, and redacted/truncated details in `src/lib/workflow-contracts/errors.ts`.
- [ ] T042 [US4] Implement recovery dry-run and explicit apply behavior in `src/lib/workflow-contracts/recovery.ts`.
- [ ] T043 [US4] Add `recover` command and exit codes to `scripts/workflow-contracts/workflow-contract-cli.ts`.
- [ ] T044 [US4] Add fail-closed and recovery examples to `specs/009a-workflow-contract-roundtrip/quickstart.md`.

**Checkpoint**: US4 rejects invalid input before mutation and preserves recoverable last-known-good state.

---

## Phase 7: User Story 5 - Inspect Workflow Contract Diagnostics (Priority: P2)

**Goal**: Admin can inspect reusable read-only workflow-contract diagnostics in the existing Orchestration/Workflows surface.

**Independent Test**: `pnpm exec vitest run src/app/api/workflow-contracts/diagnostics/route.test.ts src/components/panels/orchestration-bar.test.tsx` and `pnpm test:e2e tests/e2e/workflow-contract-diagnostics.spec.ts` show successful, changed, invalid, and no-last-known-good states without edit/apply/dispatch controls.

### Tests for User Story 5

- [ ] T045 [P] [US5] [T-RED] Author diagnostics API tests in `src/app/api/workflow-contracts/diagnostics/route.test.ts` covering filterable read-only data, persisted run errors, and redacted/truncated details.
- [ ] T046 [P] [US5] [T-RED] Author diagnostics UI tests in `src/components/panels/orchestration-bar.test.tsx` covering successful, changed, invalid, no-last-known-good, and redacted/truncated error states.
- [ ] T047 [P] [US5] [T-RED] Author Playwright diagnostics journey in `tests/e2e/workflow-contract-diagnostics.spec.ts` proving no edit/apply/dispatch/governance controls and no raw prompt body, credential, token, or secret-like value appears.

### Implementation for User Story 5

- [ ] T048 [US5] Implement read-only diagnostics API route in `src/app/api/workflow-contracts/diagnostics/route.ts` and update `openapi.json` plus `src/app/api/index/route.ts` for API parity.
- [ ] T049 [US5] Implement read-only diagnostics surface in `src/components/panels/orchestration-bar.tsx`.
- [ ] T050 [US5] Add deterministic diagnostics seed helpers for tests in `tests/e2e/fixtures/workflow-contract-diagnostics.ts`.
- [ ] T051 [US5] Verify UI exposes no import apply, manifest edit, workflow launch, dispatch, or governance override controls in `tests/e2e/workflow-contract-diagnostics.spec.ts`.

**Checkpoint**: US5 diagnostics are visible, reusable, and read-only.

---

## Phase 8: User Story 6 - Declare Future Runtime Policy As Data (Priority: P3)

**Goal**: Future runtime implementers can rely on provider-neutral capability, adapter, governance, concurrency, retry, sandbox, and hash declarations without SPEC-009A launching work or coupling to its spec ID.

**Independent Test**: `pnpm exec vitest run src/lib/__tests__/workflow-contracts/guardrails.test.ts` proves declarations are validated and roundtripped as data while forbidden runtime paths are not invoked.

### Tests for User Story 6

- [ ] T052 [P] [US6] [T-RED] Author guardrail tests in `src/lib/__tests__/workflow-contracts/guardrails.test.ts` proving no product-line seed, GitHub ingest/sync, claim loop, dispatch loop, runner launch, sandbox lifecycle, harness adapter, or resource-governance evaluator invocation.
- [ ] T053 [P] [US6] [T-RED] Extend `src/lib/__tests__/workflow-contracts/validator.test.ts` to assert future feature flags and governance fields remain inert validated data.

### Implementation for User Story 6

- [ ] T054 [US6] Complete validation and roundtrip support for capabilities, adapter requirements, future feature flags, governance, concurrency, retry, sandbox, prompt version, routing hash, and output schema hash in `src/lib/workflow-contracts/validator.ts`.
- [ ] T055 [US6] Add generic, spec-ID-independent naming for diagnostics family, contract hash version, and workflow family constants in `src/lib/workflow-contracts/types.ts`.
- [ ] T056 [US6] Add static guardrail checks to `src/lib/__tests__/workflow-contracts/guardrails.test.ts` for forbidden imports and side-effect paths.

**Checkpoint**: US6 validates future runtime policy as durable contract data without activating later-spec behavior.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, status sync, final verification, GitNexus refresh, and task completion evidence.

- [ ] T057 [P] Update `docs/ai/rc-factory-technical-roadmap.md` with SPEC-009A implementation status and downstream dependency notes.
- [ ] T058 [P] Update `docs/ai/specs/SPEC-009A-workflow.md` Phase 5/6/7 results and implementation evidence.
- [ ] T059 [P] Update `AGENTS.md` active technologies/recent changes if implementation scope changes from the plan.
- [ ] T060 Run focused workflow-contract unit tests with `direnv exec . pnpm exec vitest run src/lib/__tests__/workflow-contracts src/app/api/workflow-contracts/diagnostics/route.test.ts src/components/panels/orchestration-bar.test.tsx`.
- [ ] T061 Run diagnostics Playwright test with `direnv exec . pnpm test:e2e -- tests/e2e/workflow-contract-diagnostics.spec.ts`.
- [ ] T062 Run `direnv exec . pnpm typecheck`, `direnv exec . pnpm lint`, `direnv exec . pnpm api:parity`, and `direnv exec . pnpm build`.
- [ ] T063 Run guardrail grep/tests confirming no pilot, seed, claim, dispatch, runner, sandbox lifecycle, harness adapter, GitHub sync, or governance evaluator execution path was introduced by SPEC-009A.
- [ ] T064 Refresh GitNexus index with embeddings using `direnv exec . gitnexus analyze --skills --embeddings --skip-agents-md` and copy `.gitnexus/` to the primary repo root.
- [ ] T065 Mark all completed tasks in `specs/009a-workflow-contract-roundtrip/tasks.md` and record verification evidence in `docs/ai/specs/SPEC-009A-workflow.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 through US4 (P1)**: Depend on Foundational and should run in order because apply/export/recovery build on the shared importer/exporter model.
- **US5 (P2)**: Depends on diagnostics persistence from US2/US4.
- **US6 (P3)**: Depends on validator and hash model from Foundation and should complete before final guardrail verification.
- **Polish**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1**: Foundation only.
- **US2**: Foundation plus US1 diff/import path.
- **US3**: Foundation plus US1/US2 canonical import and runtime projection.
- **US4**: Foundation plus US2 last-known-good persistence.
- **US5**: Diagnostics tables and diagnostics primitives from US2/US4.
- **US6**: Foundation validator and roundtrip support; no dependency on UI.

### Parallel Opportunities

- Setup tasks T003, T004, T006 can run in parallel.
- Foundational red tests T008 through T011 can run in parallel before implementation.
- US1 tests T019 and T020 can run in parallel.
- US2 tests T025 and T026 can run in parallel.
- US3 tests T032 and T033 can run in parallel.
- US4 fixture/test tasks T038 through T040 can run in parallel.
- US5 tests T045 through T047 can run in parallel.
- US6 tests T052 and T053 can run in parallel.
- Polish doc updates T057 through T059 can run in parallel after implementation is verified.

---

## Parallel Example: Foundation

```bash
Task: "Author YAML loader red tests in src/lib/__tests__/workflow-contracts/yaml-loader.test.ts"
Task: "Author validator red tests in src/lib/__tests__/workflow-contracts/validator.test.ts"
Task: "Author hash red tests in src/lib/__tests__/workflow-contracts/hash.test.ts"
Task: "Author diff red tests in src/lib/__tests__/workflow-contracts/diff.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Complete US1 dry-run import.
3. Validate US1 independently before apply/export/recovery work.

### Incremental Delivery

1. US1 dry-run import proves no mutation.
2. US2 explicit apply adds transactional mutation and last-known-good snapshot.
3. US3 export proves roundtrip parity.
4. US4 invalid fixtures and recovery prove fail-closed behavior.
5. US5 diagnostics makes the state visible.
6. US6 hardens future-spec declarations as inert data.

### Completion Rule

All tasks must be checked off only after focused test evidence and broader verification evidence are recorded. G7 passes only when every task entry is marked complete.
