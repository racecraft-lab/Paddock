# Contract: `POST /api/github` (delta)

**Spec**: SPEC-006 — Area-Label GitHub Sync
**Covers**: FR-028 (trigger point a), FR-039

## Summary

The existing `POST /api/github` connect handler currently calls `initializeLabels(repo)` to provision the `mc:*` and `priority:*` labels on the freshly-connected GitHub repo. SPEC-006 changes nothing about the request/response shape and changes only the internal call: the handler now passes the resolved `workspaceId` to `initializeLabels` so that — when `FEATURE_AREA_LABEL_ROUTING` is ON for that workspace — the union of static `AREA_LABEL_MAP` defaults plus workspace-specific `area_slug`-derived labels are also provisioned.

## Request

**Unchanged.**

The handler resolves `workspaceId` from the existing scope-resolution helper (`resolveWorkspaceScopeFromRequest`). No new request fields are introduced.

## Behavior delta

```ts
// Before SPEC-006:
await initializeLabels(repo);

// After SPEC-006 (FR-039):
await initializeLabels(repo, workspaceId, { trigger: 'connect' });
```

Inside `initializeLabels(repo, workspaceId?, { trigger })`:

- If `workspaceId` is `undefined` (legacy callers — SPEC-006 leaves no such call sites in production code), behavior matches the pre-SPEC-006 baseline: only the static `mc:*` and `priority:*` label set is provisioned.
- If `workspaceId` is provided AND `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` returns `true`, the function fetches `areaLabelsForWorkspace(db, workspaceId)` and also creates any of those labels not already present on the repo.
- If `workspaceId` is provided AND the flag returns `false`, behavior is byte-identical to the pre-SPEC-006 baseline (no `area:*` labels created). FR-002 holds.

## Failure isolation

GitHub API failures (rate-limit 429, 4xx, network) during label creation are caught per-label, logged, and accumulated into a single failure list returned from `initializeLabels`. The function returns successfully even on partial failure (FR-027). On non-empty failure list, the handler writes one throttled `kind='label_provisioning_failed'` activity per `(workspace_id, github_repo)` per 24h with `trigger: 'connect'` (FR-027a).

The HTTP response of `POST /api/github` is unaffected by per-label failures — the connect operation succeeds or fails based on the connect step itself, not on label provisioning.

## Response

**Unchanged.** Existing 200/4xx/5xx contract is preserved.

## Test matrix (FR-050)

| Case | Expected |
|------|----------|
| Connect repo to flag-OFF workspace | Only `mc:*` + `priority:*` labels created on GitHub; no `area:*` labels. |
| Connect repo to flag-ON workspace with `AREA_LABEL_MAP` defaults | All `area:*` defaults created on GitHub plus existing `mc:*` + `priority:*`. |
| Connect repo to flag-ON workspace where two projects have `area_slug='qa'`, `'dev'` | Static defaults + the two slugs (deduped if already in defaults) created. |
| Mocked GitHub returns 429 for two of N labels | `initializeLabels` returns successfully; one `label_provisioning_failed` activity written aggregating both failures with `trigger: 'connect'`; connect HTTP response is 200. |
