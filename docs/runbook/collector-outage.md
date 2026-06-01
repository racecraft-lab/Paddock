# Runbook: Collector Outage

> Status: SPEC-008 T209 (FR-264, FR-090l)
>
> Page on: governance_health_events `collector_unavailable` sustained > 90s.

---

## 1. Symptom

- `mc.governance.collector_uptime` drops below 99 % over a 5-minute window.
- `mc.governance.evaluator_postcommit_dispatch_error` rate > 1/min.
- System Health pill: **"Collector: unavailable"**.
- Activity feed shows `governance_health_event{kind:'collector_unavailable'}`.

## 2. Impact

- Resource decisions still flow (evaluator is the system of record),
  but real-time observability lags by the collector outage duration.
- Diagnostic UI may show stale `captured_at` values.
- Backfill needed once the collector recovers (FR-114a).

## 3. Diagnose

1. Check `journalctl --user -u otelcol -n 200`.
2. Verify `/api/governance/system-health` for collector severity.
3. Inspect `governance_health_events` table for the
   originating event payload.
4. Confirm the OTLP receiver is reachable: `curl -fsS
   http://127.0.0.1:4318/v1/health` (or the configured port).

## 4. Mitigate

- Restart the collector: `systemctl --user restart otelcol`.
- If the unit will not start, fall back to the embedded receiver
  (`OTLP_USE_EMBEDDED_RECEIVER=1`) and reload Paddock.
- Throttle dashboard polling to 30s during the outage.

## 5. Recover

- After the collector returns, run the backfill window from
  `governance_health_events.captured_at` of the first
  `collector_unavailable` event to now (FR-114a).
- Verify the
  `governance_health_event{kind:'collector_recovered'}` is emitted.

## 6. Validate

- `mc.governance.collector_uptime` returns to 100 % over a 5-minute
  rolling window.
- Diagnostic UI `captured_at` lag falls below 10s.
- No new `collector_unavailable` events for 30 minutes.

## 7. Postmortem

- Capture root-cause notes under
  `docs/postmortems/<YYYY-MM-DD>-collector-outage.md`.
- File a bug if the unit auto-restart loop did not converge.
- Update this runbook if a recurring failure mode emerges.
