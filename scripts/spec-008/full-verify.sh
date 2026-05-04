#!/usr/bin/env bash
# SPEC-008 — T368 — full-verify pipeline.
#
# Runs the SPEC-008 local verification suite. Browser-backed UI,
# Docker-backed production e2e, Storybook visual, and visual manifest
# gates are run separately because they require runtime services.
# Soak (T367) and chaos (T368 verification steps) remain operator-gated.
#
# Output is plain text (not JSON) so it can be archived directly into
# docs/ai/specs/SPEC-008-verification-evidence.md.
#
# Usage:
#   bash scripts/spec-008/full-verify.sh
#   bash scripts/spec-008/full-verify.sh > docs/ai/specs/SPEC-008-verification-evidence.md
#
# Exit code: 0 on success; non-zero if any of the runnable gates fail.

set -uo pipefail

GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "# SPEC-008 verification evidence"
echo
echo "**Generated**: $DATE"
echo "**HEAD**: $GIT_HEAD"
echo
echo "Runs the SPEC-008 local verification suite. Browser-backed UI,"
echo "Docker-backed production e2e, Storybook visual, and visual manifest"
echo "gates are run separately because they require runtime services."
echo "Soak (T367) and chaos (T368 verification steps) remain operator-gated."
echo
echo "---"
echo

# Track aggregate exit
overall=0

run_step() {
  local name="$1"
  shift
  echo "## $name"
  echo
  echo '```'
  if "$@" 2>&1; then
    echo '```'
    echo
    echo "**$name**: PASS"
    echo
  else
    local rc=$?
    echo '```'
    echo
    echo "**$name**: FAIL (exit $rc)"
    echo
    overall=1
  fi
}

run_step "T361 — pnpm typecheck" pnpm typecheck
run_step "T360 — pnpm lint" pnpm lint
run_step "T319 — axe-core coverage guard" node scripts/spec-008/check-axe-coverage.mjs
run_step "T353 — feature-flag env-leak guard" node scripts/spec-008/check-feature-flag-env-leak.mjs
run_step "T370 — strict-scope test" pnpm vitest run tests/integration/strict-scope-guard.test.ts
run_step "T321..T353 — feature-flag matrix" pnpm vitest run \
  tests/integration/feature-flag-matrix.test.ts \
  tests/integration/feature-flag-matrix-coverage.test.ts
run_step "T362 — pnpm vitest run (full unit suite)" pnpm vitest run
run_step "T371 — runbook links" node scripts/check-runbook-links.ts
run_step "T373 — screenshot evidence guard" node scripts/verify-spec-evidence-screenshots.mjs

echo "---"
echo
echo "## Runtime UI / visual gates — run separately"
echo
echo "- **T363 Docker-backed Playwright UI e2e** —"
echo "  \`MC_E2E_DOCKER_PRESEED=1 MC_VISUAL_SNAPSHOTS=1 SPEC_008_AXE_ENABLED=1 bash scripts/e2e-docker.sh\`."
echo "- **T364 Storybook visual** —"
echo "  \`SPEC_008_AXE_ENABLED=1 pnpm test:visual:storybook\`."
echo "- **T365 Playwright visual manifest** —"
echo "  \`node scripts/verify-visual-manifest.mjs --mode playwright\`."
echo "- **T366 Storybook visual manifest** —"
echo "  \`node scripts/verify-visual-manifest.mjs --mode storybook\`."
echo
echo "## Deferred — operator-gated"
echo
echo "- **T367 pnpm test:soak** — 30 min @ 100 admissions/sec; operator-gated."
echo "- **T368 pnpm test:chaos** — every runbook's \`## Verification\` step;"
echo "  operator-gated."
echo "- **T369 pnpm test:all** — coverage-report artifacting remains an"
echo "  operator/CI aggregate; the constituent lint, typecheck, unit, build,"
echo "  Docker e2e, Storybook, and metadata gates are recorded separately."
echo
echo "Per the orchestrator plan these long-running gates are pre-deploy /"
echo "post-deploy verification steps recorded against the production roll-out."
echo

if [ $overall -eq 0 ]; then
  echo "## Overall: PASS"
else
  echo "## Overall: FAIL"
fi
echo

exit $overall
