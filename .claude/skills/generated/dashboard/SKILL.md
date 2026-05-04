---
name: dashboard
description: "Skill for the Dashboard area of mission-control. 33 symbols across 9 files."
---

# Dashboard

33 symbols | 9 files | Cohesion: 97%

## When to Use

- Working with code in `src/`
- Understanding how getDefaultLayout, getWidgetById, getAvailableWidgets work
- Modifying dashboard-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/dashboard/widget-grid.tsx` | WidgetGrid, handleDragStart, handleDragEnter, handleDrop, addWidget (+4) |
| `src/components/dashboard/sessions-list.tsx` | SessionCard, getSessionTypeIcon, getModelColor, getRoleBadge, getCurrentTask |
| `src/components/dashboard/agent-network.tsx` | AgentNode, getStatusClasses, getTypeIcon, getRoleBadge, AgentNetwork |
| `src/lib/utils.ts` | formatAge, parseTokenUsage, formatUptime, generateNodePosition |
| `src/components/dashboard/widget-primitives.tsx` | getProviderHealth, getLocalOsStatus, getMcHealth, formatBytes |
| `src/lib/dashboard-widgets.ts` | getDefaultLayout, getWidgetById, getAvailableWidgets |
| `src/components/dashboard/dashboard.tsx` | Dashboard |
| `src/components/dashboard/stats-grid.tsx` | StatsGrid |
| `src/components/dashboard/widgets/maintenance-widget.tsx` | MaintenanceWidget |

## Entry Points

Start here when exploring this area:

- **`getDefaultLayout`** (Function) — `src/lib/dashboard-widgets.ts:166`
- **`getWidgetById`** (Function) — `src/lib/dashboard-widgets.ts:170`
- **`getAvailableWidgets`** (Function) — `src/lib/dashboard-widgets.ts:174`
- **`WidgetGrid`** (Function) — `src/components/dashboard/widget-grid.tsx:50`
- **`handleDragStart`** (Function) — `src/components/dashboard/widget-grid.tsx:71`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getDefaultLayout` | Function | `src/lib/dashboard-widgets.ts` | 166 |
| `getWidgetById` | Function | `src/lib/dashboard-widgets.ts` | 170 |
| `getAvailableWidgets` | Function | `src/lib/dashboard-widgets.ts` | 174 |
| `WidgetGrid` | Function | `src/components/dashboard/widget-grid.tsx` | 50 |
| `handleDragStart` | Function | `src/components/dashboard/widget-grid.tsx` | 71 |
| `handleDragEnter` | Function | `src/components/dashboard/widget-grid.tsx` | 82 |
| `handleDrop` | Function | `src/components/dashboard/widget-grid.tsx` | 95 |
| `addWidget` | Function | `src/components/dashboard/widget-grid.tsx` | 133 |
| `removeWidget` | Function | `src/components/dashboard/widget-grid.tsx` | 144 |
| `renderWidgets` | Function | `src/components/dashboard/widget-grid.tsx` | 157 |
| `flushRow` | Function | `src/components/dashboard/widget-grid.tsx` | 162 |
| `renderWidget` | Function | `src/components/dashboard/widget-grid.tsx` | 195 |
| `formatAge` | Function | `src/lib/utils.ts` | 20 |
| `parseTokenUsage` | Function | `src/lib/utils.ts` | 29 |
| `getProviderHealth` | Function | `src/components/dashboard/widget-primitives.tsx` | 246 |
| `getLocalOsStatus` | Function | `src/components/dashboard/widget-primitives.tsx` | 252 |
| `getMcHealth` | Function | `src/components/dashboard/widget-primitives.tsx` | 260 |
| `Dashboard` | Function | `src/components/dashboard/dashboard.tsx` | 12 |
| `formatUptime` | Function | `src/lib/utils.ts` | 8 |
| `StatsGrid` | Function | `src/components/dashboard/stats-grid.tsx` | 132 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Layout | 1 calls |
| Panels | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getDefaultLayout"})` — see callers and callees
2. `gitnexus_query({query: "dashboard"})` — find related execution flows
3. Read key files listed above for implementation details
