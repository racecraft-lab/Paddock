---
topic: "SPEC-007 Disposition Logging and Task Artifact Store"
slug: "spec-007-disposition-artifacts"
date: "2026-05-01"
mode: "setup"
spec_id: "SPEC-007"
source_input:
  type: "topic"
  ref: "SPEC-007 roadmap entry (Phase 6 — Disposition Logging + Artifact Store + Admin Panels) plus interactive setup interview"
question_count: 34
stop_reason: "natural"
---

# Design Concept: SPEC-007 Disposition Logging and Task Artifact Store

> **Source:** SPEC-007 roadmap entry (Phase 6 — Disposition Logging + Artifact Store + Admin Panels) plus interactive setup interview
> **Date:** 2026-05-01
> **Questions asked:** 34
> **Stop reason:** natural

## Goals

- Add two independent feature flags — `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` — both default OFF, both resolved through `resolveFlag(name, ctx)` so they roll forward and back independently.
- When `FEATURE_DISPOSITION_LOGGING` is ON, every triage-template completion writes exactly one row into `task_dispositions` (M057), recording disposition (closed enum), reason, triaged_by_agent_id, triaged_at, and workspace_id.
- When `FEATURE_TASK_ARTIFACTS` is ON, agents can publish inline JSON, inline Markdown, or file-backed outputs to a Paddock–controlled artifact store backed by `task_artifacts` (M058) and the local filesystem under `<PADDOCK_DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>`.
- Ship `src/lib/secret-detector.ts` as the single redaction/rejection gate before any artifact reaches storage. Reject by default; allow redact-and-store only for text-like MIMEs when the producer template opts in via `workflow_templates.allow_redacted_artifacts = 1` (M054).
- Surface dispositions and artifacts to operators through the audit trail panel ("Dispositions" tab), the artifact admin panel, and a dashboard widget showing 7-day triage rollups.
- Preserve byte-compatible behavior of `advanceTaskChain` and successor dispatch when both flags are OFF; provide a clean rollback path that does not lose previously stored evidence.
- Stay within a clearly bounded strict-scope file list and add it to `tsconfig.spec-strict.json` and `eslint.config.mjs` so a strict-scope grep test guards against accidental blast-radius expansion.
- Leave a stable, generic `GET /api/dispositions` query endpoint that any external consumer can use, without naming or coupling to specific downstream consumers.

## Non-goals

- No new database migrations beyond the migrations already shipped in SPEC-001 (M054, M057, M058). All status enums, retention policy keys, and admin metrics live at the application layer or in `workspaces.feature_flags` JSON. Answered in Q11, Q12, Q22, Q25, Q31.
- No `external_uri` publish path in v1. The `task_artifacts.storage_kind = 'external_uri'` value remains in the schema (and existing rows render normally), but the publish API rejects it. Answered in Q13.
- No retroactive backfill of historical triage completions when `FEATURE_DISPOSITION_LOGGING` flips ON. Pre-flag triage tasks have no recorded disposition value; rollups are scoped to the post-flag-ON window with a banner. Answered in Q26.
- No automatic retention sweep cron in v1. Retention/archive/delete by policy runs ONLY when an admin explicitly clicks "Run retention sweep" in the artifact admin panel. Answered in Q22.
- No daily-ops repo integration code, integration tests, or named integration documentation. The `GET /api/dispositions` endpoint is generic; any consumer (daily-ops or otherwise) treats it as a normal API surface. Answered in Q32.
- No DB-level CHECK constraints on `task_dispositions.disposition`, `task_artifacts.redaction_status`, or `task_artifacts.security_scan_status`. Enums are enforced at the application layer with a snapshot test. Answered in Q3, Q11.
- No metadata-strip path for binary artifacts (PDF/image) when secrets are detected. Binaries with findings always reject. Answered in Q10.
- No SPEC-007-owned status hygiene fix for the SPEC-006/SPEC-004/autopilot-state drift on `main`. SPEC-005 owns that Phase 0 fix; SPEC-007 depends on SPEC-005 and rebases if needed. Answered in Q27.
- No daily-ops, no morning-briefing, no cross-repo contracts. Answered in Q32.

