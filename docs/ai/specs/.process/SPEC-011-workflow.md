# SpecKit Workflow: SPEC-011 - CrabTrap Honeypot Adapter

**Template Version**: 1.0.0, populated from SpecKit Pro workflow template
**Created**: 2026-06-24
**Purpose**: Prepare RC Factory Phase 7.5 for autonomous SpecKit execution by adding an optional, absent-safe CrabTrap evidence adapter.

Run from the dedicated worktree:

```bash
cd /Users/fredrickgabelmann/.codex/worktrees/18d7/racecraft-mission-control/.worktrees/011-crabtrap-honeypot
$speckit-autopilot docs/ai/specs/.process/SPEC-011-workflow.md
```

Do not run autopilot from the parent checkout. Keep review-visible feature artifacts under `specs/011-crabtrap-honeypot/` and scaffold-only artifacts under `.process/`.

## Design Concept

This workflow was enriched from a Grill Me setup interview. The source of truth for scoping decisions is:

```text
docs/ai/specs/.process/SPEC-011-design-concept.md
```

Re-read the design concept before each phase. If a generated artifact contradicts the design concept, treat the generated artifact as wrong unless it records an explicit human-approved revision.

## Workflow Overview

| Phase | Command | Status | Notes |
|---|---|---|---|
| Scaffold | `$speckit-scaffold-spec SPEC-011` | Complete | Branch/worktree, design concept, workflow, reviewability preset, SPEC-MOC, and UAT runbook created |
| Specify | `$speckit-specify` | Complete | Generated `specs/011-crabtrap-honeypot/spec.md` and requirements checklist; G1 passed with 0 markers |
| Clarify | `$speckit-clarify` | Complete | Resolved intake boundary, signature scheme, payload contract, activity scope, alert stance, replay behavior, and fixture UAT requirements |
| Plan | `$speckit-plan` | Complete | Generated helper-only implementation blueprint, research, data model, contract schema, and quickstart |
| Checklist | `$speckit-checklist` | Complete | Security, data-integrity, error-handling, and state-management checklists complete with zero gaps |
| Tasks | `$speckit-tasks` | Complete | Generated 32 TDD-first tasks across 7 groups; G5 passed; marker plan recorded for reviewability sizing |
| Analyze | `$speckit-analyze` | Complete | Resolved 3 findings; G6 passed; security-routed consensus completed 3/3 high-confidence |
| Implement | `$speckit-implement` | In Progress | Foundation, US1, and US2 checkpoints committed; US3 invalid-payload hardening marker in progress |

## Phase Gates

| Gate | Checkpoint | Approval Criteria |
|---|---|---|
| G0 | After scaffold | Branch is `011-crabtrap-honeypot`; design concept, workflow, SPEC-MOC, UAT runbook, and reviewability preset are committed; roadmap marks SPEC-011 In Progress on this branch only |
| G1 | After Specify | Requirements cover flag-off no-op, missing-config no-op, denial-summary normalization, signature/replay/size validation, malformed/unsafe rejection, and activity evidence |
| G2 | After Clarify | Helper fixture intake boundary, signature scheme, payload fields, activity scope, alert/non-alert stance, and UAT requirements are closed |
| G3 | After Plan | Architecture remains an optional adapter, uses `resolveFlag`, adds no migration, avoids OpenAPI unless explicitly ratified, and does not touch scheduler/task-dispatch |
| G4 | After Checklist | Security, data-integrity, error-handling, and state-management checklists have zero unresolved `[Gap]` items |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, and bounded to `src/lib/crabtrap-adapter.ts`, focused tests, guardrails/docs, and optional fixture/runbook files |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; generated artifacts agree with the library-first design concept and strict roadmap scope |
| G7 | After Implement | Focused tests, guardrails, typecheck/lint as required, fixture UAT, reviewability gate, PR packet, and roadmap/workflow status updates are complete |

## Prerequisites

### Branch And Worktree

| Field | Value |
|---|---|
| Branch | `011-crabtrap-honeypot` |
| Worktree | `.worktrees/011-crabtrap-honeypot` |
| Base | Active setup checkout commit `c65bb02b` |
| Remote | `origin` (`https://github.com/racecraft-lab/Paddock.git`) |
| Package manager | `pnpm`, detected from `pnpm-lock.yaml` |
| SpecKit CLI | `specify` available at setup |
| Reviewability preset | `.specify/presets/speckit-pro-reviewability/` resolves for spec, plan, and tasks templates |

Reviewability setup gate evidence for the extracted SPEC-011 entry:

```json
{"mode":"setup","status":"pass","pass":true,"reviewable_loc":0,"production_files":0,"total_files":0,"primary_surface_count":1,"primary_surfaces":["docs/process"],"greenfield":false,"warnings":[],"blockers":[]}
```

The full-roadmap gate is not used for this setup because it measures unrelated historical roadmap text. The extracted SPEC-011 entry is the setup budget source.

### Constitution Validation

