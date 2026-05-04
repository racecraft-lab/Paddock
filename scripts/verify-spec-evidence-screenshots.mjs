#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const DEFAULT_MAX_BYTES = 500 * 1024
const MANIFEST_NAMES = new Set([
  'evidence-manifest.json',
  'artifact-manifest.json',
  'archive-evidence-manifest.json'
])

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    maxBytes: Number(process.env.SPEC_EVIDENCE_SCREENSHOT_MAX_BYTES || DEFAULT_MAX_BYTES),
    selfTest: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      args.root = path.resolve(argv[index + 1])
      index += 1
    } else if (arg === '--max-bytes') {
      args.maxBytes = Number(argv[index + 1])
      index += 1
    } else if (arg === '--self-test') {
      args.selfTest = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isFinite(args.maxBytes) || args.maxBytes < 1) {
    throw new Error('--max-bytes must be a positive number')
  }

  return args
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function collectFiles(dir, predicate, files = []) {
  if (!await pathExists(dir)) return files

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(fullPath, predicate, files)
    } else if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath)
    }
  }

  return files
}

async function sha256(filePath) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizeManifestPath(root, manifestPath, artifactPath) {
  if (typeof artifactPath !== 'string' || artifactPath.trim() === '') return null
  if (path.isAbsolute(artifactPath)) return path.normalize(artifactPath)

  const rootRelative = path.resolve(root, artifactPath)
  const manifestRelative = path.resolve(path.dirname(manifestPath), artifactPath)

  if (artifactPath.startsWith('specs/')) return rootRelative
  return manifestRelative
}

async function loadManifests(root) {
  const manifestFiles = await collectFiles(
    path.join(root, 'specs'),
    filePath => MANIFEST_NAMES.has(path.basename(filePath))
  )
  const artifacts = new Map()
  const failures = []

  for (const manifestPath of manifestFiles) {
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      failures.push(`${path.relative(root, manifestPath)}: invalid JSON manifest (${error.message})`)
      continue
    }

    const entries = Array.isArray(manifest.artifacts) ? manifest.artifacts : []
    if (!Array.isArray(manifest.artifacts)) {
      failures.push(`${path.relative(root, manifestPath)}: missing artifacts array`)
      continue
    }

    for (const entry of entries) {
      const absolutePath = normalizeManifestPath(root, manifestPath, entry.path)
      if (!absolutePath) {
        failures.push(`${path.relative(root, manifestPath)}: artifact entry missing path`)
        continue
      }

      artifacts.set(path.normalize(absolutePath), {
        manifestPath,
        entry
      })
    }
  }

  return { artifacts, failures }
}

function validateManifestEntry(root, filePath, fileStat, hash, manifestRecord) {
  const failures = []
  const relativeFile = path.relative(root, filePath)
  const { entry, manifestPath } = manifestRecord
  const relativeManifest = path.relative(root, manifestPath)

  if (entry.sha256 !== hash) {
    failures.push(`${relativeFile}: sha256 does not match ${relativeManifest}`)
  }
  if (entry.bytes !== fileStat.size) {
    failures.push(`${relativeFile}: byte size does not match ${relativeManifest}`)
  }
  if (!entry.ciArtifact?.name || !entry.ciArtifact?.url) {
    failures.push(`${relativeFile}: manifest entry must include ciArtifact.name and ciArtifact.url`)
  }
  if (!entry.retentionClassification) {
    failures.push(`${relativeFile}: manifest entry must include retentionClassification`)
  }
  if (!entry.redactionStatus) {
    failures.push(`${relativeFile}: manifest entry must include redactionStatus`)
  }
  if (!entry.expirationRisk) {
    failures.push(`${relativeFile}: manifest entry must include expirationRisk`)
  }

  return failures
}

async function runGuard(root, maxBytes) {
  const specsDir = path.join(root, 'specs')
  const imageFiles = await collectFiles(specsDir, filePath => {
    return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  })
  const { artifacts, failures } = await loadManifests(root)

  for (const filePath of imageFiles) {
    const relativeFile = path.relative(root, filePath)
    const fileStat = await stat(filePath)
    const hash = await sha256(filePath)
    const manifestRecord = artifacts.get(path.normalize(filePath))

    if (!manifestRecord) {
      failures.push(`${relativeFile}: committed generated screenshot is not listed in an evidence manifest`)
      continue
    }

    if (fileStat.size > maxBytes) {
      failures.push(`${relativeFile}: committed screenshot is ${fileStat.size} bytes, above ${maxBytes} byte limit`)
    }

    failures.push(...validateManifestEntry(root, filePath, fileStat, hash, manifestRecord))
  }

  return {
    ok: failures.length === 0,
    checkedImages: imageFiles.length,
    failures
  }
}

async function runSelfTest(maxBytes) {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'spec-evidence-screenshots-'))
  const fixturePath = path.join(tmpRoot, 'specs', 'negative-fixture', 'screenshots', 'unmanifested.png')

  try {
    await mkdir(path.dirname(fixturePath), { recursive: true })
    await writeFile(fixturePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))

    const result = await runGuard(tmpRoot, maxBytes)
    const expectedPath = 'specs/negative-fixture/screenshots/unmanifested.png'
    if (result.ok || !result.failures.some(failure => failure.includes(expectedPath))) {
      console.error('[spec-evidence-screenshots] synthetic negative fixture did not fail as expected')
      console.error(result.failures.join('\n'))
      process.exitCode = 1
      return
    }

    console.log(`[spec-evidence-screenshots] synthetic negative fixture failed as expected: ${expectedPath}`)
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.selfTest) {
    await runSelfTest(args.maxBytes)
    return
  }

  const result = await runGuard(args.root, args.maxBytes)
  if (!result.ok) {
    console.error('[spec-evidence-screenshots] screenshot evidence guard failed:')
    for (const failure of result.failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`[spec-evidence-screenshots] checked ${result.checkedImages} committed spec screenshot(s); policy passed`)
}

main().catch(error => {
  console.error(`[spec-evidence-screenshots] ${error.stack || error.message}`)
  process.exitCode = 1
})
