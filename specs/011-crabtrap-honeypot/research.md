# Phase 0 Research: SPEC-011 CrabTrap Honeypot Adapter

## Decision: Stay Helper-Only For SPEC-011

**Rationale**: The workflow and design concept found no public generic CrabTrap webhook contract. The clarified spec chose a Paddock-owned signed denial-summary fixture, not raw CrabTrap webhook payloads, admin API records, audit rows, or provider payloads. Keeping the first slice helper-only preserves optional-adapter discipline and avoids creating an unratified route/OpenAPI surface.

**Alternatives considered**:

- Private Next.js route: rejected for this slice because Clarify selected helper-only intake and no route headers are reserved.
- Admin API polling: rejected because it would couple Paddock to live CrabTrap runtime and raw audit surfaces.
- Custom sender integration: deferred to a future CrabTrap architecture/follow-up spec.

## Decision: Use Node Built-In Crypto

**Rationale**: Node >=22 provides SHA-256 hashing, HMAC-SHA256, and constant-time comparison through built-in `crypto`. This satisfies the fixture signature contract without adding a runtime dependency or supply-chain surface.

**Alternatives considered**:

- Add a signing/JOSE dependency: rejected because the contract is HMAC-SHA256 only.
- Use a transitive crypto helper: rejected by dependency hygiene and direct-import rules.

## Decision: Use Strict Flat Fixture Contract

**Rationale**: CrabTrap can observe cleartext request data. A flat allowlisted `crabtrap_denial_summary.v1` input makes unknown-field rejection, unsafe-field scanning, and no-raw-persistence proof straightforward.

**Alternatives considered**:

- Accept raw CrabTrap audit/admin rows: rejected because they may include headers, bodies, cookies, tokens, query secrets, actor identifiers, and provider payloads.
- Accept nested vendor payloads and reduce them later: rejected because unsafe fields must be rejected before persistence.

## Decision: Reuse Existing Activities Storage

**Rationale**: The spec requires no schema migration and existing `/api/activities` plus Activity Feed inspection are sufficient. Accepted evidence lands in an existing workspace/facility activity row with `activities.type='security_intrusion_detected'` and bounded `data`.

**Alternatives considered**:

- Add a CrabTrap evidence table: rejected by schema-free scope.
- Add notification rows or default alert rules: rejected because fanout is deferred.
- Store accepted project scope as the activity entity: rejected because accepted evidence remains workspace/facility scoped and `project_id` is bounded data only.

## Decision: Derive Replay Identity In The Adapter

**Rationale**: A replay key derived from `source + "\0" + event_id + "\0" + occurred_at` keeps replay detection schema-free while avoiding raw event identity persistence. The adapter checks existing activities in the selected workspace/facility landing scope for matching `type` and `data.replay_key_hash`.

**Alternatives considered**:

- Accept `replay_key_hash` from the fixture: rejected because replay identity must be adapter-derived.
- Add a durable replay table: rejected by no-migration scope.
- Cross-workspace replay scan: rejected because the clarified scope requires workspace/facility scoped lookup.

## Decision: Closed Failure Code Vocabulary

**Rationale**: A closed lower-snake failure vocabulary gives tests, diagnostics, and UAT stable assertions without leaking raw values. First-match order is defined in the spec and must be preserved by implementation.

**Alternatives considered**:

- Free-form error strings: rejected because they risk leaking sensitive data and make UAT brittle.
- Throwing boundary errors to callers: rejected because invalid CrabTrap evidence must not break unrelated application flows.

## Decision: Fixture UAT Is Required, Live CrabTrap Is Optional

**Rationale**: SPEC-011 validates the Paddock helper boundary, not live CrabTrap deployment. Required completion evidence is focused tests, guardrails, fixture UAT, activity inspection, no-raw-persistence proof, and scope-control proof. Live official CrabTrap Docker evidence may be appended only as optional deploy evidence.

**Alternatives considered**:

- Require live CrabTrap Docker before merge: rejected because no runtime integration is introduced in this slice.
- Claim live integration from normalized fixture replay: rejected because the slice does not consume official runtime sources.
