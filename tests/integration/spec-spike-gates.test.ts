/**
 * SPEC-008 Phase-0 CI Gate — Verification Spike Evidence
 *
 * Per FR-090a (NON-NEGOTIABLE): every `[VERIFY]`-tagged FR MUST have a
 * matching evidence file at `docs/ai/specs/spikes/<slug>.json` whose
 * verdict is `'confirmed'` OR `'downgraded'` matching the FR-prescribed
 * downgrade target. The test FAILS CLOSED if any evidence file is missing
 * or any verdict mismatches the contract.
 *
 * Expected initial state (RED): evidence files do NOT exist yet — the
 * Phase-0 spike scripts (T001-T004) are AUTHORED but not yet RUN by an
 * operator. The CI gate failing is the design — Phase 5 task generation
 * MUST be blocked until operator-side execution produces evidence with a
 * compatible verdict.
 *
 * @see specs/008-resource-governance/spec.md FR-071, FR-071a, FR-072,
 *      FR-072a, FR-073, FR-082, FR-083, FR-090a, FR-090d, FR-090d1, FR-388
 * @see specs/008-resource-governance/tasks.md T005, T377
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SPIKES_DIR = resolve(__dirname, '..', '..', 'docs', 'ai', 'specs', 'spikes');

interface SpikeContract {
  slug: string;
  decisionQ: string;
  frRefs: string[];
  /**
   * Allowed downgrade target for verdict='downgraded'. If the FR mandates
   * a specific downgrade path (e.g., FR-071a → 'claude_code.transcript_replay'),
   * the evidence MUST match. If null, the verdict='downgraded' is rejected.
   */
  allowedDowngradeTargets: string[] | null;
  /**
   * If true, verdict='downgraded' is the EXPECTED empirical outcome
   * (FR-071a Claude `mcp serve` stdio shadowing). The CI gate accepts both
   * 'confirmed' and 'downgraded' for these cases.
   */
  downgradeIsExpected: boolean;
}

const SPIKE_CONTRACTS: SpikeContract[] = [
  {
    slug: 'verify-claude-code-otel-emission',
    decisionQ: 'Q16',
    frRefs: ['FR-071', 'FR-090a'],
    allowedDowngradeTargets: ['claude_code.transcript_replay'],
    downgradeIsExpected: false,
  },
  {
    slug: 'verify-claude-mcp-otel-emission',
    decisionQ: 'Q16',
    frRefs: ['FR-071a', 'FR-090a'],
    allowedDowngradeTargets: ['claude_code.transcript_replay'],
    downgradeIsExpected: true,
  },
  {
    slug: 'verify-codex-stdout-rollout-timestamp-parity',
    decisionQ: 'Q39',
    frRefs: ['FR-072', 'FR-082', 'FR-090a', 'FR-388'],
    allowedDowngradeTargets: ['medium-confidence'],
    downgradeIsExpected: false,
  },
  {
    slug: 'verify-copilot-events-ci',
    decisionQ: 'Q25',
    frRefs: ['FR-073', 'FR-083', 'FR-090a', 'FR-090d', 'FR-090d1'],
    allowedDowngradeTargets: ['schema_broken'],
    downgradeIsExpected: false,
  },
];

interface EvidenceEnvelope {
  decision_q?: unknown;
  hypothesis?: unknown;
  sample_size_min?: unknown;
  observed?: unknown;
  verdict?: unknown;
  downgrade_target?: unknown;
  captured_at?: unknown;
}

function readEvidence(slug: string): { exists: boolean; raw: EvidenceEnvelope | null; error?: string } {
  const path = resolve(SPIKES_DIR, `${slug}.json`);
  if (!existsSync(path)) return { exists: false, raw: null };
  try {
    const body = readFileSync(path, 'utf8');
    const parsed = JSON.parse(body) as EvidenceEnvelope;
    return { exists: true, raw: parsed };
  } catch (err: unknown) {
    return {
      exists: true,
      raw: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isIso8601(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(value);
}

describe('SPEC-008 Phase-0 CI gate — verification spike evidence (FR-090a)', () => {
  for (const contract of SPIKE_CONTRACTS) {
    describe(`${contract.slug} (${contract.frRefs.join(', ')})`, () => {
      it('evidence file MUST exist at docs/ai/specs/spikes/<slug>.json', () => {
        const ev = readEvidence(contract.slug);
        expect(
          ev.exists,
          `MISSING EVIDENCE: docs/ai/specs/spikes/${contract.slug}.json — ` +
            `Phase-0 spike script must be executed by an operator on a node ` +
            `with the relevant CLI installed. See script header for procedure. ` +
            `${contract.frRefs.join(', ')}`,
        ).toBe(true);
      });

      it('evidence MUST be valid JSON matching the FR-090a schema', () => {
        const ev = readEvidence(contract.slug);
        if (!ev.exists) {
          // Surface the missing-file failure in the prior test; no-op here so
          // the schema test does not double-report. Vitest will still mark
          // the prior test red.
          return;
        }
        expect(
          ev.error,
          `EVIDENCE PARSE ERROR: ${ev.error ?? 'unknown'}`,
        ).toBeUndefined();
        expect(ev.raw).toBeTruthy();
        const e = ev.raw!;
        expect(typeof e.decision_q, 'decision_q must be string').toBe('string');
        expect(e.decision_q, `decision_q must equal ${contract.decisionQ}`).toBe(contract.decisionQ);
        expect(typeof e.hypothesis, 'hypothesis must be string').toBe('string');
        expect(typeof e.sample_size_min, 'sample_size_min must be number').toBe('number');
        expect(typeof e.observed, 'observed must be object').toBe('object');
        expect(e.observed).not.toBeNull();
        expect(typeof e.verdict, 'verdict must be string').toBe('string');
        expect(['confirmed', 'downgraded']).toContain(e.verdict);
        expect(isIso8601(e.captured_at), 'captured_at must be ISO-8601').toBe(true);
      });

      it('verdict MUST be confirmed OR a permitted downgraded target', () => {
        const ev = readEvidence(contract.slug);
        if (!ev.exists || !ev.raw) return; // covered above
        const e = ev.raw;

        if (e.verdict === 'confirmed') return; // pass

        if (e.verdict === 'downgraded') {
          if (!contract.allowedDowngradeTargets || contract.allowedDowngradeTargets.length === 0) {
            throw new Error(
              `${contract.slug}: verdict='downgraded' but FR contract permits NO downgrade target. ` +
                `Either re-run the spike to obtain verdict='confirmed' OR amend the FR.`,
            );
          }
          expect(typeof e.downgrade_target).toBe('string');
          expect(
            contract.allowedDowngradeTargets,
            `downgrade_target='${String(
              e.downgrade_target,
            )}' is not in the FR-permitted set ${JSON.stringify(
              contract.allowedDowngradeTargets,
            )}. See ${contract.frRefs.join(', ')}.`,
          ).toContain(e.downgrade_target);
          return;
        }

        throw new Error(
          `${contract.slug}: verdict='${String(e.verdict)}' is not 'confirmed' or 'downgraded'.`,
        );
      });
    });
  }
});
