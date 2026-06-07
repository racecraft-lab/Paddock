import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/hard/source-links');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

function runSourceLinkFixture(path) {
  return spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      path,
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

function runFixtureWithoutExpectedFindings(...fixtureParts) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'spec-012b-us1-'));
  const tempCase = join(tempRoot, 'case');
  cpSync(join(fixtureRoot, ...fixtureParts), tempCase, { recursive: true });

  const tempFixturePath = join(tempCase, 'fixture.json');
  const fixture = JSON.parse(readFileSync(tempFixturePath, 'utf8'));
  delete fixture.expected.findings;
  writeFileSync(tempFixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

  try {
    return runSourceLinkFixture(tempCase);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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
  const result = runSourceLinkFixture('scripts/spec-012b/fixtures/hard/source-links');

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

test('source-link detector derives finding without expected findings oracle', () => {
  const result = runFixtureWithoutExpectedFindings('broken-required-repo-link');

  assert.equal(result.stderr, '', 'source-link fixture should emit report JSON');
  assert.equal(result.status, 1);

  const report = JSON.parse(result.stdout);
  const expected = readFixture('broken-required-repo-link').expected.findings[0];
  const finding = report.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(report.summary.finding_count, 1);
  assert.equal(finding.drift_class, expected.drift_class);
  assert.equal(finding.source_path, expected.source_path);
  assert.equal(finding.anchor, expected.anchor);
  assert.match(finding.evidence[0].summary, /docs\/ai\/specs\/missing-workflow\.md is missing/);
});
