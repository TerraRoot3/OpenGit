import assert from 'node:assert/strict'
import policyModule from '../electron/tab-manager/window-open-policy.js'

const { decideWindowOpenAction } = policyModule

assert.deepEqual(
  decideWindowOpenAction({ url: 'https://example.com', disposition: 'new-window' }),
  { action: 'tab' }
)

assert.deepEqual(
  decideWindowOpenAction({ url: 'about:blank', disposition: 'foreground-tab' }),
  { action: 'tab' }
)

console.log('window-open policy test passed')
