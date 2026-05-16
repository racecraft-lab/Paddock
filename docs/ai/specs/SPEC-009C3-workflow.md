# SpecKit Workflow: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

**Template Version**: 1.0.0
**Created**: 2026-05-16
**Purpose**: Prepare and execute the RC Factory Phase 8C3 pilot Issue Remediation chain from planning through dev implementation, review, Aegis approval, and the `ready_for_owner` gate.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009c3-remediation-ready-for-owner`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009C3-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, Open Questions, and design recommendations live at:

```text
docs/ai/specs/SPEC-009C3-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

Do not start downstream specs from this worktree. SPEC-009C3 stops when the
PR-producing `mission-control_dev_implementation` task is linked to a PR,
has passed review and Aegis gates, has the required artifact/governance
evidence, and reaches `ready_for_owner`.

Manual merge, GitHub merge observation, and `ready_for_owner -> done`
reconciliation belong to SPEC-009C4. Durable run-state, claim authority,
automatic GitHub sync polling, retry/debug control-plane surfaces, sandbox
lifecycle, and harness adapters remain deferred to the later roadmap specs
named in `docs/ai/rc-factory-technical-roadmap.md`.

---

## Design Concept

Source-of-truth scoping decisions:

- The `mission-control_dev_implementation` task is the PR owner and the task
  that becomes `ready_for_owner`.
- Preserve existing workflow slugs; adjust labels, prompts, and copy only when
  nomenclature misleads ownership.
- Review `fix` and Aegis `rejected` outcomes loop or block before
  owner/Aegis readiness. They must not create owner-ready state.
- Aegis approval uses the existing `quality_reviews` / reviewer `aegis`
  surface tied to the PR-producing dev task.
- Automated tests use deterministic fixture-linked PR identity. A real draft
  PR is allowed only in an explicit operator smoke path.
- Stage-scoped artifacts are required for remediation plan, dev verification,
  review verdict, and Aegis approval.
- Governance evidence is advisory in this slice: verify no resource-policy
  violations and no blocked budget/window results without adding claim/run
  state.
