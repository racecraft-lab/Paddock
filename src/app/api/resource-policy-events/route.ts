/**
 * SPEC-008 — Agent-driven mirror of policy-events (T199).
 *
 * Per FR-201a. Same payload as `/api/governance/policy-events`; this
 * surface is the agent-driven parallel route name (FR-201a parity).
 *
 * @see specs/008-resource-governance/tasks.md T199
 */

import { type NextRequest } from 'next/server';
import { GET as governanceGet } from '../governance/policy-events/route';

export const GET = governanceGet;

// Re-export module ensures Next.js binds the same handler under both
// URLs. Next.js does NOT follow re-exports across route trees during
// build; the explicit re-export keeps the agent-driven URL aligned
// with the governance one without duplicating code.
export type { NextRequest };
