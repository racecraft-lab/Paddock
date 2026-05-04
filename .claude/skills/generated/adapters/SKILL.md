---
name: adapters
description: "Skill for the Adapters area of mission-control. 67 symbols across 22 files."
---

# Adapters

67 symbols | 22 files | Cohesion: 64%

## When to Use

- Working with code in `src/`
- Understanding how processWebhookRetries, requeueStaleTasks, autoRouteInboxTasks work
- Modifying adapters-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/scheduler.ts` | getSettingNumber, runBackup, runCleanup, runHeartbeatCheck, tick (+1) |
| `src/lib/adapters/openclaw.ts` | register, heartbeat, reportTask, disconnect, OpenClawAdapter (+1) |
| `src/lib/adapters/langgraph.ts` | register, heartbeat, reportTask, disconnect, LangGraphAdapter (+1) |
| `src/lib/adapters/generic.ts` | register, heartbeat, reportTask, disconnect, GenericAdapter (+1) |
| `src/lib/adapters/crewai.ts` | register, heartbeat, reportTask, disconnect, CrewAIAdapter (+1) |
| `src/lib/adapters/claude-sdk.ts` | register, heartbeat, reportTask, disconnect, ClaudeSdkAdapter (+1) |
| `src/lib/adapters/autogen.ts` | register, heartbeat, reportTask, disconnect, AutoGenAdapter (+1) |
| `src/lib/claude-sessions.ts` | clampTimestamp, parseSessionFile, scanClaudeSessions, syncClaudeSessions |
| `src/lib/task-dispatch.ts` | syncAndEscalateIfFailed, requeueStaleTasks, autoRouteInboxTasks |
| `src/lib/schedule-parser.ts` | isCronDue, matchesCronField |

## Entry Points

Start here when exploring this area:

- **`processWebhookRetries`** (Function) — `src/lib/webhooks.ts:301`
- **`requeueStaleTasks`** (Function) — `src/lib/task-dispatch.ts:1337`
- **`autoRouteInboxTasks`** (Function) — `src/lib/task-dispatch.ts:1728`
- **`syncSkillsFromDisk`** (Function) — `src/lib/skill-sync.ts:133`
- **`triggerTask`** (Function) — `src/lib/scheduler.ts:512`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `OpenClawAdapter` | Class | `src/lib/adapters/openclaw.ts` | 4 |
| `LangGraphAdapter` | Class | `src/lib/adapters/langgraph.ts` | 4 |
| `GenericAdapter` | Class | `src/lib/adapters/generic.ts` | 4 |
| `CrewAIAdapter` | Class | `src/lib/adapters/crewai.ts` | 4 |
| `ClaudeSdkAdapter` | Class | `src/lib/adapters/claude-sdk.ts` | 4 |
| `AutoGenAdapter` | Class | `src/lib/adapters/autogen.ts` | 4 |
| `processWebhookRetries` | Function | `src/lib/webhooks.ts` | 301 |
| `requeueStaleTasks` | Function | `src/lib/task-dispatch.ts` | 1337 |
| `autoRouteInboxTasks` | Function | `src/lib/task-dispatch.ts` | 1728 |
| `syncSkillsFromDisk` | Function | `src/lib/skill-sync.ts` | 133 |
| `triggerTask` | Function | `src/lib/scheduler.ts` | 512 |
| `isCronDue` | Function | `src/lib/schedule-parser.ts` | 165 |
| `spawnRecurringTasks` | Function | `src/lib/recurring-tasks.ts` | 29 |
| `syncLocalAgents` | Function | `src/lib/local-agent-sync.ts` | 224 |
| `logAuditEvent` | Function | `src/lib/db.ts` | 582 |
| `scanClaudeSessions` | Function | `src/lib/claude-sessions.ts` | 219 |
| `syncClaudeSessions` | Function | `src/lib/claude-sessions.ts` | 273 |
| `syncAgentsFromConfig` | Function | `src/lib/agent-sync.ts` | 288 |
| `DELETE` | Function | `src/app/api/backup/route.ts` | 134 |
| `POST` | Function | `src/app/api/claude/sessions/route.ts` | 90 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PATCH → Broadcast` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `POST → Broadcast` | cross_community | 6 |
| `POST → Broadcast` | cross_community | 6 |
| `POST → Broadcast` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `GET → ClampTimestamp` | cross_community | 5 |
| `GET → Generate` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 30 calls |
| Onboarding | 2 calls |
| Cluster_96 | 2 calls |
| Cluster_97 | 2 calls |
| Cluster_110 | 1 calls |
| Tokens | 1 calls |
| Cleanup | 1 calls |
| Scheduler | 1 calls |

## How to Explore

1. `gitnexus_context({name: "processWebhookRetries"})` — see callers and callees
2. `gitnexus_query({query: "adapters"})` — find related execution flows
3. Read key files listed above for implementation details
