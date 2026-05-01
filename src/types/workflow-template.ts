export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export interface JsonObject {
  [key: string]: JsonValue
}

export interface WorkflowRoutingRule {
  when: string
  next_template_slug: string
}

export interface WorkflowTemplateChainFields {
  slug: string | null
  output_schema: JsonObject | null
  routing_rules: WorkflowRoutingRule[]
  next_template_slug: string | null
  produces_pr: boolean
  external_terminal_event: string | null
  allow_redacted_artifacts: boolean
}

export interface WorkflowTemplateRecord extends WorkflowTemplateChainFields {
  id: number
  name: string
  description: string | null
  model: string
  task_prompt: string
  timeout_seconds: number
  agent_role: string | null
  tags: string | null
  workspace_id: number
  created_by: string
  created_at: number
  updated_at: number
  last_used_at: number | null
  use_count: number
}
