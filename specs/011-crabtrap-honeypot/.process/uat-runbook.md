# SPEC-011 UAT Runbook

This runbook is scaffold guidance for the future implementation. It should be
updated with exact commands after `spec.md`, `plan.md`, and `tasks.md` exist.

## Foundation Marker Checkpoint

Date: 2026-06-24

Marker: `foundation` (`review_order=1`)

Scope completed in this checkpoint:

- Created the focused adapter RED suite at
  `src/lib/__tests__/crabtrap-adapter.test.ts`.
- Added the SPEC-011 fixture corpus at
  `src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts`.
- Added only a minimal `src/lib/crabtrap-adapter.ts` type/export stub. No
  adapter behavior is implemented in this marker.
- Registered `FEATURE_CRABTRAP_HONEYPOT` as a typed default-off flag.
- Added strict-scope and guardrail ownership entries for the approved
  adapter, test, fixture, and UAT files.

Pre-implementation reviewability checkpoint:

- Source evidence: `specs/011-crabtrap-honeypot/.process/reviewability/tasks-gate.json`.
- Marker plan status before implementation was a size-only task gate block
  routed into marker execution, with no subdivision required for `foundation`.
- Stop/split condition: stop and split before implementation if the slice
  adds or requires any runtime route, webhook receiver, OpenAPI contract,
  schema migration, scheduler/task-dispatch dependency, notification fanout,
  GitHub mutation, task terminal mutation, successor selection, UI panel, live
  CrabTrap Docker dependency, raw audit persistence, or a broader file/LOC
  expansion outside the accepted helper-only adapter budget.

## RED Evidence

Command:

```bash
direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts
```

Environment note:

- The linked worktree initially had no `node_modules`, so
  `pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` failed before
  Vitest with `Command "vitest" not found`.
- An offline frozen install first failed under Node v26.0.0 while rebuilding
  `better-sqlite3`. After `direnv allow`, the worktree used `.nvmrc` Node
  v22.22.2 and `direnv exec . pnpm install --frozen-lockfile --offline`
  completed successfully.

Expected RED result:

- Vitest executed `src/lib/__tests__/crabtrap-adapter.test.ts`.
- Result: 1 test file failed, 15 tests failed, exit code 1.
- Failure shape: real assertion failures against the minimal stub, which
  currently returns `{ status: "rejected", failureCode:
  "payload_schema_invalid" }` for all inputs.
- Representative failures:
  - Expected flag-off result `{ status: "noop", failureCode:
    "feature_disabled" }`, received `{ status: "rejected", failureCode:
    "payload_schema_invalid" }`.
  - Expected valid signed fixture result `{ status: "accepted" }`, received
    `{ status: "rejected" }`.
  - Expected oversized fixture failure code `payload_too_large`, received
    `payload_schema_invalid`.
  - Expected activity-write isolation result `{ status: "failed",
    failureCode: "activity_write_failed" }`, received `{ status: "rejected",
    failureCode: "payload_schema_invalid" }`.

## US1 Marker Checkpoint

Date: 2026-06-24

Marker: `us1` (`review_order=2`)

Scope completed in this checkpoint:

- Added adapter behavior for
  `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)` gating.
- Added feature-disabled, missing-config, and invalid-config no-op returns with
  zero activity writes.
- Kept payload parsing, HMAC verification, activity writes, replay detection,
  unsafe-field checks, URL normalization, routes, OpenAPI, migrations,
  scheduler/task-dispatch, notifications, UI panels, and CrabTrap runtime
  integration deferred to later markers.

TDD evidence:

- RED command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "feature_disabled|missing config|invalid config"`
- RED result: 1 test file failed; 3 US1 tests failed with real assertion
  errors against the foundation stub returning `payload_schema_invalid`.
- GREEN command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "feature_disabled|missing config|invalid config"`
- GREEN result: 1 test file passed; 3 US1 tests passed and 12 later-marker
  tests were skipped by the filter.

Focused file result:

