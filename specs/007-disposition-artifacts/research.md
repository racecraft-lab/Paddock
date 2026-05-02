# SPEC-007 Research

**Feature**: SPEC-007 Disposition Logging and Task Artifact Store
**Date**: 2026-05-01
**Status**: Phase 0 complete — all `[NEEDS CLARIFICATION]` resolved by Sessions 1/2/3 baked into spec.md.

This document records the load-bearing technical decisions, with rationale and rejected alternatives. Decisions are pre-anchored by the spec; research.md captures the "why" for downstream review.

---

## Decision 1: Atomic file promotion uses `fs.link()`, not `fs.rename()`

**Decision**: File-backed artifact promotion from `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>` to the canonical `<sha256>.<ext>` path uses Node `fs.link()` (POSIX `link(2)` semantics).

**Rationale**:
- `fs.link()` is atomic AND fails with `EEXIST` when the destination exists. This gives us a free same-content concurrency arbiter: the loser sees `EEXIST` and runs the FR-023 verification path (re-read, sha256 compare, insert row pointing at same canonical file).
- `fs.rename()` is atomic but **silently overwrites** any existing destination on POSIX. Two concurrent writers would clobber each other and we would never detect the race.
- Hash collisions across distinct content are computationally negligible at sha256, so the EEXIST branch is *always* a same-content race in practice; hash mismatch in that branch indicates filesystem corruption (FR-023 returns 500 + writes `artifact_hash_verification_failed`).

**Alternatives considered**:
- `fs.rename()` with a pre-flight `fs.access(canonical)` check: not atomic — TOCTOU window between access and rename allows clobbering.
- `O_EXCL | O_CREAT` open of the canonical file directly: writes the file in place, no temp; can't fsync the staging buffer on a separate fd, harder to abort cleanly on validation failure mid-write.
- Linux-only `linkat(AT_SYMLINK_FOLLOW)`: same primitive, less portable; Node's `fs.link` is the cross-platform wrapper.

**Source**: `man 2 link` (POSIX); FR-022, FR-023 in spec.md.

---

## Decision 2: Temp staging under `<DATA_DIR>/artifacts/.../tmp.*`, never `/tmp`

**Decision**: The temp file MUST live in the same directory tree as the canonical file (i.e., under `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.tmp.*`). NEVER in `/tmp` or any tmpfs path.

**Rationale**:
- Production deploys use `docker-compose.hardened.yml` with `read_only: true` on the container filesystem and a named volume mounted at `/app/.data`. `/tmp` inside the container is a separate filesystem (or read-only).
- `fs.link()` requires the source and destination to live on the same filesystem. Cross-filesystem links return `EXDEV` ("invalid cross-device link"). The whole atomic-promotion contract collapses if the temp lives elsewhere.
- Hidden-prefix (`.tmp.`) plus high-entropy suffix (`.<sha256>.<pid>.<rand>`) prevents listing collisions and makes orphan repair easy: the FR-068 sweep matches `.tmp.*` siblings older than the configurable threshold.

**Alternatives considered**:
- `os.tmpdir()` / `/tmp`: rejected — `EXDEV` under Docker hardened mode.
- A separate `<DATA_DIR>/staging/` directory: still EXDEV-safe but loses spatial locality with the canonical file; orphan sweep needs to walk a second tree. Co-location is simpler.

**Source**: `man 2 link` ERRORS `EXDEV`; `docker-compose.hardened.yml` policy.

---

## Decision 3: Closed v1 detector ruleset of 17 families

**Decision**: The MC Secret Detector v1 ships exactly 17 rule families (FR-031). v2 deferrals named explicitly in spec lines 350-365.

**Rationale**:
- Constitution Principle XII (Avoid Speculative Generality): build only what the current spec requires. A pluggable detector with rule-discovery loading-from-disk would be premature.
- Pattern provenance is gitleaks v8.18.0 default rules + MC additions for vendors we actually receive secrets from (Anthropic, OpenAI). Three families promoted from v2 deferral per Clarify Session 1 / Q3 (HashiCorp Vault `hvs.*`, npm `npm_…`, Google Cloud SA JSON compound) because each represents a credential type already observed in dev artifacts.
- A closed list lets CI assert per-rule positive AND negative fixtures for every rule (no fixture-drift when a transitive gitleaks bump silently adds a rule).

