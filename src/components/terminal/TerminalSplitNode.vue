<template>
  <div
    v-if="isLeaf"
    ref="paneRootRef"
    class="terminal-pane"
    :data-pane-root-term-id="node.termId"
    :data-pane-root-node-id="node.nodeId"
    :class="{
      inactive: activeTermId !== node.termId,
      'liquid-style': liquidStyle,
      'is-drop-target': dropTargetTermId === node.termId && draggingTermId && draggingTermId !== node.termId,
      'is-dragging': draggingTermId === node.termId
    }"
  >
    <div
      v-if="showPaneTopbar"
      class="terminal-pane-topbar"
      :class="{ draggable: closable }"
      @click="handleTopbarClick"
      @mousedown.left.stop="handleDragMouseDown"
    >
      <div class="terminal-pane-meta">
        <span class="terminal-pane-title" :title="paneLabel">{{ paneLabel }}</span>
        <span v-if="paneCwd" class="terminal-pane-sep" aria-hidden="true">·</span>
        <span v-if="paneCwd" class="terminal-pane-cwd" :title="paneCwd">{{ paneCwd }}</span>
      </div>
      <div class="terminal-pane-actions">
        <button
          class="pane-action-btn"
          title="清屏"
          @mousedown.prevent.stop
          @click.stop="emit('pane-clear', node.termId)"
        >
          <Eraser :size="14" />
        </button>
        <button
          class="pane-action-btn"
          title="重启终端"
          @mousedown.prevent.stop
          @click.stop="emit('pane-restart', node.termId)"
        >
          <RefreshCw :size="14" />
        </button>
        <button
          v-if="closable"
          class="pane-action-btn pane-close-btn"
          title="关闭分屏"
          @mousedown.prevent.stop
          @click.stop="emit('pane-close', node.termId)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
    <div
      class="terminal-pane-content"
      :data-term-id="node.termId"
      :ref="setPaneRef"
      @mousedown="emit('pane-focus', node.termId)"
      @dragover.prevent
      @drop.prevent="emit('pane-drop', $event, node.termId)"
    ></div>
  </div>
  <div
    v-else
    ref="splitNodeRef"
    class="terminal-split-tree"
    :class="splitAxisClass"
  >
    <div class="terminal-split-child" :style="firstChildStyle">
      <TerminalSplitNode
        :node="node.children[0]"
        :active-term-id="activeTermId"
        :pane-title-resolver="paneTitleResolver"
        :pane-cwd-resolver="paneCwdResolver"
        :liquid-style="liquidStyle"
        :show-pane-topbar="showPaneTopbar"
        :closable="closable"
        :dragging-term-id="draggingTermId"
        :drop-target-term-id="dropTargetTermId"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
        @pane-clear="forwardPaneClear"
        @pane-restart="forwardPaneRestart"
        @pane-drop="forwardPaneDrop"
        @start-resize="forwardResizeStart"
        @pane-drag-start="forwardPaneDragStart"
        @pane-drag-end="forwardPaneDragEnd"
      />
    </div>
    <div
      class="terminal-split-divider"
      :class="splitAxisClass"
      @mousedown.prevent="handleResizeMouseDown"
    ></div>
    <div class="terminal-split-child" :style="secondChildStyle">
      <TerminalSplitNode
        :node="node.children[1]"
        :active-term-id="activeTermId"
        :pane-title-resolver="paneTitleResolver"
        :pane-cwd-resolver="paneCwdResolver"
        :liquid-style="liquidStyle"
        :show-pane-topbar="showPaneTopbar"
        :closable="closable"
        :dragging-term-id="draggingTermId"
        :drop-target-term-id="dropTargetTermId"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
        @pane-clear="forwardPaneClear"
        @pane-restart="forwardPaneRestart"
        @pane-drop="forwardPaneDrop"
        @start-resize="forwardResizeStart"
        @pane-drag-start="forwardPaneDragStart"
        @pane-drag-end="forwardPaneDragEnd"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X, Eraser, RefreshCw } from 'lucide-vue-next'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  activeTermId: {
    type: String,
    default: ''
  },
  paneTitleResolver: {
    type: Function,
    default: null
  },
  paneCwdResolver: {
    type: Function,
    default: null
  },
  liquidStyle: {
    type: Boolean,
    default: false
  },
  showPaneTopbar: {
    type: Boolean,
    default: true
  },
  closable: {
    type: Boolean,
    default: false
  },
  draggingTermId: {
    type: String,
    default: ''
  },
  dropTargetTermId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'pane-element-change',
  'pane-focus',
  'pane-close',
  'pane-clear',
  'pane-restart',
  'pane-drop',
  'start-resize',
  'pane-drag-start',
  'pane-drag-end'
])

