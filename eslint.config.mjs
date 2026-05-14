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
  // SPEC-009B Mission Control product-line seed.
  'src/lib/mission-control-seed/**/*.ts',
  'scripts/seed-mission-control-product-line.ts',
  // SPEC-009C1 pilot issue ingest and eligibility.
  'src/lib/pilot-issue-eligibility.ts',
]

const config = tseslint.config(
  ...next,
  {
    ignores: [
      '.data/**',
      'ops/**',
      'test-results/**',
      'playwright-report/**',
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
