# SpecKit Workflow: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

**Template Version**: 1.0.0
**Created**: 2026-05-23
**Purpose**: Prepare RC Factory Phase 11A1 by making GitHub issue sync automatic, observable, and operator-controllable through Mission Control scheduler/control-plane seams while preserving manual sync and execution boundaries.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-013A1-workflow.md` from the `013a1-github-sync-automation` worktree.
2. Keep all generated spec artifacts under `specs/013a1-github-sync-automation/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-setup`. The full Q&A log, Goals, Non-goals, setup code-review inputs, and deferred open questions live at:

```text
docs/ai/specs/SPEC-013A1-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `/speckit.clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | Branch `013a1-github-sync-automation`, isolated worktree, SpecKit CLI 0.8.13, required Codex subagents, reviewability preset, pnpm command map, and archive extension verified; no active `specs/` directory existed yet, so no prior spec cleanup was eligible |
| Specify | `$speckit-specify` | Complete | Generated `specs/013a1-github-sync-automation/spec.md` with 4 user stories, 24 FRs, 12 acceptance scenarios, 7 success criteria, and 0 clarification markers; G1 passed |
| Clarify | `$speckit-clarify` | Complete | Resolved lifecycle state, cursor/failure semantics, scheduler/lease/backoff defaults, GitHub Sync API/UI ownership with `operator` auth, and duplicate-safe owner/flag behavior; G2 passed with 0 clarification markers |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, quickstart, and GitHub Sync lifecycle API contract; selected additive M77 `077_github_sync_lifecycle`; G3 passed |
| Checklist | `$speckit-checklist` | Complete | Completed scheduler-runtime, data-integrity, api-contracts, state-management, error-handling, ux, and extra observability checklist coverage; remediated 23 total gaps; G4 passed with 0 remaining `[Gap]` markers |
| Tasks | `$speckit-tasks` | Complete | Generated 72 TDD-first tasks across 7 phases, 4 user stories, 26 parallel opportunities, focused verification commands, and a ratified reviewability transition exception; G5 passed |
| Analyze | `$speckit-analyze` | Pending | Verify design concept, spec, plan, checklists, and tasks agree on scope and contain no claim/dispatch/remediation/harness/sandbox/auto-merge drift |
| Implement | `$speckit-implement` | Pending | Execute generated tasks only after Analyze passes; verify with focused tests, typecheck/lint/build as appropriate, and final guardrails |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `013a1-github-sync-automation`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-013A1 `In Progress` on this branch only |
| G1 | After Specify | Requirements cover automatic GitHub issue polling, per Product Line/workspace control, scheduler-owned ticks, manual sync fallback, cursor failure safety, pagination bounds, owner filtering, backoff, leases, observability, and rollback |
| G2 | After Clarify | State schema/control fields, route/UI placement, lease and retry defaults, partial-run semantics, disabled behavior, and compatibility with manual `/api/github/sync` are resolved with no unresolved markers |
| G3 | After Plan | Architecture cites live code evidence, keeps implementation default-off and additive, preserves existing manual sync and owner semantics, and does not introduce claim authority or execution behavior |
| G4 | After Checklist | All `[Gap]` markers from required domains are addressed or intentionally out of scope |
| G5 | After Tasks | Tasks are reviewable, dependency-ordered, TDD-first, and scoped to GitHub sync lifecycle plus status/control surfaces |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; design concept, spec, plan, and tasks agree on cursor, pagination, lease, backoff, owner, manual-sync, and no-execution decisions |
| G7 | During Implement | Focused tests, typecheck, lint/build as needed, guardrails, workflow status, roadmap status, and UAT evidence pass before closeout |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Existing manual GitHub sync and owner-based ingestion keep working | Focused regression tests cover `/api/github/sync`, owner/non-owner polling, and duplicate ingestion prevention |
| IV. Test-First Development | Scheduler, cursor, pagination, lease, API, and UI behavior begin with failing tests | Tasks require RED tests before implementation for each behavior-changing slice |
| V. Feature-Flag Resolution Discipline | Automatic polling is default-off and opt-in per Product Line/workspace | Static and focused tests prove flag-off disables automatic polling without breaking manual sync |
| VII. Additive Migration Policy | Any new lifecycle state is additive, idempotent, rollback-documented, and schema-truth cited | Plan must identify migration slot and rollback SQL if schema changes are required |
| X. Observability and Auditability | Operators can inspect enabled/disabled state, running state, last run, last success cursor, last error, backoff, counters, skipped owners, and partial-run reasons | API/UI tests cover the status envelope and diagnostic fields |
| XIV. Real UI Journey Quality Gate | Operator control/status UI receives browser coverage if changed | Playwright or equivalent focused browser check proves enable/disable/status/manual fallback journey |
| XVI. Reviewability And Verification Debt Control | Implementation stays within GitHub sync lifecycle and splits if it grows beyond the planned surfaces | Analyze blocks task claim, dispatch, Issue Remediation, harness, sandbox, auto-merge, or automatic triage drift |

**Constitution Check:** Specify re-check passed through G1 with 0 clarification markers and no expansion beyond GitHub sync lifecycle/control scope. Re-check again after Plan, Analyze, and Implement. Any runtime/scheduler/schema/UI expansion beyond this workflow must be split or explicitly justified by a reviewability exception.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.11.1/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
```

