# Data Model: Production Triage Outcome Routing

## Triage Route

**Purpose**: Current terminal recommendation route for one source Issue Triage task and one supported non-remediation disposition.

**Identity**:

- `workspace_id`: existing workspace id from source task.
- `source_task_id`: existing Issue Triage task id.
- `disposition`: one of `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, `INVALID`.
- `idempotency_key`: `spec-009f.triage_routing.v1:{workspace_id}:{source_task_id}:{disposition}`.

**Storage**:

- Current route is represented by the newest non-superseded, non-quarantined `task_artifacts` row with `schema_version = "spec-009f.triage_routing.v1"` and one of the SPEC-009F artifact types.
- Success activity is `triage_routing_recorded` on the source task.
- Conflict activity is `triage_routing_conflict`.
- Publish-failure activity is `triage_routing_artifact_publish_failed`.
- Payload validation failure activity is `triage_routing_validation_failed`; it contains sanitized source task id, workspace id, disposition when known, idempotency key when derivable, bounded field/path error reasons, and `routing_status: "failed"`, but never raw payload text, raw issue bodies, logs, secrets, storage URIs, or parser internals.

**State transitions**:

```text
missing
  -> recorded              same source task/disposition route succeeds
recorded
  -> recorded              same normalized payload rerun creates no new artifact/activity
recorded
  -> superseded+recorded   same outcome with changed normalized payload
recorded
  -> conflict              changed disposition retry after non-unknown route exists
missing|recorded
  -> failed                lane payload validation fails before artifact publish
missing|recorded
  -> failed                artifact publish fails before recorded activity
failed
  -> recorded              retry publishes or backfills required evidence
```

## Lane Payload Envelope

**Purpose**: Common typed contract for all SPEC-009F routing artifacts.

**Common required fields**:

- `schema_version`: exactly `spec-009f.triage_routing.v1`
- `artifact_type`: `triage_speckit_handoff`, `triage_clarification_request`, `triage_specialist_recommendation`, or `triage_closure_recommendation`
- `source_task_id`
- `workspace_id`
- `source_issue`
- `disposition`
- `lane`
- `routing_status`: `recorded`
- `triage_rationale`
- `recommended_next_action`
- `proposed_labels`
- `evidence_links`
- `deferred_side_effects`
- `produced_at`

**Validation rules**:

- Strings normalize to NFC, trim leading/trailing whitespace, normalize CRLF/CR to LF, convert tabs to single spaces, and persist no C0/C1 controls except bounded LF in multiline fields.
- `triage_rationale`, closure rationales, and `proposed_scope` are limited to 2,000 characters and 8 LF characters.
- `recommended_next_action`, `owner_action`, `DeferredSideEffect.reason`, target audience, duplicate target, superseding condition, invalidity reason, and other single-value lane text are limited to 500 characters and no LF.
- List items in `blocking_questions`, `evidence_needed`, `non_goals`, `matching_basis`, `missing_metadata`, `validation_evidence`, `warnings`, and sanitized failure reasons are limited to 300 characters each and no LF.
- `SafeEvidenceReference.label` is limited to 120 characters with no LF. `proposed_labels.name` is limited to 50 characters with no LF.
- Over-limit or control-character-bearing values fail closed before artifact publishing; validation-failure evidence stores only sanitized field/path reasons, never rejected raw values.
- Raw issue bodies, raw logs, credentials, tokens, signed URLs, storage URIs, raw secrets, parser internals, actor identity, and PII-bearing key/value material are rejected or replaced with safe metadata.
- `proposed_labels` are trim/lowercase/deduped and must have `action: "recommend_add"` and `applied: false`.
- Evidence links are typed safe references. URL links strip query strings/fragments before storage and validation.
- Active links are allowed only for same-origin Mission Control task/artifact/activity references, `https://github.com/racecraft-lab/mission-control/issues/{number}`, `https://github.com/racecraft-lab/mission-control/pull/{number}`, and repo-local/static docs or SPEC-009F checklist paths under `docs/` or `specs/009f-production-triage-routing/`.
- Unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `ftp:`, `mailto:`, `tel:`, `ws:`, `wss:`), userinfo/credentials, arbitrary hosts, signed URLs, storage URIs/object paths, broad external links, and `SafeEvidenceReference.type: "other"` render as inert text in v1.

