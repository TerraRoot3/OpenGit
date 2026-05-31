import assert from 'node:assert/strict'
import {
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

console.log('project detail terminal focus assertions passed')
