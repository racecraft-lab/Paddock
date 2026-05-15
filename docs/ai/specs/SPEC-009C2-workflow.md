# SpecKit Workflow: SPEC-009C2 - Triage-to-Remediation Plan Handoff

**Template Version**: 1.0.0
**Created**: 2026-05-15
**Purpose**: Prepare and execute the RC Factory Phase 8C2 pilot Issue Triage to Issue Remediation planning handoff in autopilot.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009c2-triage-remediation-handoff`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009C2-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, Open Questions, and design recommendations live at:

```text
docs/ai/specs/SPEC-009C2-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

Do not start downstream specs from this worktree. SPEC-009C2 stops after an
eligible pilot issue has been driven through the Issue Triage workflow family
and, only for `ACTIONABLE_REMEDIATION`, exactly one Issue Remediation planning
successor has been created through the existing task-chain helper.

No automatic GitHub sync cron/poller lifecycle wiring, production
non-remediation routing lane, claim authority, scheduler dispatch, runner
state, sandbox lifecycle, harness adapter work, SpecKit/SDD execution lane, or
production evidence UI belongs in this spec.

---

## Design Concept

Source-of-truth scoping decisions:

- Reuse the existing workflow-template output schema, routing rules,
  `task_dispositions`, `task_artifacts`, and `advanceTaskChain` surfaces.
- Correct the repo-owned Mission Control workflow contract so Issue Triage can
  emit the full pilot disposition taxonomy and route
  `ACTIONABLE_REMEDIATION` to Issue Remediation planning.
- Create an actual remediation-planning successor only through the existing
  task-chain helper; do not create a bespoke pilot handoff path.
- Negative triage outcomes must produce disposition/artifact/activity evidence
  and must not create remediation successors.
- `NEEDS_SPEC` remains a later SpecKit/SDD destination and must not be
  conflated with direct Issue Remediation in this spec.
- Manual UAT uses a fresh SPEC-009C2 synthetic issue, not the closed
  SPEC-009C1 synthetic issue.
- Add a future roadmap spec, SPEC-009F, for production routing/evidence of
  non-remediation triage outcomes after pilot evidence surfaces exist.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `spec.md` and requirements checklist; G1 passed with 0 clarification markers |
| Clarify | `$speckit-clarify` | Complete | Five clarify sessions resolved in `spec.md`; G2 passed with 0 markers and no consensus escapes |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, contract, quickstart, and agent context; G3 passed |
| Checklist | `$speckit-checklist` | Complete | Five focused requirement-quality checklists generated; 40/40 checks resolved; G4 passed |
| Tasks | `$speckit-tasks` | Complete | Generated 20 dependency-ordered TDD tasks; G5 and tasks reviewability gate passed with transition exception |
| Analyze | `$speckit-analyze` | Pending | Verify cross-artifact scope, taxonomy, routing, and no-side-effect consistency |
| Implement | `$speckit-implement` | Pending | Implement and verify the approved tasks, then update status and push |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009c2-triage-remediation-handoff`; reviewability preset resolves; worktree is clean except intended setup artifacts; no main checkout edits are made |
| G1 | After Specify | Requirements cover triage output taxonomy, actionable handoff, non-remediation exits, disposition/artifact/activity evidence, workflow-contract correction, fresh synthetic smoke, and cleanup; no `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | Disposition casing/mapping, routing-schema compatibility, artifact shape, negative side-effect proof, live UAT cleanup, and SPEC-009F boundary are resolved |
| G3 | After Plan | Architecture reuses workflow contracts, `advanceTaskChain`, task-chain validation, `task_dispositions`, `task_artifacts`, and existing feature flags; no bespoke successor path or production routing lanes are introduced |
| G4 | After Checklist | All gaps in data integrity, state lifecycle, error handling, security, and regression safety are resolved without widening scope |
| G5 | After Tasks | Tasks cover every acceptance criterion with RED tests before production changes and include explicit guardrails for no cron/poller, no claim/runner/sandbox, and no production non-remediation routing |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; generated artifacts do not implement SPEC-009C3/C4/D/E/F, automatic GitHub sync, claim/reconciliation, runner state, sandboxing, harness adapters, or production evidence UI |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, live synthetic smoke checklist, cleanup evidence, roadmap/workflow status updates, branch commit, and push are complete |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009c2-triage-remediation-handoff
```

If supported, set:

```bash
GIT_BRANCH_NAME=009c2-triage-remediation-handoff
SPECIFY_FEATURE_DIRECTORY=specs/009c2-triage-remediation-handoff
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
  "primary_surface_count": 7,
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

