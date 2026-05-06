# Feature Specification: SPEC-009A Workflow Contract Format and Roundtrip

**Feature Branch**: `009a-workflow-contract-roundtrip`  
**Created**: 2026-05-06  
**Status**: Draft  
**Input**: User description: "Create a specification for RC Factory Phase 8A in Mission Control: a process-only workflow contract roundtrip slice that defines repo-owned workflow contract files, import/export commands, validation rules, parity hashes, last-known-good behavior, and diagnostics without running the Mission Control self-hosting pilot."

## Clarifications

### Session 2026-05-06 - Contract Format And Validation Stack

- Q: Which YAML parser and pin policy are authoritative? A: SPEC-009A uses the existing lockfile-proven `yaml@2.8.2` package as an exact direct production dependency, not a transitive import and not a caret range.
- Q: What YAML source shape is accepted? A: Each manifest is one YAML 1.2 document rooted at a mapping with `contract_version`, `schema_version`, `family`, optional tracker metadata, and a `templates` list; multi-document streams, non-mapping roots, duplicate keys, custom tags, anchors, aliases, and merge keys fail before canonical model construction.
- Q: How are prompt bodies represented for stable roundtrip behavior? A: Prompt bodies must be authored as literal YAML block scalars (`|` or `|-`); folded block scalars (`>`) and plain/quoted multi-line prompt bodies fail validation, and canonical prompt hashing uses the parsed prompt text after CRLF-to-LF normalization.
- Q: Which schema-validation profile applies? A: Contract model validation reuses the existing AJV 8 strict profile: `strict: true`, `validateSchema: true`, `$data: false`, `validateFormats: false`, `allErrors: false`, `useDefaults: false`, `coerceTypes: false`, `removeAdditional: false`, and `addUsedSchema: false`; unsupported schema keywords, custom formats, default insertion, coercion, and data mutation fail closed.
- Q: Where is the TypeScript object-model boundary? A: YAML parser output remains untrusted until copied into a typed canonical workflow-contract model; only that canonical model may drive validation, diffing, import, export, and hashing, and governance/concurrency/retry/sandbox declarations remain inert data for later specs to enforce.

### Session 2026-05-06 - Import, Export, Hashes, And Recovery

- Q: How do dry-run and apply behave? A: Import dry-run is the default and never mutates runtime templates; apply requires an explicit `--apply` mode, is mutually exclusive with `--dry-run`, and returns deterministic exit codes for success, usage/config errors, validation failures, and unexpected storage or I/O failures.
- Q: What is the mutation boundary? A: Apply validates and computes the full diff before mutation, then performs all owned-template upserts, disables, diagnostics writes, and last-known-good snapshot writes in one SQLite transaction; if any statement fails, no partial apply is visible.
- Q: What identifies an owned runtime template? A: The contract projects each template to the existing `workflow_templates` identity of workspace plus template slug; only templates within the declared contract family and ownership scope are created, updated, disabled, or left unchanged, and unrelated templates are preserved.
- Q: What is the canonical hash shape? A: Parity hashes use a versioned `workflow-contract-hash-v1` envelope and SHA-256 over stable sorted JSON of the typed canonical model, with separate per-template routing-rule and output-schema hashes; timestamps, database row ids, diagnostics run ids, absolute local paths, and Markdown bytes are excluded.
- Q: Where does Markdown export go? A: The default generated review artifact is `docs/ai/workflows/mission-control/exports/workflow-contract.md`; operators may override the output path, but Markdown remains non-canonical and cannot be imported.
- Q: How does last-known-good recovery work? A: Every successful apply records the canonical snapshot reference, parity hashes, source paths, and a deterministic recovery command; recovery is operator-triggered and can dry-run or explicitly apply the last-known-good snapshot, but failed reloads never replace it.

### Session 2026-05-06 - Diagnostics, UI Boundary, And Cross-Spec Governance

