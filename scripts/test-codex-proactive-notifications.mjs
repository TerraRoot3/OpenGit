import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PROACTIVE_NOTIFICATION_STATE_KEY,
  SOURCE_KINDS,
  redactNotificationText,
  classifyImportantAgentMessage,
  formatCodexProactiveNotification,
  createCodexProactiveNotificationMonitor
} = require('../electron/ipc/codex-proactive-notifications.js')

assert.equal(
  classifyImportantAgentMessage('我会先查看代码，然后运行测试。'),
  '',
  'ordinary reasoning and planning must not trigger proactive notifications'
)
assert.equal(
  classifyImportantAgentMessage('关键进展：前端构建已经通过。'),
  'progress'
)
assert.equal(
  classifyImportantAgentMessage('需要你确认是否继续发布。'),
  'decision'
)
assert.equal(
  redactNotificationText('access_token=secret-value sk-abcdefghijklmnop'),
  'access_token=[已隐藏凭据] [已隐藏凭据]'
)
assert.doesNotMatch(
  formatCodexProactiveNotification({
    type: 'failure',
    cwd: '/tmp/demo',
    title: 'Demo',
    summary: 'Bearer top-secret-token-value'
  }),
  /top-secret/
)

class MemoryStore {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values))
  }

  get(key, fallback) {
    return this.values.has(key)
      ? structuredClone(this.values.get(key))
      : fallback
  }

  set(key, value) {
    this.values.set(key, structuredClone(value))
  }
}

let clock = Date.parse('2026-07-28T10:00:00Z')
let currentThread = null
const rpcCalls = []
const delivered = []
const store = new MemoryStore()
const routes = [{
  connectionId: 'work',
  chatId: 'oc_bound',
  stallMinutes: 5
}]

const buildThread = ({
  updatedAt = clock,
  runtimeType = 'active',
  turnId = 'turn-1',
  turnStatus = 'inProgress',
  activeFlags = [],
  messages = [],
  error = null
} = {}) => ({
  id: 'thread-pagepop',
  name: 'PagePop 技能包',
  cwd: '/workspace/pagepop-v2',
  updatedAt: Math.floor(updatedAt / 1000),
  status: {
    type: runtimeType,
    ...(activeFlags.length > 0 ? { activeFlags } : {})
  },
  turns: [{
    id: turnId,
    status: turnStatus,
    startedAt: Math.floor((updatedAt - 1000) / 1000),
    ...(turnStatus === 'completed' || turnStatus === 'failed'
      ? { completedAt: Math.floor(updatedAt / 1000) }
      : {}),
    ...(error ? { error } : {}),
    items: messages.map(([id, text]) => ({
      id,
      type: 'agentMessage',
      text
    }))
  }]
})

currentThread = buildThread({
  messages: [['agent-start', '我会先梳理现有实现。']]
})

const request = async (method, params) => {
  rpcCalls.push({ method, params })
  if (method === 'thread/list') {
    return {
      data: [{
        id: currentThread.id,
        name: currentThread.name,
        cwd: currentThread.cwd,
        updatedAt: currentThread.updatedAt,
        status: currentThread.status
      }],
      nextCursor: null
    }
  }
  if (method === 'thread/read') {
    assert.equal(params.threadId, currentThread.id)
    assert.equal(params.includeTurns, true)
    return { thread: structuredClone(currentThread) }
  }
  throw new Error(`unexpected method: ${method}`)
}

const createMonitor = () => createCodexProactiveNotificationMonitor({
  store,
  request,
  getRoutes: () => routes,
  getOwnedThreadIds: () => ['thread-owned-by-opengit'],
  sendNotification: async (route, message, event) => {
    delivered.push({
      route: structuredClone(route),
      message,
      type: event.type,
      fingerprint: event.fingerprint
    })
  },
  now: () => clock,
  safeLog: () => {},
  safeError: () => {},
  setTimeoutFn: () => ({ unref() {} }),
  clearTimeoutFn: () => {}
})

