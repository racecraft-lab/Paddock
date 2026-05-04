# Runbook: Ingest Payload Oversize

> Status: SPEC-008 T220 (FR-264a, FR-090l)

---

## 1. Symptom

- 413 payload_too_large from the OTLP receiver.
- `quarantined_raw_events.reason='oversized'` rows.

## 2. Impact

- Affected payloads are rejected; partial telemetry loss until the
  emitter is fixed.

## 3. Diagnose

- Inspect Content-Length on the rejected payload.
- Confirm against the configured cap (default 256 KiB compressed).

## 4. Mitigate

- Tell the emitter to chunk or compress more aggressively.

## 5. Recover

- Deploy emitter fix.

## 6. Validate

- No new oversized quarantine rows for 30 minutes.

## 7. Postmortem

- Update emitter docs if a cap value was undocumented.