## Design Tree (Q&A log)

### Q1. The roadmap scope text references M54/M58/M59, but the actual codebase has M054 (allow_redacted_artifacts), M057 (task_dispositions), M058 (task_artifacts). How should SPEC-007 handle the drift?

**Branch:** Migration ID accuracy / scope hygiene

**Recommended answer:** A. Use actual IDs (M054/M057/M058) and note drift in the design concept Open Questions; SPEC-007 does NOT modify the roadmap.

**Decision:** B. Add a corrective migration note to the roadmap on this branch.

**Post-decision verification (CRITICAL):** When this question was asked, the framing implied the roadmap's text was wrong. **It is not.** Direct inspection of `docs/ai/rc-factory-technical-roadmap.md` (lines 330–334) shows the roadmap correctly states:

- **M54** — `workflow_templates` gains `allow_redacted_artifacts` (matches code `id: '054_workflow_templates_task_chain_routing_and_artifact_policy'`).
- **M57** — `task_dispositions` table + index (matches code `id: '057_task_dispositions'`).
- **M58** — `task_artifacts` table + indexes (matches code `id: '058_task_artifacts'`).

The "M58 = task_dispositions / M59 = task_artifacts" framing came from a setup-time scope-text mistake by the grill-me invoker, not from the roadmap. The roadmap and the code agree on M54 / M57 / M58 (using two-digit format consistently against three-digit migration IDs that pad with a leading zero).

**Net effect on this spec:** No roadmap edit is required. Phase 0 hygiene is reduced to a verification step ("confirm M054, M057, M058 match the roadmap's M54, M57, M58 mapping; no edit required"). The original recommended answer (Option A — use actual IDs and note in Open Questions) is what actually applies.

---

### Q2. Should SPEC-007 ship as two independent flags, one combined flag, or with internal coupling?

**Branch:** Feature-flag granularity / rollout safety

**Recommended answer:** A. Two independent flags.

**Decision:** A. Two independent flags (`FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS`).

**Rationale:** Disposition logging is a low-risk insert path; artifact publish is a higher-risk write path with secret-detection consequences. Decoupling lets operations disable one without losing the other if a regression appears. Both default OFF and resolve through `resolveFlag(name, ctx)`.

---

### Q3. `task_dispositions.disposition` is TEXT with no CHECK. What disposition values should v1 recognize, and how strict is the API?

**Branch:** Data shape / API rigor

**Recommended answer:** A. Closed enum, API rejects unknown values: `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`.

**Decision:** A. Closed enum, API rejects unknown values.

**Rationale:** Predictable analytics, clean dashboard rollups, simple audit panel filtering. Adding a new disposition value requires a deliberate code change. `'unknown'` is reserved as a 9th admin-only value (see Q6).

---

### Q4. How does Paddock identify a "triage template" for the disposition insert? The current schema has `workflow_templates.slug`, `output_schema`, `routing_rules`, and `produces_pr` — but no explicit `is_triage` flag.

**Branch:** Hook discovery / schema evolution

**Recommended answer:** A. Detect via `output_schema` requiring a top-level `disposition` field.

**Decision:** A. Detect via `output_schema` requiring `disposition` field.

**Rationale:** Automatic discovery; no new column or migration needed; operators opt a template in by adding a typed `disposition` enum to its `output_schema`. Validated at runtime in `advanceTaskChain`.

---

### Q5. P6-AC3 requires that disposition INSERT failure NOT block task advancement. What's the failure-isolation pattern?

**Branch:** Reliability / transaction boundaries

**Recommended answer:** A. After-transaction insert with try/catch + `activities` log, throttled per SPEC-006 pattern.

