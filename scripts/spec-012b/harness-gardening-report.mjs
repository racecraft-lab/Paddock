import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

export const REPORT_SCHEMA_VERSION = 'harness_gardening_report.v1'
export const RECOMMENDATION_SCHEMA_VERSION = 'harness_gardening_recommendation.v1'
export const PADDOCK_CLEANUP_TASK_SCHEMA_VERSION = 'paddock_cleanup_task_import_draft.v1'

export const DEFAULT_JSON_REPORT_PATH =
  'specs/012b-harness-gardening-guards/.process/harness-gardening-report.json'
export const DEFAULT_MARKDOWN_REPORT_PATH =
  'specs/012b-harness-gardening-guards/.process/harness-gardening-report.md'

export const REPO_ARTIFACT_LIMIT_BYTES = 1_048_576
export const FIXTURE_FILE_LIMIT_BYTES = 262_144

export const DRIFT_CLASSES = Object.freeze([
  'stale_prd_claim',
  'stale_roadmap_claim',
  'stale_workflow_claim',
  'missing_required_evidence',
  'stale_feature_flag_status',
  'deterministic_low_value_test_pattern',
  'strict_scope_drift',
  'broken_source_of_truth_link',
  'archive_cleanup_eligibility',
])

export const ERROR_CODES = Object.freeze([
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
])

export const DETECTOR_NAMES = Object.freeze([
  'stale_claims',
  'missing_required_evidence',
  'stale_feature_flag_status',
  'deterministic_low_value_test_pattern',
  'strict_scope_drift',
  'source_of_truth_links',
  'archive_cleanup_eligibility',
])

export const FRESHNESS_DEFAULTS = Object.freeze({
  'status-pointer': 2,
  'active-workflow-evidence': 7,
  'current-workflow-evidence': 7,
  'execution-ledger': 30,
  'qa-evidence': 30,
  contract: 30,
  'operator-tooling': 30,
  'rollback-runbook': 30,
  'durable-intent': 45,
})

const SEVERITY_RANK = Object.freeze({
  warning: 1,
  error: 2,
})

const DRIFT_TO_DETECTOR = Object.freeze({
  stale_prd_claim: 'stale_claims',
  stale_roadmap_claim: 'stale_claims',
  stale_workflow_claim: 'stale_claims',
  missing_required_evidence: 'missing_required_evidence',
  stale_feature_flag_status: 'stale_feature_flag_status',
  deterministic_low_value_test_pattern: 'deterministic_low_value_test_pattern',
  strict_scope_drift: 'strict_scope_drift',
  broken_source_of_truth_link: 'source_of_truth_links',
  archive_cleanup_eligibility: 'archive_cleanup_eligibility',
})

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function stableFindingId({ drift_class, source_path, anchor, owner }) {
  const ownerKey = owner?.owner_key || 'unknown'
  const tuple = [drift_class, source_path, anchor, ownerKey].join('\0')
  const digest = createHash('sha256').update(tuple).digest('hex').slice(0, 20)
  return `hg_${digest}`
}

export function normalizeOwnerKey(value) {
  const normalized = String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'unknown'
}

