# SpecKit Workflow: SPEC-009C1 - GitHub Pilot Issue Ingest and Eligibility

**Template Version**: 1.0.0
**Created**: 2026-05-14
**Purpose**: Prepare and execute the RC Factory Phase 8C1 pilot issue ingest, GitHub-linked eligibility, synthetic fallback, and no-dispatch proof workflow in autopilot.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009c1-pilot-issue-ingest`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009C1-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-009C1-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

Do not start downstream specs from this worktree. SPEC-009C1 stops after one
eligible live or synthetic Mission Control GitHub issue is selected or created,
ingested through GitHub sync into exactly one GitHub-linked Mission Control
pilot root task, and proven eligible while local-only tasks are rejected.

No automatic GitHub sync cron/poller lifecycle wiring, Issue Triage execution,
Issue Remediation execution, successor creation, claim authority, scheduler
dispatch, runner state, sandbox lifecycle, harness adapter work, or production
eligibility UI belongs in this spec.

---

## Design Concept

Source-of-truth scoping decisions:

- Keep SPEC-009C1 deterministic: operator-triggered sync or fixture-driven sync only.
- Add future roadmap mini-specs for GitHub sync automation and pilot eligibility/evidence surfaces; do not build those surfaces now.
- A live pilot candidate must be an open `racecraft-lab/mission-control` issue with `mc:inbox`, at least one `priority:*`, exactly one routable `area:*`, no existing synced Mission Control task, and no linked PR or terminal state.
- Synthetic fallback is an idempotent operator/smoke script path: find an existing open `[mc-pilot] synthetic e2e issue` first, otherwise create it with `mc:inbox`, `priority:medium`, and `area:dev`.
- Automated tests are fixture-driven. Live GitHub selection/creation is manual/operator-smoke only and requires explicit credentials.
- Pilot eligibility labels are executable GitHub issue criteria; workflow-contract tracker labels remain template metadata for now.
- No new production UI or API surface is required for SPEC-009C1.
- Prove no claim/dispatch/runner state only against current schema/surfaces; formal run-state checks are deferred to SPEC-013A+.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated pilot ingest and eligibility spec from roadmap and design concept; G1 passed with zero unresolved markers |
| Clarify | `$speckit-clarify` | Complete | Resolved eligibility query, synthetic script shape, current-schema absence assertions, and future-spec boundaries |
| Plan | `$speckit-plan` | Complete | Planned fixture-driven GitHub sync tests, operator script, smoke checklist, and current-schema absence evidence; G3 passed |
| Checklist | `$speckit-checklist` | In Progress | Run focused data-integrity, error-handling, security, state-management, and regression-safety checks |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered TDD tasks |
| Analyze | `$speckit-analyze` | Pending | Verify generated artifacts stay inside SPEC-009C1 boundaries |
| Implement | `$speckit-implement` | Pending | Implement the selected tasks and verification evidence |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009c1-pilot-issue-ingest`; reviewability preset resolves; worktree is clean except intended setup artifacts; no main checkout edits are made |
| G1 | After Specify | Requirements cover live issue eligibility, synthetic fallback, GitHub sync ingest, duplicate prevention, local-only rejection, no-dispatch proof, and smoke checklist; no `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | Eligible issue query, synthetic fallback lifecycle, current-schema absence assertions, and manual-vs-fixture GitHub boundary are resolved |
| G3 | After Plan | Architecture reuses existing GitHub sync, `createTask`, label mapping, feature flags, and smoke/script conventions; no scheduler/runtime, UI, or schema work is introduced without explicit justification |
| G4 | After Checklist | All gaps in data integrity, error handling, security, state lifecycle, and regression safety are resolved without widening scope |
| G5 | After Tasks | Tasks cover every acceptance criterion with RED tests before implementation and include explicit non-goal guardrails |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; generated artifacts do not include Issue Remediation, dispatch, claim, runner, sandbox, automatic poller wiring, or production UI/API scope |
| G7 | After Implement | Focused tests, typecheck/lint or justified subset, pilot smoke checklist, current-schema no-dispatch assertions, roadmap/workflow status updates, branch commit, and push are complete |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009c1-pilot-issue-ingest
```

