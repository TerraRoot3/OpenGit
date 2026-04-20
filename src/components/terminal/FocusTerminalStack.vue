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
            @click="focusSession(s.id)"
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
      :class="[layoutRootClass, { 'is-5to4-transition': isFiveToFourTransition }]"
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
        @mousedown="focusSession(s.id)"
      >
        <TerminalPanel
          :snapshot-cache-key="paneSnapshotKey(s.id)"
          single-pane-chrome
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
import { TransitionGroup, computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import TerminalPanel from './TerminalPanel.vue'
import { useFocusTerminalStore } from '../../stores/focusTerminalStore.js'

defineProps({
  isActive: { type: Boolean, default: true }
})

const {
  sessions,
  focusedId,
  layoutReady,
  MAX_SESSIONS,
  hydrate,
  addSession,
  removeSession,
  focusSession
} = useFocusTerminalStore()

onMounted(() => {
  void hydrate()
})

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
const prevPaneRects = new Map()
let pendingCountFrom = count.value
const isFiveToFourTransition = ref(false)
let fiveToFourTimer = null
const UNIFIED_ANIM_MS = 360

function setPaneElRef(id, el) {
  if (el instanceof HTMLElement) paneElById.set(id, el)
  else paneElById.delete(id)
}

function capturePaneRects() {
  prevPaneRects.clear()
  for (const [id, el] of paneElById.entries()) {
    if (!(el instanceof HTMLElement) || !el.isConnected) continue
    prevPaneRects.set(id, el.getBoundingClientRect())
  }
}

function playPaneFlip() {
  if (!prevPaneRects.size) return
  for (const [id, el] of paneElById.entries()) {
    const prev = prevPaneRects.get(id)
    if (!prev || !(el instanceof HTMLElement) || !el.isConnected) continue
    const next = el.getBoundingClientRect()
    const sxRaw = next.width > 0 ? prev.width / next.width : 1
    const syRaw = next.height > 0 ? prev.height / next.height : 1
    // 缓和缩放幅度：减少跨行重排时终端内容重采样导致的“闪”
    const sx = 1 + (sxRaw - 1) * 0.55
    const sy = 1 + (syRaw - 1) * 0.55
    const needAnim = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01
    if (!needAnim) continue

    el.animate(
      [
        { transformOrigin: 'center center', transform: `scale(${sx}, ${sy})`, opacity: 1 },
        { transformOrigin: 'center center', transform: 'scale(1, 1)', opacity: 1 }
      ],
      {
        duration: UNIFIED_ANIM_MS,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both'
      }
    )
  }
  prevPaneRects.clear()
}

watch(
  count,
  (next, prev) => {
    pendingCountFrom = prev
    if (prev === 5 && next === 4) {
      isFiveToFourTransition.value = true
      if (fiveToFourTimer) clearTimeout(fiveToFourTimer)
      fiveToFourTimer = setTimeout(() => {
        isFiveToFourTransition.value = false
        fiveToFourTimer = null
      }, UNIFIED_ANIM_MS)
    }
    capturePaneRects()
  },
  { flush: 'pre' }
)
watch(
  count,
  (next) => {
    nextTick(() => {
      // 5 -> 4 变化跨度较大（3+2 -> 2x2），跳过 FLIP 可明显降低这一跳卡顿
      if (pendingCountFrom === 5 && next === 4) {
        prevPaneRects.clear()
        return
      }
      playPaneFlip()
    })
  },
  { flush: 'post' }
)

function playFocusPulse(sessionId) {
  if (isFiveToFourTransition.value) return
  const el = paneElById.get(sessionId)
  if (!(el instanceof HTMLElement) || !el.isConnected) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
  el.animate(
    [
      { transform: 'translateZ(0) scale(1)' },
      { transform: 'translateZ(0) scale(1.012)' },
      { transform: 'translateZ(0) scale(1.01)' }
    ],
    {
      duration: UNIFIED_ANIM_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'none'
    }
  )
}

watch(
  focusedId,
  (nextId, prevId) => {
    if (!nextId || nextId === prevId) return
    nextTick(() => {
      playFocusPulse(nextId)
    })
  },
  { flush: 'post' }
)

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
  const gridTemplateRows = padTemplateTracks(
    Array.from({ length: rows }, (_, r) => (r === focusRow ? FOCUS_FR : UNFOCUS_FR)).join(' '),
    MAX_GRID_ROWS
  )
  return { gridTemplateColumns, gridTemplateRows }
}

const layoutRootClass = computed(() => {
  const n = count.value
  if (n === 1) return 'layout--1'
  if (n === 2 || n === 3) return 'layout--row'
  return 'layout--grid'
})

