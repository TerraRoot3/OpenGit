const path = require('path')
const { createHash } = require('crypto')

const PROACTIVE_NOTIFICATION_STATE_KEY = 'codex-proactive-notifications-state-v1'
const STATE_VERSION = 1
const DEFAULT_POLL_INTERVAL_MS = 30 * 1000
const DEFAULT_STALL_MINUTES = 20
const THREAD_PAGE_LIMIT = 100
const MAX_THREAD_PAGES = 5
const MAX_THREAD_READS_PER_POLL = 60
const THREAD_READ_CONCURRENCY = 6
const MAX_PERSISTED_THREADS = 500
const MAX_PENDING_EVENTS = 100
const MAX_DELIVERY_RECORDS = 2000
const DELIVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PROGRESS_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000
const SOURCE_KINDS = Object.freeze([
  'cli',
  'vscode',
  'exec',
  'appServer'
])

function clampNumber(value, minimum, maximum, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(maximum, Math.max(minimum, numeric))
}

function toTimestampMs(value) {
  const numeric = Number(value) || 0
  if (!numeric) return 0
  return numeric < 1e11 ? numeric * 1000 : numeric
}

function compactText(value, maxLength = 1200) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  const limit = Math.max(80, Number(maxLength) || 1200)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function redactNotificationText(value) {
  return compactText(value)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[已隐藏凭据]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gi, '[已隐藏凭据]')
    .replace(/\bxox[a-z]-[A-Za-z0-9-]{16,}\b/gi, '[已隐藏凭据]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[已隐藏凭据]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi, 'Bearer [已隐藏凭据]')
    .replace(
      /\b(access[_ -]?token|refresh[_ -]?token|app[_ -]?secret|api[_ -]?key)\b(["']?\s*[:=]\s*["']?)([^"'\s,;}]+)/gi,
      '$1$2[已隐藏凭据]'
    )
}

function stableHash(value) {
  return createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 20)
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeActiveFlags(status = {}) {
  return Array.from(new Set(
    (Array.isArray(status?.activeFlags) ? status.activeFlags : [])
      .map(normalizeStatus)
      .filter(Boolean)
  )).sort()
}

function isDecisionFlag(flag) {
  return [
    'waitingonapproval',
    'waitingforapproval',
    'waitingonuserinput',
    'waitingforuserinput',
    'waitingonfeedback',
    'waitingforfeedback',
    'waitingonconfirmation',
    'waitingforconfirmation',
    'waitingonpermission',
    'waitingforpermission'
  ].includes(normalizeStatus(flag))
}

function classifyImportantAgentMessage(value) {
  const text = compactText(value)
  if (!text) return ''

  if (
    /(?:需要|请|等待).{0,12}(?:确认|选择|决定|授权|批准|提供|处理|回复)/i.test(text)
    || /(?:无法继续|被阻塞|已阻塞|blocked|waiting for (?:approval|input|confirmation))/i.test(text)
  ) {
    return 'decision'
  }
  if (
    /(?:执行失败|构建失败|测试失败|打包失败|发布失败|任务失败|发生错误|严重错误|致命错误|崩溃|未通过|cannot continue|failed|fatal error)/i.test(text)
  ) {
    return 'failure'
  }
  if (
    /(?:关键进展|阶段完成|里程碑|已经完成|已完成|已修复|修复完成|全部通过|验证通过|构建通过|测试通过|打包完成|已生成|已产出|进入下一阶段|下一步)/i.test(text)
  ) {
    return 'progress'
  }
  return ''
}

function extractErrorText(error) {
  if (!error) return ''
  if (typeof error === 'string') return compactText(error)
  return compactText(error.message || error.details || error.code || '')
}

