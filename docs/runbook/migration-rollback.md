# Runbook: Migration Rollback

> Status: SPEC-008 T216 (FR-264, FR-090l)

---

## 1. Symptom

- Schema migration fails post-deploy.
- Or: a migration produces unexpected behavior, requiring a rollback.

## 2. Impact

- Roll-forward is preferred. Rollback should be last-resort because
  the audit chain is append-only.

## 3. Diagnose

1. Capture the failing migration id from `schema_migrations`.
2. Pull the corresponding rollback SQL from
   `docs/migrations/rollback-M*.sql`.
3. For SPEC-013A1 GitHub sync lifecycle failures, confirm whether
   `077_github_sync_lifecycle` is present and whether
   `FEATURE_GITHUB_SYNC_AUTOMATION` or per-repository lifecycle controls can
   be disabled before any schema rollback is considered.

## 4. Mitigate

- Pause governance writers.
- Take a snapshot before applying rollback.
- For `077_github_sync_lifecycle`, first disable
  `FEATURE_GITHUB_SYNC_AUTOMATION` or disable the affected lifecycle control
  through `PATCH /api/github/sync/control`. Manual GitHub sync remains the
  fallback path while automatic polling is disabled.

## 5. Recover

1. Apply the rollback SQL inside one transaction.
2. Delete the migration row from `schema_migrations`.
3. Re-deploy without the offending migration.

SPEC-013A1 rollback SQL:

```bash
sqlite3 "$MISSION_CONTROL_DATA_DIR/mission-control.db" < docs/migrations/rollback-M77.sql
```

`rollback-M77.sql` drops only the GitHub sync lifecycle tables and leaves
legacy GitHub-linked tasks and `github_syncs` rows readable.

## 6. Validate

- Audit-chain verifier `ok=true`.
- Smoke-test the affected feature.
- For SPEC-013A1, verify `GET /api/github/sync` still returns compatibility
  fields (`syncs`, `poller`) and manual sync actions still work. If the
  lifecycle schema is absent, the lifecycle envelope must be empty or report
  schema unavailable rather than breaking the endpoint.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-migration-rollback.md`.
- Update `docs/migrations/rollback-procedure.md` if the procedure
  needed an exception path.
