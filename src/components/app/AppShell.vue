<template>
  <div class="app-shell" :class="{ resizing: isResizing }">
    <div v-if="sidebarCollapsed" class="sidebar-collapsed-rail">
      <button class="rail-btn" type="button" title="展开侧边栏" @click="sidebarStore.setSidebarCollapsed(false)">
        <PanelLeftOpen :size="18" />
      </button>
      <button class="rail-btn" type="button" title="添加目录" @click="handleAddRoot">
        <FolderPlus :size="18" />
      </button>
    </div>

    <div
      v-else
      class="sidebar-pane"
      :style="{ width: `${sidebarWidth}px`, flexBasis: `${sidebarWidth}px` }"
    >
      <ProjectSidebar
        :groups="filteredGroups"
        :favorite-paths="favoriteProjectPaths"
        :expanded-root-paths="sidebarStore.expandedRootPaths.value"
        :search-query="sidebarStore.searchQuery.value"
        :collapsed="sidebarCollapsed"
        :selected-root-path="selectedRootPath"
        :selected-entry-path="selectedEntryPath"
        :can-refresh-current-root="Boolean(currentRefreshRootPath)"
        :is-current-root-refreshing="isCurrentRootRefreshing"
        @add-root="handleAddRoot"
        @open-group="handleOpenGroup"
        @open-repository="handleOpenRepository"
        @toggle-favorite="handleToggleProjectFavorite"
        @remove-root="handleRemoveRoot"
        @remove-repository="handleRemoveRepository"
        @toggle-root="sidebarStore.toggleRootExpanded"
        @refresh-current-root="handleRefreshCurrentRoot"
        @toggle-collapse="sidebarStore.setSidebarCollapsed(true)"
        @expand-all="() => sidebarStore.expandAllRoots(filteredGroups.map(group => group.key))"
        @collapse-all="sidebarStore.collapseAllRoots"
        @update:searchQuery="(value) => sidebarStore.searchQuery.value = value"
      />
      <div class="sidebar-resizer" @mousedown="startResize"></div>
    </div>

    <div class="workspace-pane">
      <Browser
        ref="browserRef"
        :leading-tab-inset="browserLeadingTabInset"
        :favorite-project-paths="favoriteProjectPaths"
        @project-context-changed="handleProjectContextChanged"
        @project-branch-changed="handleProjectBranchChanged"
        @project-status-updated="handleProjectStatusUpdated"
        @project-pending-status-changed="handleProjectPendingStatusChanged"
        @toggle-project-favorite="handleToggleProjectFavorite"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FolderPlus, PanelLeftOpen } from 'lucide-vue-next'
import Browser from '../browser/Browser.vue'
import ProjectSidebar from '../project-sidebar/ProjectSidebar.vue'
import { useProjectSidebarStore } from '../../stores/projectSidebarStore'
import { useConfirm } from '../../composables/useConfirm'

const browserRef = ref(null)
const sidebarStore = useProjectSidebarStore()
const { confirm: showConfirm } = useConfirm()
const selectedRootPath = ref('')
const selectedEntryPath = ref('')
const isResizing = ref(false)
const repositoryStatusMap = ref({})
const repositorySignatureMap = ref({})
let repositoryStatusTimer = null
const REPOSITORY_STATUS_CACHE_KEY = 'project-sidebar-repository-status-v1'
const REPOSITORY_STATUS_ELECTRON_STORE_KEY = 'project-sidebar-repository-status-v1'
const FAVORITES_UPDATED_EVENT = 'browser-favorites-updated'
const ROOT_SCAN_CONCURRENCY = 3
const REPOSITORY_WARMUP_CONCURRENCY = 4
const isWindowActive = ref(true)
const favoriteProjectPaths = ref([])
let postMountWarmupHandle = null

