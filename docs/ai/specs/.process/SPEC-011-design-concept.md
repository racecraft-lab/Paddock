---
spec_id: "SPEC-011"
title: "CrabTrap Honeypot Adapter"
mode: "setup"
date: "2026-06-24"
interview: "Grill Me"
question_count: 5
status: "complete"
stop_reason: "natural"
---

# Design Concept: SPEC-011 CrabTrap Honeypot Adapter

Source roadmap: `docs/ai/rc-factory-technical-roadmap.md`, Phase 7.5.

SPEC-011 adds an optional, absent-safe CrabTrap adapter for bounded security
evidence. The roadmap calls this a honeypot adapter, but live source research
found that the official Brex CrabTrap project is an outbound HTTP/HTTPS agent
proxy, not an inbound firewall. It records audit decisions, exposes an admin
API and metrics, and supports denial alerting. The public docs do not define a
generic webhook delivery contract for external systems.

Because the official contract is not a webhook API, this setup keeps the first
Paddock slice library-first and strict-scope. The implementation should create
the adapter boundary, normalize safe denial-summary fixtures, and write bounded
activity evidence only when the feature flag and config are valid. Any runtime
HTTP intake route, polling path, or CrabTrap custom sender integration must be
settled during Clarify before implementation expands beyond the roadmap's
strict scope.

## External Context Retrieved

Retrieved on 2026-06-24:

- Official repository: `https://github.com/brexhq/CrabTrap`
- Official README: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/README.md`
- Official quickstart: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/QUICKSTART.md`
- Official design document: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/DESIGN.md`
- Official alerting document: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/docs/alerting.md`
- Official config reference: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/config/gateway.yaml.example`

Key source-backed findings:

- CrabTrap is an outbound HTTP/HTTPS proxy between AI agents and external APIs.
- Audit decisions are logged to PostgreSQL and can include sensitive request
  details, so Paddock must not persist raw headers, bodies, cookies, tokens, or
  full audit rows.
- CrabTrap docs explicitly say it is not an inbound firewall or WAF.
- Denial alerting exists, including Slack and custom sender extension points,
  but no public generic webhook payload contract was found.
- The admin API exposes audit and user/policy surfaces, but SPEC-011 should not
  add polling or admin API coupling unless Clarify explicitly approves it.

## Goals

- Add an optional CrabTrap adapter boundary in `src/lib/crabtrap-adapter.ts`.
- Keep `FEATURE_CRABTRAP_HONEYPOT=false` behavior as a complete no-op.
- Normalize bounded denied-request or alert summaries into safe activity data.
- Write `activities.type='security_intrusion_detected'` only after feature flag,
  config, payload shape, signature, replay, size, and unsafe-field checks pass.
- Reject malformed, unsigned, stale, replayed, oversized, or unsafe payloads
  without writing activity evidence.
- Cover flag-off, missing-config, valid fixture, malformed fixture, signature,
  replay, and unsafe-field behavior with focused tests.
- Provide human validation steps that replay valid and malformed signed
  fixtures and inspect activities; live CrabTrap Docker evidence is optional.

## Non-goals

- No schema migration.
- No OpenAPI contract change.
- No scheduler, task-dispatch, task-chain, runner, sandbox, or harness launch
  dependency.
- No public or generic inbound CrabTrap webhook contract unless Clarify proves
  the operator owns that contract and it remains out of OpenAPI.
- No live GitHub mutation, task terminal mutation, notification fanout, or
  auto-remediation.
- No raw CrabTrap audit row, header, body, cookie, token, query-secret, or
  provider payload persistence.
- No dedicated honeypot panel or new dashboard.
- No requirement to run official CrabTrap Docker for local completion.

## Key Decisions

| Question | Decision |
|---|---|
| Q1 Intake surface | Use a library-first adapter boundary. Validate normalized CrabTrap alert/audit payload fixtures in `src/lib/crabtrap-adapter.ts`; leave any Paddock webhook route as a Clarify decision because official docs do not publish a generic webhook contract. |
| Q2 Payload shape | Normalize denial-summary payloads first: actor, method, URL host/path, decision, reason, timestamp, source id, and safe hashes/counts. Do not store raw request/response headers or bodies. |
| Q3 Config policy | Fail closed. `FEATURE_CRABTRAP_HONEYPOT=true` and valid adapter config are required before any event can produce activity evidence. Flag off or missing config records no activity. |
| Q4 Evidence surface | Activities only. Write bounded `security_intrusion_detected` rows and rely on existing activity inspection surfaces. Do not add schema, OpenAPI, or a new UI panel. |
| Q5 Validation and UAT | Require signature plus bounds for any runtime intake: shared-secret/HMAC-style signature, timestamp/replay/size checks, and unsafe-field rejection. Human validation uses valid/malformed signed fixture replay, flag-off proof, and missing-config no-op proof. Live CrabTrap Docker is optional evidence. |

## Suggested Payload Contract

The adapter should operate on a Paddock-owned normalized event shape, not a raw
CrabTrap database or admin API row:

```json
{
  "source": "crabtrap",
  "event_id": "ct-denial-123",
  "occurred_at": "2026-06-24T00:00:00Z",
  "actor": "agent@example.com",
  "decision": "deny",
  "method": "POST",
  "url_host": "api.github.com",
  "url_path": "/repos/example/project",
  "reason": "policy_denied",
  "request_hash": "sha256:...",
  "denial_count": 1
}
```

The final shape belongs to Clarify. The important setup boundary is that
payloads are summaries and safe references only. If implementation needs to
consume official admin API audit entries or custom sender bodies, Clarify must
document the mapping and confirm that unsafe fields are rejected or reduced to
hashes before persistence.

## Implementation Boundaries

- Keep the primary production module to `src/lib/crabtrap-adapter.ts`.
- Reuse existing `resolveFlag` behavior for `FEATURE_CRABTRAP_HONEYPOT`.
- Reuse existing database/activity helpers instead of adding persistence.
- Keep tests focused near existing `src/lib/__tests__/` patterns.
- Keep static guardrails aligned with `scripts/check-guardrails.mjs`, which
  currently treats CrabTrap as SPEC-011-owned.
- Do not update OpenAPI unless Clarify explicitly chooses a route and records
  an approved split from strict scope.

## Clarify Targets

- Whether implementation should remain helper-only or add a private route that
  is intentionally excluded from OpenAPI.
- Exact signature scheme, header names, timestamp tolerance, replay key, and
  max payload size for future runtime intake.
- Exact normalized payload fields and which raw CrabTrap fields are forbidden.
- Whether `activities` rows should be workspace scoped, project scoped, or
  global/facility scoped when no task/project is implicated.
- Whether existing activity inspection is sufficient for "activities/alerts" or
  whether a follow-up issue should own notification fanout.
- Whether live Docker CrabTrap evidence is useful optional UAT or should remain
  a deploy-note only until a real integration route exists.
