/**
 * SPEC-006 / T082 — OpenAPI snapshot guard for PUT /api/projects/{id}.
 *
 * Asserts the four SPEC-006 area-routing fields, the closed error-code
 * enum, and the three 409 conflict shapes are documented in openapi.json.
 * Maps to FR-061, FR-062, FR-064.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const openapiPath = path.join(repoRoot, 'openapi.json')

interface OpenAPIDoc {
  paths: Record<string, Record<string, unknown>>
}

function loadDoc(): OpenAPIDoc {
  const raw = fs.readFileSync(openapiPath, 'utf8')
  return JSON.parse(raw) as OpenAPIDoc
}

describe('SPEC-006 / T082 — openapi.json contract for PUT /api/projects/{id}', () => {
  it('documents the PUT operation', () => {
    const doc = loadDoc()
    const pathItem = doc.paths['/api/projects/{id}']
    expect(pathItem).toBeDefined()
    expect(pathItem.put).toBeDefined()
  })

  it('declares the four SPEC-006 request fields with correct types', () => {
    const doc = loadDoc()
    const put = doc.paths['/api/projects/{id}'].put as {
      requestBody: {
        content: {
          'application/json': {
            schema: { properties: Record<string, Record<string, unknown>> }
          }
        }
      }
    }
    const props = put.requestBody.content['application/json'].schema.properties
    expect(props.area_slug).toBeDefined()
    expect(props.area_slug.pattern).toBe('^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$')
    expect(props.is_triage_project).toBeDefined()
    expect(props.is_triage_project.type).toBe('boolean')
    expect(props.is_repo_sync_owner).toBeDefined()
    expect(props.is_repo_sync_owner.type).toBe('boolean')
    expect(props.transfer_owner).toBeDefined()
    expect(props.transfer_owner.type).toBe('boolean')
  })

  it('declares 200 / 400 / 404 / 409 responses', () => {
    const doc = loadDoc()
    const put = doc.paths['/api/projects/{id}'].put as {
      responses: Record<string, { description: string }>
    }
    expect(put.responses['200']).toBeDefined()
    expect(put.responses['400']).toBeDefined()
    expect(put.responses['404']).toBeDefined()
    expect(put.responses['409']).toBeDefined()
  })

  it('400 response references closed error codes feature_flag_disabled and invalid_area_slug', () => {
    const doc = loadDoc()
    const put = doc.paths['/api/projects/{id}'].put as {
      responses: Record<string, { description: string }>
    }
    const desc400 = put.responses['400'].description
    expect(desc400).toContain('feature_flag_disabled')
    expect(desc400).toContain('invalid_area_slug')
  })

  it('409 response documents area_slug_conflict, triage_conflict, owner_conflict', () => {
    const doc = loadDoc()
    const put = doc.paths['/api/projects/{id}'].put as {
      responses: Record<string, { description: string }>
    }
    const desc409 = put.responses['409'].description
    expect(desc409).toContain('area_slug_conflict')
    expect(desc409).toContain('triage_conflict')
    expect(desc409).toContain('owner_conflict')
  })

  it('preserves PATCH and DELETE operations on the same path', () => {
    const doc = loadDoc()
    const pathItem = doc.paths['/api/projects/{id}']
    expect(pathItem.get).toBeDefined()
    expect(pathItem.patch).toBeDefined()
    expect(pathItem.delete).toBeDefined()
  })
})
