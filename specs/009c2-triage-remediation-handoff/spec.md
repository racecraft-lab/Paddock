# Feature Specification: Triage-to-Remediation Plan Handoff

**Feature Branch**: `009c2-triage-remediation-handoff`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "Create the SPEC-009C2 specification for the Mission Control self-hosting pilot handoff from Issue Triage to Issue Remediation planning. The spec must require the eligible SPEC-009C1 GitHub-linked pilot issue to be driven through the Issue Triage workflow family. If triage returns `ACTIONABLE_REMEDIATION`, the system must create exactly one Issue Remediation planning successor through the existing task-chain helper. If triage returns a non-remediation outcome, the system must persist evidence and must not create a remediation successor. Goals include typed Issue Triage output, workflow-contract routing correction, existing task-chain reuse, durable evidence, duplicate prevention, fresh SPEC-009C2 synthetic manual UAT, cleanup, and SPEC-009F roadmap coverage. Non-goals exclude remediation execution, owner reconciliation, review packets, evidence UI, GitHub sync cron/poller automation, production non-remediation routing lanes, claim authority, runner state, sandbox lifecycle, harness adapters, and live GitHub mutation from automated tests or normal app runtime."

## Clarifications

### Session 2026-05-15

- Q: What exact disposition values must Issue Triage emit for the pilot?
  A: The pilot taxonomy is uppercase and closed:
  `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`,
  `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`. SPEC-009C2 may extend
  disposition validation to accept this pilot taxonomy while preserving the
  existing SPEC-007 lowercase disposition values for non-pilot templates.
- Q: How does `ACTIONABLE_REMEDIATION` create the next task?
  A: The repo-owned Mission Control workflow contract must route only
  `ACTIONABLE_REMEDIATION` to `mission-control_remediation_plan` through the
  existing task-chain routing and successor creation path. The Issue Triage
  template must not use a static fallback successor for negative outcomes.
- Q: Which records prove the handoff or clean exit?
  A: The accepted triage task is the evidence anchor. It must have
  task-scoped disposition evidence, task-scoped artifact evidence, and
  task-scoped activity evidence. Successor proof uses child `tasks` rows for the
  triage task, and side-effect checks must scope `activities` to
  `entity_type='task'` so unrelated pipeline or remediation entities cannot
  create false positives.
- Q: What synthetic issue should manual UAT use?
  A: Manual UAT must create or explicitly select a fresh SPEC-009C2 synthetic
  issue, distinct from closed SPEC-009C1 issues. The preferred title pattern is
  `[mc-pilot] SPEC-009C2 synthetic e2e issue YYYY-MM-DD clean run`, with
  `mc:inbox`, one `priority:*` label, and exactly one routable `area:*` label.
- Q: What remains outside this spec?
  A: SPEC-009F owns production routing and evidence for non-remediation triage
  outcomes. SPEC-013A1 owns automatic GitHub sync cron/poller lifecycle. This
  spec records evidence for future lanes but must not start those lanes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Actionable Triage to Planning (Priority: P1)

As a Mission Control operator running the self-hosting pilot, I need an eligible SPEC-009C1 GitHub-linked pilot issue to move from Issue Triage into Issue Remediation planning when triage concludes the issue is actionable, so the pilot can continue without manual task reconstruction.

**Why this priority**: This is the core handoff that enables SPEC-009C3 and proves the pilot can convert triaged GitHub issue work into a remediation planning task.

**Independent Test**: Can be fully tested by submitting a pilot triage result of `ACTIONABLE_REMEDIATION` for the eligible GitHub-linked issue and verifying that exactly one remediation-planning successor exists with durable triage evidence.

**Acceptance Scenarios**:

1. **Given** an eligible SPEC-009C1 GitHub-linked pilot issue is awaiting Issue Triage completion, **When** triage records `ACTIONABLE_REMEDIATION`, **Then** exactly one Issue Remediation planning successor is created for that pilot issue.
2. **Given** the actionable triage handoff succeeds, **When** an operator reviews the pilot history, **Then** the triage disposition, supporting artifact, and activity evidence explain why remediation planning was created.
3. **Given** the actionable handoff has already created a remediation-planning successor, **When** the same triage result is processed again, **Then** no second remediation-planning successor is created.

---

### User Story 2 - Exit Non-Remediation Triage Cleanly (Priority: P2)

As a Mission Control operator, I need duplicate, obsolete, invalid, needs-human, needs-specialist, and `NEEDS_SPEC` triage outcomes to stop without launching remediation planning, so the pilot does not create inappropriate work.

**Why this priority**: Negative-path safety prevents false remediation work and keeps future routing lanes out of SPEC-009C2.

