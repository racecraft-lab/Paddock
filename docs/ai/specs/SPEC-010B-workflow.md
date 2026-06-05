# SpecKit Workflow: SPEC-010B - Product Line B Onboarding Smoke

**Template Version**: 1.0.0, populated for Paddock
**Created**: 2026-06-05
**Purpose**: Prepare and execute RC Factory Phase 9B by onboarding a disabled second product line, proving isolated seed/smoke behavior, and preserving Product Line A plus active SPEC-014C harness-adapter work.

---

## How to Use This Workflow

Run from the dedicated worktree:

```bash
cd .worktrees/010b-product-line-b-smoke
$speckit-autopilot docs/ai/specs/SPEC-010B-workflow.md
```

Codex skills use `$skill-name` invocation. Do not run slash-command variants in Codex.

---

## Design Concept

This workflow was enriched from the Grill Me interview required by `$speckit-scaffold-spec`.

```text
docs/ai/specs/SPEC-010B-design-concept.md
```

The design concept is the setup-time source of truth:

- Product Line B identity is generic: slug `product-line-b`, display name `Product Line B`, and agent prefix `plb-platform`.
- Product Line B is disabled by default, enabled only for smoke, and disabled cleanly afterward.
- The smoke target is `racecraft-lab/Paddock` using synthetic Product Line B issue metadata.
- Required implementation evidence must not require a live GitHub write; live GitHub issue creation is optional HAL UAT evidence only.
- Paddock-owned fake/harness agents are the default substrate for the smoke path.
- Retained hidden/offline FocusEngine/OpenClaw identities are not Product Line B and must not be reused without explicit profile generalization and assignment.
- Product Line A seed identity, GitHub sync ownership, tasks, and metrics remain unaffected.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Setup | `$speckit-scaffold-spec` | Complete | Branch, design concept, reviewability preset, workflow, and roadmap setup status created |
| Specify | `$speckit-specify` | Complete | Generated `specs/010b-product-line-b-smoke/spec.md` with 5 user stories, 15 FRs, 11 acceptance scenarios, 7 success criteria, and 0 clarification markers; G1 passed |
| Clarify | `$speckit-clarify` | Complete | Resolved config, lifecycle, synthetic smoke, evidence, API/dashboard isolation, runtime-inventory boundary, and SPEC-014C parallel-safety details; G2 passed with 0 markers |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, contracts, quickstart, and Codex agent context; G3 ready |
| Checklist | `$speckit-checklist` | Complete | Completed data-integrity, state-management, api-contracts, ux, error-handling, and security domains; G4 passed |
| Tasks | `$speckit-tasks` | Complete | Generated 47 TDD-first tasks with strict file ownership and SPEC-014C guardrails; G5 passed |
| Analyze | `$speckit-analyze` | Complete | One HIGH shared-file ownership finding remediated; final marker count is 0 and G6 passes |
| Implement | `$speckit-implement` | Pending | G6 passed; latest `main` includes SPEC-014C closeout, clearing the prior shared-file blocker. Keep pre-edit ownership checks before touching shared coordination files |

**Status Legend:** Pending | In Progress | UAT Pending | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `010b-product-line-b-smoke`; design concept and workflow exist; reviewability preset resolves; roadmap marks SPEC-010B `In Progress` on this branch only |
| G1 | After Specify | Requirements cover Product Line B config, disabled/enabled/disabled lifecycle, synthetic smoke, isolation assertions, and no FocusEngine/OpenClaw reuse |
| G2 | After Clarify | Config fields, smoke issue shape, evidence envelope, API/dashboard metrics, HAL UAT steps, and parallel SPEC-014C file boundaries are resolved |
| G3 | After Plan | Architecture reuses SPEC-010A seed tooling and existing Paddock APIs/tests; migration, dependency, GitHub mutation, and adapter work are either absent or explicitly justified |
| G4 | After Checklist | All `[Gap]` findings are remediated without widening into SPEC-014C, SPEC-014D, scheduler/claim/retry, or live GitHub mutation scope |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, and separated from active SPEC-014C adapter files |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; artifacts agree with Design Concept Q1-Q5 and setup preflight evidence |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, seed preflight/apply/verify proof, synthetic smoke proof, disablement proof, docs status, branch commit, and push are complete |

