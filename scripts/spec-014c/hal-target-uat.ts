#!/usr/bin/env node

import { EventEmitter } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import {
  createSandboxLifecycle,
  prepareSandboxLifecycle,
  resolveSandboxRoot,
} from '../../src/lib/agent-sandbox-lifecycle.ts'
import { launchCodexAppServerAttempt } from '../../src/lib/harness-adapters/codex-app-server/runner.ts'
import {
  buildCodexAppServerAgentMessageCompleted,
  buildCodexAppServerInitializeResponse,
  buildCodexAppServerThreadStarted,
  buildCodexAppServerThreadStartResponse,
  buildCodexAppServerTurnCompleted,
  buildCodexAppServerTurnStarted,
  buildCodexAppServerTurnStartResponse,
  CODEX_APP_SERVER_UNSUPPORTED_REQUEST_FIXTURES,
  type CodexAppServerWireMessage,
} from '../../src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts'
import {
  buildCodexAppServerDispatchAdmissionInputFromDatabase,
  evaluateCodexAppServerDispatchAdmission,
  persistCodexAppServerDispatchEvidence,
  tryDispatchCodexAppServerTask,
  type CodexAppServerDispatchTaskInput,
} from '../../src/lib/task-dispatch-codex-app-server.ts'
import { createTaskStageAttempt } from '../../src/lib/task-stage-attempts.ts'

type JsonObject = Record<string, unknown>

const APP_ROOT = resolve(trimEnv('PADDOCK_APP_ROOT') ?? process.cwd())
const DATA_DIR = resolve(trimEnv('PADDOCK_DATA_DIR') ?? resolve(APP_ROOT, '.data'))
const BASE_URL = trimEnv('PADDOCK_BASE_URL') ?? 'http://127.0.0.1:3000'
const STAGE_KEY = 'implementation'
const RUN_ID = resolveRunId()
const MARKER = `SPEC-014C-HAL-UAT-${RUN_ID}`
const NOW_UNIX = Math.floor(Date.now() / 1000)
const NOW_ISO = new Date().toISOString()
const UAT_SANDBOX_ROOT = resolve(trimEnv('SPEC_014C_UAT_SANDBOX_ROOT') ?? resolve(DATA_DIR, `sandboxes/spec-014c-uat-${RUN_ID}`))
const FLAGS_ON = JSON.stringify({
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_TASK_CONTROL_PLANE: true,
  FEATURE_AGENT_RUNNER_SANDBOXES: true,
})
const FLAGS_OFF = JSON.stringify({
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_TASK_CONTROL_PLANE: true,
  FEATURE_AGENT_RUNNER_SANDBOXES: false,
})

interface ScenarioFixture {
  readonly scenario: string
  readonly projectId: number
  readonly workflowTemplateId: number
  readonly taskId: number
  readonly attemptId: number
  readonly claimId: number
  readonly claimRunId: string
  readonly lifecycleId: number
  readonly lifecycleRoot: string
  readonly repo: string
}

interface UatFixture {
  readonly workspace: { readonly id: number; readonly slug: string; readonly flags: string }
  readonly auth: { readonly token: string; readonly userId: number; readonly sessionId: number }
  readonly scenarios: Record<string, ScenarioFixture>
}

interface LiveProtocolChild {
  readonly pid: number
  readonly stdin: {
    readonly write: (chunk: string | Buffer) => boolean
    readonly end: () => void
  }
  readonly stdout: EventEmitter
  readonly stderr: EventEmitter
  readonly on: () => undefined
  readonly once: () => undefined
  readonly kill: (signal?: string) => boolean
}

type ServerEmission = CodexAppServerWireMessage | string

function trimEnv(name: string): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveDbPath(): string {
  const explicit = trimEnv('PADDOCK_DB_PATH')
  const dbPath = explicit ? resolve(explicit) : resolve(DATA_DIR, 'paddock.db')
  if (process.argv.includes('--help')) return dbPath
  if (!existsSync(dbPath)) throw new Error(`Paddock database not found at ${dbPath}`)
  return dbPath
}

function generatedRunId(): string {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17)
  return `${timestamp}-${randomBytes(3).toString('hex')}`
}

function resolveRunId(): string {
  const raw = trimEnv('SPEC_014C_UAT_RUN_ID') ?? generatedRunId()
  const runId = raw.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
  if (!runId) throw new Error('SPEC_014C_UAT_RUN_ID must contain at least one safe character')
  return runId
}

function log(event: string, fields: JsonObject = {}): void {
  console.log(JSON.stringify({ event, ...fields }))
}

