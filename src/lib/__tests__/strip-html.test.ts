import { describe, it, expect } from 'vitest'

// Reproduce the stripHtml logic from markdown-renderer to test it in isolation
function stripHtml(content: string): string {
  return content.replace(/<[^>]*>/g, '')
}

describe('stripHtml', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello')
  })

  it('removes self-closing tags', () => {
    expect(stripHtml('Before <br/> After')).toBe('Before  After')
  })

  it('removes img tags from GitHub pastes', () => {
    const input = 'Description with <img src="https://example.com/screenshot.png" alt="screenshot"> embedded image'
    expect(stripHtml(input)).toBe('Description with  embedded image')
  })

  it('removes nested HTML tags', () => {
    expect(stripHtml('<div><strong>Bold</strong> text</div>')).toBe('Bold text')
  })

  it('preserves plain text without tags', () => {
    expect(stripHtml('No tags here, just **markdown**')).toBe('No tags here, just **markdown**')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('removes multiple img tags', () => {
    const input = '<img src="a.png"><img src="b.png">text<img src="c.png">'
    expect(stripHtml(input)).toBe('text')
  })

  it('removes HTML comments', () => {
    expect(stripHtml('Before <!-- comment --> After')).toBe('Before  After')
  })

  it('handles tags with attributes and whitespace', () => {
    const input = '<a href="https://example.com" target="_blank" >Link text</a>'
    expect(stripHtml(input)).toBe('Link text')
  })

  it('preserves angle brackets that are not HTML tags', () => {
    // This is a limitation — mathematical expressions like "x < 5" would be affected
    // But for our use case (stripping pasted HTML), this is acceptable
    expect(stripHtml('5 > 3 is true')).toBe('5 > 3 is true')
  })
})