If supported, set:

```bash
GIT_BRANCH_NAME=009c1-pilot-issue-ingest
SPECIFY_FEATURE_DIRECTORY=specs/009c1-pilot-issue-ingest
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
Autopilot must still keep SPEC-009C1 to one primary implementation surface:
GitHub pilot issue ingest and eligibility. The newly inserted future specs are
roadmap planning only and must not be implemented in this branch.

### Constitution and PRD Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, and
`docs/ai/specs/SPEC-009C1-design-concept.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| GitHub tracker truth | Pilot intake must originate from GitHub issue ingest/sync, not local task creation | Spec/plan requirements and tests |
| Zero-regression | Existing GitHub sync and local task behavior remain unchanged outside the pilot evidence path | Focused regression tests |
| Feature-flag discipline | Resolve `PILOT_MISSION_CONTROL_E2E` and prerequisite flags through `resolveFlag`; no inline runtime env checks | Static grep and tests |
| Successor side-effect parity | Any task creation or sync import must use existing `createTask`/GitHub sync paths | Code review and unit tests |
| Test-first development | RED tests define eligibility, duplicate prevention, local-only rejection, and absence assertions before implementation | Task order and test logs |
| No destructive mutation | Synthetic fallback is explicit operator action; tests do not mutate live GitHub | Script contract and smoke checklist |
| Scope control | No automatic poller wiring, claim/dispatch, runner, sandbox, remediation, or production UI | Analyze guardrails and code review |

### Package Manager and Commands

Package manager: `pnpm`, detected from `pnpm-lock.yaml`.

Use focused checks first, then broaden according to blast radius:

```bash
pnpm test src/lib/__tests__/github-sync-engine.test.ts src/lib/__tests__/task-create.github-sync.test.ts src/lib/__tests__/github-label-map.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

If Playwright coverage changes because the smoke checklist or existing GitHub
sync panel is touched, run the focused Playwright target or `pnpm test:e2e`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009C1 |
| Name | GitHub Pilot Issue Ingest and Eligibility |
| Branch | `009c1-pilot-issue-ingest` |
| Dependencies | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009B |
| Enables | SPEC-009C2 |
| Priority | P0 |
| Feature flag scope | `PILOT_MISSION_CONTROL_E2E` for one live or synthetic Mission Control issue |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009C1-design-concept.md` |
| Runtime projection | GitHub issue sync into `tasks.github_repo`, `tasks.github_issue_number`, `tasks.github_synced_at`, task labels/tags, project/workspace routing |
| Existing sync surfaces | `src/lib/github-sync-engine.ts`, `src/lib/github-sync-poller.ts`, `src/app/api/github/sync/route.ts`, `docs/github-sync.md` |
| Strict Scope | Pilot issue selection, synthetic fallback, GitHub ingest/sync fixtures, eligibility guards, smoke-checklist setup, and no Issue Remediation execution |

### Scope Summary

Select one eligible live `racecraft-lab/mission-control` issue or create one
synthetic `[mc-pilot] synthetic e2e issue` only when no safe live candidate
exists. The pilot issue must be ingested/synced into Mission Control as a
GitHub-linked pilot root task. Eligibility must prove GitHub tracker truth,
expected labels, repo linkage, workspace/project routing, duplicate prevention,
and rejection of local-only tasks.

The spec must keep GitHub sync deterministic. Automated tests use fixtures and
existing sync seams. Live GitHub selection/creation is an explicit operator
smoke action with credentials and must not run during normal app startup or CI.

### Success Criteria Summary