- Command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts`
- Result: 1 test file failed as expected for later markers; 3 US1 tests passed
  and 12 US2/US3 tests failed against deferred payload/activity behavior.

Additional validation:

- `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false`
  passed.
- `direnv exec . pnpm exec eslint src/lib/crabtrap-adapter.ts src/lib/__tests__/crabtrap-adapter.test.ts src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts`
  passed.

## US2 Marker Checkpoint

Date: 2026-06-24

Marker: `us2` (`review_order=3`)

Scope completed in this checkpoint:

- Added deterministic canonical JSON hashing, SHA-256 helpers, HMAC-SHA256
  fixture verification, and constant-time digest comparison.
- Added strict `crabtrap_denial_summary.v1` normalization for the US2 accepted
  path: allowlisted fields, lowercased host, pathname-only URL path, bounded
  hashes/counts, supported decision/method/reason taxonomy, and approved
  workspace/project context checks.
- Added adapter-derived `data.replay_key_hash`, same-scope replay lookup, and
  one existing-schema `security_intrusion_detected` activity insert with fixed
  `actor='crabtrap-adapter'`.
- Confirmed the existing valid signed fixture and bounded activity assertions
  align with the implementation; no fixture or test edits were needed.

TDD evidence:

- RED command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "valid signed fixture|replayed event"`
- RED result: 1 test file failed; 2 US2 tests failed with real assertion
  errors against the US1 adapter returning `payload_schema_invalid`.
- GREEN command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "valid signed fixture|replayed event"`
- GREEN result: 1 test file passed; 2 US2 tests passed and 13 non-matching
  tests were skipped by the filter.
- REFACTOR result: reran the same focused command after cleanup; 1 test file
  passed, 2 US2 tests passed, and 13 tests were skipped.

Focused file result:

- Command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts`
- Result: 1 test file failed as expected for later markers; 13 tests passed and
  2 expected US3 hardening failures remained:
  - stale timestamp fixture currently accepts instead of returning
    `timestamp_stale`;
  - unsafe path fixture currently accepts instead of returning
    `unsafe_field_present`.

Additional validation:

- `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false`
  passed.
- `direnv exec . pnpm exec eslint src/lib/crabtrap-adapter.ts src/lib/__tests__/crabtrap-adapter.test.ts src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts`
  passed.

### US3 checkpoint - invalid and unsafe fixture rejection

Completed at: 2026-06-24T23:03:37Z.

Implementation notes:

- Enforced signed-fixture freshness against `config.clock` and the configured
  or default +/-300 second window before signature verification.
- Added post-signature unsafe-field/value detection with bounded
  `unsafe_field_present` diagnostics for raw URL, raw audit/provider payload,
  raw identity/email, auth/header/body/cookie/query secret, payload replay hash,
  and secret-like string categories.
- Kept rejected, replayed, malformed, oversized, unsupported, stale, unsafe, and
  activity-write-failed outcomes isolated from scheduler, dispatch, task,
  GitHub, notification, route, UI, OpenAPI, and migration surfaces.
- No fixture or test edits were needed.

TDD evidence:

- RED command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "stale fixture|unsafe fixture"`
- RED result: 1 test file failed; 2 US3 tests failed with real assertion
  errors because stale and unsafe fixtures returned `accepted`.
- GREEN command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts -t "stale fixture|unsafe fixture"`
- GREEN result: 1 test file passed; 2 US3 tests passed and 13 tests were
  skipped by the filter.
- REFACTOR result: full focused file rerun stayed green.

Focused file result:

- Command:
  `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts`
- Result: 1 test file passed; 15 tests passed.

Additional validation:

- `direnv exec . pnpm exec tsc -p tsconfig.spec-strict.json --pretty false`
  passed.
- `direnv exec . pnpm exec eslint src/lib/crabtrap-adapter.ts src/lib/__tests__/crabtrap-adapter.test.ts src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts`
  passed.

## Required Validation

1. Verify `FEATURE_CRABTRAP_HONEYPOT=false` records no CrabTrap activity and
   leaves existing behavior unchanged.
2. Verify missing or invalid CrabTrap adapter config records no activity and
   returns a bounded no-op or validation result.
3. Replay one valid Paddock-owned signed denial-summary fixture with the
   feature flag and config enabled.
   - The signed fixture uses flat schema `crabtrap_denial_summary.v1` with no
     unknown fields.
   - Helper fixture signatures use HMAC-SHA256 over
     `v1:<timestamp>:<event_id>:<canonical_payload_sha256>` and carry
     `signature: "sha256=<hex>"`.
   - Fixture timestamps outside +/-300 seconds of the adapter clock are stale.
   - Accepted methods are only `GET`, `HEAD`, `POST`, `PUT`, `PATCH`,
     `DELETE`, and `OPTIONS`; `CONNECT`/`TRACE` are deferred.
