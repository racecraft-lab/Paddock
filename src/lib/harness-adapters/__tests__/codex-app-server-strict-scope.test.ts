import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SPEC_014C_STRICT_SCOPE_PATHS = [
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
] as const;

describe('SPEC-014C strict TypeScript scope', () => {
  it('registers the planned Codex app-server adapter files', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.spec-strict.json', 'utf8')) as {
      include?: string[];
    };

    expect(tsconfig.include).toEqual(
      expect.arrayContaining([...SPEC_014C_STRICT_SCOPE_PATHS]),
    );
  });
});
