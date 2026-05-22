# SpecKit Workflow: SPEC-010A - Generic Product-Line Seeder

**Template Version**: 1.0.0, populated for Mission Control
**Created**: 2026-05-22
**Purpose**: Prepare and execute RC Factory Phase 9A by extracting the Mission Control-specific seed path into reusable product-line seed tooling, checked-in YAML config, typed validation, and operator-readable parity evidence.

---

## How to Use This Workflow

Run from the dedicated worktree:

```bash
cd .worktrees/010a-generic-product-line-seeder
$speckit-autopilot docs/ai/specs/SPEC-010A-workflow.md
```

Codex skills use `$skill-name` invocation. Do not run slash-command variants in Codex.

---

## Design Concept

This workflow was enriched from the Grill Me interview required by `$speckit-setup`.

```text
docs/ai/specs/SPEC-010A-design-concept.md
```

The design concept is the source of truth for setup-time scoping decisions:

- Use checked-in YAML product-line seed configs under `docs/ai/product-lines/`.
- Convert Mission Control into the first reusable config/fixture.
- Add a generic `seed:product-line` CLI with `preflight`, `apply`, and `verify` modes.
- Keep `seed:mission-control` as a compatibility wrapper around the Mission Control config.
- Validate configs before write transactions and return structured JSON field/path errors.
- Existing product-line workspaces require explicit apply/verify handling and preserve history.
- Config declares workflow contract family/path and required template slugs; import through the existing SPEC-009A workflow-contract library.
- Config declares advisory/default governance rows using existing `resource_policies` shape.
- Config declares product-line-scoped agent assignments with explicit `agentPrefix`; facility/global agents remain separate.
- Config explicitly lists enabled flags and disabled/absent flags, validated against `FEATURE_FLAG_REGISTRY`.
- Preflight blocks only target-config ownership conflicts, reports redacted evidence, and never deletes or unlinks automatically.
- Product Line B real config, smoke, live enablement, and GitHub mutation are out of scope for SPEC-010A.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/010a-generic-product-line-seeder/spec.md` and requirements checklist; after Clarify session 4 the spec has 5 user stories, 29 FRs, 13 success criteria, and 0 unresolved markers; G1 passed |
| Clarify | `$speckit-clarify` | Complete | Resolved schema path/sections, existing-target semantics, workflow/flag/agent/governance rules, CLI contract, wrapper behavior, evidence envelope, redaction fixtures, and docs paths; G2 passed with 0 markers |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, quickstart, three contracts, and Codex AGENTS context; G3 passed with 0 markers and no migration/dependency/UI/runtime scope |
| Checklist | `$speckit-checklist` | Complete | Completed data-integrity, state-management, error-handling, security, and reliability checks; G4 passed with 0 markers |
| Tasks | `$speckit-tasks` | Complete | Generated 73 TDD-first tasks across 8 task phases; G5 passed; reviewability gate passes under bounded transition exception |
| Analyze | `$speckit-analyze` | Complete | Remediated 2 MEDIUM artifact consistency findings; G6 passed with 0 CRITICAL/HIGH findings and 0 markers |
| Implement | `$speckit-implement` | In Progress | Completed setup/foundation tasks T001-T018; continuing TDD implementation by task group |

**Status Legend:** Pending | In Progress | UAT Pending | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `010a-generic-product-line-seeder`; design concept and workflow exist; reviewability preset resolves; roadmap marks SPEC-010A `In Progress` on this branch only |
| G1 | After Specify | Requirements cover generic YAML config, Mission Control parity, explicit existing-target apply/verify, fail-closed validation, workflow import, flags, governance, agents, and no Product Line B scope |
| G2 | After Clarify | Config schema fields, validation error codes, existing workspace policy, CLI compatibility wrapper, residue conflict model, and UAT proof are resolved |
| G3 | After Plan | Architecture reuses existing SPEC-009B seed behavior and SPEC-009A workflow-contract importer; no runtime admin UI, new dependency, migration, GitHub mutation, dispatch, claim, runner, sandbox, or adapter work |
| G4 | After Checklist | All gaps are remediated or explicitly out of scope without widening into SPEC-010B, SPEC-013A/A1/B/C, or SPEC-014A-D |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, and include Mission Control parity, invalid-config no-mutation, CLI wrapper, docs/runbook, and scope guard coverage |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; downstream artifacts do not drift from Design Concept Q1-Q12 |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, apply-twice/verify parity evidence, invalid-config no-mutation proof, docs status updates, branch commit, and push are complete |

---

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Existing single-workspace and SPEC-009B Mission Control seed behavior must remain unchanged unless invoked through explicit generic config paths | Mission Control parity tests plus `seed:mission-control` wrapper regression |
| II. Upstream Compatibility Discipline | Keep changes additive and isolated to seed/config tooling; no destructive migration or table rename | Diff review and migration grep |
| IV. Test-First Development | RED tests define config parsing, existing-target handling, no-mutation failures, parity, and CLI behavior before implementation | Focused Vitest/CLI tests |
| V. Feature-Flag Resolution Discipline | Validate configured flags against `FEATURE_FLAG_REGISTRY`; do not inline runtime `process.env.FEATURE_*` checks | Unit tests and guardrail grep |
| VI. Dependency Supply-Chain Hygiene | No new runtime dependency planned; reuse existing direct `yaml` dependency and current TypeScript stack | `package.json` diff and lockfile review |
| VII. Additive Migration Policy | No schema migration planned; seed existing `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, and `resource_policies` rows only | Migration diff grep and plan review |
| VIII. Successor Side-Effect Parity | Seeder must not create pilot tasks or successors; any task creation path remains out of scope | Guardrail tests and database assertions |
| X. Observability and Auditability | Preflight/apply/verify output must be structured JSON with redacted conflict evidence and stable evidence counts/hashes | CLI tests and operator UAT proof |
| XVI. Reviewability And Verification Debt Control | Keep primary surface to seed/config tooling and process evidence; Product Line B onboarding remains separate | Reviewability gate, PR packet, and strict-scope checks |

