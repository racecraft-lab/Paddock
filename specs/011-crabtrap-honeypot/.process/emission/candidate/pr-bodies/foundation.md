## Summary

SPEC-011 stack slice 1/5. Adds the CrabTrap adapter foundation, fixtures, feature flag wiring, and strict-project coverage.

## What Changed

- Adds the CrabTrap adapter foundation and fixture corpus.
- Adds feature-flag wiring and strict TypeScript project coverage.
- Includes the SPEC-012B stale-claim guardrail parity fix required for stack CI.
- Defers future-marker CrabTrap behavior tests until the final US4 slice.

## Verification

- Foundation spot-check: `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` (test file skipped by design in this slice).

## Scope

This PR is limited to the foundation slice for SPEC-011. Later slices add no-op gating, evidence intake, invalid-payload hardening, and final verification activation.
