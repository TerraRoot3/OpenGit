function createInitialState(now = 0) {
  return {
    phase: 'warm',
    lastActivatedAt: now,
    lastBackgroundedAt: now,
    frozenAt: null,
    discardedAt: null
  }
}

function createWebTabLifecycleController({ freezeDelayMs = 60_000, discardDelayMs = 300_000 } = {}) {
  const states = new Map()

  const getState = (tabId) => {
    if (!tabId) return null
    const state = states.get(tabId)
    return state ? { ...state } : null
  }

  const ensureState = (tabId, now = Date.now()) => {
    if (!tabId) return null
    if (!states.has(tabId)) {
      states.set(tabId, createInitialState(now))
    }
    return states.get(tabId)
  }

  const registerTab = (tabId, now = Date.now()) => {
    const state = ensureState(tabId, now)
    return state ? { ...state } : null
  }

  const unregisterTab = (tabId) => {
    if (!tabId) return false
    return states.delete(tabId)
  }

  const activateTab = (tabId, now = Date.now()) => {
    const state = ensureState(tabId, now)
    if (!state) return null
    state.phase = 'active'
    state.lastActivatedAt = now
    state.frozenAt = null
    state.discardedAt = null
    return { ...state }
  }

  const deactivateTab = (tabId, now = Date.now()) => {
    const state = ensureState(tabId, now)
    if (!state) return null
    state.phase = 'warm'
    state.lastBackgroundedAt = now
    state.frozenAt = null
    return { ...state }
  }

  const advance = (now = Date.now()) => {
    const transitions = []
    for (const [tabId, state] of states.entries()) {
      if (state.phase === 'warm' && now - state.lastBackgroundedAt >= freezeDelayMs) {
        state.phase = 'frozen'
        state.frozenAt = now
        transitions.push(`${tabId}:frozen`)
        continue
      }

      if (state.phase === 'frozen' && now - state.lastBackgroundedAt >= discardDelayMs) {
        state.phase = 'discarded'
        state.discardedAt = now
        transitions.push(`${tabId}:discarded`)
      }
    }
    return transitions
  }

  return {
    registerTab,
    unregisterTab,
    activateTab,
    deactivateTab,
    advance,
    getState,
    getTrackedCount: () => states.size
  }
}

module.exports = {
  createWebTabLifecycleController
}
