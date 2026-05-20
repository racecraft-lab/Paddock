# SpecKit Workflow: SPEC-009E - Pilot Eligibility and Evidence Surfaces

**Template Version**: 1.0.0, populated for Mission Control
**Created**: 2026-05-20
**Purpose**: Prepare and execute RC Factory Phase 8E by adding a read-only, task-scoped evidence surface for pilot eligibility, stored review packet evidence, smoke state, and future-state deferrals.

---

## How to Use This Workflow

Run from the dedicated worktree:

```bash
cd .worktrees/009e-pilot-evidence-surfaces
$speckit-autopilot docs/ai/specs/SPEC-009E-workflow.md
```

Codex skills use `$skill-name` invocation. Do not run slash-command variants in Codex.

---

## Design Concept

This workflow was enriched from the Grill Me interview required by `$speckit-setup`.

```text
docs/ai/specs/SPEC-009E-design-concept.md
```

The design concept is the source of truth for setup-time scoping decisions:

- Surface lives in the GitHub-linked task context.
- API route should be generic task evidence, not pilot-only naming.
- Data source is stored Mission Control evidence only.
- The surface is read-only.
- Local-only and partial-proof tasks show explicit incomplete/not-eligible states.
- UAT must prove the operator-facing UI against retained pilot evidence.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Pending | Generate `specs/009e-pilot-evidence-surfaces/spec.md` from the roadmap plus design concept |
| Clarify | `$speckit-clarify` | Pending | Focus on API contract, task detail UI seam, state semantics, and UAT source data |
| Plan | `$speckit-plan` | Pending | Plan read-only route, task detail Evidence UI, tests, and no-write guardrails |
| Checklist | `$speckit-checklist` | Pending | Run focused API, UX/accessibility, state-management, data-integrity, security, and error-handling domains |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first tasks with strict read-only and route/UI scope |
| Analyze | `$speckit-analyze` | Pending | Check drift against roadmap and design concept, especially no sync/generation/schema expansion |
| Implement | `$speckit-implement` | Pending | Implement only after G6 passes; verify locally and with UAT evidence |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Setup | Branch/worktree, design concept, workflow, preset resolution, and roadmap `In Progress` status are committed and pushed |
| G1 | After Specify | Requirements cover task-scoped evidence route, task detail Evidence UI, stored evidence sources, incomplete states, deferred future sections, read-only behavior, and UAT |
| G2 | After Clarify | API shape, UI seam, evidence-state vocabulary, non-pilot behavior, and UAT fixture/live source are resolved |
| G3 | After Plan | Architecture reuses existing stored evidence and artifact seams, adds no schema, and defines focused tests |
| G4 | After Checklist | All `[Gap]` markers are remediated or explicitly out of scope |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, scoped to one route/UI surface, and include UAT/checklist evidence |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; no design concept or roadmap drift remains |
| G7 | After Implement | Focused tests, typecheck/lint/build, browser coverage for the UI surface, smoke checklist update, PR packet, and branch push are complete |

---

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Flag-off and non-pilot task behavior must not regress existing task detail or artifact admin flows | Focused tests plus existing unit/build gates |
| II. Upstream Compatibility Discipline | Prefer additive route/component seams and avoid broad upstream-owned rewrites | Diff review and strict scope |
| IV. Test-First Development | Write RED tests for route response, evidence states, UI rendering, and read-only guardrails before implementation | Vitest/React tests and Playwright where UI changes |
| V. Feature-Flag Resolution Discipline | If a new runtime flag is used, route it through `resolveFlag`; otherwise document why no new flag is needed for read-only surface | Guardrail grep and Plan rationale |
| VI. Dependency Supply-Chain Hygiene | No new runtime dependency planned | `pnpm audit:high`, package diff |
| VII. Additive Migration Policy | No schema migration planned | Migration guardrail and diff review |
| X. Observability and Auditability | Missing/stale/deferred evidence must be visible and source-linked | Route contract and UI tests |
| XIV. Real UI Journey | Task detail Evidence surface requires browser-visible validation if UI changes | Playwright or existing visual/story coverage, as Plan determines |
| XVI. Reviewability And Verification Debt Control | Keep one primary surface: read-only task evidence route plus compact task detail evidence UI | Reviewability gate and PR packet |

