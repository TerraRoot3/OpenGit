<template>
  <div class="focus-terminal-stack">
    <div class="focus-terminal-toolbar">
      <div class="focus-terminal-tabs">
        <TransitionGroup
          name="focus-tab"
          tag="div"
          class="focus-tablist"
          role="tablist"
          aria-label="终端标签"
          aria-orientation="horizontal"
        >
          <div
            v-for="s in sessions"
            :key="s.id"
            :id="'focus-tab-' + s.id"
            class="focus-tab"
            :class="{ 'is-active': focusedId === s.id }"
            role="tab"
            :aria-selected="focusedId === s.id"
            :ref="(el) => setTabElRef(s.id, el)"
            @click="activateSession(s.id)"
          >
            <span class="focus-tab__label" :title="tabLabel(s.id)">{{ tabLabel(s.id) }}</span>
            <button
              v-if="sessions.length > 1"
              type="button"
              class="focus-tab__close"
              title="关闭"
              aria-label="关闭此终端"
              @mousedown.prevent.stop
              @click.stop="removeSession(s.id)"
            >
              <X :size="12" />
            </button>
          </div>
        </TransitionGroup>
        <button
          type="button"
          class="toolbar-add-btn"
          :title="sessions.length >= MAX_SESSIONS ? '最多 9 个终端' : '添加终端'"
          :disabled="sessions.length >= MAX_SESSIONS"
          @click="addSession"
        >
          <Plus :size="18" />
        </button>
      </div>
    </div>
    <TransitionGroup
      v-if="layoutReady"
      name="focus-pane"
      tag="div"
      class="focus-terminal-layout"
      :class="layoutRootClass"
      :style="layoutRootStyle"
    >
      <!-- 单一 v-for：切勿在 n=5 时换另一套 DOM（上三下二），否则从 4→5 会卸载重建全部 TerminalPanel，快照重放 + 旧 PTY 断开 -->
      <div
        v-for="(s, i) in sessions"
        :key="s.id"
        class="focus-terminal-pane"
        :class="{ 'is-focused': focusedId === s.id }"
        :ref="(el) => setPaneElRef(s.id, el)"
        :style="paneStyle(i)"
        @mousedown.capture="handlePaneMouseDown(s.id, $event)"
      >
        <TerminalPanel
          :ref="(el) => setPanelRef(s.id, el)"
          :default-cwd="defaultCwd"
          :snapshot-cache-key="paneSnapshotKey(s.id)"
          single-pane-chrome
          :suspend-single-pane-resize="activatingSessionId !== ''"
          :show-close-button="sessions.length > 1"
          :allow-first-terminal-without-cwd="true"
          :is-active="isActive"
          :focus-pane-focused="focusedId === s.id"
          @pane-title="(t) => setPaneTitle(s.id, t)"
          @close="removeSession(s.id)"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { TransitionGroup, computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import TerminalPanel from './TerminalPanel.vue'
import { useFocusTerminalStore } from '../../stores/focusTerminalStore.js'

defineProps({
  isActive: { type: Boolean, default: true },
  defaultCwd: { type: String, default: '' }
})

const {
  sessions,
  focusedId,
  layoutReady,
  MAX_SESSIONS,
  hydrate,
  resetLayout,
  addSession,
  removeSession,
  focusSession
} = useFocusTerminalStore()

onMounted(() => {
  void hydrate()
})

const PANE_LAYOUT_SETTLE_TIMEOUT_MS = 900
let activationSequence = 0
let pendingActivationCleanup = null
const activatingSessionId = ref('')

/** 与各 TerminalPanel 顶栏 tabTitlePart 同步（主进程/Shell onTitleChange） */
const paneTitles = reactive({})

function setPaneTitle(sessionId, title) {
  if (typeof title === 'string' && title.trim()) {
    paneTitles[sessionId] = title.trim()
  }
}

function tabLabel(sessionId) {
  const t = paneTitles[sessionId]
  return typeof t === 'string' && t.trim() ? t.trim() : '终端'
}

async function activateSession(sessionId) {
  if (!sessionId) return
  activationSequence += 1
  const sequence = activationSequence
  const isAlreadyFocused = focusedId.value === sessionId
  focusSession(sessionId)
  clearPendingActivationWait()
  activatingSessionId.value = isAlreadyFocused ? '' : sessionId
  await nextTick()
  if (isAlreadyFocused) {
    panelRefById.get(sessionId)?.focusCurrentTerminalLightweight?.()
    return
  }
  await waitForPaneLayoutSettled()
  if (sequence !== activationSequence) return
  activatingSessionId.value = ''
  panelRefById.get(sessionId)?.revealCurrentTerminalAfterAnimation?.()
}

function clearPendingActivationWait() {
  if (typeof pendingActivationCleanup === 'function') {
    pendingActivationCleanup()
    pendingActivationCleanup = null
  }
}

function buildPaneLayoutSignature() {
  const entries = Array.from(paneElById.entries()).sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
  if (!entries.length) return ''
  return entries.map(([sessionId, paneEl]) => {
    if (!(paneEl instanceof HTMLElement) || !paneEl.isConnected) {
      return `${sessionId}:missing`
    }
    const rect = paneEl.getBoundingClientRect()
    return [
      sessionId,
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height)
    ].join(':')
  }).join('|')
}

