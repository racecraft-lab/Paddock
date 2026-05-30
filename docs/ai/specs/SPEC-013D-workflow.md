# SpecKit Workflow: SPEC-013D - Claim-Control Operator UX

**Template Version**: 1.0.0
**Created**: 2026-05-30
**Purpose**: Prepare RC Factory Phase 11D by making the SPEC-013C retry, release, and cancel backend contract discoverable and usable from the existing task detail experience, while preserving SPEC-013B/C backend authority and keeping first real harness operation blocked until this UX gate is accepted.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-013D-workflow.md` from the `013d-claim-control-operator-ux` worktree.
2. Keep all generated spec artifacts under `specs/013d-claim-control-operator-ux/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. Keep the implementation bounded to the existing task detail modal, SPEC-013C route clients, focused UI tests, and documentation/evidence updates.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-scaffold-spec`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-013D-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `$speckit-clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | Branch/worktree, SpecKit CLI, Codex agents, pnpm/Node 22, reviewability preset, archive sweep, typecheck, lint, unit-test rerun, build, and knowledge index passed on 2026-05-30 |
| Specify | `$speckit-specify` | Complete | Generated `spec.md` and requirements checklist; G1 passed with zero clarification markers |
| Clarify | `$speckit-clarify` | Complete | Resolved UI copy, component ownership, fixture shape, accessibility/focus, stale/conflict refresh, idempotency lifecycle, and visual evidence details; G2 passed |
| Plan | `$speckit-plan` | Complete | Produced task-detail UI architecture, client contract, UI state model, quickstart, strict-scope file list, and no-migration decision; G3 passed |
| Checklist | `$speckit-checklist` | Complete | Generated and passed UX, accessibility, API contracts, state management, and error-handling requirements-quality checklists; G4 passed with zero gap markers |
| Tasks | `$speckit-tasks` | Complete | Generated 72 dependency-ordered TDD tasks across setup, foundation, five user stories, and polish; G5 passed and reviewability gate passed via transition exception for heuristic over-counting |
| Analyze | `$speckit-analyze` | Complete | Found and resolved one Docker-backed UI evidence coverage gap; G6 passed with no unresolved CRITICAL/HIGH findings |
| Implement | `$speckit-implement` | In Progress | Setup/foundation T001-T010 complete; claim-control copy/request helpers, component shell, Storybook/e2e shells, and task-detail route-client integration are in place |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `013d-claim-control-operator-ux`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-013D `In Progress` only on this branch |
| G1 | After Specify | Requirements cover task-detail placement, backend-driven disabled reasons, inline confirmations, backoff override reason, refresh behavior, role handling, idempotency key lifecycle, outcome receipts, source of truth, flag-off behavior, Playwright, and Storybook states |
| G2 | After Clarify | No unresolved markers remain for copy, component contract, fixture seeding, accessibility/focus, stale/conflict handling, visual evidence, or flag-off/absent-state behavior |
| G3 | After Plan | Architecture cites existing `task-board-panel.tsx`, `TaskEvidenceSection`, `TaskStageAttemptsSection`, SPEC-013C routes/read model, auth/workspace patterns, Playwright helpers, and Storybook patterns; no migration or new backend state is introduced |
| G4 | After Checklist | All `[Gap]` markers from UX, accessibility, API-contracts, state-management, and error-handling checklists are addressed or explicitly out of scope |
| G5 | After Tasks | Tasks are reviewable, dependency-ordered, TDD-first, and bounded to the existing task detail UI plus route-client integration |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; artifacts agree that SPEC-013D does not change retry/release/cancel semantics or launch harnesses |
| G7 | During Implement | Focused unit/component tests, real Playwright journey, Storybook/visual evidence where applicable, typecheck, lint, build, full relevant tests, roadmap/workflow status, PR review packet, and target UAT evidence pass before closeout |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | With `FEATURE_TASK_CONTROL_PLANE=false` or absent `claim_control`, existing task detail behavior remains quiet and non-actionable | Flag-off/absent-state tests and Playwright screenshots prove no accidental controls or legacy regressions |
| IV. Test-First Development | Component, client, and browser behavior begins with failing tests | Tasks require RED tests before implementation for enabled, disabled, confirmation, stale/conflict, and flag-off states |
| V. Feature-Flag Resolution Discipline | UI uses the backend read model; no inline runtime env flag reads enter client code | Static guardrails and code review check for no `process.env.FEATURE_TASK_CONTROL_PLANE` client checks |
| X. Observability and Auditability | UI surfaces bounded outcome receipts and audit/activity references without raw diagnostics | Component and e2e tests assert no raw idempotency keys, raw request bodies, auth headers, or broad diagnostics render |
| XI. Keep It Simple | One task-detail section and one route-client path own the UX | Plan keeps dashboard, tabs, nested modals, CLI/MCP, and new backend routes out of scope |
| XIV. Real UI Journey Quality Gate | Changed operator UI has a real Playwright journey against the running app with screenshots | Playwright covers enabled actions, disabled reasons, inline confirmation, backoff override, stale/conflict refresh, viewer state, flag-off state, and before/confirm/after screenshots |
| XVI. Reviewability And Verification Debt Control | SPEC-013D declares UI as the primary review surface and records the setup exception | Reviewability gates run at setup, tasks, and PR time; PR packet names scope, non-goals, review order, and verification |

