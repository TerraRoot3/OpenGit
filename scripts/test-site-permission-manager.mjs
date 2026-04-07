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

const pending = manager.createPendingRequest({
  requestId: 'req_1',
  partition: 'persist:main',
  origin: 'https://example.com',
  permission: 'media',
  tabId: 'browser-web-1'
})

assert.equal(pending.status, 'pending')
assert.equal(manager.getPendingRequest('req_1').origin, 'https://example.com')

manager.resolvePendingRequest({ requestId: 'req_1', decision: 'deny' })
assert.equal(manager.getPendingRequest('req_1'), null)

const expiring = manager.createPendingRequest({
  requestId: 'req_2',
  partition: 'persist:main',
  origin: 'https://stale.example.com',
  permission: 'notifications',
  tabId: 'browser-web-2',
  expiresAt: 100
})

assert.equal(expiring.status, 'pending')
assert.deepEqual(manager.expireRequests(101), ['req_2'])

const promptPayload = manager.buildPromptPayload({
  requestId: 'req_3',
  partition: 'persist:main',
  origin: 'https://maps.example.com/location?q=1',
  permission: 'geolocation',
  tabId: 'browser-web-3'
})

assert.deepEqual(promptPayload, {
  requestId: 'req_3',
  partition: 'persist:main',
  origin: 'https://maps.example.com',
  host: 'maps.example.com',
  permission: 'geolocation',
  tabId: 'browser-web-3'
})

assert.equal(
  manager.shouldPromptRenderer({
    tabId: '',
    defaultDecision: 'ask'
  }),
  false
)

assert.equal(
  manager.shouldPromptRenderer({
    tabId: 'browser-web-9',
    defaultDecision: 'ask'
  }),
  true
)

console.log('site permission manager core tests passed')
