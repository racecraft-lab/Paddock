# Data Model: SPEC-009A Workflow Contract Format and Roundtrip

## Workflow Contract

**Purpose**: Versioned repo-owned policy bundle for one workflow family.

**Fields**:
- `contract_version`: positive integer, required.
- `schema_version`: positive integer, required.
- `family`: slug string, required. SPEC-009A uses `mission-control`.
- `source_paths`: normalized repo-relative manifest paths, diagnostic output only; excluded from canonical hash when absolute.
- `tracker`: optional Tracker Identity.
- `templates`: non-empty list of Canonical Workflow Template entries.
- `metadata`: optional lifecycle/review metadata with explicitly allowed keys only.

**Validation**:
- Root YAML document must be a single mapping.
- Unknown top-level fields fail validation unless explicitly modeled.
- Duplicate template identities in one loaded contract fail before diff.

## Workflow Manifest

**Purpose**: Canonical YAML source file under `docs/ai/workflows/mission-control/`.

**Fields**:
- `contract_version`
- `schema_version`
- `family`
- `tracker`
- `templates`

**Validation**:
- One YAML 1.2 document per file.
- Multi-document streams, non-mapping roots, duplicate keys, custom tags, anchors, aliases, and merge keys fail before canonical model construction.
- Prompt bodies must be literal YAML block scalars (`|` or `|-`). Folded scalars, plain scalars, quoted multi-line strings, and non-string prompts fail.

## Tracker Identity

**Purpose**: Declares issue-source identity as policy data.

**Fields**:
- `kind`: enum; SPEC-009A supports `github_issues`.
- `owner`: GitHub owner slug.
- `repo`: GitHub repository name.
- `selector_labels`: non-empty string list.
- `priority_rules`: ordered policy objects.
- `area_labels`: optional string list.
- `intake_mode`: enum; SPEC-009A supports local-only non-pilot intake semantics.

**Validation**:
- GitHub owner/repo and selector labels are required for `github_issues`.
- Provider-specific runner credentials or mandatory adapter bindings are rejected.

## Canonical Workflow Template

**Purpose**: Typed normalized representation used for validation, diffing, import, export, and hashing.

**Fields**:
- `slug`: required runtime identity within a workspace.
- `name`: human-readable template name.
- `version`: positive integer.
- `description`: optional string.
- `prompt`: literal block-scalar prompt text normalized from CRLF to LF for hashing.
- `agent_role`: optional runtime role projection.
- `model`: optional runtime model projection.
- `timeout_seconds`: optional positive integer runtime projection.
- `variables`: required and optional template variable declarations.
- `capabilities`: provider-neutral required/optional capability declarations.
- `adapter_requirements`: data-only adapter requirements.
- `feature_flags`: data-only feature-flag dependencies for later specs.
- `governance`: data-only policy references and thresholds.
- `concurrency`: data-only concurrency declaration.
- `retry`: data-only retry declaration.
- `sandbox`: data-only sandbox declaration.
- `routing_rules`: optional routing-rule data and declared hash.
- `output_schema`: optional JSON Schema data and declared hash.
- `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`, `next_template_slug`: runtime projection fields when declared.

**Validation**:
- `workspace_id + slug` is the runtime upsert identity.
- Unknown variables outside the allowlisted namespaces fail validation. Initial namespaces: `task`, `workspace`, `project`, `github_issue`, `artifacts`, `prior_outputs`, and explicit governance context fields required by later specs.
- Routing-rule and output-schema hashes must match canonical per-template hash computation.
- Governance, concurrency, retry, sandbox, capabilities, adapter requirements, and feature flags are validated as shape-only metadata and never executed by SPEC-009A.

## Runtime Workflow Template Projection

**Purpose**: Existing `workflow_templates` row created, updated, disabled, or left unchanged only during explicit apply.

**Fields Used**:
- Existing columns from migrations `006_workflow_templates` and `054_workflow_templates_task_chain_routing_and_artifact_policy`, including `workspace_id`, `slug`, `task_prompt`, `agent_role`, `model`, `timeout_seconds`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`.

**Validation**:
- Dry-run never mutates rows.
- Apply mutates only rows in the contract family ownership scope.
- Unrelated templates are preserved.
- Apply computes full diff before mutation and runs all mutation, diagnostics, and snapshot writes in one transaction.

## Contract Diff

**Purpose**: Deterministic report comparing canonical contract data to runtime projection.

**Fields**:
- `creates`: templates absent from runtime.
- `updates`: templates present with field-level differences.
- `disables`: templates owned by the contract scope but absent from current canonical source, when disable semantics apply.
- `removes`: logical remove/disable reporting only; destructive deletion is not required for SPEC-009A.
- `noops`: templates already matching canonical data.
- `unrelated_preserved`: count of templates outside the ownership scope.

**Validation**:
- Diff order is deterministic by workspace and slug.
- Diff excludes timestamps, row ids, diagnostics run ids, absolute paths, and Markdown bytes.

## Parity Hash Set

**Purpose**: Stable evidence for no-op import/export parity.

**Fields**:
- `algorithm`: `sha256`.
- `envelope`: `workflow-contract-hash-v1`.
- `canonical_object_hash`: hash over stable sorted JSON of typed canonical model.
- `template_hashes`: per-template canonical hashes.
- `routing_rule_hashes`: per-template routing-rule hashes.
- `output_schema_hashes`: per-template output-schema hashes.

**Validation**:
- Prompt text uses LF-normalized parsed prompt content.
- Hash input excludes timestamps, row ids, diagnostics run ids, absolute local paths, and Markdown bytes.

## Workflow Contract Run

**Purpose**: Generic diagnostics summary for import, export, or recovery attempts.

**Storage**: `workflow_contract_runs` in migration `071_workflow_contract_diagnostics`.

**Fields**:
- `id`
- `workspace_id`
- `family`
- `mode`: `import_dry_run`, `import_apply`, `export`, `recovery_dry_run`, `recovery_apply`.
- `status`: `success`, `validation_failed`, `usage_error`, `storage_failed`, `io_failed`, `unexpected_failed`.
- `mutation_status`: `none`, `committed`, `rolled_back`, `not_attempted`.
- `source_paths_json`
- `export_artifact_path`
- `canonical_object_hash`
- `template_hashes_json`
- `routing_rule_hashes_json`
- `output_schema_hashes_json`
- `diff_summary_json`
- `template_count`
- `error_count`
- `snapshot_id`
- `recovery_command`
- `created_at`

## Workflow Contract Run Error

**Purpose**: Filterable validation or runtime error linked to a run.

**Storage**: `workflow_contract_run_errors`.

**Fields**:
- `id`
- `run_id`
- `code`
- `severity`
- `manifest_path`
- `canonical_model_path`
- `template_slug`
- `message`
- `remediation_hint`
- `mutation_status`
- `details_redacted`
- `created_at`

**Validation**:
- Details are redacted or truncated.
- Prompt bodies and secrets are never exposed in full diagnostics.

## Workflow Contract Snapshot

**Purpose**: Last-known-good canonical snapshot for recovery.

**Storage**: `workflow_contract_snapshots`.

**Fields**:
- `id`
- `workspace_id`
- `family`
- `contract_version`
- `schema_version`
- `canonical_snapshot_json`
- `canonical_object_hash`
- `template_hashes_json`
- `routing_rule_hashes_json`
- `output_schema_hashes_json`
- `source_paths_json`
- `recovery_command`
- `created_by_run_id`
- `created_at`

**Validation**:
- Written only after successful apply.
- Failed reloads or imports never replace the previous snapshot.
- Recovery can dry-run before explicit apply.