---

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Product Line A behavior, existing Paddock seed behavior, GitHub sync ownership, and dashboard metrics must remain unchanged | Product Line A before/after SQL/API assertions and regression tests |
| II. Install Compatibility Discipline | Keep deployment/runtime assumptions compatible with standalone Paddock and HAL service Node | `pnpm build`, service-compatible HAL command notes, and no new unmanaged runtime requirement |
| III. OpenClaw Adapter Isolation | Retained OpenClaw/FocusEngine runtime identities stay unassigned unless explicitly generalized and assigned | Runtime-inventory/agent assignment tests and HAL preflight evidence |
| IV. Test-First Development | RED tests define Product Line B config, disabled lifecycle, synthetic smoke, and isolation assertions before implementation | Focused Vitest/Playwright tests fail before code changes and pass after |
| V. Feature-Flag Resolution Discipline | Feature flags are config-owned and validated through existing registry behavior; no ad hoc `process.env.FEATURE_*` checks | Unit tests and guardrail grep |
| VI. Dependency Supply-Chain Hygiene | No new runtime dependency planned; reuse existing `yaml`, Next.js, React, Zustand, `better-sqlite3`, Vitest, and Playwright stack | `package.json`/lockfile diff review |
| VII. Additive Migration Policy | Prefer no migration; if disabled product-line state needs schema support, justify an additive migration with rollback SQL | Plan constitution gate, migration diff review, rollback test if needed |
| VIII. Successor Side-Effect Parity | Synthetic smoke must not create unintended successors, claims, runner launches, or auto-merge actions | Task/disposition/artifact assertions and scope guardrails |
| X. Observability and Auditability | Seed, enable, smoke, disable, and cleanup produce structured evidence suitable for operator review | CLI/API JSON evidence and smoke checklist update |
| XVI. Reviewability And Verification Debt Control | Keep implementation to seed/config plus smoke evidence; do not enter SPEC-014C adapter modules | Reviewability gate, tasks file ownership, and analyze scope guard |

**Constitution Check:** Setup validated branch, package manager, reviewability preset, preflight evidence, and no-autopilot boundary. Re-check in Specify and Plan before implementation.

### Setup Evidence

- Spec ID: SPEC-010B
- Branch: `010b-product-line-b-smoke`
- Worktree: `.worktrees/010b-product-line-b-smoke`
- Package manager: pnpm from `pnpm-lock.yaml`
- SpecKit CLI: `/Users/fredrickgabelmann/.local/bin/specify`
- Remote: `origin` (`https://github.com/racecraft-lab/Paddock.git`)
- Current base: `origin/main` at `4d318b77` (`Fix docs hygiene setup guidance (#75)`)
- Reviewability preset: `speckit-pro-reviewability`
- Template resolution:
  - `spec-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/spec-template.md`
  - `plan-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/plan-template.md`
  - `tasks-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/tasks-template.md`

### Reviewability Setup Gate

The roadmap-wide setup gate passed under the transition exception. Downstream work must stay narrower than the roadmap-wide heuristic and must record the split decision in generated artifacts.

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"primary_surfaces":["API","UI","harness/adapter","or docs/process","scheduler/runtime","schema/migration","seed/config"],"thresholds":{"warn":{"reviewable_loc":400,"production_files":6,"total_files":15,"primary_surfaces":1},"block":{"reviewable_loc":800,"production_files":8,"total_files":25,"primary_surfaces":1}},"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

### HAL Preflight Evidence

- HAL service worktree: `/home/fredrick-gabelmann/paddock`
- HAL data directory: `/home/fredrick-gabelmann/paddock-data`
- HAL database: `/home/fredrick-gabelmann/paddock-data/paddock.db`
- Active services during inspection: `paddock.service`, `openclaw-gateway.service`
- Preflight command used service-compatible `/usr/bin/node` v24.15.0 because interactive Node v26 can hit a `better-sqlite3` ABI mismatch.
- Generic seed preflight returned `ok: true`, `mode: preflight`, `status: ready`, `mutation_status: not_mutated`, empty residue, and matching before/after snapshot hash.
- Direct live DB inspection found Paddock repo/project/sync ownership only, with no FocusEngine project/task/sync/assignment residue.
- Retained hidden/offline FocusEngine agent rows and OpenClaw config entries remain inventory, not Product Line B.

### Parallel Safety With SPEC-014C

SPEC-014C is active in another worktree/session. SPEC-010B may run in parallel only while it owns seed/config, product-line isolation, synthetic smoke, and read-only dashboard/API assertions.

