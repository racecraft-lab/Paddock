# Implementation Plan: SPEC-013D Claim-Control Operator UX

**Branch**: `013d-claim-control-operator-ux` | **Date**: 2026-05-30 | **Spec**: `specs/013d-claim-control-operator-ux/spec.md`
**Input**: Feature specification from `specs/013d-claim-control-operator-ux/spec.md`

## Summary

SPEC-013D adds a small claim-control section to the existing task detail Details tab so operators can inspect SPEC-013C claim-control state and submit retry, release, or cancel actions without terminal or API knowledge. The UI remains a client of the existing `GET /api/tasks/[id]/claim-reconciliation` and `POST /api/tasks/[id]/claim-control` contracts; no backend semantics, migration, scheduler behavior, sandbox lifecycle, adapter, dashboard, CLI, or MCP surface is introduced.

The technical approach is to keep loading and refresh orchestration in `TaskDetailModal`, add a bounded `ClaimControlSection` component near `TaskEvidenceSection` and `TaskStageAttemptsSection`, use closed local copy maps for action/outcome/error labels, keep idempotency keys ephemeral in component state, and verify the journey with component tests, a real authenticated Playwright flow, Storybook visual states, and manifest-backed screenshot evidence.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node.js >=22 with Next.js 16 App Router and React 19  
**Primary Dependencies**: Existing Next.js, React, Zustand where already used, Tailwind CSS 3, `better-sqlite3`, Vitest, Playwright, Storybook 10; no new runtime dependency  
**Storage**: Existing SQLite tables only through `better-sqlite3`; no migration and no new persisted UI state  
**Testing**: Vitest component/unit tests, real Playwright e2e against the running app, Storybook visual states, `pnpm typecheck`, `pnpm lint`, `pnpm build`  
**Target Platform**: Paddock web app task detail modal in supported desktop browser viewports; existing responsive modal constraints apply
**Project Type**: Next.js web application  
**Performance Goals**: Claim-control read fetch and refresh should not block existing evidence/run-state rendering; mutation completion refreshes the bounded read set with stable loading and receipt states rather than layout-shifting controls  
**Constraints**: Preserve SPEC-013B/C backend authority; derive action availability only from `claim_control.available_actions[]`; keep raw idempotency keys and unsafe diagnostics out of UI, storage, screenshots, and manifests; no new feature flag, migration, route, dashboard, scheduler, sandbox, adapter, harness execution, direct GitHub mutation, or successor selection  
**Scale/Scope**: One existing task detail modal surface, one new focused component, existing route clients, focused tests, one Playwright acceptance journey, and supplemental Storybook states  
**Reviewability Budget**: Primary surface is UI. Projected reviewable scope is under the warning budget: about 300-380 production LOC, 3 production files, and fewer than 15 total files. No split required unless implementation expands beyond the task-detail section or touches backend semantics.  
**Strict Scope**: Add spec-owned TS/TSX files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/components/panels/claim-control-section.tsx`, `src/components/panels/claim-control-copy.ts`, `src/components/panels/__tests__/claim-control-section.test.tsx`, `src/components/panels/claim-control-section.stories.tsx`, and `tests/e2e/spec-013d-claim-control-operator-ux.spec.ts`. If implementation avoids `claim-control-copy.ts`, omit that path from strict scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / Plan Decision |
|-----------|--------|--------------------------|
| I. Zero-Regression Contract | Pass | Feature uses existing backend flag/read model. When `claim_control` is absent, the Details tab remains quiet; when `FEATURE_TASK_CONTROL_PLANE=false`, actionable controls remain absent or disabled by backend state. |
| II. Install Compatibility And Operational Impact Discipline | Pass | Additive task-detail UI only; no migration, destructive schema change, startup assumption, or OpenClaw deployment change. |
| IV. Test-First Development | Pass | Tasks must write failing component/client and Playwright tests before implementation for enabled, disabled, confirmation, stale/conflict, flag-off, and read-only states. |
| V. Feature-Flag Resolution Discipline | Pass | Client does not call `resolveFlag` or inspect `process.env`; it consumes backend `feature_flag` and `claim_control` state from the read model. |
| X. Observability and Auditability | Pass | UI displays bounded receipts with audit/activity references and sanitized categories only; no raw request, key, prompt, transcript, provider payload, token, auth header, or GitHub body is rendered. |
| XI. Keep It Simple | Pass | One small component plus narrow task-detail integration. No new dashboard, tab, nested modal, global store, or generic claim-control framework. |
| XII. Avoid Speculative Generality | Pass | Plan does not add reusable control-plane abstractions beyond this section and its copy/state helpers. |
| XIII. Defensive Boundaries, Trusting Interior | Pass | Fetch/mutation boundaries map network, validation, auth, stale/conflict, and flag-off outcomes to typed UI states. Component interior trusts validated props. |
| XIV. Real UI Journey Quality Gate | Pass | Playwright must authenticate through the app, seed deterministic disposable data, drive real controls, attach required screenshots, and use `captureVisualSnapshot` where visual snapshots are enabled. |
| XV. Spec Artifact Provenance And Archive Sweep | Pass | Archive sweep already ran dry-run/provenance-only for prior specs; screenshots remain CI/Argos artifacts unless a manifest-backed exception is recorded. |
| XVI. Reviewability And Verification Debt Control | Pass | Primary review surface is UI. Scope remains under warning thresholds; final diff reviewability gate must rerun before PR. |

### Post-Design Constitution Re-Check

| Principle | Status | Post-Design Evidence |
|-----------|--------|----------------------|
| I, II, V | Pass | `data-model.md` and contracts introduce UI/client state only; no storage, route, or flag behavior changes. |
| IV, XIV | Pass | `quickstart.md` and contracts require RED component tests, real Playwright evidence, and Storybook visual states. |
| X, XIII | Pass | Contracts define bounded receipt/error rendering and same-submission idempotency retry without storing or rendering raw keys. |
| XVI | Pass | File list and review order remain bounded to task detail UI plus existing route clients. |

## Project Structure

### Documentation (this feature)

```text
specs/013d-claim-control-operator-ux/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── claim-control-ui-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   └── panels/
│       ├── task-board-panel.tsx                  # existing TaskDetailModal owner and refresh orchestration
│       ├── task-evidence-section.tsx             # existing adjacent section pattern
│       ├── task-stage-attempts-section.tsx        # existing adjacent section pattern
│       ├── claim-control-section.tsx             # new bounded claim-control component
│       ├── claim-control-copy.ts                 # optional closed copy-map helper
│       ├── claim-control-section.stories.tsx     # supplemental Storybook states
│       └── __tests__/
│           └── claim-control-section.test.tsx    # focused component/client state tests
├── app/
│   └── api/
│       └── tasks/[id]/
│           ├── claim-reconciliation/route.ts     # existing read source of truth
│           └── claim-control/route.ts            # existing mutation authority
└── lib/
    ├── task-claim-reconciliation.ts              # existing read-model types
    ├── task-claim-control-types.ts               # existing action/outcome/request vocabulary
    └── task-claim-control.ts                     # existing backend semantics, not changed for SPEC-013D

