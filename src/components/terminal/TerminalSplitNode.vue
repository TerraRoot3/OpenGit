<template>
  <div
    v-if="isLeaf"
    ref="paneRootRef"
    class="terminal-pane"
    :data-pane-root-term-id="node.termId"
    :data-pane-root-node-id="node.nodeId"
    :class="{
      inactive: activeTermId !== node.termId,
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
      <span class="terminal-pane-title">{{ paneLabel }}</span>
      <button
        v-if="closable"
        class="pane-close-btn"
        title="关闭分屏"
        @mousedown.prevent.stop
        @click.stop="emit('pane-close', node.termId)"
      >
        <X :size="11" />
      </button>
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
        :show-pane-topbar="showPaneTopbar"
        :closable="closable"
        :dragging-term-id="draggingTermId"
        :drop-target-term-id="dropTargetTermId"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
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
        :show-pane-topbar="showPaneTopbar"
        :closable="closable"
        :dragging-term-id="draggingTermId"
        :drop-target-term-id="dropTargetTermId"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
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
import { X } from 'lucide-vue-next'

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
const forwardPaneDrop = (...args) => emit('pane-drop', ...args)
const forwardResizeStart = (payload) => emit('start-resize', payload)
const forwardPaneDragStart = (payload) => emit('pane-drag-start', payload)
const forwardPaneDragEnd = () => emit('pane-drag-end')
</script>

<style scoped>
.terminal-pane {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  border: 0;
  overflow: hidden;
  background: rgba(30, 30, 30, 0.5);
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

.terminal-pane-topbar.draggable {
  cursor: grab;
}

.terminal-pane-topbar.draggable:active {
  cursor: grabbing;
}

.terminal-pane-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  line-height: 1;
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
  background: rgba(120, 98, 32, 0.10);
  pointer-events: none;
  z-index: 2;
}

.pane-close-btn {
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
  transition: background 0.15s;
}

.pane-close-btn:hover {
  background: rgba(220, 80, 80, 0.85);
}

.terminal-split-tree {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
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

.terminal-split-tree.is-column > .terminal-split-child {
  width: 100%;
}

.terminal-split-divider {
  flex: 0 0 2px;
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
