const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const {
  resolveCodexExecutable,
  buildCodexProcessEnv
} = require('./ai-sessions')
const {
  collectOutboxAttachments
} = require('./codex-feishu-attachments')
const {
  DEFAULT_STALL_MINUTES,
  createCodexProactiveNotificationMonitor
} = require('./codex-proactive-notifications')
const {
  CodexProjectSessionRouter,
  CODEX_PROJECT_DYNAMIC_TOOLS
} = require('./codex-project-session-router')
const { version: OPEN_GIT_VERSION = '0.0.0' } = require('../../package.json')

const CONFIG_STORE_KEY = 'codex-main-session-config-v1'
const THREAD_STORE_KEY = 'codex-main-session-thread-id-v1'
const SESSIONS_STORE_KEY = 'codex-main-sessions-v2'
const ACTIVE_SESSION_STORE_KEY = 'codex-main-active-session-id-v2'
const WORKER_HISTORY_STORE_KEY = 'codex-main-session-worker-history-v1'
const MAIN_SESSION_ID = 'main'
const REQUEST_TIMEOUT_MS = 20 * 1000
const SERVER_START_TIMEOUT_MS = 20 * 1000
const SERVER_STOP_TIMEOUT_MS = 2 * 1000
const MAX_STDERR_LENGTH = 6000
const MAX_HISTORY_MESSAGES = 400
const MAX_WORKER_CONTEXT_MESSAGES = 24
const MAX_WORKER_CONTEXT_CHARS = 16000
const PROJECT_THREAD_POLL_INTERVAL_MS = 5000
const FEISHU_POWER_RECOVERY_DELAY_MS = 2500
const PROJECT_ROUTING_TOOL_VERSION = 4

const MAIN_SESSION_INSTRUCTIONS = [
  '你是 OpenGit 内置的持久 Codex 路由协调会话。',
  '你会接收 OpenGit 页面或当前飞书会话转发的用户指令，并负责理解需求、路由任务和总结结果。',
  '任务执行期间可以使用 Codex 可用的工具；在真正缺少用户选择或外部权限时才说明阻塞。',
  '当飞书用户要求查看、检查、修改、继续或执行某个项目的任务时，必须先调用 dispatch_codex_project_task；不得在当前 OpenGit 主会话中直接使用文件、终端或代码工具代替目标项目会话执行。',
  '每个 OpenGit 会话都可以绑定一个默认项目。用户要求把某个项目绑定到当前会话时调用 bind_codex_project；查询当前绑定时调用 get_codex_project_binding；解除绑定时调用 unbind_codex_project。',
  '只有用户明确要求重启整个 OpenGit 桌面应用时才调用 restart_open_git。不要把重启 Codex server、飞书连接、终端或项目任务误解为重启 OpenGit；调用前应说明其他正在运行的 OpenGit 任务会被中断。',
  '当前会话绑定项目后，用户没有明确点名其他项目的项目任务也必须调用 dispatch_codex_project_task，并省略 projectQuery 以使用绑定项目。用户明确点名其他项目时，以本次点名为准，但不要自动改变原绑定。',
  'dispatch_codex_project_task 会优先选择该项目正在执行的未归档、未删除会话并自动排队，在其空闲后继续使用同一个会话；没有执行中会话时才恢复最近的旧会话。只要项目存在旧会话，就不得新开项目会话、steer 或在当前路由会话中代执行。',
  '用户只查询项目现有 Codex 会话时使用 find_codex_project_sessions。没有旧会话且缺少项目绝对路径时，先向用户询问路径。',
  '目标项目任务完成后，把项目会话工具返回的真实 Codex 结果直接总结并回复；不要声称任务由当前主会话执行。',
  '飞书任务可能附带本地文件与本轮专属 outbox；需要回传附件时，只把最终交付文件写入指定 outbox，不要写入临时产物，也不要读取或发送 outbox 之外的本机文件。',
  '每轮最终回答必须是可直接转发给用户的简洁结果总结：先说结果，再列出关键变更、验证状态和仍需用户处理的事项。',
  '不要在最终回答中泄露 access token、refresh token、App Secret 或其他凭据。'
].join('\n')

const DEFAULT_CONFIG = Object.freeze({
  workingDirectory: '',
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
  reasoningEffort: '',
  feishu: {
    autoMonitor: {
      enabled: false,
      targetSessionId: '',
      stallMinutes: DEFAULT_STALL_MINUTES
    },
    connections: []
  }
})

function normalizeAutoMonitorConfig(source = {}, previous = {}) {
  const sourceObject = source && typeof source === 'object' ? source : {}
  const previousObject = previous && typeof previous === 'object' ? previous : {}
  const requestedEnabled = sourceObject.enabled
  const requestedStallMinutes = Number(
    sourceObject.stallMinutes ?? previousObject.stallMinutes
  )
  return {
    enabled: typeof requestedEnabled === 'boolean'
      ? requestedEnabled
      : previousObject.enabled === true,
    targetSessionId: String(
      sourceObject.targetSessionId ?? previousObject.targetSessionId ?? ''
    ).trim(),
    stallMinutes: Number.isFinite(requestedStallMinutes)
      ? Math.min(24 * 60, Math.max(5, Math.round(requestedStallMinutes)))
      : DEFAULT_STALL_MINUTES
  }
}

function normalizeStringList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/)
  return Array.from(new Set(
    items
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ))
}

function normalizeFeishuConnections(source = {}, previous = {}) {
  const previousConnections = Array.isArray(previous?.connections)
    ? previous.connections
    : (
        previous?.appId || previous?.appSecret
          ? [{ id: 'default', name: '飞书', ...previous }]
          : []
      )
  const previousById = new Map(
    previousConnections.map((connection) => [
      String(connection?.id || '').trim(),
      connection
    ])
  )
  let requestedConnections
  if (Array.isArray(source?.connections)) {
    requestedConnections = source.connections
  } else if (
    source?.appId
    || source?.appSecret
    || typeof source?.enabled === 'boolean'
  ) {
    requestedConnections = [{ id: 'default', name: '飞书', ...source }]
  } else {
    requestedConnections = previousConnections
  }

  const seenIds = new Set()
  const normalized = []
  for (const [index, item] of requestedConnections.entries()) {
    if (!item || typeof item !== 'object') continue
    const fallbackId = `feishu-${index + 1}`
    const id = String(item.id || fallbackId).trim() || fallbackId
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const previousItem = previousById.get(id) || {}
    const requestedSecret = String(item.appSecret || '').trim()
    normalized.push({
      id,
      name: compactSessionText(
        item.name ?? previousItem.name,
        30
      ) || `飞书 ${index + 1}`,
      enabled: typeof item.enabled === 'boolean'
        ? item.enabled
        : previousItem.enabled === true,
      appId: String(item.appId ?? previousItem.appId ?? '').trim(),
      appSecret: requestedSecret || String(previousItem.appSecret || '').trim(),
      allowedChatIds: normalizeStringList(
        item.allowedChatIds ?? previousItem.allowedChatIds
      ),
      allowedSenderIds: normalizeStringList(
        item.allowedSenderIds ?? previousItem.allowedSenderIds
      )
    })
  }
  return normalized
}

function normalizeCodexMainConfig(value = {}, previous = DEFAULT_CONFIG) {
  const source = value && typeof value === 'object' ? value : {}
  const previousFeishu = previous?.feishu && typeof previous.feishu === 'object'
    ? previous.feishu
    : DEFAULT_CONFIG.feishu
  const sourceFeishu = source.feishu && typeof source.feishu === 'object'
    ? source.feishu
    : {}
  const requestedSandboxMode = source.sandboxMode ?? previous?.sandboxMode
  const requestedApprovalPolicy = source.approvalPolicy ?? previous?.approvalPolicy
  const sandboxMode = ['read-only', 'workspace-write', 'danger-full-access']
    .includes(requestedSandboxMode)
    ? requestedSandboxMode
    : DEFAULT_CONFIG.sandboxMode
  const approvalPolicy = ['untrusted', 'on-request', 'never']
    .includes(requestedApprovalPolicy)
    ? requestedApprovalPolicy
    : DEFAULT_CONFIG.approvalPolicy

  return {
    workingDirectory: String(
      source.workingDirectory ?? previous?.workingDirectory ?? ''
    ).trim(),
    sandboxMode,
    approvalPolicy,
    reasoningEffort: String(
      source.reasoningEffort ?? previous?.reasoningEffort ?? ''
    ).trim(),
    feishu: {
      autoMonitor: normalizeAutoMonitorConfig(
        sourceFeishu.autoMonitor,
        previousFeishu.autoMonitor
      ),
      connections: normalizeFeishuConnections(sourceFeishu, previousFeishu)
    }
  }
}

function publicCodexMainConfig(config = DEFAULT_CONFIG) {
  const normalized = normalizeCodexMainConfig(config, config)
  return {
    ...normalized,
    feishu: {
      autoMonitor: normalized.feishu.autoMonitor,
      connections: normalized.feishu.connections.map((connection) => ({
        ...connection,
        appSecret: '',
        hasAppSecret: Boolean(connection.appSecret)
      }))
    }
  }
}

function resolveWorkingDirectory(value = '') {
  const requested = String(value || '').trim()
  if (requested) {
    try {
      if (fs.statSync(requested).isDirectory()) {
        return path.resolve(requested)
      }
    } catch (error) {}
  }
  return os.homedir()
}

function buildTurnSandboxPolicy(config, cwd, extraWritableRoots = []) {
  if (config.sandboxMode === 'read-only') {
    return { type: 'readOnly', networkAccess: true }
  }
  if (config.sandboxMode === 'workspace-write') {
    const writableRoots = Array.from(new Set([
      cwd,
      ...(Array.isArray(extraWritableRoots) ? extraWritableRoots : [])
    ].map((item) => String(item || '').trim()).filter(Boolean)))
    return {
      type: 'workspaceWrite',
      writableRoots,
      networkAccess: true
    }
  }
  return { type: 'dangerFullAccess' }
}

