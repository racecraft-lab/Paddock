import { createHash, createHmac } from 'node:crypto'

export const CRABTRAP_FIXTURE_SECRET = 'spec-011-crabtrap-fixture-secret'
export const CRABTRAP_FIXED_NOW = new Date('2026-06-24T12:00:00.000Z')
export const CRABTRAP_MAX_PAYLOAD_BYTES = 16 * 1024
export const CRABTRAP_SAFE_REQUEST_HASH = `sha256:${'a'.repeat(64)}`
export const CRABTRAP_ACTOR_REF_HASH = `sha256:${'b'.repeat(64)}`
export const CRABTRAP_SOURCE_INSTANCE_HASH = `sha256:${'c'.repeat(64)}`
export const CRABTRAP_URL_PATH_HASH = `sha256:${'d'.repeat(64)}`

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]

interface JsonObject {
  readonly [key: string]: JsonValue
}

type MutableJsonObject = Record<string, JsonValue>

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    const arrayValue = value as readonly JsonValue[]
    return `[${arrayValue.map((item) => canonicalJson(item)).join(',')}]`
  }

  if (value !== null && typeof value === 'object') {
    const objectValue = value as JsonObject
    const keys = Object.keys(objectValue).sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(objectValue[key] ?? null)}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

const baseSummary: JsonObject = {
  schema_version: 'crabtrap_denial_summary.v1',
  source: 'crabtrap',
  event_id: 'ct-valid-001',
  signed_at: '2026-06-24T11:59:30.000Z',
  occurred_at: '2026-06-24T11:59:20.000Z',
  decision: 'deny',
  method: 'POST',
  url_host: 'target.example',
  url_path: '/api/probe',
  reason_code: 'policy_denied',
  safe_request_hash: CRABTRAP_SAFE_REQUEST_HASH,
  denial_count: 1,
  actor_kind: 'agent',
  source_instance_hash: CRABTRAP_SOURCE_INSTANCE_HASH,
  actor_ref_hash: CRABTRAP_ACTOR_REF_HASH,
  workspace_id: 11,
  project_id: 22,
  probe_kind: 'ssrf',
  url_path_hash: CRABTRAP_URL_PATH_HASH,
  distinct_host_count: 1,
  distinct_path_count: 1,
  distinct_actor_count: 1,
}

function signSummary(summary: JsonObject): string {
  const unsignedSummary: MutableJsonObject = {}
  for (const key of Object.keys(summary)) {
    if (key !== 'signature') {
      unsignedSummary[key] = summary[key] ?? null
    }
  }

  const canonicalPayloadSha256 = createHash('sha256')
    .update(canonicalJson(unsignedSummary), 'utf8')
    .digest('hex')
  const timestamp = typeof summary['signed_at'] === 'string' ? summary['signed_at'] : ''
  const eventId = typeof summary['event_id'] === 'string' ? summary['event_id'] : ''
  const message = `v1:${timestamp}:${eventId}:${canonicalPayloadSha256}`
  const signature = createHmac('sha256', CRABTRAP_FIXTURE_SECRET)
    .update(message, 'utf8')
    .digest('hex')

  return `sha256=${signature}`
}

function makeSignedFixture(overrides: JsonObject = {}): string {
  const summary: JsonObject = {
    ...baseSummary,
    ...overrides,
  }

  return `${JSON.stringify({
    ...summary,
    signature: signSummary(summary),
  }, null, 2)}\n`
}

function makeUnsignedFixture(overrides: JsonObject = {}): string {
  return `${JSON.stringify({
    ...baseSummary,
    ...overrides,
  }, null, 2)}\n`
}

export const crabtrapFixtures = {
  valid: makeSignedFixture(),
  malformed: '{"schema_version":"crabtrap_denial_summary.v1",',
  unsigned: makeUnsignedFixture({ event_id: 'ct-unsigned-001' }),
  stale: makeSignedFixture({
    event_id: 'ct-stale-001',
    signed_at: '2026-06-24T11:53:00.000Z',
    occurred_at: '2026-06-24T11:52:50.000Z',
  }),
  replayed: makeSignedFixture(),
  oversized: JSON.stringify({
    schema_version: 'crabtrap_denial_summary.v1',
    padding: 'x'.repeat(CRABTRAP_MAX_PAYLOAD_BYTES + 64),
  }),
  unsafe: makeSignedFixture({
    event_id: 'ct-unsafe-001',
    url_path: '/admin/api_key/super-secret-token',
  }),
  unsupportedDecision: makeSignedFixture({
    event_id: 'ct-unsupported-decision-001',
    decision: 'allow',
  }),
  unsupportedMethod: makeSignedFixture({
    event_id: 'ct-unsupported-method-001',
    method: 'TRACE',
  }),
  invalidSignature: makeSignedFixture({
    event_id: 'ct-invalid-signature-001',
  }).replace(/sha256=[a-f0-9]{64}/, `sha256=${'0'.repeat(64)}`),
} as const
