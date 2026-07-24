import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  normalizeCodexMainConfig,
  publicCodexMainConfig,
  buildTurnSandboxPolicy,
  buildCodexTaskInput,
  extractThreadMessages,
  normalizeStoredSessions,
  createFeishuSessionId,
  buildFeishuSessionTitle,
  CodexMainSessionService,
  createFeishuBridgeManager
} = require('../electron/ipc/codex-main-session.js')
const {
  createAttachmentWorkspace,
  cleanupAttachmentWorkspace,
  collectOutboxAttachments
} = require('../electron/ipc/codex-feishu-attachments.js')

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

const notificationService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
let completedNotificationResult = null
const realtimeNotificationItems = []
const notificationTask = {
  jobId: 'job-multiple-replies',
  sessionId: 'main',
  threadId: 'thread-multiple-replies',
  turnId: 'turn-multiple-replies',
  finalText: '',
  agentMessageIds: new Set(),
  forwardedAgentMessageIds: new Set(),
  onAgentMessage: (item) => {
    realtimeNotificationItems.push(item)
  },
  resolve: (result) => {
    completedNotificationResult = result
  },
  reject: (error) => {
    throw error
  }
}
notificationService.activeTasks.set('main', notificationTask)
notificationService.activeTasksByThreadId.set(
  notificationTask.threadId,
  notificationTask
)
for (const [id, text] of [
  ['agent-progress-1', '我会先生成图片。'],
  ['agent-progress-2', '图片已经生成，正在整理。'],
  ['agent-final', '图片已随消息发送。']
]) {
  notificationService.handleNotification('item/completed', {
    threadId: notificationTask.threadId,
    item: { id, type: 'agentMessage', text }
  })
}
assert.deepEqual(
  realtimeNotificationItems,
  [
    { id: 'agent-progress-1', text: '我会先生成图片。' },
    { id: 'agent-progress-2', text: '图片已经生成，正在整理。' },
    { id: 'agent-final', text: '图片已随消息发送。' }
  ],
  'completed Codex messages should be forwarded before the whole turn completes'
)
notificationService.handleNotification('turn/completed', {
  threadId: notificationTask.threadId,
  turn: {
    id: notificationTask.turnId,
    status: 'completed',
    items: [
      {
        id: 'agent-progress-1',
        type: 'agentMessage',
        text: '我会先生成图片。'
      },
      {
        id: 'agent-progress-2',
        type: 'agentMessage',
        text: '图片已经生成，正在整理。'
      },
      {
        id: 'agent-final',
        type: 'agentMessage',
        text: '图片已随消息发送。'
      }
    ]
  }
})
assert.deepEqual(
  completedNotificationResult.messages,
  [
    '我会先生成图片。',
    '图片已经生成，正在整理。',
    '图片已随消息发送。'
  ],
  'all Codex agent messages from one turn should be preserved in order'
)
assert.deepEqual(
  completedNotificationResult.messageItems,
  realtimeNotificationItems
)
assert.equal(
  completedNotificationResult.text,
  '我会先生成图片。\n\n图片已经生成，正在整理。\n\n图片已随消息发送。'
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

const legacyToolStore = new MemoryStore({
  'codex-main-sessions-v2': [{
    id: 'main',
    title: '主会话',
    source: 'ui',
    threadId: 'thread-without-tools'
  }]
})
const legacyToolService = new CodexMainSessionService({
  store: legacyToolStore,
  getMainWindow: () => null
})
legacyToolService.startServer = async () => true
const legacyToolRequests = []
legacyToolService.request = async (method, params) => {
  legacyToolRequests.push({ method, params })
  if (method === 'thread/start') {
    return { thread: { id: 'thread-with-tools' } }
  }
  return {}
}
assert.equal(
  await legacyToolService.ensureThread('main'),
  'thread-with-tools'
)
assert.equal(
  legacyToolRequests.some(({ method }) => method === 'thread/resume'),
  false,
  'legacy OpenGit main threads should be replaced because dynamic tools can only be registered at thread/start'
)
assert.deepEqual(legacyToolRequests[0], {
  method: 'thread/archive',
  params: { threadId: 'thread-without-tools' }
})
assert.deepEqual(
  legacyToolRequests.find(({ method }) => method === 'thread/start')
    .params.dynamicTools.map((tool) => tool.name),
  [
    'list_codex_sessions',
    'send_codex_session_message',
    'monitor_codex_session',
    'cancel_codex_session_monitor'
  ]
)

const steerService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
steerService.startServer = async () => true
const steerRequests = []
steerService.request = async (method, params) => {
  steerRequests.push({ method, params })
  return method === 'turn/steer'
    ? { turnId: 'turn-target' }
    : {}
}
steerService.activeTasksByThreadId.set('thread-target', {
  turnId: 'turn-target'
})
assert.equal(
  (
    await steerService.dispatchCodexThreadMessage({
      thread: { id: 'thread-target', cwd: '/tmp/api-go' },
      message: '继续检查',
      state: { status: 'running' }
    })
  ).delivery,
  'steered_active_turn'
)
assert.deepEqual(steerRequests[0], {
  method: 'turn/steer',
  params: {
    threadId: 'thread-target',
    expectedTurnId: 'turn-target',
    input: [{ type: 'text', text: '继续检查' }]
  }
})

const deletionStore = new MemoryStore()
const deletionService = new CodexMainSessionService({
  store: deletionStore,
  getMainWindow: () => null
})
const deletionRequests = []
deletionService.startServer = async () => true
deletionService.request = async (method, params) => {
  deletionRequests.push({ method, params })
  return {}
}
const removableSession = deletionService.createNewSession()
deletionService.getSession(removableSession.id).threadId = 'thread-removable'
const removalResult = await deletionService.deleteSession(removableSession.id)
assert.equal(removalResult.deleted, true)
assert.equal(removalResult.reset, false)
assert.equal(deletionService.getSession(removableSession.id), null)
assert.equal(deletionService.activeSessionId, 'main')
assert.deepEqual(deletionRequests[0], {
  method: 'thread/delete',
  params: { threadId: 'thread-removable' }
})

deletionService.getSession('main').threadId = 'thread-main'
deletionService.loadedSessionIds.add('main')
const mainRemovalResult = await deletionService.deleteSession('main')
assert.equal(mainRemovalResult.reset, true)
assert.equal(deletionService.getSession('main').threadId, '')
assert.equal(deletionService.loadedSessionIds.has('main'), false)
assert.deepEqual(deletionRequests[1], {
  method: 'thread/delete',
  params: { threadId: 'thread-main' }
})

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
      sendText: async (chatId, text, options) => ({
        messageId: `${chatId}:${text}:${options.replyToMessageId}`
      }),
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
  chatType: 'p2p',
  attachments: [{
    kind: 'file',
    name: 'input.txt',
    path: '/tmp/input.txt'
  }],
  attachmentWorkspace: {
    rootDir: '/tmp/attachment-task',
    outboxDir: '/tmp/attachment-task/outbox'
  }
})
assert.equal(routedInstruction.metadata.connectionId, 'personal')
assert.equal(routedInstruction.metadata.connectionName, '个人飞书')
assert.equal(routedInstruction.attachments[0].name, 'input.txt')
assert.equal(
  routedInstruction.attachmentWorkspace.outboxDir,
  '/tmp/attachment-task/outbox'
)
assert.deepEqual(
  await bridgeManager.sendText(
    'personal',
    'oc_personal',
    '监控完成',
    { replyToMessageId: 'om_request' }
  ),
  { messageId: 'oc_personal:监控完成:om_request' }
)
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
  buildTurnSandboxPolicy(
    { sandboxMode: 'workspace-write' },
    '/tmp/demo',
    ['/tmp/opengit-attachment']
  ),
  {
    type: 'workspaceWrite',
    writableRoots: ['/tmp/demo', '/tmp/opengit-attachment'],
    networkAccess: true
  }
)
assert.deepEqual(
  buildTurnSandboxPolicy({ sandboxMode: 'danger-full-access' }, '/tmp/demo'),
  { type: 'dangerFullAccess' }
)

