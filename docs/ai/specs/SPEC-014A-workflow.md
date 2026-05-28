# SpecKit Workflow: SPEC-014A - Sandbox Ownership and Lifecycle Contract

**Template Version**: 1.0.0
**Created**: 2026-05-28
**Purpose**: Execute the SpecKit workflow for SPEC-014A from a human-reviewed Design Concept.

---

## Design Concept

This workflow was enriched from a `$grill-me` interview run during `$speckit-scaffold-spec`.
The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-014A-design-concept.md
```

Re-read the Design Concept before each phase. It is the source of truth for scoping decisions captured during setup. If a generated artifact contradicts it, treat the generated artifact as wrong unless it records an explicit revision.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Archive Sweep | `$speckit-archive-run` | Pending | Discover prior merged-spec cleanup before Phase 0 |
| Specify | `$speckit-specify` | Complete | Generated `specs/014a-sandbox-lifecycle-contract/spec.md` with checklist |
| Clarify | `$speckit-clarify` | Pending | Resolve narrow API/schema/path questions |
| Plan | `$speckit-plan` | Pending | Generate architecture, data model, contracts, quickstart |
| Checklist | `$speckit-checklist` | Pending | Run recommended domain checklists after Plan |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered TDD task list |
| Analyze | `$speckit-analyze` | Pending | Check consistency and reviewability before implementation |
| Implement | `$speckit-implement` | Pending | Execute tasks with red-green-refactor |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | Stories and requirements are clear; no unresolved `[NEEDS CLARIFICATION]` markers |
| G2 | After Clarify | Decisions are recorded in `spec.md`; deferred UI/adapter/runner scope stays out |
| G3 | After Plan | Constitution gates pass; next migration id and rollback are verified; API/read model shape is approved |
| G4 | After Checklist | All `[Gap]` markers are resolved or explicitly scoped out |
| G5 | After Tasks | Tasks are small, ordered, TDD-ready, and keep UI/adapter/runner work deferred |
| G6 | After Analyze | No CRITICAL findings; reviewability warning is accepted only for the lifecycle safety boundary |
| G7 | After Implement | Local verification plus manual API UAT are complete |

---

## Prerequisites

### Branch and Worktree

- Branch: `014a-sandbox-lifecycle-contract`
- Worktree: `.worktrees/014a-sandbox-lifecycle-contract`
- Remote branch: `origin/014a-sandbox-lifecycle-contract`
- Base evidence: SPEC-013B is complete and merged; SPEC-014A is unblocked for sandbox-lifecycle planning.

### Constitution Validation

Before every phase, verify these Mission Control constitution constraints:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Flag OFF preserves current dispatch/runtime behavior and creates no sandbox lifecycle rows or events | Tests cover `FEATURE_AGENT_RUNNER_SANDBOXES=false`; legacy dispatch remains unchanged |
| V. Feature-Flag Resolution Discipline | Runtime checks use `resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', ctx)` only | Static grep and focused tests; no inline `process.env.FEATURE_` runtime checks |
| VII. Additive Migration Policy | Any new lifecycle schema is additive and has rollback SQL | Verify live migrations; expected next id is M79 unless live schema changed |
| X. Observability and Auditability | State-changing sandbox lifecycle transitions emit durable, safe evidence | Event table tests and read-model assertions |
| XIII. Defensive Boundaries | Path and metadata inputs are validated and errors are structured | Adversarial path corpus and boundary-error tests |
| XVI. Reviewability | Scope exception is narrow and documented | Workflow and PR packet record split exception and deferrals |

### Reviewability Setup Gate

Setup gate result against `docs/ai/rc-factory-technical-roadmap.md`:

- `status: exception`
- `pass: true`
- `transition_exception: true`
- warnings: production-file and primary-surface thresholds exceeded by roadmap-level projection
- accepted split decision: SPEC-014A may proceed only for the lifecycle safety boundary: one additive schema pair, one helper/API surface, production fakes, and tests

Deferred surfaces:

- Operator UI: SPEC-014B runtime inventory first visibility
- Adapter manifests and fake registry capability resolution: SPEC-014B
- Real execution and harness adapter behavior: SPEC-014C/D
- Retry, release, cancel, and debug controls: SPEC-013C

### External Current-Source Requirement

Before Specify and again before Plan, fetch current external context and cite it in generated artifacts:

- OpenAI Harness Engineering article: `https://openai.com/index/harness-engineering/`
- OpenAI Symphony repository and SPEC: `https://github.com/openai/symphony` and `https://github.com/openai/symphony/blob/main/SPEC.md`

Use these sources only for workspace safety, lifecycle vocabulary, context legibility, and harness-engineering lessons. Do not import Symphony runner/client algorithms into SPEC-014A.

---

## Specification Context

| Field | Value |
|-------|-------|
| Spec ID | SPEC-014A |
| Name | Sandbox Ownership and Lifecycle Contract |
| Branch | `014a-sandbox-lifecycle-contract` |
| Dependencies | SPEC-013B |
| Enables | SPEC-014B |
| Priority | P1 |
| Tool count | 0 |
| Tool names | `[]` |
| Primary review surface | schema/migration plus harness/adapter-adjacent lifecycle helper, accepted as a narrow transition exception |

### Roadmap Scope

Define deterministic, sanitized, product-line-scoped sandbox keys/paths and lifecycle hooks for `mission_control`, `openclaw`, and `external_harness` ownership using fakes only. No real harness launches.

### Success Criteria Summary

- Sandbox paths cannot escape the configured root.
- Lifecycle events are inspectable through durable state and a read API.
- Disabling `FEATURE_AGENT_RUNNER_SANDBOXES` prevents all sandbox create/run/mutation paths and creates no lifecycle rows or events.
- Fake Mission Control, OpenClaw, and external-harness lifecycle owners exercise the same vocabulary without launching real harnesses.
- SPEC-014B roadmap/spec text owns first operator-visible runtime inventory integration with read-only sandbox lifecycle references; SPEC-014A does not add UI.

---

## Phase 1: Specify

**When to run:** Start the feature specification. Focus on what and why, not implementation.

### Specify Prompt

```text
$speckit-specify

Feature: SPEC-014A - Sandbox Ownership and Lifecycle Contract

Source artifacts:
- docs/ai/rc-factory-technical-roadmap.md, SPEC-014A section
- docs/ai/specs/SPEC-014A-design-concept.md
- .specify/memory/constitution.md
- current OpenAI Harness Engineering article
- current OpenAI Symphony README and SPEC

Problem statement:
Mission Control has claim/reconciliation authority from SPEC-013B but does not yet have an explicit sandbox ownership and lifecycle contract for execution contexts. Before any real harness adapter can launch work, the system needs deterministic sandbox keys, bounded path resolution, durable lifecycle state, fake lifecycle owners, safe cleanup/rollback behavior, and read-only inspectability.

Specify the requirements for:
- Durable SQLite lifecycle state using a narrow schema pair: `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`.
- Closed owner enum: `mission_control`, `openclaw`, `external_harness`.
- Stable ID-based sandbox key shape with sanitized readability slugs:
  `workspace/<workspace_id>/product-line/<product_line_slug>/task/<task_id>/stage/<stage_key>/attempt/<attempt_id>/owner/<owner>`.
- Default filesystem root `<MISSION_CONTROL_DATA_DIR>/sandboxes` with optional reviewed per-workspace config.
- Bounded path helper that rejects traversal, absolute paths, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized keys, overlong segments, and root escape after normalization.
- Lifecycle hooks: `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`.
- Closed coarse lifecycle statuses: `created`, `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, `cleanup_failed`.
- Append-only event rows for detailed reason codes and safe metadata.
- Idempotent create for the same deterministic key while nonterminal; conflicting owner/path inputs fail closed with validation evidence.
- Linkage to `workspace_id`, `task_id`, `stage_key`, optional `task_stage_attempt_id`, and optional `task_stage_claim_id`; sandbox ownership is not claim authority.
- Read-only `sandbox_lifecycle.v1` API that returns disabled-state evidence, current status, owner, sanitized path evidence, and recent events.
- API index and OpenAPI parity for any added route.
- Production-code fake owner implementations behind `FEATURE_AGENT_RUNNER_SANDBOXES`, with tests proving no real harness launch.
- Flag OFF behavior: all create/prepare/running/terminal/cleanup mutations are blocked and insert no lifecycle rows/events; reads remain available and report disabled-state evidence.
- Minimal retention policy: lifecycle rows are durable audit evidence; physical fake artifacts are removed on cleanup/rollback; stale `cleanup_pending` rows are inspectable but not auto-reaped in SPEC-014A.
- Manual UAT: run a fake lifecycle with the feature enabled, inspect read API evidence, then disable the flag and verify mutations are blocked while reads show disabled state.