- [ ] Exactly one pilot issue is represented as one Mission Control task linked to `racecraft-lab/mission-control` and a concrete GitHub issue number.
- [ ] Eligible live issue selection requires open state, `mc:inbox`, at least one `priority:*`, exactly one routable `area:*`, no existing synced task, and no linked PR or terminal state.
- [ ] Synthetic fallback is idempotent: reuse an existing open `[mc-pilot] synthetic e2e issue` before creating a new one with `mc:inbox`, `priority:medium`, and `area:dev`.
- [ ] Ingest/sync writes expected repo linkage, issue number, sync timestamp, labels/tags, priority, status, workspace, and routed project evidence.
- [ ] Re-running ingest/sync does not create a duplicate task.
- [ ] Local-only tasks created through `/api/tasks` or the task board cannot satisfy pilot eligibility.
- [ ] Current-schema assertions show no Issue Remediation successor, claim, dispatch, runner, sandbox, or future run-state side effects were created.
- [ ] `docs/qa/pilot-smoke-checklist.md` documents operator-triggered sync, live GitHub selection/synthetic fallback, evidence queries, and cleanup notes.
- [ ] Roadmap contains explicit future specs for GitHub sync automation and operator-visible eligibility/evidence surfaces.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on what and why. Output: `specs/009c1-pilot-issue-ingest/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: GitHub Pilot Issue Ingest and Eligibility

Create the SPEC-009C1 specification for the first Mission Control self-hosting
pilot ingest slice. The source of truth is the roadmap entry in
`docs/ai/rc-factory-technical-roadmap.md` and the design concept at
`docs/ai/specs/SPEC-009C1-design-concept.md`.

The spec must require one eligible `racecraft-lab/mission-control` GitHub issue
to enter Mission Control as exactly one GitHub-linked pilot root task through
GitHub ingest/sync. A live candidate is eligible only when it is open, labeled
`mc:inbox`, has at least one `priority:*`, has exactly one routable `area:*`,
has no existing synced Mission Control task, and has no linked PR or terminal
state. If no safe live candidate exists, an explicit operator/smoke script may
create or reuse `[mc-pilot] synthetic e2e issue` with `mc:inbox`,
`priority:medium`, and `area:dev`.

Goals:
- Prove GitHub issue tracker truth before autonomous pilot work continues.
- Prove local-only tasks cannot enter the pilot lane.
- Prove duplicate sync does not create duplicate pilot root tasks.
- Prove no current-schema claim, dispatch, remediation, runner, sandbox, or
  successor side effects are created.
- Produce `docs/qa/pilot-smoke-checklist.md` for manual live smoke evidence.

Non-goals:
- Do not wire automatic GitHub sync cron/poller lifecycle in this spec.
- Do not execute Issue Triage or Issue Remediation.
- Do not add scheduler claim authority, runner state, sandbox lifecycle, or
  harness adapter behavior.
- Do not add production pilot eligibility UI or a new production evidence API.
- Do not change workflow-contract tracker-label semantics.
- Do not run live GitHub mutation from automated tests or normal app runtime.

The specification must cite the relevant PRD constraints: GitHub issues are the
v1 tracker of record; Mission Control tasks are local projections; local-only
tasks remain supported but are not autonomous runner intake.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 18 |
| User Stories | 4 |
| Acceptance Criteria | 10 acceptance scenarios; 6 success criteria |

### Files Generated

- [x] `specs/009c1-pilot-issue-ingest/spec.md`
- [x] `specs/009c1-pilot-issue-ingest/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any eligibility, synthetic fallback, evidence, or absence-proof behavior can be interpreted multiple ways.

### Clarify Prompts

#### Session 1: Eligibility and Fallback

```bash
$speckit-clarify

Focus on SPEC-009C1 eligibility and synthetic fallback:
- Exact live issue query and exclusion filters.
- How to determine "exactly one routable area:* label" from existing project/area routing data.
- Idempotent synthetic issue find-or-create behavior and cleanup checklist ownership.
- How to avoid live GitHub mutation in automated tests.
```

#### Session 2: State and Absence Proof

