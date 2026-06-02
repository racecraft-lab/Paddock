#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const KNOWN_DOMAINS = new Set([
  'product-line-switcher',
  'feature-flag-admin',
  'task-pipeline-workflows',
  'workflow-contracts',
  'ready-for-owner',
  'spec-007',
  'spec-008',
])

function parseList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseArgs(argv) {
  const args = {
    root: process.env.MC_VISUAL_OUTPUT_DIR || path.join(process.cwd(), 'test-results', 'visual-current'),
    storiesRoot: path.join(process.cwd(), 'src'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      args.root = path.resolve(argv[index + 1])
      index += 1
    } else if (arg === '--stories-root') {
      args.storiesRoot = path.resolve(argv[index + 1])
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function storybookId(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function storybookExportId(input) {
  return storybookId(
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
  )
}

function humanize(input) {
  return String(input || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function titleDisplayName(title) {
  return String(title || '')
    .split('/')
    .map((segment) => humanize(segment))
    .filter(Boolean)
    .join(' / ')
}

function parseStoryExports(source) {
  const exportMatches = Array.from(source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*Story\b/g))
  const stories = new Map()

  for (let index = 0; index < exportMatches.length; index += 1) {
    const match = exportMatches[index]
    const exportName = match[1]
    const nextMatch = exportMatches[index + 1]
    const storySource = source.slice(match.index, nextMatch?.index ?? source.length)
    const explicitName = storySource.match(/\bname:\s*['"]([^'"]+)['"]/)?.[1]
    const id = storybookExportId(exportName)

    stories.set(id, {
      exportName,
      id,
      name: explicitName || humanize(exportName),
    })
  }

  return stories
}

function parseMeta(source) {
  const metaMatch = source.match(/const\s+meta\s*[:\w\s<>,]*=\s*\{([\s\S]*?)\}\s+satisfies\s+Meta/)
    || source.match(/const\s+meta\s*[:\w\s<>,]*=\s*\{([\s\S]*?)\}\s*(?:export\s+default|$)/)
  const metaSource = metaMatch?.[1] || source
  const title = metaSource.match(/title:\s*['"]([^'"]+)['"]/)?.[1]
  const tags = parseList(
    metaSource
      .match(/tags:\s*\[([^\]]*)\]/s)?.[1]
      ?.replace(/['"]/g, '') || '',
  )

  return { title, tags }
}

async function pathExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function collectFiles(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath, predicate))
      continue
    }
    if (entry.isFile() && predicate(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

async function collectStoryMetadata(storiesRoot) {
  const storyFiles = await collectFiles(storiesRoot, (name) => name.endsWith('.stories.tsx'))
  const metadata = new Map()

  for (const filePath of storyFiles) {
    const source = await readFile(filePath, 'utf8')
    const { title, tags } = parseMeta(source)
    if (!title) continue

    const domain = tags.find((tag) => KNOWN_DOMAINS.has(tag)) ||
      (title.toLowerCase().startsWith('governance/') ? 'spec-008' : 'unknown')

    metadata.set(storybookId(title), {
      title,
      displayTitle: titleDisplayName(title),
      tags,
      domain,
      sourceFile: path.relative(process.cwd(), filePath),
      stories: parseStoryExports(source),
    })
  }

  return metadata
}

async function sha256(filePath) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const storybookRoot = path.join(args.root, 'storybook')

  if (!await pathExists(storybookRoot)) {
    throw new Error(`${storybookRoot} does not exist`)
  }

  const storyMetadata = await collectStoryMetadata(args.storiesRoot)
  const pngs = await collectFiles(storybookRoot, (name) => name.endsWith('.png'))
  let written = 0

  for (const pngPath of pngs) {
    const storyId = path.basename(pngPath, '.png')
    const [titleId = storyId] = storyId.split('--')
    const storySlug = storyId.slice(titleId.length + 2) || storyId
    const metadata = storyMetadata.get(titleId)
    const story = metadata?.stories.get(storySlug)
    const componentName = metadata?.displayTitle || titleDisplayName(metadata?.title || titleId)
    const storyName = story?.name || humanize(storySlug)
    const domain = metadata?.domain || 'unknown'
    const tags = metadata?.tags || []
    const manifest = {
      version: 1,
      tool: 'paddock-visual',
      kind: 'storybook',
      domain,
      name: storyId,
      tags,
      sourceFile: metadata?.sourceFile || null,
      createdAt: new Date().toISOString(),
      screenshot: {
        path: path.relative(process.cwd(), pngPath),
        sha256: await sha256(pngPath),
        fullPage: true,
        viewport: { width: 1366, height: 768 },
      },
      review: {
        title: `${componentName}: ${storyName}`,
        description: `Review the ${storyName} Storybook state for ${componentName}.`,
        expected: '',
        focus: [
          'Story args and mocked state',
          'Responsive layout and spacing',
          'Visible copy, controls, and state badges',
        ],
        tags,
      },
      story: {
        id: storyId,
        title: metadata?.title || null,
        name: storyName,
        exportName: story?.exportName || null,
        titleId,
        sourceFile: metadata?.sourceFile || null,
        tags,
      },
    }
    await writeFile(pngPath.replace(/\.png$/, '.visual.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    written += 1
  }

  console.log(`[storybook-visual-manifests] wrote ${written.toString()} manifest files`)
}

main().catch((error) => {
  console.error(`[storybook-visual-manifests] ${error.stack || error.message}`)
  process.exit(1)
})
