import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/hermes-sessions', () => ({
  isHermesInstalled: vi.fn(() => false),
  isHermesGatewayRunning: vi.fn(() => false),
  clearHermesDetectionCache: vi.fn(),
}))

vi.mock('@/lib/opencode-sessions', () => ({
  isOpenCodeInstalled: vi.fn(() => true),
  getOpenCodeVersion: vi.fn(() => '1.4.3'),
  scanOpenCodeSessions: vi.fn(() => [{ isActive: true }]),
}))

vi.mock('@/lib/command', () => ({
  runCommand: vi.fn(() => {
    throw new Error('manual shell-script installers must not call runCommand')
  }),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/config', () => ({ config: { openclawConfigPath: '', openclawBin: 'openclaw', gatewayHost: '127.0.0.1', gatewayPort: 18789, homeDir: '/tmp', dataDir: '/tmp' } }))

describe('detectRuntime(opencode)', () => {
  it('reports OpenCode as installed and running when active sessions exist', async () => {
    const { detectRuntime } = await import('@/lib/agent-runtimes')
    const runtime = detectRuntime('opencode')
    expect(runtime).toMatchObject({
      id: 'opencode',
      installed: true,
      version: '1.4.3',
      running: true,
      authenticated: true,
    })
  })
})

describe('startInstall shell-script installer guardrails', () => {
  it('returns manual-install guidance for OpenClaw and Hermes local shell-script installers', async () => {
    const { startInstall } = await import('@/lib/agent-runtimes')

    const openclaw = startInstall('openclaw', 'local')
    expect(openclaw).toMatchObject({
      runtime: 'openclaw',
      mode: 'local',
      status: 'failed',
      error: 'Manual installation required',
    })
    expect(openclaw.finishedAt).toEqual(expect.any(Number))
    expect(openclaw.output).toContain('Automatic execution of downloaded shell installers is disabled')
    expect(openclaw.output).toContain('curl -fsSL https://get.openclaw.dev -o /tmp/openclaw-install.sh')
    expect(openclaw.output).toContain('bash /tmp/openclaw-install.sh --non-interactive')

    const hermes = startInstall('hermes', 'local')
    expect(hermes).toMatchObject({
      runtime: 'hermes',
      mode: 'local',
      status: 'failed',
      error: 'Manual installation required',
    })
    expect(hermes.finishedAt).toEqual(expect.any(Number))
    expect(hermes.output).toContain('Automatic execution of downloaded shell installers is disabled')
    expect(hermes.output).toContain('curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh -o /tmp/hermes-install.sh')
    expect(hermes.output).toContain('bash /tmp/hermes-install.sh --skip-setup')
  })
})