**Constitution Check:** Re-check after Specify, Plan, Analyze, and Implement. Any backend semantics, dashboard, scheduler, sandbox, adapter, or harness expansion must be split or explicitly rejected.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/2.5.0/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
```

Result:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"primary_surfaces":["API","harness/adapter","or docs/process","scheduler/runtime","schema/migration","seed/config","UI"],"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

Decision: setup may proceed under the roadmap transition exception, but downstream phases must keep actual implementation to SPEC-013D strict scope: existing task detail UI, client calls to SPEC-013C routes, confirmation/error/loading states, accessibility/browser coverage, Storybook states, and operator-facing copy. Backend retry/release/cancel semantics, scheduler behavior, sandbox lifecycle, adapter registry, and harness execution remain out of scope.

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

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-013D |
| Name | Claim-Control Operator UX |
| Branch | `013d-claim-control-operator-ux` |
| Dependencies | SPEC-013C |
| Enables | SPEC-014C |
| Priority | P1 |
| Scope source | Phase 11D - Claim-control operator UX |
| Acceptance criteria source | Phase 11D Acceptance Criteria |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Make the SPEC-013C retry/release/cancel API usable from the existing task detail/evidence experience. Operators should see claim state, action eligibility, backoff, last error, audit/debug summaries, and confirmation affordances without needing terminal archaeology.

### Current Codebase Baseline

- `src/components/panels/task-board-panel.tsx` owns the task detail modal and already fetches task evidence and stage attempts for the `Details` tab.
- `src/components/panels/task-evidence-section.tsx` renders stored evidence with compact blocks and sanitized display text.
- `src/components/panels/task-stage-attempts-section.tsx` renders passive run state and stage-attempt lifecycle evidence.
- `GET /api/tasks/[id]/claim-reconciliation` returns `task_claim_reconciliation.v1` and includes optional `claim_control` state from SPEC-013C.
- `POST /api/tasks/[id]/claim-control` performs authenticated operator/admin mutations with `Idempotency-Key`, expected state, bounded outcome envelopes, and sanitized diagnostics.
- `src/lib/task-claim-control-types.ts` defines the closed action and outcome vocabulary plus request body validation.
- `tests/e2e/task-detail-evidence.spec.ts` provides a nearby pattern for seeding deterministic task-detail evidence and cleaning disposable rows.

### Strict Scope

Allowed:

- A dedicated `Claim control` section in the existing task detail `Details` tab.
- Client fetch of `GET /api/tasks/[id]/claim-reconciliation` and rendering from its optional `claim_control` data.
- Client submission to `POST /api/tasks/[id]/claim-control` with generated per-confirmation idempotency keys, backend expected-state fields, optional/default release reason, required cancel reason, and required backoff override reason.
- Inline confirmation states for retry, release, cancel, and retry backoff override.
- Disabled visible action rows with backend-provided unavailable reasons.
- Compact inline outcome receipts with action, outcome, stage key, refreshed availability, audit/activity reference when present, idempotency replay status, and sanitized error category.
- Automatic refresh of claim reconciliation, task evidence, stage attempts, and task list state after accepted actions and semantic stale/conflict responses.
- Viewer/read-only behavior driven by `authorization.can_mutate`.
- Feature flag off and absent `claim_control` behavior that stays quiet unless the backend provides disabled/debug state.
- Component/unit tests, real Playwright task-detail journey, screenshots, Storybook states, OpenAPI/API index checks only if client contract docs require updates, and UAT evidence.

Forbidden:

- New dashboard, global control page, or new task detail tab unless Clarify proves the details-tab section is impossible.
- New backend retry/release/cancel semantics, new mutation endpoints, new claim/reconciliation logic, new scheduler behavior, or direct database writes from the UI.
- CLI/MCP action surface for claim-control.
- Sandbox lifecycle, adapter manifest/registry, real harness execution, OpenClaw/external harness launch, or long-running runner ownership.
- Direct GitHub issue mutation, successor selection, `advanceTaskChain`, `createTask`, or whole-task terminal mutation.
- Browser-native `confirm()`, nested modal confirmations, or persisted idempotency keys.
- Raw request bodies, idempotency keys, diagnostics, auth headers, prompts, transcripts, provider payloads, token data, or GitHub bodies in UI receipts or Storybook fixtures.

### Design Concept Decisions

- Q1: Put claim controls in a dedicated `Claim control` section inside the existing task detail `Details` tab.
- Q2: Keep retry, release, and cancel visible as disabled controls when unavailable, using backend-provided reasons.
- Q3: Use inline confirmation states, not browser-native prompts or nested modals.
- Q4: Show retry backoff and require an inline operator reason before allowing override confirmation.
- Q5: After action outcomes, refresh claim reconciliation, task evidence, stage attempts, and task list item state.
- Q6: Show backend-provided claim-control state to task-visible users; enable mutation only when `authorization.can_mutate=true`.
- Q7: Generate fresh client-side idempotency keys per confirmation attempt and keep them only for the in-flight/same-network-retry path.
- Q8: Show compact inline outcome receipts; do not expose raw JSON or raw sensitive fields.
- Q9: Require a real Playwright task-detail journey with screenshots for enabled, disabled, backoff, stale/conflict, viewer, and flag-off states.
- Q10: Use `GET /api/tasks/[id]/claim-reconciliation` as the source of truth; do not extend evidence or derive from stage attempts.
- Q11: Require bounded reasons for cancel and backoff override; release reason is optional/defaulted.
- Q12: No actionable controls when the flag is off or `claim_control` is absent; stay quiet unless backend disabled/debug state exists.
- Q13: Add Storybook states for stable visual review in addition to Playwright.

### Success Criteria Summary

- [ ] With no `claim_control` data, the existing task detail `Details` tab renders without actionable claim controls and without user-visible regressions.
- [ ] With `FEATURE_TASK_CONTROL_PLANE=false`, the task detail UI shows no actionable claim-control mutations and displays only backend-provided disabled/debug state when available.
- [ ] Authorized operators can discover an active claimed stage, see enabled release/cancel/retry actions, open inline confirmation, submit the action, and inspect an inline receipt plus refreshed evidence/run state.
- [ ] Viewers or insufficient-role users can see disabled actions and backend reasons but cannot submit retry, release, or cancel.
- [ ] Retry with active backoff shows backoff timing/reason and requires an override reason before allowing override submission.
- [ ] Cancel requires a bounded operator reason; release may use an optional/default reason; all user-entered strings are bounded and sanitized before display.
- [ ] Client submissions echo backend expected-state fields and generate per-confirmation idempotency keys without persisting or displaying raw keys.
- [ ] Stale/conflict/idempotent replay outcomes produce bounded inline feedback and trigger the same refresh path as successful actions.
- [ ] Playwright covers enabled release/cancel/retry, disabled/ineligible reasons, backoff override, stale/conflict refresh, viewer read-only state, and feature-flag-off behavior against the running app with screenshots.
- [ ] Storybook covers enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error component states.
- [ ] No new backend mutation semantics, scheduler behavior, dashboard, sandbox lifecycle, adapter registry, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation enters SPEC-013D.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/013d-claim-control-operator-ux/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-013D - Claim-Control Operator UX

### Problem Statement
SPEC-013C added authenticated backend retry, release, cancel, backoff, idempotency, and debug authority, but operators still need terminal/API knowledge to use it. SPEC-013D must make those controls discoverable in the existing task detail experience without changing backend semantics.

### Users
- Mission Control operators/admins recovering claimed stages.
- Viewer/read-only users who need to understand why actions are unavailable.
- Future SPEC-014C implementers who need the operator UX gate complete before first real harness operation.

### User Stories
- As an operator, I can open a task detail and understand the current claimed-stage state, available actions, unavailable reasons, backoff, last operator action, and sanitized errors.
- As an operator, I can retry, release, or cancel an eligible stage through inline confirmation and inspect a bounded outcome receipt with refreshed evidence.
- As an operator, I can override retry backoff only after entering a bounded reason.
- As a viewer, I can inspect claim-control state without being able to mutate scheduler state.
- As a maintainer, I can verify the journey through real Playwright evidence and stable Storybook visual states.

### Requirements Seed
- Add a dedicated `Claim control` section inside the existing task detail `Details` tab, near Evidence and Run state.
- Fetch `GET /api/tasks/[id]/claim-reconciliation` and render from `claim_control` only; do not derive eligibility client-side.
- Submit `POST /api/tasks/[id]/claim-control` with `Idempotency-Key`, backend `expected_state`, `action`, `stage_key`, bounded reasons, and optional backoff override.
- Keep disabled retry/release/cancel actions visible with backend unavailable reasons.
- Use inline confirmation states, not browser-native `confirm()` and not nested modals.
- Refresh claim reconciliation, task evidence, stage attempts, and the task list item after success, stale/conflict, and idempotent replay outcomes.
- Show compact inline receipts with action, outcome, stage key, refreshed availability, audit/activity reference, replay status, and sanitized error category.
- Require cancel reason and backoff override reason; allow optional/default release reason.
- Keep flag-off and absent-state quiet unless backend disabled/debug state is present.

### Constraints
- Primary review surface: UI.
- Preserve SPEC-013C as backend authority for retry/release/cancel semantics.
- No new migration, scheduler behavior, backend route, dashboard, CLI/MCP action, sandbox lifecycle, adapter registry, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation.
- User-facing UI changes must satisfy Constitution XIV with real Playwright coverage and screenshots.
- Reference `docs/ai/specs/SPEC-013D-design-concept.md` for Q1-Q13 decisions and non-goals.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 23 |
| User Stories | 5 |
| Acceptance Criteria | 13 acceptance scenarios, 7 measurable success criteria |

### Files Generated

- [x] `specs/013d-claim-control-operator-ux/spec.md`
- [x] `specs/013d-claim-control-operator-ux/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, to resolve ambiguity before planning. Maximum 5 targeted questions per session.

