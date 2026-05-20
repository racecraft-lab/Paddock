# Quickstart: Pilot Review Packet and Lifecycle Snapshot

## Prerequisites

- Worktree branch: `009d-pilot-review-lifecycle`.
- Package manager: `pnpm`.
- Existing Mission Control evidence for the self-hosting pilot is present in SQLite or test fixtures.
- `FEATURE_TASK_ARTIFACTS` is enabled for the relevant workspace when testing artifact publication.
- No GitHub token is required for packet assembly tests because SPEC-009D uses stored evidence only.

## Development Flow

1. Add failing Vitest tests for candidate proof and local-only lookalike exclusion.
2. Add failing Vitest tests for source-map coverage and JSON/Markdown consistency.
3. Add failing Vitest tests for deferrals and redaction/metadata-only packet evidence.
4. Implement `src/lib/pilot-review-packet.ts` as pure derivation plus artifact publication through `publishArtifact()`.
5. Update strict-scope config for the new TypeScript module.
6. Verify existing task artifact list/read routes can locate and inspect packet artifacts by `artifact_type` and artifact id.

## Focused Verification

```bash
pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts
pnpm test -- src/lib/__tests__/pilot-review-packet-artifacts.test.ts
pnpm typecheck
pnpm lint
```

## Full Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## Manual Review Evidence

- JSON artifact has `artifact_type="pilot_review_packet_json"` and `schema_version="spec-009d.packet.v1"`.
- Markdown artifact has `artifact_type="pilot_review_packet_markdown"` and names the JSON artifact id or hash.
- `source_map` covers every evidence-backed claim.
- Local-only lookalike candidate is excluded or incomplete.
- Deferred fields name SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, SPEC-014A, SPEC-014B, SPEC-014C, and SPEC-014D where applicable.
- No new migration, runtime dependency, packet-specific API route, dashboard, GitHub polling, claim authority, retry UI, sandbox lifecycle, adapter registry, or harness execution was introduced.

## Artifact Inspection

Use the existing task artifact surfaces:

- `GET /api/task-artifacts?artifact_type=pilot_review_packet_json`
- `GET /api/task-artifacts?artifact_type=pilot_review_packet_markdown`
- `GET /api/task-artifacts/[id]`

The exact artifact ids and hashes should be recorded in the Markdown summary, JSON packet, smoke checklist, and PR review evidence.
