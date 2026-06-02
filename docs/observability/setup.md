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
- Migrations M65a..m + M66 complete (run `pnpm migrate` if unsure).
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

The OTLP receiver lives at `POST /api/otlp/v1/{traces|metrics|logs}`.

Auth: bearer-token check against `agent_api_keys` rows scoped
`role='collector'`. Body cap: 4 MiB per request.

Test ingest with a curl POST:

```bash
curl -X POST "$MC_URL/api/otlp/v1/metrics" \
  -H "Authorization: Bearer $COLLECTOR_API_KEY" \
  -H "Content-Type: application/x-protobuf" \
  --data-binary "@.data/test/sample-metric.bin"
```

Expect `204 No Content` on success.

For full receiver semantics see `docs/observability/otlp-receiver.md`.

## Source adapter activation

Each adapter writes `source_emission_capability` rows on first run.
Adapters live under `src/lib/observability/adapters/`. To activate
a source:

| Source | How to start |
| --- | --- |
| `claude_code` (native OTel) | `CLAUDE_CODE_ENABLE_TELEMETRY=1 claude -p ...` |
| `claude_code.transcript_replay` | enabled when `claude mcp serve` is the child process |
| `cli_stdout_json` (Codex) | streams via the dispatcher's session writer |
| `copilot.events_jsonl` | `events.jsonl` shipped under `~/.copilot/` |
| `gateway_otel` (OpenClaw) | gateway forwards OTel frames to `/api/otlp` |
| `manual_post` | `POST /api/governance/usage-events` (operator-curated) |
| `provider_quota` | nightly pull from provider billing API |

Operator setup notes per CLI:

- **Claude Code** (`docs/observability/setup-claude-code.md`).
- **Codex CLI** (`docs/observability/setup-codex-cli.md`).
- **Copilot** (`docs/observability/setup-copilot.md`).
- **Ollama** (`docs/observability/setup-ollama.md`).
- **LM Studio** (`docs/observability/setup-lm-studio.md`).
- **OpenClaw gateway** (`docs/observability/setup-openclaw.md`).

Each per-CLI guide lives in this directory and is referenced by the
quickstart.

## Verify canonical events

Within ~ 5 minutes of activation the reconciler should produce
canonical rows. Sanity-check via the System Health subview at
`/cost-tracker?tab=governance&sub=system-health` — the source's
heartbeat card should be green and freshness < 60s.

## Troubleshooting

If the source remains red, see
`docs/observability/troubleshooting.md`.