**Constitution Check:** Pending until Specify and Plan confirm final route/UI shape.

### Setup Evidence

- Spec ID: SPEC-009E
- Branch: `009e-pilot-evidence-surfaces`
- Worktree: `.worktrees/009e-pilot-evidence-surfaces`
- Package manager: pnpm from `pnpm-lock.yaml`
- Reviewability setup gate:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

The gate passed under the roadmap transition exception. The generated spec must still keep the implementation narrower than the roadmap-wide heuristic: one task-scoped read route plus one compact task detail Evidence UI surface.

### Reviewability Preset

Preset `speckit-pro-reviewability` is already present. Template resolution verified:

- `spec-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/spec-template.md`
- `plan-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/plan-template.md`
- `tasks-template` resolves to `.specify/presets/speckit-pro-reviewability/templates/tasks-template.md`

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-009E |
| Name | Pilot Eligibility and Evidence Surfaces |
| Branch | `009e-pilot-evidence-surfaces` |
| Dependencies | SPEC-009D |
| Enables | SPEC-009F, SPEC-013A |
| Priority | P2 |
| Tool count / names | N/A - not a tool-surface spec |

### Roadmap Scope

Convert the SPEC-009C/009D manual smoke and review-packet evidence into durable read-only operator surfaces that show pilot eligibility inputs, GitHub-linked task evidence, current smoke status, and explicitly deferred automation/run-state fields without requiring terminal history.

### Strict Scope

Read-only API/UI or diagnostics surfaces, evidence derivation from existing task/activity/artifact/governance/review-packet state, smoke checklist linkage, and tests. No GitHub sync automation, no claim authority, no runner/sandbox model, and no new workflow language.

### Design Concept Decisions

1. First surface is task-scoped and tied to GitHub-linked task context.
2. Use stored Mission Control evidence only; no live GitHub refresh.
3. Add a generic task evidence route, not a pilot-named route.
4. Place a compact read-only Evidence section or tab inside existing task detail UI.
5. Local-only and partial-proof tasks must show explicit not-eligible/incomplete states.
6. SPEC-009E adds no write actions.
7. UAT must open a retained pilot task and verify UI plus stored evidence path.

### Success Criteria Summary

- Operators can inspect one task-local Evidence surface for a retained pilot issue/task.
- The surface shows eligibility labels/inputs, repo/issue linkage, synced task identity, smoke evidence links, current stage, and packet artifact references.
- Future run-state, GitHub sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and harness execution fields are visible as deferred with owner specs.
- Local-only or partial-proof tasks are not presented as proven pilot completion.
- No new schema migration, runtime dependency, write action, GitHub sync trigger, packet generation action, runner/control-plane behavior, sandbox lifecycle, or harness adapter behavior is introduced.

---

## Phase 1: Specify

