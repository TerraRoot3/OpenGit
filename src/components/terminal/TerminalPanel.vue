<template>
  <div class="terminal-container" ref="containerRef">
    <div class="terminal-header">
      <div class="terminal-tabs">
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
        <button class="terminal-btn add-btn" @mousedown.prevent @click="handleAddTerminal" title="新建终端">
          <Plus :size="14" />
        </button>
        <!-- 多根目录时显示"在目录中打开"下拉 -->
        <div v-if="props.workspaceRoots.length > 1" class="terminal-cwd-picker" ref="cwdMenuRef">
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
        <span class="terminal-path" :title="currentCwd">{{ pathDisplay }}</span>
        <button class="terminal-btn" @mousedown.prevent @click="toggleSplitTerminal" :title="isSplitMode ? '退出分屏' : '分屏终端'">
          <span class="split-btn-icon">▦</span>
        </button>
        <button class="terminal-btn" @mousedown.prevent @click="clearTerminal" title="清屏">
          <Eraser :size="14" />
        </button>
        <button class="terminal-btn" @mousedown.prevent @click="restartTerminal(getProjectRootCwd() || null)" title="重启终端">
          <RefreshCw :size="14" />
        </button>
      </div>
    </div>
    <div class="terminal-body" ref="terminalBodyRef">
      <div v-if="isSplitMode && activeTabTermIds.length === 2" class="terminal-split">
        <div class="terminal-pane">
          <button class="pane-close-btn" title="关闭左侧分屏" @mousedown.prevent.stop @click.stop="closeSplitPane(activeTabTermIds[0])">
            <X :size="11" />
          </button>
          <div class="terminal-pane-content" ref="leftPaneRef" @mousedown="focusSplitPane(activeTabTermIds[0])"></div>
        </div>
        <div class="terminal-pane">
          <button class="pane-close-btn" title="关闭右侧分屏" @mousedown.prevent.stop @click.stop="closeSplitPane(activeTabTermIds[1])">
            <X :size="11" />
          </button>
          <div class="terminal-pane-content" ref="rightPaneRef" @mousedown="focusSplitPane(activeTabTermIds[1])"></div>
        </div>
      </div>
      <div v-else class="terminal-single-pane" ref="singlePaneRef"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { Terminal as TerminalIcon, Eraser, RefreshCw, Plus, X, FolderOpen } from 'lucide-vue-next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTerminalRouter } from '../../composables/useTerminalRouter'
import '@xterm/xterm/css/xterm.css'

const props = defineProps({
  defaultCwd: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  workspaceRoots: { type: Array, default: () => [] },
  /** 独立终端页（about:terminal）无项目路径时仍自动建第一个会话，cwd 由主进程回退到用户目录 */
  allowFirstTerminalWithoutCwd: { type: Boolean, default: false }
})

const containerRef = ref(null)
const terminalBodyRef = ref(null)
const singlePaneRef = ref(null)
const leftPaneRef = ref(null)
const rightPaneRef = ref(null)
const tabs = ref([])
const activeTabId = ref(null)
const terminals = ref([])
const activeTermId = ref(null)
const terminalCache = new Map()
const showCwdMenu = ref(false)
const cwdMenuRef = ref(null)
let ensureDefaultPromise = null
const handleDocumentClick = (event) => {
  if (cwdMenuRef.value && !cwdMenuRef.value.contains(event.target)) {
    showCwdMenu.value = false
  }
}

const { register, unregister } = useTerminalRouter()

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
const activeTab = computed(() => findTabById(activeTabId.value))
const activeTabTermIds = computed(() => activeTab.value?.termIds || [])
const isSplitMode = computed(() => !!(activeTab.value && activeTab.value.split && activeTabTermIds.value.length === 2))
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

const pathDisplay = computed(() => {
  const p = currentCwd.value
  if (!p) return ''
  const parts = p.split('/')
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : p
})

const XTERM_OPTS = {
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: 13,
  fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: 'rgba(255, 255, 255, 0.3)',
    black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
    blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
    brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
    brightCyan: '#29b8db', brightWhite: '#ffffff'
  },
  allowProposedApi: true,
  scrollback: 10000
}

// ---- 终端实例管理 ----

