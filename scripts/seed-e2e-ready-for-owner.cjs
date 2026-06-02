#!/usr/bin/env node

const Database = require('better-sqlite3')

const dbPath = process.env.PADDOCK_DB_PATH
if (!dbPath) {
  console.error('PADDOCK_DB_PATH is required')
  process.exit(1)
}

const FIXTURE_NOW_SECONDS = Math.floor(new Date('2026-04-28T12:00:00.000Z').getTime() / 1000)
const READY_FOR_OWNER_RECIPIENT = 'owner-e2e-ready-for-owner-visual'
const READY_FOR_OWNER_WORKSPACE = {
  name: 'SPEC-005 Ready for Owner Visual',
  slug: 'spec-005-ready-for-owner-visual',
}
const READY_FOR_OWNER_PROJECT = {
  name: 'SPEC-005 Ready for Owner',
  slug: 'spec-005-ready-for-owner',
  ticket_prefix: 'S005',
}
const READY_FOR_OWNER_WORKFLOW_SLUG = 'spec-005-ready-for-owner-pr'
const READY_FOR_OWNER_REQUIRED_FLAGS = {
  FEATURE_WORKSPACE_SWITCHER: true,
  FEATURE_GLOBAL_AEGIS: true,
  FEATURE_TASK_PIPELINES: true,
  FEATURE_TWO_STEP_TERMINAL: true,
}
const FIXTURE_TITLES = {
  awaitingOwner: 'SPEC-005 Ready for Owner - Awaiting Owner',
  qualityReview: 'SPEC-005 Ready for Owner - Quality Review',
  readyForOwner: 'SPEC-005 Ready for Owner - Waiting on Merge',
  done: 'SPEC-005 Ready for Owner - Done',
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function columnsFor(db, table) {
  if (!tableExists(db, table)) return new Set()
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name))
}

function sqlPlaceholders(values) {
  return values.map(() => '?').join(', ')
}

function insertRow(db, table, values) {
  const columns = columnsFor(db, table)
  const filteredEntries = Object.entries(values).filter(([column]) => columns.has(column))
  if (filteredEntries.length === 0) throw new Error(`No insertable columns found for ${table}`)
  const names = filteredEntries.map(([column]) => column)
  const placeholders = names.map(() => '?').join(', ')
  const result = db.prepare(`
    INSERT INTO ${table} (${names.join(', ')})
    VALUES (${placeholders})
  `).run(...filteredEntries.map(([, value]) => value))
  return Number(result.lastInsertRowid)
}

function updateRow(db, table, values, whereSql, whereParams) {
  const columns = columnsFor(db, table)
  const filteredEntries = Object.entries(values).filter(([column]) => columns.has(column))
  if (filteredEntries.length === 0) return
  const assignments = filteredEntries.map(([column]) => `${column} = ?`).join(', ')
  db.prepare(`UPDATE ${table} SET ${assignments} WHERE ${whereSql}`)
    .run(...filteredEntries.map(([, value]) => value), ...whereParams)
}

