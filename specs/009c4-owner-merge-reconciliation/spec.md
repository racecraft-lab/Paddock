# Feature Specification: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

**Feature Branch**: `009c4-owner-merge-reconciliation`
**Created**: 2026-05-19
**Status**: Draft
**Input**: User description: "Record the owner merge gate, use the existing manual GitHub sync path to reconcile a linked PR-producing pilot task from `ready_for_owner` to `done`, and prove exact PR identity, negative cases, idempotency, label/status sync, activity/notification evidence, and fresh live smoke evidence for SPEC-009D."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner Completes The Pilot Merge Gate (Priority: P1)

As an operator, I need the pilot flow to stop at `ready_for_owner` until I intentionally perform the `G_PILOT_MERGE` action, so that terminal completion reflects a real owner-approved merge rather than local automation.

**Why this priority**: This is the core value of SPEC-009C4 and the second step of the pilot terminal model. The design concept Q1 decision requires the real GitHub merge to happen only at the human merge gate.

**Independent Test**: Can be fully tested by preparing a linked PR-producing pilot task at `ready_for_owner`, confirming no completion occurs before `G_PILOT_MERGE`, manually merging a fresh synthetic pilot PR at the gate, and then confirming the task can reconcile to `done` after the operator syncs GitHub state.

**Acceptance Scenarios**:

1. **Given** a pilot task is `ready_for_owner` with a linked fresh synthetic PR, **When** no `G_PILOT_MERGE` action has occurred, **Then** the task remains `ready_for_owner` and no successor launch is triggered.
2. **Given** the operator is at `G_PILOT_MERGE`, **When** the operator manually merges the fresh synthetic pilot PR, **Then** the merge event is recorded as the only allowed manual intervention in the C4 pilot flow.
3. **Given** the operator has merged the fresh synthetic pilot PR, **When** the operator records live smoke evidence, **Then** `docs/qa/pilot-smoke-checklist.md` identifies the fresh PR and does not reuse closed/unmerged SPEC-009C3 PR #49.

---

### User Story 2 - Operator Reconciles Done Through Manual Sync (Priority: P1)

As an operator, I need the existing manual GitHub sync path to reconcile merged PR evidence back into Mission Control, so that `ready_for_owner` advances to `done` only from production GitHub state.

**Why this priority**: The design concept Q2 decision requires manual sync, including the existing `pullFromGitHub` path, as the production reconciliation trigger while deferring automatic polling to later specs.

**Independent Test**: Can be fully tested by running the manual GitHub sync after the owner merge and verifying the linked task reaches `done`, receives the expected status/label projection, and records task activity and notification evidence.

**Acceptance Scenarios**:

1. **Given** a linked pilot task is `ready_for_owner` and its exact PR has been merged, **When** the operator runs manual GitHub sync, **Then** Mission Control reconciles the linked task to `done`.
2. **Given** the task reconciles to `done`, **When** the sync result is inspected, **Then** task status, labels, activities, and notifications show terminal completion evidence suitable for SPEC-009D handoff.
3. **Given** reconciliation has completed, **When** downstream task-chain state is inspected, **Then** exactly one successor launch or terminal advancement outcome exists for the verified merge.

---

### User Story 3 - Reconciliation Fails Closed For Wrong Or Missing PR Evidence (Priority: P2)

As an operator, I need Mission Control to reject closed issues, unrelated PRs, or mismatched PR evidence, so that only the PR-producing task's exact repo and PR number can complete the pilot task.

**Why this priority**: Incorrect identity matching could mark work done without the owner's actual merged PR. The design concept Q6 decision requires exact PR mismatch and closed issue/no merged PR negative coverage.

**Independent Test**: Can be fully tested by syncing closed issue evidence without a matching merged PR, syncing a merged PR from the wrong identity, and verifying the task remains `ready_for_owner` with reconciliation-required evidence.

**Acceptance Scenarios**:

