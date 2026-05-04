---
name: onboarding
description: "Skill for the Onboarding area of mission-control. 56 symbols across 27 files."
---

# Onboarding

56 symbols | 27 files | Cohesion: 59%

## When to Use

- Working with code in `src/`
- Understanding how isNonRetryableErrorCode, listRuns, getLeaderboard work
- Modifying onboarding-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/components/onboarding/onboarding-wizard.tsx` | modeColors, StepWelcome, StepInterfaceMode, handleSelect, StepGatewayLink (+2) |
| `src/app/api/onboarding/route.ts` | scopedOnboardingKey, getOnboardingSetting, readUserOnboardingSetting, writeUserOnboardingSetting, GET (+1) |
| `src/lib/onboarding-state.ts` | parseCompletedSteps, nextIncompleteStepIndex, shouldShowOnboarding, markStepCompleted |
| `src/lib/mentions.ts` | normalizeAgentHandle, parseMentions, getMentionTargets, resolveMentionRecipients |
| `src/components/panels/memory-graph.tsx` | getFileColor, formatBytes, MemoryGraph |
| `src/app/api/gateways/health/health-utils.test.ts` | ipv4ToNum, ipv4InCidr, isBlockedUrl |
| `src/lib/onboarding-flow.ts` | getWizardSteps, clampWizardStep, stepIdAt |
| `scripts/check-guardrails.mjs` | parseArgs, main |
| `src/lib/runs.ts` | listRuns, getLeaderboard |
| `src/lib/agent-workspace.ts` | resolvePath, push |

## Entry Points

Start here when exploring this area:

- **`isNonRetryableErrorCode`** (Function) — `src/lib/websocket-utils.ts:46`
- **`listRuns`** (Function) — `src/lib/runs.ts:281`
- **`getLeaderboard`** (Function) — `src/lib/runs.ts:327`
- **`getPluginToolProviders`** (Function) — `src/lib/plugins.ts:118`
- **`parseCompletedSteps`** (Function) — `src/lib/onboarding-state.ts:2`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isNonRetryableErrorCode` | Function | `src/lib/websocket-utils.ts` | 46 |
| `listRuns` | Function | `src/lib/runs.ts` | 281 |
| `getLeaderboard` | Function | `src/lib/runs.ts` | 327 |
| `getPluginToolProviders` | Function | `src/lib/plugins.ts` | 118 |
| `parseCompletedSteps` | Function | `src/lib/onboarding-state.ts` | 2 |
| `nextIncompleteStepIndex` | Function | `src/lib/onboarding-state.ts` | 24 |
| `shouldShowOnboarding` | Function | `src/lib/onboarding-state.ts` | 34 |
| `markStepCompleted` | Function | `src/lib/onboarding-state.ts` | 42 |
| `parseMentions` | Function | `src/lib/mentions.ts` | 23 |
| `getMentionTargets` | Function | `src/lib/mentions.ts` | 42 |
| `resolveMentionRecipients` | Function | `src/lib/mentions.ts` | 108 |
| `generateCloneName` | Function | `src/lib/cron-utils.ts` | 69 |
| `push` | Function | `src/lib/agent-workspace.ts` | 14 |
| `getEffectiveToolGroups` | Function | `src/lib/agent-templates.ts` | 82 |
| `SecurityScanCard` | Function | `src/components/onboarding/security-scan-card.tsx` | 84 |
| `MemoryGraph` | Function | `src/components/panels/memory-graph.tsx` | 100 |
| `toggleDir` | Function | `src/components/panels/documents-panel.tsx` | 163 |
| `renderNode` | Function | `src/components/panels/documents-panel.tsx` | 172 |
| `GET` | Function | `src/app/api/onboarding/route.ts` | 55 |
| `POST` | Function | `src/app/api/onboarding/route.ts` | 91 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PATCH → Has` | cross_community | 7 |
| `GET → Has` | cross_community | 7 |
| `PUT → Has` | cross_community | 5 |
| `POST → Has` | cross_community | 5 |
| `PUT → Has` | cross_community | 5 |
| `GET → Has` | cross_community | 5 |
| `POST → Has` | cross_community | 5 |
| `POST → Has` | cross_community | 5 |
| `PUT → Has` | cross_community | 5 |
| `GET → Has` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 9 calls |
| Layout | 1 calls |
| Panels | 1 calls |

## How to Explore

1. `gitnexus_context({name: "isNonRetryableErrorCode"})` — see callers and callees
2. `gitnexus_query({query: "onboarding"})` — find related execution flows
3. Read key files listed above for implementation details