**When to run:** Start of SPEC-009E. Focus on WHAT and WHY, not implementation details. Output: `specs/009e-pilot-evidence-surfaces/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-009E - Pilot Eligibility and Evidence Surfaces

### Problem Statement
Operators can now generate and inspect SPEC-009D pilot review packets, but practical review still requires knowing where to look across task artifacts, smoke checklist notes, task/activity rows, GitHub issue/PR identity, and future-state deferrals. SPEC-009E should add the first read-only operator surface that makes this stored evidence visible from the task context without terminal archaeology.

### Users
- Mission Control operators reviewing the self-hosting pilot trail after SPEC-009D.
- Reviewers who need a compact task-local view of eligibility, packet, smoke, GitHub, and deferral evidence.
- Future SPEC-009F and SPEC-013A implementers who need a stable task evidence contract to build on.

### Required Behavior
- Add a generic task evidence concept, with the initial route planned as `GET /api/tasks/[id]/evidence` unless Clarify/Plan proves a smaller existing seam.
- The route is read-only and derives from stored Mission Control evidence only.
- The v1 response includes pilot eligibility inputs, GitHub-linked task identity, packet artifact references, smoke checklist evidence, current stage, warnings/missing proof, and future-state deferrals.
- The task detail UI gets a compact read-only Evidence section or tab for GitHub-linked/pilot-relevant tasks.
- Local-only and partial-proof tasks show explicit not-eligible or incomplete evidence states with missing proof reasons.
- Future-state sections for run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution must be labeled as deferred and point to SPEC-013A/A1/B/C or SPEC-014A-D.
- UAT must open a retained pilot issue/task and verify the operator-facing UI reads stored evidence correctly.

### Constraints
- No schema migration.
- No new runtime dependency.
- No live GitHub refresh.
- No packet generation action.
- No smoke execution action.
- No GitHub sync trigger.
- No claim authority, runner state, retry control, sandbox lifecycle, adapter registry, or harness execution.
- No global Evidence page in this spec.
- Keep route and UI compact enough for one reviewable PR.

### Source Inputs
- Roadmap: `docs/ai/rc-factory-technical-roadmap.md`, SPEC-009E section.
- Design Concept: `docs/ai/specs/SPEC-009E-design-concept.md`.
- Prior packet contract: `specs/009d-pilot-review-lifecycle/contracts/pilot-review-packet.md`.
- Existing packet derivation: `src/lib/pilot-review-packet.ts`.
- Existing eligibility helper: `src/lib/pilot-issue-eligibility.ts`.
- Existing artifact routes: `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`.
- Existing task route/detail UI: inspect current `src/app/api/tasks/[id]/route.ts` and task detail/task board components before choosing file scope.

### Out of Scope
- SPEC-009F production triage outcome routing.
- SPEC-013A run-state persistence.
- SPEC-013A1 GitHub sync automation and poller lifecycle.
- SPEC-013B claim authority.
- SPEC-013C retry/debug controls.
- SPEC-014A-D sandbox and harness adapters.
```

### Specify Results

Fill after running:

| Metric | Value |
|--------|-------|
| Functional Requirements | Pending |
| User Stories | Pending |
| Acceptance Criteria | Pending |

### Files Generated

- [ ] `specs/009e-pilot-evidence-surfaces/spec.md`
- [ ] `specs/009e-pilot-evidence-surfaces/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any API, UI, state, or UAT behavior can be interpreted multiple ways. Maximum 5 targeted questions per session.

### Clarify Prompts

#### Session 1: API Contract And Naming

```bash
$speckit-clarify

Focus on SPEC-009E API contract and naming:
- Confirm whether `GET /api/tasks/[id]/evidence` is the right generic task-scoped route.
- Define response sections for pilot eligibility, GitHub/task identity, packet artifacts, smoke state, current stage, warnings, and deferrals.
- Decide how non-pilot tasks respond: empty, unavailable, not eligible, or deferred sections.
- Define error behavior for missing task, unauthorized workspace scope, artifact store disabled, and incomplete evidence.
- Ensure the route stays read-only and does not duplicate the artifact store.
```

#### Session 2: Task Detail UI And Accessibility

```bash
$speckit-clarify

Focus on SPEC-009E task detail UI:
- Choose the smallest existing task detail or task board seam for a compact Evidence section/tab.
- Define visibility rules for GitHub-linked, pilot-relevant, local-only, partial-proof, and no-evidence tasks.
- Define loading, empty, error, missing-proof, stale, and deferred states.
- Define keyboard/screen-reader expectations for the section/tab.
- Confirm no global Evidence page or diagnostics dashboard is introduced.
```

#### Session 3: Evidence State And Stored Source Truth

```bash
$speckit-clarify