Allowed SPEC-010B surfaces:

- `docs/ai/product-lines/product-line-b.yaml`
- Existing product-line seed config validation and CLI tests around `seed:product-line`
- Focused seed/smoke docs and checklist evidence
- Per-workspace/product-line API or dashboard assertions needed to prove isolation
- Test fixtures that create Product Line B synthetic issue metadata

Avoid or stop before editing:

- `src/lib/adapters/**`
- Harness adapter manifest/fake/real adapter registries owned by SPEC-014B/SPEC-014C
- Sandbox lifecycle owner implementations unless only read-only assertions are needed
- OpenClaw deployment docs except for HAL UAT notes
- Runtime-inventory eligibility rules unless the change is a read-only Product Line B assignment assertion and does not affect SPEC-014C behavior

If the active SPEC-014C branch touches a file SPEC-010B needs, stop and resolve file ownership before editing.

Shared coordination files are not SPEC-014C artifacts, but they are active-worktree collision surfaces. Before SPEC-010B edits `tsconfig.spec-strict.json`, `eslint.config.mjs`, `docs/ai/rc-factory-technical-roadmap.md`, or `docs/ai/specs/autopilot-state.json`, compare `git worktree list --porcelain` with the active SPEC-014C dirty/diff file list. If SPEC-014C has changes to the same file, stop and resolve ownership first; SPEC-010B must not merge, overwrite, or normalize SPEC-014C changes.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-010B |
| Name | Product Line B Onboarding Smoke |
| Branch | `010b-product-line-b-smoke` |
| Dependencies | SPEC-009C4, SPEC-010A |
| Enables | SPEC-012B |
| Priority | P2 |
| Scope source | Phase 9B - Product Line B onboarding smoke |
| Acceptance criteria source | Phase 9B Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Onboard Product Line B as the second product line, provision or register isolated agents through the configured harness substrate, configure its canonical repo, and run one live or synthetic issue through the already-proven pilot subset. Paddock Product Line A must remain unaffected.

### Strict Scope

Allowed:

- Product Line B checked-in seed config and validation.
- Disabled-by-default seed behavior and explicit enable/disable smoke lifecycle.
- Synthetic issue metadata linked to `racecraft-lab/Paddock`.
- Reuse of SPEC-010A generic product-line seeder and existing workflow-contract importer.
- Paddock-owned fake/harness agents for the smoke path.
- SQL/API/dashboard assertions proving Product Line A isolation and shared facility-agent reuse where applicable.
- Smoke checklist path and HAL/operator evidence.
- Target-config-aware preflight proof that reports residue but never deletes automatically.

Forbidden:

- Required live GitHub issue creation, comments, labels, closes, or other live GitHub writes during implementation.
- FocusEngine as the Product Line B identity.
- Reuse of retained OpenClaw/FocusEngine runtime agents without explicit profile generalization and Product Line B assignment.
- New workflow language.
- Scheduler dispatch authority, claim/reconciliation authority, retry semantics, runner state, sandbox lifecycle implementation, adapter manifest implementation, or auto-merge policy.
- Product Line A seed mutation or takeover of existing Paddock GitHub sync ownership.
- Leaving Product Line B enabled after smoke.

### Success Criteria Summary

- [ ] Product Line B has a reviewed checked-in config with slug `product-line-b`, display `Product Line B`, and agent prefix `plb-platform`.
- [ ] Product Line B seed preflight is no-mutation and blocks conflicting target ownership with redacted evidence.
- [ ] Product Line B apply creates or verifies only config-owned workspace/project/assignment/template/flag/governance rows.
- [ ] Product Line B starts disabled by default and cannot dispatch/sync until explicitly enabled.
- [ ] One synthetic issue-shaped smoke runs through the already-proven pilot subset without a required GitHub write.
- [ ] Product Line B can be disabled cleanly after smoke and leaves no active sync/dispatch path.
- [ ] SQL/API/dashboard checks prove Product Line A rows, metrics, GitHub sync ownership, and tasks are unaffected.
- [ ] Retained FocusEngine/OpenClaw identities remain unassigned inventory unless explicitly generalized and assigned.
- [ ] Smoke evidence records enablement, synthetic issue metadata, pilot subset outcome, disablement, and cleanup.
- [ ] SPEC-012B can use the resulting two-product-line reality as its harness-gardening input.

---

