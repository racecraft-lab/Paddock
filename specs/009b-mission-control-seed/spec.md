# Feature Specification: Mission Control Product-Line Seed and Flag Activation

**Feature Branch**: `009b-mission-control-seed`  
**Created**: 2026-05-07  
**Status**: Draft  
**Input**: User description: "Create the SPEC-009B seed-only specification for the RC Factory roadmap. Seed Mission Control as Product Line A, preserve Facility/global support, activate required pilot flags, import workflow families from the repo-owned contract, seed conservative governance policy shape, document operator cleanup, prove idempotency, and prevent dispatch or pilot issue work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seed Mission Control Product Line A (Priority: P1)

An operator can prepare Mission Control as the first Product Line without reusing the Facility/global support row or introducing a new product-line concept. The seeded shape gives the pilot a real Mission Control operating scope with the full department set and predictable agent role assignments.

**Why this priority**: SPEC-009C and SPEC-010A both depend on a stable Mission Control Product Line A seed. Without this scope, later pilot and reusable-seeder work has no safe product-line baseline.

**Independent Test**: Can be fully tested by running the seed against a clean eligible target, inspecting the resulting Product Line, department, and assignment records, and confirming that the Facility/global support row remains separate.

**Acceptance Scenarios**:

1. **Given** a target without a Mission Control Product Line, **When** the seed completes, **Then** exactly one Product Line exists with slug `mission-control` and name `Mission Control`.
2. **Given** the existing Facility/global support row, **When** the seed completes, **Then** `facility` remains reserved for Facility/global support and is not reused as Product Line A.
3. **Given** the Mission Control Product Line, **When** departments are inspected, **Then** QA, Development, DevSecOps, Marketing, Customer Service, and Finance exist and product surfaces such as macOS app, UI, website, and docs are represented as task labels or metadata rather than departments.
4. **Given** the Mission Control Product Line departments, **When** agent assignments are inspected, **Then** researcher, planner, dev, ui, devsecops, and qa roles map to the Mission Control platform agents named by the PRD.

---

### User Story 2 - Preserve Mission Control GitHub Intake Safely (Priority: P1)

An operator can preserve existing synced `racecraft-lab/mission-control` issue intake while preventing unrelated live product or gateway state from being silently mutated. Mission Control issue tasks become unprocessed triage/intake only; unrelated residue blocks the seed with cleanup instructions.

**Why this priority**: Existing tracker truth must not be lost, and live FocusEngine or other non-Mission-Control state must not be deleted or mixed into the Mission Control pilot.

**Independent Test**: Can be fully tested by seeding targets that contain Mission Control synced issue tasks and targets that contain non-Mission-Control residue, then verifying preservation, re-homing, blocked preflight behavior, and zero deletions.

**Acceptance Scenarios**:

1. **Given** existing synced tasks linked to `racecraft-lab/mission-control`, **When** the seed completes, **Then** their GitHub linkage and sync metadata are preserved and they are positioned as Mission Control triage/intake without being claimed or dispatched.
2. **Given** synced projects, linked tasks, repo config, cron issue sync, OpenClaw/gateway agents, or FocusEngine live project state for a non-Mission-Control product, **When** the preflight runs, **Then** the seed blocks with actionable cleanup instructions and performs no automatic deletion.
3. **Given** the known `ssh hall` FocusEngine cleanup concern, **When** deployment evidence is reviewed, **Then** the operator has backup/export-first cleanup checklist coverage for FocusEngine project state, tickets, GitHub sync, OpenClaw/gateway agents, and issue-sync cron before deployment.

---

### User Story 3 - Activate Workflow, Flag, and Governance Policy Shape (Priority: P2)

An operator can activate the Mission Control pilot configuration without starting autonomous work. The Product Line receives its required workflow families from the repo-owned workflow contract, Phase 1-7 prerequisite flags plus `PILOT_MISSION_CONTROL_E2E`, and conservative governance policy rows that are visible but do not block normal pilot intake.

**Why this priority**: The pilot needs workflow, flag, and governance configuration before it can safely ingest or route real GitHub issue work in SPEC-009C.

