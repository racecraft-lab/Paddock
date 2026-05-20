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
- Must treat stored evidence-derived strings as untrusted display text; raw HTML, Markdown links, autolinks, script-capable markup, and unsafe URL schemes must not become active links or executable markup.
- Active links may be constructed only from typed contract references such as GitHub issue/PR references, artifact ids or hashes, source-map pointers, checklist anchors, or static UAT links after protocol and destination-family validation.
- Must use v1 snake_case states: `eligible`, `not_eligible`, `incomplete`, `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, `unavailable`, and `deferred`.
- Oversized and malformed evidence are warning reason codes, not top-level eligibility states.
- Missing or incomplete evidence for an otherwise readable task remains a `200` domain state.

## V1 Evidence State Model

This section is the authoritative state model for SPEC-009E. The API-provided state is authoritative for every task evidence section. UI rendering is a one-way projection from this model and must not reinterpret, synthesize, persist, or override section states.

### Allowed Evidence States

| API state | Meaning | Display behavior | Metadata | Prohibited behavior |
| --- | --- | --- | --- | --- |
| `eligible` | Pilot eligibility inputs satisfy the stored-evidence contract for the task. | Show eligible pilot proof and source-map references. | Eligibility inputs and source-map pointers. | Do not infer eligibility from client-side links, cached data, or hidden refreshes. |
| `not_eligible` | The task is local-only, non-pilot, or lacks required GitHub-linked identity. | Show a compact not-eligible explanation. | Missing or ineligible reason codes. | Do not convert to `missing`; absence is intentional for this context. |
| `incomplete` | Some relevant proof exists, but required proof categories are missing or unavailable. | Show incomplete state and list missing categories. | Missing category and completeness reason codes. | Do not merge neighboring sections or local state to complete proof. |
| `available` | Stored evidence exists and is safe to summarize. | Show the available summary, safe references, and permitted metadata. | Stored ids, labels, hashes, sizes, timestamps, or source-map pointers when safe. | Do not downgrade based on client-side timestamp checks. |
| `missing` | Expected stored evidence is absent. | Show missing proof with API-provided reason. | Missing reason codes or expected source names. | Do not synthesize placeholder proof or trigger collection. |
| `stale` | Stored evidence exists but a newer stored lifecycle, sync, artifact, packet, or activity record supersedes its current-proof value. | Show stale proof as trace or warning evidence. | Stale or source-disagreement reason codes. | Do not make freshness decisions from wall-clock age or call external sources to refresh it. |
| `redacted` | Evidence exists but only a post-redaction safe preview or metadata may be exposed. | Show redacted state and permitted safe metadata only. | Existing redaction status, hash, byte count, source-map pointer, and safe preview when allowed. | Do not recover, cache, infer, or display redacted content. |
| `quarantined` | Evidence exists but trust/safety or artifact policy bars content exposure. | Show metadata-only quarantined state. | Existing security-scan status, hash, byte count, and safe reason code. | Do not expose raw content, preview text, storage URI, object paths, signed URLs, parser internals, or actor identity. |
| `superseded` | Evidence exists but has been replaced by newer stored evidence. | Show trace-only superseded state when needed for source-map continuity. | Superseding artifact id or warning reason when safe. | Do not count superseded evidence as current proof. |
| `unavailable` | A required stored source or artifact store cannot currently be read. | Show unavailable state or section warning while preserving other readable sections. | `artifact_storage_disabled`, `artifact_storage_unavailable`, cleanup rationale, or source unavailable reason. | Do not convert to `missing`, repair the source, or hide other readable evidence. |
| `deferred` | The category belongs to a later spec or future runtime authority. | Show deferred label and owning future spec. | Owner spec and human-readable label. | Do not expose controls or attempt local evaluation. |

### Section-by-Section V1 State Matrix

| V1 section | Allowed states | Authoritative stored sources | Notes |
| --- | --- | --- | --- |
| `task` | `available`, `missing`, `unavailable` | Authorized task row and workspace scope. | Masked auth/scope failures remain HTTP boundary errors rather than evidence states. |
| `pilot_eligibility` | `eligible`, `not_eligible`, `incomplete`, `missing`, `unavailable` | Stored task identity, packet/source-map references, retained GitHub issue/PR evidence, and stored smoke proof. | Packet-local `local_only_excluded` maps to `not_eligible`. |
| `identity` | `available`, `missing`, `stale`, `incomplete`, `unavailable` | Stored `github_repo`, issue/PR numbers, retained GitHub issue #50 / PR #51 references, and sync rows. | Missing PR proof is incomplete when issue proof or other pilot evidence is present. |
| `packet_artifacts` | `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, `unavailable` | Existing task artifact metadata and SPEC-009D packet/source-map references. | Artifact content remains behind existing artifact read routes. |
| `smoke` | `available`, `missing`, `incomplete`, `unavailable` | Stored packet/source-map smoke references or static UAT links. | Runtime derivation does not parse `docs/qa/pilot-smoke-checklist.md`. |
| `current_stage` | `available`, `missing`, `stale`, `unavailable` | Current task/activity rows, with packet snapshot state as warning evidence. | Current task/activity rows win for live stage; stale packet state remains trace evidence. |
| `warnings` | `available`, `missing` | Derived from stored evidence states and safe reason codes. | Oversized, malformed, unsafe, secret-bearing, cleanup, and source-conflict details are warning reasons, not top-level states. |
| `deferrals` | `deferred` | Static SPEC-013/SPEC-014 ownership labels and any stored source-map pointer proving absence. | Seven future-state categories are display-only. |
| `source_map` | `available`, `missing`, `stale`, `unavailable`, `deferred` | Stored task, activity, artifact, packet, quality review, governance, GitHub sync, retained GitHub issue/PR, static UAT link, or cleanup note references. | Empty source maps are allowed only for explicit future deferrals where no stored evidence proves absence. |

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
- Source map notes are untrusted display text; they may name a typed source but must not be parsed into active Markdown links, autolinks, raw HTML, or executable markup.
- Cleaned disposable row pointers are represented as `unavailable` or `missing` with cleanup rationale, never as current live state.
