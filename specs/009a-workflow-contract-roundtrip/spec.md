# Feature Specification: SPEC-009A Workflow Contract Format and Roundtrip

**Feature Branch**: `009a-workflow-contract-roundtrip`  
**Created**: 2026-05-06  
**Status**: Draft  
**Input**: User description: "Create a specification for RC Factory Phase 8A in Mission Control: a process-only workflow contract roundtrip slice that defines repo-owned workflow contract files, import/export commands, validation rules, parity hashes, last-known-good behavior, and diagnostics without running the Mission Control self-hosting pilot."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview Contract Changes (Priority: P1)

As an operator, I can run contract import in dry-run mode and inspect the exact template diff before any runtime data changes.

**Why this priority**: Operators need a safe review loop before trusting repo-owned workflow policy as the source of runtime workflow templates.

**Independent Test**: Provide a valid workflow contract that differs from runtime templates, run dry-run import, and verify the reported create/update/remove/no-op diff matches the contract while runtime templates remain unchanged.

**Acceptance Scenarios**:

1. **Given** runtime workflow templates and a valid repo-owned contract with one changed template, **When** the operator runs dry-run import, **Then** the system reports the exact field-level change and does not mutate runtime templates.
2. **Given** a valid repo-owned contract that matches runtime templates, **When** the operator runs dry-run import, **Then** the system reports no mutations required and includes stable parity evidence.

---

### User Story 2 - Apply Valid Contract Transactionally (Priority: P1)

As an operator, I can apply a valid repo-owned contract so matching workflow templates are synchronized while unrelated templates are preserved.

**Why this priority**: The contract only becomes operationally useful when it can seed or sync known templates without damaging unrelated local workflow policy.

**Independent Test**: Apply a valid contract containing a scoped set of templates in a runtime store that also contains unrelated templates, then verify only in-scope templates changed and the operation either fully succeeds or leaves the previous state intact.

**Acceptance Scenarios**:

1. **Given** a valid contract and runtime templates containing unrelated entries, **When** the operator runs import apply mode, **Then** only templates owned by the contract scope are created, updated, disabled, or left unchanged according to the contract.
2. **Given** a valid contract whose apply operation encounters a mutation failure, **When** the operator runs import apply mode, **Then** no partial template changes remain after the operation ends.

---

### User Story 3 - Export Reviewable Markdown With Roundtrip Parity (Priority: P1)

As an operator, I can export runtime workflow templates to Markdown and prove no-op roundtrip parity through stable hashes.

**Why this priority**: Reviewers need human-readable output while automation needs deterministic evidence that import and export preserve the same workflow meaning.

**Independent Test**: Import a valid contract, export the synced templates to Markdown, import the same canonical contract again in dry-run mode, and verify the generated hashes show no semantic drift.

**Acceptance Scenarios**:

1. **Given** runtime templates synced from a valid contract, **When** the operator exports review Markdown, **Then** the export contains all contract-owned templates, validation status, and parity hashes in a deterministic order.
2. **Given** a canonical contract with no semantic changes, **When** it is imported, exported, and checked again, **Then** the canonical object hash, routing-rule hash, and output-schema hash remain stable.

---

### User Story 4 - Fail Closed And Recover From Last Known Good (Priority: P1)

As an operator, I see invalid contract failures before mutation and can recover from the last-known-good snapshot.

**Why this priority**: Workflow policy controls autonomous execution, so invalid policy must not partially load or silently degrade into unsafe runtime behavior.

**Independent Test**: Submit invalid contracts for syntax, model, unknown variable, tracker identity, hash, and governance errors; verify each failure is reported before mutation and the previous usable snapshot remains recoverable.

**Acceptance Scenarios**:

1. **Given** an invalid repo-owned contract, **When** the operator runs dry-run or apply import, **Then** the system rejects the contract before mutation and reports actionable validation errors.
2. **Given** the latest contract reload fails after a previous successful apply, **When** the operator requests recovery state, **Then** the system exposes the last-known-good snapshot and does not replace it with the failed contract.

---

### User Story 5 - Inspect Workflow Contract Diagnostics (Priority: P2)

As an admin, I can inspect reusable workflow-contract diagnostics in the existing Orchestration/Workflows surface.

**Why this priority**: Operators and reviewers need shared visibility into contract health, diffs, hashes, and recovery state without reading local files directly.

