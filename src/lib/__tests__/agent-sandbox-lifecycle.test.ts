import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_SANDBOX_LIFECYCLE_STATUSES,
  AGENT_SANDBOX_OWNERS,
  buildSandboxKey,
  buildSandboxLifecycleReadModel,
  cleanupSandboxLifecycle,
  createSandboxLifecycle,
  markSandboxLifecycleRunning,
  markSandboxLifecycleTerminal,
  normalizeSandboxSegment,
  prepareSandboxLifecycle,
  rollbackSandboxLifecycle,
  resolveSandboxRoot,
  runFakeSandboxLifecycle,
} from '../agent-sandbox-lifecycle'
import { openAgentSandboxLifecycleDb, sandboxLifecycleInput, tableCount } from './agent-sandbox-lifecycle-fixtures'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() ?? '', { recursive: true, force: true })
  }
})

function tempDataDir(): string {
  const path = mkdtempSync(join(tmpdir(), 'mc-sandbox-lifecycle-'))
  tempDirs.push(path)
  return path
}

function lifecycleId(result: ReturnType<typeof createSandboxLifecycle>): number {
  if (!result.lifecycle) throw new Error('missing lifecycle')
  return Number(result.lifecycle.id)
}

describe('agent sandbox lifecycle vocabulary and keys', () => {
  it('exports closed owner and lifecycle status vocabularies', () => {
    expect(AGENT_SANDBOX_OWNERS).toEqual(['paddock', 'openclaw', 'external_harness'])
    expect(AGENT_SANDBOX_LIFECYCLE_STATUSES).toEqual([
      'created',
      'prepared',
      'running',
      'terminal',
      'cleanup_pending',
      'cleaned_up',
      'rolled_back',
      'cleanup_failed',
    ])
  })

  it('builds the deterministic sandbox key from sanitized ID segments', () => {
    expect(buildSandboxKey(sandboxLifecycleInput())).toBe(
      'workspace/1/product-line/paddock/task/100/stage/issue_remediation/attempt/456/owner/paddock',
    )
  })

  it.each([
    '../escape',
    '/absolute',
    'has/slash',
    'has\\backslash',
    'con',
    'bad space',
    'bad:colon',
    'x'.repeat(81),
    'zero\u200Bwidth',
    'Cafe\u0301',
  ])('rejects unsafe segment %s', (segment) => {
    expect(() => normalizeSandboxSegment(segment, 'stage')).toThrow(/invalid_stage_segment/)
  })

  it('rejects root escape attempts before resolving a sandbox path', () => {
    const dataDir = tempDataDir()

    expect(() => resolveSandboxRoot({
      dataDir,
      sanitizedRelativePath: 'workspace/1/../../outside',
    })).toThrow(/invalid_relative_path_segment/)
    for (const unsafeRelativePath of [
      'workspace/con',
      'workspace/bad:colon',
      'workspace/zero\u200Bwidth',
      `workspace/${'x'.repeat(81)}`,
    ]) {
      expect(() => resolveSandboxRoot({
        dataDir,
        sanitizedRelativePath: unsafeRelativePath,
      })).toThrow(/invalid_relative_path_segment/)
    }
  })
})

