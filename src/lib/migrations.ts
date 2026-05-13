import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { MODEL_PRICING } from './token-pricing'

export type Migration = {
  id: string
  up: (db: Database.Database) => void
}

// Plugin hook: extensions can register additional migrations without modifying this file.
const extraMigrations: Migration[] = []
export function registerMigrations(newMigrations: Migration[]): void {
  extraMigrations.push(...newMigrations)
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { ok?: number } | undefined
  return row?.ok === 1
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((entry) => entry.name === column)
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  if (!tableExists(db, table) || columnExists(db, table, column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

const migrations: Migration[] = [
  {
    id: '001_init',
    up: (db) => {
      const schemaPath = join(process.cwd(), 'src', 'lib', 'schema.sql')
      const schema = readFileSync(schemaPath, 'utf8')
      const statements = schema.split(';').filter((stmt) => stmt.trim())
      db.transaction(() => {
        for (const statement of statements) {
          db.exec(statement.trim())
        }
      })()
    }
  },
  {
    id: '002_quality_reviews',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quality_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          reviewer TEXT NOT NULL,
          status TEXT NOT NULL,
          notes TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quality_reviews_task_id ON quality_reviews(task_id);
        CREATE INDEX IF NOT EXISTS idx_quality_reviews_reviewer ON quality_reviews(reviewer);
      `)
    }
  },
  {
    id: '003_quality_review_status_backfill',
    up: (db) => {
      // Convert existing review tasks to quality_review to enforce the gate
      db.exec(`
        UPDATE tasks
        SET status = 'quality_review'
        WHERE status = 'review';
      `)
    }
  },
  {
    id: '004_messages',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id TEXT NOT NULL,
          from_agent TEXT NOT NULL,
          to_agent TEXT,
          content TEXT NOT NULL,
          message_type TEXT DEFAULT 'text',
          metadata TEXT,
          read_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_agents ON messages(from_agent, to_agent)
      `)
    }
  },
  {
    id: '005_users',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'operator',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_login_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      `)
    }
  },
  {
    id: '006_workflow_templates',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_templates (
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
          use_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_templates_name ON workflow_templates(name);
        CREATE INDEX IF NOT EXISTS idx_workflow_templates_created_by ON workflow_templates(created_by);
      `)
    }
  },
  {
    id: '007_audit_log',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          actor_id INTEGER,
          target_type TEXT,
          target_id INTEGER,
          detail TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
      `)
    }
  },
  {
    id: '008_webhooks',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT,
          events TEXT NOT NULL DEFAULT '["*"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          last_fired_at INTEGER,
          last_status INTEGER,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          webhook_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status_code INTEGER,
          response_body TEXT,
          error TEXT,
          duration_ms INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
        CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
      `)
    }
  },
  {
    id: '009_pipelines',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_pipelines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          use_count INTEGER NOT NULL DEFAULT 0,
          last_used_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pipeline_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          current_step INTEGER NOT NULL DEFAULT 0,
          steps_snapshot TEXT NOT NULL DEFAULT '[]',
          started_at INTEGER,
          completed_at INTEGER,
          triggered_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (pipeline_id) REFERENCES workflow_pipelines(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline_id ON pipeline_runs(pipeline_id);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
        CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_name ON workflow_pipelines(name);
      `)
    }
  },
  {
    id: '010_settings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL DEFAULT 'general',
          updated_by TEXT,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
      `)
    }
  },
  {
    id: '011_alert_rules',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS alert_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          entity_type TEXT NOT NULL,
          condition_field TEXT NOT NULL,
          condition_operator TEXT NOT NULL,
          condition_value TEXT NOT NULL,
          action_type TEXT NOT NULL DEFAULT 'notification',
          action_config TEXT NOT NULL DEFAULT '{}',
          cooldown_minutes INTEGER NOT NULL DEFAULT 60,
          last_triggered_at INTEGER,
          trigger_count INTEGER NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
        CREATE INDEX IF NOT EXISTS idx_alert_rules_entity_type ON alert_rules(entity_type);
      `)
    }
  },
  {
    id: '012_super_admin_tenants',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          linux_user TEXT NOT NULL UNIQUE,
          plan_tier TEXT NOT NULL DEFAULT 'standard',
          status TEXT NOT NULL DEFAULT 'pending',
          openclaw_home TEXT NOT NULL,
          workspace_root TEXT NOT NULL,
          gateway_port INTEGER,
          dashboard_port INTEGER,
          config TEXT NOT NULL DEFAULT '{}',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS provision_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          job_type TEXT NOT NULL DEFAULT 'bootstrap',
          status TEXT NOT NULL DEFAULT 'queued',
          dry_run INTEGER NOT NULL DEFAULT 1,
          requested_by TEXT NOT NULL DEFAULT 'system',
          approved_by TEXT,
          runner_host TEXT,
          idempotency_key TEXT,
          request_json TEXT NOT NULL DEFAULT '{}',
          plan_json TEXT NOT NULL DEFAULT '[]',
          result_json TEXT,
          error_text TEXT,
          started_at INTEGER,
          completed_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS provision_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL,
          level TEXT NOT NULL DEFAULT 'info',
          step_key TEXT,
          message TEXT NOT NULL,
          data TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (job_id) REFERENCES provision_jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
        CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_tenant_id ON provision_jobs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_status ON provision_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_provision_jobs_created_at ON provision_jobs(created_at);
        CREATE INDEX IF NOT EXISTS idx_provision_events_job_id ON provision_events(job_id);
        CREATE INDEX IF NOT EXISTS idx_provision_events_created_at ON provision_events(created_at);
      `)
    }
  },
  {
    id: '013_tenant_owner_gateway',
    up: (db) => {
      // Check if tenants table exists (may not on fresh installs without super-admin)
      const hasTenants = (db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'`
      ).get() as any)
      if (!hasTenants) return

      const columns = db.prepare(`PRAGMA table_info(tenants)`).all() as Array<{ name: string }>
      const hasOwnerGateway = columns.some((c) => c.name === 'owner_gateway')
      if (!hasOwnerGateway) {
        db.exec(`ALTER TABLE tenants ADD COLUMN owner_gateway TEXT`)
      }

      const defaultGatewayName =
        String(process.env.MC_DEFAULT_OWNER_GATEWAY || process.env.MC_DEFAULT_GATEWAY_NAME || 'primary').trim() ||
        'primary'

      // Check if gateways table exists (created lazily by gateways API, not in migrations)
      const hasGateways = (db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='gateways'`
      ).get() as any)

      if (hasGateways) {
        db.prepare(`
          UPDATE tenants
          SET owner_gateway = COALESCE(
            (SELECT name FROM gateways ORDER BY is_primary DESC, id ASC LIMIT 1),
            ?
          )
          WHERE owner_gateway IS NULL OR trim(owner_gateway) = ''
        `).run(defaultGatewayName)
      } else {
        db.prepare(`
          UPDATE tenants
          SET owner_gateway = ?
          WHERE owner_gateway IS NULL OR trim(owner_gateway) = ''
        `).run(defaultGatewayName)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_owner_gateway ON tenants(owner_gateway)`)
    }
  },
  {
    id: '014_auth_google_approvals',
    up: (db) => {
      const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
      const has = (name: string) => userCols.some((c) => c.name === name)

      if (!has('provider')) db.exec(`ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'`)
      if (!has('provider_user_id')) db.exec(`ALTER TABLE users ADD COLUMN provider_user_id TEXT`)
      if (!has('email')) db.exec(`ALTER TABLE users ADD COLUMN email TEXT`)
      if (!has('avatar_url')) db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`)
      if (!has('is_approved')) db.exec(`ALTER TABLE users ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 1`)
      if (!has('approved_by')) db.exec(`ALTER TABLE users ADD COLUMN approved_by TEXT`)
      if (!has('approved_at')) db.exec(`ALTER TABLE users ADD COLUMN approved_at INTEGER`)

      db.exec(`
        UPDATE users
        SET provider = COALESCE(NULLIF(provider, ''), 'local'),
            is_approved = COALESCE(is_approved, 1)
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS access_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL DEFAULT 'google',
          email TEXT NOT NULL,
          provider_user_id TEXT,
          display_name TEXT,
          avatar_url TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
          attempt_count INTEGER NOT NULL DEFAULT 1,
          reviewed_by TEXT,
          reviewed_at INTEGER,
          review_note TEXT,
          approved_user_id INTEGER,
          FOREIGN KEY (approved_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `)

      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email_provider ON access_requests(email, provider)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
    }
  },
  {
    id: '015_missing_indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient, read_at);
        CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor);
        CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
      `)
    }
  },
  {
    id: '016_direct_connections',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS direct_connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          tool_name TEXT NOT NULL,
          tool_version TEXT,
          connection_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'connected',
          last_heartbeat INTEGER,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_direct_connections_agent_id ON direct_connections(agent_id);
        CREATE INDEX IF NOT EXISTS idx_direct_connections_connection_id ON direct_connections(connection_id);
        CREATE INDEX IF NOT EXISTS idx_direct_connections_status ON direct_connections(status);
      `)
    }
  },
  {
    id: '017_github_sync',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_syncs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo TEXT NOT NULL,
          last_synced_at INTEGER NOT NULL DEFAULT (unixepoch()),
          issue_count INTEGER NOT NULL DEFAULT 0,
          sync_direction TEXT NOT NULL DEFAULT 'inbound',
          status TEXT NOT NULL DEFAULT 'success',
          error TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_github_syncs_repo ON github_syncs(repo);
        CREATE INDEX IF NOT EXISTS idx_github_syncs_created_at ON github_syncs(created_at);
      `)
    }
  },
  {
    id: '018_token_usage',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS token_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model TEXT NOT NULL,
          session_id TEXT NOT NULL,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
        CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
      `)
    }
  },
  {
    id: '019_webhook_retry',
    up: (db) => {
      // Add retry columns to webhook_deliveries
      const deliveryCols = db.prepare(`PRAGMA table_info(webhook_deliveries)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => deliveryCols.some((c) => c.name === name)

      if (!hasCol('attempt')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('next_retry_at')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN next_retry_at INTEGER`)
      if (!hasCol('is_retry')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN is_retry INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('parent_delivery_id')) db.exec(`ALTER TABLE webhook_deliveries ADD COLUMN parent_delivery_id INTEGER`)

      // Add circuit breaker column to webhooks
      const webhookCols = db.prepare(`PRAGMA table_info(webhooks)`).all() as Array<{ name: string }>
      if (!webhookCols.some((c) => c.name === 'consecutive_failures')) {
        db.exec(`ALTER TABLE webhooks ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0`)
      }

      // Partial index for retry queue processing
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL`)
    }
  },
  {
    id: '020_claude_sessions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL UNIQUE,
          project_slug TEXT NOT NULL,
          project_path TEXT,
          model TEXT,
          git_branch TEXT,
          user_messages INTEGER NOT NULL DEFAULT 0,
          assistant_messages INTEGER NOT NULL DEFAULT 0,
          tool_uses INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          estimated_cost REAL NOT NULL DEFAULT 0,
          first_message_at TEXT,
          last_message_at TEXT,
          last_user_prompt TEXT,
          is_active INTEGER NOT NULL DEFAULT 0,
          scanned_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_sessions_active ON claude_sessions(is_active) WHERE is_active = 1`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_claude_sessions_project ON claude_sessions(project_slug)`)
    }
  },
  {
    id: '021_workspace_isolation_phase1',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `)

      db.prepare(`
        INSERT OR IGNORE INTO workspaces (id, slug, name, created_at, updated_at)
        VALUES (1, 'default', 'Default Workspace', unixepoch(), unixepoch())
      `).run()

      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'users',
        'user_sessions',
        'tasks',
        'agents',
        'comments',
        'activities',
        'notifications',
        'quality_reviews',
        'standup_reports',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_workspace_id ON users(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_workspace_id ON user_sessions(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_workspace_id ON comments(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_workspace_id ON activities(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_quality_reviews_workspace_id ON quality_reviews(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_standup_reports_workspace_id ON standup_reports(workspace_id)`)
    }
  },
  {
    id: '022_workspace_isolation_phase2',
    up: (db) => {
      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'messages',
        'alert_rules',
        'direct_connections',
        'github_syncs',
        'workflow_pipelines',
        'pipeline_runs',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON messages(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_rules_workspace_id ON alert_rules(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_direct_connections_workspace_id ON direct_connections(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_github_syncs_workspace_id ON github_syncs(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_pipelines_workspace_id ON workflow_pipelines(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workspace_id ON pipeline_runs(workspace_id)`)
    }
  },
  {
    id: '023_workspace_isolation_phase3',
    up: (db) => {
      const addWorkspaceIdColumn = (table: string) => {
        const tableExists = db
          .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(table) as { ok?: number } | undefined
        if (!tableExists?.ok) return

        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'workspace_id')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1`)
        }
        db.exec(`UPDATE ${table} SET workspace_id = COALESCE(workspace_id, 1)`)
      }

      const scopedTables = [
        'workflow_templates',
        'webhooks',
        'webhook_deliveries',
        'token_usage',
      ]

      for (const table of scopedTables) {
        addWorkspaceIdColumn(table)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace_id ON workflow_templates(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhooks_workspace_id ON webhooks(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace_id ON webhook_deliveries(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_id ON token_usage(workspace_id)`)
    }
  },
  {
    id: '024_projects_support',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT,
          ticket_prefix TEXT NOT NULL,
          ticket_counter INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(workspace_id, slug),
          UNIQUE(workspace_id, ticket_prefix)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_workspace_status ON projects(workspace_id, status)`)

      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      if (!taskCols.some((c) => c.name === 'project_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN project_id INTEGER`)
      }
      if (!taskCols.some((c) => c.name === 'project_ticket_no')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN project_ticket_no INTEGER`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project ON tasks(workspace_id, project_id)`)

      const workspaceRows = db.prepare(`SELECT id FROM workspaces ORDER BY id ASC`).all() as Array<{ id: number }>
      const ensureDefaultProject = db.prepare(`
        INSERT OR IGNORE INTO projects (workspace_id, name, slug, description, ticket_prefix, ticket_counter, status, created_at, updated_at)
        VALUES (?, 'General', 'general', 'Default project for uncategorized tasks', 'TASK', 0, 'active', unixepoch(), unixepoch())
      `)
      const getDefaultProject = db.prepare(`
        SELECT id, ticket_counter FROM projects
        WHERE workspace_id = ? AND slug = 'general'
        LIMIT 1
      `)
      const setTaskProject = db.prepare(`
        UPDATE tasks SET project_id = ?
        WHERE workspace_id = ? AND (project_id IS NULL OR project_id = 0)
      `)
      const listProjectTasks = db.prepare(`
        SELECT id FROM tasks
        WHERE workspace_id = ? AND project_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      const setTaskNo = db.prepare(`UPDATE tasks SET project_ticket_no = ? WHERE id = ?`)
      const setProjectCounter = db.prepare(`UPDATE projects SET ticket_counter = ?, updated_at = unixepoch() WHERE id = ?`)

      for (const workspace of workspaceRows) {
        ensureDefaultProject.run(workspace.id)
        const defaultProject = getDefaultProject.get(workspace.id) as { id: number; ticket_counter: number } | undefined
        if (!defaultProject) continue

        setTaskProject.run(defaultProject.id, workspace.id)

        const projectRows = db.prepare(`
          SELECT id FROM projects
          WHERE workspace_id = ?
          ORDER BY id ASC
        `).all(workspace.id) as Array<{ id: number }>

        for (const project of projectRows) {
          const tasks = listProjectTasks.all(workspace.id, project.id) as Array<{ id: number }>
          let counter = 0
          for (const task of tasks) {
            counter += 1
            setTaskNo.run(counter, task.id)
          }
          setProjectCounter.run(counter, project.id)
        }
      }
    }
  },
  {
    id: '025_token_usage_task_attribution',
    up: (db) => {
      const hasTokenUsageTable = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'`)
        .get() as { ok?: number } | undefined

      if (!hasTokenUsageTable?.ok) return

      const cols = db.prepare(`PRAGMA table_info(token_usage)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => cols.some((c) => c.name === name)

      if (!hasCol('task_id')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN task_id INTEGER`)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_task_id ON token_usage(task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_task_time ON token_usage(workspace_id, task_id, created_at)`)
    }
  },
  {
    id: '026_task_outcome_tracking',
    up: (db) => {
      const hasTasks = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`)
        .get() as { ok?: number } | undefined
      if (!hasTasks?.ok) return

      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => taskCols.some((c) => c.name === name)

      if (!hasCol('outcome')) db.exec(`ALTER TABLE tasks ADD COLUMN outcome TEXT`)
      if (!hasCol('error_message')) db.exec(`ALTER TABLE tasks ADD COLUMN error_message TEXT`)
      if (!hasCol('resolution')) db.exec(`ALTER TABLE tasks ADD COLUMN resolution TEXT`)
      if (!hasCol('feedback_rating')) db.exec(`ALTER TABLE tasks ADD COLUMN feedback_rating INTEGER`)
      if (!hasCol('feedback_notes')) db.exec(`ALTER TABLE tasks ADD COLUMN feedback_notes TEXT`)
      if (!hasCol('retry_count')) db.exec(`ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`)
      if (!hasCol('completed_at')) db.exec(`ALTER TABLE tasks ADD COLUMN completed_at INTEGER`)

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_outcome ON tasks(outcome)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_outcome ON tasks(workspace_id, outcome, completed_at)`)
    }
  },
  {
    id: '027_enhanced_projects',
    up: (db) => {
      const hasProjects = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'projects'`)
        .get() as { ok?: number } | undefined
      if (!hasProjects?.ok) return

      const cols = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
      const hasCol = (name: string) => cols.some((c) => c.name === name)

      if (!hasCol('github_repo')) db.exec(`ALTER TABLE projects ADD COLUMN github_repo TEXT`)
      if (!hasCol('deadline')) db.exec(`ALTER TABLE projects ADD COLUMN deadline INTEGER`)
      if (!hasCol('color')) db.exec(`ALTER TABLE projects ADD COLUMN color TEXT`)
      if (!hasCol('metadata')) db.exec(`ALTER TABLE projects ADD COLUMN metadata TEXT`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS project_agent_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          agent_name TEXT NOT NULL,
          role TEXT DEFAULT 'member',
          assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE(project_id, agent_name)
        );
        CREATE INDEX IF NOT EXISTS idx_paa_project ON project_agent_assignments(project_id);
        CREATE INDEX IF NOT EXISTS idx_paa_agent ON project_agent_assignments(agent_name);
      `)
    }
  },
  {
    id: '028_github_sync_v2',
    up: (db) => {
      // Tasks: promote GitHub fields from metadata JSON to proper columns
      const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      const hasTaskCol = (name: string) => taskCols.some((c) => c.name === name)

      if (!hasTaskCol('github_issue_number')) db.exec(`ALTER TABLE tasks ADD COLUMN github_issue_number INTEGER`)
      if (!hasTaskCol('github_repo')) db.exec(`ALTER TABLE tasks ADD COLUMN github_repo TEXT`)
      if (!hasTaskCol('github_synced_at')) db.exec(`ALTER TABLE tasks ADD COLUMN github_synced_at INTEGER`)
      if (!hasTaskCol('github_branch')) db.exec(`ALTER TABLE tasks ADD COLUMN github_branch TEXT`)
      if (!hasTaskCol('github_pr_number')) db.exec(`ALTER TABLE tasks ADD COLUMN github_pr_number INTEGER`)
      if (!hasTaskCol('github_pr_state')) db.exec(`ALTER TABLE tasks ADD COLUMN github_pr_state TEXT`)

      // Unique index for dedup (partial — only rows with issue numbers)
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_github_issue
          ON tasks(workspace_id, github_repo, github_issue_number)
          WHERE github_issue_number IS NOT NULL
      `)

      // Projects: sync control columns
      const projCols = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
      const hasProjCol = (name: string) => projCols.some((c) => c.name === name)

      if (!hasProjCol('github_sync_enabled')) db.exec(`ALTER TABLE projects ADD COLUMN github_sync_enabled INTEGER NOT NULL DEFAULT 0`)
      if (!hasProjCol('github_labels_initialized')) db.exec(`ALTER TABLE projects ADD COLUMN github_labels_initialized INTEGER NOT NULL DEFAULT 0`)
      if (!hasProjCol('github_default_branch')) db.exec(`ALTER TABLE projects ADD COLUMN github_default_branch TEXT DEFAULT 'main'`)

      // Enhanced sync history columns
      const syncCols = db.prepare(`PRAGMA table_info(github_syncs)`).all() as Array<{ name: string }>
      const hasSyncCol = (name: string) => syncCols.some((c) => c.name === name)

      if (!hasSyncCol('project_id')) db.exec(`ALTER TABLE github_syncs ADD COLUMN project_id INTEGER`)
      if (!hasSyncCol('changes_pushed')) db.exec(`ALTER TABLE github_syncs ADD COLUMN changes_pushed INTEGER NOT NULL DEFAULT 0`)
      if (!hasSyncCol('changes_pulled')) db.exec(`ALTER TABLE github_syncs ADD COLUMN changes_pulled INTEGER NOT NULL DEFAULT 0`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_github_syncs_project ON github_syncs(project_id)`)

      // Data migration: copy existing metadata JSON values into new columns
      db.exec(`
        UPDATE tasks
        SET github_repo = json_extract(metadata, '$.github_repo'),
            github_issue_number = json_extract(metadata, '$.github_issue_number'),
            github_synced_at = CAST(strftime('%s', json_extract(metadata, '$.github_synced_at')) AS INTEGER)
        WHERE json_extract(metadata, '$.github_repo') IS NOT NULL
          AND github_repo IS NULL
      `)
    }
  },
  {
    id: '029_link_workspaces_to_tenants',
    up: (db) => {
      const hasWorkspaces = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`)
        .get() as { ok?: number } | undefined
      if (!hasWorkspaces?.ok) return

      const hasTenants = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'tenants'`)
        .get() as { ok?: number } | undefined
      if (!hasTenants?.ok) return

      const workspaceCols = db.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{ name: string }>
      const hasWorkspaceTenantId = workspaceCols.some((c) => c.name === 'tenant_id')
      if (!hasWorkspaceTenantId) {
        db.exec(`ALTER TABLE workspaces ADD COLUMN tenant_id INTEGER`)
      }

      const tenantCount = (db.prepare(`SELECT COUNT(*) as c FROM tenants`).get() as { c: number } | undefined)?.c || 0
      let defaultTenantId: number
      if (tenantCount > 0) {
        const existing = db.prepare(`
          SELECT id
          FROM tenants
          ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
          LIMIT 1
        `).get() as { id: number } | undefined
        if (!existing?.id) throw new Error('Failed to resolve default tenant')
        defaultTenantId = existing.id
      } else {
        const rawHost = String(process.env.MC_HOSTNAME || 'default').trim().toLowerCase()
        const slug = rawHost.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'default'
        const linuxUser = (String(process.env.USER || 'local').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'local').slice(0, 30)
        const home = String(process.env.HOME || '/tmp').trim() || '/tmp'
        const insert = db.prepare(`
          INSERT INTO tenants (slug, display_name, linux_user, plan_tier, status, openclaw_home, workspace_root, config, created_by, owner_gateway)
          VALUES (?, ?, ?, 'standard', 'active', ?, ?, '{}', 'system', ?)
        `).run(
          slug,
          'Local Owner',
          linuxUser,
          `${home}/.openclaw`,
          `${home}/workspace`,
          process.env.MC_DEFAULT_OWNER_GATEWAY || process.env.MC_DEFAULT_GATEWAY_NAME || 'primary'
        )
        defaultTenantId = Number(insert.lastInsertRowid)
      }

      db.prepare(`UPDATE workspaces SET tenant_id = ? WHERE tenant_id IS NULL`).run(defaultTenantId)

      // Ensure session rows can carry tenant context derived from workspace.
      const sessionCols = db.prepare(`PRAGMA table_info(user_sessions)`).all() as Array<{ name: string }>
      if (!sessionCols.some((c) => c.name === 'tenant_id')) {
        db.exec(`ALTER TABLE user_sessions ADD COLUMN tenant_id INTEGER`)
      }
      db.exec(`
        UPDATE user_sessions
        SET tenant_id = (
          SELECT w.tenant_id
          FROM users u
          JOIN workspaces w ON w.id = COALESCE(user_sessions.workspace_id, u.workspace_id, 1)
          WHERE u.id = user_sessions.user_id
          LIMIT 1
        )
        WHERE tenant_id IS NULL
      `)
      db.prepare(`UPDATE user_sessions SET tenant_id = ? WHERE tenant_id IS NULL`).run(defaultTenantId)

      const workspaceFk = db.prepare(`PRAGMA foreign_key_list(workspaces)`).all() as Array<{ table: string; from: string; to: string }>
      const hasTenantFk = workspaceFk.some((fk) => fk.table === 'tenants' && fk.from === 'tenant_id' && fk.to === 'id')
      const tenantCol = (db.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{ name: string; notnull: number }>).find((c) => c.name === 'tenant_id')
      const tenantColNotNull = tenantCol?.notnull === 1

      if (!hasTenantFk || !tenantColNotNull) {
        db.exec(`ALTER TABLE workspaces RENAME TO workspaces__legacy`)
        db.exec(`
          CREATE TABLE workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            tenant_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
          )
        `)
        db.prepare(`
          INSERT INTO workspaces (id, slug, name, tenant_id, created_at, updated_at)
          SELECT id, slug, name, COALESCE(tenant_id, ?), created_at, updated_at
          FROM workspaces__legacy
        `).run(defaultTenantId)
        db.exec(`DROP TABLE workspaces__legacy`)
      }

      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_sessions_workspace_tenant ON user_sessions(workspace_id, tenant_id)`)
    }
  },
  {
    id: '032_adapter_configs',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS adapter_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          framework TEXT NOT NULL,
          config TEXT DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `)
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_adapter_configs_workspace_framework ON adapter_configs(workspace_id, framework)`)
    }
  },
  {
    id: '033_skills',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          path TEXT NOT NULL,
          description TEXT,
          content_hash TEXT,
          registry_slug TEXT,
          registry_version TEXT,
          security_status TEXT DEFAULT 'unchecked',
          installed_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(source, name)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_registry_slug ON skills(registry_slug)`)
    }
  },
  {
    id: '034_agents_source',
    up(db: Database.Database) {
      const cols = db.prepare(`PRAGMA table_info(agents)`).all() as Array<{ name: string }>
      if (!cols.some(c => c.name === 'source')) {
        db.exec(`ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'manual'`)
      }
      if (!cols.some(c => c.name === 'content_hash')) {
        db.exec(`ALTER TABLE agents ADD COLUMN content_hash TEXT`)
      }
      if (!cols.some(c => c.name === 'workspace_path')) {
        db.exec(`ALTER TABLE agents ADD COLUMN workspace_path TEXT`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_source ON agents(source)`)
    }
  },
  {
    id: '035_api_keys_v2',
    up(db: Database.Database) {
      // Previous migrations (027/030) may have created an api_keys table with a different schema.
      // Drop and recreate with the full user-scoped schema.
      const existing = db
        .prepare(`SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'api_keys'`)
        .get() as { ok?: number } | undefined

      if (existing?.ok) {
        db.exec(`DROP TABLE api_keys`)
      }

      db.exec(`
        CREATE TABLE api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          label TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'viewer',
          scopes TEXT,
          expires_at INTEGER,
          last_used_at INTEGER,
          last_used_ip TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          is_revoked INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON api_keys(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`)
    }
  },
  {
    id: '036_recurring_tasks_index',
    up(db: Database.Database) {
      // Index to efficiently find recurring task templates
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_recurring
        ON tasks(workspace_id)
        WHERE json_extract(metadata, '$.recurrence.enabled') = 1
      `)
    }
  },
  {
    id: '037_security_audit',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          source TEXT,
          agent_name TEXT,
          detail TEXT,
          ip_address TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          tenant_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_agent_name ON security_events(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_workspace_id ON security_events(workspace_id)`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_trust_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          trust_score REAL NOT NULL DEFAULT 1.0,
          auth_failures INTEGER NOT NULL DEFAULT 0,
          injection_attempts INTEGER NOT NULL DEFAULT 0,
          rate_limit_hits INTEGER NOT NULL DEFAULT 0,
          secret_exposures INTEGER NOT NULL DEFAULT 0,
          successful_tasks INTEGER NOT NULL DEFAULT 0,
          failed_tasks INTEGER NOT NULL DEFAULT 0,
          last_anomaly_at INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(agent_name, workspace_id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_call_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT,
          mcp_server TEXT,
          tool_name TEXT,
          success INTEGER NOT NULL DEFAULT 1,
          duration_ms INTEGER,
          error TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_agent_name ON mcp_call_log(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_created_at ON mcp_call_log(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_tool_name ON mcp_call_log(tool_name)`)
    }
  },
  {
    id: '038_agent_evals',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          eval_layer TEXT NOT NULL,
          score REAL,
          passed INTEGER,
          detail TEXT,
          golden_dataset_id INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_agent_name ON eval_runs(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_eval_layer ON eval_runs(eval_layer)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_runs_created_at ON eval_runs(created_at)`)

      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_golden_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          entries TEXT NOT NULL DEFAULT '[]',
          created_by TEXT,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(name, workspace_id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS eval_traces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          task_id INTEGER,
          trace TEXT NOT NULL DEFAULT '[]',
          convergence_score REAL,
          total_steps INTEGER,
          optimal_steps INTEGER,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_traces_agent_name ON eval_traces(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_traces_task_id ON eval_traces(task_id)`)
    }
  },
  {
    id: '039_session_costs',
    up(db: Database.Database) {
      const columns = db.prepare(`PRAGMA table_info(token_usage)`).all() as Array<{ name: string }>
      const existing = new Set(columns.map((c) => c.name))

      if (!existing.has('cost_usd')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN cost_usd REAL`)
      }
      if (!existing.has('agent_name')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN agent_name TEXT`)
      }
      if (!existing.has('task_id')) {
        db.exec(`ALTER TABLE token_usage ADD COLUMN task_id INTEGER`)
      }
    }
  },
  {
    id: '040_agent_api_keys',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id INTEGER NOT NULL,
          workspace_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          scopes TEXT NOT NULL DEFAULT '[]',
          expires_at INTEGER,
          revoked_at INTEGER,
          last_used_at INTEGER,
          created_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(workspace_id, key_hash)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent_id ON agent_api_keys(agent_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_workspace_id ON agent_api_keys(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_expires_at ON agent_api_keys(expires_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_revoked_at ON agent_api_keys(revoked_at)`)
    }
  },
  {
    id: '041_gateway_health_logs',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gateway_health_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          gateway_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          latency INTEGER,
          probed_at INTEGER NOT NULL DEFAULT (unixepoch()),
          error TEXT
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_gateway_id ON gateway_health_logs(gateway_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_probed_at ON gateway_health_logs(probed_at)`)
    }
  },
  {
    id: '042_agent_hidden',
    up(db: Database.Database) {
      db.exec(`ALTER TABLE agents ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
    }
  },
  {
    id: '043_hash_session_tokens',
    up(db: Database.Database) {
      // Migrate existing plaintext session tokens to SHA-256 hashes.
      // After this migration, session tokens are stored as hashes — raw tokens
      // are only returned to the client on creation. Existing sessions will be
      // invalidated (users need to re-login).
      const rows = db.prepare('SELECT id, token FROM user_sessions').all() as Array<{ id: number; token: string }>
      const update = db.prepare('UPDATE user_sessions SET token = ? WHERE id = ?')
      for (const row of rows) {
        const hashed = createHash('sha256').update(row.token).digest('hex')
        update.run(hashed, row.id)
      }
    }
  },
  {
    id: '044_spawn_history',
    up(db: Database.Database) {
      db.exec([
        `CREATE TABLE IF NOT EXISTS spawn_history (`,
        `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
        `  agent_id INTEGER,`,
        `  agent_name TEXT NOT NULL,`,
        `  spawn_type TEXT NOT NULL DEFAULT 'claude-code',`,
        `  session_id TEXT,`,
        `  trigger TEXT,`,
        `  status TEXT NOT NULL DEFAULT 'started',`,
        `  exit_code INTEGER,`,
        `  error TEXT,`,
        `  duration_ms INTEGER,`,
        `  workspace_id INTEGER NOT NULL DEFAULT 1,`,
        `  created_at INTEGER NOT NULL DEFAULT (unixepoch()),`,
        `  finished_at INTEGER,`,
        `  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL`,
        `)`,
      ].join('\n'))
      db.exec(`CREATE INDEX IF NOT EXISTS idx_spawn_history_agent ON spawn_history(agent_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_spawn_history_created ON spawn_history(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_spawn_history_status ON spawn_history(status)`)
    }
  },
  {
    id: '045_task_dispatch_attempts',
    up(db: Database.Database) {
      const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
      if (!cols.some(c => c.name === 'dispatch_attempts')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN dispatch_attempts INTEGER NOT NULL DEFAULT 0`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_stale_inprogress ON tasks(status, updated_at) WHERE status = 'in_progress'`)
    }
  },
  {
    id: '046_agent_runs',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          agent_name TEXT,
          model TEXT,
          provider TEXT,
          runtime TEXT DEFAULT 'mission-control',
          runtime_version TEXT,
          trigger_type TEXT,
          parent_run_id TEXT,
          task_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          outcome TEXT,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_ms INTEGER,
          steps TEXT DEFAULT '[]',
          tools_available TEXT DEFAULT '[]',
          cost_input_tokens INTEGER DEFAULT 0,
          cost_output_tokens INTEGER DEFAULT 0,
          cost_cache_read_tokens INTEGER,
          cost_cache_write_tokens INTEGER,
          cost_usd REAL,
          cost_model TEXT,
          run_hash TEXT,
          parent_run_hash TEXT,
          lineage TEXT DEFAULT '[]',
          model_version TEXT,
          config_hash TEXT,
          provenance_runtime TEXT,
          signed_by TEXT,
          signature TEXT,
          provenance_created_at TEXT,
          eval_task_type TEXT,
          eval_layer TEXT,
          eval_pass INTEGER,
          eval_score REAL,
          eval_detail TEXT,
          eval_metrics TEXT,
          eval_benchmark_id TEXT,
          error TEXT,
          git_branch TEXT,
          git_commit TEXT,
          workspace_id INTEGER DEFAULT 1,
          tags TEXT DEFAULT '[]',
          metadata TEXT DEFAULT '{}',
          spawn_history_id INTEGER,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_workspace ON runs(workspace_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_run_hash ON runs(run_hash)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id)`)
    }
  },
  {
    id: '047_agent_working_memory',
    up(db: Database.Database) {
      const cols = db.prepare(`PRAGMA table_info(agents)`).all() as Array<{ name: string }>
      if (!cols.some(c => c.name === 'working_memory')) {
        db.exec(`ALTER TABLE agents ADD COLUMN working_memory TEXT DEFAULT ''`)
      }
    }
  },
  {
    id: '048_memory_fts',
    up(db: Database.Database) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          path,
          title,
          content,
          tokenize='porter unicode61'
        )
      `)
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_fts_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `)
    }
  },
  {
    id: '049_agent_runtime_type',
    up(db: Database.Database) {
      db.exec(`ALTER TABLE agents ADD COLUMN runtime_type TEXT DEFAULT NULL`)
    }
  },
  {
    id: '050_mcp_call_receipt_signing',
    up(db: Database.Database) {
      // Add Ed25519 receipt signing columns to the MCP audit log.
      // payload_hash: SHA-256 of the canonical JSON payload at write time
      // signature: Ed25519 signature (hex) over the canonical payload
      // public_key: base64-encoded Ed25519 public key for offline verification
      db.exec(`ALTER TABLE mcp_call_log ADD COLUMN payload_hash TEXT DEFAULT NULL`)
      db.exec(`ALTER TABLE mcp_call_log ADD COLUMN signature TEXT DEFAULT NULL`)
      db.exec(`ALTER TABLE mcp_call_log ADD COLUMN public_key TEXT DEFAULT NULL`)
    }
  },
  {
    id: '051_security_audit_indexes',
    up(db: Database.Database) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_workspace_created_at ON security_events(workspace_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_workspace_event_type_created_at ON security_events(workspace_id, event_type, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_security_events_workspace_agent_created_at ON security_events(workspace_id, agent_name, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_workspace_created_at ON mcp_call_log(workspace_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_workspace_agent_created_at ON mcp_call_log(workspace_id, agent_name, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_call_log_workspace_tool_created_at ON mcp_call_log(workspace_id, tool_name, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_trust_scores_workspace_trust_score ON agent_trust_scores(workspace_id, trust_score)`)
    }
  },
  {
    id: '052_recalculate_agent_trust_without_rate_limit_hits',
    up(db: Database.Database) {
      db.exec(`
        UPDATE agent_trust_scores
        SET trust_score = MIN(1.0, MAX(0.0,
          1.0
          + (COALESCE(auth_failures, 0) * -0.05)
          + (COALESCE(injection_attempts, 0) * -0.15)
          + (COALESCE(secret_exposures, 0) * -0.20)
          + (COALESCE(successful_tasks, 0) * 0.02)
          + (COALESCE(failed_tasks, 0) * -0.01)
        )),
        updated_at = unixepoch()
      `)
    }
  },
  {
    id: '053_agent_scope',
    up(db: Database.Database) {
      addColumnIfMissing(
        db,
        'agents',
        'scope',
        `scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','global'))`
      )

      if (!columnExists(db, 'agents', 'scope')) return

      db.exec(`
        UPDATE agents
        SET scope = 'global'
        WHERE lower(replace(name, ' ', '-')) IN ('aegis', 'security-guardian', 'hal')
      `)
    }
  },
  {
    id: '054_workflow_templates_task_chain_routing_and_artifact_policy',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'workflow_templates', 'slug', 'slug TEXT')
      addColumnIfMissing(db, 'workflow_templates', 'output_schema', 'output_schema JSON')
      addColumnIfMissing(db, 'workflow_templates', 'routing_rules', 'routing_rules JSON')
      addColumnIfMissing(db, 'workflow_templates', 'next_template_slug', 'next_template_slug TEXT')
      addColumnIfMissing(db, 'workflow_templates', 'produces_pr', 'produces_pr BOOLEAN NOT NULL DEFAULT 0')
      addColumnIfMissing(db, 'workflow_templates', 'external_terminal_event', 'external_terminal_event TEXT')
      addColumnIfMissing(
        db,
        'workflow_templates',
        'allow_redacted_artifacts',
        'allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0'
      )

      if (columnExists(db, 'workflow_templates', 'workspace_id') && columnExists(db, 'workflow_templates', 'slug')) {
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_workspace_slug
          ON workflow_templates(workspace_id, slug)
          WHERE slug IS NOT NULL
        `)
      }
    }
  },
  {
    id: '055_tasks_workflow_template_binding_and_lineage',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'tasks', 'workflow_template_id', 'workflow_template_id INTEGER REFERENCES workflow_templates(id)')
      addColumnIfMissing(db, 'tasks', 'workflow_template_slug', 'workflow_template_slug TEXT')
      addColumnIfMissing(db, 'tasks', 'parent_task_id', 'parent_task_id INTEGER REFERENCES tasks(id)')
      addColumnIfMissing(db, 'tasks', 'root_task_id', 'root_task_id INTEGER REFERENCES tasks(id)')
      addColumnIfMissing(db, 'tasks', 'chain_id', 'chain_id TEXT')
      addColumnIfMissing(db, 'tasks', 'chain_stage', 'chain_stage INTEGER')

      if (!tableExists(db, 'tasks')) return

      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workflow_template_id ON tasks(workflow_template_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workflow_template_slug ON tasks(workflow_template_slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_root_task_id ON tasks(root_task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_chain_id ON tasks(chain_id)`)
    }
  },
  {
    id: '056_workspace_feature_flags',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'workspaces', 'feature_flags', 'feature_flags JSON')
    }
  },
  {
    id: '057_task_dispositions',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_dispositions (
          id INTEGER PRIMARY KEY,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          disposition TEXT NOT NULL,
          reason TEXT,
          triaged_by_agent_id INTEGER REFERENCES agents(id),
          triaged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id)
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispositions_task_id ON task_dispositions(task_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispositions_workspace_triaged_at ON task_dispositions(workspace_id, triaged_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispositions_disposition ON task_dispositions(disposition)`)
    }
  },
  {
    id: '058_task_artifacts',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_artifacts (
          id INTEGER PRIMARY KEY,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
          project_id INTEGER REFERENCES projects(id),
          producer_agent_id INTEGER REFERENCES agents(id),
          workflow_template_slug TEXT,
          artifact_type TEXT NOT NULL,
          schema_version TEXT,
          storage_kind TEXT NOT NULL CHECK (storage_kind IN ('inline_json','inline_markdown','file','external_uri')),
          content_json JSON,
          content_markdown TEXT,
          storage_uri TEXT,
          original_filename TEXT,
          mime_type TEXT,
          byte_size INTEGER,
          sha256 TEXT,
          preview_text TEXT,
          redaction_status TEXT NOT NULL DEFAULT 'pending',
          security_scan_status TEXT NOT NULL DEFAULT 'pending',
          supersedes_artifact_id INTEGER REFERENCES task_artifacts(id),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_created_at ON task_artifacts(task_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_artifacts_workspace_type ON task_artifacts(workspace_id, artifact_type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_artifacts_workflow_template_slug ON task_artifacts(workflow_template_slug)`)
    }
  },
  {
    id: '059_facility_workspace_seed',
    up(db: Database.Database) {
      if (!tableExists(db, 'workspaces') || !tableExists(db, 'tenants')) return
      if (!columnExists(db, 'workspaces', 'tenant_id')) return

      db.exec(`
        INSERT INTO workspaces (slug, name, tenant_id)
        SELECT 'facility', 'Facility', id
        FROM tenants
        WHERE NOT EXISTS (
          SELECT 1 FROM workspaces WHERE slug = 'facility'
        )
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
        LIMIT 1
      `)
    }
  },
  {
    id: '060_resource_policies',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_policies (
          id INTEGER PRIMARY KEY,
          workspace_id INTEGER REFERENCES workspaces(id),
          project_id INTEGER REFERENCES projects(id),
          agent_id INTEGER REFERENCES agents(id),
          agent_role TEXT,
          task_status TEXT,
          workflow_template_slug TEXT,
          provider TEXT,
          model TEXT,
          policy_type TEXT NOT NULL CHECK (policy_type IN ('wip_limit','budget','blackout','degraded_window')),
          limit_kind TEXT NOT NULL,
          limit_value REAL,
          period TEXT,
          timezone TEXT,
          schedule_json JSON,
          enforcement TEXT NOT NULL CHECK (enforcement IN ('alert','defer','pause_new_work','block_dispatch','require_override')),
          soft_threshold_pct REAL DEFAULT 80,
          hard_threshold_pct REAL DEFAULT 100,
          enabled BOOLEAN NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_policies_scope
        ON resource_policies(workspace_id, project_id, agent_id, policy_type, enabled)
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_resource_policies_template ON resource_policies(workflow_template_slug)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_resource_policies_enabled ON resource_policies(enabled)`)
    }
  },
  {
    id: '061_resource_policy_events',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_policy_events (
          id INTEGER PRIMARY KEY,
          policy_id INTEGER REFERENCES resource_policies(id),
          task_id INTEGER REFERENCES tasks(id),
          agent_id INTEGER REFERENCES agents(id),
          decision TEXT NOT NULL CHECK (decision IN ('allow','defer','block','override_required','override')),
          reason TEXT,
          observed_value REAL,
          limit_value REAL,
          metadata JSON,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_resource_policy_events_created_at ON resource_policy_events(created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_resource_policy_events_task ON resource_policy_events(task_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_resource_policy_events_policy ON resource_policy_events(policy_id, created_at)`)
    }
  },
  {
    id: '062_task_successor_unique_parent_index',
    up(db: Database.Database) {
      if (!tableExists(db, 'tasks') || !columnExists(db, 'tasks', 'parent_task_id')) return

      const duplicate = db
        .prepare(`
          SELECT parent_task_id, COUNT(*) as count
          FROM tasks
          WHERE parent_task_id IS NOT NULL
          GROUP BY parent_task_id
          HAVING COUNT(*) > 1
          LIMIT 1
        `)
        .get() as { parent_task_id: number; count: number } | undefined

      if (duplicate) {
        throw new Error(
          `Cannot create idx_tasks_one_successor_per_parent; parent_task_id ${duplicate.parent_task_id} has ${duplicate.count} successors`
        )
      }

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_one_successor_per_parent
        ON tasks(parent_task_id)
        WHERE parent_task_id IS NOT NULL
      `)
    }
  },
  {
    // SPEC-006 - Area-Label GitHub Sync
    //
    // Migration ID rebased from M62 to M63 per docs/migrations/migration-id-reservations.md
    // first-to-merge-keeps-M62 rule. SPEC-004 (PR #22) shipped M62 first.
    //
    // Additive schema delta. All four new columns are NULLABLE per FR-003 /
    // Constitution Article VII. Four indexes - one non-unique covering index
    // and three partial indexes (two partial UNIQUE for owner / triage
    // singletons, one partial covering for backfill scan acceleration).
    //
    // After columns + indexes land, a deterministic owner-election UPDATE
    // assigns is_repo_sync_owner=1 to MIN(projects.id) per
    // (workspace_id, github_repo) group with at least one
    // github_sync_enabled=1 project. Disabled-only groups elect zero owners
    // (FR-005). Re-running the migration is a no-op (idempotent).
    id: '063_area_label_routing_sync_owner_triage',
    up(db: Database.Database) {
      // Defensive guard for minimal-fixture tests (matches the M62 pattern):
      // if `projects` and `tasks` haven't been seeded by the prior migrations,
      // record M63 as applied without doing column work. Production runs
      // migrations from scratch so both tables always exist by this point.
      if (!tableExists(db, 'projects') || !tableExists(db, 'tasks')) return
      addColumnIfMissing(db, 'projects', 'area_slug', 'area_slug TEXT')
      addColumnIfMissing(db, 'projects', 'is_triage_project', 'is_triage_project INTEGER DEFAULT 0')
      addColumnIfMissing(db, 'projects', 'is_repo_sync_owner', 'is_repo_sync_owner INTEGER DEFAULT 0')
      addColumnIfMissing(db, 'tasks', 'area_routing_backfilled_at', 'area_routing_backfilled_at INTEGER')

      // Non-unique covering index for area_slug routing lookups
      // (SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?).
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_projects_workspace_area_slug
        ON projects(workspace_id, area_slug)
      `)

      // Partial UNIQUE - at most one sync-owner per (workspace_id, github_repo).
      // Allows zero owners (group with no enabled projects, or pre-election state).
      // The `github_repo IS NOT NULL` clause is required because UNIQUE indexes
      // treat NULL as distinct in SQLite, so without it multiple
      // is_repo_sync_owner=1 rows with NULL github_repo would coexist and the
      // invariant would be unenforced for unconnected projects.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_sync_owner_per_repo
        ON projects(workspace_id, github_repo)
        WHERE is_repo_sync_owner = 1 AND github_repo IS NOT NULL
      `)

      // Partial UNIQUE - at most one triage project per workspace.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_triage_per_workspace
        ON projects(workspace_id)
        WHERE is_triage_project = 1
      `)

      // Partial covering index for backfill scan resumability - scans only
      // tasks with a github_issue_number that have not yet been backfilled.
      // Resume after interruption is O(remaining tasks), not O(all tasks).
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_area_routing_backfill_pending
        ON tasks(workspace_id, github_issue_number)
        WHERE github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL
      `)

      // Deterministic owner election (FR-005, FR-007).
      //
      // For each (workspace_id, github_repo) group with NO existing owner
      // AND at least one github_sync_enabled=1 project, elect MIN(id) of the
      // enabled subset. Re-running this UPDATE is a no-op for already-elected
      // groups (the HAVING clause filters them out). Disabled-only groups
      // elect zero owners.
      //
      // `COALESCE(SUM(...), 0)` defends against rows where is_repo_sync_owner
      // is NULL: SUM over an all-NULL group returns NULL, which would make
      // the predicate `NULL = 0` (i.e., NULL/false) and skip a group that
      // SHOULD be eligible for election. Explicit DEFAULT 0 + the backfill
      // make this redundant in practice, but the COALESCE keeps the
      // behavior correct under any future schema/state where the column is
      // truly NULL.
      db.exec(`
        UPDATE projects
        SET is_repo_sync_owner = 1
        WHERE id IN (
          SELECT MIN(p.id) FROM projects p
          WHERE p.github_repo IS NOT NULL
            AND p.github_sync_enabled = 1
          GROUP BY p.workspace_id, p.github_repo
          HAVING COALESCE(SUM(p.is_repo_sync_owner), 0) = 0
        )
      `)
    }
  },
  {
    // SPEC-008 - Resource Governance and Cost Tracker Enforcement.
    //
    // Migration ID was rebased from M63 to M64 per
    // docs/migrations/migration-id-reservations.md (first-to-merge rule):
    // SPEC-006 (PR #21) merged M63 (063_area_label_routing_sync_owner_triage)
    // first, so SPEC-008 takes M64. Rollback file lives at
    // docs/migrations/rollback-M64.sql.
    //
    // M64 lays the governance-defaults foundation referenced by every
    // subsequent SPEC-008 sub-migration (M65a..M65m, M66):
    //   1. Extends resource_policies (M60) and resource_policy_events (M61)
    //      with the columns needed by the policy loader, decision writer,
    //      and audit chain.
    //   2. Creates resource_decision_audit (tamper-evident audit chain;
    //      genesis row inserted with the FR-176 / FR-219m 64-character
    //      zero prev_hash).
    //   3. Creates retention_policy and seeds the Q63 default horizons.
    //   4. Creates the provider_accounts skeleton (M65l completes the
    //      schema).
    //   5. Creates governance_health_events for the local-health channel
    //      (FR-090b, FR-090f).
    //
    // All operations are additive and idempotent: ALTER TABLE guarded by
    // addColumnIfMissing; CREATE TABLE / CREATE INDEX guarded by
    // IF NOT EXISTS; seed rows guarded by INSERT OR IGNORE / WHERE NOT
    // EXISTS. Schema column names follow the T015 task prompt
    // (actor, decision, payload_json, row_hash); cross-references to
    // FR-176's (actor_id, kind, before_json, after_json, curr_hash) shape
    // MUST map names - see src/lib/resource-audit-chain.ts (T148+) for
    // the canonical hashing implementation.
    //
    // TODO(SPEC-008): The M60 policy_type CHECK constraint allows only
    // {wip_limit, budget, blackout, degraded_window}. The wider FR-031
    // value set (wip|budget|window|composite|aegis_emergency_reserve)
    // requires a follow-up migration (table-rebuild) to widen or drop
    // the CHECK before operator-promoted policies use the new values.
    id: '064_resource_governance_default_policies',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'resource_policies', 'policy_type', 'policy_type TEXT')
      addColumnIfMissing(db, 'resource_policies', 'limit_value', 'limit_value REAL')
      addColumnIfMissing(db, 'resource_policies', 'window_spec_json', 'window_spec_json TEXT')
      addColumnIfMissing(db, 'resource_policies', 'enforce_mode', "enforce_mode TEXT DEFAULT 'shadow'")
      addColumnIfMissing(db, 'resource_policies', 'enabled_at', 'enabled_at TEXT')
      addColumnIfMissing(db, 'resource_policies', 'disabled_at', 'disabled_at TEXT')
      addColumnIfMissing(db, 'resource_policies', 'owner_workspace_id', 'owner_workspace_id INTEGER')
      addColumnIfMissing(db, 'resource_policies', 'version', 'version INTEGER NOT NULL DEFAULT 1')
      addColumnIfMissing(db, 'resource_policies', 'etag', 'etag TEXT')
      addColumnIfMissing(db, 'resource_policies', 'notes', 'notes TEXT')
      addColumnIfMissing(db, 'resource_policies', 'default_template', 'default_template INTEGER NOT NULL DEFAULT 0')
      addColumnIfMissing(db, 'resource_policies', 'updated_by', 'updated_by TEXT')

      addColumnIfMissing(db, 'resource_policy_events', 'decision_id', 'decision_id TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'policy_id', 'policy_id INTEGER')
      addColumnIfMissing(db, 'resource_policy_events', 'actor', 'actor TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'reason', 'reason TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'details_json', 'details_json TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'confirmation_phrase', 'confirmation_phrase TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'prev_hash', 'prev_hash TEXT')
      addColumnIfMissing(db, 'resource_policy_events', 'row_hash', 'row_hash TEXT')

      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_decision_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          decision_id TEXT NOT NULL,
          workspace_id INTEGER,
          actor TEXT,
          decision TEXT NOT NULL,
          reason TEXT,
          payload_json TEXT,
          prev_hash TEXT NOT NULL,
          row_hash TEXT NOT NULL,
          captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_decision_audit_decision_id
        ON resource_decision_audit(decision_id)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_decision_audit_captured_at
        ON resource_decision_audit(captured_at)
      `)

      const ZERO_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000'
      const genesisExists = db
        .prepare(`SELECT id FROM resource_decision_audit WHERE decision_id = 'genesis' LIMIT 1`)
        .get() as { id: number } | undefined
      if (!genesisExists) {
        const decision_id = 'genesis'
        const actor = 'system'
        const decision = 'genesis'
        const reason = 'M64 audit chain genesis'
        const payload_json = '{"chain":"resource_decision_audit","schema_version":1}'
        const canonical = [ZERO_PREV_HASH, decision_id, actor, decision, reason, payload_json].join('|')
        const row_hash = createHash('sha256').update(canonical, 'utf8').digest('hex')
        db.prepare(
          `INSERT INTO resource_decision_audit
             (decision_id, workspace_id, actor, decision, reason, payload_json, prev_hash, row_hash)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`
        ).run(decision_id, actor, decision, reason, payload_json, ZERO_PREV_HASH, row_hash)
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS retention_policy (
          table_name TEXT PRIMARY KEY,
          horizon_days INTEGER NOT NULL,
          last_swept_at TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      const seedRetention = db.prepare(
        `INSERT OR IGNORE INTO retention_policy (table_name, horizon_days) VALUES (?, ?)`
      )
      seedRetention.run('resource_decision_audit', 730)
      seedRetention.run('raw_usage_events', 90)
      seedRetention.run('canonical_usage_events', 730)
      seedRetention.run('governance_dispatch_log', 30)
      seedRetention.run('governance_health_events', 30)

      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          account_label TEXT NOT NULL,
          billing_mode TEXT,
          config_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          UNIQUE(provider, account_label)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_provider_accounts_active
        ON provider_accounts(provider) WHERE deleted_at IS NULL
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS governance_health_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          component TEXT NOT NULL,
          state TEXT NOT NULL,
          metric_json TEXT,
          captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_governance_health_events_component_captured
        ON governance_health_events(component, captured_at DESC)
      `)
    }
  },
  {
    // SPEC-008 - M65a: source_emission_capability registry.
    //
    // Per FR-076, FR-082, FR-085, FR-086, FR-087 and tasks.md T017. Six seed
    // rows describe the per-source enforcement defaults that govern downstream
    // collectors, the canonical-event reconciler, and the budget-effects writer.
    //
    // FR-082 note: cli_stdout_json starts at enforcement_eligibility='hard' /
    // dedupe_confidence_default='high'. The Codex parity spike (T003) is the
    // only path that downgrades it to ('soft','medium'); that downgrade is a
    // follow-up data update, not part of this seed.
    //
    // Schema column set follows the task prompt verbatim. Note that
    // specs/008-resource-governance/data-model.md M65a documents an extended
    // shape (units_emitted_json, fields_present_json, refresh_cadence_seconds)
    // and 11 seed rows; the orchestrator's task prompt narrows that to 6 seeds
    // and the columns reflected here. Additional columns and seeds will land
    // in a later sub-migration if subsequent tasks require them.
    id: '065a_source_emission_capability',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS source_emission_capability (
          source_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          enforcement_eligibility TEXT NOT NULL DEFAULT 'reconciliation_only',
          dedupe_confidence_default TEXT NOT NULL DEFAULT 'medium',
          expected_envelope_bytes INTEGER NOT NULL DEFAULT 4096,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      const seed = db.prepare(
        `INSERT OR IGNORE INTO source_emission_capability
           (source_id, display_name, enforcement_eligibility,
            dedupe_confidence_default, expected_envelope_bytes)
         VALUES (?, ?, ?, ?, ?)`
      )
      const seeds: Array<[string, string, string, string, number]> = [
        ['native_otel', 'Claude Code OTel', 'hard', 'high', 8192],
        ['cli_stdout_json', 'Codex CLI stdout', 'hard', 'high', 8192],
        ['transcript_replay', 'Claude Code transcript replay', 'soft', 'medium', 4096],
        ['gateway_otel', 'OpenClaw gateway OTel', 'hard', 'high', 16384],
        ['manual_post', 'Operator POST /api/tokens', 'advisory', 'singleton', 4096],
        ['provider_quota', 'Provider quota fetcher', 'advisory', 'singleton', 2048],
      ]
      for (const row of seeds) seed.run(...row)
    }
  },
  {
    // SPEC-008 - M65b: raw_usage_events (append-only, monthly partition layout).
    //
    // Per FR-091, FR-249, FR-090d, FR-365 and tasks.md T019. Holds per-source
    // ingested event envelopes before canonicalization. Append-only by
    // convention; retention sweeps by partition_month per Q51.
    //
    // FR-090d: parser_version + schema_version_observed track the parser/
    // schema vintage that produced the row, so future migrations can replay
    // raw events through an updated canonicalizer.
    //
    // FR-365: reconcile_status uses the four-state CHECK ('ok',
    // 'schema_broken', 'schema_malicious', 'quarantined') from the task
    // prompt. data-model.md still documents a five-state CHECK that
    // includes 'pending' / 'canonicalized' / 'dropped'; the orchestrator
    // narrowed the set here. The partial index over !='ok' keeps lookups
    // for the abnormal-state subset cheap.
    //
    // FK source_id -> source_emission_capability(source_id) ties every raw
    // row to its registered emission capability (M65a).
    id: '065b_raw_usage_events',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS raw_usage_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id TEXT NOT NULL,
          workspace_id INTEGER,
          agent_id INTEGER,
          task_id INTEGER,
          provider TEXT,
          provider_request_id TEXT,
          provider_timestamp_ms INTEGER,
          session_id TEXT,
          generation_id INTEGER,
          raw_attributes_json TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          schema_version_observed TEXT,
          reconcile_status TEXT NOT NULL DEFAULT 'ok'
            CHECK (reconcile_status IN ('ok','schema_broken','schema_malicious','quarantined')),
          dedupe_confidence TEXT NOT NULL DEFAULT 'medium',
          enforcement_eligibility TEXT NOT NULL DEFAULT 'reconciliation_only',
          partition_month TEXT NOT NULL,
          ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (source_id) REFERENCES source_emission_capability(source_id)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_raw_usage_events_source_ingested
        ON raw_usage_events(source_id, ingested_at DESC)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_raw_usage_events_partition
        ON raw_usage_events(partition_month)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_raw_usage_events_session
        ON raw_usage_events(session_id, generation_id)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_raw_usage_events_reconcile_status
        ON raw_usage_events(reconcile_status) WHERE reconcile_status != 'ok'
      `)
    }
  },
  {
    // SPEC-008 - M65c: canonical_usage_events + UNIQUE INDEX idx_canonical_dedup.
    //
    // Per FR-091, FR-092, FR-102 and tasks.md T021. Canonicalized form of
    // raw_usage_events: one row per (provider, provider_request_id,
    // provider_timestamp_ms) tuple after dedup + cross-source coalescing.
    //
    // The dedup index is PARTIAL (WHERE provider_request_id IS NOT NULL):
    // rows lacking a request id may collide and rely on alternative join
    // heuristics tracked via merge_sources_json + dedupe_confidence. This
    // matches data-model.md M65c plus the explicit task-prompt clause.
    //
    // provenance is the row-level shape (single | merged); the data-model
    // documented an extended set including 'corrected' which the task
    // prompt narrows to the two-value case at this commit. Subsequent
    // sub-migrations may widen the set if downstream tasks require it.
    id: '065c_canonical_usage_events',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS canonical_usage_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER,
          agent_id INTEGER,
          task_id INTEGER,
          provider TEXT NOT NULL,
          provider_request_id TEXT,
          provider_timestamp_ms INTEGER NOT NULL,
          model TEXT,
          tokens_in INTEGER NOT NULL DEFAULT 0,
          tokens_out INTEGER NOT NULL DEFAULT 0,
          cache_read_in INTEGER NOT NULL DEFAULT 0,
          cache_creation_in INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          duration_ms INTEGER,
          session_id TEXT,
          provenance TEXT NOT NULL DEFAULT 'single',
          merge_sources_json TEXT,
          dedupe_confidence TEXT NOT NULL DEFAULT 'high',
          partition_month TEXT NOT NULL,
          emitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_dedup
        ON canonical_usage_events(provider, provider_request_id, provider_timestamp_ms)
        WHERE provider_request_id IS NOT NULL
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_canonical_workspace_emitted
        ON canonical_usage_events(workspace_id, emitted_at DESC)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_canonical_partition
        ON canonical_usage_events(partition_month)
      `)
    }
  },
  {
    // SPEC-008 - M65d: canonical_budget_effects (posted-effect lifecycle, Q30).
    //
    // Per FR-093, FR-104 and tasks.md T023. Tracks the budget impact of each
    // canonical_usage_events row against the policies and counters that saw
    // the effect, with a posted/reverted lifecycle so corrections (Q30) can
    // unwind a previously applied delta without rewriting history.
    //
    // The UNIQUE(canonical_event_id, policy_id, counter_id, window_start)
    // constraint prevents double-posting for the same (event, policy,
    // counter, window) tuple when a writer retries.
    //
    // Indexes:
    //   - idx_canonical_budget_effects_counter accelerates per-counter
    //     window reads ("what's the current applied amount for counter X
    //     in window Y?").
    //   - idx_canonical_budget_effects_active is a partial index on
    //     reverted_at IS NULL so the active-effect set stays cheap.
    //
    // No FK declared at the schema level - canonical_event_id and
    // policy_id are validated by the application writer at insert time.
    // This matches the data-model.md M65d shape on those columns; the
    // task prompt adds counter_id to the unique key, which this commit
    // adopts verbatim.
    id: '065d_canonical_budget_effects',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS canonical_budget_effects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          canonical_event_id INTEGER NOT NULL,
          policy_id INTEGER NOT NULL,
          counter_id INTEGER NOT NULL,
          window_start TEXT NOT NULL,
          amount REAL NOT NULL,
          unit TEXT NOT NULL,
          posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reverted_at TEXT,
          reverted_reason TEXT,
          UNIQUE(canonical_event_id, policy_id, counter_id, window_start)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_canonical_budget_effects_counter
        ON canonical_budget_effects(counter_id, window_start)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_canonical_budget_effects_active
        ON canonical_budget_effects(policy_id) WHERE reverted_at IS NULL
      `)
    }
  },
  {
    // SPEC-008 - M65e: resource_budget_ledger (append-only, hash-chained).
    //
    // Per FR-051, FR-176a, FR-219m, FR-249 and tasks.md T025. Tracks every
    // budget delta as an append-only row with prev_hash/row_hash chaining so
    // operators can verify the chain end-to-end without a separate audit
    // table.
    //
    // Schema follows the task prompt. data-model.md M65e shows a leaner
    // shape (account_id, ts, source, balance_after) that predates the FR
    // consolidation; the FR-current shape adds kind, prev_hash/row_hash,
    // partition_month, decision_id, notes_json, and the per-row
    // append-only triggers (FR-176a). The task prompt is authoritative
    // here.
    //
    // Append-only enforcement: BEFORE UPDATE/DELETE triggers RAISE(ABORT)
    // so even row-level mutations are rejected at the storage layer. The
    // prompt's regex string is preserved verbatim ('resource_budget_ledger
    // is append-only').
    //
    // Genesis row (FR-219m):
    //   policy_id=0, kind='credit', amount=0, unit='usd',
    //   prev_hash='0' x 64, row_hash=SHA-256 of the canonical pipe-delimited
    //   form, partition_month=current YYYY-MM at apply time. The canonical
    //   form is documented in the test file at
    //   migrations-M65e-h.test.ts: prev_hash | policy_id | counter_id |
    //   window_start | kind | amount | unit | source_event_id | decision_id |
    //   partition_month | notes_json (NULL rendered as empty string).
    //
    // Idempotency: the genesis insert guards against re-insertion via
    // INSERT INTO ... SELECT ... WHERE NOT EXISTS so re-running the
    // migration after the marker has been deleted does NOT create a
    // duplicate genesis row.
    //
    // No FK declared. policy_id=0 is a reserved sentinel for the genesis
    // row and does not resolve to a real resource_policies entry.
    id: '065e_resource_budget_ledger',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_budget_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_id INTEGER NOT NULL,
          counter_id INTEGER,
          window_start TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('debit','credit','correction','reservation','release')),
          amount REAL NOT NULL,
          unit TEXT NOT NULL CHECK (unit IN ('usd','token','request','session')),
          source_event_id INTEGER,
          decision_id TEXT,
          prev_hash TEXT NOT NULL,
          row_hash TEXT NOT NULL,
          partition_month TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          notes_json TEXT
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_budget_ledger_policy_window
        ON resource_budget_ledger(policy_id, window_start)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_budget_ledger_partition
        ON resource_budget_ledger(partition_month)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_budget_ledger_decision
        ON resource_budget_ledger(decision_id) WHERE decision_id IS NOT NULL
      `)
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_resource_budget_ledger_no_update
        BEFORE UPDATE ON resource_budget_ledger
        BEGIN
          SELECT RAISE(ABORT, 'resource_budget_ledger is append-only');
        END
      `)
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_resource_budget_ledger_no_delete
        BEFORE DELETE ON resource_budget_ledger
        BEGIN
          SELECT RAISE(ABORT, 'resource_budget_ledger is append-only');
        END
      `)

      // Genesis row (FR-219m). Use INSERT...SELECT...WHERE NOT EXISTS so
      // re-running the migration after marker-deletion does not create a
      // second genesis row.
      const ZERO_PREV = '0000000000000000000000000000000000000000000000000000000000000000'
      const partition_month = new Date().toISOString().slice(0, 7)
      const policy_id = 0
      const counter_id = null
      const window_start = '1970-01-01T00:00:00Z'
      const kind = 'credit'
      const amount = 0
      const unit = 'usd'
      const source_event_id = null
      const decision_id = null
      const notes_json = null

      // Canonical form documented in M65e migration comment + test file.
      const canonical = [
        ZERO_PREV,
        String(policy_id),
        counter_id == null ? '' : String(counter_id),
        window_start,
        kind,
        String(amount),
        unit,
        source_event_id == null ? '' : String(source_event_id),
        decision_id == null ? '' : decision_id,
        partition_month,
        notes_json == null ? '' : notes_json,
      ].join('|')
      const row_hash = createHash('sha256').update(canonical, 'utf8').digest('hex')

      db.prepare(
        `INSERT INTO resource_budget_ledger
           (policy_id, counter_id, window_start, kind, amount, unit,
            source_event_id, decision_id, prev_hash, row_hash, partition_month, notes_json)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM resource_budget_ledger
           WHERE prev_hash = ? AND policy_id = 0
         )`,
      ).run(
        policy_id,
        counter_id,
        window_start,
        kind,
        amount,
        unit,
        source_event_id,
        decision_id,
        ZERO_PREV,
        row_hash,
        partition_month,
        notes_json,
        ZERO_PREV,
      )
    }
  },
  {
    // SPEC-008 - M65f: resource_budget_counters (precomputed per-window
    // balances).
    //
    // Per FR-052, FR-058a, FR-070, FR-389 and tasks.md T027. Caches each
    // policy's consumed/reserved totals per window so the admission hot
    // path is one indexed point lookup instead of a ledger scan.
    //
    // Schema follows the task prompt. Counters are dimensioned by unit
    // (consumed_usd / consumed_token / consumed_request / consumed_session
    // and the matching reserved_* columns) so a single row carries the
    // full set of per-unit totals for a (policy, window) tuple. Most
    // policies will populate only one or two columns; the rest stay at 0.
    // data-model.md M65f shows a leaner shape with single counter_value /
    // reserved_value pair; the FR-current shape adds the per-unit
    // explosion plus the pending_rebuild_job_id field (FR-058a).
    //
    // pending_rebuild_job_id is NULL when no rebuild is in progress; a
    // rebuild job claims the counter row by writing its job id, then
    // releases the claim by writing NULL. The partial index on
    // pending_rebuild_job_id IS NOT NULL keeps the in-flight set cheap.
    //
    // version starts at 1 and is bumped by writers on each update so
    // optimistic-concurrency callers can detect lost updates.
    //
    // No FK declared. policy_id is a soft reference to resource_policies;
    // the application writer enforces validity at insert time.
    id: '065f_resource_budget_counters',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_budget_counters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_id INTEGER NOT NULL,
          window_start TEXT NOT NULL,
          consumed_usd REAL NOT NULL DEFAULT 0,
          consumed_token INTEGER NOT NULL DEFAULT 0,
          consumed_request INTEGER NOT NULL DEFAULT 0,
          consumed_session INTEGER NOT NULL DEFAULT 0,
          reserved_usd REAL NOT NULL DEFAULT 0,
          reserved_token INTEGER NOT NULL DEFAULT 0,
          reserved_request INTEGER NOT NULL DEFAULT 0,
          reserved_session INTEGER NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          pending_rebuild_job_id TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(policy_id, window_start)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_budget_counters_lookup
        ON resource_budget_counters(policy_id, window_start)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_budget_counters_pending_rebuild
        ON resource_budget_counters(pending_rebuild_job_id)
        WHERE pending_rebuild_job_id IS NOT NULL
      `)
    }
  },
  {
    // SPEC-008 - M65g: resource_reservations (with state-transition trigger).
    //
    // Per FR-069, FR-294 and tasks.md T029. Atomic reservation rows that
    // hold budget aside between admission and final consumption. The
    // BEFORE UPDATE OF state trigger enforces the documented state
    // machine: active -> {consumed, released, expired}; no other
    // transitions allowed.
    //
    // Schema follows the task prompt. data-model.md M65g shows a leaner
    // shape (reserved_window_id, created_at) that predates the FR
    // consolidation; the FR-current shape adds counter_id, window_start,
    // finalized_at, finalized_reason and uses reserved_at for the create
    // timestamp.
    //
    // No FK declared. policy_id and counter_id are soft references; the
    // application writer enforces validity at insert time.
    //
    // Indexes:
    //   - idx_resource_reservations_active partial on state='active' so
    //     the admission hot path scans only outstanding holds.
    //   - idx_resource_reservations_expires_at partial on state='active'
    //     so the expiry reaper sees only active reservations whose TTL
    //     has lapsed.
    id: '065g_resource_reservations',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_reservations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_id INTEGER NOT NULL,
          counter_id INTEGER,
          window_start TEXT NOT NULL,
          amount REAL NOT NULL,
          unit TEXT NOT NULL CHECK (unit IN ('usd','token','request','session')),
          state TEXT NOT NULL CHECK (state IN ('active','consumed','released','expired')),
          granted_by TEXT NOT NULL,
          originating_decision_id TEXT,
          expires_at TEXT NOT NULL,
          reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finalized_at TEXT,
          finalized_reason TEXT
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_reservations_active
        ON resource_reservations(policy_id, window_start) WHERE state = 'active'
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_reservations_expires_at
        ON resource_reservations(expires_at) WHERE state = 'active'
      `)
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_resource_reservations_state_transition
        BEFORE UPDATE OF state ON resource_reservations
        WHEN OLD.state != NEW.state
        BEGIN
          SELECT CASE
            WHEN OLD.state = 'active' AND NEW.state IN ('consumed','released','expired') THEN NULL
            ELSE RAISE(ABORT, 'resource_reservations: invalid state transition')
          END;
        END
      `)
    }
  },
  {
    // SPEC-008 - M65h: resource_overrides (operator grants).
    //
    // Per FR-171..185 and tasks.md T031. Operator-issued grants that
    // either widen a budget (granted_amount/granted_unit) or attach to a
    // reservation_id. UNIQUE(idempotency_key, actor) makes retries
    // idempotent per-actor; two actors may share a single key.
    //
    // Schema follows the task prompt. data-model.md M65h shows a
    // narrower shape (reservation_id NOT NULL, ttl_seconds, justification,
    // workspace_id, state) that predates the FR-171..185 consolidation.
    // The FR-current shape generalises the table to also carry standalone
    // grants that are not tied to a reservation (reservation_id NULL,
    // granted_amount/granted_unit set), and replaces the ttl/state/
    // workspace_id columns with the more-specific scope_kind / scope_id /
    // policy_id / expires_at / revoked_at vocabulary used by the
    // approve / revoke endpoints.
    //
    // No FK declared. policy_id, scope_id, and reservation_id are soft
    // references; the application writer enforces validity at insert
    // time.
    //
    // Indexes:
    //   - idx_resource_overrides_active partial on revoked_at IS NULL so
    //     the active-grant lookup is cheap.
    //   - idx_resource_overrides_expires partial on revoked_at IS NULL so
    //     the expiry sweep scans only live grants.
    //   - idx_resource_overrides_idempotency mirrors the UNIQUE
    //     constraint in indexed form for explicit dedup lookups.
    id: '065h_resource_overrides',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_overrides (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope_kind TEXT NOT NULL CHECK (scope_kind IN ('facility','workspace','agent','project','task_status','specific_task')),
          scope_id INTEGER,
          policy_id INTEGER,
          granted_amount REAL,
          granted_unit TEXT CHECK (granted_unit IN ('usd','token','request','session') OR granted_unit IS NULL),
          reservation_id INTEGER,
          reason TEXT NOT NULL,
          actor TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          revoked_reason TEXT,
          UNIQUE(idempotency_key, actor)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_overrides_active
        ON resource_overrides(policy_id) WHERE revoked_at IS NULL
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_overrides_expires
        ON resource_overrides(expires_at) WHERE revoked_at IS NULL
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_overrides_idempotency
        ON resource_overrides(idempotency_key, actor)
      `)
    }
  },
  {
    // SPEC-008 - M65i: reconciliation_batches (state machine).
    //
    // Per FR-097, FR-114, FR-114a, FR-118, FR-344, FR-387 and tasks.md T033.
    // Tracks the lifecycle of each reconciliation batch as it progresses
    // through pending -> running -> completed/failed* states. The
    // last_row_cursor column lets a stalled batch resume mid-window
    // (FR-118 / FR-344).
    //
    // UNIQUE(source_id, window_start, window_end) implements the FR-387
    // reconciler_lease pattern: at most one batch row exists per
    // (source, window) tuple. Multiple workers race to insert; the
    // loser's INSERT fails with UNIQUE and the winner becomes the
    // owner of that window's reconciliation.
    //
    // Indexes:
    //   - idx_reconciliation_batches_state: (state, source_id) for
    //     "show me everything currently failed_timeout for source X".
    //   - idx_reconciliation_batches_active partial on state IN
    //     ('pending','running') so the active-set scan stays cheap as
    //     the table grows.
    //
    // No FK declared. source_id is a soft reference to
    // source_emission_capability(source_id); the application writer
    // enforces validity at insert time.
    id: '065i_reconciliation_batches',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciliation_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id TEXT NOT NULL,
          window_start TEXT NOT NULL,
          window_end TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending','running','completed','failed','failed_timeout','failed_permanent')),
          rows_processed INTEGER NOT NULL DEFAULT 0,
          last_row_cursor TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          max_duration_seconds INTEGER NOT NULL DEFAULT 600,
          started_at TEXT,
          completed_at TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_id, window_start, window_end)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_reconciliation_batches_state
        ON reconciliation_batches(state, source_id)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_reconciliation_batches_active
        ON reconciliation_batches(source_id) WHERE state IN ('pending','running')
      `)
    }
  },
  {
    // SPEC-008 - M65j: correction_ledger (coalesced corrections).
    //
    // Per FR-103, FR-104, FR-106 and tasks.md T035. Records each
    // correction applied to a canonical event after-the-fact, with the
    // prior_amount/corrected_amount/delta triple so the audit trail
    // captures the full transition (Q30). Reasons are constrained to the
    // five FR-documented values: late_arrival (event arrived after the
    // window closed), dedupe_repair (cross-source merge revisit),
    // price_correction (token_pricing rate change), manual (operator
    // adjustment), schema_repair (parser regression replay).
    //
    // ledger_entry_id is a soft (weak) FK to resource_budget_ledger so
    // the application writer can pair each correction with the ledger
    // row that posted it. Schema-level FK is intentionally omitted to
    // keep the table append-friendly under crash/recovery scenarios.
    //
    // Indexes:
    //   - idx_correction_ledger_event: lookup by canonical_event_id for
    //     "show me every correction applied to event X".
    //   - idx_correction_ledger_applied: timeline scan ordered by
    //     applied_at DESC for the operator dashboard.
    id: '065j_correction_ledger',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS correction_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          canonical_event_id INTEGER NOT NULL,
          prior_amount REAL NOT NULL,
          corrected_amount REAL NOT NULL,
          delta REAL NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('late_arrival','dedupe_repair','price_correction','manual','schema_repair')),
          ledger_entry_id INTEGER,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          applied_by TEXT NOT NULL,
          notes_json TEXT
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_correction_ledger_event
        ON correction_ledger(canonical_event_id)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_correction_ledger_applied
        ON correction_ledger(applied_at DESC)
      `)
    }
  },
  {
    // SPEC-008 - M65k: resource_snapshots (cumulative deltas).
    //
    // Per FR-111, FR-117, FR-121 and tasks.md T037. Captures cumulative
    // counters reported by external sources (Anthropic Console, OpenAI
    // Usage API, native OTLP) at periodic snapshot points. The
    // governance reconciler computes delta_from_prior between adjacent
    // snapshots in the same (source_id, scope_kind, scope_id) lane to
    // derive the per-window usage that did not arrive as discrete
    // events (FR-111). source_emission_fingerprint is required (NOT
    // NULL) so every snapshot is anchored to the upstream emitter that
    // produced it (FR-117 audit chain). partition_month ('YYYY-MM')
    // enables the same 90-day partition lifecycle as raw_usage_events
    // / canonical_usage_events.
    //
    // delta_from_prior is nullable: the first snapshot in a lane has
    // no prior to subtract from. The application writer is responsible
    // for computing the delta on subsequent inserts.
    //
    // UNIQUE(source_id, scope_kind, scope_id, snapshot_at) prevents
    // double-ingest of the same upstream snapshot tuple (FR-121
    // idempotency).
    //
    // Indexes:
    //   - idx_resource_snapshots_scope: lane scan ordered by
    //     snapshot_at DESC for "show me the latest snapshots in this
    //     scope".
    //   - idx_resource_snapshots_partition: partition_month scan for
    //     the partition-rotation sweeper.
    //
    // No FK declared. source_id is a soft reference to
    // source_emission_capability(source_id); scope_id is a soft
    // reference to workspaces(id) when scope_kind='workspace' (and
    // NULL for scope_kind='facility').
    id: '065k_resource_snapshots',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id INTEGER,
          snapshot_at TEXT NOT NULL,
          cumulative_tokens_in INTEGER NOT NULL DEFAULT 0,
          cumulative_tokens_out INTEGER NOT NULL DEFAULT 0,
          cumulative_cost_usd REAL NOT NULL DEFAULT 0,
          cumulative_requests INTEGER NOT NULL DEFAULT 0,
          delta_from_prior INTEGER,
          source_emission_fingerprint TEXT NOT NULL,
          partition_month TEXT NOT NULL,
          ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_id, scope_kind, scope_id, snapshot_at)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_snapshots_scope
        ON resource_snapshots(scope_kind, scope_id, snapshot_at DESC)
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_snapshots_partition
        ON resource_snapshots(partition_month)
      `)
    }
  },
  {
    // SPEC-008 - M65l: extend provider_accounts + new provider_entitlements
    // history.
    //
    // Per FR-131, FR-134, FR-134a, FR-139, FR-143, FR-219u, FR-219v and
    // tasks.md T039.
    //
    // M64 created the provider_accounts skeleton (id, provider,
    // account_label, billing_mode, config_json, created_at,
    // deleted_at). M65l fills in the columns the governance
    // entitlements/automation flow needs at runtime:
    //   - entitlements_json: snapshot of the active tier's caps so the
    //     policy resolver does not need to JOIN against the history
    //     table on every check.
    //   - config_json: already present from M64 - addColumnIfMissing
    //     no-ops here. Listed explicitly so the SPEC-008 audit shows
    //     the column was expected to exist after M65l.
    //   - tos_acknowledged_at: operator's acceptance timestamp for the
    //     provider terms of service (FR-219u).
    //   - automation_class: 'manual' | 'assisted' | 'autonomous'
    //     classification of how this account is used (FR-219v). Stored
    //     as plain TEXT so future classes can be added without an
    //     ALTER.
    //
    // provider_entitlements is the append-only history table for tier
    // changes detected from upstream signals (account ToS upgrades,
    // billing-mode changes, manual operator confirmations). Each row
    // records the active rate_limits_json + monthly_token_cap as of
    // effective_at; expires_at is filled in when a newer row
    // supersedes this one. source records who/what detected the change
    // ('console_scrape', 'usage_api', 'operator', 'manual'). FK to
    // provider_accounts(id) is declared because deleting an account
    // should cascade through application logic (no ON DELETE clause -
    // the writer enforces lifecycle explicitly).
    //
    // provider_subscriptions table does not exist as a DB table in this
    // codebase - it lives as a JSON detector helper in
    // src/lib/provider-subscriptions.ts. The optional backfill block
    // is therefore implemented as a tableExists guard around an
    // empty body, which keeps the migration future-proof if a real
    // table is introduced later without changing this file.
    id: '065l_provider_accounts_entitlements',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'provider_accounts', 'entitlements_json', 'entitlements_json TEXT')
      addColumnIfMissing(db, 'provider_accounts', 'config_json', 'config_json TEXT')
      addColumnIfMissing(db, 'provider_accounts', 'tos_acknowledged_at', 'tos_acknowledged_at TEXT')
      addColumnIfMissing(db, 'provider_accounts', 'automation_class', 'automation_class TEXT')

      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_entitlements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          tier TEXT NOT NULL,
          rate_limits_json TEXT,
          monthly_token_cap INTEGER,
          effective_at TEXT NOT NULL,
          expires_at TEXT,
          source TEXT NOT NULL,
          detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (account_id) REFERENCES provider_accounts(id)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_provider_entitlements_account_effective
        ON provider_entitlements(account_id, effective_at DESC)
      `)

      // Optional: backfill from provider_subscriptions if a future
      // schema introduces it as a DB table. Today the helper of that
      // name is a JSON detector in src/lib/provider-subscriptions.ts,
      // not a table - tableExists() returns false and this block is a
      // no-op.
      if (tableExists(db, 'provider_subscriptions')) {
        // Future: copy historical tier data into provider_entitlements.
        // Intentionally empty until that table is introduced.
      }
    }
  },
  {
    // SPEC-008 - M65m: governance final tables (8 tables) + integrity check.
    //
    // Per FR-006, FR-035, FR-090e, FR-199, FR-219h, FR-219i, FR-219n,
    // FR-382, FR-387 and tasks.md T041. Closes out the SPEC-008
    // schema by adding the eight remaining infrastructure tables for
    // breaker state, materialized policy windows, recovery audit,
    // quarantine, ingest rate-limiting state, audit verification,
    // reconciler leasing, and orphan-event tracking.
    //
    // Tables (in dependency-free creation order):
    //
    //   1. resource_governance_breaker - per-scope circuit-breaker state
    //      (closed/half_open/open) with consecutive_errors and notes.
    //      UNIQUE(scope_kind, scope_id) so each scope has at most one
    //      live breaker row.
    //   2. resource_window_instances - materialized window tuples
    //      (policy_id, window_kind, window_start, window_end) so the
    //      counters table can refer to a stable window key. UNIQUE on
    //      (policy_id, window_start) prevents accidental duplicates.
    //   3. recovery_action - hash-chained audit trail of recovery
    //      actions (manual override grants, breaker resets, batch
    //      replays). prev_hash + row_hash chain detects tampering.
    //   4. quarantined_raw_events - rate-limited / oversized / malicious
    //      / broken / adversarial raw payloads diverted from the
    //      ingest path so reviewers can decide manual disposition.
    //   5. ingest_rate_state - per-source-path rate-limit FSM
    //      (accepting / rate_limited / circuit_open / disk_full_pause)
    //      with consecutive_drops and last_drop_at counters.
    //   6. governance_audit_verification_state - rolling cursor for
    //      hash-chain audit verification per table_name.
    //   7. reconciler_lease - composite-PK lease table preventing two
    //      reconcilers from racing on the same (source, window) tuple.
    //   8. governance_orphan_event - observed-but-unattributable events
    //      (FK target missing). resolved_at NULL means unresolved;
    //      partial index speeds up the unresolved-set scan.
    //
    // Indexes:
    //   - idx_resource_window_instances_lookup: (policy_id,
    //     window_start, window_end) for window-resolution lookups.
    //   - idx_recovery_action_taken_at: timeline scan ordered DESC.
    //   - idx_quarantined_raw_events_source_quarantined: per-source
    //     timeline scan ordered DESC.
    //   - idx_governance_orphan_event_unresolved: partial index on
    //     resolved_at IS NULL for the unresolved-orphan dashboard.
    //
    // Integrity guard: at the end of up(), run PRAGMA foreign_key_check
    // and throw if any violation is reported. Throwing inside the
    // migration up() rolls back the wrapping db.transaction() in
    // runMigrations, leaving the schema unchanged so an operator can
    // diagnose the violation before re-running. None of the M65m
    // tables declare a FOREIGN KEY clause; the check guards against
    // any latent violation introduced by earlier migrations or by
    // application data accumulated between M65l and M65m.
    id: '065m_governance_final_tables',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_governance_breaker (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope_kind TEXT NOT NULL,
          scope_id INTEGER,
          state TEXT NOT NULL CHECK (state IN ('closed','half_open','open')),
          consecutive_errors INTEGER NOT NULL DEFAULT 0,
          opened_at TEXT,
          reset_at TEXT,
          notes_json TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(scope_kind, scope_id)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_window_instances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          policy_id INTEGER NOT NULL,
          window_kind TEXT NOT NULL,
          window_start TEXT NOT NULL,
          window_end TEXT NOT NULL,
          materialized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(policy_id, window_start)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_resource_window_instances_lookup
        ON resource_window_instances(policy_id, window_start, window_end)
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS recovery_action (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL,
          actor TEXT NOT NULL,
          scope_kind TEXT,
          scope_id INTEGER,
          payload_json TEXT,
          prev_hash TEXT NOT NULL,
          row_hash TEXT NOT NULL,
          taken_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_recovery_action_taken_at
        ON recovery_action(taken_at DESC)
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS quarantined_raw_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('rate_limit','disk_full','schema_malicious','oversized','schema_broken','adversarial_pattern')),
          raw_payload_json TEXT NOT NULL,
          malicious_rule_id TEXT,
          quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TEXT,
          reviewer TEXT,
          disposition TEXT
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_quarantined_raw_events_source_quarantined
        ON quarantined_raw_events(source_id, quarantined_at DESC)
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS ingest_rate_state (
          source_path TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK (state IN ('accepting','rate_limited','circuit_open','disk_full_pause')),
          consecutive_drops INTEGER NOT NULL DEFAULT 0,
          last_drop_at TEXT,
          last_state_change_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          metadata_json TEXT
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS governance_audit_verification_state (
          table_name TEXT PRIMARY KEY,
          last_verified_id INTEGER NOT NULL DEFAULT 0,
          last_verified_at TEXT,
          verification_status TEXT,
          notes_json TEXT
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS reconciler_lease (
          source_id TEXT NOT NULL,
          window_start TEXT NOT NULL,
          window_end TEXT NOT NULL,
          leaseholder TEXT NOT NULL,
          acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          PRIMARY KEY (source_id, window_start, window_end)
        )
      `)

      db.exec(`
        CREATE TABLE IF NOT EXISTS governance_orphan_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          fk_column TEXT NOT NULL,
          orphan_id INTEGER NOT NULL,
          observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_governance_orphan_event_unresolved
        ON governance_orphan_event(table_name) WHERE resolved_at IS NULL
      `)

      // Per FR-382: assert no foreign-key violations exist after M65m
      // closes the schema. db.pragma('foreign_key_check') returns an
      // array of violation rows ([] when clean). Throwing here rolls
      // back the wrapping db.transaction() so the schema stays
      // unchanged for the operator to diagnose.
      const violations = db.pragma('foreign_key_check') as unknown[]
      if (Array.isArray(violations) && violations.length > 0) {
        throw new Error(
          `M65m foreign_key_check failed: ${JSON.stringify(violations)}`,
        )
      }
    }
  },
  {
    // SPEC-008 — M66 token_pricing
    //
    // Promotes facility-default model pricing from `src/lib/token-pricing.ts`
    // `MODEL_PRICING` to a DB-backed table with optional per-workspace
    // override per FR-260a / Q17. Cost calculations on `canonical_usage_events`
    // resolve via the most-recent
    //   `effective_at <= event_timestamp AND (expires_at IS NULL OR expires_at > event_timestamp)`
    // row, preferring `scope_kind='workspace'` over `scope_kind='facility'`.
    //
    // Seed: every entry in `MODEL_PRICING` is inserted as
    // `(scope_kind='facility', scope_id=NULL, source='facility-default')`.
    // INSERT OR IGNORE guards idempotency against the unique index.
    id: '066_token_pricing',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS token_pricing (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          scope_kind TEXT NOT NULL CHECK (scope_kind IN ('facility','workspace')),
          scope_id INTEGER,
          input_per_mtok_usd NUMERIC NOT NULL,
          output_per_mtok_usd NUMERIC NOT NULL,
          effective_at TEXT NOT NULL,
          expires_at TEXT,
          source TEXT NOT NULL DEFAULT 'operator',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_token_pricing_unique
        ON token_pricing(provider, model, scope_kind, scope_id, effective_at)
      `)

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_token_pricing_lookup
        ON token_pricing(provider, model, effective_at DESC)
        WHERE scope_kind='facility' AND expires_at IS NULL
      `)

      // Seed facility defaults from src/lib/token-pricing.ts MODEL_PRICING
      // (top-of-file ESM import). INSERT OR IGNORE guards idempotency
      // against the unique index.
      const insert = db.prepare(
        `INSERT OR IGNORE INTO token_pricing
           (provider, model, scope_kind, scope_id, input_per_mtok_usd, output_per_mtok_usd, effective_at, source)
         VALUES (?, ?, 'facility', NULL, ?, ?, CURRENT_TIMESTAMP, 'facility-default')`,
      )
      for (const [model, p] of Object.entries(MODEL_PRICING)) {
        const provider = model.includes('/') ? model.split('/')[0] : 'unknown'
        insert.run(provider, model, p.inputPerMTok, p.outputPerMTok)
      }
    },
  },
  {
    // SPEC-008 — M67 provider_accounts ToS + version + deactivated_at columns.
    //
    // Per FR-131..FR-149, FR-219u..FR-219y, and tasks.md T116/T121.
    // M64 created the provider_accounts skeleton with `deleted_at`; M65l
    // added `entitlements_json`, `config_json`, `tos_acknowledged_at`, and
    // `automation_class`. T116 / T121 require:
    //
    //   1. version INTEGER for optimistic concurrency. Defaults to 1 so
    //      pre-existing rows participate in expectedVersion semantics.
    //   2. deactivated_at TEXT — soft-delete column distinct from
    //      deleted_at. The application layer (`provider-accounts.ts`) sets
    //      this column on softDeleteProviderAccount() while preserving
    //      historical event linkage. `deleted_at` from M64 is retained
    //      untouched (forward-compat hard-delete reservation).
    //   3. governance_tos_acknowledgments_json TEXT — operator-supplied
    //      `{ ack_version, acknowledged_at, acknowledged_by, banner_state }`
    //      payload that the ToS lifecycle (T121, FR-139/FR-146/FR-147)
    //      reads + bumps on `ack_version` change with a 7-day grace banner.
    //
    // The `automation_class` CHECK constraint ('allowed','restricted',
    // 'forbidden') is enforced at the application layer (Zod) per advisor
    // guidance — SQLite cannot ALTER a column to add a CHECK without a
    // table rebuild, and a rebuild on a live table is higher risk than a
    // typed-write enforcement. provider-accounts.ts validates the column
    // on every write path. (FR-219w hard-block on 'forbidden' is enforced
    // by adapter activation gate, not by the DB.)
    id: '067_provider_accounts_governance_columns',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'provider_accounts', 'version', 'version INTEGER NOT NULL DEFAULT 1')
      addColumnIfMissing(db, 'provider_accounts', 'deactivated_at', 'deactivated_at TEXT')
      addColumnIfMissing(
        db,
        'provider_accounts',
        'governance_tos_acknowledgments_json',
        'governance_tos_acknowledgments_json TEXT'
      )
    },
  },
  {
    // SPEC-008 — M68 Aegis emergency reserve + governance mode (T130 / T131).
    //
    // Per FR-152, FR-155, FR-157, FR-159, FR-166. M60's
    // `resource_policies.policy_type` CHECK accepts only
    // {wip_limit, budget, blackout, degraded_window} (see TODO at M64) —
    // a table-rebuild to widen the CHECK touches every downstream FK and is
    // higher risk than a dedicated companion table. M68 instead introduces
    // `aegis_emergency_reserves` whose semantics (running balance + last
    // replenished + depleted_at) differ from policy-threshold rows anyway.
    //
    // Two columns:
    //   1. `aegis_emergency_reserves` — per-workspace reserve balance.
    //      `usd_remaining` and `tokens_remaining` count down on
    //      `allocateFromReserve`. `last_replenished_at` is stamped on every
    //      `replenishReserve` (policy window roll). `depleted_at` is stamped
    //      the first time balance hits 0 in a window (cleared on next
    //      replenish) so `depletionAlert` can de-dup per (workspace, hour).
    //   2. `workspaces.aegis_governance_mode` ('soft_alert' | 'hard_block')
    //      defaulting to 'soft_alert' per FR-155. The column is the
    //      authoritative store; FR-166's workspace-level override may be
    //      surfaced via `workspaces.feature_flags.aegis_governance_mode_override`
    //      JSON for legacy callers but the column wins on read.
    //
    // Additive + idempotent: both `addColumnIfMissing` and `CREATE TABLE
    // IF NOT EXISTS` paths are no-ops on rerun.
    id: '068_aegis_emergency_reserve_governance_mode',
    up(db: Database.Database) {
      // 1) Per-workspace emergency reserve balance.
      db.exec(`
        CREATE TABLE IF NOT EXISTS aegis_emergency_reserves (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          usd_remaining REAL NOT NULL DEFAULT 0,
          tokens_remaining INTEGER NOT NULL DEFAULT 0,
          usd_seed REAL NOT NULL DEFAULT 0,
          tokens_seed INTEGER NOT NULL DEFAULT 0,
          last_replenished_at TEXT,
          depleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (workspace_id)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_aegis_emergency_reserves_workspace
        ON aegis_emergency_reserves(workspace_id)
      `)

      // 2) Workspace-level Aegis governance mode (default 'soft_alert' per
      //    FR-155). Pre-existing workspaces get the default via column
      //    default; FR-166 overrides land via the feature_flags JSON path.
      addColumnIfMissing(
        db,
        'workspaces',
        'aegis_governance_mode',
        "aegis_governance_mode TEXT NOT NULL DEFAULT 'soft_alert'"
      )

      // 3) Aegis fallback de-dup table. Records `governance_aegis_fallback_<step>`
      //    activity emissions so the same (workspace_id, step, hour_bucket)
      //    can not double-write per FR-361.
      db.exec(`
        CREATE TABLE IF NOT EXISTS aegis_fallback_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          step TEXT NOT NULL CHECK (step IN ('emergency_reserve','local_mode','deferred_no_fallback')),
          hour_bucket TEXT NOT NULL,
          payload_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (workspace_id, step, hour_bucket)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_aegis_fallback_activity_workspace_hour
        ON aegis_fallback_activity(workspace_id, hour_bucket)
      `)
    },
  },
  {
    // SPEC-008 — M69 Idempotency-Key cache + governance grant-disable column.
    //
    // Per FR-209 / FR-219a (Idempotency-Key 24h replay window) and FR-219d
    // (override-anomaly auto-disable + admin re-enable). Both surfaces are
    // additive — no rebuilds, no data backfill — and serve Phase 7.7
    // (T138-T154).
    //
    // 1. `governance_idempotency_keys`: per-actor replay cache.
    //    - PRIMARY KEY (actor_id, idempotency_key): a single key may be
    //      reused across actors but is unique within an actor.
    //    - `request_body_hash`: SHA-256 hex of the canonical request body.
    //      Replay rule (FR-219a): same (actor, key) + same hash → return
    //      cached `response_body_json`; same key + DIFFERENT hash → 422
    //      `idempotency_key_body_mismatch` (FR-391).
    //    - `response_body_json`: serialized 2xx response captured at
    //      first-write. Stored verbatim so replays are byte-identical.
    //    - `response_status`: HTTP status code stored alongside the body
    //      so replays return the original status.
    //    - `expires_at`: created_at + 24h. The reaper sweeps expired rows.
    //    - Index `idx_governance_idempotency_keys_expires_at` powers the
    //      24h sweep.
    //
    // 2. `users.governance_grants_disabled_at`: nullable TEXT timestamp.
    //    Set by the FR-219d auto-disable detector when an actor causes ≥3
    //    `defer:anomaly` overrides within 1h. Cleared by the admin
    //    re-enable endpoint (`POST /api/governance/operators/<id>/reenable-grants`).
    //    Adding the column to `users` (vs. inventing a parallel actor
    //    table) keeps the actor-class story aligned with the existing
    //    role hierarchy ('admin' = SUPER-actor per FR-219d).
    id: '069_governance_idempotency_keys_grant_disable',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS governance_idempotency_keys (
          actor_id INTEGER NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_body_hash TEXT NOT NULL,
          response_body_json TEXT NOT NULL,
          response_status INTEGER NOT NULL,
          response_headers_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT NOT NULL,
          PRIMARY KEY (actor_id, idempotency_key)
        )
      `)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_governance_idempotency_keys_expires_at
        ON governance_idempotency_keys(expires_at)
      `)

      addColumnIfMissing(
        db,
        'users',
        'governance_grants_disabled_at',
        'governance_grants_disabled_at TEXT'
      )
    },
  },
  {
    // SPEC-008 — M070 manually_reset_at column on resource_governance_breaker.
    //
    // Per FR-006 / FR-219d: the breaker REST surface (T160-T162) supports an
    // admin-only manual reset (POST /api/governance/breaker/reset). When a
    // reset lands we want to record the wall-time of the operator action
    // separately from `reset_at` (which is also written by the live
    // half_open -> closed self-recovery path). The new column lets the
    // System Health UI distinguish "the breaker recovered on its own" from
    // "an operator forced it closed". Additive nullable column; rerun-safe
    // via addColumnIfMissing.
    id: '070_breaker_manually_reset_at',
    up(db: Database.Database) {
      addColumnIfMissing(
        db,
        'resource_governance_breaker',
        'manually_reset_at',
        'manually_reset_at TEXT'
      )
      addColumnIfMissing(
        db,
        'resource_governance_breaker',
        'manually_reset_by',
        'manually_reset_by TEXT'
      )
    },
  },
  {
    // SPEC-009A — generic workflow contract diagnostics and LKG snapshots.
    id: '071_workflow_contract_diagnostics',
    up(db: Database.Database) {
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

        CREATE TABLE IF NOT EXISTS workflow_contract_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          family TEXT NOT NULL,
          workspace_id INTEGER NOT NULL,
          contract_hash TEXT NOT NULL,
          canonical_json TEXT NOT NULL,
          runtime_templates_json TEXT NOT NULL,
          recovery_command TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_contract_runs_family_workspace_created
          ON workflow_contract_runs(family, workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_workflow_contract_run_errors_run_id
          ON workflow_contract_run_errors(run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_contract_snapshots_family_workspace_created
          ON workflow_contract_snapshots(family, workspace_id, created_at DESC);
      `)
    },
  },
  {
    // SPEC-009B follow-up — the seed/importer code references workflow_templates.enabled
    // (see src/lib/mission-control-seed/evidence.ts and src/lib/workflow-contracts/importer.ts),
    // but no prior migration added it. Test fixtures (src/lib/__tests__/mission-control-seed/test-db.ts)
    // include the column directly, so unit tests pass while live DBs upgrading from pre-PR-30
    // fail seed apply with "no such column: enabled". Surfaced 2026-05-12 during HAL deploy.
    id: '072_workflow_templates_enabled',
    up(db: Database.Database) {
      addColumnIfMissing(db, 'workflow_templates', 'enabled', 'enabled INTEGER NOT NULL DEFAULT 1')
    },
  },
  {
    // SPEC-009B follow-up — align facility workspace with D3 architectural intent:
    //   - Global-scope agents (Aegis, Security Guardian, HAL) live in `facility`
    //   - Admin-role users live in `facility` (they administer the whole tenant,
    //     not a single Product Line; the switcher lets them set activeWorkspace
    //     per session)
    //   - FEATURE_WORKSPACE_SWITCHER enabled on `facility` so admins can switch
    //
    // Pre-this-migration drift: M53 added agents.scope but rows stayed on
    // workspace_id=1; M59 created facility but never populated it; admin users
    // attached to default since initial setup. Surfaced 2026-05-12 during HAL
    // SPEC-009B deploy — the workspace switcher was invisible to the admin
    // because their auth workspace (default) had the flag explicitly false.
    //
    // Idempotent via WHERE workspace_id != facility_id and json_set merge.
    // No data loss — only workspace_id reassignment + feature_flag merge.
    id: '073_facility_workspace_global_alignment',
    up(db: Database.Database) {
      if (!tableExists(db, 'workspaces')) return

      const facility = db.prepare(
        `SELECT id FROM workspaces WHERE slug = 'facility' LIMIT 1`
      ).get() as { id: number } | undefined

      if (!facility) return

      if (
        tableExists(db, 'agents') &&
        columnExists(db, 'agents', 'scope') &&
        columnExists(db, 'agents', 'workspace_id')
      ) {
        db.prepare(
          `UPDATE agents SET workspace_id = ? WHERE scope = 'global' AND workspace_id != ?`
        ).run(facility.id, facility.id)
      }

      if (
        tableExists(db, 'users') &&
        columnExists(db, 'users', 'role') &&
        columnExists(db, 'users', 'workspace_id')
      ) {
        db.prepare(
          `UPDATE users SET workspace_id = ? WHERE role = 'admin' AND workspace_id != ?`
        ).run(facility.id, facility.id)
      }

      if (columnExists(db, 'workspaces', 'feature_flags')) {
        db.prepare(`
          UPDATE workspaces
          SET feature_flags = json_set(
            COALESCE(feature_flags, '{}'),
            '$.FEATURE_WORKSPACE_SWITCHER',
            json('true')
          )
          WHERE id = ?
        `).run(facility.id)
      }
    },
  },
  {
    // SPEC-009B follow-up — add workspaces.disabled_at column for soft-disabling
    // workspaces, per the Rollout doc Phase 9 rollback pattern. Used immediately
    // to retire the legacy `default` workspace from upstream MC pre-Product-Line
    // model. The row remains in the DB for upstream-compat invariants (auth.ts
    // hardcoded fallback to workspace_id=1, rate-limit.ts default workspace),
    // but it is excluded from the Product Line switcher via the
    // `disabled_at IS NULL` filter in listWorkspacesForTenant.
    //
    // Surfaced 2026-05-12 during HAL deploy when admin (now attached to
    // `facility` per M73) reported the `default` workspace still appeared in
    // the switcher and was visually cluttering the Product Line picker.
    //
    // Idempotent via addColumnIfMissing + WHERE disabled_at IS NULL.
    id: '074_workspaces_disabled_at',
    up(db: Database.Database) {
      if (!tableExists(db, 'workspaces')) return
      addColumnIfMissing(db, 'workspaces', 'disabled_at', 'disabled_at TEXT')
      if (
        columnExists(db, 'workspaces', 'slug') &&
        columnExists(db, 'workspaces', 'tenant_id') &&
        columnExists(db, 'workspaces', 'disabled_at')
      ) {
        db.prepare(
          `
            UPDATE workspaces
            SET disabled_at = datetime('now')
            WHERE slug = 'default'
              AND disabled_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM workspaces sibling
                WHERE sibling.tenant_id = workspaces.tenant_id
                  AND lower(sibling.slug) NOT IN ('default', 'facility')
                  AND sibling.disabled_at IS NULL
              )
          `
        ).run()
      }
    },
  },
  {
    id: '075_restore_default_when_no_product_line',
    up(db: Database.Database) {
      if (!tableExists(db, 'workspaces')) return
      if (
        !columnExists(db, 'workspaces', 'slug') ||
        !columnExists(db, 'workspaces', 'tenant_id') ||
        !columnExists(db, 'workspaces', 'disabled_at')
      ) {
        return
      }

      db.prepare(
        `
          UPDATE workspaces
          SET disabled_at = NULL
          WHERE slug = 'default'
            AND disabled_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM workspaces sibling
              WHERE sibling.tenant_id = workspaces.tenant_id
                AND lower(sibling.slug) NOT IN ('default', 'facility')
                AND sibling.disabled_at IS NULL
            )
        `
      ).run()
    },
  },
]

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row: any) => row.id)
  )

  for (const migration of [...migrations, ...extraMigrations]) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })()
  }
}
