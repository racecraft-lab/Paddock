import { describe, expect, it } from 'vitest'
import { buildDayKey, getCronOccurrences } from '@/lib/cron-occurrences'

describe('buildDayKey', () => {
  it('formats YYYY-MM-DD in local time', () => {
    const date = new Date(2026, 2, 4, 9, 15, 0, 0)
    expect(buildDayKey(date)).toBe('2026-03-04')
  })
})

describe('getCronOccurrences', () => {
  it('expands daily schedule across range', () => {
    const start = new Date(2026, 2, 1, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 2, 5, 0, 0, 0, 0).getTime()
    const rows = getCronOccurrences('0 0 * * *', start, end)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.dayKey)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ])
  })

  it('supports step values', () => {
    const start = new Date(2026, 2, 1, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 2, 1, 3, 0, 0, 0).getTime()
    const rows = getCronOccurrences('*/30 * * * *', start, end)
    expect(rows).toHaveLength(6)
  })

  it('ignores OpenClaw timezone suffix in display schedule', () => {
    const start = new Date(2026, 2, 1, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 2, 2, 0, 0, 0, 0).getTime()
    const rows = getCronOccurrences('0 6 * * * (UTC)', start, end)
    expect(rows).toHaveLength(1)
  })

  it('returns empty list for invalid cron', () => {
    const start = new Date(2026, 2, 1, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 2, 2, 0, 0, 0, 0).getTime()
    expect(getCronOccurrences('invalid', start, end)).toEqual([])
  })
})
