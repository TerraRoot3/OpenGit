import assert from 'node:assert/strict'
import {
  SINGLE_PANE_RECENT_REVEAL_SUPPRESS_MS,
  resolveSinglePaneResizeRecoveryAction,
  shouldRestoreViewportToBottom
} from '../src/components/terminal/terminalSinglePaneRecovery.mjs'

assert.equal(
  resolveSinglePaneResizeRecoveryAction({
    isActive: false,
    focusPaneFocused: true,
    suspendSinglePaneResize: false,
    lastExplicitRevealAt: 0,
    now: 1000
  }),
  'defer',
  'inactive panes should defer resize recovery until they are visible again'
)

assert.equal(
  resolveSinglePaneResizeRecoveryAction({
    isActive: true,
    focusPaneFocused: false,
    suspendSinglePaneResize: false,
    lastExplicitRevealAt: 0,
    now: 1000
  }),
  'defer',
  'unfocused panes should defer resize recovery instead of revealing immediately'
)

assert.equal(
  resolveSinglePaneResizeRecoveryAction({
    isActive: true,
    focusPaneFocused: true,
    suspendSinglePaneResize: true,
    lastExplicitRevealAt: 0,
    now: 1000
  }),
  'defer',
  'activation-time resize suspension should defer recovery until the pane settles'
)

assert.equal(
  resolveSinglePaneResizeRecoveryAction({
    isActive: true,
    focusPaneFocused: true,
    suspendSinglePaneResize: false,
    lastExplicitRevealAt: 1000,
    now: 1000 + SINGLE_PANE_RECENT_REVEAL_SUPPRESS_MS - 1
  }),
  'skip-recent-reveal',
  'resize churn immediately after an explicit reveal should not trigger a second strong reveal'
)

assert.equal(
  resolveSinglePaneResizeRecoveryAction({
    isActive: true,
    focusPaneFocused: true,
    suspendSinglePaneResize: false,
    lastExplicitRevealAt: 1000,
    now: 1000 + SINGLE_PANE_RECENT_REVEAL_SUPPRESS_MS + 1
  }),
  'recover-now',
  'steady-state visible panes should recover immediately once the recent-reveal suppression window passes'
)

assert.equal(
  shouldRestoreViewportToBottom({
    restoreViewportToBottom: false,
    bufferAtBottom: false
  }),
  false,
  'panes away from the bottom should keep their scroll position during resize recovery'
)

assert.equal(
  shouldRestoreViewportToBottom({
    restoreViewportToBottom: true,
    bufferAtBottom: false
  }),
  true,
  'explicit bottom-restore requests should be preserved during viewport recovery'
)

assert.equal(
  shouldRestoreViewportToBottom({
    restoreViewportToBottom: false,
    bufferAtBottom: true
  }),
  true,
  'panes already at the bottom should stay pinned there after resize recovery'
)

console.log('terminal single-pane recovery assertions passed')
