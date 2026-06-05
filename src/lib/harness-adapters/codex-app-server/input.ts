import { CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET } from './manifest'

export interface CodexAppServerTurnInputText {
  readonly type: 'text'
  readonly text: string
}

export interface CodexAppServerTurnInputSource {
  readonly workspaceId: string
  readonly taskId: string
  readonly stageKey: string
  readonly repository: string
  readonly githubIssueTitle: string
  readonly githubIssueBody: string
  readonly githubIssueUrl: string
  readonly workflowTemplateId: string
  readonly stageInstructions: string
  readonly assignmentRole: string
  readonly claimId: string
  readonly claimRunId: string
  readonly attemptId: string
  readonly manifestId: string
  readonly capabilityPacket: typeof CODEX_APP_SERVER_ALLOWED_CAPABILITY_PACKET
}

const forbiddenLineMarkers = [
  'raw_db_row_marker_014c',
  'paddock_secret_014c',
  'BEGIN_RAW_TRANSCRIPT_014C',
  'provider_payload_marker_014c',
  'tool_payload_marker_014c',
  'BROAD_OPERATOR_CONTEXT_014C',
  'unrelated_task_history_014c',
] as const

const hostPathPattern = /(?:^|\s)\/(?:Users|var|tmp)\//

function sanitizeText(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !forbiddenLineMarkers.some((marker) => line.includes(marker)))
    .filter((line) => !hostPathPattern.test(line))
    .join('\n')
}

function renderCapabilityPacket(input: CodexAppServerTurnInputSource): string {
  const packet = input.capabilityPacket
  return [
    `adapterId: ${packet.adapterId}`,
    `artifactPublication: ${String(packet.artifactPublication)}`,
    `tokenRuntimeAccounting: ${String(packet.tokenRuntimeAccounting)}`,
    `approvalPolicy: ${packet.approvalPolicy}`,
    `userInputPolicy: ${packet.userInputPolicy}`,
  ].join('\n')
}

export function buildCodexAppServerTurnInput(
  input: CodexAppServerTurnInputSource,
): readonly CodexAppServerTurnInputText[] {
  const text = [
    `Task: ${sanitizeText(input.githubIssueTitle)}`,
    `Issue body:\n${sanitizeText(input.githubIssueBody)}`,
    `Issue URL: ${sanitizeText(input.githubIssueUrl)}`,
    `Workflow template: ${sanitizeText(input.workflowTemplateId)}`,
    `Stage: ${sanitizeText(input.stageKey)}`,
    `Stage instructions:\n${sanitizeText(input.stageInstructions)}`,
    `Task ID: ${sanitizeText(input.taskId)}`,
    `Assignment role: ${sanitizeText(input.assignmentRole)}`,
    `Repository: ${sanitizeText(input.repository)}`,
    `Workspace: ${sanitizeText(input.workspaceId)}`,
    `Claim: ${sanitizeText(input.claimId)}`,
    `Claim run: ${sanitizeText(input.claimRunId)}`,
    `Attempt: ${sanitizeText(input.attemptId)}`,
    `Manifest: ${sanitizeText(input.manifestId)}`,
    `Capabilities:\n${renderCapabilityPacket(input)}`,
    'Evidence mode: descriptor-only',
    'Handoff: launch_handoff_completed',
  ].join('\n\n')

  return [{ type: 'text', text }]
}
