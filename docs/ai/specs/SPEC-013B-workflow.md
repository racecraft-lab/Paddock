# SpecKit Workflow: SPEC-013B - Claim and Reconciliation Authority

**Template Version**: 1.0.0
**Created**: 2026-05-27
**Purpose**: Prepare RC Factory Phase 11B by adding a narrow claim and reconciliation authority that prevents duplicate scheduler dispatch for GitHub-linked task stages while preserving existing dispatch, successor-selection, and future harness boundaries.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-013B-workflow.md` from the `013b-claim-reconciliation` worktree.
2. Keep all generated spec artifacts under `specs/013b-claim-reconciliation/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-scaffold-spec`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-013B-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `$speckit-clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | Branch/worktree, archive dry-run, Codex-native prereq guard, required Codex subagents, reviewability preset, external context retrieval, and pnpm command map verified |
| Specify | `$speckit-specify` | Complete | Generated and clarified `specs/013b-claim-reconciliation/spec.md` with 4 user stories, 19 functional requirements, 12 acceptance scenarios, 7 success criteria, and 0 clarification markers |
| Clarify | `$speckit-clarify` | Complete | Resolved claim schema, lease timeout, stale GitHub truth, governance evidence, payload safety, UAT evidence, and read-model/API placement |
| Plan | `$speckit-plan` | Complete | Produced architecture, data model, M78 migration/rollback decision, contracts, quickstart, and strict-scope updates |
| Checklist | `$speckit-checklist` | Complete | Ran scheduler-runtime, data-integrity, api-contracts, state-management, and security; all checklist items checked and final marker scan reports 0 gaps |
| Tasks | `$speckit-tasks` | Complete | Generated 57 TDD-first tasks with 23 parallel opportunities; reviewability gate passed as a ratified task-granularity exception |
| Analyze | `$speckit-analyze` | Complete | Remediated 1 critical and 2 high findings; final marker scan reports 0 open findings |
| Implement | `$speckit-implement` | Complete | Implemented M78 claim persistence, narrow claim/reconciliation module, dispatch seam integration, read-only evidence API, focused tests, full `pnpm test:all`, and UAT replay packet |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `013b-claim-reconciliation`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-013B `In Progress` on this branch only |
| G1 | After Specify | Requirements cover issue-linked assigned-task intake, reconciliation-before-claim, stage-attempt claim boundary, active claim uniqueness, terminal/gated release, stale recovery, and no runner/harness/UI controls |
| G2 | After Clarify | Claim table shape, partial unique active constraint, lease duration, stale GitHub truth source, governance block/defer evidence, and read-only API/read-model placement are resolved with no unresolved markers |
| G3 | After Plan | Architecture cites live `task-dispatch`, `scheduler`, `task-stage-attempts`, GitHub sync, governance, and migration evidence; any migration is additive with rollback SQL |
| G4 | After Checklist | All `[Gap]` markers from required domains are addressed or explicitly out of scope |
| G5 | After Tasks | Tasks are reviewable, dependency-ordered, TDD-first, and bounded to claim/reconciliation authority plus evidence |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; artifacts agree on stage-attempt boundary, issue-linked-only intake, launch-critical-section lease, and no SPEC-013C/SPEC-014 behavior |
| G7 | During Implement | Focused tests, typecheck, lint, build, focused dispatch/concurrency tests, full `pnpm test:all`, guardrails, roadmap/workflow status, and UAT evidence pass before closeout |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy scheduler/dispatch behavior unchanged | Flag-off tests prove existing assigned-task dispatch runs without claim/reconciliation side effects |
| IV. Test-First Development | Claim uniqueness, reconciliation deferral, stale recovery, governance block/defer, and release semantics begin with failing tests | Tasks require RED tests before migration/helper/dispatch integration |
| V. Feature-Flag Resolution Discipline | New runtime behavior gates through `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` only | Static guardrails find no inline `process.env.FEATURE_TASK_CONTROL_PLANE` reads |
| VII. Additive Migration Policy | Any claim persistence is additive, idempotent, rollback-documented, and schema-truth cited | Plan cites `src/lib/migrations.ts`, adds rollback SQL, and migration tests cover rerun/rollback semantics |
| VIII. Successor Side-Effect Parity | SPEC-013B does not duplicate `advanceTaskChain` successor selection or task creation | Analyze verifies successor selection remains in `advanceTaskChain` / `createTask` flows |
| X. Observability and Auditability | Every claim, release, stale recovery, and reconciliation deferral emits durable structured evidence | Focused tests assert activity rows, attempt lifecycle events when applicable, and read-model/API envelopes |
| XI. Keep It Simple | Claim authority stays in one narrow module called by existing dispatch boundary | Review ensures scheduler and `task-dispatch.ts` stay thin and no broad runner abstraction appears |
| XVI. Reviewability And Verification Debt Control | SPEC-013B records and preserves its split boundaries | Reviewability gates block retry controls, release/cancel UI, sandbox lifecycle, harness adapters, or primary dashboard drift |

