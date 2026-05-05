export const VISUAL_REVIEW_SCHEMA = 'mission-control.visual-review-state.v1'
export const VISUAL_REVIEW_COMMENT_MARKER = 'mission-control-visual-review-state:v1'
export const VISUAL_REVIEW_STATUS_CONTEXT = 'visual-review-approval'
export const DEFAULT_REQUIRED_VISUAL_SURFACES = ['playwright', 'storybook']
export const DEFAULT_VISUAL_REVIEW_PATHS = [
  '.storybook/**',
  'Dockerfile',
  'docker-entrypoint.sh',
  'messages/en.json',
  'package.json',
  'playwright*.config.ts',
  'pnpm-lock.yaml',
  'regconfig*.json',
  'scripts/check-visual-review-approval.mjs',
  'scripts/clean-visual-output.mjs',
  'scripts/e2e-docker.sh',
  'scripts/publish-visual-pr-pages.mjs',
  'scripts/seed-e2e-spec-007.cjs',
  'scripts/seed-e2e-spec-008.cjs',
  'scripts/seed-e2e-workspace-switcher.cjs',
  'scripts/seed-spec-007.ts',
  'scripts/verify-visual-manifest.mjs',
  'scripts/visual-review-app.css',
  'scripts/visual-review-app.js',
  'scripts/visual-review-producer.mjs',
  'scripts/visual-review-state.mjs',
  'scripts/write-storybook-visual-manifests.mjs',
  'src/**/*.stories.tsx',
  'src/app/api/**',
  'src/app/globals.css',
  'src/components/layout/**',
  'src/components/panels/notifications-panel.tsx',
  'src/components/panels/orchestration-bar.tsx',
  'src/components/panels/task-board-panel.tsx',
  'src/components/settings/**',
  'src/components/ui/**',
  'src/lib/feature-flags.ts',
  'src/lib/workspaces.ts',
  'src/store/**',
  'src/types/product-line.ts',
  'src/types/workflow-template.ts',
  'tailwind.config.js',
  'tests/e2e/feature-flag-matrix.e2e.ts',
  'tests/e2e/governance-*.e2e.ts',
  'tests/e2e/governance-*.spec.ts',
  'tests/e2e/ready-for-owner-kanban.spec.ts',
  'tests/e2e/spec-007-ui-visual.spec.ts',
  'tests/e2e/spec-008/**',
  'tests/feature-flags-*.spec.ts',
  'tests/helpers.ts',
  'tests/product-line-*.spec.ts',
  'tests/visual/**',
  'tests/workspace-switcher-*.spec.ts',
  'vitest.storybook.config.ts',
]

const REVIEWABLE_VARIANTS = new Set(['changed', 'new', 'deleted'])
const REVIEW_DECISIONS = new Set(['approved', 'rejected'])

export function buildSurfaceReviewState({
  comments = {},
  context,
  items,
  reviews = {},
  reviewer = '',
  updatedAt = new Date().toISOString(),
}) {
  const decisions = {}
  const reviewableItems = Array.isArray(items)
    ? items.filter((item) => REVIEWABLE_VARIANTS.has(item?.variant))
    : []

  for (const item of reviewableItems) {
    const decision = REVIEW_DECISIONS.has(reviews[item.id]) ? reviews[item.id] : 'open'
    decisions[item.id] = {
      decision,
      group: String(item.group || 'ungrouped'),
      snapshot: String(item.raw || item.encoded || item.id),
      updatedAt: decision === 'open' ? null : updatedAt,
      variant: item.variant,
    }
    const comment = typeof comments[item.id] === 'string' ? comments[item.id].trim() : ''
    if (comment && decision !== 'open') {
      decisions[item.id].comment = comment
    }
    if (decision !== 'open' && reviewer) {
      decisions[item.id].reviewer = reviewer
    }
  }

  const values = Object.values(decisions)
  const approved = values.filter((entry) => entry.decision === 'approved').length
  const rejected = values.filter((entry) => entry.decision === 'rejected').length
  const open = values.filter((entry) => entry.decision === 'open').length
  const reviewed = approved + rejected
  const status = rejected > 0 ? 'changes_requested' : open > 0 ? 'pending' : 'approved'

  return {
    baseRef: String(context.baseRef || ''),
    decisions,
    headRef: String(context.headRef || ''),
    headSha: String(context.headSha || ''),
    prNumber: String(context.prNumber || ''),
    prTitle: String(context.prTitle || `PR #${context.prNumber || ''}`),
    prUrl: String(context.prUrl || ''),
    reportHref: String(context.reportHref || ''),
    repository: String(context.repository || ''),
    runAttempt: String(context.runAttempt || ''),
    runId: String(context.runId || ''),
    runKey: String(context.runKey || ''),
    runUrl: String(context.runUrl || ''),
    summary: {
      approved,
      open,
      rejected,
      reviewable: reviewableItems.length,
      reviewed,
      status,
    },
    surface: String(context.surface || ''),
    surfaceLabel: String(context.surfaceLabel || context.surface || ''),
    updatedAt,
  }
}

