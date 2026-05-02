# Data Model: SPEC-005 ready_for_owner State and Two-Step Terminal Event

## Overview

SPEC-005 is application-level only. It introduces no tables, migrations, DB CHECK constraints, enum constraints, or terminal-event table. It uses existing task, workflow-template, activity, notification, and GitHub linkage fields.

## Entity: Task

**Existing storage**: `tasks`

**Relevant fields**:

- `id`: task identifier.
- `workspace_id`: workspace used for feature-flag resolution and scoping.
- `status`: text status. SPEC-005 adds application-level value `ready_for_owner`.
- `workflow_template_id`: optional binding to `workflow_templates`.
- `workflow_template_slug`: snapshot for task-chain/template context.
- `assigned_to`: preferred notification recipient.
- `created_by`: notification fallback recipient.
- `github_repo`: explicit linked repository.
- `github_issue_number`: linked issue used for status labels and reconciliation.
- `github_pr_number`: explicit linked PR number used for terminal merge identity.
- `completed_at`: set only when the task reaches `done`, not when it enters `ready_for_owner`.

**Validation rules**:

- Reads may return `ready_for_owner` regardless of feature flag state.
- New writes into `ready_for_owner` require `FEATURE_TWO_STEP_TERMINAL` ON for the task workspace and a transition source that routes approved PR-producing work to owner merge.
- New writes to `done` for PR-producing tasks require either flag OFF, non-PR-producing template, or verified GitHub PR merge evidence.
- While flag ON, every non-GitHub-merge attempt to write `done` for a PR-producing task is blocked with the uniform transition conflict.

**State transitions**:

```text
review -> quality_review
quality_review -> done
quality_review -> ready_for_owner
ready_for_owner -> done
ready_for_owner -> ready_for_owner
```

Transition meanings:

- `quality_review -> done`: allowed for flag OFF or non-PR-producing templates.
- `quality_review -> ready_for_owner`: required for flag ON and `produces_pr=true`.
- `ready_for_owner -> done`: allowed only for verified linked PR merge from GitHub reconciliation or the test fixture seam.
- `ready_for_owner -> ready_for_owner`: used for closed-issue-without-merged-PR reconciliation, with activity/notification side effects deduped.

## Entity: Workflow Template

**Existing storage**: `workflow_templates`

**Relevant fields**:

- `id`: template identifier.
- `workspace_id`: workspace scope.
- `slug`: template slug.
- `produces_pr`: boolean indicating whether tasks from the template require PR merge terminal behavior.
- `external_terminal_event`: nullable text. SPEC-005 canonical value is `github_pr_merged`.

**Validation rules**:

- `produces_pr=true` with `external_terminal_event='github_pr_merged'` means approved tasks stop at `ready_for_owner` while the feature flag is ON.
- `produces_pr=false` tasks keep existing direct completion behavior.
- No DB-level enum or CHECK is added for `external_terminal_event`.

## Entity: Linked PR Evidence

**Storage**: no new table. Evidence is derived from existing task fields plus live GitHub pull data or test fixture data.

**Fields**:

- `github_repo`: must match task `github_repo`.
- `github_pr_number`: must match task `github_pr_number`.
- `merged`: accepted when `true`.
- `merged_at`: accepted when present.
- `merge_commit_sha`: accepted when present.

**Validation rules**:

- The repo and PR number must match exactly.
- At least one merge marker must exist.
- Closed PR without merge evidence is not terminal success.
- Closed issue without merged linked PR evidence is reconciliation work, not completion.
- Issue timeline inference is out of scope.

## Entity: Reconciliation Activity

**Existing storage**: `activities`

**Required row**:

- `type`: `github_terminal_reconciliation_required`
- `entity_type`: `task`
- `entity_id`: task id
- `actor`: `github-sync`
- `description`: operator-readable closed-issue-without-merged-PR message
- `data`: JSON object:

```json
{
  "task_id": 123,
  "workspace_id": 1,
  "github_repo": "owner/repo",
  "github_issue_number": 456,
  "github_pr_number": 789,
  "reason": "linked_issue_closed_without_merged_pr",
  "source": "github_sync"
}
```

**Validation rules**:

- `github_pr_number` may be `null` when explicit PR linkage is missing.
- Repeated syncs must not duplicate activity for unchanged `{ task_id, github_issue_number, reason }`.
- The activity does not mark the task done and does not run chain advancement.

## Entity: Notification

**Existing storage**: `notifications`

**Fields**:

- `recipient`: task `assigned_to`, else task `created_by`.
- `type`: `task_ready_for_owner`
- `title`: `Ready for owner merge` or `Owner merge reconciliation required`
- `message`: includes `Owner action required`
- `source_type`: `task`
- `source_id`: task id
- `workspace_id`: task workspace

**Validation rules**:

- A task entering `ready_for_owner` creates a normal ready-for-owner notification.
- Closed-issue-without-merged-PR reconciliation creates a reconciliation notification.
- Reconciliation notifications are deduped with the same unchanged task/issue/reason key as reconciliation activity.
- Rendering uses the existing notification panel card surface.
- Delivery formatting extends the existing notification delivery formatter.

## Entity: GitHub Status Label

**Existing surface**: `src/lib/github-label-map.ts` and existing GitHub label initialization/application behavior.

**Definition**:

- Status: `ready_for_owner`
- Label: `mc:ready-for-owner`
- Color: `14b8a6`
- Description: `Mission Control: ready for owner`

**Validation rules**:

- Included in `ALL_STATUS_LABEL_NAMES`.
- Inverse mapping returns `ready_for_owner`.
- Label provisioning is idempotent.
- Applying the label replaces prior `mc:*` status labels consistently with existing status-label behavior.

## Entity: Task Chain

**Existing behavior**: SPEC-004 `advanceTaskChain`.

**SPEC-005 rule**:

- Entering `ready_for_owner` does not call `advanceTaskChain`.
- Verified `ready_for_owner -> done` after GitHub PR merge calls `advanceTaskChain` with trigger `github_pr_merged`.
- Blocked conflicts and reconciliation cases do not create successors or retry chain advancement.
