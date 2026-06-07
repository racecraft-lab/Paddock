# SPEC-012B Harness-Gardening Drift Guards

## Summary

- Adds deterministic offline harness-gardening drift guards for repo-owned process artifacts.
- Emits stable JSON/Markdown reports with one non-mutating cleanup recommendation per finding.
- Wires a focused `harness-gardening` guardrails suite without replacing SPEC-012A repo knowledge checks.

## Verification

- `validate-gate.sh G7 specs/012b-harness-gardening-guards`
- `count-markers.sh all specs/012b-harness-gardening-guards`
- `reviewability-gate.sh diff origin/main...HEAD` passed with the recorded transition exception
- `node scripts/spec-012b/check-scope-control.mjs --self-test`
- `node scripts/spec-012b/check-scope-control.mjs`
- `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06` exited 1 as expected for hard fixtures
- Two full-corpus JSON runs matched byte-for-byte
- `pnpm guardrails -- --suite harness-gardening`
- `pnpm guardrails`
- `pnpm knowledge:index:check`
- `pnpm guardrails -- --suite repo-knowledge-index`
- `pnpm typecheck` under Node 22.22.2
- `pnpm lint` under Node 22.22.2
- `pnpm test` under Node 22.22.2
- `git diff --check`

## Notes

- Full fixture command exits nonzero by design because hard-drift/error fixtures are included.
- No runtime product behavior, migration, UI/API endpoint, scheduler/dispatch/claim/retry/sandbox/harness adapter path, live GitHub/Paddock mutation, auto-merge, or automatic `specs/**` cleanup is added.
- Local full verification should use Node v22.22.2; Node v26 failed native `better-sqlite3` rebuild during dependency install.