- UI changes are allowed only when an existing operator surface must show the
  ready-for-owner or evidence state correctly.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/009c3-remediation-ready-for-owner/spec.md` from roadmap plus design concept; requirements checklist passed |
| Clarify | `$speckit-clarify` | Complete | Resolved loop mechanics, PR ownership, artifact schemas, governance evidence, fixture/live smoke boundary, cleanup, UI scope, and non-slug nomenclature cleanup |
| Plan | `$speckit-plan` | Complete | Generated plan, research decisions, data model, remediation-readiness contract, quickstart, and Codex agent context |
| Checklist | `$speckit-checklist` | Complete | Generated five domain checklists; resolved 9 gaps across data integrity, state lifecycle, error handling, and regression safety; security had 0 gaps; G4 passed |
| Tasks | `$speckit-tasks` | Complete | Generated 70 dependency-ordered TDD tasks with RED-first coverage, guardrails, fixture/live-smoke tasks, and reviewability checkpoint; G5 passed |
| Analyze | `$speckit-analyze` | Complete | Cross-artifact analysis found 0 findings; G6 passed with 0 CRITICAL/HIGH findings |
| Implement | `$speckit-implement` | Complete | Implemented C3 readiness evidence gates, review/Aegis blocking, artifact validation, deterministic fixture checks, and G7 evidence |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009c3-remediation-ready-for-owner`; reviewability preset resolves; worktree is clean except intended setup artifacts; no main checkout edits are made |
| G1 | After Specify | Requirements cover PR ownership, review/Aegis loop semantics, artifact evidence, advisory governance evidence, deterministic PR fixture, opt-in live smoke, and future-spec boundaries; no `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | Loop mechanics, artifact schemas, nomenclature cleanup, Aegis proof, governance evidence, and live/draft PR smoke behavior are resolved |
| G3 | After Plan | Architecture reuses workflow contracts, `advanceTaskChain`, `task_artifacts`, `quality_reviews`, ready-for-owner transition guards, and existing governance surfaces; no claim/run/sandbox/poller surfaces are introduced |
| G4 | After Checklist | All gaps in data integrity, state lifecycle, error handling, security, and regression safety are resolved without widening scope |
| G5 | After Tasks | Tasks include RED tests before production changes and explicit guardrails for no manual merge, no `done` reconciliation, no claim/run state, no sandbox/adapter work, and no dedicated evidence UI |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; generated artifacts do not implement SPEC-009C4/D/E, automatic GitHub sync, claim/reconciliation, runner state, sandboxing, harness adapters, or production evidence UI |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, required fixture smoke evidence, optional operator-initiated live draft PR smoke documentation/cleanup evidence if deliberately run, roadmap/workflow status updates, branch commit, and push are complete |

### Autopilot Phase Accounting

This run must account for every prescribed autopilot step. A phase is complete
only when its artifact and gate evidence are recorded here.

| Step | Required By Autopilot | Status | Evidence |
|------|-----------------------|--------|----------|
| Archive Sweep Startup | Step -1 | Complete | Archive extension `archive` v1.1.0 detected and enabled; current target `specs/009c3-remediation-ready-for-owner` excluded; completed specs already archived in memory and retained in this branch until cleanup diff is intentionally merged |
| Prerequisites | Step 0 | Complete | `check-prerequisites.sh`, command detection, preset detection, branch guard, Node 22 dependency install, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed |
| Specify | Phase 1 / G1 | Complete | `spec.md` and requirements checklist created; G1 pass with 19 FRs, 4 user stories, 12 acceptance scenarios, and 0 clarification markers |
| Clarify | Phase 2 / G2 | Complete | Four sessions completed; consensus log recorded 7 decisions; G2 pass with 0 clarification markers |
| Plan | Phase 3 / G3 | Complete | `plan.md`, `research.md`, `data-model.md`, `contracts/remediation-readiness-contract.md`, `quickstart.md`, Codex agent context update; G3 pass with no clarification markers |
| Checklist | Phase 4 / G4 | Complete | Five domain checklists created; 90 items checked; 9 gaps resolved; G4 passed with 0 `[Gap]` markers |
| Tasks | Phase 5 / G5 | Complete | `tasks.md` generated with 70 tasks, 36 `[P]` opportunities, 4 user stories; G5 passed; reviewability task gate passed under transition exception with size warnings recorded |
| Analyze | Phase 6 / G6 | Complete | Cross-artifact analysis completed with 0 findings; G6 passed with 0 CRITICAL/HIGH findings and no consensus items |
| Implement | Phase 7 / G7 | Complete | All 70 generated tasks checked; G7 passed with 70/70 complete; focused C3 tests, full Vitest, typecheck, lint, build, and scope guard passed |
| Post-Implementation Verify | Post step 10/12 | Complete | Focused C3 Vitest, full Vitest, typecheck, lint, build, and e2e N/A because no UI/browser workflow changed |
| Cleanup / Reviewability / PR | Post steps 13-18 | Complete | G7 pass, implementation diff reviewability gate passed under transition exception, PR review packet generated, branch pushed, PR #48 opened |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009c3-remediation-ready-for-owner
```

If supported, set:

```bash
GIT_BRANCH_NAME=009c3-remediation-ready-for-owner
SPECIFY_FEATURE_DIRECTORY=specs/009c3-remediation-ready-for-owner
```

### Reviewability Gate

Setup reviewability gate result:

```json
{
  "mode": "setup",
  "status": "exception",
  "pass": true,
  "reviewable_loc": 8,
  "production_files": 25,
  "total_files": 0,
  "primary_surface_count": 7,
  "primary_surfaces": [
    "API",
    "harness/adapter",
    "or docs/process",
    "scheduler/runtime",
    "schema/migration",
    "seed/config",
    "UI"
  ],
  "transition_exception": true,
  "warnings": [
    "production files 25 exceeds warn threshold 6",
    "primary surfaces 7 exceeds warn threshold 1"
  ],
  "blockers": [
    "production files 25 exceeds block threshold 8",
    "more than one primary surface requires split or exception"
  ]
}
```

Decision: proceed only because the roadmap carries a transition exception for
the SPEC-009C family. Autopilot must still keep SPEC-009C3 to one primary
implementation surface: Issue Remediation chain execution through
`ready_for_owner` for the pilot path.

### Autopilot Startup Evidence

Prerequisite discovery on 2026-05-16:

- Branch/worktree: `009c3-remediation-ready-for-owner`, isolated worktree,
  clean before setup artifact edits.
- SpecKit CLI found at `/Users/fredrickgabelmann/.local/bin/specify`.
- Package manager: `pnpm`, detected from `pnpm-lock.yaml`.
- Remote: `origin` -> `git@github.com:racecraft-lab/mission-control.git`.
- Reviewability preset detected:
  `speckit-pro-reviewability` for spec, plan, and tasks templates.
- Archive extension: installed and enabled at version `1.1.0`.
- Main checkout note: archive cleanup changes existed uncommitted when this
  setup branch was created; this worktree was created from committed `main`
  `HEAD` (`21c165ba`). Do not assume the setup branch includes those cleanup
  changes unless they are merged separately.

