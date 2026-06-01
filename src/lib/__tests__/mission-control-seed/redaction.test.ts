import { describe, expect, it } from 'vitest'

import { redactEvidenceValue, redactString } from '@/lib/mission-control-seed/redaction'

describe('mission-control seed redaction', () => {
  it('redacts secrets, tokens, authorization headers, api keys, and credential substrings', () => {
    const source = {
      authorization: 'Bearer openclaw-operator-secret',
      token: 'ghp_focusengine_secret_value',
      api_key: 'sk-focusengine-secret',
      command: 'sync --password plain-text-password --repo racecraft-lab/focusengine',
      nested: ['AUTHORIZATION=Bearer nested-secret', 'client_secret=abc123'],
    }

    const redacted = JSON.stringify(redactEvidenceValue(source))

    expect(redacted).not.toContain('openclaw-operator-secret')
    expect(redacted).not.toContain('ghp_focusengine_secret_value')
    expect(redacted).not.toContain('sk-focusengine-secret')
    expect(redacted).not.toContain('plain-text-password')
    expect(redacted).not.toContain('nested-secret')
    expect(redacted).not.toContain('abc123')
    expect(redacted).toContain('[REDACTED]')
  })

  it('preserves cleanup-safe operator identifiers', () => {
    const redacted = redactString(
      'ssh hall has openclaw service openclaw-gateway.service for racecraft-lab/Paddock issue 123 project 14',
    )

    expect(redacted).toContain('ssh hall')
    expect(redacted).toContain('openclaw-gateway.service')
    expect(redacted).toContain('racecraft-lab/Paddock')
    expect(redacted).toContain('issue 123')
    expect(redacted).toContain('project 14')
  })
})
