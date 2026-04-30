# SpecKit Workflow: SPEC-004 - Task Pipeline Engine and Declarative Routing

**Template Version**: 1.0.0
**Created**: 2026-04-30
**Purpose**: Prepare and execute the RC Factory Phase 3 task pipeline engine specification in Codex.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `004-task-pipeline-engine`.

Run the phases through `$speckit-autopilot` after reviewing the prompts:

```bash
$speckit-autopilot docs/ai/specs/SPEC-004-workflow.md
```

Autopilot must begin with Archive Sweep discovery before normal prerequisites. The sweep handles previously merged specs only (`SPEC-001`, `SPEC-002`, `SPEC-002A`, and `SPEC-003`), excludes `SPEC-004`, and must stay dry-run-only or stop unless the branch is clean and safe cleanup has been explicitly recorded.

Do not start downstream specs from this worktree. SPEC-004 stops after the feature-flagged task pipeline engine, shared task creation helper, constrained output-schema validator, safe routing-rule evaluator, workflow-template UI, documentation refresh, verification, and roadmap bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Pending | Must dry-run or record safe archive state; `SPEC-004` is excluded |
| Specify | `$speckit-specify` | Pending | Generate `specs/004-task-pipeline-engine/spec.md` from this workflow |
| Clarify | `$speckit-clarify` | Pending | Resolve task creation parity, safe evaluation, scheduler, and downstream boundaries |
| Plan | `$speckit-plan` | Pending | Generate plan, research, data model, contracts, and quickstart |
| Checklist | `$speckit-checklist` | Pending | Run data-integrity, safe-evaluation, scheduler-safety, and regression-safety domains |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered tasks covering P3-AC1 through P3-AC12 |
| Analyze | `$speckit-analyze` | Pending | Confirm no CRITICAL/HIGH issues before implementation |
| Implement | `$speckit-implement` | Pending | Execute TDD implementation with full verification and guardrails |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-004` cleanup occurs |
| G1 | After Specify | Requirements define flag-off behavior, null-default safety, task creation parity, schema validation, routing, successor creation, template UI, and documentation refresh with no unresolved markers |
| G2 | After Clarify | Ambiguities in createTask side effects, validation bounds, safe evaluator grammar, scheduler hook, UI edits, and downstream boundaries are resolved |
| G3 | After Plan | Constitution gates pass; strict scope, dependencies, implementation seams, tests, and rollback strategy are concrete |
| G4 | After Checklist | All data-integrity, safe-evaluation, scheduler-safety, and regression-safety gaps are resolved |
| G5 | After Tasks | P3-AC1 through P3-AC12 have task coverage and dependency order is implementable |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-005, SPEC-007, SPEC-008, SPEC-009, or SPEC-011 behavior |
| G7 | After Implement | Focused tests, typecheck, lint, build, e2e or justified subset, guardrail greps, docs status, and branch push are complete |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md`, `docs/rc-factory-v1-prd.md`, and `docs/ai/rc-factory-technical-roadmap.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Spec execution order | `SPEC-001`, `SPEC-002`, `SPEC-002A`, and `SPEC-003` are complete on `main` before this worktree starts | Roadmap and current `origin/main` show prior specs complete |
| Feature-flag default OFF | `FEATURE_TASK_PIPELINES=false` preserves current task completion behavior | Focused scheduler and task-completion regression tests |
| Null-default safety | With flag ON, unbound tasks and workflow-template chain fields that are all NULL behave like flag OFF | Scheduler tests for unbound tasks and NULL chain fields |
| Shared task creation | All production task creation routes through `src/lib/task-create.ts`; direct runtime `INSERT INTO tasks` outside that helper is forbidden | Unit/integration tests plus ripgrep guardrail over production source, excluding intentional test fixtures |
| Safe evaluation | `routing-rule-evaluator.ts` and `output-schema-validator.ts` operate over untrusted agent output without unsafe primitives, unsafe AJV options, unbounded schemas, or unbounded synchronous routing work | Adversarial fixtures, pre-validation cap fixtures, safe-regex checks, exact runtime dependency pin checks, `pnpm audit --audit-level high`, and forbidden-primitive greps |
| Strict scope ramp | New production modules are limited to `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts` unless plan evidence justifies more | `tsconfig.spec-strict.json` and `eslint.config.mjs` updated for new modules |
| Package manager | Use pnpm only | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands |
| Archive Sweep | Archive discovery runs before Phase 0/prerequisites and excludes the current target | Archive report records candidates and `safeToApplyCleanup` state |

**Constitution Check:** Pending. Verify at Phase 1 start.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this workflow:

- Previous merged candidates: `SPEC-001`, `SPEC-002`, `SPEC-002A`, and `SPEC-003`.
- Current target excluded: `SPEC-004` / `specs/004-task-pipeline-engine`.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records `safeToApplyCleanup=true`, archive success, merge/tree references, and recovery commands.
- No source spec folder is deleted silently by setup or by this workflow.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-004 |
| Name | Task Pipeline Engine and Declarative Routing |
| Branch | `004-task-pipeline-engine` |
| Dependencies | SPEC-001, SPEC-002, SPEC-002A, SPEC-003 |
| Enables | SPEC-005, SPEC-007, SPEC-008, SPEC-009 |
| Priority | P1 |
| Tool count / tool names | N/A; this is not a tool-surface spec |
| Tool metadata | `tools: []` |
| Strict Scope | New production modules: `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`; existing files touched only for Phase 3 routing, scheduler, template UI, route migration, docs, tests, and strict-scope config |
| Status Authority | Roadmap + this workflow are execution-status authority |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement RC Factory Phase 3:

- Add feature-flagged task-chain behavior over the existing `workflow_templates` table.
- Do not create or reference a `task_templates` SQL table.
- Extract a shared `createTask()` helper in `src/lib/task-create.ts` and migrate the current direct task INSERT callsites to it.
- Add server-side output schema validation in `src/lib/output-schema-validator.ts` using exact pinned runtime `ajv` and `safe-regex`, with the constrained AJV safety profile and conservative pattern subset from the roadmap.
- Add a safe routing-rule evaluator in `src/lib/routing-rule-evaluator.ts` using exact pinned runtime `jsonpath-plus` with JavaScript execution disabled, pre-validation caps, and a hand-written parser for an allowlisted boolean grammar.
- Add `advanceTaskChain` behavior at every live non-`done` to `done` transition for pipeline-bound tasks that reads structured output from `tasks.resolution`, validates it, evaluates routing rules, falls back to `next_template_slug`, creates a successor task through `createTask()`, stalls automated advancement with activity evidence on deterministic routing failures, or terminates the chain normally.
- Extend the live workflow-template editor in `src/components/panels/orchestration-bar.tsx`, plus `/api/workflows` persistence and create/update workflow schemas, to edit `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`, enforce that `routing_rules` require `output_schema`, allow static `next_template_slug` without schema, and preserve the `DELETE /api/workflows?id=...` UI/API contract.
- Update `docs/orchestration.md` before Phase 3 is considered shipped.

### Known Reference Surface

- `src/app/api/tasks/route.ts` - current task creation route, direct INSERT callsite, bulk update route, and terminal status update surface.
- `src/app/api/tasks/[id]/route.ts` - detail update route and terminal status update surface.
- `src/app/api/github/route.ts` - GitHub issue ingestion task creation callsite.
- `src/lib/github-sync-engine.ts` - sync-created task callsite and outbound push semantics.
- `src/lib/recurring-tasks.ts` - recurring task creation callsite.
- `src/lib/task-dispatch.ts` - task dispatch, Aegis review, terminal success transition, and target location for `advanceTaskChain`.
- `src/app/api/quality-review/route.ts` - operator-approved terminal success transition that must trigger chain advancement idempotently.
- `src/components/panels/orchestration-bar.tsx` - live workflow-template editor UI.
- `src/app/api/workflows/route.ts` and `src/lib/validation.ts` - workflow-template persistence, operator auth, and request validation.
- `src/lib/feature-flags.ts` - `resolveFlag()` from SPEC-002.
- `src/lib/aegis.ts` - global Aegis resolver from SPEC-003, which downstream review loops still use.
- `.github/workflows/quality-gate.yml` - CI quality gate that must run SPEC-004 dependency, audit, and static guardrail checks before merge.
- `docs/orchestration.md` - repository documentation that must describe declarative task chains before ship.

### Success Criteria Summary

- [ ] P3-AC1: With flag OFF, task completion behaves exactly as today; no chain advances regardless of workflow-template fields.
- [ ] P3-AC2: With flag ON, tasks without `workflow_template_id` OR with all new workflow-template fields NULL behave exactly like flag OFF.
- [ ] P3-AC3: With a bound workflow template, `output_schema`, and valid `tasks.resolution`, a successor task is created per `routing_rules` or `next_template_slug`; templates with `routing_rules` and no `output_schema` are rejected, while static `next_template_slug` without schema remains valid.
- [ ] P3-AC4: With missing `tasks.resolution` or invalid output under an `output_schema`, the parent task transitions to `failed`, activity is recorded, and no successor is created.
- [ ] P3-AC5: Routing evaluator rejects unsafe inputs without exception leaks or successor creation, rejects JSONPath filters/scripts before `JSONPath()`, enforces every routing pre-validation cap, and enforces `maxRuleEvalMs=10` triage fallback with activity evidence.
- [ ] P3-AC6: Successor task inherits workspace/project, initializes first-hop parent lineage when absent, resolves assignee via `project_agent_assignments.agent_name`, populates successor lineage fields, and stalls with activity evidence/no successor when no matching assignee exists.
- [ ] P3-AC6a: Successor creation calls `createTask()` exactly once, source-specific side effects are preserved, and direct runtime `INSERT INTO tasks` outside `src/lib/task-create.ts` is gone from production source.
- [ ] P3-AC7: Unit tests cover valid routing, missing output, invalid output, no-match fallback to static next, and chain termination.
- [ ] P3-AC8: `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies in `package.json` and `pnpm-lock.yaml`; SPEC-004 remediates the current high-severity audit baseline; CI guardrails run and passing `pnpm audit --audit-level high` evidence is recorded.
- [ ] P3-AC9: Validator enforces every numeric bound, forbidden schema feature, and AJV safety option listed in the roadmap.
- [ ] P3-AC10: Compiled validators cache per `(template_id, schema_sha256)` with LRU eviction at 256; p95 validation remains within the 50 ms budget over the fixed corpus; combined validation + routing + chain advancement overhead remains ≤50 ms p95 versus the flag-off/null-chain baseline.
- [ ] P3-AC11: `docs/orchestration.md` is updated in the SPEC-004 branch before Phase 3 is considered shipped.
- [ ] P3-AC12: A real running-app Playwright journey creates, edits, reads back, and deletes workflow-template chain fields in the live Workflows editor under operator auth, including `routing_rules`-requires-`output_schema` validation, static `next_template_slug` without schema, and the repaired `DELETE /api/workflows?id=...` query-parameter delete contract; component-only tests are insufficient.

