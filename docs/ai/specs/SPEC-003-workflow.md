# SpecKit Workflow: SPEC-003 - Aegis Facility Singleton Refactor

**Template Version**: 1.0.0
**Created**: 2026-04-28
**Purpose**: Prepare and execute the RC Factory Phase 2 Aegis facility-singleton specification in Codex.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `003-global-aegis`.

Run the phases through `$speckit-autopilot` unless a human explicitly pauses the run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-003-workflow.md
```

Autopilot must begin with Archive Sweep discovery before Phase 1. The sweep handles previously merged specs only (`SPEC-001`, `SPEC-002`, and `SPEC-002A`), excludes `SPEC-003`, and must stay dry-run-only or stop unless the branch is clean and safe cleanup has been explicitly recorded.

Do not start downstream specs from this worktree. SPEC-003 stops after the feature-flagged global Aegis resolver, legacy workspace-scoped fallback, reference sweep, verification, and roadmap bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | Dry-run evidence recorded; `SPEC-003` excluded; cleanup not safe/applied |
| Specify | `$speckit-specify` | Complete | Generated `specs/003-global-aegis/spec.md`; G1 passed with zero markers |
| Clarify | `$speckit-clarify` | Complete | G2 passed; lookup precedence, audit activity, flag context, legacy fallback, scheduler, route, and reference-sweep boundaries resolved |
| Plan | `$speckit-plan` | Complete | G3 passed; generated plan, research, data model, quickstart, and resolver contract |
| Checklist | `$speckit-checklist` | Complete | G4 passed; all four domains generated with zero remaining gaps |
| Tasks | `$speckit-tasks` | Complete | G5 passed; generated 21 dependency-ordered tasks |
| Analyze | `$speckit-analyze` | Complete | G6 passed after remediating 1 critical and 3 medium findings |
| Implement | `$speckit-implement` | Complete | G7 passed; 21 tasks complete with focused tests, typecheck, lint, build, e2e, and guardrails recorded |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-003` cleanup occurs |
| G1 | After Specify | Requirements define global Aegis resolution, legacy fallback, feature flag behavior, audit activity, and no unresolved `[NEEDS CLARIFICATION]` markers |
| G2 | After Clarify | Lookup precedence, flag bootstrap, audit row behavior, and `quality_reviews.reviewer='aegis'` contract are explicit |
| G3 | After Plan | Constitution gates pass; `src/lib/aegis.ts` strict scope, affected references, and regression tests are concrete |
| G4 | After Checklist | All resolver, scheduler, route, and regression-safety gaps are resolved |
| G5 | After Tasks | P2-AC1 through P2-AC6 have task coverage and tasks are dependency-ordered |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-004+ behavior |
| G7 | After Implement | Flag-off, flag-on, legacy-fallback, scheduler-loop, and Aegis gate tests pass; docs status is updated |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md`, `docs/rc-factory-v1-prd.md`, and `docs/ai/rc-factory-technical-roadmap.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Feature-flag default OFF | `FEATURE_GLOBAL_AEGIS=false` preserves current workspace-first Aegis behavior | Focused resolver and scheduler tests with flag OFF |
| Shared flag resolver | Runtime flag checks route through `resolveFlag(name, ctx)` in `src/lib/feature-flags.ts`; no inline `process.env.FEATURE_GLOBAL_AEGIS` reads | Grep runtime code for inline feature flag reads outside `src/lib/feature-flags.ts` |
| Schema truthfulness | Use live `agents.scope`, `agents.workspace_id`, `quality_reviews.reviewer`, and no imagined `quality_reviews.agent_id` | Schema/test inspection and route/scheduler tests |
| TDD | Add failing resolver, route, and scheduler tests before production changes | Task evidence records RED/GREEN commands |
| Strict scope ramp | New production module is limited to `src/lib/aegis.ts`; existing files touched only for Phase 2 reference migration | Plan/tasks list every touched file and justify edits |
| Package manager | Use pnpm for repo verification | Lockfile is `pnpm-lock.yaml`; use pnpm commands only |

**Constitution Check:** Pending. Verify at Phase 1 start.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this workflow:

- Previous merged candidates: `SPEC-001`, `SPEC-002`, `SPEC-002A`.
- Current target excluded: `SPEC-003`.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records `safeToApplyCleanup=true`, archive success, merge/tree references, and recovery commands.
- No source spec folder is deleted silently by setup or by this workflow.

#### Startup Dry-Run Evidence

Recorded: 2026-04-28T19:27:45Z.

Archive Sweep ran as:

```bash
$speckit.archive.run --sweep --current-target specs/003-global-aegis --dry-run
```

