# Runbook: Retention Sweep Failure

> Status: SPEC-008 T215 (FR-264, FR-090l)

---

## 1. Symptom

- Nightly retention sweep returns a result with entries in
  `RetentionSweepResult.errors`.
- Disk-usage alert escalates because partitions accumulate.

## 2. Impact

- Disk grows unbounded if not unblocked.
- No data loss — the sweep is conservative.

## 3. Diagnose

1. Inspect the scheduler/job log or caller output for
   `RetentionSweepResult.errors`.
2. Check FK guard violations per FR-384 (rows referenced by live
   policies cannot be archived).

## 4. Mitigate

- Pause the sweep via `MC_RETENTION_PAUSED=1` env (operator
  switch per FR-292).

## 5. Recover

- Resolve the FK violation or the partition checksum mismatch.
- Resume the sweep with `MC_RETENTION_PAUSED=0`.

## 6. Validate

- Next nightly sweep returns `errors: []` and archives eligible partitions, or
  reports no eligible partitions.
- Disk usage drops as expected.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-retention-failure.md`.
