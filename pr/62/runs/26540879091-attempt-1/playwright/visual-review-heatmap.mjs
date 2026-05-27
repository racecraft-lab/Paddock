export const DEFAULT_HEAT_MAP_THRESHOLD = 12

export function heatMapColorForDelta(delta, {
  threshold = DEFAULT_HEAT_MAP_THRESHOLD,
} = {}) {
  const value = Math.max(0, Number(delta) || 0)
  const floor = Math.max(0, Number(threshold) || 0)
  if (value <= floor) return null

  const intensity = Math.min(1, (value - floor) / Math.max(1, 255 - floor))
  return [
    255,
    Math.max(0, Math.round(233 - intensity * 212)),
    0,
    Math.max(80, Math.round(96 + intensity * 159)),
  ]
}

export function writeHeatMapPixels({
  baseline,
  current,
  output,
  threshold = DEFAULT_HEAT_MAP_THRESHOLD,
}) {
  const totalPixels = Math.floor(Math.min(
    baseline?.length || 0,
    current?.length || 0,
    output?.length || 0
  ) / 4)
  let changedPixels = 0
  let maxDelta = 0

  for (let index = 0; index < totalPixels * 4; index += 4) {
    const delta = Math.max(
      Math.abs(current[index] - baseline[index]),
      Math.abs(current[index + 1] - baseline[index + 1]),
      Math.abs(current[index + 2] - baseline[index + 2])
    )
    maxDelta = Math.max(maxDelta, delta)
    const color = heatMapColorForDelta(delta, { threshold })
    if (!color) {
      output[index] = 0
      output[index + 1] = 0
      output[index + 2] = 0
      output[index + 3] = 0
      continue
    }

    changedPixels += 1
    output[index] = color[0]
    output[index + 1] = color[1]
    output[index + 2] = color[2]
    output[index + 3] = color[3]
  }

  return { changedPixels, maxDelta, totalPixels }
}
