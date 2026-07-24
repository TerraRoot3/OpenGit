const PROJECT_ROUTE_PREFIXES = Object.freeze({
  'clone-directory': 'git:clone:',
  'single-project': 'git:project:'
})

export const normalizeProjectWorkspacePath = (value = '') => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

export const normalizeProjectWorkspaceRouteType = (value = '') => {
  return String(value || '').trim() === 'clone-directory'
    ? 'clone-directory'
    : 'single-project'
}

export const buildProjectWorkspaceRoute = (projectPath, routeType = 'single-project') => {
  const path = normalizeProjectWorkspacePath(projectPath)
  if (!path) return ''
  const normalizedRouteType = normalizeProjectWorkspaceRouteType(routeType)
  return `${PROJECT_ROUTE_PREFIXES[normalizedRouteType]}${path}`
}

export const parseProjectWorkspaceRoute = (value = '') => {
  const route = String(value || '').trim()
  for (const [routeType, prefix] of Object.entries(PROJECT_ROUTE_PREFIXES)) {
    if (!route.startsWith(prefix)) continue
    const path = normalizeProjectWorkspacePath(route.slice(prefix.length))
    return path ? { path, routeType } : null
  }
  return null
}

export const createProjectTerminalFocusRequest = (projectPath, extra = {}) => {
  const path = normalizeProjectWorkspacePath(projectPath)
  if (!path) return null
  return {
    path,
    nonce: Date.now() + Math.random(),
    ...extra
  }
}

export const createProjectWorkspaceTab = (routeUrl) => {
  const parsed = parseProjectWorkspaceRoute(routeUrl)
  if (!parsed) return null
  const route = buildProjectWorkspaceRoute(parsed.path, parsed.routeType)
  const title = parsed.path.split(/[\\/]/).filter(Boolean).pop() || parsed.path
  return {
    id: route,
    route,
    routeType: parsed.routeType,
    path: parsed.path,
    title,
    kind: 'project'
  }
}

export const createRemoteWorkspaceTab = () => ({
  id: 'git:remote',
  route: 'git:remote',
  routeType: 'remote-repo',
  title: '远端仓库',
  kind: 'remote'
})

export const createBackupWorkspaceTab = () => ({
  id: 'about:backup',
  route: 'about:backup',
  routeType: 'backup-manager',
  title: '备份管理',
  kind: 'backup'
})

export const createThemeWorkspaceTab = () => ({
  id: 'about:themes',
  route: 'about:themes',
  routeType: 'theme-manager',
  title: '皮肤',
  kind: 'theme'
})

export const createStandaloneTerminalTab = ({
  id,
  title = '',
  mode = 'focus'
} = {}) => {
  const normalizedMode = mode === 'split' ? 'split' : 'focus'
  const normalizedId = String(id || '').trim()
  return {
    id: normalizedId,
    route: normalizedId,
    routeType: normalizedMode === 'split'
      ? 'standalone-terminal-split'
      : 'standalone-terminal-focus',
    title: String(title || '').trim()
      || (normalizedMode === 'split' ? '分屏终端' : '灵动终端'),
    kind: 'terminal'
  }
}

const isStandaloneTerminalRoute = (routeType = '', route = '') => {
  const normalizedRouteType = String(routeType || '').trim()
  const normalizedRoute = String(route || '').trim()
  return normalizedRouteType === 'standalone-terminal'
    || normalizedRouteType === 'standalone-terminal-focus'
    || normalizedRouteType === 'standalone-terminal-split'
    || normalizedRoute === 'about:terminal'
    || normalizedRoute === 'about:terminal-focus'
    || normalizedRoute === 'about:terminal-split'
}

export const resolveNextWorkspaceTabId = ({
  tabs = [],
  closingId = '',
  activeId = ''
} = {}) => {
  const normalizedTabs = Array.isArray(tabs) ? tabs : []
  if (closingId !== activeId) {
    return normalizedTabs.some((tab) => tab?.id === activeId) ? activeId : ''
  }

  const closingIndex = normalizedTabs.findIndex((tab) => tab?.id === closingId)
  if (closingIndex < 0) return activeId
  return normalizedTabs[closingIndex + 1]?.id
    || normalizedTabs[closingIndex - 1]?.id
    || ''
}

export const serializeWorkspaceTabs = (tabs = [], activeTabId = '') => {
  const persistentTabs = (Array.isArray(tabs) ? tabs : [])
    .filter((tab) => (
      tab?.kind === 'project'
      || tab?.kind === 'remote'
      || tab?.kind === 'terminal'
      || tab?.kind === 'backup'
      || tab?.kind === 'theme'
    ))
    .map((tab) => ({
      id: tab.id,
      route: tab.route || tab.id,
      routeType: tab.routeType,
      path: tab.path || '',
      title: tab.title || ''
    }))

  const persistentActiveTab = persistentTabs.find((tab) => (
    tab.id === activeTabId || tab.route === activeTabId
  ))
  return {
    version: 1,
    activeTabId: persistentActiveTab?.id || persistentTabs.at(-1)?.id || '',
    tabs: persistentTabs
  }
}

