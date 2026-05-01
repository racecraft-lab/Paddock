# Quickstart: Task Pipeline Engine And Declarative Routing

## Prerequisites

- Worktree: `/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/004-task-pipeline-engine`
- Package manager: `pnpm`
- Node.js >=22
- SPEC-001 task-chain columns and workflow-template fields present in the live schema

## Install And Baseline

```bash
cd /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/004-task-pipeline-engine
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Dependency And Audit Gate

```bash
pnpm audit --audit-level high
```

Verify `package.json` and `pnpm-lock.yaml` contain exact direct runtime pins:

- `ajv@8.18.0`
- `jsonpath-plus@10.4.0`
- `safe-regex@2.1.1`

Verify no direct dependency, import, or registration of `ajv-formats`.

## Schema Gate

Verify M62 only adds the partial unique successor index and that rollback SQL drops it:

- Forward migration: `src/lib/migrations.ts`
- Rollback: `docs/migrations/rollback-M62.sql`

Implementation must stop and report a dependency mismatch if SPEC-001 task-chain columns or workflow-template fields are absent.

## Focused Unit And Route Checks

Run the focused Vitest files created for SPEC-004, then the full unit suite:

```bash
pnpm test
```

Coverage must include:

- `createTask()` source profiles and migrated callsites.
- Output schema validator bounds, forbidden features, AJV safety options, conservative pattern-subset enforcement, accepted-pattern adversarial validation-time cases, and bounded no-exception failure responses.
- Routing evaluator allowlist, forbidden primitives, JSONPath safety, malformed/oversized inputs, caps, budget behavior, normal no-match termination, and bounded no-exception failure responses.
- Terminal-success advancement routes.
- Retry conflict and recovery outcomes.
- M62 unique index and rollback behavior.
- Static guardrails for dependency pins, absence of direct `ajv-formats` dependency/import/registration, validator AJV options, pattern-subset enforcement and fixtures, unsafe primitives, direct task inserts, and downstream-scope drift.

## Running-App Workflow Template Journey

Start the app using the repository-supported command for the test environment, then run the focused Playwright journey:

```bash
pnpm test:e2e
```

The SPEC-004 Playwright journey must authenticate as an operator and verify workflow-template chain-field create, edit, read-back, validation rejection, static next-template without schema, usage-tracking compatibility, scoped API calls, and query-parameter delete behavior in the running app.

Screenshots are CI artifacts by default. Committed screenshots require a manifest-backed exception.

## Full Verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

The feature is not complete until the full command passes with task pipelines disabled and the SPEC-004 focused checks pass with the feature enabled.
