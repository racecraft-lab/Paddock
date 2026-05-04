---
name: panels
description: "Skill for the Panels area of mission-control. 392 symbols across 56 files."
---

# Panels

392 symbols | 56 files | Cohesion: 90%

## When to Use

- Working with code in `src/`
- Understanding how appendScopeToPath, handleDrop, OrchestrationBar work
- Modifying panels-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/panels/agent-detail-tabs.tsx` | handleSendMessage, handleSave, TasksTab, fetchTasks, ActivityTab (+30) |
| `src/components/panels/office-panel.tsx` | getInitials, hashColor, hashNumber, formatLastSeen, easeInOut (+22) |
| `src/components/panels/channels-panel.tsx` | relativeTime, formatDuration, truncatePubkey, yesNo, WhatsAppCard (+18) |
| `src/components/panels/task-board-panel.tsx` | handleClick, handleDrop, handleAddComment, handleBroadcast, handleSubmitReview (+16) |
| `src/components/panels/cron-management-panel.tsx` | getAgentColorClass, startOfDay, addDays, isSameDay, getWeekStart (+15) |
| `src/components/panels/memory-browser-panel.tsx` | mergeDirectoryChildren, formatFileSize, countFiles, totalSize, fileIcon (+13) |
| `src/components/panels/agent-squad-panel-phase3.tsx` | AgentSquadPanelPhase3, syncFromConfig, updateAgentStatus, wakeAgent, toggleAgentHidden (+10) |
| `src/components/panels/nodes-panel.tsx` | stringArray, numberOrZero, normalizeNode, normalizePairedDevice, normalizePendingDevice (+10) |
| `src/components/panels/gateway-config-panel.tsx` | humanize, defaultValueFor, deepSet, matchesSearch, SectionCard (+8) |
| `src/components/panels/orchestration-bar.tsx` | parseJsonField, OrchestrationBar, sendCommand, executeTemplate, saveTemplate (+6) |

## Entry Points

Start here when exploring this area:

- **`appendScopeToPath`** (Function) — `src/types/product-line.ts:120`
- **`handleDrop`** (Function) — `src/components/panels/task-board-panel.tsx:611`
- **`OrchestrationBar`** (Function) — `src/components/panels/orchestration-bar.tsx:78`
- **`sendCommand`** (Function) — `src/components/panels/orchestration-bar.tsx:121`
- **`executeTemplate`** (Function) — `src/components/panels/orchestration-bar.tsx:147`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `appendScopeToPath` | Function | `src/types/product-line.ts` | 120 |
| `handleDrop` | Function | `src/components/panels/task-board-panel.tsx` | 611 |
| `OrchestrationBar` | Function | `src/components/panels/orchestration-bar.tsx` | 78 |
| `sendCommand` | Function | `src/components/panels/orchestration-bar.tsx` | 121 |
| `executeTemplate` | Function | `src/components/panels/orchestration-bar.tsx` | 147 |
| `saveTemplate` | Function | `src/components/panels/orchestration-bar.tsx` | 181 |
| `closeForm` | Function | `src/components/panels/orchestration-bar.tsx` | 262 |
| `deleteTemplate` | Function | `src/components/panels/orchestration-bar.tsx` | 271 |
| `addTag` | Function | `src/components/panels/orchestration-bar.tsx` | 278 |
| `NotificationsPanel` | Function | `src/components/panels/notifications-panel.tsx` | 23 |
| `markAllRead` | Function | `src/components/panels/notifications-panel.tsx` | 62 |
| `markRead` | Function | `src/components/panels/notifications-panel.tsx` | 77 |
| `GitHubSyncPanel` | Function | `src/components/panels/github-sync-panel.tsx` | 50 |
| `AgentSquadPanel` | Function | `src/components/panels/agent-squad-panel.tsx` | 47 |
| `updateAgentStatus` | Function | `src/components/panels/agent-squad-panel.tsx` | 89 |
| `AgentSquadPanelPhase3` | Function | `src/components/panels/agent-squad-panel-phase3.tsx` | 89 |
| `syncFromConfig` | Function | `src/components/panels/agent-squad-panel-phase3.tsx` | 103 |
| `updateAgentStatus` | Function | `src/components/panels/agent-squad-panel-phase3.tsx` | 166 |
| `wakeAgent` | Function | `src/components/panels/agent-squad-panel-phase3.tsx` | 200 |
| `toggleAgentHidden` | Function | `src/components/panels/agent-squad-panel-phase3.tsx` | 228 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Home → Sha256Hex` | cross_community | 5 |
| `Home → ToBase64Url` | cross_community | 5 |
| `Home → AddAgent` | cross_community | 5 |
| `Home → ImportPrivateKey` | cross_community | 4 |
| `Home → FromBase64Url` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Onboarding | 13 calls |
| Cluster_206 | 2 calls |
| Cluster_194 | 2 calls |
| Cluster_209 | 1 calls |
| [id] | 1 calls |
| Layout | 1 calls |
| Cluster_210 | 1 calls |
| Cluster_167 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "appendScopeToPath"})` — see callers and callees
2. `gitnexus_query({query: "panels"})` — find related execution flows
3. Read key files listed above for implementation details
