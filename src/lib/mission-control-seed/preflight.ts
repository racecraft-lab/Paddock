import { existsSync, readFileSync } from 'node:fs'
import { loadWorkflowContractFromFile } from '@/lib/workflow-contracts/yaml-loader'
import { collectRedactedFieldNames, redactEvidenceValue } from './redaction'
import {
  CLEANUP_CHECKLIST_PATH,
  MISSION_CONTROL_REPO,
  REQUIRED_WORKFLOW_SLUGS,
  type ContractNotReadyResult,
  type MissionControlSeedOptions,
  type PreflightResult,
  type RedactionProof,
  type ResidueSummary,
} from './types'
import type Database from 'better-sqlite3'

export function assertWorkflowContractReady(contractPath: string): {
  requiredSlugsPresent: true
  missingSlugs: []
} {
  const contract = loadWorkflowContractFromFile(contractPath)
  const slugs = new Set(contract.templates.map((template) => template.slug))
  const missingSlugs = REQUIRED_WORKFLOW_SLUGS.filter((slug) => !slugs.has(slug))
  if (missingSlugs.length > 0) {
    const error = new Error(`Workflow contract missing required Mission Control slugs: ${missingSlugs.join(', ')}`)
    Object.assign(error, { missingSlugs })
    throw error
  }
  const staleRepo = contract.templates.find((template) => template.tracker?.repo && template.tracker.repo !== MISSION_CONTROL_REPO)
  if (staleRepo) {
    const error = new Error(`Workflow contract has stale tracker repo ${staleRepo.tracker?.repo ?? 'unknown'}`)
    Object.assign(error, { missingSlugs: [] })
    throw error
  }
  return { requiredSlugsPresent: true, missingSlugs: [] }
}

export function runMissionControlPreflight(
  db: Database.Database,
  options: MissionControlSeedOptions,
  mode: 'preflight' | 'apply' = 'preflight',
): PreflightResult {
  try {
    assertWorkflowContractReady(options.contractPath)
  } catch (error) {
    return contractNotReady(options.contractPath, error)
  }

  const residue = [
    ...scanProjectResidue(db),
    ...scanTaskResidue(db),
    ...scanOperatorEvidenceResidue(options.operatorEvidencePath),
  ]

  if (residue.length > 0) {
    return {
      ok: false,
      mode,
      status: 'blocked_preflight',
      code: 'NON_MISSION_CONTROL_RESIDUE',
      mutation_status: 'not_mutated',
      residue,
      cleanup_checklist: CLEANUP_CHECKLIST_PATH,
      redaction: redactionProof(options.operatorEvidencePath),
    }
  }

  return {
    ok: true,
    mode: 'preflight',
    status: 'ready',
    mutation_status: 'not_mutated',
    residue: [],
    required_slugs_present: true,
  }
}

function contractNotReady(contractPath: string, error: unknown): ContractNotReadyResult {
  const missing = error && typeof error === 'object' && 'missingSlugs' in error
    ? (error as { missingSlugs?: unknown }).missingSlugs
    : []
  return {
    ok: false,
    mode: 'preflight',
    status: 'contract_not_ready',
    code: 'WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING',
    mutation_status: 'not_mutated',
    missing_slugs: Array.isArray(missing) ? missing.map(String) : [],
    source_path: contractPath,
  }
}

function scanProjectResidue(db: Database.Database): ResidueSummary[] {
  const rows = db.prepare(`
    SELECT id, github_repo
    FROM projects
    WHERE github_repo IS NOT NULL
      AND github_repo <> ?
      AND COALESCE(github_sync_enabled, 0) = 1
    ORDER BY github_repo ASC, id ASC
  `).all(MISSION_CONTROL_REPO) as { id: number; github_repo: string }[]
  return groupRepoRows(rows, 'project_github_sync', 'project_ids')
}

function scanTaskResidue(db: Database.Database): ResidueSummary[] {
  const rows = db.prepare(`
    SELECT id, github_repo
    FROM tasks
    WHERE github_repo IS NOT NULL
      AND github_repo <> ?
      AND github_issue_number IS NOT NULL
    ORDER BY github_repo ASC, id ASC
  `).all(MISSION_CONTROL_REPO) as { id: number; github_repo: string }[]
  return groupRepoRows(rows, 'task_github_sync', 'task_ids')
}

function groupRepoRows(
  rows: { id: number; github_repo: string }[],
  kind: 'project_github_sync' | 'task_github_sync',
  idField: 'project_ids' | 'task_ids',
): ResidueSummary[] {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const ids = groups.get(row.github_repo) ?? []
    ids.push(row.id)
    groups.set(row.github_repo, ids)
  }
  return [...groups.entries()].map(([repo, ids]) => ({
    kind,
    repo,
    count: ids.length,
    [idField]: ids,
  }))
}

function scanOperatorEvidenceResidue(path: string | undefined): ResidueSummary[] {
  if (!path || !existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const redacted = redactEvidenceValue(parsed)
  const text = JSON.stringify(redacted).toLowerCase()
  const residue: ResidueSummary[] = []
  if (text.includes('cron') && text.includes('focusengine')) {
    residue.push({ kind: 'operator_cron', repo: 'racecraft-lab/focusengine', count: 1, identifiers: redacted })
  }
  if (text.includes('openclaw') && text.includes('focusengine')) {
    residue.push({ kind: 'openclaw_gateway_agent', repo: 'racecraft-lab/focusengine', count: 1, identifiers: redacted })
  }
  if (text.includes('focusengine')) {
    residue.push({ kind: 'focusengine_operator_residue', repo: 'racecraft-lab/focusengine', count: 1, identifiers: redacted })
  }
  return residue
}

function redactionProof(path: string | undefined): RedactionProof {
  if (!path || !existsSync(path)) return { raw_secret_values_emitted: false, redacted_fields: [] }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  return {
    raw_secret_values_emitted: false,
    redacted_fields: [...new Set(collectRedactedFieldNames(parsed))].sort(),
  }
}
