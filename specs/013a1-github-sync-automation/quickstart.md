# Quickstart: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

## Prerequisites

- Node >=22.
- pnpm from the repo lockfile.
- GitHub token configured the same way the existing GitHub Sync panel expects.
- Product Line/workspace with at least one active project where `github_sync_enabled=1` and `github_repo` is set.

## Local Verification Flow

Use the repo-pinned runtime in this linked worktree:

```bash
direnv exec . <command>
```

1. Install and build prerequisites:

   ```bash
   direnv exec . pnpm install
   direnv exec . pnpm build
   ```

2. Run focused tests first:

   ```bash
   direnv exec . pnpm exec vitest run \
     src/lib/__tests__/github-sync-lifecycle.test.ts \
     src/lib/__tests__/migrations-M77-github-sync-lifecycle.test.ts \
     src/app/api/github/sync/__tests__/route.test.ts \
     src/app/api/github/sync/control/__tests__/route.test.ts

   direnv exec . pnpm exec vitest run \
     src/lib/__tests__/github-sync-lifecycle-ownership.test.ts \
     src/lib/__tests__/spec006-poller.test.ts \
     src/components/panels/__tests__/github-sync-panel.test.tsx
   ```

3. Start the app:

   ```bash
   direnv exec . pnpm dev
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
   - The lifecycle diagnostics include health severity, scheduler registration, schema version, lease state, cursor effect, ownership decision, skipped counts, and manual fallback availability.
   - The activity feed includes lifecycle evidence for started, succeeded, failed, backoff, partial, skipped ownership, overlap, stale recovery, enable/disable, and manual fallback events when those states are exercised.

8. Verify manual fallback:

   - Trigger manual sync for the same project.
   - If an automatic run owns the same scope, expect deterministic 409 `github_sync_overlap` details for the manual request.
   - Trigger `trigger-all` while one requested scope is leased and expect deterministic 409 details with a `conflicts` array and no partial manual batch start.
   - Trigger manual sync for a non-overlapping scope and verify it can proceed independently.

9. Verify cursor integrity:

   - Force a GitHub fetch failure in a focused test or controlled fixture.
   - Confirm `last_success_cursor` does not change.
   - Confirm `last_error`, failure counter, backoff, and next retry reason are visible.
   - Confirm API responses, activity payloads, lifecycle diagnostics, and health summaries contain allowlisted sanitized categories/messages only, reject or drop non-allowlisted diagnostic fields by default, and do not include token-shaped, authorization-header-shaped, raw GitHub response, API-key-shaped, or credential-like strings.

10. Verify shared-repository owner behavior:

   - Configure two active projects in the same workspace with the same `github_repo`.
   - Ensure exactly one has `is_repo_sync_owner=1`.
   - Run an automatic tick and verify only the owner polls; non-owner skipped counters increase.
   - Configure two active projects with the same `github_repo` and no owner; verify the automatic tick records `ownership_unresolved`, does not call GitHub, preserves the cursor, and surfaces red lifecycle health with `ownership_detail.reason`.
   - Configure two active projects with the same `github_repo` and multiple owners only in a controlled fixture; verify the automatic tick fails closed with `ownership_unresolved` and no duplicate ingestion.

11. Disable automation:

   ```bash
   curl -X PATCH http://localhost:3000/api/github/sync/control \
     -H 'Content-Type: application/json' \
     -d '{"workspace_id":4,"github_repo":"racecraft-lab/mission-control","enabled":false,"disabled_reason":"operator_disabled"}'
   ```

   Confirm the PATCH response is 200 even if a run is active, no future automatic tick starts, any active run remains visible until it finishes or is recovered, and manual sync remains usable after disablement.

## Full Verification

```bash
direnv exec . pnpm api:parity
direnv exec . pnpm build
direnv exec . pnpm typecheck
direnv exec . pnpm lint
direnv exec . pnpm test
direnv exec . pnpm test:e2e
direnv exec . pnpm guardrails:spec-013a1
direnv exec . pnpm guardrails -- --suite spec-evidence-screenshots
```

Focused UAT command:

```bash
direnv exec . pnpm exec playwright test tests/e2e/spec-013a1-github-sync-automation.spec.ts --project=chromium
```

Expected focused UAT evidence:

- The GitHub Sync panel shows enable/disable automation controls and leaves manual sync available.
- Failure/backoff, bounded partial, stale recovery, skipped non-owner, and ownership-unresolved states are visible.
- Lifecycle diagnostics show sanitized failures, ownership decisions, skipped counters, owner project IDs, and ownership reasons without task claim, dispatch, remediation execution, sandbox, auto-merge, or automatic triage copy.

## Rollback Check

- Disable `FEATURE_GITHUB_SYNC_AUTOMATION` or disable the lifecycle control.
- Manual sync remains available.
- Existing GitHub-linked tasks and `github_syncs` rows remain readable.
- If schema rollback is required, apply `docs/migrations/rollback-M77.sql` using the operator rollback procedure.
- After rollback, run `GET /api/github/sync`; compatibility fields (`syncs`, `poller`) remain available and the lifecycle envelope is empty or reports schema unavailable.
