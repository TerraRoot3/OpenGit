import assert from 'node:assert/strict'
import {
  normalizeProjectTerminalFocusPath,
  resolveProjectTerminalFocusRequest,
  shouldAutoFocusProjectTerminal,
  resolveProjectTerminalFocusMode
} from '../src/components/git/projectDetailTerminalFocus.mjs'

assert.equal(
  shouldAutoFocusProjectTerminal({
    newIsActive: true,
    oldIsActive: false,
    currentView: 'terminal'
  }),
  true,
  'project terminal should autofocus when the browser tab becomes active on the terminal subpage'
)

assert.equal(
  shouldAutoFocusProjectTerminal({
    newIsActive: true,
    oldIsActive: false,
    currentView: 'workspace'
  }),
  false,
  'non-terminal subpages should not steal keyboard focus on browser tab switch'
)

assert.equal(
  shouldAutoFocusProjectTerminal({
    newIsActive: true,
    oldIsActive: true,
    currentView: 'terminal'
  }),
  false,
  'already-active project tabs should not refocus the terminal repeatedly'
)

assert.equal(
  resolveProjectTerminalFocusMode('liquid'),
  'liquid',
  'liquid terminal mode should route autofocus to the liquid terminal stack'
)

assert.equal(
  resolveProjectTerminalFocusMode('split'),
  'split',
  'split terminal mode should route autofocus to the split terminal panel'
)

assert.equal(
  resolveProjectTerminalFocusMode('unexpected'),
  'split',
  'unknown terminal modes should fall back to the split terminal panel'
)

assert.equal(
  normalizeProjectTerminalFocusPath('/tmp/demo%20repo'),
  '/tmp/demo repo',
  'project terminal focus paths should decode encoded project paths'
)

assert.deepEqual(
  resolveProjectTerminalFocusRequest({
    request: {
      path: '/tmp/demo%20repo',
      nonce: 42
    },
    currentPath: '/tmp/demo repo',
    lastHandledNonce: 0,
    isActive: true
  }),
  {
    nonce: 42,
    shouldFocusNow: true
  },
  'active target project tabs should accept a new terminal focus request and focus immediately'
)

assert.equal(
  resolveProjectTerminalFocusRequest({
    request: {
      path: '/tmp/other',
      nonce: 43
    },
    currentPath: '/tmp/demo repo',
    lastHandledNonce: 0,
    isActive: true
  }),
  null,
  'focus requests for other projects should be ignored'
)

assert.equal(
  resolveProjectTerminalFocusRequest({
    request: {
      path: '/tmp/demo repo',
      nonce: 42
    },
    currentPath: '/tmp/demo repo',
    lastHandledNonce: 42,
    isActive: false
  }),
  null,
  'already handled focus requests should not be replayed'
)

console.log('project detail terminal focus assertions passed')
