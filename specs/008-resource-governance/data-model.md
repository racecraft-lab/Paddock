# SPEC-008 Data Model — Phase 1 Output

**Feature**: Resource Governance and Cost Tracker Enforcement
**Date**: 2026-05-02
**Migration plan**: M64 + M65a..M65m + M66 (15 files; all rollbacks ship in same diff per Constitution Convention G)
**Storage**: SQLite via `better-sqlite3`; WAL mode; 3 connections per Q29

This document defines every new SQLite table introduced by SPEC-008, the FK constraints between them, the index strategy, and the dependency-ordered migration sequence. Cross-reference with `research.md` R-002, R-006, R-009, R-011 for design rationale.

## Entity Catalog

| # | Table | Owning module | Purpose | Migration |
|---|---|---|---|---|
| 1 | `resource_policies` (extended) | resource-policy-loader | Policy definitions (M60 retained, columns added) | M64 |
| 2 | `resource_policy_events` (extended) | resource-decision-writer | Decision rows (M61 retained, columns added) | M64 |
| 3 | `resource_decision_audit` | resource-audit-chain | Tamper-evident audit chain | M64 |
| 4 | `retention_policy` | resource-retention | Per-table horizon configuration | M64 |
| 5 | `source_emission_capability` | observability/source-registry | Per-source capability registry | M65a |
| 6 | `raw_usage_events` (partitioned monthly) | observability/* adapters | Per-source append-only events | M65b |
| 7 | `canonical_usage_events` (partitioned monthly) | observability/canonical-events | Deduped+coalesced events | M65c |
| 8 | `canonical_budget_effects` | observability/posted-effect | Posted-effect dedup tracking | M65d |
| 9 | `resource_budget_ledger` (partitioned monthly) | resource-budget-ledger | Append-only budget deltas | M65e |
| 10 | `resource_budget_counters` | resource-budget-counters | Precomputed per-window balances | M65f |
| 11 | `resource_reservations` | resource-reservation | Atomic reservation rows | M65g |
| 12 | `resource_overrides` | resource-override-grant | Operator-issued grants | M65h |
| 13 | `reconciliation_batches` | observability/reconciler | Reconciler batch tracking | M65i |
| 14 | `correction_ledger` | observability/correction-ledger | Late-arriving event corrections | M65j |
| 15 | `snapshots` (partitioned monthly) | observability/snapshot-writer | Cumulative-delta snapshots | M65k |
| 16 | `provider_accounts` | provider-accounts | Account-level provider model | M65l |
| 17 | `provider_entitlements` | provider-entitlement-detector | Entitlement detection trail | M65l |
| 18 | `ingest_rate_state` | observability/ingest-rate-state | Per-source state machine | M65m |
| 19 | `governance_health_events` | observability/local-health-channel | Component health audit | M65m |
| 20 | `window_instances` | resource-window-materializer | 90-day forward window materializations | M65m |
| 21 | `recovery_actions` | resource-audit-chain | One-click recovery audit | M65m |
| 22 | `circuit_breaker_state` | resource-circuit-breaker | Persistent breaker state | M65m |
| 23 | `dispatch_decision_log` (partitioned monthly) | resource-decision-writer | Dispatch-feed log (FR-090j retention) | M65m |
| 24 | `token_pricing` | token-pricing-resolver | Facility/workspace pricing | M66 |

## Migration Sequence (Dependency-Ordered)

### M64 — Policy + Decision + Audit + Retention foundation

Extends the empty M60/M61 tables and adds adjacent governance tables. No FKs to M65-introduced tables.

```sql
-- Extend resource_policies (M60 created the table empty)
ALTER TABLE resource_policies ADD COLUMN policy_type TEXT NOT NULL DEFAULT 'wip'
    CHECK (policy_type IN ('wip','budget','window','composite','aegis_emergency_reserve'));
ALTER TABLE resource_policies ADD COLUMN limit_value REAL;
ALTER TABLE resource_policies ADD COLUMN window_spec_json TEXT;
ALTER TABLE resource_policies ADD COLUMN enforce_mode TEXT NOT NULL DEFAULT 'shadow'
    CHECK (enforce_mode IN ('shadow','soft','hard','dry_run'));
ALTER TABLE resource_policies ADD COLUMN enabled_at TEXT;
ALTER TABLE resource_policies ADD COLUMN disabled_at TEXT;
ALTER TABLE resource_policies ADD COLUMN owner_workspace_id INTEGER;
ALTER TABLE resource_policies ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE resource_policies ADD COLUMN etag TEXT;
ALTER TABLE resource_policies ADD COLUMN priority_rank INTEGER NOT NULL DEFAULT 100;
ALTER TABLE resource_policies ADD COLUMN notes TEXT;
ALTER TABLE resource_policies ADD COLUMN policy_config_json TEXT;
ALTER TABLE resource_policies ADD COLUMN created_by TEXT;
ALTER TABLE resource_policies ADD COLUMN updated_by TEXT;
CREATE INDEX IF NOT EXISTS idx_resource_policies_scope_type ON resource_policies(scope, policy_type, enabled_at);
CREATE INDEX IF NOT EXISTS idx_resource_policies_workspace ON resource_policies(owner_workspace_id);

-- Extend resource_policy_events to be the decision row table
ALTER TABLE resource_policy_events ADD COLUMN decision_id TEXT NOT NULL DEFAULT '';
ALTER TABLE resource_policy_events ADD COLUMN evaluator_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE resource_policy_events ADD COLUMN policy_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resource_policy_events ADD COLUMN precedence_rank INTEGER;
ALTER TABLE resource_policy_events ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resource_policy_events ADD COLUMN latency_ms REAL;
ALTER TABLE resource_policy_events ADD COLUMN breaker_state TEXT;
ALTER TABLE resource_policy_events ADD COLUMN evaluation_snapshot_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_policy_events_decision_id ON resource_policy_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_resource_policy_events_task_ts ON resource_policy_events(task_id, ts DESC);

-- New audit chain table
CREATE TABLE IF NOT EXISTS resource_decision_audit (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id TEXT NOT NULL,
  actor_origin TEXT,
  kind TEXT NOT NULL,        -- policy_edited|grant_created|grant_revoked|breaker_reset|recovery_action|...
  target_kind TEXT NOT NULL, -- policy|grant|breaker|reservation|...
  target_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  prev_hash TEXT NOT NULL,
  curr_hash TEXT NOT NULL,
  workspace_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_resource_decision_audit_ts ON resource_decision_audit(ts DESC);
CREATE INDEX IF NOT EXISTS idx_resource_decision_audit_target ON resource_decision_audit(target_kind, target_id);

-- Retention policy
CREATE TABLE IF NOT EXISTS retention_policy (
  table_name TEXT PRIMARY KEY,
  horizon_days INTEGER NOT NULL,
  workspace_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO retention_policy(table_name, horizon_days) VALUES
  ('raw_usage_events', 30),
  ('canonical_usage_events', 180),
  ('resource_budget_ledger', 365),
  ('snapshots', 90),
  ('resource_policy_events', 90),
  ('resource_decision_audit', 365),
  ('dispatch_decision_log', 30);
```

**Rollback**: `docs/migrations/rollback-M64.sql` issues explicit reverse: drop the 4 new tables; for ALTER TABLE ADD COLUMN reversals, recreate `resource_policies` and `resource_policy_events` from the M60/M61 baseline schema and copy data without the new columns (full procedure documented in the rollback file).

### M65a — Source Emission Capability Registry

```sql
CREATE TABLE IF NOT EXISTS source_emission_capability (
  source_id TEXT PRIMARY KEY,
  -- e.g. 'native_otel', 'cli_stdout_json', 'transcript_replay', 'cli_mcp_serve',
  --      'gateway_otel', 'manual_post', 'provider_quota'
  display_name TEXT NOT NULL,
  units_emitted_json TEXT NOT NULL,             -- ['tokens_in','tokens_out','usd',...]
  fields_present_json TEXT NOT NULL,
  refresh_cadence_seconds INTEGER NOT NULL,
  enforcement_eligibility TEXT NOT NULL CHECK (enforcement_eligibility IN ('hard','soft','advisory')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO source_emission_capability(source_id, display_name, units_emitted_json, fields_present_json, refresh_cadence_seconds, enforcement_eligibility) VALUES
  ('native_otel', 'Claude Code OTel', '["tokens_in","tokens_out","usd","cache_read","cache_creation"]', '["session_id","model","request_id"]', 0, 'hard'),
  ('cli_stdout_json', 'Codex CLI stdout', '["tokens_in","tokens_out","usd"]', '["provider_request_id","provider_timestamp_ms","model"]', 0, 'soft'),  -- FR-082 default; promoted to 'hard' on spike confirm
  ('transcript_replay', 'Claude Code transcript replay', '["tokens_in","tokens_out","usd","cache_read","cache_creation"]', '["session_id","model","request_id"]', 30, 'hard'),
  ('cli_mcp_serve', 'Claude Code mcp serve transcript', '["tokens_in","tokens_out","usd"]', '["session_id","request_id"]', 30, 'soft'),  -- FR-071a
  ('gateway_otel', 'OpenClaw gateway OTel', '["tokens_in","tokens_out","usd"]', '["provider_request_id","session_id"]', 0, 'hard'),
  ('codex_rollout', 'Codex rollout file', '["tokens_in","tokens_out","usd"]', '["provider_request_id","provider_timestamp_ms"]', 30, 'hard'),
  ('copilot_events', 'Copilot CLI events.jsonl', '["requests","credits","cost_usd"]', '["session_id","copilot_version"]', 30, 'soft'),
  ('ollama_log', 'Ollama log adapter', '["tokens_in","tokens_out"]', '["model"]', 30, 'advisory'),
  ('lm_studio_log', 'LM Studio log adapter', '["tokens_in","tokens_out"]', '["model"]', 30, 'advisory'),
  ('manual_post', 'Operator POST /api/tokens', '["tokens_in","tokens_out","usd"]', '["task_id","workspace_id"]', 0, 'soft'),
  ('provider_quota', 'Provider quota fetcher', '["pct_remaining"]', '[]', 60, 'advisory');
```

### M65b — Raw Usage Events

```sql
CREATE TABLE IF NOT EXISTS raw_usage_events (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  ingest_ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider TEXT,
  provider_request_id TEXT,
  provider_timestamp_ms INTEGER,
  session_id TEXT,
  task_id TEXT,
  workspace_id INTEGER,
  model TEXT,
  parser_version TEXT,            -- FR-090d
  schema_version_observed TEXT,   -- FR-090d
  raw_attributes_json TEXT NOT NULL,
  redaction_status TEXT NOT NULL DEFAULT 'redacted',
  reconcile_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reconcile_status IN ('pending','canonicalized','dropped','schema_broken','quarantined')),
  partition_month TEXT NOT NULL,  -- 'YYYY-MM' for retention sweeps
  FOREIGN KEY(source_id) REFERENCES source_emission_capability(source_id)
);
CREATE INDEX IF NOT EXISTS idx_raw_usage_events_source_ts ON raw_usage_events(source_id, ingest_ts DESC);
CREATE INDEX IF NOT EXISTS idx_raw_usage_events_dedupe ON raw_usage_events(provider_request_id, provider_timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_raw_usage_events_partition ON raw_usage_events(partition_month);
CREATE INDEX IF NOT EXISTS idx_raw_usage_events_reconcile ON raw_usage_events(reconcile_status, ingest_ts);
```

### M65c — Canonical Usage Events

```sql
CREATE TABLE IF NOT EXISTS canonical_usage_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_request_id TEXT,
  provider_timestamp_ms INTEGER,
  session_id TEXT,
  task_id TEXT,
  workspace_id INTEGER,
  model TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cache_read_in INTEGER,
  cache_creation_in INTEGER,
  cost_usd REAL,
  provenance TEXT NOT NULL CHECK (provenance IN ('single','merged','corrected')),
  merge_sources_json TEXT,         -- raw_usage_event ids[]
  join_confidence TEXT NOT NULL DEFAULT 'high' CHECK (join_confidence IN ('high','medium','low')),
  dedupe_confidence TEXT NOT NULL DEFAULT 'high' CHECK (dedupe_confidence IN ('high','medium','low')),
  posted_at TEXT,
  ingest_ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  partition_month TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_dedup
  ON canonical_usage_events(provider, provider_request_id, provider_timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_canonical_workspace_posted ON canonical_usage_events(workspace_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_canonical_partition ON canonical_usage_events(partition_month);
```

### M65d — Canonical Budget Effects (Posted-Effect Tracking, Q30)

```sql
CREATE TABLE IF NOT EXISTS canonical_budget_effects (
  canonical_event_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_amount REAL NOT NULL,
  applied_unit TEXT NOT NULL,
  ledger_entry_id INTEGER,
  PRIMARY KEY (canonical_event_id, policy_id),
  FOREIGN KEY(canonical_event_id) REFERENCES canonical_usage_events(id),
  FOREIGN KEY(policy_id) REFERENCES resource_policies(id)
);
CREATE INDEX IF NOT EXISTS idx_canonical_budget_effects_policy ON canonical_budget_effects(policy_id, applied_at);
```

### M65e — Resource Budget Ledger

```sql
CREATE TABLE IF NOT EXISTS resource_budget_ledger (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  account_id INTEGER,
  policy_id INTEGER NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('usd','tokens_in','tokens_out','tokens_total','requests','sessions')),
  delta REAL NOT NULL,
  source TEXT NOT NULL,         -- 'canonical'|'correction'|'aegis_emergency'|'override_consume'|'reservation_release'
  source_event_id INTEGER,
  reservation_id INTEGER,
  balance_after REAL NOT NULL,
  partition_month TEXT NOT NULL,
  FOREIGN KEY(policy_id) REFERENCES resource_policies(id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_policy_ts ON resource_budget_ledger(policy_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_partition ON resource_budget_ledger(partition_month);
CREATE INDEX IF NOT EXISTS idx_ledger_source_event ON resource_budget_ledger(source_event_id);
```

### M65f — Resource Budget Counters

```sql
CREATE TABLE IF NOT EXISTS resource_budget_counters (
  policy_id INTEGER NOT NULL,
  window_id TEXT NOT NULL,         -- e.g. '2026-05-02:24h' for calendar-daily
  counter_value REAL NOT NULL DEFAULT 0,
  reserved_value REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  pending_rebuild_job_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (policy_id, window_id),
  FOREIGN KEY(policy_id) REFERENCES resource_policies(id)
);
```

### M65g — Resource Reservations

```sql
CREATE TABLE IF NOT EXISTS resource_reservations (
  id INTEGER PRIMARY KEY,
  policy_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  reserved_window_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','consumed','released','expired')),
  granted_by TEXT,
  originating_decision_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(policy_id) REFERENCES resource_policies(id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_state_expiry ON resource_reservations(state, expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_policy_window ON resource_reservations(policy_id, reserved_window_id);
```

### M65h — Resource Overrides

```sql
CREATE TABLE IF NOT EXISTS resource_overrides (
  id INTEGER PRIMARY KEY,
  reservation_id INTEGER NOT NULL,
  originating_decision_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ttl_seconds INTEGER NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  justification TEXT,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','consumed','released','expired','revoked')),
  workspace_id INTEGER,
  FOREIGN KEY(reservation_id) REFERENCES resource_reservations(id)
);
CREATE INDEX IF NOT EXISTS idx_overrides_state ON resource_overrides(state);
CREATE INDEX IF NOT EXISTS idx_overrides_decision ON resource_overrides(originating_decision_id);
```

### M65i — Reconciliation Batches

```sql
CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  events_in INTEGER,
  events_deduped INTEGER,
  events_corrected INTEGER,
  latency_ms REAL,
  last_error TEXT,
  cursor TEXT,
  snapshot_id_range_start INTEGER,
  snapshot_id_range_end INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(source_id) REFERENCES source_emission_capability(source_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_batches_source_window ON reconciliation_batches(source_id, window_start);
CREATE INDEX IF NOT EXISTS idx_recon_batches_status ON reconciliation_batches(status, created_at);
```

### M65j — Correction Ledger

```sql
CREATE TABLE IF NOT EXISTS correction_ledger (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  canonical_event_id INTEGER NOT NULL,
  net_delta_json TEXT NOT NULL,    -- {tokens_in: +N, usd: -X, ...}
  reason TEXT NOT NULL,            -- 'late_arrival'|'dedup_rollback'|'parser_correction'|...
  applied INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(canonical_event_id) REFERENCES canonical_usage_events(id)
);
CREATE INDEX IF NOT EXISTS idx_correction_ledger_canonical ON correction_ledger(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_correction_ledger_unapplied ON correction_ledger(applied, ts) WHERE applied = 0;
```

### M65k — Snapshots

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  workspace_id INTEGER,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  cumulative_tokens_in INTEGER,
  cumulative_tokens_out INTEGER,
  cumulative_cost_usd REAL,
  source_capability_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  partition_month TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES source_emission_capability(source_id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_source_window ON snapshots(source_id, window_start);
CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON snapshots(workspace_id, window_start);
CREATE INDEX IF NOT EXISTS idx_snapshots_partition ON snapshots(partition_month);
```

### M65l — Provider Accounts + Entitlements

```sql
CREATE TABLE IF NOT EXISTS provider_accounts (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN
    ('subscription_pro','subscription_max','subscription_pro_plus','metered_api',
     'local_ollama','local_lm_studio','gateway_metered')),
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('subscription_capped','metered_usd','local_zero_cost')),
  entitlements_json TEXT,
  config_json_encrypted BLOB,
  config_iv BLOB,
  config_tag BLOB,
  tos_acknowledged_at TEXT,
  tos_version TEXT,
  automation_class TEXT NOT NULL DEFAULT 'permitted'
    CHECK (automation_class IN ('permitted','restricted','forbidden')),
  daily_token_cap INTEGER,
  monthly_token_cap INTEGER,
  daily_usd_cap REAL,
  monthly_usd_cap REAL,
  workspace_id INTEGER,
  soft_deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON provider_accounts(provider, soft_deleted_at);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_workspace ON provider_accounts(workspace_id, soft_deleted_at);

CREATE TABLE IF NOT EXISTS provider_entitlements (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detection_method TEXT NOT NULL,   -- 'daily_cron'|'expiry_window'|'on_admission_inline'
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  tier TEXT,
  rate_limits_json TEXT,
  monthly_token_cap INTEGER,
  refresh_cadence_seconds INTEGER,
  observable_signal_json TEXT,
  FOREIGN KEY(account_id) REFERENCES provider_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_entitlements_account ON provider_entitlements(account_id, effective_at DESC);

-- Migrate provider_subscriptions if rows exist (idempotent INSERT OR IGNORE)
-- (full migration logic in M65l SQL file; details captured here for plan transparency)
```

### M65m — State Machines + Window Instances + Recovery Audit + Final FK Check

```sql
CREATE TABLE IF NOT EXISTS ingest_rate_state (
  source_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN
    ('healthy','rate_limited','circuit_open','degraded','disk_full_pause','schema_broken_quarantine')),
  events_per_min REAL,
  bytes_per_sec REAL,
  drops_per_min INTEGER,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detail_json TEXT,
  FOREIGN KEY(source_id) REFERENCES source_emission_capability(source_id)
);

CREATE TABLE IF NOT EXISTS governance_health_events (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  component TEXT NOT NULL,        -- 'collector'|'reconciler'|'breaker'|'ingest'|'reservation_reaper'|...
  state TEXT NOT NULL,            -- 'healthy'|'degraded'|'unhealthy'|'restarting'|'open'|'closed'|...
  metric_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_health_events_component_ts ON governance_health_events(component, ts DESC);

CREATE TABLE IF NOT EXISTS window_instances (
  id INTEGER PRIMARY KEY,
  policy_id INTEGER NOT NULL,
  instance_start_utc TEXT NOT NULL,
  instance_end_utc TEXT NOT NULL,
  instance_local_label TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(policy_id) REFERENCES resource_policies(id)
);
CREATE INDEX IF NOT EXISTS idx_window_instances_policy_start ON window_instances(policy_id, instance_start_utc);
CREATE INDEX IF NOT EXISTS idx_window_instances_active ON window_instances(instance_start_utc, instance_end_utc);

CREATE TABLE IF NOT EXISTS recovery_actions (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operator_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  -- 'restart_collector'|'force_resume_hard_enforcement'|'manually_close_breaker'|
  -- 'top_up_reserve'|'pause_aegis'|'force_local_mode'|'run_rebuild'|'mark_acknowledged'|
  -- 'backup_acknowledged_no_offnode'
  target TEXT,
  idempotency_key TEXT,
  detail_json TEXT,
  audit_chain_id INTEGER,
  FOREIGN KEY(audit_chain_id) REFERENCES resource_decision_audit(id)
);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_kind_ts ON recovery_actions(kind, ts DESC);

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  scope_key TEXT PRIMARY KEY,    -- 'evaluator' | 'source:<source_id>' | 'reservation_reaper' | ...
  state TEXT NOT NULL CHECK (state IN ('closed','half_open','open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  half_open_probe_budget INTEGER,
  opened_at TEXT,
  last_transition_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deterministic_clock_value INTEGER
);

CREATE TABLE IF NOT EXISTS dispatch_decision_log (
  id INTEGER PRIMARY KEY,
  decision_id TEXT NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  workspace_id INTEGER,
  decision TEXT NOT NULL,        -- 'allow'|'defer'|'block'
  reasons_json TEXT NOT NULL,
  policy_ids_json TEXT NOT NULL,
  precedence_rank INTEGER,
  latency_ms REAL,
  breaker_state TEXT,
  evaluation_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  partition_month TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispatch_decision_log_cursor
  ON dispatch_decision_log(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_decision_log_task
  ON dispatch_decision_log(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_decision_log_filter
  ON dispatch_decision_log(agent_id, decision, created_at DESC);

-- Final integrity guard
PRAGMA foreign_key_check;
```

### M66 — Token Pricing (FR-260a)

```sql
CREATE TABLE IF NOT EXISTS token_pricing (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('facility','workspace')),
  scope_id INTEGER,
  input_per_mtok_usd REAL NOT NULL,
  output_per_mtok_usd REAL NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'operator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_pricing_unique
  ON token_pricing(provider, model, scope_kind, IFNULL(scope_id,0), effective_at);
CREATE INDEX IF NOT EXISTS idx_token_pricing_lookup
  ON token_pricing(provider, model, scope_kind, scope_id, effective_at);
-- Seed from existing src/lib/token-pricing.ts as scope_kind='facility', scope_id=NULL, source='facility-default'
```

### Final Migration-Suite PRAGMA

After M65m (and again after M66), the migration runner asserts:

```sql
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Any non-`ok` row aborts the migration and triggers operator-visible alert per FR-247.

## Foreign Key Graph (Summary)

```text
source_emission_capability ──┬─< raw_usage_events
                             ├─< snapshots
                             ├─< reconciliation_batches
                             └─< ingest_rate_state

raw_usage_events     ──< canonical_usage_events.merge_sources_json (weak ref by id list)
canonical_usage_events ──┬─< canonical_budget_effects
                         ├─< correction_ledger
                         └─< resource_budget_ledger.source_event_id (weak ref)

resource_policies ──┬─< resource_budget_counters
                    ├─< resource_budget_ledger
                    ├─< resource_reservations
                    ├─< canonical_budget_effects
                    └─< window_instances

resource_reservations ──< resource_overrides

provider_accounts ──< provider_entitlements

resource_decision_audit ──< recovery_actions
```

## Index Strategy Summary

- **Hot path** (admission): single-row lookup `(policy_id, window_id)` on `resource_budget_counters` (PK).
- **Reconciler**: `(provider_request_id, provider_timestamp_ms)` on `raw_usage_events` for join; UNIQUE on canonical for dedup.
- **Retention sweep**: `partition_month` index on every monthly-partitioned table.
- **Diagnostic feed (FR-090j cursor)**: composite `(created_at DESC, id DESC)` on `dispatch_decision_log`.
- **Drift detector**: stratified scan via `(source_id, ingest_ts DESC)` on `raw_usage_events`.
- **Reaper**: `(state, expires_at)` on `resource_reservations` for `WHERE state='active' AND expires_at < now`.
- **Audit chain integrity**: `(ts DESC)` and `(target_kind, target_id)` for chain verification + target lookup.

## Partitioning Strategy

Tables marked "partitioned monthly" carry a `partition_month TEXT NOT NULL` column with format `YYYY-MM`. Retention sweep:

1. `DELETE FROM <table> WHERE partition_month < ?` for archive cutover.
2. Pre-archive: `INSERT INTO archive_<table>_YYYY_MM SELECT * FROM <table> WHERE partition_month = ?`.
3. Archive partitions persisted to `<MISSION_CONTROL_DATA_DIR>/archives/<table>-YYYY-MM.sqlite` (self-describing per FR-252).

Sweep is idempotent (checksum + row-count verification) and auditable (`retention_sweep` audit row per FR-253).

## Non-Schema State

The following non-DB state files are referenced in research/contracts/quickstart:

- `<MISSION_CONTROL_DATA_DIR>/runtime-config.json` — Ollama proxy port (FR-260b).
- `<MISSION_CONTROL_DATA_DIR>/otelcol/config.yaml` — collector config (FR-090f).
- `<MISSION_CONTROL_DATA_DIR>/otelcol/config.<unix-ts>.yaml.bak` — config history.
- `<MISSION_CONTROL_DATA_DIR>/otelcol/filestorage/` — collector WAL (FR-090g; included in backup).
- `<MISSION_CONTROL_DATA_DIR>/backups/` — daily incremental snapshots (FR-090k).
- `~/.config/systemd/user/otelcol-contrib.service.d/secret.conf` — collector API-key drop-in (FR-090c).

## Validation Hooks

- `M65m` runs `PRAGMA foreign_key_check` + `PRAGMA integrity_check` and aborts on non-`ok`.
- Each rollback file is **independently** runnable and idempotent (matching SPEC-001 pattern).
- `tests/integration/migrations-spec-008.test.ts` exercises forward + rollback for all 15 migrations on a fresh DB and on a DB pre-populated with M53-M61 data.

---

**Data model status**: Complete. 24 tables across M64 + M65a..M65m + M66 (15 migrations). FK graph is acyclic; index strategy supports admission p95 < 15 ms target. 0 NEEDS CLARIFICATION; 0 violations of Constitution Principle VII / Convention G.
