<template>
  <main class="project-workspace-host">
    <div class="workspace-tabs-bar">
      <div class="workspace-tabs-list">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.id"
          class="workspace-tab"
          :class="{
            active: tab.id === activeTabId,
            'leading-tab': index === 0,
            dragging: tab.id === draggingTabId,
            'drag-over': tab.id === dragOverTabId
          }"
          draggable="true"
          @click="activateTab(tab.id)"
          @auxclick.middle.prevent="closeTab(tab.id)"
          @dragstart="startTabDrag($event, tab.id)"
          @dragover.prevent="dragOverTabId = tab.id"
          @drop.prevent="dropTab(tab.id)"
          @dragend="finishTabDrag"
        >
          <span class="workspace-tab-icon">
            <Cloud v-if="tab.kind === 'remote'" :size="14" />
            <Terminal v-else-if="tab.kind === 'terminal'" :size="14" />
            <HardDrive v-else-if="tab.kind === 'backup'" :size="14" />
            <Palette v-else-if="tab.kind === 'theme'" :size="14" />
            <Folder v-else-if="tab.routeType === 'clone-directory'" :size="14" />
            <GitBranch v-else :size="14" />
          </span>
          <span
            v-if="getTabCodexStatus(tab)"
            class="workspace-tab-status"
            :class="getTabCodexStatus(tab)"
            :title="getCodexStatusTitle(getTabCodexStatus(tab))"
          ></span>
          <span class="workspace-tab-title" :title="tab.path || tab.title">
            {{ tab.title }}
          </span>
          <button
            class="workspace-tab-close"
            type="button"
            :aria-label="`关闭 ${tab.title}`"
            @click.stop="closeTab(tab.id)"
          >
            <X :size="12" />
          </button>
        </div>
      </div>

      <div class="workspace-tabs-drag-area"></div>

      <div class="workspace-menu-wrap">
        <button
          class="workspace-menu-trigger"
          type="button"
          title="工作区入口"
          aria-label="打开工作区菜单"
          :aria-expanded="showWorkspaceMenu"
          @click.stop="showWorkspaceMenu = !showWorkspaceMenu"
        >
          <MoreVertical :size="18" />
        </button>

        <div v-if="showWorkspaceMenu" class="workspace-menu">
          <button type="button" @click="openRemoteRepo">
            <Cloud :size="16" />
            <span>远端仓库</span>
          </button>
          <button type="button" @click="openFocusTerminal">
            <Terminal :size="16" />
            <span>灵动终端</span>
          </button>
          <button type="button" @click="openSplitTerminal">
            <Terminal :size="16" />
            <span>分屏终端</span>
          </button>
          <button type="button" @click="openBackupManager">
            <HardDrive :size="16" />
            <span>备份管理</span>
          </button>
          <div class="workspace-menu-divider"></div>
          <button type="button" @click="openThemeManager">
            <Palette :size="16" />
            <span>皮肤</span>
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="showWorkspaceMenu"
      class="workspace-menu-backdrop"
      type="button"
      aria-label="关闭工作区菜单"
      @click="showWorkspaceMenu = false"
    ></button>

    <section class="workspace-tab-content">
      <ProjectDetail
        v-for="tab in projectTabs"
        v-show="tab.id === activeTabId"
        :key="tab.id"
        :path="tab.path"
        :allow-directory-mode="tab.routeType === 'clone-directory'"
        :is-active="tab.id === activeTabId"
        :terminal-focus-request="terminalFocusRequest"
        @branch-changed="(payload) => emit('project-branch-changed', payload)"
        @status-updated="(payload) => emit('project-status-updated', payload)"
        @pending-status-changed="(payload) => emit('project-pending-status-changed', payload)"
      />

      <RemoteRepo
        v-if="remoteTab"
        v-show="remoteTab.id === activeTabId"
        @navigate="openProjectRoute"
      />

      <FocusTerminalStack
        v-for="tab in focusTerminalTabs"
        v-show="tab.id === activeTabId"
        :key="tab.id"
        :is-active="tab.id === activeTabId"
        :scope-key="tab.id"
      />

      <StandaloneSplitTerminal
        v-for="tab in splitTerminalTabs"
        v-show="tab.id === activeTabId"
        :key="tab.id"
        :is-active="tab.id === activeTabId"
        :snapshot-cache-key="tab.id"
      />

      <BackupManager
        v-if="backupTab"
        v-show="backupTab.id === activeTabId"
      />

      <ThemePanel
        v-if="themeTab"
        v-show="themeTab.id === activeTabId"
      />

      <div v-if="tabs.length === 0" class="project-workspace-empty">
        <FolderOpen :size="34" stroke-width="1.5" />
        <strong>从侧边栏打开项目</strong>
        <span>也可以打开远端仓库、灵动终端或分屏终端</span>
      </div>
    </section>
  </main>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import {
  Cloud,
  Folder,
  FolderOpen,
  GitBranch,
  HardDrive,
  MoreVertical,
  Palette,
  Terminal,
  X
} from 'lucide-vue-next'
import ProjectDetail from '../git/ProjectDetail.vue'
import RemoteRepo from '../git/RemoteRepo.vue'
import FocusTerminalStack from '../terminal/FocusTerminalStack.vue'
import StandaloneSplitTerminal from '../terminal/StandaloneSplitTerminal.vue'
import BackupManager from './BackupManager.vue'
import ThemePanel from './ThemePanel.vue'
import { clearProjectCache } from '../../stores/projectStore.js'
import { clearFocusTerminalScope } from '../../stores/focusTerminalStore.js'
import { useCodexProjectStatusStore } from '../../stores/codexProjectStatusStore.js'
import {
  buildProjectWorkspaceRoute,
  createBackupWorkspaceTab,
  createProjectTerminalFocusRequest,
  createProjectWorkspaceTab,
  createRemoteWorkspaceTab,
  createStandaloneTerminalTab,
  createThemeWorkspaceTab,
  migrateLegacyBrowserTabs,
  resolveNextWorkspaceTabId,
  restoreWorkspaceTabs,
  serializeWorkspaceTabs
} from './projectWorkspaceNavigation.mjs'

