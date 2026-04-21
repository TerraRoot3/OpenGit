<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click="handleCancel">
      <div class="password-save-dialog" @click.stop>
        <div class="password-dialog-header">
          <h3>{{ data.isUpdate ? '更新密码' : '保存密码' }}</h3>
          <button class="password-dialog-close" @click="handleCancel">
            <X :size="18" />
          </button>
        </div>
        <div class="password-dialog-body">
          <div class="password-dialog-info">
            <div class="password-info-item">
              <label>网站：</label>
              <span>{{ data.domain }}</span>
            </div>
            <div class="password-info-item">
              <label>用户名：</label>
              <span>{{ data.username }}</span>
            </div>
            <div class="password-info-item">
              <label>密码：</label>
              <div class="password-display-wrapper">
                <span class="password-display">{{ showPassword ? data.password : '•'.repeat(data.password.length || 8) }}</span>
                <button 
                  class="password-toggle-btn" 
                  @click="showPassword = !showPassword"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                >
                  <Eye v-if="!showPassword" :size="16" />
                  <EyeOff v-else :size="16" />
                </button>
              </div>
            </div>
          </div>
          <p class="password-dialog-hint">
            {{ data.isUpdate ? '是否更新已保存的密码？' : '是否保存此密码？' }}
          </p>
        </div>
        <div class="password-dialog-footer">
          <button class="password-cancel-btn" @click="handleCancel">取消</button>
          <button class="password-confirm-btn" @click="handleConfirm">确认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { X, Eye, EyeOff } from 'lucide-vue-next'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  data: {
    type: Object,
    default: () => ({
      username: '',
      password: '',
      domain: '',
      isUpdate: false
    })
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const showPassword = ref(false)

// 当对话框显示时，重置密码显示状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    showPassword.value = false
  }
})

const handleConfirm = () => {
  emit('confirm', props.data)
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--theme-sem-bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.password-save-dialog {
  background: var(--theme-sem-bg-dialog);
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.password-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.password-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
}

.password-dialog-close {
  background: transparent;
  border: none;
  color: var(--theme-sem-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.password-dialog-close:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.password-dialog-body {
  padding: 24px;
}

.password-dialog-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.password-info-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.password-info-item label {
  font-size: 14px;
  color: var(--theme-sem-text-secondary);
  min-width: 60px;
}

.password-info-item span {
  font-size: 14px;
  color: var(--theme-sem-text-primary);
  word-break: break-all;
}

.password-display-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.password-display {
  font-size: 14px;
  color: var(--theme-sem-text-primary);
  font-family: monospace;
  word-break: break-all;
}

.password-toggle-btn {
  background: transparent;
  border: none;
  color: var(--theme-sem-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.password-toggle-btn:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.password-dialog-hint {
  margin: 0;
  font-size: 14px;
  color: var(--theme-sem-text-secondary);
  text-align: center;
}

.password-dialog-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--theme-sem-border-default);
  justify-content: flex-end;
}

.password-cancel-btn,
.password-confirm-btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.password-cancel-btn {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.password-cancel-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 70%, white 30%);
}

.password-confirm-btn {
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-primary);
}

.password-confirm-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 82%, white 18%);
}
</style>


