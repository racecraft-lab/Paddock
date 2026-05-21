import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ALLOWED_EVIDENCE_STATES,
  SECTION_STATE_MATRIX,
  TASK_EVIDENCE_SCHEMA_VERSION,
  buildTaskEvidence,
  toInertEvidenceText,
  type TaskEvidenceResponse,
} from '@/lib/task-evidence'
import {
  closeTaskEvidenceDb,
  createTaskEvidenceDb,
  seedEligiblePilotEvidence,
  seedLocalOnlyTask,
  seedPartialProofTask,
  snapshotEvidenceCounts,
} from './task-evidence.fixtures'

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    const database = openDbs.pop()
    if (database) closeTaskEvidenceDb(database)
  }
})

function db(): Database.Database {
  const next = createTaskEvidenceDb()
  openDbs.push(next)
  return next
}

function scopedBuild(database: Database.Database, taskId: number, artifactStorageEnabled = true): TaskEvidenceResponse {
  const evidence = buildTaskEvidence(database, {
    taskId,
    scopeSql: 't.workspace_id = ?',
    scopeParams: [1],
    artifactStorageEnabled,
  })
  if (!evidence) throw new Error(`Missing fixture task evidence for task ${String(taskId)}`)
  return evidence
}

describe('SPEC-009E task evidence helper', () => {
  it('defines only the v1 evidence states allowed by the data model and section matrix', () => {
    expect(TASK_EVIDENCE_SCHEMA_VERSION).toBe('task_evidence.v1')
    expect(ALLOWED_EVIDENCE_STATES).toEqual([
      'eligible',
      'not_eligible',
      'incomplete',
      'available',
      'missing',
      'stale',
      'redacted',
      'quarantined',
      'superseded',
      'unavailable',
      'deferred',
    ])
    expect(SECTION_STATE_MATRIX.pilot_eligibility).toEqual([
      'eligible',
      'not_eligible',
      'incomplete',
      'missing',
      'unavailable',
    ])
    expect(SECTION_STATE_MATRIX.deferrals).toEqual(['deferred'])
  })

  it('derives an eligible retained pilot trail from stored Mission Control rows only', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)

    const evidence = scopedBuild(database, taskId)

    expect(evidence).toMatchObject({
      schema_version: 'task_evidence.v1',
      task: {
        state: 'available',
        id: String(taskId),
        github_repo: 'racecraft-lab/mission-control',
        github_issue_number: 50,
        github_pr_number: 51,
      },
      pilot_eligibility: {
        state: 'eligible',
        reasons: [],
      },
      identity: {
        state: 'available',
        repository: 'racecraft-lab/mission-control',
        issue: {
          number: 50,
          url: 'https://github.com/racecraft-lab/mission-control/issues/50',
        },
        pull_request: {
          number: 51,
          url: 'https://github.com/racecraft-lab/mission-control/pull/51',
        },
      },
      packet_artifacts: {
        state: 'available',
      },
      smoke: {
        state: 'available',
      },
      current_stage: {
        state: 'available',
        current_status: 'ready_for_owner',
      },
    })
    expect(evidence.deferrals).toHaveLength(7)
    expect(evidence.deferrals.map((entry) => entry.state)).toEqual(Array.from({ length: 7 }, () => 'deferred'))
    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'task', source_type: 'task', state: 'available' }),
      expect.objectContaining({ section: 'packet_artifacts', source_type: 'artifact', state: 'available' }),
      expect.objectContaining({ section: 'smoke', source_type: 'static_uat_link', state: 'available' }),
    ]))
  })

  it('maps local-only and partial-proof tasks to explicit domain states instead of empty success', () => {
    const database = db()
    const localOnlyId = seedLocalOnlyTask(database)
    const partialId = seedPartialProofTask(database)

    const localOnly = scopedBuild(database, localOnlyId)
    const partial = scopedBuild(database, partialId)

    expect(localOnly.pilot_eligibility.state).toBe('not_eligible')
    expect(localOnly.pilot_eligibility.reasons).toEqual(
      expect.arrayContaining(['missing_github_repo', 'missing_github_issue_number', 'missing_github_synced_at']),
    )
    expect(localOnly.identity.state).toBe('missing')
    expect(partial.pilot_eligibility.state).toBe('incomplete')
    expect(partial.identity).toMatchObject({
      state: 'incomplete',
      missing: ['missing_github_pr_number'],
    })
    expect(partial.packet_artifacts.state).toBe('quarantined')
    expect(partial.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'oversized', section: 'packet_artifacts' }),
      expect.objectContaining({ reason: 'superseded', section: 'packet_artifacts' }),
      expect.objectContaining({ reason: 'unsafe', section: 'packet_artifacts' }),
    ]))
  })

  it('degrades packet artifacts to unavailable when artifact storage is disabled', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)

    const evidence = scopedBuild(database, taskId, false)

    expect(evidence.packet_artifacts).toMatchObject({
      state: 'unavailable',
      unavailable_reason: 'artifact_storage_disabled',
      references: [],
    })
    expect(evidence.warnings).toContainEqual(expect.objectContaining({
      code: 'section_unavailable',
      section: 'packet_artifacts',
      reason: 'artifact_storage_disabled',
    }))
  })

  it('reads governance evidence from the migration-era policy event schema without workspace_id', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)
    database.exec(`
      DROP TABLE resource_policy_events;
      CREATE TABLE resource_policy_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER,
        task_id INTEGER,
        agent_id INTEGER,
        decision TEXT NOT NULL,
        reason TEXT,
        observed_value REAL,
        limit_value REAL,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT 1
      );
    `)
    database.prepare(`
      INSERT INTO resource_policy_events (task_id, decision, reason, metadata, created_at)
      VALUES (?, 'allow', 'Within pilot budget', '{"source":"spec-009e-fixture"}', 1779300500)
    `).run(taskId)

    const evidence = scopedBuild(database, taskId)

    expect(evidence.source_map).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_type: 'governance', state: 'available' }),
    ]))
  })

  it('normalizes stored evidence text as inert display text and performs no writes', () => {
    const database = db()
    const taskId = seedEligiblePilotEvidence(database)
    const before = snapshotEvidenceCounts(database)

    const unsafe = toInertEvidenceText('Before <b>bold</b> [link](javascript:alert(1)) data:text/plain,hi')
    const evidence = scopedBuild(database, taskId)
    const after = snapshotEvidenceCounts(database)

    expect(unsafe).toBe('Before bold link')
    expect(after).toEqual(before)
    expect(JSON.stringify(evidence)).not.toContain('storage_uri')
    expect(JSON.stringify(evidence)).not.toContain('javascript:alert')
    expect(JSON.stringify(evidence)).not.toContain('<script>')
  })
})
