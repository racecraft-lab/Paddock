import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  assert.equal(result.stderr, '', 'hard fixture should emit a JSON report, not a Node loader error');
  assert.equal(result.status, 1, 'hard fixture should fail CI for error-severity drift');
  return JSON.parse(result.stdout);
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
    return runFixture(tempCase);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('stale-status fixture shape names the contradictory source pointer', () => {
  const fixture = readFixture('stale-status/spec-012a-workflow');

  assert.equal(fixture.expected.findings[0].drift_class, 'stale_workflow_claim');
  assert.equal(fixture.expected.findings[0].severity, 'error');
  assert.equal(
    fixture.expected.findings[0].source_path,
    'docs/ai/specs/.process/SPEC-012A-workflow.md',
  );
  assert.equal(fixture.expected.findings[0].anchor, 'Phase 6 Closeout');
});

test('hard stale-status fixture emits one failing stale workflow finding', () => {
  const result = runFixture('scripts/spec-012b/fixtures/hard/stale-status');
  const report = parseHardReport(result);
  const expected = readFixture('stale-status/spec-012a-workflow').expected.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(report.summary.finding_count, 1);
  assert.equal(report.findings[0].drift_class, expected.drift_class);
  assert.equal(report.findings[0].source_path, expected.source_path);
  assert.equal(report.findings[0].anchor, expected.anchor);
  assert.deepEqual(report.findings[0].owner, expected.owner);
  assert.equal(report.findings[0].severity, 'error');
  assert.equal(report.findings[0].recommendation.recommendation_id, report.findings[0].stable_finding_id);
});

test('hard stale-status detector derives finding without expected findings oracle', () => {
  const result = runFixtureWithoutExpectedFindings('stale-status/spec-012a-workflow');
  const report = parseHardReport(result);
  const expected = readFixture('stale-status/spec-012a-workflow').expected.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(report.summary.finding_count, 1);
  assert.equal(report.findings[0].drift_class, expected.drift_class);
  assert.equal(report.findings[0].source_path, expected.source_path);
  assert.equal(report.findings[0].anchor, expected.anchor);
  assert.deepEqual(report.findings[0].owner, expected.owner);
  assert.match(report.findings[0].evidence[0].summary, /current_spec is 012b-harness-gardening-guards/i);
});

test('missing-evidence fixture emits one failing missing evidence finding', () => {
  const result = runFixture('scripts/spec-012b/fixtures/hard/missing-evidence');
  const report = parseHardReport(result);
  const expected = readFixture('missing-evidence/missing-uat-marker').expected.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(report.summary.finding_count, 1);
  assert.equal(report.findings[0].drift_class, 'missing_required_evidence');
  assert.equal(report.findings[0].source_path, expected.source_path);
  assert.equal(report.findings[0].anchor, expected.anchor);
  assert.deepEqual(report.findings[0].owner, expected.owner);
  assert.match(report.findings[0].evidence[0].summary, /missing UAT run id/i);
});

test('hard missing-evidence detector derives finding without expected findings oracle', () => {
  const result = runFixtureWithoutExpectedFindings('missing-evidence/missing-uat-marker');
  const report = parseHardReport(result);
  const expected = readFixture('missing-evidence/missing-uat-marker').expected.findings[0];

  assert.equal(report.summary.hard_failure_count, 1);
  assert.equal(report.summary.finding_count, 1);
  assert.equal(report.findings[0].drift_class, 'missing_required_evidence');
  assert.equal(report.findings[0].source_path, expected.source_path);
  assert.equal(report.findings[0].anchor, expected.anchor);
  assert.deepEqual(report.findings[0].owner, expected.owner);
  assert.match(report.findings[0].evidence[0].summary, /missing UAT run id/i);
});