**Independent Test**: Can be fully tested by inspecting the Mission Control Product Line's workflow family slugs, feature flag set, and governance policies after the seed completes, then confirming future runner or sandbox flags remain disabled.

**Acceptance Scenarios**:

1. **Given** the repo-owned Mission Control workflow contract, **When** the seed applies workflow policy, **Then** the Issue Triage and Issue Remediation workflow families required by the PRD are present for the Mission Control Product Line.
2. **Given** the current workflow contract is incomplete or stale, **When** workflow policy is validated for seed readiness, **Then** the seed fails closed or requires a narrow contract correction instead of manually inventing runtime workflow policy.
3. **Given** the Mission Control Product Line, **When** feature flags are inspected, **Then** Phase 1-7 pilot prerequisite flags and `PILOT_MISSION_CONTROL_E2E` are enabled only for Product Line A.
4. **Given** future task-control-plane or sandbox-runner flags, **When** feature flags are inspected, **Then** those future flags remain off.
5. **Given** the Mission Control Product Line, **When** governance policy rows are inspected, **Then** conservative enabled policy rows exist and are visible without blocking ordinary pilot intake.

---

### User Story 4 - Prove Idempotency and Non-Dispatch Readiness (Priority: P3)

An operator or reviewer can prove that the seed is repeatable and that SPEC-009B did not start the self-hosting pilot. Evidence shows stable seed state after repeated runs and no synthetic issue, claim, scheduler dispatch, runner state, sandbox lifecycle, auto-merge, or post-merge reconciliation path.

**Why this priority**: SPEC-009B is configuration and readiness work only. It must leave SPEC-009C with a known safe starting point without stealing later pilot, runner, or sandbox scope.

**Independent Test**: Can be fully tested by running the seed twice against the same eligible target, comparing the resulting product-line shape, and checking that no pilot execution state or GitHub issue creation occurred.

**Acceptance Scenarios**:

1. **Given** an already-seeded Mission Control Product Line, **When** the seed runs again, **Then** it updates in place without creating duplicate Product Lines, departments, assignments, workflow templates, flags, governance rows, or issue intake records.
2. **Given** the seed has completed, **When** task and workflow state is inspected, **Then** no issue is claimed, no scheduler work is dispatched, and no runner or sandbox lifecycle state is created.
3. **Given** the seed has completed, **When** GitHub-facing evidence is inspected, **Then** no synthetic GitHub issue is created or ingested by SPEC-009B.

### Edge Cases