const layoutRootStyle = computed(() => {
  const n = count.value
  const fi = focusIndex.value
  if (n === 2 || n === 3) return {}
  /** 上 3 下 2 / 上 4 下 3：12 列栅格，下排铺满整行 */
  if (n === 5) {
    const topFocused = fi <= 2
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: padTemplateTracks(rowsStr, MAX_GRID_ROWS),
      gap: '4px'
    }
  }
  if (n === 7) {
    const topFocused = fi <= 3
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: padTemplateTracks(rowsStr, MAX_GRID_ROWS),
      gap: '4px'
    }
  }
  if (n === 6) {
    const topFocused = fi <= 2
    const rowsStr = topFocused
      ? `${SPLIT_FOCUS_ROW_FR} ${SPLIT_UNFOCUS_ROW_FR}`
      : `${SPLIT_UNFOCUS_ROW_FR} ${SPLIT_FOCUS_ROW_FR}`
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: padTemplateTracks(rowsStr, MAX_GRID_ROWS),
      gap: '4px'
    }
  }
  if (n < 4) return {}
  const { cols, rows } = computeGridDims(n)
  const { gridTemplateColumns, gridTemplateRows } = gridStyleForFocus(fi, cols, rows)
  return {
    display: 'grid',
    gridTemplateColumns,
    gridTemplateRows,
    gap: '4px'
  }
})

