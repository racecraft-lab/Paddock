import { describe, expect, it } from 'vitest'
import {
  CODEX_APP_SERVER_ADAPTER_ID,
  CODEX_APP_SERVER_COMMAND,
  CODEX_APP_SERVER_MANIFEST_ID,
  CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
  buildCodexAppServerLaunchInput,
  buildCodexAppServerSandboxPolicy,
} from './codex-app-server-fixtures'

const EXPECTED_NON_GOALS = [
  'no_second_real_adapter',
  'no_openclaw_specific_behavior',
  'no_live_operator_intervention_ui',
  'no_auto_approval',
  'no_raw_transcript_or_protocol_retention',
  'no_direct_task_terminal_mutation',
  'no_direct_github_mutation',
  'no_successor_selection',
  'no_auto_merge',
  'no_governance_mutation',
  'defer_rich_transcript_retention_to_SPEC_014E',
  'defer_live_operator_intervention_to_SPEC_014F',
] as const

interface CodexAppServerManifestModule {
  readonly CODEX_APP_SERVER_MANIFEST?: unknown
  readonly CODEX_APP_SERVER_REAL_ADAPTER_REGISTRY?: readonly unknown[]
  readonly CODEX_APP_SERVER_RUNTIME_MANIFEST?: unknown
  readonly CODEX_APP_SERVER_RUNTIME_REGISTRY?: readonly unknown[]
  readonly CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET?: unknown
  readonly CODEX_APP_SERVER_MANIFEST_NON_GOALS?: readonly string[]
}

type LooseManifestRecord = Record<string, unknown> & {
  readonly timeout?: unknown
  readonly maximumMs?: unknown
  readonly capabilities?: unknown
  readonly launch?: unknown
  readonly artifactPublication?: unknown
  readonly tokenRuntimeAccounting?: unknown
  readonly approvalPolicy?: unknown
  readonly userInputPolicy?: unknown
  readonly secondRealAdapter?: unknown
  readonly openclawSpecificBehavior?: unknown
  readonly liveOperatorInterventionUi?: unknown
  readonly rawTranscriptRetention?: unknown
  readonly directTaskTerminalMutation?: unknown
  readonly directGitHubMutation?: unknown
  readonly successorSelection?: unknown
  readonly autoMerge?: unknown
  readonly governanceMutation?: unknown
}

const MANIFEST_MODULE_PATH = '../codex-app-server/manifest.ts'
const manifestModules = import.meta.glob('../codex-app-server/manifest.ts', { eager: true })

const loadManifestModule = (): CodexAppServerManifestModule => {
  const loaded = manifestModules[MANIFEST_MODULE_PATH]
  expect(loaded).toBeDefined()
  return loaded as CodexAppServerManifestModule
}

const asRecord = (value: unknown): LooseManifestRecord => {
  expect(value).toEqual(expect.any(Object))
  expect(Array.isArray(value)).toBe(false)
  return value as LooseManifestRecord
}

const supportState = (value: unknown): string | undefined => (
  typeof value === 'object' && value !== null && 'state' in value
    ? (value as { readonly state?: string }).state
    : undefined
)

