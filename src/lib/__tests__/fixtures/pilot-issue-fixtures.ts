import type Database from 'better-sqlite3'
import type { GitHubIssue } from '../../github'
import type { PilotIssueCandidate } from '../../pilot-issue-eligibility'

export const PILOT_REPO = 'racecraft-lab/Paddock'
export const SYNTHETIC_TITLE = '[mc-pilot] synthetic e2e issue'
export const SYNTHETIC_LABELS = ['pd:inbox', 'priority:medium', 'area:dev'] as const

export function makePilotCandidate(overrides: Partial<PilotIssueCandidate> = {}): PilotIssueCandidate {
  return {
    repository: PILOT_REPO,
    issueNumber: 501,
    title: 'Pilot issue',
    state: 'open',
    isPullRequest: false,
    linkedPullRequest: false,
    labels: ['pd:inbox', 'priority:high', 'area:dev'],
    ...overrides,
  }
}

export function makeGitHubIssue(overrides: {
  number?: number
  title?: string
  body?: string | null
  state?: 'open' | 'closed'
  labels?: string[]
  updatedAt?: string
} = {}): GitHubIssue {
  const number = overrides.number ?? 501
  return {
    number,
    title: overrides.title ?? 'Pilot issue',
    body: overrides.body ?? 'Fixture issue body',
    state: overrides.state ?? 'open',
    labels: (overrides.labels ?? ['pd:inbox', 'priority:high', 'area:dev']).map((name) => ({ name })),
    assignee: null,
    html_url: `https://github.com/${PILOT_REPO}/issues/${number}`,
    created_at: overrides.updatedAt ?? '2026-05-14T12:00:00Z',
    updated_at: overrides.updatedAt ?? '2026-05-14T12:00:00Z',
  }
}

export function enableAreaRouting(db: Database.Database, workspaceId: number): void {
  db.prepare(`UPDATE workspaces SET feature_flags = ? WHERE id = ?`).run(
    JSON.stringify({ FEATURE_AREA_LABEL_ROUTING: true }),
    workspaceId,
  )
}

export function seedProject(
  db: Database.Database,
  args: {
    workspaceId?: number
    slug: string
    areaSlug?: string | null
    isTriageProject?: 0 | 1
    isRepoSyncOwner?: 0 | 1
    githubRepo?: string | null
    githubSyncEnabled?: 0 | 1
  },
): number {
  const prefix = args.slug
    .split('-')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .padEnd(2, 'X')
    .slice(0, 8)
  const info = db.prepare(`
    INSERT INTO projects (
      workspace_id, name, slug, ticket_prefix,
      area_slug, is_triage_project, is_repo_sync_owner,
      github_repo, github_sync_enabled, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    args.workspaceId ?? 1,
    args.slug,
    args.slug,
    prefix,
    args.areaSlug ?? null,
    args.isTriageProject ?? 0,
    args.isRepoSyncOwner ?? 0,
    args.githubRepo ?? null,
    args.githubSyncEnabled ?? 0,
  )
  return Number(info.lastInsertRowid)
}

export function seedPilotRouting(db: Database.Database): { ownerProjectId: number; devProjectId: number } {
  enableAreaRouting(db, 1)
  const ownerProjectId = seedProject(db, {
    slug: 'pilot-owner',
    githubRepo: PILOT_REPO,
    githubSyncEnabled: 1,
    isRepoSyncOwner: 1,
  })
  const devProjectId = seedProject(db, {
    slug: 'pilot-dev',
    areaSlug: 'dev',
  })
  seedProject(db, {
    slug: 'pilot-triage',
    isTriageProject: 1,
  })
  return { ownerProjectId, devProjectId }
}
