# Paddock Seed Predeploy Runbook

## Scope

SPEC-009B seeds Paddock as Product Line A and verifies readiness. It does not unlink GitHub repos, delete tickets, stop OpenClaw runtime agents, mutate cron jobs, create pilot tasks, claim work, dispatch agents, launch runners, create sandboxes, or merge pull requests.

SPEC-010A keeps the legacy `seed:paddock` command as a compatibility wrapper over the generic product-line seeder. The wrapper delegates to `docs/ai/product-lines/paddock.yaml` and emits the generic product-line evidence model, including `schema_version:"product-line-seed-result-v1"`, config-owned snapshots, `preserved_operational_state.subsurfaces`, redaction proof, existing-target refusal evidence, and no-mutation proof for blocked paths.

## Preflight

Run preflight before any apply attempt. For new automation, prefer the compatibility wrapper command so Paddock predeploy checks exercise the generic seeder path:

```bash
pnpm seed:paddock -- \
  --db .data/paddock.db \
  --mode preflight \
  --operator-evidence src/lib/__tests__/paddock-seed/fixtures/operator-evidence.json \
  --json
```

Expected clean-target result: `ok: true`, `status: "ready"`, `mutation_status: "not_mutated"`.

Expected dirty-target result: exit code `2`, `status: "blocked_preflight"`, `mutation_status: "not_mutated"`, redacted residue summaries, and this cleanup checklist path.

## Cleanup Checklist

1. Take a backup/export first of the Paddock SQLite database, current GitHub-linked task rows, OpenClaw gateway config, and issue-sync cron state.
2. Confirm the target cleanup explicitly. The operator must record explicit operator confirmation before destructive cleanup of any FocusEngine Paddock project, ticket, repo sync, GitHub sync/triage cron job, OpenClaw product-line binding, or `ssh hal` state. Use legacy alias `ssh hall` only if that is still configured locally.
3. Remove only non-Paddock residue. Keep `racecraft-lab/Paddock` issue sync metadata intact because SPEC-009B re-homes it to QA triage/intake.
4. Treat FocusEngine cleanup as destructive cleanup. Unlink the FocusEngine GitHub repo from Paddock, undo issue sync, remove FocusEngine tickets/projects from Paddock, and disable/remove FocusEngine GitHub sync or issue-triage cron jobs only after the backup/export and confirmation are complete.
5. Do not delete OpenClaw runtime agents merely because their names reference FocusEngine. Live verification on `ssh hal` found FocusEngine runtime identities such as `focusengine-macos-dev`, `focusengine-macos-research`, `focusengine-macos-planner`, `focusengine-macos-review`, `focusengine-macos-ui`, and `focusengine-macos-devsecops`; these may remain as OpenClaw-managed runtime inventory unless a separate operator decommission is explicitly approved.
6. Generalize any retained OpenClaw runtime inventory before deployment. Using the current Paddock Agents detail surfaces (Overview, Files, Tools, Models, Channels, Cron, SOUL, Memory, Tasks, Config, Activity), remove FocusEngine/macOS/product-specific mission text from workspace files such as `agent.md`, `identity.md`, `soul.md`, `WORKING.md`, `MEMORY.md`, `TOOLS.md`, `AGENTS.md`, `MISSION.md`, and `USER.md`. Prefer role/domain labels such as `platform-dev`, `platform-research`, `platform-planner`, `platform-review`, `platform-ui`, and `platform-devsecops`; preserve stable OpenClaw ids/session keys unless a safe rename path is verified separately.
7. Keep generalized runtime inventory visible but not work-eligible. SPEC-014B
   provides read-only runtime inventory through `/api/agents/runtime-inventory`;
   retained OpenClaw agents must still stay offline or otherwise excluded from
   autonomous routing unless a later OpenClaw/external-adapter lane explicitly
   assigns and gates them. They must have zero Paddock
   `project_agent_assignments` rows, zero active/assigned Paddock tasks, and no
   owned GitHub sync/triage cron job.
8. Verify `ssh hal` and OpenClaw after cleanup. Check the Paddock service, `openclaw-gateway.service`, issue-sync cron definitions, and gateway cron/agent configuration. The known FocusEngine GitHub automation to remove or disable is the FocusEngine GitHub Sync cron job (`mc-mnwak9jn`) and FocusEngine Issue Triage cron job (`mc-mnwakq8y`) if those ids still exist on the target.
9. Run post-cleanup verification with preflight again. The preflight output must be clean before `apply` mode is allowed. Clean evidence means only `racecraft-lab/Paddock` issue sync remains active; retained OpenClaw runtime inventory alone is not a SPEC-009B cleanup blocker when it is generalized, unassigned, not work-eligible, and free of FocusEngine GitHub automation.

