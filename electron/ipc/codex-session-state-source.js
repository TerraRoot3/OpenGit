const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const CODEX_HOME = path.join(os.homedir(), '.codex')
const STATE_DB_PATH = path.join(CODEX_HOME, 'state_5.sqlite')
const LOGS_DB_PATH = path.join(CODEX_HOME, 'logs_2.sqlite')
const SQLITE_BIN_CANDIDATES = process.platform === 'darwin'
  ? ['/usr/bin/sqlite3', 'sqlite3']
  : ['sqlite3', '/usr/bin/sqlite3']
const SQLITE_SEPARATOR = '\u001f'
const SQLITE_TIMEOUT_MS = 1500
const SQLITE_MAX_BUFFER = 2 * 1024 * 1024
const ROLLOUT_TAIL_BYTES = 256 * 1024
const CACHE_TTL_MS = 1200
const DEFAULT_THREAD_LIMIT = 80
const MAX_THREAD_LIMIT = 200

function sqlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`
}

function parseMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = typeof value === 'string' ? value.trim() : String(value || '').trim()
  if (!raw) return 0
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) return 0
    // Codex sqlite logs use second-level unix timestamps, while rollout/state files use milliseconds.
    // Normalize everything to milliseconds before ordering status markers.
    return numeric > 0 && numeric < 1e11 ? numeric * 1000 : numeric
  }
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function decodeHexUtf8(value) {
  const hex = typeof value === 'string' ? value.trim() : ''
  if (!hex) return ''
  try {
    return Buffer.from(hex, 'hex').toString('utf8')
  } catch {
    return ''
  }
}

function parseThreadRow(line) {
  const parts = String(line || '').split(SQLITE_SEPARATOR)
  if (parts.length < 10) return null
  return {
    id: parts[0] || '',
    cwd: parts[1] || '',
    createdAt: parseMillis(parts[2]),
    updatedAt: parseMillis(parts[3]),
    rolloutPath: parts[4] || '',
    title: decodeHexUtf8(parts[5]),
    preview: decodeHexUtf8(parts[6]),
    source: decodeHexUtf8(parts[7]),
    threadSource: decodeHexUtf8(parts[8]),
    name: decodeHexUtf8(parts[9])
  }
}

function readTailText(filePath, maxBytes = ROLLOUT_TAIL_BYTES) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return ''
    const bytesToRead = Math.min(stat.size, maxBytes)
    const start = Math.max(0, stat.size - bytesToRead)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(bytesToRead)
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, start)
      let text = buffer.slice(0, bytesRead).toString('utf8')
      if (start > 0) {
        const newlineIndex = text.indexOf('\n')
        if (newlineIndex >= 0) {
          text = text.slice(newlineIndex + 1)
        }
      }
      return text
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

function parseRolloutSignals(text) {
  const signals = {
    startedAt: 0,
    completedAt: 0,
    abortedAt: 0
  }
  if (!text) return signals

  const lines = text.split('\n')
  for (const line of lines) {
    if (!line || line.indexOf('"type":"event_msg"') === -1) continue
    let parsed = null
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const eventType = parsed?.type
    const payloadType = parsed?.payload?.type
    if (eventType !== 'event_msg' || !payloadType) continue
    const at = parseMillis(parsed?.timestamp)
    if (!at) continue
    if (payloadType === 'task_started') {
      signals.startedAt = Math.max(signals.startedAt, at)
      continue
    }
    if (payloadType === 'task_complete') {
      signals.completedAt = Math.max(signals.completedAt, at)
      continue
    }
    if (payloadType === 'turn_aborted') {
      signals.abortedAt = Math.max(signals.abortedAt, at)
    }
  }

  return signals
}

function parseLogSignals(rows) {
  const signals = {
    runningAt: 0,
    runningReason: '',
    endedAt: 0,
    endedReason: ''
  }

  for (const row of rows) {
    const body = row?.body || ''
    const at = parseMillis(row?.ts)
    if (!at || !body) continue

    if (
      !signals.runningAt &&
      (
        body.includes('event.kind=response.output') ||
        body.includes('event.kind=response.function_call_arguments')
      )
    ) {
      signals.runningAt = at
      signals.runningReason = 'logs.response_output'
    }
    if (!signals.endedAt && body.includes('Agent loop exited')) {
      signals.endedAt = at
      signals.endedReason = 'logs.agent_loop_exited'
    }
    if (!signals.endedAt && body.includes('Shutting down Codex instance')) {
      signals.endedAt = at
      signals.endedReason = 'logs.shutdown'
    }

    if (signals.runningAt && signals.endedAt) break
  }

  return signals
}

function resolveThreadStatusSignals(rolloutSignals, logSignals) {
  const markers = []
  if (rolloutSignals.startedAt) {
    markers.push({
      at: rolloutSignals.startedAt,
      status: 'running',
      reason: 'rollout.task_started'
    })
  }
  if (rolloutSignals.completedAt) {
    markers.push({
      at: rolloutSignals.completedAt,
      status: 'ended',
      reason: 'rollout.task_complete'
    })
  }
  if (rolloutSignals.abortedAt) {
    markers.push({
      at: rolloutSignals.abortedAt,
      status: 'ended',
      reason: 'rollout.turn_aborted'
    })
  }
  if (logSignals.runningAt) {
    markers.push({
      at: logSignals.runningAt,
      status: 'running',
      reason: logSignals.runningReason || 'logs.running'
    })
  }
  if (logSignals.endedAt) {
    markers.push({
      at: logSignals.endedAt,
      status: 'ended',
      reason: logSignals.endedReason || 'logs.ended'
    })
  }

  markers.sort((left, right) => right.at - left.at)
  return markers[0] || null
}

function createCodexSessionStateSource({ safeLog, safeError } = {}) {
  const rolloutCache = new Map()
  const logCache = new Map()
  let sqliteBinary = null

  const logWarn = (...args) => {
    if (typeof safeError === 'function') safeError(...args)
  }

  const execSqlite = (databasePath, sql) => new Promise((resolve) => {
    if (!databasePath || !fs.existsSync(databasePath)) {
      resolve('')
      return
    }

    const candidates = sqliteBinary ? [sqliteBinary] : [...SQLITE_BIN_CANDIDATES]

    const attempt = (index) => {
      if (index >= candidates.length) {
        resolve('')
        return
      }

      const binary = candidates[index]
      execFile(
        binary,
        ['-readonly', '-separator', SQLITE_SEPARATOR, databasePath, sql],
        {
          timeout: SQLITE_TIMEOUT_MS,
          maxBuffer: SQLITE_MAX_BUFFER
        },
        (error, stdout) => {
          if (!error) {
            sqliteBinary = binary
            resolve(stdout || '')
            return
          }
          if (error.code === 'ENOENT') {
            attempt(index + 1)
            return
          }
          if (typeof safeLog === 'function') {
            safeLog('⚠️ sqlite query failed:', { databasePath, message: error.message })
          }
          resolve('')
        }
      )
    }

    attempt(0)
  })

  const listThreads = async ({
    projectPaths = [],
    query = '',
    limit = DEFAULT_THREAD_LIMIT,
    includeSubagents = false
  } = {}) => {
    const normalizedPaths = Array.from(new Set(
      projectPaths
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ))
    const normalizedQuery = String(query || '').trim()
    const normalizedLimit = Math.min(
      MAX_THREAD_LIMIT,
      Math.max(1, Number(limit) || DEFAULT_THREAD_LIMIT)
    )
    const filters = ['archived = 0']
    if (!includeSubagents) {
      filters.push("source NOT LIKE '{\"subagent\"%'")
    }
    if (normalizedPaths.length > 0) {
      filters.push(`cwd IN (${normalizedPaths.map(sqlQuote).join(', ')})`)
    }
    if (normalizedQuery) {
      const searchValue = `%${normalizedQuery}%`
      filters.push([
        '(',
        `COALESCE(name, '') LIKE ${sqlQuote(searchValue)}`,
        `OR COALESCE(title, '') LIKE ${sqlQuote(searchValue)}`,
        `OR COALESCE(preview, '') LIKE ${sqlQuote(searchValue)}`,
        `OR COALESCE(first_user_message, '') LIKE ${sqlQuote(searchValue)}`,
        `OR cwd LIKE ${sqlQuote(searchValue)}`,
        `OR id LIKE ${sqlQuote(searchValue)}`,
        ')'
      ].join(' '))
    }
    const sql = [
      [
        'SELECT id, cwd, created_at_ms, updated_at_ms, rollout_path,',
        "hex(COALESCE(NULLIF(name, ''), NULLIF(title, ''), NULLIF(preview, ''),",
        "NULLIF(first_user_message, ''), id)),",
        "hex(COALESCE(preview, '')), hex(COALESCE(source, '')),",
        "hex(COALESCE(thread_source, '')), hex(COALESCE(name, ''))"
      ].join(' '),
      'FROM threads',
      `WHERE ${filters.join(' AND ')}`,
      'ORDER BY recency_at_ms DESC, updated_at_ms DESC, id DESC',
      `LIMIT ${normalizedLimit}`
    ].join(' ')

    const stdout = await execSqlite(STATE_DB_PATH, sql)
    if (!stdout) return []

    const rows = []
    for (const line of stdout.split('\n')) {
      if (!line) continue
      const row = parseThreadRow(line)
      if (row?.id) rows.push(row)
    }
    return rows
  }

  const listActiveThreads = async (projectPaths = []) => {
    const normalizedPaths = Array.from(new Set(projectPaths.filter(Boolean)))
    if (!normalizedPaths.length) return []
    return listThreads({
      projectPaths: normalizedPaths,
      limit: MAX_THREAD_LIMIT
    })
  }

  const getThread = async (threadId = '') => {
    const normalizedThreadId = typeof threadId === 'string' ? threadId.trim() : ''
    if (!normalizedThreadId) return null

    const sql = [
      [
        'SELECT id, cwd, created_at_ms, updated_at_ms, rollout_path,',
        "hex(COALESCE(NULLIF(name, ''), NULLIF(title, ''), NULLIF(preview, ''),",
        "NULLIF(first_user_message, ''), id)),",
        "hex(COALESCE(preview, '')), hex(COALESCE(source, '')),",
        "hex(COALESCE(thread_source, '')), hex(COALESCE(name, ''))"
      ].join(' '),
      'FROM threads',
      `WHERE id = ${sqlQuote(normalizedThreadId)}`,
      'LIMIT 1'
    ].join(' ')

    const stdout = await execSqlite(STATE_DB_PATH, sql)
    if (!stdout) return null

    for (const line of stdout.split('\n')) {
      if (!line) continue
      const row = parseThreadRow(line)
      if (row?.id) return row
    }

    return null
  }

  const getRolloutSignals = (rolloutPath) => {
    if (!rolloutPath) return { startedAt: 0, completedAt: 0, abortedAt: 0 }
    try {
      const stat = fs.statSync(rolloutPath)
      const cached = rolloutCache.get(rolloutPath)
      if (
        cached &&
        cached.mtimeMs === stat.mtimeMs &&
        Date.now() - cached.cachedAt < CACHE_TTL_MS
      ) {
        return cached.signals
      }
      const text = readTailText(rolloutPath)
      const signals = parseRolloutSignals(text)
      rolloutCache.set(rolloutPath, {
        mtimeMs: stat.mtimeMs,
        cachedAt: Date.now(),
        signals
      })
      return signals
    } catch (error) {
      logWarn('⚠️ read rollout signals failed:', error.message)
      return { startedAt: 0, completedAt: 0, abortedAt: 0 }
    }
  }

  const getLogSignals = async (threadId) => {
    const normalizedThreadId = typeof threadId === 'string' ? threadId.trim() : ''
    if (!normalizedThreadId) return { runningAt: 0, runningReason: '', endedAt: 0, endedReason: '' }

    const cached = logCache.get(normalizedThreadId)
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.signals
    }

    const sql = [
      "SELECT id, COALESCE(ts,''), hex(feedback_log_body)",
      'FROM logs',
      `WHERE thread_id = ${sqlQuote(normalizedThreadId)}`,
      'AND feedback_log_body IS NOT NULL',
      "AND (instr(feedback_log_body, 'Agent loop exited') > 0",
      "OR instr(feedback_log_body, 'Shutting down Codex instance') > 0",
      "OR instr(feedback_log_body, 'event.kind=response.output') > 0",
      "OR instr(feedback_log_body, 'event.kind=response.function_call_arguments') > 0)",
      'ORDER BY id DESC',
      'LIMIT 80'
    ].join(' ')

    const stdout = await execSqlite(LOGS_DB_PATH, sql)
    const rows = []
    if (stdout) {
      for (const line of stdout.split('\n')) {
        if (!line) continue
        const parts = line.split(SQLITE_SEPARATOR)
        if (parts.length < 3) continue
        rows.push({
          id: Number(parts[0]) || 0,
          ts: parts[1] || '',
          body: decodeHexUtf8(parts[2])
        })
      }
    }

    const signals = parseLogSignals(rows)
    logCache.set(normalizedThreadId, {
      cachedAt: Date.now(),
      signals
    })
    return signals
  }

  const resolveThreadStatus = async ({ threadId = '', rolloutPath = '' } = {}) => {
    const rolloutSignals = getRolloutSignals(rolloutPath)
    const logSignals = await getLogSignals(threadId)
    return resolveThreadStatusSignals(rolloutSignals, logSignals)
  }

  return {
    stateDbPath: STATE_DB_PATH,
    logsDbPath: LOGS_DB_PATH,
    listThreads,
    listActiveThreads,
    getThread,
    resolveThreadStatus
  }
}

module.exports = {
  createCodexSessionStateSource,
  __testables: {
    parseMillis,
    parseThreadRow,
    parseLogSignals,
    parseRolloutSignals,
    resolveThreadStatusSignals
  }
}
