# Quickstart: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

## Environment

Use the dedicated worktree:

```bash
cd /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/009c3-remediation-ready-for-owner
export PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH
```

Package manager is `pnpm`.

## Fixture Validation Path

Automated validation must use deterministic fixture-linked PR identity and must
not create, update, merge, or reconcile a real GitHub PR.

Expected verification shape:

```bash
pnpm test src/lib/__tests__/task-dispatch.test.ts src/app/api/quality-review/__tests__/route.test.ts src/lib/__tests__/task-artifacts-publish.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

If implementation changes an existing ready-for-owner/operator UI surface, add
and run the focused Playwright target for that real browser journey:

```bash
pnpm test:e2e
```

## Expected Happy-Path Evidence

A successful fixture smoke proves:

- The root GitHub issue remains traceable.
- The remediation plan task produces or links plan evidence.
- The `mission-control_dev_implementation` task owns `github_repo` and
  `github_pr_number`.
- The dev task has `dev_verification` evidence with
  `pr_identity_source='fixture'`.
- Review verdict `pass` is recorded against the dev task.
- `quality_reviews` has reviewer `aegis` status `approved` for the same
  workspace and dev task.
- `aegis_approval` artifact references the canonical quality-review row.
- `governance_evidence` records no resource-policy violation, blocked budget,
  or blocked window result.
- Only the PR-producing dev task reaches `ready_for_owner`.
- No merge observation, merge reconciliation, or `done` transition occurs.

## Expected Blocked-Path Evidence

Review `fix`:

- Records a `review_verdict` artifact with `verdict='fix'`.
- Suppresses Aegis and owner-readiness advancement.
- Allows bounded corrected retry without deleting prior verdict evidence.

Aegis `rejected`:

- Records a `quality_reviews` row for reviewer `aegis` with status `rejected`.
- Records an `aegis_approval` evidence artifact with `status='rejected'`.
- Blocks `ready_for_owner`.
- Allows bounded corrected retry without deleting rejection evidence.

Governance blocked:

- Records or links governance evidence.
- Blocks readiness when a resource-policy violation, blocked budget, or blocked
  window result exists.

Artifact publish or supersede failure:

- Records bounded failure activity on the PR-producing dev task's workspace.
- Leaves the required evidence class missing for readiness until publish or
  supersede succeeds.
- Produces no owner-ready side effects: no `ready_for_owner` status write,
  owner-ready notification, `task_ready_for_owner` activity, outbound
  ready-for-owner sync, Aegis/owner-review successor, or owner packet.

Any blocked readiness attempt:

- Leaves the PR-producing dev task non-owner-ready.
- Records only the relevant bounded failure, verdict, governance, or retry
  evidence.
- Produces no owner-ready side effects.

## Optional Live Draft PR Smoke

The live smoke path is operator-initiated UAT only. It is not part of ordinary
automated tests or autopilot validation.

Preconditions:

- Operator explicitly accepts external GitHub side effects.
- At most one draft PR is created.
- The smoke stops at `ready_for_owner`.
- Cleanup expectations are recorded before execution.

Evidence to record:

- Draft PR repository and number.
- Dev task ID that owns the PR identity.
- Stage artifacts and Aegis quality-review ID.
- Confirmation that no merge or `done` reconciliation occurred.
- Cleanup status: draft PR closed or retained with rationale; synthetic local
  tasks/artifacts/reviews/activities/fixture agents removed or explicitly
  retained with evidence.

Fail the live smoke proof closed if PR identity is missing, the PR is not
draft, the identity belongs to a different dev task, the path mutates GitHub
beyond at-most-one draft PR creation, the PR is merged or reconciled to `done`,
or cleanup evidence/retention rationale is missing.

## Scope Guards

During implementation and validation, fail the run if the diff introduces:

- New durable claim-state or run-state tables.
- Automatic GitHub sync polling.
- Sandbox lifecycle or harness adapter execution.
- Manual merge observation or `ready_for_owner -> done` reconciliation.
- Dedicated pilot remediation evidence UI.
- Broad workflow slug migration.
