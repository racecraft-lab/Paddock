# Implementation Plan: Aegis Facility Singleton Refactor

**Branch**: `[003-global-aegis]` | **Date**: 2026-04-28 | **Spec**: `/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/003-global-aegis/specs/003-global-aegis/spec.md`
**Input**: Feature specification from `/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/003-global-aegis/specs/003-global-aegis/spec.md`

## Summary

Introduce a shared Aegis resolver in `src/lib/aegis.ts` that honors the `FEATURE_GLOBAL_AEGIS` flag, preserves workspace-first compatibility when the flag is off, prefers the global singleton when the flag is on, and records idempotent shadow-audit activity when a local row is bypassed. Integrate the resolver into scheduler-driven review dispatch and preserve the existing gateway routing and review-gate semantics.

## Technical Context

**Language/Version**: TypeScript 5 on Next.js 16 App Router with React 19  
**Primary Dependencies**: Next.js, Zustand, better-sqlite3, Vitest, ESLint, pnpm  
**Storage**: SQLite via `better-sqlite3`  
**Testing**: Vitest, route tests, `pnpm typecheck`, `pnpm lint`  
**Target Platform**: Web application / server-side Node runtime  
**Project Type**: web application  
**Performance Goals**: Preserve scheduler throughput and avoid repeated per-task resolver lookups where practical  
**Constraints**: No schema migration; preserve `quality_reviews.reviewer='aegis'`; route flag checks through `resolveFlag()`; keep `FEATURE_GLOBAL_AEGIS='1'` from forcing enablement; treat malformed workspace feature-flag JSON as no override/default OFF; preserve the existing `FEATURE_GLOBAL_AEGIS` registry dependency on `FEATURE_WORKSPACE_SWITCHER` for enablement/preflight checks; no downstream SPEC-004+ behavior
**Scale/Scope**: Focused refactor across resolver, scheduler review dispatch, task routes, and targeted tests  
**Strict Scope**: New production module `src/lib/aegis.ts`; implementation must add this file to the strict-scope lists in `tsconfig.spec-strict.json` and `eslint.config.mjs`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Zero-regression contract: satisfied by preserving flag-off behavior and existing review semantics.
- Upstream compatibility discipline: satisfied by avoiding destructive schema or identifier changes.
- Feature-flag resolution discipline: satisfied by using `resolveFlag(name, ctx)` and avoiding inline `process.env.FEATURE_GLOBAL_AEGIS` checks.
- Dependency supply-chain hygiene: satisfied by reusing existing runtime dependencies only.
- Additive migration policy: satisfied by no schema migration.
- Successor side-effect parity: not applicable.
- Safe evaluation discipline: not applicable.
- Strict new-module scope: satisfied by introducing only `src/lib/aegis.ts` as the new production module and requiring same-branch strict-scope coverage in `tsconfig.spec-strict.json` and `eslint.config.mjs`.

## Project Structure

### Documentation (this feature)

```text
specs/003-global-aegis/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── aegis-resolver.md
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── aegis.ts
│   ├── feature-flags.ts
│   ├── scheduler.ts
│   └── task-dispatch.ts
├── app/
│   └── api/
│       ├── tasks/
│       └── chat/
└── components/
    ├── task-board/
    └── chat/
```

**Structure Decision**: Keep the new resolver isolated in `src/lib/aegis.ts`, then update the scheduler and the smallest set of task/chat surface files that reference Aegis so they continue to reflect the same review source without introducing new task-pipeline behavior.

## Reference Sweep Classification

Each live Aegis reference discovered during implementation must be classified before it is changed:

- **Resolver dependency**: route through `getAegis(db, workspace_id?)`.
- **Review-gate dependency**: preserve `quality_reviews.reviewer='aegis'` without adding `quality_reviews.agent_id`.
- **Display-only/unaffected**: document why the reference does not resolve Aegis metadata and leave review semantics unchanged.

## Research Plan

- Confirm the existing `resolveFlag()` calling pattern for workspace-scoped feature evaluation.
- Verify the current `runAegisReviews` and gateway resolver call sites to keep task selection, retry, and status transitions unchanged.
- Validate the existing `activities` write pattern used by other audit rows so the new shadow audit entry is idempotent and consistent.

## Design Plan

- Define `getAegis(db, workspace_id?)` as the single resolver entry point with deterministic scope precedence and lowest-id tie breaking.
- Return a task-dispatch-compatible resolver row: `id`, `name`, source `config`, `agent_config` mapped from `agents.config` for `ReviewAgentRecord`, `workspace_id`, and `scope`; `agent_config` must equal `config` for database-backed rows so gateway `openclawId` parsing and name fallback semantics remain unchanged.
- Keep gateway fallback behavior explicit so the scheduler can continue when no database-backed row exists.
- Add tests that prove flag-off workspace-first behavior, flag-on global-first behavior through `workspaces.feature_flags`, no-workspace-context default OFF behavior, malformed config default-OFF handling, environment `0` kill-switch behavior, environment `1` non-enablement, existing `FEATURE_WORKSPACE_SWITCHER` dependency/preflight behavior, shadow-audit insertion, and unchanged scheduler semantics.

## Regression Safety Gates

- Resolver bypass guard: after `src/lib/aegis.ts` lands, `getAegis(db, workspace_id?)` owns Aegis agent-row, agent-config, Mission Control agent-id, and gateway-identity resolution. Production source outside `src/lib/aegis.ts` may call `getAegis`, may keep `quality_reviews.reviewer='aegis'` review-gate queries, and may mention the literal `aegis` in copy/logs/tests, but must not query `agents` directly by Aegis name, workspace id, scope, or config.
- Legacy bypass removal: implementation must remove or stop relying on `aegisAgentByWorkspace` and the existing workspace-local SQL lookup in `runAegisReviews`; `src/lib/scheduler.ts` must continue to trigger `runAegisReviews()` rather than resolving Aegis directly.
- Scheduler semantics guard: regression coverage must prove `runAegisReviews` preserves task selection, retry behavior, dispatch inputs, quality-review writes, activity logging, and `review`/`quality_review`/`assigned`/`failed`/`done` transition semantics except for the resolver source.
- Static guardrail checks: implementation verification must run `rg` checks that fail on matches for direct Aegis agent lookup outside `src/lib/aegis.ts`, `aegisAgentByWorkspace`, `quality_reviews.agent_id`, inline `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`, and downstream drift into `FEATURE_TASK_PIPELINES`, `ready_for_owner`, `FEATURE_AREA_LABEL_ROUTING`, artifact store, governance, pilot behavior, product-line skill/session ownership, multi-facility modeling, or CrabTrap.
- Scope of remediation: if a guardrail fails, remediation is limited to routing Aegis metadata resolution through `getAegis` or removing out-of-scope drift; do not widen SPEC-003 into a quality-review schema migration, task pipeline engine, owner-ready state, area routing, artifact publishing, governance, pilot, product-line ownership, multi-facility, or CrabTrap implementation.

## Complexity Tracking

No constitution violations require justification.
