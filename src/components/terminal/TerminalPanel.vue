<template>
  <div class="terminal-container" ref="containerRef">
    <div class="terminal-header" :class="{ 'terminal-header--single-pane': singlePaneChrome }">
      <template v-if="!singlePaneChrome">
      <div class="terminal-tabs">
        <template v-if="props.splitOnlyMode">
          <div
            v-for="pane in splitPaneTabs"
            :key="pane.termId"
            class="terminal-tab"
            :class="{ active: pane.termId === activeTermId }"
            @click="focusSplitPane(pane.termId)"
          >
            <TerminalIcon :size="12" />
            <span class="tab-label">{{ pane.label }}</span>
            <button
              v-if="splitPaneTabs.length > 1"
              class="tab-close-btn"
              @mousedown.prevent.stop
              @click.stop="closeSplitPane(pane.termId)"
            >
              <X :size="10" />
            </button>
          </div>
        </template>
        <template v-else>
          <div
            v-for="tab in tabs"
            :key="tab.tabId"
            class="terminal-tab"
            :class="{ active: tab.tabId === activeTabId }"
            @click="switchTab(tab.tabId)"
          >
            <TerminalIcon :size="12" />
            <span class="tab-label">{{ tab.label }}</span>
            <button
              v-if="tabs.length > 1"
              class="tab-close-btn"
              @mousedown.prevent.stop
              @click.stop="closeTab(tab.tabId)"
            >
              <X :size="10" />
            </button>
          </div>
        </template>
        <button
          v-if="!props.splitOnlyMode"
          class="terminal-btn add-btn"
          @mousedown.prevent
          @click="handleAddTerminal"
          title="新建终端"
        >
          <Plus :size="14" />
        </button>
        <!-- 多根目录时显示"在目录中打开"下拉 -->
        <div
          v-if="!props.splitOnlyMode && props.workspaceRoots.length > 1"
          class="terminal-cwd-picker"
          ref="cwdMenuRef"
        >
          <button class="terminal-btn" @mousedown.prevent @click="showCwdMenu = !showCwdMenu" title="在目录中打开终端">
            <FolderOpen :size="13" />
          </button>
          <div v-if="showCwdMenu" class="cwd-dropdown">
            <div
              v-for="root in props.workspaceRoots"
              :key="root.path"
              class="cwd-item"
              @click="addTerminalInDir(root.path, root.name)"
            >
              <span>{{ root.name }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="terminal-actions">
        <template v-if="!props.splitOnlyMode">
        <div v-if="showSearchBar" class="terminal-search" :class="{ 'is-not-found': !searchHasMatch }">
          <SearchIcon :size="13" class="terminal-search-icon" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="terminal-search-input"
            type="text"
            placeholder="搜索终端内容"
            @input="handleSearchInput"
            @keydown="handleSearchKeydown"
          />
          <button class="terminal-search-btn" @mousedown.prevent.stop @click="findPreviousMatch" title="上一条">
            <ChevronUp :size="12" />
          </button>
          <button class="terminal-search-btn" @mousedown.prevent.stop @click="findNextMatch" title="下一条">
            <ChevronDown :size="12" />
          </button>
          <button class="terminal-search-btn close" @mousedown.prevent.stop @click="closeSearchBar" title="关闭搜索">
            <X :size="12" />
          </button>
        </div>
        <span v-else class="terminal-path terminal-path--ellipsis-start" :title="currentCwd || ''">
          <span class="terminal-path__ltr">{{ pathDisplay }}</span>
        </span>
        <button class="terminal-btn terminal-btn-split" @mousedown.prevent @click="splitActiveTerminal('row')" title="水平分屏">
          <svg
            class="split-btn-icon split-horizontal"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect x="1" y="1" width="6" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <rect x="9" y="1" width="6" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="terminal-btn terminal-btn-split" @mousedown.prevent @click="splitActiveTerminal('column')" title="垂直分屏">
          <svg
            class="split-btn-icon split-vertical"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect x="1" y="1" width="14" height="6" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <rect x="1" y="9" width="14" height="6" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="terminal-btn" @mousedown.prevent @click="clearTerminal" title="清屏">
          <Eraser :size="14" />
        </button>
        <button class="terminal-btn" @mousedown.prevent @click="restartTerminal(getProjectRootCwd() || null)" title="重启终端">
          <RefreshCw :size="14" />
        </button>
        </template>
        <template v-else>
          <button class="terminal-btn terminal-btn-split" @mousedown.prevent @click="splitActiveTerminal('row')" title="水平分屏">
            <svg
              class="split-btn-icon split-horizontal"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect x="1" y="1" width="6" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <rect x="9" y="1" width="6" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          <button class="terminal-btn terminal-btn-split" @mousedown.prevent @click="splitActiveTerminal('column')" title="垂直分屏">
            <svg
              class="split-btn-icon split-vertical"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect x="1" y="1" width="14" height="6" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <rect x="1" y="9" width="14" height="6" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </template>
      </div>
      </template>
      <template v-else>
        <div class="terminal-path terminal-path--single-pane" :title="singlePaneChromeTooltip">
          <span class="terminal-path__title">{{ tabTitlePart }}</span>
          <template v-if="pathDisplay">
            <span class="terminal-path__sep" aria-hidden="true">·</span>
            <div class="terminal-path__cwd terminal-path--ellipsis-start">
              <span class="terminal-path__ltr">{{ pathDisplay }}</span>
            </div>
          </template>
        </div>
        <div class="terminal-actions terminal-actions--single-pane">
          <button class="terminal-btn" @mousedown.prevent @click="clearTerminal" title="清屏">
            <Eraser :size="14" />
          </button>
          <button class="terminal-btn" @mousedown.prevent @click="restartTerminal(getProjectRootCwd() || null)" title="重启终端">
            <RefreshCw :size="14" />
          </button>
          <button
            v-if="showCloseButton"
            class="terminal-btn"
            type="button"
            @mousedown.prevent.stop
            @click="emit('close')"
            title="关闭此终端"
          >
            <X :size="14" />
          </button>
        </div>
      </template>
    </div>
    <div
      class="terminal-body"
      :class="{ 'drag-over': isDragOverTerminal }"
      ref="terminalBodyRef"
      @dragover.prevent="handleTerminalDragOver"
      @dragleave="handleTerminalDragLeave"
      @drop.prevent="handleTerminalDrop"
    >
      <TerminalSplitNode
        v-if="activeTab?.layout"
        :node="activeTab.layout"
        :active-term-id="activeTermId"
        :pane-title-resolver="getPaneTitle"
        :pane-cwd-resolver="getPaneCwd"
        :liquid-style="props.splitOnlyMode"
        :closable="activeTabTermIds.length > 1"
        :show-pane-topbar="props.splitOnlyMode ? true : activeTabTermIds.length > 1"
        :dragging-term-id="draggingPaneTermId"
        :drop-target-term-id="dropTargetPaneTermId"
        @pane-element-change="handlePaneElementChange"
        @pane-focus="focusSplitPane"
        @pane-close="closeSplitPane"
        @pane-clear="clearTerminalById"
        @pane-restart="restartTerminalById"
        @pane-drop="handleTerminalDrop"
        @start-resize="startResizeDrag"
        @pane-drag-start="handlePaneDragStart"
        @pane-drag-end="handlePaneDragEnd"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { Terminal as TerminalIcon, Eraser, RefreshCw, Plus, X, FolderOpen, Search as SearchIcon, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTerminalRouter } from '../../composables/useTerminalRouter'
import { buildDropPayload } from './terminalInteractions.mjs'
import { shouldCreateInitialTerminal } from './terminalInitialBootstrap.mjs'
import { XTERM_OPTS } from './terminalXtermOptions.mjs'
import { isBufferViewportAtBottom } from './terminalViewportState.mjs'
import { scheduleViewportRevealSync, cancelViewportRevealSync } from './terminalViewportSync.mjs'
import TerminalSplitNode from './TerminalSplitNode.vue'
import '@xterm/xterm/css/xterm.css'

const emit = defineEmits(['close', 'pane-title'])

const props = defineProps({
  defaultCwd: { type: String, default: '' },
  /** 若设置，则仅用于终端快照 localStorage 键，与 cwd 解耦；多 TerminalPanel 实例（如聚焦页）须各设不同值以免共用 __standalone__ */
  snapshotCacheKey: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  workspaceRoots: { type: Array, default: () => [] },
  /** 独立终端页（about:terminal）无项目路径时仍自动建第一个会话，cwd 由主进程回退到用户目录 */
  allowFirstTerminalWithoutCwd: { type: Boolean, default: false },
  /** 聚焦堆叠页：仅单会话条，不显示 Tab/分屏，顶栏展示 cwd */
  singlePaneChrome: { type: Boolean, default: false },
  /** 聚焦多终端：当前格是否为键盘焦点（isActive 表示标签页是否在前台，二者分离） */
  focusPaneFocused: { type: Boolean, default: true },
  /** 灵动终端壳层动画期间，冻结内部 ResizeObserver，避免大缓冲区终端每帧重排 */
  suspendSinglePaneResize: { type: Boolean, default: false },
  /** 与 singlePaneChrome 配合：显示关闭（由父级移除该面板） */
  showCloseButton: { type: Boolean, default: false },
  /** 分屏独立页：禁用“新建终端/目录新建”，只能通过 split 新增会话 */
  splitOnlyMode: { type: Boolean, default: false }
})

const containerRef = ref(null)
const terminalBodyRef = ref(null)
const tabs = ref([])
const activeTabId = ref(null)
const terminals = ref([])
const activeTermId = ref(null)
const terminalCache = new Map()
const paneElements = new Map()
const showCwdMenu = ref(false)
const cwdMenuRef = ref(null)
const showSearchBar = ref(false)
const isDragOverTerminal = ref(false)
const searchQuery = ref('')
const searchHasMatch = ref(true)
const searchInputRef = ref(null)
const resizeDragState = ref(null)
const draggingPaneTermId = ref('')
const dropTargetPaneTermId = ref('')
const pendingPaneDrag = ref(null)
let paneDragPreviewEl = null
let ensureDefaultPromise = null
let persistSnapshotTimer = null
let hasRestoredInitialSnapshot = false
const locallyClosedPtyIds = new Set()

const TERMINAL_SNAPSHOT_PREFIX = 'terminalSnapshot_v1_'
const TERMINAL_SNAPSHOT_MAX_LINES = 1200
const TERMINAL_DISK_PERSISTENCE_ENABLED = false
const TERMINAL_RESTORE_NOTICE = '\r\n\x1b[33m已恢复上次终端内容，新的终端会话已创建。\x1b[0m\r\n'
const TERMINAL_RESTORE_EXITED_NOTICE = '\r\n\x1b[33m已恢复上次终端内容，原终端会话已结束。\x1b[0m\r\n'
const SPLIT_RATIO_MIN = 0.15
const SPLIT_RATIO_MAX = 0.85
const PROGRAMMATIC_FOCUS_SIGINT_GUARD_MS = 160
const handleDocumentClick = (event) => {
  if (cwdMenuRef.value && !cwdMenuRef.value.contains(event.target)) {
    showCwdMenu.value = false
  }
}

const { register, unregister } = useTerminalRouter()
const TERMINAL_DROP_HANDLED = '__open_git_terminal_drop_handled__'

function normalizeIncomingPath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  let s = raw.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* 保持 s */
  }
  // 与主进程一致：file URL → 本地路径（否则 path 传到主进程后 isAbsolute 为 false）
  if (/^file:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname
      if (s.startsWith('/') && /^\/[A-Za-z]:/.test(s)) {
        s = s.slice(1)
      }
    } catch {
      return raw.trim()
    }
  }
  return s
}

