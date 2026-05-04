# Runbook: Argos Rollback Baseline

> Status: SPEC-008 T226 (FR-378, FR-394, FR-090l)

---

## 1. Symptom

- A bad baseline was accepted; Argos passes incorrect snapshots.

## 2. Impact

- UI regressions slip through.

## 3. Diagnose

- Identify the offending baseline build id in Argos UI.

## 4. Mitigate

- Block deploys until rollback completes.

## 5. Recover

1. Revert the baseline in Argos UI.
2. Re-run the affected branch's snapshots.

## 6. Validate

- Diff matches the previous good build.

## 7. Postmortem

- Tighten reviewer gate that accepted the bad baseline.
