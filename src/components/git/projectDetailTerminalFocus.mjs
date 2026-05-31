export const shouldAutoFocusProjectTerminal = ({
  newIsActive = false,
  oldIsActive = false,
  currentView = ''
} = {}) => {
  return Boolean(newIsActive) && !Boolean(oldIsActive) && currentView === 'terminal'
}

export const resolveProjectTerminalFocusMode = (terminalMode = 'split') => {
  return terminalMode === 'liquid' ? 'liquid' : 'split'
}

export const normalizeProjectTerminalFocusPath = (value = '') => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

export const resolveProjectTerminalFocusRequest = ({
  request = null,
  currentPath = '',
  lastHandledNonce = 0,
  isActive = false
} = {}) => {
  const nonce = Number(request?.nonce) || 0
  if (!nonce || nonce === (Number(lastHandledNonce) || 0)) return null

  const requestPath = normalizeProjectTerminalFocusPath(request?.path || '')
  const normalizedCurrentPath = normalizeProjectTerminalFocusPath(currentPath)
  if (!requestPath || !normalizedCurrentPath || requestPath !== normalizedCurrentPath) {
    return null
  }

  return {
    nonce,
    shouldFocusNow: Boolean(isActive)
  }
}