1. **Given** an issue is closed but the linked PR is missing or unmerged, **When** GitHub state is synced, **Then** the task remains `ready_for_owner`.
2. **Given** a different PR is merged in the same or another repo, **When** GitHub state is synced, **Then** the linked pilot task does not become `done`.
3. **Given** reconciliation cannot verify the expected PR identity, **When** the sync completes, **Then** Mission Control records reconciliation-required evidence and does not launch duplicate downstream work.

---

### User Story 4 - Duplicate Sync Is Idempotent And Reviewable (Priority: P3)

As an operator preparing SPEC-009D review evidence, I need duplicate manual syncs to be side-effect safe and reviewable, so that repeated reconciliation checks do not create duplicate activities, notifications, labels, or task launches.

**Why this priority**: Operators may rerun manual sync while gathering evidence. The design concept Q3 and Q5 decisions require narrow hardening only for proven gaps and source evidence for SPEC-009D without building the packet or UI in C4.

**Independent Test**: Can be fully tested by syncing the same merged PR evidence more than once and verifying one terminal result, stable labels/status, bounded activity/notification evidence, and no duplicated successor launch.

**Acceptance Scenarios**:

1. **Given** a linked pilot task has already reconciled to `done`, **When** the operator repeats manual GitHub sync with the same merged PR evidence, **Then** task status remains `done` and no duplicate launch occurs.
2. **Given** duplicate syncs are run, **When** activities and notifications are inspected, **Then** they provide durable evidence without duplicate flooding.
3. **Given** SPEC-009D needs handoff evidence, **When** C4 artifacts are reviewed, **Then** issue/PR state, task status, labels, activities, notifications, and smoke-checklist evidence are traceable without a new review packet or evidence UI.

### Edge Cases

- Closed issue evidence arrives without any merged PR evidence for the linked PR-producing task.
- GitHub returns a merged PR that does not match the linked task's expected repo and PR number.
- The same manual sync is run repeatedly after successful reconciliation.
- Label or status projection is stale after the linked task reaches `done`.
- Activity or notification evidence is missing, duplicated excessively, or cannot be traced to the reconciliation event.
- The live smoke target is accidentally pointed at the closed/unmerged SPEC-009C3 PR #49 rather than a fresh synthetic pilot PR.
- Fixture or mocked PR evidence is confused with live GitHub evidence outside tests.
- Local task status is changed to `done` without verified GitHub merge evidence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST represent `G_PILOT_MERGE` as the only allowed manual intervention in the SPEC-009C4 pilot flow.
- **FR-002**: System MUST keep a linked PR-producing pilot task in `ready_for_owner` until both `G_PILOT_MERGE` and verified merged PR evidence for the linked PR are present.
- **FR-003**: System MUST reconcile `ready_for_owner` to `done` through the existing manual GitHub sync operator path, aligned with the design concept Q2 decision to reuse `pullFromGitHub` rather than add polling, webhooks, scheduler behavior, or a new sync API.
- **FR-004**: System MUST require exact PR identity before completion: the GitHub repo and PR number must match the PR-producing task's linked PR.
- **FR-005**: System MUST reject closed issue evidence without matching merged PR evidence and leave the linked task in `ready_for_owner`.
- **FR-006**: System MUST reject merged PR evidence from any unrelated repo or PR number and leave the linked task in `ready_for_owner`.
- **FR-007**: System MUST emit reconciliation-required evidence whenever synced GitHub state is closed, missing, mismatched, unmerged, or otherwise insufficient for `done`.
- **FR-008**: System MUST prevent local-only status mutation from satisfying the SPEC-009C4 terminal completion gate.
- **FR-009**: System MUST make duplicate manual sync after verified merge idempotent: no duplicate terminal completion, no duplicate downstream launch, and no duplicate cleanup work.
- **FR-010**: System MUST keep activity and notification evidence bounded and reviewable across duplicate syncs.
- **FR-011**: System MUST update task status and label projection so the reconciled task reaches `done` with expected done labeling and no stale ready-for-owner projection.
- **FR-012**: System MUST provide traceable task, issue, PR, label, activity, notification, and sync evidence that SPEC-009D can consume without adding a C4 review packet table, lifecycle snapshot API, evidence dashboard, or packet UI.
- **FR-013**: System MUST record live smoke evidence in `docs/qa/pilot-smoke-checklist.md` for a fresh synthetic draft PR manually merged at `G_PILOT_MERGE`.
- **FR-014**: System MUST explicitly forbid using closed/unmerged SPEC-009C3 PR #49 as SPEC-009C4 live UAT proof.
- **FR-015**: System MUST keep fixture or mocked PR evidence test-only and distinguish it from live GitHub evidence used for smoke validation.
- **FR-016**: System MUST start from focused RED coverage and change production behavior only for proven gaps in exact PR matching, idempotency, activity/label sync, or duplicate-launch prevention, consistent with design concept Q3.
- **FR-017**: System MUST preserve future-spec boundaries by not introducing automatic GitHub polling, webhook listeners, scheduler lifecycle, claim-state tables, runner state, sandbox lifecycle, harness adapters, local execution models, review packet persistence, lifecycle snapshot APIs, or evidence UI.
- **FR-018**: System MUST keep roadmap/status hygiene aligned with design concept Q7: C4 setup and phase artifacts may mark C4 in progress, while C4 completion and archive cleanup are deferred until implementation and live UAT are complete.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec, `specs/009c4-owner-merge-reconciliation`, is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-009C4 live smoke evidence records the fresh synthetic PR identity and cleanup status in text form unless a later phase explicitly creates a manifest-backed binary exception.

