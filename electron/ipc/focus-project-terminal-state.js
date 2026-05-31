const RETRY_DELAYS_MS = [160, 420, 900]

function createRequestId(now = Date.now) {
  return `${now()}:${Math.random()}`
}

function normalizeRouteType(value = '') {
  return String(value || '').trim() === 'clone-directory'
    ? 'clone-directory'
    : 'single-project'
}

function createFocusProjectTerminalState({ now = Date.now } = {}) {
  let pending = null

  return {
    begin({ projectPath = '', routeType = 'single-project' } = {}) {
      const normalizedProjectPath = String(projectPath || '').trim()
      if (!normalizedProjectPath) return null

      pending = {
        requestId: createRequestId(now),
        projectPath: normalizedProjectPath,
        routeType: normalizeRouteType(routeType),
        createdAt: now(),
        dispatchCount: 0
      }

      return { ...pending }
    },
    markDispatched() {
      if (!pending) return null
      pending.dispatchCount += 1
      return { ...pending }
    },
    getPending() {
      return pending ? { ...pending } : null
    },
    getNextRetryDelay() {
      if (!pending) return null
      return RETRY_DELAYS_MS[pending.dispatchCount - 1] ?? null
    },
    acknowledge(requestId = '') {
      if (!pending) return false
      if (String(requestId || '').trim() !== pending.requestId) return false
      pending = null
      return true
    },
    clear() {
      pending = null
    },
    hasPending() {
      return Boolean(pending)
    }
  }
}

module.exports = {
  createFocusProjectTerminalState
}
