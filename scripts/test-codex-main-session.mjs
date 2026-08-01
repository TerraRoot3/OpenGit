import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  normalizeCodexMainConfig,
  publicCodexMainConfig,
  buildTurnSandboxPolicy,
  buildCodexTaskInput,
  isCodexCapacityError,
  selectCodexCapacityModelPlan,
  extractThreadMessages,
  normalizeStoredSessions,
  normalizeProjectBinding,
  createFeishuSessionId,
  buildFeishuSessionTitle,
  parseFeishuMonitorControlIntent,
  CodexMainSessionService,
  createFeishuBridgeManager,
  registerCodexPowerMonitorHandlers,
  MAIN_SESSION_INSTRUCTIONS
} = require('../electron/ipc/codex-main-session.js')
const {
  createAttachmentWorkspace,
  cleanupAttachmentWorkspace,
  collectOutboxAttachments
} = require('../electron/ipc/codex-feishu-attachments.js')

assert.match(
  MAIN_SESSION_INSTRUCTIONS,
  /当前\/刚才\/这个任务.*get_open_git_task_status/,
  'task-status queries must stay in the OpenGit coordinator'
)
assert.match(
  MAIN_SESSION_INSTRUCTIONS,
  /所有\/全部\/全局.*list_running_codex_tasks/,
  'global Codex task queries must use the global read-only status tool'
)
assert.match(
  MAIN_SESSION_INSTRUCTIONS,
  /不得仅因为当前会话绑定了项目、消息提到项目名或出现“查看\/检查”就分发/,
  'a project binding or generic inspection wording must not force dispatch'
)
assert.match(
  MAIN_SESSION_INSTRUCTIONS,
  /只有已经判定为项目工作指令/,
  'project binding should only provide a default target after semantic classification'
)
assert.equal(
  isCodexCapacityError({
    codexErrorInfo: 'serverOverloaded',
    message: 'Selected model is at capacity. Please try a different model.'
  }),
  true
)
assert.equal(
  isCodexCapacityError({
    codexErrorInfo: 'usageLimitExceeded',
    message: 'Usage limit exceeded'
  }),
  false,
  'usage limits must not trigger automatic model fallback'
)
assert.deepEqual(
  selectCodexCapacityModelPlan([
    {
      id: 'gpt-5.6-sol',
      model: 'gpt-5.6-sol',
      isDefault: true,
      hidden: false
    },
    {
      id: 'gpt-5.6-terra',
      model: 'gpt-5.6-terra',
      isDefault: false,
      hidden: false
    }
  ]),
  {
    primaryModel: 'gpt-5.6-sol',
    fallbackModel: 'gpt-5.6-terra',
    fallbackModels: ['gpt-5.6-terra']
  }
)

