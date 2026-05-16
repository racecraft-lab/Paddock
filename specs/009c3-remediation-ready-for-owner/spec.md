# Feature Specification: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

**Feature Branch**: `009c3-remediation-ready-for-owner`  
**Created**: 2026-05-16  
**Status**: Draft  
**Input**: User description: "Execute the Mission Control Issue Remediation chain from remediation planning through dev implementation, review, Aegis approval, and the `ready_for_owner` gate for the linked PR-producing task."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Advance Approved Remediation To Owner Readiness (Priority: P1)

As an operator supervising the Mission Control pilot, I need a remediation chain that advances from planning to implementation, review, Aegis approval, and `ready_for_owner` only when every required gate has passed.

**Why this priority**: This is the core pilot proof for SPEC-009C3 and preserves the two-step terminal gate for SPEC-009C4.

**Independent Test**: Seed a pilot issue with a remediation-planning successor, advance the chain through plan evidence, deterministic PR linkage, dev verification, review `pass`, and Aegis `approved`, then verify the PR-producing `mission-control_dev_implementation` task owns the linked PR and is the only task moved to `ready_for_owner`.

**Acceptance Scenarios**:

1. **Given** a pilot remediation chain with a bounded remediation-planning task, **When** plan evidence, deterministic PR linkage, dev verification, review `pass`, Aegis `approved`, and advisory governance evidence are all present, **Then** the PR-producing dev task becomes `ready_for_owner`.
2. **Given** the chain reaches owner readiness, **When** the operator inspects task lineage, **Then** the root GitHub issue, remediation-plan task, PR-producing dev task, review verdict, Aegis approval, and linked PR remain traceable without making the root issue or review task the PR owner.
3. **Given** the dev task reaches `ready_for_owner`, **When** the operator inspects terminal state, **Then** no manual merge, GitHub merge observation, or `done` reconciliation has occurred in this spec.

---

### User Story 2 - Block Failed Review Before Aegis Or Owner Readiness (Priority: P2)

As a reviewer, I need a `fix` verdict to return or block remediation work before Aegis or owner readiness so flawed work cannot look ready for owner action.

**Why this priority**: Q1 requires review `pass` to advance and review `fix` to loop or block before Aegis/owner readiness.

**Independent Test**: Advance a PR-producing dev task to review, record a review `fix` verdict, and verify the task records review evidence while suppressing Aegis successors and `ready_for_owner`.

**Acceptance Scenarios**:

1. **Given** a PR-producing dev task is under review, **When** review records `fix`, **Then** the chain records the verdict and returns or blocks the dev task for remediation without creating Aegis readiness.
2. **Given** a review `fix` has been recorded, **When** the chain is retried with corrected dev verification and review `pass`, **Then** the chain may proceed toward Aegis without duplicating stale successors or losing prior verdict evidence.

---

### User Story 3 - Require Aegis Approval And Handle Rejection (Priority: P2)

As Aegis, I need approval to be the final readiness gate and rejection to create a bounded remediation loop so owner-ready state means final automated review actually passed.

**Why this priority**: Q5 requires Aegis proof through the existing quality-review surface, and Q9 requires Aegis `rejected` to loop or block before readiness.

**Independent Test**: Record Aegis reviewer outcomes against the PR-producing dev task and verify `approved` gates readiness while `rejected` records evidence and prevents `ready_for_owner`.

**Acceptance Scenarios**:

1. **Given** review has passed and all required artifacts are present, **When** Aegis records `approved` for the PR-producing dev task in the correct workspace, **Then** the task becomes eligible for `ready_for_owner`.
2. **Given** review has passed, **When** Aegis records `rejected`, **Then** rejection evidence is retained, owner readiness is blocked, and the dev task returns or remains available for bounded remediation.
3. **Given** an approval is missing, scoped to the wrong workspace, or not attributed to Aegis, **When** readiness is evaluated, **Then** the dev task does not become `ready_for_owner`.

---

### User Story 4 - Preserve Deterministic Evidence And Scope Boundaries (Priority: P3)

As a maintainer, I need validation evidence that is deterministic by default, explicit when live GitHub mutation is used, and narrow enough to avoid pulling later roadmap work into this slice.

