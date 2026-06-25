# Quickstart: SPEC-011 CrabTrap Honeypot Adapter

This guide defines the validation path for the helper-only SPEC-011 implementation. It does not add a runtime route, webhook receiver, OpenAPI entry, UI panel, notification fanout, scheduler path, task-dispatch path, or live CrabTrap Docker requirement.

## Prerequisites

- Run from the SPEC-011 worktree.
- Dependencies installed with `pnpm install`.
- Implementation has added the focused adapter tests and fixtures from the SPEC-011 tasks.
- `FEATURE_CRABTRAP_HONEYPOT` remains default-off unless a test/UAT fixture explicitly enables it through the approved workspace flag context.

## Focused Test Validation

Run the focused adapter suite:

```bash
pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts
```

Expected coverage:

- Flag off returns `feature_disabled` or explicit no-op and writes no activity.
- Missing config returns `config_missing` and writes no activity.
- Invalid config returns `config_invalid` and writes no activity.
- One valid signed `crabtrap_denial_summary.v1` fixture creates exactly one `activities.type='security_intrusion_detected'` row.
- Malformed JSON returns `malformed_json`.
- Unsigned input returns `signature_missing`.
- Stale timestamp returns `timestamp_stale`.
- Invalid signature returns `signature_invalid`.
- Replayed event returns `replay_detected`.
- Payload over 16 KiB returns `payload_too_large` before JSON parse.
- Unsafe fields return `unsafe_field_present`.
- Unsupported decision/method return the closed unsupported failure codes.
- Activity insert failure returns `activity_write_failed` without crashing unrelated flows.

## Fixture UAT

Use `specs/011-crabtrap-honeypot/.process/uat-runbook.md` as the evidence checklist. The implementation phase must update that runbook with exact fixture commands once the focused helper/test harness exists.

Required UAT evidence:

1. With `FEATURE_CRABTRAP_HONEYPOT` off, replay an otherwise valid signed fixture and confirm zero CrabTrap activity rows.
2. With the feature on but config missing or invalid, replay any fixture and confirm zero CrabTrap activity rows.
3. With the feature on and config valid, replay one fresh signed fixture and confirm exactly one activity row with:
   - `activities.type='security_intrusion_detected'`
   - fixed Paddock-owned actor `crabtrap-adapter`
   - workspace/facility landing scope
   - bounded `data` fields only
   - adapter-derived `data.replay_key_hash`
4. Replay malformed, unsigned, stale, replayed, oversized, unsafe, unsupported-decision, and unsupported-method fixtures and confirm zero activity rows.
5. Inspect accepted activity data and rejection diagnostics for no raw/full URLs, headers, bodies, cookies, Authorization values, tokens, query secrets, provider payloads, raw actor IDs, user IDs, emails, signing material, raw secret hashes, matched secret substrings, or full audit rows.

## Scope-Control Validation

Run static checks:

```bash
pnpm guardrails
pnpm typecheck
pnpm lint
```

Record proof that the SPEC-011 diff contains none of the following:

- Schema migration or rollback SQL.
- Runtime route, webhook receiver, admin poller, custom sender, OpenAPI contract, or API-parity ignore.
- Scheduler, task-dispatch, task-chain, runner, sandbox, GitHub sync, task terminal mutation, or successor-selection behavior.
- UI panel, dashboard surface, notification fanout, default alert rule, or report surface.
- Raw CrabTrap audit persistence or raw sensitive request data persistence.

## Optional Deploy Evidence

Live official CrabTrap Docker evidence is optional. If an operator supplies it, record version/image tag, source shape, and why the source was safely reduced into the SPEC-011 summary contract. Do not treat live evidence as the required completion gate for this helper-only slice.