---

## Phase 1: Specify

**When to run:** Start here. Output: `specs/004-task-pipeline-engine/spec.md`.

**Existing branch guard:** This workflow already runs on `004-task-pipeline-engine`. Before `$speckit-specify`, verify `git rev-parse --abbrev-ref HEAD` is `004-task-pipeline-engine`, set `GIT_BRANCH_NAME=004-task-pipeline-engine` and `SPECIFY_FEATURE_DIRECTORY=specs/004-task-pipeline-engine` if the executor supports them, and skip or run the `before_specify` git feature hook only in existing-branch mode (`--allow-existing-branch`). If the executor would create or switch to another branch, stop before Specify.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-004 Task Pipeline Engine and Declarative Routing

Create a specification for RC Factory Phase 3 in Mission Control.

### Problem Statement

Mission Control can currently create and complete single tasks, but it does not have a native task-chain engine that validates an agent's structured output and declaratively routes to the next workflow template. RC Factory v1 needs feature-flagged multi-stage task pipelines so an intake or triage task can deterministically produce a successor task while preserving existing single-agent task behavior when the flag is OFF or chain metadata is absent.

SPEC-001 already added the schema fields on `workflow_templates` and `tasks`. SPEC-002 added `resolveFlag()`. SPEC-003 made Aegis global enough for later Product Line workflows. SPEC-004 now implements the runtime engine over those existing surfaces.

### Users

