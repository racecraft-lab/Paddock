'use client'

export interface NavigationSample {
  from: string
  to: string
  durationMs: number
  startedAt: number
  completedAt: number
}

type PendingNavigation = {
  from: string
  to: string
  startedAt: number
}

let pendingNavigation: PendingNavigation | null = null
let samples: NavigationSample[] = []

const MAX_SAMPLES = 50
const METRIC_EVENT = 'mc:navigation-metric'

function emitSample(sample: NavigationSample) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(METRIC_EVENT, { detail: sample }))
}

export function startNavigationTiming(fromPath: string, toPath: string) {
  if (typeof window === 'undefined') return
  if (!toPath || fromPath === toPath) return
  pendingNavigation = {
    from: fromPath,
    to: toPath,
    startedAt: performance.now(),
  }
}

export function completeNavigationTiming(currentPath: string): NavigationSample | null {
  if (typeof window === 'undefined') return null
  const pending = pendingNavigation
  if (!pending) return null
  if (currentPath !== pending.to) return null

  const completedAt = performance.now()
  const sample: NavigationSample = {
    from: pending.from,
    to: pending.to,
    startedAt: pending.startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - pending.startedAt),
  }
  pendingNavigation = null
  samples = [...samples.slice(-(MAX_SAMPLES - 1)), sample]
  emitSample(sample)
  return sample
}

export function getNavigationMetrics() {
  const count = samples.length
  if (count === 0) {
    return {
      count: 0,
      latestMs: null as number | null,
      avgMs: null as number | null,
      p95Ms: null as number | null,
    }
  }

  const latest = samples[count - 1]
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b)
  const total = durations.reduce((sum, n) => sum + n, 0)
  const avg = total / count
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95))
  const p95 = durations[p95Index]

  return {
    count,
    latestMs: latest.durationMs,
    avgMs: avg,
    p95Ms: p95,
  }
}

export function navigationMetricEventName(): string {
  return METRIC_EVENT
}

