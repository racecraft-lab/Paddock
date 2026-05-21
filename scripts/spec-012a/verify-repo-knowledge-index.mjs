#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'

const REPO_ROOT = process.cwd()
const INDEX_PATH = 'docs/ai/repo-knowledge-index.json'
const SCHEMA_PATH = 'docs/ai/repo-knowledge-index.schema.json'
const WORKFLOW_PATH = 'docs/ai/specs/SPEC-012A-workflow.md'
const STATE_PATH = 'docs/ai/specs/autopilot-state.json'
const ROADMAP_PATH = 'docs/ai/rc-factory-technical-roadmap.md'
const REQUIRED_PATHS = [
  'AGENTS.md',
  'docs/rc-factory-v1-prd.md',
  ROADMAP_PATH,
  'docs/ai/specs/',
  WORKFLOW_PATH,
  STATE_PATH,
  'docs/qa/pilot-smoke-checklist.md',
  'docs/runbook/migration-rollback.md',
  'docs/ai/workflows/mission-control/workflow-contract.yaml',
]
const REQUIRED_ENTRY_FIELDS = [
  'path',
  'purpose',
  'owner',
  'freshness',
  'last_verified',
  'related_specs',
  'verification_commands',
]
const SPEC_ID_PATTERN = /^SPEC-[0-9]{3}[A-Z0-9]*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseArgs(argv) {
  const args = {
    fixture: null,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--fixture') {
      const fixture = argv[index + 1]
      if (!fixture) throw new Error('--fixture requires a path')
      args.fixture = fixture
      index += 1
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function printHelp() {
  console.log(`Usage: node scripts/spec-012a/verify-repo-knowledge-index.mjs [--json] [--fixture <dir>]

Validates ${INDEX_PATH} and ${SCHEMA_PATH}. Fixture mode loads fixture.json from
the fixture directory, mutates the real index in memory, and validates the
result without reading network, secrets, .envrc.local, LM Studio, or .gitnexus/.`)
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function repoPath(path) {
  return resolve(REPO_ROOT, path)
}

function insideRepo(absolutePath) {
  const rel = relative(REPO_ROOT, absolutePath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function readText(path) {
  return readFileSync(repoPath(path), 'utf8')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function addFinding(findings, level, code, message, fields = {}) {
  findings.push({
    level,
    code,
    message,
    ...fields,
  })
}

function loadJson(path, missingCode, malformedCode, findings) {
  const absolute = repoPath(path)
  if (!existsSync(absolute)) {
    addFinding(findings, 'error', missingCode, `${path} does not exist`, { path })
    return null
  }

  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    addFinding(findings, 'error', malformedCode, `${path} is not valid JSON: ${error.message}`, { path })
    return null
  }
}

function loadFixture(fixtureDir) {
  const fixturePath = join(fixtureDir, 'fixture.json')
  const absolute = repoPath(fixturePath)
  if (!existsSync(absolute)) {
    throw new Error(`Fixture file missing: ${fixturePath}`)
  }

  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    throw new Error(`Fixture file is not valid JSON: ${fixturePath}: ${error.message}`)
  }
}

function validateSchemaShape(schema, findings) {
  if (!isObject(schema)) {
    addFinding(findings, 'error', 'schema_invalid', `${SCHEMA_PATH} must be a JSON object`, { path: SCHEMA_PATH })
    return
  }

  const topRequired = Array.isArray(schema.required) ? schema.required : []
  for (const field of ['version', 'last_verified', 'entries']) {
    if (!topRequired.includes(field)) {
      addFinding(findings, 'error', 'schema_invalid', `${SCHEMA_PATH} must require ${field}`, { path: SCHEMA_PATH })
    }
  }

  const entryRequired = schema.$defs?.entry?.required
  if (!Array.isArray(entryRequired)) {
    addFinding(findings, 'error', 'schema_invalid', `${SCHEMA_PATH} must define required entry fields`, {
      path: SCHEMA_PATH,
    })
  } else {
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (!entryRequired.includes(field)) {
        addFinding(findings, 'error', 'schema_invalid', `${SCHEMA_PATH} entry schema must require ${field}`, {
          path: SCHEMA_PATH,
        })
      }
    }
  }

  const relatedSpecPattern = schema.$defs?.entry?.properties?.related_specs?.items?.pattern
  if (relatedSpecPattern !== '^SPEC-[0-9]{3}[A-Z0-9]*$') {
    addFinding(findings, 'error', 'schema_invalid', `${SCHEMA_PATH} must allow suffixed SPEC IDs`, {
      path: SCHEMA_PATH,
      details: { expected: '^SPEC-[0-9]{3}[A-Z0-9]*$', observed: relatedSpecPattern ?? null },
    })
  }
}

function applyFixtureMutations(index, fixture) {
  const mutated = clone(index)
  const mutations = Array.isArray(fixture.mutations) ? fixture.mutations : []

  for (const mutation of mutations) {
    if (!isObject(mutation)) continue
    const entries = Array.isArray(mutated.entries) ? mutated.entries : []

    if (mutation.type === 'remove_entry') {
      mutated.entries = entries.filter((entry) => entry?.path !== mutation.path)
    } else if (mutation.type === 'delete_field') {
      const entry = entries.find((candidate) => candidate?.path === mutation.path)
      if (entry) delete entry[mutation.field]
    } else if (mutation.type === 'set_field') {
      const entry = entries.find((candidate) => candidate?.path === mutation.path)
      if (entry) entry[mutation.field] = mutation.value
    } else if (mutation.type === 'append_link') {
      const entry = entries.find((candidate) => candidate?.path === mutation.path)
      if (entry) {
        if (!Array.isArray(entry.links)) entry.links = []
        entry.links.push(mutation.link)
      }
    }
  }

  return mutated
}

function validateIndex(index, findings) {
  if (!isObject(index)) {
    addFinding(findings, 'error', 'metadata_invalid', `${INDEX_PATH} must be a JSON object`, { path: INDEX_PATH })
    return
  }

  if (typeof index.version !== 'string' || index.version.trim() === '') {
    addFinding(findings, 'error', 'metadata_missing', `${INDEX_PATH} must include a non-empty version`, {
      path: INDEX_PATH,
    })
  }
  if (typeof index.last_verified !== 'string' || !DATE_PATTERN.test(index.last_verified)) {
    addFinding(findings, 'error', 'metadata_invalid', `${INDEX_PATH} last_verified must be YYYY-MM-DD`, {
      path: INDEX_PATH,
    })
  }
  if (!Array.isArray(index.entries)) {
    addFinding(findings, 'error', 'metadata_missing', `${INDEX_PATH} must include entries[]`, { path: INDEX_PATH })
    return
  }

  const entriesByPath = new Map()
  const duplicatePaths = new Set()
  for (const [entryIndex, entry] of index.entries.entries()) {
    if (!isObject(entry)) {
      addFinding(findings, 'error', 'metadata_invalid', `entries[${entryIndex}] must be an object`, {
        path: INDEX_PATH,
      })
      continue
    }
    if (typeof entry.path === 'string') {
      if (entriesByPath.has(entry.path)) duplicatePaths.add(entry.path)
      entriesByPath.set(entry.path, entry)
    }
  }

  for (const path of duplicatePaths) {
    addFinding(findings, 'error', 'metadata_invalid', `Duplicate index entry for ${path}`, {
      path: INDEX_PATH,
      entry_path: path,
    })
  }

  for (const requiredPath of REQUIRED_PATHS) {
    if (!entriesByPath.has(requiredPath)) {
      addFinding(findings, 'error', 'required_entry_missing', `Required discovery entry missing: ${requiredPath}`, {
        path: INDEX_PATH,
        entry_path: requiredPath,
      })
    }
  }

  for (const [entryIndex, entry] of index.entries.entries()) {
    if (!isObject(entry)) continue
    validateEntry(entry, entryIndex, findings)
  }

  validateStatusPointer(findings)
}

function validateEntry(entry, entryIndex, findings) {
  const label = typeof entry.path === 'string' && entry.path.trim() !== ''
    ? entry.path
    : `entries[${entryIndex}]`

  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (!(field in entry)) {
      addFinding(findings, 'error', 'metadata_missing', `${label} missing required field ${field}`, {
        path: INDEX_PATH,
        entry_path: label,
        details: { field },
      })
    }
  }

  if (typeof entry.path !== 'string' || entry.path.trim() === '') {
    addFinding(findings, 'error', 'metadata_invalid', `entries[${entryIndex}] path must be a non-empty string`, {
      path: INDEX_PATH,
    })
    return
  }
  if (typeof entry.purpose !== 'string' || entry.purpose.trim() === '') {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} purpose must be a non-empty string`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
  }
  if (typeof entry.owner !== 'string' || entry.owner.trim() === '') {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} owner must be a non-empty string`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
  }
  if (typeof entry.last_verified !== 'string' || !DATE_PATTERN.test(entry.last_verified)) {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} last_verified must be YYYY-MM-DD`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
  }

  validateFreshness(entry, findings)
  validateRelatedSpecs(entry, findings)
  validateVerificationCommands(entry, findings)
  validateEntryPath(entry, findings)
  validateLinks(entry, findings)
}

function validateFreshness(entry, findings) {
  if (!isObject(entry.freshness)) {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} freshness must be an object`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
    return
  }
  for (const field of ['cadence', 'trigger']) {
    if (typeof entry.freshness[field] !== 'string' || entry.freshness[field].trim() === '') {
      addFinding(findings, 'error', 'metadata_missing', `${entry.path} freshness.${field} must be non-empty`, {
        path: INDEX_PATH,
        entry_path: entry.path,
        details: { field: `freshness.${field}` },
      })
    }
  }
  if (
    'stale_after_days' in entry.freshness &&
    (!Number.isInteger(entry.freshness.stale_after_days) || entry.freshness.stale_after_days < 1)
  ) {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} freshness.stale_after_days must be positive`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
  }
}

function validateRelatedSpecs(entry, findings) {
  if (!Array.isArray(entry.related_specs)) {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} related_specs must be an array`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
    return
  }
  for (const specId of entry.related_specs) {
    if (typeof specId !== 'string' || !SPEC_ID_PATTERN.test(specId)) {
      addFinding(findings, 'error', 'related_spec_invalid', `${entry.path} has invalid related spec ${specId}`, {
        path: INDEX_PATH,
        entry_path: entry.path,
        details: { value: specId },
      })
    }
  }
}

