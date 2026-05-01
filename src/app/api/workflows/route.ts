import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { validateBody, createWorkflowSchema, updateWorkflowSchema } from '@/lib/validation'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { scanAndLogInjection } from '@/lib/injection-guard'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
  type AcceptedWorkspaceScope,
} from '@/lib/workspaces'
import type { JsonObject, WorkflowRoutingRule } from '@/types/workflow-template'

export interface WorkflowTemplate {
  id: number
  name: string
  description: string | null
  model: string
  task_prompt: string
  timeout_seconds: number
  agent_role: string | null
  tags: string | null
  created_by: string
  created_at: number
  updated_at: number
  last_used_at: number | null
  use_count: number
  workspace_id: number
  slug: string | null
  output_schema: string | JsonObject | null
  routing_rules: string | WorkflowRoutingRule[] | null
  next_template_slug: string | null
  produces_pr: number | boolean
  external_terminal_event: string | null
  allow_redacted_artifacts: number | boolean
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function serializeJsonField(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value)
}

function serializeRoutingRules(value: WorkflowRoutingRule[] | undefined): string {
  return JSON.stringify(value ?? [])
}

function templateResponse(template: WorkflowTemplate) {
  return {
    ...template,
    tags: parseJsonField<string[]>(template.tags, []),
    output_schema: parseJsonField<JsonObject | null>(template.output_schema, null),
    routing_rules: parseJsonField<WorkflowRoutingRule[]>(template.routing_rules, []),
    produces_pr: Boolean(template.produces_pr),
    allow_redacted_artifacts: Boolean(template.allow_redacted_artifacts),
  }
}

function requireProductLineScope(scope: AcceptedWorkspaceScope): number | NextResponse {
  if (scope.kind !== 'productLine' || scope.workspaceId == null) {
    return NextResponse.json({ error: 'Product Line scope is required for workflow template mutations' }, { status: 400 })
  }
  return scope.workspaceId
}

/**
 * GET /api/workflows - List all workflow templates
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(scope)
    const templates = db
      .prepare(`SELECT * FROM workflow_templates WHERE ${workspaceFilter.sql} ORDER BY use_count DESC, updated_at DESC`)
      .all(...workspaceFilter.params) as WorkflowTemplate[]

    return NextResponse.json({ templates: templates.map(templateResponse) })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/workflows error')
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

/**
 * POST /api/workflows - Create a new workflow template
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const result = await validateBody(request.clone(), createWorkflowSchema)
    if ('error' in result) return result.error
    const {
      name,
      description,
      model,
      task_prompt,
      timeout_seconds,
      agent_role,
      tags,
      slug,
      output_schema,
      routing_rules,
      next_template_slug,
      produces_pr,
      external_terminal_event,
      allow_redacted_artifacts,
    } = result.data

    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceId = requireProductLineScope(scope)
    if (workspaceId instanceof NextResponse) return workspaceId

    // Scan task_prompt for injection — this gets sent directly to AI agents
    const injectionReport = scanAndLogInjection(
      task_prompt,
      { context: 'prompt' },
      { source: 'api.workflows', workspaceId }
    )
    if (!injectionReport.safe) {
      const criticals = injectionReport.matches.filter(m => m.severity === 'critical')
      if (criticals.length > 0) {
        logger.warn({ name, rules: criticals.map(m => m.rule) }, 'Blocked workflow: injection detected in task_prompt')
        return NextResponse.json(
          { error: 'Task prompt blocked: potentially unsafe content detected', injection: criticals.map(m => ({ rule: m.rule, description: m.description })) },
          { status: 422 }
        )
      }
    }

    const user = auth.user

    const insertResult = db.prepare(`
      INSERT INTO workflow_templates (
        name, description, model, task_prompt, timeout_seconds, agent_role, tags, created_by, workspace_id,
        slug, output_schema, routing_rules, next_template_slug, produces_pr, external_terminal_event, allow_redacted_artifacts
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || null,
      model,
      task_prompt,
      timeout_seconds,
      agent_role || null,
      JSON.stringify(tags),
      user?.username || 'system',
      workspaceId,
      slug,
      serializeJsonField(output_schema),
      serializeRoutingRules(routing_rules),
      next_template_slug,
      produces_pr ? 1 : 0,
      external_terminal_event,
      allow_redacted_artifacts ? 1 : 0
    )

    const template = db
      .prepare('SELECT * FROM workflow_templates WHERE id = ? AND workspace_id = ?')
      .get(insertResult.lastInsertRowid, workspaceId) as WorkflowTemplate

    db_helpers.logActivity(
      'workflow_created',
      'workflow',
      Number(insertResult.lastInsertRowid),
      user?.username || 'system',
      `Created workflow template: ${name}`,
      undefined,
      workspaceId
    )

    return NextResponse.json({
      template: templateResponse(template)
    }, { status: 201 })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/workflows error')
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

/**
 * PUT /api/workflows - Update a workflow template
 */