describe('agent sandbox lifecycle mutations', () => {
  it('blocks every mutation when FEATURE_AGENT_RUNNER_SANDBOXES is off without writing rows', () => {
    const db = openAgentSandboxLifecycleDb(false)

    expect(createSandboxLifecycle(db, sandboxLifecycleInput())).toMatchObject({
      ok: false,
      blocked: true,
      reason: 'feature_flag_off',
    })
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(0)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBe(0)

    const model = buildSandboxLifecycleReadModel(db, { workspaceId: 1, taskId: 100 })
    expect(model.feature_flag).toEqual({
      key: 'FEATURE_AGENT_RUNNER_SANDBOXES',
      enabled: false,
      mutation_state: 'disabled',
    })

    const enabledDb = openAgentSandboxLifecycleDb(true)
    const created = createSandboxLifecycle(enabledDb, sandboxLifecycleInput())
    const id = lifecycleId(created)
    enabledDb.prepare("UPDATE workspaces SET feature_flags = '{\"FEATURE_AGENT_RUNNER_SANDBOXES\":false}' WHERE id = 1").run()
    const beforeLifecycleRows = tableCount(enabledDb, 'agent_sandbox_lifecycles')
    const beforeEventRows = tableCount(enabledDb, 'agent_sandbox_lifecycle_events')

    for (const mutation of [
      () => prepareSandboxLifecycle(enabledDb, id),
      () => markSandboxLifecycleRunning(enabledDb, id),
      () => markSandboxLifecycleTerminal(enabledDb, id),
      () => cleanupSandboxLifecycle(enabledDb, id),
      () => rollbackSandboxLifecycle(enabledDb, id),
    ]) {
      expect(mutation()).toMatchObject({ ok: false, blocked: true, reason: 'feature_flag_off' })
    }
    expect(tableCount(enabledDb, 'agent_sandbox_lifecycles')).toBe(beforeLifecycleRows)
    expect(tableCount(enabledDb, 'agent_sandbox_lifecycle_events')).toBe(beforeEventRows)
  })

  it('does not touch fake artifacts when fake owner lifecycle creation is feature-flag blocked', () => {
    const db = openAgentSandboxLifecycleDb(false)
    const dataDir = tempDataDir()

    expect(runFakeSandboxLifecycle(db, sandboxLifecycleInput({ dataDir }))).toMatchObject({
      ok: false,
      blocked: true,
      reason: 'feature_flag_off',
    })
    expect(existsSync(join(dataDir, 'sandboxes'))).toBe(false)
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(0)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBe(0)
  })

  it('creates, prepares, runs, terminals, and cleans up fake owner lifecycles without a real launch', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const dataDir = tempDataDir()

    for (const owner of AGENT_SANDBOX_OWNERS) {
      const result = runFakeSandboxLifecycle(db, sandboxLifecycleInput({ owner, dataDir }))
      expect(result).toMatchObject({ ok: true, reason: 'cleaned_up' })
      expect(result.lifecycle).toMatchObject({ owner, status: 'cleaned_up' })
    }

    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(3)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBeGreaterThanOrEqual(15)
    const helperSource = readFileSync(join(process.cwd(), 'src/lib/agent-sandbox-lifecycle.ts'), 'utf8')
    expect(helperSource).not.toMatch(
      /runOpenClaw|advanceTaskChain|createTask|from ['"].*task-dispatch|from ['"].*openclaw|child_process/,
    )
    expect(helperSource).not.toMatch(
      /components\/|adapter[_-]?manifest|retryTask|releaseTask|cancelTask|debugTask|successor|resourcePolicy|tokenAccounting|autoMerge/i,
    )
  })

  it('reuses matching nonterminal create attempts and rejects conflicting duplicates without mutating existing evidence', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const first = createSandboxLifecycle(db, sandboxLifecycleInput())
    const firstEventCount = tableCount(db, 'agent_sandbox_lifecycle_events')
    const reused = createSandboxLifecycle(db, sandboxLifecycleInput())
    const conflict = createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      rootId: 'alternate_sandbox_root',
    })

    expect(first).toMatchObject({ ok: true, reason: 'created' })
    expect(reused).toMatchObject({ ok: true, reused: true, reason: 'create_reused' })
    expect(conflict).toMatchObject({ ok: false, reason: 'sandbox_key_conflict' })
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(1)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBe(firstEventCount + 1)
  })

  it('rejects duplicate-normalized sandbox key conflicts without mutating existing evidence', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const first = createSandboxLifecycle(db, sandboxLifecycleInput({ attemptId: 456 }))
    const firstEventCount = tableCount(db, 'agent_sandbox_lifecycle_events')
    const conflict = createSandboxLifecycle(db, {
      ...sandboxLifecycleInput({ attemptId: '456' }),
      rootId: 'alternate_sandbox_root',
    })

    expect(first).toMatchObject({ ok: true, reason: 'created' })
    expect(conflict).toMatchObject({ ok: false, reason: 'sandbox_key_conflict' })
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(1)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBe(firstEventCount)
  })

  it('rejects existing duplicate rows with conflicting owner or path projections', () => {
    for (const projectionUpdate of [
      "owner = 'openclaw'",
      "sanitized_relative_path = 'workspace/1/product-line/paddock/task/100/stage/issue_remediation/attempt/456/owner/openclaw'",
    ]) {
      const db = openAgentSandboxLifecycleDb(true)
      const first = createSandboxLifecycle(db, sandboxLifecycleInput())
      const firstEventCount = tableCount(db, 'agent_sandbox_lifecycle_events')
      db.prepare(`UPDATE agent_sandbox_lifecycles SET ${projectionUpdate} WHERE id = ?`).run(lifecycleId(first))

      expect(createSandboxLifecycle(db, sandboxLifecycleInput())).toMatchObject({
        ok: false,
        reason: 'sandbox_key_conflict',
      })
      expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBe(firstEventCount)
    }
  })

  it('fails closed for unsafe identifiers and metadata before persisting lifecycle rows', () => {
    const db = openAgentSandboxLifecycleDb(true)

    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      rootId: '../operator-root',
    })).toThrow(/invalid_root_id_segment/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      handleId: 'provider/session/123',
    })).toThrow(/invalid_handle_segment/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      metadata: { provider_payload: { prompt: 'raw prompt' } },
    })).toThrow(/metadata_key_not_allowed/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      metadata: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456' },
    })).toThrow(/metadata_secret_shaped/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      metadata: { raw_session_data: 'session transcript' },
    })).toThrow(/metadata_key_not_allowed/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      metadata: { token: 'sk-123456789012345678901234567890' },
    })).toThrow(/metadata_secret_shaped/)
    expect(() => createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      metadata: { path: '/Users/operator/private/path' },
    })).toThrow(/metadata_absolute_path/)
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(0)
  })

  it('persists only allowlisted reason metadata', () => {
    const db = openAgentSandboxLifecycleDb(true)

    expect(createSandboxLifecycle(db, {
      ...sandboxLifecycleInput(),
      handleId: 'fake_handle_1',
      metadata: { reason_code: 'created_for_test', detail: 'bounded fake lifecycle' },
    })).toMatchObject({
      ok: true,
      reason: 'created',
      lifecycle: { handle_id: 'fake_handle_1' },
    })
  })

  it('enforces transition order and preserves durable cleanup or cleanup failure evidence', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const dataDir = tempDataDir()
    const created = createSandboxLifecycle(db, sandboxLifecycleInput({ dataDir }))
    const id = lifecycleId(created)

    expect(markSandboxLifecycleRunning(db, id)).toMatchObject({ ok: false, reason: 'invalid_lifecycle_transition' })
    expect(prepareSandboxLifecycle(db, id)).toMatchObject({ ok: true, reason: 'prepared' })
    expect(markSandboxLifecycleRunning(db, id)).toMatchObject({ ok: true, reason: 'running_marked' })
    expect(markSandboxLifecycleTerminal(db, id)).toMatchObject({ ok: true, reason: 'terminal_marked' })

    const root = join(
      dataDir,
      'sandboxes',
      created.lifecycle?.sanitized_relative_path ?? '',
    )
    expect(cleanupSandboxLifecycle(db, id, { dataDir, failCleanup: true })).toMatchObject({
      ok: false,
      reason: 'cleanup_failed',
    })
    expect(cleanupSandboxLifecycle(db, id, { dataDir })).toMatchObject({ ok: true, reason: 'cleaned_up' })
    expect(existsSync(root)).toBe(false)
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(1)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBeGreaterThanOrEqual(7)
  })

  it('records cleanup_failed when real filesystem removal fails', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const dataDir = tempDataDir()
    const sandboxRoot = join(dataDir, 'sandbox-root')
    const created = createSandboxLifecycle(db, {
      ...sandboxLifecycleInput({ dataDir }),
      sandboxRoot,
    })
    const root = resolveSandboxRoot({
      sandboxRoot,
      sanitizedRelativePath: created.lifecycle?.sanitized_relative_path ?? '',
    })
    mkdirSync(root.absolutePath, { recursive: true })
    const lockedParent = dirname(root.absolutePath)
    chmodSync(lockedParent, 0o500)
    const id = lifecycleId(created)
    expect(prepareSandboxLifecycle(db, id)).toMatchObject({ ok: true })
    expect(markSandboxLifecycleTerminal(db, id)).toMatchObject({ ok: true })

    try {
      expect(cleanupSandboxLifecycle(db, id, { sandboxRoot })).toMatchObject({
        ok: false,
        reason: 'cleanup_failed',
        lifecycle: { status: 'cleanup_failed' },
      })
    } finally {
      chmodSync(lockedParent, 0o700)
    }
    const model = buildSandboxLifecycleReadModel(db, { workspaceId: 1, taskId: 100 })
    expect(model.lifecycles[0]).toMatchObject({ status: 'cleanup_failed' })
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBeGreaterThanOrEqual(5)
  })

  it('leaves stale cleanup_pending lifecycle evidence inspectable without automatic reaping', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const created = createSandboxLifecycle(db, sandboxLifecycleInput())
    const id = lifecycleId(created)
    expect(prepareSandboxLifecycle(db, id)).toMatchObject({ ok: true })
    expect(markSandboxLifecycleTerminal(db, id)).toMatchObject({ ok: true })
    db.prepare(`
      UPDATE agent_sandbox_lifecycles
      SET status = 'cleanup_pending', cleanup_requested_at = ?, updated_at = ?
      WHERE id = ?
    `).run('2026-05-28T01:00:00.000Z', '2026-05-28T01:00:00.000Z', id)

    const model = buildSandboxLifecycleReadModel(db, { workspaceId: 1, taskId: 100 })
    expect(model.lifecycles).toHaveLength(1)
    expect(model.lifecycles[0]).toMatchObject({ id: String(id), status: 'cleanup_pending' })
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(1)
  })

  it('rolls back partial fake artifacts while preserving lifecycle evidence', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const dataDir = tempDataDir()
    const created = createSandboxLifecycle(db, sandboxLifecycleInput({ dataDir }))
    const id = lifecycleId(created)
    const root = join(
      dataDir,
      'sandboxes',
      created.lifecycle?.sanitized_relative_path ?? '',
    )
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'fake-owner.json'), '{"owner":"paddock"}', 'utf8')

    expect(existsSync(root)).toBe(true)
    expect(rollbackSandboxLifecycle(db, id, { dataDir })).toMatchObject({
      ok: true,
      reason: 'rolled_back',
      lifecycle: { status: 'rolled_back' },
    })
    expect(existsSync(root)).toBe(false)
    expect(tableCount(db, 'agent_sandbox_lifecycles')).toBe(1)
    expect(tableCount(db, 'agent_sandbox_lifecycle_events')).toBeGreaterThanOrEqual(2)
  })
})