/** 项目根目录快照：与 props 同步，不依赖 terminals[0] 是否已创建/是否已拿到 resolvedCwd（避免连点第二个终端时 cwd 为空） */
const projectRootRef = ref('')
watch(
  () => props.defaultCwd,
  (v) => {
    projectRootRef.value = normalizeIncomingPath(v || '')
  },
  { immediate: true }
)

const findTabById = (id) => tabs.value.find(t => t.tabId === id)
const findTerminalById = (id) => terminals.value.find(t => t.termId === id)
let layoutNodeSeed = 0

const clampSplitRatio = (ratio) => {
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio))
}

const nextLayoutNodeId = () => {
  layoutNodeSeed += 1
  return `layout-${Date.now()}-${layoutNodeSeed}`
}

const createLeafNode = (termId = '') => ({
  nodeId: nextLayoutNodeId(),
  type: 'leaf',
  termId
})

const createSplitNode = (direction = 'row', left = null, right = null, ratio = 0.5) => ({
  nodeId: nextLayoutNodeId(),
  type: 'split',
  direction: direction === 'column' ? 'column' : 'row',
  ratio: clampSplitRatio(ratio),
  children: [left, right].filter(Boolean)
})

const cloneLayoutNode = (node) => {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'leaf') {
    return {
      nodeId: node.nodeId || nextLayoutNodeId(),
      type: 'leaf',
      termId: node.termId || ''
    }
  }
  const children = Array.isArray(node.children) ? node.children.map(child => cloneLayoutNode(child)).filter(Boolean) : []
  return {
    nodeId: node.nodeId || nextLayoutNodeId(),
    type: 'split',
    direction: node.direction === 'column' ? 'column' : 'row',
    ratio: clampSplitRatio(Number(node.ratio)),
    children
  }
}

const collectLayoutTermIds = (node, output = []) => {
  if (!node) return output
  if (node.type === 'leaf') {
    if (node.termId) output.push(node.termId)
    return output
  }
  for (const child of node.children || []) {
    collectLayoutTermIds(child, output)
  }
  return output
}

const collectLayoutLeafBindings = (node, output = []) => {
  if (!node) return output
  if (node.type === 'leaf') {
    if (node.nodeId && node.termId) {
      output.push({
        nodeId: node.nodeId,
        termId: node.termId
      })
    }
    return output
  }
  for (const child of node.children || []) {
    collectLayoutLeafBindings(child, output)
  }
  return output
}

const buildLayoutFromTermIds = (termIds = [], split = false) => {
  const ids = [...new Set((Array.isArray(termIds) ? termIds : []).filter(Boolean))]
  if (!ids.length) return null
  if (ids.length === 1) return createLeafNode(ids[0])
  let layout = createSplitNode(
    split ? 'row' : 'row',
    createLeafNode(ids[0]),
    createLeafNode(ids[1]),
    0.5
  )
  for (let index = 2; index < ids.length; index += 1) {
    layout = createSplitNode('row', layout, createLeafNode(ids[index]), 0.65)
  }
  return layout
}

const ensureTabLayout = (tab) => {
  if (!tab) return null
  if (tab.layout) {
    tab.layout = cloneLayoutNode(tab.layout)
  } else {
    tab.layout = buildLayoutFromTermIds(tab.termIds, tab.split)
  }
  if (!Array.isArray(tab.termIds) || tab.termIds.length !== collectLayoutTermIds(tab.layout).length) {
    tab.termIds = collectLayoutTermIds(tab.layout)
  }
  return tab.layout
}

const syncTabTermIds = (tab) => {
  if (!tab) return []
  tab.termIds = collectLayoutTermIds(tab.layout)
  return tab.termIds
}

const replaceLeafWithSplit = (node, targetTermId, direction, newTermId) => {
  if (!node) return null
  if (node.type === 'leaf') {
    if (node.termId !== targetTermId) return node
    return createSplitNode(
      direction,
      createLeafNode(node.termId),
      createLeafNode(newTermId),
      0.5
    )
  }
  node.children = (node.children || []).map(child => replaceLeafWithSplit(child, targetTermId, direction, newTermId)).filter(Boolean)
  return node
}

const removeLeafFromLayout = (node, targetTermId) => {
  if (!node) return null
  if (node.type === 'leaf') {
    return node.termId === targetTermId ? null : node
  }

  const children = (node.children || []).map(child => removeLeafFromLayout(child, targetTermId)).filter(Boolean)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  node.children = children
  node.ratio = clampSplitRatio(Number(node.ratio))
  return node
}

const findLayoutNodeById = (node, nodeId) => {
  if (!node || !nodeId) return null
  if (node.nodeId === nodeId) return node
  if (node.type !== 'split') return null
  for (const child of node.children || []) {
    const found = findLayoutNodeById(child, nodeId)
    if (found) return found
  }
  return null
}

const swapLayoutLeafTermIds = (node, leftTermId, rightTermId) => {
  if (!node) return
  if (node.type === 'leaf') {
    if (node.termId === leftTermId) {
      node.termId = rightTermId
    } else if (node.termId === rightTermId) {
      node.termId = leftTermId
    }
    return
  }
  for (const child of node.children || []) {
    swapLayoutLeafTermIds(child, leftTermId, rightTermId)
  }
}

const getPaneTitle = (termId) => {
  const term = findTerminalById(termId)
  if (!term) return '终端'
  const runtimeTitle = typeof term.title === 'string' ? term.title.trim() : ''
  if (runtimeTitle) return runtimeTitle
  const cwd = normalizeIncomingPath(term.cwd || '')
  const name = cwd ? cwd.split('/').filter(Boolean).pop() : ''
  return name || '终端'
}

const getPaneCwd = (termId) => {
  const term = findTerminalById(termId)
  if (!term) return ''
  return normalizeIncomingPath(term.cwd || '')
}

const createPaneDragPreview = (termId) => {
  const sourcePane = document.querySelector(`[data-pane-root-term-id="${termId}"]`)
  if (!sourcePane) return null
  const clone = sourcePane.cloneNode(true)
  clone.style.position = 'fixed'
  clone.style.pointerEvents = 'none'
  clone.style.margin = '0'
  clone.style.zIndex = '999999'
  clone.style.opacity = '0.94'
  clone.style.transform = 'scale(0.88)'
  clone.style.transformOrigin = 'top left'
  clone.style.boxShadow = '0 18px 44px rgba(0, 0, 0, 0.42)'
  clone.style.backdropFilter = 'blur(2px)'
  clone.style.transition = 'none'
  document.body.appendChild(clone)
  return clone
}

const destroyPaneDragPreview = () => {
  if (!paneDragPreviewEl) return
  paneDragPreviewEl.remove()
  paneDragPreviewEl = null
}

const updatePaneDragPreviewPosition = (clientX, clientY) => {
  const drag = pendingPaneDrag.value
  if (!drag || !paneDragPreviewEl) return
  paneDragPreviewEl.style.width = `${drag.rect.width}px`
  paneDragPreviewEl.style.height = `${drag.rect.height}px`
  paneDragPreviewEl.style.left = `${clientX - drag.offsetX}px`
  paneDragPreviewEl.style.top = `${clientY - drag.offsetY}px`
}

const resolvePaneDropTargetTermId = (clientX, clientY) => {
  const targetNode = document.elementFromPoint(clientX, clientY)
  const paneRoot = targetNode?.closest?.('[data-pane-root-term-id]')
  const termId = paneRoot?.getAttribute?.('data-pane-root-term-id') || ''
  if (!termId || termId === draggingPaneTermId.value) return ''
  return termId
}

const activeTab = computed(() => findTabById(activeTabId.value))
const activeTabTermIds = computed(() => activeTab.value?.termIds || [])
const splitPaneTabs = computed(() => {
  return activeTabTermIds.value.map((termId, index) => ({
    termId,
    label: (() => {
      const term = findTerminalById(termId)
      const runtimeTitle = typeof term?.title === 'string' ? term.title.trim() : ''
      return runtimeTitle || `终端 ${index + 1}`
    })()
  }))
})
const currentTerminal = computed(() => {
  const current = findTerminalById(activeTermId.value)
  if (current) return current
  const firstId = activeTabTermIds.value[0]
  return firstId ? findTerminalById(firstId) : null
})

const currentCwd = computed(() => {
  const cwd = currentTerminal.value?.cwd || props.defaultCwd || ''
  if (typeof cwd !== 'string') {
    console.error('[TerminalPanel] currentCwd is not a string:', cwd, 'defaultCwd:', props.defaultCwd, 'term.cwd:', currentTerminal.value?.cwd)
    return ''
  }
  return cwd
})

/** 顶栏展示完整 cwd；过长时由 CSS 从左侧省略（保留末尾路径段） */
const pathDisplay = computed(() => {
  const p = currentCwd.value
  if (!p || !String(p).trim()) return ''
  return String(p).trim()
})

/** 与 Tab 一致：主进程/Shell 上报的标题（onTitleChange 写入 tab.label） */
const tabTitlePart = computed(() => {
  const tab = activeTab.value
  const label = tab?.label
  if (typeof label === 'string' && label.trim()) return label.trim()
  return '终端'
})

