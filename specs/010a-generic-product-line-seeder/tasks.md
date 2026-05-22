# Tasks: Generic Product-Line Seeder

**Input**: Design documents from `specs/010a-generic-product-line-seeder/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, completed checklists
**Tests**: Required. The feature specification, constitution, and workflow require TDD-first RED tests for config validation, no-mutation behavior, explicit existing-target policy, Mission Control parity, CLI contracts, wrapper compatibility, and static scope guardrails.
**Organization**: Tasks are grouped by user story to enable independent implementation and verification.

## Reviewability Gate Outcome

Ratified transition exception: `reviewability-gate.sh tasks specs/010a-generic-product-line-seeder` may exceed heuristic task-count and path-count block thresholds because SPEC-010A requires explicit TDD, no-mutation, compatibility-wrapper, redaction, static-guard, and operator-evidence tasks for one seed/config implementation surface. This exception is bounded by the plan's strict file list and split trigger: implementation must stay inside the generic seed/config library, CLI, Mission Control config, focused tests, and runbook evidence; any added production surface, migration, UI, runtime scheduler/runner/sandbox/harness behavior, Product Line B onboarding, or GitHub mutation must split out before implementation continues. The post-implementation diff reviewability gate remains required.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallel-safe only when the task owns a disjoint file or artifact and does not depend on an incomplete task.
- **[Story]**: User-story label for story phases only.
- Every task names at least one concrete path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the exact config, CLI, and strict-check ownership surface before story work begins.

- [x] T001 Add the generic `seed:product-line` script while preserving `seed:mission-control` in `package.json`.
- [x] T002 Register SPEC-010A production and test TypeScript files in `tsconfig.spec-strict.json`.
- [x] T003 Register SPEC-010A production and test TypeScript files in `eslint.config.mjs`.
- [x] T004 [P] Create the product-line config directory placeholder or ensure it exists for `docs/ai/product-lines/mission-control.yaml`.
- [x] T005 [P] Create empty product-line seed module index structure in `src/lib/product-line-seed/types.ts`.
- [x] T006 [P] Create empty product-line seed schema module in `src/lib/product-line-seed/schema.ts`.
- [x] T007 [P] Create empty product-line seed config loader module in `src/lib/product-line-seed/config.ts`.
- [x] T008 [P] Create empty product-line seed evidence module in `src/lib/product-line-seed/evidence.ts`.
- [x] T009 [P] Create empty product-line seed preflight module in `src/lib/product-line-seed/preflight.ts`.
- [x] T010 [P] Create empty product-line seed orchestration module in `src/lib/product-line-seed/seed.ts`.
- [x] T011 [P] Create empty generic CLI entrypoint in `scripts/seed-product-line.ts`.

**Verification commands**:

```bash
pnpm typecheck
pnpm lint
```

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared seed contracts and test harness primitives that every story depends on.

**Critical**: No user-story implementation starts until these tasks are complete.

- [x] T012 Define product-line seed config, result envelope, snapshot, mutation-status, validation-error, residue, and mode types in `src/lib/product-line-seed/types.ts`.
- [x] T013 Extract generic Mission Control seed validation constants and config-owned surface names from existing Mission Control seed assumptions into `src/lib/product-line-seed/types.ts`.
- [x] T014 Implement ordered JSON and SHA-256 snapshot hash helpers with redaction-safe input contracts in `src/lib/product-line-seed/evidence.ts`.
- [x] T015 Implement a reusable in-memory/disposable SQLite seed test harness covering config-owned and FR-020 preserved surfaces in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T016 Implement CLI invocation helper and output parsing helper for pnpm script entrypoints in `src/lib/__tests__/product-line-seed-cli.test.ts`.
- [x] T017 Add shared invalid-config fixture builders for YAML strings, parsed configs, target residue, and preserved operational state in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T018 Add shared static-scope guard helper for Product Line B, GitHub mutation, dispatch, claim, runner, sandbox, adapter, auto-merge, and SpecKit setup/autopilot strings in `src/lib/__tests__/product-line-seed.test.ts`.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
```

## Phase 3: User Story 1 - Review Product-Line Seed Config (Priority: P1)

**Goal**: Operators can review a checked-in Mission Control product-line seed config before any target state is mutated.

