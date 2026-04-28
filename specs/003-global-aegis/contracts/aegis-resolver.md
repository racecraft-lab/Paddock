# Aegis Resolver Contract

## Purpose

Define the internal resolver behavior for selecting the active Aegis reviewer and preserving scheduler compatibility.

## Resolver Shape

```ts
getAegis(db, workspace_id?)
```

## Contract Rules

- Returns the best available Aegis reviewer for the optional workspace context.
- Honors `FEATURE_GLOBAL_AEGIS` through shared flag resolution.
- Uses workspace-first fallback when the flag is off.
- Uses global-first fallback when the flag is on.
- Falls back to gateway agent id/name `aegis` when no database row exists.
- Preserves existing gateway routing data in the returned record.
- Does not filter by `agents.status`.
- Records an idempotent shadow audit when global Aegis supersedes a local row under the flag-on path.
