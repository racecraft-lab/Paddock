import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function normalizePrefix(input: string): string {
  const normalized = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.slice(0, 12)
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === '1'

    const projects = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status, created_at, updated_at
      FROM projects
      WHERE workspace_id = ?
        ${includeArchived ? '' : "AND status = 'active'"}
      ORDER BY name COLLATE NOCASE ASC
    `).all(workspaceId)

    return NextResponse.json({ projects })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/projects error')
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const body = await request.json()

    const name = String(body?.name || '').trim()
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const prefixInput = String(body?.ticket_prefix || body?.ticketPrefix || '').trim()
    const slugInput = String(body?.slug || '').trim()

    if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

    const slug = slugInput ? slugify(slugInput) : slugify(name)
    const ticketPrefix = normalizePrefix(prefixInput || name.slice(0, 5))
    if (!slug) return NextResponse.json({ error: 'Invalid project slug' }, { status: 400 })
    if (!ticketPrefix) return NextResponse.json({ error: 'Invalid ticket prefix' }, { status: 400 })

    const exists = db.prepare(`
      SELECT id FROM projects
      WHERE workspace_id = ? AND (slug = ? OR ticket_prefix = ?)
      LIMIT 1
    `).get(workspaceId, slug, ticketPrefix) as { id: number } | undefined
    if (exists) {
      return NextResponse.json({ error: 'Project slug or ticket prefix already exists' }, { status: 409 })
    }

    const result = db.prepare(`
      INSERT INTO projects (workspace_id, name, slug, description, ticket_prefix, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
    `).run(workspaceId, name, slug, description || null, ticketPrefix)

    const project = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status, created_at, updated_at
      FROM projects
      WHERE id = ?
    `).get(Number(result.lastInsertRowid))

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/projects error')
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