const previousConfig = normalizeCodexMainConfig({
  workingDirectory: '/tmp/old',
  sandboxMode: 'workspace-write',
  approvalPolicy: 'on-request',
  reasoningEffort: 'medium',
  feishu: {
    autoMonitor: {
      enabled: true,
      targetSessionId: 'feishu:work:oc_private_work',
      stallMinutes: 15
    },
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
assert.deepEqual(
  updatedConfig.feishu.autoMonitor,
  {
    enabled: true,
    targetSessionId: 'feishu:work:oc_private_work',
    stallMinutes: 15
  },
  'saving unrelated settings must preserve the off-screen monitor config'
)
assert.equal(migratedLegacyConfig.feishu.autoMonitor.enabled, false)

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
assert.equal(
  publicConfig.feishu.autoMonitor.enabled,
  true
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
assert.deepEqual(
  normalizeProjectBinding({
    projectQuery: 'content_studio',
    cwd: '/tmp',
    title: 'Content Studio',
    boundAt: 123
  }),
  {
    projectQuery: 'content_studio',
    cwd: '/tmp',
    title: 'Content Studio',
    boundAt: 123
  }
)
for (const text of [
  '帮我盯一下任务',
  '继续盯吧',
  '也跟踪一下',
  '监控',
  '帮我监控和同步',
  '帮我监控其他 Codex 任务，有进展同步到这里',
  '帮我监控其他任务，有进展同步到当前群聊',
  '有进展你要通知我',
  '有新进展同步我'
]) {
  assert.equal(
    parseFeishuMonitorControlIntent(text),
    'start',
    `explicit start command should be recognized: ${text}`
  )
}
for (const text of [
  '监控先停掉吧',
  '停止监控',
  '不用再盯了'
]) {
  assert.equal(
    parseFeishuMonitorControlIntent(text),
    'stop',
    `explicit stop command should be recognized: ${text}`
  )
}
for (const text of [
  '监控状态怎么样',
  '还在监控吗',
  '你有在监控吗'
]) {
  assert.equal(
    parseFeishuMonitorControlIntent(text),
    'status',
    `explicit status command should be recognized: ${text}`
  )
}
for (const text of [
  '这个监控，比方说我让你在这个会话里监控和同步，现在支持吗',
  '帮我优化监控功能',
  '分析一下任务监控的实现'
]) {
  assert.equal(
    parseFeishuMonitorControlIntent(text),
    '',
    `discussion should not mutate monitoring state: ${text}`
  )
}

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

const capacityRetryLogs = []
const capacityRetryService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null,
  safeLog: (...args) => capacityRetryLogs.push(args.join(' ')),
  capacityRetryDelaysMs: [0, 0],
  capacityFallbackDelayMs: 0
})
capacityRetryService.startServer = async () => true
const capacityRetryRequests = []
let capacityTurnSequence = 0
capacityRetryService.request = async (method, params) => {
  capacityRetryRequests.push({ method, params })
  if (method === 'thread/start') {
    return { thread: { id: 'thread-capacity-parent' } }
  }
  if (method === 'thread/fork') {
    return { thread: { id: 'thread-capacity-worker' } }
  }
  if (method === 'model/list') {
    return {
      data: [
        {
          id: 'gpt-5.6-sol',
          model: 'gpt-5.6-sol',
          isDefault: true,
          hidden: false
        },
        {
          id: 'gpt-5.6-terra',
          model: 'gpt-5.6-terra',
          isDefault: false,
          hidden: false
        },
        {
          id: 'gpt-5.6-luna',
          model: 'gpt-5.6-luna',
          isDefault: false,
          hidden: false
        }
      ]
    }
  }
  if (method === 'turn/start') {
    capacityTurnSequence += 1
    return {
      turn: {
        id: `turn-capacity-${capacityTurnSequence}`,
        status: 'inProgress'
      }
    }
  }
  return {}
}
const capacityTask = capacityRetryService.enqueueInstruction({
  text: '检查当前任务状态',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_capacity',
    chatType: 'p2p'
  }
})
const waitForCapacityTurnCount = async (expectedCount) => {
  for (let index = 0; index < 40; index += 1) {
    const count = capacityRetryRequests
      .filter(({ method }) => method === 'turn/start')
      .length
    if (count >= expectedCount) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail(`timed out waiting for ${expectedCount} capacity turn attempts`)
}
const failCapacityTurn = (sequence, error = {
  message: 'Selected model is at capacity. Please try a different model.',
  codexErrorInfo: 'serverOverloaded'
}) => {
  capacityRetryService.handleNotification('turn/completed', {
    threadId: 'thread-capacity-worker',
    turn: {
      id: `turn-capacity-${sequence}`,
      status: 'failed',
      error,
      items: []
    }
  })
}
await waitForCapacityTurnCount(1)
failCapacityTurn(1)
await waitForCapacityTurnCount(2)
failCapacityTurn(2)
await waitForCapacityTurnCount(3)
failCapacityTurn(3)
await waitForCapacityTurnCount(4)
failCapacityTurn(4)
await waitForCapacityTurnCount(5)
capacityRetryService.handleNotification('item/completed', {
  threadId: 'thread-capacity-worker',
  item: {
    id: 'agent-capacity-result',
    type: 'agentMessage',
    text: '降级模型执行成功。'
  }
})
capacityRetryService.handleNotification('turn/completed', {
  threadId: 'thread-capacity-worker',
  turn: {
    id: 'turn-capacity-5',
    status: 'completed',
    items: []
  }
})
const capacityResult = await capacityTask
assert.equal(capacityResult.text, '降级模型执行成功。')
const capacityTurnRequests = capacityRetryRequests
  .filter(({ method }) => method === 'turn/start')
assert.deepEqual(
  capacityTurnRequests.map(({ params }) => params.model),
  [
    'gpt-5.6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna'
  ],
  'capacity failures should retry the default model twice and continue through fallbacks'
)
assert.equal(
  capacityTurnRequests.every(({ params }) => params.serviceTier == null),
  true,
  'capacity recovery must not enable the priority service tier'
)
assert.equal(
  capacityRetryRequests.filter(({ method }) => method === 'model/list').length,
  1,
  'the model plan should be reused for all retries of one task'
)
assert.equal(
  capacityRetryLogs.some((message) => message.includes('降级到 gpt-5.6-terra')),
  true
)
assert.equal(
  capacityRetryLogs.some((message) => message.includes('降级到 gpt-5.6-luna')),
  true
)

const projectCapacityTask = capacityRetryService.executeCodexProjectTask({
  threadId: 'thread-project-capacity',
  cwd: os.tmpdir(),
  task: '继续处理项目任务',
  createNew: false
})
const failProjectCapacityTurn = (sequence) => {
  capacityRetryService.handleNotification('turn/completed', {
    threadId: 'thread-project-capacity',
    turn: {
      id: `turn-capacity-${sequence}`,
      status: 'failed',
      error: {
        message: 'Selected model is at capacity. Please try a different model.',
        codexErrorInfo: 'serverOverloaded'
      },
      items: []
    }
  })
}
await waitForCapacityTurnCount(6)
failProjectCapacityTurn(6)
await waitForCapacityTurnCount(7)
failProjectCapacityTurn(7)
await waitForCapacityTurnCount(8)
failProjectCapacityTurn(8)
await waitForCapacityTurnCount(9)
failProjectCapacityTurn(9)
await waitForCapacityTurnCount(10)
capacityRetryService.handleNotification('item/completed', {
  threadId: 'thread-project-capacity',
  item: {
    id: 'agent-project-capacity-result',
    type: 'agentMessage',
    text: '项目会话降级成功。'
  }
})
capacityRetryService.handleNotification('turn/completed', {
  threadId: 'thread-project-capacity',
  turn: {
    id: 'turn-capacity-10',
    status: 'completed',
    items: []
  }
})
const projectCapacityResult = await projectCapacityTask
assert.equal(projectCapacityResult.text, '项目会话降级成功。')
assert.deepEqual(
  capacityRetryRequests
    .filter(({ method }) => method === 'turn/start')
    .slice(-5)
    .map(({ params }) => params.model),
  [
    'gpt-5.6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna'
  ],
  'managed project turns must use the same retry and fallback chain'
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
const workP2p = service.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_private_work',
  chatType: 'p2p'
})
const personalP2p = service.getOrCreateFeishuSession({
  connectionId: 'personal',
  connectionName: '个人飞书',
  chatId: 'oc_private_personal',
  chatType: 'p2p'
})
assert.notEqual(workChat.id, personalChat.id)
assert.equal(workChat.connectionId, 'work')
assert.equal(personalChat.connectionId, 'personal')
assert.equal(service.getState().sessions.length, 5)
service.config = updatedConfig
assert.deepEqual(
  service.getProactiveNotificationRoutes(),
  [{
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_private_work',
    sessionId: workP2p.id,
    stallMinutes: 15
  }],
  'automatic monitoring should use only the explicitly selected Feishu session'
)
service.config = structuredClone(updatedConfig)
service.config.feishu.autoMonitor.targetSessionId = ''
assert.deepEqual(
  service.getProactiveNotificationRoutes(),
  [],
  'multiple eligible Feishu sessions must not be guessed'
)
assert.match(
  service.getAutoMonitorState().reason,
  /多个/,
  'the renderer should explain why an explicit Feishu target is required'
)
service.config.feishu.connections[1].enabled = false
assert.deepEqual(
  service.getProactiveNotificationRoutes(),
  [],
  'a group and P2P session on one connection still require an explicit target'
)
service.config.feishu.autoMonitor.targetSessionId = workChat.id
assert.deepEqual(
  service.getProactiveNotificationRoutes(),
  [{
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_same',
    sessionId: workChat.id,
    stallMinutes: 15
  }],
  'an explicitly selected group session should receive monitoring notifications'
)

service.config = structuredClone(updatedConfig)
const monitorCalls = []
service.setProactiveNotificationMonitor({
  start: async () => {
    monitorCalls.push(['start'])
    return true
  },
  stop: (options) => {
    monitorCalls.push(['stop', options])
  }
})
assert.equal(await service.handleScreenLock(), true)
assert.equal(service.getAutoMonitorState().status, 'monitoring')
assert.match(service.getAutoMonitorState().reason, /正在监控/)
assert.equal(service.handleScreenUnlock(), true)
assert.deepEqual(monitorCalls, [
  ['start'],
  ['stop', { rebaseline: true }]
])
assert.equal(service.getAutoMonitorState().status, 'paused')
assert.match(service.getAutoMonitorState().reason, /锁屏后/)

service.config.feishu.autoMonitor.enabled = false
const disabledMonitorCallCount = monitorCalls.length
assert.equal(await service.handleScreenLock(), false)
assert.equal(service.handleScreenUnlock(), false)
assert.equal(
  monitorCalls.length,
  disabledMonitorCallCount,
  'lock and unlock events must not control monitoring while the switch is disabled'
)

service.config = structuredClone(updatedConfig)
service.config.feishu.autoMonitor.targetSessionId = 'feishu:missing:session'
const missingTargetStartCount = monitorCalls
  .filter(([action]) => action === 'start').length
assert.equal(await service.handleScreenLock(), false)
assert.equal(
  monitorCalls.filter(([action]) => action === 'start').length,
  missingTargetStartCount,
  'an invalid Feishu target must safely suppress delivery'
)
assert.equal(service.getAutoMonitorState().status, 'no-target')
assert.match(service.getAutoMonitorState().reason, /重新选择/)

const groupOnlyService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
groupOnlyService.config = normalizeCodexMainConfig({
  feishu: {
    autoMonitor: {
      enabled: true,
      targetSessionId: '',
      stallMinutes: 20
    },
    connections: [{
      id: 'work',
      name: '工作飞书',
      enabled: true,
      appId: 'cli_group_only',
      appSecret: 'group-only-secret'
    }]
  }
})
const groupOnlySession = groupOnlyService.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_group_only',
  chatType: 'group'
})
assert.deepEqual(groupOnlyService.getProactiveNotificationRoutes(), [{
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_group_only',
  sessionId: groupOnlySession.id,
  stallMinutes: 20
}])
assert.equal(groupOnlyService.getAutoMonitorState().status, 'paused')
assert.match(groupOnlyService.getAutoMonitorState().reason, /亮屏/)

