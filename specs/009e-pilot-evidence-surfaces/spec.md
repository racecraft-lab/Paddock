# Feature Specification: Pilot Evidence Surfaces

**Feature Branch**: `009e-pilot-evidence-surfaces`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "SPEC-009E - Pilot Eligibility and Evidence Surfaces"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review task-local pilot evidence (Priority: P1)

As a Mission Control operator, I can open a retained pilot task and see the stored eligibility, packet, smoke, GitHub, stage, warnings, and deferral evidence from the task context so that I can review the pilot trail without searching through terminal output or unrelated records.

**Why this priority**: This is the minimum operator value for SPEC-009E and makes the existing SPEC-009D review packet usable from the task workflow.

**Independent Test**: Can be fully tested by opening a retained pilot issue/task in the running application, viewing the task detail evidence surface, and capturing Playwright screenshots for the loaded evidence, warning/missing-proof state, and deferred future-state sections.

**Acceptance Scenarios**:

1. **Given** a retained pilot task with stored review packet, smoke checklist, GitHub identity, and eligibility evidence, **When** an operator opens the task detail, **Then** the evidence surface shows the task's current stage, eligibility inputs, linked issue/PR identity, packet artifact references, smoke evidence, warnings, and future-state deferrals.
2. **Given** a pilot-relevant task has packet artifacts and smoke notes stored in Mission Control, **When** the operator reviews its evidence surface, **Then** each visible evidence item is traceable to stored task-local evidence rather than a new external refresh or action.
3. **Given** the operator captures UAT evidence for the retained pilot task, **When** the UAT run is reviewed, **Then** the screenshots and notes prove that the operator-facing UI reads the stored evidence correctly.

---

### User Story 2 - Identify incomplete or ineligible tasks (Priority: P2)

As a reviewer, I can open a local-only or partial-proof task and immediately see why it is not eligible or why its evidence is incomplete so that I can separate valid pilot evidence from missing proof.

**Why this priority**: Review confidence depends on explicit negative states; silently hiding evidence or implying eligibility would make the pilot trail ambiguous.

**Independent Test**: Can be independently tested by opening representative local-only and partial-proof tasks and verifying the evidence surface displays not-eligible or incomplete states with specific missing proof reasons.

**Acceptance Scenarios**:

1. **Given** a task lacks GitHub-linked task identity required for pilot eligibility, **When** a reviewer opens the evidence surface, **Then** the task is labeled not eligible and the missing identity proof is named.
2. **Given** a task has only partial packet or smoke evidence, **When** a reviewer opens the evidence surface, **Then** the task is labeled incomplete and all missing proof categories are listed.
3. **Given** a task is not pilot-relevant, **When** a reviewer opens its task detail, **Then** the evidence surface remains compact and does not imply that pilot evidence exists.

---

### User Story 3 - Preserve clear future-state boundaries (Priority: P3)

As a future SPEC-009F, SPEC-013, or SPEC-014 implementer, I can see which evidence categories are deliberately deferred so that I do not confuse current stored evidence with future runtime authority or automation.

**Why this priority**: SPEC-009E must expose current evidence without accidentally claiming deferred platform capabilities.

**Independent Test**: Can be independently tested by reviewing the evidence surface for a pilot task and verifying that run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution are labeled as deferred with the owning future spec family.

**Acceptance Scenarios**:

1. **Given** a pilot task has current stored packet evidence, **When** a reviewer inspects future-state sections, **Then** run-state persistence and GitHub sync automation are labeled deferred to SPEC-013A or SPEC-013A1.
2. **Given** a reviewer inspects authority and remediation controls, **When** the evidence surface renders deferred sections, **Then** claim authority and retry/debug controls are labeled deferred to SPEC-013B and SPEC-013C.
3. **Given** a reviewer inspects execution and adapter evidence, **When** the evidence surface renders deferred sections, **Then** sandbox lifecycle, adapter registry, and real harness execution are labeled deferred to SPEC-014A-D.

### Edge Cases

