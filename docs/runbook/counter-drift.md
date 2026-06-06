# Runbook: Counter Drift

> Status: SPEC-008 T211 (FR-264, FR-058a, FR-090l)

---

## 1. Symptom

- Audit-chain verifier (T147) reports
  `archive_cross_check: 'mismatch'`.
- `mc.governance.counter_rebuild_failed` increments.
- Budget utilization charts disagree with the audit ledger.

## 2. Impact

- Hard enforcement may block incorrectly.
- Bulk promotion is suspended until counters are rebuilt.

## 3. Diagnose

1. Compare `resource_budget_counters` to the per-window sum from
   `resource_budget_ledger` (the ledger is authoritative).
2. Inspect `governance_audit_chain_break` events.
3. Check the orphan-event sweep summary
   (`governance_orphan_event` weekly job).

## 4. Mitigate

- Trigger a counter rebuild:
  `POST /api/governance/system-health/rebuild` with reason
  `counter-drift-recovery`.
- If the rebuild stalls, record the typed recovery gesture with
  `POST /api/governance/system-health/recovery`, action
  `counter_rebuild_restart`, and typed phrase
  `CONFIRM RESTART REBUILD`.

## 5. Recover

- Re-enable hard enforcement after the rebuild emits
  `counter_rebuild_complete` and the verifier returns ok=true.

## 6. Validate

- Audit-chain verifier `ok=true`.
- Budget chart matches ledger sum to within 1 unit (rounding).

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-counter-drift.md`.

## #rebuild-failure

Per FR-058a — when the rebuild itself fails:

1. Capture the rebuild_failure reason from
   `recovery_action.payload_json`.
2. Escalate to admin; FR-058a permanent failures REQUIRE a typed
   `ACCEPT AUDIT CHAIN BREAK` from admin to re-enable hard
   enforcement.
3. Track in incident ticket with link back to this runbook anchor.
