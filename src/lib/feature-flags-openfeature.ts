import {
  OpenFeature,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/server-sdk'
import { evaluateFeatureFlagCore, type FeatureFlagContext } from '@/lib/feature-flags'

const PROVIDER_NAME = 'mission-control-workspace-flags'
const CLIENT_NAME = 'mission-control'

let providerRegistered = false

function contextToFeatureFlagContext(context: EvaluationContext = {}): FeatureFlagContext {
  const workspaceFlags = context.workspaceFlags
  return {
    workspaceFlags: typeof workspaceFlags === 'string' || (workspaceFlags && typeof workspaceFlags === 'object')
      ? workspaceFlags as FeatureFlagContext['workspaceFlags']
      : null,
  }
}

export class MissionControlFeatureFlagProvider implements Provider {
  readonly runsOn = 'server'
  readonly metadata = { name: PROVIDER_NAME }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext = {},
    _logger?: Logger
  ): Promise<ResolutionDetails<boolean>> {
    try {
      const resolution = evaluateFeatureFlagCore(flagKey, contextToFeatureFlagContext(context))
      return {
        value: resolution.value,
        reason: resolution.reason,
        flagMetadata: {
          envLocked: resolution.envLocked,
          storedValue: resolution.storedValue ?? 'none',
          envValue: resolution.envValue ?? 'none',
        },
      }
    } catch {
      return { value: defaultValue, reason: 'error_default_off' }
    }
  }

  async resolveStringEvaluation(
    _flagKey: string,
    defaultValue: string
  ): Promise<ResolutionDetails<string>> {
    return { value: defaultValue, reason: 'DEFAULT' }
  }

  async resolveNumberEvaluation(
    _flagKey: string,
    defaultValue: number
  ): Promise<ResolutionDetails<number>> {
    return { value: defaultValue, reason: 'DEFAULT' }
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    _flagKey: string,
    defaultValue: T
  ): Promise<ResolutionDetails<T>> {
    return { value: defaultValue, reason: 'DEFAULT' }
  }
}

export function getMissionControlOpenFeatureClient() {
  if (!providerRegistered) {
    OpenFeature.setProvider(new MissionControlFeatureFlagProvider())
    providerRegistered = true
  }
  return OpenFeature.getClient(CLIENT_NAME)
}

export async function evaluateFeatureFlagWithOpenFeature(
  flagKey: string,
  context: FeatureFlagContext
): Promise<boolean> {
  const client = getMissionControlOpenFeatureClient()
  return client.getBooleanValue(flagKey, false, {
    workspaceFlags: typeof context.workspaceFlags === 'string'
      ? context.workspaceFlags
      : context.workspaceFlags
        ? JSON.stringify(context.workspaceFlags)
        : null,
  })
}
