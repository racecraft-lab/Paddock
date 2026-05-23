# Research: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

## Decision: scheduler-owned bounded task replaces singleton product contract

**Decision**: Register `github_sync_automation` in `src/lib/scheduler.ts` and route automatic polling through scheduler-owned ticks. Keep `src/lib/github-sync-poller.ts` as the GitHub sync tick module, but remove the product reliance on its lazy process-wide singleton interval.

**Rationale**: Current poller status is process-local (`intervalHandle`, `lastRun`) and `startSyncPoller()` creates a singleton interval (`src/lib/github-sync-poller.ts:13`, `src/lib/github-sync-poller.ts:16`). The scheduler already owns bounded periodic tasks with per-task running/last/next state (`src/lib/scheduler.ts:18`, `src/lib/scheduler.ts:417`). Scheduler ownership satisfies the spec while DB leases prevent same-scope overlap.

**Alternatives considered**:
- External cron: rejected because the product contract must not require external cron.
- Keep singleton interval as the product lifecycle: rejected because it cannot represent independent Product Line/workspace ownership or durable stale recovery.

## Decision: M77 lifecycle tables, with `github_syncs` retained as compatibility history

**Decision**: Add M77 `github_sync_lifecycle_controls` and `github_sync_lifecycle_runs`. Continue inserting `github_syncs` rows as the compatibility history record; link lifecycle run details to `github_syncs.id` when available.

**Rationale**: Existing `github_syncs` is read by GET status aggregation (`src/app/api/github/sync/route.ts:35`) and written by `pullFromGitHub` for both failures and successes (`src/lib/github-sync-engine.ts:708`, `src/lib/github-sync-engine.ts:950`). It lacks durable controls, leases, backoff, skipped owner/non-owner counters, partial-run reason, and cursor effect. A narrow detail table avoids destabilizing existing history consumers while preserving `github_syncs` as the public summary history.

**Alternatives considered**:
- Store lifecycle in `settings`: rejected because it is not scoped by `(workspace_id, github_repo)` and cannot model leases or run detail cleanly.
- Add all lifecycle fields directly to `github_syncs`: rejected as a wider compatibility change than necessary.

## Decision: success-only cursor owned by lifecycle control

**Decision**: Use `github_sync_lifecycle_controls.last_success_cursor` as the automatic polling cursor. Failed and skipped attempts preserve the prior value. Partial bounded runs write run detail and partial reason but do not advance the success cursor unless implementation proves the bound stopped at a safe page boundary with durable resume semantics.

**Rationale**: Current sync derives `since` from the latest `github_syncs.last_synced_at` row (`src/lib/github-sync-engine.ts:686`), which can be polluted by failed or partial attempts. The spec requires failed attempts not to advance the last success cursor.

**Alternatives considered**:
- Continue using latest `github_syncs.last_synced_at`: rejected because `pullFromGitHub` writes error rows with `last_synced_at=now`.
- Add cursor to each project row: rejected because ownership and overlap are repository-scope, not only project-scope.

## Decision: database-backed scoped leases

**Decision**: Acquire one lease per `(workspace_id, github_repo)` by updating `github_sync_lifecycle_controls` with `lease_run_id`, `lease_owner`, `lease_started_at`, and `lease_expires_at` in a transaction. Expired leases are recovered by a later run with a stale-recovery run record before replacement.

**Rationale**: Manual and automatic sync can currently call `pullFromGitHub` independently (`src/app/api/github/sync/route.ts:96`, `src/lib/github-sync-poller.ts:169`). Process memory cannot serialize across route calls and scheduler ticks reliably.

**Alternatives considered**:
- In-memory mutex: rejected because it fails across request/scheduler boundaries and process restarts.
- SQLite global lock table: rejected because non-overlapping scopes must sync independently.

## Decision: preserve SPEC-006 owner semantics without requiring area-label behavior

**Decision**: Candidate selection groups by `(workspace_id, github_repo)`. If one enabled project exists, it may poll. If multiple enabled projects exist and exactly one `is_repo_sync_owner=1`, only that owner polls. If no single owner is resolvable, the run records `ownership_unresolved` and does not fall back to duplicate polling. `FEATURE_AREA_LABEL_ROUTING` remains limited to area-label parsing/emission/backfill.

**Rationale**: Current poller owner filter is tied to `FEATURE_AREA_LABEL_ROUTING` (`src/lib/github-sync-poller.ts:152`, `src/lib/github-sync-poller.ts:156`), but SPEC-013A1 requires duplicate prevention without requiring area-label routing behavior.

**Alternatives considered**:
- Reuse current flag-on owner branch only: rejected because automatic polling must not require `FEATURE_AREA_LABEL_ROUTING`.
- Poll every enabled project: rejected because shared repositories can ingest duplicates.

## Decision: existing GitHub Sync API/UI is the operator surface

**Decision**: Enrich `GET /api/github/sync`, preserve `POST /api/github/sync`, add `PATCH /api/github/sync/control`, and render controls/status in `src/components/panels/github-sync-panel.tsx`.

**Rationale**: The current panel already renders project sync controls and history (`src/components/panels/github-sync-panel.tsx:466`, `src/components/panels/github-sync-panel.tsx:594`) and route auth already requires `operator` for sync status and manual trigger (`src/app/api/github/sync/route.ts:25`, `src/app/api/github/sync/route.ts:67`).

**Alternatives considered**:
- Generic scheduler panel: rejected by the spec and would hide GitHub-specific cursor/owner/backoff state.
- Feature flag admin surface: rejected because production flag mutation is not owned by lifecycle control.

## Decision: no new runtime dependency

**Decision**: Use existing TypeScript, SQLite, Next.js route handlers, and native timers/fetch behavior. No new runtime dependency is planned.

**Rationale**: Existing code already provides scheduler, feature flags, GitHub API helpers, SQLite migrations, and test frameworks. Adding a queue/cron/lock dependency would expand supply-chain surface without solving a requirement that SQLite transactions cannot solve.

**Alternatives considered**:
- Cron/queue dependency: rejected as unnecessary and counter to the scheduler-owned product contract.