| Principle | Requirement | Verification |
|---|---|---|
| Zero-regression contract | Existing installs remain unchanged when `FEATURE_CRABTRAP_HONEYPOT` is off or config is missing | Focused flag-off/missing-config tests plus relevant guardrails |
| Optional-adapter discipline | CrabTrap is operator-specific, disabled by default, and absent-safe | Tests prove absent binary/config does not write activity or break APIs |
| Test-first implementation | Failing tests for flag-off, config, valid fixture, malformed fixture, replay, signature, and unsafe fields precede implementation | RED/GREEN evidence in tasks and final report |
| Feature-flag discipline | Runtime behavior uses `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)` and no inline env checks | Feature-flag tests and guardrails |
| Data safety | No raw CrabTrap audit headers, bodies, cookies, tokens, query secrets, or provider payloads are persisted | Unsafe payload fixtures and activity-data assertions |
| Strict scope | Primary production file is `src/lib/crabtrap-adapter.ts`; no schema, scheduler, task-dispatch, OpenAPI, or broad UI work | Static guardrail plus Analyze pass |
| Human validation | Valid/malformed signed fixture replay plus flag-off and missing-config no-op proof is recorded | `specs/011-crabtrap-honeypot/.process/uat-runbook.md` |

## External Context

CrabTrap context was fetched during scaffold on 2026-06-24 and must be refreshed before Specify or Plan if implementation decisions depend on current upstream behavior.

- Official repository: `https://github.com/brexhq/CrabTrap`
- Official README: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/README.md`
- Official quickstart: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/QUICKSTART.md`
- Official design document: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/DESIGN.md`
- Official alerting docs: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/docs/alerting.md`
- Official config reference: `https://raw.githubusercontent.com/brexhq/CrabTrap/main/config/gateway.yaml.example`

Setup finding: official CrabTrap is an outbound HTTP/HTTPS agent proxy with audit logs, admin APIs, metrics, and denial alerting. The public docs do not define a generic webhook contract. They also state CrabTrap is not an inbound firewall or WAF. Therefore this workflow starts library-first and treats any runtime HTTP intake as a Clarify decision.

## Specification Context

| Field | Value |
|---|---|
| Spec ID | SPEC-011 |
| Name | CrabTrap Honeypot Adapter |
| Branch short name | `crabtrap-honeypot` |
| Feature directory | `specs/011-crabtrap-honeypot` |
| Status | In Progress - scaffold branch created |
| Priority | P2 |
| Dependencies | SPEC-008 |
| Enables | None |
| Tool count / tool names | N/A - not a tool-surface spec |

Roadmap scope:

- Add an operator-specific optional CrabTrap adapter.
- Validate Paddock-owned signed denial-summary fixtures.
- Write bounded `activities.type='security_intrusion_detected'` evidence for Paddock API and sandbox probes.
- Keep the feature disabled by default behind `FEATURE_CRABTRAP_HONEYPOT`.
- Missing CrabTrap binary/service and missing or invalid adapter signing config
  must be absent-safe.
- No schema migration, no OpenAPI contract change, and no scheduler/task-dispatch dependency.

Human-reviewed setup decisions:

- Use a library-first adapter boundary because official CrabTrap docs do not publish a generic webhook contract.
- Normalize Paddock-owned signed denial-summary fixtures, not raw audit rows,
  webhook payloads, admin API rows, transcripts, or provider payloads.
- Fail closed unless flag and config are valid.
- Surface accepted evidence through existing `activities` only.
- Require signature/replay/size validation for helper fixture intake.
- Use signed fixture UAT as the required validation target; live CrabTrap Docker is optional evidence.

## Phase 1: Specify

**When to run:** At feature start. Output: `specs/011-crabtrap-honeypot/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-011 CrabTrap Honeypot Adapter

Problem:
Paddock has resource governance and security activity surfaces, but it does not yet have a bounded optional adapter for CrabTrap security signals. The roadmap calls for CrabTrap evidence to become `security_intrusion_detected` activity rows without making CrabTrap required, without adding schema, and without touching scheduler/task-dispatch behavior.

Official CrabTrap context:
- CrabTrap is documented as an outbound HTTP/HTTPS proxy for AI agents, with audit logs, admin APIs, metrics, and denial alerting.
- Public docs do not define a generic webhook contract.
- CrabTrap may see cleartext request data, including sensitive headers/bodies, so Paddock must never persist raw audit rows, headers, bodies, cookies, tokens, query secrets, or provider payloads.

Primary users:
- Operators who want security probe or denied-request evidence surfaced in Paddock's existing activity stream.
- Maintainers who need a disabled-by-default optional adapter that cannot break installs when CrabTrap is absent.
- Reviewers who need proof that this spec stays isolated from scheduler, dispatch, schema, OpenAPI, and UI expansion.

User stories:
1. As an operator, when `FEATURE_CRABTRAP_HONEYPOT` is off or CrabTrap config is missing, Paddock records no CrabTrap activity and existing behavior is unchanged.
2. As an operator, when a valid signed denial-summary fixture is processed with the flag and config enabled, Paddock writes exactly one bounded `security_intrusion_detected` activity row.
3. As an operator, malformed, unsigned, stale, replayed, oversized, or unsafe payloads are rejected without writing activity evidence.
4. As a reviewer, I can confirm no schema migration, OpenAPI contract, scheduler/task-dispatch dependency, new panel, or raw audit persistence entered the slice.

Functional requirements must cover:
- A new `src/lib/crabtrap-adapter.ts` adapter module.
- Feature flag gating through `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)`.
- Explicit config validation and absent-safe no-op behavior.
- Denial-summary normalization with bounded fields: source, event id, signed/occurred timestamps, actor kind and optional keyed actor hash, decision, method, URL host/path, reason code, safe request hash, counts, signature, and workspace/project scope where Clarify approves it.
- Unsafe-field rejection for raw headers, bodies, cookies, Authorization, API keys, query secrets, provider payloads, and full CrabTrap audit rows.
- Signature, timestamp, replay, and max-size validation expectations for helper fixture intake.
- Activity write behavior using existing `activities` schema and existing DB helper patterns.
- Focused tests for flag off, config missing, valid fixture, malformed fixture, signature failure, replay/stale event, oversized payload, unsafe-field rejection, and activity write failure isolation.
- Human validation via signed fixture replay and inspection of activities.

Constraints:
- TypeScript 5 strict, Next.js 16 App Router, React 19, better-sqlite3, Vitest, pnpm.
- No new runtime dependency unless Plan proves built-in Node `crypto` is insufficient.
- No schema migration.
- No OpenAPI contract change; any private route, route headers, or live intake behavior belongs to a future ratified spec.
- No scheduler, task-dispatch, task-chain, runner, sandbox, GitHub sync, or harness-adapter dependency.

Out of scope:
- Public or generic webhook API.
- Polling CrabTrap admin APIs.
- Live CrabTrap Docker requirement for merge completion.
- New dashboard/panel or notification fanout.
- Raw audit persistence, raw transcript/payload capture, or secret storage.
- Automatic remediation, GitHub mutation, task terminal mutation, or successor selection.
```

