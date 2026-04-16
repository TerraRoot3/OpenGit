import assert from 'node:assert/strict'
import { isBufferViewportAtBottom } from '../src/components/terminal/terminalViewportState.mjs'

assert.equal(
  isBufferViewportAtBottom({
    active: { baseY: 42, ydisp: 42 }
  }),
  true,
  'viewport at bottom should be detected when ydisp equals baseY'
)

assert.equal(
  isBufferViewportAtBottom({
    active: { baseY: 42, ydisp: 37 }
  }),
  false,
  'viewport above bottom should be detected when ydisp is less than baseY'
)

assert.equal(
  isBufferViewportAtBottom({
    active: { baseY: 42, ydisp: 45 }
  }),
  true,
  'viewport positions beyond baseY should still count as bottom-safe'
)

assert.equal(
  isBufferViewportAtBottom(null),
  true,
  'missing buffer data should default to bottom-safe'
)

console.log('terminal viewport state assertions passed')