const sidebarWidth = computed(() => sidebarStore.sidebarWidth.value)
const sidebarCollapsed = computed(() => sidebarStore.sidebarCollapsed.value)
const browserLeadingTabInset = computed(() => (sidebarCollapsed.value ? Math.max(72 - 52, 0) : 10))
const currentRefreshRootPath = computed(() => {
  if (selectedRootPath.value) return selectedRootPath.value
  if (selectedEntryPath.value) {
    const owningRoot = sidebarStore.findOwningRoot(selectedEntryPath.value)
    if (owningRoot?.path) return owningRoot.path
  }
  return sidebarStore.scanRoots.value[0]?.path || ''
})
const isCurrentRootRefreshing = computed(() => {
  const rootPath = currentRefreshRootPath.value
  if (!rootPath) return false
  const target = sidebarStore.scanRoots.value.find((item) => item.path === rootPath)
  return Boolean(target?.isScanning)
})

const normalizeFavoritePaths = (value) => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
}

const isFavoritePath = (path) => {
  const normalizedPath = String(path || '').trim()
  return normalizedPath ? favoriteProjectPaths.value.includes(normalizedPath) : false
}

const sortItemsByFavoriteFirst = (items = [], getPath) => {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const favoriteDelta = Number(isFavoritePath(getPath(right.item))) - Number(isFavoritePath(getPath(left.item)))
      if (favoriteDelta !== 0) return favoriteDelta
      return left.index - right.index
    })
    .map(({ item }) => item)
}

const filteredGroups = computed(() => {
  const repositoryGroups = sidebarStore.repositoryGroups.value.map((group) => ({
    ...group,
    renderKey: `repo-group:${group.path}`,
    repositories: sortItemsByFavoriteFirst(
      (group.repositories || []).map((repo) => ({
        ...repo,
        gitStatus: repositoryStatusMap.value[repo.path] || null
      })),
      (repo) => repo.path
    )
  }))

  const emptyDirectoryGroups = sidebarStore.scanRoots.value
    .filter((root) => {
      if (!root?.path) return false
      if (root.isGitRepo) return false
      return !(root.children || []).some((child) => child?.isGitRepo)
    })
    .map((root) => ({
      renderKey: `scan-root:${root.path}`,
      key: root.path,
      name: root.name || root.path.split('/').pop() || root.path,
      path: root.path,
      repositories: []
    }))

  return sortItemsByFavoriteFirst(
    [...repositoryGroups, ...emptyDirectoryGroups],
    (group) => group.path
  )
})

const extractProjectPathFromFavoriteUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''

  if (url.startsWith('git:project:')) {
    const projectPath = url.slice('git:project:'.length)
    try {
      return decodeURIComponent(projectPath)
    } catch {
      return projectPath
    }
  }

  if (url.startsWith('git:clone:')) {
    const projectPath = url.slice('git:clone:'.length)
    try {
      return decodeURIComponent(projectPath)
    } catch {
      return projectPath
    }
  }

  return ''
}

const refreshFavoriteProjectPaths = async () => {
  if (!window.electronAPI?.getBrowserFavorites) return
  try {
    const result = await window.electronAPI.getBrowserFavorites()
    const favorites = Array.isArray(result?.favorites) ? result.favorites : []
    favoriteProjectPaths.value = normalizeFavoritePaths(
      favorites.map((favorite) => extractProjectPathFromFavoriteUrl(favorite?.url))
    )
  } catch (error) {
    console.warn('恢复项目收藏状态失败:', error)
  }
}

const normalizeRepositoryStatusPayload = (value) => {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    Object.entries(value).map(([repoPath, status]) => {
      const branch = typeof status?.branch === 'string' ? status.branch.trim() : ''
      return [repoPath, {
        ...status,
        branch: branch && branch !== 'unknown' ? branch : ''
      }]
    })
  )
}

const loadRepositoryStatusCache = () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(REPOSITORY_STATUS_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      repositoryStatusMap.value = normalizeRepositoryStatusPayload(parsed)
    }
  } catch (error) {
    console.warn('恢复侧边栏仓库状态缓存失败:', error)
  }
}

