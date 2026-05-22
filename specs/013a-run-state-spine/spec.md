# Feature Specification: SPEC-013A Run-State Persistence Spine

**Feature Branch**: `013a-run-state-spine`  
**Created**: 2026-05-22  
**Status**: Draft  
**Input**: User description: "/speckit.specify SPEC-013A - Run-State Persistence Spine"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Task-Stage Attempt State (Priority: P1)

As an operator, I need to inspect whether a task-stage attempt exists for a task, what lifecycle state it is in, whether it has been archived, and whether it links to a concrete runtime run, so I can debug control-plane readiness from durable Mission Control evidence rather than terminal history.

**Why this priority**: This is the minimum valuable slice. Without durable, inspectable attempt state, later task-control-plane work has no reviewable substrate.

**Independent Test**: Seed or create representative task-stage attempts, then verify an authenticated operator can inspect each attempt's task identity, workflow/stage identity, attempt number, lifecycle history summary, current state, archive status, and optional run linkage without relying on scheduler or harness execution.

**Acceptance Scenarios**:

1. **Given** a task-stage attempt exists without a linked runtime run, **When** an authenticated operator opens the task debug inspection surface, **Then** the attempt is visible with task identity, workflow/stage identity, attempt number, current lifecycle state, and no required runtime-run link.
2. **Given** a task-stage attempt has a linked runtime run, **When** an authenticated operator inspects the attempt, **Then** the runtime run relationship is visible without duplicating the runtime run's full execution details.
3. **Given** multiple attempts exist for the same task and stage, **When** an authenticated operator inspects the task, **Then** attempts are distinguishable by attempt number and lifecycle history.

---

### User Story 2 - Archive Attempts Non-Destructively (Priority: P2)

As an operator, I need attempts to be archived without deletion or relocation, so historical debugging evidence remains available while archived attempts are clearly distinguishable from active or recent attempts.

**Why this priority**: Archive behavior is part of the core persistence spine and must be proven before later control-plane specs rely on attempt history.

**Independent Test**: Archive a representative attempt and verify the attempt row remains inspectable, includes archived state or archived timestamp evidence, and is excluded from active-style summaries without being physically deleted, exported, or moved.

**Acceptance Scenarios**:

1. **Given** a task-stage attempt is archived, **When** an authenticated operator inspects the task, **Then** the attempt remains present with clear archive evidence and its prior lifecycle context.
2. **Given** archived and non-archived attempts exist for a task, **When** an operator reviews the compact task debug section, **Then** the archived attempt is visually or structurally distinguishable from non-archived attempts.

---

### User Story 3 - Prove Flag-Off Runtime Safety (Priority: P3)

As a reviewer or future implementer, I need `FEATURE_TASK_CONTROL_PLANE=false` behavior to ignore run-state rows at runtime while still permitting read-only inspection, so Mission Control can land the persistence spine without prematurely changing dispatch, scheduler, task-chain, GitHub sync, or review-packet behavior.

**Why this priority**: Runtime safety is required for incremental rollout and for proving SPEC-013A does not smuggle in claim authority or scheduler behavior.

**Independent Test**: With the task-control-plane flag disabled and representative attempts present, verify existing task, dispatch, task-chain, GitHub sync, and review-packet flows behave as they did before while authenticated read-only inspection still shows the attempt records.

**Acceptance Scenarios**:

1. **Given** `FEATURE_TASK_CONTROL_PLANE=false` and task-stage attempts exist, **When** existing scheduler, dispatch, GitHub sync, task-chain, and review packet flows run, **Then** those flows ignore the attempt records and preserve existing behavior.
2. **Given** `FEATURE_TASK_CONTROL_PLANE=false` and task-stage attempts exist, **When** an authenticated operator uses the debug inspection surface, **Then** the attempts remain visible for UAT and review evidence.

### Edge Cases