**Alternatives considered**:
- Pull entire gitleaks v8.18.0 default config at runtime: rejected — uncontrolled growth, no per-rule fixture coverage, supply-chain surface increases (would need a transitive dep).
- Author MC's own rules from scratch with no provenance: rejected — gitleaks rules are battle-tested; recall ≥ 0.95 is achievable with provenance, harder without.

**Source**: gitleaks v8.18.0 `config/gitleaks.toml`; FR-031 in spec.md; Clarify Session 1 / Q3 consensus.

---

## Decision 4: Throttle pattern matches SPEC-006 `label_provisioning_failed`

**Decision**: `disposition_insert_failed` and `security_violation` activities are throttled by exactly `WHERE type = ? AND entity_type = 'task' AND entity_id = ? AND created_at >= unixepoch() - 60`.

**Rationale**:
- SPEC-006 introduced the `label_provisioning_failed` precedent at `src/lib/github-sync-engine.ts:200-209`. Reusing the exact predicate keeps the codebase coherent and lets operators carry their mental model across spec boundaries.
- The predicate uses the existing `idx_activities_entity ON activities(entity_type, entity_id)` index (`migrations.ts:460`) — no new index needed.
- 60 s window is the SPEC-006 baseline, tuned to suppress retry-burst noise without losing the long-tail signal.

**Alternatives considered**:
- Insert every event (no throttle): rejected — 100 burst retries would emit 100 rows per failure, drowning the activity feed.
- DB-side `INSERT OR IGNORE` with a unique index: rejected — would require a new index on `(type, entity_id, time_bucket)`. SPEC-006's runtime-checked predicate is simpler and covers the same semantics.
- `(task_id, type)` per-second throttling: too aggressive; same retry burst spread over 10 seconds would still produce 10 rows.

**Source**: `src/lib/github-sync-engine.ts:200-209` (SPEC-006); `src/lib/migrations.ts:460` (existing index); FR-014, FR-032 in spec.md.

---

## Decision 5: Privileged-read audit (`artifact_quarantined_read_overridden`) is NEVER throttled

**Decision**: Every successful `GET /api/task-artifacts/[id]?include_quarantined=1` admin response writes exactly one `artifact_quarantined_read_overridden` activity row. No 60 s window suppresses it.

**Rationale**:
- The throttle pattern is designed for *failure noise* (insert errors, detector findings on retry storms). It is the wrong tool for governance-boundary access.
- Constitution Principle X requires a durable record of every state-changing event; an admin override of a quarantine is a state-equivalent governance crossing even though the row's status doesn't change.
- NIST SP 800-53 controls AU-2 (event logging), AU-3 (content of audit records), and AU-12 (audit generation) require unconditional capture of privileged access. HashiCorp Vault and AWS KMS log every privileged read regardless of frequency.

**Alternatives considered**:
- Throttle privileged reads at 1/60 s: rejected — would silently drop rows for a single admin scrolling through 5 quarantined artifacts in a session.
- Aggregate into a daily summary row: rejected — loses per-event actor and timestamp granularity required by the audit standards above.

**Source**: NIST SP 800-53 Rev. 5 AU-2/3/12; FR-065 in spec.md; Clarify Session 3 / Q4.

---

## Decision 6: Cursor pagination — opaque base64url JSON, NEW MC convention

**Decision**: `GET /api/dispositions` and the audit-panel Dispositions tab use cursor pagination on `(triaged_at DESC, id DESC)`. Cursor format: `base64url(JSON.stringify({ triaged_at: number, id: number }))`. Response shape: `{ rows, next_cursor, has_more }`.