**Constitution Check:** Re-check after Specify, Plan, Analyze, and Implement. Any runtime/scheduler/schema/API expansion beyond this workflow must be split or explicitly justified by a reviewability exception.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/2.4.0/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
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

Decision: setup may proceed under the roadmap transition exception, but downstream phases must keep actual implementation to SPEC-013B strict scope: claim/reconciliation authority, additive persistence if required, existing dispatch boundary integration, structured evidence, and focused concurrency verification.

### Reviewability Preset

Setup installed/refreshed the generic reviewability preset from this worktree:

```json
{
  "status": "installed",
  "preset_id": "speckit-pro-reviewability",
  "changed_templates": [],
  "manifest_changed": false,
  "readme_changed": true,
  "registry_changed": true
}
```

Setup also verified preset resolution from this worktree:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

Each command should resolve to `.specify/presets/speckit-pro-reviewability/templates/`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-013B |
| Name | Claim and Reconciliation Authority |
| Branch | `013b-claim-reconciliation` |
| Dependencies | SPEC-004, SPEC-006, SPEC-008, SPEC-013A1 |
| Enables | SPEC-013C, SPEC-014A |
| Priority | P1 |
| Scope source | Phase 11B - Claim and reconciliation authority |
| Acceptance criteria source | Phase 11B Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Add one coordination path that prevents duplicate dispatch, reconciles task/GitHub/resource state before launch, gates autonomous eligibility on GitHub-linked work, and records release/stop decisions.

### Current Codebase Baseline

- `src/lib/task-dispatch.ts` owns assigned-task dispatch, `advanceTaskChain`, governance handoff, OpenClaw gateway invocation, Aegis review, stale-task requeue, and task-chain advancement.
- `src/lib/scheduler.ts` calls `dispatchAssignedTasks`, `runAegisReviews`, `requeueStaleTasks`, `autoRouteInboxTasks`, and `runGitHubSyncAutomationTick`.
- `src/lib/task-stage-attempts.ts` owns the passive SPEC-013A attempt lifecycle and current-state projection.
- SPEC-013A1 owns GitHub sync automation, lifecycle leases, backoff, owner filtering, and manual-sync fallback. SPEC-013B may consume current GitHub-linked task truth but must not reimplement the poller lifecycle.
- SPEC-014A-D own sandbox lifecycle, adapter manifest/fake registry, first real harness adapter, and OpenClaw/external adapter execution. SPEC-013B must not add harness behavior.

### Strict Scope

Allowed:

- Additive active-claim persistence if Plan confirms schema details.
- Reconciliation-before-claim flow for GitHub issue-linked `assigned` tasks.
- One active claim per `(workspace_id, task_id, stage_key)` enforced by database constraints.
- Claim evidence linked to SPEC-013A task-stage attempts.
- Launch-critical-section lease ownership, expiry, stale recovery, and release evidence.
- Governance block/defer reconciliation evidence without acquiring active claims.
- Existing dispatch boundary integration through a new narrow claim/reconciliation module.
- Read-only API/read-model/debug evidence if needed for operator inspection.
- Focused tests for concurrent scheduler ticks, duplicate launch prevention, stale recovery, GitHub-linked eligibility, governance decisions, and flag-off parity.

Forbidden:

- Claim intake for local-only tasks, repo-only tasks, or arbitrary non-terminal tasks.
- Whole-task locks across all future stages.
- Treating `task_stage_attempts.status = running` as the active claim authority.
- Long-running harness execution ownership, heartbeats, resume, continue, or adapter lifecycle.
- Manual release, retry, cancel, or operator mutation controls.
- Dedicated primary UI/dashboard for claim control.
- Automatic triage, auto-merge, Issue Remediation execution, or successor selection changes.
- Duplicating `advanceTaskChain` or bypassing resource governance.

### Design Concept Decisions

