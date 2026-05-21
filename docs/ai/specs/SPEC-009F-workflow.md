# SpecKit Workflow: SPEC-009F - Production Triage Outcome Routing

**Template Version**: 1.0.0, populated for Mission Control
**Created**: 2026-05-21
**Purpose**: Prepare and execute RC Factory Phase 8F by routing non-remediation Issue Triage outcomes into production-visible recommendation lanes and task-local evidence without entering Issue Remediation or mutating GitHub automatically.

---

## How to Use This Workflow

Run from the dedicated worktree:

```bash
cd .worktrees/009f-production-triage-routing
$speckit-autopilot docs/ai/specs/SPEC-009F-workflow.md
```

Codex skills use `$skill-name` invocation. Do not run slash-command variants in Codex.

---

## Design Concept

This workflow was enriched from the Grill Me interview required by `$speckit-setup`.

```text
docs/ai/specs/SPEC-009F-design-concept.md
```

The design concept is the source of truth for setup-time scoping decisions:

- Non-remediation lanes are recommendation-only in v1.
- `NEEDS_SPEC` creates a SpecKit-ready handoff artifact, but never invokes setup automatically.
- `NEEDS_HUMAN` creates a stored clarification-request artifact with blocking questions.
- `NEEDS_SPECIALIST` recommends an owner/lane from existing metadata when safe, otherwise records an unassigned specialist state.
- Duplicate, obsolete, and invalid share a closure-recommendation model with outcome-specific required fields.
- The existing task Evidence route/section gains a `triageRouting` section.
- The existing `PILOT_MISSION_CONTROL_E2E` product-line scope is the default rollout boundary unless Clarify proves a dedicated flag is required.
- Existing `task_dispositions`, `task_artifacts`, and `activities` persist typed lane payloads. No migration is planned.
- Non-remediation outcomes are terminal Issue Triage outcomes with evidence only; no successor templates are added.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Created `specs/009f-production-triage-routing/spec.md` and requirements checklist; G1 passed with 0 unresolved markers |
| Clarify | `$speckit-clarify` | Complete | Resolved lane payload contracts, terminal/idempotent state, Evidence API/UI shape, specialist matching/rollout, and UAT/regression boundaries |
| Plan | `$speckit-plan` | Pending | Plan stored-evidence-only routing, typed payload validation, Evidence route/section extension, focused fixtures, and no-migration/no-side-effect guardrails |
| Checklist | `$speckit-checklist` | Pending | Run focused domains: data-integrity, api-contracts, state-management, error-handling, security, ux/accessibility, and regression-safety |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first tasks for lane schemas, routing helper, idempotency, Evidence API/UI extension, fixture/UAT evidence, and guardrails |
| Analyze | `$speckit-analyze` | Pending | Verify design concept/spec/plan/tasks/checklists agree on recommendation-only scope and no successor/live-side-effect drift |
| Implement | `$speckit-implement` | Pending | Execute generated tasks; final gate must prove all six non-remediation outcomes route correctly without remediation successors or external mutation |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `009f-production-triage-routing`; design concept and workflow exist; reviewability preset resolves; roadmap marks SPEC-009F `In Progress` on this branch only |
| G1 | After Specify | Requirements cover all six non-remediation outcomes, recommendation-only side effects, typed lane artifacts, terminal triage completion, Evidence surface, idempotency, UAT, and no unresolved markers |
| G2 | After Clarify | Lane payload schemas, specialist matching fallback, `triageRouting` API/UI shape, feature-flag scope, duplicate rerun semantics, and label recommendation rules are resolved |
| G3 | After Plan | Architecture reuses existing dispositions/artifacts/activities and SPEC-009E task evidence seams; no migration, new table, live GitHub mutation, successor templates, claim, runner, sandbox, adapter, or auto-merge work |
| G4 | After Checklist | All gaps are remediated or explicitly out of scope without widening into SPEC-013A/A1/B/C or SPEC-014A-D |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, fixture-backed across all six outcomes, and include operator-readable Evidence inspection |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; downstream artifacts do not drift from Design Concept Q1-Q15 |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, fixture/UAT evidence, roadmap/workflow status updates, branch commit, and push are complete |