### Clarify Prompts

#### Session 1: UX, Copy, and Interaction States

```bash
$speckit-clarify

Focus on SPEC-013D task-detail UX:
- Exact labels and helper copy for `retry`, `release`, `cancel`, disabled reasons, backoff, override, and outcome receipts.
- Inline confirmation layout, focus behavior, keyboard path, and loading state.
- Distinction between active claim, retry-eligible evidence, ineligible state, flag-off state, and absent `claim_control`.
- Pay special attention to: preventing the UI from implying that disabled actions are broken or that API-only state is recomputed client-side.
```

#### Session 2: Route Contracts and State Refresh

```bash
$speckit-clarify

Focus on SPEC-013D API/client contracts:
- Exact fields consumed from `task_claim_reconciliation.v1.claim_control`.
- Request body construction for `POST /api/tasks/[id]/claim-control`, including `expected`, reasons, override fields, and idempotency header.
- Refresh behavior after success, stale/conflict, validation errors, idempotent replay, and network failure.
- Pay special attention to: source-of-truth boundaries and avoiding evidence/stage-attempt derived eligibility.
```

#### Session 3: Fixtures, Accessibility, and Visual Evidence

```bash
$speckit-clarify

Focus on SPEC-013D verification:
- Deterministic fixture shape for active claim, retry-eligible failed/cancelled evidence, active backoff, stale/conflict, viewer, and flag-off states.
- Playwright journey steps and screenshot names for before, confirm, after, disabled, override, stale/conflict, and viewer states.
- Storybook component states for enabled, disabled, backoff override, stale/conflict receipt, flag-off, loading, and error.
- Pay special attention to: real app authentication, cleanup/residue proof, focus management in the existing modal, and visual defects before PR.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | UX, copy, and interaction states | 5 | Accepted bounded task-detail section ownership, closed copy-map labels, inline focus/live-region behavior, deterministic Playwright/Storybook evidence, and same-submission idempotency retry lifecycle |
| 2 | Route contracts and state refresh | 6 | Pinned consumed `claim_control` fields, POST body/header construction, expected-state copy rule, reason/override defaults, refresh matrix for bounded server outcomes, and network-failure same-submission retry behavior |
| 3 | Fixtures, accessibility, and visual evidence | 7 | Pinned real authenticated Playwright fixture scope, `spec013d-claim-control-*` markers, required screenshot names, cleanup/feature-flag restoration proof, accessibility assertions, Storybook states, and visual snapshot manifest expectations |

### Consensus Resolution Log

| Phase Item | Round | Routed Categories | Outcome | Analysts Used |
|------------|-------|-------------------|---------|---------------|
| Phase 2 Session 1 - Idempotency key lifecycle | Recovery | security | Accepted in-memory same-submission retry only; raw key never persisted/rendered; clear key on response, close, cancel, task change, expected-state refresh, changed body, or new decision | Parent session using SPEC-013C spec/data-model/route-test evidence; subagent consensus skipped to avoid session-limit deadlock |
| Phase 2 Session 2 - Route contracts and refresh | Recovery | api-contracts, state-management | No unresolved items after parent evidence review; accepted backend read model as sole action source, copied expected-state predicate, bounded POST body/header construction, and refresh-after-server-envelope matrix | Parent session using `src/app/api/tasks/[id]/claim-reconciliation/route.ts`, `src/app/api/tasks/[id]/claim-control/route.ts`, `src/lib/task-claim-reconciliation.ts`, and route tests; subagent consensus skipped to avoid session-limit deadlock |
| Phase 2 Session 3 - Fixtures, accessibility, and visual evidence | Recovery | ux, accessibility, tests | No unresolved items after parent evidence review; accepted authenticated serial Playwright fixture suite, deterministic cleanup proof, required screenshots, keyboard/live-region assertions, Storybook state list, and visual snapshot manifest | Parent session using existing task-detail e2e and visual snapshot helper patterns; subagent consensus skipped to avoid session-limit deadlock |

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Generates the technical implementation blueprint. Output: `specs/013d-claim-control-operator-ux/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Frontend: Next.js 16 App Router, React 19, TypeScript 5.7 strict, Tailwind CSS 3.
- State: existing task detail local state plus Zustand store refresh patterns where already used.
- Backend contracts: existing `GET /api/tasks/[id]/claim-reconciliation` and `POST /api/tasks/[id]/claim-control`; do not add backend semantics.
- Storage: no migration planned.
- Testing: Vitest/component tests, Playwright e2e against real app, Storybook/visual states where applicable, pnpm.