- Q1: Claim boundary is one active GitHub-linked task-stage attempt, not whole task or dispatch-only state.
- Q2: Scheduler flow reconciles first, then claims in one bounded transaction.
- Q3: Autonomous claim intake requires issue-linked GitHub truth: `github_repo` plus `github_issue_number` and matching sync-enabled project/workspace.
- Q4: Active claims use a small additive claim table linked to task-stage attempts, with a partial unique active-claim constraint.
- Q5: Claims release on terminal task/GitHub state, governance block/defer, or terminal attempt lifecycle states.
- Q6: Stale active claims recover after bounded lease expiry and emit activity plus attempt evidence.
- Q7: Governance block/defer decisions do not acquire active claims; they persist reconciliation evidence instead.
- Q8: SPEC-013B protects the existing dispatch boundary and does not add runner or harness behavior.
- Q9: Operator-facing surface is API/debug evidence only; no new primary UI.
- Q10: UAT proof is a concurrent scheduler tick replay with exactly one claim/launch path and release on terminal/gated state.
- Q11: Eligible task state is only `assigned`.
- Q12: Claim lease covers the launch critical section only, not entire agent execution.
- Q13: Code ownership belongs in a new narrow claim/reconciliation module called by dispatch.
- Q14: Stale or unresolved GitHub truth defers claim and records reconciliation evidence.
- Q15: Manual release/retry/cancel controls are out of scope and reserved for SPEC-013C.
- Q16: Verification requires focused concurrency/reconciliation tests plus full repo gates.

### External Context Fetch Requirement

Future agents must not rely on built-in model knowledge for OpenAI Harness Engineering or Symphony. Before Specify, Plan, Analyze, or implementation decisions that touch orchestration, workspace ownership, claims, retries, observability, or Codex agent integration, fetch these current external sources into the active context window and cite the retrieval date in generated artifacts:

- OpenAI Harness Engineering: `https://openai.com/index/harness-engineering/`
- OpenAI Symphony announcement: `https://openai.com/index/open-source-codex-orchestration-symphony/`
- OpenAI Symphony SPEC: `https://github.com/openai/symphony/blob/main/SPEC.md`

Use the external context only to inform SPEC-013B boundaries: repository-local knowledge as the system of record, explicit workflow/config contracts, per-workspace/per-issue isolation, scheduler preflight/reconciliation, Codex protocol/source-of-truth separation, event/observability extraction, and human-readable status as non-authoritative. Do not import Symphony runner, Linear, sandbox, retry UI, harness adapter, or long-running execution behavior into SPEC-013B.

### Success Criteria Summary

- [x] With `FEATURE_TASK_CONTROL_PLANE=false`, legacy scheduler and dispatch behavior remain unchanged.
- [x] With `FEATURE_TASK_CONTROL_PLANE=true`, two concurrent scheduler ticks cannot both claim and launch the same GitHub-linked task stage.
- [x] Only `assigned` tasks with `github_repo` and `github_issue_number` tied to a sync-enabled project/workspace enter autonomous claim intake.
- [x] Reconciliation checks task terminal state, GitHub truth freshness/terminal state, workflow stage, and governance readiness before active claim acquisition.
- [x] Governance block/defer and stale/unresolved GitHub truth record structured reconciliation evidence without acquiring an active claim.
- [x] Active claims have launch-critical-section lease ownership, expiry, stale recovery, and durable release evidence.
- [x] Claim evidence links to SPEC-013A task-stage attempts without overloading passive attempt rows as locks.
- [x] `advanceTaskChain` remains successor-selection authority and resource governance is not bypassed.
- [x] No manual retry/release/cancel UI, sandbox lifecycle, harness adapter, full runner abstraction, auto-merge, or automatic triage behavior is introduced.
- [ ] Post-merge HITL UAT proves concurrent scheduler tick replay, exactly one active claim/launch path, and release on terminal/gated state.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/013b-claim-reconciliation/spec.md`.

### Specify Prompt

```bash
$speckit-specify

GIT_BRANCH_NAME=013b-claim-reconciliation
SPECIFY_FEATURE_DIRECTORY=specs/013b-claim-reconciliation

## Feature: SPEC-013B - Claim and Reconciliation Authority

### Problem Statement
Mission Control can sync GitHub issues, route tasks, persist task-stage attempts, and dispatch assigned tasks, but it does not yet have one authoritative coordination path that prevents duplicate scheduler dispatch for the same GitHub-linked task stage. SPEC-013B must add claim and reconciliation authority before retry/debug surfaces and harness execution specs build on top of it.

### Users
- Operators who need confidence that concurrent scheduler ticks do not launch duplicate autonomous work.
- Future SPEC-013C and SPEC-014 implementers who need a reliable already-claimed stage boundary.
- Reviewers validating that Mission Control preserves tracker truth, resource governance, and successor-selection boundaries.