const persistRepositoryStatusCache = () => {
  if (typeof window === 'undefined') return

  const payload = normalizeRepositoryStatusPayload(repositoryStatusMap.value)

  try {
    if (window.localStorage) {
      window.localStorage.setItem(
        REPOSITORY_STATUS_CACHE_KEY,
        JSON.stringify(payload)
      )
    }
  } catch (error) {
    console.warn('保存侧边栏仓库状态缓存失败:', error)
  }

  if (window.electronAPI?.setConfig) {
    window.electronAPI.setConfig(REPOSITORY_STATUS_ELECTRON_STORE_KEY, payload).catch((error) => {
      console.warn('保存侧边栏仓库状态到 electron-store 失败:', error)
    })
  }
}

const hydrateRepositoryStatusCache = async () => {
  loadRepositoryStatusCache()

  if (typeof window === 'undefined' || !window.electronAPI?.getConfig) return

  try {
    const payload = await window.electronAPI.getConfig(REPOSITORY_STATUS_ELECTRON_STORE_KEY)
    if (!payload || typeof payload !== 'object') {
      if (Object.keys(repositoryStatusMap.value).length > 0) {
        persistRepositoryStatusCache()
      }
      return
    }

    repositoryStatusMap.value = normalizeRepositoryStatusPayload(payload)

    if (window.localStorage) {
      window.localStorage.setItem(
        REPOSITORY_STATUS_CACHE_KEY,
        JSON.stringify(repositoryStatusMap.value)
      )
    }
  } catch (error) {
    console.warn('从 electron-store 恢复侧边栏仓库状态失败:', error)
  }
}

const refreshRoot = async (rootPath) => {
  const path = String(rootPath || '').trim()
  if (!path || !window.electronAPI?.getScanRootRepositories) return

  sidebarStore.markRootScanning(path, true)
  try {
    const result = await window.electronAPI.getScanRootRepositories({ path })
    if (result?.success) {
      sidebarStore.setScanResult(path, result)
    } else {
      sidebarStore.markRootScanning(path, false)
    }
  } catch (error) {
    console.error('扫描目录失败:', error)
    sidebarStore.markRootScanning(path, false)
  }
}

const scanRootRepositories = async (rootPath) => {
  const path = String(rootPath || '').trim()
  if (!path || !window.electronAPI?.getScanRootRepositories) return null

  try {
    const result = await window.electronAPI.getScanRootRepositories({ path })
    return result?.success ? result : null
  } catch (error) {
    console.error('扫描目录失败:', error)
    return null
  }
}

const hasGitRepositories = (scanResult) => {
  if (!scanResult) return false
  if (scanResult?.root?.isGitRepo) return true
  return Array.isArray(scanResult?.children) && scanResult.children.some((child) => child?.isGitRepo)
}

const resolveDefaultOpenTarget = (scanResult, fallbackPath) => {
  const normalizedFallbackPath = String(fallbackPath || '').trim()
  if (!scanResult) {
    return normalizedFallbackPath
      ? { path: normalizedFallbackPath, type: 'clone-directory' }
      : null
  }

  if (scanResult?.root?.isGitRepo && scanResult?.root?.path) {
    return {
      path: String(scanResult.root.path).trim(),
      type: 'single-project'
    }
  }

  const firstRepository = Array.isArray(scanResult?.children)
    ? scanResult.children.find((child) => child?.isGitRepo && child?.path)
    : null

  if (firstRepository?.path) {
    return {
      path: String(firstRepository.path).trim(),
      type: 'single-project'
    }
  }

  return normalizedFallbackPath
    ? { path: normalizedFallbackPath, type: 'clone-directory' }
    : null
}

const runWithConcurrency = async (items, concurrency, worker) => {
  const queue = Array.isArray(items) ? [...items] : []
  if (!queue.length) return

  const limit = Math.max(1, Number(concurrency) || 1)
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const nextItem = queue.shift()
      if (nextItem == null) continue
      await worker(nextItem)
    }
  })

  await Promise.all(runners)
}

const restoreRoots = async () => {
  const roots = [...sidebarStore.scanRoots.value]
  await runWithConcurrency(roots, ROOT_SCAN_CONCURRENCY, async (root) => {
    await refreshRoot(root.path)
  })
}

const collectAllRepositoryPaths = () => {
  const paths = new Set()
  for (const group of sidebarStore.repositoryGroups.value) {
    for (const repo of group.repositories || []) {
      if (repo?.path) {
        paths.add(repo.path)
      }
    }
  }
  return Array.from(paths)
}