### Key Entities *(include if feature involves data)*

- **Owner Merge Gate**: The intentional `G_PILOT_MERGE` checkpoint where an operator manually merges the fresh synthetic pilot PR.
- **PR-Producing Pilot Task**: The Mission Control task that has reached `ready_for_owner` and is linked to the GitHub PR whose merge can satisfy terminal completion.
- **GitHub PR Evidence**: The synced GitHub state for a repo and PR number, including whether the exact linked PR is merged.
- **Reconciliation Evidence**: Activities, notifications, labels, status changes, and sync results that explain why a task stayed `ready_for_owner` or reached `done`.
- **Fresh Synthetic Pilot PR**: The cleanup-aware PR created for C4 live UAT; it is distinct from closed/unmerged SPEC-009C3 PR #49.
- **SPEC-009D Evidence Handoff**: The existing evidence set that later packet work can consume without adding packet persistence or UI in C4.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before `G_PILOT_MERGE`, 100% of covered pilot reconciliation cases keep the linked PR-producing task in `ready_for_owner`.
- **SC-002**: After `G_PILOT_MERGE` and one manual GitHub sync with exact merged PR evidence, the linked pilot task reaches `done` in the covered happy-path case.
- **SC-003**: 100% of covered closed-issue-without-merged-PR and mismatched-PR cases remain `ready_for_owner` and produce reconciliation-required evidence.
- **SC-004**: Repeating manual sync at least twice after successful reconciliation produces one terminal outcome and zero duplicate downstream launches.
- **SC-005**: Reconciled task evidence includes task status, done label projection, activity evidence, notification evidence, and linked PR identity in the covered fixture or live smoke validation.
- **SC-006**: Live smoke documentation names a fresh synthetic C4 PR and contains zero reliance on closed/unmerged SPEC-009C3 PR #49 as merge proof.
- **SC-007**: C4 artifacts introduce zero new automatic polling, webhook listener, scheduler path, claim/run schema, sandbox lifecycle, harness adapter, review packet table, lifecycle snapshot API, or evidence UI.
- **SC-008**: SPEC-009D handoff review can identify issue/PR state, task status, labels, activities, notifications, owner merge gate evidence, and deferred future-spec fields from existing C4 evidence sources.

## Assumptions

- SPEC-009C3 has already proven the pilot remediation chain can produce a linked PR and reach `ready_for_owner`.
- Operators have permission to create, merge, and clean up a fresh synthetic pilot PR for live UAT.
- Manual GitHub sync is the production reconciliation trigger for C4; automatic sync automation is intentionally deferred.
- Existing task status, label, activity, notification, and GitHub sync evidence surfaces remain the source of truth unless focused RED tests prove a gap.
- The fresh synthetic PR shape is defined in later Clarify or Plan artifacts, but it must be cleanup-aware and safe for manual merge.
- C4 produces source evidence for SPEC-009D; it does not define SPEC-009D's packet schema, UI, or lifecycle snapshot contract.
- Fixture or mocked GitHub state is acceptable for automated tests, while live smoke evidence must come from real operator-approved GitHub state.

