# SPEC-007 Data Integrity Checklist

**Purpose**: Unit tests for the data-integrity requirements in spec.md, plan.md, and data-model.md. Each item asks whether the requirement is **written** with sufficient quality (completeness, clarity, consistency, measurability, coverage) — NOT whether the implementation works.

**Created**: 2026-05-01
**Audience**: PR reviewer + release gate
**Depth**: Rigorous
**Focus areas**: (1) `task_dispositions` enum/defaults/NOT NULL discipline, (2) `task_artifacts` storage_kind / inline-column mutual exclusion / supersedes chain / app-level enums / no-DB-CHECK invariant, (3) atomic file-write sequence (`fs.link`, fsync, parent-dir fsync, temp-under-DATA_DIR), (4) same-content concurrency `fs.link` EEXIST loser path, (5) inline-vs-file 64 KiB threshold and 25 MiB / MIME caps, (6) orphan repair (bidirectional, no auto-delete), (7) supersede single-transaction wrapping INSERT + UPDATE, (8) race conditions across publish / supersede / quarantine on same artifact_id chain.

---

## Requirement Completeness — `task_dispositions` (M057)

- [ ] CHK001 - Are the exact, ordered enum values for `task_dispositions.disposition` documented in the spec, and is the `'unknown'` sentinel called out as reserved for the validation-failure path? [Completeness, Spec §FR-013, §FR-015, Data §Entity 1]
- [ ] CHK002 - Is the requirement that `task_dispositions.workspace_id` is `NOT NULL` and equals the producer task's `workspace_id` explicitly stated (so a future refactor cannot silently insert NULL)? [Completeness, Spec §FR-011, Data §Entity 1]
- [ ] CHK003 - Is the requirement that `task_dispositions.reason` MAY be NULL explicitly documented (so reviewers do not over-constrain validators)? [Completeness, Data §Entity 1]
- [ ] CHK004 - Is the SQL default for `triaged_at` specified as `unixepoch()` AND tied to the same monotonic clock used by the FR-014 / FR-032 60-second activity throttle? [Completeness, Spec §FR-011, §FR-014]
- [ ] CHK005 - Are `task_dispositions.triaged_by_agent_id` semantics documented (MUST equal completing task's `agent_id`; nullable or non-nullable expectation)? [Completeness, Spec §FR-011, Data §Entity 1]
- [ ] CHK006 - Is the requirement that exactly ONE `task_dispositions` row is inserted per triage-template completion stated explicitly (not "at least one")? [Completeness, Spec §FR-011]
- [ ] CHK007 - Is the requirement that no `task_dispositions` row is inserted for non-triage templates documented as a positive invariant (not just absence)? [Completeness, Spec §FR-010, Acceptance Scenario US2-#4]
- [ ] CHK008 - Are append-only semantics for `task_dispositions` rows declared (no admin path mutates them in v1)? [Completeness, Data §Entity 1 §State transitions]

## Requirement Completeness — `task_artifacts` (M058)

- [ ] CHK009 - Are the `storage_kind` values enumerated and tied explicitly to the live DB CHECK constraint (`inline_json`/`inline_markdown`/`file`/`external_uri`) so reviewers know the CHECK is preserved, not re-introduced? [Completeness, Spec §FR-020, Data §Entity 2]
- [ ] CHK010 - Is the M058 inline-column split (`content_json` JSON vs `content_markdown` TEXT) documented as a hard mutual-exclusion rule keyed on `storage_kind`? [Completeness, Spec §FR-020, Data §Entity 2]
- [ ] CHK011 - Is the per-`storage_kind` column-population matrix specified (which of `content_json`, `content_markdown`, `storage_uri` MUST be populated and which MUST be NULL for each kind)? [Completeness, Spec §FR-020]
- [ ] CHK012 - Is the requirement that `redaction_status` and `security_scan_status` are app-level enums with NO DB CHECK explicitly stated, including the snapshot-test gate that fails if a DB CHECK is introduced? [Completeness, Spec §FR-029, Data §Entity 2]
- [ ] CHK013 - Are the ordered, frozen `REDACTION_STATUSES` and `SECURITY_SCAN_STATUSES` tuples specified verbatim with their export module path? [Completeness, Spec §FR-029, Data §Entity 2]
- [ ] CHK014 - Is the snapshot test specified to assert (i) tuple order/contents, (ii) absence of CHECK on the two enum columns, AND (iii) presence of the `content_json`/`content_markdown` column split? [Completeness, Spec §FR-020, §FR-029, Data §Entity 2]
- [ ] CHK015 - Is the `supersedes_artifact_id` chain semantics specified — "latest = no row points to it" — as a queryable invariant? [Completeness, Spec §FR-027, §FR-040, Data §Entity 2]
- [ ] CHK016 - Is the requirement that ALL of `mime_type`, `byte_size`, `sha256`, `preview_text` are NOT NULL (per data-model) documented in the publish-path requirement, not only in the schema table? [Completeness, Data §Entity 2]
- [ ] CHK017 - Is the `storage_uri` "RELATIVE TO `DATA_DIR`" rule stated for both `file` rows and legacy `external_uri` rows (the latter unchanged in publish path)? [Completeness, Spec §FR-022, Data §Entity 2]

## Requirement Completeness — Atomic file-write sequence (FR-022)

- [ ] CHK018 - Is the canonical path template `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>` specified verbatim with each segment defined (which clock for `<yyyy>/<mm>`, how `<ext>` is derived from MIME)? [Completeness, Spec §FR-022, Edge Cases]
- [ ] CHK019 - Is the temp-file path template specified as a sibling under the SAME canonical directory tree (`<DATA_DIR>/artifacts/.../tmp.<sha256>.<pid>.<rand>`) with an explicit prohibition against `/tmp` and any tmpfs path? [Completeness, Spec §FR-022]
- [ ] CHK020 - Is the EXDEV rationale (Docker `read_only: true`, named volume on `/app/.data`) documented inline so reviewers cannot "simplify" the temp location later? [Completeness, Spec §FR-022]
- [ ] CHK021 - Are the six ordered atomic-write steps (write-temp → fsync(temp) → `fs.link` → unlink(temp) → fsync(parent dir) → DB INSERT) specified as a strictly ordered sequence, with each step's failure handling spelled out? [Completeness, Spec §FR-022]
- [ ] CHK022 - Is `fs.link` (POSIX `link(2)`) explicitly named and `fs.rename` explicitly forbidden, with the silent-overwrite rationale stated? [Completeness, Spec §FR-022]
- [ ] CHK023 - Is the requirement to fsync the **parent directory** (not just the file) called out as a distinct step? [Completeness, Spec §FR-022]
- [ ] CHK024 - Is the rule that the DB row INSERT MUST occur ONLY after parent-dir fsync completes specified, not just implied? [Completeness, Spec §FR-022]
- [ ] CHK025 - Are clean-up requirements on every error branch (link error other than EEXIST, fsync error, transaction failure) specified — including the explicit decision to leave a healthy orphan canonical file when the post-link transaction fails (relying on FR-068 sweep)? [Completeness, Spec §FR-022, §FR-027, §FR-068]

## Requirement Completeness — Same-content concurrency (FR-023)

- [ ] CHK026 - Is the loser path (when `fs.link` returns EEXIST) specified as: re-read existing canonical file → recompute sha256 → assert equality → on match unlink temp + INSERT loser row pointing to same `storage_uri`? [Completeness, Spec §FR-023]
- [ ] CHK027 - Is the hash-mismatch branch in the loser path specified to (a) set the loser row's `security_scan_status='hash_mismatch'`, (b) return HTTP 500, (c) write `artifact_hash_verification_failed` activity with both hashes, and (d) classify the branch as "impossibly rare absent collision/corruption"? [Completeness, Spec §FR-023, Data §Entity 5]
- [ ] CHK028 - Is the requirement that the canonical file is written exactly once across N concurrent writers stated as a global invariant (not just a per-pair guarantee)? [Completeness, Spec §FR-023]
- [ ] CHK029 - Is the requirement that BOTH writers' rows reference the same `storage_uri` (no row stranded without backing file) specified? [Completeness, Spec §FR-023]

## Requirement Completeness — Inline / file threshold and caps

- [ ] CHK030 - Is the 64 KiB threshold specified in the units actually measured (UTF-8 encoded bytes — not Unicode code points, not raw JS string length)? [Completeness, Spec §FR-021]
- [ ] CHK031 - Is the rule "agent cannot override the inline-vs-file decision" explicit (e.g., a publish hint or `storage_kind` override is rejected if it contradicts the size threshold)? [Completeness, Spec §FR-021]
- [ ] CHK032 - Is the file-size cap 25 MiB stated with the exact byte boundary (26214400) used in the API contract and is the 413 error body shape specified? [Completeness, Spec §FR-024, API Error Code Matrix]
- [ ] CHK033 - Is the MIME allowlist enumerated (9 entries) and is the order "MIME-allowlist check BEFORE secret scan" specified, so the scan never runs on unsupported MIMEs? [Completeness, Spec §FR-025, User Story 3]
- [ ] CHK034 - Is the file-size check specified to happen BEFORE the MIME check or is the order intentionally undefined? [Coverage, Resolved by Spec §Edge Cases — "Pre-scan validation order (CHK034)"]

## Requirement Completeness — Orphan repair (FR-068)

- [ ] CHK035 - Is the orphan repair specified as bidirectional with both directions documented: (a) DB row without file → `redaction_status='rejected'`, `security_scan_status='file_missing'`, row preserved; (b) file without DB row → moved to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`? [Completeness, Spec §FR-068]
- [ ] CHK036 - Is the rule "orphan repair NEVER auto-deletes" stated as an explicit prohibition (so reviewers reject any "delete missing-file rows" optimization)? [Completeness, Spec §FR-068]
- [ ] CHK037 - Is the destination subtree `_orphaned/<timestamp>/` specified with the timestamp format (resolution and clock source) and conflict policy (what happens if two orphan files would collide on the destination path)? [Clarity, Spec §FR-068, Resolved by Spec §Edge Cases — "`_orphaned/` destination collision (CHK037, CHK086)"]
- [ ] CHK038 - Is the activity row written for each orphan repair specified with the `direction` field values (`'db_no_file'` / `'file_no_db'`) so the audit trail is queryable? [Completeness, Data §Entity 5]
- [ ] CHK039 - Are `.tmp.*` siblings explicitly addressed as a separate orphan class, with the configurable age threshold for cleanup mentioned? [Completeness, Edge Cases — "Crash during file write"]

## Requirement Completeness — Supersedes (FR-027)

- [ ] CHK040 - Is the supersede transaction specified as a SINGLE `db.transaction(() => { ... })()` wrapping BOTH the new INSERT and the previous-row `redaction_status='superseded'` UPDATE? [Completeness, Spec §FR-027, Data §Entity 2]
- [ ] CHK041 - Is the ordering rule "atomic file write (FR-022) MUST complete BEFORE the supersede transaction begins" stated explicitly? [Completeness, Spec §FR-027]
- [ ] CHK042 - Is the WAL-snapshot guarantee documented — "successor dispatch never observes both rows non-superseded simultaneously" — and tied to the `redaction_status NOT IN ('superseded','quarantined')` selection predicate? [Completeness, Spec §FR-027, §FR-040, Data §Entity 4]
- [ ] CHK043 - Is the requirement that `preview_text` is recomputed on supersede specified, with the recomputation source (post-redaction content of the new row)? [Completeness, Spec §FR-020]
- [ ] CHK044 - Is the rule "quarantined source cannot be `supersedes` target → HTTP 409 `cannot_supersede_quarantined`" specified at both the requirement level AND in the API Error Code Matrix? [Completeness, Edge Cases, API Error Code Matrix]

## Requirement Clarity

- [ ] CHK045 - Is `'mutually exclusive'` (for inline columns based on `storage_kind`) defined precisely — is it "exactly one populated, others NULL" or "at most one populated"? Specifically for `storage_kind='file'`, is the requirement that BOTH `content_json` and `content_markdown` are NULL stated unambiguously? [Clarity, Spec §FR-020]
- [ ] CHK046 - Is "atomic file write" defined as "no observable partial canonical file even under crash/kill" rather than a vaguer "transactional"? [Clarity, Spec §FR-022, SC-006]
- [ ] CHK047 - Is "monotonic with the throttle clock" (re `triaged_at` and `unixepoch()`) defined operationally so reviewers can verify the throttle SQL predicate uses the same time source? [Clarity, Spec §FR-011, §FR-014]
- [ ] CHK048 - Is `'latest'` (in "latest non-superseded, non-quarantined `task_artifacts` row") defined operationally — is it ordered by `created_at`, by `id`, or by another column — so the population query is unambiguous? [Clarity, Spec §FR-040, Data §Entity 4]
- [ ] CHK049 - Is the precise semantics of `redaction_status='rejected'` (set by orphan repair, FR-022 cleanup, or both) defined so reviewers understand what `'rejected'` means at read time? [Clarity, Data §Entity 2 state transitions]
- [ ] CHK050 - Is "binary MIME" defined as a closed predicate (e.g., NOT in `{ text/*, application/json, application/x-yaml }`) rather than left implicit, so the binary-always-rejects rule (FR-034) and binary preview stub (FR-042) agree on the same boundary? [Clarity, Spec §FR-034, §FR-042]
- [ ] CHK051 - Is the term "canonical path" defined once and used consistently (vs `storage_uri`, vs "absolute path", vs "the artifact path") across FR-022, FR-023, FR-068? [Clarity, Consistency]
- [ ] CHK052 - Is the `_orphaned/<timestamp>/<original-relative-path>` template clear about whether `<original-relative-path>` includes or excludes the leading `artifacts/` prefix? [Clarity, Spec §FR-068]

## Requirement Consistency

- [ ] CHK053 - Do the `redaction_status` enum values used in state-transition diagrams (Data §Entity 2) match the FR-029 frozen tuple exactly with no extras or omissions? [Consistency, Spec §FR-029, Data §Entity 2]
- [ ] CHK054 - Do the `security_scan_status` enum values used in state diagrams, FR-067 (`hash_mismatch`), FR-068 (`file_missing`), and FR-029 frozen tuple match exactly? [Consistency, Spec §FR-029, §FR-067, §FR-068]
- [ ] CHK055 - Does the supersede selection predicate (`redaction_status NOT IN ('superseded','quarantined')`) used in FR-040 / Data §Entity 4 match the predicate intended by FR-027 / FR-066? [Consistency, Spec §FR-027, §FR-040, §FR-066]
- [ ] CHK056 - Are the `activities.type` values for SPEC-007 (`disposition_validation_failed`, `disposition_insert_failed`, `security_violation`, `artifact_*`) consistent across FR-013, FR-014, FR-032, FR-063, FR-066, and Data §Entity 5 — same spelling, same column (`type` not `kind`)? [Consistency, Spec §FR-014 ("note: column is `type`, not `kind`"), §FR-063, Data §Entity 5]
- [ ] CHK057 - Does the artifact-write column the spec calls `activities.type` match the code-level column name used in throttle predicates (FR-014, FR-032)? [Consistency]
- [ ] CHK058 - Does the inline ≤ 64 KiB threshold (FR-021) agree with whatever encoded-byte measurement the auto-promotion code path will compute (UTF-8 byte length, not JS `.length`)? [Consistency, Spec §FR-021]
- [ ] CHK059 - Do FR-022 (`fs.link`) and FR-023 (loser path triggered by `fs.link` EEXIST) reference the same primitive — no drift toward `linkSync` vs async `link` ambiguity? [Consistency, Spec §FR-022, §FR-023]
- [ ] CHK060 - Is the `storage_uri` "relative to `DATA_DIR`" convention applied consistently in FR-020, FR-022, FR-068, and the data-model field table? [Consistency]
- [ ] CHK061 - Do the 14 SPEC-007 `activities.type` values listed in Data §Entity 5 match the destructive-action set in FR-063 plus the unthrottled-and-throttled rows referenced in FR-014/FR-032/FR-065/FR-066? [Consistency, Spec §FR-063, Data §Entity 5]

## Requirement Measurability / Acceptance Criteria

- [ ] CHK062 - Can the "M058 inline-column mutual exclusion" requirement be objectively verified by a snapshot test or DB-level constraint check? Is the verification mechanism specified? [Measurability, Spec §FR-020, §FR-029]
- [ ] CHK063 - Can "no DB CHECK on `redaction_status`/`security_scan_status`" be objectively verified by inspecting `EXPLAIN`/`sqlite_master`? Is the test specified? [Measurability, Spec §FR-029]
- [ ] CHK064 - Can the atomic-write invariant ("zero partial canonical files across 500 publish crash-injection") be measured with the SC-006 acceptance test as written? [Measurability, Spec §SC-006]
- [ ] CHK065 - Can "canonical file is written exactly once even under N concurrent writers" be measured with a concrete test (e.g., inode count or sha256 of the canonical path == one)? [Measurability, Spec §FR-023]
- [ ] CHK066 - Can the "exactly one row inserted per triage-template completion" invariant be measured with a deterministic SQL query (e.g., `SELECT count(*) FROM task_dispositions WHERE task_id=?`)? [Measurability, Spec §FR-011, §SC-002]
- [ ] CHK067 - Are the success criteria in SC-001 through SC-010 each individually testable, with explicit pass/fail thresholds for the data-integrity surface? [Measurability, Spec §SC-001-§SC-010]
- [ ] CHK068 - Is the supersedes chain "latest = no row points to it" expressible as a SQL invariant query that test fixtures can assert? [Measurability, Data §Entity 2]

## Scenario Coverage — Race conditions on the same artifact_id chain

- [ ] CHK069 - Are requirements specified for **publish vs supersede race** on the same task: producer publishes A1; admin or another producer publishes A2 with `supersedes=A1` concurrently — is the expected ordering / serialization specified? [Coverage, Race, Resolved by Spec §Race Conditions — "Publish-with-supersedes vs concurrent supersede on the same predecessor (CHK069, CHK072)"]
- [ ] CHK070 - Are requirements specified for **publish vs quarantine race**: artifact A is being read at preview time while admin issues quarantine — is the read's outcome (200 with old preview vs 423) defined? [Coverage, Race, Resolved by Spec §Race Conditions — "Publish vs quarantine race (CHK070)"]
- [ ] CHK071 - Are requirements specified for **supersede vs quarantine race** on the same chain: A1 quarantined while A2 publish-with-supersedes=A1 is in flight — is the publish required to fail with 409 `cannot_supersede_quarantined` even if A1 became quarantined mid-request? [Coverage, Spec §FR-027, Resolved by Spec §Race Conditions — "Supersede vs concurrent quarantine of the predecessor (CHK071)"]
- [ ] CHK072 - Are requirements specified for **two concurrent supersedes targeting the same predecessor**: only one should win; the second should fail with a defined error code. Is the loser's error code specified? [Coverage, Race, Resolved by Spec §Race Conditions — "Publish-with-supersedes vs concurrent supersede on the same predecessor (CHK069, CHK072)" (`supersede_target_already_superseded` 409)]
- [ ] CHK073 - Are requirements specified for **supersede vs concurrent successor dispatch**: dispatch starts reading "latest non-superseded" while supersede transaction is committing. Does WAL snapshot guarantee correctness, and is this stated explicitly with a citation to the WAL behaviour? [Coverage, Spec §FR-027, §FR-040]
- [ ] CHK074 - Are requirements specified for **quarantine race during dispatch**: an artifact is quarantined between the dispatcher's read and the successor's preview rendering — is the dispatcher required to re-check quarantine state, or is a snapshot view acceptable? [Coverage, Race, Resolved by Spec §Race Conditions — "Quarantine vs concurrent dispatch (CHK074)"]
- [ ] CHK075 - Are requirements specified for **same-content concurrent publish vs supersede**: writer A publishes content X, writer B simultaneously publishes content X with `supersedes=existing-A1` — does the loser's `fs.link` EEXIST path coexist correctly with the supersede transaction? [Coverage, Race, Resolved by Spec §Race Conditions — "Same-content concurrent publish where one carries `supersedes` (CHK075)"]
- [ ] CHK076 - Are requirements specified for **publish failure mid-supersede transaction**: file write succeeded, supersede transaction failed (e.g., `BUSY`/`LOCKED`) — is retry policy defined, or is the file declared a healthy orphan reclaimed by FR-068? [Coverage, Spec §FR-027, §FR-068, Resolved by Spec §Race Conditions — "Supersede transaction failure mid-flight (CHK076)"]
- [ ] CHK077 - Is the cross-row invariant "at most one non-superseded, non-quarantined row per `(task_id, artifact_type)`" specified — including whether it must hold at all times outside the supersede transaction window? [Coverage, Consistency, Spec §FR-027]

## Edge Case Coverage

- [ ] CHK078 - Is the behaviour of `task_dispositions.disposition='unknown'` in the dashboard widget (FR-070) specified — does it render as a stacked-bar segment? [Edge Case, Spec §Edge Cases]
- [ ] CHK079 - Is the `preview_text` requirement for an artifact whose post-redaction content is empty defined (vs the FR-033 `redaction_would_empty_artifact` 422 path)? [Edge Case, Spec §FR-042, Edge Cases]
- [ ] CHK080 - Is behaviour for a 0-byte file or 0-byte inline payload specified — accepted with `byte_size=0`, rejected, or undefined? [Edge Case, Resolved by Spec §Edge Cases — "Zero-byte payloads (CHK080)" (HTTP 400 `empty_payload`)]
- [ ] CHK081 - Is behaviour for sha256 collision (FR-023 hash-mismatch in same-content path) classified as 500 + activity, and is this consistent with the API Error Code Matrix entry? [Edge Case, Spec §FR-023, API Error Code Matrix]
- [ ] CHK082 - Is the inline-column mutual exclusion requirement extended to existing `external_uri` legacy rows (both inline columns NULL on read) so the read-side helper does not blow up? [Edge Case, Spec §FR-020]
- [ ] CHK083 - Are clock-skew assumptions for `<yyyy>/<mm>` path sharding documented (server clock vs DB clock, leap seconds, daylight-savings)? [Edge Case, Resolved by Spec §Edge Cases — "Clock source for `<yyyy>/<mm>` path sharding (CHK083)" (UTC, `Date.now()` captured at request entry)]
- [ ] CHK084 - Is filesystem-case-insensitivity (macOS dev, Linux prod) addressed for the lowercase-hex sha256 path component? [Edge Case, Resolved by Spec §Edge Cases — "Filesystem case-insensitivity (CHK084)"]
- [ ] CHK085 - Is behaviour when `<DATA_DIR>` is full (ENOSPC) during write specified — does the publish return a known error code with the temp file cleaned up? [Edge Case, Resolved by Spec §Edge Cases — "`<DATA_DIR>` exhausted during write (ENOSPC) (CHK085)" (HTTP 507 `storage_exhausted`)]
- [ ] CHK086 - Is the orphan-repair tie-breaker behaviour specified when a file at `_orphaned/<timestamp>/<path>` already exists (rare, but possible on retry)? [Edge Case, Resolved by Spec §Edge Cases — "`_orphaned/` destination collision (CHK037, CHK086)"]

## Non-Functional / Crash Safety / Durability

- [ ] CHK087 - Are crash-safety durability requirements (fsync of file AND parent dir) tied to a specific reliability outcome (e.g., "after `kill -9` post-link, the canonical file survives reboot")? [NFR, Spec §FR-022, §SC-006]
- [ ] CHK088 - Is the WAL snapshot-isolation reliance for FR-027 supersede + FR-040 dispatch documented as a hard dependency, with the SQLite `journal_mode=WAL` configuration cited as upstream invariant? [NFR, Spec §FR-027]
- [ ] CHK089 - Is the in-process p95 ring buffer specified as ephemeral with the no-DB-persistence and reset-on-restart invariants explicitly stated, so reviewers don't add silent persistence? [NFR, Spec §FR-028, Data §Entity 6]
- [ ] CHK090 - Are the durability guarantees for `task_dispositions` inserts specified — explicit transaction semantics, no batching, no async write-back? [NFR, Spec §FR-011]
- [ ] CHK091 - Is the post-commit timing requirement stated quantitatively ("within ±2s of task transition commit time")? [NFR, Spec §SC-002, US2 Independent Test]

## Dependencies & Assumptions

- [ ] CHK092 - Is the assumption that M057 / M058 / M054 already exist with the intended columns and indexes from SPEC-001 stated AND tied to a verification step (e.g., migration phase-0 test reference)? [Assumption, Spec §Assumptions]
- [ ] CHK093 - Is the dependence on `unixepoch()` SQL function (SQLite) declared as a portability constraint (no MariaDB/PostgreSQL fallback)? [Assumption, Dependency]
- [ ] CHK094 - Is the dependence on POSIX `link(2)` semantics (atomic, EEXIST on collision) explicit, including the deployment-target filesystems where this holds (ext4, xfs, APFS, Docker overlay2 + named volume)? [Assumption, Spec §FR-022, Dependency]
- [ ] CHK095 - Is the assumption "no object-storage adapter in v1" declared so reviewers know FR-022 is local-disk only? [Assumption, Spec §Assumptions]
- [ ] CHK096 - Is the dependence on SPEC-002's `resolveFlag` (per-workspace flag resolution, not env-var override) cited so reviewers confirm both flags route through it? [Assumption, Spec §FR-001, §FR-002]
- [ ] CHK097 - Is the dependence on SPEC-004's `task_pipeline` namespace inside `tasks.metadata` cited — and is the SPEC-007 `input_artifacts` key explicitly declared as a SIBLING (not nested) of that namespace? [Assumption, Spec §FR-040]

## Ambiguities / Conflicts / Gaps

- [ ] CHK098 - Is there a documented decision on whether the M058 DB CHECK on `storage_kind` is pre-existing (enforced) vs spec-introduced — the spec states "(already in schema)" but is the enforcement responsibility (migration vs requirement) made unambiguous? [Ambiguity, Spec §FR-020, Data §Entity 2]
- [ ] CHK099 - Does any requirement conflict between "publish path REJECTS `external_uri`" (FR-020) and the data-model statement "`storage_uri` required for `file` AND existing `external_uri` rows"? Is the read-side legacy support clearly distinguished from the write-side rejection? [Conflict, Spec §FR-020, Data §Entity 2]
- [ ] CHK100 - Is the `'rejected'` value in `redaction_status` overloaded — used by orphan repair (file_missing) and potentially other failure modes? Is the overload documented or split into distinct values? [Ambiguity, Data §Entity 2]
- [ ] CHK101 - Is there an unresolved ambiguity about WHO clears `.tmp.*` siblings (the current request's catch handler vs the FR-068 sweep) and on what schedule? [Ambiguity, Spec §FR-022, Edge Cases]
- [ ] CHK102 - Is the "loser's tmp file unlink" step (FR-023 step 2) specified as best-effort vs required, given that a leftover tmp file becomes an orphan reclaimed by FR-068? [Ambiguity, Spec §FR-023]
- [ ] CHK103 - Does the spec resolve the ambiguity of which clock generates `<yyyy>/<mm>` path components (server `Date.now()` vs DB `unixepoch()`) — important if the supersede transaction crosses month boundary? [Ambiguity, Spec §FR-022]
- [ ] CHK104 - Is the requirement for `triaged_by_agent_id` nullability consistent — schema says nullable (no NOT NULL), spec says "MUST equal completing task's `agent_id`"; what if the completing task has no `agent_id`? [Ambiguity, Spec §FR-011, Data §Entity 1]

## Traceability

- [ ] CHK105 - Does every requirement in the data-integrity scope (FR-010 through FR-029, FR-068) carry a unique FR-ID and at least one acceptance scenario reference? [Traceability]
- [ ] CHK106 - Is the cross-cutting validation table in data-model.md kept synchronized with the FR-IDs in spec.md (no orphan FR, no orphan validation)? [Traceability, Data §Cross-cutting validation]
- [ ] CHK107 - Are all 14 SPEC-007 `activities.type` values traceable to a specific FR that emits them? [Traceability, Data §Entity 5]