## Phase 1: Specify

**When to run:** Start of SPEC-010B. Focus on WHAT and WHY, not implementation details. Output: `specs/010b-product-line-b-smoke/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Product Line B Onboarding Smoke

### Problem Statement
Paddock has a proven Product Line A seed and a generic product-line seeder, but it has not yet proven that a second product line can be created, enabled, smoked, inspected, and disabled without affecting Product Line A or the active runner/harness-adapter work. SPEC-010B must create the smallest reviewable Product Line B path that proves two-product-line isolation and gives SPEC-012B real behavior to garden.

### Users
- Operator enabling and smoking Product Line B on HAL or a disposable target.
- Maintainer reviewing the seed/config and isolation proof.
- Future SPEC-012B implementer needing real two-product-line drift/cleanup behavior.
- Active SPEC-014C implementer who needs SPEC-010B to avoid adapter file ownership.

### User Stories
- As an operator, I can preflight Product Line B and see a no-mutation proof before any write.
- As an operator, I can seed Product Line B disabled by default and inspect its isolated workspace/project/agent assignment shape.
- As an operator, I can explicitly enable Product Line B for one synthetic Paddock issue smoke and then disable it cleanly.
- As a maintainer, I can prove Product Line A rows, metrics, tasks, and sync ownership were not changed by Product Line B.
- As a future harness-gardening implementer, I can use Product Line B evidence as real two-product-line input without replaying setup assumptions.

### Constraints
- Use the Design Concept at `docs/ai/specs/SPEC-010B-design-concept.md`.
- Product Line B identity is generic: `product-line-b`, display `Product Line B`, agent prefix `plb-platform`.
- Use `racecraft-lab/Paddock` synthetic issue metadata; required implementation evidence must not depend on a live GitHub write.
- Reuse SPEC-010A seed/config tooling wherever possible.
- Product Line B is disabled by default, enabled only for smoke, and disabled after smoke.
- Do not reuse FocusEngine/OpenClaw identities unless the spec explicitly generalizes and assigns them.
- Do not implement harness adapters or conflict with active SPEC-014C files.
- Manual "<1 operator-hour" timing is checklist-only and operator-recorded.

### Out of Scope
- FocusEngine as Product Line B.
- Required live GitHub issue mutation.
- New workflow language.
- Scheduler/claim/retry/runner/sandbox/adapter/auto-merge behavior.
- Product Line A seed mutation.
- Broad dashboard redesign.
```

### Specify Results

Fill in after running:

| Metric | Value |
|--------|-------|
| Functional Requirements | 15 |
| User Stories | 5 |
| Acceptance Criteria | 11 acceptance scenarios; 7 measurable success criteria |
| Clarification markers | 0 |

### Files Generated

- [x] `specs/010b-product-line-b-smoke/spec.md`
- [x] `specs/010b-product-line-b-smoke/checklists/requirements.md`

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G1 | Pass | `validate-gate.sh G1 specs/010b-product-line-b-smoke` returned `pass: true`; marker count is 0 |

---

## Phase 2: Clarify

**When to run:** After Specify if any behavior can be interpreted multiple ways. Maximum 5 targeted questions per session.

### Clarify Sessions

#### Session 1: Product-line config and lifecycle

```bash
$speckit-clarify Focus on Product Line B config fields, disabled-by-default state, explicit enablement, clean disablement, and how `seed:product-line` should represent those states without mutating Product Line A.
```

Expected outcomes:

- Exact config path and fields for Product Line B.
- Whether disabled state is config data, CLI mode data, feature flag data, workspace status data, or a combination.
- No-mutation and existing-target behavior for preflight/apply/verify.

#### Session 2: Synthetic smoke and evidence

```bash
$speckit-clarify Focus on the synthetic Paddock smoke issue shape, pilot subset path, evidence envelope, cleanup proof, and optional HAL live GitHub issue evidence boundary.
```

Expected outcomes:

- Synthetic issue metadata schema and label/name convention.
- Smoke success/failure states.
- Required cleanup counters and evidence files.

#### Session 3: Isolation assertions

```bash
$speckit-clarify Focus on SQL, API, and dashboard assertions proving Product Line A is unaffected and Product Line B is independently inspectable.
```

Expected outcomes:

- Exact rows/counts/hashes to compare before and after.
- API routes or dashboard components to verify.
- Shared facility-agent reuse rules, if any.

