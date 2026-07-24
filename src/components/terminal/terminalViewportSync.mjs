export const TERMINAL_VIEWPORT_SYNC_DELAY_MS = 120

const isPositiveInteger = (value) => Number.isFinite(value) && value > 0
const isPositiveNumber = (value) => Number.isFinite(value) && value > 0

const readStyleDimensionPx = (style, name) => {
  if (!style || typeof style.getPropertyValue !== 'function') return 0
  const raw = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(raw) ? raw : 0
}

const resolveElementSizeFromRect = (element) => {
  const rect = element?.getBoundingClientRect?.()
  const width = Number(rect?.width)
  const height = Number(rect?.height)
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) return null
  return { width, height }
}

export const proposeTerminalViewportDimensions = (
  term,
  getComputedStyleImpl = globalThis.window?.getComputedStyle?.bind(globalThis.window)
) => {
  const xterm = term?.xterm
  const core = xterm?._core
  const element = xterm?.element
  const parent = element?.parentElement
  const renderDimensions = core?._renderService?.dimensions?.css
  const cellWidth = Number(renderDimensions?.cell?.width)
  const cellHeight = Number(renderDimensions?.cell?.height)

  if (!xterm || !core || !element || !parent) return null
  if (!isPositiveNumber(cellWidth) || !isPositiveNumber(cellHeight)) return null

  const parentRect = resolveElementSizeFromRect(parent)
  if (!parentRect) return null

  const parentStyle = typeof getComputedStyleImpl === 'function' ? getComputedStyleImpl(parent) : null
  const elementStyle = typeof getComputedStyleImpl === 'function' ? getComputedStyleImpl(element) : null

  const parentWidth = isPositiveNumber(parentRect.width)
    ? parentRect.width
    : readStyleDimensionPx(parentStyle, 'width')
  const parentHeight = isPositiveNumber(parentRect.height)
    ? parentRect.height
    : readStyleDimensionPx(parentStyle, 'height')
  if (!isPositiveNumber(parentWidth) || !isPositiveNumber(parentHeight)) return null

  const verticalPadding =
    readStyleDimensionPx(elementStyle, 'padding-top') +
    readStyleDimensionPx(elementStyle, 'padding-bottom')
  const horizontalPadding =
    readStyleDimensionPx(elementStyle, 'padding-left') +
    readStyleDimensionPx(elementStyle, 'padding-right')
  const scrollBarWidth = xterm.options?.scrollback === 0 ? 0 : Number(core.viewport?.scrollBarWidth) || 0

  const availableWidth = Math.max(0, parentWidth - horizontalPadding - scrollBarWidth)
  const availableHeight = Math.max(0, parentHeight - verticalPadding)
  if (!isPositiveNumber(availableWidth) || !isPositiveNumber(availableHeight)) return null

  return {
    cols: Math.max(2, Math.floor(availableWidth / cellWidth)),
    rows: Math.max(1, Math.floor(availableHeight / cellHeight))
  }
}

export const fitTerminalViewport = (term) => {
  const xterm = term?.xterm
  const core = xterm?._core
  if (!term?.fitAddon || !xterm) return false

  const proposed = proposeTerminalViewportDimensions(term)
  if (!proposed) {
    try {
      term.fitAddon.fit()
      return true
    } catch {
      return false
    }
  }

  if (xterm.cols === proposed.cols && xterm.rows === proposed.rows) {
    return true
  }

  try {
    core?._renderService?.clear?.()
  } catch {}

  try {
    xterm.resize(proposed.cols, proposed.rows)
    return true
  } catch {
    try {
      term.fitAddon.fit()
      return true
    } catch {
      return false
    }
  }
}

export const forceTerminalRenderGeometrySync = (term) => {
  const xterm = term?.xterm
  const core = xterm?._core
  const renderService = core?._renderService
  if (!xterm || !renderService) return false

  let synced = false

  if (typeof core?._charSizeService?.measure === 'function') {
    try {
      core._charSizeService.measure()
      synced = true
    } catch {}
  }

  if (typeof renderService.handleCharSizeChanged === 'function') {
    try {
      renderService.handleCharSizeChanged()
      synced = true
    } catch {}
  }

  if (
    typeof renderService.handleResize === 'function' &&
    isPositiveInteger(xterm.cols) &&
    isPositiveInteger(xterm.rows)
  ) {
    try {
      renderService.handleResize(xterm.cols, xterm.rows)
      synced = true
    } catch {}
  }

  return synced
}

