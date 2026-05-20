export interface DispositionRollupDayBucket {
  date: string
  total: number
  by_disposition: Record<string, number>
}

export interface DispositionRollupBody {
  days: DispositionRollupDayBucket[]
  total: number
}

interface CacheEntry {
  body: DispositionRollupBody
  expiresAt: number
}

const rollupCache = new Map<string, CacheEntry>()
const TTL_MS = 15_000

export function getDispositionRollupCacheEntry(
  key: string,
  nowMs = Date.now(),
): DispositionRollupBody | null {
  const cached = rollupCache.get(key)
  if (!cached || cached.expiresAt <= nowMs) return null
  return cached.body
}

export function setDispositionRollupCacheEntry(
  key: string,
  body: DispositionRollupBody,
  nowMs = Date.now(),
): void {
  rollupCache.set(key, { body, expiresAt: nowMs + TTL_MS })
}

/** Test-only escape hatch -- clears the in-memory cache. */
export function __resetRollupCacheForTests(): void {
  rollupCache.clear()
}
