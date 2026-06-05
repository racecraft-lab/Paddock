# Feature Specification: Product Line B Onboarding Smoke

**Feature Branch**: `010b-product-line-b-smoke`
**Created**: 2026-06-05
**Status**: Draft
**Input**: User description: "Create the smallest reviewable Product Line B onboarding smoke that proves disabled-by-default seeding, explicit enablement, one synthetic Paddock issue smoke, clean disablement, and Product Line A isolation without touching active harness-adapter work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preflight Without Mutation (Priority: P1)

As an operator, I can preflight Product Line B before any write and receive a clear no-mutation proof so I know the target is ready and Product Line A will not be disturbed.

**Why this priority**: This is the safety gate for the entire smoke path. The operator must be able to stop before any state change if residue, ownership conflicts, or unsafe retained identities are detected.

**Independent Test**: Can be fully tested by running the Product Line B preflight on a target with existing Product Line A state, reviewing the before/after proof, and confirming the result records that no Product Line B writes occurred.

**Acceptance Scenarios**:

1. **Given** a target with Product Line A active and Product Line B absent or disabled, **When** the operator runs preflight, **Then** the result reports readiness, no target mutation, and the exact baseline used for later isolation proof.
2. **Given** retained FocusEngine or OpenClaw identities are present but not explicitly assigned to Product Line B, **When** preflight inspects the target, **Then** those identities are reported as retained inventory and are not treated as Product Line B resources.

---

### User Story 2 - Seed Disabled Product Line B (Priority: P1)

As an operator, I can seed Product Line B disabled by default and inspect its isolated workspace, project, and agent assignment shape before any smoke is enabled.

**Why this priority**: The feature must prove a second product line can exist safely before it processes any issue-shaped work.

**Independent Test**: Can be fully tested by applying the Product Line B seed after a passing preflight, inspecting the created Product Line B shape, and confirming it is disabled until the operator explicitly enables it.

**Acceptance Scenarios**:

1. **Given** preflight passed, **When** the operator seeds Product Line B, **Then** the target contains `product-line-b`, display name `Product Line B`, and agent prefix `plb-platform`.
2. **Given** Product Line B has just been seeded, **When** the operator inspects product-line status, **Then** Product Line B is disabled, Product Line A remains enabled as before, and no smoke work is eligible to run for Product Line B.

---

### User Story 3 - Enable, Smoke, And Disable (Priority: P2)

As an operator, I can explicitly enable Product Line B for one synthetic Paddock issue smoke, verify the issue-shaped path stays scoped to Product Line B, and disable Product Line B cleanly afterward.

**Why this priority**: This is the smallest behavior proof that Product Line B can move through the existing pilot path without requiring a live external issue write or new runtime authority.

**Independent Test**: Can be fully tested by enabling Product Line B, processing one synthetic issue using `racecraft-lab/Paddock` metadata, recording the Product Line B scoped evidence, disabling Product Line B, and verifying no further Product Line B smoke work can run.

**Acceptance Scenarios**:

1. **Given** Product Line B is seeded and disabled, **When** the operator explicitly enables it for smoke, **Then** exactly one Product Line B synthetic issue is eligible for the smoke path.
2. **Given** the synthetic issue uses `racecraft-lab/Paddock` metadata, **When** the smoke runs, **Then** required evidence is produced without requiring a live GitHub issue write.
3. **Given** the smoke evidence has been recorded, **When** the operator disables Product Line B, **Then** Product Line B is no longer eligible for smoke work and Product Line A behavior remains unchanged.

---

### User Story 4 - Prove Product Line A Isolation (Priority: P2)

As a maintainer, I can review evidence proving Product Line A records, metrics, tasks, and sync ownership were not changed by Product Line B onboarding or smoke activity.

**Why this priority**: The feature exists to prove two-product-line isolation. Review is not complete unless Product Line A non-interference is visible and testable.

**Independent Test**: Can be fully tested by comparing Product Line A baseline evidence from preflight with evidence after seed, smoke, disablement, and cleanup.

**Acceptance Scenarios**:

