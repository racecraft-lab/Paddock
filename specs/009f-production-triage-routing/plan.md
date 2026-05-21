# Implementation Plan: Production Triage Outcome Routing

**Branch**: `009f-production-triage-routing` | **Date**: 2026-05-21 | **Spec**: `specs/009f-production-triage-routing/spec.md`
**Input**: Feature specification from `specs/009f-production-triage-routing/spec.md`

## Summary

SPEC-009F records terminal, recommendation-only routing evidence for six non-remediation Issue Triage dispositions: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`. The smallest implementation reuses existing `task_dispositions`, `task_artifacts`, and `activities` persistence; adds strict TypeScript lane payload contracts; records idempotent routing artifacts and activities through a focused helper; derives `triage_routing` in the existing task Evidence response; and extends the compact task Evidence UI with a read-only `Triage routing` block.

The design is constrained by these Design Concept decisions:

- Q1/Q14: "Recommendation-only routing/evidence" and "Display evidence and recommended next steps only; no action buttons in v1."
- Q2: "Create a SpecKit-ready handoff artifact" without invoking setup or creating a worktree.
- Q3: "Create an explicit clarification request" without external messaging.
- Q4: recommend a specialist from existing metadata only when safe; otherwise expose unassigned.
- Q5: use one shared closure recommendation model with outcome-specific required fields.
- Q6: "Extend the existing task Evidence route and section" instead of adding a separate surface.
- Q7: use existing `PILOT_MISSION_CONTROL_E2E` scope.
- Q8: reuse `task_dispositions`, `task_artifacts`, and `activities`; no migration.
- Q9/Q15: keep non-remediation outcomes terminal in Issue Triage with evidence only.
- Q10: fixture-driven UAT plus operator-readable Evidence inspection.
- Q11/Q12/Q13: strict payload schemas, idempotent reruns, proposed labels as metadata only.

If implementation cannot preserve these constraints, split before coding. Do not add live GitHub mutation, non-remediation successors, remediation successors, claim/runner/sandbox/adapter/auto-merge work, automatic SpecKit setup, a migration, or a new runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application on Node >=22
**Primary Dependencies**: Existing Next.js, React, Zustand where already used, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright; no new runtime dependency
**Storage**: Existing SQLite tables through `better-sqlite3`: `tasks`, `workflow_templates`, `task_dispositions`, `task_artifacts`, `activities`, `projects`, `project_agent_assignments`, and `agents`; no migration
**Testing**: Vitest unit/component tests, focused Playwright task Evidence journey, existing `pnpm typecheck`, `pnpm lint`, `pnpm build`, and relevant guard scripts
**Target Platform**: Mission Control web app and API running locally/standalone
**Project Type**: Web application with local SQLite persistence and read-only operator UI extension
**Performance Goals**: Task Evidence derivation remains bounded to one task and same-workspace stored rows; no live network calls; no background dispatch
**Constraints**: Recommendation-only, no live external side effects, no successor creation for non-remediation outcomes, no migration, no new runtime dependency, no new API route, no automatic SpecKit setup, no UI action controls
**Scale/Scope**: Six deterministic non-remediation outcome families; one current active routing artifact per source task/outcome with superseded artifacts trace-only
**Reviewability Budget**: Primary surface is terminal triage routing evidence. Secondary surfaces are the existing task Evidence route/UI and fixture/UAT evidence. Project setup carries a roadmap transition exception, but this plan stays under the implementation block threshold target: projected 5 production files and 14 total touched files. No split required if tasks keep this file set.
**Strict Scope**: Add `src/lib/triage-routing-payloads.ts` and `src/lib/triage-routing.ts` to `tsconfig.spec-strict.json` and `eslint.config.mjs`. Existing strict-scope files to extend: `src/lib/task-evidence.ts`, `src/components/panels/task-evidence-section.tsx`, `src/lib/__tests__/task-evidence.fixtures.ts`, and `src/lib/__tests__/task-evidence.test.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: Pass. Routing is gated by `resolveFlag("PILOT_MISSION_CONTROL_E2E")`, source template slug `mission-control_issue_triage`, repo `racecraft-lab/mission-control`, supported disposition, and existing evidence prerequisites. Gate-off and non-Mission-Control tasks return missing `triage_routing` and write nothing.
- **II. Upstream Compatibility Discipline**: Pass. Additive helper/modules and existing API/UI extension; no destructive schema or upstream-owned layout rewrite.
- **IV. Test-First Development**: Pass. Tasks must start with RED Vitest coverage for payload validators, routing idempotency, no successors/no side effects, and task Evidence derivation, then React/Playwright coverage for the compact UI block.
- **V. Feature-Flag Resolution Discipline**: Pass. No new flag; all runtime routing checks use `resolveFlag("PILOT_MISSION_CONTROL_E2E")`.
- **VII. Additive Migration Policy**: Pass. No migration or rollback SQL because persistence reuses existing tables.
- **VIII. Successor Side-Effect Parity**: Pass. SPEC-009F creates no tasks. Any discovered need to create `mission-control_specialist_route`, `mission-control_needs_spec_route`, close-issue, or remediation successors blocks implementation and requires split.
- **X. Observability and Auditability**: Pass. Successful routes create validated task artifacts and `triage_routing_recorded` activities; conflicts and artifact-publish failures create sanitized activities.
- **XIV. Real UI Journey Quality Gate**: Pass with required focused Playwright journey over `/tasks` and six seeded outcome tasks. Screenshots remain `test-results/` artifacts and are not committed.
- **XVI. Reviewability And Verification Debt Control**: Pass by split policy. The primary review surface is terminal triage routing evidence. The task Evidence UI extension is compact and directly required by the same surface. Split if implementation exceeds 6 production files or introduces another primary surface.
- **Archive Sweep / Evidence Policy**: Pass. Current target spec is excluded from same-run archival. UAT screenshots and fixture export are review artifacts under `test-results/spec-009f-triage-routing/`, not committed binaries. `docs/qa/pilot-smoke-checklist.md` records durable UAT evidence and cleanup counts.