## Clarifications

### Session 1: Merge Gate And Manual Sync Boundary

- `G_PILOT_MERGE` is represented as a workflow-level manual checkpoint, a spec entity/requirement, and checklist/quickstart UAT evidence. It is not a product runtime state, persisted packet schema, or automated gate-validator action.
- After the operator manually merges the fresh synthetic C4 PR, the canonical manual reconciliation entrypoint is `POST /api/github/sync` with `{ "action": "trigger", "project_id": <id> }` for the target project/workspace. The GitHub Sync panel per-project sync button is the UI equivalent, and the shared underlying path is `pullFromGitHub(project, workspaceId)`.
- SPEC-009C4 introduces no automatic polling, webhook listener, scheduler lifecycle, or automation trigger. Those behaviors remain deferred to SPEC-013A1; C4 may only reuse existing manual sync behavior.
- `gate-validator` validates automated SpecKit artifacts, marker counts, fixture tests, checklist presence, and code-checkable gates. It does not validate the human PR merge action itself; operator evidence for `G_PILOT_MERGE` lives in the smoke checklist.
- Minimum live `G_PILOT_MERGE` proof is text evidence in `docs/qa/pilot-smoke-checklist.md`. It MUST include timestamp, target deployment, workspace/project identity, fresh synthetic C4 PR URL/number, linked PR-producing task id, pre-merge `ready_for_owner` state, explicit operator manual merge action, manual GitHub sync result, resulting task status/label/activity/notification evidence, cleanup status or explicit retention rationale, and an explicit statement that closed/unmerged SPEC-009C3 PR #49 was not used. This evidence MUST NOT introduce a new manifest, packet schema, lifecycle snapshot API, evidence dashboard, or packet UI.

### Session 2: Exact PR Evidence And Trust Boundary

- Authoritative SPEC-009C4 merge proof requires current GitHub PR state for the exact linked repository and PR number to explicitly report the pull request as merged, such as a PR response with `merged === true` or an equivalent GitHub merged-state check for that exact PR.
- `merge_commit_sha`, `merged_at`, issue-closed state, labels, or timeline metadata may be recorded as supporting audit evidence, but none of them satisfies the terminal completion gate without explicit merged-PR truth for the exact linked PR.
- Accepted PR evidence must match the C4 pilot task's workspace/project scope, `github_repo`, `github_issue_number`, and `github_pr_number`; a different merged PR in the same repository or a closed issue without the linked merged PR remains insufficient.
- Manual GitHub sync must emit reconciliation-required evidence with distinguishable reasons for missing PR evidence, unmerged linked PR evidence, mismatched identity evidence, and supporting-only evidence that lacks authoritative merged-PR truth.
- Successful reconciliation changes the task to `done`, projects the done label state, removes stale `ready_for_owner` projection, and records traceable activity/notification evidence.
- Fixture evidence is test-only. The direct `pullFromGitHub` fixture option may be used by automated tests, but production API, UI, and poller callsites must not pass fixture payloads or use mocked evidence as live smoke proof.

### Session 3: Idempotency And Duplicate-Launch Prevention