- A task has GitHub issue identity but no PR identity; the evidence surface must show the available identity and name the missing PR proof without triggering any refresh.
- A task has packet artifact references but no smoke checklist evidence; the surface must show packet proof and mark smoke proof incomplete.
- A task has smoke checklist notes but no packet artifact reference; the surface must show smoke proof and mark packet proof incomplete.
- A task has stale or unavailable stored artifact references; the surface must expose the stored reference and warn that proof cannot be confirmed from available stored evidence.
- A task is local-only, archived, or otherwise not pilot-relevant; the surface must avoid presenting it as eligible while still giving a compact explanation.
- Multiple stored evidence items conflict about stage or readiness; the surface must prefer an explicit warning over silently choosing a misleading positive state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a generic task evidence concept that can summarize stored task-local proof for pilot-relevant review.
- **FR-002**: System MUST expose task evidence in a read-only manner derived only from evidence already stored in Mission Control.
- **FR-003**: System MUST include pilot eligibility inputs in the v1 task evidence response or view.
- **FR-004**: System MUST include GitHub-linked task identity when issue or pull request proof is stored for the task.
- **FR-005**: System MUST include review packet artifact references when packet evidence is stored for the task.
- **FR-006**: System MUST include smoke checklist evidence when smoke proof is stored for the task.
- **FR-007**: System MUST include the task's current stage as represented by stored Mission Control state.
- **FR-008**: System MUST include warnings and missing-proof reasons when evidence is incomplete, conflicting, stale, or insufficient for pilot eligibility.
- **FR-009**: System MUST show local-only and partial-proof tasks as not eligible or incomplete, with specific missing proof reasons.
- **FR-010**: System MUST provide a compact read-only Evidence section or tab from the task detail context for GitHub-linked or pilot-relevant tasks.
- **FR-011**: System MUST keep non-pilot and non-GitHub-linked task evidence compact and must not imply pilot eligibility without required proof.
- **FR-012**: System MUST label future-state evidence categories for run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution as deferred.
- **FR-013**: System MUST associate deferred future-state categories with SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, or SPEC-014A-D as appropriate.
- **FR-014**: System MUST NOT create or mutate task evidence, task artifacts, smoke results, packets, GitHub sync state, or pilot status as part of viewing evidence.
- **FR-015**: System MUST NOT perform live GitHub refresh, packet generation, smoke execution, GitHub sync trigger, claim authority, runner state mutation, retry control, sandbox lifecycle management, adapter registry execution, or harness execution for this feature.
- **FR-016**: UAT MUST open a retained pilot issue/task and verify the operator-facing evidence UI reads stored evidence correctly.
- **FR-017**: The feature MUST remain bounded to a task-local evidence surface and MUST NOT introduce a global Evidence page.
- **FR-018**: The feature MUST be reviewable as one compact change set.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Task Evidence**: Task-local summary of stored proof used for operator review; includes eligibility, identity, packet, smoke, stage, warning, and deferral sections.
- **Pilot Eligibility Evidence**: Stored inputs that explain whether a task is eligible for pilot review and which proof categories are present or missing.
- **GitHub Task Identity**: Stored issue and pull request identifiers associated with the task.
- **Review Packet Reference**: Stored reference to an existing pilot review packet or packet artifact.
- **Smoke Checklist Evidence**: Stored proof or notes from smoke checklist validation associated with the task.
- **Future-State Deferral**: Explicit label for evidence categories intentionally deferred to later specs rather than implemented in SPEC-009E.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can find the retained pilot task's eligibility, GitHub identity, packet, smoke, stage, warning, and deferral evidence from task detail in under 30 seconds without using a terminal.
- **SC-002**: 100% of tested local-only or partial-proof tasks display a not-eligible or incomplete state with at least one specific missing proof reason.
- **SC-003**: 100% of tested pilot-relevant tasks render future-state deferral labels for the seven named deferred categories without exposing controls for those capabilities.
- **SC-004**: UAT evidence includes at least one retained pilot issue/task browser journey with screenshots proving the stored evidence appears in the operator-facing UI.
- **SC-005**: Reviewers can distinguish stored proof, missing proof, and deferred future-state categories on first inspection for all UAT tasks.

## Assumptions

- Existing stored task, artifact, activity, packet, smoke, and GitHub identity records are sufficient to derive the v1 evidence view.
- The first operator surface is task-local because the feature explicitly excludes a global Evidence page.
- Evidence viewing is available to the same operators who can already inspect task detail.
- Deferred future-state labels are informational only and do not create controls, automation, or execution paths.
- The retained pilot issue/task from SPEC-009D remains available for UAT evidence.
