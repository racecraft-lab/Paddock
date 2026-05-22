import {
  PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
  type ProductLineSeedResultEnvelope,
  type ProductLineSeedRunOptions,
} from './types'

export function buildPendingProductLineSeedResult(
  options: Pick<ProductLineSeedRunOptions, 'configPath' | 'entrypoint' | 'mode'>,
): ProductLineSeedResultEnvelope {
  return {
    schema_version: PRODUCT_LINE_SEED_RESULT_SCHEMA_VERSION,
    ok: false,
    entrypoint: options.entrypoint,
    mode: options.mode,
    status: 'cli_error',
    code: 'IMPLEMENTATION_PENDING',
    mutation_status: 'not_mutated',
    config: {
      path: options.configPath,
      schema_version: null,
      product_line_slug: null,
    },
    target: null,
    evidence: {},
    errors: [{
      code: 'IMPLEMENTATION_PENDING',
      path: '$',
      message: 'Product-line seed execution is pending later SPEC-010A tasks.',
    }],
    snapshot_before: null,
    snapshot_after: null,
    redaction: {
      raw_secret_values_emitted: false,
      redacted_fields: [],
    },
    action_required: null,
    exit_code: 5,
  }
}
