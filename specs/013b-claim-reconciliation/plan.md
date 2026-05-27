# Implementation Plan: SPEC-013B - Claim and Reconciliation Authority

**Branch**: `013b-claim-reconciliation` | **Date**: 2026-05-27 | **Spec**: `specs/013b-claim-reconciliation/spec.md`
**Input**: Feature specification from `specs/013b-claim-reconciliation/spec.md`

## Summary

SPEC-013B adds a default-off, database-backed claim/reconciliation authority around the existing assigned-task dispatch loop so concurrent scheduler ticks cannot launch the same GitHub issue-linked task stage twice. The implementation adds additive M78 `task_stage_claims` persistence, reuses SPEC-013A `task_stage_attempts` only as passive evidence, evaluates GitHub truth freshness and resource governance before active claim acquisition, records structured activities for every outcome including fail-closed boundary deferrals, and exposes a task-scoped read-only evidence model without adding runner, sandbox, retry, manual release, auto-merge, or successor-selection behavior.

## Technical Context

**Language/Version**: TypeScript 5.7 strict for new SPEC-013B modules on Node.js >=22.
**Primary Dependencies**: Next.js 16 App Router, React 19, `better-sqlite3`, existing Zustand/Tailwind/Vitest stack, existing `resourcePolicyEvaluator`, existing GitHub sync lifecycle helpers, existing task-stage attempt helpers. No new runtime dependency.
**Storage**: SQLite through `better-sqlite3`; additive forward migration `078_task_stage_claims`; manual rollback at `docs/migrations/rollback-M78.sql`.
**Testing**: Vitest for migration idempotency, claim helper concurrency/deferral/release paths, dispatch integration, and read-only API route; Playwright only if implementation later changes a user-facing UI journey. Full `pnpm test:all` gate before PR packaging.
**Target Platform**: Next.js server runtime and scheduler in Mission Control deployments.
**Project Type**: Web application with server-side scheduler, SQLite persistence, REST API, and local operator evidence.
**Performance Goals**: Claim/reconciliation transaction remains bounded to local SQLite reads/writes only, no live GitHub fetches, and no expansion of the current `dispatchAssignedTasks` batch size of 3 tasks per tick. Resource governance preserves its synchronous evaluator envelope (`p50<5ms / p95<15ms / p99<25ms`) as documented in `src/lib/resource-evaluator.ts`.
**Constraints**: `FEATURE_TASK_CONTROL_PLANE` resolves only through `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)`; flag off preserves legacy dispatch side effects; active claim TTL defaults to 300 seconds and is capped at 600 seconds; `task_stage_attempts.status` is never used as the active lock; the claim module never imports or calls `advanceTaskChain` or `createTask`; claim evidence is positive-allowlisted and redacts/rejects secret-shaped values; claim/release boundary errors fail closed for one task and do not crash the scheduler tick or bypass governance.
**Scale/Scope**: One active claim per `(workspace_id, task_id, stage_key)` at a time, limited to assigned tasks with assignee, canonical `owner/repo` GitHub repo, positive issue number, and same-workspace sync-enabled repo owner. Concurrent scheduler replay must admit exactly one launch path and record duplicate-prevention evidence for losers.
**Reviewability Budget**: Primary surface: scheduler/runtime claim authority. Secondary surfaces: additive migration and read-only task API evidence. Projected reviewable LOC: about 650. Production files: 5. Total files: about 14. Budget result: warning for >400 LOC, below block thresholds; no split because migration, helper, dispatch hook, and read model form one duplicate-launch safety boundary.
**Strict Scope**: Add the isolated SPEC-013B claim module and pure helper tests to `tsconfig.spec-strict.json`: `src/lib/task-claim-reconciliation.ts`, `src/lib/__tests__/migrations-M78-task-stage-claims.test.ts`, `src/lib/__tests__/task-claim-reconciliation-fixtures.ts`, and `src/lib/__tests__/task-claim-reconciliation.test.ts`. Add all SPEC-013B TS files to `eslint.config.mjs`. The read-only route and dispatch integration tests remain covered by the main `pnpm typecheck`, `pnpm lint`, focused Vitest, `pnpm build`, and `pnpm test:all` gates because importing them into the stricter declaration-only project pulls the existing auth/db/scheduler/GitHub runtime graph outside SPEC-013B's narrow ownership.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | Pass | Feature is default-off behind `FEATURE_TASK_CONTROL_PLANE`; flag-off dispatch retains the existing status, activity, message, and no-claim behavior. |
| II. Install Compatibility And Operational Impact Discipline | Pass | M78 is additive and install-compatible; no destructive migration, no renamed compatibility columns, and no startup assumption changes. |
| IV. Test-First Development | Pass | Tasks must write failing Vitest coverage before migration/helper/dispatch/API implementation. |
| V. Feature-Flag Resolution Discipline | Pass | Runtime behavior uses only `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)` and adds no inline env checks. |
| VI. Dependency Supply-Chain Hygiene | Pass | No new runtime dependency. |
| VII. Additive Migration Policy | Pass | M78 creates one new table and indexes, records `schema_migrations`, has idempotent migration tests, and includes `docs/migrations/rollback-M78.sql`. |
| VIII. Successor Side-Effect Parity | Pass | Claim helper is forbidden from calling `advanceTaskChain` or `createTask`; successor selection stays in `advanceTaskChain`. |
| X. Observability and Auditability | Pass | Every acquire, duplicate-prevented, release, stale recovery, governance deferral, terminal reconciliation, stale-truth deferral, boundary deferral, and not-claimable intake exclusion writes structured activity evidence and attempt lifecycle evidence when an attempt exists. |
| XI/XII. Simplicity and No Speculative Generality | Pass | One narrow helper owns claim/reconciliation; scheduler stays thin; no runner, harness, retry UI, manual release, sandbox, or primary dashboard controls. |
| XIII. Defensive Boundaries | Pass | GitHub truth uses persisted local state and SPEC-013A1 lifecycle health; unsafe payload fields and secret-shaped values are rejected/redacted before persistence or exposure; claim/release boundary errors classify to safe outcomes instead of failing open. |
| XIV. Real UI Journey Quality Gate | N/A | This plan adds a read-only API/debug evidence route only. If implementation later touches UI, real Playwright journeys and screenshot evidence become mandatory. |
| XV. Spec Artifact Provenance And Archive Sweep | Pass | Plan documents archive sweep startup behavior and current-target exclusion; generated screenshots are absent unless a manifest-backed exception is added. |
| XVI. Reviewability And Verification Debt Control | Pass with warning | Projected LOC exceeds the warning threshold but remains under block thresholds and one primary surface is declared. |

