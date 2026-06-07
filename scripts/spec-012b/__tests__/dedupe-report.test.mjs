import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureDir = join(repoRoot, 'scripts/spec-012b/fixtures/dedupe/repeated-drift');

function sortedStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function runDedupe() {
  return spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/dedupe',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('dedupe fixture varies owner display name without changing normalized owner_key', () => {
  const fixture = JSON.parse(readFileSync(join(fixtureDir, 'fixture.json'), 'utf8'));
  const ownerNames = fixture.inputs.raw_findings.map((finding) => finding.owner.name);
  const ownerKeys = new Set(fixture.inputs.raw_findings.map((finding) => finding.owner.owner_key));

  assert.deepEqual(ownerNames, ['Docs Integrity', 'docs-integrity', 'Docs Integrity']);
  assert.deepEqual([...ownerKeys], ['docs-integrity']);
  assert.equal(fixture.expected.findings.length, 1);
  assert.equal(fixture.expected.findings[0].severity, 'error');
});

test('dedupe report has stable IDs, deterministic sort, merged warnings, and max severity', () => {
  const first = runDedupe();
  const second = runDedupe();

  assert.equal(first.stderr, '', 'dedupe fixture should emit JSON on stdout');
  assert.equal(second.stderr, '', 'dedupe fixture should emit JSON on stdout');
  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.equal(first.stdout, second.stdout, 'dedupe JSON must be byte-for-byte deterministic');

  const report = JSON.parse(first.stdout);
  assert.equal(report.findings.length, 1);

  const finding = report.findings[0];
  assert.match(finding.stable_finding_id, /^hg_[a-f0-9]{20}$/);
  assert.equal(finding.owner.owner_key, 'docs-integrity');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.recommendation.recommendation_id, finding.stable_finding_id);
  assert.deepEqual(
    finding.evidence.map((entry) => entry.summary),
    sortedStrings(finding.evidence.map((entry) => entry.summary)),
  );
  assert.deepEqual(
    finding.warnings.map((entry) => entry.message),
    sortedStrings(finding.warnings.map((entry) => entry.message)),
  );
});
