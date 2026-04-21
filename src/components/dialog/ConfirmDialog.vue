<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-dialog-overlay" @click.self="handleCancel">
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">
          <span class="confirm-icon" :class="type">
            <span v-if="type === 'warning'">⚠️</span>
            <span v-else-if="type === 'danger'">🗑️</span>
            <span v-else-if="type === 'info'">ℹ️</span>
            <span v-else>❓</span>
          </span>
          <h3>{{ title }}</h3>
        </div>
        <div class="confirm-dialog-body">
          <p class="confirm-message">{{ message }}</p>
          <p v-if="detail" class="confirm-detail">{{ detail }}</p>
        </div>
        <div class="confirm-dialog-footer">
          <button class="btn-cancel" @click="handleCancel">
            {{ cancelText }}
          </button>
          <button class="btn-confirm" :class="type" @click="handleConfirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const visible = ref(false)
const title = ref('确认')
const message = ref('')
const detail = ref('')
const type = ref('warning') // warning, danger, info
const confirmText = ref('确定')
const cancelText = ref('取消')

let resolvePromise = null

const show = (options) => {
  return new Promise((resolve) => {
    title.value = options.title || '确认'
    message.value = options.message || ''
    detail.value = options.detail || ''
    type.value = options.type || 'warning'
    confirmText.value = options.confirmText || '确定'
    cancelText.value = options.cancelText || '取消'
    visible.value = true
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  visible.value = false
  if (resolvePromise) {
    resolvePromise(true)
    resolvePromise = null
  }
}

const handleCancel = () => {
  visible.value = false
  if (resolvePromise) {
    resolvePromise(false)
    resolvePromise = null
  }
}

defineExpose({ show })
</script>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-dialog {
  background: #2d2d2d;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  min-width: 360px;
  max-width: 480px;
  animation: slideIn 0.2s ease-out;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.confirm-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 12px;
}

.confirm-icon {
  font-size: 24px;
}

.confirm-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.confirm-dialog-body {
  padding: 8px 24px 20px;
}

.confirm-message {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}

.confirm-detail {
  margin: 12px 0 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  font-family: 'Monaco', 'Menlo', monospace;
  word-break: break-all;
}

.confirm-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-cancel,
.btn-confirm {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.btn-confirm {
  background: #007bff;
  color: #fff;
}

.btn-confirm:hover {
  background: #0056b3;
}

.btn-confirm.danger {
  background: #dc3545;
}

.btn-confirm.danger:hover {
  background: #c82333;
}

.btn-confirm.warning {
  background: #ffc107;
  color: #212529;
}

.btn-confirm.warning:hover {
  background: #e0a800;
}
</style>