- The target already has a `mission-control` Product Line with partial department, assignment, workflow, flag, or governance data; the seed must converge it to the expected shape without duplicates.
- The target contains a real `facility` row and a non-facility Product Line with similar naming; Facility aggregate semantics must remain distinct from Product Line scope.
- Existing Mission Control GitHub issue tasks may be in inconsistent local statuses; the seed must preserve tracker linkage while treating them as unprocessed intake rather than completed or already dispatched work.
- The workflow contract may not yet contain the PRD-required Issue Triage and Issue Remediation slugs; the seed readiness path must fail closed or require a narrow contract correction.
- Non-Mission-Control sync residue may include projects, tasks, repo config, cron entries, gateway agents, or FocusEngine live state; detection must be actionable and non-destructive.
- Governance policy rows may already exist from a previous run; reruns must update or preserve the intended policy identities without multiplying policies.
- Feature flags may contain unrelated workspace-scoped settings; the seed must preserve unrelated settings while enabling only the intended Product Line A flags.
- A reviewer may run evidence checks before the operator cleanup is complete; the result must clearly distinguish blocked cleanup readiness from seed implementation failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The seed MUST create or update exactly one non-facility Product Line with slug `mission-control` and display name `Mission Control`.
- **FR-002**: The seed MUST preserve the `facility` workspace as Facility/global support and MUST NOT use it as Product Line A.
- **FR-003**: The seed MUST NOT introduce a new product-line table or rename existing Product Line, Facility, or workspace identifiers.
- **FR-004**: The seed MUST create or update the full department set under Product Line A: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- **FR-005**: The seed MUST NOT create departments for product surfaces such as macOS app, UI, website, or docs; those surfaces MUST remain labels or metadata on work.
- **FR-006**: The seed MUST map workflow stage roles to Mission Control platform agents as follows: `researcher` to `mission-control-platform-research`, `planner` to `mission-control-platform-planner`, `dev` to `mission-control-platform-dev`, `ui` to `mission-control-platform-ui`, `devsecops` to `mission-control-platform-devsecops`, and `qa` to `mission-control-platform-qa`.
- **FR-007**: The Mission Control Product Line MUST point its GitHub repository configuration to `racecraft-lab/mission-control`.
- **FR-008**: The seed MUST preserve GitHub linkage and sync metadata for existing synced `racecraft-lab/mission-control` issue tasks.
- **FR-009**: Existing synced `racecraft-lab/mission-control` issue tasks MUST be positioned as Mission Control triage/intake and MUST NOT be marked as claimed, dispatched, or already remediated by SPEC-009B.
- **FR-010**: The seed MUST detect non-Mission-Control synced projects, linked tasks, GitHub repo config, issue-sync cron state, OpenClaw/gateway agents, and FocusEngine live project residue before applying changes that depend on a clean Mission Control-only sync state.
- **FR-011**: When non-Mission-Control residue is detected, the seed MUST block with actionable operator cleanup instructions and MUST NOT delete, unlink, or mutate that residue automatically.
- **FR-012**: Operator cleanup guidance MUST cover the known `ssh hall` FocusEngine project, tickets, GitHub sync configuration, OpenClaw/gateway agents, and issue-sync cron cleanup targets.
- **FR-013**: Operator cleanup guidance MUST require backup or export before any live cleanup action.
- **FR-014**: The seed MUST apply/import workflow policy from the repo-owned Mission Control workflow contract rather than manually inventing runtime workflow definitions.
- **FR-015**: The seeded workflow policy MUST include the Issue Triage family slugs required by the PRD: `mission-control_issue_triage`, `mission-control_specialist_route`, `mission-control_close_issue`, and `mission-control_needs_spec_route`.
- **FR-016**: The seeded workflow policy MUST include the Issue Remediation family slugs required by the PRD: `mission-control_remediation_plan`, `mission-control_dev_implementation`, `mission-control_review`, `mission-control_owner_review`, and documented `mission-control_aegis` participation.
- **FR-017**: If the repo-owned workflow contract does not contain the required Mission Control workflow family shape, seed readiness MUST fail closed or require a narrow contract correction before runtime policy is applied.
- **FR-018**: Product Line A feature flags MUST enable Phase 1-7 pilot prerequisites and `PILOT_MISSION_CONTROL_E2E` for the Mission Control Product Line.
- **FR-019**: Future runner, task-control-plane, sandbox-runner, harness adapter, and auto-merge flags MUST remain disabled by SPEC-009B.
- **FR-020**: The seed MUST create or update conservative enabled governance policy rows that prove policy shape and operator visibility without blocking normal Mission Control pilot intake.
- **FR-021**: Governance policy seeding MUST be idempotent and MUST NOT duplicate policy rows on rerun.
- **FR-022**: Running the seed repeatedly against the same eligible target MUST leave stable Product Line, department, assignment, repo, workflow, flag, governance, and issue-intake state.
- **FR-023**: SPEC-009B MUST NOT create or ingest a synthetic GitHub issue.
- **FR-024**: SPEC-009B MUST NOT claim issue work, dispatch scheduler work, launch autonomous work, create runner state, create sandbox lifecycle state, perform auto-merge, or perform post-merge reconciliation.
- **FR-025**: SPEC-009B MUST remain Mission-Control-specific and MUST NOT implement generic Product Line B or reusable product-line seeder behavior.
- **FR-026**: Seed and runbook evidence MUST be reviewable by operators and downstream agents without relying on hidden terminal context.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-009B setup evidence must distinguish seed readiness, blocked cleanup preflight, and non-dispatch verification rather than treating blocked operator cleanup as a successful deployment.

### Key Entities *(include if feature involves data)*

