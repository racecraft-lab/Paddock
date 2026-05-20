# Feature Specification: Pilot Review Packet and Lifecycle Snapshot

**Feature Branch**: `009d-pilot-review-lifecycle`  
**Created**: 2026-05-19  
**Status**: Draft  
**Input**: User description: "Pilot Review Packet and Lifecycle Snapshot"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect One Pilot Lifecycle Packet (Priority: P1)

As a Mission Control operator, I can inspect one pilot packet that ties together the GitHub issue, root task, lifecycle descendants, PR evidence, owner gate, Aegis decision, artifacts, governance evidence, latest error, and current stage so I can understand the self-hosting pilot without terminal archaeology.

**Why this priority**: This is the primary value of the feature. Operators need one coherent review surface before future run-state and dashboard work expands the evidence model.

**Independent Test**: Can be fully tested by assembling a packet for the proven pilot from stored Mission Control evidence and verifying the packet includes each lifecycle section, source-map pointer, current stage, and no fresh external lookup requirement.

**Acceptance Scenarios**:

1. **Given** stored evidence for the proven self-hosting pilot, **When** an operator requests the review packet, **Then** the packet includes the GitHub issue, root task, lifecycle descendants, PR evidence, owner gate, Aegis decision, artifacts, governance evidence, latest error, and current stage.
2. **Given** a packet section has no stored evidence, **When** the packet is assembled, **Then** that section is represented as not available or deferred with an explicit reason instead of invented data.
3. **Given** packet content references persisted Mission Control records, **When** an operator reviews the packet, **Then** each included claim has a source-map pointer back to the source evidence.

---

### User Story 2 - Review Markdown And JSON Evidence (Priority: P2)

As a PR reviewer, I can read a compact Markdown summary and inspect the underlying JSON packet so I can validate pilot evidence without following terminal logs.

**Why this priority**: Reviewers need both human-readable narrative and machine-readable evidence to keep the pilot reviewable and reproducible.

**Independent Test**: Can be fully tested by publishing both Markdown and JSON artifacts for the same packet, then confirming the Markdown summary matches the JSON packet and both artifacts carry source-map pointers.

**Acceptance Scenarios**:

1. **Given** a completed packet assembly, **When** artifacts are published, **Then** both JSON and Markdown packet artifacts are available for review.
2. **Given** a reviewer compares the Markdown summary with the JSON packet, **When** the same lifecycle field appears in both, **Then** the values are consistent or the Markdown explicitly summarizes the JSON field.
3. **Given** packet evidence contains secrets, oversized values, security-scan details, or previews, **When** artifacts are published, **Then** redaction, compact evidence, hashes, byte counts, and previews follow the existing evidence behavior.

---

### User Story 3 - See Deferred Control-Plane Fields (Priority: P3)

As a future control-plane implementer, I can see which run, claim, retry, sync automation, sandbox, and adapter fields are intentionally deferred and which future spec owns each one.

**Why this priority**: This keeps SPEC-009D from pretending to implement future lifecycle control while giving SPEC-009E and SPEC-013/SPEC-014 work a clear baseline.

**Independent Test**: Can be fully tested by inspecting the packet schema and artifacts for explicit deferred or not-available entries naming SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, SPEC-014A, SPEC-014B, SPEC-014C, and SPEC-014D where applicable.

**Acceptance Scenarios**:

1. **Given** the packet includes lifecycle fields that are outside SPEC-009D scope, **When** the packet is assembled, **Then** run, claim, retry, sync automation, sandbox, and adapter fields are marked deferred or not available with the owning future spec named.
2. **Given** future implementers inspect the packet, **When** they look for durable run-state or claim authority, **Then** the packet makes clear that SPEC-009D did not introduce those capabilities.

---

### User Story 4 - Reject Local-Only Lookalike Evidence (Priority: P4)

As an operator, I can distinguish real pilot evidence from a local-only lookalike task with no GitHub linkage or sync proof.

**Why this priority**: The pilot packet is only useful if it does not blur stored lifecycle evidence with unrelated local records that resemble the pilot shape.

**Independent Test**: Can be fully tested by attempting packet assembly against a local-only lookalike task and verifying the output marks it ineligible or incomplete because required GitHub linkage or sync proof is missing.

**Acceptance Scenarios**:

1. **Given** a task resembles the pilot lifecycle but lacks GitHub linkage, **When** packet assembly evaluates it, **Then** the task is not presented as the proven pilot.
2. **Given** a candidate packet has partial local evidence but no sync proof, **When** artifacts are published, **Then** the packet identifies the missing proof and does not claim pilot completion.

