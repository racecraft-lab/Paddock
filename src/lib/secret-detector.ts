/**
 * SPEC-007 secret detector (FR-030, FR-034, FR-132).
 *
 * Foundation skeleton: returns no findings and leaves content untouched. The
 * full rule iteration, redaction substitution (`<REDACTED:{rule_id}>`), binary
 * MIME guard, and `DetectorScanError` fail-closed wrapper land in US7 (T406).
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
  readonly redacted: string
}

/**
 * `DetectorScanError` is thrown when a rule iteration raises (FR-132). The
 * caller in `publishArtifact` translates this to a 500 response and writes a
 * `security_violation_scan_error` activity (NEVER `security_violation`).
 *
 * Foundation skeleton: exported for type-shape stability; the actual throw
 * site is wired in US7 (T407).
 */
export class DetectorScanError extends Error {
  override readonly name = 'DetectorScanError'
  readonly detectorCause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.detectorCause = cause
  }
}

/**
 * Stub. US7 (T406) replaces this body with the real rule loop.
 */
export function detectSecrets(content: string, mime: string): DetectionResult {
  // Foundation skeleton — references `rules` and `mime` to keep the imports
  // live so the module graph compiles before US7 populates the rule list.
  void rules
  void mime
  return { findings: [], redacted: content }
}

export type { Rule }
