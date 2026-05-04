---
name: integrations
description: "Skill for the Integrations area of mission-control. 26 symbols across 2 files."
---

# Integrations

26 symbols | 2 files | Cohesion: 75%

## When to Use

- Working with code in `src/`
- Understanding how PUT, DELETE, getPluginIntegrations work
- Modifying integrations-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/api/integrations/route.ts` | parseEnv, serializeEnv, getEnvPath, readEnvFile, writeEnvFile (+19) |
| `src/lib/plugins.ts` | getPluginIntegrations, getPluginCategories |

## Entry Points

Start here when exploring this area:

- **`PUT`** (Function) — `src/app/api/integrations/route.ts:466`
- **`DELETE`** (Function) — `src/app/api/integrations/route.ts:525`
- **`getPluginIntegrations`** (Function) — `src/lib/plugins.ts:66`
- **`getPluginCategories`** (Function) — `src/lib/plugins.ts:78`
- **`GET`** (Function) — `src/app/api/integrations/route.ts:308`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PUT` | Function | `src/app/api/integrations/route.ts` | 466 |
| `DELETE` | Function | `src/app/api/integrations/route.ts` | 525 |
| `getPluginIntegrations` | Function | `src/lib/plugins.ts` | 66 |
| `getPluginCategories` | Function | `src/lib/plugins.ts` | 78 |
| `GET` | Function | `src/app/api/integrations/route.ts` | 308 |
| `POST` | Function | `src/app/api/integrations/route.ts` | 582 |
| `parseEnv` | Function | `src/app/api/integrations/route.ts` | 119 |
| `serializeEnv` | Function | `src/app/api/integrations/route.ts` | 141 |
| `getEnvPath` | Function | `src/app/api/integrations/route.ts` | 148 |
| `readEnvFile` | Function | `src/app/api/integrations/route.ts` | 153 |
| `writeEnvFile` | Function | `src/app/api/integrations/route.ts` | 165 |
| `redactValue` | Function | `src/app/api/integrations/route.ts` | 173 |
| `isVarBlocked` | Function | `src/app/api/integrations/route.ts` | 178 |
| `checkOpAvailable` | Function | `src/app/api/integrations/route.ts` | 273 |
| `getOpEnv` | Function | `src/app/api/integrations/route.ts` | 287 |
| `handlePull` | Function | `src/app/api/integrations/route.ts` | 834 |
| `handlePullAll` | Function | `src/app/api/integrations/route.ts` | 919 |
| `getEffectiveEnvValue` | Function | `src/app/api/integrations/route.ts` | 183 |
| `checkCommandAvailable` | Function | `src/app/api/integrations/route.ts` | 220 |
| `checkXintState` | Function | `src/app/api/integrations/route.ts` | 229 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 5 calls |
| Adapters | 5 calls |
| Status | 2 calls |
| Onboarding | 1 calls |

## How to Explore

1. `gitnexus_context({name: "PUT"})` — see callers and callees
2. `gitnexus_query({query: "integrations"})` — find related execution flows
3. Read key files listed above for implementation details
