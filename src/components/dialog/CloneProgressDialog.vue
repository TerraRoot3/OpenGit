<template>
  <div v-if="show" class="clone-dialog-overlay">
    <div class="clone-dialog">
            <!-- 标题和关闭按钮 -->
            <div class="clone-header">
              <h3>📥 正在克隆项目...</h3>
              <button class="close-btn" @click="close">
                <X :size="16" />
              </button>
            </div>
      
      <!-- 进度条 -->
      <div class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
        
        <!-- 刻度线 -->
        <div class="progress-ticks">
          <div class="multi-project-ticks">
            <!-- 起始位置：0（在进度条最左边） -->
            <div class="tick start-tick">
              <div class="tick-line"></div>
              <div class="tick-label">0</div>
            </div>
            
            <!-- 中间刻度：1 到 total-1 -->
            <div v-for="i in total - 1" :key="i" class="tick middle-tick" :class="{ active: i <= completed.length }" :style="{ left: ((100 / total) * i) + '%' }">
              <div class="tick-line"></div>
              <div class="tick-label">{{ i }}</div>
            </div>
            
            <!-- 结束位置：总数（在进度条最右边） -->
            <div class="tick end-tick">
              <div class="tick-line"></div>
              <div class="tick-label">{{ total }}</div>
            </div>
          </div>
        </div>
        
      </div>
      
      <!-- Git命令输出 -->
      <div class="git-output">
        <div class="output-content">
          <pre v-if="gitOutput" ref="outputPre">{{ gitOutput }}</pre>
          <div v-else class="no-output">等待Git命令执行...</div>
        </div>
      </div>
      
      <!-- 已完成项目列表 -->
      <div class="completed-projects">
        <div class="completed-header">
          <h4>已完成的项目 ({{ completed.length }}/{{ total }})</h4>
        </div>
        <div class="completed-list" ref="completedListRef">
          <div v-for="project in completed" :key="project.name || project" class="completed-item">
            <CheckCircle v-if="project.status === 'success'" :size="14" class="success-icon" />
            <X v-else-if="project.status === 'error'" :size="14" class="error-icon" />
            <Circle v-else :size="14" class="cloning-icon" />
            <div class="project-info">
              <div class="project-name">
                {{ project.name || project }}
                <span v-if="project.status === 'success'" class="success-text">（完成）</span>
                <span v-else-if="project.status === 'error'" class="error-text">（失败）</span>
                <span v-else class="cloning-text">
                  正在克隆<span 
                    class="dots-animation"
                    :style="{ animationDelay: Math.random() * 0.5 + 's' }"
                  >...</span>
                </span>
              </div>
              <div v-if="project.path" class="project-path">{{ project.path }}</div>
              <div v-if="project.error" class="project-error">{{ project.error }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { X, CheckCircle, Circle } from 'lucide-vue-next'
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  current: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  completed: {
    type: Array,
    default: () => []
  },
  gitOutput: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

// 引用已完成项目列表容器
const completedListRef = ref(null)

// 保存上一次的Git进度，实现"只增不减"保护
const lastGitProgress = ref(0)
// 保存上一个项目编号，用于检测新项目开始
const lastProjectNumber = ref(0)

// 从Git输出中提取实时进度（确保正确的项目隔离和只增不减保护）
const gitProgressPercentage = computed(() => {
  if (!props.gitOutput) return 0
  
  const lines = props.gitOutput.split('\n')
  
  // 检查是否为单个项目克隆（没有[X/Y]格式标记）
  const hasBatchMarkers = lines.some(line => /\[\d+\/\d+\]\s+开始克隆/.test(line.trim()))
  const isSingleProjectClone = props.total === 1 || !hasBatchMarkers
  
  console.log('🔄 Git进度计算:', { 
    isSingleProjectClone, 
    hasBatchMarkers, 
    total: props.total,
    outputLines: lines.length 
  })
  
  let relevantLines = []
  let currentProjectNumber = 0
  
  if (isSingleProjectClone) {
    // 单个项目克隆：检查是否是新开始的克隆
    const hasSingleCloneStart = lines.some(line => 
      line.trim().includes('开始克隆项目:') || 
      line.trim().includes('开始批量克隆')
    )
    
    console.log('🔄 单个项目克隆检测:', { hasSingleCloneStart, linesWithCloneText: lines.filter(l => l.includes('克隆')) })
    
    if (hasSingleCloneStart && lastProjectNumber.value !== 1) {
      console.log('🔄 单个项目克隆开始，重置Git进度')
      lastGitProgress.value = 0
      lastProjectNumber.value = 1
    }
    
    currentProjectNumber = 1
    // 对单个项目克隆，使用所有输出行
    relevantLines = lines
  } else {
    // 批量项目克隆：查找最新的克隆开始标记
    let latestCloneStartIndex = -1
    let currentCloneStart = 0
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].trim().match(/\[(\d+)\/(\d+)\]\s+开始克隆/)
      if (match) {
        latestCloneStartIndex = i
        currentCloneStart = parseInt(match[1]) // 当前项目编号
        console.log('🔄 找到最新克隆开始: 第', currentCloneStart, '个项目')
        break
      }
    }
    
    // 检查是否是新项目开始（重置lastGitProgress）
    if (currentCloneStart !== lastProjectNumber.value) {
      console.log('🔄 检测到新项目开始，重置Git进度: 从项目', lastProjectNumber.value, '到项目', currentCloneStart)
      lastGitProgress.value = 0
      lastProjectNumber.value = currentCloneStart
    }
    
    // 如果没有找到克隆开始标记，返回0
    if (latestCloneStartIndex === -1) {
      return 0
    }
    
    currentProjectNumber = currentCloneStart
    // 只处理最新克隆开始之后的Git进度信息
    relevantLines = lines.slice(latestCloneStartIndex)
  }
  
  // 调试：打印当前克隆的输出
  console.log('🔄 当前克隆输出行数:', relevantLines.length, '总行数:', lines.length)
  
  // 查找Git总体进度信息
  let currentProgress = 0
  
  // 调试：打印相关输出行以了解实际内容
  console.log('🔄 Git输出相关行数:', relevantLines.length)
  relevantLines.forEach((line, index) => {
    if (index < 10) { // 只打印前10行以避免日志过多
      console.log('🔄 Git行', index + ':', line.trim())
    }
  })
  
  // 检查是否已完成
  const hasCompletionMarker = relevantLines.some(line => 
    line.includes('✅') && line.includes('克隆成功')
  )
  
  if (hasCompletionMarker) {
    currentProgress = 100
    console.log('🔄 检测到克隆成功标记，设置进度为100%')
  } else {
    // 优先寻找 "Receiving objects" 的进度，这是主要的数据下载阶段
    let receivingProgress = 0
    
    for (const line of relevantLines) {
      const trimmedLine = line.trim()
      
      // 匹配 "Receiving objects: XX% (num/total)" 格式
      const receivingMatch = trimmedLine.match(/Receiving objects:\s*(\d+)%/)
      if (receivingMatch) {
        const percentage = parseInt(receivingMatch[1])
        receivingProgress = Math.max(receivingProgress, percentage)
        console.log('🔄 Receiving objects 进度:', percentage + '%')
      }
    }
    
    if (receivingProgress > 0) {
      // Receiving objects 是主要阶段，占总进度的80%
      currentProgress = Math.min(receivingProgress * 0.8, 80)
    } else {
      // 如果没有找到 Receiving objects，查找其他进度指标
      let otherProgress = 0
      
      for (const line of relevantLines) {
        const trimmedLine = line.trim()
        
        // 匹配 "Resolving deltas: XX% (num/total)" 格式  
        const deltaMatch = trimmedLine.match(/Resolving deltas:\s*(\d+)%/)
        if (deltaMatch) {
          const percentage = parseInt(deltaMatch[1])
          otherProgress = Math.max(otherProgress, percentage)
          console.log('🔄 Resolving deltas 进度:', percentage + '%')
        }
      }
      
      if (otherProgress > 0) {
        // Resolving deltas 是后续阶段，占总进度的20%，在80%基础上递增
        currentProgress = 80 + (otherProgress * 0.2)
      }
    }
  }
  
  // 应用"只增不减"保护
  if (currentProgress > lastGitProgress.value) {
    lastGitProgress.value = currentProgress
    console.log('🔄 Git进度更新:', currentProgress + '%')
  } else if (currentProgress < lastGitProgress.value) {
    console.log('🔄 Git进度回缩被丢弃:', currentProgress + '% < ' + lastGitProgress.value + '%')
    currentProgress = lastGitProgress.value
  }
  
  console.log('🔄 最终Git进度:', currentProgress + '%')
  return currentProgress
})