- Existing Mission Control operator: needs current single-step tasks and task completion behavior preserved when `FEATURE_TASK_PIPELINES` is OFF.
- Facility operator: needs workflow templates that can declaratively route from one stage to the next without agents choosing their own successors.
- Agent/scheduler maintainer: needs validated structured output and deterministic failure behavior when output is malformed or unsafe.
- Downstream spec executor: needs `produces_pr`, task lineage, `advanceTaskChain`, and shared task creation before SPEC-005, SPEC-007, SPEC-008, and SPEC-009.

### User Stories

- US1: As an existing operator, I can leave `FEATURE_TASK_PIPELINES` OFF and observe no behavior change in task creation, completion, sync, notifications, subscriptions, ticket counters, or activities.
- US2: As an operator, I can configure a workflow template with `output_schema` plus `routing_rules`, or with static `next_template_slug` alone, so completed tasks create the correct successor only when the flag is enabled.
- US3: As a maintainer, I can rely on one `createTask()` helper for API, GitHub ingestion, sync, recurring tasks, and pipeline successor creation, preserving side effects without duplicated INSERT logic.
- US4: As a security reviewer, I can verify the routing evaluator and output-schema validator reject unsafe or oversized input without using unsafe evaluation primitives.
- US5: As a downstream spec executor, I can use task lineage fields to trace a chain and rely on `tasks.resolution` as the temporary structured-output bridge until SPEC-007 moves canonical handoff state to artifacts.

### Functional Requirements

- Add `FEATURE_TASK_PIPELINES` behavior through `resolveFlag(name, ctx)`; do not add inline `process.env.FEATURE_TASK_PIPELINES` reads.
- Treat `workflow_templates` as the live table. A task-chain template is a domain alias over `workflow_templates`, not a `task_templates` table.
- Preserve current task completion behavior with the flag OFF.
- Preserve current behavior with the flag ON when tasks are unbound or all chain fields are NULL.
- Add `src/lib/task-create.ts` exporting a shared `createTask()` helper that performs the existing task creation side effects: INSERT, ticket-counter allocation, activity row, creator subscription, mention/assignee notifications, GitHub push when enabled, and GNAP push when configured. The helper contract must preserve source-specific semantics for API creation, GitHub issue import, GitHub sync import, recurring tasks, and pipeline successors.
- Migrate direct task INSERT callsites in `src/app/api/tasks/route.ts`, `src/app/api/github/route.ts`, `src/lib/github-sync-engine.ts`, and `src/lib/recurring-tasks.ts` to `createTask()`.
- Add `src/lib/output-schema-validator.ts` using exact pinned runtime `ajv`; enforce the constrained Mission Control schema profile, every numeric bound from the roadmap, and the AJV safety profile: strict behavior, no data mutation/default insertion, no type coercion, no exhaustive error collection, `validateFormats=false`, `$data=false`, no direct SPEC-004 dependency/import/registration of `ajv-formats`, no custom formats/keywords/async schemas, and no schema `pattern`/`patternProperties` outside the conservative pattern subset.
- Add `src/lib/routing-rule-evaluator.ts` using exact pinned runtime `jsonpath-plus` with JavaScript execution disabled (`eval: false`, or `preventEval: true` on older supported APIs) and a hand-written parser for the allowlisted grammar. Reject JSONPath filters/script expressions before calling `JSONPath()` and enforce pre-validation caps before synchronous parse/traversal work: `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, and `maxLiteralBytes=32768`.
- Add `advanceTaskChain` behavior at every live non-`done` to `done` transition for pipeline-bound tasks (`runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`) that reads structured output from `tasks.resolution`, validates against `workflow_template.output_schema`, evaluates ordered `routing_rules`, falls back to `next_template_slug`, and terminates normally if neither route resolves. Manual/API completions remain allowed, but no live pipeline-bound `done` path may bypass the shared helper.
- Missing `tasks.resolution` or invalid structured output under an `output_schema` transitions the parent task to `failed`, records an activity, and creates no successor.
- Routing-rule budget overruns (`maxRuleEvalMs=10`) and missing/disabled/duplicate/cross-workspace target slugs stall automated chain advancement, leave the parent in its terminal success state, record an operator-visible activity with the structured failure reason, and create no successor. Manual operator triage owns recovery.
- Successor creation inherits `workspace_id` and `project_id`, resolves `assigned_to` via `project_agent_assignments.agent_name` and `workflow_template.agent_role`, initializes first-hop parent lineage when absent (`root_task_id = parent.id`, generated `chain_id`, `chain_stage = 0`), sets successor `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, and `chain_stage = parent.chain_stage + 1`, and calls `createTask()` exactly once. If no matching assignee exists for the resolved successor role, chain advancement stalls with operator-visible activity evidence, the parent remains in terminal success, and no successor is created.
- Extend `src/components/panels/orchestration-bar.tsx`, `src/app/api/workflows/route.ts`, and create/update workflow schemas in `src/lib/validation.ts` for task-chain fields: `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`; preserve existing operator-only write authorization for create/update/delete. `POST/PUT /api/workflows` must validate and persist every chain field, reject non-empty `routing_rules` unless `output_schema` is present, and allow `next_template_slug` without schema for static chaining. Repair workflow-template delete compatibility by making `DELETE /api/workflows?id=...` accept the existing live editor query-parameter contract. JSON `{ id }` body support may remain for backward compatibility, but the query-parameter delete path is required.
- Add `src/types/workflow-template.ts` for typed workflow-template chain metadata.
- Add exact pinned direct runtime dependencies for `ajv`, `jsonpath-plus`, and `safe-regex` in `package.json` and `pnpm-lock.yaml`, remediate the current high-severity audit baseline observed on 2026-04-30 (`minimatch`, `rollup`, `flatted`, `picomatch`, `defu`, and `next` advisories), wire `.github/workflows/quality-gate.yml` to run SPEC-004 guardrails and `pnpm audit:high`, and record passing `pnpm audit --audit-level high` evidence.
- Update `docs/orchestration.md` with feature-flagged declarative task-chain behavior and current lifecycle terminology before marking Phase 3 shipped.

### Constraints