### Goals
- Prevent duplicate launch for the same GitHub-linked task stage under concurrent scheduler ticks.
- Reconcile Mission Control task state, GitHub truth, workflow stage, and governance readiness before active claim acquisition.
- Persist active claim and release evidence linked to SPEC-013A task-stage attempts.
- Admit only GitHub issue-linked `assigned` tasks into autonomous claim intake.
- Preserve existing dispatch and successor-selection authority instead of replacing the runner path.

### Non-goals
- No sandbox lifecycle, harness adapter, fake runner, real runner, OpenClaw/external adapter, or long-running execution ownership.
- No manual retry/release/cancel controls or primary UI/dashboard.
- No claim intake for local-only, repo-only, or arbitrary non-terminal tasks.
- No automatic triage, auto-merge, Issue Remediation execution, or `advanceTaskChain` duplication.
- No use of passive `task_stage_attempts.status = running` as the active claim lock.

### Scope Requirements
- Use `FEATURE_TASK_CONTROL_PLANE` through `resolveFlag` and keep flag-off behavior byte-compatible for legacy dispatch.
- Add an additive active-claim persistence model only if Plan confirms it is necessary; if added, include rollback SQL and rerun-safe migration tests.
- Enforce one active claim per `(workspace_id, task_id, stage_key)` with a database-backed uniqueness mechanism.
- Reconcile before claim inside one bounded transaction.
- Release or defer claims when task/GitHub state is terminal, governance blocks/defers, stale GitHub truth is detected, or launch handoff completes.
- Emit structured activities and task-stage attempt lifecycle events for claim, release, stale recovery, and reconciliation deferral decisions.
- Keep `src/lib/task-dispatch.ts` as the existing launch boundary, with a new narrow claim/reconciliation helper module owning the authority.

### UAT
Post-merge HITL UAT must enable `FEATURE_TASK_CONTROL_PLANE` for one product-line workflow, seed or identify one GitHub issue-linked `assigned` task, run concurrent scheduler ticks, verify exactly one claim/launch path, then verify release on terminal/gated state and no duplicate launch.

### Design Concept
Use `docs/ai/specs/SPEC-013B-design-concept.md` as the source of truth for setup-time decisions, especially Q1-Q16.

### External Context
OpenAI Harness Engineering, the OpenAI Symphony announcement, and `openai/symphony` `SPEC.md` were fetched on 2026-05-27. Use them only to preserve agent-first orchestration boundaries: repository-local context as the system of record, explicit workflow/config contracts, scheduler preflight/reconciliation, per-workspace/per-issue isolation concepts, Codex protocol source-of-truth separation, and observability/status as non-authoritative evidence. Do not add Symphony runner, Linear, sandbox lifecycle, retry UI, harness adapter, or long-running execution behavior.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 19 |
| User Stories | 4 |
| Acceptance Criteria | 12 |
| Success Criteria | 7 |

### Files Generated

- [x] `specs/013b-claim-reconciliation/spec.md`
- [x] `specs/013b-claim-reconciliation/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, before Plan. Use at most 5 targeted questions per session.

### Clarify Prompts

#### Session 1: Claim Schema and Lease Semantics

```bash
$speckit-clarify

Focus on SPEC-013B active claim persistence:
- Exact table name, columns, and relationship to `task_stage_attempts`.
- Partial unique active-claim constraint for `(workspace_id, task_id, stage_key)`.
- Lease owner/run metadata, expiry, stale recovery, and launch-critical-section duration.
- Release evidence for normal handoff, terminal state, governance block/defer, and stale recovery.
- Pay special attention to: preserving SPEC-013A's passive attempt lifecycle while adding active claim authority.
```

#### Session 2: GitHub and Task Eligibility

```bash
$speckit-clarify

Focus on SPEC-013B eligibility and reconciliation:
- `assigned` task state only.
- Required GitHub issue-linked fields: `github_repo`, `github_issue_number`, sync-enabled project/workspace.
- Stale or unresolved GitHub truth sources and thresholds.
- Terminal GitHub issue/PR states that defer or release claims.
- Pay special attention to: local-only tasks remain visible but never enter autonomous claim intake.
```

#### Session 3: Dispatch/Governance Integration

```bash
$speckit-clarify

Focus on existing scheduler and dispatch boundaries:
- Where `dispatchAssignedTasks` calls the new claim/reconciliation module.
- How governance allow/block/defer decisions are represented before claim acquisition.
- How `advanceTaskChain` remains successor-selection authority.
- How flag-off parity is proven.
- Pay special attention to: no duplicate successor selection, no governance bypass, and no SPEC-014 runner abstraction.
```

#### Session 4: Evidence and Operator Inspection

```bash
$speckit-clarify