---

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Flag/scope-off behavior must preserve existing Issue Triage, Issue Remediation, task chain, and task Evidence behavior | Focused regression tests plus existing unit/build gates |
| II. Upstream Compatibility Discipline | Keep the change additive and scoped; prefer existing evidence/artifact seams over schema divergence | Diff review and no-migration evidence |
| IV. Test-First Development | RED tests define lane payload validation, idempotency, no successor creation, and Evidence rendering before implementation | Vitest/React/Playwright where UI changes |
| V. Feature-Flag Resolution Discipline | Default to existing `PILOT_MISSION_CONTROL_E2E` product-line scope; any new flag must route through `resolveFlag` | Clarify decision plus guardrail grep |
| VII. Additive Migration Policy | No schema migration planned; use existing task disposition/artifact/activity tables | Migration diff grep and plan review |
| VIII. Successor Side-Effect Parity | Do not create follow-up tasks for non-remediation outcomes in v1; if any task creation appears, it must be explicitly out of scope or go through `createTask()` | Guardrail grep and task-chain tests |
| X. Observability and Auditability | Every lane must preserve rationale, source task, recommended next action, and deferred side effects visibly | Artifact/activity assertions and task Evidence route/UI tests |
| XIV. Real UI Journey | Extending the task Evidence section requires browser-visible validation if UI changes | Focused Playwright or documented existing visual route |
| XVI. Reviewability And Verification Debt Control | Keep one primary surface: terminal triage routing evidence plus compact task Evidence extension | Reviewability gate and PR packet |

**Constitution Check:** Initial setup validated the roadmap scope, branch, reviewability preset, and no-runtime-mutation setup artifacts. Re-check in Specify and Plan before implementation.

### Setup Evidence

- Spec ID: SPEC-009F
- Branch: `009f-production-triage-routing`
- Worktree: `.worktrees/009f-production-triage-routing`
- Package manager: pnpm from `pnpm-lock.yaml`
- SpecKit CLI: `/Users/fredrickgabelmann/.local/bin/specify`
- Remote: `origin` (`git@github.com:racecraft-lab/mission-control.git`)
- Reviewability setup gate:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

The setup gate passed under the roadmap transition exception. Downstream phases must keep implementation narrower than the roadmap-wide heuristic: terminal non-remediation routing/evidence plus one task-local Evidence extension.

### Reviewability Preset

Preset `speckit-pro-reviewability` is present. Template resolution verified:

- `spec-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/spec-template.md`
- `plan-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/plan-template.md`
- `tasks-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/tasks-template.md`

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-009F |
| Name | Production Triage Outcome Routing |
| Branch | `009f-production-triage-routing` |
| Dependencies | SPEC-009E, SPEC-012A |
| Enables | Later production triage lanes |
| Priority | P1 |
| Scope source | Phase 8F - production triage outcome routing |
| Acceptance criteria source | Phase 8F Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Turn clean-exit Issue Triage outcomes into production routes and evidence after the pilot evidence surface exists: `NEEDS_SPEC` routes toward a SpecKit/SDD handoff, needs-human routes to a clarification loop, needs-specialist routes to specialist assignment recommendations, and duplicate/obsolete/invalid outcomes route to close/reject recommendations without entering Issue Remediation.

### Strict Scope

Allowed:

- Production routing/evidence for non-remediation triage outcomes.
- Typed payload schemas for SpecKit handoff, clarification request, specialist recommendation, and closure recommendation artifacts.
- Existing disposition/artifact/activity persistence.
- Existing task Evidence API/UI extension with a compact `triageRouting` section.
- Fixture-driven tests for `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`.
- Operator-readable recommended next actions and proposed GitHub labels as metadata only.

Forbidden:

- Issue Remediation execution.
- Automatic GitHub polling, comments, closes, label application, or state mutation.
- Formal claim/reconciliation, runner state, sandbox lifecycle, harness adapter work, or auto-merge policy.
- Automatic `$speckit-setup`, spec branch/worktree creation, or SDD execution.
- New successor templates for non-remediation outcomes.
- New database migration/table unless Clarify/Plan proves reuse is impossible and records a split decision.
- Operator action buttons or mutation controls in v1.

### Success Criteria Summary

- [ ] Operators can drive `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID` fixtures.
- [ ] Each outcome records a terminal non-remediation lane with typed artifact payload, disposition, activity evidence, source task, rationale, and recommended next action.
- [ ] No Issue Remediation successor, claim, runner, sandbox, adapter, auto-close, external comment, applied label, or auto-merge side effect is created.
- [ ] `NEEDS_SPEC` produces a SpecKit-ready handoff artifact without creating a spec branch/worktree.
- [ ] `NEEDS_HUMAN` produces a clarification-request artifact with blocking questions and target audience.
- [ ] `NEEDS_SPECIALIST` recommends an owner/lane from existing metadata when safe, or records unassigned-specialist when no safe match exists.
- [ ] Duplicate/obsolete/invalid outcomes use a shared closure-recommendation model with outcome-specific required fields.
- [ ] The task Evidence route/section exposes `triageRouting` state, artifacts, recommended labels, deferred side effects, and idempotency/supersession state.

---

## Phase 1: Specify

**When to run:** Start of SPEC-009F. Focus on WHAT and WHY, not implementation details. Output: `specs/009f-production-triage-routing/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Production Triage Outcome Routing

### Problem Statement
SPEC-009C2 made non-remediation Issue Triage dispositions exit cleanly with evidence, and SPEC-009E added a task-local Evidence surface. Operators now need production-visible recommendation lanes for every non-remediation triage outcome so these exits are not terminal dead ends or terminal archaeology.

### Goal
Route `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID` into terminal Issue Triage lane evidence with typed artifacts and task-local Evidence display, without entering Issue Remediation or performing live side effects.

### Source Artifacts
- Roadmap: `docs/ai/rc-factory-technical-roadmap.md`, SPEC-009F / Phase 8F.
- Design Concept: `docs/ai/specs/SPEC-009F-design-concept.md`.
- Prior workflow evidence: `docs/ai/specs/SPEC-009C2-workflow.md` and `docs/ai/specs/SPEC-009E-workflow.md`.
- Workflow contract: `docs/ai/workflows/mission-control/workflow-contract.yaml`.
- Existing evidence seam: `src/lib/task-evidence.ts` and `GET /api/tasks/[id]/evidence`.

### Required Behavior
1. Non-remediation outcomes are recommendation-only in v1. Do not close issues, comment externally, apply labels, assign/dispatch agents, create spec worktrees, or invoke `$speckit-setup`.
2. `NEEDS_SPEC` creates a SpecKit-ready handoff artifact with source issue, triage rationale, proposed scope, non-goals, evidence links, proposed labels, and deferred setup action.
3. `NEEDS_HUMAN` creates a clarification-request artifact with blocking questions, target audience, evidence needed, owner-facing next action, proposed labels, and no external message.
4. `NEEDS_SPECIALIST` creates a specialist recommendation from existing Mission Control metadata when safe, or records an explicit unassigned-specialist state.
5. `DUPLICATE`, `OBSOLETE`, and `INVALID` use a shared closure-recommendation model with outcome-specific required fields.
6. Routing persists through existing `task_dispositions`, `task_artifacts`, and `activities`; no new migration is planned.
7. The source Issue Triage task completes with terminal non-remediation evidence and no successor template.
8. Repeated routing is idempotent by outcome and source triage task, updating or superseding existing evidence without duplicates.
9. Task Evidence exposes a compact `triageRouting` section with lane, status, artifact references, recommended next action, proposed labels, deferred side effects, and missing/unassigned states.
10. Existing `PILOT_MISSION_CONTROL_E2E` product-line scope is the default rollout boundary unless Clarify proves a dedicated flag is required.

### Non-goals
- Issue Remediation execution or remediation successor creation.
- Automatic GitHub polling, comments, closes, label application, or state mutation.
- Claim/reconciliation, runner state, sandbox lifecycle, harness adapter work, or auto-merge policy.
- Operator mutation buttons or enabled actions in v1.
- New workflow successor templates for non-remediation outcomes.
- New DB tables/migrations unless a later phase records a ratified split.

### Acceptance
Generate user stories and success criteria that prove all six non-remediation outcomes route to the correct recommendation lane and evidence, with no remediation successor or external mutation.
```