tests/
└── e2e/
    └── spec-013d-claim-control-operator-ux.spec.ts
```

**Structure Decision**: Use the existing task detail modal as the owner of fetch, mutation, and refresh orchestration. Add a focused presentational/interaction component for claim-control states so `task-board-panel.tsx` gains narrow integration code rather than another large inline section. Keep all backend authority in existing SPEC-013B/C modules and routes.

## Phase 0: Research

Research output is captured in `research.md`.

Key decisions:

- Task detail owns claim-control route calls and refresh sequencing.
- `ClaimControlSection` receives a normalized prop model and emits action intents.
- `claim_control.available_actions[]` is the sole availability source.
- Idempotency keys live only in memory and only survive a same-submission network retry.
- Playwright acceptance uses real app auth plus deterministic disposable fixtures; Storybook is supplemental.

## Phase 1: Design and Contracts

Design outputs:

- `data-model.md`: UI state model and state transitions only; no DB schema.
- `contracts/claim-control-ui-contract.md`: consumed GET fields, POST request construction, component contract, refresh matrix, accessibility contract, and evidence manifest contract.
- `quickstart.md`: local verification and operator UAT path.
- `AGENTS.md`: SpecKit plan pointer updated to this plan.

## Implementation Notes

### Component Contract

`ClaimControlSection` should render from a narrow UI model based on the latest claim reconciliation envelope:

- `schema_version`
- `task.id`, `task.workspace_id`, `task.status`, `task.stage_key`
- `feature_flag.enabled`
- `claim_control.stage_key`
- `claim_control.authorization`
- `claim_control.available_actions`
- `claim_control.retry_eligibility`
- `claim_control.backoff`
- `claim_control.expected_state`
- `claim_control.last_operator_action`
- `claim_control.last_sanitized_error`

The component must not inspect raw task status, evidence, attempts, role, or activities to decide whether retry, release, or cancel is available. It may disable local submit buttons only for missing required local input such as cancel or override reason.

### Mutation and Refresh

Each confirmed action posts to `POST /api/tasks/[id]/claim-control` with:

- `Idempotency-Key` header generated for that confirmation attempt
- `action`
- `stage_key`
- `expected` copied from the latest read model
- `override_backoff`
- `override_reason`
- `reason`
- `client_correlation_id`

After any bounded server envelope or error envelope, refresh claim reconciliation before displaying final availability. Also refresh task evidence, stage attempts, and the task-list item when those surfaces are loaded. Pure client-side validation failures do not call the route. Network failures keep one same-submission retry option using the same in-memory idempotency key and identical body.

### Accessibility

The section is a named region. Loading and success/refresh messages use polite status semantics; validation, conflict, and network failures use alert semantics. Inline confirmation receives focus on the heading or first required field, and the final receipt receives focus after refresh. Disabled actions remain real disabled controls with associated reason text.

### Visual and UAT Evidence

The Playwright journey must capture:

- `spec013d-claim-control-before-active.png`
- `spec013d-claim-control-confirm-retry.png`
- `spec013d-claim-control-after-retry.png`
- `spec013d-claim-control-disabled-reasons.png`
- `spec013d-claim-control-backoff-override.png`
- `spec013d-claim-control-stale-conflict.png`
- `spec013d-claim-control-viewer-read-only.png`
- `spec013d-claim-control-flag-off.png`

Use `captureVisualSnapshot` for primary before/after and key disabled, backoff, conflict, viewer, and flag-off states when visual snapshots are enabled. The fixture manifest must prove cleanup and feature-flag restoration without raw idempotency keys or unsafe diagnostics.

## Complexity Tracking

No constitution violations are introduced. Complexity tracking is not required.