export function mergeSurfaceReviewState(existingState, surfaceState) {
  const baseState = isReviewState(existingState) && sameReviewTarget(existingState, surfaceState)
    ? existingState
    : {
        prNumber: surfaceState.prNumber,
        prTitle: surfaceState.prTitle,
        prUrl: surfaceState.prUrl,
        repository: surfaceState.repository,
        schema: VISUAL_REVIEW_SCHEMA,
        surfaces: {},
        updatedAt: surfaceState.updatedAt,
        version: 1,
      }

  return {
    ...baseState,
    prNumber: surfaceState.prNumber,
    prTitle: surfaceState.prTitle || baseState.prTitle,
    prUrl: surfaceState.prUrl || baseState.prUrl,
    repository: surfaceState.repository,
    schema: VISUAL_REVIEW_SCHEMA,
    surfaces: {
      ...baseState.surfaces,
      [surfaceState.surface]: surfaceState,
    },
    updatedAt: surfaceState.updatedAt,
    version: 1,
  }
}

export function renderReviewComment(state) {
  const normalized = normalizeReviewState(state)
  const rows = Object.values(normalized.surfaces)
    .sort((a, b) => a.surface.localeCompare(b.surface))
    .map((surface) => {
      const status = surface.summary.status === 'approved'
        ? 'Approved'
        : surface.summary.status === 'changes_requested'
          ? 'Changes requested'
          : 'Pending'
      const reviewed = `${surface.summary.reviewed}/${surface.summary.reviewable} reviewed`
      const report = surface.reportHref ? `[Open report](${surface.reportHref})` : ''
      return `| ${surface.surfaceLabel || surface.surface} | ${shortSha(surface.headSha)} | ${reviewed} | ${status} | ${report} |`
    })
    .join('\n')

  return [
    `<!-- ${VISUAL_REVIEW_COMMENT_MARKER}`,
    JSON.stringify(normalized, null, 2),
    '-->',
    '## Visual review state',
    '',
    'This comment is managed by the Mission Control visual review app.',
    '',
    `PR: #${normalized.prNumber} ${normalized.prTitle}`,
    `Last updated: ${normalized.updatedAt}`,
    '',
    '| Surface | Head | Progress | Status | Report |',
    '| --- | --- | ---: | --- | --- |',
    rows || '| No visual surfaces recorded |  |  | Pending |  |',
  ].join('\n')
}

export function parseReviewCommentBody(body) {
  if (typeof body !== 'string') return null
  const marker = escapeRegExp(VISUAL_REVIEW_COMMENT_MARKER)
  const match = body.match(new RegExp(`<!--\\s*${marker}\\s*([\\s\\S]*?)\\s*-->`))
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    return isReviewState(parsed) ? normalizeReviewState(parsed) : null
  } catch {
    return null
  }
}

export function findReviewComment(comments) {
  if (!Array.isArray(comments)) return null
  return comments
    .filter((comment) => parseReviewCommentBody(comment?.body))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null
}

