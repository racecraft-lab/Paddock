export const TRIAGE_ROUTING_SCHEMA_VERSION = 'spec-009f.triage_routing.v1' as const;

export const SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS = [
  'NEEDS_SPEC',
  'NEEDS_HUMAN',
  'NEEDS_SPECIALIST',
  'DUPLICATE',
  'OBSOLETE',
  'INVALID',
] as const;

export const TRIAGE_ROUTING_LANES = [
  'speckit_handoff',
  'clarification_request',
  'specialist_recommendation',
  'closure_recommendation',
] as const;

export const TRIAGE_ROUTING_ARTIFACT_TYPES = [
  'triage_speckit_handoff',
  'triage_clarification_request',
  'triage_specialist_recommendation',
  'triage_closure_recommendation',
] as const;

export type SupportedTriageRoutingDisposition = (typeof SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS)[number];
export type TriageRoutingLane = (typeof TRIAGE_ROUTING_LANES)[number];
export type TriageRoutingArtifactType = (typeof TRIAGE_ROUTING_ARTIFACT_TYPES)[number];

export const TRIAGE_ROUTING_DISPOSITION_TO_LANE: Record<SupportedTriageRoutingDisposition, TriageRoutingLane> = {
  NEEDS_SPEC: 'speckit_handoff',
  NEEDS_HUMAN: 'clarification_request',
  NEEDS_SPECIALIST: 'specialist_recommendation',
  DUPLICATE: 'closure_recommendation',
  OBSOLETE: 'closure_recommendation',
  INVALID: 'closure_recommendation',
};

export const TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE: Record<
  SupportedTriageRoutingDisposition,
  TriageRoutingArtifactType
> = {
  NEEDS_SPEC: 'triage_speckit_handoff',
  NEEDS_HUMAN: 'triage_clarification_request',
  NEEDS_SPECIALIST: 'triage_specialist_recommendation',
  DUPLICATE: 'triage_closure_recommendation',
  OBSOLETE: 'triage_closure_recommendation',
  INVALID: 'triage_closure_recommendation',
};

export const TRIAGE_ROUTING_DEFERRED_SIDE_EFFECTS = [
  'github_close',
  'github_comment',
  'github_label',
  'github_assignment',
  'agent_dispatch',
  'speckit_setup',
  'successor_task',
] as const;

export const TRIAGE_ROUTING_SAFE_EVIDENCE_TYPES = [
  'artifact',
  'activity',
  'github_issue',
  'github_pr',
  'static_doc',
  'other',
] as const;

export type TriageRoutingDeferredSideEffectType = (typeof TRIAGE_ROUTING_DEFERRED_SIDE_EFFECTS)[number];
export type SafeEvidenceReferenceType = (typeof TRIAGE_ROUTING_SAFE_EVIDENCE_TYPES)[number];

export interface ProposedLabelRecommendation {
  readonly name: string;
  readonly source: 'triage_routing';
  readonly action: 'recommend_add';
  readonly applied: false;
}

export interface DeferredSideEffect {
  readonly side_effect: TriageRoutingDeferredSideEffectType;
  readonly deferred: true;
  readonly reason: string;
}

export interface SafeEvidenceReference {
  readonly type: SafeEvidenceReferenceType;
  readonly label: string;
  readonly url?: string;
  readonly artifact_id?: number;
  readonly activity_id?: number;
}

export interface SourceIssueReference {
  readonly repo?: string;
  readonly number?: number;
  readonly url?: string;
}

export interface TriageRoutingPayloadEnvelope {
  readonly schema_version: typeof TRIAGE_ROUTING_SCHEMA_VERSION;
  readonly artifact_type: TriageRoutingArtifactType;
  readonly source_task_id: number;
  readonly workspace_id: number;
  readonly source_issue: SourceIssueReference;
  readonly disposition: SupportedTriageRoutingDisposition;
  readonly lane: TriageRoutingLane;
  readonly routing_status: 'recorded';
  readonly triage_rationale: string;
  readonly recommended_next_action: string;
  readonly proposed_labels: ProposedLabelRecommendation[];
  readonly evidence_links: SafeEvidenceReference[];
  readonly deferred_side_effects: DeferredSideEffect[];
  readonly produced_at: string;
  readonly idempotency_key: string;
}

export interface SpecKitHandoffDetail {
  readonly proposed_scope: string;
  readonly non_goals: string[];
  readonly deferred_setup_action: {
    readonly automatic_setup: false;
    readonly owner_action: string;
  };
}

export interface ClarificationRequestDetail {
  readonly blocking_questions: string[];
  readonly target_audience: string;
  readonly evidence_needed: string[];
  readonly no_external_message_sent: true;
}

export type SpecialistRecommendationDetail =
  | {
      readonly specialist_state: 'recommended';
      readonly recommended_lane: string;
      readonly recommended_owner: string;
      readonly matching_confidence: 'deterministic';
      readonly matching_basis: string[];
    }
  | {
      readonly specialist_state: 'unassigned';
      readonly missing_metadata: string[];
      readonly owner_action: string;
    };

export type ClosureRecommendationDetail =
  | {
      readonly closure_outcome: 'DUPLICATE';
      readonly suspected_duplicate_target: string;
      readonly comparison_rationale: string;
    }
  | {
      readonly closure_outcome: 'OBSOLETE';
      readonly superseding_condition: string;
      readonly non_actionability_rationale: string;
    }
  | {
      readonly closure_outcome: 'INVALID';
      readonly invalidity_reason: string;
      readonly validation_evidence: string[];
      readonly missing_reproducibility_context?: string[];
    };

export interface NeedsSpecTriageRoutingPayload
  extends Omit<TriageRoutingPayloadEnvelope, 'artifact_type' | 'disposition' | 'lane'> {
  readonly artifact_type: 'triage_speckit_handoff';
  readonly disposition: 'NEEDS_SPEC';
  readonly lane: 'speckit_handoff';
  readonly lane_detail: SpecKitHandoffDetail;
}

