import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import path from 'node:path'
import { config } from './config'

interface CommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  onData?: (chunk: string) => void
}

interface CommandResult {
  stdout: string
  stderr: string
  code: number | null
}

type SafeCommand =
  | '/usr/bin/chown'
  | '/usr/bin/cp'
  | '/usr/bin/install'
  | '/usr/bin/rm'
  | '/usr/bin/systemctl'
  | '/usr/sbin/useradd'
  | '/usr/sbin/userdel'
  | 'claude'
  | 'clawdbot'
  | 'codex'
  | 'curl'
  | 'df'
  | 'free'
  | 'hermes'
  | 'lspci'
  | 'netstat'
  | 'nvidia-smi'
  | 'open'
  | 'openclaw'
  | 'opencode'
  | 'ps'
  | 'sed'
  | 'sudo'
  | 'sysctl'
  | 'system_profiler'
  | 'uptime'
  | 'vm_stat'
  | 'wget'
  | 'which'

const SAFE_ABSOLUTE_COMMANDS: Record<string, SafeCommand> = {
  '/usr/bin/chown': '/usr/bin/chown',
  '/usr/bin/cp': '/usr/bin/cp',
  '/usr/bin/install': '/usr/bin/install',
  '/usr/bin/rm': '/usr/bin/rm',
  '/usr/bin/systemctl': '/usr/bin/systemctl',
  '/usr/sbin/useradd': '/usr/sbin/useradd',
  '/usr/sbin/userdel': '/usr/sbin/userdel',
}

const SAFE_COMMAND_BASENAMES: Record<string, SafeCommand> = {
  claude: 'claude',
  clawdbot: 'clawdbot',
  codex: 'codex',
  curl: 'curl',
  df: 'df',
  free: 'free',
  hermes: 'hermes',
  lspci: 'lspci',
  netstat: 'netstat',
  'nvidia-smi': 'nvidia-smi',
  open: 'open',
  openclaw: 'openclaw',
  opencode: 'opencode',
  ps: 'ps',
  sed: 'sed',
  sudo: 'sudo',
  sysctl: 'sysctl',
  system_profiler: 'system_profiler',
  uptime: 'uptime',
  vm_stat: 'vm_stat',
  wget: 'wget',
  which: 'which',
}

export class CommandValidationError extends Error {
  readonly code = 'COMMAND_VALIDATION_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'CommandValidationError'
  }
}

function getCommandBasename(command: string): string {
  const normalized = command.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return (parts[parts.length - 1] || '').toLowerCase()
}

function assertSafeCommandInvocation(command: string): SafeCommand {
  if (typeof command !== 'string' || !command.trim()) {
    throw new CommandValidationError('Executable is required')
  }

  if (/\s/.test(command) || /[|&;<>`$\n\r]/.test(command)) {
    throw new CommandValidationError('Executable contains unsupported characters')
  }

  const basename = getCommandBasename(command)

  const safeCommand = SAFE_ABSOLUTE_COMMANDS[command] || SAFE_COMMAND_BASENAMES[basename]
  if (!safeCommand) {
    throw new CommandValidationError(`Executable is not allowlisted: ${basename || command}`)
  }

  return safeCommand
}

export function envWithExecutablePath(
  command: string,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const basename = getCommandBasename(command)
  const safeCommand = SAFE_ABSOLUTE_COMMANDS[command] || SAFE_COMMAND_BASENAMES[basename]
  if (!safeCommand || !/[\\/]/.test(command)) {
    return env
  }

  const executableDir = path.dirname(command)
  if (!executableDir || executableDir === '.' || executableDir === command) {
    return env
  }

  const currentPath = env.PATH || process.env.PATH || ''
  const pathEntries = currentPath.split(path.delimiter).filter(Boolean)
  if (pathEntries.includes(executableDir)) {
    return env
  }

  return {
    ...env,
    PATH: [executableDir, currentPath].filter(Boolean).join(path.delimiter),
  }
}

function spawnSafeCommand(
  command: SafeCommand,
  args: string[],
  options: SpawnOptionsWithoutStdio
): ChildProcessWithoutNullStreams {
  switch (command) {
    case '/usr/bin/chown':
      return spawn('/usr/bin/chown', args, options)
    case '/usr/bin/cp':
      return spawn('/usr/bin/cp', args, options)
    case '/usr/bin/install':
      return spawn('/usr/bin/install', args, options)
    case '/usr/bin/rm':
      return spawn('/usr/bin/rm', args, options)
    case '/usr/bin/systemctl':
      return spawn('/usr/bin/systemctl', args, options)
    case '/usr/sbin/useradd':
      return spawn('/usr/sbin/useradd', args, options)
    case '/usr/sbin/userdel':
      return spawn('/usr/sbin/userdel', args, options)
    case 'claude':
      return spawn('claude', args, options)
    case 'clawdbot':
      return spawn('clawdbot', args, options)
    case 'codex':
      return spawn('codex', args, options)
    case 'curl':
      return spawn('curl', args, options)
    case 'df':
      return spawn('df', args, options)
    case 'free':
      return spawn('free', args, options)
    case 'hermes':
      return spawn('hermes', args, options)
    case 'lspci':
      return spawn('lspci', args, options)
    case 'netstat':
      return spawn('netstat', args, options)
    case 'nvidia-smi':
      return spawn('nvidia-smi', args, options)
    case 'open':
      return spawn('open', args, options)
    case 'openclaw':
      return spawn('openclaw', args, options)
    case 'opencode':
      return spawn('opencode', args, options)
    case 'ps':
      return spawn('ps', args, options)
    case 'sed':
      return spawn('sed', args, options)
    case 'sudo':
      return spawn('sudo', args, options)
    case 'sysctl':
      return spawn('sysctl', args, options)
    case 'system_profiler':
      return spawn('system_profiler', args, options)
    case 'uptime':
      return spawn('uptime', args, options)
    case 'vm_stat':
      return spawn('vm_stat', args, options)
    case 'wget':
      return spawn('wget', args, options)
    case 'which':
      return spawn('which', args, options)
  }
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const safeCommand = assertSafeCommandInvocation(command)

  return new Promise((resolve, reject) => {
    const child = spawnSafeCommand(safeCommand, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | undefined

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
      }, options.timeoutMs)
    }

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      options.onData?.(chunk)
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      options.onData?.(chunk)
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(error)
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      const error = new Error(
        `Command failed with exit code ${String(code)}: ${stderr || stdout}`
      )
      ;(error as any).stdout = stdout
      ;(error as any).stderr = stderr
      ;(error as any).code = code
      reject(error)
    })

    if (options.input) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}

export function runOpenClaw(args: string[], options: CommandOptions = {}) {
  // Explicitly pass OPENCLAW_STATE_DIR so the CLI uses the exact resolved path.
  // Without this, the CLI may interpret OPENCLAW_HOME as a parent directory and
  // append ".openclaw" to it — causing double-nesting when OPENCLAW_HOME is
  // already set to the state directory (e.g. /root/.openclaw → /root/.openclaw/.openclaw).
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_STATE_DIR: config.openclawStateDir,
    ...options.env,
  }
  return runCommand('openclaw', args, {
    ...options,
    env: envWithExecutablePath(config.openclawBin, env),
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}

export function runClawdbot(args: string[], options: CommandOptions = {}) {
  const env = envWithExecutablePath(config.clawdbotBin, options.env || process.env)
  return runCommand('clawdbot', args, {
    ...options,
    env,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}
