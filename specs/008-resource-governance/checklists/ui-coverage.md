# UI Coverage — Requirements Quality Checklist (SPEC-008)

**Purpose**: Unit-tests-for-English over the SPEC-008 UI / visual-regression / feature-flag-matrix requirements (US9, FR-296..325, FR-090h/i/j, AC-UI-*, AC-FF-Matrix-*) with respect to Constitution Principle XIV (NON-NEGOTIABLE) and Principle V (`resolveFlag`).
**Created**: 2026-05-02
**Domain**: ui-coverage
**Source artifacts**: `specs/008-resource-governance/spec.md`, `specs/008-resource-governance/plan.md`, `.specify/memory/constitution.md` (Principle XIV), `src/lib/feature-flags.ts`.

> Each item evaluates whether the **requirements themselves** are complete, clear, consistent, measurable, and traceable. Items are NOT verification steps for the implementation.

---

## Playwright e2e Journey Coverage (FR-296..305)

- [ ] CHK001 - Is the exhaustive list of operator UI journeys requiring Playwright e2e specs explicitly enumerated, with each journey mapped to a named spec file under `tests/e2e/`? [Completeness, Spec §FR-296..305, plan.md §Principle XIV]
- [ ] CHK002 - Are the empty / populated / loading / error states for the Governance tab landing surface explicitly required to each emit a visual snapshot? [Completeness, Spec §FR-296, FR-188]
- [ ] CHK003 - Is the dispatch diagnostic feed Playwright coverage requirement enumerated for each interaction class (initial page, infinite-scroll next-page, live SSE append, filter-change reset, empty)? [Coverage, Spec §FR-090j, FR-297]
- [ ] CHK004 - Is the override-grant Playwright coverage requirement complete for every error-class status code the API can return (409 / 412 / 422 / 423), or is FR-299 inconsistent with FR-300 which adds 412? [Consistency, Spec §FR-299 vs §FR-300, §FR-183]
- [ ] CHK005 - Is window CRUD ETag-conflict coverage scoped to HTTP 412 specifically, with the precondition-failed spec path and the ETag header semantics defined? [Clarity, Spec §FR-300]
- [ ] CHK006 - Are the bulk-policy promotion happy-path AND wrong-phrase-reject AND cross-workspace-422-reject scenarios all required as Playwright coverage? [Coverage, Spec §FR-090h, §FR-301]
- [ ] CHK007 - Is calibration-milestone Playwright coverage required to exercise progression between milestones (not just single static state) and the per-milestone status indicator state set? [Completeness, Spec §FR-302, §FR-198]
- [ ] CHK008 - Is the Aegis emergency-reserve Playwright requirement scoped to all three indicator states (`inactive`, `engaged`, `cooling_down`)? [Completeness, Spec §FR-303, §FR-156]
- [ ] CHK009 - Is the telemetry health drilldown Playwright coverage scoped per source (Claude OTel, Codex, Copilot, Ollama, LM Studio, OpenClaw) AND per pill state (green/amber/red)? [Coverage, Spec §FR-304]
- [ ] CHK010 - Is the `FEATURE_RESOURCE_GOVERNANCE=OFF` byte-compat regression Playwright spec required to assert BOTH absence of the Governance tab AND byte-identical legacy Cost Tracker output? [Completeness, Spec §FR-305, plan.md §Principle V]
- [ ] CHK011 - Are the Playwright spec filenames canonicalized between spec.md "Independent Test" sections and FR-090h/i/j to prevent ambiguity (e.g., `governance-bulk-promote.spec.ts` vs `.e2e.ts`)? [Conflict, Spec §FR-090h vs Spec §FR-296..305 file-extension convention]
- [ ] CHK012 - Are flaky/retry expectations defined for Playwright specs (max retries, quarantine policy) so visual snapshot variance does not silently mask regressions? [Gap]

## Storybook Component Coverage (FR-306..315)

