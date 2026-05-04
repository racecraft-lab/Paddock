# Runbook: Rotate OTelCol API Key

> Status: SPEC-008 T217 (FR-090c, FR-090l)

---

## 1. Symptom

- Quarterly key rotation reminder.
- Or: a key was leaked.

## 2. Impact

- Rotation has zero downtime when the rolling-key window is honored.

## 3. Diagnose

- Check current key fingerprint in the OTLP receiver health surface.

## 4. Mitigate

- Stage the new key + previous key both in the receiver allowlist
  during the rolling window.

## 5. Recover

1. Update the OTelCol exporter to the new key.
2. Verify ingest continues without `auth_failure` rate-limit
   spikes.
3. Drop the previous key after the rolling window (default 1 hour).

## 6. Validate

- `governance_health_event{kind:'otelcol_key_rotated'}` emits.
- No `auth_failure` quarantines for 1 hour.

## 7. Postmortem

- File rotation entry in the ops calendar.