export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const result = await validateBody(request.clone(), updateWorkflowSchema)
    if ('error' in result) return result.error
    const { id, ...updates } = result.data
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceId = requireProductLineScope(scope)
    if (workspaceId instanceof NextResponse) return workspaceId

    const existing = db
      .prepare('SELECT * FROM workflow_templates WHERE id = ? AND workspace_id = ?')
      .get(id, workspaceId) as WorkflowTemplate
    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const fields: string[] = []
    const params: any[] = []

    if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name) }
    if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description) }
    if (updates.model !== undefined) { fields.push('model = ?'); params.push(updates.model) }
    if (updates.task_prompt !== undefined) { fields.push('task_prompt = ?'); params.push(updates.task_prompt) }
    if (updates.timeout_seconds !== undefined) { fields.push('timeout_seconds = ?'); params.push(updates.timeout_seconds) }
    if (updates.agent_role !== undefined) { fields.push('agent_role = ?'); params.push(updates.agent_role) }
    if (updates.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(updates.tags)) }
    if (updates.slug !== undefined) { fields.push('slug = ?'); params.push(updates.slug) }
    if (updates.output_schema !== undefined) { fields.push('output_schema = ?'); params.push(serializeJsonField(updates.output_schema)) }
    if (updates.routing_rules !== undefined) { fields.push('routing_rules = ?'); params.push(serializeRoutingRules(updates.routing_rules)) }
    if (updates.next_template_slug !== undefined) { fields.push('next_template_slug = ?'); params.push(updates.next_template_slug) }
    if (updates.produces_pr !== undefined) { fields.push('produces_pr = ?'); params.push(updates.produces_pr ? 1 : 0) }
    if (updates.external_terminal_event !== undefined) { fields.push('external_terminal_event = ?'); params.push(updates.external_terminal_event) }
    if (updates.allow_redacted_artifacts !== undefined) { fields.push('allow_redacted_artifacts = ?'); params.push(updates.allow_redacted_artifacts ? 1 : 0) }

    // No explicit field updates = usage tracking call (from orchestration bar)
    if (fields.length === 0) {
      fields.push('use_count = use_count + 1')
      fields.push('last_used_at = ?')
      params.push(Math.floor(Date.now() / 1000))
    }

    fields.push('updated_at = ?')
    params.push(Math.floor(Date.now() / 1000))
    params.push(id, workspaceId)

    db.prepare(`UPDATE workflow_templates SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params)

    const updated = db
      .prepare('SELECT * FROM workflow_templates WHERE id = ? AND workspace_id = ?')
      .get(id, workspaceId) as WorkflowTemplate
    return NextResponse.json({ template: templateResponse(updated) })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'PUT /api/workflows error')
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

/**
 * DELETE /api/workflows - Delete a workflow template
 */
export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const scope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceId = requireProductLineScope(scope)
    if (workspaceId instanceof NextResponse) return workspaceId

    const queryId = request.nextUrl.searchParams.get('id')
    let bodyId: unknown
    try {
      const body = await request.json() as { id?: unknown }
      bodyId = body.id
    } catch {
      bodyId = undefined
    }
    const id = queryId ?? bodyId

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const result = db.prepare('DELETE FROM workflow_templates WHERE id = ? AND workspace_id = ?').run(parseInt(String(id), 10), workspaceId)
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'DELETE /api/workflows error')
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