const attachmentWorkspace = createAttachmentWorkspace('main-session-test')
const inputImagePath = `${attachmentWorkspace.inboxDir}/input.png`
const inputFilePath = `${attachmentWorkspace.inboxDir}/notes.txt`
fs.writeFileSync(inputImagePath, 'image')
fs.writeFileSync(inputFilePath, 'notes')
const taskInput = buildCodexTaskInput({
  source: 'feishu',
  text: '分析附件并返回报告',
  metadata: {
    monitorContext: {
      threadId: 'thread-api',
      title: '修复 api-go',
      cwd: '/tmp/api-go'
    }
  },
  attachments: [
    {
      kind: 'image',
      name: 'input.png',
      path: inputImagePath,
      mimeType: 'image/png',
      size: 5
    },
    {
      kind: 'file',
      name: 'notes.txt',
      path: inputFilePath,
      mimeType: 'text/plain',
      size: 5
    }
  ],
  attachmentWorkspace
})
assert.equal(taskInput.length, 2)
assert.equal(taskInput[1].type, 'localImage')
assert.equal(taskInput[1].path, inputImagePath)
assert.match(taskInput[0].text, /notes\.txt/)
assert.match(taskInput[0].text, new RegExp(attachmentWorkspace.outboxDir))
assert.match(taskInput[0].text, /threadId：thread-api/)
assert.match(taskInput[0].text, /send_codex_session_message/)

const reportPath = `${attachmentWorkspace.outboxDir}/report.pdf`
const imagePath = `${attachmentWorkspace.outboxDir}/preview.png`
fs.writeFileSync(reportPath, 'report')
fs.writeFileSync(imagePath, 'preview')
const outsidePath = '/etc/hosts'
const symlinkPath = `${attachmentWorkspace.outboxDir}/unsafe-link`
fs.symlinkSync(outsidePath, symlinkPath)
const collectedOutbox = collectOutboxAttachments(attachmentWorkspace)
assert.deepEqual(
  collectedOutbox.attachments.map((item) => [item.name, item.kind]),
  [
    ['preview.png', 'image'],
    ['report.pdf', 'file']
  ]
)
assert.equal(collectedOutbox.rejected[0].name, 'unsafe-link')
assert.equal(cleanupAttachmentWorkspace(attachmentWorkspace), true)
assert.equal(fs.existsSync(attachmentWorkspace.rootDir), false)

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
