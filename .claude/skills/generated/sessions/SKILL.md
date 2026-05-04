---
name: sessions
description: "Skill for the Sessions area of mission-control. 17 symbols across 4 files."
---

# Sessions

17 symbols | 4 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how scanCodexSessions, GET, parseGatewayJsonOutput work
- Modifying sessions-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/sessions/route.ts` | GET, mapGatewaySessions, getLocalClaudeSessions, getLocalCodexSessions, getLocalHermesSessions (+7) |
| `src/lib/codex-sessions.ts` | listRecentCodexSessionFiles, scanCodexSessions |
| `src/lib/openclaw-gateway.ts` | parseGatewayJsonOutput, callOpenClawGateway |
| `src/app/api/sessions/[id]/control/route.ts` | POST |

## Entry Points

Start here when exploring this area:

- **`scanCodexSessions`** (Function) — `src/lib/codex-sessions.ts:210`
- **`GET`** (Function) — `src/app/api/sessions/route.ts:14`
- **`parseGatewayJsonOutput`** (Function) — `src/lib/openclaw-gateway.ts:39`
- **`callOpenClawGateway`** (Function) — `src/lib/openclaw-gateway.ts:304`
- **`POST`** (Function) — `src/app/api/sessions/route.ts:47`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `scanCodexSessions` | Function | `src/lib/codex-sessions.ts` | 210 |
| `GET` | Function | `src/app/api/sessions/route.ts` | 14 |
| `parseGatewayJsonOutput` | Function | `src/lib/openclaw-gateway.ts` | 39 |
| `callOpenClawGateway` | Function | `src/lib/openclaw-gateway.ts` | 304 |
| `POST` | Function | `src/app/api/sessions/route.ts` | 47 |
| `DELETE` | Function | `src/app/api/sessions/route.ts` | 131 |
| `POST` | Function | `src/app/api/sessions/[id]/control/route.ts` | 10 |
| `listRecentCodexSessionFiles` | Function | `src/lib/codex-sessions.ts` | 48 |
| `mapGatewaySessions` | Function | `src/app/api/sessions/route.ts` | 164 |
| `getLocalClaudeSessions` | Function | `src/app/api/sessions/route.ts` | 200 |
| `getLocalCodexSessions` | Function | `src/app/api/sessions/route.ts` | 242 |
| `getLocalHermesSessions` | Function | `src/app/api/sessions/route.ts` | 280 |
| `getLocalOpenCodeSessions` | Function | `src/app/api/sessions/route.ts` | 318 |
| `mergeLocalSessions` | Function | `src/app/api/sessions/route.ts` | 353 |
| `dedupeAndSortSessions` | Function | `src/app/api/sessions/route.ts` | 363 |
| `formatTokens` | Function | `src/app/api/sessions/route.ts` | 382 |
| `formatAge` | Function | `src/app/api/sessions/route.ts` | 388 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → NormalizeSecurityEventType` | cross_community | 6 |
| `GET → Run` | cross_community | 6 |
| `GET → Has` | cross_community | 5 |
| `GET → ClampTimestamp` | cross_community | 5 |
| `GET → Generate` | cross_community | 5 |
| `GET → EnsureDirExists` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 5 calls |
| Cluster_152 | 3 calls |
| Backup | 1 calls |
| Cluster_216 | 1 calls |
| Status | 1 calls |
| Adapters | 1 calls |
| Hermes | 1 calls |
| Cluster_117 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "scanCodexSessions"})` — see callers and callees
2. `gitnexus_query({query: "sessions"})` — find related execution flows
3. Read key files listed above for implementation details
