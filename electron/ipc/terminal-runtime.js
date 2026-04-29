const ptyProcesses = new Map()

function registerTerminalSession(terminalId, session) {
  if (!terminalId || !session) return null
  ptyProcesses.set(terminalId, session)
  return session
}

function getTerminalSession(terminalId) {
  return ptyProcesses.get(terminalId) || null
}

function removeTerminalSession(terminalId) {
  return ptyProcesses.delete(terminalId)
}

function clearTerminalSessions() {
  ptyProcesses.clear()
}

function listTerminalSessions() {
  return Array.from(ptyProcesses.entries()).map(([terminalId, session]) => ({
    terminalId,
    projectPath: session?.projectPath || '',
    mode: session?.mode || 'classic'
  }))
}

async function writeTerminalSession(terminalId, data) {
  const session = ptyProcesses.get(terminalId)
  if (!session?.ptyProcess) {
    throw new Error('终端不存在')
  }
  const text = String(data || '')
  if (!text) {
    return { success: true, terminalId, bytesWritten: 0 }
  }
  session.hasUserInput = true
  session.ptyProcess.write(text)
  return {
    success: true,
    terminalId,
    bytesWritten: Buffer.byteLength(text, 'utf8')
  }
}

module.exports = {
  registerTerminalSession,
  getTerminalSession,
  removeTerminalSession,
  clearTerminalSessions,
  listTerminalSessions,
  writeTerminalSession
}