function normalizeTurnState(turn = {}, runtimeStatus = {}) {
  const turnStatus = normalizeStatus(turn?.status)
  const runtimeType = normalizeStatus(runtimeStatus?.type)
  const active = (
    runtimeType === 'active'
    || ['active', 'inprogress', 'running', 'started'].includes(turnStatus)
  )
  const failed = (
    runtimeType === 'systemerror'
    || ['failed', 'failure', 'error', 'systemerror'].includes(turnStatus)
  )
  const interrupted = ['interrupted', 'cancelled', 'canceled'].includes(turnStatus)
  const completed = (
    failed
    || interrupted
    || ['completed', 'complete', 'succeeded', 'success', 'done'].includes(turnStatus)
  )
  return {
    active: active && !completed,
    failed,
    interrupted,
    completed
  }
}

function createThreadListSnapshot(thread = {}, previous = null, now = Date.now()) {
  const threadId = String(thread?.id || thread?.sessionId || '').trim()
  const cwd = String(thread?.cwd || '').trim()
  const runtimeStatus = thread?.status && typeof thread.status === 'object'
    ? thread.status
    : {}
  const runtimeType = normalizeStatus(runtimeStatus.type)
  const activeFlags = normalizeActiveFlags(runtimeStatus)
  const listUpdatedAt = toTimestampMs(
    thread?.recencyAt || thread?.updatedAt || thread?.createdAt
  )
  const title = compactText(
    thread?.name
      || (cwd ? path.basename(cwd) : '')
      || `Codex ${threadId.slice(-8)}`,
    80
  )
  return {
    ...(previous || {}),
    threadId,
    title,
    cwd,
    listUpdatedAt,
    runtimeType,
    activeFlags,
    isActive: runtimeType === 'active' || previous?.isActive === true,
    isFailed: runtimeType === 'systemerror' || previous?.isFailed === true,
    detailsLoaded: previous?.detailsLoaded === true,
    lastSeenAt: now
  }
}

function createThreadDetailSnapshot(thread = {}, previous = null, now = Date.now()) {
  const listSnapshot = createThreadListSnapshot(thread, previous, now)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const turn = turns[turns.length - 1] || {}
  const runtimeStatus = thread?.status && typeof thread.status === 'object'
    ? thread.status
    : {}
  const turnState = normalizeTurnState(turn, runtimeStatus)
  const agentItems = []
  for (const [index, item] of (Array.isArray(turn?.items) ? turn.items : []).entries()) {
    if (item?.type !== 'agentMessage') continue
    const text = compactText(item.text)
    if (!text) continue
    const id = String(item.id || '').trim()
      || `agent-${index}-${stableHash(text)}`
    agentItems.push({ id, text })
  }
  const agentItemIds = agentItems.map((item) => item.id)
  const agentItemSignatures = Object.fromEntries(
    agentItems.map((item) => [item.id, stableHash(item.text)])
  )
  const signature = stableHash(JSON.stringify({
    turnId: turn?.id || '',
    turnStatus: turn?.status || '',
    activeFlags: listSnapshot.activeFlags,
    agentItemIds,
    itemCount: Array.isArray(turn?.items) ? turn.items.length : 0
  }))
  const progressChanged = (
    !previous?.detailsLoaded
    || previous?.signature !== signature
  )

  return {
    ...listSnapshot,
    detailsLoaded: true,
    turnId: String(turn?.id || '').trim(),
    turnStatus: normalizeStatus(turn?.status),
    turnStartedAt: toTimestampMs(turn?.startedAt),
    turnCompletedAt: toTimestampMs(turn?.completedAt),
    isActive: turnState.active,
    isFailed: turnState.failed,
    isInterrupted: turnState.interrupted,
    isCompleted: turnState.completed,
    errorText: extractErrorText(turn?.error)
      || (listSnapshot.runtimeType === 'systemerror' ? 'Codex 会话进入系统错误状态。' : ''),
    agentItems,
    agentItemIds,
    agentItemSignatures,
    finalText: agentItems[agentItems.length - 1]?.text || '',
    signature,
    lastProgressAt: progressChanged
      ? now
      : Number(previous?.lastProgressAt) || now,
    lastSeenAt: now
  }
}

