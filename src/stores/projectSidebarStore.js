import { computed, ref, toRaw } from 'vue'

const STORAGE_KEY = 'project-sidebar-state-v1'
const ELECTRON_STORE_KEY = 'project-sidebar-state-v1'
const DEFAULT_WIDTH = 280
const MIN_WIDTH = 220
const MAX_WIDTH = 520

const scanRoots = ref([])
const sidebarWidth = ref(DEFAULT_WIDTH)
const sidebarCollapsed = ref(false)
const expandedRootPaths = ref([])
const searchQuery = ref('')
const initialized = ref(false)
let hydratePromise = null

const normalizePath = (value) => {
  if (!value || typeof value !== 'string') return ''
  return value.trim().replace(/[\\/]+$/, '')
}

const isSameOrNestedPath = (candidatePath, rootPath) => {
  const candidate = normalizePath(candidatePath)
  const root = normalizePath(rootPath)
  if (!candidate || !root) return false
  if (candidate === root) return true
  return candidate.startsWith(`${root}/`) || candidate.startsWith(`${root}\\`)
}

const clampWidth = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_WIDTH
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(numeric)))
}

const getStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

const toPlainData = (value) => JSON.parse(JSON.stringify(toRaw(value)))

const buildPayload = () => toPlainData({
  sidebarWidth: sidebarWidth.value,
  sidebarCollapsed: sidebarCollapsed.value,
  expandedRootPaths: expandedRootPaths.value,
  scanRoots: scanRoots.value.map((root) => ({
    path: root.path,
    name: root.name,
    isGitRepo: Boolean(root.isGitRepo),
    children: Array.isArray(root.children) ? root.children : [],
    lastScannedAt: root.lastScannedAt || null
  }))
})

const applyPayload = (parsed = {}) => {
  sidebarWidth.value = clampWidth(parsed.sidebarWidth)
  sidebarCollapsed.value = Boolean(parsed.sidebarCollapsed)
  expandedRootPaths.value = Array.isArray(parsed.expandedRootPaths)
    ? parsed.expandedRootPaths.map(normalizePath).filter(Boolean)
    : []
  scanRoots.value = Array.isArray(parsed.scanRoots)
    ? parsed.scanRoots
      .map((root) => ({
        path: normalizePath(root.path),
        name: root.name || normalizePath(root.path).split('/').pop() || '未命名目录',
        isGitRepo: Boolean(root.isGitRepo),
        isScanning: false,
        children: Array.isArray(root.children) ? root.children : [],
        lastScannedAt: root.lastScannedAt || null
      }))
      .filter((root) => root.path)
    : []
}

const persist = () => {
  const payload = buildPayload()
  const storage = getStorage()
  if (storage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  if (typeof window !== 'undefined' && window.electronAPI?.setConfig) {
    window.electronAPI.setConfig(ELECTRON_STORE_KEY, payload).catch((error) => {
      console.warn('保存项目侧边栏状态到 electron-store 失败:', error)
    })
  }
}

const ensureExpandedState = (path, expanded = true) => {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return

  const set = new Set(expandedRootPaths.value)
  if (expanded) {
    set.add(normalizedPath)
  } else {
    set.delete(normalizedPath)
  }
  expandedRootPaths.value = Array.from(set)
}

const restoreState = () => {
  if (initialized.value) return
  initialized.value = true

  const storage = getStorage()
  if (!storage) return

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw)
    applyPayload(parsed)
  } catch (error) {
    console.warn('恢复项目侧边栏状态失败:', error)
  }
}

const hydrate = async () => {
  restoreState()

  if (hydratePromise) {
    return hydratePromise
  }

  hydratePromise = (async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.getConfig) return

    try {
      const payload = await window.electronAPI.getConfig(ELECTRON_STORE_KEY)
      if (!payload || typeof payload !== 'object') {
        if (scanRoots.value.length > 0) {
          persist()
        }
        return
      }

      applyPayload(payload)

      const storage = getStorage()
      if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()))
      }
    } catch (error) {
      console.warn('从 electron-store 恢复项目侧边栏状态失败:', error)
    }
  })()

  return hydratePromise
}