### Constitution and PRD Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, and
`docs/ai/specs/SPEC-009C3-design-concept.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| GitHub tracker truth | The root pilot issue remains GitHub-linked; local-only tasks cannot satisfy the pilot proof | Spec/plan requirements and smoke evidence |
| Successor side-effect parity | Stage advancement uses existing task-chain and task-creation helpers | Code review and tests over `advanceTaskChain` |
| Two-step terminal gate | PR-producing work stops at `ready_for_owner`; no manual merge or done reconciliation in this spec | Transition-guard tests and smoke checklist |
| Durable evidence | Plan, dev verification, review verdict, Aegis approval, governance evidence, and ready-for-owner state are inspectable without terminal archaeology | Artifact/activity assertions |
| Aegis proof | Final approval uses existing `quality_reviews` with reviewer `aegis` on the PR-producing dev task | Unit/integration tests |
| Advisory governance | No resource-policy violation or blocked budget/window result is present for remediation stages | Existing governance/activity evidence; no new claim/run tables |
| Scope control | No automatic poller wiring, claim authority, runner state, sandbox, harness adapter, merge reconciliation, or dedicated evidence UI | Analyze guardrails and code review |
| Test-first development | RED tests define review fix loops, Aegis rejection loops, artifact requirements, governance evidence, and ready-for-owner transition before production changes | Task order and test logs |

### Package Manager and Commands

Package manager: `pnpm`, detected from `pnpm-lock.yaml`.

Use focused checks first, then broaden according to blast radius:

```bash
pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

If Playwright coverage changes because the task board, ready-for-owner lane,
smoke checklist, or workflow diagnostics UI changes, run the focused Playwright
target or `pnpm test:e2e`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009C3 |
| Name | Dev/Review/Aegis to Ready for Owner |
| Branch | `009c3-remediation-ready-for-owner` |
| Dependencies | SPEC-009C2 |
| Enables | SPEC-009C4 |
| Priority | P0 |
| Feature flag scope | `PILOT_MISSION_CONTROL_E2E` plus existing task-chain, artifact, ready-for-owner, Aegis, and governance flags where required |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009C3-design-concept.md` |
| Runtime projection | Existing workflow-template task chain, PR-producing dev task, ready-for-owner transition guard, quality review/Aegis gate, task artifacts, activities, and advisory governance evidence |
| Existing surfaces | `docs/ai/workflows/mission-control/workflow-contract.yaml`, `src/lib/task-dispatch.ts`, `src/lib/task-artifacts.ts`, `src/lib/task-create.ts`, `src/app/api/quality-review/route.ts`, `src/lib/task-status.ts`, `docs/qa/pilot-smoke-checklist.md` |
| Strict Scope | Issue Remediation chain execution, review/Aegis loop behavior, artifact handoff, advisory governance evidence, Aegis approval, PR linkage, and `ready_for_owner` state |

### Scope Summary

Execute the pilot remediation chain after SPEC-009C2 has created a bounded
Issue Remediation planning successor. The chain must produce a remediation
plan, implementation verification evidence, review verdict, Aegis approval,
and advisory governance evidence. The PR-producing
`mission-control_dev_implementation` task must own the linked PR and reach
`ready_for_owner` only after review and Aegis gates pass.

Review `fix` and Aegis `rejected` outcomes must loop or block before owner
readiness and must not create misleading owner-ready state. Manual merge and
`done` reconciliation remain SPEC-009C4.

### Success Criteria Summary

- [x] The remediation planning stage creates durable plan evidence tied to the
  root GitHub issue and downstream PR-producing dev task.
- [x] The dev implementation stage records deterministic PR linkage and dev
  verification evidence on the PR-producing task.
- [x] Review `pass` advances toward Aegis/owner readiness; review `fix` loops
  or blocks without owner/Aegis successors or `ready_for_owner`.
- [x] Aegis `approved` is recorded through existing `quality_reviews` with
  reviewer `aegis`, workspace scope preserved, and final readiness gated on
  that approval.
- [x] Aegis `rejected` loops or blocks with evidence and does not create
  owner-ready state.
- [x] The PR-producing dev task reaches `ready_for_owner` with linked PR,
  plan/dev/review/Aegis artifacts, governance evidence, Aegis approval, and no
  resource-policy violations.
- [x] Automated tests use deterministic fixture-linked PR identity; live draft
  PR smoke is opt-in only.
- [x] Existing slugs remain stable; nomenclature cleanup is limited to labels,
  prompts, or copy that mislead stage ownership.
- [x] No manual merge reconciliation, formal claim-state table, sandbox runner,
  adapter registry, full SpecKit/SDD execution lane, or dedicated evidence UI
  is introduced.
- [x] The roadmap clearly reaffirms that remaining durable governance,
  run-state, claim, and control-plane work belongs to later specs.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/009c3-remediation-ready-for-owner/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

### Problem Statement
SPEC-009C2 proves that an actionable Mission Control pilot issue can be handed
from Issue Triage into Issue Remediation planning. SPEC-009C3 must execute the
next bounded chain stages - remediation planning, dev implementation, review,
and Aegis - until the linked PR-producing task reaches `ready_for_owner`.

### Goals
- Keep the PR-producing `mission-control_dev_implementation` task as the linked
  PR owner and final `ready_for_owner` task.
- Require review `pass` and Aegis `approved` before readiness.
- Route or block review `fix` and Aegis `rejected` before readiness.
- Persist plan, dev verification, review verdict, Aegis approval, and advisory
  governance evidence using existing Mission Control surfaces.
- Use deterministic fixture PR linkage in automated validation and an explicit
  opt-in live draft PR smoke path.
- Preserve workflow slugs while allowing targeted label/prompt/copy cleanup
  where nomenclature misleads ownership.

### Non-goals
- No manual merge, GitHub merge observation, or `ready_for_owner -> done`
  reconciliation. SPEC-009C4 owns that.
- No durable run-state, claim authority, automatic GitHub sync poller,
  retry/debug control-plane UI, sandbox lifecycle, harness adapter, or full
  SpecKit/SDD execution lane.
- No dedicated pilot remediation progress UI unless an existing operator
  surface must be corrected.
- No broad workflow slug migration.

### Existing surfaces to reuse
- `docs/ai/workflows/mission-control/workflow-contract.yaml`
- `src/lib/task-dispatch.ts`
- `src/lib/task-create.ts`
- `src/lib/task-artifacts.ts`
- `src/app/api/quality-review/route.ts`
- `src/lib/task-status.ts`
- `docs/qa/pilot-smoke-checklist.md`

### Required design-source alignment
Use `docs/ai/specs/SPEC-009C3-design-concept.md` as the source of truth for
interview decisions. The spec must cite the decisions from Q1-Q10 when
encoding review loops, PR ownership, nomenclature, governance evidence, Aegis
approval, PR fixture/live smoke behavior, artifacts, roadmap boundaries, Aegis
rejection behavior, and UI scope.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 19 |
| User Stories | 4 |
| Acceptance Criteria | 12 |

### Files Generated

- [x] `specs/009c3-remediation-ready-for-owner/spec.md`
- [x] `specs/009c3-remediation-ready-for-owner/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, before Plan. Run targeted sessions until no critical ambiguity remains.

