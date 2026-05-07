import Database from 'better-sqlite3'
import path from 'node:path'

const E2E_DB_PATH = process.env.MISSION_CONTROL_DB_PATH ||
  path.join(process.cwd(), '.tmp', 'e2e-openclaw', 'local', 'data', 'mission-control.db')

export function seedWorkflowContractDiagnosticsForE2E() {
  const db = new Database(E2E_DB_PATH)
  try {
    ensureTables(db)
    db.transaction(() => {
      db.prepare("DELETE FROM workflow_contract_run_errors WHERE run_id IN (SELECT id FROM workflow_contract_runs WHERE family = 'mission-control' AND workspace_id = 1)").run()
      db.prepare("DELETE FROM workflow_contract_runs WHERE family = 'mission-control' AND workspace_id = 1").run()
      const result = db.prepare(`
        INSERT INTO workflow_contract_runs (
          family, workspace_id, mode, status, mutation_status, source_path, contract_hash,
          diff_json, template_counts_json, error_count, recovery_command, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        'mission-control',
        1,
        'import_dry_run',
        'validation_failed',
        'not_mutated',
        'docs/ai/workflows/mission-control/workflow-contract.yaml',
        'workflow-contract-hash-v1:sha256:e2e',
        JSON.stringify({ create: [{ slug: 'intake' }], update: [], disable: [], unchanged: [] }),
        JSON.stringify({ create: 1, update: 0, disable: 0, unchanged: 0 }),
        1,
        'pnpm workflow-contract recover --workspace-id 1 --apply'
      )
      db.prepare(`
        INSERT INTO workflow_contract_run_errors (
          run_id, code, manifest_path, canonical_model_path, template_slug,
          message, remediation_hint, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(result.lastInsertRowid),
        'UNKNOWN_TEMPLATE_VARIABLE',
        'docs/ai/workflows/mission-control/workflow-contract.yaml',
        'templates[0].task_prompt',
        'intake',
        'Template variable namespace is not allowed',
        'Use an allowed namespace.',
        '[REDACTED]'
      )
    })()
    db.pragma('wal_checkpoint(PASSIVE)')
  } finally {
    db.close()
  }
}

function ensureTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_contract_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      mutation_status TEXT NOT NULL,
      source_path TEXT,
      export_path TEXT,
      contract_hash TEXT,
      routing_hashes_json TEXT,
      output_schema_hashes_json TEXT,
      diff_json TEXT NOT NULL DEFAULT '{}',
      template_counts_json TEXT NOT NULL DEFAULT '{}',
      error_count INTEGER NOT NULL DEFAULT 0,
      lkg_snapshot_id INTEGER,
      recovery_command TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_contract_run_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_contract_runs(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      manifest_path TEXT,
      canonical_model_path TEXT,
      template_slug TEXT,
      message TEXT NOT NULL,
      remediation_hint TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}