Result:

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
    "UI",
    "harness/adapter",
    "or docs/process",
    "scheduler/runtime",
    "schema/migration",
    "seed/config"
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

Decision: setup may proceed under the roadmap transition exception, but downstream phases must keep actual implementation to SPEC-013A1 strict scope: GitHub sync poller lifecycle, scheduler/runtime integration, status/debug output, operator disable controls, interval/backoff safety, and tests.

### Reviewability Preset

The setup command verified the generic reviewability preset resolution:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

Each command resolved to `.specify/presets/speckit-pro-reviewability/templates/`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-013A1 |
| Name | GitHub Sync Automation and Poller Lifecycle |
| Branch | `013a1-github-sync-automation` |
| Dependencies | SPEC-009D, SPEC-012A, SPEC-013A |
| Enables | SPEC-013B |
| Priority | P1 |
| Scope source | Phase 11A1 - GitHub sync automation and poller lifecycle |
| Acceptance criteria source | Phase 11A1 Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Make GitHub issue sync automatic, observable, and operator-controllable by wiring or replacing the existing `github-sync-poller` lifecycle through the runtime scheduler/control-plane seams, with safe intervals, startup/shutdown behavior, last-run/error visibility, manual-sync fallback, and disable/rollback behavior.

### Strict Scope

Allowed:

- GitHub issue sync poller lifecycle and scheduler/runtime integration.
- Product Line/workspace scoped enablement, interval, backoff, disabled state, and status/debug output.
- Manual-sync fallback and clear overlap/conflict behavior.
- Cursor, pagination, lease, retry/backoff, and owner-filtering safety.
- Additive state, migrations, rollback SQL, fixtures, and tests if Plan proves they are needed.
- Operator UI/API updates needed to control and observe automatic polling.

Forbidden:

- Task claim authority.
- Task dispatch or launch behavior.
- Issue Remediation execution.
- Harness adapter or sandbox lifecycle behavior.
- Auto-merge or automatic triage behavior.
- Treating external cron as the canonical product lifecycle.

### Design Concept Decisions