### Clarify Prompts

#### Session 1: Review and Aegis Loop Semantics

```bash
$speckit-clarify

Focus on review and Aegis state transitions for SPEC-009C3:
- How review `fix` loops or blocks without creating owner-review/Aegis readiness.
- How Aegis `rejected` loops or blocks with bounded retry/activity evidence.
- Which task status, activity reason codes, and retry surfaces are reused.
- How existing workflow-template `next_template_slug` behavior avoids static advancement on failed verdicts.
- Confirm no claim-state, runner-state, or new control-plane table is introduced.
```

#### Session 2: PR Ownership, Ready-for-Owner, and Nomenclature

```bash
$speckit-clarify

Focus on PR ownership and terminology:
- The `mission-control_dev_implementation` task owns `github_repo` and `github_pr_number`.
- That same PR-producing task becomes `ready_for_owner` after review and Aegis approval.
- Existing slugs remain stable; only labels/prompts/copy that mislead ownership may change.
- The root GitHub issue and downstream stage tasks remain traceable without conflating tracker truth.
- Manual merge and done reconciliation remain SPEC-009C4.
```

#### Session 3: Artifact and Governance Evidence

```bash
$speckit-clarify

Focus on durable evidence:
- Artifact schemas for remediation plan, dev verification, review verdict, and Aegis approval.
- How each artifact links to the root GitHub issue and PR-producing dev task.
- Advisory governance evidence required for each stage.
- Proof of no resource-policy violations or blocked budget/window results.
- Which later specs own remaining durable governance/run-state/claim/control-plane work.
```

#### Session 4: Smoke Shape and UI Boundary

