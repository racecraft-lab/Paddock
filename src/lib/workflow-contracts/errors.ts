import type { WorkflowContractError } from './types.ts'

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\{\{\s*secrets?\.[^}]+}}/gi,
]

export function redactDetails(value: unknown, maxLength = 512): string {
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return ''
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, match => {
      const key = match.split(/[:=]/)[0] ?? 'value'
      return /[:=]/.test(match) ? `${key}=[REDACTED]` : '[REDACTED]'
    })
  }
  text = text.replace(/\b(hunter2|secret|token)\b/gi, '[REDACTED]')
  if (text.length > maxLength) return `${text.slice(0, maxLength)}... [truncated]`
  return text
}

export function workflowContractError(
  code: string,
  message: string,
  options: Partial<WorkflowContractError> = {}
): WorkflowContractError {
  const error: WorkflowContractError = {
    code,
    message,
    remediation_hint: options.remediation_hint ?? 'Review the workflow contract and rerun validation.',
  }
  if (options.manifest_path !== undefined) error.manifest_path = options.manifest_path
  if (options.canonical_model_path !== undefined) error.canonical_model_path = options.canonical_model_path
  if (options.template_slug !== undefined) error.template_slug = options.template_slug
  if (options.details != null) error.details = redactDetails(options.details)
  return error
}
