# SPEC-008 — Argos baseline approval procedure

Per FR-371 + FR-372, every PR that introduces or alters governance UI
states must produce a fresh Argos build and the operator merging the PR
must confirm the visual baselines before merge.

## First-PR baseline approval

1. Open the PR and look in the description for the line `Argos build #<n>`.
   The CI pipeline writes this line automatically when
   `pnpm test:e2e:argos-metadata --mode playwright` and
   `pnpm test:visual:argos-metadata --mode storybook` run with the
   `ARGOS_UPLOAD_TO_ARGOS=1` env var.
2. Click the Argos build link in the PR. Review every snapshot diff
   marked **Pending review**.
3. For each diff:
   - **Approve** if the new state is intentional (matches the spec).
   - **Reject** if the diff looks accidental — file a follow-up issue
     and add the `argos-rejected` label to the PR.
4. Once all diffs are approved, the build moves from
   `Pending review → Approved`. Argos posts the approved badge to the PR.
5. Operators may merge once the badge is green.

## Rotation policy (FR-372)

- Visual baselines refresh **on change** — every approved Argos build
  becomes the new baseline.
- Bulk rebaseline (e.g., theme switch, font upgrade) is invoked via:

  ```bash
  pnpm argos:rebaseline
  ```

  The script prompts for the typed confirmation `REBASELINE ARGOS` and
  emits a `governance_visual_baseline_rebaselined` audit row before
  uploading new baselines.
- Rebaselining without that audit row is a CI gate violation.

## Credential rotation

See `docs/runbook/rotate-argos-credentials.md`.

## Determinism guarantees (FR-374)

- Playwright is pinned (see `package.json`).
- CI runs use the `mcr.microsoft.com/playwright` Docker image.
- Fonts (`Inter`, `JetBrains Mono`) are loaded from `public/fonts/`.
- Desktop viewport is 1280×800; mobile/tablet are deferred (FR-380).
- Retries: `retries: 2` in CI / `retries: 0` locally; flake quarantine
  per `docs/runbook/visual-flake-quarantine.md`.

## Runtime budget (FR-379)

- Storybook visual run ≤ 5 minutes.
- Playwright + Argos ≤ 10 minutes.
- Both budgets emit `governance_visual_runtime_budget_exceeded`
  alerts on the System Health dashboard when exceeded.
