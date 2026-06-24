# SPEC-011 UAT Runbook

This runbook is scaffold guidance for the future implementation. It should be
updated with exact commands after `spec.md`, `plan.md`, and `tasks.md` exist.

## Required Validation

1. Verify `FEATURE_CRABTRAP_HONEYPOT=false` records no CrabTrap activity and
   leaves existing behavior unchanged.
2. Verify missing or invalid CrabTrap adapter config records no activity and
   returns a bounded no-op or validation result.
3. Replay one valid signed denial-summary fixture with the feature flag and
   config enabled.
4. Inspect `activities` and confirm exactly one
   `security_intrusion_detected` row with bounded safe `data`.
5. Replay malformed, unsigned, stale, replayed, oversized, and unsafe-field
   fixtures.
6. Confirm rejected fixtures write no `security_intrusion_detected` activity and
   expose only bounded diagnostics.
7. Confirm no raw headers, bodies, cookies, Authorization values, query secrets,
   provider payloads, or full CrabTrap audit rows are persisted.

## Optional Evidence

Live official CrabTrap Docker evidence is optional for this slice because the
public CrabTrap docs do not define a generic webhook contract. If an operator
does run CrabTrap, record:

- CrabTrap version or image tag.
- Whether evidence came from admin audit export, denial alerting, a custom
  sender, or a manually normalized fixture.
- Why the source shape is safe to reduce into the SPEC-011 summary payload.

## Completion Rule

SPEC-011 is complete only when fixture UAT, focused tests, guardrails,
typecheck/lint, reviewability evidence, and roadmap/workflow status updates are
recorded. Do not claim live CrabTrap integration unless implementation actually
uses and verifies an official or operator-owned runtime source.
