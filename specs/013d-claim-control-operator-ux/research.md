# Research: SPEC-013D Claim-Control Operator UX

## Decision: Keep fetch and refresh ownership in `TaskDetailModal`

**Rationale**: `src/components/panels/task-board-panel.tsx` already owns the task detail modal, Details tab, active product-line scope, task evidence fetch, stage-attempt fetch, and task-list refresh callback. Keeping claim-control route calls there lets the new UI reuse existing auth/session and scope path handling without introducing a global store or a second task-detail owner.

**Alternatives considered**:

- Put route calls inside `ClaimControlSection`: rejected because it would hide refresh orchestration and duplicate product-line scope handling.
- Add a new task detail tab: rejected by the design concept and spec because operators need claim controls near Evidence and Run state.
- Fold controls into `TaskStageAttemptsSection`: rejected because passive run evidence and mutating controls should remain separate.

## Decision: Add a bounded `ClaimControlSection` component

**Rationale**: The existing task detail file is already large. A focused section component keeps rendering, confirmation, receipt, disabled-state, and accessibility behavior testable without making `task-board-panel.tsx` harder to review. The component receives backend-derived state plus local submission state and emits action intents; the modal owns network operations.

**Alternatives considered**:

- Inline all controls in `task-board-panel.tsx`: rejected for reviewability and component-test ergonomics.
- Create a generic control-plane component: rejected as speculative generality for a single task-detail use case.

## Decision: Treat `claim_control.available_actions[]` as the sole action source

**Rationale**: SPEC-013C explicitly exposes a read-model extension with `authorization`, `available_actions`, `retry_eligibility`, `backoff`, `expected_state`, `last_operator_action`, and `last_sanitized_error`. Using that model avoids client recomputation of claim, scheduler, evidence, attempt, role, or task status semantics.

**Alternatives considered**:

- Infer retry/release/cancel availability from task status and stage attempts: rejected because it would duplicate backend authority and drift from SPEC-013C.
- Hide disabled backend actions: rejected because the operator must understand backend-provided unavailable reasons.

## Decision: Use a closed local copy map

**Rationale**: `src/lib/task-claim-control-types.ts` defines closed action, outcome, and sanitized error category vocabularies. A local map keyed by those closed codes gives operators readable labels while preventing arbitrary backend strings or raw diagnostics from becoming UI copy.

**Alternatives considered**:

- Humanize arbitrary snake_case fields: rejected because new backend strings could leak unsafe or confusing text.
- Show codes only: rejected because the operator journey should be understandable without API knowledge.

## Decision: Keep idempotency keys ephemeral and same-submission only

**Rationale**: `POST /api/tasks/[id]/claim-control` requires `Idempotency-Key` and stores only hashes. The UI should generate a fresh key for a confirmation attempt, retain it in memory while the request is in flight, and reuse it only after a network failure for the exact same task, action, stage, expected state, and request body. Every server response, changed body, changed expected state, task change, close, cancel, or new decision clears the key.

**Alternatives considered**:

- Generate a deterministic key from action fields: rejected because separate operator decisions could collide.
- Persist keys in session or local storage: rejected because raw keys must not persist or appear in artifacts.
- Generate a new key for network retry: rejected because it would not exercise the same-submission replay safety path.

## Decision: Use real Playwright acceptance plus supplemental Storybook

**Rationale**: Constitution XIV requires a real browser journey for changed user-facing UI. Existing task detail e2e tests show the preferred pattern: authenticate through the app, create disposable tasks through the API, seed deterministic DB rows only for existing backend state that the UI must display, restore flags, clean up rows in `afterAll`, attach screenshots, and export JSON fixture evidence. Storybook states are useful for visual review of component variants but do not replace Playwright.

**Alternatives considered**:

- Mock routes in Playwright: rejected because acceptance must exercise the running app and real route clients.
- Use component tests only: rejected by the real UI journey gate.
- Commit generated screenshots: rejected by the archive/evidence policy unless an explicit manifest-backed exception is needed.

## Decision: No new migration, backend route, or feature flag

**Rationale**: SPEC-013D is the UX adoption gate for SPEC-013C. Existing read/mutation routes, claim tables, idempotency table, and `FEATURE_TASK_CONTROL_PLANE` semantics are sufficient. The UI must stay additive and install-compatible.

**Alternatives considered**:

- Add a UI-specific API route: rejected because it would duplicate SPEC-013C contracts.
- Add a new client feature flag: rejected because the backend flag/read model already gates behavior.
- Add a persisted UI audit table: rejected because existing activity/idempotency evidence is authoritative.
