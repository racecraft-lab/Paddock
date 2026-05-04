# Runbook: Ingest Rate Limit Exceeded

> Status: SPEC-008 T219 (FR-264a, FR-090l)

---

## 1. Symptom

- `quarantined_raw_events.reason='rate_limit'` rows accumulate for
  one source.
- `ingest_rate_state.state='rate_limited'`.

## 2. Impact

- That source's freshness lags until the offender backs off.

## 3. Diagnose

- Identify the source via `source_path`.
- Inspect the producer's emit rate.

## 4. Mitigate

- Throttle the producer or pause it.

## 5. Recover

- Once the producer drops below the limit, the rate state resets
  to `accepting`.

## 6. Validate

- No new `rate_limit` quarantine rows for 10 minutes.

## 7. Postmortem

- Update producer-side throttling if the spike was a misconfig.
