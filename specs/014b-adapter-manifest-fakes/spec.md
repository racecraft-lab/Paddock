# Feature Specification: SPEC-014B - Harness Adapter Manifest and Fake Registry

**Feature Branch**: `014b-adapter-manifest-fakes`
**Created**: 2026-06-03
**Status**: Completed
**Input**: User description: "Define the typed harness adapter manifest and fake registry for SPEC-014B before any real harness adapter can launch or continue work."

## External Source Context

The following current external sources were consulted on 2026-06-03:

- OpenAI Harness Engineering article (Feb 11, 2026): https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement (Apr 27, 2026): https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI Symphony README, GitHub `openai/symphony` main branch: https://github.com/openai/symphony
- OpenAI Symphony SPEC, GitHub `openai/symphony` main branch: https://github.com/openai/symphony/blob/main/SPEC.md

These sources inform only the SPEC-014B contract vocabulary and safety posture: explicit harness capabilities, isolated work contexts, repository-owned policy, observable attempts, fail-closed configuration, and operator-visible evidence. SPEC-014B does not import Symphony's implementation stack, Linear-only tracker assumptions, daemon scheduler, real agent client behavior, or auto-merge workflow.

## Clarifications

### Runtime Inventory API Scope

`GET /api/agents/runtime-inventory` is the only v1 runtime-inventory route and returns `runtime_inventory.v1`. `/api/agents` remains response-compatible and does not embed runtime inventory by default; adding the dedicated route must not change `/api/agents` response shape, pagination, filtering, authorization, task-stat enrichment, or hidden-agent behavior.

The route follows the existing read-route authorization and workspace scope contracts: unauthenticated requests return `401`, authenticated `viewer`, `operator`, and `admin` callers may read authorized inventory, Product Line requests use `workspace_id=<id>`, Facility requests use `workspace_scope=facility`, sending both scope forms returns `400`, and unauthorized scope returns `403`. Every user-supplied resource filter must be authorized against the caller-visible workspace, task, or project scope before it can influence inventory output.

Allowed query filters are `task_id`, `project_id`, `role`, `requested_capability`, `state`, and `manifest_id`. Filter values are strict allowlists or known identifiers; unknown role, capability, state, or manifest values fail closed with bounded validation evidence. The `role` filter is an exact project-agent assignment role identifier from caller-visible `project_agent_assignments.role` evidence for the authorized project/workspace, not a human user role and not the legacy `/api/agents` `agents.role` filter. The closed v1 `requested_capability` values are `launch`, `resume`, `stop`, `transcript_read`, `event_read`, `token_runtime_accounting`, `artifact_publication`, `sandbox_posture`, `mcp_exposure`, `tool_exposure`, `skills`, `plugins`, `memory`, `provider_account_constraints`, `approval_policy`, `timeout_policy`, and `user_input_policy`.

Request-level scope and filter validation happens before runtime inventory entries are derived. Mixed scope parameters return `400`, unauthorized workspace, task, or project filters return `403`, and syntactically valid but unsupported or unknown filter values return `422` with bounded validation metadata. `403` responses must not reveal whether identifiers exist outside caller-visible scope, and request-level failures do not return partial `entries`.

The route may list `visible`, `unassigned`, `assigned`, and `blocked` inventory without `task_id`. A full `eligible` evaluation requires `task_id` because eligibility depends on tracker-linked task eligibility and SPEC-014A sandbox lifecycle evidence. Without `task_id`, the response must not claim an adapter is eligible for work.

### Runtime Inventory Envelope

The `runtime_inventory.v1` response envelope includes `schema_version`, `generated_at`, `scope`, `feature_flag`, `entries`, `summary`, and `diagnostics`. Each entry includes `id`, `state`, `selected_manifest`, `assignment`, `capability_resolution`, `eligibility_gates`, `sandbox_lifecycle_refs`, `sanitized_fake_evidence`, and `reason_codes`.

State precedence is closed: any failed evaluated required gate or validation failure produces `blocked`; `eligible` requires all gates and a task context; `assigned` means explicit project-role assignment is present but the task/capability/lifecycle context is absent or not fully evaluated; `unassigned` means visible but not explicitly assigned; `visible` is only the discoverable baseline.

### Fail-Closed Reason Codes

SPEC-014B uses the closed `HarnessAdapterReasonCode` enum: `feature_disabled`, `manifest_invalid`, `adapter_unassigned`, `capability_unsupported`, `governance_denied`, `task_ineligible`, `sandbox_lifecycle_missing`, `approval_unsupported`, `user_input_unsupported`, `timeout_budget_expired`, `authorization_denied`, and `sanitized_evidence_rejected`.

This enum is the public runtime-inventory, capability-resolution, UI, fixture, and review-packet vocabulary. Existing lower-level codebase terms are normalized at the harness-adapter boundary rather than exposed as pass-through public reason codes. Original internal terms may appear only as bounded sanitized diagnostic metadata such as `source_reason` or `source_decision`.

When multiple evaluated gates fail for an entry, the entry returns every failed reason code in deterministic precedence order: feature flag, manifest validation, assignment, capability, policy, governance, task eligibility, sandbox lifecycle, authorization, evidence safety. Request-level scope, authorization, and filter validation errors are rejected before entries are derived.

All evaluated gate, policy, capability, and validation failures in SPEC-014B are `blocked` runtime inventory plus capability-resolution evidence. SPEC-014B does not write failed task attempts, task artifacts, claims, lifecycle mutations, GitHub mutations, scheduler state, tracker truth, or successor-selection state for these fake-registry failures.

### Sanitized Fake Evidence

`SanitizedFakeEvidence` is a closed `sanitized_fake_evidence.v1` discriminated union with these allowed kinds: `synthetic_summary`, `counter`, `event_ref`, `lifecycle_ref`, `manifest_ref`, `capability_resolution_ref`, and `fake_artifact_descriptor`.