Post-design re-check: Pass. Phase 1 keeps the same single primary surface, adds no dependency, and preserves all non-goals.

## Required Live Evidence

- Current assigned-task launch boundary: `src/lib/task-dispatch.ts:2292-2342` selects `assigned` tasks, immediately updates them to `in_progress`, emits `task.status_changed`, and writes `task_dispatched` before launch; `src/lib/task-dispatch.ts:2366-2424` performs the current launch handoff; `src/lib/task-dispatch.ts:2462-2549` records completion/failure and retry side effects.
- Current scheduled invocation: `src/lib/scheduler.ts:366-373` registers `task_dispatch`; `src/lib/scheduler.ts:427-472` runs due scheduler tasks and calls `dispatchAssignedTasks`; `src/lib/scheduler.ts:534-548` exposes manual trigger behavior.
- Attempt spine behavior: `src/lib/task-stage-attempts.ts:3-23` defines passive lifecycle statuses; `src/lib/task-stage-attempts.ts:206-304` creates attempts and appends lifecycle events; `src/lib/task-stage-attempts.ts:531-610` writes events and updates projection; migration `076_task_stage_attempts` creates attempt/event tables and indexes in `src/lib/migrations.ts:3387-3455`.
- SPEC-013A1 GitHub sync lifecycle state: migration `077_github_sync_lifecycle` creates lifecycle controls/runs with lease, interval, and health state in `src/lib/migrations.ts:3459-3582`; `src/lib/github-sync-lifecycle.ts:620-744` exposes local lifecycle status for a `(workspace_id, github_repo)` scope; `src/lib/github-sync-lifecycle.ts:769-790` classifies disabled, stale lease, repeated failure, ownership, and backoff health.
- Resource governance boundary: `src/lib/resource-evaluator.ts:1-33` documents the synchronous admission evaluator and decision contract; `src/lib/resource-evaluator.ts:264-283` returns byte-compatible allow when governance is off; `src/lib/resource-decision-writer.ts:41-58` defines persisted decision evidence; `src/lib/resource-decision-writer.ts:142-185` writes `resource_policy_events` and audit rows.
- Existing dispatch-side governance evidence: `src/lib/task-dispatch.ts:853-884` currently gates SPEC-009C3 ready-for-owner evidence using stored governance artifacts. SPEC-013B adds pre-claim dispatch governance using the evaluator rather than replacing that successor-readiness logic.
- OpenAI Harness Engineering boundary context fetched 2026-05-27: OpenAI describes agent-first autonomy as depending on repository scaffolding, validation, review, recovery, and controlled escalation, and warns that such behavior should not be assumed without similar investment: https://openai.com/index/harness-engineering/.
- OpenAI Symphony announcement boundary context fetched 2026-05-27: Symphony is described as turning a project-management board into a coding-agent control plane where each open task gets an agent and humans review results: https://openai.com/index/open-source-codex-orchestration-symphony/.
- `openai/symphony` README and SPEC boundary context fetched 2026-05-27: the repository states Symphony is an engineering preview for trusted environments and works best with harness engineering; its SPEC includes per-issue workspace dispatch, tracker reconciliation, runner integration, sandbox/hardening, Linear tooling, retry, and reference algorithms that SPEC-013B explicitly does not import: https://github.com/openai/symphony and https://github.com/openai/symphony/blob/main/SPEC.md.