### Specify Outputs

- [x] `specs/011-crabtrap-honeypot/spec.md`
- [x] `specs/011-crabtrap-honeypot/checklists/requirements.md`
- [x] Requirements checklist with no unresolved `[NEEDS CLARIFICATION]` markers.

### Specify Results

| Artifact | Status | Evidence |
|---|---|---|
| Feature specification | Complete | `specs/011-crabtrap-honeypot/spec.md` created with 18 functional requirements, 4 user stories, and 11 acceptance scenarios |
| Requirements checklist | Complete | `specs/011-crabtrap-honeypot/checklists/requirements.md` created with 16/16 items checked |
| G1 gate | Pass | `validate-gate.sh G1 specs/011-crabtrap-honeypot` returned `pass=true`, 0 markers |
| Clarification markers | Clear | Search found 0 active `[NEEDS CLARIFICATION]`, `[Gap]`, or `[CRITICAL]` markers in generated SPEC-011 artifacts |

## Phase 2: Clarify

**When to run:** After Specify. Maximum five questions per session.

### Clarify Session 1: Intake Boundary

```bash
$speckit-clarify

Focus on the SPEC-011 intake boundary.
Confirm implementation stays helper-only and record private runtime route or OpenAPI behavior as future-spec work.
Use the setup decision: "Use a library-first adapter boundary. Validate Paddock-owned signed denial-summary fixtures in `src/lib/crabtrap-adapter.ts`; leave any Paddock route, custom sender, or admin-polling integration to a future ratified spec because official docs do not publish a generic webhook contract."
```

#### Clarify Session 1 Results

| Question | Accepted Answer | Evidence | Artifact Impact |
|---|---|---|---|
| Helper-only vs route | SPEC-011 stays helper-only; no runtime route, webhook endpoint, OpenAPI entry, or API-parity ignore is added | Design concept and roadmap strict scope are library-first; official CrabTrap docs do not define a generic webhook contract; local API parity treats routes as contract surfaces | `spec.md` Clarifications, FR-005, FR-009, FR-014, Assumptions |
| Intake object | Use a Paddock-owned signed denial-summary fixture, not raw CrabTrap webhook/admin/audit rows | Current spec already requires normalized bounded summaries; CrabTrap can observe cleartext request details | `spec.md` user-story tests, key entities, assumptions |
| Feature flag | Register `FEATURE_CRABTRAP_HONEYPOT` centrally and gate through `resolveFlag` | `src/lib/feature-flags.ts` is the typed registry; Constitution and roadmap require feature-flag discipline | `spec.md` FR-002 and reviewability budget |
| API parity | No OpenAPI or parity-ignore change | No route is introduced in this slice | `spec.md` FR-014, SC-005 |
| Live CrabTrap integration | Defer private route, custom sender, admin polling, and notification fanout to a future CrabTrap architecture/follow-up spec | Roadmap Lane B and design concept reserve broader CrabTrap architecture work for future specs | `spec.md` assumptions and PR packet requirements |

Consensus: not required. The clarify executor reported no unresolved items.

### Clarify Session 2: Signature, Replay, And Size

```bash
$speckit-clarify

Focus on security validation.
Define the helper fixture signature scheme, timestamp tolerance, replay key, max payload size, malformed JSON behavior, and exact failure reason codes without adding route headers in SPEC-011.
Use the setup decision: "Require signature plus bounds for helper fixture intake: HMAC-SHA256 signature, timestamp/replay/size checks, and unsafe-field rejection."
```

#### Clarify Session 2 Results

