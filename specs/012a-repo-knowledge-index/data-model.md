# Data Model: SPEC-012A - Repo Knowledge Index and AGENTS Map

## Knowledge Index

Canonical machine-readable catalog stored at `docs/ai/repo-knowledge-index.json`.

Fields:

- `version`: schema version string for future migrations.
- `last_verified`: ISO `YYYY-MM-DD` date for the index as a whole.
- `entries`: array of Canonical Index Entry objects.

Validation rules:

- File must exist and parse as JSON.
- File must match `docs/ai/repo-knowledge-index.schema.json`.
- Required discovery target paths must be present exactly once.
- Required paths must resolve inside the repository checkout.

## Canonical Index Entry

Single indexed document or directory.

Required fields:

- `path`: repo-relative path to a file or directory.
- `purpose`: non-empty description of why the entry is authoritative.
- `owner`: non-empty owning role or team string.
- `freshness`: Freshness Rule object.
- `last_verified`: ISO `YYYY-MM-DD` date.
- `related_specs`: array of `SPEC-###` or suffixed `SPEC-###X` identifiers, or an empty array.
- `verification_commands`: array of local commands or explicit manual verification instructions.

Planned optional fields:

- `kind`: `durable-intent`, `execution-ledger`, `status-pointer`, `qa-evidence`, `rollback-runbook`, `operator-tooling`, or `contract`.
- `required`: boolean; required entries fail hard when invalid.
- `repo_owned`: boolean; repo-owned facts fail hard when referenced links are invalid.
- `links`: explicit repo-local links that the guard validates in addition to Markdown links discovered in the entry file.

Validation rules:

- Required metadata fields must be present and non-empty.
- `related_specs` values must match `^SPEC-[0-9]{3}[A-Z0-9]*$`.
- `verification_commands` must contain at least one command or manual verification instruction.
- Required entries must resolve to existing files or directories.

## Freshness Rule

Structured rule describing when an entry must be reverified.

Fields:

- `cadence`: human-readable cadence such as `per PR touching this path` or `before every release`.
- `trigger`: human-readable change trigger such as `when roadmap status changes`.
- `stale_after_days`: optional positive integer for date-based checks.

Validation rules:

- `cadence` and `trigger` are required non-empty strings.
- `stale_after_days`, when present, must be a positive integer.

## Required Discovery Target

Path every fresh agent must resolve through the canonical index.

Required paths:

- `AGENTS.md`
- `docs/rc-factory-v1-prd.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/`
- `docs/ai/specs/SPEC-012A-workflow.md`
- `docs/ai/specs/autopilot-state.json`
- `docs/qa/pilot-smoke-checklist.md`
- `docs/runbook/migration-rollback.md`
- `docs/ai/workflows/mission-control/workflow-contract.yaml`

Validation rules:

- Every required path appears in the index.
- Every required path exists on disk.
- Fresh-agent proxy resolves product, roadmap, workflow/status, QA, rollback, root map, and GitNexus guidance targets through these entries.

## Guard Finding

Result produced by the index guard or fresh-agent proxy.

Fields:

- `level`: `error`, `warning`, or `info`.
- `code`: stable machine-readable identifier.
- `path`: relevant repo-relative path when available.
- `entry_path`: index entry path when available.
- `message`: actionable human-readable message.
- `details`: optional object with observed and expected values.

Validation rules:

- Any `error` exits non-zero.
- Warnings for external URLs, Obsidian-style wikilinks, and optional links do not fail CI.
- Failure output names the offending entry, field, file, or status relationship.
- Finding codes are stable and include at least `index_missing`, `schema_missing`, `json_malformed`, `schema_invalid`, `required_entry_missing`, `required_path_missing`, `required_path_outside_repo`, `metadata_missing`, `metadata_invalid`, `related_spec_invalid`, `required_link_broken`, `status_pointer_stale`, `external_link_warning`, `wikilink_warning`, and `optional_link_warning`.

## Status Pointer Check

Narrow relationship used to detect stale SPEC-012A status pointers.

Fields:

- `roadmap_path`: `docs/ai/rc-factory-technical-roadmap.md`.
- `workflow_path`: `docs/ai/specs/SPEC-012A-workflow.md`.
- `state_path`: `docs/ai/specs/autopilot-state.json`.
- `expected_relationship`: roadmap SPEC-012A status and workflow/state active target must agree on the active SPEC-012A work item.

Validation rules:

- Missing or unreadable files are hard failures because all three are required entries.
- Disagreement failures must name all disagreeing files, observed values, and expected relationship.
