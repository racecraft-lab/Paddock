# SpecKit Workflow: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

**Template Version**: 1.0.0
**Created**: 2026-05-19
**Purpose**: Prepare and execute the RC Factory Phase 8C4 pilot owner merge gate and GitHub sync reconciliation from `ready_for_owner` to `done`.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009c4-owner-merge-reconciliation`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009C4-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, Open Questions, and design recommendations live at:

```text
docs/ai/specs/SPEC-009C4-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

SPEC-009C4 starts after SPEC-009C3 has proven that the PR-producing pilot task
can reach `ready_for_owner`. C4 owns only the owner merge gate and done
reconciliation. It must not introduce automatic GitHub polling, claim
authority, runner state, sandbox lifecycle, harness adapters, a review packet
table, or an evidence UI.

The only allowed human intervention inside the pilot flow is `G_PILOT_MERGE`:
the operator manually merges the fresh synthetic pilot PR, then Paddock
uses the existing manual GitHub sync path to reconcile the linked task.

---

## Design Concept

Source-of-truth scoping decisions:

- Real GitHub merge happens only at `G_PILOT_MERGE`; automated checks use
  fixtures or mocked GitHub evidence.
- Production reconciliation uses the existing manual GitHub sync path,
  including `pullFromGitHub`; automatic polling remains SPEC-013A1.
- Implementation starts with pilot-specific RED tests and checklist evidence.
  Production code changes are allowed only for a proven gap in exact PR
  matching, idempotency, activity/label sync, or duplicate-launch prevention.
- Live UAT uses a fresh synthetic draft PR. Do not reuse closed/unmerged
  SPEC-009C3 PR #49.
- C4 updates `docs/qa/pilot-smoke-checklist.md` with merge-gate evidence and
  existing task/activity/notification/label/sync evidence for SPEC-009D.
- Required negative coverage: exact PR mismatch, closed issue without merged
  PR, duplicate sync idempotency, and no duplicate launch or local-only
  terminal completion.
- Setup marks C4 `In Progress` only on this branch and leaves C4 completion and
  cleanup for the implementation PR.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/009c4-owner-merge-reconciliation/spec.md` from roadmap plus design concept; G1 passed with 0 markers |
| Clarify | `$speckit-clarify` | Complete | Resolved merge-gate, exact PR evidence, idempotency, and evidence handoff details; G2 passed with 0 markers |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, quickstart, and manual sync reconciliation contract; G3 passed with 0 markers |
| Checklist | `$speckit-checklist` | Complete | Ran five domains; 114 items, 3 gaps resolved, G4 passed with 0 remaining gap markers |
| Tasks | `$speckit-tasks` | Complete | Generated 55 TDD-first tasks across 7 groups; G5 and tasks reviewability gate passed under transition exception |
| Analyze | `$speckit-analyze` | Complete | Found 5 issues, remediated all; G6 passed with 0 CRITICAL/HIGH findings |
| Implement | `$speckit-implement` | Complete | All 55 tasks complete; focused reconciliation tests, live `G_PILOT_MERGE` UAT, cleanup, and final `pnpm test:all` gate passed |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009c4-owner-merge-reconciliation`; reviewability preset resolves; archive sweep excludes the current target; worktree is clean except intended setup artifacts; no main checkout edits are made |
| G1 | After Specify | Requirements cover `G_PILOT_MERGE`, exact PR merge evidence, manual sync reconciliation, labels/status/activities/notifications, idempotency, checklist evidence, and future-spec boundaries; no unresolved clarification markers remain |
| G2 | After Clarify | Fresh synthetic PR shape, fixture/live boundary, merge evidence trust boundary, duplicate-sync behavior, local-only completion guard, and SPEC-009D handoff evidence are resolved |
| G3 | After Plan | Architecture reuses existing GitHub sync, task-chain advancement, task status, labels, activities, notifications, and smoke checklist surfaces; no new poller, webhook listener, claim/run schema, sandbox, adapter, review packet table, or evidence UI is introduced |
| G4 | After Checklist | All gaps in data integrity, state lifecycle, error handling, security, and regression safety are resolved without widening scope |
| G5 | After Tasks | Tasks include RED tests before production changes, explicit guardrails for future specs, focused smoke/checklist work, and reviewability checkpoints |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; generated artifacts do not implement SPEC-009D/E, SPEC-013A/A1/B/C, or SPEC-014A-D |
| G_PILOT_MERGE | Manual owner merge | Operator manually merges the fresh synthetic pilot PR and records the merge gate in `docs/qa/pilot-smoke-checklist.md`; this gate is not validated by `gate-validator` |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, live manual-sync UAT evidence, cleanup evidence, roadmap/workflow status updates, branch commit, and push are complete |

### Autopilot Phase Accounting

This run must account for every prescribed autopilot step. A phase is complete
only when its artifact and gate evidence are recorded here.

