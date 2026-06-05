# Visual flake triage

## Detection

Visual regressions are reported by the Playwright and Storybook visual-review
workflows. The current repository checks the visual manifest counts and publishes
review reports; it does not maintain an automatic visual-flake quarantine ledger.

Relevant commands:

```bash
pnpm test:e2e:ui-visual
pnpm test:e2e:visual-manifest
pnpm test:visual:storybook
pnpm test:visual:manifest
```

## Resolution

1. Reproduce the failing visual surface locally:

   ```bash
   pnpm test:e2e tests/e2e/<spec>.e2e.ts
   ```

2. Investigate the flake — typical causes:
   - Animation not awaited.
   - Time-sensitive snapshot (clock not pinned).
   - Visual screenshot taken mid-layout.
3. Fix the component or spec, then rerun the matching visual test and manifest
   verification command.
4. If the test is intentionally skipped while a fix is pending, add the skip in
   the spec with an issue or PR reference and remove it in the follow-up fix.

## Escalation

If repeated flakes block visual approval, treat the PR as review-blocked until
the failing surface is stable. Link the failing report, the suspected cause, and
the follow-up issue in the PR so reviewers can distinguish a product regression
from test instability.
