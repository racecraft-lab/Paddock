# Quickstart: Pilot Evidence Surfaces

## Prerequisites

- Node >=22.
- pnpm via the repository lockfile.
- A Mission Control data directory with either a retained live pilot task or a disposable SPEC-009E UAT carrier task linked to retained issue #50 / PR #51 evidence.
- Stored SPEC-009D packet/source-map and smoke checklist references for the retained pilot trail.

## Implementation Verification

1. Install dependencies if needed:

   ```bash
   pnpm install
   ```

2. Run focused tests while implementing:

   ```bash
   pnpm test -- task-evidence
   ```

3. Run full static and unit gates:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

4. Run the real browser journey for task detail Evidence UI:

   ```bash
   pnpm test:e2e -- [task-detail-evidence-spec]
   ```

5. If Docker is available, run the UI journey against the existing Docker production build with a disposable data directory or volume and deterministic seed data. Record the command and data directory in the PR review packet.

## API Smoke

With the app running and an authenticated session/API context:

```bash
curl -sS http://127.0.0.1:3000/api/tasks/<task-id>/evidence
```

Expected response shape:

```json
{
  "schema_version": "task_evidence.v1",
  "task": {},
  "pilot_eligibility": {},
  "identity": {},
  "packet_artifacts": {},
  "smoke": {},
  "current_stage": {},
  "warnings": [],
  "deferrals": [],
  "source_map": []
}
```

Verify that non-pilot, local-only, partial-proof, stale, unavailable, redacted, quarantined, superseded, and cleaned-UAT cases return explicit states rather than empty success bodies.

## UI UAT

1. Open the task detail for the retained live pilot task, or seed a disposable UAT carrier task in a temp/scoped data directory if no retained live task row exists.
2. Confirm the Evidence section appears inside the Details tab for every opened task.
3. For retained issue #50 / PR #51 evidence, verify the operator can see:
   - eligibility state
   - GitHub issue/PR identity
   - packet JSON/Markdown references
   - smoke/checklist proof
   - current or archived stage
   - warnings
   - source-map pointers
   - all seven deferred categories
4. Capture Playwright screenshots for loaded evidence, missing/incomplete proof, route error or unavailable state when practical, and deferred categories.
5. Record SPEC-009E UAT in `docs/qa/pilot-smoke-checklist.md`.

## Disposable UAT Carrier Cleanup

If SPEC-009E creates fixture rows for UAT:

1. Use only a temp data directory or clearly scoped UAT workspace.
2. Export/backup fixture evidence before cleanup.
3. Record before/after counts.
4. Record owner and timestamp.
5. Remove only SPEC-009E fixture Mission Control rows after screenshots.
6. Retain GitHub issue #50 / PR #51 and checklist evidence.

No runtime cleanup control is added by SPEC-009E.