| Question | Accepted Answer | Evidence | Artifact Impact |
|---|---|---|---|
| Signature scheme | Helper fixtures use HMAC-SHA256 over `v1:<timestamp>:<event_id>:<canonical_payload_sha256>` and carry `signature: "sha256=<hex>"`; `canonical_payload_sha256` hashes deterministic UTF-8 canonical JSON for the normalized denial summary excluding `signature` | Consensus aligned on HMAC-SHA256 and constant-time verification; parent synthesis chose repo-style `sha256=<hex>` and no route headers because SPEC-011 is helper-only | `spec.md` Clarifications, FR-009, CrabTrap Adapter Config |
| Future route headers | SPEC-011 reserves no runtime route headers; any future live-intake spec defines its own headers and must satisfy at least these controls | Spec-context consensus rejected speculative route/header design in a helper-only slice | `spec.md` Clarifications and Assumptions |
| Freshness and replay | Reject fixture timestamps outside +/-300 seconds; after signature verification and normalization, accepted evidence stores only `data.replay_key_hash = "sha256:<hex>"` from `source + "\0" + event_id + "\0" + occurred_at` | Consensus aligned on a 5-minute replay window and hashed replay identity; no schema table is added in this slice | `spec.md` Clarifications, Replay Identity, Edge Cases |
| Size and malformed JSON | Raw fixture input is limited to 16 KiB UTF-8 before JSON parse; oversized returns `payload_too_large`; malformed JSON returns `malformed_json`; neither writes activity | Codebase and domain consensus support pre-parse size guarding for this small helper payload | `spec.md` FR-010, Edge Cases, UAT runbook |
| Failure-code order | Closed `crabtrap_intake_failure_code.v1` first-match order: `feature_disabled`, `config_missing`, `config_invalid`, `payload_too_large`, `malformed_json`, `payload_schema_invalid`, `signature_missing`, `timestamp_missing`, `timestamp_invalid`, `timestamp_stale`, `signature_invalid`, `unsafe_field_present`, `unsupported_decision`, `unsupported_method`, `replay_detected`, `activity_write_failed` | Parent synthesis chose security-first ordering after three analyst recommendations differed on exact precedence | `spec.md` Clarifications, FR-010, FR-012 |
| Unsafe diagnostics | Hard reject forbidden raw fields/keys or secret-like values at any depth as `unsafe_field_present`; diagnostics expose only bounded field path/category and never raw values, matched substrings, or raw secret hashes | Consensus agreed hard rejection is required because CrabTrap may observe cleartext request data | `spec.md` FR-008, FR-012, SC-004 |

Consensus: Round 1 used `codebase-analyst`, `spec-context-analyst`, and `domain-researcher`. Outcome was MODIFY for Q1/Q4/Q5 and AGREE for Q2/Q3; parent synthesis accepted the common security posture, removed speculative route headers, selected repo-style signature formatting, and recorded deterministic validation order.

### Clarify Session 3: Normalized Payload Contract

```bash
$speckit-clarify

Focus on the normalized denial-summary payload.
Choose required/optional fields, URL host/path handling, actor/source identity, reason-code taxonomy, safe hashes/counts, and the list of forbidden raw fields.
Use the setup decision: "Normalize denial summaries first; do not store raw request/response headers or bodies."
```

#### Clarify Session 3 Results

| Question | Accepted Answer | Evidence | Artifact Impact |
|---|---|---|---|
| Required and optional fields | Use a flat, strict `crabtrap_denial_summary.v1` schema. Required fields: `schema_version`, `source`, `event_id`, `signed_at`, `occurred_at`, `decision`, `method`, `url_host`, `url_path`, `reason_code`, `safe_request_hash`, `denial_count`, `actor_kind`, `signature`. Optional fields: `source_instance_hash`, `actor_ref_hash`, context-approved `workspace_id`, context-approved `project_id`, `probe_kind`, `url_path_hash`, `distinct_host_count`, `distinct_path_count`, `distinct_actor_count`. Unknown fields are rejected. | Consensus aligned with existing strict allowlist validation patterns and SPEC-011's no-raw-audit boundary | `spec.md` Clarifications, FR-006, Key Entities |
| URL handling | Persist only lowercased `url_host` and parsed pathname `url_path`; reject raw/full URL, scheme, userinfo, query, fragment, CR/LF, blank host/path, and secret-like path values. `/` is allowed. `CONNECT` and `TRACE` are unsupported/deferred in this helper-only slice. | Codebase and domain consensus supported parsed URL reduction and explicit deferral of proxy-native `CONNECT` coverage | `spec.md` Clarifications, FR-007, FR-010, Edge Cases |
| Actor and source identity | Activity producer is always `crabtrap-adapter`; payload identity is bounded `source`, optional `source_instance_hash`, required `actor_kind`, and optional keyed `actor_ref_hash`. Raw actor IDs, user IDs, and emails are forbidden. Scope IDs are accepted only from approved adapter context. | Spec-context consensus rejected payload-trusted scope and payload-controlled producer identity | `spec.md` Clarifications, FR-008, Assumptions |
| Decision, method, and reason taxonomy | `decision` accepts only `deny`; method accepts `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`; reason codes are `static_rule_denied`, `llm_policy_denied`, `fallback_denied`, `ssrf_blocked`, `rate_limited`, `policy_denied`, and `unknown_denied`, with `policy_denied`/`unknown_denied` last-resort values. | Consensus preferred closed taxonomies and no raw vendor reason persistence | `spec.md` Clarifications, FR-010, FR-012 |
| Hashes and counts | Hash fields must be `sha256:<64hex>` over safe canonical inputs; `actor_ref_hash` must be keyed when derived from low-entropy actor identity; `replay_key_hash` is adapter-derived evidence only; count fields are safe integers from 0 through 1,000,000 inclusive. | Consensus aligned on safe hashes/counts and rejected accepting `replay_key_hash` from intake | `spec.md` Clarifications, Replay Identity, UAT runbook |

Consensus: Round 1 used `codebase-analyst`, `spec-context-analyst`, and `domain-researcher`. Outcome was MODIFY overall; parent synthesis accepted the common strict-schema posture, added consistent optional hash/count fields, required bounded actor kind, rejected unknown fields, kept scope context-approved, and deferred `CONNECT`/live-proxy behavior to a future CrabTrap architecture slice.

### Clarify Session 4: Activity Scope And Alerts