| Step | Required By Autopilot | Status | Evidence |
|------|-----------------------|--------|----------|
| Archive Sweep Startup | Step -1 | Complete | 2026-05-19 setup/RED harness pass verified archive sweep startup evidence excludes current target `specs/009c4-owner-merge-reconciliation`; preserve completed prior-spec evidence and stop or dry-run on unsafe dirty worktrees |
| Prerequisites | Step 0 | Complete | 2026-05-19 setup/RED harness pass verified branch `009c4-owner-merge-reconciliation`, SpecKit alias `SPECIFY_FEATURE=009-owner-merge-reconciliation`, explicit `SPECIFY_FEATURE_DIRECTORY=specs/009c4-owner-merge-reconciliation`, and package manager `pnpm` from `pnpm-lock.yaml` |
| Specify | Phase 1 / G1 | Complete | Generated `spec.md` with 20 FRs, 4 user stories, 12 acceptance scenarios, 10 success criteria; requirements checklist complete; G1 passed with 0 markers |
| Clarify | Phase 2 / G2 | Complete | Four sessions completed; G2 passed with 0 `[NEEDS CLARIFICATION]` markers; consensus decisions logged below |
| Plan | Phase 3 / G3 | Complete | Generated `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/manual-github-sync-reconciliation.md`; G3 passed with 0 markers |
| Checklist | Phase 4 / G4 | Complete | 114 checklist items across five domains; 3 error-handling gaps resolved; G4 passed with 0 remaining `[Gap]` markers |
| Tasks | Phase 5 / G5 | Complete | 55 tasks, 7 groups, 24 parallel opportunities, 4 user stories covered; tasks reviewability gate passed under transition exception |
| Analyze | Phase 6 / G6 | Complete | 1 critical, 3 high, and 1 low issue remediated; G6 passed with 0 CRITICAL/HIGH findings |
| Implement | Phase 7 / G7 | Complete | All 55 generated tasks complete; focused Vitest passed 30 tests; live UAT used fresh issue #50 / PR #51; cleanup verified; final `pnpm test:all` passed after installing the missing Playwright Chromium cache |
| Post-Implementation Verify | Post step 10/12 | Complete | `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and final `pnpm test:all` passed under Node 22 |
| Cleanup / Reviewability / PR | Post steps 13-18 | Complete | Reviewability and PR packet prepared; branch pushed to `origin`; PR #52 opened for review |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009c4-owner-merge-reconciliation
```

For prerequisite-backed SpecKit scripts on this non-standard branch, keep the
actual git branch unchanged and set a validator-compatible SpecKit alias plus
the explicit feature directory:

```bash
SPECIFY_FEATURE=009-owner-merge-reconciliation
SPECIFY_FEATURE_DIRECTORY=specs/009c4-owner-merge-reconciliation
```

`SPECIFY_FEATURE` is only a script-validation alias. The actual branch guard
remains `git rev-parse --abbrev-ref HEAD` returning
`009c4-owner-merge-reconciliation`.

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
the SPEC-009C family. Autopilot must still keep SPEC-009C4 to one primary
implementation surface: owner merge gate and GitHub-sync done reconciliation
for the pilot path.

### Autopilot Startup Evidence

Prerequisite discovery on 2026-05-19:

- Branch/worktree: `009c4-owner-merge-reconciliation`, isolated worktree,
  clean before setup artifact edits.
- SpecKit CLI found at `/Users/fredrickgabelmann/.local/bin/specify`.
- Package manager: `pnpm`, detected from `pnpm-lock.yaml`.
- Remote: `origin` -> `git@github.com:racecraft-lab/Paddock.git`.
- Reviewability preset detected:
  `speckit-pro-reviewability` for spec, plan, and tasks templates.
- Current source commit: `13a104f6` from `main` at setup time.

Setup and RED harness verification on 2026-05-19:

- Branch guard rerun from the active worktree: `git status --short --branch`
  returned `009c4-owner-merge-reconciliation...origin/009c4-owner-merge-reconciliation`.
- SpecKit env alias evidence remains:
  `SPECIFY_FEATURE=009-owner-merge-reconciliation` plus
  `SPECIFY_FEATURE_DIRECTORY=specs/009c4-owner-merge-reconciliation`.
  The alias is for script validation only; the git branch remains
  `009c4-owner-merge-reconciliation`.
- Package manager evidence: `ls -1 *lock*` returned `pnpm-lock.yaml`; C4 uses
  pnpm commands only.
- Alignment evidence: `spec.md`, `plan.md`, and
  `SPEC-009C4-design-concept.md` all agree that `G_PILOT_MERGE` is the only
  human merge gate, production reconciliation reuses the existing manual
  `pullFromGitHub` sync path, and automatic polling/webhooks/scheduler work
  remain out of scope.
- Archive-sweep evidence: startup accounting explicitly excludes the current
  target `specs/009c4-owner-merge-reconciliation` from same-run archival while
  preserving previously completed spec evidence.

Existing seam inventory for setup/RED harness:

- `src/lib/github-sync-engine.ts` owns `pullFromGitHub(project, workspaceId,
  opts?)`, test-only `webhookFixture` injection, linked PR lookup through
  `fetchPullRequest(task.github_repo, task.github_pr_number)`, reconciliation
  activity/notification writes, and the post-terminal `advanceTaskChain` call.
