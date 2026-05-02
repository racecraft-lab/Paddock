# Feature Specification: SPEC-005 ready_for_owner State and Two-Step Terminal Event

**Feature Branch**: `005-ready-for-owner`  
**Created**: 2026-05-02  
**Status**: Draft  
**Input**: User description: "SPEC-005 ready_for_owner State and Two-Step Terminal Event"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Existing Completion Behavior When Two-Step Terminal Is Disabled (Priority: P1)

Operators and autonomous agents continue to use the current completion flow when the two-step terminal behavior is disabled, while any already-existing tasks in `ready_for_owner` remain readable and visible.

**Why this priority**: Rollback safety is the highest-priority requirement because Product Line A must be able to disable the feature without losing visibility into tasks that already reached the new state.

**Independent Test**: Can be fully tested by disabling the two-step terminal behavior, approving both PR-producing and non-PR-producing tasks, verifying they complete as they do today, and verifying a pre-existing `ready_for_owner` task remains visible in task views and Kanban.

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
3. **Given** a PR-producing task is in `ready_for_owner`, **When** any non-merge path attempts to move it to `done`, **Then** the request returns a side-effect-free conflict with stable reason `ready_for_owner_pr_merge_required`.
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
- A closed linked issue without merged linked PR evidence is reconciliation work, not completion.
- Closed or abandoned PR evidence without merge confirmation must not complete a PR-producing task.
- Repeated attempts to apply the `mc:ready-for-owner` label must not duplicate labels or create repeated noise.
- Non-PR-producing templates must not be forced through the PR merge gate.
- Existing `awaiting_owner` behavior must remain distinct from the new `ready_for_owner` state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST recognize `ready_for_owner` as an application-level task status without requiring a database-level status constraint or new terminal-event store.
- **FR-002**: System MUST keep existing `ready_for_owner` task rows readable and visible when the two-step terminal behavior is disabled.
- **FR-003**: System MUST prevent new transitions into `ready_for_owner` while the two-step terminal behavior is disabled.
- **FR-004**: System MUST preserve current `quality_review` to `done` behavior for Aegis-approved tasks when the two-step terminal behavior is disabled.
- **FR-005**: System MUST preserve current `quality_review` to `done` behavior for Aegis-approved tasks whose workflow template does not produce a PR when the two-step terminal behavior is enabled.
- **FR-006**: System MUST move Aegis-approved tasks whose workflow template produces a PR from `quality_review` to `ready_for_owner` when the two-step terminal behavior is enabled.
- **FR-007**: System MUST resolve the two-step terminal behavior per workspace at each status transition site.
- **FR-008**: System MUST require explicit task PR linkage, such as repository and PR number or equivalent branch/PR metadata, as the authoritative terminal-event link for PR-producing tasks.
- **FR-009**: System MUST NOT infer terminal PR linkage from issue timelines or issue closure references.
- **FR-010**: System MUST block every non-merge path from moving a PR-producing `ready_for_owner` task to `done`.
- **FR-011**: System MUST return a side-effect-free conflict with stable reason `ready_for_owner_pr_merge_required` when a blocked non-merge completion is attempted.
- **FR-012**: System MUST move a PR-producing `ready_for_owner` task to `done` only when reconciliation observes explicit linked PR merge evidence.
- **FR-013**: System MUST treat merged PR evidence as present when the explicit linked PR is merged or has equivalent merged timestamp or merge commit evidence.
- **FR-014**: System MUST keep a PR-producing task in `ready_for_owner` when the linked issue is closed but no merged linked PR evidence exists.
- **FR-015**: System MUST write operator-visible reconciliation activity when a linked issue closes without merged linked PR evidence.
- **FR-016**: System MUST notify the task assignee, or the creator if no assignee exists, when reconciliation finds a closed issue without merged linked PR evidence.
- **FR-017**: System MUST apply the `mc:ready-for-owner` GitHub status label idempotently when a task enters `ready_for_owner`.
- **FR-018**: System MUST create a distinct `task_ready_for_owner` notification type with action-required wording for tasks entering `ready_for_owner`.
- **FR-019**: System MUST render a `ready_for_owner` Kanban lane between `quality_review` and `done`.
- **FR-020**: System MUST preserve existing `awaiting_owner` semantics and not collapse it into `ready_for_owner`.
- **FR-021**: System MUST run downstream task-chain advancement only when verified PR merge moves a task to `done`, not when a task enters `ready_for_owner`.
- **FR-022**: System MUST support deterministic test evidence for GitHub pull reconciliation without changing production reconciliation behavior.
- **FR-023**: System MUST keep SPEC-005 scope limited to two-step terminal behavior and MUST NOT implement artifact disposition, governance, pilot seed behavior, onboarding, or CrabTrap behavior.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Task**: Unit of Mission Control work with status, workflow template association, assignee, creator, activity, GitHub issue linkage, and optional explicit PR linkage.
- **Workflow Template**: Defines whether tasks produced from the template are PR-producing and therefore require the two-step terminal gate.
- **Linked PR Evidence**: Explicit task linkage to a repository and PR number or equivalent branch/PR metadata, plus merge evidence required before completion.
- **GitHub Issue Link**: Existing issue linkage used for status labels and reconciliation; issue closure alone is not terminal completion evidence for PR-producing tasks.
- **Notification**: Operator-facing alert with recipient, type, wording, and task context; `task_ready_for_owner` indicates action is required.
- **Task Chain**: Ordered downstream work that advances only after a task reaches verified terminal `done`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of PR-producing tasks approved while the two-step terminal behavior is enabled stop in `ready_for_owner` instead of `done`.
- **SC-002**: 100% of non-PR-producing tasks approved while the two-step terminal behavior is enabled continue to complete through the existing `done` path.
- **SC-003**: 100% of blocked non-merge completion attempts for PR-producing `ready_for_owner` tasks return the stable reason `ready_for_owner_pr_merge_required` without changing task status, activity, notifications, labels, or chain state.
- **SC-004**: 100% of PR-producing `ready_for_owner` tasks with verified merged explicit PR evidence complete to `done` during GitHub reconciliation.
- **SC-005**: 100% of closed-issue-without-merged-PR reconciliation cases leave the task in `ready_for_owner`, write activity, and notify the assignee or creator fallback.
- **SC-006**: Operators can identify tasks waiting for owner merge from Kanban and notification surfaces without confusing them with `awaiting_owner` tasks.

## Assumptions

- SPEC-004's PR-producing workflow template flag exists and is the source for deciding whether a task requires the two-step terminal gate.
- Existing task status storage can hold `ready_for_owner` without a database migration.
- Existing GitHub issue linkage and status-labeling behavior can be extended to include `mc:ready-for-owner`.
- Existing notification delivery surfaces can render a distinct ready-for-owner notification type.
- Explicit PR linkage may be absent when a task first enters `ready_for_owner`; this is handled as operator action, not task failure.
- SPEC-009 pilot execution depends on this spec stopping PR-producing tasks at `ready_for_owner` until merge.