4. Inspect `activities` and confirm exactly one
   `security_intrusion_detected` row with bounded safe `data`.
   - The event class is stored as `activities.type='security_intrusion_detected'`.
   - The row producer may be the fixed Paddock-owned
     `actor='crabtrap-adapter'`; payload-controlled actor IDs, user IDs, and
     emails are forbidden.
   - Accepted evidence lands in the approved workspace activity scope, or the
     real facility workspace row when no approved workspace/project context
     exists.
   - Accepted evidence stores only `data.replay_key_hash = "sha256:<hex>"`,
     not raw event identity or raw signing material.
   - Replay dedupe is checked in the same workspace/facility landing scope by
     `type='security_intrusion_detected'` and `data.replay_key_hash`.
   - URL evidence stores only lowercased `url_host` and parsed `url_path`; no
     raw/full URL, scheme, userinfo, query, fragment, CR/LF, or blank host/path
     value is persisted.
   - Activity producer identity is `crabtrap-adapter`; raw actor IDs, user IDs,
     and emails are not persisted. Any actor reference hash is keyed if it
     represents low-entropy identity.
   - Count fields are nonnegative safe integers from 0 through 1,000,000
     inclusive.
5. Replay malformed, unsigned, stale, replayed, oversized, and unsafe-field
   fixtures.
   - Raw fixture input over 16 KiB UTF-8 is rejected before JSON parse.
   - Malformed JSON returns `malformed_json`.
   - Unknown fields, raw URL fields, secret-like path values, and payload-supplied
     `replay_key_hash` are rejected.
6. Confirm rejected fixtures write no `security_intrusion_detected` activity and
   expose only bounded diagnostics.
   - Expected failure-code vocabulary is `crabtrap_intake_failure_code.v1`.
   - Unsafe-field diagnostics include only bounded field path/category and no
     raw values, matched substrings, raw secret hashes, headers, bodies,
     cookies, auth material, query secrets, provider payloads, signing
     material, payload-controlled actor identifiers, or audit rows.
7. Confirm no raw URLs, raw headers, bodies, cookies, Authorization values,
   query secrets, provider payloads, raw actor identifiers, or full CrabTrap
   audit rows are persisted.
8. Confirm no CrabTrap-specific notification rows, default alert rules, new
   panels, or OpenAPI/report surfaces were added by this slice.

## Optional Evidence

Live official CrabTrap Docker evidence is optional deploy evidence for this
slice because the public CrabTrap docs do not define a generic webhook contract.
It is not a blocking completion gate. If an operator does run CrabTrap, record:

- CrabTrap version or image tag.
- Whether evidence came from admin audit export, denial alerting, a custom
  sender, or a manually normalized fixture.
- Why the source shape is safe to reduce into the SPEC-011 summary payload.

## Completion Rule

SPEC-011 is complete only when fixture UAT, focused tests, guardrails,
typecheck/lint, no-raw-persistence proof, scope-control evidence,
reviewability evidence, and roadmap/workflow status updates are recorded. Do
not claim live CrabTrap integration unless implementation actually uses and
verifies an official or operator-owned runtime source.

Clarify Session 1 chose helper-only intake for this slice. Do not add or test a
runtime route, webhook receiver, custom sender, admin poller, OpenAPI entry, or
API-parity ignore as SPEC-011 completion evidence.

## US4 + Polish Fixture UAT Checkpoint

Completed at: 2026-06-24T23:16:09Z.

Command:

```bash
direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts
```

Result:

- Passed: 1 test file, 19 tests.
- Evidence source: `src/lib/__tests__/crabtrap-adapter.test.ts` with fixtures in
  `src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts`.

Fixture UAT matrix:

