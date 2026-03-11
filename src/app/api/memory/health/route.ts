import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { runHealthDiagnostics } from '@/lib/memory-utils'
import { logger } from '@/lib/logger'

const MEMORY_PATH = config.memoryDir

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = readLimiter(request)
  if (limited) return limited

  if (!MEMORY_PATH) {
    return NextResponse.json({ error: 'Memory directory not configured' }, { status: 500 })
  }

  try {
    const report = await runHealthDiagnostics(MEMORY_PATH)
    return NextResponse.json(report)
  } catch (err) {
    logger.error({ err }, 'Memory health API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
