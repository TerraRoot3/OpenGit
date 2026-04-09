import assert from 'node:assert/strict'
import managerModule from '../electron/tab-manager/web-tab-manager.js'

const { createRecoverySnapshot, shouldAutoRestoreDiscardedTab } = managerModule

const snapshot = createRecoverySnapshot({
  tabId: 'browser-web-4',
  url: 'https://example.com/dashboard',
  title: 'Dashboard',
  lifecyclePhase: 'discarded',
  isCrashed: false
})

assert.equal(snapshot.tabId, 'browser-web-4')
assert.equal(snapshot.url, 'https://example.com/dashboard')
assert.equal(shouldAutoRestoreDiscardedTab({ isActive: true, lifecyclePhase: 'discarded' }), true)
assert.equal(shouldAutoRestoreDiscardedTab({ isActive: false, lifecyclePhase: 'discarded' }), false)

console.log('web-tab recovery test passed')
