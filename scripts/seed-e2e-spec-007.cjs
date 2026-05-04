#!/usr/bin/env node

const Database = require('better-sqlite3')
const { createHash } = require('node:crypto')

const dbPath = process.env.MISSION_CONTROL_DB_PATH
if (!dbPath) {
  console.error('MISSION_CONTROL_DB_PATH is required')
  process.exit(1)
}

// Anchor to real "now" so disposition triaged_at values always fall inside
// the rolling 7-day window the rollup API computes from Date.now(). A fixed
// historical anchor causes the dashboard rollup widget to drop rows once the
// real clock advances past the seeded last-7d band (e.g. 50 → 43 once a day
// rolls off), failing tests/e2e/spec-007-ui-visual.spec.ts:84.
const NOW_SECONDS = Math.floor(Date.now() / 1000)
const FIXTURE = {
  alphaWorkspace: { name: 'Spec 007 Alpha', slug: 'spec-007-alpha' },
  betaWorkspace: { name: 'Spec 007 Beta', slug: 'spec-007-beta' },
  alphaProject: { name: 'Spec 007 Alpha Project', ticketPrefix: 'SP7A' },
  betaProject: { name: 'Spec 007 Beta Project', ticketPrefix: 'SP7B' },
  agents: [
    'spec-007-agent-alpha-triager',
    'spec-007-agent-alpha-reviewer',
    'spec-007-agent-beta-triager',
    'spec-007-agent-beta-reviewer',
  ],
  dispositions: ['merged', 'closed', 'rejected', 'rerouted', 'duplicate', 'completed', 'abandoned', 'unknown'],
}
const TOTAL_DISPOSITIONS = 250
const LAST_7D_DISPOSITIONS = 50

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
}

function columnsFor(db, table) {
  if (!tableExists(db, table)) return new Set()
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name))
}

function placeholders(values) {
  return values.map(() => '?').join(', ')
}

function insertRow(db, table, values) {
  const columns = columnsFor(db, table)
  const entries = Object.entries(values).filter(([column]) => columns.has(column))
  if (entries.length === 0) throw new Error(`No insertable columns found for ${table}`)
  const names = entries.map(([column]) => column)
  const info = db.prepare(`
    INSERT INTO ${table} (${names.join(', ')})
    VALUES (${names.map(() => '?').join(', ')})
  `).run(...entries.map(([, value]) => value))
  return Number(info.lastInsertRowid)
}

function selectIdsWhereIn(db, table, column, values) {
  if (values.length === 0 || !tableExists(db, table)) return []
  return db
    .prepare(`SELECT id FROM ${table} WHERE ${column} IN (${placeholders(values)})`)
    .all(...values)
    .map((row) => row.id)
}