const singlePaneChromeTooltip = computed(() => {
  const t = tabTitlePart.value
  const p = pathDisplay.value
  if (p) return `${t} · ${p}`
  return t
})

watch(
  tabTitlePart,
  (title) => {
    if (props.singlePaneChrome) emit('pane-title', title)
  },
  { immediate: true }
)

const SEARCH_OPTIONS = {
  decorations: {
    matchBackground: '#334155',
    matchBorder: '#475569',
    matchOverviewRuler: '#475569',
    activeMatchBackground: '#0e7490',
    activeMatchBorder: '#67e8f9',
    activeMatchColorOverviewRuler: '#22d3ee'
  }
}

const markPtyClosedLocally = (ptyId) => {
  if (!ptyId || typeof ptyId !== 'string') return
  locallyClosedPtyIds.add(ptyId)
  window.setTimeout(() => {
    locallyClosedPtyIds.delete(ptyId)
  }, 6000)
}

const destroyPtySilently = async (ptyId) => {
  if (!ptyId) return
  markPtyClosedLocally(ptyId)
  await window.electronAPI.terminal.destroy({ id: ptyId }).catch(() => {})
}

const armProgrammaticFocusSigintGuard = (term) => {
  if (!term) return
  term._programmaticFocusSigintGuardUntil = performance.now() + PROGRAMMATIC_FOCUS_SIGINT_GUARD_MS
}

// ---- 终端实例管理 ----

const createXterm = () => {
  const el = document.createElement('div')
  el.style.cssText = 'width:100%;height:100%;display:none;overflow:hidden;'

  const xterm = new Terminal(XTERM_OPTS)
  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  xterm.loadAddon(fitAddon)
  xterm.loadAddon(searchAddon)
  xterm.loadAddon(new WebLinksAddon((event, uri) => {
    event?.preventDefault?.()
    const normalizedUri = typeof uri === 'string' ? uri.trim() : ''
    if (!/^https?:\/\//i.test(normalizedUri)) return

    if (window.electronAPI?.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(normalizedUri)
      return
    }

    window.open(normalizedUri, '_blank', 'noopener,noreferrer')
  }))
  xterm.open(el)

  return { xterm, fitAddon, searchAddon, el }
}

const handleTerminalDragOver = () => {
  isDragOverTerminal.value = true
}

const handleTerminalDragLeave = (event) => {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  isDragOverTerminal.value = false
}

const collectDroppedFilePaths = (event) => {
  const itemPaths = Array.from(event.dataTransfer?.items || [])
    .map(item => {
      if (!item || item.kind !== 'file') return ''
      const file = item.getAsFile?.()
      if (!file) return ''
      if (window.electronAPI?.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || ''
      }
      return file?.path || ''
    })
    .filter(path => typeof path === 'string' && path.trim())
    .map(path => path.trim())

  if (itemPaths.length > 0) return itemPaths

  const files = Array.from(event.dataTransfer?.files || [])
  const paths = files
    .map(file => {
      if (!file) return ''
      if (window.electronAPI?.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || ''
      }
      return file?.path || ''
    })
    .filter(path => typeof path === 'string' && path.trim())

  if (paths.length > 0) return paths

  const uriList = event.dataTransfer?.getData('text/uri-list') || ''
  if (!uriList.trim()) return []

  return uriList
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      if (!/^file:\/\//i.test(line)) return ''
      try {
        const url = new URL(line)
        return decodeURIComponent(url.pathname || '')
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .map(path => path.trim())
}

const collectTextPlainPaths = (event) => {
  const plain = event.dataTransfer?.getData('text/plain') || ''
  if (!plain.trim()) return []

  return plain
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      if (/^file:\/\//i.test(line)) {
        try {
          const url = new URL(line)
          return decodeURIComponent(url.pathname || '').trim()
        } catch {
          return ''
        }
      }
      if (line.startsWith('/')) return line
      return ''
    })
    .filter(Boolean)
}

const handleTerminalDrop = (event, targetTermId = null) => {
  if (event?.[TERMINAL_DROP_HANDLED]) return
  if (event && typeof event === 'object') {
    event[TERMINAL_DROP_HANDLED] = true
  }
  isDragOverTerminal.value = false
  const term = targetTermId ? findTerminalById(targetTermId) : currentTerminal.value
  if (!term?.ptyId || !term.connected) return

  const droppedPaths = collectDroppedFilePaths(event)
  const paths = droppedPaths.length > 0 ? droppedPaths : collectTextPlainPaths(event)
  const payload = buildDropPayload(paths)
  if (!payload) return

  activeTermId.value = term.termId
  term.hasUserInput = true
  window.electronAPI.terminal.write({ id: term.ptyId, data: `${payload} ` })
  refreshVisibleTerminal(term, true)
}

const resolveDropTargetTermId = (event) => {
  const tabTermIds = activeTabTermIds.value
  if (!tabTermIds.length) return null

  const targetNode = document.elementFromPoint(event.clientX, event.clientY)
  const targetPane = targetNode?.closest?.('[data-term-id]')
  if (targetPane?.dataset?.termId) {
    return targetPane.dataset.termId
  }
  return activeTermId.value || tabTermIds[0] || null
}

const isEventInsideTerminal = (event) => {
  if (!containerRef.value) return false
  const rect = containerRef.value.getBoundingClientRect()
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

const handleGlobalDragOver = (event) => {
  if (!isEventInsideTerminal(event)) return
  event.preventDefault()
  event.stopPropagation()
  isDragOverTerminal.value = true
}

const handleGlobalDrop = (event) => {
  if (!isEventInsideTerminal(event)) return
  event.preventDefault()
  event.stopPropagation()
  const targetTermId = resolveDropTargetTermId(event)
  handleTerminalDrop(event, targetTermId)
}

const bindTerminalDropEvents = (term) => {
  if (!term?.el) return

  const onDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
    handleTerminalDragOver(event)
  }

  const onDragLeave = (event) => {
    event.stopPropagation()
    handleTerminalDragLeave(event)
  }

  const onDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    handleTerminalDrop(event, term.termId)
  }

  term._dropHandlers = { onDragOver, onDragLeave, onDrop }
  term.el.addEventListener('dragover', onDragOver, true)
  term.el.addEventListener('dragleave', onDragLeave, true)
  term.el.addEventListener('drop', onDrop, true)
}

const unbindTerminalDropEvents = (term) => {
  if (!term?.el || !term?._dropHandlers) return
  const { onDragOver, onDragLeave, onDrop } = term._dropHandlers
  term.el.removeEventListener('dragover', onDragOver, true)
  term.el.removeEventListener('dragleave', onDragLeave, true)
  term.el.removeEventListener('drop', onDrop, true)
  term._dropHandlers = null
}

const nextIndex = () => {
  const used = new Set(terminals.value.map(t => t._termIndex))
  for (let i = 1; ; i++) { if (!used.has(i)) return i }
}
const nextTabIndex = () => {
  const used = new Set(tabs.value.map(t => t._tabIndex))
  for (let i = 1; ; i++) { if (!used.has(i)) return i }
}

const getProjectRootCwd = () => {
  if (projectRootRef.value) return projectRootRef.value
  return normalizeIncomingPath(props.defaultCwd)
}

/** 新建终端默认使用当前项目根目录，避免缓存会话把 cwd 带偏 */
const getBaseCwd = () => {
  const projectRoot = getProjectRootCwd()
  if (projectRoot) return projectRoot
  const active = currentTerminal.value
  if (active && typeof active.cwd === 'string' && active.cwd.trim()) return active.cwd.trim()
  const first = terminals.value[0]
  if (first && typeof first.cwd === 'string' && first.cwd.trim()) return first.cwd.trim()
  return ''
}

const normalizeRequestedCwd = (cwdOverride) => {
  if (typeof cwdOverride !== 'string') return ''
  return normalizeIncomingPath(cwdOverride)
}

const mountTermToPane = (term, paneEl) => {
  if (!term || !paneEl) return
  if (term.el.parentNode !== paneEl) {
    paneEl.appendChild(term.el)
  }
  term.el.style.display = ''
}

const rememberVisibleTerminalViewportState = () => {
  for (const term of terminals.value) {
    if (term.el.style.display === 'none') continue
    term.restoreViewportToBottom = isBufferViewportAtBottom(term.xterm?.buffer)
  }
}

const handlePaneElementChange = ({ nodeId, el }) => {
  if (!nodeId) return
  if (el) {
    paneElements.set(nodeId, el)
    return
  }
  paneElements.delete(nodeId)
}

const refreshActiveTabTerminals = (focusActive = false) => {
  for (const termId of activeTabTermIds.value) {
    const term = findTerminalById(termId)
    if (!term) continue
    refreshVisibleTerminal(term, focusActive && term.termId === activeTermId.value)
  }
}

const applyLayout = (focusActive = true) => {
  rememberVisibleTerminalViewportState()
  nextTick(() => {
    const leafBindings = collectLayoutLeafBindings(activeTab.value?.layout)
    // 聚焦多终端页：每面板仅一个 PTY + 单叶布局。若仍走「先全部 display:none 再挂回」，
    // 每次焦点切换 / flex 动画触发 resize 都会闪一下，像整屏重启。
    const fastSinglePane =
      props.singlePaneChrome &&
      leafBindings.length === 1 &&
      terminals.value.length === 1 &&
      leafBindings[0].termId === terminals.value[0].termId
    if (fastSinglePane) {
      const { nodeId, termId } = leafBindings[0]
      const term = findTerminalById(termId)
      const paneEl = paneElements.get(nodeId)
      if (term && paneEl) {
        mountTermToPane(term, paneEl)
        refreshVisibleTerminal(term, focusActive && term.termId === activeTermId.value)
        return
      }
    }

    for (const t of terminals.value) {
      t.el.style.display = 'none'
    }

    for (const { nodeId, termId } of leafBindings) {
      const term = findTerminalById(termId)
      const paneEl = paneElements.get(nodeId)
      if (!term || !paneEl) continue
      mountTermToPane(term, paneEl)
    }

    refreshActiveTabTerminals(focusActive)
  })
}

const stopResizeDrag = () => {
  if (!resizeDragState.value) return
  resizeDragState.value = null
  window.removeEventListener('mousemove', handleResizeDrag)
  window.removeEventListener('mouseup', stopResizeDrag)
  schedulePersistedSnapshot()
}