- [ ] CHK013 - Is the inventory of "newly authored or extended" React components requiring `*.stories.tsx` explicitly enumerated and reconciled between plan.md component tree and FR-306..315? [Completeness, Spec §FR-306..315, plan.md §UI components]
- [ ] CHK014 - Is the canonical Storybook state set (`default / loading / error / empty / dense data / disabled-by-flag`) defined in one normative location instead of restated per-FR with risk of drift? [Consistency, Spec §FR-306 vs §FR-307..315]
- [ ] CHK015 - Are the *additional* state coverages for individual components specified as supersets of the canonical set rather than replacements (e.g., system-health-card adds green/amber/red BUT must still ship loading/error)? [Clarity, Spec §FR-307]
- [ ] CHK016 - Does the override grant form story FR-309 cover all four error states (409/412/422/423) and is "412" present given FR-299 omits it? [Conflict, Spec §FR-309 vs §FR-299]
- [ ] CHK017 - Is the budget utilization chart's threshold-zone story set (0%/50%/80%/95%/100%) reconciled with the spec.md US2 Independent Test which references "six threshold zones"? [Conflict, Spec §FR-311 vs §US2]
- [ ] CHK018 - Are story names, file paths, and exported story IDs deterministic enough that the Visual manifest gate can match snapshots to FR IDs? [Measurability, Spec §FR-229]
- [ ] CHK019 - Is the "disabled-by-flag" state defined with measurable rendering criteria (e.g., component returns null vs renders disabled shim component `feature-flag-disabled-shim.tsx`)? [Clarity, plan.md §UI components, Spec §FR-306]
- [ ] CHK020 - Are story coverage requirements specified for FR-090k backup-state extensions to `system-health-card.stories.tsx` (`backup-healthy / backup-stale / backup-no-offnode-warning / backup-failed`)? [Completeness, Spec §FR-090k]

## Visual Regression Pipeline (FR-228, FR-229, AC-UI-Visual-*)

- [ ] CHK021 - Is the dual-snapshot-source requirement (Playwright provider-neutral capture AND Storybook via Storycap + `vitest.storybook.config.ts`) stated in a single normative requirement? [Consistency, Spec §FR-228, plan.md §Testing]
- [ ] CHK022 - Are the metadata-tag schema and required fields for each visual snapshot (test/story identity, spec-scoped tags, FR ID) specified? [Clarity, Spec §FR-229]
- [ ] CHK023 - Is the CI wiring for `pnpm test:e2e:visual-manifest` and `pnpm test:visual:manifest` defined as a required PR gate, with explicit fail-closed behavior on missing metadata? [Completeness, Spec §FR-229, §FR-237]
- [ ] CHK024 - Is the GitHub Pages visual baseline publishing policy specified (branch, token, access, and behavior when publishing fails on main)? [Gap, Non-Functional/Security]
- [ ] CHK025 - Is the visual-snapshot baseline approval workflow for the FIRST PR documented (who approves, accept-baseline command, audit trail)? [Gap]
- [ ] CHK026 - Is the baseline rotation policy defined (when baselines are refreshed, who triggers refresh, how stale baselines are detected)? [Gap]
- [ ] CHK027 - Is the false-positive triage workflow for visual regressions defined (anti-aliasing tolerance, font rendering jitter, dynamic timestamps in fixtures)? [Gap, Spec §FR-228]
- [ ] CHK028 - Is the policy specified for non-visual e2e runs to NOT upload empty visual builds, and is the detection mechanism measurable? [Clarity, plan.md §Principle XIV "Non-visual e2e runs MUST NOT upload empty visual builds"]
- [ ] CHK029 - Is snapshot determinism specified across local dev / CI / Docker-backed `scripts/e2e-docker.sh` runs (font availability, headless-Chromium version pinning)? [Gap]

## Feature-Flag Matrix Coverage (FR-316..325, AC-FF-Matrix-1..4)

