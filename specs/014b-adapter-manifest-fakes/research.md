# Research: SPEC-014B - Harness Adapter Manifest and Fake Registry

## Decision: Create `src/lib/harness-adapters/` as the stricter adapter boundary

**Rationale**: The existing framework-adapter surface remains a compatibility boundary for registration, heartbeat, task reports, assignments, and disconnects. SPEC-014B needs an explicit harness contract that can declare launch/resume/stop, transcript/event read, artifact, accounting, sandbox, MCP/tool exposure, skills/plugins/memory, provider/account constraints, approval, timeout, user input, and evidence posture before future real execution work.

**Alternatives considered**:
- Extend `src/lib/adapters`: rejected because it would widen a compatibility surface into an execution contract.
- Put the fake registry near the Agents UI: rejected because validation and eligibility are server/domain concerns and must be testable without React.
- Persist manifests in SQLite: rejected because v1 manifests are checked-in fixtures and the spec requires derived runtime inventory without a migration.

## Decision: Use closed TypeScript validators instead of a new schema dependency

**Rationale**: The manifest and evidence shapes are closed, small, and synthetic-only. Hand-written validators can cap issue counts, avoid raw value echoing, reject unknown properties, and return `harness_manifest_validation.v1` metadata without adding supply-chain surface.

**Alternatives considered**:
- Add a new JSON Schema runtime validator: rejected because no unavoidable need is proven and the constitution requires pinned dependency review for every new runtime dependency.
- Reuse broad ad hoc assertions in tests only: rejected because production route responses must fail closed with bounded field-level evidence.

## Decision: Keep v1 fake manifests as typed checked-in fixtures

**Rationale**: The required `paddock_owned_sandbox_fake` and `external_harness_fake` manifests are review artifacts. Checked-in constants make capability declarations, synthetic provider/account constraints, and evidence posture visible in code review and deterministic in tests.

**Alternatives considered**:
- Generate manifests at runtime: rejected because it hides reviewable declarations and creates drift between tests and runtime.
- Load operator-local manifest files: rejected because v1 is synthetic-only and real provider/account binding is deferred to later real-adapter specs.

## Decision: Derive runtime inventory on read

**Rationale**: Runtime inventory is a read model over manifest validation, registry visibility, explicit project-role assignment, feature flag state, governance/capability checks, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle read evidence. Derivation avoids schema churn and makes fail-closed behavior visible without writing fake failures to tasks, artifacts, claims, lifecycle, governance, GitHub, scheduler, tracker, or successor state.

**Alternatives considered**:
- Add a durable `runtime_inventory` table: rejected because no v1 requirement needs persistence and the workflow prompt prohibits migrations unless derived state is impossible.
- Embed runtime inventory in `/api/agents`: rejected because `/api/agents` must remain response-compatible.

## Decision: Add `GET /api/agents/runtime-inventory` as the only v1 API route

**Rationale**: A dedicated route keeps the new contract discoverable and read-only while preserving existing Agents and adapter APIs. It can enforce workspace/project/task authorization and filter validation before inventory derivation, returning `runtime_inventory.v1` or bounded error envelopes.

**Alternatives considered**:
- Extend `/api/agents`: rejected because the spec requires response compatibility and no default embedding.
- Add mutation endpoints for fake adapter selection: rejected because SPEC-014B is evidence-only and must not add launch, assignment, lifecycle, scheduler, GitHub, governance, or successor behavior.

## Decision: Treat unsafe evidence as an entry-level fail-closed condition

**Rationale**: `sanitized_fake_evidence.v1` exists to prove future review-packet safety. Unknown evidence kinds, unknown properties, raw transcript-like text, provider payloads, host paths, prompt bodies, token payloads, secrets, raw external events, raw tool/MCP payloads, unsafe URIs, and artifact content must not reach API, UI, logs, tests, fixtures, review packets, or artifacts. Authorized evaluations return the entry as `blocked` with `sanitized_evidence_rejected` and bounded rejection metadata only.

**Alternatives considered**:
- Redact unsafe evidence and continue eligibility: rejected because the spec requires fail-closed behavior and no fallback selection.
- Drop unsafe evidence silently: rejected because operators need stable reason-code evidence.

## Decision: Add read-only Agents surface evidence only

**Rationale**: Operators need state badges, selected manifest evidence, eligibility reasons, lifecycle references, and sanitized fake evidence in the existing Agents experience. A single read-only component keeps UI review focused and prevents new control paths.

**Alternatives considered**:
- Add a new runtime-inventory page: rejected because the spec names the existing Agents surface.
- Add launch/retry/release/cancel controls for fake adapters: rejected because real controls belong to later specs and would violate the read-only boundary.

## Decision: Add static scope guards for forbidden side effects

**Rationale**: Unit tests prove behavior, but SPEC-014B also needs static evidence that no real Codex, Claude, OpenClaw, Hermes, OpenCode, gateway RPC, external process, scheduler dispatch, migration, claim-control mutation, retry semantic change, lifecycle-control mutation, successor selection, governance mutation, GitHub mutation, or auto-merge path is introduced.

**Alternatives considered**:
- Rely only on code review: rejected because the spec requires guardrails.
- Run real harness smoke checks: rejected because fake adapter behavior must not invoke real harnesses or external processes.

## Decision: Keep the implementation inside the soft reviewability warning

**Rationale**: The feature has one primary surface, the harness/adapter contract, with secondary read-only API and UI evidence required for acceptance. The planned file count stays below the hard block threshold, but implementation must split if reviewable LOC or production files cross hard caps.

**Alternatives considered**:
- Split before planning: rejected because the API and UI are thin read-only projections needed to verify the contract end to end.
- Ignore the warning: rejected because the constitution requires explicit budget and split-boundary evidence.
