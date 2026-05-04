# Runbook: Audit Chain Tamper

> Status: SPEC-008 T228 (FR-385, FR-394, FR-090l)

---

## 1. Symptom

- Audit-chain verifier reports a tamper signature
  (row_hash mismatch on rows we trust were not touched).
- Filesystem detects unexpected mtime on `mission-control.db`.

## 2. Impact

- Forensic integrity compromised. Treat as a security incident.

## 3. Diagnose

1. Snapshot the database.
2. Capture a forensics bundle under `<DATA_DIR>/forensics/`.
3. Notify security on-call.

## 4. Mitigate

- Pause hard enforcement.
- Block writes via the recovery_pause action.

## 5. Recover

- Per legal/security guidance, restore from the most recent
  trusted backup OR proceed with a typed
  `ACCEPT AUDIT CHAIN BREAK` admin action and a documented
  attestation trail.

## 6. Validate

- Verifier ok=true on the post-recovery chain.

## 7. Postmortem

- File security incident.
- Tighten DB file permissions and audit access.
