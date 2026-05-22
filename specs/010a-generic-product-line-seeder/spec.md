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

1. **Given** the repository contains the generic product-line seed feature, **When** an operator opens `docs/ai/product-lines/mission-control.yaml`, **Then** the file exposes `schema_version: product-line-seed-v1`, product-line identity, display name, agent prefix, GitHub repository ownership, workflow contract family/path, required workflow slugs, feature-flag policy, agent assignments, departments, governance defaults, and safety policy in a human-reviewable form.
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
4. **Given** the target product line already exists, **When** the operator runs apply without `--allow-existing`, **Then** the command refuses to write and reports `action_required: "--allow-existing"`.
5. **Given** the target product line already exists and the operator uses `--allow-existing`, **When** apply runs, **Then** only config-owned fields are updated and issue, task, activity, history, and unrelated feature-flag state are preserved.

---

### User Story 3 - Prove Mission Control Parity (Priority: P1)

As a maintainer, I can prove that the generic Mission Control config reproduces the existing SPEC-009B Mission Control seed behavior, so the generic seeder can replace the Mission-Control-specific path without changing the proven product-line shape.

**Why this priority**: SPEC-010A is only useful if it preserves the existing Mission Control setup while removing Mission-Control-specific assumptions from the seed path.

**Independent Test**: Can be fully tested by applying the generic Mission Control config twice to a disposable or safe target, running verify mode, and comparing evidence against the expected SPEC-009B product-line shape.

**Acceptance Scenarios**:

1. **Given** the generic Mission Control config is applied to a safe target, **When** the resulting product-line state is inspected, **Then** it matches the SPEC-009B expectations for Mission Control identity, departments, agent assignments, GitHub repository ownership, workflow families, required workflow slugs, feature flags, governance defaults, and non-dispatch boundaries.
2. **Given** the generic Mission Control config has already been applied once, **When** it is applied a second time through `--allow-existing`, **Then** the second run reports stable evidence and does not duplicate config-owned records.
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

1. **Given** the generic config schema and Mission Control fixture exist, **When** a future implementer prepares another product-line seed file, **Then** they can supply different `product_line`, `github`, `workflow_contract`, `departments`, `agent_assignments`, `feature_flags`, `governance_defaults`, and `safety_policy` sections without editing generic seeder logic.
2. **Given** SPEC-010A is complete, **When** repository artifacts are reviewed, **Then** they contain reusable schema, fixtures, command behavior, and evidence only; they do not contain Product Line B onboarding output or live smoke evidence.

### Edge Cases

