const fs = require('fs')
const path = require('path')
const os = require('os')

const SESSION_CACHE_TTL = 15 * 1000
const SUMMARY_CACHE_VERSION = 1

let codexSessionsCache = { loadedAt: 0, sessions: [] }
let claudeHistoryCache = { loadedAt: 0, entries: new Map() }
let summaryCacheStore = { filePath: '', loaded: false, dirty: false, entries: new Map() }
const summaryRefreshJobs = new Map()

function resetSessionCaches() {
  codexSessionsCache = { loadedAt: 0, sessions: [] }
  claudeHistoryCache = { loadedAt: 0, entries: new Map() }
}

function configureSummaryCache(filePath = '') {
  const normalizedFilePath = normalizeProjectPath(filePath)
  if (summaryCacheStore.filePath === normalizedFilePath) return

  summaryCacheStore = {
    filePath: normalizedFilePath,
    loaded: false,
    dirty: false,
    entries: new Map()
  }
}

function normalizeProjectPath(inputPath = '') {
  if (!inputPath || typeof inputPath !== 'string') return ''
  const resolved = path.resolve(inputPath)
  return resolved.replace(/[\\/]+$/, '')
}

function isPathInsideProject(candidatePath = '', projectPath = '') {
  const normalizedCandidate = normalizeProjectPath(candidatePath)
  const normalizedProject = normalizeProjectPath(projectPath)
  if (!normalizedCandidate || !normalizedProject) return false
  if (normalizedCandidate === normalizedProject) return true
  return normalizedCandidate.startsWith(`${normalizedProject}${path.sep}`)
}

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeIsoString(value, fallbackTimestamp = 0) {
  const timestamp = toTimestamp(value) || fallbackTimestamp
  return timestamp > 0 ? new Date(timestamp).toISOString() : ''
}

function isPathInsideRoot(candidatePath = '', rootPath = '') {
  const normalizedCandidate = normalizeProjectPath(candidatePath)
  const normalizedRoot = normalizeProjectPath(rootPath)
  if (!normalizedCandidate || !normalizedRoot) return false
  if (normalizedCandidate === normalizedRoot) return true
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
}

function safeReadFirstLine(filePath, maxBytes = 16 * 1024) {
  let fd = null
  try {
    fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(maxBytes)
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0)
    if (bytesRead <= 0) return ''
    const [firstLine = ''] = buffer.toString('utf8', 0, bytesRead).split('\n')
    return firstLine.trim()
  } catch (error) {
    return ''
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd)
      } catch (error) {}
    }
  }
}

function safeReadJsonLine(line = '') {
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch (error) {
    return null
  }
}

function readJsonlFile(filePath, onItem) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      const item = safeReadJsonLine(line)
      if (item) onItem(item)
    }
  } catch (error) {}
}

function readJsonlFileUntil(filePath, onItem, chunkSize = 64 * 1024) {
  let fd = null
  let position = 0
  let remainder = ''

  try {
    fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(chunkSize)

    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, position)
      if (bytesRead <= 0) break

      position += bytesRead
      remainder += buffer.toString('utf8', 0, bytesRead)

      const lines = remainder.split('\n')
      remainder = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        const item = safeReadJsonLine(line)
        if (item && onItem(item) === true) return
      }
    }

    const line = remainder.trim()
    if (!line) return
    const item = safeReadJsonLine(line)
    if (item) onItem(item)
  } catch (error) {
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd)
      } catch (error) {}
    }
  }
}

function ensureSummaryCacheLoaded() {
  if (summaryCacheStore.loaded) return summaryCacheStore

  summaryCacheStore.loaded = true
  if (!summaryCacheStore.filePath || !fs.existsSync(summaryCacheStore.filePath)) {
    return summaryCacheStore
  }

  try {
    const raw = fs.readFileSync(summaryCacheStore.filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== SUMMARY_CACHE_VERSION || !Array.isArray(parsed.entries)) {
      return summaryCacheStore
    }

    summaryCacheStore.entries = new Map(
      parsed.entries
        .filter((entry) => entry && entry.provider && entry.sessionId && entry.sourcePath)
        .map((entry) => [`${entry.provider}:${entry.sessionId}`, {
          provider: entry.provider,
          sessionId: entry.sessionId,
          sourcePath: normalizeProjectPath(entry.sourcePath),
          sourceMtimeMs: Number(entry.sourceMtimeMs) || 0,
          summary: typeof entry.summary === 'string' ? entry.summary : ''
        }])
    )
  } catch (error) {
    summaryCacheStore.entries = new Map()
  }

  return summaryCacheStore
}

