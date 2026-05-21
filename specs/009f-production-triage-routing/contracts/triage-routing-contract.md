# Contract: SPEC-009F Triage Routing

## Existing Route Extension

`GET /api/tasks/:id/evidence` remains the only API surface. SPEC-009F extends the existing response with `triage_routing`.

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

`url` values are optional. When present they must be stripped of query strings and fragments before storage. The UI renders active links only for validated destination families; otherwise labels render as inert text.

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

No buttons, forms, menus, mutation controls, or disabled future action controls are allowed in v1.
