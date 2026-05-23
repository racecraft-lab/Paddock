# Implementation Plan: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

**Branch**: `013a1-github-sync-automation` | **Date**: 2026-05-23 | **Spec**: `specs/013a1-github-sync-automation/spec.md`
**Input**: Feature specification from `specs/013a1-github-sync-automation/spec.md`

## Summary

Add default-off, Product Line/workspace-scoped GitHub issue sync automation as a scheduler-owned lifecycle task with durable controls, database-backed overlap leases, bounded pagination/tick duration, failure/backoff visibility, owner-aware shared-repository selection, and rollback-safe disablement. Existing manual `POST /api/github/sync` remains an independent operator fallback; automatic lifecycle control moves to `PATCH /api/github/sync/control`, and lifecycle status is exposed through a versioned `github_sync_lifecycle.v1` envelope on `GET /api/github/sync` plus the existing GitHub Sync panel.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand where the existing GitHub Sync panel needs app state, Tailwind CSS 3, `better-sqlite3`, existing GitHub helper modules, Vitest, Playwright, ESLint, pnpm
**Storage**: SQLite through `better-sqlite3`; additive M77 lifecycle tables through `src/lib/migrations.ts`; existing `github_syncs` remains the compatibility sync-history table
**Testing**: Vitest unit/API tests, migration idempotence tests, Playwright real-app journey for the GitHub Sync panel, and existing `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` gates
**Target Platform**: Next.js web application with local SQLite runtime and operator-managed background scheduler
**Project Type**: Web application with API, scheduler/runtime, database migration, and focused UI changes
**Performance Goals**: Scheduler wakes every 60 seconds; each automatic tick processes bounded scopes only, with per-scope defaults of max 10 GitHub pages, 1,000 issues, or 45 seconds; no same-scope duplicate ingestion under concurrent manual/automatic attempts
**Constraints**: `FEATURE_GITHUB_SYNC_AUTOMATION` hard-defaults OFF through `resolveFlag`; manual sync must work when the flag/control is off; no task claim, dispatch, launch, remediation execution, sandbox lifecycle, harness adapter, auto-merge, or automatic triage authority; cursor advancement is success-only
**Scale/Scope**: One lifecycle control row per `(workspace_id, github_repo)` plus one history/detail row per sync attempt; candidate selection groups eligible projects by `(workspace_id, github_repo)` before polling
**Reviewability Budget**: Primary surface scheduler/runtime; secondary surfaces API, schema/migration, UI, docs/process; projected reviewable LOC 700-1,200; projected production files 8-14; projected total files 14-22; budget result warning accepted with split exception from spec
**Strict Scope**: Add new spec-owned TS/TSX files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/github-sync-lifecycle.ts`, `src/lib/github-sync-lifecycle-types.ts`, `src/lib/github-sync-lifecycle-api.ts`, `src/app/api/github/sync/control/route.ts`, and any focused GitHub Sync panel subcomponent extracted from `src/components/panels/github-sync-panel.tsx`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS with constraint. Flag OFF and lifecycle controls disabled must preserve manual `POST /api/github/sync`; existing route currently requires `operator` and calls `pullFromGitHub(project, workspaceId)` directly (`src/app/api/github/sync/route.ts:66`, `src/app/api/github/sync/route.ts:96`, `src/app/api/github/sync/route.ts:113`).
- **II. Upstream Compatibility Discipline**: PASS with upstream-divergent classification. M77 is additive and avoids destructive migration.
- **IV. Test-First Development**: PASS planned. Tasks must start with failing Vitest migration/lifecycle/route tests and Playwright UI journey tests before implementation.
- **V. Feature-Flag Resolution Discipline**: PASS planned. `FEATURE_GITHUB_SYNC_AUTOMATION` must be added to `FeatureFlagKey`, `FEATURE_FLAG_KEYS`, and `FEATURE_FLAG_REGISTRY`; runtime checks must use `resolveFlag`, which currently defaults unknown/off values to false (`src/lib/feature-flags.ts:3`, `src/lib/feature-flags.ts:76`, `src/lib/feature-flags.ts:475`, `src/lib/feature-flags.ts:516`).
- **VII. Additive Migration Policy**: PASS with M77. Live migrations end at `076_task_stage_attempts` (`src/lib/migrations.ts:3387`), so SPEC-013A1 selects `077_github_sync_lifecycle`; rollback file `docs/migrations/rollback-M77.sql` is required.
- **X. Observability and Auditability**: PASS planned. Every automatic/manual/overlap/skipped/stale-recovered attempt writes `github_syncs` compatibility history plus lifecycle run detail and an activity row for operator-visible state changes.
- **XIII. Defensive Boundaries**: PASS planned. GitHub fetch/rate-limit/permission/malformed-data errors are classified before lifecycle state is updated. Existing `pullFromGitHub` records a failed `github_syncs` row on fetch failure (`src/lib/github-sync-engine.ts:700`, `src/lib/github-sync-engine.ts:708`); lifecycle automation must preserve that boundary while adding cursor/backoff semantics.
- **XIV. Real UI Journey Quality Gate**: PASS planned. UI changes are in the existing GitHub Sync panel (`src/components/panels/github-sync-panel.tsx:51`, `src/components/panels/github-sync-panel.tsx:466`) and require real Playwright coverage against the running app with screenshots as CI artifacts.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS planned. Archive Sweep is not executed in this phase, but the plan records current-target exclusion and no committed screenshot binaries unless manifest-backed.
- **XVI. Reviewability And Verification Debt Control**: WARNING ACCEPTED. The spec exceeds nominal budget due to one safety boundary spanning lifecycle, leases, cursor integrity, API, and UI. Split exception is ratified in the clarified spec; deferred surfaces remain SPEC-013B+ for claim/reconciliation and SPEC-014+ for harness/sandbox execution.

**Post-Design Re-check**: PASS with the same warning. Design keeps automatic polling inside scheduler/runtime and uses narrow API/UI/schema changes necessary for operator control and verification.

## Project Structure

### Documentation (this feature)

```text
specs/013a1-github-sync-automation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── github-sync-lifecycle-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/api/github/sync/
│   ├── route.ts                         # enrich GET lifecycle envelope; preserve POST manual contract
│   ├── control/route.ts                 # new PATCH lifecycle mutation endpoint
│   └── __tests__/
├── components/panels/
│   ├── github-sync-panel.tsx            # add lifecycle status/control in existing surface
│   └── __tests__/
├── lib/
│   ├── github-sync-engine.ts            # support bounded/cursor-aware pull options without changing manual default
│   ├── github-sync-poller.ts            # replace singleton interval behavior with scheduler-owned bounded tick helpers
│   ├── github-sync-lifecycle.ts         # new lifecycle control, leases, status envelope, run detail helpers
│   ├── github-sync-lifecycle-types.ts   # new strict shared types
│   ├── github-sync-lifecycle-api.ts     # new request/response validation helpers
│   ├── scheduler.ts                     # register scheduler-owned github_sync_automation task
│   ├── feature-flags.ts                 # add FEATURE_GITHUB_SYNC_AUTOMATION registry entry
│   └── migrations.ts                    # add M77 lifecycle schema
docs/migrations/
├── rollback-M77.sql
└── rollback-procedure.md
tests/
├── github-sync.spec.ts                  # real UI/API journey additions or new focused e2e spec
└── e2e/spec-013a1-github-sync-automation.spec.ts
```

**Structure Decision**: Use existing Mission Control web-app layout. The GitHub Sync route and panel are the operator-facing surfaces, scheduler runtime owns automatic ticks, and new lifecycle helpers isolate M77 state/lease/cursor logic from the existing sync engine.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Reviewable LOC above 800 and more than one secondary surface | Lifecycle safety requires scheduler, durable DB state, overlap control, API status/control, and minimal UI observability in one reviewable boundary | Splitting API/UI/schema away from scheduler would leave unobservable automation or controls without enforcement; task claim/dispatch/remediation/harness/auto-merge are explicitly deferred |
| New M77 lifecycle schema | Existing `github_syncs` only records summary sync history and cannot safely represent enabled controls, leases, backoff, cursor integrity, skipped owner/non-owner counts, or next retry | Encoding lifecycle state into `settings` or process memory would violate per-workspace scope, stale recovery, and rollback-safe disablement |

## Phase 0 Research Decisions

See `research.md`.

## Phase 1 Design Decisions

See `data-model.md`, `contracts/github-sync-lifecycle-api.md`, and `quickstart.md`.

## Evidence Map

- Manual sync route: `src/app/api/github/sync/route.ts:21` defines GET status; `src/app/api/github/sync/route.ts:62` defines POST manual trigger; `src/app/api/github/sync/route.ts:96` and `src/app/api/github/sync/route.ts:113` call `pullFromGitHub` directly.
- Existing status response: `src/app/api/github/sync/route.ts:35` aggregates `github_syncs`; `src/app/api/github/sync/route.ts:51` currently returns only singleton poller status.
- Existing poller seam: `src/lib/github-sync-poller.ts:16` starts a lazy singleton interval; `src/lib/github-sync-poller.ts:45` runs one tick; `src/lib/github-sync-poller.ts:188` exposes test-only tick execution.
- Scheduler seam: `src/lib/scheduler.ts:18` defines scheduled task state; `src/lib/scheduler.ts:278` initializes the scheduler; `src/lib/scheduler.ts:401` starts the scheduler loop; `src/lib/scheduler.ts:417` executes due tasks; `src/app/api/scheduler/route.ts:8` exposes scheduler status to admins.
- GitHub sync service: `src/lib/github-sync-engine.ts:656` defines `pullFromGitHub`; `src/lib/github-sync-engine.ts:686` uses latest `github_syncs.last_synced_at` as cursor; `src/lib/github-sync-engine.ts:700` fetches issues; `src/lib/github-sync-engine.ts:950` records successful sync history.
- Owner filtering: `src/lib/github-sync-poller.ts:129` prepares owner filter; `src/lib/github-sync-poller.ts:156` applies the `FEATURE_AREA_LABEL_ROUTING` owner branch; `src/lib/__tests__/spec006-poller.test.ts:159` verifies owner-only shared repo polling.
- UI surface: `src/components/panels/github-sync-panel.tsx:51` defines the GitHub Sync panel; `src/components/panels/github-sync-panel.tsx:254` calls manual project sync; `src/components/panels/github-sync-panel.tsx:466` renders two-way sync controls; `src/components/panels/github-sync-panel.tsx:594` renders sync history.
- Migrations: `src/lib/migrations.ts:3387` is current final live migration M76; SPEC-013A1 selects M77.
- Feature flags: `src/lib/feature-flags.ts:3` defines known keys; `src/lib/feature-flags.ts:76` lists registry keys; `src/lib/feature-flags.ts:475` evaluates flags; `src/lib/feature-flags.ts:516` exports `resolveFlag`.

## Migration Plan

- **Migration number**: M77, `077_github_sync_lifecycle`.
- **Forward schema**:
  - `github_sync_lifecycle_controls`: one row per `(workspace_id, github_repo)` control scope with enablement, interval/bounds, owner project, lease fields, cursor summary, backoff, last error, disabled reason, next retry, aggregate counters, skipped owner/non-owner counts, and latest partial reason.
  - `github_sync_lifecycle_runs`: one row per manual/automatic lifecycle attempt keyed by `run_id`, linked to the compatibility `github_syncs.id` when a `github_syncs` row exists; stores trigger, scope, result, failure/partial reason, cursor before/after, cursor effect, bounds consumed, lease owner, stale recovery reference, and timing.
- **Indexes**:
  - `idx_github_sync_lifecycle_controls_due` on `(enabled, next_retry_at, workspace_id)`.
  - `idx_github_sync_lifecycle_controls_scope` unique on `(workspace_id, github_repo)`.
  - `idx_github_sync_lifecycle_controls_lease` on `(lease_expires_at)` where `lease_run_id IS NOT NULL`.
  - `idx_github_sync_lifecycle_runs_scope_started` on `(workspace_id, github_repo, started_at DESC)`.
  - `idx_github_sync_lifecycle_runs_sync_id` on `(sync_id)` where `sync_id IS NOT NULL`.
  - `idx_github_sync_lifecycle_runs_result` on `(workspace_id, result, completed_at DESC)`.
- **Rollback SQL**: `docs/migrations/rollback-M77.sql` drops the lifecycle indexes/tables and deletes schema marker `077_github_sync_lifecycle`; existing `github_syncs` history remains readable.
- **Idempotence tests**: Add migration test that runs M77 twice, asserts both tables and indexes exist once, verifies unique `(workspace_id, github_repo)`, verifies stale lease index exists, applies rollback to a migrated DB, and re-runs migrations.

## API Contracts

- `GET /api/github/sync`: preserve existing `{ syncs, poller }` fields and add `github_sync_lifecycle` with version `github_sync_lifecycle.v1`.
- `POST /api/github/sync`: preserve current body contract `{ action: 'trigger', project_id }` and `{ action: 'trigger-all' }`; wrap manual attempts in lifecycle overlap control but keep successful response shape `{ ok, pulled, pushed }` unless rejected with deterministic 409 overlap details.
- `PATCH /api/github/sync/control`: new operator-only endpoint for Product Line/workspace-scoped enable/disable, bounded interval/bounds update, and idempotent backoff reset. Requires `operator` role, explicit workspace scope, `FEATURE_GITHUB_SYNC_AUTOMATION` flag ON for enabling, and never mutates feature-flag registry state.

## Verification Plan

- Focused unit/API:
  - `pnpm test -- src/lib/__tests__/github-sync-lifecycle.test.ts`
  - `pnpm test -- src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts`
  - `pnpm test -- src/app/api/github/sync/__tests__/route.test.ts`
  - `pnpm test -- src/app/api/github/sync/control/__tests__/route.test.ts`
- Focused UI/e2e:
  - `pnpm test:e2e -- tests/e2e/spec-013a1-github-sync-automation.spec.ts`
- Full gates:
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:e2e`

## Archive And Evidence Policy

- Archive Sweep is a startup behavior for autopilot, not executed by this Plan phase. Current target `specs/013a1-github-sync-automation/` is excluded from same-run archival.
- Unsafe branches or dirty worktrees must dry-run or stop before cleanup; SPEC-013A1 does not perform cleanup in implementation.
- UI screenshots from Playwright are CI/Argos artifacts by default. No committed binary screenshots unless an explicit manifest-backed exception is added.

## Out Of Scope

- Task claim authority, task dispatch, task launch, Issue Remediation execution, sandbox lifecycle, harness adapter behavior, auto-merge, and automatic triage.
- Generic scheduler/admin settings UI for GitHub sync automation.
- Production feature flag mutation through `PATCH /api/github/sync/control`.
- Rewriting existing GitHub issue import preview behavior.
