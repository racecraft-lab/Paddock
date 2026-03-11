import { NextRequest, NextResponse } from 'next/server'
import { parseNaturalSchedule } from '@/lib/schedule-parser'

/**
 * GET /api/schedule-parse?input=every+morning+at+9am
 * Returns { cronExpr, humanReadable } or { error }
 */
export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input')
  if (!input) {
    return NextResponse.json({ error: 'Missing input parameter' }, { status: 400 })
  }

  const result = parseNaturalSchedule(input)
  if (!result) {
    return NextResponse.json({ error: 'Could not parse schedule expression' }, { status: 400 })
  }

  return NextResponse.json(result)
}
