import { describe, expect, it } from 'vitest'
import { runCommand } from '@/lib/command'

describe('runCommand security boundaries', () => {
  it('rejects shell interpreters instead of trying to sanitize their payloads', () => {
    expect(() => runCommand('sh', ['-c', 'echo safe; echo injected'])).toThrow(
      'Executable is not allowlisted: sh'
    )
    expect(() => runCommand('/bin/bash', ['-c', 'echo safe'])).toThrow(
      'Executable is not allowlisted: bash'
    )
  })

  it('rejects executables outside the command allowlist', () => {
    expect(() => runCommand('rm', ['-rf', '/tmp/mission-control-test'])).toThrow(
      'Executable is not allowlisted: rm'
    )
  })
})
