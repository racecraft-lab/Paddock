# Implementation Plan: SPEC-013A Run-State Persistence Spine

**Branch**: `013a-run-state-spine` | **Date**: 2026-05-22 | **Spec**: `specs/013a-run-state-spine/spec.md`
**Input**: Feature specification from `specs/013a-run-state-spine/spec.md`

## Summary

SPEC-013A adds a durable, additive task-stage attempt persistence spine for operator inspection without introducing claim authority, scheduler behavior, retry controls, GitHub reconciliation, sandbox lifecycle, harness adapters, or auto-merge behavior. The implementation will add migration `076_task_stage_attempts`, a small strict TypeScript helper owning validation/projection/serialization/archive semantics, a dedicated read-only `GET /api/tasks/[id]/stage-attempts` route, and a compact read-only task-detail section near the existing Evidence section.

The existing `runs` / `AgentRun.metadata` model remains the runtime execution detail source, but it is insufficient as the sole task-stage attempt model because attempts must exist before a runtime run, attempts need queryable task-stage identity and archive state, and flag-off runtime paths must ignore attempt rows while debug inspection remains available.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 in Next.js 16 App Router / React 19  
**Primary Dependencies**: Existing Next.js, React, Zustand where current task detail patterns require it, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright; no new runtime dependency  
**Storage**: SQLite through `src/lib/migrations.ts`; additive migration `076_task_stage_attempts` plus manual rollback `docs/migrations/rollback-M76.sql`  
**Testing**: Vitest for migration/helper/route/component/guard tests; Playwright for the real task-detail UI journey; `pnpm typecheck`, `pnpm lint`, `pnpm build`, focused guard script  
**Target Platform**: Mission Control web app and local/operator SQLite deployments  
**Project Type**: Web application with route handlers, synchronous persistence helpers, and compact operator UI  
**Performance Goals**: Task detail attempt inspection remains bounded to one task, ordered attempts, and bounded recent lifecycle snippets; no scheduler/runtime query fan-out  
**Constraints**: Feature flag default-off; read-only inspection works with flag off; runtime scheduler/dispatch/task-chain/Aegis/GitHub sync/runs/review-packet/evidence paths remain table-blind  
**Scale/Scope**: One task-scoped debug inspection surface, one schema pair, one helper module, one route, one UI section  
**Reviewability Budget**: Primary surface is schema/read-model inspection. Projected warning-level scope: about 450-650 reviewable LOC, 6 production files, 14-16 total files. Budget warning accepted because the spec deliberately combines additive schema, read contract, and compact UI to prove inspectability; no block-level split is required because claim/reconciliation/write-control work remains deferred to SPEC-013B/C and SPEC-014.  
**Strict Scope**: Add `src/lib/task-stage-attempts.ts`, `src/app/api/tasks/[id]/stage-attempts/route.ts`, `src/components/panels/task-stage-attempts-section.tsx`, and focused tests for those modules to `tsconfig.spec-strict.json` and `eslint.config.mjs`. Keep existing touched files in strict scope where already present: `src/lib/feature-flags.ts` and `src/components/panels/task-board-panel.tsx` if strict coverage allows the existing file; otherwise document the scoped exception and cover the new component directly.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I. Zero-Regression Contract: PASS. New tables are additive, `FEATURE_TASK_CONTROL_PLANE` defaults off, and runtime paths remain table-blind.
- II. Upstream Compatibility Discipline: PASS WITH WARNING. Schema/API/UI are fork-control-plane additions and therefore upstream-divergent, but isolated and additive.
- IV. Test-First Development: PASS. Tasks must start with RED migration/helper/route/component/guard/Playwright tests before production edits.
- V. Feature-Flag Resolution Discipline: PASS. Add `FEATURE_TASK_CONTROL_PLANE` to the typed registry and use `resolveFlag`; guardrails block inline env reads.
- VII. Additive Migration Policy: PASS. Use migration `076_task_stage_attempts` and paired rollback `docs/migrations/rollback-M76.sql`.
- X. Observability and Auditability: PASS. Lifecycle history is append-only; archive is represented by current projection plus an `archived` event.
- XIV. Real UI Journey Quality Gate: PASS. A real Playwright journey is required for the compact task detail section.
- XV. Spec Artifact Provenance And Archive Sweep: PASS. Current target spec is excluded from same-run archival; generated screenshots stay CI/test artifacts unless a manifest exception exists.
- XVI. Reviewability And Verification Debt Control: PASS WITH WARNING. Scope exceeds warning-level LOC because schema, API, and UI are all needed to prove inspectability, but it stays below block thresholds and explicitly defers control authority.

Post-design re-check: PASS WITH SAME WARNINGS. Phase 1 artifacts keep runtime control-plane, fixture write endpoint, scheduler, GitHub reconciliation, retry, sandbox, and harness adapter behavior out of SPEC-013A.

For user-facing UI changes, implementation must include:

- Real Playwright e2e journey against the running app for task detail attempt inspection with deterministic seeded data.
- Docker-backed execution if Docker is available; otherwise record unavailability with local app verification.
- Screenshot artifacts for empty, loaded, archived, missing-run-link, linked-run, and responsive states.
- No committed binary screenshots unless a manifest-backed exception is added.
- Defect-remediation gate before PR update/readiness.

For SpecKit/evidence retention:

