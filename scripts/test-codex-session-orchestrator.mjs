import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  CodexSessionOrchestrator,
  CODEX_SESSION_DYNAMIC_TOOLS
} = require('../electron/ipc/codex-session-orchestrator.js')

class MemoryStore {
  constructor() {
    this.values = new Map()
  }

  get(key, fallback) {
    return this.values.has(key) ? structuredClone(this.values.get(key)) : fallback
  }

  set(key, value) {
    this.values.set(key, structuredClone(value))
  }
}

const threads = new Map([
  ['thread-source', {
    id: 'thread-source',
    title: 'OpenGit 主会话',
    preview: '管理其他任务',
    cwd: '/tmp/OpenGit',
    source: 'appServer',
    updatedAt: 100,
    rolloutPath: '/tmp/source.jsonl'
  }],
  ['thread-api', {
    id: 'thread-api',
    title: '修复 api-go',
    preview: '检查接口',
    cwd: '/tmp/api-go',
    source: 'vscode',
    updatedAt: 90,
    rolloutPath: '/tmp/api.jsonl'
  }],
  ['thread-idle', {
    id: 'thread-idle',
    title: 'pophie',
    preview: '调整页面',
    cwd: '/tmp/pophie',
    source: 'vscode',
    updatedAt: 80,
    rolloutPath: '/tmp/idle.jsonl'
  }]
])
const statuses = new Map([
  ['thread-source', { status: 'running', at: 1000, reason: 'test.running' }],
  ['thread-api', { status: 'running', at: 900, reason: 'test.running' }],
  ['thread-idle', { status: 'ended', at: 800, reason: 'test.ended' }]
])
const stateSource = {
  listThreads: async ({ query = '' } = {}) => (
    Array.from(threads.values()).filter((thread) => (
      !query
      || `${thread.title} ${thread.cwd} ${thread.id}`.includes(query)
    ))
  ),
  getThread: async (threadId) => threads.get(threadId) || null,
  resolveThreadStatus: async ({ threadId }) => statuses.get(threadId) || null
}

const activeTask = {
  sessionId: 'feishu:work:oc_test',
  threadId: 'thread-source',
  metadata: {
    connectionId: 'work',
    chatId: 'oc_test',
    messageId: 'om_watch_request'
  }
}
const dispatches = []
const notifications = []
const service = {
  activeTasksByThreadId: new Map([['thread-source', activeTask]]),
  managedExternalTurns: new Map(),
  findSessionByThreadId: () => null,
  dispatchCodexThreadMessage: async ({ thread, message }) => {
    dispatches.push({ threadId: thread.id, message })
    statuses.set(thread.id, {
      status: 'running',
      at: Date.now(),
      reason: 'test.dispatched'
    })
    return {
      delivery: 'started_new_turn',
      turnId: 'turn-dispatched',
      startedAt: Date.now()
    }
  },
  readCodexThreadLastReply: async () => '目标 Codex 的最终回复',
  notifyCodexWatchCompletion: async (watch, text) => {
    notifications.push({ watch, text })
    return { messageId: 'om_watch_notification' }
  }
}

const orchestrator = new CodexSessionOrchestrator({
  service,
  store: new MemoryStore(),
  stateSource,
  pollIntervalMs: 60 * 1000
})

assert.deepEqual(
  CODEX_SESSION_DYNAMIC_TOOLS.map((tool) => tool.name),
  [
    'list_codex_sessions',
    'send_codex_session_message',
    'monitor_codex_session',
    'cancel_codex_session_monitor'
  ]
)

const running = await orchestrator.listSessions({
  status: 'running',
  excludeThreadId: 'thread-source'
})
assert.deepEqual(
  running.map((thread) => thread.threadId),
  ['thread-api']
)

const watchResult = await orchestrator.watchThread({
  threadId: 'thread-api',
  activeTask
})
assert.equal(watchResult.watching, true)
await new Promise((resolve) => setImmediate(resolve))
statuses.set('thread-api', {
  status: 'ended',
  at: 1200,
  reason: 'test.completed'
})
await orchestrator.checkNow()
assert.equal(notifications.length, 1)
assert.equal(notifications[0].text, '目标 Codex 的最终回复')
assert.deepEqual(
  orchestrator.resolveReplyContext({
    connectionId: 'work',
    chatId: 'oc_test',
    parentMessageId: 'om_watch_notification'
  }),
  {
    threadId: 'thread-api',
    title: '修复 api-go',
    cwd: '/tmp/api-go',
    watchId: watchResult.watchId
  }
)

statuses.set('thread-api', {
  status: 'running',
  at: 1300,
  reason: 'test.external_running'
})
const queued = await orchestrator.sendMessage({
  threadId: 'thread-api',
  message: '继续检查测试',
  activeTask
})
assert.equal(queued.delivery, 'queued_until_current_turn_completes')
assert.equal(dispatches.length, 0)
await new Promise((resolve) => setImmediate(resolve))
statuses.set('thread-api', {
  status: 'ended',
  at: 1400,
  reason: 'test.external_completed'
})
await orchestrator.checkNow()
assert.deepEqual(dispatches, [{
  threadId: 'thread-api',
  message: '继续检查测试'
}])

const toolResult = await orchestrator.handleToolCall({
  threadId: 'thread-source',
  turnId: 'turn-source',
  callId: 'call-list',
  tool: 'list_codex_sessions',
  arguments: {
    status: 'all',
    query: 'pophie'
  }
})
assert.equal(toolResult.success, true)
assert.equal(
  JSON.parse(toolResult.contentItems[0].text).sessions[0].threadId,
  'thread-idle'
)

orchestrator.stop()
console.log('codex session orchestrator assertions passed')