| Case | Expected result | Persistence proof |
|---|---|---|
| Flag off | `noop`, `feature_disabled` | 0 `security_intrusion_detected` rows |
| Config missing | `noop`, `config_missing` | 0 rows |
| Config invalid | `noop`, `config_invalid` | 0 rows |
| Valid signed fixture | `accepted` | exactly 1 row |
| Malformed fixture | `rejected`, `malformed_json` | 0 rows |
| Unsigned fixture | `rejected`, `signature_missing` | 0 rows |
| Invalid signature fixture | `rejected`, `signature_invalid` | 0 rows |
| Stale fixture | `rejected`, `timestamp_stale` | 0 rows |
| Replayed fixture | `rejected`, `replay_detected` | no duplicate row; count remains 1 after first accepted event |
| Oversized fixture | `rejected`, `payload_too_large` | 0 rows; byte size exceeds 16 KiB before parse |
| Unsafe fixture | `rejected`, `unsafe_field_present` | 0 rows; diagnostics do not include `super-secret-token` |
| Nested unsafe fixture | `rejected`, `unsafe_field_present` | 0 rows; recursive diagnostics do not include raw secret values |
| Invalid signature with unsupported decision | `rejected`, `signature_invalid` | 0 rows; authenticity is checked before semantic rejection |
| Invalid signature with unsupported method | `rejected`, `signature_invalid` | 0 rows; authenticity is checked before semantic rejection |
| Stale `occurred_at` fixture | `rejected`, `timestamp_stale` | 0 rows; both signed and event timestamps are freshness checked |
| Unsupported decision fixture | `rejected`, `unsupported_decision` | 0 rows |
| Unsupported method fixture | `rejected`, `unsupported_method` | 0 rows |
| Activity write failed | `failed`, `activity_write_failed` | 0 rows; database error text is not leaked |

Accepted activity inspection:

- Row type: `security_intrusion_detected`.
- Entity scope: `entity_type='workspace'`, `entity_id=11`, `workspace_id=11`.
- Fixed actor: `crabtrap-adapter`.
- Bounded data includes `source`, `decision`, `method`, `url_host`,
  `url_path`, `reason_code`, `safe_request_hash`, `denial_count`,
  `actor_kind`, `actor_ref_hash`, `project_id`, and adapter-derived
  `replay_key_hash`.
- Accepted data assertions reject raw `event_id`, `signature`, fixture signing
  secret, `http://`, `https://`, and query marker `?`.

No-raw-persistence inspection:

- Rejection result assertions confirm unsafe diagnostics do not contain the
  fixture secret or `super-secret-token`.
- Accepted activity data persists reduced host/path fields only and does not
  persist raw/full URL, scheme, query, signing material, or raw event identity.
- The fixed activity actor `crabtrap-adapter` is allowed; payload-controlled
  actor IDs, user IDs, and emails remain forbidden.

Scope-control inspection:

- `git diff --name-only c65bb02b..HEAD -- src/app openapi.json src/components src/lib/migrations.ts docs/migrations src/lib/scheduler.ts src/lib/task-dispatch.ts src/lib/github.ts src/lib/github src/lib/notifications.ts src/lib/notifications src/lib/tasks.ts src/lib/task-terminal.ts src/lib/task-artifacts.ts src/lib/workflow-templates.ts src/lib/workflow-contracts` produced no output.
- `rg -n "CrabTrap|crabtrap|FEATURE_CRABTRAP_HONEYPOT|security_intrusion_detected" src/app src/components openapi.json src/lib/migrations.ts src/lib/scheduler.ts src/lib/task-dispatch.ts src/lib/github.ts src/lib/workflow-contracts` produced no matches.
- `rg -n "successor|terminal|ready_for_owner|done|notification|webhook|dispatch|scheduler|OpenAPI|openapi|migration|route" src/lib/crabtrap-adapter.ts src/lib/__tests__/crabtrap-adapter.test.ts src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts` produced no matches.
- `git diff --check c65bb02b..HEAD` passed.

Broad verification notes:

- `direnv exec . pnpm guardrails` passed 4 suites after tightening the
  SPEC-012B stale-status detector so ordinary historical prose containing
  "current SPEC-012B" is not treated as an active status pointer claim.
- `direnv exec . pnpm test` passed with 328 files, 3410 tests, 4 skipped, and
  84 todo after adding `FEATURE_CRABTRAP_HONEYPOT` to the Paddock/Product Line
  B cascade seed expectations.
- `direnv exec . pnpm typecheck`, `direnv exec . pnpm lint`, and
  `direnv exec . pnpm build` passed.
- Focused cascade and Product Line B seed regressions passed:
  `src/lib/__tests__/feature-flags.test.ts`,
  `src/lib/__tests__/feature-flag-service.test.ts`,
  `src/lib/__tests__/product-line-seed.test.ts`,
  `src/lib/__tests__/product-line-seed-cli.test.ts`,
  `src/lib/__tests__/paddock-seed/evidence.test.ts`, and
  `src/lib/__tests__/product-line-b-seed.test.ts`.
