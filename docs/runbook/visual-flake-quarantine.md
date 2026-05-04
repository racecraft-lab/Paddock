# Visual flake quarantine pipeline

Per FR-370, flaky visual specs must be quarantined within one CI run
of detection. This runbook describes the operator workflow.

## Detection

CI runs Playwright with `retries: 2`. A flake is recorded when the
spec fails on first attempt and passes on retry. The
`governance_visual_flake` activity row tracks every retry-only-pass.

When the rolling-7-day count for a given spec exceeds 3, it is auto-
quarantined: the next CI run skips it with `test.fixme()` and posts
a `governance_visual_flake_quarantined` alert.

## Resolution

1. Reproduce locally with `retries: 0`:

   ```bash
   pnpm test:e2e tests/e2e/<spec>.e2e.ts
   ```

2. Investigate the flake — typical causes:
   - Animation not awaited.
   - Time-sensitive snapshot (clock not pinned).
   - Visual screenshot taken mid-layout.
3. Fix the spec. Remove the `test.fixme()` and the audit row.
4. Watch for re-flake — the quarantine threshold reapplies.

## Escalation

If quarantine count > 5 in a single CI run, the dispatcher pauses
new visual snapshots until an operator clears the queue. This is
the FR-379 runtime-budget protection working as intended.