export interface NeedsHumanTriageRoutingPayload
  extends Omit<TriageRoutingPayloadEnvelope, 'artifact_type' | 'disposition' | 'lane'> {
  readonly artifact_type: 'triage_clarification_request';
  readonly disposition: 'NEEDS_HUMAN';
  readonly lane: 'clarification_request';
  readonly lane_detail: ClarificationRequestDetail;
}

export interface NeedsSpecialistTriageRoutingPayload
  extends Omit<TriageRoutingPayloadEnvelope, 'artifact_type' | 'disposition' | 'lane'> {
  readonly artifact_type: 'triage_specialist_recommendation';
  readonly disposition: 'NEEDS_SPECIALIST';
  readonly lane: 'specialist_recommendation';
  readonly lane_detail: SpecialistRecommendationDetail;
}

export interface ClosureRecommendationTriageRoutingPayload
  extends Omit<TriageRoutingPayloadEnvelope, 'artifact_type' | 'lane'> {
  readonly artifact_type: 'triage_closure_recommendation';
  readonly disposition: 'DUPLICATE' | 'OBSOLETE' | 'INVALID';
  readonly lane: 'closure_recommendation';
  readonly lane_detail: ClosureRecommendationDetail;
}

export interface TriageRoutingValidationIssue {
  readonly path: string;
  readonly code:
    | 'invalid_type'
    | 'invalid_schema_version'
    | 'unsupported_disposition'
    | 'invalid_lane'
    | 'invalid_artifact_type'
    | 'invalid_routing_status'
    | 'invalid_datetime'
    | 'invalid_integer'
    | 'invalid_reference_type'
    | 'invalid_literal'
    | 'missing_deferred_side_effect'
    | 'text_too_long'
    | 'too_many_newlines'
    | 'control_character';
  readonly message: string;
}

export interface TriageRoutingValidationWarning {
  readonly path: string;
  readonly code: 'unsafe_url_removed';
  readonly message: string;
}

export type TriageRoutingValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly warnings?: TriageRoutingValidationWarning[] }
  | { readonly ok: false; readonly issues: TriageRoutingValidationIssue[] };

export interface TriageRoutingTextConstraints {
  readonly field: string;
  readonly max_chars: number;
  readonly max_newlines: number;
}

const MULTILINE_LINE_FEED = '\n'.charCodeAt(0);

export function buildTriageRoutingIdempotencyKey(input: {
  readonly workspace_id: number;
  readonly source_task_id: number;
  readonly disposition: SupportedTriageRoutingDisposition;
}): string {
  return `${TRIAGE_ROUTING_SCHEMA_VERSION}:${String(input.workspace_id)}:${String(input.source_task_id)}:${input.disposition}`;
}

export function normalizeTriageRoutingText(
  value: unknown,
  constraints: TriageRoutingTextConstraints,
): TriageRoutingValidationResult<string> {
  if (typeof value !== 'string') {
    return {
      ok: false,
      issues: [issue(constraints.field, 'invalid_type', `${constraints.field} must be a string`)],
    };
  }

  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim();
  const disallowedControl = findDisallowedControl(normalized);
  if (disallowedControl) {
    return {
      ok: false,
      issues: [issue(constraints.field, 'control_character', `${constraints.field} contains a control character`)],
    };
  }

  if (normalized.length > constraints.max_chars) {
    return {
      ok: false,
      issues: [
        issue(
          constraints.field,
          'text_too_long',
          `${constraints.field} exceeds the ${String(constraints.max_chars)} character limit`,
        ),
      ],
    };
  }

  const newlineCount = countNewlines(normalized);
  if (newlineCount > constraints.max_newlines) {
    return {
      ok: false,
      issues: [
        issue(
          constraints.field,
          'too_many_newlines',
          `${constraints.field} exceeds the ${String(constraints.max_newlines)} newline limit`,
        ),
      ],
    };
  }

  return { ok: true, value: normalized };
}

