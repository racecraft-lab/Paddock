# SpecKit Workflow: SPEC-009B - Paddock Product-Line Seed and Flag Activation

**Template Version**: 1.0.0
**Created**: 2026-05-07
**Purpose**: Prepare and execute the RC Factory Phase 8B Paddock Product Line seed, feature-flag activation, governance seed, and non-dispatch readiness workflow in autopilot.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009b-paddock-seed`:

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
Paddock Product Line A seed, cleanup preflight, workflow-family import,
feature-flag activation, conservative governance seed, docs/runbook evidence,
tests, and non-dispatch guardrails are complete.

No synthetic GitHub issue creation, live pilot smoke, issue claim loop,
dispatch loop, scheduler launch, runner state, sandbox lifecycle, auto-merge,
or harness adapter work belongs in this spec.

---

## Design Concept

Source-of-truth scoping decisions:

- Keep SPEC-009B Paddock-specific; SPEC-010A owns generic product-line seeding.
- Upsert `workspaces.slug='paddock'`, `name='Paddock'` as Product Line A while preserving `facility` as the Facility/global support row.
- Seed full departments: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Preserve and re-home only existing `racecraft-lab/Paddock` GitHub issue sync state.
- Detect non-Paddock sync/project/cron/gateway GitHub automation or product-line binding residue and block with cleanup instructions; do not delete it automatically. OpenClaw runtime agent inventory alone is not residue.
- Document the live FocusEngine cleanup as a SPEC-009B pre-deploy runbook/checklist before deployment.
- Enable Phase 1-7 prerequisite flags and `PILOT_PADDOCK_E2E`; leave future task-control-plane and sandbox-runner flags off.
- Seed conservative governance policy rows that prove shape/visibility without blocking normal pilot intake.
- Import/apply workflow templates through the SPEC-009A repo-owned workflow contract mechanism.
- Do not create or ingest a synthetic issue in SPEC-009B.
- Verify idempotency, cleanup preflight, and non-dispatch behavior.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated seed-only spec with preflight, idempotency, and non-dispatch requirements |
| Clarify | `$speckit-clarify` | Complete | Resolved cleanup preflight, seed idempotency, governance thresholds, and contract-slug details |
| Plan | `$speckit-plan` | Complete | Planned seed script/config/tests/runbook over existing Next.js/SQLite/pnpm stack |
| Checklist | `$speckit-checklist` | Complete | Ran focused data-integrity, state-management, error-handling, and security checklists |
| Tasks | `$speckit-tasks` | Complete | Generated dependency-ordered implementation tasks |
| Analyze | `$speckit-analyze` | Complete | G6 pass after exit-code task drift correction; no CRITICAL/HIGH markers |
| Implement | `$speckit-implement` | Complete | Implemented seed tooling, tests, docs, status updates, and post-verification evidence |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009b-paddock-seed`; worktree is clean except intended setup artifacts; no main checkout edits are made |
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
009b-paddock-seed
```

If the executor would create or switch to another branch, stop before Specify.
If supported, set:

```bash
GIT_BRANCH_NAME=009b-paddock-seed
SPECIFY_FEATURE_DIRECTORY=specs/009b-paddock-seed
```

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this
workflow:

- Prior merged candidates: SPEC-001, SPEC-002, SPEC-002A, SPEC-003, SPEC-004,
  SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A.
- Current target excluded: SPEC-009B / `specs/009b-paddock-seed`.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records
  `safeToApplyCleanup=true`, archive success, merge/tree references, and
  recovery commands.
- Do not delete source spec folders silently during setup or this workflow.

### Archive Sweep Results

Executed during SPEC-009B autopilot startup on 2026-05-07.

| Field | Result |
|-------|--------|
| Archive extension | Installed and enabled: `archive` v1.1.0 from `.specify/extensions/archive/extension.yml`; registry source commit `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Branch | `009b-paddock-seed` |
| Current target | `specs/009b-paddock-seed` |
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
| Facility/Product Line separation | Preserve `facility` for Facility/global support and seed `paddock` as Product Line A | Seed tests and SQL assertions |
| GitHub tracker truth | Preserve only `racecraft-lab/Paddock` issue linkage; do not create local-only pilot work | Seed tests and task queries |
| Workflow policy source | Use repo-owned SPEC-009A workflow contract import/apply path for runtime `workflow_templates` | Contract import tests and slug assertions |
| Feature-flag discipline | Enable only Phase 1-7 pilot prerequisites plus `PILOT_PADDOCK_E2E`; leave future flags off | Workspace feature flag assertions and static grep |
| Non-destructive cleanup | Detect non-Paddock FocusEngine/sync/gateway GitHub automation or product-line binding residue and block; never delete automatically | Preflight tests and runbook checklist |
| Non-dispatch boundary | Seed may configure and move intake only; no claim, launch, scheduler dispatch, synthetic issue, runner, or sandbox | Guardrail greps and database assertions |
| Operator evidence | Pre-deploy cleanup checklist and seed verification are durable docs/artifacts | Docs review and workflow status |