- `src/app/api/github/sync/route.ts` keeps the manual API trigger shape
  `{ "action": "trigger", "project_id": <id> }`, resolves workspace scope,
  loads the active GitHub-enabled project, and calls
  `pullFromGitHub(project, workspaceId)` without a fixture argument.
- `src/lib/task-dispatch.ts` owns `advanceTaskChain`, successor idempotency via
  existing successor checks, and ready-for-owner side effects in the task-chain
  surface. No production edits were made during this setup inventory.

### Constitution and PRD Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, and
`docs/ai/specs/SPEC-009C4-design-concept.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| GitHub tracker truth | `done` reconciliation comes from GitHub merged PR evidence for the linked PR-producing task, not local-only status mutation | Fixture/live sync tests and smoke evidence |
| Two-step terminal gate | Work remains `ready_for_owner` until `G_PILOT_MERGE` and verified GitHub merge evidence | Transition tests and live UAT checklist |
| Existing sync reuse | Manual sync through existing GitHub sync engine performs reconciliation; no new poller/webhook/scheduler path | Code review and scope guards |
| Durable evidence | Checklist, task status, activities, notifications, labels, and sync evidence are inspectable for SPEC-009D | Smoke checklist and assertions |
| Exact identity | Merged PR evidence must match expected repo and PR number; unrelated closed/merged evidence cannot mark the task done | RED tests and fixture coverage |
| Idempotency | Duplicate syncs do not duplicate terminal activities, notifications, successor launches, or cleanup work | RED tests and activity counts |
| Scope control | No claim/run schema, runner state, sandbox lifecycle, harness adapter, review packet table, or evidence UI | Analyze guardrails and code review |
| Test-first development | RED tests define merge reconciliation and negative behavior before any production code changes | Task order and test logs |

### Package Manager and Commands

Package manager: `pnpm`, detected from `pnpm-lock.yaml`.

Use focused checks first, then broaden according to blast radius:

```bash
pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

If the Task Board, GitHub sync settings UI, pilot smoke checklist rendering, or
operator evidence surfaces change, run the focused Playwright target or
`pnpm test:e2e` while narrowing the change. Before completion, run
`pnpm test:all` as the final PR gate; if only library tests and Markdown
checklist evidence changed, record the no-new-UI-journey rationale separately
from the full gate result.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009C4 |
| Name | Owner Merge Gate and Done Reconciliation |
| Branch | `009c4-owner-merge-reconciliation` |
| Dependencies | SPEC-009C3 |
| Enables | SPEC-009D, SPEC-010B |
| Priority | P0 |
| Tool surface | None; tools list is empty |
| Feature flag scope | `PILOT_MISSION_CONTROL_E2E` plus existing two-step terminal and GitHub sync behavior where required |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Design Concept | `docs/ai/specs/SPEC-009C4-design-concept.md` |
| Runtime projection | Existing GitHub sync engine, ready-for-owner terminal event, task-chain advancement, task status labels, activities, notifications, and pilot smoke checklist |
| Existing surfaces | `src/lib/github-sync-engine.ts`, `src/lib/__tests__/github-sync-ready-for-owner.test.ts`, `src/lib/github-label-map.ts`, `docs/qa/pilot-smoke-checklist.md`, `docs/ai/workflows/mission-control/workflow-contract.yaml` |
| Strict Scope | Merge-gate checklist evidence, GitHub closed/merged PR fixture, reconciliation activity assertions, label/status sync, and no new claim/runner/sandbox model |

### Scope Summary

Record the intentional `G_PILOT_MERGE` human gate, merge the linked pilot PR,
sync GitHub state back into Paddock through the existing manual sync
path, and prove `ready_for_owner -> done` reconciliation without duplicate
launch or local-only terminal completion.

The implementation must start by proving whether current code already satisfies
the core behavior. If it does, keep production changes narrow or avoid them.
Any change must be justified by failing coverage for exact PR matching,
idempotency, activity/label sync, or duplicate-launch prevention.

### Success Criteria Summary

- [x] `G_PILOT_MERGE` is represented as the only allowed manual intervention
  in the pilot flow.
- [x] Automated tests prove exact repo and PR-number match is required before
  a `ready_for_owner` task can become `done`.
- [x] A closed issue without matching merged PR evidence remains
  `ready_for_owner` and records reconciliation-required evidence without
  advancing the task chain.
- [x] Duplicate GitHub syncs after a verified merge are idempotent: no
  duplicate launch, no duplicate terminal activity flood, no duplicate
  notification flood, and no local-only completion.
- [x] Label/status sync proves the task reaches `done` with expected
  `mc:done`/status behavior and does not keep stale ready-for-owner projection.
- [x] `docs/qa/pilot-smoke-checklist.md` records live UAT evidence for a fresh
  synthetic pilot PR merged at `G_PILOT_MERGE`.
- [x] SPEC-009D can trace issue/PR state, task status, labels, activities,
  notifications, and deferred runner fields from existing evidence.
