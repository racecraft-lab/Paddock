---
name: memory
description: "Skill for the Memory area of mission-control. 29 symbols across 9 files."
---

# Memory

29 symbols | 9 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how extractWikiLinks, extractSchema, validateSchema work
- Modifying memory-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/memory-utils.ts` | extractWikiLinks, extractSchema, validateSchema, scanMemoryFiles, walk (+8) |
| `src/lib/hermes-memory.ts` | MEMORY_DIR, countSectionEntries, readMemoryFile, getHermesMemory |
| `src/app/api/memory/route.ts` | buildFileTree, GET, POST |
| `src/lib/memory-path.ts` | normalizeRelativePath, isPathAllowed |
| `src/app/api/memory/health/route.ts` | mergeReports, GET |
| `src/app/api/memory/context/route.ts` | mergeContextPayloads, GET |
| `src/app/api/memory/process/route.ts` | POST |
| `src/app/api/memory/links/route.ts` | GET |
| `src/app/api/hermes/memory/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`extractWikiLinks`** (Function) — `src/lib/memory-utils.ts:20`
- **`extractSchema`** (Function) — `src/lib/memory-utils.ts:64`
- **`validateSchema`** (Function) — `src/lib/memory-utils.ts:94`
- **`scanMemoryFiles`** (Function) — `src/lib/memory-utils.ts:136`
- **`walk`** (Function) — `src/lib/memory-utils.ts:144`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `extractWikiLinks` | Function | `src/lib/memory-utils.ts` | 20 |
| `extractSchema` | Function | `src/lib/memory-utils.ts` | 64 |
| `validateSchema` | Function | `src/lib/memory-utils.ts` | 94 |
| `scanMemoryFiles` | Function | `src/lib/memory-utils.ts` | 136 |
| `walk` | Function | `src/lib/memory-utils.ts` | 144 |
| `buildLinkGraph` | Function | `src/lib/memory-utils.ts` | 200 |
| `runHealthDiagnostics` | Function | `src/lib/memory-utils.ts` | 283 |
| `generateMOCs` | Function | `src/lib/memory-utils.ts` | 507 |
| `generateContextPayload` | Function | `src/lib/memory-utils.ts` | 561 |
| `reflectPass` | Function | `src/lib/memory-utils.ts` | 612 |
| `reweavePass` | Function | `src/lib/memory-utils.ts` | 653 |
| `gapDetectPass` | Function | `src/lib/memory-utils.ts` | 709 |
| `consolidatePass` | Function | `src/lib/memory-utils.ts` | 829 |
| `normalizeRelativePath` | Function | `src/lib/memory-path.ts` | 88 |
| `isPathAllowed` | Function | `src/lib/memory-path.ts` | 92 |
| `GET` | Function | `src/app/api/memory/route.ts` | 84 |
| `POST` | Function | `src/app/api/memory/route.ts` | 194 |
| `POST` | Function | `src/app/api/memory/process/route.ts` | 18 |
| `GET` | Function | `src/app/api/memory/health/route.ts` | 40 |
| `GET` | Function | `src/app/api/memory/links/route.ts` | 8 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → NormalizeSecurityEventType` | cross_community | 6 |
| `GET → Run` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `GET → EnsureDirExists` | cross_community | 6 |
| `GET → Has` | cross_community | 5 |
| `GET → MemoryPathError` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 8 calls |
| Onboarding | 7 calls |
| Cluster_176 | 3 calls |
| Search | 2 calls |

## How to Explore

1. `gitnexus_context({name: "extractWikiLinks"})` — see callers and callees
2. `gitnexus_query({query: "memory"})` — find related execution flows
3. Read key files listed above for implementation details
