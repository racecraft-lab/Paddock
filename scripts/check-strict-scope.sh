#!/usr/bin/env bash
# SPEC-006 Strict-Scope Guardrail
#
# Enforces that no NEW TS/TSX modules are added under src/ on this branch.
# Per plan.md §Strict Scope: every implementation extends an existing file.
#
# Allowed: edits to existing files, additions under src/lib/__tests__/ and tests/.
# Disallowed: new TS/TSX files anywhere under src/ that did not exist on origin/main.

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-origin/main}"

# Verify base branch ref exists; if not (e.g. shallow clone), fall back gracefully.
if ! git rev-parse --verify --quiet "${BASE_BRANCH}" >/dev/null; then
  echo "check-strict-scope: base ref '${BASE_BRANCH}' not found; trying 'main'..." >&2
  if git rev-parse --verify --quiet main >/dev/null; then
    BASE_BRANCH=main
  else
    echo "check-strict-scope: WARN — no base ref available; skipping guard." >&2
    exit 0
  fi
fi

allowed_new_modules='^(src/app/api/github/sync/control/route\.ts|src/lib/github-sync-lifecycle-api\.ts|src/lib/github-sync-lifecycle-types\.ts|src/lib/github-sync-lifecycle\.ts|src/app/api/tasks/\[id\]/claim-reconciliation/route\.ts|src/lib/task-claim-reconciliation\.ts|src/app/api/agents/runtime-inventory/(route|route\.test)\.ts|src/components/agents/RuntimeInventoryEvidence\.tsx|src/lib/harness-adapters/(types|evidence|fixtures|validation|runtime-inventory)\.ts)$'

added_files=$(git diff "${BASE_BRANCH}"...HEAD --name-only --diff-filter=A \
  | grep -E '^src/.*\.(ts|tsx)$' \
  | grep -v -E '(^|/)__tests__/' \
  | grep -v -E "${allowed_new_modules}" \
  || true)

if [[ -n "${added_files}" ]]; then
  echo "ERROR: SPEC-006 strict-scope guard tripped — new TS/TSX modules added under src/:" >&2
  echo "${added_files}" >&2
  echo "" >&2
  echo "Per plan.md §Strict Scope, every implementation MUST extend an existing file." >&2
  echo "Allowed extensions: src/lib/github-sync-engine.ts, src/lib/github-label-map.ts," >&2
  echo "src/lib/github-sync-poller.ts, src/lib/migrations.ts," >&2
  echo "src/app/api/projects/[id]/route.ts, src/app/api/github/route.ts," >&2
  echo "src/components/modals/project-manager-modal.tsx." >&2
  echo "SPEC-013A1 declared strict modules are also allowed: lifecycle service," >&2
  echo "lifecycle API/types, and the sync control route." >&2
  echo "SPEC-013B declared strict modules are also allowed: claim reconciliation" >&2
  echo "service and read-only task claim reconciliation route." >&2
  exit 1
fi

# Also assert the explicitly-banned filenames never appear under src/.
banned=$(find src -type f \( -name 'github-area-routing*.ts' -o -name 'area-routing-admin-panel*.tsx' \) 2>/dev/null || true)
if [[ -n "${banned}" ]]; then
  echo "ERROR: SPEC-006 banned-filename guard tripped:" >&2
  echo "${banned}" >&2
  exit 1
fi

echo "check-strict-scope: OK (no new TS/TSX modules under src/)"
