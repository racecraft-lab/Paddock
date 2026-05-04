# Runbook: Aegis Emergency Reserve Depletion

> Status: SPEC-008 T136 (FR-264, FR-090l)
>
> Page on: high-priority alert
> `governance_aegis_emergency_reserve_depleted`. The per-workspace
> Aegis emergency reserve has dropped to 0 USD AND 0 tokens.

---

## 1. Symptom

- Activity feed shows `governance_aegis_emergency_reserve_depleted`
  events for a workspace, de-duped at one alert per
  (workspace, hour) per FR-160.
- `aegis_emergency_reserves.depleted_at` is non-NULL for the
  affected workspace.
- Aegis dispatches that previously succeeded with reason
  `allow:aegis_emergency_reserve` now fall through to the next chain
  step (`allow:aegis_local_mode` if LM Studio is reachable, otherwise
  `defer:deferred_no_fallback` per FR-363 — see the companion
  runbook).
- `dispatch_decision_log` rows show the chain advanced past step 2
  (emergency reserve) to step 3 (local mode) or step 4 (terminal).

---

## 2. Impact

- **Blast radius**: per-workspace. Only the affected workspace's
  Aegis dispatches are impacted. Other workspaces' reserves are
  independent.
- **Severity**: degrades the FR-361 chain. Step 2 can no longer
  satisfy requests. Step 3 (LM Studio) is still available unless
  also failing.
- **Self-recovery**: the reserve replenishes automatically on the
  next policy window roll (FR-157 — typically daily at midnight UTC).
  Until then, all Aegis dispatches that hit the primary hard-budget
  bypass straight to step 3 / step 4.

---

## 3. Likely Causes

- **Sustained Aegis review burst**: a workflow generated more Aegis
  reviews in the budget window than the seeded reserve could absorb.
  Check `dispatch_decision_log` count of `allow:aegis_emergency_reserve`
  in the past 24h.
- **Reserve seed too low**: the M68 default
  (`aegis.emergency_reserve_usd=5.00`,
  `aegis.emergency_reserve_tokens=1_000_000`) is undersized for the
  workspace's normal cadence. Consider raising the seeds per FR-159.
- **Replenishment job not running**: the policy window roll job that
  calls `replenishReserve(workspace_id, db)` (FR-157) has stopped or
  is silently failing. Confirm by checking
  `aegis_emergency_reserves.last_replenished_at` against the expected
  cadence.
- **Hung tasks consuming reserve**: tasks that started under the
  reserve but never released their reservations have effectively
  drained the balance. Check the reservation reaper
  (`resource-reservation-reaper`) is sweeping expired reservations.
- **Manual operator drain**: an emergency manual-post (T104) reduced
  the balance to 0 deliberately; check operator activity log.

---

## 4. Investigation Steps

```bash
# 4.1 — Confirm the reserve is actually empty for the workspace
#       (replace 42 with the affected id).
sqlite3 .data/mission-control.db <<'SQL'
SELECT workspace_id, usd_remaining, tokens_remaining, usd_seed,
       tokens_seed, last_replenished_at, depleted_at, updated_at
  FROM aegis_emergency_reserves
 WHERE workspace_id = 42;
SQL

# 4.2 — Inspect recent reserve allocations to confirm they actually
#       fired (not a phantom alert).
sqlite3 .data/mission-control.db <<'SQL'
SELECT decision_id, reasons_json, created_at
  FROM dispatch_decision_log
 WHERE workspace_id = 42
   AND reasons_json LIKE '%allow:aegis_emergency_reserve%'
   AND created_at > datetime('now', '-24 hours')
 ORDER BY created_at DESC
 LIMIT 50;
SQL

# 4.3 — Confirm the replenishment cadence by checking the previous
#       replenished_at against the policy window length.
sqlite3 .data/mission-control.db <<'SQL'
SELECT (julianday('now') - julianday(last_replenished_at)) * 24 * 60 AS minutes_since_replenish
  FROM aegis_emergency_reserves
 WHERE workspace_id = 42;
SQL
# Expected: < 24 hours for a daily-roll policy. If this is much
# higher, the replenishment job is not running.

# 4.4 — Check the depletion alert was emitted (and de-duped).
sqlite3 .data/mission-control.db <<'SQL'
SELECT step, hour_bucket, payload_json, created_at
  FROM aegis_fallback_activity
 WHERE workspace_id = 42
   AND step = 'emergency_reserve'
   AND created_at > datetime('now', '-2 hours')
 ORDER BY created_at DESC;
SQL
```

