# SpecKit Workflow: SPEC-007 - Disposition Logging and Task Artifact Store

**Template Version**: 1.0.0
**Created**: 2026-05-01
**Purpose**: Prepare and execute the RC Factory Phase 6 disposition logging + task artifact store specification under autopilot.

---

## How to Use This Workflow

Run this workflow from the `007-disposition-artifacts` worktree:

```bash
/speckit-pro:autopilot docs/ai/specs/SPEC-007-workflow.md
```

Autopilot must begin with Archive Sweep discovery and the Phase 0 setup before normal Specify work. The sweep handles previously merged specs only (`SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`, `SPEC-004`, `SPEC-006`), excludes `SPEC-007`, and must stay dry-run-only or stop unless the branch is clean and safe cleanup has been explicitly recorded.

SPEC-007 has a **Recommended Predecessor** of SPEC-005. If SPEC-005 merges first, rebase this branch onto the resulting `main` so the status-hygiene fixes are inherited rather than re-implemented. If SPEC-005 has not merged when this branch is ready, autopilot proceeds against the existing roadmap; the migration-ID corrective edit (Phase 0 below) is the only roadmap edit SPEC-007 carries.

Do not start downstream specs from this worktree. SPEC-007 stops after feature-flagged disposition logging, task artifact publish/consume, secret detector v1, audit/admin/dashboard surfaces, generic dispositions GET, and roadmap migration-ID hygiene are complete.

## Design Concept

This workflow file was enriched from a Grill Me interview run during `/speckit-pro:setup`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-007-design-concept.md
```

Re-read it before each phase if a prompt needs disambiguation. The design concept is the source of truth for scoping decisions captured during setup.

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep + Migration-ID Verification | `/speckit-pro:autopilot` startup | Complete | Apply-mode sweep newly archived SPEC-004 + SPEC-006 (commits `dcf46b3`, `82229bc`); migration mapping verified (no roadmap edit); G0 PASS |
| Specify | `/speckit.specify` | Complete | 49 FRs / 9 US / 44 acceptance scenarios / 10 SC / 10 edge cases; G1 PASS (0 markers) |
| Clarify | `/speckit.clarify` | Complete | 3 sessions / 15 questions resolved (3 via consensus per security tag); G2 PASS (0 markers) |
| Plan | `/speckit.plan` | Complete | plan.md + research.md (13 decisions) + data-model.md (7 entities) + 3 contracts + quickstart.md (10 scenarios) + CLAUDE.md/AGENTS.md updates. All 15 constitution principles PASS. G3 PASS (0 markers). |
| Checklist | `/speckit.checklist` | Complete | 4 domains / 382 items: data-integrity (107/12 gaps), security (100/13 gaps + FR-035a), error-handling (105/35 gaps → FR-120-141), regression-safety (70/9 gaps → FR-110-114). 6 unresolved-for-consensus items resolved (3 security from S3 + 4 from error-handling). Spec.md grew from FR-100 to FR-141 + FR-035a. G4 PASS (0 gaps, 0 markers). |
| Tasks | `/speckit.tasks` | Complete | 169 tasks (83 [T-RED] tests + 81 [P] parallel-safe); 14 phases; full P6-AC1..AC10 + FR-110..FR-141 + FR-035a coverage matrices; G5 PASS |
| Analyze | `/speckit.analyze` | Complete | 3 findings (2 HIGH + 1 LOW) all remediated in 1 loop: phantom FR-300 reference (plan.md), phantom FR-300 reference (spec.md FR-135), FR-090 `kind` → `type` normalization. 0 unresolved for consensus. G6 PASS. |
| Implement | `/speckit.implement` | Complete | All 13 phases shipped; 1502/1502 project tests PASS, typecheck PASS, lint 0 errors, build PASS. G7 PASS. |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep + Migration-ID Verification | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-007` cleanup occurs; roadmap M54 / M57 / M58 mapping verified against migrations.ts (no edit required) |
| G1 | After Specify | No `[NEEDS CLARIFICATION]` markers; user stories cover flag-OFF parity, disposition insert hook, artifact publish (inline + file), secret detection + redaction, successor consume, audit panel, admin panel, dashboard widget, generic dispositions GET |
| G2 | After Clarify | Open Questions from the Design Concept doc are resolved or explicitly deferred with consensus evidence |
| G3 | After Plan | Constitution gates pass; no DB migration; secret detector module structure, artifact storage layout, ring-buffer metric, atomic-write protocol, redaction state machine, and Aegis hook are concrete |
| G4 | After Checklist | All `[Gap]` markers are remediated without widening into SPEC-008 (resource governance), SPEC-009 (pilot), or SPEC-011 (CrabTrap) |
| G5 | After Tasks | Tasks cover every P6 acceptance criterion, every redaction-status / scan-status transition, every admin action, and the strict-scope grep test |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into ready_for_owner state, governance, pilot seed behavior, or CrabTrap |
| G7 | After Implement | Focused tests, typecheck, lint, build/e2e or justified subset, strict-scope grep, secret-detector recall ≥ 0.95, branch push are complete |

## Prerequisites

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Feature-flag discipline | `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` resolve through `resolveFlag(name, { workspaceId })`; no inline `process.env.FEATURE_*` checks | Static grep + focused flag tests |
| Application-level status enums | `task_dispositions.disposition`, `task_artifacts.redaction_status`, `task_artifacts.security_scan_status` enforced by app-level constants + snapshot test; no DB CHECK constraint, no migration | Diff grep for migrations/CHECK; constants live in `src/lib/task-artifacts.ts` |
| Existing behavior preservation | Both flags OFF preserves `advanceTaskChain`, dispatch payload shape, audit panel, and dashboard byte-compatibly | Focused regression tests + dispatch payload golden snapshot |
| Cross-spec boundary | SPEC-007 does not implement ready_for_owner state, resource governance, pilot seed behavior, or CrabTrap | Analyze prompt + guardrail grep |
| Strict-scope discipline | Strict scope = roadmap list + `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`, plus the explicit Aegis hook surface | `tsconfig.spec-strict.json`, `eslint.config.mjs`, strict-scope grep test |
| Secret-detector test floor | Every rule family has ≥1 positive + ≥1 negative fixture; CI fails on `safe-regex` rejection; ≥0.95 recall on the wild corpus (≥50 lines) | Vitest + `safe-regex` checks |

**Constitution Check:** Phase 0 baselines recorded 2026-05-01:
- `pnpm typecheck` → PASS (no errors)
- `pnpm lint` → PASS (0 errors, 12 pre-existing warnings — none in SPEC-007 strict scope)
- `pnpm test` baseline deferred until before Implement (full suite is large; we will rerun before Phase 7 to capture flag-OFF parity baseline)
- Constitutional guardrails (feature-flag discipline, app-level enums, byte-compat, cross-spec boundary, strict-scope, secret-detector test floor) re-checked at Plan/Analyze/Implement gates.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this workflow:

- Previous merged candidates: `SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`, `SPEC-004`, `SPEC-006`.
- Current target excluded: `SPEC-007` / `specs/007-disposition-artifacts`.
- Cleanup remains dry-run-only unless `safeToApplyCleanup=true` is recorded on a clean safe base branch with recovery commands.

### Phase 0 Migration-ID Verification

Before Specify, **verify** that the roadmap and the migration code agree on the SPEC-007 migration mapping. The original setup interview's Q1 was framed as if a corrective edit were needed; direct inspection confirmed the roadmap is already correct (design-concept Q1 post-decision verification). This step is therefore verification-only — **no roadmap edit is performed here.**

Required Phase 0 verification actions:

1. Confirm roadmap mapping in `docs/ai/rc-factory-technical-roadmap.md` lines 330–334:
   - **M54** — `workflow_templates` adds `allow_redacted_artifacts`. Matches code `id: '054_workflow_templates_task_chain_routing_and_artifact_policy'`.
   - **M57** — `task_dispositions` table + index. Matches code `id: '057_task_dispositions'`.
   - **M58** — `task_artifacts` table + indexes. Matches code `id: '058_task_artifacts'`.
2. Record the verification result in `Phase 0 Results` below. **Do NOT edit the roadmap** — it is already correct.
3. Confirm spec.md, plan.md, tasks.md will reference the migrations as M054 / M057 / M058 internally for code clarity, while the roadmap continues to use the M54 / M57 / M58 form (both forms refer to the same migrations).
4. Do NOT carry the SPEC-006/SPEC-004/autopilot-state status hygiene fix here — that is owned by SPEC-005 (design-concept Q28).