**Rationale**:
- No prior MC API uses cursor pagination. `/api/activities` uses `?limit&offset` with `{rows, total, hasMore}`. SPEC-007 explicitly establishes a new convention because (a) `task_dispositions` will accumulate at high volume and offset-pagination becomes O(N) on deep pages, (b) the spec wants stable ordering across concurrent inserts (cursor-on-key is stable; offset is not), (c) future SPEC-007-class features (audit trails, telemetry) want the same shape.
- Opaque base64url JSON keeps the wire form printable in URL params, hides the encoding from clients, and lets us evolve the cursor schema without breaking older clients (server can read old shape and emit new shape).
- `(triaged_at DESC, id DESC)` with strict `<` comparison is correct under concurrent inserts: a row inserted with the SAME `triaged_at` after the cursor cuts off lands lower in `id` order and is not skipped on the next page.

**Alternatives considered**:
- Reuse `/api/activities` offset pagination + `{total, hasMore}`: rejected — see point (a); offset-pagination at depth ≥ 1000 hurts under sustained insert load.
- Plain `(triaged_at, id)` cursor without base64url: rejected — clients would parse and break when the schema evolves.
- Keyset pagination with raw column values exposed: same problem as above.

**Source**: FR-051, FR-080 in spec.md; Clarify Session 3 / Q5 (no codebase precedent confirmed).

---

## Decision 7: Aegis hook is a thin new module, NOT extracted from `task-dispatch.ts`

**Decision**: A new `src/lib/aegis-review.ts` exports `AEGIS_FAILURE_REASONS` and `evaluateSpec007AegisSignals(taskId, db, reviewWindow)`. The pre-existing `runAegisReviews` body in `src/lib/task-dispatch.ts` calls into this helper but is not extracted. Only `aegis-review.ts` enters strict scope.

**Rationale**:
- SPEC-003 introduced `getAegis(db, workspace_id?)` as the single Aegis lookup path. SPEC-004 added `runAegisReviews`. The boundary between SPEC-003 (lookup), SPEC-004 (review orchestration), and SPEC-007 (new failure signals) needs to stay clean for future extension — extracting `runAegisReviews` into SPEC-007 would conflate three specs' concerns.
- A thin module with two named exports keeps the SPEC-007 strict scope to 6 files and matches Principle XI (one module, one responsibility).
- The two new failure reasons (`secret_in_artifact`, `disposition_validation_failed`) are pure functions of `activities` and `task_dispositions` for the producer task — no state needed.

**Alternatives considered**:
- Extract `runAegisReviews` from `task-dispatch.ts` into `src/lib/aegis-review.ts`: rejected — bloats SPEC-007's strict scope, drags SPEC-004 logic into SPEC-007 review.
- Inline the two-signal check directly in `task-dispatch.ts`: rejected — fails the Principle XI boundary, no enum constant export means caller-visible failure reasons aren't testable as a snapshot.

**Source**: FR-090 in spec.md; Clarify Session 1 / Q1 consensus.

---

## Decision 8: p95 ring buffer is process-local, no DB persistence

**Decision**: `src/lib/task-artifacts.ts` owns a process-local `Map<workspace_id, { publish: number[], read: number[] }>` with 1024-length arrays. Reset on process restart. No DB persistence. The admin panel reads via `getP95Latencies(workspaceId)` and renders `'insufficient data'` until ≥ 100 observations.

**Rationale**:
- Constitution Principle XII (Avoid Speculative Generality): the spec calls for an at-a-glance operator metric, not a long-horizon SLO platform.
- Mission Control runs as a single Node process per node; cross-process aggregation isn't a v1 requirement.
- Resetting on restart is acceptable and signaled to operators via the "insufficient data" placeholder until 100 observations accumulate.

**Alternatives considered**:
- Persist observations to a `task_artifact_metrics` table: rejected — new migration outside spec scope, cardinality unbounded, no current consumer that requires durability.
- Push to Prometheus / OpenTelemetry: rejected — no existing telemetry pipeline in MC, would require new infra.

**Source**: spec.md "In-memory p95 ring buffer" key entity; Constitution Principle XII.

---

## Decision 9: Disposition INSERT runs AFTER advanceTaskChain IIFE returns, BEFORE `runPostCommitSuccessorSync`

