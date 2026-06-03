# Contract: Runtime Inventory API

## Route

`GET /api/agents/runtime-inventory`

This is the only v1 runtime-inventory route. It returns `runtime_inventory.v1` and is read-only.

## Authorization And Scope

The route follows the existing workspace scope contract:

- Product Line request: `workspace_id=<id>`
- Facility request: `workspace_scope=facility`
- Sending both scope forms returns `400`
- Unauthorized workspace, project, or task scope returns `403`

Every user-supplied resource filter is authorized against caller-visible workspace, task, or project scope before it influences inventory output.

## Query Parameters

Allowed filters:

- `workspace_id`: product-line workspace id
- `workspace_scope`: currently only `facility`
- `task_id`: required for any `eligible` evaluation
- `project_id`: authorized project filter
- `role`: allowed project-agent role filter
- `requested_capability`: closed manifest capability key
- `state`: one of `visible`, `unassigned`, `assigned`, `eligible`, `blocked`
- `manifest_id`: one of `paddock_owned_sandbox_fake`, `external_harness_fake`

Unknown query keys, unknown capability values, unknown state values, unknown manifest values, malformed ids, and unsupported filters fail before inventory derivation. Syntactically valid but unsupported or unknown filter values return `422` with bounded validation metadata.

## Success Response

Status: `200`

```json
{
  "schema_version": "runtime_inventory.v1",
  "generated_at": "2026-06-03T00:00:00.000Z",
  "scope": {
    "kind": "workspace",
    "workspace_id": 1
  },
  "feature_flag": {
    "name": "FEATURE_AGENT_RUNNER_SANDBOXES",
    "enabled": false,
    "source": "workspace"
  },
  "entries": [
    {
      "id": "runtime_inventory:paddock_owned_sandbox_fake",
      "state": "blocked",
      "selected_manifest": {
        "manifest_id": "paddock_owned_sandbox_fake",
        "display_name": "Paddock-owned sandbox fake",
        "validation": {
          "ok": true
        }
      },
      "assignment": {
        "status": "not_evaluated"
      },
      "capability_resolution": {
        "schema_version": "capability_resolution.v1",
        "manifest_id": "paddock_owned_sandbox_fake",
        "requested_capability": "launch",
        "supported": true,
        "policy": {
          "approval": "not_evaluated",
          "timeout": "not_evaluated",
          "user_input": "not_evaluated"
        },
        "reason_codes": ["feature_disabled"]
      },
      "eligibility_gates": [
        {
          "gate": "feature_flag",
          "status": "failed",
          "reason_code": "feature_disabled"
        }
      ],
      "sandbox_lifecycle_refs": [],
      "sanitized_fake_evidence": [],
      "reason_codes": ["feature_disabled"]
    }
  ],
  "summary": {
    "total": 1,
    "visible": 0,
    "unassigned": 0,
    "assigned": 0,
    "eligible": 0,
    "blocked": 1
  },
  "diagnostics": {
    "truncated": false,
    "warnings": []
  }
}
```

## Error Responses

Mixed scope:

Status: `400`

```json
{
  "schema_version": "runtime_inventory_error.v1",
  "error": "invalid_scope",
  "message": "Specify either workspace_id or workspace_scope, not both.",
  "details": {
    "fields": ["workspace_id", "workspace_scope"]
  }
}
```

Unauthorized scope:

Status: `403`

```json
{
  "schema_version": "runtime_inventory_error.v1",
  "error": "authorization_denied",
  "reason_code": "authorization_denied",
  "details": {
    "scope": "workspace"
  }
}
```

Unsupported or unknown filter value:

Status: `422`

```json
{
  "schema_version": "runtime_inventory_error.v1",
  "error": "invalid_filter",
  "details": {
    "field_path": "requested_capability",
    "code": "unknown_capability",
    "reason_code": "capability_unsupported"
  }
}
```

Top-level request failures do not return partial `entries`.

## Read-Only Guarantees

The route must not:

- Launch, resume, stop, assign, retry, release, cancel, or debug work
- Mutate sandbox lifecycle, claims, retry state, task terminal state, task attempts, task artifacts, governance policy, GitHub state, tracker truth, scheduler state, successor selection, or auto-merge state
- Call real Codex, Claude, OpenClaw, Hermes, OpenCode, provider APIs, OpenClaw gateway RPCs, external harness processes, schedulers, or shell commands
- Expose raw transcripts, provider payloads, host paths, prompt bodies, token payloads, authentication material, secret-like values, raw external event payloads, raw tool/MCP payloads, unsafe URIs, or artifact content

## State Rules

- Without `task_id`, entries may be `visible`, `unassigned`, `assigned`, or `blocked`, but never `eligible`.
- `eligible` requires a caller-visible `task_id` and passing feature flag, assignment, selected capability, policy, governance, tracker-linked task eligibility, SPEC-014A lifecycle evidence, authorization, and evidence safety gates.
- Any failed evaluated gate returns `blocked` with every failed reason code in deterministic precedence order.
- Manifest validation failures use bounded `harness_manifest_validation.v1` metadata only.
- Unsafe fake evidence is omitted from `sanitized_fake_evidence` and represented only by bounded rejection metadata plus `sanitized_evidence_rejected`.
