import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'

export const VISUAL_SNAPSHOTS_ENABLED =
  process.env.MC_VISUAL_SNAPSHOTS === '1' || process.env.MC_E2E_SCREENSHOTS === '1'

const DEFAULT_VISUAL_ROOT = path.join(process.cwd(), 'test-results', 'visual-current')

interface VisualSnapshotOptions {
  domain: string
  name: string
  tags: readonly string[]
  description?: string
  expected?: string
  fullPage?: boolean
  reviewFocus?: readonly string[]
  title?: string
}

function visualOutputRoot() {
  return process.env.MC_VISUAL_OUTPUT_DIR || DEFAULT_VISUAL_ROOT
}

function normalizeSegment(input: string) {
  return input
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function relativeToProject(filePath: string) {
  return path.relative(process.cwd(), filePath)
}

function humanize(input: string) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const DEFAULT_REVIEW_FOCUS = [
  'Primary UI state matches the named scenario',
  'Visible copy, controls, and data are not clipped',
  'Feature flag and seeded data state are intentional',
] as const

async function sha256(filePath: string) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

export async function captureVisualSnapshot(
  page: Page,
  testInfo: TestInfo,
  options: VisualSnapshotOptions,
) {
  if (!VISUAL_SNAPSHOTS_ENABLED) {
    return
  }

  const fullPage = options.fullPage ?? true
  const domain = normalizeSegment(options.domain)
  const name = normalizeSegment(options.name)
  const dir = path.join(visualOutputRoot(), 'playwright', domain)
  const pngPath = path.join(dir, `${name}.png`)
  const manifestPath = path.join(dir, `${name}.visual.json`)

  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: pngPath, fullPage })

  const viewport = page.viewportSize()
  const reviewTitle = options.title || `${humanize(domain)} / ${humanize(name)}`
  const manifest = {
    version: 1,
    tool: 'paddock-visual',
    kind: 'playwright',
    domain,
    name,
    tags: [...options.tags],
    sourceFile: relativeToProject(testInfo.file),
    createdAt: new Date().toISOString(),
    screenshot: {
      path: relativeToProject(pngPath),
      sha256: await sha256(pngPath),
      fullPage,
      viewport,
    },
    review: {
      title: reviewTitle,
      description: options.description || `Review the ${reviewTitle} visual state captured by this Playwright scenario.`,
      expected: options.expected || 'The current screenshot should match the named scenario and only contain intentional UI changes.',
      focus: [...(options.reviewFocus?.length ? options.reviewFocus : DEFAULT_REVIEW_FOCUS)],
      tags: [...options.tags],
    },
    test: {
      title: testInfo.title,
      titlePath: testInfo.titlePath,
      tags: [...testInfo.tags],
      annotations: testInfo.annotations.map((annotation) => ({
        type: annotation.type,
        description: annotation.description || '',
      })),
      sourceFile: relativeToProject(testInfo.file),
      line: testInfo.line,
      projectName: testInfo.project.name,
      testId: testInfo.testId,
    },
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await testInfo.attach(`${domain}-${name}`, {
    path: pngPath,
    contentType: 'image/png',
  })
}