Focus on read-only evidence requirements:
- Structured activity types and payloads for claim, release, stale recovery, and reconciliation deferral.
- Task-stage attempt lifecycle events and metadata.
- API/read-model placement without adding manual controls or primary UI.
- UAT evidence fields needed to prove exactly one claim/launch path.
- Pay special attention to: manual release/retry/cancel controls are SPEC-013C, not SPEC-013B.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Claim schema and lease semantics | 5 | `task_stage_claims`, active partial unique index, 300s/600s launch lease, release reasons, stale recovery CAS |
| 2 | GitHub and task eligibility | 5 | Assigned/assignee plus issue-linked intake, task `github_synced_at` freshness, lifecycle health, terminal GitHub states, no local-only launch |
| 3 | Dispatch/governance integration | 5 | `dispatchAssignedTasks` per-task integration, pre-claim governance, no `advanceTaskChain`/`createTask`, flag-off parity |
| 4 | Evidence and operator inspection | 5 | Activity taxonomy, attempt event mapping, `task_claim_reconciliation.v1` read model, UAT replay envelope, payload allowlist |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Generates technical implementation blueprint. Output: `specs/013b-claim-reconciliation/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node >=22 with Next.js 16 App Router and React 19.
- Language: TypeScript 5.7 strict for new SPEC-013B modules.
- Database: SQLite through `better-sqlite3` and forward-only `src/lib/migrations.ts`.
- Feature flags: `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` only; no inline env checks.
- Tests: Vitest for helpers/dispatch/migrations, Playwright only if existing UI changes, full pnpm gates before PR packaging.

## Architecture Notes
- Read `docs/ai/specs/SPEC-013B-design-concept.md` before planning.
- Reuse `src/lib/task-stage-attempts.ts` for attempt evidence but do not make passive attempt status the active claim lock.
- Add a new narrow module such as `src/lib/task-claim-reconciliation.ts` for eligibility, reconciliation, claim acquisition, release, stale recovery, and evidence writes.
- Integrate through the existing assigned-task launch boundary in `src/lib/task-dispatch.ts`.
- Keep `src/lib/scheduler.ts` thin; it should not own claim semantics.
- Preserve `advanceTaskChain` as successor-selection authority.
- Do not add harness, sandbox, runner, adapter, manual controls, auto-merge, or automatic triage behavior.

## Required Live Evidence
- Cite `src/lib/task-dispatch.ts` for the current assigned-task launch boundary.
- Cite `src/lib/scheduler.ts` for scheduled task invocation.
- Cite `src/lib/task-stage-attempts.ts` and migration `076_task_stage_attempts` for attempt spine behavior.
- Cite SPEC-013A1 GitHub sync lifecycle state only where current GitHub truth is consumed; do not duplicate poller lifecycle.
- Cite resource-governance APIs used by dispatch before adding any reconciliation wrapper.

## Migration Requirements
- If an active claim table is added, use the next migration id after live `src/lib/migrations.ts`.
- Include idempotent forward migration tests and `docs/migrations/rollback-M<id>.sql`.
- Add the isolated SPEC-013B claim module and pure helper tests to `tsconfig.spec-strict.json`; add all SPEC-013B TS/TSX files to `eslint.config.mjs`.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, architecture, strict scope, and M78 migration plan |
| `research.md` | Complete | Claim/reconciliation decisions |
| `data-model.md` | Complete | Claim table, state machine, evidence, and read model |
| `contracts/` | Complete | Read-only claim evidence API/read-model and module contract |
| `quickstart.md` | Complete | Focused verification and UAT replay |

---

## Phase 4: Domain Checklists

**When to run:** After `$speckit-plan`, validating both spec and plan.

### Recommended Checklist Domains

#### 1. Scheduler Runtime Checklist

```bash
$speckit-checklist scheduler-runtime

Focus on SPEC-013B requirements:
- Concurrent scheduler ticks cannot both claim and launch the same GitHub-linked task stage.
- Reconciliation-before-claim happens in one bounded transaction.
- Claim lease covers only the launch critical section.
- `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy scheduler/dispatch behavior unchanged.
- Pay special attention to: the implementation protects the existing dispatch boundary without creating a runner abstraction.
```

#### 2. Data Integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-013B requirements:
- Active claim persistence is additive and rollback-documented.
- Database-level uniqueness enforces one active claim per `(workspace_id, task_id, stage_key)`.
- Stale recovery and release semantics cannot leave orphan active claims.
- Claim evidence links to task-stage attempts without overloading passive attempt rows.
- Pay special attention to: SQLite partial unique index semantics and idempotent migration behavior.
```

#### 3. API Contracts Checklist

```bash
$speckit-checklist api-contracts