Evidence objects carry only fields defined for their kind. Unknown kinds, unknown properties, unsafe field names, over-limit strings or arrays, raw transcript-like text, provider payloads, host paths, prompt bodies, token payloads, authentication material, secret-like values, raw external event payloads, raw tool or MCP payloads, unsafe URIs, and artifact content are rejected before API, UI, log, test, fixture, review-packet, or artifact exposure.

Every text-bearing manifest, evidence, validation, diagnostic, and UI label field is treated as plain text only. SPEC-014B must not render fake evidence or diagnostics as raw HTML or Markdown, and secret-shaped text must be rejected before API, UI, log, fixture, test, review-packet, or artifact exposure using the existing repository secret-safety boundary or a stricter closed validator.

Unsafe evidence does not get redacted-and-continued in SPEC-014B. The capability or inventory evaluation fails closed with `sanitized_evidence_rejected`, returns only bounded field-path, evidence-kind, and reason metadata, and never marks the adapter eligible, selects a fallback adapter, switches harnesses, or mutates task, claim, lifecycle, governance, GitHub, scheduler, tracker, successor, or auto-merge state.

When unsafe fake evidence is detected during an otherwise authorized adapter/task evaluation, the route still returns `runtime_inventory.v1` for the evaluated visible entry. That entry has `state: "blocked"`, includes `sanitized_evidence_rejected` in `reason_codes`, omits the unsafe evidence object from `sanitized_fake_evidence`, and may expose only bounded rejection metadata: field path, evidence kind, and closed rejection reason. This is an entry-level evaluation failure, not a top-level request authorization or filter-validation error.

### Harness Adapter Manifest Shape

`HarnessAdapterManifest` is a closed `harness_adapter_manifest.v1` TypeScript fixture contract in the new harness-adapter layer, separate from `src/lib/adapters`. Every top-level field is required: `schema_version`, `manifest_id`, `display_name`, `sandbox`, `capabilities`, `exposure`, `provider_account_constraints`, `policies`, and `evidence_descriptors`.

The manifest does not include top-level `metadata`, raw configuration, runtime inventory, assignment, eligibility gates, sandbox lifecycle rows, execution state, provider payloads, host paths, prompt bodies, credentials, transcripts, or catch-all extension fields. Unknown top-level or nested properties fail validation. Runtime inventory and eligibility fields belong to derived read models, not to the manifest.

The two required v1 fake manifest identifiers are `paddock_owned_sandbox_fake` and `external_harness_fake`. Implementation may export constants named `PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST` and `EXTERNAL_HARNESS_FAKE_MANIFEST`. Valid fake fixtures belong under the new harness-adapter boundary; invalid fixtures are test-only inputs.

### Manifest Capability Support Shape

Every required harness adapter capability or declaration is encoded as a closed support object, not as a boolean, nullable field, missing property, or inferred default. Required support-object fields are `state`, optional bounded `modes`, optional bounded `evidence_kinds`, and `unsupported_reason_code` when unsupported.

`state` is exactly `supported` or `unsupported`. Every required capability/declaration key is present in the manifest. Missing keys, unknown support-object properties, unsupported `state` values, unbounded mode strings, unsupported evidence kinds, or missing `unsupported_reason_code` for an unsupported declaration make the manifest invalid with `manifest_invalid` field-level evidence. Paddock must not infer support from missing fields, mode names, evidence descriptors, adapter posture, or runtime visibility.

This shape applies uniformly to launch, resume, stop, transcript read, event read, token/runtime accounting, artifact publication, sandbox posture, MCP exposure, tool exposure, skills, plugins, memory, provider/account constraints, approval policy, timeout policy, and user-input policy declarations. Capability/declaration gaps use `capability_unsupported` unless a policy declaration has a more specific reason code: `approval_unsupported`, `user_input_unsupported`, or `timeout_budget_expired`.

### Manifest Policy And Provider/Account Constraints

V1 fake manifests use synthetic-only provider/account constraints: `provider_kind: "synthetic"`, `account_binding: "none"`, and `credential_exposure: "forbidden"`.

`approval_policy` declares supported modes and maps unsupported approval requirements to `approval_unsupported`. `timeout_policy` declares supported modes and maps unsupported, malformed, or expired timeout budgets to `timeout_budget_expired`. `user_input_policy` declares supported modes and maps unsupported user-input requirements to `user_input_unsupported`. Malformed policy declarations fail as `manifest_invalid`.

V1 manifests must not expose real provider kinds, provider account ids, credential references, credential material, auth environment variables, prompt bodies, prompt templates containing bodies, provider payloads, raw external event payloads, raw tool or MCP payloads, token payloads, transcripts, or secret-like values. Real provider/account binding is deferred to later real-adapter specs and requires a new security review.

### Manifest Validation Failure Payload

Manifest validation failures return only bounded structured metadata using `harness_manifest_validation.v1`:

```json
{
  "ok": false,
  "error": "manifest_invalid",
  "schema_version": "harness_manifest_validation.v1",
  "issues": [
    {
      "field_path": "<manifest field path>",
      "code": "<closed validation code>",
      "reason_code": "manifest_invalid",
      "evidence_kind": "<optional sanitized evidence kind>",
      "rejected_property": "<optional property name only>"
    }
  ],
  "diagnostics": {
    "manifest_id": "<optional known manifest id>",
    "manifest_sha256": "<optional canonical manifest digest>",
    "issue_count": 0,
    "truncated": false
  }
}
```

`issues` and `diagnostics` are capped, deterministic, and safe to expose in API responses, UI, tests, fixtures, logs, review packets, and artifacts. `field_path`, `code`, `reason_code`, `evidence_kind`, and `rejected_property` are metadata only; `rejected_property` may name an unknown or rejected property but must not echo its value. Arbitrary map keys in field paths are redacted unless they pass a strict identifier allowlist. If caps are exceeded, the response sets `diagnostics.truncated=true` and preserves total `issue_count`.

