# Contract: SPEC-009F Triage Routing

## Existing Route Extension

`GET /api/tasks/:id/evidence` remains the only API surface. SPEC-009F extends the existing response with `triage_routing`.

The checked-in OpenAPI contract for `GET /api/tasks/{id}/evidence` must include `triage_routing` in the `200` response schema and required response section list. The API index keeps the existing task Evidence operation only; SPEC-009F does not add a new triage-routing path, operation, or route.

```ts
interface TaskEvidenceResponse {
  schema_version: "task_evidence.v1"
  task: TaskEvidenceTask
  pilot_eligibility: PilotEligibilityEvidence
  identity: IdentityEvidence
  packet_artifacts: PacketArtifactsEvidence
  smoke: SmokeEvidence
  current_stage: CurrentStageEvidence
  triage_routing: TriageRoutingEvidence
  warnings: EvidenceWarning[]
  deferrals: DeferralEvidence[]
  source_map: SourceMapEntry[]
}
```

## TriageRoutingEvidence

```ts
type TriageRoutingEvidenceState =
  | "missing"
  | "available"
  | "incomplete"
  | "unavailable"
  | "superseded"

type TriageRoutingStatus =
  | "missing"
  | "recorded"
  | "failed"
  | "conflict"

interface TriageRoutingEvidence {
  state: TriageRoutingEvidenceState
  routing_status: TriageRoutingStatus
  disposition?: SupportedNonRemediationDisposition
  lane?: TriageRoutingLane
  artifact?: TriageRoutingArtifactReference
  activity_reference?: string
  idempotency_key?: string
  recommended_next_action?: string
  proposed_labels: ProposedLabelRecommendation[]
  deferred_side_effects: DeferredSideEffect[]
  missing: string[]
  warnings: string[]
  lane_detail?: TriageRoutingLaneDetail
  superseded_artifacts: TriageRoutingArtifactReference[]
}
```

## Supported Dispositions And Lanes

```ts
type SupportedNonRemediationDisposition =
  | "NEEDS_SPEC"
  | "NEEDS_HUMAN"
  | "NEEDS_SPECIALIST"
  | "DUPLICATE"
  | "OBSOLETE"
  | "INVALID"

type TriageRoutingLane =
  | "speckit_handoff"
  | "clarification_request"
  | "specialist_recommendation"
  | "closure_recommendation"
```

Unsupported dispositions produce `state: "missing"` or a visible failed validation result, but must not create terminal routing evidence.

## Artifact Envelope

```ts
interface TriageRoutingPayloadEnvelope {
  schema_version: "spec-009f.triage_routing.v1"
  artifact_type:
    | "triage_speckit_handoff"
    | "triage_clarification_request"
    | "triage_specialist_recommendation"
    | "triage_closure_recommendation"
  source_task_id: number
  workspace_id: number
  source_issue: SourceIssueReference
  disposition: SupportedNonRemediationDisposition
  lane: TriageRoutingLane
  routing_status: "recorded"
  triage_rationale: string
  recommended_next_action: string
  proposed_labels: ProposedLabelRecommendation[]
  evidence_links: SafeEvidenceReference[]
  deferred_side_effects: DeferredSideEffect[]
  produced_at: string
}
```

## Lane Detail

```ts
type TriageRoutingLaneDetail =
  | SpecKitHandoffDetail
  | ClarificationRequestDetail
  | SpecialistRecommendationDetail
  | ClosureRecommendationDetail

interface SpecKitHandoffDetail {
  proposed_scope: string
  non_goals: string[]
  deferred_setup_action: {
    automatic_setup: false
    owner_action: string
  }
}

interface ClarificationRequestDetail {
  blocking_questions: string[]
  target_audience: string
  evidence_needed: string[]
  no_external_message_sent: true
}

type SpecialistRecommendationDetail =
  | {
      specialist_state: "recommended"
      recommended_lane: string
      recommended_owner: string
      matching_confidence: "deterministic"
      matching_basis: string[]
    }
  | {
      specialist_state: "unassigned"
      missing_metadata: string[]
      owner_action: string
    }

type ClosureRecommendationDetail =
  | {
      closure_outcome: "DUPLICATE"
      suspected_duplicate_target: string
      comparison_rationale: string
    }
  | {
      closure_outcome: "OBSOLETE"
      superseding_condition: string
      non_actionability_rationale: string
    }
  | {
      closure_outcome: "INVALID"
      invalidity_reason: string
      validation_evidence: string[]
      missing_reproducibility_context?: string[]
    }
```

## Recommendations And Evidence References