export function normalizeProposedLabels(labels: unknown): TriageRoutingValidationResult<ProposedLabelRecommendation[]> {
  if (!Array.isArray(labels)) {
    return { ok: false, issues: [issue('proposed_labels', 'invalid_type', 'proposed_labels must be an array')] };
  }

  const seen = new Set<string>();
  const normalizedLabels: ProposedLabelRecommendation[] = [];
  const issues: TriageRoutingValidationIssue[] = [];
  const labelItems = labels as unknown[];

  labelItems.forEach((label, index) => {
    const rawName = isRecord(label) ? label['name'] : label;
    if (isRecord(label)) {
      if (label['source'] !== 'triage_routing') {
        issues.push(issue(`proposed_labels.${String(index)}.source`, 'invalid_literal', 'source must be triage_routing'));
      }
      if (label['action'] !== 'recommend_add') {
        issues.push(issue(`proposed_labels.${String(index)}.action`, 'invalid_literal', 'action must be recommend_add'));
      }
      if (label['applied'] !== false) {
        issues.push(issue(`proposed_labels.${String(index)}.applied`, 'invalid_literal', 'applied must be false'));
      }
    }

    const result = normalizeTriageRoutingText(rawName, {
      field: `proposed_labels.${String(index)}.name`,
      max_chars: 50,
      max_newlines: 0,
    });
    if (!result.ok) {
      issues.push(...result.issues);
      return;
    }

    const name = result.value.toLowerCase();
    if (name.length === 0 || seen.has(name)) return;
    seen.add(name);
    normalizedLabels.push({
      name,
      source: 'triage_routing',
      action: 'recommend_add',
      applied: false,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: normalizedLabels };
}

export function normalizeSafeEvidenceReference(input: unknown): TriageRoutingValidationResult<SafeEvidenceReference> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('evidence_links', 'invalid_type', 'evidence reference must be an object')] };
  }

  const type = input['type'];
  if (!isSafeEvidenceReferenceType(type)) {
    return { ok: false, issues: [issue('type', 'invalid_reference_type', 'evidence reference type is unsupported')] };
  }

  const label = normalizeTriageRoutingText(input['label'], {
    field: 'label',
    max_chars: 120,
    max_newlines: 0,
  });
  if (!label.ok) return label;

  const value: SafeEvidenceReference = {
    type,
    label: label.value,
    ...optionalPositiveInteger(input['artifact_id'], 'artifact_id'),
    ...optionalPositiveInteger(input['activity_id'], 'activity_id'),
  };

  const url = typeof input['url'] === 'string' ? normalizeEvidenceUrl(type, input['url']) : undefined;
  if (url) return { ok: true, value: { ...value, url } };
  if (typeof input['url'] === 'string' && input['url'].trim().length > 0) {
    return {
      ok: true,
      value,
      warnings: [
        {
          path: 'url',
          code: 'unsafe_url_removed',
          message: 'url was removed because it is not allowlisted',
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateCommonTriageRoutingPayloadEnvelope(
  input: unknown,
): TriageRoutingValidationResult<TriageRoutingPayloadEnvelope> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];

  if (input['schema_version'] !== TRIAGE_ROUTING_SCHEMA_VERSION) {
    issues.push(issue('schema_version', 'invalid_schema_version', 'schema_version is not supported'));
  }

  const disposition = input['disposition'];
  if (!isSupportedDisposition(disposition)) {
    issues.push(issue('disposition', 'unsupported_disposition', 'disposition is not supported'));
  }

  const lane = input['lane'];
  if (!isTriageRoutingLane(lane)) {
    issues.push(issue('lane', 'invalid_lane', 'lane is not supported'));
  } else if (isSupportedDisposition(disposition) && lane !== TRIAGE_ROUTING_DISPOSITION_TO_LANE[disposition]) {
    issues.push(issue('lane', 'invalid_lane', 'lane does not match disposition'));
  }

  const artifactType = input['artifact_type'];
  if (!isTriageRoutingArtifactType(artifactType)) {
    issues.push(issue('artifact_type', 'invalid_artifact_type', 'artifact_type is not supported'));
  } else if (
    isSupportedDisposition(disposition) &&
    artifactType !== TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE[disposition]
  ) {
    issues.push(issue('artifact_type', 'invalid_artifact_type', 'artifact_type does not match disposition'));
  }

  if (input['routing_status'] !== 'recorded') {
    issues.push(issue('routing_status', 'invalid_routing_status', 'routing_status must be recorded'));
  }

  const sourceTaskId = readPositiveInteger(input['source_task_id'], 'source_task_id', issues);
  const workspaceId = readPositiveInteger(input['workspace_id'], 'workspace_id', issues);
  const producedAt = normalizeProducedAt(input['produced_at'], issues);
  const sourceIssue = normalizeSourceIssue(input['source_issue'], issues);

  const triageRationale = normalizeTriageRoutingText(input['triage_rationale'], {
    field: 'triage_rationale',
    max_chars: 2000,
    max_newlines: 8,
  });
  const recommendedNextAction = normalizeTriageRoutingText(input['recommended_next_action'], {
    field: 'recommended_next_action',
    max_chars: 500,
    max_newlines: 0,
  });
  const proposedLabels = normalizeProposedLabels(input['proposed_labels']);
  const evidenceLinks = normalizeEvidenceLinks(input['evidence_links']);
  const deferredSideEffects = normalizeDeferredSideEffects(input['deferred_side_effects']);

  collectIssues(issues, triageRationale);
  collectIssues(issues, recommendedNextAction);
  collectIssues(issues, proposedLabels);
  collectIssues(issues, evidenceLinks);
  collectIssues(issues, deferredSideEffects);

  if (
    issues.length > 0 ||
    !isSupportedDisposition(disposition) ||
    !isTriageRoutingLane(lane) ||
    !isTriageRoutingArtifactType(artifactType) ||
    !triageRationale.ok ||
    !recommendedNextAction.ok ||
    !proposedLabels.ok ||
    !evidenceLinks.ok ||
    !deferredSideEffects.ok ||
    sourceTaskId === undefined ||
    workspaceId === undefined ||
    producedAt === undefined ||
    sourceIssue === undefined
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
      artifact_type: artifactType,
      source_task_id: sourceTaskId,
      workspace_id: workspaceId,
      source_issue: sourceIssue,
      disposition,
      lane,
      routing_status: 'recorded',
      triage_rationale: triageRationale.value,
      recommended_next_action: recommendedNextAction.value,
      proposed_labels: proposedLabels.value,
      evidence_links: evidenceLinks.value,
      deferred_side_effects: deferredSideEffects.value,
      produced_at: producedAt,
      idempotency_key: buildTriageRoutingIdempotencyKey({
        workspace_id: workspaceId,
        source_task_id: sourceTaskId,
        disposition,
      }),
    },
  };
}

export function buildNeedsSpecTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsSpecTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const deferredSetupAction = isRecord(input['deferred_setup_action']) ? input['deferred_setup_action'] : {};

  return validateNeedsSpecTriageRoutingPayload({
    ...input,
    schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
    artifact_type: 'triage_speckit_handoff',
    disposition: 'NEEDS_SPEC',
    lane: 'speckit_handoff',
    routing_status: 'recorded',
    deferred_side_effects: [
      {
        side_effect: 'speckit_setup',
        deferred: true,
        reason: 'SpecKit setup remains an owner action.',
      },
    ],
    lane_detail: {
      proposed_scope: input['proposed_scope'],
      non_goals: input['non_goals'],
      deferred_setup_action: {
        automatic_setup: false,
        owner_action: deferredSetupAction['owner_action'],
      },
    },
  });
}

