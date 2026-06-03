# Data Model: SPEC-014B - Harness Adapter Manifest and Fake Registry

## HarnessAdapterReasonCode

Closed public enum used by manifests, capability resolution, runtime inventory, UI, fixtures, tests, and review packets:

- `feature_disabled`
- `manifest_invalid`
- `adapter_unassigned`
- `capability_unsupported`
- `governance_denied`
- `task_ineligible`
- `sandbox_lifecycle_missing`
- `approval_unsupported`
- `user_input_unsupported`
- `timeout_budget_expired`
- `authorization_denied`
- `sanitized_evidence_rejected`

Reason codes are returned in deterministic precedence order: feature flag, manifest validation, assignment, capability, policy, governance, task eligibility, sandbox lifecycle, authorization, evidence safety.

## HarnessAdapterManifest

Schema version: `harness_adapter_manifest.v1`.

Required top-level fields:

- `schema_version`: exactly `harness_adapter_manifest.v1`
- `manifest_id`: closed v1 fake id, either `paddock_owned_sandbox_fake` or `external_harness_fake`
- `display_name`: bounded operator label
- `sandbox`: support object describing ownership/posture and filesystem authority
- `capabilities`: closed map of required capability support objects
- `exposure`: closed support declarations for MCP, tool, skills, plugins, and memory exposure
- `provider_account_constraints`: synthetic-only provider/account declaration
- `policies`: approval, timeout, and user-input policy declarations
- `evidence_descriptors`: bounded list of allowed `sanitized_fake_evidence.v1` kinds

Forbidden fields include top-level `metadata`, raw configuration, runtime inventory, assignments, eligibility gates, sandbox lifecycle rows, execution state, provider payloads, host paths, prompt bodies, credentials, transcripts, and catch-all extension maps.

## Fake Adapter Registry

Checked-in registry containing exactly two required v1 fake manifests:

- `PADDOCK_OWNED_SANDBOX_FAKE_MANIFEST` with `manifest_id: "paddock_owned_sandbox_fake"`
- `EXTERNAL_HARNESS_FAKE_MANIFEST` with `manifest_id: "external_harness_fake"`

Registry rules:

- Registry remains behind `FEATURE_AGENT_RUNNER_SANDBOXES`.
- Registry validation rejects missing required v1 fake manifests, duplicate manifest ids, and unknown v1 manifest ids.
- Registry order is deterministic by manifest id before filters are applied.
- Every manifest is validated before it can be eligible.
- Invalid manifests may appear only as blocked inventory evidence when the caller is otherwise authorized.
- Registry load must not start a process, call a provider, call a gateway, read host paths, or mutate state.

## CapabilitySupport

Closed support object used for every required capability and declaration:

- `state`: `supported` or `unsupported`
- `modes`: optional bounded list of closed mode strings
- `evidence_kinds`: optional bounded list of allowed sanitized evidence kinds
- `unsupported_reason_code`: required when `state` is `unsupported`

Missing keys, booleans, null support, unknown properties, unsupported states, unbounded strings, unsupported evidence kinds, or missing unsupported reason codes make the manifest invalid.

Required capability/declaration groups cover launch, resume, stop, transcript/event read, token/runtime accounting, artifact publication, sandbox posture, MCP exposure, tool exposure, skills, plugins, memory, provider/account constraints, approval policy, timeout policy, and user-input policy.

Canonical v1 capability/declaration keys used by manifests, capability-resolution packets, and the `requested_capability` query filter are:

- `launch`
- `resume`
- `stop`
- `transcript_read`
- `event_read`
- `token_runtime_accounting`
- `artifact_publication`
- `sandbox_posture`
- `mcp_exposure`
- `tool_exposure`
- `skills`
- `plugins`
- `memory`
- `provider_account_constraints`
- `approval_policy`
- `timeout_policy`
- `user_input_policy`

## RuntimePolicyDeclaration

Manifest policy declaration for runtime work posture:

- `approval_policy`: supported approval modes; unsupported requirements map to `approval_unsupported`
- `timeout_policy`: supported timeout modes and budgets; unsupported, malformed, or expired budgets map to `timeout_budget_expired`
- `user_input_policy`: supported input modes; unsupported requirements map to `user_input_unsupported`

Malformed policy declarations map to `manifest_invalid`. Policy declarations must not contain prompt bodies, provider payloads, raw tool/MCP payloads, credentials, or secret-like strings.

## SanitizedFakeEvidence

Schema version: `sanitized_fake_evidence.v1`.

Allowed discriminated union kinds:

- `synthetic_summary`: bounded summary text that is not transcript-like and contains no raw prompt/provider content
- `counter`: synthetic numeric metric such as fake token/runtime count
- `event_ref`: bounded event identifier/reference, not raw event payload
- `lifecycle_ref`: bounded reference to SPEC-014A lifecycle evidence
- `manifest_ref`: bounded manifest reference and digest metadata
- `capability_resolution_ref`: bounded reference to a capability-resolution packet
- `fake_artifact_descriptor`: artifact descriptor with label, MIME/type metadata, byte count, digest/reference, and no artifact content