**Constitution Check:** Complete for Phase 0 startup. Re-check after Specify,
Plan, Analyze, and Implement as artifacts become concrete.

### Phase 0 Results

Executed during SPEC-009B autopilot startup on 2026-05-07.

| Check | Result |
|-------|--------|
| Branch guard | Current branch is `009b-paddock-seed`; feature worktree is active. |
| Worktree scope | Primary checkout is out of scope; startup edits are limited to this feature worktree. |
| Prerequisites script | `all_pass:true`; `is_worktree:true`; branch and feature directory resolved from `docs/ai/specs/SPEC-009B-workflow.md`. |
| MCP availability | Optional MCP checks for `tavily-mcp`, `context7`, and `RepoPrompt` were unavailable; no phase gate depends on them. |
| Package manager | `pnpm`, detected from lockfile. |
| Project commands | Build `pnpm build`; typecheck `pnpm typecheck`; lint `pnpm lint`; unit `pnpm test`; e2e `pnpm test:e2e`; full verify `pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`. |
| Presets/extensions | No presets active; extension registry visible; 18 hook events configured. |
| Constitution startup review | Principles I-VII and related constraints were reviewed before Specify, including zero-regression, install compatibility, OpenClaw adapter isolation, test-first behavior, flag discipline, dependency hygiene, and additive migrations. |
| Doctor health check | Pass: 0 errors, 0 warnings, 2 expected notes because `009b-paddock-seed` has no `plan.md` or `tasks.md` until later autopilot phases. |

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009B |
| Name | Paddock Product-Line Seed and Flag Activation |
| Branch | `009b-paddock-seed` |
| Dependencies | SPEC-009A, SPEC-006, SPEC-008 |
| Enables | SPEC-009C, SPEC-010A |
| Priority | P0 |
| Feature flag scope | `PILOT_PADDOCK_E2E` plus Phase 1-7 prerequisite flags on Product Line A |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009B-design-concept.md` |
| Runtime projection | `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, `resource_policies`, `workspaces.feature_flags` |
| Workflow source | `docs/ai/workflows/paddock/workflow-contract.yaml` and SPEC-009A workflow-contract library |
| Strict Scope | Paddock seed script/config/docs, preflight cleanup detection, focused tests, and setup evidence |

### Scope Summary

Seed Paddock as Product Line A with a `paddock` workspace,
full PRD department projects, agent assignments, GitHub repo routing, separate
Issue Triage and Issue Remediation workflow families imported through the
SPEC-009A contract mechanism, Phase 1-7 feature flags plus
`PILOT_PADDOCK_E2E`, and conservative governance policies. Preserve
Paddock GitHub linkage and sync metadata for existing synced
`racecraft-lab/Paddock` issue tasks by moving them to triage/intake
without dispatching work.

Add a non-destructive preflight that detects non-Paddock sync/project,
cron, OpenClaw/gateway GitHub automation, product-line binding, or FocusEngine
residue and blocks with operator cleanup instructions. Document the live
`ssh hal` FocusEngine cleanup in a pre-deploy runbook/checklist before
deployment. The seed script itself must not delete FocusEngine projects,
tickets, gateway automation, runtime agents, cron tasks, or any other
non-Paddock state.