export function validateNeedsSpecTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsSpecTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  if (input['disposition'] !== 'NEEDS_SPEC') {
    issues.push(issue('disposition', 'unsupported_disposition', 'disposition must be NEEDS_SPEC'));
  }
  if (input['lane'] !== 'speckit_handoff') {
    issues.push(issue('lane', 'invalid_lane', 'lane must be speckit_handoff'));
  }
  if (input['artifact_type'] !== 'triage_speckit_handoff') {
    issues.push(issue('artifact_type', 'invalid_artifact_type', 'artifact_type must be triage_speckit_handoff'));
  }

  const envelope = validateCommonTriageRoutingPayloadEnvelope(input);
  collectIssues(issues, envelope);

  const laneDetail = normalizeSpecKitHandoffDetail(input['lane_detail']);
  collectIssues(issues, laneDetail);

  if (envelope.ok && !hasDeferredSideEffect(envelope.value.deferred_side_effects, 'speckit_setup')) {
    issues.push(
      issue(
        'deferred_side_effects',
        'missing_deferred_side_effect',
        'deferred_side_effects must include deferred speckit_setup',
      ),
    );
  }

  if (issues.length > 0 || !envelope.ok || !laneDetail.ok) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ...envelope.value,
      artifact_type: 'triage_speckit_handoff',
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      lane_detail: laneDetail.value,
    },
  };
}

export function buildNeedsHumanTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsHumanTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const detailInput = isRecord(input['lane_detail']) ? input['lane_detail'] : input;

  return validateNeedsHumanTriageRoutingPayload({
    ...input,
    schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
    artifact_type: 'triage_clarification_request',
    disposition: 'NEEDS_HUMAN',
    lane: 'clarification_request',
    routing_status: 'recorded',
    deferred_side_effects: defaultNeedsHumanDeferredSideEffects(),
    lane_detail: {
      blocking_questions: detailInput['blocking_questions'],
      target_audience: detailInput['target_audience'],
      evidence_needed: detailInput['evidence_needed'],
      no_external_message_sent: true,
    },
  });
}

export function validateNeedsHumanTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsHumanTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  if (input['disposition'] !== 'NEEDS_HUMAN') {
    issues.push(issue('disposition', 'unsupported_disposition', 'disposition must be NEEDS_HUMAN'));
  }
  if (input['lane'] !== 'clarification_request') {
    issues.push(issue('lane', 'invalid_lane', 'lane must be clarification_request'));
  }
  if (input['artifact_type'] !== 'triage_clarification_request') {
    issues.push(
      issue('artifact_type', 'invalid_artifact_type', 'artifact_type must be triage_clarification_request'),
    );
  }

  const envelope = validateCommonTriageRoutingPayloadEnvelope(input);
  collectIssues(issues, envelope);

  const laneDetail = normalizeClarificationRequestDetail(input['lane_detail']);
  collectIssues(issues, laneDetail);

  if (issues.length > 0 || !envelope.ok || !laneDetail.ok) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ...envelope.value,
      artifact_type: 'triage_clarification_request',
      disposition: 'NEEDS_HUMAN',
      lane: 'clarification_request',
      lane_detail: laneDetail.value,
    },
  };
}

export function buildNeedsSpecialistTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsSpecialistTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const detailInput = isRecord(input['lane_detail']) ? input['lane_detail'] : input;
  const specialistState = detailInput['specialist_state'];
  const laneDetail =
    specialistState === 'unassigned'
      ? {
          specialist_state: 'unassigned',
          missing_metadata: detailInput['missing_metadata'],
          owner_action: detailInput['owner_action'],
        }
      : {
          specialist_state: specialistState,
          recommended_lane: detailInput['recommended_lane'],
          recommended_owner: detailInput['recommended_owner'],
          matching_confidence: 'deterministic',
          matching_basis: detailInput['matching_basis'],
        };

  return validateNeedsSpecialistTriageRoutingPayload({
    ...input,
    schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
    artifact_type: 'triage_specialist_recommendation',
    disposition: 'NEEDS_SPECIALIST',
    lane: 'specialist_recommendation',
    routing_status: 'recorded',
    deferred_side_effects: defaultNeedsSpecialistDeferredSideEffects(),
    lane_detail: laneDetail,
  });
}

export function validateNeedsSpecialistTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<NeedsSpecialistTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  if (input['disposition'] !== 'NEEDS_SPECIALIST') {
    issues.push(issue('disposition', 'unsupported_disposition', 'disposition must be NEEDS_SPECIALIST'));
  }
  if (input['lane'] !== 'specialist_recommendation') {
    issues.push(issue('lane', 'invalid_lane', 'lane must be specialist_recommendation'));
  }
  if (input['artifact_type'] !== 'triage_specialist_recommendation') {
    issues.push(
      issue('artifact_type', 'invalid_artifact_type', 'artifact_type must be triage_specialist_recommendation'),
    );
  }

  const envelope = validateCommonTriageRoutingPayloadEnvelope(input);
  collectIssues(issues, envelope);

  const laneDetail = normalizeSpecialistRecommendationDetail(input['lane_detail']);
  collectIssues(issues, laneDetail);

  if (issues.length > 0 || !envelope.ok || !laneDetail.ok) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ...envelope.value,
      artifact_type: 'triage_specialist_recommendation',
      disposition: 'NEEDS_SPECIALIST',
      lane: 'specialist_recommendation',
      lane_detail: laneDetail.value,
    },
  };
}

export function buildClosureRecommendationTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<ClosureRecommendationTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const disposition = input['disposition'];
  const detailInput = isRecord(input['lane_detail']) ? input['lane_detail'] : input;

  return validateClosureRecommendationTriageRoutingPayload({
    ...input,
    schema_version: TRIAGE_ROUTING_SCHEMA_VERSION,
    artifact_type: 'triage_closure_recommendation',
    lane: 'closure_recommendation',
    routing_status: 'recorded',
    deferred_side_effects: defaultClosureDeferredSideEffects(),
    lane_detail: closureLaneDetailInput(disposition, detailInput),
  });
}