### Specify Gate Checklist

- [x] `spec.md` exists under `specs/009f-production-triage-routing/`.
- [x] No `[NEEDS CLARIFICATION]` markers remain unless explicitly deferred to Phase 2.
- [x] All Design Concept decisions Q1-Q15 are represented.
- [x] Scope boundaries match the roadmap and this workflow.

### Specify Results

| Item | Result |
|------|--------|
| Files created | `specs/009f-production-triage-routing/spec.md`; `specs/009f-production-triage-routing/checklists/requirements.md` |
| Files modified | `.specify/feature.json`; `docs/ai/specs/autopilot-state.json`; this workflow |
| User stories | 4 stories covering SpecKit handoff, human/specialist routing, closure recommendations, and idempotent Evidence display |
| Requirements | 18 functional requirements, including all six non-remediation outcomes and no-side-effect guardrails |
| Gate | G1 passed via `validate-gate.sh G1 specs/009f-production-triage-routing` with 0 markers |

---

## Phase 2: Clarify

**When to run:** After Specify if payload, state, flag, matching, API, or UAT details can be interpreted multiple ways.

Run these sessions in order:

### Session 1: Lane Payload Contracts

Questions to resolve:

- Exact required/optional fields for SpecKit handoff, clarification request, specialist recommendation, and closure recommendation payloads.
- How proposed GitHub labels are represented as recommendation metadata only.
- How raw triage rationale and evidence links are redacted or normalized.
- Whether payload validation lives in a new helper or existing artifact validation seam.

Expected output: spec amendments and contract notes for strict typed payloads.

#### Session 1 Results

Accepted answers:

- Use one common lane payload envelope with `schema_version: "spec-009f.triage_routing.v1"` and artifact types `triage_speckit_handoff`, `triage_clarification_request`, `triage_specialist_recommendation`, and `triage_closure_recommendation`.
- Require lane-specific fields for SpecKit handoff, clarification request, specialist recommendation/unassigned state, and duplicate/obsolete/invalid closure recommendations.
- Store proposed GitHub labels as normalized recommendation metadata only: `{ name, source, action: "recommend_add", applied: false }`.
- Store normalized safe strings and typed safe evidence references only. URLs are optional, query strings/fragments are stripped by default, and active links require protocol and destination-family validation.
- Add a focused pure payload helper near triage routing; call it before artifact publishing while existing artifact storage keeps persistence, redaction, size/MIME limits, supersession, and secret scanning ownership.

Consensus:

| Round | Routed Categories | Outcome | Analysts Used |
|-------|-------------------|---------|---------------|
| 1 | security, codebase, spec, domain | Accepted safe-reference/redaction contract with URL allowlist amendment; no Round 2 or human review needed | codebase-analyst, spec-context-analyst, domain-researcher |

### Session 2: Terminal State And Idempotency

Questions to resolve:

- Exact terminal status/activity language for completed non-remediation Issue Triage tasks.
- Idempotency key definition for source triage task plus disposition outcome.
- Supersession/update behavior when repeated runs change rationale or recommended next action.
- Failure behavior when artifact persistence partially fails.

Expected output: state lifecycle and retry/idempotency requirements.

#### Session 2 Results

Accepted answers:

- Successful non-remediation routes keep the source Issue Triage task `done` and write `triage_routing_recorded` with description `Recorded terminal triage routing for <DISPOSITION>`.
- The canonical idempotency key is `spec-009f.triage_routing.v1:{workspace_id}:{source_task_id}:{disposition}`.
- Same-outcome retries with unchanged normalized payload content create no new artifact or activity.
- Same-outcome retries with changed normalized payload content publish a new artifact that supersedes the prior active artifact and keep superseded artifacts trace-only.
- Changed-disposition retries after a non-unknown disposition is recorded are visibly rejected with `triage_routing_conflict`; they do not create terminal routing evidence for the attempted new outcome.
- Artifact publish failures write sanitized `triage_routing_artifact_publish_failed` evidence, skip `triage_routing_recorded`, and expose `triageRouting` as incomplete or unavailable until retry. Retry backfills missing recorded activity when an artifact already exists.

Consensus: None required; the clarify executor found current repo evidence sufficient.

### Session 3: Evidence API/UI Shape

Questions to resolve:

- Exact `triageRouting` response shape inside `GET /api/tasks/[id]/evidence`.
- Task detail Evidence rendering for all six lanes, unassigned specialist, missing evidence, superseded evidence, and deferred side effects.
- Whether existing task evidence helpers need a new sub-helper for triage routing.
- Accessibility and loading/error/empty-state wording.

Expected output: API/UI contract amendments and display-state vocabulary.

#### Session 3 Results

Accepted answers:

- The Evidence API field is required as snake_case `triage_routing` to match existing task Evidence JSON style; the UI block label is `Triage routing`.
- `triage_routing` includes `state`, `routing_status`, `disposition`, `lane`, `artifact`, `activity_reference`, `idempotency_key`, `recommended_next_action`, `proposed_labels`, `deferred_side_effects`, `missing`, `warnings`, optional `lane_detail`, and `superseded_artifacts`.
- Reuse existing task Evidence `state` values and keep route-specific `routing_status` separate as `missing`, `recorded`, `failed`, or `conflict`.
- Add server-side `buildTriageRoutingEvidence()` in or near `src/lib/task-evidence.ts`; the React component must not parse or validate raw routing payloads.
- Current route selection uses the newest non-superseded, non-quarantined SPEC-009F routing artifact with matching schema version and routing artifact type. Superseded artifacts are trace-only.
- Extend the existing Evidence section with compact display states: `No triage routing recorded.`, `Routing recorded`, `Triage routing incomplete`, `Triage routing unavailable`, `Superseded routing evidence`, `Specialist unassigned`, and `Deferred side effects`. No v1 action buttons.

Consensus: None required; the clarify executor found current repo evidence sufficient.

### Session 4: Specialist Matching And Rollout Scope

Questions to resolve:

- Which existing metadata can safely recommend a specialist owner/lane.
- Minimum confidence for a specialist recommendation versus unassigned-specialist state.
- Whether `PILOT_MISSION_CONTROL_E2E` is sufficient or a dedicated feature flag is required.
- How behavior remains absent/off for non-Mission-Control workflows.

Expected output: matching rules, fallback state, and rollout decision.

#### Session 4 Results

Accepted answers:

- Specialist recommendations may use only deterministic Mission Control workspace metadata: source task/workspace, `projects.area_slug`, normalized `area:*` routing evidence, `project_agent_assignments`, and same-workspace `agents` rows.
- Do not infer specialist ownership from free-form issue title/body/rationale keywords, raw agent config/soul content, logs, or GitHub body text.
- Recommend only when exactly one safe lane and exactly one eligible owner assignment resolve; otherwise record `specialist_state: "unassigned"` with `missing_metadata` and `owner_action`.
- Existing specialist workflow/template metadata may inform recommendation wording, but SPEC-009F must not execute, route to, or create `mission-control_specialist_route` or any other non-remediation successor.
- `PILOT_MISSION_CONTROL_E2E` remains the v1 rollout gate; no dedicated SPEC-009F feature flag is planned.
- Routing requires all absence/off gates: pilot flag resolved true, source task template slug `mission-control_issue_triage`, GitHub repo `racecraft-lab/mission-control`, supported disposition, and existing evidence prerequisites. Otherwise no SPEC-009F artifacts, activities, proposed labels, dispatches, or successors are written.

