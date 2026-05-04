import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'

describe('Playwright visual snapshot metadata', () => {
  let outputDir = ''

  beforeEach(async () => {
    vi.resetModules()
    outputDir = await mkdtemp(path.join(os.tmpdir(), 'mc-visual-metadata-'))
    process.env.MC_VISUAL_SNAPSHOTS = '1'
    process.env.MC_VISUAL_OUTPUT_DIR = outputDir
  })

  afterEach(async () => {
    delete process.env.MC_VISUAL_SNAPSHOTS
    delete process.env.MC_VISUAL_OUTPUT_DIR
    if (outputDir) {
      await rm(outputDir, { recursive: true, force: true })
      outputDir = ''
    }
    vi.restoreAllMocks()
  })

  it('writes reviewer guidance, annotations, and source metadata into the visual manifest', async () => {
    const { captureVisualSnapshot } = await import('../visual/visual-snapshot')
    const screenshot = vi.fn(async ({ path: screenshotPath }: { path: string }) => {
      await writeFile(screenshotPath, 'fake-png')
    })
    const attach = vi.fn()
    const page = {
      screenshot,
      viewportSize: () => ({ width: 1280, height: 720 }),
    } as unknown as Page
    const testInfo = {
      annotations: [{ type: 'review-focus', description: 'Check budget labels.' }],
      attach,
      file: path.join(process.cwd(), 'tests/e2e/spec-008/budgets.spec.ts'),
      line: 42,
      project: { name: 'chromium' },
      tags: ['@spec-008'],
      testId: 'abc123',
      title: 'shows budget utilization',
      titlePath: ['budgets', 'shows budget utilization'],
    } as unknown as TestInfo

    await captureVisualSnapshot(page, testInfo, {
      description: 'Budget guardrail coverage.',
      domain: 'spec-008',
      expected: 'Budget thresholds remain visible.',
      name: 'budget.50pct',
      reviewFocus: ['Budget card copy', 'Utilization bar state'],
      tags: ['spec-008', 'visual'],
      title: 'SPEC-008 / Budget 50pct',
    })

    const manifest = JSON.parse(
      await readFile(path.join(outputDir, 'playwright', 'spec-008', 'budget.50pct.visual.json'), 'utf8')
    )

    expect(manifest.review).toMatchObject({
      description: 'Budget guardrail coverage.',
      expected: 'Budget thresholds remain visible.',
      focus: ['Budget card copy', 'Utilization bar state'],
      tags: ['spec-008', 'visual'],
      title: 'SPEC-008 / Budget 50pct',
    })
    expect(manifest.test.annotations).toEqual([
      { type: 'review-focus', description: 'Check budget labels.' },
    ])
    expect(manifest.test.titlePath).toEqual(['budgets', 'shows budget utilization'])
    expect(manifest.test.sourceFile).toBe('tests/e2e/spec-008/budgets.spec.ts')
    expect(manifest.test.line).toBe(42)
    expect(manifest.screenshot.viewport).toEqual({ width: 1280, height: 720 })
    expect(attach).toHaveBeenCalledWith('spec-008-budget.50pct', expect.objectContaining({
      contentType: 'image/png',
    }))
  })
})