Out of scope:
- Real harness launches, resume/stop behavior, token accounting, adapter manifests, fake adapter registry, runtime inventory UI, lifecycle controls, retry/release/cancel/debug controls, tracker truth, successor selection, governance policy changes, and auto-merge.
- Operator UI is explicitly deferred to SPEC-014B first runtime inventory integration, with richer controls left to SPEC-014C/D or a later dedicated spec.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 40 |
| User Stories | 5 |
| Acceptance Criteria | 17 |

### Files Generated

- `specs/014a-sandbox-lifecycle-contract/spec.md`
- `specs/014a-sandbox-lifecycle-contract/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any requirement can be interpreted multiple ways. Maximum 5 targeted questions per session.

### Clarify Prompts

#### Session 1: Schema and Read Model

```text
$speckit-clarify

Focus on SPEC-014A schema and read-model requirements:
- Exact columns and indexes for `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`.
- Whether the lifecycle read API is task-scoped, lifecycle-scoped, or both.
- How optional `task_stage_attempt_id` and `task_stage_claim_id` are represented without making sandbox ownership the active lock.
- Pay special attention to: preserving durable audit rows after cleanup while avoiding sensitive host path leakage.
```

#### Session 2: Path Safety and Metadata Safety

```text
$speckit-clarify

Focus on SPEC-014A sandbox key/path safety:
- Sanitized slug rules and collision handling.
- Exact adversarial corpus for traversal, absolute paths, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized keys, overlong segments, and root escape after normalization.
- Which path evidence may be persisted: sandbox key, owner, root identifier, sanitized relative path, handle id, lifecycle ids, timestamps, and redacted reason codes only.
- Pay special attention to: proving bounded-path behavior without persisting raw path fragments or absolute host paths.
```

#### Session 3: Lifecycle and Cleanup

```text
$speckit-clarify

Focus on SPEC-014A lifecycle behavior:
- Hook order for `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`.
- Status transitions for `created`, `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, and `cleanup_failed`.
- Idempotent duplicate create behavior and conflict failure evidence.
- Partial-create rollback and cleanup-failure evidence.
- Pay special attention to: keeping cleanup inspectable without adding an auto-reaper or operator UI.
```

#### Session 4: Flag, API, and Scope Deferrals

```text
$speckit-clarify

Focus on SPEC-014A feature flag, API, and scope boundaries:
- `FEATURE_AGENT_RUNNER_SANDBOXES` flag-off mutation behavior must create no lifecycle rows/events.
- Reads remain available and return disabled-state evidence.
- Auth and workspace scope should match existing task evidence or task-stage-attempt read patterns.
- API index/OpenAPI parity is required for any added route.
- Pay special attention to: ensuring SPEC-014A does not add operator UI, adapter manifests, real execution, retry controls, or claim authority.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Schema and read model | 5 | Lifecycle/event columns, required indexes, task-scoped plus task-authorized lifecycle detail reads, nullable attempt/claim evidence links, and safe path evidence fields clarified in `spec.md`. |
| 2 | Path and metadata safety | 1 | Sandbox key segments must normalize once then pass a narrow printable ASCII allowlist; traversal, absolute syntax, dot/reserved names, unsafe Unicode/control characters, overlong segments, and duplicate normalized values fail closed. |
| 3 | Lifecycle and cleanup | 2 | Canonical hook transition graph and cleanup/rollback evidence semantics clarified; physical fake artifacts are removable while lifecycle rows/events remain durable. |
| 4 | Flag, API, and scope | 2 | Flag-off writes insert no rows/events and touch no fake artifacts; reads return disabled-state evidence, use viewer plus workspace/task scoping, and require API index/OpenAPI parity. |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/014a-sandbox-lifecycle-contract/plan.md`.

### Plan Prompt

```text
$speckit-plan

Tech stack:
- Next.js 16 App Router and React 19.
- TypeScript 5.7 strict for new SPEC-014A modules.
- SQLite through `better-sqlite3` and `src/lib/migrations.ts`.
- Zustand and Tailwind remain unchanged unless Plan proves read-only UI is necessary, which the Design Concept defers to SPEC-014B.
- Vitest for helper, migration, route, and scope tests; Playwright only if a user-facing UI journey unexpectedly changes.
- pnpm only.

Plan SPEC-014A from:
- `specs/014a-sandbox-lifecycle-contract/spec.md`
- `docs/ai/specs/SPEC-014A-design-concept.md`
- `.specify/memory/constitution.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- current OpenAI Harness Engineering and Symphony sources fetched during this phase