export const restoreWorkspaceTabs = (payload = {}) => {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.tabs)) {
    return { tabs: [], activeTabId: '' }
  }

  const tabs = []
  const seen = new Set()
  for (const [index, item] of payload.tabs.entries()) {
    let tab = null
    if (item?.routeType === 'remote-repo') {
      tab = createRemoteWorkspaceTab()
    } else if (isStandaloneTerminalRoute(item?.routeType, item?.route)) {
      const mode = item?.routeType === 'standalone-terminal-split'
        || item?.route === 'about:terminal-split'
        ? 'split'
        : 'focus'
      tab = createStandaloneTerminalTab({
        id: item?.id || item?.route || `standalone-terminal:restored:${index}`,
        title: item?.title,
        mode
      })
    } else if (item?.routeType === 'backup-manager') {
      tab = createBackupWorkspaceTab()
    } else if (item?.routeType === 'theme-manager') {
      tab = createThemeWorkspaceTab()
    } else {
      const projectRoute = item?.route || buildProjectWorkspaceRoute(item?.path, item?.routeType)
      tab = createProjectWorkspaceTab(projectRoute)
    }
    if (!tab?.id || seen.has(tab.id)) continue
    seen.add(tab.id)
    tabs.push(tab)
  }

  const requestedActiveId = String(payload.activeTabId || '')
  return {
    tabs,
    activeTabId: tabs.some((tab) => tab.id === requestedActiveId)
      ? requestedActiveId
      : tabs.at(-1)?.id || ''
  }
}

export const migrateLegacyBrowserTabs = ({
  savedTabs = [],
  savedActiveTabIndex = -1,
  savedOrder = {}
} = {}) => {
  const legacyTabs = Array.isArray(savedTabs) ? savedTabs : []
  const orderByRoute = savedOrder && typeof savedOrder === 'object' && !Array.isArray(savedOrder)
    ? savedOrder
    : {}
  const orderedItems = legacyTabs
    .map((item, originalIndex) => {
      const route = String(item?.url || item?.route || '').trim()
      const storedOrder = Number(orderByRoute[route])
      return {
        item,
        originalIndex,
        storedOrder: Number.isFinite(storedOrder) ? storedOrder : originalIndex
      }
    })
    .sort((left, right) => (
      left.storedOrder - right.storedOrder
      || left.originalIndex - right.originalIndex
    ))

  const tabs = []
  const seen = new Map()
  const restoredIdByLegacyIndex = new Map()

  for (const { item, originalIndex } of orderedItems) {
    const route = String(item?.url || item?.route || '').trim()
    const routeType = String(item?.type || item?.routeType || '').trim()
    let tab = null

    if (routeType === 'remote-repo' || route === 'git:remote') {
      tab = createRemoteWorkspaceTab()
    } else if (routeType === 'backup-manager' || route === 'about:backup') {
      tab = createBackupWorkspaceTab()
    } else if (routeType === 'theme-manager' || route === 'about:themes') {
      tab = createThemeWorkspaceTab()
    } else if (isStandaloneTerminalRoute(routeType, route)) {
      const mode = routeType === 'standalone-terminal-split' || route === 'about:terminal-split'
        ? 'split'
        : 'focus'
      tab = createStandaloneTerminalTab({
        id: `standalone-terminal:legacy:${originalIndex}`,
        title: item?.title,
        mode
      })
    } else {
      const legacyPath = item?.clonePath
        || item?.path
        || item?.routeProps?.path
        || ''
      const projectRoute = routeType === 'clone-directory' && legacyPath
        ? buildProjectWorkspaceRoute(legacyPath, 'clone-directory')
        : routeType === 'single-project' && legacyPath
          ? buildProjectWorkspaceRoute(legacyPath, 'single-project')
          : route
      tab = createProjectWorkspaceTab(projectRoute)
    }

    if (!tab?.id) continue
    const existingId = seen.get(tab.id)
    if (existingId) {
      restoredIdByLegacyIndex.set(originalIndex, existingId)
      continue
    }
    seen.set(tab.id, tab.id)
    restoredIdByLegacyIndex.set(originalIndex, tab.id)
    tabs.push(tab)
  }

  const normalizedActiveIndex = Number(savedActiveTabIndex)
  const requestedActiveId = Number.isInteger(normalizedActiveIndex) && normalizedActiveIndex >= 0
    ? restoredIdByLegacyIndex.get(normalizedActiveIndex)
    : ''
  return {
    tabs,
    activeTabId: requestedActiveId && tabs.some((tab) => tab.id === requestedActiveId)
      ? requestedActiveId
      : tabs.at(-1)?.id || ''
  }
}
