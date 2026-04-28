---
feature: SPEC-002A Spec Archive and Evidence Retention
branch: 002a-spec-archive-evidence
date: 2026-04-28
completion_rate: 100
spec_adherence: 100
critical_findings: 0
significant_findings: 0
minor_findings: 1
positive_findings: 4
---

# SPEC-002A Retrospective

## Executive Summary

SPEC-002A completed its implementation and post-merge finalization: 47 of 47
tasks are checked, G7 passed, final FR/SC traceability is recorded in
`implementation-evidence.md`, PR #18 is merged, and the external archive/plugin
release cleanup is complete.

The implementation stayed within the process/tooling scope. It did not delete
active `specs/**` folders, did not archive the current SPEC-002A target in the
same run, did not rewrite history, and did not depend on post-merge CI mutating
`main`.

## Requirement Coverage

All FR-001 through FR-021 and SC-001 through SC-007 have concrete evidence in
`implementation-evidence.md`.

Key delivered outcomes:

- Racecraft archive fork updated, PR #1 merged, and `v1.1.0` published.
- Mission Control vendors `.specify/extensions/archive` from the pinned
  Racecraft fork commit.
- Archive Sweep dry-run evidence records SPEC-001 and SPEC-002 eligibility,
  current-target exclusion, PR/merge/CI/Argos provenance, and recovery commands.
- Screenshot evidence policy treats Argos/CI as durable provenance and rejects
  unmanifested committed generated screenshots.
- `racecraft-lab/racecraft-plugins-public` PR #20 and release-please PR #21
  are merged. The stale branch-cut `speckit-pro-v1.9.0` release/tag was
  removed and recreated at main commit
  `75a5b727cd0868d647c9afa968e0edbe398c3f94`.
- Mission Control was deployed on HAL after the merge; `mission-control.service`
  and `openclaw-gateway.service` were active and `/login` returned HTTP 200.
- Constitution, templates, roadmap, PRD, and PR template now carry the archive
  and evidence policy forward for later specs.

## Drift Analysis

| Area | Result |
|---|---|
| Archive extension adoption | Implemented with a Racecraft fork update instead of accepting the original fork as-is. This matches the clarified requirement. |
| Screenshot evidence | Implemented as Argos/CI provenance plus a guard, not committed screenshot retention. This matches the Argos CI decision. |
| Active spec cleanup | Dry-run/provenance only in this unsafe branch. This matches the cleanup safety policy. |
| Plugin release | PR #20 and release-please PR #21 are merged. The stale branch-cut `speckit-pro-v1.9.0` release/tag was removed and recreated at merged main commit `75a5b727cd0868d647c9afa968e0edbe398c3f94`. |
| Post extensions | Doctor, verify-tasks, verify, review, cleanup, and retrospective extension commands are installed in the repo registry but not exposed as Codex-invocable commands in this session. Equivalent read-only checks were performed where safe. |

## Findings

### Minor

- Codex post-extension exposure is incomplete for repo-local SpecKit
  extensions. The registry has the extensions, but this Codex session does not
  expose `speckit.doctor`, `speckit.verify-tasks`, `speckit.verify`,
  `speckit.review`, `speckit.cleanup`, or `speckit.retrospective` as native
  commands. `speckit-pro` should eventually provide a Codex-safe bridge for
  installed SpecKit extension commands.

### Positive

- The Archive Sweep startup rule was moved into `speckit-pro` rather than only
  into Mission Control docs, so future specs inherit the behavior at execution
  time.
- The archive extension fork now makes cleanup safety explicit instead of
  relying on prompt-only archive memory behavior.
- The screenshot guard proves the repository can use Argos/CI provenance
  without committing generated screenshot payloads.
- Local plugin refresh evidence confirms release, install, cache, and
  marketplace state in the same spec.

## Constitution Compliance

No constitution violations found.

SPEC-002A updated the constitution to version `1.4.0` with Principle XV:
Spec Artifact Provenance And Archive Sweep. The implementation evidence also
preserves Principle XIV by keeping UI screenshot evidence in Argos/CI artifacts
unless a manifest-backed exception is documented.

## Proposed Spec Changes

None. No `spec.md` modification is recommended from this retrospective.

## Recommendations

1. Add a Codex-native bridge in `speckit-pro` for installed `.specify`
   extension commands so post-autopilot doctor/verify/review/cleanup/
   retrospective checks can run without being registered as Claude-only
   command files.
2. On the next clean-base autopilot run, let Archive Sweep start first and
   decide whether SPEC-001 and SPEC-002 cleanup is safe to apply.
3. Keep `safeToApplyCleanup=false` for SPEC-002A until a later run sees it as a
   previously merged spec and records archive success plus recovery commands.

## Self-Assessment

- Evidence completeness: PASS
- Coverage integrity: PASS
- Metrics sanity: PASS
- Severity consistency: PASS
- Constitution review: PASS
- Human gate readiness: PASS
- Actionability: PASS
