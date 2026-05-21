# Feature Specification: Production Triage Outcome Routing

**Feature Branch**: `009f-production-triage-routing`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Route non-remediation Issue Triage outcomes into production-visible recommendation lanes with typed artifacts and task-local Evidence display, without Issue Remediation entry or live side effects."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Spec-Ready Triage Exits (Priority: P1)

An operator reviewing an Issue Triage task that ends in `NEEDS_SPEC` can see a complete SpecKit-ready handoff package on the completed triage task, including why spec work is recommended and what setup remains deferred.

**Why this priority**: `NEEDS_SPEC` is the primary non-remediation exit that would otherwise become a terminal dead end; it must preserve enough context for later spec work without starting that work automatically.

**Independent Test**: Can be fully tested by completing a triage task with `NEEDS_SPEC` and verifying that the completed source task has terminal routing evidence, no remediation successor, no external mutation, and a handoff artifact containing all required owner-facing fields.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `NEEDS_SPEC`, **When** routing is recorded, **Then** the source task completes with a SpecKit-ready handoff artifact containing source issue, triage rationale, proposed scope, non-goals, evidence links, proposed labels, and deferred setup action.
2. **Given** the `NEEDS_SPEC` route has been recorded, **When** the operator inspects downstream task relationships, **Then** no Issue Remediation task or non-remediation successor template has been created.
3. **Given** the `NEEDS_SPEC` route has been recorded, **When** the operator inspects external issue state, **Then** the issue has not been closed, commented on, labeled, assigned, dispatched to an agent, or used to create a spec worktree.

---

### User Story 2 - Route Human and Specialist Recommendations (Priority: P1)

An operator reviewing triage outcomes that need more input or expertise can distinguish a human clarification request from a specialist recommendation and can see the exact missing information or assignment state without leaving the task Evidence surface.

**Why this priority**: `NEEDS_HUMAN` and `NEEDS_SPECIALIST` are common production routing outcomes that require visible next action, explicit ownership expectations, and safe handling when a specialist cannot be selected.

**Independent Test**: Can be fully tested by routing one task as `NEEDS_HUMAN` and one as `NEEDS_SPECIALIST`, then verifying that each completed source task exposes the correct terminal lane, artifact fields, recommended next action, proposed labels, and missing or unassigned state.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `NEEDS_HUMAN`, **When** routing is recorded, **Then** the source task completes with a clarification-request artifact containing blocking questions, target audience, evidence needed, owner-facing next action, proposed labels, and an explicit note that no external message was sent.
2. **Given** an Issue Triage task resolves as `NEEDS_SPECIALIST` and Mission Control has safe specialist metadata, **When** routing is recorded, **Then** the source task completes with a specialist recommendation that identifies the recommended specialist lane and evidence behind that recommendation.
3. **Given** an Issue Triage task resolves as `NEEDS_SPECIALIST` and no safe specialist metadata exists, **When** routing is recorded, **Then** the source task completes with an explicit unassigned-specialist state and a recommended owner action to choose or supply specialist context.

---

### User Story 3 - Route Closure Recommendations (Priority: P2)

An operator reviewing non-remediation closure exits can see whether the issue is recommended as duplicate, obsolete, or invalid, with outcome-specific evidence and no live closure behavior.

**Why this priority**: Closure-like outcomes are risky if they silently mutate external issue state; recommendation-only evidence lets the owner decide whether to act while preserving the triage rationale.

**Independent Test**: Can be fully tested by routing separate triage tasks as `DUPLICATE`, `OBSOLETE`, and `INVALID`, then verifying that each completed source task uses the shared closure-recommendation model with the required outcome-specific fields and no external mutation.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `DUPLICATE`, **When** routing is recorded, **Then** the closure recommendation identifies the suspected duplicate target, comparison rationale, evidence links, proposed labels, and owner-facing next action.
2. **Given** an Issue Triage task resolves as `OBSOLETE`, **When** routing is recorded, **Then** the closure recommendation identifies the superseding condition or changed context, why the issue is no longer actionable, evidence links, proposed labels, and owner-facing next action.
3. **Given** an Issue Triage task resolves as `INVALID`, **When** routing is recorded, **Then** the closure recommendation identifies the invalidity reason, validation evidence, any missing reproducibility context, proposed labels, and owner-facing next action.
4. **Given** any closure recommendation route is recorded, **When** the operator inspects external issue state, **Then** no issue has been closed, commented on, labeled, assigned, or otherwise mutated.

---

### User Story 4 - Preserve Idempotent Evidence Display (Priority: P3)

An operator revisiting or retrying a completed Issue Triage task sees one compact routing summary on the task Evidence surface, even if the same non-remediation outcome is routed more than once.

**Why this priority**: Production routing must be stable under retries and visible where operators already inspect task-local evidence.

**Independent Test**: Can be fully tested by routing the same source triage task and outcome twice, then verifying that the Evidence surface shows one current `triageRouting` summary with artifact references, activity history, recommended next action, proposed labels, deferred side effects, and missing or unassigned states where applicable.

**Acceptance Scenarios**:

1. **Given** a non-remediation route already exists for a source triage task and outcome, **When** routing is repeated, **Then** the existing route evidence is updated or superseded without creating duplicate active routing artifacts.
2. **Given** any supported non-remediation route exists, **When** the operator opens task-local Evidence, **Then** a compact `triageRouting` section shows lane, status, artifact references, recommended next action, proposed labels, deferred side effects, and any missing or unassigned states.
3. **Given** routing evidence is present, **When** the operator reviews the source triage task timeline, **Then** the terminal routing activity is visible and tied back to the same source triage task and outcome.