Decision: proceed only because the roadmap carries a transition exception.
Autopilot must still keep SPEC-009C2 to one primary implementation surface:
Issue Triage disposition routing into Issue Remediation planning for the pilot
path. The new SPEC-009F roadmap entry is planning-only and must not be
implemented in this branch.

### Autopilot Startup Evidence

Prerequisite discovery on 2026-05-15:

- Branch/worktree: `009c2-triage-remediation-handoff`, isolated worktree,
  clean before phase execution.
- SpecKit CLI, project initialization, constitution, workflow file, and
  package-manager discovery passed.
- Project commands detected: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, and `pnpm test:e2e`.
- Reviewability preset detected:
  `speckit-pro-reviewability` for spec, plan, and tasks templates.
- Archive extension: installed and enabled at version `1.1.0`.
- Archive sweep current target:
  `specs/009c2-triage-remediation-handoff` excluded from archive/cleanup.
- Previously completed active spec folders detected:
  `specs/005-ready-for-owner`, `specs/007-disposition-artifacts`,
  `specs/008-resource-governance`,
  `specs/009a-workflow-contract-roundtrip`,
  `specs/009b-mission-control-seed`, and
  `specs/009c1-pilot-issue-ingest`.
- Cleanup mode: provenance-only startup sweep. No spec folders were deleted or
  moved because this run did not complete a fresh archive operation for those
  folders before cleanup.
- `safeToApplyCleanup=false` for startup cleanup in this autopilot run.

### Constitution and PRD Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, and
`docs/ai/specs/SPEC-009C2-design-concept.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| GitHub tracker truth | The pilot issue is a GitHub-linked task selected by SPEC-009C1 eligibility, not a local-only task | Spec/plan requirements and smoke evidence |
| Typed workflow handoff | Issue Triage output is validated through repo-owned workflow-template schema before successor creation | Unit/integration tests |
| Successor side-effect parity | Remediation planning successor creation uses existing task-chain helper behavior | Code review and tests over `advanceTaskChain` |
| Durable evidence | Triage disposition, artifacts, and activities are enough for later review without terminal archaeology | Artifact/disposition assertions |
| Negative-path safety | Duplicate, obsolete, invalid, needs-human, needs-specialist, and `NEEDS_SPEC` exits do not create remediation successors | Negative fixture tests |
| Test-first development | RED tests define actionable and negative routing before production changes | Task order and test logs |
| Scope control | No automatic poller wiring, claim/dispatch, runner, sandbox, harness, or production non-remediation routing lanes | Analyze guardrails and code review |

### Package Manager and Commands

Package manager: `pnpm`, detected from `pnpm-lock.yaml`.

Use focused checks first, then broaden according to blast radius:

```bash
pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/lib/__tests__/task-artifacts-admin.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

If Playwright coverage changes because the task board, smoke checklist, or
workflow diagnostics UI changes, run the focused Playwright target or
`pnpm test:e2e`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009C2 |
| Name | Triage-to-Remediation Plan Handoff |
| Branch | `009c2-triage-remediation-handoff` |
| Dependencies | SPEC-009C1 |
| Enables | SPEC-009C3 |
| Priority | P0 |
| Feature flag scope | `PILOT_MISSION_CONTROL_E2E` plus existing task-chain, disposition, artifact, and area-label flags where required |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009C2-design-concept.md` |
| Runtime projection | Existing workflow-template task chain, task output validation, disposition logging, artifact store, and GitHub-linked pilot task identity |
| Existing surfaces | `docs/ai/workflows/mission-control/workflow-contract.yaml`, `src/lib/task-dispatch.ts`, `src/lib/task-artifacts.ts`, `src/lib/task-create.ts`, `src/lib/pilot-issue-eligibility.ts`, `docs/qa/pilot-smoke-checklist.md` |
| Strict Scope | Issue Triage schema/routing correction, actionable remediation-planning successor, disposition/artifact evidence, negative clean exits, and fresh synthetic UAT cleanup |

### Scope Summary

Drive the eligible SPEC-009C1 pilot issue through the Issue Triage workflow
family. A triage result of `ACTIONABLE_REMEDIATION` must create exactly one
Issue Remediation planning successor through the existing task-chain helper and
must persist traceable disposition/artifact/activity evidence.

All non-remediation outcomes must exit cleanly. Duplicate, obsolete, invalid,
needs-human, needs-specialist, and `NEEDS_SPEC` outputs must not create
remediation successors. `NEEDS_SPEC` may record evidence for a future SpecKit
or SDD handoff, but it must not start that lane in this spec.

### Success Criteria Summary

- [ ] Issue Triage schema exposes a canonical pilot disposition taxonomy:
  `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`,
  `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
