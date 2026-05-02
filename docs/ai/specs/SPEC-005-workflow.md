# SpecKit Workflow: SPEC-005 - ready_for_owner State and Two-Step Terminal Event

**Template Version**: 1.0.0
**Created**: 2026-05-02
**Purpose**: Prepare and execute the RC Factory Phase 4 two-step terminal event specification in Codex.

---

## How to Use This Workflow

Run this workflow from the `005-ready-for-owner` worktree:

```bash
$speckit-autopilot docs/ai/specs/SPEC-005-workflow.md
```

Autopilot must begin with Archive Sweep discovery and the Phase 0 status-hygiene prerequisite before normal Specify work. The sweep handles previously merged specs only (`SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`, `SPEC-004`, and `SPEC-006`), excludes `SPEC-005`, and must stay dry-run-only or stop unless the branch is clean and safe cleanup has been explicitly recorded.

Do not start downstream specs from this worktree. SPEC-005 stops after feature-flagged `ready_for_owner` runtime behavior, two-step terminal GitHub merge handling, Kanban/label/notification surfaces, verification, and roadmap bookkeeping are complete.

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-setup`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-005-design-concept.md
```

Re-read it before each phase if a prompt needs disambiguation. The design concept is the source of truth for scoping decisions captured during setup.

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep + Status Hygiene | `$speckit-autopilot` startup | Complete | 2026-05-02 dry-run/no-cleanup Archive Sweep recorded; SPEC-005 excluded; prerequisite scripts passed; status hygiene repaired merged SPEC-004/SPEC-006 tracking before Specify |
| Specify | `$speckit-specify` | Complete | 2026-05-02 generated `specs/005-ready-for-owner/spec.md` and requirements checklist; G1 passed with 0 markers |
| Clarify | `$speckit-clarify` | Complete | All 3 sessions complete; S1 transition guards/API, S2 GitHub terminal event/reconciliation, S3 operator surfaces/status vocabulary; marker scans clean |
| Plan | `$speckit-plan` | Complete | 2026-05-02 generated plan/research/data model/contracts/quickstart; G3 architecture concrete with no migration, no DB CHECK, no terminal-event table, and no unresolved markers |
| Checklist | `$speckit-checklist` | Complete | All 4 domains complete with marker counter returning zero `[Gap]` markers |
| Tasks | `$speckit-tasks` | Complete | 2026-05-02 generated `specs/005-ready-for-owner/tasks.md`; 79 tasks with P4-AC1..P4-AC6, all `done` transition paths, and FR-019a/SC-006 accessibility coverage |
| Analyze | `$speckit-analyze` | Complete | 2026-05-02 remediated 3 findings: one HIGH roadmap flag-off/runtime-enum drift, one MEDIUM roadmap notification-module drift, and one LOW US1 independent-test wording gap; marker scans clean |
| Implement | `$speckit-implement` | Pending | Execute tasks with red-green-refactor; stop before downstream SPEC-007/008/009 behavior |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep + Status Hygiene | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-005` cleanup occurs; stale SPEC-006/SPEC-004/autopilot-state tracking is repaired in this branch only |
| G1 | After Specify | No `[NEEDS CLARIFICATION]` markers; user stories cover flag OFF, non-PR templates, PR-producing templates, merged PR, closed issue without merged PR, Kanban, labels, and notification behavior |
| G2 | After Clarify | Open questions from the Design Concept doc are resolved or explicitly deferred with consensus evidence |
| G3 | After Plan | Constitution gates pass; no DB migration; feature flag, transition guard, GitHub sync, notification, UI, and test seam architecture are concrete |
| G4 | After Checklist | All `[Gap]` markers are remediated without widening into SPEC-007, SPEC-008, SPEC-009, or SPEC-011 |
| G5 | After Tasks | Tasks cover every P4 acceptance criterion and every transition path that can reach `done` |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into artifacts/dispositions, governance, pilot seed behavior, or CrabTrap |
| G7 | After Implement | Focused tests, typecheck, lint, build/e2e or justified subset, guardrails, docs status, and branch push are complete |

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Feature-flag discipline | `FEATURE_TWO_STEP_TERMINAL` resolves through `resolveFlag(name, { workspaceId })`; no inline `process.env.FEATURE_TWO_STEP_TERMINAL` checks | Static grep plus focused flag tests |
| Application-level status vocabulary | `ready_for_owner` is application-level only; no DB-level CHECK or task table rebuild | Diff grep for migrations/CHECK; roadmap/PRD consistency |
| Terminal event integrity | PR-producing tasks cannot reach `done` without explicit merged linked PR evidence | Unit/integration tests over Aegis, API/bulk/detail, quality-review, and GitHub sync paths |
| Existing behavior preservation | Flag OFF preserves existing task completion, sync, notification, subscription, activity, and chain behavior | Focused regression tests plus route/dispatch tests |
| Cross-spec boundary | SPEC-005 does not implement artifact store, resource governance, pilot seed behavior, Product Line B onboarding, or CrabTrap | Analyze prompt and guardrail grep |
| Test fixture seam | `pullFromGitHub` may accept optional `{ webhookFixture }` only for deterministic tests; production calls pass no fixture | Unit tests and production callsite checks |

**Constitution Check:** Phase 0 baseline passed on 2026-05-02. Implementation-specific guardrails remain required in Plan/Analyze/Implement.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this workflow:

- Previous merged candidates: `SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`, `SPEC-004`, `SPEC-006`.
- Current target excluded: `SPEC-005` / `specs/005-ready-for-owner`.
- Cleanup remains dry-run-only unless `safeToApplyCleanup=true` is recorded on a clean safe base branch with recovery commands.

### Phase 0 Status Hygiene

Before Specify, repair stale status tracking in this branch only. The setup interview chose this as part of SPEC-005's workflow rather than a separate preflight branch.

Required Phase 0 hygiene actions:

1. Verify live Git evidence from this worktree:
   - `SPEC-004` merged via PR #22 at commit `20643d8`.
   - `SPEC-006` merged via PR #21 at commit `dbb6c75`.
   - Current branch is `005-ready-for-owner`, created from `main` at `dbb6c75`.
2. Update `docs/ai/rc-factory-technical-roadmap.md` in this branch so:
   - `SPEC-006` no longer says `Implemented (PR open)` or ready-for-review.
   - `SPEC-005` remains `In Progress` and points to this worktree/branch.
   - The current roadmap note reflects merged `SPEC-004` and merged `SPEC-006`.
3. Update `docs/ai/specs/autopilot-state.json` so it no longer describes partial `SPEC-006` work as the active workflow. It should point at `docs/ai/specs/SPEC-005-workflow.md`, Phase 0 startup/status-hygiene state, and the archive sweep target exclusion for `SPEC-005`.
4. Do not modify `main` directly. Commit the hygiene changes on `005-ready-for-owner`.

### Phase 0 Results

Complete on 2026-05-02 in branch `005-ready-for-owner`.

- Archive Sweep startup: dry-run/no-cleanup recorded; archive extension v1.1.0 installed; `specs/005-ready-for-owner` excluded; `safeToApplyCleanup=false`.
- Prerequisites: `check-prerequisites.sh` returned `all_pass=true`; branch `005-ready-for-owner`; isolated worktree; feature branch; `pnpm` package manager; missing MCP servers are non-blocking fallbacks.
- Project command baseline: `pnpm typecheck` passed; `pnpm lint` passed with 0 errors and 12 warnings; `pnpm test` passed with 163 files / 1323 tests after rerun with host GPG/socket access; `pnpm build` passed after rerun with network access for Google Fonts.
- Status hygiene: roadmap, PRD, SPEC-004 workflow, SPEC-006 workflow, and `autopilot-state.json` no longer describe SPEC-006 as an open PR or partial active workflow; SPEC-004 and SPEC-006 merge evidence is recorded.

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-005 |
| Name | ready_for_owner State and Two-Step Terminal Event |
| Branch | `005-ready-for-owner` |
| Dependencies | SPEC-002, SPEC-002A, SPEC-004 |
| Enables | SPEC-009 |
| Priority | P1 |
| Tool count / tool names | N/A; non-tool-surface spec; `tools: []` |
| Strict Scope | New helper scope is `src/lib/task-status.ts`. Notification work must stay on existing surfaces: `src/lib/db.ts`, `src/components/panels/notifications-panel.tsx`, and notification delivery routes. |
| Status Authority | Roadmap + this workflow + Design Concept doc |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Source PRD | `docs/rc-factory-v1-prd.md` |

### Scope Summary

Add feature-flagged `ready_for_owner` runtime behavior for PR-producing templates, including Kanban lane, GitHub status label, Aegis approval branching, PR-merge transition to `done`, reconciliation alert on linked issue closure without merged PR, and a distinct notification type.

### Setup Decisions From Design Concept

- Existing `ready_for_owner` rows remain readable and visible when the flag is OFF, but no new transitions enter that state while OFF.
- `ready_for_owner` is distinct from existing `awaiting_owner`.
- With the flag ON, a `produces_pr=true` task reaches `done` only through explicit merged linked PR evidence from `pullFromGitHub` or the test-only webhook fixture seam.
- Explicit task PR linkage fields are authoritative; do not infer PRs from issue timeline references.
- Closed issue without merged linked PR leaves the task in `ready_for_owner`, writes activity, and notifies assignee then creator fallback.
- Entering `ready_for_owner` pushes `mc:ready-for-owner` immediately and idempotently.
- Kanban lane order is `quality_review` -> `ready_for_owner` -> `done`; `awaiting_owner` stays near early/manual-blocked work.
- `advanceTaskChain` waits until verified PR merge transitions the task to `done`.
- `FEATURE_TWO_STEP_TERMINAL` resolves per workspace at every transition site.
- No database migration.
- Blocked completion attempts return side-effect-free `409 Conflict` with a stable reason such as `ready_for_owner_pr_merge_required`.

### Acceptance Criteria

- [P4-AC1] With flag OFF, Aegis approval transitions tasks to `done` as today; no new `ready_for_owner` transitions occur, but existing rows remain readable/visible.
- [P4-AC2] With flag ON and `template.produces_pr = false`, task transitions `quality_review -> done` as today.
- [P4-AC3] With flag ON and `template.produces_pr = true`, task transitions `quality_review -> ready_for_owner`.
- [P4-AC4] `produces_pr=true` task in `ready_for_owner` with explicit linked PR merged -> `pullFromGitHub` transitions to `done`.
- [P4-AC4a] `produces_pr=true` task in `ready_for_owner` with linked issue closed but no merged linked PR -> task remains `ready_for_owner`; reconciliation activity/notification is created.
- [P4-AC4b] `produces_pr=false` close/disposition task can complete without any PR.
- [P4-AC5] Kanban column renders between `quality_review` and `done`; operator sees tasks awaiting merge in a dedicated lane.
- [P4-AC6] `mc:ready-for-owner` label appears on linked GitHub issue when Mission Control task enters that state.

## Phase 1: Specify

**When to run:** After Phase 0 status hygiene is committed or explicitly recorded as complete. Output: `specs/005-ready-for-owner/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-005 ready_for_owner State and Two-Step Terminal Event

