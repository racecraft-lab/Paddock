#!/usr/bin/env node
const baseUrl = (process.env.STAGING_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '')
const apiKey = process.env.STAGING_API_KEY || process.env.API_KEY || ''
const authUser = process.env.STAGING_AUTH_USER || process.env.AUTH_USER || ''
const authPass = process.env.STAGING_AUTH_PASS || process.env.AUTH_PASS || ''

if (!baseUrl) {
  console.error('Missing STAGING_BASE_URL (or BASE_URL).')
  process.exit(1)
}
if (!apiKey) {
  console.error('Missing STAGING_API_KEY (or API_KEY).')
  process.exit(1)
}
if (!authUser || !authPass) {
  console.error('Missing STAGING_AUTH_USER/STAGING_AUTH_PASS (or AUTH_USER/AUTH_PASS).')
  process.exit(1)
}

const headers = {
  'x-api-key': apiKey,
  'content-type': 'application/json',
}

let createdProjectId = null
let createdTaskId = null
let createdAgentId = null

async function call(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options)
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { res, body }
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} failed: expected ${expected}, got ${actual}`)
  }
  console.log(`PASS ${label}`)
}

async function run() {
  const login = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: authUser, password: authPass }),
  })
  assertStatus(login.res.status, 200, 'login')

  const workspaces = await call('/api/workspaces', { headers })
  assertStatus(workspaces.res.status, 200, 'GET /api/workspaces')

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const ticketPrefix = `S${String(Date.now()).slice(-5)}`

  const projectCreate = await call('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `staging-smoke-${suffix}`,
      ticket_prefix: ticketPrefix,
    }),
  })
  assertStatus(projectCreate.res.status, 201, 'POST /api/projects')
  createdProjectId = projectCreate.body?.project?.id
  if (!createdProjectId) throw new Error('project id missing')

  const projectGet = await call(`/api/projects/${createdProjectId}`, { headers })
  assertStatus(projectGet.res.status, 200, 'GET /api/projects/[id]')

  const projectPatch = await call(`/api/projects/${createdProjectId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ description: 'staging smoke update' }),
  })
  assertStatus(projectPatch.res.status, 200, 'PATCH /api/projects/[id]')

  const agentCreate = await call('/api/agents', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `smoke-agent-${suffix}`, role: 'tester' }),
  })
  assertStatus(agentCreate.res.status, 201, 'POST /api/agents')
  createdAgentId = agentCreate.body?.agent?.id

  const assign = await call(`/api/projects/${createdProjectId}/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ agent_name: `smoke-agent-${suffix}`, role: 'member' }),
  })
  assertStatus(assign.res.status, 201, 'POST /api/projects/[id]/agents')

  const projectTasksCreate = await call('/api/tasks', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `smoke-task-${suffix}`,
      project_id: createdProjectId,
      priority: 'medium',
      status: 'inbox',
    }),
  })
  assertStatus(projectTasksCreate.res.status, 201, 'POST /api/tasks (project scoped)')
  createdTaskId = projectTasksCreate.body?.task?.id

  const projectTasksGet = await call(`/api/projects/${createdProjectId}/tasks`, { headers })
  assertStatus(projectTasksGet.res.status, 200, 'GET /api/projects/[id]/tasks')

  const unassign = await call(`/api/projects/${createdProjectId}/agents?agent_name=${encodeURIComponent(`smoke-agent-${suffix}`)}`, {
    method: 'DELETE',
    headers,
  })
  assertStatus(unassign.res.status, 200, 'DELETE /api/projects/[id]/agents')

  if (createdTaskId) {
    const deleteTask = await call(`/api/tasks/${createdTaskId}`, {
      method: 'DELETE',
      headers,
    })
    assertStatus(deleteTask.res.status, 200, 'DELETE /api/tasks/[id]')
    createdTaskId = null
  }

  if (createdProjectId) {
    const deleteProject = await call(`/api/projects/${createdProjectId}?mode=delete`, {
      method: 'DELETE',
      headers,
    })
    assertStatus(deleteProject.res.status, 200, 'DELETE /api/projects/[id]?mode=delete')
    createdProjectId = null
  }

  if (createdAgentId) {
    const deleteAgent = await call(`/api/agents/${createdAgentId}`, {
      method: 'DELETE',
      headers,
    })
    if (deleteAgent.res.status !== 200 && deleteAgent.res.status !== 404) {
      throw new Error(`DELETE /api/agents/[id] cleanup failed: ${deleteAgent.res.status}`)
    }
    createdAgentId = null
    console.log('PASS cleanup agent')
  }

  console.log(`\nSmoke test passed for ${baseUrl}`)
}

run().catch(async (error) => {
  console.error(`\nSmoke test failed: ${error.message}`)

  if (createdTaskId) {
    await call(`/api/tasks/${createdTaskId}`, { method: 'DELETE', headers }).catch(() => {})
  }
  if (createdProjectId) {
    await call(`/api/projects/${createdProjectId}?mode=delete`, { method: 'DELETE', headers }).catch(() => {})
  }
  if (createdAgentId) {
    await call(`/api/agents/${createdAgentId}`, { method: 'DELETE', headers }).catch(() => {})
  }

  process.exit(1)
})