## Project Structure

### Documentation (this feature)

```text
specs/013b-claim-reconciliation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── task-claim-reconciliation-api.md
│   └── task-claim-reconciliation-module.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/api/
│   ├── index/route.ts
│   └── tasks/[id]/claim-reconciliation/route.ts
├── lib/
│   ├── migrations.ts
│   ├── task-claim-reconciliation.ts
│   ├── task-dispatch.ts
│   └── __tests__/
│       ├── migrations-M78-task-stage-claims.test.ts
│       ├── task-claim-reconciliation-fixtures.ts
│       ├── task-claim-reconciliation.test.ts
│       ├── task-claim-reconciliation-route.test.ts
│       └── task-dispatch-claim-reconciliation.test.ts
docs/
└── migrations/
    ├── rollback-M78.sql
    └── rollback-procedure.md
```

**Structure Decision**: Add one narrow server-side helper module plus one read-only task API route. Keep scheduler ownership unchanged, hook the helper only inside `dispatchAssignedTasks`, and use existing `task-stage-attempts`, `github-sync-lifecycle`, and resource-governance APIs instead of adding runner or harness abstractions.

## Complexity Tracking

No constitution gate violations require justification. The reviewability warning is recorded above and remains below block thresholds.

## Phase 0: Research Summary

Research decisions are recorded in `specs/013b-claim-reconciliation/research.md`.

Key outcomes:

- Add M78 `task_stage_claims` with an active partial unique index on `(workspace_id, task_id, stage_key)` where `claim_state = 'active'` and `UNIQUE(task_stage_attempt_id)`.
- Place claim authority in `src/lib/task-claim-reconciliation.ts`; call it inside each `dispatchAssignedTasks` per-task loop before the legacy `in_progress` mutation.
- Use persisted task GitHub fields plus SPEC-013A1 lifecycle controls/status for freshness and health; do not fetch GitHub inside the active claim transaction.
- Evaluate resource governance before active claim acquisition; persist non-allow evidence without acquiring an active claim.
- Use `task_stage_attempts` and lifecycle events as evidence only, never as the lock.
- Treat OpenAI Harness Engineering and Symphony as boundary context only; no runner, sandbox, Linear, retry UI, or long-running ownership enters SPEC-013B.

## Phase 1: Design Summary

Design artifacts are recorded in:

- `specs/013b-claim-reconciliation/data-model.md`
- `specs/013b-claim-reconciliation/contracts/task-claim-reconciliation-api.md`
- `specs/013b-claim-reconciliation/contracts/task-claim-reconciliation-module.md`
- `specs/013b-claim-reconciliation/quickstart.md`

## Implementation Notes

### Migration M78

Add migration id `078_task_stage_claims` after live M77 in `src/lib/migrations.ts`. The table is rerun-safe and additive:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `workspace_id INTEGER NOT NULL`
- `task_id INTEGER NOT NULL`
- `stage_key TEXT NOT NULL CHECK(length(trim(stage_key)) > 0)`
- `task_stage_attempt_id INTEGER NOT NULL`
- `claim_run_id TEXT NOT NULL CHECK(length(trim(claim_run_id)) > 0)`
- `claim_state TEXT NOT NULL CHECK(claim_state IN ('active', 'released', 'stale_recovered'))`
- `lease_owner TEXT NOT NULL CHECK(length(trim(lease_owner)) > 0)`
- `lease_started_at INTEGER NOT NULL`
- `lease_expires_at INTEGER NOT NULL`
- `released_at INTEGER`
- `release_reason TEXT CHECK(release_reason IS NULL OR release_reason IN ('launch_handoff_completed', 'dispatch_failed', 'task_terminal_done', 'task_terminal_failed', 'github_issue_terminal', 'github_pr_terminal', 'governance_blocked', 'governance_deferred', 'attempt_terminal_reconciled', 'stale_claim_recovered', 'boundary_error_deferred'))`
- `released_by_run_id TEXT`
- `stale_recovered_from_claim_id INTEGER`
- `metadata_json TEXT`
- `created_at INTEGER NOT NULL DEFAULT (unixepoch())`
- `updated_at INTEGER NOT NULL DEFAULT (unixepoch())`

Indexes and constraints:

- `UNIQUE(task_stage_attempt_id)`
- `idx_task_stage_claims_active_unique ON task_stage_claims(workspace_id, task_id, stage_key) WHERE claim_state = 'active'` as a unique partial index.
- `release_reason` uses the closed persisted vocabulary `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, `stale_claim_recovered`, and `boundary_error_deferred`. Active rows keep `release_reason=NULL`; released rows use any value except `stale_claim_recovered`; stale-recovered rows use `stale_claim_recovered`.
- Lookup indexes for `(workspace_id, task_id, stage_key, updated_at DESC)` and active lease expiry.

Rerun and partial-unique semantics:

- M78 DDL uses `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and the existing `INSERT OR IGNORE` schema marker pattern so deleting the marker and re-running the migration is a no-op against an already-shaped database.
- SQLite partial unique indexes enforce uniqueness only for rows included by the predicate. For M78, rows where `claim_state` is `released` or `stale_recovered` are historical evidence and must not block a later `active` claim for the same `(workspace_id, task_id, stage_key)`.
- SQLite uniqueness enforcement is statement-time, not commit-deferred for this use case. Stale recovery must therefore run in one SQLite transaction that first compare-and-set updates the predecessor row from `active` to `stale_recovered` with release metadata, then inserts the replacement active claim. Inserting the replacement while the predecessor is still `active` is a duplicate-prevention outcome, not a recovery success.
- Each `task_stage_claims` row owns one unique `task_stage_attempt_id`. A stale-recovery replacement claim must create or link a distinct replacement attempt row; the stale predecessor's attempt receives recovery evidence but is not reused for the replacement claim row.

