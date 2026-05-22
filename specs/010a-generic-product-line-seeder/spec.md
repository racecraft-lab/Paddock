# Feature Specification: Generic Product-Line Seeder

**Feature Branch**: `010a-generic-product-line-seeder`  
**Created**: 2026-05-22  
**Status**: Draft  
**Input**: User description: "Build a generic, checked-in product-line seed config and command surface that can reproduce the existing Mission Control seed without launching work or mutating GitHub."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Product-Line Seed Config (Priority: P1)

As an operator, I can inspect a checked-in product-line seed file before any product-line setup is applied, so I can verify identity, ownership, departments, agents, workflows, flags, and governance defaults through normal code review.

**Why this priority**: Reviewable config is the foundation for generic reuse. Without it, future product lines still require code-specific changes and cannot be safely evaluated before execution.

**Independent Test**: Can be fully tested by reviewing the canonical Mission Control seed config and validating that it declares all required setup intent without requiring database writes, external services, GitHub changes, work dispatch, or Product Line B artifacts.

**Acceptance Scenarios**:

1. **Given** the repository contains the generic product-line seed feature, **When** an operator opens the Mission Control product-line seed config, **Then** the file exposes the product-line identity, display name, agent prefix, GitHub repository ownership, workflow contract family, required workflow slugs, feature-flag policy, agent assignments, departments, and governance defaults in a human-reviewable form.
2. **Given** the Mission Control seed config is reviewed, **When** the reviewer checks product-line boundaries, **Then** the config does not define Product Line B, create runtime work, create GitHub state, dispatch tasks, claim tasks, launch runners, create sandboxes, or invoke SpecKit setup.
3. **Given** a future product-line implementer needs a reusable starting point, **When** they compare the config shape with the Mission Control fixture, **Then** they can identify which values are product-line-specific without changing seeder behavior.

---

### User Story 2 - Run Generic Preflight, Apply, And Verify (Priority: P1)

As an operator, I can run generic preflight, apply, and verify modes for a product-line seed and receive structured evidence, so I know whether the target is safe, what changed, and whether the resulting product-line state matches the reviewed config.

**Why this priority**: The generic command surface is the operational contract for SPEC-010B and must prove safe setup behavior before a second product line is introduced.

**Independent Test**: Can be fully tested by running the generic command in preflight, apply, and verify modes against a safe target using the Mission Control config, then confirming structured evidence for validation status, existing-target policy, mutation counts, idempotency, and verification results.

**Acceptance Scenarios**:

1. **Given** a valid Mission Control seed config and an empty safe target, **When** the operator runs preflight, **Then** the command reports that identity, GitHub ownership, workflow contract references, required workflow slugs, feature flags, agent assignments, governance defaults, and target residue are safe before any writes occur.
2. **Given** preflight passes for a valid config, **When** the operator runs apply, **Then** the target contains the config-owned product-line workspace, department projects, agent assignments, workflow template projection, feature-flag policy, and governance defaults while preserving unrelated history and existing non-owned state.
3. **Given** apply has completed, **When** the operator runs verify, **Then** the command reports that the target state matches the reviewed config and does not perform writes.
4. **Given** the target product line already exists, **When** the operator runs apply without explicit existing-target permission, **Then** the command refuses to write and reports the explicit existing-target action required.
5. **Given** the target product line already exists and the operator uses the explicit existing-target apply path, **When** apply runs, **Then** only config-owned fields are updated and issue, task, activity, history, and unrelated feature-flag state are preserved.

---

### User Story 3 - Prove Mission Control Parity (Priority: P1)

As a maintainer, I can prove that the generic Mission Control config reproduces the existing SPEC-009B Mission Control seed behavior, so the generic seeder can replace the Mission-Control-specific path without changing the proven product-line shape.

**Why this priority**: SPEC-010A is only useful if it preserves the existing Mission Control setup while removing Mission-Control-specific assumptions from the seed path.

**Independent Test**: Can be fully tested by applying the generic Mission Control config twice to a disposable or safe target, running verify mode, and comparing evidence against the expected SPEC-009B product-line shape.

**Acceptance Scenarios**:

