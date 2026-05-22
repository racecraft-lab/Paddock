# SpecKit Workflow: SPEC-013A - Run-State Persistence Spine

**Template Version**: 1.0.0
**Created**: 2026-05-22
**Purpose**: Prepare and execute RC Factory Phase 11A by adding the first durable, inspectable task-stage attempt spine for later GitHub sync automation, claim/reconciliation, retry, and harness execution specs.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-013A-workflow.md` from the `013a-run-state-spine` worktree.
2. Keep all generated spec artifacts under `specs/013a-run-state-spine/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-setup`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-013A-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `/speckit.clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | Branch/worktree, archive registry, presets, package manager, command map, and required Codex subagents verified before Specify |
| Specify | `$speckit-specify` | Complete | G1 passed; generated `specs/013a-run-state-spine/spec.md` and requirements checklist with zero clarification markers |
| Clarify | `$speckit-clarify` | In Progress | First session is schema identity and lifecycle |
| Plan | `$speckit-plan` | Pending | Plan additive schema if justified by Q1 decision, typed helpers, read-only API/UI, tests, and rollback |
| Checklist | `$speckit-checklist` | Pending | Run focused domains for data integrity, API contracts, state management, regression safety, and UX/accessibility |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first tasks with strict boundaries against SPEC-013B/C and SPEC-014A-D |
| Analyze | `$speckit-analyze` | Pending | Cross-check spec, plan, tasks, and design concept for scope drift |
| Implement | `$speckit-implement` | Pending | Execute tasks only after G6 passes |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `013a-run-state-spine`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-013A `In Progress` on this branch only |
| G1 | After Specify | Requirements cover additive task-stage attempt persistence, observed lifecycle log, current-state projection, optional `run_id`, flag-off ignore behavior, read-only inspection, archival state, and strict SPEC-013B boundary |
| G2 | After Clarify | Table identity, lifecycle vocabulary, projection semantics, archive fields, debug API auth/write boundaries, and `runs` relationship are resolved with no unresolved markers |
| G3 | After Plan | Architecture cites live schema evidence, uses additive migrations only if needed, includes rollback SQL, reuses existing task/runs/evidence patterns where possible, and does not claim, dispatch, retry, reconcile, sandbox, or launch work |
| G4 | After Checklist | All `[Gap]` markers from required domains are addressed or intentionally out of scope |
| G5 | After Tasks | Tasks are reviewable, dependency-ordered, TDD-first for schema/helpers/routes/components, and bounded to SPEC-013A surfaces |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; design concept, spec, plan, and tasks agree on schema, flag, archive, API/UI, and boundary decisions |
| G7 | During Implement | Focused tests, typecheck, lint, build as needed, migration smoke/rollback checks, route/component tests, guardrails, roadmap/workflow status, and UAT evidence pass |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy dispatch/runtime behavior unchanged | Flag-off tests prove run-state rows are ignored by scheduler/dispatch paths and existing task flows |
| II. Upstream Compatibility Discipline | New persisted state is additive and explicit about fork pressure | Plan labels schema as upstream-divergent if new tables are added and keeps runtime opt-in |
| IV. Test-First Development | Schema/helper/API/UI behavior begins with failing tests or fixtures | Tasks require RED tests before migration/helper/route/component implementation |
| V. Feature-Flag Resolution Discipline | Runtime behavior gates through `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` only | Static guardrails find no inline `process.env.FEATURE_TASK_CONTROL_PLANE` reads |
| VII. Additive Migration Policy | Any migration is additive, idempotent, rollback-documented, and schema-truth cited | Plan cites `src/lib/migrations.ts` slot, adds rollback SQL, and migration tests cover rerun/rollback semantics |
| X. Observability and Auditability | Attempt records are inspectable, source-linked, archived non-destructively, and traceable to task/stage/run context | API/UI fixtures show state history, current projection, optional `run_id`, archive timestamp, and source references |
| XIV. Real UI Journey Quality Gate | New task-detail/debug UI receives browser coverage if changed | Focused Playwright journey covers visible read-only run-state section when UI changes |
| XVI. Reviewability And Verification Debt Control | SPEC-013A stays one model/debug slice and records split boundaries | Analyze blocks claim authority, scheduler launch, retry policy, GitHub reconciliation, sandbox, adapter, or full dashboard drift |

**Constitution Check:** Startup prerequisites verified the project constitution exists. Re-check after Specify, Plan, Analyze, and Implement.

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