- [ ] The repo-owned Mission Control workflow contract imports/exports with
  stable hashes and routes `ACTIONABLE_REMEDIATION` to
  `mission-control_remediation_plan`.
- [ ] `ACTIONABLE_REMEDIATION` creates exactly one remediation-planning
  successor through `advanceTaskChain` or the existing task-chain helper path.
- [ ] Duplicate execution or rerun does not create a second remediation
  successor for the same pilot issue/stage.
- [ ] Negative dispositions create zero remediation successors and persist
  durable disposition/artifact/activity evidence.
- [ ] `NEEDS_SPEC` does not start SpecKit/SDD, create remediation work, or mark
  the pilot as done.
- [ ] Manual UAT uses a fresh SPEC-009C2 synthetic issue and records cleanup so
  no test dirt remains behind.
- [ ] Roadmap records SPEC-009F as the future production routing/evidence owner
  for non-remediation triage outcomes.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on what and why. Output: `specs/009c2-triage-remediation-handoff/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Triage-to-Remediation Plan Handoff

Create the SPEC-009C2 specification for the Mission Control self-hosting pilot
handoff from Issue Triage to Issue Remediation planning. The source of truth is
the roadmap entry in `docs/ai/rc-factory-technical-roadmap.md`, the PRD in
`docs/rc-factory-v1-prd.md`, and the design concept at
`docs/ai/specs/SPEC-009C2-design-concept.md`.

The spec must require the eligible SPEC-009C1 GitHub-linked pilot issue to be
driven through the Issue Triage workflow family. If triage returns
`ACTIONABLE_REMEDIATION`, the system must create exactly one Issue Remediation
planning successor through the existing task-chain helper. If triage returns a
non-remediation outcome, the system must persist evidence and must not create a
remediation successor.

Goals:
- Make Issue Triage output typed enough to distinguish actionable remediation
  from duplicate, obsolete, invalid, needs-human, needs-specialist, and
  `NEEDS_SPEC` outcomes.
- Correct the repo-owned Mission Control workflow contract so
  `ACTIONABLE_REMEDIATION` routes to `mission-control_remediation_plan`.
- Reuse existing task-chain validation and successor creation; do not create a
  bespoke pilot handoff path.
- Persist disposition, artifact, and activity evidence for actionable and
  non-remediation outcomes.
- Prove duplicate handoff attempts do not create duplicate remediation planning
  tasks.
- Use a fresh SPEC-009C2 synthetic issue for manual UAT and clean it up.
- Record SPEC-009F as future production routing/evidence work for
  non-remediation outcomes.

Non-goals:
- Do not execute remediation development, review, Aegis approval, or
  `ready_for_owner`; those belong to SPEC-009C3.
- Do not perform owner merge/done reconciliation; that belongs to SPEC-009C4.
- Do not build pilot review packets or production evidence surfaces; those
  belong to SPEC-009D and SPEC-009E.
- Do not automate GitHub sync cron/poller lifecycle; that belongs to
  SPEC-013A1.
- Do not implement production non-remediation routing lanes such as full
  SpecKit/SDD, human clarification, specialist assignment, or close automation;
  those belong to future SPEC-009F.
- Do not add claim authority, runner state, sandbox lifecycle, or harness
  adapter behavior.
- Do not run live GitHub mutation from automated tests or normal app runtime.

The specification must cite the relevant PRD constraints: GitHub issues are the
v1 tracker of record; Issue Triage classifies inbound work; Issue Remediation
is only for actionable remediation; `NEEDS_SPEC` is a separate future SDD lane.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 19 |
| User Stories | 4 |
| Acceptance Criteria | 10 success criteria; 10 acceptance scenarios |

### Files Expected

- [x] `specs/009c2-triage-remediation-handoff/spec.md`
- [x] `specs/009c2-triage-remediation-handoff/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any taxonomy, routing, evidence, or smoke cleanup behavior can be interpreted multiple ways.

