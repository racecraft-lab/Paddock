/**
 * SPEC-008 — Agent-driven [id] mirror of resource-policies (T200).
 *
 * Per FR-201a.
 *
 * @see specs/008-resource-governance/tasks.md T200
 */

import {
  GET as governanceGet,
  PUT as governancePut,
  DELETE as governanceDelete,
} from '../../governance/policies/[id]/route';

export const GET = governanceGet;
export const PUT = governancePut;
export const DELETE = governanceDelete;
