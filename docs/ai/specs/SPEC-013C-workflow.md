# SpecKit Workflow: SPEC-013C - Retry/Backoff and Debug API Surfaces

**Template Version**: 1.0.0
**Created**: 2026-05-27
**Purpose**: Prepare RC Factory Phase 11C by adding authenticated API-only retry, release, cancel, backoff, and debug authority on top of SPEC-013B active claim/reconciliation state, while leaving operator UX to SPEC-013D.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-013C-workflow.md` from the `013c-retry-debug-surfaces` worktree.
2. Keep all generated spec artifacts under `specs/013c-retry-debug-surfaces/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-scaffold-spec`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-013C-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `$speckit-clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Pending | Verify branch/worktree, archive state, Codex prerequisites, reviewability preset, external context, and pnpm command map |
| Specify | `$speckit-specify` | Pending | Generate `specs/013c-retry-debug-surfaces/spec.md` from roadmap plus Design Concept |
| Clarify | `$speckit-clarify` | Pending | Resolve API eligibility, idempotency storage, authorization, read-model, and UAT details |
| Plan | `$speckit-plan` | Pending | Produce architecture, data model decision, contracts, quickstart, and strict-scope updates |
| Checklist | `$speckit-checklist` | Pending | Run scheduler-runtime, api-contracts, data-integrity, state-management, security, and accessibility-adoption-boundary checks |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first tasks bounded to API/debug authority plus SPEC-013D follow-up evidence |
| Analyze | `$speckit-analyze` | Pending | Verify cross-artifact consistency and no drift into UI, sandbox, adapter, or harness execution |
| Implement | `$speckit-implement` | Pending | Implement after all earlier gates pass |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `013c-retry-debug-surfaces`; design concept and workflow are committed; reviewability preset resolves; roadmap contains `SPEC-013D` as the UI follow-up |
| G1 | After Specify | Requirements cover API-only retry/release/cancel, action eligibility, backoff override, audit payload safety, idempotency, read-model extension, admin/operator auth, and SPEC-013D adoption blocker |
| G2 | After Clarify | No unresolved markers remain for retry-eligible states, cancel state, idempotency persistence, authorization helper, response codes, or UAT fixture shape |
| G3 | After Plan | Architecture cites live SPEC-013B claim module, task-stage attempts, migrations, auth, activities, and route/read-model patterns; any migration is additive and rollback-documented |
| G4 | After Checklist | All `[Gap]` markers from required domains are addressed or explicitly out of scope |
| G5 | After Tasks | Tasks are reviewable, dependency-ordered, TDD-first, and bounded to SPEC-013C API/debug authority |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; artifacts agree that operator UX belongs to SPEC-013D and first real harness operation waits for SPEC-013D |
| G7 | During Implement | Focused tests, typecheck, lint, build, full test suite, roadmap/workflow status, PR review packet, and API-and-audit UAT evidence pass before closeout |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy scheduler, dispatch, and existing read-only evidence behavior unchanged | Flag-off tests cover no claim-control mutation path and unchanged existing task behavior |
| IV. Test-First Development | Retry, release, cancel, idempotency, authorization, backoff, and read-model behavior begin with failing tests | Tasks require RED tests before API/control implementation |
| V. Feature-Flag Resolution Discipline | New runtime behavior gates through `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` only | Static guardrails find no inline `process.env.FEATURE_TASK_CONTROL_PLANE` reads |
| VII. Additive Migration Policy | New persistence is avoided unless Plan proves a small idempotency table is necessary; any table is additive with rollback SQL | Plan cites schema truth and migration tests cover rerun/rollback |
| VIII. Successor Side-Effect Parity | Retry/release/cancel must not call `advanceTaskChain` or `createTask` directly | Tests/static checks verify no successor writes in claim-control actions |
| X. Observability and Auditability | Every mutation records bounded actor, state, action, backoff, idempotency, and sanitized error evidence | Focused tests assert `activities` rows and read-model reflection |
| XI. Keep It Simple | One narrow control module/route owns SPEC-013C semantics | Review keeps scheduler, dispatch, and UI code from absorbing action semantics |
| XVI. Reviewability And Verification Debt Control | SPEC-013C records API-only scope and SPEC-013D UI follow-up | PR packet explicitly says operator UX adoption is blocked on SPEC-013D |