function assert(condition: unknown, message: string, detail?: unknown): asserts condition {
  if (!condition) {
    const suffix = detail === undefined ? '' : `: ${JSON.stringify(detail)}`
    throw new Error(`${message}${suffix}`)
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function columnNames(db: Database.Database, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name))
}

function insertRow(db: Database.Database, table: string, values: Record<string, unknown>): number {
  const columns = [...columnNames(db, table)].filter((column) => Object.hasOwn(values, column))
  assert(columns.length > 0, `no insertable columns for ${table}`)
  const placeholders = columns.map(() => '?').join(', ')
  const result = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...columns.map((column) => values[column]))
  return Number(result.lastInsertRowid)
}

function legacySessionHash(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

function taskRow(db: Database.Database, fixture: ScenarioFixture, workspaceId: number): CodexAppServerDispatchTaskInput {
  const row = db.prepare(`
    SELECT id, title, description, workspace_id, project_id, assigned_to,
           github_repo, github_issue_number, workflow_template_id, workflow_template_slug
    FROM tasks
    WHERE id = ? AND workspace_id = ?
  `).get(fixture.taskId, workspaceId) as CodexAppServerDispatchTaskInput | undefined
  assert(row, 'seeded task not found', { task_id: fixture.taskId, workspace_id: workspaceId })
  return row
}

function insertWorkspace(db: Database.Database): { id: number; slug: string; flags: string } {
  const defaultWorkspace = db.prepare(`
    SELECT id, tenant_id
    FROM workspaces
    ORDER BY CASE WHEN slug = 'paddock' THEN 0 WHEN slug = 'facility' THEN 1 WHEN slug = 'default' THEN 2 ELSE 3 END, id ASC
    LIMIT 1
  `).get() as { id: number; tenant_id?: number | null } | undefined
  assert(defaultWorkspace?.id, 'default workspace not found')
  const slug = `spec-014c-hal-uat-${RUN_ID.toLowerCase()}`
  const id = insertRow(db, 'workspaces', {
    slug,
    name: `SPEC-014C HAL UAT ${RUN_ID}`,
    tenant_id: defaultWorkspace.tenant_id ?? 1,
    feature_flags: FLAGS_ON,
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
  })
  return { id, slug, flags: FLAGS_ON }
}

function insertTemporaryOperatorSession(db: Database.Database, workspaceId: number): UatFixture['auth'] {
  assert(tableExists(db, 'users'), 'users table not found')
  assert(tableExists(db, 'user_sessions'), 'user_sessions table not found')
  const username = `${MARKER.toLowerCase()}-operator`
  const userId = insertRow(db, 'users', {
    username,
    display_name: `${MARKER} Operator`,
    password_hash: `${MARKER}-not-a-login-password-hash`,
    role: 'operator',
    workspace_id: workspaceId,
    provider: 'local',
    is_approved: 1,
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
  })
  const token = randomBytes(32).toString('hex')
  const sessionId = insertRow(db, 'user_sessions', {
    token: legacySessionHash(token),
    user_id: userId,
    expires_at: NOW_UNIX + 3600,
    created_at: NOW_UNIX,
    workspace_id: workspaceId,
    ip_address: '127.0.0.1',
    user_agent: MARKER,
  })
  return { token, userId, sessionId }
}

function insertProject(db: Database.Database, workspaceId: number, scenario: string): { id: number; repo: string } {
  const slug = `spec-014c-hal-${RUN_ID.toLowerCase()}-${scenario}`
  const repo = 'racecraft-lab/Paddock'
  const id = insertRow(db, 'projects', {
    workspace_id: workspaceId,
    name: `${MARKER} ${scenario}`,
    slug,
    description: `${MARKER} disposable project for ${scenario}`,
    ticket_prefix: `C${String(scenario.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()).padEnd(3, 'X')}`,
    ticket_counter: 1,
    github_repo: repo,
    github_sync_enabled: 1,
    is_repo_sync_owner: 1,
    status: 'active',
    metadata: JSON.stringify({ marker: MARKER, scenario }),
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
  })
  return { id, repo }
}

function insertWorkflowTemplate(db: Database.Database, workspaceId: number, scenario: string): number {
  return insertRow(db, 'workflow_templates', {
    workspace_id: workspaceId,
    slug: `${STAGE_KEY}-${scenario}`,
    name: `${MARKER} ${scenario} implementation`,
    description: `${MARKER} disposable workflow template`,
    task_prompt: 'Run the SPEC-014C Codex app-server adapter with descriptor-only evidence.',
    model: 'gpt-5.4',
    agent_role: STAGE_KEY,
    created_by: MARKER,
    enabled: 1,
    allow_redacted_artifacts: 1,
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
  })
}

function insertAssignment(db: Database.Database, projectId: number): number {
  return insertRow(db, 'project_agent_assignments', {
    project_id: projectId,
    role: STAGE_KEY,
    agent_name: 'codex-app-server',
    assigned_at: NOW_UNIX,
  })
}

function insertTask(db: Database.Database, workspaceId: number, projectId: number, workflowTemplateId: number, repo: string, scenario: string): number {
  return insertRow(db, 'tasks', {
    title: `${MARKER} ${scenario}`,
    description: `${MARKER} disposable GitHub-linked assigned stage for ${scenario}. Return descriptor-only evidence only.`,
    status: 'assigned',
    priority: 'high',
    assigned_to: 'codex-app-server',
    created_by: MARKER,
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
    tags: JSON.stringify(['SPEC-014C', MARKER, scenario]),
    metadata: JSON.stringify({ marker: MARKER, scenario }),
    workspace_id: workspaceId,
    project_id: projectId,
    project_ticket_no: 1,
    github_repo: repo,
    github_issue_number: 79,
    github_synced_at: NOW_UNIX,
    workflow_template_id: workflowTemplateId,
    workflow_template_slug: STAGE_KEY,
  })
}

function insertClaim(db: Database.Database, workspaceId: number, taskId: number, attemptId: number, scenario: string): { id: number; runId: string } {
  const runId = `${MARKER}-${scenario}-claim-run`
  const id = insertRow(db, 'task_stage_claims', {
    workspace_id: workspaceId,
    task_id: taskId,
    stage_key: STAGE_KEY,
    task_stage_attempt_id: attemptId,
    claim_state: 'active',
    lease_owner: 'spec-014c-hal-uat',
    claim_run_id: runId,
    lease_started_at: NOW_UNIX,
    lease_expires_at: NOW_UNIX + 3600,
    release_reason: null,
    released_at: null,
    released_by_run_id: null,
    stale_recovered_from_claim_id: null,
    metadata_json: JSON.stringify({ marker: MARKER, scenario }),
    created_at: NOW_UNIX,
    updated_at: NOW_UNIX,
  })
  return { id, runId }
}

function releaseClaim(db: Database.Database, claimId: number, reason: 'launch_handoff_completed' | 'dispatch_failed'): void {
  db.prepare(`
    UPDATE task_stage_claims
    SET claim_state = 'released',
        release_reason = ?,
        released_at = ?,
        released_by_run_id = claim_run_id,
        updated_at = ?
    WHERE id = ? AND claim_state = 'active'
  `).run(reason, NOW_UNIX, NOW_UNIX, claimId)
}

function seedScenario(db: Database.Database, workspaceId: number, scenario: string): ScenarioFixture {
  const project = insertProject(db, workspaceId, scenario)
  const workflowTemplateId = insertWorkflowTemplate(db, workspaceId, scenario)
  insertAssignment(db, project.id)
  const taskId = insertTask(db, workspaceId, project.id, workflowTemplateId, project.repo, scenario)
  const attempt = createTaskStageAttempt(db, {
    workspaceId,
    taskId,
    stageKey: STAGE_KEY,
    attemptNumber: 1,
    status: 'running',
    observedAt: NOW_ISO,
    runId: `${MARKER}-${scenario}-run`,
    actorType: 'test',
    actorId: MARKER,
    message: `${MARKER} ${scenario} current attempt`,
    metadata: { marker: MARKER, scenario },
  })
  const claim = insertClaim(db, workspaceId, taskId, Number(attempt.id), scenario)
  const lifecycleMetadata = {
    reason_code: 'spec_014c_hal_uat',
    detail: `${MARKER} ${scenario}`,
  }
  const created = createSandboxLifecycle(db, {
    workspaceId,
    productLineSlug: `spec-014c-${RUN_ID}`,
    taskId,
    stageKey: STAGE_KEY,
    attemptId: Number(attempt.id),
    taskStageAttemptId: Number(attempt.id),
    taskStageClaimId: claim.id,
    owner: 'paddock',
    sandboxRoot: UAT_SANDBOX_ROOT,
    now: NOW_ISO,
    metadata: lifecycleMetadata,
  })
  assert(created.ok && created.lifecycle, 'sandbox lifecycle create failed', created)
  const root = resolveSandboxRoot({
    sandboxRoot: UAT_SANDBOX_ROOT,
    sanitizedRelativePath: created.lifecycle.sanitized_relative_path,
  })
  mkdirSync(root.absolutePath, { recursive: true })
  const prepared = prepareSandboxLifecycle(db, Number(created.lifecycle.id), {
    now: NOW_ISO,
    metadata: lifecycleMetadata,
  })
  assert(prepared.ok && prepared.lifecycle, 'sandbox lifecycle prepare failed', prepared)
  return {
    scenario,
    projectId: project.id,
    workflowTemplateId,
    taskId,
    attemptId: Number(attempt.id),
    claimId: claim.id,
    claimRunId: claim.runId,
    lifecycleId: Number(prepared.lifecycle.id),
    lifecycleRoot: root.absolutePath,
    repo: project.repo,
  }
}

function seedFixtures(db: Database.Database): UatFixture {
  const workspace = insertWorkspace(db)
  const auth = insertTemporaryOperatorSession(db, workspace.id)
  const scenarioNames = [
    'real-launch',
    'user-input',
    'approval',
    'tool-file',
    'capability',
    'timeout',
    'malformed',
    'unsafe-evidence',
    'allowed-redaction',
    'cleanup-failure',
    'flag-off',
  ]
  const scenarios: Record<string, ScenarioFixture> = {}
  for (const scenario of scenarioNames) {
    scenarios[scenario] = seedScenario(db, workspace.id, scenario)
  }
  return { workspace, auth, scenarios }
}

function messageMethod(message: CodexAppServerWireMessage): string {
  return 'method' in message && typeof message.method === 'string' ? message.method : ''
}

function buildLiveProtocolChild(
  byClientMethod: Map<string, readonly ServerEmission[]>,
  options: { readonly pid?: number; readonly onKill?: (signal?: string) => void } = {},
): { readonly child: LiveProtocolChild; readonly writtenMessages: readonly CodexAppServerWireMessage[] } {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const writtenMessages: CodexAppServerWireMessage[] = []
  const child = {
    pid: options.pid ?? 14014,
    stdin: {
      write: (chunk: string | Buffer) => {
        const line = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
        const message = JSON.parse(line.trim()) as CodexAppServerWireMessage
        writtenMessages.push(message)
        const method = messageMethod(message)
        for (const serverMessage of byClientMethod.get(method) ?? []) {
          queueMicrotask(() => {
            const payload = typeof serverMessage === 'string' ? serverMessage : JSON.stringify(serverMessage)
            stdout.emit('data', Buffer.from(`${payload}\n`))
          })
        }
        return true
      },
      end: () => undefined,
    },
    stdout,
    stderr,
    on: () => undefined,
    once: () => undefined,
    kill: (signal?: string) => {
      options.onKill?.(signal)
      return true
    },
  } satisfies LiveProtocolChild
  return { child, writtenMessages }
}

function successfulServerMessages(agentSummary = 'Descriptor-only SPEC-014C HAL UAT completion evidence.'): Map<string, readonly ServerEmission[]> {
  return new Map<string, readonly ServerEmission[]>([
    ['initialize', [buildCodexAppServerInitializeResponse()]],
    ['initialized', []],
    ['thread/start', [buildCodexAppServerThreadStartResponse(), buildCodexAppServerThreadStarted()]],
    ['turn/start', [
      buildCodexAppServerTurnStartResponse(),
      buildCodexAppServerTurnStarted(),
      buildCodexAppServerAgentMessageCompleted({
        params: {
          threadId: 'thr_spec_014c_001',
          turnId: 'turn_spec_014c_001',
          item: {
            id: `item_${RUN_ID}`,
            type: 'agentMessage',
            text: agentSummary,
            phase: 'final_answer',
            status: 'completed',
          },
        },
      }),
      buildCodexAppServerTurnCompleted('completed'),
    ]],
  ])
}

function unsupportedServerMessages(index: number): Map<string, readonly ServerEmission[]> {
  const fixture = CODEX_APP_SERVER_UNSUPPORTED_REQUEST_FIXTURES[index]
  assert(fixture, 'unsupported fixture missing', { index })
  return new Map<string, readonly ServerEmission[]>([
    ['initialize', [buildCodexAppServerInitializeResponse()]],
    ['initialized', []],
    ['thread/start', [buildCodexAppServerThreadStartResponse(), buildCodexAppServerThreadStarted()]],
    ['turn/start', [
      buildCodexAppServerTurnStartResponse(),
      buildCodexAppServerTurnStarted(),
      fixture.message,
    ]],
  ])
}

function malformedServerMessages(): Map<string, readonly ServerEmission[]> {
  return new Map<string, readonly ServerEmission[]>([
    ['initialize', [buildCodexAppServerInitializeResponse()]],
    ['initialized', []],
    ['thread/start', [buildCodexAppServerThreadStartResponse(), buildCodexAppServerThreadStarted()]],
    ['turn/start', ['{"method": "turn/started", "params": ']],
  ])
}

function timeoutServerMessages(): Map<string, readonly ServerEmission[]> {
  return new Map<string, readonly ServerEmission[]>([
    ['initialize', [buildCodexAppServerInitializeResponse()]],
    ['initialized', []],
    ['thread/start', [buildCodexAppServerThreadStartResponse(), buildCodexAppServerThreadStarted()]],
    ['turn/start', [buildCodexAppServerTurnStartResponse(), buildCodexAppServerTurnStarted()]],
  ])
}

function admissionInput(db: Database.Database, fixture: ScenarioFixture, workspaceId: number) {
  return buildCodexAppServerDispatchAdmissionInputFromDatabase({
    db,
    task: taskRow(db, fixture, workspaceId),
    claimAdmission: { acquired: true, task_stage_attempt_id: fixture.attemptId } as never,
    activeClaimId: fixture.claimId,
    activeClaimStageKey: STAGE_KEY,
    claimRunId: fixture.claimRunId,
    correlationId: `${MARKER}-${fixture.scenario}`,
    now: NOW_UNIX,
    dataDir: DATA_DIR,
    sandboxRoot: UAT_SANDBOX_ROOT,
  })
}

async function runDirectAdapterScenario(
  db: Database.Database,
  fixture: ScenarioFixture,
  workspaceId: number,
  options: {
    readonly spawn: () => unknown
    readonly timeoutMs?: number
    readonly cleanupLifecycle?: () => { readonly status: 'cleanup_failed'; readonly phase: 'lifecycle_cleanup'; readonly errorLabel: string }
  },
) {
  const decision = evaluateCodexAppServerDispatchAdmission(admissionInput(db, fixture, workspaceId))
  assert(decision.decision === 'launch', 'scenario did not pass launch admission', {
    scenario: fixture.scenario,
    reason_codes: decision.reasonCodes,
  })
  const result = await launchCodexAppServerAttempt({
    ...decision.launchInput,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  }, {
    spawn: options.spawn,
    protocolSequence: [],
    now: () => new Date().toISOString(),
    ...(options.cleanupLifecycle ? { cleanupLifecycle: options.cleanupLifecycle } : {}),
  })
  persistCodexAppServerDispatchEvidence({
    db,
    runEvidence: result.runEvidence,
    activityPayload: result.activityPayload,
  })
  releaseClaim(db, fixture.claimId, result.runEvidence.status === 'completed' ? 'launch_handoff_completed' : 'dispatch_failed')
  return result
}

async function request(auth: UatFixture['auth'], method: string, route: string): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      accept: 'application/json',
      cookie: `mc-session=${encodeURIComponent(auth.token)}`,
    },
  })
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { parse_error: true, text: text.slice(0, 200) }
  }
  return { status: response.status, json }
}

