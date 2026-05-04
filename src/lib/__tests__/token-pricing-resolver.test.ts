/**
 * SPEC-008 — Token-pricing resolver tests.
 *
 * Per FR-260a, Q17, and tasks.md T126. Asserts:
 *
 *   1. Workspace-scope override beats facility-default when both rows
 *      match the same (provider, model, time).
 *   2. Facility-default beats static MODEL_PRICING fallback when the DB
 *      has a row at facility but no workspace override.
 *   3. Static MODEL_PRICING fallback engages when no DB row matches
 *      (and the result `source` is 'fallback').
 *   4. Time-effective ordering: most-recent `effective_at <= requested`
 *      row wins; rows with `expires_at <= requested` are skipped.
 *   5. Cache hit returns the same object without re-querying the DB.
 *   6. Cache TTL eviction: after `now()` advances past the entry's
 *      expiry, the next resolve re-queries and may surface an updated
 *      price.
 *   7. Tie-break on equal `effective_at`: latest `id` wins (the resolver
 *      orders by `effective_at DESC, id DESC`).
 *
 * The resolver accepts an injectable `now` so cache-TTL tests don't
 * need `vi.useFakeTimers()` (which interacts badly with better-sqlite3
 * synchronous prepared statements).
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/migrations';
import { TokenPricingResolver, resolveTokenPricing } from '@/lib/token-pricing-resolver';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

interface InsertRow {
  provider: string;
  model: string;
  scope_kind: 'workspace' | 'facility';
  scope_id: number | null;
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  effective_at: string;
  expires_at?: string | null;
  source?: string;
}

function insertPricing(row: InsertRow): number {
  const result = db
    .prepare(
      `INSERT INTO token_pricing
         (provider, model, scope_kind, scope_id, input_per_mtok_usd, output_per_mtok_usd,
          effective_at, expires_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.provider,
      row.model,
      row.scope_kind,
      row.scope_id,
      row.input_per_mtok_usd,
      row.output_per_mtok_usd,
      row.effective_at,
      row.expires_at ?? null,
      row.source ?? 'operator',
    );
  return Number(result.lastInsertRowid);
}

describe('TokenPricingResolver — precedence', () => {
  it('workspace override beats facility default', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-precedence-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 3.0,
      output_per_mtok_usd: 15.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-precedence-1',
      scope_kind: 'workspace',
      scope_id: 42,
      input_per_mtok_usd: 1.5,
      output_per_mtok_usd: 7.5,
      effective_at: '2026-01-01T00:00:00Z',
    });

    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-precedence-1',
      scope_kind: 'workspace',
      scope_id: 42,
      effective_at: '2026-05-01T12:00:00Z',
    });

    expect(result.source).toBe('workspace_override');
    expect(result.input_per_mtok).toBe(1.5);
    expect(result.output_per_mtok).toBe(7.5);
  });

  it('facility default returned when no workspace override exists', () => {
    insertPricing({
      provider: 'openai',
      model: 'unique-model-precedence-2',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 2.5,
      output_per_mtok_usd: 10.0,
      effective_at: '2026-01-01T00:00:00Z',
    });

    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'openai',
      model: 'unique-model-precedence-2',
      scope_kind: 'workspace',
      scope_id: 99,
      effective_at: '2026-05-01T12:00:00Z',
    });

    expect(result.source).toBe('facility_default');
    expect(result.input_per_mtok).toBe(2.5);
    expect(result.output_per_mtok).toBe(10.0);
  });

  it('returns fallback when no DB row matches', () => {
    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'unknown-provider',
      model: 'unknown-model-fallback-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });

    expect(result.source).toBe('fallback');
    // DEFAULT_MODEL_PRICING from src/lib/token-pricing.ts is 3 / 15.
    expect(result.input_per_mtok).toBe(3.0);
    expect(result.output_per_mtok).toBe(15.0);
  });

  it('uses MODEL_PRICING entry when model is keyed there but absent from DB', () => {
    // 'claude-sonnet-4' is keyed in MODEL_PRICING (3.0 / 15.0).
    // The seeded M66 facility row was inserted with provider='anthropic'
    // because the seeder splits on '/'. Use a deliberately unkeyed
    // provider so no DB row matches.
    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'no-such-provider',
      model: 'claude-sonnet-4',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    // Falls back to MODEL_PRICING['claude-sonnet-4'].
    expect(result.source).toBe('fallback');
    expect(result.input_per_mtok).toBe(3.0);
    expect(result.output_per_mtok).toBe(15.0);
  });

  it('workspace-with-no-scope_id falls through to facility', () => {
    insertPricing({
      provider: 'copilot',
      model: 'unique-model-precedence-4',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 0.5,
      output_per_mtok_usd: 1.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'copilot',
      model: 'unique-model-precedence-4',
      scope_kind: 'workspace',
      // scope_id intentionally omitted — caller declared 'workspace'
      // intent but didn't supply an id; resolver should fall through.
      scope_id: null,
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(result.source).toBe('facility_default');
  });
});

describe('TokenPricingResolver — time-effective ordering', () => {
  it('returns most-recent effective_at <= requested timestamp', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-time-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 5.0,
      output_per_mtok_usd: 25.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-time-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 4.0,
      output_per_mtok_usd: 20.0,
      effective_at: '2026-03-01T00:00:00Z',
    });
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-time-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 3.0,
      output_per_mtok_usd: 15.0,
      effective_at: '2026-06-01T00:00:00Z',
    });

    const resolver = new TokenPricingResolver(db);
    // Asking at 2026-04-15: should pick the 2026-03-01 row (3.0 -> 4.0).
    const apr = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-time-1',
      scope_kind: 'facility',
      effective_at: '2026-04-15T12:00:00Z',
    });
    expect(apr.input_per_mtok).toBe(4.0);
    expect(apr.output_per_mtok).toBe(20.0);

    // Fresh resolver to avoid cache. Asking at 2026-07-01 picks 2026-06-01.
    const resolver2 = new TokenPricingResolver(db);
    const jul = resolver2.resolve({
      provider: 'anthropic',
      model: 'unique-model-time-1',
      scope_kind: 'facility',
      effective_at: '2026-07-01T00:00:00Z',
    });
    expect(jul.input_per_mtok).toBe(3.0);
    expect(jul.output_per_mtok).toBe(15.0);
  });

  it('honors expires_at — expired rows are skipped', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-expires-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 10.0,
      output_per_mtok_usd: 50.0,
      effective_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-04-01T00:00:00Z',
    });
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-expires-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 8.0,
      output_per_mtok_usd: 40.0,
      effective_at: '2026-04-01T00:00:00Z',
    });

    const resolver = new TokenPricingResolver(db);
    // Asking at 2026-02-15: only the first row's window covers; should be 10.0.
    const before = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-expires-1',
      scope_kind: 'facility',
      effective_at: '2026-02-15T00:00:00Z',
    });
    expect(before.input_per_mtok).toBe(10.0);

    // Asking at 2026-05-01: first row expired; should pick the second.
    const resolver2 = new TokenPricingResolver(db);
    const after = resolver2.resolve({
      provider: 'anthropic',
      model: 'unique-model-expires-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T00:00:00Z',
    });
    expect(after.input_per_mtok).toBe(8.0);
  });

  it('returns no row when expires_at equals requested timestamp', () => {
    // FR-260a contract: expires_at > requested_timestamp. Rows whose
    // expires_at equals the requested time are NOT eligible.
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-expires-edge',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 99.0,
      output_per_mtok_usd: 99.0,
      effective_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-04-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-expires-edge',
      scope_kind: 'facility',
      effective_at: '2026-04-01T00:00:00Z',
    });
    expect(result.source).toBe('fallback');
  });

  it('breaks ties on equal effective_at by id DESC (latest wins)', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-tie-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 1.0,
      output_per_mtok_usd: 1.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    // Same timestamp, inserted later → higher id → wins.
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-tie-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 2.0,
      output_per_mtok_usd: 2.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    const result = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-tie-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(result.input_per_mtok).toBe(2.0);
  });
});

describe('TokenPricingResolver — cache', () => {
  it('caches resolved results within the TTL window', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 7.0,
      output_per_mtok_usd: 35.0,
      effective_at: '2026-01-01T00:00:00Z',
    });

    let nowMs = Date.parse('2026-05-01T12:00:00Z');
    const resolver = new TokenPricingResolver(db, { now: () => nowMs });
    const first = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(first.input_per_mtok).toBe(7.0);
    expect(resolver.cacheSize()).toBe(1);

    // Mutate the row underneath the cache. The cache hit MUST still
    // return 7.0 — TTL not yet elapsed.
    db.prepare(
      `UPDATE token_pricing SET input_per_mtok_usd = 999.0
       WHERE model = 'unique-model-cache-1'`,
    ).run();
    nowMs += 30_000; // half the default 60s TTL
    const second = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(second.input_per_mtok).toBe(7.0);
  });

  it('evicts entries after the TTL elapses and re-queries the DB', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-2',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 4.0,
      output_per_mtok_usd: 20.0,
      effective_at: '2026-01-01T00:00:00Z',
    });

    let nowMs = Date.parse('2026-05-01T12:00:00Z');
    const resolver = new TokenPricingResolver(db, { now: () => nowMs });
    const first = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-2',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(first.input_per_mtok).toBe(4.0);

    // Mutate row + advance past TTL.
    db.prepare(
      `UPDATE token_pricing SET input_per_mtok_usd = 6.0, output_per_mtok_usd = 30.0
       WHERE model = 'unique-model-cache-2'`,
    ).run();
    nowMs += 60_001; // just past 60s TTL

    const second = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-2',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(second.input_per_mtok).toBe(6.0);
    expect(second.output_per_mtok).toBe(30.0);
  });

  it('cache key bucket is hour-truncated — same hour reuses entry', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-3',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 9.0,
      output_per_mtok_usd: 45.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-3',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:01:00Z',
    });
    resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-3',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:59:59Z',
    });
    // Same hour bucket → one entry.
    expect(resolver.cacheSize()).toBe(1);

    resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-3',
      scope_kind: 'facility',
      effective_at: '2026-05-01T13:00:00Z',
    });
    // Crossed the hour boundary → second entry.
    expect(resolver.cacheSize()).toBe(2);
  });

  it('cache distinguishes scope_kind and scope_id', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-4',
      scope_kind: 'workspace',
      scope_id: 1,
      input_per_mtok_usd: 1.1,
      output_per_mtok_usd: 1.1,
      effective_at: '2026-01-01T00:00:00Z',
    });
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-4',
      scope_kind: 'workspace',
      scope_id: 2,
      input_per_mtok_usd: 2.2,
      output_per_mtok_usd: 2.2,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    const r1 = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-4',
      scope_kind: 'workspace',
      scope_id: 1,
      effective_at: '2026-05-01T12:00:00Z',
    });
    const r2 = resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-4',
      scope_kind: 'workspace',
      scope_id: 2,
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(r1.input_per_mtok).toBe(1.1);
    expect(r2.input_per_mtok).toBe(2.2);
    expect(resolver.cacheSize()).toBe(2);
  });

  it('clearCache() drops every entry', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-cache-5',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 3.0,
      output_per_mtok_usd: 15.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const resolver = new TokenPricingResolver(db);
    resolver.resolve({
      provider: 'anthropic',
      model: 'unique-model-cache-5',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(resolver.cacheSize()).toBe(1);
    resolver.clearCache();
    expect(resolver.cacheSize()).toBe(0);
  });
});

describe('resolveTokenPricing convenience', () => {
  it('one-shot helper returns the same shape as the class method', () => {
    insertPricing({
      provider: 'anthropic',
      model: 'unique-model-helper-1',
      scope_kind: 'facility',
      scope_id: null,
      input_per_mtok_usd: 0.8,
      output_per_mtok_usd: 4.0,
      effective_at: '2026-01-01T00:00:00Z',
    });
    const result = resolveTokenPricing(db, {
      provider: 'anthropic',
      model: 'unique-model-helper-1',
      scope_kind: 'facility',
      effective_at: '2026-05-01T12:00:00Z',
    });
    expect(result.source).toBe('facility_default');
    expect(result.input_per_mtok).toBe(0.8);
    expect(result.output_per_mtok).toBe(4.0);
  });
});