function flushSummaryCache() {
  const store = ensureSummaryCacheLoaded()
  if (!store.dirty || !store.filePath) return

  try {
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true })
    fs.writeFileSync(store.filePath, JSON.stringify({
      version: SUMMARY_CACHE_VERSION,
      entries: [...store.entries.values()]
    }), 'utf8')
    store.dirty = false
  } catch (error) {}
}

function getSessionSummaryCacheState({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0
} = {}) {
  const store = ensureSummaryCacheLoaded()
  const key = `${provider}:${sessionId}`
  const entry = store.entries.get(key)
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  const normalizedMtime = Number(sourceMtimeMs) || 0

  if (!entry) {
    return { status: 'missing', summary: '' }
  }

  if (entry.sourcePath !== normalizedSourcePath) {
    store.entries.delete(key)
    store.dirty = true
    return { status: 'missing', summary: '' }
  }

  if (entry.sourceMtimeMs === normalizedMtime) {
    return {
      status: 'fresh',
      summary: typeof entry.summary === 'string' ? entry.summary : ''
    }
  }

  return {
    status: 'stale',
    summary: typeof entry.summary === 'string' ? entry.summary : ''
  }
}

function readSessionSummaryCache({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0
} = {}) {
  const state = getSessionSummaryCacheState({
    provider,
    sessionId,
    sourcePath,
    sourceMtimeMs
  })
  return {
    hit: state.status === 'fresh',
    summary: state.status === 'fresh' ? state.summary : ''
  }
}

function writeSessionSummaryCache({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0,
  summary = ''
} = {}) {
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  if (!provider || !sessionId || !normalizedSourcePath) {
    return typeof summary === 'string' ? summary : ''
  }

  const store = ensureSummaryCacheLoaded()
  const normalizedSummary = typeof summary === 'string' ? summary.trim() : ''

  store.entries.set(`${provider}:${sessionId}`, {
    provider,
    sessionId,
    sourcePath: normalizedSourcePath,
    sourceMtimeMs: Number(sourceMtimeMs) || 0,
    summary: normalizedSummary
  })
  store.dirty = true

  return normalizedSummary
}

function deleteSessionSummaryCache({ provider = '', sessionId = '', sourcePath = '' } = {}) {
  const store = ensureSummaryCacheLoaded()
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  let changed = false

  if (provider && sessionId) {
    changed = store.entries.delete(`${provider}:${sessionId}`) || changed
  }

  if (normalizedSourcePath) {
    for (const [key, entry] of store.entries.entries()) {
      if (entry.sourcePath !== normalizedSourcePath) continue
      store.entries.delete(key)
      changed = true
    }
  }

  if (changed) {
    store.dirty = true
  }

  return changed
}

function getSummaryRefreshJobKey({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0
} = {}) {
  return [
    provider,
    sessionId,
    normalizeProjectPath(sourcePath),
    Number(sourceMtimeMs) || 0
  ].join(':')
}

function updateCachedSessionSummary({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0,
  summary = ''
} = {}) {
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  const normalizedMtime = Number(sourceMtimeMs) || 0
  const normalizedSummary = typeof summary === 'string' ? summary : ''

  for (const session of codexSessionsCache.sessions) {
    if (session.provider !== provider || session.sessionId !== sessionId) continue
    if (normalizeProjectPath(session.sourcePath) !== normalizedSourcePath) continue
    if ((Number(session.sourceMtimeMs) || 0) !== normalizedMtime) continue
    session.summary = normalizedSummary
  }
}

function scheduleSessionSummaryRefresh({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0,
  extractSummary
} = {}) {
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  const jobKey = getSummaryRefreshJobKey({ provider, sessionId, sourcePath: normalizedSourcePath, sourceMtimeMs })
  if (!provider || !sessionId || !normalizedSourcePath || typeof extractSummary !== 'function') {
    return false
  }
  if (summaryRefreshJobs.has(jobKey)) {
    return false
  }

  const timer = setTimeout(() => {
    try {
      const summary = writeSessionSummaryCache({
        provider,
        sessionId,
        sourcePath: normalizedSourcePath,
        sourceMtimeMs,
        summary: extractSummary(normalizedSourcePath)
      })
      updateCachedSessionSummary({
        provider,
        sessionId,
        sourcePath: normalizedSourcePath,
        sourceMtimeMs,
        summary
      })
      flushSummaryCache()
    } catch (error) {
    } finally {
      summaryRefreshJobs.delete(jobKey)
    }
  }, 0)

  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  summaryRefreshJobs.set(jobKey, timer)
  return true
}