export function validateClosureRecommendationTriageRoutingPayload(
  input: unknown,
): TriageRoutingValidationResult<ClosureRecommendationTriageRoutingPayload> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('payload', 'invalid_type', 'payload must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  const disposition = input['disposition'];
  if (!isClosureDisposition(disposition)) {
    issues.push(issue('disposition', 'unsupported_disposition', 'disposition must be DUPLICATE, OBSOLETE, or INVALID'));
  }
  if (input['lane'] !== 'closure_recommendation') {
    issues.push(issue('lane', 'invalid_lane', 'lane must be closure_recommendation'));
  }
  if (input['artifact_type'] !== 'triage_closure_recommendation') {
    issues.push(
      issue('artifact_type', 'invalid_artifact_type', 'artifact_type must be triage_closure_recommendation'),
    );
  }

  const envelope = validateCommonTriageRoutingPayloadEnvelope(input);
  collectIssues(issues, envelope);

  const laneDetail = normalizeClosureRecommendationDetail(input['lane_detail'], disposition);
  collectIssues(issues, laneDetail);

  if (issues.length > 0 || !envelope.ok || !laneDetail.ok || !isClosureDisposition(disposition)) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      ...envelope.value,
      artifact_type: 'triage_closure_recommendation',
      disposition,
      lane: 'closure_recommendation',
      lane_detail: laneDetail.value,
    },
  };
}

function normalizeSpecKitHandoffDetail(input: unknown): TriageRoutingValidationResult<SpecKitHandoffDetail> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('lane_detail', 'invalid_type', 'lane_detail must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  const proposedScope = normalizeTriageRoutingText(input['proposed_scope'], {
    field: 'lane_detail.proposed_scope',
    max_chars: 2000,
    max_newlines: 8,
  });
  const nonGoals = normalizeLaneTextList(input['non_goals'], 'lane_detail.non_goals');
  const deferredSetupAction = normalizeDeferredSetupAction(input['deferred_setup_action']);

  collectIssues(issues, proposedScope);
  collectIssues(issues, nonGoals);
  collectIssues(issues, deferredSetupAction);

  if (issues.length > 0 || !proposedScope.ok || !nonGoals.ok || !deferredSetupAction.ok) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      proposed_scope: proposedScope.value,
      non_goals: nonGoals.value,
      deferred_setup_action: deferredSetupAction.value,
    },
  };
}

function normalizeClarificationRequestDetail(input: unknown): TriageRoutingValidationResult<ClarificationRequestDetail> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('lane_detail', 'invalid_type', 'lane_detail must be an object')] };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  const blockingQuestions = normalizeLaneTextList(input['blocking_questions'], 'lane_detail.blocking_questions');
  const targetAudience = normalizeTriageRoutingText(input['target_audience'], {
    field: 'lane_detail.target_audience',
    max_chars: 300,
    max_newlines: 0,
  });
  const evidenceNeeded = normalizeLaneTextList(input['evidence_needed'], 'lane_detail.evidence_needed');

  if (input['no_external_message_sent'] !== true) {
    issues.push(
      issue('lane_detail.no_external_message_sent', 'invalid_literal', 'no_external_message_sent must be true'),
    );
  }

  collectIssues(issues, blockingQuestions);
  collectIssues(issues, targetAudience);
  collectIssues(issues, evidenceNeeded);

  if (issues.length > 0 || !blockingQuestions.ok || !targetAudience.ok || !evidenceNeeded.ok) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      blocking_questions: blockingQuestions.value,
      target_audience: targetAudience.value,
      evidence_needed: evidenceNeeded.value,
      no_external_message_sent: true,
    },
  };
}

function normalizeSpecialistRecommendationDetail(
  input: unknown,
): TriageRoutingValidationResult<SpecialistRecommendationDetail> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('lane_detail', 'invalid_type', 'lane_detail must be an object')] };
  }

  if (input['specialist_state'] === 'recommended') {
    return normalizeRecommendedSpecialistDetail(input);
  }
  if (input['specialist_state'] === 'unassigned') {
    return normalizeUnassignedSpecialistDetail(input);
  }

  return {
    ok: false,
    issues: [
      issue(
        'lane_detail.specialist_state',
        'invalid_literal',
        'specialist_state must be recommended or unassigned',
      ),
    ],
  };
}

function normalizeRecommendedSpecialistDetail(
  input: Record<string, unknown>,
): TriageRoutingValidationResult<SpecialistRecommendationDetail> {
  const issues: TriageRoutingValidationIssue[] = [];
  const recommendedLane = normalizeTriageRoutingText(input['recommended_lane'], {
    field: 'lane_detail.recommended_lane',
    max_chars: 300,
    max_newlines: 0,
  });
  const recommendedOwner = normalizeTriageRoutingText(input['recommended_owner'], {
    field: 'lane_detail.recommended_owner',
    max_chars: 300,
    max_newlines: 0,
  });
  const matchingBasis = normalizeLaneTextList(input['matching_basis'], 'lane_detail.matching_basis');

  if (input['matching_confidence'] !== 'deterministic') {
    issues.push(
      issue('lane_detail.matching_confidence', 'invalid_literal', 'matching_confidence must be deterministic'),
    );
  }

  collectIssues(issues, recommendedLane);
  collectIssues(issues, recommendedOwner);
  collectIssues(issues, matchingBasis);

  if (issues.length > 0 || !recommendedLane.ok || !recommendedOwner.ok || !matchingBasis.ok) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      specialist_state: 'recommended',
      recommended_lane: recommendedLane.value,
      recommended_owner: recommendedOwner.value,
      matching_confidence: 'deterministic',
      matching_basis: matchingBasis.value,
    },
  };
}