| Spec Folder | Classification | Cleanup |
|-------------|----------------|---------|
| `specs/001-foundation-migrations` | `eligibleForArchive=true` | `eligibleForCleanup=false` |
| `specs/002-product-line-switcher` | `eligibleForArchive=true` | `eligibleForCleanup=false` |
| `specs/002a-spec-archive-evidence` | `eligibleForArchive=true` | `eligibleForCleanup=false` |
| `specs/003-global-aegis` | `excludedCurrentSpec=true` | Not applicable |

`safeToApplyCleanup=false` because the run was dry-run only, `--apply-cleanup` was not supplied, and the worktree was not clean. No files were deleted, moved, or rewritten.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-003 |
| Name | Aegis Facility Singleton Refactor |
| Branch | `003-global-aegis` |
| Dependencies | SPEC-001, SPEC-002, SPEC-002A |
| Enables | SPEC-004, SPEC-009 |
| Priority | P1 |
| Tool count / tool names | N/A; this is not a tool-surface spec |
| Tool metadata | `tools: []` |
| Strict Scope | New production module: `src/lib/aegis.ts`; existing references may be updated only for Phase 2 Aegis resolution behavior |
| Status Authority | Roadmap + this workflow are execution-status authority |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement RC Factory Phase 2:

- Replace workspace-keyed Aegis lookup with a feature-flagged `getAegis(db, workspace_id?)` helper.
- Preserve legacy workspace-scoped Aegis fallback so existing installs do not lose review capability.
- With `FEATURE_GLOBAL_AEGIS=false`, preserve current workspace-first behavior.
- With `FEATURE_GLOBAL_AEGIS=true`, prefer the `agents.scope='global'` row where `LOWER(name)='aegis'`.
- If global and workspace-scoped Aegis rows both exist with the flag ON, the global row wins and an `activities` row documents that the workspace row was shadowed.
- Refactor `resolveGatewayAgentIdForReviewAgent` and `runAegisReviews` in `src/lib/task-dispatch.ts` to use the shared resolver rather than the local `aegisAgentByWorkspace` map.
- Sweep known Aegis references without changing review semantics.
- Preserve Aegis completion gates based on `quality_reviews.reviewer='aegis'`; do not require or invent `quality_reviews.agent_id`.

### Known Reference Surface

- `src/lib/task-dispatch.ts` - `resolveGatewayAgentIdForReviewAgent`, `runAegisReviews`, `aegisAgentByWorkspace`
- `src/lib/scheduler.ts` - `aegis_review` cron task invokes `runAegisReviews`
- `src/app/api/tasks/route.ts` - `hasAegisApproval` DB gate
- `src/app/api/tasks/[id]/route.ts` - task detail Aegis approval gate
- `src/lib/validation.ts` - quality review reviewer defaults
- `src/components/panels/task-board-panel.tsx` - Aegis review UI hooks
- `src/components/chat/*` - Aegis chat surfaces and visual role treatment

### Success Criteria Summary

- [x] P2-AC1: With flag OFF, Aegis resolution matches pre-refactor behavior for every workspace.
- [x] P2-AC2: With flag ON, Aegis resolves to the single `scope='global'` record even when a workspace has no local Aegis.
- [x] P2-AC3: If a workspace has a legacy local Aegis record, `getAegis(ws)` returns the local one when compatibility mode requires it.
- [x] P2-AC4: `runAegisReviews` scheduler loop runs identically. No new failure modes.
- [x] P2-AC5: Test suite covers global-only, workspace-only, and workspace-with-legacy scenarios.
- [x] P2-AC6: Aegis completion gates use live `quality_reviews.reviewer='aegis'`; tests must not expect `quality_reviews.agent_id` by default.

---

## Phase 1: Specify

