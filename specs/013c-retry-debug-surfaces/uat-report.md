# SPEC-013C API-And-Audit UAT Report

## Status

Local implementation verification is complete. Target-deployment post-merge UAT remains to be executed after the SPEC-013C PR is merged and deployed.

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
