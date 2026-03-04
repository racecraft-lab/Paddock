#!/usr/bin/env node
import http from 'node:http'
import { WebSocketServer } from 'ws'

const host = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1'
const port = Number(process.env.OPENCLAW_GATEWAY_PORT || 18789)

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(404)
    res.end()
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'openclaw-mock-gateway' }))
    return
  }

  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status', connected: true, source: 'mock-gateway' }))
  ws.on('message', (raw) => {
    const text = raw.toString()
    if (text.includes('ping')) {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      return
    }
    ws.send(JSON.stringify({ type: 'event', message: 'ack', raw: text }))
  })
})

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

server.listen(port, host, () => {
  process.stdout.write(`[openclaw-mock-gateway] listening on ${host}:${port}\n`)
})

function shutdown() {
  wss.clients.forEach((client) => {
    try {
      client.close()
    } catch {
      // noop
    }
  })
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