```bash
$speckit-clarify

Focus on validation and operator surfaces:
- Deterministic fixture-linked PR identity for automated tests.
- Explicit opt-in live draft PR smoke path, if any.
- Existing ready-for-owner/operator surfaces that must remain accurate.
- Whether any UI correction is required, and why dedicated evidence UI remains SPEC-009E.
- Cleanup expectations for synthetic issues, tasks, artifacts, and fixture agents.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Review/Aegis loops | 5 | Accepted codebase-backed answers: review `pass` routes directly toward Aegis for the PR-producing dev task; `fix` loops/blocks without owner/Aegis readiness; Aegis `rejected` reuses bounded existing review retry/activity behavior; review artifacts keep `pass`/`fix` while existing quality-review status stays `approved`/`rejected`; evidence remains in existing artifact/review/activity/governance surfaces |
| 2 | PR ownership/nomenclature | 5 | Accepted answers: the dev implementation task remains the PR owner/readiness subject; `external_terminal_event: github_pr_merged` must be added to the dev template during implementation; helper slugs may record stage outputs but do not own readiness; root issue identity and dev PR identity stay separate in artifacts; missing PR linkage fails the C3 pilot success gate without changing shared SPEC-005 transition semantics |
| 3 | Artifact/governance evidence | 5 | Accepted answers: required readiness artifacts are evaluated against the PR-producing dev task; payloads carry root issue and dev PR cross-links; required artifacts use compact inline JSON `spec-009c3.v1` envelopes with bounded non-secret summaries; `quality_reviews` remains authoritative for Aegis and artifacts reference it; aggregate `governance_evidence` records per-stage allow/defer/block evidence without adding run/claim state |
| 4 | Smoke/UI boundary | 5 | Accepted answers: fixture PR identity is marked in artifacts and never treated as live proof; fixture smoke is required while live draft PR smoke is optional operator UAT only; existing Task Board/Ready for Owner PR link/Aegis/notification surfaces must remain accurate; cleanup closes external synthetic artifacts and removes or documents local fixture residue; workflow-contract copy may be tightened without slug changes |

### Consensus Resolution Log

| Date | Phase | Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|------|-------|-------------------|---------|---------------|
| 2026-05-16 | Clarify Session 1 | Should review `pass` route directly to Aegis and leave `mission-control_owner_review` out of the C3 happy path? | 1 | codebase, spec | High-confidence agreement: route `pass` directly toward Aegis for the PR-producing dev task; preserve `mission-control_owner_review` slug but keep it out of the C3 happy path | codebase-analyst, spec-context-analyst |
| 2026-05-16 | Clarify Session 2 | Should missing PR linkage hard-block shared `ready_for_owner` or fail only the C3 pilot success gate? | 1 -> 2 | codebase, spec -> domain | Round 2 majority: do not change shared SPEC-005 transition semantics; missing dev-task PR linkage fails SPEC-009C3 happy-path/fixture/live-smoke success closed | codebase-analyst, spec-context-analyst, domain-researcher |
| 2026-05-16 | Clarify Session 2 | Should `mission-control_dev_implementation` declare `external_terminal_event: github_pr_merged` now? | 1 | codebase, spec | High-confidence agreement: implementation must add the explicit terminal event beside `produces_pr: true` in the repo-owned workflow contract | codebase-analyst, spec-context-analyst |
| 2026-05-16 | Clarify Session 2 | Should review/Aegis gating evidence target the PR-producing dev task despite downstream helper slugs? | 1 | codebase, spec | High-confidence agreement: all readiness-gating review/Aegis evidence targets the dev task; helper slugs may remain but must not own PR or readiness | codebase-analyst, spec-context-analyst |
| 2026-05-16 | Clarify Session 3 | Where should required stage artifacts attach while remaining traceable to the root issue and dev task? | 1 | codebase, spec, security/domain | High-confidence agreement: canonical readiness evidence is attached to or linked/superseded onto the PR-producing dev task; payloads carry root issue and dev PR cross-links | codebase-analyst, spec-context-analyst, domain-researcher |
| 2026-05-16 | Clarify Session 3 | What minimum JSON schema should C3 require for required artifacts? | 1 | codebase, spec, security/domain | Agreement: use compact inline JSON `spec-009c3.v1` envelopes with bounded stage-specific fields, no raw logs/secrets, and Aegis artifacts referencing canonical quality-review rows | codebase-analyst, spec-context-analyst, domain-researcher |
| 2026-05-16 | Clarify Session 4 | Should C3 create a live draft PR or only document an opt-in operator smoke path? | 1 | spec, domain | High-confidence agreement: automated C3 validation never creates live PRs; fixture smoke is required; live draft PR smoke is optional operator UAT only and must stop at `ready_for_owner` | spec-context-analyst, domain-researcher |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/009c3-remediation-ready-for-owner/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node >=22, Next.js 16 App Router, React 19, TypeScript 5.7 strict.
- State/UI: Zustand where existing panels need it, Tailwind CSS 3.
- Data: SQLite through `better-sqlite3`, synchronous transactions.
- Tests: Vitest, Playwright only if existing UI/smoke surfaces change, ESLint, pnpm.
- Workflow policy: repo-owned YAML contract in `docs/ai/workflows/mission-control/workflow-contract.yaml`.

## Architecture Constraints
- Reuse existing workflow-template task chain and `advanceTaskChain`; do not add a bespoke remediation runner.
- Reuse `createTask` for successor side effects.
- Reuse `task_artifacts` for plan/dev/review/Aegis evidence.
- Reuse `quality_reviews` and reviewer `aegis` for final Aegis approval.
- Reuse ready-for-owner transition guards in `src/lib/task-status.ts` and API behavior in `src/app/api/quality-review/route.ts`.
- Reuse existing resource-governance/advisory evidence surfaces; do not add claim/run/control-plane schema.
- Preserve workflow slugs unless Clarify proves a non-slug label/prompt/copy fix is required.

## Design Concept Decisions
- Q1/Q9 require review `fix` and Aegis `rejected` loops/blocks before readiness.
- Q2 requires the PR-producing dev task to own the linked PR and become `ready_for_owner`.
- Q3 preserves slugs while allowing targeted nomenclature cleanup.
- Q4/Q8 defer durable governance/run-state/claim/control-plane work to later roadmap specs.
- Q5 uses `quality_reviews` reviewer `aegis` as the Aegis proof.
- Q6 uses deterministic fixture PR identity in automated validation and explicit opt-in live draft PR smoke.
- Q7 requires plan, dev verification, review verdict, and Aegis approval artifacts.
- Q10 keeps UI changes limited to existing surfaces that must accurately show readiness/evidence.

## Reviewability Budget
Primary surface: scheduler/runtime task-chain execution. Secondary surfaces:
workflow contract, quality-review API, task-artifact evidence, docs/smoke.
Proceed under the roadmap transition exception, but keep production changes
minimal and split anything that introduces formal run-state, claim authority,
or dedicated evidence UI.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, constitution gates, primary/secondary surfaces, project structure, reviewability exception |
| `research.md` | Complete | Decisions for task-chain reuse, PR ownership, review/Aegis loops, Aegis proof, artifacts, governance, fixture/live smoke, and UI boundary |
| `data-model.md` | Complete | Existing entities, artifact envelopes, Aegis review, governance evidence, state transitions, fail-closed conditions |
| `contracts/` | Complete | `contracts/remediation-readiness-contract.md` defines readiness subject, required evidence, transition contract, and out-of-scope assertions |
| `quickstart.md` | Complete | Fixture validation path, blocked-path evidence, optional live draft PR smoke, and scope guards |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Target 2-5 focused domains because this slice crosses workflow, state, evidence, and security-adjacent boundaries.

### Recommended Checklist Prompts

#### 1. data-integrity Checklist

Why: SPEC-009C3 depends on correct task-chain state, PR linkage, artifacts, quality reviews, and workspace-scoped evidence.

```bash
$speckit-checklist data-integrity

