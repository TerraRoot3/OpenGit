const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const {
  resolveCodexExecutable,
  buildCodexProcessEnv
} = require('./ai-sessions')
const { version: OPEN_GIT_VERSION = '0.0.0' } = require('../../package.json')

const CONFIG_STORE_KEY = 'codex-main-session-config-v1'
const THREAD_STORE_KEY = 'codex-main-session-thread-id-v1'
const SESSIONS_STORE_KEY = 'codex-main-sessions-v2'
const ACTIVE_SESSION_STORE_KEY = 'codex-main-active-session-id-v2'
const MAIN_SESSION_ID = 'main'
const REQUEST_TIMEOUT_MS = 20 * 1000
const SERVER_START_TIMEOUT_MS = 20 * 1000
const SERVER_STOP_TIMEOUT_MS = 2 * 1000
const MAX_STDERR_LENGTH = 6000
const MAX_HISTORY_MESSAGES = 400

const MAIN_SESSION_INSTRUCTIONS = [
  '你是 OpenGit 内置的持久 Codex 会话。',
  '你会接收 OpenGit 页面或当前飞书会话转发的用户指令，并应在当前工作目录中主动完成任务。',
  '任务执行期间可以使用 Codex 可用的工具；在真正缺少用户选择或外部权限时才说明阻塞。',
  '每轮最终回答必须是可直接转发给用户的简洁结果总结：先说结果，再列出关键变更、验证状态和仍需用户处理的事项。',
  '不要在最终回答中泄露 access token、refresh token、App Secret 或其他凭据。'
].join('\n')

const DEFAULT_CONFIG = Object.freeze({
  workingDirectory: '',
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
  reasoningEffort: '',
  feishu: {
    connections: []
  }
})

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
      connections: normalizeFeishuConnections(sourceFeishu, previousFeishu)
    }
  }
}