const collectUnknownRepositoryPaths = () => {
  return collectAllRepositoryPaths().filter((repoPath) => {
    const existing = repositoryStatusMap.value?.[repoPath]
    return !existing?.branch || existing.branch === 'unknown'
  })
}

const collectPolledRepositoryPaths = () => {
  return collectUnknownRepositoryPaths()
}

const needsRepositoryStatusWarmup = (repoPath) => {
  const existing = repositoryStatusMap.value?.[repoPath]
  if (!existing) return true
  if (!existing.branch) return true
  return false
}

const refreshRepositoryStatus = async (repoPath) => {
  const existing = repositoryStatusMap.value?.[repoPath] || null
  try {
    const result = await window.electronAPI.getBranchStatus({ path: repoPath })
    const data = result?.success ? result.data : null
    repositoryStatusMap.value = {
      ...repositoryStatusMap.value,
      [repoPath]: {
        branch: data?.currentBranch || existing?.branch || '',
        hasPendingFiles: typeof data?.hasPendingFiles === 'boolean'
          ? data.hasPendingFiles
          : Boolean(existing?.hasPendingFiles),
        remoteAhead: typeof data?.currentBranchStatus?.remoteAhead === 'number'
          ? data.currentBranchStatus.remoteAhead
          : (existing?.remoteAhead || 0),
        localAhead: typeof data?.currentBranchStatus?.localAhead === 'number'
          ? data.currentBranchStatus.localAhead
          : (existing?.localAhead || 0),
        isLoading: false
      }
    }
    persistRepositoryStatusCache()
  } catch (error) {
    repositoryStatusMap.value = {
      ...repositoryStatusMap.value,
      [repoPath]: {
        branch: existing?.branch || '',
        hasPendingFiles: Boolean(existing?.hasPendingFiles),
        remoteAhead: existing?.remoteAhead || 0,
        localAhead: existing?.localAhead || 0,
        isLoading: false
      }
    }
    persistRepositoryStatusCache()
  }
}

const handleProjectBranchChanged = (payload = {}) => {
  const repoPath = String(payload?.path || '').trim()
  const branch = String(payload?.branch || '').trim()
  if (!repoPath || !branch) return

  repositoryStatusMap.value = {
    ...repositoryStatusMap.value,
    [repoPath]: {
      ...(repositoryStatusMap.value[repoPath] || {}),
      branch,
      hasPendingFiles: Boolean(repositoryStatusMap.value[repoPath]?.hasPendingFiles),
      remoteAhead: repositoryStatusMap.value[repoPath]?.remoteAhead || 0,
      localAhead: repositoryStatusMap.value[repoPath]?.localAhead || 0,
      isLoading: false
    }
  }
  persistRepositoryStatusCache()
}

const handleProjectStatusUpdated = async (payload = {}) => {
  const repoPath = String(payload?.path || '').trim()
  if (!repoPath) return

  repositoryStatusMap.value = {
    ...repositoryStatusMap.value,
    [repoPath]: {
      ...(repositoryStatusMap.value[repoPath] || {}),
      branch: repositoryStatusMap.value[repoPath]?.branch || '',
      hasPendingFiles: Boolean(repositoryStatusMap.value[repoPath]?.hasPendingFiles),
      remoteAhead: payload?.remoteAhead || 0,
      localAhead: payload?.localAhead || 0,
      isLoading: false
    }
  }
  persistRepositoryStatusCache()
  await refreshRepositoryStatus(repoPath)
}

const handleProjectPendingStatusChanged = async (payload = {}) => {
  const repoPath = String(payload?.path || '').trim()
  if (!repoPath) return

  repositoryStatusMap.value = {
    ...repositoryStatusMap.value,
    [repoPath]: {
      ...(repositoryStatusMap.value[repoPath] || {}),
      branch: repositoryStatusMap.value[repoPath]?.branch || '',
      hasPendingFiles: Boolean(payload?.hasPendingFiles),
      remoteAhead: repositoryStatusMap.value[repoPath]?.remoteAhead || 0,
      localAhead: repositoryStatusMap.value[repoPath]?.localAhead || 0,
      isLoading: false
    }
  }
  persistRepositoryStatusCache()
  await refreshRepositoryStatus(repoPath)
}