The payload must not include raw manifest values, schema excerpts, validator exception text, stack traces, transcript text, provider payloads, host paths, prompt bodies, model outputs, token payloads, API keys, session ids, connection strings, authentication material, secret-like values, raw tool or MCP payloads, raw external event payloads, or artifact content. A malformed manifest maps to entry-level `state: "blocked"` with `reason_codes: ["manifest_invalid"]` when entries are otherwise authorized.

### Agents Surface UX Contract

Runtime inventory evidence belongs in the existing Agents surface card/detail patterns. SPEC-014B must not create a separate operator destination, replace the current agent status model, or add launch, assignment, retry, release, cancel, debug, lifecycle, scheduler, GitHub, governance, successor-selection, or auto-merge controls.

Every rendered runtime inventory state must include a visible text label from the closed state vocabulary, not only color or icon treatment. Selected manifest, eligibility reason codes, lifecycle references, sanitized fake evidence, feature-flag state, generated timestamp, and truncated diagnostics must be labeled with bounded text that is safe for UI, screenshot evidence, and screen-reader exposure.

The Agents surface must define deterministic display behavior for runtime inventory loading, background refresh, no entries, feature-flag-off inventory, unauthorized or invalid request errors, unsupported capability, blocked entries, stale lifecycle references, and truncated diagnostics. UI error and empty states must not echo raw unauthorized ids, provider payloads, host paths, prompt bodies, tokens, secrets, raw transcripts, raw tool or MCP payloads, or unsafe evidence content.

The runtime inventory evidence area must remain readable at mobile and desktop widths by stacking compact summary rows on narrow screens and using the established card/detail layout on wider screens. Long manifest ids, reason codes, lifecycle refs, and evidence descriptors must wrap or truncate without overlapping adjacent controls or hiding the read-only boundary. Keyboard focus order, semantic section labels, and screen-reader names must distinguish existing agent controls from SPEC-014B read-only evidence.

### Data Integrity Invariants

The fake registry contains exactly the two v1 manifest ids `paddock_owned_sandbox_fake` and `external_harness_fake`. Registry validation fails closed before eligibility if either required manifest is missing, if any manifest id is duplicated, or if the registry contains an unknown v1 manifest id. Registry output and runtime inventory entries are ordered deterministically by manifest id unless a caller-supplied allowlisted filter narrows the set.

Runtime inventory is derived from a single request-local read of manifests plus caller-visible workspace, project, assignment, task, governance, feature-flag, and SPEC-014A lifecycle evidence. The derived response is not stored in SQLite, localStorage, durable artifacts, scheduler state, task artifacts, task attempts, claims, lifecycle rows, governance rows, GitHub rows, tracker truth, successor state, or auto-merge state.

Every runtime inventory entry id is unique within a response. `summary.total` equals `entries.length`, each per-state summary count equals the number of entries with that state, and all summary counts are derived from entries after authorization and filter validation. A response uses one `generated_at` timestamp and one feature-flag resolution for the evaluated scope.

An entry cannot be `eligible` when task, project, assignment, governance, lifecycle, or feature-flag evidence is absent, unauthorized, cross-workspace, stale, malformed, or evaluated from a different scope than the response scope. Such cases produce `blocked`, `assigned`, `unassigned`, or `visible` according to the closed state precedence.

### Error Handling Contract

Runtime inventory request-level errors are selected before entries are derived. Error precedence is deterministic: unauthenticated `401`, mixed scope `400`, unauthorized workspace/project/task/scope `403`, malformed or unsupported query/filter `422`, then bounded unexpected server failure `500`. Request-level errors return `runtime_inventory_error.v1`, no partial `entries`, and no raw user-supplied values beyond safe field names or closed codes.

Feature-flag-off, manifest invalid, unsupported capability, unsupported approval or user input, expired timeout, governance denied, task ineligible, sandbox lifecycle missing, adapter unassigned, and sanitized evidence rejected outcomes are entry-level runtime inventory failures for otherwise authorized evaluations. They return `200 runtime_inventory.v1` with `state: "blocked"` or the appropriate non-eligible state, deterministic reason codes, and bounded evidence rather than request-level errors.

Unexpected internal failures return `500 runtime_inventory_error.v1` with a closed `runtime_inventory_unavailable` error code, no stack trace, no SQL text, no raw manifest or evidence value, no host path, no provider payload, no token, no secret-like value, and no partial `entries`.

### State Management Invariants

Runtime inventory state is a derived read model, not a lifecycle owner, claim owner, scheduler state, or dispatch state. The closed state precedence remains: `blocked` for failed evaluated gates, `eligible` only when every gate passes with task context, `assigned` for explicit assignment with incomplete context and no failed evaluated gate, `unassigned` for visible unassigned manifests, and `visible` for baseline discovery.