// 计算总体进度百分比
const progressPercentage = computed(() => {
  if (props.total === 0) return 0
  
  // 每个项目占总进度的百分比 (1/N)
  const projectSegmentSize = 100 / props.total
  
  // 统计已完成（成功）的项目数量
  const completedSuccessCount = props.completed.filter(item => 
    typeof item === 'object' ? item.status === 'success' : true
  ).length
  
  // 统计正在克隆的项目数量
  const cloningCount = props.completed.filter(item => 
    typeof item === 'object' ? item.status === 'cloning' : false
  ).length

  // 🔍 如果所有项目都已完成，直接返回100%
  if (completedSuccessCount === props.total) {
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.logToFrontend) {
      window.electronAPI.logToFrontend(`进度计算: 所有项目已完成，直接返回100%`)
    }
    return 100
  }
  
  // 当前正在克隆的项目索引（从1开始计数）
  const currentProjectIndex = completedSuccessCount + (cloningCount > 0 ? 1 : 0)
  
  // 已完成项目的基础进度 = 已完成成功项目数 * (100/N)%
  const completedProjectsBaseProgress = completedSuccessCount * projectSegmentSize
  
  // 如果当前正在克隆项目（有Git实时进度），加入当前项目的进度
  if (gitProgressPercentage.value > 0 && cloningCount > 0) {
    // 当前项目的进度 = (当前项目索引-1) * (100/N)% + (1/N)% * (当前项目的Git进度%)
    const currentProjectProgress = (gitProgressPercentage.value / 100) * projectSegmentSize
    const finalProgress = completedProjectsBaseProgress + currentProjectProgress
    
            console.log('📊 进度计算详情 (有Git进度):', {
              total: props.total,
              completed: props.completed.length,
              completedSuccessCount,
              cloningCount,
              completedItems: props.completed.map(c => typeof c === 'object' ? `${c.name}(${c.status})` : c).join(', '),
              currentProjectIndex,
              projectSegmentSize: projectSegmentSize.toFixed(2),
              completedProjectsBaseProgress: completedProjectsBaseProgress.toFixed(2),
              gitProgressPercentage: gitProgressPercentage.value.toFixed(2),
              currentProjectProgress: currentProjectProgress.toFixed(2),
              finalProgress: finalProgress.toFixed(2),
              gitOutputLastLine: props.gitOutput ? props.gitOutput.split('\n').slice(-2).join('') : 'no output'
            })

            // 🔍 发送到终端显示
            if (typeof window.electronAPI !== 'undefined' && window.electronAPI.logToFrontend) {
              window.electronAPI.logToFrontend(`进度计算: 总计${props.total}, 已完成${completedSuccessCount}, 克隆中${cloningCount}, 当前项目${currentProjectIndex}, Git进度${gitProgressPercentage.value.toFixed(1)}%, 总进度${finalProgress.toFixed(1)}%`)
            }
    
    return finalProgress
  }
  
  console.log('📊 进度计算详情 (无Git进度):', {
    total: props.total,
    completed: props.completed.length,
    completedSuccessCount,
    cloningCount,
    completedItems: props.completed.map(c => typeof c === 'object' ? `${c.name}(${c.status})` : c).join(', '),
    currentProjectIndex: currentProjectIndex.toFixed(2),
    projectSegmentSize: projectSegmentSize.toFixed(2),
    completedProjectsBaseProgress: completedProjectsBaseProgress.toFixed(2),
    gitProgressPercentage: gitProgressPercentage.value.toFixed(2),
    finalProgress: completedProjectsBaseProgress.toFixed(2),
    gitOutput: props.gitOutput ? props.gitOutput.slice(-50) : 'no output'
  })

  // 🔍 发送到终端显示
  if (typeof window.electronAPI !== 'undefined' && window.electronAPI.logToFrontend) {
    window.electronAPI.logToFrontend(`进度计算(无Git进度): 总计${props.total}, 已完成${completedSuccessCount}, 克隆中${cloningCount}, 当前项目${currentProjectIndex}, 总进度${completedProjectsBaseProgress.toFixed(1)}%`)
  }
  
  // 没有当前项目进度时，返回已完成项目的基础进度
  return completedProjectsBaseProgress
})

