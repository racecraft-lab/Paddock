---
name: setup
description: "Skill for the Setup area of mission-control. 36 symbols across 15 files."
---

# Setup

36 symbols | 15 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how getMcSessionCookieName, isRequestSecure, parseMcSessionCookieHeader work
- Modifying setup-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/pty-manager.ts` | PtySession, isTmuxAvailable, tmuxSessionExists, listTmuxSessions, createPtySession (+1) |
| `src/app/setup/page.tsx` | getInitialProgress, ProgressIndicator, SetupPage, checkSetupStatus, updateProgress (+1) |
| `src/lib/session-cookie.ts` | getMcSessionCookieName, isRequestSecure, parseMcSessionCookieHeader, envFlag, getMcSessionCookieOptions |
| `src/lib/auth.ts` | resolveTenantForWorkspace, createSession, authenticateUser |
| `src/lib/password.ts` | verifyPasswordWithRehashCheck, verifyPassword |
| `src/app/api/setup/route.ts` | GET, POST |
| `src/app/api/auth/google/route.ts` | upsertAccessRequest, POST |
| `src/app/api/pty/setup/route.ts` | GET, POST |
| `src/app/api/pty/attach/route.ts` | POST, GET |
| `src/lib/google-auth.ts` | verifyGoogleIdToken |

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
| `isTmuxAvailable` | Function | `src/lib/pty-manager.ts` | 204 |
| `tmuxSessionExists` | Function | `src/lib/pty-manager.ts` | 214 |
| `listTmuxSessions` | Function | `src/lib/pty-manager.ts` | 224 |
| `createPtySession` | Function | `src/lib/pty-manager.ts` | 244 |

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
| [id] | 15 calls |
| Users | 9 calls |
| Cluster_267 | 2 calls |
| Cluster_169 | 1 calls |
| Cluster_129 | 1 calls |
| Panels | 1 calls |
| Ui | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getMcSessionCookieName"})` — see callers and callees
2. `gitnexus_query({query: "setup"})` — find related execution flows
3. Read key files listed above for implementation details
