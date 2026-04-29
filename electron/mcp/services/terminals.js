function createTerminalsService({ terminalBuffers, writeTerminal }) {
  const getRecentTerminalErrors = async ({ projectPath = '', limit = 20 } = {}) => {
    const normalizedProjectPath = String(projectPath || '').trim()
    const allTerminals = terminalBuffers.listTerminals()
    const targetTerminals = normalizedProjectPath
      ? allTerminals.filter((item) => String(item.projectPath || '').trim() === normalizedProjectPath)
      : allTerminals
    const regex = /(error|warn|failed|exception|traceback|panic|npm ERR!)/i
    const matches = []

    for (const terminal of targetTerminals) {
      const output = terminalBuffers.getTerminalOutput(terminal.terminalId, { lines: 400, maxBytes: 64 * 1024, includeAnsi: false })
      if (!output) continue
      const lines = output.lines || []
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (!regex.test(line.text || '')) continue
        const contextStart = Math.max(0, index - 2)
        const contextEnd = Math.min(lines.length, index + 3)
        matches.push({
          terminalId: terminal.terminalId,
          projectPath: terminal.projectPath,
          cwd: terminal.cwd,
          matchedLine: line.text,
          at: line.at,
          context: lines.slice(contextStart, contextEnd).map((item) => item.text)
        })
      }
    }

    return matches
      .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
      .slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)))
  }

  return {
    listTerminals: async () => terminalBuffers.listTerminals(),
    getTerminalOutput: async ({ terminalId = '', lines = 200, maxBytes = 64 * 1024, includeAnsi = false } = {}) => {
      return terminalBuffers.getTerminalOutput(String(terminalId || '').trim(), { lines, maxBytes, includeAnsi })
    },
    getProjectTerminalOutputs: async ({ projectPath = '', linesPerTerminal = 120, includeAnsi = false } = {}) => {
      const normalizedProjectPath = String(projectPath || '').trim()
      return terminalBuffers
        .listTerminals()
        .filter((item) => item.projectPath === normalizedProjectPath)
        .map((item) => terminalBuffers.getTerminalOutput(item.terminalId, {
          lines: linesPerTerminal,
          maxBytes: 64 * 1024,
          includeAnsi
        }))
        .filter(Boolean)
    },
    getRecentTerminalErrors,
    tailTerminalOutput: async ({ terminalId = '', cursor = 0, maxLines = 200, includeAnsi = false } = {}) => {
      return terminalBuffers.tailTerminalOutput(String(terminalId || '').trim(), { cursor, maxLines, includeAnsi })
    },
    writeTerminal: async ({ terminalId = '', text = '', appendNewline = false } = {}) => {
      const normalizedTerminalId = String(terminalId || '').trim()
      if (!normalizedTerminalId) {
        throw new Error('terminalId required')
      }
      if (typeof writeTerminal !== 'function') {
        throw new Error('terminal write is not available')
      }
      const payload = `${String(text || '')}${appendNewline ? '\n' : ''}`
      return writeTerminal(normalizedTerminalId, payload)
    }
  }
}

module.exports = {
  createTerminalsService
}