const pollRepositorySignatures = async ({ force = false } = {}) => {
  if (!isWindowActive.value && !force) return
  const repoPaths = collectPolledRepositoryPaths()
  if (!repoPaths.length || !window.electronAPI?.getProjectGitWatchSignature) return

  for (const repoPath of repoPaths) {
    try {
      const result = await window.electronAPI.getProjectGitWatchSignature({ path: repoPath })
      if (!result?.success || !result.data?.signature) continue

      const nextSignature = result.data.signature
      const previousSignature = repositorySignatureMap.value[repoPath]
      if (force || previousSignature !== nextSignature) {
        repositorySignatureMap.value = {
          ...repositorySignatureMap.value,
          [repoPath]: nextSignature
        }
        await refreshRepositoryStatus(repoPath)
      }
    } catch (error) {
      // ignore signature polling failure for individual repos
    }
  }
}

const warmRepositoryStatusCache = async ({ force = false } = {}) => {
  const repoPaths = collectAllRepositoryPaths()
  if (!repoPaths.length) return

  const targets = repoPaths.filter((repoPath) => force || needsRepositoryStatusWarmup(repoPath))
  await runWithConcurrency(targets, REPOSITORY_WARMUP_CONCURRENCY, async (repoPath) => {
    await refreshRepositoryStatus(repoPath)
  })
}

const startRepositoryStatusPolling = () => {
  if (repositoryStatusTimer != null) {
    window.clearInterval(repositoryStatusTimer)
  }
  pollRepositorySignatures({ force: true })
  repositoryStatusTimer = window.setInterval(() => {
    pollRepositorySignatures()
  }, 2000)
}

const stopRepositoryStatusPolling = () => {
  if (repositoryStatusTimer != null) {
    window.clearInterval(repositoryStatusTimer)
    repositoryStatusTimer = null
  }
}

const handleWindowFocus = () => {
  isWindowActive.value = true
  refreshFavoriteProjectPaths()
  startRepositoryStatusPolling()
}

const handleWindowBlur = () => {
  isWindowActive.value = false
  stopRepositoryStatusPolling()
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    handleWindowFocus()
  } else {
    handleWindowBlur()
  }
}

const handleFavoritesUpdated = () => {
  refreshFavoriteProjectPaths()
}

const runPostMountWarmup = async () => {
  try {
    await restoreRoots()
    await warmRepositoryStatusCache()
    if (isWindowActive.value) {
      await pollRepositorySignatures({ force: true })
    }
  } catch (error) {
    console.warn('侧边栏后台预热失败:', error)
  }
}

const schedulePostMountWarmup = () => {
  if (postMountWarmupHandle != null || typeof window === 'undefined') return
  postMountWarmupHandle = window.setTimeout(() => {
    postMountWarmupHandle = null
    void runPostMountWarmup()
  }, 0)
}

onMounted(async () => {
  await sidebarStore.hydrate?.()
  await refreshFavoriteProjectPaths()
  await hydrateRepositoryStatusCache()
  startRepositoryStatusPolling()
  schedulePostMountWarmup()
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated)
})

const openProjectPath = async (path, type) => {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return

  const routeUrl = type === 'clone-directory'
    ? `git:clone:${normalizedPath}`
    : `git:project:${normalizedPath}`

  await browserRef.value?.openProjectRoute?.(routeUrl)
}

const handleOpenRepository = async (repo) => {
  selectedRootPath.value = repo?.rootPath || ''
  selectedEntryPath.value = repo?.path || ''
  await openProjectPath(repo?.path, 'single-project')
}

const handleOpenGroup = async (group) => {
  const targetPath = String(group?.path || '').trim()
  selectedEntryPath.value = targetPath
  const owningRoot = sidebarStore.findOwningRoot(targetPath)
  selectedRootPath.value = owningRoot?.path || ''
  await openProjectPath(targetPath, 'clone-directory')
}

