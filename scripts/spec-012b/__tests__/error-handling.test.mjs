import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const errorsRoot = join(repoRoot, 'scripts/spec-012b/fixtures/errors');
const closedCodes = [
  'repo_artifact_missing',
  'repo_artifact_unreadable',
  'repo_artifact_malformed_json',
  'repo_artifact_malformed_markdown',
  'repo_artifact_schema_invalid',
  'fixture_missing',
  'fixture_malformed_json',
  'fixture_expectation_mismatch',
  'fixture_unsafe_path',
  'artifact_unsupported_format',
  'artifact_too_large',
];

function runErrors(path) {
  return spawnSync(
    process.execPath,
    [guardScript, '--fixtures', path, '--as-of', '2026-06-06', '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

test('error fixtures declare every closed error code and redaction policy branch', () => {
  const allCodes = JSON.parse(readFileSync(join(errorsRoot, 'all-codes/fixture.json'), 'utf8'));
  const redaction = JSON.parse(readFileSync(join(errorsRoot, 'redaction/fixture.json'), 'utf8'));
  const unsafe = JSON.parse(readFileSync(join(errorsRoot, 'unsafe-paths/fixture.json'), 'utf8'));

  assert.deepEqual(allCodes.expected.errors.map((error) => error.code), closedCodes);
  assert.deepEqual(
    redaction.expected.errors.map((error) => error.redacted),
    [true, false],
  );
  assert.deepEqual(
    unsafe.inputs.unsafe_paths,
    ['/absolute/escape.md', '../outside.md', '..\\outside.md', 'repo/docs/link-outside'],
  );
});

test('sanitized required errors fail without leaking raw host or secret-shaped content', () => {
  const result = runErrors('scripts/spec-012b/fixtures/errors');

  assert.equal(result.stderr, '', 'error fixtures should emit sanitized JSON, not raw loader errors');
  assert.equal(result.status, 1);

  const report = JSON.parse(result.stdout);
  const codes = new Set(report.errors.map((error) => error.code));
  for (const code of closedCodes) {
    assert.equal(codes.has(code), true, `${code} should be emitted`);
  }

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /\/Users\/fredrickgabelmann/);
  assert.doesNotMatch(serialized, /TOKEN=|SECRET=|sk-[A-Za-z0-9]/);
  assert.ok(report.errors.every((error) => error.message.length <= 512));
});

test('oversize fixtures classify fixture input files before parsing', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hg-oversize-'));
  const tempFixtureRoot = join(tempRoot, 'oversize');
  cpSync(join(errorsRoot, 'oversize'), tempFixtureRoot, { recursive: true });
  mkdirSync(join(tempFixtureRoot, 'repo/docs'), { recursive: true });
  writeFileSync(join(tempFixtureRoot, 'repo/docs/too-large.md'), 'x'.repeat(262145));

  const result = runErrors(tempFixtureRoot);

  assert.equal(result.stderr, '', 'oversize fixture should emit sanitized JSON');
  assert.equal(result.status, 1);

  const report = JSON.parse(result.stdout);
  assert.ok(report.errors.some((error) => error.code === 'artifact_too_large' && error.required === true));
});

test('optional detector errors skip without causing hard failure', () => {
  const result = runErrors('scripts/spec-012b/fixtures/errors/optional-skip');

  assert.equal(result.stderr, '', 'optional error fixture should emit sanitized JSON');
  assert.equal(result.status, 0);

  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.hard_failure_count, 0);
  assert.ok(
    report.detector_statuses.some(
      (status) => status.status === 'skipped_detector' && status.code === 'repo_artifact_missing',
    ),
  );
});