function safeEvidence(result: Awaited<ReturnType<typeof launchCodexAppServerAttempt>>): JsonObject {
  return {
    status: result.runEvidence.status,
    outcome: result.runEvidence.outcome,
    phase: result.runEvidence.phase,
    reason_code: result.runEvidence.reasonCode ?? null,
    protocol_steps: result.protocolSteps.map((step) => step.step),
    protocol: result.runEvidence.protocol ?? null,
    usage: result.runEvidence.usage,
    artifact_ref_count: result.runEvidence.artifactRefs?.length ?? 0,
    redaction_applied: result.runEvidence.safety.redactionApplied,
    subprocess: result.subprocess
      ? {
          pid_recorded: result.subprocess.pid !== null,
          status: result.subprocess.status,
          stdout_line_count: result.subprocess.stdoutLineCount,
          stderr_line_count: result.subprocess.stderrLineCount,
          reason_code: result.subprocess.reasonCode ?? null,
        }
      : null,
    cleanup_evidence: result.cleanupEvidence
      ? {
          status: result.cleanupEvidence.status,
          phase: result.cleanupEvidence.phase,
          reason_code: result.cleanupEvidence.reasonCode,
          preserved_terminal_outcome: result.cleanupEvidence.preservedTerminalOutcome ?? null,
        }
      : null,
  }
}

