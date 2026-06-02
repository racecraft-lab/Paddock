# Observability Troubleshooting

Common issues encountered during SPEC-008 source bring-up. For each
symptom, see the recommended drilldown procedure.

## Source card stays red

**Symptom**: System Health subview shows the source heartbeat card
red after activation.

**Drilldown**:

1. Click the card to open the detail drawer.
2. Look at `last_heartbeat_at` and `last_event_at`. Compare to "now".
3. If `last_heartbeat_at` is null:
   - The source adapter has never registered. Confirm
     `source_emission_capability` row exists.
4. If `last_event_at` is older than `freshness_alert_seconds`:
   - The adapter is registered but stalled. Check the adapter
     process: SSH to the runtime, `tail` the source's log.
   - For `claude_code`, confirm `CLAUDE_CODE_ENABLE_TELEMETRY=1`
     in the agent's env.

## Reconciler stalled

**Symptom**: Raw events accumulating, canonical events not advancing.

**Drilldown**:

1. Check `governance_health_events` for `component='reconciler'` rows
   with `state='degraded'`.
2. Inspect `reconciler_lease` table — a stale lease means the previous
   reconciler crashed without releasing.
3. Force release: in the System Health subview, click "Reconciler
   retry" gesture; type the confirmation phrase; submit.

## Breaker stuck open

**Symptom**: Every dispatch returns `defer:breaker_open`.

**Drilldown**: see `docs/runbook/breaker-stuck-open.md`.

## Audit chain mismatch

**Symptom**: `governance_audit_verification_state.last_status='mismatch'`.

**Drilldown**: see `docs/runbook/audit-chain-mismatch.md`.

## OTLP body too large

**Symptom**: Receiver returns 413.

**Cause**: Body > 4 MiB. Configure the collector's batch size via
`otelcol-contrib` config:

```yaml
exporters:
  otlphttp:
    endpoint: https://paddock.example.org/api/otlp/v1
    sending_queue:
      enabled: true
      num_consumers: 4
      queue_size: 1024
    timeout: 10s
    compression: gzip
processors:
  batch:
    send_batch_size: 512
    send_batch_max_size: 1024
    timeout: 2s
```

## Drift detector escalates to hard-block

**Symptom**: Calibration progress bar shows "hard-block" tier.

**Drilldown**: the rebuilder is preparing a counter-rebuild job. Wait
for the progress bar to advance through "post-rebuild verify" and ack
the operator-confirmed dialog. See
`docs/runbook/counter-drift.md`.

## OpenClaw health card shows degraded

**Symptom**: System Health > OpenClaw card is amber/red.

**Drilldown**:

1. Confirm `FEATURE_OPENCLAW_HEALTH_COSTS` is ON for the workspace.
2. SSH to the operator node; verify `openclaw-gateway.service` is
   running (`systemctl --user status --no-pager openclaw-gateway.service`).
3. Inspect the gateway log for OTel-export failures.
4. For gateway deployment and connectivity recovery, see
   `docs/deployment.md#docker-gateway-unreachable--websocket-not-connecting`
   and the OpenClaw node notes in `AGENTS.md`.
