/**
 * SPEC-008 — T375 — adapter-counters unit test.
 *
 * @see specs/008-resource-governance/tasks.md T375
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  formatAdapterCountersAsProm,
  getAdapterCounter,
  recordAdapterCounter,
  resetAdapterCountersForTest,
  snapshotAdapterCounters,
} from '../adapter-counters'

describe('SPEC-008 T375 — adapter-counters', () => {
  afterEach(() => {
    resetAdapterCountersForTest()
  })

  it('records and reads each kind of counter', () => {
    recordAdapterCounter('native_otel', 'events_in', 5)
    recordAdapterCounter('native_otel', 'events_admitted', 4)
    recordAdapterCounter('native_otel', 'events_dropped', 1)
    expect(getAdapterCounter('native_otel', 'events_in')).toBe(5)
    expect(getAdapterCounter('native_otel', 'events_admitted')).toBe(4)
    expect(getAdapterCounter('native_otel', 'events_dropped')).toBe(1)
  })

  it('floors at zero on negative delta', () => {
    recordAdapterCounter('cli_stdout_json', 'events_admitted', 3)
    recordAdapterCounter('cli_stdout_json', 'events_admitted', -10)
    expect(getAdapterCounter('cli_stdout_json', 'events_admitted')).toBe(0)
  })

  it('snapshot returns sorted, stable keys', () => {
    recordAdapterCounter('manual_post', 'events_in', 2)
    recordAdapterCounter('gateway_otel', 'events_in', 1)
    recordAdapterCounter('gateway_otel', 'events_admitted', 1)
    const snap = snapshotAdapterCounters()
    expect(Object.keys(snap)).toEqual([
      'gateway_otel:events_admitted',
      'gateway_otel:events_in',
      'manual_post:events_in',
    ])
  })

  it('formatAdapterCountersAsProm emits all five kinds for each active source', () => {
    recordAdapterCounter('provider_quota', 'events_in', 7)
    const out = formatAdapterCountersAsProm()
    expect(out).toContain('governance_adapter{source="provider_quota",kind="events_in"} 7')
    // The other four kinds are emitted with zero values for an active source.
    for (const kind of ['events_dropped', 'events_admitted', 'parse_errors', 'dedupe_collisions']) {
      expect(out).toContain(`governance_adapter{source="provider_quota",kind="${kind}"} 0`)
    }
  })

  it('inactive source produces no output', () => {
    const out = formatAdapterCountersAsProm()
    expect(out).toBe('')
  })
})
