# Research: Task Pipeline Engine and Declarative Routing

## Workflow Template Source

Decision: Use the existing `workflow_templates` table as the live domain source for declarative task-chain templates.

Rationale: The spec requires workflow templates to be operator-managed through the live Workflows UI and explicitly forbids introducing `task_templates`. Keeping the live table as the source avoids duplicate template state and preserves existing workflow-template editing flows.

Alternatives considered: A new `task_templates` table was rejected because it violates FR-003 and would create parallel configuration. A derived in-memory template registry was rejected because operators must create, edit, read, and delete chain fields through persistent `/api/workflows` behavior.

## Task Binding And Lineage

Decision: Treat `workflow_template_id` as the canonical task binding and `workflow_template_slug` as a denormalized snapshot; initialize parent lineage only when a first successor is created.

Rationale: The ID provides stable identity across slug edits, while the slug snapshot preserves audit and downstream traceability. First-hop initialization keeps legacy tasks null-safe until they enter an actual chain.

Alternatives considered: Slug-only binding was rejected because slug edits would break routing identity. Eager lineage initialization at task creation was rejected because flag-off and null-default behavior must remain byte-compatible with current single-task flows.

## Structured Output Bridge

Decision: Read structured output from `tasks.resolution` for SPEC-004 only.

Rationale: The spec defines `tasks.resolution` as the temporary bridge before later artifact publishing. This keeps SPEC-004 focused on routing and lineage without implementing downstream artifact handoff.

Alternatives considered: A new artifact table or canonical output store was rejected as downstream SPEC-007 scope. Reading ad hoc fields from activities was rejected because activities are audit records, not the canonical temporary output bridge.

## Shared Task Creation

Decision: Add `src/lib/task-create.ts` with explicit source profiles and per-effect options, and migrate required task creation callsites to it.

Rationale: Constitution Principle VIII requires structural side-effect parity through one shared helper. Explicit source profiles preserve different defaults for API creation, GitHub issue import, GitHub sync import, recurring spawn, and pipeline successor creation.

Alternatives considered: Keeping direct inserts plus parity tests was rejected because it leaves duplicated side-effect logic. A generic event bus was rejected as speculative generality for this spec.

## Output Schema Validation

Decision: Use exact pinned runtime dependencies `ajv@8.18.0` and `safe-regex@2.1.1` in `src/lib/output-schema-validator.ts` with a constrained JSON Schema profile, pre-validation caps, strict AJV settings, and LRU cache keyed by `(template_id, schema_sha256)`.

Rationale: Agent output and operator-provided schema are untrusted. AJV provides mature JSON Schema validation, while the constrained profile blocks unsafe features, remote/dynamic references, mutation/coercion/default insertion, async schemas, unsupported formats, exhaustive error collection, and unsafe patterns.

Alternatives considered: Hand-written JSON validation was rejected as error-prone for schema behavior. Using AJV with formats or default settings was rejected because format enforcement, mutation, coercion, remote refs, and custom extensions exceed the safe profile.

## Routing Rule Evaluation

Decision: Add `src/lib/routing-rule-evaluator.ts` with a hand-written recursive-descent parser for the SPEC-004 boolean grammar and exact pinned `jsonpath-plus@10.4.0` only for bounded traversal with JavaScript execution disabled.

Rationale: Routing expressions are untrusted. The parser can reject filters, script expressions, prototype access, unsupported operators, unsafe literals, and oversized inputs before traversal. JSONPath-Plus is used only after operands pass the allowlist.

Alternatives considered: Evaluating JavaScript expressions was rejected as unsafe. Using JSONPath filters or script expressions was rejected because they can execute or emulate logic outside the allowed grammar. A third-party expression language was rejected because the spec requires a small explicit grammar.

## Terminal-Success Advancement

Decision: Invoke shared chain advancement from every live non-`done` to `done` success path named by the spec: task dispatch/Aegis review approval, quality-review approval, bulk task status update, detail task status update, and detail retry action.

Rationale: No pipeline-bound terminal-success path may bypass advancement. Ordinary failed-to-done updates remain ordinary updates and do not implicitly rerun chain recovery.

Alternatives considered: Scheduler-wide polling was rejected for SPEC-004 because the plan evidence identifies route-level terminal success paths as the live completion flow. Inspecting or changing scheduler behavior is deferred unless implementation evidence proves it is part of completion.

## Retry Recovery

Decision: Implement retry only through an operator-authorized detail retry action that selects the latest eligible SPEC-004 failure or stall activity, validates template provenance, requires drift confirmation when applicable, records bounded recovery metadata, and never accepts an activity-id override.

Rationale: Recovery must be explicit, auditable, idempotent, side-effect-free on conflicts, and safe against stale activity replay or template drift.

Alternatives considered: Rerunning advancement on ordinary task edits was rejected because it risks accidental replay. Hard retry caps were rejected because the spec requires repeated eligible attempts without a hard cap. Returning full corrected output or routing traces was rejected because responses must remain bounded and non-secret.

## Successor Uniqueness Migration

Decision: Add M62 as a partial unique index enforcing one successor per non-null `parent_task_id`, with duplicate preflight and rollback SQL.

Rationale: The database must enforce the one-successor-per-parent invariant while still allowing multiple root tasks with NULL `parent_task_id`.

Alternatives considered: Application-only duplicate checks were rejected because concurrent retry/advancement could still race. A full unique constraint including NULL roots was rejected because multiple root tasks must be allowed.

## Workflow Template Editing

Decision: Extend `/api/workflows` validation and persistence for chain fields, require concrete Product Line/workspace scope for writes/deletes, reject Facility aggregate mutations, use `appendScopeToPath` in the Workflows UI, reject routing rules without `output_schema`, and preserve query-parameter deletion.

Rationale: Operators configure chains through the live editor, and Product Line scope must remain explicit and authorized. Backward-compatible delete behavior avoids breaking existing UI calls.

Alternatives considered: A separate pipeline-template endpoint was rejected because `/api/workflows` is the live editor contract. Body-only DELETE was rejected because the spec requires query-parameter compatibility.

## Verification And Supply Chain

Decision: Require `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, focused running-app Playwright, static guardrails, exact dependency pins, lockfile evidence, and `pnpm audit --audit-level high`.

Rationale: SPEC-004 changes task creation, untrusted parsing/validation, task completion routes, UI editing, dependencies, and schema constraints, so both code-level and running-app evidence are gate-relevant.

Alternatives considered: Component-only UI tests were rejected by Constitution Principle XIV and P3-AC12. Relying on transitive dependencies or dev-only dependencies was rejected by supply-chain hygiene.