**Independent Test**: Generate valid, changed, invalid, and last-known-good contract states, then verify the Workflows diagnostics surface reports source paths, validation outcomes, diffs, hashes, and recovery status consistently.

**Acceptance Scenarios**:

1. **Given** a successful contract import or export, **When** an admin opens workflow-contract diagnostics, **Then** the surface shows source path, contract version, template counts, parity hashes, last applied time, and validation outcome.
2. **Given** a failed contract validation, **When** an admin opens workflow-contract diagnostics, **Then** the surface shows grouped validation errors, whether runtime data was preserved, and the available last-known-good state.

---

### User Story 6 - Declare Future Runtime Policy As Data (Priority: P3)

As a future runtime implementer, I can rely on provider-neutral capabilities, adapter requirements, governance, concurrency, retry, and sandbox declarations without SPEC-009A launching work.

**Why this priority**: Later specs need stable policy data, but this slice must stay process-only and avoid dispatch, harness, or self-hosting behavior.

**Independent Test**: Validate contracts that declare capabilities, adapter requirements, feature flags, governance, concurrency, retry, sandbox, prompt version, routing-rule hash, and output-schema hash; verify those declarations are persisted and exported as data only.

**Acceptance Scenarios**:

1. **Given** a valid contract with future runtime declarations, **When** the contract is imported and exported, **Then** each declaration roundtrips unchanged as policy data.
2. **Given** a valid contract that includes future runtime declarations, **When** the contract is applied, **Then** no GitHub ingestion, dispatch, runner launch, sandbox lifecycle, retry execution, auto-merge, or self-hosting pilot work starts.

---

### Edge Cases