function normalizeUnassignedSpecialistDetail(
  input: Record<string, unknown>,
): TriageRoutingValidationResult<SpecialistRecommendationDetail> {
  const issues: TriageRoutingValidationIssue[] = [];
  const missingMetadata = normalizeLaneTextList(input['missing_metadata'], 'lane_detail.missing_metadata');
  const ownerAction = normalizeTriageRoutingText(input['owner_action'], {
    field: 'lane_detail.owner_action',
    max_chars: 500,
    max_newlines: 0,
  });

  collectIssues(issues, missingMetadata);
  collectIssues(issues, ownerAction);

  if (issues.length > 0 || !missingMetadata.ok || !ownerAction.ok) return { ok: false, issues };

  return {
    ok: true,
    value: {
      specialist_state: 'unassigned',
      missing_metadata: missingMetadata.value,
      owner_action: ownerAction.value,
    },
  };
}

function defaultNeedsHumanDeferredSideEffects(): DeferredSideEffect[] {
  return [
    {
      side_effect: 'github_label',
      deferred: true,
      reason: 'SPEC-009F recommends labels but does not apply them.',
    },
    {
      side_effect: 'successor_task',
      deferred: true,
      reason: 'SPEC-009F keeps non-remediation outcomes terminal.',
    },
    {
      side_effect: 'github_comment',
      deferred: true,
      reason: 'No external clarification message is sent.',
    },
  ];
}

function defaultNeedsSpecialistDeferredSideEffects(): DeferredSideEffect[] {
  return [
    {
      side_effect: 'github_label',
      deferred: true,
      reason: 'SPEC-009F recommends labels but does not apply them.',
    },
    {
      side_effect: 'successor_task',
      deferred: true,
      reason: 'SPEC-009F keeps non-remediation outcomes terminal.',
    },
    {
      side_effect: 'github_assignment',
      deferred: true,
      reason: 'No GitHub assignment is applied.',
    },
    {
      side_effect: 'agent_dispatch',
      deferred: true,
      reason: 'Specialist recommendation does not dispatch an agent.',
    },
  ];
}

function defaultClosureDeferredSideEffects(): DeferredSideEffect[] {
  return [
    {
      side_effect: 'github_label',
      deferred: true,
      reason: 'SPEC-009F recommends labels but does not apply them.',
    },
    {
      side_effect: 'successor_task',
      deferred: true,
      reason: 'SPEC-009F keeps non-remediation outcomes terminal.',
    },
    {
      side_effect: 'github_close',
      deferred: true,
      reason: 'Closure outcomes are recommendation-only.',
    },
    {
      side_effect: 'github_comment',
      deferred: true,
      reason: 'No external closure comment is posted.',
    },
  ];
}

function closureLaneDetailInput(disposition: unknown, input: Record<string, unknown>): Record<string, unknown> {
  if (disposition === 'DUPLICATE') {
    return {
      closure_outcome: 'DUPLICATE',
      suspected_duplicate_target: input['suspected_duplicate_target'],
      comparison_rationale: input['comparison_rationale'],
    };
  }
  if (disposition === 'OBSOLETE') {
    return {
      closure_outcome: 'OBSOLETE',
      superseding_condition: input['superseding_condition'],
      non_actionability_rationale: input['non_actionability_rationale'],
    };
  }
  return {
    closure_outcome: disposition,
    invalidity_reason: input['invalidity_reason'],
    validation_evidence: input['validation_evidence'],
    missing_reproducibility_context: input['missing_reproducibility_context'],
  };
}

function normalizeClosureRecommendationDetail(
  input: unknown,
  disposition: unknown,
): TriageRoutingValidationResult<ClosureRecommendationDetail> {
  if (!isRecord(input)) {
    return { ok: false, issues: [issue('lane_detail', 'invalid_type', 'lane_detail must be an object')] };
  }
  if (input['closure_outcome'] !== disposition) {
    return {
      ok: false,
      issues: [issue('lane_detail.closure_outcome', 'invalid_literal', 'closure_outcome must match disposition')],
    };
  }
  if (disposition === 'DUPLICATE') return normalizeDuplicateClosureDetail(input);
  if (disposition === 'OBSOLETE') return normalizeObsoleteClosureDetail(input);
  if (disposition === 'INVALID') return normalizeInvalidClosureDetail(input);
  return {
    ok: false,
    issues: [issue('lane_detail.closure_outcome', 'unsupported_disposition', 'closure_outcome is not supported')],
  };
}

function normalizeDuplicateClosureDetail(
  input: Record<string, unknown>,
): TriageRoutingValidationResult<ClosureRecommendationDetail> {
  const issues: TriageRoutingValidationIssue[] = [];
  const target = normalizeTriageRoutingText(input['suspected_duplicate_target'], {
    field: 'lane_detail.suspected_duplicate_target',
    max_chars: 500,
    max_newlines: 0,
  });
  const rationale = normalizeTriageRoutingText(input['comparison_rationale'], {
    field: 'lane_detail.comparison_rationale',
    max_chars: 2000,
    max_newlines: 8,
  });
  collectIssues(issues, target);
  collectIssues(issues, rationale);
  if (issues.length > 0 || !target.ok || !rationale.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      closure_outcome: 'DUPLICATE',
      suspected_duplicate_target: target.value,
      comparison_rationale: rationale.value,
    },
  };
}

