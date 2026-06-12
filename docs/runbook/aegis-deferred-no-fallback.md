# Runbook: Aegis `deferred_no_fallback`

> Status: SPEC-008 T135 (FR-394, FR-090l, FR-363)
>
> Page on: high-priority alert. Aegis review tasks remain stuck in
> `quality_review` because the FR-361 fallback chain has been exhausted.

---

## 1. Symptom

Operators see one or more of:

- Activity feed shows repeated `governance_aegis_fallback_deferred_no_fallback`
  events on a workspace.
- System Health pill reads **"Aegis: deferred (no fallback)"**.
- `resource_decision_audit.reason='defer:deferred_no_fallback'` rows
  accumulate for Aegis review requests.
- Task queue shows tasks stuck in `quality_review`
  status with no progression for >5 minutes (FR-161 starvation gauge
  `mc.governance.aegis_review_pipeline_starvation_count` rising).

The terminal `defer:deferred_no_fallback` reason indicates the FR-361
chain executed all four steps and could not satisfy the request:

1. **Primary provider** — Claude Code OTel hard-budget exhausted /
   blocked.
2. **Emergency reserve** (FR-153) — depleted (`usd_remaining=0` AND
   `tokens_remaining=0`) OR shadowed by a blackout window (FR-162).
3. **Local mode** (FR-362) — LM Studio adapter is unreachable
   (`lm_studio_health.state='unhealthy'` or absent).
4. **Terminal** (FR-363) — `defer:deferred_no_fallback` is emitted;
   the task remains in `quality_review` and the scheduler retries
   on the next tick (60s) with capped backoff to 600s.

---

## 2. Impact

- **Blast radius**: per-workspace. Aegis-class reviews for the
  affected workspace stall until at least one fallback path becomes
  available. Other workspaces are unaffected.
- **Severity**: degrades the Aegis quality gate for that workspace.
  Tasks are not lost — they remain in `quality_review` and the
  scheduler resumes dispatching once a fallback recovers (reserve
  replenishes on policy window roll, LM Studio comes back online,
  or the primary budget window rolls over).
- **Aegis cannot self-recover** without one of:
  1. Operator-initiated emergency-reserve replenishment.
  2. LM Studio process restart / fix.
  3. Hard-budget window rollover (typically daily).

---

## 3. Likely Causes

- **Reserve permanently disabled**: `aegis_emergency_reserves` row is
  missing OR seeded to 0/0 (FR-152 default not yet applied).
- **Reserve drained AND not replenishing**: replenishment job (FR-157
  policy window roll) has stopped running. Confirm by checking
  `aegis_emergency_reserves.last_replenished_at` is recent.
- **LM Studio not installed** on the operator host: the process at
  `http://127.0.0.1:1234` is not running OR `~/.lmstudio/logs/server.log`
  does not exist.
- **LM Studio per-source breaker open**: three consecutive probe
  failures within 5 minutes tripped the breaker (FR-364) — the
  `getLmStudioCapabilities()` surface still reports `log_present=true`
  but the heartbeat marks the source unhealthy.
- **Blackout window actively suppressing all Aegis dispatch**: even
  the reserve respects FR-162 blackout precedence; if the workspace
  is inside a blackout `resource_policies` row, every chain step
  returns `null` and the terminal fires.

---

## 4. Investigation Steps

```bash
# 4.1 — Watch live governance events and identify the affected workspace.
pnpm mc events watch --types governance \
  | grep deferred_no_fallback

# 4.2 — Inspect recent decisions for the workspace (replace 42 with the
#       actual workspace id).
sqlite3 .data/paddock.db <<'SQL'
SELECT decision_id, decision, reason, captured_at
  FROM resource_decision_audit
 WHERE workspace_id = 42
   AND reason = 'defer:deferred_no_fallback'
   AND captured_at > datetime('now', '-1 hour')
 ORDER BY captured_at DESC
 LIMIT 20;
SQL

# 4.3 — Check the emergency reserve balance for the workspace.
sqlite3 .data/paddock.db <<'SQL'
SELECT workspace_id, usd_remaining, tokens_remaining,
       last_replenished_at, depleted_at
  FROM aegis_emergency_reserves
 WHERE workspace_id = 42;
SQL

# 4.4 — Check LM Studio reachability + breaker state.
curl --max-time 1 http://127.0.0.1:1234/v1/models
# Should return JSON with at least one model. If the curl fails or
# returns no models, LM Studio is unreachable.

sqlite3 .data/paddock.db <<'SQL'
SELECT scope_kind, state, consecutive_errors, opened_at, reset_at
  FROM resource_governance_breaker
 WHERE scope_kind = 'lm-studio-source';
SQL

# 4.5 — Check fallback step de-dup table to understand chain history.
sqlite3 .data/paddock.db <<'SQL'
SELECT step, hour_bucket, payload_json, created_at
  FROM aegis_fallback_activity
 WHERE workspace_id = 42
   AND created_at > datetime('now', '-2 hours')
 ORDER BY created_at DESC;
SQL

# 4.6 — Confirm starvation gauge is rising.
pnpm mc status --json | jq '.metrics."mc.governance.aegis_review_pipeline_starvation_count"'
```