Focus on SPEC-009C3 requirements:
- PR-producing dev task owns `github_repo` and `github_pr_number`.
- Review/Aegis loops do not create duplicate successors or stale owner-ready state.
- Plan/dev/review/Aegis artifacts are tied to root issue and PR-producing task.
- Workspace scope is preserved for tasks, artifacts, quality reviews, and activities.
- Pay special attention to idempotency and duplicate retry behavior.
```

#### 2. state-management Checklist

Why: The core risk is incorrect stage/status progression through review, Aegis, and `ready_for_owner`.

```bash
$speckit-checklist state-management

Focus on SPEC-009C3 requirements:
- `fix` and `rejected` outcomes loop/block before readiness.
- `pass` plus Aegis approval can move the dev task to `ready_for_owner`.
- Manual merge and done reconciliation remain unavailable in this spec.
- Existing workflow slugs remain stable while labels/prompts may be clarified.
- Pay special attention to static `next_template_slug` behavior and failed verdicts.
```

#### 3. error-handling Checklist

Why: Failed review, rejected Aegis, artifact publish failure, and governance violations must be explicit and side-effect-safe.

```bash
$speckit-checklist error-handling

Focus on SPEC-009C3 requirements:
- Review `fix` and Aegis `rejected` produce durable evidence and safe loop/block behavior.
- Artifact publish failures do not silently mark work owner-ready.
- Governance blocked/budget/window violations prevent readiness.
- Fixture PR identity and optional live draft PR paths fail closed.
- Pay special attention to side-effect-free blocked transitions.
```

#### 4. security Checklist

Why: The spec handles GitHub issue/PR identity, artifacts, reviewer identity, and governance evidence.

```bash
$speckit-checklist security

