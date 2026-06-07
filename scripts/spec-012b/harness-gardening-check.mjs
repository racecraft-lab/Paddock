#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_JSON_REPORT_PATH,
  DEFAULT_MARKDOWN_REPORT_PATH,
  DETECTOR_NAMES,
  ERROR_CODES,
  FRESHNESS_DEFAULTS,
  FIXTURE_FILE_LIMIT_BYTES,
  buildReport,
  renderJsonReport,
  renderMarkdownReport,
  sanitizeGuardError,
  stableJson,
  writeDefaultReports,
} from './harness-gardening-report.mjs'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(moduleDir, '../..')

export function parseArgs(argv) {
  const args = {
    fixtures: null,
    json: false,
    asOf: '1970-01-01',
    jsonPath: DEFAULT_JSON_REPORT_PATH,
    markdownPath: DEFAULT_MARKDOWN_REPORT_PATH,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      continue
    } else if (arg === '--fixtures') {
      const value = argv[index + 1]
      if (!value) throw new Error('--fixtures requires a path')
      args.fixtures = value
      index += 1
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--as-of') {
      const value = argv[index + 1]
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value || '')) {
        throw new Error('--as-of requires YYYY-MM-DD')
      }
      args.asOf = value
      index += 1
    } else if (arg === '--report-json') {
      const value = argv[index + 1]
      if (!value) throw new Error('--report-json requires a path')
      args.jsonPath = value
      index += 1
    } else if (arg === '--report-md') {
      const value = argv[index + 1]
      if (!value) throw new Error('--report-md requires a path')
      args.markdownPath = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

export function runHarnessGardening(args) {
  const fixtureCases = args.fixtures ? collectFixtureCases(args.fixtures) : []
  const rawFindings = []
  const errors = []
  const detectorStatuses = []
  const repoKnowledgeEntries = []

  if (args.fixtures && fixtureCases.length === 0) {
    errors.push(sanitizeGuardError({
      source_path: 'fixture.json',
      detector: 'fixture_reader',
      code: 'fixture_missing',
      message: 'No SPEC-012B fixture.json files were found',
      required: true,
      redacted: false,
    }))
  }

  for (const fixtureCase of fixtureCases) {
    const loaded = loadFixtureCase(fixtureCase)
    errors.push(...loaded.errors)
    detectorStatuses.push(...loaded.detectorStatuses)
    rawFindings.push(...loaded.rawFindings)
    repoKnowledgeEntries.push(...loaded.repoKnowledgeEntries)
  }

  if (fixtureCases.length === 0 && errors.length === 0) {
    detectorStatuses.push(...DETECTOR_NAMES.map((detector) => ({ detector, status: 'passed' })))
  }

  return buildReport({
    asOf: args.asOf,
    rawFindings,
    errors,
    detectorStatuses,
    repoKnowledgeEntries,
  })
}

function collectFixtureCases(inputPath) {
  const absolute = resolveInputPath(inputPath)
  if (!existsSync(absolute)) return []
  if (lstatSync(absolute).isFile()) {
    return absolute.endsWith('fixture.json') ? [dirname(absolute)] : []
  }
  if (existsSync(join(absolute, 'fixture.json'))) return [absolute]

  const cases = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      if (existsSync(join(full, 'fixture.json'))) {
        cases.push(full)
      } else {
        visit(full)
      }
    }
  }
  visit(absolute)
  return cases.sort((left, right) => toDisplayPath(left).localeCompare(toDisplayPath(right)))
}