**When to run:** Start here. Output: `specs/003-global-aegis/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-003 Aegis Facility Singleton Refactor

Create a specification for RC Factory Phase 2 in Paddock.

### Problem Statement

Paddock currently resolves Aegis through workspace-keyed lookup paths even though SPEC-001 backfilled Aegis as a facility-wide global agent (`agents.scope='global'`) and later pipeline specs require Aegis to serve every Product Line consistently. The current `runAegisReviews` path declares `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` and looks up `LOWER(name)='aegis' AND workspace_id=?`, which prevents global-only Aegis rows from serving product-line review flows.

### Users

- Facility operator: needs one global Aegis reviewer that can serve all Product Lines.
- Existing workspace-scoped install: needs compatibility when only local Aegis rows exist or when the new flag is OFF.
- Downstream spec executor: needs global Aegis behavior before task pipelines and Product Line A pilot work.

### User Stories

- US1: As an existing operator, I can keep `FEATURE_GLOBAL_AEGIS` OFF and Aegis review behavior remains workspace-first.
- US2: As a facility operator, I can enable `FEATURE_GLOBAL_AEGIS` and have a single global Aegis row serve workspaces with no local Aegis.
- US3: As a maintainer, I can preserve legacy local Aegis fallback for compatibility during migration.
- US4: As an auditor, I can see an activity when a local Aegis row is shadowed by the global row under flag ON.
- US5: As a downstream spec executor, I can rely on Aegis completion gates using `quality_reviews.reviewer='aegis'`.

### Functional Requirements

- Add `src/lib/aegis.ts` exporting `getAegis(db, workspace_id?)`.
- Route `FEATURE_GLOBAL_AEGIS` through `resolveFlag(name, ctx)`; do not add inline `process.env.FEATURE_GLOBAL_AEGIS` reads.
- With flag OFF, resolve workspace-scoped Aegis first, then global fallback.
- With flag ON, resolve global Aegis first, then workspace-scoped fallback.
- Match Aegis by `LOWER(name)='aegis'` and use `agents.scope='global'` for the facility singleton.
- Preserve legacy `agents.workspace_id` lookup for workspace-scoped rows.
- When flag ON and both global and workspace-scoped rows exist, return global and write an `activities` row documenting the shadowed local row.
- Refactor `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` integration so scheduler review dispatch uses `getAegis`.
- Remove or stop relying on the local `aegisAgentByWorkspace` map once all callsites are migrated.
- Sweep Aegis approval routes and UI references without changing review semantics.
- Preserve `quality_reviews.reviewer='aegis'` as the live gate signal; do not introduce `quality_reviews.agent_id` expectations.

### Constraints

- Preserve current behavior with the flag OFF.
- New production module strict scope is `src/lib/aegis.ts`.
- Touch existing files only for Phase 2 Aegis resolver integration and tests.
- Do not implement SPEC-004 task pipeline behavior, SPEC-005 `ready_for_owner`, SPEC-006 area labels, SPEC-007 artifacts/dispositions, SPEC-008 governance, SPEC-009 pilot behavior, or SPEC-011 CrabTrap.
- Do not add schema migrations; SPEC-001 already created `agents.scope`.
- Use pnpm for verification.

### Out of Scope

- Task-chain successor creation, `produces_pr`, or routing behavior.
- `ready_for_owner` task state and PR merge transition.
- Area-label routing and repo-level sync dedupe.
- Artifact store, disposition logging, resource governance, and pilot seeding.
- Changing quality review schema to store reviewer agent ids.
- Product-line skill/session/transcript ownership or multi-facility tenant modeling.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 10 |
| User Stories | 3 |
| Acceptance Criteria | 6 P2 criteria from roadmap |
| G1 Validation | Passed 2026-04-28T19:31:34Z; `spec.md` exists with zero markers |

### Files Generated

- [x] `specs/003-global-aegis/spec.md`
- [x] `specs/003-global-aegis/checklists/requirements.md`

### Traceability Markers

| Marker | Purpose |
|--------|---------|
| US1 | Flag-off workspace-first compatibility |
| US2 | Flag-on global Aegis resolution |
| US3 | Legacy workspace-scoped fallback |
| US4 | Shadowed local-row activity |
| US5 | `quality_reviews.reviewer='aegis'` gate preservation |
| P2-AC1..P2-AC6 | Roadmap acceptance criteria |
| FR-FLAG | Feature-flag resolution requirements |
| FR-RESOLVER | `getAegis` lookup precedence and row shape |
| FR-SCHEDULER | `runAegisReviews` behavior preservation |
| FR-GATE | Quality review gate contract |

---

## Phase 2: Clarify

**When to run:** After Specify if generated artifacts introduce ambiguity or drift. The decisions below are already strongly implied by the roadmap; Clarify should encode them, not reopen them without evidence.

### Clarify Prompts

#### Session 1: Resolver Precedence and Flag Context

```bash
$speckit-clarify

Focus on SPEC-003 Aegis resolver precedence:
- With `FEATURE_GLOBAL_AEGIS=false`, workspace-scoped Aegis wins, then global fallback.
- With `FEATURE_GLOBAL_AEGIS=true`, global Aegis wins, then workspace-scoped fallback.
- `FEATURE_GLOBAL_AEGIS` must resolve through `resolveFlag(name, ctx)`.
- Determine the correct resolver context: use the requested task/review workspace when one exists; never use process env `1` to force ON.
- If both global and workspace rows exist with flag ON, global wins and a shadow activity is recorded.
- If no Aegis row exists, preserve current fallback behavior to the gateway agent id/name `aegis` and do not crash scheduler loops.
```

#### Session 2: Scheduler and Review Gate Compatibility

```bash
$speckit-clarify