Focus on SPEC-013B requirements:
- Any read-only claim/reconciliation evidence route has explicit request/response shape.
- Error/deferral categories distinguish stale GitHub truth, governance block/defer, duplicate active claim, stale recovery, and flag-off state.
- No write controls are exposed for manual release/retry/cancel.
- Pay special attention to: preserving existing task evidence and GitHub sync API behavior.
```

#### 4. State Management and Reliability Checklist

```bash
$speckit-checklist state-management

Focus on SPEC-013B requirements:
- Claim lifecycle states, lease expiry, release reasons, and stale recovery are measurable and serializable.
- Reconciliation deferrals are durable and not silent.
- Terminal Mission Control and GitHub states release active claims.
- Pay special attention to: not extending claim ownership into long-running SPEC-014 harness execution.
```

#### 5. Security and Error Handling Checklist

```bash
$speckit-checklist security

Focus on SPEC-013B requirements:
- Feature flag resolution uses `resolveFlag` only.
- GitHub/task identifiers are validated and never used to leak secrets.
- Structured activities redact unsafe payloads and classify boundary errors.
- Pay special attention to: concurrent/retry errors do not crash scheduler ticks or bypass governance.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| scheduler-runtime | 30 | 0 open | `specs/013b-claim-reconciliation/checklists/scheduler-runtime.md` |
| data-integrity | 15 | 0 open | `specs/013b-claim-reconciliation/checklists/data-integrity.md` |
| api-contracts | 20 | 0 open | `specs/013b-claim-reconciliation/checklists/api-contracts.md` |
| state-management | 18 | 0 open | `specs/013b-claim-reconciliation/checklists/state-management.md` |
| security | 30 | 0 open | `specs/013b-claim-reconciliation/checklists/security.md` |
| **Total** | 113 | 0 open | Final `count-markers.sh all specs/013b-claim-reconciliation` returned 0 gaps, 0 clarifications, 0 critical/high/medium/low markers |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/013b-claim-reconciliation/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure
- Use small, testable TDD tasks.
- Start each behavior-changing task with a failing test.
- Organize by independently verifiable claim/reconciliation user stories.
- Reference `docs/ai/specs/SPEC-013B-design-concept.md`, `spec.md`, and `plan.md`.
- Use the Design Concept Non-goals to block scope drift.

## Required Task Areas
1. Foundation: strict-scope config, fixtures, migration/rollback if needed.
2. Claim model: active claim table/helper, uniqueness, lease, release, stale recovery.
3. Eligibility/reconciliation: issue-linked `assigned` tasks, stale GitHub truth, terminal task/GitHub release, governance block/defer.
4. Dispatch integration: existing assigned-task boundary, flag-off parity, no `advanceTaskChain` duplication.
5. Evidence/read model: structured activities, attempt lifecycle metadata, optional read-only API evidence.
6. Verification: focused concurrency tests, focused dispatch tests, guardrails, full repo gates, UAT replay guide.

## Constraints
- Do not add sandbox, harness, adapter, runner, manual release/retry/cancel controls, primary UI/dashboard, auto-merge, automatic triage, or Issue Remediation execution.
- Do not make `task_stage_attempts.status = running` the active claim lock.
- Do not admit local-only tasks into autonomous claim intake.
- Add every new TS/TSX module to `eslint.config.mjs`, and add the isolated SPEC-013B claim module plus pure helper tests to `tsconfig.spec-strict.json`. The read-only route and dispatch integration tests are covered by the main repo typecheck/lint/build/test gates because importing them into the declaration-only strict project pulls the existing auth/db/scheduler/GitHub runtime graph outside SPEC-013B ownership.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 57 |
| Phases | 7 |
| Parallel Opportunities | 23 |
| User Stories Covered | 4 |
| Reviewability Gate | `status=exception`, `pass=true`, `transition_exception=true` |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks to catch inconsistencies before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Focus on SPEC-013B cross-artifact consistency:
1. Design concept alignment - verify Q1-Q16 decisions are preserved in spec.md, plan.md, and tasks.md.
2. Constitution alignment - especially feature-flag, additive migration, auditability, TDD, reviewability, and successor-side-effect parity.
3. Scope boundaries - block retry/release/cancel UI, sandbox lifecycle, harness adapters, primary dashboard, auto-merge, automatic triage, or successor-selection drift.
4. Claim correctness - one active claim per GitHub-linked task stage, reconciliation-before-claim, launch-critical-section lease, stale recovery, terminal/gated release.
5. Verification coverage - focused tests for concurrency, stale recovery, governance block/defer, GitHub-linked eligibility, flag-off legacy behavior, plus full repo gates.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| AN-001 | Critical | Strict-scope file list omitted `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`, leaving fixture coverage outside TypeScript and lint scope. | Added the fixture file to `plan.md`, project structure, and T002/T003 strict-scope setup tasks. |
| AN-002 | High | `not_claimable` read-model/API outcome lacked matching structured activity evidence. | Added `task_stage_claim_not_claimable` taxonomy, contract mapping, data-model behavior, and dispatch/evidence tasks. |
| AN-003 | High | Terminal passive attempt lifecycle states did not have an explicit active-claim release reason. | Added `attempt_terminal_reconciled` as a closed release reason for linked passive attempt states `succeeded`, `failed`, `released`, and `cancelled`. |

