# Research: Harness-Gardening Drift Guards

## Decision: Keep guard execution offline and repo-artifact-only

**Rationale**: The spec requires deterministic CI-safe output. Checked-in PRD, roadmap, workflow ledgers, `.specify/memory`, active specs, repo knowledge index, package declarations, guard configuration, and fixtures are stable reviewable inputs. Live HAL, GitHub, deployment, database, service, scheduler, and runtime state would make the guard nondeterministic and would widen SPEC-012B beyond process/tooling scope.

**Alternatives considered**:

- Live HAL/GitHub/deployment inspection: rejected because it violates FR-003 and G3.
- Optional live-inspection mode: deferred because v1 has no approved apply or operator-live surface.

## Decision: Use Node.js >=22 built-ins for v1 scripts

**Rationale**: Node built-ins cover filesystem traversal, POSIX path normalization, crypto hashing, JSON parsing, child-free report generation, and deterministic sorting. Avoiding new dependencies keeps the guard reviewable and preserves supply-chain discipline.

**Alternatives considered**:

- Add a schema/CLI helper dependency: rejected for v1 unless implementation later proves built-ins cannot satisfy the contract.
- Implement in TypeScript runtime modules under `src/**`: rejected because this is process tooling, not app runtime behavior.

## Decision: Use fixture-first tests as the primary oracle

**Rationale**: Small checked-in fixtures make hard drift, warning-only drift, dedupe, sanitized errors, owner derivation, and fresh-zero-finding cases deterministic. The live repo can be checked by the command, but tests must not depend on incidental current repository state as their primary oracle.

**Alternatives considered**:

- Test only against the live repo: rejected because current repo state changes across specs and can create false confidence.
- Copy historical snapshots wholesale: rejected because full snapshots increase review burden; reduced historical-shape fixtures are enough.

## Decision: Stable IDs use normalized tuple hashing

**Rationale**: `stable_finding_id = hg_<sha256 first 20 hex>` over normalized `drift_class + source_path + anchor + owner_key` gives deterministic dedupe while retaining human-readable tuple fields in each finding.

**Alternatives considered**:

- Full-payload content hash: rejected because evidence aggregation changes would churn IDs.
- Sequential IDs: rejected because ordering changes would churn IDs.

## Decision: Emit a deterministic report envelope plus recommendation items

**Rationale**: A report envelope lets CI summarize counts, detector statuses, sanitized errors, and recommendations in one artifact. Recommendation items use a canonical non-mutating Paddock cleanup-task draft and optional export-only GitHub issue draft, enabling future explicit apply mode without live mutation in v1.

**Alternatives considered**:

- Human-readable Markdown only: rejected because guardrails and future import paths need machine-readable output.
- Direct Paddock task or GitHub issue creation: rejected because v1 is recommendation-only.

## Decision: Use closed sanitized error codes

**Rationale**: A closed enum gives stable CI behavior and prevents reports from leaking absolute paths, stack traces, environment values, token-like content, raw artifact contents, credentials, or matched secret substrings.

**Alternatives considered**:

- Raw exception messages: rejected because they can leak host paths or sensitive values.
- Open-ended string categories: rejected because they make fixtures and downstream review less deterministic.

## Decision: Wire a separate harness-gardening guardrails suite

**Rationale**: SPEC-012A owns `pnpm knowledge:index:check` and the repo knowledge index suite. SPEC-012B should add `pnpm guardrails -- --suite harness-gardening` while preserving `pnpm guardrails -- --suite repo-knowledge-index`.

**Alternatives considered**:

- Extend `knowledge:index:check` directly: rejected because it would blur SPEC-012A ownership.
- Keep the guard standalone only: rejected because shared guardrails should expose this process check.

## Decision: External OpenAI sources inform vocabulary and safety posture only

**Rationale**: The OpenAI Harness Engineering article, retrieved during Plan on 2026-06-06 from `https://openai.com/index/harness-engineering/`, reinforces repo knowledge as a system of record, short maps over monolithic instructions, mechanical freshness/link/ownership checks, and recurring doc gardening. The OpenAI Symphony announcement, retrieved during Plan on 2026-06-06 from `https://openai.com/index/open-source-codex-orchestration-symphony/`, and the Symphony SPEC, retrieved during Plan on 2026-06-06 from `https://github.com/openai/symphony/blob/main/SPEC.md`, provide workspace/tracker/reconciliation/validation vocabulary and explicit safety posture context.

**Alternatives considered**:

- Fetch OpenAI sources during normal guard execution: rejected because default execution must be offline and repo-artifact-only.
- Import Symphony orchestration behavior: rejected because SPEC-012B is not a scheduler, tracker client, workspace runner, or live control plane.
