import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCodexNotificationBadgeState } = require('../electron/ipc/codex-notification-badge-state.js')

const appliedBadgeCounts = []
const badgeState = createCodexNotificationBadgeState({
  applyBadge(count) {
    appliedBadgeCounts.push(count)
  }
})

assert.equal(
  badgeState.getCount(),
  0,
  'new Codex notification badge state should start empty'
)

badgeState.markUnread('one')
assert.equal(
  badgeState.getCount(),
  1,
  'marking one unread notification should increment the badge count'
)

badgeState.markUnread('two')
assert.equal(
  badgeState.getCount(),
  2,
  'multiple unread notifications should accumulate in the badge count'
)

badgeState.markRead('one')
assert.equal(
  badgeState.getCount(),
  1,
  'marking a notification as read should decrement the badge count'
)

badgeState.clear()
assert.equal(
  badgeState.getCount(),
  0,
  'clearing unread notifications should reset the badge count'
)

assert.deepEqual(
  appliedBadgeCounts,
  [1, 2, 1, 0],
  'badge updates should be pushed every time the unread count changes'
)

console.log('codex notification badge state assertions passed')
