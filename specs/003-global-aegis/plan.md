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
**Strict Scope**: `src/lib/aegis.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Zero-regression contract: satisfied by preserving flag-off behavior and existing review semantics.
- Upstream compatibility discipline: satisfied by avoiding destructive schema or identifier changes.
- Feature-flag resolution discipline: satisfied by using `resolveFlag(name, ctx)` and avoiding inline `process.env.FEATURE_GLOBAL_AEGIS` checks.
- Dependency supply-chain hygiene: satisfied by reusing existing runtime dependencies only.
- Additive migration policy: satisfied by no schema migration.
- Successor side-effect parity: not applicable.
- Safe evaluation discipline: not applicable.
- Strict new-module scope: satisfied by introducing only `src/lib/aegis.ts` as the new production module.

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

## Research Plan

- Confirm the existing `resolveFlag()` calling pattern for workspace-scoped feature evaluation.
- Verify the current `runAegisReviews` and gateway resolver call sites to keep task selection, retry, and status transitions unchanged.
- Validate the existing `activities` write pattern used by other audit rows so the new shadow audit entry is idempotent and consistent.

## Design Plan

- Define `getAegis(db, workspace_id?)` as the single resolver entry point with deterministic scope precedence and lowest-id tie breaking.
- Keep gateway fallback behavior explicit so the scheduler can continue when no database-backed row exists.
- Add tests that prove flag-off workspace-first behavior, flag-on global-first behavior through `workspaces.feature_flags`, no-workspace-context default OFF behavior, malformed config default-OFF handling, environment `0` kill-switch behavior, environment `1` non-enablement, existing `FEATURE_WORKSPACE_SWITCHER` dependency/preflight behavior, shadow-audit insertion, and unchanged scheduler semantics.

## Complexity Tracking

No constitution violations require justification.