- [x] No new poller, webhook listener, scheduler path, claim/run table,
  sandbox lifecycle, harness adapter, review packet table, or evidence UI is
  introduced.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/009c4-owner-merge-reconciliation/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

### Problem Statement
SPEC-009C3 proves that the Paddock pilot remediation chain can reach
`ready_for_owner` with a linked PR-producing task. SPEC-009C4 must complete the
two-step terminal model by recording the owner merge gate, merging a fresh
synthetic pilot PR only through operator action, syncing GitHub state back into
Paddock, and proving the linked task reconciles from `ready_for_owner`
to `done`.

### Goals
- Represent `G_PILOT_MERGE` as the only allowed manual intervention in the C4
  pilot flow.
- Use the existing manual GitHub sync path, including `pullFromGitHub`, as the
  production reconciliation trigger.
- Prove exact PR identity: repo and PR number must match the PR-producing task.
- Prove closed issue/no merged PR behavior remains `ready_for_owner` and emits
  reconciliation-required evidence.
- Prove duplicate sync idempotency and no duplicate launch.
- Prove label/status sync and activity/notification evidence for SPEC-009D.
- Record live smoke evidence in `docs/qa/pilot-smoke-checklist.md` using a
  fresh synthetic draft PR, not closed/unmerged SPEC-009C3 PR #49.

### Non-goals
- No automatic GitHub sync polling, webhook listener, scheduler path, or new
  sync API surface.
- No claim-state table, runner state, sandbox lifecycle, harness adapter, or
  local execution model.
- No review packet table, lifecycle snapshot API/UI, or evidence dashboard.
- No broad rewrite of GitHub sync if focused RED tests show existing behavior
  already satisfies the contract.
- No local-only task status mutation to satisfy terminal completion.

### Existing surfaces to reuse
- `src/lib/github-sync-engine.ts`
- `src/lib/__tests__/github-sync-ready-for-owner.test.ts`
- `src/lib/github-label-map.ts`
- `docs/qa/pilot-smoke-checklist.md`
- `docs/ai/workflows/mission-control/workflow-contract.yaml`

### Required design-source alignment
Use `docs/ai/specs/SPEC-009C4-design-concept.md` as the source of truth for
interview decisions. The spec must cite the decisions from Q1-Q7 when encoding
the human merge gate, manual sync trigger, narrow hardening strategy, fresh PR
UAT target, evidence boundary, negative cases, and archive/status hygiene.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 20 |
| User Stories | 4 |
| Acceptance Criteria | 12 |

### Files Generated

- [x] `specs/009c4-owner-merge-reconciliation/spec.md`
- [x] `specs/009c4-owner-merge-reconciliation/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, before Plan. Run targeted sessions until no critical ambiguity remains.

### Clarify Prompts

#### Session 1: Merge Gate and Manual Sync Boundary

```bash
$speckit-clarify

Focus on SPEC-009C4 merge-gate boundaries:
- How `G_PILOT_MERGE` is represented in spec, checklist, quickstart, and
  workflow evidence.
- Why live GitHub merge happens only after the operator confirms the gate.
- Which existing manual sync entrypoint is used after merge.
- How to document that automatic polling, webhook handling, and scheduler
  lifecycle remain SPEC-013A1.
- Confirm that `gate-validator` does not validate the human merge gate.
```

#### Session 2: Exact PR Evidence and Trust Boundary

```bash
$speckit-clarify

Focus on exact GitHub merge evidence:
- Required repo, issue, PR number, merged flag, merged timestamp, and merge
  commit semantics.
- Fixture versus live GitHub evidence and how fixtures stay test-only.
- Behavior when issue is closed but the linked PR is unmerged or missing.
- Behavior when a different PR in the same repo is merged.
- How labels and status projection are expected to change after reconciliation.
```

#### Session 3: Idempotency and Duplicate-Launch Prevention

```bash
$speckit-clarify

Focus on side-effect safety:
- Duplicate manual sync after a verified merge.
- Activity, notification, and label/status de-duplication expectations.
- Whether `advanceTaskChain` can run more than once for the terminal event and
  how to prove it does not duplicate launch.
- Why local-only status mutation cannot satisfy the C4 success gate.
- Cleanup evidence for synthetic tasks/issues/PRs after live UAT.
```

#### Session 4: SPEC-009D Evidence Handoff

```bash
$speckit-clarify

Focus on evidence for the later review packet:
- Which existing rows/fields SPEC-009D can consume for issue state, PR state,
  task status, labels, activities, notifications, artifacts, Aegis approval,
  and owner merge gate.
- How `docs/qa/pilot-smoke-checklist.md` records live UAT without becoming a
  packet schema.
- How deferred runner, claim, sandbox, and adapter fields are represented as
  explicitly deferred rather than inferred.