async function runAssertions(db: Database.Database, fixture: UatFixture): Promise<JsonObject> {
  const workspaceId = fixture.workspace.id
  const health = await fetch(`${BASE_URL}/api/status?action=health`)
  assert(health.status === 200, 'health status failed', { status: health.status })
  const overview = await request(fixture.auth, 'GET', `/api/status?action=overview&workspace_id=${workspaceId}`)
  assert(overview.status === 200, 'authenticated status overview failed', overview)

  const real = await tryDispatchCodexAppServerTask({
    db,
    task: taskRow(db, fixture.scenarios['real-launch'], workspaceId),
    claimAdmission: { acquired: true, task_stage_attempt_id: fixture.scenarios['real-launch'].attemptId } as never,
    activeClaimId: fixture.scenarios['real-launch'].claimId,
    activeClaimStageKey: STAGE_KEY,
    claimRunId: fixture.scenarios['real-launch'].claimRunId,
    correlationId: `${MARKER}-real-launch`,
    now: NOW_UNIX,
    dataDir: DATA_DIR,
    sandboxRoot: UAT_SANDBOX_ROOT,
    releaseClaim: (reason) => releaseClaim(db, fixture.scenarios['real-launch'].claimId, reason),
  })
  assert(real.handled === true && real.success === true, 'real Codex app-server launch failed', real)
  assert(real.launchResult.runEvidence.status === 'completed', 'real Codex app-server did not complete successfully', safeEvidence(real.launchResult))

  const scenarioEvidence: Record<string, JsonObject> = {
    real_launch: safeEvidence(real.launchResult),
  }

  const unsupportedIndexes: Record<string, number> = {
    'user-input': 0,
    approval: 2,
    'tool-file': 3,
    capability: 6,
  }
  for (const [scenario, index] of Object.entries(unsupportedIndexes)) {
    const fake = buildLiveProtocolChild(unsupportedServerMessages(index))
    const result = await runDirectAdapterScenario(db, fixture.scenarios[scenario], workspaceId, {
      spawn: () => fake.child,
    })
    scenarioEvidence[scenario.replace('-', '_')] = {
      ...safeEvidence(result),
      written_client_methods: fake.writtenMessages.map(messageMethod),
    }
  }

  const timeoutFake = buildLiveProtocolChild(timeoutServerMessages())
  const timeout = await runDirectAdapterScenario(db, fixture.scenarios.timeout, workspaceId, {
    spawn: () => timeoutFake.child,
    timeoutMs: 25,
  })
  scenarioEvidence.timeout = safeEvidence(timeout)

  const malformedFake = buildLiveProtocolChild(malformedServerMessages())
  const malformed = await runDirectAdapterScenario(db, fixture.scenarios.malformed, workspaceId, {
    spawn: () => malformedFake.child,
  })
  scenarioEvidence.malformed_protocol = safeEvidence(malformed)

  const unsafeFake = buildLiveProtocolChild(successfulServerMessages('Unsafe host path evidence /Users/operator/private/raw-output.json must be rejected.'))
  const unsafe = await runDirectAdapterScenario(db, fixture.scenarios['unsafe-evidence'], workspaceId, {
    spawn: () => unsafeFake.child,
  })
  scenarioEvidence.unsafe_evidence = safeEvidence(unsafe)

  const redactionFake = buildLiveProtocolChild(successfulServerMessages('Safe summary with Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345 redacted before descriptor publication.'))
  const redaction = await runDirectAdapterScenario(db, fixture.scenarios['allowed-redaction'], workspaceId, {
    spawn: () => redactionFake.child,
  })
  scenarioEvidence.allowed_redaction = safeEvidence(redaction)

  const cleanupFake = buildLiveProtocolChild(successfulServerMessages())
  const cleanupFailure = await runDirectAdapterScenario(db, fixture.scenarios['cleanup-failure'], workspaceId, {
    spawn: () => cleanupFake.child,
    cleanupLifecycle: () => ({
      status: 'cleanup_failed',
      phase: 'lifecycle_cleanup',
      errorLabel: 'spec_014c_uat_cleanup_failure_fixture',
    }),
  })
  scenarioEvidence.cleanup_failure = safeEvidence(cleanupFailure)

  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = ? WHERE id = ?').run(FLAGS_OFF, NOW_UNIX, workspaceId)
  const flagOff = await tryDispatchCodexAppServerTask({
    db,
    task: taskRow(db, fixture.scenarios['flag-off'], workspaceId),
    claimAdmission: { acquired: true, task_stage_attempt_id: fixture.scenarios['flag-off'].attemptId } as never,
    activeClaimId: fixture.scenarios['flag-off'].claimId,
    activeClaimStageKey: STAGE_KEY,
    claimRunId: fixture.scenarios['flag-off'].claimRunId,
    correlationId: `${MARKER}-flag-off`,
    now: NOW_UNIX,
    dataDir: DATA_DIR,
    sandboxRoot: UAT_SANDBOX_ROOT,
    releaseClaim: (reason) => releaseClaim(db, fixture.scenarios['flag-off'].claimId, reason),
  })
  assert(flagOff.handled === true && flagOff.success === false && flagOff.error === 'feature_disabled', 'flag-off did not block before launch', flagOff)
  db.prepare('UPDATE workspaces SET feature_flags = ?, updated_at = ? WHERE id = ?').run(FLAGS_ON, NOW_UNIX, workspaceId)
  scenarioEvidence.flag_off = {
    decision: flagOff.handled ? flagOff.decision.decision : 'unhandled',
    error: flagOff.handled && !flagOff.success ? flagOff.error : null,
    reason_codes: flagOff.handled ? flagOff.decision.reasonCodes : [],
    evidence_status: flagOff.handled ? flagOff.decision.runEvidence.status : null,
  }

  for (const [scenario, evidence] of Object.entries(scenarioEvidence)) {
    log('scenario_passed', { scenario, evidence })
  }

  return {
    health_status: health.status,
    authenticated_status: overview.status,
    scenarios: scenarioEvidence,
  }
}