const handleResizeDrag = (event) => {
  const state = resizeDragState.value
  if (!state) return
  const tab = findTabById(state.tabId)
  const node = findLayoutNodeById(tab?.layout, state.nodeId)
  if (!tab || !node || node.type !== 'split') {
    stopResizeDrag()
    return
  }

  const axisSize = state.direction === 'column' ? state.rect.height : state.rect.width
  if (!axisSize || axisSize <= 0) return

  const delta = state.direction === 'column'
    ? event.clientY - state.startClientY
    : event.clientX - state.startClientX
  const nextRatio = clampSplitRatio(state.startRatio + (delta / axisSize))
  if (Math.abs((node.ratio || 0.5) - nextRatio) < 0.001) return

  node.ratio = nextRatio
  refreshActiveTabTerminals(false)
}

const startResizeDrag = ({ nodeId, direction, rect, startClientX, startClientY }) => {
  const tab = activeTab.value
  const node = findLayoutNodeById(tab?.layout, nodeId)
  if (!tab || !node || node.type !== 'split') return

  stopResizeDrag()
  resizeDragState.value = {
    tabId: tab.tabId,
    nodeId,
    direction: direction === 'column' ? 'column' : 'row',
    rect,
    startClientX,
    startClientY,
    startRatio: clampSplitRatio(Number(node.ratio))
  }
  window.addEventListener('mousemove', handleResizeDrag)
  window.addEventListener('mouseup', stopResizeDrag)
}

const addTerminal = async (cwdOverride = null, options = {}) => {
  const {
    autoSwitch = true,
    tabId = null,
    initialTermId = '',
    initialTermIndex = null,
    restoredBufferText = '',
    restoredConnected = true,
    restoredHasUserInput = false,
    restoredNotice = ''
  } = options
  let targetTab = tabId ? findTabById(tabId) : null
  if (!targetTab) {
    const tabIndex = nextTabIndex()
    targetTab = {
      tabId: `tab-${Date.now()}-${tabIndex}`,
      label: `终端 ${tabIndex}`,
      _tabIndex: tabIndex,
      layout: null,
      termIds: []
    }
    tabs.value.push(targetTab)
  } else {
    ensureTabLayout(targetTab)
  }

  const idx = Number.isInteger(initialTermIndex) && initialTermIndex > 0 ? initialTermIndex : nextIndex()
  const termId = initialTermId || `term-${Date.now()}-${idx}`
  const explicitCwd = normalizeRequestedCwd(cwdOverride)
  let rawCwd = explicitCwd
    ? explicitCwd
    : getBaseCwd()
  if (!props.allowFirstTerminalWithoutCwd && (!rawCwd || !String(rawCwd).trim())) {
    rawCwd = getProjectRootCwd()
  }
  const cwd = typeof rawCwd === 'string' ? String(rawCwd).trim() : ''
  const { xterm, fitAddon, searchAddon, el } = createXterm()

  if (!props.allowFirstTerminalWithoutCwd && !cwd) {
    xterm.write('\r\n\x1b[31m无法创建终端：项目目录未就绪，请稍后重试\x1b[0m\r\n')
    try { xterm.dispose() } catch (e) {}
    el.remove()
    return null
  }

  const term = {
    termId,
    _termIndex: idx,
    tabId: targetTab.tabId,
    cwd,
    xterm,
    fitAddon,
    searchAddon,
    el,
    connected: false,
    ptyId: null,
    title: '',
    hasUserInput: restoredHasUserInput,
    restoreViewportToBottom: true,
    viewportDirtyWhileHidden: false,
    _programmaticFocusSigintGuardUntil: 0,
    _viewportRevealTimerId: null,
    _dropHandlers: null,
    _focusCleanup: null
  }

  bindTerminalDropEvents(term)

  if (restoredBufferText) {
    xterm.write(restoredBufferText)
    if (restoredNotice) {
      xterm.write(restoredNotice)
    } else if (restoredConnected) {
      xterm.write(TERMINAL_RESTORE_NOTICE)
    }
  }

  xterm.onData((data) => {
    if (
      props.singlePaneChrome &&
      data === '\x03' &&
      performance.now() <= (term._programmaticFocusSigintGuardUntil || 0)
    ) {
      term._programmaticFocusSigintGuardUntil = 0
      return
    }
    term._programmaticFocusSigintGuardUntil = 0
    if (term.ptyId && term.connected) {
      term.hasUserInput = true
      window.electronAPI.terminal.write({ id: term.ptyId, data })
      schedulePersistedSnapshot()
    }
  })
  xterm.onResize(({ cols, rows }) => {
    if (term.ptyId && term.connected) {
      // 聚焦多终端：fit 会触发 onResize，与 viewport 同步里的 resize 重复打 PTY，shell 会疯狂重绘提示符
      if (props.singlePaneChrome) return
      window.electronAPI.terminal.resize({ id: term.ptyId, cols, rows })
    }
  })
  term._focusCleanup = bindTerminalFocusTracking(term, xterm)

  if (restoredConnected) {
    if (!window.electronAPI?.terminal?.create) {
      xterm.write('\r\n\x1b[31m终端创建失败：终端接口不可用\x1b[0m\r\n')
      return termId
    }

    const createCandidates = []
    const normalizedCwd = props.allowFirstTerminalWithoutCwd ? (cwd || undefined) : cwd
    if (typeof normalizedCwd === 'string' && normalizedCwd.trim()) {
      createCandidates.push(normalizedCwd)
    }
    createCandidates.push(undefined)

    let createResult = null
    for (const candidate of createCandidates) {
      try {
        createResult = await window.electronAPI.terminal.create({
          id: termId,
          cwd: candidate
        })
      } catch {
        createResult = null
      }
      if (createResult?.success) break
    }

    if (createResult?.success) {
      term.ptyId = createResult.id
      term._lastPtySig = undefined
      if (createResult.resolvedCwd && typeof createResult.resolvedCwd === 'string') {
        term.cwd = createResult.resolvedCwd
      }
      term.connected = true
    } else {
      xterm.write('\r\n\x1b[31m终端创建失败: ' + (createResult?.error || 'unknown') + '\x1b[0m\r\n')
    }
  }

  terminals.value.push(term)
  if (!targetTab.termIds.includes(termId)) {
    targetTab.termIds.push(termId)
  }
  if (!targetTab.layout) {
    targetTab.layout = createLeafNode(termId)
    syncTabTermIds(targetTab)
  }
  if (autoSwitch || !activeTermId.value) {
    activeTabId.value = targetTab.tabId
    activeTermId.value = termId
    applyLayout(true)
  } else {
    applyLayout(false)
  }
  schedulePersistedSnapshot()
  return termId
}

const handleAddTerminal = async () => {
  await addTerminal(getProjectRootCwd() || null)
}

const addTerminalInDir = async (cwd, label) => {
  showCwdMenu.value = false
  await addTerminal(cwd)
}

const canMeasureTerminal = () => {
  if (!containerRef.value) return false
  // 灵动终端：只有当前聚焦 pane 需要做真实 reflow，未聚焦 pane 只保留容器动画。
  if (!props.isActive && !props.singlePaneChrome) return false
  const rect = containerRef.value.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** 聚焦页：动画每帧 fit 若每帧都对 PTY resize，SIGWINCH 过密会像连按回车 */
let singlePanePtyResizeTimer = null
let lastSinglePanePtyResizeAt = 0
const SINGLE_PANE_PTY_RESIZE_MIN_GAP_MS = 90

/** 非聚焦面板：不向 PTY 每帧打 resize（Vim 会刷满 ~）。仅在尺寸稳定后补一次，窗口缩放也能跟上 */
let deferredSinglePanePtyTimer = null
const SINGLE_PANE_UNFOCUSED_PTY_DEBOUNCE_MS = 340

const clearDeferredSinglePanePtyResize = () => {
  if (deferredSinglePanePtyTimer) {
    clearTimeout(deferredSinglePanePtyTimer)
    deferredSinglePanePtyTimer = null
  }
}

/** 与上次发给 PTY 的尺寸相同则跳过，避免重复 SIGWINCH / Vim 刷 ~ */
function applySinglePanePtyResizeIfChanged(term) {
  if (!term?.ptyId || !term.connected) return
  const cols = term.xterm?.cols
  const rows = term.xterm?.rows
  if (!cols || !rows) return
  const sig = `${cols}x${rows}`
  if (term._lastPtySig === sig) return
  term._lastPtySig = sig
  window.electronAPI.terminal.resize({ id: term.ptyId, cols, rows })
}

const scheduleDeferredSinglePanePtyResize = (term) => {
  clearDeferredSinglePanePtyResize()
  deferredSinglePanePtyTimer = window.setTimeout(() => {
    deferredSinglePanePtyTimer = null
    applySinglePanePtyResizeIfChanged(term)
  }, SINGLE_PANE_UNFOCUSED_PTY_DEBOUNCE_MS)
}

const throttleSinglePanePtyResize = (term) => {
  const apply = () => {
    applySinglePanePtyResizeIfChanged(term)
    lastSinglePanePtyResizeAt = Date.now()
  }
  const now = Date.now()
  if (lastSinglePanePtyResizeAt === 0 || now - lastSinglePanePtyResizeAt >= SINGLE_PANE_PTY_RESIZE_MIN_GAP_MS) {
    if (singlePanePtyResizeTimer) {
      clearTimeout(singlePanePtyResizeTimer)
      singlePanePtyResizeTimer = null
    }
    apply()
    return
  }
  if (singlePanePtyResizeTimer) clearTimeout(singlePanePtyResizeTimer)
  singlePanePtyResizeTimer = window.setTimeout(() => {
    singlePanePtyResizeTimer = null
    apply()
  }, SINGLE_PANE_PTY_RESIZE_MIN_GAP_MS - (now - lastSinglePanePtyResizeAt))
}

const refreshVisibleTerminal = (term, focus = true) => {
  if (!term) return
  if (props.singlePaneChrome && !props.focusPaneFocused) {
    term.restoreViewportToBottom = true
    term.viewportDirtyWhileHidden = true
    return
  }
  let stickToBottom = !!term.restoreViewportToBottom
  const shouldFocusXterm = props.singlePaneChrome ? (focus && props.focusPaneFocused) : focus
  const forceViewportReconcile = !!term.viewportDirtyWhileHidden
  term.restoreViewportToBottom = false
  term.viewportDirtyWhileHidden = false
  nextTick(() => {
    scheduleViewportRevealSync({
      term,
      canMeasure: canMeasureTerminal,
      focus: shouldFocusXterm,
      stickToBottom,
      forceViewportReconcile,
      requestFrame: (callback) => requestAnimationFrame(callback),
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timerId) => window.clearTimeout(timerId),
      resizePty({ cols, rows }) {
        if (!term.ptyId || !term.connected) return
        if (props.singlePaneChrome) {
          if (props.focusPaneFocused) {
            clearDeferredSinglePanePtyResize()
            throttleSinglePanePtyResize(term)
          }
          return
        }
        window.electronAPI.terminal.resize({ id: term.ptyId, cols, rows })
      },
      reconcileViewport(immediate) {
        term.xterm?._core?.viewport?.syncScrollArea?.(immediate, true)
      }
    })
  })
}