**Decision:** A. After-transaction insert with try/catch + `activities` log.

**Rationale:** `advanceTaskChain` commits the task transition first; the disposition INSERT then runs in its own try/catch outside the transaction. On failure, an activity row (`kind='disposition_insert_failed'`) is written with the same SQL throttle pattern SPEC-006 used for `label_provisioning_failed` (max 1 row per `(task_id, kind)` per 60s).

---

### Q6. Where does the disposition VALUE come from when the insert fires?

**Branch:** Data sourcing / validation locus

**Recommended answer:** A. From triage agent's output JSON, validated against `output_schema`.

**Decision:** A. From triage agent's output JSON, validated against `output_schema`.

**Rationale:** `output_schema` validation enforces enum membership and `reason` non-emptiness. `triaged_by_agent_id` is the completing task's `agent_id`. Couples disposition semantics to the agent's declared output, not to routing rules — keeps disposition semantics evolvable independently.

---

### Q7. When a triage template requires a `disposition` field but the agent's output is missing it (or fails enum validation), what should happen?

**Branch:** Validation failure handling

**Recommended answer:** A. Advance, but `disposition='unknown'` + activities row + Aegis quality_review FAIL.

**Decision:** A. Advance with `disposition='unknown'` + activities row + Aegis FAIL.

