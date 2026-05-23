# Implementation Plan: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

**Branch**: `013a1-github-sync-automation` | **Date**: 2026-05-23 | **Spec**: `specs/013a1-github-sync-automation/spec.md`
**Input**: Feature specification from `specs/013a1-github-sync-automation/spec.md`

## Summary

Add default-off, Product Line/workspace-scoped GitHub issue sync automation as a scheduler-owned lifecycle task with durable controls, database-backed overlap leases, bounded pagination/tick duration, failure/backoff visibility, owner-aware shared-repository selection, and rollback-safe disablement. Existing manual `POST /api/github/sync` remains an independent operator fallback; automatic lifecycle control moves to `PATCH /api/github/sync/control`, and lifecycle status is exposed through a versioned `github_sync_lifecycle.v1` envelope on `GET /api/github/sync` plus the existing GitHub Sync panel. The panel UI work must add a distinct automatic polling lifecycle section while preserving existing manual sync controls as a separate fallback path.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand where the existing GitHub Sync panel needs app state, Tailwind CSS 3, `better-sqlite3`, existing GitHub helper modules, Vitest, Playwright, ESLint, pnpm
**Storage**: SQLite through `better-sqlite3`; additive M77 lifecycle tables through `src/lib/migrations.ts`; existing `github_syncs` remains the compatibility sync-history table
**Testing**: Vitest unit/API tests, migration idempotence tests, Playwright real-app journey for the GitHub Sync panel, and existing `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` gates
**Target Platform**: Next.js web application with local SQLite runtime and operator-managed background scheduler
**Project Type**: Web application with API, scheduler/runtime, database migration, and focused UI changes
**Performance Goals**: Scheduler wakes every 60 seconds; each automatic tick processes bounded scopes only, with per-scope defaults of max 10 GitHub pages, 1,000 issues, or 45 seconds; no same-scope duplicate ingestion under concurrent manual/automatic attempts
**Constraints**: `FEATURE_GITHUB_SYNC_AUTOMATION` hard-defaults OFF through `resolveFlag`; manual sync must work when the flag/control is off; scheduler startup may register the automation task only in runtime contexts, but each tick must re-check flag/control eligibility before acquiring work; shutdown or disablement stops future automatic ticks while durable leases, expiry, and stale recovery handle in-flight or ungraceful-exit cases; no task claim, dispatch, launch, remediation execution, sandbox lifecycle, harness adapter, auto-merge, or automatic triage authority; cursor advancement is success-only
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
- **X. Observability and Auditability**: PASS planned. Every automatic/manual/overlap/skipped/stale-recovered attempt writes M77 lifecycle run detail, lifecycle control summary updates, operator-visible activity evidence, and GitHub Sync API/UI status; attempts that reach the existing sync engine also preserve `github_syncs` compatibility history. Health summaries are derived from local lifecycle state and existing diagnostics/health patterns, with no new telemetry service or secret-bearing telemetry sink.
- **XIII. Defensive Boundaries**: PASS planned. GitHub fetch/rate-limit/permission/malformed-data errors are classified before lifecycle state is updated. Existing `pullFromGitHub` records a failed `github_syncs` row on fetch failure (`src/lib/github-sync-engine.ts:700`, `src/lib/github-sync-engine.ts:708`); lifecycle automation must preserve that boundary while adding cursor/backoff semantics.
- **XIV. Real UI Journey Quality Gate**: PASS planned. UI changes are in the existing GitHub Sync panel (`src/components/panels/github-sync-panel.tsx:51`, `src/components/panels/github-sync-panel.tsx:466`) and require real Playwright coverage against the running app with screenshots as CI artifacts.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS planned. Archive Sweep is not executed in this phase, but the plan records current-target exclusion and no committed screenshot binaries unless manifest-backed.
- **XVI. Reviewability And Verification Debt Control**: WARNING ACCEPTED. The spec exceeds nominal budget due to one safety boundary spanning lifecycle, leases, cursor integrity, API, and UI. Split exception is ratified in the clarified spec; deferred surfaces remain SPEC-013B+ for claim/reconciliation and SPEC-014+ for harness/sandbox execution.

**Post-Design Re-check**: PASS with the same warning. Design keeps automatic polling inside scheduler/runtime and uses narrow API/UI/schema changes necessary for operator control and verification.

## UX Design Constraints