```bash
$speckit-clarify

Focus on where accepted evidence lands.
Decide whether activity rows are workspace scoped, project scoped, or facility/global when no task is implicated. Confirm that existing activities are enough for this spec and that alert/notification fanout is deferred unless existing helpers can be reused without scope expansion.
Use the setup decision: "Activities only. Write bounded `security_intrusion_detected` rows and rely on existing activity inspection surfaces."
```

#### Clarify Session 4 Results

| Question | Accepted Answer | Evidence | Artifact Impact |
|---|---|---|---|
| Activity event field | Use `activities.type='security_intrusion_detected'`; `kind` is not a schema column | `src/lib/schema.sql` defines `type`, and existing helpers insert activity classes through `type` | `spec.md` Clarifications, FR-011, Security Activity Evidence |
| Landing scope | Accepted evidence lands as `entity_type='workspace'`, `entity_id=workspace_id`, `workspace_id=workspace_id` when approved workspace context exists; otherwise it uses the real facility workspace row. Validated `project_id` stays only in bounded `data`. | Existing activity helper patterns and workspace filters are workspace-based; a `workspace_id=0` pseudo-global row would bypass normal scoped inspection | `spec.md` User Story 2, FR-011, Assumptions |
| Inspection surfaces | Existing `/api/activities` and Activity Feed are enough for SPEC-011 UAT and review | The setup decision says activities only, and the current app already exposes activity filtering/inspection | `spec.md` FR-014, SC-005, UAT runbook |
| Alerts and notifications | SPEC-011 creates no notification rows, default alert rules, or CrabTrap-specific fanout. Existing operator-created alert rules may passively evaluate activity `type`; fanout is deferred. | Design concept and current spec non-goals reject notification fanout in this slice; alerts are a separate product surface | `spec.md` Clarifications, FR-014, Assumptions, PR packet requirements |
| Replay dedupe lookup | Dedupe checks existing activities in the chosen workspace/facility landing scope for `type='security_intrusion_detected'` plus matching adapter-derived `data.replay_key_hash`; no cross-workspace scan or caller-only dedupe. | No migration is allowed, replay hash is already adapter-derived, and activity filters are workspace scoped | `spec.md` Replay Identity, Edge Cases, SC-002/SC-003 |

Consensus: not required. The clarify executor reported no unresolved items; parent synthesis accepted the recommended answers and corrected activity wording from `kind` to `type`.

### Clarify Session 5: UAT And Live CrabTrap Evidence

```bash
$speckit-clarify

Focus on human validation.
Confirm that required UAT is signed fixture replay for valid and malformed cases, flag-off no-op, missing-config no-op, and activity inspection. Decide whether live official CrabTrap Docker evidence is optional deploy evidence or a blocking requirement.
Use the setup decision: "Fixture UAT is required; live CrabTrap Docker is optional evidence."
```

#### Clarify Session 5 Results

| Question | Accepted Answer | Evidence | Artifact Impact |
|---|---|---|---|
| Live CrabTrap Docker evidence | Optional deploy evidence only. Required completion evidence is fixture UAT plus focused tests, guardrails, scope-control proof, and activity inspection. | Official CrabTrap docs do not publish a generic webhook contract, and the design concept already records live Docker as optional evidence | `spec.md` Clarifications, FR-016, SC-006; UAT runbook |
| Fixture UAT matrix | Required fixture UAT covers flag-off no-op, missing/invalid-config no-op, one valid signed fixture creating exactly one `activities.type='security_intrusion_detected'` row, and malformed, unsigned, stale, replayed, oversized, and unsafe fixtures creating zero activity rows. | Spec success criteria and UAT runbook already require these paths; no live route/poller cases are in scope | `spec.md` Clarifications, SC-001 through SC-003; quickstart/tasks input |
| No-raw-persistence proof | UAT must prove accepted activity `data` and rejection diagnostics contain no raw/full URLs, headers, bodies, cookies, Authorization values, tokens, query secrets, provider payloads, payload-controlled actor IDs, user IDs, emails, signing material, or full audit rows. The fixed row producer `actor='crabtrap-adapter'` is allowed. | Consensus aligned on OWASP/MITRE logging guidance and existing Paddock bounded diagnostic patterns; codebase consensus clarified the fixed actor-column nuance | `spec.md` SC-004, FR-012, FR-018; UAT runbook |
| Alert/notification validation | Preserve activities-only UAT. Existing operator-created alert rules may passively evaluate `activities.type`, but SPEC-011 adds and validates no CrabTrap-specific alert or notification fanout. | Session 4 already closed activity-only inspection; older roadmap wording was narrower clarified here to avoid scope expansion | `spec.md` Clarifications, FR-014; roadmap HITL wording |
| Scope-control closeout | Closeout must record diff or guardrail proof that no runtime route, webhook receiver, admin poller, custom sender, OpenAPI contract, migration, scheduler/task-dispatch path, UI panel, notification fanout, GitHub mutation, task terminal mutation, or successor-selection behavior entered the slice. | Existing guardrails already block CrabTrap markers until SPEC-011 owns its narrow production files; reviewability rules require explicit non-goal evidence | `spec.md` FR-018; Plan/Tasks/Analyze inputs |

Consensus: Round 1 used `codebase-analyst`, `spec-context-analyst`, and `domain-researcher`. Outcome was AGREE for activities-only UAT and AGREE/MODIFY for no-raw-persistence proof; parent synthesis accepted the stricter proof while preserving the fixed Paddock-owned activity actor.

### Clarify Results