### Clarify Prompts

#### Session 1: Disposition Taxonomy

```bash
$speckit-clarify

Focus on SPEC-009C2 disposition taxonomy:
- Exact enum values and casing for pilot Issue Triage output.
- Compatibility with the existing SPEC-007 disposition enum and any current
  `isTriageTemplateSchema` behavior.
- How `ACTIONABLE_REMEDIATION` maps to remediation planning, and how
  `NEEDS_SPEC`, duplicate, obsolete, invalid, needs-human, and
  needs-specialist are represented without launching their future lanes.
```

#### Session 2: Workflow Contract and Routing

```bash
$speckit-clarify

Focus on workflow-contract routing:
- The exact `docs/ai/workflows/mission-control/workflow-contract.yaml` changes
  needed for Issue Triage output schema and routing rules.
- How import/apply/export parity and prompt/schema/routing hashes prove the
  repo-owned contract remains canonical.
- How to route `ACTIONABLE_REMEDIATION` to
  `mission-control_remediation_plan` through the existing task-chain helper.
```

#### Session 3: Evidence and No-Side-Effect Proof

```bash
$speckit-clarify

Focus on evidence and side-effect boundaries:
- Required disposition, artifact, and activity records for actionable and
  non-remediation outcomes.
- Which current tables/fields prove exactly one remediation successor for
  `ACTIONABLE_REMEDIATION`.
- Which current tables/fields prove zero remediation successors for negative
  outcomes.
- How to avoid false positives from unrelated task, pipeline, or activity rows.
```

#### Session 4: Live UAT and Cleanup

```bash
$speckit-clarify

Focus on live manual smoke:
- Fresh SPEC-009C2 synthetic issue title, labels, and reuse/create rules.
- Operator-triggered sync and handoff steps.
- Cleanup expectations for synthetic GitHub issues and disposable Mission
  Control rows so tests do not leave dirt behind.
```

#### Session 5: Future Production Routing Boundary

```bash
$speckit-clarify

Focus on roadmap alignment:
- Keep production non-remediation routing lanes in SPEC-009F.
- Keep automatic GitHub sync automation in SPEC-013A1.
- Keep run-state, claim/reconciliation, retry, sandbox, and harness adapter
  work in SPEC-013/014.
- Ensure SPEC-009C2 only records evidence for future lanes and does not start
  them.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Disposition taxonomy | 1 | Uppercase pilot taxonomy accepted; SPEC-007 lowercase dispositions remain compatible for non-pilot templates |
| 2 | Workflow contract and routing | 1 | Only `ACTIONABLE_REMEDIATION` routes to `mission-control_remediation_plan`; no static fallback for negatives |
| 3 | Evidence and no-side-effect proof | 1 | Evidence anchors to the triage task; activity checks must include `entity_type='task'` |
| 4 | Live UAT and cleanup | 1 | Fresh SPEC-009C2 synthetic issue title pattern and cleanup expectations recorded |
| 5 | Future production routing boundary | 1 | SPEC-009F and SPEC-013A1 remain future owners; C2 only records evidence |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/009c2-triage-remediation-handoff/plan.md` and related artifacts.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Next.js 16 App Router on Node >=22
- Language: TypeScript 5.7 strict
- Frontend: React 19 and Tailwind CSS 3, but no new production UI is expected
  for this spec unless existing diagnostics must reflect contract parity
- State: Zustand only where existing panels need it; avoid new client state for
  this backend/workflow-contract slice
