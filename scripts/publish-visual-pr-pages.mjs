#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  resolveInitialReviewStateSource,
} from './visual-review-producer.mjs'

const SURFACES = {
  playwright: {
    label: 'Playwright UI E2E',
    workflowFile: 'mission-control-ui-e2e.yml',
  },
  storybook: {
    label: 'Storybook Components',
    workflowFile: 'visual-storybook.yml',
  },
}

function parseArgs(argv) {
  const args = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`)
    }

    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      throw new Error(`missing value for --${key}`)
    }

    args[key] = next
    i += 1
  }

  return args
}

function readJsonIfPresent(filePath, fallback) {
  if (!filePath || !existsSync(filePath)) return fallback

  return readFile(filePath, 'utf8')
    .then((content) => JSON.parse(content))
    .catch(() => fallback)
}

async function readGitHubEvent() {
  return readJsonIfPresent(process.env.GITHUB_EVENT_PATH, {})
}

function repoParts(repository) {
  const [owner, repo] = String(repository || '').split('/')
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY must be set to owner/repo')
  }

  return { owner, repo }
}

function pageBaseUrl(repository, explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/+$/, '')

  const { owner, repo } = repoParts(repository)
  return `https://${owner}.github.io/${repo}`
}

function githubServerUrl() {
  return process.env.GITHUB_SERVER_URL || 'https://github.com'
}

function githubApiUrl() {
  return process.env.GITHUB_API_URL || 'https://api.github.com'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  })

  if (result.status === 0) return result
  if (options.allowFailure) return result

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  throw new Error(`${command} ${args.join(' ')} failed${output ? `\n${output}` : ''}`)
}

function safeBranchName(branch) {
  return String(branch || 'unknown').replace(/[^\w./-]+/g, '-')
}

function scriptAssetUrl(fileName) {
  return new URL(`./${fileName}`, import.meta.url)
}