```ts
interface ProposedLabelRecommendation {
  name: string
  source: "triage_routing"
  action: "recommend_add"
  applied: false
}

interface DeferredSideEffect {
  side_effect:
    | "github_close"
    | "github_comment"
    | "github_label"
    | "github_assignment"
    | "agent_dispatch"
    | "speckit_setup"
    | "successor_task"
  deferred: true
  reason: string
}

interface SafeEvidenceReference {
  type: "artifact" | "activity" | "github_issue" | "github_pr" | "static_doc" | "other"
  label: string
  url?: string
  artifact_id?: number
  activity_id?: number
}
```

## Text Field Normalization Contract

All SPEC-009F persisted/displayed strings normalize to NFC, trim leading/trailing whitespace, normalize CRLF/CR to LF, convert tabs to single spaces, and persist no C0/C1 control characters except LF in multiline fields where allowed.

Field limits:

| Field class | Max characters | Newline limit |
|-------------|----------------|---------------|
| `triage_rationale`, closure rationales, `proposed_scope` | 2,000 | 8 LF |
| `recommended_next_action`, `owner_action`, `DeferredSideEffect.reason`, target audience, duplicate target, superseding condition, invalidity reason, other single-value lane text | 500 | 0 |
| Items in `blocking_questions`, `evidence_needed`, `non_goals`, `matching_basis`, `missing_metadata`, `validation_evidence`, `warnings`, sanitized failure reasons | 300 per item | 0 |
| `SafeEvidenceReference.label` | 120 | 0 |
| `proposed_labels.name` | 50 | 0 |

Over-limit or control-character-bearing values fail closed before artifact publishing. Validation-failure evidence may include sanitized field/path reasons only and must not persist the rejected raw value.

## Safe Evidence Reference Link Contract

`url` values are optional. When present they must be stripped of query strings and fragments before storage and validation.

Active link allowlist:

- Same-origin Mission Control task, artifact, or activity references constructed from typed ids.
- `https://github.com/racecraft-lab/mission-control/issues/{number}` for `github_issue`.
- `https://github.com/racecraft-lab/mission-control/pull/{number}` for `github_pr`.
- Repo-local/static docs or SPEC-009F checklist paths under `docs/` or `specs/009f-production-triage-routing/` for `static_doc`.

The UI renders all other labels as inert text. `SafeEvidenceReference.type: "other"` is inert in v1. Unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `ftp:`, `mailto:`, `tel:`, `ws:`, `wss:`), userinfo/credentials, signed URLs, storage URIs/object paths, arbitrary hosts, and broad external links are never active links.

## Routing Helper Contract

```ts
interface RecordTriageRoutingInput {
  source_task_id: number
  workspace_id: number
  disposition: string
  triage_output: unknown
  now?: Date
}

type RecordTriageRoutingResult =
  | { status: "recorded"; artifact_id: number; idempotency_key: string; supersedes_artifact_id?: number }
  | { status: "unchanged"; artifact_id: number; idempotency_key: string }
  | { status: "conflict"; existing_disposition: string; attempted_disposition: string; idempotency_key: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; idempotency_key?: string }
```

Required behavior:

- Preserve `ACTIONABLE_REMEDIATION` behavior by returning `skipped` for SPEC-009F and letting the existing remediation successor flow own it.
- Create no successor tasks for supported non-remediation outcomes.
- On same-outcome unchanged payload, create no new artifact or activity.
- On same-outcome changed payload, supersede prior artifact and record a new activity.
- On changed disposition retry, record sanitized conflict activity and create no terminal artifact.
- On supported-disposition payload validation failure, return `{ status: "failed" }`, create no terminal routing artifact, create no `triage_routing_recorded` activity, and expose only sanitized validation details through failed/incomplete `triage_routing` evidence. Raw `triage_output` is never returned or persisted in failure evidence.
- On artifact publish failure, record sanitized failure activity and expose incomplete/unavailable Evidence state.

## UI Contract

The existing `TaskEvidenceSection` preserves:

- `role="region"` and `aria-label="Task evidence"`
- `Evidence` heading
- `Loading evidence...`
- `Failed to load evidence`

SPEC-009F adds one compact read-only block:

- Label: `Triage routing`
- Empty: `No triage routing recorded.`
- Recorded: `Routing recorded`
- Incomplete: `Triage routing incomplete`
- Unavailable: `Triage routing unavailable`
- Superseded trace label: `Superseded routing evidence`
- Specialist fallback label: `Specialist unassigned`
- Deferred section label: `Deferred side effects`
- Keyboard/screen-reader behavior: the block inherits the existing Task Evidence region, heading, loading, and error semantics. Only allowlisted typed links are keyboard-focusable. Routing labels, states, proposed labels, recommended next actions, missing/unassigned states, superseded trace labels, and deferred side effects render as inert read-only text with visible labels and screen-reader-accessible names or descriptions.

No buttons, forms, menus, mutation controls, or disabled future action controls are allowed in v1.
