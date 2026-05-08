const SENSITIVE_KEY_PATTERN = /authorization|api[_-]?key|token|password|secret|credential/i

const STRING_SECRET_PATTERNS: RegExp[] = [
  /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bAUTHORIZATION=Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bBearer\s+(?:gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|[A-Za-z0-9._~+/=-]{12,})/gi,
  /\bgh[pousr]_[A-Za-z0-9_]+\b/g,
  /\bsk-[A-Za-z0-9_-]+\b/g,
  /\b(api[_-]?key|token|password|client[_-]?secret|access[_-]?token)=([^\s"'&]+)/gi,
  /--(token|password|api-key)\s+([^\s"']+)/gi,
]

export function redactString(value: string): string {
  return STRING_SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (match, key) => {
      if (typeof key === 'string' && match.includes('=')) return `${key}=[REDACTED]`
      if (typeof key === 'string' && match.startsWith('--')) return `--${key} [REDACTED]`
      return '[REDACTED]'
    }),
    value,
  )
}

export function redactEvidenceValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((item) => redactEvidenceValue(item))
  if (!value || typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactEvidenceValue(entry)
  }
  return output
}

export function collectRedactedFieldNames(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectRedactedFieldNames(item, `${prefix}[${String(index)}]`))
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return SENSITIVE_KEY_PATTERN.test(key)
      ? [key]
      : collectRedactedFieldNames(entry, path)
  })
}
