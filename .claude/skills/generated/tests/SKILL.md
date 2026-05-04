---
name: tests
description: "Skill for the Tests area of mission-control. 48 symbols across 8 files."
---

# Tests

48 symbols | 8 files | Cohesion: 85%

## When to Use

- Working with code in `tests/`
- Understanding how setDefaultWorkspaceSwitcherFlag, enableWorkspaceSwitcherFlagForE2E, seedProductLineE2EData work
- Modifying tests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/helpers.ts` | setDefaultWorkspaceSwitcherFlag, waitForWorkspaceSwitcherFlag, enableWorkspaceSwitcherFlagForE2E, withWorkspaceScope, expectJsonSuccess (+31) |
| `tests/product-line-switcher-ui.spec.ts` | openSwitcher, expectControlInViewport, prepareAuthenticatedPage |
| `tests/e2e/ready-for-owner-kanban.spec.ts` | parseFeatureFlags, createReadyForOwnerWorkspace, getReadyForOwnerWorkspace |
| `tests/product-line-events.spec.ts` | loadWorkspaceFixtures, openEventStream |
| `tests/product-line-scope-matrix.spec.ts` | loadWorkspaceFixtures |
| `src/lib/routing-rule-evaluator.ts` | expect |
| `tests/feature-flags-admin-ui.spec.ts` | prepareAuthenticatedPage |
| `src/app/api/events/route.ts` | cancel |

## Entry Points

Start here when exploring this area:

- **`setDefaultWorkspaceSwitcherFlag`** (Function) — `tests/helpers.ts:43`
- **`enableWorkspaceSwitcherFlagForE2E`** (Function) — `tests/helpers.ts:110`
- **`seedProductLineE2EData`** (Function) — `tests/helpers.ts:380`
- **`cleanup`** (Function) — `tests/helpers.ts:390`
- **`getWorkflowTestWorkspaceId`** (Function) — `tests/helpers.ts:531`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `setDefaultWorkspaceSwitcherFlag` | Function | `tests/helpers.ts` | 43 |
| `enableWorkspaceSwitcherFlagForE2E` | Function | `tests/helpers.ts` | 110 |
| `seedProductLineE2EData` | Function | `tests/helpers.ts` | 380 |
| `cleanup` | Function | `tests/helpers.ts` | 390 |
| `getWorkflowTestWorkspaceId` | Function | `tests/helpers.ts` | 531 |
| `productLineScopedPath` | Function | `tests/helpers.ts` | 545 |
| `createTestTask` | Function | `tests/helpers.ts` | 473 |
| `createTestAgent` | Function | `tests/helpers.ts` | 492 |
| `createTestWorkflow` | Function | `tests/helpers.ts` | 511 |
| `deleteTestWorkflow` | Function | `tests/helpers.ts` | 524 |
| `workflowTestPath` | Function | `tests/helpers.ts` | 549 |
| `createTestWebhook` | Function | `tests/helpers.ts` | 555 |
| `createTestAlert` | Function | `tests/helpers.ts` | 577 |
| `createTestProject` | Function | `tests/helpers.ts` | 606 |
| `createTestUser` | Function | `tests/helpers.ts` | 628 |
| `resetProductLineVisualFixtures` | Function | `tests/helpers.ts` | 160 |
| `resetFeatureFlagAdminVisualFixture` | Function | `tests/helpers.ts` | 210 |
| `freezeProductLineVisualClock` | Function | `tests/helpers.ts` | 156 |
| `loginAsE2EAdmin` | Function | `tests/helpers.ts` | 258 |
| `dismissOnboardingForE2E` | Function | `tests/helpers.ts` | 284 |

## Connected Areas

| Area | Connections |
|------|-------------|
| [id] | 3 calls |
| Cluster_127 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "setDefaultWorkspaceSwitcherFlag"})` — see callers and callees
2. `gitnexus_query({query: "tests"})` — find related execution flows
3. Read key files listed above for implementation details