## Current Code References
- `src/components/panels/task-board-panel.tsx`: task detail modal, fetch patterns, task list refresh.
- `src/components/panels/task-evidence-section.tsx`: sanitized compact evidence block pattern.
- `src/components/panels/task-stage-attempts-section.tsx`: run state section and compact card pattern.
- `src/lib/task-claim-control-types.ts`: closed action/outcome vocabulary and validation constraints.
- `src/app/api/tasks/[id]/claim-reconciliation/route.ts`: read source of truth.
- `src/app/api/tasks/[id]/claim-control/route.ts`: mutation route.
- `tests/e2e/task-detail-evidence.spec.ts`: deterministic task detail fixture and cleanup pattern.

## Constraints
- Use the Design Concept doc at `docs/ai/specs/SPEC-013D-design-concept.md`, especially Q1-Q13.
- Add a small `ClaimControlSection` component if useful, but do not introduce a dashboard or new task detail tab.
- Keep all eligibility, unavailable reason, expected-state, and authorization logic backend-driven.
- Generate idempotency keys client-side only per confirmation attempt and do not render or persist raw keys.
- Refresh claim reconciliation, task evidence, stage attempts, and task list state after relevant outcomes.
- Storybook is supplemental; Playwright is the acceptance gate for the real journey.
- No backend migration, new route, scheduler, claim semantics, sandbox, adapter, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation.

