---
name: tokens
description: "Skill for the Tokens area of mission-control. 20 symbols across 6 files."
---

# Tokens

20 symbols | 6 files | Cohesion: 70%

## When to Use

- Working with code in `src/`
- Understanding how getModelPricing, calculateTokenCost, getProviderSubscriptionFlags work
- Modifying tokens-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/tokens/route.ts` | extractAgentName, loadTokenDataFromDb, normalizeTokenRecord, dedupeTokenRecords, loadTokenDataFromFile (+7) |
| `src/lib/token-pricing.ts` | normalizedModelName, getModelPricing, calculateTokenCost |
| `src/lib/provider-subscriptions.ts` | getProviderSubscriptionFlags, getProviderFromModel |
| `src/lib/config.ts` | ensureDirExists |
| `src/app/api/backup/route.ts` | GET |
| `src/app/api/tokens/by-agent/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`getModelPricing`** (Function) — `src/lib/token-pricing.ts:46`
- **`calculateTokenCost`** (Function) — `src/lib/token-pricing.ts:62`
- **`getProviderSubscriptionFlags`** (Function) — `src/lib/provider-subscriptions.ts:199`
- **`getProviderFromModel`** (Function) — `src/lib/provider-subscriptions.ts:211`
- **`ensureDirExists`** (Function) — `src/lib/config.ts:114`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getModelPricing` | Function | `src/lib/token-pricing.ts` | 46 |
| `calculateTokenCost` | Function | `src/lib/token-pricing.ts` | 62 |
| `getProviderSubscriptionFlags` | Function | `src/lib/provider-subscriptions.ts` | 199 |
| `getProviderFromModel` | Function | `src/lib/provider-subscriptions.ts` | 211 |
| `ensureDirExists` | Function | `src/lib/config.ts` | 114 |
| `POST` | Function | `src/app/api/tokens/route.ts` | 554 |
| `GET` | Function | `src/app/api/backup/route.ts` | 16 |
| `GET` | Function | `src/app/api/tokens/by-agent/route.ts` | 42 |
| `GET` | Function | `src/app/api/tokens/route.ts` | 303 |
| `normalizedModelName` | Function | `src/lib/token-pricing.ts` | 42 |
| `extractAgentName` | Function | `src/app/api/tokens/route.ts` | 47 |
| `loadTokenDataFromDb` | Function | `src/app/api/tokens/route.ts` | 65 |
| `normalizeTokenRecord` | Function | `src/app/api/tokens/route.ts` | 99 |
| `dedupeTokenRecords` | Function | `src/app/api/tokens/route.ts` | 125 |
| `loadTokenDataFromFile` | Function | `src/app/api/tokens/route.ts` | 150 |
| `loadTokenData` | Function | `src/app/api/tokens/route.ts` | 175 |
| `saveTokenData` | Function | `src/app/api/tokens/route.ts` | 219 |
| `calculateStats` | Function | `src/app/api/tokens/route.ts` | 224 |
| `filterByTimeframe` | Function | `src/app/api/tokens/route.ts` | 248 |
| `loadTaskMetadataById` | Function | `src/app/api/tokens/route.ts` | 273 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PATCH → EnsureDirExists` | cross_community | 7 |
| `GET → EnsureDirExists` | cross_community | 7 |
| `POST → EnsureDirExists` | cross_community | 7 |
| `POST → EnsureDirExists` | cross_community | 6 |
| `POST → EnsureDirExists` | cross_community | 6 |
| `GET → NormalizeSecurityEventType` | cross_community | 6 |
| `GET → Run` | cross_community | 6 |
| `GET → Broadcast` | cross_community | 6 |
| `GET → EnsureDirExists` | cross_community | 6 |
| `PUT → EnsureDirExists` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 8 calls |
| Status | 2 calls |
| Onboarding | 1 calls |
| Cluster_103 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getModelPricing"})` — see callers and callees
2. `gitnexus_query({query: "tokens"})` — find related execution flows
3. Read key files listed above for implementation details