// 输出区域的引用
const outputPre = ref(null)

// 监听输出变化，自动滚动到底部
watch(() => props.gitOutput, async () => {
  if (outputPre.value) {
    await nextTick()
    outputPre.value.scrollTop = outputPre.value.scrollHeight
  }
}, { flush: 'post' })

// 添加详细的调试监听
watch(() => props.gitOutput, () => {
  console.log('📋 Git输出更新:', props.gitOutput?.slice(-100) || 'no output')
})

  watch(() => props.completed, (newCompleted, oldCompleted) => {
    console.log('📋 完成项目更新:', {
      count: newCompleted.length,
      items: newCompleted.map(c => ({
        name: c.name || c,
        status: c.status || 'unknown'
      }))
    })
    
    // 🔍 关键调试：检查进度计算
    const completedSuccessCount = newCompleted.filter(item => 
      typeof item === 'object' ? item.status === 'success' : true
    ).length
    const cloningCount = newCompleted.filter(item => 
      typeof item === 'object' ? item.status === 'cloning' : false
    ).length
    
    console.log('🔍 项目状态统计:', {
      total: props.total,
      completedSuccessCount,
      cloningCount,
      current: completedSuccessCount + (cloningCount > 0 ? 1 : 0)
    })

    // 🔍 发送到终端显示
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.logToFrontend) {
      window.electronAPI.logToFrontend(`完成项目更新: ${newCompleted.length}个项目, 成功:${completedSuccessCount}, 克隆中:${cloningCount}, 当前项目:${completedSuccessCount + (cloningCount > 0 ? 1 : 0)}`)
    }
    
    // 🚀 检测是否有新项目完成，如果有则滚动到底部
    if (oldCompleted && newCompleted.length > oldCompleted.length) {
      console.log('📜 检测到新项目完成，自动滚动到列表底部')
      scrollToBottom()
    }
  }, { deep: true })

