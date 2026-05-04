/* global document, window, localStorage, navigator, history, URLSearchParams */
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
    group: 'all',
    mode: localStorage.getItem(storageKey('mode')) || 'side-by-side',
    overlay: Number(localStorage.getItem(storageKey('overlay')) || 50),
    query: '',
    reviews: readReviews(),
    zoom: Number(localStorage.getItem(storageKey('zoom')) || 100),
  }

  const items = buildItems()
  const groups = Array.from(new Set(items.map((item) => item.group))).sort((a, b) => a.localeCompare(b))
  const initialId = new URLSearchParams(window.location.search).get('id')
  state.activeId = items.some((item) => item.id === initialId)
    ? initialId
    : (items.find((item) => reviewableVariants.has(item.variant)) || items[0])?.id

  render()
  window.addEventListener('keydown', handleKeys)

  function storageKey(suffix) {
    return `visual-review:${context.prNumber}:${context.surface}:${context.runKey}:${suffix}`
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
    return {
      id,
      raw: item.raw || fileName,
      encoded: fileName,
      variant,
      group: groupName(item.raw || fileName),
      actual: joinUrl(payload.actualDir, fileName),
      expected: joinUrl(payload.expectedDir, fileName),
      diff: joinUrl(payload.diffDir, diffFileName(fileName)),
    }
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
      const queryMatch = !query || `${item.raw} ${item.group} ${item.variant}`.toLowerCase().includes(query)
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
            <p class="notice">Review decisions are stored locally in this browser. Use the copied summary or GitHub PR review to record the final approval/request-changes decision.</p>
            ${current ? renderViewer(current) : '<article class="viewer-card"><div class="empty-list">No snapshots match the current filters.</div></article>'}
            ${current ? renderContext(current) : ''}
          </section>
        </main>
      </div>
    `
    bindEvents()
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
            <span class="snapshot-name">${escapeHtml(item.raw)}</span>
            <span class="snapshot-sub">${escapeHtml(item.group)} · ${escapeHtml(statusLabel(item.variant))}</span>
          </span>
          <span class="review-state ${escapeAttribute(reviewState)}">${escapeHtml(reviewState || 'open')}</span>
        </button>
      `
    }).join('')
  }

  function renderViewer(item) {
    const canCompare = item.variant === 'changed'
    const allowedModes = canCompare ? ['side-by-side', 'diff', 'overlay', 'blink'] : ['single']
    if (!allowedModes.includes(state.mode)) state.mode = allowedModes[0]
    return `
      <article class="viewer-card">
        <div class="viewer-toolbar">
          <div class="snapshot-heading">
            <h2>${escapeHtml(item.raw)}</h2>
            <p>${escapeHtml(statusLabel(item.variant))} · ${escapeHtml(item.group)}</p>
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
            <label class="range-row">Zoom <input type="range" min="50" max="200" step="10" value="${state.zoom}" data-action="zoom" /> ${state.zoom}%</label>
            <button class="btn approve" type="button" data-review="approved">Approve</button>
            <button class="btn reject" type="button" data-review="rejected">Reject</button>
          </div>
        </div>
        <div class="stage">
          <div class="stage-inner" style="transform: scale(${state.zoom / 100});">
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
          <label class="range-row">Reveal current <input type="range" min="0" max="100" value="${state.overlay}" data-action="overlay" /> ${state.overlay}%</label>
          <div class="overlay-frame">
            <img src="${escapeAttribute(item.expected)}" alt="Baseline screenshot for ${escapeAttribute(item.raw)}" />
            <div class="overlay-top" style="width: ${state.overlay}%">
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
          ${contextItem('Group', item.group)}
          ${contextItem('Status', `${statusLabel(item.variant)} / ${reviewState}`)}
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
      state.zoom = Number(event.target.value)
      persistViewState()
      render()
    })
    root.querySelector('[data-action="overlay"]')?.addEventListener('input', (event) => {
      state.overlay = Number(event.target.value)
      persistViewState()
      render()
    })
    root.querySelector('[data-action="copy-summary"]')?.addEventListener('click', copySummary)
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

  function handleKeys(event) {
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
      rejected.slice(0, 20).forEach((item) => lines.push(`- ${item.raw}`))
    }
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  function statusLabel(variant) {
    return {
      changed: 'Changed',
      deleted: 'Deleted',
      new: 'New',
      passed: 'Unchanged',
    }[variant] || variant
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