function publicCodexMainConfig(config = DEFAULT_CONFIG) {
  const normalized = normalizeCodexMainConfig(config, config)
  return {
    ...normalized,
    feishu: {
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

function buildTurnSandboxPolicy(config, cwd) {
  if (config.sandboxMode === 'read-only') {
    return { type: 'readOnly', networkAccess: true }
  }
  if (config.sandboxMode === 'workspace-write') {
    return {
      type: 'workspaceWrite',
      writableRoots: [cwd],
      networkAccess: true
    }
  }
  return { type: 'dangerFullAccess' }
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

function compactSessionText(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const limit = Math.max(12, Number(maxLength) || 72)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
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

class CodexMainSessionService {
  constructor({
    store,
    getMainWindow,
    safeLog = () => {},
    safeError = () => {}
  }) {
    this.store = store
    this.getMainWindow = getMainWindow
    this.safeLog = safeLog
    this.safeError = safeError
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
    this.liveMessages = new Map()
    this.feishuBridge = null
    this.config = normalizeCodexMainConfig(
      this.store.get(CONFIG_STORE_KEY, DEFAULT_CONFIG),
      DEFAULT_CONFIG
    )
    const storedSessions = normalizeStoredSessions(
      this.store.get(SESSIONS_STORE_KEY, [])
    )
    this.sessions = new Map(storedSessions.map((session) => [session.id, session]))
    const storedActiveSessionId = String(
      this.store.get(ACTIVE_SESSION_STORE_KEY, MAIN_SESSION_ID) || ''
    ).trim()
    this.activeSessionId = this.sessions.has(storedActiveSessionId)
      ? storedActiveSessionId
      : MAIN_SESSION_ID
    this.persistSessions()
    this.store.delete(THREAD_STORE_KEY)
  }

  setFeishuBridge(bridge) {
    this.feishuBridge = bridge || null
  }

  getConfig() {
    return this.config
  }

  getPublicConfig() {
    return publicCodexMainConfig(this.config)
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

  getPublicSession(session) {
    if (!session) return null
    const activeTask = this.activeTasks.get(session.id)
    return {
      ...session,
      turnStatus: activeTask ? 'running' : 'idle',
      activeTurnId: activeTask?.turnId || '',
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
      this.activeTasks.has(session.id)
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
      ? this.activeTasks.get(activeSession.id)
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
      feishu: this.feishuBridge?.getStatus?.() || {
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

  handleNotification(method, params) {
    if (method === 'account/updated') {
      this.account = this.account
        ? { ...this.account, planType: params?.planType || this.account.planType || '' }
        : this.account
      this.broadcastState()
      return
    }
    const threadId = String(params?.threadId || '').trim()
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
      return
    }

    if (method === 'turn/completed') {
      const completedTurn = params?.turn || {}
      activeTask.turnId = completedTurn.id || activeTask.turnId
      if (!activeTask.finalText) {
        const agentItems = (Array.isArray(completedTurn.items) ? completedTurn.items : [])
          .filter((item) => item?.type === 'agentMessage' && String(item.text || '').trim())
        activeTask.finalText = String(agentItems.at(-1)?.text || '').trim()
      }
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
          text: activeTask.finalText || (status === 'interrupted' ? '任务已中断。' : '任务已完成。')
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
    const storedThreadId = String(session.threadId || '').trim()
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
      threadSource: 'open_git_main_session'
    })
    const threadId = String(result?.thread?.id || '').trim()
    if (!threadId) throw new Error('Codex app-server 未返回会话 ID')
    session.threadId = threadId
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
    return extractThreadMessages(result?.thread)
  }

  enqueueInstruction({
    text,
    source = 'ui',
    sessionId = '',
    metadata = {}
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
    const userMessage = {
      id: `user:${jobId}`,
      role: 'user',
      text: normalizedText,
      status: 'completed',
      source: normalizedSource,
      createdAt: Date.now()
    }
    this.broadcast('message', {
      sessionId: session.id,
      message: userMessage
    })

    return new Promise((resolve, reject) => {
      this.getSessionQueue(session.id).push({
        jobId,
        sessionId: session.id,
        text: normalizedText,
        source: normalizedSource,
        metadata,
        resolve,
        reject
      })
      this.broadcastState()
      void this.drainSessionQueue(session.id)
    })
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
        try {
          const result = await this.runTask(task)
          task.resolve(result)
        } catch (error) {
          const errorMessage = {
            id: `agent-error:${task.jobId}`,
            role: 'assistant',
            text: `执行失败：${error?.message || String(error)}`,
            status: 'error',
            source: 'codex',
            createdAt: Date.now()
          }
          this.broadcast('message', {
            sessionId,
            message: errorMessage
          })
          task.reject(error)
        }
      }
    } finally {
      this.processingSessionIds.delete(sessionId)
      this.broadcastState()
    }
  }

  async runTask(task) {
    const threadId = await this.ensureThread(task.sessionId)
    const cwd = resolveWorkingDirectory(this.config.workingDirectory)
    const inputText = task.source === 'feishu'
      ? `[来自飞书的指令]\n${task.text}`
      : task.text

    let completeTask
    const resultPromise = new Promise((resolve, reject) => {
      completeTask = { resolve, reject }
    })
    const activeTask = {
      ...task,
      threadId,
      turnId: '',
      finalText: '',
      agentMessageIds: new Set(),
      resolve: (result) => {
        if (this.activeTasks.get(task.sessionId) !== activeTask) return
        this.activeTasks.delete(task.sessionId)
        if (this.activeTasksByThreadId.get(threadId) === activeTask) {
          this.activeTasksByThreadId.delete(threadId)
        }
        this.touchSession(task.sessionId)
        this.broadcastState()
        completeTask.resolve(result)
      },
      reject: (error) => {
        if (this.activeTasks.get(task.sessionId) !== activeTask) return
        this.activeTasks.delete(task.sessionId)
        if (this.activeTasksByThreadId.get(threadId) === activeTask) {
          this.activeTasksByThreadId.delete(threadId)
        }
        this.touchSession(task.sessionId)
        this.broadcastState()
        completeTask.reject(error)
      }
    }
    this.activeTasks.set(task.sessionId, activeTask)
    this.activeTasksByThreadId.set(threadId, activeTask)
    this.broadcastState()

    try {
      const response = await this.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: inputText }],
        cwd,
        approvalPolicy: this.config.approvalPolicy,
        sandboxPolicy: buildTurnSandboxPolicy(this.config, cwd),
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
    const task = this.activeTasks.get(String(sessionId || '').trim())
    if (!task?.threadId || !task?.turnId) {
      return { interrupted: false }
    }
    await this.request('turn/interrupt', {
      threadId: task.threadId,
      turnId: task.turnId
    })
    return { interrupted: true }
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
    return this.getPublicConfig()
  }

  async cleanup() {
    await this.feishuBridge?.stop?.()
    await this.stopServer()
  }
}

function createFeishuBridgeManager({
  service,
  createFeishuBridge,
  safeLog,
  safeError
}) {
  const bridges = new Map()

  const getConnections = () => service.getConfig().feishu.connections || []
  const findConnection = (connectionId) => (
    getConnections().find((connection) => connection.id === connectionId) || null
  )

  const stop = async () => {
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
      service.broadcastState()
      return false
    }

    const results = await Promise.allSettled(
      enabledConnections.map(async (connection) => {
        const bridge = createFeishuBridge?.({
          getConfig: () => findConnection(connection.id) || connection,
          onInstruction: (payload) => service.enqueueInstruction({
            text: payload.text,
            source: 'feishu',
            metadata: {
              ...payload,
              connectionId: connection.id,
              connectionName: connection.name
            }
          }),
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

  return {
    start,
    stop,
    restart,
    getStatus
  }
}

function registerCodexMainSessionHandlers({
  ipcMain,
  store,
  getMainWindow,
  createFeishuBridge,
  safeLog,
  safeError
}) {
  const service = new CodexMainSessionService({
    store,
    getMainWindow,
    safeLog,
    safeError
  })
  const feishuBridge = createFeishuBridgeManager({
    service,
    createFeishuBridge,
    safeLog,
    safeError
  })
  service.setFeishuBridge(feishuBridge)

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
    cleanup: () => service.cleanup()
  }
}

module.exports = {
  registerCodexMainSessionHandlers,
  normalizeCodexMainConfig,
  publicCodexMainConfig,
  resolveWorkingDirectory,
  buildTurnSandboxPolicy,
  extractThreadMessages,
  normalizeStoredSessions,
  createFeishuSessionId,
  buildFeishuSessionTitle,
  CodexMainSessionService,
  createFeishuBridgeManager,
  MAIN_SESSION_INSTRUCTIONS,
  DEFAULT_CONFIG
}