function deleteFixture(db) {
  const workspaceIds = tableExists(db, 'workspaces')
    ? db.prepare('SELECT id FROM workspaces WHERE slug = ?')
      .all(READY_FOR_OWNER_WORKSPACE.slug)
      .map((row) => row.id)
    : []

  const titles = Object.values(FIXTURE_TITLES)
  const taskIdsByTitle = tableExists(db, 'tasks')
    ? db.prepare(`SELECT id FROM tasks WHERE title IN (${sqlPlaceholders(titles)})`)
      .all(...titles)
      .map((row) => row.id)
    : []
  const taskIdsByWorkspace = workspaceIds.length > 0 && tableExists(db, 'tasks')
    ? db.prepare(`SELECT id FROM tasks WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`)
      .all(...workspaceIds)
      .map((row) => row.id)
    : []
  const taskIds = Array.from(new Set([...taskIdsByTitle, ...taskIdsByWorkspace]))

  if (taskIds.length > 0) {
    if (tableExists(db, 'notifications')) {
      db.prepare(`DELETE FROM notifications WHERE source_type = 'task' AND source_id IN (${sqlPlaceholders(taskIds)})`)
        .run(...taskIds)
    }
    if (tableExists(db, 'activities')) {
      db.prepare(`DELETE FROM activities WHERE entity_type = 'task' AND entity_id IN (${sqlPlaceholders(taskIds)})`)
        .run(...taskIds)
    }
    if (tableExists(db, 'comments')) {
      db.prepare(`DELETE FROM comments WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
    }
    if (tableExists(db, 'task_subscriptions')) {
      db.prepare(`DELETE FROM task_subscriptions WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
    }
    if (tableExists(db, 'quality_reviews')) {
      db.prepare(`DELETE FROM quality_reviews WHERE task_id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
    }
    db.prepare(`DELETE FROM tasks WHERE id IN (${sqlPlaceholders(taskIds)})`).run(...taskIds)
  }

  if (workspaceIds.length > 0) {
    if (tableExists(db, 'notifications')) {
      db.prepare('DELETE FROM notifications WHERE recipient = ?').run(READY_FOR_OWNER_RECIPIENT)
      db.prepare(`DELETE FROM notifications WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
    }
    if (tableExists(db, 'activities')) {
      db.prepare(`DELETE FROM activities WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
    }
    if (tableExists(db, 'workflow_templates')) {
      db.prepare(`DELETE FROM workflow_templates WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
    }
    if (tableExists(db, 'projects')) {
      db.prepare(`DELETE FROM projects WHERE workspace_id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
    }
    db.prepare(`DELETE FROM workspaces WHERE id IN (${sqlPlaceholders(workspaceIds)})`).run(...workspaceIds)
  }
}

function createTask(db, input) {
  return insertRow(db, 'tasks', {
    title: input.title,
    description: `${input.title} seeded for ready_for_owner Kanban e2e coverage`,
    status: input.status,
    priority: input.priority,
    assigned_to: READY_FOR_OWNER_RECIPIENT,
    created_by: 'e2e',
    created_at: FIXTURE_NOW_SECONDS,
    updated_at: FIXTURE_NOW_SECONDS,
    completed_at: input.status === 'done' ? FIXTURE_NOW_SECONDS : null,
    project_id: input.projectId,
    project_ticket_no: input.ticketNo,
    workspace_id: input.workspaceId,
    workflow_template_id: input.workflowTemplateId ?? null,
    workflow_template_slug: input.workflowTemplateSlug ?? null,
    github_repo: input.githubRepo ?? null,
    github_pr_number: input.githubPrNumber ?? null,
    tags: JSON.stringify(input.tags ?? ['ready-for-owner']),
    metadata: JSON.stringify({ e2e_fixture: 'ready-for-owner' }),
  })
}

const db = new Database(dbPath)

try {
  if (!tableExists(db, 'workspaces')) {
    throw new Error(`No workspaces table found in ${dbPath}; start the e2e app once before seeding`)
  }

  let seeded
  db.transaction(() => {
    deleteFixture(db)

    const workspaceId = insertRow(db, 'workspaces', {
      slug: READY_FOR_OWNER_WORKSPACE.slug,
      name: READY_FOR_OWNER_WORKSPACE.name,
      tenant_id: 1,
      feature_flags: JSON.stringify(READY_FOR_OWNER_REQUIRED_FLAGS),
      created_at: FIXTURE_NOW_SECONDS,
      updated_at: FIXTURE_NOW_SECONDS,
    })

    const projectId = insertRow(db, 'projects', {
      workspace_id: workspaceId,
      name: READY_FOR_OWNER_PROJECT.name,
      slug: READY_FOR_OWNER_PROJECT.slug,
      ticket_prefix: READY_FOR_OWNER_PROJECT.ticket_prefix,
      ticket_counter: 4,
      status: 'active',
      created_at: FIXTURE_NOW_SECONDS,
      updated_at: FIXTURE_NOW_SECONDS,
    })

    const workflowTemplateId = insertRow(db, 'workflow_templates', {
      name: 'SPEC-005 Ready for Owner PR workflow',
      description: 'E2E PR-producing workflow for Ready for Owner coverage.',
      model: 'sonnet',
      task_prompt: 'Produce a pull request and wait for owner merge.',
      timeout_seconds: 300,
      agent_role: 'builder',
      tags: JSON.stringify(['ready-for-owner']),
      created_by: 'e2e',
      created_at: FIXTURE_NOW_SECONDS,
      updated_at: FIXTURE_NOW_SECONDS,
      workspace_id: workspaceId,
      slug: READY_FOR_OWNER_WORKFLOW_SLUG,
      output_schema: null,
      routing_rules: JSON.stringify([]),
      next_template_slug: null,
      produces_pr: 1,
      external_terminal_event: 'github_pr_merged',
      allow_redacted_artifacts: 0,
    })

    const awaitingOwnerId = createTask(db, {
      workspaceId,
      projectId,
      ticketNo: 1,
      title: FIXTURE_TITLES.awaitingOwner,
      status: 'awaiting_owner',
      priority: 'high',
    })
    const qualityReviewId = createTask(db, {
      workspaceId,
      projectId,
      ticketNo: 2,
      title: FIXTURE_TITLES.qualityReview,
      status: 'quality_review',
      priority: 'medium',
    })
    const readyForOwnerId = createTask(db, {
      workspaceId,
      projectId,
      ticketNo: 3,
      title: FIXTURE_TITLES.readyForOwner,
      status: 'quality_review',
      priority: 'high',
      workflowTemplateId,
      workflowTemplateSlug: READY_FOR_OWNER_WORKFLOW_SLUG,
      githubRepo: 'racecraft-lab/Paddock',
      githubPrNumber: 23,
    })
    const doneId = createTask(db, {
      workspaceId,
      projectId,
      ticketNo: 4,
      title: FIXTURE_TITLES.done,
      status: 'done',
      priority: 'low',
    })

    for (const taskId of [awaitingOwnerId, qualityReviewId, readyForOwnerId, doneId]) {
      if (tableExists(db, 'task_subscriptions')) {
        insertRow(db, 'task_subscriptions', {
          task_id: taskId,
          agent_name: READY_FOR_OWNER_RECIPIENT,
          created_at: FIXTURE_NOW_SECONDS,
        })
      }
    }

    updateRow(db, 'projects', { ticket_counter: 4 }, 'id = ? AND workspace_id = ?', [projectId, workspaceId])
    seeded = { workspaceId, projectId, workflowTemplateId, taskIds: [awaitingOwnerId, qualityReviewId, readyForOwnerId, doneId] }
  })()

  db.pragma('wal_checkpoint(PASSIVE)')
  console.log(`[e2e-docker] seeded SPEC-005 ready-for-owner fixture: ${JSON.stringify(seeded)}`)
} finally {
  db.close()
}