Focus on SPEC-009C3 requirements:
- Fixture and live PR paths cannot spoof unrelated repos or PRs.
- Aegis approval requires reviewer `aegis` and correct workspace scope.
- Artifacts do not leak secrets or raw credentials.
- Operator-only live draft PR smoke is opt-in and explicit.
- Pay special attention to trust boundaries between fixture evidence and live GitHub evidence.
```

#### 5. regression-safety Checklist

Why: This slice must not break SPEC-004, SPEC-005, SPEC-007, SPEC-008, SPEC-009C2, or future-spec boundaries.

```bash
$speckit-checklist regression-safety

Focus on SPEC-009C3 requirements:
- Existing task-chain behavior remains compatible for non-pilot templates.
- Existing ready-for-owner behavior remains compatible for non-remediation PR-producing tasks.
- SPEC-009C4, SPEC-009D/E, SPEC-013A-C, and SPEC-014A-D remain out of scope.
- Existing UI surfaces remain unchanged unless correction is required.
- Pay special attention to no new claim-state, runner-state, sandbox, adapter, or evidence UI.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 18 | 1 resolved, 0 remaining | Added `FR-010c`; workspace-scoped activity evidence for review/Aegis/governance/retry/readiness |
| state-management | 14 | 2 resolved, 0 remaining | Guarded review `fix` static successor fallback; review `pass` bypasses owner-review for C3 while preserving slugs |
| error-handling | 13 | 4 resolved, 0 remaining | Added artifact publish/supersede failure semantics, blocked-readiness side-effect exclusions, optional live draft PR fail-closed rules, and SC-010/SC-011 |
| security | 19 | 0 found, 0 remaining | Confirmed PR identity, Aegis reviewer/workspace scope, sanitized artifacts, and fixture/live trust boundary coverage |
| regression-safety | 26 | 2 resolved, 0 remaining | Added `FR-021`, `FR-022`, `SC-012`, `SC-013`; tightened downstream SPEC-009C4/D/E, SPEC-013A-C, and SPEC-014A-D boundaries |
| **Total** | 90 | 9 resolved, 0 remaining | G4 passed via `validate-gate.sh G4 specs/009c3-remediation-ready-for-owner` |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/009c3-remediation-ready-for-owner/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-009C3 using:
- `specs/009c3-remediation-ready-for-owner/spec.md`
- `specs/009c3-remediation-ready-for-owner/plan.md`
- `docs/ai/specs/SPEC-009C3-design-concept.md`

Task constraints:
- Write RED tests before production changes for review `fix`, Aegis `rejected`,
  Aegis `approved`, artifact evidence, advisory governance evidence,
  deterministic PR fixture identity, and ready-for-owner transition.
- Keep tasks small and independently reviewable.
- Add an explicit reviewability checkpoint before implementation.
- Include guardrail tasks proving no manual merge reconciliation, no claim/run
  state, no sandbox/adapter work, no automatic poller, no dedicated evidence UI,
  and no broad workflow slug migration.
- Include quickstart/smoke tasks for deterministic fixture PR validation and
  optional explicit live draft PR validation.
- Ensure task ordering preserves red-green-refactor.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 70 |
| Phases | 7 task phases: setup, foundational RED/reviewability, US1, US2, US3, US4, polish/verification |
| Parallel Opportunities | 36 `[P]` tasks |
| User Stories Covered | 4: happy path owner readiness, review `fix`, Aegis approval/rejection, deterministic evidence and scope guardrails |
| Reviewability Gate | Passed under transition exception; warnings/blockers recorded for 2800 reviewable LOC estimate, 16 production files, 92 total files, and 5 primary surfaces |

---

## Phase 6: Analyze

**When to run:** Always after task generation.

### Analyze Prompt

