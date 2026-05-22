# Contract: Validation Error Codes

## Config Shape Codes

| Code | Meaning |
|------|---------|
| `CONFIG_PARSE_FAILED` | YAML could not be parsed safely. |
| `CONFIG_UNSAFE_YAML_SYNTAX` | YAML uses custom tags, anchors, aliases, merge keys, or multi-document streams. |
| `CONFIG_SCHEMA_VERSION_UNSUPPORTED` | `schema_version` is not `product-line-seed-v1`. |
| `CONFIG_REQUIRED_SECTION_MISSING` | A required top-level section is absent. |
| `CONFIG_UNKNOWN_FIELD` | Unknown top-level or section field was supplied. |
| `CONFIG_FIELD_TYPE_INVALID` | Field type does not match schema. |
| `CONFIG_DUPLICATE_DECLARATION` | Duplicate slug, role, policy identity, or feature flag was declared. |
| `CONFIG_CONFLICTING_DECLARATION` | A value appears in mutually exclusive config sets. |

## Product-Line And GitHub Codes

| Code | Meaning |
|------|---------|
| `PRODUCT_LINE_IDENTITY_INVALID` | Product-line slug/display name/agent prefix is missing or invalid. |
| `GITHUB_OWNER_REPO_INVALID` | GitHub owner/repo/full_name is missing or malformed. |
| `TARGET_REPO_CONFLICT` | Existing target residue conflicts with declared repo ownership. |
| `TARGET_PRODUCT_LINE_CONFLICT` | Existing product-line residue conflicts with declared product-line identity. |
| `TARGET_RESIDUE_BLOCKED` | Target-config-aware residue requires operator cleanup; no deletion was performed. |

## Workflow Codes

| Code | Meaning |
|------|---------|
| `UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY` | `workflow_contract.family` is not `mission-control` in SPEC-010A. |
| `WORKFLOW_CONTRACT_PATH_INVALID` | Contract path is missing, outside repo expectations, or unreadable. |
| `WORKFLOW_CONTRACT_PARSE_FAILED` | Existing workflow-contract loader rejected the contract. |
| `WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING` | One or more required slugs are absent. |
| `WORKFLOW_CONTRACT_REQUIRED_SLUG_AMBIGUOUS` | Required slug declaration is duplicated or ambiguous. |
| `WORKFLOW_CONTRACT_REPO_MISMATCH` | Contract tracker repo does not match config GitHub ownership. |
| `WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT` | Existing importer found a manual template slug collision. |

## Feature Flag Codes

| Code | Meaning |
|------|---------|
| `FEATURE_FLAG_UNKNOWN_ENABLED` | `enabled` contains a key absent from `FEATURE_FLAG_REGISTRY`. |
| `FEATURE_FLAG_UNKNOWN_DISABLED_OR_ABSENT` | `disabled_or_absent` contains a key that is neither registry-backed nor an allowed reserved future flag. |
| `FEATURE_FLAG_DUPLICATE` | A flag is duplicated within one list. |
| `FEATURE_FLAG_CONFLICT` | A flag is both enabled and disabled/absent. |
| `FEATURE_FLAG_RESERVED_FUTURE_ENABLED` | Reserved future flag is true in target state or requested as enabled. |
| `FEATURE_FLAG_ENV_FORCE_OFF` | Environment force-off conflicts with a config-owned enabled flag. |
| `FEATURE_FLAG_CASCADE_PREREQUISITE_MISSING` | Enabled flag prerequisites are not satisfied by config-owned or existing state. |

## Agent And Department Codes

| Code | Meaning |
|------|---------|
| `DEPARTMENT_INVALID` | Department slug/name/ticket prefix/area mapping is invalid. |
| `DEPARTMENT_GITHUB_REPO_MISMATCH` | Department GitHub repo does not match declared ownership. |
| `AGENT_PREFIX_INVALID` | `agent_prefix` is missing or not slug-safe. |
| `AGENT_KEY_INVALID` | `agent_key` is missing, not slug-safe, or already includes the prefix. |
| `AGENT_ASSIGNMENT_DEPARTMENT_MISSING` | Assignment references an undeclared department. |
| `SHARED_SUPPORT_ASSIGNMENT_INVALID` | Shared support lacks `scope: facility_global`, `shared_support_role`, or `agent_name`. |

## Governance Codes

| Code | Meaning |
|------|---------|
| `GOVERNANCE_POLICY_INVALID` | Policy does not match existing `resource_policies` field expectations. |
| `GOVERNANCE_FIRST_INTAKE_BLOCKING` | Default policy would block first intake without explicit allowance and reason. |
| `GOVERNANCE_POLICY_IDENTITY_DUPLICATE` | Stable policy identity is duplicated. |

## Existing Target And Mutation Codes

| Code | Meaning |
|------|---------|
| `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING` | Apply was requested against an existing product line without `--allow-existing`. |
| `APPLY_TRANSACTION_FAILED` | Apply transaction failed; result must report no partial success and include redacted error context. |
| `VERIFY_DRIFT_DETECTED` | Verify found target drift and performed no writes. |
| `NO_MUTATION_PROOF_FAILED` | Before/after snapshots differ for a validation or preflight failure that promised no mutation. |

## CLI Codes

| Code | Meaning |
|------|---------|
| `CLI_UNKNOWN_FLAG` | Unknown CLI flag was supplied. |
| `CLI_REQUIRED_FLAG_MISSING` | Required flag is absent. |
| `CLI_MODE_INVALID` | `--mode` is not preflight, apply, or verify. |
| `CLI_DATABASE_INVALID` | Database path is missing, unreadable, or lacks required tables. |
| `UNEXPECTED_ERROR` | Unexpected boundary error; output must still be redacted. |