### Problem Statement
Mission Control currently has `workflow_templates.produces_pr` from SPEC-004, but approved PR-producing tasks can still collapse into ordinary terminal `done` semantics. Product Line A's pilot needs a two-step terminal gate: automated work reaches `ready_for_owner` after Aegis approval, then waits for the linked PR merge before task completion and downstream chain advancement.

### Users
- Operators who need a clear lane for tasks waiting on PR merge.
- PR-producing autonomous agents that must not trigger downstream work before merge.
- Downstream SPEC-009 pilot execution, which intentionally stops at `ready_for_owner` for the human merge gate.

### Required Behavior
- Add `ready_for_owner` to application-level task status vocabulary only; do not add a DB CHECK or migration.
- Preserve flag-off behavior: no new `ready_for_owner` transitions, while existing `ready_for_owner` rows remain readable and visible.
- With `FEATURE_TWO_STEP_TERMINAL` ON and `workflow_template.produces_pr=true`, Aegis approval moves tasks from `quality_review` to `ready_for_owner`, not `done`.
- With the flag ON and `produces_pr=false`, existing `quality_review -> done` behavior remains.
- Block every non-merge path from moving a PR-producing `ready_for_owner` task to `done`; return side-effect-free `409 Conflict` with stable reason `ready_for_owner_pr_merge_required`.
- Use explicit task PR linkage fields (`github_repo`, `github_pr_number`, branch/PR metadata) as the terminal-event link. Do not infer PRs from issue timelines.
- `pullFromGitHub` transitions `ready_for_owner -> done` only when explicit linked PR evidence is merged (`merged=true` or equivalent merged timestamp/commit data).
- Closed linked issue without merged linked PR leaves task in `ready_for_owner`, writes reconciliation activity, and notifies assignee or creator fallback.
- Entering `ready_for_owner` pushes `mc:ready-for-owner` status label idempotently.
- Add a distinct `task_ready_for_owner` notification type and render/deliver action-required wording.
- Render `ready_for_owner` Kanban lane between `quality_review` and `done`; keep existing `awaiting_owner` semantics unchanged.
- `advanceTaskChain` from SPEC-004 runs only when verified PR merge moves task to `done`, not when the task enters `ready_for_owner`.
- Add optional test-only `{ webhookFixture }` seam to `pullFromGitHub`; production calls pass no fixture.

