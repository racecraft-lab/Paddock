import test from 'node:test';
import assert from 'node:assert/strict';

test('matches static report snapshot', () => {
  const report = {
    findings: [
      {
        drift_class: 'stale_workflow_claim',
        source_path: 'docs/ai/specs/.process/SPEC-012A-workflow.md',
      },
    ],
  };

  assert.deepEqual(report, {
    findings: [
      {
        drift_class: 'stale_workflow_claim',
        source_path: 'docs/ai/specs/.process/SPEC-012A-workflow.md',
      },
    ],
  });
});
