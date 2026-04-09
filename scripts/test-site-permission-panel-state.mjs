import assert from 'node:assert/strict'
import { createSitePermissionPanelState } from '../src/composables/sitePermissionPanelState.mjs'

const state = createSitePermissionPanelState()

state.open({ origin: 'https://example.com', permissions: { media: 'allow', notifications: 'unset' } })
assert.equal(state.snapshot().isOpen, true)
assert.equal(state.snapshot().permissions.media, 'allow')

state.resetPermission('media')
assert.equal(state.snapshot().permissions.media, 'unset')

console.log('site-permission panel state test passed')