Decision: setup may proceed under the roadmap transition exception, but downstream phases must keep actual implementation to SPEC-013A strict scope: run-state model, additive migration only if justified, serialization helpers, fixtures, and read-only debug output.

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
| Spec ID | SPEC-013A |
| Name | Run-State Persistence Spine |
| Branch | `013a-run-state-spine` |
| Dependencies | SPEC-009D, SPEC-012A |
| Enables | SPEC-013A1 |
| Priority | P1 |
| Scope source | Phase 11A - Run-state persistence spine |
| Acceptance criteria source | Phase 11A Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Define the minimum durable state needed for claimed, running, retrying, released, and archived task-stage work. The roadmap says to reuse or extend `src/lib/runs.ts` and `AgentRun.metadata` where possible before adding additive schema, but the setup interview selected a dedicated additive task-stage-attempt table from the start.

### Strict Scope

Allowed:

- Additive task-stage attempt persistence if Plan confirms schema details.
- Observed lifecycle state log and current-state projection.
- Optional relationship to existing `runs.id`.
- Serialization/normalization helpers and fixtures.
- Read-only authenticated API and compact existing task-detail/debug section for inspection.
- Non-destructive archive state/timestamp.
- Tests proving `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy runtime paths unchanged.

Forbidden:

- Work selection, claim authority, duplicate-launch prevention, or concurrency enforcement.
- Scheduler launch, dispatch changes, retry/backoff policy, cancellation controls, or reconciliation authority.
- Automatic GitHub sync/poller lifecycle.
- GitHub/task terminal-state reconciliation.
- Sandbox lifecycle, harness adapters, runtime inventory, or real harness execution.
- Full global control-plane dashboard.
- Physical deletion, archive-table movement, or file-export deletion of attempt rows.
- New runtime dependency unless separately justified and pinned.

### Design Concept Decisions

- Q1: Add a dedicated additive task-stage-attempt table from the start; do not rely only on `runs` / `AgentRun.metadata`.
- Q2: Primary identity is one append-only attempt per task-stage execution.
- Q3: Lifecycle is an observed state log with a current-state projection, not an enforceable state machine.
- Q4: With `FEATURE_TASK_CONTROL_PLANE=false`, runtime ignores the data while authenticated read-only debug inspection remains available.
- Q5: Inspection surface is a minimal authenticated API plus compact existing task-detail/debug panel section, not a full dashboard.
- Q6: Archive is non-destructive via terminal state or timestamp in the database; no delete, partition, or export-and-delete behavior.
- Q7: Link to existing `runs.id` is optional because attempts can exist before a harness run exists.
- Q8: SPEC-013A may create/update/inspect/archive attempt records through fixtures or explicit debug APIs only; no selection, claim, duplicate prevention, scheduler, or GitHub reconciliation.

### Success Criteria Summary

- [ ] A task-stage attempt can be represented with task identity, workflow/stage identity, attempt number, lifecycle history, current projection, and optional `run_id`.
- [ ] Attempt rows can be inspected through an authenticated read-only API and compact task-detail/debug UI without requiring terminal history.
- [ ] Archived attempt state is non-destructive and traceable.
- [ ] `FEATURE_TASK_CONTROL_PLANE=false` causes legacy dispatch/scheduler behavior to ignore run-state rows.
- [ ] Existing `runs` / `AgentRun` fields are not duplicated unnecessarily; optional linkage is documented.
- [ ] The spec records why the dedicated attempt table is justified despite the roadmap's reuse-first caution.
- [ ] No claim authority, retry policy, scheduler launch, GitHub reconciliation, sandbox lifecycle, harness adapter, or auto-merge behavior is introduced.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/013a-run-state-spine/spec.md`.

### Specify Prompt