## Architecture Notes
- Treat claim-control as a task-detail control panel layered beside existing evidence, not as a data model extension to task evidence.
- Use sanitized display helpers for all backend-provided strings and user-entered reason echoes.
- Keep mutation loading and confirmation state stable so text and controls do not shift unpredictably in the modal.
- Reuse existing auth/workspace scoping query helpers through route URLs; client code should append active product-line scope consistently with existing task detail fetches.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Defines task-detail ownership, `ClaimControlSection`, no migration/no new backend semantics, strict-scope targets, refresh behavior, and visual evidence requirements |
| `research.md` | Complete | Records decisions for modal ownership, bounded component, backend-driven action source, copy map, idempotency lifecycle, Playwright/Storybook evidence, and no new backend state |
| `data-model.md` | Complete | UI state model only: read model subset, action descriptors, confirmation draft, idempotency attempt, outcome receipt, and fixture manifest |
| `contracts/` | Complete | `contracts/claim-control-ui-contract.md` pins consumed GET fields, POST body/header construction, refresh matrix, component contract, and evidence manifest |
| `quickstart.md` | Complete | Focused local verification, visual evidence commands, manual UAT checklist, cleanup expectations, and flag-off rollback path |

---

## Phase 4: Domain Checklists

**When to run:** After `$speckit-plan`; validates both spec and plan together.

