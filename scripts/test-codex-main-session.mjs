import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  normalizeCodexMainConfig,
  publicCodexMainConfig,
  buildTurnSandboxPolicy,
  extractThreadMessages,
  normalizeStoredSessions,
  createFeishuSessionId,
  buildFeishuSessionTitle,
  CodexMainSessionService,
  createFeishuBridgeManager
} = require('../electron/ipc/codex-main-session.js')

const previousConfig = normalizeCodexMainConfig({
  workingDirectory: '/tmp/old',
  sandboxMode: 'workspace-write',
  approvalPolicy: 'on-request',
  reasoningEffort: 'medium',
  feishu: {
    connections: [
      {
        id: 'work',
        name: '工作飞书',
        enabled: true,
        appId: 'cli_0123456789abcdef',
        appSecret: 'existing-secret',
        allowedChatIds: ['oc_chat_1'],
        allowedSenderIds: ['ou_user_1']
      },
      {
        id: 'personal',
        name: '个人飞书',
        enabled: false,
        appId: 'cli_fedcba9876543210',
        appSecret: 'personal-secret',
        allowedChatIds: [],
        allowedSenderIds: []
      }
    ]
  }
})

const migratedLegacyConfig = normalizeCodexMainConfig({
  feishu: {
    enabled: true,
    appId: 'cli_0011223344556677',
    appSecret: 'legacy-secret',
    allowedChatIds: ['oc_legacy'],
    allowedSenderIds: ['ou_legacy']
  }
})
assert.equal(migratedLegacyConfig.feishu.connections.length, 1)
assert.equal(migratedLegacyConfig.feishu.connections[0].id, 'default')
assert.equal(migratedLegacyConfig.feishu.connections[0].appSecret, 'legacy-secret')

const updatedConfig = normalizeCodexMainConfig({
  workingDirectory: '/tmp/new',
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
  reasoningEffort: 'high',
  feishu: {
    connections: [
      {
        id: 'work',
        name: '工作飞书',
        enabled: true,
        appId: 'cli_0123456789abcdef',
        appSecret: '',
        allowedChatIds: 'oc_chat_1\noc_chat_1,oc_chat_2',
        allowedSenderIds: ['ou_user_1', '']
      },
      {
        id: 'personal',
        name: '个人飞书',
        enabled: true,
        appId: 'cli_fedcba9876543210',
        appSecret: '',
        allowedChatIds: [],
        allowedSenderIds: []
      }
    ]
  }
}, previousConfig)

assert.equal(
  updatedConfig.feishu.connections[0].appSecret,
  'existing-secret',
  'saving the redacted renderer config must preserve the stored App Secret'
)
assert.deepEqual(
  updatedConfig.feishu.connections[0].allowedChatIds,
  ['oc_chat_1', 'oc_chat_2'],
  'allowlists should be trimmed and deduplicated'
)
assert.equal(
  updatedConfig.feishu.connections[1].appSecret,
  'personal-secret',
  'each Feishu connection must preserve its own redacted App Secret'
)

const publicConfig = publicCodexMainConfig(updatedConfig)
assert.equal(publicConfig.feishu.connections[0].appSecret, '')
assert.equal(publicConfig.feishu.connections[0].hasAppSecret, true)
assert.equal(publicConfig.feishu.connections[1].appSecret, '')
assert.equal(publicConfig.feishu.connections[1].hasAppSecret, true)
assert.equal(
  JSON.stringify(publicConfig).includes('existing-secret')
    || JSON.stringify(publicConfig).includes('personal-secret'),
  false,
  'the renderer-facing config must never include any App Secret'
)

const sessions = normalizeStoredSessions([
  {
    id: 'feishu:work:oc_same',
    source: 'feishu',
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_same',
    chatType: 'group',
    threadId: 'thread-work'
  },
  {
    id: 'feishu:personal:oc_same',
    source: 'feishu',
    connectionId: 'personal',
    connectionName: '个人飞书',
    chatId: 'oc_same',
    chatType: 'group',
    threadId: 'thread-personal'
  }
], 'legacy-thread-must-not-migrate')

assert.equal(sessions.length, 3)
assert.equal(
  sessions.find((session) => session.id === 'main').threadId,
  '',
  'the legacy single main thread must not be migrated'
)
assert.equal(createFeishuSessionId('oc_same', 'work'), 'feishu:work:oc_same')
assert.equal(
  buildFeishuSessionTitle('group', 'oc_1234567890', '工作飞书'),
  '飞书群聊 · 工作飞书 · 34567890'
)