Consensus: None required; the clarify executor found current repo evidence sufficient.

### Session 5: UAT And Regression Boundaries

Questions to resolve:

- Fixture strategy for all six non-remediation outcomes.
- The operator-readable Evidence inspection path and screenshot/evidence requirements.
- Cleanup expectations for any disposable fixture rows.
- Guardrails proving no GitHub mutation, remediation successor, claim, runner, sandbox, adapter, or auto-merge behavior.

Expected output: UAT checklist and regression guard requirements.

#### Session 5 Results

Accepted answers:

- Use deterministic local/test database fixtures for all six supported dispositions: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`; no live GitHub creation or mutation.
- Each fixture asserts typed routing artifact, `task_dispositions`, `triage_routing_recorded`, source task `done`, no Issue Remediation successor, and no non-remediation successor.
- Add or extend a focused Playwright task Evidence journey covering all six outcomes, the `Task evidence` region, the `Triage routing` block, and absence of mutation/action controls.
- Review artifacts live under `test-results/spec-009f-triage-routing/`, including six region screenshots and `spec-009f-triage-routing-fixture-export.json`; screenshots are not committed.
- Cleanup exports inserted ids, deletes disposable artifacts/activities/tasks/reviews/sync rows/flag overrides, and records post-cleanup zero counts.
- Guardrails must prove no GitHub mutation calls, label application, successor creation, claim, runner, sandbox, adapter, or auto-merge drift; add/adapt a SPEC-009F static/diff scope guard.
- Record UAT evidence in `docs/qa/pilot-smoke-checklist.md` under `SPEC-009F Production Triage Routing UAT`.

Consensus: None required; the clarify executor found current repo evidence sufficient.

### Clarify Gate Checklist

- [x] All open questions from the Design Concept are resolved or explicitly deferred.
- [x] No unresolved marker remains in `spec.md`.
- [x] Consensus log records any non-obvious API, security, or rollout decisions.

### Clarify Results

| Session | Questions | Outcome |
|---------|-----------|---------|
| Lane Payload Contracts | 5 | Added common payload envelope, lane-specific fields, proposed-label metadata, safe evidence references, and payload validation ownership |
| Terminal State And Idempotency | 5 | Added `done` source-task state, `triage_routing_recorded`, idempotency key, supersession, conflict, and partial failure semantics |
| Evidence API/UI Shape | 5 | Added `triage_routing` API shape, Evidence state vocabulary, server helper ownership, active artifact selection, and UI copy/accessibility contract |
| Specialist Matching And Rollout Scope | 5 | Added deterministic matching inputs, unassigned fallback, no specialist successor, `PILOT_MISSION_CONTROL_E2E` rollout, and non-Mission-Control absence gates |
| UAT And Regression Boundaries | 5 | Added six-outcome fixture matrix, Playwright Evidence journey, fixture cleanup, static/diff guards, and pilot smoke checklist UAT ledger |

---

## Phase 3: Plan

**When to run:** After Clarify. Output: `specs/009f-production-triage-routing/plan.md` plus supporting design artifacts.

### Plan Prompt

```bash
$speckit-plan

Plan SPEC-009F using:

- `docs/ai/specs/SPEC-009F-design-concept.md`
- `docs/ai/specs/SPEC-009F-workflow.md`
- `specs/009f-production-triage-routing/spec.md`
- `docs/ai/workflows/mission-control/workflow-contract.yaml`
- Prior implementation evidence in `docs/ai/specs/SPEC-009C2-workflow.md` and `docs/ai/specs/SPEC-009E-workflow.md`
- Constitution principles I, II, IV, V, VII, VIII, X, XIV, and XVI

