import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  ensureTenantWorkspaceAccess,
  ensureTenantProjectAccess,
  ForbiddenError,
} from '@/lib/workspaces'

type Workspace = {
  id: number
  slug: string
  name: string
  tenant_id: number
  created_at: number
  updated_at: number
}

type Project = {
  id: number
  workspace_id: number
}

type AuditEvent = {
  action: string
  actor: string
  actor_id: number | null
  target_type: string | null
  target_id: number | null
  detail: string | null
  ip_address: string | null
  user_agent: string | null
}

class FakeDb {
  readonly workspaces: Workspace[] = [
    { id: 1, slug: 'default', name: 'Default', tenant_id: 10, created_at: 1, updated_at: 1 },
    { id: 2, slug: 'other', name: 'Other', tenant_id: 20, created_at: 1, updated_at: 1 },
  ]

  readonly projects: Project[] = [
    { id: 101, workspace_id: 1 },
    { id: 202, workspace_id: 2 },
  ]

  readonly auditEvents: AuditEvent[] = []

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    return {
      get: (...args: unknown[]) => {
        if (normalized.includes('from workspaces') && normalized.includes('where id = ? and tenant_id = ?')) {
          const workspaceId = Number(args[0])
          const tenantId = Number(args[1])
          return this.workspaces.find((w) => w.id === workspaceId && w.tenant_id === tenantId)
        }

        if (normalized.includes('from projects p') && normalized.includes('join workspaces w')) {
          const projectId = Number(args[0])
          const project = this.projects.find((p) => p.id === projectId)
          if (!project) return undefined
          const workspace = this.workspaces.find((w) => w.id === project.workspace_id)
          if (!workspace) return undefined
          return { id: project.id, workspace_id: project.workspace_id, tenant_id: workspace.tenant_id }
        }

        if (normalized.startsWith('select action, actor, target_type, target_id, detail from audit_log')) {
          const event = this.auditEvents[this.auditEvents.length - 1]
          if (!event) return undefined
          return {
            action: event.action,
            actor: event.actor,
            target_type: event.target_type || '',
            target_id: event.target_id || 0,
            detail: event.detail || '',
          }
        }

        if (normalized.startsWith('select action, target_type, target_id from audit_log')) {
          const event = this.auditEvents[this.auditEvents.length - 1]
          if (!event) return undefined
          return {
            action: event.action,
            target_type: event.target_type || '',
            target_id: event.target_id || 0,
          }
        }

        return undefined
      },
      run: (...args: unknown[]) => {
        if (normalized.startsWith('insert into audit_log')) {
          this.auditEvents.push({
            action: String(args[0]),
            actor: String(args[1]),
            actor_id: (args[2] as number | null) ?? null,
            target_type: (args[3] as string | null) ?? null,
            target_id: (args[4] as number | null) ?? null,
            detail: (args[5] as string | null) ?? null,
            ip_address: (args[6] as string | null) ?? null,
            user_agent: (args[7] as string | null) ?? null,
          })
        }
        return { changes: 1 }
      }
    }
  }
}

function createTestDb(): Database.Database {
  return new FakeDb() as unknown as Database.Database
}

describe('tenant access guards', () => {
  it('allows workspace access for matching tenant', () => {
    const db = createTestDb()
    const workspace = ensureTenantWorkspaceAccess(db, 10, 1, {
      actor: 'alice',
      actorId: 1,
      route: '/api/projects',
    })
    expect(workspace.id).toBe(1)
    expect(workspace.tenant_id).toBe(10)
  })

  it('denies workspace access for foreign tenant and logs tenant_access_denied', () => {
    const db = createTestDb()
    expect(() =>
      ensureTenantWorkspaceAccess(db, 10, 2, {
        actor: 'alice',
        actorId: 1,
        route: '/api/projects',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).toThrow(ForbiddenError)

    const event = db.prepare(`
      SELECT action, actor, target_type, target_id, detail
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as {
      action: string
      actor: string
      target_type: string
      target_id: number
      detail: string
    }

    expect(event.action).toBe('tenant_access_denied')
    expect(event.actor).toBe('alice')
    expect(event.target_type).toBe('workspace')
    expect(event.target_id).toBe(2)
    expect(event.detail).toContain('"tenant_id":10')
  })

  it('allows project access for matching tenant', () => {
    const db = createTestDb()
    const project = ensureTenantProjectAccess(db, 10, 101, {
      actor: 'alice',
      actorId: 1,
      route: '/api/projects/101',
    })
    expect(project.id).toBe(101)
    expect(project.workspace_id).toBe(1)
    expect(project.tenant_id).toBe(10)
  })

  it('denies project access for foreign tenant and logs tenant_access_denied', () => {
    const db = createTestDb()
    expect(() =>
      ensureTenantProjectAccess(db, 10, 202, {
        actor: 'alice',
        actorId: 1,
        route: '/api/projects/202',
      })
    ).toThrow(ForbiddenError)

    const event = db.prepare(`
      SELECT action, target_type, target_id
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as {
      action: string
      target_type: string
      target_id: number
    }

    expect(event.action).toBe('tenant_access_denied')
    expect(event.target_type).toBe('project')
    expect(event.target_id).toBe(202)
  })
})