**Independent Test**: Review `docs/ai/product-lines/mission-control.yaml` and run focused config tests to confirm required sections, identity, GitHub ownership, workflow contract references, flags, assignments, governance defaults, and blocked side effects are represented without writes.

### Tests for User Story 1

- [x] T019 [US1] Write RED tests for required top-level sections, schema marker, unknown top-level fields, and duplicate declarations in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T020 [US1] Write RED tests for safe single-document YAML parsing that rejects custom tags, anchors, aliases, merge keys, multi-document streams, executable constructs, and remote references in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T021 [US1] Write RED tests for canonical Mission Control config coverage of identity, display name, agent prefix, GitHub ownership, workflow family/path/slugs, departments, assignments, flags, governance defaults, and safety policy in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T022 [US1] Write RED static tests proving `docs/ai/product-lines/mission-control.yaml` contains no Product Line B config, runtime work launch, GitHub mutation, dispatch, claim, runner, sandbox, adapter, auto-merge, or SpecKit setup/autopilot authorization in `src/lib/__tests__/product-line-seed.test.ts`.

### Implementation for User Story 1

- [x] T023 [US1] Implement JSON Schema constants for required product-line seed config shape and unknown-field rejection in `src/lib/product-line-seed/schema.ts`.
- [x] T024 [US1] Implement non-executing single-document YAML loading and unsafe syntax classification in `src/lib/product-line-seed/config.ts`.
- [x] T025 [US1] Implement semantic validation for schema version, required sections, duplicate declarations, conflicting declarations, unknown fields, and typed field errors in `src/lib/product-line-seed/config.ts`.
- [x] T026 [US1] Create the canonical Mission Control YAML seed config with reviewed required sections in `docs/ai/product-lines/mission-control.yaml`.
- [x] T027 [US1] Add reviewer-oriented comments or stable ordering only where needed to keep `docs/ai/product-lines/mission-control.yaml` human-reviewable without creating Product Line B examples.

**Checkpoint**: User Story 1 is complete when the Mission Control YAML config is reviewable and config validation tests pass without any database writes.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm typecheck
pnpm lint
```

## Phase 4: User Story 2 - Run Generic Preflight, Apply, And Verify (Priority: P1)

**Goal**: Operators can run generic `preflight`, `apply`, and `verify` modes and receive structured JSON evidence with explicit mutation boundaries.

**Independent Test**: Run the generic command against a safe target with the Mission Control config and confirm preflight reports safe state, apply writes only config-owned fields, verify is read-only, existing-target apply refuses without `--allow-existing`, and `--allow-existing` preserves FR-020 state.

### Tests for User Story 2

- [x] T028 [US2] Write RED CLI contract tests for `--config`, `--db`, `--mode preflight|apply|verify`, `--json`, `--allow-existing`, `--operator-evidence`, required flags, invalid modes, and unknown flag rejection in `src/lib/__tests__/product-line-seed-cli.test.ts`.
- [x] T029 [US2] Write RED preflight tests for identity, GitHub ownership, workflow contract, required slugs, feature flags, assignments, governance defaults, and target residue evidence in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T030 [US2] Write RED apply tests for empty safe target creation of workspace, departments, agent assignments, workflow template projection, feature flags, and governance defaults in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T031 [US2] Write RED verify tests proving matching targets are read-only and drifted targets return `VERIFY_DRIFT_DETECTED` with exit code 4 in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T032 [US2] Write RED existing-target tests for refusal without `--allow-existing` and config-owned-only updates with preserved tasks, task evidence/read-model state, issues, activities, histories, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit rows, manual workflow templates, row IDs, timestamps, counters, lineage, assignment timestamps, workflow use counters, and unrelated flags in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T033 [US2] Write RED operator-evidence tests proving raw operator evidence is never echoed, logged, snapshotted, or hashed in `src/lib/__tests__/product-line-seed-cli.test.ts`.

### Implementation for User Story 2

- [x] T034 [US2] Implement result envelope construction, redaction proof fields, stable statuses, action fields, and exit-code mapping in `src/lib/product-line-seed/evidence.ts`.
- [x] T035 [US2] Implement snapshot collection for config-owned seed surfaces and every FR-020 preserved operational/history subsurface in `src/lib/product-line-seed/evidence.ts`.
- [x] T036 [US2] Implement target-config-aware residue conflict detection with redacted evidence and no automatic deletion or unlinking in `src/lib/product-line-seed/preflight.ts`.
- [x] T037 [US2] Implement workflow contract family/path/required-slug validation through the existing importer source of truth in `src/lib/product-line-seed/config.ts`.
- [x] T038 [US2] Implement feature flag registry validation, disabled/absent reserved future flags, duplicates, conflicts, cascade prerequisite, and env force-off checks in `src/lib/product-line-seed/config.ts`.
- [x] T039 [US2] Implement agent prefix, agent key, department mapping, derived agent name, and shared support validation in `src/lib/product-line-seed/config.ts`.
- [x] T040 [US2] Implement governance defaults validation using existing `resource_policies` field expectations and first-intake-blocking safeguards in `src/lib/product-line-seed/config.ts`.
- [x] T041 [US2] Implement generic preflight/apply/verify orchestration, pre-write fail-closed behavior, one-transaction apply, and read-only verify in `src/lib/product-line-seed/seed.ts`.
- [x] T042 [US2] Implement config-owned field projection for workspaces, projects, project agent assignments, workflow templates, feature flags, and governance defaults in `src/lib/product-line-seed/seed.ts`.
- [x] T043 [US2] Implement generic CLI parsing, mode dispatch, JSON output, redacted unexpected errors, and process exit behavior in `scripts/seed-product-line.ts`.

**Checkpoint**: User Story 2 is complete when the generic CLI supports preflight/apply/verify and all mutation boundaries are backed by structured evidence.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-safe.db --mode preflight --json
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-safe.db --mode apply --json
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-safe.db --mode verify --json
```