## SpecKit Handoff Payload

**Disposition**: `NEEDS_SPEC`
**Artifact type**: `triage_speckit_handoff`
**Lane**: `speckit_handoff`

**Required lane fields**:

- `proposed_scope`
- `non_goals`
- `deferred_setup_action`

**Validation rules**:

- `deferred_setup_action.automatic_setup` must be `false`.
- No spec branch, worktree, or `$speckit-setup` execution is represented as complete.

## Clarification Request Payload

**Disposition**: `NEEDS_HUMAN`
**Artifact type**: `triage_clarification_request`
**Lane**: `clarification_request`

**Required lane fields**:

- `blocking_questions`
- `target_audience`
- `evidence_needed`
- `no_external_message_sent`

**Validation rules**:

- `blocking_questions` and `evidence_needed` are bounded inert display text.
- `no_external_message_sent` must be `true`.

## Specialist Recommendation Payload

**Disposition**: `NEEDS_SPECIALIST`
**Artifact type**: `triage_specialist_recommendation`
**Lane**: `specialist_recommendation`

**Required lane fields**:

- `specialist_state`: `recommended` or `unassigned`

**Required when recommended**:

- `recommended_lane`
- `recommended_owner`
- `matching_confidence`: exactly `deterministic`
- `matching_basis`

**Required when unassigned**:

- `missing_metadata`
- `owner_action`

**Validation rules**:

- Recommendation is allowed only when exactly one safe lane and one eligible same-workspace owner assignment resolve from deterministic Mission Control metadata.
- Missing area, multiple areas, missing assignment, missing same-workspace agent, inactive project, disabled project, or ambiguous role mapping all produce `specialist_state: "unassigned"`.

## Closure Recommendation Payload

**Dispositions**: `DUPLICATE`, `OBSOLETE`, `INVALID`
**Artifact type**: `triage_closure_recommendation`
**Lane**: `closure_recommendation`

**Common required lane fields**:

- `closure_outcome`: same as disposition

**Required for `DUPLICATE`**:

- `suspected_duplicate_target`
- `comparison_rationale`

**Required for `OBSOLETE`**:

- `superseding_condition`
- `non_actionability_rationale`

**Required for `INVALID`**:

- `invalidity_reason`
- `validation_evidence`
- `missing_reproducibility_context` when applicable

**Validation rules**:

- Closure recommendations never close/comment/label/assign GitHub issues.
- Outcome-specific fields must be present before artifact publish.

## Task Evidence Summary

**Purpose**: API/UI representation of current route evidence in the existing task Evidence surface.

**API field**: `triage_routing`
**UI label**: `Triage routing`

**Fields**:

- `state`: `missing`, `available`, `incomplete`, `unavailable`, or `superseded` for trace references only
- `routing_status`: `missing`, `recorded`, `failed`, or `conflict`
- `disposition`
- `lane`
- `artifact`
- `activity_reference`
- `idempotency_key`
- `recommended_next_action`
- `proposed_labels`
- `deferred_side_effects`
- `missing`
- `warnings`
- `lane_detail`
- `superseded_artifacts`

**Derivation rules**:

- Select newest non-superseded, non-quarantined SPEC-009F routing artifact for the task.
- Keep superseded artifacts trace-only.
- Publish-failure activity maps to `incomplete` or `unavailable`.
- Conflict activity maps to `routing_status: "conflict"` without terminal evidence for the attempted new outcome.
- React receives validated/sanitized output only and does not parse raw artifact payloads.