- Attempts may exist before any runtime run is created and therefore must not require a runtime-run link.
- A runtime run may be absent, deleted by pre-existing retention behavior, or unavailable; the task-stage attempt must remain inspectable with the link shown as missing or unavailable.
- Multiple attempts can exist for the same task-stage identity and must remain ordered and distinguishable by attempt number and lifecycle timing.
- Archived attempts must not be physically deleted, exported-and-deleted, or moved to a separate archive table in this slice.
- Unknown, malformed, or future lifecycle states must fail closed for writes and render safely for read-only inspection.
- Feature-flag-off operation must not block debug reads, but must not affect scheduler, dispatch, claim, retry, GitHub sync, task-chain, or review-packet behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a dedicated additive task-stage-attempt persistence model separate from runtime run metadata.
- **FR-002**: System MUST represent one append-only attempt per task-stage execution.
- **FR-003**: Each attempt MUST be keyed or identifiable by task identity, workflow identity, stage identity, attempt number, current lifecycle state, lifecycle history, archive status, and optional runtime-run linkage.
- **FR-004**: System MUST allow an attempt to exist before a concrete runtime run exists.
- **FR-005**: System MUST preserve optional linkage from a task-stage attempt to an existing runtime run without duplicating runtime-run execution fields as the authoritative source of run details.
- **FR-006**: System MUST record lifecycle as observed state history plus a current-state projection.
- **FR-007**: System MUST use the lifecycle vocabulary `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived` for this slice unless a later clarification explicitly revises the vocabulary.
- **FR-008**: System MUST treat archive as non-destructive attempt state or timestamp evidence; attempts MUST NOT be physically deleted, moved to archive tables, or exported-and-deleted by SPEC-013A behavior.
- **FR-009**: System MUST provide authenticated read-only operator inspection of task-stage attempts, including lifecycle history summary, current state, archive evidence, and optional runtime-run linkage.
- **FR-010**: System MUST keep read-only debug inspection available when `FEATURE_TASK_CONTROL_PLANE=false`.
- **FR-011**: With `FEATURE_TASK_CONTROL_PLANE=false`, existing scheduler, dispatch, GitHub sync, task-chain, and review-packet behavior MUST ignore task-stage-attempt rows.
- **FR-012**: System MUST NOT introduce claim authority, duplicate-launch prevention, scheduler launch, automatic GitHub sync, terminal reconciliation, retry/backoff controls, sandbox lifecycle, harness adapters, full dashboard, or auto-merge behavior in SPEC-013A.
- **FR-013**: System MUST include rollback coverage for any additive persistence changes introduced for the task-stage-attempt model.
- **FR-014**: System MUST explain in reviewer-facing evidence why existing runtime runs and runtime-run metadata are insufficient as the sole durable task-stage-attempt model.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Task-Stage Attempt**: A durable record of one observed task-stage execution attempt. Key attributes include task identity, workflow identity, stage identity, attempt number, current lifecycle state, archive evidence, creation/update timing, and optional runtime-run linkage.
- **Attempt Lifecycle Entry**: An observed lifecycle state entry for a task-stage attempt. It records the state, timing, and reviewable context needed to reconstruct how the attempt reached its current projection.
- **Current State Projection**: The compact current view of an attempt derived from lifecycle history for operator inspection and future control-plane consumers.
- **Runtime Run Link**: An optional relationship from a task-stage attempt to an existing runtime run. It preserves continuity with current runtime execution records without making the runtime run mandatory.
- **Archive Evidence**: Non-destructive evidence that an attempt is archived, represented by archived state and/or timestamp while preserving the original attempt and lifecycle context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In UAT fixtures, 100% of representative task-stage attempts can be inspected by an authenticated operator with task identity, workflow/stage identity, attempt number, current state, archive evidence, lifecycle summary, and optional runtime-run linkage visible.
- **SC-002**: With the task-control-plane flag disabled, existing scheduler, dispatch, GitHub sync, task-chain, and review-packet checks complete with no behavior changes attributable to task-stage-attempt rows.
- **SC-003**: 100% of archived representative attempts remain inspectable after archive action and are not physically deleted, moved to a separate archive table, or exported-and-deleted.
- **SC-004**: Reviewer evidence demonstrates at least one attempt without a runtime-run link and at least one attempt with a runtime-run link, proving the relationship is optional.
- **SC-005**: Reviewer evidence identifies no claim authority, duplicate-launch prevention, scheduler launch, retry/backoff controls, sandbox lifecycle, harness adapter, automatic GitHub sync, terminal reconciliation, full dashboard, or auto-merge behavior added by this slice.

## Assumptions

- The selected model is a dedicated additive task-stage-attempt spine rather than reuse-only runtime-run metadata.
- Runtime runs remain the source of truth for runtime execution details; task-stage attempts are the source of truth for task-stage attempt identity, lifecycle, archive status, and pre-run visibility.
- The initial lifecycle vocabulary is `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`.
- Read-only inspection is authenticated and compact, located near existing task detail or debug evidence surfaces if planning confirms that placement.
- Any write path used to create or archive representative attempts is explicit debug, fixture, or test-support behavior only and does not select work or launch execution.
- Later specs own GitHub sync automation, claim/reconciliation authority, retry controls, scheduler launch, sandbox lifecycle, harness adapters, and richer dashboards.