const createXterm = () => {
  const el = document.createElement('div')
  el.style.cssText = 'width:100%;height:100%;display:none;overflow:hidden;'

  const xterm = new Terminal(XTERM_OPTS)
  const fitAddon = new FitAddon()
  xterm.loadAddon(fitAddon)
  xterm.loadAddon(new WebLinksAddon())
  xterm.open(el)

  return { xterm, fitAddon, el }
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

const applyLayout = (focusActive = true) => {
  nextTick(() => {
    for (const t of terminals.value) {
      t.el.style.display = 'none'
    }

    if (isSplitMode.value && activeTabTermIds.value.length === 2 && leftPaneRef.value && rightPaneRef.value) {
      const left = findTerminalById(activeTabTermIds.value[0])
      const right = findTerminalById(activeTabTermIds.value[1])
      if (left && right) {
        mountTermToPane(left, leftPaneRef.value)
        mountTermToPane(right, rightPaneRef.value)
        refreshVisibleTerminal(left, focusActive && activeTermId.value === left.termId)
        refreshVisibleTerminal(right, focusActive && activeTermId.value === right.termId)
        return
      }
      if (activeTab.value) {
        activeTab.value.split = false
      }
    }

    const term = currentTerminal.value || terminals.value[0]
    if (!term || !singlePaneRef.value) return
    mountTermToPane(term, singlePaneRef.value)
    refreshVisibleTerminal(term, focusActive)
  })
}

const addTerminal = async (cwdOverride = null, options = {}) => {
  const { autoSwitch = true, tabId = null } = options
  let targetTab = tabId ? findTabById(tabId) : null
  if (!targetTab) {
    const tabIndex = nextTabIndex()
    targetTab = {
      tabId: `tab-${Date.now()}-${tabIndex}`,
      label: `终端 ${tabIndex}`,
      _tabIndex: tabIndex,
      split: false,
      termIds: []
    }
    tabs.value.push(targetTab)
  }

  const idx = nextIndex()
  const termId = `term-${Date.now()}-${idx}`
  const explicitCwd = normalizeRequestedCwd(cwdOverride)
  let rawCwd = explicitCwd
    ? explicitCwd
    : getBaseCwd()
  if (!props.allowFirstTerminalWithoutCwd && (!rawCwd || !String(rawCwd).trim())) {
    rawCwd = getProjectRootCwd()
  }
  const cwd = typeof rawCwd === 'string' ? String(rawCwd).trim() : ''
  const { xterm, fitAddon, el } = createXterm()

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
    el,
    connected: false,
    ptyId: null,
    hasUserInput: false
  }

  xterm.onData((data) => {
    if (term.ptyId && term.connected) {
      term.hasUserInput = true
      window.electronAPI.terminal.write({ id: term.ptyId, data })
    }
  })
  xterm.onResize(({ cols, rows }) => {
    if (term.ptyId && term.connected) {
      window.electronAPI.terminal.resize({ id: term.ptyId, cols, rows })
    }
  })

  try {
    // 显式传 string：避免 cwd 被省略时主进程误用 ~
    const res = await window.electronAPI.terminal.create({
      id: termId,
      cwd: props.allowFirstTerminalWithoutCwd ? (cwd || undefined) : cwd
    })
    if (res.success) {
      term.ptyId = res.id
      if (res.resolvedCwd && typeof res.resolvedCwd === 'string') {
        term.cwd = res.resolvedCwd
      }
      term.connected = true
    } else {
      xterm.write('\r\n\x1b[31m终端创建失败: ' + res.error + '\x1b[0m\r\n')
    }
  } catch (e) {
    xterm.write('\r\n\x1b[31m终端创建异常: ' + e.message + '\x1b[0m\r\n')
  }

  terminals.value.push(term)
  if (!targetTab.termIds.includes(termId)) {
    targetTab.termIds.push(termId)
  }
  if (autoSwitch || !activeTermId.value) {
    activeTabId.value = targetTab.tabId
    activeTermId.value = termId
    applyLayout(true)
  } else {
    applyLayout(false)
  }
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
  if (!props.isActive || !containerRef.value) return false
  const rect = containerRef.value.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const refreshVisibleTerminal = (term, focus = true) => {
  if (!term) return
  nextTick(() => {
    requestAnimationFrame(() => {
      if (!canMeasureTerminal()) return
      try {
        term.fitAddon.fit()
      } catch (error) {}
      try {
        if (typeof term.xterm.rows === 'number' && term.xterm.rows > 0) {
          term.xterm.refresh(0, term.xterm.rows - 1)
        }
      } catch (error) {}
      if (focus) {
        try { term.xterm.focus() } catch (error) {}
      }
    })
  })
}

const switchTab = (tabId) => {
  const tab = findTabById(tabId)
  if (!tab) return
  activeTabId.value = tab.tabId
  activeTermId.value = tab.termIds.includes(activeTermId.value) ? activeTermId.value : (tab.termIds[0] || null)
  applyLayout(true)
}

const focusSplitPane = (termId) => {
  if (!termId) return
  activeTermId.value = termId
  const term = findTerminalById(termId)
  refreshVisibleTerminal(term, true)
}

const toggleSplitTerminal = async () => {
  const tab = activeTab.value
  const active = currentTerminal.value || terminals.value[0]
  if (!tab || !active) return

  if (tab.split && tab.termIds.length === 2) {
    const keepId = active.termId
    const dropId = tab.termIds.find(id => id !== keepId)
    if (dropId) {
      await closeTerminalById(dropId)
    }
    tab.termIds = [keepId]
    tab.split = false
    activeTermId.value = keepId
    applyLayout(true)
    return
  }

  if (tab.termIds.length >= 2) {
    tab.split = true
    applyLayout(true)
    return
  }

  const baseCwd = normalizeIncomingPath(active.cwd || getProjectRootCwd() || '')
  const newTermId = await addTerminal(baseCwd || null, { autoSwitch: false, tabId: tab.tabId })
  if (!newTermId) return

  tab.termIds = [active.termId, newTermId]
  tab.split = true
  activeTabId.value = tab.tabId
  activeTermId.value = newTermId
  applyLayout(true)
}

const closeSplitPane = async (termId) => {
  const tab = activeTab.value
  if (!tab || tab.termIds.length < 2 || !tab.termIds.includes(termId)) return
  const keepId = tab.termIds.find(id => id !== termId)
  await closeTerminalById(termId)
  if (!keepId) return
  tab.termIds = [keepId]
  tab.split = false
  if (activeTermId.value === termId || !tab.termIds.includes(activeTermId.value)) {
    activeTermId.value = keepId
  }
  applyLayout(true)
}

const closeTerminalById = async (termId) => {
  const idx = terminals.value.findIndex(t => t.termId === termId)
  if (idx === -1) return

  const term = terminals.value[idx]
  if (term.ptyId) {
    await window.electronAPI.terminal.destroy({ id: term.ptyId }).catch(() => {})
  }
  try { term.xterm.dispose() } catch (e) {}
  term.el.remove()
  terminals.value.splice(idx, 1)
  const tab = findTabById(term.tabId)
  if (!tab) return
  tab.termIds = tab.termIds.filter(id => id !== termId)
  if (tab.termIds.length < 2) tab.split = false
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
}

const clearTerminal = () => {
  const term = currentTerminal.value
  if (!term) return
  if (term.ptyId && term.connected) {
    // Ctrl+L 清屏，与 VS Code 行为一致
    window.electronAPI.terminal.write({ id: term.ptyId, data: '\x0c' })
  } else {
    term.xterm.clear()
  }
  term.xterm.focus()
}

const restartTerminal = async (cwdOverride = null) => {
  const term = currentTerminal.value
  if (!term) return
  if (term.ptyId) {
    await window.electronAPI.terminal.destroy({ id: term.ptyId }).catch(() => {})
    term.ptyId = null; term.connected = false
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
      if (res.resolvedCwd && typeof res.resolvedCwd === 'string') {
        term.cwd = res.resolvedCwd
      }
      term.connected = true
      term.hasUserInput = false
      applyLayout(true)
    }
  } catch (e) {
    term.xterm.write('\r\n\x1b[31m重启失败: ' + e.message + '\x1b[0m\r\n')
  }
}

