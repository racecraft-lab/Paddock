---
name: users
description: "Skill for the Users area of mission-control. 23 symbols across 5 files."
---

# Users

23 symbols | 5 files | Cohesion: 62%

## When to Use

- Working with code in `src/`
- Understanding how hashPassword, resolveSeedAuthPassword, safeCompare work
- Modifying users-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/auth.ts` | safeCompare, getDefaultWorkspaceContext, getWorkspaceIdFromRequest, getTenantIdFromRequest, destroyAllUserSessions (+11) |
| `src/app/api/auth/users/route.ts` | POST, PUT, DELETE |
| `src/lib/db.ts` | resolveSeedAuthPassword, seedAdminUserFromEnv |
| `src/lib/password.ts` | hashPassword |
| `src/app/api/auth/me/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`hashPassword`** (Function) — `src/lib/password.ts:11`
- **`resolveSeedAuthPassword`** (Function) — `src/lib/db.ts:111`
- **`safeCompare`** (Function) — `src/lib/auth.ts:42`
- **`getWorkspaceIdFromRequest`** (Function) — `src/lib/auth.ts:172`
- **`getTenantIdFromRequest`** (Function) — `src/lib/auth.ts:177`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `hashPassword` | Function | `src/lib/password.ts` | 11 |
| `resolveSeedAuthPassword` | Function | `src/lib/db.ts` | 111 |
| `safeCompare` | Function | `src/lib/auth.ts` | 42 |
| `getWorkspaceIdFromRequest` | Function | `src/lib/auth.ts` | 172 |
| `getTenantIdFromRequest` | Function | `src/lib/auth.ts` | 177 |
| `destroyAllUserSessions` | Function | `src/lib/auth.ts` | 274 |
| `getUserById` | Function | `src/lib/auth.ts` | 333 |
| `createUser` | Function | `src/lib/auth.ts` | 356 |
| `updateUser` | Function | `src/lib/auth.ts` | 389 |
| `deleteUser` | Function | `src/lib/auth.ts` | 411 |
| `getUserFromRequest` | Function | `src/lib/auth.ts` | 478 |
| `GET` | Function | `src/app/api/auth/me/route.ts` | 8 |
| `POST` | Function | `src/app/api/auth/users/route.ts` | 27 |
| `PUT` | Function | `src/app/api/auth/users/route.ts` | 81 |
| `DELETE` | Function | `src/app/api/auth/users/route.ts` | 145 |
| `seedAdminUserFromEnv` | Function | `src/lib/db.ts` | 138 |
| `getDefaultWorkspaceContext` | Function | `src/lib/auth.ts` | 154 |
| `resolveOrProvisionProxyUser` | Function | `src/lib/auth.ts` | 431 |
| `resolveActiveApiKey` | Function | `src/lib/auth.ts` | 631 |
| `extractApiKeyFromHeaders` | Function | `src/lib/auth.ts` | 644 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PATCH → EnsureDirExists` | cross_community | 7 |
| `PATCH → CalculateAgentTrustScore` | cross_community | 7 |
| `PATCH → Generate` | cross_community | 7 |
| `POST → EnsureDirExists` | cross_community | 7 |
| `POST → CalculateAgentTrustScore` | cross_community | 7 |
| `POST → Generate` | cross_community | 7 |
| `GET → EnsureDirExists` | cross_community | 7 |
| `GET → CalculateAgentTrustScore` | cross_community | 7 |
| `GET → Generate` | cross_community | 7 |
| `POST → EnsureDirExists` | cross_community | 7 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 14 calls |
| Cluster_154 | 3 calls |
| Setup | 2 calls |
| Cluster_292 | 2 calls |

## How to Explore

1. `gitnexus_context({name: "hashPassword"})` — see callers and callees
2. `gitnexus_query({query: "users"})` — find related execution flows
3. Read key files listed above for implementation details