function formatAttachmentSize(size) {
  const bytes = Number(size) || 0
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

function buildCodexTaskInput(task = {}) {
  const isFeishu = task.source === 'feishu'
  if (!isFeishu) {
    return [{ type: 'text', text: String(task.text || '').trim() }]
  }

  const attachments = Array.isArray(task.attachments) ? task.attachments : []
  const workspace = task.attachmentWorkspace || {}
  const sections = ['[来自飞书的指令]']
  const contextMessages = Array.isArray(task.contextMessages)
    ? task.contextMessages
    : []
  if (contextMessages.length > 0) {
    sections.push('', '[当前飞书会话近期上下文]')
    for (const message of contextMessages) {
      const role = message?.role === 'assistant'
        ? 'Codex'
        : (
            message?.status === 'running'
              ? '用户（该指令仍在另一个子会话执行，尚无结果）'
              : '用户'
          )
      const text = String(message?.text || '').trim()
      if (text) sections.push(`${role}：${text}`)
    }
  }
  sections.push('', '[本轮指令]', String(task.text || '').trim())
  if (attachments.length > 0) {
    sections.push('', '[本轮飞书附件]')
    for (const [index, attachment] of attachments.entries()) {
      sections.push(
        `${index + 1}. [${attachment.kind || 'file'}] ${attachment.name || '附件'}`
        + ` (${attachment.mimeType || 'application/octet-stream'}, ${formatAttachmentSize(attachment.size)})`
      )
      sections.push(`   本地路径：${attachment.path}`)
      if (attachment.kind === 'image') {
        sections.push('   该图片已作为 localImage 一并提交。')
      }
    }
  }
  if (workspace.outboxDir) {
    sections.push(
      '',
      '[飞书附件回复规则]',
      `需要向用户回复图片或文件时，仅将最终交付文件写入：${workspace.outboxDir}`,
      'OpenGit 会自动上传并发送该目录中的普通文件；不要写入中间产物、符号链接或无需发送的文件。',
      '支持的回复类型为图片和普通文件；图片会按图片消息发送，其他内容按文件发送。'
    )
  }

  const input = [{ type: 'text', text: sections.join('\n').trim() }]
  for (const attachment of attachments) {
    if (attachment?.kind === 'image' && attachment.path) {
      input.push({
        type: 'localImage',
        path: attachment.path
      })
    }
  }
  return input
}

function createRpcError(payload = null, fallbackMessage = 'Codex app-server 请求失败') {
  const error = new Error(payload?.message || fallbackMessage)
  if (payload?.code != null) error.rpcCode = payload.code
  return error
}

function toTimestampMs(value) {
  const numeric = Number(value) || 0
  if (!numeric) return Date.now()
  return numeric < 1e11 ? numeric * 1000 : numeric
}

function extractUserItemText(item = {}) {
  if (item?.type !== 'userMessage' || !Array.isArray(item.content)) return ''
  return item.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function extractThreadMessages(thread = {}) {
  const messages = []
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  for (const turn of turns) {
    const createdAt = toTimestampMs(turn?.startedAt || turn?.completedAt)
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      if (item?.type === 'userMessage') {
        const text = extractUserItemText(item)
        if (text) {
          messages.push({
            id: item.id || `history-user:${messages.length}`,
            role: 'user',
            text,
            status: 'completed',
            source: text.startsWith('[来自飞书的指令]') ? 'feishu' : 'ui',
            createdAt
          })
        }
      } else if (item?.type === 'agentMessage' && String(item.text || '').trim()) {
        messages.push({
          id: item.id || `history-agent:${messages.length}`,
          role: 'assistant',
          text: String(item.text || '').trim(),
          status: 'completed',
          source: 'codex',
          createdAt: toTimestampMs(turn?.completedAt || turn?.startedAt)
        })
      }
    }
  }
  return messages.slice(-MAX_HISTORY_MESSAGES)
}

function normalizeWorkerHistoryMessage(item = {}, index = 0) {
  if (!item || typeof item !== 'object') return null
  const text = String(item.text || '').trim()
  if (!text) return null
  const role = item.role === 'assistant' ? 'assistant' : 'user'
  return {
    id: String(item.id || `worker-history:${index}`).trim()
      || `worker-history:${index}`,
    role,
    text,
    status: item.status === 'error' ? 'error' : 'completed',
    source: role === 'user' ? 'feishu' : 'codex',
    createdAt: Number(item.createdAt) || Date.now() + index
  }
}

function normalizeWorkerHistories(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
  const normalized = {}
  for (const [sessionId, items] of Object.entries(source)) {
    const id = String(sessionId || '').trim()
    if (!id || !Array.isArray(items)) continue
    const messages = items
      .map((item, index) => normalizeWorkerHistoryMessage(item, index))
      .filter(Boolean)
      .slice(-MAX_HISTORY_MESSAGES)
    if (messages.length > 0) normalized[id] = messages
  }
  return normalized
}

function shouldFallbackFromThreadFork(error) {
  const message = String(error?.message || '').toLowerCase()
  return Number(error?.rpcCode) === -32601
    || /(?:unknown|unsupported|not found|not implemented).{0,40}thread\/fork/.test(message)
    || /thread\/fork.{0,40}(?:unknown|unsupported|not found|not implemented)/.test(message)
    || /paginated.{0,40}(?:thread|history)|(?:thread|history).{0,40}paginated/.test(message)
}

function compactSessionText(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const limit = Math.max(12, Number(maxLength) || 72)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function normalizeProjectBinding(value) {
  if (!value || typeof value !== 'object') return null
  const projectQuery = compactSessionText(value.projectQuery, 120)
  const cwd = String(value.cwd || '').trim()
  if (!projectQuery && !cwd) return null
  return {
    projectQuery: projectQuery || path.basename(cwd),
    cwd,
    title: compactSessionText(
      value.title || (cwd ? path.basename(cwd) : projectQuery),
      100
    ),
    boundAt: Number(value.boundAt) || Date.now()
  }
}

function createDefaultSession(threadId = '') {
  const now = Date.now()
  return {
    id: MAIN_SESSION_ID,
    title: '主会话',
    source: 'ui',
    connectionId: '',
    connectionName: '',
    chatId: '',
    chatType: '',
    threadId: String(threadId || '').trim(),
    toolVersion: PROJECT_ROUTING_TOOL_VERSION,
    projectBinding: null,
    lastMessage: '',
    createdAt: now,
    updatedAt: now
  }
}

function normalizeStoredSessions(value) {
  const source = Array.isArray(value) ? value : []
  const seenIds = new Set()
  const seenFeishuChats = new Set()
  const sessions = []

  for (const [index, item] of source.entries()) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id || '').trim()
    const sourceType = item.source === 'feishu' ? 'feishu' : 'ui'
    const chatId = sourceType === 'feishu'
      ? String(item.chatId || '').trim()
      : ''
    const connectionId = sourceType === 'feishu'
      ? String(item.connectionId || 'default').trim()
      : ''
    const feishuChatKey = `${connectionId}:${chatId}`
    if (!id || seenIds.has(id)) continue
    if (
      sourceType === 'feishu'
      && (!chatId || seenFeishuChats.has(feishuChatKey))
    ) continue
    seenIds.add(id)
    if (chatId) seenFeishuChats.add(feishuChatKey)
    const createdAt = Number(item.createdAt) || Date.now() + index
    sessions.push({
      id,
      title: compactSessionText(
        item.title,
        42
      ) || (sourceType === 'feishu' ? '飞书会话' : '新会话'),
      source: sourceType,
      connectionId,
      connectionName: sourceType === 'feishu'
        ? compactSessionText(item.connectionName, 30)
        : '',
      chatId,
      chatType: sourceType === 'feishu'
        ? String(item.chatType || '').trim().toLowerCase()
        : '',
      threadId: String(item.threadId || '').trim(),
      toolVersion: Math.max(0, Number(item.toolVersion) || 0),
      projectBinding: normalizeProjectBinding(item.projectBinding),
      lastMessage: compactSessionText(item.lastMessage),
      createdAt,
      updatedAt: Number(item.updatedAt) || createdAt
    })
  }

  const mainSession = sessions.find((session) => session.id === MAIN_SESSION_ID)
  if (mainSession) {
    mainSession.title = '主会话'
    mainSession.source = 'ui'
    mainSession.connectionId = ''
    mainSession.connectionName = ''
    mainSession.chatId = ''
    mainSession.chatType = ''
  } else {
    sessions.push(createDefaultSession())
  }
  return sessions
}

function createFeishuSessionId(chatId, connectionId = 'default') {
  return `feishu:${String(connectionId || 'default').trim()}:${String(chatId || '').trim()}`
}

function buildFeishuSessionTitle(chatType, chatId, connectionName = '') {
  const normalizedType = String(chatType || '').trim().toLowerCase()
  const label = normalizedType === 'group' ? '飞书群聊' : '飞书私聊'
  const normalizedConnectionName = compactSessionText(connectionName, 18)
  const normalizedChatId = String(chatId || '').trim()
  const suffix = normalizedChatId.slice(-8)
  return [
    label,
    normalizedConnectionName,
    suffix
  ].filter(Boolean).join(' · ')
}

function normalizeFeishuMonitorControlText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[，,、。.!！?？;；:：~～]/g, '')
    .toLowerCase()
}

function parseFeishuMonitorControlIntent(value = '') {
  const text = normalizeFeishuMonitorControlText(value)
  if (!text || text.length > 40) return ''

  const stopPatterns = [
    /^(?:自动)?(?:监控|跟踪)?(?:先)?(?:停止|停掉|停下|关闭|取消)(?:自动)?(?:监控|跟踪|盯|盯着)?(?:任务)?(?:吧|了)?$/,
    /^(?:不用|不要|别)(?:再)?(?:监控|跟踪|盯|盯着)(?:任务)?(?:了|吧)?$/
  ]
  if (stopPatterns.some((pattern) => pattern.test(text))) return 'stop'

  const statusPatterns = [
    /^(?:自动)?(?:监控|跟踪)(?:状态|情况)(?:怎么样|如何|呢)?$/,
    /^(?:(?:你)?(?:现在)?(?:有|还)在|(?:你)?现在在|在)(?:自动)?(?:监控|跟踪|盯|盯着)(?:任务)?(?:吗|呢)?$/,
    /^(?:自动)?(?:监控|跟踪|盯着)(?:任务)?(?:吗|呢)$/
  ]
  if (statusPatterns.some((pattern) => pattern.test(text))) return 'status'

  const startPatterns = [
    /^(?:也)?(?:帮我|请)?(?:开始|开启|继续)?(?:自动)?(?:监控|跟踪)(?:一下)?(?:这些|其他|其它|当前|所有)?(?:codex)?(?:任务)?(?:吧)?$/,
    /^(?:也)?(?:帮我|请)?(?:开始|开启|继续)?(?:盯|盯着)(?:一下)?(?:这些|其他|其它|当前|所有)?(?:codex)?(?:任务)?(?:吧)?$/,
    /^(?:帮我|请)?(?:监控|跟踪|盯)(?:一下)?(?:这些|其他|其它|当前|所有)?(?:codex)?(?:任务)?(?:并|和)(?:同步|通知)(?:进展)?(?:给我|我)?(?:吧)?$/,
    /^(?:帮我|请)?(?:监控|跟踪|盯|盯着)(?:一下)?(?:这些|其他|其它|当前|所有)?(?:codex)?(?:任务)?(?:有|如果有)(?:新)?进展(?:就|要|你要)?(?:同步|通知|告诉)(?:到这里|到当前会话|到当前单聊|到当前群聊|给我|我)(?:吧)?$/,
    /^(?:有|如果有)(?:新)?进展(?:就|要|你要)?(?:同步|通知|告诉)(?:给)?我(?:吧)?$/,
    /^(?:同步|通知)(?:新)?进展(?:给)?我(?:吧)?$/
  ]
  return startPatterns.some((pattern) => pattern.test(text)) ? 'start' : ''
}

class CodexMainSessionService {
  constructor({
    store,
    getMainWindow,
    safeLog = () => {},
    safeError = () => {},
    projectThreadPollIntervalMs = PROJECT_THREAD_POLL_INTERVAL_MS,
    scheduleApplicationRestart = null
  }) {
    this.store = store
    this.getMainWindow = getMainWindow
    this.safeLog = safeLog
    this.safeError = safeError
    this.scheduleApplicationRestart = typeof scheduleApplicationRestart === 'function'
      ? scheduleApplicationRestart
      : null
    this.child = null
    this.stdoutRemainder = ''
    this.stderrText = ''
    this.requestSequence = 1
    this.pendingRequests = new Map()
    this.startPromise = null
    this.startResolve = null
    this.startReject = null
    this.startTimer = null
    this.childExitPromise = null
    this.resolveChildExit = null
    this.restartTimer = null
    this.restartAttempt = 0
    this.shouldRun = false
    this.loadedSessionIds = new Set()
    this.ensureThreadPromises = new Map()
    this.account = null
    this.requiresOpenaiAuth = true
    this.serverStatus = 'stopped'
    this.serverError = ''
    this.sessionQueues = new Map()
    this.processingSessionIds = new Set()
    this.activeTasks = new Map()
    this.activeTasksByThreadId = new Map()
    this.managedProjectTurns = new Map()
    this.projectTaskQueues = new Map()
    this.processingProjectThreadIds = new Set()
    this.projectThreadWaiters = new Map()
    this.projectThreadPollIntervalMs = Math.max(
      25,
      Number(projectThreadPollIntervalMs) || PROJECT_THREAD_POLL_INTERVAL_MS
    )
    this.liveMessages = new Map()
    this.feishuBridge = null
    this.proactiveNotificationMonitor = null
    this.screenLocked = false
    this.autoMonitorRunning = false
    this.config = normalizeCodexMainConfig(
      this.store.get(CONFIG_STORE_KEY, DEFAULT_CONFIG),
      DEFAULT_CONFIG
    )
    const storedSessions = normalizeStoredSessions(
      this.store.get(SESSIONS_STORE_KEY, [])
    )
    this.sessions = new Map(storedSessions.map((session) => [session.id, session]))
    const storedWorkerHistories = normalizeWorkerHistories(
      this.store.get(WORKER_HISTORY_STORE_KEY, {})
    )
    this.workerHistories = new Map(
      Object.entries(storedWorkerHistories)
    )
    const storedActiveSessionId = String(
      this.store.get(ACTIVE_SESSION_STORE_KEY, MAIN_SESSION_ID) || ''
    ).trim()
    this.activeSessionId = this.sessions.has(storedActiveSessionId)
      ? storedActiveSessionId
      : MAIN_SESSION_ID
    this.projectSessionRouter = new CodexProjectSessionRouter({
      service: this
    })
    this.persistSessions()
    this.store.delete(THREAD_STORE_KEY)
  }