Focus on scheduler and quality review compatibility:
- `runAegisReviews` must run with the same task selection, retry, and transition semantics as today.
- `resolveGatewayAgentIdForReviewAgent` must continue reading `agent.config.openclawId` / session key behavior without broad gateway rewrites.
- Aegis approval gates in task routes must continue using `quality_reviews.reviewer='aegis'`.
- No test or code should require `quality_reviews.agent_id` unless a separate migration intentionally adds it, which SPEC-003 does not.
- Existing UI surfaces may display Aegis review state but should not gain new pipeline or ready-for-owner semantics.
```

#### Session 3: Audit Activity and Reference Sweep

```bash
$speckit-clarify

Focus on audit and reference-sweep boundaries:
- Define the exact `activities` row shape for a shadowed local Aegis row under flag ON.
- Ensure the shadow activity is idempotent enough not to spam on every scheduler tick for the same workspace/global/local pair.
- Confirm the reference sweep includes task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces.
- Confirm downstream specs remain out of scope: task pipelines, `ready_for_owner`, area labels, artifact publishing, governance, pilot seed data, and CrabTrap.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Resolver precedence and flag context | 5 | Workspace flag context, gateway fallback, shadow activity shape, duplicate tie-breaker, and status-filter behavior resolved |
| 2 | Scheduler and review gate compatibility | 5 | Resolver source-only scheduler change, gateway routing, reviewer gate, no `quality_reviews.agent_id`, and UI display-only behavior resolved |
| 3 | Audit activity and reference sweep | 4 | Shadow activity row shape, idempotency, reference-sweep surfaces, and downstream out-of-scope boundaries resolved |

**G2 Validation:** Passed 2026-04-28T20:12:06Z with zero `[NEEDS CLARIFICATION]` markers.

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Output: `specs/003-global-aegis/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Framework: Next.js 16 App Router, React 19, TypeScript 5
- State: Zustand in `src/store/index.ts`; no new client state expected for SPEC-003
- Database: SQLite via `better-sqlite3`; SPEC-001 added `agents.scope`
- Feature flags: `src/lib/feature-flags.ts` from SPEC-002
- Scheduler: `src/lib/scheduler.ts` invokes `runAegisReviews` from `src/lib/task-dispatch.ts`
- Tests: Vitest, route tests, TypeScript typecheck, ESLint
- Package manager: pnpm

## Constraints

- Strict Scope: new production module is `src/lib/aegis.ts`.
- Existing-file edits are limited to `src/lib/task-dispatch.ts`, `src/lib/scheduler.ts` if necessary, task API routes, `src/lib/validation.ts`, task-board/chat Aegis references if tests prove they must change, and strict-scope config if required.
- Preserve flag-off behavior and existing scheduler review semantics.
- Add no schema migration.
- Preserve `quality_reviews.reviewer='aegis'`; do not introduce `quality_reviews.agent_id`.
- Route flag checks through `resolveFlag()` and preserve `FEATURE_*=1` non-enablement rules.
- Do not implement SPEC-004+ downstream behavior.

## Architecture Notes

- `getAegis(db, workspace_id?)` should return enough fields for `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent`: id, name, config, workspace_id, scope, and any fields currently expected by `ReviewAgentRecord`.
- The helper owns lookup precedence and should be unit-tested directly.
- The scheduler path should avoid per-task repeated DB lookups where practical, but correctness and flag semantics come before caching.
- Shadowed local-row audit activity should be written only when flag ON and a global row wins over a local row.
- The reference sweep must verify every direct Aegis lookup or assumption found by `rg`.

## Verification Strategy

- Add Vitest tests for `getAegis`: flag OFF workspace-first, flag OFF global fallback, flag ON global-first, flag ON workspace fallback, global + local shadow activity, malformed/missing config behavior, and no-row fallback.
- Add `runAegisReviews` tests or focused integration tests proving task selection, review dispatch, retry, and status transitions are unchanged except resolver source.
- Add route tests proving task Aegis gates still use `quality_reviews.reviewer='aegis'`.
- Add regression checks for `resolveGatewayAgentIdForReviewAgent` config parsing.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and focused filters for Aegis resolver/task-dispatch/task routes.
- Grep checks:
  - no inline runtime `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`
  - no remaining production workspace-keyed Aegis lookup that bypasses `getAegis`
  - no `quality_reviews.agent_id` expectation introduced
  - no downstream `ready_for_owner`, `FEATURE_TASK_PIPELINES`, area label, artifact, governance, pilot, or CrabTrap implementation drift
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | G3 passed 2026-04-28T20:15:03Z with zero unresolved markers |
| `research.md` | Complete | Generated |
| `data-model.md` | Complete | Generated |
| `contracts/` | Complete | `contracts/aegis-resolver.md` generated |
| `quickstart.md` | Complete | Generated |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run the checklists below and resolve all genuine gaps before Tasks.

### 1. Feature Flag Checklist

```bash
$speckit-checklist feature-flags

