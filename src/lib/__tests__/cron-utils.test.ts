import { describe, it, expect } from 'vitest'
import { describeCronFrequency, validateCronExpression, generateCloneName } from '../cron-utils'

describe('describeCronFrequency', () => {
  it('returns "every minute" for * * * * *', () => {
    expect(describeCronFrequency('* * * * *')).toBe('every minute')
  })

  it('returns "every 5m" for */5 * * * *', () => {
    expect(describeCronFrequency('*/5 * * * *')).toBe('every 5m')
  })

  it('returns "hourly at :00" for 0 * * * *', () => {
    expect(describeCronFrequency('0 * * * *')).toBe('hourly at :00')
  })

  it('returns "daily at 14:30" for 30 14 * * *', () => {
    expect(describeCronFrequency('30 14 * * *')).toBe('daily at 14:30')
  })

  it('returns "monthly" for 0 0 1 * *', () => {
    expect(describeCronFrequency('0 0 1 * *')).toBe('monthly')
  })

  it('returns time with select days for 0 0 * * 1 (specific hour+dow)', () => {
    expect(describeCronFrequency('0 0 * * 1')).toBe('00:00 (select days)')
  })

  it('returns "weekly" when dow is set and no earlier branch matches', () => {
    expect(describeCronFrequency('1-30 * * * 1')).toBe('weekly')
  })

  it('falls through to raw schedule for */10 */2 * * *', () => {
    expect(describeCronFrequency('*/10 */2 * * *')).toBe('*/10 */2 * * *')
  })

  it('returns "every 2h" for 0 */2 * * *', () => {
    expect(describeCronFrequency('0 */2 * * *')).toBe('every 2h')
  })

  it('returns the raw schedule for non-standard expressions', () => {
    expect(describeCronFrequency('invalid')).toBe('invalid')
  })

  it('strips trailing parenthetical comments', () => {
    expect(describeCronFrequency('*/5 * * * * (some note)')).toBe('every 5m')
  })

  it('handles time with select days', () => {
    expect(describeCronFrequency('0 9 * * 1,3,5')).toBe('09:00 (select days)')
  })
})

describe('validateCronExpression', () => {
  it('returns null for valid expression * * * * *', () => {
    expect(validateCronExpression('* * * * *')).toBeNull()
  })

  it('returns null for valid step expression */5 * * * *', () => {
    expect(validateCronExpression('*/5 * * * *')).toBeNull()
  })

  it('returns error for minute > 59', () => {
    const result = validateCronExpression('60 * * * *')
    expect(result).not.toBeNull()
    expect(result).toContain('minute')
  })

  it('returns error for hour > 23', () => {
    const result = validateCronExpression('* 25 * * *')
    expect(result).not.toBeNull()
    expect(result).toContain('hour')
  })

  it('returns error for wrong number of fields', () => {
    const result = validateCronExpression('invalid')
    expect(result).not.toBeNull()
    expect(result).toContain('Expected 5 fields')
  })

  it('returns error for empty string', () => {
    const result = validateCronExpression('')
    expect(result).not.toBeNull()
  })

  it('returns null for valid range expression 1-5 * * * *', () => {
    expect(validateCronExpression('1-5 * * * *')).toBeNull()
  })

  it('returns null for valid comma-separated values', () => {
    expect(validateCronExpression('0,15,30,45 * * * *')).toBeNull()
  })

  it('returns error for day-of-month 0', () => {
    const result = validateCronExpression('0 0 0 * *')
    expect(result).not.toBeNull()
    expect(result).toContain('day of month')
  })

  it('returns error for month > 12', () => {
    const result = validateCronExpression('0 0 1 13 *')
    expect(result).not.toBeNull()
    expect(result).toContain('month')
  })
})

describe('generateCloneName', () => {
  it('returns "Name (copy)" when no conflicts', () => {
    expect(generateCloneName('My Job', [])).toBe('My Job (copy)')
  })

  it('returns "Name (copy 2)" when "(copy)" exists', () => {
    expect(generateCloneName('My Job', ['My Job (copy)'])).toBe('My Job (copy 2)')
  })

  it('returns "Name (copy 3)" when "(copy)" and "(copy 2)" exist', () => {
    expect(generateCloneName('My Job', ['My Job (copy)', 'My Job (copy 2)'])).toBe('My Job (copy 3)')
  })

  it('is case-insensitive when checking existing names', () => {
    expect(generateCloneName('My Job', ['my job (copy)'])).toBe('My Job (copy 2)')
  })
})