const paneElRef = ref(null)
const paneRootRef = ref(null)
const splitNodeRef = ref(null)
const suppressTopbarClick = ref(false)

const isLeaf = computed(() => props.node?.type === 'leaf')
const splitAxisClass = computed(() => props.node?.direction === 'column' ? 'is-column' : 'is-row')
const paneLabel = computed(() => {
  if (props.node?.type !== 'leaf') return '终端'
  return props.paneTitleResolver?.(props.node.termId) || '终端'
})
const paneCwd = computed(() => {
  if (props.node?.type !== 'leaf') return ''
  const cwd = props.paneCwdResolver?.(props.node.termId)
  return typeof cwd === 'string' ? cwd : ''
})
const splitRatio = computed(() => {
  const ratio = Number(props.node?.ratio)
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(0.85, Math.max(0.15, ratio))
})
const firstChildStyle = computed(() => ({ flexBasis: `${splitRatio.value * 100}%` }))
const secondChildStyle = computed(() => ({ flexBasis: `${(1 - splitRatio.value) * 100}%` }))

const syncPaneElement = (nodeId, termId, el) => {
  if (!nodeId) return
  emit('pane-element-change', { nodeId, termId, el: el || null })
}

const setPaneRef = (el) => {
  paneElRef.value = el || null
  syncPaneElement(props.node?.nodeId, props.node?.termId, paneElRef.value)
}

watch(
  () => props.node?.termId,
  async (nextTermId, prevTermId) => {
    if (nextTermId && paneElRef.value) {
      await nextTick()
      syncPaneElement(props.node?.nodeId, nextTermId, paneElRef.value)
    }
  }
)

onBeforeUnmount(() => {
  syncPaneElement(props.node?.nodeId, props.node?.termId, null)
})

const handleResizeMouseDown = (event) => {
  const rect = splitNodeRef.value?.getBoundingClientRect()
  if (!rect) return
  emit('start-resize', {
    nodeId: props.node?.nodeId,
    direction: props.node?.direction === 'column' ? 'column' : 'row',
    rect,
    startClientX: event.clientX,
    startClientY: event.clientY
  })
}

const handleDragMouseDown = (event) => {
  if (!props.closable) return
  let moved = false
  const startX = event.clientX
  const startY = event.clientY
  const handleMouseMove = (moveEvent) => {
    if (moved) return
    if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 6) {
      moved = true
      suppressTopbarClick.value = true
    }
  }
  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.setTimeout(() => {
      suppressTopbarClick.value = false
    }, 0)
  }
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  const rect = paneRootRef.value?.getBoundingClientRect?.()
  emit('pane-drag-start', {
    termId: props.node?.termId || '',
    label: paneLabel.value,
    rect: rect
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }
      : null,
    clientX: event.clientX,
    clientY: event.clientY
  })
}

const handleTopbarClick = () => {
  if (suppressTopbarClick.value) return
  emit('pane-focus', props.node?.termId)
}

const forwardPaneElementChange = (payload) => emit('pane-element-change', payload)
const forwardPaneFocus = (termId) => emit('pane-focus', termId)
const forwardPaneClose = (termId) => emit('pane-close', termId)
const forwardPaneClear = (termId) => emit('pane-clear', termId)
const forwardPaneRestart = (termId) => emit('pane-restart', termId)
const forwardPaneDrop = (...args) => emit('pane-drop', ...args)
const forwardResizeStart = (payload) => emit('start-resize', payload)
const forwardPaneDragStart = (payload) => emit('pane-drag-start', payload)
const forwardPaneDragEnd = () => emit('pane-drag-end')
</script>

<style scoped>
.terminal-pane {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: var(--theme-comp-radius-selected);
  overflow: hidden;
  background: var(--theme-sem-bg-project);
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
}

