# Research: Generic Product-Line Seeder

## Decision: Use checked-in YAML as the product-line seed source of truth

**Rationale**: Design Concept Q1/Q9 chose a versioned, operator-reviewable config under `docs/ai/product-lines/`. The repository already uses YAML for workflow contracts and has a direct `yaml` dependency. A checked-in config makes Mission Control parity and future product-line reuse reviewable without adding runtime/admin authoring surfaces.

**Alternatives considered**:

- TypeScript config modules: stronger compile-time typing but less operator-friendly and less useful for code review by non-TS maintainers.
- Runtime-authored config: more flexible but too large for SPEC-010A and would require UI/API/storage scope.

## Decision: Pair JSON Schema shape validation with TypeScript semantic validation

**Rationale**: Clarify fixed JSON Schema plus TypeScript validation in `src/lib/product-line-seed/`. JSON Schema covers required top-level sections, unknown fields, and base types; TypeScript validation covers registry-backed flags, workflow-contract family/path/slugs, existing-target safety, governance first-intake blockers, assignment naming, duplicate/conflicting declarations, and stable error codes.

**Alternatives considered**:

- JSON Schema only: weak for database-aware and registry-aware validation.
- TypeScript only: weaker review contract and harder to reuse for future config authors.

## Decision: Reuse SPEC-009B seed behavior through generic primitives

**Rationale**: The existing seed path already proves the correct Mission Control product-line shape, department list, feature flags, governance defaults, non-dispatch evidence, and workflow import through SPEC-009A. SPEC-010A should extract config/application primitives rather than rewrite behavior.

**Alternatives considered**:

- Rewrite from scratch: increases regression risk and review burden.
- Keep Mission Control constants and add a second wrapper later: fails the SPEC-010A reuse goal.

## Decision: Require explicit existing-target authorization

**Rationale**: Design Concept Q2 and Clarify Session 2 require `--allow-existing` for apply over an existing product line. This avoids silent takeover while still supporting idempotent Mission Control parity and future existing-target maintenance. Verify stays read-only and does not require the flag.

**Alternatives considered**:

- Always upsert: simpler but too easy to mutate live state accidentally.
- Always refuse existing targets: safe but prevents idempotency and Mission Control compatibility.

## Decision: Validate and preflight before writes, then apply in one transaction

**Rationale**: Q3 requires fail-closed validation and no partial product-line state. Config shape/semantics and target conflicts must be resolved before opening a write transaction. Apply then performs all config-owned mutations in a single synchronous `better-sqlite3` transaction.

**Alternatives considered**:

- Dry-run imports before no-mutation snapshots: rejected because existing import dry-run persists diagnostics and would pollute no-mutation proof.
- Partial section writes: rejected because unsafe configs must not leave partial state.

## Decision: Use existing workflow-contract import/apply logic

**Rationale**: Q4 and SPEC-009A made the workflow contract the repo-owned source of truth. The generic config declares `workflow_contract.family`, `path`, and `required_slugs`, while SPEC-010A supports only `mission-control` and delegates projection to `importWorkflowContract`.

**Alternatives considered**:

- Manual SQL insertion: bypasses contract validation and ownership conflict checks.
- Generic workflow-family infrastructure: larger than SPEC-010A; future families belong in later specs.

## Decision: Use existing `resource_policies` shape for governance defaults

**Rationale**: Q5 chose advisory/default governance rows using the existing policy model. Validation rejects first-intake-blocking defaults unless explicitly allowed with a per-policy reason.

**Alternatives considered**:

- New governance DSL: unnecessary new surface and review burden.
- Exclude governance: contradicts the roadmap and Mission Control parity.

## Decision: Preserve non-config-owned operational state

**Rationale**: Existing-target apply may update only reviewed config-owned fields. Tasks, activities, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit rows, manual workflow templates, counters, timestamps, lineage, and unrelated flags must survive.

**Alternatives considered**:

- Delete/rebuild product-line state: destructive and incompatible with live target history.
- Preserve only tasks: incomplete because GitHub sync and governance audit state are also operational history.

## Decision: Emit stable structured evidence and snapshots

**Rationale**: Clarify Session 2 fixed per-surface counts plus stable ordered-JSON SHA-256 hashes formatted as `product-line-seed-snapshot-v1:sha256:<hex>`. The result envelope uses `product-line-seed-result-v1` and stable fields for automation and review.

**Alternatives considered**:

- Plain text logs: not machine-readable enough for CI/UAT.
- Full raw row dumps: too noisy and risks leaking sensitive data.

## Decision: Keep Product Line B and runtime execution out of scope

**Rationale**: Q7/Q8 make Mission Control parity the UAT proof and leave real second-product-line onboarding to SPEC-010B. SPEC-010A must not create Product Line B config/smoke, mutate GitHub, create tasks, dispatch, claim, launch runners, create sandboxes, add adapters, auto-merge, or invoke SpecKit setup/autopilot.

**Alternatives considered**:

- Placeholder Product Line B config: likely to drift into false evidence.
- Disabled Product Line B seed: steals SPEC-010B scope.
