# Runbook: Copilot Schema Broken

> Status: SPEC-008 T229 (FR-367, FR-394, FR-090l)

---

## 1. Symptom

- Copilot emitter sends a payload our parser rejects.
- Copilot rows persist with `raw_usage_events.reconcile_status='schema_broken'`
  and appear through `GET /api/governance/quarantine`.

## 2. Impact

- Copilot telemetry interrupted; other sources continue.

## 3. Diagnose

- Capture the unrecognized field set.
- Compare to the `Copilot v*` allowlist.

## 4. Mitigate

- Pin Copilot consumers to the previous schema version.

## 5. Recover

- Add forward-compat handler in the parser.
- Re-process or discard the affected `raw_usage_events` rows after the parser
  is fixed.

## 6. Validate

- No new Copilot `schema_broken` rows for 30 minutes.

## 7. Postmortem

- Open issue with Copilot team if the change was unannounced.
