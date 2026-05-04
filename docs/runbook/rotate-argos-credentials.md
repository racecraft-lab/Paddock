# Runbook: Rotate Argos Credentials

> Status: SPEC-008 T227 (FR-369, FR-394, FR-090l)

---

## 1. Symptom

- Quarterly rotation reminder.
- Or: Argos token leak.

## 2. Impact

- Argos uploads fail until the new token is in place.

## 3. Diagnose

- Verify the token id in CI secrets.

## 4. Mitigate

- Stage new token alongside old during rotation window.

## 5. Recover

1. Generate new token in Argos UI.
2. Update CI secret.
3. Drop the old token after one successful run.

## 6. Validate

- Argos run posts snapshots successfully.

## 7. Postmortem

- File rotation entry in ops calendar.