1. **Given** Product Line A baseline evidence exists, **When** Product Line B seed and smoke complete, **Then** Product Line A ownership and activity evidence matches the baseline except for explicitly read-only inspection timestamps or logs.
2. **Given** a Product Line B operation would change Product Line A ownership, task state, sync ownership, or metrics, **When** the operation is evaluated, **Then** the workflow stops and reports the Product Line A isolation violation.

---

### User Story 5 - Preserve Evidence For Future Gardening (Priority: P3)

As a future harness-gardening implementer, I can use the Product Line B evidence packet as real two-product-line input without replaying hidden setup assumptions.

**Why this priority**: SPEC-012B needs durable evidence from a real second product line. This story keeps the smoke small while making the output reusable.

**Independent Test**: Can be fully tested by reviewing the evidence packet and confirming it contains preflight, seed, enablement, synthetic issue smoke, disablement, cleanup, Product Line A isolation, timing, and scope-boundary entries.

**Acceptance Scenarios**:

1. **Given** the smoke has completed, **When** a maintainer opens the evidence packet, **Then** each smoke phase is identifiable, timestamped or operator-recorded, and tied to Product Line B identity.
2. **Given** a future implementer needs two-product-line drift or cleanup input, **When** they review the packet, **Then** the packet states which assumptions were proven, which follow-up behavior remains out of scope, and which active adapter files were intentionally avoided.

### Edge Cases

- Product Line B preflight detects existing `product-line-b` residue or conflicting `plb-platform` assignments; the workflow stops before mutation and reports the residue.
- Retained FocusEngine or OpenClaw identities are present; they remain retained inventory and are not reused unless a later spec explicitly generalizes and assigns them.
- Product Line B seed or smoke would change Product Line A ownership, task state, sync ownership, or metrics; the workflow stops and reports the isolation violation.
- A live GitHub write is unavailable or undesired; the required smoke remains valid with synthetic `racecraft-lab/Paddock` metadata.
- Product Line B remains enabled after smoke or cleanup fails; the workflow reports incomplete disablement and does not claim closeout.
- The implementation would require scheduler, runner, sandbox, harness-adapter, or auto-merge behavior; that work is rejected as out of scope for this spec.
- The operator cannot complete the manual smoke checklist in under one operator-hour; timing evidence records the miss and the PR review packet explains the cause.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Product Line B preflight that can run before any Product Line B write.
- **FR-002**: Preflight MUST produce a no-mutation proof by recording comparable target evidence before and after the preflight.
- **FR-003**: Preflight MUST detect and report Product Line B residue, conflicting `plb-platform` assignments, and retained FocusEngine or OpenClaw identities without changing them.
- **FR-004**: System MUST seed Product Line B with canonical identity `product-line-b`, display name `Product Line B`, and agent prefix `plb-platform`.
- **FR-005**: Product Line B MUST be disabled by default immediately after seed.
- **FR-006**: Operators MUST be able to inspect Product Line B workspace, project, and agent assignment shape separately from Product Line A.
- **FR-007**: Operators MUST explicitly enable Product Line B before any Product Line B smoke work becomes eligible.
- **FR-008**: The smoke MUST use one synthetic issue-shaped item with `racecraft-lab/Paddock` metadata and Product Line B labeling.
- **FR-009**: Required implementation evidence MUST NOT depend on creating, editing, or deleting a live GitHub issue.
- **FR-010**: The smoke MUST process the synthetic issue only through already-proven pilot behavior and MUST NOT introduce new workflow language, scheduler authority, claim/retry authority, runner state, sandbox lifecycle, harness-adapter behavior, or auto-merge behavior.
- **FR-011**: Product Line B smoke MUST use Paddock-owned fake or harness identities and MUST NOT reuse FocusEngine or OpenClaw identities unless a later explicit decision generalizes and assigns them.
- **FR-012**: System MUST disable Product Line B after the smoke and prove that no further Product Line B smoke work is eligible.
- **FR-013**: System MUST preserve Product Line A isolation evidence across preflight, seed, enablement, smoke, disablement, and cleanup.
- **FR-014**: The evidence packet MUST include preflight, seed, enablement, synthetic issue smoke, disablement, cleanup, Product Line A isolation, timing, and scope-boundary entries.
- **FR-015**: Required review evidence MUST identify the proving check for each changed behavior and state whether the check was observed before the behavior was accepted or already covered by existing behavior.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec, `specs/010b-product-line-b-smoke`, is excluded from same-run archival and cleanup.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated screenshots or binary artifacts are CI or review artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-010B evidence must remain reviewable as text or structured records unless a manifest-backed exception is explicitly recorded.

