# Runbook: Ingest Rate Limit Exceeded

> Status: SPEC-008 T219 (FR-264a, FR-090l)

---

## 1. Symptom

- The ingest path rejects new payloads with `rate_limited`, and one source's
  `ingest_rate_state.state` remains `rate_limited`.
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

- No new `rate_limited` responses for 10 minutes, and the source's
  `ingest_rate_state.state` returns to `accepting`.

## 7. Postmortem

- Update producer-side throttling if the spike was a misconfig.