function deleteWhereIn(db, table, column, values) {
  if (values.length === 0 || !tableExists(db, table)) return
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(values)})`).run(...values)
}

function mergeFeatureFlags(raw, updates) {
  let flags = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) flags = parsed
    } catch {
      flags = {}
    }
  }
  return JSON.stringify({ ...flags, ...updates })
}

function resetFixture(db) {
  const workspaceSlugs = [FIXTURE.alphaWorkspace.slug, FIXTURE.betaWorkspace.slug]
  const workspaceIds = selectIdsWhereIn(db, 'workspaces', 'slug', workspaceSlugs)
  const taskIds = selectIdsWhereIn(db, 'tasks', 'workspace_id', workspaceIds)

  deleteWhereIn(db, 'task_artifacts', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'task_dispositions', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'activities', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'comments', 'task_id', taskIds)
  deleteWhereIn(db, 'task_subscriptions', 'task_id', taskIds)
  deleteWhereIn(db, 'quality_reviews', 'task_id', taskIds)
  deleteWhereIn(db, 'tasks', 'id', taskIds)
  deleteWhereIn(db, 'agents', 'name', FIXTURE.agents)
  deleteWhereIn(db, 'agents', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'projects', 'workspace_id', workspaceIds)
  deleteWhereIn(db, 'workspaces', 'id', workspaceIds)
}

function enableSpec007Flags(db) {
  const rows = db.prepare('SELECT id, feature_flags FROM workspaces').all()
  const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
  for (const row of rows) {
    update.run(
      mergeFeatureFlags(row.feature_flags, {
        FEATURE_WORKSPACE_SWITCHER: true,
        FEATURE_DISPOSITION_LOGGING: true,
        FEATURE_TASK_ARTIFACTS: true,
      }),
      row.id,
    )
  }
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function createWorkspace(db, input) {
  const id = insertRow(db, 'workspaces', {
    name: input.name,
    slug: input.slug,
    tenant_id: 1,
    feature_flags: JSON.stringify({
      FEATURE_WORKSPACE_SWITCHER: true,
      FEATURE_DISPOSITION_LOGGING: true,
      FEATURE_TASK_ARTIFACTS: true,
    }),
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
  return { id, name: input.name, slug: input.slug }
}

function createProject(db, workspaceId, input) {
  const id = insertRow(db, 'projects', {
    workspace_id: workspaceId,
    name: input.name,
    slug: slugify(input.name),
    ticket_prefix: input.ticketPrefix,
    ticket_counter: 2,
    status: 'active',
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
  return { id, name: input.name }
}

function createAgent(db, workspaceId, name) {
  const id = insertRow(db, 'agents', {
    name,
    role: 'tester',
    status: 'offline',
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
    config: JSON.stringify({ e2e_fixture: 'spec-007' }),
    workspace_id: workspaceId,
  })
  return { id, name, workspaceId }
}

function createTask(db, workspaceId, projectId, title, assignedTo, ticketNo) {
  const id = insertRow(db, 'tasks', {
    title,
    description: `${title} seeded by SPEC-007 e2e fixture`,
    priority: 'medium',
    status: 'inbox',
    project_id: projectId,
    project_ticket_no: ticketNo,
    assigned_to: assignedTo,
    created_by: 'e2e',
    workspace_id: workspaceId,
    tags: JSON.stringify(['spec-007']),
    metadata: JSON.stringify({ e2e_fixture: 'spec-007' }),
    created_at: NOW_SECONDS,
    updated_at: NOW_SECONDS,
  })
  return { id, workspaceId }
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

function buildDispositionPlans(workspace, agents, tasks) {
  const plans = []
  const olderTarget = TOTAL_DISPOSITIONS - LAST_7D_DISPOSITIONS
  const last7DayCutoff = NOW_SECONDS - 7 * 24 * 60 * 60
  for (let i = 0; i < olderTarget; i += 1) {
    const dayOffset = 7 + (i % 23)
    plans.push({
      workspace_id: workspace.id,
      task_id: tasks[i % tasks.length].id,
      disposition: FIXTURE.dispositions[i % FIXTURE.dispositions.length],
      triaged_at: NOW_SECONDS - dayOffset * 24 * 60 * 60 - (i % 86400),
      triaged_by_agent_id: agents[i % agents.length].id,
      reason: i % 5 === 0 ? `seed reason ${i}` : null,
    })
  }
  for (let i = 0; i < LAST_7D_DISPOSITIONS; i += 1) {
    const dayOffset = i % 7
    const triagedAt = NOW_SECONDS - dayOffset * 24 * 60 * 60 - (i % 3600)
    plans.push({
      workspace_id: workspace.id,
      task_id: tasks[i % tasks.length].id,
      disposition: FIXTURE.dispositions[i % FIXTURE.dispositions.length],
      triaged_at: Math.max(triagedAt, last7DayCutoff + 1),
      triaged_by_agent_id: agents[i % agents.length].id,
      reason: null,
    })
  }
  return plans
}

function insertDispositions(db, plans) {
  if (!tableExists(db, 'task_dispositions')) return []
  const stmt = db.prepare(`
    INSERT INTO task_dispositions
      (task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const out = []
  db.transaction((rows) => {
    for (const row of rows) {
      const info = stmt.run(row.task_id, row.disposition, row.reason, row.triaged_by_agent_id, row.triaged_at, row.workspace_id)
      out.push({ id: Number(info.lastInsertRowid), ...row })
    }
  })(plans)
  return out
}