Unknown kinds, unknown properties, over-limit strings/arrays, raw transcript-like text, provider payloads, host paths, prompt bodies, token payloads, auth material, secret-like values, raw external event payloads, raw tool/MCP payloads, unsafe URIs, and artifact content are rejected with `sanitized_evidence_rejected`.

Text-bearing evidence and diagnostics are plain text only. They must not be interpreted as raw HTML or Markdown and must pass the existing repository secret-safety boundary, or a stricter closed validator, before they appear in API, UI, log, fixture, test, review-packet, or artifact outputs.

## HarnessManifestValidation

Schema version: `harness_manifest_validation.v1`.

Failure shape:

- `ok`: `false`
- `error`: `manifest_invalid`
- `schema_version`: `harness_manifest_validation.v1`
- `issues`: capped deterministic list of field issues
- `diagnostics`: optional known `manifest_id`, optional canonical manifest digest, total `issue_count`, and `truncated`

Each issue includes:

- `field_path`: bounded sanitized field path
- `code`: closed validation code
- `reason_code`: `manifest_invalid`
- `evidence_kind`: optional sanitized evidence kind
- `rejected_property`: optional property name only, never the rejected value

The validation payload never includes raw manifest values, schema excerpts, exception text, stack traces, transcript text, provider payloads, host paths, prompt bodies, model outputs, token payloads, API keys, session ids, connection strings, auth material, raw tool/MCP payloads, raw external event payloads, or artifact content.

## CapabilityResolutionPacket

Reviewable evaluation record for one selected manifest and optional task context:

- `schema_version`: `capability_resolution.v1`
- `manifest_id`
- `requested_capability`
- `capability`: support result and any unsupported reason
- `policies`: approval, timeout, and user-input policy results
- `eligibility_gates`: feature flag, assignment, capability, policy, governance, task eligibility, sandbox lifecycle, authorization, and evidence safety gate results
- `reason_codes`: deterministic failed reason codes
- `sanitized_evidence_refs`: references to accepted sanitized evidence objects
- `rejection_metadata`: optional bounded field path, evidence kind, and closed rejection reason for rejected evidence

Packet rules:

- Unsupported capability or policy never selects a fallback adapter.
- Failed resolution does not write task attempts, artifacts, claims, lifecycle rows, governance policy rows, GitHub rows, scheduler rows, tracker truth, terminal task state, or successor state.
- `eligible` can only be true when a caller-visible `task_id` is provided and every required gate passes.

## RuntimeInventoryEntry

Schema version: contained in `runtime_inventory.v1`.

Required fields:

- `id`: stable derived entry id
- `state`: one of `visible`, `unassigned`, `assigned`, `eligible`, `blocked`
- `selected_manifest`: manifest id, display name, validation status, and bounded digest/descriptor metadata
- `assignment`: project, role, and assignment match evidence, without unauthorized ids
- `capability_resolution`: capability-resolution packet or bounded validation failure
- `eligibility_gates`: gate result list with stable reason codes
- `sandbox_lifecycle_refs`: zero or more read-only SPEC-014A lifecycle references
- `sanitized_fake_evidence`: accepted sanitized evidence objects only
- `reason_codes`: deterministic failed reason codes

State precedence:

1. Any failed evaluated required gate or validation failure produces `blocked`.
2. `eligible` requires `task_id` and passing feature flag, assignment, capability/policy, governance, task eligibility, sandbox lifecycle, authorization, and evidence safety gates.
3. `assigned` means explicit project-role assignment is present and no evaluated gate has failed, but task/capability/policy/lifecycle context is absent or incomplete.
4. `unassigned` means visible but not explicitly assigned for the evaluated scope.
5. `visible` is only the discoverable baseline and never means permission to work.

Integrity rules:

- Entry ids are unique within one response.
- Entry order is deterministic by manifest id and derived entry id after filters.
- Eligible entries cannot use absent, stale, malformed, unauthorized, cross-workspace, or cross-scope task, project, assignment, governance, feature-flag, or lifecycle evidence.
- SPEC-014A lifecycle evidence satisfies the lifecycle gate only when it is same-workspace, same-task, same-stage, caller-visible, owner-compatible, and in `created`, `prepared`, or `running` status.
- Terminal, cleanup-pending, cleaned-up, rolled-back, cleanup-failed, owner-incompatible, task-mismatched, stage-mismatched, unauthorized, or absent lifecycle evidence cannot produce `eligible`.

## RuntimeInventoryEnvelope

Route response schema version: `runtime_inventory.v1`.

Top-level fields:

- `schema_version`
- `generated_at`
- `scope`
- `feature_flag`
- `entries`
- `summary`
- `diagnostics`

`summary.total` equals `entries.length`, and per-state summary counts equal the number of entries in each state after authorization and filter validation. The envelope uses one `generated_at` timestamp and one feature-flag resolution for the evaluated scope.

Top-level request validation errors return no partial `entries`.
