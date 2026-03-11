import { describe, it, expect } from 'vitest'
import { matchesGlobPattern, findMatchingPatterns } from '../exec-approval-utils'

describe('matchesGlobPattern', () => {
  it('matches wildcard after prefix', () => {
    expect(matchesGlobPattern('git *', 'git status')).toBe(true)
  })

  it('matches wildcard with multiple words after prefix', () => {
    expect(matchesGlobPattern('git *', 'git push origin main')).toBe(true)
  })

  it('does not match when prefix has no space separator', () => {
    expect(matchesGlobPattern('git *', 'gitk')).toBe(false)
  })

  it('matches npm install with argument', () => {
    expect(matchesGlobPattern('npm install *', 'npm install lodash')).toBe(true)
  })

  it('does not match npm install without argument (trailing space trimmed)', () => {
    // Both pattern and command are trimmed, so 'npm install *' becomes 'npm install *'
    // and 'npm install ' becomes 'npm install' which does not match 'npm install .*'
    expect(matchesGlobPattern('npm install *', 'npm install ')).toBe(false)
    expect(matchesGlobPattern('npm install *', 'npm install')).toBe(false)
  })

  it('matches exact command with no wildcard', () => {
    expect(matchesGlobPattern('ls', 'ls')).toBe(true)
  })

  it('does not match extra args when no wildcard', () => {
    expect(matchesGlobPattern('ls', 'ls -la')).toBe(false)
  })

  it('matches with wildcard and flags', () => {
    expect(matchesGlobPattern('ls *', 'ls -la')).toBe(true)
  })

  it('matches everything with bare wildcard', () => {
    expect(matchesGlobPattern('*', 'anything')).toBe(true)
  })

  it('returns false for empty pattern', () => {
    expect(matchesGlobPattern('', 'anything')).toBe(false)
  })

  it('returns false for empty command with non-empty pattern', () => {
    expect(matchesGlobPattern('git *', '')).toBe(false)
  })

  it('matches multi-word prefix with wildcard', () => {
    expect(matchesGlobPattern('docker compose *', 'docker compose up -d')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesGlobPattern('Git *', 'GIT STATUS')).toBe(true)
  })

  it('trims whitespace from pattern and command', () => {
    expect(matchesGlobPattern('  git *  ', '  git status  ')).toBe(true)
  })

  it('escapes regex special characters in pattern', () => {
    expect(matchesGlobPattern('echo (hello)', 'echo (hello)')).toBe(true)
    expect(matchesGlobPattern('file.txt', 'file.txt')).toBe(true)
    expect(matchesGlobPattern('file.txt', 'filextxt')).toBe(false)
  })
})

describe('findMatchingPatterns', () => {
  it('returns only matching patterns', () => {
    expect(findMatchingPatterns(['git *', 'npm *'], 'git status')).toEqual(['git *'])
  })

  it('returns multiple matches including catch-all', () => {
    expect(findMatchingPatterns(['git *', '*'], 'git status')).toEqual(['git *', '*'])
  })

  it('returns empty array when nothing matches', () => {
    expect(findMatchingPatterns(['npm *'], 'git status')).toEqual([])
  })

  it('handles empty patterns array', () => {
    expect(findMatchingPatterns([], 'git status')).toEqual([])
  })
})
