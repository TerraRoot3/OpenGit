import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createSitePermissionManager } = require('../electron/permissions/site-permission-manager.js')

const fakeStore = {
  data: {},
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback
  },
  set(key, value) {
    this.data[key] = value
  }
}

const manager = createSitePermissionManager({ store: fakeStore })

assert.equal(manager.normalizeOrigin('https://example.com/a?b=1'), 'https://example.com')
assert.equal(manager.getDefaultDecision('media'), 'ask')
assert.equal(manager.getDefaultDecision('pointerLock'), 'deny')
assert.equal(manager.getDefaultDecision('unknown-permission'), 'deny')

manager.rememberDecision({
  partition: 'persist:main',
  origin: 'https://example.com',
  permission: 'media',
  decision: 'allow'
})

assert.equal(
  manager.getRememberedDecision({
    partition: 'persist:main',
    origin: 'https://example.com',
    permission: 'media'
  }),
  'allow'
)

console.log('site permission manager core tests passed')