## Phase 5: User Story 3 - Prove Mission Control Parity (Priority: P1)

**Goal**: Maintainers can prove the generic Mission Control config reproduces SPEC-009B behavior and that the compatibility wrapper produces equivalent evidence.

**Independent Test**: Apply the generic Mission Control config once, apply it again with `--allow-existing`, run verify, and compare evidence with the compatibility wrapper for the same target and mode.

### Tests for User Story 3

- [x] T044 [US3] Write RED parity tests for Mission Control identity, departments, agent assignments, GitHub ownership, workflow families, required workflow slugs, feature flags, governance defaults, and non-dispatch boundaries in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T045 [US3] Write RED apply-twice idempotency tests proving no duplicate workspace, department, assignment, workflow, governance, or config-owned feature-flag records in `src/lib/__tests__/product-line-seed.test.ts`.
- [x] T046 [US3] Write RED compatibility wrapper tests proving `seed:mission-control` delegates to the canonical config and matches generic evidence categories for preflight, apply, verify, refusal, and `--allow-existing` in `src/lib/__tests__/product-line-seed-cli.test.ts`.

### Implementation for User Story 3

- [x] T047 [US3] Modify the compatibility wrapper to delegate to generic product-line seed behavior with `docs/ai/product-lines/mission-control.yaml` in `scripts/seed-mission-control-product-line.ts`.
- [x] T048 [US3] Preserve the existing `seed:mission-control` command name and core flags while routing to generic existing-target policy in `package.json`.
- [x] T049 [US3] Add stable parity evidence assertions for the Mission Control config path, result envelope, snapshot counts, and apply-twice hashes in `src/lib/product-line-seed/evidence.ts`.
- [x] T050 [US3] Record Mission Control apply-once, apply-twice, verify, and wrapper parity evidence instructions in `specs/010a-generic-product-line-seeder/quickstart.md`.

