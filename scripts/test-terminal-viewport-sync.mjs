import assert from 'node:assert/strict'
import { scheduleViewportRevealSync } from '../src/components/terminal/terminalViewportSync.mjs'

const createStubTerm = () => {
  const events = []
  const term = {
    fitAddon: {
      fit() {
        events.push('fit')
      }
    },
    xterm: {
      cols: 80,
      rows: 24,
      refresh(start, end) {
        events.push(`refresh:${start}-${end}`)
      },
      scrollToBottom() {
        events.push('scrollToBottom')
      },
      focus() {
        events.push('focus')
      }
    }
  }
  return { term, events }
}

{
  const { term, events } = createStubTerm()
  const pendingFrames = []
  const pendingTimers = []
  const clearedTimers = []

  scheduleViewportRevealSync({
    term,
    focus: true,
    stickToBottom: true,
    canMeasure: () => true,
    requestFrame(callback) {
      pendingFrames.push(callback)
      return pendingFrames.length
    },
    setTimer(callback, delay) {
      pendingTimers.push({ callback, delay })
      return pendingTimers.length
    },
    clearTimer(timerId) {
      clearedTimers.push(timerId)
    },
    resizePty({ cols, rows }) {
      events.push(`resize:${cols}x${rows}`)
    },
    followupDelayMs: 120
  })

  assert.equal(pendingFrames.length, 1, 'reveal sync should schedule an immediate animation frame')
  assert.equal(pendingTimers.length, 1, 'reveal sync should schedule a delayed follow-up timer')
  assert.equal(pendingTimers[0].delay, 120, 'follow-up sync should use the configured delay')

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    ['fit', 'refresh:0-23', 'resize:80x24', 'focus'],
    'immediate sync should fit, refresh, resize, and focus before viewport restore'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'bottom restore should be deferred to a follow-up animation frame after the fit pass'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    ['fit', 'refresh:0-23', 'resize:80x24', 'focus', 'scrollToBottom', 'refresh:0-23'],
    'deferred viewport restore should scroll after the fit pass has settled'
  )

  pendingTimers.shift().callback()
  assert.equal(pendingFrames.length, 1, 'follow-up timer should schedule another animation frame')
  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus',
      'scrollToBottom',
      'refresh:0-23',
      'fit',
      'refresh:0-23',
      'resize:80x24'
    ],
    'follow-up fit pass should remeasure before another deferred bottom restore'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'follow-up fit pass should also defer bottom restore to a second animation frame'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus',
      'scrollToBottom',
      'refresh:0-23',
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23'
    ],
    'follow-up sync should repeat viewport reconciliation without refocusing'
  )

  assert.deepEqual(clearedTimers, [], 'no timer should be cleared during a single fresh sync')
}

{
  const { term, events } = createStubTerm()
  const pendingFrames = []
  const pendingTimers = []

  scheduleViewportRevealSync({
    term,
    focus: false,
    stickToBottom: true,
    canMeasure: () => true,
    requestFrame(callback) {
      pendingFrames.push(callback)
      return pendingFrames.length
    },
    setTimer(callback, delay) {
      pendingTimers.push({ callback, delay })
      return pendingTimers.length
    },
    clearTimer() {},
    resizePty({ cols, rows }) {
      events.push(`resize:${cols}x${rows}`)
    },
    reconcileViewport(immediate) {
      events.push(`syncScrollArea:${immediate}`)
    },
    followupDelayMs: 120
  })

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24'
    ],
    'bottom-restoring resize should complete the fit pass before viewport restore'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'bottom-restoring resize should defer viewport restore to a second animation frame'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true'
    ],
    'bottom-restoring resize should reconcile the viewport scroll area after the fit pass settles'
  )

  pendingTimers.shift().callback()
  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true',
      'fit',
      'refresh:0-23',
      'resize:80x24'
    ],
    'follow-up fit pass should run before the deferred bottom restore reconcile'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'follow-up bottom restore should also run on its own animation frame'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true',
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true'
    ],
    'follow-up bottom restore should keep the viewport scroll area synchronized after reflow'
  )
}

{
  const { term, events } = createStubTerm()
  const pendingFrames = []
  const pendingTimers = []

  scheduleViewportRevealSync({
    term,
    focus: true,
    stickToBottom: true,
    forceViewportReconcile: true,
    canMeasure: () => true,
    requestFrame(callback) {
      pendingFrames.push(callback)
      return pendingFrames.length
    },
    setTimer(callback, delay) {
      pendingTimers.push({ callback, delay })
      return pendingTimers.length
    },
    clearTimer() {},
    resizePty({ cols, rows }) {
      events.push(`resize:${cols}x${rows}`)
    },
    reconcileViewport(immediate) {
      events.push(`syncScrollArea:${immediate}`)
    },
    followupDelayMs: 120
  })

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus'
    ],
    'dirty hidden-output restore should focus after the fit pass before deferred viewport restore'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'dirty hidden-output restore should defer viewport reconciliation to a follow-up animation frame'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true'
    ],
    'dirty hidden-output restore should force a viewport scroll-area reconcile after redraw settles'
  )

  pendingTimers.shift().callback()
  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true',
      'fit',
      'refresh:0-23',
      'resize:80x24'
    ],
    'follow-up hidden-output fit pass should run before the deferred reconcile frame'
  )
  assert.equal(
    pendingFrames.length,
    1,
    'follow-up hidden-output reconcile should also run on a second animation frame'
  )

  pendingFrames.shift()()
  assert.deepEqual(
    events,
    [
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'focus',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true',
      'fit',
      'refresh:0-23',
      'resize:80x24',
      'scrollToBottom',
      'refresh:0-23',
      'syncScrollArea:true'
    ],
    'follow-up pass should also reconcile the viewport scroll area when hidden output dirtied it'
  )
}

{
  const { term, events } = createStubTerm()
  const pendingFrames = []
  const pendingTimers = []

  scheduleViewportRevealSync({
    term,
    focus: false,
    stickToBottom: false,
    canMeasure: () => false,
    requestFrame(callback) {
      pendingFrames.push(callback)
      return pendingFrames.length
    },
    setTimer(callback, delay) {
      pendingTimers.push({ callback, delay })
      return pendingTimers.length
    },
    clearTimer() {},
    resizePty() {
      events.push('resize')
    },
    followupDelayMs: 90
  })

  pendingFrames.shift()()
  pendingTimers.shift().callback()
  pendingFrames.shift()()

  assert.deepEqual(events, [], 'sync should not touch terminal state when it cannot be measured')
}

console.log('terminal viewport sync assertions passed')
