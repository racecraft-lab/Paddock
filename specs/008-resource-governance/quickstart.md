# SPEC-008 Operator Quickstart

**Audience**: Mission Control operator deploying SPEC-008 Resource Governance for the first time.
**Prereqs**: Mission Control running on `main` with SPEC-001..006 + SPEC-002A + SPEC-003 merged. Node ≥22, pnpm, systemd-user (operator node).
**Default state**: `FEATURE_RESOURCE_GOVERNANCE=false` (flag OFF). Migrations apply automatically; no behavioral change until you opt in.

This guide walks you from "merged PR" through to "first hard-budget enforcement working" in three stages: install, configure, verify.

---

## Stage 1 — Install

### 1.1 Pull and migrate

```bash
cd /path/to/mission-control
git pull --ff-only
pnpm install
pnpm build
systemctl --user restart mission-control.service
```

The standalone server runs migrations on boot. M63 + M64a..M64m + M65 (15 migrations) apply forward-only and are rerun-safe. Verify with:

```bash
sqlite3 ~/.local/share/mission-control/.data/mission-control.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'resource_%' OR name LIKE 'canonical_%' OR name LIKE 'raw_usage_events' OR name LIKE 'token_pricing' OR name LIKE 'provider_accounts');"
```

You should see all 24 tables from `data-model.md`.

### 1.2 Install otelcol-contrib (FR-090b — cosign-verified)

The collector is operator-managed; it does not ship in the repo.

```bash
bash scripts/install-otelcol.sh
```

The script:

1. Downloads `otelcol-contrib_v0.108.0_linux_amd64.tar.gz` + `_checksums.txt` from the upstream OpenTelemetry release.
2. `cosign verify-blob` against signing identity `https://github.com/open-telemetry/opentelemetry-collector-releases/.github/workflows/build-and-release.yaml@refs/tags/v0.108.0`.
3. SHA-256 verifies the binary tarball entry.
4. Extracts to `~/.local/bin/otelcol-contrib`.
5. Inserts a `governance_health_events` row tagging component=`collector`, state=`healthy`, with `installed_version` + `checksum` + `signing_identity` + `installed_at`.

If `cosign` is missing, install via `brew install cosign` (macOS) or download the static binary from `https://github.com/sigstore/cosign/releases`.

### 1.3 Create a dedicated collector API key (FR-090c)

```bash
# Create the key labeled for the collector — operator role
curl -sS -X POST http://127.0.0.1:3000/api/agent-api-keys \
  -H "x-api-key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"key_label\":\"otelcol-contrib@$(hostname)\",\"role\":\"operator\"}" \
  | tee /tmp/otelcol-key.json

# Persist plaintext to the operator secret manager (do not commit; do not echo)
op item create --category 'API Credential' --title '<collector-api-key-item>' \
  --vault '<vault-name>' \
  apiKey="$(jq -r .plaintext_key /tmp/otelcol-key.json)"
shred -u /tmp/otelcol-key.json
```

Configure systemd drop-in (mode 0600, owner = your UID):

```bash
mkdir -p ~/.config/systemd/user/otelcol-contrib.service.d
cat > ~/.config/systemd/user/otelcol-contrib.service.d/secret.conf <<'EOF'
[Service]
ExecStartPre=/bin/sh -c 'op read "op://<vault-name>/<collector-api-key-item>/apiKey" > %h/.config/otelcol/api-key'
EOF
chmod 600 ~/.config/systemd/user/otelcol-contrib.service.d/secret.conf
systemctl --user daemon-reload
```

NO new `agent_api_keys.type` column was added — the collector key is identified by its `key_label` convention only (Constitution Principle XII; FR-079b).

### 1.4 Write the initial collector config

```bash
# MC writes the template at install time; copy to the data dir
mkdir -p ~/.local/share/mission-control/.data/otelcol/filestorage
cp src/lib/observability/otelcol-config.template.yaml \
   ~/.local/share/mission-control/.data/otelcol/config.yaml
chmod 600 ~/.local/share/mission-control/.data/otelcol/config.yaml
```

