import { registerDebugProvider } from '../../debug/runtimeDebug.js'

let liveTerminalPanelCount = 0
let terminalCacheEntryCount = 0
let cachedTerminalCount = 0

const focusTerminalScopes = new Map()

registerDebugProvider('terminals', () => {
  let focusSessionCount = 0
  for (const count of focusTerminalScopes.values()) {
    focusSessionCount += count
  }

  return {
    livePanels: liveTerminalPanelCount,
    cachedEntries: terminalCacheEntryCount,
    cachedTerminals: cachedTerminalCount,
    focusScopes: focusTerminalScopes.size,
    focusSessions: focusSessionCount
  }
})

export function retainLiveTerminalPanel() {
  liveTerminalPanelCount += 1
}

export function releaseLiveTerminalPanel() {
  liveTerminalPanelCount = Math.max(0, liveTerminalPanelCount - 1)
}

export function updateTerminalCacheDebug({ entryCount = 0, terminalCount = 0 } = {}) {
  terminalCacheEntryCount = Math.max(0, Number(entryCount) || 0)
  cachedTerminalCount = Math.max(0, Number(terminalCount) || 0)
}

export function updateFocusTerminalScopeDebug(scopeKey, sessionCount) {
  const key = String(scopeKey || '__default__').trim() || '__default__'
  const nextCount = Math.max(0, Number(sessionCount) || 0)
  if (nextCount <= 0) {
    focusTerminalScopes.delete(key)
    return
  }
  focusTerminalScopes.set(key, nextCount)
}

export function clearFocusTerminalScopeDebug(scopeKey) {
  const key = String(scopeKey || '__default__').trim() || '__default__'
  focusTerminalScopes.delete(key)
}
