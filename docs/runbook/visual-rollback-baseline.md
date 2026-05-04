# Runbook: Visual Rollback Baseline

> Status: SPEC-008 T226 (FR-378, FR-394, FR-090l)

---

## 1. Symptom

- A bad visual baseline was published to GitHub Pages, causing PRs to
  compare against incorrect snapshots.

## 2. Impact

- UI regressions can slip through or every PR can report noisy diffs.

## 3. Diagnose

- Identify the last known-good `main` run for `Mission Control UI E2E`
  or `Visual Storybook Snapshots`.
- Confirm which baseline path is affected:
  - `test-results/visual-current/playwright`
  - `test-results/visual-current/storybook`

## 4. Mitigate

- Block deploys until the baseline branch is restored or a corrective
  main run publishes the intended baseline.

## 5. Recover

1. Re-run the last known-good `main` workflow when the source tree can
   regenerate the desired baseline.
2. If regeneration is not possible, restore the `visual-regression-pages`
   branch to the commit created by the last known-good workflow run.
3. Re-run the affected PR visual workflow.

## 6. Validate

- Diff output matches the previous good visual report.
- `pnpm test:e2e:visual-manifest` and `pnpm test:visual:manifest`
  pass against the regenerated output.

## 7. Postmortem

- Tighten the reviewer gate that allowed the bad baseline to publish.
