import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createFocusProjectTerminalState } = require('../electron/ipc/focus-project-terminal-state.js')

const state = createFocusProjectTerminalState({
  now: () => 123456
})

const first = state.begin({
  projectPath: '/tmp/demo',
  routeType: 'clone-directory'
})

assert.equal(
  first?.projectPath,
  '/tmp/demo',
  'pending focus state should preserve the target project path'
)
assert.equal(
  first?.routeType,
  'clone-directory',
  'pending focus state should preserve clone-directory route targets'
)
assert.ok(
  typeof first?.requestId === 'string' && first.requestId.length > 0,
  'pending focus state should allocate a request id for renderer ack'
)

const dispatched = state.markDispatched()
assert.equal(
  dispatched?.dispatchCount,
  1,
  'markDispatched should increment the send counter'
)

assert.equal(
  state.getNextRetryDelay(),
  160,
  'first retry should use the shortest backoff slot'
)

assert.equal(
  state.acknowledge('wrong'),
  false,
  'acknowledging a different request id should not clear pending focus state'
)

assert.equal(
  state.hasPending(),
  true,
  'pending focus state should remain until the matching request is acknowledged'
)

assert.equal(
  state.acknowledge(first.requestId),
  true,
  'acknowledging the active request id should clear the pending focus state'
)

assert.equal(
  state.hasPending(),
  false,
  'pending focus state should be empty after the matching ack'
)

console.log('focus project terminal state assertions passed')