Focus on SPEC-003:
- `FEATURE_GLOBAL_AEGIS` defaults OFF and preserves workspace-first behavior.
- Flag ON is controlled by `workspaces.feature_flags` via `resolveFlag()`, not by env `1`.
- Env `0` remains a kill switch.
- Resolver tests cover flag OFF, flag ON, no workspace context, malformed flag JSON, and dependency on `FEATURE_WORKSPACE_SWITCHER` if enforced by the existing registry.
- No inline runtime flag reads are introduced outside `src/lib/feature-flags.ts`.
```

### 2. Data Integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-003:
- `agents.scope='global'` and `LOWER(name)='aegis'` are the global singleton source.
- Legacy workspace-scoped rows use existing `agents.workspace_id`.
- The resolver returns the row shape needed by `task-dispatch.ts`.
- Shadowed local-row activity records enough evidence without spamming repeated scheduler runs.
- No schema migration or `quality_reviews.agent_id` assumption is introduced.
```

### 3. Scheduler Safety Checklist

```bash
$speckit-checklist scheduler-safety

Focus on SPEC-003:
- `runAegisReviews` task selection, retry behavior, gateway dispatch, quality review insert/update behavior, and status transitions remain unchanged.
- Missing Aegis rows preserve current fallback behavior and do not crash the scheduler.
- `resolveGatewayAgentIdForReviewAgent` still honors `openclawId` or equivalent config.
- Tests cover global-only, workspace-only, global-plus-local, and no-row fallback cases.
- Scheduler loop behavior does not implement SPEC-004 pipeline advancement or SPEC-005 ready-for-owner branching.
```

### 4. Regression Safety Checklist