Do not create or ingest synthetic GitHub issues, run the GitHub-linked pilot,
claim work, dispatch scheduler work, add runner state, add sandbox lifecycle,
or generalize the seeder for Product Line B.

### Success Criteria Summary

- [x] Running the seed twice leaves exactly one non-facility `paddock`
  Product Line workspace and preserves the `facility` workspace for global scope.
- [x] QA, Development, DevSecOps, Marketing, Customer Service, and Finance
  department projects exist under Product Line A; product surfaces remain labels
  or metadata.
- [x] Agent role assignments exist for researcher, planner, dev, ui,
  devsecops, and qa using Paddock platform agent names.
- [x] The Paddock workspace repo config points to
  `racecraft-lab/Paddock` and only Paddock issue sync state is
  preserved or re-homed.
- [x] Issue Triage and Issue Remediation workflow families are imported/applied
  through the SPEC-009A workflow contract mechanism and expected slugs exist.
- [x] Workspace feature flags include Phase 1-7 pilot prerequisites and
  `PILOT_PADDOCK_E2E`; future runner/sandbox flags remain off.
- [x] Conservative enabled governance rows exist and are visible without
  blocking normal pilot intake.
- [x] Preflight detects non-Paddock sync/project/cron/gateway GitHub automation or product-line binding residue
  and exits with an actionable cleanup message without deleting it.
- [x] Pre-deploy runbook/checklist documents FocusEngine cleanup targets and
  backup/export-first verification.
- [x] Guardrails prove no synthetic issue, issue claim, dispatch, scheduler
  launch, runner state, sandbox lifecycle, or auto-merge path is introduced.

---

## Phase 1: Specify

