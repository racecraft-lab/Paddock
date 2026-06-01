# Runbook: Aegis Local-Mode Fallback (LM Studio)

> Status: SPEC-008 T137 (FR-264a, FR-090l)
>
> Page on: chronic LM Studio unavailability OR per-source breaker
> stuck open while the FR-361 chain is regularly advancing past the
> reserve to step 3.

---

## 1. Symptom

- Chain step 3 (`allow:aegis_local_mode`) is no longer satisfying
  Aegis dispatches; the chain advances directly to step 4 terminal
  (`defer:deferred_no_fallback` for hard_block mode, or
  `allow:aegis_soft_alert` for soft_alert mode).
- `governance_health_events` rows for `component='lm_studio'` have
  `state='unhealthy'` for an extended period.
- `resource_governance_breaker` row with `scope_kind='lm-studio-source'`
  has `state='open'` and a non-zero `consecutive_errors` count.
- Activity feed shows repeated `governance_aegis_fallback_local_mode`
  events failing or absent (the chain detects step 3 unavailability
  and skips it).
- Direct probe `curl http://127.0.0.1:1234/v1/models` returns a
  network error, 5xx, or empty body.

---

## 2. Impact

- **Blast radius**: facility-wide. LM Studio is the operator-host-
  level local-LLM endpoint shared across all workspaces. When it is
  unhealthy, every workspace's chain step 3 fails simultaneously.
- **Severity**: when the primary provider is also throttled / blocked
  AND the workspace's emergency reserve is depleted, this runbook's
  failure mode causes step 4 terminal — see the
  `aegis-deferred-no-fallback` companion.
- **Self-recovery**: the breaker auto-transitions `open → half_open`
  60 seconds after `opened_at`. A successful probe in half-open state
  closes the breaker. If LM Studio is intermittently reachable, the
  breaker oscillates without operator intervention.

---

## 3. Likely Causes

- **LM Studio process not running** on the operator host.
- **Wrong port / wrong base URL**: `LM_STUDIO_BASE_URL` env var
  points to the wrong endpoint, or LM Studio is bound to a non-default
  port (default `127.0.0.1:1234`).
- **No models loaded**: LM Studio is up but `GET /v1/models` returns
  an empty array. The probe requires ≥1 model to mark `reachable=true`
  per FR-364.
- **Firewall / loopback block**: a host firewall is blocking the
  connection on `127.0.0.1:1234`. (Rare on macOS / Linux dev hosts;
  check on hardened production hosts.)
- **LM Studio log file rotation**: `~/.lmstudio/logs/server.log`
  is missing, so `getLmStudioCapabilities().log_present=false`.
  This is independent of the HTTP probe; both must succeed for
  step 3 to be considered available.
- **Per-source breaker stuck open**: three probe failures within 5
  minutes tripped the breaker (FR-364), but a transient outage has
  since resolved and the breaker has not yet auto-recovered.

---

## 4. Investigation Steps

```bash
# 4.1 — Direct probe.
curl --max-time 1 http://127.0.0.1:1234/v1/models | jq '.data | length'
# Expected: ≥1. If 0 or fetch error, LM Studio is unhealthy.

# 4.2 — Check the configured base URL.
grep -r "LM_STUDIO_BASE_URL" .env* 2>/dev/null
# Or in the running process:
node -e "console.log(process.env.LM_STUDIO_BASE_URL || '(default 127.0.0.1:1234/v1)')"

# 4.3 — Check the breaker state.
sqlite3 .data/mission-control.db <<'SQL'
SELECT scope_kind, state, consecutive_errors, opened_at, reset_at,
       updated_at
  FROM resource_governance_breaker
 WHERE scope_kind = 'lm-studio-source';
SQL

# 4.4 — Check recent heartbeat health events.
sqlite3 .data/mission-control.db <<'SQL'
SELECT state, metric_json, captured_at
  FROM governance_health_events
 WHERE component = 'lm_studio'
   AND captured_at > datetime('now', '-1 hour')
 ORDER BY captured_at DESC
 LIMIT 20;
SQL

# 4.5 — Confirm the log file is present.
ls -la ~/.lmstudio/logs/server.log 2>&1

# 4.6 — Run a fresh probe via the diagnostic helper.
node -e "
  (async () => {
    const { probeLmStudio } = require('./dist/lib/observability/lm-studio-probe');
    const caps = await probeLmStudio({ timeoutMs: 1000 });
    console.log(JSON.stringify(caps, null, 2));
  })();
"
```

