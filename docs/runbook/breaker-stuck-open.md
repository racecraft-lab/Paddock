# Runbook: Breaker Stuck Open

> Status: SPEC-008 T156 / T163 / T182 (FR-022, FR-090l, FR-264)

---

## 1. Symptom

- `mc.governance.breaker_state` persists at `open` for > 30 minutes.
- Activity feed: `governance_circuit_breaker_chronic`.
- System Health card: **"Breaker open — chronic"** (red).

## 2. Impact

- Resource admission is halted in the affected scope.
- New decisions are deferred; tasks queue up in `pending_review`.

## 3. Diagnose

1. `GET /api/governance/breaker/state` for current state +
   `consecutive_errors` + `opened_at`.
2. Inspect the upstream errors from the activity feed
   (`evaluator_postcommit_dispatch_error`).
3. Confirm the chronic alert is not a false positive.

## 4. Mitigate

- If upstream is unhealthy, pause governance writers
  (`recovery_pause`).
- If upstream is healthy, prepare a manual reset.

## 5. Recover

1. Resolve the upstream cause.
2. Probe via
   `POST /api/governance/breaker/half-open-probe` to validate.
3. If probes succeed, the breaker self-recovers to `closed`.
4. If admin intervention is required, run
   `POST /api/governance/breaker/reset` with a typed reason.

## 6. Validate

- Breaker state returns to `closed` and stays for 1 hour without
  re-tripping.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-breaker-chronic.md`.
- Tune `breaker_open_max_seconds` if the trip threshold is too
  aggressive.
