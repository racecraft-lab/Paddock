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
5. Mark each intentional review decision in the Pages app. The app persists
   in browser-local storage immediately and can also export deterministic JSON
   or copy a marker-delimited PR comment for manual backup.
6. Publish shared PR review state:
   - Preferred: enter a GitHub token in the Pages app, load current PR state,
     then publish. For private repositories, use a fine-grained token with
     repository metadata read access, Issues read/write access, and Commit
     statuses read/write access.
   - Fallback: use `Download JSON` / `Import JSON` to move review state between
     browsers, or `Copy PR comment` and paste the generated comment into the PR.
7. Repeat the review state publish from both report surfaces:
   - `Playwright UI E2E`
   - `Storybook Components`
8. Confirm the `visual-review-approval` PR status is green. That status fails
   until every required surface is approved, has zero rejected or open
   snapshots, and was reviewed against the current PR head SHA.
9. Approve intentional UI changes in the PR review. For accidental diffs,
   request changes and link the failing report artifact.
10. Operators may merge once the visual regression, manifest, accessibility,
   lint, typecheck, unit, e2e, and `visual-review-approval` checks are green.

## Main Baselines

Merged `main` runs publish provider-neutral baselines with `reg-suit` to
GitHub Pages on the `visual-regression-pages` branch. PR checks compare
against those baselines without relying on a paid visual SaaS account.

PR runs also publish a static visual review app, the generated `reg-actions`
report HTML, and referenced `__reg__` image assets to the same Pages branch
under `/pr/<PR>/`. The Pages entrypoint exposes the queue, filters, baseline,
current, diff, new, and removed image panes for peer review without downloading
Actions artifacts.

Review decisions are stored in three free, repository-native layers:

- browser-local storage for immediate draft persistence;
- exported JSON files for manual handoff or archival;
- a marker-delimited GitHub PR comment for shared reviewer state.

The `Visual Approval` workflow reads that PR comment and publishes the
`visual-review-approval` commit status. The status is intentionally independent
of paid visual SaaS services and can be marked as a required status check in
branch protection rules.

The Pages app also attempts to refresh `visual-review-approval` immediately
after publishing the shared PR comment. This lets the PR status update without
waiting for an `issue_comment` workflow run, provided the reviewer token has
Commit statuses write access.

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