**Decision**: The new helper `runPostCommitDispositionInsert(db, parent, output, workspaceId)` is invoked at `src/lib/task-dispatch.ts:499` immediately after the `db.transaction((): T => { ... })()` IIFE returns and BEFORE `runPostCommitSuccessorSync(db, ...)` at line 502.

**Rationale**:
- Disposition logging must not be delayed behind the successor's GitHub outbound-sync network calls inside `runPostCommitSuccessorSync`. Operators view disposition logging as a sub-second-latency observability signal.
- Running BEFORE successor sync also means an Aegis FAIL on `disposition_validation_failed` can short-circuit the successor dispatch in a future spec (today it just FAILs the producer's quality_review).
- Running AFTER the IIFE (rather than inside the transaction) keeps the disposition INSERT in its own try/catch — INSERT failure never blocks the task transition, per FR-012.

**Alternatives considered**:
- Inside the IIFE (same SQLite transaction): rejected — INSERT failure would roll back the task transition. FR-012 mandates the opposite.
- After `runPostCommitSuccessorSync`: rejected — disposition logging is delayed by GitHub network calls, breaking the sub-second observability promise.
- A separate async queue / job: rejected — Principle XI (Keep It Simple); a synchronous post-commit insert is the simplest correct shape.

**Source**: FR-011 in spec.md; `src/lib/task-dispatch.ts:499-502` (current call site); Clarify Session 2 / Q3.

---

## Decision 10: Successor dispatch payload lives in `tasks.metadata.input_artifacts`, NOT `tasks.input`

**Decision**: With flag ON, `advanceTaskChain` attaches `metadata.input_artifacts: Array<{...}>` to the successor task's `tasks.metadata` JSON column (sibling of the SPEC-004-owned `metadata.task_pipeline` namespace). Flag OFF: the key is absent.

**Rationale**:
- There is **no** `tasks.input` column on the live schema. The dispatch payload has always lived in `tasks.metadata` JSON. Attempting to write a `tasks.input` column would fail at runtime.
- Co-locating with `metadata.task_pipeline` (SPEC-004's existing namespace) makes the JSON shape intuitive for downstream consumers ("everything dispatched to a successor lives under `metadata`").
- Gating the *key* (not just the value) on flag-OFF preserves byte-compatible JSON output with the SPEC-004 baseline at `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json`.

**Alternatives considered**:
- Add a new `tasks.input` column: rejected — new migration; no schema evidence of such a column anywhere; SPEC-004 explicitly chose `metadata` JSON.
- Top-level sibling key (`tasks.metadata.input_artifacts` outside `metadata`): rejected — fragments the namespace and breaks the SPEC-004 convention.

**Source**: spec.md FR-040, FR-043; SPEC-004 changelog entry confirming `metadata.task_pipeline`; Clarify Session 3 / Q1.

---

## Decision 11: Inline content lands in separate columns by `storage_kind`

**Decision**: M058's separate `content_json JSON` and `content_markdown TEXT` columns are used as follows: `inline_json` writes `content_json` and leaves `content_markdown` NULL; `inline_markdown` writes `content_markdown` and leaves `content_json` NULL; `file` leaves both NULL. The read-side helper `getInlineContent(row): string | Buffer | null` in `task-artifacts.ts` returns the column matching `row.storage_kind`.

**Rationale**:
- M058's live schema (verified at `src/lib/migrations.ts:1567-1599`) defines BOTH columns. Consolidating to a single TEXT column would require a new migration outside spec scope.
- `content_json` typed as JSON allows future indexed queries against JSON content if needed. `content_markdown` as TEXT preserves arbitrary UTF-8.
- The enum-snapshot test at `src/lib/__tests__/task-artifacts.enums.test.ts` runs `EXPLAIN` on the live schema and asserts the column split persists; CI fails if a future PR consolidates the columns without updating SPEC-007.

**Alternatives considered**:
- Single `content TEXT` column with `content_type` discriminator: rejected — requires a destructive migration.
- Use `content_json` for both inline kinds: rejected — JSON column may impose validation on insertion that breaks Markdown bodies.

**Source**: `src/lib/migrations.ts:1567-1599` (M058 live schema); FR-020 in spec.md; Clarify Session 2 / Q2.

---

## Decision 12: M054, M057, M058 schemas verified — zero new migrations

**Decision**: SPEC-007 introduces zero schema migrations. All required columns/tables already exist.

**Live schema evidence**:
- **M054** (`src/lib/migrations.ts:1500-1521`): adds `workflow_templates.allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0`, plus other SPEC-004-owned columns (`slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`).
- **M057** (`src/lib/migrations.ts:1549-1565`): creates `task_dispositions(id, task_id, disposition TEXT NOT NULL, reason, triaged_by_agent_id, triaged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, workspace_id INTEGER NOT NULL REFERENCES workspaces(id))`. No CHECK constraint on `disposition`. Indexed on `task_id`, `(workspace_id, triaged_at)`, `disposition`.
- **M058** (`src/lib/migrations.ts:1567-1599`): creates `task_artifacts(id, task_id, workspace_id, project_id, producer_agent_id, workflow_template_slug, artifact_type, schema_version, storage_kind TEXT NOT NULL CHECK (storage_kind IN ('inline_json','inline_markdown','file','external_uri')), content_json JSON, content_markdown TEXT, storage_uri, original_filename, mime_type, byte_size, sha256, preview_text, redaction_status TEXT NOT NULL DEFAULT 'pending', security_scan_status TEXT NOT NULL DEFAULT 'pending', supersedes_artifact_id, created_at)`. **CHECK on `storage_kind` only — no CHECK on `redaction_status` or `security_scan_status`**, which is what FR-029 requires (app-level enums). Indexed on `(task_id, created_at)`, `(workspace_id, artifact_type)`, `workflow_template_slug`.

**Implication for FR-029**: The enum-snapshot test asserts (i) `REDACTION_STATUSES` and `SECURITY_SCAN_STATUSES` tuple contents and order, (ii) `EXPLAIN` of `task_artifacts` shows no CHECK on those two columns, (iii) the `storage_kind` CHECK persists (expected, unrelated).

**Source**: `src/lib/migrations.ts` lines cited above.

---

## Decision 13: Vitest performance budget emits warnings, not failures

**Decision**: The performance tests in `task-artifacts.test.ts` measure publish/read p95 and assert against budgets (200 ms inline, 1000 ms ≤ 5 MiB file) using `expect.soft()`-style warning emission rather than failing the test.

**Rationale**:
- Vitest performance measurements are noisy on CI runners shared with other workloads. A hard failure would create flaky CI.
- The admin panel's metrics tile is the primary operator-visible signal; a Vitest warning shows up in the test output for the developer and CI for trend tracking but doesn't block PR merge.
- The detector recall ≥ 0.95 IS a hard failure — recall is a correctness property, latency is a soft target.

**Alternatives considered**:
- Hard `expect()` against latency: rejected — flaky.
- No performance test at all: rejected — drift would go unnoticed; warning-mode keeps a record.

**Source**: spec.md SC-009; performance considerations in workflow prompt.

---

## Open items (resolved before Phase 1)

None. All clarifications baked into spec.md per Clarify Sessions 1/2/3.

---

## References

- Roadmap: `docs/ai/rc-factory-technical-roadmap.md` (Phase 6, SPEC-007 section)
- PRD: `docs/rc-factory-v1-prd.md` (triage/artifact storage section)
- Design Concept: `docs/ai/specs/SPEC-007-design-concept.md`
- gitleaks v8.18.0: https://github.com/gitleaks/gitleaks/blob/v8.18.0/config/gitleaks.toml
- NIST SP 800-53 Rev. 5: AU-2, AU-3, AU-12
- SPEC-001 migrations: `src/lib/migrations.ts:1500-1599`
- SPEC-002 feature flags: `src/lib/feature-flags.ts` (`resolveFlag(name, ctx)`)
- SPEC-003 Aegis lookup: `src/lib/aegis.ts` (`getAegis(db, workspace_id?)`)
- SPEC-004 task pipelines: `src/lib/task-dispatch.ts` (`advanceTaskChain`, `runPostCommitSuccessorSync`)
- SPEC-006 throttle precedent: `src/lib/github-sync-engine.ts:200-209`