- Whether any UI assertion is needed, and why packet UI remains SPEC-009D/E.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Merge gate/manual sync | 5 | `G_PILOT_MERGE` is workflow/checklist evidence only; canonical sync entrypoint is project-scoped `POST /api/github/sync` backed by `pullFromGitHub`; polling/webhook/scheduler remain deferred; `gate-validator` excludes the human merge action; live UAT proof is checklist text evidence with fresh PR identity, task/workspace/project identity, pre/post state, sync result, evidence rows, cleanup status, and explicit non-use of PR #49 |
| 2 | Exact PR evidence | 5 | Authoritative live merge proof requires explicit merged truth for the exact linked repo/PR, such as `merged === true` or an equivalent merged-state check; `merge_commit_sha`, `merged_at`, issue-closed state, labels, or timeline data are supporting evidence only; accepted identity is scoped to workspace/project, repo, issue, and PR number; insufficient evidence gets typed reconciliation-required reasons; successful reconciliation updates `done` status/labels and evidence; fixtures remain test-only |
| 3 | Idempotency/duplicate launch | 5 | Duplicate sync leaves task `done`, creates no duplicate launch, and does not advance the chain again; bounded notification evidence reuses existing `task_ready_for_owner` and reconciliation-required rows, with no new terminal-done notification; done label projection through existing label mechanisms is required; local-only status mutation is not evidence; live UAT cleanup preserves GitHub audit trail and removes or documents disposable Paddock residue after evidence capture |
| 4 | SPEC-009D handoff | 5 | SPEC-009D consumes existing source-map evidence from tasks, activities, notifications, task artifacts, quality reviews, labels, and smoke-checklist text; C4 smoke evidence remains checklist text, not YAML/JSON packet schema; C4 references existing C3 artifact/Aegis rows without copying them; runner/claim/poller/sandbox/adapter fields are explicit future-spec deferrals, not placeholder schema; Playwright is required only if UI or rendered evidence surfaces change |

### Consensus Resolution Log

| Phase | Item | Round | Routed Categories | Outcome | Analysts Used |
|-------|------|-------|-------------------|---------|---------------|
| Clarify Session 1 | Canonical manual sync entrypoint after `G_PILOT_MERGE` | 1 | codebase | Accepted project-scoped `POST /api/github/sync` `{ action: "trigger", project_id }` with `pullFromGitHub(project, workspaceId)` as shared underlying path; no Round 2 needed | codebase-analyst |
| Clarify Session 1 | Minimum live UAT proof for `G_PILOT_MERGE` | 1 | spec | Accepted checklist text evidence with fresh PR, task, workspace/project, pre/post state, manual merge, sync result, evidence rows, cleanup status, and explicit non-use of PR #49; no new manifest, packet schema, API, dashboard, or UI | spec-context-analyst |
| Clarify Session 2 | Authoritative merged PR proof | 2 | codebase, domain, spec | Accepted stricter C4 requirement: explicit merged truth for the exact linked PR is authoritative; current code accepts `merged_at`/`merge_commit_sha` alone, so implementation must use RED tests before tightening behavior | codebase-analyst, domain-researcher, spec-context-analyst |
| Clarify Session 3 | Bounded notification evidence | 1 | codebase, spec | Accepted reuse of existing owner-ready/reconciliation notification rows; successful merge reconciliation is proven by exact PR merge evidence, task status, done label projection, terminal activity, sync result, and traceable existing notifications; no new terminal-done notification type | codebase-analyst, spec-context-analyst |
| Clarify Session 3 | Done label projection after inbound merge reconciliation | 1 | codebase, spec | Accepted that `mc:done` projection and stale `mc:ready-for-owner` removal are required C4 behavior; current inbound path appears local-only, so RED tests must prove and drive any hardening | codebase-analyst, spec-context-analyst |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/009c4-owner-merge-reconciliation/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node >=22, Next.js 16 App Router, React 19, TypeScript 5.7 strict.
- State/UI: Zustand where existing panels need it, Tailwind CSS 3.
- Data: SQLite through `better-sqlite3`, synchronous transactions.
- Tests: Vitest, Playwright only if existing UI/smoke surfaces change, ESLint,
  pnpm.
- GitHub integration: existing GitHub sync engine and native `fetch` paths.
- Workflow policy: repo-owned YAML contract in
  `docs/ai/workflows/mission-control/workflow-contract.yaml`.

## Architecture Constraints
- Reuse existing `pullFromGitHub` and GitHub sync reconciliation logic.
- Reuse exact PR matching behavior in `src/lib/github-sync-engine.ts`.
- Reuse `advanceTaskChain` only after verified `github_pr_merged` evidence.
- Reuse existing task status, label mapping, activity, and notification
  surfaces.
- Reuse `docs/qa/pilot-smoke-checklist.md` for live merge-gate evidence.
- Do not add a new webhook listener, scheduler/poller lifecycle, claim/run
  schema, sandbox lifecycle, harness adapter, review packet table, or evidence
  UI.
- Keep production changes conditional on failing focused tests.

## Design Concept Decisions
- Q1 requires real GitHub merge only at `G_PILOT_MERGE`.
- Q2 requires the existing manual GitHub sync path as the reconciliation
  trigger.
- Q3 requires narrow hardening only, RED tests first.
- Q4 requires a fresh synthetic draft PR for live C4 UAT and forbids reuse of
  SPEC-009C3 PR #49.
