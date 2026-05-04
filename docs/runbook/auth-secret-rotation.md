# Runbook: Auth Secret Rotation

> Status: SPEC-008 T224 (FR-219v, FR-090l)

---

## 1. Symptom

- Quarterly rotation reminder.
- Or: AUTH_SECRET leak.

## 2. Impact

- Sessions are invalidated. All users must re-authenticate.

## 3. Diagnose

- Confirm rotation policy and approval.

## 4. Mitigate

- Stage new AUTH_SECRET; pre-warn users.

## 5. Recover

1. Promote new secret on the next deploy boundary.
2. All sessions invalidated; users re-authenticate.

## 6. Validate

- Successful login on the new secret.
- API key surfaces continue to authenticate.

## 7. Postmortem

- File rotation in ops calendar.
