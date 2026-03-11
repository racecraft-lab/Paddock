import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'

const GATEWAY_TIMEOUT = 5000

function gatewayUrl(path: string): string {
  return `http://${config.gatewayHost}:${config.gatewayPort}${path}`
}

async function fetchGateway(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT)
  try {
    return await fetch(gatewayUrl(path), {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const action = request.nextUrl.searchParams.get('action') || 'list'

  if (action === 'list') {
    try {
      const res = await fetchGateway('/api/presence')
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Gateway presence endpoint returned non-OK')
        return NextResponse.json({ nodes: [], connected: false })
      }
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      logger.warn({ err }, 'Gateway unreachable for presence listing')
      return NextResponse.json({ nodes: [], connected: false })
    }
  }

  if (action === 'devices') {
    try {
      const res = await fetchGateway('/api/devices')
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Gateway devices endpoint returned non-OK')
        return NextResponse.json({ devices: [] })
      }
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      logger.warn({ err }, 'Gateway unreachable for device listing')
      return NextResponse.json({ devices: [] })
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

const VALID_DEVICE_ACTIONS = ['approve', 'reject', 'rotate-token', 'revoke-token'] as const
type DeviceAction = (typeof VALID_DEVICE_ACTIONS)[number]

const ACTION_RPC_MAP: Record<DeviceAction, { method: string; paramKey: 'requestId' | 'deviceId' }> = {
  'approve':      { method: 'device.pair.approve', paramKey: 'requestId' },
  'reject':       { method: 'device.pair.reject',  paramKey: 'requestId' },
  'rotate-token': { method: 'device.token.rotate',  paramKey: 'deviceId' },
  'revoke-token': { method: 'device.token.revoke',  paramKey: 'deviceId' },
}

/**
 * POST /api/nodes - Device management actions
 * Body: { action: DeviceAction, requestId?: string, deviceId?: string, role?: string, scopes?: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string
  if (!action || !VALID_DEVICE_ACTIONS.includes(action as DeviceAction)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_DEVICE_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  const spec = ACTION_RPC_MAP[action as DeviceAction]

  // Validate required param
  const id = body[spec.paramKey] as string | undefined
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: `Missing required field: ${spec.paramKey}` }, { status: 400 })
  }

  // Build RPC params
  const params: Record<string, unknown> = { [spec.paramKey]: id }
  if ((action === 'rotate-token' || action === 'revoke-token') && body.role) {
    params.role = body.role
  }
  if (action === 'rotate-token' && Array.isArray(body.scopes)) {
    params.scopes = body.scopes
  }

  try {
    const res = await fetchGateway('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: spec.method, params }),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AbortError') {
      logger.error('Gateway device action request timed out')
      return NextResponse.json({ error: 'Gateway request timed out' }, { status: 504 })
    }
    logger.error({ err }, 'Gateway device action failed')
    return NextResponse.json({ error: 'Gateway unreachable' }, { status: 502 })
  }
}
