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
| Clarify | `$speckit-clarify` | Complete | G2 passed; 20 clarification answers and 5 consensus resolutions recorded with zero unresolved markers |
| Plan | `$speckit-plan` | Complete | G3 passed; selected migration `076_task_stage_attempts`, generated research/data-model/API contract/quickstart, and rejected runtime fixture endpoint for this implementation |
| Checklist | `$speckit-checklist` | Complete | G4 passed; 107 checklist items, 14 gaps remediated, zero remaining active `[Gap]` markers |
| Tasks | `$speckit-tasks` | Complete | G5 passed; generated 58 TDD-first tasks across 6 phases, with 26 parallel opportunities and a ratified transition exception for the planned schema/helper/API/UI scope |
| Analyze | `$speckit-analyze` | Complete | G6 passed after remediating 2 medium design-concept drift findings; zero CRITICAL/HIGH findings remain |
| Implement | `$speckit-implement` | In Progress | Executing T001-T007 setup and scope guardrails first |

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

### Implementation Setup Evidence

| Item | Evidence |
|------|----------|
| Package manager | `pnpm-lock.yaml` is present and Phase 5 recorded `pnpm` as the package manager in `specs/013a-run-state-spine/tasks.md` |
| Archive sweep | Startup verified the archive extension registry, excluded `specs/013a-run-state-spine` as the current target, identified eligible prior specs, and recorded `cleanup_mode=recorded-no-cleanup` because Codex archive command files were not present |
| Screenshot artifacts | SPEC-013A Playwright screenshots and fixture exports are review artifacts under `test-results/spec-013a-task-stage-attempts/`; screenshot binaries are not committed durable artifacts |
| Reviewability decision | Tasks reviewability gate passed as a transition exception. Continue with the full SPEC-013A model/debug slice, but split if implementation adds any unplanned surface or any fixture write endpoint, claim/retry/release/cancel control, scheduler launch, GitHub reconciliation, sandbox lifecycle, harness adapter, or auto-merge behavior |

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
| 1 | Schema identity and lifecycle | 5 | Accepted two-table attempt/event model, required identity fields, seven-state lifecycle vocabulary, inspection-only indexes, and human-admin-session debug write boundary |
| 2 | Flag-off runtime isolation and debug reads | 5 | Accepted table-blind runtime path list, flag-off debug read payload, workspace masking/auth rules, typed default-off flag registry entry, and static guardrails |
| 3 | Runs relationship and archive semantics | 5 | Accepted soft nullable run link, compact read-time run summary, archive status/timestamp/event semantics, child-first rollback, and trusted proxy-auth human-admin rule |
| 4 | API/UI surface and SPEC-013B boundary | 5 | Accepted dedicated task-scoped read route, compact task-detail section, controlled fixture/UAT endpoint conditions, explicit no-control-plane contract, and `task_stage_attempts.v1` envelope |

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
| `plan.md` | Complete | Technical context, schema decision, constitution gates, migration id `076_task_stage_attempts` |
| `research.md` | Complete | Dedicated table justification, lifecycle/projection, flag behavior, API/UI decisions |
| `data-model.md` | Complete | Attempt entity, lifecycle event/projection, archive state, optional soft run link |
| `contracts/` | Complete | Read-only `GET /api/tasks/[id]/stage-attempts` contract |
| `quickstart.md` | Complete | Operator UAT and rollback/flag-off verification path |

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
| data-integrity | 20 | 1 found, 1 remediated | `spec.md`, `plan.md`, `quickstart.md`, `checklists/data-integrity.md` |
| api-contracts | 22 | 4 found, 4 remediated | `spec.md`, `plan.md`, `contracts/task-stage-attempts-api.md`, `checklists/api-contracts.md` |
| state-management | 18 | 2 found, 2 remediated | Projection drift warning behavior added across spec, plan, data model, research, contract, quickstart, and checklist |
| regression-safety | 24 | 2 found, 2 remediated | Task creation parity and SPEC-013B/014 drift guardrails tightened in spec, plan, and checklist |
| ux-accessibility | 23 | 5 found, 5 remediated | FR-028/FR-029/SC-013 plus plan accessibility/browser evidence |
| **Total** | 107 | 14 found, 14 remediated | G4 pass, zero active `[Gap]` markers |

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
| Total Tasks | 58 |
| Phases | 6 |
| Parallel Opportunities | 26 tasks marked `[P]` |
| User Stories Covered | 3 |

### Tasks Reviewability Gate