**Rationale:** Honors AC3 (don't block on observability). `'unknown'` is reserved as a 9th value outside the user-facing enum — agents cannot return it directly. Activity `kind='disposition_validation_failed'` records the malformed payload; Aegis treats it as a producer-task FAIL so the agent is held accountable (see Q31).

---

### Q8. Where does file-backed artifact content live on disk?

**Branch:** Storage layout

**Recommended answer:** A. `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>`, `storage_uri` is RELATIVE.

**Decision:** A. Local FS sharded by workspace + year-month + sha256.

**Rationale:** Reuses `PADDOCK_DATA_DIR` (defaults to `.data/`); works with Docker volumes; portable backup/restore because `storage_uri` is relative. Free-space metric for AC9 reads `df` on `DATA_DIR`. Workspace isolation is enforced on disk in addition to in DB.

---

### Q9. Inline-vs-file threshold: when does a publish auto-promote from `inline_json`/`inline_markdown` to `file`?

**Branch:** Storage policy

**Recommended answer:** A. 64 KiB threshold; agent cannot override.

**Decision:** A. 64 KiB threshold (65,536 bytes after UTF-8 encoding).

**Rationale:** Keeps DB rows lean and SQLite indexes fast; documented threshold tested at the 65,535 / 65,537 boundary.

---

### Q10. Maximum file artifact size and accepted MIMEs?

**Branch:** Resource limits / acceptance policy

**Recommended answer:** A. 25 MiB cap; allowlisted MIMEs only.

**Decision:** A. 25 MiB hard cap; allowlisted MIME set: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`.

**Rationale:** Larger → 413; non-allowlisted → 415. Future spec can extend; v1 keeps scan and storage budgets predictable.

---

### Q11. When `allow_redacted_artifacts=1` AND a binary artifact (image, zip, PDF) contains a secret, what happens?

**Branch:** Redaction policy / safety floor

**Recommended answer:** A. Reject binaries even when redact-and-store is enabled.

**Decision:** A. Redact-and-store applies ONLY to text-like MIMEs (`text/*`, `application/json`, `application/x-yaml`); binaries with findings always reject.

**Rationale:** In-place binary redaction is unsafe or impossible without semantic loss. Documented limit; keeps the safety floor predictable. Reject path returns 422 with redacted preview and writes a `security_violation` activity.

---

### Q12. What enum values should `redaction_status` and `security_scan_status` take, and where are they constrained?

**Branch:** Status taxonomy / enforcement layer

**Recommended answer:** A. App-level constants + snapshot test, no DB CHECK.

**Decision:** A. App-level constants + snapshot test.

**Rationale:** `redaction_status ∈ {'pending','clean','redacted','rejected'}` (extended in Q20 with `'quarantined'` and Q29 with `'superseded'`). `security_scan_status ∈ {'pending','scanned_clean','scanned_with_findings','scan_error'}` (extended in Q22 with `'hash_mismatch'` and in Q23 with `'file_missing'`). Defined as exported `const` arrays in `src/lib/task-artifacts.ts`; snapshot test guards against silent expansion. No new migration.

---

### Q13. Should v1 publish path support `storage_kind='external_uri'`?

**Branch:** Scope cut

**Recommended answer:** A. No — reject `external_uri` at publish API for v1.

**Decision:** A. Reject `external_uri` at publish API for v1.

**Rationale:** Schema retains the value; existing rows still render. Publish path produces only `inline_json`, `inline_markdown`, or `file`. A future spec can add the external scan path with HEAD/range read.

---

### Q14. How should the successor task receive artifact references when `FEATURE_TASK_ARTIFACTS=ON`?

**Branch:** Successor consumption contract

**Recommended answer:** A. Dispatch payload includes `input_artifacts: Array<{id, type, sha256, preview_text, storage_kind, byte_size}>`; raw content only via MC artifact-read API.

**Decision:** A. `input_artifacts` array with safe metadata; raw content only via MC API.

**Rationale:** Successor agents never read another agent's private sandbox. `preview_text` (≤4 KiB; see Q30) avoids a roundtrip in common cases. Indexed via `task_artifacts.task_id` at dispatch time using the producer task_id.

---

### Q15. When `FEATURE_TASK_ARTIFACTS=OFF`, how should successor dispatch behave?

**Branch:** Flag-OFF compatibility

**Recommended answer:** A. Byte-compatible with SPEC-004 dispatch — no `input_artifacts` field at all.

**Decision:** A. Byte-compatible — no `input_artifacts` key.

**Rationale:** EXPLAIN QUERY PLAN snapshots and dispatch payload golden tests catch any drift. Successor reads predecessor task fields directly as today. Preserves rollback safety.

---

### Q16. Should `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, and `src/lib/__tests__/secret-detector.test.ts` be added to the spec-strict scope?

**Branch:** Strict-scope discipline

**Recommended answer:** A. Yes — add all three to `tsconfig.spec-strict.json` and `eslint.config.mjs`.

**Decision:** A. Add all three detector files.

**Rationale:** The detector is the single security gate; same rigor as the artifact API surface. Strict-scope grep test (per SPEC-006 pattern) verifies nothing outside the declared list was modified.

---

### Q17. Throttling for `security_violation` activities: should we apply the SPEC-006 `label_provisioning_failed` pattern?

**Branch:** Activity-table protection

**Recommended answer:** A. Throttle: max 1 row per `(task_id, kind)` per 60s.

**Decision:** A. Throttle 1/(task_id, kind)/60s.

**Rationale:** Burst of 100 retries collapses to 1 activity per minute per task. Counter exposed in admin panel: "violations attempted but throttled" so signal is preserved.

---

### Q18. Audit panel filter set for the new "Dispositions" tab.

**Branch:** Operator UX

**Recommended answer:** A. + `triaged_by_agent_id` and `task_id` substring; cursor pagination on `(triaged_at DESC, id DESC)`, default 50, max 200.

**Decision:** A. Filters: `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id` dropdown, `task_id` numeric/substring; cursor pagination.

**Rationale:** Covers the operator workflows of "who triaged what", "how often did agent X reject", "what happened on date Y" without over-building. Maximal-filter alternative left for post-v1.

---

### Q19. Dashboard widget shape and freshness for "Last 7d triage totals" (AC5).

**Branch:** Operator surface / accuracy

**Recommended answer:** A. Stacked-bar by day × disposition + total card; 30s client poll, 15s server cache invalidated on disposition INSERT.

**Decision:** A. Stacked-bar; 30s/15s freshness with cache invalidation on insert.

**Rationale:** Visible "last updated" timestamp; rollup query keyed on `(workspace_id, day_bucket)`; cheap and accurate within the AC5 bar.

---

### Q20. Artifact admin panel: who can perform destructive actions?

**Branch:** Authorization / forensic trail

**Recommended answer:** A. Existing admin guard + per-action `activities` row.

**Decision:** A. Existing admin guard pattern + per-action audit.

**Rationale:** Reuses the admin guard from existing privileged endpoints. Each destructive action writes an activity (`kind ∈ {'artifact_quarantined','artifact_deleted','artifact_archived','artifact_hash_verified','artifact_repaired_orphan'}`) with `payload = {artifact_id, actor_session_id, reason, before/after status}`. Reads require any authenticated session within scope.

---

### Q21. Quarantine semantics: what is the read-side behavior?

**Branch:** Containment policy

**Recommended answer:** A. `redaction_status='quarantined'` (5th value); reads return 423 Locked unless `?include_quarantined=1` + admin.

**Decision:** A. 5th `redaction_status` value; 423 Locked + admin override flag.

**Rationale:** Reversible via "Un-quarantine" admin action. Successor dispatch silently skips quarantined artifacts (with activity log). Stub body returns metadata-only on 423 so auditors can still see what's there without reading content.

---

### Q22. Retention policy + sweep configuration and trigger.

**Branch:** Lifecycle / data-loss safety

**Recommended answer:** A. Per-workspace JSON in `workspaces.feature_flags.artifact_retention`; admin-triggered sweep only for v1.

**Decision:** A. Per-workspace JSON config; admin-triggered manual sweep.

**Rationale:** `feature_flags.artifact_retention = { keep_days: number|null, archive_after_days: number|null, delete_after_days: number|null }`. Default null = keep forever. Each manual sweep writes an activity summary. NO auto-cron in v1 — avoids data-loss surprises during rollout.

---

### Q23. Hash verification action: behavior on mismatch.

**Branch:** Integrity / response calibration

**Recommended answer:** A. Re-hash file; on mismatch set `security_scan_status='hash_mismatch'` + activity. No auto-quarantine.

**Decision:** A. Re-hash; mismatch sets `'hash_mismatch'` + activity, NOT auto-quarantine.

**Rationale:** A single bad disk block shouldn't lock down an in-flight chain. Admin panel red-badges the row; operator decides whether to quarantine or recover.

---

### Q24. Orphan repair behavior in both directions.

**Branch:** Self-healing / evidence preservation

**Recommended answer:** A. DB-row-without-file → `redaction_status='rejected'`, `security_scan_status='file_missing'`, keep row + audit. Filesystem-file-without-row → move to `<DATA_DIR>/artifacts/_orphaned/` with timestamp + audit.

**Decision:** A. Bidirectional repair, never auto-delete.

**Rationale:** Operators retain ability to investigate after the fact; both auto-delete and asymmetric alternatives are ops-hostile.

---

### Q25. p95 publish/read latency tracking for AC9: storage and rollover.

**Branch:** Observability / metrics shape

**Recommended answer:** A. In-memory ring buffer per workspace, 1024 obs each for publish + read; rolls forward; resets on process restart.

**Decision:** A. In-memory ring buffer, 1024 obs, no DB persistence.

**Rationale:** Cheap; rebuilds within minutes of restart. AC9's "≥100 observations" is satisfied by buffer fill check; if <100 obs the panel shows "insufficient data". Documented as a server-process metric.

---

### Q26. Workspace scoping for the publish API.

**Branch:** Authorization / cross-workspace isolation

**Recommended answer:** A. Producer task's `workspace_id` wins; reject if mismatch unless caller is Facility-scoped.

**Decision:** A. Producer task's workspace_id with Facility override.

**Rationale:** Server reads `task.workspace_id` and uses that for storage path + redaction policy. Session.activeWorkspace mismatch + non-Facility → 403. Reads scoped same way.

---

### Q27. Backfill of historical triage completions on flag flip-ON.

**Branch:** Data semantics / honesty

**Recommended answer:** A. No backfill — flag-ON only governs future completions; documented limitation with banner.

**Decision:** A. No backfill.

**Rationale:** Past triage tasks' agents never recorded `disposition`. Inferred values would corrupt the audit trail. Audit panel shows a banner "Logging began on YYYY-MM-DD".

---

### Q28. Status hygiene for the SPEC-006/SPEC-004/autopilot-state drift on `main`.

**Branch:** Cross-spec coordination

**Recommended answer:** A. Depend on SPEC-005's status-hygiene; rebase before implementation if needed.

**Decision:** A. Depend on SPEC-005; rebase if SPEC-005 merges first.

**Rationale:** Workflow file adds "Recommended Predecessor: SPEC-005". Avoids merge conflicts that would arise if both branches edited the same roadmap lines. SPEC-007 can still run autopilot independently against the stale roadmap; it's not a blocker.

---

### Q29. Detector positive/negative fixture coverage and recall measurement (AC8).

**Branch:** Test taxonomy / acceptance

**Recommended answer:** A. One pos + one neg per rule, plus a "wild" corpus of ≥50 mixed strings for recall measurement.

**Decision:** A. Per-rule pos/neg + ≥50-line wild corpus, asserted ≥0.95 recall.

**Rationale:** Per-rule fixtures live in `src/lib/__tests__/fixtures/secrets/per-rule/`. Wild corpus at `src/lib/__tests__/fixtures/secrets/wild-corpus.txt` is synthesized + manually-curated (NEVER real customer data). A separate test loads the corpus and asserts each line is flagged at ≥0.95. CI fails on <0.95 recall and on `safe-regex` rejection of any rule.

---

### Q30. Atomic file write: a publish that crashes mid-write must not leave a partial file at the canonical path.

**Branch:** Crash safety / FS semantics

**Recommended answer:** A. write-to-temp + fsync + rename within same dir.

**Decision:** A. write-temp + fsync + rename + parent-dir fsync.

**Rationale:** Path: write to `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>`; `fsync(file)`; `rename` to canonical; `fsync(parent dir)`. Crash before rename leaves a `.tmp.*` sibling that orphan repair sweeps. DB row INSERT happens AFTER rename success.

---

### Q31. `task_artifacts.supersedes_artifact_id` versioning behavior on republish.

**Branch:** Version chain / forensic preservation

**Recommended answer:** A. Republish creates a new row with `supersedes_artifact_id = previous`; old row stays readable, marked superseded.

**Decision:** A. New row + `'superseded'` status on the old row.

**Rationale:** POST `/api/task-artifacts` with `{ task_id, artifact_type, supersedes: <id> }` creates a new row. The old row's `redaction_status` is set to `'superseded'` (6th value) when the new one publishes successfully. Successor dispatch passes ONLY the latest version per `(task_id, artifact_type)`. Audit panel renders the full chain.

---

### Q32. `preview_text` generation: algorithm, length cap, and interaction with redaction.

**Branch:** Successor UX / leak prevention

**Recommended answer:** A. First 4 KiB of UTF-8-decoded content, post-redaction; binaries get `(binary, N bytes, sha256=...)`.

**Decision:** A. 4 KiB UTF-8 post-redaction; binary stub for non-text MIMEs.

**Rationale:** For text-like (`text/*`, `application/json`, `application/x-yaml`): UTF-8 decode (replacement char on invalid bytes), then take min(content.length, 4096) characters; if redact-and-store applied, the preview is built from the REDACTED bytes. For binary MIMEs: literal `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'`. Raw content requires authenticated read.

---

### Q33. Aegis (quality_review) integration with SPEC-007 signals.

**Branch:** Accountability loop

**Recommended answer:** A. Both `security_violation` activities and `disposition='unknown'` rows fail Aegis review on the producer task.

**Decision:** A. Both signals FAIL Aegis review.

**Rationale:** When Aegis runs `runAegisReviews` on a triage-template task, it loads activities for that task: any `security_violation` (within review window) → FAIL with `reason='secret_in_artifact'`. `disposition='unknown'` → FAIL with `reason='disposition_validation_failed'`. Touches `src/lib/aegis-review.ts` (NOT in roadmap strict scope; spec.md must add it explicitly to strict scope).

---

### Q34. Should SPEC-007 carry the daily-ops morning-briefing integration as scope?

**Branch:** Cross-repo coupling / scope discipline

**Recommended answer:** A. Drop it as a deliverable; SPEC-007 owns no daily-ops concern.

**Decision:** A. Drop the daily-ops/morning-briefing reference entirely.

**Rationale:** `GET /api/dispositions` exists as a generic, stable audit query surface. Any consumer (daily-ops, custom dashboards, ad-hoc curl) can use it without specific named documentation, integration tests, or contract coupling. Daily-ops integration is the daily-ops plugin's problem if/when it adds a SPEC-007 dependency.

---

## Open Questions

These are decisions that should be re-confirmed during `/speckit.clarify` because they touch boundaries the design tree didn't fully nail down, or where the autopilot may surface additional constraints.

1. **Strict-scope amendment for `src/lib/aegis-review.ts`.** Q33 expanded strict scope to include the Aegis hook. Confirm the exact symbols the spec is allowed to add (e.g., new failure-reason constants, additional checks in `runAegisReviews`) so the strict-scope grep test stays accurate.
2. **Whether `'unknown'` disposition counts in dashboard rollups.** Q7 reserved `'unknown'` as an admin-only sentinel. Decide whether the AC5 "Last 7d triage totals" widget shows `'unknown'` as a stacked-bar segment (recommended: yes, in a distinct red color) or hides it (default false; never blocks).
3. **`/api/dispositions` rate limits.** Decide whether v1 imposes any rate limit (per session, per workspace) on the GET endpoint, or relies on the existing API-key gate. Recommended: no rate limit in v1; observe usage and revisit if a misconfigured consumer hammers it.
4. **Concurrency semantics for atomic file writes when two publishes hit the same `sha256`.** Same-content republish from different producers is rare but possible. Recommended: idempotent — second writer detects the canonical path already exists, verifies hash matches, skips the FS write, and inserts its own row pointing to the same `storage_uri`. Q30 covered the crash-safety pattern but not the concurrency case.
5. **Audit panel banner copy for "Logging began on YYYY-MM-DD" (Q27).** Confirm exact wording and whether the date is computed from the earliest `task_dispositions.triaged_at` or from a separate config knob. Recommended: derive from earliest row; banner is hidden if no rows exist yet.
6. **Detector "wild corpus" line count and content sources (Q29).** ≥50 lines is a floor. Confirm whether the corpus mixes synthetic patterns with redacted real-world examples (RECOMMENDED: synthetic + manually crafted; never real customer content). Document the corpus generation policy in the spec.
7. **What `external_uri` rows do during retention sweep.** Q13 disallowed new `external_uri` publish but kept existing rows readable. Confirm retention sweep treats them like file rows (timestamp-aged) but does NOT attempt outbound deletion of the external resource — only removes the DB row.
8. **Migration ID corrective edit scope (Q1).** Resolved by post-decision verification: NO roadmap edit is required because the roadmap text already correctly maps M54→`allow_redacted_artifacts`, M57→`task_dispositions`, M58→`task_artifacts`. The drift was in the setup-time scope-text input, not in the roadmap. Phase 0 hygiene becomes a verification-only step.