| Artifact | Status | Evidence |
|---|---|---|
| G2 gate | Pass | `validate-gate.sh G2 specs/011-crabtrap-honeypot` returned `pass=true`, 0 markers |
| Clarification closure | Complete | Runtime boundary, signature scheme, payload fields, activity scope, alert/non-alert stance, and UAT requirements are recorded above |

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/011-crabtrap-honeypot/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node >=22, TypeScript 5 strict
- App: Next.js 16 App Router, React 19
- Database: SQLite through `better-sqlite3`
- Tests: Vitest for focused adapter/config/activity behavior
- Package manager: pnpm only
- Crypto: prefer built-in Node `crypto`; add no runtime dependency unless strictly justified

## Constitution Constraints
- Preserve Zero-regression behavior with flag off and missing config.
- Treat CrabTrap as an optional adapter: disabled by default, absent-safe, no schema migration.
- Route all feature-flag checks through `resolveFlag`; no inline `process.env.FEATURE_*` reads.
- Use test-first implementation.
- Do not persist secrets or unsafe raw payloads.

## Architecture Notes
- Primary production module: `src/lib/crabtrap-adapter.ts`.
- Focused tests should live near existing `src/lib/__tests__/` patterns.
- Reuse existing `activities` table shape and insertion style.
- Reuse existing `tableExists`/DB safety patterns where appropriate.
- Update `src/lib/feature-flags.ts` only as needed to register `FEATURE_CRABTRAP_HONEYPOT`.
- Update `scripts/check-guardrails.mjs` only to allow SPEC-011-owned CrabTrap markers in the new module/tests/docs as needed.
- Keep `src/lib/task-dispatch.ts`, scheduler, OpenAPI, migrations, UI panels, and harness runtime files out of scope. Any future split must be ratified in a later spec.

## Design Concept Decisions To Preserve
- "Use a library-first adapter boundary."
- "Normalize Paddock-owned signed denial-summary fixtures, not raw audit rows."
- "Fail closed unless flag and config are valid."
- "Surface accepted evidence through existing `activities` only."
- "Require signature/replay/size validation for helper fixture intake."
- "Use signed fixture UAT as the required validation target; live CrabTrap Docker is optional evidence."

## Data Safety
- The official CrabTrap docs warn that the proxy can see cleartext request data. Plan must define rejection or reduction rules for raw headers, bodies, cookies, Authorization, API keys, query secrets, provider payloads, and full audit rows.
- Activity `data` must contain bounded summaries and hashes only.
```

### Plan Outputs

- `specs/011-crabtrap-honeypot/plan.md`
- `specs/011-crabtrap-honeypot/research.md` if upstream CrabTrap/admin API choices need rationale
- `specs/011-crabtrap-honeypot/data-model.md` for normalized event/config/activity data shape
- `specs/011-crabtrap-honeypot/quickstart.md` with fixture UAT commands

### Plan Results

| Artifact | Status | Evidence |
|---|---|---|
| `plan.md` | Complete | Generated helper-only implementation plan preserving no route, no migration, no OpenAPI, no UI, no notification fanout, and no scheduler/task-dispatch dependency |
| `research.md` | Complete | Recorded helper-only, built-in crypto, strict fixture contract, existing activities storage, adapter-derived replay identity, closed failure codes, and fixture-first UAT decisions |
| `data-model.md` | Complete | Defined denial summary, adapter config/context, replay identity, activity evidence, and intake result states |
| Contract schema | Complete | `contracts/crabtrap-denial-summary.v1.schema.json` parses as JSON and defines only the helper fixture shape |
| `quickstart.md` | Complete | Captures focused test, fixture UAT, scope-control, and optional live deploy evidence paths |
| G3 gate | Pass | `validate-gate.sh G3 specs/011-crabtrap-honeypot` returned `pass=true`, 0 markers |

## Phase 4: Domain Checklists

**When to run:** After Plan.

### Security Checklist

```bash
$speckit-checklist security

Focus on SPEC-011:
- Signature, timestamp, replay, and payload-size validation.
- Secret and unsafe-field rejection.
- No raw CrabTrap audit rows, headers, bodies, cookies, tokens, query secrets, or provider payload persistence.
- Feature flag and missing-config fail-closed behavior.
- Activity write failure isolation.
```

### Data-Integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-011:
- Normalized denial-summary schema.
- Exactly-one activity behavior for valid events.
- Duplicate/replay handling.
- Workspace/project/facility scope choice.
- No migration and compatibility with existing `activities` rows.
```

### Error-Handling Checklist

```bash
$speckit-checklist error-handling

Focus on SPEC-011:
- Malformed JSON/payloads.
- Missing config and flag-off no-op.
- Invalid signature, stale timestamp, replay, and oversized payloads.
- Unsafe-field rejection with bounded diagnostics.
- Database/activity insert failures that do not break existing app behavior.
```

### State-Management Checklist

```bash
$speckit-checklist state-management

Focus on SPEC-011:
- Feature-flag context and workspace flags.
- Replay/idempotency state for helper fixture intake.
- Activity scope and no-op state transitions.
- No scheduler/task-dispatch/task-chain state mutation.
```

### Checklist Results