const monitor = createMonitor()
await monitor.start({ scheduleNext: false })
assert.equal(
  delivered.length,
  0,
  'the first enabled poll must establish a baseline without replaying old tasks'
)
const listCall = rpcCalls.find((call) => call.method === 'thread/list')
assert.equal(listCall.params.archived, false)
assert.equal(listCall.params.useStateDbOnly, true)
assert.deepEqual(listCall.params.sourceKinds, SOURCE_KINDS)

clock += 30 * 1000
currentThread = buildThread({
  messages: [
    ['agent-start', '我会先梳理现有实现。'],
    ['agent-progress', '关键进展：57 条定向测试已经全部通过。']
  ]
})
await monitor.pollOnce()
assert.equal(delivered.length, 1)
assert.equal(delivered[0].type, 'progress')
assert.match(delivered[0].message, /关键进展/)
assert.match(delivered[0].message, /pagepop-v2/)

clock += 30 * 1000
currentThread = buildThread({
  activeFlags: ['waitingOnApproval'],
  messages: [
    ['agent-start', '我会先梳理现有实现。'],
    ['agent-progress', '关键进展：57 条定向测试已经全部通过。'],
    ['agent-decision', '需要你确认是否继续发布。']
  ]
})
await monitor.pollOnce()
assert.equal(
  delivered.filter((item) => item.type === 'decision').length,
  1,
  'status flags and the matching message should collapse into one decision notification'
)

await monitor.pollOnce()
assert.equal(
  delivered.filter((item) => item.type === 'decision').length,
  1,
  'an unchanged state must not be delivered twice'
)

clock += 30 * 1000
currentThread = buildThread({
  runtimeType: 'idle',
  turnStatus: 'completed',
  messages: [
    ['agent-start', '我会先梳理现有实现。'],
    ['agent-progress', '关键进展：57 条定向测试已经全部通过。'],
    ['agent-final', '任务已完成，构建与打包验证均通过。']
  ]
})
await monitor.pollOnce()
assert.equal(
  delivered.filter((item) => item.type === 'completion').length,
  1
)

monitor.stop()
const restartedMonitor = createMonitor()
await restartedMonitor.start({ scheduleNext: false })
assert.equal(
  delivered.filter((item) => item.type === 'completion').length,
  1,
  'restart must not replay a previously delivered completion'
)

clock += 30 * 1000
currentThread = buildThread({
  updatedAt: clock,
  runtimeType: 'systemError',
  turnId: 'turn-2',
  turnStatus: 'failed',
  messages: [['agent-failed', '任务失败，打包命令退出。']],
  error: { message: 'electron-builder failed' }
})
await restartedMonitor.pollOnce()
assert.equal(
  delivered.filter((item) => item.type === 'failure').length,
  1
)

clock += 30 * 1000
currentThread = buildThread({
  updatedAt: clock,
  runtimeType: 'active',
  turnId: 'turn-3',
  turnStatus: 'inProgress',
  messages: [['agent-new-turn', '开始最终校验。']]
})
await restartedMonitor.pollOnce()
const deliveredBeforeStall = delivered.length
clock += 6 * 60 * 1000
currentThread = buildThread({
  updatedAt: clock - 6 * 60 * 1000,
  runtimeType: 'active',
  turnId: 'turn-3',
  turnStatus: 'inProgress',
  messages: [['agent-new-turn', '开始最终校验。']]
})
await restartedMonitor.pollOnce()
assert.equal(delivered.length, deliveredBeforeStall + 1)
assert.equal(delivered.at(-1).type, 'stall')

await restartedMonitor.pollOnce()
assert.equal(
  delivered.filter((item) => item.type === 'stall').length,
  1,
  'stalled state must be deduplicated after delivery'
)
assert.equal(
  store.get(PROACTIVE_NOTIFICATION_STATE_KEY, {}).baselinePending,
  false
)

