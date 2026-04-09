<template>
  <div v-if="panel.isOpen" class="site-permission-panel">
    <div class="site-permission-header">
      <div>
        <div class="site-permission-title">站点信息</div>
        <div class="site-permission-origin">{{ panel.origin || '未知站点' }}</div>
      </div>
      <button class="site-permission-close" @click="$emit('close')">
        <X :size="12" />
      </button>
    </div>

    <div class="site-permission-meta">
      分区：{{ panel.partitionType }}
    </div>

    <div class="site-permission-list">
      <div v-for="item in panel.items" :key="item.permission" class="site-permission-item">
        <div class="site-permission-name">{{ item.label }}</div>
        <div class="site-permission-value">{{ item.value }}</div>
        <button class="site-permission-btn" @click="$emit('reset', item.permission)">重置</button>
      </div>
    </div>

    <button class="site-permission-reset-all" @click="$emit('reset-all')">全部重置</button>
  </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'

defineProps({
  panel: {
    type: Object,
    required: true
  }
})

defineEmits(['close', 'reset', 'reset-all'])
</script>

<style scoped>
.site-permission-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 320px;
  max-height: 360px;
  overflow: auto;
  z-index: 12;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(24, 24, 27, 0.95);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
}

.site-permission-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.site-permission-title {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.site-permission-origin {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  word-break: break-all;
}

.site-permission-close {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border-radius: 6px;
  width: 22px;
  height: 22px;
  cursor: pointer;
}

.site-permission-meta {
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
}

.site-permission-list {
  padding: 0 12px 10px;
}

.site-permission-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.site-permission-name {
  color: #fff;
  font-size: 12px;
}

.site-permission-value {
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}

.site-permission-btn,
.site-permission-reset-all {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}

.site-permission-reset-all {
  margin: 8px 12px 12px;
  width: calc(100% - 24px);
}
</style>
