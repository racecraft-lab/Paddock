---
name: scripts
description: "Skill for the Scripts area of mission-control. 116 symbols across 19 files."
---

# Scripts

116 symbols | 19 files | Cohesion: 87%

## When to Use

- Working with code in `scripts/`
- Understanding how isFeatureFlagKey, assertFeatureFlagKey, disposePtySession work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/mc-tui.cjs` | getTermSize, truncate, pad, statusColor, timeSince (+26) |
| `scripts/mc-cli.cjs` | parseArgs, usage, mapStatusToExit, required, bodyFromFlags (+11) |
| `scripts/verify-argos-metadata.mjs` | pathExists, collectMetadataFiles, validatePlaywrightMetadata, validateStorybookMetadata, readMetadata (+9) |
| `scripts/verify-spec-evidence-screenshots.mjs` | parseArgs, pathExists, collectFiles, sha256, normalizeManifestPath (+5) |
| `scripts/check-api-contract-parity.mjs` | toPosix, routeFileToApiPath, extractHttpMethods, walkRouteFiles, normalizeOperation (+3) |
| `scripts/seed-e2e-ready-for-owner.cjs` | tableExists, columnsFor, sqlPlaceholders, insertRow, updateRow (+2) |
| `scripts/mc-mcp-server.cjs` | makeResponse, handleMessage, send, main, loadConfig (+1) |
| `src/lib/pty-manager.ts` | write, dispose, disposePtySession, disposeAllPtySessions |
| `scripts/check-guardrails.mjs` | read, walk, runTaskPipelineGuardrails, fail |
| `tests/mcp-server.spec.ts` | mcpCall, mcpRequest, mcpTool |

## Entry Points

Start here when exploring this area:

- **`isFeatureFlagKey`** (Function) — `src/lib/feature-flags.ts:357`
- **`assertFeatureFlagKey`** (Function) — `src/lib/feature-flag-service.ts:352`
- **`disposePtySession`** (Function) — `src/lib/pty-manager.ts:278`
- **`disposeAllPtySessions`** (Function) — `src/lib/pty-manager.ts:283`
- **`TerminalView`** (Function) — `src/components/terminal/terminal-view.tsx:15`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isFeatureFlagKey` | Function | `src/lib/feature-flags.ts` | 357 |
| `assertFeatureFlagKey` | Function | `src/lib/feature-flag-service.ts` | 352 |
| `disposePtySession` | Function | `src/lib/pty-manager.ts` | 278 |
| `disposeAllPtySessions` | Function | `src/lib/pty-manager.ts` | 283 |
| `TerminalView` | Function | `src/components/terminal/terminal-view.tsx` | 15 |
| `mcpCall` | Function | `tests/mcp-server.spec.ts` | 10 |
| `mcpRequest` | Function | `tests/mcp-server.spec.ts` | 48 |
| `mcpTool` | Function | `tests/mcp-server.spec.ts` | 59 |
| `getTermSize` | Function | `scripts/mc-tui.cjs` | 102 |
| `truncate` | Function | `scripts/mc-tui.cjs` | 106 |
| `pad` | Function | `scripts/mc-tui.cjs` | 111 |
| `statusColor` | Function | `scripts/mc-tui.cjs` | 116 |
| `timeSince` | Function | `scripts/mc-tui.cjs` | 124 |
| `formatNumber` | Function | `scripts/mc-tui.cjs` | 134 |
| `stripAnsi` | Function | `scripts/mc-tui.cjs` | 141 |
| `renderDashboard` | Function | `scripts/mc-tui.cjs` | 261 |
| `renderAgentsList` | Function | `scripts/mc-tui.cjs` | 333 |
| `renderTasksList` | Function | `scripts/mc-tui.cjs` | 369 |
| `priorityColor` | Function | `scripts/mc-tui.cjs` | 425 |
| `activityIcon` | Function | `scripts/mc-tui.cjs` | 435 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → Write` | cross_community | 5 |
| `PATCH → Call` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Onboarding | 5 calls |

## How to Explore

1. `gitnexus_context({name: "isFeatureFlagKey"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
