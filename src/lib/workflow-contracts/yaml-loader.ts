import { readFileSync } from 'node:fs'
import { parseAllDocuments } from 'yaml'
import type { WorkflowContract } from './types.ts'

export function loadWorkflowContractFromFile(path: string): WorkflowContract {
  return loadWorkflowContractFromString(readFileSync(path, 'utf8'), path)
}

export function loadWorkflowContractFromString(source: string, path = '<inline>'): WorkflowContract {
  rejectUnsafeYamlSyntax(source, path)
  const docs = parseAllDocuments(source, {
    version: '1.2',
    uniqueKeys: true,
    merge: false,
    keepSourceTokens: true,
  })
  if (docs.length !== 1) {
    throw new Error(`YAML contract ${path} must contain exactly one document`)
  }
  const doc = docs[0]
  if (!doc) throw new Error(`YAML contract ${path} is empty`)
  if (doc.errors.length > 0) {
    const firstError = doc.errors[0]
    throw new Error(`YAML contract ${path} failed to parse: ${firstError ? firstError.message : 'unknown error'}`)
  }
  const value = doc.toJS({ maxAliasCount: 0 }) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`YAML contract ${path} must have a mapping root`)
  }
  const normalized = normalizePromptLineEndings(value as WorkflowContract)
  return normalized
}

function rejectUnsafeYamlSyntax(source: string, path: string): void {
  const structural = source
    .split('\n')
    .filter(line => !/^\s{6,}\S/.test(line))
    .join('\n')
  if (/^---[\s\S]*\n---/m.test(source)) throw new Error(`YAML contract ${path} must not use multi-document streams`)
  if (/(^|\s)![A-Za-z]/.test(structural)) throw new Error(`YAML contract ${path} must not use custom tags`)
  if (/(^|\s)&[A-Za-z0-9_-]+/.test(structural) || /(^|\s)\*[A-Za-z0-9_-]+/.test(structural)) {
    throw new Error(`YAML contract ${path} must not use anchors or aliases`)
  }
  if (/^\s*<<:/m.test(structural)) throw new Error(`YAML contract ${path} must not use merge keys`)
  for (const line of source.split('\n')) {
    if (/^\s*task_prompt\s*:/.test(line) && !/^\s*task_prompt\s*:\s*\|[-+]?\s*$/.test(line)) {
      throw new Error(`YAML contract ${path} prompt bodies must use literal block scalars`)
    }
  }
}

function normalizePromptLineEndings(contract: WorkflowContract): WorkflowContract {
  return {
    ...contract,
    templates: Array.isArray(contract.templates)
      ? (contract.templates as unknown[]).map(template => {
        if (!template || typeof template !== 'object' || Array.isArray(template)) return template
        const record = template as Record<string, unknown>
        return {
          ...record,
          task_prompt: typeof record['task_prompt'] === 'string'
            ? record['task_prompt'].replace(/\r\n?/g, '\n')
            : record['task_prompt'],
        }
      }) as WorkflowContract['templates']
      : contract.templates,
  }
}