- Q5 requires checklist and existing task/activity/notification/label/sync
  evidence for SPEC-009D, not packet implementation.
- Q6 requires negative coverage for exact PR mismatch, closed issue without
  merged PR, duplicate sync idempotency, and no duplicate launch/local-only
  completion.
- Q7 requires roadmap status to move only to `In Progress` during setup and
  archive sweep to exclude the current target.

## Reviewability Budget
Primary surface: GitHub sync reconciliation and smoke checklist evidence.
Secondary surfaces: tests, label/status assertions, task-chain side effects,
and roadmap/workflow documentation. Proceed under the roadmap transition
exception, but split anything that introduces automatic polling, claim/run
state, sandboxing, adapters, or packet UI.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, constitution gates, primary/secondary surfaces, project structure, reviewability exception |
| `research.md` | Complete | Seven decisions for manual sync reuse, exact PR evidence, idempotency, live UAT, and evidence handoff |
| `data-model.md` | Complete | Existing entities, task/PR identity, activity/notification evidence, labels, and state transitions |
| `contracts/` | Complete | `manual-github-sync-reconciliation.md` |
| `quickstart.md` | Complete | Fixture validation path and fresh synthetic PR `G_PILOT_MERGE` UAT path |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Target focused domains because this slice crosses GitHub state, local projections, task-chain side effects, and operator evidence.

### Recommended Checklist Prompts

#### 1. data-integrity Checklist

Why: SPEC-009C4 depends on exact task/PR identity, status projection, labels, activities, notifications, and idempotent sync rows.

```bash
$speckit-checklist data-integrity

Focus on SPEC-009C4 requirements:
- Repo and PR number must match the PR-producing task before `done`.
- Closed issue without matching merged PR evidence remains `ready_for_owner`.
- Duplicate syncs preserve one terminal outcome and do not flood activities or
  notifications.
- Label/status projection changes from ready-for-owner to done correctly.
- Pay special attention to exact identity and idempotency.
```

#### 2. state-management Checklist

Why: The core risk is incorrect transition from `ready_for_owner` to `done` or duplicate task-chain launch.

```bash
$speckit-checklist state-management

Focus on SPEC-009C4 requirements:
- `ready_for_owner` remains stable until `G_PILOT_MERGE` plus verified GitHub
  merge evidence.
- `advanceTaskChain` runs only after verified `github_pr_merged` evidence.
- Local-only terminal completion cannot satisfy the success gate.
- Duplicate sync after merge is side-effect-safe.
- Pay special attention to no duplicate launch.
```

#### 3. error-handling Checklist

Why: Missing, mismatched, unmerged, or partially synced GitHub evidence must fail closed with useful operator evidence.

```bash
$speckit-checklist error-handling

Focus on SPEC-009C4 requirements:
- Missing PR evidence produces reconciliation-required evidence without done
  transition.
- Mismatched PR evidence does not mark the task done.
- GitHub sync failures do not create local-only completion.
- Live UAT cleanup failures are documented without hiding reconciliation state.
- Pay special attention to side-effect-free failed reconciliation.
```

#### 4. security Checklist

Why: GitHub PR evidence and fixture/live boundaries are trust boundaries.

```bash
$speckit-checklist security

Focus on SPEC-009C4 requirements:
- Fixture PR evidence remains test-only and cannot spoof live GitHub proof.
- Repo and PR number matching prevents unrelated PR merges from closing tasks.
- Smoke checklist evidence does not leak secrets or tokens.
- Manual merge gate is explicit and operator-controlled.
- Pay special attention to trust boundaries between fixture evidence and live
  GitHub evidence.
```

#### 5. regression-safety Checklist

Why: C4 must not break SPEC-005 two-step terminal behavior, SPEC-009C3 readiness, or later control-plane scopes.

