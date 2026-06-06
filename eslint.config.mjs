import next from 'eslint-config-next'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

const specStrictFiles = [
  'src/lib/spec-strict-sentinel.ts',
  'src/lib/aegis.ts',
  'src/lib/feature-flags.ts',
  'src/types/product-line.ts',
  'src/types/workflow-template.ts',
  'src/components/layout/workspace-switcher.tsx',
  'src/lib/routing-rule-evaluator.ts',
  'src/lib/output-schema-validator.ts',
  'src/lib/task-create.ts',
  'src/lib/task-status.ts',
  'src/lib/secret-detector.ts',
  'src/lib/secret-detector.rules.ts',
  'src/lib/__tests__/secret-detector.test.ts',
  'src/lib/aegis-review.ts',
  'src/lib/task-artifacts.ts',
  'src/lib/__tests__/task-artifacts.enums.test.ts',
  // SPEC-008 strict-scope additions (Convention J).
  // Globs match the strict-scope CI guard (T374) and tsconfig.spec-strict.json.
  // NOTE: provider-* is intentionally tightened to provider-account* and
  // provider-entitlement* because the legacy `src/lib/provider-subscriptions.ts`
  // is pre-spec code that SPEC-008 supersedes (M64l replaces it with
  // provider_accounts) and is not strict-compliant.
  'src/lib/db/connection-pool.ts',
  'src/lib/governance-*.ts',
  'src/lib/governance-route-context.ts',
  'src/lib/observability/*.ts',
  'src/lib/observability/**/*.ts',
  'src/lib/resource-*.ts',
  'src/lib/provider-account*.ts',
  'src/lib/provider-entitlement*.ts',
  'src/lib/token-pricing-resolver.ts',
  'src/types/resource-*.ts',
  'src/types/observability.ts',
  'src/types/provider-account.ts',
  'src/types/governance-api.ts',
  'src/components/governance/**/*.tsx',
  'src/components/governance/**/*.ts',
  'src/app/api/governance/**/*.ts',
  'src/app/api/resource-*/**/*.ts',
  'src/app/api/otlp/v1/**/*.ts',
  // SPEC-008 e2e fixture infra (Gap 0 of UI/UX coverage closure).
  // Test-mode + admin-gated; not reachable in production.
  'src/app/api/admin/spec-008/**/*.ts',
  'src/app/api/admin/workspaces/**/*.ts',
  // SPEC-009A workflow contract roundtrip.
  'src/lib/workflow-contracts/**/*.ts',
  // SPEC-009B Paddock product-line seed.
  'src/lib/paddock-seed/**/*.ts',
  'scripts/seed-paddock-product-line.ts',
  // SPEC-010A generic product-line seed.
  'src/lib/product-line-seed/types.ts',
  'src/lib/product-line-seed/schema.ts',
  'src/lib/product-line-seed/config.ts',
  'src/lib/product-line-seed/evidence.ts',
  'src/lib/product-line-seed/preflight.ts',
  'src/lib/product-line-seed/seed.ts',
  'src/lib/__tests__/product-line-seed.test.ts',
  'src/lib/__tests__/product-line-seed-cli.test.ts',
  'scripts/seed-product-line.ts',
  // SPEC-010B Product Line B smoke and focused tests.
  'scripts/spec-010b/product-line-b-smoke.ts',
  'src/lib/__tests__/product-line-b-seed.test.ts',
  'src/lib/__tests__/product-line-b-smoke.test.ts',
  // SPEC-009C1 pilot issue ingest and eligibility.
  'src/lib/pilot-issue-eligibility.ts',
  // SPEC-009D pilot review packet and focused contract tests.
  'src/lib/pilot-review-packet.ts',
  'src/lib/__tests__/pilot-review-packet.fixtures.ts',
  'src/lib/__tests__/pilot-review-packet.test.ts',
  'src/lib/__tests__/pilot-review-packet-artifacts.test.ts',
  // SPEC-009E task evidence route, helper, and compact task-detail UI.
  'src/lib/task-evidence.ts',
  'src/lib/__tests__/task-evidence.fixtures.ts',
  'src/lib/__tests__/task-evidence.test.ts',
  'src/components/panels/task-evidence-section.tsx',
  // SPEC-009F production triage routing.
  'src/lib/triage-routing-payloads.ts',
  'src/lib/triage-routing.ts',
  'src/lib/__tests__/triage-routing-payloads.test.ts',
  'src/lib/__tests__/triage-routing.test.ts',
  'src/components/panels/__tests__/task-evidence-section.test.tsx',
  'tests/e2e/spec-009f-triage-routing.spec.ts',
  // SPEC-013A run-state persistence spine.
  'src/lib/task-stage-attempts.ts',
  'src/lib/__tests__/migrations-M76-task-stage-attempts.test.ts',
  'src/lib/__tests__/task-stage-attempts.test.ts',
  'src/lib/__tests__/task-stage-attempts-route.test.ts',
  'src/app/api/index/route.ts',
  'src/app/api/tasks/[id]/stage-attempts/route.ts',
  'src/components/panels/task-stage-attempts-section.tsx',
  'src/components/panels/__tests__/task-stage-attempts-section.test.tsx',
  'tests/e2e/spec-013a-task-stage-attempts.spec.ts',
  // SPEC-013A1 GitHub sync automation lifecycle.
  'src/lib/github-sync-lifecycle-types.ts',
  'src/lib/github-sync-lifecycle-api.ts',
  'src/lib/github-sync-lifecycle.ts',
  'src/lib/__tests__/fixtures/github-sync-lifecycle-fixtures.ts',
  'src/lib/__tests__/github-sync-lifecycle-api.test.ts',
  'src/lib/__tests__/github-sync-lifecycle.test.ts',
  'src/lib/__tests__/github-sync-lifecycle-errors.test.ts',
  'src/app/api/github/sync/control/route.ts',
  'tests/e2e/fixtures/github-sync-lifecycle.ts',
  'tests/e2e/spec-013a1-github-sync-automation.spec.ts',
  // SPEC-013B claim and reconciliation authority.
  'src/lib/task-claim-reconciliation.ts',
  'src/app/api/tasks/[id]/claim-reconciliation/route.ts',
  'src/lib/__tests__/migrations-M78-task-stage-claims.test.ts',
  'src/lib/__tests__/task-claim-reconciliation-fixtures.ts',
  'src/lib/__tests__/task-claim-reconciliation.test.ts',
  'src/lib/__tests__/task-dispatch-claim-reconciliation.test.ts',
  'src/lib/__tests__/task-claim-reconciliation-route.test.ts',
  // SPEC-013C retry/backoff and debug API surfaces.
  'src/lib/task-claim-control-types.ts',
  'src/lib/task-claim-control-idempotency.ts',
  'src/lib/task-claim-control.ts',
  'src/app/api/tasks/[id]/claim-control/route.ts',
  'src/lib/__tests__/migrations-M79-task-claim-control.test.ts',
  'src/lib/__tests__/task-claim-control-idempotency.test.ts',
  'src/lib/__tests__/task-claim-control.test.ts',
  'src/lib/__tests__/task-claim-control-route.test.ts',
  // SPEC-013D claim-control operator UX.
  'src/components/panels/claim-control-copy.ts',
  'src/components/panels/claim-control-section.tsx',
  'src/components/panels/claim-control-section.stories.tsx',
  'src/components/panels/__tests__/claim-control-section.test.tsx',
  'tests/e2e/spec-013d-claim-control-operator-ux.spec.ts',
  // SPEC-014A sandbox ownership and lifecycle contract.
  'src/lib/agent-sandbox-lifecycle.ts',
  'src/app/api/tasks/[id]/sandbox-lifecycles/route.ts',
  'src/lib/__tests__/agent-sandbox-lifecycle-fixtures.ts',
  'src/lib/__tests__/migrations-M80-agent-sandbox-lifecycles.test.ts',
  'src/lib/__tests__/agent-sandbox-lifecycle.test.ts',
  'src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts',
  // SPEC-014B harness adapter manifest fakes and runtime inventory.
  'src/lib/harness-adapters/types.ts',
  'src/lib/harness-adapters/evidence.ts',
  'src/lib/harness-adapters/fixtures.ts',
  'src/lib/harness-adapters/validation.ts',
  'src/lib/harness-adapters/runtime-inventory.ts',
  'src/lib/harness-adapters/__tests__/validation.test.ts',
  'src/lib/harness-adapters/__tests__/runtime-inventory.test.ts',
  'src/components/agents/RuntimeInventoryEvidence.tsx',
  'src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx',
  'scripts/spec-014b/check-harness-adapter-scope.mjs',
  // SPEC-014C first real Codex app-server harness adapter.
  'src/lib/harness-adapters/codex-app-server/manifest.ts',
  'src/lib/harness-adapters/codex-app-server/input.ts',
  'src/lib/harness-adapters/codex-app-server/protocol.ts',
  'src/lib/harness-adapters/codex-app-server/evidence.ts',
  'src/lib/harness-adapters/codex-app-server/runner.ts',
  'src/lib/task-dispatch-codex-app-server.ts',
  'src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts',
  'src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts',
  'src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts',
  'src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts',
  'src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts',
  'src/lib/__tests__/task-dispatch-codex-app-server.test.ts',
  'scripts/spec-014c/check-scope-guard.mjs',
]

const config = tseslint.config(
  ...next,
  {
    ignores: [
      '.data/**',
      'ops/**',
      'test-results/**',
      'playwright-report/**',
      'storybook-static/**',
      '.tmp/**',
      '.playwright-mcp/**',
      '.tsbuild/**',
    ],
  },
  {
    files: specStrictFiles,
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/extensions': ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.spec-strict.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
        },
      },
    },
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          'newlines-between': 'never',
        },
      ],
    },
  },
  // The React 19/ESLint ecosystem is still settling. These rules are valuable,
  // but they currently trigger a lot of false positives in this codebase.
  // Keep them off until we do a dedicated refactor pass.
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
)

export default config