📊 Confidence: 0.92

- Task understanding: 0.95
- Approach clarity: 0.91
- Requirements alignment: 0.93
- Risk assessment: 0.89
- Completeness: 0.92

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no blocking findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task:
1. RED: Write failing focused test for the claim/reconciliation invariant.
2. GREEN: Implement the minimum code to pass.
3. REFACTOR: Keep the narrow module boundaries clear.
4. VERIFY: Run the focused test and update task evidence.

## Pre-Implementation Setup
1. Verify branch: `git rev-parse --abbrev-ref HEAD` must be `013b-claim-reconciliation`.
2. Confirm package manager from lockfile: `pnpm-lock.yaml` means pnpm.
3. Run focused baseline tests selected by the plan.
4. Confirm `FEATURE_TASK_CONTROL_PLANE=false` behavior before adding runtime changes.

## Verification Requirements
- Focused claim/reconciliation tests for:
  - duplicate concurrent scheduler ticks;
  - active claim uniqueness;
  - stale lease recovery;
  - governance block/defer no-claim evidence;
  - stale/unresolved GitHub truth deferral;
  - terminal task/GitHub release;
  - flag-off legacy dispatch parity.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Focused dispatch/scheduler tests
- `pnpm test:all` before PR packaging
- `git diff --check`

## UAT
Document a post-merge HITL replay:
- Enable `FEATURE_TASK_CONTROL_PLANE` for one product-line workflow.
- Seed or identify one GitHub issue-linked `assigned` task.
- Run concurrent scheduler ticks.
- Verify exactly one claim/launch path.
- Verify terminal/gated release.
- Verify no duplicate launch and no local-only task intake.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Foundation | Complete | 5/5 | Strict-scope/lint ownership, fixtures, rollback, and reviewability scope are recorded |
| 2 - Claim model | Complete | 5/5 | M78 migration/rollback and migration tests cover table shape, uniqueness, release vocabulary, idempotency, and rollback |
| 3 - Reconciliation | Complete | 20/20 | Claim acquisition, duplicate prevention, stale recovery, GitHub truth, governance, terminal reconciliation, and boundary deferral are covered |
| 4 - Dispatch integration | Complete | 10/10 | `dispatchAssignedTasks` now calls the claim seam before launch and preserves flag-off legacy behavior |
| 5 - Evidence/read model | Complete | 10/10 | Structured activities, safe metadata, bounded read model, API index, and OpenAPI route are implemented |
| 6 - Verification and UAT | Complete | 7/7 | Focused Vitest, `pnpm test:all`, rollback notes, and post-merge HITL UAT replay instructions are recorded |

---

## Post-Implementation Checklist

