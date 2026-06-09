# Runbook: Ingest Schema Malicious

> Status: SPEC-008 T221 (FR-264a, FR-366, FR-090l)

---

## 1. Symptom

- `raw_usage_events.reconcile_status='schema_malicious'` rows appear through
  `GET /api/governance/quarantine`.
- The matched rule detail is recorded in the row payload, not a dedicated
  `malicious_rule_id` column.

## 2. Impact

- Adversarial-pattern detection triggered. Source is paused per
  FR-366 until cleared.

## 3. Diagnose

- Pull the matched rule detail from `raw_attributes_json`.
- Inspect the raw payload (sealed under FR-219m).

## 4. Mitigate

- Block the source at the network boundary if necessary.

## 5. Recover

- After investigation, discard or promote the affected quarantine rows through
  the governance quarantine API and resume the source.

## 6. Validate

- No further malicious-rule hits for 1 hour.

## 7. Postmortem

- File security incident under `docs/security/incidents/`.
