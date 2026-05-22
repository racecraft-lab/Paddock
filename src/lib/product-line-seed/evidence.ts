import { createHash } from 'node:crypto'
import { PRODUCT_LINE_SEED_HASH_PREFIX } from './types'

const unsafeSnapshotKeys = new Set([
  'credential',
  'credentials',
  'matched_secret',
  'operator_evidence',
  'password',
  'raw_log',
  'raw_logs',
  'raw_operator_evidence',
  'raw_payload',
  'raw_untrusted_payload',
  'secret',
  'signed_url',
  'token',
])

export type RedactionSafeSnapshotInput =
  | null
  | string
  | number
  | boolean
  | RedactionSafeSnapshotInput[]
  | { readonly [key: string]: RedactionSafeSnapshotInput }

export function orderedJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => orderedJsonStringify(entry)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${orderedJsonStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function assertRedactionSafeSnapshotInput(value: unknown, path = '$'): asserts value is RedactionSafeSnapshotInput {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertRedactionSafeSnapshotInput(entry, `${path}[${String(index)}]`)
    })
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase()
      if (unsafeSnapshotKeys.has(normalized)) {
        throw new Error(`Snapshot input contains unsafe redaction field at ${path}.${key}`)
      }
      assertRedactionSafeSnapshotInput(entry, `${path}.${key}`)
    }
    return
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return
  }
  throw new Error(`Snapshot input contains unsupported value at ${path}`)
}

export function hashProductLineSeedSnapshot(value: unknown): string {
  assertRedactionSafeSnapshotInput(value)
  const digest = createHash('sha256').update(orderedJsonStringify(value)).digest('hex')
  return `${PRODUCT_LINE_SEED_HASH_PREFIX}${digest}`
}
