import { describe, it, expect } from 'vitest'
import { detectTextDirection, validateAttachment, formatFileSize } from '../chat-utils'

describe('detectTextDirection', () => {
  it('returns ltr for English text', () => {
    expect(detectTextDirection('Hello world')).toBe('ltr')
  })

  it('returns rtl for Arabic text', () => {
    expect(detectTextDirection('مرحبا')).toBe('rtl')
  })

  it('returns rtl for Hebrew text', () => {
    expect(detectTextDirection('שלום')).toBe('rtl')
  })

  it('returns rtl when text starts with Arabic after mixed content', () => {
    expect(detectTextDirection('مرحبا hello')).toBe('rtl')
  })

  it('returns ltr for empty string', () => {
    expect(detectTextDirection('')).toBe('ltr')
  })

  it('returns ltr for null', () => {
    expect(detectTextDirection(null)).toBe('ltr')
  })

  it('returns ltr for numbers only', () => {
    expect(detectTextDirection('12345')).toBe('ltr')
  })

  it('returns rtl when whitespace precedes Arabic', () => {
    expect(detectTextDirection('   مرحبا')).toBe('rtl')
  })

  it('returns rtl when punctuation precedes Arabic', () => {
    expect(detectTextDirection('...مرحبا')).toBe('rtl')
  })
})

describe('validateAttachment', () => {
  it('returns null for a normal file under 10MB', () => {
    expect(validateAttachment({ name: 'doc.pdf', size: 1024 * 1024, type: 'application/pdf' })).toBeNull()
  })

  it('returns error for file exceeding 10MB', () => {
    const result = validateAttachment({ name: 'big.zip', size: 11 * 1024 * 1024, type: 'application/zip' })
    expect(result).toBeTypeOf('string')
    expect(result).toContain('10MB')
  })

  it('returns null for exactly 10MB file', () => {
    expect(validateAttachment({ name: 'exact.bin', size: 10 * 1024 * 1024, type: 'application/octet-stream' })).toBeNull()
  })

  it('returns null for zero-size file', () => {
    expect(validateAttachment({ name: 'empty.txt', size: 0, type: 'text/plain' })).toBeNull()
  })
})

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes under 1KB', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats 1024 bytes as KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
  })

  it('formats 1048576 bytes as MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB')
  })

  it('formats fractional KB', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })
})