### Reviewability Budget *(mandatory)*

- **Primary surface**: seed/config
- **Secondary surfaces, if any**: docs/process; narrowly scoped smoke evidence
- **Projected reviewable LOC**: 450-700 lines excluding generated, lock, vendor, and evidence output artifacts
- **Projected production files**: 4-6 files
- **Projected total files**: 8-12 files including spec, plan, tests, fixtures, docs, and evidence packet updates
- **Budget result**: within budget
- **Split decision**: This remains one spec because it is a bounded onboarding smoke for a disabled generic product line. Any scheduler, runner, sandbox, harness-adapter, auto-merge, live GitHub mutation, FocusEngine assignment, or broad dashboard work must become a separate follow-up spec.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order,
  scope budget, traceability, verification evidence, known gaps, and rollback
  or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed
  files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.
- PR review packet MUST call out the Product Line A isolation proof, Product Line B disablement proof, and the fact that live GitHub writes are optional evidence only.
- PR review packet MUST identify any files intentionally avoided to remain disjoint from active harness-adapter work.

### Key Entities

- **Product Line B**: The generic second product line with identity `product-line-b`, display name `Product Line B`, disabled-by-default state, and `plb-platform` agent prefix.
- **Product Line B Smoke Item**: A single synthetic issue-shaped item using `racecraft-lab/Paddock` metadata and Product Line B labels to prove scoped pilot behavior without requiring a live external issue write.
- **Product Line Assignment Shape**: The workspace, project, and agent assignment relationship that shows Product Line B is isolated from Product Line A.
- **Product Line A Isolation Baseline**: The comparable evidence captured before Product Line B writes and used to prove Product Line A ownership, task state, sync ownership, and metrics remain unchanged.
- **Smoke Evidence Packet**: The durable review record covering preflight, seed, enablement, smoke, disablement, cleanup, timing, scope boundaries, and follow-up assumptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Preflight completes with a no-mutation proof and either a ready result or a residue/conflict stop result in under 15 operator minutes on a disposable or HAL-like target.
- **SC-002**: After seeding, Product Line B is visible with identity `product-line-b`, display name `Product Line B`, agent prefix `plb-platform`, and disabled state in 100% of required inspection evidence.
- **SC-003**: Exactly one Product Line B synthetic issue-shaped item can be enabled, smoked, and recorded without requiring any live GitHub issue mutation.
- **SC-004**: Product Line A isolation evidence shows zero Product Line B-caused changes to Product Line A ownership, task state, sync ownership, and product-line metrics.
- **SC-005**: Product Line B disablement proof shows zero remaining eligible Product Line B smoke work after the smoke.
- **SC-006**: The operator-recorded smoke checklist can be completed in less than one operator-hour, excluding optional live GitHub UAT evidence.
- **SC-007**: A maintainer can trace every required Product Line B evidence phase to the smoke evidence packet and PR review packet without rerunning setup assumptions.

## Assumptions

- SPEC-010A generic product-line seeding behavior is the starting point and should be reused wherever it already satisfies Product Line B needs.
- Product Line A is the existing active Paddock product line and remains the isolation baseline.
- Product Line B is intentionally generic; FocusEngine and OpenClaw retained identities are not Product Line B for this spec.
- The required smoke uses synthetic `racecraft-lab/Paddock` issue metadata; live GitHub issue creation is optional HAL UAT evidence only.
- Paddock-owned fake or harness identities are sufficient for the smallest pilot smoke, and active harness-adapter work remains file-disjoint.
- The manual "<1 operator-hour" target is checklist-only and operator-recorded.
- Follow-up harness gardening can consume the evidence packet, but this spec does not implement SPEC-012B behavior.