function buildArtifactPlans(workspace, agents, tasks) {
  const baseTs = NOW_SECONDS - 24 * 60 * 60
  const plans = []
  let cursor = 0
  const nextTask = () => tasks[cursor++ % tasks.length]
  const pushArtifact = (input) => plans.push(input)

  for (let i = 0; i < 4; i += 1) {
    const json = JSON.stringify({ outcome: 'ok', index: i })
    pushArtifact({
      workspace_id: workspace.id,
      task_id: nextTask().id,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_json',
      storage_uri: null,
      redaction_status: 'clean',
      security_scan_status: 'scanned_clean',
      byte_size: Buffer.byteLength(json, 'utf8'),
      mime_type: 'application/json',
      content_json: json,
      content_markdown: null,
      sha256: sha256(json),
      schema_version: '2026-05',
      workflow_template_slug: 'spec-007-triage',
      original_filename: null,
      producer_agent_id: agents[i % agents.length].id,
      supersedes_artifact_id: null,
      created_at: baseTs + i,
    })
  }
  for (let i = 0; i < 2; i += 1) {
    const md = `Redacted preview ${i}: <REDACTED:secret>\n`
    pushArtifact({
      workspace_id: workspace.id,
      task_id: nextTask().id,
      artifact_type: 'triage_outcome',
      storage_kind: 'inline_markdown',
      storage_uri: null,
      redaction_status: 'redacted',
      security_scan_status: 'scanned_with_findings',
      byte_size: Buffer.byteLength(md, 'utf8'),
      mime_type: 'text/markdown',
      content_json: null,
      content_markdown: md,
      sha256: sha256(md),
      schema_version: null,
      workflow_template_slug: 'spec-007-triage',
      original_filename: null,
      producer_agent_id: agents[(i + 1) % agents.length].id,
      supersedes_artifact_id: null,
      created_at: baseTs + 100 + i,
    })
  }
  for (let i = 0; i < 2; i += 1) {
    const content = `Quarantined sample ${i}`
    const isFile = i === 1
    pushArtifact({
      workspace_id: workspace.id,
      task_id: nextTask().id,
      artifact_type: 'triage_outcome',
      storage_kind: isFile ? 'file' : 'inline_markdown',
      storage_uri: isFile ? `${workspace.id}/2026/05/quarantined-${i}.bin` : null,
      redaction_status: 'quarantined',
      security_scan_status: 'scanned_with_findings',
      byte_size: Buffer.byteLength(content, 'utf8'),
      mime_type: isFile ? 'application/octet-stream' : 'text/markdown',
      content_json: null,
      content_markdown: isFile ? null : content,
      sha256: sha256(content),
      schema_version: null,
      workflow_template_slug: 'spec-007-triage',
      original_filename: isFile ? `quarantined-${i}.bin` : null,
      producer_agent_id: agents[i % agents.length].id,
      supersedes_artifact_id: null,
      created_at: baseTs + 200 + i,
    })
  }
  for (let i = 0; i < 2; i += 1) {
    const content = `File-backed payload ${i}`
    pushArtifact({
      workspace_id: workspace.id,
      task_id: nextTask().id,
      artifact_type: 'attachment',
      storage_kind: 'file',
      storage_uri: `${workspace.id}/2026/05/clean-${i}.txt`,
      redaction_status: 'clean',
      security_scan_status: 'scanned_clean',
      byte_size: Buffer.byteLength(content, 'utf8'),
      mime_type: 'text/plain',
      content_json: null,
      content_markdown: null,
      sha256: sha256(content),
      schema_version: null,
      workflow_template_slug: null,
      original_filename: `clean-${i}.txt`,
      producer_agent_id: agents[(i + 2) % agents.length].id,
      supersedes_artifact_id: null,
      created_at: baseTs + 300 + i,
    })
  }
  const mismatch = 'Hash mismatch sample'
  pushArtifact({
    workspace_id: workspace.id,
    task_id: nextTask().id,
    artifact_type: 'attachment',
    storage_kind: 'file',
    storage_uri: `${workspace.id}/2026/05/hash-mismatch.txt`,
    redaction_status: 'clean',
    security_scan_status: 'hash_mismatch',
    byte_size: Buffer.byteLength(mismatch, 'utf8'),
    mime_type: 'text/plain',
    content_json: null,
    content_markdown: null,
    sha256: sha256(mismatch),
    schema_version: null,
    workflow_template_slug: null,
    original_filename: 'hash-mismatch.txt',
    producer_agent_id: agents[0].id,
    supersedes_artifact_id: null,
    created_at: baseTs + 400,
  })
  const superseded = JSON.stringify({ outcome: 'superseded', revision: 2 })
  pushArtifact({
    workspace_id: workspace.id,
    task_id: nextTask().id,
    artifact_type: 'triage_outcome',
    storage_kind: 'inline_json',
    storage_uri: null,
    redaction_status: 'superseded',
    security_scan_status: 'scanned_clean',
    byte_size: Buffer.byteLength(superseded, 'utf8'),
    mime_type: 'application/json',
    content_json: superseded,
    content_markdown: null,
    sha256: sha256(superseded),
    schema_version: '2026-05',
    workflow_template_slug: 'spec-007-triage',
    original_filename: null,
    producer_agent_id: agents[1].id,
    supersedes_artifact_id: null,
    created_at: baseTs + 500,
  })
  return plans
}