.terminal-pane.liquid-style {
  border: none;
  border-radius: var(--theme-comp-radius-selected);
}

.terminal-pane.liquid-style:not(.inactive) {
  box-shadow: none;
}

.terminal-pane.liquid-style:not(.inactive)::before {
  content: none;
}

/* 右侧独立描边兜底：避免最右 pane 因子像素/裁切导致右边线丢失 */
.terminal-pane.liquid-style:not(.inactive)::after {
  content: none;
}

.terminal-pane.is-drop-target {
  border-color: var(--theme-sem-info-border);
  box-shadow: none;
  background: color-mix(in srgb, var(--theme-sem-info-bg) 75%, transparent);
}

.terminal-pane.is-drop-target .terminal-pane-topbar {
  background: color-mix(in srgb, var(--theme-sem-info-bg) 75%, transparent);
  border-bottom-color: var(--theme-sem-info-border);
}

.terminal-pane.is-dragging {
  opacity: 0.45;
  transform: scale(0.98);
}

.terminal-pane-topbar {
  height: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px 0 12px;
  background: color-mix(in srgb, var(--theme-sem-info-bg) 70%, transparent);
  border-bottom: 1px solid var(--theme-sem-info-border);
}

.terminal-pane-topbar.draggable {
  cursor: grab;
}

.terminal-pane-topbar.draggable:active {
  cursor: grabbing;
}

.terminal-pane-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1.3;
  user-select: none;
  -webkit-user-select: none;
}

.terminal-pane-title {
  flex-shrink: 0;
  max-width: 38%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--theme-sem-text-primary);
  font-size: 11px;
  line-height: 1.3;
}

.terminal-pane-sep {
  flex-shrink: 0;
  color: var(--theme-sem-text-muted);
}

.terminal-pane-cwd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  unicode-bidi: plaintext;
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.terminal-pane-content {
  width: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  box-sizing: border-box;
}

.terminal-pane.inactive .terminal-pane-content::after {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--theme-sem-warning-bg) 70%, transparent);
  pointer-events: none;
  z-index: 2;
}

.terminal-pane.inactive .terminal-pane-topbar {
  background: color-mix(in srgb, var(--theme-sem-warning-bg) 55%, transparent);
  border-bottom-color: var(--theme-sem-warning-border);
}

.terminal-pane-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.pane-action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--theme-sem-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.pane-action-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 65%, white 35%);
  color: var(--theme-sem-text-primary);
}

.pane-close-btn {
  color: var(--theme-sem-text-primary);
}

.pane-close-btn:hover {
  background: var(--theme-sem-danger-bg);
}

.terminal-split-tree {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 1px;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow-x: visible;
}

.terminal-split-tree.is-row {
  flex-direction: row;
}

.terminal-split-tree.is-column {
  flex-direction: column;
}

.terminal-split-child {
  min-width: 0;
  min-height: 0;
  flex-grow: 0;
  flex-shrink: 0;
  overflow: hidden;
}

.terminal-split-tree.is-row > .terminal-split-child {
  height: 100%;
}

/* 最右侧 pane 右描边安全区，避免贴边时被父容器裁切 */
.terminal-split-tree.is-row > .terminal-split-child:last-child {
  padding-right: 3px;
  box-sizing: border-box;
}

.terminal-split-tree.is-column > .terminal-split-child {
  width: 100%;
}

.terminal-split-divider {
  flex: 0 0 4px;
  position: relative;
  z-index: 4;
  background: transparent;
  cursor: inherit;
}

.terminal-split-divider::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.6;
  transition: background 0.15s, opacity 0.15s;
}

.terminal-split-divider.is-row {
  cursor: col-resize;
}

.terminal-split-divider.is-row::before {
  left: 0;
  right: 0;
  width: 2px;
  margin: 0 auto;
  background: var(--theme-sem-border-strong);
}

.terminal-split-divider.is-column {
  cursor: row-resize;
}

.terminal-split-divider.is-column::before {
  top: 0;
  bottom: 0;
  height: 2px;
  margin: auto 0;
  background: var(--theme-sem-border-strong);
}

.terminal-split-divider:hover::before {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 68%, white 32%);
  opacity: 1;
}
</style>
