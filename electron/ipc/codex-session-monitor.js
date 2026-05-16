const { EventEmitter } = require('events')
const path = require('path')
const { CODEX_SESSION_STATUS, PROJECT_STATUS_PRIORITY, isKnownCodexSessionStatus } = require('./codex-session-types')
const {
  detectCodexCommand,
  detectCodexOutputStatus,
  detectCodexProcess
} = require('./codex-session-patterns')
const { createCodexSessionStateSource } = require('./codex-session-state-source')

const MAX_COMMAND_BUFFER = 1024
const POLL_INTERVAL_MS = 1500
const ENDED_RETENTION_MS = 120000
const THREAD_MATCH_WINDOW_MS = 120000
const THREAD_BIND_GRACE_MS = 30000

function normalizeProjectPath(projectPath = '') {
  const rawValue = String(projectPath || '').trim()
  if (!rawValue) return ''
  let value = rawValue
  try {
    value = decodeURIComponent(rawValue)
  } catch {}
  if (!value) return ''
  try {
    return path.normalize(value)
  } catch {
    return value
  }
}

function createTerminalState({ terminalId, projectPath = '', mode = 'classic', createdAt = Date.now() }) {
  return {
    terminalId,
    projectPath: normalizeProjectPath(projectPath),
    mode,
    createdAt,
    updatedAt: createdAt,
    status: CODEX_SESSION_STATUS.UNKNOWN,
    isCodexSession: false,
    detectionSource: '',
    statusReason: 'terminal.created',
    lastForegroundProcess: '',
    inputBuffer: '',
    activeCommandBuffer: '',
    lastExit: null,
    lastCodexLaunchAt: 0,
    boundThreadId: '',
    boundRolloutPath: '',
    boundThreadUpdatedAt: 0,
    threadBoundAt: 0,
    lastSignalAt: 0
  }
}

function cloneTerminalSnapshot(record) {
  return {
    terminalId: record.terminalId,
    projectPath: record.projectPath,
    mode: record.mode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    isCodexSession: record.isCodexSession,
    detectionSource: record.detectionSource,
    statusReason: record.statusReason,
    lastForegroundProcess: record.lastForegroundProcess,
    boundThreadId: record.boundThreadId,
    lastSignalAt: record.lastSignalAt,
    lastExit: record.lastExit ? { ...record.lastExit } : null
  }
}

function computeProjectStatus(terminalSnapshots) {
  if (!terminalSnapshots.length) return CODEX_SESSION_STATUS.UNKNOWN
  let bestStatus = CODEX_SESSION_STATUS.UNKNOWN
  let bestPriority = PROJECT_STATUS_PRIORITY[bestStatus]
  for (const snapshot of terminalSnapshots) {
    const priority = PROJECT_STATUS_PRIORITY[snapshot.status] || 0
    if (priority > bestPriority) {
      bestPriority = priority
      bestStatus = snapshot.status
    }
  }
  return bestStatus
}

