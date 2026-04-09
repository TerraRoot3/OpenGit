import assert from 'node:assert/strict'
import { createWebTabLifecycleController } from '../electron/tab-manager/web-tab-lifecycle.js'

const lifecycle = createWebTabLifecycleController({
  freezeDelayMs: 1000,
  discardDelayMs: 5000
})

lifecycle.registerTab('browser-web-1')
assert.equal(lifecycle.getState('browser-web-1').phase, 'warm')

lifecycle.activateTab('browser-web-1', 0)
assert.equal(lifecycle.getState('browser-web-1').phase, 'active')

lifecycle.deactivateTab('browser-web-1', 100)
assert.equal(lifecycle.getState('browser-web-1').phase, 'warm')

assert.deepEqual(lifecycle.advance(1200), ['browser-web-1:frozen'])
assert.equal(lifecycle.getState('browser-web-1').phase, 'frozen')

assert.deepEqual(lifecycle.advance(5200), ['browser-web-1:discarded'])
assert.equal(lifecycle.getState('browser-web-1').phase, 'discarded')

console.log('web-tab lifecycle test passed')