- **Facility Workspace**: The existing Facility/global support scope represented by slug `facility`; it remains separate from Product Line A.
- **Mission Control Product Line**: The non-facility Product Line with slug `mission-control`, name `Mission Control`, GitHub repository configuration, feature flags, and governance policy scope.
- **Department Project**: A Product Line A department destination for work routing; the required departments are QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- **Agent Role Assignment**: The mapping between workflow stage roles and Mission Control platform agents for the Product Line departments.
- **Mission Control Issue Intake**: Existing synced `racecraft-lab/mission-control` issue task projections whose GitHub linkage and sync metadata must be preserved as unprocessed intake.
- **Workflow Family**: A repo-owned workflow policy family applied to Product Line A; required families are Issue Triage and Issue Remediation.
- **Feature Flag Set**: The Product Line A scoped pilot prerequisite flags plus `PILOT_MISSION_CONTROL_E2E`, excluding future runner and sandbox flags.
- **Governance Policy**: Conservative enabled WIP, budget, or related policy rows that are visible and idempotent without blocking normal pilot intake.
- **Cleanup Residue**: Non-Mission-Control sync, project, cron, gateway, or FocusEngine state that blocks seed readiness until an operator cleans it up outside the seed.
- **Operator Cleanup Checklist**: Backup/export-first deployment evidence that records FocusEngine and non-Mission-Control cleanup targets and post-cleanup verification.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the seed twice leaves exactly one non-facility Mission Control Product Line and preserves exactly one Facility/global support row for aggregate scope.
- **SC-002**: All six required departments exist under the Mission Control Product Line after seeding, and no macOS app, UI, website, or docs department is created.
- **SC-003**: All six PRD role-to-agent assignments are present and stable after a rerun.
- **SC-004**: Existing synced `racecraft-lab/mission-control` issue tasks retain their GitHub linkage and sync metadata and are visible as unprocessed triage/intake.
- **SC-005**: A target with non-Mission-Control sync, project, cron, gateway, or FocusEngine residue blocks before unsafe mutation and reports cleanup instructions that an operator can act on.
- **SC-006**: The Mission Control Product Line has the PRD-required Issue Triage and Issue Remediation workflow slugs sourced from the repo-owned workflow contract path.
- **SC-007**: Product Line A has the Phase 1-7 prerequisite flags plus `PILOT_MISSION_CONTROL_E2E` enabled, while future runner and sandbox flags remain off.
- **SC-008**: Conservative governance policy rows are enabled, visible, and stable after rerun without preventing normal pilot intake setup.
- **SC-009**: Review evidence shows no synthetic GitHub issue creation, issue claim, scheduler dispatch, runner state, sandbox lifecycle state, auto-merge, or post-merge reconciliation introduced by SPEC-009B.
- **SC-010**: The pre-deploy checklist identifies the `ssh hall` FocusEngine cleanup targets, requires backup/export first, and records verification that only `racecraft-lab/mission-control` issue sync remains before deployment.

## Assumptions

- SPEC-009A workflow-contract import/apply behavior is available and is the correct source-of-truth path for runtime workflow policy.
- SPEC-006 GitHub area-label and sync metadata behavior is available for preserving Mission Control issue linkage.
- SPEC-008 governance tables and operator visibility surfaces are available for conservative policy seed rows.
- "Phase 1-7 prerequisite flags" means the merged prerequisite capability flags identified in the PRD and roadmap for the Product Line A pilot, plus the explicit `PILOT_MISSION_CONTROL_E2E` pilot flag.
- The initial governance defaults should be conservative and visible, but exact numeric thresholds may be refined during Clarify or Plan as long as they do not block normal pilot intake.
- Live FocusEngine cleanup is operator-owned deployment work and must not be performed automatically by the seed.
- SPEC-009C owns selecting or creating pilot issue input and running the GitHub-linked smoke.
- SPEC-010A owns extracting a generic reusable product-line seeder after the Mission Control-specific seed is proven.
- SPEC-013 and SPEC-014 own claim, runner, harness, sandbox, and lifecycle state; SPEC-009B must leave those future scopes untouched.