### Constraints
- Resolve `FEATURE_TWO_STEP_TERMINAL` through `resolveFlag('FEATURE_TWO_STEP_TERMINAL', { workspaceId })` at every transition site.
- No database migration, no terminal-event table, no status CHECK.
- Do not implement SPEC-007 artifact/disposition behavior, SPEC-008 governance, SPEC-009 pilot seed behavior, SPEC-010 onboarding, or SPEC-011 CrabTrap.
- Design Concept source of truth: `docs/ai/specs/SPEC-005-design-concept.md`.

### Acceptance Criteria
Use P4-AC1 through P4-AC6 from this workflow and the technical roadmap.
```

### Specify Results

Complete on 2026-05-02. Generated SPEC-005 Specify artifacts with no unresolved clarification markers. G1 gate passed: `validate-gate.sh G1 specs/005-ready-for-owner` returned `pass=true`; `count-markers.sh all specs/005-ready-for-owner` returned 0 gaps, clarifications, CRITICAL, HIGH, MEDIUM, and LOW markers.

| Metric | Value |
|--------|-------|
| Functional Requirements | 25 |
| User Stories | 5 |
| Acceptance Scenarios | 19 |
| Success Criteria | 6 |
| Edge Cases | 10 |

### Files Generated

- [x] `specs/005-ready-for-owner/spec.md`
- [x] `specs/005-ready-for-owner/checklists/requirements.md`

## Phase 2: Clarify

**When to run:** After Specify if any generated artifact introduces ambiguity or leaves Design Concept open questions unresolved. Maximum five targeted questions per session.

### Clarify Prompts

#### Session 1: Transition Guards and API Contract

```bash
$speckit-clarify