const switchTab = (tabId) => {
  const tab = findTabById(tabId)
  if (!tab) return
  ensureTabLayout(tab)
  activeTabId.value = tab.tabId
  activeTermId.value = tab.termIds.includes(activeTermId.value) ? activeTermId.value : (tab.termIds[0] || null)
  applyLayout(true)
  schedulePersistedSnapshot()
}

const focusSplitPane = (termId) => {
  if (!termId) return
  activeTermId.value = termId
  if (props.singlePaneChrome) {
    schedulePersistedSnapshot()
    return
  }
  const term = findTerminalById(termId)
  refreshVisibleTerminal(term, true)
  schedulePersistedSnapshot()
}

const removePaneDragListeners = () => {
  window.removeEventListener('mousemove', handlePaneDragMove)
  window.removeEventListener('mouseup', handlePaneDragMouseUp)
}

const handlePaneDragEnd = () => {
  removePaneDragListeners()
  pendingPaneDrag.value = null
  draggingPaneTermId.value = ''
  dropTargetPaneTermId.value = ''
  destroyPaneDragPreview()
}

const handlePaneDragDrop = (sourceTermId, targetTermId) => {
  const tab = activeTab.value
  if (!tab || !sourceTermId || !targetTermId || sourceTermId === targetTermId) {
    return
  }
  swapLayoutLeafTermIds(tab.layout, sourceTermId, targetTermId)
  syncTabTermIds(tab)
  activeTermId.value = sourceTermId
  applyLayout(true)
  schedulePersistedSnapshot()
}

const handlePaneDragMove = (event) => {
  const drag = pendingPaneDrag.value
  if (!drag) return

  const deltaX = event.clientX - drag.startClientX
  const deltaY = event.clientY - drag.startClientY
  const distance = Math.hypot(deltaX, deltaY)

  if (!draggingPaneTermId.value) {
    if (distance < 6) return
    draggingPaneTermId.value = drag.termId
    paneDragPreviewEl = createPaneDragPreview(drag.termId)
    updatePaneDragPreviewPosition(event.clientX, event.clientY)
  } else {
    updatePaneDragPreviewPosition(event.clientX, event.clientY)
  }

  dropTargetPaneTermId.value = resolvePaneDropTargetTermId(event.clientX, event.clientY)
}

const handlePaneDragMouseUp = (event) => {
  const sourceTermId = draggingPaneTermId.value
  const targetTermId = resolvePaneDropTargetTermId(event.clientX, event.clientY)
  if (sourceTermId && targetTermId) {
    handlePaneDragDrop(sourceTermId, targetTermId)
  }
  handlePaneDragEnd()
}

const handlePaneDragStart = (payload) => {
  const termId = payload?.termId || ''
  const rect = payload?.rect
  if (!termId || !rect) return
  focusSplitPane(termId)
  handlePaneDragEnd()
  pendingPaneDrag.value = {
    termId,
    label: payload?.label || getPaneTitle(termId),
    rect,
    startClientX: payload?.clientX || rect.left,
    startClientY: payload?.clientY || rect.top,
    offsetX: (payload?.clientX || rect.left) - rect.left,
    offsetY: (payload?.clientY || rect.top) - rect.top
  }
  window.addEventListener('mousemove', handlePaneDragMove)
  window.addEventListener('mouseup', handlePaneDragMouseUp)
}

const resolveSplitCwd = () => {
  return getProjectRootCwd()
}

const splitActiveTerminal = async (direction = 'row') => {
  const tab = activeTab.value
  const active = currentTerminal.value || terminals.value[0]
  if (!tab || !active) return

  ensureTabLayout(tab)

  const baseCwd = resolveSplitCwd()
  const newTermId = await addTerminal(baseCwd || null, { autoSwitch: false, tabId: tab.tabId })
  if (!newTermId) return

  tab.layout = replaceLeafWithSplit(tab.layout, active.termId, direction, newTermId)
  syncTabTermIds(tab)
  activeTabId.value = tab.tabId
  activeTermId.value = newTermId
  applyLayout(true)
  schedulePersistedSnapshot()
}

const closeSplitPane = async (termId) => {
  const tab = activeTab.value
  if (!tab || tab.termIds.length < 2 || !tab.termIds.includes(termId)) return
  const remainingIds = tab.termIds.filter(id => id !== termId)
  tab.layout = removeLeafFromLayout(tab.layout, termId)
  syncTabTermIds(tab)
  await closeTerminalById(termId)
  if (!remainingIds.length) return
  if (activeTermId.value === termId || !remainingIds.includes(activeTermId.value)) {
    activeTermId.value = remainingIds[0]
  }
  applyLayout(true)
  schedulePersistedSnapshot()
}

const bindTerminalFocusTracking = (term, xterm) => {
  if (!term || !xterm) return () => {}
  try {
    if (typeof xterm.onFocus === 'function') {
      const disposable = xterm.onFocus(() => {
        try {
          focusSplitPane(term.termId)
        } catch {}
      })
      if (disposable?.dispose) {
        return () => {
          try {
            disposable.dispose()
          } catch {}
        }
      }
      if (typeof disposable === 'function') {
        return disposable
      }
      return () => {}
    }

    const element = xterm.element
    if (!element || typeof element.addEventListener !== 'function' || typeof element.removeEventListener !== 'function') {
      return () => {}
    }

    const handler = () => {
      try {
        focusSplitPane(term.termId)
      } catch {}
    }
    const mouseDownHandler = () => handler()
    element.addEventListener('focusin', handler)
    element.addEventListener('mousedown', mouseDownHandler)
    return () => {
      element.removeEventListener('focusin', handler)
      element.removeEventListener('mousedown', mouseDownHandler)
    }
  } catch {
    return () => {}
  }
}

const closeTerminalById = async (termId) => {
  const idx = terminals.value.findIndex(t => t.termId === termId)
  if (idx === -1) return

  const term = terminals.value[idx]
  if (typeof term._focusCleanup === 'function') {
    term._focusCleanup()
    term._focusCleanup = null
  }
  unbindTerminalDropEvents(term)
  cancelViewportRevealSync(term, (timerId) => window.clearTimeout(timerId))
  if (term.ptyId) {
    const closingPtyId = term.ptyId
    term.ptyId = null
    term.connected = false
    await destroyPtySilently(closingPtyId)
  }
  try { term.xterm.dispose() } catch (e) {}
  term.el.remove()
  terminals.value.splice(idx, 1)
  const tab = findTabById(term.tabId)
  if (!tab) return
  tab.termIds = tab.termIds.filter(id => id !== termId)
  if (!tab.termIds.length) {
    tab.layout = null
  }
  schedulePersistedSnapshot()
}

const closeTab = async (tabId) => {
  if (tabs.value.length <= 1) return
  const tab = findTabById(tabId)
  if (!tab) return

  for (const termId of [...tab.termIds]) {
    await closeTerminalById(termId)
  }

  const idx = tabs.value.findIndex(t => t.tabId === tabId)
  if (idx === -1) return
  tabs.value.splice(idx, 1)

  if (activeTabId.value === tabId) {
    const next = tabs.value[Math.min(idx, tabs.value.length - 1)]
    if (next) {
      activeTabId.value = next.tabId
      activeTermId.value = next.termIds[0] || null
    }
  }
  applyLayout(true)
  schedulePersistedSnapshot()
}

const clearTerminalById = (termId = '') => {
  const term = termId ? findTerminalById(termId) : currentTerminal.value
  if (!term) return
  // 快照恢复的历史是直接 write 进 xterm 的，不在 PTY 里；仅发 Ctrl+L 清不掉这些行。
  try {
    term.xterm.clear()
  } catch (e) {}
  if (term.ptyId && term.connected) {
    // 再通知 shell 清屏并重绘提示符，与常见终端 Ctrl+L 一致
    window.electronAPI.terminal.write({ id: term.ptyId, data: '\x0c' })
  }
  term.xterm.focus()
}

const clearTerminal = () => {
  clearTerminalById('')
}

const clearSearchDecorations = (term) => {
  try {
    term?.searchAddon?.clearDecorations()
  } catch (error) {}
}

const clearAllSearchDecorations = () => {
  for (const term of terminals.value) {
    clearSearchDecorations(term)
  }
  for (const [, cached] of terminalCache) {
    for (const term of cached.terminals || []) {
      clearSearchDecorations(term)
    }
  }
}

const getSearchTargetTerminal = () => currentTerminal.value || terminals.value[0] || null

const focusSearchInput = () => {
  nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  })
}

const runTerminalSearch = (direction = 'next', incremental = false) => {
  const term = getSearchTargetTerminal()
  const query = searchQuery.value.trim()
  if (!term?.searchAddon) return false

  if (!query) {
    clearAllSearchDecorations()
    searchHasMatch.value = true
    return false
  }

  const matched = direction === 'previous'
    ? term.searchAddon.findPrevious(query, SEARCH_OPTIONS)
    : term.searchAddon.findNext(query, {
        ...SEARCH_OPTIONS,
        incremental
      })

  searchHasMatch.value = !!matched
  return !!matched
}

const findNextMatch = () => {
  runTerminalSearch('next', false)
}

const findPreviousMatch = () => {
  runTerminalSearch('previous', false)
}

const openSearchBar = () => {
  showSearchBar.value = true
  searchHasMatch.value = true
  focusSearchInput()
  if (searchQuery.value.trim()) {
    nextTick(() => {
      runTerminalSearch('next', true)
    })
  }
}

const closeSearchBar = (restoreFocus = true) => {
  showSearchBar.value = false
  searchHasMatch.value = true
  clearAllSearchDecorations()
  if (restoreFocus) {
    refreshVisibleTerminal(getSearchTargetTerminal(), true)
  }
}

const handleSearchInput = () => {
  runTerminalSearch('next', true)
}

const handleSearchKeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      findPreviousMatch()
    } else {
      findNextMatch()
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeSearchBar()
  }
}

const handleTerminalKeydown = (event) => {
  const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f'
  if (isFindShortcut && props.isActive) {
    event.preventDefault()
    event.stopPropagation()
    openSearchBar()
    return
  }

  if (event.key === 'Escape' && showSearchBar.value) {
    event.preventDefault()
    event.stopPropagation()
    closeSearchBar()
  }
}

const restartTerminalById = async (termId = '', cwdOverride = null) => {
  const term = termId ? findTerminalById(termId) : currentTerminal.value
  if (!term) return
  if (term.ptyId) {
    const closingPtyId = term.ptyId
    term.ptyId = null
    term.connected = false
    await destroyPtySilently(closingPtyId)
    term._lastPtySig = undefined
  }
  term.xterm.reset()
  term.xterm.write('\x1b[33m正在重启终端...\x1b[0m\r\n')
  try {
    const projectRootFromProps = normalizeIncomingPath(props.defaultCwd || '')
    const explicitRestartCwd = (cwdOverride != null && String(cwdOverride).trim() !== '')
      ? String(cwdOverride).trim()
      : ''
    let restartCwd = explicitRestartCwd || projectRootFromProps || getProjectRootCwd() || ((term.cwd && String(term.cwd).trim()) || getBaseCwd())
    if (!props.allowFirstTerminalWithoutCwd && !restartCwd.trim()) {
      restartCwd = projectRootFromProps || getProjectRootCwd() || ''
    }
    const res = await window.electronAPI.terminal.create({
      id: `term-${Date.now()}`,
      cwd: props.allowFirstTerminalWithoutCwd ? (restartCwd || undefined) : restartCwd
    })
    if (res.success) {
      term.ptyId = res.id
      term._lastPtySig = undefined
      if (res.resolvedCwd && typeof res.resolvedCwd === 'string') {
        term.cwd = res.resolvedCwd
      }
      term.connected = true
      term.hasUserInput = false
      applyLayout(true)
      schedulePersistedSnapshot()
    }
  } catch (e) {
    term.xterm.write('\r\n\x1b[31m重启失败: ' + e.message + '\x1b[0m\r\n')
  }
}

const restartTerminal = async (cwdOverride = null) => {
  await restartTerminalById('', cwdOverride)
}

const focusCurrentTerminal = () => {
  const term = currentTerminal.value || terminals.value[0]
  if (!term) return
  if (props.singlePaneChrome && props.focusPaneFocused) {
    armProgrammaticFocusSigintGuard(term)
  }
  refreshVisibleTerminal(term, true)
}

const focusCurrentTerminalLightweight = () => {
  const term = currentTerminal.value || terminals.value[0]
  if (!term?.xterm) return
  if (props.singlePaneChrome && props.focusPaneFocused) {
    armProgrammaticFocusSigintGuard(term)
  }
  nextTick(() => {
    try {
      term.xterm.focus()
    } catch {}
  })
}

const syncSinglePaneViewport = (term, { notifyPty = false } = {}) => {
  if (!term?.xterm) return
  try {
    term.fitAddon?.fit?.()
  } catch {}
  try {
    if (Number.isFinite(term.xterm.rows) && term.xterm.rows > 0) {
      term.xterm.refresh(0, term.xterm.rows - 1)
    }
  } catch {}
  try {
    term.xterm?._core?.viewport?.syncScrollArea?.(true, true)
  } catch {}
  if (notifyPty) {
    applySinglePanePtyResizeIfChanged(term)
  }
}

const revealCurrentTerminalAfterAnimation = () => {
  const term = currentTerminal.value || terminals.value[0]
  if (!term?.xterm) return
  armProgrammaticFocusSigintGuard(term)
  term.restoreViewportToBottom = true
  term.viewportDirtyWhileHidden = true
  nextTick(() => {
    scheduleViewportRevealSync({
      term,
      canMeasure: canMeasureTerminal,
      focus: true,
      stickToBottom: true,
      forceViewportReconcile: true,
      requestFrame: (callback) => requestAnimationFrame(callback),
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timerId) => window.clearTimeout(timerId),
      followupDelayMs: 48,
      resizePty() {
        applySinglePanePtyResizeIfChanged(term)
      },
      reconcileViewport(immediate) {
        term.xterm?._core?.viewport?.syncScrollArea?.(immediate, true)
      }
    })
  })
}

const reconcileCurrentTerminalAfterAnimation = () => {
  if (!props.singlePaneChrome || !props.focusPaneFocused) return
  const term = currentTerminal.value || terminals.value[0]
  if (!term?.xterm) return
  syncSinglePaneViewport(term, { notifyPty: true })
  requestAnimationFrame(() => {
    if (!props.isActive || !props.focusPaneFocused || !term?.xterm) return
    syncSinglePaneViewport(term, { notifyPty: true })
  })
}

const ensureDefaultTerminal = async (cwdOverride = '') => {
  if (ensureDefaultPromise) {
    return ensureDefaultPromise
  }

  ensureDefaultPromise = (async () => {
    const targetCwd = normalizeIncomingPath(cwdOverride || getProjectRootCwd())
    if (!terminals.value.length) {
      if (!hasRestoredInitialSnapshot) {
        hasRestoredInitialSnapshot = true
        const restored = await restoreState(targetCwd || props.defaultCwd || '__standalone__')
        if (restored) return
      }
      await addTerminal(targetCwd || null)
      return
    }

    if (!activeTabId.value && tabs.value[0]) {
      switchTab(tabs.value[0].tabId)
    }

    const term = currentTerminal.value || terminals.value[0]
    if (!term || !targetCwd) return

    const current = normalizeIncomingPath(term.cwd || '')
    if (terminals.value.length === 1 && !term.hasUserInput && current !== targetCwd) {
      await restartTerminal(targetCwd)
    } else {
      applyLayout(true)
    }
  })()

  try {
    await ensureDefaultPromise
  } finally {
    ensureDefaultPromise = null
  }
}

const runCommand = async (command, options = {}) => {
  const payload = typeof command === 'string' ? command.trim() : ''
  if (!payload) return false

  const {
    cwd = '',
    forceNewTerminal = false,
    submit = true
  } = options

  const targetCwd = normalizeIncomingPath(cwd || getProjectRootCwd())
  let targetTerm = null

  if (!forceNewTerminal) {
    await ensureDefaultTerminal(targetCwd)
    const current = currentTerminal.value || terminals.value[0] || null
    const currentCwd = normalizeIncomingPath(current?.cwd || '')
    if (current && !current.hasUserInput && (!targetCwd || currentCwd === targetCwd)) {
      targetTerm = current
    }
  }

  if (!targetTerm) {
    const termId = await addTerminal(targetCwd || null, { autoSwitch: true })
    if (termId) {
      targetTerm = findTerminalById(termId)
    }
  }

  if (!targetTerm?.ptyId || !targetTerm.connected) return false

  activeTabId.value = targetTerm.tabId
  activeTermId.value = targetTerm.termId
  targetTerm.hasUserInput = true
  window.electronAPI.terminal.write({
    id: targetTerm.ptyId,
    data: submit ? `${payload}\r` : payload
  })
  applyLayout(true)
  return true
}

// ---- 项目切换：缓存 & 恢复 ----

const normalizeCacheKey = (path) => normalizeIncomingPath(path || '')
const resolveStateCacheKey = (path) => {
  if (typeof props.snapshotCacheKey === 'string' && props.snapshotCacheKey.trim()) {
    return normalizeCacheKey(props.snapshotCacheKey.trim())
  }
  return normalizeCacheKey(path || '') || '__standalone__'
}

const getSnapshotStorageKey = (path) => {
  const normalized = resolveStateCacheKey(path)
  return `${TERMINAL_SNAPSHOT_PREFIX}${normalized.replace(/[^a-zA-Z0-9]/g, '_')}`
}

const serializeTerminalBuffer = (term) => {
  const buffer = term?.xterm?.buffer?.active
  if (!buffer || typeof buffer.length !== 'number' || typeof buffer.getLine !== 'function') return ''

  const start = Math.max(0, buffer.length - TERMINAL_SNAPSHOT_MAX_LINES)
  const lines = []
  for (let index = start; index < buffer.length; index += 1) {
    const line = buffer.getLine(index)
    if (!line || typeof line.translateToString !== 'function') {
      lines.push('')
      continue
    }
    lines.push(line.translateToString(true))
  }

  return lines.join('\r\n').trimEnd()
}

const serializeLayoutNode = (node) => {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'leaf') {
    return {
      nodeId: node.nodeId || nextLayoutNodeId(),
      type: 'leaf',
      termId: node.termId || ''
    }
  }
  return {
    nodeId: node.nodeId || nextLayoutNodeId(),
    type: 'split',
    direction: node.direction === 'column' ? 'column' : 'row',
    ratio: clampSplitRatio(Number(node.ratio)),
    children: (node.children || []).map(child => serializeLayoutNode(child)).filter(Boolean)
  }
}

const deserializeLayoutNode = (node) => {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'leaf') {
    return createLeafNode(node.termId || '')
  }
  const children = (node.children || []).map(child => deserializeLayoutNode(child)).filter(Boolean)
  if (!children.length) return null
  if (children.length === 1) return children[0]
  return {
    nodeId: node.nodeId || nextLayoutNodeId(),
    type: 'split',
    direction: node.direction === 'column' ? 'column' : 'row',
    ratio: clampSplitRatio(Number(node.ratio)),
    children
  }
}

const normalizeSnapshotTabs = (tabSnapshots = [], terminalSnapshots = []) => {
  const terminalsByTab = new Map()
  for (const terminalSnapshot of terminalSnapshots) {
    const list = terminalsByTab.get(terminalSnapshot.tabId) || []
    list.push(terminalSnapshot)
    terminalsByTab.set(terminalSnapshot.tabId, list)
  }

  return tabSnapshots.map((tabSnapshot) => {
    const fallbackTermIds = Array.isArray(tabSnapshot.termIds) && tabSnapshot.termIds.length
      ? tabSnapshot.termIds
      : (terminalsByTab.get(tabSnapshot.tabId) || [])
        .sort((left, right) => (left.termIndex || 1) - (right.termIndex || 1))
        .map(item => item.termId)
    const layout = tabSnapshot.layout
      ? deserializeLayoutNode(tabSnapshot.layout)
      : buildLayoutFromTermIds(fallbackTermIds, !!tabSnapshot.split)
    return {
      tabId: tabSnapshot.tabId,
      label: tabSnapshot.label || `终端 ${tabSnapshot.tabIndex || 1}`,
      _tabIndex: tabSnapshot.tabIndex || 1,
      layout,
      termIds: collectLayoutTermIds(layout)
    }
  })
}

