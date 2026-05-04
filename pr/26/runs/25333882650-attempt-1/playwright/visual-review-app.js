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

/* global Blob, FileReader, document, window, localStorage, navigator, history, sessionStorage, URLSearchParams */
(() => {
  const dataElement = document.getElementById('visual-review-data')
  const root = document.getElementById('visual-review-root')
  if (!dataElement || !root) return

  const data = JSON.parse(dataElement.textContent)
  const payload = data.payload
  const context = data.context
  const reviewableVariants = new Set(['changed', 'new', 'deleted'])

  const state = {
    activeId: null,
    filter: 'reviewable',
    githubToken: sessionStorage.getItem(githubTokenKey()) || '',
    githubUser: '',
    group: 'all',
    mode: localStorage.getItem(storageKey('mode')) || 'side-by-side',
    overlay: clamp(Number(localStorage.getItem(storageKey('overlay')) || 50), 0, 100),
    query: '',
    remoteAuthor: '',
    remoteCommentId: null,
    remoteState: null,
    reviews: readReviews(),
    syncMessage: 'Loading PR state...',
    syncState: 'loading',
    tokenHelpOpen: false,
    zoom: clamp(Number(localStorage.getItem(storageKey('zoom')) || 100), 50, 200),
  }

  const items = buildItems()
  const groups = Array.from(new Set(items.map((item) => item.group))).sort((a, b) => a.localeCompare(b))
  const initialId = new URLSearchParams(window.location.search).get('id')
  state.activeId = items.some((item) => item.id === initialId)
    ? initialId
    : (items.find((item) => reviewableVariants.has(item.variant)) || items[0])?.id

  render()
  window.addEventListener('keydown', handleKeys)
  loadRemoteReviewState({ silent: true })

  function storageKey(suffix) {
    return `visual-review:${context.prNumber}:${context.surface}:${context.runKey}:${suffix}`
  }

  function githubTokenKey() {
    return `visual-review:${context.repository}:${context.prNumber}:github-token`
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

  function persistViewState() {
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
      review,
      searchText: itemSearchText({ raw, variant, group, review }),
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
            <div>
              <nav class="crumbs" aria-label="Breadcrumb">
                <a href="${escapeAttribute(context.prIndexHref)}">PR #${escapeHtml(context.prNumber)}</a>
                <span>/</span>
                <span>${escapeHtml(context.surfaceLabel)}</span>
                <span>/</span>
                <span>Run ${escapeHtml(context.runId)}</span>
              </nav>
              <div class="title-row">
                <h1>${escapeHtml(context.prTitle)}</h1>
                <span class="pill changed">${currentCounts.reviewable} need review</span>
                <span class="pill approved">${currentCounts.reviewed}/${currentCounts.reviewable} reviewed</span>
                ${currentCounts.rejected ? `<span class="pill rejected">${currentCounts.rejected} rejected</span>` : ''}
              </div>
              <div class="meta-row">
                <span>${escapeHtml(context.headRef)} into ${escapeHtml(context.baseRef)}</span>
                <span>Commit ${escapeHtml(String(context.headSha || '').slice(0, 7))}</span>
                <span>${escapeHtml(context.surfaceLabel)}</span>
              </div>
            </div>
            <div class="actions">
              <button class="btn" type="button" data-action="copy-summary">Copy summary</button>
              <button class="btn" type="button" data-action="copy-pr-comment">Copy PR comment</button>
              <button class="btn" type="button" data-action="download-json">Download JSON</button>
              <label class="btn file-btn">Import JSON<input class="file-hidden" type="file" accept="application/json" data-action="import-json" /></label>
              <a class="btn" href="${escapeAttribute(context.regVizHref)}">Open reg-viz</a>
              <a class="btn" href="${escapeAttribute(context.runUrl)}">Workflow run</a>
              <a class="btn primary" href="${escapeAttribute(context.prUrl)}">Open PR</a>
            </div>
          </div>
        </header>
        <main class="layout">
          <aside class="sidebar" aria-label="Snapshot queue">
            <div class="sidebar-header">
              <div class="progress-line">
                <strong>Review queue</strong>
                <span>${progress}% complete</span>
              </div>
              <div class="progress-track" aria-hidden="true"><div class="progress-bar" style="width: ${progress}%"></div></div>
              <div class="filters" role="group" aria-label="Filters">
                ${filterButton('reviewable', `Review ${currentCounts.reviewable}`)}
                ${filterButton('unreviewed', 'Open')}
                ${filterButton('changed', `Changed ${currentCounts.changed}`)}
                ${filterButton('all', `All ${items.length}`)}
              </div>
              <input class="search" type="search" value="${escapeAttribute(state.query)}" placeholder="Search snapshots" aria-label="Search snapshots" data-action="search" />
              <select class="group-select" aria-label="Filter by group" data-action="group">
                <option value="all">All groups</option>
                ${groups.map((group) => `<option value="${escapeAttribute(group)}"${group === state.group ? ' selected' : ''}>${escapeHtml(group)}</option>`).join('')}
              </select>
            </div>
            <div class="snapshot-list">
              ${renderSnapshotList()}
            </div>
          </aside>
          <section class="content">
            ${renderReviewGuide(currentCounts)}
            ${renderSyncPanel()}
            ${current ? renderReviewMetadata(current) : ''}
            ${current ? renderViewer(current) : '<article class="viewer-card"><div class="empty-list">No snapshots match the current filters.</div></article>'}
            ${current ? renderContext(current) : ''}
          </section>
        </main>
        ${state.tokenHelpOpen ? renderTokenHelpModal() : ''}
      </div>
    `
    bindEvents()
    applyZoomState()
    applyOverlayState()
  }

  function renderReviewGuide(currentCounts) {
    const open = currentCounts.reviewable - currentCounts.reviewed
    const approved = currentCounts.reviewed - currentCounts.rejected
    const statusTone = currentCounts.rejected > 0
      ? 'rejected'
      : open > 0
        ? 'pending'
        : 'approved'
    const checkpoint = currentCounts.rejected > 0
      ? `${currentCounts.rejected} rejected snapshot${currentCounts.rejected === 1 ? '' : 's'} must be resolved or called out before approval.`
      : open > 0
        ? `${open} snapshot${open === 1 ? '' : 's'} still need a decision on this surface.`
        : 'This surface is locally complete. Publish PR state, then repeat on the other visual surface.'

    return `
      <section class="review-guide" aria-labelledby="review-guide-title">
        <div class="guide-heading">
          <div>
            <p class="guide-kicker">Reviewer guide</p>
            <h2 id="review-guide-title">Review ${escapeHtml(context.surfaceLabel)} in five steps</h2>
          </div>
          <span class="guide-status ${escapeAttribute(statusTone)}">${escapeHtml(checkpoint)}</span>
        </div>
        <ol class="guide-steps">
          ${guideStep('1', 'Start with shared state', 'Use Load PR state first. If GitHub asks for a token, use a fine-grained token with Issues and Commit statuses write access, or import a JSON handoff from another reviewer.')}
          ${guideStep('2', 'Inspect every open snapshot', 'Work from the Open filter until it is empty. For changed screenshots, compare Baseline and Current, then use Highlighter, Overlay, or Blink when the difference is subtle.')}
          ${guideStep('3', 'Apply the decision rule', 'Approve only intentional UI changes. Reject clipped text, missing data, broken spacing, wrong feature-flag state, unexpected new screenshots, or unexpected removals.')}
          ${guideStep('4', 'Leave a durable trail', 'When this surface is complete, publish to the PR. Without a token, download JSON for handoff or copy the generated PR comment and paste it into the pull request.')}
          ${guideStep('5', 'Finish both surfaces', 'Playwright and Storybook must both be approved for the current head commit before visual-review-approval can turn green.')}
        </ol>
        <div class="guide-checkpoints" aria-label="Current review checkpoints">
          ${checkpointItem('Surface', context.surfaceLabel)}
          ${checkpointItem('Approved', String(approved))}
          ${checkpointItem('Open', String(open))}
          ${checkpointItem('Rejected', String(currentCounts.rejected))}
        </div>
      </section>
    `
  }

  function guideStep(number, title, body) {
    return `
      <li>
        <span class="guide-step-number">${escapeHtml(number)}</span>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(body)}</p>
        </div>
      </li>
    `
  }

  function checkpointItem(label, value) {
    return `
      <div data-guide-checkpoint="${escapeAttribute(label.toLowerCase())}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `
  }

  function filterButton(filter, label) {
    return `<button class="filter-btn${state.filter === filter ? ' active' : ''}" type="button" data-filter="${escapeAttribute(filter)}">${escapeHtml(label)}</button>`
  }

  function renderSnapshotList() {
    const visible = filteredItems()
    if (visible.length === 0) return '<div class="empty-list">No snapshots match the current filters.</div>'
    return visible.map((item) => {
      const reviewState = state.reviews[item.id] || ''
      return `
        <button class="snapshot-button${item.id === state.activeId ? ' active' : ''}" type="button" data-id="${escapeAttribute(item.id)}">
          <span class="status-dot ${escapeAttribute(item.variant)}"></span>
          <span>
            <span class="snapshot-name">${escapeHtml(itemTitle(item))}</span>
            <span class="snapshot-sub">${escapeHtml(statusLabel(item.variant))} · ${escapeHtml(itemSubtitle(item))}</span>
            <span class="snapshot-raw">${escapeHtml(item.raw)}</span>
          </span>
          <span class="review-state ${escapeAttribute(reviewState)}">${escapeHtml(reviewState || 'open')}</span>
        </button>
      `
    }).join('')
  }

  function renderSyncPanel() {
    const tokenLabel = state.githubUser ? `@${state.githubUser}` : (state.githubToken ? 'Token ready' : 'No token')
    return `
      <article class="sync-panel ${escapeAttribute(state.syncState)}">
        <div class="sync-main">
          <div>
            <strong>PR review state</strong>
            <p>${escapeHtml(state.syncMessage)}</p>
          </div>
          <span class="sync-badge">${escapeHtml(tokenLabel)}</span>
        </div>
        <div class="sync-controls">
          <input class="token-input" type="password" autocomplete="off" spellcheck="false" placeholder="GitHub token" value="${escapeAttribute(state.githubToken)}" data-action="github-token" />
          <button class="btn" type="button" data-action="open-token-help">Create token</button>
          <button class="btn" type="button" data-action="save-token">Use token</button>
          <button class="btn" type="button" data-action="load-pr-state">Load PR state</button>
          <button class="btn primary" type="button" data-action="publish-pr-state">Publish to PR</button>
          <button class="btn" type="button" data-action="forget-token">Forget</button>
        </div>
      </article>
    `
  }

  function renderTokenHelpModal() {
    const docsUrl = 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token'
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
            Use a fine-grained personal access token when GitHub asks for authentication. The token lets this browser publish the shared PR visual review comment and update the visual approval status.
          </p>
          <ol class="token-help-steps">
            <li>Open GitHub, then choose your profile picture, Settings, Developer settings, Personal access tokens, Fine-grained tokens, and Generate new token.</li>
            <li>Name the token for this review workflow and choose a short expiration.</li>
            <li>Set Resource owner to the owner of ${escapeHtml(context.repository)}.</li>
            <li>Choose Only select repositories, then select ${escapeHtml(context.repository)}.</li>
            <li>Under Repository permissions, set Issues to Read and write and Commit statuses to Read and write. Metadata stays Read-only automatically.</li>
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
              <span>Commit statuses</span>
              <strong>Read and write</strong>
            </div>
          </div>
          <p class="token-help-note">
            Tokens are stored only in this tab's sessionStorage and are never included in downloaded JSON or PR comments. If organization approval is pending or you do not want to use a token, use Download JSON, Import JSON, or Copy PR comment instead.
          </p>
          <div class="token-help-actions">
            <a class="btn" href="${escapeAttribute(docsUrl)}" target="_blank" rel="noopener noreferrer">Open GitHub docs</a>
            <button class="btn primary" type="button" data-action="close-token-help">Done</button>
          </div>
        </div>
      </section>
    `
  }

  function renderReviewMetadata(item) {
    const review = item.review
    if (!review) return ''

    const primaryDetails = [
      metadataItem('Kind', review.kind || context.surfaceLabel),
      review.sourceFile ? metadataItem('Source', review.sourceFile) : '',
      review.testTitle ? metadataItem('Test', review.testTitle) : '',
      review.storyName ? metadataItem('Story', review.storyName) : '',
      review.storyId ? metadataItem('Story ID', review.storyId) : '',
      metadataItem('Raw file', item.raw),
    ].filter(Boolean).join('')

    return `
      <article class="review-metadata-card" aria-labelledby="review-metadata-title">
        <div class="review-metadata-header">
          <div>
            <p class="metadata-kicker">${escapeHtml(review.kind || context.surfaceLabel)} review context</p>
            <h2 id="review-metadata-title">${escapeHtml(itemTitle(item))}</h2>
            ${review.description ? `<p>${escapeHtml(review.description)}</p>` : ''}
          </div>
          ${review.tags.length ? `<div class="metadata-chip-row">${review.tags.map((tag) => `<span class="metadata-chip">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="metadata-grid">${primaryDetails}</div>
        ${review.expected ? `
          <section class="metadata-section">
            <h3>Expected state</h3>
            <p>${escapeHtml(review.expected)}</p>
          </section>
        ` : ''}
        ${review.focus.length ? `
          <section class="metadata-section">
            <h3>Reviewer focus</h3>
            <ul class="metadata-focus-list">
              ${review.focus.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
        ${review.testTitlePath.length ? `
          <section class="metadata-section">
            <h3>Playwright path</h3>
            <p>${escapeHtml(review.testTitlePath.join(' > '))}</p>
          </section>
        ` : ''}
        ${review.testAnnotations.length ? `
          <section class="metadata-section">
            <h3>Annotations</h3>
            <div class="annotation-list">
              ${review.testAnnotations.map((annotation) => `
                <div class="annotation-row">
                  <strong>${escapeHtml(annotation.type)}</strong>
                  <span>${escapeHtml(annotation.description || 'No description')}</span>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}
      </article>
    `
  }

  function metadataItem(label, value) {
    return `
      <div class="metadata-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
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
            <label class="range-row">Zoom <input type="range" min="50" max="200" step="1" value="${state.zoom}" data-action="zoom" /> <span data-zoom-value>${state.zoom}%</span></label>
            <button class="btn approve" type="button" data-review="approved">Approve</button>
            <button class="btn reject" type="button" data-review="rejected">Reject</button>
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

  function renderImageMode(item) {
    if (item.variant === 'new' || item.variant === 'passed') {
      return `<img class="solo-image" src="${escapeAttribute(item.actual)}" alt="Current screenshot for ${escapeAttribute(item.raw)}" />`
    }
    if (item.variant === 'deleted') {
      return `<img class="solo-image" src="${escapeAttribute(item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />`
    }
    if (state.mode === 'diff') {
      return `<img class="solo-image" src="${escapeAttribute(item.diff)}" alt="Diff highlighter for ${escapeAttribute(item.raw)}" />`
    }
    if (state.mode === 'overlay') {
      return `
        <div class="image-grid">
          <label class="range-row">Reveal current <input type="range" min="0" max="100" value="${state.overlay}" data-action="overlay" /> <span data-overlay-value>${state.overlay}%</span></label>
          <div class="overlay-frame">
            <img src="${escapeAttribute(item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
            <div class="overlay-top" data-overlay-top style="width: ${state.overlay}%">
              <img src="${escapeAttribute(item.actual)}" alt="Current screenshot for ${escapeAttribute(item.raw)}" />
            </div>
          </div>
        </div>
      `
    }
    if (state.mode === 'blink') {
      return `
        <div class="overlay-frame blink-frame">
          <img src="${escapeAttribute(item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
          <img src="${escapeAttribute(item.actual)}" alt="Current screenshot for ${escapeAttribute(item.raw)}" />
        </div>
      `
    }
    return `
      <div class="image-grid two-up">
        <div class="image-panel">
          <h3>Baseline · ${escapeHtml(context.baseRef)}</h3>
          <img src="${escapeAttribute(item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
        </div>
        <div class="image-panel">
          <h3>Current · ${escapeHtml(context.headRef)}</h3>
          <img src="${escapeAttribute(item.actual)}" alt="Current screenshot for ${escapeAttribute(item.raw)}" />
        </div>
      </div>
    `
  }

  function renderContext(item) {
    const reviewState = state.reviews[item.id] || 'open'
    return `
      <article class="context-card">
        <div class="context-grid">
          ${contextItem('Snapshot', item.raw)}
          ${item.review?.title ? contextItem('Display name', item.review.title) : ''}
          ${contextItem('Group', item.group)}
          ${contextItem('Status', `${statusLabel(item.variant)} / ${reviewState}`)}
          ${item.review?.sourceFile ? contextItem('Source', item.review.sourceFile) : ''}
          ${contextItem('Permalink', `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(item.id)}`)}
          ${contextItem('Baseline', context.baseRef)}
          ${contextItem('Current', context.headRef)}
          ${contextItem('Workflow', context.workflowName)}
          ${contextItem('Run', context.runKey)}
        </div>
        <p class="keyboard-help">
          Keyboard: <kbd>Down</kbd>/<kbd>Up</kbd> navigate, <kbd>Y</kbd> approve, <kbd>N</kbd> reject, <kbd>/</kbd> search, <kbd>D</kbd> highlighter, <kbd>S</kbd> side by side, <kbd>O</kbd> overlay, <kbd>B</kbd> blink.
        </p>
      </article>
    `
  }

  function contextItem(label, value) {
    return `
      <div class="context-item">
        <div class="context-label">${escapeHtml(label)}</div>
        <div class="context-value">${escapeHtml(value)}</div>
      </div>
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
    root.querySelector('[data-action="overlay"]')?.addEventListener('input', (event) => {
      state.overlay = clamp(Number(event.target.value), 0, 100)
      event.target.value = String(state.overlay)
      persistViewState()
      applyOverlayState()
    })
    root.querySelector('[data-action="copy-summary"]')?.addEventListener('click', copySummary)
    root.querySelector('[data-action="copy-pr-comment"]')?.addEventListener('click', copyPrComment)
    root.querySelector('[data-action="download-json"]')?.addEventListener('click', downloadReviewJson)
    root.querySelector('[data-action="import-json"]')?.addEventListener('change', importReviewJson)
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

  function setActive(id) {
    state.activeId = id
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
    state.reviews[current.id] = reviewState
    saveReviews()
    navigate(1)
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
    }
  }

  function setMode(mode) {
    state.mode = mode
    persistViewState()
    render()
  }

  async function copySummary() {
    const currentCounts = counts()
    const rejected = items.filter((item) => state.reviews[item.id] === 'rejected')
    const approved = items.filter((item) => state.reviews[item.id] === 'approved')
    const open = items.filter((item) => reviewableVariants.has(item.variant) && !state.reviews[item.id])
    const lines = [
      `Visual review: ${context.surfaceLabel}`,
      `PR #${context.prNumber}: ${context.prTitle}`,
      `Reviewed ${currentCounts.reviewed}/${currentCounts.reviewable} snapshots.`,
      `Approved: ${approved.length}`,
      `Rejected: ${rejected.length}`,
      `Open: ${open.length}`,
      '',
      `Report: ${window.location.href}`,
    ]
    if (rejected.length) {
      lines.push('', 'Rejected snapshots:')
      rejected.slice(0, 20).forEach((item) => lines.push(`- ${itemTitle(item)} (${item.raw})`))
    }
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  async function copyPrComment() {
    await navigator.clipboard.writeText(renderReviewComment(currentReviewState()))
    setSyncState('ready', 'PR comment copied.')
  }

  function downloadReviewJson() {
    const blob = new Blob([`${JSON.stringify(currentReviewState(), null, 2)}\n`], { type: 'application/json' })
    const href = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `mission-control-pr-${context.prNumber}-${context.surface}-visual-review.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(href)
    setSyncState('ready', 'Review JSON downloaded.')
  }

  async function importReviewJson(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = JSON.parse(await readFileAsText(file))
      applyImportedReviewState(imported, 'Imported JSON')
    } catch {
      setSyncState('error', 'Unable to import review JSON.')
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result || '')))
      reader.addEventListener('error', () => reject(reader.error || new Error('file read failed')))
      reader.readAsText(file)
    })
  }

  function currentSurfaceReviewState() {
    return buildSurfaceReviewState({
      context: {
        ...context,
        reportHref: `${window.location.origin}${window.location.pathname}`,
      },
      items,
      reviewer: state.githubUser,
      reviews: state.reviews,
    })
  }

  function currentReviewState() {
    return mergeSurfaceReviewState(state.remoteState, currentSurfaceReviewState())
  }

  function applyImportedReviewState(imported, sourceLabel) {
    const surface = imported?.surfaces?.[context.surface] || imported
    if (!surface?.decisions || surface.surface !== context.surface) {
      setSyncState('error', `${sourceLabel} has no ${context.surface} review state.`)
      return
    }

    let importedCount = 0
    for (const [itemId, decision] of Object.entries(surface.decisions)) {
      if (decision?.decision === 'approved' || decision?.decision === 'rejected') {
        state.reviews[itemId] = decision.decision
        importedCount += 1
      }
    }
    state.remoteState = imported?.surfaces ? imported : mergeSurfaceReviewState(state.remoteState, surface)
    saveReviews()
    setSyncState('ready', `${sourceLabel}: imported ${importedCount} decision(s).`)
  }

  function applyRemoteReviewState(remoteState, sourceLabel) {
    const surface = remoteState?.surfaces?.[context.surface]
    if (!surface) {
      setSyncState('ready', `${sourceLabel}: no ${context.surface} state yet.`)
      return
    }

    let importedCount = 0
    for (const [itemId, decision] of Object.entries(surface.decisions || {})) {
      if (!state.reviews[itemId] && (decision?.decision === 'approved' || decision?.decision === 'rejected')) {
        state.reviews[itemId] = decision.decision
        importedCount += 1
      }
    }
    saveReviews()
    setSyncState('ready', `${sourceLabel}: loaded ${importedCount} decision(s).`)
  }

  async function loadRemoteReviewState(options = {}) {
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
    if (!state.githubToken.trim()) {
      setSyncState('error', 'GitHub token required to publish PR state.')
      return
    }

    setSyncState('loading', 'Publishing PR state...')
    try {
      await loadGithubUser()
      const merged = currentReviewState()
      const body = renderReviewComment(merged)
      let comment = null

      if (state.remoteCommentId) {
        comment = await githubRequest(`/repos/${context.repository}/issues/comments/${state.remoteCommentId}`, {
          body: { body },
          method: 'PATCH',
          requireToken: true,
        })
      } else {
        comment = await githubRequest(`/repos/${context.repository}/issues/${context.prNumber}/comments`, {
          body: { body },
          method: 'POST',
          requireToken: true,
        })
      }

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
      throw new Error(`GitHub API ${response.status}: ${detail}`)
    }

    return response.status === 204 ? null : response.json()
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
