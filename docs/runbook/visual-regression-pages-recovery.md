# Runbook: Visual Regression Pages Recovery

> Status: SPEC-008 T227 (FR-369, FR-394, FR-090l)

---

## 1. Symptom

- Visual reports fail to publish to GitHub Pages.
- Or: the `visual-regression-pages` branch was deleted or Pages was
  reconfigured away from that branch.

## 2. Impact

- PRs still retain short-lived visual artifacts, but reviewer-facing PR
  reports under `/pr/<PR>/` and merged-main baseline reports may stop
  refreshing.

## 3. Diagnose

- Verify Pages source:

  ```bash
  gh api repos/racecraft-lab/mission-control/pages --jq '.source'
  ```

- Verify the baseline branch exists:

  ```bash
  git ls-remote --heads origin visual-regression-pages
  ```

## 4. Mitigate

- Keep PR visual workflows required.
- Do not merge rebaseline-only PRs until Pages publishing is restored.

## 5. Recover

1. Recreate the `visual-regression-pages` branch if missing.
2. Reconfigure Pages to publish from that branch:

   ```bash
   gh api -X PUT repos/racecraft-lab/mission-control/pages \
     -f source.branch=visual-regression-pages \
     -f source.path=/
   ```

3. Re-run the latest `main` visual workflows so `reg-suit` republishes
   Playwright and Storybook baselines.
4. Re-run the affected PR visual workflows so
   `scripts/publish-visual-pr-pages.mjs` republishes the Playwright and
   Storybook PR report pages.

## 6. Validate

- GitHub Pages source is `visual-regression-pages` at `/`.
- The latest `main` visual workflow publishes without errors.
- The affected PR has Pages links under
  `https://racecraft-lab.github.io/mission-control/pr/<PR>/`.
- Each affected PR report path contains report-local `__reg__` image assets,
  for example `/pr/<PR>/storybook/latest/__reg__/1_actual/`.

## 7. Postmortem

- Record the Pages recovery in the ops calendar and link the failed
  workflow run.
