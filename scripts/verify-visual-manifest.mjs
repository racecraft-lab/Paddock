#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

function parseList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseCounts(value) {
  return parseList(value)
    .map((entry) => {
      const [tag, rawCount] = entry.split(':')
      return { tag: tag?.trim(), count: Number.parseInt(rawCount, 10) }
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.count) && entry.count > 0)
}

function parseArgs(argv) {
  const args = {
    mode: process.env.MC_VISUAL_MANIFEST_MODE || null,
    root: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--mode') {
      args.mode = argv[index + 1]
      index += 1
    } else if (arg === '--root') {
      args.root = path.resolve(argv[index + 1])
      index += 1
    } else if (!args.mode && ['playwright', 'storybook'].includes(arg)) {
      args.mode = arg
    } else if (!args.root) {
      args.root = path.resolve(arg)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!['playwright', 'storybook'].includes(args.mode)) {
    throw new Error('--mode must be either playwright or storybook')
  }

  return args
}

async function pathExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function collectManifestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectManifestFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.visual.json')) {
      files.push(entryPath)
    }
  }

  return files
}

function defaultRoot(rootOverride) {
  return rootOverride ||
    process.env.MC_VISUAL_OUTPUT_DIR ||
    path.join(process.cwd(), 'test-results', 'visual-current')
}

function getPlaywrightConfig(rootOverride) {
  return {
    label: 'visual-playwright-manifest',
    root: defaultRoot(rootOverride),
    expectedSnapshots: Number.parseInt(process.env.MC_VISUAL_PLAYWRIGHT_EXPECTED_SNAPSHOTS || '142', 10),
    expectedTests: Number.parseInt(process.env.MC_VISUAL_PLAYWRIGHT_EXPECTED_TESTS || '102', 10),
    allowedTestTags: parseList(process.env.MC_VISUAL_PLAYWRIGHT_ALLOWED_TEST_TAGS || '@product-line-switcher,@feature-flag-admin,@ready-for-owner,@spec-007,@spec-008,@spec-013a,@workflow-contracts'),
    allowedSnapshotTags: parseList(process.env.MC_VISUAL_PLAYWRIGHT_ALLOWED_SNAPSHOT_TAGS || 'product-line-switcher,feature-flag-admin,ready-for-owner,spec-007,spec-008,spec-013a,workflow-contracts'),
    requiredDomainCounts: parseCounts(process.env.MC_VISUAL_PLAYWRIGHT_REQUIRED_DOMAIN_COUNTS || 'product-line-switcher:9,feature-flag-admin:2,ready-for-owner:3,spec-007:5,spec-008:120,spec-013a:1,workflow-contracts:1'),
  }
}

function getStorybookConfig(rootOverride) {
  return {
    label: 'visual-storybook-manifest',
    root: defaultRoot(rootOverride),
    expectedSnapshots: Number.parseInt(process.env.MC_VISUAL_STORYBOOK_EXPECTED_SNAPSHOTS || '153', 10),
    expectedStories: Number.parseInt(process.env.MC_VISUAL_STORYBOOK_EXPECTED_STORIES || '153', 10),
    requiredStoryTags: parseList(process.env.MC_VISUAL_STORYBOOK_REQUIRED_TAGS || 'visual'),
    requiredDomainStoryCounts: parseCounts(process.env.MC_VISUAL_STORYBOOK_REQUIRED_DOMAIN_COUNTS || 'product-line-switcher:8,feature-flag-admin:2,task-pipeline-workflows:2,workflow-contracts:1,ready-for-owner:3,spec-007:3,spec-008:120'),
  }
}

async function readManifest(filePath, failures) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    failures.push(`${path.relative(process.cwd(), filePath)}: invalid JSON (${error.message})`)
    return null
  }
}

function resolveScreenshotPath(manifest, filePath) {
  const screenshotPath = manifest.screenshot?.path
  if (typeof screenshotPath !== 'string' || screenshotPath.length === 0) {
    return null
  }
  return path.isAbsolute(screenshotPath)
    ? screenshotPath
    : path.resolve(process.cwd(), screenshotPath)
}