function validateVerificationCommands(entry, findings) {
  if (!Array.isArray(entry.verification_commands) || entry.verification_commands.length === 0) {
    addFinding(findings, 'error', 'metadata_missing', `${entry.path} must include verification_commands`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
    return
  }
  for (const command of entry.verification_commands) {
    if (typeof command !== 'string' || command.trim() === '') {
      addFinding(findings, 'error', 'metadata_invalid', `${entry.path} verification_commands must be non-empty strings`, {
        path: INDEX_PATH,
        entry_path: entry.path,
      })
    }
  }
}

function validateEntryPath(entry, findings) {
  const absolute = repoPath(entry.path)
  const required = entry.required === true || REQUIRED_PATHS.includes(entry.path)
  if (!insideRepo(absolute)) {
    addFinding(findings, 'error', 'required_path_outside_repo', `${entry.path} resolves outside the repository`, {
      path: entry.path,
      entry_path: entry.path,
    })
    return
  }
  if (required && !existsSync(absolute)) {
    addFinding(findings, 'error', 'required_path_missing', `${entry.path} does not exist`, {
      path: entry.path,
      entry_path: entry.path,
    })
  }
}

function validateLinks(entry, findings) {
  if (!('links' in entry)) return
  if (!Array.isArray(entry.links)) {
    addFinding(findings, 'error', 'metadata_invalid', `${entry.path} links must be an array`, {
      path: INDEX_PATH,
      entry_path: entry.path,
    })
    return
  }

  for (const [index, link] of entry.links.entries()) {
    if (!isObject(link)) {
      addFinding(findings, 'error', 'metadata_invalid', `${entry.path} links[${index}] must be an object`, {
        path: INDEX_PATH,
        entry_path: entry.path,
      })
      continue
    }
    if (typeof link.target !== 'string' || link.target.trim() === '') {
      addFinding(findings, 'error', 'metadata_missing', `${entry.path} links[${index}].target is required`, {
        path: INDEX_PATH,
        entry_path: entry.path,
      })
      continue
    }

    validateLinkTarget(entry, link, findings)
  }
}

function validateLinkTarget(entry, link, findings) {
  const target = link.target.trim()
  if (/^https?:\/\//.test(target)) {
    addFinding(findings, 'warning', 'external_link_warning', `${entry.path} links to external URL ${target}`, {
      entry_path: entry.path,
      path: target,
    })
    return
  }
  if (/^\[\[.+\]\]$/.test(target)) {
    addFinding(findings, 'warning', 'wikilink_warning', `${entry.path} links to Obsidian wikilink ${target}`, {
      entry_path: entry.path,
      path: target,
    })
    return
  }

  const hashIndex = target.indexOf('#')
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex)
  if (pathPart === '') return

  const normalizedTarget = normalizeLinkPath(entry.path, pathPart)
  const absolute = repoPath(normalizedTarget)
  const required = link.required === true || link.repo_owned === true

  if (!insideRepo(absolute)) {
    const code = required ? 'required_path_outside_repo' : 'optional_link_warning'
    addFinding(findings, required ? 'error' : 'warning', code, `${entry.path} link escapes repository: ${target}`, {
      entry_path: entry.path,
      path: target,
      details: { resolved: normalizedTarget },
    })
    return
  }
  if (!existsSync(absolute)) {
    const code = required ? 'required_link_broken' : 'optional_link_warning'
    addFinding(findings, required ? 'error' : 'warning', code, `${entry.path} link target does not exist: ${target}`, {
      entry_path: entry.path,
      path: target,
      details: { resolved: normalizedTarget },
    })
  }
}

