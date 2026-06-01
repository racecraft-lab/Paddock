import { describe, it, expect } from 'vitest'
import {
  statusToLabel,
  labelToStatus,
  priorityToLabel,
  labelToPriority,
  ALL_MC_LABELS,
  ALL_STATUS_LABEL_NAMES,
  ALL_PRIORITY_LABEL_NAMES,
  type TaskStatus,
} from '../github-label-map'

describe('statusToLabel', () => {
  it('returns correct label for each status', () => {
    expect(statusToLabel('inbox').name).toBe('mc:inbox')
    expect(statusToLabel('assigned').name).toBe('mc:assigned')
    expect(statusToLabel('in_progress').name).toBe('mc:in-progress')
    expect(statusToLabel('review').name).toBe('mc:review')
    expect(statusToLabel('quality_review').name).toBe('mc:quality-review')
    expect(statusToLabel('done').name).toBe('mc:done')
  })

  it('returns the ready-for-owner status label contract', () => {
    const label = statusToLabel('ready_for_owner')
    expect(label).toEqual({
      name: 'mc:ready-for-owner',
      color: '14b8a6',
      description: 'Paddock: ready for owner',
    })
  })

  it('returns label with color and description', () => {
    const label = statusToLabel('done')
    expect(label.color).toBeTruthy()
    expect(label.description).toContain('done')
  })
})

describe('labelToStatus', () => {
  it('maps mc labels back to status', () => {
    expect(labelToStatus('mc:inbox')).toBe('inbox')
    expect(labelToStatus('mc:assigned')).toBe('assigned')
    expect(labelToStatus('mc:in-progress')).toBe('in_progress')
    expect(labelToStatus('mc:review')).toBe('review')
    expect(labelToStatus('mc:quality-review')).toBe('quality_review')
    expect(labelToStatus('mc:done')).toBe('done')
  })

  it('maps mc:ready-for-owner back to ready_for_owner', () => {
    expect(labelToStatus('mc:ready-for-owner')).toBe('ready_for_owner')
  })

  it('returns null for unknown labels', () => {
    expect(labelToStatus('unknown')).toBeNull()
    expect(labelToStatus('')).toBeNull()
    expect(labelToStatus('priority:high')).toBeNull()
  })

  it('is the inverse of statusToLabel', () => {
    const statuses: TaskStatus[] = ['backlog', 'inbox', 'assigned', 'awaiting_owner', 'in_progress', 'review', 'quality_review', 'ready_for_owner', 'done', 'failed']
    for (const status of statuses) {
      expect(labelToStatus(statusToLabel(status).name)).toBe(status)
    }
  })
})

describe('priorityToLabel', () => {
  it('returns correct label for each priority', () => {
    expect(priorityToLabel('critical').name).toBe('priority:critical')
    expect(priorityToLabel('high').name).toBe('priority:high')
    expect(priorityToLabel('medium').name).toBe('priority:medium')
    expect(priorityToLabel('low').name).toBe('priority:low')
  })

  it('falls back to medium for unknown priority', () => {
    // @ts-expect-error testing unknown
    expect(priorityToLabel('unknown').name).toBe('priority:medium')
  })
})

describe('labelToPriority', () => {
  it('extracts priority from labels array', () => {
    expect(labelToPriority(['priority:critical'])).toBe('critical')
    expect(labelToPriority(['priority:high'])).toBe('high')
    expect(labelToPriority(['priority:medium'])).toBe('medium')
    expect(labelToPriority(['priority:low'])).toBe('low')
  })

  it('returns medium as default when no priority label', () => {
    expect(labelToPriority([])).toBe('medium')
    expect(labelToPriority(['mc:inbox', 'bug'])).toBe('medium')
  })

  it('picks first matching priority label', () => {
    expect(labelToPriority(['priority:high', 'priority:low'])).toBe('high')
  })

  it('ignores non-priority labels', () => {
    expect(labelToPriority(['mc:done', 'priority:critical', 'wontfix'])).toBe('critical')
  })
})

describe('ALL_MC_LABELS', () => {
  it('contains all status and priority labels', () => {
    expect(ALL_MC_LABELS.length).toBe(14) // 10 statuses + 4 priorities
    const names = ALL_MC_LABELS.map(l => l.name)
    expect(names).toContain('mc:inbox')
    expect(names).toContain('mc:ready-for-owner')
    expect(names).toContain('priority:critical')
  })

  it('each label has name, color, and description', () => {
    for (const label of ALL_MC_LABELS) {
      expect(label.name).toBeTruthy()
      expect(label.color).toMatch(/^[0-9a-f]{6}$/i)
    }
  })
})

describe('ALL_STATUS_LABEL_NAMES', () => {
  it('contains all 10 status label names', () => {
    expect(ALL_STATUS_LABEL_NAMES).toHaveLength(10)
    expect(ALL_STATUS_LABEL_NAMES).toContain('mc:inbox')
    expect(ALL_STATUS_LABEL_NAMES).toContain('mc:ready-for-owner')
    expect(ALL_STATUS_LABEL_NAMES).toContain('mc:done')
  })

  it('supports replacing prior mc:* status labels with mc:ready-for-owner', () => {
    const existing = ['mc:review', 'mc:quality-review', 'priority:high', 'customer:keep']
    const replacement = [
      ...existing.filter((name) => !ALL_STATUS_LABEL_NAMES.includes(name)),
      statusToLabel('ready_for_owner').name,
    ]

    expect(replacement).toEqual(['priority:high', 'customer:keep', 'mc:ready-for-owner'])
  })
})

describe('ALL_PRIORITY_LABEL_NAMES', () => {
  it('contains all 4 priority label names', () => {
    expect(ALL_PRIORITY_LABEL_NAMES).toHaveLength(4)
    expect(ALL_PRIORITY_LABEL_NAMES).toContain('priority:critical')
    expect(ALL_PRIORITY_LABEL_NAMES).toContain('priority:low')
  })
})