- Use pnpm only.
- New production module strict scope is limited to `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts` unless plan evidence proves another new module is required.
- Do not add schema migrations unless live schema verification proves SPEC-001 fields are absent; if absent, stop and report the dependency mismatch.
- Do not create `task_templates`.
- Do not use `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, arithmetic or bitwise routing operators, regex right-hand sides, or operators outside the explicit allowlist.
- Do not implement SPEC-005 `ready_for_owner` runtime transitions, SPEC-006 area-label routing, SPEC-007 artifact publishing/dispositions, SPEC-008 governance enforcement, SPEC-009 pilot seed behavior, or SPEC-011 CrabTrap.

### Out of Scope

- `ready_for_owner` task state, PR merge transition, and GitHub ready labels.
- Area-label GitHub sync and repo-level sync ownership.
- Task artifact publish/read APIs, disposition UI, secret detector, artifact admin, and artifact handoff as canonical state.
- Resource governance evaluator and OpenClaw health cost adapter.
- Product Line A pilot seeding and Product Line B onboarding.
- Agents creating or modifying workflow templates.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | Pending |
| User Stories | Pending |
| Acceptance Criteria | 13 criteria: P3-AC1 through P3-AC12 including P3-AC6a |

### Files Generated

- [ ] `specs/004-task-pipeline-engine/spec.md`

### Traceability Markers

| Marker | Purpose |
|--------|---------|
| US1 | Flag-off and null-default zero regression |
| US2 | Operator-configured workflow template routing |
| US3 | Shared task creation side-effect parity |
| US4 | Safe evaluator and validator behavior |
| US5 | Downstream chain lineage and temporary `tasks.resolution` bridge |
| P3-AC1..P3-AC12 | Roadmap acceptance criteria |
| FR-FLAG | `FEATURE_TASK_PIPELINES` and `resolveFlag()` behavior |
| FR-CREATE | `createTask()` helper and migrated callsites |
| FR-VALIDATE | Output-schema validator requirements |
| FR-ROUTE | Routing evaluator and successor resolution |
| FR-UI | Workflow-template editor fields |
| FR-DOCS | `docs/orchestration.md` refresh |

---

## Phase 2: Clarify

**When to run:** After Specify if generated artifacts introduce ambiguity or drift. These sessions should encode the roadmap and PRD decisions, not reopen already-decided scope without evidence.

### Clarify Prompts

#### Session 1: Task Creation Parity and Side Effects

```bash
$speckit-clarify

Focus on SPEC-004 task creation parity:
- Confirm `createTask()` owns INSERT, ticket-counter allocation, activity logging, creator subscription, mention/assignee notifications, GitHub push when `github_sync_enabled` and `github_repo` are set, and GNAP push when configured.
- Confirm the four direct INSERT callsites to migrate: `src/app/api/tasks/route.ts`, `src/app/api/github/route.ts`, `src/lib/github-sync-engine.ts`, and `src/lib/recurring-tasks.ts`.
- Confirm successor creation calls `createTask()` exactly once and does not inline side effects.
- Define the `createTask()` input/output contract needed by API routes, GitHub issue import, GitHub sync import, recurring tasks, and `advanceTaskChain`; record a callsite behavior matrix so existing broadcast, notification, subscription, ticket-counter, and outbound-sync semantics do not drift.
- Confirm the ripgrep guardrail: zero runtime `INSERT INTO tasks` in production source outside `src/lib/task-create.ts` after implementation, with intentional test fixtures excluded or migrated deliberately.
```

#### Session 2: Safe Output Validation and Routing Evaluation

```bash
$speckit-clarify

Focus on SPEC-004 untrusted-output safety:
- Confirm `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies, not transitive imports or dev-only dependencies, and that SPEC-004 owns clearing the current high-severity `pnpm audit --audit-level high` baseline before merge.
- Encode every output-schema validator numeric bound: output 262144 bytes, schema 65536 bytes, depth 16, keys 256, array length 1024, string length 32768, pattern length 256, validation budget 50 ms, validator cache 256 entries.
- Confirm forbidden schema features and AJV behavior: remote `$ref`, `$dynamicRef`, `$dynamicAnchor`, custom keywords, custom formats, async schemas, `ajv-formats` direct dependency/import/registration in SPEC-004 validator code, format enforcement, patterns rejected by `safe-regex`, patterns outside the conservative subset (nested quantifiers, backreferences, lookaround, unbounded wildcards, ambiguous alternation), data mutation/default insertion, type coercion, exhaustive error collection, and `$data`.
- Confirm routing grammar: `==`, `!=`, `in`, `not in`, `&&`, `||`, `!`; JSONPath-Plus traversal with JavaScript execution disabled (`eval: false`, or `preventEval: true` on older supported APIs); literal string/number/boolean/array right sides.
- Confirm forbidden routing primitives and fixtures: `__proto__`, `constructor`, `Function`, global code-evaluation primitive, JSONPath filters/scripts rejected before `JSONPath()`, arithmetic, bitwise operators, right-side regex, malformed JSONPath, and oversized literal strings.
- Confirm routing pre-validation caps before synchronous parse/traversal work: `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, and `maxLiteralBytes=32768`.
- Confirm `maxRuleEvalMs=10` timeout behavior: over-budget rule evaluation stalls automated chain advancement, leaves the parent in its terminal success state, records an operator-visible activity with the structured reason, and creates no successor.
```

#### Session 3: Scheduler Integration, Template UI, and Downstream Boundaries

```bash
$speckit-clarify