export function normalizeRepoPath(value, fallback = 'unknown') {
  const normalized = String(value || fallback).trim().replaceAll('\\', '/').replace(/^\.\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return fallback
  if (normalized.startsWith('/') || parts.includes('..')) return fallback
  return parts.join('/')
}

export function boundedMessage(value) {
  const normalized = String(value || 'Harness gardening diagnostic').replace(/\s+/g, ' ').trim()
  return (normalized || 'Harness gardening diagnostic').slice(0, 512)
}

export function sanitizeGuardError(error, defaults = {}) {
  const code = ERROR_CODES.includes(error?.code) ? error.code : 'repo_artifact_unreadable'
  const sourcePath = normalizeRepoPath(error?.source_path || defaults.source_path || 'fixture.json')
  const required = Boolean(error?.required ?? defaults.required ?? true)
  const redacted = Boolean(error?.redacted ?? defaults.redacted ?? true)
  const detector = String(error?.detector || defaults.detector || 'fixture_reader')
  const detail = error?.message || `${code} at ${sourcePath}`

  return {
    source_path: sourcePath,
    detector,
    code,
    message: boundedMessage(detail),
    required,
    redacted,
  }
}

export function deriveOwner({ source_path, target_path, owner, repoKnowledgeEntries = [] } = {}) {
  if (owner && typeof owner === 'object') {
    const name = String(owner.name || owner.owner_key || 'unknown')
    return {
      name,
      owner_key: normalizeOwnerKey(owner.owner_key || name),
      owner_source: owner.owner_source || 'unknown',
      confidence: owner.confidence || 'unknown',
    }
  }

  const sourcePath = normalizeRepoPath(source_path)
  const targetPath = target_path ? normalizeRepoPath(target_path) : ''
  const indexedOwner = ownerFromRepoKnowledge(sourcePath, repoKnowledgeEntries)
    || (targetPath ? ownerFromRepoKnowledge(targetPath, repoKnowledgeEntries) : null)
  if (indexedOwner) return indexedOwner

  if (sourcePath === 'docs/ai/repo-knowledge-index.json') {
    return {
      name: 'Repo Knowledge',
      owner_key: 'repo-knowledge',
      owner_source: 'repo_knowledge_exact_path',
      confidence: 'high',
    }
  }

  if (sourcePath.includes('feature-flags') || targetPath.includes('feature-flags')) {
    return {
      name: 'Feature Flags',
      owner_key: 'feature-flags',
      owner_source: 'roadmap_path_class',
      confidence: 'low',
    }
  }

  if (sourcePath.startsWith('specs/') || sourcePath.includes('/specs/')) {
    return {
      name: 'SpecKit',
      owner_key: 'speckit',
      owner_source: 'spec_family',
      confidence: 'medium',
    }
  }

  if (sourcePath.startsWith('docs/ai/specs/')) {
    return {
      name: 'Docs Integrity',
      owner_key: 'docs-integrity',
      owner_source: 'spec_family',
      confidence: 'medium',
    }
  }

  if (sourcePath.startsWith('scripts/spec-012b/')) {
    return {
      name: 'SpecKit',
      owner_key: 'speckit',
      owner_source: 'spec_family',
      confidence: 'medium',
    }
  }

  return {
    name: 'unknown',
    owner_key: 'unknown',
    owner_source: 'unknown',
    confidence: 'unknown',
  }
}

function ownerFromRepoKnowledge(sourcePath, entries) {
  const candidates = []
  for (const entry of entries || []) {
    const entryPath = normalizeRepoPath(entry?.path)
    if (!entryPath || !entry?.owner) continue
    if (entryPath === sourcePath) {
      candidates.push({ entry, owner_source: 'repo_knowledge_exact_path', confidence: 'high', score: 1_000_000 })
      continue
    }
    const prefix = entryPath.endsWith('/') ? entryPath : `${entryPath}/`
    if (sourcePath.startsWith(prefix)) {
      candidates.push({
        entry,
        owner_source: 'repo_knowledge_directory_prefix',
        confidence: 'medium',
        score: prefix.length,
      })
    }
  }

  candidates.sort((left, right) => right.score - left.score)
  const match = candidates[0]
  if (!match) return null

  return {
    name: String(match.entry.owner),
    owner_key: normalizeOwnerKey(match.entry.owner),
    owner_source: match.owner_source,
    confidence: match.confidence,
  }
}

export function normalizeRawFinding(rawFinding, options = {}) {
  const driftClass = DRIFT_CLASSES.includes(rawFinding?.drift_class)
    ? rawFinding.drift_class
    : 'missing_required_evidence'
  const sourcePath = normalizeRepoPath(rawFinding?.source_path)
  const anchor = boundedMessage(rawFinding?.anchor || 'unknown')
  const owner = deriveOwner({
    source_path: sourcePath,
    target_path: rawFinding?.target_path,
    owner: rawFinding?.owner,
    repoKnowledgeEntries: options.repoKnowledgeEntries,
  })
  const severity = rawFinding?.severity === 'error' ? 'error' : 'warning'
  const evidence = sortEvidence(
    Array.isArray(rawFinding?.evidence) && rawFinding.evidence.length > 0
      ? rawFinding.evidence
      : [
          {
            source_path: sourcePath,
            anchor,
            summary: defaultEvidenceSummary(driftClass, sourcePath, anchor, options.caseId),
          },
        ],
  )
  const warnings = sortWarnings(Array.isArray(rawFinding?.warnings) ? rawFinding.warnings : [])
  if (owner.owner_key === 'unknown' && !warnings.some((warning) => warning.code === 'owner_unknown')) {
    warnings.push({
      code: 'owner_unknown',
      message: 'Owner could not be derived from repo knowledge or SPEC conventions',
    })
  }

  return {
    stable_finding_id: stableFindingId({
      drift_class: driftClass,
      source_path: sourcePath,
      anchor,
      owner,
    }),
    drift_class: driftClass,
    source_path: sourcePath,
    anchor,
    owner,
    severity,
    evidence: sortEvidence(evidence),
    warnings: sortWarnings(warnings),
    remediation_summary: boundedMessage(rawFinding?.remediation_summary || defaultRemediationSummary(driftClass, sourcePath, anchor)),
    recommendation_overrides: rawFinding?.recommendation || {},
  }
}

export function buildReport({
  asOf,
  rawFindings = [],
  errors = [],
  detectorStatuses = [],
  repoKnowledgeEntries = [],
} = {}) {
  const normalizedFindings = rawFindings.map((finding) =>
    normalizeRawFinding(finding, { repoKnowledgeEntries, caseId: finding?.case_id }),
  )
  const findings = dedupeFindings(normalizedFindings).map((finding) => {
    const { remediation_summary, recommendation_overrides, ...publicFinding } = finding
    return {
      ...publicFinding,
      recommendation: buildRecommendation(publicFinding, remediation_summary, recommendation_overrides),
    }
  })
  const sanitizedErrors = sortErrors(errors.map((error) => sanitizeGuardError(error)))
  const statuses = buildDetectorStatuses({ findings, errors: sanitizedErrors, detectorStatuses })
  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    as_of: asOf,
    detector_statuses: statuses,
    summary: summarizeReport(findings, sanitizedErrors, statuses),
    findings,
    errors: sanitizedErrors,
  }

  assertReportInvariants(report)
  return report
}

