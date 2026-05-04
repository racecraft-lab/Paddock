/**
 * SPEC-008 — `governance_audit_chain_break` forensics snapshot (T238).
 *
 * Per FR-177. When the verifier detects a chain break, write a
 * timestamped JSON snapshot under
 * `<MISSION_CONTROL_DATA_DIR>/forensics/<ts>-<chain>-mismatch.json`
 * for legal review.
 *
 * @see specs/008-resource-governance/tasks.md T238
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ForensicsSnapshotInput {
  chain: string;
  reason: string;
  context: Record<string, unknown>;
}

export function writeForensicsSnapshot(
  input: ForensicsSnapshotInput,
  dataDir: string = process.env['MISSION_CONTROL_DATA_DIR'] ?? './.data',
): string {
  const dir = join(dataDir, 'forensics');
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${ts}-${input.chain}-${input.reason}.json`;
  const path = join(dir, filename);
  const body = {
    spec: '008-resource-governance',
    captured_at: new Date().toISOString(),
    chain: input.chain,
    reason: input.reason,
    context: input.context,
  };
  writeFileSync(path, JSON.stringify(body, null, 2), 'utf8');
  return path;
}
