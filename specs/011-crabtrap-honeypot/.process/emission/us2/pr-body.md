## Summary

SPEC-011 stack slice 3/5. Adds signed CrabTrap denial-summary intake and bounded security activity persistence.

## What Changed

- Accepts valid signed CrabTrap denial summaries.
- Writes bounded `security_intrusion_detected` activity evidence.
- Adds replay detection using SQLite JSON lookup with `json_extract(... LIMIT 1)`.
- Keeps future-marker CrabTrap behavior tests deferred until the final US4 slice.

## Verification

- `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` (deferred in this slice)
- `direnv exec . pnpm typecheck`

## Scope

This PR is limited to the US2 denial evidence intake slice for SPEC-011.
