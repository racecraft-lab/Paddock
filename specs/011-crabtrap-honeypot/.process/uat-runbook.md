# SPEC-011 UAT Runbook

This runbook is scaffold guidance for the future implementation. It should be
updated with exact commands after `spec.md`, `plan.md`, and `tasks.md` exist.

## Required Validation

1. Verify `FEATURE_CRABTRAP_HONEYPOT=false` records no CrabTrap activity and
   leaves existing behavior unchanged.
2. Verify missing or invalid CrabTrap adapter config records no activity and
   returns a bounded no-op or validation result.
3. Replay one valid Paddock-owned signed denial-summary fixture with the
   feature flag and config enabled.
   - The signed fixture uses flat schema `crabtrap_denial_summary.v1` with no
     unknown fields.
   - Helper fixture signatures use HMAC-SHA256 over
     `v1:<timestamp>:<event_id>:<canonical_payload_sha256>` and carry
     `signature: "sha256=<hex>"`.
   - Fixture timestamps outside +/-300 seconds of the adapter clock are stale.
   - Accepted methods are only `GET`, `HEAD`, `POST`, `PUT`, `PATCH`,
     `DELETE`, and `OPTIONS`; `CONNECT`/`TRACE` are deferred.
4. Inspect `activities` and confirm exactly one
   `security_intrusion_detected` row with bounded safe `data`.
   - The event class is stored as `activities.type='security_intrusion_detected'`.
   - The row producer may be the fixed Paddock-owned
     `actor='crabtrap-adapter'`; payload-controlled actor IDs, user IDs, and
     emails are forbidden.
   - Accepted evidence lands in the approved workspace activity scope, or the
     real facility workspace row when no approved workspace/project context
     exists.
   - Accepted evidence stores only `data.replay_key_hash = "sha256:<hex>"`,
     not raw event identity or raw signing material.
   - Replay dedupe is checked in the same workspace/facility landing scope by
     `type='security_intrusion_detected'` and `data.replay_key_hash`.
   - URL evidence stores only lowercased `url_host` and parsed `url_path`; no
     raw/full URL, scheme, userinfo, query, fragment, CR/LF, or blank host/path
     value is persisted.
   - Activity producer identity is `crabtrap-adapter`; raw actor IDs, user IDs,
     and emails are not persisted. Any actor reference hash is keyed if it
     represents low-entropy identity.
   - Count fields are nonnegative safe integers from 0 through 1,000,000
     inclusive.
5. Replay malformed, unsigned, stale, replayed, oversized, and unsafe-field
   fixtures.
   - Raw fixture input over 16 KiB UTF-8 is rejected before JSON parse.
   - Malformed JSON returns `malformed_json`.
   - Unknown fields, raw URL fields, secret-like path values, and payload-supplied
     `replay_key_hash` are rejected.
6. Confirm rejected fixtures write no `security_intrusion_detected` activity and
   expose only bounded diagnostics.
   - Expected failure-code vocabulary is `crabtrap_intake_failure_code.v1`.
   - Unsafe-field diagnostics include only bounded field path/category and no
     raw values, matched substrings, raw secret hashes, headers, bodies,
     cookies, auth material, query secrets, provider payloads, signing
     material, payload-controlled actor identifiers, or audit rows.
7. Confirm no raw URLs, raw headers, bodies, cookies, Authorization values,
   query secrets, provider payloads, raw actor identifiers, or full CrabTrap
   audit rows are persisted.
8. Confirm no CrabTrap-specific notification rows, default alert rules, new
   panels, or OpenAPI/report surfaces were added by this slice.

## Optional Evidence

Live official CrabTrap Docker evidence is optional deploy evidence for this
slice because the public CrabTrap docs do not define a generic webhook contract.
It is not a blocking completion gate. If an operator does run CrabTrap, record:

- CrabTrap version or image tag.
- Whether evidence came from admin audit export, denial alerting, a custom
  sender, or a manually normalized fixture.
- Why the source shape is safe to reduce into the SPEC-011 summary payload.

## Completion Rule

SPEC-011 is complete only when fixture UAT, focused tests, guardrails,
typecheck/lint, no-raw-persistence proof, scope-control evidence,
reviewability evidence, and roadmap/workflow status updates are recorded. Do
not claim live CrabTrap integration unless implementation actually uses and
verifies an official or operator-owned runtime source.

Clarify Session 1 chose helper-only intake for this slice. Do not add or test a
runtime route, webhook receiver, custom sender, admin poller, OpenAPI entry, or
API-parity ignore as SPEC-011 completion evidence.
