import type { ProductLineSeedConfig, ProductLineSeedValidationError } from './types'

export class ProductLineSeedConfigNotImplementedError extends Error {
  constructor(action: string) {
    super(`${action} will be implemented by the SPEC-010A validation tasks.`)
    this.name = 'ProductLineSeedConfigNotImplementedError'
  }
}

export function loadProductLineSeedConfigFromFile(path: string): ProductLineSeedConfig {
  void path
  throw new ProductLineSeedConfigNotImplementedError('Product-line seed config loading')
}

export function validateProductLineSeedConfig(config: unknown): ProductLineSeedValidationError[] {
  void config
  return [{
    code: 'IMPLEMENTATION_PENDING',
    path: '$',
    message: 'Product-line seed semantic validation is pending a later SPEC-010A task.',
  }]
}
