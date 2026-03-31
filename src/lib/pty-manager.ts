/**
 * PTY Manager — server-side PTY lifecycle for terminal emulation
 *
 * Manages node-pty instances that attach to tmux sessions (Claude Code, Codex)
 * or spawn plain shells. Each PTY can have multiple WebSocket viewers.
 */

import { type IPty } from 'node-pty'
import { execFileSync } from 'child_process'
import { logger } from './logger'

const log = logger.child({ module: 'pty-manager' })

export interface PtySessionInfo {
  id: string
  sessionId: string
  kind: string
  mode: 'readonly' | 'interactive'
  createdAt: number
  clientCount: number
}

interface PtyClient {
  id: string
  send: (data: string) => void
  close: () => void
}

class PtySession {
  readonly id: string
  readonly sessionId: string
  readonly kind: string
  readonly mode: 'readonly' | 'interactive'
  readonly createdAt: number

  private pty: IPty | null = null
  private clients = new Map<string, PtyClient>()
  private buffer: string[] = []
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  private static BUFFER_MAX = 200
  private static IDLE_TIMEOUT_MS = 5 * 60 * 1000

  constructor(id: string, sessionId: string, kind: string, mode: 'readonly' | 'interactive') {
    this.id = id
    this.sessionId = sessionId
    this.kind = kind
    this.mode = mode
    this.createdAt = Date.now()
  }

  async start(): Promise<void> {
    const nodePty = await import('node-pty')
    const spawn = nodePty.spawn || (nodePty as any).default?.spawn

    if (!spawn) {
      throw new Error('node-pty spawn function not found')
    }

    const args = this.buildAttachArgs()

    log.info({ sessionId: this.sessionId, kind: this.kind, mode: this.mode, cmd: args[0] }, 'Spawning PTY')

    this.pty = spawn(args[0], args.slice(1), {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.env.HOME || '/',
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    })

    this.pty.onData((data: string) => {
      this.buffer.push(data)
      if (this.buffer.length > PtySession.BUFFER_MAX) {
        this.buffer.splice(0, this.buffer.length - PtySession.BUFFER_MAX)
      }
      for (const client of this.clients.values()) {
        try {
          client.send(JSON.stringify({ type: 'output', data }))
        } catch {
          // client disconnected
        }
      }
    })

    this.pty.onExit(({ exitCode }) => {
      log.info({ sessionId: this.sessionId, exitCode }, 'PTY exited')
      for (const client of this.clients.values()) {
        try {
          client.send(JSON.stringify({ type: 'exit', code: exitCode }))
          client.close()
        } catch {
          // ignore
        }
      }
      this.clients.clear()
      this.disposed = true
      ptyPool.delete(this.id)
    })

    this.resetIdleTimer()
  }

  private buildAttachArgs(): string[] {
    if (this.kind === 'claude-code' || this.kind === 'codex-cli') {
      const args = ['tmux', 'attach-session', '-t', this.sessionId]
      if (this.mode === 'readonly') args.push('-r')
      return args
    }
    return [process.env.SHELL || '/bin/bash']
  }

  addClient(client: PtyClient): void {
    this.clients.set(client.id, client)

    if (this.buffer.length > 0) {
      const catchup = this.buffer.join('')
      try {
        client.send(JSON.stringify({ type: 'output', data: catchup }))
      } catch {
        // ignore
      }
    }

    this.resetIdleTimer()
    log.info({ ptyId: this.id, clientId: client.id, clientCount: this.clients.size }, 'Client joined PTY')
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId)
    log.info({ ptyId: this.id, clientId, clientCount: this.clients.size }, 'Client left PTY')

    if (this.clients.size === 0) {
      this.resetIdleTimer()
    }
  }

  write(data: string): void {
    if (this.mode === 'readonly') return
    this.pty?.write(data)
  }

  resize(cols: number, rows: number): void {
    try {
      this.pty?.resize(cols, rows)
    } catch {
      // ignore resize errors on dead PTY
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    if (this.idleTimer) clearTimeout(this.idleTimer)

    for (const client of this.clients.values()) {
      try {
        client.send(JSON.stringify({ type: 'exit', code: -1 }))
        client.close()
      } catch {
        // ignore
      }
    }
    this.clients.clear()

    try {
      this.pty?.kill()
    } catch {
      // ignore
    }

    ptyPool.delete(this.id)
  }

  get info(): PtySessionInfo {
    return {
      id: this.id,
      sessionId: this.sessionId,
      kind: this.kind,
      mode: this.mode,
      createdAt: this.createdAt,
      clientCount: this.clients.size,
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)

    if (this.clients.size === 0) {
      this.idleTimer = setTimeout(() => {
        log.info({ ptyId: this.id }, 'PTY idle timeout — disposing')
        this.dispose()
      }, PtySession.IDLE_TIMEOUT_MS)
    }
  }
}

// Global PTY pool
const ptyPool = new Map<string, PtySession>()
let nextId = 1

/** Check if tmux is available on the system */
export function isTmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** Check if a tmux session exists */
export function tmuxSessionExists(sessionId: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', sessionId], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** List tmux sessions */
export function listTmuxSessions(): Array<{ name: string; attached: boolean; created: string }> {
  try {
    const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}|#{session_attached}|#{session_created}'], {
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, attached, created] = line.split('|')
        return { name, attached: attached === '1', created }
      })
  } catch {
    return []
  }
}

/** Create and start a PTY session */
export async function createPtySession(
  sessionId: string,
  kind: string,
  mode: 'readonly' | 'interactive' = 'readonly'
): Promise<PtySession> {
  const id = `pty-${nextId++}-${Date.now()}`

  if (kind === 'claude-code' || kind === 'codex-cli') {
    if (!isTmuxAvailable()) {
      throw new Error('tmux is not installed. Install it with: brew install tmux (macOS) or apt install tmux (Linux)')
    }
    if (!tmuxSessionExists(sessionId)) {
      throw new Error(`tmux session "${sessionId}" not found. The session may have ended.`)
    }
  }

  const session = new PtySession(id, sessionId, kind, mode)
  await session.start()
  ptyPool.set(id, session)

  return session
}

/** Get an existing PTY session by ID */
export function getPtySession(id: string): PtySession | undefined {
  return ptyPool.get(id)
}

/** Get all active PTY sessions */
export function listPtySessions(): PtySessionInfo[] {
  return Array.from(ptyPool.values()).map((s) => s.info)
}

/** Dispose a specific PTY session */
export function disposePtySession(id: string): void {
  ptyPool.get(id)?.dispose()
}

/** Dispose all PTY sessions */
export function disposeAllPtySessions(): void {
  for (const session of ptyPool.values()) {
    session.dispose()
  }
}
