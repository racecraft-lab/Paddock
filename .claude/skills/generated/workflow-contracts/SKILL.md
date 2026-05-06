---
name: workflow-contracts
description: "Skill for the Workflow-contracts area of mission-control. 48 symbols across 11 files."
---

# Workflow-contracts

48 symbols | 11 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how validateWorkflowContract, createWorkflowContractAjv, workflowContractError work
- Modifying workflow-contracts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/workflow-contracts/workflow-contract-cli.ts` | parseWorkflowContractCliArgs, parseFlags, main, tsModule, openWorkflowContractDatabase (+3) |
| `src/lib/workflow-contracts/validator.ts` | validateWorkflowContract, validateTemplate, validateVariables, validateTracker, validateStringArray (+2) |
| `src/lib/workflow-contracts/hash.ts` | sha256, stableStringify, computeContractHash, computeTemplateHashes, stabilize (+2) |
| `src/lib/workflow-contracts/exporter.ts` | exportWorkflowContractMarkdown, buildExportContract, readLatestSnapshot, overlayRuntimeFields, runtimeToTemplate (+1) |
| `src/lib/workflow-contracts/recovery.ts` | recoverLastKnownGood, tx, runtimeToTemplate, parseJson |
| `src/lib/workflow-contracts/yaml-loader.ts` | loadWorkflowContractFromFile, loadWorkflowContractFromString, rejectUnsafeYamlSyntax, normalizePromptLineEndings |
| `src/lib/workflow-contracts/importer.ts` | upsertTemplate, importWorkflowContract, selectRuntimeTemplates |
| `src/lib/workflow-contracts/diagnostics.ts` | createWorkflowContractRun, countDiff, recordWorkflowContractErrors |
| `src/lib/workflow-contracts/diff.ts` | diffWorkflowTemplates, templateMatchesRuntime, parseJson |
| `src/lib/workflow-contracts/errors.ts` | workflowContractError, redactDetails |

## Entry Points

Start here when exploring this area:

- **`validateWorkflowContract`** (Function) — `src/lib/workflow-contracts/validator.ts:17`
- **`createWorkflowContractAjv`** (Function) — `src/lib/workflow-contracts/schema.ts:2`
- **`workflowContractError`** (Function) — `src/lib/workflow-contracts/errors.ts:23`
- **`sha256`** (Function) — `src/lib/workflow-contracts/hash.ts:13`
- **`stableStringify`** (Function) — `src/lib/workflow-contracts/hash.ts:17`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `validateWorkflowContract` | Function | `src/lib/workflow-contracts/validator.ts` | 17 |
| `createWorkflowContractAjv` | Function | `src/lib/workflow-contracts/schema.ts` | 2 |
| `workflowContractError` | Function | `src/lib/workflow-contracts/errors.ts` | 23 |
| `sha256` | Function | `src/lib/workflow-contracts/hash.ts` | 13 |
| `stableStringify` | Function | `src/lib/workflow-contracts/hash.ts` | 17 |
| `computeContractHash` | Function | `src/lib/workflow-contracts/hash.ts` | 21 |
| `computeTemplateHashes` | Function | `src/lib/workflow-contracts/hash.ts` | 25 |
| `exportWorkflowContractMarkdown` | Function | `src/lib/workflow-contracts/exporter.ts` | 6 |
| `redactDetails` | Function | `src/lib/workflow-contracts/errors.ts` | 9 |
| `recoverLastKnownGood` | Function | `src/lib/workflow-contracts/recovery.ts` | 5 |
| `tx` | Function | `src/lib/workflow-contracts/recovery.ts` | 43 |
| `upsertTemplate` | Function | `src/lib/workflow-contracts/importer.ts` | 91 |
| `createWorkflowContractRun` | Function | `src/lib/workflow-contracts/diagnostics.ts` | 18 |
| `importWorkflowContract` | Function | `src/lib/workflow-contracts/importer.ts` | 7 |
| `selectRuntimeTemplates` | Function | `src/lib/workflow-contracts/importer.ts` | 87 |
| `diffWorkflowTemplates` | Function | `src/lib/workflow-contracts/diff.ts` | 3 |
| `recordWorkflowContractErrors` | Function | `src/lib/workflow-contracts/diagnostics.ts` | 43 |
| `parseWorkflowContractCliArgs` | Function | `scripts/workflow-contracts/workflow-contract-cli.ts` | 10 |
| `loadWorkflowContractFromFile` | Function | `src/lib/workflow-contracts/yaml-loader.ts` | 4 |
| `loadWorkflowContractFromString` | Function | `src/lib/workflow-contracts/yaml-loader.ts` | 8 |

## How to Explore

1. `gitnexus_context({name: "validateWorkflowContract"})` — see callers and callees
2. `gitnexus_query({query: "workflow-contracts"})` — find related execution flows
3. Read key files listed above for implementation details