const ensureDefaultTerminal = async (cwdOverride = '') => {
  if (ensureDefaultPromise) {
    return ensureDefaultPromise
  }

  ensureDefaultPromise = (async () => {
    const targetCwd = normalizeIncomingPath(cwdOverride || getProjectRootCwd())
    if (!terminals.value.length) {
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

// ---- 项目切换：缓存 & 恢复 ----

const normalizeCacheKey = (path) => normalizeIncomingPath(path || '')

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
  const cacheKey = normalizeCacheKey(path)
  if (!cacheKey || terminals.value.length === 0) return
  detachTerminalsFromDom(terminals.value)
  terminalCache.set(cacheKey, {
    tabs: tabs.value,
    activeTabId: activeTabId.value,
    terminals: terminals.value,
    activeTermId: activeTermId.value
  })
}

const restoreState = (path) => {
  const cacheKey = normalizeCacheKey(path)
  const cached = terminalCache.get(cacheKey)
  if (!cached) return false

  tabs.value = Array.isArray(cached.tabs) ? cached.tabs : []
  terminals.value = cached.terminals
  activeTabId.value = cached.activeTabId || tabs.value[0]?.tabId || null
  activeTermId.value = cached.activeTermId
  if (!tabs.value.length && terminals.value.length) {
    const tabIndex = nextTabIndex()
    const tab = {
      tabId: `tab-${Date.now()}-${tabIndex}`,
      label: `终端 ${tabIndex}`,
      _tabIndex: tabIndex,
      split: terminals.value.length > 1,
      termIds: terminals.value.map(t => t.termId)
    }
    tabs.value = [tab]
    activeTabId.value = tab.tabId
    if (!activeTermId.value) activeTermId.value = tab.termIds[0]
  }
  applyLayout(true)
  return true
}

const destroyTerminals = (terms) => {
  for (const t of terms) {
    if (t.ptyId) window.electronAPI.terminal.destroy({ id: t.ptyId }).catch(() => {})
    try { t.xterm.dispose() } catch (e) {}
    t.el.remove()
  }
}

// ---- IPC 路由 ----

const ipcHandler = {
  onOutput(data) {
    for (const t of terminals.value) {
      if (t.ptyId === data.id) { t.xterm.write(data.data); return }
    }
    for (const [, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (t.ptyId === data.id) { t.xterm.write(data.data); return }
      }
    }
  },
  onExit(data) {
    for (const t of terminals.value) {
      if (t.ptyId === data.id) {
        t.connected = false
        t.xterm.write('\r\n\x1b[33m终端已退出 (code: ' + data.exitCode + ')\x1b[0m\r\n')
        return
      }
    }
    for (const [, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (t.ptyId === data.id) {
          t.connected = false
          t.xterm.write('\r\n\x1b[33m终端已退出 (code: ' + data.exitCode + ')\x1b[0m\r\n')
          return
        }
      }
    }
  },
  onTitleChange(data) {
    const updateTabLabel = (term) => {
      if (term.ptyId !== data.id) return false
      const tab = findTabById(term.tabId)
      if (!tab) return false
      const name = data.title.split('/').pop()
      tab.label = `${name || '终端'} ${tab._tabIndex || 1}`
      return true
    }
    for (const t of terminals.value) {
      if (updateTabLabel(t)) return
    }
    for (const [, cached] of terminalCache) {
      for (const t of cached.terminals) {
        if (updateTabLabel(t)) return
      }
    }
  }
}

// ---- 生命周期 ----

let resizeTimer = null

watch(() => props.isActive, (active) => {
  if (active && terminals.value.length > 0) {
    applyLayout(true)
  }
})

watch(() => props.defaultCwd, (newCwd, oldCwd) => {
  if (newCwd === oldCwd) return
  saveCurrentState(oldCwd)
  if (!restoreState(newCwd)) {
    tabs.value = []
    activeTabId.value = null
    terminals.value = []
    activeTermId.value = null
    addTerminal()
  } else {
    applyLayout(true)
  }
})

// 项目详情：进入「终端」视图且已有项目路径时再建第一个 PTY（避免在文件状态页 onMounted 就建、cwd 不稳）。
// 加号：始终走 addTerminal()，依赖 projectRootRef / getBaseCwd。
// about:terminal：无项目路径，allowFirstTerminalWithoutCwd 为 true 时仍可自动建第一个。
watch(
  () => [props.isActive, projectRootRef.value, props.allowFirstTerminalWithoutCwd],
  ([active, root, allowEmpty]) => {
    if (!active || terminals.value.length > 0) return
    if (allowEmpty && !root) {
      addTerminal()
    }
  },
  { immediate: true }
)

onMounted(() => {
  register(ipcHandler)

  const ro = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      applyLayout(false)
    }, 100)
  })
  if (containerRef.value) {
    ro.observe(containerRef.value)
    containerRef.value._ro = ro
  }

  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null }
  document.removeEventListener('click', handleDocumentClick)
  containerRef.value?._ro?.disconnect()
  destroyTerminals(terminals.value)
  terminals.value = []
  for (const [, cached] of terminalCache) {
    destroyTerminals(cached.terminals)
  }
  terminalCache.clear()
  unregister(ipcHandler)
})

