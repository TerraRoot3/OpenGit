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