**Independent Test**: Can be fully tested by processing each non-remediation triage outcome and verifying zero remediation-planning successors plus reviewable disposition, artifact, and activity evidence for each outcome.

**Acceptance Scenarios**:

1. **Given** Issue Triage returns `DUPLICATE`, `OBSOLETE`, or `INVALID`, **When** the result is accepted, **Then** no remediation-planning successor is created and the outcome is visible in durable evidence.
2. **Given** Issue Triage returns `NEEDS_HUMAN` or `NEEDS_SPECIALIST`, **When** the result is accepted, **Then** no remediation-planning successor is created and the evidence makes the required future attention clear.
3. **Given** Issue Triage returns `NEEDS_SPEC`, **When** the result is accepted, **Then** no SpecKit, SDD, or remediation lane is launched in this spec and the evidence preserves the future-lane intent.

---

### User Story 3 - Preserve Canonical Workflow Contract Routing (Priority: P3)

As a workflow maintainer, I need the Mission Control workflow contract to define the pilot Issue Triage taxonomy and the `ACTIONABLE_REMEDIATION` routing target, so imported, applied, and exported workflow definitions stay consistent.

**Why this priority**: The handoff must be driven by the repo-owned workflow contract rather than a one-off pilot path.

**Independent Test**: Can be fully tested by validating that the workflow contract exposes the canonical triage taxonomy, routes `ACTIONABLE_REMEDIATION` to `mission-control_remediation_plan`, and preserves stable contract parity after import, apply, and export.

**Acceptance Scenarios**:

1. **Given** the repo-owned workflow contract is imported and applied, **When** Issue Triage output is inspected, **Then** it exposes `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
2. **Given** the repo-owned workflow contract is exported after application, **When** parity is checked, **Then** prompt, schema, and routing identity remain stable.
3. **Given** a triage result uses an unknown or unsupported disposition, **When** the result is evaluated, **Then** remediation planning is not created and the failure is visible for operator review.

---

### User Story 4 - Prove Live Pilot Smoke and Cleanup (Priority: P4)

As a pilot operator, I need a fresh SPEC-009C2 synthetic GitHub issue for manual UAT and a cleanup record afterward, so the live smoke proves the handoff without leaving test dirt behind.

**Why this priority**: Manual smoke is required to validate the pilot path against the tracker of record while keeping automated tests deterministic and secret-free.

**Independent Test**: Can be fully tested by following the pilot smoke checklist for a fresh SPEC-009C2 synthetic issue, recording the handoff result, and confirming cleanup of disposable tracker and Mission Control evidence.

**Acceptance Scenarios**:

1. **Given** the operator prepares manual UAT, **When** the smoke checklist is followed, **Then** it uses a fresh SPEC-009C2 synthetic issue rather than the closed SPEC-009C1 synthetic issue.
2. **Given** manual UAT completes, **When** cleanup is recorded, **Then** the synthetic issue and disposable Mission Control rows are either removed, closed, or explicitly documented as retained evidence.

### Edge Cases

- A triage result is missing, malformed, or uses a disposition outside the canonical taxonomy.
- The remediation-planning successor already exists for the same pilot issue and triage stage.
- A disposition is valid but its supporting artifact or activity evidence cannot be persisted.
- The remediation-planning workflow destination is absent or not available to the task-chain helper.
- A non-remediation result includes language that looks actionable but carries a negative disposition.
- `NEEDS_SPEC` is returned before the future SpecKit/SDD lane exists.
- Manual smoke encounters an existing synthetic issue with a similar title from an earlier run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST treat GitHub issues as the v1 tracker of record for SPEC-009C2 pilot issue identity.
- **FR-002**: System MUST use the SPEC-009C1 eligible GitHub-linked pilot issue as the input work item for the Issue Triage handoff.
- **FR-003**: System MUST require Issue Triage output to use this canonical disposition taxonomy: `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
- **FR-004**: System MUST reject or fail closed for missing, malformed, unknown, or unsupported Issue Triage dispositions.
- **FR-005**: System MUST route `ACTIONABLE_REMEDIATION` to Issue Remediation planning and no other remediation execution stage.
- **FR-006**: System MUST create the `ACTIONABLE_REMEDIATION` remediation-planning successor through the existing task-chain validation and successor-creation behavior.
- **FR-007**: System MUST create no more than one remediation-planning successor for the same pilot issue and handoff stage.
- **FR-008**: System MUST make duplicate or repeated actionable handoff attempts idempotent by preserving the existing successor rather than creating another one.
- **FR-009**: System MUST persist durable disposition evidence for both actionable and non-remediation triage outcomes.
- **FR-010**: System MUST persist durable artifact evidence for both actionable and non-remediation triage outcomes.
- **FR-011**: System MUST persist durable activity evidence that lets an operator understand the accepted triage outcome without reconstructing terminal history.
- **FR-012**: System MUST create zero remediation-planning successors for `DUPLICATE`, `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
- **FR-013**: System MUST NOT start SpecKit, SDD, human clarification, specialist assignment, close automation, or any other future non-remediation routing lane for `NEEDS_SPEC` or other non-remediation dispositions in this spec.
- **FR-014**: System MUST ensure the repo-owned Mission Control workflow contract defines the pilot Issue Triage output taxonomy and routes `ACTIONABLE_REMEDIATION` to `mission-control_remediation_plan`.
- **FR-015**: System MUST preserve workflow-contract import, apply, export, and parity evidence for the changed Issue Triage schema and routing behavior.
- **FR-016**: System MUST keep automated tests and normal application runtime free of live GitHub mutation for this feature.
- **FR-017**: System MUST require manual UAT to use a fresh SPEC-009C2 synthetic issue and record cleanup of synthetic GitHub and disposable Mission Control data.
- **FR-018**: System MUST record SPEC-009F as the future production routing and evidence owner for non-remediation triage outcomes.
- **FR-019**: System MUST NOT implement remediation development, review, Aegis approval, `ready_for_owner`, owner merge/done reconciliation, review packets, production evidence UI, automatic GitHub sync cron/poller lifecycle, claim authority, runner state, sandbox lifecycle, or harness adapter behavior in SPEC-009C2.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Pilot Issue**: The GitHub-linked work item selected by SPEC-009C1 eligibility and used as the tracker-of-record input to Issue Triage.
- **Triage Disposition**: The canonical classification emitted by Issue Triage to determine whether remediation planning is created or the pilot exits cleanly.
- **Remediation Planning Successor**: The single planning task created only for `ACTIONABLE_REMEDIATION` through the existing task-chain behavior.
- **Disposition Evidence**: The durable record of the accepted triage outcome and why it did or did not create a successor.
- **Artifact Evidence**: The durable supporting payload or summary attached to the triage decision for later operator review.
- **Activity Evidence**: The timeline-visible record that the handoff or clean exit occurred.
- **Workflow Contract**: The repo-owned definition of Issue Triage output shape and routing behavior that must remain canonical across import, apply, and export.
- **Synthetic Smoke Issue**: The fresh SPEC-009C2 GitHub issue used only for manual UAT and then cleaned up or explicitly retained as evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of accepted `ACTIONABLE_REMEDIATION` pilot triage results create exactly one Issue Remediation planning successor.
- **SC-002**: Reprocessing the same accepted `ACTIONABLE_REMEDIATION` pilot triage result creates zero additional remediation-planning successors.
- **SC-003**: 100% of accepted non-remediation dispositions create zero remediation-planning successors.
- **SC-004**: 100% of accepted actionable and non-remediation triage outcomes include disposition, artifact, and activity evidence visible to an operator.
- **SC-005**: 100% of unsupported, missing, or malformed triage dispositions fail closed without creating a remediation-planning successor.
- **SC-006**: The workflow contract exposes all 7 canonical pilot triage dispositions and routes only `ACTIONABLE_REMEDIATION` to `mission-control_remediation_plan`.
- **SC-007**: Workflow-contract import, apply, and export checks preserve stable prompt, schema, and routing identity for the changed Issue Triage contract.
- **SC-008**: Manual UAT uses 1 fresh SPEC-009C2 synthetic issue and records cleanup or intentional evidence retention for 100% of synthetic tracker and Mission Control data it creates.
- **SC-009**: SPEC-009C2 implementation adds 0 production routes for non-remediation future lanes, 0 cron or poller lifecycle changes, 0 claim or runner state changes, 0 sandbox lifecycle changes, and 0 harness adapter changes.
- **SC-010**: Roadmap coverage identifies SPEC-009F as the future owner for production routing and evidence of non-remediation triage outcomes.

## Assumptions

- SPEC-009C1 has already identified an eligible GitHub-linked pilot issue for Issue Triage.
- Issue Triage remains the classifier for inbound pilot work, while Issue Remediation remains only for actionable remediation planning in this spec.
- `NEEDS_SPEC` is a separate future SDD lane and is not equivalent to Issue Remediation.
- Existing task-chain behavior can enforce successor creation, routing validation, and duplicate prevention without introducing a bespoke pilot handoff path.
- Existing disposition, artifact, and activity evidence surfaces are sufficient for SPEC-009C2 operator review unless later planning proves a specific gap.
- Automated verification is fixture-driven and deterministic; live GitHub mutation is limited to manual UAT instructions.
- The SPEC-009C2 manual smoke issue is newly created or clearly distinguished from prior synthetic issues before use.
- Production non-remediation routing and evidence work is deferred to SPEC-009F.