describe('SPEC-014C Codex app-server manifest', () => {
  it('exports exactly one real codex-app-server adapter manifest', () => {
    const manifestModule = loadManifestModule()
    const manifest = asRecord(manifestModule.CODEX_APP_SERVER_MANIFEST)

    expect(manifest).toMatchObject({
      adapterId: CODEX_APP_SERVER_ADAPTER_ID,
      manifestId: CODEX_APP_SERVER_MANIFEST_ID,
      evidenceSchemaVersion: CODEX_APP_SERVER_RUN_SCHEMA_VERSION,
      command: CODEX_APP_SERVER_COMMAND,
    })
    expect(manifestModule.CODEX_APP_SERVER_REAL_ADAPTER_REGISTRY).toEqual([manifest])
    expect(manifestModule.CODEX_APP_SERVER_REAL_ADAPTER_REGISTRY).toHaveLength(1)
  })

  it('declares launch and same-run continuation support for the app-server proxy command', () => {
    const manifestModule = loadManifestModule()
    const manifest = asRecord(manifestModule.CODEX_APP_SERVER_MANIFEST)

    expect(manifest).toMatchObject({
      command: CODEX_APP_SERVER_COMMAND,
      launch: {
        supported: true,
        transport: 'stdio_json_rpc',
        subprocess: {
          shell: false,
          cwd: 'sandbox_lifecycle_root',
        },
      },
      continuation: {
        supported: true,
        scope: 'same_live_thread_current_claim_attempt',
      },
    })
  })

  it('enforces the fixture timeout budget and Paddock-owned sandbox posture', () => {
    const manifestModule = loadManifestModule()
    const manifest = asRecord(manifestModule.CODEX_APP_SERVER_MANIFEST)
    const launchInput = buildCodexAppServerLaunchInput()
    const sandboxPolicy = buildCodexAppServerSandboxPolicy(launchInput.lifecycleRoot)
    const timeout = asRecord(manifest.timeout)

    expect(manifest).toMatchObject({
      sandboxPosture: {
        lifecycleOwner: 'paddock',
        filesystemAuthority: 'paddock_owned',
        cwd: 'sandbox_lifecycle_root',
        runtimeWorkspaceRoots: 'sandbox_lifecycle_root',
        networkAccess: sandboxPolicy.networkAccess,
      },
    })
    expect(timeout).toMatchObject({
      supported: true,
      defaultMs: launchInput.timeoutMs,
      reasonCode: 'timeout_budget_expired',
    })
    expect(typeof timeout.maximumMs).toBe('number')
    expect(timeout.maximumMs as number).toBeGreaterThanOrEqual(launchInput.timeoutMs)
  })

  it('publishes the allowed non-interactive capability packet', () => {
    const manifestModule = loadManifestModule()
    const manifest = asRecord(manifestModule.CODEX_APP_SERVER_MANIFEST)
    const capabilities = asRecord(manifest.capabilities)

    expect(manifestModule.CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET).toEqual(
      buildCodexAppServerLaunchInput().capabilityPacket,
    )
    expect(supportState(capabilities.launch)).toBe('supported')
    expect(supportState(capabilities.artifactPublication)).toBe('supported')
    expect(supportState(capabilities.tokenRuntimeAccounting)).toBe('supported')
    expect(supportState(capabilities.approvalPolicy)).toBe('unsupported')
    expect(supportState(capabilities.userInputPolicy)).toBe('unsupported')
  })

  it('publishes a SPEC-014B-compatible runtime-inventory manifest for the real adapter', () => {
    const manifestModule = loadManifestModule()
    const runtimeManifest = asRecord(manifestModule.CODEX_APP_SERVER_RUNTIME_MANIFEST)

    expect(runtimeManifest).toMatchObject({
      schema_version: 'harness_adapter_manifest.v1',
      manifest_id: CODEX_APP_SERVER_MANIFEST_ID,
      display_name: 'Codex app-server',
      sandbox: {
        owner: 'paddock',
        filesystem_authority: 'paddock_owned',
        posture: 'paddock_owned_sandbox',
      },
      provider_account_constraints: {
        synthetic_only: false,
        account_binding: 'codex_app_server',
      },
    })
    expect(manifestModule.CODEX_APP_SERVER_RUNTIME_REGISTRY).toEqual([runtimeManifest])
  })

  it('keeps SPEC-014E and SPEC-014F non-goals explicit and unsupported', () => {
    const manifestModule = loadManifestModule()
    const manifest = asRecord(manifestModule.CODEX_APP_SERVER_MANIFEST)
    const capabilities = asRecord(manifest.capabilities)

    expect(manifestModule.CODEX_APP_SERVER_MANIFEST_NON_GOALS).toEqual(EXPECTED_NON_GOALS)
    expect(supportState(capabilities.secondRealAdapter)).toBe('unsupported')
    expect(supportState(capabilities.openclawSpecificBehavior)).toBe('unsupported')
    expect(supportState(capabilities.liveOperatorInterventionUi)).toBe('unsupported')
    expect(supportState(capabilities.rawTranscriptRetention)).toBe('unsupported')
    expect(supportState(capabilities.directTaskTerminalMutation)).toBe('unsupported')
    expect(supportState(capabilities.directGitHubMutation)).toBe('unsupported')
    expect(supportState(capabilities.successorSelection)).toBe('unsupported')
    expect(supportState(capabilities.autoMerge)).toBe('unsupported')
    expect(supportState(capabilities.governanceMutation)).toBe('unsupported')
  })
})
