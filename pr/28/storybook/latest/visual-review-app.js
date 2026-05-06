import {
  buildSurfaceReviewState,
  findReviewComment,
  mergeSurfaceReviewState,
  normalizeRequiredSurfaces,
  parseReviewCommentBody,
  renderReviewComment,
  validateVisualApproval,
  VISUAL_REVIEW_STATUS_CONTEXT,
} from './visual-review-state.mjs'
import { annotationPageHref } from './visual-review-annotations.mjs'
import {
  DEFAULT_HEAT_MAP_THRESHOLD,
  writeHeatMapPixels,
} from './visual-review-heatmap.mjs'

/* global document, window, localStorage, history, sessionStorage, URL, URLSearchParams */
(() => {
  const dataElement = document.getElementById('visual-review-data')
  const root = document.getElementById('visual-review-root')
  if (!dataElement || !root) return

  const data = JSON.parse(dataElement.textContent)
  const payload = data.payload
  const context = data.context
  const reviewableVariants = new Set(['changed', 'new', 'deleted'])
  const githubTokenDocsUrl = 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token'
  const themeStorageKey = 'visual-review:theme'
  const heatMapIntensityMin = 25
  const heatMapIntensityMax = 100
  const heatMapIntensityDefault = 100
  const embeddedReviewState = initialReviewStateContext()

  const state = {
    activeId: null,
    filter: 'unreviewed',
    githubToken: sessionStorage.getItem(githubTokenKey()) || '',
    githubUser: '',
    group: 'all',
    heatMapIntensity: clamp(Number(localStorage.getItem(storageKey('heat-map-intensity')) || heatMapIntensityDefault), heatMapIntensityMin, heatMapIntensityMax),
    heatMaps: readHeatMaps(),
    inlineCommentMessage: '',
    inlineCommentState: 'idle',
    mode: localStorage.getItem(storageKey('mode')) || 'side-by-side',
    overlay: clamp(Number(localStorage.getItem(storageKey('overlay')) || 50), 0, 100),
    query: '',
    remoteAuthor: embeddedReviewState ? String(context.initialReviewStateAuthor || '') : '',
    remoteCommentId: embeddedReviewState ? context.initialReviewStateCommentId || null : null,
    remoteState: embeddedReviewState,
    reviewComments: readReviewComments(),
    reviews: readReviews(),
    syncMessage: embeddedReviewState
      ? 'Loading merged PR review state...'
      : (hasReviewStateTarget() ? 'Loading PR state...' : 'No linked PR review state is available.'),
    syncState: embeddedReviewState || !hasReviewStateTarget() ? 'ready' : 'loading',
    theme: initialVisualReviewTheme(),
    tokenHelpOpen: false,
    zoom: clamp(Number(localStorage.getItem(storageKey('zoom')) || 100), 50, 200),
  }

  const items = buildItems()
  const groups = Array.from(new Set(items.map((item) => item.group))).sort((a, b) => a.localeCompare(b))
  const initialId = new URLSearchParams(window.location.search).get('id')
  let pendingStageScroll = null
  state.activeId = items.some((item) => item.id === initialId)
    ? initialId
    : (items.find((item) => reviewableVariants.has(item.variant)) || items[0])?.id

  applyVisualReviewTheme(state.theme)
  render()
  window.addEventListener('keydown', handleKeys)
  if (embeddedReviewState) {
    applyRemoteReviewState(
      embeddedReviewState,
      state.remoteAuthor ? `@${state.remoteAuthor}` : 'Merged PR state'
    )
  } else if (hasReviewStateTarget()) {
    loadRemoteReviewState({ silent: true })
  }

  function initialReviewStateContext() {
    return context.initialReviewState && typeof context.initialReviewState === 'object'
      ? context.initialReviewState
      : null
  }

  function hasReviewStateTarget() {
    return Boolean(context.prNumber)
  }

  function storageKey(suffix) {
    return `visual-review:${context.prNumber}:${context.surface}:${context.runKey}:${context.headSha}:${suffix}`
  }

  function githubTokenKey() {
    return `visual-review:${context.repository}:${context.prNumber}:github-token`
  }

  function initialVisualReviewTheme() {
    const stored = localStorage.getItem(themeStorageKey)
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function applyVisualReviewTheme(theme) {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }

  function toggleVisualReviewTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(themeStorageKey, state.theme)
    applyVisualReviewTheme(state.theme)
    render()
  }

  function githubTokenCreationUrl() {
    const repositoryOwner = String(context.repository || '').split('/')[0]
    const params = new URLSearchParams({
      description: `Publish visual review state for ${context.repository}`,
      expires_in: '30',
      issues: 'write',
      name: 'Mission Control visual review',
      pull_requests: 'write',
      statuses: 'write',
    })

    if (repositoryOwner) params.set('target_name', repositoryOwner)

    return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`
  }

  function readReviews() {
    try {
      return JSON.parse(localStorage.getItem(storageKey('reviews')) || '{}')
    } catch {
      return {}
    }
  }

  function saveReviews() {
    localStorage.setItem(storageKey('reviews'), JSON.stringify(state.reviews))
  }

  function readReviewComments() {
    try {
      return JSON.parse(localStorage.getItem(storageKey('review-comments')) || '{}')
    } catch {
      return {}
    }
  }

  function readHeatMaps() {
    try {
      return JSON.parse(localStorage.getItem(storageKey('heat-maps')) || '{}')
    } catch {
      return {}
    }
  }

  function saveHeatMaps() {
    localStorage.setItem(storageKey('heat-maps'), JSON.stringify(state.heatMaps))
  }

  function saveReviewComments() {
    localStorage.setItem(storageKey('review-comments'), JSON.stringify(state.reviewComments))
  }

  function persistViewState() {
    localStorage.setItem(storageKey('heat-map-intensity'), String(state.heatMapIntensity))
    localStorage.setItem(storageKey('mode'), state.mode)
    localStorage.setItem(storageKey('overlay'), String(state.overlay))
    localStorage.setItem(storageKey('zoom'), String(state.zoom))
  }

  function reportItems(key) {
    return Array.isArray(payload[key]) ? payload[key] : []
  }

  function buildItems() {
    return [
      ...reportItems('failedItems').map((item) => buildItem(item, 'changed')),
      ...reportItems('newItems').map((item) => buildItem(item, 'new')),
      ...reportItems('deletedItems').map((item) => buildItem(item, 'deleted')),
      ...reportItems('passedItems').map((item) => buildItem(item, 'passed')),
    ]
  }

  function buildItem(item, variant) {
    const fileName = item.encoded || item.raw
    const id = `${variant}-${fileName}`.replace(/[=?&]/g, '-')
    const raw = item.raw || fileName
    const review = normalizeReviewMetadata(item.review || item.visualMetadata || item.metadata)
    const group = review?.domain || groupName(raw)
    return {
      id,
      raw,
      encoded: fileName,
      variant,
      group,
      actual: joinUrl(payload.actualDir, fileName),
      expected: joinUrl(payload.expectedDir, fileName),
      diff: joinUrl(payload.diffDir, diffFileName(fileName)),
      baselineReference: normalizeBaselineReference(item.baselineReference),
      review,
      searchText: itemSearchText({ raw, variant, group, review }),
    }
  }

  function normalizeBaselineReference(value) {
    if (!value || typeof value !== 'object') return null
    return {
      baselineHeadSha: stringOr(value.baselineHeadSha),
      baselineReportHref: stringOr(value.baselineReportHref),
      imageHref: stringOr(value.imageHref),
      imageSha256: stringOr(value.imageSha256),
      sourcePrNumber: stringOr(value.sourcePrNumber),
      sourcePrUrl: stringOr(value.sourcePrUrl),
      sourceTestKey: stringOr(value.sourceTestKey),
      sourceVariant: stringOr(value.sourceVariant),
    }
  }

  function normalizeReviewMetadata(value) {
    if (!value || typeof value !== 'object') return null
    const title = stringOr(value.title)
    const storyTitle = stringOr(value.storyTitle)
    const storyName = stringOr(value.storyName)
    const testTitle = stringOr(value.testTitle)
    const titlePath = stringArray(value.testTitlePath)
    const subtitle = stringOr(value.subtitle) ||
      (titlePath.length ? titlePath.join(' > ') : '') ||
      [storyTitle, storyName].filter(Boolean).join(' / ') ||
      stringOr(value.sourceFile)

    return {
      description: stringOr(value.description),
      domain: stringOr(value.domain),
      expected: stringOr(value.expected),
      focus: stringArray(value.focus),
      kind: stringOr(value.kind),
      name: stringOr(value.name),
      sourceFile: stringOr(value.sourceFile),
      storyExportName: stringOr(value.storyExportName),
      storyId: stringOr(value.storyId),
      storyName,
      storyTitle,
      subtitle,
      tags: stringArray(value.tags),
      testAnnotations: annotationArray(value.testAnnotations),
      testTitle,
      testTitlePath: titlePath,
      title,
    }
  }

  function stringOr(value) {
    return typeof value === 'string' && value.length > 0 ? value : ''
  }

  function stringArray(value) {
    return Array.isArray(value)
      ? value.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : []
  }

  function annotationArray(value) {
    return Array.isArray(value)
      ? value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          type: stringOr(entry.type) || 'note',
          description: stringOr(entry.description),
        }))
      : []
  }

  function itemSearchText(item) {
    const review = item.review || {}
    return [
      item.raw,
      item.group,
      item.variant,
      itemTitle(item),
      itemSubtitle(item),
      review.description,
      review.expected,
      review.kind,
      review.sourceFile,
      review.storyExportName,
      review.storyId,
      review.storyName,
      review.storyTitle,
      review.testTitle,
      ...(review.focus || []),
      ...(review.tags || []),
      ...(review.testTitlePath || []),
      ...(review.testAnnotations || []).flatMap((annotation) => [annotation.type, annotation.description]),
    ].filter(Boolean).join(' ').toLowerCase()
  }

  function itemTitle(item) {
    return item.review?.title || humanizeSnapshotName(item.raw)
  }

  function itemSubtitle(item) {
    return item.review?.subtitle || item.review?.sourceFile || item.group
  }

  function humanizeSnapshotName(fileName) {
    const leaf = String(fileName || '').split('/').pop() || fileName
    return leaf
      .replace(/\.[^.]+$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/[-_.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || fileName
  }

  function groupName(fileName) {
    if (fileName.includes('/')) return fileName.split('/')[0]
    if (fileName.includes('--')) return fileName.split('--')[0]
    if (fileName.includes('.')) return fileName.split('.')[0]
    return 'ungrouped'
  }

  function joinUrl(base, fileName) {
    return `${String(base || '').replace(/\/$/, '')}/${String(fileName || '').replace(/^\//, '')}`
  }

  function diffFileName(fileName) {
    const extension = String(payload.diffImageExtention || payload.diffImageExtension || 'webp').replace(/^\./, '')
    const slash = fileName.lastIndexOf('/')
    const dir = slash >= 0 ? fileName.slice(0, slash + 1) : ''
    const leaf = slash >= 0 ? fileName.slice(slash + 1) : fileName
    const dot = leaf.lastIndexOf('.')
    const stem = dot >= 0 ? leaf.slice(0, dot) : leaf
    return `${dir}${stem}.${extension}`
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase()
    return items.filter((item) => {
      const reviewState = state.reviews[item.id]
      const statusMatch =
        state.filter === 'all' ||
        (state.filter === 'reviewable' && reviewableVariants.has(item.variant)) ||
        (state.filter === 'unreviewed' && reviewableVariants.has(item.variant) && !reviewState) ||
        state.filter === item.variant
      const groupMatch = state.group === 'all' || state.group === item.group
      const queryMatch = !query || item.searchText.includes(query)
      return statusMatch && groupMatch && queryMatch
    })
  }

  function activeItem() {
    return items.find((item) => item.id === state.activeId) || items[0]
  }

  function counts() {
    const reviewable = items.filter((item) => reviewableVariants.has(item.variant))
    const reviewed = reviewable.filter((item) => state.reviews[item.id]).length
    return {
      changed: items.filter((item) => item.variant === 'changed').length,
      deleted: items.filter((item) => item.variant === 'deleted').length,
      new: items.filter((item) => item.variant === 'new').length,
      passed: items.filter((item) => item.variant === 'passed').length,
      rejected: reviewable.filter((item) => state.reviews[item.id] === 'rejected').length,
      reviewable: reviewable.length,
      reviewed,
    }
  }

  function render() {
    const current = activeItem()
    const currentCounts = counts()
    const progress = currentCounts.reviewable === 0 ? 100 : Math.round((currentCounts.reviewed / currentCounts.reviewable) * 100)
    root.innerHTML = `
      <div class="review-shell">
        <header class="topbar">
          <div class="topbar-inner">
            <div class="topbar-title">
              <nav class="crumbs" aria-label="Breadcrumb">
                <a href="${escapeAttribute(context.prIndexHref)}">PR #${escapeHtml(context.prNumber)}</a>
                <span>/</span>
                <span>${escapeHtml(context.surfaceLabel)}</span>
                <span>/</span>
                <span>Run ${escapeHtml(context.runId)}</span>
              </nav>
              <h1>${escapeHtml(context.prTitle)}</h1>
              <div class="meta-row">
                <span>${escapeHtml(context.headRef)} into ${escapeHtml(context.baseRef)}</span>
                <span>Commit ${escapeHtml(String(context.headSha || '').slice(0, 7))}</span>
                <span>${escapeHtml(context.surfaceLabel)}</span>
              </div>
            </div>
            <div class="topbar-actions">
              <button class="btn theme-toggle" type="button" data-action="toggle-theme" aria-pressed="${state.theme === 'dark' ? 'true' : 'false'}">${state.theme === 'dark' ? 'Light' : 'Dark'}</button>
              <div class="status-summary" aria-label="Review progress">
                <div data-summary="open">
                  <span>Open</span>
                  <strong>${escapeHtml(String(currentCounts.reviewable - currentCounts.reviewed))}</strong>
                </div>
                <div data-summary="reviewed">
                  <span>Reviewed</span>
                  <strong>${escapeHtml(`${currentCounts.reviewed}/${currentCounts.reviewable}`)}</strong>
                </div>
                <div data-summary="rejected">
                  <span>Rejected</span>
                  <strong>${escapeHtml(String(currentCounts.rejected))}</strong>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main class="review-workspace">
          <aside class="sidebar" aria-label="Snapshot queue">
            <div class="sidebar-header">
              <div class="progress-line">
                <strong>Queue</strong>
                <span>${progress}% complete</span>
              </div>
              <div class="progress-track" aria-hidden="true"><div class="progress-bar" style="width: ${progress}%"></div></div>
              <div class="filters" role="group" aria-label="Filters">
                ${filterButton('unreviewed', `Open ${currentCounts.reviewable - currentCounts.reviewed}`)}
                ${filterButton('reviewable', `Review ${currentCounts.reviewable}`)}
                ${filterButton('changed', `Changed ${currentCounts.changed}`)}
                ${filterButton('all', `All ${items.length}`)}
              </div>
              <input class="search" type="search" value="${escapeAttribute(state.query)}" placeholder="Find by story, test, source, or tag" aria-label="Search snapshots" data-action="search" />
              <select class="group-select" aria-label="Filter by group" data-action="group">
                <option value="all">All groups</option>
                ${groups.map((group) => `<option value="${escapeAttribute(group)}"${group === state.group ? ' selected' : ''}>${escapeHtml(group)}</option>`).join('')}
              </select>
            </div>
            <div class="snapshot-list">
              ${renderSnapshotList()}
            </div>
          </aside>
          <section class="canvas-column">
            ${current ? renderViewer(current) : '<article class="viewer-card"><div class="empty-list">No snapshots match the current filters.</div></article>'}
            ${current ? renderContext(current) : ''}
          </section>
          <aside class="review-panel" aria-label="Review details and decision">
            ${current ? renderReviewBrief(current, currentCounts) : ''}
          </aside>
        </main>
        <footer class="submission-footer" aria-label="Final review submission">
          ${renderSyncPanel(currentCounts)}
        </footer>
        ${state.tokenHelpOpen ? renderTokenHelpModal() : ''}
      </div>
    `
    bindEvents()
    applyZoomState()
    applyOverlayState()
    applyHeatMapControlState(current)
    renderHeatMaps()
  }

  function renderReviewBrief(item, currentCounts) {
    const review = item.review || {}
    const reviewState = state.reviews[item.id] || 'open'
    const open = currentCounts.reviewable - currentCounts.reviewed
    const decisionTone = reviewState === 'approved' ? 'approved' : reviewState === 'rejected' ? 'rejected' : 'open'
    const comment = reviewCommentFor(item)
    const commentRequired = !comment.trim()
    const target = inlineCommentTarget(item)
    const postDisabled = !canPostInlineComment(item, comment)

    return `
      <section class="review-brief" aria-labelledby="review-brief-title" data-review-brief>
        <div class="brief-topline">
          <span>${escapeHtml(statusLabel(item.variant))}</span>
          <span class="decision-pill ${escapeAttribute(decisionTone)}">${escapeHtml(reviewState)}</span>
        </div>
        <h2 id="review-brief-title">${escapeHtml(itemTitle(item))}</h2>
        ${review.description ? `<p class="brief-description">${escapeHtml(review.description)}</p>` : ''}
        ${review.tags?.length ? `<div class="metadata-chip-row">${review.tags.map((tag) => `<span class="metadata-chip">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        <div class="review-sequence" aria-label="Review sequence">
          <div class="review-sequence-heading">
            <h3>Review sequence</h3>
            <p>${escapeHtml(`${open} open on this surface`)}</p>
          </div>
          <ol class="review-step-list">
            <li class="review-step">
              <span class="step-number">1</span>
              <div class="step-body">
                <h4>Identify the ${escapeHtml(reviewSubjectLabel(item))}</h4>
                <p>${escapeHtml(itemSubtitle(item))}</p>
                <div class="brief-facts">
                  ${review.sourceFile ? briefFact('Source', review.sourceFile) : ''}
                  ${briefFact(review.kind === 'storybook' ? 'Story' : 'Test', review.storyName || review.testTitle || itemTitle(item))}
                  ${review.storyId ? briefFact('Story ID', review.storyId) : ''}
                  ${briefFact('Snapshot', item.raw)}
                </div>
                ${renderReviewLinks(item, target)}
              </div>
            </li>
            <li class="review-step">
              <span class="step-number">2</span>
              <div class="step-body">
                <h4>Inspect the visual state</h4>
                ${review.expected ? `<p><strong>Expected:</strong> ${escapeHtml(review.expected)}</p>` : ''}
                <ul class="review-focus-list">
                  ${(review.focus?.length ? review.focus : defaultReviewFocus(item)).map((focus) => `<li>${escapeHtml(focus)}</li>`).join('')}
                </ul>
                <p class="decision-rule">Approve only intentional UI changes. Reject clipped text, missing data, broken spacing, wrong feature-flag state, unexpected new screenshots, or unexpected removals.</p>
              </div>
            </li>
            <li class="review-step">
              <span class="step-number">3</span>
              <div class="step-body">
                <h4>Comment before rejecting</h4>
                <p>A rejection needs a written reason. The same note can be posted as an inline PR review comment on the selected source file.</p>
                ${renderInlineCommentTarget(target)}
                <label class="review-comment-field">
                  <span>Reviewer comment</span>
                  <textarea data-action="review-comment" rows="4" placeholder="Describe what is wrong, what should change, or why this visual state needs another pass.">${escapeHtml(comment)}</textarea>
                </label>
                <div class="inline-comment-actions">
                  <button class="btn" type="button" data-action="post-inline-comment"${postDisabled ? ' disabled' : ''}>Post inline PR comment</button>
                  <p class="comment-status ${escapeAttribute(state.inlineCommentState)}" data-comment-status>${escapeHtml(commentStatusMessage(item, target, comment))}</p>
                </div>
              </div>
            </li>
            <li class="review-step decision-step">
              <span class="step-number">4</span>
              <div class="step-body">
                <h4>Decide</h4>
                <div class="decision-actions">
                  <button class="btn approve" type="button" data-review="approved">Approve</button>
                  <button class="btn reject" type="button" data-review="rejected"${commentRequired ? ' disabled' : ''}>Reject</button>
                </div>
                <p class="decision-progress" data-decision-helper>${commentRequired ? 'Write a comment in step 3 to enable Reject.' : 'Reject will save this comment with the visual review state.'}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    `
  }

  function defaultReviewFocus(item) {
    return [
      `${statusLabel(item.variant)} screenshot is expected for this PR`,
      'Visible copy, controls, and state badges are readable',
      'Layout spacing and feature-flag state match the scenario',
    ]
  }

  function briefFact(label, value) {
    if (!value) return ''
    return `
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `
  }

  function renderReviewLinks(item, target) {
    const links = []
    const baselineHref = baselineImageHref(item)
    if (target) {
      links.push(`<a class="btn" href="${escapeAttribute(sourceFileHref(target))}" target="_blank" rel="noopener noreferrer" data-source-link>Open source file</a>`)
    }
    if (item.actual && item.variant !== 'deleted') {
      links.push(`<a class="btn" href="${escapeAttribute(annotationPageHref({ asset: 'current', basePath: window.location.href, itemId: item.id }))}" target="_blank" rel="noopener noreferrer" data-annotation-link>Open current image</a>`)
    }
    if (baselineHref) {
      links.push(`<a class="btn" href="${escapeAttribute(baselineHref)}" target="_blank" rel="noopener noreferrer">Open baseline image</a>`)
    }
    if (item.diff && item.variant === 'changed') {
      links.push(`<a class="btn" href="${escapeAttribute(item.diff)}" target="_blank" rel="noopener noreferrer">Open diff image</a>`)
    }
    return `<div class="review-link-row">${links.join('')}</div>`
  }

  function renderInlineCommentTarget(target) {
    if (!target) {
      return `
        <div class="inline-comment-target missing">
          <span>Inline target</span>
          <strong>No source file metadata found</strong>
          <p>This note can still explain the visual decision locally, but GitHub cannot place it on a changed file.</p>
        </div>
      `
    }

    return `
      <div class="inline-comment-target">
        <span>Inline target</span>
        <strong>${escapeHtml(sourceLabel(target))}</strong>
        <a href="${escapeAttribute(sourceFileHref(target))}" target="_blank" rel="noopener noreferrer" data-source-link>View related code file</a>
      </div>
    `
  }

  function reviewSubjectLabel(item) {
    const kind = item.review?.kind
    if (kind === 'storybook') return 'Storybook story'
    if (kind === 'playwright') return 'Playwright test'
    if (item.variant === 'new') return 'new screen'
    if (item.variant === 'deleted') return 'removed screen'
    return 'screen'
  }

  function reviewCommentFor(item) {
    return String(state.reviewComments[item.id] || '')
  }

  function reviewPageHref(item) {
    return `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(item.id)}`
  }

  function inlineCommentTarget(item) {
    return parseSourceReference(item.review?.sourceFile || item.review?.subtitle || '')
  }

  function canPostInlineComment(item, comment = reviewCommentFor(item)) {
    return Boolean(
      item &&
      state.inlineCommentState !== 'loading' &&
      state.githubToken.trim() &&
      comment.trim() &&
      inlineCommentTarget(item)
    )
  }

  function parseSourceReference(value) {
    const candidate = String(value || '').split(' > ')[0].trim()
    if (!candidate) return null
    const match = candidate.match(/^(.+?):(\d+)(?::\d+)?$/)
    const path = (match ? match[1] : candidate).replace(/^\/+/, '')
    if (!path || /\s/.test(path)) return null
    return {
      line: match ? Number(match[2]) : null,
      path,
    }
  }

  function sourceLabel(target) {
    return target?.line ? `${target.path}:${target.line}` : target?.path || ''
  }

  function sourceFileHref(target) {
    if (!target?.path) return context.prUrl
    const line = target.line ? `#L${target.line}` : ''
    return `https://github.com/${context.repository}/blob/${context.headSha}/${target.path}${line}`
  }

  function commentStatusMessage(item, target, comment) {
    if (state.inlineCommentMessage) return state.inlineCommentMessage
    if (!comment.trim()) return 'Write a review comment before rejecting this snapshot.'
    if (!target) return 'Comment saved locally. Add source metadata to post it inline on GitHub.'
    if (!state.githubToken.trim()) return 'Comment saved locally. Add a GitHub token to post it inline on the PR.'
    if (state.inlineCommentState === 'loading') return 'Posting inline PR comment...'
    return 'Ready to post inline or reject with this reason.'
  }

  function filterButton(filter, label) {
    return `<button class="filter-btn${state.filter === filter ? ' active' : ''}" type="button" data-filter="${escapeAttribute(filter)}">${escapeHtml(label)}</button>`
  }

  function renderSnapshotList() {
    const visible = filteredItems()
    if (visible.length === 0) return '<div class="empty-list">No snapshots match the current filters.</div>'
    return visible.map((item) => {
      const reviewState = state.reviews[item.id] || ''
      const source = compactSource(item.review?.sourceFile || itemSubtitle(item))
      return `
        <button class="snapshot-button${item.id === state.activeId ? ' active' : ''}" type="button" data-id="${escapeAttribute(item.id)}" title="${escapeAttribute(item.raw)}">
          <span class="status-dot ${escapeAttribute(item.variant)}"></span>
          <span>
            <span class="snapshot-name">${escapeHtml(itemTitle(item))}</span>
            <span class="snapshot-sub">${escapeHtml(source)}</span>
            <span class="snapshot-meta">
              <span>${escapeHtml(statusLabel(item.variant))}</span>
              <span>${escapeHtml(item.group)}</span>
            </span>
          </span>
          <span class="review-state ${escapeAttribute(reviewState)}">${escapeHtml(reviewState || 'open')}</span>
        </button>
      `
    }).join('')
  }

  function compactSource(value) {
    const text = String(value || '').split(' > ').pop() || ''
    const parts = text.split('/').filter(Boolean)
    return parts.length > 2 ? parts.slice(-2).join('/') : (text || value)
  }

  function renderSyncPanel(currentCounts = counts()) {
    const tokenLabel = state.githubUser ? `Signed in @${state.githubUser}` : (state.githubToken ? 'Token entered' : 'Token optional')
    const open = currentCounts.reviewable - currentCounts.reviewed
    const approved = currentCounts.reviewed - currentCounts.rejected
    const readiness = currentCounts.rejected > 0
      ? {
          label: 'Changes requested',
          text: 'Rejected items keep the visual approval check blocked until the UI is fixed and this surface is reviewed again.',
          tone: 'blocked',
        }
      : open > 0
        ? {
            label: 'Review in progress',
            text: 'Finish every open item before publishing final approval for this surface.',
            tone: 'open',
          }
        : {
            label: 'Ready to publish',
            text: 'Publish this surface state to update the managed PR comment and visual-review-approval status.',
            tone: 'ready',
          }
    return `
      <article class="sync-panel ${escapeAttribute(state.syncState)}">
        <div class="submission-overview">
          <div class="sync-main">
            <div>
              <span class="sync-kicker">Final review submission</span>
              <strong>Publish surface decisions to the PR</strong>
              <p class="sync-description">Approve and reject decisions stay in this browser until this footer writes the shared review state back to GitHub.</p>
            </div>
            <span class="sync-badge">${escapeHtml(tokenLabel)}</span>
          </div>
          <div class="submission-readiness ${escapeAttribute(readiness.tone)}">
            <span>Submission state</span>
            <strong>${escapeHtml(readiness.label)}</strong>
            <p>${escapeHtml(readiness.text)}</p>
            <div class="submission-metrics" aria-label="Current surface submission progress">
              <div><span>Open</span><strong>${escapeHtml(String(open))}</strong></div>
              <div><span>Approved</span><strong>${escapeHtml(String(approved))}</strong></div>
              <div><span>Rejected</span><strong>${escapeHtml(String(currentCounts.rejected))}</strong></div>
            </div>
          </div>
        </div>
        <ol class="sync-steps" aria-label="Shared review workflow">
          <li>
            <span>1</span>
            <p><strong>Finish the queue</strong> until Open is 0. A rejection is a changes-requested outcome.</p>
          </li>
          <li>
            <span>2</span>
            <p><strong>Load PR state</strong> first so publishing preserves teammate decisions from the other visual surface.</p>
          </li>
          <li>
            <span>3</span>
            <p><strong>Publish to PR</strong> updates the managed review comment and the visual-review-approval status.</p>
          </li>
        </ol>
        <div class="sync-submit-column">
          <div class="sync-status-line">
            <span>GitHub state</span>
            <strong>${escapeHtml(state.syncMessage)}</strong>
          </div>
          <label class="token-field">
            <span>GitHub token</span>
            <input class="token-input" type="password" autocomplete="off" spellcheck="false" placeholder="Paste token after creating it on GitHub" value="${escapeAttribute(state.githubToken)}" data-action="github-token" />
            <small>Stored only in this tab's sessionStorage. Never included in PR comments.</small>
          </label>
          <div class="sync-action-group" aria-label="Token actions">
            <button class="btn" type="button" data-action="open-token-help">Create token</button>
            <button class="btn" type="button" data-action="save-token">Use token</button>
            <button class="btn" type="button" data-action="forget-token">Forget</button>
          </div>
          <div class="sync-action-group sync-action-group-final" aria-label="Final submission actions">
            <button class="btn" type="button" data-action="load-pr-state">Load PR state</button>
            <button class="btn primary" type="button" data-action="publish-pr-state">Publish to PR</button>
          </div>
        </div>
      </article>
    `
  }

  function renderTokenHelpModal() {
    const tokenCreationUrl = githubTokenCreationUrl()
    return `
      <div class="modal-backdrop" data-action="close-token-help" aria-hidden="true"></div>
      <section class="token-help-modal" role="dialog" aria-modal="true" aria-labelledby="token-help-title">
        <div class="token-help-card">
          <header class="token-help-header">
            <div>
              <p class="token-help-kicker">GitHub token</p>
              <h2 id="token-help-title">Create a GitHub token</h2>
            </div>
            <button class="btn" type="button" data-action="close-token-help" aria-label="Close token instructions">Close</button>
          </header>
          <p class="token-help-intro">
            Use a fine-grained personal access token when GitHub asks for authentication. The token lets this browser post inline PR review comments, publish the shared PR visual review comment, and update the visual approval status.
          </p>
          <p class="token-help-direct">
            <a href="${escapeAttribute(tokenCreationUrl)}" target="_blank" rel="noopener noreferrer" data-token-create-link>Open the prefilled GitHub token page</a>
          </p>
          <ol class="token-help-steps">
            <li>Open the prefilled GitHub token page, then confirm the generated fine-grained token settings.</li>
            <li>Name the token for this review workflow and choose a short expiration.</li>
            <li>Set Resource owner to the owner of ${escapeHtml(context.repository)}.</li>
            <li>Choose Only select repositories, then select ${escapeHtml(context.repository)}.</li>
            <li>Under Repository permissions, set Issues, Pull requests, and Commit statuses to Read and write. Metadata stays Read-only automatically.</li>
            <li>Generate the token, copy it once, paste it into the GitHub token field here, then select Use token.</li>
          </ol>
          <div class="token-help-permissions" aria-label="Required token permissions">
            <div>
              <span>Repository</span>
              <strong>${escapeHtml(context.repository)}</strong>
            </div>
            <div>
              <span>Issues</span>
              <strong>Read and write</strong>
            </div>
            <div>
              <span>Pull requests</span>
              <strong>Read and write</strong>
            </div>
            <div>
              <span>Commit statuses</span>
              <strong>Read and write</strong>
            </div>
          </div>
          <p class="token-help-note">
            Tokens are stored only in this tab's sessionStorage and are never included in PR comments. If organization approval is pending or you do not want to use a token, decisions and comments stay local until another reviewer publishes the shared PR state.
          </p>
          <div class="token-help-actions">
            <a class="btn primary" href="${escapeAttribute(tokenCreationUrl)}" target="_blank" rel="noopener noreferrer" data-token-create-link>Open GitHub token page</a>
            <a class="btn" href="${escapeAttribute(githubTokenDocsUrl)}" target="_blank" rel="noopener noreferrer">Open GitHub docs</a>
            <button class="btn" type="button" data-action="close-token-help">Done</button>
          </div>
        </div>
      </section>
    `
  }

  function renderViewer(item) {
    const canCompare = item.variant === 'changed'
    const allowedModes = canCompare ? ['side-by-side', 'diff', 'overlay', 'blink'] : ['single']
    if (!allowedModes.includes(state.mode)) state.mode = allowedModes[0]
    return `
      <article class="viewer-card">
        <div class="viewer-toolbar">
          <div class="snapshot-heading">
            <h2>${escapeHtml(itemTitle(item))}</h2>
            <p>${escapeHtml(statusLabel(item.variant))} · ${escapeHtml(itemSubtitle(item))}</p>
          </div>
          <div class="toolbar-controls">
            ${canCompare ? `
              <div class="segmented" role="group" aria-label="Diff mode">
                ${modeButton('side-by-side', 'Side by side')}
                ${modeButton('diff', 'Highlighter')}
                ${modeButton('overlay', 'Overlay')}
                ${modeButton('blink', 'Blink')}
              </div>
            ` : ''}
            ${heatMapControls(item)}
            <label class="range-row">Zoom <input type="range" min="50" max="200" step="1" value="${state.zoom}" data-action="zoom" /> <span data-zoom-value>${state.zoom}%</span></label>
          </div>
        </div>
        <div class="stage">
          <div class="stage-inner" data-stage-inner>
            ${renderImageMode(item)}
          </div>
        </div>
      </article>
    `
  }

  function modeButton(mode, label) {
    return `<button type="button" class="${state.mode === mode ? 'active' : ''}" data-mode="${escapeAttribute(mode)}">${escapeHtml(label)}</button>`
  }

  function heatMapControls(item) {
    const enabled = canHeatMap(item)
    const active = enabled && heatMapEnabled(item)
    const status = heatMapStatusLabel(item)
    return `
      <div class="heatmap-controls ${active ? 'active' : ''}" data-heat-map-controls>
        <button
          class="btn heatmap-toggle ${active ? 'active' : ''}"
          type="button"
          data-action="toggle-heat-map"
          aria-label="Heat map"
          aria-pressed="${active ? 'true' : 'false'}"
          ${enabled ? '' : 'disabled'}
          title="${escapeAttribute(enabled ? 'Overlay changed pixels on the current screenshot' : 'Heat map needs baseline and current screenshots')}"
        >
          <span>Heat map</span>
          <span class="heatmap-status" data-heat-map-status aria-hidden="true">${escapeHtml(status)}</span>
        </button>
        <label class="range-row heatmap-intensity ${enabled ? '' : 'disabled'}" data-heat-map-intensity-row>
          Intensity
          <input
            type="range"
            min="${heatMapIntensityMin}"
            max="${heatMapIntensityMax}"
            step="5"
            value="${state.heatMapIntensity}"
            data-action="heat-map-intensity"
            aria-label="Heat map intensity"
            ${enabled ? '' : 'disabled'}
          />
          <span data-heat-map-intensity-value>${state.heatMapIntensity}%</span>
        </label>
      </div>
    `
  }

  function renderImageMode(item) {
    if (item.variant === 'new' || item.variant === 'passed') {
      return renderCurrentImage(item, `Current screenshot for ${item.raw}`, 'solo-image')
    }
    if (item.variant === 'deleted') {
      return `<img class="solo-image" src="${escapeAttribute(baselineImageHref(item) || item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />`
    }
    if (state.mode === 'diff') {
      if (heatMapEnabled(item)) {
        return renderCurrentImage(item, `Current screenshot with heat map for ${item.raw}`, 'solo-image')
      }
      return `<img class="solo-image" src="${escapeAttribute(item.diff)}" alt="Diff highlighter for ${escapeAttribute(item.raw)}" />`
    }
    if (state.mode === 'overlay') {
      return `
        <div class="image-grid">
          <label class="range-row">Reveal current <input type="range" min="0" max="100" value="${state.overlay}" data-action="overlay" /> <span data-overlay-value>${state.overlay}%</span></label>
          <div class="overlay-frame">
            <img src="${escapeAttribute(baselineImageHref(item))}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
            <div class="overlay-top" data-overlay-top style="width: ${state.overlay}%">
              ${renderCurrentImage(item, `Current screenshot for ${item.raw}`)}
            </div>
          </div>
        </div>
      `
    }
    if (state.mode === 'blink') {
      return `
        <div class="overlay-frame blink-frame">
          <img src="${escapeAttribute(baselineImageHref(item))}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
          ${renderCurrentImage(item, `Current screenshot for ${item.raw}`)}
        </div>
      `
    }
    return `
      <div class="image-grid two-up">
        <div class="image-panel">
          <h3>Baseline · ${escapeHtml(context.baseRef)}</h3>
          <img src="${escapeAttribute(baselineImageHref(item))}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
        </div>
        <div class="image-panel">
          <h3>Current · ${escapeHtml(context.headRef)}</h3>
          ${renderCurrentImage(item, `Current screenshot for ${item.raw}`)}
        </div>
      </div>
    `
  }

  function renderCurrentImage(item, alt, className = '') {
    const image = `<img class="${escapeAttribute(className)}" src="${escapeAttribute(item.actual)}" alt="${escapeAttribute(alt)}" />`
    if (!canHeatMap(item)) return image

    const heatMapActive = heatMapEnabled(item)
    return `
      <div
        class="heatmap-frame ${className ? escapeAttribute(className) : ''}"
        data-heat-map-frame
        data-heat-map-active="${heatMapActive ? 'true' : 'false'}"
        data-heat-map-state="${heatMapActive ? 'idle' : 'off'}"
        style="--heat-map-opacity: ${escapeAttribute(heatMapOpacity())}"
      >
        <img src="${escapeAttribute(item.actual)}" alt="${escapeAttribute(alt)}" />
        <canvas
          class="heatmap-canvas"
          data-heat-map-canvas
          data-baseline-src="${escapeAttribute(baselineImageHref(item))}"
          data-current-src="${escapeAttribute(item.actual)}"
          data-threshold="${DEFAULT_HEAT_MAP_THRESHOLD}"
          aria-hidden="true"
          ${heatMapActive ? '' : 'hidden'}
        ></canvas>
      </div>
    `
  }

  function baselineImageHref(item) {
    const href = item?.baselineReference?.imageHref || (item?.variant === 'changed' || item?.variant === 'deleted' ? item.expected : '')
    return localReportAssetHref(href)
  }

  function localReportAssetHref(href) {
    const value = stringOr(href)
    if (!value) return ''
    try {
      const target = new URL(value, window.location.href)
      if (target.origin === window.location.origin || !context.baseUrl) return target.href
      const base = new URL(context.baseUrl, window.location.href)
      if (target.origin !== base.origin) return target.href
      const basePath = base.pathname.replace(/\/+$/, '')
      const localPath = basePath
        ? (target.pathname.startsWith(`${basePath}/`) ? target.pathname.slice(basePath.length) : '')
        : target.pathname
      if (!localPath.startsWith('/')) return target.href

      // Local Playwright runs often mirror the GitHub Pages tree at localhost.
      return `${window.location.origin}${localPath}${target.search}${target.hash}`
    } catch {
      return value
    }
  }

  function canHeatMap(item) {
    return Boolean(
      item &&
      item.variant !== 'deleted' &&
      item.variant !== 'passed' &&
      item.actual &&
      baselineImageHref(item)
    )
  }

  function heatMapEnabled(item) {
    return canHeatMap(item) && state.heatMaps[item.id] === true
  }

  function heatMapStatusLabel(item) {
    if (!canHeatMap(item)) return 'N/A'
    return heatMapEnabled(item) ? 'On' : 'Off'
  }

  function heatMapOpacity() {
    return String(clamp(Number(state.heatMapIntensity), heatMapIntensityMin, heatMapIntensityMax) / 100)
  }

  function renderContext(item) {
    return `
      <article class="context-card">
        <p class="keyboard-help">
          Keyboard: <kbd>Down</kbd>/<kbd>Up</kbd> navigate, <kbd>Y</kbd> approve, <kbd>N</kbd> reject, <kbd>/</kbd> search, <kbd>D</kbd> highlighter, <kbd>S</kbd> side by side, <kbd>O</kbd> overlay, <kbd>B</kbd> blink, <kbd>T</kbd> theme.
        </p>
      </article>
    `
  }

  function bindEvents() {
    root.querySelectorAll('[data-id]').forEach((button) => {
      button.addEventListener('click', () => setActive(button.dataset.id))
    })
    root.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter
        selectFirstVisibleIfHidden()
        render()
      })
    })
    root.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode
        persistViewState()
        render()
      })
    })
    root.querySelectorAll('[data-review]').forEach((button) => {
      button.addEventListener('click', () => reviewActive(button.dataset.review))
    })
    root.querySelector('[data-action="search"]')?.addEventListener('input', (event) => {
      state.query = event.target.value
      selectFirstVisibleIfHidden()
      render()
      root.querySelector('[data-action="search"]')?.focus()
    })
    root.querySelector('[data-action="group"]')?.addEventListener('change', (event) => {
      state.group = event.target.value
      selectFirstVisibleIfHidden()
      render()
    })
    root.querySelector('[data-action="zoom"]')?.addEventListener('input', (event) => {
      state.zoom = clamp(Number(event.target.value), 50, 200)
      event.target.value = String(state.zoom)
      persistViewState()
      applyZoomState()
    })
    bindOverlayControl()
    root.querySelector('[data-action="toggle-heat-map"]')?.addEventListener('click', toggleHeatMap)
    root.querySelector('[data-action="heat-map-intensity"]')?.addEventListener('input', updateHeatMapIntensity)
    root.querySelector('[data-action="review-comment"]')?.addEventListener('input', updateReviewComment)
    root.querySelector('[data-action="post-inline-comment"]')?.addEventListener('click', postInlineReviewComment)
    root.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', toggleVisualReviewTheme)
    root.querySelector('[data-action="open-token-help"]')?.addEventListener('click', openTokenHelp)
    root.querySelectorAll('[data-action="close-token-help"]').forEach((button) => {
      button.addEventListener('click', closeTokenHelp)
    })
    root.querySelector('[data-action="github-token"]')?.addEventListener('input', (event) => {
      state.githubToken = event.target.value
    })
    root.querySelector('[data-action="save-token"]')?.addEventListener('click', saveGithubToken)
    root.querySelector('[data-action="load-pr-state"]')?.addEventListener('click', () => loadRemoteReviewState())
    root.querySelector('[data-action="publish-pr-state"]')?.addEventListener('click', publishRemoteReviewState)
    root.querySelector('[data-action="forget-token"]')?.addEventListener('click', forgetGithubToken)
  }

  function bindOverlayControl() {
    root.querySelector('[data-action="overlay"]')?.addEventListener('input', (event) => {
      state.overlay = clamp(Number(event.target.value), 0, 100)
      event.target.value = String(state.overlay)
      persistViewState()
      applyOverlayState()
    })
  }

  function applyZoomState() {
    const stageInner = root.querySelector('[data-stage-inner]')
    const zoomValue = root.querySelector('[data-zoom-value]')
    if (stageInner) stageInner.style.zoom = String(state.zoom / 100)
    if (zoomValue) zoomValue.textContent = `${state.zoom}%`
  }

  function applyOverlayState() {
    const overlayTop = root.querySelector('[data-overlay-top]')
    const overlayValue = root.querySelector('[data-overlay-value]')
    if (overlayTop) overlayTop.style.width = `${state.overlay}%`
    if (overlayValue) overlayValue.textContent = `${state.overlay}%`
  }

  function applyHeatMapControlState(item = activeItem()) {
    const enabled = canHeatMap(item)
    const active = heatMapEnabled(item)
    const status = heatMapStatusLabel(item)
    const controls = root.querySelector('[data-heat-map-controls]')
    const toggle = root.querySelector('[data-action="toggle-heat-map"]')
    const statusLabel = root.querySelector('[data-heat-map-status]')
    const intensity = root.querySelector('[data-action="heat-map-intensity"]')
    const intensityRow = root.querySelector('[data-heat-map-intensity-row]')
    const intensityValue = root.querySelector('[data-heat-map-intensity-value]')

    controls?.classList.toggle('active', active)
    if (toggle) {
      toggle.classList.toggle('active', active)
      toggle.disabled = !enabled
      toggle.setAttribute('aria-pressed', active ? 'true' : 'false')
      toggle.title = enabled
        ? 'Overlay changed pixels on the current screenshot'
        : 'Heat map needs baseline and current screenshots'
    }
    if (statusLabel) statusLabel.textContent = status
    if (intensity) {
      intensity.disabled = !enabled
      intensity.value = String(state.heatMapIntensity)
    }
    intensityRow?.classList.toggle('disabled', !enabled)
    if (intensityValue) intensityValue.textContent = `${state.heatMapIntensity}%`
    root.querySelectorAll('[data-heat-map-frame]').forEach((frame) => {
      frame.style.setProperty('--heat-map-opacity', heatMapOpacity())
    })
  }

  function updateHeatMapIntensity(event) {
    state.heatMapIntensity = clamp(Number(event.target.value), heatMapIntensityMin, heatMapIntensityMax)
    event.target.value = String(state.heatMapIntensity)
    persistViewState()
    applyHeatMapControlState(activeItem())
  }

  function toggleHeatMap() {
    const current = activeItem()
    if (!canHeatMap(current)) return
    const scroll = readStageScroll()
    pendingStageScroll = scroll
    state.heatMaps[current.id] = !state.heatMaps[current.id]
    saveHeatMaps()
    if (state.mode === 'diff' || !syncHeatMapFrames(current)) {
      renderStageContent(current, scroll)
      clearPendingStageScrollAfter(scroll)
      return
    }
    applyHeatMapControlState(current)
    restoreStageScroll(scroll)
    clearPendingStageScrollAfter(scroll)
  }

  function syncHeatMapFrames(item) {
    const frames = Array.from(root.querySelectorAll('[data-heat-map-frame]'))
    if (frames.length === 0) return false
    const active = heatMapEnabled(item)
    frames.forEach((frame) => {
      const canvas = frame.querySelector('[data-heat-map-canvas]')
      frame.dataset.heatMapActive = active ? 'true' : 'false'
      frame.style.setProperty('--heat-map-opacity', heatMapOpacity())
      if (!canvas) return
      canvas.hidden = !active
      frame.setAttribute('data-heat-map-state', active ? 'idle' : 'off')
    })
    if (active) renderHeatMaps()
    return true
  }

  function renderStageContent(item, scroll = readStageScroll()) {
    const stageInner = root.querySelector('[data-stage-inner]')
    if (!stageInner) {
      render()
      restoreStageScroll(scroll)
      return
    }

    stageInner.innerHTML = renderImageMode(item)
    bindOverlayControl()
    applyZoomState()
    applyOverlayState()
    applyHeatMapControlState(item)
    renderHeatMaps()
    restoreStageScroll(scroll)
  }

  function clearPendingStageScrollAfter(scroll) {
    window.setTimeout?.(() => {
      if (pendingStageScroll === scroll) pendingStageScroll = null
    }, 1000)
  }

  function readStageScroll() {
    const stage = root.querySelector('.stage')
    return stage ? { left: stage.scrollLeft, top: stage.scrollTop } : null
  }

  function restoreStageScroll(scroll) {
    if (!scroll) return
    const restore = () => {
      const stage = root.querySelector('.stage')
      if (!stage) return
      stage.scrollLeft = scroll.left
      stage.scrollTop = scroll.top
    }
    restore()
    root.querySelectorAll('[data-stage-inner] img').forEach((image) => {
      if (image.complete) {
        restore()
      } else {
        image.addEventListener('load', restore, { once: true })
      }
    })
    window.requestAnimationFrame?.(restore)
    window.setTimeout?.(restore, 0)
    window.setTimeout?.(restore, 50)
    window.setTimeout?.(restore, 150)
    window.setTimeout?.(restore, 300)
  }

  function renderHeatMaps() {
    root.querySelectorAll('[data-heat-map-canvas]:not([hidden])').forEach((canvas) => {
      drawHeatMapCanvas(canvas)
    })
  }

  async function drawHeatMapCanvas(canvas) {
    const frame = canvas.closest('[data-heat-map-frame]')
    frame?.setAttribute('data-heat-map-state', 'loading')
    try {
      const [baseline, current] = await Promise.all([
        loadImage(canvas.dataset.baselineSrc),
        loadImage(canvas.dataset.currentSrc),
      ])
      if (!canvas.isConnected) return
      if (
        !baseline.naturalWidth ||
        !current.naturalWidth ||
        baseline.naturalWidth !== current.naturalWidth ||
        baseline.naturalHeight !== current.naturalHeight
      ) {
        frame?.setAttribute('data-heat-map-state', 'mismatch')
        return
      }

      const width = current.naturalWidth
      const height = current.naturalHeight
      const baselineCanvas = workCanvas(width, height)
      const currentCanvas = workCanvas(width, height)
      const heatMapContext = canvas.getContext('2d')
      const baselineContext = baselineCanvas.getContext('2d')
      const currentContext = currentCanvas.getContext('2d')
      if (!heatMapContext || !baselineContext || !currentContext) return

      baselineContext.drawImage(baseline, 0, 0, width, height)
      currentContext.drawImage(current, 0, 0, width, height)
      const baselineData = baselineContext.getImageData(0, 0, width, height)
      const currentData = currentContext.getImageData(0, 0, width, height)
      const heatMapData = heatMapContext.createImageData(width, height)
      const summary = writeHeatMapPixels({
        baseline: baselineData.data,
        current: currentData.data,
        output: heatMapData.data,
        threshold: Number(canvas.dataset.threshold || DEFAULT_HEAT_MAP_THRESHOLD),
      })

      canvas.width = width
      canvas.height = height
      heatMapContext.putImageData(heatMapData, 0, 0)
      restoreStageScroll(pendingStageScroll)
      frame?.setAttribute('data-heat-map-state', summary.changedPixels > 0 ? 'ready' : 'empty')
    } catch {
      frame?.setAttribute('data-heat-map-state', 'error')
    }
  }

  function workCanvas(width, height) {
    if (typeof window.OffscreenCanvas === 'function') {
      return new window.OffscreenCanvas(width, height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      try {
        const url = new URL(src, window.location.href)
        if (url.origin !== window.location.origin) image.crossOrigin = 'anonymous'
      } catch {
        // Keep browser-default loading for relative paths that URL cannot parse.
      }
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Unable to load heat map image: ${src}`))
      image.src = src
    })
  }

  function updateReviewComment(event) {
    const current = activeItem()
    if (!current) return
    const value = event.target.value
    if (value) {
      state.reviewComments[current.id] = value
    } else {
      delete state.reviewComments[current.id]
    }
    state.inlineCommentMessage = ''
    state.inlineCommentState = 'idle'
    saveReviewComments()
    syncCommentControls()
  }

  function syncCommentControls() {
    const current = activeItem()
    if (!current) return
    const comment = reviewCommentFor(current)
    const target = inlineCommentTarget(current)
    const reject = root.querySelector('[data-review="rejected"]')
    const post = root.querySelector('[data-action="post-inline-comment"]')
    const status = root.querySelector('[data-comment-status]')
    const decisionHelper = root.querySelector('[data-decision-helper]')
    if (reject) reject.disabled = !comment.trim()
    if (post) post.disabled = !canPostInlineComment(current, comment)
    if (status) {
      status.textContent = commentStatusMessage(current, target, comment)
      status.className = `comment-status ${state.inlineCommentState}`
    }
    if (decisionHelper) {
      decisionHelper.textContent = comment.trim()
        ? 'Reject will save this comment with the visual review state.'
        : 'Write a comment in step 3 to enable Reject.'
    }
  }

  function setActive(id) {
    state.activeId = id
    state.inlineCommentMessage = ''
    state.inlineCommentState = 'idle'
    const url = new URL(window.location.href)
    url.searchParams.set('id', id)
    history.replaceState(null, '', url)
    render()
  }

  function selectFirstVisibleIfHidden() {
    const visible = filteredItems()
    if (visible.length && !visible.some((item) => item.id === state.activeId)) {
      state.activeId = visible[0].id
    }
  }

  function navigate(direction) {
    const visible = filteredItems()
    if (!visible.length) return
    const currentIndex = Math.max(0, visible.findIndex((item) => item.id === state.activeId))
    const nextIndex = (currentIndex + direction + visible.length) % visible.length
    setActive(visible[nextIndex].id)
  }

  function reviewActive(reviewState) {
    const current = activeItem()
    if (!current || !reviewableVariants.has(current.variant)) return
    if (reviewState === 'rejected' && !reviewCommentFor(current).trim()) {
      setInlineCommentState('error', 'Write a review comment before rejecting this snapshot.')
      root.querySelector('[data-action="review-comment"]')?.focus()
      return
    }
    state.reviews[current.id] = reviewState
    saveReviews()
    saveReviewComments()
    state.inlineCommentMessage = ''
    state.inlineCommentState = 'idle'
    navigate(1)
  }

  async function postInlineReviewComment() {
    const current = activeItem()
    if (!current) return
    const comment = reviewCommentFor(current).trim()
    const target = inlineCommentTarget(current)
    if (!comment) {
      setInlineCommentState('error', 'Write a review comment before posting to GitHub.')
      root.querySelector('[data-action="review-comment"]')?.focus()
      return
    }
    if (!target) {
      setInlineCommentState('error', 'No source file metadata is available for an inline PR comment.')
      return
    }
    if (!state.githubToken.trim()) {
      setInlineCommentState('error', 'GitHub token required to post an inline PR comment.')
      return
    }

    setInlineCommentState('loading', 'Posting inline PR comment...')
    try {
      await loadGithubUser()
      const response = await githubRequest(`/repos/${context.repository}/pulls/${context.prNumber}/comments`, {
        body: {
          body: inlineReviewCommentBody(current, comment, target),
          commit_id: context.headSha,
          path: target.path,
          subject_type: 'file',
        },
        method: 'POST',
        requireToken: true,
      })
      setInlineCommentState(
        'ready',
        response?.html_url ? 'Inline PR comment posted.' : 'Inline PR comment posted to the selected source file.'
      )
    } catch (error) {
      setInlineCommentState('error', error.message)
    }
  }

  function inlineReviewCommentBody(item, comment, target) {
    return [
      comment,
      '',
      '---',
      `Visual review page: [${itemTitle(item)}](${reviewPageHref(item)})`,
      `Related source file: [${sourceLabel(target)}](${sourceFileHref(target)})`,
      `Snapshot artifact: \`${item.raw}\``,
      `Surface: ${context.surfaceLabel}`,
      `Head: \`${String(context.headSha || '').slice(0, 7)}\``,
    ].join('\n')
  }

  function setInlineCommentState(inlineCommentState, message) {
    state.inlineCommentState = inlineCommentState
    state.inlineCommentMessage = message
    render()
  }

  function openTokenHelp() {
    state.tokenHelpOpen = true
    render()
    root.querySelector('[data-action="close-token-help"]')?.focus()
  }

  function closeTokenHelp() {
    state.tokenHelpOpen = false
    render()
    root.querySelector('[data-action="open-token-help"]')?.focus()
  }

  function handleKeys(event) {
    if (state.tokenHelpOpen && event.key === 'Escape') {
      event.preventDefault()
      closeTokenHelp()
      return
    }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      navigate(1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      navigate(-1)
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      reviewActive('approved')
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault()
      reviewActive('rejected')
    } else if (event.key === '/') {
      event.preventDefault()
      root.querySelector('[data-action="search"]')?.focus()
    } else if (event.key.toLowerCase() === 'd') {
      setMode('diff')
    } else if (event.key.toLowerCase() === 's') {
      setMode('side-by-side')
    } else if (event.key.toLowerCase() === 'o') {
      setMode('overlay')
    } else if (event.key.toLowerCase() === 'b') {
      setMode('blink')
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault()
      toggleVisualReviewTheme()
    }
  }

  function setMode(mode) {
    state.mode = mode
    persistViewState()
    render()
  }

  function currentSurfaceReviewState() {
    return buildSurfaceReviewState({
      context: {
        ...context,
        reportHref: `${window.location.origin}${window.location.pathname}`,
      },
      comments: state.reviewComments,
      items,
      reviewer: state.githubUser,
      reviews: state.reviews,
    })
  }

  function currentReviewState() {
    return mergeSurfaceReviewState(state.remoteState, currentSurfaceReviewState())
  }

  function acceptedReviewHeadShas() {
    return [
      context.headSha,
      context.sourcePullRequest?.headSha,
      context.sourcePullRequest?.mergeCommitSha,
    ].filter(Boolean)
  }

  function reviewStateMatchesCurrentReport(surface) {
    if (!surface.headSha) return true
    const accepted = acceptedReviewHeadShas()
    return accepted.length === 0 || accepted.includes(surface.headSha)
  }

  function acceptedReviewHeadLabel() {
    const accepted = acceptedReviewHeadShas().map(shortSha)
    return accepted.length > 0 ? accepted.join(' or ') : 'current report'
  }

  function applyRemoteReviewState(remoteState, sourceLabel) {
    const surface = remoteState?.surfaces?.[context.surface]
    if (!surface) {
      setSyncState('ready', `${sourceLabel}: no ${context.surface} state yet.`)
      return
    }
    if (!reviewStateMatchesCurrentReport(surface)) {
      setSyncState(
        'ready',
        `${sourceLabel}: ${context.surface} state is for ${shortSha(surface.headSha)}, not current head ${acceptedReviewHeadLabel()}.`
      )
      return
    }

    const importedCount = replaceLocalSurfaceDecisions(surface)
    saveReviews()
    saveReviewComments()
    setSyncState('ready', `${sourceLabel}: loaded ${importedCount} decision(s).`)
  }

  function replaceLocalSurfaceDecisions(surface) {
    const reviewableIds = new Set(items
      .filter((item) => reviewableVariants.has(item.variant))
      .map((item) => item.id))
    for (const itemId of reviewableIds) {
      delete state.reviews[itemId]
      delete state.reviewComments[itemId]
    }

    let importedCount = 0
    for (const [itemId, decision] of Object.entries(surface.decisions || {})) {
      if (!reviewableIds.has(itemId)) continue
      if (decision?.decision === 'approved' || decision?.decision === 'rejected') {
        state.reviews[itemId] = decision.decision
        if (typeof decision.comment === 'string' && decision.comment.trim()) {
          state.reviewComments[itemId] = decision.comment
        }
        importedCount += 1
      }
    }
    return importedCount
  }

  async function loadRemoteReviewState(options = {}) {
    if (!hasReviewStateTarget()) {
      setSyncState('ready', 'No linked PR review state is available for this report.')
      return
    }
    if (!options.silent) setSyncState('loading', 'Loading PR state...')
    try {
      const comments = await githubRequest(`/repos/${context.repository}/issues/${context.prNumber}/comments?per_page=100&sort=updated&direction=desc`, {
        allowUnauthenticated: true,
      })
      const comment = findReviewComment(comments)
      if (!comment) {
        state.remoteAuthor = ''
        state.remoteCommentId = null
        state.remoteState = null
        setSyncState('ready', 'No shared PR state yet.')
        return
      }

      const parsed = parseReviewCommentBody(comment.body)
      state.remoteAuthor = comment.user?.login || ''
      state.remoteCommentId = comment.id
      state.remoteState = parsed
      applyRemoteReviewState(parsed, state.remoteAuthor ? `@${state.remoteAuthor}` : 'PR state')
    } catch (error) {
      const hint = state.githubToken
        ? error.message
        : 'Add a GitHub token to load private PR state.'
      setSyncState('error', hint)
    }
  }

  async function publishRemoteReviewState() {
    if (!hasReviewStateTarget()) {
      setSyncState('error', 'No linked PR is available for publishing review state.')
      return
    }
    if (!state.githubToken.trim()) {
      setSyncState('error', 'GitHub token required to publish PR state.')
      return
    }

    setSyncState('loading', 'Publishing PR state...')
    try {
      await loadGithubUser()
      const merged = currentReviewState()
      const body = renderReviewComment(merged)
      const comment = await upsertManagedReviewComment(body)

      state.remoteAuthor = comment.user?.login || state.githubUser
      state.remoteCommentId = comment.id
      state.remoteState = merged
      try {
        const approvalStatus = await publishApprovalStatus(merged)
        const statusMessage = approvalStatus.approved
          ? 'Approval status is green.'
          : 'Approval status is still blocked.'
        setSyncState(
          'ready',
          `Published PR state as ${state.remoteAuthor ? `@${state.remoteAuthor}` : 'GitHub user'}. ${statusMessage}`
        )
      } catch (statusError) {
        setSyncState('error', `Published PR state, but approval status update failed: ${statusError.message}`)
      }
    } catch (error) {
      setSyncState('error', error.message)
    }
  }

  async function upsertManagedReviewComment(body) {
    const canPatchExistingComment = state.remoteCommentId &&
      (!state.remoteAuthor || !state.githubUser || state.remoteAuthor === state.githubUser)

    if (canPatchExistingComment) {
      try {
        return await githubRequest(`/repos/${context.repository}/issues/comments/${state.remoteCommentId}`, {
          body: { body },
          method: 'PATCH',
          requireToken: true,
        })
      } catch (error) {
        if (!isRecoverableManagedCommentPatchError(error)) throw error
      }
    }

    return githubRequest(`/repos/${context.repository}/issues/${context.prNumber}/comments`, {
      body: { body },
      method: 'POST',
      requireToken: true,
    })
  }

  function isRecoverableManagedCommentPatchError(error) {
    return error?.status === 403 || error?.status === 404
  }

  async function publishApprovalStatus(reviewState) {
    const result = validateVisualApproval(reviewState, {
      headSha: context.headSha,
      prNumber: context.prNumber,
      repository: context.repository,
      requiredSurfaces: normalizeRequiredSurfaces(context.requiredVisualSurfaces),
    })

    await githubRequest(`/repos/${context.repository}/statuses/${context.headSha}`, {
      body: {
        context: VISUAL_REVIEW_STATUS_CONTEXT,
        description: truncateStatusDescription(result.summary),
        state: result.approved ? 'success' : 'failure',
        target_url: context.prIndexHref || context.reportHref || window.location.href,
      },
      method: 'POST',
      requireToken: true,
    })

    return result
  }

  function truncateStatusDescription(description) {
    const text = String(description || '').replace(/\s+/g, ' ').trim()
    return text.length <= 140 ? text : `${text.slice(0, 137)}...`
  }

  async function saveGithubToken() {
    state.githubToken = root.querySelector('[data-action="github-token"]')?.value.trim() || ''
    if (!state.githubToken) {
      forgetGithubToken()
      return
    }
    sessionStorage.setItem(githubTokenKey(), state.githubToken)
    setSyncState('loading', 'Checking GitHub token...')
    try {
      await loadGithubUser()
      await loadRemoteReviewState()
    } catch (error) {
      setSyncState('error', error.message)
    }
  }

  async function loadGithubUser() {
    if (!state.githubToken.trim()) return null
    const user = await githubRequest('/user', { requireToken: true })
    state.githubUser = user.login || ''
    sessionStorage.setItem(githubTokenKey(), state.githubToken)
    return user
  }

  function forgetGithubToken() {
    state.githubToken = ''
    state.githubUser = ''
    sessionStorage.removeItem(githubTokenKey())
    setSyncState('ready', 'GitHub token cleared.')
  }

  async function githubRequest(path, options = {}) {
    const headers = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    }
    const token = state.githubToken.trim()
    if (token) headers.authorization = `Bearer ${token}`
    if (options.requireToken && !token) throw new Error('GitHub token required.')
    if (options.body) headers['content-type'] = 'application/json'

    const response = await fetch(`https://api.github.com${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      if (response.status === 404 && options.allowUnauthenticated && !token) {
        throw new Error('Add a GitHub token to load private PR state.')
      }
      let detail = ''
      try {
        detail = (await response.json()).message || ''
      } catch {
        detail = response.statusText
      }
      const error = new Error(githubErrorMessage(response.status, detail, path))
      error.status = response.status
      error.detail = detail
      error.path = path
      throw error
    }

    return response.status === 204 ? null : response.json()
  }

  function githubErrorMessage(status, detail, path) {
    const base = `GitHub API ${status}: ${detail}`
    if (status !== 403) return base

    if (path.includes(`/repos/${context.repository}/statuses/`)) {
      return `${base}. Token needs Commit statuses: Read and write for ${context.repository}, and organization approval if required.`
    }

    if (path.includes(`/repos/${context.repository}/issues/`) || path.includes(`/repos/${context.repository}/pulls/`)) {
      return `${base}. Token needs Issues or Pull requests: Read and write for ${context.repository}, and organization approval if required.`
    }

    return `${base}. Recreate the token from this page and confirm repository access plus organization approval.`
  }

  function setSyncState(syncState, message) {
    state.syncState = syncState
    state.syncMessage = message
    render()
  }

  function statusLabel(variant) {
    return {
      changed: 'Changed',
      deleted: 'Deleted',
      new: 'New',
      passed: 'Unchanged',
    }[variant] || variant
  }

  function clamp(value, min, max) {
    const numeric = Number.isFinite(value) ? value : min
    return Math.min(max, Math.max(min, numeric))
  }

  function shortSha(value) {
    return String(value || '').slice(0, 7) || 'unknown'
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function escapeAttribute(value) {
    return escapeHtml(value)
  }
})()
