import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guardScript = join(repoRoot, 'scripts/spec-012b/harness-gardening-check.mjs');
const schemaPath = join(repoRoot, 'specs/012b-harness-gardening-guards/contracts/harness-gardening-report.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

function runFresh() {
  return spawnSync(
    process.execPath,
    [
      guardScript,
      '--fixtures',
      'scripts/spec-012b/fixtures/fresh',
      '--as-of',
      '2026-06-06',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

function assertReportContract(report) {
  assert.equal(report.schema_version, schema.properties.schema_version.const);
  assert.match(report.as_of, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  assert.equal(report.summary.finding_count, report.findings.length);
  assert.equal(report.summary.error_count, report.errors.length);

  for (const finding of report.findings) {
    assert.match(finding.stable_finding_id, /^hg_[a-f0-9]{20}$/);
    assert.equal(finding.recommendation.stable_finding_id, finding.stable_finding_id);
    assert.equal(finding.recommendation.recommendation_id, finding.stable_finding_id);
    assert.equal(finding.recommendation.drift_class, finding.drift_class);
    assert.equal(finding.recommendation.source_path, finding.source_path);
    assert.equal(finding.recommendation.anchor, finding.anchor);
    assert.deepEqual(finding.recommendation.owner, finding.owner);
    assert.equal(finding.recommendation.severity, finding.severity);
    assert.deepEqual(finding.recommendation.evidence, finding.evidence);
    assert.deepEqual(finding.recommendation.warnings, finding.warnings);
    assert.equal(finding.recommendation.paddock_cleanup_task.live_mutation, false);
    if (finding.recommendation.github_issue_export) {
      assert.equal(finding.recommendation.github_issue_export.export_only, true);
      assert.equal(finding.recommendation.github_issue_export.live_mutation, false);
    }
  }
}

test('report schema exposes closed constants and enums required by SPEC-012B', () => {
  assert.equal(schema.properties.schema_version.const, 'harness_gardening_report.v1');
  assert.ok(schema.$defs.drift_class.enum.includes('stale_workflow_claim'));
  assert.ok(schema.$defs.drift_class.enum.includes('archive_cleanup_eligibility'));
  assert.ok(schema.$defs.error_code.enum.includes('fixture_unsafe_path'));
  assert.ok(schema.$defs.error_code.enum.includes('artifact_too_large'));
  assert.deepEqual(schema.$defs.severity.enum, ['error', 'warning']);
});

test('generated JSON satisfies contract invariants and is byte-for-byte deterministic', () => {
  const first = runFresh();
  const second = runFresh();

  assert.equal(first.stderr, '', 'contract run should emit JSON on stdout');
  assert.equal(second.stderr, '', 'contract run should emit JSON on stdout');
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);

  assertReportContract(JSON.parse(first.stdout));
});
