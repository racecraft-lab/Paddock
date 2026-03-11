import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Tenant Workspace Mapping', () => {
  test('GET /api/workspaces returns tenant-scoped workspaces with active workspace', async ({ request }) => {
    const res = await request.get('/api/workspaces', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(typeof body.tenant_id).toBe('number')
    expect(typeof body.active_workspace_id).toBe('number')
    expect(Array.isArray(body.workspaces)).toBe(true)
    expect(body.workspaces.length).toBeGreaterThan(0)

    const active = body.workspaces.find((w: any) => w.id === body.active_workspace_id)
    expect(active).toBeDefined()
    expect(active.tenant_id).toBe(body.tenant_id)

    for (const workspace of body.workspaces) {
      expect(workspace.tenant_id).toBe(body.tenant_id)
    }
  })

  test('default general project still loads under workspace hierarchy', async ({ request }) => {
    const projectListRes = await request.get('/api/projects?includeArchived=1', { headers: API_KEY_HEADER })
    expect(projectListRes.status()).toBe(200)
    const projectListBody = await projectListRes.json()
    const general = projectListBody.projects.find((p: any) => p.slug === 'general')

    expect(general).toBeDefined()
    expect(typeof general.workspace_id).toBe('number')

    const getProjectRes = await request.get(`/api/projects/${general.id}`, { headers: API_KEY_HEADER })
    expect(getProjectRes.status()).toBe(200)
    const getProjectBody = await getProjectRes.json()
    expect(getProjectBody.project.slug).toBe('general')

    const workspacesRes = await request.get('/api/workspaces', { headers: API_KEY_HEADER })
    const workspacesBody = await workspacesRes.json()
    const parentWorkspace = workspacesBody.workspaces.find((w: any) => w.id === getProjectBody.project.workspace_id)
    expect(parentWorkspace).toBeDefined()
    expect(parentWorkspace.tenant_id).toBe(workspacesBody.tenant_id)
  })
})