watch(() => props.total, (newTotal) => {
  console.log('📋 总项目数更新:', newTotal)
})

const close = () => {
  emit('close')
}

// 自动滚动到已完成项目列表底部
const scrollToBottom = () => {
  nextTick(() => {
    if (completedListRef.value) {
      completedListRef.value.scrollTop = completedListRef.value.scrollHeight
    }
  })
}


</script>

<style scoped>
.clone-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  box-sizing: border-box;
}

.clone-dialog {
  background: #2d2d2d;
  border-radius: 12px;
  width: 500px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  margin: auto;
}

.clone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, #00d4ff 0%, #0066ff 100%);
  color: white;
}

.clone-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 进度条样式 */
.progress-section {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #2d2d2d;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #0099ff, #0066ff);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* 刻度线样式 */
.progress-ticks {
  margin: 8px 0;
  padding: 0 4px;
}

.multi-project-ticks {
  position: relative;
  width: 100%;
  height: 20px;
}

/* 起始刻度：0在进度条最左边 */
.tick.start-tick {
  position: absolute;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
}

/* 中间刻度：在进度条对应位置 */
.tick.middle-tick {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
}

/* 结束刻度：总数在进度条最右边 */
.tick.end-tick {
  position: absolute;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(50%);
}

.tick-line {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.2);
  margin-bottom: 4px;
  transition: background-color 0.3s ease;
}

.tick.active .tick-line {
  background: #6c5ce7;
}

.tick-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  transition: color 0.3s ease;
}

.tick.active .tick-label {
  color: #6c5ce7;
  font-weight: 600;
}


.git-output {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #2d2d2d;
}

.output-content {
  height: 200px;
  overflow-y: auto;
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 12px;
}

.output-content pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  word-wrap: break-word;
  height: 100%;
  overflow-y: auto;
}

.no-output {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.completed-projects {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  min-height: 150px;
  background: #2d2d2d;
}

.completed-header {
  margin-bottom: 12px;
}

.completed-header h4 {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.completed-list {
  max-height: 200px;
  overflow-y: auto;
}

.completed-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.completed-item:last-child {
  border-bottom: none;
}

.success-icon {
  color: #28a745;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-icon {
  color: #dc3545;
  flex-shrink: 0;
  margin-top: 2px;
}

.cloning-icon {
  color: #6c5ce7;
  flex-shrink: 0;
  margin-top: 2px;
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2px;
}

.project-path {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
  margin-bottom: 2px;
  word-break: break-all;
}

.project-error {
  font-size: 11px;
  color: #dc3545;
  font-style: italic;
}

/* 项目状态文本样式 */
.success-text {
  color: #28a745;
  font-weight: 600;
  margin-left: 4px;
}

.error-text {
  color: #dc3545;
  font-weight: 600;
  margin-left: 4px;
}

.cloning-text {
  color: #6c5ce7;
  font-weight: 600;
  margin-left: 4px;
}

/* 动画效果 */
.dots-animation {
  animation: dots 1.4s infinite linear;
}

@keyframes dots {
  0%, 20% {
    color: rgba(108, 92, 231, 1);
    text-shadow:
      0 0 0 rgba(108, 92, 231, 0),
      0 0 0 rgba(108, 92, 231, 0);
  }
  40% {
    color: rgba(108, 92, 231, 1);
    text-shadow:
      1px 0 0 rgba(108, 92, 231, 0),
      2px 0 0 rgba(108, 92, 231, 0);
  }
  60% {
    text-shadow:
      1px 0 0 rgba(108, 92, 231, 1),
      2px 0 0 rgba(108, 92, 231, 0);
  }
  80%, 100% {
    text-shadow:
      1px 0 0 rgba(108, 92, 231, 1),
      2px 0 0 rgba(108, 92, 231, 1);
  }
}


/* 滚动条样式 */
.completed-list::-webkit-scrollbar,
.output-content::-webkit-scrollbar {
  width: 6px;
}

.completed-list::-webkit-scrollbar-track,
.output-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.completed-list::-webkit-scrollbar-thumb,
.output-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.completed-list::-webkit-scrollbar-thumb:hover,
.output-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}
</style>