| Gate | Status | Notes |
|------|--------|-------|
| G5 | Pass | 58 tasks found, zero unresolved markers |
| Tasks reviewability | Exception | Transition exception ratified in `tasks.md`; raw budget remains 2320 reviewable LOC, 24 production files, 114 total files, and 6 primary surfaces because SPEC-013A intentionally spans schema, helper, route, and compact UI as the minimum durable run-state spine |

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
| A1 | Medium | Setup-time Q7 still described optional `run_id` link without the later no-FK refinement | Added Post-Clarify/Plan resolution note: nullable `TEXT` soft reference, app-level lookup, no DB FK, no duplicated runtime-run fields |
| A2 | Medium | Setup-time Open Questions still listed schema/API/lifecycle/write-boundary questions as active after Clarify/Plan resolved them | Replaced active Open Questions with resolved setup-time questions covering final table, lifecycle, route/UI, and write-boundary decisions |

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
| 1 - Setup and guardrails | T001-T007 | 7/7 | Added strict-scope config entries, RED API docs/index assertions, run-state scope guard script, package/archive/screenshot/reviewability evidence |
| 2 - Schema and migrations | T008-T018 | 11/11 | Added M76 migration/rollback SQL, default-off task control-plane flag, helper/model behavior, and focused foundation tests |
| 3 - US1 inspection API and task-detail UI | T019-T032 | 14/14 | Added viewer-authenticated read-only route, OpenAPI/API-index docs, compact task-detail run-state section, deterministic e2e journey, and scope/strict guard refinements |
| 4 - US2 archive behavior | T033-T040 | 8/8 | Added explicit non-destructive archive identity tests, default route archive evidence, active-vs-archived UI labels, and fresh-build Playwright coverage |
| 5 - US3 flag-off runtime safety | T041-T049 | 9/9 | Added protected-runtime table-blind guard fixtures, evidence-route blindness assertion, flag-off read-route test, and task-pipeline guardrail evidence |
| 6 - Polish and verification | T050-T058 | 9/9 | Captured live schema and rollback evidence, API parity, focused tests, full typecheck/lint/build, final Playwright journey, and deferred-work notes |

### Implementation Verification Log

| Task Group | Commands | Result |
|------------|----------|--------|
| T001-T007 | `node scripts/spec-013a/check-run-state-scope-guards.mjs --self-test`; `node scripts/spec-013a/check-run-state-scope-guards.mjs`; `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false --noEmit --tsBuildInfoFile /private/tmp/spec013a-setup.tsbuildinfo`; `pnpm exec eslint src/lib/__tests__/task-stage-attempts-route.test.ts scripts/spec-013a/check-run-state-scope-guards.mjs eslint.config.mjs`; `pnpm check:strict-scope`; `git diff --check` | Pass |
| T005 RED | `pnpm test src/lib/__tests__/task-stage-attempts-route.test.ts` | Expected fail: `openapi.json` and `/api/index` do not yet define `GET /api/tasks/{id}/stage-attempts` |
| T008-T018 | `direnv exec . pnpm test src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/feature-flags.test.ts`; `direnv exec . pnpm exec eslint src/lib/migrations.ts src/lib/task-stage-attempts.ts src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/feature-flags.ts src/lib/__tests__/feature-flags.test.ts scripts/spec-013a/check-run-state-scope-guards.mjs`; `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false --noEmit --tsBuildInfoFile /private/tmp/spec013a-foundation.tsbuildinfo`; `direnv exec . node scripts/spec-013a/check-run-state-scope-guards.mjs`; `git diff --check` | Pass; focused Vitest 39/39 |
| T019-T032 | `direnv exec . pnpm test src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/__tests__/task-stage-attempts-section.test.tsx`; `direnv exec . pnpm exec eslint src/lib/__tests__/task-stage-attempts-route.test.ts 'src/app/api/tasks/[id]/stage-attempts/route.ts' src/app/api/index/route.ts src/components/panels/task-stage-attempts-section.tsx src/components/panels/__tests__/task-stage-attempts-section.test.tsx src/components/panels/task-board-panel.tsx tests/e2e/spec-013a-task-stage-attempts.spec.ts scripts/spec-013a/check-run-state-scope-guards.mjs eslint.config.mjs`; `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false --noEmit --tsBuildInfoFile /private/tmp/spec013a-us1.tsbuildinfo`; `direnv exec . pnpm api:parity`; `direnv exec . node scripts/spec-013a/check-run-state-scope-guards.mjs`; `git diff --check`; `direnv exec . pnpm test:e2e tests/e2e/spec-013a-task-stage-attempts.spec.ts` | Pass; focused Vitest 11/11; API parity OK; Playwright 1/1 |
| T033-T040 | `direnv exec . pnpm test src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/__tests__/task-stage-attempts-section.test.tsx`; `direnv exec . pnpm exec eslint src/lib/task-stage-attempts.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/task-stage-attempts-section.tsx src/components/panels/__tests__/task-stage-attempts-section.test.tsx tests/e2e/spec-013a-task-stage-attempts.spec.ts`; `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false --noEmit --tsBuildInfoFile /private/tmp/spec013a-us2.tsbuildinfo`; `direnv exec . node scripts/spec-013a/check-run-state-scope-guards.mjs`; `direnv exec . pnpm build`; `direnv exec . pnpm test:e2e tests/e2e/spec-013a-task-stage-attempts.spec.ts` | Pass; focused Vitest 21/21; build passed; Playwright 1/1 after fresh build |
| T041-T049 | `direnv exec . node scripts/spec-013a/check-run-state-scope-guards.mjs --self-test`; `direnv exec . node scripts/spec-013a/check-run-state-scope-guards.mjs`; `direnv exec . pnpm test src/lib/__tests__/task-stage-attempts-route.test.ts src/lib/__tests__/feature-flags.test.ts`; `direnv exec . pnpm exec eslint scripts/spec-013a/check-run-state-scope-guards.mjs src/lib/__tests__/task-stage-attempts-route.test.ts src/lib/__tests__/feature-flags.test.ts`; `direnv exec . node scripts/check-guardrails.mjs --suite task-pipeline`; `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false --noEmit --tsBuildInfoFile /private/tmp/spec013a-us3.tsbuildinfo` | Pass; scope guard self-test 15 fixtures; focused Vitest 32/32; task-pipeline guardrails passed |
| T050-T058 | M76 schema capture from extracted migration SQL applied twice; rollback SQL check; `direnv exec . pnpm api:parity`; `direnv exec . pnpm test src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/__tests__/task-stage-attempts-section.test.tsx`; `direnv exec . pnpm typecheck`; `direnv exec . pnpm lint`; `direnv exec . pnpm build`; `direnv exec . pnpm test:e2e tests/e2e/spec-013a-task-stage-attempts.spec.ts` | Pass; schema marker count 1 after double apply, required tables/indexes present, `PRAGMA foreign_key_check` returned no rows; rollback child-first/history-warning/marker/FK checks passed; API parity OK; focused Vitest 31/31; typecheck/lint/build passed; Playwright 1/1 |

