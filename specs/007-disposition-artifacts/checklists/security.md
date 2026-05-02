# Specification Quality Checklist: Security

**Purpose**: Validate the QUALITY of SPEC-007 security requirements (completeness, clarity, consistency, measurability, coverage) — NOT verify implementation behavior.
**Created**: 2026-05-01
**Feature**: [007-disposition-artifacts/spec.md](../spec.md)
**Domain Focus**: Secret detection, reject-by-default, redact-and-store opt-in, workspace scope at publish, quarantine read-side, admin-action audit, hash-verify/orphan-repair evidence preservation, API error matrix, detectSecrets bypass surfaces.

## Detector Rule Coverage Quality

- [ ] CHK001 - Is the v1 secret-detector rule list closed and exhaustively enumerated (all 17 families) with no implicit transitive inclusions? [Completeness, Spec §FR-031]
- [ ] CHK002 - Are positive-fixture and negative-fixture requirements specified per rule family (≥1 each) with the location and synthesis policy explicit? [Completeness, Spec §FR-031, §"Spec Evidence And Archive Policy"]
- [ ] CHK003 - Is the wild-corpus floor quantified with line count (≥50) AND recall threshold (≥0.95) AND failure semantics (CI fails)? [Measurability, Spec §FR-035, §SC-004]
- [ ] CHK004 - Is `safe-regex` rejection specified as a CI-blocking gate (not warning) and is the load-time enforcement scope stated? [Clarity, Spec §FR-035, plan.md Constitution Check IX]
- [ ] CHK005 - Are v2-deferred rule families named explicitly so the v1 floor is auditable and v2 has a target? [Completeness, Spec §"Detector v2 Deferrals"]
- [ ] CHK006 - Is the rule-promotion path from v2 deferral into v1 governed by an explicit "positive + negative + wild-corpus update" precondition? [Clarity, Spec §"Detector v2 Deferrals" closing paragraph]
- [ ] CHK007 - Is the canonical regex storage location (`src/lib/secret-detector.rules.ts`) and "single canonical regex per family" rule specified? [Completeness, Spec §FR-031]
- [ ] CHK008 - Is the detector exit contract (`{ findings: SecretFinding[], redacted: string|Buffer }`) defined for both string and Buffer inputs? [Completeness, Spec §FR-030]
- [ ] CHK009 - Are pattern-provenance attribution requirements stated (gitleaks v8.18.0 base + named MC additions)? [Traceability, Spec §FR-031]

## Reject-By-Default Path Quality

- [ ] CHK010 - Is the reject trigger condition quantified exactly (`findings ≥ 1`)? [Clarity, Spec §FR-032]
- [ ] CHK011 - Are the three reject side effects (HTTP 422, redacted preview body, `security_violation` activity) specified in a single source of truth? [Completeness, Spec §FR-032, §"API Error Code Matrix"]
- [ ] CHK012 - Is the `security_violation` activity throttle predicate specified verbatim with all four clauses (`type`, `entity_type`, `entity_id`, `created_at`) AND the 60-second window? [Clarity, Spec §FR-032]
- [ ] CHK013 - Is the throttle granularity unambiguous: exactly one row per `(task_id, type)` per 60s, regardless of finding count or rule diversity? [Clarity, Spec §FR-032 vs. §FR-014]
- [ ] CHK014 - Is the activity-write failure mode specified (logged, does NOT rethrow) so detector failures cannot mask publish rejections? [Completeness, Spec §FR-032]
- [ ] CHK015 - Are the contents of the redacted-preview body (length, format, placeholder semantics) defined or explicitly deferred? [Clarity, Spec §FR-032 / Edge Cases — `redaction_would_empty_artifact`]
- [ ] CHK016 - Is the "violations attempted but throttled" counter requirement quantified (where surfaced, reset semantics)? [Clarity, Spec §US4 Acceptance Scenario 2]
- [ ] CHK017 - Is the response body shape for 422 (`{ error: 'secret_detected', redacted_preview, findings }`) reconciled with the "no generic `code` field" project convention? [Consistency, Spec §"API Error Code Matrix"]