Rollback SQL drops indexes first, then `task_stage_claims`, then removes `078_task_stage_claims` from `schema_migrations`. The rollback file is manual and idempotent.

### Claim Helper

`src/lib/task-claim-reconciliation.ts` owns:

- `isTaskControlPlaneEnabled(ctx)` using `resolveFlag('FEATURE_TASK_CONTROL_PLANE', ctx)`.
- `deriveStageKey(task)` using `workflow_template_slug`, then `workflow_template_id`, then stable fallback `assigned_dispatch`.
- `validateGitHubRepositoryFullName(value)` for SPEC-013B intake and read-model diagnostics. It accepts only canonical `owner/repo` values with no scheme, host, query, fragment, `.git` suffix, whitespace, control characters, or `.`/`..` path segment.
- `classifyClaimBoundaryError(error)` for SQLite constraint races, SQLite busy/database failures, malformed claim inputs, governance evaluator failures, stale-owner release retries, and unknown claim/release exceptions.
- `reconcileAndAcquireTaskStageClaim(db, input)` for local eligibility, GitHub truth freshness, lifecycle health, governance, stale recovery, attempt creation, active claim insert, duplicate handling, boundary-error classification, and activity writes.
- `releaseTaskStageClaim(db, input)` for compare-and-set release by claim id and run id, including late stale-owner protection.
- `releaseTaskStageClaim(db, input)` accepts only the closed release reason vocabulary. It maps `stale_claim_recovered` to `active -> stale_recovered`; every other accepted release reason maps to `active -> released`.
- `buildTaskClaimReconciliationReadModel(db, input)` for the read-only route.
- Positive allowlist validation for all persisted/exposed claim metadata.

The helper must not import `advanceTaskChain`, `createTask`, gateway clients, OpenClaw command runners, harness code, or external tracker clients.

### Dispatch Integration

Inside `dispatchAssignedTasks`, after tags are parsed and before the current `UPDATE tasks SET status = 'in_progress'`, call the helper for each task when `FEATURE_TASK_CONTROL_PLANE` is enabled. Results:

- `admit`: continue to the existing legacy `in_progress` mutation and launch handoff, then release the active claim with `launch_handoff_completed` on launch handoff completion or `dispatch_failed` on dispatch failure.
- `duplicate_prevented`, `governance_deferred`, `terminal_reconciled`, `stale_truth_deferred`, `boundary_deferred`, `not_claimable`: skip legacy launch for that task and leave structured evidence.
- `flag_off`: bypass the helper and preserve the legacy flow exactly.

The scheduler remains thin. No claim logic moves into `src/lib/scheduler.ts`.

### GitHub Truth Freshness

Claim intake uses only persisted local truth:

- Task must be `assigned`, have an assignee, have canonical `github_repo` in `owner/repo` form, have positive `github_issue_number`, and belong to a workspace/repo with a sync-enabled owner project.
- `github_synced_at` must be present and fresh: `age <= min(max(2 * interval_seconds, 600), 3600)` using `interval_seconds=300` if no scope-specific value exists.
- SPEC-013A1 lifecycle state must be enabled, healthy enough for claim, and not unresolved/disabled/red/stale lease/backoff-blocked.
- Closed issue or closed/merged linked PR truth releases or prevents active claim based on persisted fields/evidence only, using `github_issue_terminal` or `github_pr_terminal` when an active claim is released.

### Local Terminal Task Statuses

For SPEC-013B active-claim release decisions, the terminal Mission Control task statuses are exactly `done` and `failed` from the canonical task status vocabulary. `awaiting_owner` and `ready_for_owner` are not terminal; owner handoff remains non-terminal and does not release a claim by itself. If later PR merge evidence allows the task to transition to `done`, the release reason is `task_terminal_done`.

