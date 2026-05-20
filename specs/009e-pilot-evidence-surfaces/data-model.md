# Data Model: Pilot Evidence Surfaces

## Task Evidence Response

Generic API envelope returned by `GET /api/tasks/[id]/evidence`.

**Fields**:

- `schema_version`: version string for the evidence contract, initially `task_evidence.v1`.
- `task`: task identity and current task-local metadata that is safe for the operator to view.
- `pilot_eligibility`: current pilot eligibility state and missing-proof reasons.
- `identity`: stored GitHub issue/PR identity and task-local identity evidence.
- `packet_artifacts`: review packet artifact references and safe metadata.
- `smoke`: stored smoke checklist proof references or missing/unavailable state.
- `current_stage`: current task/activity stage from Mission Control rows, with snapshot disagreement warnings when needed.
- `warnings`: non-fatal warnings such as stale artifact, unavailable artifact store, malformed/oversized evidence, conflicting sources, or cleaned UAT row rationale.
- `deferrals`: future-state categories deliberately not implemented in SPEC-009E.
- `source_map`: traceable pointers to stored Mission Control sources used for each section.

**Validation rules**:

- Must not inline artifact body content.
- Must not include storage URI, object path, signed URL, raw secret value, parser internals, or actor identity for unsafe artifact states.
- Must use v1 snake_case states: `eligible`, `not_eligible`, `incomplete`, `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, `unavailable`, and `deferred`.
- Oversized and malformed evidence are warning reason codes, not top-level eligibility states.
- Missing or incomplete evidence for an otherwise readable task remains a `200` domain state.

## Task

Task-local record summarized by the evidence route.

**Fields**:

- `id`: task id from route path.
- `title`: safe task title when available.
- `status`: current task status.
- `workspace_id`: authorized workspace id or equivalent scoped value when safe to expose.
- `github_repo`: stored GitHub repository when present.
- `github_issue_number`: stored issue number when present.
- `github_pr_number`: stored pull request number when present.

**Relationships**:

- Has zero or more artifact references.
- Has zero or more quality review and governance evidence rows.
- Has current activity/state rows used for live stage.

## Pilot Eligibility Evidence

Explains whether a task is eligible for pilot review and why.

**Fields**:

- `state`: `eligible`, `not_eligible`, or `incomplete`.
- `reasons`: structured missing/ineligible reason codes.
- `inputs`: safe summary of stored inputs considered.

**State rules**:

- `eligible`: required identity, packet, smoke, and retained pilot proof are present from stored evidence.
- `incomplete`: some pilot-relevant proof exists, but required categories are missing or unavailable.
- `not_eligible`: task is local-only, non-pilot, or lacks required GitHub-linked identity.
- Packet-local `local_only_excluded` maps to `not_eligible`.

## GitHub Task Identity

Stored identity evidence for GitHub issue and PR links.

**Fields**:

- `state`: `available`, `missing`, `stale`, or `unavailable`.
- `repository`: safe repository identifier when stored.
- `issue`: issue number/reference when stored.
- `pull_request`: PR number/reference when stored.
- `missing`: reason codes for absent issue or PR proof.

**Rules**:

- Route does not call GitHub.
- Missing issue/PR proof is represented as evidence state, not a sync trigger.

## Review Packet Reference

Safe reference to existing packet artifacts.

**Fields**:

- `state`: `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, or `unavailable`.
- `artifact_id`: stored artifact id when safe.
- `kind`: packet JSON, Markdown review export, source map, or related packet reference.
- `display_name`: safe reference label.
- `sha256`: safe digest when stored and allowed.
- `mime_type`: safe MIME metadata when stored.
- `size_bytes`: safe size metadata when stored.
- `created_at`: timestamp when stored and allowed.
- `warning_codes`: malformed, oversized, unsafe, secret_bearing, stale, superseded, artifact_store_disabled, or other safe reason codes.

**Rules**:

- Superseded references are trace-only and must not count as current proof.
- Quarantined, unsafe, secret-bearing, malformed, and oversized evidence must not expose raw content or private storage pointers.

## Smoke Checklist Evidence

Stored smoke/UAT proof for pilot evidence.

**Fields**:

- `state`: `available`, `missing`, `incomplete`, or `unavailable`.
- `references`: stored packet/source-map or static UAT references.
- `missing`: missing smoke proof reason codes.

**Rules**:

- Runtime derivation does not parse `docs/qa/pilot-smoke-checklist.md`.
- The checklist is the UAT ledger for recording SPEC-009E validation.

## Current Stage Evidence

Current task stage derived from stored Mission Control state.

**Fields**:

- `state`: `available`, `missing`, `stale`, or `unavailable`.
- `current_status`: current task status/stage.
- `activity_reference`: safe pointer to current activity evidence when present.
- `snapshot_status`: packet snapshot status when present.
- `warnings`: source disagreement or stale snapshot warnings.

**Rules**:

- Current task/activity rows win for live stage.
- Packet snapshots remain source-map evidence and may produce warnings when stale or conflicting.

## Future-State Deferral

Explicit row for intentionally deferred capability categories.

**Fields**:

- `category`: run_state, sync_automation, claim_authority, retry_debug_controls, sandbox_lifecycle, adapter_registry, or real_harness_execution.
- `state`: `deferred`.
- `owner_spec`: SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, or SPEC-014A-D.
- `label`: human-readable operator label.

**Rules**:

- Deferrals are display-only.
- No control, mutation, refresh, retry, claim, sandbox, adapter, or harness action is added.

## Source Map Entry

Trace pointer explaining where a section's evidence came from.

**Fields**:

- `section`: response section name.
- `source_type`: task, activity, artifact, packet, quality_review, governance, github_sync, retained_github_issue, retained_github_pr, static_uat_link, or cleanup_note.
- `source_id`: safe stored id or reference.
- `state`: available/missing/unavailable/stale/deferred as applicable.
- `note`: short safe explanation.

**Rules**:

- Source map may point at retained external issue #50 / PR #51 and static UAT links as archived proof.
- Cleaned disposable row pointers are represented as `unavailable` or `missing` with cleanup rationale, never as current live state.
