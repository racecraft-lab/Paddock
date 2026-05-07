import { createWorkflowContractRun, recordWorkflowContractErrors } from './diagnostics.ts'
import { diffWorkflowTemplates, isRuntimeTemplateEnabled, isWorkflowContractOwned } from './diff.ts'
import { workflowContractError } from './errors.ts'
import { computeContractHash } from './hash.ts'
import { validateWorkflowContract } from './validator.ts'
import type { RuntimeWorkflowTemplate, WorkflowContract, WorkflowContractError, WorkflowContractImportOptions, WorkflowContractImportResult, WorkflowContractTemplate } from './types.ts'
import type Database from 'better-sqlite3'

export function importWorkflowContract(
  db: Database.Database,
  contract: WorkflowContract,
  options: WorkflowContractImportOptions
): WorkflowContractImportResult {
  const validation = validateWorkflowContract(contract)
  const contractHash = computeContractHash(contract)
  if (!validation.ok) {
    const runId = createWorkflowContractRun(db, {
      family: contract.family,
      workspaceId: contract.workspace_id,
      mode: options.mode === 'apply' ? 'import_apply' : 'import_dry_run',
      status: 'validation_failed',
      mutationStatus: 'not_mutated',
      ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
      contractHash,
      errorCount: validation.errors.length,
    })
    recordWorkflowContractErrors(db, runId, validation.errors)
    return {
      ok: false,
      mode: options.mode === 'apply' ? 'import_apply' : 'import_dry_run',
      status: 'validation_failed',
      mutation_status: 'not_mutated',
      run_id: runId,
      contract_hash: contractHash,
      errors: validation.errors,
    }
  }

  const runtimeTemplates = selectRuntimeTemplates(db, contract.workspace_id)
  const ownershipErrors = findOwnershipConflicts(contract, runtimeTemplates)
  if (ownershipErrors.length > 0) {
    const runId = createWorkflowContractRun(db, {
      family: contract.family,
      workspaceId: contract.workspace_id,
      mode: options.mode === 'apply' ? 'import_apply' : 'import_dry_run',
      status: 'validation_failed',
      mutationStatus: 'not_mutated',
      ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
      contractHash,
      errorCount: ownershipErrors.length,
    })
    recordWorkflowContractErrors(db, runId, ownershipErrors)
    return {
      ok: false,
      mode: options.mode === 'apply' ? 'import_apply' : 'import_dry_run',
      status: 'validation_failed',
      mutation_status: 'not_mutated',
      run_id: runId,
      contract_hash: contractHash,
      errors: ownershipErrors,
    }
  }
  const diff = diffWorkflowTemplates(contract, runtimeTemplates)
  if (options.mode === 'dry-run') {
    const runId = createWorkflowContractRun(db, {
      family: contract.family,
      workspaceId: contract.workspace_id,
      mode: 'import_dry_run',
      status: 'success',
      mutationStatus: 'dry_run',
      ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
      contractHash,
      diff,
    })
    return { ok: true, mode: 'import_dry_run', status: 'success', mutation_status: 'dry_run', run_id: runId, contract_hash: contractHash, diff }
  }

  const apply = db.transaction(() => {
    for (const template of [...diff.create, ...diff.update]) {
      upsertTemplate(db, contract.workspace_id, template)
    }
    for (const template of diff.disable) {
      if (template.slug) {
        db.prepare('UPDATE workflow_templates SET enabled = 0, updated_at = unixepoch() WHERE workspace_id = ? AND slug = ?')
          .run(contract.workspace_id, template.slug)
      }
    }
    const runtimeJson = JSON.stringify(selectOwnedRuntimeTemplates(db, contract.workspace_id, contract.templates.map(template => template.slug)))
    const recoveryCommand = `pnpm workflow-contract recover --workspace-id ${String(contract.workspace_id)} --apply`
    const snapshotResult = db.prepare(`
      INSERT INTO workflow_contract_snapshots (family, workspace_id, contract_hash, canonical_json, runtime_templates_json, recovery_command)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(contract.family, contract.workspace_id, contractHash, JSON.stringify(contract), runtimeJson, recoveryCommand)
    const runId = createWorkflowContractRun(db, {
      family: contract.family,
      workspaceId: contract.workspace_id,
      mode: 'import_apply',
      status: 'success',
      mutationStatus: 'applied',
      ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
      contractHash,
      diff,
      lkgSnapshotId: Number(snapshotResult.lastInsertRowid),
      recoveryCommand,
    })
    return { runId }
  })()

  return { ok: true, mode: 'import_apply', status: 'success', mutation_status: 'applied', run_id: apply.runId, contract_hash: contractHash, diff }
}

export function selectRuntimeTemplates(db: Database.Database, workspaceId: number): RuntimeWorkflowTemplate[] {
  return db.prepare('SELECT * FROM workflow_templates WHERE workspace_id = ? ORDER BY slug ASC, id ASC').all(workspaceId) as RuntimeWorkflowTemplate[]
}

export function selectOwnedRuntimeTemplates(db: Database.Database, workspaceId: number, slugs: string[] = []): RuntimeWorkflowTemplate[] {
  const currentSlugs = new Set(slugs)
  return selectRuntimeTemplates(db, workspaceId).filter(row => {
    if (!row.slug) return false
    if (!isWorkflowContractOwned(row) || !isRuntimeTemplateEnabled(row)) return false
    return slugs.length > 0 ? currentSlugs.has(row.slug) : true
  })
}

export function upsertTemplate(db: Database.Database, workspaceId: number, template: WorkflowContractTemplate): void {
  const existing = db.prepare('SELECT id, created_by FROM workflow_templates WHERE workspace_id = ? AND slug = ?').get(workspaceId, template.slug) as { id: number; created_by?: string | null } | undefined
  const params = [
    template.name,
    template.description ?? null,
    template.model,
    template.task_prompt,
    template.timeout_seconds,
    template.agent_role ?? null,
    JSON.stringify(template.tags ?? []),
    JSON.stringify(template.output_schema ?? null),
    JSON.stringify(template.routing_rules ?? []),
    template.next_template_slug ?? null,
    template.produces_pr ? 1 : 0,
    template.external_terminal_event ?? null,
    template.allow_redacted_artifacts ? 1 : 0,
  ]
  if (existing) {
    if (existing.created_by !== 'workflow-contract') {
      throw new Error(`Refusing to overwrite non-workflow-contract template slug ${template.slug}`)
    }
    db.prepare(`
      UPDATE workflow_templates SET
        name = ?, description = ?, model = ?, task_prompt = ?, timeout_seconds = ?, agent_role = ?,
        tags = ?, output_schema = ?, routing_rules = ?, next_template_slug = ?, produces_pr = ?,
        external_terminal_event = ?, allow_redacted_artifacts = ?, enabled = 1, created_by = 'workflow-contract', updated_at = unixepoch()
      WHERE id = ?
    `).run(...params, existing.id)
  } else {
    db.prepare(`
      INSERT INTO workflow_templates (
        name, description, model, task_prompt, timeout_seconds, agent_role, tags, output_schema,
        routing_rules, next_template_slug, produces_pr, external_terminal_event, allow_redacted_artifacts,
        workspace_id, slug, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...params, workspaceId, template.slug, 'workflow-contract')
  }
}

function findOwnershipConflicts(contract: WorkflowContract, runtimeTemplates: RuntimeWorkflowTemplate[]): WorkflowContractError[] {
  const bySlug = new Map<string, RuntimeWorkflowTemplate>()
  for (const row of runtimeTemplates) {
    if (row.workspace_id === contract.workspace_id && row.slug) bySlug.set(row.slug, row)
  }
  const errors: WorkflowContractError[] = []
  for (const [index, template] of contract.templates.entries()) {
    const existing = bySlug.get(template.slug)
    if (existing && !isWorkflowContractOwned(existing)) {
      errors.push(workflowContractError('WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT', 'Workflow contract slug collides with a manual template', {
        canonical_model_path: `templates[${String(index)}].slug`,
        template_slug: template.slug,
        details: `Existing runtime template ${template.slug} is owned by ${existing.created_by ?? 'unknown'}.`,
        remediation_hint: 'Rename the contract template slug or manually migrate the runtime template ownership before applying.',
      }))
    }
  }
  return errors
}