const props = defineProps({
  leadingTabInset: { type: Number, default: 0 }
})

const emit = defineEmits([
  'project-context-changed',
  'active-tab-changed',
  'project-branch-changed',
  'project-status-updated',
  'project-pending-status-changed'
])

const WORKSPACE_TABS_STORAGE_KEY = 'opengit-workspace-tabs-v1'
const { getProjectStatus } = useCodexProjectStatusStore()
const leadingTabInsetCss = computed(() => (
  `${Math.max(0, Number(props.leadingTabInset) || 0)}px`
))

const isSerializedWorkspaceState = (payload) => (
  payload
  && payload.version === 1
  && Array.isArray(payload.tabs)
)

const readPersistedTabs = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { found: false, tabs: [], activeTabId: '' }
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY)
    if (!raw) return { found: false, tabs: [], activeTabId: '' }
    const payload = JSON.parse(raw)
    if (!isSerializedWorkspaceState(payload)) {
      return { found: false, tabs: [], activeTabId: '' }
    }
    return { found: true, ...restoreWorkspaceTabs(payload) }
  } catch {
    return { found: false, tabs: [], activeTabId: '' }
  }
}

const restoredState = readPersistedTabs()
const tabs = ref(restoredState.tabs)
const activeTabId = ref(restoredState.activeTabId)
const terminalFocusRequest = ref(null)
const showWorkspaceMenu = ref(false)
const draggingTabId = ref('')
const dragOverTabId = ref('')
let removeFocusProjectTerminalListener = null
let terminalFocusRetryTimer = null
let terminalSequence = 0
let isWorkspaceHydrated = restoredState.found
let workspaceWatchInitialized = false
let workspaceChangedBeforeHydration = false

