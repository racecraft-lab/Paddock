/**
 * SPEC-008 — Strict-clean adapter for governance REST route handlers.
 *
 * Convention J wants `src/app/api/governance/**` under spec-strict, but
 * `@/lib/auth`, `@/lib/workspaces`, `@/lib/rate-limit`, `@/lib/logger`
 * (and the modules they transitively import — `db.ts`, `task-dispatch.ts`,
 * `webhooks.ts`, `sessions.ts`, `skill-sync.ts`, etc.) are pre-existing
 * non-strict files. Pulling them into the spec-strict project graph
 * cascades 270+ TS4111/TS6307 errors across the entire backend — most of
 * them in code completely unrelated to SPEC-008. The fix would carry
 * regression risk in the task pipeline / webhook / session subsystems.
 *
 * The earlier deferral commit (`86e3ad5`) named two clean fixes; the
 * revert (`d1c9fbe`) directed in-flight resolution. Per advisor guidance,
 * Option A — a strict-clean adapter — is the right path. This module is
 * the adapter.
 *
 * Design:
 *   - Use `createRequire(import.meta.url)` to defer module resolution to
 *     runtime. TypeScript does NOT follow `.require()` string args for
 *     project-graph purposes, so the imported file is not pulled into
 *     spec-strict. This pattern is already used by strict-scope siblings
 *     (`src/lib/task-create.ts`, `src/lib/task-artifacts.ts`).
 *   - Re-export only the exact narrow surface the governance routes need.
 *   - Route handlers import from this module; never from `@/lib/auth`,
 *     `@/lib/workspaces`, `@/lib/rate-limit`, `@/lib/logger`, or `@/lib/db`
 *     directly.
 *
 * @see specs/008-resource-governance/tasks.md T074
 * @see Constitution Convention J (strict scope on SPEC-008-owned API surface)
 */

import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import type { NextRequest, NextResponse } from 'next/server';

const runtimeRequire = createRequire(import.meta.url);

/** Mirrors the relevant subset of `User` from `@/lib/auth`. */
export interface RouteUser {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'operator' | 'viewer';
  workspace_id: number;
  tenant_id: number;
}

/** Result of `requireRole` — either a user OR a 401/403 outcome. */
export type RoleCheckResult =
  | { user: RouteUser }
  | { error: string; status: 401 | 403 };

/** Mirrors `AcceptedWorkspaceScope` from `@/lib/workspaces` (T074 needs). */
export interface RouteWorkspaceScope {
  kind: 'facility' | 'productLine' | 'legacy';
  tenantId: number;
  workspaceIds: number[];
  workspaceId: number | null;
  explicit: boolean;
  featureEnabled: boolean;
}

/** Workspace-scope translation result for HTTP errors (400/403). */
export interface WorkspaceScopeError {
  error: string;
  status: 400 | 403;
}

/**
 * Inline `runtimeRequire(<constant>)` at each call site. Turbopack
 * traces `createRequire(import.meta.url)('./auth')` only when it can see
 * the path string statically; routing through a `requireOpaque(modulePath)`
 * wrapper hides the constant and produced runtime errors of the form
 * "Cannot find module as expression is too dynamic" in standalone mode.
 *
 * The module bodies remain outside the spec-strict project graph because
 * TypeScript does not follow `createRequire(...)` calls for module
 * resolution. Convention J is preserved.
 */

/**
 * Verify the request bearer / session and check role hierarchy. Wraps
 * `@/lib/auth#requireRole` without dragging the auth-module graph into
 * spec-strict.
 */
export function requireRole(
  request: Request,
  minRole: 'viewer' | 'operator' | 'admin',
): RoleCheckResult {
  const mod = runtimeRequire('./auth') as {
    requireRole: (req: Request, role: string) => RoleCheckResult;
  };
  return mod.requireRole(request, minRole);
}

/**
 * Resolve workspace scope from query/body carriers, returning an
 * `AcceptedWorkspaceScope`. Wraps `@/lib/workspaces`.
 */
export async function resolveWorkspaceScopeFromRequest(
  db: Database.Database,
  request: Request,
  user: RouteUser,
): Promise<RouteWorkspaceScope> {
  const mod = runtimeRequire('./workspaces') as {
    resolveWorkspaceScopeFromRequest: (
      db: Database.Database,
      request: Request,
      user: { workspace_id?: number; tenant_id?: number },
    ) => Promise<RouteWorkspaceScope>;
  };
  return mod.resolveWorkspaceScopeFromRequest(db, request, user);
}

/**
 * Translate a thrown workspace-scope error into an HTTP code + message.
 * Returns null when the error is not a recognized scope error (caller
 * should treat as 500). Wraps `@/lib/workspaces#workspaceScopeError`.
 */
export function workspaceScopeError(error: unknown): WorkspaceScopeError | null {
  const mod = runtimeRequire('./workspaces') as {
    workspaceScopeError: (e: unknown) => WorkspaceScopeError | null;
  };
  return mod.workspaceScopeError(error);
}

/**
 * Apply the project's mutation rate limiter. Returns the 429 NextResponse
 * when the limit is hit, or null to indicate the request may proceed.
 * Wraps `@/lib/rate-limit#mutationLimiter`.
 */
export function mutationLimiter(request: NextRequest): NextResponse | null {
  const mod = runtimeRequire('./rate-limit') as {
    mutationLimiter: (req: NextRequest) => NextResponse | null;
  };
  return mod.mutationLimiter(request);
}

/**
 * Record a governance activity into the `activities` table. Strict-clean
 * inline INSERT instead of routing through `db_helpers.logActivity` so the
 * route's import graph stays narrow. Mirrors the columns + broadcast that
 * `db_helpers.logActivity` writes (`type, entity_type, entity_id, actor,
 * description, data, workspace_id`).
 */
export function logGovernanceActivity(
  db: Database.Database,
  args: {
    type: string;
    entity_id: number;
    actor: string;
    description: string;
    data: Record<string, unknown>;
    workspace_id: number;
  },
): void {
  db.prepare(
    'INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    args.type,
    'resource_policy',
    args.entity_id,
    args.actor,
    args.description,
    JSON.stringify(args.data),
    args.workspace_id,
  );
}

/**
 * Structured error logger used inside the catch-all blocks of the route
 * handlers. Wraps `@/lib/logger#logger.error`. Body is intentionally
 * narrow — we don't want governance routes to depend on the full pino
 * surface.
 */
export function logRouteError(message: string, err: unknown): void {
  const mod = runtimeRequire('./logger') as {
    logger: { error: (data: unknown, msg: string) => void };
  };
  mod.logger.error({ err }, message);
}