const deliveredBeforePause = delivered.length
restartedMonitor.stop({ rebaseline: true })
assert.equal(
  store.get(PROACTIVE_NOTIFICATION_STATE_KEY, {}).baselinePending,
  true,
  'unlocking should require a fresh baseline on the next lock'
)
clock += 30 * 1000
currentThread = buildThread({
  updatedAt: clock,
  runtimeType: 'idle',
  turnId: 'turn-4',
  turnStatus: 'completed',
  messages: [['agent-finished-while-unlocked', '任务已完成。']]
})
await restartedMonitor.start({ scheduleNext: false })
assert.equal(
  delivered.length,
  deliveredBeforePause,
  'events that happened while monitoring was paused must not be replayed'
)
assert.equal(
  store.get(PROACTIVE_NOTIFICATION_STATE_KEY, {}).baselinePending,
  false
)

const preservedDeliveryKey = 'work:oc_bound:already-delivered'
const pauseStateStore = new MemoryStore({
  [PROACTIVE_NOTIFICATION_STATE_KEY]: {
    enabled: true,
    baselinePending: false,
    pendingEvents: {
      queued: {
        type: 'completion',
        threadId: 'thread-queued',
        turnId: 'turn-queued',
        title: 'Queued',
        cwd: '/workspace/queued',
        summary: '任务已完成。',
        createdAt: clock
      }
    },
    delivered: {
      [preservedDeliveryKey]: clock
    }
  }
})
const pauseStateMonitor = createCodexProactiveNotificationMonitor({
  store: pauseStateStore,
  request: async () => {
    throw new Error('pause test must not poll')
  },
  getRoutes: () => routes,
  getOwnedThreadIds: () => [],
  sendNotification: async () => {},
  now: () => clock,
  safeLog: () => {},
  safeError: () => {},
  setTimeoutFn: () => ({ unref() {} }),
  clearTimeoutFn: () => {}
})
pauseStateMonitor.stop({ rebaseline: true })
const persistedPauseState = pauseStateStore.get(
  PROACTIVE_NOTIFICATION_STATE_KEY,
  {}
)
assert.equal(persistedPauseState.enabled, true)
assert.equal(persistedPauseState.baselinePending, true)
assert.deepEqual(persistedPauseState.pendingEvents, {})
assert.equal(
  persistedPauseState.delivered[preservedDeliveryKey],
  clock,
  'pausing should preserve delivery fingerprints for restart deduplication'
)

let resolveInFlightList = null
const inFlightStore = new MemoryStore()
const inFlightDelivered = []
const inFlightMonitor = createCodexProactiveNotificationMonitor({
  store: inFlightStore,
  request: async (method) => {
    assert.equal(method, 'thread/list')
    return new Promise((resolve) => {
      resolveInFlightList = resolve
    })
  },
  getRoutes: () => routes,
  getOwnedThreadIds: () => [],
  sendNotification: async (_route, _message, event) => {
    inFlightDelivered.push(event)
  },
  now: () => clock,
  safeLog: () => {},
  safeError: () => {},
  setTimeoutFn: () => ({ unref() {} }),
  clearTimeoutFn: () => {}
})
const inFlightStart = inFlightMonitor.start({ scheduleNext: false })
await Promise.resolve()
assert.equal(typeof resolveInFlightList, 'function')
inFlightMonitor.stop({ rebaseline: true })
resolveInFlightList({
  data: [{
    id: currentThread.id,
    name: currentThread.name,
    cwd: currentThread.cwd,
    updatedAt: currentThread.updatedAt,
    status: currentThread.status
  }],
  nextCursor: null
})
assert.equal(
  await inFlightStart,
  false,
  'a lock-start poll invalidated by unlock must not report itself as running'
)
assert.deepEqual(inFlightDelivered, [])
assert.equal(
  inFlightStore.get(PROACTIVE_NOTIFICATION_STATE_KEY, {}).baselinePending,
  true,
  'an in-flight poll must not overwrite the unlock rebaseline state'
)

restartedMonitor.stop({ disabled: true })
assert.equal(
  store.get(PROACTIVE_NOTIFICATION_STATE_KEY, {}).enabled,
  false
)

console.log('codex proactive notification assertions passed')