function hasPendingSummaryRefreshForSessions(sessions = []) {
  return sessions.some((session) => summaryRefreshJobs.has(getSummaryRefreshJobKey({
    provider: session.provider,
    sessionId: session.sessionId,
    sourcePath: session.sourcePath,
    sourceMtimeMs: session.sourceMtimeMs
  })))
}

function resolveSessionSummary({
  provider = '',
  sessionId = '',
  sourcePath = '',
  sourceMtimeMs = 0,
  extractSummary
} = {}) {
  const cacheState = getSessionSummaryCacheState({
    provider,
    sessionId,
    sourcePath,
    sourceMtimeMs
  })

  if (cacheState.status === 'fresh') {
    return {
      summary: cacheState.summary,
      pendingRefresh: false
    }
  }

  const jobKey = getSummaryRefreshJobKey({ provider, sessionId, sourcePath, sourceMtimeMs })
  const pendingRefresh = scheduleSessionSummaryRefresh({
    provider,
    sessionId,
    sourcePath,
    sourceMtimeMs,
    extractSummary
  }) || summaryRefreshJobs.has(jobKey)

  return {
    summary: cacheState.status === 'stale' ? cacheState.summary : '',
    pendingRefresh
  }
}

function truncateText(text = '', maxLength = 400) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function normalizeSessionText(text = '') {
  const normalized = String(text || '').trim()
  if (!normalized) return ''
  if (normalized.startsWith('<environment_context>')) return ''
  if (normalized.startsWith('<turn_aborted>')) return ''
  if (normalized.startsWith('<permissions instructions>')) return ''
  if (normalized.startsWith('<collaboration_mode>')) return ''
  if (normalized.startsWith('<skills_instructions>')) return ''
  return truncateText(normalized)
}

function extractCodexMessageText(messageContent) {
  if (!Array.isArray(messageContent)) return ''
  const parts = []
  for (const item of messageContent) {
    if (!item || typeof item !== 'object') continue
    if (item.type !== 'input_text' && item.type !== 'output_text') continue
    const normalized = normalizeSessionText(item.text)
    if (normalized) parts.push(normalized)
  }
  return truncateText(parts.join('\n\n'))
}

function extractCodexSummary(filePath) {
  let summary = ''

  readJsonlFileUntil(filePath, (item) => {
    if (summary) return
    if (item?.type === 'response_item' && item.payload?.type === 'message' && item.payload?.role === 'user') {
      const text = extractCodexMessageText(item.payload.content)
      if (text) {
        summary = text
        return true
      }
      return
    }

    if (item?.type === 'event_msg' && item.payload?.type === 'user_message') {
      const text = normalizeSessionText(item.payload.message)
      if (text) {
        summary = text
        return true
      }
    }
  })

  return summary
}

function extractCodexTranscript(filePath) {
  const messages = []

  readJsonlFile(filePath, (item) => {
    if (item?.type !== 'response_item') return
    if (item.payload?.type !== 'message') return
    if (item.payload?.role !== 'user' && item.payload?.role !== 'assistant') return

    const text = extractCodexMessageText(item.payload.content)
    if (!text) return

    messages.push({
      role: item.payload.role,
      text,
      timestamp: normalizeIsoString(item.timestamp)
    })
  })

  return messages
}

function extractClaudeContentText(content) {
  if (typeof content === 'string') return normalizeSessionText(content)
  if (!Array.isArray(content)) return ''

  const parts = []
  for (const item of content) {
    if (typeof item === 'string') {
      const normalized = normalizeSessionText(item)
      if (normalized) parts.push(normalized)
      continue
    }
    if (!item || typeof item !== 'object') continue
    if (item.type === 'text') {
      const normalized = normalizeSessionText(item.text)
      if (normalized) parts.push(normalized)
    }
  }

  return truncateText(parts.join('\n\n'))
}