async function verifyScreenshotHash(manifest, filePath, failures) {
  const screenshotPath = resolveScreenshotPath(manifest, filePath)
  if (!screenshotPath) {
    failures.push(`${path.relative(process.cwd(), filePath)}: missing screenshot.path`)
    return
  }
  if (!await pathExists(screenshotPath)) {
    failures.push(`${path.relative(process.cwd(), filePath)}: missing screenshot ${path.relative(process.cwd(), screenshotPath)}`)
    return
  }
  const actualHash = createHash('sha256').update(await readFile(screenshotPath)).digest('hex')
  if (manifest.screenshot?.sha256 !== actualHash) {
    failures.push(`${path.relative(process.cwd(), filePath)}: screenshot sha256 mismatch`)
  }
}

function validateCommonManifest(manifest, filePath, expectedKind) {
  const failures = []
  if (manifest.version !== 1) failures.push('version must be 1')
  if (manifest.tool !== 'paddock-visual') failures.push('tool must be paddock-visual')
  if (manifest.kind !== expectedKind) failures.push(`kind must be ${expectedKind}`)
  if (typeof manifest.domain !== 'string' || manifest.domain.length === 0) failures.push('missing domain')
  if (!Array.isArray(manifest.tags)) failures.push('tags must be an array')
  if (typeof manifest.sourceFile !== 'string' || manifest.sourceFile.length === 0) failures.push('missing sourceFile')
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) failures.push('missing name')
  if (typeof manifest.screenshot?.sha256 !== 'string') failures.push('missing screenshot.sha256')
  if (typeof manifest.review?.title !== 'string' || manifest.review.title.length === 0) failures.push('missing review.title')
  if (!Array.isArray(manifest.review?.tags)) failures.push('missing review.tags')
  if (!Array.isArray(manifest.review?.focus)) failures.push('missing review.focus')
  return failures.map((failure) => `${path.relative(process.cwd(), filePath)}: ${failure}`)
}

function validatePlaywrightManifest(manifest, filePath, config) {
  const failures = validateCommonManifest(manifest, filePath, 'playwright')
  if (typeof manifest.test?.title !== 'string' || manifest.test.title.length === 0) failures.push(`${path.relative(process.cwd(), filePath)}: missing test.title`)
  if (!Array.isArray(manifest.test?.titlePath) || manifest.test.titlePath.length === 0) failures.push(`${path.relative(process.cwd(), filePath)}: missing test.titlePath`)
  if (typeof manifest.test?.sourceFile !== 'string' || manifest.test.sourceFile.length === 0) failures.push(`${path.relative(process.cwd(), filePath)}: missing test.sourceFile`)

  const hasAllowedSnapshotTag =
    Array.isArray(manifest.tags) &&
    config.allowedSnapshotTags.some((tag) => manifest.tags.includes(tag))
  const hasAllowedTestTag =
    Array.isArray(manifest.test?.tags) &&
    config.allowedTestTags.some((tag) => manifest.test.tags.includes(tag))

  if (!hasAllowedSnapshotTag) {
    failures.push(`${path.relative(process.cwd(), filePath)}: missing one of snapshot tags: ${config.allowedSnapshotTags.join(', ')}`)
  }
  if (!hasAllowedTestTag && !hasAllowedSnapshotTag) {
    failures.push(`${path.relative(process.cwd(), filePath)}: missing one of Playwright test tags (${config.allowedTestTags.join(', ')}) or snapshot tags (${config.allowedSnapshotTags.join(', ')})`)
  }

  return failures
}

function validateStorybookManifest(manifest, filePath, config) {
  const failures = validateCommonManifest(manifest, filePath, 'storybook')
  if (typeof manifest.story?.id !== 'string' || manifest.story.id.length === 0) failures.push(`${path.relative(process.cwd(), filePath)}: missing story.id`)
  if (typeof manifest.story?.sourceFile !== 'string' || manifest.story.sourceFile.length === 0) failures.push(`${path.relative(process.cwd(), filePath)}: missing story.sourceFile`)
  for (const tag of config.requiredStoryTags) {
    if (!Array.isArray(manifest.story?.tags) || !manifest.story.tags.includes(tag)) {
      failures.push(`${path.relative(process.cwd(), filePath)}: missing Storybook story tag ${tag}`)
    }
  }
  return failures
}

