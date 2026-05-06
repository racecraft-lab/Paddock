---
name: dashboard
description: "Skill for the Dashboard area of mission-control. 92 symbols across 21 files."
---

# Dashboard

92 symbols | 21 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how getPluginPanel, LocalAgentsDocPanel, run work
- Modifying dashboard-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/dashboard/widget-primitives.tsx` | getProviderHealth, getLocalOsStatus, getMcHealth, MetricCard, formatTokensShort (+14) |
| `src/components/dashboard/widget-grid.tsx` | validLayout, handleDragStart, handleDragEnter, handleDrop, nextLayout (+6) |
| `src/components/dashboard/agent-network.tsx` | CrownIcon, BotIcon, ClockIcon, GroupIcon, FileIcon (+5) |
| `src/components/dashboard/stats-grid.tsx` | MonitorIcon, PulseCircleIcon, ChatIcon, UptimeIcon, WarningTriangleIcon (+3) |
| `src/components/dashboard/dashboard.tsx` | Dashboard, dispositionLabel, dispositionColor, shortDate, Last7dTriageTotalsWidget (+2) |
| `src/components/dashboard/sessions-list.tsx` | SessionCard, getSessionTypeIcon, getModelColor, getRoleBadge, getCurrentTask (+1) |
| `src/lib/navigation.ts` | panelHref, safePrefetch, useNavigateToPanel, usePrefetchPanel |
| `src/lib/utils.ts` | formatUptime, formatAge, parseTokenUsage, generateNodePosition |
| `src/app/[[...panel]]/page.tsx` | renderPluginPanel, ContentRouter, LocalModeUnavailable |
| `src/lib/dashboard-widgets.ts` | getWidgetById, getDefaultLayout, getAvailableWidgets |

## Entry Points

Start here when exploring this area:

- **`getPluginPanel`** (Function) — `src/lib/plugins.ts:102`
- **`LocalAgentsDocPanel`** (Function) — `src/components/panels/local-agents-doc-panel.tsx:13`
- **`run`** (Function) — `src/components/panels/local-agents-doc-panel.tsx:23`
- **`getProviderHealth`** (Function) — `src/components/dashboard/widget-primitives.tsx:246`
- **`getLocalOsStatus`** (Function) — `src/components/dashboard/widget-primitives.tsx:252`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getPluginPanel` | Function | `src/lib/plugins.ts` | 102 |
| `LocalAgentsDocPanel` | Function | `src/components/panels/local-agents-doc-panel.tsx` | 13 |
| `run` | Function | `src/components/panels/local-agents-doc-panel.tsx` | 23 |
| `getProviderHealth` | Function | `src/components/dashboard/widget-primitives.tsx` | 246 |
| `getLocalOsStatus` | Function | `src/components/dashboard/widget-primitives.tsx` | 252 |
| `getMcHealth` | Function | `src/components/dashboard/widget-primitives.tsx` | 260 |
| `EmptyStateLaunchpad` | Function | `src/components/dashboard/empty-state-launchpad.tsx` | 21 |
| `Dashboard` | Function | `src/components/dashboard/dashboard.tsx` | 232 |
| `MetricCard` | Function | `src/components/dashboard/widget-primitives.tsx` | 90 |
| `formatTokensShort` | Function | `src/components/dashboard/widget-primitives.tsx` | 232 |
| `AgentIcon` | Function | `src/components/dashboard/widget-primitives.tsx` | 276 |
| `GatewayIcon` | Function | `src/components/dashboard/widget-primitives.tsx` | 285 |
| `ActivityIconMini` | Function | `src/components/dashboard/widget-primitives.tsx` | 294 |
| `TaskIcon` | Function | `src/components/dashboard/widget-primitives.tsx` | 302 |
| `TokenIcon` | Function | `src/components/dashboard/widget-primitives.tsx` | 358 |
| `CostIcon` | Function | `src/components/dashboard/widget-primitives.tsx` | 367 |
| `MetricCardsWidget` | Function | `src/components/dashboard/widgets/metric-cards-widget.tsx` | 15 |
| `BriefingBarWidget` | Function | `src/components/dashboard/widgets/briefing-bar-widget.tsx` | 4 |
| `panelHref` | Function | `src/lib/navigation.ts` | 7 |
| `useNavigateToPanel` | Function | `src/lib/navigation.ts` | 28 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ContentRouter → PanelHref` | cross_community | 4 |
| `ContentRouter → SafePrefetch` | cross_community | 4 |
| `ContentRouter → StartNavigationTiming` | cross_community | 4 |
| `ContentRouter → Cn` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Panels | 40 calls |
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getPluginPanel"})` — see callers and callees
2. `gitnexus_query({query: "dashboard"})` — find related execution flows
3. Read key files listed above for implementation details