- Contract source directory is missing, empty, or contains no valid manifests.
- A manifest has valid syntax but violates the canonical object model.
- A prompt body contains template variables outside the explicit allowlist namespaces.
- Two manifests define the same workflow template identity or conflicting tracker identity.
- A contract changes routing rules or output schema content without updating the corresponding hash.
- Exported Markdown is manually edited and then used as if it were canonical source.
- Runtime templates include unrelated entries that are not owned by the contract scope.
- Import apply mode fails after validation but before all intended mutations complete.
- Last-known-good state is absent because no valid contract has ever been applied.
- Diagnostics are requested while the latest contract is invalid but runtime templates still reflect the previous valid state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST treat YAML manifests under `docs/ai/workflows/mission-control/` as the canonical source for SPEC-009A workflow contracts.
- **FR-002**: System MUST treat generated Markdown exports as review artifacts only, never as canonical authoring input.
- **FR-003**: System MUST allow prompt bodies to be represented as YAML block scalars so multi-line prompts preserve intended text across import and export.
- **FR-004**: System MUST convert every loaded manifest into a typed canonical workflow-contract model before validation, import, export, diffing, or hashing.
- **FR-005**: System MUST reject contract input that cannot be parsed into the canonical model.
- **FR-006**: System MUST validate contract data against the existing strict JSON Schema validation profile used by Mission Control for structured workflow data.
- **FR-007**: System MUST reject unknown top-level or nested contract fields unless the model explicitly allows them.
- **FR-008**: System MUST reject prompt template variables that are outside explicit allowlist namespaces.
- **FR-009**: System MUST validate GitHub tracker identity v1 declarations before any mutation.
- **FR-010**: System MUST validate provider-neutral capability declarations for every contract-owned workflow template.
- **FR-011**: System MUST validate adapter requirement declarations needed by future harness or control-plane work.
- **FR-012**: System MUST validate feature-flag declarations referenced by contract-owned workflow templates.
- **FR-013**: System MUST validate governance declarations for contract-owned workflow templates.
- **FR-014**: System MUST validate concurrency, retry, and sandbox declarations as data fields without executing those policies.
- **FR-015**: System MUST validate prompt version, routing-rule hash, and output-schema hash for every template that declares those artifacts.
- **FR-016**: System MUST provide an import dry-run mode that reports the exact template diff without mutating runtime workflow templates.
- **FR-017**: System MUST provide an import apply mode that mutates only templates owned by the contract scope.
- **FR-018**: System MUST preserve unrelated workflow templates during import apply mode.
- **FR-019**: System MUST apply valid contract changes transactionally so partial mutation is not visible after a failed apply.
- **FR-020**: System MUST fail closed before mutation when syntax, model, variable, tracker, capability, governance, concurrency, retry, sandbox, prompt-version, routing-rule-hash, or output-schema-hash validation fails.
- **FR-021**: System MUST preserve the last-known-good contract snapshot after every successful apply.
- **FR-022**: System MUST retain the previous last-known-good snapshot when a later reload or import fails.
- **FR-023**: System MUST expose a recovery path that can identify and restore or reapply the last-known-good contract-owned template state.
- **FR-024**: System MUST export contract-owned runtime workflow templates to deterministic Markdown review output.
- **FR-025**: System MUST include stable parity hashes in dry-run, apply, export, and diagnostics output.
- **FR-026**: System MUST make no-op roundtrip parity verifiable through canonical object hash comparison.
- **FR-027**: System MUST expose reusable workflow-contract diagnostics in the existing Orchestration/Workflows surface.
- **FR-028**: System MUST show validation errors, contract diffs, source paths, template counts, parity hashes, last-known-good status, and last successful apply state in diagnostics.
- **FR-029**: System MUST leave existing workflow template behavior unchanged unless an operator explicitly runs import apply mode.
- **FR-030**: System MUST NOT run product-line seed, GitHub issue ingestion, claim or reconciliation work, dispatch, retry execution, auto-merge, runner launch, sandbox lifecycle, harness adapter work, visual editor work, or the Mission Control self-hosting pilot as part of SPEC-009A.
- **FR-031**: Planning MUST confirm a direct pinned YAML parser choice for syntax and loading before implementation proceeds.
- **FR-032**: System MUST NOT introduce a second schema-validation stack for the canonical workflow-contract model.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Workflow Contract**: Versioned repo-owned policy bundle for one or more workflow templates, including contract identity, source path, template ownership scope, validation metadata, and parity hashes.
- **Workflow Manifest**: Canonical YAML source file under `docs/ai/workflows/mission-control/` that declares one or more workflow templates and their associated policy data.
- **Canonical Workflow Template Model**: Typed normalized representation used for validation, import, export, diffing, and hashing.
- **Runtime Workflow Template**: Existing operational workflow-template record that may be created, updated, disabled, or left unchanged when owned by the imported contract scope.
- **Contract Diff**: Deterministic report of create, update, disable, remove, and no-op changes between canonical contract data and runtime templates.
- **Parity Hash Set**: Stable hashes for the canonical object, routing rules, and output schema used to prove no-op roundtrip equivalence.
- **Last-Known-Good Snapshot**: Most recent successfully applied canonical contract-owned template state available for diagnostics and recovery.
- **Workflow Contract Diagnostic**: Reusable status record for source paths, validation outcomes, diffs, hashes, last-known-good state, and last successful apply metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of invalid contract fixtures are rejected before runtime workflow-template mutation.
- **SC-002**: Dry-run import reports create, update, disable/remove, and no-op template differences with no runtime data changes in every tested scenario.
- **SC-003**: Apply mode preserves all unrelated workflow templates in every contract-owned import scenario.
- **SC-004**: Re-importing an unchanged canonical contract produces no required mutations and identical parity hashes across at least three consecutive runs.
- **SC-005**: Exported Markdown ordering and hash output are stable across repeated exports from unchanged runtime templates.
- **SC-006**: Last-known-good state remains available after every failed reload or failed import that follows at least one successful apply.
- **SC-007**: Workflow-contract diagnostics show validation outcome, diffs, source paths, template counts, parity hashes, and recovery status for successful, changed, invalid, and no-last-known-good states.
- **SC-008**: SPEC-009A verification confirms zero product-line seed, dispatch, runner-launch, sandbox-lifecycle, auto-merge, or self-hosting pilot actions are started by import, export, validation, or diagnostics flows.

## Assumptions

- SPEC-009A owns only the process contract roundtrip and diagnostics slice for Mission Control workflow templates.
- The canonical contract source location is limited to `docs/ai/workflows/mission-control/` for this slice.
- Runtime workflow-template records already exist and continue to behave as they did before this feature unless import apply mode is explicitly invoked.
- Markdown export is intended for review and parity evidence, not for later import.
- Last-known-good recovery applies only after at least one successful contract apply has produced a recoverable snapshot.
- Future runtime declarations are stored and validated as policy data only; enforcement belongs to later specs.
