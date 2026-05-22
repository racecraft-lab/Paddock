import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GET as getApiIndex } from '@/app/api/index/route'

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const openapiPath = path.join(repoRoot, 'openapi.json')

interface OpenApiOperation {
  tags?: string[]
  parameters?: {
    name: string
    in: string
    required?: boolean
    schema?: Record<string, unknown>
  }[]
  responses?: Record<string, {
    content?: {
      'application/json'?: {
        schema?: {
          required?: string[]
          properties?: Record<string, Record<string, unknown>>
        }
      }
    }
  }>
}

interface OpenApiDoc {
  paths: Record<string, Record<string, OpenApiOperation>>
}

function loadOpenApiDoc(): OpenApiDoc {
  const raw = fs.readFileSync(openapiPath, 'utf8')
  return JSON.parse(raw) as OpenApiDoc
}

describe('SPEC-013A task stage attempts API documentation', () => {
  it('documents the read-only GET /api/tasks/{id}/stage-attempts OpenAPI contract', () => {
    const doc = loadOpenApiDoc()
    const pathItem = doc.paths['/api/tasks/{id}/stage-attempts']

    expect(pathItem).toBeDefined()
    if (!pathItem) throw new Error('OpenAPI path /api/tasks/{id}/stage-attempts is missing')
    expect(Object.keys(pathItem).sort()).toEqual(['get'])

    const operation = pathItem['get']
    expect(operation).toBeDefined()
    if (!operation) throw new Error('OpenAPI GET operation is missing')
    expect(operation.tags).toContain('Tasks')
    const idParam = operation.parameters?.find((param) => param.name === 'id' && param.in === 'path')
    expect(idParam).toMatchObject({ required: true })
    expect(idParam?.schema).toMatchObject({ type: 'integer' })

    const workspaceIdParam = operation.parameters?.find((param) => param.name === 'workspace_id' && param.in === 'query')
    expect(workspaceIdParam).toMatchObject({ required: false })

    const workspaceScopeParam = operation.parameters?.find((param) => param.name === 'workspace_scope' && param.in === 'query')
    expect(workspaceScopeParam).toMatchObject({ required: false })

    expect(Object.keys(operation.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
    ])

    const schema = operation.responses?.['200']?.content?.['application/json']?.schema
    expect(schema?.required).toEqual(expect.arrayContaining([
      'schema_version',
      'task',
      'attempts',
      'warnings',
    ]))
    expect(schema?.properties?.['schema_version']).toMatchObject({
      type: 'string',
      const: 'task_stage_attempts.v1',
    })
    expect(schema?.properties?.['attempts']).toMatchObject({ type: 'array' })
    expect(schema?.properties?.['warnings']).toMatchObject({ type: 'array' })
  })

  it('lists the stage attempts route in the local API index as viewer read-only', async () => {
    const response = await getApiIndex()
    const payload = await response.json() as {
      endpoints: {
        path: string
        methods: string[]
        description: string
        tag: string
        auth: string
      }[]
    }

    const endpoint = payload.endpoints.find((entry) => entry.path === '/api/tasks/:id/stage-attempts')

    expect(endpoint).toBeDefined()
    expect(endpoint).toMatchObject({
      methods: ['GET'],
      tag: 'Tasks',
      auth: 'viewer',
    })
    expect(endpoint?.description).toMatch(/read-only/i)
    expect(endpoint?.description).toMatch(/stage attempts/i)
  })
})