#### Session 4: Agent substrate and SPEC-014C parallel safety

```bash
$speckit-clarify Focus on Paddock-owned fake/harness agents, retained FocusEngine/OpenClaw inventory, and file ownership boundaries with active SPEC-014C adapter work.
```

Expected outcomes:

- Minimal fake/harness agent set.
- Explicit no-reuse rule for retained FocusEngine/OpenClaw identities.
- Stop conditions for file overlap with SPEC-014C.

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Config and lifecycle | 5 | Accepted canonical `product-line-b.yaml`, no Product Line B repo sync owner, `workspaces.disabled_at` plus workspace flags for lifecycle, no new seed CLI modes, and clean disablement evidence checklist |
| 2 | Synthetic smoke and evidence | 5 | Accepted `spec-010b.synthetic_issue.v1`, required pilot subset of candidate eligibility/root-task/auto-route-hold/side-effect absence, `spec-010b.smoke_evidence.v1`, cleanup proof retaining disabled seed state, and optional manual/redacted/issue-only HAL live GitHub evidence |
| 3 | Isolation assertions | 5 | Accepted Product Line A-scoped hash surface, existing scoped API assertions, active-only normal switcher with temporary smoke-enabled dashboard checks, scoped dashboard metric assertions, and read-only facility/global agent visibility with explicit `plb-platform-*` Product Line B assignments |
| 4 | Agent substrate and parallel safety | 5 | Accepted logical `plb-platform-*` agents separate from harness manifest IDs, target-config-aware retained inventory preflight, no required runtime-inventory `eligible` state without existing read-only proof, hard stop list for SPEC-014C-owned files, and PR/evidence parallel-safety section |

### Consensus Resolution Log

| Phase | Round | Item | Routed Categories | Outcome | Analysts Used |
|-------|-------|------|-------------------|---------|---------------|
| Clarify Session 1 | 1 | Q3 disabled-by-default/final-disabled representation | codebase, spec | Use existing `workspaces.disabled_at` plus workspace `feature_flags`; no new lifecycle table; disablement proof must also assert no active smoke/sync/dispatch eligibility | codebase-analyst, spec-context-analyst |
| Clarify Session 1 | 1 | Q4 seed modes and enablement boundary | codebase, spec | Keep `seed:product-line` limited to `preflight`, `apply`, and `verify`; enable/disable remain smoke lifecycle actions with structured evidence | codebase-analyst, spec-context-analyst |
| Clarify Session 2 | 1 | Q5 optional HAL live GitHub issue boundary | security | Optional manual HAL UAT only; explicit operator approval; existing live-mutation opt-in path; issue-only create/reuse; redacted metadata; missing credentials/permissions skip optional evidence without failing required synthetic smoke | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | 1 | Q3 disabled Product Line B switcher visibility | codebase, spec | Keep normal dashboard switcher active-only; inspect disabled Product Line B through seed verify/API/SQL/evidence and temporary smoke-enabled dashboard scope; absence from normal switcher supports disablement but does not replace eligibility proof | codebase-analyst, spec-context-analyst |
| Clarify Session 4 | 1 | Q1 logical Product Line B agents versus harness manifest IDs | codebase, spec | Seed `plb-platform-*` logical agents; treat `paddock_owned_sandbox_fake` and other harness manifest IDs only as selected-substrate/read-only runtime-inventory evidence, not Product Line B identity or ownership | codebase-analyst, spec-context-analyst |
| Clarify Session 4 | 1 | Q3 runtime-inventory `eligible` state requirement | codebase, spec | Do not require runtime-inventory `eligible` for SPEC-010B closeout; collect runtime-inventory only as existing read-only support evidence and stop before adapter/runtime-inventory/SPEC-014C file ownership overlap | codebase-analyst, spec-context-analyst |

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G2 | Pass | `validate-gate.sh G2 specs/010b-product-line-b-smoke` returned `pass: true`; marker count is 0 |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/010b-product-line-b-smoke/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node.js >=22; HAL service-compatible checks use `/usr/bin/node` v24.15.0.
- Frontend/API: Next.js 16 App Router, React 19, TypeScript 5.7 strict.
- State/UI: Zustand where existing panels need it, Tailwind CSS 3.
- Database: SQLite through `better-sqlite3` and existing synchronous transaction helpers.
- Seed/config: Existing SPEC-010A product-line seeder, YAML config under `docs/ai/product-lines/`, and existing workflow-contract importer.
- Testing: Vitest, Playwright only if UI/dashboard assertions change, ESLint, `pnpm`.