Focus on SPEC-005 transition guards:
- Decide the helper/code boundary for preventing PR-producing `ready_for_owner -> done` without merged PR evidence across Aegis, quality-review, bulk task update, detail task update, and GitHub sync paths.
- Confirm the exact `409 Conflict` body shape and reason enum for blocked completion attempts, starting with `ready_for_owner_pr_merge_required`.
- Confirm how API validation treats reads vs new writes when `FEATURE_TWO_STEP_TERMINAL` is OFF.
- Confirm that ordinary failed-to-done or manual done updates cannot bypass the merge gate for PR-producing tasks.
- Confirm how `advanceTaskChain` is invoked only after verified PR merge transitions the task to `done`.
```

#### Session 2: GitHub Terminal Event and Reconciliation

```bash
$speckit-clarify

Focus on SPEC-005 GitHub terminal event behavior:
- Confirm explicit linked PR fields are authoritative (`github_repo`, `github_pr_number`, branch/PR metadata) and issue timeline inference is out of scope.
- Confirm merged evidence accepted from live GitHub responses and from the optional test-only `{ webhookFixture }` seam.
- Confirm closed issue without merged linked PR leaves the task in `ready_for_owner`.
- Confirm reconciliation activity data fields, notification recipient order (assignee, then creator), and idempotency behavior.
- Confirm production `pullFromGitHub` callsites pass no fixture.
```

#### Session 3: UI, Labels, Notifications, and Status Vocabulary

```bash
$speckit-clarify