const handleAddRoot = async () => {
  if (!window.electronAPI?.showOpenDialog) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择要添加的目录'
  })

  if (result?.canceled || !result?.filePaths?.length) return

  for (const filePath of result.filePaths) {
    const scanResult = await scanRootRepositories(filePath)
    const allowEmptyRoot = hasGitRepositories(scanResult)
      ? true
      : await showConfirm({
        title: '当前没有 Git 仓库',
        message: '当前目录不是 Git 仓库，且子目录中也没有扫描到 Git 仓库，是否继续添加？',
        confirmText: '继续添加',
        cancelText: '取消'
      })

    if (!allowEmptyRoot) continue

    const root = sidebarStore.addScanRoot(filePath)
    if (!root?.path) continue

    if (scanResult) {
      sidebarStore.setScanResult(root.path, scanResult)
    } else {
      await refreshRoot(root.path)
    }

    await warmRepositoryStatusCache()

    const defaultOpenTarget = resolveDefaultOpenTarget(scanResult, root.path)
    if (defaultOpenTarget?.path) {
      if (defaultOpenTarget.type === 'single-project') {
        const owningRoot = sidebarStore.findOwningRoot(defaultOpenTarget.path)
        selectedRootPath.value = owningRoot?.path || root.path
        selectedEntryPath.value = defaultOpenTarget.path
      } else {
        selectedRootPath.value = root.path
        selectedEntryPath.value = root.path
      }

      await openProjectPath(defaultOpenTarget.path, defaultOpenTarget.type)
    }
  }
}

const handleRefreshCurrentRoot = async () => {
  const rootPath = currentRefreshRootPath.value
  if (!rootPath || isCurrentRootRefreshing.value) return
  await refreshRoot(rootPath)
  await warmRepositoryStatusCache()
}

const handleToggleProjectFavorite = async (payload = {}) => {
  const path = String(payload?.path || '').trim()
  if (!path) return
  const routeType = payload?.routeType === 'clone-directory' ? 'clone-directory' : 'single-project'
  const routeUrl = routeType === 'clone-directory'
    ? `git:clone:${path}`
    : `git:project:${path}`

  try {
    const favoritesResult = await window.electronAPI?.getBrowserFavorites?.()
    const favorites = Array.isArray(favoritesResult?.favorites) ? favoritesResult.favorites : []
    const existing = favorites.find((favorite) => String(favorite?.url || '') === routeUrl)

    if (existing?.id) {
      await window.electronAPI.removeBrowserFavorite({ id: existing.id })
    } else {
      const fallbackTitle = String(payload?.title || '').trim() || path.split(/[\\/]/).filter(Boolean).pop() || '项目'
      await window.electronAPI.addBrowserFavorite({
        title: fallbackTitle,
        url: routeUrl,
        icon: null,
        domain: '项目'
      })
    }
  } catch (error) {
    console.warn('切换项目收藏状态失败:', error)
  }

  await refreshFavoriteProjectPaths()
}