### Edge Cases

- Routing is retried for the same source triage task and outcome after partial evidence was already recorded.
- A `NEEDS_SPECIALIST` outcome has no safe specialist metadata to support a recommendation.
- A closure recommendation lacks the outcome-specific target or rationale needed for owner action.
- The source issue has incomplete evidence links or missing labels proposed by triage.
- A non-remediation route is requested for an outcome outside `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, or `INVALID`.
- Evidence display encounters superseded routing artifacts and must present only the current route summary while preserving auditability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support terminal recommendation routing for exactly these non-remediation Issue Triage outcomes in v1: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`.
- **FR-002**: System MUST keep all v1 non-remediation routing recommendation-only, with no issue close, external comment, label application, assignment, agent dispatch, spec worktree creation, or automatic SpecKit setup.
- **FR-003**: System MUST complete the source Issue Triage task with terminal non-remediation routing evidence and MUST NOT create an Issue Remediation successor or a non-remediation successor template.
- **FR-004**: System MUST record routing evidence through the existing disposition, artifact, and activity evidence model without requiring a new storage migration for v1.
- **FR-005**: System MUST make repeated routing idempotent by source triage task and outcome, updating or superseding current evidence without creating duplicate active route artifacts.
- **FR-006**: System MUST create a `NEEDS_SPEC` handoff artifact containing source issue, triage rationale, proposed scope, non-goals, evidence links, proposed labels, and deferred setup action.
- **FR-007**: System MUST create a `NEEDS_HUMAN` clarification-request artifact containing blocking questions, target audience, evidence needed, owner-facing next action, proposed labels, and confirmation that no external message was sent.
- **FR-008**: System MUST create a `NEEDS_SPECIALIST` recommendation from existing Mission Control metadata only when safe metadata is available.
- **FR-009**: System MUST record an explicit unassigned-specialist state for `NEEDS_SPECIALIST` when safe specialist metadata is unavailable.
- **FR-010**: System MUST use a shared closure-recommendation model for `DUPLICATE`, `OBSOLETE`, and `INVALID`.
- **FR-011**: System MUST require `DUPLICATE` closure recommendations to include suspected duplicate target, comparison rationale, evidence links, proposed labels, and owner-facing next action.
- **FR-012**: System MUST require `OBSOLETE` closure recommendations to include superseding condition or changed context, non-actionability rationale, evidence links, proposed labels, and owner-facing next action.
- **FR-013**: System MUST require `INVALID` closure recommendations to include invalidity reason, validation evidence, missing reproducibility context when applicable, proposed labels, and owner-facing next action.
- **FR-014**: System MUST expose a compact task-local `triageRouting` evidence section for each routed source triage task.
- **FR-015**: The `triageRouting` evidence section MUST show lane, status, artifact references, recommended next action, proposed labels, deferred side effects, and missing or unassigned states.
- **FR-016**: System MUST preserve auditability for superseded routing evidence while presenting only the current active route summary to operators.
- **FR-017**: System MUST treat the existing `PILOT_MISSION_CONTROL_E2E` product-line scope as the default rollout boundary unless later clarification ratifies a dedicated rollout flag.
- **FR-018**: System MUST reject or visibly fail unsupported non-remediation routing outcomes without creating terminal evidence for an unknown lane.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Triage Route**: The terminal routing record for one source Issue Triage task and one supported non-remediation outcome; includes lane, status, current artifact reference, supersession state, deferred side effects, and recommended next action.
- **Routing Artifact**: Typed evidence created for the selected route, such as a SpecKit handoff, clarification request, specialist recommendation, unassigned-specialist state, or closure recommendation.
- **Closure Recommendation**: Shared recommendation model for `DUPLICATE`, `OBSOLETE`, and `INVALID`; includes outcome-specific rationale, evidence links, proposed labels, and owner-facing next action.
- **Task Evidence Summary**: Operator-facing task-local evidence view that presents the current `triageRouting` state and links to the underlying artifacts and activity history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of supported non-remediation outcomes produce terminal source-task routing evidence with no Issue Remediation successor in acceptance testing.
- **SC-002**: 100% of supported non-remediation outcomes produce no external issue mutation, no agent dispatch, no spec worktree, and no automatic SpecKit setup in acceptance testing.
- **SC-003**: Operators can identify the lane, status, artifact reference, recommended next action, proposed labels, and deferred side effects for any routed source task from the task Evidence surface in under 30 seconds.
- **SC-004**: Repeating routing for the same source triage task and outcome results in exactly one current active route summary in 100% of retry tests.
- **SC-005**: `NEEDS_SPECIALIST` routes without safe specialist metadata show an explicit unassigned-specialist state in 100% of applicable tests.
- **SC-006**: `DUPLICATE`, `OBSOLETE`, and `INVALID` routes each include all outcome-specific required closure fields in 100% of acceptance scenarios.

## Assumptions

- Operators are the primary users of this feature and already rely on task-local Evidence for triage review.
- Recommendation-only behavior is mandatory for v1; owner mutation actions may be considered later but are outside this feature.
- Existing Issue Triage disposition capture already determines the final non-remediation outcome before routing begins.
- Existing task evidence, artifact, and activity records can represent the required routing evidence without a new storage migration.
- The default rollout scope remains the existing pilot product-line boundary unless later clarification records a dedicated flag decision.