Post-design check remains pass with no justified constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/009f-production-triage-routing/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- triage-routing-contract.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/lib/
|-- triage-routing-payloads.ts          # new strict payload types/builders/validators
|-- triage-routing.ts                   # new routing helper, gates, idempotency, activity/artifact writes
|-- task-evidence.ts                    # extend response with triage_routing derivation
`-- __tests__/
    |-- triage-routing-payloads.test.ts # new payload validator coverage
    |-- triage-routing.test.ts          # new routing/idempotency/side-effect coverage
    |-- task-evidence.fixtures.ts       # extend fixture DB and seeds
    `-- task-evidence.test.ts           # extend Evidence response coverage

src/components/panels/
|-- task-evidence-section.tsx           # add compact read-only Triage routing block
`-- __tests__/
    `-- task-evidence-section.test.tsx  # extend UI rendering/no-action-control coverage

tests/e2e/
`-- spec-009f-triage-routing.spec.ts    # new six-outcome Evidence journey and screenshots

scripts/spec-009f/
`-- check-scope-guards.mjs              # new diff guard for forbidden side effects

docs/qa/
`-- pilot-smoke-checklist.md            # add SPEC-009F UAT evidence section
```

**Structure Decision**: Use the existing Next.js app structure. The feature is not a new app surface or external API. The only server API change is the shape returned by the existing task evidence helper and route. New runtime logic belongs under `src/lib/` because routing is a pure server-side helper over SQLite rows and existing artifact/activity persistence. UI stays inside the existing `TaskEvidenceSection`.

## Exact Likely Implementation Files