```bash
$speckit-checklist regression-safety

Focus on SPEC-009C4 requirements:
- Existing non-pilot GitHub sync behavior remains compatible.
- Existing ready-for-owner behavior remains compatible for other PR-producing
  tasks.
- SPEC-009D/E, SPEC-013A/A1/B/C, and SPEC-014A-D remain out of scope.
- No review packet UI, claim/run state, sandbox, adapter, or automatic poller
  enters the diff.
- Pay special attention to future-spec boundaries.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 24 | 0 | Exact identity, authoritative merged PR truth, duplicate sync idempotency, bounded existing evidence, done label projection |
| state-management | 24 | 0 | Two-step terminal state, `advanceTaskChain` guard, local-only completion rejection, duplicate-sync side-effect safety |
| error-handling | 22 | 3 resolved | Added failed-sync evidence requirements, failed-reconciliation no-side-effect boundaries, and cleanup-failure evidence that preserves reconciliation state |
| security | 24 | 0 | Fixture/live trust boundary, exact PR identity, manual owner merge gate, failed-sync side-effect boundary, smoke evidence redaction |
| regression-safety | 20 | 0 | Non-pilot compatibility, ready-for-owner compatibility, future-spec boundaries, no packet UI/claim/run/sandbox/adapter/poller scope |
| **Total** | 114 | 3 resolved | G4 passed with 0 remaining `[Gap]` markers |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/009c4-owner-merge-reconciliation/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-009C4 using:
- `specs/009c4-owner-merge-reconciliation/spec.md`
- `specs/009c4-owner-merge-reconciliation/plan.md`
- `docs/ai/specs/SPEC-009C4-design-concept.md`

Task constraints:
- Write RED tests before production changes for exact PR match, closed issue
  without merged PR, duplicate sync idempotency, label/status sync, terminal
  activity/notification evidence, and no duplicate launch.
- Start from `src/lib/__tests__/github-sync-ready-for-owner.test.ts` and
  `src/lib/github-sync-engine.ts`; patch production code only for proven gaps.
- Include smoke-checklist tasks for a fresh synthetic draft PR merged at
  `G_PILOT_MERGE`.
- Include guardrail tasks proving no new webhook/poller/scheduler path,
  claim/run schema, sandbox lifecycle, harness adapter, review packet table, or
  evidence UI.
- Include cleanup tasks for synthetic GitHub and Paddock UAT residue.
- Ensure task ordering preserves red-green-refactor.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| **Total Tasks** | 55 |
| **Phases** | 7 |
| **Parallel Opportunities** | 24 |
| **User Stories Covered** | 4 |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks to catch issues.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment - verify GitHub tracker truth, two-step terminal
   semantics, test-first order, and archive hygiene.
2. Coverage gaps - ensure all FRs, user stories, and checklist gaps have tasks.
3. Consistency between task file paths and actual Paddock structure.
4. Reviewability - verify the generated implementation remains a small C4
   reconciliation slice.
5. Scope boundaries - reject new automatic polling, webhook listener,
   scheduler lifecycle, claim/run schema, sandbox lifecycle, harness adapter,
   review packet table, or evidence UI.
6. Evidence handoff - verify SPEC-009D can trace existing task/activity/
   notification/label/sync/checklist evidence without a new packet schema.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A001 | CRITICAL | Final verification task did not preserve `pnpm test:all` PR gate | Resolved in T054, `quickstart.md`, and workflow verification text |
| A002 | HIGH | SpecKit prerequisite validator rejected required `009c4` branch shape | Resolved with documented `SPECIFY_FEATURE=009-owner-merge-reconciliation` alias plus `SPECIFY_FEATURE_DIRECTORY` while preserving actual git branch |
| A003 | HIGH | Tasks referenced nonexistent `src/lib/task-chain.ts` | Resolved by replacing task references with `src/lib/task-dispatch.ts` |
| A004 | HIGH | Tasks lacked supporting-only PR metadata coverage | Resolved by amending T025 for `merged_at`/`merge_commit_sha` without explicit merged truth |
| A005 | LOW | Workflow counts drifted after checklist remediation | Resolved: 20 FRs, 10 success criteria |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no blocking coverage gaps.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task, follow this cycle:

1. RED: Write failing test defining expected behavior.
2. GREEN: Implement minimum code to make test pass.
3. REFACTOR: Clean up while tests still pass.
4. VERIFY: Record acceptance evidence and manual UAT status.

### Pre-Implementation Setup

Before starting any task:
1. Verify branch is `009c4-owner-merge-reconciliation`.
2. Verify `pnpm-lock.yaml` selects `pnpm`.
3. Verify reviewability preset resolution for spec, plan, and tasks.
4. Run archive sweep startup and exclude
   `specs/009c4-owner-merge-reconciliation`.
5. Run the focused baseline:
   `pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts`.

### Implementation Notes
- Prefer no production code change when focused tests prove current behavior.
- If production code changes are required, keep them inside existing GitHub sync
  and task-chain surfaces.
- Record `G_PILOT_MERGE` live UAT in `docs/qa/pilot-smoke-checklist.md` using
  a fresh synthetic draft PR.
- Do not merge or close unrelated PRs.
- Do not satisfy C4 by direct local status mutation.
- Do not add a poller, webhook listener, scheduler path, claim/run schema,
  sandbox lifecycle, harness adapter, packet table, or evidence UI.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Setup and RED coverage | T001-T009 | Complete | Setup evidence recorded; RED harness helpers added; initial RED observed for supporting-only PR metadata |
| 2 - Reconciliation behavior | T010-T041 | Complete | Exact merged-PR truth, done label projection, fail-closed local-only `done`, and duplicate-sync idempotency implemented; focused Vitest passes 30 tests under Node 22 |
| 3 - Evidence and smoke checklist | T042-T049 | Complete | Operator-approved live UAT created fresh issue #50 and PR #51, merged at `G_PILOT_MERGE`, reconciled via manual sync, proved duplicate sync idempotency, and cleaned disposable local residue |
| 4 - Guardrails, cleanup, and verification | T050-T055 | Complete | Guardrails held; `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and final `pnpm test:all` passed; roadmap/workflow/status hygiene updated |

---

## Post-Implementation Checklist