## Apply

Run apply only after clean preflight:

```bash
pnpm seed:paddock -- \
  --db .data/paddock.db \
  --mode apply \
  --json
```

Expected result: `ok: true`, `status: "seeded"`, `mutation_status: "applied"`, `config.path:"docs/ai/product-lines/paddock.yaml"`, six departments, six required role assignments, nine workflow templates, three governance rows, canonical `PILOT_PADDOCK_E2E`, and zero pilot task/chain records.

## Verify

Run verify after one apply and again after a second apply:

```bash
pnpm seed:paddock -- \
  --db .data/paddock.db \
  --mode verify \
  --json
```

Expected result: `ok: true`, `status: "verified"`, `mutation_status: "verified"`, stable identity evidence, all canonical Paddock feature flags enabled, all disallowed runner/sandbox/auto-merge/task-control flags disabled or absent, matching `snapshot_before` and `snapshot_after` or observed-state evidence where applicable, zero new pilot tasks, zero successor records, zero per-agent seed tasks, zero claims, zero dispatched state, zero runner rows, zero sandbox rows, and zero auto-merge markers.

## Generic Evidence Compatibility

The predeploy gate should treat the wrapper output as generic product-line evidence:

- `entrypoint:"seed:paddock"` identifies the compatibility wrapper.
- `config.path:"docs/ai/product-lines/paddock.yaml"` proves the wrapper used the canonical generic config.
- `schema_version:"product-line-seed-result-v1"` identifies the stable result envelope.
- `snapshot_before`, `snapshot_after`, and `preserved_operational_state.subsurfaces` are the review surface for existing-target apply, blocked-preflight, and no-mutation proofs.
- `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING` remains the required refusal for existing-target apply without `--allow-existing`.
- `detection_only_no_automatic_deletion_or_unlinking` remains the residue policy; cleanup is an operator decision outside the seeder.

## Validation Evidence

- `pnpm exec vitest run src/lib/__tests__/paddock-seed/redaction.test.ts src/lib/__tests__/paddock-seed/seed.test.ts src/lib/__tests__/paddock-seed/preflight.test.ts src/lib/__tests__/paddock-seed/evidence.test.ts src/lib/__tests__/paddock-seed/guardrails.test.ts`: passed on 2026-05-07 with 5 files and 22 tests.
- `pnpm exec vitest run src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flag-service.test.ts tests/integration/feature-flag-matrix.test.ts src/lib/__tests__/paddock-seed/redaction.test.ts src/lib/__tests__/paddock-seed/seed.test.ts src/lib/__tests__/paddock-seed/preflight.test.ts src/lib/__tests__/paddock-seed/evidence.test.ts src/lib/__tests__/paddock-seed/guardrails.test.ts`: passed on 2026-05-07 with 8 files and 77 tests.
- `pnpm typecheck`: passed on 2026-05-07.
- `pnpm lint`: passed on 2026-05-07.
- `pnpm build`: passed on 2026-05-07 after rerunning outside the sandbox so Next.js could fetch configured fonts.
- `pnpm test:e2e`: passed on 2026-05-07 after rerunning outside the sandbox so Playwright could bind the local web server; 646 tests passed.
- `pnpm test`: ran on 2026-05-07; the full suite stopped on the existing local daemon socket timeout in `src/lib/__tests__/mc-provisioner-daemon.test.ts`. A single-test rerun failed the same way. SPEC-009B focused suites and feature-flag regressions passed as listed above.
- Full seed twice plus verify-mode evidence on a clean eligible target: covered by `src/lib/__tests__/paddock-seed/evidence.test.ts`; two apply runs against a clean in-memory target produce the same identity hash and `verifyPaddockSeed()` returns `ok: true`, `status: "verified"`. Verify mode also fails when any required Paddock feature flag is missing or any explicitly disallowed runner/sandbox/auto-merge/task-control flag is enabled.
- Workflow contract import/export evidence: `pnpm workflow-contract import --db /private/tmp/spec009b-workflow.db --contract docs/ai/workflows/paddock/workflow-contract.yaml --mode apply` and the matching export passed on 2026-05-07; exported hash `workflow-contract-hash-v1:sha256:4e485c97c7136a79619c362ba7de26cd9439ea49f60ea54a2f14414a7a287c92`.