- Q1: Mission Control owns the canonical sync lifecycle; external cron is legacy/operator residue only.
- Q2: Dedicated Product Line/workspace lifecycle control state owns enablement, interval, backoff, status, cursor, last-run, last-error, and disabled data; `github_syncs` remains run history.
- Q3: GitHub sync becomes a first-class bounded scheduler task, not a process-wide singleton.
- Q4: Automatic sync pulls and reconciles GitHub issues only.
- Q5: Failed syncs do not advance the last-success cursor.
- Q6: Pagination drains all available pages within explicit per-tick bounds and records partial-run state.
- Q7: Operators control automatic polling per Product Line/workspace.
- Q8: Manual sync remains available; overlap is serialized or rejected with clear conflict status.
- Q9: SPEC-006 owner semantics are preserved to prevent duplicate ingestion for shared repos.
- Q10: Observability includes lifecycle state, run timestamps, cursor, errors, counters, skipped owners, partial-run reason, and manual-sync conflicts.
- Q11: Backoff is bounded per Product Line/workspace and exposes next retry time/reason.
- Q12: Rollout is feature-flagged/default-off and opt-in per Product Line/workspace.
- Q13: Overlap control uses a database-backed lease with owner/run id, expiry, release, and stale recovery.
- Q14: Execution, claim, remediation, harness, sandbox, auto-merge, and triage stay out of scope.

### Success Criteria Summary

- [ ] One Product Line can enable automatic GitHub issue polling.
- [ ] Operators can observe enabled/disabled state, running state, last run, last success cursor, last error, backoff, skipped owners, counters, and partial-run reason.
- [ ] Operators can disable automatic polling without losing manual sync.
- [ ] Failed automatic sync attempts do not advance the last-success cursor.
- [ ] Pagination is bounded and records partial-run state when bounds stop a tick.
- [ ] Automatic and manual sync cannot overlap silently.
- [ ] Owner-based polling prevents duplicate ingestion when multiple projects share one repo.
- [ ] Automatic polling is default-off and rollback-safe.
- [ ] No task claim, task dispatch, Issue Remediation execution, harness, sandbox, auto-merge, or automatic triage behavior is introduced.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/013a1-github-sync-automation/spec.md`.

### Specify Prompt

```bash
/speckit.specify

## Feature: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

### Problem Statement
SPEC-009C1 intentionally left GitHub issue sync operator-triggered or fixture-driven. Before SPEC-013B introduces concurrent scheduler claim/reconciliation work, Mission Control needs explicit automatic GitHub issue polling that operators can enable, observe, disable, and recover without losing manual sync or creating duplicate ingestion for shared repos.

### Users
- Mission Control operators enabling GitHub issue ingestion for a Product Line/workspace.
- Human reviewers verifying GitHub sync failures, backoff, and duplicate-ingestion prevention.
- Future scheduler/control-plane specs that need GitHub-linked tasks to be current before claim decisions.

### Required Behavior
- Provide feature-flagged/default-off automatic GitHub issue polling per Product Line/workspace.
- Make automatic sync a first-class bounded scheduler task or equivalent scheduler-owned lifecycle, not an externally required cron and not a process-wide singleton.
- Preserve manual `/api/github/sync` behavior as an independent fallback.
- Serialize or clearly reject overlapping manual/automatic sync for the same Product Line/workspace/repo scope.
- Preserve SPEC-006 owner semantics for `(workspace_id, github_repo)` so only the repo sync owner polls when area routing ownership applies.
- Track lifecycle control state separately from run history: enablement, interval, backoff, running/lease status, last started, last completed, last success cursor, last error, disabled reason, next retry, counters, skipped owner/non-owner counts, and partial-run reason.
- Do not advance the last-success cursor when a sync attempt fails.
- Drain GitHub issue pages within explicit bounds for pages, issues, and tick duration; record partial-run state when bounds stop a tick.
- Use bounded per Product Line/workspace backoff and expose next retry time/reason.
- Use database-backed overlap control with owner/run id, expiry, release on completion, and stale lease recovery.
- Let rollback disable automatic polling without breaking manual sync.

### Out of Scope
- Task claim authority.
- Task dispatch or launch.
- Issue Remediation execution.
- Harness adapter or sandbox lifecycle behavior.
- Auto-merge.
- Automatic triage.
- External cron as the product contract.