const removeFavoritesByPaths = async (paths = []) => {
  const normalizedPaths = Array.from(new Set(paths.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!normalizedPaths.length || !window.electronAPI?.getBrowserFavorites) return

  const favoriteUrls = new Set()
  for (const path of normalizedPaths) {
    favoriteUrls.add(`git:project:${path}`)
    favoriteUrls.add(`git:clone:${path}`)
  }

  try {
    const favoritesResult = await window.electronAPI.getBrowserFavorites()
    const favorites = Array.isArray(favoritesResult?.favorites) ? favoritesResult.favorites : []
    const removals = favorites
      .filter((favorite) => favorite?.id && favoriteUrls.has(String(favorite?.url || '').trim()))
      .map((favorite) => window.electronAPI.removeBrowserFavorite({ id: favorite.id }))

    if (removals.length) {
      await Promise.all(removals)
    }
  } catch (error) {
    console.warn('删除侧栏收藏失败:', error)
  }

  await refreshFavoriteProjectPaths()
}

const handleRemoveRoot = async (group = {}) => {
  const rootPath = String(group?.path || '').trim()
  if (!rootPath) return

  const confirmed = await showConfirm({
    title: '从侧栏删除目录',
    message: '确认从侧栏删除这个目录？',
    detail: rootPath,
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  const owningRoot = sidebarStore.scanRoots.value.find((item) => item.path === rootPath)
  const relatedRepoPaths = Array.isArray(group?.repositories)
    ? group.repositories.map((repo) => String(repo?.path || '').trim()).filter(Boolean)
    : []
  const relatedPaths = Array.from(new Set([
    rootPath,
    ...((owningRoot?.children || []).map((child) => child?.path)),
    ...relatedRepoPaths
  ].filter(Boolean)))

  if (owningRoot) {
    sidebarStore.removeScanRoot(rootPath)
  } else {
    for (const repoPath of relatedRepoPaths) {
      sidebarStore.removeRepository(repoPath)
    }
  }

  await removeFavoritesByPaths(relatedPaths)

  if (selectedRootPath.value === rootPath) {
    selectedRootPath.value = ''
  }
  if (selectedEntryPath.value === rootPath || relatedPaths.includes(selectedEntryPath.value)) {
    selectedEntryPath.value = ''
  }

  await browserRef.value?.closeProjectTabsByPaths?.(relatedPaths)
}

const handleRemoveRepository = async (repo = {}) => {
  const repoPath = String(repo?.path || '').trim()
  if (!repoPath) return

  const confirmed = await showConfirm({
    title: '从侧栏删除项目',
    message: '确认从侧栏删除这个项目？',
    detail: repoPath,
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  sidebarStore.removeRepository(repoPath)
  await removeFavoritesByPaths([repoPath])

  if (selectedEntryPath.value === repoPath) {
    selectedEntryPath.value = ''
  }

  await browserRef.value?.closeProjectTabsByPaths?.([repoPath])
}

const handleProjectContextChanged = (payload) => {
  const path = String(payload?.path || '').trim()
  if (!path) {
    selectedRootPath.value = ''
    selectedEntryPath.value = ''
    return
  }

  selectedEntryPath.value = path
  const owningRoot = sidebarStore.findOwningRoot(path)
  selectedRootPath.value = owningRoot?.path || path
}

let cleanupResize = null

const startResize = (event) => {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarStore.sidebarWidth.value

  const onMouseMove = (moveEvent) => {
    const nextWidth = startWidth + (moveEvent.clientX - startX)
    sidebarStore.setSidebarWidth(nextWidth)
  }

  const onMouseUp = () => {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    cleanupResize = null
  }

  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  cleanupResize = onMouseUp
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onBeforeUnmount(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (postMountWarmupHandle != null && typeof window !== 'undefined') {
    window.clearTimeout(postMountWarmupHandle)
    postMountWarmupHandle = null
  }
  stopRepositoryStatusPolling()
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated)
  cleanupResize?.()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--theme-sem-bg-app);
  overflow: hidden;
}

.sidebar-pane {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  height: 100%;
  background: var(--theme-sem-bg-sidebar);
  box-shadow: inset -1px 0 0 var(--theme-sem-border-default);
}

.workspace-pane {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  position: relative;
  background: var(--theme-sem-bg-workspace);
  overflow: hidden;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -4px;
  width: 9px;
  height: 100%;
  cursor: col-resize;
  z-index: 8;
}

.sidebar-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  width: 1px;
  height: 100%;
  background: var(--theme-sem-border-default);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.sidebar-resizer:hover::before {
  background: var(--theme-sem-accent-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-sem-accent-primary) 34%, transparent);
}

.sidebar-collapsed-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  flex: 0 0 52px;
  width: 52px;
  height: 100%;
  padding-top: 30px;
  background: var(--theme-sem-bg-sidebar);
  border-right: 1px solid var(--theme-sem-border-default);
}

.app-shell.resizing .workspace-pane {
  box-shadow: inset 1px 0 0 color-mix(in srgb, var(--theme-sem-accent-primary) 34%, transparent);
}

.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
  cursor: pointer;
}

.rail-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 72%, white 28%);
}
</style>