Future config edits MUST go through `POST /api/governance/collector/config` (FR-090f) which audits the change, snapshots the prior config to `config.<unix-ts>.yaml.bak`, and triggers a controlled restart.

### 1.5 Enable the systemd unit

```bash
systemctl --user enable --now otelcol-contrib.service
systemctl --user status otelcol-contrib.service --no-pager
```

---

## Stage 2 — Configure

### 2.1 Opt the workspace in

`FEATURE_RESOURCE_GOVERNANCE` is OFF by default. Set the per-workspace flag JSON:

```bash
sqlite3 ~/.local/share/mission-control/.data/mission-control.db \
  "UPDATE workspaces
   SET feature_flags = json_set(COALESCE(feature_flags,'{}'), '$.FEATURE_RESOURCE_GOVERNANCE', 1)
   WHERE id = (SELECT id FROM workspaces WHERE slug = '<your-product-line-slug>');"
```

`process.env.FEATURE_RESOURCE_GOVERNANCE='1'` does NOT force ON; only the workspace JSON opts in. Per-CLAUDE.md pitfall, `'0'` does force OFF.

### 2.2 Create your first WIP policy (shadow mode)

All seeded defaults ship `enforce_mode='shadow'` (Q4). Promote to `soft` or `hard` only after observation.

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/policies \
  -H "x-api-key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "agent",
    "policy_type": "wip",
    "limit_value": 1,
    "enforce_mode": "shadow",
    "owner_workspace_id": <workspace_id>
  }'
```

After 24-72 hours of observation in shadow mode, promote:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/policies/<id>/promote \
  -H "x-api-key: $MC_API_KEY" \
  -H "If-Match: <etag>" \
  -H "Content-Type: application/json" \
  -d '{"target_enforce_mode":"soft"}'
```

### 2.3 Create your first daily USD budget

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/budgets \
  -H "x-api-key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "unit": "usd",
    "window_type": "calendar_daily",
    "limit_value": 50,
    "soft_threshold_pct": 80,
    "hard_threshold_pct": 100,
    "enforce_mode": "shadow"
  }'
```

The Cost Tracker → Governance tab now shows the budget utilization chart.

### 2.4 Create a blackout window

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/windows \
  -H "x-api-key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "blackout",
    "iana_timezone": "America/Chicago",
    "rule_cron": "0 22-5 * * *",
    "owner_workspace_id": <workspace_id>
  }'
```

The window materializer regenerates the next 90 days of instances on edit + on a daily 02:00 local-time job. DST transitions are deterministic (no double-fire / no skipped-fire; verified by property-based test).

### 2.5 Calibration (Q33, FR-041..043)

A policy promoted from a calibration template only goes live when ≥ N=14 days of observation periods have been collected (configurable). Calibration progress is visible in the UI as a milestone progress bar (FR-042). Bulk-promotion of multiple calibration templates requires the typed phrase `PROMOTE TO SOFT` or `PROMOTE TO HARD` (single workspace per FR-090h):

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/policies/bulk-promote \
  -H "x-api-key: $MC_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": <workspace_id>,
    "policy_ids": [101, 102, 103],
    "confirmation_phrase": "PROMOTE TO SOFT",
    "target_enforce_mode": "soft"
  }'
```

Cross-workspace bulk-promote returns 422 with `error: "cross_workspace_bulk_forbidden"` (FR-090h).

### 2.6 Backup configuration (FR-090k)

Backups default to **local-only** at `~/.local/share/mission-control/.data/backups/` (file mode 0600). Off-node mirror is optional but recommended:

```bash
# Optional: configure off-node rsync mirror
echo 'MC_BACKUP_REMOTE_RSYNC_PATH=user@offsite.example.com:/srv/mc-backups/' \
  >> ~/.config/mission-control/env

# Optional: encrypt-at-rest with GPG
echo 'MC_BACKUP_GPG_RECIPIENT=ops-team@example.com' \
  >> ~/.config/mission-control/env

