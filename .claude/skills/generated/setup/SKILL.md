---
name: setup
description: "Skill for the Setup area of mission-control. 31 symbols across 14 files."
---

# Setup

31 symbols | 14 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how getMcSessionCookieName, isRequestSecure, parseMcSessionCookieHeader work
- Modifying setup-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/app/setup/page.tsx` | getInitialProgress, ProgressIndicator, SetupPage, checkSetupStatus, updateProgress (+1) |
| `src/lib/session-cookie.ts` | getMcSessionCookieName, isRequestSecure, parseMcSessionCookieHeader, envFlag, getMcSessionCookieOptions |
| `src/components/ui/language-switcher.tsx` | setLocaleCookie, LanguageSwitcher, LanguageSwitcherSelect, GlobeIcon |
| `src/lib/auth.ts` | resolveTenantForWorkspace, createSession, authenticateUser |
| `src/lib/password.ts` | verifyPasswordWithRehashCheck, verifyPassword |
| `src/app/api/setup/route.ts` | GET, POST |
| `src/app/api/auth/google/route.ts` | upsertAccessRequest, POST |
| `src/lib/google-auth.ts` | verifyGoogleIdToken |
| `src/lib/db.ts` | needsFirstTimeSetup |
| `src/app/api/auth/me/route.ts` | PATCH |

## Entry Points

Start here when exploring this area:

- **`getMcSessionCookieName`** (Function) — `src/lib/session-cookie.ts:6`
- **`isRequestSecure`** (Function) — `src/lib/session-cookie.ts:10`
- **`parseMcSessionCookieHeader`** (Function) — `src/lib/session-cookie.ts:15`
- **`getMcSessionCookieOptions`** (Function) — `src/lib/session-cookie.ts:35`
- **`verifyPasswordWithRehashCheck`** (Function) — `src/lib/password.ts:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getMcSessionCookieName` | Function | `src/lib/session-cookie.ts` | 6 |
| `isRequestSecure` | Function | `src/lib/session-cookie.ts` | 10 |
| `parseMcSessionCookieHeader` | Function | `src/lib/session-cookie.ts` | 15 |
| `getMcSessionCookieOptions` | Function | `src/lib/session-cookie.ts` | 35 |
| `verifyPasswordWithRehashCheck` | Function | `src/lib/password.ts` | 22 |
| `verifyPassword` | Function | `src/lib/password.ts` | 42 |
| `verifyGoogleIdToken` | Function | `src/lib/google-auth.ts` | 10 |
| `needsFirstTimeSetup` | Function | `src/lib/db.ts` | 353 |
| `createSession` | Function | `src/lib/auth.ts` | 188 |
| `authenticateUser` | Function | `src/lib/auth.ts` | 285 |
| `GET` | Function | `src/app/api/setup/route.ts` | 15 |
| `POST` | Function | `src/app/api/setup/route.ts` | 19 |
| `PATCH` | Function | `src/app/api/auth/me/route.ts` | 37 |
| `POST` | Function | `src/app/api/auth/logout/route.ts` | 5 |
| `POST` | Function | `src/app/api/auth/login/route.ts` | 7 |
| `POST` | Function | `src/app/api/auth/google/route.ts` | 27 |
| `fetchSetupStatusWithRetry` | Function | `src/lib/setup-status.ts` | 12 |
| `LanguageSwitcher` | Function | `src/components/ui/language-switcher.tsx` | 13 |
| `LanguageSwitcherSelect` | Function | `src/components/ui/language-switcher.tsx` | 71 |
| `SetupPage` | Function | `src/app/setup/page.tsx` | 66 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `POST → TableExists` | cross_community | 6 |
| `PATCH → NormalizeSecurityEventType` | cross_community | 5 |
| `PATCH → EnsureDirExists` | cross_community | 5 |
| `PATCH → HashPassword` | cross_community | 5 |
| `PATCH → Generate` | cross_community | 5 |
| `POST → GetGeneratedFilePath` | cross_community | 5 |
| `POST → EnsureDirExists` | cross_community | 5 |
| `POST → ResolveSeedAuthPassword` | cross_community | 5 |
| `POST → HashPassword` | cross_community | 5 |
| `POST → Generate` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 11 calls |
| Users | 9 calls |
| Cluster_292 | 2 calls |
| Panels | 2 calls |
| Cluster_154 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getMcSessionCookieName"})` — see callers and callees
2. `gitnexus_query({query: "setup"})` — find related execution flows
3. Read key files listed above for implementation details
