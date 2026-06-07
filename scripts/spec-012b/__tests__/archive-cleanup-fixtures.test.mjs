import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const fixtureDir = join(repoRoot, 'scripts/spec-012b/fixtures/warning/specs-cleanup/completed-spec-eligible');
const specSentinel = join(fixtureDir, 'repo/specs/001-old-complete/spec.md');
const archiveSentinel = join(fixtureDir, 'repo/.specify/memory/changelog.md');

test('specs cleanup fixture declares recommendation-only archive eligibility', () => {
  const fixture = JSON.parse(readFileSync(join(fixtureDir, 'fixture.json'), 'utf8'));
  const finding = fixture.expected.findings[0];

  assert.equal(finding.drift_class, 'archive_cleanup_eligibility');
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.recommendation.deferred_side_effects.includes('archive_cleanup_apply'), true);
  assert.equal(finding.recommendation.paddock_cleanup_task.live_mutation, false);
  assert.equal(existsSync(specSentinel), true);
  assert.equal(existsSync(archiveSentinel), true);
});

test('specs cleanup warning never deletes specs folders or mutates archive state', () => {
  const beforeSpec = readFileSync(specSentinel, 'utf8');
  const beforeArchive = readFileSync(archiveSentinel, 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/warning/specs-cleanup',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.stderr, '', 'cleanup fixture should emit warning report JSON');
  assert.equal(result.status, 0);
  assert.equal(readFileSync(specSentinel, 'utf8'), beforeSpec, 'spec source must remain unchanged');
  assert.equal(readFileSync(archiveSentinel, 'utf8'), beforeArchive, 'archive memory must remain unchanged');

  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.hard_failure_count, 0);
  assert.equal(report.findings[0].drift_class, 'archive_cleanup_eligibility');
  assert.equal(report.findings[0].recommendation.deferred_side_effects.includes('archive_cleanup_apply'), true);
});
