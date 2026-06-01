/**
 * SPEC-006 — Area label map tests (T006)
 *
 * Asserts:
 *   (a) AREA_LABEL_MAP snapshot covers exactly the 12 names/colors/descriptions
 *       in FR-030.
 *   (b) ALL_AREA_LABEL_NAMES equals Object.values(AREA_LABEL_MAP).map(l => l.name)
 *       and follows the same shape as ALL_STATUS_LABEL_NAMES /
 *       ALL_PRIORITY_LABEL_NAMES (FR-031).
 *   (c) areaLabelsForWorkspace(db, workspaceId) returns the union of
 *       AREA_LABEL_MAP values plus synthesized LabelDefs for non-NULL
 *       projects.area_slug values not already in the static map (FR-032).
 *
 * Uses relative imports (../github-label-map, ../migrations) — no `@/` alias —
 * so the test resolves cleanly against the worktree's own module layout.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AREA_LABEL_MAP,
  ALL_AREA_LABEL_NAMES,
  areaLabelsForWorkspace,
  ALL_STATUS_LABEL_NAMES,
  ALL_PRIORITY_LABEL_NAMES,
} from '../github-label-map'
import { runMigrations } from '../migrations'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function freshMigratedDb(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)
  runMigrations(db)
  return db
}

function insertProject(
  db: Database.Database,
  args: { workspaceId: number; slug: string; areaSlug?: string | null },
): number {
  const stmt = db.prepare(
    `INSERT INTO projects (workspace_id, name, slug, ticket_prefix, area_slug)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const info = stmt.run(
    args.workspaceId,
    args.slug,
    args.slug,
    args.slug.toUpperCase(),
    args.areaSlug ?? null,
  )
  return Number(info.lastInsertRowid)
}

// ── FR-030: AREA_LABEL_MAP snapshot ──────────────────────────────

describe('AREA_LABEL_MAP (FR-030)', () => {
  it('has exactly 12 entries', () => {
    expect(Object.keys(AREA_LABEL_MAP)).toHaveLength(12)
  })

  it('snapshot — every entry matches the FR-030 table exactly', () => {
    expect(AREA_LABEL_MAP).toEqual({
      'area:qa': {
        name: 'area:qa',
        color: 'a855f7',
        description: 'Paddock area: quality assurance',
      },
      'area:dev': {
        name: 'area:dev',
        color: '3b82f6',
        description: 'Paddock area: development',
      },
      'area:design': {
        name: 'area:design',
        color: 'be185d',
        description: 'Paddock area: design',
      },
      'area:infra': {
        name: 'area:infra',
        color: '64748b',
        description: 'Paddock area: infrastructure',
      },
      'area:security': {
        name: 'area:security',
        color: 'ef4444',
        description: 'Paddock area: security',
      },
      'area:docs': {
        name: 'area:docs',
        color: 'eab308',
        description: 'Paddock area: documentation',
      },
      'area:ops': {
        name: 'area:ops',
        color: 'f97316',
        description: 'Paddock area: operations',
      },
      'area:frontend': {
        name: 'area:frontend',
        color: '0e7490',
        description: 'Paddock area: frontend',
      },
      'area:backend': {
        name: 'area:backend',
        color: '6366f1',
        description: 'Paddock area: backend',
      },
      'area:data': {
        name: 'area:data',
        color: '22c55e',
        description: 'Paddock area: data',
      },
      'area:ml': {
        name: 'area:ml',
        color: '6d28d9',
        description: 'Paddock area: machine learning',
      },
      'area:triage': {
        name: 'area:triage',
        color: '6b7280',
        description: 'Paddock area: triage (unresolvable inbound issues)',
      },
    })
  })
})

// ── FR-031: ALL_AREA_LABEL_NAMES export shape ─────────────────────

describe('ALL_AREA_LABEL_NAMES (FR-031)', () => {
  it('is a string[] with all 12 area label names', () => {
    expect(Array.isArray(ALL_AREA_LABEL_NAMES)).toBe(true)
    expect(ALL_AREA_LABEL_NAMES).toHaveLength(12)
    for (const name of ALL_AREA_LABEL_NAMES) {
      expect(typeof name).toBe('string')
    }
  })

  it('preserves Object.values(AREA_LABEL_MAP).map(l => l.name) order', () => {
    const expected = Object.values(AREA_LABEL_MAP).map((l) => l.name)
    expect(ALL_AREA_LABEL_NAMES).toEqual(expected)
  })

  it('matches the export shape of ALL_STATUS_LABEL_NAMES / ALL_PRIORITY_LABEL_NAMES', () => {
    // Same array-of-strings shape as the legacy exports — FR-031 calls this out
    // explicitly so downstream callers can rely on a consistent contract.
    expect(Array.isArray(ALL_STATUS_LABEL_NAMES)).toBe(true)
    expect(Array.isArray(ALL_PRIORITY_LABEL_NAMES)).toBe(true)
    expect(ALL_AREA_LABEL_NAMES.every((n) => typeof n === 'string')).toBe(true)
  })
})

// ── FR-032: areaLabelsForWorkspace(db, workspaceId) ──────────────

describe('areaLabelsForWorkspace (FR-032)', () => {
  it('returns the static 12 when no projects have area_slug set', () => {
    const db = freshMigratedDb()
    insertProject(db, { workspaceId: 1, slug: 'project-no-area' })

    const labels = areaLabelsForWorkspace(db, 1)
    expect(labels).toHaveLength(12)
    expect(labels.map((l) => l.name).sort()).toEqual([...ALL_AREA_LABEL_NAMES].sort())
  })

  it('augments with synthesized LabelDefs for non-NULL area_slug values not in the static map', () => {
    const db = freshMigratedDb()
    insertProject(db, { workspaceId: 1, slug: 'p-marketing', areaSlug: 'marketing' })
    insertProject(db, { workspaceId: 1, slug: 'p-legal', areaSlug: 'legal' })
    // NULL area_slug must be ignored
    insertProject(db, { workspaceId: 1, slug: 'p-null' })

    const labels = areaLabelsForWorkspace(db, 1)
    const names = labels.map((l) => l.name)

    expect(labels).toHaveLength(12 + 2)
    expect(names).toContain('area:marketing')
    expect(names).toContain('area:legal')

    // All 12 static labels still present
    for (const staticName of ALL_AREA_LABEL_NAMES) {
      expect(names).toContain(staticName)
    }

    // Synthesized labels carry the workspace-defined description marker
    const marketing = labels.find((l) => l.name === 'area:marketing')!
    expect(marketing.description).toBe('Paddock area: marketing (workspace-defined)')
    expect(typeof marketing.color).toBe('string')
    expect(marketing.color).toMatch(/^[0-9a-f]{6}$/)
  })

  it('deduplicates: a project with area_slug overlapping the static map does NOT add a duplicate', () => {
    const db = freshMigratedDb()
    // 'qa' is already in the static map (area:qa)
    insertProject(db, { workspaceId: 1, slug: 'p-qa', areaSlug: 'qa' })
    insertProject(db, { workspaceId: 1, slug: 'p-frontend', areaSlug: 'frontend' })

    const labels = areaLabelsForWorkspace(db, 1)
    const names = labels.map((l) => l.name)

    // Still exactly 12 — both 'qa' and 'frontend' collide with the static map
    expect(labels).toHaveLength(12)

    // The static area:qa wins (its description is the canonical one)
    const qa = labels.find((l) => l.name === 'area:qa')!
    expect(qa.description).toBe('Paddock area: quality assurance')
    expect(qa.color).toBe('a855f7')

    // No duplicate names
    expect(new Set(names).size).toBe(names.length)
  })

  it('scopes query to the requested workspaceId (does not leak across workspaces)', () => {
    const db = freshMigratedDb()
    insertProject(db, { workspaceId: 1, slug: 'p-marketing-ws1', areaSlug: 'marketing' })
    // Workspace 2 not seeded with the schema's workspaces row — using a
    // workspace_id with no matching projects must just return the static set.
    const labels = areaLabelsForWorkspace(db, 99)
    expect(labels).toHaveLength(12)
    expect(labels.map((l) => l.name).sort()).toEqual([...ALL_AREA_LABEL_NAMES].sort())
  })
})