- GitHub Sync panel lifecycle UX MUST map `github_sync_lifecycle.v1` fields into operator-readable cards or rows per visible scope. Required visible summaries include automatic control state, active run, last run, last completed/success timestamps, last success cursor, last error, next eligible/retry time, backoff reason/source/cap/fallback state, skipped owner/non-owner diagnostics, and health severity/reason.
- Manual `Sync` and `Sync All` controls MUST remain discoverable as manual fallback actions and MUST be visually or semantically separated from automatic polling controls. UI labels MUST avoid treating `POST /api/github/sync` as the automatic lifecycle control endpoint.
- UI copy MUST translate lifecycle result codes into concise operator-readable labels for disabled, running, success, failed/backoff, partial bounded stop, skipped overlap, rejected overlap, skipped owner, skipped non-owner, ownership unresolved, and stale recovered states.
- GitHub Sync lifecycle labels MUST describe GitHub issue polling, cursor, backoff, ownership, skipped diagnostics, health, and manual fallback only; labels MUST NOT imply task claim, task dispatch, remediation execution, harness lifecycle, sandbox lifecycle, auto-merge, or automatic triage.
- Status updates for success, waiting/running state, progress, errors, backoff, overlap, skipped ownership, disablement, and recovery MUST follow the existing app accessibility pattern for programmatically determinable status text or live status regions when updates occur without a page-level context change.
- Reuse existing Mission Control UI conventions: compact panels, tables or rows, inline colored status dots or badges, text labels, existing `Button` variants/sizes, and inline SVG or text glyphs. Do not add a new icon dependency for this feature unless a later implementation artifact separately justifies the supply-chain surface.

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
- Scheduler seam: `src/lib/scheduler.ts:18` defines scheduled task state; `src/lib/scheduler.ts:278` initializes the scheduler; `src/lib/scheduler.ts:401` starts the scheduler loop; `src/lib/scheduler.ts:417` executes due tasks; `src/lib/scheduler.ts:530` stops future scheduler ticks by clearing the interval; `src/app/api/scheduler/route.ts:8` exposes scheduler status to admins.
- Runtime startup/shutdown precedent: `src/lib/db.ts:74` starts the built-in scheduler only outside build/test modes, and `src/lib/db/connection-pool.ts:112` provides idempotent production shutdown cleanup for SQLite connections. SPEC-013A1 follows this pattern by keeping automatic GitHub sync startup runtime-only, making shutdown stop future ticks, and relying on M77 lease expiry/stale recovery rather than process memory for interrupted runs.
- GitHub sync service: `src/lib/github-sync-engine.ts:656` defines `pullFromGitHub`; `src/lib/github-sync-engine.ts:686` uses latest `github_syncs.last_synced_at` as cursor; `src/lib/github-sync-engine.ts:700` fetches issues; `src/lib/github-sync-engine.ts:950` records successful sync history.
- Owner filtering: `src/lib/github-sync-poller.ts:129` prepares owner filter; `src/lib/github-sync-poller.ts:156` applies the `FEATURE_AREA_LABEL_ROUTING` owner branch; `src/lib/__tests__/spec006-poller.test.ts:159` verifies owner-only shared repo polling.
- UI surface: `src/components/panels/github-sync-panel.tsx:51` defines the GitHub Sync panel; `src/components/panels/github-sync-panel.tsx:254` calls manual project sync; `src/components/panels/github-sync-panel.tsx:466` renders two-way sync controls; `src/components/panels/github-sync-panel.tsx:594` renders sync history.
- Migrations: `src/lib/migrations.ts:3387` is current final live migration M76; SPEC-013A1 selects M77.
- Feature flags: `src/lib/feature-flags.ts:3` defines known keys; `src/lib/feature-flags.ts:76` lists registry keys; `src/lib/feature-flags.ts:475` evaluates flags; `src/lib/feature-flags.ts:516` exports `resolveFlag`.
- Activity and health precedent: `src/lib/db.ts` `db_helpers.logActivity` writes and broadcasts workspace-scoped activity rows; `src/app/api/activities/route.ts` exposes the operator activity feed; `src/app/api/governance/system-health/route.ts` and `src/app/api/governance/diagnostic/route.ts` show the existing local health/diagnostic summary pattern to reuse for GitHub sync lifecycle evidence.
- Secret-safety precedent: `src/lib/github-sync-engine.ts` sanitizes GitHub/PAT/auth/email/opaque-token errors before surfacing them, `src/lib/secret-scanner.ts` provides general secret scanning/redaction helpers, and `src/lib/github.ts` is the boundary where raw GitHub response text can enter the app and therefore must be sanitized before lifecycle persistence or exposure.

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

