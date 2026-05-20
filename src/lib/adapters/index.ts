import { OpenClawAdapter } from './openclaw'
import { GenericAdapter } from './generic'
import { CrewAIAdapter } from './crewai'
import { LangGraphAdapter } from './langgraph'
import { AutoGenAdapter } from './autogen'
import { ClaudeSdkAdapter } from './claude-sdk'
import type { FrameworkAdapter } from './adapter'

const ADAPTER_IDS = ['openclaw', 'generic', 'crewai', 'langgraph', 'autogen', 'claude-sdk'] as const

export function getAdapter(framework: string): FrameworkAdapter {
  switch (framework) {
    case 'openclaw':
      return new OpenClawAdapter()
    case 'generic':
      return new GenericAdapter()
    case 'crewai':
      return new CrewAIAdapter()
    case 'langgraph':
      return new LangGraphAdapter()
    case 'autogen':
      return new AutoGenAdapter()
    case 'claude-sdk':
      return new ClaudeSdkAdapter()
    default:
      throw new Error(`Unknown framework adapter: ${framework}`)
  }
}

export function listAdapters(): string[] {
  return [...ADAPTER_IDS]
}

export type { FrameworkAdapter, AgentRegistration, HeartbeatPayload, TaskReport, Assignment } from './adapter'
