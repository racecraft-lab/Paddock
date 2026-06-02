# Runbook: Reconciler Stall

> Status: SPEC-008 T210 (FR-264, FR-114a, FR-090l)

---

## 1. Symptom

- `mc.governance.reconciler_lag_seconds` > 600s sustained.
- Activity feed: `governance_reconciler_health_degraded`.
- `reconciler_lease` rows show stale `acquired_at` heartbeats.

## 2. Impact

- Window materialization falls behind, so policy enforcement may
  reference an out-of-date current window.
- Backfill jobs queue up; severity escalates if lag > 1h.

## 3. Diagnose

1. `pnpm mc events watch --types reconciler` for live stream.
2. Inspect `reconciler_lease` rows; orphan a stuck leaseholder.
3. Check the foreground DB pool for blocked writers
   (`PRAGMA busy_timeout`).

## 4. Mitigate

- Release the stale lease: `DELETE FROM reconciler_lease WHERE
  acquired_at < datetime('now','-15 minutes');`
- Restart the reconciler worker: `systemctl --user restart
  paddock` (or `pnpm mc workers restart reconciler`).

## 5. Recover

- Trigger a one-shot catch-up via
  `POST /api/governance/system-health/rebuild` with reason
  `reconciler-stall-recovery`.

## 6. Validate

- `reconciler_lag_seconds` returns < 60s within 10 minutes.
- `governance_reconciler_health_recovered` event fires.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-reconciler-stall.md`.
- Tighten alert thresholds if the lag was below the previous SLO.