### Edge Cases

- Stored evidence exists for the root task but one lifecycle descendant is missing or superseded.
- A PR evidence record exists but has no owner gate or Aegis decision attached.
- The latest error exists only as compacted evidence with a preview and hash.
- Governance evidence is absent for a candidate task.
- Multiple candidate tasks resemble the pilot, but only one has GitHub linkage and sync proof.
- Source evidence contains sensitive values or oversized payloads.
- Future-state fields are requested before their owning SPEC-013 or SPEC-014 capabilities exist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST assemble a pilot review packet from stored Mission Control evidence without requiring fresh GitHub calls during packet assembly.
- **FR-002**: System MUST identify the real pilot packet candidate using stored GitHub issue linkage and sync proof before presenting it as pilot evidence.
- **FR-003**: System MUST include the GitHub issue, root task, lifecycle descendants, PR evidence, owner gate, Aegis decision, artifacts, governance evidence, latest error, and current stage when stored evidence is available.
- **FR-004**: System MUST represent missing stored evidence as not available, incomplete, or deferred with an explicit reason instead of inventing values.
- **FR-005**: System MUST publish a JSON packet artifact that contains the complete structured packet and source-map pointers for every evidence-backed claim.
- **FR-006**: System MUST publish a Markdown packet artifact that summarizes the same packet for PR reviewers and links or points to the underlying JSON artifact.
- **FR-007**: System MUST use existing task artifact persistence for the packet artifacts and MUST NOT require a new review-packet table or schema migration.
- **FR-008**: System MUST reuse existing evidence redaction and compaction behavior for secrets, oversized content, hashes, byte counts, previews, and security-scan state.
- **FR-009**: System MUST include explicit deferred or not-available entries for run-state, claim authority, retry controls, sync automation, sandbox lifecycle, adapter registry, and real harness execution where those fields are requested by the packet.
- **FR-010**: System MUST name the applicable owning future spec for deferred fields, including SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, SPEC-014A, SPEC-014B, SPEC-014C, and SPEC-014D where applicable.
- **FR-011**: System MUST preserve existing single-workspace behavior and avoid introducing broad operator UI or evidence dashboard scope.
- **FR-012**: System MUST expose packet retrieval only through an existing route, task-artifact seam, or other already-established review surface if such a seam cleanly fits.
- **FR-013**: System MUST make local-only lookalike candidates visibly ineligible or incomplete when GitHub linkage or sync proof is missing.
- **FR-014**: System MUST keep packet assembly bounded to the current pilot lifecycle and MUST NOT add automatic GitHub polling, webhook listeners, sync schedulers, durable run-state, claim authority, retry controls, sandbox lifecycle, adapter registry, or real harness execution.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Pilot Review Packet**: The reviewable lifecycle snapshot for the proven self-hosting pilot, including current stage, lifecycle sections, deferred fields, and source-map pointers.
- **Packet Artifact**: A persisted JSON or Markdown evidence artifact associated with the relevant task lifecycle and available for reviewer inspection.
- **Source Map Pointer**: A reference from a packet claim to the stored Mission Control evidence that supports it.
- **Pilot Candidate**: A task or lifecycle chain considered for packet assembly, eligible only when stored GitHub linkage and sync proof distinguish it from local-only lookalikes.
- **Deferred Field**: A packet field intentionally marked unavailable because its durable capability belongs to a future SPEC-013 or SPEC-014 feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can locate and inspect the pilot lifecycle packet in under 2 minutes without terminal logs.
- **SC-002**: 100% of evidence-backed packet claims include source-map pointers to stored Mission Control evidence.
- **SC-003**: The JSON and Markdown packet artifacts agree on all lifecycle section values in reviewer validation.
- **SC-004**: Packet assembly performs zero required fresh GitHub calls and succeeds using stored Mission Control evidence when required evidence is present.
- **SC-005**: Local-only lookalike candidates without GitHub linkage or sync proof are rejected or marked incomplete in 100% of validation cases.
- **SC-006**: 100% of future-state lifecycle fields requested by the packet are either evidence-backed or explicitly marked deferred/not available with the owning future spec named.

## Assumptions

- The proven pilot already has enough stored Mission Control evidence to assemble a meaningful packet.
- Stored GitHub linkage and sync proof are the authoritative signals for distinguishing the real pilot from local-only lookalikes.
- Packet artifacts belong with existing task artifact evidence rather than a new persistence model.
- The first version is reviewer-facing evidence, not a live operator dashboard.
- Future specs own durable run-state, claim authority, retry controls, sync automation, sandbox lifecycle, adapter registry, and harness execution.
