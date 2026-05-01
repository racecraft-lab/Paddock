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
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | 2026-05-01 dry-run evidence recorded; `SPEC-004` excluded; cleanup unsafe/not applied |
| Specify | `$speckit-specify` | Complete | 2026-05-01 generated spec and requirements checklist; G1 marker scan clean |
| Clarify | `$speckit-clarify` | Complete | Sessions 1-3 resolved; G2 marker scan passed 2026-05-01 |
| Plan | `$speckit-plan` | Complete | Generated plan/research/data model/contracts/quickstart; G3 passed 2026-05-01 |
| Checklist | `$speckit-checklist` | Complete | All four domain checklists complete; G4 marker scan clean 2026-05-01 |
| Tasks | `$speckit-tasks` | Complete | 88 tasks generated; G5 passed 2026-05-01 |
| Analyze | `$speckit-analyze` | Complete | 2026-05-01 found and remediated one HIGH downstream-boundary wording drift; marker scan clean |
| Implement | `$speckit-implement` | Complete | T001-T088 complete; implementation commit `5f92f179d7f89a256e09589d982354be1f32a95d` recorded 2026-05-01 |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-004` cleanup occurs |
| G1 | After Specify | Requirements define flag-off behavior, null-default safety, task creation parity, schema validation, routing, successor creation, template UI, and documentation refresh with no unresolved markers |
| G2 | After Clarify | Ambiguities in createTask side effects, validation bounds, safe evaluator grammar, scheduler hook, UI edits, and downstream boundaries are resolved |
| G3 | After Plan | Constitution gates pass; strict scope, dependencies, implementation seams, tests, and rollback strategy are concrete |
| G4 | After Checklist | All data-integrity, safe-evaluation, scheduler-safety, and regression-safety gaps are resolved |
| G5 | After Tasks | P3-AC1 through P3-AC12 plus P3-AC6b have task coverage and dependency order is implementable |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, or SPEC-011 behavior |
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

#### Archive Sweep Startup Evidence - 2026-05-01T02:25:33Z

- Branch/worktree: `004-task-pipeline-engine`, isolated worktree, clean before sweep.
- Mode: dry-run evidence only. Cleanup was not applied because `safeToApplyCleanup=false` remains the recorded cleanup policy.
- Active spec directories found: `specs/003-global-aegis`, `specs/004-task-pipeline-engine`.
- Previously merged candidates from workflow/state: `SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`.
- Already archived/removed from active `specs/**`: `SPEC-001`, `SPEC-002`, `SPEC-002A` have project-memory changelog entries and are not active directories in this worktree.
- Eligible active candidate: `specs/003-global-aegis` is a prior merged spec and remains eligible for archive discovery; cleanup is not eligible in this run.
- Excluded current target: `SPEC-004` / `specs/004-task-pipeline-engine`; no archive or cleanup action was taken against the current target.
- G0 result: Passed by dry-run evidence; no source spec folder was deleted, moved, or rewritten.

### Phase 0 Startup Evidence - 2026-05-01T02:25:33Z

- Prerequisite script: `check-prerequisites.sh docs/ai/specs/SPEC-004-workflow.md` returned `all_pass=true`.
- Branch check: current branch is `004-task-pipeline-engine`; script reported `on_feature_branch=true` and `is_worktree=true`.
- Settings: no `.claude/speckit-pro.local.md`; defaults in effect (`consensus-mode=moderate`, `gate-failure=stop`, `auto-commit=per-phase`).
- MCP availability: `tavily-mcp`, `context7`, and `RepoPrompt` are not configured; phase agents must use local repo evidence and built-in fallbacks.
- Project commands discovered from lockfile/scripts: `BUILD=pnpm build`, `TYPECHECK=pnpm typecheck`, `LINT=pnpm lint`, `UNIT_TEST=pnpm test`, `INTEGRATION_TEST=pnpm test:e2e`, `FULL_VERIFY=pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.
- Package manager: `pnpm` from `pnpm-lock.yaml`.

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
| Strict Scope | New production modules: `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`; existing files touched only for Phase 3 routing, scheduler, template UI, route migration, docs, tests, strict-scope config, and the M62 successor-uniqueness migration/rollback |
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
- Every SPEC-004 validation failure, advancement stall, or `200 OK` retry recovery activity must write a human-readable `activities.description` plus JSON metadata in `activities.data`; `data.reason_code` is required and stable for missing output, invalid output, routing expression rejection, routing budget overrun, missing/disabled/duplicate/cross-workspace target slug, missing successor assignee, and retry recovery cases.
- Add explicit chain retry recovery: correcting `tasks.resolution` or changing a failed task to `done` through ordinary `PUT /api/tasks/[id]` must not rerun chain advancement. Operator recovery uses `POST /api/tasks/[id]` with `{ "action": "retry_chain_advancement" }`. For `failed` parents, retry is eligible only after `task_pipeline_output_missing` or `task_pipeline_output_invalid`, revalidates current output, leaves the parent `failed` if validation still fails, and restores terminal success before normal chain routing only after validation passes. For terminal-success parents, retry is eligible only after recoverable advancement stalls (`task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, or `task_pipeline_successor_assignee_missing`), preserves terminal success throughout, and never converts the parent to `failed`. If a terminal-success advancement-stall retry clears because current routing resolves no matching rule and no `next_template_slug`, the retry succeeds as normal chain termination: no successor, no new stall activity, and recovery activity `recovery_outcome='chain_terminated'`. Retry selects only the latest eligible SPEC-004 failure/stall activity for the parent task; no `activity_id` override is accepted and older activities are not replayed. All `409 Conflict` retry rejections are side-effect-free: they write no activity, increment no `retry_attempt`, leave state/successors unchanged, and return `{ "retry_rejection_reason": "<enum>" }` in the response body. Allowed rejection enum values are `retry_not_eligible`, `retry_template_provenance_missing`, and `retry_template_drift_unconfirmed`. SPEC-004 does not enforce a hard retry cap for still-unresolved eligible failures/stalls; repeated eligible retries are allowed, every attempt records monotonic per-parent `retry_attempt` audit evidence shared across all retry classes and reason codes, and tests prove repeated invalid/stalled retries do not create successors or corrupt state. Post-recovery retries preserve existing-successor idempotency but close terminal no-successor recoveries: if a successor exists, retry returns `200 OK` with `recovery_outcome='successor_already_exists'`, `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`; if the selected failure/stall was already resolved with `recovery_outcome='chain_terminated'`, later retry calls return side-effect-free `409 Conflict` with `retry_rejection_reason='retry_not_eligible'` until a new retry-eligible SPEC-004 failure/stall activity is recorded. Retry records `data.reason_code='task_pipeline_retry_chain_advancement'`, `previous_reason_code`, `recovery_class`, `recovery_action`, attempt/provenance fields, and template hash drift evidence in `activities.data` without duplicating full corrected output; missing selected-activity hash provenance fails closed with `retry_rejection_reason='retry_template_provenance_missing'` and no `confirm_template_drift` bypass until manual provenance remediation.
- Every `retry_chain_advancement` `200 OK` response returns the normal task detail response shape plus a bounded `chain_retry` summary with `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`. Allowed `recovery_outcome` values are `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`; `successor_already_exists` includes the existing successor id and `idempotent_successor=true`, while `chain_terminated` uses `successor_task_id=null` and `chain_terminated=true`; responses must not include full corrected output, full parsed agent output, or full routing traces.
- Extend the live workflow-template editor in `src/components/panels/orchestration-bar.tsx`, plus `/api/workflows` persistence and create/update workflow schemas, to edit `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`, enforce that `routing_rules` require `output_schema`, allow static `next_template_slug` without schema, and preserve the `DELETE /api/workflows?id=...` UI/API contract.
- Update `docs/orchestration.md` before Phase 3 is considered shipped.

### Known Reference Surface

- `src/app/api/tasks/route.ts` - current task creation route, direct INSERT callsite, bulk update route, and terminal status update surface.
- `src/app/api/tasks/[id]/route.ts` - detail update route, terminal status update surface, and operator-only `retry_chain_advancement` action.
- `src/app/api/github/route.ts` - GitHub issue ingestion task creation callsite.
- `src/lib/github-sync-engine.ts` - sync-created task callsite and outbound push semantics.
- `src/lib/recurring-tasks.ts` - recurring task creation callsite.
- `src/lib/task-dispatch.ts` - task dispatch, Aegis review, terminal success transition, and target location for `advanceTaskChain`.
- `src/lib/migrations.ts` - M62 partial unique index for one successor per non-null `parent_task_id`.
- `docs/migrations/rollback-M62.sql` - manual rollback that drops `idx_tasks_one_successor_per_parent`.
- `src/app/api/quality-review/route.ts` - operator-approved terminal success transition that must trigger chain advancement idempotently.
- `src/components/panels/orchestration-bar.tsx` - live workflow-template editor UI.
- `src/app/api/workflows/route.ts` and `src/lib/validation.ts` - workflow-template persistence, operator auth, and request validation.
- `src/lib/workspaces.ts` and `src/types/product-line.ts` - Product Line scope resolver and `appendScopeToPath` helpers that workflow-template API/UI calls must use.
- `src/lib/feature-flags.ts` - `resolveFlag()` from SPEC-002.
- `src/lib/aegis.ts` - global Aegis resolver from SPEC-003, which downstream review loops still use.
- `.github/workflows/quality-gate.yml` - CI quality gate that must run SPEC-004 dependency, audit, and static guardrail checks before merge.
- `docs/orchestration.md` - repository documentation that must describe declarative task chains before ship.

### Success Criteria Summary

- [ ] P3-AC1: With flag OFF, task completion behaves exactly as today; no chain advances regardless of workflow-template fields.
- [ ] P3-AC2: With flag ON, tasks without `workflow_template_id` OR without advancement-driving chain metadata (`output_schema`, non-empty `routing_rules`, or `next_template_slug`) behave exactly like flag OFF; slug-only or downstream-metadata-only templates do not advance.
- [ ] P3-AC3: With a bound workflow template, `output_schema`, and valid `tasks.resolution`, a successor task is created per `routing_rules` or `next_template_slug`; templates with `routing_rules` and no `output_schema` are rejected, while static `next_template_slug` without schema remains valid.
- [ ] P3-AC4: With missing `tasks.resolution` or invalid output under an `output_schema`, the parent task transitions to `failed`, activity is recorded with `data.reason_code` set to `task_pipeline_output_missing` or `task_pipeline_output_invalid` plus template schema/routing hashes, and no successor is created. Corrected-output recovery requires the explicit operator retry action; ordinary failed-to-`done` updates do not rerun chain advancement. Retry uses current template rules only after template drift is either absent or explicitly confirmed, fails closed with side-effect-free `409 Conflict` and `retry_rejection_reason='retry_template_provenance_missing'` when selected failure/stall hash provenance is missing, records `recovery_class='output_validation_failure'`, leaves the parent `failed` on repeated validation failure, and restores terminal success before normal chain routing only after validation passes.
- [ ] P3-AC4a: `retry_chain_advancement` also supports terminal-success advancement stalls for `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled` when a live template-disable state exists, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, and `task_pipeline_successor_assignee_missing`. Retry preserves terminal success throughout, records `recovery_class='advancement_stall'`, re-runs routing/target/assignee resolution using the current template after the same drift check, creates no successor if the stall remains, creates or returns the idempotent successor outcome if resolved, terminates normally with no successor/new stall and `recovery_outcome='chain_terminated'` if the resolved current route has no matching rule and no `next_template_slug`, and never marks the parent `failed`. Retry selects only the latest eligible SPEC-004 failure/stall activity for the parent; no `activity_id` override is accepted and older activities are not replayed. Ineligible latest state/reason pairs and post-`chain_terminated` retries return `409 Conflict` with `retry_rejection_reason='retry_not_eligible'`, no activity write, no `retry_attempt` increment, and no state/successor side effects. There is no built-in retry-attempt cap for still-unresolved eligible stalls; repeated attempts are allowed with monotonic per-parent `retry_attempt` audit evidence shared across all retry classes and no successor/state corruption.
- [ ] P3-AC4b: Every eligible `retry_chain_advancement` `200 OK` response returns normal task detail data plus `chain_retry` with `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`; the corresponding recovery activity has `data.reason_code='task_pipeline_retry_chain_advancement'` plus `previous_reason_code` for the selected original failure/stall; tests cover all allowed outcomes, prove existing-successor post-recovery retry returns `200 OK`/`successor_already_exists` without creating a duplicate, prove post-`chain_terminated` retry returns side-effect-free `409 Conflict`/`retry_not_eligible` until a new retry-eligible failure/stall exists, prove the response does not leak full corrected output or routing traces, and prove retry `409 Conflict` rejections write no recovery activity.
- [ ] P3-AC5: Routing evaluator rejects unsafe inputs without exception leaks or successor creation, rejects JSONPath filters/scripts before `JSONPath()`, enforces every routing pre-validation cap, and enforces `maxRuleEvalMs=10` triage fallback with activity evidence and stable reason codes.
- [ ] P3-AC6: Successor task inherits workspace/project, initializes first-hop parent lineage when absent, resolves assignee via `project_agent_assignments.agent_name`, populates successor lineage fields, and stalls with `data.reason_code='task_pipeline_successor_assignee_missing'`/no successor when no matching assignee exists.
- [ ] P3-AC6a: Successor creation calls `createTask()` exactly once, source-specific side effects are preserved, and direct runtime `INSERT INTO tasks` outside `src/lib/task-create.ts` is gone from production source.
- [ ] P3-AC6b: `advanceTaskChain` wraps parent lineage initialization, validation failure state/activity writes, stall activity writes, duplicate-successor guard checks, and successor creation in one database transaction with rollback tests for each write boundary; existing successor retries for the same `parent_task_id` return success as idempotent no-ops; M62 creates `idx_tasks_one_successor_per_parent` after a zero-duplicate preflight and rollback SQL drops it.
- [ ] P3-AC7: Unit tests cover valid routing, missing output, invalid output, no-match fallback to static next, and chain termination.
- [ ] P3-AC8: `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies in `package.json` and `pnpm-lock.yaml`; SPEC-004 remediates the current high-severity audit baseline; CI guardrails run and passing `pnpm audit --audit-level high` evidence is recorded.
- [ ] P3-AC9: Validator enforces every numeric bound, forbidden schema feature, and AJV safety option listed in the roadmap.
- [ ] P3-AC10: Compiled validators cache per `(template_id, schema_sha256)` with LRU eviction at 256; p95 validation remains within the 50 ms budget over the fixed corpus; combined validation + routing + chain advancement overhead remains ≤50 ms p95 versus the flag-off/null-chain baseline.
- [ ] P3-AC11: `docs/orchestration.md` is updated in the SPEC-004 branch before Phase 3 is considered shipped.
- [ ] P3-AC12: A real running-app Playwright journey creates, edits, reads back, usage-tracks, and deletes workflow-template chain fields in the live Workflows editor under operator auth and Product Line scope, including `routing_rules`-requires-`output_schema` validation, static `next_template_slug` without schema, `appendScopeToPath` coverage for `/api/workflows`, and the repaired `DELETE /api/workflows?id=...` query-parameter delete contract; component-only tests are insufficient.

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
- Missing `tasks.resolution` or invalid structured output under an `output_schema` transitions the parent task to `failed`, records an activity with `data.reason_code='task_pipeline_output_missing'` or `data.reason_code='task_pipeline_output_invalid'`, and creates no successor.
- Chain retry recovery is explicit and operator-owned. Editing `tasks.resolution` or re-marking a failed task `done` through ordinary `PUT /api/tasks/[id]` MUST NOT rerun chain advancement. Add operator-only `POST /api/tasks/[id]` with `{ "action": "retry_chain_advancement" }`. For `failed` parents, retry is allowed only when the prior reason is `task_pipeline_output_missing` or `task_pipeline_output_invalid`; it records recovery activity with `recovery_class='output_validation_failure'`, revalidates current `tasks.resolution`, leaves the parent `failed` and creates no successor if validation still fails, and restores the parent to terminal success before applying normal route, stall, termination, duplicate-successor, and successor-creation semantics only after validation passes. For terminal-success parents with a prior advancement stall, retry is allowed only for `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, and `task_pipeline_successor_assignee_missing`; it records `recovery_class='advancement_stall'`, preserves terminal success throughout, re-runs routing/target/assignee resolution, creates no successor if the stall remains, returns the idempotent existing-successor outcome when applicable, terminates normally with no successor and no new stall activity if no current route or `next_template_slug` resolves, and never converts the parent to `failed`. Retry-resolved chain termination records `recovery_outcome='chain_terminated'` on the recovery activity and requires no extra confirmation flag or `409 Conflict` beyond the existing provenance/drift checks. Retry selects only the latest eligible SPEC-004 failure/stall activity for the parent task; no `activity_id` override is accepted and older failure/stall activities cannot be replayed. All `409 Conflict` retry rejections are side-effect-free: they write no activity, increment no `retry_attempt`, leave state/successors unchanged, and return `{ "retry_rejection_reason": "<enum>" }` in the response body. Allowed rejection enum values are `retry_not_eligible`, `retry_template_provenance_missing`, and `retry_template_drift_unconfirmed`. SPEC-004 does not enforce a hard retry-attempt cap for still-unresolved eligible failures/stalls; repeated eligible retries remain allowed, but every attempt is audited and tests prove repeated invalid/stalled retries do not create successors or corrupt parent state. Post-recovery retries preserve existing-successor idempotency but close terminal no-successor recoveries: existing-successor retry returns `200 OK` with `recovery_outcome='successor_already_exists'`, `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`, while retry after `recovery_outcome='chain_terminated'` returns side-effect-free `409 Conflict` with `retry_rejection_reason='retry_not_eligible'` until a new retry-eligible failure/stall exists. Recovery activity includes `reason_code='task_pipeline_retry_chain_advancement'`, `recovery_action='retry_chain_advancement'`, monotonic per-parent `retry_attempt` shared across all recovery classes and reason codes, `previous_reason_code`, relevant task/template/chain ids, original/current template hashes, `template_drift_detected`, `template_drift_confirmed`, and a SHA-256 hash of corrected resolution when applicable without duplicating the full corrected output. The selected latest failure/stall activity records `template_output_schema_sha256`, `template_routing_rules_sha256`, and `template_next_slug_sha256`; if any required selected-activity hash is missing, retry fails closed with `retry_rejection_reason='retry_template_provenance_missing'` and no `confirm_template_drift` bypass until provenance is manually remediated. Retry recomputes hashes from the current `workflow_templates` row and returns `409 Conflict` with `retry_rejection_reason='retry_template_drift_unconfirmed'` if any hash changed unless the request includes `{ "confirm_template_drift": true }`.
- `retry_chain_advancement` `200 OK` responses return the normal task detail response shape plus `chain_retry`: `{ recovery_class, retry_attempt, recovery_outcome, successor_task_id, chain_terminated, idempotent_successor }`. `recovery_outcome` is limited to `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, or `chain_terminated`; `successor_already_exists` includes the existing successor id and `idempotent_successor=true`; `chain_terminated` uses `successor_task_id=null` and `chain_terminated=true`; and the response must not include full corrected output, full parsed agent output, or full routing traces.
- Routing-rule budget overruns (`maxRuleEvalMs=10`) and missing/disabled/duplicate/cross-workspace target slugs stall automated chain advancement, leave the parent in its terminal success state, record an operator-visible activity with stable `data.reason_code`, and create no successor. Operator triage corrects the routing/template configuration and retries through `retry_chain_advancement`.
- Successor creation runs inside one `advanceTaskChain` database transaction that covers parent lineage initialization, validation failure state/activity writes, stall activity writes, duplicate-successor guard checks, and successor `createTask()` insertion. If the guard finds an existing successor for the same `parent_task_id`, the retry returns success as an idempotent no-op and creates no duplicate task. SPEC-004 also adds M62 with `CREATE UNIQUE INDEX idx_tasks_one_successor_per_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL` after `SELECT parent_task_id, COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL GROUP BY parent_task_id HAVING COUNT(*) > 1` returns zero rows; the index is the final guard against races or bypasses, while `docs/migrations/rollback-M62.sql` drops it for manual rollback. Otherwise, successor creation inherits `workspace_id` and `project_id`, resolves `assigned_to` via `project_agent_assignments.agent_name` and `workflow_template.agent_role`, initializes first-hop parent lineage when absent (`root_task_id = parent.id`, generated `chain_id`, `chain_stage = 0`), sets successor `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, and `chain_stage = parent.chain_stage + 1`, and calls `createTask()` exactly once. If no matching assignee exists for the resolved successor role, chain advancement stalls with operator-visible activity evidence using `data.reason_code='task_pipeline_successor_assignee_missing'`, the parent remains in terminal success, and no successor is created.
- SPEC-004 chain failure/stall and retry recovery activities use the existing `activities.data` JSON field as the machine-readable metadata payload. Required `data.reason_code` values are `task_pipeline_output_missing`, `task_pipeline_output_invalid`, `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`, and `task_pipeline_retry_chain_advancement`. Retry recovery activities use `task_pipeline_retry_chain_advancement` and preserve the selected original failure/stall code in `previous_reason_code`; retry `409 Conflict` rejections write no activity. Include non-secret chain context (`parent_task_id`, `workflow_template_id`, `workflow_template_slug`, `target_template_slug`, `chain_id`, `chain_stage`) when available. Include all retry provenance hashes (`template_output_schema_sha256`, `template_routing_rules_sha256`, `template_next_slug_sha256`) for every retry-eligible failure/stall activity even when a template field is empty/null.
- Extend `src/components/panels/orchestration-bar.tsx`, `src/app/api/workflows/route.ts`, and create/update workflow schemas in `src/lib/validation.ts` for task-chain fields: `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`; preserve existing operator-only write authorization for create/update/delete. `POST/PUT /api/workflows` must validate and persist every chain field, reject non-empty `routing_rules` unless `output_schema` is present, and allow `next_template_slug` without schema for static chaining. Repair workflow-template delete compatibility by making `DELETE /api/workflows?id=...` accept the existing live editor query-parameter contract. JSON `{ id }` body support may remain for backward compatibility, but the query-parameter delete path is required.
- Add `src/types/workflow-template.ts` for typed workflow-template chain metadata.
- Add exact pinned direct runtime dependencies for `ajv`, `jsonpath-plus`, and `safe-regex` in `package.json` and `pnpm-lock.yaml`, remediate the current high-severity audit baseline observed on 2026-04-30 (`minimatch`, `rollup`, `flatted`, `picomatch`, `defu`, and `next` advisories), wire `.github/workflows/quality-gate.yml` to run SPEC-004 guardrails and `pnpm audit:high`, and record passing `pnpm audit --audit-level high` evidence.
- Update `docs/orchestration.md` with feature-flagged declarative task-chain behavior and current lifecycle terminology before marking Phase 3 shipped.

### Constraints

- Use pnpm only.
- New production module strict scope is limited to `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts` unless plan evidence proves another new module is required.
- Do not add schema migrations except M62 for the partial unique successor index. If live schema verification proves SPEC-001 fields are absent, stop and report the dependency mismatch instead of adding replacement lineage columns in SPEC-004.
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
| Functional Requirements | 44 including FR-022a |
| User Stories | 5 |
| Acceptance Scenarios | 21 |
| Acceptance Criteria | 14 criteria: P3-AC1 through P3-AC12 including P3-AC6a and P3-AC6b |
| G1 Clarification Markers | 0 |

### Specify Evidence

- Branch guard: `git branch --show-current` returned `004-task-pipeline-engine`; no branch was created or switched.
- Feature directory: `.specify/feature.json` now resolves to `specs/004-task-pipeline-engine`.
- Generated artifacts were searched for unresolved clarification markers after Specify; count was 0.
- Phase boundary honored: Clarify was not run.

### Files Generated

- [x] `specs/004-task-pipeline-engine/spec.md`
- [x] `specs/004-task-pipeline-engine/checklists/requirements.md`

### Traceability Markers

| Marker | Purpose |
|--------|---------|
| US1 | Flag-off and null-default zero regression |
| US2 | Operator-configured workflow template routing |
| US3 | Shared task creation side-effect parity |
| US4 | Safe evaluator and validator behavior |
| US5 | Downstream chain lineage and temporary `tasks.resolution` bridge |
| P3-AC1..P3-AC12 plus P3-AC6b | Roadmap acceptance criteria |
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
- Confirm `maxRuleEvalMs=10` timeout behavior: over-budget rule evaluation stalls automated chain advancement, leaves the parent in its terminal success state, records an operator-visible activity with `data.reason_code='task_pipeline_routing_budget_exceeded'`, and creates no successor.
```

#### Session 3: Scheduler Integration, Template UI, and Downstream Boundaries

```bash
$speckit-clarify

Focus on SPEC-004 runtime integration:
- Confirm `FEATURE_TASK_PIPELINES=false` and flag ON with NULL chain fields preserve current completion behavior.
- Confirm `advanceTaskChain` reads structured output from `tasks.resolution` only as the Phase 3 bridge; SPEC-007 later owns canonical artifact handoff.
- Confirm `advanceTaskChain` hooks every live non-`done` to `done` transition for pipeline-bound tasks: Aegis approval in `runAegisReviews`, operator approval in `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`; duplicate successor creation is idempotently prevented by returning success as a no-op when a successor already exists for the same `parent_task_id`, and DB-backed by `idx_tasks_one_successor_per_parent` on non-null `tasks.parent_task_id`; manual/API completions remain allowed, and no live pipeline-bound `done` path bypasses the shared helper.
- Confirm missing `tasks.resolution` or invalid output under an `output_schema` transitions parent task to `failed`, records activity with `task_pipeline_output_missing` or `task_pipeline_output_invalid`, and creates no successor.
- Confirm chain retry recovery is explicit: ordinary `PUT /api/tasks/[id]` re-marking to `done` does not rerun advancement. Operator-only `POST /api/tasks/[id]` `{ "action": "retry_chain_advancement" }` records recovery provenance without duplicating corrected output, uses current workflow-template rules, and blocks on schema/routing hash drift unless `confirm_template_drift=true`. Every `200 OK` retry recovery activity uses `data.reason_code='task_pipeline_retry_chain_advancement'` and preserves the selected original code in `previous_reason_code`. Missing selected-activity template hash provenance fails closed with `retry_rejection_reason='retry_template_provenance_missing'` and no `confirm_template_drift` bypass. For `failed` parents it is eligible only for missing/invalid output, revalidates current `tasks.resolution`, leaves the parent `failed` on repeated validation failure, and restores terminal success before normal chain routing only after validation passes. For terminal-success advancement stalls it preserves terminal success, re-runs routing/target/assignee resolution, creates no successor if the stall remains, treats resolved no-route/no-`next_template_slug` as normal chain termination with `recovery_outcome='chain_terminated'` and no new stall activity, and never marks the parent `failed`. Retry selects the latest eligible SPEC-004 failure/stall activity only; no `activity_id` override exists and older activities are not replayed. Existing-successor post-recovery retry returns `200 OK`/`successor_already_exists` with `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`; post-`chain_terminated` retry returns side-effect-free `409 Conflict`/`retry_not_eligible` until a new retry-eligible failure/stall exists. All `409 Conflict` retry rejections write no activity, do not increment `retry_attempt`, leave state/successors unchanged, and return `{ "retry_rejection_reason": "<enum>" }` with enum values `retry_not_eligible`, `retry_template_provenance_missing`, or `retry_template_drift_unconfirmed`. No hard retry-attempt cap is enforced for still-unresolved failures/stalls; audit evidence and no-side-effect/idempotency checks are the guardrails.
- Confirm retry `200 OK` response contract: return normal task detail data plus bounded `chain_retry` containing `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`; existing-successor responses include `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`; chain termination responses include `successor_task_id=null` and `chain_terminated=true`; do not return full corrected output or routing traces.
- Confirm missing, disabled, duplicate, or cross-workspace routing target slugs stall automated chain advancement deterministically with structured error/activity evidence (`task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, or `task_pipeline_target_cross_workspace`), parent terminal-success preservation, and no successor.
- Confirm first-hop lineage initialization and transactionality: if the parent has no lineage, update parent `root_task_id = parent.id`, generate `chain_id`, set parent `chain_stage = 0`, then create the successor with `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, and `chain_stage = 1`; lineage updates, validation failure writes, stall activity writes, duplicate-successor guard checks, and successor creation must commit or roll back as one database transaction; M62 preflights duplicate non-null `parent_task_id` rows, creates the partial unique index, and ships rollback SQL that drops it.
- Confirm assignee resolution uses `project_agent_assignments.agent_name` and `workflow_template.agent_role`, not imagined `agent_id` fields; missing assignee stalls chain advancement with `data.reason_code='task_pipeline_successor_assignee_missing'`, parent terminal-success preservation, and no successor.
- Confirm live template editor fields in `src/components/panels/orchestration-bar.tsx`, `/api/workflows` persistence, create/update workflow schemas, `POST/PUT /api/workflows` validation/persistence of every chain field, rejection of `routing_rules` without `output_schema`, static `next_template_slug` without schema, repaired `DELETE /api/workflows?id=...` editor/API compatibility, and operator-only template ownership.
- Confirm downstream out-of-scope boundaries: no `ready_for_owner`, area labels, dispositions/artifacts, governance enforcement, pilot seed behavior, or CrabTrap.
- Confirm `docs/orchestration.md` must be updated before Phase 3 ships.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Task creation parity and side effects | 5 answered; Q1 and Q3 resolved by consensus | `createTask()` uses explicit source profiles plus per-effect options; returns bounded task/side-effect metadata; API mention validation remains source-specific; chain-created tasks run DB effects inside `advanceTaskChain` and defer GitHub/GNAP pushes until after commit; production insert guardrail scopes to `src/app` and `src/lib` excluding tests/fixtures. |
| 2 | Safe output validation and routing evaluation | Q1-Q5 answered; Q3-Q5 resolved by all-analyst security consensus | Exact pinned runtime deps and audit ownership confirmed; validator numeric bounds encoded; AJV non-mutating/no-format/no-remote profile and conservative pattern subset recorded; routing grammar, JSONPath execution disabling, forbidden primitives, pre-validation caps, 10 ms budget stall behavior, and normal no-successor termination clarified. |
| 3 | Scheduler integration, template UI, and boundaries | 4 answered; Q2 and Q3 resolved by consensus | Empty-chain behavior is advancement-driven only by `output_schema`, non-empty `routing_rules`, or `next_template_slug`; `task_pipeline_target_disabled` is reserved without adding a disabled-template state; workflow-template API/UI must use Product Line scope helpers; retry template hashes use canonical JSON/string-or-null SHA-256 inputs. |

### Consensus Resolution Log

| Round | Item | Routed Categories | Outcome | Analysts Used |
|-------|------|-------------------|---------|---------------|
| 1 | Clarify S1 Q1: source-profiled `createTask()` ownership | `[codebase, spec]` | Accepted answer A: explicit source profiles plus per-effect options preserve source-specific side effects while centralizing structural ownership. | `clarify-executor`, `codebase-analyst`, `spec-context-analyst` |
| 2 | Clarify S1 Q3: outbound sync timing for chain-created tasks | `[codebase, spec]` then Round 2 domain check | Accepted answer A: DB effects run inside the caller transaction; GitHub/GNAP pushes run only after successful commit and failures use existing sync/error activity handling without rolling back the committed chain transaction. | `clarify-executor`, `codebase-analyst`, `spec-context-analyst`, `domain-researcher` |
| 3 | Clarify S2 Q3-Q5: untrusted output validator and routing safety | `[security]` | Accepted consensus: encode exact runtime dependency pins, validator numeric bounds, non-mutating AJV profile, safe-regex plus conservative pattern subset, hand-written routing grammar, JSONPath execution disabled, forbidden primitives/caps, `maxRuleEvalMs=10` stall semantics, terminal-success preservation, and normal no-successor termination. | `clarify-executor`, `codebase-analyst`, `spec-context-analyst`, `domain-researcher` |
| 4 | Clarify S3 Q2: disabled target reason code with no live disabled template state | `[codebase, spec]` | Accepted Round 1 consensus: reserve `task_pipeline_target_disabled` for a live/future template-state column, do not add disabled/status schema in SPEC-004, and classify current unresolved targets as missing, duplicate, or cross-workspace. | `clarify-executor`, `codebase-analyst`, `spec-context-analyst` |
| 5 | Clarify S3 Q3: Product Line scoping for workflow-template API/UI | `[security]` | Accepted all-analyst consensus: `/api/workflows` must use `resolveWorkspaceScopeFromRequest`, mutations require concrete Product Line scope and reject Facility aggregate writes, and `orchestration-bar.tsx`/workflow-template UI calls must use `appendScopeToPath`. | `clarify-executor`, `codebase-analyst`, `spec-context-analyst`, `domain-researcher` |

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

- Strict Scope: new production modules are `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts`; schema scope is limited to M62's partial unique successor index plus its rollback SQL.
- Existing-file edits are expected in task creation routes, sync/recurring task creation, task dispatch/manual review hooks, bulk/detail task status routes and the detail retry action, `orchestration-bar.tsx`, `/api/workflows`, `validation.ts`, strict-scope config, package manifests, tests, and `docs/orchestration.md`.
- Preserve flag-off behavior and null-default safety.
- Do not add any other schema beyond M62's partial unique successor index; if live schema verification proves SPEC-001 fields are absent, stop and report the dependency mismatch.
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
- Add task-chain terminal-success tests for every live non-`done` to `done` route: flag OFF, flag ON with unbound tasks and NULL fields, valid routing, routing-rules-without-schema rejection, static `next_template_slug` without schema, missing output failure, invalid output failure, failed-to-`done` ordinary update no-retry behavior, explicit `retry_chain_advancement` repeated-failure behavior for output validation, explicit `retry_chain_advancement` success/termination/stall behavior after corrected output, terminal-success advancement-stall retry for routing rejection, routing timeout, missing/disabled/duplicate/cross-workspace target, and missing assignee, retry-resolved no-route/no-`next_template_slug` chain termination with no successor/no new stall and `recovery_outcome='chain_terminated'`, post-`chain_terminated` retry side-effect-free `409 retry_not_eligible`, existing-successor retry `200 OK successor_already_exists`, parent-terminal-success preservation during stall retry, latest eligible failure/stall activity selection, no `activity_id` override or older-activity replay, missing selected-activity hash provenance side-effect-free `409 Conflict` with no `confirm_template_drift` bypass, repeated eligible retry attempts with no hard cap and monotonic per-parent `retry_attempt` shared across retry classes, ineligible/drift/missing-provenance `409 Conflict` response body `{ "retry_rejection_reason": "<enum>" }` with no activity write and no `retry_attempt` increment, enum assertions for `retry_not_eligible`, `retry_template_provenance_missing`, and `retry_template_drift_unconfirmed`, retry current-template behavior, retry drift conflict, retry drift confirmation, retry recovery provenance with `recovery_class` and without full-output duplication, fallback to `next_template_slug`, missing/disabled/duplicate/cross-workspace target slug stall, missing-assignee stall, timeout stall, chain termination, exact `activities.data.reason_code` assertions for every failure/stall case, duplicate-successor retry no-op, partial unique index enforcement for non-null `parent_task_id`, multiple NULL `parent_task_id` allowance, M62 preflight failure on duplicates, rollback SQL dropping the index, transaction rollback at each write boundary, successor lineage, and assignee resolution.
- Add retry response-contract and recovery-activity tests for each `chain_retry.recovery_outcome`: `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`, plus exact `task_pipeline_retry_chain_advancement`/`previous_reason_code` assertions, post-recovery idempotency/closure assertions for `successor_already_exists` versus post-`chain_terminated` `409`, and response-leak tests proving full corrected output, full parsed output, and routing traces are absent.
- Add adversarial evaluator tests and validator bound tests, including JSONPath filter/script rejection before `JSONPath()`.
- Add exact runtime dependency pin, lockfile, CI quality-gate, audit-remediation, and `pnpm audit --audit-level high` checks for `ajv`, `jsonpath-plus`, and `safe-regex`.
- Add a real running-app Playwright journey for workflow-template chain-field create/edit/read/delete under operator auth; component-only tests may supplement but do not satisfy P3-AC12.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, focused Playwright or e2e checks for affected UI flows, and static guardrails.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Constitution gates PASS pre/post design; strict scope, M62-only schema, Product Line scoping, and verification strategy recorded |
| `research.md` | Complete | Decisions recorded for workflow template source, task binding, structured-output bridge, safe validator/evaluator, retry recovery, successor uniqueness, UI/API editing, and verification |
| `data-model.md` | Complete | Workflow-template, task lineage, chain activity, retry recovery, M62, validator/evaluator data contracts, and state transitions recorded |
| `contracts/` | Complete | `api-workflows.md`, `task-chain-engine.md`, and `task-create.md` generated |
| `quickstart.md` | Complete | Verification flow and running-app Playwright journey documented |

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
- `advanceTaskChain` runs at every live non-`done` to `done` transition for pipeline-bound tasks (`runAegisReviews`, operator `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`) and cannot create duplicate successors; `idx_tasks_one_successor_per_parent` is the DB backstop for non-null `parent_task_id`; manual/API completions remain allowed only through the shared helper.
- Routing evaluator budget overruns stall automated chain advancement with an operator-visible `activities` row containing `data.reason_code='task_pipeline_routing_budget_exceeded'` and no successor.
- Successor creation calls `createTask()` exactly once.
- Scheduler behavior does not implement SPEC-005 `ready_for_owner`, SPEC-006 area-label routing, SPEC-007 dispositions/artifacts, SPEC-008 governance, SPEC-009 pilot behavior, or SPEC-011 CrabTrap behavior.
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
| data-integrity | 16 | 3 found and resolved; no consensus required | P3-AC1, P3-AC2, P3-AC3, P3-AC4, P3-AC6 |
| safe-evaluation | 20 | 4 found and resolved; no consensus required | P3-AC5, P3-AC8, P3-AC9, P3-AC10 |
| scheduler-safety | 30 | 0 gaps; no consensus required | P3-AC1, P3-AC2, P3-AC3, P3-AC4, P3-AC6a, P3-AC6b |
| regression-safety | 34 | 0 gaps; no consensus required | P3-AC6a, P3-AC8, P3-AC11, P3-AC12 |

### Addressing Gaps

If a checklist reports `[Gap]`, update the generated `spec.md` or `plan.md` with the smallest concrete clarification, then re-run that checklist. Do not resolve a gap by widening SPEC-004 into downstream specs.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/004-task-pipeline-engine/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P3-AC1 through P3-AC12 plus P3-AC6b.
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
- P3-AC4 requires missing output and invalid output failure tests with activity evidence, exact `data.reason_code` assertions, required template hash evidence, no successor, ordinary failed-to-`done` no-retry assertions, and explicit `retry_chain_advancement` recovery tests for latest eligible activity selection, no `activity_id` override or older-activity replay, missing selected-activity hash provenance side-effect-free `409 Conflict`, no `confirm_template_drift` bypass for missing provenance, repeated validation failure without a hard retry cap, corrected-output success, current-template use, drift conflict, drift confirmation, side-effect-free `409` response body `{ "retry_rejection_reason": "<enum>" }` with enum assertions/no-activity/no-attempt-increment assertions, `recovery_class='output_validation_failure'`, monotonic per-parent `retry_attempt` shared across retry classes, recovery provenance fields, and no full corrected-output duplication in `activities.data`.
- P3-AC4a requires terminal-success advancement-stall retry tests for routing expression rejection, routing timeout, missing/disabled/duplicate/cross-workspace target template, and missing assignee; tests must assert latest eligible activity selection, no `activity_id` override or older-activity replay, missing selected-activity hash provenance side-effect-free `409 Conflict`, `recovery_class='advancement_stall'`, parent terminal-success preservation throughout, repeated stalled retries without a hard retry cap while unresolved, monotonic per-parent `retry_attempt` shared across retry classes, no successor if the stall remains, successor/idempotent no-op if the stall resolves, normal chain termination with no successor/no new stall and `recovery_outcome='chain_terminated'` if current retry routing resolves no matching rule and no `next_template_slug`, post-`chain_terminated` side-effect-free `409 retry_not_eligible`, template-drift confirmation parity with output-failure retry, and side-effect-free `409` response body `{ "retry_rejection_reason": "<enum>" }` with enum assertions/no-activity/no-attempt-increment assertions for ineligible state/reason pairs.
- P3-AC4b requires retry `200 OK` response-contract tests for the normal task detail shape plus `chain_retry` fields, all allowed `recovery_outcome` values, `successor_task_id` null/non-null behavior, `chain_terminated` boolean behavior, `idempotent_successor` boolean behavior, exact recovery activity `data.reason_code='task_pipeline_retry_chain_advancement'` plus `previous_reason_code`, existing-successor post-recovery `200 OK successor_already_exists` assertions, post-`chain_terminated` `409 retry_not_eligible` assertions, retry `409 Conflict` no-activity assertions, and no full corrected-output/parsed-output/routing-trace leakage.
- P3-AC5 and P3-AC9 require adversarial fixtures, validator bound fixtures, AJV safety-option fixtures, conservative pattern-subset fixtures, JSONPath filter/script rejection, routing pre-validation cap fixtures, routing timeout-budget fixtures, and exact routing failure/stall `data.reason_code` assertions.
- P3-AC6 requires inheritance, first-hop parent lineage initialization, assignee resolution, missing-assignee stall with exact `task_pipeline_successor_assignee_missing` activity code, and successor lineage assertions.
- P3-AC6a requires `createTask()` call-count/side-effect assertions, source-specific callsite behavior assertions, duplicate-successor retry no-op behavior, and production-source direct INSERT grep.
- P3-AC6b requires transaction rollback tests that force failures after parent lineage initialization, validation failure writes, stall activity writes, duplicate-successor guard checks, and successor insertion, then assert no partial lineage, activity, state, or successor rows persist. It also requires a retry test proving an existing successor for the same `parent_task_id` returns success without creating a duplicate, plus M62 tests proving the duplicate preflight fails closed, the partial unique index rejects a second non-null `parent_task_id`, multiple NULL `parent_task_id` rows remain valid, and rollback drops the index.
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
| Total Tasks | 88 |
| Phases | 8 groups: Setup, Foundation, US1, US3, US2, US4, US5, Polish |
| Parallel Opportunities | 32 parallel-safe tasks |
| User Stories Covered | US1 14, US2 15, US3 13, US4 13, US5 11; setup/foundation/polish cover cross-cutting P3-AC evidence |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: feature-flag default OFF, additive behavior, TDD, strict-scope ramp, shared task creation, and safe evaluation.
2. Acceptance coverage: P3-AC1 through P3-AC12 plus P3-AC6b each have implementation or verification tasks.
3. Task creation consistency: every production task creation callsite moves through `createTask()` with source-specific side effects preserved and no runtime direct INSERT bypasses.
4. Validator consistency: every numeric bound and forbidden schema feature has a test and implementation task.
5. Evaluator consistency: allowlisted grammar, JSONPath no-script configuration/rejection, `maxRuleEvalMs=10`, and forbidden primitive checks are explicit in tasks and tests.
6. Scheduler consistency: flag-off, unbound tasks, flag-on-null, valid route, missing/invalid output, explicit retry recovery with template-drift detection, fallback, missing-target stall, missing-assignee stall, timeout stall, stable activity reason codes, termination, duplicate-successor retry no-op, existing-successor `200 OK` retry closure, post-`chain_terminated` `409 retry_not_eligible` closure, DB-backed one-successor-per-parent enforcement, transaction rollback, first-hop lineage initialization, and successor lineage behaviors are covered at every live non-`done` to `done` transition, including `runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`.
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
| A1 | HIGH | G6 gate and selected guardrail wording omitted SPEC-006 from the downstream-boundary set even though FR-043, T077, and the Analyze prompt require excluding SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, and SPEC-011 behavior. | Resolved by adding SPEC-006 to the G6 gate, scheduler-safety workflow guardrail, and plan static guardrail wording. Marker verification returned 0 findings. |

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
- Use `project_agent_assignments.agent_name` and `workflow_template.agent_role` for assignee resolution; missing assignee stalls with `data.reason_code='task_pipeline_successor_assignee_missing'` and creates no successor.
- Missing `tasks.resolution` or invalid output under an `output_schema` fails the parent task, records activity with `task_pipeline_output_missing` or `task_pipeline_output_invalid`, and creates no successor.
- Chain retry recovery uses only the explicit operator `retry_chain_advancement` action; ordinary failed-to-`done` updates must not rerun advancement. Failed-parent retry is eligible only for missing/invalid output and may restore terminal success only after validation passes. Terminal-success stall retry is eligible for routing rejection, routing timeout, target resolution stalls, and missing assignee; it keeps the parent terminal-success throughout, treats a resolved no-route/no-`next_template_slug` outcome as normal chain termination with `recovery_outcome='chain_terminated'`, writes `200 OK` retry recovery activities with `data.reason_code='task_pipeline_retry_chain_advancement'` and `previous_reason_code`, and never marks it `failed`. Retry selects the latest eligible SPEC-004 failure/stall activity only, accepts no `activity_id` override, never replays older failure/stall activity, returns side-effect-free `409 Conflict` with `{ "retry_rejection_reason": "<enum>" }` for ineligible latest state/reason pairs, missing selected-activity hash provenance, unconfirmed template drift, or post-`chain_terminated` retry calls, returns existing-successor `200 OK successor_already_exists` with `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`, enforces no hard retry-attempt cap for still-unresolved failures/stalls, and uses current template rules only after schema/routing drift is absent or explicitly confirmed.
- Retry `200 OK` responses include normal task detail data plus bounded `chain_retry` summary fields and never expose full corrected output, parsed output, or routing traces.
- Routing timeout or unresolved target slug stalls automated chain advancement with stable `activities.data.reason_code` evidence and creates no successor; the parent remains in its terminal success state and manual operator triage uses `retry_chain_advancement` after correcting routing/template/assignee configuration.
- Hook `advanceTaskChain` at every live non-`done` to `done` transition for pipeline-bound tasks, wrap all chain writes in one database transaction, treat existing-successor retries for the same `parent_task_id` as successful no-ops, and enforce one successor per parent with `idx_tasks_one_successor_per_parent`; manual/API `done` transitions remain allowed only through the shared helper.
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
| 0 - Archive Sweep and baseline discovery | T001-T008 | 8 | SPEC-001 chain columns and workflow-template fields verified in M54/M55; direct task insert migration matrix found `src/app/api/tasks/route.ts`, `src/app/api/github/route.ts`, `src/lib/github-sync-engine.ts`, and `src/lib/recurring-tasks.ts`; exact runtime pins are present in package/lockfile; `pnpm audit --audit-level high` is blocked locally by registry ENOTFOUND and remains a CI/final-verification obligation; M62 rollback and SPEC-004 guardrail CI step added. |
| 1 - Foundational strict-scope surfaces | T009-T016 | 8 | Added workflow-template chain types, validator/routing fixture manifests, `createTask()`/validator/evaluator scaffolds, no-op chain advancement/retry seams, and M62 duplicate-preflight migration scaffolding. `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed; `pnpm spec004:guardrails` remains RED only on the four direct task INSERT callsites owned by US1. |
| 2 - Shared task creation helper | T017-T021, T023-T030 | 13 | Added focused RED contract/guard tests for API creation, GitHub import, GitHub sync import, recurring spawn, pipeline successor creation, source-profile matrix, and direct production task inserts. Implemented shared `createTask()` with source profiles, bounded result shape, caller-owned transaction support, duplicate guards, deferred outbound intent, and migrated API/GitHub/recurring callsites plus the task-dispatch successor seam. `pnpm test src/lib/__tests__/task-create.api.test.ts src/lib/__tests__/task-create.github-import.test.ts src/lib/__tests__/task-create.github-sync.test.ts src/lib/__tests__/task-create.recurring.test.ts src/lib/__tests__/task-create.pipeline-successor.test.ts src/lib/__tests__/task-create.callsite-matrix.test.ts src/lib/__tests__/task-create.direct-insert-guard.test.ts`, `pnpm spec004:guardrails`, and `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed on 2026-05-01T18:21:04Z. T022 is intentionally left pending because full flag-off/unbound/null-chain completion regression coverage requires the chain advancement runtime owned by later tasks. |
| 3 - Validator and evaluator safety | T031-T037, T039-T043 | 12 | Added RED fixtures for validator bounds, AJV safety profile, conservative pattern subset, LRU/p95 corpus checks, routing validity/adversarial/budget behavior, and static unsafe-primitive/`ajv-formats` guardrails. Implemented constrained AJV compilation with pre-validation caps, safe-regex plus conservative pattern checks, bounded result shaping, `(template_id, schema_sha256)` LRU cache, hand-written routing grammar, JSONPath traversal with `eval: false`, pre-screened forbidden syntax, result caps, and bounded rejection/budget outputs. Focused suite passed 22/22; `pnpm spec004:guardrails` and `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed on 2026-05-01T18:31:37Z. T038 remains pending because exact advancement stall activity reason-code assertions require the later `advanceTaskChain` runtime. |
| 4 - Scheduler and successor routing | T022, T038, T049-T052, T056-T058, T072-T082 | 20 | Added RED chain/runtime/M62 coverage for eligibility, output validation, routing, target stalls, terminal hooks, overhead p95, lineage, assignee resolution, transaction rollback, existing-successor idempotency, M62 uniqueness/rollback, and downstream scope. Implemented feature-flagged `advanceTaskChain`, structured-output validation from `tasks.resolution`, ordered routing/static fallback/termination, target and assignee stalls with stable activity reason codes, transactional lineage/successor creation through `createTask()`, post-commit sync intent, idempotent existing-successor no-op, and terminal-success hooks in Aegis review, quality-review, bulk task update, and detail task update. Focused suite passed 31/31; `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed on 2026-05-01T18:59:25Z. US4 retry recovery remains pending by scope. |
| 5 - Template API/UI chain fields | T044-T048, T053-T055 | 8 | Added workflow-template chain-field API contract/scope/delete tests plus editor tests. Implemented workflow chain validation helpers, Product Line scoped `/api/workflows` reads/writes/usage/delete, query-parameter delete compatibility with JSON-body backward compatibility, chain-field response parsing, and scoped editor controls/error display. Focused suite passed 14/14; `pnpm spec004:guardrails` and `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed on 2026-05-01T18:44:17Z. |
| 6 - Explicit retry recovery | T059-T071 | 13 | Added RED retry route suites for output failures, advancement stalls, conflicts, bounded responses, provenance/drift, repeated attempts, and terminal recovery. Implemented operator-only `retry_chain_advancement`, latest eligible activity selection, side-effect-free `409` rejection enums, template provenance hashes and drift confirmation, failed-parent revalidation/restoration, terminal-success stall retry, repeated attempts, existing-successor idempotency, chain termination closeout, bounded `chain_retry` responses, and recovery activity metadata without full output/routing leakage. Focused retry suite passed 15/15; chain regression suite passed 22/22; `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false` passed on 2026-05-01T19:13:53Z. |
| 7 - Documentation, guardrails, audit remediation, and verification | T083-T088 | 6 | Updated `docs/orchestration.md`, added the running-app Playwright workflow-template journey in `tests/e2e/task-pipeline-workflow-templates.spec.ts`, expanded SPEC-004 static guardrails, moved invalid route test exports to helper modules for Next build compatibility, remediated high-severity audit advisories with `next`/`eslint-config-next` upgrades and narrow pnpm overrides for vulnerable transitive ranges, recorded final local gate evidence below, and created implementation commit `5f92f179d7f89a256e09589d982354be1f32a95d`. |

### Final Higher-Ulimit Verification Evidence - 2026-05-01

- Doctor: `.specify/extensions/doctor/scripts/bash/doctor.sh` was remediated to validate this repo's `.specify/{scripts,templates,memory,extensions}` layout and exact agent command directories; it now exits 0 and reports the project healthy.
- Task reconciliation: all 88 generated tasks are checked complete in `specs/004-task-pipeline-engine/tasks.md`; no task-referenced repository file is missing after correcting the stale T074 test path.
- `pnpm spec004:guardrails`: passed.
- `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 10 pre-existing warnings and 0 errors.
- `pnpm test`: passed with 150 test files and 1182 tests under `ulimit -n 8192`.
- `pnpm build`: passed with the normal Turbopack production build under `ulimit -n 8192`; the attempted mocked-font variant was discarded because the mock path breaks Turbopack's internal Google font CSS module resolver.
- Focused Playwright regression/e2e suite passed 25/25 after aligning legacy `/api/workflows` e2e helpers with the Product Line scoped contract introduced by SPEC-004.
- `pnpm test:e2e`: passed with 532/532 Playwright tests under `ulimit -n 8192`.
- Storybook/Argos coverage for the new Orchestration Bar task-pipeline UI was added in `src/components/panels/orchestration-bar.spec-004.stories.tsx`; `pnpm test:visual:storybook` passed 12/12 stories and `pnpm test:visual:argos-metadata` verified 24 screenshot metadata files across 12 stories from the isolated `screenshots/storybook` root, including 2 SPEC-004 task-pipeline workflow stories.
- `pnpm audit:high`: passed after audit remediation and network approval; npm reported 11 remaining vulnerabilities, all low/moderate, with 0 high.

### T088 Commit Evidence - 2026-05-01

- Pre-commit sanity checks passed in the current worktree: `git diff --check`, `node -e "JSON.parse(...autopilot-state.json...)"`, `pnpm spec004:guardrails`, and `pnpm exec tsc -p tsconfig.spec-strict.json --pretty false`.
- `git add -A` staged the SPEC-004 implementation and generated artifacts, covering 91 files in the cached diff.
- Initial commit attempts from the nested Codex sandbox were blocked by linked-worktree git metadata writes outside that session's writable root; the parent session retried with appropriate git metadata access.
- `git -c commit.gpgsign=false commit -m "feat(spec-004): implement task pipeline engine"` succeeded as commit `5f92f179d7f89a256e09589d982354be1f32a95d`.
- T088 is complete. Post-implementation push/PR tasks can proceed from commit `5f92f179d7f89a256e09589d982354be1f32a95d`.

### PR Review Handoff - 2026-05-01

- Post-verification cleanup and scoped workflow e2e compatibility evidence were committed as `fe63fef` (`test(spec-004): align scoped workflow verification`).
- Branch `004-task-pipeline-engine` was pushed to `origin`.
- PR #22 is open for review: https://github.com/racecraft-lab/mission-control/pull/22
- Immediate review-thread check returned no review threads. Initial GitHub checks were pending at handoff: Analyze (actions), Analyze (javascript-typescript), argos-storybook, docker-ui-e2e, and quality-gate.

### Doctor Remediation - 2026-05-01

- `.specify/extensions/doctor/scripts/bash/doctor.sh` now checks `.specify/templates`, `.specify/memory`, `.specify/memory/constitution.md`, `.specify/scripts/bash`, and `.specify/extensions` instead of stale root-level SpecKit paths.
- AI agent detection now reports an agent only when the actual command directory exists, removing false warnings caused by unrelated `.github/` and `.agents/` directories.
- Re-run evidence: `ulimit -n 8192; bash .specify/extensions/doctor/scripts/bash/doctor.sh` exited 0 and printed "All checks passed — project looks healthy!"

### Storybook/Argos Remediation - 2026-05-01

- Added `src/components/panels/orchestration-bar.spec-004.stories.tsx` with Argos-backed stories for editing workflow chain fields and the routing-without-output-schema validation error state.
- Generalized `scripts/verify-argos-storybook-metadata.mjs`, `.github/workflows/argos-storybook.yml`, `vitest.storybook.config.ts`, Playwright Argos build names, shared screenshot envs, and `scripts/verify-argos-test-metadata.mjs` so visual coverage uses `mission-control-*` labels and domain tags instead of generic `spec-002-*` harness names.
- Feature Flag Admin Storybook and Playwright coverage now use platform/domain labels; the Feature Flags component/story/e2e surface no longer renders or fixtures SPEC-002 as UI copy. Remaining SPEC-002 hits from the deep scan are limited to SPEC-002 Product Line switcher-owned fixtures/tests, the SPEC-002 workflow wrapper, the product-line-switcher story path, and feature-registry ownership metadata.
- Storybook screenshots now write to `screenshots/storybook`, and `pnpm test:visual:argos-metadata` reads that same isolated root so stale ignored screenshots from renamed stories cannot inflate the gate.
- Re-run evidence: `pnpm test:visual:storybook` passed 12/12 stories, `pnpm test:visual:argos-metadata` verified 24 screenshot metadata files across 12 stories, focused Product Line + Feature Flag Admin Playwright passed 5/5, `pnpm test:e2e:argos-metadata` verified 11 screenshot metadata files across 5 Playwright tests, `pnpm test src/components/panels/orchestration-bar.test.tsx src/lib/__tests__/feature-flags.test.ts` passed 17/17, `pnpm typecheck` passed, and `pnpm lint` passed with 0 errors / 10 pre-existing warnings.

---

## Post-Implementation Checklist

- [x] Archive Sweep evidence is recorded and excludes `SPEC-004`.
- [x] All generated tasks are marked complete in `specs/004-task-pipeline-engine/tasks.md`.
- [x] Acceptance evidence exists for P3-AC1 through P3-AC12 plus P3-AC6b.
- [x] `src/lib/task-create.ts` exists and owns all task creation side effects.
- [x] Source-specific API, GitHub import, GitHub sync import, recurring, and pipeline-successor behavior is preserved through `createTask()`.
- [x] Direct runtime `INSERT INTO tasks` is gone from production source outside `src/lib/task-create.ts`; any test fixture inserts are deliberately excluded or migrated.
- [x] `src/lib/output-schema-validator.ts` enforces every roadmap numeric bound and forbidden schema feature.
- [x] Schema `pattern`/`patternProperties` acceptance treats `safe-regex` as necessary but not sufficient and enforces the conservative pattern subset with adversarial fixtures.
- [x] `src/lib/routing-rule-evaluator.ts` uses JSONPath traversal with JavaScript execution disabled, rejects JSONPath filters/scripts before `JSONPath()`, enforces `maxRuleEvalMs=10`, and uses a hand-written allowlisted grammar.
- [x] `advanceTaskChain` implements valid routing, missing-output failure, invalid-output failure, explicit output-validation retry recovery, explicit terminal-success advancement-stall retry recovery including no-route/no-`next_template_slug` retry-resolved chain termination with `recovery_outcome='chain_terminated'`, latest eligible failure/stall activity selection with no `activity_id` override or older-activity replay, current-template execution with template-drift confirmation, missing selected-activity hash provenance fail-closed behavior, no-hard-cap retry attempts with monotonic per-parent audit evidence shared across retry classes while unresolved, existing-successor `200 OK successor_already_exists` idempotency, post-`chain_terminated` side-effect-free `409 retry_not_eligible`, side-effect-free retry `409 Conflict` behavior with `{ "retry_rejection_reason": "<enum>" }`/no activity/no attempt increment, fallback, missing-assignee stall, timeout/unresolved-target advancement stall, exact `activities.data.reason_code`, template hash, and `recovery_class` metadata for every failure/stall/retry activity including `task_pipeline_retry_chain_advancement` on `200 OK` recovery activities, termination, duplicate-successor retry no-op, transaction rollback, successor creation, first-hop parent lineage initialization, and successor lineage behavior at every live non-`done` to `done` transition for pipeline-bound tasks, including `runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`; M62 enforces one successor per non-null `parent_task_id` at the DB layer with preflight and rollback evidence.
- [x] `retry_chain_advancement` `200 OK` responses return normal task detail data plus `chain_retry` with all required fields/outcomes, existing-successor `successor_task_id`/`idempotent_successor=true`, chain-termination `successor_task_id=null`/`chain_terminated=true`, and no full corrected-output, parsed-output, or routing-trace leakage.
- [x] `orchestration-bar.tsx`, `/api/workflows`, and create/update workflow schemas expose, validate, and persist the workflow-template chain fields required by the roadmap, reject `routing_rules` without `output_schema`, allow static `next_template_slug` without schema, preserve operator-only writes, and repair `DELETE /api/workflows?id=...` compatibility.
- [x] `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies in `package.json` and `pnpm-lock.yaml`.
- [x] `.github/workflows/quality-gate.yml` runs SPEC-004 dependency, audit, direct-INSERT, unsafe-primitive, and downstream-drift guardrails.
- [x] `pnpm audit --audit-level high` passes before merge after SPEC-004 audit remediation.
- [x] `tsconfig.spec-strict.json` and `eslint.config.mjs` include new production modules.
- [x] `docs/orchestration.md` describes declarative task chains and current lifecycle/status terminology.
- [x] Prohibited-drift grep checks pass.
- [x] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [x] `pnpm lint` passes or any environment failure is documented with evidence.
- [x] `pnpm test` passes or any environment failure is documented with evidence.
- [x] `pnpm build` passes or any environment failure is documented with evidence.
- [x] Real running-app Playwright verification for P3-AC12 passes.
- [x] Storybook/Argos coverage exists for new SPEC-004 Orchestration Bar UI states.
- [x] `docs/ai/rc-factory-technical-roadmap.md` records SPEC-004 implementation evidence after verification.
- [x] `docs/rc-factory-v1-prd.md` reflects SPEC-004 completion after verification.
- [x] Branch is pushed for review.
- [x] Retrospective evidence is recorded in `specs/004-task-pipeline-engine/retrospective.md`.

---

## Lessons Learned

### What Worked Well

- The phase-sliced implementation kept RED/GREEN evidence tied to the generated task ranges, which made the final 88-task reconciliation straightforward.
- The explicit `createTask()` helper plus static guardrails closed the highest-risk side-effect parity gap without broadening SPEC-004 into later artifact or state-machine specs.

### Challenges Encountered

- The local sandbox hit EMFILE and listener/socket restrictions during long autopilot runs; rerunning final gates with `ulimit -n 8192` and the approved execution surface was required for trustworthy unit, build, e2e, and audit evidence.
- Legacy e2e workflow tests assumed global `/api/workflows`; SPEC-004's Product Line scoped contract required test helpers to select a non-Facility workspace before exercising workflow CRUD and injection guards.

### Patterns to Reuse

- Keep post-implementation verification separate from implementation commits so sandbox failures, stale extension assumptions, and genuine product regressions are distinguishable in the workflow ledger.
- For later Product Line scoped APIs, update shared e2e helpers first and then run both focused and full Playwright suites before treating compatibility repairs as complete.

---

## Project Structure Reference

```text
racecraft-mission-control/
|-- src/lib/task-create.ts                  # New SPEC-004 shared task creation helper
|-- src/lib/output-schema-validator.ts      # New constrained JSON Schema validator
|-- src/lib/routing-rule-evaluator.ts       # New safe routing expression evaluator
|-- src/types/workflow-template.ts          # New workflow-template chain metadata types
|-- src/lib/migrations.ts                   # M62 one-successor-per-parent unique index
|-- docs/migrations/rollback-M62.sql        # Manual rollback for M62 unique index
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