- Database: SQLite through `better-sqlite3`
- Tests: Vitest for unit/integration tests; Playwright only if an existing UI
  smoke path changes
- Package manager: pnpm

## Existing Surfaces To Reuse
- `docs/ai/workflows/mission-control/workflow-contract.yaml` for repo-owned
  workflow-template prompt, schema, and routing contract.
- `src/lib/workflow-contracts/*` and workflow-contract operator scripts for
  import/apply/export parity and hash evidence.
- `src/lib/task-dispatch.ts` for output validation, routing, task-chain
  advancement, disposition insert, and successor creation.
- `src/lib/task-artifacts.ts` for artifact publish/read/admin behavior.
- `src/lib/task-create.ts` for task creation and GitHub sync side effects.
- `src/lib/pilot-issue-eligibility.ts` for the SPEC-009C1 eligible pilot task
  identity proof.
- `docs/qa/pilot-smoke-checklist.md` for manual live smoke and cleanup notes.

## Constraints
- No schema migration in SPEC-009C2 unless Plan proves an unavoidable blocker;
  if so, stop and update SpecKit artifacts before implementation.
- No bespoke successor creation path. Use `advanceTaskChain` or the existing
  task-chain helper stack.
- No automatic GitHub sync poller startup, cron job, OpenClaw cron, or
  scheduler-runtime integration.
- No production non-remediation routing lane in SPEC-009C2. Record future
  evidence and roadmap coverage only.
- No production pilot evidence UI/API unless Analyze proves an existing
  diagnostics parity gap created by this spec; durable evidence surfaces remain
  SPEC-009E.
- Tests must be fixture-driven and deterministic; live GitHub access belongs
  only in manual smoke/checklist/script instructions.

## Architecture Notes
- Treat GitHub issue identity as the pilot source of truth inherited from
  SPEC-009C1.
- Treat Issue Triage output as a typed workflow result whose routing behavior
  is owned by the repo workflow contract and runtime task-chain validation.
- Keep `ACTIONABLE_REMEDIATION` as the only remediation-planning entry in this
  spec.
- Keep non-remediation outcomes as clean exits with durable evidence.
- Preserve import/apply/export parity for Mission Control workflow contracts.
- Record roadmap-deferred work in `docs/ai/rc-factory-technical-roadmap.md`
  but do not implement those future specs here.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Reuses workflow contract, task-chain, disposition, artifact, and activity surfaces |
| `research.md` | Complete | Resolves taxonomy, routing, evidence, and live-mutation boundaries |
| `data-model.md` | Complete | Models existing rows only; no migration planned |
| `contracts/` | Complete | Documents Issue Triage schema, routing rule, runtime, and verification contract |
| `quickstart.md` | Complete | Focused checks plus fresh SPEC-009C2 manual smoke and cleanup |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run focused checklists only.

### Recommended Checklist Domains

#### 1. Data Integrity

```bash
$speckit-checklist data-integrity

Focus on SPEC-009C2 requirements:
- `ACTIONABLE_REMEDIATION` creates exactly one remediation-planning successor.
- Duplicate handoff attempts are idempotent and do not create a second
  successor.
- Negative outcomes create zero remediation successors.
- Workflow-contract import/apply/export parity preserves canonical prompt,
  schema, and routing hashes.
```

#### 2. State Management

```bash
$speckit-checklist state-management

Focus on SPEC-009C2 requirements:
- Triage state is derived from current workflow output, task, disposition,
  artifact, and activity records.
- Non-remediation outcomes stop in a reviewable state without launching future
  lanes.
- No claim, dispatch, runner, sandbox, or production control-plane state is
  introduced.
```

#### 3. Error Handling

```bash
$speckit-checklist error-handling

Focus on SPEC-009C2 requirements:
- Invalid or unknown triage output fails closed without successor creation.
- Missing remediation planning template fails visibly and leaves evidence.
- Artifact/disposition write failures do not silently report a successful
  handoff.
- Workflow-contract import or hash parity failures block the pilot handoff.
```

#### 4. Security