```bash
$speckit-analyze

Run cross-artifact consistency analysis across:
- `docs/ai/specs/SPEC-009C3-design-concept.md`
- `specs/009c3-remediation-ready-for-owner/spec.md`
- `specs/009c3-remediation-ready-for-owner/plan.md`
- `specs/009c3-remediation-ready-for-owner/tasks.md`

Focus on:
1. Design-concept drift: Q1-Q10 decisions must be reflected downstream.
2. Boundary discipline: no SPEC-009C4 merge/done reconciliation, no SPEC-009D/E packet/evidence UI, no SPEC-013 claim/run/control-plane, no SPEC-014 sandbox/adapter.
3. Review/Aegis loops: `fix` and `rejected` cannot advance to owner readiness.
4. PR ownership: the PR-producing dev task owns linked PR and reaches `ready_for_owner`.
5. Evidence coverage: plan, dev verification, review verdict, Aegis approval, and advisory governance evidence have tests and tasks.
6. Reviewability budget: any expansion beyond the transition exception must be split.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| AN-001 | None | No cross-artifact findings across design concept, spec, plan, tasks, data model, and contract | No remediation required; G6 passed |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and G6 passes with no CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

Execute `specs/009c3-remediation-ready-for-owner/tasks.md` in order.

Follow strict red-green-refactor:
1. RED: Write failing tests for the next task.
2. GREEN: Implement the smallest change that passes.
3. REFACTOR: Clean up while tests stay green.
4. VERIFY: Run focused checks and record evidence.

Implementation constraints:
- Work from branch `009c3-remediation-ready-for-owner`.
- Reuse existing task-chain, artifact, quality-review, ready-for-owner, and
  governance surfaces.
- Keep workflow slugs stable unless a non-slug nomenclature cleanup is required.
- Do not introduce manual merge reconciliation, claim/run tables, sandbox
  lifecycle, harness adapters, automatic pollers, or a dedicated evidence UI.
- Use deterministic PR fixture identity for automated checks.
- If an operator live draft PR smoke is implemented, it must be explicit,
  opt-in, documented, and cleanup-aware.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation / RED tests | Complete | Complete | Review/Aegis loop, artifact, governance, PR fixture, and ready-for-owner RED tests landed; initial focused run failed on the missing behavior |
| Chain and evidence implementation | Complete | Complete | Runtime gates added in `task-dispatch`, `task-artifacts`, and `quality-review`; workflow contract keeps PR merge terminal semantics |
| Smoke/docs/status | Complete | Complete | Pilot smoke checklist, roadmap deferral evidence, tasks evidence, and workflow status updated; live draft PR smoke remains operator opt-in |
| Verification | Complete | Complete | Focused C3 suites, full Vitest, typecheck, lint, build, scope guard, and G7 passed; e2e N/A because no UI changed |

---

## Post-Implementation Checklist

- [x] All tasks marked complete in `tasks.md`
- [x] Focused Vitest suites pass
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` passes if runtime/import/export surfaces changed
- [x] Focused Playwright/e2e passes if UI/browser workflow changes (N/A: no UI/browser workflow changed)
- [x] Fixture PR smoke evidence recorded
- [x] Optional live draft PR smoke evidence recorded only if deliberately run (not run: opt-in UAT only)
- [x] Synthetic issues/tasks/artifacts/fixture agents cleaned up or explicitly retained with evidence (N/A: automated fixtures are test-local)
- [x] Roadmap/workflow/autopilot-state status updated
- [x] PR review packet generated with scope budget, traceability, verification, known gaps, and rollback/flag notes

### Post-Implementation Results

- **G7:** Passed with all 70 generated tasks complete.
- **Reviewability diff gate:** `reviewability-gate.sh diff HEAD~1..HEAD` passed under the recorded transition exception; raw `main...HEAD` measurement includes the full SpecKit artifact history and remains over budget, as expected for this transition slice.
- **PR:** [#48](https://github.com/racecraft-lab/mission-control/pull/48) opened with the generated review packet.
- **Push:** Branch `009c3-remediation-ready-for-owner` pushed via HTTPS after the configured SSH signing agent failed.

---

## Project Structure Reference

```text
docs/ai/rc-factory-technical-roadmap.md
docs/ai/specs/SPEC-009C3-design-concept.md
docs/ai/specs/SPEC-009C3-workflow.md
docs/ai/workflows/mission-control/workflow-contract.yaml
docs/qa/pilot-smoke-checklist.md
specs/009c3-remediation-ready-for-owner/
src/app/api/quality-review/
src/lib/task-dispatch.ts
src/lib/task-artifacts.ts
src/lib/task-create.ts
src/lib/task-status.ts
src/lib/feature-flags.ts
tests/
```

---

## Lessons Learned

### What Worked Well

- Pending.

### Challenges Encountered

- Pending.

### Patterns to Reuse

- Pending.
