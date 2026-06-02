export const SINGLE_PANE_RECENT_REVEAL_SUPPRESS_MS = 260

export const resolveSinglePaneResizeRecoveryAction = ({
  isActive = false,
  focusPaneFocused = false,
  suspendSinglePaneResize = false,
  lastExplicitRevealAt = 0,
  now = Date.now(),
  suppressMs = SINGLE_PANE_RECENT_REVEAL_SUPPRESS_MS
} = {}) => {
  if (!isActive || !focusPaneFocused || suspendSinglePaneResize) {
    return 'defer'
  }

  if (
    Number.isFinite(lastExplicitRevealAt) &&
    lastExplicitRevealAt > 0 &&
    Number.isFinite(now) &&
    now - lastExplicitRevealAt < suppressMs
  ) {
    return 'skip-recent-reveal'
  }

  return 'recover-now'
}

export const shouldRestoreViewportToBottom = ({
  restoreViewportToBottom = false,
  bufferAtBottom = false
} = {}) => {
  return !!restoreViewportToBottom || !!bufferAtBottom
}