**Constitution Check:** Re-check after Specify, Plan, Analyze, and Implement. Any runtime/scheduler/schema/API expansion beyond this workflow must be split or explicitly justified by a reviewability exception.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/2.5.0/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
```

Result:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"primary_surfaces":["API","harness/adapter","or docs/process","scheduler/runtime","schema/migration","seed/config","UI"],"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

Decision: setup may proceed under the roadmap transition exception, but downstream phases must keep actual implementation to SPEC-013C strict scope: authenticated debug/control API, retry policy, read-model extension, audit evidence, and focused tests. Operator UX is split to SPEC-013D.

### Reviewability Preset

Setup verified the generic reviewability preset from this worktree:

```json
{
  "status": "present",
  "preset_id": "speckit-pro-reviewability",
  "changed_templates": [],
  "manifest_changed": false,
  "readme_changed": false,
  "registry_changed": false
}
```

Setup also verified preset resolution from this worktree:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

Each command resolved to `.specify/presets/speckit-pro-reviewability/templates/`.

### External Context Refresh

Future agents must not rely on built-in model knowledge for OpenAI Harness Engineering or Symphony. This setup fetched the required sources on 2026-05-27:

- OpenAI Harness Engineering: `https://openai.com/index/harness-engineering/`
- OpenAI Symphony announcement: `https://openai.com/index/open-source-codex-orchestration-symphony/`
- OpenAI Symphony SPEC: `https://github.com/openai/symphony/blob/main/SPEC.md`

Use the external context only to preserve SPEC-013C boundaries: repository-local knowledge as the system of record, explicit workflow/config contracts, scheduler preflight/reconciliation, per-workspace/per-issue isolation concepts, source-of-truth separation, and operator-visible status/debug evidence. Do not import Symphony runner, Linear, sandbox lifecycle, rich scheduler behavior, harness adapters, or long-running execution behavior into SPEC-013C.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-013C |
| Name | Retry/Backoff and Debug API Surfaces |
| Branch | `013c-retry-debug-surfaces` |
| Dependencies | SPEC-013B |
| Enables | SPEC-013D |
| Priority | P1 |
| Scope source | Phase 11C - Retry/backoff and debug surfaces |
| Acceptance criteria source | Phase 11C Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Add bounded retry/backoff reason codes, authenticated API-only cancel/retry/release controls, JSON debug surfaces, audit rows, and refresh triggers on top of the SPEC-013B claim authority. SPEC-013C deliberately does not claim the operator experience is complete; the roadmap gap discovered during setup is split into SPEC-013D.

### Current Codebase Baseline

- `src/lib/task-claim-reconciliation.ts` owns SPEC-013B active claim authority, claim acquisition, release, stale recovery, and reconciliation evidence.
- `src/app/api/tasks/[id]/claim-reconciliation/route.ts` exposes a read-only `task_claim_reconciliation.v1` evidence envelope.
- `src/lib/task-stage-attempts.ts` owns passive task-stage attempt lifecycle evidence.
- `task_stage_claims` is the active-claim persistence model added by M78.
- `src/lib/task-dispatch.ts` calls SPEC-013B claim authority before legacy launch mutation.
- `src/lib/github-sync-lifecycle.ts` and GitHub sync routes already model bounded backoff patterns for a different domain; SPEC-013C may reuse patterns but must not conflate GitHub sync lifecycle with claim-control state.

### Strict Scope

Allowed:

- Authenticated API-only retry, release, and cancel mutation route.
- Closed action semantics:
  - `retry`: clears a failed/stuck or cancelled claim/attempt and makes the stage eligible for a new scheduler attempt.
  - `release`: clears active ownership without scheduling new work.
  - `cancel`: records an intentional operator stop and prevents automatic pickup until a later explicit retry.
- Action eligibility for active claims plus explicitly retry-eligible failed, stuck, deferred, or cancelled attempt outcomes.
- Backoff policy that respects stored backoff by default and allows explicit operator override with actor and reason evidence.
- Idempotency key plus transactional compare-and-set semantics.
- Bounded allowlisted audit payloads only.
- Extension of the existing claim-reconciliation read model with action eligibility, available actions, backoff, last operator action, and last sanitized error.
- Admin/operator-only mutation authorization.
- API-and-audit UAT on the target deployment.

Forbidden:

- In-app operator control UI or task-detail controls. SPEC-013D owns UX.
- CLI/MCP action surface for retry/release/cancel.
- New dashboard.
- Sandbox lifecycle, adapter registry, real harness execution, or long-running runner ownership.
- Direct GitHub issue mutation outside existing sync/reconciliation paths.
- Direct successor selection, `advanceTaskChain`, or task creation.
- Whole-task terminal mutation on cancel.
- Raw prompts, transcripts, provider payloads, auth headers, GitHub bodies, token data, or secret-shaped values in audit/debug payloads.

### Design Concept Decisions

- Q1-Q3: API-only is acceptable only after the roadmap names a future UI spec. Setup added SPEC-013D before continuing.
- Q4: `retry`, `release`, and `cancel` are three distinct outcomes.
- Q5: Actions target active claims or explicitly retry-eligible failed/stuck/deferred outcomes, not arbitrary assigned tasks.
- Q6: Retry respects backoff by default; explicit override requires actor and reason audit evidence.
- Q7: Cancel is stage-level only and does not set the whole task to `failed` or `done`.
- Q8: Persist bounded allowlisted audit payloads only.
- Q9: Use one narrow mutation endpoint with an explicit `action` field.
- Q10: Use idempotency keys plus compare-and-set transitions.
- Q11: Extend the existing claim-reconciliation read model for future UI eligibility.
- Q12: Cancel prevents automatic pickup until a later explicit retry action.
- Q13: SPEC-013C post-merge UAT is API-and-audit only and must record SPEC-013D as the operator UX blocker.
- Q14: Mutations are admin/operator-only.
- Q15: Reuse existing storage first; add only a small idempotency table if Plan proves it is necessary.

### Success Criteria Summary

- [ ] With `FEATURE_TASK_CONTROL_PLANE=false`, retry/release/cancel mutation paths are unavailable and legacy scheduler/dispatch behavior remains unchanged.
- [ ] With `FEATURE_TASK_CONTROL_PLANE=true`, an authenticated admin/operator can call one action endpoint for `retry`, `release`, or `cancel` against eligible claimed-stage evidence.
- [ ] `retry`, `release`, and `cancel` have distinct persisted semantics and cannot be collapsed into one generic release operation.
- [ ] `retry` respects backoff by default and records explicit override actor/reason when bypassing backoff.
- [ ] `cancel` stops automatic pickup for the stage until a later explicit retry and does not mark the entire task `failed` or `done`.
- [ ] Mutation actions are idempotent and compare-and-set safe under repeated requests, stale operators, and scheduler races.
- [ ] Every mutation emits bounded allowlisted audit/debug evidence and rejects raw prompts, transcripts, tokens, auth headers, GitHub bodies, provider responses, and secret-shaped payloads.
- [ ] The existing claim-reconciliation read model exposes action eligibility, available actions, backoff, last operator action, and sanitized error state for SPEC-013D.
- [ ] No UI control, CLI/MCP action surface, sandbox lifecycle, adapter registry, harness execution, successor selection, direct GitHub mutation, or new dashboard enters SPEC-013C.
- [ ] Post-merge HITL UAT proves API-and-audit behavior on the target deployment and records that operator UX adoption remains blocked on SPEC-013D.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/013c-retry-debug-surfaces/spec.md`.

### Specify Prompt

```bash
$speckit-specify