Focus on SPEC-004 runtime integration:
- Confirm `FEATURE_TASK_PIPELINES=false` and flag ON with NULL chain fields preserve current completion behavior.
- Confirm `advanceTaskChain` reads structured output from `tasks.resolution` only as the Phase 3 bridge; SPEC-007 later owns canonical artifact handoff.
- Confirm `advanceTaskChain` hooks every live non-`done` to `done` transition for pipeline-bound tasks: Aegis approval in `runAegisReviews`, operator approval in `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`; duplicate successor creation is idempotently prevented, manual/API completions remain allowed, and no live pipeline-bound `done` path bypasses the shared helper.
- Confirm missing `tasks.resolution` or invalid output under an `output_schema` transitions parent task to `failed`, records activity, and creates no successor.
- Confirm missing, disabled, duplicate, or cross-workspace routing target slugs stall automated chain advancement deterministically with structured error/activity evidence, parent terminal-success preservation, and no successor.
- Confirm first-hop lineage initialization: if the parent has no lineage, update parent `root_task_id = parent.id`, generate `chain_id`, set parent `chain_stage = 0`, then create the successor with `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, and `chain_stage = 1`.
- Confirm assignee resolution uses `project_agent_assignments.agent_name` and `workflow_template.agent_role`, not imagined `agent_id` fields; missing assignee stalls chain advancement with activity evidence, parent terminal-success preservation, and no successor.
- Confirm live template editor fields in `src/components/panels/orchestration-bar.tsx`, `/api/workflows` persistence, create/update workflow schemas, `POST/PUT /api/workflows` validation/persistence of every chain field, rejection of `routing_rules` without `output_schema`, static `next_template_slug` without schema, repaired `DELETE /api/workflows?id=...` editor/API compatibility, and operator-only template ownership.
- Confirm downstream out-of-scope boundaries: no `ready_for_owner`, area labels, dispositions/artifacts, governance enforcement, pilot seed behavior, or CrabTrap.
- Confirm `docs/orchestration.md` must be updated before Phase 3 ships.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Task creation parity and side effects | Pending | Pending |
| 2 | Safe output validation and routing evaluation | Pending | Pending |
| 3 | Scheduler integration, template UI, and boundaries | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Output: `specs/004-task-pipeline-engine/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Framework: Next.js 16 App Router, React 19, TypeScript 5
- State/UI: Zustand and existing React/Tailwind component patterns
- Database: SQLite via `better-sqlite3`; SPEC-001 added task-chain columns and lineage fields
- Feature flags: `resolveFlag()` in `src/lib/feature-flags.ts`
- Scheduler/dispatch: `src/lib/task-dispatch.ts`, `src/app/api/quality-review/route.ts`, bulk `src/app/api/tasks/route.ts`, and detail `src/app/api/tasks/[id]/route.ts` terminal-success paths; inspect `src/lib/scheduler.ts` only if plan evidence proves it is part of completion flow
- Tests: Vitest, Playwright, TypeScript typecheck, ESLint
- Package manager: pnpm

## Constraints

- Strict Scope: new production modules are `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts`.
- Existing-file edits are expected in task creation routes, sync/recurring task creation, task dispatch/manual review hooks, bulk/detail task status routes, `orchestration-bar.tsx`, `/api/workflows`, `validation.ts`, strict-scope config, package manifests, tests, and `docs/orchestration.md`.
- Preserve flag-off behavior and null-default safety.
- Do not add new schema unless live schema verification proves SPEC-001 fields are absent; if absent, stop and report the dependency mismatch.
- Do not introduce `task_templates`.
- Do not implement downstream specs.

## Architecture Notes

- `workflow_templates` is the live table and the domain source for task-chain templates.
- `workflow_template_id` is the canonical task binding; `workflow_template_slug` is a denormalized snapshot.
- Parent output is read from `tasks.resolution` in SPEC-004 only as the temporary bridge before SPEC-007 artifact publishing.
- Successor task creation must be structurally side-effect-equivalent by calling `createTask()`.
- Routing evaluation and schema validation run on untrusted agent output and must be safe-by-construction.
- Workflow-template task-chain fields are edited through the live Workflows UI in `orchestration-bar.tsx` and persisted by `/api/workflows` with create/update workflow schemas. `POST/PUT /api/workflows` validates and persists every chain field, rejects `routing_rules` without `output_schema`, permits static `next_template_slug` without schema, and `DELETE /api/workflows?id=...` remains compatible with the live editor.
- `docs/orchestration.md` must describe both existing manual follow-up task patterns and the new feature-flagged declarative chain path.

## Verification Strategy

- Add focused Vitest tests for `createTask()` side effects and each migrated callsite.
- Add task-chain terminal-success tests for every live non-`done` to `done` route: flag OFF, flag ON with unbound tasks and NULL fields, valid routing, routing-rules-without-schema rejection, static `next_template_slug` without schema, missing output failure, invalid output failure, fallback to `next_template_slug`, missing/disabled/duplicate/cross-workspace target slug stall, missing-assignee stall, timeout stall, chain termination, duplicate-prevention, successor lineage, and assignee resolution.
- Add adversarial evaluator tests and validator bound tests, including JSONPath filter/script rejection before `JSONPath()`.
- Add exact runtime dependency pin, lockfile, CI quality-gate, audit-remediation, and `pnpm audit --audit-level high` checks for `ajv`, `jsonpath-plus`, and `safe-regex`.
- Add a real running-app Playwright journey for workflow-template chain-field create/edit/read/delete under operator auth; component-only tests may supplement but do not satisfy P3-AC12.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, focused Playwright or e2e checks for affected UI flows, and static guardrails.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | |
| `research.md` | Pending | |
| `data-model.md` | Pending | |
| `contracts/` | Pending | |
| `quickstart.md` | Pending | |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run the checklists below and resolve all genuine gaps before Tasks.

### 1. Data Integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-004 requirements:
- `workflow_templates`, not `task_templates`, is the live task-chain template surface.
- Existing SPEC-001 chain columns and task lineage fields are verified before use.
- First-hop parent lineage is initialized when absent before successor insert: parent `root_task_id = parent.id`, generated `chain_id`, and parent `chain_stage = 0`.
- Successor lineage fields are populated consistently: `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, and `chain_stage = parent.chain_stage + 1`.
- Assignee resolution uses `project_agent_assignments.agent_name` and `workflow_template.agent_role`, not imagined `agent_id` fields.
- Invalid output fails deterministically and does not create a successor.
- Pay special attention to null-default behavior, duplicate/missing template slug validation, missing/disabled/cross-workspace routing targets, no-match termination, and idempotent activity/state-transition records.
```

### 2. Safe Evaluation Checklist

```bash
$speckit-checklist safe-evaluation

Focus on SPEC-004 evaluator and validator safety:
- Output-schema validation enforces every numeric bound and forbidden schema feature.
- AJV is configured for strict behavior, no data mutation/default insertion, no type coercion, no exhaustive error collection, `validateFormats=false`, `$data=false`, no direct SPEC-004 dependency/import/registration of `ajv-formats`, and no custom formats/keywords/async schemas.
- `safe-regex` rejection is necessary but not sufficient for schema pattern safety; accepted schema `pattern`/`patternProperties` values also satisfy the conservative pattern subset and adversarial validation-time fixtures.
- Routing expressions use only the allowlisted grammar and JSONPath traversal with JavaScript execution disabled.
- JSONPath filters/script expressions are rejected before `JSONPath()` runs.
- Routing pre-validation caps are enforced before expensive synchronous parse/traversal work.
- No unsafe primitives appear in implementation: `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, arithmetic, bitwise operators, or right-side regex.
- `safe-regex` rejects unsafe patterns before validators are accepted, and accepted patterns still pass the conservative pattern-subset guard.
- Test fixtures cover malicious, malformed, oversized, timeout-budget, and valid cases without exception leaks.
```

### 3. Scheduler Safety Checklist

```bash
$speckit-checklist scheduler-safety