- [ ] CHK030 - Is the canonical flag list reconciled between FR-316 and `src/lib/feature-flags.ts` (FEATURE_WORKSPACE_SWITCHER, FEATURE_GLOBAL_AEGIS, FEATURE_TASK_PIPELINES, FEATURE_TWO_STEP_TERMINAL, FEATURE_AREA_LABEL_ROUTING, FEATURE_DISPOSITION_LOGGING, FEATURE_TASK_ARTIFACTS, FEATURE_RESOURCE_GOVERNANCE, FEATURE_OPENCLAW_HEALTH_COSTS) with a single source of truth? [Consistency, Spec §FR-316]
- [ ] CHK031 - Is each scenario (a)-(g) defined with measurable acceptance criteria — (a) OFF isolation, (b) ON isolation, (c) all-on baseline, (d) dependency chains, (e) SPEC-008 gate matrix, (f) Playwright per-flag, (g) env-override semantics? [Measurability, Spec §FR-317..323]
- [ ] CHK032 - Is the `enableRequires` dependency graph documented in the spec (FEATURE_GLOBAL_AEGIS → FEATURE_WORKSPACE_SWITCHER; FEATURE_TASK_PIPELINES → FEATURE_GLOBAL_AEGIS; full chain) so the matrix runner has a normative reference? [Completeness, Spec §FR-320]
- [ ] CHK033 - Is the env-override semantic ("env='1' does NOT force ON; env='0' forces OFF") specified as a testable invariant tied to a specific FR and `resolveFlag(name, ctx)` contract? [Clarity, Spec §FR-323, AC-FF-Matrix-3, plan.md CLAUDE.md pitfall]
- [ ] CHK034 - Is the matrix runner's coverage report format (output schema, location, machine-readable) specified so CI can fail closed on any uncovered combination? [Measurability, Spec §FR-324, §FR-237]
- [ ] CHK035 - Are matrix scenarios required across ALL test tiers (unit / integration / e2e / Playwright / Storybook) with explicit per-tier responsibilities, or only at the `feature-flag-matrix.test.ts` integration level? [Coverage, Spec §US9, §FR-316]
- [ ] CHK036 - Is the Storybook flag-aware variant requirement (default / OFF / ON via flag-mocking decorator) specified for every flag-gated component, with the decorator name and contract defined? [Gap, plan.md §UI components]
- [ ] CHK037 - Is the CI lint rule banning inline `process.env.FEATURE_*` in production code specified with scope (which directories) and exemption mechanism (test files)? [Clarity, Spec §FR-325]
- [ ] CHK038 - For flags that cannot legally be ON in isolation due to `enableRequires`, is the matrix's expected behavior (skip with rationale, or test the invalid-config error path) specified? [Gap, Spec §FR-318]
- [ ] CHK039 - Are flag-removal/sunset requirements specified for the matrix runner once a flag is fully rolled out (how the runner adapts when a flag is deleted)? [Gap]

## Accessibility Coverage (axe-core / WCAG 2.1 AA)

- [x] CHK040 - Is the requirement for axe-core integration inside Playwright defined per-journey or globally, and is the WCAG conformance level (2.1 AA) stated as a normative requirement? [Resolved by Spec §FR-090n]
- [x] CHK041 - Is the PR-merge-block behavior on WCAG 2.1 AA failures specified, including severity thresholds (block on serious/critical only? block on moderate?)? [Resolved by Spec §FR-090n]
- [x] CHK042 - Are accessibility requirements specified for non-keyboard interactions (screen reader announcements for SSE-appended diagnostic feed rows, live-region semantics)? [Resolved by Spec §FR-090o]
- [x] CHK043 - Is the accessibility requirement for typed-confirmation modals (bulk-promote, recovery actions) specified (focus management, ARIA-labelled inputs, error-summary linking)? [Resolved by Spec §FR-090p]

## State / Edge / Error / Recovery Coverage

- [ ] CHK044 - Are loading-state requirements defined for asynchronous data sources (diagnostic feed pagination, telemetry health polling, budget ledger queries)? [Coverage, Spec §FR-188, §FR-296..305]
- [ ] CHK045 - Are dense-data requirements quantified (e.g., diagnostic feed dense state at >50 rows; budget chart dense state at >5 concurrent budgets) so visual snapshots are reproducible? [Measurability, Spec §FR-308, §US7 "50+ recent decisions"]
- [ ] CHK046 - Are error states for the override grant form specified consistently across spec, FR, and Storybook (409 / 412 / 422 / 423) with the same wording for each error class? [Consistency, Spec §FR-183 vs §FR-309 vs §FR-299]
- [ ] CHK047 - Is the recovery / rollback requirement defined when a visual baseline is wrongly accepted (revert flow, audit trail of baseline acceptance decisions)? [Gap, Recovery]
- [ ] CHK048 - Are concurrent-operator UI scenarios addressed (two operators editing same window, ETag conflict surfacing)? [Coverage, Spec §FR-300]

## Non-Functional / Operational

- [ ] CHK049 - Is the visual-regression CI runtime budget specified (max minutes for `pnpm test:visual:storybook` + `pnpm test:e2e`) so fail-closed gates do not become bypass pressure? [Gap, Non-Functional]
- [ ] CHK050 - Are responsive / viewport requirements specified for snapshots (single viewport vs multi-viewport matrix; mobile breakpoint coverage if Governance tab targets desktop only)? [Gap, Spec §FR-188]
- [ ] CHK051 - Is the "extended component" definition specified (what counts as a SPEC-008-extension of a pre-existing component, e.g., `system-health-card.stories.tsx` extended for FR-090k backup states)? [Clarity, plan.md §UI components, Spec §FR-090k]
- [ ] CHK052 - Is a requirement & acceptance-criteria ID scheme established that links each Playwright spec, each story file, each axe violation report, and each visual snapshot back to the originating FR ID? [Traceability, Spec §FR-229]