**Constitution Check:** Initial setup validated roadmap scope, branch, reviewability preset, package manager, and no-autopilot setup boundary. Re-check in Specify and Plan before implementation.

### Setup Evidence

- Spec ID: SPEC-010A
- Branch: `010a-generic-product-line-seeder`
- Worktree: `.worktrees/010a-generic-product-line-seeder`
- Package manager: pnpm from `pnpm-lock.yaml`
- SpecKit CLI: `/Users/fredrickgabelmann/.local/bin/specify`
- Remote: `origin` (`https://github.com/racecraft-lab/mission-control.git`)
- Current base: `origin/main` at `6bc4f2a79d7af240b75ad22687310a754f1f587a`
- Reviewability setup gate:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"primary_surfaces":["API","harness/adapter","or docs/process","scheduler/runtime","schema/migration","seed/config","UI"],"thresholds":{"warn":{"reviewable_loc":400,"production_files":6,"total_files":15,"primary_surfaces":1},"block":{"reviewable_loc":800,"production_files":8,"total_files":25,"primary_surfaces":1}},"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

The setup gate passed under the roadmap transition exception. Downstream phases must keep implementation narrower than the roadmap-wide heuristic: generic seed/config tooling, Mission Control parity evidence, and no Product Line B onboarding.

### Reviewability Preset

Preset `speckit-pro-reviewability` is present. Template resolution verified:

- `spec-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/spec-template.md`
- `plan-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/plan-template.md`
- `tasks-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/tasks-template.md`

### Archive Sweep Startup

| Field | Result |
|-------|--------|
| Status | Complete |
| Timestamp | 2026-05-22T16:09:45Z |
| Extension | Installed and enabled: `archive` v1.1.0 |
| Current target | `specs/010a-generic-product-line-seeder` excluded from archive and cleanup |
| Mode | `recorded-no-cleanup` |
| safeToApplyCleanup | false |
| Reason | Codex runtime exposes archive command documents but no executable archive command bridge in this worktree; previous spec folders are preserved |
| Prior spec directories observed | `specs/009c3-remediation-ready-for-owner`, `specs/009c4-owner-merge-reconciliation`, `specs/009d-pilot-review-lifecycle`, `specs/009e-pilot-evidence-surfaces`, `specs/009f-production-triage-routing`, `specs/012a-repo-knowledge-index` |

### Phase 0 Prerequisites Results

| Check | Result |
|-------|--------|
| Timestamp | 2026-05-22T16:10:59Z |
| Prerequisite script | Pass: `all_pass=true`; branch `010a-generic-product-line-seeder`; isolated worktree `true` |
| Branch note | Plugin branch heuristic reported `on_feature_branch=false`; git branch and workflow branch match, so phase agents must skip branch creation |
| Package manager | `pnpm` from `pnpm-lock.yaml` |
| Project commands | `BUILD=pnpm build`; `TYPECHECK=pnpm typecheck`; `LINT=pnpm lint`; `UNIT_TEST=pnpm test`; `INTEGRATION_TEST=pnpm test:e2e`; authoritative full verification uses `pnpm test:all` from AGENTS.md |
| MCP availability | Missing `tavily-mcp`, `context7`, and `RepoPrompt`; agents use built-in fallbacks |
| Preset | `speckit-pro-reviewability` with spec, plan, and tasks templates resolved |
| Required Codex agents | Installed in `/Users/fredrickgabelmann/.codex/agents`: `phase-executor`, `clarify-executor`, `checklist-executor`, `analyze-executor`, `implement-executor`, `codebase-analyst`, `spec-context-analyst`, `domain-researcher` |
| Optional Codex agent | Installed: `autopilot-fast-helper` |
| Implementation agent | `implement-executor` |

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-010A |
| Name | Generic Product-Line Seeder |
| Branch | `010a-generic-product-line-seeder` |
| Dependencies | SPEC-002A, SPEC-009B |
| Enables | SPEC-010B |
| Priority | P2 |
| Scope source | Phase 9A - Generic product-line seeder |
| Acceptance criteria source | Phase 9A Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Parameterize the Mission Control seed path into a reusable product-line seeder that accepts product-line slug, display name, agent prefix, GitHub repo, workflow family, feature flags, and governance defaults. It does not onboard Product Line B or run a second smoke.

### Strict Scope

Allowed:

- Generic product-line seed config schema and typed validation.
- Canonical Mission Control product-line YAML config under `docs/ai/product-lines/`.
- Generic seed library/CLI with `preflight`, `apply`, and `verify` modes.
- Compatibility wrapper preserving `pnpm seed:mission-control`.
- Reuse of existing SPEC-009A workflow-contract import/apply mechanisms.
- Reuse of existing `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, and `resource_policies` storage.
- Explicit feature-flag enable and disabled/absent validation against `FEATURE_FLAG_REGISTRY`.
- Existing-target policy requiring explicit apply/verify behavior and preserving task/history rows.
- Redacted target-config-aware residue/conflict preflight.
- Mission Control apply-twice/verify parity evidence and invalid-config no-mutation fixtures.
- Operator docs/runbook updates for the generic CLI.

Forbidden:

- Product Line B real config, live enablement, smoke, or disablement.
- Runtime/admin product-line config UI or database authoring.
- New database migration/table.
- New runtime dependency.
- GitHub issue creation, comments, closes, labels, or other live GitHub mutation.
- Issue claim/reconciliation, scheduler dispatch, runner state, sandbox lifecycle, harness adapter work, or auto-merge.
- Creating pilot tasks, per-agent seed tasks, or successors.
- Automatic deletion/unlinking of non-target product-line residue.
- Automatic `$speckit-setup`, spec branch/worktree creation, or SDD execution.

### Success Criteria Summary

- [ ] Generic product-line seeder consumes checked-in YAML config and validates required identity, agent, repo, workflow, feature-flag, and governance fields.
- [ ] Mission Control seed can be reproduced from the generic config with apply-twice and verify-mode evidence matching the SPEC-009B invariants.
- [ ] Incomplete or unsafe configs fail closed before writes and return structured JSON errors with field/path codes.
- [ ] No-mutation tests prove invalid configs do not change workspace, project, assignment, task, workflow-template, or governance rows.
- [ ] Existing product-line workspace handling is explicit, preserves history, and mutates only config-owned fields.
- [ ] Workflow templates are imported through the existing workflow-contract library using config-declared family/path/required slugs.
- [ ] Feature flags are validated against `FEATURE_FLAG_REGISTRY`; configured disabled/absent flags stay off.
- [ ] Product-line-scoped agent assignments use explicit `agentPrefix`; facility/global agents are not accidentally assigned.
- [ ] Target-config residue preflight blocks ownership conflicts with redacted evidence and no automatic cleanup.
- [ ] `seed:mission-control` remains available as a compatibility wrapper around the Mission Control config.
- [ ] No Product Line B config/smoke, GitHub mutation, scheduler dispatch, claim, runner, sandbox, adapter, or auto-merge behavior is added.

---

## Phase 1: Specify

**When to run:** Start of SPEC-010A. Focus on WHAT and WHY, not implementation details. Output: `specs/010a-generic-product-line-seeder/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Generic Product-Line Seeder

### Problem Statement
SPEC-009B proved a Mission Control-specific Product Line A seed, but the code path is still Mission-Control-specific. SPEC-010B needs reusable seed tooling before a second product line can be onboarded safely. Build a generic, checked-in product-line seed config and CLI that can reproduce the existing Mission Control seed without launching work or mutating GitHub.

### Source Artifacts
- Roadmap: `docs/ai/rc-factory-technical-roadmap.md`, SPEC-010A / Phase 9A.
- PRD: `docs/rc-factory-v1-prd.md`, especially Product Line, Department, global agent, GitHub tracker, and second Product Line onboarding goals.
- Design Concept: `docs/ai/specs/SPEC-010A-design-concept.md`.
- Prior seed workflow: `docs/ai/specs/SPEC-009B-workflow.md` and `docs/ai/specs/SPEC-009B-design-concept.md`.
- Existing seed implementation: `scripts/seed-mission-control-product-line.ts` and `src/lib/mission-control-seed/*`.
- Workflow contract source: `docs/ai/workflows/mission-control/workflow-contract.yaml` and `src/lib/workflow-contracts/*`.
- Constitution: `.specify/memory/constitution.md`.

### Goals
1. Define a checked-in YAML product-line seed config shape under `docs/ai/product-lines/`.
2. Convert Mission Control into the first canonical config/fixture.
3. Add a generic `seed:product-line` CLI with `preflight`, `apply`, and `verify` modes.
4. Keep `seed:mission-control` working as a compatibility wrapper around the Mission Control config.
5. Validate config identity, workflow contract, GitHub repo ownership, feature flags, agent assignments, governance defaults, and existing-target policy before writes.
6. Fail closed with structured JSON errors and no mutation for incomplete or unsafe configs.
7. Reproduce Mission Control seed behavior from config with apply-twice, verify-mode, and stable evidence.

### User Stories
- As an operator, I can review a product-line seed YAML file before applying it.
- As an operator, I can run generic preflight/apply/verify commands and get structured JSON evidence.
- As a maintainer, I can prove the generic Mission Control config preserves SPEC-009B behavior.
- As a future SPEC-010B implementer, I can reuse the seed schema and CLI without changing seeder code for each product line.