SPEC-014A lifecycle evidence can support eligibility only when it is same-workspace, same-task, same-stage, caller-visible, owner-compatible with the selected manifest, and in one of the nonterminal supporting statuses `created`, `prepared`, or `running`. Lifecycle evidence with `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, or `cleanup_failed` status is inspectable read-only evidence but cannot satisfy the eligibility lifecycle gate; it yields `sandbox_lifecycle_missing` or another bounded blocked reason rather than `eligible`.

The Agents UI must not infer or store runtime inventory state independently of the latest authorized `runtime_inventory.v1` response. Background refresh may replace displayed evidence, but it must not promote `visible`, `unassigned`, `assigned`, or `blocked` entries to `eligible` client-side and must not preserve stale eligible labels after a newer response removes the required gates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review Declared Harness Capabilities (Priority: P1)

As a reviewer, I need every candidate harness to declare its supported capabilities, policies, sandbox posture, and evidence posture before Paddock can rely on it for future execution.

**Why this priority**: A real adapter cannot be safely introduced until the manifest contract proves launch, resume, stop, transcript, artifact, sandbox, tool, approval, timeout, input, usage, and eligibility assumptions are explicit.

**Independent Test**: Validate the checked-in fake manifests and confirm the Paddock-owned sandbox fake and external-harness fake both produce a capability-resolution packet without invoking Codex, Claude, OpenClaw, Hermes, OpenCode, the OpenClaw gateway, an external process, or a provider API.

**Acceptance Scenarios**:

1. **Given** the fake registry is loaded, **When** the Paddock-owned sandbox fake is validated, **Then** the manifest declares capabilities, policy support, sandbox posture, provider/account constraints, and sanitized evidence descriptors.
2. **Given** the fake registry is loaded, **When** the external-harness fake is validated, **Then** the manifest uses the same contract while declaring an external ownership posture and no Paddock-owned filesystem authority.
3. **Given** a malformed fake manifest, **When** validation runs, **Then** validation fails with stable field and reason evidence before any runtime inventory entry is considered eligible.

---

### User Story 2 - Distinguish Visibility From Eligibility (Priority: P1)

As an operator, I need runtime inventory to show visible harnesses, unassigned harnesses, assigned harnesses, eligible harnesses, and blocked harnesses without treating visibility as permission to work.

**Why this priority**: Paddock already observes runtime-adjacent systems, but future execution must require explicit assignment, policy, task, capability, and lifecycle gates rather than assuming any visible runtime can dispatch.

**Independent Test**: Query the dedicated read-only runtime inventory response and verify `visible`, `unassigned`, `assigned`, `eligible`, and `blocked` entries can be produced from typed fake manifests, assignments, feature flags, governance decisions, tracker-linked task evidence, and SPEC-014A lifecycle references without a new inventory table.

**Acceptance Scenarios**:

1. **Given** a fake adapter is discoverable but not assigned to the project role, **When** runtime inventory is read, **Then** the entry is visible and unassigned, and no work eligibility is reported.
2. **Given** a fake adapter is assigned but one required gate is missing, **When** runtime inventory is read, **Then** the entry is blocked with every failed gate named.
3. **Given** the feature flag is enabled, the adapter is explicitly assigned, governance allows work, the task is tracker-linked and eligible, the selected manifest supports the requested capability, and SPEC-014A lifecycle evidence exists, **When** runtime inventory is read, **Then** the entry is eligible and includes the selected manifest and lifecycle reference.

---

### User Story 3 - Fail Closed For Unsupported Capabilities And Policies (Priority: P1)

As Paddock, I need unsupported adapter capabilities, unsupported approval or user-input requirements, and expired timeout budgets to fail closed with reviewable evidence instead of stalling, switching harnesses, or mutating tracker truth.

**Why this priority**: Explicit failure is the safety proof for later real adapters. Silent fallback or delayed ambiguity would make review packets unreliable.

**Independent Test**: Select fake adapters that intentionally lack required launch, resume, stop, transcript, artifact, approval, timeout, or user-input support, then verify the capability-resolution packet records stable fail-closed reason codes and no scheduler, GitHub, tracker, claim-control, lifecycle-control, or gateway mutation occurs.

**Acceptance Scenarios**:

1. **Given** the selected adapter lacks a required capability, **When** eligibility is evaluated, **Then** the result is blocked or failed with `capability_unsupported` evidence and no fallback adapter is selected.
2. **Given** approval or user input is required but the selected adapter does not support that policy, **When** eligibility is evaluated, **Then** the result is blocked or failed with policy-specific reason evidence and no prompt body or raw payload is exposed.
3. **Given** the requested timeout budget is expired or unsupported, **When** eligibility is evaluated, **Then** the result is blocked or failed with timeout reason evidence and no work item, GitHub issue, task terminal state, claim state, or successor selection is mutated.

---

### User Story 4 - Inspect Runtime Inventory In The Existing Agents Surface (Priority: P2)

As an operator, I need the existing Agents experience to show runtime inventory state, selected manifest evidence, eligibility reasons, lifecycle references, and sanitized fake evidence without adding launch, assignment, retry, or lifecycle controls.

**Why this priority**: SPEC-014B owns the first operator-visible runtime inventory integration, but it must remain read-only so SPEC-014C/D can add real execution later.

**Independent Test**: Run a real browser journey on the existing Agents surface that captures visible, unassigned, assigned, eligible, blocked, feature-flag-off, and unsupported-capability states with screenshot or visual-review evidence, while proving no new control path is rendered.

**Acceptance Scenarios**:

1. **Given** runtime inventory entries exist, **When** an operator opens the Agents surface, **Then** state badges, selected manifest names, eligibility reasons, lifecycle references, and sanitized fake evidence are visible in the established Agents page or detail patterns.
2. **Given** a fake entry is blocked, **When** the operator inspects the entry, **Then** all failed gates are shown as bounded reasons without raw transcript, provider payload, host path, prompt body, token payload, or secret-like data.
3. **Given** SPEC-014B UI is complete, **When** the operator searches for new launch, assignment, retry, cancel, release, lifecycle, scheduler, or auto-merge controls, **Then** none are available through this feature.
4. **Given** runtime inventory is loading, empty, disabled by feature flag, unauthorized, invalid, stale, or truncated, **When** the operator opens or refreshes the Agents surface, **Then** the state is labeled with bounded text and does not expose unsafe or unauthorized payload details.

---

### User Story 5 - Preserve Existing Control-Plane Boundaries (Priority: P3)

As a maintainer, I need SPEC-014B to reuse existing framework-adapter, session observation, OpenClaw gateway, agent sync, AgentRun, claim, retry, governance, and sandbox lifecycle boundaries rather than duplicating or changing them.

**Why this priority**: This spec is a contract and fake-registry slice. Expanding into real runtime behavior would increase blast radius and bypass existing Paddock authority.

**Independent Test**: Run static scope guards and focused tests proving SPEC-014B adds no real harness execution, no OpenClaw gateway call, no external process launch, no scheduler dispatch, no migration, no claim-control mutation, no retry semantic change, no lifecycle control mutation, no successor selection, no governance mutation, no GitHub mutation, and no auto-merge behavior.

**Acceptance Scenarios**:

1. **Given** existing framework adapters remain available through the current adapter surface, **When** SPEC-014B is implemented, **Then** that surface remains a compatibility boundary and is not widened into the stricter harness adapter contract.
2. **Given** session, runtime, agent-sync, and AgentRun evidence already exists, **When** runtime inventory is derived, **Then** those surfaces may be referenced as inputs but are not reimplemented.
3. **Given** claim, retry, governance, lifecycle, scheduler, and successor-selection authority already belongs to earlier specs and existing modules, **When** SPEC-014B runs, **Then** it reads their evidence only where required for eligibility and does not mutate their authority.

### Edge Cases

- `FEATURE_AGENT_RUNNER_SANDBOXES` is disabled globally or for the workspace.
- A fake manifest is visible but has no project-role assignment.
- A fake manifest is assigned to one project or role but not to the task's project role.
- The selected adapter supports launch but not resume, stop, transcript read, artifact publication, token/runtime accounting, MCP/tool exposure, skills, plugins, memory, approval, timeout, or user-input requirements.
- Governance denies autonomous work after the adapter is otherwise assigned.
- The task is local-only, missing a tracker link, terminal, not assigned, or otherwise ineligible for runner work.
- SPEC-014A sandbox lifecycle evidence is missing, disabled, cross-workspace, stale, or references an unsafe owner posture.
- Multiple fake manifests are visible and only one is explicitly selected for the evaluated task.
- Approval, timeout, or user-input policy declarations are unsupported, expired, malformed, or incompatible with the selected adapter.
- Fake evidence contains overlong summaries, raw transcript-like text, raw provider payloads, host paths, prompt bodies, token payloads, or secret-like values.
- A manifest omits a required top-level group, required capability key, or unsupported capability reason code.
- A manifest declares a real provider kind, account binding, credential exposure, prompt body, provider payload, or raw tool/MCP payload in v1.
- Manifest validation finds more issues than the response cap; diagnostics are truncated without exposing raw values.
- Existing OpenClaw gateway, session scanner, runtime detection, agent sync, or AgentRun inputs are absent, malformed, or stale.
- Runtime inventory is requested by a user without workspace access or by a read-only user.
- Runtime inventory is requested with both `workspace_id` and `workspace_scope=facility`, an unauthorized `workspace_id`, an unknown state filter, or an unknown requested capability.
- Runtime inventory is requested with multiple invalid top-level inputs, such as unauthenticated plus mixed scope, mixed scope plus invalid filters, or unauthorized scope plus malformed filters.
- Runtime inventory derivation encounters an unexpected internal failure after authorization.
- Runtime inventory is requested without `task_id`; the response may show visible, unassigned, assigned, or blocked inventory, but it cannot claim any adapter is eligible for work.
- Multiple evaluated gates fail for one entry; the response returns every failed reason code in deterministic precedence order.
- Browser UI is loaded while inventory entries change between visible, assigned, eligible, and blocked states.
- SPEC-014A lifecycle evidence is terminal, cleanup pending, cleaned up, rolled back, cleanup failed, owner-incompatible, task-mismatched, stage-mismatched, or absent.
- Duplicate fake manifest ids, missing required fake manifests, unknown v1 manifest ids, mismatched summary counts, duplicate runtime inventory entry ids, or cross-scope evidence appear during registry or inventory derivation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST introduce a stricter harness adapter contract layer that is separate from the existing framework-adapter contract used for registration, heartbeat, task reports, assignments, and disconnects.
- **FR-002**: System MUST preserve the existing framework-adapter surface as a compatibility boundary and MUST NOT widen it into the harness execution contract.
- **FR-003**: System MUST reuse existing framework-adapter, OpenClaw gateway, runtime/session observation, agent sync, local agent sync, and AgentRun surfaces as inputs or compatibility boundaries where relevant.
- **FR-004**: System MUST NOT duplicate OpenClaw gateway behavior, framework-adapter behavior, session scanners, runtime detection, agent sync, local agent sync, or AgentRun storage.
- **FR-005**: System MUST define checked-in typed fake manifest fixtures for the SPEC-014B fake registry.
- **FR-006**: System MUST validate fake manifests before they can appear as eligible runtime inventory and MUST return only bounded `harness_manifest_validation.v1` metadata for manifest failures.
- **FR-007**: System MUST avoid SQLite persistence for adapter manifests and runtime inventory in SPEC-014B.
- **FR-008**: System MUST include exactly two required fake adapter postures for v1: a Paddock-owned sandbox fake with manifest id `paddock_owned_sandbox_fake` and an external-harness fake with manifest id `external_harness_fake`.
- **FR-009**: System MUST prove both fake adapter postures exercise the same harness adapter contract.
- **FR-010**: System MUST keep all fake adapters behind `FEATURE_AGENT_RUNNER_SANDBOXES`, which defaults OFF.
- **FR-011**: System MUST declare manifest capabilities for launch, resume, stop, transcript or event read, token/runtime accounting, artifact publication, sandbox posture, MCP exposure, tool exposure, skills, plugins, memory, provider/account constraints, approval policy, timeout policy, and user-input policy.
- **FR-012**: System MUST represent unsupported capabilities explicitly through closed support objects rather than omitting fields, using booleans, or inferring support.
- **FR-013**: System MUST produce a capability-resolution packet for an evaluated adapter and task context.
- **FR-014**: System MUST include the selected manifest identifier, requested capability, supported capability result, policy result, eligibility gate results, stable reason codes, and sanitized evidence references in the capability-resolution packet.
- **FR-015**: System MUST use a derived runtime inventory state model with the states `visible`, `unassigned`, `assigned`, `eligible`, and `blocked`.
- **FR-016**: System MUST define `visible` as an adapter manifest that can be listed or observed but has not necessarily been assigned or authorized for work.
- **FR-017**: System MUST define `unassigned` as a visible adapter that lacks explicit project-role assignment for the evaluated scope.
- **FR-018**: System MUST define `assigned` as a visible adapter with explicit project-role assignment where no evaluated gate has failed, but required task, capability, policy, or lifecycle context is absent or not fully evaluated.
- **FR-019**: System MUST define `eligible` as an assigned adapter whose feature flag, project-role assignment, adapter capability support, governance allow decision, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle evidence all pass for a caller-visible `task_id`.
- **FR-020**: System MUST define `blocked` as a visible or assigned adapter with one or more failed evaluated eligibility gates, policy checks, capability checks, authorization checks, or validation failures.
- **FR-021**: System MUST require all eligibility gates to pass before runtime inventory can mark an adapter eligible.
- **FR-022**: System MUST include `FEATURE_AGENT_RUNNER_SANDBOXES` as a required eligibility gate.
- **FR-023**: System MUST include explicit project-role assignment as a required eligibility gate.
- **FR-024**: System MUST include selected adapter capability support as a required eligibility gate.
- **FR-025**: System MUST include governance allow evidence as a required eligibility gate without mutating governance policy.
- **FR-026**: System MUST include tracker-linked task eligibility as a required eligibility gate and MUST NOT treat local-only tasks as eligible runner work.
- **FR-027**: System MUST include SPEC-014A sandbox lifecycle evidence as a required eligibility gate.
- **FR-028**: System MUST expose `GET /api/agents/runtime-inventory` as the sole v1 runtime inventory API and MUST support only allowlisted query filters: `task_id`, `project_id`, `role`, `requested_capability`, `state`, and `manifest_id`; `role` MUST match caller-visible `project_agent_assignments.role` evidence, and `requested_capability` MUST match the closed v1 manifest capability/declaration key vocabulary.
- **FR-029**: System MUST return a `runtime_inventory.v1` response envelope with `schema_version`, `generated_at`, `scope`, `feature_flag`, `entries`, `summary`, and `diagnostics`; each entry MUST include `id`, `state`, `selected_manifest`, `assignment`, `capability_resolution`, `eligibility_gates`, `sandbox_lifecycle_refs`, `sanitized_fake_evidence`, and `reason_codes`.
- **FR-030**: System MUST keep the runtime inventory API read-only and MUST NOT perform launch, assignment, lifecycle, claim, retry, scheduler, GitHub, governance, tracker-truth, successor, or auto-merge mutations.
- **FR-031**: System MUST enforce authenticated `viewer`-or-higher workspace, project, and task visibility for runtime inventory reads, MUST return `401` for unauthenticated reads, and MUST reject mixed or unauthorized scope query inputs before applying inventory filters.
- **FR-032**: System MUST update API index and OpenAPI documentation for the runtime inventory route.
- **FR-033**: System MUST include tests or guardrails proving API index and OpenAPI parity for the runtime inventory route.
- **FR-034**: System MUST add read-only runtime inventory integration to the existing Agents surface.
- **FR-035**: The Agents surface MUST show runtime inventory state badges, selected manifest evidence, eligibility reasons, lifecycle references, and sanitized fake evidence.
- **FR-036**: The Agents surface MUST NOT add launch, assignment, retry, release, cancel, debug, lifecycle-control, scheduler, GitHub, governance, successor-selection, or auto-merge controls in SPEC-014B.
- **FR-037**: System MUST fail closed when a selected adapter lacks a required capability.
- **FR-038**: System MUST fail closed when a selected adapter does not support a required approval policy.
- **FR-039**: System MUST fail closed when a selected adapter does not support a required user-input policy.
- **FR-040**: System MUST fail closed when a timeout policy is unsupported, malformed, or expired.
- **FR-041**: V1 fake manifests MUST use `provider_kind: "synthetic"`, `account_binding: "none"`, and `credential_exposure: "forbidden"` for provider/account constraints.
- **FR-042**: Fail-closed outcomes MUST use stable reason-code evidence and MUST return every evaluated entry-level failure in deterministic precedence order.
- **FR-043**: Fail-closed outcomes MUST NOT stall indefinitely, select a fallback adapter, switch harnesses silently, mutate GitHub, mutate tracker truth, mutate task terminal state, write failed task attempts or artifacts, mutate claim state, mutate lifecycle state, mutate governance policy, mutate scheduler state, or mutate successor selection.
- **FR-044**: Stable reason codes MUST cover `feature_disabled`, `manifest_invalid`, `adapter_unassigned`, `capability_unsupported`, `governance_denied`, `task_ineligible`, `sandbox_lifecycle_missing`, `approval_unsupported`, `user_input_unsupported`, `timeout_budget_expired`, `authorization_denied`, and `sanitized_evidence_rejected`.
- **FR-045**: Fake evidence MUST be bounded to `sanitized_fake_evidence.v1` kinds: `synthetic_summary`, `counter`, `event_ref`, `lifecycle_ref`, `manifest_ref`, `capability_resolution_ref`, and `fake_artifact_descriptor`.
- **FR-046**: Fake evidence MUST NOT expose raw transcript, provider payload, host path, prompt body, token payload, authentication material, secret-like values, raw external event payloads, or raw tool/MCP payloads.
- **FR-047**: System MUST reject unsupported or unsafe fake evidence with `sanitized_evidence_rejected` before it appears in API responses, UI, tests, fixtures, logs, review packets, or artifacts; authorized entry-level rejection output MUST use `state: "blocked"` and include only bounded field-path, evidence-kind, and reason metadata.
- **FR-048**: System MUST support manifest-declared artifact publication capability only through sanitized fake artifact descriptors in SPEC-014B.
- **FR-049**: System MUST support manifest-declared token/runtime accounting capability only through synthetic counters in SPEC-014B.
- **FR-050**: System MUST support manifest-declared transcript or event-read capability only through sanitized synthetic summaries and event references in SPEC-014B.
- **FR-051**: System MUST NOT call real Codex, Claude, OpenClaw, Hermes, OpenCode, provider APIs, OpenClaw gateway RPCs, external harness processes, schedulers, or shell commands as part of fake adapter behavior.
- **FR-052**: System MUST include static scope guards or tests proving no real harness execution, gateway call, external process launch, scheduler dispatch, migration, claim-control mutation, retry semantic change, lifecycle-control mutation, successor selection, governance mutation, GitHub mutation, or auto-merge behavior is added.
- **FR-053**: System MUST preserve SPEC-013B claim/reconciliation authority and MUST NOT use adapter assignment, manifest visibility, runtime inventory, or sandbox lifecycle evidence as a claim lock.
- **FR-054**: System MUST preserve SPEC-013C retry/debug semantics and SPEC-013D task-detail operator controls without introducing new retry, release, cancel, or debug behavior.
- **FR-055**: System MUST preserve SPEC-014A sandbox lifecycle ownership by referencing lifecycle evidence read-only and MUST NOT add lifecycle mutation controls.
- **FR-056**: Manual UAT MUST verify the feature-flag-off state, fake manifest validation, all runtime inventory states, read-only Agents surface evidence, unsupported capability failure, unsupported or expired policy failure, sanitized evidence boundaries, and absence of real harness side effects.
- **FR-057**: The Agents surface MUST represent runtime inventory loading, refresh, no-entry, feature-flag-off, unauthorized, invalid-filter, unsupported-capability, blocked, stale-lifecycle, and truncated-diagnostics states with bounded read-only UI text.
- **FR-058**: Runtime inventory UI labels MUST expose the closed state and reason-code text directly and MUST NOT rely on color, icon, or position alone to communicate state.
- **FR-059**: Runtime inventory UI MUST preserve readable layout, focus order, and screen-reader names across mobile and desktop widths without overlapping existing Agents controls or hiding the read-only boundary.
- **FR-060**: Text-bearing manifest, evidence, validation, diagnostic, API, UI, log, fixture, test, review-packet, and artifact fields MUST be treated as plain text, MUST reject secret-shaped values before exposure, and MUST NOT be rendered as raw HTML or Markdown.
- **FR-061**: Fake registry validation MUST fail closed when a required v1 fake manifest is missing, when any v1 manifest id is duplicated, or when an unknown v1 manifest id appears.
- **FR-062**: Runtime inventory responses MUST use unique entry ids and summary counts that exactly match the post-authorization, post-filter `entries` collection.
- **FR-063**: Runtime inventory derivation MUST use a request-local consistent read of authorized evidence and MUST NOT mark an adapter `eligible` from absent, stale, malformed, unauthorized, cross-workspace, or cross-scope evidence.
- **FR-064**: Runtime inventory request-level errors MUST follow deterministic precedence: `401` authentication, `400` mixed scope, `403` unauthorized scope/resource, `422` malformed or unsupported query/filter, then bounded `500` unexpected server failure.
- **FR-065**: Feature-flag-off, manifest invalid, unsupported capability or policy, timeout, governance, task, lifecycle, assignment, and sanitized-evidence failures MUST remain entry-level inventory outcomes for otherwise authorized evaluations rather than top-level request errors.
- **FR-066**: Unexpected runtime inventory server failures MUST return bounded `runtime_inventory_error.v1` metadata without partial entries, stack traces, SQL text, raw values, host paths, provider payloads, tokens, or secret-like values.
- **FR-067**: Runtime inventory state MUST remain a derived read model and MUST NOT become lifecycle authority, claim authority, scheduler state, dispatch state, or client-side inferred eligibility.
- **FR-068**: SPEC-014A lifecycle evidence MUST satisfy the eligibility lifecycle gate only when it is same-workspace, same-task, same-stage, caller-visible, owner-compatible, and in `created`, `prepared`, or `running` status.
- **FR-069**: Terminal, cleanup-pending, cleaned-up, rolled-back, cleanup-failed, owner-incompatible, task-mismatched, stage-mismatched, unauthorized, or absent lifecycle evidence MUST NOT produce `eligible`.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Harness Adapter Manifest**: Checked-in typed declaration of one harness adapter's identity, capabilities, sandbox posture, policies, provider/account constraints, and safe evidence posture.
- **Fake Adapter Registry**: Feature-flagged registry of fake harness adapter manifests used to prove the contract without launching real harnesses.
- **Fake Adapter Posture**: Declared execution ownership shape for a fake adapter, either Paddock-owned sandbox or external harness.
- **Capability Support Object**: Closed manifest declaration with `state`, bounded `modes`, bounded `evidence_kinds`, and an `unsupported_reason_code` when support is unsupported.
- **Manifest Validation Failure**: `harness_manifest_validation.v1` bounded issue-list payload that identifies invalid manifest fields without exposing raw values or unsafe payloads.
- **Capability Resolution Packet**: Reviewable evaluation record for a selected manifest, requested capability, policy compatibility, eligibility gates, reason codes, and sanitized evidence references.
- **Runtime Inventory Entry**: Derived read-model entry for one visible adapter or observed runtime, including id, state, selected manifest, assignment, capability resolution, eligibility gates, sandbox lifecycle references, sanitized fake evidence, and reason codes.
- **Runtime Inventory State**: Closed state value: `visible`, `unassigned`, `assigned`, `eligible`, or `blocked`.
- **Eligibility Gate**: Required condition that must pass before an adapter is eligible: feature flag, project-role assignment, capability support, governance allow, tracker-linked task eligibility, and sandbox lifecycle evidence.
- **Runtime Policy Declaration**: Manifest-declared approval, timeout, and user-input support that determines whether a requested work posture can proceed.
- **Sandbox Lifecycle Reference**: Read-only reference to SPEC-014A `sandbox_lifecycle.v1` evidence for the evaluated task, stage, owner, and sandbox posture.
- **Sanitized Fake Evidence**: Closed `sanitized_fake_evidence.v1` evidence union containing only synthetic summaries, counters, event references, lifecycle references, manifest references, capability-resolution references, and fake artifact descriptors that prove adapter behavior without exposing unsafe payloads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of checked-in fake manifests validate successfully, and 100% of intentionally malformed manifest fixtures fail validation with field-level reason evidence.
- **SC-002**: The Paddock-owned sandbox fake and external-harness fake both produce capability-resolution packets through the same contract without invoking any real harness, gateway, provider, scheduler, or external process.
- **SC-003**: Runtime inventory evidence demonstrates all five states: `visible`, `unassigned`, `assigned`, `eligible`, and `blocked`.
- **SC-004**: 100% of eligible runtime inventory entries include passing evidence for feature flag, explicit project-role assignment, adapter capability support, governance allow, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle reference.
- **SC-005**: 100% of failed eligibility evaluations include one or more stable reason codes and do not select fallback adapters or mutate GitHub, tracker truth, task terminal state, claim state, lifecycle state, governance policy, scheduler state, successor selection, or auto-merge state.
- **SC-006**: 100% of unsupported capability, unsupported approval policy, unsupported user-input policy, and expired timeout policy cases fail closed with bounded evidence in the same evaluation cycle.
- **SC-007**: 100% of runtime inventory API responses use `runtime_inventory.v1`, enforce read-only access, and omit raw transcript, provider payload, host path, prompt body, token payload, auth material, secret-like values, and raw tool/MCP payloads.
- **SC-008**: The existing Agents surface browser journey covers visible, unassigned, assigned, eligible, blocked, feature-flag-off, and unsupported-capability states with reviewable screenshot or visual-review evidence.
- **SC-009**: Operators can identify a runtime entry's state, selected manifest, failed gate, and lifecycle reference from the Agents surface in under 30 seconds without terminal access.
- **SC-010**: API index and OpenAPI parity checks cover the runtime inventory route, closed query filter vocabularies, documented error responses, and `/api/agents` compatibility before implementation is considered complete.
- **SC-011**: Static scope guards or focused tests prove no real Codex, Claude, OpenClaw, Hermes, OpenCode, gateway, external process, scheduler dispatch, migration, claim-control mutation, retry semantic change, lifecycle control, successor selection, governance mutation, GitHub mutation, or auto-merge behavior is added.
- **SC-012**: Manual UAT on a disposable workspace leaves zero fake runtime inventory, lifecycle, assignment, task, artifact, or activity residue beyond expected sanitized evidence records.
- **SC-013**: Agents surface UAT covers mobile and desktop responsive states, keyboard focus traversal, visible text labels for all runtime states, and bounded loading/error/empty/flag-off UI states without unsafe payload exposure.
- **SC-014**: Registry and runtime-inventory tests prove duplicate manifests, missing manifests, unknown manifest ids, duplicate entry ids, mismatched summaries, stale lifecycle evidence, and cross-scope task/project/assignment evidence cannot produce eligible inventory.
- **SC-015**: Error-handling tests prove request-level precedence for `401`, `400`, `403`, `422`, and bounded `500`, while entry-level fail-closed outcomes still return runtime inventory evidence with no unsafe payload exposure.
- **SC-016**: State-management tests prove visibility, assignment, lifecycle status, feature-flag changes, and UI refreshes cannot promote an adapter to `eligible` unless the latest authorized response contains all required same-scope gates.

## Assumptions

- SPEC-014A is complete and provides read-only sandbox lifecycle evidence that SPEC-014B may reference without mutating lifecycle state.
- SPEC-013B, SPEC-013C, and SPEC-013D authority remains unchanged; SPEC-014B only reads the evidence needed to explain eligibility.
- Runtime inventory is a derived read model for this spec; durable manifest or inventory persistence is out of scope unless a later planning gate records a reviewed exception.
- The default and only v1 runtime inventory route is `GET /api/agents/runtime-inventory`, returning `runtime_inventory.v1`; `/api/agents` remains response-compatible.
- Full `eligible` runtime inventory evaluation requires a caller-visible `task_id`; without `task_id`, inventory can be visible, unassigned, assigned, or blocked, but not eligible.
- SPEC-014B reason codes are public adapter-boundary codes; internal feature-flag, governance, lifecycle, claim, or validation terms are mapped into the closed enum and can appear only as sanitized source metadata.
- SPEC-014B v1 manifests are synthetic-only fixtures; any real provider/account binding is deferred to later real-adapter specs.
- Existing project-role assignment, governance, tracker-link, and task eligibility evidence can be read through existing Paddock surfaces or narrow read helpers during implementation planning.
- The existing Agents surface is the only operator UI target for SPEC-014B runtime inventory.
- Fake evidence is synthetic and bounded by design; it is sufficient to prove contracts but not intended to simulate provider-quality transcripts, real token accounting, real artifacts, or real tool execution.
- Future SPEC-014C/D work may add real adapter execution only after this fake registry proves explicit selection, eligibility, and fail-closed behavior.
