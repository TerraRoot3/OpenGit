import { branchStatusCache, projectDetails, projectsByPath } from '../stores/projectStore.js'

const debugProviders = new Map()

const browserDebugState = {
  totalTabs: 0,
  activeTabId: null,
  routeCounts: {},
  projectTabCount: 0
}

const projectDetailEntries = new Map()

export function registerDebugProvider(name, getter) {
  if (!name || typeof getter !== 'function') {
    return () => {}
  }
  debugProviders.set(name, getter)
  return () => {
    if (debugProviders.get(name) === getter) {
      debugProviders.delete(name)
    }
  }
}

export function collectRegisteredDebugStats() {
  const result = {}
  for (const [name, getter] of debugProviders.entries()) {
    try {
      result[name] = getter()
    } catch (error) {
      result[name] = { error: error?.message || 'debug provider failed' }
    }
  }
  return result
}

export function updateBrowserDebugState(nextState = {}) {
  Object.assign(browserDebugState, nextState)
}

export function getBrowserDebugStats() {
  return {
    totalTabs: browserDebugState.totalTabs || 0,
    activeTabId: browserDebugState.activeTabId || null,
    routeCounts: { ...(browserDebugState.routeCounts || {}) },
    projectTabCount: browserDebugState.projectTabCount || 0
  }
}

export function updateProjectDetailDebugEntry(id, entry = {}) {
  if (!id) return
  projectDetailEntries.set(id, {
    path: entry.path || '',
    isActive: Boolean(entry.isActive),
    currentView: entry.currentView || '',
    workspaceMounted: Boolean(entry.workspaceMounted),
    aiSessionsMounted: Boolean(entry.aiSessionsMounted),
    terminalMounted: Boolean(entry.terminalMounted)
  })
}

export function removeProjectDetailDebugEntry(id) {
  if (!id) return
  projectDetailEntries.delete(id)
}

export function getProjectDetailDebugStats() {
  const entries = Array.from(projectDetailEntries.values())
  const currentViews = {}
  const activePaths = []
  let workspaceMountedCount = 0
  let aiSessionsMountedCount = 0
  let terminalMountedCount = 0
  let activeInstances = 0
  let inactiveHeavyInstances = 0

  for (const entry of entries) {
    if (entry.isActive) {
      activeInstances += 1
      if (entry.path) activePaths.push(entry.path)
    }
    if (entry.currentView) {
      currentViews[entry.currentView] = (currentViews[entry.currentView] || 0) + 1
    }
    if (entry.workspaceMounted) workspaceMountedCount += 1
    if (entry.aiSessionsMounted) aiSessionsMountedCount += 1
    if (entry.terminalMounted) terminalMountedCount += 1
    if (!entry.isActive && (entry.workspaceMounted || entry.aiSessionsMounted || entry.terminalMounted)) {
      inactiveHeavyInstances += 1
    }
  }

  return {
    instances: entries.length,
    activeInstances,
    workspaceMountedCount,
    aiSessionsMountedCount,
    terminalMountedCount,
    inactiveHeavyInstances,
    currentViews,
    activePaths
  }
}

export function getProjectStoreDebugStats() {
  return {
    projectDetails: Object.keys(projectDetails).length,
    branchStatusCache: Object.keys(branchStatusCache).length,
    scanRoots: Object.keys(projectsByPath).length
  }
}