  setFeishuBridge(bridge) {
    this.feishuBridge = bridge || null
  }

  setProactiveNotificationMonitor(monitor) {
    this.proactiveNotificationMonitor = monitor || null
  }

  getConfig() {
    return this.config
  }

  getPublicConfig() {
    return publicCodexMainConfig(this.config)
  }

  resolveAutoMonitorTarget() {
    const autoMonitor = this.config.feishu.autoMonitor || {}
    const enabledConnections = new Map(
      this.config.feishu.connections
        .filter((connection) => connection.enabled)
        .map((connection) => [connection.id, connection])
    )
    const eligibleSessions = Array.from(this.sessions.values())
      .filter((session) => (
        session.source === 'feishu'
        && ['p2p', 'group'].includes(session.chatType)
        && session.chatId
        && enabledConnections.has(session.connectionId)
      ))
      .sort((left, right) => (
        Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
      ))
    const requestedSessionId = String(
      autoMonitor.targetSessionId || ''
    ).trim()
    let targetSession = null
    let reason = ''

    if (requestedSessionId) {
      targetSession = eligibleSessions.find(
        (session) => session.id === requestedSessionId
      ) || null
      if (!targetSession) {
        reason = '已选择的飞书会话已失效或对应机器人未启用，请重新选择。'
      }
    } else if (eligibleSessions.length === 1) {
      targetSession = eligibleSessions[0]
    } else if (eligibleSessions.length === 0) {
      reason = '没有可用的飞书会话；请先在目标单聊或群聊中发送消息。'
    } else {
      reason = '存在多个可用的飞书会话，请明确选择一个通知目标。'
    }

    const connection = targetSession
      ? enabledConnections.get(targetSession.connectionId)
      : null
    return {
      route: targetSession && connection
        ? {
            connectionId: connection.id,
            connectionName: connection.name,
            chatId: targetSession.chatId,
            sessionId: targetSession.id,
            stallMinutes: autoMonitor.stallMinutes
          }
        : null,
      reason,
      eligibleSessions
    }
  }

  getProactiveNotificationRoutes() {
    if (this.config.feishu.autoMonitor?.enabled !== true) return []
    const target = this.resolveAutoMonitorTarget()
    return target.route ? [target.route] : []
  }

  getAutoMonitorState() {
    const config = this.config.feishu.autoMonitor || {}
    const target = this.resolveAutoMonitorTarget()
    if (config.enabled !== true) {
      return {
        enabled: false,
        running: false,
        screenState: this.screenLocked ? 'locked' : 'unlocked',
        status: 'disabled',
        reason: '自动监控已关闭。',
        targetSessionId: String(config.targetSessionId || ''),
        eligibleSessionIds: target.eligibleSessions.map((session) => session.id)
      }
    }
    if (!target.route) {
      return {
        enabled: true,
        running: false,
        screenState: this.screenLocked ? 'locked' : 'unlocked',
        status: 'no-target',
        reason: target.reason,
        targetSessionId: String(config.targetSessionId || ''),
        eligibleSessionIds: target.eligibleSessions.map((session) => session.id)
      }
    }
    if (!this.screenLocked) {
      return {
        enabled: true,
        running: false,
        screenState: 'unlocked',
        status: 'paused',
        reason: '亮屏状态下已暂停；锁屏后会自动开始监控。',
        targetSessionId: target.route.sessionId,
        eligibleSessionIds: target.eligibleSessions.map((session) => session.id)
      }
    }
    return {
      enabled: true,
      running: this.autoMonitorRunning,
      screenState: 'locked',
      status: this.autoMonitorRunning ? 'monitoring' : 'starting',
      reason: this.autoMonitorRunning
        ? '锁屏期间正在监控 Codex 任务。'
        : '锁屏事件已触发，正在建立监控基线。',
      targetSessionId: target.route.sessionId,
      eligibleSessionIds: target.eligibleSessions.map((session) => session.id)
    }
  }

  async handleScreenLock() {
    this.screenLocked = true
    if (this.config.feishu.autoMonitor?.enabled !== true) {
      this.broadcastState()
      return false
    }
    if (!this.resolveAutoMonitorTarget().route) {
      this.autoMonitorRunning = false
      this.proactiveNotificationMonitor?.stop?.({ rebaseline: true })
      this.broadcastState()
      return false
    }
    this.broadcastState()
    this.autoMonitorRunning = await this.proactiveNotificationMonitor?.start?.()
      === true
    this.broadcastState()
    return this.autoMonitorRunning
  }

  handleScreenUnlock() {
    this.screenLocked = false
    if (this.config.feishu.autoMonitor?.enabled !== true) {
      this.broadcastState()
      return false
    }
    this.proactiveNotificationMonitor?.stop?.({ rebaseline: true })
    this.autoMonitorRunning = false
    this.broadcastState()
    return true
  }

  async handleFeishuMonitorControl(payload = {}) {
    const intent = parseFeishuMonitorControlIntent(payload.text)
    if (!intent) return null
    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      return null
    }

    const chatType = String(payload.chatType || '').trim().toLowerCase()
    if (!['p2p', 'group'].includes(chatType)) {
      return {
        handled: true,
        action: intent,
        text: '当前飞书会话类型不支持自动监控控制。'
      }
    }

    const connectionId = String(payload.connectionId || '').trim()
    const chatId = String(payload.chatId || '').trim()
    const connection = this.config.feishu.connections.find((item) => (
      item.enabled
      && item.id === connectionId
    ))
    if (!connection || !chatId) {
      return {
        handled: true,
        action: intent,
        text: '当前飞书会话没有可用的机器人连接，无法更新自动监控。'
      }
    }

    const session = this.getOrCreateFeishuSession({
      ...payload,
      connectionId,
      connectionName: payload.connectionName || connection.name,
      chatId,
      chatType
    })

    if (intent === 'status') {
      const state = this.getAutoMonitorState()
      const target = this.resolveAutoMonitorTarget().route
      if (!state.enabled) {
        return {
          handled: true,
          action: intent,
          text: '自动监控已关闭。发送“开始监控”即可绑定当前会话并开启。'
        }
      }
      if (target?.sessionId !== session.id) {
        return {
          handled: true,
          action: intent,
          text: '自动监控已开启，但通知目标不是当前会话。发送“开始监控”可切换到这里。'
        }
      }
      return {
        handled: true,
        action: intent,
        text: `自动监控已绑定当前会话。${state.reason}`
      }
    }

    if (intent === 'stop') {
      this.config = normalizeCodexMainConfig({
        feishu: {
          autoMonitor: {
            enabled: false
          }
        }
      }, this.config)
      this.store.set(CONFIG_STORE_KEY, this.config)
      this.proactiveNotificationMonitor?.stop?.({ disabled: true })
      this.autoMonitorRunning = false
      this.broadcastState()
      return {
        handled: true,
        action: intent,
        text: '已停止自动监控。后续锁屏不会启动，也不会再主动推送任务进展。'
      }
    }