Focus on stored evidence semantics:
- Define status vocabulary for eligible, not eligible, incomplete, missing, stale, available, redacted, quarantined, superseded, and deferred evidence.
- Confirm source hierarchy across tasks, activities, task_artifacts, quality_reviews, resource_policy_events, github_syncs, SPEC-009D packet artifacts, and `docs/qa/pilot-smoke-checklist.md`.
- Decide whether the route reuses `buildPilotReviewPacket()` output directly or builds a lighter task evidence view from existing helpers.
- Ensure no live GitHub call, new table, or write action is required for evidence display.
```

#### Session 4: UAT And Cleanup Evidence

```bash
$speckit-clarify

Focus on post-merge UAT:
- Identify the retained pilot issue/task evidence source that UAT should use.
- Define what operator must see in the Evidence UI to pass UAT.
- Define whether cleaned disposable UAT rows can be represented from smoke checklist and retained GitHub sync evidence.
- Define cleanup expectations if SPEC-009E creates fixture rows for UAT.
- Confirm the spec records UAT in `docs/qa/pilot-smoke-checklist.md` or a SPEC-009E checklist file.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | API Contract And Naming | Pending | Pending |
| 2 | Task Detail UI And Accessibility | Pending | Pending |
| 3 | Evidence State And Stored Source Truth | Pending | Pending |
| 4 | UAT And Cleanup Evidence | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/009e-pilot-evidence-surfaces/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: TypeScript 5.7 strict on Node >=22.
- App: Next.js 16 App Router with React 19.
- State/UI: Existing React/Zustand patterns where current panels need them; Tailwind CSS 3.
- Database: SQLite through `better-sqlite3`; no migration planned for SPEC-009E.
- Tests: Vitest for route/helper/component tests; Playwright or existing visual/story coverage when task detail UI changes.
- Package manager: pnpm only.

## Required Architecture
- Primary surface should be one read-only task-scoped evidence route plus one compact task detail Evidence UI section/tab.
- Route should derive from stored evidence only. It must not call GitHub, create artifacts, run smoke scripts, trigger sync, mutate tasks, or write activities.
- Reuse existing evidence primitives where possible:
  - `src/lib/pilot-issue-eligibility.ts`
  - `src/lib/pilot-review-packet.ts`
  - existing task, artifact, quality review, governance, and GitHub sync rows
  - `docs/qa/pilot-smoke-checklist.md` references for retained/cleaned UAT proof
- Treat `GET /api/tasks/[id]/evidence` as the preferred route name unless Plan proves a better generic task-scoped route exists.
- Keep response names generic enough for future task evidence, while v1 sections are pilot-derived.

## Constraints From Design Concept
- Quote and preserve Q3: "A route named `/pilot-evidence` would be too narrow if this is the durable pattern for all future task evidence."
- Quote and preserve Q6: "SPEC-009E adds no write actions."
- Local-only and partial-proof tasks must show explicit not-eligible/incomplete states.
- UAT must verify operator-facing UI for a retained pilot issue/task, not only API JSON.

## Strict Scope Guardrails
- No schema migration or rollback SQL.
- No new runtime dependency.
- No global Evidence page.
- No production triage routing beyond pilot evidence display.
- No automatic GitHub polling/sync lifecycle.
- No claim/reconciliation authority.
- No retry/debug controls.
- No sandbox lifecycle.
- No harness adapter manifest or execution.
- No task-chain workflow language change.

## Suggested Project Structure
- Route/helper: inspect current route layout before deciding exact files, with likely route `src/app/api/tasks/[id]/evidence/route.ts`.
- Evidence derivation helper: prefer `src/lib/task-evidence.ts` or similar generic naming if a helper is needed.
- UI: update existing task detail/task board component only where the evidence section belongs.
- Tests: focused API/helper/component tests plus browser validation for task detail Evidence UI.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, constitution gates, route/UI architecture |
| `research.md` | Pending | Decisions for route naming, UI seam, state vocabulary, stored evidence, UAT |
| `data-model.md` | Pending | Task evidence response model and state transitions |
| `contracts/` | Pending | Task evidence route contract |
| `quickstart.md` | Pending | API/UI/UAT verification path |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Target 4-6 focused domains because this spec crosses API, UI, stored evidence, and read-only safety.