const activeTab = computed(() => (
  tabs.value.find((tab) => tab.id === activeTabId.value) || null
))
const projectTabs = computed(() => tabs.value.filter((tab) => tab.kind === 'project'))
const terminalTabs = computed(() => tabs.value.filter((tab) => tab.kind === 'terminal'))
const focusTerminalTabs = computed(() => terminalTabs.value.filter(
  (tab) => tab.routeType === 'standalone-terminal-focus'
))
const splitTerminalTabs = computed(() => terminalTabs.value.filter(
  (tab) => tab.routeType === 'standalone-terminal-split'
))
const remoteTab = computed(() => tabs.value.find((tab) => tab.kind === 'remote') || null)
const backupTab = computed(() => tabs.value.find((tab) => tab.kind === 'backup') || null)
const themeTab = computed(() => tabs.value.find((tab) => tab.kind === 'theme') || null)
const activeProjectSnapshot = computed(() => {
  const tab = activeTab.value
  if (tab?.kind !== 'project') return null
  return {
    id: tab.id,
    path: tab.path,
    routeType: tab.routeType,
    title: tab.title
  }
})
const openProjectSnapshots = computed(() => (
  projectTabs.value.map((tab) => ({
    id: tab.id,
    path: tab.path,
    routeType: tab.routeType,
    title: tab.title
  }))
))

