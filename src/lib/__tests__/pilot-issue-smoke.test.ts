import { describe, expect, it, vi } from 'vitest'
import { PILOT_REPO, SYNTHETIC_LABELS, SYNTHETIC_TITLE } from './fixtures/pilot-issue-fixtures'

import {
  createGitHubPilotSmokeClient,
  findOrCreateSyntheticPilotIssue,
  redactPilotSmokeValue,
  runOperatorPilotSync,
} from '../../../scripts/pilot-issue-smoke.mjs'

interface CreateFailureCase {
  token: string
  thrown?: Error & { status?: number }
  error: string
}

function syntheticIssue(overrides = {}) {
  return {
    number: 700,
    title: SYNTHETIC_TITLE,
    state: 'open',
    labels: SYNTHETIC_LABELS,
    html_url: `https://github.com/${PILOT_REPO}/issues/700`,
    ...overrides,
  }
}

describe('SPEC-009C1 pilot issue smoke script contract', () => {
  it('reuses an existing valid synthetic issue and does not create by default', async () => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => syntheticIssue()),
      createIssue: vi.fn(),
    }

    await expect(findOrCreateSyntheticPilotIssue({ client })).resolves.toMatchObject({
      ok: true,
      created: false,
      issue: { number: 700, title: SYNTHETIC_TITLE },
    })
    expect(client.createIssue).not.toHaveBeenCalled()
  })

  it('accepts GitHub label objects when reusing an existing synthetic issue', async () => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => syntheticIssue({
        labels: SYNTHETIC_LABELS.map((name) => ({ name })),
      })),
      createIssue: vi.fn(),
    }

    await expect(findOrCreateSyntheticPilotIssue({ client })).resolves.toMatchObject({
      ok: true,
      created: false,
      issue: { labels: [...SYNTHETIC_LABELS] },
    })
    expect(client.createIssue).not.toHaveBeenCalled()
  })

  it('searches open issues by title before validating fallback labels', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        syntheticIssue({
          labels: SYNTHETIC_LABELS.map((name) => ({ name })),
        }),
      ],
    }))
    const client = createGitHubPilotSmokeClient('set', fetchImpl as unknown as typeof fetch)

    await expect(client.findOpenIssueByTitle(PILOT_REPO, SYNTHETIC_TITLE)).resolves.toMatchObject({
      number: 700,
      title: SYNTHETIC_TITLE,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.github.com/repos/${PILOT_REPO}/issues?state=open&per_page=100`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer set',
        }),
      }),
    )
  })

  it('fails closed when default no-live-mutation mode would need to create a synthetic issue', async () => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => null),
      createIssue: vi.fn(),
    }

    await expect(findOrCreateSyntheticPilotIssue({ client })).resolves.toMatchObject({
      ok: false,
      error: 'missing_live_mutation_opt_in',
      mutation_status: 'not_mutated',
    })
    expect(client.createIssue).not.toHaveBeenCalled()
  })

  it('creates the synthetic issue only with explicit opt-in, credentials, and required labels', async () => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => null),
      createIssue: vi.fn(async () => syntheticIssue({ number: 701 })),
    }

    await expect(findOrCreateSyntheticPilotIssue({
      client,
      allowLiveMutation: true,
      token: 'ghp_secret_value',
    })).resolves.toMatchObject({
      ok: true,
      created: true,
      issue: { number: 701 },
    })
    expect(client.createIssue).toHaveBeenCalledWith({
      repository: PILOT_REPO,
      title: SYNTHETIC_TITLE,
      labels: [...SYNTHETIC_LABELS],
    })
  })

  it.each<[string, CreateFailureCase]>([
    ['missing credentials', { token: '', error: 'missing_credentials' }],
    ['insufficient permissions', { token: 'set', thrown: Object.assign(new Error('403 token ghp_secret_value'), { status: 403 }), error: 'insufficient_permissions' }],
    ['GitHub create failure', { token: 'set', thrown: new Error('upstream failed with ghp_secret_value'), error: 'synthetic_issue_create_failed' }],
  ])('returns a redacted non-mutating failure for %s', async (_name, cfg) => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => null),
      createIssue: vi.fn(async () => {
        if (cfg.thrown) throw cfg.thrown
        return syntheticIssue({ number: 702 })
      }),
    }

    const result = await findOrCreateSyntheticPilotIssue({
      client,
      allowLiveMutation: true,
      token: cfg.token,
    })

    expect(result).toMatchObject({
      ok: false,
      error: cfg.error,
      mutation_status: 'not_mutated',
    })
    expect(JSON.stringify(result)).not.toContain('ghp_secret_value')
  })

  it('fails closed on existing fallback label mismatch without auto-repairing it', async () => {
    const client = {
      findOpenIssueByTitle: vi.fn(async () => syntheticIssue({ labels: ['mc:inbox', 'area:dev'] })),
      createIssue: vi.fn(),
    }

    await expect(findOrCreateSyntheticPilotIssue({ client, allowLiveMutation: true, token: 'set' })).resolves.toMatchObject({
      ok: false,
      error: 'synthetic_issue_label_mismatch',
      mutation_status: 'not_mutated',
      evidence: { missing_labels: ['priority:medium'] },
    })
    expect(client.createIssue).not.toHaveBeenCalled()
  })

  it('reports operator-triggered sync failures as sync_failed rather than an eligibility result', async () => {
    const sync = vi.fn(async () => {
      throw new Error('sync failed with token ghp_secret_value')
    })

    await expect(runOperatorPilotSync({
      sync,
      repository: PILOT_REPO,
      issueNumber: 703,
    })).resolves.toMatchObject({
      ok: false,
      error: 'sync_failed',
      operation: 'operator_sync',
      evidence: { repository: PILOT_REPO, issueNumber: 703 },
    })
  })

  it('redacts token-like values from reviewable smoke output', () => {
    expect(redactPilotSmokeValue({
      token: 'ghp_secret_value',
      header: 'Authorization: Bearer ghp_secret_value',
      safe: `${PILOT_REPO}#704`,
    })).toEqual({
      token: '[redacted]',
      header: '[redacted]',
      safe: `${PILOT_REPO}#704`,
    })
  })
})
