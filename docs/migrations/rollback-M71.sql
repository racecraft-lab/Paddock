-- Rollback for M71 workflow contract diagnostics.
-- Rerun-safe inverse of additive migration 071_workflow_contract_diagnostics.

DROP INDEX IF EXISTS idx_workflow_contract_snapshots_family_workspace_created;
DROP INDEX IF EXISTS idx_workflow_contract_run_errors_run_id;
DROP INDEX IF EXISTS idx_workflow_contract_runs_family_workspace_created;
DROP TABLE IF EXISTS workflow_contract_snapshots;
DROP TABLE IF EXISTS workflow_contract_run_errors;
DROP TABLE IF EXISTS workflow_contract_runs;
