import assert from 'node:assert/strict'
import managerModule from '../electron/tab-manager/session-partition-manager.js'

const { createSessionPartitionManager } = managerModule
const manager = createSessionPartitionManager()

const mainPartition = manager.getPartition({ isPrivate: false, tabId: 'browser-web-1' })
const privatePartition = manager.getPartition({ isPrivate: true, tabId: 'browser-web-9' })

assert.equal(mainPartition, 'persist:main')
assert.equal(privatePartition, 'temp:browser-web-9')
assert.equal(manager.isPrivatePartition(privatePartition), true)

console.log('session-partition manager test passed')
