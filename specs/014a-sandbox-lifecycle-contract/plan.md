# Implementation Plan: SPEC-014A - Sandbox Ownership and Lifecycle Contract

**Branch**: `014a-sandbox-lifecycle-contract` | **Date**: 2026-05-28 | **Spec**: `specs/014a-sandbox-lifecycle-contract/spec.md`
**Input**: Feature specification from `specs/014a-sandbox-lifecycle-contract/spec.md`

## Summary

SPEC-014A adds the minimum durable sandbox-lifecycle contract required before any real harness adapter can execute already-claimed work. The implementation adds additive SQLite lifecycle/event tables, a narrow TypeScript helper for deterministic keys, bounded path evidence, lifecycle transitions, and feature-flagged fake owners, plus a read-only task-authorized `sandbox_lifecycle.v1` API. It deliberately excludes UI, real harness launch/resume/stop behavior, adapter manifests, retry controls, tracker truth, successor selection, governance changes, token accounting, and auto-merge.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 in a Next.js 16 App Router / React 19 application  
**Primary Dependencies**: Existing Next.js/React stack, `better-sqlite3`, existing feature-flag helper, existing auth/workspace-scope helpers; no new runtime dependency  
**Storage**: SQLite through `src/lib/migrations.ts`; additive M79 `079_agent_sandbox_lifecycles`; rollback SQL at `docs/migrations/rollback-M79.sql`  
**Testing**: Vitest for migration, helper, route, fake-owner, path-safety, and API parity tests; Playwright not planned because SPEC-014A adds no UI  
**Target Platform**: Existing Mission Control server/runtime deployment  
**Project Type**: Web application with server-side lifecycle/read-model modules  
**Performance Goals**: Lifecycle create/read helpers complete with single-task scoped queries; read API returns recent events with bounded limits and no table-wide scans  
**Constraints**: Flag OFF creates no lifecycle rows/events and touches no fake artifacts; lifecycle rows are not active claim locks; persisted path evidence never includes absolute host paths or raw fragments; UI is deferred to SPEC-014B  
**Scale/Scope**: One lifecycle per deterministic sandbox key, recent-event read windows, additive indexes for task/status, lifecycle event order, optional attempt/claim lookup, and cleanup inspection  
**Reviewability Budget**: Primary surface is server-side sandbox lifecycle persistence/helper/read API. Projected reviewable LOC: ~650. Production files: 4-5. Total files: ~14-16. Budget result: warning-level size but below hard block; ratified reviewability split exception applies because this is one lifecycle-safety slice and UI/adapter/real execution are deferred.  
**Strict Scope**: Add `src/lib/agent-sandbox-lifecycle.ts`, `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts`, and focused SPEC-014A tests to `tsconfig.spec-strict.json` and `eslint.config.mjs`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. `FEATURE_AGENT_RUNNER_SANDBOXES` defaults OFF. Disabled mutation attempts return structured disabled evidence before inserting rows/events or touching fake artifacts.
- **II. Install Compatibility And Operational Impact Discipline**: PASS. The spec is `install-compatible` and `factory-core`: it adds only new tables, new helper/API files, feature-flag registry entries, docs, and tests.
- **IV. Test-First Development**: PASS. Tasks must start with failing Vitest coverage for M79, bounded path rejection, flag-off no-mutation behavior, fake-owner no-launch behavior, and read route side-effect snapshots.
- **V. Feature-Flag Resolution Discipline**: PASS. All runtime behavior must call `resolveFlag('FEATURE_AGENT_RUNNER_SANDBOXES', ctx)`. No inline `process.env.FEATURE_*` checks.
- **VI. Dependency Supply-Chain Hygiene**: PASS. No new runtime dependency.
- **VII. Additive Migration Policy**: PASS. Live schema verification shows M78 is the latest migration in `src/lib/migrations.ts`, so Plan selects M79 and requires rollback SQL.
- **VIII. Successor Side-Effect Parity**: PASS. SPEC-014A must not call `createTask`, `advanceTaskChain`, or mutate successor state.
- **IX. Safe Evaluation Discipline**: PASS. No evaluator or dynamic execution path is added.
- **XIV. UI Evidence Policy**: N/A. No UI or Playwright journey is planned.
- **Reviewability Convention**: PASS with warning. The design concept ratified a lifecycle-safety split exception: schema pair, helper/API, production fakes, and tests are in scope; UI, manifests, real execution, and retry controls are deferred.

