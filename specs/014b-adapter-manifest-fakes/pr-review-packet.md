# SPEC-014B PR Review Packet

Generated: 2026-06-03T21:03:09Z

PR: https://github.com/racecraft-lab/Paddock/pull/76

<!-- speckit-pro-review-packet-source: specs/014b-adapter-manifest-fakes/pr-review-packet.md -->

## Summary

SPEC-014B adds a typed, synthetic-only harness adapter manifest contract and fake registry, a derived read-only runtime inventory API, and read-only Agents surface evidence. It intentionally does not add real harness execution, assignment controls, scheduler dispatch, lifecycle controls, retry controls, GitHub mutations, governance mutations, successor selection, or auto-merge behavior.

## Review Scope

Primary surface:

- `src/lib/harness-adapters/`

Secondary read-only projections:

- `src/app/api/agents/runtime-inventory/`
- `src/components/agents/RuntimeInventoryEvidence.tsx`
- `src/components/panels/agent-squad-panel.tsx`

Support artifacts:

- `scripts/spec-014b/check-harness-adapter-scope.mjs`
- `openapi.json`
- `src/app/api/index/route.ts`
- `docs/ai/repo-knowledge-index.json`
- `specs/014b-adapter-manifest-fakes/*`

## Recommended Review Order

1. `src/lib/harness-adapters/types.ts`
2. `src/lib/harness-adapters/fixtures.ts`
3. `src/lib/harness-adapters/evidence.ts`
4. `src/lib/harness-adapters/validation.ts`
5. `src/lib/harness-adapters/runtime-inventory.ts`
6. `src/app/api/agents/runtime-inventory/route.ts`
7. `src/components/agents/RuntimeInventoryEvidence.tsx`
8. `src/components/panels/agent-squad-panel.tsx`
9. `scripts/spec-014b/check-harness-adapter-scope.mjs`
10. Focused tests and docs artifacts

## Traceability

| Requirement Area | Evidence |
|------------------|----------|
| Two fake manifests | `fixtures.ts`, validation tests |
| Closed manifest validation | `validation.ts`, `validation.test.ts` |
| Sanitized evidence | `evidence.ts`, validation/runtime inventory tests |
| Visibility vs eligibility | `runtime-inventory.ts`, runtime inventory tests |
| Read-only API | route handler, route tests, OpenAPI/API index |
| Read-only Agents UI | `RuntimeInventoryEvidence.tsx`, panel integration tests |
| Boundary preservation | scope guard, route side-effect tests, repo knowledge guardrails |

## Verification Evidence

- Focused SPEC-014B Vitest: PASS, 5 files / 14 tests.
- Guard self-test and guard: PASS.
- Strict TypeScript mini-project: PASS.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm check:strict-scope`: PASS.
- Repo knowledge check/smoke/guardrails: PASS.
- `pnpm test`: PASS, 318 files passed / 33 skipped; 3257 tests passed / 3 skipped / 84 todo.
- `pnpm exec next build --webpack`: PASS; route manifest includes `/api/agents/runtime-inventory`.
- Playwright scaffold: PASS with one skipped test pending authenticated disposable workspace fixtures.

## Known Gaps And Bounded Exceptions

- Default `pnpm build` Turbopack fails in this linked worktree because `node_modules` points outside the project root. The webpack build is the verified app build for this branch.
- Manual browser UAT remains runbook-driven until authenticated disposable workspace fixtures are available.
- Whole-branch reviewability includes earlier SpecKit scaffold/design/checklist/task commits and exceeds the generic diff budget. This packet records the transition exception for the SPEC-014B harness-adapter contract slice; review the final implementation commit and this packet by the scope order above.

## UAT Runbook

Full runbook: `specs/014b-adapter-manifest-fakes/uat-runbook.md`

Required manual paths:

- Feature flag off shows disabled or blocked evidence without enabling dispatchability.
- Both fake manifests are visible through the same contract.
- Visible, unassigned, assigned, eligible, and blocked states are represented.
- Unsupported capabilities and unsupported or expired policies fail closed with stable reason-code evidence.
- Sanitized evidence rejection omits unsafe payloads and exposes only bounded metadata.
- The existing Agents surface shows read-only evidence and no launch, assignment, retry, lifecycle, scheduler, GitHub, governance, successor, or auto-merge controls.

## Rollback

No migration was added. Rollback is a normal git revert of the implementation commit(s).
