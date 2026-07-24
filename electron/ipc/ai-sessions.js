const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, spawn } = require('child_process')
const { version: OPEN_GIT_VERSION = '0.0.0' } = require('../../package.json')

const SESSION_CACHE_TTL = 15 * 1000
const SUMMARY_CACHE_VERSION = 1
const CODEX_APP_SERVER_TIMEOUT_MS = 12 * 1000
const CODEX_APP_SERVER_PAGE_LIMIT = 100
const CODEX_APP_SERVER_MAX_PAGES = 20
const SQLITE_BIN_CANDIDATES = process.platform === 'darwin'
  ? ['/usr/bin/sqlite3', 'sqlite3']
  : ['sqlite3', '/usr/bin/sqlite3']
const SQLITE_SEPARATOR = '\u001f'
const SQLITE_TIMEOUT_MS = 1500
const SQLITE_MAX_BUFFER = 2 * 1024 * 1024

let codexSessionsCache = { loadedAt: 0, homeDir: '', source: '', sessions: [] }
let claudeHistoryCache = { loadedAt: 0, entries: new Map() }
let codexHistoryCache = { loadedAt: 0, entries: new Map() }
let summaryCacheStore = { filePath: '', loaded: false, dirty: false, entries: new Map() }
const summaryRefreshJobs = new Map()
let sqliteBinary = null
let codexSessionsLoadJob = null

