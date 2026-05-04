---
name: access-requests
description: "Skill for the Access-requests area of mission-control. 22 symbols across 6 files."
---

# Access-requests

22 symbols | 6 files | Cohesion: 57%

## When to Use

- Working with code in `src/`
- Understanding how extractClientIpFromTrusted, extractClientIp, safeCompare work
- Modifying access-requests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/auth.ts` | warnProxyAuthMisconfigOnce, safeCompare, getDefaultWorkspaceContext, getWorkspaceIdFromRequest, getTenantIdFromRequest (+9) |
| `src/app/api/auth/access-requests/route.ts` | makeUsernameFromEmail, ensureUniqueUsername, POST |
| `src/app/api/auth/users/route.ts` | GET, POST |
| `src/lib/request.ts` | extractClientIpFromTrusted |
| `src/lib/rate-limit.ts` | extractClientIp |
| `src/app/api/auth/me/route.ts` | GET |

## Entry Points

Start here when exploring this area:

- **`extractClientIpFromTrusted`** (Function) — `src/lib/request.ts:19`
- **`extractClientIp`** (Function) — `src/lib/rate-limit.ts:45`
- **`safeCompare`** (Function) — `src/lib/auth.ts:42`
- **`getWorkspaceIdFromRequest`** (Function) — `src/lib/auth.ts:172`
- **`getTenantIdFromRequest`** (Function) — `src/lib/auth.ts:177`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `extractClientIpFromTrusted` | Function | `src/lib/request.ts` | 19 |
| `extractClientIp` | Function | `src/lib/rate-limit.ts` | 45 |
| `safeCompare` | Function | `src/lib/auth.ts` | 42 |
| `getWorkspaceIdFromRequest` | Function | `src/lib/auth.ts` | 172 |
| `getTenantIdFromRequest` | Function | `src/lib/auth.ts` | 177 |
| `getAllUsers` | Function | `src/lib/auth.ts` | 345 |
| `createUser` | Function | `src/lib/auth.ts` | 356 |
| `getUserFromRequest` | Function | `src/lib/auth.ts` | 478 |
| `GET` | Function | `src/app/api/auth/users/route.ts` | 10 |
| `POST` | Function | `src/app/api/auth/users/route.ts` | 27 |
| `GET` | Function | `src/app/api/auth/me/route.ts` | 8 |
| `POST` | Function | `src/app/api/auth/access-requests/route.ts` | 60 |
| `warnProxyAuthMisconfigOnce` | Function | `src/lib/auth.ts` | 15 |
| `getDefaultWorkspaceContext` | Function | `src/lib/auth.ts` | 154 |
| `resolveOrProvisionProxyUser` | Function | `src/lib/auth.ts` | 431 |
| `resolveActiveApiKey` | Function | `src/lib/auth.ts` | 631 |
| `extractApiKeyFromHeaders` | Function | `src/lib/auth.ts` | 644 |
| `hashApiKeyLegacy` | Function | `src/lib/auth.ts` | 680 |
| `parseAgentScopes` | Function | `src/lib/auth.ts` | 696 |
| `deriveRoleFromScopes` | Function | `src/lib/auth.ts` | 706 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PATCH → EnsureDirExists` | cross_community | 7 |
| `PATCH → Has` | cross_community | 7 |
| `PATCH → Generate` | cross_community | 7 |
| `GET → EnsureDirExists` | cross_community | 7 |
| `GET → Has` | cross_community | 7 |
| `GET → Generate` | cross_community | 7 |
| `POST → EnsureDirExists` | cross_community | 7 |
| `PATCH → NormalizeSecurityEventType` | cross_community | 6 |
| `PATCH → Run` | cross_community | 6 |
| `PATCH → Broadcast` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 16 calls |
| Onboarding | 3 calls |
| Setup | 2 calls |
| Cluster_223 | 2 calls |
| Adapters | 2 calls |
| Cluster_55 | 1 calls |
| Users | 1 calls |

## How to Explore

1. `gitnexus_context({name: "extractClientIpFromTrusted"})` — see callers and callees
2. `gitnexus_query({query: "access-requests"})` — find related execution flows
3. Read key files listed above for implementation details