```bash
$speckit-clarify

Focus on current-schema state proof:
- Which existing tables/fields prove GitHub-linked pilot root task identity.
- Which existing tables/fields prove no remediation successor, claim, dispatch, runner, sandbox, or pipeline side effects.
- How to phrase deferred formal run-state checks for SPEC-013A+ without adding placeholder schema.
```

#### Session 3: Scope and Roadmap Alignment

```bash
$speckit-clarify

Focus on roadmap alignment and scope boundaries:
- Keep automatic GitHub sync polling in future SPEC-013A1, not SPEC-009C1.
- Keep operator-visible pilot evidence surfaces in future SPEC-009E, not SPEC-009C1.
- Keep workflow-contract tracker labels as metadata unless a future contract spec gives them executable filter semantics.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Eligibility and fallback | 4 | Live prefilter set to `repo:racecraft-lab/mission-control is:issue is:open label:"mc:inbox" -linked:pr`; routable `area:*` requires existing area routing to resolve `single_match`; synthetic fallback is explicit operator script find-first/create-with-opt-in behavior with smoke-checklist cleanup; tests use mocked/fixture GitHub seams and CI never requires live credentials or live mutation. Q4 security consensus completed. |
| 2 | State and absence proof | 4 | Current identity proof is exactly one GitHub-linked root `tasks` row by workspace/repo/issue/sync timestamp/`parent_task_id IS NULL`; absence proof uses current `tasks`, `runs`, `task_dispositions`, `task_artifacts`, and `activities` surfaces plus table-if-exists guards for future claim/runner/sandbox tables; `mc:inbox` remains existing inbox status semantics; formal run-state lifecycle checks are deferred to SPEC-013A+ and SPEC-014A+ without placeholder schema. Consensus not required. |
| 3 | Scope and roadmap alignment | 3 | Automatic GitHub sync polling/cron remains deferred to SPEC-013A1; durable operator-visible eligibility/evidence UI/API remains deferred to SPEC-009E; workflow-contract tracker labels remain metadata unless a future contract spec makes them executable. Consensus not required. |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/009c1-pilot-issue-ingest/plan.md` and related artifacts.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Next.js 16 App Router on Node >=22
- Language: TypeScript 5.7 strict
- Frontend: React 19 and Tailwind CSS 3, but no new UI is expected for this spec
- State: Zustand where existing panels need it; avoid new client state for this backend/smoke slice
- Database: SQLite through `better-sqlite3`
- Tests: Vitest for unit/integration tests; Playwright only if an existing UI/smoke checklist path changes
- Package manager: pnpm

## Existing Surfaces To Reuse
- `src/lib/github-sync-engine.ts` for inbound issue sync and fixture/test seams.
- `src/lib/github-label-map.ts` for `mc:*`, `priority:*`, and `area:*` labels.
- `src/lib/task-create.ts` for duplicate prevention and task creation side effects.
- `src/app/api/github/sync/route.ts` for operator-triggered sync.
- `docs/github-sync.md` for existing sync behavior.
- `docs/ai/workflows/mission-control/workflow-contract.yaml` for workflow-template metadata, not executable pilot eligibility.
- `scripts/seed-mission-control-product-line.ts` and adjacent SPEC-009B tests for operator-script style.

## Constraints
- No schema migration unless the live schema proves an unavoidable gap; default expectation is no migration.
- No automatic GitHub sync poller startup, cron job, OpenClaw cron, or scheduler-runtime integration.
- No production UI or new production evidence endpoint unless Clarify proves a hard blocker.
- No Issue Triage, Issue Remediation, claim authority, runner state, sandbox lifecycle, or harness adapter implementation.
- Tests must be fixture-driven and deterministic; live GitHub access belongs only in manual smoke/checklist/script instructions.
- Current-schema absence assertions must not cite nonexistent SPEC-013/014 tables.