### Success Criteria
- One Product Line can enable automatic polling, observe last run/error/disabled/backoff state, disable polling, and still run manual sync.
- Failed syncs keep the last successful cursor unchanged.
- Bounded pagination records partial-run state.
- Multiple projects sharing one repo do not duplicate issue ingestion.
- No execution behavior is introduced.
```

### Specify Results

| Metric | Value |
|--------|-------|
| User Stories | 4 |
| Functional Requirements | 49 after Checklist |
| Clarification Markers | 0 |
| Acceptance Scenarios | 12 |
| Success Criteria | 7 |

---

## Phase 2: Clarify

**When to run:** After specification draft, before planning. Resolve ambiguity without drifting into implementation.

### Clarify Prompt

```bash
/speckit.clarify

Resolve these SPEC-013A1 questions:

1. Lifecycle state: exact control-state fields, ownership scope, enabled/disabled semantics, and whether `github_syncs` remains run history only.
2. Cursor and failure semantics: last-success cursor, failed attempts, partial pagination state, manual retry behavior, and recovery after errors.
3. Scheduler and concurrency: scheduler task shape, lease scope, lease expiry, stale lease recovery, overlap conflict response, tick interval defaults, and bounded backoff.
4. API/UI/operator controls: exact routes, status envelope, Product Line/workspace scope, disable controls, manual-sync fallback, and diagnostics.
5. Compatibility and boundaries: SPEC-006 owner semantics, flag-off behavior, no duplicate ingestion, no task claim/dispatch/remediation/harness/sandbox/auto-merge/automatic-triage behavior.
```

### Clarification Log

| Question | Answer | Spec Updated |
|----------|--------|--------------|
| Lifecycle state | Use dedicated Product Line/workspace/repository lifecycle control state keyed by GitHub sync scope; `github_syncs` remains run history. Disabled scopes do not start future automatic ticks, while manual sync remains available. | Yes - FR-011, FR-012, FR-013, entities, assumptions |
| Cursor and failure semantics | Advance the last-success cursor only after a fully successful bounded run. Failures and partial runs write diagnostics/history without advancing the success cursor. Manual retry may bypass automatic backoff only after acquiring the same overlap control and preserving cursor rules. | Yes - FR-014 through FR-018, assumptions |
| Scheduler and concurrency | Target scheduler-owned task `github_issue_sync`: 60s scheduler wake, 5m default interval, 10 pages, 1000 issues, 45s max tick duration, lease TTL `max(120s, 2x maxDuration)` capped at 10m, stale takeover after expiry, and 60s to 30m bounded backoff honoring GitHub retry/reset signals. | Yes - FR-003, FR-004, FR-007, FR-018 through FR-020, assumptions |
| API/UI/operator controls | GitHub Sync owns lifecycle controls: enrich `GET /api/github/sync` with `github_sync_lifecycle.v1`, preserve `POST /api/github/sync` manual trigger, add `PATCH /api/github/sync/control`, render in GitHub Sync panel, and require `operator` role. | Yes - FR-025 through FR-030, assumptions |
| Owner semantics and flag-off behavior | Add `FEATURE_GITHUB_SYNC_AUTOMATION` default-off through `resolveFlag`. Flag off preserves manual/legacy behavior. Flag on groups candidates by `(workspace_id, github_repo)`, polls the single eligible project or single `is_repo_sync_owner=1`, and skips `ownership_unresolved` rather than duplicate per-project automatic polling. `FEATURE_AREA_LABEL_ROUTING` remains limited to area-label behavior. | Yes - FR-001, FR-009, FR-010, FR-024, FR-031 through FR-034, assumptions |

### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| Q4 API/UI/auth surface | 1 | security, codebase, spec | Unanimous high-confidence decision: GitHub Sync API/UI surface with `operator` role; admin-only remains for credentials, global policy, feature flag mutation, or role management. | codebase-analyst, spec-context-analyst, domain-researcher |
| Q5 owner semantics and flag-off behavior | 1 | codebase, spec | High-confidence agreement: add `FEATURE_GITHUB_SYNC_AUTOMATION` default-off; automatic polling groups by `(workspace_id, github_repo)`, selects one owner or skips `ownership_unresolved`, and does not require `FEATURE_AREA_LABEL_ROUTING` except for actual area-label behavior. | codebase-analyst, spec-context-analyst |
| CHK007 secret-safe diagnostics | 1 | security | High-confidence decision: remediation is sufficient after adding a positive diagnostic safe-field allowlist; implementation must sanitize before lifecycle/activity persistence and reject or drop non-allowlisted fields by default. | codebase-analyst, spec-context-analyst, domain-researcher |

---

## Phase 3: Plan

**When to run:** After clarifications are resolved. Focus on HOW while preserving scope.

### Plan Prompt

```bash
/speckit.plan