1. **Given** the generic Mission Control config is applied to a safe target, **When** the resulting product-line state is inspected, **Then** it matches the SPEC-009B expectations for Mission Control identity, departments, agent assignments, GitHub repository ownership, workflow families, required workflow slugs, feature flags, governance defaults, and non-dispatch boundaries.
2. **Given** the generic Mission Control config has already been applied once, **When** it is applied a second time through the explicit idempotent path, **Then** the second run reports stable evidence and does not duplicate config-owned records.
3. **Given** the compatibility Mission Control seed entrypoint is used, **When** it runs, **Then** it uses the canonical Mission Control product-line config and produces evidence equivalent to the generic command for the same target and mode.

---

### User Story 4 - Fail Closed For Unsafe Configs (Priority: P2)

As an operator, I can trust unsafe or incomplete product-line configs to fail before mutation, so a bad config cannot partially create a product-line or silently take over existing state.

**Why this priority**: Generic reuse increases blast radius. Fail-closed validation is required before any new product-line seed config can be trusted.

**Independent Test**: Can be fully tested with invalid config fixtures that are missing required identity, contain invalid feature flags, reference missing workflow slugs, declare unsafe governance defaults, conflict with GitHub ownership, or require an explicit existing-target policy.

**Acceptance Scenarios**:

1. **Given** a config is missing required identity or ownership fields, **When** preflight or apply runs, **Then** the command fails with structured JSON errors that identify the config path and field codes before any writes occur.
2. **Given** a config names a feature flag outside the allowed registry, **When** preflight or apply runs, **Then** the command fails before writes and reports the invalid flag without changing target state.
3. **Given** a config references a workflow contract family or required slug that cannot be validated, **When** preflight or apply runs, **Then** the command fails before writes and reports the missing contract evidence.
4. **Given** a config would create first-intake-blocking governance defaults without an explicit override marker, **When** preflight or apply runs, **Then** the command fails before writes and reports the unsafe governance policy.
5. **Given** conflicting target residue exists for the config's declared product-line or GitHub repository ownership, **When** preflight or apply runs, **Then** the command blocks with redacted structured evidence and does not delete or unlink anything automatically.

---

### User Story 5 - Reuse Seeder For Future Product Lines (Priority: P3)

As a future SPEC-010B implementer, I can add a new product-line config using the same schema and command surface, so onboarding a second product line does not require product-line-specific seeder code changes.

**Why this priority**: This is the downstream enablement goal, but SPEC-010A must stop short of creating or applying Product Line B itself.

**Independent Test**: Can be fully tested by validating schema-level fixtures and documentation that show how product-line-specific values are supplied through config while confirming no Product Line B config, smoke, live target enablement, or GitHub mutation exists in this spec.

**Acceptance Scenarios**:

1. **Given** the generic config schema and Mission Control fixture exist, **When** a future implementer prepares another product-line seed file, **Then** they can supply a different identity, repo ownership, workflow contract declaration, agent prefix, departments, flags, assignments, and governance defaults without editing generic seeder logic.
2. **Given** SPEC-010A is complete, **When** repository artifacts are reviewed, **Then** they contain reusable schema, fixtures, command behavior, and evidence only; they do not contain Product Line B onboarding output or live smoke evidence.

### Edge Cases