export function validateVisualApproval(state, options = {}) {
  const requiredSurfaces = normalizeRequiredSurfaces(options.requiredSurfaces)
  const failures = []

  if (!isReviewState(state)) {
    return {
      approved: false,
      failures: ['visual review state is missing'],
      summary: 'Visual review approval is missing',
    }
  }

  const normalized = normalizeReviewState(state)
  if (options.repository && normalized.repository !== options.repository) {
    failures.push(`visual review state is for ${normalized.repository}, not ${options.repository}`)
  }
  if (options.prNumber && String(normalized.prNumber) !== String(options.prNumber)) {
    failures.push(`visual review state is for PR #${normalized.prNumber}, not PR #${options.prNumber}`)
  }

  for (const surfaceName of requiredSurfaces) {
    const surface = normalized.surfaces[surfaceName]
    if (!surface) {
      failures.push(`${surfaceName} visual review state is missing`)
      continue
    }
    if (options.headSha && surface.headSha !== options.headSha) {
      failures.push(`${surfaceName} was reviewed at ${shortSha(surface.headSha)}, not current head ${shortSha(options.headSha)}`)
    }
    if (surface.summary.rejected > 0) {
      failures.push(`${surfaceName} has ${surface.summary.rejected} rejected snapshot(s)`)
    }
    if (surface.summary.open > 0) {
      failures.push(`${surfaceName} has ${surface.summary.open} unreviewed snapshot(s)`)
    }
    if (surface.summary.reviewed !== surface.summary.reviewable) {
      failures.push(`${surfaceName} review count ${surface.summary.reviewed}/${surface.summary.reviewable} is incomplete`)
    }
    if (surface.summary.status !== 'approved') {
      failures.push(`${surfaceName} visual review status is ${surface.summary.status}`)
    }
  }

  return {
    approved: failures.length === 0,
    failures,
    summary: failures.length === 0
      ? `Visual review approved for ${requiredSurfaces.join(', ')}`
      : `Visual review blocked: ${failures[0]}`,
  }
}

export function normalizeRequiredSurfaces(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  return DEFAULT_REQUIRED_VISUAL_SURFACES
}

export function visualReviewRequiredForFiles(files, patterns = DEFAULT_VISUAL_REVIEW_PATHS) {
  if (!Array.isArray(files) || files.length === 0) return false
  return files.some((filePath) => patterns.some((pattern) => pathMatchesVisualReviewPattern(filePath, pattern)))
}

export function pathMatchesVisualReviewPattern(filePath, pattern) {
  const normalizedFile = String(filePath || '').replaceAll('\\', '/')
  const normalizedPattern = String(pattern || '').replaceAll('\\', '/')
  return globPatternToRegExp(normalizedPattern).test(normalizedFile)
}

export function normalizeReviewState(state) {
  return {
    prNumber: String(state.prNumber || ''),
    prTitle: String(state.prTitle || `PR #${state.prNumber || ''}`),
    prUrl: String(state.prUrl || ''),
    repository: String(state.repository || ''),
    schema: VISUAL_REVIEW_SCHEMA,
    surfaces: state.surfaces || {},
    updatedAt: String(state.updatedAt || new Date().toISOString()),
    version: 1,
  }
}

function isReviewState(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.schema === VISUAL_REVIEW_SCHEMA &&
    value.surfaces &&
    typeof value.surfaces === 'object'
  )
}

function sameReviewTarget(state, surface) {
  return String(state.repository || '') === String(surface.repository || '') &&
    String(state.prNumber || '') === String(surface.prNumber || '')
}

function shortSha(sha) {
  return String(sha || '').slice(0, 7) || 'unknown'
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function globPatternToRegExp(pattern) {
  let source = ''
  for (let i = 0; i < pattern.length;) {
    if (pattern.slice(i, i + 3) === '**/') {
      source += '(?:.*/)?'
      i += 3
      continue
    }
    if (pattern.slice(i, i + 2) === '**') {
      source += '.*'
      i += 2
      continue
    }
    const character = pattern[i]
    if (character === '*') {
      source += '[^/]*'
    } else if (character === '?') {
      source += '[^/]'
    } else {
      source += escapeRegExp(character)
    }
    i += 1
  }
  return new RegExp(`^${source}$`)
}