```bash
/speckit.specify

## Feature: SPEC-013A - Run-State Persistence Spine

### Problem Statement
Mission Control can ingest issues, route triage outcomes, produce review packets, and show stored task evidence, but it still lacks a durable task-stage attempt spine. Current `runs` / `AgentRun` records describe agent runtime executions, while later control-plane specs need a task-stage attempt model that can exist before a harness run starts, be inspected by operators, be archived non-destructively, and be ignored safely when `FEATURE_TASK_CONTROL_PLANE=false`.

### Users
- Operators inspecting whether a task-stage attempt exists, what state it is in, whether it is archived, and whether it links to a concrete run.
- Future SPEC-013A1/SPEC-013B/SPEC-013C implementers who need a persistence substrate for sync automation, claim/reconciliation authority, and retry/debug controls.
- Reviewers validating that Mission Control did not add claim authority, scheduler launch, retry policy, or harness execution prematurely.

### Required Behavior
- Create a dedicated additive task-stage-attempt persistence model. The setup interview selected this over reuse-only `AgentRun.metadata`.
- Represent one append-only attempt per task-stage execution, keyed by task identity, workflow/stage identity, attempt number, lifecycle history, current-state projection, and optional `run_id` linking to `runs.id`.
- Model lifecycle as observed state log plus current projection. It may include states such as `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`, but exact vocabulary must be clarified.
- Keep `FEATURE_TASK_CONTROL_PLANE=false` behavior runtime-safe: existing scheduler, dispatch, GitHub sync, task-chain, and review packet behavior must ignore run-state rows.
- Keep read-only debug inspection available even when the feature flag is off so the UAT gate can prove represent/inspect/archive/ignore behavior.
- Provide a minimal authenticated read-only API and compact existing task-detail/debug UI section for inspection if Plan confirms the UI seam.
- Archive attempts non-destructively with an archived terminal state or timestamp. Do not physically delete, move to archive tables, or export-and-delete attempt rows.
- Explain why existing `runs` / `AgentRun.metadata` are insufficient as the sole model, while preserving optional `run_id` linkage and avoiding duplicated run fields.

### Constraints
- TypeScript 5.7 strict on Node >=22, Next.js 16 App Router, React 19, Tailwind CSS 3, `better-sqlite3`, Vitest, Playwright, pnpm.
- SQLite migrations are additive only and require rollback SQL.
- Feature-flag checks must use `resolveFlag`, never inline `process.env.FEATURE_TASK_CONTROL_PLANE`.
- No new runtime dependency is expected.
- No claim authority, duplicate-launch prevention, scheduler launch, automatic GitHub sync, terminal reconciliation, retry/backoff controls, sandbox lifecycle, harness adapters, full dashboard, or auto-merge behavior.

### Out of Scope
- SPEC-013A1 GitHub sync automation and poller lifecycle.
- SPEC-013B claim and reconciliation authority.
- SPEC-013C retry/backoff and debug controls beyond passive inspection.
- SPEC-014A-D sandbox lifecycle, adapter manifests, real harness execution, OpenClaw/external adapter behavior.
- Broad redesign of `src/lib/runs.ts` or replacement of `AgentRun`.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 14 |
| User Stories | 3 |
| Acceptance Criteria | 7 acceptance scenarios / 5 success criteria |

### Files Generated

- [x] `specs/013a-run-state-spine/spec.md`

---

## Phase 2: Clarify

**When to run:** Required after Specify. Maximum 5 targeted questions per session.

### Clarify Prompts

#### Session 1: Schema Identity And Lifecycle

```bash
/speckit.clarify

Focus on SPEC-013A schema identity and lifecycle:
- Exact table/entity names for task-stage attempts and lifecycle events/current projection.
- Required identity fields: task id, workspace id, workflow template or stage identity, attempt number, status, timestamps, archive fields, optional run id.
- Whether lifecycle history and current projection live in one table, two additive tables, or one table plus JSON metadata.
- Status vocabulary and legal observed states without enforcing claim authority.
- Unique indexes that support inspection without preventing future SPEC-013B claim semantics.
```

#### Session 2: Flag-Off Runtime Isolation And Debug Reads

```bash
/speckit.clarify

Focus on FEATURE_TASK_CONTROL_PLANE=false behavior:
- Which runtime paths must ignore attempt rows: scheduler, task dispatch, task-chain advancement, GitHub sync, Aegis, review packets, and evidence routes.
- Whether read-only debug APIs/UI remain visible with the flag off and exactly what they show.
- Auth/workspace-scope masking rules for attempt inspection.
- Static guardrails needed to prevent inline env flag checks or accidental scheduler/dispatch integration.
```

#### Session 3: Runs Relationship And Archive Semantics

```bash
/speckit.clarify

Focus on relationship to existing runs and archival:
- Optional `run_id` link to `runs.id`, foreign-key behavior, and how attempts represent pre-run created states.
- Which existing `AgentRun` fields must be referenced rather than duplicated.
- Non-destructive archive state/timestamp semantics and whether archived attempts remain queryable by task detail.
- Rollback expectations and operator recovery if migration/schema needs reversal.
```

#### Session 4: API/UI Surface And SPEC-013B Boundary

```bash
/speckit.clarify

