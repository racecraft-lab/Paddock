import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureRoot = join(repoRoot, 'scripts/spec-012b/fixtures/warning');

function readFixture(...parts) {
  return JSON.parse(readFileSync(join(fixtureRoot, ...parts, 'fixture.json'), 'utf8'));
}

function runWarningFixtures() {
  return runFixture('scripts/spec-012b/fixtures/warning');
}

function runFixture(path) {
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

function runWarningFixtureWithoutExpectedFindings(...fixtureParts) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'spec-012b-us3-'));
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

test('warning fixtures cover all warning-only policy branches', () => {
  const cases = [
    readFixture('low-value/no-assertion-test'),
    readFixture('low-value/snapshot-only-static'),
    readFixture('low-value/duplicate-stale-fixture'),
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
      'warning/low-value/snapshot-only-static',
      'warning/low-value/duplicate-stale-fixture',
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

test('warning detectors derive findings without expected findings oracle', () => {
  const cases = [
    {
      parts: ['low-value/no-assertion-test'],
      driftClass: 'deterministic_low_value_test_pattern',
      sourcePath: 'scripts/spec-012b/__tests__/empty-shape.test.mjs',
      anchor: 'test:no-assertion',
    },
    {
      parts: ['low-value/snapshot-only-static'],
      driftClass: 'deterministic_low_value_test_pattern',
      sourcePath: 'scripts/spec-012b/__tests__/snapshot-only.test.mjs',
      anchor: 'test:snapshot-only-static-fixture',
    },
    {
      parts: ['low-value/duplicate-stale-fixture'],
      driftClass: 'deterministic_low_value_test_pattern',
      sourcePath: 'scripts/spec-012b/fixtures/hard/stale-status/copy-b/fixture.json',
      anchor: 'duplicate-stale-fixture',
    },
    {
      parts: ['owner/unknown-owner'],
      driftClass: 'stale_roadmap_claim',
      sourcePath: 'docs/unknown/process-note.md',
      anchor: 'last_verified',
    },
    {
      parts: ['freshness/status-age-only'],
      driftClass: 'stale_workflow_claim',
      sourcePath: 'docs/ai/specs/.process/SPEC-012B-workflow.md',
      anchor: 'last_verified',
    },
    {
      parts: ['source-links/optional-missing-link'],
      driftClass: 'broken_source_of_truth_link',
      sourcePath: 'docs/source-link-policy.md',
      anchor: 'Optional Links',
    },
    {
      parts: ['source-links/external-url'],
      driftClass: 'broken_source_of_truth_link',
      sourcePath: 'docs/external-context.md',
      anchor: 'External Context',
    },
    {
      parts: ['source-links/wiki-style-link'],
      driftClass: 'broken_source_of_truth_link',
      sourcePath: 'docs/wiki-links.md',
      anchor: 'Wiki',
    },
    {
      parts: ['specs-cleanup/completed-spec-eligible'],
      driftClass: 'archive_cleanup_eligibility',
      sourcePath: 'specs/001-old-complete/spec.md',
      anchor: 'Status',
    },
  ];

  for (const fixtureCase of cases) {
    const result = runWarningFixtureWithoutExpectedFindings(...fixtureCase.parts);

    assert.equal(result.stderr, '', `${fixtureCase.parts.join('/')} should emit report JSON`);
    assert.equal(result.status, 0, `${fixtureCase.parts.join('/')} should stay warning-only`);

    const report = JSON.parse(result.stdout);
    const finding = report.findings[0];

    assert.equal(report.summary.hard_failure_count, 0);
    assert.equal(report.summary.finding_count, 1);
    assert.equal(finding.drift_class, fixtureCase.driftClass);
    assert.equal(finding.source_path, fixtureCase.sourcePath);
    assert.equal(finding.anchor, fixtureCase.anchor);
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.recommendation.paddock_cleanup_task.live_mutation, false);
  }
});

test('warning-only fixtures emit recommendations without hard failures', () => {
  const result = runWarningFixtures();

  assert.equal(result.stderr, '', 'warning fixture run should emit report JSON');
  assert.equal(result.status, 0, 'warning-only findings must not fail CI');

  const report = JSON.parse(result.stdout);
  const classes = new Set(report.findings.map((finding) => finding.drift_class));

  assert.equal(report.summary.hard_failure_count, 0);
  assert.equal(report.summary.error_count, 0);
  assert.ok(report.summary.warning_count >= 9);
  assert.ok(classes.has('deterministic_low_value_test_pattern'));
  assert.ok(classes.has('stale_workflow_claim'));
  assert.ok(classes.has('broken_source_of_truth_link'));
  assert.ok(classes.has('archive_cleanup_eligibility'));
  assert.ok(report.findings.some((finding) => finding.owner.owner_key === 'unknown'));
  assert.ok(report.findings.every((finding) => finding.recommendation.paddock_cleanup_task.live_mutation === false));
});
