# Runbook: Ingest Disk-Full Pause

> Status: SPEC-008 T222 (FR-264a, FR-090e, FR-090l)

---

## 1. Symptom

- Disk free below 1.5 GB on the data volume.
- All sources paused via `ingest_rate_state.state='disk_full_pause'`.
- Activity: `governance_disk_full_pause`.

## 2. Impact

- All ingest paused.
- Decisions still flow but observability lags.

## 3. Diagnose

- `df -h <DATA_DIR>` to confirm.
- Identify the largest consumer (logs, partitions, archives).

## 4. Mitigate

- Free disk: rotate logs, run retention sweep, archive old
  partitions to off-node storage.

## 5. Recover

- Disk hysteresis returns to `accepting` once free space exceeds
  the high-water mark per FR-090e1.

## 6. Validate

- `df -h` shows above the high-water mark.
- All sources return to `accepting`.

## 7. Postmortem

- Capacity-plan exercise if recurring.
