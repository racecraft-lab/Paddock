import Database from 'better-sqlite3'

export interface EvidenceRowCounts {
  tasks: number
  activities: number
  taskArtifacts: number
  qualityReviews: number
  githubSyncs: number
}

export function createTaskEvidenceDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY,
      slug TEXT,
      feature_flags TEXT
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      github_repo TEXT,
      github_issue_number INTEGER,
      github_pr_number INTEGER,
      github_synced_at INTEGER,
      parent_task_id INTEGER,
      root_task_id INTEGER,
      chain_id TEXT,
      chain_stage TEXT,
      created_at INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT 1
    );
    CREATE TABLE task_artifacts (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL,
      schema_version TEXT,
      storage_kind TEXT NOT NULL,
      storage_uri TEXT,
      original_filename TEXT,
      mime_type TEXT,
      byte_size INTEGER,
      sha256 TEXT,
      preview_text TEXT,
      redaction_status TEXT NOT NULL DEFAULT 'clean',
      security_scan_status TEXT NOT NULL DEFAULT 'scanned_clean',
      supersedes_artifact_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      description TEXT,
      data TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      source_type TEXT,
      source_id INTEGER,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE quality_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      workspace_id INTEGER,
      reviewer TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE resource_policy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      workspace_id INTEGER,
      decision TEXT,
      reason TEXT,
      details_json TEXT,
      created_at INTEGER DEFAULT 1
    );
    CREATE TABLE github_syncs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT NOT NULL,
      last_synced_at INTEGER NOT NULL DEFAULT 1,
      issue_count INTEGER NOT NULL DEFAULT 0,
      sync_direction TEXT NOT NULL DEFAULT 'inbound',
      status TEXT NOT NULL DEFAULT 'success',
      error TEXT,
      workspace_id INTEGER,
      created_at INTEGER DEFAULT 1
    );
  `)
  db.prepare('INSERT INTO workspaces (id, slug, feature_flags) VALUES (1, ?, ?)').run(
    'spec-009e',
    JSON.stringify({ FEATURE_TASK_ARTIFACTS: true }),
  )
  return db
}

export function closeTaskEvidenceDb(db: Database.Database): void {
  db.close()
}

export function seedEligiblePilotEvidence(db: Database.Database, taskId = 500): number {
  db.prepare(`
    INSERT INTO tasks (
      id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number,
      github_synced_at, chain_id, chain_stage, created_at, updated_at
    )
    VALUES (?, 1, ?, 'ready_for_owner', 'racecraft-lab/mission-control', 50, 51,
      1779300000, 'spec-009e-uat', 'ready_for_owner', 1779300000, 1779300100)
  `).run(taskId, 'SPEC-009E retained pilot trail')
  db.prepare(`
    INSERT INTO task_artifacts (
      id, task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
      byte_size, sha256, preview_text, redaction_status, security_scan_status, created_at
    )
    VALUES
      (900, ?, 1, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
       512, ?, 'SPEC-009D packet references smoke checklist proof for issue #50 / PR #51.', 'clean', 'scanned_clean', 1779300200),
      (901, ?, 1, 'pilot_review_packet_markdown', 'spec-009d.packet.v1', 'inline_markdown', 'text/markdown',
       256, ?, 'Packet markdown export for <script>alert(1)</script> [unsafe](javascript:alert(1)).', 'redacted', 'scanned_clean', 1779300210)
  `).run(taskId, 'a'.repeat(64), taskId, 'b'.repeat(64))
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id, created_at)
    VALUES ('task_ready_for_owner', 'task', ?, 'mission-control', 'Ready for owner after retained pilot smoke', ?, 1, 1779300300)
  `).run(taskId, JSON.stringify({ smoke_checklist: true, github_pr_number: 51 }))
  db.prepare(`
    INSERT INTO quality_reviews (task_id, workspace_id, reviewer, status, notes, created_at)
    VALUES (?, 1, 'aegis', 'approved', 'Aegis approved retained pilot evidence.', 1779300400)
  `).run(taskId)
  db.prepare(`
    INSERT INTO resource_policy_events (task_id, workspace_id, decision, reason, details_json, created_at)
    VALUES (?, 1, 'allow', 'Within pilot budget', '{"source":"spec-009e-fixture"}', 1779300500)
  `).run(taskId)
  db.prepare(`
    INSERT INTO github_syncs (repo, last_synced_at, issue_count, sync_direction, status, workspace_id, created_at)
    VALUES ('racecraft-lab/mission-control', 1779300600, 1, 'inbound', 'success', 1, 1779300600)
  `).run()
  return taskId
}

export function seedLocalOnlyTask(db: Database.Database, taskId = 600): number {
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number, github_synced_at)
    VALUES (?, 1, 'Local-only task', 'in_progress', NULL, NULL, NULL, NULL)
  `).run(taskId)
  return taskId
}

export function seedPartialProofTask(db: Database.Database, taskId = 700): number {
  db.prepare(`
    INSERT INTO tasks (id, workspace_id, title, status, github_repo, github_issue_number, github_pr_number, github_synced_at)
    VALUES (?, 1, 'Partial pilot proof', 'review', 'racecraft-lab/mission-control', 50, NULL, 1779300000)
  `).run(taskId)
  db.prepare(`
    INSERT INTO task_artifacts (
      id, task_id, workspace_id, artifact_type, schema_version, storage_kind, mime_type,
      byte_size, sha256, preview_text, redaction_status, security_scan_status, supersedes_artifact_id, created_at
    )
    VALUES
      (910, ?, 1, 'pilot_review_packet_json', 'spec-009d.packet.v1', 'inline_json', 'application/json',
       131072, ?, 'Large packet preview must not be needed for proof.', 'clean', 'scanned_clean', NULL, 1779300200),
      (911, ?, 1, 'pilot_review_packet_markdown', 'spec-009d.packet.v1', 'inline_markdown', 'text/markdown',
       128, ?, 'Superseded packet', 'superseded', 'scanned_clean', 910, 1779300210),
      (912, ?, 1, 'review_verdict', 'spec-009c3.v1', 'inline_json', 'application/json',
       128, ?, 'Do not show quarantined preview', 'quarantined', 'scanned_with_findings', NULL, 1779300220)
  `).run(taskId, 'c'.repeat(64), taskId, 'd'.repeat(64), taskId, 'e'.repeat(64))
  return taskId
}

export function snapshotEvidenceCounts(db: Database.Database): EvidenceRowCounts {
  return {
    tasks: count(db, 'tasks'),
    activities: count(db, 'activities'),
    taskArtifacts: count(db, 'task_artifacts'),
    qualityReviews: count(db, 'quality_reviews'),
    githubSyncs: count(db, 'github_syncs'),
  }
}

function count(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}
