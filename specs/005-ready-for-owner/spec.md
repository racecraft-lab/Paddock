# Feature Specification: SPEC-005 ready_for_owner State and Two-Step Terminal Event

**Feature Branch**: `005-ready-for-owner`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "SPEC-005 ready_for_owner State and Two-Step Terminal Event"

## Clarifications

### Session 2026-05-02 - Transition Guards and API Contract

- Non-merge completion protection will be expressed as a shared transition guard in the task-status/transition boundary, then called before every path that can write `done`.
- `ready_for_owner` remains in the static application status vocabulary for reads, filters, and display even when `FEATURE_TWO_STEP_TERMINAL` is disabled; workspace-aware write guards block new transitions into the state while disabled.
- Blocked completion attempts return `409 Conflict` with the uniform body `{ "error": "transition_conflict", "reason": "ready_for_owner_pr_merge_required", "task_ids": [<id>] }`; single-task routes return a one-item `task_ids` array.
- While `FEATURE_TWO_STEP_TERMINAL` is enabled, the merge gate blocks every non-GitHub-merge attempt to write `done` for a PR-producing task, including manual detail updates, bulk updates, quality-review approval paths, Aegis approval paths, failed-to-done recovery attempts, and closed-issue sync without merged PR evidence.
- Verified PR merge completion triggers downstream chain advancement only after the task is successfully written to `done`, using a GitHub PR merge terminal-event trigger.

### Session 2026-05-02 - GitHub Terminal Event and Reconciliation

- The authoritative PR identity is the task's matched `github_repo` plus `github_pr_number`; branch or PR metadata may only complete the task after it resolves to exactly that linked PR identity, and issue timeline inference remains out of scope.
- Merge evidence may come from a live GitHub PR response or from the test-only `{ webhookFixture }` seam, but it must match the linked repo/PR and include `merged=true`, `merged_at`, or `merge_commit_sha`; closed PRs, closed issues, or branch metadata without merge evidence are insufficient.
- For PR-producing tasks in `ready_for_owner`, closed linked issues without merged linked PR evidence override the generic closed-issue-to-`done` mapping: the task stays in `ready_for_owner`, no chain advancement runs, reconciliation activity is written, and a notification is delivered.
- Reconciliation activity uses type `github_terminal_reconciliation_required`, `entity_type="task"`, `entity_id=<task id>`, actor/source `github-sync`, and data `{ task_id, workspace_id, github_repo, github_issue_number, github_pr_number, reason: "linked_issue_closed_without_merged_pr", source: "github_sync" }`; `github_pr_number` may be `null` when no explicit PR is linked.
- Reconciliation notification uses type `task_ready_for_owner` with reconciliation wording, `source_type="task"`, and `source_id=<task id>`; the recipient is the assignee first, then creator fallback, and repeated syncs must not duplicate activity or notification for unchanged `{ task_id, github_issue_number, reason }`.
- The `pullFromGitHub` test seam is an optional options parameter such as `pullFromGitHub(project, workspaceId, opts?)`; production callsites pass no fixture/options, while tests may pass `{ webhookFixture }` for deterministic merge evidence.

### Session 2026-05-02 - Operator Surfaces and Status Vocabulary

- `ready_for_owner` is added to every static task-status vocabulary surface needed for reads, filters, schemas, stores, UI display, and GitHub status-label mapping; workspace-aware transition guards, not static schema rejection, enforce flag-aware writes.
- The Kanban lane key is `ready_for_owner`, the display label is `Ready for Owner`, it uses teal styling, and it appears between `quality_review` and `done`; `awaiting_owner` keeps its current placement and blocked/manual meaning.
- The GitHub status label is `mc:ready-for-owner`, color `14b8a6`, description `Mission Control: ready for owner`; it is provisioned through the existing label-initialization path and applied idempotently when a task enters `ready_for_owner`, replacing prior `mc:*` status labels like other status transitions.
- `task_ready_for_owner` is a distinct notification type rendered in the existing notification panel and delivery formatter. Normal ready-for-owner notifications use title `Ready for owner merge`; reconciliation notifications use title `Owner merge reconciliation required`; delivered text includes `Owner action required`.
- SPEC-005 uses the existing nullable workflow-template `external_terminal_event` text field with canonical value `github_pr_merged` for PR-producing templates that require the merge gate. It adds no DB CHECK, migration, or terminal-event table.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Existing Completion Behavior When Two-Step Terminal Is Disabled (Priority: P1)