- A target product line exists but the operator omitted `--allow-existing`, requiring an `existing_target_refused` response with no writes.
- A target product line exists and contains non-config-owned issue, task, history, activity, or unrelated feature-flag state.
- A config declares the same product-line identity with a different GitHub repository owner or repository name than the target residue indicates.
- A config declares a workflow contract family other than the currently supported `mission-control` family, or a required workflow slug that is missing, ambiguous, or not applicable to the target product line.
- A config declares feature flags that are unknown, misspelled, duplicated, listed in conflicting enabled and disabled/absent sets, or listed as disabled/absent without being either a registry key or explicitly reserved future flag.
- A config declares agent assignments without slug-safe `agent_prefix` plus per-assignment `agent_key`, role, and department mapping, or ambiguously references shared support agents without explicit `shared_support_role`, `agent_name`, and `scope: facility_global`.
- A config declares enabled `blackout`, `degraded_window`, enabled `wip_limit`, or non-`alert` enforcement governance defaults without an explicit first-intake-blocking override marker and per-policy reason.
- Preflight detects conflicting target-config residue and must report enough redacted evidence for operator cleanup without deleting or unlinking records.
- Apply is interrupted or repeated and must not duplicate config-owned rows.
- Verify mode is run against a drifted target and must report mismatch evidence without writes.
- Invalid-config or blocked-preflight proof must not call any dry-run/import path that persists diagnostics before no-mutation snapshots are compared.
- The Mission Control compatibility entrypoint is used and must not diverge from the generic Mission Control config path.
- The seed feature is reviewed for scope creep and must not include Product Line B creation, GitHub mutation, task dispatch, runner launch, sandbox creation, or SpecKit setup/autopilot invocation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a checked-in, human-reviewable product-line seed config shape with required top-level sections `schema_version`, `product_line`, `github`, `workflow_contract`, `departments`, `agent_assignments`, `feature_flags`, `governance_defaults`, and `safety_policy`.
- **FR-002**: System MUST include Mission Control as the first canonical product-line seed config and fixture at `docs/ai/product-lines/mission-control.yaml` using `schema_version: product-line-seed-v1`.
- **FR-003**: System MUST provide a generic product-line seed command surface with preflight, apply, and verify modes using `pnpm seed:product-line -- --config <yaml> --db <db> --mode preflight|apply|verify --json [--allow-existing] [--operator-evidence <json>]`, and unknown CLI flags MUST be rejected.
- **FR-004**: System MUST keep the existing `pnpm seed:mission-control` entrypoint available as a compatibility wrapper around the canonical Mission Control product-line config, preserving the command name and core flags while delegating to the same generic existing-target policy, including refusal without `--allow-existing` for existing targets.
- **FR-005**: System MUST validate config identity, version, required sections, required field types, duplicate declarations, unknown or unsupported fields, and schema conformance through a JSON Schema plus TypeScript semantic validator owned by `src/lib/product-line-seed/` before any write-capable run can mutate target state.
- **FR-006**: System MUST validate the configured GitHub repository ownership and block target-conflicting residue that belongs to the declared product-line or repository boundary.
- **FR-007**: System MUST validate workflow contract family/path declarations and required workflow slugs through the repo-owned workflow contract source of truth before seeding workflow templates; SPEC-010A supports only `workflow_contract.family: mission-control` and MUST fail unsupported families before writes with `UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY`.
- **FR-008**: System MUST validate `feature_flags.enabled` entries as keys in `FEATURE_FLAG_REGISTRY`; `feature_flags.disabled_or_absent` entries MUST be either registry keys or the explicitly reserved future flags `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES`, and every other unknown flag name MUST be rejected as a typo or unsupported future surface.
- **FR-009**: System MUST treat reserved future flags as validation-only negative assertions: preflight, apply, and verify MUST fail if target state sets one to `true`, and the seeder MUST NOT write, register, enable, or otherwise implement those flags.
- **FR-010**: System MUST preserve unrelated existing feature flags unless the reviewed config explicitly owns them; seed flag writes are not the admin mutation path, but they MUST validate registry membership, product-line scope, cascade prerequisites, environment force-off blockers, duplicates, conflicts, and reserved-absent guardrails before writing reviewed config-owned workspace flag JSON.
- **FR-011**: System MUST validate product-line-scoped agent assignments using slug-safe `agent_prefix` plus per-assignment `agent_key`, role, and department mapping; derived product-line `agent_name` values MUST use `agent_prefix + "-" + agent_key`, `agent_key` values MUST NOT already include the prefix, and shared support references require explicit `shared_support_role`, `agent_name`, and `scope: facility_global`.
- **FR-012**: System MUST seed or verify config-owned product-line identity, departments, agent assignments, workflow template projection, feature-flag policy, GitHub repository ownership, and governance defaults from config.
- **FR-013**: System MUST model governance defaults using the existing policy concept and reject first-intake-blocking defaults unless `safety_policy.allow_first_intake_blocking_governance` explicitly marks the policy as intended to block first intake and each blocking policy includes an override reason; first-intake-blocking defaults include enabled `blackout`, `degraded_window`, enabled `wip_limit`, or any policy with `enforcement` other than `alert`.
- **FR-014**: System MUST fail closed before opening a write transaction for incomplete, invalid, unsafe, or target-conflicting configs.
- **FR-015**: System MUST return a structured JSON result envelope using `schema_version:"product-line-seed-result-v1"` and stable fields for `ok`, `entrypoint`, `mode`, `status`, `code`, `mutation_status`, `config`, `target`, `evidence`, `errors`, `snapshot_before`, `snapshot_after`, `redaction`, `action_required`, and `exit_code`; existing-target refusal MUST return `ok:false`, `mode:"apply"`, `status:"existing_target_refused"`, `code:"EXISTING_TARGET_REQUIRES_ALLOW_EXISTING"`, `mutation_status:"not_mutated"`, target identity, and `action_required:"--allow-existing"`.
- **FR-016**: Structured failure and residue evidence MUST include `raw_secret_values_emitted:false`, a `redacted_fields` list, stable target IDs/counts where available, and MUST NOT emit credentials, tokens, passwords, raw secret values, signed URLs, raw logs, raw untrusted payloads, or matched secret substrings; evidence should use field paths, stable IDs, rule IDs, and hashes instead.
- **FR-017**: System MUST prove invalid-config and blocked-preflight no-mutation behavior by comparing `snapshot_before` and `snapshot_after` state using per-surface row counts plus stable ordered-JSON SHA-256 hashes formatted as `product-line-seed-snapshot-v1:sha256:<hex>`. Snapshot evidence MUST cover config-owned seed surfaces and every FR-020 preserved non-config-owned operational/history surface, including product-line, department, assignment, workflow, governance, feature flags, task, issue, activity, history, evidence, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit or ledger rows, manual workflow templates, non-owned feature-flag keys, row IDs, creation timestamps, task status, task GitHub linkage, task lineage, project ticket counters, assignment timestamps, and workflow use counters. Snapshot payloads MUST follow FR-016 redaction constraints and MUST NOT hash or emit raw secrets, raw logs, signed URLs, raw untrusted payloads, or matched secret substrings.
- **FR-018**: System MUST require `--allow-existing` before applying a config to an already-existing product line, with the default config policy equivalent to `existing_target: refuse_unless_allow_existing`; verify mode remains read-only and does not require that flag.
- **FR-019**: System MUST update only reviewed config-owned fields during `--allow-existing` apply: workspace name and owned feature-flag keys; department project fields declared in config; assignment role by project and agent identity; workflow-contract-owned template fields through the existing importer; and governance policy fields keyed by stable config identity.
- **FR-020**: System MUST preserve non-config-owned operational rows and history during existing-target apply, including tasks, activities, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit or ledger rows, manual workflow templates, row IDs, creation timestamps, task status, task GitHub linkage, task lineage, project ticket counters, assignment timestamps, workflow use counters, and non-owned feature-flag keys.
- **FR-021**: System MUST make verify mode read-only and report all observed drift between the reviewed config and target state.
- **FR-022**: System MUST prove Mission Control parity by applying the generic Mission Control config once, applying it a second time through `--allow-existing`, and running verify mode with stable evidence.
- **FR-023**: System MUST ensure the Mission Control compatibility wrapper produces behavior and evidence equivalent to the generic command using the Mission Control config, including refusal without `--allow-existing` and idempotent success with `--allow-existing`.
- **FR-024**: System MUST avoid hardcoded Mission Control workflow names, product-line identities, agent names, and repository assumptions in the generic seeder path.
- **FR-025**: System MUST never create Product Line B, seed Product Line B, run Product Line B smoke, enable Product Line B on a live target, or include Product Line B onboarding evidence in this spec.
- **FR-026**: System MUST never mutate GitHub, create issues, dispatch work, claim tasks, launch runners, create sandboxes, create harness adapters, auto-merge, or invoke SpecKit setup/autopilot as part of product-line seeding.
- **FR-027**: System MUST provide operator-facing evidence that target-config residue blocking is detection-only and never performs automatic deletion, unlinking, or cleanup.
- **FR-028**: System MUST keep all product-line seed behavior reusable for a future product line through config changes alone, without requiring per-product-line seeder code changes.
- **FR-029**: System MUST document the schema, command modes, evidence shape, existing-target policy, residue blocking policy, Mission Control compatibility path, and Product Line B exclusion boundary for maintainers and operators in `docs/runbooks/product-line-seed.md`, update `docs/runbooks/mission-control-seed-predeploy.md` for the compatibility path, and keep implementation validation in `specs/010a-generic-product-line-seeder/quickstart.md`.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep provenance for SPEC-010A must be recorded before planning and must name the workflow or artifact that captured the sweep result.
- The current target spec `specs/010a-generic-product-line-seeder` is excluded from same-run archival and cleanup.
- Unsafe branches, dirty worktrees, or unresolved archive evidence use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated review evidence is text or structured JSON by default; committed binary artifacts require a manifest-backed exception.
- PR review packets for this feature must include the reviewed seed config path, validation evidence, apply-twice evidence, verify evidence, invalid-config no-mutation evidence, existing-target behavior evidence, and explicit scope-exclusion evidence for Product Line B and runtime execution.

