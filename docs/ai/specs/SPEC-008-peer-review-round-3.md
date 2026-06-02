---
review: SPEC-008 — Peer Review Round 3 (Security + Compliance)
reviewer_lens: security, compliance, supply chain, audit/regulator-explainability
reviewed_at: 2026-05-02
target_doc: docs/ai/specs/SPEC-008-design-concept.md
prior_reviews:
  - 4 RepoPrompt oracle adversarial rounds (60 fixes applied; Q1–Q59)
  - Peer review #1 (distributed systems / threat model gaps)
  - Peer review #2 (SRE / runbook / DR)
verdict: BLOCK until 3 P0s addressed inline; P1s should-fix before Plan phase
---

# SPEC-008 — Peer Review Round 3 (Security + Compliance)

## Frame

Paddock is open-source, runs single-node, and SPEC-008 wires *billing-relevant* numbers (USD spend, token counts, override grants) into a synchronous adpaddock path. The prior four oracle rounds plus two peer reviews drove the engineering correctness very hard. They did **not** push on "what would I be uncomfortable explaining to a regulator, an auditor, or a security team reading this on GitHub before deciding to deploy it." That is this review's only angle.

Items already covered by prior reviewers are intentionally NOT re-flagged here: threat-model categorization (Q41), ingest rate limiting (Q47), retention growth (Q43), DR/backup (Peer #2), distributed correctness (rounds 2/3).

## Top 3 P0 Blockers

| # | Lens | Q-section to revise | One-line diff |
|---|---|---|---|
| **P0-1** | PII / prompt-content redaction | New Q60 (cross-cuts Q18, Q47, Q48) | Telemetry MUST drop content-bearing attributes by default; only an explicit operator opt-in stores them; `payload_excerpt` and journal mirroring redact before write. |
| **P0-2** | REST authorization for `/api/resource-overrides`, `/api/resource-policies` | Q9 (revise) + new Q61 | Define the auth contract (session vs API key vs Aegis service token), per-actor rate limit, CSRF posture, and authorization-before-parsing order. Bundle Lens 1 + 5 + 11. |
| **P0-3** | Audit-log tamper-evidence + retention chain integrity | Q17 + Q26 + Q43 (revise as a unit) | App-layer "append-only" is not a regulator answer. Add a hash-chain (or `prev_id`+`row_hmac`) to `resource_budget_ledger`, and align `canonical_usage_events`/`raw_usage_events` retention so the drilldown evidence chain matches the 5-year ledger window. |

## Top 5 P1 Should-Fix

| # | Lens | Q-section | Diff |
|---|---|---|---|
| **P1-1** | Secret handling in `provider_accounts.config_json` | Q15 + Q41 | Schema-mark fields as `secret`; encrypt at rest with a key resolved from 1Password (CLAUDE.md pattern); redact in REST responses; never log. |
| **P1-2** | Provider Terms-of-Service posture | New Q62 (or Q15 subsection) | Per-provider ToS table for each reverse-engineered or undocumented surface (`copilot_internal/user`, VS-Code-spoofed headers, rollout-JSONL parsing). Default disabled for any surface flagged "ToS unclear"; operator must opt-in with acknowledgement. |
| **P1-3** | Supply-chain pinning + provenance | Open Question #4 + new Q63 | Pin `otelcol-contrib` by version + checksum + signing-key; SBOM for new deps; document `J-Bax/copilot-token-tracker` as **schema reference only — no code copy** with license evidence. |
| **P1-4** | Logging / journal redaction | Q47 + Q48 | All log paths (`payload_excerpt`, schema-broken parse failures, reconciler errors, health events) MUST run a content-redacting filter before write. |
| **P1-5** | License compatibility for MC public release | New Q64 (one-paragraph) | Confirm MC's own license, then validate `@opentelemetry/otlp-transformer` (Apache-2.0), `better-sqlite3` (MIT), Node (MIT), `racecraft-lab/openclaw` (verify), and `J-Bax/copilot-token-tracker` (verify). Block any AGPL ingestion. |

---

## Per-lens deep dive

### P0-1 — PII / prompt-content exfiltration via telemetry (Lens 4 + Lens 14)

**Where the doc is silent.** `raw_usage_events.raw_attributes_json` (Q18) is "verbatim per-source payload." The ingestion adapters listed in Q16 cover Claude Code native OTel, Codex stdout, Copilot `events.jsonl`, OpenClaw gateway OTel — every one of which can carry **content** depending on the operator's collector configuration. Specifically:

- Claude Code's native OTel emits `claude_code.user_prompt` events when `OTEL_LOG_USER_PROMPTS=1`; the operator-facing setup doc (`docs/observability/claude-code-telemetry-setup.md` per Q-strict-scope) is what the operator will read, and there is no current language warning that this flag exfiltrates conversation content into MC's SQLite.
- Anthropic GenAI semconv (`gen_ai.client.operation.duration`, `gen_ai.prompt`, `gen_ai.completion`) is enumerated in the OTel attribute registry. If the operator's collector forwards `gen_ai.prompt` events, they land in `raw_attributes_json` as plaintext.
- Q47's `quarantined_raw_events.payload_excerpt` literally documents storing "first 1KB of rejected payload" — exactly the case where a parser failed and the payload may contain *anything*, including unredacted prompt text. This is then surfaced to operators in the UI per Q47.
- Q48 says "Stderr/journal logging mirrors all health events — operator can `journalctl -u paddock.service`". Health events include "schema_broken" details which today read raw payload fragments.

**Why this is P0, not P1.** Prompt content is the single most sensitive thing an LLM agent platform ever touches. An operator who ships SPEC-008 unchanged, then enables `OTEL_LOG_USER_PROMPTS=1`, ends up with prompt text in `raw_attributes_json`, `payload_excerpt`, `journalctl`, and any third-party log shipper. Regulator-explainability nightmare.

**Required fix — new Q60 "Telemetry content redaction policy":**

1. Define a default-deny **attribute allowlist** for `raw_attributes_json` ingestion. Only attributes listed in `src/lib/observability/attribute-allowlist.ts` are stored; everything else is dropped at the adapter (NOT redacted-then-stored — dropped). Initial allowlist is the structural counters: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.model`, `claude_code.cost.usage`, `request_id`, `prompt.id`, `session_id`, durations, status codes. Explicitly NOT on the allowlist: `gen_ai.prompt`, `gen_ai.completion`, `claude_code.user_prompt`, `claude_code.tool_decision.input`, anything labeled `body`, `content`, `text`, `message`.
2. Operator opt-in to widen the allowlist is a per-workspace feature flag `governance_capture_content` (default OFF) plus an explicit click-through warning in the setup doc.
3. `quarantined_raw_events.payload_excerpt` is replaced by `payload_redaction_metadata` that records *byte length, parser error, schema version expected* — never the bytes themselves. If the operator needs the bytes for debugging, they must rerun ingest with `governance_capture_content=true`.
4. `governance_health_events.detail` and `metric_json` (Q48) get the same treatment. Stderr/journal mirror runs through the same redactor.
5. Acceptance criterion: a ChatGPT-Pro session that sends a prompt containing the literal string "SSN 123-45-6789" must result in **zero rows** in any MC table where that string appears, with `governance_capture_content=false`. Verified by integration test.

Mechanical to add (single redaction module + allowlist + opt-in flag); essential for any data-handling audit conversation.

---

### P0-2 — REST authorization model is undefined (Lens 1 + Lens 5 + Lens 11 bundled)

**Where the doc is silent.** Q9 reads in full:

> Override grants validated against operator session OR Aegis service token. Read endpoints scoped through `resolveFlag(name, ctx)` so flag-OFF returns empty arrays.

That is the entire specification of authorization for endpoints that:
- Grant overrides that consume up to a daily budget ceiling (`/api/resource-overrides`).
- Mutate enforcement policies (`/api/resource-policies`).
- Trigger counter rebuilds (`POST /api/resource-budget-counters/rebuild`, Q40; `governance_rebuild_jobs`, Q49).
- Bulk-promote policies from shadow → soft → hard (Q56).

Things the doc does not specify:

- **Authentication mechanism.** "Operator session" — cookie via NextAuth? Bearer? `MC_API_KEY`? CLAUDE.md has `MC_API_KEY` (MCP) and `AUTH_PASS` (seed); Q9 conflates them. Browser/MCP/Aegis-as-service are three distinct paths; none defined.
- **Authorization order.** Q41 Zod validation runs on the parsed body — too late. Auth must precede body parsing and any logging.
- **CSRF.** Not mentioned; required for browser session origin.
- **Per-actor rate limiting (Lens 5).** Q47 rate-limits **ingest**, not REST. A compromised session can grant 1000 overrides in 60s, each atomically debiting the daily ceiling. Q6's "5 concurrent grants for the last $1" AC tests correctness, not abuse resistance.
- **REST DoS (Lens 11).** Same gap. Authenticated traffic at line rate exhausts budget.
- **Aegis service-token model.** Named but undefined: lifetime, storage, rotation, scope.

**Required fix — revise Q9 and add Q61 "REST authorization + per-actor rate limit":**

1. Enumerate the three actor classes and the auth proof each carries:
   | Actor | Auth proof | Allowed routes |
   |---|---|---|
   | Operator (browser) | session cookie + CSRF token | full CRUD on policies, overrides, rebuild jobs, bulk-promote |
   | Operator (CLI / MCP) | `MC_API_KEY` header | full CRUD; no CSRF (token is the proof) |
   | Aegis service | scoped service token in `provider_accounts.config_json` (encrypted per P1-1) | only `aegis_break_glass=false` overrides for its own workspace; never policy mutation |
2. Authorization middleware runs **before** Zod validation, before JSON parse beyond size cap, before any logging that would include body. 401/403 responses include only the request id, never echo the body.
3. Per-actor token-bucket rate limit (separate from Q47 ingest limits): operator session = 60 mutations/min, sustained 600/hour; Aegis service token = 10 overrides/min, sustained 60/hour. Exceeding triggers 429 + `governance_rest_rate_limited` activity.
4. Override-grant abuse detection: if a single actor grants > X overrides in 5 min OR consumes > 50% of daily ceiling via override in 24h, fire `governance_override_grant_anomaly` critical alert. This is the regulator-friendly "we detected unusual override activity" trail.
5. `/api/resource-overrides` POST body cap = 8KB; reject with 413 before parsing.
6. CSRF: SameSite=strict cookie + double-submit token for browser session origin; CLI/MCP path uses Authorization header so CSRF N/A.

Q41's threat-model table currently lists "SQL injection" and "XSS" but not "authorization bypass" or "REST DoS" — Q61 should append both.

---

### P0-3 — Audit log tamper-evidence + retention chain integrity (Lens 2 + Lens 15)

**Where the doc is silent.** "Append-only" is application convention only — code calls INSERT. But anyone with SQLite file access (root on host, stolen `mc.db`, coerced operator) can `UPDATE resource_budget_ledger SET amount_cost_usd = 0 WHERE ...` undetectably.

Q43 retention: ledger = 5 years (good), `canonical_usage_events` = 1 year, `raw_usage_events` = 90 days. Q26 promises drilldown "ledger row → canonical events → raw events". At year 1 day 91, raw evidence is gone; at year 2, canonical is gone. The 5-year ledger is preserved but the **provenance chain that makes it auditable is severed**.

Regulator asking "show me how this $5,000 was spent in March 2026" in March 2028 gets ledger rows without the provider-side counters that justified them — exactly the integrity-of-evidence problem SOC 2 CC7.2 / ISO 27001 A.12.4 prevent.

**Required fix — revise Q17 + Q26 + Q43 as one unit:**

1. **Hash-chain on ledger.** Add columns to `resource_budget_ledger`:
   ```sql
   ALTER TABLE resource_budget_ledger ADD COLUMN prev_id INTEGER;
   ALTER TABLE resource_budget_ledger ADD COLUMN row_hash TEXT NOT NULL;  -- SHA-256 over (prev row_hash || canonical-serialized columns)
   ```
   On INSERT, compute `row_hash` from the prior row's `row_hash` plus the canonical serialization of the new row's content columns. A periodic job (daily, on the audit connection per Q29) walks the chain end-to-end and emits `governance_ledger_chain_break` if any link fails. This makes silent UPDATE/DELETE tamper-evident: an attacker who changes a row must rewrite every hash forward, which is detectable on next walk and impossible without write access to the chain head, which the verification job snapshots.
2. **Optional external attestation.** Nightly cron writes chain head `(max_id, row_hash, walked_at)` to `<DATA_DIR>/audit/ledger-attestation.jsonl`, included in backups. v2 hardening if Plan deems out-of-scope.
3. **Retention chain alignment.** Pick one:
   - (a) `canonical_usage_events` retention = ledger retention (5 years) — accept storage cost; OR
   - (b) On canonical purge, write a `canonical_audit_summary` row per ledger entry capturing `(canonical_event_id, source_authoritative, raw_hash, totals)` and retain 5 years. Drilldown becomes ledger → summary → "evidence purged YYYY-MM-DD".
4. **Q26 `coalesced_canonical_event_ids`** — when contributing canonical events are purged, the JSON array becomes dangling IDs. Diagnostic UI (Q44, Q54) must render "evidence purged" instead of "lookup failed".
5. **Operator manual ledger edits** (Q40 "forbidden but possible", auto-repair No) — with the hash-chain, become *detectable*; promote to critical alert.

---

### P1-1 — Secret handling in `provider_accounts.config_json` (Lens 13)

`provider_accounts.config_json` (Q15) is a free-form JSON blob per provider account. Operators will store API keys, OAuth tokens, gateway tokens. Q41 limits it to 10KB and validates per-provider schema — structural, not security. The doc's secret-handling guidance (CLAUDE.md "resolved from 1Password at startup") applies to `MC_API_KEY`/`AUTH_SECRET`/`OPENCLAW_GATEWAY_TOKEN`, not `config_json`.

**Required fix — Q15 amendment + Q41 amendment:**

1. Schema declares per-provider which keys in `config_json` are secret. Secrets are stored encrypted with a key derived from `MC_AUTH_SECRET` (already present per CLAUDE.md) using AES-GCM. Decrypt happens only at use site, never at API response time.
2. `GET /api/provider-accounts` and `GET /api/resource-policy-events` redact secret fields to `"<redacted>"`.
3. Stderr/journal/log paths never include `config_json`; the redactor (P1-4) covers this.
4. Operator must rotate via `POST /api/provider-accounts/<id>/rotate-secret` which audits the rotation.

This also satisfies the implicit requirement in CLAUDE.md "Avoid data exfiltration — must not share secrets unless the user has explicitly authorized both that specific secret and its destination."

---

### P1-2 — Provider Terms-of-Service posture (Lens 7)

The doc cites Anthropic's "OpenClaw-style Claude CLI usage allowed" line for Claude Max 20x. No parallel statement for:

- **Codex rollout-JSONL parsing.** Local files, but using them for *automated enforcement* on a paid ChatGPT Pro subscription touches OpenAI's "no automated systems / no reverse engineering" terms.
- **GitHub `copilot_internal/user` polling** with VS-Code-spoofed headers (Q15.5). Endpoint name contains `_internal` — reverse engineering. Q15.5 says "advisory-only" but doesn't require operator opt-in with acknowledgement.
- **Codex `auth.json` reading** (Q15 priority #2). Smaller risk; worth flagging.

**Required fix — new Q62 "Provider ToS surface table"** with one row per externally-reverse-engineered surface:

| Surface | Risk class | Default state | Operator opt-in flow |
|---|---|---|---|
| OpenClaw-mediated Claude OTel | sanctioned | enabled | none |
| Claude Code transcript replay | local files; sanctioned per Anthropic statement | enabled | none |
| Codex rollout JSONL parse | local files; ToS unclear | **disabled** | `governance_codex_rollout_parse=true` per workspace + click-through |
| Codex `auth.json` read | local OAuth artifact | enabled (low-risk read) | none |
| Copilot `events.jsonl` parse | local files; reverse-engineered schema | **disabled** | `governance_copilot_events_parse=true` + ack |
| Copilot `copilot_internal/user` poll | undocumented endpoint + spoofed headers | **disabled** | `governance_copilot_internal_poll=true` + ack |
| OpenAI `wham/usage` web-UI scrape | already a Non-Goal | n/a | n/a |

Makes operator consent explicit and gives MC clear footing in any provider conversation.

---

### P1-3 — Supply-chain pinning + provenance (Lens 3)

Open Question #4 ("otelcol-contrib v0.108.x minimum") is a floor, not a pin. For a `--user` systemd binary, spec needs: exact version + SHA-256 checksum + signing-key fingerprint + signature-verify curl example + Plan-phase SBOM task (syft) with quarterly CVE check.

`J-Bax/copilot-token-tracker` is referenced as canonical schema source. Doc must state: schema reference only (no vendored code); license verified (likely MIT — confirm); pinned commit SHA so future repo changes don't silently shift MC's interpretation.

**Required fix — new Q63 + amend Open Question #4.**

---

### P1-4 — Logging / journal redaction (Lens 14)

Bundles with P0-1 but separate because surfaces are operator-facing not DB-resident: `quarantined_raw_events.payload_excerpt` (Q47); `governance_health_events.detail`/`metric_json` (Q48) mirrored to journal; `raw_usage_events.reconcile_last_error` (Q24); `governance_telemetry_schema_unsupported` (Q25, Q37) parse errors that quote offending JSON; adapter-level `console.error` calls.

**Required fix — Q47/Q48 amendment + Q14 convention:** single `src/lib/observability/redact.ts` with the P0-1 allowlist; every log path runs through it; vitest fixture greps the codebase for a marker string after ingest with `governance_capture_content=false` and asserts zero hits.

---

### P1-5 — License compatibility (Lens 6)

The design concept doesn't name MC's own license. Spec inherits from `racecraft-lab/openclaw` (verify), depends on `@opentelemetry/otlp-transformer` (Apache-2.0), `better-sqlite3` (MIT), Node (MIT), references `J-Bax/copilot-token-tracker` (verify). If any dep flips AGPL — Langfuse v3 (rejected stack) is AGPL — MC would be forced into AGPL.

**Required fix — new Q64:** confirm MC LICENSE; Plan adds `license-checker` CI gate failing on AGPL/SSPL; document J-Bax + OpenClaw reference posture.

---

## Lenses I considered and dropped

- **Lens 8 (GDPR specifically).** Operator is the data controller for a self-hosted tool; SPEC-008 doesn't ship to EU operators differently. Once P0-1 (content redaction) is fixed, the residual GDPR exposure is operator-side: agent-name and session-id may be personal data if the operator is the only user. One sentence in Q60 noting "operators in regulated jurisdictions should review their workspace's data inventory" is enough.
- **Lens 9 (HMAC/signed override grants).** Single-process, no remote-attacker model in v1. Mention as v2 hardening once REST is exposed beyond localhost.
- **Lens 10 (side-channel timing).** Sub-25ms admission timing leaking budget state is theoretical for an internal API on an operator's own host. Skip.
- **Lens 12 (SAST mandate).** Belongs in CI config, not the design concept. Plan can adopt semgrep without a Q-section change.

## Verdict

**Block until the 3 P0s are addressed inline.** Engineering correctness has been hammered into solid shape over four oracle rounds plus two peer reviews. The security/compliance posture is not at the same maturity level — and these are exactly the items raised by a security-conscious GitHub reader (P0-1, P1-2), a regulator asking about year-2 spend evidence (P0-3), and a red-team probing `/api/resource-overrides` (P0-2).

Each P0 maps to a small fix: P0-1 is one redactor + allowlist + opt-in flag; P0-2 is one auth middleware + rate-limit table + CSRF statement; P0-3 is `prev_id`+`row_hash` columns + chain-walk job + one retention-alignment decision. Implementation cost is modest; audit-defensibility benefit is large.

With P0s inline as Q60/Q61 plus revisions to Q9, Q17, Q26, Q43 (and P1s as Q62/Q63/Q64 plus amendments to Q15, Q41, Q47, Q48), this spec is approve-able for Plan phase.

## Mechanical to-do for the doc-amender

1. Insert new **Q60 — Telemetry content redaction policy** (P0-1) with attribute allowlist + `governance_capture_content` flag + `payload_redaction_metadata` replacement of `payload_excerpt` + integration test AC.
2. Revise **Q9** to reference Q61; insert new **Q61 — REST authorization + per-actor rate limit** (P0-2) with the actor/auth-proof table, auth-before-parse ordering, CSRF posture, per-actor token bucket, override-anomaly detection.
3. Amend **Q17** to add `prev_id` + `row_hash` columns + chain-walk job (P0-3a). Amend **Q26** to acknowledge retention-purged provenance UX (P0-3c). Amend **Q43** to align canonical/raw retention with ledger retention OR add `canonical_audit_summary` table (P0-3b).
4. Amend **Q15** to mark `config_json` secret fields + AES-GCM encryption + redacted REST responses (P1-1). Amend **Q41** threat-model table to add "authorization bypass" and "secret leak via REST response."
5. Insert new **Q62 — Provider ToS surface table** (P1-2) with default-disabled flags for reverse-engineered surfaces.
6. Insert new **Q63 — Supply-chain pinning** (P1-3); amend Open Question #4 to point at Q63.
7. Amend **Q47/Q48** with redaction module reference (P1-4); add CI grep test in **Q14**.
8. Insert new **Q64 — License compatibility** (P1-5) with license-checker CI gate.