---

## 5. Remediation

Pick the **first** matching branch.

### A. Reserve missing or seeded to 0

Replenish the reserve from the seeded amounts:

```bash
sqlite3 .data/paddock.db <<'SQL'
INSERT OR REPLACE INTO aegis_emergency_reserves
  (workspace_id, usd_remaining, tokens_remaining, usd_seed, tokens_seed,
   last_replenished_at, depleted_at)
VALUES (42, 5.00, 100000, 5.00, 100000, CURRENT_TIMESTAMP, NULL);
SQL
```

### B. Reserve depleted; replenish ahead of normal window roll

```bash
# Use the raw SQL fallback when the Next.js runtime helper is not
# available from an operator shell.
sqlite3 .data/paddock.db <<'SQL'
UPDATE aegis_emergency_reserves
   SET usd_remaining = usd_seed,
       tokens_remaining = tokens_seed,
       depleted_at = NULL,
       last_replenished_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
 WHERE workspace_id = 42;
SQL
```

### C. LM Studio unreachable

```bash
# 1. Restart LM Studio on the host.
# 2. Verify the breaker auto-recovers (60s half-open auto-transition).
# 3. If the breaker is permanently stuck open, force-close it:
sqlite3 .data/paddock.db <<'SQL'
UPDATE resource_governance_breaker
   SET state='closed', consecutive_errors=0,
       opened_at=NULL, reset_at=CURRENT_TIMESTAMP
 WHERE scope_kind='lm-studio-source';
SQL
```

### D. Blackout window actively suppressing chain

The chain is behaving correctly — blackouts have higher precedence
than the reserve (FR-162). Wait for the blackout window to expire,
or grant a per-task override (FR-171) for the specific Aegis review
that needs to proceed.

### E. Soft-alert mode workaround

If the workspace can tolerate the FR-155 soft-alert behavior, switch
the governance mode:

```bash
sqlite3 .data/paddock.db <<'SQL'
UPDATE workspaces SET aegis_governance_mode='soft_alert' WHERE id=42;
SQL
```

This downgrades the chain terminal to `allow:aegis_soft_alert` so
work proceeds while a high-priority alert is recorded. **Note**: this
does NOT consume the reserve — work flows through the primary path
with a soft-alert annotation.

---

## 6. Verification

```bash
# 6.1 — Trigger one synthetic Aegis review request and confirm the
#       chain advances past the terminal.
pnpm mc tasks queue --agent Aegis --max-capacity 1 --json

# 6.2 — Confirm the terminal reason is no longer being emitted.
sqlite3 .data/paddock.db <<'SQL'
SELECT COUNT(*) AS terminal_count
  FROM resource_decision_audit
 WHERE workspace_id = 42
   AND reason = 'defer:deferred_no_fallback'
   AND captured_at > datetime('now', '-5 minutes');
SQL
# Expected: 0 (or sharply lower than before remediation).

# 6.3 — Starvation gauge should drop within one tick (5 min).
pnpm mc status --json | jq '.metrics."mc.governance.aegis_review_pipeline_starvation_count"'
```

---

## 7. Prevention

- **Monitor the starvation gauge** — page when
  `mc.governance.aegis_review_pipeline_starvation_count > 50` for any
  workspace (FR-161).
- **Configure adequate reserve seeds**: per FR-152 the defaults are
  `aegis.emergency_reserve_usd=5.00` and `aegis.emergency_reserve_tokens=100_000`.
  Adjust per-workspace via M68's seed columns when normal Aegis review
  cadence exceeds these defaults.
- **Health-check LM Studio in deployment automation**: the heartbeat
  job (FR-080) emits `governance_health_events` rows; downstream alert
  pipelines should fire on `state='unhealthy'` events for the
  `lm_studio` component.
- **Set reasonable blackout windows**: avoid scheduling blackouts
  longer than 24 hours without operator awareness — Aegis review queue
  growth scales linearly with blackout duration.
- **Default workspaces to `soft_alert` mode** (FR-155 default) so a
  rare LM Studio outage does not produce hard-stalls. Switch to
  `hard_block` only for tenants that explicitly require strict
  enforcement.

---

## See Also

- FR-153 / FR-361 — fallback chain order
- FR-363 — `deferred_no_fallback` reason
- FR-394 — runbook coverage requirement
- `docs/runbook/aegis-emergency-reserve-depletion.md` — companion
  runbook for the reserve-only failure mode
- `docs/runbook/aegis-local-mode-fallback.md` — companion runbook for
  the LM Studio-only failure mode