---

## 5. Remediation

### A. Replenish the reserve immediately

```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('.data/mission-control.db');
  const { replenishReserve, getEmergencyReserve } = require('./dist/lib/resource-aegis-reserve');
  replenishReserve(42, db);
  console.log(JSON.stringify(getEmergencyReserve(42, db), null, 2));
"
```

Or via raw SQL (preserves audit because the helper is idempotent):

```bash
sqlite3 .data/mission-control.db <<'SQL'
UPDATE aegis_emergency_reserves
   SET usd_remaining = usd_seed,
       tokens_remaining = tokens_seed,
       depleted_at = NULL,
       last_replenished_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
 WHERE workspace_id = 42;
SQL
```

### B. Raise the reserve seed

If the seed is undersized for the workspace's cadence (e.g., a
production workspace running 100+ Aegis reviews/hour cannot survive
on a $5.00 reserve), raise the seed:

```bash
sqlite3 .data/mission-control.db <<'SQL'
UPDATE aegis_emergency_reserves
   SET usd_seed = 25.00,
       tokens_seed = 5000000,
       updated_at = CURRENT_TIMESTAMP
 WHERE workspace_id = 42;
SQL
```

The next replenishment will pick up the new seed.

### C. Diagnose stalled replenishment job

If `last_replenished_at` is far older than expected, the policy
window roll job is not calling `replenishReserve`. Check the
orchestrator's scheduler logs and re-enable / restart the job.

### D. Reservation reaper

Confirm the reservation reaper is sweeping expired reservations
correctly so the reserve does not appear drained while in fact
holding stale reservations:

```bash
sqlite3 .data/mission-control.db <<'SQL'
SELECT state, COUNT(*) FROM resource_reservations
 WHERE expires_at < datetime('now')
   AND state = 'active'
 GROUP BY state;
SQL
# Expected: 0. If non-zero, run the reaper manually.
```

---

## 6. Verification

```bash
# 6.1 — Confirm reserve is back to seed.
sqlite3 .data/mission-control.db <<'SQL'
SELECT workspace_id, usd_remaining, tokens_remaining, depleted_at
  FROM aegis_emergency_reserves
 WHERE workspace_id = 42;
SQL
# Expected: usd_remaining = usd_seed, tokens_remaining = tokens_seed,
# depleted_at = NULL.

# 6.2 — Trigger one synthetic Aegis dispatch and confirm step 2 grants.
pnpm mc tasks queue --agent Aegis --max-capacity 1 --json
# Inspect dispatch_decision_log for the new decision; reasons_json
# should contain `allow:aegis_emergency_reserve` (or
# `allow:clear` if the primary path is not currently throttled).

# 6.3 — Confirm depletion alert no longer fires within the next hour
#       (de-dup hour_bucket should not include a fresh emission).
sqlite3 .data/mission-control.db <<'SQL'
SELECT created_at, hour_bucket, payload_json
  FROM aegis_fallback_activity
 WHERE workspace_id = 42
   AND step = 'emergency_reserve'
 ORDER BY created_at DESC
 LIMIT 5;
SQL
```

---

## 7. Prevention

- **Right-size the seed**: monitor the
  `mc.governance.budget_consumed` metric for the workspace's Aegis
  review path; size the reserve to ≥ 24h of typical Aegis review
  budget.
- **Verify the replenishment job is on the orchestrator schedule**:
  the policy window roll (typically daily) MUST call
  `replenishReserve(workspace_id, db)` for every workspace with an
  `aegis_emergency_reserves` row.
- **Alert on `depleted_at` set ≥ 1 hour**: a one-off depletion is
  expected during Aegis review bursts. A reserve that stays depleted
  for >1 hour indicates the chain is bypassing the reserve
  permanently — escalate to the deferred_no_fallback runbook.
- **Audit reservation reaper on a daily cadence**: orphaned
  `active` reservations effectively reduce the reserve floor. Reap
  them aggressively.

---

## See Also

- FR-152, FR-153, FR-157, FR-160 — reserve semantics
- FR-159 — operator-configurable seed
- FR-264 — runbook coverage requirement
- `docs/runbook/aegis-deferred-no-fallback.md` — terminal failure
  mode when reserve AND local mode both fail
- `docs/runbook/aegis-local-mode-fallback.md` — companion runbook
  for the LM Studio fallback step
