# Quickstart: SPEC-013D Claim-Control Operator UX

## Scope

Use this quickstart to verify the SPEC-013D task-detail claim-control UI. SPEC-013D must not change backend retry, release, cancel, backoff, claim, scheduler, idempotency, or debug semantics.

## Local Runtime

Use Node 22 for this worktree:

```bash
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm install
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm dev
```

If validating the standalone production build:

```bash
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm build
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH node .next/standalone/server.js
```

## Focused Test Commands

Run these after implementation tasks add the files:

```bash
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec vitest run src/components/panels/__tests__/claim-control-section.test.tsx --reporter=verbose
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec playwright test tests/e2e/spec-013d-claim-control-operator-ux.spec.ts
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm build
```

Visual evidence path:

```bash
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH MC_VISUAL_SNAPSHOTS=1 MC_VISUAL_OUTPUT_DIR=test-results/visual-current pnpm exec playwright test tests/e2e/spec-013d-claim-control-operator-ux.spec.ts
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:visual:storybook
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:e2e:visual-manifest
PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:visual:manifest
```

## Required Browser Evidence

The Playwright journey must authenticate through the app, open the real task detail modal, drive accessible controls, and attach:

- `spec013d-claim-control-before-active.png`
- `spec013d-claim-control-confirm-retry.png`
- `spec013d-claim-control-after-retry.png`
- `spec013d-claim-control-disabled-reasons.png`
- `spec013d-claim-control-backoff-override.png`
- `spec013d-claim-control-stale-conflict.png`
- `spec013d-claim-control-viewer-read-only.png`
- `spec013d-claim-control-flag-off.png`
- `spec013d-claim-control-fixture-export.json`

The fixture export must show:

- fixture marker prefix `spec013d-claim-control-*`
- disposable task ids
- seeded claim, stage-attempt, idempotency, activity, and feature-flag row ids or counts
- feature-flag before/after restoration
- cleanup proof for all disposable rows
- screenshot and visual manifest names
- redaction proof that no raw idempotency keys or unsafe diagnostics were captured

## Manual UAT Checklist

1. Open a task with backend `claim_control` state and confirm the Claim control section appears near Evidence and Run state.
2. Confirm enabled retry, release, and cancel actions use inline confirmation, not browser-native confirm or a nested modal.
3. Confirm disabled actions remain visible with backend-provided unavailable reasons.
4. Confirm retry backoff is disabled by default and override requires an operator reason.
5. Submit an eligible action and confirm the UI refreshes claim reconciliation, evidence, run state, and task-list item state before final availability is shown.
6. Confirm stale/conflict and idempotent replay outcomes display bounded receipts.
7. Open the task as a viewer and confirm mutation controls are disabled while read-only state remains visible.
8. Turn `FEATURE_TASK_CONTROL_PLANE` off for the disposable workspace and confirm no actionable controls appear.
9. Inspect screenshots and visual manifests for clipping, overlap, wrong data, inaccessible controls, and unsafe payload exposure.
10. Confirm cleanup returns disposable tasks, claim rows, stage-attempt rows, idempotency rows, activities, and feature flags to baseline.

## Rollback / Disable Path

SPEC-013D has no migration. Operational rollback is the existing `FEATURE_TASK_CONTROL_PLANE` workspace flag path plus reverting the UI commit if needed. With the backend flag off or with absent `claim_control`, the task detail must show no actionable claim-control mutation controls.