**Checkpoint**: User Story 3 is complete when Mission Control parity evidence is reproducible through both generic and compatibility entrypoints.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-parity.db --mode apply --json
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-parity.db --mode apply --allow-existing --json
pnpm seed:product-line -- --config docs/ai/product-lines/mission-control.yaml --db .data/spec-010a-parity.db --mode verify --json
pnpm seed:mission-control -- --db .data/spec-010a-parity.db --mode verify --json
```

## Phase 6: User Story 4 - Fail Closed For Unsafe Configs (Priority: P2)

**Goal**: Operators can trust incomplete, unsafe, or target-conflicting configs to fail before mutation with structured errors and no-mutation proof.

**Independent Test**: Run invalid config fixtures through preflight/apply/verify and confirm structured field/path errors, stable codes, before/after snapshots, and unchanged config-owned plus FR-020 preserved state.

### Tests for User Story 4

- [ ] T051 [US4] Write RED tests for missing identity, missing GitHub ownership, unsupported fields, invalid types, duplicate declarations, and conflicting declarations in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T052 [US4] Write RED tests for unsupported workflow family, invalid path, parse failure, missing required slug, ambiguous slug, repo mismatch, and template ownership conflict in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T053 [US4] Write RED tests for unknown enabled flags, unknown disabled/absent flags, duplicate flags, enabled/disabled conflicts, reserved future flags true in target state, env force-off, and missing cascade prerequisites in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T054 [US4] Write RED tests for invalid departments, department GitHub repo mismatch, invalid agent prefix, invalid agent key, missing assignment department, and invalid shared support assignment in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T055 [US4] Write RED tests for unsafe first-intake-blocking governance defaults without explicit allowance and per-policy reason in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T056 [US4] Write RED tests for target repository conflict, target product-line conflict, residue blocking, and redaction-safe cleanup evidence in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T057 [US4] Write RED no-mutation snapshot tests comparing `snapshot_before` and `snapshot_after` for validation failures, blocked preflight, and existing-target refusal in `src/lib/__tests__/product-line-seed.test.ts`.

### Implementation for User Story 4

- [ ] T058 [US4] Complete validation error code mapping and config path or field path evidence for all contract codes in `src/lib/product-line-seed/config.ts`.
- [ ] T059 [US4] Complete no-mutation snapshot comparison and `NO_MUTATION_PROOF_FAILED` handling in `src/lib/product-line-seed/evidence.ts`.
- [ ] T060 [US4] Complete blocked preflight result construction for existing-target refusal, residue conflict, unsafe governance, contract-not-ready, validation failure, CLI error, and unexpected errors in `src/lib/product-line-seed/preflight.ts`.

**Checkpoint**: User Story 4 is complete when all unsafe config classes fail closed before writes and emit redacted structured no-mutation evidence.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
```

## Phase 7: User Story 5 - Reuse Seeder For Future Product Lines (Priority: P3)

**Goal**: Future implementers can reuse the schema and command surface through config values only, while SPEC-010A remains limited to Mission Control parity.

**Independent Test**: Review docs and static guardrails to confirm reusable schema/fixtures/commands exist and no Product Line B onboarding output, live target enablement, GitHub mutation, or runtime execution surface was added.

### Tests for User Story 5

- [ ] T061 [US5] Write RED static/diff guard tests for no Product Line B config, smoke evidence, live enablement, GitHub mutation, task creation, dispatch, claim, runner, sandbox, harness adapter, auto-merge, or SpecKit setup/autopilot in `src/lib/__tests__/product-line-seed.test.ts`.
- [ ] T062 [US5] Write RED docs coverage tests or checklist assertions for schema, command modes, evidence shape, existing-target policy, residue blocking, wrapper path, Product Line B exclusion, rollback-by-no-op, and implementation validation in `src/lib/__tests__/product-line-seed.test.ts`.

### Implementation for User Story 5

- [ ] T063 [US5] Document schema, command modes, evidence shape, existing-target policy, residue blocking policy, Mission Control wrapper, Product Line B exclusion, and rollback-by-no-op in `docs/runbooks/product-line-seed.md`.
- [ ] T064 [US5] Update Mission Control seed predeploy guidance for the compatibility wrapper and generic evidence model in `docs/runbooks/mission-control-seed-predeploy.md`.
- [ ] T065 [US5] Keep implementation validation, Mission Control parity commands, invalid-config no-mutation commands, and static guard commands current in `specs/010a-generic-product-line-seeder/quickstart.md`.

**Checkpoint**: User Story 5 is complete when a future product-line config can be reasoned about from the checked-in schema/docs while SPEC-010A contains no Product Line B or runtime execution behavior.

**Verification commands**:

```bash
rg -n "Product Line B|product-line-b|focusengine|createTask\\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|runner|sandbox|auto.?merge|speckit-setup|speckit-autopilot" docs/ai/product-lines scripts/seed-product-line.ts scripts/seed-mission-control-product-line.ts src/lib/product-line-seed src/lib/__tests__/product-line-seed*.test.ts
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
```

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: Final evidence, reviewability, and repository guardrails across all user stories.

