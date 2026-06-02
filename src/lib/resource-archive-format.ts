/**
 * SPEC-008 — Archive partition file format (T207).
 *
 * Per FR-252. Partition files written under
 * `<PADDOCK_DATA_DIR>/archives/<chain>/<YYYY-MM>.json` carry
 * a fixed header so the verifier (T147 archive cross-check) can
 * recognize and validate them.
 *
 * Header schema:
 *   {
 *     "schema_version": 1,
 *     "row_count": <number>,
 *     "sha256":     <hex64>,
 *     "chain":      <table>,
 *     "partition":  <"YYYY-MM">,
 *     "written_at": <ISO8601>
 *   }
 *
 * @see specs/008-resource-governance/tasks.md T207
 */

import { createHash } from 'node:crypto';

export const ARCHIVE_SCHEMA_VERSION = 1;

export interface ArchiveHeader {
  schema_version: number;
  row_count: number;
  sha256: string;
  chain: string;
  partition: string;
  written_at: string;
}

/**
 * Build a header from the row stream. Rows are serialized
 * canonically (id-then-prev_hash-then-row_hash) for hash stability.
 */
export function buildArchiveHeader(args: {
  chain: string;
  partition: string;
  rows: { id: number; prev_hash: string; row_hash: string }[];
}): ArchiveHeader {
  const h = createHash('sha256');
  for (const r of args.rows) {
    h.update(`${r.id.toString()}|${r.prev_hash}|${r.row_hash}\n`);
  }
  return {
    schema_version: ARCHIVE_SCHEMA_VERSION,
    row_count: args.rows.length,
    sha256: h.digest('hex'),
    chain: args.chain,
    partition: args.partition,
    written_at: new Date().toISOString(),
  };
}

/**
 * Verify a header against a row stream. Returns true when both the
 * row count and the recomputed sha256 match.
 */
export function verifyArchiveHeader(
  header: ArchiveHeader,
  rows: { id: number; prev_hash: string; row_hash: string }[],
): boolean {
  if (header.row_count !== rows.length) return false;
  if (header.schema_version !== ARCHIVE_SCHEMA_VERSION) return false;
  const expected = buildArchiveHeader({
    chain: header.chain,
    partition: header.partition,
    rows,
  });
  return expected.sha256 === header.sha256;
}
