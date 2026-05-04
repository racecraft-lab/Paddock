# SPEC-008 — Visual Baseline Approval Procedure

Per FR-371 + FR-372, every PR that introduces or alters governance UI
states must produce fresh visual regression output, and the operator
merging the PR must confirm the visual baseline before merge.

## PR Review

1. Open the `Mission Control UI E2E` and `Visual Storybook Snapshots`
   workflow runs for the PR.
2. Confirm both manifest gates passed:
   - `pnpm test:e2e:visual-manifest`
   - `pnpm test:visual:manifest`
3. Open the GitHub Pages PR visual review links posted by the workflows:
   - `https://racecraft-lab.github.io/mission-control/pr/<PR>/playwright/latest/`
   - `https://racecraft-lab.github.io/mission-control/pr/<PR>/storybook/latest/`
4. Use the review queue to inspect every changed, new, and removed snapshot.
   Changed snapshots expose baseline/current side-by-side, highlighter,
   overlay, and blink views. `reg-viz.html` remains available in each report
   directory as the raw fallback report.
5. Mark each intentional local review decision in the Pages app, copy the
   summary, and paste the final approval or request-changes note into the PR.
   The Pages app stores review marks in browser-local storage only.
6. Approve intentional UI changes in the PR review. For accidental diffs,
   request changes and link the failing report artifact.
7. Operators may merge once the visual regression, manifest, accessibility,
   lint, typecheck, unit, and e2e checks are green.

## Main Baselines

Merged `main` runs publish provider-neutral baselines with `reg-suit` to
GitHub Pages on the `visual-regression-pages` branch. PR checks compare
against those baselines without relying on a paid visual SaaS account.

PR runs also publish a static visual review app, the generated `reg-actions`
report HTML, and referenced `__reg__` image assets to the same Pages branch
under `/pr/<PR>/`. The Pages entrypoint exposes the queue, filters, baseline,
current, diff, new, and removed image panes for peer review without downloading
Actions artifacts. The reusable app source is maintained in the private
`racecraft-lab/visual-review-pages` repository and vendored into
`scripts/visual-review-app.{css,js}` for this workflow.

Required repository setting:

```bash
gh api -X PUT repos/racecraft-lab/mission-control/pages \
  -f source.branch=visual-regression-pages \
  -f source.path=/
```

## Rotation Policy

- Visual baselines refresh on merged `main` after the visual workflows pass.
- Bulk rebaseline changes, such as theme or font changes, must be reviewed
  in a dedicated PR with explicit screenshots attached to the workflow run.
- Rebaseline PRs must include the affected domains and the reason the
  previous baseline is intentionally obsolete.

## Pages Recovery

See `docs/runbook/visual-regression-pages-recovery.md`.

## Determinism Guarantees

- Playwright is pinned in `package.json`.
- CI runs use the `mcr.microsoft.com/playwright` Docker image.
- Fonts (`Inter`, `JetBrains Mono`) are loaded from `public/fonts/`.
- Desktop visual viewport is fixed at 1366×768 for Storybook and the
  Playwright viewport configured by the e2e tests.
- Retries: `retries: 2` in CI / `retries: 0` locally; flake quarantine
  follows `docs/runbook/visual-flake-quarantine.md`.

## Runtime Budget

- Storybook visual run ≤ 5 minutes.
- Playwright visual run ≤ 10 minutes.
- Both budgets emit `governance_visual_runtime_budget_exceeded`
  alerts on the System Health dashboard when exceeded.
