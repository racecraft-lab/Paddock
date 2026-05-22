# Feature Specification: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

**Feature Branch**: `009c3-remediation-ready-for-owner`  
**Created**: 2026-05-16  
**Status**: Completed
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
- Missing plan, dev verification, review verdict, Aegis approval, advisory governance evidence, or PR linkage must fail the SPEC-009C3 happy-path readiness proof closed.
- Required stage artifact publish or supersede failure must be recorded durably and must fail readiness closed until the artifact is successfully written or linked/superseded onto the PR-producing dev task.
- Governance evidence showing a resource-policy violation, blocked budget, or blocked window must prevent readiness.
- Repeated review/Aegis retries must remain bounded and must not duplicate stale successors or overwrite prior evidence needed for diagnosis.
- Fixture PR identity must not be accepted as live GitHub proof outside automated validation.
- Any blocked SPEC-009C3 readiness attempt must create no owner-ready side effects: no `ready_for_owner` status write, owner-ready notification, `task_ready_for_owner` activity, outbound ready-for-owner sync, Aegis/owner-review successor, or owner packet.
- The live draft PR smoke path must be explicit and operator-initiated; it must not run as part of ordinary automated tests, and missing draft identity, non-draft identity, unexpected live mutation, or missing cleanup evidence must fail the smoke proof closed.
- Existing operator surfaces must remain accurate if they display the ready-for-owner state or stage evidence, but a dedicated pilot evidence UI is out of scope.

## Clarifications

### Session 2026-05-16 - Review and Aegis Loop Semantics