Architect the smallest implementation that:

1. Reuses existing task disposition, artifact, and activity persistence.
2. Defines strict TypeScript schemas/types for lane payload families.
3. Adds or extends a routing helper for terminal non-remediation outcomes.
4. Preserves `ACTIONABLE_REMEDIATION` behavior and only changes non-remediation lanes.
5. Extends task evidence derivation and route response with `triageRouting`.
6. Extends the existing task Evidence section only as needed for read-only display.
7. Provides deterministic fixtures for all six non-remediation outcomes.
8. Adds no migration, no new runtime dependency, and no live external side effects.

Quote Design Concept decisions when they drive architecture:

- Q1/Q14: recommendation-only, no action controls.
- Q2: SpecKit-ready handoff artifact, no auto setup.
- Q3: clarification-request artifact, no external messaging.
- Q4: metadata-based specialist recommendation with unassigned fallback.
- Q5: shared closure-recommendation model with outcome-specific fields.
- Q6: task Evidence route/section extension.
- Q7: default existing `PILOT_MISSION_CONTROL_E2E` scope unless Clarify proves otherwise.
- Q8: existing dispositions/artifacts/activities, no migration.
- Q9/Q15: terminal Issue Triage outcomes, no successors.
- Q10: fixture-driven UAT plus operator-readable Evidence inspection.
- Q11/Q12/Q13: strict payload schemas, idempotent reruns, proposed labels as metadata only.

Plan must list exact files likely touched and explain why each is in scope. If the design cannot stay inside the strict scope, stop and propose a split instead of expanding.
```

### Expected Plan Artifacts

- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/` for lane artifact and task evidence response shape
- `quickstart.md`
- updated agent context if the SpecKit toolchain requires it

### Plan Gate Checklist

- [ ] No migration unless explicitly justified and split-approved.
- [ ] No new runtime dependency.
- [ ] No external side effect path.
- [ ] Existing remediation path remains unchanged.
- [ ] UAT/manual verification path is concrete.

---

## Phase 4: Checklist

**When to run:** After Plan. Target focused domains because this spec crosses routing state, artifacts, evidence API/UI, and no-side-effect safety.

### Checklist Domains

Run at least these domains:

- `data-integrity`: typed artifacts, source task identity, idempotency, supersession, no duplicate evidence.
- `api-contracts`: `triageRouting` response shape, error behavior, artifact references, proposed labels, deferred side effects.
- `state-management`: terminal triage completion, no successor templates, scope/flag behavior, repeated runs.
- `error-handling`: invalid payloads, missing artifact store, persistence failure, unsupported specialist metadata, partial evidence.
- `security`: redaction, no raw unsafe artifact rendering, no external mutation, no sensitive actor/credential leakage.
- `ux` or `accessibility`: compact Evidence rendering, labels/states, keyboard/screen-reader behavior if UI changes.
- `regression-safety`: `ACTIONABLE_REMEDIATION` unchanged; no claim/runner/sandbox/poller/adapter/auto-merge drift.

### Checklist Gate Checklist

- [ ] Every `[Gap]` is remediated or marked out of scope with rationale.
- [ ] Checklist findings do not widen the spec into SPEC-013 or SPEC-014 work.

---

## Phase 5: Tasks