**When to run:** At the start of SPEC-009B. Focus on WHAT and WHY, not implementation details. Output: `specs/009b-paddock-seed/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Paddock Product-Line Seed and Flag Activation

Create the SPEC-009B seed-only specification for the RC Factory roadmap.

Use these source artifacts:
- `docs/rc-factory-v1-prd.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/SPEC-009B-design-concept.md`
- `docs/ai/workflows/paddock/workflow-contract.yaml`

Scope:
- Seed Paddock itself as Product Line A with `workspaces.slug='paddock'`, `name='Paddock'`.
- Preserve `workspaces.slug='facility'` as Facility/global support; do not reuse it as Product Line A.
- Seed full departments: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Represent product surfaces like macOS app, UI, website, and docs as task labels/metadata, not projects.
- Map workflow stage roles to Paddock platform agents per PRD FR-K3.
- Set the Product Line A GitHub repo to `racecraft-lab/Paddock`.
- Preserve and re-home existing synced `racecraft-lab/Paddock` issue tasks to triage/intake without dispatching them.
- Detect non-Paddock sync/project/cron/gateway GitHub automation or product-line binding residue, including the known live FocusEngine cleanup concern, and block with cleanup instructions rather than deleting automatically. OpenClaw runtime agent inventory alone is not a cleanup blocker.
- Seed Issue Triage and Issue Remediation workflow families by applying/importing the SPEC-009A repo-owned workflow contract into `workflow_templates`.
- Enable Phase 1-7 prerequisite flags and `PILOT_PADDOCK_E2E` for Product Line A; keep future runner/sandbox flags off.
- Seed conservative enabled governance policies that prove shape and visibility without blocking normal pilot intake.
- Add operator pre-deploy cleanup checklist/runbook content for `ssh hal` FocusEngine project, tickets, GitHub sync, OpenClaw/gateway GitHub automation or product-line binding cleanup, and issue-sync cron cleanup before deploying SPEC-009B.
- Prove idempotent seed reruns and non-dispatch guardrails.

Out of scope:
- Generic product-line seeder behavior for Product Line B.
- Synthetic GitHub issue creation or ingestion.
- Live pilot smoke.
- Issue claim, scheduler dispatch, runner state, sandbox lifecycle, harness adapter behavior, auto-merge, or post-merge reconciliation.
- Automatic deletion of FocusEngine or any other non-Paddock data.
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

- [x] `specs/009b-paddock-seed/spec.md`
- [x] `specs/009b-paddock-seed/checklists/requirements.md`

### Specify Scope Notes

- SPEC-009B remains seed-only: no synthetic issue creation, live pilot smoke,
  claim/dispatch/scheduler state, runner state, sandbox lifecycle, auto-merge,
  generic Product Line B seeder, SPEC-013, or SPEC-014 behavior was introduced.
- `.specify/feature.json` points at `specs/009b-paddock-seed` for
  downstream phases.

---

## Phase 2: Clarify

**When to run:** After Specify. Use Clarify to resolve only details not answered in the design concept.

### Clarify Prompts

#### Session 1: Preflight and Cleanup Boundary

```bash
$speckit-clarify Focus on SPEC-009B preflight behavior:
- exact non-Paddock residue classes to detect: synced projects, linked tasks, GitHub repo config, cron issue sync, OpenClaw/gateway GitHub automation or product-line binding evidence, and FocusEngine live project state
- required backup/export-first wording for the pre-deploy cleanup checklist
- error shape and exit behavior when residue exists
- proof that seed code never deletes non-Paddock state
```

#### Session 2: Seed Data and Idempotency

```bash
$speckit-clarify Focus on SPEC-009B seed identity and idempotency:
- stable slugs/names for Product Line A departments
- role-to-agent assignment rows and duplicate handling
- preserving existing `racecraft-lab/Paddock` issue linkage and sync metadata
- rerun behavior for workspaces, projects, workflow templates, flags, and governance rows
```

#### Session 3: Governance and Workflow Contract

```bash
$speckit-clarify Focus on SPEC-009B governance and workflow-contract import:
- explicit conservative WIP/budget policy thresholds
- expected Issue Triage and Issue Remediation workflow template slugs
- whether `docs/ai/workflows/paddock/workflow-contract.yaml` already contains the required FR-K2 family
- how seed tooling calls/reuses the SPEC-009A workflow-contract importer without duplicating parser logic
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Preflight and cleanup boundary | 5 recommended answers; 2 consensus items resolved | Detect the full non-Paddock residue set; fail closed before mutation with structured blocked-preflight output and `mutation_status: "not_mutated"`; require backup/export-first cleanup evidence; prove zero deletion with snapshots and guardrails; treat FocusEngine as external cleanup residue inferred from existing Paddock/OpenClaw GitHub automation or product-line binding/GitHub/operator evidence, not a new table; do not treat OpenClaw runtime agent inventory alone as residue when it is generalized, unassigned, not work-eligible, and free of FocusEngine GitHub automation; redact raw tokens, credentials, secrets, and credential-like payloads from all preflight/checklist/log evidence. |
| 2 | Seed data and idempotency | 5 recommended answers; 3 consensus items resolved | Seed six department projects by stable slugs/prefixes; use QA as the only triage/inbox and repo sync-owner department; upsert six PRD role assignments through the existing project-scoped assignment contract and require runtime lookup to derive workspace through `projects`; re-home existing Paddock issue tasks by GitHub identity without creating pilot tasks; use SPEC-009A importer only; canonicalize `PILOT_PADDOCK_E2E` and treat `PILOT_PRODUCT_LINE_A_E2E` as compatibility drift; seed governance rows with stable spec-owned markers. |
| 3 | Governance and workflow contract | 5 recommended answers; 2 consensus items resolved | Seed two enabled, non-blocking advisory budget rows and a visible evaluator-inactive WIP template/visibility row; do not seed blackout or degraded-window rows; treat the current workflow contract as incomplete for FR-K2 and require a narrow contract correction with the required Paddock slugs; reuse SPEC-009A importer library functions directly and override `workspace_id` to the actual seeded `paddock` workspace id; include canonical `PILOT_PADDOCK_E2E` registry/runbook/runtime normalization in SPEC-009B tasks. |