function normalizeLinkPath(entryPath, linkPath) {
  if (linkPath.startsWith('/')) return normalize(linkPath.slice(1))
  if (linkPath.startsWith('.')) return normalize(join(dirname(entryPath), linkPath))
  if (linkPath.includes('/')) return normalize(linkPath)
  return normalize(join(dirname(entryPath), linkPath))
}

function validateStatusPointer(findings, fixture = null) {
  const values = fixture?.status_pointer_override ?? readStatusPointerValues(findings)
  if (!values) return

  const roadmapStatus = values.roadmap_status?.trim()
  const workflowStatus = values.workflow_status?.trim()
  const stateWorkflowFile = values.state_workflow_file?.trim()
  const stateActiveStep = values.state_active_step?.trim()
  const expectedWorkflowStatus = roadmapStatus === 'Complete' ? 'Complete' : 'In Progress'

  if (
    !['In Progress', 'Complete'].includes(roadmapStatus) ||
    workflowStatus !== expectedWorkflowStatus ||
    stateWorkflowFile !== WORKFLOW_PATH ||
    (expectedWorkflowStatus === 'In Progress' && !stateActiveStep)
  ) {
    addFinding(
      findings,
      'error',
      'status_pointer_stale',
      'SPEC-012A roadmap, workflow, and autopilot state pointers disagree',
      {
        path: STATE_PATH,
        entry_path: STATE_PATH,
        details: {
          expected: {
            roadmap_status: roadmapStatus === 'Complete' ? 'Complete' : 'In Progress',
            workflow_status: expectedWorkflowStatus,
            state_workflow_file: WORKFLOW_PATH,
          },
          observed: values,
        },
      },
    )
  }
}

