import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/fresh');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

function runFreshFixtures() {
  return spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/fresh',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('fresh fixture declares every supported detector as clean', () => {
  const fixture = readFixture('all-clear');

  assert.equal(fixture.fixture_version, 'harness_gardening_fixture.v1');
  assert.equal(fixture.expected.exit_code, 0);
  assert.deepEqual(fixture.expected.summary, {
    finding_count: 0,
    recommendation_count: 0,
    error_count: 0,
    warning_count: 0,
    hard_failure_count: 0,
  });
  assert.deepEqual(
    fixture.expected.detectors,
    [
      'stale_claims',
      'missing_required_evidence',
      'stale_feature_flag_status',
      'deterministic_low_value_test_pattern',
      'strict_scope_drift',
      'source_of_truth_links',
      'archive_cleanup_eligibility',
    ],
  );
});

test('fresh fixtures emit zero active findings for every detector', () => {
  const result = runFreshFixtures();

  assert.equal(result.stderr, '', 'fresh fixture run should not emit implementation errors');
  assert.equal(result.status, 0, 'fresh fixture run should pass without hard drift');

  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 'harness_gardening_report.v1');
  assert.equal(report.as_of, '2026-06-06');
  assert.deepEqual(report.summary, readFixture('all-clear').expected.summary);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.detector_statuses.map((entry) => [entry.detector, entry.status]),
    readFixture('all-clear').expected.detectors.map((detector) => [detector, 'passed']),
  );
});