function waitForPaneLayoutSettled() {
  return new Promise((resolve) => {
    let finished = false
    let rafId = 0
    let stableFrames = 0
    let lastSignature = ''
    const startedAt = performance.now()

    const finalize = () => {
      if (finished) return
      finished = true
      cleanup()
      resolve()
    }

    const tick = () => {
      const signature = buildPaneLayoutSignature()
      if (!signature) {
        finalize()
        return
      }
      if (signature === lastSignature) {
        stableFrames += 1
      } else {
        lastSignature = signature
        stableFrames = 0
      }
      if (stableFrames >= 1 || performance.now() - startedAt >= PANE_LAYOUT_SETTLE_TIMEOUT_MS) {
        finalize()
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    const cleanup = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      if (pendingActivationCleanup === cleanup) {
        pendingActivationCleanup = null
      }
    }

    pendingActivationCleanup = cleanup
    rafId = requestAnimationFrame(tick)
  })
}

function handlePaneMouseDown(sessionId, event) {
  if (!sessionId) return
  if (focusedId.value === sessionId && activatingSessionId.value !== sessionId) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  void activateSession(sessionId)
}

watch(
  sessions,
  (list) => {
    const ids = new Set(list.map((s) => s.id))
    for (const key of Object.keys(paneTitles)) {
      if (!ids.has(key)) delete paneTitles[key]
    }
  },
  { deep: true }
)

/** 标签 DOM，用于当前会话标签滚入可视区 */
const tabElById = new Map()

function setTabElRef(id, el) {
  if (el) tabElById.set(id, el)
  else tabElById.delete(id)
}

function scrollFocusedTabIntoView() {
  const el = tabElById.get(focusedId.value)
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

watch(focusedId, () => {
  nextTick(() => {
    scrollFocusedTabIntoView()
  })
})

function paneSnapshotKey(sessionId) {
  return `focus-pane:${sessionId}`
}

const focusIndex = computed(() =>
  sessions.value.findIndex((s) => s.id === focusedId.value)
)

const count = computed(() => sessions.value.length)
const paneElById = new Map()
const panelRefById = new Map()
const PANE_GAP_PX = 4

function setPaneElRef(id, el) {
  if (el instanceof HTMLElement) paneElById.set(id, el)
  else paneElById.delete(id)
}

function setPanelRef(id, panel) {
  if (panel) panelRefById.set(id, panel)
  else panelRefById.delete(id)
}

/** n≥4：选列/行数，避免单行铺满；在候选方案中优先更少空白格、更接近正方形、略偏宽屏 */
function computeGridDims(n) {
  if (n <= 1) return { cols: 1, rows: 1 }
  const candidates = []
  for (let c = 2; c <= n; c++) {
    const r = Math.ceil(n / c)
    if (r === 1 && n >= 4) continue
    const empty = c * r - n
    candidates.push({ cols: c, rows: r, empty })
  }
  if (!candidates.length) {
    const c = Math.max(2, Math.ceil(Math.sqrt(n)))
    return { cols: c, rows: Math.ceil(n / c) }
  }
  candidates.sort((a, b) => {
    if (a.empty !== b.empty) return a.empty - b.empty
    const diffA = Math.abs(a.cols - a.rows)
    const diffB = Math.abs(b.cols - b.rows)
    if (diffA !== diffB) return diffA - diffB
    return b.cols - a.cols
  })
  const best = candidates[0]
  return { cols: best.cols, rows: best.rows }
}

/** 聚焦格相对更大：3:1（原 2:1） */
const FOCUS_FR = '3fr'
const UNFOCUS_FR = '1fr'

/** 上 3 下 2 / 上 4 下 3 专用：两行分割要比通用网格更「压」非聚焦行 */
const SPLIT_FOCUS_ROW_FR = '6fr'
const SPLIT_UNFOCUS_ROW_FR = '1fr'

/**
 * 固定行轨道数，用 0fr 占位未用行，这样 grid-template-rows 在行数变化时仍可插值过渡
 *（否则从「两行」变成「三行」会因轨道条数变化而无法动画）
 */
const MAX_GRID_ROWS = 4

function padTemplateTracks(tracksStr, targetLen, fill = '0fr') {
  const parts = tracksStr
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const out = [...parts]
  while (out.length < targetLen) out.push(fill)
  return out.join(' ')
}

function gridStyleForFocus(focusIdx, cols, rows) {
  const safe = Math.max(0, Math.min(focusIdx, cols * rows - 1))
  const focusRow = Math.floor(safe / cols)
  const focusCol = safe % cols
  const gridTemplateColumns = Array.from({ length: cols }, (_, c) => (c === focusCol ? FOCUS_FR : UNFOCUS_FR)).join(' ')
  const gridTemplateRows = Array.from({ length: rows }, (_, r) => (r === focusRow ? FOCUS_FR : UNFOCUS_FR)).join(' ')
  return { gridTemplateColumns, gridTemplateRows }
}

const layoutRootClass = computed(() => {
  return 'layout--absolute'
})

const layoutRootStyle = computed(() => {
  const n = count.value
  const fi = focusIndex.value
  if (n <= 0) return {}
  if (n === 1) {
    return {
      gridTemplateColumns: '1fr',
      gridTemplateRows: '1fr',
      gap: `${PANE_GAP_PX}px`
    }
  }
  if (n === 2 || n === 3) {
    return {
      gridTemplateColumns: Array.from({ length: n }, (_, index) => (index === fi ? FOCUS_FR : UNFOCUS_FR)).join(' '),
      gridTemplateRows: '1fr',
      gap: `${PANE_GAP_PX}px`
    }
  }
  /** 上 3 下 2 / 上 4 下 3：12 列栅格，下排铺满整行 */
  if (n === 5) {
    const topFocused = fi <= 2
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: rowsStr,
      gap: `${PANE_GAP_PX}px`
    }
  }
  if (n === 7) {
    const topFocused = fi <= 3
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: rowsStr,
      gap: `${PANE_GAP_PX}px`
    }
  }
  if (n === 6) {
    const topFocused = fi <= 2
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: rowsStr,
      gap: `${PANE_GAP_PX}px`
    }
  }
  if (n < 4) return {}
  const { cols, rows } = computeGridDims(n)
  const { gridTemplateColumns, gridTemplateRows } = gridStyleForFocus(fi, cols, rows)
  return {
    gridTemplateColumns,
    gridTemplateRows,
    gap: `${PANE_GAP_PX}px`
  }
})