function normalizeObsoleteClosureDetail(
  input: Record<string, unknown>,
): TriageRoutingValidationResult<ClosureRecommendationDetail> {
  const issues: TriageRoutingValidationIssue[] = [];
  const condition = normalizeTriageRoutingText(input['superseding_condition'], {
    field: 'lane_detail.superseding_condition',
    max_chars: 500,
    max_newlines: 0,
  });
  const rationale = normalizeTriageRoutingText(input['non_actionability_rationale'], {
    field: 'lane_detail.non_actionability_rationale',
    max_chars: 2000,
    max_newlines: 8,
  });
  collectIssues(issues, condition);
  collectIssues(issues, rationale);
  if (issues.length > 0 || !condition.ok || !rationale.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      closure_outcome: 'OBSOLETE',
      superseding_condition: condition.value,
      non_actionability_rationale: rationale.value,
    },
  };
}

function normalizeInvalidClosureDetail(
  input: Record<string, unknown>,
): TriageRoutingValidationResult<ClosureRecommendationDetail> {
  const issues: TriageRoutingValidationIssue[] = [];
  const reason = normalizeTriageRoutingText(input['invalidity_reason'], {
    field: 'lane_detail.invalidity_reason',
    max_chars: 500,
    max_newlines: 0,
  });
  const validationEvidence = normalizeLaneTextList(input['validation_evidence'], 'lane_detail.validation_evidence');
  const missingContext = input['missing_reproducibility_context'] === undefined
    ? { ok: true as const, value: [] }
    : normalizeLaneTextList(input['missing_reproducibility_context'], 'lane_detail.missing_reproducibility_context');
  collectIssues(issues, reason);
  collectIssues(issues, validationEvidence);
  collectIssues(issues, missingContext);
  if (issues.length > 0 || !reason.ok || !validationEvidence.ok || !missingContext.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      closure_outcome: 'INVALID',
      invalidity_reason: reason.value,
      validation_evidence: validationEvidence.value,
      missing_reproducibility_context: missingContext.value,
    },
  };
}

function normalizeLaneTextList(input: unknown, path: string): TriageRoutingValidationResult<string[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [issue(path, 'invalid_type', `${path} must be an array`)] };
  }

  const values: string[] = [];
  const issues: TriageRoutingValidationIssue[] = [];
  input.forEach((item, index) => {
    const result = normalizeTriageRoutingText(item, {
      field: `${path}.${String(index)}`,
      max_chars: 300,
      max_newlines: 0,
    });
    collectIssues(issues, result);
    if (result.ok && result.value.length > 0) values.push(result.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: values };
}

function normalizeDeferredSetupAction(
  input: unknown,
): TriageRoutingValidationResult<SpecKitHandoffDetail['deferred_setup_action']> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        issue(
          'lane_detail.deferred_setup_action',
          'invalid_type',
          'lane_detail.deferred_setup_action must be an object',
        ),
      ],
    };
  }

  const issues: TriageRoutingValidationIssue[] = [];
  if (input['automatic_setup'] !== false) {
    issues.push(
      issue(
        'lane_detail.deferred_setup_action.automatic_setup',
        'invalid_literal',
        'automatic_setup must be false',
      ),
    );
  }

  const ownerAction = normalizeTriageRoutingText(input['owner_action'], {
    field: 'lane_detail.deferred_setup_action.owner_action',
    max_chars: 500,
    max_newlines: 0,
  });
  collectIssues(issues, ownerAction);

  if (issues.length > 0 || !ownerAction.ok) return { ok: false, issues };

  return {
    ok: true,
    value: {
      automatic_setup: false,
      owner_action: ownerAction.value,
    },
  };
}

function hasDeferredSideEffect(
  sideEffects: readonly DeferredSideEffect[],
  sideEffect: TriageRoutingDeferredSideEffectType,
): boolean {
  return sideEffects.some((entry) => entry.side_effect === sideEffect);
}

function normalizeEvidenceLinks(input: unknown): TriageRoutingValidationResult<SafeEvidenceReference[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [issue('evidence_links', 'invalid_type', 'evidence_links must be an array')] };
  }

  const links: SafeEvidenceReference[] = [];
  const issues: TriageRoutingValidationIssue[] = [];
  input.forEach((link, index) => {
    const result = normalizeSafeEvidenceReference(link);
    if (result.ok) {
      links.push(result.value);
      return;
    }
    issues.push(...result.issues.map((entry) => ({ ...entry, path: `evidence_links.${String(index)}.${entry.path}` })));
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: links };
}

function normalizeDeferredSideEffects(input: unknown): TriageRoutingValidationResult<DeferredSideEffect[]> {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [issue('deferred_side_effects', 'invalid_type', 'deferred_side_effects must be an array')],
    };
  }

  const sideEffects: DeferredSideEffect[] = [];
  const issues: TriageRoutingValidationIssue[] = [];
  input.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(
        issue(`deferred_side_effects.${String(index)}`, 'invalid_type', 'deferred side effect must be an object'),
      );
      return;
    }

    const sideEffect = entry['side_effect'];
    if (!isDeferredSideEffectType(sideEffect)) {
      issues.push(
        issue(`deferred_side_effects.${String(index)}.side_effect`, 'invalid_type', 'side_effect is not supported'),
      );
    }

    if (entry['deferred'] !== true) {
      issues.push(
        issue(`deferred_side_effects.${String(index)}.deferred`, 'invalid_type', 'deferred must be true'),
      );
    }

    const reason = normalizeTriageRoutingText(entry['reason'], {
      field: `deferred_side_effects.${String(index)}.reason`,
      max_chars: 500,
      max_newlines: 0,
    });
    collectIssues(issues, reason);

    if (isDeferredSideEffectType(sideEffect) && entry['deferred'] === true && reason.ok) {
      sideEffects.push({ side_effect: sideEffect, deferred: true, reason: reason.value });
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: sideEffects };
}