    this.config = normalizeCodexMainConfig({
      feishu: {
        autoMonitor: {
          enabled: true,
          targetSessionId: session.id
        }
      }
    }, this.config)
    this.store.set(CONFIG_STORE_KEY, this.config)
    if (this.screenLocked) {
      await this.handleScreenLock()
    } else {
      this.proactiveNotificationMonitor?.stop?.({ rebaseline: true })
      this.autoMonitorRunning = false
      this.broadcastState()
    }
    const state = this.getAutoMonitorState()
    const lifecycleText = state.running
      ? '当前处于锁屏状态，已经开始监控。'
      : (
          state.screenState === 'locked'
            ? '当前处于锁屏状态，但监控尚未成功启动，请检查飞书连接状态。'
            : '当前亮屏，监控暂时暂停；锁屏后会自动开始。'
        )
    return {
      handled: true,
      action: intent,
      text: [
        '已开启自动监控并绑定到当前会话。',
        lifecycleText,
        '其他 Codex 任务出现关键进展、完成、失败、停滞或待处理状态时，会主动同步到这里。'
      ].join('\n')
    }
  }

  persistSessions() {
    this.store.set(SESSIONS_STORE_KEY, Array.from(this.sessions.values()))
    this.store.set(ACTIVE_SESSION_STORE_KEY, this.activeSessionId)
  }

  getSession(sessionId = this.activeSessionId) {
    const normalizedId = String(sessionId || '').trim()
    return this.sessions.get(normalizedId) || null
  }

  getSessionQueue(sessionId) {
    const normalizedId = String(sessionId || '').trim()
    if (!this.sessionQueues.has(normalizedId)) {
      this.sessionQueues.set(normalizedId, [])
    }
    return this.sessionQueues.get(normalizedId)
  }

  getActiveTasksForSession(sessionId) {
    const normalizedId = String(sessionId || '').trim()
    return Array.from(this.activeTasks.values())
      .filter((task) => task.sessionId === normalizedId)
      .sort((left, right) => (
        Number(left.createdAt || 0) - Number(right.createdAt || 0)
      ))
  }

  getLatestActiveTask(sessionId) {
    return this.getActiveTasksForSession(sessionId).at(-1) || null
  }

  requestApplicationRestart(activeTask = null) {
    if (!activeTask || typeof activeTask !== 'object') {
      throw new Error('找不到发起 OpenGit 重启的会话任务')
    }
    if (!this.scheduleApplicationRestart) {
      throw new Error('当前 OpenGit 运行环境不支持应用内重启')
    }
    const alreadyRequested = activeTask.restartApplicationRequested === true
    activeTask.restartApplicationRequested = true
    return {
      status: 'restart_pending',
      alreadyRequested,
      message: 'OpenGit 将在本条回复完成后自动重启；其他正在运行的 OpenGit 任务会被中断。'
    }
  }

  triggerRequestedApplicationRestart(activeTask) {
    if (
      activeTask?.restartApplicationRequested !== true
      || activeTask?.applicationRestartScheduled === true
      || !this.scheduleApplicationRestart
    ) return
    activeTask.applicationRestartScheduled = true
    queueMicrotask(() => {
      try {
        Promise.resolve(this.scheduleApplicationRestart({
          reason: 'codex-session',
          sessionId: activeTask.sessionId,
          threadId: activeTask.threadId
        })).catch((error) => {
          this.safeError('[Codex Main] 安排 OpenGit 重启失败:', error.message)
        })
      } catch (error) {
        this.safeError('[Codex Main] 安排 OpenGit 重启失败:', error.message)
      }
    })
  }

  getWorkerHistory(sessionId) {
    const normalizedId = String(sessionId || '').trim()
    return this.workerHistories.get(normalizedId) || []
  }

  persistWorkerHistories() {
    this.store.set(
      WORKER_HISTORY_STORE_KEY,
      Object.fromEntries(this.workerHistories.entries())
    )
  }

  appendWorkerHistory(sessionId, items = []) {
    const normalizedId = String(sessionId || '').trim()
    if (!normalizedId || !Array.isArray(items) || items.length === 0) return []
    const messages = [...this.getWorkerHistory(normalizedId)]
    const seenIds = new Set(messages.map((message) => message.id))
    for (const item of items) {
      const message = normalizeWorkerHistoryMessage(item, messages.length)
      if (!message || seenIds.has(message.id)) continue
      seenIds.add(message.id)
      messages.push(message)
    }
    messages.sort((left, right) => (
      Number(left.createdAt || 0) - Number(right.createdAt || 0)
    ))
    const limited = messages.slice(-MAX_HISTORY_MESSAGES)
    this.workerHistories.set(normalizedId, limited)
    this.persistWorkerHistories()
    return limited
  }

  getWorkerContext(sessionId) {
    const selected = []
    let totalChars = 0
    const contextCandidates = [
      ...this.getWorkerHistory(sessionId),
      ...this.getActiveTasksForSession(sessionId).map((task) => ({
        id: `active-user:${task.jobId}`,
        role: 'user',
        text: task.text,
        status: 'running',
        source: 'feishu',
        createdAt: task.createdAt
      }))
    ].sort((left, right) => (
      Number(left.createdAt || 0) - Number(right.createdAt || 0)
    ))
    for (let index = contextCandidates.length - 1; index >= 0; index -= 1) {
      const message = contextCandidates[index]
      const text = String(message?.text || '').trim()
      if (!text) continue
      const nextChars = text.length + 16
      if (
        selected.length >= MAX_WORKER_CONTEXT_MESSAGES
        || (selected.length > 0 && totalChars + nextChars > MAX_WORKER_CONTEXT_CHARS)
      ) break
      selected.unshift({ ...message })
      totalChars += nextChars
    }
    return selected
  }

  recordWorkerTaskHistory(task, result = null, error = null) {
    if (task?.useWorkerThread !== true || task.historyRecorded === true) return
    task.historyRecorded = true
    const createdAt = Number(task.createdAt) || Date.now()
    const historyItems = [{
      id: `user:${task.jobId}`,
      role: 'user',
      text: task.text,
      status: 'completed',
      source: 'feishu',
      createdAt
    }]
    if (error) {
      historyItems.push({
        id: `agent-error:${task.jobId}`,
        role: 'assistant',
        text: `执行失败：${error?.message || String(error)}`,
        status: 'error',
        source: 'codex',
        createdAt: Date.now()
      })
    } else {
      const messageItems = Array.isArray(result?.messageItems)
        ? result.messageItems
        : []
      if (messageItems.length > 0) {
        messageItems.forEach((item, index) => {
          historyItems.push({
            id: String(item?.id || `agent:${task.jobId}:${index}`),
            role: 'assistant',
            text: item?.text,
            status: 'completed',
            source: 'codex',
            createdAt: Date.now() + index
          })
        })
      } else if (String(result?.text || '').trim()) {
        historyItems.push({
          id: `agent:${task.jobId}`,
          role: 'assistant',
          text: result.text,
          status: 'completed',
          source: 'codex',
          createdAt: Date.now()
        })
      }
    }
    this.appendWorkerHistory(task.sessionId, historyItems)
  }

  getPublicSession(session) {
    if (!session) return null
    const activeTasks = this.getActiveTasksForSession(session.id)
    const activeTask = activeTasks.at(-1) || null
    return {
      ...session,
      turnStatus: activeTask ? 'running' : 'idle',
      activeTurnId: activeTask?.turnId || '',
      activeTaskCount: activeTasks.length,
      queueLength: this.getSessionQueue(session.id).length
    }
  }

  listSessions() {
    return Array.from(this.sessions.values())
      .sort((left, right) => (
        Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
          || Number(right.createdAt || 0) - Number(left.createdAt || 0)
      ))
      .map((session) => this.getPublicSession(session))
  }

  touchSession(sessionId, changes = {}) {
    const session = this.getSession(sessionId)
    if (!session) return null
    Object.assign(session, changes, { updatedAt: Date.now() })
    session.lastMessage = compactSessionText(session.lastMessage)
    if (session.id === MAIN_SESSION_ID) session.title = '主会话'
    this.persistSessions()
    return session
  }

  setProjectBinding(sessionId, binding) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    const projectBinding = normalizeProjectBinding(binding)
    if (!projectBinding) throw new Error('项目绑定信息无效')
    this.touchSession(session.id, { projectBinding })
    this.broadcastState()
    return { ...projectBinding }
  }

  clearProjectBinding(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    const previousBinding = normalizeProjectBinding(session.projectBinding)
    this.touchSession(session.id, { projectBinding: null })
    this.broadcastState()
    return previousBinding
  }

  createUiSession() {
    const now = Date.now()
    const session = {
      id: `ui:${randomUUID()}`,
      title: '新会话',
      source: 'ui',
      connectionId: '',
      connectionName: '',
      chatId: '',
      chatType: '',
      threadId: '',
      toolVersion: PROJECT_ROUTING_TOOL_VERSION,
      projectBinding: null,
      lastMessage: '',
      createdAt: now,
      updatedAt: now
    }
    this.sessions.set(session.id, session)
    this.activeSessionId = session.id
    this.persistSessions()
    this.broadcastState()
    return this.getPublicSession(session)
  }

  getOrCreateFeishuSession(payload = {}) {
    const chatId = String(payload.chatId || '').trim()
    if (!chatId) throw new Error('飞书消息缺少 chat_id')
    const connectionId = String(payload.connectionId || 'default').trim() || 'default'
    const connectionName = compactSessionText(payload.connectionName, 30)
    const existing = Array.from(this.sessions.values()).find((session) => (
      session.source === 'feishu'
      && session.connectionId === connectionId
      && session.chatId === chatId
    ))
    if (existing) {
      const chatType = String(payload.chatType || existing.chatType || '').trim().toLowerCase()
      existing.chatType = chatType
      existing.connectionName = connectionName || existing.connectionName
      existing.title = buildFeishuSessionTitle(
        chatType,
        chatId,
        existing.connectionName
      )
      this.persistSessions()
      return existing
    }

    const now = Date.now()
    const session = {
      id: createFeishuSessionId(chatId, connectionId),
      title: buildFeishuSessionTitle(payload.chatType, chatId, connectionName),
      source: 'feishu',
      connectionId,
      connectionName,
      chatId,
      chatType: String(payload.chatType || '').trim().toLowerCase(),
      threadId: '',
      toolVersion: PROJECT_ROUTING_TOOL_VERSION,
      projectBinding: null,
      lastMessage: '',
      createdAt: now,
      updatedAt: now
    }
    this.sessions.set(session.id, session)
    this.persistSessions()
    this.broadcastState()
    return session
  }

  selectSession(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    this.activeSessionId = session.id
    this.persistSessions()
    this.broadcastState()
    return this.getPublicSession(session)
  }

  async deleteSession(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    const queue = this.getSessionQueue(session.id)
    if (
      this.getActiveTasksForSession(session.id).length > 0
      || this.processingSessionIds.has(session.id)
      || queue.length > 0
    ) {
      throw new Error('当前会话仍有执行中或排队中的任务，请先等待完成或中断任务')
    }

    if (this.ensureThreadPromises.has(session.id)) {
      await this.ensureThreadPromises.get(session.id)
    }
    const threadId = String(session.threadId || '').trim()
    if (threadId) {
      await this.request('thread/delete', { threadId }, 60 * 1000)
    }

    const isMainSession = session.id === MAIN_SESSION_ID
    if (isMainSession) {
      this.sessions.set(MAIN_SESSION_ID, createDefaultSession())
    } else {
      this.sessions.delete(session.id)
    }
    this.loadedSessionIds.delete(session.id)
    this.ensureThreadPromises.delete(session.id)
    this.sessionQueues.delete(session.id)
    this.workerHistories.delete(session.id)
    this.persistWorkerHistories()
    for (const messageKey of Array.from(this.liveMessages.keys())) {
      if (messageKey.startsWith(`${session.id}:`)) {
        this.liveMessages.delete(messageKey)
      }
    }

    if (this.activeSessionId === session.id && !isMainSession) {
      this.activeSessionId = this.listSessions()[0]?.id || MAIN_SESSION_ID
    }
    this.persistSessions()
    this.broadcast('history-reset', { sessionId: session.id })
    this.broadcastState()
    return {
      deleted: true,
      reset: isMainSession,
      activeSessionId: this.activeSessionId
    }
  }

  getState() {
    const activeSession = this.getSession() || this.getSession(MAIN_SESSION_ID)
    const activeTask = activeSession
      ? this.getLatestActiveTask(activeSession.id)
      : null
    const activeQueue = activeSession
      ? this.getSessionQueue(activeSession.id)
      : []
    return {
      serverStatus: this.serverStatus,
      serverError: this.serverError,
      account: this.account
        ? {
            type: this.account.type || '',
            email: this.account.email || '',
            planType: this.account.planType || ''
          }
        : null,
      requiresOpenaiAuth: this.requiresOpenaiAuth,
      sessions: this.listSessions(),
      activeSessionId: activeSession?.id || '',
      threadId: activeSession?.threadId || '',
      turnStatus: activeTask ? 'running' : 'idle',
      activeTurnId: activeTask?.turnId || '',
      queueLength: activeQueue.length,
      activeTaskCount: this.activeTasks.size,
      totalQueueLength: Array.from(this.sessionQueues.values())
        .reduce((total, queue) => total + queue.length, 0),
      workingDirectory: resolveWorkingDirectory(this.config.workingDirectory),
      sandboxMode: this.config.sandboxMode,
      feishu: {
        ...(this.feishuBridge?.getStatus?.() || {
          enabled: this.config.feishu.connections.some((connection) => connection.enabled),
          running: false,
          status: 'disabled',
          error: '',
          connections: this.config.feishu.connections.map((connection) => ({
            id: connection.id,
            name: connection.name,
            enabled: connection.enabled,
            running: false,
            status: 'disabled',
            error: ''
          }))
        }),
        autoMonitor: this.getAutoMonitorState()
      }
    }
  }

  broadcast(type, payload = {}) {
    const message = {
      type,
      ...payload
    }
    const targetWindow = this.getMainWindow?.()
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send('codex-main-session-event', message)
    }
  }

  broadcastState() {
    this.broadcast('state', { state: this.getState() })
  }

  setServerStatus(status, error = '') {
    this.serverStatus = status
    this.serverError = String(error || '')
    this.broadcastState()
  }

  sendRaw(message) {
    if (!this.child || this.child.stdin.destroyed) {
      throw new Error('Codex app-server 未连接')
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  handleRpcMessage(message) {
    if (!message || typeof message !== 'object') return

    if (message.id === 0 && this.serverStatus === 'starting') {
      if (message.error) {
        const error = createRpcError(message.error, 'Codex app-server 初始化失败')
        clearTimeout(this.startTimer)
        this.startTimer = null
        this.startReject?.(error)
        this.startResolve = null
        this.startReject = null
        this.setServerStatus('error', error.message)
        try {
          this.child?.kill('SIGTERM')
        } catch (killError) {}
        return
      }
      clearTimeout(this.startTimer)
      this.startTimer = null
      this.sendRaw({ method: 'initialized', params: {} })
      this.restartAttempt = 0
      this.setServerStatus('ready')
      this.startResolve?.(true)
      this.startResolve = null
      this.startReject = null
      void this.refreshAccount().catch((error) => {
        this.safeError('[Codex Main] 读取账户失败:', error.message)
      })
      void this.drainQueues()
      return
    }

    if (message.id != null && message.method === 'item/tool/call') {
      const respond = (result) => {
        try {
          this.sendRaw({ id: message.id, result })
        } catch (error) {
          this.safeError('[Codex Main] 项目路由工具结果回传失败:', error.message)
        }
      }
      Promise.resolve(
        this.projectSessionRouter.handleToolCall(message.params || {})
      ).then(respond).catch((error) => {
        respond({
          success: false,
          contentItems: [{
            type: 'inputText',
            text: error?.message || String(error)
          }]
        })
      })
      return
    }

    if (message.id != null && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)
      this.pendingRequests.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) {
        pending.reject(createRpcError(message.error))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.id != null && message.method) {
      this.sendRaw({
        id: message.id,
        error: {
          code: -32601,
          message: `OpenGit 暂不处理服务端请求：${message.method}`
        }
      })
      return
    }

    if (message.method) {
      this.handleNotification(message.method, message.params || {})
    }
  }

  collectTurnResponseItems(activeTask, completedTurn = {}) {
    const responseItems = []
    const seenItemIds = new Set()
    const appendMessage = (itemId, text) => {
      const normalizedText = String(text || '').trim()
      if (!normalizedText) return
      const normalizedItemId = String(itemId || '').trim()
      if (normalizedItemId && seenItemIds.has(normalizedItemId)) return
      if (normalizedItemId) seenItemIds.add(normalizedItemId)
      responseItems.push({
        id: normalizedItemId,
        text: normalizedText
      })
    }

    for (const itemId of activeTask?.agentMessageIds || []) {
      const messageKey = `${activeTask.sessionId}:${itemId}`
      appendMessage(itemId, this.liveMessages.get(messageKey)?.text)
    }
    for (const item of Array.isArray(completedTurn?.items) ? completedTurn.items : []) {
      if (item?.type !== 'agentMessage') continue
      appendMessage(item.id, item.text)
    }
    return responseItems
  }

  handleNotification(method, params) {
    if (method === 'account/updated') {
      this.account = this.account
        ? { ...this.account, planType: params?.planType || this.account.planType || '' }
        : this.account
      this.broadcastState()
      return
    }
    const threadId = String(params?.threadId || '').trim()
    if (
      threadId
      && (
        method === 'turn/completed'
        || method === 'thread/status/changed'
        || method === 'thread/closed'
      )
    ) {
      this.wakeProjectThreadWaiters(threadId)
    }
    const managedProjectTurn = threadId
      ? this.managedProjectTurns.get(threadId)
      : null
    if (managedProjectTurn) {
      if (method === 'turn/started') {
        managedProjectTurn.turnId = String(
          params?.turn?.id || managedProjectTurn.turnId || ''
        ).trim()
        return
      }
      if (method === 'item/completed') {
        const item = params?.item
        if (item?.type === 'agentMessage' && String(item.text || '').trim()) {
          const itemId = String(
            item.id || `agent:${managedProjectTurn.agentMessages.size}`
          )
          managedProjectTurn.agentMessages.set(
            itemId,
            String(item.text || '').trim()
          )
        }
        return
      }
      if (method === 'turn/completed') {
        const completedTurn = params?.turn || {}
        for (const item of Array.isArray(completedTurn.items)
          ? completedTurn.items
          : []) {
          if (item?.type !== 'agentMessage' || !String(item.text || '').trim()) {
            continue
          }
          const itemId = String(
            item.id || `agent:${managedProjectTurn.agentMessages.size}`
          )
          managedProjectTurn.agentMessages.set(
            itemId,
            String(item.text || '').trim()
          )
        }
        this.managedProjectTurns.delete(threadId)
        const status = String(completedTurn.status || 'completed')
        const messages = Array.from(managedProjectTurn.agentMessages.values())
        const fallbackText = status === 'interrupted'
          ? '任务已中断。'
          : '任务已完成。'
        if (status === 'failed') {
          const errorText = completedTurn?.error?.message
            || completedTurn?.error
            || 'Codex 项目任务执行失败'
          managedProjectTurn.reject(new Error(String(errorText)))
        } else {
          managedProjectTurn.resolve({
            threadId,
            turnId: String(
              completedTurn.id || managedProjectTurn.turnId || ''
            ).trim(),
            status,
            text: messages.join('\n\n') || fallbackText,
            messages: messages.length > 0 ? messages : [fallbackText]
          })
        }
        return
      }
    }
    const activeTask = threadId
      ? this.activeTasksByThreadId.get(threadId)
      : (this.activeTasks.size === 1 ? this.activeTasks.values().next().value : null)
    if (!activeTask) return

    if (method === 'turn/started') {
      activeTask.turnId = params?.turn?.id || activeTask.turnId
      this.broadcastState()
      return
    }

    if (method === 'item/agentMessage/delta') {
      const itemId = String(params?.itemId || `agent:${activeTask.turnId || activeTask.jobId}`)
      const messageKey = `${activeTask.sessionId}:${itemId}`
      const current = this.liveMessages.get(messageKey) || {
        id: itemId,
        role: 'assistant',
        text: '',
        status: 'streaming',
        source: 'codex',
        createdAt: Date.now()
      }
      current.text += String(params?.delta || '')
      current.status = 'streaming'
      this.liveMessages.set(messageKey, current)
      activeTask.agentMessageIds.add(itemId)
      this.broadcast('message', {
        sessionId: activeTask.sessionId,
        message: { ...current }
      })
      return
    }

    if (method === 'item/completed') {
      const item = params?.item
      if (item?.type !== 'agentMessage') return
      const itemId = String(item.id || `agent:${activeTask.turnId || activeTask.jobId}`)
      const messageKey = `${activeTask.sessionId}:${itemId}`
      const current = this.liveMessages.get(messageKey) || {
        id: itemId,
        role: 'assistant',
        text: '',
        status: 'completed',
        source: 'codex',
        createdAt: Date.now()
      }
      current.text = String(item.text || current.text || '').trim()
      current.status = 'completed'
      this.liveMessages.set(messageKey, current)
      activeTask.agentMessageIds.add(itemId)
      if (current.text) activeTask.finalText = current.text
      this.broadcast('message', {
        sessionId: activeTask.sessionId,
        message: { ...current }
      })
      if (
        current.text
        && typeof activeTask.onAgentMessage === 'function'
        && !activeTask.forwardedAgentMessageIds.has(itemId)
      ) {
        activeTask.forwardedAgentMessageIds.add(itemId)
        try {
          Promise.resolve(activeTask.onAgentMessage({
            id: itemId,
            text: current.text
          })).catch((error) => {
            this.safeError('[Codex Main] 实时回传飞书消息失败:', error.message)
          })
        } catch (error) {
          this.safeError('[Codex Main] 实时回传飞书消息失败:', error.message)
        }
      }
      return
    }

    if (method === 'turn/completed') {
      const completedTurn = params?.turn || {}
      activeTask.turnId = completedTurn.id || activeTask.turnId
      const responseItems = this.collectTurnResponseItems(
        activeTask,
        completedTurn
      )
      const fallbackText = activeTask.finalText
        || (String(completedTurn.status || 'completed') === 'interrupted'
          ? '任务已中断。'
          : '任务已完成。')
      const replyItems = responseItems.length > 0
        ? responseItems
        : [{ id: '', text: fallbackText }]
      const replyMessages = replyItems.map((item) => item.text)
      activeTask.finalText = replyMessages.join('\n\n')
      const status = String(completedTurn.status || 'completed')
      const errorText = completedTurn?.error?.message || completedTurn?.error || ''
      if (status === 'failed') {
        activeTask.reject(new Error(String(errorText || 'Codex 任务执行失败')))
      } else {
        activeTask.resolve({
          jobId: activeTask.jobId,
          sessionId: activeTask.sessionId,
          turnId: activeTask.turnId,
          threadId: activeTask.threadId,
          status,
          text: activeTask.finalText,
          messages: replyMessages,
          messageItems: replyItems
        })
      }
    }
  }

  handleStdout(chunk) {
    this.stdoutRemainder += chunk
    const lines = this.stdoutRemainder.split('\n')
    this.stdoutRemainder = lines.pop() || ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      try {
        this.handleRpcMessage(JSON.parse(line))
      } catch (error) {
        this.safeError('[Codex Main] 无法解析 app-server 消息:', error.message)
      }
    }
  }

  failPending(error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pendingRequests.clear()
    for (const activeTask of Array.from(this.activeTasks.values())) {
      activeTask.reject(error)
    }
    for (const managedTurn of this.managedProjectTurns.values()) {
      managedTurn.reject(error)
    }
    this.managedProjectTurns.clear()
    for (const queue of this.projectTaskQueues.values()) {
      for (const queuedTask of queue.splice(0)) {
        queuedTask.cancelled = true
        queuedTask.reject(error)
      }
    }
    for (const threadId of this.projectThreadWaiters.keys()) {
      this.wakeProjectThreadWaiters(threadId)
    }
  }

  handleChildClose(code, signal) {
    const wasExpected = !this.shouldRun
    const detail = this.stderrText.trim()
    const error = new Error(
      detail || `Codex app-server 已退出 (${signal || code || 'unknown'})`
    )
    clearTimeout(this.startTimer)
    this.startTimer = null
    this.startReject?.(error)
    this.startResolve = null
    this.startReject = null
    this.resolveChildExit?.()
    this.resolveChildExit = null
    this.childExitPromise = null
    this.child = null
    this.loadedSessionIds.clear()
    this.stdoutRemainder = ''
    this.startPromise = null
    this.failPending(error)
    this.setServerStatus(wasExpected ? 'stopped' : 'error', wasExpected ? '' : error.message)
    if (!wasExpected) this.scheduleRestart()
  }

  scheduleRestart() {
    if (!this.shouldRun || this.restartTimer) return
    const delayMs = Math.min(15000, 1000 * (2 ** this.restartAttempt))
    this.restartAttempt += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.startServer().catch((error) => {
        this.safeError('[Codex Main] 自动重启失败:', error.message)
      })
    }, delayMs)
  }

  startServer() {
    this.shouldRun = true
    if (this.child && this.serverStatus === 'ready') {
      return Promise.resolve(true)
    }
    if (this.startPromise) return this.startPromise

    this.setServerStatus('starting')
    this.stderrText = ''
    this.stdoutRemainder = ''
    const homeDir = os.homedir()
    const executable = resolveCodexExecutable(homeDir)
    this.startPromise = new Promise((resolve, reject) => {
      this.startResolve = resolve
      this.startReject = reject
    }).finally(() => {
      this.startPromise = null
    })

    try {
      this.child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
        cwd: homeDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildCodexProcessEnv({ homeDir, executable }),
        shell: process.platform === 'win32' && /\.cmd$/i.test(executable),
        windowsHide: true
      })
    } catch (error) {
      this.startReject?.(error)
      this.startResolve = null
      this.startReject = null
      this.setServerStatus('error', error.message)
      return this.startPromise
    }

    this.childExitPromise = new Promise((resolve) => {
      this.resolveChildExit = resolve
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this.handleStdout(chunk))
    this.child.stderr.on('data', (chunk) => {
      this.stderrText = `${this.stderrText}${chunk}`.slice(-MAX_STDERR_LENGTH)
    })
    this.child.stdin.on('error', (error) => {
      if (this.shouldRun) this.safeError('[Codex Main] stdin 错误:', error.message)
    })
    this.child.on('error', (error) => {
      this.startReject?.(error)
      this.setServerStatus('error', error.message)
    })
    this.child.on('close', (code, signal) => this.handleChildClose(code, signal))

    this.startTimer = setTimeout(() => {
      if (this.serverStatus !== 'starting') return
      const error = new Error('Codex app-server 初始化超时')
      this.startReject?.(error)
      this.startResolve = null
      this.startReject = null
      this.setServerStatus('error', error.message)
      try {
        this.child?.kill('SIGTERM')
      } catch (killError) {}
    }, SERVER_START_TIMEOUT_MS)

    try {
      this.sendRaw({
        method: 'initialize',
        id: 0,
        params: {
          clientInfo: {
            name: 'open_git',
            title: 'OpenGit',
            version: OPEN_GIT_VERSION
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false
          }
        }
      })
    } catch (error) {
      clearTimeout(this.startTimer)
      this.startTimer = null
      this.startReject?.(error)
      this.startResolve = null
      this.startReject = null
      this.setServerStatus('error', error.message)
      try {
        this.child?.kill('SIGTERM')
      } catch (killError) {}
    }
    return this.startPromise
  }

  async stopServer() {
    this.shouldRun = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const child = this.child
    const exitPromise = this.childExitPromise
    if (!child) {
      this.setServerStatus('stopped')
      return
    }
    try {
      child.stdin.end()
    } catch (error) {}
    try {
      child.kill('SIGTERM')
    } catch (error) {}
    if (exitPromise) {
      await Promise.race([
        exitPromise,
        new Promise((resolve) => setTimeout(resolve, SERVER_STOP_TIMEOUT_MS))
      ])
    }
    if (this.child === child) {
      try {
        child.kill('SIGKILL')
      } catch (error) {}
      if (exitPromise) {
        await Promise.race([
          exitPromise,
          new Promise((resolve) => setTimeout(resolve, 300))
        ])
      }
    }
  }

  async restartServer() {
    await this.stopServer()
    return this.startServer()
  }

  async request(method, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    await this.startServer()
    if (!this.child || this.serverStatus !== 'ready') {
      throw new Error(this.serverError || 'Codex app-server 未就绪')
    }
    const id = this.requestSequence
    this.requestSequence += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Codex app-server 请求超时：${method}`))
      }, Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS))
      this.pendingRequests.set(id, { resolve, reject, timer, method })
      try {
        this.sendRaw({ method, id, params })
      } catch (error) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(error)
      }
    })
  }

  async refreshAccount() {
    const result = await this.request('account/read', { refreshToken: false })
    this.account = result?.account || null
    this.requiresOpenaiAuth = result?.requiresOpenaiAuth !== false
    this.broadcastState()
    return this.account
  }

  async ensureThread(sessionId = this.activeSessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    await this.startServer()
    if (session.threadId && this.loadedSessionIds.has(session.id)) {
      return session.threadId
    }
    if (this.ensureThreadPromises.has(session.id)) {
      return this.ensureThreadPromises.get(session.id)
    }

    const ensurePromise = this.initializeThread(session.id)
    this.ensureThreadPromises.set(session.id, ensurePromise)
    try {
      return await ensurePromise
    } finally {
      if (this.ensureThreadPromises.get(session.id) === ensurePromise) {
        this.ensureThreadPromises.delete(session.id)
      }
    }
  }

  async initializeThread(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    const cwd = resolveWorkingDirectory(this.config.workingDirectory)
    let storedThreadId = String(session.threadId || '').trim()
    if (
      storedThreadId
      && Number(session.toolVersion || 0) < PROJECT_ROUTING_TOOL_VERSION
    ) {
      this.safeLog(
        `[Codex Main] 会话 ${session.id} 将迁移到支持项目会话路由的新线程`
      )
      try {
        await this.request('thread/archive', {
          threadId: storedThreadId
        }, 60 * 1000)
      } catch (error) {
        this.safeError(
          `[Codex Main] 归档旧会话 ${storedThreadId} 失败:`,
          error.message
        )
      }
      storedThreadId = ''
      session.threadId = ''
      session.toolVersion = PROJECT_ROUTING_TOOL_VERSION
      this.loadedSessionIds.delete(session.id)
      this.persistSessions()
      this.broadcast('history-reset', { sessionId: session.id })
    }
    if (storedThreadId) {
      try {
        const result = await this.request('thread/resume', {
          threadId: storedThreadId,
          cwd,
          approvalPolicy: this.config.approvalPolicy,
          developerInstructions: MAIN_SESSION_INSTRUCTIONS,
          sandbox: this.config.sandboxMode
        })
        session.threadId = String(result?.thread?.id || storedThreadId).trim()
        session.toolVersion = PROJECT_ROUTING_TOOL_VERSION
        this.loadedSessionIds.add(session.id)
        this.persistSessions()
        this.broadcastState()
        return session.threadId
      } catch (error) {
        this.safeError(`[Codex Main] 恢复会话 ${session.id} 失败，将新建会话:`, error.message)
        session.threadId = ''
        this.loadedSessionIds.delete(session.id)
        this.persistSessions()
      }
    }

    const result = await this.request('thread/start', {
      cwd,
      approvalPolicy: this.config.approvalPolicy,
      developerInstructions: MAIN_SESSION_INSTRUCTIONS,
      sandbox: this.config.sandboxMode,
      ephemeral: false,
      threadSource: 'open_git_main_session',
      dynamicTools: CODEX_PROJECT_DYNAMIC_TOOLS
    })
    const threadId = String(result?.thread?.id || '').trim()
    if (!threadId) throw new Error('Codex app-server 未返回会话 ID')
    session.threadId = threadId
    session.toolVersion = PROJECT_ROUTING_TOOL_VERSION
    this.loadedSessionIds.add(session.id)
    this.persistSessions()
    try {
      await this.request('thread/name/set', {
        threadId,
        name: `OpenGit · ${session.title}`
      })
    } catch (error) {}
    this.broadcastState()
    return threadId
  }

  async getHistory(sessionId = this.activeSessionId) {
    const session = this.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已失效')
    const threadId = await this.ensureThread(session.id)
    const result = await this.request('thread/read', {
      threadId,
      includeTurns: true
    }, 60 * 1000)
    return [
      ...extractThreadMessages(result?.thread),
      ...this.getWorkerHistory(session.id)
    ].slice(-MAX_HISTORY_MESSAGES)
  }

  async createWorkerThread(task, cwd) {
    const parentThreadId = await this.ensureThread(task.sessionId)
    const commonParams = {
      cwd,
      approvalPolicy: this.config.approvalPolicy,
      developerInstructions: MAIN_SESSION_INSTRUCTIONS,
      sandbox: this.config.sandboxMode,
      ephemeral: true,
      threadSource: 'open_git_feishu_worker'
    }
    try {
      const forked = await this.request('thread/fork', {
        threadId: parentThreadId,
        ...commonParams
      }, 60 * 1000)
      const threadId = String(forked?.thread?.id || '').trim()
      if (!threadId) throw new Error('Codex app-server 未返回子会话 ID')
      return { threadId, parentThreadId, forked: true }
    } catch (error) {
      if (!shouldFallbackFromThreadFork(error)) throw error
      this.safeError(
        '[Codex Main] 当前父会话无法 fork，改用独立临时 worker:',
        error.message
      )
      const started = await this.request('thread/start', {
        ...commonParams,
        dynamicTools: CODEX_PROJECT_DYNAMIC_TOOLS
      }, 60 * 1000)
      const threadId = String(started?.thread?.id || '').trim()
      if (!threadId) throw new Error('Codex app-server 未返回 worker 会话 ID')
      return { threadId, parentThreadId, forked: false }
    }
  }

  getProjectTaskQueue(threadId) {
    const normalizedThreadId = String(threadId || '').trim()
    if (!this.projectTaskQueues.has(normalizedThreadId)) {
      this.projectTaskQueues.set(normalizedThreadId, [])
    }
    return this.projectTaskQueues.get(normalizedThreadId)
  }

  wakeProjectThreadWaiters(threadId) {
    const normalizedThreadId = String(threadId || '').trim()
    const waiters = this.projectThreadWaiters.get(normalizedThreadId)
    if (!waiters) return
    this.projectThreadWaiters.delete(normalizedThreadId)
    for (const wake of waiters) wake()
  }

  waitForProjectThreadSignal(threadId) {
    const normalizedThreadId = String(threadId || '').trim()
    return new Promise((resolve) => {
      let settled = false
      let timer = null
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const waiters = this.projectThreadWaiters.get(normalizedThreadId)
        waiters?.delete(finish)
        if (waiters?.size === 0) {
          this.projectThreadWaiters.delete(normalizedThreadId)
        }
        resolve()
      }
      if (!this.projectThreadWaiters.has(normalizedThreadId)) {
        this.projectThreadWaiters.set(normalizedThreadId, new Set())
      }
      this.projectThreadWaiters.get(normalizedThreadId).add(finish)
      timer = setTimeout(finish, this.projectThreadPollIntervalMs)
    })
  }

  async waitForProjectThreadIdle(threadId, queuedTask = null) {
    const normalizedThreadId = String(threadId || '').trim()
    let waited = false
    while (true) {
      if (queuedTask?.cancelled === true) return waited
      const result = await this.request('thread/read', {
        threadId: normalizedThreadId,
        includeTurns: false
      }, 60 * 1000)
      if (queuedTask?.cancelled === true) return waited
      const status = String(result?.thread?.status?.type || '').trim()
      if (status !== 'active') return waited
      waited = true
      await this.waitForProjectThreadSignal(normalizedThreadId)
    }
  }

  enqueueCodexProjectTask({
    threadId = '',
    cwd = '',
    task = ''
  } = {}) {
    const normalizedThreadId = String(threadId || '').trim()
    const normalizedTask = String(task || '').trim()
    if (!normalizedThreadId) throw new Error('缺少要排队的项目会话 ID')
    if (!normalizedTask) throw new Error('项目任务不能为空')
    const queue = this.getProjectTaskQueue(normalizedThreadId)
    const queuedAtEnqueue = (
      this.processingProjectThreadIds.has(normalizedThreadId)
      || queue.length > 0
    )
    return new Promise((resolve, reject) => {
      queue.push({
        threadId: normalizedThreadId,
        cwd: String(cwd || '').trim(),
        task: normalizedTask,
        queuedAtEnqueue,
        cancelled: false,
        resolve,
        reject
      })
      void this.drainProjectTaskQueue(normalizedThreadId)
    })
  }

  async drainProjectTaskQueue(threadId) {
    const normalizedThreadId = String(threadId || '').trim()
    const queue = this.getProjectTaskQueue(normalizedThreadId)
    if (
      this.processingProjectThreadIds.has(normalizedThreadId)
      || queue.length === 0
    ) return
    this.processingProjectThreadIds.add(normalizedThreadId)
    try {
      while (queue.length > 0) {
        const queuedTask = queue[0]
        try {
          const waitedForActiveThread = await this.waitForProjectThreadIdle(
            normalizedThreadId,
            queuedTask
          )
          if (queuedTask.cancelled) continue
          let result
          try {
            result = await this.executeCodexProjectTask({
              threadId: normalizedThreadId,
              cwd: queuedTask.cwd,
              task: queuedTask.task,
              createNew: false
            })
          } catch (error) {
            if (error?.code !== 'CODEX_PROJECT_THREAD_ACTIVE') throw error
              queuedTask.queuedAtEnqueue = true
              await this.waitForProjectThreadSignal(normalizedThreadId)
              continue
            }
          if (queue[0] === queuedTask) queue.shift()
          queuedTask.resolve({
            ...result,
            queuedForActiveThread: (
              queuedTask.queuedAtEnqueue || waitedForActiveThread
            )
          })
        } catch (error) {
          if (queue[0] === queuedTask) queue.shift()
          queuedTask.reject(error)
        }
      }
    } finally {
      this.processingProjectThreadIds.delete(normalizedThreadId)
      if (
        queue.length === 0
        && this.projectTaskQueues.get(normalizedThreadId) === queue
      ) {
        this.projectTaskQueues.delete(normalizedThreadId)
      }
    }
  }

  async executeCodexProjectTask({
    threadId = '',
    cwd = '',
    task = '',
    createNew = false
  } = {}) {
    const normalizedTask = String(task || '').trim()
    if (!normalizedTask) throw new Error('项目任务不能为空')
    await this.startServer()

    let resolvedThreadId = String(threadId || '').trim()
    const requestedCwd = String(cwd || '').trim()
    if (!requestedCwd || !path.isAbsolute(requestedCwd)) {
      throw new Error('项目任务缺少有效的绝对工作目录')
    }
    let resolvedCwd = resolveWorkingDirectory(requestedCwd)
    if (resolvedCwd !== path.resolve(requestedCwd)) {
      throw new Error(`项目工作目录不存在：${requestedCwd}`)
    }
    if (createNew) {
      const started = await this.request('thread/start', {
        cwd: resolvedCwd,
        approvalPolicy: this.config.approvalPolicy,
        sandbox: this.config.sandboxMode,
        ephemeral: false,
        threadSource: 'open_git_project_task'
      }, 60 * 1000)
      resolvedThreadId = String(started?.thread?.id || '').trim()
      resolvedCwd = resolveWorkingDirectory(
        started?.thread?.cwd || resolvedCwd
      )
      if (!resolvedThreadId) {
        throw new Error('Codex app-server 未返回新项目会话 ID')
      }
      try {
        await this.request('thread/name/set', {
          threadId: resolvedThreadId,
          name: compactSessionText(
            `OpenGit · ${path.basename(resolvedCwd)} · ${normalizedTask}`,
            72
          )
        })
      } catch {}
    } else {
      if (!resolvedThreadId) throw new Error('缺少要恢复的项目会话 ID')
      if (this.managedProjectTurns.has(resolvedThreadId)) {
        const error = new Error('目标项目会话正在执行')
        error.code = 'CODEX_PROJECT_THREAD_ACTIVE'
        throw error
      }
      const resumed = await this.request('thread/resume', {
        threadId: resolvedThreadId,
        cwd: resolvedCwd,
        approvalPolicy: this.config.approvalPolicy,
        sandbox: this.config.sandboxMode
      }, 60 * 1000)
      resolvedThreadId = String(
        resumed?.thread?.id || resolvedThreadId
      ).trim()
      resolvedCwd = resolveWorkingDirectory(
        resumed?.thread?.cwd || resolvedCwd
      )
      if (String(resumed?.thread?.status?.type || '') === 'active') {
        const error = new Error('目标项目会话正在执行')
        error.code = 'CODEX_PROJECT_THREAD_ACTIVE'
        throw error
      }
    }

    if (this.managedProjectTurns.has(resolvedThreadId)) {
      const error = new Error('目标项目会话正在执行')
      error.code = 'CODEX_PROJECT_THREAD_ACTIVE'
      throw error
    }

    let resolveCompletion
    let rejectCompletion
    const completionPromise = new Promise((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })
    const managedTurn = {
      threadId: resolvedThreadId,
      turnId: '',
      cwd: resolvedCwd,
      agentMessages: new Map(),
      resolve: resolveCompletion,
      reject: rejectCompletion
    }
    this.managedProjectTurns.set(resolvedThreadId, managedTurn)

    try {
      const response = await this.request('turn/start', {
        threadId: resolvedThreadId,
        input: [{ type: 'text', text: normalizedTask }],
        cwd: resolvedCwd,
        approvalPolicy: this.config.approvalPolicy,
        sandboxPolicy: buildTurnSandboxPolicy(this.config, resolvedCwd),
        ...(this.config.reasoningEffort
          ? { effort: this.config.reasoningEffort }
          : {})
      }, 60 * 1000)
      managedTurn.turnId = String(
        response?.turn?.id || managedTurn.turnId || ''
      ).trim()
    } catch (error) {
      if (this.managedProjectTurns.get(resolvedThreadId) === managedTurn) {
        this.managedProjectTurns.delete(resolvedThreadId)
      }
      if (
        !createNew
        && /(?:active|running|in.?progress|正在执行)/i.test(
          String(error?.message || '')
        )
      ) {
        error.code = 'CODEX_PROJECT_THREAD_ACTIVE'
      }
      throw error
    }

    const result = await completionPromise
    return {
      ...result,
      cwd: resolvedCwd,
      createdNewSession: createNew === true
    }
  }

  enqueueInstruction({
    text,
    source = 'ui',
    sessionId = '',
    metadata = {},
    attachments = [],
    attachmentWorkspace = null,
    onAgentMessage = null
  } = {}) {
    const normalizedText = String(text || '').trim()
    if (!normalizedText) {
      throw new Error('请输入指令')
    }
    const normalizedSource = source === 'feishu' ? 'feishu' : 'ui'
    const session = normalizedSource === 'feishu'
      ? this.getOrCreateFeishuSession(metadata)
      : this.getSession(sessionId || this.activeSessionId)
    if (!session) throw new Error('会话不存在或已失效')
    if (
      session.source === 'ui'
      && session.id !== MAIN_SESSION_ID
      && session.title === '新会话'
    ) {
      session.title = compactSessionText(normalizedText, 30) || '新会话'
    }
    this.touchSession(session.id, { lastMessage: normalizedText })

    const jobId = randomUUID()
    const createdAt = Date.now()
    const userMessage = {
      id: `user:${jobId}`,
      role: 'user',
      text: normalizedText,
      status: 'completed',
      source: normalizedSource,
      createdAt
    }
    this.broadcast('message', {
      sessionId: session.id,
      message: userMessage
    })

    return new Promise((resolve, reject) => {
      const task = {
        jobId,
        sessionId: session.id,
        text: normalizedText,
        source: normalizedSource,
        metadata,
        createdAt,
        attachments: Array.isArray(attachments) ? attachments : [],
        attachmentWorkspace,
        useWorkerThread: normalizedSource === 'feishu',
        contextMessages: normalizedSource === 'feishu'
          ? this.getWorkerContext(session.id)
          : [],
        onAgentMessage: typeof onAgentMessage === 'function'
          ? onAgentMessage
          : null,
        resolve,
        reject
      }
      if (task.useWorkerThread) {
        this.broadcastState()
        void this.executeTask(task)
        return
      }
      this.getSessionQueue(session.id).push(task)
      this.broadcastState()
      void this.drainSessionQueue(session.id)
    })
  }

  async executeTask(task) {
    try {
      const result = await this.runTask(task)
      this.recordWorkerTaskHistory(task, result)
      task.resolve(result)
      return result
    } catch (error) {
      this.recordWorkerTaskHistory(task, null, error)
      const errorMessage = {
        id: `agent-error:${task.jobId}`,
        role: 'assistant',
        text: `执行失败：${error?.message || String(error)}`,
        status: 'error',
        source: 'codex',
        createdAt: Date.now()
      }
      this.broadcast('message', {
        sessionId: task.sessionId,
        message: errorMessage
      })
      task.reject(error)
      return null
    } finally {
      this.broadcastState()
    }
  }

  async drainQueues() {
    await Promise.all(
      Array.from(this.sessionQueues.keys())
        .map((sessionId) => this.drainSessionQueue(sessionId))
    )
  }

  async drainSessionQueue(sessionId) {
    const queue = this.getSessionQueue(sessionId)
    if (this.processingSessionIds.has(sessionId) || queue.length === 0) return
    this.processingSessionIds.add(sessionId)
    try {
      while (queue.length > 0) {
        const task = queue.shift()
        this.broadcastState()
        await this.executeTask(task)
      }
    } finally {
      this.processingSessionIds.delete(sessionId)
      this.broadcastState()
    }
  }

  async runTask(task) {
    const cwd = resolveWorkingDirectory(this.config.workingDirectory)
    const turnInput = buildCodexTaskInput(task)

    let completeTask
    const resultPromise = new Promise((resolve, reject) => {
      completeTask = { resolve, reject }
    })
    const activeTask = {
      ...task,
      threadId: '',
      parentThreadId: '',
      forked: false,
      turnId: '',
      finalText: '',
      agentMessageIds: new Set(),
      forwardedAgentMessageIds: new Set(),
      resolve: (result) => {
        if (this.activeTasks.get(task.jobId) !== activeTask) return
        this.activeTasks.delete(task.jobId)
        if (
          activeTask.threadId
          && this.activeTasksByThreadId.get(activeTask.threadId) === activeTask
        ) {
          this.activeTasksByThreadId.delete(activeTask.threadId)
        }
        this.touchSession(task.sessionId)
        this.broadcastState()
        if (task.source === 'feishu' && task.attachmentWorkspace) {
          try {
            const output = collectOutboxAttachments(task.attachmentWorkspace)
            completeTask.resolve({
              ...result,
              attachments: output.attachments,
              attachmentErrors: output.rejected
            })
          } catch (error) {
            completeTask.resolve({
              ...result,
              attachments: [],
              attachmentErrors: [{
                name: 'outbox',
                error: error?.message || String(error)
              }]
            })
          }
        } else {
          completeTask.resolve(result)
        }
        this.triggerRequestedApplicationRestart(activeTask)
      },
      reject: (error) => {
        if (this.activeTasks.get(task.jobId) !== activeTask) return
        this.activeTasks.delete(task.jobId)
        if (
          activeTask.threadId
          && this.activeTasksByThreadId.get(activeTask.threadId) === activeTask
        ) {
          this.activeTasksByThreadId.delete(activeTask.threadId)
        }
        this.touchSession(task.sessionId)
        this.broadcastState()
        completeTask.reject(error)
      }
    }
    this.activeTasks.set(task.jobId, activeTask)
    this.broadcastState()

    try {
      const worker = task.useWorkerThread
        ? await this.createWorkerThread(task, cwd)
        : {
            threadId: await this.ensureThread(task.sessionId),
            parentThreadId: '',
            forked: false
          }
      activeTask.threadId = worker.threadId
      activeTask.parentThreadId = worker.parentThreadId
      activeTask.forked = worker.forked
      this.activeTasksByThreadId.set(activeTask.threadId, activeTask)
      const response = await this.request('turn/start', {
        threadId: activeTask.threadId,
        input: turnInput,
        cwd,
        approvalPolicy: this.config.approvalPolicy,
        sandboxPolicy: buildTurnSandboxPolicy(
          this.config,
          cwd,
          task.attachmentWorkspace?.rootDir
            ? [task.attachmentWorkspace.rootDir]
            : []
        ),
        ...(this.config.reasoningEffort
          ? { effort: this.config.reasoningEffort }
          : {})
      })
      activeTask.turnId = response?.turn?.id || activeTask.turnId
      this.broadcastState()
    } catch (error) {
      activeTask.reject(error)
    }
    return resultPromise
  }

  async interruptActiveTurn(sessionId = this.activeSessionId) {
    const tasks = this.getActiveTasksForSession(sessionId)
      .filter((task) => task.threadId && task.turnId)
    if (tasks.length === 0) {
      return { interrupted: false }
    }
    const results = await Promise.allSettled(
      tasks.map((task) => this.request('turn/interrupt', {
        threadId: task.threadId,
        turnId: task.turnId
      }))
    )
    const interruptedCount = results.filter(
      (result) => result.status === 'fulfilled'
    ).length
    if (interruptedCount === 0) {
      throw results.find((result) => result.status === 'rejected')?.reason
        || new Error('中断失败')
    }
    return {
      interrupted: true,
      interruptedCount
    }
  }

  createNewSession() {
    const session = this.createUiSession()
    this.broadcast('history-reset', { sessionId: session.id })
    return session
  }

  async updateConfig(payload = {}) {
    const nextConfig = normalizeCodexMainConfig(payload, this.config)
    this.config = nextConfig
    this.store.set(CONFIG_STORE_KEY, nextConfig)
    this.broadcastState()
    if (this.feishuBridge?.restart) {
      try {
        await this.feishuBridge.restart()
      } catch (error) {
        this.safeError('[Codex Feishu] 配置已保存，但长连接启动失败:', error.message)
      }
    }
    if (nextConfig.feishu.autoMonitor?.enabled !== true) {
      this.proactiveNotificationMonitor?.stop?.({ disabled: true })
      this.autoMonitorRunning = false
    } else if (this.screenLocked) {
      try {
        await this.handleScreenLock()
      } catch (error) {
        this.autoMonitorRunning = false
        this.safeError(
          '[Codex Proactive] 配置已保存，但自动监控启动失败:',
          error?.message || String(error)
        )
      }
    } else {
      this.proactiveNotificationMonitor?.stop?.({ rebaseline: true })
      this.autoMonitorRunning = false
    }
    this.broadcastState()
    return this.getPublicConfig()
  }

  async cleanup() {
    this.projectSessionRouter?.cleanup()
    this.proactiveNotificationMonitor?.stop?.()
    await this.feishuBridge?.stop?.()
    await this.stopServer()
  }
}

function createFeishuBridgeManager({
  service,
  createFeishuBridge,
  onKeepAliveChanged = () => {},
  safeLog,
  safeError
}) {
  const bridges = new Map()
  const pendingRecoveryReasons = new Set()
  let recoveryTimer = null

  const getConnections = () => service.getConfig().feishu.connections || []
  const findConnection = (connectionId) => (
    getConnections().find((connection) => connection.id === connectionId) || null
  )

  const updateKeepAlive = (enabled) => {
    try {
      onKeepAliveChanged(enabled === true)
    } catch (error) {
      safeError(
        '[Codex Feishu] 更新锁屏保活状态失败:',
        error?.message || String(error)
      )
    }
  }

  const cancelScheduledRestart = () => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
      recoveryTimer = null
    }
    pendingRecoveryReasons.clear()
  }

  const stop = async () => {
    cancelScheduledRestart()
    updateKeepAlive(false)
    const activeBridges = Array.from(bridges.values())
    bridges.clear()
    await Promise.allSettled(
      activeBridges.map((bridge) => bridge.stop?.())
    )
    service.broadcastState()
  }

  const start = async () => {
    const enabledConnections = getConnections()
      .filter((connection) => connection.enabled)
    if (enabledConnections.length === 0) {
      updateKeepAlive(false)
      service.broadcastState()
      return false
    }
    updateKeepAlive(true)

    const results = await Promise.allSettled(
      enabledConnections.map(async (connection) => {
        const bridge = createFeishuBridge?.({
          getConfig: () => findConnection(connection.id) || connection,
          onInstruction: async (payload) => {
            const metadata = {
              ...payload,
              connectionId: connection.id,
              connectionName: connection.name
            }
            const controlResult = await service.handleFeishuMonitorControl?.(
              metadata
            )
            if (controlResult?.handled) return controlResult
            return service.enqueueInstruction({
              text: payload.text,
              source: 'feishu',
              attachments: payload.attachments,
              attachmentWorkspace: payload.attachmentWorkspace,
              onAgentMessage: payload.onAgentMessage,
              metadata
            })
          },
          onStatusChanged: () => service.broadcastState(),
          safeLog,
          safeError
        })
        if (!bridge) throw new Error(`无法创建飞书连接：${connection.name}`)
        bridges.set(connection.id, bridge)
        await bridge.start?.()
        return true
      })
    )
    service.broadcastState()
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
    return true
  }

  const restart = async () => {
    await stop()
    return start()
  }

  const scheduleRestart = (
    reason = 'system-resume',
    delayMs = FEISHU_POWER_RECOVERY_DELAY_MS
  ) => {
    const normalizedReason = String(reason || 'system-resume').trim()
    if (normalizedReason) pendingRecoveryReasons.add(normalizedReason)
    if (recoveryTimer) clearTimeout(recoveryTimer)
    const requestedDelay = Number(delayMs)
    const recoveryDelay = Number.isFinite(requestedDelay)
      ? Math.max(0, requestedDelay)
      : FEISHU_POWER_RECOVERY_DELAY_MS
    recoveryTimer = setTimeout(async () => {
      recoveryTimer = null
      const reasons = Array.from(pendingRecoveryReasons)
      pendingRecoveryReasons.clear()
      safeLog('[Codex Feishu] 系统恢复，正在重建长连接:', reasons.join(', '))
      try {
        await restart()
        safeLog('[Codex Feishu] 系统恢复后的长连接已重建')
      } catch (error) {
        safeError(
          '[Codex Feishu] 系统恢复后的长连接重建失败:',
          error?.message || String(error)
        )
      }
    }, recoveryDelay)
    recoveryTimer.unref?.()
  }

  const getStatus = () => {
    const connections = getConnections().map((connection) => {
      const bridgeStatus = bridges.get(connection.id)?.getStatus?.() || {}
      return {
        id: connection.id,
        name: connection.name,
        enabled: connection.enabled,
        running: bridgeStatus.running === true,
        status: connection.enabled
          ? String(bridgeStatus.status || 'disabled')
          : 'disabled',
        error: String(bridgeStatus.error || '')
      }
    })
    const enabledConnections = connections.filter((connection) => connection.enabled)
    const runningConnections = enabledConnections.filter((connection) => connection.running)
    const firstError = enabledConnections.find((connection) => connection.error)?.error || ''
    let status = 'disabled'
    if (enabledConnections.length > 0) {
      if (runningConnections.length === enabledConnections.length) status = 'connected'
      else if (runningConnections.length > 0) status = 'partial'
      else status = firstError ? 'error' : 'connecting'
    }
    return {
      enabled: enabledConnections.length > 0,
      running: runningConnections.length > 0,
      status,
      error: firstError,
      connections
    }
  }

  const sendProactiveNotification = async (route = {}, message = '') => {
    const connectionId = String(route.connectionId || '').trim()
    const chatId = String(route.chatId || '').trim()
    if (!connectionId || !chatId) {
      throw new Error('主动通知缺少飞书连接或 chat_id')
    }
    const bridge = bridges.get(connectionId)
    if (!bridge) {
      throw new Error('飞书连接尚未建立')
    }
    if (typeof bridge.sendProactiveNotification !== 'function') {
      throw new Error('当前飞书连接不支持主动通知')
    }
    return bridge.sendProactiveNotification(chatId, message)
  }

  return {
    start,
    stop,
    restart,
    scheduleRestart,
    getStatus,
    sendProactiveNotification
  }
}

function registerCodexPowerMonitorHandlers({
  powerMonitor,
  sessionController,
  safeError = () => {}
} = {}) {
  if (!powerMonitor?.on || !sessionController) {
    return () => {}
  }

  const reportFailure = (action, error) => {
    safeError(
      `[Codex Proactive] ${action}失败:`,
      error?.message || String(error)
    )
  }
  const handleLock = () => {
    Promise.resolve(sessionController.handleScreenLock?.())
      .catch((error) => reportFailure('锁屏启动自动监控', error))
  }
  const handleUnlock = () => {
    try {
      sessionController.scheduleFeishuRestart?.('unlock-screen')
      sessionController.handleScreenUnlock?.('unlock-screen')
    } catch (error) {
      reportFailure('解锁暂停自动监控', error)
    }
  }
  const handleResume = () => {
    try {
      sessionController.scheduleFeishuRestart?.('resume')
      sessionController.handleScreenUnlock?.('resume')
    } catch (error) {
      reportFailure('亮屏恢复暂停自动监控', error)
    }
  }

  powerMonitor.on('lock-screen', handleLock)
  powerMonitor.on('unlock-screen', handleUnlock)
  powerMonitor.on('resume', handleResume)

  return () => {
    powerMonitor.off?.('lock-screen', handleLock)
    powerMonitor.off?.('unlock-screen', handleUnlock)
    powerMonitor.off?.('resume', handleResume)
  }
}

function registerCodexMainSessionHandlers({
  ipcMain,
  store,
  getMainWindow,
  createFeishuBridge,
  onFeishuKeepAliveChanged,
  scheduleApplicationRestart,
  safeLog,
  safeError
}) {
  const service = new CodexMainSessionService({
    store,
    getMainWindow,
    safeLog,
    safeError,
    scheduleApplicationRestart
  })
  const feishuBridge = createFeishuBridgeManager({
    service,
    createFeishuBridge,
    onKeepAliveChanged: onFeishuKeepAliveChanged,
    safeLog,
    safeError
  })
  service.setFeishuBridge(feishuBridge)
  const proactiveNotificationMonitor = createCodexProactiveNotificationMonitor({
    store,
    request: (method, params, timeoutMs) => (
      service.request(method, params, timeoutMs)
    ),
    getRoutes: () => service.getProactiveNotificationRoutes(),
    getOwnedThreadIds: () => (
      service.listSessions()
        .map((session) => session.threadId)
        .filter(Boolean)
    ),
    sendNotification: (route, message) => (
      feishuBridge.sendProactiveNotification(route, message)
    ),
    safeLog,
    safeError
  })
  service.setProactiveNotificationMonitor(proactiveNotificationMonitor)
  proactiveNotificationMonitor.stop({ rebaseline: true })

  ipcMain.handle('codex-main-get-state', async () => {
    try {
      await service.startServer()
      await service.refreshAccount().catch(() => null)
      return { success: true, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message, state: service.getState() }
    }
  })

  ipcMain.handle('codex-main-get-history', async (event, payload = {}) => {
    try {
      const sessionId = String(payload?.sessionId || '').trim()
      const messages = await service.getHistory(sessionId || undefined)
      return { success: true, messages }
    } catch (error) {
      return { success: false, error: error.message, messages: [] }
    }
  })

  ipcMain.handle('codex-main-select-session', (event, payload = {}) => {
    try {
      const session = service.selectSession(payload?.sessionId)
      return { success: true, session, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message, state: service.getState() }
    }
  })

  ipcMain.handle('codex-main-send', async (event, payload = {}) => {
    try {
      const jobPromise = service.enqueueInstruction({
        text: payload.text,
        sessionId: payload.sessionId,
        source: 'ui'
      })
      jobPromise.catch((error) => {
        safeError('[Codex Main] 页面指令执行失败:', error.message)
      })
      return { success: true, accepted: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('codex-main-interrupt', async (event, payload = {}) => {
    try {
      return {
        success: true,
        ...(await service.interruptActiveTurn(payload?.sessionId))
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('codex-main-new-session', async () => {
    try {
      const session = service.createNewSession()
      return { success: true, session, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('codex-main-delete-session', async (event, payload = {}) => {
    try {
      const result = await service.deleteSession(payload?.sessionId)
      return { success: true, ...result, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message, state: service.getState() }
    }
  })

  ipcMain.handle('codex-main-restart', async () => {
    try {
      await service.restartServer()
      await service.refreshAccount().catch(() => null)
      return { success: true, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message, state: service.getState() }
    }
  })

  ipcMain.handle('codex-main-get-config', () => ({
    success: true,
    config: service.getPublicConfig()
  }))

  ipcMain.handle('codex-main-save-config', async (event, payload = {}) => {
    try {
      return {
        success: true,
        config: await service.updateConfig(payload)
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('codex-main-refresh-account', async () => {
    try {
      const account = await service.refreshAccount()
      return { success: true, account, state: service.getState() }
    } catch (error) {
      return { success: false, error: error.message, state: service.getState() }
    }
  })

  return {
    service,
    start: async () => {
      let firstError = null
      try {
        await service.startServer()
      } catch (error) {
        firstError = error
      }
      if (service.getConfig().feishu.connections.some((connection) => connection.enabled)) {
        try {
          await feishuBridge?.start?.()
        } catch (error) {
          firstError ||= error
        }
      }
      if (firstError) throw firstError
    },
    handleScreenLock: () => service.handleScreenLock(),
    handleScreenUnlock: () => service.handleScreenUnlock(),
    scheduleFeishuRestart: (reason) => (
      feishuBridge.scheduleRestart?.(reason)
    ),
    cleanup: () => service.cleanup()
  }
}

module.exports = {
  registerCodexMainSessionHandlers,
  normalizeCodexMainConfig,
  publicCodexMainConfig,
  resolveWorkingDirectory,
  buildTurnSandboxPolicy,
  buildCodexTaskInput,
  extractThreadMessages,
  normalizeStoredSessions,
  normalizeProjectBinding,
  createFeishuSessionId,
  buildFeishuSessionTitle,
  parseFeishuMonitorControlIntent,
  CodexMainSessionService,
  createFeishuBridgeManager,
  registerCodexPowerMonitorHandlers,
  MAIN_SESSION_INSTRUCTIONS,
  DEFAULT_CONFIG
}