### Constraints
- Use the existing TypeScript/Next.js 16, Node >=22, pnpm, better-sqlite3, and direct `yaml` dependency stack.
- No new runtime dependency and no migration.
- Use existing storage tables: `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, `resource_policies`, and existing evidence/count helpers where possible.
- Import workflow templates through the existing workflow-contract library, not manual SQL duplication.
- Validate feature flags against `FEATURE_FLAG_REGISTRY`.
- Preserve existing issue/task/history rows and unrelated feature flags unless explicitly config-owned.
- Do not create Product Line B, mutate GitHub, dispatch work, claim tasks, launch runners, create sandboxes, or invoke SpecKit setup/autopilot.

### Out of Scope
- Product Line B onboarding, smoke, disablement, and live UAT.
- Runtime/admin config authoring UI.
- New product-line table or schema migration.
- Automatic cleanup/deletion of conflicting residue.
- External GitHub mutations or autonomous work execution.

### Acceptance
Generate requirements that prove Mission Control parity from generic config, fail-closed invalid config behavior, explicit existing-target handling, target-config residue blocking, CLI compatibility, and strict exclusion of Product Line B/onboarding/runtime execution work.
```

### Specify Gate Checklist

- [x] `spec.md` exists under `specs/010a-generic-product-line-seeder/`.
- [x] No `[NEEDS CLARIFICATION]` markers remain unless explicitly queued for Phase 2.
- [x] All Design Concept decisions Q1-Q12 are represented.
- [x] Scope boundaries match the roadmap and this workflow.

### Specify Result

| Field | Result |
|-------|--------|
| Status | Complete |
| Generated artifacts | `specs/010a-generic-product-line-seeder/spec.md`; `specs/010a-generic-product-line-seeder/checklists/requirements.md` |
| Requirements coverage | 5 user stories; 29 functional requirements after Clarify session 4; 13 success criteria after Clarify session 2; 16/16 requirements checklist items complete |
| Marker scan | `count-markers.sh all specs/010a-generic-product-line-seeder` returned 0 gaps, 0 clarifications, and 0 findings |
| G1 gate | Pass: `validate-gate.sh G1 specs/010a-generic-product-line-seeder` returned `pass=true` |
| Scope result | Mission Control parity, generic config/CLI, existing-target safety, no-mutation evidence, workflow import, flags, governance, agents, and Product Line B/runtime-execution exclusions are represented |

---

## Phase 2: Clarify

**When to run:** After Specify. Use targeted clarification to remove ambiguity before Plan.

Run these sessions in order:

### Session 1: Config Schema And File Layout

```bash
$speckit-clarify

Focus on product-line seed config schema:
- Exact YAML path and filename for the Mission Control config under `docs/ai/product-lines/`.
- Required top-level fields, schema/version marker, and typed validator ownership.
- Representation of product-line identity, departments/projects, agentPrefix/assignments, repo identity, workflow contract, feature flags, governance, and safety policy.
- Whether JSON Schema, TypeScript validator, or both are required for reviewability and CLI errors.
```

#### Session 1 Result

| Question | Accepted Answer | Evidence / Impact |
|----------|-----------------|-------------------|
| Canonical config path and schema marker | `docs/ai/product-lines/mission-control.yaml` with `schema_version: product-line-seed-v1` | Stabilizes review path, CLI default config path, and docs references |
| Required top-level sections | `schema_version`, `product_line`, `github`, `workflow_contract`, `departments`, `agent_assignments`, `feature_flags`, `governance_defaults`, `safety_policy` | Keeps schema reviewable and prevents Plan from inventing incompatible section names |
| Agent assignment representation | `agent_prefix` plus per-assignment `agent_key`, role, and department mapping; shared support references must be explicit by role | Prevents accidental reuse of non-product-line agents |
| Validation owner | JSON Schema plus TypeScript semantic validator owned by `src/lib/product-line-seed/` | JSON Schema handles shape and unknown fields; TypeScript semantic validation handles registry, workflow, governance, residue, and stable CLI error codes |
| Safety policy contents | Existing-target default `refuse_unless_allow_existing`, config-owned surfaces, preserved surfaces, blocked side effects, and first-intake-blocking governance default false | Makes safety boundaries reviewable in config, not only tests/docs |

**Consensus:** None required; clarify executor returned all five recommendations with high confidence and no unresolved items.

### Session 2: Existing Target And No-Mutation Semantics

```bash
$speckit-clarify

Focus on idempotency and existing target safety:
- Exact CLI flag/option required to apply over an existing workspace.
- Which fields are config-owned and can be updated.
- Which rows and columns must be preserved as history.
- Snapshot/hash strategy for invalid-config and blocked-preflight no-mutation proof.
```

#### Session 2 Result

| Question | Accepted Answer | Evidence / Impact |
|----------|-----------------|-------------------|
| Existing-target apply authorization | Require `--allow-existing` for `seed:product-line --mode apply`; verify mode remains read-only and needs no flag | Default apply refuses existing targets and reports `action_required:"--allow-existing"` |
| Config-owned fields | Update only reviewed config-owned fields: workspace name and owned flags; declared project fields; assignment role by project/agent identity; workflow-contract-owned template fields through the importer; governance policies keyed by stable config identity | Prevents silent takeover of live operational state |
| Preserved history | Preserve tasks, activities, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit/ledger rows, manual workflow templates, IDs, created timestamps, task linkage/status/lineage, project ticket counters, assignment timestamps, workflow use counters, and non-owned flags | Makes existing-target history preservation testable |
| No-mutation proof | Emit `snapshot_before` and `snapshot_after` with per-surface row counts plus stable ordered-JSON SHA-256 hashes formatted as `product-line-seed-snapshot-v1:sha256:<hex>` | Provides deterministic proof for invalid-config and blocked-preflight no-write cases |
| Existing-target refusal shape | `ok:false`, `mode:"apply"`, `status:"existing_target_refused"`, `code:"EXISTING_TARGET_REQUIRES_ALLOW_EXISTING"`, `mutation_status:"not_mutated"`, target identity, and `action_required:"--allow-existing"` | Separates validation failure, target safety refusal, and verify drift |