## Technical Context
- TypeScript 5.7 strict on Node >=22.
- Next.js 16 App Router and React 19.
- SQLite through `better-sqlite3` and existing migration helpers.
- Existing GitHub sync code, SPEC-006 owner semantics, SPEC-009C1 manual/fixture-driven sync, and SPEC-013A run-state context.
- Zustand and Tailwind CSS 3 only where existing UI patterns require them.
- Vitest, ESLint, Playwright, pnpm.
- No new runtime dependency unless Plan proves a narrower existing option cannot meet requirements.

## Architecture Direction
- Make automatic GitHub issue sync a scheduler-owned bounded task, not an external cron contract and not a process-wide singleton.
- Add dedicated Product Line/workspace scoped lifecycle control state if live schema evidence shows existing tables cannot safely represent it.
- Keep `github_syncs` as run history unless Plan proves an explicitly safe narrower split.
- Separate failed attempts from last-success cursor advancement.
- Implement bounded pagination for pages, issues, and tick duration with partial-run status.
- Preserve manual `/api/github/sync` as an independent fallback with clear overlap serialization/conflict.
- Preserve SPEC-006 owner filtering for shared repos.
- Use database-backed scoped leases with expiry and stale recovery.
- Keep automatic polling feature-flagged/default-off and opt-in per Product Line/workspace.
- Expose operator control and diagnostics through minimal API/UI changes.

## Required Evidence
- Cite current files for manual sync route, GitHub sync service, poller/scheduler seams, owner filtering, relevant UI surface, migrations, and feature flag helpers.
- If schema changes are needed, identify migration number, indexes, rollback SQL, and idempotence tests.
- If UI changes are needed, identify the existing surface and required browser coverage.
- If API routes change, define request/response contracts and auth behavior.

## Hard Boundaries
- No task claim authority.
- No task dispatch or launch.
- No Issue Remediation execution.
- No sandbox lifecycle.
- No harness adapter.
- No auto-merge.
- No automatic triage.
```

### Plan Results

| Artifact | Path | Status |
|----------|------|--------|
| plan.md | `specs/013a1-github-sync-automation/plan.md` | Complete |
| research.md | `specs/013a1-github-sync-automation/research.md` | Complete - 7 research decisions |
| data-model.md | `specs/013a1-github-sync-automation/data-model.md` | Complete - 6 lifecycle entities |
| contracts/ | `specs/013a1-github-sync-automation/contracts/` | Complete - `github-sync-lifecycle-api.md` |
| quickstart.md | `specs/013a1-github-sync-automation/quickstart.md` | Complete |

---

## Phase 4: Checklist

**When to run:** After `/speckit.plan` validates both spec and plan together. Run the selected checklist domains and resolve genuine gaps.

### Recommended Checklist Domains

| Domain | Why |
|--------|-----|
| scheduler-runtime | Automatic polling, startup/shutdown, bounded ticks, leases, and stale recovery are core risk |
| data-integrity | Cursor advancement, run history, control state, migrations, idempotence, and duplicate ingestion must be exact |
| api-contracts | Manual sync fallback, control routes, status envelope, and conflict responses need explicit contracts |
| state-management | Enablement, disabled state, backoff, running state, last-success cursor, partial runs, and error state are lifecycle-heavy |
| error-handling | GitHub failures, retries, backoff, partial pagination, stale leases, and rollback safety are required behavior |
| ux | Operators need clear enable/disable/status/manual fallback controls if UI changes |

### Checklist Prompts

```bash
/speckit.checklist scheduler-runtime