**G2 Gate:** Pass. `spec.md` has 0 `[NEEDS CLARIFICATION]`
markers after Clarify and consensus edits.

**Current Spec Metrics After Clarify:** 35 functional requirements and 14
success criteria.

---

## Phase 3: Plan

**When to run:** After spec is finalized. Generates technical implementation blueprint. Output: `specs/009b-paddock-seed/plan.md`.

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
- Do not add or require `project_agent_assignments.workspace_id`; assignment
  lookup and verification must derive workspace scope through the owning
  `projects` row.
- Do not delete FocusEngine or other non-Paddock data.
- Do not create or ingest synthetic issues.
- Do not create a separate Triage project; QA is the seeded triage/inbox and
  repository sync-owner department for Paddock.
- Do not call scheduler dispatch, claim work, launch harnesses, or add runner/sandbox state.
- Do not seed evaluator-active WIP, blackout, or degraded-window policies unless
  implementation tests prove they cannot block or defer normal pilot intake.
- Keep product-line seed specific to Paddock; SPEC-010A owns generic seeder extraction.
- Use existing transaction patterns from `better-sqlite3`.
- Preserve GitHub linkage/sync metadata for existing `racecraft-lab/Paddock` tasks.
- Add explicit cleanup preflight failure messages for non-Paddock sync/gateway residue.
- Correct `docs/ai/workflows/paddock/workflow-contract.yaml` narrowly so
  it contains the FR-K2 Paddock Issue Triage and Issue Remediation
  slugs before seed readiness; do not accept stale `intake`/`implementation`
  aliases or manually invent runtime template rows in the seed.
- Align the feature-flag registry, resolver exception, runbooks, tests, and seed
  evidence on canonical `PILOT_PADDOCK_E2E`; treat
  `PILOT_PRODUCT_LINE_A_E2E` as legacy compatibility drift, not a second
  persisted workspace flag.
- Treat FocusEngine live project state as external cleanup residue inferred
  from existing Paddock project/task/GitHub sync rows, OpenClaw cron
  issue-sync jobs, gateway/OpenClaw GitHub automation or product-line binding
  configuration, and operator-supplied `ssh hal` pre-deploy evidence; do not
  add a FocusEngine table or cleanup path. Retained OpenClaw runtime agent
  inventory is reusable runtime identity and does not block by itself.
- Redact raw secrets, tokens, passwords, Authorization headers, API keys, and
  credential-like values from seed, preflight, checklist, and log evidence while
  preserving cleanup-safe identifiers, counts, paths, timestamps, booleans, and
  hashes.

## Architecture Notes
- Prefer a reviewable fixture/config plus `scripts/seed-paddock-product-line.ts`.
- Keep seed operations transactional where possible and idempotent by slug/repo/role identity.
- Reuse SPEC-009A workflow-contract importer/apply code instead of duplicating YAML parsing.
- Use `loadWorkflowContractFromFile()` and `importWorkflowContract()` directly
  in seed tooling, overriding the contract `workspace_id` to the actual seeded
  `paddock` workspace id before apply and asserting the required slugs.
- Add tests that run seed twice against a temp database and assert stable row counts.
- Assert stable identity counts for one `paddock` Product Line, one
  preserved `facility` workspace, six department projects, six PRD role
  assignments, required workflow slugs, canonical flags, governance policies,
  and preserved Paddock issue-intake records.
- Add tests that prove SPEC-009B creates zero new pilot tasks, zero workflow-chain
  successor records, and zero per-agent task fan-out.
- Add tests that inject FocusEngine/non-Paddock residue and assert blocked preflight with zero deletes.
- Add guardrail tests or greps for forbidden dispatch/synthetic issue/runner/sandbox scope.
- Add snapshot assertions that blocked preflight leaves non-Paddock
  project/task/sync/cron/gateway evidence unchanged and reports
  `mutation_status: "not_mutated"`.
- Add redaction tests for GitHub/OpenClaw/gateway/cron evidence, including
  free-text error payloads from external state.
