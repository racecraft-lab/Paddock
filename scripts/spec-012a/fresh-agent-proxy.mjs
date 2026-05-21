#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const REPO_ROOT = process.cwd()
const AGENTS_PATH = 'AGENTS.md'
const INDEX_PATH = 'docs/ai/repo-knowledge-index.json'
const REQUIRED_PATHS = [
  'AGENTS.md',
  'docs/rc-factory-v1-prd.md',
  'docs/ai/rc-factory-technical-roadmap.md',
  'docs/ai/specs/',
  'docs/ai/specs/SPEC-012A-workflow.md',
  'docs/ai/specs/autopilot-state.json',
  'docs/qa/pilot-smoke-checklist.md',
  'docs/runbook/migration-rollback.md',
  'docs/ai/workflows/mission-control/workflow-contract.yaml',
]
const GITNEXUS_MARKERS = [
  'direnv exec . gitnexus analyze --embeddings --skip-agents-md',
  '.envrc.local',
  '.gitnexus/',
]

function parseArgs(argv) {
  const args = { json: false }
  for (const arg of argv) {
    if (arg === '--json') args.json = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function repoPath(path) {
  return resolve(REPO_ROOT, path)
}

function insideRepo(absolutePath) {
  const rel = relative(REPO_ROOT, absolutePath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function read(path) {
  return readFileSync(repoPath(path), 'utf8')
}

function addFinding(findings, level, code, message, fields = {}) {
  findings.push({ level, code, message, ...fields })
}

function loadJson(path, findings) {
  if (!existsSync(repoPath(path))) {
    addFinding(findings, 'error', 'required_path_missing', `${path} does not exist`, { path })
    return null
  }
  try {
    return JSON.parse(read(path))
  } catch (error) {
    addFinding(findings, 'error', 'json_malformed', `${path} is not valid JSON: ${error.message}`, { path })
    return null
  }
}

function extractRepoKnowledgeMap(source) {
  const match = source.match(/^## Repo Knowledge Map\s*\n([\s\S]*?)(?=^## |\s*$)/m)
  return match?.[1] ?? null
}

function validateStartsFromAgents(findings) {
  if (!existsSync(repoPath(AGENTS_PATH))) {
    addFinding(findings, 'error', 'required_path_missing', `${AGENTS_PATH} does not exist`, { path: AGENTS_PATH })
    return null
  }

  const agents = read(AGENTS_PATH)
  const map = extractRepoKnowledgeMap(agents)
  if (!map) {
    addFinding(findings, 'error', 'metadata_missing', `${AGENTS_PATH} must include a Repo Knowledge Map section`, {
      path: AGENTS_PATH,
    })
    return null
  }
  if (!map.includes(INDEX_PATH)) {
    addFinding(findings, 'error', 'required_entry_missing', `Repo Knowledge Map must point to ${INDEX_PATH}`, {
      path: AGENTS_PATH,
      entry_path: INDEX_PATH,
    })
    return null
  }

  return { agents, map, indexPath: INDEX_PATH }
}

function validateIndexResolution(index, findings) {
  if (!index || !Array.isArray(index.entries)) {
    addFinding(findings, 'error', 'metadata_invalid', `${INDEX_PATH} must include entries[]`, { path: INDEX_PATH })
    return null
  }

  const entriesByPath = new Map(index.entries.map((entry) => [entry?.path, entry]))
  for (const requiredPath of REQUIRED_PATHS) {
    const entry = entriesByPath.get(requiredPath)
    if (!entry) {
      addFinding(findings, 'error', 'required_entry_missing', `Fresh-agent proxy could not resolve ${requiredPath} through the index`, {
        path: INDEX_PATH,
        entry_path: requiredPath,
      })
      continue
    }

    const absolute = repoPath(entry.path)
    if (!insideRepo(absolute)) {
      addFinding(findings, 'error', 'required_path_outside_repo', `${entry.path} resolves outside the repository`, {
        path: entry.path,
        entry_path: entry.path,
      })
    } else if (!existsSync(absolute)) {
      addFinding(findings, 'error', 'required_path_missing', `${entry.path} does not exist`, {
        path: entry.path,
        entry_path: entry.path,
      })
    }
  }

  for (const entry of index.entries) {
    if (typeof entry?.path === 'string' && entry.path.startsWith('.gitnexus')) {
      addFinding(findings, 'error', 'metadata_invalid', 'Generated .gitnexus output must not be an indexed source of truth', {
        path: INDEX_PATH,
        entry_path: entry.path,
      })
    }
  }

  return entriesByPath
}

function validateGitNexusDiscovery(entriesByPath, findings) {
  const agentsEntry = entriesByPath?.get(AGENTS_PATH)
  if (!agentsEntry) return

  const guidance = read(agentsEntry.path)
  for (const marker of GITNEXUS_MARKERS) {
    if (!guidance.includes(marker)) {
      addFinding(findings, 'error', 'required_entry_missing', `GitNexus guidance is missing marker: ${marker}`, {
        path: agentsEntry.path,
        entry_path: agentsEntry.path,
        details: { marker },
      })
    }
  }
}

function renderText(findings, resolvedPaths) {
  for (const finding of findings) {
    const scope = finding.entry_path || finding.path || INDEX_PATH
    console.log(`[${finding.level}] ${finding.code} ${scope}: ${finding.message}`)
  }

  const errors = findings.filter((finding) => finding.level === 'error').length
  if (errors === 0) {
    console.log(`[fresh-agent-proxy] resolved ${resolvedPaths} required target(s) from ${AGENTS_PATH} through ${INDEX_PATH}`)
  } else {
    console.error(`[fresh-agent-proxy] failed with ${errors} error(s)`)
  }
}

function renderJson(findings, resolvedPaths) {
  const errors = findings.filter((finding) => finding.level === 'error').length
  console.log(JSON.stringify({
    ok: errors === 0,
    resolved_required_targets: resolvedPaths,
    findings,
  }, null, 2))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const findings = []
  const start = validateStartsFromAgents(findings)
  const index = start ? loadJson(start.indexPath, findings) : null
  const entriesByPath = validateIndexResolution(index, findings)
  validateGitNexusDiscovery(entriesByPath, findings)

  const resolvedPaths = REQUIRED_PATHS.filter((path) => entriesByPath?.has(path)).length
  if (args.json) renderJson(findings, resolvedPaths)
  else renderText(findings, resolvedPaths)

  process.exit(findings.some((finding) => finding.level === 'error') ? 1 : 0)
}

try {
  main()
} catch (error) {
  console.error(`[fresh-agent-proxy] ${error.stack || error.message}`)
  process.exit(1)
}