```bash
$speckit-checklist security

Focus on SPEC-009C2 requirements:
- Tests do not require live GitHub secrets.
- Artifacts do not persist secret-bearing issue bodies, terminal logs, or raw
  credentials.
- Manual smoke instructions avoid echoing tokens and record cleanup.
- Operator-visible evidence redacts sensitive fields consistently with
  SPEC-007 artifact behavior.
```

#### 5. Regression Safety

```bash
$speckit-checklist regression-safety

Focus on SPEC-009C2 requirements:
- Existing task-chain routing still works for non-pilot templates.
- Existing SPEC-007 disposition/artifact behavior remains compatible.
- Existing SPEC-009A workflow-contract parity tooling remains stable.
- Existing SPEC-009C1 eligibility and no-side-effect proofs remain valid.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 8 | 0 | FR-003..FR-008, FR-014..FR-015, SC-001..SC-007 |
| state-management | 8 | 0 | Clarifications, FR-012..FR-013, FR-017..FR-019 |
| error-handling | 8 | 0 | FR-004, FR-009..FR-011, FR-016, SC-005 |
| security | 8 | 0 | FR-016..FR-019, Quickstart, Constitution XIII |
| regression-safety | 8 | 0 | SPEC-007, SPEC-009A, SPEC-009C1, SPEC-009F, SPEC-013A1 boundaries |
| **Total** | 40 | 0 | No unresolved gaps |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all genuine gaps are resolved. Output: `specs/009c2-triage-remediation-handoff/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate tasks for SPEC-009C2 using:
- `specs/009c2-triage-remediation-handoff/spec.md`
- `specs/009c2-triage-remediation-handoff/plan.md`
- `docs/ai/specs/SPEC-009C2-design-concept.md`

Task structure requirements:
- Follow red-green-refactor. Every production behavior change starts with a
  failing Vitest test.
- Start with tests for typed Issue Triage output, workflow-contract parity,
  `ACTIONABLE_REMEDIATION` successor creation, duplicate prevention, negative
  clean exits, `NEEDS_SPEC` non-launch behavior, artifact/disposition evidence,
  and fresh synthetic smoke cleanup.
- Keep implementation tasks narrow: reuse workflow-contract tooling,
  `advanceTaskChain`, task creation, disposition logging, and artifact store.
- Include docs tasks for roadmap SPEC-009F coverage and
  `docs/qa/pilot-smoke-checklist.md` updates.
- Include status tasks for workflow, roadmap, and post-implementation evidence.
- Mark parallel-safe docs/test tasks with [P] only when they do not touch the
  same files.

Do not generate tasks for:
- SPEC-009C3/C4/D/E/F implementation.
- Automatic GitHub sync poller wiring or cron lifecycle.
- Production non-remediation routing lanes.
- Scheduler claim authority, runner state, sandbox lifecycle, or harness
  adapters.
- Schema migrations unless Plan proves they are unavoidable.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Phases | RED tests; implementation; docs/smoke; verification |
| Parallel Opportunities | T001/T012 and T006 parallel-safe; routing fixture tasks serial |
| User Stories Covered | US1-US4 plus scope guardrails |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-009C2 across:
- `docs/ai/specs/SPEC-009C2-design-concept.md`
- `specs/009c2-triage-remediation-handoff/spec.md`
- `specs/009c2-triage-remediation-handoff/plan.md`
- `specs/009c2-triage-remediation-handoff/tasks.md`

Focus on:
1. Scope drift: flag any task or requirement that implements SPEC-009C3/C4/D/E/F,
   automatic GitHub sync polling, production evidence UI/API, production
   non-remediation routing lanes, scheduler claim authority, runner state,
   sandbox lifecycle, or harness adapters.
2. Traceability: every success criterion must map to functional requirements,
   acceptance scenarios, and tasks.
3. Taxonomy consistency: triage enum casing/mapping must be explicit and must
   not conflict with existing SPEC-007 disposition logging behavior.
4. Successor correctness: only `ACTIONABLE_REMEDIATION` may create
   `mission-control_remediation_plan`, and it must do so through the existing
   task-chain helper.
5. Evidence correctness: actionable and negative outcomes must have durable
   disposition/artifact/activity evidence, with no false positives from
   unrelated activities or entities.
