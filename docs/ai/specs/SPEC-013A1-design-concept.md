---
topic: "SPEC-013A1 GitHub Sync Automation and Poller Lifecycle"
slug: "spec-013a1-github-sync-automation"
date: "2026-05-23"
mode: "setup"
spec_id: "SPEC-013A1"
source_input:
  type: "topic"
  ref: "docs/ai/rc-factory-technical-roadmap.md Phase 11A1 - GitHub sync automation and poller lifecycle"
question_count: 14
stop_reason: "natural"
---

# Design Concept: SPEC-013A1 GitHub Sync Automation and Poller Lifecycle

> **Source:** docs/ai/rc-factory-technical-roadmap.md Phase 11A1 - GitHub sync automation and poller lifecycle
> **Date:** 2026-05-23
> **Questions asked:** 14
> **Stop reason:** natural

## Goals

- Make GitHub issue sync automatic, observable, and operator-controllable before SPEC-013B relies on concurrent scheduler ticks.
- Replace or retire the lazy `startSyncPoller()` singleton shape with a first-class Mission Control scheduler task that runs bounded GitHub pull/reconcile ticks.
- Add dedicated Product Line/workspace-scoped lifecycle control state for enablement, interval, backoff, running status, last run, last successful cursor, last error, disabled reason, and manual-sync conflict state.
- Preserve existing manual `/api/github/sync` behavior as an independent operator fallback.
- Preserve SPEC-006 owner semantics so automatic polling avoids duplicate ingestion when multiple projects share one repo.
- Add safety around failures, pagination, overlap, and rollback: failed runs do not advance successful cursors, pagination drains with explicit bounds, overlapping ticks are lease-controlled, and feature-flag/default-off disablement leaves manual sync working.

## Non-goals

- External OpenClaw cron as the canonical lifecycle. External cron may remain legacy/operator residue, but Mission Control owns the product behavior.
- Launching work, claiming tasks, dispatching agents, executing Issue Remediation, driving a sandbox or harness adapter, auto-merging, or automatically triaging issues.
- Treating `github_syncs` as the single lifecycle control record. It remains run history unless Plan proves a narrower safe alternative.
- Advancing a last-success cursor after a failed GitHub sync.
- Unbounded GitHub pagination, unbounded retry loops, or in-memory-only overlap control.
- Breaking manual sync or changing the operator-triggered sync contract from SPEC-009C1.

## Existing Code Review Inputs

These setup findings should be re-verified during Specify and Plan from the current worktree before implementation:

- GitHub sync originally landed as operator-triggered or fixture-driven ingestion; automatic polling is not yet a reliable product behavior.
- The existing poller shape is lazy/singleton-like and should not become the canonical lifecycle for concurrent scheduler work.
- Failure handling must distinguish failed attempts from successful cursor advancement. SPEC-013A1 should keep last-success cursor state separate from failed-run history.
- Existing issue fetch behavior should be checked for single-page assumptions. The spec should require pagination with explicit per-tick bounds.
- If the GitHub Sync UI/API is touched, verify it reports canonical lifecycle state instead of only legacy metadata/run rows.

## Design Tree (Q&A log)

### Q1. What owns the canonical GitHub sync lifecycle?

**Branch:** Runtime ownership

**Recommended answer:** Mission Control's internal scheduler/poller lifecycle owns the behavior. External cron can remain an operator deployment detail, but it must not be the product contract.

**User's answer:** A - use Mission Control's internal scheduler/poller lifecycle as canonical.

---

### Q2. Where should automatic sync lifecycle state live?

**Branch:** State model

**Recommended answer:** Add dedicated workspace/Product-Line scoped lifecycle state/control records for enablement, interval, backoff, last run, last error, disabled reason, running state, and cursor data. Keep `github_syncs` as run history.

**User's answer:** A - dedicated lifecycle state/control, with `github_syncs` remaining run history.

---

### Q3. What runtime shape should replace the current poller seam?

**Branch:** Scheduler integration

**Recommended answer:** Make GitHub sync a first-class Mission Control scheduler task with bounded ticks instead of relying on a process-wide `startSyncPoller()` singleton.

**User's answer:** A - built-in scheduler task with bounded ticks.

---