const commandStore = new MemoryStore({
  'codex-main-session-config-v1': normalizeCodexMainConfig({
    feishu: {
      connections: [{
        id: 'work',
        name: '工作飞书',
        enabled: true,
        appId: 'cli_monitor_control',
        appSecret: 'monitor-control-secret'
      }]
    }
  })
})
const commandService = new CodexMainSessionService({
  store: commandStore,
  getMainWindow: () => null
})
const commandMonitorCalls = []
commandService.setProactiveNotificationMonitor({
  start: async () => {
    commandMonitorCalls.push(['start'])
    return true
  },
  stop: (options) => {
    commandMonitorCalls.push(['stop', options])
  }
})
const commandPayload = {
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_monitor_group',
  chatType: 'group'
}
const commandStartResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '帮我盯一下任务'
})
const commandSessionId = createFeishuSessionId(
  commandPayload.chatId,
  commandPayload.connectionId
)
assert.equal(commandStartResult.handled, true)
assert.equal(commandStartResult.action, 'start')
assert.match(commandStartResult.text, /绑定到当前会话/)
assert.match(commandStartResult.text, /当前亮屏/)
assert.equal(commandService.getConfig().feishu.autoMonitor.enabled, true)
assert.equal(
  commandService.getConfig().feishu.autoMonitor.targetSessionId,
  commandSessionId
)
assert.deepEqual(commandMonitorCalls, [
  ['stop', { rebaseline: true }]
])
assert.equal(commandService.getAutoMonitorState().status, 'paused')

const commandStatusResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '监控状态'
})
assert.equal(commandStatusResult.action, 'status')
assert.match(commandStatusResult.text, /已绑定当前会话/)
assert.match(commandStatusResult.text, /亮屏状态下已暂停/)

commandService.screenLocked = true
const commandLockedStartResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '继续盯吧'
})
assert.match(commandLockedStartResult.text, /已经开始监控/)
assert.equal(commandService.getAutoMonitorState().status, 'monitoring')
assert.deepEqual(commandMonitorCalls.at(-1), ['start'])

const commandStopResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '监控先停掉吧'
})
assert.equal(commandStopResult.action, 'stop')
assert.match(commandStopResult.text, /已停止自动监控/)
assert.equal(commandService.getConfig().feishu.autoMonitor.enabled, false)
assert.deepEqual(commandMonitorCalls.at(-1), ['stop', { disabled: true }])
assert.equal(
  commandService.getConfig().feishu.connections[0].appSecret,
  'monitor-control-secret',
  'chat commands must preserve the stored Feishu App Secret'
)

const commandStoppedStatusResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '还在监控吗'
})
assert.match(commandStoppedStatusResult.text, /已关闭/)
const discussionResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  text: '这个监控现在支持在会话里控制吗'
})
assert.equal(discussionResult, null)
const unsupportedChatCommandResult = await commandService.handleFeishuMonitorControl({
  ...commandPayload,
  chatId: 'oc_monitor_unknown',
  chatType: 'topic',
  text: '开始监控'
})
assert.equal(unsupportedChatCommandResult.handled, true)
assert.match(unsupportedChatCommandResult.text, /会话类型不支持/)
assert.equal(commandService.getConfig().feishu.autoMonitor.enabled, false)

const fakePowerMonitor = new EventEmitter()
const controllerCalls = []
const unregisterPowerMonitor = registerCodexPowerMonitorHandlers({
  powerMonitor: fakePowerMonitor,
  sessionController: {
    handleScreenLock: async () => {
      controllerCalls.push('lock')
    },
    handleScreenUnlock: (reason) => {
      controllerCalls.push(`unlock:${reason}`)
    },
    scheduleFeishuRestart: (reason) => {
      controllerCalls.push(`restart:${reason}`)
    }
  },
  safeError: () => {}
})
fakePowerMonitor.emit('lock-screen')
await Promise.resolve()
fakePowerMonitor.emit('unlock-screen')
fakePowerMonitor.emit('resume')
assert.deepEqual(controllerCalls, [
  'lock',
  'restart:unlock-screen',
  'unlock:unlock-screen',
  'restart:resume',
  'unlock:resume'
])
unregisterPowerMonitor()
fakePowerMonitor.emit('lock-screen')
fakePowerMonitor.emit('unlock-screen')
fakePowerMonitor.emit('resume')
await Promise.resolve()
assert.equal(
  controllerCalls.length,
  5,
  'unregistering power handlers should stop future lifecycle callbacks'
)

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
    threadId: 'thread-without-project-router'
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
    return { thread: { id: 'thread-with-project-router' } }
  }
  return {}
}
assert.equal(
  await legacyToolService.ensureThread('main'),
  'thread-with-project-router'
)
assert.equal(
  legacyToolRequests.some(({ method }) => method === 'thread/resume'),
  false,
  'legacy main threads must be replaced because dynamic tools are registered at thread/start'
)
assert.deepEqual(legacyToolRequests[0], {
  method: 'thread/archive',
  params: { threadId: 'thread-without-project-router' }
})
assert.deepEqual(
  legacyToolRequests.find(({ method }) => method === 'thread/start')
    .params.dynamicTools.map((tool) => tool.name),
  [
    'find_codex_project_sessions',
    'bind_codex_project',
    'get_codex_project_binding',
    'unbind_codex_project',
    'get_open_git_task_status',
    'list_running_codex_tasks',
    'restart_open_git',
    'dispatch_codex_project_task'
  ]
)

const failedMigrationService = new CodexMainSessionService({
  store: new MemoryStore({
    'codex-main-sessions-v2': [{
      id: 'main',
      title: '主会话',
      source: 'ui',
      threadId: 'thread-migration-must-survive'
    }]
  }),
  getMainWindow: () => null,
  safeError: () => {}
})
failedMigrationService.startServer = async () => true
const failedMigrationRequests = []
failedMigrationService.request = async (method, params) => {
  failedMigrationRequests.push({ method, params })
  if (method === 'thread/archive') throw new Error('archive unavailable')
  if (method === 'thread/start') {
    return { thread: { id: 'thread-must-not-be-created' } }
  }
  return {}
}
await assert.rejects(
  failedMigrationService.ensureThread('main'),
  /无法归档旧会话/
)
assert.equal(
  failedMigrationService.getSession('main').threadId,
  'thread-migration-must-survive',
  'failed tool migration must preserve the old thread reference'
)
assert.equal(
  failedMigrationRequests.some(({ method }) => method === 'thread/start'),
  false,
  'a replacement thread must not be created until the old thread is archived'
)