| Domain | Status | Items | Gaps | Consensus | Evidence |
|---|---|---:|---:|---|---|
| Security | Complete | 24/24 checked | 0 | Not required | `specs/011-crabtrap-honeypot/checklists/security.md` validates signature, freshness, replay, payload-size, unsafe-field rejection, no-raw-persistence, flag/config no-op behavior, and activity write isolation |
| Data integrity | Complete | 24/24 checked | 0 | Not required | `specs/011-crabtrap-honeypot/checklists/data-integrity.md` validates normalized denial-summary schema, exactly-one activity behavior, duplicate/replay handling, workspace/project/facility scope choice, and no-migration compatibility with existing `activities` rows |
| Error handling | Complete | 24/24 checked | 0 | Not required | `specs/011-crabtrap-honeypot/checklists/error-handling.md` validates malformed JSON/payload handling, flag-off and missing/invalid-config no-op behavior, signature/timestamp/replay/size failures, unsafe bounded diagnostics, and activity write failure isolation |
| State management | Complete | 26/26 checked | 0 | Not required | `specs/011-crabtrap-honeypot/checklists/state-management.md` validates feature-flag/workspace flag context, replay/idempotency state, activity/no-op transitions, and no scheduler/task-dispatch/task-chain state mutation |

### Addressing Gaps

- Security: no unresolved `[Gap]` markers were produced, and the checklist executor reported no items requiring consensus.
- Data integrity: no unresolved `[Gap]` markers were produced, and the checklist executor reported no items requiring consensus.
- Error handling: no unresolved `[Gap]` markers were produced, and the checklist executor reported no items requiring consensus.
- State management: no unresolved `[Gap]` markers were produced, and the checklist executor reported no items requiring consensus.

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/011-crabtrap-honeypot/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate TDD-first tasks for SPEC-011 using:
- `specs/011-crabtrap-honeypot/spec.md`
- `specs/011-crabtrap-honeypot/plan.md`
- `docs/ai/specs/.process/SPEC-011-design-concept.md`

Task constraints:
- Start with failing Vitest tests for flag-off, missing config, valid fixture, malformed fixture, invalid signature, stale/replayed event, oversized payload, unsafe fields, and activity write failure isolation.
- Keep implementation bounded to `src/lib/crabtrap-adapter.ts`, focused tests, feature-flag registration, guardrail allowlist updates, and docs/fixture/UAT files approved by Plan.
- Mark any route, OpenAPI, UI, scheduler/task-dispatch, migration, or notification fanout work as out of scope unless Clarify and Plan explicitly ratified it.
- Include a reviewability checkpoint before implementation if planned files exceed the warning threshold.
- Include final tasks for fixture UAT, guardrails, typecheck/lint, PR packet, and roadmap/workflow status updates.

Non-goals to preserve:
- No schema migration.
- No OpenAPI contract change by default.
- No scheduler/task-dispatch dependency.
- No raw audit persistence.
- No live CrabTrap Docker blocking requirement unless Clarify changes it.
```

### Tasks Results

| Metric | Value | Evidence |
|---|---:|---|
| Total tasks | 32 | `specs/011-crabtrap-honeypot/tasks.md` |
| Task groups | 7 | Setup, Foundational, US1, US2, US3, US4, Polish/Verification |
| Parallel-marked tasks | 6 | `[P]` appears only on disjoint fixture, flag/config, guardrail, UAT, and PR packet skeleton tasks |
| G5 gate | Pass | `validate-gate.sh G5 specs/011-crabtrap-honeypot` returned `pass=true`, `task_count=32` |
| Reviewability task gate | Size-only block | `specs/011-crabtrap-honeypot/.process/reviewability/tasks-gate.json`; marker planning continues per autopilot rules |
| Marker plan | 5 markers | `foundation`, `us1`, `us2`, `us3`, `us4`; evidence in `specs/011-crabtrap-honeypot/.process/marker-plan/pr-marker-plan.json` |

## Atomicity Route

| Field | Value | Meaning |
|---|---|---|
| Route | `one-navigable-PR` | Advisory classifier did not require split-PR layer planning |
| Releasable | `true` | No destructive migration or concurrency-sensitive release warning was detected |
| Signals | `context:flag-system:guarded-cutover` | Decisive detector findings |
| Warnings | none | Release-safety warnings |

## Layer Plan

| Field | Value |
|---|---|
| Status | skipped |
| Reason | Atomicity route is `one-navigable-PR`; `split-PR` layer planner is not required |

## PR Marker Plan Evidence

| Field | Value |
|---|---|
| Schema | `pr-marker-plan.v1` |
| Status | planned |
| Fingerprint status | current |
| Source evidence | `specs/011-crabtrap-honeypot/.process/reviewability/tasks-gate.json`, `specs/011-crabtrap-honeypot/.process/reviewability/atomicity-route.json`, `specs/011-crabtrap-honeypot/.process/marker-plan/pr-marker-plan.json` |
| Ordered marker IDs | `foundation`, `us1`, `us2`, `us3`, `us4` |
| Review order | 1. foundation (`T001`-`T007`); 2. us1 (`T008`-`T011`); 3. us2 (`T012`-`T016`); 4. us3 (`T017`-`T021`); 5. us4 (`T022`-`T025`, folded polish `T026`-`T032`) |
| Marker checkpoints | pending |
| Warnings | `reviewability_size_warning`: reviewability sizing result is marker-planning input |
| Final marker split | pending |
| Packet validation | pending |
| PR mappings | pending |

## Phase 6: Analyze

**When to run:** After tasks generation.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-011 for consistency across:
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/.process/SPEC-011-design-concept.md`
- `specs/011-crabtrap-honeypot/spec.md`
- `specs/011-crabtrap-honeypot/plan.md`
- `specs/011-crabtrap-honeypot/tasks.md`