**Why this priority**: Q3, Q4, Q6, Q7, Q8, and Q10 keep this slice compatible with existing workflow identity while deferring larger governance, run-state, merge, and evidence-UI work.

**Independent Test**: Run fixture validation and optional live-smoke documentation checks, then verify required artifacts and advisory governance evidence exist without broad slug migration, claim/run state, automatic GitHub sync, sandbox lifecycle, harness adapters, or a dedicated evidence UI.

**Acceptance Scenarios**:

1. **Given** automated validation runs, **When** it needs PR identity, **Then** it uses deterministic fixture-linked PR data and does not create or mutate a real GitHub PR.
2. **Given** an operator deliberately runs the live smoke path, **When** a real PR is used, **Then** the path is clearly opt-in, creates at most a draft PR, and records cleanup expectations.
3. **Given** remediation stages produce plan, dev verification, review, Aegis, and governance evidence, **When** a future review packet is assembled, **Then** the evidence is tied to both the root GitHub issue and the PR-producing dev task.
4. **Given** nomenclature could mislead operators about ownership, **When** copy is corrected, **Then** existing workflow slugs remain stable and only labels, prompts, or explanatory copy are tightened.

### Edge Cases

- Review `fix` must not create Aegis successors, owner-review successors, or owner-ready state even if the workflow has a static next-stage definition.
- Aegis `rejected` must not create owner-ready state or an owner packet that implies approval.
- Missing plan, dev verification, review verdict, Aegis approval, advisory governance evidence, or PR linkage must fail readiness closed.
- Governance evidence showing a resource-policy violation, blocked budget, or blocked window must prevent readiness.
- Repeated review/Aegis retries must remain bounded and must not duplicate stale successors or overwrite prior evidence needed for diagnosis.
- Fixture PR identity must not be accepted as live GitHub proof outside automated validation.
- The live draft PR smoke path must be explicit and operator-initiated; it must not run as part of ordinary automated tests.
- Existing operator surfaces must remain accurate if they display the ready-for-owner state or stage evidence, but a dedicated pilot evidence UI is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST keep the `mission-control_dev_implementation` task as the owner of the linked PR and as the only task that may reach `ready_for_owner` for this remediation chain (Q2).
- **FR-002**: The system MUST require durable remediation-plan evidence before the PR-producing dev task can advance into implementation evidence or readiness evaluation (Q7).
- **FR-003**: The system MUST require deterministic PR linkage and dev verification evidence on the PR-producing dev task before review can produce owner-readiness eligibility (Q2, Q6, Q7).
- **FR-004**: The system MUST treat review `pass` as eligible to continue toward Aegis only when required plan, PR linkage, dev verification, and review-verdict evidence are present (Q1, Q7).
- **FR-005**: The system MUST treat review `fix` as a loop or block that records verdict evidence and prevents Aegis advancement, owner-review advancement, and `ready_for_owner` state (Q1).
- **FR-006**: The system MUST allow corrected work after review `fix` to proceed through review again without duplicating stale successors or losing prior review evidence (Q1).
- **FR-007**: The system MUST prove Aegis approval through the existing quality-review record for reviewer `aegis`, scoped to the same workspace as the PR-producing dev task (Q5).
- **FR-008**: The system MUST require Aegis `approved` before the PR-producing dev task can reach `ready_for_owner` (Q5).
- **FR-009**: The system MUST treat Aegis `rejected` as a bounded loop or block that records rejection evidence and prevents owner-ready state (Q9).
- **FR-010**: The system MUST require stage-scoped artifacts for remediation plan, dev verification, review verdict, and Aegis approval, each traceable to the root GitHub issue and the PR-producing dev task (Q7).
- **FR-011**: The system MUST record advisory governance evidence for remediation stages and verify no resource-policy violation, blocked budget result, or blocked window result exists before readiness (Q4).
- **FR-012**: The system MUST keep advisory governance evidence within the current evidence model and MUST NOT introduce durable run-state, claim authority, runner state, or control-plane tables for this slice (Q4, Q8).
- **FR-013**: Automated validation MUST use deterministic fixture-linked PR identity and MUST NOT create, update, or merge a real GitHub PR (Q6).
- **FR-014**: Any live GitHub PR smoke path MUST be explicit, operator-initiated, draft-only before SPEC-009C4, and documented with cleanup expectations (Q6).
- **FR-015**: Existing workflow slugs MUST remain stable; nomenclature cleanup MAY change only labels, prompts, or copy that mislead ownership (Q3).
- **FR-016**: The system MUST NOT perform manual merge observation, GitHub merge reconciliation, or `ready_for_owner` to `done` transition in SPEC-009C3 (Q2, Q6).
- **FR-017**: The system MUST NOT introduce automatic GitHub sync polling, retry/debug control-plane UI, sandbox lifecycle, harness adapter execution, full SpecKit/SDD execution lanes, or dedicated pilot remediation progress UI in this slice (Q4, Q9, Q10).
- **FR-018**: If an existing operator surface displays ready-for-owner or evidence state, the system MUST keep that surface accurate for the PR-producing dev task without adding a new dedicated evidence UI (Q10).
- **FR-019**: Roadmap/status evidence MUST reaffirm that remaining durable governance, run-state, claim, control-plane, review-packet, evidence-UI, and merge-reconciliation work belongs to later specs (Q8).

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Root GitHub Issue**: The original pilot tracker item that remains traceable through remediation planning, dev implementation, review, Aegis, and later owner reconciliation.
- **Remediation Plan Task**: The bounded successor created by SPEC-009C2 that captures the plan for resolving the issue.
- **PR-Producing Dev Task**: The `mission-control_dev_implementation` task that owns the linked repository and PR number and becomes `ready_for_owner` when all gates pass.
- **Review Verdict**: A stage decision of `pass` or `fix` with evidence tied to the PR-producing dev task.
- **Aegis Quality Review**: A reviewer-scoped approval or rejection by `aegis` tied to the PR-producing dev task and workspace.
- **Stage Artifact**: Durable evidence for remediation plan, dev verification, review verdict, or Aegis approval, linked back to the root issue and PR-producing dev task.
- **Advisory Governance Evidence**: Evidence that remediation stages have no resource-policy violation and no blocked budget/window result, without adding formal claim or run-state authority.
- **Deterministic Fixture PR Identity**: Test-only PR identity used for repeatable automated validation.
- **Opt-In Live Draft PR Smoke**: Operator-initiated smoke path that may use a real draft PR without merging or reconciling completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In fixture validation, 100% of happy-path remediation chains reach `ready_for_owner` only on the PR-producing dev task after plan, dev verification, review `pass`, Aegis `approved`, governance evidence, and PR linkage are present.
- **SC-002**: 100% of review `fix` scenarios record review evidence and prevent Aegis advancement and `ready_for_owner`.
- **SC-003**: 100% of Aegis `rejected` scenarios record rejection evidence and prevent `ready_for_owner`.
- **SC-004**: 100% of readiness attempts without Aegis reviewer `aegis` approval in the correct workspace are rejected.
- **SC-005**: 100% of required stage evidence classes are inspectable for a successful chain: remediation plan, dev verification, review verdict, Aegis approval, and advisory governance evidence.
- **SC-006**: Automated validation creates zero real GitHub PRs and performs zero GitHub merge or `done` reconciliation actions.
- **SC-007**: Existing workflow slugs remain unchanged across SPEC-009C3 validation, with any nomenclature changes limited to non-slug labels, prompts, or copy.
- **SC-008**: No new durable claim-state, run-state, sandbox lifecycle, harness adapter, automatic GitHub sync poller, or dedicated evidence-UI surface is introduced by this spec.
- **SC-009**: Operator smoke documentation distinguishes deterministic fixture validation from explicit live draft PR smoke and identifies cleanup expectations before live execution.

## Assumptions

- SPEC-009C2 has already created a bounded Issue Remediation planning successor for an actionable pilot issue.
- SPEC-009C4 owns manual merge observation and `ready_for_owner` to `done` reconciliation.
- SPEC-009D and SPEC-009E own pilot review packet assembly and durable operator evidence surfaces.
- Later governance/control-plane specs own durable run-state, claim authority, automatic sync polling, sandbox lifecycle, harness adapters, and full SpecKit/SDD execution lanes.
- Existing Mission Control evidence, status, review, artifact, activity, and governance surfaces are sufficient for this bounded slice.
- The live PR smoke path is not part of routine automated validation and is run only by an operator who accepts the external GitHub side effect.
