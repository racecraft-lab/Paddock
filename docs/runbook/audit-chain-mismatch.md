# Runbook: Audit Chain Mismatch

> Status: SPEC-008 T212 (FR-264, FR-177, FR-090l)

---

## 1. Symptom

- Audit-chain verifier (T147) reports `ok=false` with
  `reason='row_hash_mismatch'` or `'tail_link_break'`.
- High-priority alert `governance_audit_chain_break`.

## 2. Impact

- Forensic integrity in question; legal review may be required.
- Hard enforcement is suspended automatically until typed
  `ACCEPT AUDIT CHAIN BREAK` from admin.

## 3. Diagnose

1. Run `verifyAllChains(db, { mode: 'full' })` — the result lists
   the first mismatching row id and reason.
2. Capture the row + neighbors via
   `SELECT * FROM <chain> WHERE id BETWEEN ? AND ?`.
3. Snapshot under `<DATA_DIR>/forensics/<ts>-<chain>-mismatch.json`
   per FR-177.

## 4. Mitigate

- Pause hard enforcement
  (`POST /api/governance/system-health/recovery` with action
  `recovery_pause`).
- Notify legal + admin chain.

## 5. Recover

- After forensic capture, admin issues
  `ACCEPT AUDIT CHAIN BREAK` typed gesture to re-enable
  enforcement (FR-219q). The action is logged in
  `recovery_action`.

## 6. Validate

- Verifier returns `ok=true` from the post-acceptance row forward.
- Hard enforcement re-armed.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-audit-chain-mismatch.md`.
- Update the verifier batch size if the mismatch was detected late.
