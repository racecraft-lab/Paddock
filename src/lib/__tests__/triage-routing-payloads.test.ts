import { describe, expect, it } from 'vitest';
import {
  buildNeedsHumanTriageRoutingPayload,
  buildNeedsSpecialistTriageRoutingPayload,
  buildNeedsSpecTriageRoutingPayload,
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
  validateNeedsHumanTriageRoutingPayload,
  validateNeedsSpecialistTriageRoutingPayload,
  validateNeedsSpecTriageRoutingPayload,
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

describe('SPEC-009F NEEDS_SPEC handoff payloads', () => {
  it('builds a normalized SpecKit handoff payload with deferred setup held for the owner', () => {
    const result = buildNeedsSpecTriageRoutingPayload({
      source_task_id: 42,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 123,
        url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=raw-secret#frag',
      },
      triage_rationale: ' Needs a SpecKit brief\r\nbefore implementation\twork. ',
      recommended_next_action: ' Owner reviews and runs setup manually. ',
      proposed_labels: [' MC:Needs-Spec ', 'mc:needs-spec', ' Area:Routing '],
      evidence_links: [
        {
          type: 'github_issue',
          label: ' Issue 123 ',
          url: 'https://github.com/racecraft-lab/mission-control/issues/123?token=raw-secret',
        },
      ],
      proposed_scope: ' Specify the production routing behavior.\r\nKeep the scope tight. ',
      non_goals: [' Do not create a spec worktree automatically. ', ' Do not enter Issue Remediation. '],
      deferred_setup_action: {
        owner_action: ' Owner decides whether to start SpecKit setup from this handoff. ',
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        schema_version: 'spec-009f.triage_routing.v1',
        artifact_type: 'triage_speckit_handoff',
        source_task_id: 42,
        workspace_id: 7,
        source_issue: {
          repo: 'racecraft-lab/mission-control',
          number: 123,
          url: 'https://github.com/racecraft-lab/mission-control/issues/123',
        },
        disposition: 'NEEDS_SPEC',
        lane: 'speckit_handoff',
        routing_status: 'recorded',
        triage_rationale: 'Needs a SpecKit brief\nbefore implementation work.',
        recommended_next_action: 'Owner reviews and runs setup manually.',
        proposed_labels: [
          {
            name: 'mc:needs-spec',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
          {
            name: 'area:routing',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
        ],
        evidence_links: [
          {
            type: 'github_issue',
            label: 'Issue 123',
            url: 'https://github.com/racecraft-lab/mission-control/issues/123',
          },
        ],
        deferred_side_effects: [
          {
            side_effect: 'speckit_setup',
            deferred: true,
            reason: 'SpecKit setup remains an owner action.',
          },
        ],
        lane_detail: {
          proposed_scope: 'Specify the production routing behavior.\nKeep the scope tight.',
          non_goals: ['Do not create a spec worktree automatically.', 'Do not enter Issue Remediation.'],
          deferred_setup_action: {
            automatic_setup: false,
            owner_action: 'Owner decides whether to start SpecKit setup from this handoff.',
          },
        },
        produced_at: '2026-05-21T12:00:00.000Z',
        idempotency_key: 'spec-009f.triage_routing.v1:7:42:NEEDS_SPEC',
      },
    });
  });

  it('validates NEEDS_SPEC handoff payloads and rejects automatic setup without leaking raw values', () => {
    const result = validateNeedsSpecTriageRoutingPayload({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_clarification_request',
      source_task_id: 42,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 123,
      },
      disposition: 'NEEDS_HUMAN',
      lane: 'clarification_request',
      routing_status: 'recorded',
      triage_rationale: 'raw-secret needs spec',
      recommended_next_action: 'Owner reviews the handoff.',
      proposed_labels: ['raw-secret-label'],
      evidence_links: [],
      deferred_side_effects: [
        {
          side_effect: 'speckit_setup',
          deferred: true,
          reason: 'Owner action only.',
        },
      ],
      lane_detail: {
        proposed_scope: 'raw-secret scope',
        non_goals: ['safe non-goal', 'raw-secret\nbad non-goal'],
        deferred_setup_action: {
          automatic_setup: true,
          owner_action: 'raw-secret owner action',
        },
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'disposition', code: 'unsupported_disposition' }),
        expect.objectContaining({ path: 'lane', code: 'invalid_lane' }),
        expect.objectContaining({ path: 'artifact_type', code: 'invalid_artifact_type' }),
        expect.objectContaining({ path: 'lane_detail.non_goals.1', code: 'too_many_newlines' }),
        expect.objectContaining({
          path: 'lane_detail.deferred_setup_action.automatic_setup',
          code: 'invalid_literal',
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('raw-secret');
  });

  it('rejects NEEDS_SPEC payloads that omit the deferred SpecKit setup side effect', () => {
    const result = validateNeedsSpecTriageRoutingPayload({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_speckit_handoff',
      source_task_id: 42,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 123,
      },
      disposition: 'NEEDS_SPEC',
      lane: 'speckit_handoff',
      routing_status: 'recorded',
      triage_rationale: 'Needs a spec before implementation.',
      recommended_next_action: 'Owner reviews and runs setup manually.',
      proposed_labels: ['mc:needs-spec'],
      evidence_links: [],
      deferred_side_effects: [
        {
          side_effect: 'github_label',
          deferred: true,
          reason: 'Labels are recommendations only.',
        },
      ],
      lane_detail: {
        proposed_scope: 'Specify the production routing behavior.',
        non_goals: ['Do not enter Issue Remediation.'],
        deferred_setup_action: {
          automatic_setup: false,
          owner_action: 'Owner decides whether to start SpecKit setup from this handoff.',
        },
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          path: 'deferred_side_effects',
          code: 'missing_deferred_side_effect',
        },
      ],
    });
  });
});

describe('SPEC-009F NEEDS_HUMAN clarification payloads', () => {
  it('builds a normalized clarification request payload without sending an external message', () => {
    const result = buildNeedsHumanTriageRoutingPayload({
      source_task_id: 43,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 124,
        url: 'https://github.com/racecraft-lab/mission-control/issues/124?token=raw-secret#frag',
      },
      triage_rationale: ' Needs owner clarification\r\nbefore routing\twork. ',
      recommended_next_action: ' Owner answers the blocking questions. ',
      proposed_labels: [
        {
          name: ' MC:Needs-Human ',
          source: 'triage_routing',
          action: 'recommend_add',
          applied: false,
        },
        'Area:Routing',
      ],
      evidence_links: [
        {
          type: 'github_issue',
          label: ' Issue 124 ',
          url: 'https://github.com/racecraft-lab/mission-control/issues/124?token=raw-secret',
        },
      ],
      blocking_questions: [
        ' Which user-visible behavior should change? ',
        'Which environment proves the issue?\r\n',
      ],
      target_audience: ' Issue owner ',
      evidence_needed: [' Minimal reproduction notes ', ' Expected result confirmation '],
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        schema_version: 'spec-009f.triage_routing.v1',
        artifact_type: 'triage_clarification_request',
        source_task_id: 43,
        workspace_id: 7,
        source_issue: {
          repo: 'racecraft-lab/mission-control',
          number: 124,
          url: 'https://github.com/racecraft-lab/mission-control/issues/124',
        },
        disposition: 'NEEDS_HUMAN',
        lane: 'clarification_request',
        routing_status: 'recorded',
        triage_rationale: 'Needs owner clarification\nbefore routing work.',
        recommended_next_action: 'Owner answers the blocking questions.',
        proposed_labels: [
          {
            name: 'mc:needs-human',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
          {
            name: 'area:routing',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
        ],
        evidence_links: [
          {
            type: 'github_issue',
            label: 'Issue 124',
            url: 'https://github.com/racecraft-lab/mission-control/issues/124',
          },
        ],
        lane_detail: {
          blocking_questions: ['Which user-visible behavior should change?', 'Which environment proves the issue?'],
          target_audience: 'Issue owner',
          evidence_needed: ['Minimal reproduction notes', 'Expected result confirmation'],
          no_external_message_sent: true,
        },
        produced_at: '2026-05-21T12:00:00.000Z',
        idempotency_key: 'spec-009f.triage_routing.v1:7:43:NEEDS_HUMAN',
      },
    });
    if (!result.ok) throw new Error('expected NEEDS_HUMAN payload to build')
    expect(result.value.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_comment', deferred: true }),
        expect.objectContaining({ side_effect: 'successor_task', deferred: true }),
      ]),
    );
  });

  it('validates NEEDS_HUMAN payloads and rejects unsafe clarification fields without leaking raw values', () => {
    const result = validateNeedsHumanTriageRoutingPayload({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_clarification_request',
      source_task_id: 43,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 124,
      },
      disposition: 'NEEDS_HUMAN',
      lane: 'clarification_request',
      routing_status: 'recorded',
      triage_rationale: 'raw-secret needs human',
      recommended_next_action: 'Owner answers the blocking questions.',
      proposed_labels: ['mc:needs-human'],
      evidence_links: [],
      deferred_side_effects: [],
      lane_detail: {
        blocking_questions: ['safe question', 'raw-secret\nbad question'],
        target_audience: 'Issue owner\u0000raw-secret',
        evidence_needed: [`raw-secret:${'x'.repeat(301)}`],
        no_external_message_sent: false,
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'lane_detail.blocking_questions.1', code: 'too_many_newlines' }),
        expect.objectContaining({ path: 'lane_detail.target_audience', code: 'control_character' }),
        expect.objectContaining({ path: 'lane_detail.evidence_needed.0', code: 'text_too_long' }),
        expect.objectContaining({ path: 'lane_detail.no_external_message_sent', code: 'invalid_literal' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('raw-secret');
  });
});

describe('SPEC-009F NEEDS_SPECIALIST recommendation payloads', () => {
  it('builds a deterministic specialist recommendation from explicit metadata', () => {
    const result = buildNeedsSpecialistTriageRoutingPayload({
      source_task_id: 44,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 125,
      },
      triage_rationale: ' Safe metadata identifies one specialist. ',
      recommended_next_action: ' Owner reviews the specialist recommendation. ',
      proposed_labels: [' MC:Needs-Specialist ', ' Area:QA '],
      evidence_links: [],
      specialist_state: 'recommended',
      recommended_lane: ' qa-specialist ',
      recommended_owner: ' spec-009f-specialist ',
      matching_basis: [' project.area_slug=qa ', ' single same-workspace assignment '],
      issue_body: 'raw-secret body must not be persisted',
      inferred_from_issue_body: true,
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        schema_version: 'spec-009f.triage_routing.v1',
        artifact_type: 'triage_specialist_recommendation',
        source_task_id: 44,
        workspace_id: 7,
        disposition: 'NEEDS_SPECIALIST',
        lane: 'specialist_recommendation',
        routing_status: 'recorded',
        triage_rationale: 'Safe metadata identifies one specialist.',
        recommended_next_action: 'Owner reviews the specialist recommendation.',
        proposed_labels: [
          {
            name: 'mc:needs-specialist',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
          {
            name: 'area:qa',
            source: 'triage_routing',
            action: 'recommend_add',
            applied: false,
          },
        ],
        evidence_links: [],
        lane_detail: {
          specialist_state: 'recommended',
          recommended_lane: 'qa-specialist',
          recommended_owner: 'spec-009f-specialist',
          matching_confidence: 'deterministic',
          matching_basis: ['project.area_slug=qa', 'single same-workspace assignment'],
        },
        produced_at: '2026-05-21T12:00:00.000Z',
        idempotency_key: 'spec-009f.triage_routing.v1:7:44:NEEDS_SPECIALIST',
      },
    });
    if (!result.ok) throw new Error('expected NEEDS_SPECIALIST payload to build')
    expect(result.value.deferred_side_effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side_effect: 'github_assignment', deferred: true }),
        expect.objectContaining({ side_effect: 'agent_dispatch', deferred: true }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('raw-secret');
    expect(JSON.stringify(result)).not.toContain('issue_body');
    expect(JSON.stringify(result)).not.toContain('inferred_from_issue_body');
  });

  it('validates persisted unassigned specialist recommendations with missing metadata and owner action', () => {
    const result = validateNeedsSpecialistTriageRoutingPayload({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_specialist_recommendation',
      source_task_id: 45,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 126,
      },
      disposition: 'NEEDS_SPECIALIST',
      lane: 'specialist_recommendation',
      routing_status: 'recorded',
      triage_rationale: 'No safe specialist metadata is available.',
      recommended_next_action: 'Owner supplies specialist context.',
      proposed_labels: ['mc:needs-specialist'],
      evidence_links: [],
      deferred_side_effects: [],
      lane_detail: {
        specialist_state: 'unassigned',
        missing_metadata: ['missing area', 'missing same-workspace assignment'],
        owner_action: 'Owner chooses or supplies specialist context.',
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        artifact_type: 'triage_specialist_recommendation',
        disposition: 'NEEDS_SPECIALIST',
        lane: 'specialist_recommendation',
        lane_detail: {
          specialist_state: 'unassigned',
          missing_metadata: ['missing area', 'missing same-workspace assignment'],
          owner_action: 'Owner chooses or supplies specialist context.',
        },
      },
    });
  });

  it('rejects unsafe or non-deterministic specialist details without leaking raw values', () => {
    const result = validateNeedsSpecialistTriageRoutingPayload({
      schema_version: 'spec-009f.triage_routing.v1',
      artifact_type: 'triage_specialist_recommendation',
      source_task_id: 44,
      workspace_id: 7,
      source_issue: {
        repo: 'racecraft-lab/mission-control',
        number: 125,
      },
      disposition: 'NEEDS_SPECIALIST',
      lane: 'specialist_recommendation',
      routing_status: 'recorded',
      triage_rationale: 'raw-secret needs specialist',
      recommended_next_action: 'Owner reviews the specialist recommendation.',
      proposed_labels: ['mc:needs-specialist'],
      evidence_links: [],
      deferred_side_effects: [],
      lane_detail: {
        specialist_state: 'recommended',
        recommended_lane: 'qa-specialist\u0000raw-secret',
        recommended_owner: 'spec-009f-specialist',
        matching_confidence: 'probable',
        matching_basis: ['safe basis', 'raw-secret\nbad basis'],
        issue_body: 'raw-secret issue body',
      },
      produced_at: '2026-05-21T12:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'lane_detail.recommended_lane', code: 'control_character' }),
        expect.objectContaining({ path: 'lane_detail.matching_confidence', code: 'invalid_literal' }),
        expect.objectContaining({ path: 'lane_detail.matching_basis.1', code: 'too_many_newlines' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('raw-secret');
    expect(JSON.stringify(result)).not.toContain('probable');
  });
});