- A target product line exists but the operator omitted explicit existing-target permission.
- A target product line exists and contains non-config-owned issue, task, history, activity, or unrelated feature-flag state.
- A config declares the same product-line identity with a different GitHub repository owner or repository name than the target residue indicates.
- A config declares a workflow contract family or required workflow slug that is missing, ambiguous, or not applicable to the target product line.
- A config declares feature flags that are unknown, misspelled, duplicated, or listed in conflicting enabled and disabled/absent sets.
- A config declares agent assignments without the configured product-line agent prefix or ambiguously references shared support agents.
- A config declares governance defaults that would block first intake without an explicit override marker.
- Preflight detects conflicting target-config residue and must report enough redacted evidence for operator cleanup without deleting or unlinking records.
- Apply is interrupted or repeated and must not duplicate config-owned rows.
- Verify mode is run against a drifted target and must report mismatch evidence without writes.
- The Mission Control compatibility entrypoint is used and must not diverge from the generic Mission Control config path.
- The seed feature is reviewed for scope creep and must not include Product Line B creation, GitHub mutation, task dispatch, runner launch, sandbox creation, or SpecKit setup/autopilot invocation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a checked-in, human-reviewable product-line seed config shape that includes a version marker, product-line identity, display name, agent prefix, GitHub repository ownership, workflow contract declaration, required workflow slugs, departments, agent assignments, feature-flag policy, governance defaults, and existing-target policy.
- **FR-002**: System MUST include Mission Control as the first canonical product-line seed config and fixture using the generic config shape.
- **FR-003**: System MUST provide a generic product-line seed command surface with preflight, apply, and verify modes.
- **FR-004**: System MUST keep the existing Mission Control seed entrypoint available as a compatibility wrapper around the canonical Mission Control product-line config.
- **FR-005**: System MUST validate config identity, version, required sections, required field types, duplicate declarations, and unsupported fields before any write-capable run can mutate target state.
- **FR-006**: System MUST validate the configured GitHub repository ownership and block target-conflicting residue that belongs to the declared product-line or repository boundary.
- **FR-007**: System MUST validate workflow contract family/path declarations and required workflow slugs through the repo-owned workflow contract source of truth before seeding workflow templates.
- **FR-008**: System MUST validate feature flag names against the allowed feature-flag registry and reject unknown, duplicated, or conflicting enabled and disabled/absent flag declarations before writes.
- **FR-009**: System MUST preserve unrelated existing feature flags unless the reviewed config explicitly owns them.
- **FR-010**: System MUST validate product-line-scoped agent assignments against the configured agent prefix while allowing shared support references only when they are explicitly declared by role.
- **FR-011**: System MUST seed or verify config-owned product-line identity, departments, agent assignments, workflow template projection, feature-flag policy, GitHub repository ownership, and governance defaults from config.
- **FR-012**: System MUST model governance defaults using the existing policy concept and reject first-intake-blocking defaults unless the reviewed config explicitly marks the policy as intended to block first intake.
- **FR-013**: System MUST fail closed before opening a write transaction for incomplete, invalid, unsafe, or target-conflicting configs.
- **FR-014**: System MUST return structured JSON evidence for preflight, apply, verify, validation failures, target residue blocking, existing-target refusal, and no-mutation proof.
- **FR-015**: System MUST prove invalid-config no-mutation behavior by comparing target state before and after failed preflight or apply attempts across product-line, department, assignment, workflow, governance, task, issue, activity, and history surfaces.
- **FR-016**: System MUST require explicit existing-target handling before applying a config to an already-existing product line.
- **FR-017**: System MUST update only config-owned fields during explicit existing-target apply and preserve issue rows, task rows, activity rows, history rows, unrelated feature flags, and other non-owned state.
- **FR-018**: System MUST make verify mode read-only and report all observed drift between the reviewed config and target state.
- **FR-019**: System MUST prove Mission Control parity by applying the generic Mission Control config once, applying it a second time through the explicit idempotent path, and running verify mode with stable evidence.
- **FR-020**: System MUST ensure the Mission Control compatibility wrapper produces behavior and evidence equivalent to the generic command using the Mission Control config.
- **FR-021**: System MUST avoid hardcoded Mission Control workflow names, product-line identities, agent names, and repository assumptions in the generic seeder path.
- **FR-022**: System MUST never create Product Line B, seed Product Line B, run Product Line B smoke, enable Product Line B on a live target, or include Product Line B onboarding evidence in this spec.
- **FR-023**: System MUST never mutate GitHub, create issues, dispatch work, claim tasks, launch runners, create sandboxes, or invoke SpecKit setup/autopilot as part of product-line seeding.
- **FR-024**: System MUST provide operator-facing evidence that target-config residue blocking is detection-only and never performs automatic deletion, unlinking, or cleanup.
- **FR-025**: System MUST keep all product-line seed behavior reusable for a future product line through config changes alone, without requiring per-product-line seeder code changes.
- **FR-026**: System MUST document the schema, command modes, evidence shape, existing-target policy, residue blocking policy, Mission Control compatibility path, and Product Line B exclusion boundary for maintainers and operators.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep provenance for SPEC-010A must be recorded before planning and must name the workflow or artifact that captured the sweep result.
- The current target spec `specs/010a-generic-product-line-seeder` is excluded from same-run archival and cleanup.
- Unsafe branches, dirty worktrees, or unresolved archive evidence use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated review evidence is text or structured JSON by default; committed binary artifacts require a manifest-backed exception.
- PR review packets for this feature must include the reviewed seed config path, validation evidence, apply-twice evidence, verify evidence, invalid-config no-mutation evidence, existing-target behavior evidence, and explicit scope-exclusion evidence for Product Line B and runtime execution.

