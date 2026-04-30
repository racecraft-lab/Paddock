# Research

## 1. Feature Flag Evaluation

- Decision: Route `FEATURE_GLOBAL_AEGIS` through `resolveFlag(name, ctx)` and evaluate it with the requested workspace context.
- Rationale: This preserves the project-wide flag contract and avoids environment-only enablement.
- Alternatives considered: Inline `process.env.FEATURE_GLOBAL_AEGIS` reads, which would bypass workspace JSON and break the established flag model.

## 2. Resolver Precedence

- Decision: Build `getAegis(db, workspace_id?)` as the single lookup path, with flag-off workspace-first fallback and flag-on global-first fallback.
- Rationale: A shared resolver prevents scheduler, route, and UI drift and centralizes tie-breaking and shadow-audit behavior.
- Alternatives considered: Keeping a workspace map in `runAegisReviews`, which would leave multiple lookup paths and make global-only rows unreachable.

## 3. Shadow Audit Writes

- Decision: Insert an idempotent `activities` row only when global Aegis wins over a local row under the flag-on path.
- Rationale: The audit captures migration visibility without spamming repeated scheduler ticks.
- Alternatives considered: Emitting a log-only signal, which would not persist operator-visible evidence.

## 4. Gateway Fallback

- Decision: Preserve the existing gateway fallback to agent id/name `aegis` when no database-backed row exists.
- Rationale: This keeps scheduler loops alive during partial migration or empty-config states.
- Alternatives considered: Throwing on missing resolver rows, which would turn a compatibility condition into a runtime failure.

## 5. Scheduler Integration

- Decision: Keep `runAegisReviews` task selection, retry, and status transitions unchanged and replace only the resolver source.
- Rationale: The spec requires behavioral parity except for how the reviewer is resolved.
- Alternatives considered: Refactoring the dispatch flow, which would expand scope and risk downstream regressions.