Operators and autonomous agents continue to use the current completion flow when the two-step terminal behavior is disabled, while any already-existing tasks in `ready_for_owner` remain readable and visible.

**Why this priority**: Rollback safety is the highest-priority requirement because Product Line A must be able to disable the feature without losing visibility into tasks that already reached the new state.

**Independent Test**: Can be fully tested by disabling the two-step terminal behavior, approving both PR-producing and non-PR-producing tasks, verifying they complete as they do today, verifying a pre-existing `ready_for_owner` task remains visible in task views and Kanban, and verifying a new attempt to move a task into `ready_for_owner` is rejected or normalized.

**Acceptance Scenarios**:

1. **Given** the two-step terminal behavior is disabled and a PR-producing task is in `quality_review`, **When** Aegis approval is recorded, **Then** the task moves to `done` using the existing completion behavior.
2. **Given** the two-step terminal behavior is disabled and a non-PR-producing task is in `quality_review`, **When** Aegis approval is recorded, **Then** the task moves to `done` using the existing completion behavior.
3. **Given** the two-step terminal behavior is disabled and a task already has status `ready_for_owner`, **When** an operator loads task lists or Kanban, **Then** the task remains readable and visible without being hidden or coerced to another status.
4. **Given** the two-step terminal behavior is disabled, **When** any user or automated path attempts to newly move a task into `ready_for_owner`, **Then** the transition is rejected or normalized so no new task enters that state.

---

### User Story 2 - Route Approved PR-Producing Work To Owner Merge Gate (Priority: P1)

Operators need approved PR-producing tasks to stop at `ready_for_owner` instead of completing, so the human merge gate remains explicit and downstream work does not begin too early.

**Why this priority**: This is the core pilot behavior: approved autonomous work must wait for the linked PR merge before Mission Control marks it complete.

**Independent Test**: Can be fully tested by enabling the two-step terminal behavior, approving one PR-producing template task and one non-PR-producing template task, then verifying only the PR-producing task stops in `ready_for_owner`.

**Acceptance Scenarios**:

1. **Given** the two-step terminal behavior is enabled, a workflow template produces a PR, and its task is in `quality_review`, **When** Aegis approval is recorded, **Then** the task moves to `ready_for_owner` instead of `done`.
2. **Given** the two-step terminal behavior is enabled, a workflow template does not produce a PR, and its task is in `quality_review`, **When** Aegis approval is recorded, **Then** the task moves to `done` using the existing behavior.
3. **Given** a PR-producing task moves into `ready_for_owner`, **When** the transition is recorded, **Then** downstream chain advancement does not run.
4. **Given** a PR-producing task moves into `ready_for_owner` without explicit PR linkage, **When** the transition is recorded, **Then** the task remains in `ready_for_owner`, task activity records the missing linkage, and the assignee or creator is notified to attach or create the PR.

---

### User Story 3 - Complete PR-Producing Work Only After Verified Merge (Priority: P1)

PR-producing autonomous agents and downstream execution depend on Mission Control completing tasks only when the explicitly linked PR is verified as merged.

**Why this priority**: The feature fails if a closed issue, manual update, bulk update, or ordinary status path can bypass the merge gate.

**Independent Test**: Can be fully tested by placing a PR-producing task in `ready_for_owner` with explicit PR linkage, syncing merged and unmerged terminal evidence, and attempting every non-merge completion path.

**Acceptance Scenarios**:

1. **Given** a PR-producing task is in `ready_for_owner` with explicit linked PR evidence, **When** GitHub pull reconciliation observes that the linked PR is merged, **Then** the task moves to `done`.
2. **Given** a PR-producing task is in `ready_for_owner` and its linked issue closes without merged linked PR evidence, **When** GitHub pull reconciliation runs, **Then** the task remains in `ready_for_owner`, reconciliation activity is written, and the assignee or creator fallback receives a notification.
3. **Given** the two-step terminal behavior is enabled and a PR-producing task would be written to `done` by any non-merge path, **When** the path is manual detail update, bulk update, quality-review approval, Aegis approval, failed-to-done recovery, or closed-issue sync without merged PR evidence, **Then** the request returns a side-effect-free conflict with `error="transition_conflict"`, `reason="ready_for_owner_pr_merge_required"`, and the affected task id in `task_ids`.
4. **Given** a non-PR-producing close or disposition task is eligible to complete, **When** normal completion occurs, **Then** the task can move to `done` without PR evidence.
5. **Given** a PR-producing task moves from `ready_for_owner` to `done` after verified merge, **When** the transition completes, **Then** downstream chain advancement runs using the existing terminal completion behavior.

---

### User Story 4 - Show A Dedicated Ready For Owner Lane And Label (Priority: P2)

Operators need tasks waiting on PR merge to be visible in a distinct Kanban lane and reflected in GitHub status labeling.

**Why this priority**: The new state must be operationally visible, otherwise operators cannot reliably find work waiting on merge.

**Independent Test**: Can be fully tested by moving tasks into `ready_for_owner`, viewing Kanban, and verifying the linked GitHub issue has the `mc:ready-for-owner` status label without duplicate labels.

**Acceptance Scenarios**:

1. **Given** tasks exist in `quality_review`, `ready_for_owner`, and `done`, **When** an operator views Kanban, **Then** the `ready_for_owner` lane appears between `quality_review` and `done`.
2. **Given** tasks exist in `awaiting_owner`, **When** the `ready_for_owner` lane is shown, **Then** `awaiting_owner` keeps its existing manual-blocked meaning and placement.
3. **Given** a task enters `ready_for_owner`, **When** outbound GitHub status labeling runs, **Then** the linked issue has `mc:ready-for-owner` applied idempotently.

---

### User Story 5 - Notify Owners That Merge Action Is Required (Priority: P2)

Task assignees and creators need a distinct action-required notification when work is ready for owner merge or when reconciliation finds a closed issue without a merged PR.

**Why this priority**: A visible state alone is not enough; the responsible person must be directly prompted to complete or repair the terminal event.

**Independent Test**: Can be fully tested by moving a task into `ready_for_owner` and by reconciling a closed issue without merged PR evidence, then verifying the notification type, recipient, wording, and task activity.

**Acceptance Scenarios**:

1. **Given** a task enters `ready_for_owner`, **When** notifications are delivered, **Then** a `task_ready_for_owner` notification is created with action-required wording.
2. **Given** a task has an assignee, **When** a ready-for-owner or reconciliation notification is created, **Then** the assignee receives it.
3. **Given** a task has no assignee, **When** a ready-for-owner or reconciliation notification is created, **Then** the creator receives it as fallback.

### Edge Cases