## Redact-And-Store Opt-In Quality

- [ ] CHK018 - Are the two opt-in preconditions (template flag `allow_redacted_artifacts=1` AND MIME ∈ allowed text-like set) specified with AND semantics, not OR? [Clarity, Spec §FR-033]
- [ ] CHK019 - Is the text-like MIME set enumerated exactly (`text/*`, `application/json`, `application/x-yaml`)? [Completeness, Spec §FR-033]
- [ ] CHK020 - Is the binary-with-findings reject rule specified as overriding the opt-in (HTTP 422 always, regardless of flag)? [Consistency, Spec §FR-034 vs. §FR-033]
- [ ] CHK021 - Are post-redaction status fields specified (`redaction_status='redacted'` AND `security_scan_status='scanned_with_findings'`)? [Completeness, Spec §FR-033]
- [ ] CHK022 - Is the "redaction would empty the artifact" edge case specified with deterministic outcome (HTTP 422 `redaction_would_empty_artifact`) rather than storing a degenerate row? [Edge Case, Spec §"Edge Cases", §"API Error Code Matrix"]
- [ ] CHK023 - Is the placeholder/replacement convention for redacted secrets specified (stable placeholder per US4 AC3)? [Clarity, Spec §US4 Acceptance Scenario 3]
- [ ] CHK024 - Is the relationship between `workflow_templates.allow_redacted_artifacts` (M054) and the publish-time check explicit (per-template, NOT per-workspace, NOT per-task)? [Clarity, Spec §FR-033, §"Assumptions"]

## Workspace Scope At Publish Quality

