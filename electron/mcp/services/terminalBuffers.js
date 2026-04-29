const DEFAULT_MAX_LINES = 2000
const DEFAULT_MAX_RAW_BYTES = 256 * 1024
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

function stripAnsi(value) {
  return String(value || '').replace(ANSI_PATTERN, '')
}

function trimToMaxBytes(value, maxBytes) {
  if (!value) return ''
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return ''
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (byteLength <= maxBytes) return value
  return Buffer.from(value, 'utf8').subarray(byteLength - maxBytes).toString('utf8')
}

function normalizeTerminalMode(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'classic'
  if (raw === 'classic' || raw === 'liquid' || raw === 'split' || raw === 'standalone') {
    return raw
  }
  if (raw.includes('split')) return 'split'
  if (raw.includes('liquid') || raw.includes('focus')) return 'liquid'
  if (raw.includes('standalone')) return 'standalone'
  return 'classic'
}

function createTerminalRecord({
  terminalId,
  projectPath = '',
  cwd = '',
  mode = 'classic',
  createdAt = Date.now()
}) {
  return {
    terminalId,
    projectPath: projectPath || cwd || '',
    cwd: cwd || projectPath || '',
    mode: normalizeTerminalMode(mode),
    createdAt,
    lastOutputAt: null,
    lines: [],
    rawBuffer: '',
    partialLine: '',
    sequence: 0
  }
}