- `GET /api/github/sync`: preserve existing `{ syncs, poller }` fields and add `github_sync_lifecycle` with version `github_sync_lifecycle.v1`; lifecycle scopes use the same workspace-scope filtering and invalid/conflicting scope error behavior as the current route.
- `POST /api/github/sync`: preserve current body contract `{ action: 'trigger', project_id }` and `{ action: 'trigger-all' }`; wrap manual attempts in lifecycle overlap control, keep successful response shapes unchanged, return deterministic 409 `github_sync_overlap` details for same-scope `trigger` conflicts, and make `trigger-all` reject with a deterministic `conflicts` array if any requested scope is already leased.
- `PATCH /api/github/sync/control`: new operator-only endpoint for Product Line/workspace-scoped enable/disable, bounded interval/bounds update, and idempotent backoff reset. Requires `operator` role, explicit workspace scope, `FEATURE_GITHUB_SYNC_AUTOMATION` flag ON for enabling, and never mutates feature-flag registry state. Disablement is non-blocking and rollback-safe: it returns 200 after disabling future automatic ticks and may include active-run details for any already-owned run.

## Observability Design

- Activity events: Lifecycle control and run helpers MUST emit workspace-scoped activity rows for `github_sync_automation_enabled`, `github_sync_automation_disabled`, `github_sync_run_started`, `github_sync_run_succeeded`, `github_sync_run_failed`, `github_sync_backoff_scheduled`, `github_sync_backoff_reset`, `github_sync_partial_bounded_stop`, `github_sync_skipped_overlap`, `github_sync_rejected_overlap`, `github_sync_skipped_owner`, `github_sync_skipped_non_owner`, `github_sync_ownership_unresolved`, `github_sync_stale_recovered`, `github_sync_manual_fallback_completed`, and `github_sync_manual_fallback_failed`.
- Minimal activity payload: include only the safe allowlist fields `workspace_id`, `github_repo`, `run_id`, `trigger`, `result`, `project_id`, `owner_project_id`, `cursor_advanced`, `failure_category`, `partial_run_reason`, `backoff_seconds`, `next_retry_at`, `retry_after_seconds`, and `lease_expires_at` when applicable. Payloads MUST use sanitized categories/messages and MUST NOT include tokens, authorization headers, raw GitHub response bodies, credentials, API keys, or matched secret substrings.
- Diagnostics allowlist: lifecycle diagnostics may include status code class, GitHub request id when present, endpoint category, rate-limit counters, retry count, redacted error class, timestamp, and internal correlation ids. Raw request/response headers and bodies are excluded by default unless a future artifact explicitly allowlists and redacts a specific field.
- GitHub boundary failure taxonomy: Lifecycle helpers MUST normalize GitHub/API boundary failures into stable categories: `transport_timeout`, `transport_network`, `github_rate_limited`, `github_auth_or_scope`, `github_not_found`, `github_http_4xx`, `github_http_5xx`, `github_malformed_json`, `github_unexpected_shape`, `github_issue_schema_invalid`, `database_error`, and `unknown`. Current `src/lib/github.ts` collapses non-OK responses into unstructured `Error('GitHub API error <status>: <body>')` and `fetchIssues()` casts JSON to `any[]`; SPEC-013A1 lifecycle state must classify and sanitize these failures before persistence or API exposure.
- Malformed page handling: Issue pages MUST be validated page-atomically before issue mutations for that page. A malformed JSON response, non-array response, unexpected page body, or invalid issue schema records sanitized diagnostics and preserves the success cursor. If prior pages in the same run are proven safe resume boundaries, the terminal result may be `partial` with `partial_run_reason='malformed_page'`; otherwise it is `failed`.
- GitHub retry signal precedence: Backoff scheduling MUST prefer a valid `Retry-After` value, then a valid future `X-RateLimit-Reset` value, then bounded exponential backoff. Invalid, past, or unparsable retry headers MUST be ignored safely and recorded as sanitized retry diagnostics. All retry times are capped by the workspace maximum and expose signal source plus cap/fallback state.
- Health summary: `github_sync_lifecycle.v1` diagnostics MUST include a scoped health summary derived from M77 lifecycle control/run state. Severity values are `disabled`, `green`, `amber`, and `red`: `disabled` when the feature flag or control is off; `green` when the latest terminal state is successful and no stale lease/backoff is active; `amber` for active backoff, partial runs, overlap/skipped ownership increases, or transient failure; `red` for stale leases, repeated failures, ownership unresolved, or schema unavailable.
- Owner-facing evidence chain: success, failure, backoff, partial, skipped owner/non-owner, overlap, manual fallback, disablement, and stale recovery MUST be reviewable through lifecycle runs, lifecycle controls, activity rows, the GitHub Sync API/UI, and `github_syncs` rows whenever the existing sync engine is reached.
- GitHub Sync panel lifecycle UX: The panel MUST map lifecycle envelope state into operator-readable status and control summaries, keep manual fallback controls separate from automatic lifecycle controls, expose conflict/overlap active-run context and retry guidance, and provide accessible status updates for dynamic lifecycle messages.
- Skipped owner, skipped non-owner, and ownership-unresolved transitions MUST write lifecycle run detail, lifecycle control summary or counter updates, and activity evidence even when no GitHub pull occurs and no compatibility `github_syncs` row is created.
- No new telemetry service: Observability remains local to SQLite-backed lifecycle state, compatibility sync history, activity rows, and existing Mission Control diagnostics/UI surfaces.

