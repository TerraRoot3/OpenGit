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
        :expanded-root-paths="sidebarStore.expandedRootPaths.value"
        :search-query="sidebarStore.searchQuery.value"
        :collapsed="sidebarCollapsed"
        :selected-root-path="selectedRootPath"
        :selected-entry-path="selectedEntryPath"
        @add-root="handleAddRoot"
        @open-group="handleOpenGroup"
        @open-repository="handleOpenRepository"
        @toggle-root="sidebarStore.toggleRootExpanded"
        @toggle-collapse="sidebarStore.setSidebarCollapsed(true)"
        @expand-all="() => sidebarStore.expandAllRoots(filteredGroups.map(group => group.key))"
        @collapse-all="sidebarStore.collapseAllRoots"
        @update:searchQuery="(value) => sidebarStore.searchQuery.value = value"
      />
      <div class="sidebar-resizer" @mousedown="startResize"></div>
    </div>

    <div class="workspace-pane">
      <Browser ref="browserRef" @project-context-changed="handleProjectContextChanged" />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FolderPlus, PanelLeftOpen } from 'lucide-vue-next'
import Browser from '../browser/Browser.vue'
import ProjectSidebar from '../project-sidebar/ProjectSidebar.vue'
import { useProjectSidebarStore } from '../../stores/projectSidebarStore'

const browserRef = ref(null)
const sidebarStore = useProjectSidebarStore()
const selectedRootPath = ref('')
const selectedEntryPath = ref('')
const isResizing = ref(false)
const repositoryStatusMap = ref({})
const repositorySignatureMap = ref({})
let repositoryStatusTimer = null
const REPOSITORY_STATUS_CACHE_KEY = 'project-sidebar-repository-status-v1'
const isWindowActive = ref(true)

const sidebarWidth = computed(() => sidebarStore.sidebarWidth.value)
const sidebarCollapsed = computed(() => sidebarStore.sidebarCollapsed.value)

const filteredGroups = computed(() => {
  return sidebarStore.repositoryGroups.value.map((group) => ({
    ...group,
    repositories: (group.repositories || []).map((repo) => ({
      ...repo,
      gitStatus: repositoryStatusMap.value[repo.path] || null
    }))
  }))
})

const loadRepositoryStatusCache = () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(REPOSITORY_STATUS_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      repositoryStatusMap.value = parsed
    }
  } catch (error) {
    console.warn('恢复侧边栏仓库状态缓存失败:', error)
  }
}

const persistRepositoryStatusCache = () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(
      REPOSITORY_STATUS_CACHE_KEY,
      JSON.stringify(repositoryStatusMap.value)
    )
  } catch (error) {
    console.warn('保存侧边栏仓库状态缓存失败:', error)
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

const restoreRoots = async () => {
  const roots = [...sidebarStore.scanRoots.value]
  for (const root of roots) {
    await refreshRoot(root.path)
  }
}

const collectRepositoryPaths = () => {
  const paths = new Set()
  for (const group of sidebarStore.repositoryGroups.value) {
    for (const repo of group.repositories || []) {
      if (repo?.path) paths.add(repo.path)
    }
  }
  return Array.from(paths)
}

const refreshRepositoryStatus = async (repoPath) => {
  try {
    const result = await window.electronAPI.getBranchStatus({ path: repoPath })
    const data = result?.success ? result.data : null
    repositoryStatusMap.value = {
      ...repositoryStatusMap.value,
      [repoPath]: {
        branch: data?.currentBranch || 'unknown',
        hasPendingFiles: Boolean(data?.hasPendingFiles),
        remoteAhead: data?.currentBranchStatus?.remoteAhead || 0,
        localAhead: data?.currentBranchStatus?.localAhead || 0,
        isLoading: false
      }
    }
    persistRepositoryStatusCache()
  } catch (error) {
    repositoryStatusMap.value = {
      ...repositoryStatusMap.value,
      [repoPath]: {
        branch: 'unknown',
        hasPendingFiles: false,
        remoteAhead: 0,
        localAhead: 0,
        isLoading: false
      }
    }
    persistRepositoryStatusCache()
  }
}

const pollRepositorySignatures = async ({ force = false } = {}) => {
  if (!isWindowActive.value && !force) return
  const repoPaths = collectRepositoryPaths()
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

onMounted(async () => {
  await sidebarStore.hydrate?.()
  loadRepositoryStatusCache()
  await restoreRoots()
  startRepositoryStatusPolling()
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
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
  selectedEntryPath.value = group?.path || ''
  const owningRoot = sidebarStore.findOwningRoot(group?.path || '')
  selectedRootPath.value = owningRoot?.path || ''
  await openProjectPath(group?.path, 'clone-directory')
}

const handleAddRoot = async () => {
  if (!window.electronAPI?.showOpenDialog) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择要添加的目录'
  })

  if (result?.canceled || !result?.filePaths?.length) return

  for (const filePath of result.filePaths) {
    const root = sidebarStore.addScanRoot(filePath)
    if (root?.path) {
      await refreshRoot(root.path)
    }
  }
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
  stopRepositoryStatusPolling()
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  cleanupResize?.()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #1f2023;
  overflow: hidden;
}

.sidebar-pane {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  height: 100%;
  background: #232326;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.06);
}

.workspace-pane {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  position: relative;
  background: #1f2023;
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
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.sidebar-resizer:hover::before {
  background: rgba(77, 135, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(77, 135, 255, 0.25);
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
  background: #232326;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.app-shell.resizing .workspace-pane {
  box-shadow: inset 1px 0 0 rgba(77, 135, 255, 0.28);
}

.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}

.rail-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
</style>