Focus on inspection surface and strict boundaries:
- Exact route shape for read-only attempt inspection, likely task-scoped unless Plan proves otherwise.
- Whether to extend the existing task detail Evidence/debug section or create a separate compact task detail section.
- Whether any write/debug endpoint is allowed outside tests, and if so how it is authenticated and kept non-dispatching.
- Explicit prohibitions against work selection, claim tokens, one-active-attempt enforcement, duplicate launch prevention, scheduler calls, GitHub reconciliation, retry controls, sandbox, and harness adapters.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Schema identity and lifecycle | Pending | Pending |
| 2 | Flag-off runtime isolation and debug reads | Pending | Pending |
| 3 | Runs relationship and archive semantics | Pending | Pending |
| 4 | API/UI surface and SPEC-013B boundary | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/013a-run-state-spine/plan.md`.

### Plan Prompt

```bash
/speckit.plan

## Tech Stack
- Backend: Next.js 16 App Router route handlers, TypeScript 5.7 strict, synchronous SQLite through `better-sqlite3`.
- Frontend: React 19 with existing task detail/evidence panel patterns.
- Styling: Tailwind CSS 3 using existing Mission Control operational UI density.
- State: Existing React/Zustand surfaces only where current task detail patterns require them.
- Database: SQLite via `src/lib/migrations.ts`; additive migration and rollback SQL required if schema is added.
- Testing: Vitest for helpers/routes/migrations/components; Playwright only if user-facing task detail/debug UI changes; `pnpm typecheck`, `pnpm lint`, `pnpm build`, and focused guard scripts.

## Design Concept Inputs
- Q1 selected a dedicated additive task-stage-attempt table from the start. Plan must explain why existing `runs` / `AgentRun.metadata` are insufficient as the sole model.
- Q2 selected one append-only attempt per task-stage execution.
- Q3 selected observed lifecycle log plus current-state projection, not enforcement.
- Q4 selected flag-off runtime ignore behavior with read-only debug inspection still available.
- Q5 selected minimal authenticated API plus compact existing task-detail/debug UI section.
- Q6 selected non-destructive archive state/timestamp in the database.
- Q7 selected optional `run_id` link to existing `runs.id`.
- Q8 selected a strict no-claim/no-scheduler/no-reconciliation boundary.

## Architecture Notes
- Start by reading `src/lib/runs.ts`, `src/lib/migrations.ts`, task detail route/component seams, `src/lib/task-evidence.ts`, and SPEC-009D/009E deferral fields.
- If adding schema, allocate the next migration id from live `src/lib/migrations.ts`, create idempotent additive migration tests, and add paired rollback SQL under `docs/migrations/`.
- Prefer a small `src/lib/task-stage-attempts.ts` style helper if Plan confirms naming. It should own serialization, status validation, current projection derivation, and archive operation semantics.
- The read-only route should be task-scoped unless Clarify chooses a better shape. It must follow existing auth/workspace masking patterns.
- UI should reuse existing task detail density and not create a new global dashboard.
- No runtime path may use attempt rows to select, claim, block, retry, reconcile, launch, or merge work in this spec.

## Verification Plan
- RED tests for migration idempotency, rollback presence, helper validation, append-only lifecycle recording, current projection, archive state, optional `run_id`, and flag-off ignore behavior.
- Route tests for auth, workspace masking, missing task/attempts, archived state, and safe metadata.
- Component/browser tests if UI changes.
- Guardrails for forbidden scheduler/dispatch/retry/claim/GitHub reconciliation/sandbox/adapter integration.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, schema decision, constitution gates |
| `research.md` | Pending | Dedicated table justification, lifecycle/projection, flag behavior, API/UI decisions |
| `data-model.md` | Pending | Attempt entity, lifecycle event/projection, archive state, optional run link |
| `contracts/` | Pending | Read-only API contract and fixture contract |
| `quickstart.md` | Pending | Operator UAT and rollback/flag-off verification path |

---

## Phase 4: Domain Checklists

**When to run:** After `/speckit.plan`. Validate both spec and plan together.

### Checklist Prompts

#### 1. data-integrity Checklist

