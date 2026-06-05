# Observability Setup — SPEC-008 Resource Governance

This guide walks operators through:

1. Enabling `FEATURE_RESOURCE_GOVERNANCE` for a workspace.
2. Standing up the OTLP receiver.
3. Activating per-source telemetry adapters.
4. Verifying canonical event ingestion.

## Prerequisites

- Paddock >= the SPEC-008 merge SHA.
- `governance.json` present at `<PADDOCK_DATA_DIR>/governance.json`.
  The default is auto-seeded from
  `src/lib/observability/governance.json.template`.
- Migrations M65a..m + M66 complete. Paddock runs
  `src/lib/migrations.ts` during database initialization; verify the
  `schema_migrations` table if you need to confirm a running database.
- `resource_governance_breaker` row present (the breaker writer
  initializes it on first evaluator call).

## Enable the workspace flag

```bash
curl -X PATCH "$MC_URL/api/feature-flags/FEATURE_RESOURCE_GOVERNANCE" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": <id>, "value": true, "reason": "Spec-008 enablement"}'
```

Confirm activation:

```bash
curl "$MC_URL/api/feature-flags?workspace_id=<id>" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  | jq '.flags.FEATURE_RESOURCE_GOVERNANCE'
```

## OTLP receiver

The OTLP receiver lives at `POST /api/otlp/v1/{traces|metrics}`.

Auth: bearer-token/session check with at least operator role. Body caps:
256 KiB compressed request body and 1 MiB decompressed payload.

Test ingest with a curl POST:

```bash
curl -X POST "$MC_URL/api/otlp/v1/metrics" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/x-protobuf" \
  --data-binary "@.data/test/sample-metric.bin"
```

Current decoder status: `@opentelemetry/otlp-transformer` is not installed,
so authenticated protobuf requests return `503 decoder_unavailable` until the
stub in `src/lib/observability/otlp-decoder.ts` is replaced. After the decoder
lands, expect the receiver to return an OTLP partial-success JSON body with
HTTP 200 on accepted payloads.

The receiver implementation lives in
`src/lib/observability/otlp-receiver.ts`, with route handlers under
`src/app/api/otlp/v1/` and decode/admission coverage in
`tests/integration/governance-otlp-receiver*.test.ts`.

## Source adapter activation

Each adapter writes `source_emission_capability` rows on first run.
Adapters live under `src/lib/observability/adapters/`. To activate
a source:

| Source | Current repo evidence |
| --- | --- |
| `native_otel` (Claude Code native OTel) | `CLAUDE_CODE_ENABLE_TELEMETRY=1 claude -p ...` |
| `claude_transcript` | enabled when `claude mcp serve` is the child process |
| `codex_stdout` | streams via the dispatcher's session writer |
| `copilot_events` | `events.jsonl` shipped under `~/.copilot/` |
| `openclaw_gateway` | reads `~/.openclaw/health/` artifacts when `FEATURE_OPENCLAW_HEALTH_COSTS` is enabled |
| `manual_post` | adapter source exists for future/manual replay pipelines; the current `POST /api/tokens` route stores token records directly |
| `provider_quota` | registered advisory source id; no operator-facing fetch route is checked in |

No per-CLI setup guides are currently checked in. Use this file, the adapter
source under `src/lib/observability/adapters/`, and
`docs/observability/provider-tos-considerations.md` for adapter ToS and
acknowledgement details until a future spec adds dedicated setup pages.

## Verify canonical events

Within ~ 5 minutes of activation the reconciler should produce
canonical rows. Sanity-check via the System Health subview at
`/cost-tracker?tab=governance&sub=system-health` — the source's
heartbeat card should be green and freshness < 60s.

## Troubleshooting

If the source remains red, see
`docs/observability/troubleshooting.md`.