Focus on SPEC-013A1 requirements:
- Scheduler-owned bounded GitHub sync ticks
- Startup/shutdown and feature-flag/default-off behavior
- Database-backed lease, expiry, and stale recovery
- No task claim, dispatch, remediation, harness, sandbox, auto-merge, or triage behavior
```

```bash
/speckit.checklist data-integrity

Focus on SPEC-013A1 requirements:
- Failed sync attempts do not advance the last-success cursor
- Pagination bounds and partial-run state are durable and testable
- Owner filtering prevents duplicate ingestion for shared repos
- Any lifecycle schema is additive, idempotent, indexed, and rollback-documented
```

```bash
/speckit.checklist api-contracts

Focus on SPEC-013A1 requirements:
- Manual `/api/github/sync` behavior remains compatible
- Automatic control/status routes expose enablement, disabled reason, backoff, run timestamps, cursor, counters, errors, and conflict state
- Overlap conflict or serialization behavior is explicit and stable
```

```bash
/speckit.checklist state-management

Focus on SPEC-013A1 requirements:
- Lifecycle control state is separate from run history
- Enabled/disabled, running lease, cursor, partial-run, backoff, and skipped-owner state transitions are explicit
- `FEATURE_GITHUB_SYNC_AUTOMATION` flag-off behavior preserves manual sync
- State transitions remain auditable and rollback-safe
```

```bash
/speckit.checklist error-handling

Focus on SPEC-013A1 requirements:
- GitHub API errors, rate/transport failures, partial pages, stale leases, and disabled scopes are observable
- Retry/backoff is bounded and exposes next retry reason/time
- Manual retry remains possible without cursor corruption
```

```bash
/speckit.checklist ux

Focus on SPEC-013A1 requirements:
- GitHub Sync panel exposes enable/disable, interval, backoff reset, current running state, last run, last success cursor, last error, and skipped-owner diagnostics
- Manual sync fallback remains discoverable and clearly separated from automatic poller controls
- Conflict, disabled, partial, failed, and stale-recovered states are understandable to operators
- The UI does not suggest task claim, remediation execution, harness, sandbox, auto-merge, or triage behavior
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| scheduler-runtime | 18 | 1 closed | FR-003, FR-004, FR-007, FR-018 through FR-020, FR-035 |
| data-integrity | 24 | 0 | FR-011 through FR-018, FR-024, FR-031 through FR-034, M77 model |
| api-contracts | 26 | 4 closed | FR-025 through FR-030 plus deterministic 409/manual batch/disable/scope-filtering contract |
| state-management | 26 | 1 closed | FR-010, FR-011 through FR-020, ownership terminal states |
| error-handling | 23 | 3 closed | FR-014 through FR-018, FR-041 through FR-043 |
| ux | 20 | 9 closed | FR-044 through FR-049, SC-008 |
| observability (extra) | 18 | 5 closed | FR-036 through FR-040 |
| **Total** | 155 | 23 closed, 0 remaining | G4 passed |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all real gaps are resolved. Output: `specs/013a1-github-sync-automation/tasks.md`.

### Tasks Prompt