const buildSnapshotFromState = (path, state = {}) => {
  const cacheKey = resolveStateCacheKey(path)
  const tabsState = Array.isArray(state.tabs) ? state.tabs : []
  const terminalsState = Array.isArray(state.terminals) ? state.terminals : []

  if (!tabsState.length || !terminalsState.length) return null

  return {
    version: 2,
    path: cacheKey,
    savedAt: new Date().toISOString(),
    activeTabId: state.activeTabId || tabsState[0]?.tabId || null,
    activeTermId: state.activeTermId || terminalsState[0]?.termId || null,
    tabs: tabsState.map((tab) => ({
      tabId: tab.tabId,
      label: tab.label,
      tabIndex: tab._tabIndex || 1,
      termIds: Array.isArray(tab.termIds) ? [...tab.termIds] : [],
      layout: serializeLayoutNode(tab.layout)
    })),
    terminals: terminalsState.map((term) => ({
      termId: term.termId,
      tabId: term.tabId,
      termIndex: term._termIndex || 1,
      cwd: normalizeIncomingPath(term.cwd || ''),
      connected: !!term.connected,
      hasUserInput: !!term.hasUserInput,
      bufferText: serializeTerminalBuffer(term)
    }))
  }
}

const persistSnapshotForPath = (path, state = {}) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return false
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false
  const snapshot = buildSnapshotFromState(path, state)
  const storageKey = getSnapshotStorageKey(path)

  try {
    if (!snapshot) {
      window.localStorage.removeItem(storageKey)
      return true
    }
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
    return true
  } catch (error) {
    return false
  }
}

const readPersistedSnapshot = (path) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return null
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null
  const storageKey = getSnapshotStorageKey(path)

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const snapshot = JSON.parse(raw)
    if (![1, 2].includes(snapshot?.version) || !Array.isArray(snapshot.tabs) || !Array.isArray(snapshot.terminals)) {
      return null
    }
    return snapshot
  } catch (error) {
    return null
  }
}

const clearPersistedSnapshot = (path) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return
  try {
    window.localStorage.removeItem(getSnapshotStorageKey(path))
  } catch (error) {}
}

const flushPersistedSnapshot = (path = props.defaultCwd, state = null) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return
  if (persistSnapshotTimer) {
    window.clearTimeout(persistSnapshotTimer)
    persistSnapshotTimer = null
  }

  if (state) {
    persistSnapshotForPath(path, state)
    return
  }

  persistSnapshotForPath(path, {
    tabs: tabs.value,
    activeTabId: activeTabId.value,
    terminals: terminals.value,
    activeTermId: activeTermId.value
  })
}

const schedulePersistedSnapshot = (path = props.defaultCwd, state = null) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return
  if (typeof window === 'undefined') return
  if (persistSnapshotTimer) {
    window.clearTimeout(persistSnapshotTimer)
  }
  persistSnapshotTimer = window.setTimeout(() => {
    persistSnapshotTimer = null
    flushPersistedSnapshot(path, state)
  }, 500)
}

const detachTerminalsFromDom = (terms) => {
  if (!Array.isArray(terms)) return
  for (const t of terms) {
    if (!t?.el) continue
    t.el.style.display = 'none'
    if (t.el.parentNode) {
      t.el.parentNode.removeChild(t.el)
    }
  }
}

const saveCurrentState = (path) => {
  const cacheKey = resolveStateCacheKey(path)
  if (terminals.value.length === 0) {
    terminalCache.delete(cacheKey)
    clearPersistedSnapshot(cacheKey)
    return
  }

  detachTerminalsFromDom(terminals.value)
  const state = {
    path: cacheKey,
    tabs: tabs.value,
    activeTabId: activeTabId.value,
    terminals: terminals.value,
    activeTermId: activeTermId.value
  }
  terminalCache.set(cacheKey, state)
  persistSnapshotForPath(cacheKey, state)
}

const restorePersistedState = async (path) => {
  if (!TERMINAL_DISK_PERSISTENCE_ENABLED) return false
  const cacheKey = resolveStateCacheKey(path)
  const snapshot = readPersistedSnapshot(cacheKey)
  if (!snapshot) return false

  tabs.value = []
  activeTabId.value = null
  terminals.value = []
  activeTermId.value = null

  tabs.value = normalizeSnapshotTabs(snapshot.tabs, snapshot.terminals)

  const terminalsByTab = new Map()
  for (const terminalSnapshot of snapshot.terminals) {
    const list = terminalsByTab.get(terminalSnapshot.tabId) || []
    list.push(terminalSnapshot)
    terminalsByTab.set(terminalSnapshot.tabId, list)
  }

  for (const tab of tabs.value) {
    if (!tab.layout) {
      tab.layout = buildLayoutFromTermIds((terminalsByTab.get(tab.tabId) || []).map(item => item.termId))
      syncTabTermIds(tab)
    }
    const termSnapshots = (terminalsByTab.get(tab.tabId) || [])
      .sort((left, right) => (left.termIndex || 1) - (right.termIndex || 1))

    for (const terminalSnapshot of termSnapshots) {
      await addTerminal(terminalSnapshot.cwd || null, {
        autoSwitch: false,
        tabId: tab.tabId,
        initialTermId: terminalSnapshot.termId,
        initialTermIndex: terminalSnapshot.termIndex,
        restoredBufferText: terminalSnapshot.bufferText || '',
        restoredConnected: terminalSnapshot.connected !== false,
        restoredHasUserInput: terminalSnapshot.hasUserInput === true,
        restoredNotice: terminalSnapshot.connected === false
          ? TERMINAL_RESTORE_EXITED_NOTICE
          : TERMINAL_RESTORE_NOTICE
      })
    }

  }

  activeTabId.value = tabs.value.some((tab) => tab.tabId === snapshot.activeTabId)
    ? snapshot.activeTabId
    : tabs.value[0]?.tabId || null
  const allTermIds = new Set(terminals.value.map((term) => term.termId))
  activeTermId.value = allTermIds.has(snapshot.activeTermId)
    ? snapshot.activeTermId
    : (findTabById(activeTabId.value)?.termIds?.[0] || terminals.value[0]?.termId || null)
  applyLayout(true)
  schedulePersistedSnapshot(cacheKey)
  return terminals.value.length > 0
}

const restoreState = async (path) => {
  const cacheKey = resolveStateCacheKey(path)
  const cached = terminalCache.get(cacheKey)
  if (!cached) {
    return TERMINAL_DISK_PERSISTENCE_ENABLED
      ? restorePersistedState(cacheKey)
      : false
  }

  tabs.value = (Array.isArray(cached.tabs) ? cached.tabs : []).map((tab) => {
    const nextTab = {
      tabId: tab.tabId,
      label: tab.label,
      _tabIndex: tab._tabIndex || 1,
      layout: tab.layout ? cloneLayoutNode(tab.layout) : buildLayoutFromTermIds(tab.termIds),
      termIds: Array.isArray(tab.termIds) ? [...tab.termIds] : []
    }
    syncTabTermIds(nextTab)
    return nextTab
  })
  terminals.value = cached.terminals
  activeTabId.value = cached.activeTabId || tabs.value[0]?.tabId || null
  activeTermId.value = cached.activeTermId
  if (!tabs.value.length && terminals.value.length) {
    const tabIndex = nextTabIndex()
    const tab = {
      tabId: `tab-${Date.now()}-${tabIndex}`,
      label: `终端 ${tabIndex}`,
      _tabIndex: tabIndex,
      layout: buildLayoutFromTermIds(terminals.value.map(t => t.termId), terminals.value.length > 1),
      termIds: terminals.value.map(t => t.termId)
    }
    tabs.value = [tab]
    activeTabId.value = tab.tabId
    if (!activeTermId.value) activeTermId.value = tab.termIds[0]
  }
  applyLayout(true)
  schedulePersistedSnapshot(cacheKey, cached)
  return true
}

const destroyTerminals = (terms) => {
  for (const t of terms) {
    unbindTerminalDropEvents(t)
    cancelViewportRevealSync(t, (timerId) => window.clearTimeout(timerId))
    if (t.ptyId) {
      const closingPtyId = t.ptyId
      t.ptyId = null
      t.connected = false
      destroyPtySilently(closingPtyId)
    }
    try { t.xterm.dispose() } catch (e) {}
    t.el.remove()
  }
}

// ---- IPC 路由 ----

const ipcHandler = {
  onOutput(data) {
    for (const t of terminals.value) {
      if (t.ptyId === data.id) {
        if (!props.isActive || t.el.style.display === 'none') {
          t.viewportDirtyWhileHidden = true
        }
        t.xterm.write(data.data)
        schedulePersistedSnapshot()
        return
      }
    }
    for (const [cacheKey, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (t.ptyId === data.id) {
          t.viewportDirtyWhileHidden = true
          t.xterm.write(data.data)
          persistSnapshotForPath(cacheKey, cached)
          return
        }
      }
    }
  },
  onCwdChange(data) {
    if (!data || typeof data.id !== 'string') return
    const updateTermCwd = (term) => {
      if (term.ptyId !== data.id) return false
      if (typeof data.cwd === 'string' && data.cwd.trim()) {
        term.cwd = normalizeIncomingPath(data.cwd)
      }
      return true
    }

    for (const t of terminals.value) {
      if (updateTermCwd(t)) {
        schedulePersistedSnapshot()
        return
      }
    }

    for (const [cacheKey, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (updateTermCwd(t)) {
          persistSnapshotForPath(cacheKey, cached)
          return
        }
      }
    }
  },
  onExit(data) {
    if (locallyClosedPtyIds.has(data.id)) {
      locallyClosedPtyIds.delete(data.id)
      return
    }
    for (const t of terminals.value) {
      if (t.ptyId === data.id) {
        t.connected = false
        t.xterm.write('\r\n\x1b[33m终端已退出 (code: ' + data.exitCode + ')\x1b[0m\r\n')
        schedulePersistedSnapshot()
        return
      }
    }
    for (const [cacheKey, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (t.ptyId === data.id) {
          t.connected = false
          t.xterm.write('\r\n\x1b[33m终端已退出 (code: ' + data.exitCode + ')\x1b[0m\r\n')
          persistSnapshotForPath(cacheKey, cached)
          return
        }
      }
    }
  },
  onTitleChange(data) {
    const updateTermTitle = (term) => {
      if (term.ptyId !== data.id) return false
      const nextTitle = typeof data.title === 'string' ? data.title.trim() : ''
      term.title = nextTitle
      return true
    }
    const updateTabLabel = (term, tabList) => {
      if (term.ptyId !== data.id) return false
      const tab = Array.isArray(tabList) ? tabList.find(item => item.tabId === term.tabId) : null
      if (!tab) return false
      const name = data.title.split('/').pop()
      tab.label = `${name || '终端'} ${tab._tabIndex || 1}`
      return true
    }
    for (const t of terminals.value) {
      updateTermTitle(t)
      if (updateTabLabel(t, tabs.value)) {
        schedulePersistedSnapshot()
        return
      }
    }
    for (const [cacheKey, cached] of terminalCache) {
      for (const t of cached.terminals) {
        updateTermTitle(t)
        if (updateTabLabel(t, cached.tabs)) {
          persistSnapshotForPath(cacheKey, cached)
          return
        }
      }
    }
  }
}