GIT_BRANCH_NAME=013c-retry-debug-surfaces
SPECIFY_FEATURE_DIRECTORY=specs/013c-retry-debug-surfaces

## Feature: SPEC-013C - Retry/Backoff and Debug API Surfaces

Mission Control now has SPEC-013B active claim and reconciliation authority for GitHub-linked assigned task stages. Operators still lack a backend control contract for retrying, releasing, or cancelling a claimed stage when a launch handoff, claim, backoff, or boundary condition needs intervention.

During setup, the operator identified that API-only controls would leave a real user experience gap. The roadmap was updated before scaffolding continued:

- SPEC-013C owns backend API/debug authority only.
- SPEC-013D owns the operator UI in the existing task detail/evidence experience.
- SPEC-014C first real harness operation is blocked by SPEC-013D plus SPEC-014B.

### Users

- Mission Control operators/admins who need safe backend controls for claimed-stage recovery.
- Reviewers who need bounded audit/debug evidence for retry, release, cancel, backoff, and race behavior.
- SPEC-013D implementers who need one read model for future task-detail controls.
- SPEC-014C implementers who need retry/debug authority before first real harness execution.

### Goals

- Add authenticated admin/operator-only API controls for retry, release, and cancel.
- Keep action semantics distinct:
  - retry clears a failed/stuck/cancelled eligible stage for a new scheduler attempt;
  - release clears active ownership without scheduling work;
  - cancel records intentional operator stop and prevents automatic pickup until explicit retry.
- Respect backoff by default and allow explicit override with actor/reason audit evidence.
- Use idempotency keys plus compare-and-set semantics for repeated requests and races.
- Extend the existing claim-reconciliation read model with action eligibility, backoff, last action, available actions, and sanitized error state.
- Prove API-and-audit UAT while recording SPEC-013D as the required operator UX follow-up.

### Non-goals

- No in-app retry/release/cancel controls in SPEC-013C.
- No CLI/MCP action surface.
- No new dashboard.
- No sandbox lifecycle, harness adapter, or runner execution.
- No whole-task `failed` or `done` transition on cancel.
- No direct GitHub mutation outside documented sync/reconciliation paths.
- No successor selection, direct `advanceTaskChain`, or `createTask`.
- No broad diagnostic payload persistence.

### Required decisions from Design Concept

- Use `docs/ai/specs/SPEC-013C-design-concept.md` as the setup-time source of truth.
- Start from the updated roadmap entry in `docs/ai/rc-factory-technical-roadmap.md`.
- Preserve SPEC-013B claim/reconciliation authority and active-claim persistence boundaries.

### Acceptance outline

- API mutation route accepts `retry`, `release`, and `cancel` with bounded request shape.
- Authorization rejects non-admin/non-operator mutation attempts.
- Idempotent repeated actions do not double-mutate or double-audit.
- Race/stale-state behavior returns clear `already_applied`, `stale_state`, or `conflict` style outcomes.
- Read model exposes SPEC-013D-ready action eligibility and debug state.
- PR packet and UAT evidence explicitly say operator UX adoption waits for SPEC-013D.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | Pending |
| User Stories | Pending |
| Acceptance Criteria | Pending |
| Clarification Markers | Pending |

### Files Generated

- [ ] `specs/013c-retry-debug-surfaces/spec.md`
- [ ] `specs/013c-retry-debug-surfaces/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, to resolve remaining ambiguity before Plan. Output: clarified `spec.md`.

### Clarify Prompts

#### Session 1: Action Eligibility And State Machine

```bash
$speckit-clarify

Focus on SPEC-013C action eligibility and state transitions:

- Which active claim states support release, cancel, and retry?
- Which failed, deferred, stuck, stale, or cancelled attempt/claim outcomes are explicitly retry-eligible?
- What closed outcome values should represent `retry`, `release`, `cancel`, `already_applied`, `stale_state`, and `conflict`?
- How does cancel prevent automatic pickup until explicit retry without changing the whole task to `failed` or `done`?
- Pay special attention to preserving SPEC-013B terminal task/GitHub release semantics.
```

#### Session 2: API Contract, Idempotency, And Races

```bash
$speckit-clarify

Focus on SPEC-013C mutation API contract:

- Confirm the single action route path and request/response envelope.
- Decide whether idempotency can be enforced with existing storage or requires a small additive table.
- Define idempotency key requirements, replay behavior, and response codes.
- Define compare-and-set predicates for active/stale claims and retry-eligible outcomes.
- Pay special attention to repeated operator clicks, stale browser clients, and concurrent scheduler ticks.
```

#### Session 3: Authorization, Audit Safety, And Error Surfaces

```bash
$speckit-clarify

Focus on operator authorization and evidence safety:

- Identify the existing admin/operator authorization helper or role source to use.
- Define the positive allowlist for audit payload fields.
- Define forbidden payload classes: raw prompts, transcripts, tokens, auth headers, GitHub bodies, provider responses, and secret-shaped strings.
- Define sanitized error categories and redaction flags for boundary failures.
- Pay special attention to actor identity being mandatory for every mutation.
```

#### Session 4: Read Model And SPEC-013D Boundary

```bash
$speckit-clarify

Focus on read-model extension and the SPEC-013D handoff:

- Extend `task_claim_reconciliation.v1` or version it in a way that remains backward-compatible.
- Define available-action, retry-eligibility, backoff, last-operator-action, and last-error fields.
- Define what SPEC-013D can render without recomputing claim state.
- Define PR packet wording that prevents API-only work from being presented as complete operator UX.
- Pay special attention to not adding UI controls in SPEC-013C.
```

#### Session 5: API-And-Audit UAT

```bash
$speckit-clarify

Focus on post-merge HITL UAT:

- Define controlled target-deployment fixtures for retry, release, cancel, backoff override, idempotency replay, stale state, and unauthorized access.
- Define the evidence packet fields and cleanup expectations.
- Confirm whether manual DB inspection is optional supporting evidence rather than required acceptance.
- Confirm target-service flag scope and rollback steps.
- Pay special attention to recording SPEC-013D as the operator UX adoption blocker.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Action eligibility and state machine | Pending | Pending |
| 2 | API contract, idempotency, and races | Pending | Pending |
| 3 | Authorization, audit safety, and errors | Pending | Pending |
| 4 | Read model and SPEC-013D boundary | Pending | Pending |
| 5 | API-and-audit UAT | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Generates technical implementation blueprint. Output: `specs/013c-retry-debug-surfaces/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Language: TypeScript 5.7 strict for new SPEC-013C modules.
- Framework: Next.js 16 App Router with React 19.
- Runtime: Node >=22, pnpm.
- Database: SQLite through `better-sqlite3`; single-process synchronous transactions.
- Testing: Vitest, ESLint, TypeScript, Playwright only if existing visible surfaces change. SPEC-013C should not add UI.
- Feature flag: `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` only.

## Architecture Inputs

- Roadmap: `docs/ai/rc-factory-technical-roadmap.md`, SPEC-013C and SPEC-013D entries.
- Design concept: `docs/ai/specs/SPEC-013C-design-concept.md`.
- SPEC-013B workflow/spec/plan/tasks/retrospective under `docs/ai/specs/SPEC-013B-workflow.md` and `specs/013b-claim-reconciliation/`.
- Existing claim authority: `src/lib/task-claim-reconciliation.ts`.
- Existing read route: `src/app/api/tasks/[id]/claim-reconciliation/route.ts`.
- Existing attempt evidence: `src/lib/task-stage-attempts.ts`.
- M78 schema truth: `src/lib/migrations.ts` and `docs/migrations/rollback-M78.sql`.
- Existing auth helpers and task API patterns.
- Existing GitHub sync lifecycle backoff helpers as pattern references only, not shared claim-control state.

## Required Plan Decisions

- Decide whether a new additive idempotency table is necessary. Prefer existing storage unless tests prove otherwise.
- Define closed action, outcome, release/cancel/retry reason, and error-category vocabularies.
- Define one narrow control module or route helper that owns retry/release/cancel semantics.
- Define transaction boundaries and compare-and-set predicates.
- Define admin/operator authorization check.
- Define read-model extension strategy for `task_claim_reconciliation.v1` without breaking existing clients.
- Define API-and-audit UAT fixture approach.

## External Context

Use the external context fetched on 2026-05-27 only for boundaries:

- OpenAI Harness Engineering: repository-local knowledge, legible status, mechanical guardrails, and feedback loops.
- OpenAI Symphony announcement: tracker/runner source-of-truth separation and workflow-defined handoff states.
- OpenAI Symphony SPEC: workflow validation, dispatch preflight/reconciliation, workspace isolation concepts, and observable attempts.

Do not import Symphony runner, Linear, workspace/sandbox lifecycle, harness adapter, or general distributed scheduler behavior.

## Strict Scope

- No in-app operator control UI. SPEC-013D owns that.
- No CLI/MCP action surface.
- No new dashboard.
- No sandbox lifecycle, adapter manifest, or real harness execution.
- No direct GitHub mutation outside sync/reconciliation.
- No successor selection, `advanceTaskChain`, or `createTask`.
- No whole-task terminal mutation on cancel.
- No raw diagnostic payload persistence.

## Strict Scope Registration

Add any new isolated SPEC-013C TS modules and tests to `tsconfig.spec-strict.json` and `eslint.config.mjs` following existing SPEC-013A/B patterns. If a Next.js route imports broad runtime/auth/db graph that is unsuitable for spec-strict declaration-only compilation, document why it remains covered by main typecheck/lint/build/test gates.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, constitution check, architecture |
| `research.md` | Pending | Idempotency/storage, auth, read-model, and backoff decisions |
| `data-model.md` | Pending | Action/outcome/envelope/state definitions and any persistence |
| `contracts/` | Pending | Claim-control API and read-model extension contracts |
| `quickstart.md` | Pending | API-and-audit UAT and operator rollback |

---

## Phase 4: Checklist

**When to run:** After Plan. Validates spec and plan together.

### Required Checklist Domains

Run these domains unless Clarify/Plan proves a domain is irrelevant:

```bash
$speckit-checklist scheduler-runtime
$speckit-checklist api-contracts
$speckit-checklist data-integrity
$speckit-checklist state-management
$speckit-checklist security
$speckit-checklist accessibility
```

### Checklist Focus

- **scheduler-runtime:** Retry/release/cancel cannot crash scheduler ticks, bypass governance, double-launch, or re-enter cancelled work automatically.
- **api-contracts:** Request/response envelopes, idempotency keys, response codes, auth failures, stale state, and read-model extension are explicit.
- **data-integrity:** Idempotency, compare-and-set, backoff override, actor identity, and audit rows remain consistent under races.
- **state-management:** Action outcomes align with `task_stage_claims`, `task_stage_attempts`, and existing task state vocabulary.
- **security:** Admin/operator-only mutation auth, payload allowlist, redaction, no raw diagnostic persistence.
- **accessibility:** Validate the adoption boundary: SPEC-013C has no UI controls, and SPEC-013D is explicitly required before operator UX adoption.

### Checklist Results

| Domain | Items | Open Gaps | Artifact |
|--------|-------|-----------|----------|
| scheduler-runtime | Pending | Pending | Pending |
| api-contracts | Pending | Pending | Pending |
| data-integrity | Pending | Pending | Pending |
| state-management | Pending | Pending | Pending |
| security | Pending | Pending | Pending |
| accessibility | Pending | Pending | Pending |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/013c-retry-debug-surfaces/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate TDD-first tasks for SPEC-013C using:

- `docs/ai/specs/SPEC-013C-design-concept.md`
- `docs/ai/specs/SPEC-013C-workflow.md`
- `specs/013c-retry-debug-surfaces/spec.md`
- `specs/013c-retry-debug-surfaces/plan.md`
- all completed checklist files

Task organization:

1. Setup and strict-scope registration.
2. RED tests for action eligibility and closed state/outcome vocabularies.
3. RED tests for retry/release/cancel action semantics.
4. RED tests for backoff default and explicit override audit.
5. RED tests for idempotency and compare-and-set races.
6. RED tests for admin/operator authorization.
7. RED tests for audit payload allowlist and redaction.
8. RED tests for read-model extension and SPEC-013D handoff fields.
9. Minimal implementation modules/routes.
10. API-and-audit UAT fixture and docs.
11. Roadmap/workflow/PR packet updates.

Required boundaries:

- Do not add in-app operator controls, CLI/MCP action surface, dashboard, sandbox lifecycle, adapter registry, or harness execution.
- Do not mutate GitHub issue truth outside documented sync/reconciliation paths.
- Do not call `advanceTaskChain` or `createTask`.
- Do not mark the whole task `failed` or `done` from cancel.
- Do not persist raw prompts, transcripts, tokens, auth headers, GitHub bodies, provider responses, or secret-shaped strings.
- Ensure the PR packet names SPEC-013D as the operator UX follow-up and first-real-harness adoption prerequisite.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending |
| Parallel Tasks | Pending |
| TDD Red Tasks | Pending |
| Verification Tasks | Pending |

---

## Phase 6: Analyze

**When to run:** After Tasks. Verifies cross-artifact consistency before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-013C for cross-artifact consistency across:

- `docs/ai/specs/SPEC-013C-design-concept.md`
- `docs/ai/specs/SPEC-013C-workflow.md`
- `specs/013c-retry-debug-surfaces/spec.md`
- `specs/013c-retry-debug-surfaces/plan.md`
- `specs/013c-retry-debug-surfaces/tasks.md`
- checklist files
- contracts and data-model artifacts

Focus findings on:

1. Scope boundary drift into SPEC-013D UI controls, CLI/MCP action surface, dashboard, sandbox lifecycle, adapter registry, or harness execution.
2. Action semantics drift: retry/release/cancel must remain distinct.
3. Cancel behavior drift: cancel must not set whole task `failed` or `done`, and must block automatic pickup until explicit retry.
4. Backoff drift: retry respects backoff unless explicit audited override is supplied.
5. Idempotency/race drift: repeated requests and scheduler races cannot double-mutate or double-audit.
6. Payload safety drift: audit/debug evidence is allowlisted and redacted.
7. Read-model drift: SPEC-013D can render eligibility from one source without recomputing claim state.
8. Acceptance drift: SPEC-013C UAT is API-and-audit only and must record SPEC-013D as the operator UX blocker.
9. External-context drift: Harness Engineering/Symphony are boundary context only, not imported runner/scheduler/harness design.
10. Constitution drift: feature flag, additive migration, test-first, auditability, and successor parity requirements.

No CRITICAL or HIGH findings may remain before implementation.
```