- [x] All tasks marked complete in tasks.md.
- [x] Focused concurrency/reconciliation tests pass.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm build` passes.
- [x] `pnpm test:all` passes.
- [x] `git diff --check` passes.
- [x] Reviewability diff gate passes or records accepted exception.
- [x] Roadmap, workflow, API index/OpenAPI if touched, migration rollback docs, and UAT checklist are synchronized.
- [x] PR review packet documents scope, non-goals, verification, rollback, feature flag, and UAT.
- [x] Codex autopilot early-completion failure mode is tracked and prevented by a plugin-repo PR.
- [ ] Post-merge HITL UAT evidence is recorded before status moves to Complete.

Implementation evidence was recorded on 2026-05-27. `direnv exec . pnpm test:all` passed in package-script order: strict-scope, lint, typecheck, 304 Vitest files with 3167 passed tests, production build, and 651 Playwright tests. The final status intentionally leaves post-merge HITL UAT open because this branch has not been merged and replayed on the target environment.

### Post-Implementation Evidence

- Doctor extension check: skipped because `.specify/scripts/bash/doctor.sh` is not present in this repository.
- Verify implementation: passed through focused Vitest, `pnpm typecheck`, and final full `pnpm test:all`.
- Verify tasks phantom check: passed; `specs/013b-claim-reconciliation/verify-tasks-report.md` verifies 57/57 tasks with 0 blockers.
- Code review: final retry-admission finding was fixed before packaging; regression coverage proves a released `dispatch_failed` passive attempt does not suppress the next retry claim.
- Cleanup: no blockers found and no cleanup-only file edits were required.
- Integration suite: passed through `direnv exec . pnpm test:all`, including 3167 Vitest tests and 651 Playwright tests.
- Reviewability diff gate: ratified transition exception for the full SPEC-013B branch diff; patched gate output reports `status=exception`, `pass=true`, 6560 reviewable LOC, 14 production files, 63 total files, and 6 primary surfaces.
- PR body generation: completed using the host repository PR template plus the SpecKit review packet.
- PR creation: opened ready-for-review PR #62, `https://github.com/racecraft-lab/mission-control/pull/62`.
- Review remediation: initial PR inspection found no comments or reviews to remediate; GitHub checks were still pending and visual Playwright approval was marked missing while the companion visual report job was still in progress.
- Retrospective: completed in `specs/013b-claim-reconciliation/retrospective.md`; no spec edits proposed, 57/57 tasks verified, and post-merge HITL UAT remains the only UAT gate.
- Plugin autopilot safety: `racecraft-plugins-public` PR #93 was merged to prevent Codex autopilot from ending before PR creation and post-phase completion in future runs; PR #95 is open for the reviewability-gate false-block fix discovered during this packaging pass.

### Self-Review

1. Tests executed: yes. Final verification ran `direnv exec . pnpm test:all` with strict-scope, lint, typecheck, Vitest, production build, and Playwright all passing; focused SPEC-013B Vitest passed 4 files and 27 tests; `git diff --check` passed.
2. Edge cases covered: eligibility and non-claimable tasks, local-only/repo-only exclusion, duplicate active-claim prevention, SQLite constraint races, stale leases, stale GitHub truth, SPEC-013A1 lifecycle readiness, governance allow/block/defer, terminal task/GitHub/attempt release, dispatch boundary errors, release compare failures, and read-only route side-effect safety.
3. Requirements matched: FR-001 through FR-020 are implemented through T001 through T057, and the verify-tasks report confirms 57/57 completed tasks with no phantom completions or blockers.
4. Follow-up: post-merge HITL UAT remains intentionally open until the branch lands and a target-environment concurrent scheduler replay can be recorded.

---

## Project Structure Reference

```text
src/lib/task-dispatch.ts              Existing assigned-task dispatch and `advanceTaskChain`
src/lib/scheduler.ts                  Existing scheduler task invocation
src/lib/task-stage-attempts.ts        SPEC-013A passive attempt spine
src/lib/github-sync-lifecycle*.ts     SPEC-013A1 sync lifecycle state and evidence
src/lib/migrations.ts                 Forward-only SQLite migrations
docs/migrations/rollback-M*.sql       Manual rollback SQL
docs/ai/specs/                        Workflow and design concept ledgers
specs/013b-claim-reconciliation/      Generated SpecKit artifacts
tests/ and src/lib/__tests__/         Focused Vitest coverage
```

---

## Lessons Learned

### What Worked Well

- A narrow claim/reconciliation module kept scheduler authority isolated from successor selection, runner, sandbox, and retry surfaces.
- The existing SPEC-013A passive attempt spine worked as evidence linkage without becoming the active lock.
- Running `direnv exec .` preserved the repo-pinned Node.js v22.22.2 runtime and avoided the local Node 26 `better-sqlite3` ABI path.

### Challenges Encountered

- Codex subagent spawning hit the session/thread limit during implementation. The run continued in the parent Codex session to avoid more child-agent churn.
- A sandboxed production build failed with Turbopack `Operation not permitted`; the same `pnpm build` step passed outside the sandbox, matching the known repository sandbox caveat.
- Legacy test fixtures do not always include newer task projection columns. The claim reader now selects `tasks.*` broadly and treats optional GitHub projection fields defensively.

### Patterns to Reuse

- Keep control-plane claims as a short launch-critical-section lease, not a long-running execution lock.
- Encode every claim/release/deferral outcome as closed enums with durable structured activity evidence.
- Keep read-only evidence routes side-effect free and verify row counts before/after route GETs.