function deleteIfExists(db: Database.Database, table: string, sql: string, params: unknown[], deletions: Record<string, number>): void {
  if (!tableExists(db, table)) return
  deletions[table] = db.prepare(sql).run(...params).changes
}

function cleanup(db: Database.Database, fixture: UatFixture | null): Record<string, number> {
  rmSync(UAT_SANDBOX_ROOT, { recursive: true, force: true })
  const deletions: Record<string, number> = {}
  if (!fixture?.workspace?.id) return deletions
  const workspaceId = fixture.workspace.id
  const markerLike = `%${MARKER}%`
  deleteIfExists(db, 'task_artifacts', 'DELETE FROM task_artifacts WHERE workspace_id = ? OR content_json LIKE ? OR content_markdown LIKE ?', [workspaceId, markerLike, markerLike], deletions)
  deleteIfExists(db, 'task_stage_attempt_events', 'DELETE FROM task_stage_attempt_events WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'task_stage_claims', 'DELETE FROM task_stage_claims WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'agent_sandbox_lifecycle_events', 'DELETE FROM agent_sandbox_lifecycle_events WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'agent_sandbox_lifecycles', 'DELETE FROM agent_sandbox_lifecycles WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'task_stage_attempts', 'DELETE FROM task_stage_attempts WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'runs', 'DELETE FROM runs WHERE workspace_id = ? OR tags LIKE ? OR metadata LIKE ?', [workspaceId, markerLike, markerLike], deletions)
  deleteIfExists(db, 'activities', 'DELETE FROM activities WHERE workspace_id = ? OR data LIKE ?', [workspaceId, markerLike], deletions)
  deleteIfExists(db, 'github_sync_lifecycle_runs', 'DELETE FROM github_sync_lifecycle_runs WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'github_sync_lifecycle_controls', 'DELETE FROM github_sync_lifecycle_controls WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'task_claim_control_idempotency_keys', 'DELETE FROM task_claim_control_idempotency_keys WHERE workspace_id = ?', [workspaceId], deletions)
  deleteIfExists(db, 'tasks', 'DELETE FROM tasks WHERE workspace_id = ? OR title LIKE ?', [workspaceId, markerLike], deletions)
  deleteIfExists(db, 'project_agent_assignments', 'DELETE FROM project_agent_assignments WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ?)', [workspaceId], deletions)
  deleteIfExists(db, 'workflow_templates', 'DELETE FROM workflow_templates WHERE workspace_id = ? AND created_by = ?', [workspaceId, MARKER], deletions)
  deleteIfExists(db, 'projects', 'DELETE FROM projects WHERE workspace_id = ? OR slug LIKE ?', [workspaceId, `%${RUN_ID.toLowerCase()}%`], deletions)
  deleteIfExists(db, 'user_sessions', 'DELETE FROM user_sessions WHERE workspace_id = ? OR user_agent = ?', [workspaceId, MARKER], deletions)
  deleteIfExists(db, 'users', 'DELETE FROM users WHERE workspace_id = ? AND username = ?', [workspaceId, `${MARKER.toLowerCase()}-operator`], deletions)
  deleteIfExists(db, 'workspaces', 'DELETE FROM workspaces WHERE id = ? OR slug = ?', [workspaceId, fixture.workspace.slug], deletions)
  return deletions
}

function cleanupCounts(db: Database.Database, fixture: UatFixture | null): Record<string, number | boolean> {
  const counts: Record<string, number | boolean> = {
    sandbox_root_exists: existsSync(UAT_SANDBOX_ROOT),
  }
  if (!fixture?.workspace?.id) return counts
  const workspaceId = fixture.workspace.id
  const markerLike = `%${MARKER}%`
  const countIfExists = (table: string, sql: string, params: unknown[]) => {
    if (!tableExists(db, table)) return
    counts[table] = (db.prepare(sql).get(...params) as { count: number }).count
  }
  countIfExists('workspaces', 'SELECT COUNT(*) AS count FROM workspaces WHERE id = ? OR slug = ?', [workspaceId, fixture.workspace.slug])
  countIfExists('users', 'SELECT COUNT(*) AS count FROM users WHERE workspace_id = ? AND username = ?', [workspaceId, `${MARKER.toLowerCase()}-operator`])
  countIfExists('user_sessions', 'SELECT COUNT(*) AS count FROM user_sessions WHERE workspace_id = ? OR user_agent = ?', [workspaceId, MARKER])
  countIfExists('projects', 'SELECT COUNT(*) AS count FROM projects WHERE workspace_id = ? OR slug LIKE ?', [workspaceId, `%${RUN_ID.toLowerCase()}%`])
  countIfExists('workflow_templates', 'SELECT COUNT(*) AS count FROM workflow_templates WHERE workspace_id = ? AND created_by = ?', [workspaceId, MARKER])
  countIfExists('tasks', 'SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ? OR title LIKE ?', [workspaceId, markerLike])
  countIfExists('task_stage_attempts', 'SELECT COUNT(*) AS count FROM task_stage_attempts WHERE workspace_id = ?', [workspaceId])
  countIfExists('task_stage_attempt_events', 'SELECT COUNT(*) AS count FROM task_stage_attempt_events WHERE workspace_id = ?', [workspaceId])
  countIfExists('task_stage_claims', 'SELECT COUNT(*) AS count FROM task_stage_claims WHERE workspace_id = ?', [workspaceId])
  countIfExists('agent_sandbox_lifecycles', 'SELECT COUNT(*) AS count FROM agent_sandbox_lifecycles WHERE workspace_id = ?', [workspaceId])
  countIfExists('agent_sandbox_lifecycle_events', 'SELECT COUNT(*) AS count FROM agent_sandbox_lifecycle_events WHERE workspace_id = ?', [workspaceId])
  countIfExists('runs', 'SELECT COUNT(*) AS count FROM runs WHERE workspace_id = ? OR tags LIKE ? OR metadata LIKE ?', [workspaceId, markerLike, markerLike])
  countIfExists('activities', 'SELECT COUNT(*) AS count FROM activities WHERE workspace_id = ? OR data LIKE ?', [workspaceId, markerLike])
  countIfExists('task_artifacts', 'SELECT COUNT(*) AS count FROM task_artifacts WHERE workspace_id = ? OR content_json LIKE ? OR content_markdown LIKE ?', [workspaceId, markerLike, markerLike])
  return counts
}

export async function runSpec014cHalTargetUat(): Promise<void> {
  const dbPath = resolveDbPath()
  log('uat_start', {
    marker: MARKER,
    app_root: APP_ROOT,
    db_path: dbPath,
    base_url: BASE_URL,
    sandbox_root_id: 'workspace_configured_sandboxes',
  })
  const db = new Database(dbPath)
  let fixture: UatFixture | null = null
  try {
    fixture = db.transaction(() => seedFixtures(db))()
    log('fixture_seeded', {
      marker: MARKER,
      workspace_id: fixture.workspace.id,
      scenario_task_ids: Object.fromEntries(Object.entries(fixture.scenarios).map(([name, value]) => [name, value.taskId])),
    })
    const evidence = await runAssertions(db, fixture)
    const deletions = db.transaction(() => cleanup(db, fixture))()
    const counts = cleanupCounts(db, fixture)
    assert(Object.values(counts).every((value) => value === 0 || value === false), 'cleanup left marker-scoped residue', counts)
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      db.pragma('wal_checkpoint(PASSIVE)')
    }
    log('uat_passed', { marker: MARKER, evidence, cleanup: { deletions, counts } })
  } catch (error) {
    let cleanupResult: unknown = null
    let counts: unknown = null
    try {
      cleanupResult = db.transaction(() => cleanup(db, fixture))()
      counts = cleanupCounts(db, fixture)
    } catch (cleanupError) {
      cleanupResult = { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }
    }
    log('uat_failed', {
      marker: MARKER,
      message: error instanceof Error ? error.message : String(error),
      cleanup: cleanupResult,
      cleanup_counts: counts,
    })
    throw error
  } finally {
    db.close()
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log([
      'Usage: pnpm exec vitest run tests/integration/spec-014c-hal-target-uat.test.ts',
      '',
      'Environment:',
      '  PADDOCK_DB_PATH or PADDOCK_DATA_DIR points at the target Paddock database.',
      '  PADDOCK_BASE_URL defaults to http://127.0.0.1:3000.',
      '  SPEC_014C_UAT_RUN_ID optionally fixes the marker suffix.',
    ].join('\n'))
    return
  }

  try {
    await runSpec014cHalTargetUat()
  } catch {
    process.exitCode = 1
  }
}

const currentUrl = pathToFileURL(process.argv[1] ?? '').href
if (import.meta.url === currentUrl) {
  await main()
}
