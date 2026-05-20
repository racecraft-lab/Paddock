# Contract: Pilot Review Packet

## JSON Artifact

Artifact metadata:

```json
{
  "artifact_type": "pilot_review_packet_json",
  "storage_kind": "inline_json",
  "mime": "application/json",
  "schema_version": "spec-009d.packet.v1"
}
```

Top-level packet shape:

```json
{
  "schema_version": "spec-009d.packet.v1",
  "generated_at": "2026-05-20T00:00:00.000Z",
  "packet_identity": {},
  "candidate": {},
  "lifecycle": {},
  "gates": {},
  "evidence": {},
  "deferrals": {},
  "warnings": [],
  "source_map": {}
}
```

Required top-level keys:
- `schema_version`
- `generated_at`
- `packet_identity`
- `candidate`
- `lifecycle`
- `gates`
- `evidence`
- `deferrals`
- `warnings`
- `source_map`

Candidate eligibility contract:
- A proven packet candidate requires stored `github_repo`, `github_issue_number`, `github_synced_at`, and either `github_pr_number` or checklist-backed issue/PR evidence.
- A candidate missing stored GitHub linkage or sync proof returns `candidate.state="local_only_excluded"` or `candidate.state="incomplete"` and must not claim pilot completion.
- Packet assembly performs zero fresh GitHub API calls.

Source-map contract:

```json
{
  "/lifecycle/current_stage": [
    {
      "source_type": "table",
      "table": "tasks",
      "row_id": 123,
      "field": "status",
      "observed_at": "2026-05-20T00:00:00.000Z"
    }
  ]
}
```

Reference fields may include:
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

Every evidence-backed packet claim must have one or more source-map references.

Deferral contract:

```json
{
  "run_state": {
    "state": "deferred",
    "owner_specs": ["SPEC-013A"],
    "reason_code": "future_spec_owns_capability",
    "reason": "Durable run-state is outside SPEC-009D.",
    "source_map": []
  }
}
```

Canonical deferral ownership:
- `run_state`: `SPEC-013A`
- `github_sync_automation`: `SPEC-013A1`
- `claim_authority`: `SPEC-013B`
- `retry_controls`: `SPEC-013C`
- `sandbox_lifecycle`: `SPEC-014A`
- `adapter_registry`: `SPEC-014B`
- `real_harness_execution`: `SPEC-014C`, `SPEC-014D`

Evidence-state contract:
- Packet-local `evidence_state` values: `available`, `redacted`, `quarantined`, `oversized`, `missing`, `malformed`, `superseded`, `stale`.
- These values are packet rendering values only and must not be written as new `task_artifacts.redaction_status` or `task_artifacts.security_scan_status` enum values.
- Quarantined evidence is metadata-only and must not include raw content, preview text, storage URI, or actor identity.

## Markdown Artifact

Artifact metadata:

```json
{
  "artifact_type": "pilot_review_packet_markdown",
  "storage_kind": "inline_markdown",
  "mime": "text/markdown",
  "schema_version": "spec-009d.packet.v1"
}
```

Required sections:
- Packet identity
- Candidate eligibility
- Current lifecycle stage
- GitHub issue and PR evidence
- Root task and descendants
- Owner gate
- Aegis decision
- Artifacts
- Governance evidence
- Latest error
- Deferred fields
- Warnings
- JSON artifact id or hash

Markdown must summarize the JSON packet generated from the same source snapshot. It may omit raw machine detail, but it must not contradict JSON lifecycle, gate, evidence, deferral, or warning values.

## Existing API Surface

Publication uses existing artifact behavior through `publishArtifact()` and, where route-mediated publication is needed, `POST /api/task-artifacts`.

Inspection uses existing routes:
- `GET /api/task-artifacts?artifact_type=pilot_review_packet_json`
- `GET /api/task-artifacts?artifact_type=pilot_review_packet_markdown`
- `GET /api/task-artifacts/[id]`

No new packet-specific route is part of SPEC-009D unless implementation tasks prove the existing artifact surface cannot satisfy SC-001.

## Failure And Incomplete States

Packet publication fails when:
- JSON packet shape is invalid.
- Required proven candidate identity or sync proof is missing while state claims `proven`.
- Content would be unsafe to store under existing artifact redaction/security behavior.

Packet publication may proceed with structured warnings when:
- Optional evidence is missing.
- Evidence is stale, superseded, malformed, oversized, redacted, or quarantined.
- Disposable replay rows were intentionally cleaned and retained smoke checklist plus GitHub sync evidence is used instead.
