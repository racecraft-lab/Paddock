import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scopeScript = join(repoRoot, 'scripts/spec-012b/check-scope-control.mjs');

function runScopeControl(args = []) {
  return spawnSync(process.execPath, [scopeScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('scope-control self-test covers allowed paths, blocked paths, token matrix, and docs exemptions', () => {
  const result = runScopeControl(['--self-test']);

  assert.equal(result.stderr, '', 'self-test should emit JSON only');
  assert.equal(result.status, 0, 'self-test fixtures should match expected outcomes');

  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 'harness_gardening_scope_control.v1');
  assert.equal(report.mode, 'self-test');
  assert.equal(report.failure_count, 0);
  assert.ok(report.changed_file_count >= 4);
  assert.ok(report.scanned_entry_count > report.changed_file_count);

  const cases = new Map(report.self_test_cases.map((entry) => [entry.case_id, entry]));
  for (const caseId of ['allowed-paths', 'blocked-paths', 'forbidden-tokens', 'docs-exemptions']) {
    assert.equal(cases.get(caseId)?.status, 'passed', `${caseId} should pass`);
  }

  assert.equal(cases.get('allowed-paths').observed_failure_count, 0);
  assert.equal(cases.get('docs-exemptions').observed_failure_count, 0);
  assert.ok(cases.get('blocked-paths').observed_reasons.includes('blocked_runtime_surface'));

  const tokenCategories = new Set(cases.get('forbidden-tokens').observed_token_categories);
  for (const category of [
    'github_mutation',
    'paddock_task_mutation',
    'scheduler_dispatch',
    'claim_retry',
    'sandbox',
    'harness_adapter',
    'auto_merge',
    'runtime_feature_flag',
    'external_openai_fetch',
    'archive_cleanup_mutation',
  ]) {
    assert.equal(tokenCategories.has(category), true, `${category} should be covered`);
  }
});

test('scope-control current-diff mode reports changed-file and scanned-entry counts', () => {
  const files = spawnSync('git', ['status', '--short', '--porcelain', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      return path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
    })
    .sort((left, right) => left.localeCompare(right));
  const result = runScopeControl();

  assert.equal(result.stderr, '', 'current-diff should emit JSON only');
  assert.equal(result.status, 0, 'current SPEC-012B process/tooling diff should pass scope control');

  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'current-diff');
  assert.equal(report.changed_file_count, files.length);
  assert.ok(report.scanned_entry_count >= report.changed_file_count);
  assert.equal(report.failure_count, 0);
  assert.deepEqual(report.failures, []);
});
