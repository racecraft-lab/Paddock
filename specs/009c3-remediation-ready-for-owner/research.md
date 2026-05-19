# Research: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

## Decision: Reuse existing task-chain advancement rather than adding a remediation runner

**Rationale**: The spec's primary surface is scheduler/runtime task-chain
execution. `advanceTaskChain` and workflow templates already represent stage
progression, and `createTask` is the constitution-required side-effect path for
successors. Reusing them keeps activities, notifications, ticket counters, and
workspace behavior consistent with current Mission Control semantics.

**Alternatives considered**:

- Add a bespoke remediation runner. Rejected because it would duplicate task
chain behavior and pull formal runner/control-plane scope forward.
- Encode readiness only in documentation. Rejected because review/Aegis loops
and fail-closed readiness need automated verification.

## Decision: Keep `mission-control_dev_implementation` as PR owner and readiness subject

**Rationale**: Clarify resolved that the PR-producing dev task owns
`github_repo` and `github_pr_number` and is the only task that may reach
`ready_for_owner` for SPEC-009C3. Root issue traceability and helper stage
outputs remain linked through artifacts and lineage without moving PR ownership
to the root issue or owner-review helper.

**Alternatives considered**:

- Move `ready_for_owner` to `mission-control_owner_review`. Rejected because it
is not the PR-producing task for this slice.
- Move `ready_for_owner` to the root GitHub issue task. Rejected because it
blurs tracker truth and PR ownership.

## Decision: Represent review and Aegis failures as bounded loops or blocks

**Rationale**: Review `fix` and Aegis `rejected` must retain evidence and
prevent Aegis/owner readiness. The implementation should suppress stale static
successor advancement on failed verdicts, keep prior verdict/rejection evidence,
and allow corrected work to retry through existing task/activity/retry surfaces.

**Alternatives considered**:

- Treat failures as terminal. Rejected because the pilot must exercise realistic
correction and re-review.
- Let failures continue while marking evidence as blocked. Rejected because it
would make owner-ready state ambiguous.

## Decision: Use `quality_reviews` reviewer `aegis` as authoritative Aegis proof

**Rationale**: Existing quality-review API and status semantics already
represent reviewer-scoped approval/rejection. An `aegis_approval` artifact is
required durable evidence, but readiness must depend on the canonical
`quality_reviews` row with reviewer `aegis`, correct workspace scope, and the
PR-producing dev task as subject.

**Alternatives considered**:

- Use only a workflow successor output. Rejected because it bypasses the
existing review gate.
- Use only an artifact. Rejected because artifacts alone could spoof approval
without the canonical quality-review row.

## Decision: Store stage evidence in existing `task_artifacts`

**Rationale**: Required evidence classes are remediation plan, dev
verification, review verdict, Aegis approval, and aggregate governance evidence.
The existing artifact surface can store bounded inline JSON envelopes with
schema version `spec-009c3.v1`, task/workspace provenance, root issue context,
PR dev task context, and non-secret summaries.

**Alternatives considered**:

- Add dedicated evidence tables. Rejected because durable evidence UI and
formal run-state are later-spec work.
- Rely only on activities. Rejected because later review packets need
structured evidence with stable links.

## Decision: Treat governance evidence as advisory but readiness-blocking when non-allow

**Rationale**: SPEC-009C3 must verify no resource-policy violation, blocked
budget result, or blocked window result exists before readiness, while leaving
durable governance/run-state/claim authority to later roadmap specs. A compact
`governance_evidence` artifact can aggregate existing policy/event decisions
and expose a `readiness_blocked` boolean.

**Alternatives considered**:

- Add a durable governance decision row per stage. Rejected as too close to
later formal control-plane work.
- Only check feature flags. Rejected as too weak for readiness evidence.

## Decision: Use fixture-linked PR identity for automation and document live draft PR smoke as opt-in

**Rationale**: Automated validation must be deterministic and must not create,
update, merge, or reconcile real GitHub PRs. Fixture PR evidence is marked with
`pr_identity_source='fixture'`. Optional live smoke is operator-initiated,
draft-only, cleanup-aware, and stops at `ready_for_owner`.

**Alternatives considered**:

- Require real GitHub PRs in automated tests. Rejected due to external side
effects and CI brittleness.
- Never document live smoke. Rejected because the pilot needs an explicit
operator path when a real draft PR proof is deliberately wanted.

## Decision: Keep UI changes limited to existing accuracy corrections

**Rationale**: SPEC-009C3 does not create a dedicated remediation evidence UI.
If existing Task Board, PR link, Aegis status/badge, or owner notification
surfaces display C3 readiness/evidence, they must remain accurate and receive
real Playwright coverage.

**Alternatives considered**:

- Build a dedicated progress UI. Rejected as SPEC-009E scope.
- Ignore existing surfaces. Rejected because existing operator views must not
misrepresent readiness.