### Recommended Domains

#### 1. UX Checklist

Why this domain: SPEC-013D is primarily a user-facing task-detail interaction spec with enabled, disabled, loading, confirmation, receipt, and refresh states.

```bash
$speckit-checklist ux

Focus on SPEC-013D requirements:
- Task detail `Details` tab placement and visual hierarchy near Evidence and Run state.
- Disabled action visibility and backend-provided unavailable reasons.
- Inline confirmation, reason entry, loading, success, stale/conflict, and receipt states.
- Pay special attention to: keeping controls discoverable without making flag-off or absent-state tasks noisy.
```

#### 2. Accessibility Checklist

Why this domain: Claim-control actions are mutating controls inside an existing modal and must be keyboard and screen-reader accessible.

```bash
$speckit-checklist accessibility

Focus on SPEC-013D requirements:
- Keyboard navigation through actions, inline confirmation, reason fields, and cancel/confirm controls.
- ARIA labels, `aria-live` status regions, focus retention after refresh, and disabled-state semantics.
- Playwright coverage for the real modal journey.
- Pay special attention to: avoiding nested modal/focus-trap bugs and ensuring disabled reasons are perceivable.
```

#### 3. API Contracts Checklist

Why this domain: The UI consumes SPEC-013C read/mutation routes and must not drift from backend expected-state, idempotency, and outcome contracts.

```bash
$speckit-checklist api-contracts

Focus on SPEC-013D requirements:
- `GET /api/tasks/[id]/claim-reconciliation` fields consumed by the UI.
- `POST /api/tasks/[id]/claim-control` request construction, idempotency header, expected-state echoing, and reason fields.
- Response handling for success, replay, stale/conflict, validation, viewer/forbidden, and flag-off outcomes.
- Pay special attention to: no client recomputation of claim-control eligibility and no raw sensitive fields in UI receipts.
```

#### 4. State Management and Error Handling Checklist

Why this domain: SPEC-013D has coupled UI state for fetches, confirmation, idempotency, network failures, stale/conflict refresh, and multiple read models.

```bash
$speckit-checklist state-management

Focus on SPEC-013D requirements:
- Local component state for confirmation, reason text, in-flight idempotency key, loading, and receipts.
- Refresh ordering across claim reconciliation, task evidence, stage attempts, and task list state.
- Network failure retry behavior and same-key immediate retry constraints.
- Pay special attention to: not reusing idempotency keys across separate operator decisions and avoiding stale UI after semantic conflicts.
```

