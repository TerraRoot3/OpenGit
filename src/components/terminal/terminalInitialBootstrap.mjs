export const shouldCreateInitialTerminal = ({
  terminalCount = 0,
  restoredSnapshot = false,
  projectRoot = '',
  allowFirstTerminalWithoutCwd = false
} = {}) => {
  if (terminalCount > 0 || restoredSnapshot) {
    return false
  }

  return Boolean(projectRoot || allowFirstTerminalWithoutCwd)
}
