#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function walk(dir, files = []) {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return files

  for (const entry of readdirSync(absolute)) {
    const full = join(absolute, entry)
    const rel = relative(root, full)
    if (
      rel.includes('/__tests__/') ||
      rel.includes('/fixtures/') ||
      rel.startsWith('src/test') ||
      rel.startsWith('test-results/') ||
      rel.startsWith('playwright-report/')
    ) {
      continue
    }

    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(rel, files)
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(rel)
    }
  }
  return files
}

const packageJson = JSON.parse(read('package.json'))
const requiredRuntimeDeps = {
  ajv: '8.18.0',
  'jsonpath-plus': '10.4.0',
  'safe-regex': '2.1.1',
}

for (const [name, version] of Object.entries(requiredRuntimeDeps)) {
  if (packageJson.dependencies?.[name] !== version) {
    fail(`package.json dependencies.${name} must be exact ${version}`)
  }
  if (packageJson.devDependencies?.[name]) {
    fail(`${name} must be a runtime dependency, not a devDependency`)
  }
}
if (packageJson.dependencies?.['ajv-formats'] || packageJson.devDependencies?.['ajv-formats']) {
  fail('ajv-formats must not be registered as a dependency for SPEC-004 validation')
}

const lock = read('pnpm-lock.yaml')
for (const [name, version] of Object.entries(requiredRuntimeDeps)) {
  const importerEntry = new RegExp(`${name}:\\n\\s+specifier: ${version}\\n\\s+version: ${version}`)
  if (!importerEntry.test(lock)) {
    fail(`pnpm-lock.yaml importer must pin ${name}@${version}`)
  }
}

const strictConfig = read('tsconfig.spec-strict.json')
for (const path of [
  'src/lib/task-create.ts',
  'src/lib/output-schema-validator.ts',
  'src/lib/routing-rule-evaluator.ts',
  'src/types/workflow-template.ts',
]) {
  if (!strictConfig.includes(path)) {
    fail(`tsconfig.spec-strict.json must include ${path}`)
  }
}

const productionFiles = walk('src')

for (const path of productionFiles) {
  const source = read(path)

  if (path !== 'src/lib/task-create.ts' && /\bINSERT\s+INTO\s+tasks\b/i.test(source)) {
    fail(`Direct production task insert outside src/lib/task-create.ts: ${path}`)
  }

  if (path !== 'src/lib/feature-flags.ts' && /process\.env\.FEATURE_TASK_PIPELINES/.test(source)) {
    fail(`Inline FEATURE_TASK_PIPELINES read outside src/lib/feature-flags.ts: ${path}`)
  }

  if (/\btask_templates\b/i.test(source)) {
    fail(`Forbidden task_templates reference in production source: ${path}`)
  }

  if (/project_agent_assignments\.agent_id\b/.test(source)) {
    fail(`Forbidden project_agent_assignments.agent_id assumption in production source: ${path}`)
  }

  if (path !== 'src/lib/feature-flags.ts' && /\bFEATURE_AREA_LABEL_ROUTING\b|\bready_for_owner\b|\bCrabTrap\b/.test(source)) {
    fail(`Downstream-scope drift marker found in production source: ${path}`)
  }
}

for (const path of ['src/lib/output-schema-validator.ts', 'src/lib/routing-rule-evaluator.ts']) {
  if (!existsSync(join(root, path))) continue
  const source = read(path)
  const forbidden = [
    ['eval(', /\beval\s*\(/],
    ['Function constructor', /\bnew\s+Function\b|\bFunction\s*\(/],
    ['node vm import', /from\s+['"]node:vm['"]|from\s+['"]vm['"]|require\(['"]vm['"]\)/],
    ['vm2 import', /from\s+['"]vm2['"]|require\(['"]vm2['"]\)/],
    ['with statement', /\bwith\s*\(/],
    ['dynamic require', /require\s*\(\s*[^'"]/],
    ['ajv-formats dependency', /from\s+['"]ajv-formats['"]|require\(['"]ajv-formats['"]\)/],
  ]

  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) {
      fail(`${path} contains forbidden primitive/import: ${label}`)
    }
  }
}

const validatorSource = read('src/lib/output-schema-validator.ts')
for (const [label, pattern] of [
  ['AJV strict mode', /strict\s*:\s*true/],
  ['AJV schema validation', /validateSchema\s*:\s*true/],
  ['AJV data references disabled', /\$data\s*:\s*false/],
  ['AJV format validation disabled', /validateFormats\s*:\s*false/],
  ['AJV exhaustive errors disabled', /allErrors\s*:\s*false/],
  ['AJV defaults disabled', /useDefaults\s*:\s*false/],
  ['AJV coercion disabled', /coerceTypes\s*:\s*false/],
  ['AJV additional-property mutation disabled', /removeAdditional\s*:\s*false/],
]) {
  if (!pattern.test(validatorSource)) {
    fail(`src/lib/output-schema-validator.ts must enforce ${label}`)
  }
}
for (const pattern of ['safeRegex', 'pattern_unsafe', 'inspectPattern']) {
  if (!validatorSource.includes(pattern)) {
    fail(`src/lib/output-schema-validator.ts must retain conservative pattern guard marker: ${pattern}`)
  }
}

const routingSource = read('src/lib/routing-rule-evaluator.ts')
for (const [label, pattern] of [
  ['JSONPath script execution disabled', /eval\s*:\s*false/],
  ['routing evaluation budget', /maxRuleEvalMs\s*:\s*10/],
  ['routing expression rejection code', /routing_expression_rejected/],
  ['routing budget rejection code', /routing_budget_exceeded/],
]) {
  if (!pattern.test(routingSource)) {
    fail(`src/lib/routing-rule-evaluator.ts must retain ${label}`)
  }
}

for (const path of [
  'src/lib/__tests__/output-schema-validator.ajv-safety.test.ts',
  'src/lib/__tests__/output-schema-validator.patterns.test.ts',
  'src/lib/__tests__/routing-rule-evaluator.adversarial.test.ts',
  'src/lib/__tests__/routing-rule-evaluator.budget.test.ts',
  'src/lib/__tests__/task-pipeline-downstream-scope-guard.test.ts',
]) {
  if (!existsSync(join(root, path))) {
    fail(`SPEC-004 guardrail fixture missing: ${path}`)
  }
}

if (failures.length > 0) {
  console.error('SPEC-004 guardrails failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('SPEC-004 guardrails passed')
