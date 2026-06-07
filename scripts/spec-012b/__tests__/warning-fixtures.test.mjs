import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/warning');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

function runWarningFixtures() {
  return spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/warning',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('warning fixtures cover all warning-only policy branches', () => {
  const cases = [
    readFixture('low-value/no-assertion-test'),
    readFixture('owner/unknown-owner'),
    readFixture('freshness/status-age-only'),
    readFixture('source-links/optional-missing-link'),
    readFixture('source-links/external-url'),
    readFixture('source-links/wiki-style-link'),
  ];

  assert.deepEqual(
    cases.map((fixture) => fixture.case_id),
    [
      'warning/low-value/no-assertion-test',
      'warning/owner/unknown-owner',
      'warning/freshness/status-age-only',
      'warning/source-links/optional-missing-link',
      'warning/source-links/external-url',
      'warning/source-links/wiki-style-link',
    ],
  );
  assert.ok(cases.every((fixture) => fixture.expected.exit_code === 0));
  assert.ok(cases.every((fixture) => fixture.expected.findings.every((finding) => finding.severity === 'warning')));
});

test('warning-only fixtures emit recommendations without hard failures', () => {
  const result = runWarningFixtures();

  assert.equal(result.stderr, '', 'warning fixture run should emit report JSON');
  assert.equal(result.status, 0, 'warning-only findings must not fail CI');

  const report = JSON.parse(result.stdout);
  const classes = new Set(report.findings.map((finding) => finding.drift_class));

  assert.equal(report.summary.hard_failure_count, 0);
  assert.equal(report.summary.error_count, 0);
  assert.ok(report.summary.warning_count >= 6);
  assert.ok(classes.has('deterministic_low_value_test_pattern'));
  assert.ok(classes.has('stale_workflow_claim'));
  assert.ok(classes.has('broken_source_of_truth_link'));
  assert.ok(report.findings.some((finding) => finding.owner.owner_key === 'unknown'));
  assert.ok(report.findings.every((finding) => finding.recommendation.paddock_cleanup_task.live_mutation === false));
});
