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
  readonly [key: string]: unknown;
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

  labels.forEach((label, index) => {
    const result = normalizeTriageRoutingText(label, {
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

  const sourceIssue: SourceIssueReference = { ...input };
  if (typeof input['url'] === 'string') {
    const url = normalizeEvidenceUrl('github_issue', input['url']) ?? normalizeEvidenceUrl('github_pr', input['url']);
    if (url) return { ...sourceIssue, url };
    const { url: discardedUrl, ...withoutUrl } = sourceIssue;
    void discardedUrl;
    return withoutUrl;
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

    if (type === 'github_issue' && isAllowedGithubPath(parsed, /^\/racecraft-lab\/mission-control\/issues\/\d+$/)) {
      return parsed.toString();
    }
    if (type === 'github_pr' && isAllowedGithubPath(parsed, /^\/racecraft-lab\/mission-control\/pull\/\d+$/)) {
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