function readStatusPointerValues(findings) {
  try {
    const roadmap = readText(ROADMAP_PATH)
    const workflow = readText(WORKFLOW_PATH)
    const state = JSON.parse(readText(STATE_PATH))
    return {
      roadmap_status: parseRoadmapStatus(roadmap),
      workflow_status: parseWorkflowStatus(workflow),
      state_workflow_file: state.workflow_file,
      state_active_step: state.active_step,
    }
  } catch (error) {
    addFinding(findings, 'error', 'status_pointer_stale', `Unable to read SPEC-012A status pointers: ${error.message}`, {
      path: STATE_PATH,
      entry_path: STATE_PATH,
    })
    return null
  }
}

function parseRoadmapStatus(source) {
  const match = source.match(/^\| SPEC-012A \| [^|]* \| [^|]* \| [^|]* \| ([^|]+) \|/m)
  return match?.[1]?.trim() ?? null
}

function parseWorkflowStatus(source) {
  if (/^- \[ \] /m.test(source)) {
    return 'In Progress'
  }

  const overviewMatch = source.match(/## Workflow Overview([\s\S]*?)### Phase Gates/)
  const overview = overviewMatch?.[1] ?? source
  const rows = [...overview.matchAll(/^\| ([^|]+) \| `[^`]+` \| ([^|]+) \|/gm)]
  if (rows.some((row) => row[1].trim() === 'Implement' && row[2].trim() === 'Complete')) {
    return 'Complete'
  }
  if (rows.some((row) => ['Complete', 'In Progress'].includes(row[2].trim()))) {
    return 'In Progress'
  }
  return 'Pending'
}

function verifyFixtureExpectations(fixture, findings) {
  const expected = fixture?.expected
  if (!isObject(expected)) return { ok: true, messages: [] }

  const messages = []
  const codes = new Set(findings.map((finding) => finding.code))
  for (const code of expected.codes ?? []) {
    if (!codes.has(code)) {
      messages.push(`Expected fixture code not emitted: ${code}`)
    }
  }

  const validationExit = findings.some((finding) => finding.level === 'error') ? 1 : 0
  if (typeof expected.exitCode === 'number' && expected.exitCode !== validationExit) {
    messages.push(`Expected fixture exit ${expected.exitCode}, observed ${validationExit}`)
  }

  return { ok: messages.length === 0, messages }
}

function renderText(findings, fixtureResult) {
  for (const finding of findings) {
    const scope = finding.entry_path || finding.path || INDEX_PATH
    console.log(`[${finding.level}] ${finding.code} ${scope}: ${finding.message}`)
  }
  for (const message of fixtureResult.messages) {
    console.error(`[fixture] ${message}`)
  }

  const errors = findings.filter((finding) => finding.level === 'error').length
  const warnings = findings.filter((finding) => finding.level === 'warning').length
  if (errors === 0) {
    console.log(`[repo-knowledge-index] passed with ${warnings} warning(s)`)
  } else {
    console.error(`[repo-knowledge-index] failed with ${errors} error(s) and ${warnings} warning(s)`)
  }
}

function renderJson(findings, fixtureResult, fixture) {
  const errors = findings.filter((finding) => finding.level === 'error').length
  const warnings = findings.filter((finding) => finding.level === 'warning').length
  console.log(JSON.stringify({
    ok: errors === 0 && fixtureResult.ok,
    fixture: fixture?.description ?? null,
    summary: { errors, warnings },
    findings,
    fixture_expectations: fixtureResult,
  }, null, 2))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const findings = []
  const schema = loadJson(SCHEMA_PATH, 'schema_missing', 'schema_invalid', findings)
  const baseIndex = loadJson(INDEX_PATH, 'index_missing', 'json_malformed', findings)
  const fixture = args.fixture ? loadFixture(args.fixture) : null

  if (schema) validateSchemaShape(schema, findings)
  if (baseIndex) {
    const index = fixture ? applyFixtureMutations(baseIndex, fixture) : baseIndex
    validateIndex(index, findings)
    if (fixture?.status_pointer_override) validateStatusPointer(findings, fixture)
  }

  const fixtureResult = verifyFixtureExpectations(fixture, findings)
  if (args.json) renderJson(findings, fixtureResult, fixture)
  else renderText(findings, fixtureResult)

  const hasErrors = findings.some((finding) => finding.level === 'error')
  process.exit(hasErrors || !fixtureResult.ok ? 1 : 0)
}

try {
  main()
} catch (error) {
  console.error(`[repo-knowledge-index] ${error.stack || error.message}`)
  process.exit(1)
}