- Add governance tests proving enabled advisory token/USD budget rows allow
  normal pilot intake and any WIP visibility row is evaluator-inactive unless
  non-blocking WIP behavior is proven.
- Add a pre-deploy runbook/checklist section for `ssh hal` FocusEngine cleanup and post-cleanup verification.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, execution flow, validation plan |
| `research.md` | Complete | Seed/preflight/contract/governance/flag decisions |
| `data-model.md` | Complete | Seeded rows and idempotency keys |
| `contracts/` | Complete | `seed-cli.md` and `seed-evidence.md` contracts |
| `quickstart.md` | Complete | Seed and verification commands |

**G3 Gate:** Pass. `plan.md` exists with 0 unresolved markers.

**Plan Notes:** `AGENTS.md` was updated by the SpecKit agent-context script to
record SPEC-009B active technologies and storage surfaces.

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
- preserving Paddock GitHub linkage/sync metadata
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
- only Paddock issue sync state is active after cleanup
- no claim/dispatch/scheduler/runner state is introduced
```

```bash
$speckit-checklist error-handling

Focus on SPEC-009B requirements:
- non-Paddock residue detection produces actionable errors
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
| data-integrity | 26 | 0 | `specs/009b-paddock-seed/checklists/data-integrity.md`; idempotency, row identity, GitHub sync preservation, workflow-contract import, governance uniqueness, blocked-preflight non-mutation |
| state-management | 21 | 0 | `specs/009b-paddock-seed/checklists/state-management.md`; Facility/Product Line separation, Product Line A flag scope, future flags off, Paddock-only sync state, no claim/dispatch/scheduler/runner state |
| error-handling | 20 | 0 | `specs/009b-paddock-seed/checklists/error-handling.md`; actionable residue errors, operator-owned backup/export-first cleanup, workflow import failure safety, retry-safe seed reruns |
| security | 28 | 1 found, 1 resolved | `specs/009b-paddock-seed/checklists/security.md`; strengthened operator confirmation before destructive cleanup, backup/export-first evidence, post-cleanup verification, and secret redaction in spec/plan |

**G4 Gate:** Pass. Spec and plan have 0 `[Gap]` markers after all checklist
domains and remediation.

---

## Phase 5: Tasks

