---
name: hermes
description: "Skill for the Hermes area of mission-control. 18 symbols across 5 files."
---

# Hermes

18 symbols | 5 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how getHermesTasks, isHermesInstalled, isHermesGatewayRunning work
- Modifying hermes-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/hermes-sessions.ts` | getHermesDbPath, getHermesPidPath, hasHermesCliBinary, isHermesInstalled, parseGatewayPid (+3) |
| `src/lib/hermes-tasks.ts` | getHermesCronDir, peekLatestOutput, scanCronJobs, getHermesTasks |
| `src/app/api/hermes/route.ts` | GET, stripAnsiAndControl, extractDeviceAuth, POST |
| `src/lib/agent-runtimes.ts` | detectHermes |
| `src/app/api/hermes/tasks/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`getHermesTasks`** (Function) — `src/lib/hermes-tasks.ts:109`
- **`isHermesInstalled`** (Function) — `src/lib/hermes-sessions.ts:102`
- **`isHermesGatewayRunning`** (Function) — `src/lib/hermes-sessions.ts:132`
- **`scanHermesSessions`** (Function) — `src/lib/hermes-sessions.ts:154`
- **`GET`** (Function) — `src/app/api/hermes/route.ts:21`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getHermesTasks` | Function | `src/lib/hermes-tasks.ts` | 109 |
| `isHermesInstalled` | Function | `src/lib/hermes-sessions.ts` | 102 |
| `isHermesGatewayRunning` | Function | `src/lib/hermes-sessions.ts` | 132 |
| `scanHermesSessions` | Function | `src/lib/hermes-sessions.ts` | 154 |
| `GET` | Function | `src/app/api/hermes/route.ts` | 21 |
| `POST` | Function | `src/app/api/hermes/route.ts` | 66 |
| `GET` | Function | `src/app/api/hermes/tasks/route.ts` | 8 |
| `getHermesCronDir` | Function | `src/lib/hermes-tasks.ts` | 30 |
| `peekLatestOutput` | Function | `src/lib/hermes-tasks.ts` | 34 |
| `scanCronJobs` | Function | `src/lib/hermes-tasks.ts` | 71 |
| `getHermesDbPath` | Function | `src/lib/hermes-sessions.ts` | 45 |
| `getHermesPidPath` | Function | `src/lib/hermes-sessions.ts` | 49 |
| `hasHermesCliBinary` | Function | `src/lib/hermes-sessions.ts` | 55 |
| `parseGatewayPid` | Function | `src/lib/hermes-sessions.ts` | 107 |
| `epochSecondsToISO` | Function | `src/lib/hermes-sessions.ts` | 148 |
| `detectHermes` | Function | `src/lib/agent-runtimes.ts` | 295 |
| `stripAnsiAndControl` | Function | `src/app/api/hermes/route.ts` | 49 |
| `extractDeviceAuth` | Function | `src/app/api/hermes/route.ts` | 56 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 3 calls |
| Memory | 1 calls |
| System-monitor | 1 calls |
| Scripts | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getHermesTasks"})` — see callers and callees
2. `gitnexus_query({query: "hermes"})` — find related execution flows
3. Read key files listed above for implementation details