export const forceViewportScrollAreaSync = (term, immediate = true) => {
  const viewport = term?.xterm?._core?.viewport
  if (!viewport) return false

  let synced = false

  if (typeof viewport.syncScrollArea === 'function') {
    try {
      viewport.syncScrollArea(immediate)
      synced = true
    } catch {}
  }

  // `syncScrollArea()` updates buffer-length bookkeeping, but it does not detect a pure
  // viewport-element height change when rows/cols stay the same. Follow with a direct refresh
  // so cross-screen moves still remeasure the real viewport height.
  if (typeof viewport._refresh === 'function') {
    try {
      viewport._refresh(immediate)
      synced = true
    } catch {}
  }

  return synced
}

export const restoreTerminalViewportToBottom = (
  term,
  reconcileViewport = (immediate) => forceViewportScrollAreaSync(term, immediate)
) => {
  if (!term?.xterm) return false

  if (typeof reconcileViewport === 'function') {
    try {
      reconcileViewport(true)
    } catch {}
  }

  try {
    term.xterm.scrollToBottom()
  } catch {}
  try {
    if (isPositiveInteger(term.xterm.rows)) {
      term.xterm.refresh(0, term.xterm.rows - 1)
    }
  } catch {}

  if (typeof reconcileViewport === 'function') {
    try {
      reconcileViewport(true)
    } catch {}
  }

  return true
}

export const runViewportSyncPass = ({
  term,
  resizePty,
  focus = false,
  stickToBottom = false,
  forceViewportReconcile = false,
  reconcileViewport
} = {}) => {
  if (!term?.fitAddon || !term?.xterm) return false

  forceTerminalRenderGeometrySync(term)
  fitTerminalViewport(term)

  try {
    if (isPositiveInteger(term.xterm.rows)) {
      term.xterm.refresh(0, term.xterm.rows - 1)
    }
  } catch {}

  try {
    const cols = term.xterm.cols
    const rows = term.xterm.rows
    if (typeof resizePty === 'function' && isPositiveInteger(cols) && isPositiveInteger(rows)) {
      resizePty({ cols, rows })
    }
  } catch {}

  if (focus) {
    try {
      term.xterm.focus()
    } catch {}
  }

  if (stickToBottom) {
    restoreTerminalViewportToBottom(term, reconcileViewport)
  } else if (forceViewportReconcile && typeof reconcileViewport === 'function') {
    try {
      reconcileViewport(true)
    } catch {}
  }

  return true
}

const runViewportRestorePass = ({
  term,
  reconcileViewport,
  stickToBottom = false,
  forceViewportReconcile = false
} = {}) => {
  if (!term?.xterm) return false

  if (stickToBottom) {
    restoreTerminalViewportToBottom(term, reconcileViewport)
  } else if (forceViewportReconcile && typeof reconcileViewport === 'function') {
    try {
      reconcileViewport(true)
    } catch {}
  }

  return true
}

export const cancelViewportRevealSync = (
  term,
  clearTimer = (timerId) => globalThis.clearTimeout?.(timerId)
) => {
  if (!term?._viewportRevealTimerId) return
  try {
    clearTimer(term._viewportRevealTimerId)
  } catch {}
  term._viewportRevealTimerId = null
}

export const scheduleViewportRevealSync = ({
  term,
  canMeasure,
  resizePty,
  reconcileViewport,
  focus = false,
  stickToBottom = false,
  forceViewportReconcile = false,
  requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback) ?? globalThis.setTimeout?.(callback, 0),
  setTimer = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  clearTimer = (timerId) => globalThis.clearTimeout?.(timerId),
  followupDelayMs = TERMINAL_VIEWPORT_SYNC_DELAY_MS
} = {}) => {
  if (!term) return

  cancelViewportRevealSync(term, clearTimer)

  const runPass = (shouldFocus = false) => {
    if (typeof canMeasure === 'function' && !canMeasure()) return false
    const didFitPass = runViewportSyncPass({
      term,
      resizePty,
      focus: shouldFocus
    })
    if (!didFitPass) return false

    if (!stickToBottom && !forceViewportReconcile) {
      return true
    }

    requestFrame(() => {
      if (typeof canMeasure === 'function' && !canMeasure()) return
      runViewportRestorePass({
        term,
        reconcileViewport,
        stickToBottom,
        forceViewportReconcile
      })
    })

    return true
  }

  requestFrame(() => {
    runPass(focus)
  })

  term._viewportRevealTimerId = setTimer(() => {
    term._viewportRevealTimerId = null
    requestFrame(() => {
      runPass(false)
    })
  }, followupDelayMs)
}