Focus on SPEC-004 scheduler behavior:
- Flag OFF preserves current task completion, sync, notification, subscription, and activity behavior.
- Flag ON with NULL chain fields preserves current behavior.
- `advanceTaskChain` runs at every live non-`done` to `done` transition for pipeline-bound tasks (`runAegisReviews`, operator `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`) and cannot create duplicate successors; manual/API completions remain allowed only through the shared helper.
- Routing evaluator budget overruns stall automated chain advancement with an operator-visible `activities` row and no successor.
- Successor creation calls `createTask()` exactly once.
- Scheduler behavior does not implement SPEC-005 `ready_for_owner`, SPEC-007 dispositions/artifacts, SPEC-008 governance, or SPEC-009 pilot behavior.
```

### 4. Regression Safety Checklist

```bash
$speckit-checklist regression-safety

Focus on SPEC-004 regression and dependency discipline:
- Existing task creation callsites keep their current API, GitHub, recurring, and sync semantics after moving to `createTask()`.
- Direct runtime `INSERT INTO tasks` is gone from production source outside `src/lib/task-create.ts`; intentional test fixtures are excluded or migrated deliberately.
- `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies in both `package.json` and `pnpm-lock.yaml`; the current high-severity audit baseline is remediated; CI and passing `pnpm audit --audit-level high` evidence is recorded.
- Strict-scope config includes new production modules.
- A real running-app Playwright journey verifies workflow-template chain-field create/edit/read/delete under operator auth.
- `docs/orchestration.md` is updated before ship.
- No downstream behavior is introduced for `ready_for_owner`, area labels, artifact publishing, governance enforcement, pilot seeding, or CrabTrap.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | Pending | Pending | P3-AC1, P3-AC2, P3-AC3, P3-AC4, P3-AC6 |
| safe-evaluation | Pending | Pending | P3-AC5, P3-AC8, P3-AC9, P3-AC10 |
| scheduler-safety | Pending | Pending | P3-AC1, P3-AC2, P3-AC3, P3-AC4, P3-AC6a |
| regression-safety | Pending | Pending | P3-AC6a, P3-AC8, P3-AC11, P3-AC12 |

### Addressing Gaps

If a checklist reports `[Gap]`, update the generated `spec.md` or `plan.md` with the smallest concrete clarification, then re-run that checklist. Do not resolve a gap by widening SPEC-004 into downstream specs.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/004-task-pipeline-engine/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P3-AC1 through P3-AC12.
- Use TDD where feasible: write focused Vitest, route, scheduler, validator, evaluator, and UI tests before implementation.
- Order tasks by dependency:
  1. Archive Sweep evidence, dependency verification, baseline direct INSERT/reference discovery.
  2. `createTask()` contract tests, callsite behavior matrix, and helper extraction.
  3. Migration of API, GitHub, sync, and recurring task creation callsites.
  4. `output-schema-validator.ts` tests and implementation with `ajv`.
  5. `routing-rule-evaluator.ts` adversarial, timeout, and JSONPath no-script tests and implementation with `jsonpath-plus`.
  6. `workflow-template` types, `/api/workflows` create/update validation/persistence, `DELETE /api/workflows?id=...` contract repair/compatibility, and editor UI changes.
  7. `advanceTaskChain` tests and implementation across every live non-`done` to `done` transition.
  8. Documentation update in `docs/orchestration.md`.
  9. Real running-app Playwright workflow-template chain-field create/edit/read/delete verification.
  10. Strict-scope config, CI quality-gate updates, dependency pin checks, audit-remediation package/lock updates, guardrail greps, and final verification.
- Mark parallel-safe tasks with [P] only when they do not touch the same file or contract.

## Required Task Coverage

- P3-AC1 and P3-AC2 require explicit flag-off, unbound-task, and flag-on-null regression tests.
- P3-AC3 and P3-AC7 require valid routing, `routing_rules` without `output_schema` rejection, static `next_template_slug` without schema, fallback, missing/disabled target slug advancement-stall, and termination tests.
- P3-AC4 requires missing output and invalid output failure tests with activity evidence and no successor.
- P3-AC5 and P3-AC9 require adversarial fixtures, validator bound fixtures, AJV safety-option fixtures, conservative pattern-subset fixtures, JSONPath filter/script rejection, routing pre-validation cap fixtures, and routing timeout-budget fixtures.
- P3-AC6 requires inheritance, first-hop parent lineage initialization, assignee resolution, missing-assignee stall, and successor lineage assertions.
- P3-AC6a requires `createTask()` call-count/side-effect assertions, source-specific callsite behavior assertions, duplicate-successor prevention, and production-source direct INSERT grep.
- P3-AC8 requires package and lockfile exact pinned direct runtime dependency checks for `ajv`, `jsonpath-plus`, and `safe-regex`, audit-remediation tasks that make the current branch baseline pass `pnpm audit --audit-level high`, `.github/workflows/quality-gate.yml` coverage for SPEC-004 guardrails and `pnpm audit:high`, plus passing audit evidence.
- P3-AC10 requires validator cache, validator p95 budget tests over a fixed corpus, and combined terminal-success overhead p95 tests against flag-off/null-chain baseline.
- P3-AC11 requires `docs/orchestration.md` update and branch commit evidence.
- P3-AC12 requires a real running-app Playwright journey covering create, edit, read-back, `routing_rules` without `output_schema` rejection, static `next_template_slug` without schema, and repaired `DELETE /api/workflows?id=...` behavior for workflow-template chain fields under operator auth.

## File Layout Constraints

- Primary new files: `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`.
- Expected source edits: `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/github/route.ts`, `src/lib/github-sync-engine.ts`, `src/lib/recurring-tasks.ts`, `src/lib/task-dispatch.ts`, `src/app/api/quality-review/route.ts`, `src/components/panels/orchestration-bar.tsx`, `src/app/api/workflows/route.ts`, `src/lib/validation.ts`.
- Expected config edits: `package.json`, `pnpm-lock.yaml`, `.github/workflows/quality-gate.yml`, `tsconfig.spec-strict.json`, `eslint.config.mjs`. Package/lockfile edits include the direct SPEC-004 dependency pins and any audit-remediation updates required to clear the current high-severity baseline.
- Expected docs edit: `docs/orchestration.md`.
- Expected fixtures: create or use `src/lib/__tests__/fixtures/routing/` and `src/lib/__tests__/fixtures/schema-corpus/`; keep fixture direct INSERTs out of the production guardrail or migrate them deliberately when they test runtime behavior.
- Avoid unrelated cleanup and do not touch implementation surfaces outside SPEC-004 unless a failing test proves it is required.
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

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: feature-flag default OFF, additive behavior, TDD, strict-scope ramp, shared task creation, and safe evaluation.
2. Acceptance coverage: P3-AC1 through P3-AC12 each have implementation or verification tasks.
3. Task creation consistency: every production task creation callsite moves through `createTask()` with source-specific side effects preserved and no runtime direct INSERT bypasses.
4. Validator consistency: every numeric bound and forbidden schema feature has a test and implementation task.
5. Evaluator consistency: allowlisted grammar, JSONPath no-script configuration/rejection, `maxRuleEvalMs=10`, and forbidden primitive checks are explicit in tasks and tests.
6. Scheduler consistency: flag-off, unbound tasks, flag-on-null, valid route, missing/invalid output, fallback, missing-target stall, missing-assignee stall, timeout stall, termination, duplicate-prevention, first-hop lineage initialization, and successor lineage behaviors are covered at every live non-`done` to `done` transition, including `runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`.
7. Dependency discipline: `ajv`, `jsonpath-plus`, and `safe-regex` handling are exact pinned direct runtime dependencies, the current high-severity audit baseline is remediated, `pnpm audit --audit-level high` is wired into CI, and the result is tested.
8. Documentation discipline: `docs/orchestration.md` is a required shipping artifact.
9. File-path truthfulness: tasks use the live paths from this worktree and do not invent `task_templates` or `project_agent_assignments.agent_id`.
10. Downstream boundaries: generated tasks must not implement SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, or SPEC-011 behavior.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation, violates constitution, leaks unsafe evaluation, duplicates task side effects, or widens scope into later specs | Must fix before G6 |
| HIGH | Significant gap in acceptance coverage, scheduler safety, validation/evaluator safety, or dependency pinning | Should fix before implementation |
| MEDIUM | Ambiguity or maintainability risk | Review and decide |
| LOW | Minor wording or traceability issue | Note for cleanup |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After tasks are generated and Analyze has no CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First Task Pipeline Engine Implementation

For each task, follow this cycle:

1. RED: Add or update a focused test before production code.
2. GREEN: Implement the smallest change that satisfies the task.
3. REFACTOR: Keep task creation, validation, evaluator, and scheduler seams readable with tests still green.
4. VERIFY: Run the task's acceptance check and record command evidence.
5. RECORD: Add command/test/grep proof before marking related acceptance criteria complete.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must return `004-task-pipeline-engine`.
2. Verify package manager: lockfile is `pnpm-lock.yaml`; use pnpm only.
3. Verify SPEC-001, SPEC-002, SPEC-002A, and SPEC-003 are complete in the roadmap and present in this branch.
4. Run Archive Sweep startup per SPEC-002A policy before Phase 0/prerequisites.
5. Inspect current task creation and scheduler reference paths:
   - `src/app/api/tasks/route.ts`
   - `src/app/api/github/route.ts`
   - `src/lib/github-sync-engine.ts`
   - `src/lib/recurring-tasks.ts`
   - `src/lib/task-dispatch.ts`
   - `src/app/api/quality-review/route.ts`
   - `src/app/api/tasks/[id]/route.ts`
   - `src/components/panels/orchestration-bar.tsx`
   - `src/app/api/workflows/route.ts`
   - `src/lib/validation.ts`
   - `.github/workflows/quality-gate.yml`
   - `docs/orchestration.md`
6. Capture baseline tests before enabling new behavior.

### Implementation Notes

- Implement `createTask()` first and migrate callsites only after tests prove side effects.
- Route all task-chain runtime checks through `resolveFlag('FEATURE_TASK_PIPELINES', ctx)`.
- Keep tasks without workflow-template binding, or templates with NULL chain fields, on the legacy path.
- Treat `tasks.resolution` as the temporary structured-output source only for SPEC-004.
- Use `workflow_templates`, not `task_templates`.
- Use `project_agent_assignments.agent_name` and `workflow_template.agent_role` for assignee resolution; missing assignee stalls with activity evidence and creates no successor.
- Missing `tasks.resolution` or invalid output under an `output_schema` fails the parent task, records activity, and creates no successor.
- Routing timeout or unresolved target slug stalls automated chain advancement with activity evidence and creates no successor; the parent remains in its terminal success state and manual operator triage owns recovery.
- Hook `advanceTaskChain` at every live non-`done` to `done` transition for pipeline-bound tasks and guard against duplicate successors; manual/API `done` transitions remain allowed only through the shared helper.
- Successor creation must call `createTask()` exactly once.
- Do not add downstream state machine, artifact, governance, area-label, pilot, or CrabTrap behavior.

### Verification Commands

- `pnpm install` if dependency changes require lockfile updates.
- `pnpm audit --audit-level high`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Focused Vitest filters for `task-create`, task dispatch/chain advancement, output schema validator, routing evaluator, feature flags, route callsites, and workflow-template types.
- Real running-app Playwright check for workflow-template chain-field create/edit/read/delete under operator auth.
- `pnpm build`
- `pnpm test:e2e` or documented focused e2e subset if the local environment blocks full browser/server execution.
- Grep checks:
  - no inline runtime `process.env.FEATURE_TASK_PIPELINES` reads outside `src/lib/feature-flags.ts`
  - no `task_templates` SQL/table references
  - no runtime `INSERT INTO tasks` in production source outside `src/lib/task-create.ts` (exclude `src/**/__tests__/**` and fixture-only files, or migrate them deliberately)
  - no `quality_reviews.agent_id` or `project_agent_assignments.agent_id` assumptions
  - no unsafe evaluator primitives: `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, JSONPath filters/scripts, arithmetic/bitwise routing operators, or right-side regex behavior
  - no downstream drift into `ready_for_owner`, `FEATURE_AREA_LABEL_ROUTING`, artifact publishing, resource governance, pilot seed behavior, or CrabTrap implementation
- CI checks:
  - `.github/workflows/quality-gate.yml` runs `pnpm audit:high` before merge; local registry/network failures may be recorded during development, but SPEC-004 owns resolving the known high-severity audit advisories and merge requires a successful CI audit run
  - `.github/workflows/quality-gate.yml` runs or invokes SPEC-004 guardrails for exact direct runtime dependency pins, production direct `INSERT INTO tasks`, unsafe evaluator primitives, and downstream-scope drift
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 0 - Archive Sweep and baseline discovery | Pending | 0 | |
| 1 - Shared task creation helper | Pending | 0 | |
| 2 - Validator and evaluator safety | Pending | 0 | |
| 3 - Scheduler and successor routing | Pending | 0 | |
| 4 - Template UI, docs, and strict scope | Pending | 0 | |
| 5 - Final verification and status sync | Pending | 0 | |

---

## Post-Implementation Checklist

- [ ] Archive Sweep evidence is recorded and excludes `SPEC-004`.
- [ ] All generated tasks are marked complete in `specs/004-task-pipeline-engine/tasks.md`.
- [ ] Acceptance evidence exists for P3-AC1 through P3-AC12.
- [ ] `src/lib/task-create.ts` exists and owns all task creation side effects.
- [ ] Source-specific API, GitHub import, GitHub sync import, recurring, and pipeline-successor behavior is preserved through `createTask()`.
- [ ] Direct runtime `INSERT INTO tasks` is gone from production source outside `src/lib/task-create.ts`; any test fixture inserts are deliberately excluded or migrated.
- [ ] `src/lib/output-schema-validator.ts` enforces every roadmap numeric bound and forbidden schema feature.
- [ ] Schema `pattern`/`patternProperties` acceptance treats `safe-regex` as necessary but not sufficient and enforces the conservative pattern subset with adversarial fixtures.
- [ ] `src/lib/routing-rule-evaluator.ts` uses JSONPath traversal with JavaScript execution disabled, rejects JSONPath filters/scripts before `JSONPath()`, enforces `maxRuleEvalMs=10`, and uses a hand-written allowlisted grammar.
- [ ] `advanceTaskChain` implements valid routing, missing-output failure, invalid-output failure, fallback, missing-assignee stall, timeout/unresolved-target advancement stall, termination, duplicate-prevention, successor creation, first-hop parent lineage initialization, and successor lineage behavior at every live non-`done` to `done` transition for pipeline-bound tasks, including `runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`.
- [ ] `orchestration-bar.tsx`, `/api/workflows`, and create/update workflow schemas expose, validate, and persist the workflow-template chain fields required by the roadmap, reject `routing_rules` without `output_schema`, allow static `next_template_slug` without schema, preserve operator-only writes, and repair `DELETE /api/workflows?id=...` compatibility.
- [ ] `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies in `package.json` and `pnpm-lock.yaml`.
- [ ] `.github/workflows/quality-gate.yml` runs SPEC-004 dependency, audit, direct-INSERT, unsafe-primitive, and downstream-drift guardrails.
- [ ] `pnpm audit --audit-level high` passes before merge after SPEC-004 audit remediation; local registry/network failure is temporary evidence only and cannot satisfy P3-AC8.
- [ ] `tsconfig.spec-strict.json` and `eslint.config.mjs` include new production modules.
- [ ] `docs/orchestration.md` describes declarative task chains and current lifecycle/status terminology.
- [ ] Prohibited-drift grep checks pass.
- [ ] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [ ] `pnpm lint` passes or any environment failure is documented with evidence.
- [ ] `pnpm test` passes or any environment failure is documented with evidence.
- [ ] `pnpm build` passes or any environment failure is documented with evidence.
- [ ] Real running-app Playwright verification for P3-AC12 passes.
- [ ] `docs/ai/rc-factory-technical-roadmap.md` records SPEC-004 implementation evidence after verification.
- [ ] `docs/rc-factory-v1-prd.md` reflects SPEC-004 completion after verification.
- [ ] Branch is pushed for review.

---

## Lessons Learned

### What Worked Well

- Pending.

### Challenges Encountered

- Pending.

### Patterns to Reuse

- Pending.

---

## Project Structure Reference

```text
racecraft-mission-control/
|-- src/lib/task-create.ts                  # New SPEC-004 shared task creation helper
|-- src/lib/output-schema-validator.ts      # New constrained JSON Schema validator
|-- src/lib/routing-rule-evaluator.ts       # New safe routing expression evaluator
|-- src/types/workflow-template.ts          # New workflow-template chain metadata types
|-- src/lib/task-dispatch.ts                # Aegis approval `advanceTaskChain` integration
|-- src/app/api/quality-review/route.ts     # Operator approval `advanceTaskChain` integration
|-- src/app/api/tasks/[id]/route.ts         # Detail status-to-done route integration or deterministic block
|-- src/app/api/tasks/route.ts              # Existing task creation callsite
|-- src/app/api/github/route.ts             # Existing GitHub ingestion callsite
|-- src/lib/github-sync-engine.ts           # Existing sync callsite
|-- src/lib/recurring-tasks.ts              # Existing recurring task callsite
|-- src/components/panels/orchestration-bar.tsx
|-- src/app/api/workflows/route.ts
|-- src/lib/validation.ts
|-- .github/workflows/quality-gate.yml
|-- docs/orchestration.md
|-- docs/rc-factory-v1-prd.md
|-- docs/ai/rc-factory-technical-roadmap.md
|-- docs/ai/specs/SPEC-004-workflow.md      # This workflow
|-- docs/ai/specs/autopilot-state.json
|-- specs/004-task-pipeline-engine/         # Generated SpecKit artifacts after Specify
|-- .specify/memory/constitution.md
`-- .specify/extensions/archive/             # SPEC-002A archive extension
```

---

## Setup Notes

- This workflow was generated on branch `004-task-pipeline-engine` from `origin/main` at `bce89a2`.
- This setup pushed `004-task-pipeline-engine` to `origin`.
- Run `$speckit-autopilot docs/ai/specs/SPEC-004-workflow.md` from the worktree root after reviewing this workflow.
- Do not run autopilot from `main`.