- [ ] CHK025 - Is "producer task's workspace_id wins" stated as the single source of truth (NOT session, NOT URL, NOT body)? [Clarity, Spec §FR-026]
- [ ] CHK026 - Is the non-Facility mismatch outcome quantified (HTTP 403 `workspace_mismatch`, no row, no file)? [Completeness, Spec §FR-026, §"API Error Code Matrix"]
- [ ] CHK027 - Is the Facility-scoped session cross-workspace allowance specified explicitly (storage still happens under producer's `workspace_id`, not session's)? [Consistency, Spec §FR-026, §US3 AC6]
- [ ] CHK028 - Is the storage path workspace component (`<DATA_DIR>/artifacts/<workspace_id>/...`) tied to the producer's workspace, not the session's? [Consistency, Spec §FR-022, §FR-026]
- [ ] CHK029 - Is workspace scope at successor dispatch (which workspace's artifacts populate `metadata.input_artifacts`) specified? [Coverage, Spec §FR-040]

## Quarantine Read-Side Quality

- [ ] CHK030 - Are the two read-side preconditions for quarantine bypass (`?include_quarantined=1` AND admin role) specified with AND semantics? [Clarity, Spec §FR-065]
- [ ] CHK031 - Is the default-locked HTTP status quantified as 423 with body `{ error: 'artifact_locked', artifact_id }`? [Completeness, Spec §FR-065, §"API Error Code Matrix"]
- [ ] CHK032 - Is reversibility of quarantine specified (un-quarantine restores prior status)? [Coverage, Spec §FR-062, §US7 Independent Test (c)]
- [ ] CHK033 - Is the "successful admin override read writes one UNTHROTTLED `artifact_quarantined_read_overridden` activity per access" rule stated as a hard contract (Constitution Principle X + NIST AU-2 traceability)? [Traceability, Spec §FR-065]
- [ ] CHK034 - Is the audit-row payload schema for override reads specified (`artifact_id`, `actor_session_id`, `actor_user_id`, `requested_at`)? [Completeness, Spec §FR-065]
- [ ] CHK035 - Is the throttle exclusion for `artifact_quarantined_read_overridden` re-stated where the throttle pattern is defined (FR-014, FR-032), so a future maintainer cannot accidentally apply it? [Consistency, Spec §FR-065 vs. §FR-014/§FR-032, plan.md Observability Notes]
- [ ] CHK036 - Is the metadata-only stub body returned with 423 specified (what fields appear, what is omitted)? [Clarity, Spec §FR-065]
- [ ] CHK037 - Is non-admin override behavior specified (still 423 even with `?include_quarantined=1`)? [Edge Case, Spec §FR-065]
- [x] CHK038 - Is the "no audit row written for failed override attempts" boundary clear (so the audit row is the success-only marker)? [Resolved by FR-065 — audit row written ONLY on successful 200 override reads; failed attempts (423) do NOT write artifact_quarantined_read_overridden]

## Admin Destructive Actions Quality

- [ ] CHK039 - Is the closed set of destructive `activities.type` values enumerated exactly (8 in FR-063)? [Completeness, Spec §FR-063]
- [ ] CHK040 - Is the per-action audit payload schema fully specified (`artifact_id`, `actor_session_id`, `reason`, `before_status`, `after_status`)? [Completeness, Spec §FR-063]
- [ ] CHK041 - Is the "existing admin guard reused" requirement traceable to the specific guard primitive (no new admin-role primitive introduced)? [Consistency, Spec §FR-062, §"Assumptions"]
- [ ] CHK042 - Is the non-admin failure path quantified for every destructive endpoint (HTTP 403, no state change, no audit row written)? [Coverage, Spec §US7 AC7, §SC-008]
- [ ] CHK043 - Is the reason-text requirement for destructive actions specified (free text, required, captured in payload)? [Clarity, Spec §FR-063 — `reason` field shape unspecified; Ambiguity]
- [x] CHK044 - Is the audit-write atomicity requirement specified (action + audit row in one transaction, no partial states)? [Resolved by FR-063 — single-transaction action+audit; FS step before transaction]
- [ ] CHK045 - Are the boundaries between destructive-action audit (FR-063) and the privileged-read audit (FR-065) called out so future authors do not collapse them? [Consistency, Spec §FR-063 closing sentence]

## Hash-Verify And Orphan-Repair Evidence Preservation

- [ ] CHK046 - Is the "never auto-quarantine on hash mismatch" rule stated as a hard prohibition? [Clarity, Spec §FR-067]
- [ ] CHK047 - Is the "never auto-delete" rule stated for both orphan-repair branches (DB-without-file AND file-without-row)? [Clarity, Spec §FR-068]
- [ ] CHK048 - Are the two orphan-repair branch outcomes specified deterministically (status flip vs. archive move with timestamped path)? [Completeness, Spec §FR-068]
- [ ] CHK049 - Is the FS-orphan target path schema (`<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`) specified so admins can recover? [Completeness, Spec §FR-068]
- [ ] CHK050 - Is hash-verify activity-row writing specified with payload (mismatch detail) and outcome (status flip only, no quarantine, no delete)? [Completeness, Spec §FR-067]
- [x] CHK051 - Is the hash-mismatch read-side semantics specified (does the artifact still serve content? does it return a new error?) — or explicitly deferred? [Resolved by FR-067 — read remains accessible; security_scan_status='hash_mismatch' surfaced in response body; quarantine remains explicit admin action]
- [ ] CHK052 - Is the activity type for hash-verification mismatch fixed (`artifact_hash_verified` per FR-067 vs. `artifact_hash_verification_failed` per FR-023) and is the distinction documented? [Consistency, Spec §FR-067 vs. §FR-023]
- [ ] CHK053 - Are concurrent same-content writers (FR-023) specified as evidence-preserving (canonical file written exactly once, both rows valid)? [Completeness, Spec §FR-023]
- [ ] CHK054 - Is the "extremely rare sha256 collision" branch outcome specified (HTTP 500, hash-mismatch row, audit activity) and never silently dropped? [Edge Case, Spec §FR-023]

## API Error Matrix Authority

- [ ] CHK055 - Is the API Error Code Matrix declared as the single authoritative contract (no other status codes permitted for covered scenarios)? [Clarity, Spec §"API Error Code Matrix" preamble]
- [ ] CHK056 - Is the body shape `{ error: '<code_string>', ...domain_fields }` specified consistently across every row in the matrix? [Consistency, Spec §"API Error Code Matrix"]
- [ ] CHK057 - Is the "no generic `code` field" rule explicit so domain-specific fields stay inline? [Clarity, Spec §"API Error Code Matrix" preamble]
- [ ] CHK058 - Are all three SPEC-007 endpoints (`POST /api/task-artifacts`, `GET /api/task-artifacts/[id]`, `GET /api/dispositions`) covered by matrix rows for every published failure mode? [Coverage, Spec §"API Error Code Matrix"]
- [ ] CHK059 - Are publish-side conditions enumerated for each status code class (400, 401, 403, 409, 413, 415, 422, 500, 503) without overlap or gaps? [Completeness, Spec §"API Error Code Matrix"]
- [ ] CHK060 - Are read-side conditions enumerated for each status code class (401, 403, 404, 423, 503)? [Completeness, Spec §"API Error Code Matrix"]
- [ ] CHK061 - Is the dispositions-API matrix coverage parallel to artifact-API matrix coverage (auth, workspace, cursor, flag-off)? [Consistency, Spec §"API Error Code Matrix" §FR-080/FR-081]
- [ ] CHK062 - Is contract-test enforcement of the matrix specified (every row is tested)? [Measurability, Spec §"API Error Code Matrix" preamble]
- [x] CHK063 - Is the `redacted_preview` body field shape specified (string? truncation length? encoding?) for the 422 secret_detected response? [Resolved by FR-032 — UTF-8 string ≤4 KiB; binary stub for binary MIMEs; no rule names / matched substrings / offsets]

## detectSecrets Bypass Surfaces (No-Bypass Discipline)

- [x] CHK064 - Is `publishArtifact` specified as the SOLE entry point for new `task_artifacts` rows (no direct DB inserts permitted from outside this function)? [Resolved by FR-035a clause 1 — sole creation entry point + FR-100 strict-scope grep]
- [ ] CHK065 - Is the requirement that detectSecrets runs BEFORE any storage write (DB row OR file) stated explicitly? [Clarity, Spec §US4 narrative]
- [x] CHK066 - Are rebuild-previews / repair-orphans / retention-sweep paths specified as preserving the existing `redaction_status` / `security_scan_status` fields rather than re-running the detector and potentially bypassing rejection? [Resolved by FR-035a clause 5 — repair/rebuild/sweep MUST preserve scan/redaction status, MUST NOT re-evaluate]
- [x] CHK067 - Is the `supersedes` republish path specified to re-run detectSecrets on the new content (cannot inherit cleanliness from the predecessor)? [Resolved by FR-035a clause 3 — supersedes MUST re-run detector; cleanliness MUST NOT be inherited]
- [ ] CHK068 - Is the successor-dispatch `metadata.input_artifacts` payload constrained to non-quarantined rows so a quarantined-but-still-clean-on-read artifact cannot leak via dispatch? [Coverage, Spec §FR-040, §FR-066]
- [ ] CHK069 - Is `preview_text` materialization specified as post-redaction so previews never carry raw secrets even for redact-and-store rows? [Coverage, Spec §FR-020, §FR-042]
- [x] CHK070 - Is the absence of any "skip detector" admin override explicitly stated (no admin bypass of the gate)? [Resolved by FR-035a clause 4 — admin guard does NOT expose detector-skip; admin publishes traverse publishArtifact identically]
- [ ] CHK071 - Is the strict-scope discipline (FR-100) requirement that `secret-detector.ts`/`secret-detector.rules.ts` live in 6 declared files (with grep enforcement) specified to prevent silent forks of the detector? [Coverage, Spec §FR-100]
- [x] CHK072 - Is the disposition-write path specified as NOT triggering detectSecrets (and the `reason` free-text field's secret-leak risk acknowledged or explicitly out of scope)? [Resolved by FR-035a clause 6 — disposition write path explicitly out of artifact-detector scope; secret-leak protection deferred to future spec]
- [ ] CHK073 - Are activity-row payloads (which can include agent output JSON for `disposition_validation_failed`) specified as detector-scanned, redacted, or explicitly out of scope? [Edge Case, Spec §FR-013 — partial: FR-035a clause 6 marks disposition write path out of artifact-detector scope; whether activity payloads should themselves carry secret-leak protections is a policy decision deferred to consensus]
- [ ] CHK074 - Is the "external_uri publish rejection" (HTTP 400) specified to prevent a publish-without-detector-scan path? [Coverage, Spec §FR-020, §"API Error Code Matrix"]

## Aegis Hook Security Contract

- [ ] CHK075 - Are the two Aegis failure reasons enumerated as a closed `as const` tuple (`secret_in_artifact`, `disposition_validation_failed`)? [Completeness, Spec §FR-090]
- [ ] CHK076 - Is `evaluateSpec007AegisSignals` specified to inspect ONLY `activities` (security_violation) and `task_dispositions` (`disposition='unknown'`), with no other signal sources? [Clarity, Spec §FR-090]
- [ ] CHK077 - Is the call-order requirement specified (`evaluateSpec007AegisSignals` runs BEFORE other `runAegisReviews` checks)? [Clarity, Spec §FR-090]
- [ ] CHK078 - Is the precedence between `secret_in_artifact` and `disposition_validation_failed` specified when both signals fire (US4/Edge Cases — both reasons appear in summary)? [Coverage, Spec §"Edge Cases" — Aegis review window]
- [ ] CHK079 - Is the boundary between SPEC-007 Aegis behavior and SPEC-003 / SPEC-004 Aegis behavior preserved by spec text (no extraction of `runAegisReviews`, no other Aegis changes)? [Consistency, Spec §FR-090]

## Activity Type Closure And Audit Surface

- [ ] CHK080 - Are all 14 new `activities.type` values enumerated in §"Key Entities" matching the destructive set (FR-063) + privileged-read (FR-065) + dispatch-skip (FR-066) + disposition (FR-013, FR-014)? [Completeness, Spec §"Key Entities"]
- [ ] CHK081 - Is the column name (`activities.type`, NOT `kind`) called out wherever the field is referenced, since the spec text mixes `kind` and `type`? [Consistency, Spec §FR-014, §FR-063 vs. §FR-013, §FR-066, §FR-067]
- [ ] CHK082 - Is the `disposition_validation_failed` activity payload (full agent-output JSON) specified to NOT contain raw artifact bytes that bypassed the detector? [Edge Case, Spec §FR-013 — open: spec text says "full agent-output payload" without bounding it; whether activity payloads should be constrained or detector-scanned is a policy decision deferred to consensus]
- [x] CHK083 - Is the dispatch-skip audit row (`artifact_skipped_quarantined_in_dispatch`) specified with payload sufficient for forensic reconstruction (artifact_id, task_id, reason)? [Resolved by FR-066 — payload includes artifact_id, producer_task_id, successor_task_id, workspace_id, reason; one row per skip, unthrottled]
- [x] CHK084 - Is the retention-sweep summary row (`artifact_retention_swept`) payload specified (counts archived, counts deleted, workspace, policy snapshot)? [Resolved by FR-069 — payload includes workspace_id, actor_session_id, policy_snapshot, counts, started_at/completed_at]

## Cross-Spec Consistency

- [ ] CHK085 - Is the throttle-pattern reuse across FR-014, FR-032 stated as identical SQL with identical 60s window (so a future change updates both)? [Consistency, Spec §FR-014, §FR-032]
- [ ] CHK086 - Is the `kind` vs. `type` column ambiguity in §US2 / §US4 / §US7 acceptance scenarios reconciled with the FR-013/FR-014/FR-063 normative text that mandates `type`? [Consistency, Ambiguity]
- [ ] CHK087 - Is the relationship between `redaction_status='quarantined'` (set by admin) and `security_scan_status` (set by scan path) specified so they cannot become contradictory? [Consistency, Spec §FR-029 enums, §FR-065, §FR-067]
- [ ] CHK088 - Are the enum tuples (`REDACTION_STATUSES`, `SECURITY_SCAN_STATUSES`) declared as the single source of truth with EXPLAIN-snapshot test enforcement (no DB CHECK constraint)? [Completeness, Spec §FR-029]
- [ ] CHK089 - Is the relationship between the secret-detector activity audit and Aegis-failure FAIL signal specified so a `security_violation` activity always flows to an Aegis FAIL? [Consistency, Spec §FR-032, §FR-090]

## Measurability And Acceptance Criteria

- [ ] CHK090 - Is detector recall (≥0.95) tied to a specific test fixture (`wild-corpus.txt`, ≥50 lines) so the metric is reproducible? [Measurability, Spec §FR-035, §SC-004]
- [ ] CHK091 - Is the "100% rejection of in-content secret patterns at wild-corpus scale" outcome of SC-004 reconcilable with "≥0.95 recall" (e.g., is the 5% miss tolerated, or are pre-redaction rejects required for 100% of corpus lines)? [Consistency, Spec §SC-004 vs. §FR-035]
- [ ] CHK092 - Is the audit-row count for admin destructive actions specified as exactly one per action (SC-008)? [Measurability, Spec §SC-008]
- [ ] CHK093 - Is the override-read audit count specified as exactly one row per access (FR-065 — unthrottled, no batching)? [Measurability, Spec §FR-065]
- [ ] CHK094 - Are crash-resilience guarantees quantified (zero partial canonical files across a 500-publish crash-injection test)? [Measurability, Spec §SC-006]
- [ ] CHK095 - Is the strict-scope grep gate (SC-010) specified with both required-include semantics (the 6 files MUST be in strict scope) AND prohibited-add semantics (no other SPEC-007 files may enter)? [Measurability, Spec §SC-010]

## Edge Cases And Recovery

- [ ] CHK096 - Is the "republish supersedes a quarantined source" outcome specified (HTTP 409 `cannot_supersede_quarantined`)? [Edge Case, Spec §"Edge Cases", §"API Error Code Matrix"]
- [ ] CHK097 - Are crash-during-write semantics specified (`.tmp.*` sibling, never partial canonical, orphan-repair recovers)? [Recovery, Spec §"Edge Cases", §FR-022, §FR-068]
- [ ] CHK098 - Is the "Aegis review window crosses both `security_violation` and `disposition='unknown'`" multi-reason summary specified? [Edge Case, Spec §"Edge Cases"]
- [ ] CHK099 - Are existing `external_uri` rows specified as continuing to render on read while new `external_uri` writes are rejected (rollback safety for legacy rows)? [Recovery, Spec §FR-020, §"Assumptions"]
- [x] CHK100 - Is rollback safety preserved for the security path (flag OFF → publish API returns 503; existing secrets-stored rows from flag-ON window remain inspectable via admin guard)? [Resolved by FR-002 — both publish AND read return 503 when flag OFF; pre-existing rows (quarantined/redacted) are NEVER auto-deleted/archived/mutated; orphan-repair MUST NOT run while flag OFF; data preserved verbatim for re-enable]