## Project Structure

### Documentation (this feature)

```text
specs/014a-sandbox-lifecycle-contract/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sandbox-lifecycle-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
src/
├── app/api/tasks/[id]/sandbox-lifecycles/route.ts
├── app/api/index/route.ts
└── lib/
    ├── agent-sandbox-lifecycle.ts
    ├── feature-flags.ts
    ├── migrations.ts
    └── __tests__/
        ├── agent-sandbox-lifecycle.test.ts
        ├── agent-sandbox-lifecycle-route.test.ts
        └── migrations-M79-agent-sandbox-lifecycles.test.ts

docs/
├── migrations/rollback-M79.sql
└── ai/
    └── rc-factory-technical-roadmap.md

openapi.json
tsconfig.spec-strict.json
eslint.config.mjs
```

**Structure Decision**: Keep SPEC-014A server-only. The helper owns lifecycle persistence, bounded path/key validation, fake owners, and read-model construction. The API route mirrors existing task-scoped read routes such as task evidence and claim reconciliation. No component, Zustand, Tailwind, or Playwright file is planned.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Warning-level reviewable LOC | Schema, helper, fake owners, read API, and safety tests are one lifecycle-safety contract | Splitting persistence from path/fake/read behavior would leave no independently testable lifecycle contract for SPEC-014B |

## Phase 0 Research Summary

- Harness Engineering maps to repository-local knowledge, direct runtime legibility, per-worktree isolation, and mechanical guardrails. SPEC-014A implements that lesson as durable lifecycle evidence and explicit path invariants, not as UI or runner behavior.
- Symphony maps to deterministic per-work-item workspaces, lifecycle hooks, and operator-readable evidence. SPEC-014A imports only lifecycle vocabulary and safety posture, not Symphony's scheduler, Linear assumptions, runner client, or token/accounting behavior.
- Existing Mission Control patterns favor task-scoped read APIs with `requireRole(request, 'viewer')`, `resolveWorkspaceScopeFromRequest`, `workspaceScopePredicate`, side-effect-free builders, and API index/OpenAPI parity.
- M76 `task_stage_attempts` and M78 `task_stage_claims` provide the closest migration/index examples. SPEC-014A must keep sandbox lifecycle rows separate from active claims.

See `research.md` for decisions and rejected alternatives.

## Phase 1 Design Summary

- Data model: `agent_sandbox_lifecycles` current projection plus `agent_sandbox_lifecycle_events` append-only evidence.
- Contract: task-authorized `sandbox_lifecycle.v1` read model under `/api/tasks/[id]/sandbox-lifecycles`, with optional lifecycle filtering.
- Quickstart: enabled fake lifecycle UAT, read API inspection, cleanup/rollback evidence, flag-off mutation blocking, and disabled read evidence.

## Implementation Notes

- Migration M79 must be rerun-safe with `CREATE TABLE IF NOT EXISTS` and named indexes.
- Rollback drops event indexes/table before lifecycle indexes/table, then deletes `079_agent_sandbox_lifecycles` from `schema_migrations`.
- `agent_sandbox_lifecycle_events` should keep denormalized workspace/task/stage/key fields for scoped read performance, while the lifecycle FK preserves event ownership.
- The helper should use positive allowlists and structured error codes rather than best-effort repair of unsafe inputs.
- Fake owners may create/remove fake marker artifacts only under bounded sandbox roots and only when the flag is enabled.
- Read route tests must snapshot row counts before/after GET for lifecycle/event tables and adjacent task/claim/attempt tables.

## Review Packet Source

- **What changed**: M79 lifecycle persistence, lifecycle helper/fakes, read-only API, API docs, strict-scope config, and tests.
- **Why**: Later harness adapters need deterministic sandbox ownership, bounded paths, durable cleanup evidence, and read-only inspectability before any real execution can launch.
- **Non-goals**: UI, runtime inventory, adapter manifests, real launch/resume/stop, retry controls, tracker truth, successor selection, governance changes, and auto-merge.
- **Review order**: migration/rollback -> helper/path safety -> fake owners/lifecycle transitions -> read route/API docs -> tests/guardrails.
- **Rollback/flags**: Disable `FEATURE_AGENT_RUNNER_SANDBOXES` to block all mutations; manual rollback uses `docs/migrations/rollback-M79.sql`.