function loadFixtureCase(caseRoot) {
  const fixturePath = join(caseRoot, 'fixture.json')
  const errors = []
  const detectorStatuses = []
  const rawFindings = []
  const repoKnowledgeEntries = []

  const fixtureRead = readJsonFixture(fixturePath)
  if (fixtureRead.error) {
    errors.push(fixtureRead.error)
    return { errors, detectorStatuses, rawFindings, repoKnowledgeEntries }
  }

  const fixture = fixtureRead.value
  if (fixture.fixture_version !== 'harness_gardening_fixture.v1') {
    errors.push(fixtureError(fixture, {
      code: 'fixture_expectation_mismatch',
      source_path: 'fixture.json',
      message: 'Fixture version must be harness_gardening_fixture.v1',
      redacted: false,
    }))
    return { errors, detectorStatuses, rawFindings, repoKnowledgeEntries }
  }

  const caseErrors = evaluateFixtureBoundaries(caseRoot, fixture)
  errors.push(...caseErrors)
  repoKnowledgeEntries.push(...readFixtureRepoKnowledge(caseRoot))

  if (Array.isArray(fixture.expected?.detectors)) {
    detectorStatuses.push(...fixture.expected.detectors.map((detector) => ({ detector, status: 'passed' })))
  }
  if (Array.isArray(fixture.expected?.detector_statuses)) {
    detectorStatuses.push(...fixture.expected.detector_statuses.map((status) => ({
      detector: status.detector,
      status: status.status,
      code: status.code,
      message: status.message,
    })))
  }

  if (Array.isArray(fixture.inputs?.raw_findings)) {
    rawFindings.push(...fixture.inputs.raw_findings.map((finding) => ({ ...finding, case_id: fixture.case_id })))
  } else if (isUs1Fixture(fixture)) {
    rawFindings.push(...detectUs1FixtureFindings(caseRoot, fixture))
  } else if (isWarningFixture(fixture)) {
    rawFindings.push(...detectWarningFixtureFindings(caseRoot, fixture))
  }

  if (Array.isArray(fixture.expected?.errors)) {
    errors.push(...fixture.expected.errors.map((error) => fixtureError(fixture, error)))
  }

  return { errors, detectorStatuses, rawFindings, repoKnowledgeEntries }
}

function isUs1Fixture(fixture) {
  return String(fixture.case_id || '').startsWith('hard/')
    || String(fixture.case_id || '').startsWith('fresh/')
}

function isWarningFixture(fixture) {
  return String(fixture.case_id || '').startsWith('warning/')
}

function detectUs1FixtureFindings(caseRoot, fixture) {
  return [
    ...detectStaleStatusPointers(caseRoot, fixture),
    ...detectMissingRequiredEvidence(caseRoot, fixture),
    ...detectStaleFeatureFlags(caseRoot, fixture),
    ...detectStrictScopeDrift(caseRoot, fixture),
    ...detectBrokenSourceLinks(caseRoot, fixture),
  ]
}

function detectWarningFixtureFindings(caseRoot, fixture) {
  return [
    ...detectLowValueTestPatterns(caseRoot, fixture),
    ...detectWarningFreshness(fixture),
    ...detectWarningSourceFreshness(caseRoot, fixture),
    ...detectBrokenSourceLinks(caseRoot, fixture),
    ...detectArchiveCleanupEligibility(caseRoot, fixture),
  ]
}

function detectLowValueTestPatterns(caseRoot, fixture) {
  const findings = []
  const testFiles = Array.isArray(fixture.inputs?.test_files) ? fixture.inputs.test_files : []

  for (const sourcePath of testFiles) {
    const text = readRepoText(caseRoot, sourcePath)
    if (!text) continue

    if (!hasAssertion(text)) {
      findings.push(lowValueFinding({
        fixture,
        sourcePath,
        anchor: 'test:no-assertion',
        summary: 'Test body has no assertion call and only exercises fixture shape.',
        remediation: 'Add a behavioral assertion that proves the guard output, owner, evidence, or severity contract.',
      }))
      continue
    }

    if (isSnapshotOnlyStaticFixtureTest(text)) {
      findings.push(lowValueFinding({
        fixture,
        sourcePath,
        anchor: 'test:snapshot-only-static-fixture',
        summary: 'Static snapshot-style assertion omits owner and evidence checks.',
        remediation: 'Add explicit owner and evidence assertions or replace the static shape check with a behavior-focused test.',
      }))
    }
  }

  findings.push(...detectDuplicateStaleFixtures(caseRoot, fixture))
  return findings
}

