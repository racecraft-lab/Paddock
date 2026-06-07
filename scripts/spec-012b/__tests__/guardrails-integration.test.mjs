import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const guardrailsSource = readFileSync(join(repoRoot, 'scripts/check-guardrails.mjs'), 'utf8');
const spec012aSource = readFileSync(
  join(repoRoot, 'scripts/spec-012a/verify-repo-knowledge-index.mjs'),
  'utf8',
);

test('package.json exposes exactly one focused SPEC-012B command', () => {
  assert.equal(
    packageJson.scripts['spec:012b:harness-gardening'],
    'pnpm run verify:node && node scripts/spec-012b/harness-gardening-check.mjs',
  );

  const spec012bScripts = Object.keys(packageJson.scripts).filter((script) => script.includes('012b'));
  assert.deepEqual(spec012bScripts, ['spec:012b:harness-gardening']);
});

test('guardrails registers harness-gardening without replacing existing suites', () => {
  for (const suiteName of [
    'harness-gardening',
    'task-pipeline',
    'spec-evidence-screenshots',
    'repo-knowledge-index',
  ]) {
    assert.match(guardrailsSource, new RegExp(`['"]${suiteName}['"]`));
  }
  assert.match(guardrailsSource, /spec:012b:harness-gardening|harness-gardening-check\.mjs/);
});

test('focused package command accepts pnpm argument separator and emits JSON', () => {
  const result = spawnSync(
    'pnpm',
    [
      'spec:012b:harness-gardening',
      '--',
      '--fixtures',
      'scripts/spec-012b/fixtures/fresh',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Unknown argument: --/);
  assert.match(result.stdout, /"finding_count": 0/);
});

test('unknown-suite diagnostics include harness-gardening and preserve SPEC-012A suite names', () => {
  const result = spawnSync(
    'pnpm',
    ['guardrails', '--', '--suite', 'not-a-real-suite'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /harness-gardening/);
  assert.match(`${result.stdout}\n${result.stderr}`, /repo-knowledge-index/);
  assert.match(`${result.stdout}\n${result.stderr}`, /task-pipeline/);
});

test('SPEC-012A knowledge index command remains standalone and unchanged', () => {
  assert.equal(
    packageJson.scripts['knowledge:index:check'],
    'pnpm run verify:node && node scripts/spec-012a/verify-repo-knowledge-index.mjs',
  );
  assert.doesNotMatch(spec012aSource, /harness-gardening|spec-012b/i);
  assert.doesNotMatch(packageJson.scripts['knowledge:index:check'], /harness-gardening|spec-012b/i);
});