systemctl --user restart mission-control.service
```

If `MC_BACKUP_REMOTE_RSYNC_PATH` is unset, the System Health dashboard shows a yellow "Off-node backup not configured" pill. Acknowledge with an audited dismissal:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/governance/system-health/recovery \
  -H "x-api-key: $MC_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"kind":"backup_acknowledged_no_offnode"}'
```

The backup scope includes the SQLite db, archive partitions, encrypted secret material, AND the collector `filestorage` WAL directory (`<DATA_DIR>/otelcol/filestorage/`) per FR-090g.

---

## Stage 3 — Verify

### 3.1 Sanity-check ingest

After 5 minutes of normal autonomous activity, query the System Health dashboard:

```bash
curl -sS http://127.0.0.1:3000/api/governance/system-health \
  -H "x-api-key: $MC_API_KEY" | jq .
```

Expect:

- `collector.state` = `healthy`
- At least `native_otel` (or `transcript_replay` if MCP-served) source pill green with `freshness_ms < 60000`.
- `breaker_states` all `closed`.
- `drift_alerts` empty.

### 3.2 Run the spike-evidence gate

Before any production rollout, ensure the Phase-0 verification spikes have run and produced evidence files:

```bash
ls docs/ai/specs/spikes/
# Expected:
#   claude-code-otel-emission.json
#   claude-mcp-otel-emission.json    (verdict: 'downgraded' is the expected empirical outcome)
#   codex-stdout-rollout-timestamp.json
#   copilot-events-ci.json

pnpm test -- tests/integration/spec-spike-gates.test.ts
```

If any `[VERIFY]`-tagged FR lacks an evidence file with the expected verdict, the test fails closed.

### 3.3 Trigger a defer decision (in shadow mode this is non-blocking)

With a WIP policy (limit_value=1) in `shadow` mode:

1. Submit two autonomous tasks to the same agent.
2. Open Cost Tracker → Governance → Diagnostic feed.
3. The second task's decision row is `defer` with `reason=wip_exceeded` and `policy_ids=[<id>]`. In `shadow` mode the dispatcher still advances the task; in `soft`/`hard` it does not.

### 3.4 Run the byte-compat regression

To prove Principle I (Zero-Regression) is satisfied:

```bash
# Flip flag OFF temporarily
sqlite3 ~/.local/share/mission-control/.data/mission-control.db \
  "UPDATE workspaces SET feature_flags = json_remove(feature_flags, '$.FEATURE_RESOURCE_GOVERNANCE') WHERE id = <workspace_id>;"

# Run the e2e regression spec (FR-305)
pnpm test:e2e tests/e2e/governance-flag-off-byte-compat.e2e.ts

# Snapshot diff = 0 vs pre-SPEC-008 baseline. visual regression comparison passes.
```

### 3.5 DR rehearsal (FR-235, AC-DR-1..4)

```bash
# Take a fresh backup
~/.local/bin/mc-backup.sh

# Stop the service
systemctl --user stop mission-control.service

# Move the active DB aside
mv ~/.local/share/mission-control/.data/mission-control.db ~/mc.db.before-restore

# Restore
~/.local/bin/mc-restore.sh ~/.local/share/mission-control/.data/backups/$(ls -t ~/.local/share/mission-control/.data/backups/ | head -1)

# Restart
systemctl --user start mission-control.service

# Verify audit chain integrity (FR-273)
curl -sS -X POST http://127.0.0.1:3000/api/governance/audit/verify \
  -H "x-api-key: $MC_API_KEY" | jq .
# Expect: {"verified": true, "mismatches": []}
```

Target: RTO < 30 min, RPO < 24 h.

---

## Reference: 15 Migrations + Rollback Files

Migrations apply forward-only via `src/lib/migrations.ts`. Rollback is documented manual reverse SQL per Constitution Principle VII.

