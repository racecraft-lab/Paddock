import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getDocsTree, listDocsRoots } from '@/lib/docs-knowledge'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const tree = await getDocsTree()
    return NextResponse.json({ roots: listDocsRoots(), tree })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/docs/tree error')
    return NextResponse.json({ error: 'Failed to load docs tree' }, { status: 500 })
  }
}