function createCodexSessionMonitor({
  getNotificationContext,
  notifyStatusTransition,
  safeLog,
  safeError
} = {}) {
  const emitter = new EventEmitter()
  const terminals = new Map()
  const projects = new Map()
  const removalTimers = new Map()
  const stateSource = createCodexSessionStateSource({ safeLog, safeError })
  let isPolling = false
  let pollTimer = null

  const clearRemovalTimer = (terminalId) => {
    const timer = removalTimers.get(terminalId)
    if (timer) {
      clearTimeout(timer)
      removalTimers.delete(terminalId)
    }
  }

  const scheduleTerminalRemoval = (terminalId, delayMs = ENDED_RETENTION_MS) => {
    if (!terminalId) return
    clearRemovalTimer(terminalId)
    const timer = setTimeout(() => {
      removalTimers.delete(terminalId)
      const terminal = terminals.get(terminalId)
      if (!terminal || terminal.status !== CODEX_SESSION_STATUS.ENDED) return
      updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.UNKNOWN, 'ended.retention_expired', {
        isCodexSession: true
      })
    }, delayMs)
    removalTimers.set(terminalId, timer)
  }

  const rebuildProjectSnapshot = (projectPath) => {
    const normalizedProjectPath = normalizeProjectPath(projectPath)
    if (!normalizedProjectPath) return null

    const terminalSnapshots = Array.from(terminals.values())
      .filter((record) => record.projectPath === normalizedProjectPath && record.isCodexSession)
      .map(cloneTerminalSnapshot)

    if (!terminalSnapshots.length) {
      const previous = projects.get(normalizedProjectPath) || null
      projects.delete(normalizedProjectPath)
      if (previous) {
        const payload = {
          projectPath: normalizedProjectPath,
          previousStatus: previous.status,
          status: CODEX_SESSION_STATUS.UNKNOWN,
          terminalIds: [],
          terminals: [],
          transitionedAt: Date.now(),
          reason: 'project.cleared'
        }
        emitter.emit('project-status-changed', payload)
      }
      return null
    }

    const nextSnapshot = {
      projectPath: normalizedProjectPath,
      status: computeProjectStatus(terminalSnapshots),
      terminalIds: terminalSnapshots.map((terminal) => terminal.terminalId),
      terminals: terminalSnapshots,
      updatedAt: Math.max(...terminalSnapshots.map((terminal) => terminal.updatedAt))
    }

    const previous = projects.get(normalizedProjectPath) || null
    projects.set(normalizedProjectPath, nextSnapshot)

    if (!previous || previous.status !== nextSnapshot.status || previous.terminalIds.join(',') !== nextSnapshot.terminalIds.join(',')) {
      const payload = {
        projectPath: normalizedProjectPath,
        previousStatus: previous?.status || CODEX_SESSION_STATUS.UNKNOWN,
        status: nextSnapshot.status,
        terminalIds: [...nextSnapshot.terminalIds],
        terminals: nextSnapshot.terminals.map((terminal) => ({ ...terminal })),
        transitionedAt: nextSnapshot.updatedAt,
        reason: 'project.aggregate'
      }
      emitter.emit('project-status-changed', payload)

      if (
        (payload.status === CODEX_SESSION_STATUS.AWAITING_CONFIRMATION || payload.status === CODEX_SESSION_STATUS.ENDED) &&
        payload.status !== payload.previousStatus
      ) {
        const context = typeof getNotificationContext === 'function'
          ? getNotificationContext(normalizedProjectPath)
          : { shouldNotify: false }
        if (context?.shouldNotify && typeof notifyStatusTransition === 'function') {
          notifyStatusTransition({
            project: {
              projectPath: normalizedProjectPath,
              status: payload.status,
              previousStatus: payload.previousStatus,
              terminalIds: [...payload.terminalIds],
              terminals: payload.terminals.map((terminal) => ({ ...terminal }))
            },
            context
          })
        }
      }
    }

    return nextSnapshot
  }

  const updateTerminalStatus = (terminalId, nextStatus, reason, patch = {}) => {
    const terminal = terminals.get(terminalId)
    if (!terminal) return null
    if (!isKnownCodexSessionStatus(nextStatus)) return cloneTerminalSnapshot(terminal)

    const previousStatus = terminal.status
    const previousProjectPath = terminal.projectPath

    if (typeof patch.projectPath === 'string') {
      terminal.projectPath = normalizeProjectPath(patch.projectPath)
    }
    if (typeof patch.mode === 'string' && patch.mode.trim()) {
      terminal.mode = patch.mode
    }
    if (typeof patch.detectionSource === 'string' && patch.detectionSource.trim()) {
      terminal.detectionSource = patch.detectionSource.trim()
    }
    if (patch.isCodexSession === true) {
      terminal.isCodexSession = true
    }
    if (typeof patch.lastForegroundProcess === 'string') {
      terminal.lastForegroundProcess = patch.lastForegroundProcess
    }
    if (patch.lastExit) {
      terminal.lastExit = { ...patch.lastExit }
    }
    if (typeof patch.lastCodexLaunchAt === 'number' && Number.isFinite(patch.lastCodexLaunchAt)) {
      terminal.lastCodexLaunchAt = patch.lastCodexLaunchAt
    }
    if (typeof patch.boundThreadId === 'string') {
      terminal.boundThreadId = patch.boundThreadId
    }
    if (typeof patch.boundRolloutPath === 'string') {
      terminal.boundRolloutPath = patch.boundRolloutPath
    }
    if (typeof patch.boundThreadUpdatedAt === 'number' && Number.isFinite(patch.boundThreadUpdatedAt)) {
      terminal.boundThreadUpdatedAt = patch.boundThreadUpdatedAt
    }
    if (typeof patch.threadBoundAt === 'number' && Number.isFinite(patch.threadBoundAt)) {
      terminal.threadBoundAt = patch.threadBoundAt
    }
    if (typeof patch.lastSignalAt === 'number' && Number.isFinite(patch.lastSignalAt)) {
      terminal.lastSignalAt = patch.lastSignalAt
    }

    if (nextStatus !== CODEX_SESSION_STATUS.ENDED) {
      clearRemovalTimer(terminalId)
    }
    terminal.updatedAt = Date.now()
    terminal.statusReason = reason || terminal.statusReason
    terminal.status = nextStatus

    const snapshot = cloneTerminalSnapshot(terminal)
    if (snapshot.isCodexSession && (previousStatus !== nextStatus || previousProjectPath !== snapshot.projectPath)) {
      emitter.emit('terminal-status-changed', {
        terminal: snapshot,
        previousStatus,
        status: snapshot.status,
        transitionedAt: snapshot.updatedAt,
        reason: snapshot.statusReason
      })
    }

    if (previousProjectPath && previousProjectPath !== snapshot.projectPath) {
      rebuildProjectSnapshot(previousProjectPath)
    }
    if (snapshot.projectPath) {
      rebuildProjectSnapshot(snapshot.projectPath)
    }
    if (nextStatus === CODEX_SESSION_STATUS.ENDED) {
      scheduleTerminalRemoval(terminalId)
    }

    return snapshot
  }

  const markCodexSession = (terminalId, detectionSource, reason = 'codex.detected') => {
    const terminal = terminals.get(terminalId)
    if (!terminal) return null
    const nextStatus = terminal.status === CODEX_SESSION_STATUS.UNKNOWN
      ? CODEX_SESSION_STATUS.RUNNING
      : terminal.status
    return updateTerminalStatus(terminalId, nextStatus, reason, {
      isCodexSession: true,
      detectionSource: terminal.detectionSource || detectionSource
    })
  }

  const startCodexTracking = (terminalId, detectionSource, reason) => {
    const launchedAt = Date.now()
    return updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.RUNNING, reason, {
      isCodexSession: true,
      detectionSource,
      lastCodexLaunchAt: launchedAt,
      boundThreadId: '',
      boundRolloutPath: '',
      boundThreadUpdatedAt: 0,
      threadBoundAt: 0,
      lastSignalAt: 0
    })
  }

  const bindThreadToTerminal = (terminal, candidate) => {
    if (!terminal || !candidate?.id) return
    terminal.boundThreadId = candidate.id
    terminal.boundRolloutPath = candidate.rolloutPath || ''
    terminal.boundThreadUpdatedAt = candidate.updatedAt || 0
    terminal.threadBoundAt = Date.now()
  }

  const resolveThreadBindings = (trackedTerminals, activeThreads) => {
    const activeByProject = new Map()
    for (const thread of activeThreads) {
      const normalizedPath = normalizeProjectPath(thread.cwd)
      if (!normalizedPath) continue
      if (!activeByProject.has(normalizedPath)) activeByProject.set(normalizedPath, [])
      activeByProject.get(normalizedPath).push({
        ...thread,
        cwd: normalizedPath
      })
    }

    const assignedThreadIds = new Set(
      trackedTerminals
        .map((terminal) => terminal.boundThreadId)
        .filter(Boolean)
    )

    const pendingTerminals = trackedTerminals
      .filter((terminal) => !terminal.boundThreadId && terminal.lastCodexLaunchAt > 0)
      .sort((left, right) => right.lastCodexLaunchAt - left.lastCodexLaunchAt)

    for (const terminal of pendingTerminals) {
      const candidates = activeByProject.get(terminal.projectPath) || []
      if (!candidates.length) continue

      const launchAt = terminal.lastCodexLaunchAt
      const lowerBound = launchAt - THREAD_MATCH_WINDOW_MS
      const primaryCandidates = candidates.filter((candidate) => {
        if (assignedThreadIds.has(candidate.id)) return false
        return candidate.createdAt >= lowerBound || candidate.updatedAt >= lowerBound
      })
      const fallbackCandidates = candidates.filter((candidate) => !assignedThreadIds.has(candidate.id))
      const match = (primaryCandidates[0] || fallbackCandidates[0] || null)
      if (!match) continue

      bindThreadToTerminal(terminal, match)
      assignedThreadIds.add(match.id)
    }
  }

  const pollTrackedThreads = async () => {
    if (isPolling) return
    isPolling = true

    try {
      const trackedTerminals = Array.from(terminals.values())
        .filter((terminal) => terminal.isCodexSession && terminal.projectPath)

      if (!trackedTerminals.length) return

      const activeThreads = await stateSource.listActiveThreads(trackedTerminals.map((terminal) => terminal.projectPath))
      resolveThreadBindings(trackedTerminals, activeThreads)

      for (const terminal of trackedTerminals) {
        const terminalId = terminal.terminalId
        if (!terminal.boundThreadId) {
          if (
            terminal.status === CODEX_SESSION_STATUS.RUNNING &&
            terminal.lastCodexLaunchAt > 0 &&
            Date.now() - terminal.lastCodexLaunchAt > THREAD_BIND_GRACE_MS
          ) {
            updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.UNKNOWN, 'thread.bind_timeout', {
              isCodexSession: terminal.isCodexSession
            })
          }
          continue
        }

        const signal = await stateSource.resolveThreadStatus({
          threadId: terminal.boundThreadId,
          rolloutPath: terminal.boundRolloutPath
        })
        if (!signal?.status) continue
        if (
          signal.at &&
          terminal.lastSignalAt &&
          signal.at <= terminal.lastSignalAt
        ) {
          continue
        }

        if (signal.status === CODEX_SESSION_STATUS.AWAITING_CONFIRMATION) {
          updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.AWAITING_CONFIRMATION, signal.reason, {
            isCodexSession: true,
            lastSignalAt: signal.at || terminal.lastSignalAt || 0
          })
          continue
        }

        if (signal.status === CODEX_SESSION_STATUS.ENDED) {
          updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.ENDED, signal.reason, {
            isCodexSession: true,
            lastSignalAt: signal.at || terminal.lastSignalAt || 0
          })
          continue
        }

        updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.RUNNING, signal.reason, {
          isCodexSession: true,
          lastSignalAt: signal.at || terminal.lastSignalAt || 0
        })
      }
    } catch (error) {
      if (typeof safeError === 'function') {
        safeError('❌ Codex session monitor poll failed:', error.message)
      }
    } finally {
      isPolling = false
    }
  }

  pollTimer = setInterval(() => {
    void pollTrackedThreads()
  }, POLL_INTERVAL_MS)

  return {
    registerTerminal({ terminalId, projectPath = '', mode = 'classic', createdAt = Date.now() } = {}) {
      if (!terminalId) return null
      const record = createTerminalState({ terminalId, projectPath, mode, createdAt })
      terminals.set(terminalId, record)
      return cloneTerminalSnapshot(record)
    },

    updateTerminalProjectPath(terminalId, projectPath = '') {
      const terminal = terminals.get(terminalId)
      if (!terminal) return null
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      if (!normalizedProjectPath || normalizedProjectPath === terminal.projectPath) {
        return cloneTerminalSnapshot(terminal)
      }
      return updateTerminalStatus(terminalId, terminal.status, 'terminal.project_path_updated', {
        projectPath: normalizedProjectPath
      })
    },

    handleTerminalInput(terminalId, data) {
      const terminal = terminals.get(terminalId)
      if (!terminal || data == null) return cloneTerminalSnapshot(terminal)

      const text = String(data)
      terminal.updatedAt = Date.now()
      terminal.inputBuffer = (terminal.inputBuffer + text).slice(-MAX_COMMAND_BUFFER)

      let current = terminal.activeCommandBuffer
      for (const char of text) {
        if (char === '\u007f' || char === '\b') {
          current = current.slice(0, -1)
          continue
        }
        if (char === '\r' || char === '\n') {
          const command = current.trim()
          current = ''
          if (detectCodexCommand(command)) {
            terminal.activeCommandBuffer = current
            const snapshot = startCodexTracking(terminalId, terminal.detectionSource || 'input.command', 'input.codex_command')
            if (snapshot) return snapshot
          }
          if (terminal.status === CODEX_SESSION_STATUS.AWAITING_CONFIRMATION && terminal.isCodexSession) {
            updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.RUNNING, 'input.confirmation_submitted', {
              isCodexSession: true,
              lastSignalAt: Date.now()
            })
          }
          continue
        }
        if (char >= ' ' || char === '\t') {
          current = (current + char).slice(-MAX_COMMAND_BUFFER)
        }
      }

      terminal.activeCommandBuffer = current
      return cloneTerminalSnapshot(terminal)
    },

    handleTerminalOutput(terminalId, data) {
      const terminal = terminals.get(terminalId)
      if (!terminal || data == null) return cloneTerminalSnapshot(terminal)

      const text = String(data)
      terminal.updatedAt = Date.now()

      if (!terminal.isCodexSession && detectCodexCommand(text)) {
        startCodexTracking(terminalId, 'output.command_echo', 'output.codex_command_echo')
      }

      const outputMatch = detectCodexOutputStatus(text)
      if (outputMatch?.status === CODEX_SESSION_STATUS.AWAITING_CONFIRMATION) {
        return updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.AWAITING_CONFIRMATION, outputMatch.reason, {
          isCodexSession: true,
          detectionSource: terminal.detectionSource || 'output.pattern',
          lastSignalAt: Date.now()
        })
      }

      return cloneTerminalSnapshot(terminal)
    },

    handleForegroundProcess(terminalId, processName) {
      const terminal = terminals.get(terminalId)
      if (!terminal) return null
      const normalizedProcessName = String(processName || '').trim()
      terminal.lastForegroundProcess = normalizedProcessName
      terminal.updatedAt = Date.now()

      if (!terminal.isCodexSession && detectCodexProcess(normalizedProcessName)) {
        return startCodexTracking(terminalId, 'process.foreground', 'process.codex_foreground')
      }

      return cloneTerminalSnapshot(terminal)
    },

    handleTerminalExit(terminalId, details = {}) {
      const terminal = terminals.get(terminalId)
      if (!terminal) return null

      if (terminal.isCodexSession) {
        return updateTerminalStatus(terminalId, CODEX_SESSION_STATUS.ENDED, 'terminal.exited', {
          isCodexSession: true,
          lastExit: {
            exitCode: details.exitCode ?? null,
            signal: details.signal ?? null,
            at: Date.now()
          }
        })
      }

      terminal.lastExit = {
        exitCode: details.exitCode ?? null,
        signal: details.signal ?? null,
        at: Date.now()
      }
      terminal.updatedAt = Date.now()
      return cloneTerminalSnapshot(terminal)
    },

    removeTerminal(terminalId) {
      const terminal = terminals.get(terminalId)
      if (!terminal) return false
      clearRemovalTimer(terminalId)
      const projectPath = terminal.projectPath
      terminals.delete(terminalId)
      if (projectPath) rebuildProjectSnapshot(projectPath)
      return true
    },

    clear() {
      for (const terminalId of removalTimers.keys()) {
        clearRemovalTimer(terminalId)
      }
      terminals.clear()
      projects.clear()
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    },

    getTerminalSnapshot(terminalId) {
      const terminal = terminals.get(terminalId)
      return terminal ? cloneTerminalSnapshot(terminal) : null
    },

    getProjectSnapshot(projectPath) {
      const normalizedProjectPath = normalizeProjectPath(projectPath)
      const project = projects.get(normalizedProjectPath)
      if (!project) return null
      return {
        projectPath: project.projectPath,
        status: project.status,
        terminalIds: [...project.terminalIds],
        terminals: project.terminals.map((terminal) => ({ ...terminal })),
        updatedAt: project.updatedAt
      }
    },

    getSnapshot() {
      return {
        terminals: Array.from(terminals.values())
          .filter((terminal) => terminal.isCodexSession)
          .map(cloneTerminalSnapshot),
        projects: Array.from(projects.values()).map((project) => ({
          projectPath: project.projectPath,
          status: project.status,
          terminalIds: [...project.terminalIds],
          terminals: project.terminals.map((terminal) => ({ ...terminal })),
          updatedAt: project.updatedAt
        }))
      }
    },

    on(eventName, listener) {
      emitter.on(eventName, listener)
      return () => emitter.off(eventName, listener)
    }
  }
}

module.exports = {
  createCodexSessionMonitor,
  normalizeProjectPath
}
