import { describe, expect, it } from 'vitest';
import {
  buildTriageRoutingIdempotencyKey,
  normalizeProposedLabels,
  normalizeSafeEvidenceReference,
  normalizeTriageRoutingText,
  SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS,
  TRIAGE_ROUTING_ARTIFACT_TYPES,
  TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE,
  TRIAGE_ROUTING_DISPOSITION_TO_LANE,
  TRIAGE_ROUTING_LANES,
  TRIAGE_ROUTING_SCHEMA_VERSION,
  validateCommonTriageRoutingPayloadEnvelope,
} from '@/lib/triage-routing-payloads';

describe('SPEC-009F triage routing payload foundation', () => {
  it('exports the v1 schema, supported dispositions, lanes, artifact types, and idempotency key format', () => {
    expect(TRIAGE_ROUTING_SCHEMA_VERSION).toBe('spec-009f.triage_routing.v1');
    expect(SUPPORTED_TRIAGE_ROUTING_DISPOSITIONS).toEqual([
      'NEEDS_SPEC',
      'NEEDS_HUMAN',
      'NEEDS_SPECIALIST',
      'DUPLICATE',
      'OBSOLETE',
      'INVALID',
    ]);
    expect(TRIAGE_ROUTING_LANES).toEqual([
      'speckit_handoff',
      'clarification_request',
      'specialist_recommendation',
      'closure_recommendation',
    ]);
    expect(TRIAGE_ROUTING_ARTIFACT_TYPES).toEqual([
      'triage_speckit_handoff',
      'triage_clarification_request',
      'triage_specialist_recommendation',
      'triage_closure_recommendation',
    ]);
    expect(TRIAGE_ROUTING_DISPOSITION_TO_LANE).toMatchObject({
      NEEDS_SPEC: 'speckit_handoff',
      NEEDS_HUMAN: 'clarification_request',
      NEEDS_SPECIALIST: 'specialist_recommendation',
      DUPLICATE: 'closure_recommendation',
      OBSOLETE: 'closure_recommendation',
      INVALID: 'closure_recommendation',
    });
    expect(TRIAGE_ROUTING_DISPOSITION_TO_ARTIFACT_TYPE).toMatchObject({
      NEEDS_SPEC: 'triage_speckit_handoff',
      NEEDS_HUMAN: 'triage_clarification_request',
      NEEDS_SPECIALIST: 'triage_specialist_recommendation',
      DUPLICATE: 'triage_closure_recommendation',
      OBSOLETE: 'triage_closure_recommendation',
      INVALID: 'triage_closure_recommendation',
    });
    expect(
      buildTriageRoutingIdempotencyKey({
        workspace_id: 7,
        source_task_id: 42,
        disposition: 'NEEDS_SPEC',
      }),
    ).toBe('spec-009f.triage_routing.v1:7:42:NEEDS_SPEC');
  });

  it('normalizes proposed labels as recommendation metadata only', () => {
    expect(normalizeProposedLabels([' MC:Needs-Spec ', 'mc:needs-spec', 'Area:UI'])).toEqual({
      ok: true,
      value: [
        {
          name: 'mc:needs-spec',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        {
          name: 'area:ui',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
      ],
    });
  });

  it('normalizes safe evidence references and strips query strings and fragments from active links', () => {
    expect(
      normalizeSafeEvidenceReference({
        type: 'github_issue',
        label: ' Reported issue ',
        url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=secret#frag',
      }),
    ).toEqual({
      ok: true,
      value: {
        type: 'github_issue',
        label: 'Reported issue',
        url: 'https://github.com/racecraft-lab/mission-control/issues/123',
      },
    });

    expect(
      normalizeSafeEvidenceReference({
        type: 'static_doc',
        label: 'Spec checklist',
        url: '/specs/009f-production-triage-routing/checklists/security.md?raw=1#unsafe',
      }),
    ).toEqual({
      ok: true,
      value: {
        type: 'static_doc',
        label: 'Spec checklist',
        url: '/specs/009f-production-triage-routing/checklists/security.md',
      },
    });
  });

  it('validates and normalizes common envelope fields before artifact publishing', () => {
    const result = validateCommonTriageRoutingPayloadEnvelope({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_speckit_handoff',
      source_task_id: 42,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 123,
        url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=secret',
      },
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      triage_rationale: '  Needs a spec\r\nbefore implementation\twork.  ',
      recommended_next_action: '  Draft the SpecKit brief.  ',
      proposed_labels: [' MC:Needs-Spec ', 'mc:needs-spec'],
      evidence_links: [
        {
          type: 'github_issue',
          label: 'Issue 123',
          url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=secret',
        },
      ],
      deferred_side_effects: [
        {
          side_effect: 'speckit_setup',
          deferred: true,
          reason: ' Owner runs setup after accepting scope. ',
        },
      ],
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        schema_version: 'spec-009f.triage_routing.v1',
        artifact_type: 'triage_speckit_handoff',
        disposition: 'NEEDS_SPEC',
        lane: 'speckit_handoff',
        routing_status: 'recorded',
        triage_rationale: 'Needs a spec\nbefore implementation work.',
        recommended_next_action: 'Draft the SpecKit brief.',
        idempotency_key: 'spec-009f.triage_routing.v1:7:42:NEEDS_SPEC',
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected common envelope validation to pass');
    expect(result.value.proposed_labels).toEqual([
      {
        name: 'mc:needs-spec',
        source: 'triage_routing',
        action: 'recommend_add',
        applied: false,
      },
    ]);
    expect(result.value.evidence_links[0]?.url).toBe('https://github.com/racecraft-lab/mission-control/issues/123');
  });
});

describe('SPEC-009F triage routing text and link security', () => {
  it('normalizes text to NFC, trims whitespace, converts tabs, and normalizes CRLF', () => {
    expect(
      normalizeTriageRoutingText(' e\u0301\tline\r\nnext ', {
        field: 'triage_rationale',
        max_chars: 2000,
        max_newlines: 8,
      }),
    ).toEqual({
      ok: true,
      value: 'é line\nnext',
    });
  });

  it('fails closed on over-limit text without echoing the rejected raw value', () => {
    const result = normalizeTriageRoutingText(`raw-secret:${'x'.repeat(2001)}`, {
      field: 'triage_rationale',
      max_chars: 2000,
      max_newlines: 8,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'triage_rationale',
          code: 'text_too_long',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('raw-secret');
  });

  it('fails closed on C0/C1 controls except bounded LF in multiline fields', () => {
    const result = normalizeTriageRoutingText('safe\u0000unsafe', {
      field: 'recommended_next_action',
      max_chars: 500,
      max_newlines: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'recommended_next_action',
          code: 'control_character',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('safe');
    expect(JSON.stringify(result)).not.toContain('unsafe');
  });

  it('fails closed when newline limits are exceeded', () => {
    const result = normalizeTriageRoutingText('line one\nline two', {
      field: 'recommended_next_action',
      max_chars: 500,
      max_newlines: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'recommended_next_action',
          code: 'too_many_newlines',
        },
      ],
    });
  });

  it('renders unsafe schemes, arbitrary hosts, and other references as inert text', () => {
    expect(
      normalizeSafeEvidenceReference({
        type: 'github_issue',
        label: 'Unsafe issue',
        url: 'javascript:alert(1)',
      }),
    ).toEqual({
      ok: true,
      value: {
        type: 'github_issue',
        label: 'Unsafe issue',
      },
      warnings: [
        {
          path: 'url',
          code: 'unsafe_url_removed',
          message: 'url was removed because it is not allowlisted',
        },
      ],
    });

    expect(
      normalizeSafeEvidenceReference({
        type: 'github_issue',
        label: 'Wrong host',
        url: 'https://example.com/issues/123?token=secret',
      }),
    ).toEqual({
      ok: true,
      value: {
        type: 'github_issue',
        label: 'Wrong host',
      },
      warnings: [
        {
          path: 'url',
          code: 'unsafe_url_removed',
          message: 'url was removed because it is not allowlisted',
        },
      ],
    });

    expect(
      normalizeSafeEvidenceReference({
        type: 'other',
        label: 'External context',
        url: 'https://github.com/racecraft-lab/mission-control/issues/123',
      }),
    ).toEqual({
      ok: true,
      value: {
        type: 'other',
        label: 'External context',
      },
      warnings: [
        {
          path: 'url',
          code: 'unsafe_url_removed',
          message: 'url was removed because it is not allowlisted',
        },
      ],
    });
  });

  it('returns sanitized validation reasons for envelope failures', () => {
    const result = validateCommonTriageRoutingPayloadEnvelope({
      schema_version: 'wrong',
      artifact_type: 'triage_speckit_handoff',
      source_task_id: 42,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 123,
        url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=raw-secret',
      },
      disposition: 'ACTIONABLE_REMEDIATION',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      triage_rationale: `raw-secret:${'x'.repeat(2001)}`,
      recommended_next_action: 'line one\nline two',
      proposed_labels: ['mc:needs-spec'],
      evidence_links: [],
      deferred_side_effects: [],
      produced_at: 'not-a-date',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'schema_version', code: 'invalid_schema_version' }),
        expect.objectContaining({ path: 'disposition', code: 'unsupported_disposition' }),
        expect.objectContaining({ path: 'triage_rationale', code: 'text_too_long' }),
        expect.objectContaining({ path: 'recommended_next_action', code: 'too_many_newlines' }),
        expect.objectContaining({ path: 'produced_at', code: 'invalid_datetime' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('raw-secret');
    expect(JSON.stringify(result)).not.toContain('ACTIONABLE_REMEDIATION');
  });
});
