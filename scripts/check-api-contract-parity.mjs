#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

function toPosix(input) {
  return input.split(path.sep).join('/')
}

function normalizeSegment(segment) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) return `{${segment.slice(5, -2)}}`
  if (segment.startsWith('[...') && segment.endsWith(']')) return `{${segment.slice(4, -1)}}`
  if (segment.startsWith('[') && segment.endsWith(']')) return `{${segment.slice(1, -1)}}`
  return segment
}

function routeFileToApiPath(projectRoot, fullPath) {
  const rel = toPosix(path.relative(projectRoot, fullPath))
  const withoutRoute = rel.replace(/\/route\.tsx?$/, '')
  const trimmed = withoutRoute.startsWith('src/app/api') ? withoutRoute.slice('src/app/api'.length) : withoutRoute
  const parts = trimmed.split('/').filter(Boolean).map(normalizeSegment)
  return `/api${parts.length ? `/${parts.join('/')}` : ''}`
}

function extractHttpMethods(source) {
  const methods = []
  for (const method of HTTP_METHODS) {
    const constExport = new RegExp(`export\\s+const\\s+${method}\\s*=`, 'm')
    const fnExport = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`, 'm')
    if (constExport.test(source) || fnExport.test(source)) methods.push(method)
  }
  return methods
}

function walkRouteFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkRouteFiles(full, out)
    else if (entry.isFile() && /route\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function normalizeOperation(operation) {
  const [method = '', ...pathParts] = String(operation || '').trim().split(' ')
  const normalizedMethod = method.toUpperCase()
  const normalizedPath = pathParts.join(' ').trim()
  return `${normalizedMethod} ${normalizedPath}`
}

function parseIgnoreArg(ignoreArg) {
  if (!ignoreArg) return []
  return ignoreArg
    .split(',')
    .map((x) => normalizeOperation(x))
    .filter(Boolean)
}

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
      continue
    }
    flags[key] = next
    i += 1
  }
  return flags
}

function run() {
  const flags = parseArgs(process.argv.slice(2))
  const projectRoot = path.resolve(String(flags.root || process.cwd()))
  const openapiPath = path.resolve(projectRoot, String(flags.openapi || 'openapi.json'))
  const ignoreFile = flags['ignore-file'] ? path.resolve(projectRoot, String(flags['ignore-file'])) : null
  const ignoreInline = parseIgnoreArg(flags.ignore)
  let ignore = new Set(ignoreInline)

  if (ignoreFile && fs.existsSync(ignoreFile)) {
    const lines = fs
      .readFileSync(ignoreFile, 'utf8')
      .split('\n')
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith('#'))
      .map((x) => normalizeOperation(x))
    ignore = new Set([...ignore, ...lines])
  }

  const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'))
  const openapiOps = new Set()
  for (const [rawPath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of Object.keys(pathItem || {})) {
      const upper = method.toUpperCase()
      if (HTTP_METHODS.includes(upper)) {
        openapiOps.add(`${upper} ${rawPath}`)
      }
    }
  }

  const routeFiles = walkRouteFiles(path.join(projectRoot, 'src/app/api'))
  const routeOps = new Set()
  for (const file of routeFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const methods = extractHttpMethods(source)
    const apiPath = routeFileToApiPath(projectRoot, file)
    for (const method of methods) routeOps.add(`${method} ${apiPath}`)
  }

  const missingInOpenApi = [...routeOps].filter((op) => !openapiOps.has(op) && !ignore.has(op)).sort()
  const missingInRoutes = [...openapiOps].filter((op) => !routeOps.has(op) && !ignore.has(op)).sort()

  const summary = {
    ok: missingInOpenApi.length === 0 && missingInRoutes.length === 0,
    totals: {
      routeOperations: routeOps.size,
      openapiOperations: openapiOps.size,
      ignoredOperations: ignore.size,
    },
    missingInOpenApi,
    missingInRoutes,
  }

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log('API contract parity check')
    console.log(`- route operations:   ${summary.totals.routeOperations}`)
    console.log(`- openapi operations: ${summary.totals.openapiOperations}`)
    console.log(`- ignored entries:    ${summary.totals.ignoredOperations}`)
    if (missingInOpenApi.length) {
      console.log('\nMissing in OpenAPI:')
      for (const op of missingInOpenApi) console.log(`  - ${op}`)
    }
    if (missingInRoutes.length) {
      console.log('\nMissing in routes:')
      for (const op of missingInRoutes) console.log(`  - ${op}`)
    }
    if (!missingInOpenApi.length && !missingInRoutes.length) {
      console.log('\n✅ Contract parity OK')
    }
  }

  process.exit(summary.ok ? 0 : 1)
}

run()