---

## 5. Remediation

### A. LM Studio not running

```bash
# Start LM Studio (macOS GUI app or headless CLI).
# After it starts, wait ~10s for the OpenAI-compatible server to
# bind to 127.0.0.1:1234.
open -a "LM Studio"      # macOS GUI path
# Or via the CLI:
lms server start --port 1234
```

### B. No models loaded

In LM Studio's UI: Models pane → load at least one model that
matches `governance.json.aegis.local_model_id` (default
`qwen2.5-coder-32b-instruct@q4_0` per FR-362). The probe requires
≥1 model to mark the source healthy.

### C. Wrong base URL

Set `LM_STUDIO_BASE_URL` in `.env` and restart the Paddock
process:

```bash
# .env
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
```

### D. Breaker stuck open

Force the breaker closed (the next heartbeat will re-tick error if
LM Studio is still down):

```bash
sqlite3 .data/mission-control.db <<'SQL'
UPDATE resource_governance_breaker
   SET state='closed', consecutive_errors=0,
       opened_at=NULL, reset_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP
 WHERE scope_kind='lm-studio-source';
SQL
```

### E. Log file missing

LM Studio writes its log file on first server start. Restart the
LM Studio server to recreate the log:

```bash
lms server stop && lms server start --port 1234
ls -la ~/.lmstudio/logs/server.log
```

---

## 6. Verification

```bash
# 6.1 — Direct probe must succeed.
curl --max-time 1 http://127.0.0.1:1234/v1/models | jq '.data[0].id'
# Expected: a model id string (not null, not error).

# 6.2 — Fresh heartbeat must register healthy.
node -e "
  (async () => {
    const Database = require('better-sqlite3');
    const db = new Database('.data/mission-control.db');
    const { lmStudioHeartbeat } = require('./dist/lib/observability/lm-studio-probe');
    const r = await lmStudioHeartbeat({ db });
    console.log(JSON.stringify(r, null, 2));
  })();
"
# Expected: { healthy: true, capabilities: { reachable: true, ... } }

# 6.3 — Breaker must be closed.
sqlite3 .data/mission-control.db <<'SQL'
SELECT state, consecutive_errors FROM resource_governance_breaker
 WHERE scope_kind = 'lm-studio-source';
SQL
# Expected: state='closed', consecutive_errors=0.

# 6.4 — Trigger one Aegis dispatch and confirm step 3 fires.
pnpm mc tasks queue --agent Aegis --max-capacity 1 --json
# Inspect dispatch_decision_log; the most recent
# `decision_class='aegis_review'` row's reasons_json should contain
# `allow:aegis_local_mode` (when the primary + reserve paths are
# also throttled — otherwise the dispatch goes through the primary
# path).
```

---

## 7. Prevention

- **Run LM Studio as a systemd / launchd service** on the operator
  host so it auto-restarts on crash. Avoid running it as a foreground
  GUI process for production deployments.
- **Pin the model id** in `governance.json.aegis.local_model_id`:
  the FR-362 default is `qwen2.5-coder-32b-instruct@q4_0`. Operators
  who prefer a different model MUST update this value to match the
  loaded model in LM Studio so adapter logs reconcile.
- **Monitor the heartbeat metric**: alert when LM Studio
  `state='unhealthy'` persists ≥ 5 minutes. A short transient is
  normal during model swap; sustained unhealthy is the failure mode
  this runbook addresses.
- **Verify port availability** before deployment: `lsof -i :1234`
  must show LM Studio binding the loopback. Other processes (some
  IDEs / dev tools) may auto-claim port 1234.
- **Log-file rotation policy**: keep `~/.lmstudio/logs/server.log`
  under 200 MB with a rotation policy. The log adapter (T102) reads
  the file linearly; oversized logs slow the startup probe even when
  the HTTP endpoint is healthy.

---

## See Also

- FR-080, FR-081 — heartbeat cadence
- FR-362 — local-mode definition (LM Studio adapter)
- FR-364 — probe + breaker semantics
- FR-264a — runbook coverage extension for ingest + Aegis paths
- `docs/runbook/aegis-emergency-reserve-depletion.md` — companion
  runbook for the reserve failure mode
- `docs/runbook/aegis-deferred-no-fallback.md` — terminal failure
  mode when LM Studio AND reserve both fail