### Task-Stage Attempt Terminal Release

Task-stage attempt lifecycle status remains passive evidence and never enforces active-claim uniqueness. Reconciliation may observe a linked attempt reaching `succeeded`, `failed`, `released`, or `cancelled` and release the separate active claim with `attempt_terminal_reconciled` so Q5 terminal/gated release behavior is auditable without making `task_stage_attempts.status` the active lock.

### Activity Taxonomy

The closed SPEC-013B claim activity taxonomy is:

- `task_stage_claim_acquired`
- `task_stage_claim_duplicate_prevented`
- `task_stage_claim_released`
- `task_stage_claim_stale_recovered`
- `task_stage_claim_governance_deferred`
- `task_stage_claim_terminal_reconciled`
- `task_stage_claim_stale_truth_deferred`
- `task_stage_claim_boundary_deferred`
- `task_stage_claim_not_claimable`

`task_stage_claim_not_claimable` maps to reconciliation outcome `not_claimable` and uses the existing closed linkage/input reasons such as `not_assigned`, `missing_assignee`, `missing_github_repo`, `invalid_github_repo`, `missing_github_issue_number`, and `workspace_repo_owner_missing`.

### Boundary Error Classification

Claim/reconciliation is a scheduler boundary because it reads persisted GitHub truth, evaluates governance, relies on SQLite uniqueness, and writes durable activities. Expected uniqueness races map to `duplicate_prevented`; late stale-owner releases that do not match the active claim map to safe no-op release results. SQLite busy/database errors, malformed claim input, governance evaluator failures, and unknown claim/release exceptions map to `boundary_deferred`.

`boundary_deferred` is fail-closed for one task: it does not acquire a new active claim, does not release or recover an active claim unless a compare-and-set already succeeded, does not run the legacy `in_progress` mutation or launch handoff, and does not skip governance after a governance result is unavailable or failed. The activity payload uses `task_stage_claim_boundary_deferred` with a closed `boundary_error_category` (`sqlite_constraint_race`, `sqlite_database_error`, `malformed_claim_input`, `governance_evaluator_error`, `release_compare_failed`, `unknown_boundary_error`) plus redaction flags or content hashes only.

### Governance

Before active claim insert, call `resourcePolicyEvaluator` with decision class `task_dispatch`, scope derived from workspace, task id, agent id, workflow template slug, and task priority/cost estimate when available. If decision is:

- `allow`: include decision metadata in claim metadata and continue.
- `defer` or `block`: write resource decision evidence and `task_stage_claim_governance_deferred` activity, append attempt evidence if an attempt exists, and do not acquire a claim.

### Evidence Safety

Persist only allowlisted scalar fields: workspace/task/stage ids, canonical GitHub repo/issue/PR identifiers, claim id, attempt id, run/correlation ids, lease timestamps/ages, governance decision ids/results, freshness timestamps/ages, lifecycle health categories, boundary error categories, redaction flags, and stable outcome enums. Reject or redact raw issue bodies, prompts, tokens, auth headers, raw provider responses, gateway/session payloads, secret-shaped strings, stack traces, SQLite raw error messages, and matched substrings before writing `metadata_json`, activity `data`, or read-model response fields.

### API

Add `GET /api/tasks/[id]/claim-reconciliation` with viewer auth and workspace scoping, following the read-only pattern used by `GET /api/tasks/[id]/stage-attempts`. Register the route in `src/app/api/index/route.ts` and `openapi.json`.

No `POST`, `PATCH`, `DELETE`, action URL, manual release, retry, cancel, or primary dashboard control is part of this spec.

Flag-off read model behavior:

- When `FEATURE_TASK_CONTROL_PLANE` resolves false, the route still returns a read-only `task_claim_reconciliation.v1` envelope for authorized viewers.
- The flag section reports `{ key: 'FEATURE_TASK_CONTROL_PLANE', enabled: false, reason }`; eligibility reports `state: 'flag_off_legacy'` with reason `feature_flag_disabled`.
- The route may read already-persisted claim history, active claim rows, activity decisions, attempt links, and diagnostics, but it must not acquire, release, recover, defer, or otherwise write claim/reconciliation evidence while building the response.
- The route must not create, mutate, refresh, or fetch GitHub sync lifecycle state. It only reads persisted task, claim, attempt, activity, and local lifecycle rows already available in SQLite.

### Archive And Evidence Policy

Before Phase 0 in an autopilot run, Archive Sweep considers only previously merged specs and excludes `013b-claim-reconciliation` until a later post-merge run. Unsafe or dirty contexts use dry-run/stop behavior. This plan creates no generated UI screenshots; if implementation later creates screenshots, they remain CI/Argos artifacts unless a manifest-backed exception is added.

## Verification Plan

Focused red-green Vitest coverage:

- M78 creates the claim table, partial active unique index, `UNIQUE(task_stage_attempt_id)`, lookup indexes, and schema marker; rerun is idempotent; rollback SQL is present and idempotent.
- M78 migration tests assert the partial unique index SQL predicate, prove a second `active` row for the same `(workspace_id, task_id, stage_key)` is rejected, and prove historical `released` and `stale_recovered` rows for that same tuple do not block one replacement `active` row.
- M78 migration tests assert the `release_reason` CHECK vocabulary, including `attempt_terminal_reconciled`, and prove invalid reason strings are rejected while active rows may keep `release_reason=NULL`.
- M78 migration tests delete the schema marker and re-run migrations to prove table/index creation and marker insertion remain idempotent, then run rollback twice to prove manual rollback is no-op safe after reversal.
- Two concurrent acquire attempts for the same `(workspace_id, task_id, stage_key)` produce one active claim and one duplicate-prevented activity, with exactly one launch-admitted result.
- Stale active claim recovery transitions the old claim out of `active` before inserting the replacement, uses a distinct replacement task-stage attempt id, and rejects late stale-owner release.
- Governance block/defer and stale GitHub truth produce evidence without active claim rows.
- Flag-off dispatch parity preserves legacy status transitions, `task_dispatched` activity, messages, and absence of claim side effects.
- Claim helper tests assert no successor writes and no `advanceTaskChain`/`createTask` usage in claim, release, stale recovery, duplicate-prevention, or deferral paths.
- Read-only route returns `task_claim_reconciliation.v1`, enforces viewer/workspace scope, enumerates every allowed eligibility state and reason category, links to stage attempts, and exposes no mutation affordances.
- Read-only route tests cover flag-off response shape and snapshot row counts before/after GET for `tasks`, `task_stage_claims`, `task_stage_attempts`, `task_stage_attempt_events`, `activities`, `github_sync_lifecycle_controls`, and `github_sync_lifecycle_runs` to prove no read-model side effects.
- Payload safety tests reject/redact unsafe fields and secret-shaped values.
- GitHub repository validation tests reject URL, scp-like, path traversal, whitespace/control-character, multi-segment, missing-owner, missing-repo, and `.git`-suffix values before claim intake.
- Boundary-error tests prove SQLite constraint races classify as duplicate prevention; SQLite busy/database errors, malformed claim inputs, governance evaluator failures, and unknown claim/release exceptions classify as `boundary_deferred`; scheduler dispatch skips only that task, records sanitized evidence, and continues other tasks without bypassing governance.
- Terminal local task-state tests prove `done` and `failed` release active claims with `task_terminal_done` or `task_terminal_failed`, while `awaiting_owner`/ready-for-owner handoff evidence does not release a claim by itself.
- Terminal passive attempt lifecycle tests prove linked attempt statuses `succeeded`, `failed`, `released`, and `cancelled` release the separate active claim with `attempt_terminal_reconciled` without making attempt status the active lock.

Full gate before PR packaging:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:all
```

Codex sandbox note: repository guidance says `pnpm test` should run outside the sandbox because the suite uses local runtime resources.
