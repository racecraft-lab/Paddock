## Summary

SPEC-011 stack slice 2/5. Adds feature-flag and configuration no-op behavior for CrabTrap intake.

## What Changed

- Returns bounded no-op results when `FEATURE_CRABTRAP_HONEYPOT` is disabled.
- Returns bounded no-op results for missing or invalid CrabTrap adapter config.
- Keeps future-marker CrabTrap behavior tests deferred until the final US4 slice.

## Verification

- US2/restack spot-check later confirmed the deferred test file remains CI-safe before behavior tests are activated.

## Scope

This PR is limited to the US1 no-op gating slice for SPEC-011.