function panePlacement(i) {
  const n = count.value
  if (n === 1) {
    return { gridColumn: '1 / span 1', gridRow: 1 }
  }
  if (n === 2 || n === 3) {
    return { gridColumn: `${i + 1} / span 1`, gridRow: 1 }
  }
  if (n === 5) {
    const fi = focusIndex.value
    /** 与 2/3 个终端一致：聚焦格约 3:1 于同行其它格 */
    if (fi <= 2) {
      if (i <= 2) {
        if (fi === 0) {
          if (i === 0) return { gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { gridColumn: '7 / span 3', gridRow: 1 }
          return { gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { gridColumn: '1 / span 3', gridRow: 1 }
          if (i === 1) return { gridColumn: '4 / span 6', gridRow: 1 }
          return { gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (i === 0) return { gridColumn: '1 / span 3', gridRow: 1 }
        if (i === 1) return { gridColumn: '4 / span 3', gridRow: 1 }
        return { gridColumn: '7 / span 6', gridRow: 1 }
      }
      if (i === 3) return { gridColumn: '1 / span 6', gridRow: 2 }
      return { gridColumn: '7 / span 6', gridRow: 2 }
    }
    if (i <= 2) {
      return { gridColumn: `${i * 4 + 1} / span 4`, gridRow: 1 }
    }
    if (fi === 3) {
      if (i === 3) return { gridColumn: '1 / span 9', gridRow: 2 }
      return { gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 3) return { gridColumn: '1 / span 3', gridRow: 2 }
    return { gridColumn: '4 / span 9', gridRow: 2 }
  }
  if (n === 7) {
    const fi = focusIndex.value
    if (fi <= 3) {
      if (i <= 3) {
        if (fi === 0) {
          if (i === 0) return { gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { gridColumn: '7 / span 2', gridRow: 1 }
          if (i === 2) return { gridColumn: '9 / span 2', gridRow: 1 }
          return { gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { gridColumn: '1 / span 2', gridRow: 1 }
          if (i === 1) return { gridColumn: '3 / span 6', gridRow: 1 }
          if (i === 2) return { gridColumn: '9 / span 2', gridRow: 1 }
          return { gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (fi === 2) {
          if (i === 0) return { gridColumn: '1 / span 2', gridRow: 1 }
          if (i === 1) return { gridColumn: '3 / span 2', gridRow: 1 }
          if (i === 2) return { gridColumn: '5 / span 6', gridRow: 1 }
          return { gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (i === 0) return { gridColumn: '1 / span 2', gridRow: 1 }
        if (i === 1) return { gridColumn: '3 / span 2', gridRow: 1 }
        if (i === 2) return { gridColumn: '5 / span 2', gridRow: 1 }
        return { gridColumn: '7 / span 6', gridRow: 1 }
      }
      const bi = i - 4
      return { gridColumn: `${bi * 4 + 1} / span 4`, gridRow: 2 }
    }
    if (i <= 3) {
      return { gridColumn: `${i * 3 + 1} / span 3`, gridRow: 1 }
    }
    if (fi === 4) {
      if (i === 4) return { gridColumn: '1 / span 6', gridRow: 2 }
      if (i === 5) return { gridColumn: '7 / span 3', gridRow: 2 }
      return { gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (fi === 5) {
      if (i === 4) return { gridColumn: '1 / span 3', gridRow: 2 }
      if (i === 5) return { gridColumn: '4 / span 6', gridRow: 2 }
      return { gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 4) return { gridColumn: '1 / span 3', gridRow: 2 }
    if (i === 5) return { gridColumn: '4 / span 3', gridRow: 2 }
    return { gridColumn: '7 / span 6', gridRow: 2 }
  }
  if (n === 6) {
    const fi = focusIndex.value
    if (fi <= 2) {
      if (i <= 2) {
        if (fi === 0) {
          if (i === 0) return { gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { gridColumn: '7 / span 3', gridRow: 1 }
          return { gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { gridColumn: '1 / span 3', gridRow: 1 }
          if (i === 1) return { gridColumn: '4 / span 6', gridRow: 1 }
          return { gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (i === 0) return { gridColumn: '1 / span 3', gridRow: 1 }
        if (i === 1) return { gridColumn: '4 / span 3', gridRow: 1 }
        return { gridColumn: '7 / span 6', gridRow: 1 }
      }
      const bi = i - 3
      return { gridColumn: `${bi * 4 + 1} / span 4`, gridRow: 2 }
    }
    if (i <= 2) {
      return { gridColumn: `${i * 4 + 1} / span 4`, gridRow: 1 }
    }
    if (fi === 3) {
      if (i === 3) return { gridColumn: '1 / span 6', gridRow: 2 }
      if (i === 4) return { gridColumn: '7 / span 3', gridRow: 2 }
      return { gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (fi === 4) {
      if (i === 3) return { gridColumn: '1 / span 3', gridRow: 2 }
      if (i === 4) return { gridColumn: '4 / span 6', gridRow: 2 }
      return { gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 3) return { gridColumn: '1 / span 3', gridRow: 2 }
    if (i === 4) return { gridColumn: '4 / span 3', gridRow: 2 }
    return { gridColumn: '7 / span 6', gridRow: 2 }
  }
  const { cols } = computeGridDims(n)
  return {
    gridColumn: `${(i % cols) + 1} / span 1`,
    gridRow: Math.floor(i / cols) + 1
  }
}

function parseFrTracks(trackDef = '') {
  const source = String(trackDef || '').trim()
  if (!source) return [1]

  const repeatMatch = source.match(/^repeat\(\s*(\d+)\s*,\s*([^)]+)\)$/i)
  if (repeatMatch) {
    const count = Number.parseInt(repeatMatch[1], 10)
    const trackValue = Number.parseFloat(String(repeatMatch[2]).replace('fr', '').trim())
    if (Number.isFinite(count) && count > 0 && Number.isFinite(trackValue) && trackValue > 0) {
      return Array.from({ length: count }, () => trackValue)
    }
  }

  return source
    .split(/\s+/)
    .filter(Boolean)
    .map(part => {
      const numeric = Number.parseFloat(part.replace('fr', '').trim())
      return Number.isFinite(numeric) ? numeric : 0
    })
    .filter(value => value > 0)
}

function normalizePlacementAxis(value) {
  if (typeof value === 'number') {
    return { start: value, span: 1 }
  }
  const source = String(value || '').trim()
  const match = source.match(/^(\d+)\s*\/\s*span\s*(\d+)$/)
  if (match) {
    return {
      start: Number.parseInt(match[1], 10),
      span: Number.parseInt(match[2], 10)
    }
  }
  const single = Number.parseInt(source, 10)
  if (Number.isFinite(single)) {
    return { start: single, span: 1 }
  }
  return { start: 1, span: 1 }
}

function sumTrackRange(tracks, startIndex, span) {
  return tracks.slice(startIndex, startIndex + span).reduce((total, value) => total + value, 0)
}

function buildAxisRect(tracks, placement, gapPx) {
  const totalFr = tracks.reduce((total, value) => total + value, 0) || 1
  const beforeFr = sumTrackRange(tracks, 0, Math.max(0, placement.start - 1))
  const spanFr = sumTrackRange(tracks, Math.max(0, placement.start - 1), placement.span) || 1
  const totalGapPx = Math.max(0, tracks.length - 1) * gapPx
  const beforeGapPx = Math.max(0, placement.start - 1) * gapPx
  const innerGapPx = Math.max(0, placement.span - 1) * gapPx
  return {
    offset: `calc((100% - ${totalGapPx}px) * ${beforeFr} / ${totalFr} + ${beforeGapPx}px)`,
    size: `calc((100% - ${totalGapPx}px) * ${spanFr} / ${totalFr} + ${innerGapPx}px)`
  }
}

function paneStyle(i) {
  const placement = panePlacement(i)
  const rootStyle = layoutRootStyle.value || {}
  const gapPx = Number.parseFloat(String(rootStyle.gap || PANE_GAP_PX)) || PANE_GAP_PX
  const cols = parseFrTracks(rootStyle.gridTemplateColumns || '1fr')
  const rows = parseFrTracks(rootStyle.gridTemplateRows || '1fr')
  const colPlacement = normalizePlacementAxis(placement.gridColumn)
  const rowPlacement = normalizePlacementAxis(placement.gridRow)
  const horizontal = buildAxisRect(cols, colPlacement, gapPx)
  const vertical = buildAxisRect(rows, rowPlacement, gapPx)
  return {
    position: 'absolute',
    left: horizontal.offset,
    top: vertical.offset,
    width: horizontal.size,
    height: vertical.size,
    minWidth: 0,
    minHeight: 0
  }
}

async function runCommand(command, options = {}) {
  const wantsDedicatedPane = !!options?.forceNewTerminal
  if (wantsDedicatedPane && sessions.value.length >= MAX_SESSIONS) {
    return false
  }
  if (wantsDedicatedPane) {
    addSession()
    await nextTick()
  }

  const targetId = focusedId.value || sessions.value[0]?.id
  if (!targetId) return false
  const panel = panelRefById.get(targetId)
  if (!panel?.runCommand) return false
  return panel.runCommand(command, options)
}

defineExpose({ runCommand })

onUnmounted(() => {
  clearPendingActivationWait()
  activatingSessionId.value = ''
  resetLayout()
})
</script>

<style scoped>
.focus-terminal-stack {
  --focus-pane-transition: 0.36s cubic-bezier(0.22, 1, 0.36, 1);
  /* 标签 / 分格列表进出场：与网格重排分开，少用 scale 避免与 grid 打架 */
  --focus-list-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --focus-tab-enter-dur: 0.36s;
  --focus-tab-leave-dur: 0.36s;
  --focus-pane-enter-dur: 0.36s;
  --focus-pane-leave-dur: 0.36s;
  --focus-pane-move-dur: 0.36s;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-workspace-bg);
  border-radius: var(--app-selected-radius);
  overflow: hidden;
  min-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .focus-terminal-stack {
    --focus-pane-transition: 0.01s;
    --focus-tab-enter-dur: 0.01s;
    --focus-tab-leave-dur: 0.01s;
    --focus-pane-enter-dur: 0.01s;
    --focus-pane-leave-dur: 0.01s;
    --focus-pane-move-dur: 0.01s;
  }

  .focus-terminal-pane.is-focused {
    animation: none;
  }
}

.focus-terminal-toolbar {
  flex-shrink: 0;
  padding: 0;
  min-height: 0;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface-1) 82%, transparent);
}

.focus-terminal-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  height: 40px;
  min-height: 40px;
}

.focus-terminal-tabs::-webkit-scrollbar {
  height: 0;
}

.focus-tablist {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  min-width: 0;
  position: relative;
  height: 100%;
}

.focus-tab {
  display: inline-flex;
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
  flex-shrink: 0;
  border-bottom: 2px solid transparent;
  transition: background-color 0.2s ease, color 0.2s ease;
  user-select: none;
}

.focus-tab:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
}

.focus-tab.is-active {
  background: var(--app-tab-selected-bg);
  box-shadow: none;
  color: var(--app-text-primary);
  border-bottom-color: transparent;
  border-radius: var(--app-selected-radius);
}

.focus-tab__label {
  max-width: 140px;
  padding: 0 4px;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.focus-tab__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--app-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}

.focus-tab:hover .focus-tab__close {
  opacity: 1;
}

.focus-tab.is-active .focus-tab__close {
  opacity: 0.55;
}

.focus-tab__close:hover {
  background: color-mix(in srgb, var(--app-hover) 60%, white 40%);
  color: var(--app-text-primary);
  opacity: 1 !important;
}

.toolbar-add-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-left: 2px;
  margin-bottom: 0;
  color: var(--app-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.toolbar-add-btn:hover:not(:disabled) {
  background: var(--app-hover);
  border-color: var(--app-border-strong);
  color: var(--app-text-primary);
}

.toolbar-add-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.focus-terminal-layout {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

/* TransitionGroup：标签（与「+」同侧，新标签从右侧轻量滑入；关闭向左淡出） */
.focus-tab-enter-active {
  transition: none;
}

.focus-tab-leave-active {
  transition:
    opacity var(--focus-tab-leave-dur) var(--focus-list-ease),
    transform var(--focus-tab-leave-dur) var(--focus-list-ease);
}

.focus-tab-enter-from {
  opacity: 1;
  transform: none;
}

.focus-tab-leave-to {
  opacity: 0;
  transform: translate3d(-12px, 0, 0);
}

.focus-tab-move {
  transition: none;
}

/* 分格：进场轻微位移 + 淡入；退场仅淡出。重排由 left/top/width/height 统一补间。 */
.focus-pane-enter-active {
  transition:
    opacity var(--focus-pane-enter-dur) var(--focus-list-ease),
    transform var(--focus-pane-enter-dur) var(--focus-list-ease);
}

.focus-pane-leave-active {
  transition: opacity var(--focus-pane-leave-dur) var(--focus-list-ease);
}

.focus-pane-enter-from {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

.focus-pane-leave-to {
  opacity: 0;
  transform: translate3d(0, -10px, 0);
}

.focus-pane-move {
  transition: none;
}

.focus-terminal-pane {
  position: absolute;
  min-width: 0;
  min-height: 0;
  border-radius: var(--app-selected-radius);
  overflow: hidden;
  box-sizing: border-box;
  border: none;
  z-index: 0;
  contain: layout paint;
  isolation: isolate;
  will-change: left, top, width, height, border-color, box-shadow;
  transition:
    left 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    top 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 非聚焦：与分屏非激活一致的暖色蒙层（用 opacity 过渡，聚焦切换更柔和） */
.focus-terminal-pane::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--app-warning-bg) 70%, transparent);
  pointer-events: none;
  z-index: 5;
  opacity: 1;
  transition: opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.focus-terminal-pane.is-focused::after {
  opacity: 0;
}

/* 聚焦：无描边，仅层级 + 较轻外发光（大模糊易掉帧） */
.focus-terminal-pane.is-focused {
  z-index: 2;
  animation: none;
  border-color: transparent;
  box-shadow: none;
}

/* 标题栏：聚焦蓝、未聚焦偏黄，和外层边框/蒙层形成统一层级 */
.focus-terminal-pane :deep(.terminal-header) {
  border-bottom: 1px solid var(--app-warning-border);
  background: color-mix(in srgb, var(--app-warning-bg) 55%, transparent);
}

.focus-terminal-pane.is-focused :deep(.terminal-header) {
  border-bottom-color: var(--app-info-border);
  background: color-mix(in srgb, var(--app-info-bg) 70%, transparent);
}

</style>