const scheduledApplicationRestarts = []
const concurrentWorkerStore = new MemoryStore()
const concurrentWorkerService = new CodexMainSessionService({
  store: concurrentWorkerStore,
  getMainWindow: () => null,
  scheduleApplicationRestart: (payload) => {
    scheduledApplicationRestarts.push(payload)
  }
})
const concurrentWorkerChat = concurrentWorkerService.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_parallel_tasks',
  chatType: 'group'
})
concurrentWorkerService.startServer = async () => true
const concurrentWorkerRequests = []
let concurrentWorkerSequence = 0
concurrentWorkerService.request = async (method, params) => {
  concurrentWorkerRequests.push({ method, params })
  if (method === 'thread/start') {
    return { thread: { id: 'thread-feishu-parent' } }
  }
  if (method === 'thread/fork') {
    concurrentWorkerSequence += 1
    return {
      thread: {
        id: `thread-feishu-worker-${concurrentWorkerSequence}`,
        forkedFromId: params.threadId
      }
    }
  }
  if (method === 'turn/start') {
    return {
      turn: {
        id: `turn-${params.threadId}`,
        status: 'inProgress'
      }
    }
  }
  if (method === 'thread/read') {
    return { thread: { id: params.threadId, turns: [] } }
  }
  return {}
}
const firstParallelTask = concurrentWorkerService.enqueueInstruction({
  text: '并行任务一',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_parallel_tasks',
    chatType: 'group'
  }
})
const secondParallelTask = concurrentWorkerService.enqueueInstruction({
  text: '并行任务二',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_parallel_tasks',
    chatType: 'group'
  }
})
for (let index = 0; index < 20; index += 1) {
  if (
    concurrentWorkerRequests.filter(({ method }) => method === 'turn/start')
      .length === 2
  ) break
  await new Promise((resolve) => setTimeout(resolve, 0))
}
const initialForkRequests = concurrentWorkerRequests.filter(
  ({ method }) => method === 'thread/fork'
)
assert.equal(initialForkRequests.length, 2)
assert.equal(
  concurrentWorkerRequests.filter(({ method }) => method === 'thread/start')
    .length,
  1,
  'parallel Feishu tasks should share one parent thread and create worker forks'
)
assert.equal(
  initialForkRequests.every(({ params }) => (
    params.threadId === 'thread-feishu-parent'
    && params.ephemeral === true
  )),
  true,
  'each Feishu task should fork an ephemeral worker from the conversation parent'
)
assert.equal(
  concurrentWorkerService.getActiveTasksForSession(concurrentWorkerChat.id).length,
  2,
  'a second Feishu message must start while the first worker is still running'
)
assert.equal(
  concurrentWorkerService.getSessionQueue(concurrentWorkerChat.id).length,
  0,
  'Feishu workers must not enter the per-session serial queue'
)
const secondParallelTurnInput = concurrentWorkerRequests
  .filter(({ method }) => method === 'turn/start')
  .map(({ params }) => params.input.find((item) => item.type === 'text')?.text || '')
  .find((text) => text.includes('并行任务二')) || ''
assert.match(
  secondParallelTurnInput,
  /用户（该指令仍在另一个子会话执行，尚无结果）：并行任务一/,
  'a new worker should know which earlier instruction is still running'
)

const completeWorker = (threadId, text) => {
  concurrentWorkerService.handleNotification('item/completed', {
    threadId,
    item: {
      id: `agent-${threadId}`,
      type: 'agentMessage',
      text
    }
  })
  concurrentWorkerService.handleNotification('turn/completed', {
    threadId,
    turn: {
      id: `turn-${threadId}`,
      status: 'completed',
      items: []
    }
  })
}
completeWorker('thread-feishu-worker-2', '并行任务二已完成。')
const secondParallelResult = await secondParallelTask
assert.equal(secondParallelResult.text, '并行任务二已完成。')
assert.equal(
  concurrentWorkerService.getActiveTasksForSession(concurrentWorkerChat.id).length,
  1,
  'completing one worker must not remove another active worker'
)
completeWorker('thread-feishu-worker-1', '并行任务一已完成。')
const firstParallelResult = await firstParallelTask
assert.equal(firstParallelResult.text, '并行任务一已完成。')
assert.equal(
  concurrentWorkerService.getActiveTasksForSession(concurrentWorkerChat.id).length,
  0
)
const persistedParallelHistory = await concurrentWorkerService.getHistory(
  concurrentWorkerChat.id
)
assert.deepEqual(
  new Set(persistedParallelHistory.map(({ text }) => text)),
  new Set([
    '并行任务一',
    '并行任务一已完成。',
    '并行任务二',
    '并行任务二已完成。'
  ]),
  'worker requests and replies should remain visible after history reload'
)

const contextualTask = concurrentWorkerService.enqueueInstruction({
  text: '根据刚才的结果继续',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_parallel_tasks',
    chatType: 'group'
  }
})
for (let index = 0; index < 20; index += 1) {
  if (
    concurrentWorkerRequests.filter(({ method }) => method === 'turn/start')
      .length === 3
  ) break
  await new Promise((resolve) => setTimeout(resolve, 0))
}
const contextualTurn = concurrentWorkerRequests
  .filter(({ method }) => method === 'turn/start')
  .at(-1)
const contextualInput = contextualTurn.params.input
  .find((item) => item.type === 'text')?.text || ''
assert.match(contextualInput, /当前飞书会话近期上下文/)
assert.match(contextualInput, /并行任务一已完成/)
assert.match(contextualInput, /并行任务二已完成/)
completeWorker('thread-feishu-worker-3', '后续任务已完成。')
await contextualTask

const restartWorkerTask = concurrentWorkerService.enqueueInstruction({
  text: '重启 OpenGit',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    connectionName: '工作飞书',
    chatId: 'oc_parallel_tasks',
    chatType: 'group'
  }
})
for (let index = 0; index < 20; index += 1) {
  if (
    concurrentWorkerRequests.filter(({ method }) => method === 'turn/start')
      .length === 4
  ) break
  await new Promise((resolve) => setTimeout(resolve, 0))
}
const restartActiveTask = concurrentWorkerService
  .getActiveTasksForSession(concurrentWorkerChat.id)
  .find((task) => task.text === '重启 OpenGit')
assert.ok(restartActiveTask)
assert.equal(
  concurrentWorkerService.requestApplicationRestart(restartActiveTask).status,
  'restart_pending'
)
assert.equal(scheduledApplicationRestarts.length, 0)
completeWorker('thread-feishu-worker-4', 'OpenGit 即将重启。')
await restartWorkerTask
assert.deepEqual(scheduledApplicationRestarts, [{
  reason: 'codex-session',
  sessionId: concurrentWorkerChat.id,
  threadId: 'thread-feishu-worker-4'
}])