function buildEvent({
  type,
  snapshot,
  summary = '',
  itemId = '',
  stalledSince = 0
}) {
  const eventIdentity = type === 'progress'
    ? (itemId || snapshot.turnStatus || snapshot.runtimeType || 'state')
    : type
  const eventKey = [
    snapshot.threadId,
    snapshot.turnId || 'thread',
    type,
    eventIdentity
  ].join(':')
  return {
    fingerprint: stableHash(eventKey),
    type,
    threadId: snapshot.threadId,
    turnId: snapshot.turnId || '',
    title: snapshot.title || '',
    cwd: snapshot.cwd || '',
    summary: redactNotificationText(summary),
    stalledSince: Number(stalledSince) || 0,
    createdAt: Date.now()
  }
}

function compareThreadSnapshots(previous, current, {
  baseline = false,
  now = Date.now(),
  minimumStallMinutes = DEFAULT_STALL_MINUTES
} = {}) {
  if (baseline) return []
  const events = []
  const previousIds = new Set(previous?.agentItemIds || [])
  const detailsWereComparable = (
    !previous
    || previous?.detailsLoaded === true
    || (
      previous
      && current.listUpdatedAt
      && current.listUpdatedAt !== previous.listUpdatedAt
    )
  )

  if (
    current.isFailed
    && (
      !previous
      || current.turnId !== previous.turnId
      || previous.isFailed !== true
    )
  ) {
    events.push(buildEvent({
      type: 'failure',
      snapshot: current,
      summary: current.errorText || current.finalText || 'Codex 任务执行失败。'
    }))
    return events
  }

  if (
    current.isCompleted
    && !current.isInterrupted
    && (
      (previous?.turnId === current.turnId && previous?.isActive === true)
      || (
        detailsWereComparable
        && current.turnId
        && current.turnId !== previous?.turnId
      )
    )
  ) {
    events.push(buildEvent({
      type: 'completion',
      snapshot: current,
      summary: current.finalText || 'Codex 任务已完成。'
    }))
    return events
  }

  if (
    current.isInterrupted
    && (
      previous?.turnId === current.turnId
      && previous?.isActive === true
    )
  ) {
    events.push(buildEvent({
      type: 'interrupted',
      snapshot: current,
      summary: current.finalText || 'Codex 任务已中断。'
    }))
    return events
  }

  if (!current.isActive) return events

  const decisionFlags = current.activeFlags.filter(isDecisionFlag)
  const previousDecisionFlags = new Set(
    (previous?.activeFlags || []).filter(isDecisionFlag)
  )
  if (decisionFlags.some((flag) => !previousDecisionFlags.has(flag))) {
    events.push(buildEvent({
      type: 'decision',
      snapshot: current,
      itemId: decisionFlags.join(','),
      summary: current.finalText || 'Codex 正在等待你的确认或输入。'
    }))
  }
  const queuedTypes = new Set(events.map((event) => event.type))

  for (const item of current.agentItems || []) {
    const previousItemSignature = previous?.agentItemSignatures?.[item.id]
    const currentItemSignature = current.agentItemSignatures?.[item.id]
    if (
      previousIds.has(item.id)
      && previousItemSignature
      && previousItemSignature === currentItemSignature
    ) continue
    const classification = classifyImportantAgentMessage(item.text)
    if (!classification) continue
    if (queuedTypes.has(classification)) continue
    events.push(buildEvent({
      type: classification,
      snapshot: current,
      itemId: item.id,
      summary: item.text
    }))
    queuedTypes.add(classification)
  }

  const stallMs = clampNumber(
    minimumStallMinutes,
    5,
    24 * 60,
    DEFAULT_STALL_MINUTES
  ) * 60 * 1000
  if (
    current.lastProgressAt
    && now - current.lastProgressAt >= stallMs
  ) {
    events.push(buildEvent({
      type: 'stall',
      snapshot: current,
      stalledSince: current.lastProgressAt,
      summary: `任务已约 ${Math.max(1, Math.floor((now - current.lastProgressAt) / 60000))} 分钟没有新的状态变化。`
    }))
  }

  return events
}