### Checklist Prompts

#### 1. api-contracts

```bash
$speckit-checklist api-contracts

Focus on SPEC-009E requirements:
- `GET /api/tasks/[id]/evidence` or chosen generic task evidence route.
- Response sections for eligibility, identity, packet artifacts, smoke evidence, current stage, warnings, and deferrals.
- Error behavior for missing task, unauthorized scope, disabled artifact store, and incomplete evidence.
- Read-only guarantees and no duplicate artifact-store semantics.
```

#### 2. ux

```bash
$speckit-checklist ux

Focus on SPEC-009E requirements:
- Compact Evidence section/tab in task detail context.
- Visibility rules for GitHub-linked, pilot-relevant, local-only, incomplete, and no-evidence tasks.
- Operator comprehension without terminal archaeology.
- Clear display of missing/stale/deferred evidence without implying failure or success incorrectly.
```

#### 3. accessibility

```bash
$speckit-checklist accessibility

Focus on SPEC-009E requirements:
- Keyboard navigation to and within the Evidence section/tab.
- Screen-reader labeling for eligibility, current stage, packet refs, missing proof, and deferred sections.
- No text overflow or inaccessible status-only color coding.
```

#### 4. state-management

```bash
$speckit-checklist state-management

Focus on SPEC-009E requirements:
- Stored-evidence-only derivation.
- Evidence state vocabulary for available, missing, stale, incomplete, not eligible, redacted, quarantined, superseded, and deferred states.
- No client-side mutation, hidden refresh, or local override path.
```

#### 5. data-integrity

```bash
$speckit-checklist data-integrity

Focus on SPEC-009E requirements:
- Source-map or source-reference coverage from tasks, artifacts, quality reviews, governance rows, GitHub sync rows, and smoke checklist references.
- Local-only and partial-proof tasks never becoming proven pilot evidence.
- Retained SPEC-009D packet artifact refs stay traceable by id or hash.
```

#### 6. security

```bash
$speckit-checklist security

Focus on SPEC-009E requirements:
- Evidence display must not expose quarantined, raw secret-bearing, unsafe-preview, or oversized content.
- Markdown/text rendering must not activate stored evidence links unexpectedly.
- Route must respect workspace/task authorization and existing artifact masking behavior.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| api-contracts | Pending | Pending | Pending |
| ux | Pending | Pending | Pending |
| accessibility | Pending | Pending | Pending |
| state-management | Pending | Pending | Pending |
| data-integrity | Pending | Pending | Pending |
| security | Pending | Pending | Pending |
| Total | Pending | Pending | Pending |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/009e-pilot-evidence-surfaces/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Inputs
- `specs/009e-pilot-evidence-surfaces/spec.md`
- `specs/009e-pilot-evidence-surfaces/plan.md`
- `docs/ai/specs/SPEC-009E-design-concept.md`
- `specs/009d-pilot-review-lifecycle/contracts/pilot-review-packet.md`

## Task Structure
- Use TDD-first tasks.
- Organize by independently testable user stories, not technical layers.
- Begin with RED tests for route contract, state vocabulary, local-only/incomplete tasks, UI render, read-only guardrails, and deferral display.
- Keep route/helper tasks serialized if they touch the same file.
- Mark only truly independent component, fixture, docs, or contract tasks as `[P]`.

## Required Task Groups
1. Setup and RED contract fixtures.
2. Stored evidence derivation/helper.
3. Task evidence API route.
4. Task detail Evidence UI.
5. Local-only/incomplete/deferred state coverage.
6. Security/accessibility/browser verification.
7. UAT checklist, PR evidence, roadmap/workflow updates.

## Constraints
- No migration tasks.
- No dependency-addition tasks.
- No write-action tasks.
- No GitHub sync trigger tasks.
- No packet-generation action tasks.
- No global dashboard tasks.
- No runner/claim/sandbox/adapter tasks.
- Include explicit tasks to prove the route is read-only.
- Include explicit tasks to update `docs/qa/pilot-smoke-checklist.md` or a SPEC-009E checklist with UAT evidence.
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

**When to run:** Always after task generation.

### Analyze Prompt

```bash
$speckit-analyze

