import assert from 'node:assert/strict'
import permissionModule from '../electron/permissions/site-permission-manager.js'

const { createSitePermissionManager } = permissionModule

const memory = new Map()
const store = {
  get(key, fallback) {
    return memory.has(key) ? memory.get(key) : fallback
  },
  set(key, value) {
    memory.set(key, value)
  }
}

const manager = createSitePermissionManager({ store })

assert.equal(manager.getDefaultDecision('publickey-credentials-create'), 'ask')
assert.equal(manager.getDefaultDecision('publickey-credentials-get'), 'ask')

assert.equal(
  manager.getCheckDecision({ permission: 'publickey-credentials-get', rememberedDecision: 'unset' }),
  true
)
assert.equal(
  manager.getCheckDecision({ permission: 'pointerLock', rememberedDecision: 'unset' }),
  false
)
assert.equal(
  manager.getCheckDecision({ permission: 'publickey-credentials-get', rememberedDecision: 'deny' }),
  false
)
assert.equal(
  manager.getCheckDecision({ permission: 'publickey-credentials-get', rememberedDecision: 'allow' }),
  true
)

console.log('site-permission manager test passed')
