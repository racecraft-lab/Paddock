/**
 * SPEC-007 secret detector (FR-030, FR-034, FR-132).
 *
 * Iterates the closed v1 ruleset (`./secret-detector.rules`) over the input
 * content, returning every match's `rule_id` (with optional line/char offset
 * for text content) and a `redacted` payload where each match is replaced
 * by `<REDACTED:{rule_id}>` (FR-030, Constitution Principle XIII — never
 * surface the raw matched substring).
 *
 * Binary content (non-text MIMEs per FR-034) is scanned for completeness but
 * is returned UNREDACTED — `redacted` is the original input untouched. This
 * matches FR-034: binaries with findings are rejected outright by the
 * publish path and never stored, so there is no scenario where the binary
 * `redacted` value is persisted.
 *
 * Any unexpected throw inside rule iteration is wrapped in
 * `DetectorScanError` (FR-132). The publish caller catches this, returns
 * 500 `internal_scan_error`, and writes a `security_violation_scan_error`
 * activity (NOT `security_violation`).
 *
 * Strict-scope module — exempt from any direct DB or filesystem access.
 */

import { rules, type Rule } from './secret-detector.rules'

export interface SecretFinding {
  readonly rule_id: string
  readonly line_number?: number
  readonly char_offset?: number
}

export interface DetectionResult {
  readonly findings: readonly SecretFinding[]
  /**
   * For text-like MIMEs: content with each match replaced by
   * `<REDACTED:{rule_id}>` (FR-030, Constitution Principle XIII — never
   * surface the raw matched substring).
   * For binary MIMEs: identical to the input (FR-034 — never redact binary).
   */
  readonly redacted: string | Buffer
}

/**
 * `DetectorScanError` is thrown when a rule iteration raises (FR-132). The
 * caller in `publishArtifact` translates this to a 500 response and writes a
 * `security_violation_scan_error` activity (NEVER `security_violation`).
 */
export class DetectorScanError extends Error {
  override readonly name = 'DetectorScanError'
  readonly detectorCause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.detectorCause = cause
  }
}

// MIME prefixes / exact MIMEs treated as text-like. FR-033 lists these as the
// redactable set; the same predicate gates redaction here. Binaries are
// scanned but never redacted (FR-034).
const TEXT_MIME_PREFIXES = ['text/'] as const
const TEXT_MIME_EXACTS = new Set<string>([
  'application/json',
  'application/x-yaml',
  'application/yaml',
  'application/xml',
  'application/javascript',
  'application/x-sh',
])

function isTextMime(mime: string): boolean {
  const [baseMime = ''] = mime.split(';')
  const lower = baseMime.trim().toLowerCase()
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (lower.startsWith(prefix)) return true
  }
  return TEXT_MIME_EXACTS.has(lower)
}

/**
 * Compute (line_number, char_offset) for an absolute index inside `text`.
 * Both are 1-based to match common editor conventions.
 */
function locationFor(
  text: string,
  index: number,
): { line_number: number; char_offset: number } {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++
      lastNewline = i
    }
  }
  return { line_number: line, char_offset: index - lastNewline }
}

/**
 * Scan `content` against the v1 ruleset and return findings + redacted text.
 *
 * - Text MIMEs: every match is replaced by `<REDACTED:{rule_id}>`.
 * - Binary MIMEs: scan-only; `redacted` is the input untouched (FR-034).
 *
 * Any unexpected throw inside the rule loop is caught and re-thrown as
 * `DetectorScanError` (FR-132) so the publish caller can fail closed with
 * 500 `internal_scan_error`.
 */
export function detectSecrets(
  content: string | Buffer,
  mime: string,
): DetectionResult {
  const textMode = isTextMime(mime)

  // For binary content we still scan a UTF-8 view of the bytes so any
  // accidental ASCII-leaked secrets (e.g. an AWS key embedded in a PDF
  // string table) still surface as findings — but we never substitute,
  // because the original byte boundaries cannot be preserved through a
  // text-replace round-trip.
  const scanText: string =
    typeof content === 'string' ? content : content.toString('utf8')

  const findings: SecretFinding[] = []
  let redactedText = scanText

  try {
    for (const rule of rules) {
      collectFindings(rule, scanText, findings)
      if (textMode) {
        redactedText = redactedText.replace(
          new RegExp(rule.regex.source, rule.regex.flags),
          `<REDACTED:${rule.name}>`,
        )
      }
    }
  } catch (err) {
    throw new DetectorScanError(
      'secret detector rule iteration threw',
      err,
    )
  }

  return {
    findings,
    redacted: textMode ? redactedText : content,
  }
}

function collectFindings(
  rule: Rule,
  text: string,
  out: SecretFinding[],
): void {
  // Fresh per-call regex avoids cross-call `lastIndex` leakage when the
  // global flag is set on the shared rule literal.
  const re = new RegExp(rule.regex.source, rule.regex.flags)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const loc = locationFor(text, match.index)
    out.push({
      rule_id: rule.name,
      line_number: loc.line_number,
      char_offset: loc.char_offset,
    })
    // Defensive guard against zero-length matches.
    if (match[0].length === 0) re.lastIndex++
  }
}

export type { Rule }