- Review `pass` routes directly toward the Aegis approval gate for the PR-producing `mission-control_dev_implementation` task in SPEC-009C3. It MUST NOT create or require a `mission-control_owner_review` successor on the C3 happy path.
- `mission-control_owner_review` remains a stable workflow slug for seeded-contract compatibility, but it is not the owner-ready task and does not own the linked PR in this slice.
- Review `fix` records verdict evidence and loops or blocks before Aegis, owner-review, or `ready_for_owner` state. Corrected work may re-enter review without duplicating stale successors or losing prior verdict evidence.
- Review-domain verdicts preserve `pass`/`fix` vocabulary in artifacts and workflow output; existing quality-review status vocabulary remains `approved`/`rejected` where the current API/schema requires it.
- The PR-producing dev template must be eligible for the existing ready-for-owner transition guard by preserving PR-producing status and explicit external terminal semantics; Aegis approval evidence is tied to that dev task.
- Aegis `rejected` reuses existing bounded Aegis review behavior: rejected review evidence, activity/comment evidence, reassignment for bounded retry, and failure after the existing retry ceiling. No claim-state, run-state, or new control-plane table is introduced.
- Required evidence stays in existing `task_artifacts`, `quality_reviews`, `activities`, and resource-governance evidence surfaces. SPEC-009C3 may define artifact types/schema versions such as `remediation_plan`, `dev_verification`, `review_verdict`, `aegis_approval`, and `governance_evidence`.
- Review-verdict and Aegis-approval evidence that gates `ready_for_owner` MUST target the PR-producing `mission-control_dev_implementation` task as the readiness subject. Downstream helper slugs may exist for compatibility or stage outputs, but they MUST NOT become the PR owner, owner-ready task, or authoritative Aegis approval target for SPEC-009C3.
- SPEC-009C3 MUST NOT change the shared SPEC-005 `ready_for_owner` transition semantics. For the SPEC-009C3 remediation pilot only, missing `github_repo` or `github_pr_number` on the PR-producing dev task is a fail-closed C3 success condition: fixture validation, optional live smoke, and the C3 happy path MUST NOT count the chain as successfully owner-ready unless deterministic PR linkage is present before Aegis approval advances the task.
- The repo-owned Mission Control workflow contract must make the dev implementation template explicit about merge-gated PR semantics by preserving `produces_pr` and declaring `external_terminal_event: github_pr_merged`.
- Root issue traceability and PR ownership remain separate: the root task keeps GitHub issue identity, the dev task owns repository/PR identity, and artifacts record both root issue context and dev-task PR context without making helper tasks the PR owner.
- Required SPEC-009C3 readiness artifacts are evaluated against the PR-producing `mission-control_dev_implementation` task as the readiness subject. `dev_verification`, `review_verdict`, `aegis_approval`, and the readiness-evaluated `remediation_plan` evidence MUST be attached to that dev task or linked/superseded onto it before readiness evaluation. Helper tasks may produce stage outputs, but duplicated artifact bodies are not separate canonical evidence.
- Required stage artifact payloads use `storage_kind='inline_json'`, `mime='application/json'`, and a compact `schema_version='spec-009c3.v1'` envelope containing `artifact_type`, `stage`, `produced_at`, `producer_task_id`, `workspace_id`, `root_issue`, `pr_dev_task`, and a bounded `summary`.
- Required artifact payloads add stage-specific minimums: `remediation_plan` includes problem statement, planned changes, verification plan, and risk notes; `dev_verification` includes commit/branch, checks or commands with pass/fail results, and residual risk; `review_verdict` includes `verdict='pass'|'fix'`, reviewer, and blocking findings; `aegis_approval` includes `quality_review_id`, `reviewer='aegis'`, `status='approved'|'rejected'`, `workspace_id`, and reason.
- Required artifact payloads MUST contain only evidence metadata, bounded summaries, command names/results, links, and commit/PR identifiers. They MUST NOT include secrets, access tokens, credentials, connection strings, or raw sensitive source/log content.
- Required stage artifact publish or supersede failures MUST be recorded as bounded failure activity on the PR-producing dev task's workspace and MUST block readiness until the missing or superseded evidence is successfully present. The failure record MUST identify the artifact type, stage, readiness subject, and sanitized error class or reason without storing raw sensitive payloads.
- The existing `quality_reviews` row for reviewer `aegis` remains the authoritative Aegis gate. An `aegis_approval` artifact is required durable evidence and must reference the quality-review row, but cannot approve readiness by itself.
- Advisory governance evidence is published as a separate aggregate `governance_evidence` artifact on the PR-producing dev task with per-stage decision class, decision, reason codes, policy ids, evaluated timestamp, event ids where available, and a `readiness_blocked` boolean. Stage artifacts reference this governance evidence where available.
- Activity evidence for SPEC-009C3 review, Aegis, governance, retry, and readiness outcomes MUST preserve the PR-producing dev task's workspace scope. Rows written to `activities` for those outcomes MUST use the same `workspace_id` as the readiness subject and SHOULD include bounded data that identifies the root issue task and PR-producing dev task without duplicating raw logs or secret-bearing content.
- Manual owner merge, owner-gate observation, and `ready_for_owner -> done` reconciliation remain SPEC-009C4 scope.
- Fixture-linked PR identity MUST be marked in C3 evidence artifacts with a source indicator such as `pr_identity_source='fixture'`. Automated tests MUST NOT treat fixture PR fields as live GitHub proof.
- For SPEC-009C3 G7, fixture smoke evidence is required. A live GitHub PR smoke path is documentation/optional operator UAT only: autopilot and automated tests MUST NOT create, update, merge, or reconcile a real GitHub PR. If deliberately run by an operator, the live smoke may create at most one draft PR, MUST record the PR identity and cleanup expectations, and MUST stop at `ready_for_owner`.
- A live GitHub PR smoke proof is valid only when the recorded PR identity is draft, belongs to the PR-producing dev task, has no merge or `done` reconciliation, and includes cleanup evidence or an explicit retention rationale. Any missing, non-draft, extra-mutation, or cleanup-missing condition MUST fail the live-smoke proof closed and MUST NOT change automated fixture acceptance.
- Existing Ready for Owner operator surfaces must remain accurate for the dev task: Task Board lane/card state, PR link, Aegis badge or review status, and owner-action notification. SPEC-009C3 does not add a dedicated pilot evidence or governance UI.
- Synthetic smoke cleanup preserves external audit trails while removing disposable local fixture residue after backup/export: synthetic GitHub issues or draft PRs are closed rather than deleted, and local synthetic tasks, artifacts, reviews, activities, and fixture agents are removed or explicitly retained with evidence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST keep the `mission-control_dev_implementation` task as the owner of the linked PR and as the only task that may reach `ready_for_owner` for this remediation chain (Q2).
- **FR-002**: The system MUST require durable remediation-plan evidence before the PR-producing dev task can advance into implementation evidence or readiness evaluation (Q7).
- **FR-003**: The system MUST require deterministic PR linkage and dev verification evidence on the PR-producing dev task before SPEC-009C3 fixture validation, optional live smoke, or the C3 happy path can count the chain as owner-ready (Q2, Q6, Q7).
- **FR-004**: The system MUST treat review `pass` as eligible to continue directly toward Aegis for the PR-producing dev task only when required plan, PR linkage, dev verification, and review-verdict evidence are present (Q1, Q7).
- **FR-005**: The system MUST treat review `fix` as a loop or block that records verdict evidence and prevents Aegis advancement, owner-review advancement, and `ready_for_owner` state (Q1).
- **FR-006**: The system MUST allow corrected work after review `fix` to proceed through review again without duplicating stale successors or losing prior review evidence (Q1).
- **FR-007**: The system MUST prove Aegis approval through the existing quality-review record for reviewer `aegis`, scoped to the same workspace as and tied to the PR-producing dev task (Q5).
- **FR-008**: The system MUST require Aegis `approved` before the PR-producing dev task can reach `ready_for_owner` (Q5).
- **FR-009**: The system MUST treat Aegis `rejected` as a bounded loop or block that records rejection evidence and prevents owner-ready state (Q9).
- **FR-010**: The system MUST require stage-scoped artifacts for remediation plan, dev verification, review verdict, and Aegis approval, each traceable to the root GitHub issue and the PR-producing dev task (Q7).
- **FR-010a**: Required stage artifacts MUST be attached to or linked/superseded onto the PR-producing dev task before readiness evaluation and MUST use inline JSON payloads with the `spec-009c3.v1` envelope and stage-specific required fields.
- **FR-010b**: Required stage artifacts MUST reject missing root issue identity, missing dev-task PR identity when evaluating C3 success, wrong workspace, unsupported review verdict values, and Aegis artifacts that do not reference a canonical `quality_reviews` row.
- **FR-010c**: Activity evidence rows for SPEC-009C3 review, Aegis, governance, retry, and readiness outcomes MUST use the same `workspace_id` as the PR-producing dev task and MUST retain bounded root-issue and dev-task context sufficient for operator audit without storing raw sensitive logs, source, secrets, tokens, credentials, or connection strings.
- **FR-010d**: Required stage artifact publish or supersede failures MUST record bounded failure activity on the PR-producing dev task's workspace and MUST prevent readiness until the required artifact is successfully present on or linked/superseded onto the PR-producing dev task.
- **FR-011**: The system MUST record advisory governance evidence for remediation stages and verify no resource-policy violation, blocked budget result, or blocked window result exists before readiness (Q4).
- **FR-012**: The system MUST keep advisory governance evidence within the current evidence model and MUST NOT introduce durable run-state, claim authority, runner state, or control-plane tables for this slice (Q4, Q8).
- **FR-013**: Automated validation MUST use deterministic fixture-linked PR identity and MUST NOT create, update, or merge a real GitHub PR (Q6).
- **FR-014**: Any live GitHub PR smoke path MUST be explicit, operator-initiated, draft-only before SPEC-009C4, and documented with cleanup expectations (Q6).
- **FR-014a**: Optional live draft PR smoke MUST fail closed when the PR identity is missing, non-draft, not owned by the PR-producing dev task, mutated beyond draft creation, merged, reconciled to `done`, or missing cleanup evidence or explicit retention rationale.
- **FR-015**: Existing workflow slugs MUST remain stable; nomenclature cleanup MAY change only labels, prompts, or copy that mislead ownership (Q3).
- **FR-016**: The system MUST NOT perform manual merge observation, GitHub merge reconciliation, or `ready_for_owner` to `done` transition in SPEC-009C3 (Q2, Q6).
- **FR-017**: The system MUST NOT introduce automatic GitHub sync polling, retry/debug control-plane UI, sandbox lifecycle, harness adapter execution, full SpecKit/SDD execution lanes, or dedicated pilot remediation progress UI in this slice (Q4, Q9, Q10).
- **FR-018**: If an existing operator surface displays ready-for-owner or evidence state, the system MUST keep that surface accurate for the PR-producing dev task without adding a new dedicated evidence UI (Q10).
- **FR-019**: Roadmap/status evidence MUST reaffirm that remaining merge-reconciliation work belongs to SPEC-009C4; pilot review packet and durable evidence-surface work belongs to SPEC-009D/E; and durable governance, run-state, claim, control-plane, automatic sync polling, sandbox lifecycle, harness adapter, and full SpecKit/SDD execution-lane work belongs to SPEC-013A-C and SPEC-014A-D (Q8).
- **FR-020**: Any readiness-blocking SPEC-009C3 condition, including review `fix`, Aegis `rejected`, missing or failed artifact evidence, governance blocker, unsupported verdict/status, wrong workspace, fixture/live PR misuse, or missing PR linkage, MUST be evaluated before owner-ready side effects and MUST produce no `ready_for_owner` status write, owner-ready notification, `task_ready_for_owner` activity, outbound ready-for-owner sync, Aegis/owner-review successor, or owner packet.
- **FR-021**: SPEC-009C3 MUST preserve existing task-chain behavior for non-pilot templates and for tasks that do not satisfy the SPEC-009C3 remediation-chain predicates. Existing `advanceTaskChain` eligibility, successor creation, retry/stall handling, workflow-template routing, and successor side effects remain governed by SPEC-004/SPEC-007 behavior unless the task is the SPEC-009C3 `mission-control_dev_implementation` readiness subject.
- **FR-022**: SPEC-009C3 MUST preserve existing SPEC-005 ready-for-owner behavior for non-remediation PR-producing tasks. The added remediation-plan, dev-verification, review-verdict, Aegis-approval, and advisory-governance evidence gates apply only to the SPEC-009C3 remediation pilot chain and MUST NOT become prerequisites for ordinary PR-producing tasks that already follow SPEC-005's two-step terminal gate.

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
- **SC-010**: 100% of required stage artifact publish or supersede failure scenarios leave the PR-producing dev task non-owner-ready, record bounded failure evidence, and produce zero owner-ready side effects.
- **SC-011**: 100% of readiness-blocked scenarios across review `fix`, Aegis `rejected`, missing evidence, governance blockers, wrong workspace, unsupported verdict/status, fixture misuse, and invalid live-smoke evidence produce zero owner-ready side effects.
- **SC-012**: 100% of non-pilot task-chain fixture scenarios continue to advance or stall according to existing SPEC-004/SPEC-007 behavior without requiring SPEC-009C3 stage artifacts, C3 review guards, Aegis-readiness gates, or governance evidence.
- **SC-013**: 100% of non-remediation PR-producing ready-for-owner fixture scenarios continue to follow SPEC-005 semantics without requiring SPEC-009C3 remediation evidence gates, while the SPEC-009C3 pilot happy path still requires those gates before owner-ready state.

## Assumptions

- SPEC-009C2 has already created a bounded Issue Remediation planning successor for an actionable pilot issue.
- SPEC-009C4 owns manual merge observation and `ready_for_owner` to `done` reconciliation.
- SPEC-009D and SPEC-009E own pilot review packet assembly and durable operator evidence surfaces.
- SPEC-013A-C and SPEC-014A-D own durable run-state, claim authority, automatic sync polling, sandbox lifecycle, harness adapters, and full SpecKit/SDD execution lanes.
- Existing Mission Control evidence, status, review, artifact, activity, and governance surfaces are sufficient for this bounded slice.
- The live PR smoke path is not part of routine automated validation and is run only by an operator who accepts the external GitHub side effect.
