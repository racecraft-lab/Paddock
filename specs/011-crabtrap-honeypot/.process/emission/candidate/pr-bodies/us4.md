## Summary

SPEC-011 stack slice 5/5. Completes CrabTrap honeypot intake, evidence hardening, and roadmap/product-line documentation.

## What Changed

- Re-enables the full CrabTrap behavior test suite in this final slice.
- Records post-review hardening for signature precedence, stale timestamps, unsafe nested fields, replay lookup, and bounded diagnostics.
- Updates roadmap and product-line documentation for CrabTrap as an optional security adapter.

## Verification

- `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts`
- `direnv exec . pnpm typecheck`
- `direnv exec . pnpm lint`
- `direnv exec . pnpm guardrails`
- `direnv exec . pnpm test`

## Scope

This PR is limited to the final US4 completion and verification slice for SPEC-011.
