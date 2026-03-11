import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { runSecurityScan } from '@/lib/security-scan'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    return NextResponse.json(runSecurityScan())
  } catch (error) {
    logger.error({ err: error }, 'Security scan error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
