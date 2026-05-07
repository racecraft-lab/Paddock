# SpecKit Workflow: SPEC-009B - Mission Control Product-Line Seed and Flag Activation

**Template Version**: 1.0.0
**Created**: 2026-05-07
**Purpose**: Prepare and execute the RC Factory Phase 8B Mission Control Product Line seed, feature-flag activation, governance seed, and non-dispatch readiness workflow in autopilot.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009b-mission-control-seed`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009B-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-009B-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

Do not start downstream specs from this worktree. SPEC-009B stops after the
Mission Control Product Line A seed, cleanup preflight, workflow-family import,
feature-flag activation, conservative governance seed, docs/runbook evidence,
tests, and non-dispatch guardrails are complete.

No synthetic GitHub issue creation, live pilot smoke, issue claim loop,
dispatch loop, scheduler launch, runner state, sandbox lifecycle, auto-merge,
or harness adapter work belongs in this spec.

---

## Design Concept

Source-of-truth scoping decisions:

- Keep SPEC-009B Mission-Control-specific; SPEC-010A owns generic product-line seeding.
- Upsert `workspaces.slug='mission-control'`, `name='Mission Control'` as Product Line A while preserving `facility` as the Facility/global support row.
- Seed full departments: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Preserve and re-home only existing `racecraft-lab/mission-control` GitHub issue sync state.
- Detect non-Mission-Control sync/project/cron/gateway residue and block with cleanup instructions; do not delete it automatically.
- Document the live FocusEngine cleanup as a SPEC-009B pre-deploy runbook/checklist before deployment.
- Enable Phase 1-7 prerequisite flags and `PILOT_MISSION_CONTROL_E2E`; leave future task-control-plane and sandbox-runner flags off.
- Seed conservative governance policy rows that prove shape/visibility without blocking normal pilot intake.
- Import/apply workflow templates through the SPEC-009A repo-owned workflow contract mechanism.
- Do not create or ingest a synthetic issue in SPEC-009B.
- Verify idempotency, cleanup preflight, and non-dispatch behavior.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated seed-only spec with preflight, idempotency, and non-dispatch requirements |
| Clarify | `$speckit-clarify` | In Progress | Resolve cleanup preflight, governance thresholds, and contract-slug details |
| Plan | `$speckit-plan` | Pending | Plan seed script/config/tests/runbook over existing Next.js/SQLite/pnpm stack |
| Checklist | `$speckit-checklist` | Pending | Run focused data-integrity, state-management, error-handling, and security checklists |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered implementation tasks |
| Analyze | `$speckit-analyze` | Pending | Verify no scope drift into SPEC-009C/010A/013/014 |
| Implement | `$speckit-implement` | Pending | Implement seed tooling, tests, docs, and status updates |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009b-mission-control-seed`; worktree is clean except intended setup artifacts; no main checkout edits are made |
| G1 | After Specify | Requirements cover Product Line A seed, departments, assignments, repo config, contract-imported workflows, flags, governance, cleanup preflight, idempotency, and non-dispatch; no `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | FocusEngine cleanup boundary, preflight failure shape, governance thresholds, contract slugs, and target-deployment evidence are resolved |
| G3 | After Plan | Architecture reuses existing SQLite schema and SPEC-009A workflow-contract library; no destructive cleanup or new product-line table is introduced |
| G4 | After Checklist | All gaps in data integrity, state lifecycle, error handling, security, and deployment readiness are resolved without widening scope |
| G5 | After Tasks | Tasks cover every acceptance criterion and include tests for clean seed, idempotent rerun, blocked cleanup preflight, and zero dispatch |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; tasks do not include SPEC-009C pilot issue creation, SPEC-010A generic seeding, SPEC-013 control-plane state, or SPEC-014 sandbox work |
| G7 | After Implement | Focused tests, typecheck/lint or justified subset, seed twice verification, pre-deploy checklist, non-dispatch guardrails, roadmap/workflow status updates, branch commit, and push are complete |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009b-mission-control-seed
```

If the executor would create or switch to another branch, stop before Specify.
If supported, set:

```bash
GIT_BRANCH_NAME=009b-mission-control-seed
SPECIFY_FEATURE_DIRECTORY=specs/009b-mission-control-seed
```

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this
workflow:

- Prior merged candidates: SPEC-001, SPEC-002, SPEC-002A, SPEC-003, SPEC-004,
  SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A.
- Current target excluded: SPEC-009B / `specs/009b-mission-control-seed`.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records
  `safeToApplyCleanup=true`, archive success, merge/tree references, and
  recovery commands.
- Do not delete source spec folders silently during setup or this workflow.

### Archive Sweep Results

Executed during SPEC-009B autopilot startup on 2026-05-07.

| Field | Result |
|-------|--------|
| Archive extension | Installed and enabled: `archive` v1.1.0 from `.specify/extensions/archive/extension.yml`; registry source commit `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Branch | `009b-mission-control-seed` |
| Current target | `specs/009b-mission-control-seed` |
| Current target exclusion | Excluded. The directory has not been generated yet because Specify has not run. |
| Active completed spec dirs found | `specs/005-ready-for-owner`, `specs/007-disposition-artifacts`, `specs/008-resource-governance`, `specs/009a-workflow-contract-roundtrip` |
| Cleanup applied | No |
| `safeToApplyCleanup` | `false` |

**Cleanup decision:** No active `specs/**` directory was deleted, moved, or
otherwise cleaned up in this startup pass. Cleanup is disabled because the
worktree is dirty with `docs/ai/specs/autopilot-state.json`; safe cleanup gates
from the archive extension are not satisfied. Archive Sweep evidence is recorded
for traceability only.

### Constitution and PRD Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, and
`docs/ai/specs/SPEC-009B-design-concept.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Existing hierarchy reuse | SQL `workspaces` means Product Line; `projects` means Department; do not add a new product-line table | Spec/plan review and migration guardrails |
| Facility/Product Line separation | Preserve `facility` for Facility/global support and seed `mission-control` as Product Line A | Seed tests and SQL assertions |
| GitHub tracker truth | Preserve only `racecraft-lab/mission-control` issue linkage; do not create local-only pilot work | Seed tests and task queries |
| Workflow policy source | Use repo-owned SPEC-009A workflow contract import/apply path for runtime `workflow_templates` | Contract import tests and slug assertions |
| Feature-flag discipline | Enable only Phase 1-7 pilot prerequisites plus `PILOT_MISSION_CONTROL_E2E`; leave future flags off | Workspace feature flag assertions and static grep |
| Non-destructive cleanup | Detect non-Mission-Control FocusEngine/sync/gateway residue and block; never delete automatically | Preflight tests and runbook checklist |
| Non-dispatch boundary | Seed may configure and move intake only; no claim, launch, scheduler dispatch, synthetic issue, runner, or sandbox | Guardrail greps and database assertions |
| Operator evidence | Pre-deploy cleanup checklist and seed verification are durable docs/artifacts | Docs review and workflow status |

**Constitution Check:** Complete for Phase 0 startup. Re-check after Specify,
Plan, Analyze, and Implement as artifacts become concrete.

### Phase 0 Results

Executed during SPEC-009B autopilot startup on 2026-05-07.

| Check | Result |
|-------|--------|
| Branch guard | Current branch is `009b-mission-control-seed`; feature worktree is active. |
| Worktree scope | Primary checkout is out of scope; startup edits are limited to this feature worktree. |
| Prerequisites script | `all_pass:true`; `is_worktree:true`; branch and feature directory resolved from `docs/ai/specs/SPEC-009B-workflow.md`. |
| MCP availability | Optional MCP checks for `tavily-mcp`, `context7`, and `RepoPrompt` were unavailable; no phase gate depends on them. |
| Package manager | `pnpm`, detected from lockfile. |
| Project commands | Build `pnpm build`; typecheck `pnpm typecheck`; lint `pnpm lint`; unit `pnpm test`; e2e `pnpm test:e2e`; full verify `pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`. |
| Presets/extensions | No presets active; extension registry visible; 18 hook events configured. |
| Constitution startup review | Principles I-VII and related constraints were reviewed before Specify, including zero-regression, upstream compatibility, OpenClaw adapter isolation, test-first behavior, flag discipline, dependency hygiene, and additive migrations. |

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009B |
| Name | Mission Control Product-Line Seed and Flag Activation |
| Branch | `009b-mission-control-seed` |
| Dependencies | SPEC-009A, SPEC-006, SPEC-008 |
| Enables | SPEC-009C, SPEC-010A |
| Priority | P0 |
| Feature flag scope | `PILOT_MISSION_CONTROL_E2E` plus Phase 1-7 prerequisite flags on Product Line A |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009B-design-concept.md` |
| Runtime projection | `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, `resource_policies`, `workspaces.feature_flags` |
| Workflow source | `docs/ai/workflows/mission-control/workflow-contract.yaml` and SPEC-009A workflow-contract library |
| Strict Scope | Mission Control seed script/config/docs, preflight cleanup detection, focused tests, and setup evidence |

### Scope Summary

Seed Mission Control as Product Line A with a `mission-control` workspace,
full PRD department projects, agent assignments, GitHub repo routing, separate
Issue Triage and Issue Remediation workflow families imported through the
SPEC-009A contract mechanism, Phase 1-7 feature flags plus
`PILOT_MISSION_CONTROL_E2E`, and conservative governance policies. Preserve
Mission Control GitHub linkage and sync metadata for existing synced
`racecraft-lab/mission-control` issue tasks by moving them to triage/intake
without dispatching work.

Add a non-destructive preflight that detects non-Mission-Control sync/project,
cron, OpenClaw/gateway, or FocusEngine residue and blocks with operator cleanup
instructions. Document the live `ssh hall` FocusEngine cleanup in a
pre-deploy runbook/checklist before deployment. The seed script itself must not
delete FocusEngine projects, tickets, gateway agents, cron tasks, or any other
non-Mission-Control state.

Do not create or ingest synthetic GitHub issues, run the GitHub-linked pilot,
claim work, dispatch scheduler work, add runner state, add sandbox lifecycle,
or generalize the seeder for Product Line B.

### Success Criteria Summary

- [ ] Running the seed twice leaves exactly one non-facility `mission-control`
  Product Line workspace and preserves the `facility` workspace for global scope.
- [ ] QA, Development, DevSecOps, Marketing, Customer Service, and Finance
  department projects exist under Product Line A; product surfaces remain labels
  or metadata.
- [ ] Agent role assignments exist for researcher, planner, dev, ui,
  devsecops, and qa using Mission Control platform agent names.
- [ ] The Mission Control workspace repo config points to
  `racecraft-lab/mission-control` and only Mission Control issue sync state is
  preserved or re-homed.
- [ ] Issue Triage and Issue Remediation workflow families are imported/applied
  through the SPEC-009A workflow contract mechanism and expected slugs exist.
- [ ] Workspace feature flags include Phase 1-7 pilot prerequisites and
  `PILOT_MISSION_CONTROL_E2E`; future runner/sandbox flags remain off.
- [ ] Conservative enabled governance rows exist and are visible without
  blocking normal pilot intake.
- [ ] Preflight detects non-Mission-Control sync/project/cron/gateway residue
  and exits with an actionable cleanup message without deleting it.
- [ ] Pre-deploy runbook/checklist documents FocusEngine cleanup targets and
  backup/export-first verification.
- [ ] Guardrails prove no synthetic issue, issue claim, dispatch, scheduler
  launch, runner state, sandbox lifecycle, or auto-merge path is introduced.

---

## Phase 1: Specify

**When to run:** At the start of SPEC-009B. Focus on WHAT and WHY, not implementation details. Output: `specs/009b-mission-control-seed/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Mission Control Product-Line Seed and Flag Activation

Create the SPEC-009B seed-only specification for the RC Factory roadmap.

Use these source artifacts:
- `docs/rc-factory-v1-prd.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/SPEC-009B-design-concept.md`
- `docs/ai/workflows/mission-control/workflow-contract.yaml`

Scope:
- Seed Mission Control itself as Product Line A with `workspaces.slug='mission-control'`, `name='Mission Control'`.
- Preserve `workspaces.slug='facility'` as Facility/global support; do not reuse it as Product Line A.
- Seed full departments: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Represent product surfaces like macOS app, UI, website, and docs as task labels/metadata, not projects.
- Map workflow stage roles to Mission Control platform agents per PRD FR-K3.
- Set the Product Line A GitHub repo to `racecraft-lab/mission-control`.
- Preserve and re-home existing synced `racecraft-lab/mission-control` issue tasks to triage/intake without dispatching them.
- Detect non-Mission-Control sync/project/cron/gateway residue, including the known live FocusEngine cleanup concern, and block with cleanup instructions rather than deleting automatically.
- Seed Issue Triage and Issue Remediation workflow families by applying/importing the SPEC-009A repo-owned workflow contract into `workflow_templates`.
- Enable Phase 1-7 prerequisite flags and `PILOT_MISSION_CONTROL_E2E` for Product Line A; keep future runner/sandbox flags off.
- Seed conservative enabled governance policies that prove shape and visibility without blocking normal pilot intake.
- Add operator pre-deploy cleanup checklist/runbook content for `ssh hall` FocusEngine project, tickets, GitHub sync, OpenClaw/gateway agents, and issue-sync cron cleanup before deploying SPEC-009B.
- Prove idempotent seed reruns and non-dispatch guardrails.

Out of scope:
- Generic product-line seeder behavior for Product Line B.
- Synthetic GitHub issue creation or ingestion.
- Live pilot smoke.
- Issue claim, scheduler dispatch, runner state, sandbox lifecycle, harness adapter behavior, auto-merge, or post-merge reconciliation.
- Automatic deletion of FocusEngine or any other non-Mission-Control data.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 26 |
| User Stories | 4 |
| Acceptance Criteria | 15 |
| Success Criteria | 10 |
| Quality Checklist | 16/16 complete |
| G1 Gate | Pass: `spec.md` exists with 0 `[NEEDS CLARIFICATION]` markers |

### Files Generated

- [x] `specs/009b-mission-control-seed/spec.md`
- [x] `specs/009b-mission-control-seed/checklists/requirements.md`

### Specify Scope Notes

- SPEC-009B remains seed-only: no synthetic issue creation, live pilot smoke,
  claim/dispatch/scheduler state, runner state, sandbox lifecycle, auto-merge,
  generic Product Line B seeder, SPEC-013, or SPEC-014 behavior was introduced.
- `.specify/feature.json` points at `specs/009b-mission-control-seed` for
  downstream phases.

---

## Phase 2: Clarify

**When to run:** After Specify. Use Clarify to resolve only details not answered in the design concept.

### Clarify Prompts

#### Session 1: Preflight and Cleanup Boundary

```bash
$speckit-clarify Focus on SPEC-009B preflight behavior:
- exact non-Mission-Control residue classes to detect: synced projects, linked tasks, GitHub repo config, cron issue sync, OpenClaw/gateway agents, and FocusEngine live project state
- required backup/export-first wording for the pre-deploy cleanup checklist
- error shape and exit behavior when residue exists
- proof that seed code never deletes non-Mission-Control state
```

#### Session 2: Seed Data and Idempotency

```bash
$speckit-clarify Focus on SPEC-009B seed identity and idempotency:
- stable slugs/names for Product Line A departments
- role-to-agent assignment rows and duplicate handling
- preserving existing `racecraft-lab/mission-control` issue linkage and sync metadata
- rerun behavior for workspaces, projects, workflow templates, flags, and governance rows
```

#### Session 3: Governance and Workflow Contract

```bash
$speckit-clarify Focus on SPEC-009B governance and workflow-contract import:
- explicit conservative WIP/budget policy thresholds
- expected Issue Triage and Issue Remediation workflow template slugs
- whether `docs/ai/workflows/mission-control/workflow-contract.yaml` already contains the required FR-K2 family
- how seed tooling calls/reuses the SPEC-009A workflow-contract importer without duplicating parser logic
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Preflight and cleanup boundary | Pending | Pending |
| 2 | Seed data and idempotency | Pending | Pending |
| 3 | Governance and workflow contract | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Generates technical implementation blueprint. Output: `specs/009b-mission-control-seed/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Next.js 16 App Router, React 19, TypeScript 5.x, Node >=22
- Database: SQLite via `better-sqlite3`
- Package manager: pnpm
- State/feature flags: existing `workspaces.feature_flags` JSON and `src/lib/feature-flags.ts`
- Workflow contracts: SPEC-009A `src/lib/workflow-contracts/*` plus `scripts/workflow-contracts/workflow-contract-cli.ts`
- Governance: existing SPEC-008 resource policy tables and APIs
- Testing: Vitest for seed/preflight/idempotency; focused Playwright or manual checklist only if UI/runbook verification needs it

## Constraints
- Do not add a new product-line table or rename `workspaces` / `workspace_id`.
- Do not delete FocusEngine or other non-Mission-Control data.
- Do not create or ingest synthetic issues.
- Do not call scheduler dispatch, claim work, launch harnesses, or add runner/sandbox state.
- Keep product-line seed specific to Mission Control; SPEC-010A owns generic seeder extraction.
- Use existing transaction patterns from `better-sqlite3`.
- Preserve GitHub linkage/sync metadata for existing `racecraft-lab/mission-control` tasks.
- Add explicit cleanup preflight failure messages for non-Mission-Control sync/gateway residue.

## Architecture Notes
- Prefer a reviewable fixture/config plus `scripts/seed-mission-control-product-line.ts`.
- Keep seed operations transactional where possible and idempotent by slug/repo/role identity.
- Reuse SPEC-009A workflow-contract importer/apply code instead of duplicating YAML parsing.
- Add tests that run seed twice against a temp database and assert stable row counts.
- Add tests that inject FocusEngine/non-Mission-Control residue and assert blocked preflight with zero deletes.
- Add guardrail tests or greps for forbidden dispatch/synthetic issue/runner/sandbox scope.
- Add a pre-deploy runbook/checklist section for `ssh hall` FocusEngine cleanup and post-cleanup verification.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, execution flow |
| `research.md` | Pending | Seed/preflight/contract decisions if needed |
| `data-model.md` | Pending | Seeded rows and idempotency keys |
| `contracts/` | Pending | CLI/runbook/API contracts if needed |
| `quickstart.md` | Pending | Seed and verification commands |

---

## Phase 4: Domain Checklists

**When to run:** After `$speckit-plan`. Validate both spec and plan together.

### Recommended Checklist Domains

| Domain | Why |
|--------|-----|
| data-integrity | Seed idempotency, workspace/project/assignment/workflow/governance rows, and metadata preservation are the central risk |
| state-management | Feature flags, sync metadata, workflow-template projections, and non-dispatch state must remain consistent |
| error-handling | Preflight must fail closed with actionable cleanup instructions and no partial mutation |
| security | Cleanup/runbook and seed logs must not expose secrets; GitHub/OpenClaw/gateway cleanup must require backup/export first |

### Enriched Checklist Prompts

```bash
$speckit-checklist data-integrity

Focus on SPEC-009B requirements:
- idempotent Product Line A seed reruns
- full department and assignment rows
- preserving Mission Control GitHub linkage/sync metadata
- workflow-template import through repo-owned contract
- governance row creation without duplicates
- blocked preflight writes no deletes and no partial destructive mutation
```

```bash
$speckit-checklist state-management

Focus on SPEC-009B requirements:
- Facility vs Product Line scope remains distinct
- workspace feature flags are scoped to Product Line A
- future runner/sandbox flags remain off
- only Mission Control issue sync state is active after cleanup
- no claim/dispatch/scheduler/runner state is introduced
```

```bash
$speckit-checklist error-handling

Focus on SPEC-009B requirements:
- non-Mission-Control residue detection produces actionable errors
- FocusEngine cleanup remains operator-owned and backup/export-first
- failed contract import preserves existing workflow templates
- seed rerun failures are safe to retry
```

```bash
$speckit-checklist security

Focus on SPEC-009B requirements:
- cleanup docs do not expose secrets or token values
- seed logs/errors avoid leaking GitHub/OpenClaw credentials
- no automatic deletion of live project or ticket data
- operator cleanup requires explicit confirmation and verification
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | Pending | Pending | Pending |
| state-management | Pending | Pending | Pending |
| error-handling | Pending | Pending | Pending |
| security | Pending | Pending | Pending |

---

## Phase 5: Tasks

**When to run:** After checklists complete. Output: `specs/009b-mission-control-seed/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure
- Small, testable chunks.
- Use TDD for seed/preflight/idempotency behavior.
- Reference `docs/ai/specs/SPEC-009B-design-concept.md` for scope decisions and non-goals.
- Organize by independently testable stories:
  1. Seed Product Line A and departments idempotently.
  2. Preserve Mission Control GitHub sync metadata and block non-Mission-Control residue.
  3. Import workflow families from the repo-owned contract.
  4. Enable feature flags and conservative governance rows.
  5. Produce operator runbook/checklist and non-dispatch evidence.

## Constraints
- Production seed script/config/docs likely live in `scripts/`, `docs/`, and focused `src/lib` helpers only if needed.
- Tests should live with existing Vitest patterns under `src/lib/__tests__` or script-specific test locations already used by the repo.
- Do not add runtime dependencies unless Plan proves they are already required and approved.
- Do not modify scheduler, runner, sandbox, or harness adapter paths except guardrail tests if needed.
- Include tasks for roadmap/workflow status updates and validation evidence.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending |
| Phases | Pending |
| Parallel Opportunities | Pending |
| User Stories Covered | Pending |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Cross-artifact consistency across spec.md, plan.md, tasks.md, and `docs/ai/specs/SPEC-009B-design-concept.md`.
2. Coverage for idempotent seed reruns, blocked non-Mission-Control preflight, workflow-contract import, feature flags, governance rows, pre-deploy cleanup docs, and non-dispatch guardrails.
3. Scope drift into SPEC-009C pilot issue creation, SPEC-010A generic seeding, SPEC-013 task-control-plane state, or SPEC-014 sandbox/harness work.
4. Data-integrity risks around preserving existing `racecraft-lab/mission-control` GitHub linkage and sync metadata.
5. Whether FocusEngine cleanup is documented as operator-owned pre-deploy work and not implemented as destructive seed behavior.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no blocking findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task, follow RED -> GREEN -> REFACTOR -> VERIFY.

### Pre-Implementation Setup

1. Verify branch:
   `git rev-parse --abbrev-ref HEAD`
2. Detect package manager from lockfile; this repo uses `pnpm-lock.yaml`.
3. Run focused baseline checks selected by Plan.
4. Confirm no SPEC-009B implementation starts from the main checkout.

### Implementation Notes

- Implement a Mission-Control-specific seed script/config, not a generic product-line seeder.
- Add preflight detection for non-Mission-Control GitHub sync/project/task/cron/gateway residue with zero automatic deletion.
- Add/maintain a pre-deploy checklist that covers `ssh hall` FocusEngine cleanup:
  - backup/export before mutation
  - unlink FocusEngine GitHub repo sync
  - stop/remove issue-sync cron
  - remove related OpenClaw/gateway agent config
  - delete/archive FocusEngine project tasks only after explicit operator confirmation
  - verify only `racecraft-lab/mission-control` remains configured for sync
- Use the SPEC-009A workflow-contract importer/apply path for workflow templates.
- Verify no synthetic issue creation, dispatch, claim, scheduler launch, runner state, sandbox lifecycle, or auto-merge path exists.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | Pending | Pending | Seed/preflight helpers and fixtures |
| Product Line Seed | Pending | Pending | Workspace, departments, assignments, repo config |
| Workflow/Flags/Governance | Pending | Pending | Contract import, flags, policies |
| Docs/Verification | Pending | Pending | Pre-deploy cleanup checklist, tests, guardrails |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `specs/009b-mission-control-seed/tasks.md`
- [ ] Seed runs twice idempotently against focused test database
- [ ] Preflight blocks non-Mission-Control residue without deleting rows
- [ ] Workflow-family slugs exist after contract import/apply
- [ ] Feature flags and governance rows verified for Product Line A
- [ ] Guardrails prove no synthetic issue, claim, dispatch, runner, sandbox, or auto-merge scope
- [ ] Pre-deploy FocusEngine cleanup checklist exists and is linked from workflow evidence
- [ ] `pnpm typecheck` and `pnpm lint` pass, or deviations are documented with focused alternatives
- [ ] Focused Vitest suite passes
- [ ] Roadmap/workflow/spec status updated
- [ ] Branch committed and pushed

---

## Project Structure Reference

```
docs/ai/rc-factory-technical-roadmap.md
docs/ai/specs/SPEC-009B-design-concept.md
docs/ai/specs/SPEC-009B-workflow.md
docs/ai/workflows/mission-control/workflow-contract.yaml
scripts/
src/lib/workflow-contracts/
src/lib/feature-flags.ts
src/lib/resource-*.ts
src/lib/workspaces.ts
specs/009b-mission-control-seed/
```

---

## Lessons Learned

### What Worked Well

- Pending.

### Challenges Encountered

- Pending.

### Patterns to Reuse

- Pending.

---

Template based on SpecKit best practices. This workflow has been populated for SPEC-009B and should be treated as the branch-local execution guide.