```bash
/speckit.checklist data-integrity

Focus on SPEC-013A requirements:
- Additive migration only, idempotent reruns, rollback SQL, and live schema evidence.
- Append-only attempt identity and lifecycle history.
- Current-state projection consistency with lifecycle history.
- Optional `run_id` link without duplicating `AgentRun` fields.
- Non-destructive archive state/timestamp and query behavior.
- Pay special attention to: indexes or uniqueness rules must not implement SPEC-013B claim authority early.
```

#### 2. api-contracts Checklist

```bash
/speckit.checklist api-contracts

Focus on SPEC-013A requirements:
- Authenticated read-only attempt inspection route.
- Workspace masking and missing/cross-workspace task behavior.
- Response shape for no attempts, active attempts, archived attempts, optional run links, and invalid state.
- No write, claim, retry, scheduler, GitHub sync, or launch action in the API unless Clarify explicitly permits a non-dispatching debug fixture path.
- Pay special attention to: route names and response vocabulary should stay generic for future SPEC-013B/C reuse.
```

#### 3. state-management Checklist

```bash
/speckit.checklist state-management

Focus on SPEC-013A requirements:
- Observed lifecycle states versus enforceable state machine boundaries.
- Current projection derivation and stale/malformed lifecycle handling.
- `FEATURE_TASK_CONTROL_PLANE=false` runtime ignore behavior.
- Archive state transitions and read-only display of archived attempts.
- Pay special attention to: no task dispatch, task-chain, scheduler, GitHub sync, or Aegis path may consult attempts for runtime decisions.
```

#### 4. regression-safety Checklist

```bash
/speckit.checklist regression-safety

Focus on SPEC-013A requirements:
- Flag-off behavior keeps all existing single-workspace dispatch and task evidence flows unchanged.
- New migrations are null-default/additive and safe for existing data.
- No direct runtime `INSERT INTO tasks`, no scheduler launch, no claim enforcement, no retry policy, no GitHub reconciliation, no sandbox or adapter path.
- Existing SPEC-009D/009E evidence and deferral surfaces remain compatible.
- Pay special attention to: static guardrails must catch accidental SPEC-013B/014 drift.
```

#### 5. ux-accessibility Checklist

```bash
/speckit.checklist ux-accessibility

Focus on SPEC-013A requirements:
- Compact task-detail/debug section communicates no attempts, active attempt, archived attempt, and optional run link states without clutter.
- Loading, empty, error, and archived states are accessible and not color-only.
- Text fits existing task detail panel density and does not introduce a dashboard-like marketing surface.
- Pay special attention to: read-only display must not imply that operators can claim, retry, cancel, or launch work in SPEC-013A.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | Pending | Pending | Pending |
| api-contracts | Pending | Pending | Pending |
| state-management | Pending | Pending | Pending |
| regression-safety | Pending | Pending | Pending |
| ux-accessibility | Pending | Pending | Pending |
| **Total** | Pending | Pending | Pending |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/013a-run-state-spine/tasks.md`.

### Tasks Prompt