function paneStyle(i) {
  const n = count.value
  if (n === 1) {
    return { flex: '1 1 auto', minWidth: 0, minHeight: 0 }
  }
  if (n === 2 || n === 3) {
    return {
      flex: i === focusIndex.value ? '3 1 0%' : '1 1 0%',
      minWidth: 0,
      minHeight: 0
    }
  }
  if (n === 5) {
    const base = { minWidth: 0, minHeight: 0 }
    const fi = focusIndex.value
    /** 与 2/3 个终端一致：聚焦格约 3:1 于同行其它格 */
    if (fi <= 2) {
      if (i <= 2) {
        if (fi === 0) {
          if (i === 0) return { ...base, gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '7 / span 3', gridRow: 1 }
          return { ...base, gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { ...base, gridColumn: '1 / span 3', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '4 / span 6', gridRow: 1 }
          return { ...base, gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (i === 0) return { ...base, gridColumn: '1 / span 3', gridRow: 1 }
        if (i === 1) return { ...base, gridColumn: '4 / span 3', gridRow: 1 }
        return { ...base, gridColumn: '7 / span 6', gridRow: 1 }
      }
      if (i === 3) return { ...base, gridColumn: '1 / span 6', gridRow: 2 }
      return { ...base, gridColumn: '7 / span 6', gridRow: 2 }
    }
    if (i <= 2) {
      return { ...base, gridColumn: `${i * 4 + 1} / span 4`, gridRow: 1 }
    }
    if (fi === 3) {
      if (i === 3) return { ...base, gridColumn: '1 / span 9', gridRow: 2 }
      return { ...base, gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 3) return { ...base, gridColumn: '1 / span 3', gridRow: 2 }
    return { ...base, gridColumn: '4 / span 9', gridRow: 2 }
  }
  if (n === 7) {
    const base = { minWidth: 0, minHeight: 0 }
    const fi = focusIndex.value
    if (fi <= 3) {
      if (i <= 3) {
        if (fi === 0) {
          if (i === 0) return { ...base, gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '7 / span 2', gridRow: 1 }
          if (i === 2) return { ...base, gridColumn: '9 / span 2', gridRow: 1 }
          return { ...base, gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { ...base, gridColumn: '1 / span 2', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '3 / span 6', gridRow: 1 }
          if (i === 2) return { ...base, gridColumn: '9 / span 2', gridRow: 1 }
          return { ...base, gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (fi === 2) {
          if (i === 0) return { ...base, gridColumn: '1 / span 2', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '3 / span 2', gridRow: 1 }
          if (i === 2) return { ...base, gridColumn: '5 / span 6', gridRow: 1 }
          return { ...base, gridColumn: '11 / span 2', gridRow: 1 }
        }
        if (i === 0) return { ...base, gridColumn: '1 / span 2', gridRow: 1 }
        if (i === 1) return { ...base, gridColumn: '3 / span 2', gridRow: 1 }
        if (i === 2) return { ...base, gridColumn: '5 / span 2', gridRow: 1 }
        return { ...base, gridColumn: '7 / span 6', gridRow: 1 }
      }
      const bi = i - 4
      return { ...base, gridColumn: `${bi * 4 + 1} / span 4`, gridRow: 2 }
    }
    if (i <= 3) {
      return { ...base, gridColumn: `${i * 3 + 1} / span 3`, gridRow: 1 }
    }
    if (fi === 4) {
      if (i === 4) return { ...base, gridColumn: '1 / span 6', gridRow: 2 }
      if (i === 5) return { ...base, gridColumn: '7 / span 3', gridRow: 2 }
      return { ...base, gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (fi === 5) {
      if (i === 4) return { ...base, gridColumn: '1 / span 3', gridRow: 2 }
      if (i === 5) return { ...base, gridColumn: '4 / span 6', gridRow: 2 }
      return { ...base, gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 4) return { ...base, gridColumn: '1 / span 3', gridRow: 2 }
    if (i === 5) return { ...base, gridColumn: '4 / span 3', gridRow: 2 }
    return { ...base, gridColumn: '7 / span 6', gridRow: 2 }
  }
  if (n === 6) {
    const base = { minWidth: 0, minHeight: 0 }
    const fi = focusIndex.value
    if (fi <= 2) {
      if (i <= 2) {
        if (fi === 0) {
          if (i === 0) return { ...base, gridColumn: '1 / span 6', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '7 / span 3', gridRow: 1 }
          return { ...base, gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (fi === 1) {
          if (i === 0) return { ...base, gridColumn: '1 / span 3', gridRow: 1 }
          if (i === 1) return { ...base, gridColumn: '4 / span 6', gridRow: 1 }
          return { ...base, gridColumn: '10 / span 3', gridRow: 1 }
        }
        if (i === 0) return { ...base, gridColumn: '1 / span 3', gridRow: 1 }
        if (i === 1) return { ...base, gridColumn: '4 / span 3', gridRow: 1 }
        return { ...base, gridColumn: '7 / span 6', gridRow: 1 }
      }
      const bi = i - 3
      return { ...base, gridColumn: `${bi * 4 + 1} / span 4`, gridRow: 2 }
    }
    if (i <= 2) {
      return { ...base, gridColumn: `${i * 4 + 1} / span 4`, gridRow: 1 }
    }
    if (fi === 3) {
      if (i === 3) return { ...base, gridColumn: '1 / span 6', gridRow: 2 }
      if (i === 4) return { ...base, gridColumn: '7 / span 3', gridRow: 2 }
      return { ...base, gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (fi === 4) {
      if (i === 3) return { ...base, gridColumn: '1 / span 3', gridRow: 2 }
      if (i === 4) return { ...base, gridColumn: '4 / span 6', gridRow: 2 }
      return { ...base, gridColumn: '10 / span 3', gridRow: 2 }
    }
    if (i === 3) return { ...base, gridColumn: '1 / span 3', gridRow: 2 }
    if (i === 4) return { ...base, gridColumn: '4 / span 3', gridRow: 2 }
    return { ...base, gridColumn: '7 / span 6', gridRow: 2 }
  }
  return { minWidth: 0, minHeight: 0 }
}
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
  background: #1a1b1e;
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
  padding: 4px 10px 0 0;
  min-height: 0;
  border-bottom: 1px solid rgba(214, 176, 74, 0.18);
  background: rgba(0, 0, 0, 0.2);
}

.focus-terminal-tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 0;
}

.focus-terminal-tabs::-webkit-scrollbar {
  height: 0;
}

.focus-tablist {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  flex: 0 0 auto;
  min-width: 0;
  position: relative;
}

.focus-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 30px;
  box-sizing: border-box;
  border-radius: 8px 8px 0 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  border-bottom: 2px solid transparent;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}

.focus-tab:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.82);
}

.focus-tab.is-active {
  background: rgba(74, 144, 255, 0.2);
  color: #cfe5ff;
  border-bottom-color: #4a90ff;
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
  color: rgba(255, 255, 255, 0.45);
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
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
  opacity: 1 !important;
}

.toolbar-add-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  padding: 0;
  margin-left: 2px;
  margin-bottom: 0;
  color: rgba(255, 255, 255, 0.75);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.toolbar-add-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
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
}

.layout--1 {
  display: flex;
  flex-direction: column;
}

.layout--row {
  display: flex;
  flex-direction: row;
  gap: 4px;
}

.layout--row .focus-terminal-pane {
  transition: none;
}

.layout--grid {
  transition: none;
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

/* 分格：进场轻微上移 + 淡入；退场仅淡出（避免 scale + 格线同时变导致糊、抖） */
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
  transform: scale(0.96);
}

.focus-pane-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

.focus-pane-move {
  transition: none;
}

/* 5->4 专项：禁用 scale，仅快速淡出，减少大重排阶段卡顿 */
.is-5to4-transition .focus-pane-leave-active {
  transition: opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.is-5to4-transition .focus-pane-leave-to {
  opacity: 0;
  transform: none;
}

.focus-terminal-pane {
  position: relative;
  min-width: 0;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid rgba(214, 176, 74, 0.16);
  z-index: 0;
  transform: translateZ(0) scale(1);
  backface-visibility: hidden;
  contain: layout paint;
  isolation: isolate;
  will-change: transform;
  transform-origin: center center;
  transition:
    transform 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 非聚焦：与分屏非激活一致的暖色蒙层（用 opacity 过渡，聚焦切换更柔和） */
.focus-terminal-pane::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(214, 176, 74, 0.06);
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
  transform: translateZ(0) scale(1.01);
  animation: none;
  border-color: #4a90ff;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.3),
    0 0 14px rgba(74, 144, 255, 0.28);
}

/* 标题栏：聚焦蓝、未聚焦偏黄，和外层边框/蒙层形成统一层级 */
.focus-terminal-pane :deep(.terminal-header) {
  border-bottom: 1px solid rgba(214, 176, 74, 0.16);
  background: rgba(214, 176, 74, 0.025);
}

.focus-terminal-pane.is-focused :deep(.terminal-header) {
  border-bottom-color: rgba(74, 144, 255, 0.88);
  background: rgba(74, 144, 255, 0.12);
}

.layout--1 .focus-terminal-pane {
  flex: 1 1 auto;
}

</style>