export function dedupeFindings(findings) {
  const grouped = new Map()

  for (const finding of findings) {
    const existing = grouped.get(finding.stable_finding_id)
    if (!existing) {
      grouped.set(finding.stable_finding_id, {
        ...finding,
        evidence: [...finding.evidence],
        warnings: [...finding.warnings],
      })
      continue
    }

    existing.severity = severityMax(existing.severity, finding.severity)
    if (existing.owner.owner_key === 'unknown' && finding.owner.owner_key !== 'unknown') {
      existing.owner = finding.owner
    }
    existing.evidence = sortEvidence([...existing.evidence, ...finding.evidence])
    existing.warnings = sortWarnings([...existing.warnings, ...finding.warnings])
    if (!existing.remediation_summary && finding.remediation_summary) {
      existing.remediation_summary = finding.remediation_summary
    }
  }

  return sortFindings([...grouped.values()])
}

export function sortFindings(findings) {
  return [...findings].sort((left, right) =>
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]
    || left.drift_class.localeCompare(right.drift_class)
    || left.source_path.localeCompare(right.source_path)
    || left.anchor.localeCompare(right.anchor)
    || left.owner.owner_key.localeCompare(right.owner.owner_key)
    || left.stable_finding_id.localeCompare(right.stable_finding_id),
  )
}

