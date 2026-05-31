const PROJECT_ROUTE_TYPES = new Set(['clone-directory', 'single-project'])

export const normalizeProjectTabPath = (value = '') => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

export const isProjectRouteType = (value = '') => {
  return PROJECT_ROUTE_TYPES.has(String(value || '').trim())
}

export const normalizeProjectRouteType = (value = '') => {
  return String(value || '').trim() === 'clone-directory'
    ? 'clone-directory'
    : 'single-project'
}

export const buildProjectTerminalRouteUrl = (projectPath, routeType = 'single-project') => {
  const normalizedPath = normalizeProjectTabPath(projectPath)
  if (!normalizedPath) return ''
  return normalizeProjectRouteType(routeType) === 'clone-directory'
    ? `git:clone:${normalizedPath}`
    : `git:project:${normalizedPath}`
}

export const createProjectTerminalFocusRequest = (projectPath, extra = {}) => {
  const normalizedPath = normalizeProjectTabPath(projectPath)
  if (!normalizedPath) return null
  return {
    path: normalizedPath,
    nonce: Date.now() + Math.random(),
    ...extra
  }
}

export const resolveProjectTerminalTargetTab = (
  tabs = [],
  { projectPath = '', routeType = 'single-project', activeTabId = null } = {}
) => {
  const normalizedPath = normalizeProjectTabPath(projectPath)
  if (!normalizedPath) return null

  const matchingTabs = tabs.filter((tab) => {
    if (!isProjectRouteType(tab?.routeType || '')) return false
    return normalizeProjectTabPath(tab?.routeProps?.path || '') === normalizedPath
  })

  if (!matchingTabs.length) return null

  const normalizedActiveTabId = activeTabId == null ? '' : String(activeTabId)
  const activeMatch = matchingTabs.find((tab) => String(tab?.id ?? '') === normalizedActiveTabId)
  if (activeMatch) return activeMatch

  const preferredRouteType = normalizeProjectRouteType(routeType)
  return matchingTabs.find((tab) => tab?.routeType === preferredRouteType) || matchingTabs[0]
}
