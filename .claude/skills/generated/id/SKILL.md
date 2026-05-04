---
name: id
description: "Skill for the [id] area of mission-control. 298 symbols across 114 files."
---

# [id]

298 symbols | 114 files | Cohesion: 69%

## When to Use

- Working with code in `src/`
- Understanding how listWorkspacesForTenant, resolveWorkspaceScopeFromRequest, workspaceScopePredicate work
- Modifying [id]-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/task-dispatch.ts` | tableExists, columnsFor, parseJson, sameTemplateProvenance, parseTemplateProvenance (+23) |
| `src/app/api/tasks/route.ts` | resolveProjectId, hasAegisApproval, TaskTransitionConflictError, taskProducesPr, isReadyForOwnerMergeGatedTask (+5) |
| `src/lib/agent-evals.ts` | evalTaskCompletion, evalCorrectnessScore, runOutputEvals, convergenceScore, evalReasoningCoherence (+4) |
| `src/app/api/workflows/route.ts` | parseJsonField, serializeJsonField, serializeRoutingRules, templateResponse, requireProductLineScope (+4) |
| `src/app/api/tasks/[id]/route.ts` | formatTicketRef, mapTaskRow, hasAegisApproval, taskProducesPr, isReadyForOwnerMergeGatedTask (+4) |
| `src/app/api/projects/[id]/route.ts` | classifyError, normalizePrefix, toProjectId, GET, PATCH (+2) |
| `src/lib/workspaces.ts` | listWorkspacesForTenant, readScopeBodyCarrier, resolveWorkspaceScopeFromRequest, workspaceScopePredicate, agentWorkspaceScopePredicate (+1) |
| `src/app/api/agents/[id]/memory/route.ts` | getAgentByIdOrName, agentColumnName, agentColumnValue, GET, PUT (+1) |
| `src/app/api/webhooks/route.ts` | isBlockedWebhookUrl, GET, POST, PUT, DELETE |
| `src/app/api/alerts/route.ts` | GET, POST, PUT, DELETE, evaluateRules |

## Entry Points

Start here when exploring this area:

- **`listWorkspacesForTenant`** (Function) — `src/lib/workspaces.ts:110`
- **`resolveWorkspaceScopeFromRequest`** (Function) — `src/lib/workspaces.ts:256`
- **`workspaceScopePredicate`** (Function) — `src/lib/workspaces.ts:266`
- **`agentWorkspaceScopePredicate`** (Function) — `src/lib/workspaces.ts:282`
- **`workspaceScopeError`** (Function) — `src/lib/workspaces.ts:298`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `listWorkspacesForTenant` | Function | `src/lib/workspaces.ts` | 110 |
| `resolveWorkspaceScopeFromRequest` | Function | `src/lib/workspaces.ts` | 256 |
| `workspaceScopePredicate` | Function | `src/lib/workspaces.ts` | 266 |
| `agentWorkspaceScopePredicate` | Function | `src/lib/workspaces.ts` | 282 |
| `workspaceScopeError` | Function | `src/lib/workspaces.ts` | 298 |
| `nextRetryDelay` | Function | `src/lib/webhooks.ts` | 50 |
| `deliverWebhookPublic` | Function | `src/lib/webhooks.ts` | 164 |
| `validateBody` | Function | `src/lib/validation.ts` | 9 |
| `hasAssignee` | Function | `src/lib/task-status.ts` | 108 |
| `normalizeTaskCreateStatus` | Function | `src/lib/task-status.ts` | 116 |
| `normalizeTaskUpdateStatus` | Function | `src/lib/task-status.ts` | 129 |
| `parseMetadata` | Function | `src/lib/task-routing.ts` | 15 |
| `resolveTaskImplementationTarget` | Function | `src/lib/task-routing.ts` | 37 |
| `buildDecommissionPlan` | Function | `src/lib/super-admin.ts` | 167 |
| `getProvisionJob` | Function | `src/lib/super-admin.ts` | 328 |
| `createTenantDecommissionJob` | Function | `src/lib/super-admin.ts` | 479 |
| `transitionProvisionJobStatus` | Function | `src/lib/super-admin.ts` | 552 |
| `getSpawnHistory` | Function | `src/lib/spawn-history.ts` | 132 |
| `getSpawnStats` | Function | `src/lib/spawn-history.ts` | 150 |
| `calculateAgentTrustScore` | Function | `src/lib/security-events.ts` | 62 |

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
| Adapters | 30 calls |
| Onboarding | 16 calls |
| Cluster_57 | 4 calls |
| Sessions | 4 calls |
| Backup | 4 calls |
| Cluster_94 | 3 calls |
| Access-requests | 3 calls |
| Status | 3 calls |

## How to Explore

1. `gitnexus_context({name: "listWorkspacesForTenant"})` — see callers and callees
2. `gitnexus_query({query: "[id]"})` — find related execution flows
3. Read key files listed above for implementation details