- Archive Sweep discovery/dry-run is recorded before Phase 0 by the autopilot workflow; current `013a-run-state-spine` is excluded.
- Cleanup is not part of this phase; unsafe or dirty worktrees dry-run or stop.
- Plan evidence retains source paths, branch/worktree safety decision, and generated screenshot policy.

For reviewability:

- Primary review surface: task-stage attempt persistence and read-model inspection.
- Secondary surfaces: feature flag registry, task-scoped route, compact task detail section, static guardrails, rollback doc.
- PR review packet source: spec/plan traceability, migration id `076`, route contract, UI screenshots, guardrail output, flag-off runtime ignore evidence, rollback instructions, and known deferred SPEC-013B/C/014 work.

## Project Structure

### Documentation (this feature)

```text
specs/013a-run-state-spine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── task-stage-attempts-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/api/tasks/[id]/stage-attempts/route.ts
├── components/panels/task-stage-attempts-section.tsx
├── components/panels/task-board-panel.tsx
└── lib/
    ├── feature-flags.ts
    ├── migrations.ts
    ├── task-stage-attempts.ts
    └── __tests__/
        ├── migrations-M76-task-stage-attempts.test.ts
        ├── task-stage-attempts.test.ts
        └── task-stage-attempts-route.test.ts

docs/migrations/
└── rollback-M76.sql

scripts/spec-013a/
└── check-run-state-scope-guards.mjs

tests/e2e/
└── spec-013a-task-stage-attempts.spec.ts
```

**Structure Decision**: Use the existing Mission Control single-app layout. Keep model/projection logic in one helper, expose one task-scoped route, and render one compact component from the existing task detail modal. Do not create a global dashboard or runtime write endpoint.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Warning-level multi-surface scope | Inspectability requires additive schema, route contract, and compact UI in one slice | Schema-only would not satisfy operator inspection; UI-only would lack durable attempt truth |
| New helper module | Status validation, current projection, run-summary serialization, and archive semantics need one owner | Spreading SQL and enum checks across route/tests would increase drift and make guardrails weaker |

## Phase 0 Research Decisions

See `research.md`.

## Phase 1 Design Decisions

See `data-model.md`, `contracts/task-stage-attempts-api.md`, and `quickstart.md`.

## Implementation Boundaries

- No runtime fixture/UAT write endpoint is selected for SPEC-013A. Representative attempt rows will be created by tests and deterministic UAT seeding in disposable data directories.
- Existing task Evidence route remains table-blind to `task_stage_attempts` and `task_stage_attempt_events`.
- `released` and `cancelled` remain passive observed lifecycle values only; no release/cancel/retry/claim UI controls are added.
- `run_id` is a nullable text field with app-level lookup. No foreign key to `runs.id`.
- Runtime paths named in the spec must not import `task-stage-attempts.ts` or reference attempt table strings.

## Migration Plan

- Selected migration id: `076_task_stage_attempts`.
- Tables:
  - `task_stage_attempts`
  - `task_stage_attempt_events`
- Parent uniqueness: `UNIQUE(workspace_id, task_id, stage_key, attempt_number)`.
- Read indexes: by task/stage/attempt, status/archive, optional `run_id`, and event ordering.
- Rollback file: `docs/migrations/rollback-M76.sql`.
- Rollback order: drop child events first, drop attempts second, delete only `076_task_stage_attempts` from `schema_migrations`, then run or instruct `PRAGMA foreign_key_check`.
- Operator warning: rollback removes attempt history unless backed up/exported first.

## Verification Plan

- RED migration tests for idempotency, table/column/index shape, uniqueness, rollback file presence, child-first rollback text, migration marker cleanup text, and foreign-key check guidance.
- RED helper tests for status validation, append-only lifecycle recording, current projection derivation, archive semantics, soft `run_id`, missing/unavailable run summary, ordering, metadata bounding, and fail-closed unknown states.
- Route tests for viewer auth, workspace masking, invalid explicit scope `400`, forbidden scope `403`, masked nonexistent/out-of-scope `404 task_not_found`, empty attempts, archived attempts, linked/missing run states, bounded lifecycle snippets, and table-blind evidence route.
- Component tests for loading, route error, empty, linked run, missing run, archived marker, bounded lifecycle list, and no action controls.
- Playwright journey for task detail `Run state` / `Stage attempts` section with screenshots for no attempts, mixed attempts, archived attempt, linked/missing run, and responsive layout.
- Static guardrails:
  - No inline `process.env.FEATURE_TASK_CONTROL_PLANE` outside `src/lib/feature-flags.ts`.
  - No imports of `task-stage-attempts` and no table-name strings in scheduler, dispatch, task-chain, Aegis, GitHub sync/poller, runtime runs, pilot review packet, or existing task evidence route/helper paths.
  - No claim/retry/release/cancel/scheduler/GitHub/sandbox/harness/auto-merge action controls in SPEC-013A UI/route names.
- Required commands:
  - `pnpm test src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts.test.ts src/lib/__tests__/task-stage-attempts-route.test.ts src/components/panels/__tests__/task-stage-attempts-section.test.tsx`
  - `pnpm exec playwright test tests/e2e/spec-013a-task-stage-attempts.spec.ts`
  - `node scripts/spec-013a/check-run-state-scope-guards.mjs`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`