const bindingStore = new MemoryStore()
const bindingService = new CodexMainSessionService({
  store: bindingStore,
  getMainWindow: () => null
})
const boundChat = bindingService.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_bound_project',
  chatType: 'group'
})
const unboundChat = bindingService.getOrCreateFeishuSession({
  connectionId: 'work',
  connectionName: '工作飞书',
  chatId: 'oc_unbound_project',
  chatType: 'group'
})
bindingService.getSession(boundChat.id).threadId = 'thread-main-bound'
bindingService.getSession(unboundChat.id).threadId = 'thread-main-unbound'
const bindingTask = {
  sessionId: boundChat.id,
  threadId: 'thread-main-bound',
  text: '把 tmp 项目绑定到当前群',
  source: 'feishu',
  metadata: {
    connectionId: 'work',
    chatId: 'oc_bound_project'
  }
}
bindingService.activeTasksByThreadId.set('thread-main-bound', bindingTask)
bindingService.activeTasksByThreadId.set('thread-main-unbound', {
  ...bindingTask,
  sessionId: unboundChat.id,
  threadId: 'thread-main-unbound',
  metadata: {
    connectionId: 'work',
    chatId: 'oc_unbound_project'
  }
})
bindingService.request = async (method) => {
  if (method === 'thread/list') {
    return {
      data: [
        {
          id: 'thread-project-tmp',
          cwd: '/tmp',
          name: 'tmp project',
          preview: '处理 tmp 项目',
          status: { type: 'notLoaded' },
          updatedAt: Date.now()
        },
        {
          id: 'thread-project-var',
          cwd: '/var',
          name: 'var project',
          preview: '处理 var 项目',
          status: { type: 'notLoaded' },
          updatedAt: Date.now() - 1
        }
      ],
      nextCursor: null
    }
  }
  return {}
}
const bindingToolResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-bound',
    tool: 'bind_codex_project',
    arguments: {
      projectQuery: 'tmp'
    }
  })
const bindingPayload = JSON.parse(bindingToolResult.contentItems[0].text)
assert.equal(bindingPayload.status, 'bound')
assert.equal(bindingPayload.projectBinding.cwd, '/tmp')
assert.equal(
  bindingService.getSession(boundChat.id).projectBinding.projectQuery,
  'tmp'
)
assert.equal(
  bindingService.getSession(unboundChat.id).projectBinding,
  null,
  'project bindings must stay isolated by Feishu conversation'
)
const reloadedBindingService = new CodexMainSessionService({
  store: bindingStore,
  getMainWindow: () => null
})
assert.equal(
  reloadedBindingService.getSession(boundChat.id).projectBinding.cwd,
  '/tmp',
  'project bindings must survive service restarts'
)

const boundProjectExecutions = []
bindingService.enqueueCodexProjectTask = async (payload) => {
  boundProjectExecutions.push(payload)
  return {
    threadId: payload.threadId,
    cwd: payload.cwd,
    text: '绑定项目任务已完成。'
  }
}
const dispatchBoundResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-bound',
    tool: 'dispatch_codex_project_task',
    arguments: {
      task: '检查当前项目'
    }
  })
const dispatchBoundPayload = JSON.parse(
  dispatchBoundResult.contentItems[0].text
)
assert.equal(dispatchBoundPayload.status, 'completed')
assert.equal(dispatchBoundPayload.usedProjectBinding, true)
assert.equal(boundProjectExecutions[0].threadId, 'thread-project-tmp')

const dispatchExplicitResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-bound',
    tool: 'dispatch_codex_project_task',
    arguments: {
      projectQuery: 'var',
      task: '临时检查另一个项目'
    }
  })
const dispatchExplicitPayload = JSON.parse(
  dispatchExplicitResult.contentItems[0].text
)
assert.equal(dispatchExplicitPayload.status, 'completed')
assert.equal(dispatchExplicitPayload.usedProjectBinding, false)
assert.equal(boundProjectExecutions[1].threadId, 'thread-project-var')
assert.equal(
  bindingService.getSession(boundChat.id).projectBinding.cwd,
  '/tmp',
  'an explicit one-off project must not replace the conversation binding'
)

const unboundStatusResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-unbound',
    tool: 'get_codex_project_binding',
    arguments: {}
  })
assert.equal(
  JSON.parse(unboundStatusResult.contentItems[0].text).status,
  'unbound'
)
const dispatchUnboundResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-unbound',
    tool: 'dispatch_codex_project_task',
    arguments: {
      task: '检查当前项目'
    }
  })
assert.equal(
  JSON.parse(dispatchUnboundResult.contentItems[0].text).status,
  'project_required'
)

const unbindResult =
  await bindingService.projectSessionRouter.handleToolCall({
    threadId: 'thread-main-bound',
    tool: 'unbind_codex_project',
    arguments: {}
  })
assert.equal(JSON.parse(unbindResult.contentItems[0].text).status, 'unbound')
assert.equal(bindingService.getSession(boundChat.id).projectBinding, null)

const projectExecutionService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
projectExecutionService.startServer = async () => true
const projectExecutionRequests = []
projectExecutionService.request = async (method, params) => {
  projectExecutionRequests.push({ method, params })
  if (method === 'thread/resume') {
    return {
      thread: {
        id: params.threadId,
        cwd: '/tmp',
        status: { type: 'idle' }
      }
    }
  }
  if (method === 'turn/start') {
    queueMicrotask(() => {
      projectExecutionService.handleNotification('item/completed', {
        threadId: params.threadId,
        item: {
          id: 'agent-project-result',
          type: 'agentMessage',
          text: '目标项目会话已经完成。'
        }
      })
      projectExecutionService.handleNotification('turn/completed', {
        threadId: params.threadId,
        turn: {
          id: 'turn-project',
          status: 'completed',
          items: []
        }
      })
    })
    return {
      turn: {
        id: 'turn-project',
        status: 'inProgress'
      }
    }
  }
  return {}
}
const projectExecutionResult =
  await projectExecutionService.executeCodexProjectTask({
    threadId: 'thread-project-idle',
    cwd: '/tmp',
    task: '继续执行目标项目任务',
    createNew: false
  })