function formatCodexProactiveNotification(event = {}) {
  const labels = {
    progress: '关键进展',
    completion: '任务完成',
    failure: '任务失败',
    decision: '需要你处理',
    stall: '任务可能停滞',
    interrupted: '任务已中断'
  }
  const projectName = event.cwd ? path.basename(event.cwd) : ''
  const heading = labels[event.type] || '状态更新'
  const lines = [`**Codex ${heading}**`]
  if (projectName) lines.push(`项目：${projectName}`)
  if (event.title && event.title !== projectName) {
    lines.push(`会话：${compactText(event.title, 80)}`)
  }
  if (event.summary) {
    lines.push('', redactNotificationText(event.summary))
  }
  return compactText(lines.join('\n'), 1800)
}

function normalizePersistedThread(value = {}) {
  if (!value || typeof value !== 'object') return null
  const threadId = String(value.threadId || '').trim()
  if (!threadId) return null
  return {
    threadId,
    title: compactText(value.title, 80),
    cwd: String(value.cwd || '').trim(),
    listUpdatedAt: Number(value.listUpdatedAt) || 0,
    runtimeType: normalizeStatus(value.runtimeType),
    activeFlags: Array.isArray(value.activeFlags)
      ? value.activeFlags.map(normalizeStatus).filter(Boolean)
      : [],
    detailsLoaded: value.detailsLoaded === true,
    turnId: String(value.turnId || '').trim(),
    turnStatus: normalizeStatus(value.turnStatus),
    turnStartedAt: Number(value.turnStartedAt) || 0,
    turnCompletedAt: Number(value.turnCompletedAt) || 0,
    isActive: value.isActive === true,
    isFailed: value.isFailed === true,
    isInterrupted: value.isInterrupted === true,
    isCompleted: value.isCompleted === true,
    agentItemIds: Array.isArray(value.agentItemIds)
      ? value.agentItemIds.map(String).slice(-200)
      : [],
    agentItemSignatures: Object.fromEntries(
      Object.entries(value.agentItemSignatures || {})
        .slice(-200)
        .map(([itemId, signature]) => [
          String(itemId),
          String(signature || '')
        ])
    ),
    signature: String(value.signature || ''),
    lastProgressAt: Number(value.lastProgressAt) || 0,
    lastSeenAt: Number(value.lastSeenAt) || 0
  }
}

function normalizePersistedState(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const threads = {}
  for (const item of Object.values(source.threads || {})) {
    const normalized = normalizePersistedThread(item)
    if (normalized) threads[normalized.threadId] = normalized
  }
  const pendingEvents = {}
  for (const [fingerprint, event] of Object.entries(source.pendingEvents || {})) {
    if (!fingerprint || !event || typeof event !== 'object') continue
    pendingEvents[fingerprint] = {
      fingerprint,
      type: String(event.type || ''),
      threadId: String(event.threadId || ''),
      turnId: String(event.turnId || ''),
      title: compactText(event.title, 80),
      cwd: String(event.cwd || ''),
      summary: redactNotificationText(event.summary),
      stalledSince: Number(event.stalledSince) || 0,
      createdAt: Number(event.createdAt) || Date.now()
    }
  }
  const delivered = {}
  for (const [key, timestamp] of Object.entries(source.delivered || {})) {
    if (!key) continue
    delivered[key] = Number(timestamp) || 0
  }
  return {
    version: STATE_VERSION,
    enabled: source.enabled === true,
    baselinePending: source.baselinePending === true,
    lastPollAt: Number(source.lastPollAt) || 0,
    threads,
    pendingEvents,
    delivered
  }
}

function serializeThreadSnapshot(snapshot = {}) {
  return normalizePersistedThread(snapshot)
}

function normalizeRoutes(routes = []) {
  const seen = new Set()
  const normalized = []
  for (const route of Array.isArray(routes) ? routes : []) {
    const connectionId = String(route?.connectionId || '').trim()
    const chatId = String(route?.chatId || '').trim()
    if (!connectionId || !chatId) continue
    const routeKey = `${connectionId}:${chatId}`
    if (seen.has(routeKey)) continue
    seen.add(routeKey)
    normalized.push({
      connectionId,
      chatId,
      routeKey,
      stallMinutes: clampNumber(
        route?.stallMinutes,
        5,
        24 * 60,
        DEFAULT_STALL_MINUTES
      )
    })
  }
  return normalized
}

