<template>
  <div v-if="show" class="operation-dialog-overlay">
    <div class="operation-dialog">
      <!-- 标题 -->
      <div class="operation-header">
        <h3>{{ title }}</h3>
      </div>
      
      <!-- 输出内容 - 手动展开或失败时显示 -->
      <div v-if="showOutput || outputExpanded" class="operation-output" ref="outputContainer">
        <pre class="output-content">{{ output || '准备执行...' }}</pre>
      </div>
      
      <!-- 进度条 -->
      <div class="operation-progress-bar">
        <div class="progress-bar" :class="{ active: inProgress, success: isSuccess, error: isError }"></div>
      </div>
      
      <!-- 底部操作栏 -->
      <div class="operation-footer">
        <button class="toggle-output-btn" @click="toggleOutput">
          <span>{{ outputExpanded ? '收起输出' : '显示完整输出' }}</span>
          <ChevronUp v-if="outputExpanded" :size="14" />
          <ChevronDown v-else :size="14" />
        </button>
        <button class="cancel-btn" @click="cancel">{{ inProgress ? '取消' : '关闭' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '操作中'
  },
  output: {
    type: String,
    default: ''
  },
  inProgress: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['cancel'])

const outputContainer = ref(null)
const outputExpanded = ref(false)

// 判断是否失败
const isError = computed(() => {
  if (props.inProgress) return false
  return props.output.includes('❌') || props.output.includes('失败') || props.output.includes('error') || props.output.includes('Error')
})

// 判断是否成功
const isSuccess = computed(() => {
  if (props.inProgress) return false
  return !isError.value
})

// 是否显示输出区域（失败时自动显示）
const showOutput = computed(() => {
  return isError.value
})

// 切换输出展开状态
const toggleOutput = () => {
  outputExpanded.value = !outputExpanded.value
}

const cancel = () => {
  emit('cancel')
}

// 弹框关闭时重置展开状态
watch(() => props.show, (newVal) => {
  if (!newVal) {
    outputExpanded.value = false
  }
})

// 自动滚动到底部
watch(() => props.output, () => {
  nextTick(() => {
    if (outputContainer.value) {
      const pre = outputContainer.value.querySelector('.output-content')
      if (pre) {
        pre.scrollTop = pre.scrollHeight
      }
    }
  })
}, { flush: 'post' })
</script>

<style scoped>
.operation-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.operation-dialog {
  background: #1e1e1e;
  border-radius: 12px;
  width: 450px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.operation-header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.operation-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.operation-output {
  padding: 16px 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 300px;
}

.output-content {
  flex: 1;
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #e0e0e0;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: #2a2a2a;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  overflow-x: hidden;
}

/* 滚动条样式 */
.output-content::-webkit-scrollbar {
  width: 6px;
}

.output-content::-webkit-scrollbar-track {
  background: transparent;
}

.output-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.output-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 进度条 */
.operation-progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #0099ff, #0066ff);
  width: 0;
  transition: width 0.3s ease;
}

.progress-bar.active {
  animation: progress 2s ease-in-out infinite;
}

.progress-bar.success {
  width: 100%;
  background: #22c55e;
}

.progress-bar.error {
  width: 100%;
  background: #dc3545;
}

@keyframes progress {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}

/* 底部操作栏 */
.operation-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-output-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-size: 13px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: color 0.2s ease;
}

.toggle-output-btn:hover {
  color: rgba(255, 255, 255, 0.9);
}

.cancel-btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: #dc3545;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: #c82333;
}
</style>
