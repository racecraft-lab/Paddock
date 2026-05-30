# Quickstart: SPEC-013C - Retry/Backoff and Debug API Surfaces

## Local Development

Use the repo-pinned runtime:

```bash
direnv exec . node -v
direnv exec . pnpm install --frozen-lockfile
```

Expected Node major: 22.

## Focused Verification

Run focused checks before full verification:

```bash
direnv exec . pnpm exec vitest run src/lib/__tests__/migrations-M79-task-claim-control.test.ts --reporter=verbose
direnv exec . pnpm exec vitest run src/lib/__tests__/task-claim-control-idempotency.test.ts --reporter=verbose
direnv exec . pnpm exec vitest run src/lib/__tests__/task-claim-control.test.ts --reporter=verbose
direnv exec . pnpm exec vitest run src/lib/__tests__/task-claim-control-route.test.ts --reporter=verbose
direnv exec . pnpm exec vitest run src/lib/__tests__/task-claim-reconciliation.test.ts --reporter=verbose
```

Then run:

```bash
direnv exec . pnpm typecheck
direnv exec . pnpm lint
direnv exec . pnpm test
direnv exec . pnpm build
direnv exec . pnpm knowledge:index:check
git diff --check
```

Codex sandbox note: `pnpm test` and `pnpm build` may need to run outside the sandbox because the test provisioner and Turbopack can require local runtime resources.

## Expected API Behavior

1. `GET /api/tasks/{id}/claim-reconciliation` returns `task_claim_reconciliation.v1` with optional `claim_control`.
2. `POST /api/tasks/{id}/claim-control` requires operator/admin role and `Idempotency-Key`.
3. `release` clears active ownership without retry eligibility.
4. `cancel` blocks automatic pickup until explicit retry and does not mark the task done/failed.
5. `retry` makes eligible evidence available for a later scheduler attempt; active backoff is respected unless an override reason is supplied.
6. Same-key same-body replay returns the stable original success response without duplicate audit.
7. Same-key different-body returns `idempotency_key_body_mismatch`.
8. Stale expected-state predicates return `stale_state` or `conflict` without partial mutation.

Example read:

```bash
curl -sS \
  -H "Authorization: Bearer $MC_API_KEY" \
  "$MC_URL/api/tasks/$TASK_ID/claim-reconciliation" | jq '.claim_control'
```

Example retry:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: spec013c-retry-$TASK_ID-$STAGE_KEY-1" \
  "$MC_URL/api/tasks/$TASK_ID/claim-control" \
  --data '{
    "action": "retry",
    "stage_key": "'"$STAGE_KEY"'",
    "expected": {
      "attempt_id": "'"$ATTEMPT_ID"'",
      "attempt_status": "failed"
    },
    "reason": "operator confirmed retry"
  }' | jq .
```

Example release/cancel active claim shape:

```json
{
  "action": "release",
  "stage_key": "dev_implementation",
  "expected": {
    "claim_id": "1",
    "claim_run_id": "claim-run-1",
    "attempt_id": "1",
    "attempt_status": "running"
  },
  "reason": "operator released stale owner"
}
```

Backoff override requires both `override_backoff: true` and a bounded `override_reason`.

## Post-Merge Target UAT

Use a disposable workspace or product-line scope. Enable `FEATURE_TASK_CONTROL_PLANE` only through `workspaces.feature_flags`; do not force it on through environment variables.

Required fixtures:

- Active claim release.
- Active claim cancel.
- Retry of failed/stuck/deferred/cancelled evidence with no active backoff.
- Retry with active backoff respected.
- Retry with explicit backoff override reason.
- Same-key idempotency replay.
- Same-key different-body rejection.
- Stale/conflict after a competing transition.
- Unauthorized/viewer rejection.
- Feature-flag-off rejection.
- Read-model reflection before and after accepted actions.

Evidence packet fields:

- `uat_replay_id`
- Target URL or service name
- Deployed commit
- Operator and timestamp
- Workspace/project/task ids
- Stage key
- GitHub repo/issue identifiers if used
- Feature flag scope
- Route path and authenticated role
- Action request summaries
- HTTP status and business outcome
- Read-model before/after summaries
- Audit activity ids/types
- Idempotency key hash and request body hash
- Backoff previous/after fields
- Override reason when used
- Sanitized error category and redaction flag
- Duplicate mutation/audit proof for replay
- Cleanup residue counts
- SPEC-013D/SPEC-014C blocker statement

Manual DB inspection is supporting evidence only. The primary acceptance path is API response, read-model response, and bounded audit evidence.

## Local Verification Evidence

- `direnv exec . pnpm exec vitest run src/lib/__tests__/migrations-M79-task-claim-control.test.ts src/lib/__tests__/task-claim-control-idempotency.test.ts src/lib/__tests__/task-claim-control.test.ts src/lib/__tests__/task-claim-control-route.test.ts src/lib/__tests__/task-claim-reconciliation.test.ts src/lib/__tests__/task-claim-reconciliation-route.test.ts --reporter=verbose` passed with 6 files and 39 tests.
- `direnv exec . pnpm typecheck`, `direnv exec . pnpm lint`, `direnv exec . pnpm api:parity`, and `direnv exec . pnpm check:strict-scope` passed.
- `direnv exec . pnpm test` passed outside the Codex sandbox after the known provisioner socket sandbox failure.
- `direnv exec . pnpm build` passed outside the Codex sandbox after the known Turbopack sandbox port-binding failure.
- `direnv exec . pnpm knowledge:index:check` and `git diff --check` passed after docs updates.
- `direnv exec . pnpm test:e2e` was not run because SPEC-013C changed API/debug surfaces only; SPEC-013D owns browser-visible operator controls.

## Cleanup And Rollback

Use a unique `spec013c-uat-*` marker for disposable rows. Before cleanup, record counts for:

- Workspaces
- Projects
- Tasks
- `task_stage_claims`
- `task_stage_attempts`
- `task_claim_control_idempotency_keys`
- `activities`

After cleanup, record the same counts and verify zero residue unless a retained-evidence exception is documented.

Rollback is flag-first:

1. Disable or remove `FEATURE_TASK_CONTROL_PLANE` for the disposable scope.
2. Verify mutation routes are unavailable and read-only debug remains safe.
3. If M79 must be rolled back, snapshot the DB and apply `docs/migrations/rollback-M79.sql` manually, then run `PRAGMA foreign_key_check;`. The rollback must refuse to contract `task_stage_claims.release_reason` while any `operator_released`, `operator_cancelled`, or `operator_retry_requested` rows remain.

Closeout wording:

> SPEC-013C provides backend API/debug authority only. In-app operator adoption remains blocked on SPEC-013D, and first real harness operation remains blocked on SPEC-013D plus SPEC-014B.