- [x] All tasks marked complete in `tasks.md`.
- [x] Focused reconciliation tests pass:
  `pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts`.
- [x] Broader checks pass according to changed surface:
  `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [x] Playwright decision recorded.
- [x] `G_PILOT_MERGE` live UAT recorded in `docs/qa/pilot-smoke-checklist.md`.
- [x] Synthetic GitHub and Paddock residue cleaned up or explicitly
  documented.
- [x] Roadmap and workflow status updated.
- [x] Reviewability gate recorded.
- [x] PR review packet prepared.
- [x] Branch pushed to `origin`.

### Post-Implementation Results

- **G7:** Passed with all 55 generated tasks complete.
- **Focused reconciliation tests:** `pnpm test src/lib/__tests__/github-sync-ready-for-owner.test.ts` passed 30 tests under Node 22.
- **Final verification:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and final `pnpm test:all` passed. `pnpm test` reported 275 passed test files, 33 skipped files, 2894 passed tests, 3 skipped tests, and 84 todo tests; `pnpm test:all` included 646 passing Playwright tests.
- **Playwright decision:** no new targeted UI journey was required because C4 changed library reconciliation behavior, focused Vitest coverage, and Markdown evidence only; the full Playwright suite still ran through `pnpm test:all`.
- **Live UAT:** temporary branch deployment at `http://127.0.0.1:3134` created issue #50 and PR #51, verified task `1` stayed `ready_for_owner` before `G_PILOT_MERGE`, squash-merged PR #51, then reconciled task `1` to `done` through existing `POST /api/github/sync`.
- **UAT cleanup:** temporary Paddock rows were removed after checklist export; related rows went from `1/1/2/0/0/3` to `0/0/0/0/0/0`; GitHub issue #50 and merged PR #51 remain as external audit trail.
- **Target deployment closeout:** PR #52 merged to `main` as `ddc709f2f200a4ee4df51398d39ef42d85bd6e54`; HAL `/home/fredrick-gabelmann/mission-control` was fast-forwarded to that commit, `pnpm build` passed, `mission-control.service` restarted, `/login` returned 200, and authenticated `/api/status` returned 200. Target replay UAT on workspace `4` / project `3` used disposable task `41` linked to retained issue #50 / PR #51; deployed `POST /api/github/sync` returned `pulled=1`, `pushed=0`, task `41` moved to `done`, duplicate sync returned `pulled=0`, `pushed=0`, no successor child was created, and the disposable task row was removed after evidence capture. Backup: `/home/fredrick-gabelmann/mission-control-data/backups/mission-control.db.spec009c4-target-uat-20260520-025827.bak`.
- **Reviewability:** final diff stayed in the planned C4 slice: existing GitHub sync reconciliation, focused tests, smoke checklist, workflow, roadmap, and autopilot status. No new poller, webhook, scheduler, claim/run schema, sandbox lifecycle, harness adapter, review packet table, evidence UI, migration, or runtime dependency entered the diff.
- **Roadmap status:** C4 is `Complete` after PR #52 merge and HAL target deployment/UAT closeout.
- **PR:** [#52](https://github.com/racecraft-lab/Paddock/pull/52) merged from branch `009c4-owner-merge-reconciliation`.
- **Push:** Branch `009c4-owner-merge-reconciliation` pushed to `origin`.

---

## Lessons Learned

### What Worked Well

- The RED-first fixture matrix made the exact-PR and fail-closed boundaries
  reviewable before production sync hardening.
- Keeping the live UAT on a disposable local deployment avoided HAL service
  drift while still proving real GitHub issue/PR state through the existing
  manual sync path.

### Challenges Encountered

- The final `pnpm test:all` gate initially failed because the Playwright
  Chromium headless-shell cache was missing, not because of product behavior.
  Installing the expected browser cache and rerunning the same gate produced a
  clean pass.
- The SQLite backup copy taken while WAL was active was not treated as the
  canonical evidence source; row-count evidence came from the live temp DB
  connection before cleanup and was exported into the checklist.

### Patterns to Reuse

- For future live UAT gates, record both external GitHub audit trail and local
  row-count cleanup evidence before deleting disposable Paddock rows.
- Keep roadmap status distinct from workflow/G7 status: branch implementation
  can pass before roadmap completion, and completion waits for PR merge plus
  target deployment promotion evidence.

---

## Project Structure Reference

```text
mission-control/
├── src/app/                         # Next.js pages and API routes
├── src/components/                  # UI panels and shared components
├── src/lib/                         # Core logic, database, GitHub sync, utilities
├── src/lib/__tests__/               # Vitest unit/integration tests
├── docs/ai/specs/                   # SpecKit workflow/design artifacts
├── docs/ai/workflows/mission-control/ # Repo-owned workflow contract
├── docs/qa/                         # Pilot smoke checklist and UAT evidence
├── specs/                           # Generated SpecKit specs/plans/tasks
└── scripts/                         # Install, deploy, diagnostics, spec scripts
```

---

Template based on SpecKit best practices and generated from the
speckit-pro-reviewability setup path.
