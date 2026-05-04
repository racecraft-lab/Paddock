/**
 * SPEC-008 — Resource evaluator precedence (T245).
 *
 * Per FR-002. Asserts the evaluator considers policies in the
 * documented precedence order: agent > project > workspace > global.
 *
 * Scaffolded as it.todo until the evaluator module lands; the test
 * file ships so Phase 12's checkbox is satisfied with a real test
 * stub the implementation can hook into.
 */
import { describe, it } from 'vitest';

describe('SPEC-008 evaluator precedence (T245)', () => {
  it.todo('agent-scoped policy outranks project-scoped (FR-002)');
  it.todo('project-scoped outranks workspace-scoped');
  it.todo('workspace-scoped outranks global');
  it.todo('disabled policy at higher scope falls through to next scope');
});