function createTerminalBufferStore({
  maxLines = DEFAULT_MAX_LINES,
  maxRawBytes = DEFAULT_MAX_RAW_BYTES
} = {}) {
  const terminalMap = new Map()

  const ensureTerminal = ({
    terminalId,
    projectPath = '',
    cwd = '',
    mode = 'classic',
    createdAt
  }) => {
    if (!terminalId) return null
    const existing = terminalMap.get(terminalId)
    if (existing) {
      updateTerminal(terminalId, { projectPath, cwd, mode })
      return existing
    }
    const record = createTerminalRecord({ terminalId, projectPath, cwd, mode, createdAt })
    terminalMap.set(terminalId, record)
    return record
  }

  const updateTerminal = (terminalId, patch = {}) => {
    const record = terminalMap.get(terminalId)
    if (!record) return null
    if (typeof patch.projectPath === 'string' && patch.projectPath.trim()) {
      record.projectPath = patch.projectPath.trim()
    }
    if (typeof patch.cwd === 'string' && patch.cwd.trim()) {
      record.cwd = patch.cwd.trim()
      if (!record.projectPath) record.projectPath = record.cwd
    }
    if (patch.mode != null) {
      record.mode = normalizeTerminalMode(patch.mode)
    }
    return record
  }

  const pushLine = (record, text, at) => {
    record.sequence += 1
    record.lines.push({
      seq: record.sequence,
      at,
      text,
      plainText: stripAnsi(text)
    })
    if (record.lines.length > maxLines) {
      record.lines.splice(0, record.lines.length - maxLines)
    }
  }

  const appendOutput = (terminalId, chunk) => {
    const record = terminalMap.get(terminalId)
    if (!record || !chunk) return null

    const data = String(chunk)
    const at = Date.now()
    record.lastOutputAt = at
    record.rawBuffer = trimToMaxBytes(record.rawBuffer + data, maxRawBytes)

    const combined = record.partialLine + data
    const parts = combined.split(/\r\n|\n|\r/g)
    const endsWithLineBreak = /(?:\r\n|\n|\r)$/.test(combined)
    record.partialLine = endsWithLineBreak ? '' : (parts.pop() || '')
    if (endsWithLineBreak && parts.length > 0 && parts[parts.length - 1] === '') {
      parts.pop()
    }

    for (const part of parts) {
      pushLine(record, part, at)
    }

    return record
  }

  const getTerminal = (terminalId) => {
    const record = terminalMap.get(terminalId)
    if (!record) return null
    return {
      terminalId: record.terminalId,
      projectPath: record.projectPath,
      cwd: record.cwd,
      mode: record.mode,
      createdAt: record.createdAt,
      lastOutputAt: record.lastOutputAt,
      lines: record.lines.map((line) => ({ ...line })),
      rawBuffer: record.rawBuffer,
      partialLine: record.partialLine
    }
  }

  const listTerminals = () => {
    return Array.from(terminalMap.values()).map((record) => ({
      terminalId: record.terminalId,
      projectPath: record.projectPath,
      cwd: record.cwd,
      mode: record.mode,
      createdAt: record.createdAt,
      lastOutputAt: record.lastOutputAt,
      lineCount: record.lines.length,
      hasPartialLine: !!record.partialLine
    }))
  }

  const getTerminalOutput = (
    terminalId,
    {
      lines = maxLines,
      maxBytes = maxRawBytes,
      includeAnsi = false,
      includePartial = true
    } = {}
  ) => {
    const record = terminalMap.get(terminalId)
    if (!record) return null

    const normalizedLines = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : maxLines
    const selected = record.lines.slice(-normalizedLines)
    const textParts = selected.map((line) => (includeAnsi ? line.text : line.plainText))
    if (includePartial && record.partialLine) {
      textParts.push(includeAnsi ? record.partialLine : stripAnsi(record.partialLine))
    }

    return {
      terminalId: record.terminalId,
      projectPath: record.projectPath,
      cwd: record.cwd,
      mode: record.mode,
      createdAt: record.createdAt,
      lastOutputAt: record.lastOutputAt,
      lines: selected.map((line) => ({
        seq: line.seq,
        at: line.at,
        text: includeAnsi ? line.text : line.plainText
      })),
      partialLine: includePartial ? (includeAnsi ? record.partialLine : stripAnsi(record.partialLine)) : '',
      rawBuffer: includeAnsi ? trimToMaxBytes(record.rawBuffer, maxBytes) : trimToMaxBytes(stripAnsi(record.rawBuffer), maxBytes),
      text: trimToMaxBytes(textParts.join('\n'), maxBytes)
    }
  }

  const tailTerminalOutput = (
    terminalId,
    {
      cursor = 0,
      maxLines = 200,
      includeAnsi = false,
      includePartial = false
    } = {}
  ) => {
    const record = terminalMap.get(terminalId)
    if (!record) return null

    const normalizedCursor = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0
    const normalizedMaxLines = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : 200
    const newerLines = record.lines.filter((line) => line.seq > normalizedCursor)
    const selected = newerLines.slice(-normalizedMaxLines)
    const nextCursor = selected.length > 0
      ? selected[selected.length - 1].seq
      : normalizedCursor

    return {
      terminalId: record.terminalId,
      projectPath: record.projectPath,
      cwd: record.cwd,
      mode: record.mode,
      createdAt: record.createdAt,
      lastOutputAt: record.lastOutputAt,
      cursor: normalizedCursor,
      nextCursor,
      hasMore: newerLines.length > selected.length,
      lines: selected.map((line) => ({
        seq: line.seq,
        at: line.at,
        text: includeAnsi ? line.text : line.plainText
      })),
      partialLine: includePartial ? (includeAnsi ? record.partialLine : stripAnsi(record.partialLine)) : ''
    }
  }

  const removeTerminal = (terminalId) => terminalMap.delete(terminalId)

  const clear = () => terminalMap.clear()

  return {
    ensureTerminal,
    updateTerminal,
    appendOutput,
    getTerminal,
    listTerminals,
    getTerminalOutput,
    tailTerminalOutput,
    removeTerminal,
    clear
  }
}

const terminalBuffers = createTerminalBufferStore()

module.exports = {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_RAW_BYTES,
  normalizeTerminalMode,
  stripAnsi,
  createTerminalBufferStore,
  terminalBuffers
}