export function sortEvidence(evidence) {
  return uniqueBy(evidence.map((entry) => ({
    source_path: normalizeRepoPath(entry?.source_path),
    anchor: boundedMessage(entry?.anchor || 'unknown'),
    summary: boundedMessage(entry?.summary || 'Harness gardening evidence'),
  })), stableJson).sort((left, right) =>
    left.summary.localeCompare(right.summary)
    || left.source_path.localeCompare(right.source_path)
    || left.anchor.localeCompare(right.anchor),
  )
}

export function sortWarnings(warnings) {
  return uniqueBy(warnings.map((warning) => ({
    code: boundedMessage(warning?.code || 'warning').slice(0, 128),
    message: boundedMessage(warning?.message || 'Harness gardening warning'),
  })), stableJson).sort((left, right) =>
    left.message.localeCompare(right.message)
    || left.code.localeCompare(right.code),
  )
}

export function summarizeReport(findings, errors, detectorStatuses = []) {
  const findingWarnings = findings.filter((finding) => finding.severity === 'warning').length
  const warningRecords = findings.reduce((total, finding) => total + finding.warnings.length, 0)
  const skippedWarnings = detectorStatuses.filter((status) =>
    status.status === 'skipped_detector' || status.status === 'warning',
  ).length
  const requiredErrors = errors.filter((error) => error.required).length
  const hardFailureFindings = findings.filter((finding) => finding.severity === 'error').length

  return {
    finding_count: findings.length,
    recommendation_count: findings.length,
    error_count: errors.length,
    warning_count: findingWarnings + warningRecords + skippedWarnings,
    hard_failure_count: hardFailureFindings + requiredErrors,
  }
}

export function renderJsonReport(report) {
  assertReportInvariants(report)
  return stableJson(report)
}

