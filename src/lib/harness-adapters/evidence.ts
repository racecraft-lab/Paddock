import {
  SANITIZED_FAKE_EVIDENCE_KINDS,
  SANITIZED_FAKE_EVIDENCE_SCHEMA_VERSION,
  type SanitizedFakeEvidence,
  type SanitizedFakeEvidenceKind,
} from './types'

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY|bearer\s+[A-Za-z0-9._-]{20,}|token\s*[:=]|secret\s*[:=]|password\s*[:=]|api[_-]?key\s*[:=])/i
const HOST_PATH_PATTERN = /(^|[\s"'`])(?:\/(?:Users|private|tmp|var|etc|home)\/|[A-Za-z]:\\)/
const RAW_MARKUP_PATTERN = /<\s*[a-z][^>]*>|<\/\s*[a-z][^>]*>|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|```|^#{1,6}\s/m
const RAW_PAYLOAD_PATTERN = /(raw[_ -]?(transcript|prompt|provider|tool|mcp|payload)|provider_payload|prompt_body|token_payload|connection_string|session_transcript)/i
const UNSAFE_URI_PATTERN = /\b(?:file|javascript|data):/i

export interface SafeTextCheck {
  readonly ok: boolean
  readonly code: string | null
}

export function isSanitizedFakeEvidenceKind(value: unknown): value is SanitizedFakeEvidenceKind {
  return typeof value === 'string' && (SANITIZED_FAKE_EVIDENCE_KINDS as readonly string[]).includes(value)
}

export function checkSafePlainText(value: unknown): SafeTextCheck {
  if (typeof value !== 'string') return { ok: false, code: 'not_plain_text' }
  if (value.length === 0 || value.length > 512) return { ok: false, code: 'text_bounds' }
  if (SECRET_PATTERN.test(value)) return { ok: false, code: 'secret_shaped' }
  if (HOST_PATH_PATTERN.test(value)) return { ok: false, code: 'host_path' }
  if (RAW_MARKUP_PATTERN.test(value)) return { ok: false, code: 'raw_markup' }
  if (RAW_PAYLOAD_PATTERN.test(value)) return { ok: false, code: 'raw_payload' }
  if (UNSAFE_URI_PATTERN.test(value)) return { ok: false, code: 'unsafe_uri' }
  return { ok: true, code: null }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeString(value: unknown): string | null {
  const check = checkSafePlainText(value)
  return check.ok && typeof value === 'string' ? value : null
}

export interface EvidenceSanitizationResult {
  readonly accepted: readonly SanitizedFakeEvidence[]
  readonly rejected: readonly {
    readonly field_path: string
    readonly evidence_kind: SanitizedFakeEvidenceKind | null
    readonly code: string
  }[]
}

export function sanitizeFakeEvidenceList(raw: unknown, fieldPath = 'sanitized_fake_evidence'): EvidenceSanitizationResult {
  if (raw === undefined || raw === null) return { accepted: [], rejected: [] }
  if (!Array.isArray(raw)) {
    return {
      accepted: [],
      rejected: [{ field_path: fieldPath, evidence_kind: null, code: 'not_array' }],
    }
  }

  const accepted: SanitizedFakeEvidence[] = []
  const rejected: EvidenceSanitizationResult['rejected'][number][] = []
  raw.slice(0, 20).forEach((item, index) => {
    const itemPath = `${fieldPath}[${index.toString()}]`
    if (!isPlainObject(item)) {
      rejected.push({ field_path: itemPath, evidence_kind: null, code: 'not_object' })
      return
    }

    const kind = item['kind']
    if (!isSanitizedFakeEvidenceKind(kind)) {
      rejected.push({ field_path: `${itemPath}.kind`, evidence_kind: null, code: 'unknown_evidence_kind' })
      return
    }

    const label = safeString(item['label'])
    const ref = safeString(item['ref'])
    if (!label || !ref) {
      rejected.push({ field_path: itemPath, evidence_kind: kind, code: 'unsafe_text' })
      return
    }
    const summary = item['summary']
    if (summary !== undefined && (typeof summary !== 'string' || !checkSafePlainText(summary).ok)) {
      rejected.push({ field_path: `${itemPath}.summary`, evidence_kind: kind, code: 'unsafe_text' })
      return
    }
    const count = item['count']
    const digest = item['digest']
    const mimeType = item['mime_type']
    const byteCount = item['byte_count']

    const entry: SanitizedFakeEvidence = {
      schema_version: SANITIZED_FAKE_EVIDENCE_SCHEMA_VERSION,
      kind,
      label,
      ref,
      ...(typeof summary === 'string' && checkSafePlainText(summary).ok ? { summary } : {}),
      ...(typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? { count } : {}),
      ...(typeof digest === 'string' && /^[a-f0-9]{16,128}$/i.test(digest) ? { digest } : {}),
      ...(typeof mimeType === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType) ? { mime_type: mimeType } : {}),
      ...(typeof byteCount === 'number' && Number.isSafeInteger(byteCount) && byteCount >= 0 ? { byte_count: byteCount } : {}),
    }
    accepted.push(entry)
  })

  if (raw.length > 20) {
    rejected.push({ field_path: fieldPath, evidence_kind: null, code: 'too_many_items' })
  }

  return { accepted, rejected }
}