### Reviewability Requirements

- **RR-001**: The complete PR review packet MUST be understandable from checked-in config, documentation, command output, and tests without requiring live GitHub mutation or runner execution.
- **RR-002**: The review packet MUST identify every config-owned target surface and every preserved non-owned target surface.
- **RR-003**: The review packet MUST include before/after or equivalent stable evidence for invalid-config no-mutation and apply-twice idempotency.
- **RR-004**: The review packet MUST include explicit grep, test, or structured evidence that Product Line B onboarding and runtime execution surfaces are absent from SPEC-010A behavior.
- **RR-005**: The review packet SHOULD stay within a focused evidence budget: one canonical config, one schema/validator surface, one generic command surface, compatibility wrapper evidence, focused tests, and concise operator documentation.

### Key Entities *(include if feature involves data)*

- **Product-Line Seed Config**: A checked-in declaration of product-line identity, ownership, workflow, flags, agents, departments, governance, and existing-target policy.
- **Product Line**: The scoped unit being configured for Mission Control or a future product line, identified by a stable slug and display name.
- **Department**: A product-line-owned work area that receives assignments or workflow routing.
- **Agent Assignment**: A declaration connecting product-line-scoped or shared-support agents to departments and roles.
- **Workflow Contract Declaration**: A config-owned reference to the workflow family/path and required slugs that must be imported or verified through the repository workflow contract source of truth.
- **Feature-Flag Policy**: The config-owned enabled and disabled/absent flag declarations for the product line.
- **Governance Default**: A product-line policy row declaration that sets advisory or enforced resource controls while protecting first intake unless explicitly overridden.
- **Target Residue Evidence**: Redacted structured evidence that a target contains conflicting product-line or GitHub ownership state requiring operator cleanup.
- **Seed Evidence Report**: Structured output for preflight, apply, verify, refusal, validation failure, idempotency, and no-mutation proof.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of required Mission Control seed inputs are represented in the canonical reviewed config without requiring Mission-Control-specific seeder code paths.
- **SC-002**: A reviewer can validate the Mission Control seed intent from checked-in artifacts in under 10 minutes without running the seeder.
- **SC-003**: Preflight for a valid Mission Control config reports all required validation categories and performs zero writes.
- **SC-004**: Applying the Mission Control config twice produces one stable product-line setup with no duplicate config-owned product-line, department, assignment, workflow, or governance records.
- **SC-005**: Verify mode reports matching Mission Control target state and performs zero writes.
- **SC-006**: Invalid config fixtures for missing identity, invalid feature flag, missing workflow slug, unsafe governance, and conflicting ownership each fail before writes and return structured JSON errors with field-level codes.
- **SC-007**: No-mutation evidence proves failed invalid-config runs leave product-line, department, assignment, workflow, governance, issue, task, activity, and history counts or hashes unchanged.
- **SC-008**: Existing-target apply without explicit permission is refused 100% of the time and reports the required operator action.
- **SC-009**: Explicit existing-target apply preserves 100% of non-owned issue, task, activity, history, and unrelated feature-flag state in covered test scenarios.
- **SC-010**: The Mission Control compatibility wrapper produces the same success/failure evidence categories as the generic command using the Mission Control config.
- **SC-011**: Repository review finds zero Product Line B seed configs, Product Line B smoke artifacts, GitHub mutation behavior, work dispatch behavior, runner launch behavior, sandbox creation behavior, or SpecKit setup/autopilot invocation in SPEC-010A seed execution.
- **SC-012**: A future product-line fixture can be schema-validated by changing config values only, with no product-line-specific seeder code edits.

## Assumptions

- SPEC-009B behavior is the parity baseline for Mission Control product-line setup.
- Product-line seed configs are operator-reviewed repository artifacts, not runtime-authored admin records.
- Existing Product Line B onboarding, enablement, smoke, and live UAT remain owned by SPEC-010B.
- Mission Control is the only real product-line config created or applied by SPEC-010A.
- Failed validation and target residue blocking should be machine-readable for automation and concise enough for operator review.
- Structured no-mutation evidence may use stable counts, hashes, or equivalent snapshots over target surfaces.
- Existing target data may include non-owned issue, task, activity, history, and unrelated feature-flag state that must survive seeding.
- Product-line seeding is configuration and verification work only; it does not start or operate autonomous workflows.
