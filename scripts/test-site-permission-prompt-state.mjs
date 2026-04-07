import assert from 'node:assert/strict'
import { createSitePermissionPromptStore } from '../src/composables/sitePermissionPromptState.mjs'

const promptState = createSitePermissionPromptStore()

promptState.enqueuePrompt({
  requestId: 'req_1',
  origin: 'https://example.com',
  permission: 'media',
  tabId: 'browser-web-1'
})

promptState.enqueuePrompt({
  requestId: 'req_2',
  origin: 'https://example.com',
  permission: 'notifications',
  tabId: 'browser-web-1'
})

assert.equal(promptState.getSnapshot().currentPrompt.requestId, 'req_1')
promptState.resolvePrompt('req_1')
assert.equal(promptState.getSnapshot().currentPrompt.requestId, 'req_2')
promptState.clearPrompts()
assert.equal(promptState.getSnapshot().currentPrompt, null)

const stalePromptState = createSitePermissionPromptStore()

stalePromptState.enqueuePrompt({
  requestId: 'req_3',
  origin: 'https://camera.example.com',
  permission: 'media',
  tabId: 'browser-web-1'
})
stalePromptState.enqueuePrompt({
  requestId: 'req_4',
  origin: 'https://maps.example.com',
  permission: 'geolocation',
  tabId: 'browser-web-2'
})

assert.deepEqual(
  stalePromptState.syncActiveTab('browser-web-2').map(prompt => prompt.requestId),
  ['req_3']
)
assert.equal(stalePromptState.getSnapshot().currentPrompt.requestId, 'req_4')

console.log('site permission prompt state assertions passed')
