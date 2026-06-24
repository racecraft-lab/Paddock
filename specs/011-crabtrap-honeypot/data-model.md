# Data Model: SPEC-011 CrabTrap Honeypot Adapter

## CrabTrapDenialSummary

Paddock-owned signed helper fixture. This is the only accepted input shape for SPEC-011.

### Required Fields

| Field | Type | Validation |
|---|---|---|
| `schema_version` | string | Must be `crabtrap_denial_summary.v1`. |
| `source` | string | Bounded lower-safe source identifier. |
| `event_id` | string | Bounded event identifier; used only for signature/replay derivation, not raw activity display. |
| `signed_at` | ISO timestamp string | Required signature/freshness timestamp. |
| `occurred_at` | ISO timestamp string | Required event timestamp used in replay identity. |
| `decision` | string | Must be `deny`. |
| `method` | string | One of `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`. |
| `url_host` | string | Lowercased host only; no scheme, userinfo, query, fragment, CR/LF, or blank value. |
| `url_path` | string | Parsed pathname only; `/` allowed; no query, fragment, CR/LF, or secret-like path value. |
| `reason_code` | string | One of the closed reason taxonomy values. |
| `safe_request_hash` | string | `sha256:<64hex>` over safe canonical input. |
| `denial_count` | integer | Safe integer from 0 through 1,000,000 inclusive. |
| `actor_kind` | string | Bounded actor category, not a raw actor identifier. |
| `signature` | string | `sha256=<64hex>` HMAC-SHA256 signature. |

### Optional Fields

| Field | Type | Validation |
|---|---|---|
| `source_instance_hash` | string | `sha256:<64hex>`. |
| `actor_ref_hash` | string | `sha256:<64hex>`; must be keyed when derived from low-entropy actor identity. |
| `workspace_id` | integer | Accepted only when approved by adapter context. |
| `project_id` | integer | Accepted only when approved by adapter context; persisted only in bounded activity `data`. |
| `probe_kind` | string | Bounded lower-safe probe category. |
| `url_path_hash` | string | `sha256:<64hex>` over safe path input. |
| `distinct_host_count` | integer | Safe integer from 0 through 1,000,000 inclusive. |
| `distinct_path_count` | integer | Safe integer from 0 through 1,000,000 inclusive. |
| `distinct_actor_count` | integer | Safe integer from 0 through 1,000,000 inclusive. |

### Rejection Rules

- Unknown fields are rejected.
- Payloads over 16 KiB UTF-8 are rejected before JSON parse.
- Malformed JSON is rejected before schema validation.
- Raw/full URL fields, scheme, userinfo, query, fragment, raw headers, bodies, cookies, Authorization values, API keys, query secrets, provider payloads, raw actor IDs, user IDs, emails, full CrabTrap audit rows, payload-supplied `replay_key_hash`, raw secret hashes, and matched secret substrings are rejected.
- `CONNECT` and `TRACE` are unsupported in this slice.

## CrabTrapAdapterConfig

Operator-provided helper config required before acceptance.

| Field | Type | Validation |
|---|---|---|
| `signing_secret` | string or bytes | Required, non-empty, not persisted in activity data or diagnostics. |
| `freshness_window_seconds` | integer | Defaults to 300; must remain bounded. |
| `max_payload_bytes` | integer | Defaults to 16 KiB; enforced before JSON parse. |
| `clock` | function or injectable clock | Used for deterministic stale/fresh tests. |

Missing or invalid config returns `config_missing` or `config_invalid` and writes no activity.

## CrabTrapAdapterContext

Runtime context supplied by the caller, not by the fixture.

| Field | Purpose |
|---|---|
| `workspace_id` | Approved workspace landing scope when available. |
| `project_id` | Approved project reference stored only in activity `data` when available. |
| `facility_workspace_id` | Real facility workspace fallback when no approved workspace context exists. |
| `flag_context` | Context passed to `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)`. |
| `db` | Existing database handle/helper used for activity lookup and insert. |

Fixture-provided scope IDs are never blindly trusted. They must match approved context before use.

## ReplayIdentity

Adapter-derived uniqueness key.

| Field | Type | Rule |
|---|---|---|
| `replay_key_hash` | string | `sha256:<64hex>` over `source + "\0" + event_id + "\0" + occurred_at`. |

Replay detection checks existing activities in the selected workspace/facility landing scope for `type='security_intrusion_detected'` and the same `data.replay_key_hash`.

## SecurityActivityEvidence

Existing-schema activity row created only after all gates pass.

| Activity Field | Value |
|---|---|
| `type` | `security_intrusion_detected` |
| `actor` | Fixed Paddock-owned `crabtrap-adapter` |
| `entity_type` | `workspace` |
| `entity_id` | Approved `workspace_id` or facility workspace id |
| `workspace_id` | Same workspace/facility landing id |
| `data` | Bounded summary fields, safe hashes, safe counts, optional context-approved `project_id`, and adapter-derived `replay_key_hash` |

`data` must not contain raw/full URLs, headers, bodies, cookies, Authorization values, API keys, tokens, query secrets, provider payloads, payload-controlled actor identifiers, signing material, raw secret hashes, matched secret substrings, or full audit rows.

## CrabTrapIntakeResult

Adapter result returned to callers/tests.

| State | Meaning | Activity Write |
|---|---|---|
| `noop` | Feature disabled or config missing/invalid. | None |
| `rejected` | Payload/security validation failed. | None |
| `accepted` | Exactly one activity row was created. | One row |
| `failed` | Activity write failed after validation. | None or partial rollback, with bounded `activity_write_failed` outcome |

Failure codes use `crabtrap_intake_failure_code.v1`:

```text
feature_disabled
config_missing
config_invalid
payload_too_large
malformed_json
payload_schema_invalid
signature_missing
timestamp_missing
timestamp_invalid
timestamp_stale
signature_invalid
unsafe_field_present
unsupported_decision
unsupported_method
replay_detected
activity_write_failed
```

## State Transitions

```text
received
  -> noop(feature_disabled | config_missing | config_invalid)
  -> rejected(payload_too_large | malformed_json | schema/signature/timestamp/unsafe/unsupported/replay failure)
  -> accepted(activity row inserted)
  -> failed(activity_write_failed)
```

No transition mutates tasks, scheduler state, dispatch state, GitHub sync, notifications, terminal task state, successor selection, or OpenAPI/UI surfaces.
