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
      @mousedown="emit('pane-focus', node.termId)"
      @mousedown.left.stop="handleDragMouseDown"
    >
      <template v-if="liquidStyle">
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
            <Eraser :size="11" />
          </button>
          <button
            class="pane-action-btn"
            title="重启终端"
            @mousedown.prevent.stop
            @click.stop="emit('pane-restart', node.termId)"
          >
            <RefreshCw :size="11" />
          </button>
          <button
            v-if="closable"
            class="pane-action-btn pane-close-btn"
            title="关闭分屏"
            @mousedown.prevent.stop
            @click.stop="emit('pane-close', node.termId)"
          >
            <X :size="11" />
          </button>
        </div>
      </template>
      <template v-else>
        <span class="terminal-pane-title" :title="paneLabel">{{ paneLabel }}</span>
        <button
          v-if="closable"
          class="pane-close-btn"
          title="关闭分屏"
          @mousedown.prevent.stop
          @click.stop="emit('pane-close', node.termId)"
        >
          <X :size="11" />
        </button>
      </template>
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
  emit('pane-focus', props.node?.termId)
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
  border-radius: 0;
  overflow: hidden;
  background: rgba(30, 30, 30, 0.5);
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
}

.terminal-pane.liquid-style {
  border: 1px solid rgba(214, 176, 74, 0.16);
  border-radius: 10px;
}

.terminal-pane.liquid-style:not(.inactive) {
  border-color: #4a90ff;
  box-shadow: 0 0 14px rgba(74, 144, 255, 0.12);
}

.terminal-pane.liquid-style:not(.inactive)::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid rgba(74, 144, 255, 0.9);
  border-radius: inherit;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 6;
}

/* 右侧独立描边兜底：避免最右 pane 因子像素/裁切导致右边线丢失 */
.terminal-pane.liquid-style:not(.inactive)::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;
  background: rgba(74, 144, 255, 0.95);
  pointer-events: none;
  z-index: 7;
}

.terminal-pane.is-drop-target {
  border-color: rgba(34, 211, 238, 0.85);
  box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.45), 0 0 0 1px rgba(34, 211, 238, 0.3);
  background: rgba(14, 116, 144, 0.16);
}

.terminal-pane.is-drop-target .terminal-pane-topbar {
  background: rgba(34, 211, 238, 0.16);
  border-bottom-color: rgba(34, 211, 238, 0.35);
}

.terminal-pane.is-dragging {
  opacity: 0.45;
  transform: scale(0.98);
}

.terminal-pane-topbar {
  height: 24px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 6px 0 10px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.terminal-pane.liquid-style .terminal-pane-topbar {
  height: 40px;
  min-height: 40px;
  gap: 10px;
  padding: 0 10px 0 12px;
  background: rgba(74, 144, 255, 0.12);
  border-bottom: 1px solid rgba(74, 144, 255, 0.88);
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
}

.terminal-pane-title {
  flex-shrink: 0;
  max-width: 38%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.88);
  font-size: 11px;
  line-height: 1.3;
}

.terminal-pane-sep {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.4);
}

.terminal-pane-cwd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  unicode-bidi: plaintext;
  color: rgba(255, 255, 255, 0.75);
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
  background: rgba(214, 176, 74, 0.05);
  pointer-events: none;
  z-index: 2;
}

.terminal-pane.inactive .terminal-pane-topbar {
  background: rgba(255, 255, 255, 0.05);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.terminal-pane.inactive.liquid-style .terminal-pane-topbar {
  background: rgba(214, 176, 74, 0.025);
  border-bottom-color: rgba(214, 176, 74, 0.16);
}

.terminal-pane-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.pane-action-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.terminal-pane.liquid-style .pane-action-btn {
  width: 24px;
  height: 24px;
}

.pane-action-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.96);
}

.pane-close-btn {
  color: rgba(255, 255, 255, 0.86);
}

.pane-close-btn:hover {
  background: rgba(220, 80, 80, 0.85);
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
  background: rgba(255, 255, 255, 0.18);
}

.terminal-split-divider.is-column {
  cursor: row-resize;
}

.terminal-split-divider.is-column::before {
  top: 0;
  bottom: 0;
  height: 2px;
  margin: auto 0;
  background: rgba(255, 255, 255, 0.18);
}

.terminal-split-divider:hover::before {
  background: rgba(34, 211, 238, 0.65);
  opacity: 1;
}
</style>