- Existing `ready_for_owner` rows must remain readable and visible when the two-step terminal behavior is disabled.
- New writes or transitions into `ready_for_owner` must not occur when the two-step terminal behavior is disabled.
- A PR-producing task that lacks explicit PR linkage can enter `ready_for_owner` after approval but cannot complete until the linkage and merged PR evidence exist.
- A PR-producing task cannot bypass the merge gate through manual detail update, bulk update, quality-review approval, Aegis approval, failed-to-done recovery, or closed-issue sync while the two-step terminal behavior is enabled.
- A closed linked issue without merged linked PR evidence is reconciliation work, not completion.
- Closed or abandoned PR evidence without merge confirmation must not complete a PR-producing task.
- Repeated closed-issue-without-merged-PR reconciliation for the same unchanged task, issue, and reason must not create duplicate activity or notification noise.
- Repeated attempts to apply the `mc:ready-for-owner` label must not duplicate labels or create repeated noise.
- Non-PR-producing templates must not be forced through the PR merge gate.
- Existing `awaiting_owner` behavior must remain distinct from the new `ready_for_owner` state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST recognize `ready_for_owner` across application-level task status vocabulary surfaces needed for reads, filters, schemas, stores, UI display, and GitHub status-label mapping, without requiring a database-level status constraint or new terminal-event store.
- **FR-002**: System MUST keep existing `ready_for_owner` task rows readable and visible when the two-step terminal behavior is disabled.
- **FR-003**: System MUST prevent new create/update transitions into `ready_for_owner` while the two-step terminal behavior is disabled by using workspace-aware transition guards rather than by rejecting reads through static schemas.
- **FR-004**: System MUST preserve current `quality_review` to `done` behavior for Aegis-approved tasks when the two-step terminal behavior is disabled.
- **FR-005**: System MUST preserve current `quality_review` to `done` behavior for Aegis-approved tasks whose workflow template does not produce a PR when the two-step terminal behavior is enabled.
- **FR-006**: System MUST move Aegis-approved tasks whose workflow template produces a PR from `quality_review` to `ready_for_owner` when the two-step terminal behavior is enabled.
- **FR-007**: System MUST resolve the two-step terminal behavior per workspace at each status transition site.
- **FR-008**: System MUST require explicit task PR linkage as the authoritative terminal-event link for PR-producing tasks; the authoritative identity is matched `github_repo` plus `github_pr_number`, and branch or PR metadata may only complete a task after resolving to that same single PR identity.
- **FR-009**: System MUST NOT infer terminal PR linkage from issue timelines or issue closure references.
- **FR-010**: System MUST block every non-merge path from moving a PR-producing task to `done` while the two-step terminal behavior is enabled unless the write is caused by verified merged PR evidence.
- **FR-011**: System MUST return a side-effect-free `409 Conflict` with body `{ "error": "transition_conflict", "reason": "ready_for_owner_pr_merge_required", "task_ids": [<id>] }` when a blocked non-merge completion is attempted; single-task routes MUST return a one-item `task_ids` array.
- **FR-012**: System MUST move a PR-producing `ready_for_owner` task to `done` only when reconciliation observes explicit linked PR merge evidence from a live GitHub PR response or the test-only webhook fixture seam.
- **FR-013**: System MUST treat merged PR evidence as present only when the evidence matches the linked repo/PR and includes `merged=true`, `merged_at`, or `merge_commit_sha`; closed PRs, closed issues, and branch metadata without merge evidence MUST NOT complete the task.
- **FR-014**: System MUST keep a PR-producing task in `ready_for_owner` when the linked issue is closed but no merged linked PR evidence exists.
- **FR-015**: System MUST write one operator-visible reconciliation activity with type `github_terminal_reconciliation_required`, `entity_type="task"`, `entity_id=<task id>`, and data `{ task_id, workspace_id, github_repo, github_issue_number, github_pr_number, reason: "linked_issue_closed_without_merged_pr", source: "github_sync" }` when a linked issue closes without merged linked PR evidence.
- **FR-016**: System MUST create a `task_ready_for_owner` reconciliation notification with `source_type="task"` and `source_id=<task id>`, notifying the task assignee first or the creator if no assignee exists, when reconciliation finds a closed issue without merged linked PR evidence.
- **FR-016a**: System MUST NOT duplicate reconciliation activity or notifications for the same unchanged `{ task_id, github_issue_number, reason }`.
- **FR-017**: System MUST provision and apply the `mc:ready-for-owner` GitHub status label idempotently when a task enters `ready_for_owner`; the label color MUST be `14b8a6`, the description MUST be `Mission Control: ready for owner`, and outbound sync MUST replace prior `mc:*` status labels consistently with existing status-label behavior.
- **FR-018**: System MUST create a distinct `task_ready_for_owner` notification type with action-required wording for tasks entering `ready_for_owner`; normal notifications use title `Ready for owner merge`, reconciliation notifications use title `Owner merge reconciliation required`, panel rendering uses the existing notification card surface, and delivery formatting includes `Owner action required`.
- **FR-019**: System MUST render a `ready_for_owner` Kanban lane with display label `Ready for Owner` and teal styling between `quality_review` and `done`.
- **FR-019a**: System MUST keep the `ready_for_owner` Kanban lane and `task_ready_for_owner` notification surface accessible through existing operator UX patterns: the lane has a screen-reader-identifiable region name that includes `Ready for Owner` and task count, task cards and unread notification actions remain keyboard reachable with visible focus indicators, notification title/message/type text includes the action-required wording rather than relying on color alone, and teal styling is never the only indicator that owner merge action is required.
- **FR-020**: System MUST preserve existing `awaiting_owner` semantics and not collapse it into `ready_for_owner`.
- **FR-021**: System MUST run downstream task-chain advancement only after verified PR merge successfully moves a task to `done`, not when a task enters `ready_for_owner`; the advancement trigger MUST identify the GitHub PR merge terminal event.
- **FR-022**: System MUST support deterministic test evidence for GitHub pull reconciliation through an optional `pullFromGitHub` options parameter such as `{ webhookFixture }`; production callsites MUST pass no fixture/options and preserve live GitHub behavior.
- **FR-023**: System MUST keep SPEC-005 scope limited to two-step terminal behavior and MUST NOT implement artifact disposition, governance, pilot seed behavior, onboarding, or CrabTrap behavior.
- **FR-024**: System MUST use the existing nullable workflow-template `external_terminal_event` text field with canonical value `github_pr_merged` for PR-producing templates that require verified PR merge completion, without adding a database migration, DB CHECK, enum constraint, or new terminal-event table.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Task**: Unit of Mission Control work with status, workflow template association, assignee, creator, activity, GitHub issue linkage, and optional explicit PR linkage.
- **Workflow Template**: Defines whether tasks produced from the template are PR-producing and therefore require the two-step terminal gate; PR-producing templates that use the merge gate use existing nullable `external_terminal_event` value `github_pr_merged`.
- **Linked PR Evidence**: Explicit task linkage to a matched repository and PR number, with branch or PR metadata accepted only after it resolves to the same single PR identity, plus live or fixture merge evidence required before completion.
- **Reconciliation Activity**: Operator-visible activity of type `github_terminal_reconciliation_required` that records closed-issue-without-merged-PR evidence and is idempotent for unchanged task, issue, and reason.
- **GitHub Issue Link**: Existing issue linkage used for status labels and reconciliation; issue closure alone is not terminal completion evidence for PR-producing tasks.
- **Notification**: Operator-facing alert with recipient, type, wording, and task context; `task_ready_for_owner` indicates action is required.
- **GitHub Status Label**: Existing `mc:*` status label family extended with `mc:ready-for-owner` (`14b8a6`, `Mission Control: ready for owner`) for tasks waiting on owner merge.
- **Task Chain**: Ordered downstream work that advances only after a task reaches verified terminal `done`, with verified PR merge completion distinguished from ordinary quality-review completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of PR-producing tasks approved while the two-step terminal behavior is enabled stop in `ready_for_owner` instead of `done`.
- **SC-002**: 100% of non-PR-producing tasks approved while the two-step terminal behavior is enabled continue to complete through the existing `done` path.
- **SC-003**: 100% of blocked non-merge completion attempts for PR-producing tasks return `409 Conflict` with `error="transition_conflict"`, `reason="ready_for_owner_pr_merge_required"`, and affected ids in `task_ids`, without changing task status, activity, notifications, labels, or chain state.
- **SC-004**: 100% of PR-producing `ready_for_owner` tasks with verified merged explicit PR evidence complete to `done` during GitHub reconciliation.
- **SC-005**: 100% of closed-issue-without-merged-PR reconciliation cases leave the task in `ready_for_owner`, write one `github_terminal_reconciliation_required` activity, notify the assignee or creator fallback with `task_ready_for_owner`, and do not duplicate activity or notification while the reconciliation condition is unchanged.
- **SC-006**: Operators, including keyboard and screen-reader users, can identify tasks waiting for owner merge from Kanban and notification surfaces without confusing them with `awaiting_owner` tasks.

## Assumptions

- SPEC-004's PR-producing workflow template flag exists and is the source for deciding whether a task requires the two-step terminal gate.
- Existing task status storage can hold `ready_for_owner` without a database migration.
- Existing GitHub issue linkage and status-labeling behavior can be extended to include `mc:ready-for-owner`.
- Existing notification delivery surfaces can render a distinct ready-for-owner notification type.
- Explicit PR linkage may be absent when a task first enters `ready_for_owner`; this is handled as operator action, not task failure.
- SPEC-009 pilot execution depends on this spec stopping PR-producing tasks at `ready_for_owner` until merge.