// ---- 生命周期 ----

let resizeTimer = null
let resizeRafId = null
watch(() => [props.isActive, props.focusPaneFocused], ([active, paneFocused]) => {
  if (active && paneFocused && terminals.value.length > 0) {
    if (props.singlePaneChrome) {
      clearDeferredSinglePanePtyResize()
      return
    }
    applyLayout(true)
    return
  }

  if (!active) {
    rememberVisibleTerminalViewportState()
  }

  if (!active && showSearchBar.value) {
    closeSearchBar(false)
  }
})

watch(() => currentTerminal.value?.termId, (termId, prevTermId) => {
  if (termId === prevTermId || !showSearchBar.value) return
  if (prevTermId) {
    clearSearchDecorations(findTerminalById(prevTermId))
  }
  if (!searchQuery.value.trim()) {
    searchHasMatch.value = true
    return
  }
  nextTick(() => {
    runTerminalSearch('next', true)
  })
})

watch(() => props.defaultCwd, async (newCwd, oldCwd) => {
  if (newCwd === oldCwd) return
  hasRestoredInitialSnapshot = false
  saveCurrentState(oldCwd)
  const targetCwd = normalizeIncomingPath(newCwd || '')
  const restored = await restoreState(newCwd)
  if (!restored) {
    tabs.value = []
    activeTabId.value = null
    terminals.value = []
    activeTermId.value = null
    if (shouldCreateInitialTerminal({
      terminalCount: terminals.value.length,
      restoredSnapshot: false,
      projectRoot: targetCwd,
      allowFirstTerminalWithoutCwd: props.allowFirstTerminalWithoutCwd
    })) {
      await addTerminal(targetCwd || null)
    }
  } else {
    applyLayout(true)
  }
})

// 项目详情：进入「终端」视图且已有项目路径时再建第一个 PTY（避免在工作区 onMounted 就建、cwd 不稳）。
// 加号：始终走 addTerminal()，依赖 projectRootRef / getBaseCwd。
// about:terminal：无项目路径，allowFirstTerminalWithoutCwd 为 true 时仍可自动建第一个。
watch(
  () => [props.isActive, projectRootRef.value, props.allowFirstTerminalWithoutCwd],
  async ([active, root, allowEmpty]) => {
    if (!active || terminals.value.length > 0) return
    let restored = false
    if (!hasRestoredInitialSnapshot) {
      hasRestoredInitialSnapshot = true
      restored = await restoreState(root || props.defaultCwd || '__standalone__')
    }
    const targetCwd = normalizeIncomingPath(root || props.defaultCwd || '')
    if (shouldCreateInitialTerminal({
      terminalCount: terminals.value.length,
      restoredSnapshot: restored,
      projectRoot: targetCwd,
      allowFirstTerminalWithoutCwd: allowEmpty
    })) {
      await addTerminal(targetCwd || null)
    }
  },
  { immediate: true }
)

onMounted(() => {
  register(ipcHandler)

  const ro = new ResizeObserver(() => {
    if (props.singlePaneChrome) {
      if (props.suspendSinglePaneResize || !props.focusPaneFocused) return
      if (resizeRafId != null) return
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null
        applyLayout(false)
      })
    } else {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        applyLayout(false)
      }, 100)
    }
  })
  if (containerRef.value) {
    ro.observe(containerRef.value)
    containerRef.value._ro = ro
  }

  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleTerminalKeydown, true)
  window.addEventListener('dragover', handleGlobalDragOver, true)
  window.addEventListener('drop', handleGlobalDrop, true)
})

onUnmounted(() => {
  stopResizeDrag()
  handlePaneDragEnd()
  flushPersistedSnapshot(props.defaultCwd)
  for (const [cacheKey, cached] of terminalCache) {
    flushPersistedSnapshot(cacheKey, cached)
  }
  if (persistSnapshotTimer) {
    window.clearTimeout(persistSnapshotTimer)
    persistSnapshotTimer = null
  }
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null }
  if (resizeRafId != null) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  if (singlePanePtyResizeTimer) {
    clearTimeout(singlePanePtyResizeTimer)
    singlePanePtyResizeTimer = null
  }
  clearDeferredSinglePanePtyResize()
  lastSinglePanePtyResizeAt = 0
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleTerminalKeydown, true)
  window.removeEventListener('dragover', handleGlobalDragOver, true)
  window.removeEventListener('drop', handleGlobalDrop, true)
  containerRef.value?._ro?.disconnect()
  destroyTerminals(terminals.value)
  terminals.value = []
  for (const [, cached] of terminalCache) {
    destroyTerminals(cached.terminals)
  }
  terminalCache.clear()
  unregister(ipcHandler)
})

defineExpose({
  clearTerminal,
  restartTerminal,
  ensureDefaultTerminal,
  runCommand,
  focusCurrentTerminal,
  focusCurrentTerminalLightweight,
  reconcileCurrentTerminalAfterAnimation,
  revealCurrentTerminalAfterAnimation
})
</script>

<style scoped>
.terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-project-bg);
  border-radius: var(--app-selected-radius);
  overflow: hidden;
  border: none;
}
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
  background: var(--app-project-bg);
}
.terminal-header--single-pane {
  padding: 0 10px 0 12px;
  gap: 10px;
}
.terminal-path--single-pane {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 6px;
  font-size: 11px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.75);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.terminal-path--single-pane .terminal-path__title {
  flex-shrink: 0;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.88);
}
.terminal-path--single-pane .terminal-path__sep {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.38);
  user-select: none;
}
.terminal-path--single-pane .terminal-path__cwd {
  flex: 1;
  min-width: 0;
}
/* 过长时省略左侧，保留末尾目录名可见（完整路径见 title） */
.terminal-path--ellipsis-start {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.terminal-path--ellipsis-start > .terminal-path__ltr {
  direction: ltr;
  unicode-bidi: embed;
}
.terminal-actions--single-pane {
  flex-shrink: 0;
}
.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  height: 100%;
}
.terminal-tabs::-webkit-scrollbar { height: 0; }
.terminal-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 100%;
  box-sizing: border-box;
  border-radius: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: background-color 0.2s ease, color 0.2s ease;
  flex-shrink: 0;
}
.terminal-tab:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
}
.terminal-tab.active {
  background: var(--app-tab-selected-bg);
  box-shadow: none;
  color: var(--app-text-primary);
  border-bottom-color: transparent;
  border-radius: var(--app-selected-radius);
}
.tab-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  opacity: 0;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}
.terminal-tab:hover .tab-close-btn { opacity: 1; }
.terminal-tab.active .tab-close-btn { opacity: 0.55; }
.tab-close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
  opacity: 1 !important;
}
.add-btn {
  flex-shrink: 0;
  margin-left: 2px;
}
.terminal-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 min(52%, 420px);
  min-width: 0;
  margin-left: 0;
  justify-content: flex-end;
}
.terminal-search {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  min-width: 220px;
  max-width: 280px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}
.terminal-search.is-not-found {
  background: rgba(239, 68, 68, 0.14);
}
.terminal-search-icon {
  flex-shrink: 0;
  color: #7dd3fc;
}
.terminal-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 12px;
}
.terminal-search-input::placeholder {
  color: #6b7280;
}
.terminal-search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.terminal-search-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f3f4f6;
}
.terminal-search-btn.close:hover {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}
.terminal-path {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}
.terminal-actions .terminal-path--ellipsis-start {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.terminal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}
.terminal-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}
.terminal-btn:focus-visible {
  outline: none;
}
.terminal-btn-split {
  width: 26px;
  border: none;
}
.terminal-btn-split:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
}
.split-btn-icon {
  width: 14px;
  height: 14px;
  line-height: 1;
  transition: transform 0.2s, opacity 0.2s;
}
.terminal-btn-split:hover .split-btn-icon {
  transform: scale(1.05);
}
.terminal-body {
  flex: 1;
  padding: 0;
  overflow: hidden;
  position: relative;
  background: var(--app-project-bg);
}
.terminal-body.drag-over {
  background: rgba(14, 116, 144, 0.14);
  box-shadow: none;
}
.terminal-single-pane {
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}
.terminal-split {
  display: flex;
  width: 100%;
  height: 100%;
}
.terminal-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.terminal-pane-content {
  width: 100%;
  height: 100%;
  position: relative;
  box-sizing: border-box;
  border-radius: inherit;
  overflow: hidden;
}
.terminal-pane.inactive .terminal-pane-content::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(214, 176, 74, 0.05);
  pointer-events: none;
  z-index: 2;
}
.pane-close-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.terminal-pane:hover .pane-close-btn {
  opacity: 1;
}
.pane-close-btn:hover {
  background: rgba(220, 80, 80, 0.85);
}
.terminal-body :deep(.xterm) { height: 100%; }
.terminal-body :deep(.xterm-screen),
.terminal-body :deep(.xterm-rows) {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
.terminal-body :deep(.xterm-viewport) {
  overflow-y: scroll !important;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar { width: 4px; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-track { background: transparent; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
.terminal-cwd-picker {
  position: relative;
}
.cwd-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: #26272b;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  min-width: 140px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  padding: 4px 0;
}
.cwd-item {
  padding: 5px 12px;
  font-size: 12px;
  color: #d4d4d4;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cwd-item:hover { background: rgba(255,255,255,0.08); }
</style>