## Constraints
- Reuse `seed:product-line` and existing product-line seed modules before adding new code.
- Prefer no migration. If a disabled workspace/sync lifecycle field is missing, propose only an additive migration with rollback SQL and focused tests.
- No new runtime dependency unless Plan proves existing YAML/TypeScript tooling cannot satisfy the requirement.
- No required live GitHub write in implementation.
- No scheduler dispatch authority, claim authority, retry semantics, runner state, sandbox lifecycle, adapter manifest, or auto-merge behavior.
- Do not edit SPEC-014C-owned adapter files while that autopilot session is active.
- Keep HAL preflight Node ABI caveat in the UAT quickstart.

## Architecture Notes
- Treat `docs/ai/specs/SPEC-010B-design-concept.md` as the setup decision source of truth.
- Start from `docs/ai/product-lines/paddock.yaml` and SPEC-010A tests to design Product Line B config and validation.
- Product Line B config must be operator-reviewable, disabled by default, and isolated by slug/prefix.
- Smoke issue metadata should be synthetic but repo-shaped: owner `racecraft-lab`, repo `Paddock`, Product Line B marker/label, and no required outbound GitHub call.
- Evidence should include preflight no-mutation, apply/verify, enable, smoke, disable, Product Line A before/after assertions, and cleanup proof.
- Retained hidden/offline FocusEngine/OpenClaw identities remain unassigned inventory unless a future spec generalizes them.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Reuses SPEC-010A seed tooling; no migration, new dependency, live GitHub write, or adapter work required |
| `research.md` | Complete | Captures decisions for seeder reuse, existing `workspaces.disabled_at`, synthetic smoke, evidence packet, scoped reads, and SPEC-014C boundary |
| `data-model.md` | Complete | Defines Product Line B config, lifecycle, synthetic issue, evidence packet, Product Line A baseline, and retained inventory report |
| `contracts/` | Complete | Defines seed CLI, smoke evidence, and scoped SQL/API/dashboard evidence contracts |
| `quickstart.md` | Complete | Covers disposable DB and HAL UAT flow, including `/usr/bin/node` v24.15.0 ABI caveat |

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G3 | Ready | `plan.md` architecture reuses SPEC-010A seed tooling and existing scoped Paddock reads; migration, dependency, live GitHub mutation, and adapter work are absent or explicitly out of scope |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run focused checklists that validate spec and plan together.

### Checklist Domain Suggestions

```bash
$speckit-checklist data-integrity
```

Check Product Line A isolation, Product Line B seed idempotency, no-mutation preflight, existing-target behavior, cleanup counters, and snapshot/hash evidence.

```bash
$speckit-checklist state-management
```

Check disabled-by-default lifecycle, explicit enable/disable, sync/dispatch pause semantics, and Product Line B visibility while inactive.

```bash
$speckit-checklist api-contracts
```

Check seed CLI JSON envelope, API/dashboard read models, error codes, and redacted conflict evidence.

```bash
$speckit-checklist ux
```

Check dashboard/operator evidence surfaces only if UI changes are planned; do not create a broad dashboard redesign.

```bash
$speckit-checklist error-handling
```

Check conflicting residue, invalid config, existing target refusal, feature flag off, unauthorized API access, and HAL service Node mismatch notes.

```bash
$speckit-checklist security
```

Check no secret emission, no broad GitHub token use, no live GitHub write requirement, and no unsafe runtime identity takeover.

### Checklist Results

| Domain | Status | Findings | Notes |
|--------|--------|----------|-------|
| data-integrity | Complete | 2 gaps remediated | Added explicit repeated apply/verify idempotency and existing-target outcome evidence across spec, plan, seed CLI contract, and quickstart |
| state-management | Complete | 2 gaps remediated | Enumerated smoke-owned flag/pause proof and exactly-one synthetic smoke enablement evidence |
| api-contracts | Complete | 4 API-domain gaps remediated; 2 security-routed concerns deferred to security checklist | Added seed status/code matrix, redacted error/residue shapes, scoped API/dashboard response paths, and invalid/unauthorized workspace evidence codes |
| ux | Complete | 0 gaps | Dashboard/operator evidence is scoped to existing surfaces and no broad dashboard redesign is introduced |
| error-handling | Complete | 0 gaps | Failure coverage is explicit for residue, invalid config, existing-target refusal, feature flag off, unauthorized API access, optional GitHub skips, and HAL Node ABI notes |
| security | Complete | 0 gaps | Rechecked redaction/access-control concerns from API contracts; secret emission, GitHub token boundaries, runtime identity takeover, and SPEC-014C safety are covered |

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G4 | Pass | All six focused checklist domains exist; `count-markers.sh all specs/010b-product-line-b-smoke` returned 0 gaps, 0 clarifications, 0 critical, and 0 high markers |