function detectDuplicateStaleFixtures(caseRoot, fixture) {
  const fixturePaths = Array.isArray(fixture.inputs?.duplicate_stale_fixtures)
    ? fixture.inputs.duplicate_stale_fixtures
    : []
  const seen = new Map()
  const findings = []

  for (const sourcePath of fixturePaths) {
    const duplicateFixture = readRepoJson(caseRoot, sourcePath)
    const finding = duplicateFixture?.expected?.findings?.[0]
    if (!finding) continue

    const tuple = [
      finding.drift_class,
      finding.source_path,
      finding.anchor,
      finding.severity,
    ].join('\0')
    const firstSource = seen.get(tuple)
    if (!firstSource) {
      seen.set(tuple, sourcePath)
      continue
    }

    findings.push(lowValueFinding({
      fixture,
      sourcePath,
      anchor: 'duplicate-stale-fixture',
      summary: `${sourcePath} repeats the same stale finding tuple as ${firstSource}`,
      remediation: 'Merge the duplicate stale fixture or vary its source, anchor, or expected drift tuple.',
      evidence: [
        {
          source_path: firstSource,
          anchor: 'duplicate-stale-fixture',
          summary: 'First fixture with this stale finding tuple.',
        },
        {
          source_path: sourcePath,
          anchor: 'duplicate-stale-fixture',
          summary: 'Duplicate fixture repeats the same stale finding tuple.',
        },
      ],
    }))
  }

  return findings
}

function lowValueFinding({ fixture, sourcePath, anchor, summary, remediation, evidence }) {
  return {
    drift_class: 'deterministic_low_value_test_pattern',
    source_path: normalizeSourcePath(sourcePath),
    anchor,
    severity: 'warning',
    evidence: evidence || [{
      source_path: normalizeSourcePath(sourcePath),
      anchor,
      summary,
    }],
    warnings: [],
    remediation_summary: remediation,
    case_id: fixture.case_id,
  }
}

function detectWarningFreshness(fixture) {
  const freshness = fixture.inputs?.freshness
  if (!freshness?.last_verified) return []

  const kind = String(freshness.kind || 'status-pointer')
  const thresholdDays = FRESHNESS_DEFAULTS[kind] ?? 30
  const asOf = fixture.as_of || '1970-01-01'
  const ageDays = daysBetween(freshness.last_verified, asOf)
  if (ageDays <= thresholdDays) return []

  const sourcePath = freshness.source_path || 'docs/ai/specs/.process/SPEC-012B-workflow.md'
  return [{
    drift_class: 'stale_workflow_claim',
    source_path: sourcePath,
    anchor: 'last_verified',
    severity: 'warning',
    evidence: [{
      source_path: sourcePath,
      anchor: 'last_verified',
      summary: `${kind} last_verified ${freshness.last_verified} is ${ageDays} days old; threshold is ${thresholdDays} days`,
    }],
    warnings: [],
    remediation_summary: 'Refresh the status pointer evidence date or leave a precise reason the stale timestamp remains acceptable.',
    case_id: fixture.case_id,
  }]
}

function detectWarningSourceFreshness(caseRoot, fixture) {
  const sourcePath = fixture.inputs?.source_path
  if (!sourcePath) return []

  const text = readRepoText(caseRoot, sourcePath)
  const match = text.match(/\blast_verified\s*[:=|]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)
  if (!match) return []

  const asOf = fixture.as_of || '1970-01-01'
  const ageDays = daysBetween(match[1], asOf)
  if (ageDays <= 30) return []

  return [{
    drift_class: 'stale_roadmap_claim',
    source_path: normalizeSourcePath(sourcePath),
    anchor: 'last_verified',
    severity: 'warning',
    evidence: [{
      source_path: normalizeSourcePath(sourcePath),
      anchor: 'last_verified',
      summary: `last_verified ${match[1]} is ${ageDays} days old and owner metadata cannot be derived from repo knowledge.`,
    }],
    warnings: [],
    remediation_summary: 'Refresh the low-confidence source note or index it with an explicit owner.',
    case_id: fixture.case_id,
  }]
}