**When to run:** After checklists complete. Output: `specs/009f-production-triage-routing/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-009F using:

- `docs/ai/specs/SPEC-009F-design-concept.md`
- `docs/ai/specs/SPEC-009F-workflow.md`
- `specs/009f-production-triage-routing/spec.md`
- `specs/009f-production-triage-routing/plan.md`
- `specs/009f-production-triage-routing/research.md`
- `specs/009f-production-triage-routing/data-model.md`
- `specs/009f-production-triage-routing/contracts/`
- all completed checklists

Task groups should cover:

1. RED fixtures for all six non-remediation outcomes.
2. Typed lane payload schema/validation tests.
3. Routing helper behavior: terminal triage evidence, no successors, idempotent repeat runs, failure isolation.
4. `NEEDS_SPEC` handoff artifact.
5. `NEEDS_HUMAN` clarification artifact.
6. `NEEDS_SPECIALIST` recommendation/unassigned fallback.
7. Duplicate/obsolete/invalid closure recommendation model.
8. Task Evidence route/helper `triageRouting` extension.
9. Task Evidence UI section extension if Plan includes UI changes.
10. Proposed GitHub label metadata only; no label application.
11. Guardrails for no GitHub mutation, no remediation successor, no claim/runner/sandbox/adapter/auto-merge.
12. UAT fixture/evidence updates and PR packet status.

Tasks must include explicit verification commands and should keep parallel markers only where file ownership is disjoint.
```

### Tasks Gate Checklist

- [ ] Every acceptance criterion has task coverage.
- [ ] RED tasks precede implementation tasks for production code.
- [ ] No task implements future operator action controls or external mutations.
- [ ] Final verification includes focused tests, typecheck/lint/build as required, and operator-readable Evidence inspection.

---

## Phase 6: Analyze

**When to run:** After tasks. Analyze all artifacts before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze consistency across:

- `docs/ai/specs/SPEC-009F-design-concept.md`
- `docs/ai/specs/SPEC-009F-workflow.md`
- `specs/009f-production-triage-routing/spec.md`
- `specs/009f-production-triage-routing/plan.md`
- `specs/009f-production-triage-routing/tasks.md`
- all generated checklists and contracts

Primary risks:

1. Any live side effect drift from recommendation-only decisions Q1, Q13, and Q14.
2. Any automatic `$speckit-setup`, successor template, claim, dispatch, runner, sandbox, adapter, or auto-merge drift.
3. Missing typed payload coverage for one of the four lane families.
4. Missing fixture coverage for one of the six non-remediation outcomes.
5. Evidence surface drift from SPEC-009E task-local route/section.
6. Idempotency or duplicate evidence gaps.
7. `ACTIONABLE_REMEDIATION` regression.
8. Feature flag/scope ambiguity.

Remediate CRITICAL/HIGH findings before implementation. Do not widen scope; split if necessary.
```

### Analyze Gate Checklist

- [ ] Marker scans are clean.
- [ ] No CRITICAL/HIGH findings remain.
- [ ] Any MEDIUM/LOW accepted risks are recorded with owner and follow-up.

---

## Phase 7: Implement

**When to run:** After Analyze passes. Execute tasks from `tasks.md`.

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-009F from `specs/009f-production-triage-routing/tasks.md`.

Strictly follow:

- TDD red-green-refactor.
- Design Concept decisions Q1-Q15.
- Plan strict scope and generated contracts.
- Existing repo patterns for task dispatch, task artifacts, task evidence, activities, and feature-flag resolution.

Do not implement:

- GitHub close/comment/label application.
- Operator action buttons.
- Remediation successor creation for non-remediation outcomes.
- `$speckit-setup` invocation or SDD worktree creation.
- Claims, polling, runner state, sandbox lifecycle, harness adapters, or auto-merge policy.
- New tables/migrations unless Plan explicitly approved a split.

Verification must prove all six non-remediation outcomes, no remediation successor, idempotent reruns, task Evidence display, no external mutation, and unchanged `ACTIONABLE_REMEDIATION`.
```

### Implementation Notes

- Work only inside branch `009f-production-triage-routing`.
- Keep implementation branch-local until PR review.
- Record verification evidence in this workflow before PR creation.
- If browser-visible UI changes land in the task Evidence section, run focused Playwright/browser verification.

### Completion Checklist

- [ ] All generated tasks complete.
- [ ] Focused tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm build` passes if production/API/UI files change.
- [ ] Browser/operator evidence exists if UI changes.
- [ ] Roadmap/workflow status synced.
- [ ] PR packet includes review order, traceability, validation, known gaps, and rollback/flag notes.