Cross-check `spec.md`, `plan.md`, `tasks.md`, and `docs/ai/specs/SPEC-009E-design-concept.md`.

Flag drift in these areas:
1. Route naming: should be generic task evidence, not pilot-only naming unless justified by a documented Clarify decision.
2. Mutability: no writes, no packet generation action, no GitHub sync action, no smoke execution action.
3. Evidence source: stored Mission Control evidence only; no live GitHub refresh.
4. UI scope: compact task detail Evidence section/tab, not a global dashboard.
5. Schema/dependency scope: no migration and no runtime dependency unless a ratified exception exists.
6. Future-spec boundaries: SPEC-009F, SPEC-013A/A1/B/C, and SPEC-014A-D remain deferred.
7. UAT: must prove operator-facing UI against retained pilot evidence, not only API or fixture render.
8. Test coverage: local-only, incomplete, stale/missing, redacted/quarantined, deferred, and read-only cases must have tasks.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After G6 passes.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD First

For each task:
1. RED: write the failing test first.
2. GREEN: implement the minimum behavior.
3. REFACTOR: keep tests green.
4. VERIFY: update evidence and run the scoped gate.

## Implementation Notes
- Work only inside branch `009e-pilot-evidence-surfaces`.
- Keep the route/helper generic as task evidence while v1 content is pilot-derived.
- Use stored evidence only. Do not call GitHub in the evidence route or UI path.
- Keep UI compact and consistent with the existing operational app style.
- Use existing auth/workspace/task route patterns.
- Reuse SPEC-009D packet artifact semantics and SPEC-007 artifact masking/redaction behavior.
- Preserve local-only/incomplete states explicitly.
- Keep all future run/sync/claim/retry/sandbox/adapter/harness fields descriptive and deferred.

## Verification Commands
- `pnpm typecheck`
- `pnpm lint`
- Focused Vitest route/helper/component tests generated by tasks.
- Browser/UI validation for the task detail Evidence section as defined by Plan.
- `pnpm build`
- Broader `pnpm test` or `pnpm test:all` if implementation touches shared task/detail surfaces.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Setup / RED coverage | Pending | Pending | Pending |
| Evidence derivation and API | Pending | Pending | Pending |
| Task detail UI | Pending | Pending | Pending |
| Incomplete/deferred/security states | Pending | Pending | Pending |
| Verification and UAT | Pending | Pending | Pending |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `tasks.md`
- [ ] Focused route/helper tests pass
- [ ] Focused UI/component/browser tests pass
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test` or `pnpm test:all` passes when scope requires it
- [ ] `docs/qa/pilot-smoke-checklist.md` or SPEC-009E evidence checklist records UAT
- [ ] PR body includes what/why/how, validation, evidence, reviewer guide, known deferrals, and rollback/flag notes
- [ ] Branch pushed and PR opened

---

## Project Structure Reference

```text
src/app/api/tasks/[id]/              Existing task detail route area; likely home for task evidence route
src/app/api/task-artifacts/          Existing artifact list/read routes from SPEC-007/SPEC-009D
src/components/panels/               Existing task board/detail panel surfaces
src/lib/pilot-issue-eligibility.ts   SPEC-009C1 stored eligibility helpers
src/lib/pilot-review-packet.ts       SPEC-009D packet derivation and artifact publication
docs/qa/pilot-smoke-checklist.md     Manual smoke and UAT evidence ledger
specs/009d-pilot-review-lifecycle/   Prior packet contracts, data model, tests, and evidence
specs/009e-pilot-evidence-surfaces/  Generated SPEC-009E artifacts
```

---

## Lessons Learned

Fill after implementation.