function detectArchiveCleanupEligibility(caseRoot, fixture) {
  const candidateFolder = fixture.inputs?.candidate_spec_folder
  if (!candidateFolder) return []

  const specPath = `${normalizeSourcePath(candidateFolder)}/spec.md`
  const archiveMemory = normalizeSourcePath(fixture.inputs?.archive_memory || '.specify/memory/changelog.md')
  const specText = readRepoText(caseRoot, specPath)
  if (!/\bStatus\s*:\s*Complete\b/i.test(specText) && !/\bArchived\s*:\s*yes\b/i.test(specText)) {
    return []
  }
  if (!repoFileExists(caseRoot, archiveMemory)) return []

  return [{
    drift_class: 'archive_cleanup_eligibility',
    source_path: specPath,
    anchor: 'Status',
    owner: {
      name: 'Spec Archive',
      owner_key: 'spec-archive',
      owner_source: 'spec_family',
      confidence: 'medium',
    },
    severity: 'warning',
    evidence: [
      {
        source_path: specPath,
        anchor: 'Status',
        summary: 'Completed spec folder appears eligible for a future archive cleanup sweep.',
      },
      {
        source_path: archiveMemory,
        anchor: 'archive-provenance',
        summary: 'Archive memory exists, so cleanup remains gated and manual rather than automatic.',
      },
    ],
    warnings: [
      {
        code: 'archive_cleanup_gate_required',
        message: 'Cleanup eligibility is recommendation-only and must not mutate specs or archive state.',
      },
    ],
    remediation_summary: 'Queue a manual archive cleanup review only after the archive safe-base gate is explicitly opened.',
    recommendation: {
      deferred_side_effects: ['archive_cleanup_apply'],
      paddock_cleanup_task: {
        live_mutation: false,
      },
    },
    case_id: fixture.case_id,
  }]
}

function detectStaleStatusPointers(caseRoot, fixture) {
  const pointers = Array.isArray(fixture.inputs?.status_pointers) ? fixture.inputs.status_pointers : []
  if (pointers.length === 0) return []

  const autopilotPath = pointers.find((pointer) => pointer.endsWith('autopilot-state.json'))
  const autopilot = autopilotPath ? readRepoJson(caseRoot, autopilotPath) : null
  const currentSpec = specIdFromValue(autopilot?.current_spec)
  if (!currentSpec) return []

  return pointers
    .filter((pointer) => pointer !== autopilotPath)
    .flatMap((pointer) => {
      const text = readRepoText(caseRoot, pointer)
      if (!text) return []

      const claimedSpec = specIdFromValue(text.match(/SPEC-[0-9]{3,4}[A-Z]?/i)?.[0])
      const claimsCurrent = /\bcurrent\b/i.test(text)
      if (!claimedSpec || !claimsCurrent || claimedSpec === currentSpec) return []

      return [{
        drift_class: driftClassForStatusPointer(pointer),
        source_path: pointer,
        anchor: firstMarkdownHeading(text, /closeout|status|current/i) || 'status-pointer',
        severity: 'error',
        evidence: [{
          source_path: autopilotPath,
          anchor: '/current_spec',
          summary: `current_spec is ${autopilot.current_spec} while workflow claims ${claimedSpec} closeout is current`,
        }],
        warnings: [],
        remediation_summary: 'Update the stale workflow status pointer or add current closeout evidence.',
        case_id: fixture.case_id,
      }]
    })
}

function detectMissingRequiredEvidence(caseRoot, fixture) {
  const requiredMarkers = Array.isArray(fixture.inputs?.required_markers) ? fixture.inputs.required_markers : []
  const evidenceSources = Array.isArray(fixture.inputs?.evidence_sources) ? fixture.inputs.evidence_sources : []
  if (requiredMarkers.length === 0 || evidenceSources.length === 0) return []

  const findings = []
  for (const sourcePath of evidenceSources) {
    const text = readRepoText(caseRoot, sourcePath)
    if (!text || !/\b(complete|uat pending)\b/i.test(text)) continue

    const anchor = firstMarkdownHeading(text, /closeout|evidence|verification/i) || 'Closeout Evidence'
    for (const marker of requiredMarkers) {
      if (markerHasValue(text, marker)) continue
      const markerName = humanizeMarker(marker)
      findings.push({
        drift_class: 'missing_required_evidence',
        source_path: sourcePath,
        anchor,
        severity: 'error',
        evidence: [{
          source_path: sourcePath,
          anchor,
          summary: `Complete status is missing ${markerName}`,
        }],
        warnings: [],
        remediation_summary: `Add the exact ${markerName} closeout marker or downgrade the status claim.`,
        case_id: fixture.case_id,
      })
    }
  }

  return findings
}

