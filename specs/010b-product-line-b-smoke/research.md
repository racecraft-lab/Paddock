# Research: Product Line B Onboarding Smoke

## Decision: Reuse SPEC-010A `seed:product-line`

**Rationale**: The existing seeder already owns config parsing, schema validation, workflow-contract import, preflight/apply/verify modes, target residue detection, redacted result envelopes, and before/after snapshot hashes. Reusing it keeps Product Line B reviewable and avoids a second seed path.

**Alternatives considered**:

- Add a SPEC-010B-only seed script. Rejected because it would duplicate config parsing, residue detection, and evidence behavior.
- Add new `enable` and `disable` seeder modes. Rejected because Clarify resolved that enable/disable are smoke lifecycle actions, not seed modes.

## Decision: Avoid Migration

**Rationale**: Migration M74 already adds `workspaces.disabled_at`, and `listWorkspacesForTenant` filters disabled workspaces out of normal switcher scope. SPEC-010B can use the existing column for disabled-by-default and final disabled evidence.

**Alternatives considered**:

- Add a Product Line B lifecycle table. Rejected because one smoke lifecycle does not need durable generalized lifecycle modeling.
- Add new sync lifecycle columns. Rejected because Product Line B repo sync ownership must remain false and live sync is out of scope.

## Decision: Add Disabled Lifecycle As A Config Invariant

**Rationale**: Product Line B must be disabled immediately after seed and after cleanup. Encoding this as a reviewed config invariant, such as `product_line.disabled_by_default: true`, lets `apply` and `verify` prove state through the same seed contract without adding seeder modes.

**Alternatives considered**:

- Treat disabled state as a manual post-seed SQL step. Rejected because it would leave the reviewed seed config unable to prove closeout.
- Infer disabled state from slug `product-line-b`. Rejected because implicit slug behavior is harder to review and violates the simple explicit config model.

## Decision: Synthetic Issue Smoke Is Local And Repo-Shaped

**Rationale**: The smoke must prove product-line scoping and already-proven pilot subset behavior without requiring a live GitHub write. A local `spec-010b.synthetic_issue.v1` envelope with `racecraft-lab/Paddock` metadata, existing pilot labels, and Product Line B local metadata satisfies this while preserving optional HAL live issue evidence.

**Alternatives considered**:

- Require a real GitHub issue. Rejected because the spec says live GitHub mutation is optional HAL UAT only.
- Use a non-repo-shaped fixture. Rejected because it would not prove the Paddock pilot metadata shape.

## Decision: Evidence Packet Is The Durable Review Surface

**Rationale**: A `spec-010b.smoke_evidence.v1` packet can tie each phase to command/API/SQL evidence, seed snapshot hashes, Product Line A before/after hashes, side-effect counts, cleanup counters, timing, optional live issue status, redaction proof, and SPEC-014C scope boundaries.

**Alternatives considered**:

- Rely on terminal logs. Rejected because logs are not structured, durable, or redaction-safe enough for review.
- Add a new database table. Rejected because checked-in text evidence and existing task artifact paths are enough for this smoke.

## Decision: Use Existing Scoped API/Dashboard Reads

**Rationale**: `/api/status?action=dashboard`, `/api/workspaces/:id`, `/api/projects`, `/api/tasks`, `/api/agents`, and `/api/github/sync` already accept workspace scoping or expose scoped state. SPEC-010B should prove scope propagation instead of adding a product-line isolation API.

**Alternatives considered**:

- Add a dedicated isolation API. Rejected unless implementation proves the existing read routes cannot express required evidence.
- Add an include-disabled switcher mode. Rejected because disabled Product Line B must remain absent from the normal switcher outside the smoke window.

## Decision: Runtime Inventory Is Supporting Evidence Only

**Rationale**: SPEC-014C is complete and owns the first real adapter behavior. SPEC-010B only needs logical `plb-platform-*` Product Line B assignments; harness manifest IDs remain selected-substrate/read-only support evidence if existing APIs expose them.

**Alternatives considered**:

- Require runtime-inventory `eligible`. Rejected by Clarify.
- Edit adapter or runtime-inventory eligibility files. Rejected because that remains outside SPEC-010B scope.

## Decision: No New Runtime Dependency

**Rationale**: Existing direct `yaml`, TypeScript, Node built-ins, `better-sqlite3`, and Vitest/Playwright are sufficient for config, contract, evidence, and smoke validation.

**Alternatives considered**:

- Add a new schema/evidence validation library. Rejected because the current product-line seed validation is hand-owned and the evidence envelope is small enough for focused TypeScript validation.