---

## Phase 5: Tasks

**When to run:** After Plan and Checklist gaps are resolved. Output: `specs/010b-product-line-b-smoke/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-010B using:
- `specs/010b-product-line-b-smoke/spec.md`
- `specs/010b-product-line-b-smoke/plan.md`
- `docs/ai/specs/SPEC-010B-design-concept.md`

Task generation requirements:
- Start with RED tests for Product Line B config validation, no-mutation preflight, disabled lifecycle, synthetic smoke, and Product Line A isolation.
- Keep task ownership narrow around product-line seed/config, evidence, smoke checklist, and any necessary API/dashboard read assertions.
- Include explicit guardrail tasks proving no live GitHub write requirement, no FocusEngine takeover, and no SPEC-014C adapter file changes.
- Include a pre-edit ownership guard before touching shared strict/lint or status-pointer files that may also be dirty in the active SPEC-014C worktree.
- Include HAL/UAT quickstart tasks that use service-compatible Node and record cleanup counts.
- Keep Product Line B enabled only inside the smoke path and disabled in final state.
- Do not generate tasks for scheduler claim authority, retry UI, runner state, sandbox lifecycle, harness adapter implementation, or auto-merge.
```

### Task Coverage Expectations

- Setup and fixtures.
- Config validation and no-mutation preflight.
- Apply/verify and disabled lifecycle.
- Synthetic smoke path.
- Isolation/API/dashboard assertions.
- HAL/UAT checklist and docs.
- Scope guardrails and final verification.

### Task Results

| Metric | Value |
|--------|-------|
| Total tasks | 47 |
| RED test tasks | 6 |
| User story tasks | US1: 4; US2: 6; US3: 6; US4: 6; US5: 5 |
| Setup/foundational/polish tasks | 20 |
| Parallel groups | Foundational config/fixture/strict/lint tasks; US1 schema/type tasks; US3 smoke lifecycle and US4 scoped evidence after script skeleton; docs/checklist updates after evidence shape stabilizes |
| Primary ownership | `docs/ai/product-lines/product-line-b.yaml`, `src/lib/product-line-seed/*`, `scripts/spec-010b/product-line-b-smoke.ts`, focused tests, SPEC-010B quickstart/workflow, and pilot smoke checklist |
| Forbidden ownership | No tasks edit `src/lib/harness-adapters/**`, `src/app/api/agents/runtime-inventory/**`, `src/lib/task-dispatch.ts`, `src/lib/task-dispatch-codex-app-server.ts`, `scripts/spec-014c/**`, or SPEC-014C artifacts |
| Markers | 0 `[NEEDS CLARIFICATION]`, 0 `[Gap]`, 0 `[CRITICAL]` in `tasks.md` |

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G5 | Pass | `specs/010b-product-line-b-smoke/tasks.md` is dependency ordered, TDD-first, keeps Product Line B enabled only inside the smoke path, includes no-live-GitHub-write/no-FocusEngine-takeover/no-SPEC-014C-edit guardrails, and limits runtime-inventory to optional read-only support evidence |

---

## Phase 6: Analyze

**When to run:** After Tasks. Analyze consistency across spec, plan, tasks, and design concept before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-010B across:
- `docs/ai/specs/SPEC-010B-design-concept.md`
- `docs/ai/specs/SPEC-010B-workflow.md`
- `specs/010b-product-line-b-smoke/spec.md`
- `specs/010b-product-line-b-smoke/plan.md`
- `specs/010b-product-line-b-smoke/tasks.md`

Focus findings on:
- Drift from Design Concept Q1-Q5.
- Any required live GitHub write.
- Any accidental FocusEngine/OpenClaw identity reuse.
- Any Product Line A mutation or missing isolation proof.
- Any missing disabled-by-default or final-disable proof.
- Any file ownership overlap with active SPEC-014C adapter work.
- Any new workflow language, scheduler/claim/retry/runner/sandbox/adapter/auto-merge scope.
- Missing HAL preflight/UAT evidence or cleanup proof.

