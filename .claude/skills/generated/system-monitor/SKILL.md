---
name: system-monitor
description: "Skill for the System-monitor area of mission-control. 23 symbols across 4 files."
---

# System-monitor

23 symbols | 4 files | Cohesion: 67%

## When to Use

- Working with code in `src/`
- Understanding how runCommand, runClawdbot, GET work
- Modifying system-monitor-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/system-monitor/route.ts` | GET, getCpuSnapshot, cpuTotals, getMemorySnapshot, getDiskSnapshot (+8) |
| `src/lib/command.ts` | CommandValidationError, getCommandBasename, assertSafeCommandInvocation, runCommand, runClawdbot |
| `src/app/api/status/route.ts` | getMemorySnapshot, getGatewayStatus, performHealthCheck |
| `src/app/api/local/terminal/route.ts` | isAllowedDirectory, POST |

## Entry Points

Start here when exploring this area:

- **`runCommand`** (Function) — `src/lib/command.ts:53`
- **`runClawdbot`** (Function) — `src/lib/command.ts:133`
- **`GET`** (Function) — `src/app/api/system-monitor/route.ts:10`
- **`POST`** (Function) — `src/app/api/local/terminal/route.ts:25`
- **`CommandValidationError`** (Class) — `src/lib/command.ts:20`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CommandValidationError` | Class | `src/lib/command.ts` | 20 |
| `runCommand` | Function | `src/lib/command.ts` | 53 |
| `runClawdbot` | Function | `src/lib/command.ts` | 133 |
| `GET` | Function | `src/app/api/system-monitor/route.ts` | 10 |
| `POST` | Function | `src/app/api/local/terminal/route.ts` | 25 |
| `getCommandBasename` | Function | `src/lib/command.ts` | 29 |
| `assertSafeCommandInvocation` | Function | `src/lib/command.ts` | 35 |
| `getCpuSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 46 |
| `cpuTotals` | Function | `src/app/api/system-monitor/route.ts` | 63 |
| `getMemorySnapshot` | Function | `src/app/api/system-monitor/route.ts` | 76 |
| `getDiskSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 145 |
| `getGpuSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 198 |
| `getNetworkSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 336 |
| `getProcessSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 414 |
| `parsePsOutput` | Function | `src/app/api/system-monitor/route.ts` | 423 |
| `getMemorySnapshot` | Function | `src/app/api/status/route.ts` | 96 |
| `getGatewayStatus` | Function | `src/app/api/status/route.ts` | 391 |
| `performHealthCheck` | Function | `src/app/api/status/route.ts` | 477 |
| `isAllowedDirectory` | Function | `src/app/api/local/terminal/route.ts` | 6 |
| `getLinuxGpuSnapshot` | Function | `src/app/api/system-monitor/route.ts` | 260 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → Has` | cross_community | 5 |
| `GET → GetGeneratedFilePath` | cross_community | 5 |
| `GET → EnsureDirExists` | cross_community | 5 |
| `GET → Has` | cross_community | 5 |
| `GET → Generate` | cross_community | 5 |
| `GET → Write` | cross_community | 5 |
| `GET → Generate` | cross_community | 4 |
| `GET → GetWorkspaceForTenant` | cross_community | 4 |
| `GET → BadWorkspaceScopeError` | cross_community | 4 |
| `GET → EnsureDirExists` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 6 calls |
| Onboarding | 1 calls |
| Scripts | 1 calls |
| Status | 1 calls |
| Backup | 1 calls |

## How to Explore

1. `gitnexus_context({name: "runCommand"})` — see callers and callees
2. `gitnexus_query({query: "system-monitor"})` — find related execution flows
3. Read key files listed above for implementation details
