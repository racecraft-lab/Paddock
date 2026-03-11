import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import {
  ensureTenantWorkspaceAccess,
  ForbiddenError
} from '@/lib/workspaces'

function toProjectId(raw: string): number {
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) ? id : NaN
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const tenantId = auth.user.tenant_id ?? 1
    const forwardedFor = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null
    ensureTenantWorkspaceAccess(db, tenantId, workspaceId, {
      actor: auth.user.username,
      actorId: auth.user.id,
      route: '/api/projects/[id]/agents',
      ipAddress: forwardedFor,
      userAgent: request.headers.get('user-agent'),
    })
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND p.workspace_id = ? AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, workspaceId, tenantId)
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Verify project belongs to workspace
    const project = db.prepare(`SELECT id FROM projects WHERE id = ? AND workspace_id = ?`).get(projectId, workspaceId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const assignments = db.prepare(`
      SELECT id, project_id, agent_name, role, assigned_at
      FROM project_agent_assignments
      WHERE project_id = ?
      ORDER BY assigned_at ASC
    `).all(projectId)

    return NextResponse.json({ assignments })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'GET /api/projects/[id]/agents error')
    return NextResponse.json({ error: 'Failed to fetch agent assignments' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const tenantId = auth.user.tenant_id ?? 1
    const forwardedFor = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null
    ensureTenantWorkspaceAccess(db, tenantId, workspaceId, {
      actor: auth.user.username,
      actorId: auth.user.id,
      route: '/api/projects/[id]/agents',
      ipAddress: forwardedFor,
      userAgent: request.headers.get('user-agent'),
    })
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND p.workspace_id = ? AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, workspaceId, tenantId)
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const project = db.prepare(`SELECT id FROM projects WHERE id = ? AND workspace_id = ?`).get(projectId, workspaceId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const body = await request.json()
    const agentName = String(body?.agent_name || '').trim()
    const role = String(body?.role || 'member').trim()

    if (!agentName) return NextResponse.json({ error: 'agent_name is required' }, { status: 400 })

    db.prepare(`
      INSERT OR IGNORE INTO project_agent_assignments (project_id, agent_name, role)
      VALUES (?, ?, ?)
    `).run(projectId, agentName, role)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'POST /api/projects/[id]/agents error')
    return NextResponse.json({ error: 'Failed to assign agent' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const tenantId = auth.user.tenant_id ?? 1
    const forwardedFor = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null
    ensureTenantWorkspaceAccess(db, tenantId, workspaceId, {
      actor: auth.user.username,
      actorId: auth.user.id,
      route: '/api/projects/[id]/agents',
      ipAddress: forwardedFor,
      userAgent: request.headers.get('user-agent'),
    })
    const { id } = await params
    const projectId = toProjectId(id)
    if (Number.isNaN(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    const projectScope = db.prepare(`
      SELECT p.id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND p.workspace_id = ? AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, workspaceId, tenantId)
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const project = db.prepare(`SELECT id FROM projects WHERE id = ? AND workspace_id = ?`).get(projectId, workspaceId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const agentName = new URL(request.url).searchParams.get('agent_name')
    if (!agentName) return NextResponse.json({ error: 'agent_name query parameter is required' }, { status: 400 })

    db.prepare(`
      DELETE FROM project_agent_assignments
      WHERE project_id = ? AND agent_name = ?
    `).run(projectId, agentName)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'DELETE /api/projects/[id]/agents error')
    return NextResponse.json({ error: 'Failed to unassign agent' }, { status: 500 })
  }
}
