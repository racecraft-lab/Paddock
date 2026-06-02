/**
 * SPEC-008 — POST /api/admin/workspaces/{id}/feature-flags
 *
 * Used by Playwright fixtures (`tests/e2e/spec-008/governance-fixtures.ts`,
 * `setWorkspaceFlags`) to flip per-workspace feature flags between tests
 * without round-tripping through the full admin UI.
 *
 * Body: `{ flags: { FEATURE_X: boolean, ... }, replace?: boolean }`
 *
 * Returns the updated state. By default every existing flag is preserved
 * unless the caller passes a new value. In `replace` mode the supplied
 * boolean flag map becomes the whole stored feature-flag JSON, which lets
 * Playwright restore the auth workspace without opening Docker-mounted
 * SQLite files from the host.
 *
 * Gated behind `PADDOCK_TEST_MODE=1` AND admin auth — this is
 * NOT a production-reachable surface.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import { adminTestModeGate } from '../../../spec-008/_shared/auth-gate';
// `getForegroundDb` lives in the strict-scope-safe `@/lib/db/connection-pool`
// module. Using it here keeps the SPEC-008 admin surface inside the strict
// scope without pulling in the wider auth/db module graph (Convention J).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestBody {
  flags?: unknown;
  replace?: unknown;
}

function isFlagsMap(input: unknown): input is Record<string, boolean> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false;
  const map = input as Record<string, unknown>;
  for (const key of Object.keys(map)) {
    if (typeof map[key] !== 'boolean') return false;
  }
  return true;
}

function readExistingFlags(raw: string | null): Record<string, boolean> {
  if (raw === null || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === 'boolean') out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = adminTestModeGate(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const workspaceId = Number.parseInt(id, 10);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    return NextResponse.json(
      { code: 'invalid_id', detail: 'workspace id must be a positive integer' },
      { status: 400 },
    );
  }
  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'invalid_body', detail: 'POST body must be JSON' },
      { status: 400 },
    );
  }
  const body = bodyRaw as RequestBody;
  if (!isFlagsMap(body.flags)) {
    return NextResponse.json(
      { code: 'invalid_body', detail: 'expected { flags: Record<string, boolean> }' },
      { status: 400 },
    );
  }
  const incomingFlags: Record<string, boolean> = body.flags;
  const replace = body.replace === true;

  const db = getForegroundDb();
  const row = db
    .prepare('SELECT feature_flags FROM workspaces WHERE id = ?')
    .get(workspaceId) as { feature_flags: string | null } | undefined;
  if (row === undefined) {
    return NextResponse.json(
      { code: 'not_found', detail: `workspace ${workspaceId.toString()} does not exist` },
      { status: 404 },
    );
  }
  const merged = replace ? incomingFlags : { ...readExistingFlags(row.feature_flags), ...incomingFlags };
  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(merged),
    Math.floor(Date.now() / 1000),
    workspaceId,
  );
  return NextResponse.json({ workspaceId, flags: merged }, { status: 200 });
}
