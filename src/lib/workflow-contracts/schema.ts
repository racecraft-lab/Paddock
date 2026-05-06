import Ajv from 'ajv'

export function createWorkflowContractAjv(): Ajv {
  return new Ajv({
    strict: true,
    validateSchema: true,
    $data: false,
    validateFormats: false,
    allErrors: false,
    useDefaults: false,
    coerceTypes: false,
    removeAdditional: false,
    addUsedSchema: false,
  })
}