- [ ] T066 Run focused product-line seed tests and record pass/fail evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T067 Run CLI parity commands for preflight, apply, apply `--allow-existing`, verify, wrapper verify, and existing-target refusal and record evidence references in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T068 Run static scope guard command and record Product Line B/runtime/GitHub mutation exclusion evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T069 Run migration/dependency guard review proving no migration and no new runtime dependency in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T070 Run `pnpm typecheck` and record pass/fail evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T071 Run `pnpm lint` and record pass/fail evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T072 Run `pnpm build` and record pass/fail evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.
- [ ] T073 Run `pnpm test:all` when branch policy requires full verification and record pass/fail evidence in `specs/010a-generic-product-line-seeder/quickstart.md`.

**Verification commands**:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
pnpm typecheck
pnpm lint
pnpm build
pnpm test:all
```

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 US1**: Depends on Phase 2; config reviewability is the MVP.
- **Phase 4 US2**: Depends on Phase 2 and benefits from US1 config shape; can begin once schema contracts are stable.
- **Phase 5 US3**: Depends on US1 and US2 because parity requires the canonical config and generic CLI behavior.
- **Phase 6 US4**: Depends on Phase 2 and can run alongside US2 implementation after shared validator contracts exist.
- **Phase 7 US5**: Depends on US1 through US4 behavior and evidence contracts.
- **Phase 8 Polish**: Depends on all selected user stories.

### User Story Dependencies

- **US1 (P1)**: MVP; no dependencies beyond Foundational.
- **US2 (P1)**: Depends on Foundational and the US1 config/schema direction.
- **US3 (P1)**: Depends on US1 and US2.
- **US4 (P2)**: Depends on Foundational; can be developed in parallel with parts of US2 only if file ownership is coordinated.
- **US5 (P3)**: Depends on completed behavior from US1 through US4.

### Within Each User Story

- RED tests are written first and must fail before implementation.
- Config/schema validation comes before write-capable seed orchestration.
- Preflight and no-mutation evidence come before apply behavior.
- Apply behavior comes before verify and parity evidence.
- Wrapper compatibility follows generic CLI behavior.

## Parallel Opportunities

- Phase 1 file scaffolding tasks T004 through T011 are parallel-safe because each owns a different file or directory.
- Phase 3 US1 tests T019 through T022 are not marked parallel because they share `src/lib/__tests__/product-line-seed.test.ts`.
- Phase 4 CLI tests T028 and T033 use `src/lib/__tests__/product-line-seed-cli.test.ts`; seed behavior tests T029 through T032 use `src/lib/__tests__/product-line-seed.test.ts`; they can be split by file owner even though they are not marked `[P]` due to sequential RED ordering.
- Phase 4 implementation can split by owned files after tests fail: evidence `src/lib/product-line-seed/evidence.ts`, preflight `src/lib/product-line-seed/preflight.ts`, config validation `src/lib/product-line-seed/config.ts`, seed orchestration `src/lib/product-line-seed/seed.ts`, and CLI `scripts/seed-product-line.ts`.
- Phase 5 wrapper work in `scripts/seed-mission-control-product-line.ts` can proceed in parallel with evidence refinements in `src/lib/product-line-seed/evidence.ts` after generic CLI behavior is stable.
- Phase 7 documentation tasks T063 through T065 can be split by file owner after behavior and evidence names stop changing.

## Parallel Example: Disjoint File Owners After Foundational

```bash
Task: "Implement result envelope construction in src/lib/product-line-seed/evidence.ts"
Task: "Implement target-config-aware residue conflict detection in src/lib/product-line-seed/preflight.ts"
Task: "Implement generic CLI parsing in scripts/seed-product-line.ts"
Task: "Document schema and command modes in docs/runbooks/product-line-seed.md"
```

## Implementation Strategy

### MVP First: User Story 1

1. Complete Phase 1 and Phase 2.
2. Write RED config validation and canonical config tests.
3. Implement schema, safe YAML loading, semantic validation, and Mission Control YAML.
4. Verify with focused Vitest, typecheck, and lint.

### Incremental Delivery

1. Deliver US1 reviewable config.
2. Deliver US2 generic preflight/apply/verify.
3. Deliver US3 Mission Control parity and wrapper compatibility.
4. Deliver US4 unsafe-config fail-closed coverage.
5. Deliver US5 reuse docs and scope guardrails.

### Final Verification

Run focused tests first, then repository checks:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
pnpm typecheck
pnpm lint
pnpm build
pnpm test:all
```