describe('agent sandbox lifecycle read model', () => {
  it('keeps existing authorized lifecycle rows readable with disabled-state evidence', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const created = createSandboxLifecycle(db, sandboxLifecycleInput())
    if (!created.lifecycle) throw new Error('missing lifecycle')
    db.prepare("UPDATE workspaces SET feature_flags = '{\"FEATURE_AGENT_RUNNER_SANDBOXES\":false}' WHERE id = 1").run()

    const model = buildSandboxLifecycleReadModel(db, { workspaceId: 1, taskId: 100 })
    expect(model.feature_flag).toMatchObject({ enabled: false, mutation_state: 'disabled' })
    expect(model.lifecycles).toHaveLength(1)
    expect(model.lifecycles[0]).toMatchObject({ id: created.lifecycle.id })
  })

  it('returns bounded authorized lifecycle evidence without unsafe host paths', () => {
    const db = openAgentSandboxLifecycleDb(true)
    const created = createSandboxLifecycle(db, sandboxLifecycleInput())
    expect(prepareSandboxLifecycle(db, lifecycleId(created))).toMatchObject({ ok: true })

    const model = buildSandboxLifecycleReadModel(db, { workspaceId: 1, taskId: 100 })
    expect(model).toMatchObject({
      schema_version: 'sandbox_lifecycle.v1',
      feature_flag: { key: 'FEATURE_AGENT_RUNNER_SANDBOXES', enabled: true, mutation_state: 'enabled' },
      task: { id: '100', workspace_id: '1', stage_key: 'issue_remediation' },
    })
    expect(model.lifecycles).toHaveLength(1)
    expect(model.lifecycles[0]).toMatchObject({
      owner: 'paddock',
      root_id: 'paddock_data_sandboxes',
      task_stage_attempt_id: '456',
      task_stage_claim_id: '789',
    })
    expect(JSON.stringify(model)).not.toMatch(/\/Users|\/private|token|provider/i)
  })
})
