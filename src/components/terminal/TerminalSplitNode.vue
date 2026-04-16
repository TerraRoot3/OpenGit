<template>
  <div
    v-if="isLeaf"
    class="terminal-pane"
    :class="{ inactive: activeTermId !== node.termId }"
  >
    <button
      v-if="closable"
      class="pane-close-btn"
      title="关闭分屏"
      @mousedown.prevent.stop
      @click.stop="emit('pane-close', node.termId)"
    >
      <X :size="11" />
    </button>
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
        :closable="closable"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
        @pane-drop="forwardPaneDrop"
        @start-resize="forwardResizeStart"
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
        :closable="closable"
        @pane-element-change="forwardPaneElementChange"
        @pane-focus="forwardPaneFocus"
        @pane-close="forwardPaneClose"
        @pane-drop="forwardPaneDrop"
        @start-resize="forwardResizeStart"
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
  closable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'pane-element-change',
  'pane-focus',
  'pane-close',
  'pane-drop',
  'start-resize'
])

const paneElRef = ref(null)
const splitNodeRef = ref(null)

const isLeaf = computed(() => props.node?.type === 'leaf')
const splitAxisClass = computed(() => props.node?.direction === 'column' ? 'is-column' : 'is-row')
const splitRatio = computed(() => {
  const ratio = Number(props.node?.ratio)
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(0.85, Math.max(0.15, ratio))
})
const firstChildStyle = computed(() => ({ flexBasis: `${splitRatio.value * 100}%` }))
const secondChildStyle = computed(() => ({ flexBasis: `${(1 - splitRatio.value) * 100}%` }))

const syncPaneElement = (termId, el) => {
  if (!termId) return
  emit('pane-element-change', { termId, el: el || null })
}

const setPaneRef = (el) => {
  paneElRef.value = el || null
  syncPaneElement(props.node?.termId, paneElRef.value)
}

watch(
  () => props.node?.termId,
  async (nextTermId, prevTermId) => {
    if (prevTermId && prevTermId !== nextTermId) {
      syncPaneElement(prevTermId, null)
    }
    if (nextTermId && paneElRef.value) {
      await nextTick()
      syncPaneElement(nextTermId, paneElRef.value)
    }
  }
)

onBeforeUnmount(() => {
  syncPaneElement(props.node?.termId, null)
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

const forwardPaneElementChange = (payload) => emit('pane-element-change', payload)
const forwardPaneFocus = (termId) => emit('pane-focus', termId)
const forwardPaneClose = (termId) => emit('pane-close', termId)
const forwardPaneDrop = (...args) => emit('pane-drop', ...args)
const forwardResizeStart = (payload) => emit('start-resize', payload)
</script>

<style scoped>
.terminal-pane {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.terminal-pane-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  box-sizing: border-box;
  padding-right: 8px;
}

.terminal-pane.inactive .terminal-pane-content::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 214, 102, 0.12);
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
  flex: 0 0 8px;
  position: relative;
  z-index: 4;
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
  left: 3px;
  width: 2px;
  right: auto;
  background: rgba(255, 255, 255, 0.12);
}

.terminal-split-divider.is-column {
  cursor: row-resize;
}

.terminal-split-divider.is-column::before {
  top: 3px;
  height: 2px;
  bottom: auto;
  background: rgba(255, 255, 255, 0.12);
}

.terminal-split-divider:hover::before {
  background: rgba(34, 211, 238, 0.65);
  opacity: 1;
}
</style>
