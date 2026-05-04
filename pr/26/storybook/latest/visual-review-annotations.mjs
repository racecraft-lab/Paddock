export const VISUAL_ANNOTATION_COMMENT_MARKER = 'visual-review-pages-annotation:v1'

export function annotationStorageKey({ asset = 'current', context, itemId }) {
  return [
    'visual-review-annotation',
    contextValue(context.repository),
    contextValue(context.prNumber),
    contextValue(context.surface),
    contextValue(context.runKey),
    contextValue(context.headSha),
    contextValue(itemId),
    contextValue(asset),
  ].join(':')
}

export function annotationPageHref({ asset = 'current', basePath, itemId }) {
  const url = new URL(basePath || './', globalThis.location?.href || 'https://example.invalid/')
  const pathname = url.pathname.replace(/[^/]*$/, 'annotate.html')
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  url.searchParams.set('id', itemId)
  url.searchParams.set('asset', asset)
  return url.href
}

export function annotationPointIntersectsImage({ annotation, imageRect, viewport }) {
  const point = annotationViewportPoint(annotation, viewport)
  return point.x >= imageRect.x &&
    point.x <= imageRect.x + imageRect.width &&
    point.y >= imageRect.y &&
    point.y <= imageRect.y + imageRect.height
}

export function imageCoordinatesFromAnnotation({ annotation, imageRect, naturalSize, viewport }) {
  const point = annotationViewportPoint(annotation, viewport)
  if (!annotationPointIntersectsImage({ annotation, imageRect, viewport })) {
    throw new RangeError('Annotation point is outside the reviewed image bounds.')
  }

  const xPct = round(((point.x - imageRect.x) / imageRect.width) * 100, 3)
  const yPct = round(((point.y - imageRect.y) / imageRect.height) * 100, 3)
  const pixelX = Math.round((xPct / 100) * naturalSize.width)
  const pixelY = Math.round((yPct / 100) * naturalSize.height)
  const boxPct = annotation.boundingBox
    ? {
        x: clampPercent(((annotation.boundingBox.x - imageRect.x) / imageRect.width) * 100),
        y: clampPercent(((annotationBoxTop(annotation, viewport) - imageRect.y) / imageRect.height) * 100),
        width: clampPercent((annotation.boundingBox.width / imageRect.width) * 100),
        height: clampPercent((annotation.boundingBox.height / imageRect.height) * 100),
      }
    : undefined

  return {
    pixelX,
    pixelY,
    xPct,
    yPct,
    ...(boxPct ? { boxPct } : {}),
  }
}

export function resolvePullRequestCommentPlacement({ files, target }) {
  const changedFile = Array.isArray(files)
    ? files.find((file) => file?.filename === target?.path)
    : null

  if (!changedFile) {
    return {
      kind: 'timeline',
      reason: 'The related source file is not present in this PR diff, so GitHub cannot place an inline review comment there.',
    }
  }

  if (target?.line && patchContainsRightSideLine(changedFile.patch, target.line)) {
    return {
      body: {
        line: target.line,
        side: 'RIGHT',
      },
      kind: 'line',
      reason: '',
    }
  }

  return {
    body: { subject_type: 'file' },
    kind: 'file',
    reason: target?.line
      ? 'The related source file is in this PR, but the exact line is not part of the diff; GitHub only accepts line comments on diff lines.'
      : '',
  }
}

export function annotationCommentBody({ annotation, placementReason = '' }) {
  const marker = annotationMarkerPayload(annotation)
  const lines = [
    String(annotation.comment || annotation.agentation?.comment || '').trim(),
    '',
    '---',
    `Visual annotation: [open annotation](${annotation.review.annotationPageUrl})`,
    `Raw image: [open image](${annotation.image.url})`,
  ]

  if (annotation.target?.href) {
    lines.push(`Related source file: [${sourceLabel(annotation.target)}](${annotation.target.href})`)
  } else if (annotation.target?.path) {
    lines.push(`Related source file: \`${sourceLabel(annotation.target)}\``)
  }

  if (annotation.review?.runUrl) {
    lines.push(`Workflow run: [${annotation.review.runKey || 'run'}](${annotation.review.runUrl})`)
  }

  lines.push(
    `Snapshot artifact: \`${annotation.review.snapshot || annotation.image.rawFile || annotation.review.itemId}\``,
    `Surface: ${annotation.review.surface}`,
    `Head: \`${shortSha(annotation.review.headSha)}\``,
    `Image coordinates: \`${annotation.image.pixelX}, ${annotation.image.pixelY}\` px (\`${formatPercent(annotation.image.xPct)}%, ${formatPercent(annotation.image.yPct)}%\`)`
  )

  if (placementReason) lines.push(`Placement note: ${placementReason}`)

  lines.push(
    '',
    `<!-- ${VISUAL_ANNOTATION_COMMENT_MARKER} ${JSON.stringify(marker)} -->`
  )

  return lines.join('\n')
}

export function patchContainsRightSideLine(patch, targetLine) {
  if (!patch || !targetLine) return false
  let oldLine = 0
  let newLine = 0

  for (const patchLine of String(patch).split('\n')) {
    const hunk = patchLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      continue
    }
    if (patchLine.startsWith(' ')) {
      if (newLine === targetLine) return true
      oldLine += 1
      newLine += 1
    } else if (patchLine.startsWith('+')) {
      if (newLine === targetLine) return true
      newLine += 1
    } else if (patchLine.startsWith('-')) {
      oldLine += 1
    }
  }

  return false
}

function annotationMarkerPayload(annotation) {
  return {
    annotationId: String(annotation.id || ''),
    asset: String(annotation.review.asset || ''),
    headSha: String(annotation.review.headSha || ''),
    itemId: String(annotation.review.itemId || ''),
    pixelX: annotation.image.pixelX,
    pixelY: annotation.image.pixelY,
    prNumber: String(annotation.review.prNumber || ''),
    repository: String(annotation.review.repository || ''),
    runKey: String(annotation.review.runKey || ''),
    snapshot: String(annotation.review.snapshot || ''),
    sourceLine: annotation.target?.line || null,
    sourcePath: annotation.target?.path || null,
    surface: String(annotation.review.surface || ''),
    xPct: annotation.image.xPct,
    yPct: annotation.image.yPct,
  }
}

function annotationViewportPoint(annotation, viewport = {}) {
  const viewportWidth = Number(viewport.width || globalThis.innerWidth || 0)
  const scrollY = Number(viewport.scrollY ?? globalThis.scrollY ?? 0)
  const x = Number(annotation?.x || 0)
  const y = Number(annotation?.y || 0)
  return {
    x: viewportWidth > 0 ? (x / 100) * viewportWidth : x,
    y: annotation?.isFixed ? y : y - scrollY,
  }
}

function annotationBoxTop(annotation, viewport = {}) {
  const y = Number(annotation?.boundingBox?.y || 0)
  const scrollY = Number(viewport.scrollY ?? globalThis.scrollY ?? 0)
  return annotation?.isFixed ? y : y - scrollY
}

function sourceLabel(target) {
  return target?.line ? `${target.path}:${target.line}` : target?.path || ''
}

function contextValue(value) {
  return String(value ?? '').replaceAll(':', '_')
}

function clampPercent(value) {
  const numeric = Number.isFinite(value) ? value : 0
  return round(Math.min(100, Math.max(0, numeric)), 3)
}

function formatPercent(value) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 3,
    useGrouping: false,
  })
}

function round(value, places) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function shortSha(value) {
  return String(value || '').slice(0, 7) || 'unknown'
}
