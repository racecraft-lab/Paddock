# SPEC-013C API-And-Audit UAT Report

## Status

Complete. PR #63 merged to `main` as `42ff5ab7ba7c35c9e7b80fbe652feb1dfedffb89` on 2026-05-30T01:33:03Z. HAL target deployment was promoted to `c01d9e44ec826d94fa5916284c51453e5ec339ee` on May 29, 2026 CDT, covering SPEC-013C plus the subsequent SPEC-014A merge, and post-merge API-and-audit UAT passed with zero disposable residue.

SPEC-013C provides backend API/debug authority only. In-app operator adoption remains blocked on SPEC-013D, and first real harness operation remains blocked on SPEC-013D plus SPEC-014B.

## Local Evidence

| Check | Result |
|-------|--------|
| Focused SPEC-013C cluster | Passed: 6 files, 39 tests |
| TypeScript | Passed: `direnv exec . pnpm typecheck` |
| Lint | Passed: `direnv exec . pnpm lint` |
| API parity | Passed: `direnv exec . pnpm api:parity` |
| Strict scope | Passed: `direnv exec . pnpm check:strict-scope` |
| Unit suite | Passed outside sandbox: 308 files, 3190 tests, 3 skipped, 84 todo |
| Build | Passed outside sandbox |
| E2E | Not run: no browser-visible SPEC-013C UI surface changed |

## PR #63 Manual API UAT

Manual UAT was executed on May 28, 2026 against draft PR #63 branch
`013c-retry-debug-surfaces` at commit
`54a98189345972f22aa63df5d741e8e289c2d349`.

- `uat_replay_id`: `spec013c-uat-20260528-pr63`
- Target: local Next.js server `http://127.0.0.1:3413`
- Data scope: disposable SQLite data dir `/private/tmp/spec013c-uat-20260528-1`
- Auth roles used: session admin `uat-admin`; session viewer `uat-viewer`
- Enabled scope: workspace `1` with `FEATURE_WORKSPACE_SWITCHER=true` and `FEATURE_TASK_CONTROL_PLANE=true`
- Flag-off scope: disposable workspace `3` without `FEATURE_TASK_CONTROL_PLANE`
- Stage key: `dev_implementation`

| Fixture | Result |
|---------|--------|
| Active claim release | Passed: `200`, outcome `released`, activity `task_stage_claim_control_release`, claim release reason `operator_released`, read model last action `release` |
| Active claim cancel | Passed: `200`, outcome `cancelled`, activity `task_stage_claim_control_cancel`, claim release reason `operator_cancelled`, attempt status `cancelled` |
| Retry failed evidence | Passed: read model eligibility `eligible`; mutation returned `200` outcome `retry_ready` with activity `task_stage_claim_control_retry` |
| Retry active backoff | Passed: read model backoff `active`; mutation returned `200` outcome `retry_backoff_active`, backoff decision `active`, `600` seconds remaining |
| Retry override | Passed: `200` outcome `retry_ready`, backoff decision `overridden`, override reason retained, lifecycle control `next_retry_at` reset to `NULL` and `backoff_seconds` reset to `0` |
| Same-key replay | Passed: first request `200`; replay request `200` with `idempotency.replayed=true`; claim-control audit count stayed `1` |
| Same-key body mismatch | Passed: `422`, outcome `validation_error`, sanitized category `idempotency_key_body_mismatch`; no duplicate audit row |
| Stale/conflict | Passed: `409`, outcome `stale_state`, sanitized category `stale_state`; active claim remained `active`; bounded semantic audit row written |
| Unauthorized/viewer | Passed: unauthenticated request returned `401` from the global API auth layer; viewer request returned `403` category `forbidden_role`; claim-control audit count stayed `0` |
| Feature flag off | Passed: `403`, outcome `flag_off`, sanitized category `feature_flag_disabled`; read model stayed safe with `can_mutate=false` |
| Read model before/after | Passed: `claim_control` exposed expected state before mutation, reflected last operator action after release, reported retry eligibility, and reported active backoff |
| Audit/idempotency safety | Passed: 7 bounded claim-control activity rows and 6 idempotency rows; no raw idempotency keys or `Idempotency-Key` header text persisted; idempotency actor ids were positive session user ids |

Cleanup restored the UAT row-count tables to baseline:

| Table | Baseline | After seed | Before cleanup | After cleanup |
|-------|----------|------------|----------------|---------------|
| `workspaces` | 2 | 3 | 3 | 2 |
| `projects` | 1 | 2 | 2 | 1 |
| `tasks` | 0 | 9 | 9 | 0 |
| `task_stage_claims` | 0 | 3 | 3 | 0 |
| `task_stage_attempts` | 0 | 9 | 9 | 0 |
| `task_claim_control_idempotency_keys` | 0 | 0 | 6 | 0 |
| `activities` | 0 | 0 | 7 | 0 |

The disposable GitHub lifecycle control rows and viewer session/user were also
removed during cleanup.

## Post-Merge HAL Target UAT

Target UAT was executed on May 29, 2026 CDT against HAL after deploying merged
`main` commit `c01d9e44ec826d94fa5916284c51453e5ec339ee`, which contains PR #63
merge commit `42ff5ab7ba7c35c9e7b80fbe652feb1dfedffb89`.

