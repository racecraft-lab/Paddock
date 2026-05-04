/**
 * SPEC-008 — Agent-driven mirror of resource-policies (T200).
 *
 * Per FR-201a. Re-exports the governance/policies handlers so the
 * agent-driven URL surface (`/api/resource-policies`) returns the
 * same shape as `/api/governance/policies`.
 *
 * @see specs/008-resource-governance/tasks.md T200
 */

import {
  GET as governanceGet,
  POST as governancePost,
} from '../governance/policies/route';

export const GET = governanceGet;
export const POST = governancePost;