function normalizeSourceIssue(input: unknown, issues: TriageRoutingValidationIssue[]): SourceIssueReference | undefined {
  if (!isRecord(input)) {
    issues.push(issue('source_issue', 'invalid_type', 'source_issue must be an object'));
    return undefined;
  }

  const sourceIssue: { repo?: string; number?: number; url?: string } = {};
  if (input['repo'] !== undefined) {
    const repo = normalizeTriageRoutingText(input['repo'], {
      field: 'source_issue.repo',
      max_chars: 200,
      max_newlines: 0,
    });
    collectIssues(issues, repo);
    if (repo.ok) sourceIssue.repo = repo.value;
  }
  if (input['number'] !== undefined) {
    const number = readPositiveInteger(input['number'], 'source_issue.number', issues);
    if (number !== undefined) sourceIssue.number = number;
  }
  if (typeof input['url'] === 'string') {
    const url = normalizeEvidenceUrl('github_issue', input['url']) ?? normalizeEvidenceUrl('github_pr', input['url']);
    if (url) sourceIssue.url = url;
  }
  return sourceIssue;
}

function normalizeProducedAt(input: unknown, issues: TriageRoutingValidationIssue[]): string | undefined {
  if (typeof input !== 'string') {
    issues.push(issue('produced_at', 'invalid_type', 'produced_at must be a string'));
    return undefined;
  }

  const date = new Date(input);
  if (!Number.isFinite(date.valueOf())) {
    issues.push(issue('produced_at', 'invalid_datetime', 'produced_at must be an ISO datetime'));
    return undefined;
  }
  return input;
}

function readPositiveInteger(
  input: unknown,
  path: string,
  issues: TriageRoutingValidationIssue[],
): number | undefined {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
    issues.push(issue(path, 'invalid_integer', `${path} must be a positive integer`));
    return undefined;
  }
  return input;
}

function collectIssues<T>(issues: TriageRoutingValidationIssue[], result: TriageRoutingValidationResult<T>): void {
  if (!result.ok) issues.push(...result.issues);
}

function findDisallowedControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode === MULTILINE_LINE_FEED) continue;
    if (charCode <= 0x1f || (charCode >= 0x7f && charCode <= 0x9f)) return true;
  }
  return false;
}

function countNewlines(value: string): number {
  return value.split('\n').length - 1;
}

function issue(
  path: string,
  code: TriageRoutingValidationIssue['code'],
  message: string,
): TriageRoutingValidationIssue {
  return { path, code, message };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isSupportedDisposition(input: unknown): input is SupportedTriageRoutingDisposition {
  return SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS.includes(input as SupportedTriageRoutingDisposition);
}

function isClosureDisposition(input: unknown): input is 'DUPLICATE' | 'OBSOLETE' | 'INVALID' {
  return input === 'DUPLICATE' || input === 'OBSOLETE' || input === 'INVALID';
}

function isTriageRoutingLane(input: unknown): input is TriageRoutingLane {
  return TRIAGE_ROUTING_LANES.includes(input as TriageRoutingLane);
}

function isTriageRoutingArtifactType(input: unknown): input is TriageRoutingArtifactType {
  return TRIAGE_ROUTING_ARTIFACT_TYPES.includes(input as TriageRoutingArtifactType);
}

function isSafeEvidenceReferenceType(input: unknown): input is SafeEvidenceReferenceType {
  return TRIAGE_ROUTING_SAFE_EVIDENCE_TYPES.includes(input as SafeEvidenceReferenceType);
}

function isDeferredSideEffectType(input: unknown): input is TriageRoutingDeferredSideEffectType {
  return TRIAGE_ROUTING_DEFERRED_SIDE_EFFECTS.includes(input as TriageRoutingDeferredSideEffectType);
}

function optionalPositiveInteger(input: unknown, key: 'artifact_id' | 'activity_id'): Partial<SafeEvidenceReference> {
  if (typeof input === 'number' && Number.isSafeInteger(input) && input > 0) return { [key]: input };
  return {};
}

function normalizeEvidenceUrl(type: SafeEvidenceReferenceType, rawUrl: string): string | undefined {
  if (type === 'other') return undefined;

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || findDisallowedControl(trimmed)) return undefined;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return undefined;
    }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
    parsed.search = '';
    parsed.hash = '';

    if (type === 'github_issue' && isAllowedGithubPath(parsed, /^\/racecraft-lab\/Paddock\/issues\/\d+$/)) {
      return parsed.toString();
    }
    if (type === 'github_pr' && isAllowedGithubPath(parsed, /^\/racecraft-lab\/Paddock\/pull\/\d+$/)) {
      return parsed.toString();
    }
    return undefined;
  }

  if (trimmed.startsWith('//')) return undefined;

  const stripped = stripQueryAndFragment(trimmed);
  if (stripped.length === 0) return undefined;

  if (type === 'static_doc' && isAllowedStaticDocPath(stripped)) return stripped;
  if ((type === 'artifact' || type === 'activity') && isAllowedInternalReferencePath(type, stripped)) return stripped;
  if (type === 'github_issue' && /^\/tasks\/\d+$/.test(stripped)) return stripped;
  return undefined;
}

function isAllowedGithubPath(parsed: URL, pathPattern: RegExp): boolean {
  return parsed.hostname === 'github.com' && pathPattern.test(parsed.pathname);
}

function stripQueryAndFragment(value: string): string {
  const queryIndex = value.indexOf('?');
  const fragmentIndex = value.indexOf('#');
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const stopIndex = indexes.length > 0 ? Math.min(...indexes) : value.length;
  return value.slice(0, stopIndex);
}

function isAllowedStaticDocPath(path: string): boolean {
  return (
    /^\/?docs\/[A-Za-z0-9._/+-]+$/.test(path) ||
    /^\/?specs\/009f-production-triage-routing\/[A-Za-z0-9._/+-]+$/.test(path)
  );
}

function isAllowedInternalReferencePath(type: 'artifact' | 'activity', path: string): boolean {
  if (type === 'artifact') return /^\/?(artifacts|task-artifacts)\/\d+$/.test(path);
  return /^\/?activities\/\d+$/.test(path);
}
