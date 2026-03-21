import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { listAdapters } from '@/lib/adapters'
import {
  listFrameworks,
  getFrameworkInfo,
  getTemplatesForFramework,
  UNIVERSAL_TEMPLATES,
} from '@/lib/framework-templates'

/**
 * GET /api/frameworks — List all supported frameworks with connection info and templates.
 *
 * Query params:
 *   ?framework=langgraph  — Get details for a specific framework
 *   ?templates=true       — Include available templates in response
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams: n } = new URL(request.url)
  const frameworkFilter = n.get('framework')
  const includeTemplates = n.get('templates') === 'true'

  // Single framework detail
  if (frameworkFilter) {
    const info = getFrameworkInfo(frameworkFilter)
    if (!info) {
      return NextResponse.json(
        { error: `Unknown framework: ${frameworkFilter}. Available: ${listAdapters().join(', ')}` },
        { status: 404 }
      )
    }

    const response: Record<string, unknown> = { framework: info }
    if (includeTemplates) {
      response.templates = getTemplatesForFramework(frameworkFilter)
    }
    return NextResponse.json(response)
  }

  // List all frameworks
  const frameworks = listFrameworks()
  const response: Record<string, unknown> = { frameworks }

  if (includeTemplates) {
    response.templates = UNIVERSAL_TEMPLATES
  }

  return NextResponse.json(response)
}

export const dynamic = 'force-dynamic'
