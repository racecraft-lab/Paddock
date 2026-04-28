# Aegis Resolver Contract

## Purpose

Define the internal resolver behavior for selecting the active Aegis reviewer and preserving scheduler compatibility.

## Resolver Shape

```ts
getAegis(db, workspace_id?)
```

Returns either a database-backed resolver row or the gateway fallback shape needed by task-dispatch consumers:

```ts
type AegisResolverResult = {
  id?: number
  name: string
  config: string | null
  agent_config: string | null
  workspace_id?: number | null
  scope?: 'global' | 'workspace' | string | null
}
```

For rows sourced from `agents`, `config` is the source value from `agents.config` and `agent_config` is the adapter field consumed by `ReviewAgentRecord` in `task-dispatch.ts`; both fields must carry the same value. Gateway id resolution continues to parse `agent_config` for `openclawId`, fall back to `name` when it is absent or malformed, and use `aegis` when no row is available.

## Contract Rules

- Returns the best available Aegis reviewer for the optional workspace context.
- Honors `FEATURE_GLOBAL_AEGIS` through shared flag resolution.
- Uses workspace-first fallback when the flag is off.
- Uses global-first fallback when the flag is on.
- Falls back to gateway agent id/name `aegis` when no database row exists.
- Preserves existing gateway routing data in the returned record.
- Does not filter by `agents.status`.
- Records an idempotent shadow audit when global Aegis supersedes a local row under the flag-on path.