**When to run:** After checklists complete. Output: `specs/009b-paddock-seed/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure
- Small, testable chunks.
- Use TDD for seed/preflight/idempotency behavior.
- Reference `docs/ai/specs/SPEC-009B-design-concept.md` for scope decisions and non-goals.
- Organize by independently testable stories:
  1. Seed Product Line A and departments idempotently.
  2. Preserve Paddock GitHub sync metadata and block non-Paddock residue.
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
| Total Tasks | 61 |
| Phases | 7 |
| Parallel Opportunities | 30 tasks marked `[P]` |
| User Stories Covered | 4 |
| G5 Gate | Pass: 61 task entries found |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Cross-artifact consistency across spec.md, plan.md, tasks.md, and `docs/ai/specs/SPEC-009B-design-concept.md`.
2. Coverage for idempotent seed reruns, blocked non-Paddock preflight, workflow-contract import, feature flags, governance rows, pre-deploy cleanup docs, and non-dispatch guardrails.
3. Scope drift into SPEC-009C pilot issue creation, SPEC-010A generic seeding, SPEC-013 task-control-plane state, or SPEC-014 sandbox/harness work.
4. Data-integrity risks around preserving existing `racecraft-lab/Paddock` GitHub linkage and sync metadata.
5. Whether FocusEngine cleanup is documented as operator-owned pre-deploy work and not implemented as destructive seed behavior.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A1 | MEDIUM | `tasks.md` assigned blocked preflight to exit code `3`, conflicting with `contracts/seed-cli.md`, where `2` is blocked preflight and `3` is workflow-contract readiness failure. | Fixed T030 to use exit code `2`; fixed T049 to implement `0`, `2`, `3`, `4`, and `5`. |
| G6 | Pass | No CRITICAL/HIGH findings remain after remediation; targeted checks found no task drift into SPEC-009C pilot issue creation, SPEC-010A generic seeding, SPEC-013 control-plane state, or SPEC-014 sandbox/harness work. | Marker counter reports `critical=0`, `high=0`, `medium=0`, `low=0`. |

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

- Implement a Paddock-specific seed script/config, not a generic product-line seeder.
- Add preflight detection for non-Paddock GitHub sync/project/task/cron/gateway GitHub automation or product-line binding residue with zero automatic deletion.
- Add/maintain a pre-deploy checklist that covers `ssh hal` FocusEngine cleanup:
  - backup/export before mutation
  - unlink FocusEngine GitHub repo sync
  - stop/remove issue-sync cron
  - remove related OpenClaw/gateway GitHub automation or product-line binding config
  - retain OpenClaw runtime agent inventory unless a separate decommission is explicitly approved
  - generalize retained OpenClaw agent labels and workspace files away from FocusEngine/macOS/product-specific text
  - keep retained OpenClaw agents visible but offline or otherwise not work-eligible, with zero project assignments, zero active/assigned tasks, and no GitHub sync/triage cron ownership until SPEC-014B/SPEC-014D add first-class inventory state
  - delete/archive FocusEngine project tasks only after explicit operator confirmation
  - verify only `racecraft-lab/Paddock` remains configured for sync
- Use the SPEC-009A workflow-contract importer/apply path for workflow templates.
- Verify no synthetic issue creation, dispatch, claim, scheduler launch, runner state, sandbox lifecycle, or auto-merge path exists.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | T001-T009 | Complete | Strict/lint/package entries, fixtures, typed seed/preflight contracts, and redaction helpers |
| Product Line Seed | T010-T030 | Complete | Paddock Product Line A, Facility preservation, departments, assignments, QA sync ownership, preserved issue intake, blocked preflight, and CLI modes |
| Workflow/Flags/Governance | T031-T043 | Complete | Required Paddock workflow slugs, SPEC-009A import/apply reuse, canonical `PILOT_PADDOCK_E2E`, future-flag guardrails, and advisory governance rows |
| Docs/Verification | T044-T061 | Complete | Idempotency/verify evidence, non-dispatch guardrails, runbook, quickstart, roadmap/PRD status, and validation results |

### Implementation Results

| Area | Evidence |
|------|----------|
| Seed CLI | `scripts/seed-paddock-product-line.ts` supports `preflight`, `apply`, and `verify` with exit codes `0`, `2`, `3`, `4`, and `5`. |
| Seed library | `src/lib/paddock-seed/*` implements typed seed constants, redaction, preflight scans, transactional seed apply, and verification/evidence helpers. |
| Workflow contract | Paddock contract contains nine required slugs and exports with hash `workflow-contract-hash-v1:sha256:4e485c97c7136a79619c362ba7de26cd9439ea49f60ea54a2f14414a7a287c92`. |
| Feature flags | Runtime registry/runbooks/tests use canonical `PILOT_PADDOCK_E2E`; legacy `PILOT_PRODUCT_LINE_A_E2E` is rejected as persisted workspace drift. |
| Cleanup docs | `docs/runbooks/paddock-seed-predeploy.md` documents backup/export-first FocusEngine project/ticket, OpenClaw/gateway GitHub automation or product-line binding, cron, and repo-sync cleanup before deploy, while allowing retained OpenClaw runtime agent inventory only when generalized, unassigned, not work-eligible, and free of FocusEngine GitHub automation. |
| Non-dispatch | Guardrails assert no synthetic issue, claim, dispatch, scheduler launch, runner state, sandbox lifecycle, generic Product Line B seeder, auto-merge, or reconciliation path. |
| PR | Draft PR opened at `https://github.com/racecraft-lab/Paddock/pull/30` after branch push. |

### Verification Results

| Command | Result |
|---------|--------|
| `pnpm exec vitest run src/lib/__tests__/paddock-seed/redaction.test.ts src/lib/__tests__/paddock-seed/seed.test.ts src/lib/__tests__/paddock-seed/preflight.test.ts src/lib/__tests__/paddock-seed/evidence.test.ts src/lib/__tests__/paddock-seed/guardrails.test.ts` | Pass: 5 files, 19 tests |
| `pnpm exec vitest run src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flag-service.test.ts tests/integration/feature-flag-matrix.test.ts src/lib/__tests__/paddock-seed/redaction.test.ts src/lib/__tests__/paddock-seed/seed.test.ts src/lib/__tests__/paddock-seed/preflight.test.ts src/lib/__tests__/paddock-seed/evidence.test.ts src/lib/__tests__/paddock-seed/guardrails.test.ts` | Pass: 8 files, 74 tests |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm build` | Pass after network-enabled rerun for configured Next.js font fetch |
| `pnpm test:e2e` | Pass after non-sandbox rerun for local server bind: 646 tests |
| `pnpm test` | Existing local daemon socket timeout in `src/lib/__tests__/mc-provisioner-daemon.test.ts`; single-test rerun failed the same way. SPEC-009B focused and related regression suites passed. |

**G7 Gate:** Pass with documented focused-unit, typecheck, lint, build, e2e,
workflow-contract, idempotency, non-dispatch, runbook, status-sync, commit, and
push evidence. Full `pnpm test` retains the unrelated local daemon socket
timeout documented above.

---

## Post-Implementation Checklist

- [x] All tasks marked complete in `specs/009b-paddock-seed/tasks.md`
- [x] Seed runs twice idempotently against focused test database
- [x] Preflight blocks non-Paddock residue without deleting rows
- [x] Workflow-family slugs exist after contract import/apply
- [x] Feature flags and governance rows verified for Product Line A
- [x] Guardrails prove no synthetic issue, claim, dispatch, runner, sandbox, or auto-merge scope
- [x] Pre-deploy FocusEngine cleanup checklist exists and is linked from workflow evidence
- [x] `pnpm typecheck` and `pnpm lint` pass, with full-unit deviation documented against focused alternatives
- [x] Focused Vitest suite passes
- [x] Roadmap/workflow/spec status updated
- [x] Branch committed and pushed

---

## Project Structure Reference

```
docs/ai/rc-factory-technical-roadmap.md
docs/ai/specs/SPEC-009B-design-concept.md
docs/ai/specs/SPEC-009B-workflow.md
docs/ai/workflows/paddock/workflow-contract.yaml
scripts/
src/lib/workflow-contracts/
src/lib/feature-flags.ts
src/lib/resource-*.ts
src/lib/workspaces.ts
specs/009b-paddock-seed/
```

---

## Lessons Learned

### What Worked Well

- Keeping SPEC-009B Paddock-specific prevented premature Product Line B abstraction while still leaving SPEC-010A a clean extraction step.
- Reusing the SPEC-009A workflow-contract importer made workflow-family seeding reviewable and hashable instead of creating ad hoc runtime template rows.
- Focused preflight and evidence tests captured the risky operator boundary: Paddock issue sync is preserved, while FocusEngine project/repo sync and GitHub automation cron cleanup remains explicit and backup/export-first. OpenClaw runtime agent inventory alone is allowed.

### Challenges Encountered

- The initial Next.js build could not fetch configured fonts in the sandbox; the same build passed with network access.
- `pnpm test` still hits the existing `mc-provisioner-daemon.test.ts` local socket timeout. SPEC-009B evidence therefore records focused suites, related feature-flag regressions, typecheck/lint/build, and full e2e separately.
- `node_modules` in the feature worktree lacked installed dependencies for the workflow-contract tooling until `pnpm install --frozen-lockfile` was run in the worktree.

### Patterns to Reuse

- Keep cleanup detection non-mutating and return `blocked_preflight` with `mutation_status: "not_mutated"` before any seed transaction.
- Store spec-owned governance identities in stable notes markers when the policy table has no natural seed key.
- Treat pilot flags as workspace-scoped by default and document the narrow env exception only for operator-temporary `PILOT_PADDOCK_E2E` activation.

---

Template based on SpecKit best practices. This workflow has been populated for SPEC-009B and should be treated as the branch-local execution guide.
