/**
 * Attention Detector — heuristic scanner for PTY output
 *
 * Scans terminal output for patterns that indicate the agent needs
 * human attention (approval prompts, errors, questions).
 * Used to trigger notification rings in the session sidebar.
 */

// Patterns that indicate the agent is waiting for input
const ATTENTION_PATTERNS = [
  /\[Y\/n\]/i,
  /\[y\/N\]/i,
  /\(yes\/no\)/i,
  /\? $/,                          // Interactive prompt ending with "? "
  /Permission .*(denied|required)/i,
  /Do you want to continue/i,
  /Press (Enter|any key)/i,
  /waiting for.*input/i,
  /approval.*required/i,
  /confirm/i,
  /\[approve\]/i,
  /needs your attention/i,
]

// Patterns that indicate an error occurred
const ERROR_PATTERNS = [
  /^Error:/m,
  /^FAILED/m,
  /^FATAL/m,
  /panic:/i,
  /Traceback \(most recent/i,
  /Unhandled.*rejection/i,
  /ENOENT|EACCES|EPERM/,
  /rate.?limit/i,
]

export type AttentionLevel = 'none' | 'waiting' | 'error'

interface DetectionResult {
  level: AttentionLevel
  reason?: string
}

// Debounce state per session
const lastDetection = new Map<string, { level: AttentionLevel; timestamp: number }>()
const DEBOUNCE_MS = 5000

/**
 * Scan a chunk of PTY output for attention-requiring patterns.
 * Returns the highest-priority attention level found.
 */
export function detectAttention(sessionId: string, data: string): DetectionResult {
  // Check debounce — don't re-trigger within 5 seconds
  const last = lastDetection.get(sessionId)
  if (last && last.level !== 'none' && Date.now() - last.timestamp < DEBOUNCE_MS) {
    return { level: 'none' }
  }

  // Check error patterns first (higher priority)
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(data)) {
      const result: DetectionResult = { level: 'error', reason: 'Error detected in output' }
      lastDetection.set(sessionId, { level: 'error', timestamp: Date.now() })
      return result
    }
  }

  // Check attention/waiting patterns
  for (const pattern of ATTENTION_PATTERNS) {
    if (pattern.test(data)) {
      const result: DetectionResult = { level: 'waiting', reason: 'Agent may need your input' }
      lastDetection.set(sessionId, { level: 'waiting', timestamp: Date.now() })
      return result
    }
  }

  return { level: 'none' }
}

/**
 * Clear the attention state for a session (when user views it)
 */
export function clearAttention(sessionId: string): void {
  lastDetection.delete(sessionId)
}

/**
 * Check if a session currently has attention flagged
 */
export function hasAttention(sessionId: string): boolean {
  const last = lastDetection.get(sessionId)
  return !!last && last.level !== 'none'
}
