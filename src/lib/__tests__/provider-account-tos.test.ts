/**
 * SPEC-008 — Tests for provider account ToS surface lifecycle (T121).
 *
 * Covers FR-139, FR-146, FR-147, FR-219w, FR-219y:
 *   - automation_class='forbidden' hard-blocks adapter activation
 *   - never_acked accounts cannot activate
 *   - re-prompt banner on ack_version bump (within 7-day grace)
 *   - past 7-day grace, adapter activation blocks
 *   - recordAcknowledgement bumps current_ack_version + pushes history
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_RUNTIME_ACK_VERSION,
  REACK_GRACE_MS,
  evaluateAdapterActivation,
  evaluateBannerState,
  recordAcknowledgement,
  setAutomationClass,
} from '@/lib/provider-account-tos';
import { createProviderAccount, getProviderAccount } from '@/lib/provider-accounts';
import { runMigrations } from '@/lib/migrations';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
});

function seedAccount(governance_tos_acknowledgments_json?: string) {
  return createProviderAccount(db, {
    provider: 'anthropic',
    account_label: `acct-${Math.random().toString(36).slice(2, 8)}`,
    automation_class: 'restricted',
    ...(governance_tos_acknowledgments_json !== undefined
      ? { governance_tos_acknowledgments_json }
      : {}),
  });
}

describe('SPEC-008 provider-account-tos — automation_class gate (FR-219w)', () => {
  it('hard-blocks activation when automation_class=forbidden', () => {
    const account = seedAccount();
    setAutomationClass(db, account.id, 'forbidden', account.version);
    const refreshed = getProviderAccount(db, account.id)!;
    const decision = evaluateAdapterActivation(refreshed);
    expect(decision.active).toBe(false);
    expect(decision.reason).toBe('automation_class_forbidden');
  });

  it('forbidden gate wins over ToS state (acked + forbidden = blocked)', () => {
    const ackJson = JSON.stringify({
      current_ack_version: CURRENT_RUNTIME_ACK_VERSION,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: 'op@example.com',
      history: [],
    });
    const account = seedAccount(ackJson);
    setAutomationClass(db, account.id, 'forbidden', account.version);
    const refreshed = getProviderAccount(db, account.id)!;
    const decision = evaluateAdapterActivation(refreshed);
    expect(decision.active).toBe(false);
    expect(decision.reason).toBe('automation_class_forbidden');
  });
});

describe('SPEC-008 provider-account-tos — banner state (FR-146/FR-147)', () => {
  it('returns never_acked when governance_tos_acknowledgments_json is null', () => {
    const account = seedAccount();
    const decision = evaluateAdapterActivation(account);
    expect(decision.active).toBe(false);
    expect(decision.reason).toBe('tos_never_acked');
    expect(decision.banner_state).toBe('never_acked');
  });

  it('returns banner=none when current_ack_version matches the runtime', () => {
    const ackJson = JSON.stringify({
      current_ack_version: CURRENT_RUNTIME_ACK_VERSION,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: 'op@example.com',
      history: [],
    });
    const account = seedAccount(ackJson);
    const decision = evaluateAdapterActivation(account);
    expect(decision.active).toBe(true);
    expect(decision.reason).toBe('allowed');
    expect(decision.banner_state).toBe('none');
  });

  it('returns reack_required when ack is stale but within 7-day grace', () => {
    const ackedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const ackJson = JSON.stringify({
      current_ack_version: 0, // stale (runtime is at >= 1)
      acknowledged_at: ackedAt,
      acknowledged_by: 'op@example.com',
      history: [],
    });
    const account = seedAccount(ackJson);
    const decision = evaluateAdapterActivation(account);
    expect(decision.active).toBe(true);
    expect(decision.reason).toBe('restricted_pending_ack');
    expect(decision.banner_state).toBe('reack_required');
    expect(decision.grace_expires_at_ms).toBeGreaterThan(Date.parse(ackedAt));
  });

  it('blocks activation past the 7-day grace deadline', () => {
    const ackedAt = new Date(Date.now() - REACK_GRACE_MS - 60_000).toISOString();
    const ackJson = JSON.stringify({
      current_ack_version: 0,
      acknowledged_at: ackedAt,
      acknowledged_by: 'op@example.com',
      history: [],
    });
    const account = seedAccount(ackJson);
    const decision = evaluateAdapterActivation(account);
    expect(decision.active).toBe(false);
    expect(decision.reason).toBe('tos_grace_expired');
    expect(decision.banner_state).toBe('reack_grace_expired');
  });

  it('treats malformed JSON as never_acked (no crash)', () => {
    const account = seedAccount('{malformed json');
    const banner = evaluateBannerState(account);
    expect(banner.banner).toBe('never_acked');
  });
});

describe('SPEC-008 provider-account-tos — recordAcknowledgement', () => {
  it('bumps current_ack_version and pushes prior snapshot to history', () => {
    const ackedAt = new Date(Date.now() - 1000).toISOString();
    const ackJson = JSON.stringify({
      current_ack_version: 0,
      acknowledged_at: ackedAt,
      acknowledged_by: 'op-old@example.com',
      history: [],
    });
    const account = seedAccount(ackJson);
    const updated = recordAcknowledgement(db, {
      account_id: account.id,
      acknowledged_by: 'op-new@example.com',
      expectedVersion: account.version,
    });
    expect(updated.version).toBe(account.version + 1);
    const parsed = JSON.parse(updated.governance_tos_acknowledgments_json!);
    expect(parsed.current_ack_version).toBe(CURRENT_RUNTIME_ACK_VERSION);
    expect(parsed.acknowledged_by).toBe('op-new@example.com');
    expect(parsed.history).toHaveLength(1);
    expect(parsed.history[0].acknowledged_by).toBe('op-old@example.com');
    expect(parsed.history[0].ack_version).toBe(0);
  });

  it('records the first acknowledgement when none existed', () => {
    const account = seedAccount();
    const updated = recordAcknowledgement(db, {
      account_id: account.id,
      acknowledged_by: 'op@example.com',
      expectedVersion: account.version,
    });
    const parsed = JSON.parse(updated.governance_tos_acknowledgments_json!);
    expect(parsed.current_ack_version).toBe(CURRENT_RUNTIME_ACK_VERSION);
    expect(parsed.history).toHaveLength(0);
  });
});
