import { describe, expect, it } from 'vitest'
import { buildTaskCostReport, calculateStats, type TaskCostMetadata, type TokenCostRecord } from '@/lib/task-costs'

describe('task-cost analytics', () => {
  it('calculates stats correctly', () => {
    const stats = calculateStats([
      { model: 'a', agentName: 'alpha', timestamp: 1000, totalTokens: 100, cost: 0.1 },
      { model: 'b', agentName: 'alpha', timestamp: 2000, totalTokens: 300, cost: 0.3 },
    ])

    expect(stats.totalTokens).toBe(400)
    expect(stats.totalCost).toBeCloseTo(0.4)
    expect(stats.requestCount).toBe(2)
    expect(stats.avgTokensPerRequest).toBe(200)
    expect(stats.avgCostPerRequest).toBeCloseTo(0.2)
  })

  it('builds task, agent, project and unattributed rollups', () => {
    const records: TokenCostRecord[] = [
      { model: 'sonnet', agentName: 'alpha', timestamp: Date.parse('2026-03-05T01:00:00Z'), totalTokens: 100, cost: 0.1, taskId: 101 },
      { model: 'sonnet', agentName: 'alpha', timestamp: Date.parse('2026-03-05T02:00:00Z'), totalTokens: 150, cost: 0.15, taskId: 101 },
      { model: 'haiku', agentName: 'beta', timestamp: Date.parse('2026-03-05T03:00:00Z'), totalTokens: 50, cost: 0.02, taskId: 202 },
      { model: 'haiku', agentName: 'beta', timestamp: Date.parse('2026-03-05T03:30:00Z'), totalTokens: 75, cost: 0.03 },
    ]

    const taskMetadata: Record<number, TaskCostMetadata> = {
      101: {
        id: 101,
        title: 'Task One',
        status: 'in_progress',
        priority: 'high',
        assigned_to: 'alpha',
        project_id: 1,
        project_name: 'Core',
        project_slug: 'core',
        project_prefix: 'CORE',
        project_ticket_no: 12,
      },
      202: {
        id: 202,
        title: 'Task Two',
        status: 'assigned',
        priority: 'medium',
        assigned_to: 'beta',
        project_id: 2,
        project_name: 'Ops',
        project_slug: 'ops',
        project_prefix: 'OPS',
        project_ticket_no: 7,
      },
    }

    const report = buildTaskCostReport(records, taskMetadata)

    expect(report.tasks).toHaveLength(2)
    expect(report.tasks[0]?.taskId).toBe(101)
    expect(report.tasks[0]?.stats.totalCost).toBeCloseTo(0.25)
    expect(report.tasks[0]?.project.ticketRef).toBe('CORE-012')

    expect(report.agents.alpha?.stats.totalCost).toBeCloseTo(0.25)
    expect(report.agents.alpha?.taskIds).toEqual([101])
    expect(report.agents.beta?.taskIds).toEqual([202])

    expect(report.projects['1']?.taskCount).toBe(1)
    expect(report.projects['2']?.taskCount).toBe(1)

    expect(report.summary.totalCost).toBeCloseTo(0.27)
    expect(report.unattributed.totalCost).toBeCloseTo(0.03)
  })
})