const persistTabs = () => {
  if (!isWorkspaceHydrated || typeof window === 'undefined') return
  const payload = serializeWorkspaceTabs(tabs.value, activeTabId.value)
  try {
    window.localStorage?.setItem(
      WORKSPACE_TABS_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch (error) {
    console.warn('保存本地工作区标签失败:', error)
  }
  if (window.electronAPI?.setConfig) {
    void Promise.resolve(
      window.electronAPI.setConfig(WORKSPACE_TABS_STORAGE_KEY, payload)
    )
      .catch((error) => console.warn('保存工作区标签失败:', error))
  }
}

const hydrateWorkspaceTabs = async () => {
  if (isWorkspaceHydrated) {
    persistTabs()
    return
  }

  let hydratedState = null
  try {
    const savedWorkspace = await window.electronAPI?.getConfig?.(WORKSPACE_TABS_STORAGE_KEY)
    if (isSerializedWorkspaceState(savedWorkspace)) {
      hydratedState = restoreWorkspaceTabs(savedWorkspace)
    } else if (window.electronAPI?.getConfig) {
      const [savedTabs, savedActiveTabIndex, savedOrder] = await Promise.all([
        window.electronAPI.getConfig('browserTabs'),
        window.electronAPI.getConfig('browserActiveTabIndex'),
        window.electronAPI.getConfig('browserTabOrder')
      ])
      hydratedState = migrateLegacyBrowserTabs({
        savedTabs,
        savedActiveTabIndex,
        savedOrder
      })
    }
  } catch (error) {
    console.warn('恢复工作区标签失败:', error)
  }

  isWorkspaceHydrated = true
  if (!workspaceChangedBeforeHydration && hydratedState) {
    tabs.value = hydratedState.tabs
    activeTabId.value = hydratedState.activeTabId
  }
  persistTabs()
}

const reportWorkspaceState = () => {
  window.electronAPI?.reportWorkspaceRuntimeState?.({
    activeProject: activeProjectSnapshot.value,
    openProjects: openProjectSnapshots.value
  })
}

const clearWorkspaceRuntime = (tab) => {
  if (tab?.kind === 'project' && tab.path) {
    clearProjectCache(tab.path)
    clearFocusTerminalScope(tab.path)
  } else if (tab?.routeType === 'standalone-terminal-focus' && tab.id) {
    clearFocusTerminalScope(tab.id)
  }
}

const activateTab = (tabId) => {
  if (!tabs.value.some((tab) => tab.id === tabId)) return false
  showWorkspaceMenu.value = false
  activeTabId.value = tabId
  return true
}

const openProjectRoute = async (routeUrl) => {
  const nextTab = createProjectWorkspaceTab(routeUrl)
  if (!nextTab) return false

  const existing = tabs.value.find((tab) => tab.id === nextTab.id)
  if (!existing) {
    tabs.value = [...tabs.value, nextTab]
  }
  activeTabId.value = nextTab.id
  terminalFocusRequest.value = null
  await nextTick()
  return true
}

const openRemoteRepo = async () => {
  showWorkspaceMenu.value = false
  const nextTab = createRemoteWorkspaceTab()
  if (!tabs.value.some((tab) => tab.id === nextTab.id)) {
    tabs.value = [...tabs.value, nextTab]
  }
  activeTabId.value = nextTab.id
  await nextTick()
  return true
}

const openTerminalPage = async (mode) => {
  showWorkspaceMenu.value = false
  terminalSequence += 1
  const normalizedMode = mode === 'split' ? 'split' : 'focus'
  const matchingTabs = normalizedMode === 'split'
    ? splitTerminalTabs.value
    : focusTerminalTabs.value
  const terminalCount = matchingTabs.length + 1
  const baseTitle = normalizedMode === 'split' ? '分屏终端' : '灵动终端'
  const nextTab = createStandaloneTerminalTab({
    id: `standalone-terminal-${normalizedMode}:${Date.now()}:${terminalSequence}`,
    title: terminalCount === 1 ? baseTitle : `${baseTitle} ${terminalCount}`,
    mode: normalizedMode
  })
  tabs.value = [...tabs.value, nextTab]
  activeTabId.value = nextTab.id
  await nextTick()
  return true
}

const openFocusTerminal = () => openTerminalPage('focus')
const openSplitTerminal = () => openTerminalPage('split')

const openBackupManager = async () => {
  showWorkspaceMenu.value = false
  const nextTab = createBackupWorkspaceTab()
  if (!tabs.value.some((tab) => tab.id === nextTab.id)) {
    tabs.value = [...tabs.value, nextTab]
  }
  activeTabId.value = nextTab.id
  await nextTick()
  return true
}

const openThemeManager = async () => {
  showWorkspaceMenu.value = false
  const nextTab = createThemeWorkspaceTab()
  if (!tabs.value.some((tab) => tab.id === nextTab.id)) {
    tabs.value = [...tabs.value, nextTab]
  }
  activeTabId.value = nextTab.id
  await nextTick()
  return true
}

const closeTab = async (tabId) => {
  const closingTab = tabs.value.find((tab) => tab.id === tabId)
  if (!closingTab) return false

  const nextActiveId = resolveNextWorkspaceTabId({
    tabs: tabs.value,
    closingId: tabId,
    activeId: activeTabId.value
  })
  clearWorkspaceRuntime(closingTab)
  tabs.value = tabs.value.filter((tab) => tab.id !== tabId)
  activeTabId.value = nextActiveId
  await nextTick()
  return true
}

const closeProjectsByPaths = async (paths = []) => {
  const targets = new Set(
    (Array.isArray(paths) ? paths : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )
  if (targets.size === 0) return false

  const closingTabs = projectTabs.value.filter((tab) => targets.has(tab.path))
  if (closingTabs.length === 0) return false

  const closingIds = new Set(closingTabs.map((tab) => tab.id))
  for (const tab of closingTabs) clearWorkspaceRuntime(tab)

  const activeWasClosed = closingIds.has(activeTabId.value)
  const activeIndex = tabs.value.findIndex((tab) => tab.id === activeTabId.value)
  tabs.value = tabs.value.filter((tab) => !closingIds.has(tab.id))
  if (activeWasClosed) {
    activeTabId.value = tabs.value[activeIndex]?.id
      || tabs.value[activeIndex - 1]?.id
      || ''
  }
  await nextTick()
  return true
}

const getOpenedProjectPaths = () => (
  Array.from(new Set(projectTabs.value.map((tab) => tab.path).filter(Boolean)))
)

const dispatchProjectTerminalFocus = (projectPath) => {
  const request = createProjectTerminalFocusRequest(projectPath)
  if (!request) return
  terminalFocusRequest.value = request
}

const focusProjectTerminal = async ({
  projectPath = '',
  routeType = 'single-project',
  requestId = ''
} = {}) => {
  const opened = await openProjectRoute(
    buildProjectWorkspaceRoute(projectPath, routeType)
  )
  if (!opened) return

  await nextTick()
  dispatchProjectTerminalFocus(projectPath)
  if (terminalFocusRetryTimer != null) {
    window.clearTimeout(terminalFocusRetryTimer)
  }
  terminalFocusRetryTimer = window.setTimeout(() => {
    terminalFocusRetryTimer = null
    dispatchProjectTerminalFocus(projectPath)
  }, 96)
  if (requestId) {
    window.electronAPI?.ackFocusProjectTerminal?.({ requestId })
  }
}

const startTabDrag = (event, tabId) => {
  draggingTabId.value = tabId
  dragOverTabId.value = ''
  event.dataTransfer?.setData('text/plain', tabId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const dropTab = (targetTabId) => {
  const sourceTabId = draggingTabId.value
  if (!sourceTabId || sourceTabId === targetTabId) {
    finishTabDrag()
    return
  }
  const nextTabs = [...tabs.value]
  const sourceIndex = nextTabs.findIndex((tab) => tab.id === sourceTabId)
  const targetIndex = nextTabs.findIndex((tab) => tab.id === targetTabId)
  if (sourceIndex < 0 || targetIndex < 0) {
    finishTabDrag()
    return
  }
  const [movedTab] = nextTabs.splice(sourceIndex, 1)
  nextTabs.splice(targetIndex, 0, movedTab)
  tabs.value = nextTabs
  finishTabDrag()
}

const finishTabDrag = () => {
  draggingTabId.value = ''
  dragOverTabId.value = ''
}

const getTabCodexStatus = (tab) => (
  tab?.kind === 'project' ? getProjectStatus(tab.path) : ''
)

const getCodexStatusTitle = (status) => {
  if (status === 'running') return 'Codex 正在运行'
  if (status === 'awaiting_confirmation') return 'Codex 等待确认'
  if (status === 'ended') return 'Codex 已结束'
  return ''
}

watch(
  () => ({
    activeTabId: activeTabId.value,
    tabIds: tabs.value.map((tab) => tab.id)
  }),
  () => {
    if (workspaceWatchInitialized && !isWorkspaceHydrated) {
      workspaceChangedBeforeHydration = true
    }
    workspaceWatchInitialized = true
    persistTabs()
    reportWorkspaceState()
    emit('project-context-changed', activeProjectSnapshot.value
      ? {
          path: activeProjectSnapshot.value.path,
          routeType: activeProjectSnapshot.value.routeType
        }
      : { path: '', routeType: '' })
    emit('active-tab-changed', activeTab.value
      ? {
          id: activeTab.value.id,
          kind: activeTab.value.kind,
          routeType: activeTab.value.routeType
        }
      : null)
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  removeFocusProjectTerminalListener = window.electronAPI?.onFocusProjectTerminal?.(
    (payload) => void focusProjectTerminal(payload)
  ) || null
  void hydrateWorkspaceTabs()
  reportWorkspaceState()
})

onBeforeUnmount(() => {
  removeFocusProjectTerminalListener?.()
  if (terminalFocusRetryTimer != null) {
    window.clearTimeout(terminalFocusRetryTimer)
    terminalFocusRetryTimer = null
  }
  for (const tab of projectTabs.value) clearWorkspaceRuntime(tab)
  for (const tab of focusTerminalTabs.value) clearWorkspaceRuntime(tab)
  window.electronAPI?.reportWorkspaceRuntimeState?.({
    activeProject: null,
    openProjects: []
  })
})

defineExpose({
  openProjectRoute,
  openRemoteRepo,
  openFocusTerminal,
  openSplitTerminal,
  openBackupManager,
  openThemeManager,
  closeProjectsByPaths,
  getOpenedProjectPaths,
  activateTab
})
</script>

<style scoped>
.project-workspace-host {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--theme-sem-bg-workspace);
}

.workspace-tabs-bar {
  position: relative;
  z-index: 22;
  display: flex;
  height: 40px;
  min-height: 40px;
  flex: 0 0 40px;
  align-items: center;
  gap: 0;
  overflow: visible;
  padding: 0 6px;
  background: var(--theme-comp-child-header-bg);
  -webkit-app-region: no-drag;
}

.workspace-tabs-list {
  display: flex;
  position: relative;
  z-index: 15;
  min-width: 0;
  max-width: calc(100% - 84px);
  height: 100%;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.workspace-tabs-drag-area {
  position: relative;
  z-index: 1;
  min-width: 32px;
  height: 100%;
  flex: 1;
  -webkit-app-region: drag;
}

.workspace-menu-wrap {
  position: relative;
  z-index: 16;
  display: flex;
  height: 100%;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
  margin-left: 6px;
  -webkit-app-region: no-drag;
}

.workspace-menu-trigger {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-sem-text-secondary);
  cursor: pointer;
}

.workspace-menu-trigger:hover,
.workspace-menu-trigger[aria-expanded='true'] {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.workspace-menu {
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 24;
  display: flex;
  width: 178px;
  flex-direction: column;
  gap: 3px;
  padding: 7px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  background: var(--theme-sem-bg-menu);
  box-shadow: 0 18px 42px color-mix(in srgb, black 24%, transparent);
}

.workspace-menu button {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-sem-text-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.workspace-menu button:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.workspace-menu-divider {
  height: 1px;
  margin: 3px 5px;
  background: var(--theme-sem-border-default);
}

.workspace-menu-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
}

.workspace-tab {
  position: relative;
  display: flex;
  width: 200px;
  min-width: 60px;
  height: calc(100% - 8px);
  flex: 0 1 200px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  margin: 4px 0;
  padding: 0 10px 0 12px;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-sem-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  -webkit-app-region: no-drag;
}

.workspace-tab:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-secondary);
}

.workspace-tab.leading-tab {
  padding-left: v-bind(leadingTabInsetCss);
}

.workspace-tab.active {
  z-index: 1;
  background: var(--theme-comp-tab-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
  color: var(--theme-comp-selected-text);
}

.workspace-tab.dragging {
  opacity: 0.3;
}

.workspace-tab.drag-over {
  background: color-mix(in srgb, var(--theme-comp-tab-active-bg) 82%, transparent);
}

.workspace-tab.drag-over::before {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: -1px;
  width: 2px;
  border-radius: 1px;
  background: var(--theme-sem-accent-primary);
  content: '';
}

.workspace-tab-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--theme-sem-text-secondary);
}

.workspace-tab.active .workspace-tab-icon {
  color: var(--theme-comp-selected-text);
}

.workspace-tab-status {
  display: inline-flex;
  flex: 0 0 auto;
  margin-right: 2px;
  border-radius: 999px;
}

.workspace-tab-status.running {
  width: 12px;
  height: 12px;
  border: 2px solid var(--theme-sem-accent-primary-strong);
  border-top-color: transparent;
  box-shadow: 0 0 10px color-mix(in srgb, var(--theme-sem-accent-primary) 42%, transparent);
  animation: workspace-tab-spin 0.8s linear infinite;
}

.workspace-tab-status.awaiting_confirmation {
  width: 10px;
  height: 10px;
  background: var(--theme-sem-accent-danger-strong);
  box-shadow: 0 0 10px color-mix(in srgb, var(--theme-sem-accent-danger) 52%, transparent);
}

.workspace-tab-status.ended {
  width: 10px;
  height: 10px;
  background: var(--theme-sem-accent-success-strong);
  box-shadow: 0 0 10px color-mix(in srgb, var(--theme-sem-accent-success) 44%, transparent);
}

@keyframes workspace-tab-spin {
  to {
    transform: rotate(360deg);
  }
}

.workspace-tab-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--theme-sem-text-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tab:hover .workspace-tab-title {
  color: var(--theme-sem-text-primary);
}

.workspace-tab.active .workspace-tab-title {
  color: var(--theme-comp-selected-text);
}

.workspace-tab-close {
  display: inline-flex;
  position: relative;
  z-index: 25;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--theme-sem-text-muted);
  cursor: pointer;
  opacity: 0.34;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.workspace-tab.active .workspace-tab-close {
  color: var(--theme-sem-text-secondary);
  opacity: 0.56;
}

.workspace-tab:hover .workspace-tab-close {
  opacity: 0.72;
}

.workspace-tab-close:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 92%, transparent);
  color: var(--theme-sem-text-primary);
  opacity: 1;
}

.workspace-tab-content {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.workspace-tab-content > * {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.project-workspace-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--theme-sem-text-muted);
  text-align: center;
}

.project-workspace-empty strong {
  color: var(--theme-sem-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.project-workspace-empty span {
  font-size: 13px;
}
</style>