function extractClaudeSummary(filePath) {
  let summary = ''

  readJsonlFileUntil(filePath, (item) => {
    if (summary) return
    if (item?.type !== 'user') return
    if (item.message?.role !== 'user') return
    const text = extractClaudeContentText(item.message.content)
    if (text) {
      summary = text
      return true
    }
  })

  return summary
}

function extractClaudeTranscript(filePath) {
  const messages = []

  readJsonlFile(filePath, (item) => {
    if (item?.type !== 'user' && item?.type !== 'assistant') return

    const role = item.message?.role === 'assistant' ? 'assistant' : item.message?.role === 'user' ? 'user' : item.type
    if (role !== 'user' && role !== 'assistant') return

    const text = extractClaudeContentText(item.message?.content)
    if (!text) return

    messages.push({
      role,
      text,
      timestamp: normalizeIsoString(item.timestamp)
    })
  })

  return messages
}

function walkFiles(rootDir, predicate, results = []) {
  if (!rootDir || !fs.existsSync(rootDir)) return results

  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results)
      continue
    }
    if (predicate(fullPath, entry)) {
      results.push(fullPath)
    }
  }

  return results
}

function pruneEmptyDirectories(startDir = '', rootDir = '') {
  let currentDir = normalizeProjectPath(startDir)
  const normalizedRoot = normalizeProjectPath(rootDir)

  while (currentDir && normalizedRoot && currentDir !== normalizedRoot && isPathInsideRoot(currentDir, normalizedRoot)) {
    try {
      if (!fs.existsSync(currentDir)) break
      const entries = fs.readdirSync(currentDir)
      if (entries.length > 0) break
      fs.rmdirSync(currentDir)
      currentDir = path.dirname(currentDir)
    } catch (error) {
      break
    }
  }
}

function deleteAiSessionSource({ provider = '', sourcePath = '' } = {}) {
  const normalizedSourcePath = normalizeProjectPath(sourcePath)
  if (!normalizedSourcePath) {
    throw new Error('invalid session source path')
  }

  const homeDir = os.homedir()
  const rootDir = provider === 'codex'
    ? path.join(homeDir, '.codex', 'sessions')
    : provider === 'claude'
      ? path.join(homeDir, '.claude', 'projects')
      : ''

  if (!rootDir || !isPathInsideRoot(normalizedSourcePath, rootDir)) {
    throw new Error('session source is not allowed')
  }

  if (!fs.existsSync(normalizedSourcePath)) {
    return { deleted: false }
  }

  fs.unlinkSync(normalizedSourcePath)
  pruneEmptyDirectories(path.dirname(normalizedSourcePath), rootDir)
  deleteSessionSummaryCache({ provider, sourcePath: normalizedSourcePath })
  flushSummaryCache()
  resetSessionCaches()

  return { deleted: true }
}

function mergeSessionEntry(targetMap, entry) {
  if (!entry?.sessionId) return
  const existing = targetMap.get(entry.sessionId)
  if (!existing || toTimestamp(entry.updatedAt) >= toTimestamp(existing.updatedAt)) {
    targetMap.set(entry.sessionId, entry)
  }
}

function buildCodexIndex(homeDir) {
  const indexPath = path.join(homeDir, '.codex', 'session_index.jsonl')
  const indexMap = new Map()

  readJsonlFile(indexPath, (item) => {
    if (!item?.id) return
    indexMap.set(item.id, {
      title: typeof item.thread_name === 'string' ? item.thread_name.trim() : '',
      updatedAt: normalizeIsoString(item.updated_at)
    })
  })

  return indexMap
}

