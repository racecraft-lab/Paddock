---
name: status
description: "Skill for the Status area of mission-control. 22 symbols across 6 files."
---

# Status

22 symbols | 6 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how detectProviderSubscriptions, getPrimarySubscription, registerMcAsDashboard work
- Modifying status-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/provider-subscriptions.ts` | normalizeProvider, normalizeType, isPositiveSubscription, parseJsonFile, findNestedString (+5) |
| `src/app/api/status/route.ts` | getCapabilities, isPortOpen, cleanup, statusScopePredicate, getDashboardData (+2) |
| `src/lib/sessions.ts` | getAllGatewaySessions, getAgentLiveStatuses |
| `src/lib/gateway-runtime.ts` | registerMcAsDashboard |
| `src/lib/scheduler.ts` | syncAgentLiveStatuses |
| `src/app/api/tokens/route.ts` | deriveFromSessions |

## Entry Points

Start here when exploring this area:

- **`detectProviderSubscriptions`** (Function) — `src/lib/provider-subscriptions.ts:180`
- **`getPrimarySubscription`** (Function) — `src/lib/provider-subscriptions.ts:206`
- **`registerMcAsDashboard`** (Function) — `src/lib/gateway-runtime.ts:29`
- **`getAllGatewaySessions`** (Function) — `src/lib/sessions.ts:67`
- **`getAgentLiveStatuses`** (Function) — `src/lib/sessions.ts:175`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `detectProviderSubscriptions` | Function | `src/lib/provider-subscriptions.ts` | 180 |
| `getPrimarySubscription` | Function | `src/lib/provider-subscriptions.ts` | 206 |
| `registerMcAsDashboard` | Function | `src/lib/gateway-runtime.ts` | 29 |
| `getAllGatewaySessions` | Function | `src/lib/sessions.ts` | 67 |
| `getAgentLiveStatuses` | Function | `src/lib/sessions.ts` | 175 |
| `normalizeProvider` | Function | `src/lib/provider-subscriptions.ts` | 27 |
| `normalizeType` | Function | `src/lib/provider-subscriptions.ts` | 31 |
| `isPositiveSubscription` | Function | `src/lib/provider-subscriptions.ts` | 35 |
| `parseJsonFile` | Function | `src/lib/provider-subscriptions.ts` | 40 |
| `findNestedString` | Function | `src/lib/provider-subscriptions.ts` | 49 |
| `detectAnthropicFromFile` | Function | `src/lib/provider-subscriptions.ts` | 73 |
| `detectOpenAIFromFile` | Function | `src/lib/provider-subscriptions.ts` | 105 |
| `detectFromEnv` | Function | `src/lib/provider-subscriptions.ts` | 134 |
| `getCapabilities` | Function | `src/app/api/status/route.ts` | 622 |
| `isPortOpen` | Function | `src/app/api/status/route.ts` | 731 |
| `cleanup` | Function | `src/app/api/status/route.ts` | 736 |
| `syncAgentLiveStatuses` | Function | `src/lib/scheduler.ts` | 216 |
| `deriveFromSessions` | Function | `src/app/api/tokens/route.ts` | 188 |
| `statusScopePredicate` | Function | `src/app/api/status/route.ts` | 18 |
| `getDashboardData` | Function | `src/app/api/status/route.ts` | 87 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GET → GetGatewaySessionStoreFiles` | cross_community | 5 |
| `POST → NormalizeProvider` | cross_community | 5 |
| `POST → NormalizeType` | cross_community | 5 |
| `POST → ParseJsonFile` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 7 calls |
| Onboarding | 2 calls |
| System-monitor | 2 calls |
| Hermes | 2 calls |
| Cleanup | 1 calls |
| Scripts | 1 calls |
| Adapters | 1 calls |
| Tokens | 1 calls |

## How to Explore

1. `gitnexus_context({name: "detectProviderSubscriptions"})` — see callers and callees
2. `gitnexus_query({query: "status"})` — find related execution flows
3. Read key files listed above for implementation details