Focus on SPEC-005 operator-facing surfaces:
- Confirm `ready_for_owner` and `awaiting_owner` remain distinct.
- Confirm Kanban lane order: `quality_review`, `ready_for_owner`, `done`; existing `awaiting_owner` position remains unchanged.
- Confirm `mc:ready-for-owner` label definition, color/description, provisioning, outbound application timing, and idempotency.
- Confirm distinct `task_ready_for_owner` notification type, copy, panel rendering, and delivery formatting.
- Confirm no DB migration and no new terminal-event table.
```

### Clarify Results

Complete on 2026-05-02. All three sessions completed; no unresolved markers remain.

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Transition Guards and API Contract | 5 | Shared transition guard boundary; static read vocabulary plus workspace-aware write guards; uniform 409 body; all non-merge `done` writes for PR-producing tasks blocked while flag ON; `advanceTaskChain` runs only after verified PR merge writes `done` with a GitHub PR merge trigger. |
| 2 | GitHub Terminal Event and Reconciliation | 5 | Explicit PR identity is `github_repo` + `github_pr_number`; merge evidence must match linked repo/PR and include `merged=true`, `merged_at`, or `merge_commit_sha` from live GitHub or test-only fixture; closed issue without merged PR leaves task in `ready_for_owner`; reconciliation writes `github_terminal_reconciliation_required` activity, sends `task_ready_for_owner` notification to assignee then creator, and dedupes unchanged task/issue/reason; production `pullFromGitHub` callsites pass no fixture/options. |
| 3 | UI, Labels, Notifications, and Status Vocabulary | 5 | `ready_for_owner` added to static status vocabulary surfaces with write guards enforcing flag behavior; Kanban lane key `ready_for_owner`, label `Ready for Owner`, teal styling, placed between `quality_review` and `done`; GitHub label `mc:ready-for-owner` color `14b8a6` description `Mission Control: ready for owner`; `task_ready_for_owner` panel/delivery rendering with normal and reconciliation titles; existing nullable `external_terminal_event='github_pr_merged'` used with no migration/table. |

### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| Clarify S1 Q2: exact 409 conflict body | 2 | `[spec, codebase]` | Accepted uniform body `{ "error": "transition_conflict", "reason": "ready_for_owner_pr_merge_required", "task_ids": [<id>] }`; single-task routes use one-item `task_ids`. | `codebase-analyst`, `spec-context-analyst`, `domain-researcher` |
| Clarify S1 Q4: non-merge done-write guard breadth | 1 | `[spec, codebase]` | Accepted broad guard: while flag ON, every non-GitHub-merge attempt to write `done` for a PR-producing task is blocked or routed to `ready_for_owner`; manual and failed-to-done paths cannot bypass. | `codebase-analyst`, `spec-context-analyst` |
| Clarify S2 Q4: reconciliation activity and notification idempotency | 1 | `[codebase, spec]` | Accepted `github_terminal_reconciliation_required` activity with task/github/reason data; notification reuses `task_ready_for_owner` with reconciliation wording and assignee-then-creator routing; no duplicate activity or notification for unchanged task/issue/reason. | `codebase-analyst`, `spec-context-analyst` |
| Clarify S3: operator surfaces and status vocabulary | 1 | n/a | No unresolved consensus items; accepted executor recommendations for static status vocabulary, Kanban lane label/style/order, GitHub label definition/provisioning/application, notification rendering/delivery copy, and no-migration `external_terminal_event='github_pr_merged'` contract. | `clarify-executor` |

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/005-ready-for-owner/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Framework: Next.js 16 App Router, React 19, TypeScript 5
- State: Zustand in `src/store/index.ts`
- Database: SQLite via `better-sqlite3`
- Feature flags: `resolveFlag(name, ctx)` from `src/lib/feature-flags.ts`
- Testing: Vitest, Playwright, ESLint, TypeScript, pnpm

## Required Inputs
- Roadmap Phase 4 and SPEC-005 section in `docs/ai/rc-factory-technical-roadmap.md`
- PRD sections E and F in `docs/rc-factory-v1-prd.md`
- Design Concept doc: `docs/ai/specs/SPEC-005-design-concept.md`
- SPEC-004 workflow and code for `produces_pr`, `external_terminal_event`, `advanceTaskChain`, and workflow-template fields

## Constraints
- No database migration.
- No DB CHECK for task status.
- No new terminal-event table.
- No issue timeline PR inference.
- No operator override path for force-completing PR-producing `ready_for_owner` tasks.
- No chain advancement at `ready_for_owner`; chain advancement waits for verified `done`.
- Preserve flag-off behavior and existing `awaiting_owner` behavior.

## Architecture Notes
- Use the existing notification surface (`db_helpers.createNotification`, `src/components/panels/notifications-panel.tsx`, and delivery route formatting) instead of adding `src/lib/notifications.ts`.
- Plan every transition site that can reach `done`: `runAegisReviews`, `/api/quality-review`, bulk `PUT /api/tasks`, detail `PUT /api/tasks/[id]`, and `pullFromGitHub`.
- Plan read/write validation separately: reads can return existing `ready_for_owner`; new writes are flag/transition-gated.
- Plan the optional `pullFromGitHub(..., { webhookFixture })` test seam so production callsites remain unchanged.
- Plan status vocabulary and operator surfaces across `messages/*.json`, task board lane/status styling, `github-label-map`, notification panel rendering, and notification delivery formatting.
- Plan `external_terminal_event='github_pr_merged'` using the existing nullable workflow-template text field; verify no DB migration, DB CHECK, enum constraint, or terminal-event table is introduced.
- Plan status-hygiene changes from Phase 0 separately from SPEC-005 runtime code.
```

### Plan Results

Complete on 2026-05-02. Generated the Plan phase artifacts from `specs/005-ready-for-owner/spec.md`, roadmap Phase 4/SPEC-005, PRD sections E/F, the Design Concept, and SPEC-004's current task-chain/GitHub/template surfaces. G3 gate passed: the plan keeps SPEC-005 application-level only, uses a new narrow `src/lib/task-status.ts` transition helper, keeps notifications on existing `db_helpers.createNotification`/panel/delivery surfaces, and records `pullFromGitHub(..., { webhookFixture })` as test-only with production callsites unchanged.

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, constitution checks, strict-scope decision, implementation seams, and post-design gate |
| `research.md` | Complete | Transition guard, read/write validation, GitHub evidence, notification, UI, and chain-timing decisions |
| `data-model.md` | Complete | Application-level state, existing fields, reconciliation activity, notification, label, and chain semantics; no DB migration |
| `contracts/` | Complete | API transition conflict contract, GitHub terminal-event fixture contract, and operator-surface contract |
| `quickstart.md` | Complete | Focused verification flow plus final project command map |

## Phase 4: Domain Checklists

**When to run:** After Plan. Run multiple domains and remediate every `[Gap]` before Tasks.

### Recommended Checklist Domains

#### State Machine and Feature Flags

```bash
$speckit-checklist State-machine and feature-flag safety for SPEC-005: flag OFF behavior, flag ON behavior, all `done` transition sites, blocked completion conflict shape, existing `ready_for_owner` row visibility, and `advanceTaskChain` timing.
```

#### GitHub Sync and Terminal Event Evidence

```bash
$speckit-checklist GitHub sync terminal-event correctness for SPEC-005: explicit PR linkage, merged evidence requirements, closed issue without merged PR reconciliation, webhook fixture seam, status label provisioning/application, and idempotency.
```

#### Notifications and Operator UX

```bash
$speckit-checklist Notifications and operator UX for SPEC-005: distinct `task_ready_for_owner` type, assignee/creator fallback, notification panel/delivery rendering, Kanban lane placement, accessibility, and copy clarity.
```

#### Regression Safety and Cross-Spec Boundaries

```bash
$speckit-checklist Regression safety for SPEC-005: no DB migration, no status CHECK, no timeline inference, no override policy, no SPEC-007/SPEC-008/SPEC-009/SPEC-011 behavior, and no drift from SPEC-004 chain semantics.
```

### Checklist Results

All four checklist domains complete.

| Domain | Items | Gaps | Remediation |
|--------|-------|------|-------------|
| State Machine and Feature Flags | 18 | 0 | No remediation required; checklist generated at `specs/005-ready-for-owner/checklists/state-machine-feature-flags.md` and marker counter returned zero `[Gap]` markers. |
| GitHub Sync and Terminal Event Evidence | 22 | 0 | No remediation required; checklist generated at `specs/005-ready-for-owner/checklists/github-sync-terminal-evidence.md` and marker counter returned zero `[Gap]` markers. |
| Notifications and Operator UX | 24 | 0 | Remediated 1 accessibility requirement gap by adding `FR-019a`, tightening `SC-006`, and updating plan Operator Surfaces; checklist generated at `specs/005-ready-for-owner/checklists/notifications-operator-ux.md` and marker counter returned zero `[Gap]` markers. |
| Regression Safety and Cross-Spec Boundaries | 24 | 0 | No remediation required; checklist generated at `specs/005-ready-for-owner/checklists/regression-safety-cross-spec-boundaries.md` and marker counter returned zero `[Gap]` markers. |

## Phase 5: Tasks

**When to run:** After all checklists pass. Output: `specs/005-ready-for-owner/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-005 using:
- `specs/005-ready-for-owner/spec.md`
- `specs/005-ready-for-owner/plan.md`
- `docs/ai/specs/SPEC-005-design-concept.md`
- roadmap P4 acceptance criteria

Task generation requirements:
- Include Phase 0 status-hygiene tasks if not already completed before Specify.
- Cover every P4 acceptance criterion.
- Use red-green-refactor for transition guards, GitHub merge handling, notification behavior, labels, and Kanban UI.
- Include tests for every live path that can transition a task to `done`: Aegis dispatch, quality-review API, bulk task update, detail task update, and GitHub sync.
- Include tests for flag OFF, flag ON with `produces_pr=false`, flag ON with `produces_pr=true`, missing PR linkage, merged PR, closed issue without merged PR, and blocked completion `409`.
- Include tests proving `advanceTaskChain` does not run at `ready_for_owner` and does run after verified PR merge moves the task to `done`.
- Include tests proving existing `ready_for_owner` rows remain visible with flag OFF but new writes are blocked.
- Include tests for `mc:ready-for-owner` label provisioning/application and `task_ready_for_owner` notification routing/rendering.
- Explicitly exclude DB migrations, issue timeline inference, operator override policy, SPEC-007 artifacts, SPEC-008 governance, SPEC-009 pilot seed behavior, SPEC-010 onboarding, and SPEC-011 CrabTrap.
```

### Tasks Results

Complete on 2026-05-02. Generated dependency-ordered, TDD-first tasks in `specs/005-ready-for-owner/tasks.md` from the SPEC-005 spec, plan, design concept, design artifacts, and roadmap P4 acceptance criteria. Phase 0 status hygiene was already recorded complete before Specify, so the task list includes verification rather than redoing status-hygiene edits. Optional git before/after task hooks were available but not executed because this phase was requested without commits or pushes.

| Metric | Value |
|--------|-------|
| Total Tasks | 79 |
| Test Tasks | 41 |
| Parallel Markers | 37 |
| Phases | 8 |
| User Story Tasks | US1: 9; US2: 10; US3: 16; US4: 10; US5: 11 |
| P4 Acceptance Criteria Coverage | 8/8: P4-AC1, P4-AC2, P4-AC3, P4-AC4, P4-AC4a, P4-AC4b, P4-AC5, P4-AC6 |
| Live `done` Transition Paths Covered | Aegis dispatch, quality-review API, bulk task update, detail task update, GitHub sync |
| Accessibility Coverage | Included for Ready for Owner lane and `task_ready_for_owner` notifications via FR-019a/SC-006 tasks |
| Checklist Format | Pass: all 79 task lines use `- [ ] T###` format with story labels on user-story tasks |

## Phase 6: Analyze

**When to run:** After Tasks. Cross-check spec, plan, tasks, and design concept.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-005 across:
- `docs/ai/specs/SPEC-005-design-concept.md`
- `docs/ai/specs/SPEC-005-workflow.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/rc-factory-v1-prd.md`
- `specs/005-ready-for-owner/spec.md`
- `specs/005-ready-for-owner/plan.md`
- `specs/005-ready-for-owner/tasks.md`

Focus on:
1. Drift from the Grill Me decisions, especially Q1-Q18.
2. Missing coverage for P4-AC1 through P4-AC6.
3. Any task or requirement that adds DB migration, DB status CHECK, issue timeline inference, operator override policy, or terminal-event tables.
4. Any task that advances chains at `ready_for_owner` instead of verified `done`.
5. Any path to `done` for `produces_pr=true` without explicit merged PR evidence.
6. Any transition site missed: Aegis, quality-review API, bulk update, detail update, GitHub sync.
7. Any missing notification recipient fallback, reconciliation activity, label provisioning/application, or Kanban lane coverage.
8. Any drift into SPEC-007 artifacts/dispositions, SPEC-008 governance, SPEC-009 pilot seed behavior, SPEC-010 onboarding, or SPEC-011 CrabTrap.
9. Any stale SPEC-004/SPEC-006/autopilot-state wording left unremediated after Phase 0 status hygiene.

G6 passes only with zero CRITICAL/HIGH findings after remediation.
```

### Analyze Results

Complete on 2026-05-02. Initial deterministic marker count returned `{"type":"findings","total":0,"critical":0,"high":0,"medium":0,"low":0}` because no severity markers were present in `spec.md`, `plan.md`, or `tasks.md`. Semantic analyze found three cross-artifact issues, all remediated directly. Final marker count returned `{"type":"findings","total":0,"critical":0,"high":0,"medium":0,"low":0}`.

| Finding | Severity | Issue | Resolution |
|---------|----------|-------|------------|
| A1 | HIGH | Roadmap P4-AC1 and rollback text still said flag OFF meant no `ready_for_owner` runtime enum and an empty column, conflicting with Q1/Q15 and SPEC-005 FR-001..FR-003 rollback visibility. | Updated `docs/ai/rc-factory-technical-roadmap.md` so flag OFF preserves existing `ready_for_owner` rows for reads/display while blocking new transitions. |
| A2 | MEDIUM | Roadmap strict-scope/files-touched text still proposed `src/lib/notifications.ts`, conflicting with the SPEC-005 plan/tasks decision to use `src/lib/task-status.ts` plus existing notification helpers and avoid a generic notification abstraction. | Updated `docs/ai/rc-factory-technical-roadmap.md` to make `src/lib/task-status.ts` the new strict-scope helper and point notification work at `src/lib/db.ts` plus existing notification callsites for `task_ready_for_owner`. |
| A3 | LOW | US1 independent-test prose omitted the new-write block check even though its acceptance scenarios and tasks covered it. | Updated `specs/005-ready-for-owner/spec.md` so the independent test includes rejection/normalization of new `ready_for_owner` transitions while the flag is OFF. |

**Unresolved for consensus:** None.

## Phase 7: Implement

**When to run:** After Analyze passes. Execute tasks in order.

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-005 from `specs/005-ready-for-owner/tasks.md`.

Use strict red-green-refactor:
- Write or update the focused failing test first.
- Make the smallest implementation change.
- Rerun the focused test.
- Expand to related verification only after the focused test passes.

Implementation constraints:
- Do not add a database migration.
- Do not add a DB CHECK.
- Do not infer PR linkage from issue timeline events.
- Do not add a force-complete operator override.
- Do not advance task chains when entering `ready_for_owner`.
- Do not implement SPEC-007, SPEC-008, SPEC-009, SPEC-010, or SPEC-011 behavior.
- Resolve `FEATURE_TWO_STEP_TERMINAL` through `resolveFlag('FEATURE_TWO_STEP_TERMINAL', { workspaceId })`.
- Keep production `pullFromGitHub` callsites fixture-free.
- Keep branch work inside `005-ready-for-owner`.

Expected implementation surfaces from roadmap and codebase scan:
- `src/lib/github-label-map.ts` for `TaskStatus`, `STATUS_LABEL_MAP`, `ALL_STATUS_LABEL_NAMES`, and label initialization.
- `src/lib/task-status.ts` or another planned helper for status normalization and transition guard logic.
- `src/lib/task-dispatch.ts` for `runAegisReviews` branching on `workflow_template.produces_pr`.
- `src/lib/github-sync-engine.ts` for linked PR merge handling, closed issue reconciliation, status label application, and optional test fixture seam.
- `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, and `src/app/api/quality-review/route.ts` for guarded transition paths.
- `src/components/panels/task-board-panel.tsx` for the Kanban lane and status union.
- `src/lib/db.ts`, `src/components/panels/notifications-panel.tsx`, and `src/app/api/notifications/deliver/route.ts` for `task_ready_for_owner` notification creation/rendering/delivery.
- Store/types/validation files that currently enumerate task statuses.
- Focused Vitest and Playwright tests for state transitions, GitHub sync, labels, notifications, and Kanban.
```

### Implementation Progress

In progress. Update after each implementation group.

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 0 - Status hygiene and startup | T001-T005 | Complete | Phase 0 status hygiene and Archive Sweep evidence verified; no SPEC-005 migration/CHECK/table scope found; `src/lib/task-status.ts` added to strict type/lint surfaces; pnpm lockfile confirmed |
| 1 - Status vocabulary and validation | T006-T014 | Complete | Shared status vocabulary, transition conflict body, terminal transition guard, validation exports, store/API status unions, and focused tests complete; 47 focused tests, focused ESLint, typecheck, and diff check passed |
| 2 - Transition guards | T015-T033 | Complete | Flag-off rollback behavior, flag-on Aegis/quality-review owner routing, missing-linkage evidence, outbound sync, and no chain advancement at `ready_for_owner` verified |
| 3 - GitHub terminal event | T034-T049 | Complete | Optional fixture seam, explicit merged PR evidence, side-effect-free blocked conflicts, reconciliation dedupe, and `github_pr_merged` chain advancement verified |
| 4 - Labels and Kanban | T050-T059 | In Progress | `mc:ready-for-owner`, lane order, existing row visibility, and accessibility |
| 5 - Owner notifications | T060-T070 | Pending | `task_ready_for_owner` routing, panel rendering, and delivery formatting |
| 6 - Verification and docs | Pending | Pending | Full G7 evidence and status sync |

---

## Post-Implementation Checklist

- [ ] Phase 0 status hygiene completed in branch.
- [ ] Archive Sweep evidence is recorded and excludes `SPEC-005`.
- [ ] All generated tasks are marked complete in `specs/005-ready-for-owner/tasks.md`.
- [ ] Acceptance evidence exists for P4-AC1 through P4-AC6.
- [ ] No database migration or DB-level status CHECK was added.
- [ ] Existing `ready_for_owner` rows remain readable/visible with flag OFF.
- [ ] New `ready_for_owner` writes/transitions are blocked with flag OFF.
- [ ] `produces_pr=false` tasks still complete directly to `done`.
- [ ] `produces_pr=true` tasks enter `ready_for_owner` after Aegis approval.
- [ ] Non-merge attempts to move PR-producing `ready_for_owner` tasks to `done` return side-effect-free `409 Conflict`.
- [ ] Explicit merged linked PR evidence moves `ready_for_owner -> done`.
- [ ] Closed issue without merged linked PR leaves task in `ready_for_owner` and creates reconciliation activity/notification.
- [ ] `advanceTaskChain` waits until verified `done`.
- [ ] `mc:ready-for-owner` is provisioned and applied idempotently.
- [ ] `task_ready_for_owner` notification is created, rendered, and delivered.
- [ ] Kanban lane order places `ready_for_owner` between `quality_review` and `done`.
- [ ] `awaiting_owner` behavior remains unchanged.
- [ ] Production `pullFromGitHub` callsites pass no webhook fixture.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Focused Vitest suites pass.
- [ ] Required Playwright/UI evidence passes or is explicitly justified.
- [ ] `docs/ai/rc-factory-technical-roadmap.md` records SPEC-005 implementation evidence after verification.
- [ ] `docs/rc-factory-v1-prd.md` reflects SPEC-005 completion after verification.
- [ ] Branch is pushed for review.

---

## File Map

Expected generated artifacts:

```text
specs/005-ready-for-owner/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- tasks.md
`-- contracts/
```

Setup artifacts:

```text
docs/ai/specs/SPEC-005-design-concept.md
docs/ai/specs/SPEC-005-workflow.md
```

---

## Ready for Autopilot

After setup commit and push, run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-005-workflow.md
```

Autopilot starts with Phase 0: Archive Sweep plus status-hygiene repair.
