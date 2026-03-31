#!/usr/bin/env node

/**
 * Mission Control Server — custom wrapper for Next.js standalone
 *
 * Wraps the Next.js standalone server.js and adds WebSocket upgrade
 * handling for PTY terminal connections on /ws/pty.
 *
 * Usage:
 *   node scripts/mc-server.cjs          # production (standalone)
 *   MC_PTY_ENABLED=1 pnpm dev           # dev mode (PTY via dev server hook)
 */

const http = require('http')
const path = require('path')

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOSTNAME || '0.0.0.0'

// Check if running in standalone mode
const standaloneDir = path.join(__dirname, '..', '.next', 'standalone')
let nextHandler

try {
  // Try standalone server first
  const nextServer = require(path.join(standaloneDir, 'server.js'))
  nextHandler = nextServer
} catch {
  console.error('[mc-server] Standalone server not found. Run `pnpm build` first, then:')
  console.error('  node scripts/mc-server.cjs')
  console.error('')
  console.error('For development, use `pnpm dev` instead.')
  process.exit(1)
}

// Create HTTP server that wraps Next.js
const server = http.createServer((req, res) => {
  // Next.js handles all HTTP requests
  // In standalone mode, the handler is set up by requiring server.js
  // which calls server.listen() internally — we intercept before that
})

// PTY WebSocket upgrade handler (lazy-loaded to avoid native addon issues at import time)
let handlePtyUpgrade = null

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/ws/pty') {
    // Lazy-load PTY WebSocket handler
    if (!handlePtyUpgrade) {
      try {
        const ptyWs = require('../src/lib/pty-websocket')
        handlePtyUpgrade = ptyWs.handlePtyUpgrade
      } catch (err) {
        console.error('[mc-server] Failed to load PTY WebSocket handler:', err.message)
        socket.destroy()
        return
      }
    }

    const handled = handlePtyUpgrade(req, socket, head)
    if (!handled) {
      socket.destroy()
    }
    return
  }

  // Let Next.js handle other WebSocket upgrades (e.g., HMR in dev)
  // In standalone mode, Next.js doesn't use WebSocket, so just close
  socket.destroy()
})

// Graceful shutdown
function shutdown() {
  console.log('[mc-server] Shutting down...')
  try {
    const { disposeAllPtySessions } = require('../src/lib/pty-manager')
    disposeAllPtySessions()
  } catch {
    // ignore if not loaded
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log(`[mc-server] Mission Control starting on ${HOST}:${PORT}`)
console.log('[mc-server] PTY terminal support: enabled')
console.log('[mc-server] WebSocket upgrade path: /ws/pty')