function loadCodexSessions(homeDir) {
  const now = Date.now()
  if ((now - codexSessionsCache.loadedAt) < SESSION_CACHE_TTL) {
    return {
      sessions: codexSessionsCache.sessions,
      hasPendingSummaryRefresh: hasPendingSummaryRefreshForSessions(codexSessionsCache.sessions)
    }
  }

  const sessionsRoot = path.join(homeDir, '.codex', 'sessions')
  const indexMap = buildCodexIndex(homeDir)
  const files = walkFiles(sessionsRoot, (fullPath) => fullPath.endsWith('.jsonl'))
  const sessionMap = new Map()
  let hasPendingSummaryRefresh = false

  for (const filePath of files) {
    const firstLine = safeReadFirstLine(filePath)
    const record = safeReadJsonLine(firstLine)
    if (!record || record.type !== 'session_meta' || !record.payload?.id) continue

    const sessionId = String(record.payload.id).trim()
    const cwd = normalizeProjectPath(record.payload.cwd || '')
    if (!sessionId || !cwd) continue

    let statTimestamp = 0
    try {
      statTimestamp = fs.statSync(filePath).mtimeMs
    } catch (error) {}

    const indexed = indexMap.get(sessionId)
    const updatedAt = indexed?.updatedAt
      || normalizeIsoString(record.payload.timestamp, statTimestamp)
      || normalizeIsoString(statTimestamp)
    const summaryState = resolveSessionSummary({
      provider: 'codex',
      sessionId,
      sourcePath: filePath,
      sourceMtimeMs: statTimestamp,
      extractSummary: extractCodexSummary
    })
    hasPendingSummaryRefresh = hasPendingSummaryRefresh || summaryState.pendingRefresh

    mergeSessionEntry(sessionMap, {
      provider: 'codex',
      sessionId,
      title: indexed?.title || path.basename(cwd) || sessionId,
      cwd,
      updatedAt,
      summary: summaryState.summary,
      sourcePath: filePath,
      sourceMtimeMs: statTimestamp
    })
  }

  codexSessionsCache = {
    loadedAt: now,
    sessions: [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
  }

  return {
    sessions: codexSessionsCache.sessions,
    hasPendingSummaryRefresh
  }
}

function loadClaudeHistory(homeDir) {
  const now = Date.now()
  if ((now - claudeHistoryCache.loadedAt) < SESSION_CACHE_TTL) {
    return claudeHistoryCache.entries
  }

  const historyPath = path.join(homeDir, '.claude', 'history.jsonl')
  const historyMap = new Map()

  readJsonlFile(historyPath, (item) => {
    if (!item?.sessionId) return
    const timestamp = typeof item.timestamp === 'number' ? item.timestamp : toTimestamp(item.timestamp)
    const current = historyMap.get(item.sessionId)
    if (current && current.timestamp >= timestamp) return

    historyMap.set(item.sessionId, {
      title: typeof item.display === 'string' ? item.display.trim() : '',
      timestamp,
      project: normalizeProjectPath(item.project || '')
    })
  })

  claudeHistoryCache = {
    loadedAt: now,
    entries: historyMap
  }

  return historyMap
}

function encodeClaudeProjectPath(projectPath = '') {
  return normalizeProjectPath(projectPath).replace(/[\\/]/g, '-')
}

function loadClaudeSessions(homeDir, projectPath) {
  const projectsRoot = path.join(homeDir, '.claude', 'projects')
  if (!fs.existsSync(projectsRoot)) {
    return {
      sessions: [],
      hasPendingSummaryRefresh: false
    }
  }

  const encodedProjectPath = encodeClaudeProjectPath(projectPath)
  if (!encodedProjectPath) {
    return {
      sessions: [],
      hasPendingSummaryRefresh: false
    }
  }

  const historyMap = loadClaudeHistory(homeDir)
  const sessionMap = new Map()
  let hasPendingSummaryRefresh = false
  const projectEntries = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name === encodedProjectPath || entry.name.startsWith(`${encodedProjectPath}-`))

  for (const directoryEntry of projectEntries) {
    const directoryPath = path.join(projectsRoot, directoryEntry.name)
    const sessionFiles = fs.readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))

    for (const fileEntry of sessionFiles) {
      const filePath = path.join(directoryPath, fileEntry.name)
      const firstLine = safeReadFirstLine(filePath)
      const record = safeReadJsonLine(firstLine)
      const sessionId = String(record?.sessionId || path.basename(fileEntry.name, '.jsonl')).trim()
      if (!sessionId) continue

      let statTimestamp = 0
      try {
        statTimestamp = fs.statSync(filePath).mtimeMs
      } catch (error) {}

      const history = historyMap.get(sessionId)
      const cwd = normalizeProjectPath(record?.cwd || history?.project || projectPath)
      if (!isPathInsideProject(cwd, projectPath)) continue
      const summaryState = resolveSessionSummary({
        provider: 'claude',
        sessionId,
        sourcePath: filePath,
        sourceMtimeMs: statTimestamp,
        extractSummary: extractClaudeSummary
      })
      hasPendingSummaryRefresh = hasPendingSummaryRefresh || summaryState.pendingRefresh

      mergeSessionEntry(sessionMap, {
        provider: 'claude',
        sessionId,
        title: history?.title || path.basename(cwd) || sessionId,
        cwd,
        updatedAt: normalizeIsoString(history?.timestamp || record?.timestamp, statTimestamp),
        summary: summaryState.summary,
        sourcePath: filePath,
        sourceMtimeMs: statTimestamp
      })
    }
  }

  return {
    sessions: [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)),
    hasPendingSummaryRefresh
  }
}