- Duplicate manual sync after successful reconciliation MUST leave the task `done`, create no duplicate downstream launch, and not call task-chain advancement again for the same terminal event.
- Bounded notification evidence means C4 reuses existing notification surfaces: the prior `task_ready_for_owner` owner-action notification for the PR-producing task, plus any existing reconciliation-required notification for negative closed/unmerged evidence cases. Successful `ready_for_owner` to `done` reconciliation is proven by exact PR merge evidence, task status, done label projection, terminal activity, sync result, and traceable existing notification rows; C4 MUST NOT add a new terminal-done notification type.
- Duplicate manual sync after successful reconciliation MUST NOT create duplicate owner-action notifications, reconciliation-required notification floods, duplicate terminal activities, duplicate cleanup work, or duplicate downstream launches. Evidence SHOULD record notification row type, count, recipient, and timestamp sufficient for SPEC-009D review.
- GitHub label/status projection is part of successful reconciliation. C4 MUST prove the existing label mechanism removes stale `mc:ready-for-owner` projection and applies or projects `mc:done`; if the inbound merge path lacks this behavior, it is a C4 hardening gap to address with RED tests first.
- Local-only status mutation cannot satisfy the C4 gate. Success requires a post-merge manual sync evidence tuple: linked task id, workspace/project identity, `github_repo`, `github_issue_number`, `github_pr_number`, current exact PR merged truth, successful sync row, `tasks.status='done'`, terminal activity with `terminal_event='github_pr_merged'`, done label projection, and duplicate-launch absence.
- Live UAT cleanup keeps the merged GitHub PR as audit trail, cleans disposable local Mission Control residue only after evidence capture and backup or export, and records before/after counts, cleanup owner, and any explicit retention rationale in the smoke checklist.

### Session 4: SPEC-009D Evidence Handoff

- SPEC-009D consumes existing C4 evidence sources rather than a C4-created packet schema. The source map is: `tasks.github_repo`, `tasks.github_issue_number`, `tasks.github_pr_number`, `tasks.status`, `tasks.github_synced_at`, and `tasks.completed_at`; `activities.type` and `activities.data` for `task_updated` and `github_terminal_reconciliation_required`; `notifications.type`, `notifications.source_id`, `notifications.recipient`, and `notifications.created_at`; existing `task_artifacts` identity/hash/redaction fields; existing `quality_reviews.reviewer` and `quality_reviews.status`; `mc:*` GitHub labels; and smoke-checklist text for `G_PILOT_MERGE`.
- `docs/qa/pilot-smoke-checklist.md` records live UAT as text evidence only: timestamp, target deployment, PR/task/workspace/project IDs, pre/post state, query/count evidence, cleanup, retention rationale if any, and explicit non-use of SPEC-009C3 PR #49. It MUST NOT become structured packet YAML/JSON or the only PR-body evidence.
- C4 references existing SPEC-009C3 artifact and Aegis approval rows by task, workspace, type, reviewer, and status. It MUST NOT copy, supersede, or recreate them as C4 artifacts solely for handoff.
- Deferred runner, claim, poller, sandbox, and adapter fields are represented as an explicit absence/deferred inventory naming the owning future specs: run-state/poller/claim work remains SPEC-013A/A1/B/C, and sandbox/adapter work remains SPEC-014A-D. C4 MUST NOT add null placeholder columns, inferred fields, or schema stubs for those surfaces.
- No new UI assertion is required unless C4 changes Task Board, GitHub sync UI, smoke-checklist rendering, or another visible evidence surface. If C4 changes only library/tests/docs/checklist evidence, Playwright is recorded as not applicable with rationale; packet UI remains SPEC-009D/E.

## Design Decision Trace

- **Q1 Human merge gate**: Real GitHub merge happens only at `G_PILOT_MERGE`; automated checks use fixture or mocked evidence until the operator performs the live merge.
- **Q2 Manual sync trigger**: Production reconciliation uses the existing manual GitHub sync path, including `pullFromGitHub`; automatic polling remains out of scope.
- **Q3 Narrow hardening**: Start with pilot-specific RED tests and checklist evidence; production changes are allowed only for proven gaps.
- **Q4 Fresh PR UAT target**: Live UAT uses a fresh synthetic draft PR and must not reuse SPEC-009C3 PR #49.
- **Q5 Evidence boundary**: C4 records smoke-checklist and existing task/activity/notification/label/sync evidence for SPEC-009D without building packet persistence or UI.
- **Q6 Negative cases**: Exact PR mismatch, closed issue without merged PR, duplicate sync idempotency, no duplicate launch, and no local-only completion are in scope.
- **Q7 Archive/status hygiene**: C4 is marked in progress during setup; completion and cleanup wait for implementation PR evidence, and archive sweep excludes the current target.
