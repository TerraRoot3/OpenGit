const fs = require('fs')
const path = require('path')
const os = require('os')

const SESSION_CACHE_TTL = 15 * 1000

let codexSessionsCache = { loadedAt: 0, sessions: [] }
let claudeHistoryCache = { loadedAt: 0, entries: new Map() }

function resetSessionCaches() {
  codexSessionsCache = { loadedAt: 0, sessions: [] }
  claudeHistoryCache = { loadedAt: 0, entries: new Map() }
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

  readJsonlFile(filePath, (item) => {
    if (summary) return
    if (item?.type === 'response_item' && item.payload?.type === 'message' && item.payload?.role === 'user') {
      const text = extractCodexMessageText(item.payload.content)
      if (text) {
        summary = text
      }
      return
    }

    if (item?.type === 'event_msg' && item.payload?.type === 'user_message') {
      const text = normalizeSessionText(item.payload.message)
      if (text) {
        summary = text
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

  readJsonlFile(filePath, (item) => {
    if (summary) return
    if (item?.type !== 'user') return
    if (item.message?.role !== 'user') return
    const text = extractClaudeContentText(item.message.content)
    if (text) {
      summary = text
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
    return codexSessionsCache.sessions
  }

  const sessionsRoot = path.join(homeDir, '.codex', 'sessions')
  const indexMap = buildCodexIndex(homeDir)
  const files = walkFiles(sessionsRoot, (fullPath) => fullPath.endsWith('.jsonl'))
  const sessionMap = new Map()

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

    mergeSessionEntry(sessionMap, {
      provider: 'codex',
      sessionId,
      title: indexed?.title || path.basename(cwd) || sessionId,
      cwd,
      updatedAt,
      summary: extractCodexSummary(filePath),
      sourcePath: filePath
    })
  }

  codexSessionsCache = {
    loadedAt: now,
    sessions: [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
  }

  return codexSessionsCache.sessions
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
  if (!fs.existsSync(projectsRoot)) return []

  const encodedProjectPath = encodeClaudeProjectPath(projectPath)
  if (!encodedProjectPath) return []

  const historyMap = loadClaudeHistory(homeDir)
  const sessionMap = new Map()
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

      mergeSessionEntry(sessionMap, {
        provider: 'claude',
        sessionId,
        title: history?.title || path.basename(cwd) || sessionId,
        cwd,
        updatedAt: normalizeIsoString(history?.timestamp || record?.timestamp, statTimestamp),
        summary: extractClaudeSummary(filePath),
        sourcePath: filePath
      })
    }
  }

  return [...sessionMap.values()].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
}

function registerAiSessionHandlers({
  ipcMain,
  safeError
}) {
  ipcMain.handle('get-project-ai-sessions', async (event, { projectPath } = {}) => {
    try {
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      if (!normalizedProjectPath) {
        return {
          success: true,
          data: {
            projectPath: '',
            sessions: {
              claude: [],
              codex: []
            }
          }
        }
      }

      const homeDir = os.homedir()
      const codexSessions = loadCodexSessions(homeDir)
        .filter((session) => isPathInsideProject(session.cwd, normalizedProjectPath))
        .slice(0, 100)
      const claudeSessions = loadClaudeSessions(homeDir, normalizedProjectPath).slice(0, 100)

      return {
        success: true,
        data: {
          projectPath: normalizedProjectPath,
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
          sessions: {
            claude: [],
            codex: []
          }
        }
      }
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
    deleteAiSessionSource,
    extractCodexMessageText,
    extractCodexSummary,
    extractCodexTranscript,
    extractClaudeContentText,
    extractClaudeSummary,
    extractClaudeTranscript
  }
}
