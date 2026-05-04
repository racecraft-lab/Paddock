/**
 * SPEC-008 — Source emission capability registry (M65a).
 *
 * Per FR-076 (registry of sources), FR-085 (enforcement_eligibility), FR-087
 * (idempotent registration). Reads + writes the `source_emission_capability`
 * table created by migration M65a.
 *
 * Idempotency contract (Q18 / FR-087): every operator-initiated upsert is
 * idempotent — same input → no row changes. The writer uses
 * `INSERT ... ON CONFLICT(source_id) DO UPDATE SET ...` so the
 * `updated_at` column reflects the latest write while the row id stays
 * stable.
 *
 * @see specs/008-resource-governance/spec.md FR-076, FR-085, FR-087
 * @see src/lib/migrations.ts (065a_source_emission_capability)
 * @see specs/008-resource-governance/tasks.md T083
 * @see Constitution Convention J — strict-scope module
 */

import type {
  SourceCapabilityRow,
  SourceCapabilityWrite,
} from '@/types/observability';
import type Database from 'better-sqlite3';

/**
 * Read every active source capability row.
 *
 * Optionally filter by `provider`-prefixed `source_id` (e.g.,
 * `gateway_*`, `native_*`). The match is a `LIKE` against the source_id
 * column; pass `null` to return every row.
 *
 * Returns rows ordered by `source_id` ASC for deterministic test output.
 */
export function getSourceCapabilities(
  db: Database.Database,
  sourcePrefix: string | null = null,
): SourceCapabilityRow[] {
  const sql = sourcePrefix === null
    ? `SELECT source_id, display_name, enforcement_eligibility,
              dedupe_confidence_default, expected_envelope_bytes,
              active, created_at, updated_at
         FROM source_emission_capability
         WHERE active = 1
         ORDER BY source_id ASC`
    : `SELECT source_id, display_name, enforcement_eligibility,
              dedupe_confidence_default, expected_envelope_bytes,
              active, created_at, updated_at
         FROM source_emission_capability
         WHERE active = 1 AND source_id LIKE ?
         ORDER BY source_id ASC`;
  const stmt = db.prepare(sql);
  const rows = (sourcePrefix === null
    ? stmt.all()
    : stmt.all(`${sourcePrefix}%`));
  return rows.map(narrowSourceCapabilityRow);
}

/**
 * Read a single source capability row by source_id, or null when absent.
 */
export function getSourceCapability(
  db: Database.Database,
  source_id: string,
): SourceCapabilityRow | null {
  const row = db
    .prepare(
      `SELECT source_id, display_name, enforcement_eligibility,
              dedupe_confidence_default, expected_envelope_bytes,
              active, created_at, updated_at
         FROM source_emission_capability
        WHERE source_id = ?`,
    )
    .get(source_id);
  if (row === undefined || row === null) return null;
  return narrowSourceCapabilityRow(row);
}

/**
 * Idempotent upsert. Returns the resulting row (post-write). Caller MAY
 * call this from outside a transaction — it is one statement and the
 * conflict handler keeps the row id stable so concurrent callers race
 * onto the same row, not duplicate rows.
 */
export function upsertSourceCapability(
  db: Database.Database,
  write: SourceCapabilityWrite,
): SourceCapabilityRow {
  db.prepare(
    `INSERT INTO source_emission_capability
       (source_id, display_name, enforcement_eligibility,
        dedupe_confidence_default, expected_envelope_bytes, active,
        updated_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(source_id) DO UPDATE SET
       display_name = excluded.display_name,
       enforcement_eligibility = excluded.enforcement_eligibility,
       dedupe_confidence_default = excluded.dedupe_confidence_default,
       expected_envelope_bytes = excluded.expected_envelope_bytes,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(
    write.source_id,
    write.display_name,
    write.enforcement_eligibility,
    write.dedupe_confidence_default,
    write.expected_envelope_bytes,
  );
  const row = getSourceCapability(db, write.source_id);
  if (row === null) {
    // Should be unreachable — INSERT/UPSERT just succeeded.
    throw new Error(
      `upsertSourceCapability: row missing immediately after upsert: ${write.source_id}`,
    );
  }
  return row;
}

/**
 * Soft-delete a source capability row by setting active=0. Idempotent.
 * Returns true when the row existed and is now inactive (whether it was
 * already inactive or just changed).
 */
export function deactivateSourceCapability(
  db: Database.Database,
  source_id: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE source_emission_capability
          SET active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE source_id = ?`,
    )
    .run(source_id);
  return result.changes > 0 || getSourceCapability(db, source_id) !== null;
}

/**
 * Narrow a `db.get()`/`db.all()` row (`unknown`) to `SourceCapabilityRow`.
 * Throws on schema-shape mismatch — should never happen in practice
 * because the SELECT projects only known columns.
 */
function narrowSourceCapabilityRow(row: unknown): SourceCapabilityRow {
  if (row === null || typeof row !== 'object') {
    throw new Error('source-registry: row is not an object');
  }
  const r = row as {
    source_id?: string;
    display_name?: string;
    enforcement_eligibility?: SourceCapabilityRow['enforcement_eligibility'];
    dedupe_confidence_default?: SourceCapabilityRow['dedupe_confidence_default'];
    expected_envelope_bytes?: number;
    active?: number;
    created_at?: string;
    updated_at?: string;
  };
  return {
    source_id: r.source_id ?? '',
    display_name: r.display_name ?? '',
    enforcement_eligibility: r.enforcement_eligibility ?? 'advisory',
    dedupe_confidence_default: r.dedupe_confidence_default ?? 'medium',
    expected_envelope_bytes: r.expected_envelope_bytes ?? 0,
    active: r.active === 1 ? 1 : 0,
    created_at: r.created_at ?? '',
    updated_at: r.updated_at ?? '',
  };
}
