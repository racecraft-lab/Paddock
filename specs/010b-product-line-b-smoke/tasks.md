# Tasks: Product Line B Onboarding Smoke

**Input**: Design documents from `specs/010b-product-line-b-smoke/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `docs/ai/specs/SPEC-010B-design-concept.md`

**Tests**: Required. SPEC-010B follows TDD. RED tests come first for Product Line B config validation, no-mutation preflight, disabled lifecycle, synthetic smoke, Product Line A isolation, and scope guardrails.

**Reviewability**: Target stays inside the accepted SPEC-010B budget: primary surface seed/config; secondary surfaces docs/process and narrow smoke evidence; projected 450-700 reviewable LOC; 4-6 production files; 8-12 total files. Stop and split if implementation expands into scheduler/claim/retry, runner state, sandbox lifecycle, harness adapter implementation, runtime-inventory eligibility, auto-merge, or broad dashboard redesign.

**Hard Boundaries**:

- Do not edit `src/lib/harness-adapters/**`.
- Do not edit `src/app/api/agents/runtime-inventory/**`.
- Do not edit `src/lib/task-dispatch.ts`.
- Do not edit `src/lib/task-dispatch-codex-app-server.ts`.
- Do not edit `scripts/spec-014c/**`.
- Do not edit SPEC-014C artifacts.
- Runtime-inventory `eligible` is optional read-only support evidence only and is not a closeout requirement.
- Product Line B logical agents are `plb-platform-*`; harness manifest IDs are selected-substrate evidence only and are not Product Line B identity.
- Before any SPEC-010B edit to shared coordination files that active SPEC-014C may also need (`tsconfig.spec-strict.json`, `eslint.config.mjs`, `docs/ai/rc-factory-technical-roadmap.md`, `docs/ai/specs/autopilot-state.json`), run a pre-edit ownership check with `git worktree list --porcelain` plus the active SPEC-014C dirty/diff file list. If SPEC-014C has changes to the same file, stop and resolve ownership before editing; do not merge, overwrite, or normalize SPEC-014C changes from this spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it uses different files and has no dependency on incomplete tasks.
- **[Story]**: User story label for story phases only.
- Every task includes an exact file path.

## Phase 1: RED Test Baseline

**Purpose**: Define failing tests before implementation.

- [ ] T001 Add RED tests for Product Line B config validation, canonical identity, `plb-platform-*` logical assignment names, and forbidden harness manifest identity in `src/lib/__tests__/product-line-b-seed.test.ts`
- [ ] T002 Add RED tests for no-mutation preflight, Product Line B residue, `plb-platform-*` conflicts, repo sync-owner conflicts, and retained FocusEngine/OpenClaw inventory reporting in `src/lib/__tests__/product-line-b-seed.test.ts`
- [ ] T003 Add RED tests for disabled-by-default apply/verify, existing-target refusal, `--allow-existing` idempotency, repeated verify read-only behavior, and stable seed snapshot hashes in `src/lib/__tests__/product-line-b-seed.test.ts`
- [ ] T004 Add RED tests for `spec-010b.synthetic_issue.v1`, `spec-010b.smoke_evidence.v1`, one-run smoke eligibility, live GitHub not required, and redaction proof in `src/lib/__tests__/product-line-b-smoke.test.ts`
- [ ] T005 Add RED tests for Product Line A scoped hash parity, scoped API/dashboard evidence fields, invalid workspace scope outcomes, and Product Line B expected-row exclusion in `src/lib/__tests__/product-line-b-smoke.test.ts`
- [ ] T006 Add RED guardrail tests for no live GitHub write requirement, no FocusEngine takeover, no SPEC-014C adapter file ownership, no runtime-inventory `eligible` requirement, and final Product Line B disabled state in `src/lib/__tests__/product-line-b-smoke.test.ts`

**Checkpoint**: Tests must fail for missing SPEC-010B behavior before implementation begins.

---

## Phase 2: Foundational Setup

**Purpose**: Add reviewed config, fixture, strict-scope entries, and task/file ownership guardrails before story work.

- [ ] T007 [P] Create reviewed disabled Product Line B seed config with slug `product-line-b`, display name `Product Line B`, agent prefix `plb-platform`, `racecraft-lab/Paddock` synthetic repo metadata, sync ownership disabled, smoke-owned flags explicit, and paused/forbidden flags explicit in `docs/ai/product-lines/product-line-b.yaml`
- [ ] T008 [P] Create the local synthetic issue fixture with schema `spec-010b.synthetic_issue.v1`, run-scoped positive issue number, required pilot labels, Product Line B metadata, and no credential fields in `specs/010b-product-line-b-smoke/fixtures/synthetic-issue.json`
- [ ] T009 [P] After the pre-edit SPEC-014C ownership check passes for `tsconfig.spec-strict.json`, add SPEC-010B TypeScript strict-scope coverage for the smoke script and tests in `tsconfig.spec-strict.json`
- [ ] T010 [P] After the pre-edit SPEC-014C ownership check passes for `eslint.config.mjs`, add SPEC-010B lint coverage for the smoke script and tests in `eslint.config.mjs`
- [ ] T011 Record the reviewability checkpoint, owned file list, and split-stop condition before implementation in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T012 Record the SPEC-014C hard stop list and runtime-inventory read-only/supporting boundary in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T013 Create a typed SPEC-010B smoke lifecycle script skeleton with `enable`, `synthetic-issue`, `disable`, and `cleanup-proof` phase arguments in `scripts/spec-010b/product-line-b-smoke.ts`

**Checkpoint**: Foundation ready. User story work can proceed.

---

## Phase 3: User Story 1 - Preflight Without Mutation (Priority: P1)

**Goal**: Operators can preflight Product Line B before any write and receive no-mutation proof plus retained inventory reporting.

**Independent Test**: Run `seed:product-line --mode preflight --json` on a target with Product Line A state and verify before/after hash parity, ready or typed stop result, empty mutation, and retained FocusEngine/OpenClaw inventory classification.

### Implementation for User Story 1

- [ ] T014 [P] [US1] Extend product-line seed schema validation for `product_line.disabled_by_default`, Product Line B canonical repo metadata, smoke-owned flags, paused/forbidden flags, and `plb-platform-*` agent prefix rules in `src/lib/product-line-seed/schema.ts`
- [ ] T015 [P] [US1] Add Product Line B focused result codes, retained inventory categories, existing-target classes, and redaction-safe error/residue types in `src/lib/product-line-seed/types.ts`
- [ ] T016 [US1] Implement no-mutation Product Line B preflight classification for absent/ready, already-valid, residue-blocked, `plb-platform-*` conflict, repo sync-owner conflict, and Product Line A takeover risk in `src/lib/product-line-seed/seed.ts`
- [ ] T017 [US1] Include `disabled_at`, retained inventory, no-mutation proof, before/after snapshot hashes, and raw-secret emission proof in seed evidence snapshots in `src/lib/product-line-seed/evidence.ts`

**Checkpoint**: US1 passes independently with focused seed tests and preflight JSON evidence.

---

## Phase 4: User Story 2 - Seed Disabled Product Line B (Priority: P1)

**Goal**: Operators can apply and verify Product Line B as a disabled, isolated workspace/project/assignment shape.

**Independent Test**: Run preflight, apply, verify, repeated apply without `--allow-existing`, repeated apply with `--allow-existing`, and repeated verify against a disposable DB; confirm Product Line B is disabled, Product Line A hashes are stable, and no duplicate config-owned rows are created.

### Implementation for User Story 2

- [ ] T018 [US2] Validate `docs/ai/product-lines/product-line-b.yaml` through the existing seed config loader while keeping `docs/ai/product-lines/paddock.yaml` unchanged in `src/lib/product-line-seed/config.ts`
- [ ] T019 [US2] Apply Product Line B config-owned workspace, project, workflow-template, governance, and `plb-platform-*` logical assignment rows with non-null `workspaces.disabled_at` in `src/lib/product-line-seed/seed.ts`
- [ ] T020 [US2] Verify Product Line B disabled state, false or absent smoke/runner/control-plane flags, zero GitHub-sync-enabled projects, and zero repo sync-owner rows in `src/lib/product-line-seed/seed.ts`
- [ ] T021 [US2] Implement existing-target refusal without `--allow-existing` and idempotent allowed repeated apply with no duplicate config-owned rows in `src/lib/product-line-seed/seed.ts`
- [ ] T022 [US2] Preserve Product Line A scoped hashes, Product Line B seed snapshot hashes, operational/history surfaces, and repeated verify read-only counts in `src/lib/product-line-seed/evidence.ts`
- [ ] T023 [US2] Surface Product Line B focused statuses, `action_required: --allow-existing`, and redaction-safe failures through the seed CLI entrypoint in `scripts/seed-product-line.ts`

**Checkpoint**: US2 passes independently with Product Line B seeded disabled and Product Line A unchanged.

---

## Phase 5: User Story 3 - Enable, Smoke, And Disable (Priority: P2)

**Goal**: Operators can enable Product Line B for one synthetic Paddock issue smoke, produce scoped evidence without a required live GitHub write, and disable Product Line B cleanly afterward.

**Independent Test**: Run the SPEC-010B smoke lifecycle phases against a disposable DB and confirm exactly one run-id-bound synthetic smoke item becomes eligible, live GitHub mutation is not required, Product Line B returns to disabled state, and cleanup counters are zero.

### Implementation for User Story 3

- [ ] T024 [US3] Implement the smoke `enable` phase so it clears only Product Line B `disabled_at`, enables only reviewed smoke-owned Product Line B flags for the current `run_id`, and leaves sync, dispatch, control-plane, runner, sandbox, adapter, and auto-merge paths paused in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T025 [US3] Implement synthetic issue fixture loading and validation for `spec-010b.synthetic_issue.v1`, required pilot labels, `racecraft-lab/Paddock` metadata, Product Line B local metadata, and no raw credential fields in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T026 [US3] Implement local pilot subset evidence for candidate eligibility, one root-task proof, pilot auto-route hold, side-effect absence, and `live_github_required: false` in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T027 [US3] Implement optional live GitHub evidence status as skipped or not-mutated unless explicit HAL operator approval and live-mutation opt-in are present in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T028 [US3] Implement the smoke `disable` phase so it restores non-null Product Line B `disabled_at` and clears or sets false every smoke-owned flag enabled for the run in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T029 [US3] Implement cleanup-proof counters for zero Product Line B repo sync-owner projects, zero GitHub-sync-enabled projects, zero assigned dispatch-eligible tasks, zero remaining smoke-eligible items, and zero unintended side-effect rows in `scripts/spec-010b/product-line-b-smoke.ts`

**Checkpoint**: US3 passes independently with Product Line B enabled only during the smoke window and disabled in final state.

---

## Phase 6: User Story 4 - Prove Product Line A Isolation (Priority: P2)

**Goal**: Maintainers can review evidence proving Product Line A records, metrics, tasks, and sync ownership were not changed by Product Line B onboarding or smoke activity.

**Independent Test**: Compare Product Line A scoped hashes before Product Line B writes and after cleanup, then verify scoped API/dashboard evidence and invalid-scope cases without comparing only whole-database counts.

### Implementation for User Story 4

- [ ] T030 [US4] Implement Product Line A scoped hash capture for workspace identity, projects, assignments, workflow templates, governance defaults, tasks/evidence/read-model rows, GitHub sync/lifecycle rows, counters, and non-owned flags in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T031 [US4] Implement scoped API evidence collection for `/api/workspaces/:id`, `/api/projects`, `/api/tasks`, `/api/agents`, `/api/github/sync`, and `/api/status?action=dashboard` using explicit Product Line A and Product Line B `workspace_id` values in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T032 [US4] Implement invalid, forbidden, and out-of-scope workspace evidence outcomes with stable evidence codes and HTTP status capture in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T033 [US4] Stop the smoke workflow on Product Line A isolation drift while excluding expected Product Line B rows from Product Line A hash comparisons in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T034 [US4] Record disabled Product Line B switcher absence as supporting evidence only and avoid adding an include-disabled dashboard mode or product-line metrics widget in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T035 [US4] Treat runtime-inventory observations as skipped, unavailable, or read-only supporting evidence and never require `eligible` or adapter file ownership in `scripts/spec-010b/product-line-b-smoke.ts`

**Checkpoint**: US4 passes independently with Product Line A parity and scoped evidence.

---

## Phase 7: User Story 5 - Preserve Evidence For Future Gardening (Priority: P3)

**Goal**: Future harness-gardening work can use the SPEC-010B evidence packet without replaying hidden setup assumptions.

**Independent Test**: Open the generated evidence packet and workflow/checklist updates; confirm preflight, apply, verify, enable, synthetic issue, pilot subset, disable, cleanup, isolation, timing, optional live issue status, redaction, and parallel safety are present and redaction-safe.

### Implementation for User Story 5

- [ ] T036 [US5] Emit `spec-010b.smoke_evidence.v1` with commit/runtime identifiers, phase statuses, command/API/SQL evidence refs, seed snapshots, Product Line A before/after hashes, side-effect counts, cleanup counters, redaction proof, timing, optional live issue status, and parallel safety fields in `scripts/spec-010b/product-line-b-smoke.ts`
- [ ] T037 [US5] Update disposable DB and HAL execution instructions with finalized evidence file paths, service-compatible Node notes, and cleanup-counter expectations in `specs/010b-product-line-b-smoke/quickstart.md`
- [ ] T038 [US5] Add the SPEC-010B operator smoke checklist with preflight, apply, verify, enable, synthetic issue, disable, cleanup, Product Line A isolation, optional live GitHub skip/approval, and cleanup count rows in `docs/qa/pilot-smoke-checklist.md`
- [ ] T039 [US5] Update the SPEC-010B workflow with implementation evidence placeholders, PR review packet traceability requirements, and deferred out-of-scope notes in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T040 [US5] Record active SPEC-014C, files intentionally avoided, no adapter ownership, no runtime-inventory `eligible` requirement, and harness manifest IDs as non-identity substrate evidence in `docs/ai/specs/SPEC-010B-workflow.md`

**Checkpoint**: US5 passes independently with durable, redaction-safe evidence for review and future SPEC-012B gardening.

---

## Phase 8: Polish And Verification

**Purpose**: Validate the whole feature, record evidence, and protect scope before PR review.

- [ ] T041 Run focused Vitest coverage for `src/lib/__tests__/product-line-b-seed.test.ts` and `src/lib/__tests__/product-line-b-smoke.test.ts`, verify RED-before-GREEN history in task notes, and record results in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T042 Run disposable DB `seed:product-line` preflight, apply, verify, repeated apply refusal, `--allow-existing` apply, and repeated verify commands for `docs/ai/product-lines/product-line-b.yaml`; record no-mutation, idempotency, disabled state, and Product Line A hash evidence in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T043 Run disposable DB smoke lifecycle phases from `scripts/spec-010b/product-line-b-smoke.ts`, confirm Product Line B is enabled only during smoke and disabled afterward, and record cleanup counts in `docs/qa/pilot-smoke-checklist.md`
- [ ] T044 Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`, plus `pnpm test:e2e -- tests/product-line-b-dashboard-scope.spec.ts` only if dashboard behavior or Playwright assertions changed, and record results in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T045 Re-run the file-ownership guard for `src/lib/harness-adapters/**`, `src/app/api/agents/runtime-inventory/**`, `src/lib/task-dispatch.ts`, `src/lib/task-dispatch-codex-app-server.ts`, `scripts/spec-014c/**`, SPEC-014C artifacts, and shared coordination files touched by SPEC-010B; record the active SPEC-014C worktree/diff check and clean result in `docs/ai/specs/SPEC-010B-workflow.md`
- [ ] T046 Run HAL UAT only after local verification and explicit approval, using `/usr/bin/node` service-compatible commands, then record `paddock.service`, `openclaw-gateway.service`, Product Line A isolation hashes, Product Line B final disabled state, optional live GitHub mutation status, and cleanup counts in `docs/qa/pilot-smoke-checklist.md`
- [ ] T047 Prepare the PR review packet with what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, rollback/flag notes, Product Line A isolation proof, Product Line B disablement proof, optional live GitHub boundary, and SPEC-014C files avoided in `docs/ai/specs/SPEC-010B-workflow.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- **Phase 1 RED Test Baseline**: Starts first and defines failing behavior.
- **Phase 2 Foundational Setup**: Depends on Phase 1 test tasks being written.
- **US1 and US2 (P1)**: Depend on Phase 2. US1 preflight behavior should land before US2 apply/verify behavior.
- **US3 (P2)**: Depends on US2 disabled seed and verify behavior.
- **US4 (P2)**: Depends on US1 baseline evidence and US3 cleanup proof; can build scoped hash/API logic while US3 script phases are being implemented.
- **US5 (P3)**: Depends on US1-US4 evidence shapes.
- **Polish**: Depends on all selected user stories.

### User Story Dependencies

- **US1 Preflight Without Mutation**: Required before any Product Line B write.
- **US2 Seed Disabled Product Line B**: Requires US1 preflight and supplies the disabled state for smoke.
- **US3 Enable, Smoke, And Disable**: Requires US2 seeded disabled Product Line B.
- **US4 Prove Product Line A Isolation**: Uses US1 baseline plus US3 after-cleanup proof.
- **US5 Preserve Evidence For Future Gardening**: Uses evidence emitted by US1-US4.

### Parallel Opportunities

- T007-T010 can run in parallel after RED tests only after the pre-edit SPEC-014C ownership check passes for shared strict/lint files.
- T014 and T015 can run in parallel during US1 because they touch distinct seed schema/type files.
- T030-T032 can be developed in parallel with T024-T029 after the smoke script skeleton exists, but both groups must reconcile in `scripts/spec-010b/product-line-b-smoke.ts`.
- Documentation tasks T037-T040 can run in parallel after the evidence fields are stable because they touch distinct docs/checklist files.

## Parallel Example

```bash
Task: "Create Product Line B config in docs/ai/product-lines/product-line-b.yaml"
Task: "Create synthetic issue fixture in specs/010b-product-line-b-smoke/fixtures/synthetic-issue.json"
Task: "After the SPEC-014C ownership check passes, add strict-scope coverage in tsconfig.spec-strict.json"
Task: "After the SPEC-014C ownership check passes, add lint coverage in eslint.config.mjs"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 RED tests.
2. Complete Phase 2 foundational setup.
3. Complete US1 and US2 so Product Line B can be preflighted, seeded disabled, verified, and proven isolated without smoke.
4. Stop and validate preflight/apply/verify before adding smoke lifecycle behavior.

### Incremental Delivery

1. US1: no-mutation preflight and conflict reporting.
2. US2: disabled seed/apply/verify and idempotency.
3. US3: enable one synthetic smoke item and disable cleanly.
4. US4: Product Line A isolation and scoped API/dashboard evidence.
5. US5: durable evidence packet, HAL checklist, PR review packet.

## File Ownership

### SPEC-010B Owned Or Expected Files

- `docs/ai/product-lines/product-line-b.yaml`
- `src/lib/product-line-seed/types.ts`
- `src/lib/product-line-seed/schema.ts`
- `src/lib/product-line-seed/config.ts`
- `src/lib/product-line-seed/seed.ts`
- `src/lib/product-line-seed/evidence.ts`
- `scripts/seed-product-line.ts`
- `scripts/spec-010b/product-line-b-smoke.ts`
- `src/lib/__tests__/product-line-b-seed.test.ts`
- `src/lib/__tests__/product-line-b-smoke.test.ts`
- `specs/010b-product-line-b-smoke/fixtures/synthetic-issue.json`
- `specs/010b-product-line-b-smoke/quickstart.md`
- `docs/qa/pilot-smoke-checklist.md`
- `docs/ai/specs/SPEC-010B-workflow.md`
- `tsconfig.spec-strict.json`
- `eslint.config.mjs`

### Shared Coordination Files Requiring Pre-Edit Ownership Check

- `tsconfig.spec-strict.json`
- `eslint.config.mjs`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/autopilot-state.json`

### Forbidden For SPEC-010B

- `src/lib/harness-adapters/**`
- `src/app/api/agents/runtime-inventory/**`
- `src/lib/task-dispatch.ts`
- `src/lib/task-dispatch-codex-app-server.ts`
- `scripts/spec-014c/**`
- SPEC-014C artifacts

## Scope Non-Goals

- No required live GitHub write.
- No FocusEngine/OpenClaw takeover or automatic cleanup.
- No scheduler claim authority.
- No retry UI.
- No runner state.
- No sandbox lifecycle.
- No harness adapter implementation.
- No runtime-inventory eligibility implementation.
- No auto-merge.
- No Product Line A seed mutation.
- No broad dashboard redesign or include-disabled switcher mode.

## Format Validation

- Total tasks: 47
- Setup/foundational/polish tasks: 20
- US1 tasks: 4
- US2 tasks: 6
- US3 tasks: 6
- US4 tasks: 6
- US5 tasks: 5
- All tasks use checkbox, sequential ID, optional `[P]`, story labels only in user story phases, and exact file paths.
- Suggested MVP scope: Phase 1, Phase 2, US1, and US2.