async function verifyPlaywright(config) {
  const manifestFiles = await collectManifestFiles(config.root)
  const failures = []
  const uniqueTests = new Set()
  const domainCounts = new Map()
  let matchingManifests = 0

  for (const filePath of manifestFiles) {
    const manifest = await readManifest(filePath, failures)
    if (!manifest || manifest.kind !== 'playwright') continue

    matchingManifests += 1
    await verifyScreenshotHash(manifest, filePath, failures)
    failures.push(...validatePlaywrightManifest(manifest, filePath, config))

    if (Array.isArray(manifest.test?.titlePath)) {
      uniqueTests.add(manifest.test.titlePath.join(' > '))
    }
    for (const { tag } of config.requiredDomainCounts) {
      if (manifest.domain === tag || (Array.isArray(manifest.tags) && manifest.tags.includes(tag))) {
        domainCounts.set(tag, (domainCounts.get(tag) || 0) + 1)
      }
    }
  }

  if (matchingManifests < config.expectedSnapshots) {
    failures.push(`expected at least ${config.expectedSnapshots} Playwright visual manifests, found ${matchingManifests}`)
  }
  if (uniqueTests.size < config.expectedTests) {
    failures.push(`expected at least ${config.expectedTests} unique Playwright visual tests, found ${uniqueTests.size}`)
  }
  for (const { tag, count } of config.requiredDomainCounts) {
    const actual = domainCounts.get(tag) || 0
    if (actual < count) {
      failures.push(`expected at least ${count} Playwright visual manifests tagged ${tag}, found ${actual}`)
    }
  }

  return {
    failures,
    summary: `verified ${matchingManifests} Playwright visual manifests across ${uniqueTests.size} tests`,
  }
}

async function verifyStorybook(config) {
  const manifestFiles = await collectManifestFiles(config.root)
  const failures = []
  const uniqueStories = new Set()
  const domainStories = new Map()
  let matchingManifests = 0

  for (const filePath of manifestFiles) {
    const manifest = await readManifest(filePath, failures)
    if (!manifest || manifest.kind !== 'storybook') continue

    matchingManifests += 1
    await verifyScreenshotHash(manifest, filePath, failures)
    failures.push(...validateStorybookManifest(manifest, filePath, config))

    if (typeof manifest.story?.id === 'string') {
      uniqueStories.add(manifest.story.id)
      for (const { tag } of config.requiredDomainStoryCounts) {
        if (manifest.domain === tag || (Array.isArray(manifest.story?.tags) && manifest.story.tags.includes(tag))) {
          const stories = domainStories.get(tag) || new Set()
          stories.add(manifest.story.id)
          domainStories.set(tag, stories)
        }
      }
    }
  }

  if (matchingManifests < config.expectedSnapshots) {
    failures.push(`expected at least ${config.expectedSnapshots} Storybook visual manifests, found ${matchingManifests}`)
  }
  if (uniqueStories.size < config.expectedStories) {
    failures.push(`expected at least ${config.expectedStories} unique Storybook stories, found ${uniqueStories.size}`)
  }
  for (const { tag, count } of config.requiredDomainStoryCounts) {
    const actual = domainStories.get(tag)?.size || 0
    if (actual < count) {
      failures.push(`expected at least ${count} Storybook visual stories tagged ${tag}, found ${actual}`)
    }
  }

  return {
    failures,
    summary: `verified ${matchingManifests} Storybook visual manifests across ${uniqueStories.size} stories`,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = args.mode === 'playwright'
    ? getPlaywrightConfig(args.root)
    : getStorybookConfig(args.root)

  if (!await pathExists(config.root)) {
    console.error(`[${config.label}] ${config.root} does not exist`)
    process.exit(1)
  }

  const result = args.mode === 'playwright'
    ? await verifyPlaywright(config)
    : await verifyStorybook(config)

  if (result.failures.length > 0) {
    console.error(`[${config.label}] visual manifest verification failed:`)
    for (const failure of result.failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log(`[${config.label}] ${result.summary}`)
}

main().catch((error) => {
  console.error(`[visual-manifest] ${error.stack || error.message}`)
  process.exit(1)
})