function resetSessionCaches() {
  codexSessionsCache = { loadedAt: 0, homeDir: '', source: '', sessions: [] }
  claudeHistoryCache = { loadedAt: 0, entries: new Map() }
  codexHistoryCache = { loadedAt: 0, entries: new Map() }
  codexSessionsLoadJob = null
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

function sqlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`
}

function resolveCodexStateDbPath(homeDir = os.homedir()) {
  const normalizedHomeDir = normalizeProjectPath(homeDir)
  if (!normalizedHomeDir) return ''
  return path.join(normalizedHomeDir, '.codex', 'state_5.sqlite')
}

function normalizeUnixTimestamp(value) {
  const timestamp = Number(value) || 0
  if (!timestamp) return 0
  return timestamp > 0 && timestamp < 1e11 ? timestamp * 1000 : timestamp
}

function isExecutableFile(filePath = '') {
  if (!filePath) return false
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return false
    if (process.platform === 'win32') return true
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch (error) {
    return false
  }
}

function resolveCodexExecutable(homeDir = os.homedir()) {
  const normalizedHomeDir = normalizeProjectPath(homeDir)
  const executableNames = process.platform === 'win32'
    ? ['codex.exe', 'codex.cmd', 'codex']
    : ['codex']
  const candidates = []

  if (process.env.CODEX_BINARY) {
    candidates.push(process.env.CODEX_BINARY)
  }

  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue
    for (const executableName of executableNames) {
      candidates.push(path.join(directory, executableName))
    }
  }

  if (normalizedHomeDir) {
    const homeCandidates = [
      path.join(normalizedHomeDir, '.local', 'bin'),
      path.join(normalizedHomeDir, '.npm-global', 'bin'),
      path.join(normalizedHomeDir, '.volta', 'bin'),
      path.join(normalizedHomeDir, '.asdf', 'shims'),
      path.join(normalizedHomeDir, '.bun', 'bin')
    ]
    for (const directory of homeCandidates) {
      for (const executableName of executableNames) {
        candidates.push(path.join(directory, executableName))
      }
    }

    const nvmVersionsRoot = path.join(normalizedHomeDir, '.nvm', 'versions', 'node')
    try {
      const nvmCandidates = fs.readdirSync(nvmVersionsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(nvmVersionsRoot, entry.name, 'bin', 'codex'))
        .filter(isExecutableFile)
        .sort((left, right) => {
          try {
            return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs
          } catch (error) {
            return 0
          }
        })
      candidates.push(...nvmCandidates)
    } catch (error) {}
  }

  if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex')
  } else if (process.platform !== 'win32') {
    candidates.push('/usr/local/bin/codex', '/usr/bin/codex')
  }

  return candidates.find(isExecutableFile) || 'codex'
}

function createCodexRpcError(payload = null, fallbackMessage = 'codex app-server request failed') {
  const error = new Error(payload?.message || fallbackMessage)
  if (payload?.code != null) {
    error.rpcCode = payload.code
  }
  return error
}

function runCodexAppServerRpc({
  homeDir = os.homedir(),
  timeoutMs = CODEX_APP_SERVER_TIMEOUT_MS,
  onReady,
  onResponse
} = {}) {
  return new Promise((resolve, reject) => {
    const normalizedHomeDir = normalizeProjectPath(homeDir)
    const executable = resolveCodexExecutable(normalizedHomeDir)
    const child = spawn(executable, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CODEX_HOME: path.join(normalizedHomeDir, '.codex')
      },
      shell: process.platform === 'win32' && /\.cmd$/i.test(executable),
      windowsHide: true
    })

    let settled = false
    let stdoutRemainder = ''
    let stderrText = ''
    let nextRequestId = 1

    const cleanup = () => {
      clearTimeout(timeout)
      try {
        child.stdin.end()
      } catch (error) {}
      try {
        child.kill('SIGTERM')
      } catch (error) {}
    }

    const finish = (error = null, value) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }

    const send = (message) => {
      if (settled || child.stdin.destroyed) return
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    const controller = {
      request(method, params = {}) {
        if (!method || settled) return 0
        const id = nextRequestId
        nextRequestId += 1
        send({ method, id, params })
        return id
      },
      resolve(value) {
        finish(null, value)
      },
      reject(error) {
        finish(error instanceof Error ? error : new Error(String(error || 'codex app-server request failed')))
      }
    }

    const handleMessage = (message) => {
      if (!message || typeof message !== 'object') return

      if (message.id === 0) {
        if (message.error) {
          finish(createCodexRpcError(message.error, 'codex app-server initialization failed'))
          return
        }
        send({ method: 'initialized', params: {} })
        try {
          onReady?.(controller)
        } catch (error) {
          controller.reject(error)
        }
        return
      }

      if (message.id == null) return
      try {
        onResponse?.(message, controller)
      } catch (error) {
        controller.reject(error)
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error('codex app-server request timed out'))
    }, Math.max(1000, Number(timeoutMs) || CODEX_APP_SERVER_TIMEOUT_MS))

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdoutRemainder += chunk
      const lines = stdoutRemainder.split('\n')
      stdoutRemainder = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        try {
          handleMessage(JSON.parse(line))
        } catch (error) {}
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderrText = `${stderrText}${chunk}`.slice(-4000)
    })

    child.stdin.on('error', (error) => {
      if (!settled) finish(error)
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (settled) return
      const detail = stderrText.trim()
      finish(new Error(detail || `codex app-server exited with code ${code}`))
    })

    send({
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
  })
}

function callCodexAppServer({
  homeDir = os.homedir(),
  method = '',
  params = {},
  timeoutMs = CODEX_APP_SERVER_TIMEOUT_MS
} = {}) {
  if (!method) {
    return Promise.reject(new Error('codex app-server method is required'))
  }

  let requestId = 0
  return runCodexAppServerRpc({
    homeDir,
    timeoutMs,
    onReady(controller) {
      requestId = controller.request(method, params)
    },
    onResponse(message, controller) {
      if (message.id !== requestId) return
      if (message.error) {
        controller.reject(createCodexRpcError(message.error))
        return
      }
      controller.resolve(message.result)
    }
  })
}

function listCodexThreadsFromAppServer({
  homeDir = os.homedir(),
  timeoutMs = CODEX_APP_SERVER_TIMEOUT_MS
} = {}) {
  const threads = []
  let listRequestId = 0
  let pageCount = 0

  return runCodexAppServerRpc({
    homeDir,
    timeoutMs,
    onReady(controller) {
      const requestPage = (cursor = null) => {
        pageCount += 1
        if (pageCount > CODEX_APP_SERVER_MAX_PAGES) {
          controller.reject(new Error('codex thread list exceeded pagination limit'))
          return
        }
        listRequestId = controller.request('thread/list', {
          cursor,
          limit: CODEX_APP_SERVER_PAGE_LIMIT,
          sortKey: 'recency_at',
          sortDirection: 'desc',
          archived: false
        })
      }
      controller.requestPage = requestPage
      requestPage(null)
    },
    onResponse(message, controller) {
      if (message.id !== listRequestId) return
      if (message.error) {
        controller.reject(createCodexRpcError(message.error, 'codex thread list failed'))
        return
      }

      const pageThreads = Array.isArray(message.result?.data) ? message.result.data : []
      threads.push(...pageThreads)
      const nextCursor = message.result?.nextCursor
      if (nextCursor) {
        controller.requestPage(nextCursor)
      } else {
        controller.resolve(threads)
      }
    }
  })
}

function execSqlite(databasePath, sql, { readonly = true } = {}) {
  if (!databasePath || !fs.existsSync(databasePath) || !sql) return ''
  const candidates = sqliteBinary ? [sqliteBinary] : [...SQLITE_BIN_CANDIDATES]

  for (const binary of candidates) {
    try {
      const args = []
      if (readonly) args.push('-readonly')
      args.push('-separator', SQLITE_SEPARATOR, databasePath, sql)
      const stdout = execFileSync(binary, args, {
        timeout: SQLITE_TIMEOUT_MS,
        maxBuffer: SQLITE_MAX_BUFFER,
        encoding: 'utf8'
      })
      sqliteBinary = binary
      return stdout || ''
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      return ''
    }
  }

  return ''
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

function extractCodexAppServerUserText(content = []) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const input of content) {
    if (!input || input.type !== 'text') continue
    const text = normalizeSessionText(input.text)
    if (text) parts.push(text)
  }
  return truncateText(parts.join('\n\n'))
}

function extractCodexAppServerTranscript(thread = {}) {
  const messages = []
  const turns = Array.isArray(thread?.turns) ? thread.turns : []

  for (const turn of turns) {
    const items = Array.isArray(turn?.items) ? turn.items : []
    const startedAt = normalizeIsoString(normalizeUnixTimestamp(turn?.startedAt))
    const completedAt = normalizeIsoString(
      normalizeUnixTimestamp(turn?.completedAt || turn?.startedAt)
    )

    for (const item of items) {
      if (item?.type === 'userMessage') {
        const text = extractCodexAppServerUserText(item.content)
        if (text) {
          messages.push({
            role: 'user',
            text,
            timestamp: startedAt
          })
        }
        continue
      }

      if (item?.type === 'agentMessage') {
        const text = normalizeSessionText(item.text)
        if (text) {
          messages.push({
            role: 'assistant',
            text,
            timestamp: completedAt
          })
        }
      }
    }
  }

  return messages
}

async function readCodexThreadFromAppServer({
  homeDir = os.homedir(),
  sessionId = '',
  rpcCall = callCodexAppServer
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) {
    throw new Error('invalid codex thread read request')
  }

  const result = await rpcCall({
    homeDir,
    method: 'thread/read',
    params: {
      threadId: normalizedSessionId,
      includeTurns: true
    }
  })
  if (!result?.thread) {
    throw new Error('codex thread unavailable')
  }
  return result.thread
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

function resolveAiSessionRoots(provider = '', homeDir = os.homedir()) {
  const normalizedHomeDir = normalizeProjectPath(homeDir)
  if (!normalizedHomeDir) {
    return {
      rootDir: '',
      archiveDir: '',
      indexPath: ''
    }
  }

  if (provider === 'codex') {
    const codexRoot = path.join(normalizedHomeDir, '.codex')
    return {
      rootDir: path.join(codexRoot, 'sessions'),
      archiveDir: path.join(codexRoot, 'archived_sessions'),
      indexPath: path.join(codexRoot, 'session_index.jsonl')
    }
  }

  if (provider === 'claude') {
    return {
      rootDir: path.join(normalizedHomeDir, '.claude', 'projects'),
      archiveDir: '',
      indexPath: ''
    }
  }

  return {
    rootDir: '',
    archiveDir: '',
    indexPath: ''
  }
}

function loadCodexThreadRows(homeDir = os.homedir(), { archived = false } = {}) {
  const stateDbPath = resolveCodexStateDbPath(homeDir)
  const buildSql = (titleExpression) => [
    `SELECT id, rollout_path, cwd, ${titleExpression}, first_user_message, preview, created_at_ms, updated_at_ms, archived`,
    'FROM threads',
    `WHERE archived = ${archived ? 1 : 0}`,
    "AND source IN ('cli', 'vscode')",
    'ORDER BY updated_at_ms DESC, created_at_ms DESC'
  ].join(' ')

  const stdout = execSqlite(
    stateDbPath,
    buildSql("COALESCE(NULLIF(name, ''), title)"),
    { readonly: true }
  ) || execSqlite(
    stateDbPath,
    buildSql('title'),
    { readonly: true }
  )
  if (!stdout) return []

  const rows = []
  for (const rawLine of stdout.split('\n')) {
    if (!rawLine) continue
    const parts = rawLine.split(SQLITE_SEPARATOR)
    if (parts.length < 9) continue
    rows.push({
      sessionId: String(parts[0] || '').trim(),
      rolloutPath: String(parts[1] || '').trim(),
      cwd: normalizeProjectPath(parts[2] || ''),
      title: typeof parts[3] === 'string' ? parts[3].trim() : '',
      firstUserMessage: typeof parts[4] === 'string' ? parts[4].trim() : '',
      preview: typeof parts[5] === 'string' ? parts[5].trim() : '',
      createdAtMs: Number(parts[6]) || 0,
      updatedAtMs: Number(parts[7]) || 0,
      archived: Number(parts[8]) === 1
    })
  }

  return rows
}

function loadCodexHistory(homeDir = os.homedir()) {
  const now = Date.now()
  if ((now - codexHistoryCache.loadedAt) < SESSION_CACHE_TTL) {
    return codexHistoryCache.entries
  }

  const historyPath = path.join(homeDir, '.codex', 'history.jsonl')
  const historyMap = new Map()

  readJsonlFile(historyPath, (item) => {
    const sessionId = String(item?.session_id || '').trim()
    const text = typeof item?.text === 'string' ? item.text.trim() : ''
    if (!sessionId || !text) return

    const timestamp = Number(item?.ts) || 0
    const current = historyMap.get(sessionId)
    if (!current) {
      historyMap.set(sessionId, {
        firstText: text,
        firstTimestamp: timestamp,
        lastTimestamp: timestamp,
        count: 1
      })
      return
    }

    if (!current.firstText) {
      current.firstText = text
    }
    if (timestamp > 0) {
      if (!current.firstTimestamp || timestamp < current.firstTimestamp) {
        current.firstTimestamp = timestamp
      }
      if (!current.lastTimestamp || timestamp > current.lastTimestamp) {
        current.lastTimestamp = timestamp
      }
    }
    current.count = (current.count || 1) + 1
  })

  codexHistoryCache = {
    loadedAt: now,
    entries: historyMap
  }

  return historyMap
}

function buildCodexIndex(homeDir) {
  const { indexPath } = resolveAiSessionRoots('codex', homeDir)
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

function loadCodexSessionsFromFiles(homeDir) {
  const { rootDir: sessionsRoot } = resolveAiSessionRoots('codex', homeDir)
  const indexMap = buildCodexIndex(homeDir)
  const historyMap = loadCodexHistory(homeDir)
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
    const historyEntry = historyMap.get(sessionId)

    let statTimestamp = 0
    try {
      statTimestamp = fs.statSync(filePath).mtimeMs
    } catch (error) {}

    const createdAtMs = toTimestamp(record.payload.timestamp)
      || (historyEntry?.firstTimestamp ? historyEntry.firstTimestamp * 1000 : 0)
      || statTimestamp
    const indexed = indexMap.get(sessionId)
    const updatedAt = indexed?.updatedAt
      || normalizeIsoString(createdAtMs, statTimestamp)
      || normalizeIsoString(statTimestamp)
    const summaryState = resolveSessionSummary({
      provider: 'codex',
      sessionId,
      sourcePath: filePath,
      sourceMtimeMs: statTimestamp,
      extractSummary: extractCodexSummary
    })
    hasPendingSummaryRefresh = hasPendingSummaryRefresh || summaryState.pendingRefresh
    const fallbackTitle = extractCodexSummary(filePath)

    mergeSessionEntry(sessionMap, {
      provider: 'codex',
      sessionId,
      title: indexed?.title || historyEntry?.firstText || fallbackTitle || path.basename(cwd) || sessionId,
      cwd,
      updatedAt,
      summary: summaryState.summary,
      sourcePath: filePath,
      sourceMtimeMs: statTimestamp,
      archived: false
    })
  }

  return {
    sessions: [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)),
    hasPendingSummaryRefresh
  }
}

async function renameCodexSession({
  homeDir = os.homedir(),
  sessionId = '',
  title = '',
  rpcCall = callCodexAppServer
} = {}) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : ''
  const normalizedSessionId = String(sessionId || '').trim()

  if (!normalizedSessionId || !normalizedTitle) {
    throw new Error('invalid codex rename request')
  }

  await rpcCall({
    homeDir,
    method: 'thread/name/set',
    params: {
      threadId: normalizedSessionId,
      name: normalizedTitle
    }
  })

  resetSessionCaches()

  return {
    renamed: true,
    title: normalizedTitle
  }
}

async function archiveCodexSessionSource({
  homeDir = os.homedir(),
  sessionId = '',
  rpcCall = callCodexAppServer
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) {
    throw new Error('invalid codex archive request')
  }

  await rpcCall({
    homeDir,
    method: 'thread/archive',
    params: {
      threadId: normalizedSessionId
    }
  })
  deleteSessionSummaryCache({ provider: 'codex', sessionId: normalizedSessionId })
  flushSummaryCache()
  resetSessionCaches()

  return {
    archived: true
  }
}

async function deleteAiSessionSource({
  provider = '',
  sourcePath = '',
  sessionId = '',
  homeDir = os.homedir(),
  rpcCall = callCodexAppServer
} = {}) {
  const normalizedSourcePath = normalizeProjectPath(sourcePath)

  if (provider === 'codex') {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) {
      throw new Error('invalid codex delete request')
    }
    await rpcCall({
      homeDir,
      method: 'thread/delete',
      params: {
        threadId: normalizedSessionId
      }
    })
    deleteSessionSummaryCache({
      provider: 'codex',
      sessionId: normalizedSessionId,
      sourcePath: normalizedSourcePath
    })
    flushSummaryCache()
    resetSessionCaches()
    return { deleted: true }
  }

  if (!normalizedSourcePath) {
    throw new Error('invalid session source path')
  }

  const { rootDir } = resolveAiSessionRoots(provider, homeDir)

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

function normalizeCodexAppServerThread(thread = {}) {
  const sessionId = String(thread?.id || thread?.sessionId || '').trim()
  const cwd = normalizeProjectPath(thread?.cwd || '')
  const sourcePath = normalizeProjectPath(thread?.path || '')
  if (!sessionId || !cwd) return null

  let statTimestamp = 0
  if (sourcePath) {
    try {
      statTimestamp = fs.statSync(sourcePath).mtimeMs
    } catch (error) {}
  }

  const preview = truncateText(thread?.preview || '')
  const title = typeof thread?.name === 'string' ? thread.name.trim() : ''
  const updatedAtMs = normalizeUnixTimestamp(
    thread?.recencyAt || thread?.updatedAt || thread?.createdAt
  )

  return {
    provider: 'codex',
    sessionId,
    title: title || preview || path.basename(cwd) || sessionId,
    cwd,
    updatedAt: normalizeIsoString(updatedAtMs, statTimestamp),
    summary: preview,
    sourcePath,
    sourceMtimeMs: statTimestamp,
    archived: false
  }
}

async function loadCodexSessionsLatest(homeDir = os.homedir(), {
  listThreads = listCodexThreadsFromAppServer
} = {}) {
  const normalizedHomeDir = normalizeProjectPath(homeDir)
  const now = Date.now()
  if (
    codexSessionsCache.source === 'app-server'
    && codexSessionsCache.homeDir === normalizedHomeDir
    && (now - codexSessionsCache.loadedAt) < SESSION_CACHE_TTL
  ) {
    return {
      sessions: codexSessionsCache.sessions,
      hasPendingSummaryRefresh: false
    }
  }

  const useSharedLoadJob = listThreads === listCodexThreadsFromAppServer
  if (useSharedLoadJob && codexSessionsLoadJob) {
    return codexSessionsLoadJob
  }

  const loadJob = (async () => {
    try {
      const threads = await listThreads({ homeDir: normalizedHomeDir })
      const sessionMap = new Map()
      for (const thread of threads) {
        const session = normalizeCodexAppServerThread(thread)
        if (!session) continue
        mergeSessionEntry(sessionMap, session)
      }

      codexSessionsCache = {
        loadedAt: Date.now(),
        homeDir: normalizedHomeDir,
        source: 'app-server',
        sessions: [...sessionMap.values()]
          .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))
      }

      return {
        sessions: codexSessionsCache.sessions,
        hasPendingSummaryRefresh: false
      }
    } catch (error) {
      if (
        codexSessionsCache.source === 'app-server'
        && codexSessionsCache.homeDir === normalizedHomeDir
      ) {
        return {
          sessions: codexSessionsCache.sessions,
          hasPendingSummaryRefresh: false
        }
      }
      throw error
    }
  })()

  if (useSharedLoadJob) {
    codexSessionsLoadJob = loadJob
  }

  try {
    return await loadJob
  } finally {
    if (useSharedLoadJob && codexSessionsLoadJob === loadJob) {
      codexSessionsLoadJob = null
    }
  }
}

function loadCodexSessions(homeDir) {
  const normalizedHomeDir = normalizeProjectPath(homeDir)
  const now = Date.now()
  if (
    codexSessionsCache.source === 'legacy'
    && codexSessionsCache.homeDir === normalizedHomeDir
    && (now - codexSessionsCache.loadedAt) < SESSION_CACHE_TTL
  ) {
    return {
      sessions: codexSessionsCache.sessions,
      hasPendingSummaryRefresh: hasPendingSummaryRefreshForSessions(codexSessionsCache.sessions)
    }
  }

  const historyMap = loadCodexHistory(homeDir)
  const stateDbPath = resolveCodexStateDbPath(homeDir)
  const hasStateDb = !!(stateDbPath && fs.existsSync(stateDbPath))
  const threadRows = loadCodexThreadRows(homeDir, { archived: false })
  const fallbackResult = hasStateDb
    ? { sessions: [], hasPendingSummaryRefresh: false }
    : loadCodexSessionsFromFiles(homeDir)
  const sessionMap = new Map()
  let hasPendingSummaryRefresh = false

  for (const row of threadRows) {
    const sessionId = row.sessionId
    const cwd = row.cwd
    if (!sessionId || !cwd) continue
    const historyEntry = historyMap.get(sessionId)
    const rolloutExists = !!(row.rolloutPath && fs.existsSync(row.rolloutPath))
    if (!rolloutExists) continue

    let statTimestamp = 0
    try {
      statTimestamp = rolloutExists
        ? fs.statSync(row.rolloutPath).mtimeMs
        : 0
    } catch (error) {}

    const updatedAt = normalizeIsoString(row.updatedAtMs || row.createdAtMs, statTimestamp)
      || normalizeIsoString(statTimestamp)
    const primarySummary = truncateText(row.preview || row.firstUserMessage || '')
    let summary = primarySummary
    let pendingRefresh = false

    if (!summary && row.rolloutPath) {
      const summaryState = resolveSessionSummary({
        provider: 'codex',
        sessionId,
        sourcePath: row.rolloutPath,
        sourceMtimeMs: statTimestamp,
        extractSummary: extractCodexSummary
      })
      summary = summaryState.summary
      pendingRefresh = summaryState.pendingRefresh
    }
    hasPendingSummaryRefresh = hasPendingSummaryRefresh || pendingRefresh

    mergeSessionEntry(sessionMap, {
      provider: 'codex',
      sessionId,
      title: row.title || historyEntry?.firstText || path.basename(cwd) || sessionId,
      cwd,
      updatedAt,
      summary,
      sourcePath: row.rolloutPath,
      sourceMtimeMs: statTimestamp,
      archived: false
    })
  }

  for (const session of fallbackResult.sessions) {
    if (!session?.sessionId || sessionMap.has(session.sessionId)) continue
    mergeSessionEntry(sessionMap, session)
  }

  codexSessionsCache = {
    loadedAt: now,
    homeDir: normalizedHomeDir,
    source: 'legacy',
    sessions: [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
  }

  return {
    sessions: codexSessionsCache.sessions,
    hasPendingSummaryRefresh: hasPendingSummaryRefresh || fallbackResult.hasPendingSummaryRefresh
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
      const codexResult = await loadCodexSessionsLatest(homeDir)
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

  ipcMain.handle('get-project-ai-session-detail', async (
    event,
    { provider, sourcePath, sessionId, projectPath } = {}
  ) => {
    try {
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      const normalizedSourcePath = normalizeProjectPath(sourcePath)
      const normalizedSessionId = String(sessionId || '').trim()
      const homeDir = os.homedir()
      const codexRoot = path.join(homeDir, '.codex', 'sessions')
      const claudeRoot = path.join(homeDir, '.claude', 'projects')

      if (!normalizedProjectPath) {
        return {
          success: false,
          error: 'invalid session detail request',
          data: {
            messages: []
          }
        }
      }

      let messages = []
      if (provider === 'codex') {
        if (!normalizedSessionId) {
          throw new Error('invalid codex thread read request')
        }

        try {
          const thread = await readCodexThreadFromAppServer({
            homeDir,
            sessionId: normalizedSessionId
          })
          if (!isPathInsideProject(thread.cwd, normalizedProjectPath)) {
            throw new Error('codex thread is outside the current project')
          }
          messages = extractCodexAppServerTranscript(thread)
        } catch (error) {
          const canUseLegacySource = normalizedSourcePath
            && isPathInsideRoot(normalizedSourcePath, codexRoot)
            && fs.existsSync(normalizedSourcePath)
          if (!canUseLegacySource || error.message === 'codex thread is outside the current project') {
            throw error
          }
          messages = extractCodexTranscript(normalizedSourcePath)
        }
      } else if (provider === 'claude') {
        const allowed = normalizedSourcePath
          && isPathInsideRoot(normalizedSourcePath, claudeRoot)
          && fs.existsSync(normalizedSourcePath)
        if (!allowed) {
          throw new Error('session source unavailable')
        }
        messages = extractClaudeTranscript(normalizedSourcePath)
      } else {
        return {
          success: false,
          error: 'unsupported session provider',
          data: {
            messages: []
          }
        }
      }

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

  ipcMain.handle('delete-project-ai-session', async (event, { provider, sourcePath, sessionId } = {}) => {
    try {
      const result = await deleteAiSessionSource({ provider, sourcePath, sessionId })
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

  ipcMain.handle('rename-project-ai-session', async (event, { provider, sessionId, title } = {}) => {
    try {
      if (provider !== 'codex') {
        throw new Error('rename is only supported for codex sessions')
      }
      const result = await renameCodexSession({ sessionId, title })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      safeError('❌ 重命名 AI 会话失败:', error.message)
      return {
        success: false,
        error: error.message,
        data: {
          renamed: false
        }
      }
    }
  })

  ipcMain.handle('archive-project-ai-session', async (event, { provider, sessionId } = {}) => {
    try {
      if (provider !== 'codex') {
        throw new Error('archive is only supported for codex sessions')
      }
      const result = await archiveCodexSessionSource({ sessionId })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      safeError('❌ 归档 AI 会话失败:', error.message)
      return {
        success: false,
        error: error.message,
        data: {
          archived: false
        }
      }
    }
  })
}

module.exports = {
  registerAiSessionHandlers,
  __testables: {
    normalizeSessionText,
    resetSessionCaches,
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
    extractCodexAppServerUserText,
    extractCodexAppServerTranscript,
    extractClaudeContentText,
    extractClaudeSummary,
    extractClaudeTranscript,
    resolveAiSessionRoots,
    resolveCodexExecutable,
    callCodexAppServer,
    listCodexThreadsFromAppServer,
    readCodexThreadFromAppServer,
    normalizeCodexAppServerThread,
    renameCodexSession,
    archiveCodexSessionSource,
    loadCodexSessions,
    loadCodexSessionsLatest
  }
}