### Analyze Results

| Finding | Severity | Resolution |
|---------|----------|------------|
| Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After Analyze passes. Execute tasks in dependency order with red-green-refactor.

### Implement Prompt

```bash
$speckit-implement

Execute `specs/013c-retry-debug-surfaces/tasks.md` exactly.

Before editing code:

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must be `013c-retry-debug-surfaces`.
2. Re-read `docs/ai/specs/SPEC-013C-design-concept.md`.
3. Re-read `specs/013c-retry-debug-surfaces/plan.md`.
4. Re-read `specs/013c-retry-debug-surfaces/tasks.md`.
5. Confirm `FEATURE_TASK_CONTROL_PLANE=false` behavior before adding runtime changes.

Implementation rules:

- Follow strict TDD: write failing tests first, prove failure, implement, refactor.
- Keep runtime behavior behind `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)`.
- Preserve SPEC-013B claim/reconciliation boundaries.
- Use one narrow action route/module for retry/release/cancel semantics.
- Enforce admin/operator-only mutation auth.
- Enforce idempotency and compare-and-set.
- Emit bounded allowlisted audit/debug evidence.
- Extend the claim-reconciliation read model for SPEC-013D.
- Keep the UI untouched except docs/references if needed. SPEC-013D owns UI.
- Keep successor selection, task creation, GitHub mutation, sandbox, adapter, and harness execution out of scope.

Required verification:

- Focused SPEC-013C tests.
- `pnpm typecheck`.
- `pnpm lint`.
- `pnpm test`.
- `pnpm build`.
- `pnpm test:e2e` only if a browser-visible surface changes or the repo gate requires it.
- `pnpm knowledge:index:check` if status pointers or roadmap/spec docs change.
- `git diff --check`.

Post-merge UAT:

- Enable `FEATURE_TASK_CONTROL_PLANE` for one target product-line/workspace scope.
- Use authenticated API calls for controlled retry, release, cancel, backoff override, idempotency replay, stale/conflict state, and unauthorized cases.
- Verify audit/debug/read-model evidence.
- Verify no disposable target residue remains.
- Record that operator UI adoption remains blocked on SPEC-013D.
```