- `src/lib/triage-routing-payloads.ts` (created): strict schema version, disposition/lane/artifact constants, common envelope types, lane-specific payload types, normalization, proposed-label normalization, safe evidence reference validation, and payload builders/validators.
- `src/lib/triage-routing.ts` (created): source-task gates, idempotency key generation, supported-disposition routing, same-outcome retry handling, changed-disposition conflict handling, artifact publish/supersede orchestration, and activity recording.
- `src/lib/task-evidence.ts` (modified): add `triage_routing` response section, allowed section matrix entry, route-specific status type, validated routing artifact selection, failed/conflict activity mapping, source-map entries, warnings, and inert text output.
- `src/components/panels/task-evidence-section.tsx` (modified): render compact read-only `Triage routing` block with existing Evidence semantics, no action controls, inert text, validated links only, proposed labels as metadata, and unassigned/deferred states.
- `src/lib/__tests__/triage-routing-payloads.test.ts` (created): RED coverage for six payload families, bad schema/version/fields, safe text/reference stripping, proposed-label normalization, and unsupported outcomes.
- `src/lib/__tests__/triage-routing.test.ts` (created): RED coverage for six routing outcomes, `ACTIONABLE_REMEDIATION` preservation, no successors, no GitHub mutation seam calls, flag/source gates, idempotency, supersession, conflict, publish failure, and missing-activity backfill.
- `src/lib/__tests__/task-evidence.fixtures.ts` (modified): add fixture schema columns/tables used by SPEC-009F and deterministic six-outcome seed helpers.
- `src/lib/__tests__/task-evidence.test.ts` (modified): assert `triage_routing` available/missing/incomplete/conflict/superseded states and no raw unsafe content.
- `src/components/panels/__tests__/task-evidence-section.test.tsx` (modified): assert block labels/states, proposed labels with `applied: false`, no buttons/controls, accessible region preservation, and fallback wording.
- `tests/e2e/spec-009f-triage-routing.spec.ts` (created): seed six tasks, open `/tasks`, inspect `Task evidence` and `Triage routing`, assert no mutation/action controls, attach six screenshots and fixture export, cleanup rows.
- `scripts/spec-009f/check-scope-guards.mjs` (created): scan `origin/main...HEAD` for forbidden successor/template/claim/runner/sandbox/adapter/auto-merge/GitHub mutation drift and committed screenshot binaries.
- `tsconfig.spec-strict.json` (modified): include new SPEC-009F TS modules and tests where strict scope requires.
- `eslint.config.mjs` (modified): include new SPEC-009F TS modules/tests in strict type-checked lint scope.
- `docs/qa/pilot-smoke-checklist.md` (modified): add durable SPEC-009F UAT section with command, commit, matrix, artifact paths, screenshots paths, cleanup counts, and explicit no-live-side-effect statement.
- `specs/009f-production-triage-routing/*` (created/modified): generated plan, research, data model, contract, quickstart, and later tasks/checklists.

Out of scope unless Analyze proves unavoidable: `docs/ai/workflows/mission-control/workflow-contract.yaml`, migrations, OpenAPI index, task board data fetching, GitHub sync modules, `task-create.ts`, runner/claim/sandbox/adapter modules, and workflow-template successor definitions.

## Phase 0: Research

See `research.md`.

All design unknowns are resolved by the spec clarifications and named design concept decisions. No `NEEDS CLARIFICATION` markers remain.

## Phase 1: Design And Contracts

See:

- `data-model.md`
- `contracts/triage-routing-contract.md`
- `quickstart.md`

## Reviewability Budget And Split Decision

Proceed without split if the implementation stays inside:

- One primary surface: terminal triage routing evidence.
- At most 6 production files.
- At most 15 total files.
- No migration.
- No new runtime dependency.
- No live external side effects.

Projected implementation stays within budget:

- Production files: 5 (`triage-routing-payloads.ts`, `triage-routing.ts`, `task-evidence.ts`, `task-evidence-section.tsx`, and optionally `scripts/spec-009f/check-scope-guards.mjs` treated as guard tooling).
- Total files: 14 including focused tests, strict-scope configs, e2e, smoke checklist, and spec artifacts.
- Reviewable LOC: expected warning range but below block threshold if helpers remain focused.

Split decision: no split required for this plan. Split immediately if coding requires a new route surface, schema migration, workflow successor templates, live GitHub mutation, or more than 6 production files.

## Complexity Tracking

No constitution violations are justified. The roadmap transition exception exists from setup, but SPEC-009F's implementation plan remains narrower than the transition heuristic and does not rely on new primary surfaces.

## Verification Plan

Focused checks to run during implementation:

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e tests/e2e/spec-009f-triage-routing.spec.ts
node scripts/spec-009f/check-scope-guards.mjs
```

Full verification before PR update:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Codex sandbox note: per project guidance, run `pnpm test` outside the sandbox if the suite fails under local runtime resource restrictions.

## Gate Risks

- Existing workflow contract includes non-remediation helper templates (`mission-control_specialist_route`, `mission-control_close_issue`, `mission-control_needs_spec_route`). SPEC-009F must not create successor tasks for them; it may only use their existence as recommendation wording context.
- `task-evidence.ts` currently treats artifacts generically as packet artifacts. The implementation must keep `triage_routing` as a separate typed section so pilot packet evidence behavior remains unchanged.
- Artifact supersession must use existing `task_artifacts` metadata and must not invent a table.
- The Playwright UAT must clean up disposable rows and not commit screenshot binaries.
- `ACTIONABLE_REMEDIATION` behavior must be covered as unchanged and outside SPEC-009F routing.