export function renderMarkdownReport(report) {
  const lines = [
    '# Harness Gardening Report',
    '',
    `- Schema: ${report.schema_version}`,
    `- As of: ${report.as_of}`,
    `- Findings: ${report.summary.finding_count}`,
    `- Recommendations: ${report.summary.recommendation_count}`,
    `- Hard failures: ${report.summary.hard_failure_count}`,
    `- Warnings: ${report.summary.warning_count}`,
    `- Guard errors: ${report.summary.error_count}`,
    '',
    '## Detector Statuses',
    '',
  ]

  for (const status of report.detector_statuses) {
    const suffix = status.code ? ` (${status.code})` : ''
    lines.push(`- ${status.detector}: ${status.status}${suffix}`)
  }

  lines.push('', '## Findings', '')
  if (report.findings.length === 0) {
    lines.push('- None')
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding.stable_finding_id}: ${finding.severity} ${finding.drift_class}`)
      lines.push(`  - Source: ${finding.source_path} (${finding.anchor})`)
      lines.push(`  - Owner: ${finding.owner.name} (${finding.owner.owner_key})`)
      lines.push(`  - Recommendation: ${finding.recommendation.remediation_summary}`)
    }
  }

  lines.push('', '## Errors', '')
  if (report.errors.length === 0) {
    lines.push('- None')
  } else {
    for (const error of report.errors) {
      lines.push(`- ${error.code}: ${error.source_path} (${error.required ? 'required' : 'optional'})`)
    }
  }

  return `${lines.join('\n')}\n`
}

export function writeDefaultReports(report, {
  jsonPath = DEFAULT_JSON_REPORT_PATH,
  markdownPath = DEFAULT_MARKDOWN_REPORT_PATH,
} = {}) {
  mkdirSync(dirname(jsonPath), { recursive: true })
  mkdirSync(dirname(markdownPath), { recursive: true })
  writeFileSync(jsonPath, renderJsonReport(report))
  writeFileSync(markdownPath, renderMarkdownReport(report))
}

export function assertReportInvariants(report) {
  if (report.schema_version !== REPORT_SCHEMA_VERSION) {
    throw new Error('Invalid harness gardening report schema version')
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(report.as_of)) {
    throw new Error('Report as_of must be YYYY-MM-DD')
  }

  const expectedSummary = summarizeReport(report.findings, report.errors, report.detector_statuses)
  if (stableJson(report.summary) !== stableJson(expectedSummary)) {
    throw new Error('Harness gardening report summary counts do not match content')
  }

  const sorted = sortFindings(report.findings)
  if (stableJson(sorted.map((finding) => finding.stable_finding_id)) !== stableJson(report.findings.map((finding) => finding.stable_finding_id))) {
    throw new Error('Harness gardening findings are not sorted deterministically')
  }

  for (const finding of report.findings) {
    const expectedId = stableFindingId(finding)
    if (finding.stable_finding_id !== expectedId) {
      throw new Error(`Stable finding ID mismatch for ${finding.source_path}`)
    }
    assertRecommendationMatchesFinding(finding.recommendation, finding)
  }
}

function assertRecommendationMatchesFinding(recommendation, finding) {
  const copiedFields = ['stable_finding_id', 'drift_class', 'source_path', 'anchor', 'severity']
  if (recommendation.schema_version !== RECOMMENDATION_SCHEMA_VERSION) {
    throw new Error('Invalid recommendation schema version')
  }
  if (recommendation.recommendation_id !== finding.stable_finding_id) {
    throw new Error('Recommendation ID must equal stable finding ID')
  }
  for (const field of copiedFields) {
    if (recommendation[field] !== finding[field]) {
      throw new Error(`Recommendation field ${field} must match parent finding`)
    }
  }
  if (stableJson(recommendation.owner) !== stableJson(finding.owner)) {
    throw new Error('Recommendation owner must match parent finding')
  }
  if (stableJson(recommendation.evidence) !== stableJson(finding.evidence)) {
    throw new Error('Recommendation evidence must match parent finding')
  }
  if (stableJson(recommendation.warnings) !== stableJson(finding.warnings)) {
    throw new Error('Recommendation warnings must match parent finding')
  }
}

function buildDetectorStatuses({ findings, errors, detectorStatuses }) {
  const statuses = new Map()
  for (const status of detectorStatuses || []) {
    statuses.set(status.detector, normalizeDetectorStatus(status))
  }

  for (const finding of findings) {
    const detector = DRIFT_TO_DETECTOR[finding.drift_class] || finding.drift_class
    const current = statuses.get(detector)
    const status = finding.severity === 'error' ? 'failed' : 'warning'
    if (!current || statusRank(status) > statusRank(current.status)) {
      statuses.set(detector, { detector, status })
    }
  }

  for (const error of errors) {
    const current = statuses.get(error.detector)
    const status = error.required ? 'failed' : 'skipped_detector'
    if (!current || statusRank(status) > statusRank(current.status)) {
      statuses.set(error.detector, {
        detector: error.detector,
        status,
        code: error.code,
        message: error.message,
      })
    }
  }

  if (statuses.size === 0) {
    for (const detector of DETECTOR_NAMES) statuses.set(detector, { detector, status: 'passed' })
  }

  return [...statuses.values()].sort((left, right) => {
    const leftIndex = DETECTOR_NAMES.indexOf(left.detector)
    const rightIndex = DETECTOR_NAMES.indexOf(right.detector)
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
    return normalizedLeft - normalizedRight || left.detector.localeCompare(right.detector)
  })
}

function normalizeDetectorStatus(status) {
  const normalized = {
    detector: String(status.detector || 'unknown_detector'),
    status: ['passed', 'failed', 'warning', 'skipped_detector'].includes(status.status) ? status.status : 'warning',
  }
  if (status.code && ERROR_CODES.includes(status.code)) normalized.code = status.code
  if (status.message) normalized.message = boundedMessage(status.message)
  return normalized
}

function statusRank(status) {
  return {
    passed: 0,
    skipped_detector: 1,
    warning: 2,
    failed: 3,
  }[status] ?? 0
}

function severityMax(left, right) {
  return SEVERITY_RANK[right] > SEVERITY_RANK[left] ? right : left
}

function buildRecommendation(finding, remediationSummary, overrides = {}) {
  const deferredSideEffects = sortStrings([
    'paddock_task_create',
    'github_issue_create',
    'live_state_mutation',
    ...(finding.drift_class === 'archive_cleanup_eligibility' ? ['archive_cleanup_apply'] : []),
    ...(Array.isArray(overrides.deferred_side_effects) ? overrides.deferred_side_effects : []),
  ])

  return {
    schema_version: RECOMMENDATION_SCHEMA_VERSION,
    stable_finding_id: finding.stable_finding_id,
    recommendation_id: finding.stable_finding_id,
    drift_class: finding.drift_class,
    source_path: finding.source_path,
    anchor: finding.anchor,
    owner: finding.owner,
    severity: finding.severity,
    evidence: finding.evidence,
    remediation_summary: boundedMessage(remediationSummary),
    paddock_cleanup_task: buildPaddockCleanupTask(finding, remediationSummary),
    github_issue_export: buildGithubIssueExport(finding, remediationSummary),
    deferred_side_effects: deferredSideEffects,
    warnings: finding.warnings,
  }
}

function buildPaddockCleanupTask(finding, remediationSummary) {
  const title = `[SPEC-012B] ${finding.drift_class}: ${finding.source_path}`
  return {
    schema_version: PADDOCK_CLEANUP_TASK_SCHEMA_VERSION,
    operation: 'create_task',
    live_mutation: false,
    title: boundedMessage(title),
    description: boundedMessage(`${remediationSummary} Source: ${finding.source_path} (${finding.anchor}).`),
    status: 'inbox',
    priority: finding.severity === 'error' ? 'P1' : 'P3',
    tags: sortStrings(['harness-gardening', 'spec-012b', finding.drift_class]),
    metadata: {
      stable_finding_id: finding.stable_finding_id,
      drift_class: finding.drift_class,
      source_path: finding.source_path,
      anchor: finding.anchor,
      owner: finding.owner,
      evidence: finding.evidence,
    },
  }
}

function buildGithubIssueExport(finding, remediationSummary) {
  const body = [
    `Stable finding: ${finding.stable_finding_id}`,
    `Source: ${finding.source_path}`,
    `Anchor: ${finding.anchor}`,
    `Owner: ${finding.owner.name} (${finding.owner.owner_key})`,
    `Severity: ${finding.severity}`,
    `Action: ${remediationSummary}`,
  ].join('\n')

  return {
    export_only: true,
    live_mutation: false,
    repository: 'racecraft-lab/Paddock',
    title: boundedMessage(`[SPEC-012B] ${finding.drift_class} in ${finding.source_path}`),
    body,
    labels: sortStrings(['harness-gardening', 'spec-012b']),
  }
}

function defaultEvidenceSummary(driftClass, sourcePath, anchor, caseId) {
  const suffix = caseId ? ` from fixture ${caseId}` : ''
  return `${driftClass} evidence at ${sourcePath} ${anchor}${suffix}`
}

function defaultRemediationSummary(driftClass, sourcePath, anchor) {
  return `Review ${sourcePath} at ${anchor} and apply one narrow ${driftClass.replaceAll('_', ' ')} cleanup.`
}

function uniqueBy(values, keyFn) {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const key = keyFn(value)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }
  return unique
}

function sortStrings(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function sortErrors(errors) {
  return [...errors].sort((left, right) =>
    left.source_path.localeCompare(right.source_path)
    || left.detector.localeCompare(right.detector)
    || left.code.localeCompare(right.code)
    || Number(right.required) - Number(left.required),
  )
}