- `uat_replay_id`: `spec013c-014a-uat-1780110032087`
- Target: HAL `paddock.service`, local HTTP `http://127.0.0.1:3000`
- Deployment evidence: `pnpm install --frozen-lockfile` no-op from lockfile; `pnpm build` passed under Next.js 16.2.6; `paddock.service` restarted and logged database migrations applied; `/login` returned HTTP `200`; `openclaw-gateway.service` remained active.
- Migration markers: `079_task_claim_control`, `080_agent_sandbox_lifecycles`
- Auth roles used: disposable session admin and disposable session viewer
- Enabled scope: disposable workspace `16` with `FEATURE_WORKSPACE_SWITCHER=true` and `FEATURE_TASK_CONTROL_PLANE=true`
- Flag-off scope: disposable workspace `17` with `FEATURE_WORKSPACE_SWITCHER=true` and `FEATURE_TASK_CONTROL_PLANE=false`
- Stage key: `dev_implementation`

| Fixture | Result |
|---------|--------|
| Active claim release | Passed: `200`, outcome `released`, release reason `operator_released`; read model changed from active claim `10` to no active claim |
| Active claim cancel | Passed: `200`, outcome `cancelled`, release reason `operator_cancelled` |
| Retry active claim | Passed: `200`, outcome `retry_ready`, release reason `operator_retry_requested` |
| Retry failed evidence | Passed: `200`, outcome `retry_ready`, backoff decision `not_active` |
| Retry active backoff | Passed: `200`, outcome `retry_backoff_active`, backoff decision `active` |
| Retry override | Passed: `200`, outcome `retry_ready`, backoff decision `overridden`, override applied |
| Same-key replay | Passed: replay request `200` with `idempotency.replayed=true` |
| Same-key body mismatch | Passed: `422`, sanitized category `idempotency_key_body_mismatch` |
| Stale/conflict | Passed: `409`, outcome `stale_state` |
| Unauthorized/viewer | Passed: unauthenticated request returned `401` from the global auth layer; viewer request returned `403` category `forbidden_role` |
| Feature flag off | Passed: `403`, outcome `flag_off` |
| Read model before/after | Passed: `task_claim_reconciliation.v1` reflected expected active claim before release and no active claim after release |

Cleanup restored the target UAT row-count tables to baseline and verified zero marker residue:

| Table | Baseline | After cleanup | Residue |
|-------|----------|---------------|---------|
| `workspaces` | 3 | 3 | 0 |
| `projects` | 7 | 7 | 0 |
| `users` | 1 | 1 | 0 |
| `user_sessions` | 2 | 2 | 0 |
| `tasks` | 4 | 4 | 0 |
| `task_stage_attempts` | 0 | 0 | 0 |
| `task_stage_attempt_events` | 0 | 0 | 0 |
| `task_stage_claims` | 0 | 0 | 0 |
| `task_claim_control_idempotency_keys` | 0 | 0 | 0 |
| `github_sync_lifecycle_controls` | 0 | 0 | 0 |
| `resource_policy_events` | 0 | 0 | 0 |
| `activities` | 410 | 410 | 0 |

The temporary database backup, sandbox test file, and disposable workspace/project/task/user/session rows were removed. A final HAL check returned no `spec013c-014a-uat-*` workspace rows and no `/tmp/spec013c-014a-uat-*-paddock.db.bak` files.

## Target UAT Matrix

Use a disposable `spec013c-uat-*` workspace or product-line scope with `FEATURE_TASK_CONTROL_PLANE=true` set only through `workspaces.feature_flags`.

| Fixture | Expected Primary Evidence |
|---------|---------------------------|
| Active claim release | `task_claim_control.v1` outcome `released`; activity `task_stage_claim_control_release`; task remains non-terminal |
| Active claim cancel | outcome `cancelled`; release reason `operator_cancelled`; scheduler pickup blocked until retry |
| Retry failed/cancelled evidence | outcome `retry_ready`; no immediate launch; bounded audit row |
| Retry active backoff | outcome `retry_backoff_active`; backoff fields preserved |
| Retry override | outcome `retry_ready`; override reason and backoff reset evidence |
| Same-key replay | stable original response; no duplicate mutation or audit row |
| Same-key body mismatch | `422` with `idempotency_key_body_mismatch` |
| Stale/conflict | `409` with no partial mutation |
| Unauthorized/viewer | rejection without claim-control task audit row |
| Feature flag off | `403` `flag_off`; legacy read/debug behavior remains safe |
| Read model before/after | `claim_control` reflects expected state, available actions, last action, and sanitized errors |

## Evidence Packet Fields

- `uat_replay_id`
- target URL or service name
- deployed commit
- operator and timestamp
- workspace/project/task ids
- stage key
- GitHub repo/issue identifiers when used
- feature flag scope
- route path and authenticated role
- action request summaries
- HTTP status and business outcome
- read-model before/after summaries
- audit activity ids/types
- idempotency key hash and request body hash
- backoff previous/after fields
- override reason when used
- sanitized error category and redaction flag
- replay duplicate mutation/audit proof
- cleanup residue counts

## Cleanup And Rollback

Record before/after row counts for workspaces, projects, tasks, `task_stage_claims`, `task_stage_attempts`, `task_claim_control_idempotency_keys`, and `activities`.

Rollback is flag-first: disable `FEATURE_TASK_CONTROL_PLANE` for the disposable scope and verify mutation routes are unavailable while read-only debug remains safe. If database rollback is required, snapshot the database and apply `docs/migrations/rollback-M79.sql`; rollback must refuse to contract `task_stage_claims.release_reason` while any SPEC-013C operator reason rows remain.
