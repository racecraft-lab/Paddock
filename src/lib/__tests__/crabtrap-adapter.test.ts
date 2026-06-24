import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CRABTRAP_SECURITY_ACTIVITY_TYPE,
  DEFAULT_CRABTRAP_MAX_PAYLOAD_BYTES,
  processCrabTrapDenialSummary,
  type CrabTrapAdapterConfig,
  type CrabTrapAdapterContext,
  type CrabTrapIntakeFailureCode,
  type CrabTrapIntakeResult,
} from '@/lib/crabtrap-adapter'
import {
  CRABTRAP_ACTOR_REF_HASH,
  CRABTRAP_FIXED_NOW,
  CRABTRAP_FIXTURE_SECRET,
  CRABTRAP_SAFE_REQUEST_HASH,
  crabtrapFixtures,
} from './fixtures/crabtrap/crabtrap-fixtures'

interface ActivityRow {
  readonly type: string
  readonly entity_type: string
  readonly entity_id: number
  readonly actor: string
  readonly description: string
  readonly data: string | null
  readonly workspace_id: number | null
}

let db: Database.Database

const SCHEMA_ACTIVITIES = `
  CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    actor TEXT NOT NULL,
    description TEXT NOT NULL,
    data TEXT,
    workspace_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

const validConfig: CrabTrapAdapterConfig = {
  signingSecret: CRABTRAP_FIXTURE_SECRET,
  freshnessWindowSeconds: 300,
  maxPayloadBytes: DEFAULT_CRABTRAP_MAX_PAYLOAD_BYTES,
  clock: () => CRABTRAP_FIXED_NOW,
}

beforeEach(() => {
  db = new Database(':memory:')
  db.prepare(SCHEMA_ACTIVITIES).run()
})

afterEach(() => {
  db.close()
})

function adapterContext(flagEnabled = true): CrabTrapAdapterContext {
  return {
    db,
    workspaceId: 11,
    projectId: 22,
    facilityWorkspaceId: 1,
    flagContext: {
      env: {},
      workspaceFlags: {
        FEATURE_CRABTRAP_HONEYPOT: flagEnabled,
      },
    },
  }
}

function processFixture(
  rawPayload: string,
  options: {
    readonly config?: CrabTrapAdapterConfig | null
    readonly flagEnabled?: boolean
  } = {},
): CrabTrapIntakeResult {
  return processCrabTrapDenialSummary({
    rawPayload,
    config: options.config === undefined ? validConfig : options.config,
    context: adapterContext(options.flagEnabled ?? true),
  })
}

function readSecurityActivities(): ActivityRow[] {
  return db
    .prepare(
      `SELECT type, entity_type, entity_id, actor, description, data, workspace_id
       FROM activities
       WHERE type = ?
       ORDER BY id ASC`,
    )
    .all(CRABTRAP_SECURITY_ACTIVITY_TYPE) as ActivityRow[]
}

function countSecurityActivities(): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM activities WHERE type = ?')
    .get(CRABTRAP_SECURITY_ACTIVITY_TYPE) as { readonly count: number }
  return row.count
}

function parseActivityData(row: ActivityRow): Record<string, unknown> {
  return JSON.parse(row.data ?? '{}') as Record<string, unknown>
}

describe('SPEC-011 CrabTrap adapter foundation tests', () => {
  it('returns feature_disabled and writes no activity when FEATURE_CRABTRAP_HONEYPOT is off', () => {
    const result = processFixture(crabtrapFixtures.valid, { flagEnabled: false })

    expect(result).toMatchObject({
      status: 'noop',
      failureCode: 'feature_disabled',
    })
    expect(countSecurityActivities()).toBe(0)
  })

  it.each([
    ['missing config', null, 'config_missing'],
    ['invalid config', { ...validConfig, signingSecret: '' }, 'config_invalid'],
  ] as const)('returns %s as a no-op without writing activity', (_label, config, failureCode) => {
    const result = processFixture(crabtrapFixtures.valid, { config })

    expect(result).toMatchObject({
      status: 'noop',
      failureCode,
    })
    expect(countSecurityActivities()).toBe(0)
  })

  it('accepts one valid signed fixture and writes exactly one bounded security activity', () => {
    const result = processFixture(crabtrapFixtures.valid)

    expect(result).toMatchObject({
      status: 'accepted',
    })
    expect(result.failureCode).toBeUndefined()

    const rows = readSecurityActivities()
    expect(rows).toHaveLength(1)

    const row = rows[0]
    expect(row).toBeDefined()
    if (!row) return

    expect(row).toMatchObject({
      type: CRABTRAP_SECURITY_ACTIVITY_TYPE,
      entity_type: 'workspace',
      entity_id: 11,
      actor: 'crabtrap-adapter',
      workspace_id: 11,
    })

    const data = parseActivityData(row)
    expect(data).toMatchObject({
      source: 'crabtrap',
      decision: 'deny',
      method: 'POST',
      url_host: 'target.example',
      url_path: '/api/probe',
      reason_code: 'policy_denied',
      safe_request_hash: CRABTRAP_SAFE_REQUEST_HASH,
      denial_count: 1,
      actor_kind: 'agent',
      actor_ref_hash: CRABTRAP_ACTOR_REF_HASH,
      project_id: 22,
    })
    expect(data['replay_key_hash']).toMatch(/^sha256:[a-f0-9]{64}$/)

    const serializedData = JSON.stringify(data)
    expect(serializedData).not.toContain('ct-valid-001')
    expect(serializedData).not.toContain('signature')
    expect(serializedData).not.toContain(CRABTRAP_FIXTURE_SECRET)
    expect(serializedData).not.toContain('http://')
    expect(serializedData).not.toContain('https://')
    expect(serializedData).not.toContain('?')
  })

  it.each([
    ['malformed fixture', crabtrapFixtures.malformed, 'malformed_json'],
    ['unsigned fixture', crabtrapFixtures.unsigned, 'signature_missing'],
    ['invalid signature fixture', crabtrapFixtures.invalidSignature, 'signature_invalid'],
    ['stale fixture', crabtrapFixtures.stale, 'timestamp_stale'],
    ['oversized fixture', crabtrapFixtures.oversized, 'payload_too_large'],
    ['unsafe fixture', crabtrapFixtures.unsafe, 'unsafe_field_present'],
    ['unsupported decision fixture', crabtrapFixtures.unsupportedDecision, 'unsupported_decision'],
    ['unsupported method fixture', crabtrapFixtures.unsupportedMethod, 'unsupported_method'],
  ] as const)(
    'rejects %s with a bounded failure code and zero activity writes',
    (_label, rawPayload, failureCode: CrabTrapIntakeFailureCode) => {
      const result = processFixture(rawPayload)

      expect(result).toMatchObject({
        status: 'rejected',
        failureCode,
      })
      expect(countSecurityActivities()).toBe(0)

      const serializedResult = JSON.stringify(result)
      expect(serializedResult).not.toContain('super-secret-token')
      expect(serializedResult).not.toContain(CRABTRAP_FIXTURE_SECRET)
    },
  )

  it('rejects a replayed event in the same landing scope without a duplicate activity', () => {
    const firstResult = processFixture(crabtrapFixtures.valid)
    expect(firstResult).toMatchObject({
      status: 'accepted',
    })

    const replayResult = processFixture(crabtrapFixtures.replayed)

    expect(replayResult).toMatchObject({
      status: 'rejected',
      failureCode: 'replay_detected',
    })
    expect(countSecurityActivities()).toBe(1)
  })

  it('rejects payloads larger than the default byte limit before parsing or persistence', () => {
    expect(Buffer.byteLength(crabtrapFixtures.oversized, 'utf8')).toBeGreaterThan(
      DEFAULT_CRABTRAP_MAX_PAYLOAD_BYTES,
    )

    const result = processFixture(crabtrapFixtures.oversized)

    expect(result).toMatchObject({
      status: 'rejected',
      failureCode: 'payload_too_large',
    })
    expect(countSecurityActivities()).toBe(0)
  })

  it('isolates activity write failures as bounded failed results without leaking database errors', () => {
    db.exec(`
      CREATE TRIGGER block_crabtrap_activity_insert
      BEFORE INSERT ON activities
      WHEN NEW.type = '${CRABTRAP_SECURITY_ACTIVITY_TYPE}'
      BEGIN
        SELECT RAISE(ABORT, 'raw database secret token should not leak');
      END;
    `)

    let result: CrabTrapIntakeResult | undefined
    expect(() => {
      result = processFixture(crabtrapFixtures.valid)
    }).not.toThrow()

    expect(result).toMatchObject({
      status: 'failed',
      failureCode: 'activity_write_failed',
    })
    expect(JSON.stringify(result)).not.toContain('raw database secret token')
    expect(countSecurityActivities()).toBe(0)
  })
})
