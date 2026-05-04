/**
 * SPEC-008 — Tests for `src/lib/db/connection-pool.ts`.
 *
 * Verifies the three named SQLite connections used by the resource
 * governance subsystem per FR-060, FR-331, FR-332, Q29:
 *
 *   - `getForegroundDb()` — admission hot-path; busy_timeout = 50 ms.
 *   - `getBackgroundDb()` — reconciler / drift / reaper; busy_timeout = 5000 ms.
 *   - `getAuditDb()`     — hash-chain verifier / retention sweep; busy_timeout = 30000 ms.
 *
 * All three connections MUST set `journal_mode=WAL` and `synchronous=NORMAL`.
 * Each call to `getForegroundDb()` (etc.) MUST return the same singleton
 * instance until `closeAllConnections()` resets state.
 *
 * Note: `pragma()` returns the runtime stored value:
 *   - `journal_mode`  -> string `"wal"` (lowercase, NOT "WAL")
 *   - `synchronous`   -> number `1` (NORMAL = 1)
 *   - `busy_timeout`  -> number (the configured timeout in ms)
 *
 * Tests use a temp-file SQLite database (NOT `:memory:`) because:
 *   1. WAL mode is rejected on `:memory:` databases by some better-sqlite3
 *      builds (or silently demoted to MEMORY journal mode).
 *   2. Distinct named connections to a `:memory:` URL are NOT shared (each
 *      gets its own DB), which would mask the "same backing file" property
 *      we want to verify in production.
 *
 * @see specs/008-resource-governance/spec.md FR-060, FR-331, FR-332,
 *      FR-326 (admission p95 budget — drives the 50 ms busy_timeout)
 * @see specs/008-resource-governance/tasks.md T049
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tempDir: string;

/**
 * Each test gets a fresh temp directory and a fresh module import. The
 * connection-pool module is stateful (singleton connections), so we
 * reset state via `closeAllConnections()` and the env-var resolution
 * happens at import time so we set MISSION_CONTROL_DB_PATH before import.
 */
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'spec-008-connpool-'));
  process.env.MISSION_CONTROL_DATA_DIR = tempDir;
  process.env.MISSION_CONTROL_DB_PATH = join(tempDir, 'mission-control.db');
});

