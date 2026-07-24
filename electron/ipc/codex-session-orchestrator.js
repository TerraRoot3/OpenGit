const { randomUUID } = require('crypto')
const path = require('path')
const {
  createCodexSessionStateSource
} = require('./codex-session-state-source')

const WATCH_STORE_KEY = 'codex-session-watches-v1'
const WATCH_POLL_INTERVAL_MS = 6000
const WATCH_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_LIST_LIMIT = 50
const DEFAULT_LIST_LIMIT = 12

const CODEX_SESSION_DYNAMIC_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'list_codex_sessions',
    description: [
      '查询本机 Codex 会话。用户询问正在执行、可监控或其他 Codex 会话时调用。',
      '默认只返回正在执行的会话；返回的 threadId 可用于发送消息或启动监控。'
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['running', 'all'],
          description: 'running 只返回执行中会话；all 返回最近的全部未归档会话。'
        },
        query: {
          type: 'string',
          description: '可选，按标题、项目路径或 threadId 搜索。'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIST_LIMIT
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'send_codex_session_message',
    description: [
      '向另一个 Codex 会话发送用户明确要求的消息。',
      '目标会话空闲时开始新一轮；由当前 OpenGit Server 管理且正在执行时追加到当前轮；',
      '由其他 Codex 进程执行时先排队，当前轮结束后自动发送。'
    ].join(''),
    inputSchema: {
      type: 'object',
      required: ['threadId', 'message'],
      properties: {
        threadId: {
          type: 'string',
          description: '目标 Codex threadId。'
        },
        message: {
          type: 'string',
          description: '要发送给目标会话的完整用户指令。'
        },
        monitorAfterSend: {
          type: 'boolean',
          description: '发送后是否继续监控该会话，并在结束时通知当前来源。'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'monitor_codex_session',
    description: [
      '仅在用户明确要求时监控一个正在执行的 Codex 会话。',
      '任务结束后 OpenGit 会把该会话最后一条 Codex 回复同步到发起监控的页面或飞书会话。'
    ].join(''),
    inputSchema: {
      type: 'object',
      required: ['threadId'],
      properties: {
        threadId: {
          type: 'string',
          description: '要监控的 Codex threadId。'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'cancel_codex_session_monitor',
    description: '取消当前来源对指定 Codex 会话的监控。',
    inputSchema: {
      type: 'object',
      required: ['threadId'],
      properties: {
        threadId: {
          type: 'string',
          description: '要取消监控的 Codex threadId。'
        }
      },
      additionalProperties: false
    }
  }
])

function normalizeLimit(value, fallback = DEFAULT_LIST_LIMIT) {
  return Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, Number(value) || fallback)
  )
}

function compactText(value, maxLength = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength
    ? `${text.slice(0, Math.max(1, maxLength - 1))}…`
    : text
}

function projectLabel(cwd = '') {
  const normalized = String(cwd || '').trim()
  if (!normalized) return ''
  return path.basename(normalized) || normalized
}

function normalizeStoredState(value) {
  const source = value && typeof value === 'object' ? value : {}
  const now = Date.now()
  const normalizeOrigin = (item = {}) => ({
    sourceSessionId: String(item.sourceSessionId || '').trim(),
    sourceThreadId: String(item.sourceThreadId || '').trim(),
    connectionId: String(item.connectionId || '').trim(),
    chatId: String(item.chatId || '').trim(),
    originMessageId: String(item.originMessageId || '').trim()
  })
  const watches = (Array.isArray(source.watches) ? source.watches : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || randomUUID()).trim(),
      threadId: String(item.threadId || '').trim(),
      title: compactText(item.title, 120),
      cwd: String(item.cwd || '').trim(),
      status: ['watching', 'notifying', 'completed'].includes(item.status)
        ? item.status
        : 'watching',
      observedRunning: item.observedRunning === true,
      baselineMarkerAt: Number(item.baselineMarkerAt) || 0,
      notificationMessageId: String(item.notificationMessageId || '').trim(),
      createdAt: Number(item.createdAt) || now,
      updatedAt: Number(item.updatedAt) || now,
      completedAt: Number(item.completedAt) || 0,
      ...normalizeOrigin(item)
    }))
    .filter((item) => (
      item.threadId
      && (
        item.status !== 'completed'
        || now - item.completedAt < WATCH_HISTORY_TTL_MS
      )
    ))
  const pendingSends = (Array.isArray(source.pendingSends) ? source.pendingSends : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || randomUUID()).trim(),
      threadId: String(item.threadId || '').trim(),
      message: String(item.message || '').trim(),
      monitorAfterSend: item.monitorAfterSend === true,
      createdAt: Number(item.createdAt) || now,
      ...normalizeOrigin(item)
    }))
    .filter((item) => item.threadId && item.message)
  return { watches, pendingSends }
}

