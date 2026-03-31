import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { isTmuxAvailable, tmuxSessionExists, listTmuxSessions, listPtySessions } from '@/lib/pty-manager'

/**
 * POST /api/pty/attach — Check if a PTY can be created for a session
 *
 * Returns whether the session supports terminal attachment (tmux exists,
 * session is alive) and the WebSocket path to connect to.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { sessionId, kind, mode = 'readonly' } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (!kind || typeof kind !== 'string') {
      return NextResponse.json({ error: 'kind is required' }, { status: 400 })
    }
    if (mode !== 'readonly' && mode !== 'interactive') {
      return NextResponse.json({ error: 'mode must be "readonly" or "interactive"' }, { status: 400 })
    }

    // Check if terminal attachment is supported for this session type
    const supportsTmux = kind === 'claude-code' || kind === 'codex-cli'

    if (supportsTmux) {
      if (!isTmuxAvailable()) {
        return NextResponse.json({
          supported: false,
          reason: 'tmux_not_installed',
          message: 'tmux is not installed. Install with: brew install tmux (macOS) or apt install tmux (Linux)',
        })
      }

      if (!tmuxSessionExists(sessionId)) {
        return NextResponse.json({
          supported: false,
          reason: 'session_not_found',
          message: `tmux session "${sessionId}" not found. The session may have ended.`,
        })
      }

      return NextResponse.json({
        supported: true,
        wsPath: `/ws/pty?session=${encodeURIComponent(sessionId)}&kind=${encodeURIComponent(kind)}&mode=${encodeURIComponent(mode)}`,
        sessionId,
        kind,
        mode,
      })
    }

    // Hermes, gateway, or unknown kinds — no PTY support, use transcript viewer
    return NextResponse.json({
      supported: false,
      reason: 'unsupported_kind',
      message: `Terminal attachment is not supported for "${kind}" sessions. Use the transcript viewer.`,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check PTY support' }, { status: 500 })
  }
}

/**
 * GET /api/pty/attach — List active PTY sessions and tmux sessions
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  return NextResponse.json({
    tmuxAvailable: isTmuxAvailable(),
    tmuxSessions: listTmuxSessions(),
    activePtySessions: listPtySessions(),
  })
}