function extractReportPayload(reportHtml) {
  const match = reportHtml.match(/(window\[['"]__reg__['"]\]\s*=\s*)(\{[\s\S]*?\})(;\s*<\/script>)/)
  if (!match) {
    throw new Error('visual report does not contain window.__reg__ payload')
  }

  try {
    return {
      prefix: match[1],
      payload: JSON.parse(match[2]),
      suffix: match[3],
      token: match[0],
    }
  } catch (error) {
    throw new Error(`unable to parse visual report payload: ${error.message}`)
  }
}

function localizeReportAssetPaths(reportHtml, extracted, payload) {
  const localizedPayload = localizedReportPayload(payload)

  return reportHtml.replace(
    extracted.token,
    `${extracted.prefix}${JSON.stringify(localizedPayload)}${extracted.suffix}`
  )
}

function localizedReportPayload(payload) {
  return {
    ...payload,
    actualDir: './__reg__/1_actual',
    expectedDir: './__reg__/2_expected',
    diffDir: './__reg__/0_diff',
  }
}

function manifestFileName(fileName) {
  const parsed = path.parse(fileName)
  return parsed.dir ? `${parsed.dir}/${parsed.name}.visual.json` : `${parsed.name}.visual.json`
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function manifestPathCandidates(baseDir, fileName) {
  const candidates = [fileName]
  try {
    candidates.push(decodeURIComponent(fileName))
  } catch {
    // Keep the encoded candidate only.
  }
  return uniqueStrings(candidates).flatMap((candidate) => {
    try {
      return [resolveInside(baseDir, manifestFileName(candidate))]
    } catch {
      return []
    }
  })
}

function fallbackDisplayName(input) {
  return String(input || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : []
}

function annotationArray(value) {
  return Array.isArray(value)
    ? value
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        type: stringOrNull(entry.type) || 'note',
        description: stringOrNull(entry.description) || '',
      }))
    : []
}

function storyDisplayName(story, fallback) {
  const name = typeof story?.name === 'string' && story.name
    ? story.name
    : typeof story?.id === 'string'
      ? story.id.split('--').pop()
      : fallback
  return fallbackDisplayName(name)
}

function reviewMetadataFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return null
  const sourceFile = manifest.test?.sourceFile || manifest.story?.sourceFile || manifest.sourceFile || null
  const line = manifest.test?.line ? `:${manifest.test.line}` : ''
  const review = manifest.review && typeof manifest.review === 'object' ? manifest.review : {}
  const reviewTags = stringArray(review.tags)
  const manifestTags = stringArray(manifest.tags)

  if (manifest.kind === 'playwright') {
    const titlePath = Array.isArray(manifest.test?.titlePath)
      ? manifest.test.titlePath.filter(Boolean)
      : []
    return {
      description: stringOrNull(review.description) || '',
      domain: manifest.domain || null,
      expected: stringOrNull(review.expected) || '',
      focus: stringArray(review.focus),
      kind: manifest.kind,
      name: manifest.name || null,
      sourceFile: sourceFile ? `${sourceFile}${line}` : null,
      subtitle: titlePath.length > 1 ? titlePath.join(' > ') : sourceFile,
      tags: reviewTags.length ? reviewTags : manifestTags,
      testAnnotations: annotationArray(manifest.test?.annotations),
      testTitle: stringOrNull(manifest.test?.title),
      testTitlePath: titlePath,
      title: stringOrNull(review.title) || stringOrNull(manifest.test?.title) || fallbackDisplayName(manifest.name),
    }
  }

  if (manifest.kind === 'storybook') {
    const title = manifest.story?.title || manifest.name || null
    const storyName = storyDisplayName(manifest.story, manifest.name)
    const storyTags = stringArray(manifest.story?.tags)
    return {
      description: stringOrNull(review.description) || '',
      domain: manifest.domain || null,
      expected: stringOrNull(review.expected) || '',
      focus: stringArray(review.focus),
      kind: manifest.kind,
      name: manifest.name || null,
      sourceFile,
      subtitle: sourceFile,
      tags: reviewTags.length ? reviewTags : (storyTags.length ? storyTags : manifestTags),
      storyExportName: stringOrNull(manifest.story?.exportName),
      storyId: stringOrNull(manifest.story?.id),
      storyName,
      storyTitle: stringOrNull(title),
      title: stringOrNull(review.title) || (title && storyName ? `${title} / ${storyName}` : (title || storyName || null)),
    }
  }

  return {
    description: stringOrNull(review.description) || '',
    domain: manifest.domain || null,
    expected: stringOrNull(review.expected) || '',
    focus: stringArray(review.focus),
    kind: manifest.kind || null,
    name: manifest.name || null,
    sourceFile,
    subtitle: sourceFile,
    tags: reviewTags.length ? reviewTags : manifestTags,
    title: stringOrNull(review.title) || fallbackDisplayName(manifest.name),
  }
}

async function readVisualMetadata(baseDirs, fileName) {
  if (!fileName) return null
  for (const baseDir of baseDirs.filter(Boolean)) {
    for (const candidate of manifestPathCandidates(baseDir, fileName)) {
      if (!existsSync(candidate)) continue
      try {
        return reviewMetadataFromManifest(JSON.parse(await readFile(candidate, 'utf8')))
      } catch {
        return null
      }
    }
  }
  return null
}

async function attachVisualMetadata(items, baseDirs) {
  const enriched = []
  for (const item of items) {
    const fileName = itemFileName(item)
    const review = await readVisualMetadata(baseDirs, fileName)
    enriched.push(review ? { ...item, review } : item)
  }
  return enriched
}

function defaultManifestDir(surface) {
  const root = process.env.MC_VISUAL_OUTPUT_DIR || path.join(process.cwd(), 'test-results', 'visual-current')
  return path.join(root, surface)
}

function manifestDirsForOptions(options) {
  return uniqueStrings([
    options['manifest-dir'],
    defaultManifestDir(options.surface),
  ])
}

async function enrichReportPayload(payload, reportDir, manifestDirs = []) {
  const actualDir = path.resolve(reportDir, payload.actualDir)
  const expectedDir = path.resolve(reportDir, payload.expectedDir)
  const externalManifestDirs = manifestDirs.filter((dir) => dir && existsSync(dir))

  return {
    ...payload,
    deletedItems: await attachVisualMetadata(reportItems(payload, 'deletedItems'), [
      expectedDir,
      actualDir,
      ...externalManifestDirs,
    ]),
    failedItems: await attachVisualMetadata(reportItems(payload, 'failedItems'), [
      actualDir,
      expectedDir,
      ...externalManifestDirs,
    ]),
    newItems: await attachVisualMetadata(reportItems(payload, 'newItems'), [
      actualDir,
      ...externalManifestDirs,
    ]),
    passedItems: await attachVisualMetadata(reportItems(payload, 'passedItems'), [
      actualDir,
      ...externalManifestDirs,
    ]),
  }
}

function escapeJsonScript(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}

function generateVisualReviewAppIndex({ context, payload }) {
  const title = `${context.surfaceLabel} Visual Review`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="./visual-review-app.css" />
  </head>
  <body>
    <div id="visual-review-root"></div>
    <noscript>This visual review app requires JavaScript. Open reg-viz.html for the static fallback report.</noscript>
    <script id="visual-review-data" type="application/json">${escapeJsonScript({ context, payload })}</script>
    <script src="./visual-review-app.js" type="module"></script>
  </body>
</html>
`
}

function reportItems(payload, key) {
  return Array.isArray(payload[key]) ? payload[key] : []
}

function itemFileName(item) {
  const fileName = item?.encoded || item?.raw
  return typeof fileName === 'string' && fileName.length > 0 ? fileName : null
}

function diffFileName(item, payload) {
  const fileName = itemFileName(item)
  if (!fileName) return null

  const extension = String(payload.diffImageExtention || payload.diffImageExtension || 'webp')
    .replace(/^\./, '')
  const parsed = path.parse(fileName)
  return parsed.dir ? `${parsed.dir}/${parsed.name}.${extension}` : `${parsed.name}.${extension}`
}

function requiredAssetFiles(payload) {
  const newItems = reportItems(payload, 'newItems')
  const passedItems = reportItems(payload, 'passedItems')
  const failedItems = reportItems(payload, 'failedItems')
  const deletedItems = reportItems(payload, 'deletedItems')

  return {
    actual: [...newItems, ...passedItems, ...failedItems].map(itemFileName).filter(Boolean),
    expected: [...deletedItems, ...failedItems].map(itemFileName).filter(Boolean),
    diff: failedItems.map((item) => diffFileName(item, payload)).filter(Boolean),
  }
}

function resolveInside(rootDir, relativePath) {
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, relativePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`visual report asset escapes expected directory: ${relativePath}`)
  }
  return resolved
}

async function copyReportAssetDir({ label, sourceDir, targetDir, requiredFiles }) {
  if (!existsSync(sourceDir)) {
    if (requiredFiles.length > 0) {
      throw new Error(`missing ${label} visual image directory: ${sourceDir}`)
    }
    return
  }

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(sourceDir, targetDir, { recursive: true })

  const missing = requiredFiles.filter((fileName) => !existsSync(resolveInside(targetDir, fileName)))
  if (missing.length > 0) {
    const sample = missing.slice(0, 5).join(', ')
    throw new Error(
      `missing ${missing.length.toString()} ${label} visual image file(s) after copy from ${sourceDir}: ${sample}`
    )
  }
}

async function writeReportBundle({ reportFile, reportHtml, extracted, targetDir, context, manifestDirs }) {
  const payload = extracted.payload
  const reportDir = path.dirname(reportFile)
  const enrichedPayload = await enrichReportPayload(payload, reportDir, manifestDirs)
  const requiredFiles = requiredAssetFiles(payload)
  const assetRoot = path.join(targetDir, '__reg__')

  await mkdir(targetDir, { recursive: true })
  await copyReportAssetDir({
    label: 'actual',
    sourceDir: path.resolve(reportDir, payload.actualDir),
    targetDir: path.join(assetRoot, '1_actual'),
    requiredFiles: requiredFiles.actual,
  })
  await copyReportAssetDir({
    label: 'expected',
    sourceDir: path.resolve(reportDir, payload.expectedDir),
    targetDir: path.join(assetRoot, '2_expected'),
    requiredFiles: requiredFiles.expected,
  })
  await copyReportAssetDir({
    label: 'diff',
    sourceDir: path.resolve(reportDir, payload.diffDir),
    targetDir: path.join(assetRoot, '0_diff'),
    requiredFiles: requiredFiles.diff,
  })

  const localizedHtml = localizeReportAssetPaths(reportHtml, extracted, enrichedPayload)
  await writeFile(path.join(targetDir, 'reg-viz.html'), localizedHtml)
  await writeFile(
    path.join(targetDir, 'visual-review-app.css'),
    await readFile(scriptAssetUrl('visual-review-app.css'), 'utf8')
  )
  await writeFile(
    path.join(targetDir, 'visual-review-app.js'),
    await readFile(scriptAssetUrl('visual-review-app.js'), 'utf8')
  )
  await writeFile(
    path.join(targetDir, 'visual-review-state.mjs'),
    await readFile(scriptAssetUrl('visual-review-state.mjs'), 'utf8')
  )
  await writeFile(
    path.join(targetDir, 'index.html'),
    generateVisualReviewAppIndex({
      context,
      payload: localizedReportPayload(enrichedPayload),
    })
  )
}

async function clonePagesBranch({ repository, token, branch }) {
  const pagesDir = await mkdtemp(path.join(os.tmpdir(), 'mc-visual-pages-'))
  const remote = `https://x-access-token:${token}@github.com/${repository}.git`
  const clone = run('git', ['clone', '--depth', '1', '--branch', branch, remote, pagesDir], {
    allowFailure: true,
    quiet: true,
  })

  if (clone.status !== 0) {
    await rm(pagesDir, { recursive: true, force: true })
    throw new Error(`unable to clone ${branch} from ${repository}`)
  }

  return pagesDir
}

async function readRegistry(registryPath) {
  const fallback = { version: 1, updatedAt: null, prs: [] }
  const registry = await readJsonIfPresent(registryPath, fallback)
  if (!Array.isArray(registry.prs)) registry.prs = []
  if (!registry.version) registry.version = 1
  return registry
}

function reportRow(report, current) {
  const activeClass = current ? ' class="current"' : ''
  const surface = SURFACES[report.surface]?.label || report.surface

  return [
    `<tr${activeClass}>`,
    `<td>${escapeHtml(surface)}</td>`,
    `<td><a href="${escapeHtml(report.reportHref)}">Open report</a></td>`,
    `<td><a href="${escapeHtml(report.runUrl)}">Run ${escapeHtml(report.runId)}</a></td>`,
    `<td><code>${escapeHtml(report.headSha.slice(0, 7))}</code></td>`,
    `<td>${escapeHtml(new Date(report.createdAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td>`,
    '</tr>',
  ].join('')
}

function generatePrIndex({ meta, baseUrl }) {
  const latestBySurface = new Map()
  for (const report of meta.reports) {
    const current = latestBySurface.get(report.surface)
    if (!current || new Date(report.createdAt) > new Date(current.createdAt)) {
      latestBySurface.set(report.surface, report)
    }
  }

  const cards = Array.from(latestBySurface.values())
    .sort((a, b) => a.surface.localeCompare(b.surface))
    .map((report) => {
      const surface = SURFACES[report.surface]?.label || report.surface
      return `
        <article class="card">
          <p class="eyebrow">${escapeHtml(surface)}</p>
          <h2>Latest visual report</h2>
          <p>Use the review queue, filters, and diff modes to inspect baseline, current, and changed screenshots generated by the PR workflow.</p>
          <a class="button" href="${escapeHtml(report.latestHref)}">Open visual review</a>
          <a class="link" href="${escapeHtml(report.runUrl)}">Workflow run ${escapeHtml(report.runId)}</a>
        </article>
      `
    })
    .join('\n')

  const rows = meta.reports
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((report) => reportRow(report, latestBySurface.get(report.surface)?.runKey === report.runKey))
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PR #${escapeHtml(meta.prNumber)} Visual Review</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f8fb;
        --panel: #ffffff;
        --text: #17202f;
        --muted: #5b6678;
        --line: #d9dee8;
        --accent: #0a7f86;
        --accent-dark: #065c62;
        --warn: #9a5b00;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      header {
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      .wrap {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0;
      }
      .crumbs {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 18px;
        color: var(--muted);
        font-size: 13px;
      }
      a { color: var(--accent-dark); font-weight: 650; }
      h1 {
        margin: 0;
        font-size: 42px;
        line-height: 1.05;
        letter-spacing: 0;
      }
      .summary {
        max-width: 780px;
        margin: 14px 0 0;
        color: var(--muted);
        font-size: 17px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .card, .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 20px;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent-dark);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      h2 { margin: 0 0 10px; font-size: 20px; }
      p { margin: 0 0 14px; }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 8px 12px;
        margin: 4px 8px 4px 0;
        border-radius: 6px;
        background: var(--accent);
        color: #fff;
        text-decoration: none;
      }
      .link {
        display: inline-flex;
        min-height: 38px;
        align-items: center;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        padding: 12px 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0;
      }
      tr.current td {
        background: #eef8f7;
      }
      code {
        padding: 2px 5px;
        border-radius: 5px;
        background: #eef1f6;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .note {
        border-left: 4px solid var(--warn);
        padding-left: 14px;
        color: var(--muted);
      }
      @media (max-width: 720px) {
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        td { padding: 10px 0; }
        tr { border-bottom: 1px solid var(--line); }
        h1 { font-size: 30px; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="${escapeHtml(baseUrl)}/">Mission Control visual reviews</a>
          <span>/</span>
          <a href="${escapeHtml(baseUrl)}/pr/">PR reports</a>
        </nav>
        <p class="eyebrow">Pull Request #${escapeHtml(meta.prNumber)}</p>
        <h1>${escapeHtml(meta.prTitle || `PR #${meta.prNumber}`)}</h1>
        <p class="summary">Reviewer-facing visual reports for <code>${escapeHtml(meta.headRef)}</code> into <code>${escapeHtml(meta.baseRef)}</code>. Open each latest report and inspect every changed baseline, current, diff, new, and removed image before approving UI changes.</p>
      </div>
    </header>
    <main class="wrap">
      <section class="grid" aria-label="Latest visual reports">
        ${cards || '<article class="card"><h2>No reports yet</h2><p>Visual report publishing has not completed for this PR.</p></article>'}
      </section>
      <section class="panel" style="margin-top: 16px;">
        <h2>Run History</h2>
        <p class="note">Each run hosts a visual review app plus a raw reg-viz fallback report. Images are copied into the report-local <code>__reg__</code> tree so reviewers can inspect baseline, current, and diff assets without downloading workflow artifacts.</p>
        <table>
          <thead>
            <tr>
              <th>Surface</th>
              <th>Report</th>
              <th>Workflow</th>
              <th>Commit</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No visual report runs recorded.</td></tr>'}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>
`
}

function generateRegistryIndex(registry, baseUrl) {
  const rows = registry.prs
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((pr) => {
      const surfaces = Object.keys(pr.latest || {})
        .sort()
        .map((surface) => `<a href="${escapeHtml(pr.latest[surface].latestHref)}">${escapeHtml(surface)}</a>`)
        .join(' ')

      return `
        <tr>
          <td><a href="${escapeHtml(pr.indexHref)}">#${escapeHtml(pr.prNumber)}</a></td>
          <td>${escapeHtml(pr.prTitle || `PR #${pr.prNumber}`)}</td>
          <td>${surfaces || 'No reports'}</td>
          <td><code>${escapeHtml(pr.headRef)}</code></td>
          <td>${escapeHtml(new Date(pr.updatedAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td>
        </tr>
      `
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mission Control PR Visual Reports</title>
    <style>
      :root { color-scheme: light; --bg: #f7f8fb; --panel: #fff; --text: #17202f; --muted: #5b6678; --line: #d9dee8; --accent: #0a7f86; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
      .wrap { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }
      header { background: var(--panel); border-bottom: 1px solid var(--line); }
      h1 { margin: 0; font-size: 40px; letter-spacing: 0; line-height: 1.08; }
      p { color: var(--muted); margin: 10px 0 0; max-width: 760px; }
      a { color: #065c62; font-weight: 650; }
      .panel { margin-top: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
      code { padding: 2px 5px; border-radius: 5px; background: #eef1f6; font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
      .crumbs { margin-bottom: 18px; font-size: 13px; color: var(--muted); }
      @media (max-width: 720px) { table, thead, tbody, th, td, tr { display: block; } thead { display: none; } td { padding: 10px 0; } tr { border-bottom: 1px solid var(--line); } h1 { font-size: 30px; } }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap">
        <nav class="crumbs"><a href="${escapeHtml(baseUrl)}/">Mission Control visual reviews</a> / PR reports</nav>
        <h1>Pull Request Visual Reports</h1>
        <p>Latest PR visual comparison reports published from CI. Use these Pages links to review baseline, current, and diff images without downloading Actions artifacts.</p>
      </div>
    </header>
    <main class="wrap">
      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>PR</th>
              <th>Title</th>
              <th>Latest Reports</th>
              <th>Head</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No PR visual reports have been published yet.</td></tr>'}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>
`
}

function generateMainIndex(meta, baseUrl) {
  const latestBySurface = new Map()
  for (const report of meta.reports) {
    const current = latestBySurface.get(report.surface)
    if (!current || new Date(report.createdAt) > new Date(current.createdAt)) {
      latestBySurface.set(report.surface, report)
    }
  }

  const cards = Array.from(latestBySurface.values())
    .sort((a, b) => a.surface.localeCompare(b.surface))
    .map((report) => {
      const surface = SURFACES[report.surface]?.label || report.surface
      return `
        <article class="card">
          <p class="eyebrow">${escapeHtml(surface)}</p>
          <h2>Latest main report</h2>
          <p>Visual assets generated from the current <code>main</code> branch. Use this as the baseline reference when reviewing future pull requests.</p>
          <a class="button" href="${escapeHtml(report.latestHref)}">Open latest report</a>
          <a class="link" href="${escapeHtml(report.runUrl)}">Workflow run ${escapeHtml(report.runId)}</a>
        </article>
      `
    })
    .join('\n')

  const rows = meta.reports
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((report) => {
      const surface = SURFACES[report.surface]?.label || report.surface
      const current = latestBySurface.get(report.surface)?.reportKey === report.reportKey
      const activeClass = current ? ' class="current"' : ''
      return `
        <tr${activeClass}>
          <td>${escapeHtml(surface)}</td>
          <td><a href="${escapeHtml(report.reportHref)}">Open report</a></td>
          <td><a href="${escapeHtml(report.runUrl)}">Run ${escapeHtml(report.runId)}</a></td>
          <td><code>${escapeHtml(report.headSha.slice(0, 7))}</code></td>
          <td>${escapeHtml(new Date(report.createdAt).toLocaleString('en-US', { timeZone: 'UTC' }))} UTC</td>
        </tr>
      `
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Main Branch Visual Reports</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f8fb;
        --panel: #ffffff;
        --text: #17202f;
        --muted: #5b6678;
        --line: #d9dee8;
        --accent: #0a7f86;
        --accent-dark: #065c62;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      header { border-bottom: 1px solid var(--line); background: var(--panel); }
      .wrap { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }
      .crumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; color: var(--muted); font-size: 13px; }
      a { color: var(--accent-dark); font-weight: 650; }
      h1 { margin: 0; font-size: 40px; line-height: 1.08; letter-spacing: 0; }
      h2 { margin: 0 0 10px; font-size: 20px; }
      p { margin: 0 0 14px; color: var(--muted); }
      .summary { max-width: 780px; margin-top: 14px; font-size: 17px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
      .card, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
      .eyebrow { margin: 0 0 8px; color: var(--accent-dark); font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
      .button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 8px 12px; margin: 4px 8px 4px 0; border-radius: 6px; background: var(--accent); color: #fff; text-decoration: none; }
      .link { display: inline-flex; min-height: 38px; align-items: center; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
      tr.current td { background: #eef8f7; }
      code { padding: 2px 5px; border-radius: 5px; background: #eef1f6; font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
      @media (max-width: 720px) {
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        td { padding: 10px 0; }
        tr { border-bottom: 1px solid var(--line); }
        h1 { font-size: 30px; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="${escapeHtml(baseUrl)}/">Mission Control visual reviews</a>
          <span>/</span>
          <a href="${escapeHtml(baseUrl)}/pr/">PR reports</a>
        </nav>
        <p class="eyebrow">Main Branch</p>
        <h1>Main Branch Visual Reports</h1>
        <p class="summary">Latest Storybook and Playwright visual reports generated from <code>main</code>. Pull request reports remain available from <a href="${escapeHtml(baseUrl)}/pr/">PR reports</a>.</p>
      </div>
    </header>
    <main class="wrap">
      <section class="grid" aria-label="Latest main visual reports">
        ${cards || '<article class="card"><h2>No main reports yet</h2><p>Main visual report publishing has not completed yet.</p></article>'}
      </section>
      <section class="panel" style="margin-top: 16px;">
        <h2>Run History</h2>
        <table>
          <thead>
            <tr>
              <th>Surface</th>
              <th>Report</th>
              <th>Workflow</th>
              <th>Commit</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">No main visual reports have been published yet.</td></tr>'}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>
`
}

function latestMapForReports(reports, baseUrl, prNumber) {
  const latest = {}
  for (const report of reports) {
    const current = latest[report.surface]
    if (!current || new Date(report.createdAt) > new Date(current.createdAt)) {
      latest[report.surface] = {
        runId: report.runId,
        runUrl: report.runUrl,
        latestHref: `${baseUrl}/pr/${prNumber}/${report.surface}/latest/`,
        reportHref: report.reportHref,
        updatedAt: report.createdAt,
      }
    }
  }
  return latest
}

async function publishReport(options) {
  const surface = options.surface
  if (!SURFACES[surface]) {
    throw new Error(`--surface must be one of: ${Object.keys(SURFACES).join(', ')}`)
  }

  const reportFile = options['report-file']
  if (!reportFile || !existsSync(reportFile)) {
    throw new Error(`visual report file not found: ${reportFile || '(missing --report-file)'}`)
  }

  const event = await readGitHubEvent()
  const repository = options.repository || process.env.GITHUB_REPOSITORY
  const baseUrl = pageBaseUrl(repository, options['base-url'] || process.env.MC_VISUAL_PAGES_BASE_URL)
  const mode = options.mode || 'pr'
  if (!['pr', 'main'].includes(mode)) {
    throw new Error('--mode must be pr or main')
  }
  const prPayload = event.pull_request || {}
  const prNumber = String(options['pr-number'] || prPayload.number || '')
  if (mode === 'pr' && !prNumber) throw new Error('--pr-number or pull_request event payload is required')

  const branch = options.branch || process.env.MC_VISUAL_PAGES_BRANCH || 'visual-regression-pages'
  const runId = String(options['run-id'] || process.env.GITHUB_RUN_ID || 'local')
  const runAttempt = String(options['run-attempt'] || process.env.GITHUB_RUN_ATTEMPT || '1')
  const runKey = `${runId}-attempt-${runAttempt}`
  const headRef = safeBranchName(options['head-ref'] || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || prPayload.head?.ref)
  const baseRef = safeBranchName(options['base-ref'] || process.env.GITHUB_BASE_REF || (mode === 'main' ? process.env.GITHUB_REF_NAME : prPayload.base?.ref))
  const headSha = String(options.sha || prPayload.head?.sha || process.env.GITHUB_SHA || 'unknown')
  const workflowName = options.workflow || process.env.GITHUB_WORKFLOW || SURFACES[surface].label
  const runUrl = options['run-url'] || `${githubServerUrl()}/${repository}/actions/runs/${runId}`
  const prUrl = options['pr-url'] || prPayload.html_url || `${githubServerUrl()}/${repository}/pull/${prNumber}`
  const createdAt = new Date().toISOString()

  let pagesDir = options['pages-dir']
  let shouldCleanup = false
  if (!pagesDir) {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN is required when --pages-dir is not provided')
    pagesDir = await clonePagesBranch({ repository, token, branch })
    shouldCleanup = true
  }

  if (mode === 'main') {
    const reportHtml = await readFile(reportFile, 'utf8')
    const extractedReport = extractReportPayload(reportHtml)
    const { sourcePullRequest, initialReviewState } = await resolveInitialReviewStateSource({
      options,
      event,
      repository,
      baseUrl,
      headSha,
      headRef,
      surface,
      payload: extractedReport.payload,
      githubApiUrl: githubApiUrl(),
      githubServerUrl: githubServerUrl(),
      token: process.env.GITHUB_TOKEN,
    })
    const reportKey = safeBranchName(options['report-key'] || headSha || runKey)
    const runReportDir = path.join(pagesDir, surface, reportKey)
    const latestReportDir = path.join(pagesDir, surface, 'latest')
    const reportHref = `${baseUrl}/${surface}/${reportKey}/`
    const latestHref = `${baseUrl}/${surface}/latest/`
    const reviewContext = {
      repository,
      baseUrl,
      prNumber: sourcePullRequest?.number || '',
      prTitle: sourcePullRequest?.title || 'Main branch visual report',
      prUrl: sourcePullRequest?.url || '',
      prIndexHref: sourcePullRequest?.indexHref || `${baseUrl}/`,
      initialReviewState: initialReviewState?.state || null,
      initialReviewStateAuthor: initialReviewState?.author || '',
      initialReviewStateCommentId: initialReviewState?.commentId || null,
      reportMode: 'main',
      sourcePullRequest,
      surface,
      surfaceLabel: SURFACES[surface].label,
      workflowName,
      workflowFile: SURFACES[surface].workflowFile,
      runId,
      runAttempt,
      runKey,
      runUrl,
      headRef,
      baseRef,
      headSha,
      createdAt,
      regVizHref: './reg-viz.html',
    }

    await writeReportBundle({
      reportFile,
      reportHtml,
      extracted: extractedReport,
      targetDir: runReportDir,
      manifestDirs: manifestDirsForOptions(options),
      context: {
        ...reviewContext,
        reportHref,
        reportScope: 'run',
      },
    })
    await writeReportBundle({
      reportFile,
      reportHtml,
      extracted: extractedReport,
      targetDir: latestReportDir,
      manifestDirs: manifestDirsForOptions(options),
      context: {
        ...reviewContext,
        reportHref: latestHref,
        reportScope: 'latest',
      },
    })

    const metaPath = path.join(pagesDir, 'visual-main-runs.json')
    const meta = await readJsonIfPresent(metaPath, {
      version: 1,
      reports: [],
    })
    meta.version = 1
    meta.updatedAt = createdAt
    meta.reports = Array.isArray(meta.reports) ? meta.reports : []

    const reportRecord = {
      surface,
      runId,
      runAttempt,
      runKey,
      runUrl,
      reportKey,
      reportHref,
      latestHref,
      headSha,
      headRef,
      baseRef,
      workflowName,
      workflowFile: SURFACES[surface].workflowFile,
      sourcePullRequest,
      createdAt,
    }

    meta.reports = [
      reportRecord,
      ...meta.reports.filter((report) => !(report.surface === surface && report.reportKey === reportKey)),
    ]

    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
    await writeFile(path.join(pagesDir, 'index.html'), generateMainIndex(meta, baseUrl))

    if (!options['pages-dir']) {
      run('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: pagesDir })
      run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { cwd: pagesDir })
      run('git', ['add', surface, 'visual-main-runs.json', 'index.html'], { cwd: pagesDir })
      const diff = run('git', ['diff', '--cached', '--quiet'], { cwd: pagesDir, allowFailure: true, quiet: true })
      if (diff.status !== 0) {
        run('git', ['commit', '-m', `docs: publish main ${surface} visual report`], { cwd: pagesDir })
        const push = run('git', ['push', 'origin', `HEAD:${branch}`], { cwd: pagesDir, allowFailure: true })
        if (push.status !== 0) {
          run('git', ['pull', '--rebase', 'origin', branch], { cwd: pagesDir })
          run('git', ['push', 'origin', `HEAD:${branch}`], { cwd: pagesDir })
        }
      } else {
        console.log('[visual-pr-pages] no Pages changes to publish')
      }
    }

    console.log(`[visual-pr-pages] published ${surface} report: ${latestHref}`)

    if (shouldCleanup) {
      await rm(pagesDir, { recursive: true, force: true })
    }
    return
  }

  const prRoot = path.join(pagesDir, 'pr', prNumber)
  const runReportDir = path.join(prRoot, 'runs', runKey, surface)
  const latestReportDir = path.join(prRoot, surface, 'latest')
  const reportHtml = await readFile(reportFile, 'utf8')
  const extractedReport = extractReportPayload(reportHtml)
  const reportHref = `${baseUrl}/pr/${prNumber}/runs/${runKey}/${surface}/`
  const latestHref = `${baseUrl}/pr/${prNumber}/${surface}/latest/`
  const reviewContext = {
    repository,
    baseUrl,
    prNumber,
    prTitle: prPayload.title || `PR #${prNumber}`,
    prUrl,
    prIndexHref: `${baseUrl}/pr/${prNumber}/`,
    surface,
    surfaceLabel: SURFACES[surface].label,
    workflowName,
    workflowFile: SURFACES[surface].workflowFile,
    runId,
    runAttempt,
    runKey,
    runUrl,
    headRef,
    baseRef,
    headSha,
    createdAt,
    regVizHref: './reg-viz.html',
  }

  await writeReportBundle({
    reportFile,
    reportHtml,
    extracted: extractedReport,
    targetDir: runReportDir,
    manifestDirs: manifestDirsForOptions(options),
    context: {
      ...reviewContext,
      reportHref,
      reportScope: 'run',
    },
  })
  await writeReportBundle({
    reportFile,
    reportHtml,
    extracted: extractedReport,
    targetDir: latestReportDir,
    manifestDirs: manifestDirsForOptions(options),
    context: {
      ...reviewContext,
      reportHref: latestHref,
      reportScope: 'latest',
    },
  })

  const metaPath = path.join(prRoot, 'visual-runs.json')
  const meta = await readJsonIfPresent(metaPath, {
    version: 1,
    prNumber,
    prTitle: prPayload.title || `PR #${prNumber}`,
    prUrl,
    headRef,
    baseRef,
    reports: [],
  })

  meta.version = 1
  meta.prNumber = prNumber
  meta.prTitle = prPayload.title || meta.prTitle || `PR #${prNumber}`
  meta.prUrl = prUrl
  meta.headRef = headRef
  meta.baseRef = baseRef
  meta.updatedAt = createdAt
  meta.reports = Array.isArray(meta.reports) ? meta.reports : []

  const reportRecord = {
    surface,
    runId,
    runAttempt,
    runKey,
    runUrl,
    reportHref,
    latestHref,
    headSha,
    headRef,
    baseRef,
    workflowName,
    workflowFile: SURFACES[surface].workflowFile,
    createdAt,
  }

  meta.reports = [
    reportRecord,
    ...meta.reports.filter((report) => !(report.surface === surface && report.runKey === runKey)),
  ]

  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
  await writeFile(path.join(prRoot, 'index.html'), generatePrIndex({ meta, baseUrl }))

  const registryPath = path.join(pagesDir, 'pr', 'visual-reports.json')
  await mkdir(path.dirname(registryPath), { recursive: true })
  const registry = await readRegistry(registryPath)
  const indexHref = `${baseUrl}/pr/${prNumber}/`
  registry.updatedAt = createdAt
  registry.prs = [
    {
      prNumber,
      prTitle: meta.prTitle,
      prUrl,
      indexHref,
      headRef,
      baseRef,
      updatedAt: createdAt,
      latest: latestMapForReports(meta.reports, baseUrl, prNumber),
    },
    ...registry.prs.filter((pr) => String(pr.prNumber) !== prNumber),
  ]

  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
  await writeFile(path.join(pagesDir, 'pr', 'index.html'), generateRegistryIndex(registry, baseUrl))

  if (!options['pages-dir']) {
    run('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: pagesDir })
    run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { cwd: pagesDir })
    run('git', ['add', 'pr'], { cwd: pagesDir })
    const diff = run('git', ['diff', '--cached', '--quiet'], { cwd: pagesDir, allowFailure: true, quiet: true })
    if (diff.status !== 0) {
      run('git', ['commit', '-m', `docs: publish PR ${prNumber} ${surface} visual report`], { cwd: pagesDir })
      const push = run('git', ['push', 'origin', `HEAD:${branch}`], { cwd: pagesDir, allowFailure: true })
      if (push.status !== 0) {
        run('git', ['pull', '--rebase', 'origin', branch], { cwd: pagesDir })
        run('git', ['push', 'origin', `HEAD:${branch}`], { cwd: pagesDir })
      }
    } else {
      console.log('[visual-pr-pages] no Pages changes to publish')
    }
  }

  console.log(`[visual-pr-pages] published ${surface} report: ${latestHref}`)

  if (shouldCleanup) {
    await rm(pagesDir, { recursive: true, force: true })
  }
}

publishReport(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(`[visual-pr-pages] ${error.stack || error.message}`)
  process.exitCode = 1
})