const upsertScanRoot = (rootPath, initialState = {}) => {
  const path = normalizePath(rootPath)
  if (!path) return null

  const containingRoot = scanRoots.value.find((item) => isSameOrNestedPath(path, item.path))
  if (containingRoot) {
    Object.assign(containingRoot, initialState)
    persist()
    return containingRoot
  }

  const nestedRoots = scanRoots.value.filter((item) => isSameOrNestedPath(item.path, path))
  if (nestedRoots.length > 0) {
    scanRoots.value = scanRoots.value.filter((item) => !isSameOrNestedPath(item.path, path))
    expandedRootPaths.value = expandedRootPaths.value.filter((existingPath) => !isSameOrNestedPath(existingPath, path))
  }

  const root = {
    path,
    name: initialState.name || path.split('/').pop() || '未命名目录',
    isGitRepo: Boolean(initialState.isGitRepo),
    isScanning: Boolean(initialState.isScanning),
    children: Array.isArray(initialState.children) ? initialState.children : [],
    lastScannedAt: initialState.lastScannedAt || null
  }

  scanRoots.value = [...scanRoots.value, root]
  ensureExpandedState(path, true)
  persist()
  return root
}

const removeScanRoot = (rootPath) => {
  const path = normalizePath(rootPath)
  scanRoots.value = scanRoots.value.filter((item) => item.path !== path)
  ensureExpandedState(path, false)
  persist()
}

const markRootScanning = (rootPath, value) => {
  const path = normalizePath(rootPath)
  const target = scanRoots.value.find((item) => item.path === path)
  if (!target) return
  target.isScanning = Boolean(value)
}

const setScanResult = (rootPath, result) => {
  const path = normalizePath(rootPath)
  const target = scanRoots.value.find((item) => item.path === path)
  if (!target) return

  const rootMeta = result?.root || {}
  target.name = rootMeta.name || target.name
  target.isGitRepo = Boolean(rootMeta.isGitRepo)
  target.children = Array.isArray(result?.children)
    ? result.children.map((child) => ({
      ...child,
      rootPath: path
    }))
    : []
  target.lastScannedAt = Date.now()
  target.isScanning = false
  persist()
}

const setSidebarWidth = (value) => {
  sidebarWidth.value = clampWidth(value)
  persist()
}

const setSidebarCollapsed = (value) => {
  sidebarCollapsed.value = Boolean(value)
  persist()
}

const toggleRootExpanded = (rootPath) => {
  const path = normalizePath(rootPath)
  const isExpanded = expandedRootPaths.value.includes(path)
  ensureExpandedState(path, !isExpanded)
  persist()
}

const expandAllRoots = (keys = null) => {
  expandedRootPaths.value = Array.isArray(keys)
    ? keys.map(normalizePath).filter(Boolean)
    : repositoryGroups.value.map((group) => normalizePath(group.key)).filter(Boolean)
  persist()
}

const collapseAllRoots = () => {
  expandedRootPaths.value = []
  persist()
}

const orderedRoots = computed(() => {
  return [...scanRoots.value].sort((a, b) => a.path.localeCompare(b.path))
})

const repositoryGroups = computed(() => {
  const repoMap = new Map()

  for (const root of scanRoots.value) {
    if (root.isGitRepo && root.path) {
      repoMap.set(root.path, {
        path: root.path,
        name: root.name || root.path.split('/').pop() || root.path,
        relativePath: '.',
        rootPath: root.path,
        isGitRepo: true
      })
    }

    for (const child of root.children || []) {
      if (!child?.isGitRepo || !child?.path) continue
      repoMap.set(child.path, {
        ...child,
        rootPath: child.rootPath || root.path,
        isGitRepo: true
      })
    }
  }

  const grouped = new Map()
  for (const repo of repoMap.values()) {
    const parentPath = normalizePath(repo.path.split(/[\\/]/).slice(0, -1).join('/'))
    const groupKey = parentPath || '/'
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        key: groupKey,
        name: groupKey === '/' ? '/' : groupKey.split('/').pop() || groupKey,
        path: groupKey,
        repositories: []
      })
    }
    grouped.get(groupKey).repositories.push(repo)
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      repositories: group.repositories.sort((a, b) => a.path.localeCompare(b.path))
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
})

const findOwningRoot = (targetPath) => {
  const normalizedTarget = normalizePath(targetPath)
  if (!normalizedTarget) return null

  const matches = scanRoots.value
    .filter((root) => isSameOrNestedPath(normalizedTarget, root.path))
    .sort((a, b) => b.path.length - a.path.length)

  return matches[0] || null
}

export function useProjectSidebarStore() {
  restoreState()

  return {
    scanRoots,
    orderedRoots,
    repositoryGroups,
    sidebarWidth,
    sidebarCollapsed,
    expandedRootPaths,
    searchQuery,
    minSidebarWidth: MIN_WIDTH,
    maxSidebarWidth: MAX_WIDTH,
    addScanRoot: upsertScanRoot,
    removeScanRoot,
    findOwningRoot,
    markRootScanning,
    setScanResult,
    setSidebarWidth,
    setSidebarCollapsed,
    toggleRootExpanded,
    expandAllRoots,
    collapseAllRoots,
    persist,
    hydrate
  }
}