Architecture decisions from the Design Concept:
- Add additive lifecycle persistence as `agent_sandbox_lifecycles` plus `agent_sandbox_lifecycle_events`; verify live migration id before choosing the final number. Expected next id is `079_agent_sandbox_lifecycles` because M78 is `task_stage_claims`.
- Add manual rollback SQL at `docs/migrations/rollback-M79.sql` unless live migration verification chooses a different id.
- Add one narrow helper module for key/path validation and lifecycle transitions.
- Add production-code fake owners for `mission_control`, `openclaw`, and `external_harness` behind `FEATURE_AGENT_RUNNER_SANDBOXES`.
- Add a minimal read-only API returning `sandbox_lifecycle.v1`; choose exact route by matching existing task evidence and task-stage-attempt route patterns.
- Update API index and OpenAPI docs for the route.
- Add new TS/TSX modules to `tsconfig.spec-strict.json` and `eslint.config.mjs`.
- Keep UI out of SPEC-014A. Update roadmap/spec traceability so SPEC-014B owns first operator-visible runtime inventory integration with read-only sandbox lifecycle references.

Constraints:
- Do not import or call real harness, gateway launch, OpenClaw command runner, Codex/Claude/Hermes/OpenCode execution, `advanceTaskChain`, `createTask`, retry/release/cancel controls, or adapter manifest behavior.
- Do not use sandbox lifecycle rows as active claims or locks. SPEC-013B remains claim/reconciliation authority.
- Do not add automatic cleanup reaper, runtime inventory UI, dashboard controls, token accounting, or real adapter capability checks.
- Persist only bounded logical path evidence and sanitized relative paths. Do not persist raw user path fragments, raw prompts, tokens, auth headers, provider responses, raw session payloads, or absolute host paths.
- Flag-off mutation attempts must not insert lifecycle rows/events.

Manual UAT plan:
- In a disposable target, enable `FEATURE_AGENT_RUNNER_SANDBOXES` for one workspace and run a fake lifecycle.
- Inspect `sandbox_lifecycle.v1` read API for owner, key, sanitized relative path, lifecycle status, events, cleanup, and bounded-root evidence.
- Disable the flag and verify create/run mutations are blocked and insert no lifecycle rows/events while reads show disabled-state evidence.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, constitution gates, reviewability split exception, source layout, and external-source mapping recorded. |
| `research.md` | Complete | Harness Engineering and Symphony boundary mapping recorded; no Symphony runner/client algorithms imported. |
| `data-model.md` | Complete | M79 lifecycle/event table columns, indexes, event types, and invariants specified. |
| `contracts/` | Complete | `sandbox_lifecycle.v1` task-authorized read API contract specified. |
| `quickstart.md` | Complete | Fake lifecycle, read API inspection, cleanup, and flag-off UAT steps specified. |

---

## Phase 4: Domain Checklists

Run after Plan. Target 2-4 domains; use these enriched prompts unless Plan changes the risk profile.

### 1. Data Integrity Checklist

Why this domain: SPEC-014A adds additive lifecycle tables, rollback SQL, idempotent create semantics, and durable cleanup/audit evidence.

```text
$speckit-checklist data-integrity

Focus on SPEC-014A requirements:
- Additive `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events` schema, indexes, and rollback SQL.
- Idempotent duplicate create semantics and conflict failure evidence.
- Durable rows retained after cleanup with append-only `cleaned_up`, `rolled_back`, and `cleanup_failed` events.
- Optional links to task-stage attempts and claims without turning sandbox lifecycle into claim authority.
- Pay special attention to: migration id verification and rollback completeness.
```

### 2. Security Checklist

Why this domain: Sandbox keys and paths are boundary-sensitive and may reference host filesystem roots, task identity, and external handles.

```text
$speckit-checklist security

Focus on SPEC-014A requirements:
- Bounded path resolution under `<MISSION_CONTROL_DATA_DIR>/sandboxes` or reviewed per-workspace root.
- Rejection of traversal, absolute paths, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized keys, overlong segments, and root escape.
- Metadata redaction rules for raw paths, prompts, tokens, auth headers, provider/session payloads, and secret-shaped strings.
- Authenticated workspace/task-scoped read API with no cross-workspace leakage.
- Pay special attention to: proving no raw user path fragments or absolute host paths persist in lifecycle events.
```

