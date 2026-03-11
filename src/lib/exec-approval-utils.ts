/**
 * Glob-style pattern matching for exec approval allowlists.
 * Supports `*` as a wildcard that matches any characters.
 */
export function matchesGlobPattern(pattern: string, command: string): boolean {
  const p = pattern.toLowerCase().trim()
  const c = command.toLowerCase().trim()
  if (!p) return false
  if (p === c) return true
  if (!p.includes('*')) return false
  const regex = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  return regex.test(c)
}

/**
 * Find all patterns from a list that match a given command.
 */
export function findMatchingPatterns(patterns: string[], command: string): string[] {
  return patterns.filter(pattern => matchesGlobPattern(pattern, command))
}