function createCodexProactiveNotificationMonitor({
  store,
  request,
  getRoutes = () => [],
  getOwnedThreadIds = () => [],
  sendNotification,
  safeLog = () => {},
  safeError = () => {},
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
} = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new Error('Codex 主动通知监控缺少持久化存储')
  }
  if (typeof request !== 'function') {
    throw new Error('Codex 主动通知监控缺少 app-server 请求函数')
  }
  if (typeof sendNotification !== 'function') {
    throw new Error('Codex 主动通知监控缺少飞书发送函数')
  }

  const state = normalizePersistedState(
    store.get(PROACTIVE_NOTIFICATION_STATE_KEY, {})
  )
  let timer = null
  let stopped = true
  let pollPromise = null
  let lifecycleGeneration = 0

  const persist = () => {
    store.set(PROACTIVE_NOTIFICATION_STATE_KEY, state)
  }

  const pruneState = (timestamp) => {
    const threadEntries = Object.values(state.threads)
      .sort((left, right) => (
        Number(right.lastSeenAt || 0) - Number(left.lastSeenAt || 0)
      ))
      .slice(0, MAX_PERSISTED_THREADS)
    state.threads = Object.fromEntries(
      threadEntries.map((thread) => [thread.threadId, thread])
    )

    const pendingEntries = Object.entries(state.pendingEvents)
      .sort(([, left], [, right]) => (
        Number(right.createdAt || 0) - Number(left.createdAt || 0)
      ))
      .slice(0, MAX_PENDING_EVENTS)
    state.pendingEvents = Object.fromEntries(pendingEntries)

    const deliveredEntries = Object.entries(state.delivered)
      .filter(([, deliveredAt]) => (
        timestamp - Number(deliveredAt || 0) <= DELIVERY_TTL_MS
      ))
      .sort(([, left], [, right]) => Number(right) - Number(left))
      .slice(0, MAX_DELIVERY_RECORDS)
    state.delivered = Object.fromEntries(deliveredEntries)
  }

  const schedule = () => {
    if (stopped || timer) return
    const delay = clampNumber(
      pollIntervalMs,
      5000,
      10 * 60 * 1000,
      DEFAULT_POLL_INTERVAL_MS
    )
    timer = setTimeoutFn(() => {
      timer = null
      void pollOnce().finally(schedule)
    }, delay)
    timer?.unref?.()
  }

  const listThreads = async () => {
    const threads = []
    let cursor = null
    for (let page = 0; page < MAX_THREAD_PAGES; page += 1) {
      const result = await request('thread/list', {
        cursor,
        limit: THREAD_PAGE_LIMIT,
        sortKey: 'recency_at',
        sortDirection: 'desc',
        archived: false,
        useStateDbOnly: true,
        sourceKinds: SOURCE_KINDS
      })
      threads.push(...(
        Array.isArray(result?.data) ? result.data : []
      ))
      cursor = result?.nextCursor || null
      if (!cursor) break
    }
    return threads
  }

  const queueEvents = (events) => {
    for (const event of events) {
      if (!event?.fingerprint) continue
      state.pendingEvents[event.fingerprint] = {
        ...event,
        summary: redactNotificationText(event.summary)
      }
    }
  }

  const deliverPendingEvents = async (
    routes,
    timestamp,
    isCurrentLifecycle = () => true
  ) => {
    for (const [fingerprint, event] of Object.entries(state.pendingEvents)) {
      if (!isCurrentLifecycle()) return false
      const eligibleRoutes = routes.filter((route) => {
        if (event.type !== 'stall') return true
        if (!event.stalledSince) return false
        return (
          timestamp - event.stalledSince
          >= route.stallMinutes * 60 * 1000
        )
      })
      if (eligibleRoutes.length === 0) continue

      const message = formatCodexProactiveNotification(event)
      for (const route of eligibleRoutes) {
        if (!isCurrentLifecycle()) return false
        const deliveryKey = `${route.routeKey}:${fingerprint}`
        if (state.delivered[deliveryKey]) continue
        const progressCooldownKey = [
          'progress-cooldown',
          route.routeKey,
          event.threadId
        ].join(':')
        if (
          event.type === 'progress'
          && timestamp - Number(state.delivered[progressCooldownKey] || 0)
            < PROGRESS_NOTIFICATION_COOLDOWN_MS
        ) {
          state.delivered[deliveryKey] = timestamp
          continue
        }
        try {
          await sendNotification(route, message, event)
          state.delivered[deliveryKey] = timestamp
          if (event.type === 'progress') {
            state.delivered[progressCooldownKey] = timestamp
          }
          safeLog('[Codex Proactive] 飞书主动通知已发送:', {
            type: event.type,
            threadId: event.threadId,
            connectionId: route.connectionId,
            chatIdSuffix: route.chatId.slice(-8)
          })
          if (!isCurrentLifecycle()) return false
        } catch (error) {
          safeError('[Codex Proactive] 飞书主动通知发送失败:', {
            type: event.type,
            threadId: event.threadId,
            connectionId: route.connectionId,
            chatIdSuffix: route.chatId.slice(-8),
            error: redactNotificationText(error?.message || String(error))
          })
        }
      }

      const deliveredToAllEligibleRoutes = eligibleRoutes.every((route) => (
        state.delivered[`${route.routeKey}:${fingerprint}`]
      ))
      if (deliveredToAllEligibleRoutes) {
        delete state.pendingEvents[fingerprint]
      }
    }
    return true
  }

  const pollOnceInternal = async () => {
    const pollGeneration = lifecycleGeneration
    const isCurrentLifecycle = () => (
      !stopped && pollGeneration === lifecycleGeneration
    )
    if (!isCurrentLifecycle()) {
      return { enabled: false, paused: true, threadCount: 0 }
    }
    const routes = normalizeRoutes(getRoutes())
    if (routes.length === 0) return { enabled: false, threadCount: 0 }

    const timestamp = now()
    const baseline = state.baselinePending === true
    const ownedThreadIds = new Set(
      Array.from(getOwnedThreadIds() || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
    const listedThreadsResult = await listThreads()
    if (!isCurrentLifecycle()) {
      return { enabled: false, paused: true, threadCount: 0 }
    }
    const listedThreads = listedThreadsResult
      .filter((thread) => {
        const threadId = String(thread?.id || thread?.sessionId || '').trim()
        return threadId && !ownedThreadIds.has(threadId)
      })

    const nextThreads = {}
    const candidates = []
    for (const [index, thread] of listedThreads.entries()) {
      const threadId = String(thread?.id || thread?.sessionId || '').trim()
      const previous = state.threads[threadId] || null
      const snapshot = createThreadListSnapshot(thread, previous, timestamp)
      nextThreads[threadId] = serializeThreadSnapshot(snapshot)

      const updated = (
        !previous
        || snapshot.listUpdatedAt !== previous.listUpdatedAt
      )
      const runtimeActive = ['active', 'systemerror'].includes(snapshot.runtimeType)
      if (runtimeActive || previous?.isActive || updated) {
        candidates.push({
          thread,
          previous,
          index,
          priority: (
            runtimeActive ? 0
              : previous?.isActive ? 1
                : updated ? 2
                  : 3
          )
        })
      }
    }

    candidates.sort((left, right) => (
      left.priority - right.priority
      || left.index - right.index
    ))
    const minimumStallMinutes = Math.min(
      ...routes.map((route) => route.stallMinutes)
    )
    const selectedCandidates = candidates.slice(0, MAX_THREAD_READS_PER_POLL)
    for (
      let offset = 0;
      offset < selectedCandidates.length;
      offset += THREAD_READ_CONCURRENCY
    ) {
      const batch = selectedCandidates.slice(
        offset,
        offset + THREAD_READ_CONCURRENCY
      )
      await Promise.all(batch.map(async (candidate) => {
        const threadId = String(
          candidate.thread?.id || candidate.thread?.sessionId || ''
        ).trim()
        try {
          const result = await request('thread/read', {
            threadId,
            includeTurns: true
          }, 60 * 1000)
          if (!isCurrentLifecycle()) return
          if (!result?.thread) return
          const current = createThreadDetailSnapshot(
            {
              ...candidate.thread,
              ...result.thread
            },
            candidate.previous,
            timestamp
          )
          nextThreads[threadId] = serializeThreadSnapshot(current)
          queueEvents(compareThreadSnapshots(candidate.previous, current, {
            baseline,
            now: timestamp,
            minimumStallMinutes
          }))
        } catch (error) {
          safeError('[Codex Proactive] 读取线程状态失败:', {
            threadId,
            error: redactNotificationText(error?.message || String(error))
          })
        }
      }))
      if (!isCurrentLifecycle()) {
        return {
          enabled: false,
          paused: true,
          threadCount: listedThreads.length
        }
      }
    }

    if (!isCurrentLifecycle()) {
      return {
        enabled: false,
        paused: true,
        threadCount: listedThreads.length
      }
    }
    state.threads = nextThreads
    state.lastPollAt = timestamp
    state.baselinePending = false
    await deliverPendingEvents(routes, timestamp, isCurrentLifecycle)
    if (!isCurrentLifecycle()) {
      persist()
      return {
        enabled: false,
        paused: true,
        threadCount: listedThreads.length,
        pendingEventCount: Object.keys(state.pendingEvents).length
      }
    }
    pruneState(timestamp)
    persist()
    return {
      enabled: true,
      threadCount: listedThreads.length,
      pendingEventCount: Object.keys(state.pendingEvents).length
    }
  }

  function pollOnce() {
    if (pollPromise) return pollPromise
    pollPromise = pollOnceInternal()
      .catch((error) => {
        safeError(
          '[Codex Proactive] 主动通知轮询失败:',
          redactNotificationText(error?.message || String(error))
        )
        return { enabled: true, error: error?.message || String(error) }
      })
      .finally(() => {
        pollPromise = null
      })
    return pollPromise
  }

  const start = async ({ scheduleNext = true } = {}) => {
    const routes = normalizeRoutes(getRoutes())
    if (routes.length === 0) {
      lifecycleGeneration += 1
      stopped = true
      if (timer) {
        clearTimeoutFn(timer)
        timer = null
      }
      if (state.enabled || Object.keys(state.pendingEvents).length > 0) {
        state.enabled = false
        state.baselinePending = true
        state.pendingEvents = {}
        persist()
      }
      return false
    }

    lifecycleGeneration += 1
    const startGeneration = lifecycleGeneration
    stopped = false
    if (!state.enabled) {
      state.enabled = true
      state.baselinePending = true
      persist()
    }
    if (pollPromise) await pollPromise
    if (stopped || startGeneration !== lifecycleGeneration) return false
    await pollOnce()
    if (stopped || startGeneration !== lifecycleGeneration) return false
    if (scheduleNext) schedule()
    return true
  }

  const stop = ({ disabled = false, rebaseline = false } = {}) => {
    lifecycleGeneration += 1
    stopped = true
    if (timer) {
      clearTimeoutFn(timer)
      timer = null
    }
    if (disabled) {
      state.enabled = false
      state.baselinePending = true
      state.pendingEvents = {}
      persist()
    } else if (rebaseline) {
      state.baselinePending = true
      state.pendingEvents = {}
      persist()
    }
  }

  return {
    start,
    stop,
    pollOnce,
    getState: () => structuredClone(state)
  }
}

module.exports = {
  PROACTIVE_NOTIFICATION_STATE_KEY,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_STALL_MINUTES,
  SOURCE_KINDS,
  redactNotificationText,
  classifyImportantAgentMessage,
  createThreadListSnapshot,
  createThreadDetailSnapshot,
  compareThreadSnapshots,
  formatCodexProactiveNotification,
  normalizePersistedState,
  createCodexProactiveNotificationMonitor
}