```bash
/speckit.tasks

## Task Structure
- Small, testable chunks with acceptance criteria tied to SPEC-013A1 requirements.
- Dependency order: fixtures/tests, state/schema if needed, sync service behavior, scheduler lifecycle, API, UI, docs/guardrails, final verification.
- Mark parallel-safe tasks with [P].
- Keep tasks organized by independently testable user story and operator journey, not only technical layer.

## Required TDD Coverage
- Failure does not advance last-success cursor.
- Bounded pagination and partial-run state.
- Lease acquisition/release/conflict/stale recovery.
- Manual sync fallback and overlap conflict/serialization.
- SPEC-006 owner filtering and shared-repo duplicate prevention.
- Feature-flag/default-off behavior and Product Line/workspace opt-in.
- Backoff cap and next retry visibility.
- Status/API/UI diagnostics.
- No task claim, dispatch, remediation, harness, sandbox, auto-merge, or automatic triage behavior.

## Verification Commands
- `pnpm test` for focused and affected unit tests.
- `pnpm typecheck`.
- `pnpm lint`.
- `pnpm build` if runtime/API/UI changes require it.
- Focused Playwright/browser check if the operator UI changes.
- Any SPEC-013A1 guard script generated by the plan/tasks.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 72 |
| Phases | 7 |
| Parallel Opportunities | 26 |
| User Stories Covered | 4 |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks to catch cross-artifact issues.

### Analyze Prompt

```bash
/speckit.analyze

Focus on:
1. Scope boundaries: block any claim authority, task dispatch, Issue Remediation execution, harness adapter, sandbox lifecycle, auto-merge, automatic triage, or external-cron-as-contract drift.
2. Cursor and pagination: verify failed runs never advance last-success cursor and bounded pagination/partial-run semantics have requirements, plan, and tasks.
3. Scheduler and lease safety: verify bounded ticks, backoff, leases, stale recovery, and overlap behavior are consistently specified.
4. Manual sync compatibility: verify `/api/github/sync` remains available and regression-tested.
5. Owner semantics: verify shared-repo duplicate prevention and SPEC-006 owner behavior are covered.
6. Reviewability: verify task slices remain reviewable and any schema/API/UI/runtime expansion is justified or split.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| | | | |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no unresolved CRITICAL/HIGH findings.

### Implement Prompt

```bash
/speckit.implement

## Approach: TDD-First

For each task:

1. RED: Write the focused failing test or fixture.
2. GREEN: Implement the minimum code needed for the requirement.
3. REFACTOR: Align with existing Mission Control patterns.
4. VERIFY: Run the focused test and any phase-required verification.

## Pre-Implementation Setup
- Verify branch is `013a1-github-sync-automation`.
- Verify package manager is pnpm from `pnpm-lock.yaml`.
- Rebuild native modules if the local Node version changed.
- Start from clean generated SpecKit artifacts and no unresolved Analyze blockers.

## Implementation Notes
- Prefer existing GitHub sync, scheduler, feature flag, migration, API, and UI patterns.
- Keep automatic polling default-off until operator opt-in.
- Preserve manual sync as a fallback in every rollout/rollback state.
- Keep all execution behavior out of scope.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Foundation | | | |
| 2 - Lifecycle and State | | | |
| 3 - Scheduler and Sync Semantics | | | |
| 4 - API/UI Operator Controls | | | |
| 5 - Verification and Guardrails | | | |

---

## Post-Implementation Checklist

- [ ] All generated tasks are complete in `specs/013a1-github-sync-automation/tasks.md`.
- [ ] Focused tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm build` passes when required by runtime/API/UI changes.
- [ ] Focused browser/UAT evidence exists if UI changes.
- [ ] Manual sync fallback verified.
- [ ] No duplicate ingestion verified for multiple projects sharing one repo.
- [ ] Automatic polling can be disabled without losing manual sync.
- [ ] Workflow and roadmap status are updated.

---

## Project Structure Reference

```text
src/app/api/github/      GitHub sync API routes
src/lib/                 GitHub sync, scheduler, database, migration, and feature flag helpers
src/components/          Operator UI panels and shared components
docs/ai/specs/           SpecKit workflow ledgers and setup design concepts
specs/                   Generated SpecKit artifacts
tests/                   Vitest and Playwright coverage
```