### Reviewability Requirements

- **RR-001**: The complete PR review packet MUST be understandable from checked-in config, documentation, command output, and tests without requiring live GitHub mutation or runner execution.
- **RR-002**: The review packet MUST identify every config-owned target surface and every preserved non-owned target surface, including existing-target apply rules.
- **RR-003**: The review packet MUST include before/after counts plus stable snapshot hashes for invalid-config no-mutation and apply-twice idempotency across all config-owned seed surfaces and all FR-020 preserved non-owned operational/history surfaces and invariants.
- **RR-004**: The review packet MUST include explicit grep, test, or structured evidence that Product Line B onboarding and runtime execution surfaces are absent from SPEC-010A behavior.
- **RR-005**: The review packet SHOULD stay within a focused evidence budget: one canonical config, one schema/validator surface, one generic command surface, compatibility wrapper evidence, focused tests, and concise operator documentation.

### Key Entities *(include if feature involves data)*

- **Product-Line Seed Config**: A checked-in YAML declaration at `docs/ai/product-lines/mission-control.yaml` with `schema_version: product-line-seed-v1` and required sections for product-line identity, GitHub ownership, workflow contract, departments, agent assignments, feature flags, governance defaults, and safety policy.
- **Product Line**: The scoped unit being configured for Mission Control or a future product line, identified by a stable slug and display name.
- **Department**: A product-line-owned work area that receives assignments or workflow routing.
- **Agent Assignment**: A declaration connecting product-line-scoped or shared-support agents to departments and roles through `agent_prefix`, `agent_key`, role, and department mapping, with shared support isolated through `scope: facility_global`.
- **Workflow Contract Declaration**: A config-owned reference to the workflow family/path and required slugs that must be imported or verified through the repository workflow contract source of truth; SPEC-010A supports only the existing `mission-control` family.
- **Feature-Flag Policy**: The config-owned enabled and disabled/absent flag declarations for the product line; enabled flags must be registry keys, while disabled/absent flags may include registry keys plus the reserved future flags `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` as negative assertions only.
- **Governance Default**: A product-line policy row declaration that sets advisory or enforced resource controls while protecting first intake unless explicitly overridden with a first-intake-blocking reason.
- **Safety Policy**: A config section declaring existing-target behavior, config-owned surfaces, preserved surfaces, blocked side effects, and whether first-intake-blocking governance is explicitly allowed.
- **Target Residue Evidence**: Redacted structured evidence that a target contains conflicting product-line or GitHub ownership state requiring operator cleanup, with `raw_secret_values_emitted:false`, `redacted_fields`, stable IDs/counts, and no raw credential/token/secret values.
- **Seed Evidence Report**: Structured output for preflight, apply, verify, refusal, validation failure, idempotency, and no-mutation proof using `schema_version:"product-line-seed-result-v1"`, explicit status/code/action fields, redaction metadata, snapshots, and exit-code reporting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of required Mission Control seed inputs are represented in the canonical reviewed config's required top-level sections without requiring Mission-Control-specific seeder code paths.
- **SC-002**: A reviewer can validate the Mission Control seed intent from checked-in artifacts in under 10 minutes without running the seeder.
- **SC-003**: Preflight for a valid Mission Control config reports all required validation categories and performs zero writes.
- **SC-004**: Applying the Mission Control config once, then applying it again with `--allow-existing`, produces one stable product-line setup with no duplicate config-owned product-line, department, assignment, workflow, or governance records.
- **SC-005**: Verify mode reports matching Mission Control target state and performs zero writes.
- **SC-006**: Invalid or blocked fixtures for missing identity, unsupported fields, invalid enabled feature flag, reserved future flag enabled in target state, duplicate or conflicting feature-flag declarations, unsupported workflow family, missing/ambiguous/inapplicable workflow slug, unsafe governance, duplicate/conflicting config declarations, existing-target refusal without `--allow-existing`, and repo/product-line ownership conflict each fail before writes and return structured JSON errors with field-level codes, config paths, `mutation_status:"not_mutated"`, and redacted target evidence.
- **SC-007**: No-mutation evidence proves failed invalid-config and blocked-preflight runs leave config-owned seed surfaces and all FR-020 preserved non-owned operational/history surfaces unchanged, including product-line, department, assignment, workflow, governance, feature flags, issue, task, activity, history, evidence, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit or ledger rows, manual workflow templates, non-owned feature-flag keys, row IDs, creation timestamps, task status/linkage/lineage, project ticket counters, assignment timestamps, and workflow use counters.
- **SC-008**: Existing-target apply without `--allow-existing` is refused 100% of the time with `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING`, `mutation_status:"not_mutated"`, and `action_required:"--allow-existing"`.
- **SC-009**: Explicit existing-target apply preserves 100% of FR-020 non-owned operational/history state in covered test scenarios, including issue, task, activity, history, comments, notifications, dispositions, artifacts, quality reviews, evidence, GitHub sync, manual workflow-template, governance audit or ledger, row identity, timestamps, counters, task linkage/status/lineage, assignment timestamps, workflow use counters, and unrelated feature-flag state.
- **SC-010**: Verify mode requires no existing-target write flag and performs zero writes in matching and drifted target scenarios.
- **SC-011**: The Mission Control compatibility wrapper produces the same success/failure evidence categories as the generic command using the Mission Control config, including refusal without `--allow-existing` and idempotent success with `--allow-existing`.
- **SC-012**: Repository review finds zero Product Line B seed configs, Product Line B smoke artifacts, GitHub mutation behavior, work dispatch behavior, runner launch behavior, sandbox creation behavior, or SpecKit setup/autopilot invocation in SPEC-010A seed execution.
- **SC-013**: A future product-line fixture can be schema-validated by changing config values only, with no product-line-specific seeder code edits.

## Assumptions

- SPEC-009B behavior is the parity baseline for Mission Control product-line setup.
- Product-line seed configs are operator-reviewed repository artifacts, not runtime-authored admin records.
- The canonical Mission Control config path is `docs/ai/product-lines/mission-control.yaml`.
- SPEC-010A supports only the existing `mission-control` workflow-contract family; future families require later workflow-contract work.
- Seed feature-flag writes are reviewed config-owned seed operations, not the admin feature-flag mutation path.
- Existing Product Line B onboarding, enablement, smoke, and live UAT remain owned by SPEC-010B.
- Mission Control is the only real product-line config created or applied by SPEC-010A.
- Failed validation and target residue blocking should be machine-readable for automation and concise enough for operator review.
- Structured no-mutation evidence may use stable counts, hashes, or equivalent snapshots over target surfaces.
- Existing target data may include non-owned issue, task, activity, history, and unrelated feature-flag state that must survive seeding.
- Product-line seeding is configuration and verification work only; it does not start or operate autonomous workflows.