### 3. API Contracts Checklist

Why this domain: SPEC-014A adds a `sandbox_lifecycle.v1` read API and must preserve API index/OpenAPI parity.

```text
$speckit-checklist api-contracts

Focus on SPEC-014A requirements:
- Exact `sandbox_lifecycle.v1` response schema, disabled-state shape, event shape, and error codes.
- Route auth, workspace scoping, not-found, flag-disabled, validation, and cross-workspace rejection behavior.
- API index and OpenAPI parity.
- Snapshot or contract tests proving read APIs do not mutate lifecycle rows/events.
- Pay special attention to: consistency between `spec.md`, `plan.md`, API contracts, and existing task evidence route patterns.
```

### 4. Error Handling and Reliability Checklist

Why this domain: Partial lifecycle creation, cleanup failures, disabled mutations, and fake owner failures need classified durable outcomes.

```text
$speckit-checklist error-handling

Focus on SPEC-014A requirements:
- Partial-create rollback and best-effort compensating cleanup behavior.
- `cleanup_failed` versus `rolled_back` evidence and reason-code vocabulary.
- Disabled feature-flag mutation results and no-row/no-event proof.
- Fake owner boundary errors that fail closed without launching or switching harnesses.
- Pay special attention to: structured failure evidence that is actionable but does not leak secrets or host-sensitive paths.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 12 | 0 | `spec.md`, `plan.md`, `data-model.md` |
| security | 12 | 0 | `spec.md`, `plan.md`, `data-model.md`, `contracts/sandbox-lifecycle-api.md` |
| api-contracts | 10 | 0 | `spec.md`, `plan.md`, `contracts/sandbox-lifecycle-api.md` |
| error-handling | 10 | 0 | `spec.md`, `plan.md`, `data-model.md`, `quickstart.md` |

---

## Phase 5: Tasks

**When to run:** After checklists complete and gaps are resolved. Output: `specs/014a-sandbox-lifecycle-contract/tasks.md`.

### Tasks Prompt

```text
$speckit-tasks

Generate dependency-ordered TDD tasks for SPEC-014A using:
- `specs/014a-sandbox-lifecycle-contract/spec.md`
- `specs/014a-sandbox-lifecycle-contract/plan.md`
- `docs/ai/specs/SPEC-014A-design-concept.md`

Task structure:
- Start with failing tests before implementation.
- Keep tasks small and independently reviewable.
- Order foundation before integration: migration tests, path/key validation tests, lifecycle helper tests, fake owner tests, read API contract tests, docs/API parity, UAT quickstart.
- Mark parallel-safe tasks with [P] only when files do not conflict.
- Add every new SPEC-014A TS/TSX module to `tsconfig.spec-strict.json` and `eslint.config.mjs` in the same phase that creates it.

Required task coverage:
- M79 migration and rollback SQL, adjusted if live schema says a different next id is required.
- `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events` current/event persistence.
- Key/path helper and adversarial path-safety corpus.
- Lifecycle transition helper with idempotent create, conflict failure, rollback, cleanup, and durable event evidence.
- Production fake owner implementations for `mission_control`, `openclaw`, and `external_harness`, with tests proving no real launch.
- Feature flag gating through `resolveFlag` and flag-off no-row/no-event tests.
- Read-only `sandbox_lifecycle.v1` API, auth/workspace scope tests, API index/OpenAPI parity.
- Scope guards proving no UI, adapter manifest, token accounting, real runner, OpenClaw launch, retry/release/cancel, successor selection, claim authority, or auto-merge enters SPEC-014A.
- Quickstart/manual UAT for enabled fake lifecycle plus disabled-state read proof.

Non-goal guard:
Any generated task that adds runtime inventory UI, adapter manifest registry, real harness execution, retry controls, auto-reaper, task successor behavior, GitHub mutation, or governance policy changes must be marked out of scope and removed or deferred.
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

**When to run:** Always after tasks are generated and before implementation.

### Analyze Prompt