```text
M63    docs/migrations/rollback-M63.sql
M64a   docs/migrations/rollback-M64a.sql       source_emission_capability
M64b   docs/migrations/rollback-M64b.sql       raw_usage_events
M64c   docs/migrations/rollback-M64c.sql       canonical_usage_events
M64d   docs/migrations/rollback-M64d.sql       canonical_budget_effects
M64e   docs/migrations/rollback-M64e.sql       resource_budget_ledger
M64f   docs/migrations/rollback-M64f.sql       resource_budget_counters
M64g   docs/migrations/rollback-M64g.sql       resource_reservations
M64h   docs/migrations/rollback-M64h.sql       resource_overrides
M64i   docs/migrations/rollback-M64i.sql       reconciliation_batches
M64j   docs/migrations/rollback-M64j.sql       correction_ledger
M64k   docs/migrations/rollback-M64k.sql       snapshots
M64l   docs/migrations/rollback-M64l.sql       provider_accounts + provider_entitlements
M64m   docs/migrations/rollback-M64m.sql       state machines + window_instances + recovery_actions + circuit_breaker_state + dispatch_decision_log
M65    docs/migrations/rollback-M65.sql        token_pricing
```

Each rollback file is independently runnable + idempotent (matching SPEC-001 pattern).

---

## Reference: 12 Runbooks (FR-090l)

```text
docs/runbook/collector-outage.md
docs/runbook/reconciler-stall.md
docs/runbook/counter-drift.md
docs/runbook/breaker-stuck-open.md
docs/runbook/audit-chain-mismatch.md
docs/runbook/aegis-emergency-reserve-depletion.md
docs/runbook/source-schema-break.md
docs/runbook/encryption-key-rotation.md
docs/runbook/retention-sweep-failure.md
docs/runbook/migration-rollback.md
docs/runbook/rotate-otelcol-api-key.md
docs/runbook/ollama-proxy-port-collision.md
```

Each follows the FR-090l 7-section template:

```text
## Symptom
## Severity
## Likely causes
## Diagnostic commands
## Recovery steps    (single-action copy-pastable fenced bash blocks ONLY)
## Verification
## Escalation
```

`pnpm test:chaos` runs each runbook's primary recovery command against a simulated failure and asserts the `## Verification` step passes.

---

## Reference: System Health Recovery Affordances (FR-090i)

| Affordance | Confirmation | Notes |
|---|---|---|
| `restart_collector` | single-click + checkbox | Triggers `systemctl restart` via authenticated proxy |
| `force_resume_hard_enforcement` | typed phrase `RESUME HARD ENFORCEMENT` | Only path to re-enable hard mode after a global disable |
| `manually_close_breaker` | single-click + checkbox | Per-scope or global |
| `top_up_reserve` (Aegis) | single-click + checkbox | Delta capped at 100% of policy limit |
| `pause_aegis` | typed phrase `PAUSE AEGIS` | Reversible; reads via `force_local_mode` |
| `force_local_mode` (Aegis) | single-click + checkbox | Routes Aegis to local model only |
| `run_rebuild` (drift) | single-click + checkbox | Async chunked rebuild |
| `mark_acknowledged` | single-click | Non-state-changing |
| `update_parser` | EXCLUDED | Opens runbook only — code change required |

---

## Troubleshooting

- **Collector won't start**: Check `systemctl --user status otelcol-contrib.service`. Verify the API key file at `~/.config/otelcol/api-key` is mode 0600 + non-empty. If the systemd drop-in is missing, regenerate per Stage 1.3.
- **Counter values look stale**: A counter rebuild may be in progress (`pending_rebuild_job_id` is set). Drift detection auto-repairs minor drift; major drift surfaces in the System Health dashboard for operator-confirmed repair.
- **Diagnostic feed shows lots of `defer:wip_exceeded`**: Expected if WIP limits are tight; either raise limits or grant temporary overrides.
- **OTLP receiver returns 503 with `disk_full`**: Disk is at the FR-090e red threshold. Free space, or temporarily raise `MC_INGEST_DISK_RED_BYTES`.
- **Override grant returns 409 `reservation_unavailable`**: Last-dollar concurrent-loss path; this is the deterministic 409 from FR-055/AC-Race-1 (intended behavior — not a bug).
- **Telemetry source health pill stays red after recovery**: Use `POST /api/governance/ingest/<source>/resume` to reset the per-source breaker.

For escalation paths see the per-failure-mode runbook under `docs/runbook/`.