**Consensus:** None required; clarify executor returned all five recommendations with high confidence and no unresolved items.

### Session 3: Workflow, Flags, Agents, And Governance

```bash
$speckit-clarify

Focus on config sections that interact with existing runtime policy:
- Workflow contract family/path and required-slug validation.
- Feature flag validation against `FEATURE_FLAG_REGISTRY`, including disabled/absent future runner flags.
- AgentPrefix assignment rules and global/facility support references.
- Governance defaults using existing `resource_policies` without blocking first intake accidentally.
```

#### Session 3 Result

| Question | Accepted Answer | Evidence / Impact |
|----------|-----------------|-------------------|
| Workflow contract family support | SPEC-010A keeps `workflow_contract.family` config-owned but supports only `mission-control`; unsupported families fail before writes with `UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY` | Avoids widening into generic workflow-contract infrastructure |
| Disabled/absent future flags | `enabled` must be registry keys; `disabled_or_absent` may contain registry keys plus reserved future flags `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` only | Keeps typo prevention strict while preserving fail-closed future runner/sandbox safety |
| Feature flag mutation path | Seeder is not the admin flag mutation path; it may write reviewed config-owned workspace flag JSON only after registry, scope, cascade, env force-off, duplicates/conflicts, and reserved-absent validation | Preserves SPEC-009B parity without opening admin UI semantics |
| Agent assignment boundary | Product-line names derive from slug-safe `agent_prefix + "-" + agent_key`; shared support requires explicit `shared_support_role`, `agent_name`, and `scope: facility_global` | Prevents accidental Facility/global assignment |
| Governance defaults | Enabled `blackout`, `degraded_window`, enabled `wip_limit`, and non-`alert` enforcement are first-intake-blocking unless explicitly allowed with per-policy reason | Makes unsafe governance testable before writes |

**Consensus:** One item required category-routed consensus. Round 1 codebase and spec analysts agreed on split validation but differed on reserved-absent list breadth. Round 2 domain analysis produced a 2-of-3 majority for the narrow spec-owned reserved list (`FEATURE_TASK_CONTROL_PLANE`, `FEATURE_AGENT_RUNNER_SANDBOXES`).

#### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| Disabled/absent future flags not yet in `FEATURE_FLAG_REGISTRY` | 2 | codebase, spec, domain | Accepted split validation with narrow reserved-absent list: enabled registry-only; disabled/absent registry keys plus `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` only | codebase-analyst, spec-context-analyst, domain-researcher |

### Session 4: CLI Compatibility And Operator Evidence

```bash
$speckit-clarify

Focus on operator surface and UAT:
- Generic `seed:product-line` arguments and structured JSON output.
- Compatibility behavior for `seed:mission-control`.
- Mission Control apply-twice/verify parity evidence.
- Invalid-config fixtures and redacted residue/conflict output.
- Docs/runbook paths that operators should follow.
```

#### Session 4 Result

| Question | Accepted Answer | Evidence / Impact |
|----------|-----------------|-------------------|
| Generic CLI contract | `pnpm seed:product-line -- --config <yaml> --db <db> --mode preflight|apply|verify --json [--allow-existing] [--operator-evidence <json>]`; reject unknown flags | Stabilizes operator docs, tests, and CLI contract artifacts without adding a parser dependency |
| Result envelope and exit codes | Use `schema_version:"product-line-seed-result-v1"` with stable result fields and exit codes `0` success, `2` blocked/refusal, `3` workflow/config contract not ready, `4` verify drift, `5` CLI/unexpected error | Makes CI and UAT machine-readable |
| Mission Control wrapper existing-target behavior | `seed:mission-control` delegates to generic behavior and requires `--allow-existing` for existing-target apply; verify remains read-only | Compatibility means same command path and equivalent evidence, not a silent bypass |
| Operator docs/UAT paths | Add generic runbook `docs/runbooks/product-line-seed.md`, update `docs/runbooks/mission-control-seed-predeploy.md`, and keep implementation quickstart under `specs/010a-generic-product-line-seeder/quickstart.md` | Gives durable operator instructions outside spec-only artifacts |
| Invalid-config/redaction fixtures | Required fixture classes include missing identity, unsupported field, invalid flag, reserved flag enabled, unsupported workflow family, missing workflow slug, unsafe governance, duplicate/conflicting declarations, existing-target refusal, and repo/product-line ownership conflict; failures emit no-mutation snapshots and redacted target evidence | Prevents under-testing unsafe configs and ensures no secrets leak in conflict output |

**Consensus:** Two items required consensus. Q3 reached Round 1 agreement between codebase and spec analysts. Q5 used security routing with all three analysts; all agreed on fixture-class coverage plus explicit redaction/no-mutation contract.

#### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| Mission Control wrapper existing-target authorization | 1 | codebase, spec | Accepted wrapper delegation to generic `--allow-existing` behavior while preserving command name/core flags | codebase-analyst, spec-context-analyst |
| Invalid-config fixture and redaction contract | 1 | security | Accepted required validation-class fixture coverage, no-mutation snapshots, `raw_secret_values_emitted:false`, `redacted_fields`, and no raw secret/token/credential output | codebase-analyst, spec-context-analyst, domain-researcher |

### Clarify Gate Checklist

- [x] All open questions from the Design Concept are resolved or explicitly deferred.
- [x] Existing-target behavior and no-mutation proof are unambiguous.
- [x] CLI and config paths are stable enough for Plan and Tasks.

---

## Phase 3: Plan

**When to run:** After Clarify. Output: `specs/010a-generic-product-line-seeder/plan.md` plus supporting design artifacts.

### Plan Prompt

```bash
$speckit-plan

Plan SPEC-010A using:

- `docs/ai/specs/SPEC-010A-design-concept.md`
- `docs/ai/specs/SPEC-010A-workflow.md`
- `specs/010a-generic-product-line-seeder/spec.md`
- `docs/ai/specs/SPEC-009B-design-concept.md`
- `docs/ai/specs/SPEC-009B-workflow.md`
- `scripts/seed-mission-control-product-line.ts`
- `src/lib/mission-control-seed/types.ts`
- `src/lib/mission-control-seed/seed.ts`
- `src/lib/mission-control-seed/preflight.ts`
- `src/lib/mission-control-seed/evidence.ts`
- `src/lib/workflow-contracts/*`
- `src/lib/feature-flags.ts`
- `.specify/memory/constitution.md`

## Tech Stack
- Runtime: Node.js >=22, TypeScript 5.7 strict, Next.js 16 App Router / React 19 repo baseline.
- Database: SQLite through `better-sqlite3`, synchronous transactions.
- Config parsing: existing direct `yaml` dependency; no new runtime dependency.
- Tests: Vitest focused unit/CLI tests; typecheck/lint/build as scope requires.
- Package manager: pnpm.

## Architecture Constraints
1. Reuse the existing Mission Control seed behavior by extracting generic product-line config/application primitives rather than rewriting the seeder from scratch.
2. Keep `seed:mission-control` as a compatibility wrapper.
3. Add a generic `seed:product-line` entrypoint that accepts config path, database path, mode, JSON output, and explicit existing-target behavior.
4. Perform config validation and conflict preflight before opening write transactions.
5. Use one transaction for apply mutations.
6. Preserve unrelated history rows, task rows, GitHub sync metadata, and non-config-owned flags.
7. Import workflows through existing workflow-contract import/apply logic.
8. Use existing `resource_policies` shape for governance defaults.
9. Add no Product Line B real config or smoke.

Quote Design Concept decisions when they drive architecture:

- Q1/Q9: checked-in YAML config under `docs/ai/product-lines/`.
- Q2: explicit existing-target apply/verify path and config-owned mutations only.
- Q3: fail closed with structured field/path errors before writes.
- Q4: config-declared workflow contract family/path and required slugs.
- Q5: existing `resource_policies` shape for governance defaults.
- Q6: generic CLI plus Mission Control compatibility wrapper.
- Q7/Q8: no Product Line B; Mission Control parity is the UAT proof.
- Q10: explicit `agentPrefix` and product-line-scoped assignments.
- Q11: feature flag registry validation and disabled/absent future flags.
- Q12: target-config-aware residue conflicts with redacted evidence and no automatic deletion.

Plan must list exact files likely touched and explain why each is in scope. If the design cannot stay within the strict scope, stop and propose a split instead of expanding.
```

### Expected Plan Artifacts

- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/` for YAML config schema, CLI JSON result shapes, and validation error codes
- `quickstart.md`
- updated agent context if the SpecKit toolchain requires it

### Plan Gate Checklist

- [x] No migration.
- [x] No new runtime dependency.
- [x] No GitHub mutation or autonomous execution path.
- [x] Existing SPEC-009B Mission Control seed behavior remains covered.
- [x] Product Line B stays out of scope.
- [x] UAT/manual verification path is concrete.

### Plan Result

| Field | Result |
|-------|--------|
| Status | Complete |
| Generated artifacts | `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/product-line-seed-config.md`, `contracts/cli-result-envelope.md`, `contracts/validation-error-codes.md` |
| Context update | `AGENTS.md` active technology/storage entries added by SpecKit agent context update |
| Marker scan | 0 gaps, 0 clarifications, 0 findings |
| G3 gate | Pass: `validate-gate.sh G3 specs/010a-generic-product-line-seeder` returned `pass=true` |
| Scope result | One primary surface (`seed/config`); no migration, new runtime dependency, UI, GitHub mutation, Product Line B, dispatch, claim, runner, sandbox, adapter, or auto-merge scope |

### Checklist Progress

| Domain | Status | Items | Gaps | Result |
|--------|--------|-------|------|--------|
| data-integrity | Complete | 25 | 1 found, 1 remediated | Expanded no-mutation snapshot evidence across config-owned seed surfaces plus all preserved operational/history surfaces; final marker count 0 |
| state-management | Complete | 25 | 0 | Lifecycle, mode boundaries, wrapper compatibility, facility/global assignment separation, Product Line B exclusion, and no autonomous work state covered; final marker count 0 |
| error-handling | Complete | 26 | 0 | Stable JSON codes, config paths/fields, redacted evidence, fail-closed validation, transaction boundaries, no partial writes, and no-mutation proof covered; final marker count 0 |
| security | Complete | 19 | 2 found, 2 remediated | Added explicit untrusted operator-evidence redaction/no-raw-hash requirements and safe single-document non-executing YAML parsing with remote-reference rejection; final marker count 0 |
| reliability | Complete | 26 | 1 found, 1 remediated | Promoted rollback-by-no-op, no-migration rollback boundary, not-mutated evidence, and manual backup-restore or reviewed re-apply recovery path into operator-facing spec and quickstart evidence; G4 passed with 0 markers |

---

## Phase 4: Checklist

**When to run:** After Plan. Target focused domains because this spec touches seed config, SQLite state, CLI evidence, safety validation, and operator process.

### Checklist Domains

Run at least these domains:

```bash
$speckit-checklist data-integrity

Focus on Generic Product-Line Seeder requirements:
- YAML config maps deterministically to workspace, department, assignment, workflow-template, feature-flag, and governance rows.
- Existing target apply/verify preserves task/history rows and non-config-owned state.
- Invalid config and residue conflicts prove no mutation by hash/count evidence.
- Pay special attention to idempotent apply-twice Mission Control parity.
```

```bash
$speckit-checklist state-management

Focus on Generic Product-Line Seeder requirements:
- Product-line workspace lifecycle is explicit for new, existing, preflight, apply, and verify modes.
- `seed:mission-control` wrapper remains compatible while generic CLI owns reusable behavior.
- Facility/global agents remain outside product-line assignment unless explicitly shared by role.
- Pay special attention to no Product Line B onboarding and no autonomous work state.
```

```bash
$speckit-checklist error-handling

Focus on Generic Product-Line Seeder requirements:
- Structured JSON errors include stable codes, config paths, field names, and redacted evidence.
- Missing workflow slugs, invalid flags, unsafe governance, conflicting repos, and existing-target policy failures fail closed.
- Partial writes are impossible for validation failures.
- Pay special attention to transaction boundaries and no-mutation proof.
```

```bash
$speckit-checklist security

Focus on Generic Product-Line Seeder requirements:
- Operator evidence and residue output are redacted.
- YAML parsing does not execute code or load remote refs.
- GitHub repo and feature flag inputs are validated before writes.
- Pay special attention to preventing accidental future runner/sandbox/auto-merge activation.
```

```bash
$speckit-checklist reliability

Focus on Generic Product-Line Seeder requirements:
- Preflight/apply/verify output is stable enough for operator runbooks and CI.
- Apply-twice evidence is deterministic.
- Verify-mode detects drift from config without mutating.
- Pay special attention to compatibility wrapper behavior and rollback-by-no-op expectations.
```

### Checklist Gate Checklist

- [x] Every `[Gap]` is remediated or marked out of scope with rationale.
- [x] Checklist findings do not widen the spec into SPEC-010B or runtime execution work.

---

## Phase 5: Tasks

**When to run:** After checklists complete. Output: `specs/010a-generic-product-line-seeder/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-010A using:

- `docs/ai/specs/SPEC-010A-design-concept.md`
- `docs/ai/specs/SPEC-010A-workflow.md`
- `specs/010a-generic-product-line-seeder/spec.md`
- `specs/010a-generic-product-line-seeder/plan.md`
- `specs/010a-generic-product-line-seeder/research.md`
- `specs/010a-generic-product-line-seeder/data-model.md`
- `specs/010a-generic-product-line-seeder/contracts/`
- all completed checklists

Task groups should cover:

1. RED tests for product-line config parsing and required fields.
2. RED tests for invalid config no-mutation behavior.
3. RED tests for existing target explicit apply/verify policy.
4. Generic seed types and validator extraction from Mission Control seed constants.
5. Mission Control YAML config under `docs/ai/product-lines/`.
6. Generic `seed:product-line` CLI modes and JSON output.
7. `seed:mission-control` compatibility wrapper.
8. Workflow contract family/path/required slug validation through existing importer.
9. Feature flag registry validation and disabled/absent future flags.
10. Agent prefix assignment and facility/global separation.
11. Governance defaults using existing `resource_policies`.
12. Target-config-aware residue conflict preflight with redacted evidence.
13. Mission Control apply-twice/verify parity evidence.
14. Operator docs/runbook updates.
15. Static/diff guardrails for no Product Line B, no GitHub mutation, no dispatch/claim/runner/sandbox/adapter/auto-merge drift.

Tasks must include explicit verification commands and should mark parallel-safe work only where file ownership is disjoint.
```

### Tasks Gate Checklist

- [x] Every acceptance criterion has task coverage.
- [x] RED tasks precede implementation tasks for production code.
- [x] No task implements Product Line B onboarding or external mutations.
- [x] Final verification includes focused tests, typecheck/lint/build as required, and operator-readable parity/no-mutation evidence.

### Tasks Progress

| Status | Tasks | Phases | Parallel-safe | Gate | Reviewability |
|--------|-------|--------|---------------|------|---------------|
| Complete | 73 | 8 | 8 tasks marked `[P]` | G5 passed with 0 markers | `reviewability-gate.sh tasks` returned `status:"exception"` under the ratified transition exception; post-implementation diff gate remains required |

---

## Phase 6: Analyze

**When to run:** After tasks. Analyze all artifacts before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze consistency across:

- `docs/ai/specs/SPEC-010A-design-concept.md`
- `docs/ai/specs/SPEC-010A-workflow.md`
- `specs/010a-generic-product-line-seeder/spec.md`
- `specs/010a-generic-product-line-seeder/plan.md`
- `specs/010a-generic-product-line-seeder/tasks.md`
- all generated checklists and contracts

Primary risks:

1. Any drift into Product Line B real config, smoke, live enablement, or disablement.
2. Any GitHub mutation, task creation, successor creation, claim, scheduler, runner, sandbox, adapter, or auto-merge behavior.
3. Missing no-mutation proof for invalid configs and blocked preflight.
4. Existing `seed:mission-control` compatibility breakage.
5. Mission Control parity weaker than SPEC-009B evidence.
6. Feature flag registry validation gaps or accidental future flag activation.
7. Workflow contract import bypassed by manual template SQL.
8. Existing target policy ambiguity.
9. Config schema or CLI output too vague for SPEC-010B reuse.

Remediate CRITICAL/HIGH findings before implementation. Do not widen scope; split if necessary.
```

### Analyze Gate Checklist

- [x] Marker scans are clean.
- [x] No CRITICAL/HIGH findings remain.
- [x] Any MEDIUM/LOW accepted risks are recorded with owner and follow-up.

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A1 | MEDIUM | PR review packet traceability stopped at FR-029 / SC-013 after checklist remediation added FR-030 / SC-014 | Updated plan traceability to FR-001 through FR-030 and SC-001 through SC-014 |
| A2 | MEDIUM | Preserved non-owned operational/history surfaces were inconsistent across spec, tasks, quickstart, and checklist wording for evidence/read-model state | Aligned spec, tasks, quickstart, and data-integrity checklist with issues, histories, and task evidence/read-model state |

---

## Phase 7: Implement

**When to run:** After Analyze passes. Execute tasks from `tasks.md`.

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-010A from `specs/010a-generic-product-line-seeder/tasks.md`.

Strictly follow:

- TDD red-green-refactor.
- Design Concept decisions Q1-Q12.
- Plan strict scope and generated contracts.
- Existing repo patterns for mission-control seed, workflow-contract import, feature-flag registry, and structured CLI JSON.

Do not implement:

- Product Line B real config, smoke, enablement, disablement, or live UAT.
- GitHub issue/comment/close/label mutation.
- Runtime/admin config authoring UI.
- New migration/table or runtime dependency.
- Task/successor creation, claims, polling, runner state, sandbox lifecycle, harness adapters, or auto-merge policy.
- Automatic cleanup/deletion/unlinking of conflicting residue.
- `$speckit-setup` invocation or SDD worktree creation.

Verification must prove Mission Control parity, apply-twice idempotency, verify-mode drift detection, invalid-config no-mutation, existing-target safety, structured redacted errors, wrapper compatibility, and strict absence of Product Line B/runtime execution drift.
```

### Implementation Notes

- Work only inside branch `010a-generic-product-line-seeder`.
- Keep implementation branch-local until PR review.
- Record verification evidence in this workflow before PR creation.
- If only docs/config/CLI surfaces change, browser verification is not expected unless later artifacts add UI.

### Implementation Progress

| Group | Tasks | Status | Verification |
|-------|-------|--------|--------------|
| Setup And Foundations | T001-T018 | Complete | `direnv exec . pnpm test src/lib/__tests__/product-line-seed.test.ts src/lib/__tests__/product-line-seed-cli.test.ts`, `direnv exec . pnpm typecheck`, and `direnv exec . pnpm lint` passed |

### Completion Checklist

- [ ] All generated tasks complete.
- [ ] Focused config/seed/CLI tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm build` passes if production/API files change.
- [ ] Mission Control generic-config apply-twice/verify parity evidence exists.
- [ ] Invalid-config and blocked-preflight no-mutation evidence exists.
- [ ] Roadmap/workflow status synced.
- [ ] PR packet includes review order, traceability, validation, known gaps, and rollback/flag notes.

---

## Project Structure Reference

Likely relevant files and directories:

```text
docs/ai/product-lines/                         # new canonical seed configs
docs/ai/specs/SPEC-010A-design-concept.md      # setup interview source
docs/ai/specs/SPEC-010A-workflow.md            # autopilot workflow source
docs/ai/workflows/mission-control/             # existing workflow contract source
docs/runbooks/mission-control-seed-predeploy.md
scripts/seed-mission-control-product-line.ts   # compatibility wrapper/input
src/lib/mission-control-seed/                  # existing seed behavior to generalize
src/lib/workflow-contracts/                    # existing contract import/apply path
src/lib/feature-flags.ts                       # registry validation source
src/lib/__tests__/mission-control-seed/         # existing parity tests and fixtures
specs/010a-generic-product-line-seeder/         # generated SpecKit artifacts
```

---

## Lessons Learned

### What Worked Well

- Pending implementation.

### Challenges Encountered

- Pending implementation.

### Patterns to Reuse

- Pending implementation.

---

Template based on SpecKit best practices and populated for SPEC-010A setup. The Design Concept doc remains the source of truth for setup-time decisions.