defineExpose({ clearTerminal, restartTerminal, ensureDefaultTerminal })
</script>

<style scoped>
.terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
  height: 36px;
  background: #252526;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}
.terminal-tabs::-webkit-scrollbar { height: 0; }
.terminal-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px 4px 0 0;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  flex-shrink: 0;
}
.terminal-tab:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
}
.terminal-tab.active {
  background: #1e1e1e;
  color: #d4d4d4;
  border-bottom-color: #007acc;
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
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #666;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}
.terminal-tab:hover .tab-close-btn { opacity: 1; }
.terminal-tab.active .tab-close-btn { opacity: 0.6; }
.tab-close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #d4d4d4;
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
  flex-shrink: 0;
  margin-left: 8px;
}
.terminal-path {
  color: #888;
  font-size: 11px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}
.terminal-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #d4d4d4;
}
.split-btn-icon {
  font-size: 12px;
  line-height: 1;
}
.terminal-body {
  flex: 1;
  padding: 8px;
  overflow: hidden;
  position: relative;
}
.terminal-single-pane {
  width: 100%;
  height: 100%;
  min-height: 0;
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
.terminal-pane + .terminal-pane {
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}
.terminal-body :deep(.xterm) { height: 100%; }
.terminal-body :deep(.xterm-viewport) {
  overflow-y: scroll !important;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  scrollbar-gutter: stable;
}
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar { width: 4px; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-track { background: transparent; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
.terminal-body :deep(.xterm-viewport)::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
.terminal-cwd-picker {
  position: relative;
}
.cwd-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: #252526;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
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
