import { buildPendingProductLineSeedResult } from './preflight'
import type { ProductLineSeedResultEnvelope, ProductLineSeedRunOptions } from './types'

export function runProductLineSeed(options: ProductLineSeedRunOptions): ProductLineSeedResultEnvelope {
  return buildPendingProductLineSeedResult(options)
}
