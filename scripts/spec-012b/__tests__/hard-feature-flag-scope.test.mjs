import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/hard');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

function runFixture(path) {
  return spawnSync(
    process.execPath,
    [guardScript, '--fixtures', path, '--as-of', '2026-06-06', '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

function parseHardReport(result) {
  assert.equal(result.stderr, '', 'hard fixture should emit report JSON');
  assert.equal(result.status, 1);
  return JSON.parse(result.stdout);
}

test('feature-flag fixture declares absent required registry entry as hard drift', () => {
  const fixture = readFixture('feature-flag/absent-required-flag');

  assert.equal(fixture.expected.findings[0].drift_class, 'stale_feature_flag_status');
  assert.equal(fixture.expected.findings[0].severity, 'error');
  assert.equal(fixture.expected.findings[0].anchor, 'FEATURE_SPEC_012B_GARDENING');
});

test('hard stale-feature-flag fixture emits an error recommendation', () => {
  const result = runFixture('scripts/spec-012b/fixtures/hard/feature-flag');
  const report = parseHardReport(result);
  const finding = report.findings[0];

  assert.equal(finding.drift_class, 'stale_feature_flag_status');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.recommendation.paddock_cleanup_task.live_mutation, false);
  assert.equal(finding.recommendation.github_issue_export.export_only, true);
  assert.equal(finding.recommendation.github_issue_export.live_mutation, false);
});

test('hard strict-scope fixture emits blocked runtime surface evidence', () => {
  const result = runFixture('scripts/spec-012b/fixtures/hard/strict-scope');
  const report = parseHardReport(result);
  const expected = readFixture('strict-scope/forbidden-runtime-surface').expected.findings[0];
  const finding = report.findings[0];

  assert.equal(finding.drift_class, 'strict_scope_drift');
  assert.equal(finding.source_path, expected.source_path);
  assert.equal(finding.anchor, expected.anchor);
  assert.match(finding.evidence.map((entry) => entry.summary).join('\n'), /src\/app\/api/);
});
