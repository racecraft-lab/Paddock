/**
 * SPEC-008 — Storybook decorator overriding `resolveFlag` (T189).
 *
 * Per FR-375. Stories that depend on `resolveFlag('FEATURE_RESOURCE_GOVERNANCE')`
 * cannot use the production resolver (which reads `workspaces.feature_flags`
 * from a live DB). This decorator wraps a story in a context provider that
 * supplies a static map of flag values, mirroring `resolveFlag`'s
 * `(name, ctx) => boolean` shape.
 *
 * Usage in a story:
 *
 *   import { withFeatureFlags } from '@/components/__storybook__/decorators/with-feature-flags';
 *
 *   const meta: Meta = {
 *     decorators: [withFeatureFlags({ FEATURE_RESOURCE_GOVERNANCE: true })],
 *   };
 *
 * Components inside the story tree can call `useFeatureFlagOverride()` to
 * pull the static map. The decorator does NOT mutate global state — it
 * is local to the rendered story tree.
 *
 * @see specs/008-resource-governance/spec.md FR-375
 * @see specs/008-resource-governance/tasks.md T189
 */

'use client';

import {
  createContext,
  useContext,
  type ReactElement,
} from 'react';
import type { Decorator } from '@storybook/nextjs-vite';

type FlagOverrides = Record<string, boolean>;

const FlagOverrideContext = createContext<FlagOverrides>({});

export function useFeatureFlagOverride(): FlagOverrides {
  return useContext(FlagOverrideContext);
}

/**
 * Decorator factory. Returns a Storybook decorator that wraps the
 * rendered story in `<FlagOverrideContext.Provider>`.
 */
export function withFeatureFlags(overrides: FlagOverrides): Decorator {
  const Wrapped: Decorator = (Story: () => ReactElement): ReactElement => (
    <FlagOverrideContext.Provider value={overrides}>
      <Story />
    </FlagOverrideContext.Provider>
  );
  return Wrapped;
}

/**
 * Convenience helpers — most stories want exactly one flag set.
 */
export function withGovernanceOn(): Decorator {
  return withFeatureFlags({ FEATURE_RESOURCE_GOVERNANCE: true });
}

export function withGovernanceOff(): Decorator {
  return withFeatureFlags({ FEATURE_RESOURCE_GOVERNANCE: false });
}