```text
$speckit-analyze

Analyze SPEC-014A across:
- `docs/ai/specs/SPEC-014A-design-concept.md`
- `specs/014a-sandbox-lifecycle-contract/spec.md`
- `specs/014a-sandbox-lifecycle-contract/plan.md`
- `specs/014a-sandbox-lifecycle-contract/tasks.md`

Focus on:
1. Drift from Design Concept goals, non-goals, and Q&A decisions.
2. Constitution alignment, especially feature-flag discipline, additive migration, auditability, defensive boundaries, and reviewability.
3. Reviewability split exception: implementation must remain one lifecycle safety boundary, not a broad runner/adapter/UI PR.
4. Coverage gaps for migration/rollback, path safety, lifecycle state, fake owners, flag-off behavior, read API, API/OpenAPI parity, strict scope, and manual UAT.
5. Forbidden-scope detection: no operator UI, adapter manifest, real runner, token accounting, retry/release/cancel controls, auto-reaper, claim authority, successor selection, governance policy changes, GitHub mutation, or auto-merge.
6. External-source consistency: Harness Engineering and Symphony are cited as boundary context only and do not introduce runner algorithms.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After `tasks.md` is generated and analyze has no blocking findings.

### Implement Prompt

```text
$speckit-implement

Follow red-green-refactor for every task:
1. RED: write the failing test for the required behavior.
2. GREEN: implement the minimum code needed.
3. REFACTOR: simplify while tests stay green.
4. VERIFY: run focused tests, then required broader checks.

Before starting:
- Verify branch is `014a-sandbox-lifecycle-contract`.
- Confirm worktree is clean except expected generated spec artifacts.
- Use pnpm; do not use npm/yarn.
- Use `direnv exec .` for Node/GitNexus work if local env is required.
- Confirm live migration state before finalizing migration id.

Implementation guidance:
- Keep SPEC-014A modules narrow and boring.
- Route all feature flag checks through `resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', ctx)`.
- Store durable lifecycle state in `agent_sandbox_lifecycles` and append-only events in `agent_sandbox_lifecycle_events`.
- Use bounded path helpers for every path segment; never concatenate untrusted strings into filesystem paths.
- Persist sanitized relative path evidence only.
- Use production fake owners to exercise lifecycle hooks without real harness launch.
- Make reads available when flag is disabled, but prevent every lifecycle mutation and insert no rows/events.
- Preserve SPEC-013B claim authority; do not use sandbox lifecycle as a lock.
- Keep UI out of the diff; roadmap/spec traceability points first UI visibility to SPEC-014B runtime inventory.

Verification expectations:
- Focused Vitest for migration, rollback, path helper, lifecycle helper, fake owners, flag behavior, read API, and scope guards.
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` or `pnpm test:all` as required by final task scope and repo guidance.
- Manual UAT from quickstart: fake lifecycle enabled, read API inspected, cleanup observed, flag disabled, mutation blocked with no rows/events, disabled-state read evidence returned.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | Pending | Pending | Migration, data model, strict scope |
| Lifecycle Core | Pending | Pending | Key/path helper and lifecycle helper |
| Fake Owners | Pending | Pending | Mission Control/OpenClaw/external fakes |
| Read Surface | Pending | Pending | `sandbox_lifecycle.v1`, API index, OpenAPI |
| Verification | Pending | Pending | Scope guards, full checks, manual UAT |

---

## Post-Implementation Checklist

- [ ] Design Concept decisions are reflected in spec, plan, tasks, and implementation.
- [ ] All tasks are checked complete in `tasks.md`.
- [ ] Rollback SQL exists and is documented for any migration.
- [ ] `tsconfig.spec-strict.json` and `eslint.config.mjs` include new SPEC-014A modules.
- [ ] API index and OpenAPI parity are updated for new routes.
- [ ] Scope guard proves no UI/adapter/runner/retry/claim/successor/auto-merge drift.
- [ ] Focused tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Required broad tests pass.
- [ ] Manual API UAT is complete.
- [ ] PR review packet records reviewability exception, deferrals, rollback, flag-off behavior, and UAT evidence.

---

## Project Structure Reference

Likely paths; Plan owns final placement:

```text
src/lib/
  migrations.ts
  agent-sandbox-lifecycle*.ts
  __tests__/
docs/migrations/
  rollback-M79.sql
docs/ai/specs/
  SPEC-014A-design-concept.md
  SPEC-014A-workflow.md
specs/014a-sandbox-lifecycle-contract/
  spec.md
  plan.md
  data-model.md
  contracts/
  quickstart.md
  tasks.md
```

Template based on SpecKit workflow best practices, populated for Mission Control SPEC-014A.
