import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/hard/source-links');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

test('source-link fixture classifies broken required repo-owned links before severity', () => {
  const fixture = readFixture('broken-required-repo-link');
  const link = fixture.inputs.source_links[0];

  assert.equal(link.required, true);
  assert.equal(link.repo_owned, true);
  assert.equal(link.expected_classification, 'broken_required_repo_owned');
  assert.equal(fixture.expected.findings[0].drift_class, 'broken_source_of_truth_link');
  assert.equal(fixture.expected.findings[0].severity, 'error');
});

test('broken required repo-owned source link emits one hard finding', () => {
  const result = spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/hard/source-links',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.stderr, '', 'source-link fixture should emit report JSON');
  assert.equal(result.status, 1);

  const report = JSON.parse(result.stdout);
  const expected = readFixture('broken-required-repo-link').expected.findings[0];
  const finding = report.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(finding.drift_class, expected.drift_class);
  assert.equal(finding.source_path, expected.source_path);
  assert.equal(finding.anchor, expected.anchor);
  assert.equal(finding.recommendation.remediation_summary, expected.remediation_summary);
});
