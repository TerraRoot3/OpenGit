export const TERMINAL_VIEWPORT_SYNC_DELAY_MS = 120

const isPositiveInteger = (value) => Number.isFinite(value) && value > 0

export const runViewportSyncPass = ({
  term,
  resizePty,
  reconcileViewport,
  focus = false,
  stickToBottom = false,
  forceViewportReconcile = false
} = {}) => {
  if (!term?.fitAddon || !term?.xterm) return false

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

  if (forceViewportReconcile && typeof reconcileViewport === 'function') {
    try {
      reconcileViewport(true)
    } catch {}
  }

  if (focus) {
    try {
      term.xterm.focus()
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
    return runViewportSyncPass({
      term,
      resizePty,
      reconcileViewport,
      focus: shouldFocus,
      stickToBottom,
      forceViewportReconcile
    })
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