### Q4. What should automatic sync do?

**Branch:** Scope boundary

**Recommended answer:** Pull and reconcile GitHub issues only. Do not launch work or make ownership decisions.

**User's answer:** A - pull/reconcile GitHub issues only.

---

### Q5. What happens to cursors on failed sync?

**Branch:** Failure semantics

**Recommended answer:** Do not advance the successful cursor on failure. Record the failed run/error and retry later after bounded backoff.

**User's answer:** A - failed sync does not advance last-success cursor.

---

### Q6. How should GitHub issue pagination work?

**Branch:** Pagination and bounds

**Recommended answer:** Drain all available pages within explicit bounds for pages, issues, and tick duration. Record partial-run state when bounds stop the tick.

**User's answer:** A - paginate with bounded drains and partial-run state.

---

### Q7. How should operators control automatic polling?

**Branch:** Product Line control

**Recommended answer:** Provide per Product Line/workspace enablement, disablement, interval, backoff, and status controls in the GitHub Sync/operator surface.

**User's answer:** A - per Product Line/workspace controls and status.

---

### Q8. How should manual sync interact with automatic polling?

**Branch:** Manual fallback

**Recommended answer:** Manual sync remains independent and always available. If automatic sync is already running for the same scope, serialize or reject with a clear conflict response.

**User's answer:** A - manual sync stays available; overlap is serialized or rejected clearly.

---

### Q9. What owner filtering should automatic sync preserve?

**Branch:** Multi-project repo ownership

**Recommended answer:** Preserve SPEC-006 owner semantics. With area routing enabled, only `is_repo_sync_owner=1` polls each `(workspace_id, github_repo)` pair; flag-off behavior remains compatible with legacy per-project behavior unless explicitly documented otherwise.

**User's answer:** A - preserve owner-based polling semantics.

---

### Q10. What operator observability is required?

**Branch:** Status and diagnostics

**Recommended answer:** Expose enabled/disabled state, interval/backoff, running state, last started/completed, last success cursor, last error, bounded counters, skipped owner/non-owner counts, partial-run reason, and manual-sync conflict state.

**User's answer:** A - expose lifecycle control plus diagnostics.

---

### Q11. What backoff behavior should the poller use?

**Branch:** Retry safety

**Recommended answer:** Use bounded per Product Line backoff, expose next retry time/reason, and allow manual retry without advancing failed cursors.

**User's answer:** A - bounded per Product Line backoff with visible retry state.

---

### Q12. How should rollout and rollback work?

**Branch:** Rollout guard

**Recommended answer:** Ship feature-flagged and default-off. Operators opt in per Product Line; rollback disables automatic polling without breaking manual sync.

**User's answer:** A - feature-flagged/default-off plus per Product Line opt-in.

---

### Q13. How should overlapping ticks be prevented?

**Branch:** Concurrency control

**Recommended answer:** Use a database-backed per Product Line lease with owner/run id and expiry. Release on completion and recover stale leases after timeout.

**User's answer:** A - database-backed scoped lease with expiry.

---

### Q14. What must stay outside SPEC-013A1?

**Branch:** Cross-spec boundary

**Recommended answer:** No task claim authority, no task dispatch, no Issue Remediation execution, no sandbox or harness adapter, no auto-merge, and no automatic triage.

**User's answer:** A - keep execution, claim, remediation, harness, sandbox, auto-merge, and triage out of scope.

## Setup-Time Open Questions

These are intentionally deferred to `/speckit.clarify` and `/speckit.plan`:

- Exact lifecycle state storage shape, table names, migration number, indexes, and rollback SQL.
- Whether existing `github_syncs` rows can safely store any part of status, or whether all control state needs a new table.
- Exact API route(s) and UI placement for enablement, interval/backoff, status, and diagnostics.
- Lease timeout, stale lease recovery policy, retry cap, and scheduler tick interval defaults.
- Pagination limits for pages, issues, and tick duration, plus the exact partial-run cursor representation.
- Compatibility behavior when area routing flags are disabled and existing per-project sync semantics are expected.

## Recommended Next Step

Run setup completion and then execute:

```bash
$speckit-autopilot docs/ai/specs/SPEC-013A1-workflow.md
```
