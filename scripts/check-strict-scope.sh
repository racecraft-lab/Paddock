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

added_files=$(git diff "${BASE_BRANCH}"...HEAD --name-only --diff-filter=A | grep -E '^src/.*\.(ts|tsx)$' || true)

if [[ -n "${added_files}" ]]; then
  echo "ERROR: SPEC-006 strict-scope guard tripped — new TS/TSX modules added under src/:" >&2
  echo "${added_files}" >&2
  echo "" >&2
  echo "Per plan.md §Strict Scope, every implementation MUST extend an existing file." >&2
  echo "Allowed extensions: src/lib/github-sync-engine.ts, src/lib/github-label-map.ts," >&2
  echo "src/lib/github-sync-poller.ts, src/lib/migrations.ts," >&2
  echo "src/app/api/projects/[id]/route.ts, src/app/api/github/route.ts," >&2
  echo "src/components/modals/project-manager-modal.tsx." >&2
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