afterEach(async () => {
  try {
    const mod = await import('@/lib/db/connection-pool');
    mod.closeAllConnections();
  } catch {
    // ignore — module may not have loaded
  }
  delete process.env.MISSION_CONTROL_DATA_DIR;
  delete process.env.MISSION_CONTROL_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('SPEC-008 connection-pool — three named workload classes (FR-331)', () => {
  it('exports `getForegroundDb`, `getBackgroundDb`, `getAuditDb`, `closeAllConnections`', async () => {
    const mod = await import('@/lib/db/connection-pool');
    expect(typeof mod.getForegroundDb).toBe('function');
    expect(typeof mod.getBackgroundDb).toBe('function');
    expect(typeof mod.getAuditDb).toBe('function');
    expect(typeof mod.closeAllConnections).toBe('function');
  });

  it('returns three distinct Database instances', async () => {
    const { getForegroundDb, getBackgroundDb, getAuditDb } = await import(
      '@/lib/db/connection-pool'
    );
    const fg = getForegroundDb();
    const bg = getBackgroundDb();
    const audit = getAuditDb();
    expect(fg).not.toBe(bg);
    expect(bg).not.toBe(audit);
    expect(fg).not.toBe(audit);
  });
});

describe('SPEC-008 connection-pool — singleton semantics', () => {
  it('getForegroundDb returns the same instance on repeated calls', async () => {
    const { getForegroundDb } = await import('@/lib/db/connection-pool');
    const a = getForegroundDb();
    const b = getForegroundDb();
    expect(a).toBe(b);
  });

  it('getBackgroundDb returns the same instance on repeated calls', async () => {
    const { getBackgroundDb } = await import('@/lib/db/connection-pool');
    const a = getBackgroundDb();
    const b = getBackgroundDb();
    expect(a).toBe(b);
  });

  it('getAuditDb returns the same instance on repeated calls', async () => {
    const { getAuditDb } = await import('@/lib/db/connection-pool');
    const a = getAuditDb();
    const b = getAuditDb();
    expect(a).toBe(b);
  });
});

describe('SPEC-008 connection-pool — busy_timeout per workload class (FR-331, Q29)', () => {
  it('foreground busy_timeout = 50 ms (admission hot-path FR-326 budget)', async () => {
    const { getForegroundDb } = await import('@/lib/db/connection-pool');
    const fg = getForegroundDb();
    const t = fg.pragma('busy_timeout', { simple: true }) as number;
    expect(t).toBe(50);
  });

  it('background busy_timeout = 5000 ms (reconciler / drift detector / reaper)', async () => {
    const { getBackgroundDb } = await import('@/lib/db/connection-pool');
    const bg = getBackgroundDb();
    const t = bg.pragma('busy_timeout', { simple: true }) as number;
    expect(t).toBe(5000);
  });

  it('audit busy_timeout = 30000 ms (hash-chain verifier / retention sweep)', async () => {
    const { getAuditDb } = await import('@/lib/db/connection-pool');
    const audit = getAuditDb();
    const t = audit.pragma('busy_timeout', { simple: true }) as number;
    expect(t).toBe(30_000);
  });
});

describe('SPEC-008 connection-pool — WAL + synchronous=NORMAL (FR-332, Q29)', () => {
  it('foreground sets journal_mode=WAL', async () => {
    const { getForegroundDb } = await import('@/lib/db/connection-pool');
    const fg = getForegroundDb();
    const mode = fg.pragma('journal_mode', { simple: true }) as string;
    expect(String(mode).toLowerCase()).toBe('wal');
  });

  it('background sets journal_mode=WAL', async () => {
    const { getBackgroundDb } = await import('@/lib/db/connection-pool');
    const bg = getBackgroundDb();
    const mode = bg.pragma('journal_mode', { simple: true }) as string;
    expect(String(mode).toLowerCase()).toBe('wal');
  });

  it('audit sets journal_mode=WAL', async () => {
    const { getAuditDb } = await import('@/lib/db/connection-pool');
    const audit = getAuditDb();
    const mode = audit.pragma('journal_mode', { simple: true }) as string;
    expect(String(mode).toLowerCase()).toBe('wal');
  });

  it('foreground sets synchronous=NORMAL (1)', async () => {
    const { getForegroundDb } = await import('@/lib/db/connection-pool');
    const fg = getForegroundDb();
    const sync = fg.pragma('synchronous', { simple: true }) as number;
    expect(sync).toBe(1);
  });

  it('background sets synchronous=NORMAL (1)', async () => {
    const { getBackgroundDb } = await import('@/lib/db/connection-pool');
    const bg = getBackgroundDb();
    const sync = bg.pragma('synchronous', { simple: true }) as number;
    expect(sync).toBe(1);
  });

  it('audit sets synchronous=NORMAL (1)', async () => {
    const { getAuditDb } = await import('@/lib/db/connection-pool');
    const audit = getAuditDb();
    const sync = audit.pragma('synchronous', { simple: true }) as number;
    expect(sync).toBe(1);
  });
});

describe('SPEC-008 connection-pool — single-process single-writer semantics', () => {
  it('all three connections point to the same underlying database file', async () => {
    const { getForegroundDb, getBackgroundDb, getAuditDb } = await import(
      '@/lib/db/connection-pool'
    );
    const fg = getForegroundDb();
    const bg = getBackgroundDb();
    const audit = getAuditDb();
    // Use a fully-qualified table name to avoid clashes with migrations.
    // `prepare(...).run()` is the parameterized SQLite API (not shell).
    fg.prepare(
      'CREATE TABLE IF NOT EXISTS spec008_connpool_probe (id INTEGER PRIMARY KEY, val TEXT)',
    ).run();
    fg.prepare('INSERT INTO spec008_connpool_probe (val) VALUES (?)').run('hello');
    const fromBg = bg
      .prepare('SELECT val FROM spec008_connpool_probe ORDER BY id DESC LIMIT 1')
      .get() as { val: string } | undefined;
    const fromAudit = audit
      .prepare('SELECT val FROM spec008_connpool_probe ORDER BY id DESC LIMIT 1')
      .get() as { val: string } | undefined;
    expect(fromBg?.val).toBe('hello');
    expect(fromAudit?.val).toBe('hello');
  });
});

describe('SPEC-008 connection-pool — closeAllConnections resets state', () => {
  it('closing then reacquiring yields fresh Database instances', async () => {
    const { getForegroundDb, closeAllConnections } = await import(
      '@/lib/db/connection-pool'
    );
    const a = getForegroundDb();
    closeAllConnections();
    const b = getForegroundDb();
    expect(a).not.toBe(b);
  });

  it('closeAllConnections is idempotent (no throw on double-close)', async () => {
    const { getForegroundDb, closeAllConnections } = await import(
      '@/lib/db/connection-pool'
    );
    getForegroundDb();
    closeAllConnections();
    expect(() => {
      closeAllConnections();
    }).not.toThrow();
  });

  it('closeAllConnections is safe when no connection was ever opened', async () => {
    const { closeAllConnections } = await import('@/lib/db/connection-pool');
    expect(() => {
      closeAllConnections();
    }).not.toThrow();
  });
});