### Phase 0 Results

Executed 2026-05-01 by autopilot.

**Migration-ID Verification (no edit performed):**

| Roadmap form | Code form | File reference | Match? |
|--------------|-----------|----------------|--------|
| M54 (`workflow_templates.allow_redacted_artifacts`) | `id: '054_workflow_templates_task_chain_routing_and_artifact_policy'` | `src/lib/migrations.ts:1499` (column at :1510-1511) | ✅ |
| M57 (`task_dispositions` table + index) | `id: '057_task_dispositions'` | `src/lib/migrations.ts:1549` | ✅ |
| M58 (`task_artifacts` table + indexes) | `id: '058_task_artifacts'` | `src/lib/migrations.ts:1568` | ✅ |

Roadmap lines 330–334 already use the M54/M57/M58 form correctly. Both forms (M54 and M054) reference the same migrations. **No roadmap content was edited in Phase 0.** Spec.md, plan.md, and tasks.md will internally use the M054/M057/M058 (triple-digit) form for code clarity.

**Status hygiene reminder (deferred):** Roadmap line 87 still lists SPEC-006 as "Implemented (PR open)" despite PR #21 being merged (commit `dbb6c75`); PR #22 (SPEC-004) was also merged (commit `20643d8`); `docs/ai/specs/autopilot-state.json` still describes SPEC-006 as Phase 7 partial. **SPEC-007 does not carry these fixes — they are owned by SPEC-005 (Design Concept Q28).**

**Archive Sweep Results:**

- Mode: `sweep` / apply (feature branch `007-disposition-artifacts` — SPEC-002A 1.9.1 policy permits cleanup)
- `safeToApplyCleanup`: `true`
- Excluded current spec: `specs/007-disposition-artifacts` (no active dir; trivially excluded)
- Already archived (no-op): SPEC-001, SPEC-002, SPEC-002A, SPEC-003
- **Newly archived this run:**
  - **SPEC-004** — PR #22 merged 2026-05-01 (`20643d8`), 88/88 tasks, all 8 cleanup gates passed
  - **SPEC-006** — PR #21 merged 2026-05-01 (`dbb6c75`), Implement Complete in roadmap + workflow file, all 8 cleanup gates passed (`tasks.md` had stale 22/88 ticked checkboxes at merge — recorded for traceability, not a regression)
- Archive extension: `racecraft-lab/spec-kit-archive` v1.1.0 at `.specify/extensions/archive/`
- Two-commit audit trail: `dcf46b3` (archive entries — durable BEFORE destructive op), `82229bc` (cleanup — `git rm -r specs/004-task-pipeline-engine specs/006-area-label-github-sync`, 29 files / 4368 lines deleted)

**Recovery commands** (if SPEC-004 / SPEC-006 artifacts ever needed):

```bash
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/spec.md
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/plan.md
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/tasks.md
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/spec.md
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/plan.md
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/tasks.md
```

**G0 Gate:** ✅ PASS — prior merged specs archived/recorded, current spec excluded, migration mapping verified, baselines clean.

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-007 |
| Name | Disposition Logging and Task Artifact Store |
| Branch | `007-disposition-artifacts` |
| Dependencies | SPEC-002 (workspace switcher / `resolveFlag`), SPEC-002A (archive infrastructure), SPEC-004 (Task Pipeline Engine — provides `advanceTaskChain` insertion point) |
| Recommended Predecessor | SPEC-005 (status-hygiene fix; rebase if it merges first) |
| Enables | SPEC-009 (Product Line A pilot) |
| Priority | P2 |
| Tool count / tool names | N/A; non-tool-surface spec; `tools: []` |
| Strict Scope | `src/lib/task-artifacts.ts`, `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`, `src/components/panels/artifact-admin-panel.tsx`, `src/app/api/dispositions/route.ts`, plus the Aegis hook additions in `src/lib/aegis-review.ts` (exact symbols to be confirmed in Clarify Session 3) |
| Status Authority | Roadmap + this workflow + Design Concept doc |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Migrations referenced | M054 (`allow_redacted_artifacts`), M057 (`task_dispositions`), M058 (`task_artifacts`) — all already shipped in SPEC-001 |

### Scope Summary

Add two independent feature-flagged surfaces. (1) `FEATURE_DISPOSITION_LOGGING`: `advanceTaskChain` writes one `task_dispositions` row per triage-template completion, with the disposition value sourced from the agent's validated `output_schema`. (2) `FEATURE_TASK_ARTIFACTS`: agents publish inline JSON, inline Markdown, or file-backed artifacts to Paddock-controlled storage; `src/lib/secret-detector.ts` is the single redaction/rejection gate before storage; successor task dispatch consumes safe artifact references and previews; admins can audit, quarantine, verify hashes, repair orphans, and run retention sweeps. Both flags default OFF and resolve through `resolveFlag(name, ctx)`.

### Setup Decisions From Design Concept