```bash
$speckit-checklist error-handling

Focus on SPEC-013D requirements:
- User-facing handling for stale_state, conflict, validation_error, retry_backoff_active, flag_off, forbidden_role, and network failure.
- Sanitized display of backend-provided errors and bounded user-entered reasons.
- Recovery guidance after stale/conflict and idempotent replay outcomes.
- Pay special attention to: showing useful operator feedback without exposing raw diagnostics or request details.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| ux | 18 | 0 | FR-001, FR-003, FR-004, FR-008, FR-012-FR-017, FR-019, FR-022-FR-023, SC-001-SC-003, SC-007 |
| accessibility | 16 | 0 | FR-004, FR-008, FR-019, FR-022, FR-024-FR-025, SC-004, SC-008 |
| api-contracts | 17 | 0 | FR-002, FR-006-FR-011, FR-018, FR-020-FR-021, FR-025, Session 2 clarifications |
| state-management | 17 | 0 | FR-010, FR-012-FR-016, FR-019, FR-025, edge cases, data model state transitions |
| error-handling | 16 | 0 | FR-010-FR-011, FR-016-FR-019, FR-024-FR-025, stale/conflict/replay/flag-off/network edge cases |
| **Total** | 84 | 0 | `validate-gate.sh G4` passed with 0 `[Gap]` markers |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/013d-claim-control-operator-ux/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered TDD tasks for SPEC-013D using:
- `specs/013d-claim-control-operator-ux/spec.md`
- `specs/013d-claim-control-operator-ux/plan.md`
- `docs/ai/specs/SPEC-013D-design-concept.md`
- `docs/ai/specs/SPEC-013D-workflow.md`

## Task Structure
- Start with RED tests for client contract mapping, component states, authorization/disabled rendering, confirmation, backoff override, receipts, refresh behavior, and sanitization.
- Add focused implementation tasks for `ClaimControlSection` and task-detail integration.
- Add route-client integration tasks using the existing SPEC-013C route contracts without changing backend semantics.
- Add Storybook state tasks for enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error.
- Add Playwright tasks against the real running app with deterministic fixtures and screenshots for before, confirm, after, disabled, override, stale/conflict, viewer, and flag-off states.
- Add guard/documentation tasks that prove no dashboard, new backend route, migration, scheduler behavior, sandbox, adapter, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation entered the diff.

## Constraints
- Use the Design Concept non-goals to reject scope drift.
- Follow red-green-refactor for runtime code.
- Keep tasks reviewable and split if implementation expands beyond existing task detail UI plus client route calls.
- Preserve existing task evidence and stage-attempt behavior when claim-control state is absent.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 72 |
| Phases | 8 task phases: setup, foundational, US1, US2, US3, US4, US5, polish |
| Parallel Opportunities | 29 `[P]` tasks across setup/foundation, story test batches, Storybook/Playwright evidence, and polish docs/guards |
| User Stories Covered | 5: inspect state, submit actions, override backoff, read-only access, visual review states |
| Reviewability Gate | Exception/pass: task heuristic reported reviewable LOC 2880, 8 production files, 53 total files, and 5 surfaces because it counts existing route-contract citations, docs, and forbidden-scope guard strings; recorded transition exception, implementation primary surface remains UI |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks to catch drift before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-013D across:
- `docs/ai/specs/SPEC-013D-design-concept.md`
- `docs/ai/specs/SPEC-013D-workflow.md`
- `specs/013d-claim-control-operator-ux/spec.md`
- `specs/013d-claim-control-operator-ux/plan.md`
- `specs/013d-claim-control-operator-ux/tasks.md`
- completed checklists under `specs/013d-claim-control-operator-ux/checklists/`

Focus on:
1. Drift from the Design Concept decisions Q1-Q13.
2. Any backend retry/release/cancel semantic changes, scheduler changes, migration, dashboard, sandbox, adapter, harness execution, direct GitHub mutation, successor selection, or whole-task terminal mutation.
3. Missing Playwright coverage for real task-detail journeys required by Constitution XIV.
4. Missing Storybook/visual states where planned.
5. Missing disabled, viewer, flag-off, stale/conflict, idempotent replay, and backoff override coverage.
6. Client-side recomputation of eligibility instead of consuming `claim_control`.
7. Raw idempotency keys, request bodies, diagnostics, tokens, auth headers, prompts, transcripts, provider payloads, or GitHub bodies leaking into UI fixtures or receipts.
8. Reviewability budget expansion beyond the accepted UI-primary scope.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A1 | Medium | Docker-backed UI evidence path was implicit in Constitution XIV but not explicit in generated SPEC-013D tasks/quickstart | Added Docker-backed Playwright quickstart command and task T072; no unresolved CRITICAL/HIGH findings remain |

### Confidence Gate

Phase 6.5 ran in advisory mode. `confidence-gate.sh` returned `NO_DATA` because no synthesizer confidence emit exists in the workflow file, with recommended action `soft_skip`; autopilot proceeds to implementation with G6 passing and no CRITICAL/HIGH findings.

---

## Phase 7: Implement

**When to run:** After tasks are generated and analyzed with no unresolved CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task:
1. RED: write the failing test first.
2. GREEN: implement the minimum code to pass.
3. REFACTOR: clean up while tests stay green.
4. VERIFY: run focused checks and record evidence.

## Pre-Implementation Setup
- Confirm branch is `013d-claim-control-operator-ux`.
- Detect package manager from lockfile; this repo uses pnpm.
- Start from a clean worktree.
- Re-read `docs/ai/specs/SPEC-013D-design-concept.md` before coding.

## Implementation Notes
- Prefer a small component such as `src/components/panels/claim-control-section.tsx` if it keeps `task-board-panel.tsx` understandable.
- Keep route fetch helpers local and simple unless an existing helper pattern already fits.
- Use `GET /api/tasks/[id]/claim-reconciliation` for state and `POST /api/tasks/[id]/claim-control` for mutations.
- Generate idempotency keys per confirmation attempt and keep them only in component state for the in-flight/same-network-retry path.
- Use existing task detail refresh hooks to reload task evidence and stage attempts after outcomes.
- Use sanitized display text for all backend strings and user reason echoes.
- Do not introduce new backend semantics or data persistence.

## Verification Targets
- Focused component/unit tests for `ClaimControlSection` states and client request construction.
- Existing task detail tests updated without regressions.
- Real Playwright task-detail journey with screenshots.
- Storybook visual states where component states are representable without a backend.
- `pnpm typecheck`
- `pnpm lint`
- Focused Vitest cluster.
- `pnpm build`
- Full `pnpm test` outside sandbox when required by risk/blast radius.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Foundation/client contract | Complete | 10 | T001-T010 completed with strict-scope entries, closed copy/request helpers, component prop/draft/receipt model, Storybook/e2e fixture shells, and focused component tests. Initial RED run produced one assertion correction before GREEN. |
| 2 - Claim control section | In Progress | 0 | Component implementation exists for active, disabled, absent, flag-off, receipt, network retry, backoff override, and viewer/read-only states; story-specific task checkoff remains pending until remaining user-story assertions are reconciled task-by-task. |
| 3 - Task detail integration | In Progress | 0 | `TaskDetailModal` now fetches claim reconciliation with `appendScopeToPath`, renders `ClaimControlSection`, posts to the existing claim-control route with ephemeral idempotency keys, and refreshes claim/evidence/stage-attempt/task-list state after responses. |
| 4 - Browser and visual verification | Pending | 0 | Pending |
| 5 - Docs, guardrails, PR packet, UAT | Pending | 0 | Pending |

### Phase 7 Checkpoint Evidence

- Focused component suite: `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec vitest run src/components/panels/__tests__/claim-control-section.test.tsx` passed with 9 tests.
- Strict TypeScript: `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck` passed.
- Lint: `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint` passed.

---

## Post-Implementation Checklist

- [ ] All generated tasks marked complete in `tasks.md`.
- [ ] Design Concept decisions Q1-Q13 are preserved or explicitly revised with a recorded rationale.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Focused Vitest/component tests pass.
- [ ] Playwright task-detail journey passes with screenshots.
- [ ] Storybook/visual states are captured where applicable.
- [ ] `pnpm build` passes.
- [ ] Full test suite passes or unrelated existing failures are documented with evidence.
- [ ] Roadmap, workflow, UAT report, and PR packet are updated.
- [ ] Target UAT proves operator claim controls on a deployed build with zero disposable residue.

---

## Project Structure Reference

```text
src/components/panels/
  task-board-panel.tsx                  existing task detail modal integration
  task-evidence-section.tsx             existing stored evidence display pattern
  task-stage-attempts-section.tsx       existing run state display pattern
  claim-control-section.tsx             likely SPEC-013D component

src/app/api/tasks/[id]/
  claim-reconciliation/route.ts         existing read source of truth
  claim-control/route.ts                existing SPEC-013C mutation route
  evidence/route.ts                     existing task evidence route
  stage-attempts/route.ts               existing run state route

src/lib/
  task-claim-control-types.ts           closed actions/outcomes/request validation
  task-claim-reconciliation.ts          read-model builder with `claim_control`
  task-evidence.ts                      display sanitization helpers

tests/e2e/
  task-detail-evidence.spec.ts          nearby deterministic task-detail fixture pattern
```

---

Template based on SpecKit best practices and populated for Mission Control SPEC-013D.
