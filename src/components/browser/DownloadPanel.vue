<template>
  <div v-if="visible || items.length > 0" class="download-panel">
    <div class="download-panel-header">
      <span>下载管理</span>
      <div class="download-panel-actions">
        <button class="download-btn subtle" @click="$emit('clear-completed')">清理已完成</button>
        <button class="download-btn icon" @click="$emit('close')">
          <X :size="12" />
        </button>
      </div>
    </div>

    <div v-if="items.length === 0" class="download-panel-empty">
      暂无下载任务
    </div>

    <div v-for="item in items" :key="item.id" class="download-row">
      <div class="download-name">{{ item.fileName || '下载任务' }}</div>
      <div class="download-meta">
        <span>{{ item.state }}</span>
        <span>{{ item.progress }}%</span>
      </div>
      <div class="download-row-actions">
        <button class="download-btn" @click="$emit('open-folder', item.id)">打开目录</button>
        <button
          v-if="item.retryable || item.state === 'interrupted'"
          class="download-btn"
          @click="$emit('retry', item.id)"
        >
          重试
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'

defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  items: {
    type: Array,
    default: () => []
  }
})

defineEmits(['open-folder', 'retry', 'clear-completed', 'close'])
</script>

<style scoped>
.download-panel {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 360px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 10px;
  background: var(--theme-sem-bg-dialog);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.download-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.download-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-panel-empty {
  padding: 14px 12px;
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
}

.download-row {
  padding: 10px 12px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.download-name {
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-all;
}

.download-meta {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
}

.download-row-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.download-btn {
  border: 1px solid var(--theme-sem-border-strong);
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}

.download-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 70%, white 30%);
}

.download-btn.subtle {
  font-size: 10px;
  color: var(--theme-sem-text-secondary);
}

.download-btn.icon {
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