Focus on:
1. No drift from library-first strict scope unless Clarify/Plan records a ratified change.
2. No schema migration, OpenAPI contract, scheduler/task-dispatch, UI panel, GitHub mutation, task terminal mutation, or harness runtime dependency.
3. Every accepted event path is gated by flag/config/signature/replay/size/safety checks.
4. Raw CrabTrap audit rows and sensitive payload fields are rejected or reduced to hashes before persistence.
5. Tests cover flag-off, missing-config, valid, malformed, replay, signature, oversized, unsafe-field, and DB-write-failure cases.
6. Human UAT matches the fixture-first runbook and does not overclaim live CrabTrap integration.
```

### Analysis Results

| ID | Severity | Issue | Resolution | Status |
|---|---|---|---|---|
| A001 | HIGH | US2 acceptance wording implied accepted fixtures may contain URL query/fragment data | Updated `specs/011-crabtrap-honeypot/spec.md` to require normalized `url_host`/`url_path` only and reject or omit raw/full URL, query, and fragment content | Resolved |
| A002 | HIGH | Design concept retained setup-era raw actor/email-style payload example and old field names | Updated `docs/ai/specs/.process/SPEC-011-design-concept.md` to the ratified signed `crabtrap_denial_summary.v1` fixture shape | Resolved |
| A003 | MEDIUM | Roadmap/workflow wording implied webhook-secret/runtime-intake scope despite helper-only Clarify outcome | Updated `docs/ai/rc-factory-technical-roadmap.md`, `docs/ai/specs/.process/SPEC-011-workflow.md`, and `docs/ai/specs/.process/SPEC-011-design-concept.md` to say helper adapter, signed fixtures, adapter signing config, and future-spec route/custom-sender/admin-polling ownership | Resolved |

### Consensus Resolution Log

| # | Type | Question/Gap/Finding | Categories | Round | Outcome | Resolution | Analysts Used |
|---|---|---|---|---|---|---|---|
| 1 | Finding | Prior wording used webhook-secret/runtime-intake language after helper-only clarification | `[security]` | 2 | 3/3 high-confidence | Applied wording-only cleanup to remove private-route/header/runtime ambiguity from workflow and design concept; no code/task scope change required | codebase-analyst, spec-context-analyst, domain-researcher |

### Pre-Implement Confidence

📊 Confidence: 0.94

- Task understanding: 0.95
- Approach clarity: 0.94
- Requirements alignment: 0.95
- Risk assessment: 0.92
- Completeness: 0.95

## Phase 7: Implement

**When to run:** After Analyze passes.

### Implementation Progress

| Marker | Tasks | Status | Evidence |
|---|---|---|---|
| `foundation` | `T001`-`T007` | Complete | Commit `ae5552fb`; RED evidence and reviewability checkpoint recorded in `specs/011-crabtrap-honeypot/.process/uat-runbook.md` |
| `us1` | `T008`-`T011` | Complete | Commit `f74d3491`; feature-disabled and missing/invalid-config no-op behavior verified |
| `us2` | `T012`-`T016` | Complete | Commit `246771e5`; valid signed fixture writes one bounded activity row and replay duplicate is rejected |
| `us3` | `T017`-`T021` | In Progress | Stale timestamp and unsafe-field rejection hardening next |

### Implement Prompt

```bash
$speckit-implement

Implement SPEC-011 from `specs/011-crabtrap-honeypot/tasks.md`, `specs/011-crabtrap-honeypot/plan.md`, and `docs/ai/specs/.process/SPEC-011-design-concept.md`.

Approach:
1. Follow RED -> GREEN -> REFACTOR for every production behavior.
2. Keep feature flag OFF and missing config as complete no-op paths.
3. Use bounded normalized denial-summary fixtures.
4. Reject unsafe payloads before any persistence.
5. Write activity evidence only through existing `activities` schema and only when all gates pass.
6. Preserve reviewability: stop and split if implementation needs a route, OpenAPI, UI, migration, scheduler/task-dispatch, or notification fanout that was not ratified in Plan.

Minimum verification:
- Focused SPEC-011 Vitest tests.
- `pnpm guardrails` or the narrow guardrail suite that owns CrabTrap marker checks.
- `pnpm typecheck`.
- `pnpm lint`.
- Fixture UAT from `specs/011-crabtrap-honeypot/.process/uat-runbook.md`.
```

## Post-Implementation Checklist

- [ ] All generated tasks are complete in `tasks.md`.
- [ ] Focused SPEC-011 tests pass.
- [ ] Guardrails pass with SPEC-011 ownership updated.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Fixture UAT evidence is recorded.
- [ ] Reviewability diff gate is recorded.
- [ ] PR review packet is generated.
- [ ] Roadmap and workflow status are updated.

## Project Structure Reference

```text
src/lib/crabtrap-adapter.ts                    # expected primary implementation file
src/lib/__tests__/crabtrap-adapter.test.ts     # expected focused tests
src/lib/feature-flags.ts                       # feature flag registry only if needed
scripts/check-guardrails.mjs                   # SPEC-011 marker ownership update if needed
docs/ai/specs/.process/SPEC-011-design-concept.md
docs/ai/specs/.process/SPEC-011-workflow.md
specs/011-crabtrap-honeypot/SPEC-MOC.md
specs/011-crabtrap-honeypot/.process/uat-runbook.md
```

## Lessons Learned

Fill this after implementation. Record whether the library-first boundary was enough or whether a follow-up spec is needed for a private route, polling integration, notification fanout, or live CrabTrap Docker/operator deployment.