## Architecture Notes
- Treat GitHub issue identity as the pilot source of truth.
- Treat Mission Control task rows as synchronized projections and control-plane enrichment.
- Keep executable pilot eligibility separate from workflow-contract tracker label metadata.
- Record roadmap-deferred work in `docs/ai/rc-factory-technical-roadmap.md` but do not implement those future specs here.
- Preserve zero-regression behavior for existing GitHub sync and local task creation.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, implementation surfaces, constitution checks, and no-migration decision |
| `research.md` | Complete | GitHub sync reuse, eligibility, synthetic fallback, evidence, and deferral decisions |
| `data-model.md` | Complete | Pilot issue, root task projection, eligibility decision, synthetic fallback, and smoke evidence shape |
| `contracts/` | Complete | `pilot-ingest-contract.md` defines fixture/operator contract and no-live-mutation boundary |
| `quickstart.md` | Complete | Operator-triggered pilot ingest smoke path and cleanup/evidence steps |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run focused checklists only.

### Recommended Checklist Domains

#### 1. Data Integrity

```bash
$speckit-checklist data-integrity

Focus on SPEC-009C1 requirements:
- Exactly one GitHub issue maps to exactly one task by repo, issue number, and workspace.
- Duplicate sync is idempotent and does not create a second pilot root task.
- Local-only tasks cannot satisfy pilot eligibility.
- Current-schema absence assertions do not depend on future tables.
```

#### 2. Error Handling

```bash
$speckit-checklist error-handling

Focus on SPEC-009C1 requirements:
- No safe live candidate found.
- Synthetic fallback already exists, fails to create, or lacks required labels.
- GitHub API credentials are absent for manual smoke/script execution.
- GitHub sync fails or returns malformed/partial issue data.
```

#### 3. Security

```bash
$speckit-checklist security

Focus on SPEC-009C1 requirements:
- Tests do not require live GitHub secrets.
- Operator scripts must not echo tokens or persist raw credentials.
- Synthetic issue creation is explicit and never hidden in normal runtime sync.
- Smoke checklist avoids leaking private terminal or secret context.
```

#### 4. State Management

```bash
$speckit-checklist state-management

Focus on SPEC-009C1 requirements:
- Pilot eligibility state is derived from current GitHub/task projection state.
- No claim, dispatch, runner, sandbox, or remediation state is introduced.
- Manual smoke state and future automation/evidence surfaces are clearly separated.
```

#### 5. Regression Safety

```bash
$speckit-checklist regression-safety

Focus on SPEC-009C1 requirements:
- Existing GitHub sync remains unchanged for non-pilot issues.
- Existing `/api/tasks` local task creation remains supported but not pilot-eligible.
- Existing workflow-contract import/export semantics remain unchanged.
- Feature flags preserve off-by-default behavior outside the pilot workspace.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | | | |
| error-handling | | | |
| security | | | |
| state-management | | | |
| regression-safety | | | |
| **Total** | | | |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all genuine gaps are resolved. Output: `specs/009c1-pilot-issue-ingest/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate tasks for SPEC-009C1 using:
- `specs/009c1-pilot-issue-ingest/spec.md`
- `specs/009c1-pilot-issue-ingest/plan.md`
- `docs/ai/specs/SPEC-009C1-design-concept.md`

Task structure requirements:
- Follow red-green-refactor. Every production behavior change starts with a failing Vitest test.
- Start with tests for eligible live issue fixture ingest, duplicate prevention, local-only rejection, synthetic fallback idempotency, and no-dispatch absence.
- Keep implementation tasks narrow: reuse GitHub sync, label map, task creation, and existing API/script conventions.
- Include a docs task for `docs/qa/pilot-smoke-checklist.md`.
- Include roadmap/status tasks only for SPEC-009C1 setup/future-spec references already approved in the design concept.
- Mark parallel-safe docs/test tasks with [P] only when they do not touch the same files.