function registerAiSessionHandlers({
  ipcMain,
  safeError,
  summaryCacheFilePath = ''
}) {
  configureSummaryCache(summaryCacheFilePath)

  ipcMain.handle('get-project-ai-sessions', async (event, { projectPath } = {}) => {
    try {
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      if (!normalizedProjectPath) {
        return {
          success: true,
          data: {
            projectPath: '',
            hasPendingSummaryRefresh: false,
            sessions: {
              claude: [],
              codex: []
            }
          }
        }
      }

      const homeDir = os.homedir()
      const codexResult = loadCodexSessions(homeDir)
      const codexSessions = codexResult.sessions
        .filter((session) => isPathInsideProject(session.cwd, normalizedProjectPath))
        .slice(0, 100)
      const claudeResult = loadClaudeSessions(homeDir, normalizedProjectPath)
      const claudeSessions = claudeResult.sessions.slice(0, 100)

      return {
        success: true,
        data: {
          projectPath: normalizedProjectPath,
          hasPendingSummaryRefresh:
            hasPendingSummaryRefreshForSessions(codexSessions)
            || hasPendingSummaryRefreshForSessions(claudeSessions)
            || codexResult.hasPendingSummaryRefresh
            || claudeResult.hasPendingSummaryRefresh,
          sessions: {
            claude: claudeSessions,
            codex: codexSessions
          }
        }
      }
    } catch (error) {
      safeError('❌ 获取 AI 会话列表失败:', error.message)
      return {
        success: false,
        error: error.message,
        data: {
          projectPath: normalizeProjectPath(projectPath),
          hasPendingSummaryRefresh: false,
          sessions: {
            claude: [],
            codex: []
          }
        }
      }
    } finally {
      flushSummaryCache()
    }
  })

  ipcMain.handle('get-project-ai-session-detail', async (event, { provider, sourcePath, projectPath } = {}) => {
    try {
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      const normalizedSourcePath = normalizeProjectPath(sourcePath)
      const homeDir = os.homedir()
      const codexRoot = path.join(homeDir, '.codex', 'sessions')
      const claudeRoot = path.join(homeDir, '.claude', 'projects')

      if (!normalizedProjectPath || !normalizedSourcePath) {
        return {
          success: false,
          error: 'invalid session detail request',
          data: {
            messages: []
          }
        }
      }

      const allowed = provider === 'codex'
        ? isPathInsideRoot(normalizedSourcePath, codexRoot)
        : provider === 'claude'
          ? isPathInsideRoot(normalizedSourcePath, claudeRoot)
          : false

      if (!allowed || !fs.existsSync(normalizedSourcePath)) {
        return {
          success: false,
          error: 'session source unavailable',
          data: {
            messages: []
          }
        }
      }

      const messages = provider === 'claude'
        ? extractClaudeTranscript(normalizedSourcePath)
        : extractCodexTranscript(normalizedSourcePath)

      return {
        success: true,
        data: {
          projectPath: normalizedProjectPath,
          messages
        }
      }
    } catch (error) {
      safeError('❌ 获取 AI 会话详情失败:', error.message)
      return {
        success: false,
        error: error.message,
        data: {
          messages: []
        }
      }
    }
  })

  ipcMain.handle('delete-project-ai-session', async (event, { provider, sourcePath } = {}) => {
    try {
      const result = deleteAiSessionSource({ provider, sourcePath })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      safeError('❌ 删除 AI 会话失败:', error.message)
      return {
        success: false,
        error: error.message,
        data: {
          deleted: false
        }
      }
    }
  })
}

module.exports = {
  registerAiSessionHandlers,
  __testables: {
    normalizeSessionText,
    configureSummaryCache,
    flushSummaryCache,
    getSessionSummaryCacheState,
    readSessionSummaryCache,
    writeSessionSummaryCache,
    deleteSessionSummaryCache,
    deleteAiSessionSource,
    extractCodexMessageText,
    extractCodexSummary,
    extractCodexTranscript,
    extractClaudeContentText,
    extractClaudeSummary,
    extractClaudeTranscript
  }
}