Block implementation on CRITICAL/HIGH findings. Remediate MEDIUM findings before starting implementation unless explicitly documented as deferred.
```

### Analyze Results

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | Pass |
| HIGH | 0 | Pass after remediating shared-file ownership guard |
| MEDIUM | 0 | Pass |
| LOW | 0 | Pass |

### Analyze Remediation Summary

- Remediated one HIGH finding: SPEC-010B tasks planned early edits to `tsconfig.spec-strict.json` and `eslint.config.mjs` while active SPEC-014C had dirty changes to those same shared coordination files. The plan, tasks, and workflow now require a pre-edit ownership check for shared strict/lint and status-pointer files, and implementation must stop if active SPEC-014C owns the same file.

### Gate Result

| Gate | Result | Evidence |
|------|--------|----------|
| G6 | Pass | Final `count-markers.sh findings specs/010b-product-line-b-smoke` returned 0 CRITICAL, 0 HIGH, 0 MEDIUM, and 0 LOW markers after artifact remediation; artifacts agree with Design Concept Q1-Q5 and preserve the SPEC-014C overlap stop condition |

### Confidence Gate Result

| Mode | Result | Evidence |
|------|--------|----------|
| advisory | Soft skip | `confidence-gate.sh docs/ai/specs/SPEC-010B-workflow.md --mode advisory --threshold 0.90` found no confidence emit and returned `recommended_action: soft_skip`; implementation may proceed under advisory mode |

---

## Phase 7: Implement

**When to run:** Only after Tasks and Analyze gates pass.

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-010B from `specs/010b-product-line-b-smoke/tasks.md`.

Execution rules:
- Follow strict RED-GREEN-REFACTOR for each task group.
- Preserve the Design Concept decisions in `docs/ai/specs/SPEC-010B-design-concept.md`.
- Keep edits inside the SPEC-010B file ownership surfaces unless tasks explicitly prove another file is required.
- Before editing any likely SPEC-014C-owned adapter or runtime-inventory file, stop and ask for file ownership resolution.
- Do not require a live GitHub write for implementation verification.
- Use `pnpm` commands only.
- Run focused tests first, then broaden to typecheck, lint, build, and any required Playwright/API checks.
- Record HAL/operator UAT evidence with service-compatible Node, Product Line A before/after proof, Product Line B disablement, and cleanup counts.
```

### Implementation Ownership Note

Before merging latest `main`, a read-only pre-edit check on 2026-06-05 found active SPEC-014C worktree changes in required SPEC-010B coordination files:

- `tsconfig.spec-strict.json`
- `eslint.config.mjs`
- `docs/ai/specs/autopilot-state.json`
- `docs/ai/rc-factory-technical-roadmap.md`

Latest `origin/main` now includes SPEC-014C closeout and those changes have been merged into this branch. SPEC-010B implementation may proceed, but must still run the pre-edit ownership check before touching shared coordination files and must stop if another active worktree owns the same path.

### Implementation Verification Targets

Minimum expected verification:

- Focused Vitest coverage for config validation, preflight no-mutation, apply/verify behavior, disabled lifecycle, and Product Line A isolation.
- Focused API/component/Playwright coverage if dashboard or API assertions change.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build` or the repository's current build command when Next.js requires the webpack variant.
- `pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --mode preflight --json` against a disposable DB.
- Apply/verify/smoke/disable evidence against a disposable DB before HAL.
- HAL target UAT only after local verification and with explicit cleanup proof.

### Closeout Requirements

- Update `docs/ai/specs/SPEC-010B-workflow.md` with final phase results and evidence.
- Update `docs/ai/rc-factory-technical-roadmap.md` with implementation/UAT status only after the shared-file ownership check confirms SPEC-010B may edit it without colliding with active SPEC-014C changes.
- Update `docs/qa/pilot-smoke-checklist.md` if the smoke checklist path changes.
- Update `docs/ai/specs/autopilot-state.json` only if autopilot owns the active-state pointer during implementation and the shared-file ownership check confirms SPEC-010B may edit it without colliding with active SPEC-014C changes.
- Push the branch and prepare the PR with Product Line A isolation evidence, Product Line B disablement evidence, and parallel-safety notes for SPEC-014C.