### Implementation Results

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Feature flag OFF compatibility | Pending | Pending |
| Retry/release/cancel action API | Pending | Pending |
| Backoff and override audit | Pending | Pending |
| Idempotency and races | Pending | Pending |
| Admin/operator authorization | Pending | Pending |
| Audit payload safety | Pending | Pending |
| Read-model extension | Pending | Pending |
| SPEC-013D adoption blocker recorded | Pending | Pending |
| API-and-audit UAT | Pending | Pending |

---

## Expected File Scope

Exact file scope must be determined during Plan. Candidate surfaces include:

```text
src/lib/task-claim-control.ts                     New narrow action semantics module, if Plan chooses this name
src/app/api/tasks/[id]/claim-control/route.ts     New authenticated mutation route
src/app/api/tasks/[id]/claim-reconciliation/route.ts  Read-model extension only
src/lib/task-claim-reconciliation.ts              Minimal exported helpers only if needed for read/action reuse
src/lib/task-stage-attempts.ts                    Attempt evidence integration only if needed
src/lib/migrations.ts                             Only if Plan proves idempotency persistence needs a table
docs/migrations/rollback-M79.sql                 Only if a migration is added
openapi.json                                      API contract update
docs/ai/api-index.md                              API index update
specs/013c-retry-debug-surfaces/                  Generated SpecKit artifacts
```

Forbidden expected scope:

```text
src/components/**                                 No SPEC-013C operator controls
src/app/** dashboard pages                        No new dashboard
src/lib/adapters/**                               No harness adapter
src/lib/sandbox*                                  No sandbox lifecycle
src/lib/task-create.ts                            No task creation changes
```

---

## Setup Evidence

- Worktree created at `.worktrees/013c-retry-debug-surfaces`.
- Branch: `013c-retry-debug-surfaces`.
- SpecKit CLI: `specify 0.8.16`.
- Package manager: `pnpm` from `pnpm-lock.yaml`.
- Remote: `origin` at `https://github.com/racecraft-lab/mission-control.git`.
- Reviewability preset: present and resolved for spec, plan, and tasks templates.
- Roadmap was updated before workflow generation to add `SPEC-013D` and make `SPEC-014C` depend on `SPEC-013D`.
- External context was fetched on 2026-05-27 from OpenAI Harness Engineering, OpenAI Symphony announcement, and `openai/symphony` SPEC.

---

## Next Step

Review this workflow. If the scope is correct, run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-013C-workflow.md
```