```bash
/speckit.tasks

## Task Structure
- Generate TDD-first tasks. RED tests must precede migration/helper/route/component implementation.
- Reference `docs/ai/specs/SPEC-013A-design-concept.md`, `spec.md`, and `plan.md`.
- Use Design Concept Non-goals to prevent claim/scheduler/retry/GitHub reconciliation/sandbox/adapter drift.
- Mark parallel-safe tasks with [P] only when file ownership is disjoint.

## Suggested Implementation Phases
1. Setup and scope guardrails: strict TypeScript/lint entries, package manager confirmation, forbidden-scope guards.
2. Schema and migration tests: additive attempt model, rollback SQL, idempotency, optional `run_id`, archive fields.
3. Helper/model behavior: lifecycle append, current projection, archive operation, serialization, malformed-state handling.
4. Read-only API: auth/workspace masking, task/no-attempt/archived/current/optional-run responses.
5. Compact task detail/debug UI if planned: component states, accessibility, browser journey.
6. Flag-off/runtime isolation: tests and static guards proving scheduler/dispatch/GitHub sync/task-chain/Aegis ignore attempts.
7. Verification and docs: roadmap/workflow updates, quickstart/UAT evidence, OpenAPI/API index parity if API changes, final checks.

## Constraints
- Do not edit scheduler/dispatch/GitHub sync behavior except for tests or guardrails proving non-use.
- Do not add claim tokens, one-active-attempt enforcement, retry actions, cancel/release controls, or launch behavior.
- Do not introduce a full dashboard.
- Keep migrations additive and rollback-documented.
- Use pnpm for all project commands.
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
/speckit.analyze

Focus on SPEC-013A cross-artifact consistency:
1. Verify spec.md, plan.md, tasks.md, and docs/ai/specs/SPEC-013A-design-concept.md agree that a dedicated additive task-stage-attempt table is planned.
2. Verify the attempt model remains append-only with observed lifecycle history plus current projection and non-destructive archive state.
3. Verify `FEATURE_TASK_CONTROL_PLANE=false` runtime ignore behavior is tested and no runtime path uses attempts to select, claim, dispatch, retry, reconcile, launch, sandbox, or merge work.
4. Verify optional `run_id` linkage avoids duplication of `AgentRun` fields.
5. Verify API/UI tasks are read-only and compact, with no dashboard or operator action controls.
6. Verify migration/rollback/schema-truth requirements are covered if schema is added.
7. Flag any drift into SPEC-013A1, SPEC-013B, SPEC-013C, or SPEC-014A-D as HIGH or CRITICAL depending on blast radius.
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
/speckit.implement

## Approach: TDD-First

For each task:
1. RED: write the failing test or fixture first.
2. GREEN: implement the minimum code to pass.
3. REFACTOR: clean up while preserving test results.
4. VERIFY: run focused checks after each slice.

### Pre-Implementation Setup
1. Confirm branch: `git rev-parse --abbrev-ref HEAD` must return `013a-run-state-spine`.
2. Confirm package manager from `pnpm-lock.yaml`; use pnpm only.
3. Read `docs/ai/specs/SPEC-013A-design-concept.md`, `specs/013a-run-state-spine/spec.md`, and `specs/013a-run-state-spine/plan.md`.
4. Run or record baseline focused tests before implementation.

### Implementation Notes
- Treat the Design Concept Q&A as the source of truth for setup-time scope decisions.
- Keep new model/helper names generic and task-stage-attempt oriented unless Clarify chooses exact names.
- Preserve optional `run_id` linkage to `runs.id`; do not duplicate `AgentRun` fields.
- Keep archive non-destructive.
- Keep all inspection surfaces read-only unless Clarify explicitly allows fixture/debug writes, and never let those writes select or launch work.
- Add static guardrails for forbidden scope drift.
- Update workflow, roadmap branch copy, API docs/index, migration rollback docs, and UAT checklist as required by generated tasks.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Setup and guardrails | Pending | Pending | Pending |
| 2 - Schema and migrations | Pending | Pending | Pending |
| 3 - Helpers and projections | Pending | Pending | Pending |
| 4 - Read-only API | Pending | Pending | Pending |
| 5 - UI/debug inspection | Pending | Pending | Pending |
| 6 - Runtime isolation and verification | Pending | Pending | Pending |
| 7 - Docs/UAT/status | Pending | Pending | Pending |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `specs/013a-run-state-spine/tasks.md`.
- [ ] Focused migration/helper/route/component tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` or justified focused subset passes.
- [ ] `pnpm build` passes when runtime/API/UI files changed.
- [ ] Focused Playwright/UI journey passes if task detail UI changes.
- [ ] Static guardrails prove no claim, scheduler launch, retry policy, GitHub reconciliation, sandbox, adapter, or auto-merge behavior was introduced.
- [ ] Rollback SQL and operator runbook updates exist if migration is added.
- [ ] Roadmap and workflow status are updated on the spec branch.
- [ ] PR review packet records reviewability, verification, flag, rollback, and known-gap evidence.

---

## Project Structure Reference

```text
src/lib/runs.ts                         Existing AgentRun spine; optional run_id target
src/lib/migrations.ts                   Forward-only migration runner
docs/migrations/                        Rollback SQL and rollback procedure updates
src/lib/task-evidence.ts                Existing task evidence read-model pattern from SPEC-009E
src/app/api/tasks/[id]/                 Existing task-scoped API area
src/components/panels/                  Existing task detail/evidence UI patterns
docs/ai/rc-factory-technical-roadmap.md Roadmap/status/future-spec source of truth
docs/ai/specs/SPEC-013A-design-concept.md Setup-time design decisions
specs/013a-run-state-spine/             Generated SpecKit artifacts
```

---

Template based on SpecKit best practices and populated for SPEC-013A setup.