- Q: What diagnostics persistence shape is reusable beyond SPEC-009A? A: Persistence uses generic workflow-contract tables: `workflow_contract_runs` for run summaries, `workflow_contract_run_errors` for filterable validation errors, and `workflow_contract_snapshots` for last-known-good canonical snapshots; names must not include `spec_009a`.
- Q: What migration slot is reserved for diagnostics? A: If diagnostics persistence requires schema, use additive migration `070_workflow_contract_diagnostics` with `docs/migrations/rollback-M70.sql`, unless a concurrent merge takes M70 first and the migration is rebased per the repository migration reservation policy.
- Q: What does the existing Orchestration/Workflows surface show? A: A diagnostics-only Workflow Contracts view shows source paths, family, mode, status, template counts, diff counts, validation errors grouped by manifest/template/code, parity hashes, last successful apply, last-known-good availability, recovery command, and export artifact path.
- Q: What can the UI mutate? A: SPEC-009A UI is read-only diagnostics plus copy/open affordances for commands and artifacts; it does not edit manifests, apply imports, launch workflows, dispatch tasks, or acknowledge governance overrides.
- Q: How are governance, concurrency, retry, sandbox, and adapter declarations handled? A: SPEC-009A validates their shape and roundtrips them as policy data only; it never invokes the resource-governance evaluator, scheduler, GitHub ingest/sync, task dispatch, retry engine, runner launch, sandbox lifecycle, or harness adapter APIs.
- Q: What must operator-visible failures contain? A: Every failure carries a stable code, manifest path, canonical model path, template slug when available, concise remediation hint, mutation status, and redacted/truncated details so prompt bodies or secrets are not exposed in diagnostics.

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
- **FR-031**: System MUST declare `yaml@2.8.2` as an exact direct production dependency for YAML syntax and loading before implementation proceeds.
- **FR-032**: System MUST NOT introduce a second schema-validation stack for the canonical workflow-contract model.
- **FR-033**: System MUST reject multi-document YAML streams, non-mapping document roots, duplicate mapping keys, custom tags, anchors, aliases, and merge keys before constructing the canonical workflow-contract model.
- **FR-034**: System MUST require prompt bodies to be literal YAML block scalars and reject folded, plain, or quoted multi-line prompt bodies for contract-owned workflow templates.
- **FR-035**: System MUST normalize prompt text line endings to LF before canonical hashing while preserving all other parsed prompt text.
- **FR-036**: System MUST reuse the existing AJV 8 strict validation profile without enabling data references, format plugins, default insertion, type coercion, additional-property removal, or schema-data mutation.
- **FR-037**: System MUST make import dry-run the default mode and require an explicit, mutually exclusive apply mode for runtime template mutation.
- **FR-038**: System MUST use deterministic exit codes for successful import/export/recovery, usage or configuration errors, validation failures, and unexpected storage or I/O failures.
- **FR-039**: System MUST compute the full import diff before mutation and perform all apply changes, diagnostics writes, and last-known-good snapshot writes inside one SQLite transaction.
- **FR-040**: System MUST treat workspace plus template slug as the runtime upsert identity for contract-owned templates.
- **FR-041**: System MUST compute canonical parity hashes from a versioned SHA-256 envelope over stable sorted JSON of the typed canonical model, excluding timestamps, database row ids, diagnostics run ids, absolute local paths, and Markdown bytes.
- **FR-042**: System MUST compute separate stable per-template hashes for routing rules and output schemas.
- **FR-043**: System MUST export the default Markdown review artifact to `docs/ai/workflows/mission-control/exports/workflow-contract.md` unless the operator provides an explicit output path.
- **FR-044**: System MUST record a deterministic operator recovery command with every successful last-known-good snapshot.
- **FR-045**: System MUST allow last-known-good recovery to run in dry-run mode before explicit apply mode.
- **FR-046**: System MUST persist reusable workflow-contract run summaries in a generic diagnostics table that is not named for SPEC-009A.
- **FR-047**: System MUST persist workflow-contract validation errors in a filterable generic diagnostics table linked to the run summary.
- **FR-048**: System MUST persist last-known-good canonical snapshots in a generic workflow-contract snapshot table linked to successful apply runs.
- **FR-049**: Diagnostics schema, if added, MUST use additive migration `070_workflow_contract_diagnostics` and ship a matching `docs/migrations/rollback-M70.sql`, unless migration-id collision requires a documented rebase.
- **FR-050**: Workflow-contract diagnostics UI MUST be read-only for SPEC-009A and MUST NOT apply imports, edit manifests, launch workflows, dispatch tasks, or grant governance overrides.
- **FR-051**: System MUST NOT invoke the resource-governance evaluator, scheduler, GitHub ingest or sync, task dispatch, retry engine, runner launch, sandbox lifecycle, or harness adapter APIs during validation, import, export, diagnostics, or recovery.
- **FR-052**: Operator-visible failures MUST include stable error code, manifest path, canonical model path, template slug when available, remediation hint, mutation status, and redacted or truncated details.

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