6. GitHub mutation safety: live GitHub actions must be manual/operator-smoke
   only, not CI/unit tests or hidden runtime behavior.
7. Roadmap alignment: SPEC-009F must be referenced as future production
   routing/evidence work but not implemented here.
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

Implement SPEC-009C2 from:
- `specs/009c2-triage-remediation-handoff/tasks.md`
- `specs/009c2-triage-remediation-handoff/plan.md`
- `docs/ai/specs/SPEC-009C2-design-concept.md`

Approach:
1. RED: write failing tests for each task before production code changes.
2. GREEN: implement the smallest reuse-oriented change that passes.
3. REFACTOR: keep workflow-contract, task-chain, disposition, and artifact
   helpers readable and consistent with local patterns.
4. VERIFY: run focused tests first, then typecheck/lint/build as scope requires.
5. SMOKE: use a fresh SPEC-009C2 synthetic issue for manual UAT, then clean up
   GitHub and Mission Control test state.

Implementation guardrails:
- Stay on branch `009c2-triage-remediation-handoff`.
- Do not modify main checkout.
- Do not create schema in SPEC-009C2 unless Plan and Analyze approve it first.
- Do not wire `startSyncPoller()` into runtime startup or scheduler in this
  spec.
- Do not build production non-remediation routing lanes.
- Do not launch SpecKit/SDD, human clarification, specialist assignment, or
  close automation from negative outcomes.
- Do not add production pilot evidence UI/API.
- Do not claim work, dispatch agents, create runner state, create sandbox
  state, or add harness adapters.
- Do not run live GitHub mutation from automated tests.
- Keep SPEC-009F as docs-only future roadmap coverage in this branch.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | Pending | Pending | Pending |
| Triage handoff | Pending | Pending | Pending |
| Negative outcomes | Pending | Pending | Pending |
| Smoke evidence | Pending | Pending | Pending |
| Guardrails and verification | Pending | Pending | Pending |

### Verification Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Focused Vitest | Pending | Pending |
| TypeScript | Pending | Pending |
| Lint | Pending | Pending |
| Production build | Pending | Pending |
| Full unit suite | Pending | Pending |
| Full e2e suite | Pending | Pending |
| G7 gate script | Pending | Pending |
| Reviewability diff gate | Pending | Pending |
| Manual synthetic smoke | Pending | Pending |
| Cleanup | Pending | Pending |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `specs/009c2-triage-remediation-handoff/tasks.md`
- [ ] Issue Triage workflow contract emits canonical pilot disposition taxonomy
- [ ] `ACTIONABLE_REMEDIATION` routes to exactly one remediation-planning successor
- [ ] Negative outcomes exit without remediation successors and leave evidence
- [ ] `NEEDS_SPEC` leaves evidence but does not launch SpecKit/SDD
- [ ] Focused Vitest suites pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes or any existing warnings are documented
- [ ] `pnpm build` passes if production code changed
- [ ] Manual smoke checklist uses a fresh SPEC-009C2 synthetic issue
- [ ] Synthetic smoke issue and disposable Mission Control rows are cleaned up
- [ ] Roadmap/workflow/spec status updated on the spec branch
- [ ] Branch committed and pushed

---

## Project Structure Reference

```text
docs/ai/workflows/mission-control/workflow-contract.yaml   Repo-owned Mission Control workflow contract
src/lib/workflow-contracts/                                Contract import/apply/export and hash parity surfaces
src/lib/task-dispatch.ts                                   Existing task-chain output validation, routing, successor creation, disposition insert
src/lib/task-artifacts.ts                                  Existing task artifact publish/read/admin behavior
src/lib/task-create.ts                                     Shared task creation and GitHub sync side effects
src/lib/pilot-issue-eligibility.ts                         SPEC-009C1 eligible pilot task identity helper
docs/qa/pilot-smoke-checklist.md                           Manual pilot smoke checklist to extend for C2
docs/ai/rc-factory-technical-roadmap.md                    Roadmap/status/future-spec source of truth
specs/009c2-triage-remediation-handoff/                    Generated SpecKit artifacts
```

---

Template based on SpecKit best practices. This workflow is populated for
SPEC-009C2 and contains no unresolved template placeholders.
