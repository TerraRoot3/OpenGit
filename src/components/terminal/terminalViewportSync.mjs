export const TERMINAL_VIEWPORT_SYNC_DELAY_MS = 120

const isPositiveInteger = (value) => Number.isFinite(value) && value > 0

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

export const runViewportSyncPass = ({
  term,
  resizePty,
  focus = false
} = {}) => {
  if (!term?.fitAddon || !term?.xterm) return false

  forceTerminalRenderGeometrySync(term)

  try {
    term.fitAddon.fit()
  } catch {}

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
    try {
      term.xterm.scrollToBottom()
    } catch {}
    try {
      if (isPositiveInteger(term.xterm.rows)) {
        term.xterm.refresh(0, term.xterm.rows - 1)
      }
    } catch {}
  }

  if ((stickToBottom || forceViewportReconcile) && typeof reconcileViewport === 'function') {
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