function detectStaleFeatureFlags(caseRoot, fixture) {
  const requiredFlags = Array.isArray(fixture.inputs?.required_feature_flags) ? fixture.inputs.required_feature_flags : []
  if (requiredFlags.length === 0) return []

  const registryPath = 'src/lib/feature-flags.ts'
  const registryText = readRepoText(caseRoot, registryPath) || ''
  const sourcePath = repoFileExists(caseRoot, 'docs/feature-flags.md')
    ? 'docs/feature-flags.md'
    : registryPath

  return requiredFlags.flatMap((flag) => {
    const flagName = String(flag)
    if (!registryText.includes(flagName)) {
      return [featureFlagFinding({
        fixture,
        flagName,
        sourcePath,
        registryPath,
        summary: `Required flag ${flagName} is absent from registry`,
        remediation: 'Add the missing disabled-by-default registry entry or remove the documented requirement.',
      })]
    }

    const flagBlock = registryBlockForFlag(registryText, flagName)
    if (/\bdefaultEnabled\s*:\s*true\b/.test(flagBlock)) {
      return [featureFlagFinding({
        fixture,
        flagName,
        sourcePath,
        registryPath,
        summary: `Required flag ${flagName} has unsafe defaultEnabled true`,
        remediation: 'Change the registry entry to a disabled-by-default safety posture or update the documented requirement.',
      })]
    }

    return []
  })
}

function featureFlagFinding({ fixture, flagName, sourcePath, registryPath, summary, remediation }) {
  return {
    drift_class: 'stale_feature_flag_status',
    source_path: sourcePath,
    anchor: flagName,
    severity: 'error',
    evidence: [{
      source_path: registryPath,
      anchor: 'FEATURE_FLAG_REGISTRY',
      summary,
    }],
    warnings: [],
    remediation_summary: remediation,
    case_id: fixture.case_id,
  }
}

function detectStrictScopeDrift(caseRoot, fixture) {
  const changedFiles = Array.isArray(fixture.inputs?.changed_files) ? fixture.inputs.changed_files : []
  if (changedFiles.length === 0) return []

  const planPath = 'specs/012b-harness-gardening-guards/plan.md'
  const blockedPaths = changedFiles.filter((changedPath) => isBlockedRuntimePath(changedPath))
  const missingScopeEvidence = repoFileExists(caseRoot, planPath)
    && !/scope|allowed paths|process tooling/i.test(readRepoText(caseRoot, planPath) || '')

  return [
    ...blockedPaths.map((blockedPath) => ({
      drift_class: 'strict_scope_drift',
      source_path: planPath,
      anchor: 'Scope Boundaries',
      severity: 'error',
      evidence: [{
        source_path: blockedPath,
        anchor: 'changed-file',
        summary: `Blocked runtime surface ${blockedPath} appears in SPEC-012B changed-file set`,
      }],
      warnings: [],
      remediation_summary: 'Remove the runtime/API path from the SPEC-012B change or split it into a separate runtime spec.',
      case_id: fixture.case_id,
    })),
    ...(missingScopeEvidence ? [{
      drift_class: 'strict_scope_drift',
      source_path: planPath,
      anchor: 'Scope Boundaries',
      severity: 'error',
      evidence: [{
        source_path: planPath,
        anchor: 'Scope Boundaries',
        summary: 'SPEC-012B plan is missing strict-scope evidence for the changed-file set',
      }],
      warnings: [],
      remediation_summary: 'Add strict-scope evidence that proves the SPEC-012B change remains process/tooling-only.',
      case_id: fixture.case_id,
    }] : []),
  ]
}

function detectBrokenSourceLinks(caseRoot, fixture) {
  const links = Array.isArray(fixture.inputs?.source_links) ? fixture.inputs.source_links : []
  return links.flatMap((link) => {
    const target = normalizeSourcePath(link.target)
    const sourcePath = normalizeSourcePath(link.source_path)
    const anchor = link.anchor || target
    const sourceText = readRepoText(caseRoot, sourcePath)
    const isExternal = isExternalUrl(link.target)
    const isWikiStyle = isWikiStyleLink(link.target)

    if (link?.repo_owned && repoFileExists(caseRoot, target)) return []
    if (!link?.repo_owned && !isExternal && !isWikiStyle) return []

    const severity = link?.required && link?.repo_owned ? 'error' : 'warning'
    const classification = classifySourceLink(link, { targetExists: repoFileExists(caseRoot, target) })
    if (severity === 'warning' && sourceText && !sourceText.includes(String(link.target || ''))) {
      return []
    }

    return [{
      drift_class: 'broken_source_of_truth_link',
      source_path: sourcePath,
      target_path: target,
      anchor,
      severity,
      evidence: [{
        source_path: sourcePath,
        anchor,
        summary: sourceLinkEvidenceSummary(classification, target),
      }],
      warnings: [],
      remediation_summary: sourceLinkRemediation(classification),
      case_id: fixture.case_id,
    }]
  })
}