```bash
$speckit-checklist regression-safety

Focus on SPEC-003:
- Flag OFF preserves existing route, scheduler, and UI behavior.
- Task API Aegis gates still use `quality_reviews.reviewer='aegis'`.
- Existing UI Aegis indicators are not broadened into new downstream workflow states.
- Grep checks catch direct Aegis lookup bypasses after `getAegis` lands.
- Grep checks catch downstream drift into task pipelines, `ready_for_owner`, area labels, artifacts, governance, pilot behavior, product-line skill/session ownership, multi-facility modeling, or CrabTrap.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| feature-flags | 22 | 2 found and remediated; zero markers after rerun | P2-AC1, P2-AC2, P2-AC3 |
| data-integrity | 22 | 1 found and remediated; zero markers after rerun | P2-AC2, P2-AC3, P2-AC6 |
| scheduler-safety | 35 | 0 gaps; zero markers after generation | P2-AC4, P2-AC5 |
| regression-safety | 26 | 4 found and remediated; zero markers after rerun | P2-AC1, P2-AC6 |

**G4 Validation:** Passed 2026-04-28T20:55:11Z with zero `[Gap]` markers.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/003-global-aegis/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P2-AC1 through P2-AC6.
- Use TDD where feasible: write focused Vitest/route/scheduler tests before implementation.
- Order tasks by dependency:
  1. Archive Sweep evidence and baseline Aegis reference discovery.
  2. Feature flag and existing registry verification for `FEATURE_GLOBAL_AEGIS`.
  3. `src/lib/aegis.ts` tests and resolver implementation.
  4. Shadowed local-row audit activity behavior.
  5. `task-dispatch.ts` integration for `resolveGatewayAgentIdForReviewAgent` and `runAegisReviews`.
  6. Task route and validation reference updates that preserve `quality_reviews.reviewer='aegis'`.
  7. UI/chat reference checks only if tests prove direct resolver assumptions need adjustment.
  8. Grep guardrails, docs status, and final verification.
- Mark parallel-safe tasks with [P] only when they do not touch the same file or resolver contract.

## Required Task Coverage

- P2-AC1 has explicit flag-OFF workspace-first regression coverage.
- P2-AC2 has global-only flag-ON coverage.
- P2-AC3 has workspace-only and global-plus-local fallback/precedence coverage.
- P2-AC4 has scheduler-loop behavior preservation coverage.
- P2-AC5 covers global-only, workspace-only, and workspace-with-legacy scenarios.
- P2-AC6 has route/gate coverage proving `quality_reviews.reviewer='aegis'` remains the contract.
- Generated tasks include a route/reference discovery task that records the exact live Aegis references before implementation.
- Generated tasks include prohibited-drift grep checks for inline flag reads, direct Aegis lookup bypasses, `quality_reviews.agent_id`, and downstream feature leakage.

## File Layout Constraints

- Primary new file: `src/lib/aegis.ts`.
- Expected source edits: `src/lib/task-dispatch.ts`, possibly task routes and validation references if tests require them.
- Expected test files: focused tests under `src/lib/__tests__/` and route/scheduler tests following current repo patterns.
- Spec artifacts: `specs/003-global-aegis/`.
- Avoid unrelated cleanup and do not touch implementation surfaces outside SPEC-003 unless a failing test proves it is required.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 21 |
| Phases | 7 |
| Parallel Opportunities | 6 |
| User Stories Covered | 3 |

**G5 Validation:** Passed 2026-04-28T20:59:36Z with 21 tasks and zero markers.

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: feature-flag default OFF, TDD, strict-scope ramp, no unauthorized schema assumptions, and no unplanned runtime coupling.
2. Acceptance coverage: P2-AC1 through P2-AC6 each have implementation or verification tasks.
3. Resolver consistency: `getAegis` lookup precedence matches flag OFF and flag ON contracts, including global-only, workspace-only, global-plus-local, and no-row fallback.
4. Audit consistency: shadowed local-row activity behavior is defined, tested, and not spammy.
5. Scheduler consistency: `runAegisReviews` keeps task selection, retry, dispatch, and transition semantics unchanged.
6. Gate consistency: Aegis completion checks use `quality_reviews.reviewer='aegis'`; no `quality_reviews.agent_id` expectation appears.
7. Reference-sweep discipline: known Aegis references are discovered and either routed through the helper or explicitly documented as display-only / unaffected.
8. Dependency discipline: generated tasks must not implement SPEC-004 task pipelines, SPEC-005 ready_for_owner, SPEC-006 area labels, SPEC-007 artifacts/dispositions, SPEC-008 governance, SPEC-009 pilot behavior, or SPEC-011 CrabTrap.
9. File-path truthfulness: tasks use live paths from this worktree, especially `src/lib/task-dispatch.ts`, `src/lib/scheduler.ts`, task routes, `src/lib/validation.ts`, task-board, and chat surfaces.
10. Archive discipline: Archive Sweep setup honors SPEC-002A policy and does not archive or clean up the current target spec.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation, violates constitution, leaks data, or widens scope into later specs | Must fix before G6 |
| HIGH | Significant gap in acceptance coverage, resolver semantics, scheduler safety, or review gate compatibility | Should fix before implementation |
| MEDIUM | Ambiguity or maintainability risk | Review and decide |
| LOW | Minor wording or traceability issue | Note for cleanup |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A001 | CRITICAL | Strict-scope ramp named `src/lib/aegis.ts` but did not task required strict config updates | Remediated in `plan.md` and `tasks.md` by requiring `src/lib/aegis.ts` in `tsconfig.spec-strict.json` and `eslint.config.mjs` |
| A002 | MEDIUM | Archive Sweep safety was too implicit in generated tasks | Remediated by expanding T001/T020 to verify current-target exclusion and no cleanup/delete/move of `specs/003-global-aegis` |
| A003 | MEDIUM | Reference sweep did not require classifying references as resolver, review-gate, or display-only/unaffected | Remediated in plan rules and T002/T017 |
| A004 | MEDIUM | Scheduler regression task did not explicitly cover dispatch inputs, activity logging, and status transitions | Remediated by adding a scheduler semantics guard and expanding T009 |

**G6 Validation:** Passed 2026-04-28T21:11:08Z with zero CRITICAL/HIGH findings and zero markers.

---

## Phase 7: Implement

**When to run:** After tasks are generated and Analyze has no CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First Global Aegis Resolver Implementation

For each task, follow this cycle:

1. RED: Add or update a focused resolver, scheduler, route, or grep test before implementation.
2. GREEN: Implement the smallest feature-flagged behavior that satisfies the task.
3. REFACTOR: Keep resolver and scheduler integration readable with tests still green.
4. VERIFY: Run the task's acceptance check and record evidence.
5. RECORD: Add command/test/grep proof before marking related acceptance criteria complete.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must return `003-global-aegis`.
2. Verify package manager: lockfile is `pnpm-lock.yaml`; use pnpm only.
3. Verify `SPEC-001`, `SPEC-002`, and `SPEC-002A` are complete in the roadmap and `SPEC-003` is in progress in this branch.
4. Run Archive Sweep startup per SPEC-002A policy before normal phases.
5. Inspect current Aegis reference paths:
   - `src/lib/task-dispatch.ts`
   - `src/lib/scheduler.ts`
   - `src/app/api/tasks/route.ts`
   - `src/app/api/tasks/[id]/route.ts`
   - `src/lib/validation.ts`
   - `src/components/panels/task-board-panel.tsx`
   - `src/components/chat/*`
6. Capture baseline tests before enabling any new behavior.

### Implementation Notes

- Implement `getAegis(db, workspace_id?)` in `src/lib/aegis.ts` first.
- Route flag behavior through `resolveFlag('FEATURE_GLOBAL_AEGIS', ctx)`.
- With flag OFF, preserve workspace-first behavior.
- With flag ON, prefer global Aegis and fall back to legacy workspace-scoped rows.
- Preserve current gateway-agent id fallback behavior for missing rows.
- Use `quality_reviews.reviewer='aegis'` for completion gates; do not add `quality_reviews.agent_id`.
- Keep `runAegisReviews` scheduler behavior unchanged except resolver source.
- Do not implement task pipeline, ready-for-owner, area-label, artifact, governance, pilot, CrabTrap, or multi-facility behavior.

### Verification Commands

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Focused Vitest filters for `aegis`, `task-dispatch`, `feature-flags`, task routes, and quality-review validation
- Grep checks:
  - no inline runtime `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`
  - no production direct Aegis workspace lookup bypasses `getAegis`
  - no `quality_reviews.agent_id`
  - no downstream drift into `FEATURE_TASK_PIPELINES`, `ready_for_owner`, `FEATURE_AREA_LABEL_ROUTING`, artifact store, governance, pilot, or CrabTrap implementation
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 0 - Archive Sweep and baseline discovery | 2 | 2 | Completed in T001-T002 |
| 1 - Resolver and flag behavior | 4 | 4 | Completed in T003-T006 |
| 2 - Scheduler and route integration | 9 | 9 | Completed in T007-T015 |
| 3 - Reference sweep and regression guards | 3 | 3 | Completed in T016-T018 |
| 4 - Final verification and status sync | 3 | 3 | Completed in T019-T021 |

**G7 Validation:** Passed 2026-04-28T21:33:04Z with all 21 tasks complete.

**Implementation Verification:** Focused Vitest passed for the original 6-file / 68-test SPEC-003 matrix. Remediation pass on 2026-04-28T22:10:54Z passed the core 4-file / 35-test resolver/dispatch/flag matrix. `pnpm typecheck` passed. `pnpm lint` passed with 0 errors and 10 pre-existing warnings. Static guardrails returned zero matches. `pnpm build` passed after rerunning with network access for Google Fonts; the sandboxed build failed only on `next/font` network fetches. Full `pnpm test` still fails on baseline environment issues: 8 `gnap-sync.test.ts` GPG signing failures and 1 `mc-provisioner-daemon.test.ts` socket timeout.

**Integration Suite:** Spec-specific resolver coverage lives in `src/lib/__tests__/aegis.test.ts` (9 unit tests covering flag-off, flag-on, fallback, M53-backfill, idempotent audit, and tie-breaking paths). Full `pnpm test:e2e` passed on 2026-04-28T22:10:54Z with 533 Playwright tests passing.

**Argos Fixture Remediation:** PR #20 remediation on 2026-04-28T22:51:33Z stabilized the inherited Product Line visual fixtures by replacing timestamp/randomized Playwright seed names with fixed workspace/project/agent/task data, freezing the Product Line visual browser clock, and resetting only the fixed visual fixture rows before each run. Verification passed `pnpm test:e2e:ui-visual` (11 tests), `pnpm test:e2e:argos-metadata` (11 Playwright screenshot metadata files across 5 tests), `pnpm test:visual:storybook` (10 tests), `pnpm test:visual:argos-metadata` (20 Storybook metadata files across 10 stories), `pnpm typecheck`, and `pnpm lint` with the same 10 pre-existing warnings.

**PR Creation:** PR #20 opened on 2026-04-28T21:43:56Z: <https://github.com/racecraft-lab/Paddock/pull/20>.

**PR Merge:** PR #20 merged to `main` on 2026-04-30 as `85d102f`.

**Post-Extension Gates:** Installed verify/review/cleanup/retrospective command definitions were re-run as local gate procedures on 2026-04-28T22:10:54Z because this Codex runtime does not expose a slash-command invoker. Evidence is recorded in `specs/003-global-aegis/post-implementation-gates.md` and `specs/003-global-aegis/retrospective.md`.

**Review Remediation:** Immediate GitHub review-thread query for PR #20 returned zero review threads. The autopilot `/loop` remediation scheduler is not available in this Codex runtime or in `.claude/commands`, so no recurring monitor could be scheduled from this session. This remains an external runtime capability gap, not a repository implementation gap.

---

## Post-Implementation Checklist

- [x] Archive Sweep evidence is recorded and excludes `SPEC-003`.
- [x] All generated tasks are marked complete in `specs/003-global-aegis/tasks.md`.
- [x] Acceptance evidence exists for P2-AC1 through P2-AC6.
- [x] `src/lib/aegis.ts` exists and exports the shared resolver.
- [x] `runAegisReviews` uses `getAegis` rather than a local workspace-keyed Aegis map.
- [x] Flag OFF preserves workspace-first behavior.
- [x] Flag ON resolves global Aegis first and preserves legacy fallback.
- [x] Shadowed local-row audit activity is tested and does not spam.
- [x] Aegis gates still use `quality_reviews.reviewer='aegis'`.
- [x] Prohibited-drift grep checks pass.
- [x] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [x] `pnpm lint` passes or any environment failure is documented with evidence.
- [x] `pnpm test` passes or any environment failure is documented with evidence.
- [x] `docs/ai/rc-factory-technical-roadmap.md` records SPEC-003 completion evidence after implementation.
- [x] `docs/rc-factory-v1-prd.md` reflects SPEC-003 completion after verification.
- [x] Branch is pushed for review.
- [x] Spec-specific resolver coverage exists in `src/lib/__tests__/aegis.test.ts` (9 unit tests).
- [x] Post-extension gate evidence is recorded in `specs/003-global-aegis/post-implementation-gates.md`.
- [x] Retrospective evidence is recorded in `specs/003-global-aegis/retrospective.md`.

---

## Lessons Learned

### What Worked Well

- Keeping `getAegis(db, workspace_id?)` as the single resolver made the scheduler change small and kept flag-off compatibility directly testable.
- Checklist/analyze gates caught strict-scope and regression-guard wording before implementation, which kept the final code diff focused.
- Recording Archive Sweep and gate evidence in `autopilot-state.json` made the interrupted/resumed run recoverable.

### Challenges Encountered

- Legacy SpecKit command templates were missing from `.claude/commands` at startup and had to be restored before prerequisite validation could pass.
- Full `pnpm test` is not clean in this local environment because GPG-agent and provisioner socket tests fail independently of SPEC-003.
- `pnpm build` needed network access for Google Fonts, and SSH push failed because the signing agent refused the key; HTTPS push succeeded.
- The autopilot `/loop` review-remediation scheduler is unavailable in this Codex runtime, so review-thread monitoring was limited to a direct GitHub query.
- The first completion pass marked P2 success criteria complete only in the post-implementation checklist; the remediation pass checked P2-AC1 through P2-AC6 in the success-criteria summary as well.
- SPEC-002 Argos Playwright snapshots should not use visible timestamp/random suffix seed data; fixed visual fixture identities plus a frozen browser clock keep every PR from producing unrelated screenshot churn.

### Patterns to Reuse

- Keep downstream SPEC-004+ behavior behind static grep guardrails when a phase must not drift into later roadmap scope.
- Record both local verification success and environment-limited failures in the workflow rather than hiding incomplete suite results.
- Refresh the remote tracking ref after HTTPS pushes when the configured `origin` remote uses SSH.
- Keep a spec-named `tests/e2e/` file for every spec that relies on Playwright evidence so the Integration Suite discovery step has an unambiguous match.
- For visual journeys, seed human-readable fixture names, slugs, ticket prefixes, and task timestamps deterministically and reset those rows before the run instead of making each PR invent new visible data.

---

## Project Structure Reference

```text
racecraft-mission-control/
|-- src/lib/aegis.ts                         # New SPEC-003 Aegis resolver
|-- src/lib/task-dispatch.ts                 # Scheduler review dispatch integration
|-- src/lib/scheduler.ts                     # Existing aegis_review cron task
|-- src/app/api/tasks/route.ts               # Aegis gate checks
|-- src/app/api/tasks/[id]/route.ts          # Aegis gate checks
|-- src/lib/validation.ts                    # Review schema/defaults
|-- src/components/panels/task-board-panel.tsx
|-- src/components/chat/
|-- docs/rc-factory-v1-prd.md
|-- docs/ai/rc-factory-technical-roadmap.md
|-- docs/ai/specs/SPEC-003-workflow.md       # This workflow
|-- docs/ai/specs/autopilot-state.json
|-- specs/003-global-aegis/                  # Generated SpecKit artifacts
|-- .specify/memory/constitution.md
`-- .specify/extensions/archive/             # SPEC-002A archive extension
```

---

## Setup Notes

- This workflow was committed on branch `003-global-aegis` and merged to `main` via PR #20.
- This workflow is retained as completed SPEC-003 evidence; do not rerun SPEC-003 autopilot from `main`.
- Set up the next dependency-chain spec from a fresh workflow, starting with `$speckit-setup SPEC-004`.
