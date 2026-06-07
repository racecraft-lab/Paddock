# Runbook: Encryption Key Rotation

> Status: SPEC-008 T214 (FR-264, FR-138, FR-090l)

---

## 1. Symptom

- Quarterly rotation reminder fires.
- Or: emergency rotation triggered by a leak.

## 2. Impact

- Re-encryption phase causes a brief write pause.

## 3. Diagnose

1. Confirm the active key id from `secrets/active-key-id`.
2. Verify the new key has been provisioned in the secret store.

## 4. Mitigate

- Schedule a maintenance window and stop the upstream writer or service
  path that could mutate encrypted-at-rest rows during the rotation. The
  System Health recovery endpoint does not provide a generic pause
  action.

## 5. Recover

1. Promote the new key to active.
2. Re-encrypt encrypted-at-rest columns (FR-138) in batches of 10k
   rows; commit per batch.
3. Resume governance writers.

## 6. Validate

- Smoke-test secret read/write at least once on the new key.
- Audit-chain verifier `ok=true` post-rotation.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-key-rotation.md`.
- Update next rotation date in the ops calendar.