Do not generate tasks for:
- Automatic GitHub sync poller wiring or cron lifecycle.
- Production eligibility UI/API.
- Issue Triage or Issue Remediation execution.
- Scheduler claim authority, runner state, sandbox lifecycle, or harness adapters.
- Schema migrations unless Plan proves they are unavoidable.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Record after Tasks |
| Phases | Record after Tasks |
| Parallel Opportunities | Record after Tasks |
| User Stories Covered | Record after Tasks |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-009C1 across:
- `docs/ai/specs/SPEC-009C1-design-concept.md`
- `specs/009c1-pilot-issue-ingest/spec.md`
- `specs/009c1-pilot-issue-ingest/plan.md`
- `specs/009c1-pilot-issue-ingest/tasks.md`

Focus on:
1. Scope drift: flag any task or requirement that implements automatic GitHub sync polling, production evidence UI/API, Issue Remediation, scheduler claim authority, runner state, sandbox lifecycle, or harness adapters.
2. Traceability: every success criterion must map to FRs and tasks.
3. Current-schema truth: absence assertions must cite existing tables/fields only and defer formal run-state to SPEC-013A+.
4. GitHub mutation safety: live GitHub actions must be manual/operator-smoke only, not CI/unit tests or hidden runtime behavior.
5. Roadmap alignment: future automation and evidence-surface specs should be referenced but not implemented here.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| | | | |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no blocking findings.

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-009C1 from:
- `specs/009c1-pilot-issue-ingest/tasks.md`
- `specs/009c1-pilot-issue-ingest/plan.md`
- `docs/ai/specs/SPEC-009C1-design-concept.md`

Approach:
1. RED: write failing tests for each task before production code changes.
2. GREEN: implement the smallest reuse-oriented change that passes.
3. REFACTOR: keep sync/eligibility/script helpers readable and consistent with local patterns.
4. VERIFY: run focused tests first, then typecheck/lint/build as scope requires.

Implementation guardrails:
- Stay on branch `009c1-pilot-issue-ingest`.
- Do not modify main checkout.
- Do not create schema unless Plan proves there is no current-schema path.
- Do not wire `startSyncPoller()` into runtime startup or scheduler in this spec.
- Do not add production pilot eligibility UI or new evidence API.
- Do not launch or claim work.
- Do not run live GitHub mutation from automated tests.
- Keep roadmap future specs as docs-only references in this branch.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | | | |
| Pilot eligibility | | | |
| Synthetic fallback | | | |
| Smoke evidence | | | |
| Guardrails and verification | | | |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `specs/009c1-pilot-issue-ingest/tasks.md`
- [ ] `docs/qa/pilot-smoke-checklist.md` exists and covers live issue selection, synthetic fallback, operator-triggered sync, evidence queries, and cleanup notes
- [ ] Focused Vitest suites pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes or any existing warnings are documented
- [ ] `pnpm build` passes if production code changed
- [ ] Manual smoke checklist is ready for operator execution
- [ ] Roadmap/workflow/spec status updated on the spec branch
- [ ] Branch committed and pushed

---

## Project Structure Reference

```text
src/lib/github-sync-engine.ts              Existing inbound GitHub sync behavior
src/lib/github-sync-poller.ts              Existing lazy poller; future automation owner, not SPEC-009C1 implementation
src/lib/github-label-map.ts                Mission Control status, priority, and area labels
src/lib/task-create.ts                     Shared task creation and GitHub sync dedupe
src/app/api/github/sync/route.ts           Operator-triggered sync route
scripts/                                   Candidate home for operator smoke/synthetic fallback scripts
docs/github-sync.md                        Existing GitHub sync behavior documentation
docs/qa/pilot-smoke-checklist.md           New manual pilot smoke checklist expected from this spec
docs/ai/rc-factory-technical-roadmap.md    Roadmap/status/future-spec source of truth
specs/009c1-pilot-issue-ingest/            Generated SpecKit artifacts
```

---

Template based on SpecKit best practices. This workflow is populated for
SPEC-009C1 and contains no unresolved template placeholders.
