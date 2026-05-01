import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RUNTIME_TASK_INSERT = /\bINSERT\s+INTO\s+tasks\b/i

function productionSources(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return productionSources(fullPath)
    if (!entry.name.endsWith('.ts')) return []
    if (entry.name.endsWith('.test.ts')) return []
    if (fullPath.endsWith(path.join('src', 'lib', 'task-create.ts'))) return []
    if (fullPath.endsWith(path.join('src', 'lib', 'migrations.ts'))) return []
    if (fullPath.endsWith(path.join('src', 'lib', 'db.ts'))) return []
    return [fullPath]
  })
}

describe('Task pipeline direct task insert guard', () => {
  it('keeps runtime production task inserts centralized in src/lib/task-create.ts', () => {
    const root = process.cwd()
    const offenders = productionSources(path.join(root, 'src'))
      .filter((file) => RUNTIME_TASK_INSERT.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file))

    expect(offenders).toEqual([])
  })
})
