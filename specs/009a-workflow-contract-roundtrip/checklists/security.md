# Security Checklist: SPEC-009A Workflow Contract Format and Roundtrip

**Purpose**: Validate that SPEC-009A requirements define safe parsing, constrained validation, bounded interpolation, and redacted diagnostics/export behavior without launching later runtime control-plane features.
**Created**: 2026-05-06
**Feature**: [spec.md](../spec.md)

**Note**: This checklist is generated from the Phase 4 `security` prompt in `docs/ai/specs/SPEC-009A-workflow.md`.

## YAML Parsing Safety

- [ ] CHK001 Are YAML parser requirements explicit that only YAML 1.2 single-document mappings are accepted? [Completeness, Spec FR-003, Contracts Workflow Contract Schema]
- [ ] CHK002 Are multi-document streams, non-mapping roots, duplicate keys, custom tags, anchors, aliases, and merge keys rejected before canonical model construction? [Security, Spec FR-004, Research YAML Parser]
- [ ] CHK003 Is arbitrary code execution excluded by forbidding `eval`, `Function`, `vm`, shell execution, or dynamic module loading during parse/import/export? [Security, Spec FR-031, Plan Scope]
- [ ] CHK004 Are parser outputs treated as untrusted until copied into the typed canonical model? [Defense In Depth, Spec FR-008, Research Typed Boundary]
- [ ] CHK005 Are prompt bodies constrained to literal YAML block scalars so parser behavior cannot reinterpret prompt text as executable structure? [Completeness, Spec FR-005]
- [ ] CHK006 Are line-ending normalization and hash input rules defined without allowing Markdown bytes or runtime paths into canonical hash material? [Integrity, Spec FR-006, Spec FR-041]

## Schema And Routing Validation

- [ ] CHK007 Does the schema validation profile reuse the existing constrained AJV posture with strict mode and no defaults, coercion, removal, or data references? [Consistency, Spec FR-007, Research AJV]
- [ ] CHK008 Are unsupported JSON Schema features and schema extensions rejected instead of silently ignored? [Security, Spec FR-007, Contracts Workflow Contract Schema]
- [ ] CHK009 Are routing rules required to declare deterministic hashes so unsafe or drifted routing patterns fail validation? [Integrity, Spec FR-015, Spec FR-042]
- [ ] CHK010 Are output schemas hashed and validated without enabling runtime execution, network calls, or schema-driven mutation? [Security, Spec FR-015, Spec FR-030]
- [ ] CHK011 Are capability, adapter, governance, concurrency, retry, and sandbox declarations explicitly validation-only for SPEC-009A? [Scope, Spec FR-012, Spec FR-013, Spec FR-014]
- [ ] CHK012 Are existing resource governance evaluator, scheduler, dispatcher, runner, GitHub sync, and harness adapter paths excluded from SPEC-009A execution? [Scope, Spec FR-030, Plan Out Of Scope]

## Variable Allowlisting

- [ ] CHK013 Are template variable namespaces explicitly allowlisted, with unknown variables rejected before mutation? [Completeness, Spec FR-010]
- [ ] CHK014 Are variable validation failures required to include stable paths and hints without expanding or interpolating untrusted prompt text? [Security, Spec FR-050]
- [ ] CHK015 Are unbounded interpolation, recursive interpolation, environment-variable expansion, and secret-manager lookup excluded from contract parsing and export? [Security, Spec FR-010, Spec FR-030]
- [ ] CHK016 Are prompt/template bodies imported as inert data and never rendered through a code-capable templating engine during SPEC-009A? [Security, Spec FR-031]
- [ ] CHK017 Are future feature flags and governance declarations stored as inert contract data rather than activating behavior in this slice? [Scope, Spec FR-033, Spec FR-034]
- [ ] CHK018 Are GitHub tracker identity declarations validated structurally without invoking GitHub APIs or ingesting issue data? [Security, Spec FR-011, Spec FR-030]

## Secret-Safe Diagnostics And Export

- [ ] CHK019 Are diagnostics error details redacted and truncated when they may include prompt bodies, runtime values, headers, tokens, credentials, or secret-like strings? [Security, Spec FR-052]
- [ ] CHK020 Is generated Markdown export treated as review output that excludes local-only paths, row IDs, diagnostics IDs, and sensitive runtime details from canonical hash input? [Confidentiality, Spec FR-002, Spec FR-041]
- [ ] CHK021 Are dry-run and apply outputs required to show mutation status and diagnostics IDs without dumping full prompt bodies or database payloads? [Security, Spec FR-024, Contracts CLI]
- [ ] CHK022 Does the diagnostics API contract expose read-only, filterable summaries rather than edit, apply, dispatch, or governance override controls? [Least Privilege, Spec FR-047, Contracts Diagnostics API]
- [ ] CHK023 Are redaction expectations consistent across CLI errors, persisted run errors, diagnostics UI, and Markdown export? [Consistency, Spec FR-052, Data Model Workflow Contract Run Error]
- [ ] CHK024 Are security requirements bounded to parser/validator/diagnostics/export behavior without adding sandbox lifecycle enforcement or harness execution owned by SPEC-014A-D? [Scope, Spec FR-030, Plan Scope]
