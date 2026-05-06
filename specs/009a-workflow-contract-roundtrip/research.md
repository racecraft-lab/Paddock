# Research: SPEC-009A Workflow Contract Format and Roundtrip

## Decision: Use Exact Direct `yaml@2.8.2`

**Rationale**: The lockfile already contains `yaml@2.8.2`, and the clarified spec requires this package to become an exact direct production dependency before implementation. Direct declaration satisfies the constitution's supply-chain rule and avoids importing a transitive dependency. The loader must use the parser only behind `src/lib/workflow-contracts/yaml-loader.ts`, reject multi-document streams, non-mapping roots, duplicate keys, custom tags, anchors, aliases, merge keys, and non-literal prompt scalars before canonical model construction.

**Alternatives considered**: JSON-only authoring was rejected because the PRD and workflow-review model require human-editable repo policy. A different YAML package was rejected because it adds supply-chain surface without a spec need. Importing the existing transitive package was rejected by the direct dependency policy.

## Decision: Reuse Existing AJV 8 Strict Profile

**Rationale**: `src/lib/output-schema-validator.ts` already uses direct `ajv@8.18.0` with `strict: true`, `validateSchema: true`, `$data: false`, `validateFormats: false`, `allErrors: false`, `useDefaults: false`, `coerceTypes: false`, `removeAdditional: false`, and `addUsedSchema: false`. SPEC-009A contract validation will expose a shared helper with the same profile for canonical workflow-contract models. This preserves the safe-evaluation posture and avoids `ajv-formats`, default insertion, coercion, unknown keyword drift, and data mutation.

**Alternatives considered**: Adding `ajv-formats` was rejected because contract validation does not require runtime format enforcement. Adding Zod, Valibot, or another schema validator was rejected because FR-032 forbids a second schema-validation stack.

## Decision: YAML Parser Output Is Always Untrusted

**Rationale**: The object-model boundary is YAML parse -> copied typed canonical model -> schema validation -> variable/hash/domain validation -> diff/import/export. Parser output cannot directly drive mutation, hashing, or diagnostics. This creates one place to normalize line endings, coerce absent optional lists to explicit empty arrays where the model defines them, reject unknown fields, and attach canonical model paths for diagnostics.

**Alternatives considered**: Validating parser output directly was rejected because YAML parser node metadata and JavaScript values are not the stable canonical contract. Hashing raw YAML was rejected because parity must ignore formatting and local paths.

## Decision: Versioned Canonical Hash Envelope

**Rationale**: Parity uses `workflow-contract-hash-v1` plus SHA-256 over stable sorted JSON of the typed canonical model. The hash input excludes timestamps, database row ids, diagnostics run ids, absolute local paths, and Markdown bytes. Prompt text is normalized from CRLF to LF before hashing. Routing rules and output schemas also get separate per-template stable hashes so reviewers can detect changes in execution policy data without depending on Markdown bytes.

**Alternatives considered**: Byte-for-byte YAML or Markdown hashes were rejected because they would report formatting drift instead of semantic drift. Database-row hashes were rejected because row ids and timestamps are runtime artifacts.

## Decision: Import Apply Is One SQLite Transaction

**Rationale**: Apply mode validates the full source set and computes the complete diff before mutation. Owned-template upserts/disables, diagnostics writes, and last-known-good snapshot writes run inside one `better-sqlite3` transaction. If any statement fails, no partial runtime-template or diagnostics state is visible. Runtime identity is existing `workflow_templates` workspace plus slug; unrelated templates are preserved.

**Alternatives considered**: Per-template transactions were rejected because they could leave partial contract state. Replacing all workflow templates was rejected because it would damage unrelated local templates.

## Decision: Generic Workflow-Contract Diagnostics Schema

**Rationale**: Diagnostics persistence uses generic names durable beyond SPEC-009A: `workflow_contract_runs`, `workflow_contract_run_errors`, and `workflow_contract_snapshots`. If schema is added, it must use additive migration `070_workflow_contract_diagnostics` plus `docs/migrations/rollback-M70.sql`, unless a concurrent merge takes M70 first and the migration is rebased. The schema records import/export/recovery mode, status, mutation status, source paths, hashes, diff counts, validation error counts, export artifact path, last-known-good snapshot references, and recovery commands.

**Alternatives considered**: SPEC-named tables were rejected because the diagnostics surface must be reusable. JSON-only diagnostics were rejected for validation errors because operators need filterable error lists by manifest, template, and stable code.

## Decision: Read-Only Diagnostics In Existing Workflows Surface

**Rationale**: The existing Orchestration/Workflows UI is the correct operator surface. SPEC-009A adds a diagnostics-only view for contract source paths, family, mode, status, template/diff counts, validation errors, hashes, last successful apply, last-known-good state, recovery command, and export path. The UI cannot edit manifests, run apply, launch workflows, dispatch tasks, or grant governance overrides.

**Alternatives considered**: A standalone workflow editor was rejected by scope. A hidden CLI-only diagnostics path was rejected because FR-027 requires the existing Workflows admin surface to expose reusable diagnostics.

## Decision: Future Runtime Policy Remains Data Only

**Rationale**: Governance, concurrency, retry, sandbox, capabilities, adapter requirements, feature flags, prompt versions, routing-rule hashes, and output-schema hashes are validated and roundtripped as policy data. SPEC-009A must not invoke the resource-governance evaluator, scheduler, GitHub ingest/sync, task dispatch, retry engine, runner launch, sandbox lifecycle, or harness adapter APIs.

**Alternatives considered**: Enforcing governance or launching a pilot from the importer was rejected because those behaviors belong to SPEC-009B/C/D, SPEC-013A-C, and SPEC-014A-D.