assert.equal(projectExecutionResult.threadId, 'thread-project-idle')
assert.equal(projectExecutionResult.text, '目标项目会话已经完成。')
assert.equal(projectExecutionResult.createdNewSession, false)
assert.deepEqual(
  projectExecutionRequests.map(({ method }) => method),
  ['thread/resume', 'config/read', 'model/list', 'turn/start']
)
assert.equal(
  projectExecutionRequests.some(({ method }) => method === 'turn/steer'),
  false,
  'project routing must never steer a target thread'
)

const runningProjectService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
runningProjectService.startServer = async () => true
const runningProjectRequests = []
runningProjectService.request = async (method, params) => {
  runningProjectRequests.push({ method, params })
  if (method === 'thread/resume') {
    return {
      thread: {
        id: params.threadId,
        cwd: '/tmp',
        status: {
          type: 'active',
          activeFlags: []
        }
      }
    }
  }
  return {}
}
await assert.rejects(
  runningProjectService.executeCodexProjectTask({
    threadId: 'thread-project-running',
    cwd: '/tmp',
    task: '不能直接追加',
    createNew: false
  }),
  (error) => error?.code === 'CODEX_PROJECT_THREAD_ACTIVE'
)
assert.deepEqual(
  runningProjectRequests.map(({ method }) => method),
  ['thread/resume'],
  'a running target must not receive turn/start or turn/steer'
)

const queuedProjectService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null,
  projectThreadPollIntervalMs: 1000
})
queuedProjectService.startServer = async () => true
let externalProjectTurnActive = true
let queuedProjectTurnSequence = 0
const queuedProjectRequests = []
const projectQueueNotices = []
const projectStartNotices = []
queuedProjectService.request = async (method, params) => {
  queuedProjectRequests.push({ method, params })
  if (method === 'thread/read') {
    return {
      thread: {
        id: params.threadId,
        status: {
          type: (
            params.threadId === 'thread-project-shared'
            && externalProjectTurnActive
          ) ? 'active' : 'idle'
        }
      }
    }
  }
  if (method === 'thread/resume') {
    return {
      thread: {
        id: params.threadId,
        cwd: '/tmp',
        status: { type: 'idle' }
      }
    }
  }
  if (method === 'turn/start') {
    queuedProjectTurnSequence += 1
    const turnSequence = queuedProjectTurnSequence
    const taskText = params.input[0].text
    queueMicrotask(() => {
      queuedProjectService.handleNotification('item/completed', {
        threadId: params.threadId,
        item: {
          id: `agent-queued-project-${turnSequence}`,
          type: 'agentMessage',
          text: `${taskText}已完成。`
        }
      })
      queuedProjectService.handleNotification('turn/completed', {
        threadId: params.threadId,
        turn: {
          id: `turn-queued-project-${turnSequence}`,
          status: 'completed',
          items: []
        }
      })
    })
    return {
      turn: {
        id: `turn-queued-project-${turnSequence}`,
        status: 'inProgress'
      }
    }
  }
  return {}
}
const firstQueuedProjectTask = queuedProjectService.enqueueCodexProjectTask({
  threadId: 'thread-project-shared',
  cwd: '/tmp',
  task: '排队任务一',
  onQueued: (details) => {
    projectQueueNotices.push(details)
  },
  onStarted: (details) => {
    projectStartNotices.push(details)
  }
})
const secondQueuedProjectTask = queuedProjectService.enqueueCodexProjectTask({
  threadId: 'thread-project-shared',
  cwd: '/tmp',
  task: '排队任务二'
})
const independentProjectTask = queuedProjectService.enqueueCodexProjectTask({
  threadId: 'thread-project-independent',
  cwd: '/tmp',
  task: '独立项目任务'
})
for (let index = 0; index < 20; index += 1) {
  if (queuedProjectRequests.some(({ method }) => method === 'thread/read')) break
  await new Promise((resolve) => setTimeout(resolve, 0))
}
await Promise.resolve()
assert.equal(
  projectQueueNotices.length,
  1,
  'an externally active project thread should report queueing immediately'
)
assert.equal(projectQueueNotices[0].reason, 'project-thread-active')
assert.equal(
  queuedProjectRequests.some(({ method, params }) => (
    method === 'thread/resume'
    && params.threadId === 'thread-project-shared'
  )),
  false,
  'an active project thread must remain untouched while its task waits'
)
assert.equal(
  queuedProjectRequests.some(({ method }) => method === 'thread/start'),
  false,
  'waiting for an active project thread must never create another project thread'
)
const independentProjectResult = await independentProjectTask
assert.equal(independentProjectResult.text, '独立项目任务已完成。')
assert.equal(independentProjectResult.queuedForActiveThread, false)
assert.equal(
  queuedProjectService.processingProjectThreadIds.has('thread-project-shared'),
  true,
  'another project should finish without releasing the busy project queue'
)
externalProjectTurnActive = false
queuedProjectService.handleNotification('turn/completed', {
  threadId: 'thread-project-shared',
  turn: {
    id: 'turn-external-project',
    status: 'completed',
    items: []
  }
})
const [firstQueuedProjectResult, secondQueuedProjectResult] = await Promise.all([
  firstQueuedProjectTask,
  secondQueuedProjectTask
])
assert.equal(firstQueuedProjectResult.text, '排队任务一已完成。')
assert.equal(secondQueuedProjectResult.text, '排队任务二已完成。')
assert.equal(firstQueuedProjectResult.queuedForActiveThread, true)
assert.equal(secondQueuedProjectResult.queuedForActiveThread, true)
assert.equal(projectStartNotices.length, 1)
assert.deepEqual(
  queuedProjectRequests
    .filter(({ method, params }) => (
      method === 'turn/start'
      && params.threadId === 'thread-project-shared'
    ))
    .map(({ params }) => params.input[0].text),
  ['排队任务一', '排队任务二'],
  'tasks for the same project thread must execute in FIFO order'
)
assert.equal(
  queuedProjectRequests.some(({ method, params }) => (
    method === 'turn/steer'
    || (
      method === 'thread/start'
      && params?.threadSource === 'open_git_project_task'
    )
  )),
  false,
  'queued project tasks must reuse the existing thread without steering or starting a new one'
)