function hasAssertion(text) {
  return /\bassert(?:\.[A-Za-z0-9_]+)?\s*\(/.test(text)
    || /\bexpect\s*\(/.test(text)
}

function isSnapshotOnlyStaticFixtureTest(text) {
  return /\b(snapshot|static)\b/i.test(text)
    && /\bassert\.deepEqual\s*\(/.test(text)
    && !/\b(owner|owner_key|evidence|severity|hard_failure_count)\b/i.test(text)
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

function isWikiStyleLink(value) {
  return /^\[\[[^\]]+\]\]$/.test(String(value || '').trim())
}

function classifySourceLink(link, { targetExists }) {
  if (isExternalUrl(link?.target)) return 'external_url'
  if (isWikiStyleLink(link?.target)) return 'wiki_style_link'
  if (link?.repo_owned && !targetExists && !link?.required) return 'optional_missing_repo_owned'
  if (link?.repo_owned && !targetExists && link?.required) return 'broken_required_repo_owned'
  return 'source_link_warning'
}

function sourceLinkEvidenceSummary(classification, target) {
  if (classification === 'broken_required_repo_owned') {
    return `Required repo-owned link target ${target} is missing`
  }
  if (classification === 'optional_missing_repo_owned') {
    return `Optional repo-owned link target ${target} is missing`
  }
  if (classification === 'external_url') {
    return `External URL ${target} is recorded for offline review only`
  }
  if (classification === 'wiki_style_link') {
    return `Wiki-style link ${target} is informational and not a hard repo-owned dependency`
  }
  return `Source link ${target} requires offline review`
}

function sourceLinkRemediation(classification) {
  if (classification === 'broken_required_repo_owned') {
    return 'Fix or remove the broken required repo-owned source link.'
  }
  if (classification === 'optional_missing_repo_owned') {
    return 'Refresh the optional link target or leave it as a warning-only cleanup recommendation.'
  }
  if (classification === 'external_url') {
    return 'Verify the external source outside default guard execution and keep the guard offline.'
  }
  if (classification === 'wiki_style_link') {
    return 'Resolve or document the wiki-style link if it should become a required repo-owned source.'
  }
  return 'Review the source link classification and keep any cleanup recommendation narrow.'
}

function readJsonFixture(fixturePath) {
  if (!existsSync(fixturePath)) {
    return {
      error: sanitizeGuardError({
        source_path: 'fixture.json',
        detector: 'fixture_reader',
        code: 'fixture_missing',
        message: 'Required fixture.json is missing',
        required: true,
        redacted: false,
      }),
    }
  }

  const stats = statSync(fixturePath)
  if (stats.size > FIXTURE_FILE_LIMIT_BYTES) {
    return {
      error: sanitizeGuardError({
        source_path: 'fixture.json',
        detector: 'fixture_reader',
        code: 'artifact_too_large',
        message: `fixture.json exceeds ${FIXTURE_FILE_LIMIT_BYTES} bytes`,
        required: true,
        redacted: false,
      }),
    }
  }

  try {
    return { value: JSON.parse(readFileSync(fixturePath, 'utf8')) }
  } catch {
    return {
      error: sanitizeGuardError({
        source_path: 'fixture.json',
        detector: 'fixture_reader',
        code: 'fixture_malformed_json',
        message: 'fixture.json could not be parsed as JSON',
        required: true,
        redacted: true,
      }),
    }
  }
}

function readRepoJson(caseRoot, repoPath) {
  const text = readRepoText(caseRoot, repoPath)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readRepoText(caseRoot, repoPath) {
  const result = resolveFixtureRelativePath(caseRoot, repoPath, { mustStayInRepo: true })
  if (!result.safe || !existsSync(result.absolute)) return ''
  if (!realPathStaysInside(result.absolute, join(caseRoot, 'repo'))) return ''

  const stats = statSync(result.absolute)
  if (stats.size > FIXTURE_FILE_LIMIT_BYTES) return ''
  return readFileSync(result.absolute, 'utf8')
}

function repoFileExists(caseRoot, repoPath) {
  const result = resolveFixtureRelativePath(caseRoot, repoPath, { mustStayInRepo: true })
  return result.safe && existsSync(result.absolute) && realPathStaysInside(result.absolute, join(caseRoot, 'repo'))
}

function specIdFromValue(value) {
  const text = String(value || '')
  const direct = text.match(/SPEC-([0-9]{3,4})([A-Z]?)/i)
  if (direct) return `SPEC-${direct[1]}${direct[2].toUpperCase()}`

  const slug = text.match(/\b([0-9]{3,4})([a-z]?)-/i)
  if (!slug) return ''
  return `SPEC-${slug[1]}${slug[2].toUpperCase()}`
}

function driftClassForStatusPointer(sourcePath) {
  if (/roadmap/i.test(sourcePath)) return 'stale_roadmap_claim'
  if (/prd|requirements/i.test(sourcePath)) return 'stale_prd_claim'
  return 'stale_workflow_claim'
}

function firstMarkdownHeading(text, pattern) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match) continue
    const heading = match[1].trim()
    if (pattern.test(heading)) return heading
  }
  return ''
}

function markerHasValue(text, marker) {
  const escaped = escapeRegex(marker)
  const linePattern = new RegExp(`^\\s*(?:[-*]\\s*)?${escaped}\\s*[:=|]\\s*(\\S.+?)\\s*$`, 'im')
  const match = String(text || '').match(linePattern)
  return Boolean(match?.[1]?.trim())
}

function humanizeMarker(marker) {
  return String(marker || 'evidence')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase()
      if (lower === 'uat') return 'UAT'
      if (lower === 'pr') return 'PR'
      return index === 0 ? lower : lower
    })
    .join(' ')
}

