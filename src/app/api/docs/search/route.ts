import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { searchDocs } from '@/lib/docs-knowledge'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const results = await searchDocs(query, limit)
    return NextResponse.json({ query, results, count: results.length })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/docs/search error')
    return NextResponse.json({ error: 'Failed to search docs' }, { status: 500 })
  }
}
