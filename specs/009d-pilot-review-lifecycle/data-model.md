# Data Model: Pilot Review Packet and Lifecycle Snapshot

## Pilot Review Packet

Reviewable lifecycle snapshot for the proven self-hosting pilot.

Fields:
- `schema_version`: fixed `spec-009d.packet.v1`.
- `generated_at`: packet generation timestamp.
- `packet_identity`: GitHub issue, root task, lifecycle descendant ids, linked PR evidence, and artifact owner task.
- `candidate`: eligibility state, proof fields, exclusion reason for local-only lookalikes, and warnings.
- `lifecycle`: root task, descendants, current stage, latest terminal activity, duplicate-active-stage evidence, and cleaned replay evidence when applicable.
- `gates`: owner gate and Aegis decision derived from existing task, notification, activity, and `quality_reviews` evidence.
- `evidence`: artifact, governance, latest error, GitHub sync, smoke checklist, and PR evidence entries.
- `deferrals`: future-state entries for run, sync automation, claim, retry, sandbox, adapter, and harness fields.
- `warnings`: structured non-fatal missing, malformed, stale, superseded, quarantined, or oversized evidence warnings.
- `source_map`: RFC 6901-style pointer map for every evidence-backed claim.

Validation rules:
- Required packet candidate proof: `github_repo`, `github_issue_number`, `github_synced_at`, and either `github_pr_number` or checklist-backed issue/PR evidence.
- JSON artifact is invalid if required identity/sync proof is missing but packet state claims `proven`.
- Evidence-backed claims must have at least one `source_map` reference.
- Missing evidence is represented as `not_available`, `incomplete`, `deferred`, or a warning with reason.
- Fresh GitHub calls are not allowed during assembly.

## Packet Artifact

Persisted JSON or Markdown output stored through existing `task_artifacts`.

Fields:
- `artifact_type`: `pilot_review_packet_json` or `pilot_review_packet_markdown`.
- `schema_version`: `spec-009d.packet.v1` for JSON; Markdown points to the JSON artifact identity or hash.
- `storage_kind`: `inline_json` for JSON and `inline_markdown` for Markdown unless existing artifact size limits require file-backed storage.
- Existing artifact metadata: `artifact_id`, `sha256`, `byte_size`, `mime`, `redaction_status`, `security_scan_status`, `preview_text`, `supersedes_artifact_id`, `workflow_template_slug`, and `created_at`.

Validation rules:
- JSON and Markdown are generated from the same packet snapshot.
- Markdown must summarize, not contradict, JSON lifecycle and gate values.
- Quarantined evidence is metadata-only.
- Packet-local `evidence_state` does not change existing `task_artifacts` enum semantics.

## Artifact Owner Task

Durable GitHub-linked pilot candidate task that owns packet artifacts.

Fields:
- `task_id`
- `workspace_id`
- `github_repo`
- `github_issue_number`
- `github_pr_number`
- `github_synced_at`
- `parent_task_id`
- `root_task_id`
- `chain_id`
- `chain_stage`
- `status`

Validation rules:
- Disposable replay rows are cited through source-map references, not used as synthetic artifact owners.
- Current active Mission Control state requires live row pointers. Archived UAT proof may use smoke checklist plus retained sync rows when cleanup removed disposable rows.

## Source Map Reference

Trace from one packet claim to stored evidence.

Fields:
- `source_type`
- `table`
- `row_id`
- `field`
- `json_path`
- `artifact_id`
- `checklist_path`
- `checklist_anchor`
- `github_repo`
- `github_issue_number`
- `github_pr_number`
- `observed_at`

Validation rules:
- Each pointer key uses RFC 6901-style JSON Pointer syntax such as `/lifecycle/current_stage`.
- Each evidence-backed claim has one or more references.
- Empty source maps are allowed only for explicit future deferrals where no stored evidence proves absence.

## Deferred Field

Explicit representation of future capability absence.

Fields:
- `state`: `deferred` or `not_available`.
- `owner_specs`: future owning spec ids.
- `reason_code`: stable machine-readable reason.
- `reason`: reviewer-readable reason.
- `source_map`: references proving absence where applicable.

Canonical ownership:
- `run_state`: SPEC-013A.
- `github_sync_automation`: SPEC-013A1.
- `claim_authority`: SPEC-013B.
- `retry_controls`: SPEC-013C.
- `sandbox_lifecycle`: SPEC-014A.
- `adapter_registry`: SPEC-014B.
- `real_harness_execution`: SPEC-014C and SPEC-014D.

## Packet Evidence Entry

Packet-local normalized evidence item.

Fields:
- `kind`
- `evidence_state`: `available`, `redacted`, `quarantined`, `oversized`, `missing`, `malformed`, `superseded`, or `stale`.
- Existing artifact metadata when applicable.
- `summary`
- `warning_code`
- `source_map`

Validation rules:
- Secret-bearing or unsafe evidence never exposes raw content.
- Binary or otherwise non-redactable secret findings expose no preview text.
- Superseded/stale evidence remains traceable but is not selected as current.

## State Transitions

Candidate states:
- `not_evaluated` -> `eligible`
- `not_evaluated` -> `local_only_excluded`
- `eligible` -> `proven`
- `eligible` -> `incomplete`
- `proven` -> `published`
- `incomplete` -> `published_incomplete`

Artifact states:
- `generated` -> `published`
- `published` -> `superseded`
- `published` -> `quarantined_metadata_only`

Deferred fields do not transition to active capability inside SPEC-009D; future specs replace or supplement them.