function insertArtifacts(db, plans) {
  if (!tableExists(db, 'task_artifacts')) return []
  const stmt = db.prepare(`
    INSERT INTO task_artifacts
      (task_id, workspace_id, artifact_type, storage_kind, storage_uri,
       redaction_status, security_scan_status, sha256, byte_size, mime_type,
       content_json, content_markdown, preview_text, schema_version,
       workflow_template_slug, original_filename, producer_agent_id,
       supersedes_artifact_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const out = []
  db.transaction((rows) => {
    for (const row of rows) {
      const info = stmt.run(
        row.task_id,
        row.workspace_id,
        row.artifact_type,
        row.storage_kind,
        row.storage_uri,
        row.redaction_status,
        row.security_scan_status,
        row.sha256,
        row.byte_size,
        row.mime_type,
        row.content_json,
        row.content_markdown,
        null,
        row.schema_version,
        row.workflow_template_slug,
        row.original_filename,
        row.producer_agent_id,
        row.supersedes_artifact_id,
        row.created_at,
      )
      out.push({ id: Number(info.lastInsertRowid), ...row })
    }
  })(plans)
  if (out.length >= 2) {
    db.prepare('UPDATE task_artifacts SET supersedes_artifact_id = ? WHERE id = ?')
      .run(out[0].id, out[out.length - 1].id)
  }
  return out
}

const db = new Database(dbPath)

try {
  if (!tableExists(db, 'workspaces')) {
    throw new Error(`No workspaces table found in ${dbPath}; start the e2e app once before seeding`)
  }
  db.pragma('busy_timeout = 5000')
  resetFixture(db)
  enableSpec007Flags(db)

  const alphaWorkspace = createWorkspace(db, FIXTURE.alphaWorkspace)
  const betaWorkspace = createWorkspace(db, FIXTURE.betaWorkspace)
  const alphaProject = createProject(db, alphaWorkspace.id, FIXTURE.alphaProject)
  const betaProject = createProject(db, betaWorkspace.id, FIXTURE.betaProject)
  const alphaAgents = [
    createAgent(db, alphaWorkspace.id, FIXTURE.agents[0]),
    createAgent(db, alphaWorkspace.id, FIXTURE.agents[1]),
  ]
  const betaAgents = [
    createAgent(db, betaWorkspace.id, FIXTURE.agents[2]),
    createAgent(db, betaWorkspace.id, FIXTURE.agents[3]),
  ]
  const alphaTasks = [
    createTask(db, alphaWorkspace.id, alphaProject.id, 'SPEC-007 Alpha task 0', alphaAgents[0].name, 1),
    createTask(db, alphaWorkspace.id, alphaProject.id, 'SPEC-007 Alpha task 1', alphaAgents[1].name, 2),
  ]
  const betaTasks = [
    createTask(db, betaWorkspace.id, betaProject.id, 'SPEC-007 Beta task 0', betaAgents[0].name, 1),
    createTask(db, betaWorkspace.id, betaProject.id, 'SPEC-007 Beta task 1', betaAgents[1].name, 2),
  ]

  const alphaDispositions = insertDispositions(db, buildDispositionPlans(alphaWorkspace, alphaAgents, alphaTasks))
  const betaDispositions = insertDispositions(db, buildDispositionPlans(betaWorkspace, betaAgents, betaTasks))
  const alphaArtifacts = insertArtifacts(db, buildArtifactPlans(alphaWorkspace, alphaAgents, alphaTasks))
  const betaArtifacts = insertArtifacts(db, buildArtifactPlans(betaWorkspace, betaAgents, betaTasks))

  db.pragma('wal_checkpoint(TRUNCATE)')
  console.log(`[e2e-docker] seeded SPEC-007 fixture: ${JSON.stringify({
    workspaceIds: [alphaWorkspace.id, betaWorkspace.id],
    dispositionCounts: [alphaDispositions.length, betaDispositions.length],
    artifactCounts: [alphaArtifacts.length, betaArtifacts.length],
  })}`)
} finally {
  db.close()
}
