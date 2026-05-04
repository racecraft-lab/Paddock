/**
 * SPEC-008 — REST collection routes for /api/governance/windows (T190).
 *
 * Per FR-201, FR-205, FR-208a. Lists time-window policies (blackout +
 * degraded). POST creates a new window with the standard 422 / 4xx
 * error contract. Strict-clean adapter routing per Convention J.
 *
 * @see specs/008-resource-governance/tasks.md T190
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  logRouteError,
  mutationLimiter,
  requireRole,
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
} from '@/lib/governance-route-context';

interface WindowRow {
  id: number;
  workspace_id: number | null;
  policy_type: string;
  limit_kind: string;
  enforcement: string;
  enforce_mode: string | null;
  window_spec_json: string | null;
  enabled: number;
  version: number;
}

const SELECT_COLUMNS = `id, workspace_id, policy_type, limit_kind,
       enforcement, enforce_mode, window_spec_json, enabled, version`;

function jsonError(status: number, code: string, detail: string): NextResponse {
  return NextResponse.json({ code, detail }, { status });
}

interface WindowCreateBody {
  policy_type?: string;
  enforcement?: string;
  window_spec_json?: string;
  workspace_id?: number | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }
  try {
    const db = getForegroundDb();
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    const placeholders = scope.workspaceIds.map(() => '?').join(', ');
    const where =
      scope.workspaceIds.length === 0
        ? 'workspace_id IS NULL'
        : `(workspace_id IN (${placeholders}) OR workspace_id IS NULL)`;
    const rows = db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
           FROM resource_policies
          WHERE ${where}
            AND policy_type IN ('blackout', 'degraded_window')
          ORDER BY id ASC
          LIMIT 200`,
      )
      .all(...scope.workspaceIds) as WindowRow[];
    return NextResponse.json({ windows: rows });
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(
        scopeErr.status,
        scopeErr.status === 400 ? 'bad_request' : 'forbidden',
        scopeErr.error,
      );
    }
    logRouteError('GET /api/governance/windows error', err);
    return jsonError(500, 'internal_error', 'failed to list windows');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) {
    return jsonError(
      auth.status,
      auth.status === 401 ? 'unauthorized' : 'forbidden',
      auth.error,
    );
  }
  const rate = mutationLimiter(request);
  if (rate !== null) return rate;

  let body: WindowCreateBody;
  try {
    body = (await request.json()) as WindowCreateBody;
  } catch {
    return jsonError(400, 'invalid_json', 'request body is not valid JSON');
  }

  if (
    body.policy_type !== 'blackout' &&
    body.policy_type !== 'degraded'
  ) {
    return NextResponse.json(
      {
        code: 'validation_failed',
        detail: 'policy_type must be blackout or degraded',
        issues: [
          {
            field_path: 'policy_type',
            message: 'must be blackout or degraded',
            code: 'invalid_enum',
          },
        ],
      },
      { status: 422 },
    );
  }
  if (typeof body.enforcement !== 'string' || body.enforcement.trim() === '') {
    return NextResponse.json(
      {
        code: 'validation_failed',
        detail: 'enforcement is required',
        issues: [
          {
            field_path: 'enforcement',
            message: 'enforcement must be a non-empty string',
            code: 'required',
          },
        ],
      },
      { status: 422 },
    );
  }

  try {
    const db = getForegroundDb();
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user);
    const ownerWorkspaceId = scope.workspaceId;
    const targetWorkspaceId = body.workspace_id ?? ownerWorkspaceId ?? null;
    const now = new Date().toISOString();
    const dbPolicyType = body.policy_type === 'degraded' ? 'degraded_window' : 'blackout';
    const insert = db.prepare(`
      INSERT INTO resource_policies
        (workspace_id, policy_type, limit_kind, enforcement, enforce_mode,
         window_spec_json, enabled, version, owner_workspace_id, updated_by,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, 'shadow', ?, 1, 1, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
      const result = insert.run(
        targetWorkspaceId,
        dbPolicyType,
        body.policy_type ?? 'blackout',
        body.enforcement ?? 'hard',
        body.window_spec_json ?? null,
        ownerWorkspaceId ?? null,
        auth.user.username,
        now,
        now,
      );
      return Number(result.lastInsertRowid);
    });
    const newId = tx.immediate();
    const row = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM resource_policies WHERE id = ?`)
      .get(newId) as WindowRow;
    return NextResponse.json(
      { window: row },
      {
        status: 201,
        headers: { location: `/api/governance/windows/${String(newId)}` },
      },
    );
  } catch (err) {
    const scopeErr = workspaceScopeError(err);
    if (scopeErr !== null) {
      return jsonError(
        scopeErr.status,
        scopeErr.status === 400 ? 'bad_request' : 'forbidden',
        scopeErr.error,
      );
    }
    logRouteError('POST /api/governance/windows error', err);
    return jsonError(500, 'internal_error', 'failed to create window');
  }
}
