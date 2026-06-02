import Database from 'better-sqlite3'
import type { WorkflowContract } from '@/lib/workflow-contracts/types'

export function makeContract(overrides: Partial<WorkflowContract> = {}): WorkflowContract {
  return {
    family: 'paddock',
    version: 'workflow-contract-v1',
    workspace_id: 1,
    allowed_variable_namespaces: ['workspace', 'task', 'operator', 'github'],
    templates: [
      {
        slug: 'intake',
        name: 'Paddock Intake',
        description: 'Create the first implementation task.',
        model: 'sonnet',
        task_prompt: 'Review {{task.title}} for {{workspace.name}}.',
        timeout_seconds: 300,
        agent_role: 'planner',
        tags: ['paddock'],
        tracker: {
          type: 'github',
          identity_version: 'v1',
          repo: 'racecraft-lab/Paddock',
          labels: ['paddock'],
        },
        capabilities: ['codebase-read'],
        adapter_requirements: ['codex-cli'],
        feature_flags: ['FEATURE_RC_FACTORY_WORKFLOWS'],
        governance: { budget_policy: 'advisory' },
        concurrency: { max_parallel: 1 },
        retry: { max_attempts: 0 },
        sandbox: { mode: 'workspace-write' },
        prompt_version: 'v1',
        routing_rules: [],
        output_schema: {
          type: 'object',
          additionalProperties: false,
          required: ['summary'],
          properties: { summary: { type: 'string' } },
        },
      },
    ],
    ...overrides,
  }
}

export function makeWorkflowDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      task_prompt TEXT NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 300,
      agent_role TEXT,
      tags TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      slug TEXT,
      output_schema TEXT,
      routing_rules TEXT,
      next_template_slug TEXT,
      produces_pr INTEGER NOT NULL DEFAULT 0,
      external_terminal_event TEXT,
      allow_redacted_artifacts INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX idx_workflow_templates_workspace_slug
      ON workflow_templates(workspace_id, slug)
      WHERE slug IS NOT NULL;

    CREATE TABLE workflow_contract_runs (
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
    CREATE TABLE workflow_contract_run_errors (
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
    CREATE TABLE workflow_contract_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      contract_hash TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      runtime_templates_json TEXT NOT NULL,
      recovery_command TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  return db
}