function toolResponse(value, success = true) {
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2)
  return {
    success,
    contentItems: [{
      type: 'inputText',
      text
    }]
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({
    length: Math.min(Math.max(1, concurrency), items.length)
  }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      output[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return output
}

class CodexSessionOrchestrator {
  constructor({
    service,
    store,
    stateSource = null,
    safeLog = () => {},
    safeError = () => {},
    pollIntervalMs = WATCH_POLL_INTERVAL_MS
  } = {}) {
    this.service = service
    this.store = store
    this.safeLog = safeLog
    this.safeError = safeError
    this.stateSource = stateSource || createCodexSessionStateSource({
      safeLog,
      safeError
    })
    this.pollIntervalMs = Math.max(1000, Number(pollIntervalMs) || WATCH_POLL_INTERVAL_MS)
    const stored = normalizeStoredState(
      this.store?.get?.(WATCH_STORE_KEY, {})
    )
    this.watches = new Map(stored.watches.map((item) => [item.id, item]))
    this.pendingSends = new Map(
      stored.pendingSends.map((item) => [item.id, item])
    )
    this.timer = null
    this.checking = false
  }

  persist() {
    const now = Date.now()
    for (const [id, watch] of this.watches) {
      if (
        watch.status === 'completed'
        && now - Number(watch.completedAt || 0) >= WATCH_HISTORY_TTL_MS
      ) {
        this.watches.delete(id)
      }
    }
    this.store?.set?.(WATCH_STORE_KEY, {
      watches: Array.from(this.watches.values()),
      pendingSends: Array.from(this.pendingSends.values())
    })
  }

  hasActiveWork() {
    return (
      Array.from(this.watches.values())
        .some((watch) => watch.status === 'watching' || watch.status === 'notifying')
      || this.pendingSends.size > 0
    )
  }

  start() {
    if (!this.hasActiveWork() || this.timer) return false
    this.timer = setInterval(() => {
      void this.checkNow()
    }, this.pollIntervalMs)
    this.timer.unref?.()
    void this.checkNow()
    return true
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  stopIfIdle() {
    if (!this.hasActiveWork()) this.stop()
  }

  getOrigin(activeTask = {}) {
    const metadata = activeTask?.metadata || {}
    return {
      sourceSessionId: String(activeTask?.sessionId || '').trim(),
      sourceThreadId: String(activeTask?.threadId || '').trim(),
      connectionId: String(metadata.connectionId || '').trim(),
      chatId: String(metadata.chatId || '').trim(),
      originMessageId: String(metadata.messageId || '').trim()
    }
  }

  resolveReplyContext(metadata = {}) {
    const relatedIds = new Set([
      metadata.parentMessageId,
      metadata.rootMessageId
    ].map((item) => String(item || '').trim()).filter(Boolean))
    if (relatedIds.size === 0) return null
    const connectionId = String(metadata.connectionId || '').trim()
    const chatId = String(metadata.chatId || '').trim()
    const matches = Array.from(this.watches.values())
      .filter((watch) => (
        watch.status === 'completed'
        && watch.notificationMessageId
        && relatedIds.has(watch.notificationMessageId)
        && (!connectionId || watch.connectionId === connectionId)
        && (!chatId || watch.chatId === chatId)
      ))
      .sort((left, right) => right.completedAt - left.completedAt)
    const watch = matches[0]
    if (!watch) return null
    return {
      threadId: watch.threadId,
      title: watch.title,
      cwd: watch.cwd,
      watchId: watch.id
    }
  }

  async getThreadState(threadOrId) {
    const thread = typeof threadOrId === 'object' && threadOrId
      ? threadOrId
      : await this.stateSource.getThread(String(threadOrId || '').trim())
    if (!thread?.id) return null
    const ownedTask = this.service?.activeTasksByThreadId?.get(thread.id)
    if (ownedTask) {
      return {
        status: 'running',
        reason: 'opengit.active_turn',
        markerAt: Date.now(),
        owned: true,
        thread
      }
    }
    const managedTurn = this.service?.managedExternalTurns?.get(thread.id)
    if (managedTurn) {
      return {
        status: 'running',
        reason: 'opengit.managed_external_turn',
        markerAt: Number(managedTurn.startedAt) || Date.now(),
        owned: true,
        thread
      }
    }
    const signal = await this.stateSource.resolveThreadStatus({
      threadId: thread.id,
      rolloutPath: thread.rolloutPath
    })
    return {
      status: signal?.status === 'running' ? 'running' : 'idle',
      reason: signal?.reason || 'state.idle',
      markerAt: Number(signal?.at) || Number(thread.updatedAt) || 0,
      owned: false,
      thread
    }
  }

  async listSessions({
    status = 'running',
    query = '',
    limit = DEFAULT_LIST_LIMIT,
    excludeThreadId = ''
  } = {}) {
    const normalizedLimit = normalizeLimit(limit)
    const requestedStatus = status === 'all' ? 'all' : 'running'
    const candidates = await this.stateSource.listThreads({
      query,
      limit: requestedStatus === 'running'
        ? 200
        : normalizedLimit * 2
    })
    const normalizedExcludeId = String(excludeThreadId || '').trim()
    const enriched = await mapWithConcurrency(candidates, 6, async (thread) => {
      const state = await this.getThreadState(thread)
      return {
        threadId: thread.id,
        title: compactText(thread.title || thread.preview || thread.id, 100),
        project: projectLabel(thread.cwd),
        cwd: thread.cwd,
        status: state?.status || 'idle',
        statusReason: state?.reason || '',
        source: thread.source,
        updatedAt: thread.updatedAt
      }
    })
    return enriched
      .filter((item) => item.threadId !== normalizedExcludeId)
      .filter((item) => requestedStatus !== 'running' || item.status === 'running')
      .slice(0, normalizedLimit)
  }

  findWatch(threadId, origin = {}, statuses = ['watching', 'notifying']) {
    const normalizedThreadId = String(threadId || '').trim()
    return Array.from(this.watches.values()).find((watch) => (
      watch.threadId === normalizedThreadId
      && statuses.includes(watch.status)
      && (
        !origin.sourceSessionId
        || watch.sourceSessionId === origin.sourceSessionId
      )
    )) || null
  }

  async watchThread({
    threadId,
    activeTask,
    allowPendingStart = false,
    baselineState = null
  } = {}) {
    const normalizedThreadId = String(threadId || '').trim()
    if (!normalizedThreadId) throw new Error('缺少目标 Codex threadId')
    const origin = this.getOrigin(activeTask)
    if (normalizedThreadId === origin.sourceThreadId) {
      throw new Error('不能让当前主会话监控自己')
    }
    const existing = this.findWatch(normalizedThreadId, origin)
    if (existing) {
      return {
        watching: true,
        existing: true,
        watchId: existing.id,
        threadId: existing.threadId,
        title: existing.title
      }
    }
    const state = baselineState || await this.getThreadState(normalizedThreadId)
    if (!state?.thread) throw new Error('目标 Codex 会话不存在或已归档')
    if (state.status !== 'running' && !allowPendingStart) {
      return {
        watching: false,
        alreadyEnded: true,
        threadId: state.thread.id,
        title: state.thread.title,
        status: state.status
      }
    }
    const now = Date.now()
    const watch = {
      id: randomUUID(),
      threadId: state.thread.id,
      title: compactText(state.thread.title || state.thread.preview || state.thread.id, 120),
      cwd: state.thread.cwd,
      status: 'watching',
      observedRunning: state.status === 'running',
      baselineMarkerAt: Number(state.markerAt) || now,
      notificationMessageId: '',
      createdAt: now,
      updatedAt: now,
      completedAt: 0,
      ...origin
    }
    this.watches.set(watch.id, watch)
    this.persist()
    this.start()
    return {
      watching: true,
      existing: false,
      watchId: watch.id,
      threadId: watch.threadId,
      title: watch.title,
      project: projectLabel(watch.cwd)
    }
  }

  cancelWatch({ threadId, activeTask } = {}) {
    const normalizedThreadId = String(threadId || '').trim()
    const origin = this.getOrigin(activeTask)
    const watch = this.findWatch(
      normalizedThreadId,
      origin,
      ['watching', 'notifying']
    )
    if (!watch) {
      return {
        cancelled: false,
        threadId: normalizedThreadId,
        reason: '当前来源没有该会话的活动监控'
      }
    }
    this.watches.delete(watch.id)
    this.persist()
    this.stopIfIdle()
    return {
      cancelled: true,
      watchId: watch.id,
      threadId: watch.threadId,
      title: watch.title
    }
  }

  async sendMessage({
    threadId,
    message,
    monitorAfterSend = false,
    activeTask
  } = {}) {
    const normalizedThreadId = String(threadId || '').trim()
    const normalizedMessage = String(message || '').trim()
    if (!normalizedThreadId) throw new Error('缺少目标 Codex threadId')
    if (!normalizedMessage) throw new Error('发送给目标会话的消息不能为空')
    const origin = this.getOrigin(activeTask)
    if (normalizedThreadId === origin.sourceThreadId) {
      throw new Error('不能通过跨会话工具向当前主会话自己发送消息')
    }
    const state = await this.getThreadState(normalizedThreadId)
    if (!state?.thread) throw new Error('目标 Codex 会话不存在或已归档')
    const canSendNow = (
      state.status !== 'running'
      || state.owned
      || this.service?.findSessionByThreadId?.(normalizedThreadId)
    )
    if (!canSendNow) {
      const pending = {
        id: randomUUID(),
        threadId: normalizedThreadId,
        message: normalizedMessage,
        monitorAfterSend: monitorAfterSend === true,
        createdAt: Date.now(),
        ...origin
      }
      this.pendingSends.set(pending.id, pending)
      this.persist()
      this.start()
      return {
        accepted: true,
        delivery: 'queued_until_current_turn_completes',
        threadId: normalizedThreadId,
        title: state.thread.title
      }
    }
    const delivery = await this.service.dispatchCodexThreadMessage({
      thread: state.thread,
      message: normalizedMessage,
      state
    })
    let watch = null
    if (monitorAfterSend) {
      watch = await this.watchThread({
        threadId: normalizedThreadId,
        activeTask,
        allowPendingStart: true,
        baselineState: {
          ...state,
          status: 'running',
          markerAt: Date.now()
        }
      })
    }
    return {
      accepted: true,
      threadId: normalizedThreadId,
      title: state.thread.title,
      ...delivery,
      monitor: watch
    }
  }

  async processPendingSend(pending, state) {
    if (!pending || state?.status === 'running') return false
    try {
      const delivery = await this.service.dispatchCodexThreadMessage({
        thread: state.thread,
        message: pending.message,
        state
      })
      this.pendingSends.delete(pending.id)
      if (pending.monitorAfterSend) {
        await this.watchThread({
          threadId: pending.threadId,
          activeTask: {
            sessionId: pending.sourceSessionId,
            threadId: pending.sourceThreadId,
            metadata: {
              connectionId: pending.connectionId,
              chatId: pending.chatId,
              messageId: pending.originMessageId
            }
          },
          allowPendingStart: true,
          baselineState: {
            ...state,
            status: 'running',
            markerAt: Number(delivery.startedAt) || Date.now()
          }
        })
      }
      this.persist()
      return true
    } catch (error) {
      this.safeError('[Codex Orchestrator] 排队消息发送失败:', error.message)
      return false
    }
  }

  async completeWatch(watch, state) {
    watch.status = 'notifying'
    watch.updatedAt = Date.now()
    this.persist()
    try {
      const text = await this.service.readCodexThreadLastReply(watch.threadId)
      const notification = await this.service.notifyCodexWatchCompletion(
        watch,
        text || '任务已结束。'
      )
      watch.status = 'completed'
      watch.completedAt = Date.now()
      watch.updatedAt = watch.completedAt
      watch.notificationMessageId = String(
        notification?.messageId || ''
      ).trim()
      this.persist()
    } catch (error) {
      watch.status = 'watching'
      watch.updatedAt = Date.now()
      this.persist()
      this.safeError('[Codex Orchestrator] 监控完成通知失败:', error.message)
    }
  }

  async checkNow() {
    if (this.checking) return
    this.checking = true
    try {
      for (const pending of Array.from(this.pendingSends.values())) {
        const state = await this.getThreadState(pending.threadId)
        if (!state?.thread) {
          this.pendingSends.delete(pending.id)
          continue
        }
        await this.processPendingSend(pending, state)
      }
      for (const watch of Array.from(this.watches.values())) {
        if (watch.status !== 'watching') continue
        const state = await this.getThreadState(watch.threadId)
        if (!state?.thread) {
          this.watches.delete(watch.id)
          continue
        }
        if (state.status === 'running') {
          watch.observedRunning = true
          watch.updatedAt = Date.now()
          continue
        }
        if (
          watch.observedRunning
          && Number(state.markerAt || 0) >= Number(watch.baselineMarkerAt || 0)
        ) {
          await this.completeWatch(watch, state)
        }
      }
      this.persist()
    } finally {
      this.checking = false
      this.stopIfIdle()
    }
  }

  async handleToolCall(params = {}) {
    const tool = String(params.tool || '').trim()
    let args = params.arguments && typeof params.arguments === 'object'
      ? params.arguments
      : {}
    if (typeof params.arguments === 'string') {
      try {
        args = JSON.parse(params.arguments)
      } catch (error) {
        return toolResponse('动态工具参数不是有效 JSON。', false)
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) args = {}
    const activeTask = this.service?.activeTasksByThreadId?.get(
      String(params.threadId || '').trim()
    )
    if (!activeTask) {
      return toolResponse('找不到发起工具调用的 OpenGit 主会话。', false)
    }
    try {
      if (tool === 'list_codex_sessions') {
        const sessions = await this.listSessions({
          status: args.status,
          query: args.query,
          limit: args.limit,
          excludeThreadId: params.threadId
        })
        return toolResponse({
          count: sessions.length,
          sessions
        })
      }
      if (tool === 'send_codex_session_message') {
        return toolResponse(await this.sendMessage({
          threadId: args.threadId,
          message: args.message,
          monitorAfterSend: args.monitorAfterSend,
          activeTask
        }))
      }
      if (tool === 'monitor_codex_session') {
        return toolResponse(await this.watchThread({
          threadId: args.threadId,
          activeTask
        }))
      }
      if (tool === 'cancel_codex_session_monitor') {
        return toolResponse(this.cancelWatch({
          threadId: args.threadId,
          activeTask
        }))
      }
      return toolResponse(`OpenGit 不支持动态工具：${tool}`, false)
    } catch (error) {
      return toolResponse(error?.message || String(error), false)
    }
  }
}

module.exports = {
  CodexSessionOrchestrator,
  CODEX_SESSION_DYNAMIC_TOOLS,
  WATCH_STORE_KEY,
  WATCH_POLL_INTERVAL_MS,
  __testables: {
    normalizeStoredState,
    normalizeLimit,
    projectLabel,
    toolResponse
  }
}
