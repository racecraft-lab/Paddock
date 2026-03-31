import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import { requireRole } from '@/lib/auth'
import { isTmuxAvailable } from '@/lib/pty-manager'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'pty-setup' })

/**
 * GET /api/pty/setup — Check terminal prerequisites
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const tmuxInstalled = isTmuxAvailable()
  let tmuxVersion: string | null = null

  if (tmuxInstalled) {
    try {
      tmuxVersion = execFileSync('tmux', ['-V'], { encoding: 'utf-8', stdio: 'pipe' }).trim()
    } catch {
      // ignore
    }
  }

  // Detect platform for install instructions
  const platform = process.platform
  const installCommand = platform === 'darwin'
    ? 'brew install tmux'
    : platform === 'linux'
      ? 'apt install -y tmux || yum install -y tmux'
      : null

  return NextResponse.json({
    tmux: {
      installed: tmuxInstalled,
      version: tmuxVersion,
      installCommand,
      required: true,
      description: 'tmux is required for terminal emulation of agent sessions',
    },
    platform,
    ready: tmuxInstalled,
  })
}

/**
 * POST /api/pty/setup — Install tmux (opt-in)
 *
 * Attempts to install tmux using the platform package manager.
 * Requires admin role. This is a privileged operation.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (isTmuxAvailable()) {
    return NextResponse.json({ success: true, message: 'tmux is already installed' })
  }

  const platform = process.platform
  let installCmd: string[]

  if (platform === 'darwin') {
    // Check if brew is available
    try {
      execFileSync('brew', ['--version'], { stdio: 'pipe' })
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Homebrew is not installed. Install tmux manually: brew install tmux',
      }, { status: 400 })
    }
    installCmd = ['brew', 'install', 'tmux']
  } else if (platform === 'linux') {
    // Try apt first, then yum
    try {
      execFileSync('apt-get', ['--version'], { stdio: 'pipe' })
      installCmd = ['sudo', 'apt-get', 'install', '-y', 'tmux']
    } catch {
      try {
        execFileSync('yum', ['--version'], { stdio: 'pipe' })
        installCmd = ['sudo', 'yum', 'install', '-y', 'tmux']
      } catch {
        return NextResponse.json({
          success: false,
          error: 'No supported package manager found. Install tmux manually.',
        }, { status: 400 })
      }
    }
  } else {
    return NextResponse.json({
      success: false,
      error: `tmux auto-install is not supported on ${platform}. Install manually.`,
    }, { status: 400 })
  }

  try {
    log.info({ cmd: installCmd }, 'Installing tmux')
    execFileSync(installCmd[0], installCmd.slice(1), {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120_000,
    })

    // Verify installation
    if (!isTmuxAvailable()) {
      return NextResponse.json({
        success: false,
        error: 'Installation completed but tmux is still not available. Check your PATH.',
      }, { status: 500 })
    }

    let version: string | null = null
    try {
      version = execFileSync('tmux', ['-V'], { encoding: 'utf-8', stdio: 'pipe' }).trim()
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: `tmux installed successfully${version ? ` (${version})` : ''}`,
      version,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    log.error({ err: error }, 'Failed to install tmux')
    return NextResponse.json({
      success: false,
      error: `Failed to install tmux: ${msg}`,
    }, { status: 500 })
  }
}
