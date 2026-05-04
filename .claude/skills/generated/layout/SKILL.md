---
name: layout
description: "Skill for the Layout area of mission-control. 29 symbols across 14 files."
---

# Layout

29 symbols | 14 files | Cohesion: 89%

## When to Use

- Working with code in `src/`
- Understanding how getPluginPanel, panelHref, useNavigateToPanel work
- Modifying layout-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/navigation.ts` | panelHref, safePrefetch, useNavigateToPanel, usePrefetchPanel |
| `src/components/layout/nav-rail.tsx` | NavRail, toggleParent, MobileBottomSheet, handleClose |
| `src/components/layout/header-bar.tsx` | HeaderBar, NavigationLatencyStat, update, ModeBadge |
| `src/lib/navigation-metrics.ts` | startNavigationTiming, getNavigationMetrics, navigationMetricEventName |
| `src/app/[[...panel]]/page.tsx` | renderPluginPanel, ContentRouter |
| `src/components/dashboard/widgets/onboarding-checklist-widget.tsx` | OnboardingChecklistWidget, check |
| `src/components/layout/openclaw-doctor-banner.tsx` | OpenClawDoctorBanner, loadDoctorStatus |
| `src/components/layout/live-feed.tsx` | FeedItem, formatRelativeTime |
| `src/lib/plugins.ts` | getPluginPanel |
| `src/components/panels/settings-panel.tsx` | InterfaceModeSelector |

## Entry Points

Start here when exploring this area:

- **`getPluginPanel`** (Function) — `src/lib/plugins.ts:102`
- **`panelHref`** (Function) — `src/lib/navigation.ts:7`
- **`useNavigateToPanel`** (Function) — `src/lib/navigation.ts:28`
- **`usePrefetchPanel`** (Function) — `src/lib/navigation.ts:55`
- **`startNavigationTiming`** (Function) — `src/lib/navigation-metrics.ts:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getPluginPanel` | Function | `src/lib/plugins.ts` | 102 |
| `panelHref` | Function | `src/lib/navigation.ts` | 7 |
| `useNavigateToPanel` | Function | `src/lib/navigation.ts` | 28 |
| `usePrefetchPanel` | Function | `src/lib/navigation.ts` | 55 |
| `startNavigationTiming` | Function | `src/lib/navigation-metrics.ts` | 27 |
| `NavRail` | Function | `src/components/layout/nav-rail.tsx` | 126 |
| `toggleParent` | Function | `src/components/layout/nav-rail.tsx` | 145 |
| `LocalModeBanner` | Function | `src/components/layout/local-mode-banner.tsx` | 7 |
| `HeaderBar` | Function | `src/components/layout/header-bar.tsx` | 46 |
| `Sidebar` | Function | `src/components/dashboard/sidebar.tsx` | 65 |
| `SecurityAuditWidget` | Function | `src/components/dashboard/widgets/security-audit-widget.tsx` | 18 |
| `OnboardingChecklistWidget` | Function | `src/components/dashboard/widgets/onboarding-checklist-widget.tsx` | 14 |
| `check` | Function | `src/components/dashboard/widgets/onboarding-checklist-widget.tsx` | 26 |
| `getNavigationMetrics` | Function | `src/lib/navigation-metrics.ts` | 57 |
| `navigationMetricEventName` | Function | `src/lib/navigation-metrics.ts` | 83 |
| `extractWsHost` | Function | `src/lib/agent-card-helpers.ts` | 40 |
| `OpenClawDoctorBanner` | Function | `src/components/layout/openclaw-doctor-banner.tsx` | 24 |
| `loadDoctorStatus` | Function | `src/components/layout/openclaw-doctor-banner.tsx` | 36 |
| `safePrefetch` | Function | `src/lib/navigation.ts` | 22 |
| `InterfaceModeSelector` | Function | `src/components/panels/settings-panel.tsx` | 1013 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Onboarding | 3 calls |
| Panels | 2 calls |

## How to Explore

1. `gitnexus_context({name: "getPluginPanel"})` — see callers and callees
2. `gitnexus_query({query: "layout"})` — find related execution flows
3. Read key files listed above for implementation details