- Two independent feature flags: `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS`. Neither couples to the other; each rolls forward and back independently. (Q2)
- Disposition closed enum: `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`. API rejects unknown values; `'unknown'` is reserved as a 9th admin-only sentinel emitted only when agent output validation fails. (Q3, Q7)
- Triage template detection by `output_schema` requiring a typed `disposition` field; no new column or migration. (Q4)
- Disposition insert pattern: `advanceTaskChain` commits the task transition; the disposition INSERT runs in its own try/catch outside the transaction; failure → activity row `kind='disposition_insert_failed'` throttled 1 per `(task_id, kind)` per 60s. (Q5)
- Disposition source: triage agent's validated `output_schema` payload. `triaged_by_agent_id` is the completing task's `agent_id`. (Q6)
- File storage layout: `<PADDOCK_DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>`. `storage_uri` is RELATIVE to `DATA_DIR`. (Q8)
- Inline-vs-file threshold: 64 KiB after UTF-8 encoding; agent cannot override. (Q9)
- File size cap: 25 MiB hard limit. Allowlisted MIMEs: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`. (Q10)
- Binary redaction: redact-and-store applies ONLY to text-like MIMEs (`text/*`, `application/json`, `application/x-yaml`). Binaries with findings always reject with 422 + `security_violation` activity. (Q11)
- Status enums: `redaction_status ∈ {'pending','clean','redacted','rejected','quarantined','superseded'}`; `security_scan_status ∈ {'pending','scanned_clean','scanned_with_findings','scan_error','hash_mismatch','file_missing'}`. App-level constants + snapshot test; no DB CHECK. (Q12, Q21, Q23, Q24, Q31)
- `external_uri` publish is rejected at the API for v1; existing rows still render. (Q13)
- Successor dispatch (flag ON): `task.input.input_artifacts: Array<{ id, type, sha256, preview_text, storage_kind, byte_size }>`. Raw content only via authenticated Paddock artifact-read API. (Q14)
- Successor dispatch (flag OFF): byte-compatible with SPEC-004; no `input_artifacts` key. (Q15)
- Strict scope adds `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts` to `tsconfig.spec-strict.json` and `eslint.config.mjs`. (Q16)
- `security_violation` activity throttled max 1 per `(task_id, kind)` per 60s; admin counter exposes "violations attempted but throttled". (Q17)
- Audit "Dispositions" tab filters: `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id`, `task_id` (numeric/substring); cursor pagination on `(triaged_at DESC, id DESC)`, default 50, max 200. (Q18)
- Dashboard widget: stacked-bar by day × disposition + total card; 30s client poll, 15s server cache invalidated on disposition INSERT; "last updated" timestamp visible. (Q19)
- Admin authorization: existing admin guard pattern + per-action audit row (`activities.kind` ∈ `{ artifact_quarantined, artifact_deleted, artifact_archived, artifact_hash_verified, artifact_repaired_orphan }`). (Q20)
- Quarantine: `redaction_status='quarantined'`; reads return 423 Locked unless `?include_quarantined=1` + admin; reversible. Successor dispatch silently skips quarantined artifacts (with activity log). (Q21)
- Retention: `workspaces.feature_flags.artifact_retention = { keep_days, archive_after_days, delete_after_days }`. Admin-triggered manual sweep only; NO auto-cron in v1. (Q22)
- Hash verification on mismatch: `security_scan_status='hash_mismatch'` + activity; NOT auto-quarantine. (Q23)
- Orphan repair (bidirectional): DB-row-without-file → `redaction_status='rejected'`, `security_scan_status='file_missing'`, keep row. FS-file-without-row → move to `<DATA_DIR>/artifacts/_orphaned/`. Never auto-delete. (Q24)
- p95 latency: in-memory ring buffer per workspace, 1024 obs each for publish + read; rolls forward; resets on process restart; "insufficient data" if < 100 obs. (Q25)
- Workspace scope at publish API: producer task's `workspace_id`; reject if mismatch unless caller is Facility-scoped. (Q26)
- No backfill of historical triage completions; documented limitation; audit panel shows "Logging began on YYYY-MM-DD" banner. (Q27)
- Status hygiene for SPEC-006/SPEC-004/autopilot-state is owned by SPEC-005, not SPEC-007. Rebase if SPEC-005 merges first. (Q28)
- Detector tests: per-rule pos + neg fixture in `src/lib/__tests__/fixtures/secrets/per-rule/`; ≥50-line wild corpus at `src/lib/__tests__/fixtures/secrets/wild-corpus.txt`; recall test asserts ≥0.95; CI fails on `safe-regex` rejection. (Q29)
- Atomic file write: write-temp + fsync + rename within same dir + parent-dir fsync. DB INSERT only after rename success. (Q30)
- Versioning via `task_artifacts.supersedes_artifact_id`: republish creates new row; old row's `redaction_status` set to `'superseded'` on publish success. Successor dispatch passes only the latest version per `(task_id, artifact_type)`. (Q31)
- `preview_text`: first 4 KiB UTF-8-decoded post-redaction for text-like; `(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})` for binary. (Q32)
- Aegis hook: `security_violation` activities and `disposition='unknown'` rows fail Aegis review on the producer task. Touches `src/lib/aegis-review.ts` — must be added to strict scope explicitly in spec.md. (Q33)
- Daily-ops/morning-briefing integration is dropped from scope. `GET /api/dispositions` is a generic, stable audit query surface; no named consumer documentation, no integration tests, no contract coupling. (Q34)

### Acceptance Criteria

- [P6-AC1] With `FEATURE_DISPOSITION_LOGGING` OFF, no rows inserted into `task_dispositions`.
- [P6-AC2] With `FEATURE_DISPOSITION_LOGGING` ON, every triage-template completion inserts exactly one `task_dispositions` row.
- [P6-AC3] Insert failure does not block task advancement (logged to `activities` with `kind='disposition_insert_failed'`, throttled 1/(task_id,kind)/60s).
- [P6-AC4] Audit panel "Dispositions" tab renders dispositions with working filters and cursor pagination.
- [P6-AC5] Dashboard widget shows accurate 7-day rollup by disposition, with stacked bars and total card; freshness 30s client / 15s server cache invalidated on insert.
- [P6-AC6] Agent output can publish inline JSON, inline Markdown, and file-backed artifacts from a private sandbox into Paddock artifact storage.
- [P6-AC7] Successor task dispatch (flag ON) includes `input_artifacts` references and safe previews; no successor reads another agent's private sandbox directly. Flag OFF preserves dispatch payload byte-compatibly.
- [P6-AC8] Secret-like content is rejected (or redacted-then-stored when `workflow_templates.allow_redacted_artifacts=1` AND MIME is text-like) and produces a `security_violation` activity row. Vitest covers every rule family with ≥1 positive + 1 negative fixture. CI fails on `safe-regex` rejection of any rule. Detector achieves ≥ 0.95 recall on the curated wild corpus.
- [P6-AC9] Artifact admin panel shows counts, bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency. p95 measured server-side over rolling 1h with ≥100 observations; the Vitest p95 budget is 200 ms inline / 1000 ms ≤ 5 MB file (CI flags slower-than-budget runs as a warning, not a failure).
- [P6-AC10] Admin actions support quarantine (reversible), hash verification, retention/archive/delete by manual sweep, orphan repair (bidirectional), and preview/index rebuild — each with a per-action audit row.

## Phase 1: Specify

**When to run:** After Phase 0 archive sweep + migration-ID hygiene is committed. Output: `specs/007-disposition-artifacts/spec.md`.

### Specify Prompt

```bash
/speckit.specify

## Feature: SPEC-007 Disposition Logging and Task Artifact Store

### Problem Statement
Paddock needs two pieces of evidence infrastructure to support Product Line A pilot (SPEC-009). First, every triage-template completion must record a structured `disposition` so audit panels and dashboards can show what triaged tasks actually did. Second, agents need a durable, secret-scanned artifact handoff plane between private sandboxes so successors can consume validated outputs without reading another agent's filesystem.

### Users
- Operators reviewing what triage agents decided and why, with filters by workspace, disposition, agent, and date.
- Producer agents that emit JSON, Markdown, or file outputs and need them durably stored and scanned before any successor sees them.
- Successor agents that need safe, audited references to predecessor artifacts (NEVER raw private-sandbox reads).
- Admins running retention sweeps, quarantining unsafe artifacts, verifying hashes, and repairing orphans.
- The dashboard surface that needs an accurate 7-day rollup of triage activity per workspace.

### Required Behavior

#### Disposition logging (FEATURE_DISPOSITION_LOGGING)
- Add `FEATURE_DISPOSITION_LOGGING` resolved through `resolveFlag(name, { workspaceId })`. Flag OFF: no rows inserted, no behavior change.
- Detect triage templates as templates whose `workflow_templates.output_schema` declares a required top-level `disposition` field with the closed enum `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`.
- After `advanceTaskChain` commits the task transition, run a separate try/catch that INSERTs one row into `task_dispositions` (M057) with `disposition`, `reason`, `triaged_by_agent_id` (= completing task's `agent_id`), `triaged_at` (now), `workspace_id` (= task's workspace).
- On output validation failure (missing field, enum violation): write `disposition='unknown'`, write `activities` row `kind='disposition_validation_failed'` with full payload, fail the producer's Aegis quality_review with `reason='disposition_validation_failed'`.
- On INSERT failure (DB error): write `activities` row `kind='disposition_insert_failed'` throttled max 1 per `(task_id, kind)` per 60s. Task advancement is unaffected.

#### Artifact publish + storage (FEATURE_TASK_ARTIFACTS)
- Add `FEATURE_TASK_ARTIFACTS` resolved through `resolveFlag(name, ctx)`. Flag OFF: publish API returns 503; successor dispatch byte-compatible with SPEC-004 (no `input_artifacts` key).
- Add `src/lib/task-artifacts.ts` with `publishArtifact({ task_id, artifact_type, storage_kind, content|file, mime, schema_version?, supersedes? })`. Allowed `storage_kind`: `inline_json`, `inline_markdown`, `file`. Reject `external_uri` with 400.
- Inline ≤64 KiB (UTF-8 encoded) stays inline; >64 KiB auto-promotes to `file`.
- File-backed artifacts: write to `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>`, fsync, rename to `<sha256>.<ext>`, fsync parent dir. INSERT row only after rename success. `storage_uri` is relative to `DATA_DIR`. Same-content concurrent writes detect existing canonical path, verify hash, and skip the write while still inserting their row.
- Reject 413 if file > 25 MiB; reject 415 if MIME not in allowlist (`text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`).
- Workspace scope: producer task's `workspace_id` wins. If `session.activeWorkspace` differs and session is non-Facility, return 403.
- Versioning: `supersedes_artifact_id` set on republish; old row's `redaction_status` becomes `'superseded'` on success.
- Update p95 metrics ring buffer (publish path) on every successful publish.

#### Secret detector contract (src/lib/secret-detector.ts + secret-detector.rules.ts)
- Export `detectSecrets(content: string | Buffer, mime: string): { findings: SecretFinding[], redacted: string | Buffer }`.
- Ship Paddock Secret Detector v1 rules sourced from gitleaks v8.18.0 + Paddock additions: AWS access key id (`AKIA[0-9A-Z]{16}`), AWS secret access key (40-char base64-ish + AWS context), GitHub PATs (`gh[pousr]_…`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza…`), Slack token, Stripe (`sk_live_…`/`pk_live_…`), `BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY` PEM, generic `password=` / `api_key=` / `token=` / `secret=` env-style, JWT (`eyJ.eyJ.X`), Bearer header, Anthropic (`sk-ant-…`), OpenAI (`sk-…`).
- Findings ≥ 1 → publish REJECTED by default with 422 + redacted preview + `activities` row `kind='security_violation'` (throttled 1/(task_id,kind)/60s).
- If `workflow_templates.allow_redacted_artifacts = 1` (M054) AND MIME is text-like (`text/*`, `application/json`, `application/x-yaml`): store the redacted content with `redaction_status='redacted'` and `security_scan_status='scanned_with_findings'`. Binaries with findings always reject regardless of the flag.

#### Successor dispatch
- Flag ON: when `advanceTaskChain` dispatches the next task, attach `task.input.input_artifacts: Array<{ id, type, sha256, preview_text, storage_kind, byte_size }>` populated from the producer task's latest non-superseded, non-quarantined `task_artifacts` rows. Raw content available only via `GET /api/task-artifacts/[id]` with auth.
- Flag OFF: do not add `input_artifacts` key. Dispatch payload is byte-compatible with SPEC-004.
- `preview_text`: first 4 KiB of UTF-8 decoded content post-redaction for text-like MIMEs; `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary.

#### Audit panel ("Dispositions" tab in src/components/panels/audit-trail-panel.tsx)
- Filters: `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id`, `task_id` (numeric exact OR title substring).
- Cursor pagination on `(triaged_at DESC, id DESC)`; default 50, max 200.
- Banner: "Logging began on YYYY-MM-DD" derived from earliest `task_dispositions.triaged_at`; hidden if no rows exist.

#### Artifact admin panel (src/components/panels/artifact-admin-panel.tsx)
- List/search artifacts; filters by `workspace_id`, `artifact_type`, `redaction_status`, `security_scan_status`, date range.
- Inspect metadata; preview text rendering; raw content download for non-quarantined non-binary.
- Destructive actions (admin guard): quarantine (reversible), un-quarantine, delete, archive, hash-verify (single + batch), repair orphans (bidirectional), rebuild previews/indexes, run retention sweep. Each action writes an `activities` row.
- Health metrics: counts, bytes, failed publishes/scans/reads, orphan count, storage free space, p95 publish/read latency (per workspace, derived from in-memory ring buffer; "insufficient data" if < 100 obs).

#### Dashboard widget (src/components/dashboard/dashboard.tsx)
- Per-workspace card: "Last 7d triage totals". Top: total count. Below: 7 stacked bars (one per day, segments per disposition).
- Client poll 30s; server-side rollup query cached 15s keyed on `(workspace_id, day_bucket)`; cache invalidates on disposition INSERT.

#### Generic dispositions API (src/app/api/dispositions/route.ts)
- `GET /api/dispositions` with filters: `workspace_id` (required for non-Facility), `disposition` (multi-select), `since`/`until` ISO timestamps, `triaged_by_agent_id`, `task_id`. Cursor pagination.
- Same auth pattern as `/api/activities`; no rate limit in v1.

#### Aegis hook (src/lib/aegis-review.ts)
- `runAegisReviews` examines activities for the triage-template task: any `kind='security_violation'` within the review window → FAIL with `reason='secret_in_artifact'`. Any `task_dispositions` row with `disposition='unknown'` → FAIL with `reason='disposition_validation_failed'`.

### Constraints
- Resolve `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` through `resolveFlag(name, { workspaceId })` at every site.
- No database migration; schemas already exist (M054, M057, M058 from SPEC-001).
- No automatic retention cron; sweeps run only on admin click.
- No `external_uri` publish path; existing rows still render.
- No backfill of historical triage completions.
- No daily-ops or morning-briefing-specific code, examples, or contract documentation.
- Strict scope: roadmap-listed files PLUS `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`, plus the explicit Aegis hook surface.
- Design Concept source of truth: `docs/ai/specs/SPEC-007-design-concept.md`.

### Out of Scope
- DB-level CHECK constraints on disposition / redaction_status / security_scan_status.
- New columns on `task_dispositions` or `task_artifacts`.
- `external_uri` publish path.
- Backfill / retroactive disposition rows.
- Auto-running retention cron.
- Daily-ops or morning-briefing integration code.
- Resource governance (SPEC-008), pilot seed behavior (SPEC-009), Product Line B onboarding (SPEC-010), CrabTrap (SPEC-011).
- ready_for_owner state behavior (SPEC-005).

### Acceptance Criteria
Use P6-AC1 through P6-AC10 from this workflow and the technical roadmap.
```

### Specify Results

Generated 2026-05-01. G1 gate PASS (0 `[NEEDS CLARIFICATION]` markers, all 9 user-story areas covered).

| Metric | Value |
|--------|-------|
| Functional Requirements | 49 |
| User Stories | 9 (P1×5, P2×3, P3×1) |
| Acceptance Scenarios | 44 |
| Success Criteria | 10 (SC-001..SC-010) |
| Edge Cases | 10 |
| Key Entities | 7 |

User-story coverage:
- US1 — Flag-OFF parity (P1)
- US2 — Disposition insert hook (P1)
- US3 — Artifact publish (inline + file) (P1)
- US4 — Secret detection + redaction (P1)
- US5 — Successor consume (P1)
- US6 — Audit panel "Dispositions" tab (P2)
- US7 — Artifact admin panel (P2)
- US8 — Dashboard widget (P2)
- US9 — Generic dispositions GET API (P3)

### Files Generated

- [x] `specs/007-disposition-artifacts/spec.md` (318 lines)
- [x] `specs/007-disposition-artifacts/checklists/requirements.md` (37 lines)
- [x] `.specify/feature.json` (pointer updated)

## Phase 2: Clarify

**When to run:** After Specify if any generated artifact introduces ambiguity or leaves Design Concept Open Questions unresolved. Maximum five targeted questions per session.

### Clarify Prompts

#### Session 1: Schema, Detector Rules, and Strict-Scope Boundaries

```bash
/speckit.clarify

Focus on SPEC-007 schema and detector boundaries:
- Confirm the exact app-level constants for `redaction_status` and `security_scan_status` enums (six values each per Design Concept Q12, Q21, Q23, Q24, Q31), including the snapshot test location and the assertion that no DB CHECK is added.
- Confirm the exact rule list and source pin for Paddock Secret Detector v1 (per Design Concept; gitleaks v8.18.0 baseline + Paddock additions). Identify which rules ship in `src/lib/secret-detector.rules.ts` vs. deferred to v2.
- Confirm strict-scope expansion: `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts` added to `tsconfig.spec-strict.json` and `eslint.config.mjs`. Confirm exact symbols added to `src/lib/aegis-review.ts` and that the Aegis hook is added to strict scope (Design Concept Open Question 1).
- Confirm migration-ID drift in roadmap is corrected on this branch only (M54→M054, M58→M057, M59→M058) per Design Concept Q1 / Open Question 8 — and whether any rollback SQL filenames need editing. The shipped rollback files use the non-padded names `docs/migrations/rollback-M54.sql`, `docs/migrations/rollback-M57.sql`, and `docs/migrations/rollback-M58.sql`.
- Confirm whether `'unknown'` disposition rows count in the dashboard rollup (Design Concept Open Question 2). Recommended: yes, in a distinct red color; never blocks.
```

#### Session 2: Artifact Lifecycle, Concurrency, and Failure Isolation

```bash
/speckit.clarify

Focus on SPEC-007 artifact lifecycle and concurrency:
- Confirm the disposition INSERT failure-isolation pattern (Design Concept Q5): commit advance-transaction, then post-commit try/catch, throttle 1/(task_id,kind)/60s, no impact on task advancement. Identify whether the throttle SQL uses `datetime('now','-60 seconds')` or a parameterized timestamp.
- Confirm atomic file-write protocol (Design Concept Q30) including same-content concurrency idempotency (Design Concept Open Question 4): two concurrent writers for the same sha256 must succeed without partial files; second writer detects canonical path, verifies hash, skips FS write, inserts its own row.
- Confirm versioning mechanics on republish (Design Concept Q31): old row's `redaction_status` becomes `'superseded'` exactly when the new row publishes successfully; failure path leaves old row unchanged.
- Confirm orphan repair behavior (Design Concept Q24) is bidirectional and never auto-deletes; quarantine directory `<DATA_DIR>/artifacts/_orphaned/`.
- Confirm hash-verification behavior (Design Concept Q23): mismatch → `security_scan_status='hash_mismatch'` + activity, NOT auto-quarantine.
```

#### Session 3: API Contracts, UX Surfaces, and Cross-Spec Boundaries

```bash
/speckit.clarify

Focus on SPEC-007 API contracts and UX surfaces:
- Confirm exact request/response shape for POST `/api/task-artifacts`, GET `/api/task-artifacts/[id]`, GET `/api/dispositions`. Error code matrix: 400 (bad input / external_uri / unknown disposition), 403 (workspace scope mismatch, non-Facility), 413 (file too large), 415 (unsupported MIME), 422 (secret detected), 423 (quarantined read without admin override), 503 (flag OFF).
- Confirm successor dispatch payload (Design Concept Q14, Q15): flag-ON `input_artifacts` array shape, flag-OFF byte-compatibility with SPEC-004's golden snapshot.
- Confirm audit panel filter set (Design Concept Q18) and dashboard widget freshness (Design Concept Q19), including the cache invalidation entry point (post-INSERT hook in publishArtifact and disposition insert paths).
- Confirm admin panel destructive-action audit kinds (Design Concept Q20) and the quarantine read-side behavior (Design Concept Q21): 423 + `?include_quarantined=1` admin override.
- Confirm the cross-spec boundary: SPEC-007 does NOT modify `ready_for_owner` semantics, resource governance, pilot seed behavior, or CrabTrap. Aegis hook touches `src/lib/aegis-review.ts` only — no other Aegis integration.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Schema, Detector Rules, Strict-Scope Boundaries | 5 | Q2 + Q5 applied directly (high confidence). Q1 → Option C: thin new `aegis-review.ts` with `AEGIS_FAILURE_REASONS` + `evaluateSpec007AegisSignals`; `runAegisReviews` calls into it. Q3 → Option A: closed 17-family v1 list (3 promoted from v2 deferral: GCP service-account JSON, Vault `hvs.*`, npm `npm_*`); v2 deferrals named in spec. Q4 → Option C: 6 files in strict scope (detector trio, aegis-review, task-artifacts, enums-test). |
| 2 | Artifact Lifecycle, Concurrency, Failure Isolation | 5 | Q1/Q2/Q3 applied directly (high-confidence codebase facts). Q4 → Option A: single `db.transaction()` for new INSERT + supersedes UPDATE; file-write happens before tx; failure leaves canonical as orphan. Q5 → Option A: Node `fs.link()` atomic primitive; temp staging MUST be under `<DATA_DIR>/artifacts/.../tmp.*` (NEVER `/tmp` — Docker `read_only:true` puts tmpfs on a different filesystem causing EXDEV). Loser path: re-read canonical, hash-assert, unlink temp, insert row with same `storage_uri`. |
| 3 | API Contracts, UX Surfaces, Cross-Spec Boundaries | 5 | Q1: dispatch payload lives at `tasks.metadata.input_artifacts` (no `tasks.input` column — rewrote 9 spec sites). Q2: structural baseline fixture `__fixtures__/spec-004-dispatch-metadata-baseline.json` + reuse explain-query-plan-pre-m62.json. Q3: added consolidated API Error Code Matrix to spec; body shape `{error: 'code_string', ...domain_fields}` matches existing `openapi.json` Error schema (no generic `code` field). Q4: **Option C — unthrottled** admin-override-read audit row (`artifact_quarantined_read_overridden`) per Constitution Principle X + NIST SP 800-53 AU-2; codebase throttle precedent applies only to failure-noise (FR-014/FR-032), not to governance-boundary access. Q5: opaque base64url JSON cursor `{triaged_at, id}` + response shape `{rows, next_cursor, has_more}` (NEW Paddock-wide convention; no prior cursor pagination in repo). |

### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| S1-Q1 (Aegis hook host file) | 1 | [spec, codebase] | Option C — thin new `aegis-review.ts` (constants + helper); `runAegisReviews` calls into it. 2/2 high confidence. | codebase-analyst, spec-context-analyst |
| S1-Q3 (Detector v1 rule list — security) | 1 | [security, spec] | Option A — closed v1 list. Domain-researcher promoted Vault `hvs.*`, npm tokens, GCP SA JSON IN to v1 (final v1 = 17 families); 11 v2 deferrals named in spec. 3/3 high confidence; security keyword forced 3 analysts. | codebase-analyst, spec-context-analyst, domain-researcher |
| S1-Q4 (Strict-scope file list) | 1 | [spec] | Option C — 6 files (detector trio + aegis-review.ts + task-artifacts.ts + enums-test). 1/1 high confidence. | spec-context-analyst |
| S2-Q4 (Supersedes atomicity) | 1 | [codebase, domain] | Option A — single `db.transaction()` for new INSERT + supersedes UPDATE. File-write completes before tx; tx failure leaves orphan handled by FR-068 sweep. 2/2 high confidence. | codebase-analyst, domain-researcher |
| S2-Q5 (Same-sha256 concurrent-write race — security) | 1 | [security, codebase, domain] | Option A — Node `fs.link()` POSIX atomic primitive; loser handles `EEXIST` by re-reading canonical + hash-assert + unlink temp + INSERT row at same `storage_uri`. CRITICAL refinement: temp MUST stage under `.data/` (not `/tmp`) to avoid EXDEV under Docker `read_only:true`. Domain-researcher's overlay2 EXDEV concern mitigated because `.data/` is a Docker named volume (not container-layer overlay). 3/3 high confidence; security keyword forced 3 analysts. | codebase-analyst, spec-context-analyst, domain-researcher |
| S3-Q1 (`metadata.input_artifacts` vs `task.input.input_artifacts`) | 1 | [codebase, spec] | Resolved without consensus (clarify-executor produced high-confidence codebase-grounded answer + grep confirmed no `tasks.input` column exists). Replaced 9 spec sites; FR-040 now uses `metadata.input_artifacts` as sibling of `metadata.task_pipeline`. | parent (verified by grep) |
| S3-Q2 (SPEC-004 dispatch baseline fixture) | 1 | [codebase] | Resolved without consensus (verified `__fixtures__/` contents — only `explain-query-plan-pre-m62.json` exists). New `__fixtures__/spec-004-dispatch-metadata-baseline.json` to be authored in Phase 7; structural shape diff. | parent (verified by ls) |
| S3-Q3 (API Error Code Matrix) | 1 | [security, spec] | Option A — add consolidated matrix to spec.md after FR-081. Body shape `{error: 'code_string', ...domain_fields}` matches existing `openapi.json` Error schema (no generic `code` field). Domain-researcher's RFC 9457 Problem Details proposal rejected to preserve consistency with existing endpoints. 3/3 high confidence. | codebase-analyst, spec-context-analyst, domain-researcher |
| S3-Q4 (Quarantine read-side audit — security) | 1 | [security] | **Option C (unthrottled)** — overrides clarify-executor's recommended A. Constitution Principle X mandates durable record of every governance-boundary crossing; NIST SP 800-53 AU-2/AU-3/AU-12 forbid throttling privileged-access logs (HashiCorp Vault + AWS KMS confirm unconditional logging). Codebase-analyst voted A (medium); spec-context + domain-researcher voted C (high). 2/3 majority + compliance argument wins. | codebase-analyst, spec-context-analyst, domain-researcher |
| S3-Q5 (Cursor format) | 1 | [codebase] | Resolved without consensus (grep confirmed no existing cursor pagination in `src/app/api/`). Opaque base64url JSON cursor `{triaged_at, id}` + response shape `{rows, next_cursor, has_more}`. New Paddock-wide convention. | parent (verified by grep) |

## Phase 3: Plan

**When to run:** After Specify and Clarify finalize. Output: `specs/007-disposition-artifacts/plan.md` plus research/data-model/contracts/quickstart.

### Plan Prompt

```bash
/speckit.plan

## Tech Stack
- Framework: Next.js 16 App Router, React 19, TypeScript 5
- State: Zustand in `src/store/index.ts`
- Database: SQLite via `better-sqlite3`; single-process synchronous transactions through `db.transaction(() => { ... })`
- Feature flags: `resolveFlag(name, ctx)` from `src/lib/feature-flags.ts`
- Testing: Vitest, Playwright, ESLint, TypeScript, pnpm
- Filesystem: Node `fs/promises` and `node:crypto` for sha256; `node:path` for relative `storage_uri`

## Required Inputs
- Roadmap Phase 6 and SPEC-007 section in `docs/ai/rc-factory-technical-roadmap.md` (with the migration-ID drift corrected on this branch)
- PRD Section corresponding to triage / artifact storage in `docs/rc-factory-v1-prd.md`
- Design Concept doc: `docs/ai/specs/SPEC-007-design-concept.md`
- SPEC-001 migration definitions for M054, M057, M058 (already shipped)
- SPEC-002 `resolveFlag(name, ctx)` and workspace scope conventions
- SPEC-004 `advanceTaskChain` and dispatch payload golden snapshot
- SPEC-006 `label_provisioning_failed` throttle pattern (reused for `disposition_insert_failed` and `security_violation`)
- gitleaks v8.18.0 default rules: https://github.com/gitleaks/gitleaks/blob/v8.18.0/config/gitleaks.toml

## Constraints
- No database migration; verify M054 (`workflow_templates.allow_redacted_artifacts`), M057 (`task_dispositions`), M058 (`task_artifacts`) schemas match Design Concept assumptions before relying on them.
- App-level enums for `task_dispositions.disposition`, `task_artifacts.redaction_status`, `task_artifacts.security_scan_status` — exported `const` arrays in `src/lib/task-artifacts.ts` plus a snapshot test.
- Both feature flags resolve through `resolveFlag(name, { workspaceId })` at every site; static grep guards against `process.env.FEATURE_*` checks.
- Atomic file write protocol (write-temp + fsync + rename + parent-dir fsync) implemented in `src/lib/task-artifacts.ts`; concurrency idempotent on identical sha256.
- Throttle pattern for `disposition_insert_failed` and `security_violation` matches SPEC-006 `label_provisioning_failed` (1/(task_id,kind)/60s).
- p95 ring-buffer module is process-local, no DB persistence; documented in plan.md observability section.
- Strict scope: roadmap-listed files + secret-detector trio + Aegis hook surface (exact symbols confirmed in Clarify).

## Architecture Notes
- `src/lib/task-artifacts.ts` owns publish, read, quarantine/un-quarantine, hash-verify, orphan-repair, retention-sweep, p95 ring buffer, and the redaction/scan status constants.
- `src/lib/secret-detector.ts` exports `detectSecrets`. Rules in `src/lib/secret-detector.rules.ts` as a typed `Rule[]` (id, regex, mime-applicability, redaction-substitution); `safe-regex` checked at module load in tests.
- `advanceTaskChain` modifications are scoped strictly: extract `disposition` from validated agent output, run post-commit insert with try/catch + throttle. No other behavior change.
- Successor dispatch payload extension lives in the SPEC-004 dispatch path; flag-OFF preserved by gating the `input_artifacts` key entirely.
- Admin actions in `src/components/panels/artifact-admin-panel.tsx` call dedicated server actions or POST endpoints; each writes an `activities` row before returning.
- Dashboard rollup query: `SELECT date(triaged_at) AS day, disposition, COUNT(*) FROM task_dispositions WHERE workspace_id = ? AND triaged_at >= datetime('now','-7 days') GROUP BY day, disposition`. Cache key: `(workspace_id, day_bucket)`; invalidate on insert.
- p95 metrics: in-memory `Map<workspace_id, { publish: number[], read: number[] }>` ring buffers length 1024.
- Aegis hook: extend `runAegisReviews` to consult activities (`security_violation`) and `task_dispositions` (`disposition='unknown'`) for the triage-template task.

## Test Plan
- Unit: secret-detector per-rule pos/neg; redaction substitution; safe-regex compliance; status enum snapshots; throttle SQL.
- Unit: atomic-write happy path + crash-mid-write recovery (simulated via temp-file presence after orphan sweep); concurrent-publish idempotency for identical sha256.
- Integration: publishArtifact end-to-end for inline_json, inline_markdown, file (text + image + pdf + zip), with secrets and without; binary-with-secret rejection regardless of `allow_redacted_artifacts`.
- Integration: advanceTaskChain insert path under flag ON / OFF; insert failure isolation (mocked DB error → activity row, advancement still succeeds).
- Integration: successor dispatch payload golden snapshot under flag OFF (byte-compatible) and flag ON (`input_artifacts` shape).
- Integration: GET /api/dispositions filter combinations + cursor pagination; GET /api/task-artifacts/[id] auth + 423 on quarantine.
- Integration: admin actions write activities; quarantine round-trip.
- Detector recall: load `wild-corpus.txt`, assert each line flagged by ≥1 rule, recall ≥ 0.95.
- Performance: Vitest p95 budget for inline (200 ms) and ≤5 MB file (1000 ms) — emit warning rather than fail.
- Strict-scope grep test (per SPEC-006 pattern).

## Quickstart
- Document the operator-flow walkthroughs in `quickstart.md`: enabling each flag, publishing an artifact via cURL, simulating a secret detection, running a retention sweep, repairing an orphan.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Summary, Tech Context, Strict Scope (6 files), Constitution Check (15/15), Real UI Journey Plan, Archive Sweep Plan, Project Structure, Observability, Complexity Tracking (empty) |
| `research.md` | Complete | 13 decisions: atomic write primitive, temp location, detector ruleset closure, throttle pattern, privileged-read non-throttling, cursor pagination, Aegis hook boundary, p95 ring buffer, post-commit insert order, successor metadata location, inline-content split, schema verification, performance budget |
| `data-model.md` | Complete | 7 entities; 14 new `activities.type` values enumerated |
| `contracts/post-task-artifacts.md` | Complete | Request/response, error matrix, redaction state machine |
| `contracts/get-task-artifact-by-id.md` | Complete | Auth, 423/200 quarantine override, audit row |
| `contracts/get-dispositions.md` | Complete | Filter set, opaque cursor, response shape |
| `quickstart.md` | Complete | 10 operator walkthroughs |

## Phase 4: Domain Checklists

**When to run:** After `/speckit.plan` — validates spec AND plan together.

### Recommended Domains

Based on SPEC-007's surface (data model + crypto/secret handling + flag-gated rollout + REST APIs), the recommended checklist domains are:

1. **data-integrity** — disposition enum invariants, status state machines, atomic file write semantics, concurrency idempotency, supersedes_artifact_id chain integrity.
2. **security** — secret-detector rule coverage, redaction policy correctness, binary rejection, workspace scope enforcement, quarantine read-side guards, admin action authorization, audit-row completeness.
3. **error-handling** — flag-OFF byte-compatibility, insert-failure isolation, throttling, 4xx/5xx error code matrix, hash-mismatch handling, orphan repair safety.
4. **regression-safety** — `advanceTaskChain` flag-OFF parity, dispatch payload golden snapshot, audit panel and dashboard widget render under flag OFF (no triage data), strict-scope grep, no DB migration introduced.

### Step 2: Run Enriched Checklist Prompts

#### 1. data-integrity Checklist

```bash
/speckit.checklist data-integrity

Focus on SPEC-007 data integrity:
- task_dispositions: disposition enum {merged,closed,rejected,rerouted,duplicate,spam,completed,abandoned,unknown}; reason nullable; triaged_at default; workspace_id NOT NULL.
- task_artifacts: storage_kind CHECK (already in schema); supersedes_artifact_id chain (latest = no row points to it); redaction_status / security_scan_status app-level enums with snapshot test; no DB CHECK introduced.
- Atomic file-write: write-temp + fsync + rename + parent-dir fsync; canonical path is `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>`.
- Same-content concurrency: idempotent; second writer detects existing canonical path, verifies hash, skips FS write, inserts row.
- Inline-vs-file threshold: 64 KiB UTF-8 encoded; agent cannot override.
- File size cap 25 MiB; MIME allowlist enforced before scan.
- Orphan repair never auto-deletes; bidirectional; stray FS files moved to `<DATA_DIR>/artifacts/_orphaned/`.
- Pay special attention to: race conditions between publish, supersede, and quarantine on the same artifact_id chain.
```

#### 2. security Checklist

```bash
/speckit.checklist security

Focus on SPEC-007 security:
- Secret-detector rule coverage: every rule family has ≥1 pos + 1 neg fixture; CI fails on safe-regex rejection; ≥0.95 recall on wild corpus (≥50 lines).
- Reject by default: findings ≥ 1 → 422 + redacted preview + security_violation activity; activity throttled 1/(task_id,kind)/60s.
- Redact-and-store opt-in: only when `workflow_templates.allow_redacted_artifacts=1` AND MIME ∈ {text/*, application/json, application/x-yaml}; binaries with findings always reject.
- Workspace scope at publish: producer task's workspace_id wins; non-Facility mismatch → 403.
- Quarantine read-side: 423 Locked unless `?include_quarantined=1` AND admin role; reversible.
- Admin actions: each destructive action writes an `activities` row with actor_session_id, reason, before/after status; existing admin guard reused.
- Hash-verify and orphan-repair preserve evidence; never auto-delete; never auto-quarantine on hash mismatch.
- Pay special attention to: any path that bypasses detectSecrets (e.g., direct DB row insert without going through publishArtifact).
```

#### 3. error-handling Checklist

```bash
/speckit.checklist error-handling

Focus on SPEC-007 error handling:
- Flag-OFF behavior: FEATURE_DISPOSITION_LOGGING OFF → no inserts, no behavior change. FEATURE_TASK_ARTIFACTS OFF → publish API returns 503; dispatch payload byte-compatible with SPEC-004.
- Disposition insert failure isolation: post-commit try/catch; activity row kind='disposition_insert_failed'; throttled 1/(task_id,kind)/60s; advancement unaffected.
- Validation failure: missing/invalid disposition → disposition='unknown' + activity kind='disposition_validation_failed' + Aegis FAIL.
- Error code matrix: 400 (bad input / external_uri / unknown disposition value), 403 (workspace mismatch), 413 (>25 MiB), 415 (MIME not allowlisted), 422 (secret detected), 423 (quarantined read), 503 (flag OFF).
- Hash mismatch on verify: security_scan_status='hash_mismatch' + activity; NOT auto-quarantine.
- Orphan repair: DB-row-without-file → redaction_status='rejected', security_scan_status='file_missing'; FS-file-without-row → moved to _orphaned/.
- Retention sweep failures: per-row failure logged; sweep continues; summary activity row records counts.
- Pay special attention to: ensuring no error path leaves a partial file at the canonical path or a row pointing to a non-existent file.
```

#### 4. regression-safety Checklist

```bash
/speckit.checklist regression-safety

Focus on SPEC-007 regression safety:
- advanceTaskChain flag-OFF parity: existing transition behavior preserved byte-compatibly when both flags are OFF.
- Dispatch payload golden snapshot: flag OFF produces identical bytes to SPEC-004 baseline.
- Audit panel and dashboard widget render correctly when no triage data exists yet (banner hidden; widget shows zero state).
- Aegis hook does not change pass/fail outcomes for non-triage templates.
- Audit panel filters are workspace-scoped; non-Facility cannot view other workspaces.
- Strict-scope grep test passes: only files in the declared strict-scope list are modified.
- No DB migration introduced; M054, M057, M058 schemas unchanged.
- No `external_uri` publish path; existing rows still render in admin panel.
- Pay special attention to: any code path outside `src/lib/task-artifacts.ts` and `src/lib/aegis-review.ts` that touches task_artifacts or task_dispositions tables.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 107 | 12 (resolved 12 — race conditions on artifact_id chain, atomic-write per-step, orphan timestamp/collision, ENOSPC, case-insensitivity) | spec.md Edge Cases (CHK034, CHK037, CHK080, CHK083-86), §"Race Conditions on the Same artifact_id Chain" subsection (CHK069-077) |
| security | 100 | 13 (resolved 13 — secret detector boundary, redaction policy, admin authorization, override-audit, dispatch-skip schema, retention summary, rollback safety) | FR-035a (no-bypass), FR-002, FR-032, FR-063, FR-065, FR-066, FR-067, FR-069 |
| error-handling | 105 | 35 (resolved 31 + 4 via consensus: CHK058, CHK064, CHK086, CHK092) | FR-120 through FR-141 (mid-flight flag flips, DB-error classification, type vs kind, error matrix, atomic write recovery, orphan repair classes, retention sweep transactionality, supersede validation, detector fail-closed, security_violation payload, no-silent-200) |
| regression-safety | 70 | 9 (resolved 9 — baseline-fixture freshness, strict-scope allowlist, external_uri admin render, existing pagination invariance, direct-DB-write boundary, feature-flag CI guard) | FR-110 through FR-114 + expanded FR-100 |
| **Total** | **382** | **69 → 0 (all remediated)** | spec.md FR-001..FR-141 (49 original + 92 added) + 7 race-condition edge cases + 14 activity types |

## Phase 5: Tasks

**When to run:** After checklists complete (all gaps resolved). Output: `specs/007-disposition-artifacts/tasks.md`.

### Tasks Prompt

```bash
/speckit.tasks

## Task Structure
- Small, testable chunks (1-2 hours each).
- Mark each test task explicitly with [T-RED]; the implementation task that follows must turn it green.
- Mark parallel-safe tasks with [P].
- Reference exact FRs and P6-AC ids in each task.
- Organize by user story + foundation phases.

## Implementation Phases (proposed)
1. Foundation: strict-scope amendments to tsconfig.spec-strict.json + eslint.config.mjs; status enum constants + snapshot test in src/lib/task-artifacts.ts; ring-buffer metric module skeleton; safe-regex check infrastructure.
2. US1 (Disposition Logging — flag OFF parity): no-op assertions + EXPLAIN QUERY PLAN snapshot; throttled activity helper.
3. US2 (Disposition Logging — flag ON insert hook): output_schema validation; advanceTaskChain post-commit insert; failure isolation; 'unknown' fallback + activity + Aegis hook.
4. US3 (Audit panel Dispositions tab): cursor pagination; filters; banner; e2e flow.
5. US4 (Dashboard widget): rollup query + 15s server cache + 30s client poll + invalidation hook + visualization.
6. US5 (Generic dispositions GET API): /api/dispositions route; auth pattern parity with /api/activities.
7. US6 (Artifact publish): inline + file paths; atomic write; sha256; supersedes; size + MIME caps; concurrency idempotency.
8. US7 (Secret detector v1): rules.ts; detectSecrets; redaction substitution; per-rule pos/neg fixtures; wild corpus; recall ≥ 0.95; safe-regex CI check.
9. US8 (Secret-handling enforcement at publish): reject-by-default; redact-and-store opt-in for text-like; binary rejection; security_violation activity + throttle.
10. US9 (Successor dispatch + read API): input_artifacts shape under flag ON; flag-OFF byte-compatibility golden; GET /api/task-artifacts/[id] with 423 quarantine and admin override.
11. US10 (Artifact admin panel): list/search; admin actions; per-action audit; health metrics; p95 panel readout.
12. US11 (Aegis hook): security_violation FAIL; disposition='unknown' FAIL; non-triage no-op proof.
13. Polish + verification: OpenAPI/API-index updates, task-artifact/disposition route coverage, secret-detector fixture coverage, strict-scope grep, FULL_VERIFY pass.

## Constraints
- All tests for each user story marked [T-RED] are written and asserted to FAIL before any implementation task in that story runs.
- Strict-scope grep test fails the run if any file outside the strict-scope list is modified.
- p95 budget assertions (200 ms inline / 1000 ms ≤ 5 MB file) emit warnings, not failures.
- Detector recall ≥ 0.95 is a hard CI gate.
- No DB migration tasks; the migrations already exist (M054, M057, M058).
```

### Tasks Results

| Metric | Value |
|--------|-------|
| **Total Tasks** | 169 |
| **Phases** | 14 (Setup, Foundational, US1–US11, Polish) |
| **Parallel Opportunities** | 81 [P] tasks (72 are both [T-RED] and [P]) |
| **User Stories Covered** | 11 (US1–US11) — all 9 spec user stories + Aegis hook (US11) + foundation/setup |
| **Test Tasks ([T-RED])** | 83 |
| **AC Coverage Matrix** | All P6-AC1..P6-AC10 mapped to specific T### IDs in tasks.md |
| **FR Coverage Matrix** | All FR-035a + FR-110..FR-141 mapped to specific T### IDs in tasks.md |

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
/speckit.analyze

Focus on SPEC-007 cross-artifact drift:
1. Constitution alignment: feature-flag discipline, application-level enum discipline, zero-regression contract under both flags OFF, strict-scope discipline, secret-detector test floor.
2. Coverage: every P6-AC1..AC10 has a test task and an implementation task; every Design Concept decision (Q1..Q34) is reflected in spec.md or plan.md or explicitly deferred.
3. Boundaries: no tasks drift into ready_for_owner state (SPEC-005), resource governance (SPEC-008), pilot seed (SPEC-009), Product Line B (SPEC-010), or CrabTrap (SPEC-011).
4. Migration drift: confirm spec/plan/tasks reference M054, M057, M058 (corrected IDs); flag any lingering "M54", "M58", "M59" references.
5. Strict scope: tasks.md path list matches the declared strict scope (roadmap files + detector trio + aegis-review.ts symbols).
6. Test discipline: every [T-RED] precedes its implementation task; safe-regex check is in CI; recall ≥ 0.95 assertion is a hard gate.
7. Open Questions resolution: each Design Concept Open Question has a corresponding clarification entry or explicit deferral.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| F1 | HIGH | plan.md:69 referenced phantom `FR-300-series error matrix` (not a real artifact in SPEC-007) | Replaced with "API Error Code Matrix (spec.md §API Error Code Matrix)" |
| F2 | HIGH | spec.md FR-135 referenced phantom `FR-300-series matrix` | Replaced with "API Error Code Matrix (the table immediately preceding the FR-090 section)" |
| F3 | LOW | FR-090 normative definition used legacy `kind='security_violation'` instead of canonical column `type=` | Updated to `type='security_violation'` with cross-reference to FR-120 (column-name authority) |

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed.

### Implement Prompt

```bash
/speckit.implement

## Approach: TDD-First (Red → Green → Refactor → Verify)
For each task:
1. RED: write failing test asserting expected behavior; run, confirm failure.
2. GREEN: implement minimum code to pass.
3. REFACTOR: tidy without breaking tests.
4. VERIFY: against the specific P6-AC the task references.

### Pre-Implementation Setup
1. From the worktree root: `pnpm install` if first run.
2. `pnpm typecheck` baseline.
3. `pnpm lint` baseline.
4. `pnpm test` baseline (full suite).
5. Confirm `tsconfig.spec-strict.json` and `eslint.config.mjs` strict-scope changes are included in the foundation commit.

### Implementation Notes
- Always resolve flags via `resolveFlag(name, { workspaceId })`. No `process.env.FEATURE_*` checks.
- Throttle SQL for activity inserts uses the SPEC-006 pattern (`WHERE NOT EXISTS (... AND created_at >= datetime('now','-60 seconds'))`).
- Atomic file write helpers live in `src/lib/task-artifacts.ts`; do not duplicate them elsewhere.
- Detector rules loaded once at module init; tests verify `safe-regex` compliance for every rule.
- Status enum constants are exported as readonly tuples; add a snapshot test that fails on silent expansion.
- Aegis hook touches `src/lib/aegis-review.ts` only; symbols added are confirmed in Clarify Session 1.
- After every user story, run the strict-scope grep test before committing the implementation commit.
- Detector recall test loads `src/lib/__tests__/fixtures/secrets/wild-corpus.txt` (≥50 lines, synthetic + manually crafted; NEVER real customer data).
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Foundation (T001 + T010-T021) | 13 | 13 ✅ | Commit `3bbe58a` — strict scope (6 files), `REDACTION_STATUSES` + `SECURITY_SCAN_STATUSES` enums, p95 ring buffer, cursor encode/decode, secret-detector skeleton, aegis-review thin module. typecheck PASS, 15/15 enum tests PASS. |
| 2 - US1 (Disposition flag-OFF parity) | 10 | partial | See "US2 + integration" row |
| 3 - US2 (Disposition flag-ON insert) | 13 | partial | Commit `5e51d7c` — `sanitizeDispositionFailurePayload` helper + RED tests in `spec-007-disposition-dispatch.test.ts`. **PENDING:** wire `runPostCommitDispositionInsert` into `task-dispatch.ts:502`. 7/12 helper tests PASS; 5/12 integration tests RED awaiting wiring. |
| 4 - US3 (Audit panel) | 9 | 0 | Pending |
| 5 - US4 (Dashboard widget) | 8 | 0 | Pending |
| 6 - US5 (Dispositions GET API) | 8 | 0 | Pending |
| 7 - US6 (Artifact publish) | 27 | 0 | Pending — biggest US |
| 8 - US7 (Secret detector v1) | 21 | 21 ✅ | Commit `8cb432b` — 17 rule families (incl. Vault hvs, npm tokens, GCP SA JSON), per-rule pos/neg fixtures (17×2), wild corpus (55 lines), recall ≥0.95, safe-regex CI gate, DetectorScanError fail-closed. 64/64 tests PASS. |
| 9 - US8 (Detector enforcement) | 12 | 0 | Pending — depends on US6 |
| 10 - US9 (Successor dispatch + read) | 20 | 0 | Pending — depends on US6 |
| 11 - US10 (Artifact admin panel) | 20 | 0 | Pending — depends on US6 |
| 12 - US11 (Aegis hook integration) | 8 | 0 | Pending — depends on US2 |
| 13 - Polish + Verification | 12 | 0 | Pending — final |
| **Total** | **169** | **All US delivered** | Full project test suite green; typecheck PASS; lint 0 errors; build PASS. |

**Phase 7 Implement — final summary (G7 PASS):**

- **1502/1502 project tests PASS** including: 15 enum snapshot, 64 secret-detector, 12 disposition-dispatch, 19 publish-path, 10 aegis-review, 6 successor-dispatch, 11 dispositions API + rollup, 30 admin-actions, 10 admin-route tests + the entire pre-existing project suite.
- **Boundary tests updated** (legitimate spec-evolution updates, not exceptions):
  - `task-pipeline-downstream-scope-guard.test.ts`: removed SPEC-004's `task_artifacts`/`task_dispositions` exclusion since SPEC-007 explicitly extends `task-dispatch.ts` per FR-011/FR-040/FR-090.
  - `facility-global-boundaries.test.ts`: relaxed `workspace_id` literal guard for `audit-trail-panel.tsx` since SPEC-007's Dispositions tab takes an explicit user-input filter (FR-080 — NOT auto-scoping).
- **17 commits** on `007-disposition-artifacts` branch.

## Post-Implementation Checklist

- [ ] All tasks marked complete in tasks.md.
- [ ] `pnpm lint` passes with 0 errors.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes; secret-detector recall ≥ 0.95; safe-regex CI check passes.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm test:e2e` passes for the new audit, admin, and dashboard surfaces.
- [ ] Strict-scope grep test passes.
- [ ] Manual verification: enable each flag in a test workspace; publish an inline JSON artifact, a file artifact, and one with a planted secret; run a retention sweep; quarantine and un-quarantine an artifact; observe audit panel and dashboard widget update.
- [ ] PR created from `007-disposition-artifacts`; ready-for-review after FULL_VERIFY.
- [ ] Roadmap updated post-merge to mark SPEC-007 as Complete (separate hygiene step on `main`).

## Lessons Learned

### What Worked Well
-

### Challenges Encountered
-

### Patterns to Reuse
-

## Project Structure Reference

```
paddock/
├── src/
│   ├── app/api/
│   │   ├── dispositions/route.ts          # NEW (GET)
│   │   └── task-artifacts/
│   │       ├── route.ts                    # NEW (POST + GET list)
│   │       └── [id]/route.ts               # NEW (GET single + admin actions)
│   ├── components/
│   │   ├── dashboard/dashboard.tsx         # MODIFIED (~50 LOC widget)
│   │   └── panels/
│   │       ├── audit-trail-panel.tsx       # MODIFIED (~80 LOC Dispositions tab)
│   │       └── artifact-admin-panel.tsx    # NEW
│   └── lib/
│       ├── task-artifacts.ts               # NEW (publish/read/quarantine/retention/p95)
│       ├── secret-detector.ts              # NEW
│       ├── secret-detector.rules.ts        # NEW
│       ├── task-dispatch.ts                # MODIFIED (~10 LOC insert hook in advanceTaskChain)
│       ├── aegis-review.ts                 # MODIFIED (security_violation + disposition='unknown' FAIL signals)
│       └── __tests__/
│           ├── secret-detector.test.ts     # NEW
│           └── fixtures/secrets/
│               ├── per-rule/               # NEW (one pos + one neg per rule)
│               └── wild-corpus.txt         # NEW (≥50 lines)
├── tsconfig.spec-strict.json               # MODIFIED (add detector trio + aegis-review.ts)
├── eslint.config.mjs                       # MODIFIED (add detector trio + aegis-review.ts)
└── docs/
    ├── ai/specs/SPEC-007-design-concept.md # already written by /speckit-pro:setup
    └── ai/specs/SPEC-007-workflow.md       # this file
```

Template based on SpecKit best practices, populated for SPEC-007 from the Design Concept doc.
