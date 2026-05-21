# Tasks: SPEC-012A - Repo Knowledge Index and AGENTS Map

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/repo-knowledge-index-contract.md`, checklist artifacts
**Prerequisites**: Completed Specify, Clarify, Plan, and Checklist phases
**Primary surface**: docs/process

**Ratified transition exception**: The task gate may count referenced JSON,
contract, workflow, and script paths as multiple primary surfaces. This spec
continues under the setup-approved transition exception only for the planned
docs/process deliverable: canonical index/schema files, concise root map,
focused Node guard scripts, package scripts, guardrails wiring, fixtures, and
verification evidence. The exception does not permit runtime source behavior,
migrations, UI, scheduler/runner behavior, GitHub sync automation, sandbox
lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs
rewrites, or nested `AGENTS.md` rollout.

## Phase 1: RED Fixtures and Expected Failures

**Purpose**: Create deterministic invalid inputs before guard implementation.

- [x] T001 Create `scripts/spec-012a/fixtures/README.md` documenting fixture mode, expected finding codes, and clean-checkout assumptions.
- [x] T002 [P] Create `scripts/spec-012a/fixtures/missing-required-doc/` with an index fixture missing one required discovery path and an expected `required_entry_missing` or `required_path_missing` finding.
- [x] T003 [P] Create `scripts/spec-012a/fixtures/missing-required-metadata/` with an entry missing `owner`, `freshness`, `last_verified`, `related_specs`, or `verification_commands` and expected `metadata_missing` findings.
- [x] T004 [P] Create `scripts/spec-012a/fixtures/broken-required-link/` with a required repo-local Markdown link target missing and expected `required_link_broken`.
- [x] T005 [P] Create `scripts/spec-012a/fixtures/stale-status-pointer/` with disagreeing roadmap/workflow/state values and expected `status_pointer_stale`.
- [x] T006 [P] Create `scripts/spec-012a/fixtures/invalid-related-spec/` with an invalid `related_specs` value and expected `related_spec_invalid`.
- [x] T007 [P] Create `scripts/spec-012a/fixtures/warning-only-links/` with external URLs and Obsidian wikilinks that should emit warnings without a failing exit.

## Phase 2: Canonical Index, Schema, and Root Map

**Purpose**: Add the repo-owned discovery artifacts without broad docs rewrites.

- [x] T008 Add `docs/ai/repo-knowledge-index.schema.json` covering `version`, index `last_verified`, entries, required metadata, freshness rule shape, related spec pattern, required booleans, and optional link metadata.
- [x] T009 Add `docs/ai/repo-knowledge-index.json` with required entries for `AGENTS.md`, PRD, roadmap, `docs/ai/specs/`, SPEC-012A workflow, `autopilot-state.json`, QA checklist, rollback runbook, and workflow contract.
- [x] T010 Update root `AGENTS.md` with a concise Repo Knowledge Map section pointing to the canonical index, PRD, roadmap, workflow/status pointers, QA checklist, rollback runbook, guard commands, and GitNexus instructions.
- [x] T011 Verify `AGENTS.md` remains map-level only and does not embed the JSON index contents or duplicate every indexed entry.

## Phase 3: Repository Knowledge Index Guard

**Purpose**: Implement blocking validation against RED fixtures and the real index.

- [x] T012 Create `scripts/spec-012a/verify-repo-knowledge-index.mjs` CLI skeleton with `--fixture`, `--json`, and default repo-root modes.
- [x] T013 Implement JSON parse and schema-shape validation with Node built-in modules only; cover `index_missing`, `schema_missing`, `json_malformed`, and `schema_invalid`.
- [x] T014 Implement required entry and required path validation, including duplicate path detection, outside-repo traversal rejection, and `required_path_missing`.
- [x] T015 Implement metadata validation for `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`, including `metadata_missing`, `metadata_invalid`, and `related_spec_invalid`.
- [x] T016 Implement required repo-local Markdown link validation with relative path normalization and same-file heading handling.
- [x] T017 Implement SPEC-012A stale status pointer validation across roadmap, workflow, and `autopilot-state.json`, with observed/expected values in findings.
- [x] T018 Verify all RED fixtures fail or warn with the expected stable finding codes, then verify `docs/ai/repo-knowledge-index.json` passes.

## Phase 4: Fresh-Agent Proxy Smoke

**Purpose**: Prove discovery starts from checked-in root instructions and resolves through the index.

- [x] T019 Create `scripts/spec-012a/fresh-agent-proxy.mjs` that starts from root `AGENTS.md`, locates the canonical index pointer, and loads the index.
- [x] T020 Resolve PRD, roadmap, workflow/status pointers, QA checklist, rollback runbook, root instructions, and workflow contract through index entries only.
- [x] T021 Verify GitNexus guidance is discoverable by finding the refresh command, linked-worktree `.envrc.local` setup guidance, and ignored `.gitnexus/` boundary in checked-in docs.
- [x] T022 Fail the smoke check when a required discovery target is missing or when discovery bypasses the canonical index.
- [x] T023 Verify the smoke script passes on a clean checkout where `.gitnexus/` is absent.

## Phase 5: Package and CI Guard Wiring

**Purpose**: Make the guard easy to run locally and covered by existing CI.

- [ ] T024 Add focused package scripts `knowledge:index:check` and `knowledge:index:smoke` to `package.json`.
- [ ] T025 Update `scripts/check-guardrails.mjs` with a `repo-knowledge-index` suite that invokes the blocking index guard.
- [ ] T026 Verify `pnpm guardrails -- --suite repo-knowledge-index` runs the new guard without requiring `.gitnexus/`, network, secrets, or operator services.
- [ ] T027 Confirm `.github/workflows/quality-gate.yml` already runs `pnpm guardrails`; update workflow only if required to keep the new suite covered.

## Phase 6: Verification, Docs, and Status Evidence

**Purpose**: Close the process loop and record review evidence.

- [ ] T028 Update `specs/012a-repo-knowledge-index/quickstart.md` with final command names, expected outputs, fixture commands, and clean-checkout assumptions.
- [ ] T029 Update `docs/ai/specs/SPEC-012A-workflow.md` implementation progress and verification evidence.
- [ ] T030 Update `docs/ai/rc-factory-technical-roadmap.md` with SPEC-012A implementation evidence when verification completes.
- [ ] T031 Run focused verification: `pnpm knowledge:index:check`, `pnpm knowledge:index:smoke`, and `pnpm guardrails -- --suite repo-knowledge-index`.
- [ ] T032 Run final branch verification: `pnpm typecheck`, `pnpm lint`, `git diff --check`, and any additional focused checks required by changed package/CI wiring.

## Dependencies and Execution Order

- T001-T007 must precede guard implementation tasks T012-T018.
- T008-T011 must precede smoke validation tasks T019-T023.
- T012-T018 must precede package/CI wiring tasks T024-T027.
- T024-T027 must precede final verification tasks T031-T032.
- T029-T030 happen after implementation verification so workflow and roadmap evidence reflect actual results.

## Parallel Opportunities

- T002-T007 can run in parallel because each owns a separate fixture directory.
- T008 and T010 can run in parallel if the index schema owner and `AGENTS.md` owner coordinate final links.
- T019-T021 can start after T008-T011 while T014-T017 continue, as long as the scripts do not edit the same files.
- T028 can run after package script names stabilize.

## Scope Guard

Do not add runtime source behavior, migrations, UI, scheduler/runner behavior, automatic GitHub sync, sandbox lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or nested `AGENTS.md` rollout. If implementation requires any of those, stop and split the work into a later spec.