---

## Post-Implementation Checklist

- [x] All tasks marked complete in `specs/013a-run-state-spine/tasks.md`.
- [x] Focused migration/helper/route/component tests pass.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm test` or justified focused subset passes.
- [x] `pnpm build` passes when runtime/API/UI files changed.
- [x] Focused Playwright/UI journey passes if task detail UI changes.
- [x] Static guardrails prove no claim, scheduler launch, retry policy, GitHub reconciliation, sandbox, adapter, or auto-merge behavior was introduced.
- [x] Rollback SQL and operator runbook updates exist if migration is added.
- [x] Roadmap and workflow status are updated on the spec branch.
- [x] PR review packet records reviewability, verification, flag, rollback, and known-gap evidence.

### Deferred Work Notes

SPEC-013A intentionally stops at additive persistence, read-only inspection, archive preservation, and runtime table-blind guardrails. Claim/reconciliation authority remains deferred to SPEC-013B/C, and sandbox/harness adapter launch behavior remains deferred to SPEC-014.

---

## Consensus Resolution Log

| Phase | Item | Round | Routed Categories | Outcome | Analysts Used |
|-------|------|-------|-------------------|---------|---------------|
| Clarify Session 1 | Debug write boundary for create/update/archive lifecycle records | 1 | security | Accepted with conditions: human-admin session guard for runtime debug writes, authenticated read-only operator inspection, lifecycle append/update only as observed-state recording, no execution-control authority | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 2 | Auth and workspace masking rules for attempt inspection and debug writes | 1 | security, codebase | Accepted with caveat: read path follows existing viewer-or-higher workspace masking and masked task-not-found behavior; debug writes require verified human-admin context excluding API-key and agent-key callers; Plan must confirm trusted proxy-auth treatment | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | Trusted proxy-auth admin handling for debug writes | 1 | security | Accepted with conditions: trusted proxy-auth admins count only as real positive-id human admins; global API-key, agent API-key, and agent-identity requests never satisfy the debug-write guard | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 4 | Fixture/UAT write endpoint boundary | 1 | security, codebase | Accepted with conditions: at most one spec-scoped fixture/UAT endpoint, human-admin-only, mutation/rate limited, CSRF-protected for cookie auth, structured-audited, unavailable outside fixture/UAT unless explicitly reviewed, and inert beyond attempt/event/audit rows | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 4 | No-control-plane schema/API/UI contract | 1 | security, spec | Accepted with precision: encode explicit forbidden schema/field/helper/UI/action controls; `released` and `cancelled` remain passive observed states only | codebase-analyst, spec-context-analyst, domain-researcher |

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
