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

## 4. Mitigate

- Pause governance writers.
- Take a snapshot before applying rollback.

## 5. Recover

1. Apply the rollback SQL inside one transaction.
2. Delete the migration row from `schema_migrations`.
3. Re-deploy without the offending migration.

## 6. Validate

- Audit-chain verifier `ok=true`.
- Smoke-test the affected feature.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-migration-rollback.md`.
- Update `docs/migrations/rollback-procedure.md` if the procedure
  needed an exception path.