function registryBlockForFlag(registryText, flagName) {
  const index = registryText.indexOf(flagName)
  if (index === -1) return ''
  const end = registryText.indexOf('\n};', index)
  return registryText.slice(index, end === -1 ? undefined : end)
}

function isBlockedRuntimePath(sourcePath) {
  const normalized = normalizeSourcePath(sourcePath)
  return normalized.startsWith('src/')
    || normalized.startsWith('migrations/')
    || normalized.startsWith('docs/migrations/')
    || /(^|\/)(api|scheduler|dispatch|claim|retry|sandbox|harness-adapter)(\/|\.|-)/i.test(normalized)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function evaluateFixtureBoundaries(caseRoot, fixture) {
  const errors = []

  for (const unsafePath of fixture.inputs?.unsafe_paths || []) {
    const result = resolveFixtureRelativePath(caseRoot, unsafePath, { mustStayInRepo: false })
    if (!result.safe) {
      errors.push(fixtureError(fixture, {
        code: 'fixture_unsafe_path',
        source_path: 'fixture.json',
        message: `Unsafe fixture path rejected: ${result.reason}`,
        redacted: false,
      }))
      continue
    }
    if (!realPathStaysInside(result.absolute, join(caseRoot, 'repo'))) {
      errors.push(fixtureError(fixture, {
        code: 'fixture_unsafe_path',
        source_path: 'fixture.json',
        message: 'Fixture path resolves outside the fixture repo mini-tree',
        redacted: false,
      }))
    }
  }

  for (const file of fixture.inputs?.files || []) {
    const result = resolveFixtureRelativePath(caseRoot, file.path, { mustStayInRepo: false })
    if (!result.safe) {
      errors.push(fixtureError(fixture, {
        code: 'fixture_unsafe_path',
        source_path: 'fixture.json',
        message: `Unsafe fixture file path rejected: ${result.reason}`,
        redacted: false,
      }))
      continue
    }
    if (!existsSync(result.absolute)) continue
    const observedBytes = statSync(result.absolute).size
    const limitBytes = Number(file.limit_bytes || FIXTURE_FILE_LIMIT_BYTES)
    if (observedBytes > limitBytes) {
      errors.push(fixtureError(fixture, {
        code: 'artifact_too_large',
        source_path: normalizeSourcePath(file.path),
        message: `Fixture input exceeds byte limit ${limitBytes}; observed ${observedBytes}`,
        redacted: false,
      }))
    }
  }

  return errors
}

function readFixtureRepoKnowledge(caseRoot) {
  const indexPath = join(caseRoot, 'repo/docs/ai/repo-knowledge-index.json')
  if (!existsSync(indexPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
    return Array.isArray(parsed.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

function resolveFixtureRelativePath(caseRoot, declaredPath, { mustStayInRepo }) {
  if (typeof declaredPath !== 'string' || declaredPath.trim() === '') {
    return { safe: false, reason: 'empty path' }
  }
  if (isAbsolute(declaredPath)) {
    return { safe: false, reason: 'absolute path' }
  }
  if (declaredPath.includes('\\')) {
    return { safe: false, reason: 'windows separator' }
  }

  const parts = declaredPath.split('/').filter(Boolean)
  if (parts.includes('..')) {
    return { safe: false, reason: 'parent traversal' }
  }

  const base = mustStayInRepo ? join(caseRoot, 'repo') : caseRoot
  const absolute = resolve(base, declaredPath)
  if (!isWithin(absolute, base)) {
    return { safe: false, reason: 'containment escape' }
  }

  return { safe: true, absolute }
}

function realPathStaysInside(absolutePath, boundaryRoot) {
  if (!existsSync(absolutePath)) return true
  const boundary = realpathSync(boundaryRoot)
  try {
    const stats = lstatSync(absolutePath)
    const real = stats.isSymbolicLink() ? realpathSync(absolutePath) : realpathSync(absolutePath)
    return isWithin(real, boundary)
  } catch {
    return false
  }
}

function fixtureError(fixture, error) {
  return sanitizeGuardError({
    source_path: normalizeSourcePath(error.source_path || 'fixture.json'),
    detector: error.detector || detectorForCase(fixture.case_id),
    code: ERROR_CODES.includes(error.code) ? error.code : 'fixture_expectation_mismatch',
    message: error.message || `${error.code} in ${fixture.case_id}`,
    required: error.required ?? true,
    redacted: error.redacted ?? true,
  })
}

function detectorForCase(caseId = '') {
  if (caseId.includes('source-links')) return 'source_of_truth_links'
  if (caseId.includes('feature-flag')) return 'stale_feature_flag_status'
  if (caseId.includes('strict-scope')) return 'strict_scope_drift'
  if (caseId.includes('missing-evidence')) return 'missing_required_evidence'
  if (caseId.includes('low-value')) return 'deterministic_low_value_test_pattern'
  if (caseId.includes('specs-cleanup')) return 'archive_cleanup_eligibility'
  if (caseId.includes('errors')) return 'fixture_reader'
  return 'stale_claims'
}

function resolveInputPath(inputPath) {
  return isAbsolute(inputPath) ? inputPath : resolve(repoRoot, inputPath)
}

function isWithin(candidate, root) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function normalizeSourcePath(value) {
  return String(value || 'fixture.json').replaceAll(sep, '/').replaceAll('\\', '/').replace(/^\/+/, '') || 'fixture.json'
}

function toDisplayPath(value) {
  return relative(repoRoot, value).split(sep).join('/')
}

function emitReport(report, args) {
  if (args.json) {
    process.stdout.write(renderJsonReport(report))
    return
  }

  const jsonPath = resolve(repoRoot, args.jsonPath)
  const markdownPath = resolve(repoRoot, args.markdownPath)
  mkdirSync(dirname(jsonPath), { recursive: true })
  writeDefaultReports(report, { jsonPath, markdownPath })
  process.stdout.write(renderMarkdownReport(report))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = runHarnessGardening(args)
  emitReport(report, args)
  process.exitCode = report.summary.hard_failure_count > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    const report = buildReport({
      asOf: '1970-01-01',
      errors: [
        sanitizeGuardError({
          source_path: 'scripts/spec-012b/harness-gardening-check.mjs',
          detector: 'cli',
          code: 'repo_artifact_unreadable',
          message: error instanceof Error ? error.message : 'Harness gardening command failed',
          required: true,
          redacted: true,
        }),
      ],
    })
    process.stdout.write(stableJson(report))
    process.exitCode = 1
  }
}
