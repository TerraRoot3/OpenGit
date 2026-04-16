export const isBufferViewportAtBottom = (buffer) => {
  const active = buffer?.active
  const baseY = Number(active?.baseY)
  const ydisp = Number(active?.ydisp)

  if (!Number.isFinite(baseY) || !Number.isFinite(ydisp)) {
    return true
  }

  return ydisp >= baseY
}