const failedProjectQueueService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null,
  projectThreadPollIntervalMs: 1000
})
failedProjectQueueService.startServer = async () => true
const failedProjectQueueRequests = []
failedProjectQueueService.request = async (method, params) => {
  failedProjectQueueRequests.push({ method, params })
  if (method === 'thread/read') {
    return {
      thread: {
        id: params.threadId,
        status: { type: 'active' }
      }
    }
  }
  throw new Error(`unexpected request after queue failure: ${method}`)
}
const failedProjectTask = failedProjectQueueService.enqueueCodexProjectTask({
  threadId: 'thread-project-failed-server',
  cwd: '/tmp',
  task: '服务退出后不能继续执行'
})
const failedProjectTaskAssertion = assert.rejects(
  failedProjectTask,
  /模拟 app-server 退出/
)
for (let index = 0; index < 20; index += 1) {
  if (failedProjectQueueRequests.length > 0) break
  await new Promise((resolve) => setTimeout(resolve, 0))
}
failedProjectQueueService.failPending(new Error('模拟 app-server 退出'))
await failedProjectTaskAssertion
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(
  failedProjectQueueRequests.map(({ method }) => method),
  ['thread/read'],
  'a rejected project queue must not restart or execute its cancelled task'
)
assert.equal(
  failedProjectQueueService.processingProjectThreadIds.size,
  0,
  'a failed project queue must release its processing lock'
)

const toolRpcService = new CodexMainSessionService({
  store: new MemoryStore(),
  getMainWindow: () => null
})
const toolRpcResponses = []
let collidedClientRequestResolved = false
const collidedTimer = setTimeout(() => {}, 60 * 1000)
toolRpcService.pendingRequests.set(7, {
  resolve: () => {
    collidedClientRequestResolved = true
  },
  reject: () => {},
  timer: collidedTimer,
  method: 'thread/list'
})
toolRpcService.sendRaw = (message) => {
  toolRpcResponses.push(message)
}
toolRpcService.projectSessionRouter = {
  handleToolCall: async () => ({
    success: true,
    contentItems: [{
      type: 'inputText',
      text: 'ok'
    }]
  })
}
toolRpcService.handleRpcMessage({
  id: 7,
  method: 'item/tool/call',
  params: {
    threadId: 'thread-main',
    tool: 'find_codex_project_sessions',
    arguments: { projectQuery: 'api-go' }
  }
})
await Promise.resolve()
assert.equal(collidedClientRequestResolved, false)
assert.equal(
  toolRpcService.pendingRequests.has(7),
  true,
  'server tool request ids must not collide with client request ids'
)
assert.deepEqual(toolRpcResponses, [{
  id: 7,
  result: {
    success: true,
    contentItems: [{
      type: 'inputText',
      text: 'ok'
    }]
  }
}])
clearTimeout(collidedTimer)
toolRpcService.pendingRequests.delete(7)

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
const bridgeKeepAliveStates = []
const proactiveBridgeMessages = []
const enqueuedBridgeInstructions = []
const monitorControlPayloads = []
const bridgeService = {
  getConfig: () => updatedConfig,
  handleFeishuMonitorControl: async (payload) => {
    monitorControlPayloads.push(payload)
    if (payload.text !== '继续监控吧') return null
    return {
      handled: true,
      action: 'start',
      text: '已绑定当前会话。'
    }
  },
  enqueueInstruction: (payload) => {
    enqueuedBridgeInstructions.push(payload)
    return payload
  },
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
      }),
      sendProactiveNotification: async (chatId, message) => {
        proactiveBridgeMessages.push({
          connectionId: options.getConfig().id,
          chatId,
          message
        })
      }
    }
  },
  onKeepAliveChanged: (enabled) => {
    bridgeKeepAliveStates.push(enabled)
  },
  safeLog: () => {},
  safeError: () => {}
})
await bridgeManager.start()
assert.equal(bridgeStartCount, 2)
assert.deepEqual(bridgeKeepAliveStates, [true])
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
const routedControlInstruction = await bridgeOptions[0].onInstruction({
  text: '继续监控吧',
  chatId: 'oc_work',
  chatType: 'group'
})
assert.deepEqual(routedControlInstruction, {
  handled: true,
  action: 'start',
  text: '已绑定当前会话。'
})
assert.equal(monitorControlPayloads.at(-1).connectionId, 'work')
assert.equal(monitorControlPayloads.at(-1).connectionName, '工作飞书')
assert.equal(
  enqueuedBridgeInstructions.length,
  1,
  'handled monitor commands must not create a Codex turn'
)
await bridgeManager.sendProactiveNotification(
  { connectionId: 'work', chatId: 'oc_notify' },
  '**Codex 任务完成**'
)
assert.deepEqual(proactiveBridgeMessages, [{
  connectionId: 'work',
  chatId: 'oc_notify',
  message: '**Codex 任务完成**'
}])
bridgeManager.scheduleRestart('resume', 0)
bridgeManager.scheduleRestart('unlock-screen', 0)
await new Promise((resolve) => setTimeout(resolve, 20))
assert.equal(
  bridgeStartCount,
  4,
  'resume and unlock events should coalesce into one restart for all connections'
)
assert.equal(
  bridgeStopCount,
  2,
  'coalesced power recovery should stop each existing connection once'
)
assert.deepEqual(
  bridgeKeepAliveStates,
  [true, false, true],
  'Feishu keep-alive should remain enabled after power recovery'
)
await bridgeManager.stop()
assert.equal(bridgeStopCount, 4)
assert.deepEqual(bridgeKeepAliveStates, [true, false, true, false])

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