class MemoryStore {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries))
  }

  get(key, fallback) {
    return this.values.has(key) ? this.values.get(key) : fallback
  }

  set(key, value) {
    this.values.set(key, structuredClone(value))
  }

  delete(key) {
    this.values.delete(key)
  }
}

const memoryStore = new MemoryStore({
  'codex-main-session-thread-id-v1': 'legacy-thread-must-be-discarded'
})
const service = new CodexMainSessionService({
  store: memoryStore,
  getMainWindow: () => null
})
assert.equal(service.getSession('main').threadId, '')
assert.equal(
  memoryStore.values.has('codex-main-session-thread-id-v1'),
  false,
  'the deprecated single-session thread key should be removed'
)

const workChat = service.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_same',
  chatType: 'group'
})
const personalChat = service.getOrCreateFeishuSession({
  connectionId: 'personal',
  connectionName: '个人飞书',
  chatId: 'oc_same',
  chatType: 'group'
})
assert.notEqual(workChat.id, personalChat.id)
assert.equal(workChat.connectionId, 'work')
assert.equal(personalChat.connectionId, 'personal')
assert.equal(service.getState().sessions.length, 3)

let startedThreadCount = 0
service.startServer = async () => true
service.request = async (method) => {
  if (method === 'thread/start') {
    startedThreadCount += 1
    return { thread: { id: `thread-${startedThreadCount}` } }
  }
  return {}
}
const [workThreadId, personalThreadId] = await Promise.all([
  service.ensureThread(workChat.id),
  service.ensureThread(personalChat.id)
])
assert.notEqual(
  workThreadId,
  personalThreadId,
  'different Feishu configurations must receive different Codex threads'
)

const bridgeOptions = []
let bridgeStartCount = 0
let bridgeStopCount = 0
const bridgeService = {
  getConfig: () => updatedConfig,
  enqueueInstruction: (payload) => payload,
  broadcastState: () => {}
}
const bridgeManager = createFeishuBridgeManager({
  service: bridgeService,
  createFeishuBridge: (options) => {
    bridgeOptions.push(options)
    return {
      start: async () => {
        bridgeStartCount += 1
      },
      stop: async () => {
        bridgeStopCount += 1
      },
      getStatus: () => ({
        running: true,
        status: 'connected',
        error: ''
      })
    }
  },
  safeLog: () => {},
  safeError: () => {}
})
await bridgeManager.start()
assert.equal(bridgeStartCount, 2)
assert.equal(bridgeManager.getStatus().connections.length, 2)
assert.equal(bridgeManager.getStatus().status, 'connected')
const routedInstruction = await bridgeOptions[1].onInstruction({
  text: '检查状态',
  chatId: 'oc_personal',
  chatType: 'p2p'
})
assert.equal(routedInstruction.metadata.connectionId, 'personal')
assert.equal(routedInstruction.metadata.connectionName, '个人飞书')
await bridgeManager.stop()
assert.equal(bridgeStopCount, 2)

assert.deepEqual(
  buildTurnSandboxPolicy({ sandboxMode: 'read-only' }, '/tmp/demo'),
  { type: 'readOnly', networkAccess: true }
)
assert.deepEqual(
  buildTurnSandboxPolicy({ sandboxMode: 'workspace-write' }, '/tmp/demo'),
  {
    type: 'workspaceWrite',
    writableRoots: ['/tmp/demo'],
    networkAccess: true
  }
)
assert.deepEqual(
  buildTurnSandboxPolicy({ sandboxMode: 'danger-full-access' }, '/tmp/demo'),
  { type: 'dangerFullAccess' }
)

const history = extractThreadMessages({
  turns: [
    {
      startedAt: 100,
      completedAt: 101,
      items: [
        {
          id: 'user-1',
          type: 'userMessage',
          content: [{ type: 'text', text: '[来自飞书的指令]\n检查构建' }]
        },
        {
          id: 'agent-1',
          type: 'agentMessage',
          text: '构建已通过。'
        }
      ]
    }
  ]
})

assert.deepEqual(
  history.map(({ id, role, source, text }) => ({ id, role, source, text })),
  [
    {
      id: 'user-1',
      role: 'user',
      source: 'feishu',
      text: '[来自飞书的指令]\n检查构建'
    },
    {
      id: 'agent-1',
      role: 'assistant',
      source: 'codex',
      text: '构建已通过。'
    }
  ]
)
assert.equal(history[0].createdAt, 100000)

console.log('codex main session assertions passed')
