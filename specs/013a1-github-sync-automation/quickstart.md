# Quickstart: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

## Prerequisites

- Node >=22.
- pnpm from the repo lockfile.
- GitHub token configured the same way the existing GitHub Sync panel expects.
- Product Line/workspace with at least one active project where `github_sync_enabled=1` and `github_repo` is set.

## Local Verification Flow

1. Install and build prerequisites:

   ```bash
   pnpm install
   pnpm build
   ```

2. Run focused tests first:

   ```bash
   pnpm test -- src/lib/__tests__/github-sync-lifecycle.test.ts
   pnpm test -- src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts
   pnpm test -- src/app/api/github/sync/__tests__/route.test.ts
   pnpm test -- src/app/api/github/sync/control/__tests__/route.test.ts
   ```

3. Start the app:

   ```bash
   pnpm dev
   ```

4. Confirm flag-off behavior:

   - Open the GitHub Sync panel.
   - Verify manual sync controls still render.
   - Call `GET /api/github/sync` and confirm `github_sync_lifecycle.version` is `github_sync_lifecycle.v1` and the flag reports disabled.
   - Trigger manual project sync and verify the response remains `{ ok, pulled, pushed }`.

5. Enable the feature flag for the Product Line/workspace through the existing feature-flag administration surface.

6. Enable automatic sync for one repository scope:

   ```bash
   curl -X PATCH http://localhost:3000/api/github/sync/control \
     -H 'Content-Type: application/json' \
     -d '{"workspace_id":4,"github_repo":"racecraft-lab/mission-control","enabled":true,"interval_seconds":300,"max_pages":10,"max_issues":1000,"max_duration_seconds":45}'
   ```

7. Observe one scheduler-owned tick:

   - `GET /api/github/sync` shows enabled controls, next eligible time, active run while running, and last run after completion.
   - The GitHub Sync panel shows lifecycle status and backoff/error/partial state when present.

8. Verify manual fallback:

   - Trigger manual sync for the same project.
   - If an automatic run owns the same scope, expect deterministic 409 overlap details or skipped automatic overlap.
   - Trigger manual sync for a non-overlapping scope and verify it can proceed independently.

9. Verify cursor integrity:

   - Force a GitHub fetch failure in a focused test or controlled fixture.
   - Confirm `last_success_cursor` does not change.
   - Confirm `last_error`, failure counter, backoff, and next retry reason are visible.

10. Verify shared-repository owner behavior:

   - Configure two active projects in the same workspace with the same `github_repo`.
   - Ensure exactly one has `is_repo_sync_owner=1`.
   - Run an automatic tick and verify only the owner polls; non-owner skipped counters increase.

11. Disable automation:

   ```bash
   curl -X PATCH http://localhost:3000/api/github/sync/control \
     -H 'Content-Type: application/json' \
     -d '{"workspace_id":4,"github_repo":"racecraft-lab/mission-control","enabled":false,"disabled_reason":"operator_disabled"}'
   ```

   Confirm no future automatic tick starts and manual sync remains usable.

## Full Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## Rollback Check

- Disable `FEATURE_GITHUB_SYNC_AUTOMATION` or disable the lifecycle control.
- Manual sync remains available.
- Existing GitHub-linked tasks and `github_syncs` rows remain readable.
- If schema rollback is required, apply `docs/migrations/rollback-M77.sql` using the operator rollback procedure.