## Verification Plan

- Focused unit/API:
  - `pnpm test -- src/lib/__tests__/github-sync-lifecycle.test.ts`
  - `pnpm test -- src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts`
  - `pnpm test -- src/app/api/github/sync/__tests__/route.test.ts`
  - `pnpm test -- src/app/api/github/sync/control/__tests__/route.test.ts`
- Focused scheduler/runtime:
  - Cover runtime-only scheduler registration, flag/control re-check before automatic tick acquisition, graceful shutdown stopping future ticks, disablement while a run is active, and stale lease recovery after simulated process interruption.
  - Cover GitHub boundary classification for timeout/abort, DNS/TLS/network failure, HTTP 5xx, HTTP 4xx permission or not-found, rate limit, malformed JSON, non-array issue page, invalid issue schema, and unknown errors.
  - Cover malformed later-page behavior: earlier validated pages do not justify advancing the last success cursor unless a safe resume boundary is proven; malformed current pages produce either `partial` with `malformed_page` or `failed`.
  - Cover retry signal precedence and caps for valid `Retry-After`, valid `X-RateLimit-Reset`, invalid or past headers, fallback exponential backoff, and cap visibility.
- Focused observability:
  - Assert every terminal, skipped, overlap, stale-recovered, enable/disable, backoff scheduled/reset, and manual fallback state writes the expected lifecycle row, lifecycle control update, activity row, and GET envelope evidence.
  - Assert lifecycle diagnostics include flag reason, scheduler registration, schema availability, lease age/expiry, last result, cursor effect, backoff, ownership decision, skipped counts, manual fallback availability, and health severity.
  - Assert token-shaped samples, `Authorization` header samples, raw GitHub response body samples, API-key-shaped samples, and credential-like samples do not appear in API JSON, activity payloads, lifecycle diagnostics, or health summaries, and assert diagnostics reject or drop non-allowlisted fields by default.
- Focused UI/e2e:
  - `pnpm test:e2e -- tests/e2e/spec-013a1-github-sync-automation.spec.ts`
  - Cover GitHub Sync panel presentation for enabled, disabled, running, success, failure, backoff, partial, overlap, skipped owner/non-owner, stale recovery, manual fallback, health severity, and sanitized failure text.
  - Assert the GitHub Sync panel renders a distinct automatic polling lifecycle section separate from manual sync fallback controls.
  - Assert automatic controls cover enable, disable, interval/bounds display or edit affordance, reset backoff, and flag/control-disabled states.
  - Assert manual `Sync` and `Sync All` remain discoverable and are not labeled as automatic lifecycle controls.
  - Assert panel copy renders operator-readable labels for disabled, running, success, failed/backoff, partial bounded stop, skipped overlap, rejected overlap, skipped owner, skipped non-owner, ownership unresolved, and stale recovered states.
  - Assert lifecycle status displays active run, last run, last completed/success, last success cursor, last error, next eligible/retry, backoff reason/source/cap/fallback, skipped diagnostics, and health severity/reason.
  - Assert dynamic lifecycle status updates are programmatically determinable for assistive technologies when the update does not move focus or change page context.
  - Assert UI copy does not contain claim, dispatch, remediation, harness, sandbox, auto-merge, or triage language for SPEC-013A1 lifecycle behavior.
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
