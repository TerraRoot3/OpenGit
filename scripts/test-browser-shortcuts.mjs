import assert from 'node:assert/strict'
import { resolveBrowserShortcut } from '../src/composables/browserShortcuts.mjs'

assert.equal(resolveBrowserShortcut({ metaKey: true, key: 't' }), 'new-tab')
assert.equal(resolveBrowserShortcut({ metaKey: true, shiftKey: true, key: 't' }), 'restore-closed-tab')
assert.equal(resolveBrowserShortcut({ metaKey: true, key: 'w' }), 'close-tab')

console.log('browser shortcuts test passed')
