# Data Model: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

## Owner Merge Gate

**Purpose**: Workflow-level manual checkpoint named `G_PILOT_MERGE`.

**Fields / Evidence**:
- Gate name: `G_PILOT_MERGE`
- Operator identity or run owner recorded in smoke checklist text
- Timestamp of manual merge action
- Target deployment, workspace, and project identity
- Fresh synthetic C4 PR URL/number
- Linked PR-producing task id

**Validation Rules**:
- Not a runtime product state, packet schema, or automated validator action.
- Only allowed manual intervention in the C4 pilot flow.
- Smoke checklist must explicitly state SPEC-009C3 PR #49 was not used.

## PR-Producing Pilot Task

**Purpose**: Existing Mission Control task that reaches `ready_for_owner` with linked GitHub PR identity.

**Fields / Evidence**:
- `tasks.id`
- `tasks.status`
- `tasks.github_repo`
- `tasks.github_issue_number`
- `tasks.github_pr_number`
- `tasks.github_synced_at`
- `tasks.completed_at`
- Workspace/project identity

**State Transitions**:
- `ready_for_owner` -> `ready_for_owner`: before manual merge, when PR is missing, unmerged, mismatched, or only issue-closed evidence exists.
- `ready_for_owner` -> `ready_for_owner`: when GitHub sync cannot fetch current PR evidence because of transport, authentication, permission, rate-limit, timeout, or upstream API failure.
- `ready_for_owner` -> `done`: only after manual GitHub sync observes exact linked PR merged truth.
- `done` -> `done`: duplicate sync idempotency path; no duplicate launch or duplicate terminal side effects.

**Validation Rules**:
- `github_repo` and `github_pr_number` must match current exact GitHub PR evidence.
- Closed issue state alone cannot complete the task.
- Failed sync state cannot complete the task and must not emit terminal side effects.
- Local-only status mutation cannot satisfy C4 terminal completion.

## GitHub PR Evidence

**Purpose**: Current GitHub state for the linked repository and PR number.

**Fields / Evidence**:
- Repository identity
- PR number
- Explicit merged truth, such as `merged === true` or equivalent exact PR merged-state check
- Supporting evidence: `merge_commit_sha`, `merged_at`, issue labels, issue closed state, timeline metadata

**Validation Rules**:
- Explicit merged-PR truth for the exact linked PR is required.
- Supporting evidence is audit-only unless exact merged PR truth is present.
- Fixture evidence is test-only and cannot be accepted as live smoke proof.

## Reconciliation Evidence

**Purpose**: Existing evidence set that explains completion or fail-closed behavior.

**Fields / Evidence**:
- `activities.type`
- `activities.data`
- `notifications.type`
- `notifications.source_id`
- `notifications.recipient`
- `notifications.created_at`
- GitHub `mc:*` labels
- Sync result and timestamp
- Terminal activity with `terminal_event='github_pr_merged'` when completion occurs
- Reconciliation-required activity/evidence when completion is rejected
- Failed sync status/error evidence when GitHub sync cannot fetch current issue or PR state

**Validation Rules**:
- Successful reconciliation must show task `done`, done label projection, stale `ready_for_owner` projection removed, terminal activity, sync evidence, and duplicate-launch absence.
- Failed reconciliation or failed sync must leave the task in `ready_for_owner` and must not write `done`, project done labels, remove ready labels, emit terminal `github_pr_merged` activity, call task-chain advancement, launch downstream work, or run cleanup.
- Duplicate sync must not create duplicate owner-action notifications, reconciliation-required notification floods, terminal activities, cleanup work, or downstream launches.
- C4 must not add a new terminal-done notification type.

## Fresh Synthetic Pilot PR

**Purpose**: Live UAT PR created specifically for C4 owner merge proof.

**Fields / Evidence**:
- PR URL/number
- Target repo
- Linked task id
- Merge timestamp
- Cleanup status or explicit retention rationale
- Cleanup failure step, owner, timestamp, before/after counts when available, and sanitized failure reason

**Validation Rules**:
- Must be distinct from closed/unmerged SPEC-009C3 PR #49.
- Merged PR remains audit trail.
- Disposable local Mission Control residue is cleaned only after evidence capture and backup/export, with before/after counts recorded.
- Cleanup failure evidence must preserve the reconciled or unreconciled task state and must not be recorded as merge/sync reconciliation proof.

## SPEC-009D Evidence Handoff

**Purpose**: Source map for later packet work without creating packet persistence in C4.

**Fields / Evidence**:
- Existing task identity/status/PR fields
- Existing activities and notifications
- Existing task artifact identity/hash/redaction fields
- Existing `quality_reviews.reviewer` and `quality_reviews.status`
- GitHub labels
- Smoke-checklist text for `G_PILOT_MERGE`
- Deferred inventory for SPEC-013A/A1/B/C and SPEC-014A-D fields

**Validation Rules**:
- No new packet YAML/JSON, packet table, lifecycle snapshot API, evidence dashboard, or packet UI.
- Do not copy, supersede, or recreate SPEC-009C3 artifacts solely for handoff.
