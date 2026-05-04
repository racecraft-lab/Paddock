# Runbook: Backfill Window Failure

> Status: SPEC-008 T223 (FR-264a, FR-114a, FR-090l)

---

## 1. Symptom

- Reconciler backfill returns
  `governance_backfill_window_failed`.
- Specific window remains marked unprocessed.

## 2. Impact

- Window-bound enforcement may use stale data for that interval.

## 3. Diagnose

- Inspect `reconciliation_batches` for the failing window.
- Pull the underlying error from `recovery_action`.

## 4. Mitigate

- Pause backfill via the operator switch.

## 5. Recover

- Resolve the underlying issue and replay the window.

## 6. Validate

- Window marked `processed_at IS NOT NULL`.

## 7. Postmortem

- Tighten the backfill error envelope if untyped.
