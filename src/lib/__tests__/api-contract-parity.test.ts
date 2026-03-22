import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collectOpenApiOperations,
  compareApiContractParity,
  extractHttpMethods,
  routeFileToApiPath,
  runApiContractParityCheck,
} from '@/lib/api-contract-parity'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('api-contract-parity helpers', () => {
  it('maps Next.js route files to OpenAPI-style API paths', () => {
    expect(routeFileToApiPath('src/app/api/agents/route.ts')).toBe('/api/agents')
    expect(routeFileToApiPath('src/app/api/tasks/[id]/route.ts')).toBe('/api/tasks/{id}')
    expect(routeFileToApiPath('src/app/api/files/[...slug]/route.ts')).toBe('/api/files/{slug}')
    expect(routeFileToApiPath('src/app/api/optional/[[...tail]]/route.ts')).toBe('/api/optional/{tail}')
  })

  it('extracts exported HTTP methods from route modules', () => {
    const source = `
      export const GET = async () => {}
      export const POST = async () => {}
      const internal = 'ignore me'
    `
    expect(extractHttpMethods(source).sort()).toEqual(['GET', 'POST'])
  })

  it('normalizes OpenAPI operations', () => {
    const operations = collectOpenApiOperations({
      paths: {
        '/api/tasks': { get: {}, post: {} },
        '/api/tasks/{id}': { delete: {}, patch: {} },
      },
    })
    expect(operations).toEqual([
      'DELETE /api/tasks/{id}',
      'GET /api/tasks',
      'PATCH /api/tasks/{id}',
      'POST /api/tasks',
    ])
  })

  it('reports mismatches with optional ignore list', () => {
    const report = compareApiContractParity({
      routeOperations: [
        { method: 'GET', path: '/api/tasks', sourceFile: 'a' },
        { method: 'POST', path: '/api/tasks', sourceFile: 'a' },
        { method: 'DELETE', path: '/api/tasks/{id}', sourceFile: 'b' },
      ],
      openapiOperations: ['GET /api/tasks', 'PATCH /api/tasks/{id}', 'DELETE /api/tasks/{id}'],
      ignore: ['PATCH /api/tasks/{id}'],
    })

    expect(report.missingInOpenApi).toEqual(['POST /api/tasks'])
    expect(report.missingInRoutes).toEqual([])
    expect(report.ignoredOperations).toEqual(['PATCH /api/tasks/{id}'])
  })

  it('scans a project root and compares route operations to openapi', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-contract-'))
    tempDirs.push(root)

    const routeDir = path.join(root, 'src/app/api/tasks/[id]')
    fs.mkdirSync(routeDir, { recursive: true })
    fs.writeFileSync(path.join(root, 'src/app/api/tasks/route.ts'), 'export const GET = async () => {};\n', 'utf8')
    fs.writeFileSync(path.join(routeDir, 'route.ts'), 'export const DELETE = async () => {};\n', 'utf8')

    fs.writeFileSync(
      path.join(root, 'openapi.json'),
      JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/api/tasks': { get: {} },
          '/api/tasks/{id}': { delete: {}, patch: {} },
        },
      }),
      'utf8',
    )

    const report = runApiContractParityCheck({
      projectRoot: root,
      ignore: ['PATCH /api/tasks/{id}'],
    })

    expect(report.missingInOpenApi).toEqual([])
    expect(report.missingInRoutes).toEqual([])
    expect(report.ignoredOperations).toEqual(['PATCH /api/tasks/{id}'])
  })
})
