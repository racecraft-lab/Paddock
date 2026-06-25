## Summary

SPEC-011 stack slice 4/5. Adds bounded rejection behavior for invalid CrabTrap payloads.

## What Changed

- Rejects malformed, stale, unsigned, unsupported, oversized, and unsafe CrabTrap payloads.
- Bounds schema diagnostic field paths before returning them to callers.
- Keeps future-marker CrabTrap behavior tests deferred until the final US4 slice.

## Verification

- `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` (deferred in this slice)
- `direnv exec . pnpm typecheck`

## Scope

This PR is limited to the US3 invalid-payload hardening slice for SPEC-011.
