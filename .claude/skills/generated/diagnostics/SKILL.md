---
name: diagnostics
description: "Skill for the Diagnostics area of mission-control. 19 symbols across 2 files."
---

# Diagnostics

19 symbols | 2 files | Cohesion: 71%

## When to Use

- Working with code in `src/`
- Understanding how GET, GET work
- Modifying diagnostics-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/agents/[id]/diagnostics/route.ts` | parseHoursParam, parseSectionsParam, GET, buildSummary, buildTaskMetrics (+7) |
| `src/app/api/diagnostics/route.ts` | GET, getVersionInfo, getSecurityInfo, getDatabaseInfo, getAgentInfo (+2) |

## Entry Points

Start here when exploring this area:

- **`GET`** (Function) — `src/app/api/agents/[id]/diagnostics/route.ts:62`
- **`GET`** (Function) — `src/app/api/diagnostics/route.ts:18`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `GET` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 62 |
| `GET` | Function | `src/app/api/diagnostics/route.ts` | 18 |
| `parseHoursParam` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 9 |
| `parseSectionsParam` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 21 |
| `buildSummary` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 157 |
| `buildTaskMetrics` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 186 |
| `buildErrorAnalysis` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 213 |
| `buildActivityBreakdown` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 233 |
| `buildTokenMetrics` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 326 |
| `getVersionInfo` | Function | `src/app/api/diagnostics/route.ts` | 55 |
| `getSecurityInfo` | Function | `src/app/api/diagnostics/route.ts` | 66 |
| `getDatabaseInfo` | Function | `src/app/api/diagnostics/route.ts` | 124 |
| `getAgentInfo` | Function | `src/app/api/diagnostics/route.ts` | 160 |
| `getSessionInfo` | Function | `src/app/api/diagnostics/route.ts` | 179 |
| `getGatewayInfo` | Function | `src/app/api/diagnostics/route.ts` | 192 |
| `buildTrends` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 253 |
| `periodMetrics` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 260 |
| `pctChange` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 279 |
| `buildTrendAlerts` | Function | `src/app/api/agents/[id]/diagnostics/route.ts` | 297 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → Has` | cross_community | 5 |
| `GET → GetGeneratedFilePath` | cross_community | 5 |
| `GET → EnsureDirExists` | cross_community | 5 |
| `GET → Generate` | cross_community | 4 |
| `GET → GetWorkspaceForTenant` | cross_community | 4 |
| `GET → BadWorkspaceScopeError` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 9 calls |
| Onboarding | 2 calls |
| Backup | 1 calls |

## How to Explore

1. `gitnexus_context({name: "GET"})` — see callers and callees
2. `gitnexus_query({query: "diagnostics"})` — find related execution flows
3. Read key files listed above for implementation details
