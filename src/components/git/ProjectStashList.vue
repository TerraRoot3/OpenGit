<template>
  <div class="stash-list-section">
    <div class="stash-list-content">
      <!-- 左侧暂存列表 -->
      <div class="stash-list-panel">
        <div class="stash-list-header">
          <div class="header-left">
            <span>暂存记录</span>
          </div>
          <span class="stash-count">({{ stashList.length }})</span>
        </div>
        <div class="stash-list">
          <div 
            v-for="stash in stashList" 
            :key="stash.index"
            :class="['stash-item', { active: selectedStash?.index === stash.index }]"
            @click="selectStash(stash)"
            @dblclick="showRestoreDialog(stash)"
            @contextmenu.prevent="showStashContextMenu($event, stash)"
            :title="`${stash.message}\n创建时间: ${stash.date}`"
          >
            <div class="stash-content">
              <div class="stash-message">{{ stash.message }}</div>
              <div class="stash-date">{{ stash.date }}</div>
            </div>
          </div>
          <div v-if="stashList.length === 0" class="empty-stash">
            暂无暂存记录
          </div>
        </div>
      </div>
      
      <!-- 右侧暂存详情 -->
      <div class="stash-detail-panel">
        <div class="stash-diff-section">
          <div class="stash-diff-header">
            <span v-if="selectedStash">{{ selectedStash.message }}</span>
            <span v-else>选择暂存记录查看详情</span>
          </div>
          <div v-if="selectedStash" class="stash-diff-content">
            <div class="diff-block">
              <div class="diff-content">
                <pre class="diff-text" v-html="escapeHtml(stashDiff)"></pre>
              </div>
            </div>
          </div>
          <div v-else class="no-stash-selected">
            请选择一个暂存记录查看详情
          </div>
        </div>
      </div>
    </div>

    <!-- 恢复暂存确认对话框 -->
    <div v-if="showRestoreConfirm" class="dialog-overlay" @click="closeRestoreDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple">
          <h3>恢复暂存</h3>
        </div>
        <div class="dialog-body">
          <p>确定要恢复暂存 "<strong>{{ restoreStash?.message }}</strong>" 吗？</p>
          <p class="warning-text">此操作会将暂存的更改应用到当前工作区，可能会与当前更改冲突。</p>
          <div class="form-group">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                v-model="deleteAfterRestore"
                class="restore-checkbox"
              />
              恢复并删除暂存（默认不删除）
            </label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeRestoreDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmRestoreStash">恢复</button>
        </div>
      </div>
    </div>

    <!-- 删除暂存确认对话框 -->
    <div v-if="showDeleteConfirm" class="dialog-overlay" @click="closeDeleteDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple">
          <h3>删除暂存</h3>
        </div>
        <div class="dialog-body">
          <p>确定要删除暂存 "<strong>{{ deleteStash?.message }}</strong>" 吗？</p>
          <p class="warning-text">⚠️ 此操作不可撤销，暂存内容将永久丢失！</p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDeleteDialog">取消</button>
          <button class="delete-btn-large" @click="confirmDeleteStash">删除</button>
        </div>
      </div>
    </div>

    <!-- 暂存右键菜单 -->
    <div 
      v-if="showContextMenu" 
      class="context-menu" 
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="restoreFromContextMenu">恢复暂存</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item delete" @click="deleteFromContextMenu">删除暂存</div>
    </div>

    <!-- 操作进度弹框 -->
    <OperationDialog
      :show="showOperationDialog"
      :title="operationType"
      :output="operationOutput"
      :in-progress="operationInProgress"
      @cancel="cancelOperation"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import OperationDialog from '../dialog/OperationDialog.vue'

const props = defineProps({
  projectPath: {
    type: String,
    required: true
  },
  executeCommand: {
    type: Function,
    required: true
  },
  refreshBranchStatus: {
    type: Function,
    required: false
  }
})

const emit = defineEmits(['switch-to-file-status'])

// 响应式数据
const stashListLoading = ref(false)
const stashList = ref([])
const selectedStash = ref(null)
const stashDiff = ref('')

// 对话框状态
const showRestoreConfirm = ref(false)
const restoreStash = ref(null)
const deleteAfterRestore = ref(false) // 是否在恢复后删除暂存

// 删除对话框状态
const showDeleteConfirm = ref(false)
const deleteStash = ref(null)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuStash = ref(null)

// 操作弹框相关状态
const showOperationDialog = ref(false)
const operationType = ref('')
const operationOutput = ref('')
const operationInProgress = ref(false)
const operationCancelled = ref(false)

// 加载暂存列表
const loadStashList = async () => {
  if (!props.projectPath || stashListLoading.value) {
    return
  }
  
  stashListLoading.value = true
  
  try {
    const command = `cd "${props.projectPath}" && git stash list --pretty=format:"%h|%s|%ad" --date=format:"%Y-%m-%d %H:%M"`
    const result = await props.executeCommand(command)
    
    if (result.success) {
      const output = result.output || result.stdout || ''
      const lines = output.trim().split('\n').filter(line => line.trim())
      const stashes = []
      
      lines.forEach((line, index) => {
        const parts = line.split('|')
        if (parts.length >= 3) {
          stashes.push({
            index: `stash@{${index}}`,
            hash: parts[0],
            message: parts[1],
            date: parts[2]
          })
        }
      })
      
      stashList.value = stashes
    } else {
      stashList.value = []
    }
  } catch (error) {
    console.error('加载暂存列表失败:', error)
    stashList.value = []
  } finally {
    stashListLoading.value = false
  }
}

// 监听项目路径变化
watch(() => props.projectPath, (newPath) => {
  if (newPath) {
    selectedStash.value = null
    stashDiff.value = ''
    nextTick(() => {
      loadStashList()
    })
  }
}, { immediate: true })

// 选择暂存记录
const selectStash = async (stash) => {
  selectedStash.value = stash
  await loadStashDiff(stash)
}

// 加载暂存差异
const loadStashDiff = async (stash) => {
  if (!props.projectPath || !stash) return
  
  try {
    const command = `cd "${props.projectPath}" && git stash show -p "${stash.index}"`
    const result = await props.executeCommand(command)
    
    if (result.success && result.output.trim()) {
      stashDiff.value = result.output
    } else {
      stashDiff.value = '无法获取暂存差异内容'
    }
  } catch (error) {
    console.error('加载暂存差异失败:', error)
    stashDiff.value = '加载暂存差异失败'
  }
}

// 显示恢复对话框
const showRestoreDialog = (stash) => {
  restoreStash.value = stash
  deleteAfterRestore.value = false // 默认不删除
  showRestoreConfirm.value = true
}

// 关闭恢复对话框
const closeRestoreDialog = () => {
  showRestoreConfirm.value = false
  restoreStash.value = null
  deleteAfterRestore.value = false
}

// 显示右键菜单
const showStashContextMenu = (event, stash) => {
  contextMenuStash.value = stash
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  
  // 点击其他地方关闭菜单
  const closeMenu = () => {
    showContextMenu.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

// 从右键菜单恢复
const restoreFromContextMenu = () => {
  showContextMenu.value = false
  if (contextMenuStash.value) {
    showRestoreDialog(contextMenuStash.value)
  }
}

// 从右键菜单删除
const deleteFromContextMenu = () => {
  showContextMenu.value = false
  if (contextMenuStash.value) {
    showDeleteDialog(contextMenuStash.value)
  }
}

// 显示删除对话框
const showDeleteDialog = (stash) => {
  deleteStash.value = stash
  showDeleteConfirm.value = true
}

// 关闭删除对话框
const closeDeleteDialog = () => {
  showDeleteConfirm.value = false
  deleteStash.value = null
}

// 确认删除暂存
const confirmDeleteStash = async () => {
  if (!deleteStash.value) return
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '删除暂存'
  operationOutput.value = `正在删除暂存 "${deleteStash.value.message}"...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    const command = `cd "${props.projectPath}" && git stash drop "${deleteStash.value.index}"`
    
    const result = await executeCommandWithProgress(command, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    if (result.success) {
      // 确保显示完整的输出
      if (result.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }
      
      // 删除成功后重新加载暂存列表
      await loadStashList()
      
      // 如果删除的是当前选中的暂存，清空选择
      if (selectedStash.value?.index === deleteStash.value.index) {
        selectedStash.value = null
        stashDiff.value = ''
      }
      
      operationInProgress.value = false
      operationOutput.value += '\n\n✅ 暂存删除完成'
      
      // 关闭删除对话框并自动关闭操作弹框
      closeDeleteDialog()
      setTimeout(() => {
        showOperationDialog.value = false
      }, 1500)
    } else {
      // 确保显示完整的错误信息
      if (result.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }
      if (result.error && !operationOutput.value.includes(result.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + result.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 暂存删除失败'
    }
  } catch (error) {
    console.error('删除暂存失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 删除暂存失败: ${error.message}`
  }
}

// 确认恢复暂存
// 支持两种模式：
// 1. 默认模式（不勾选）：使用 git stash apply，恢复暂存但保留暂存记录
// 2. 删除模式（勾选）：使用 git stash pop，恢复暂存并删除暂存记录
const confirmRestoreStash = async () => {
  if (!restoreStash.value) return
  
  // 显示操作弹框
  showOperationDialog.value = true
  const operationText = deleteAfterRestore.value ? '恢复并删除暂存' : '恢复暂存'
  const progressText = deleteAfterRestore.value ? '正在恢复并删除暂存' : '正在恢复暂存'
  operationType.value = operationText
  operationOutput.value = `${progressText} "${restoreStash.value.message}"...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 根据选项选择不同的git命令
    const command = deleteAfterRestore.value 
      ? `cd "${props.projectPath}" && git stash pop "${restoreStash.value.index}"` // 恢复并删除
      : `cd "${props.projectPath}" && git stash apply "${restoreStash.value.index}"` // 只恢复，不删除
    
    const result = await executeCommandWithProgress(command, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    if (result.success) {
      // 确保显示完整的输出
      if (result.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }
      
      // 恢复成功后重新加载暂存列表
      await loadStashList()
      selectedStash.value = null
      stashDiff.value = ''
      
      // 刷新分支状态
      if (props.refreshBranchStatus) {
        await props.refreshBranchStatus()
      }
      
      operationInProgress.value = false
      const actionText = deleteAfterRestore.value ? '暂存恢复并删除完成' : '暂存恢复完成（暂存保留）'
      operationOutput.value += `\n\n✅ ${actionText}`
      
      // 关闭恢复对话框并自动关闭操作弹框
      closeRestoreDialog()
      setTimeout(() => {
        showOperationDialog.value = false
        // 切换到文件状态查看恢复的更改
        emit('switch-to-file-status')
      }, 2000)
    } else {
      // 确保显示完整的错误信息
      if (result.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }
      if (result.error && !operationOutput.value.includes(result.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + result.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 暂存恢复失败'
    }
  } catch (error) {
    console.error('恢复暂存失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 恢复暂存失败: ${error.message}`
    operationOutput.value += '\n\n❌ 暂存恢复失败'
  }
}

// 执行命令并显示进度
const executeCommandWithProgress = async (command, onProgress) => {
  if (operationCancelled.value) {
    return { success: false, error: '操作已取消' }
  }

  try {
    // 使用实时命令执行
    const setupRealtimeListener = () => {
      return new Promise((resolve) => {
        let finalResult = null
        
        const handleRealtimeOutput = (event, data) => {
          if (operationCancelled.value) {
            return
          }
          
          switch (data.type) {
            case 'stdout':
            case 'stderr':
              if (onProgress) {
                onProgress(data.data)
              }
              break
              
            case 'complete':
              finalResult = {
                success: data.code === 0,
                output: data.output || '命令执行完成',
                stdout: data.stdout || '',
                stderr: data.stderr || '',
                exitCode: data.code
              }
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              resolve(finalResult)
              break
              
            case 'error':
              finalResult = {
                success: false,
                output: data.error || '命令执行失败',
                error: data.error,
                exitCode: -1
              }
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              resolve(finalResult)
              break
          }
        }
        
        setTimeout(() => {
          window.electronAPI.onRealtimeCommandOutput(handleRealtimeOutput)
        }, 10)
      })
    }
    
    const realtimeListenerPromise = setupRealtimeListener()
    const dataToSend = { 
      command: command,
      path: props.projectPath || process.cwd()
    }
    
    const executePromise = window.electronAPI.executeCommandRealtime(dataToSend)
    const result = await Promise.race([
      executePromise,
      realtimeListenerPromise
    ])
    
    if (operationCancelled.value) {
      return { success: false, error: '操作已取消' }
    }

    if (result.success) {
      return { 
        success: true, 
        output: result.output || '命令执行完成' 
      }
    } else {
      return { success: false, error: result.stderr || result.error || '命令执行失败' }
    }
  } catch (error) {
    const errorMsg = error.message || 'IPC调用失败'
    if (onProgress) {
      onProgress(errorMsg)
    }
    return { success: false, error: errorMsg }
  }
}

// 取消操作
const cancelOperation = async () => {
  operationCancelled.value = true
  operationInProgress.value = false
  showOperationDialog.value = false
  
  // 刷新状态
  try {
    await loadStashList()
    if (props.refreshBranchStatus) {
      await props.refreshBranchStatus()
    }
  } catch (error) {
    console.error('取消操作后刷新状态失败:', error)
  }
}

// HTML转义函数
const escapeHtml = (text) => {
  if (!text) return ''
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 注意：移除 defineExpose，避免生产构建中的 refs 访问问题
</script>

<style scoped>
.stash-list-section {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.stash-list-content {
  flex: 1;
  display: flex;
  min-height: 0;
}

.stash-list-panel {
  width: 260px;
  min-width: 220px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #2d2d2d;
}

.stash-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  min-height: 40px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stash-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: normal;
}

.stash-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.stash-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stash-item:hover {
  background: rgba(102, 126, 234, 0.15);
}

.stash-item.active {
  background: rgba(102, 126, 234, 0.25);
  font-weight: 500;
}

.stash-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stash-message {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  word-break: break-word;
  line-height: 1.3;
}

.stash-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-stash {
  padding: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.stash-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
  background: #2d2d2d;
}

.stash-diff-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.stash-diff-header {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  min-height: 40px;
  line-height: 1.4;
  display: flex;
  align-items: center;
}

.stash-diff-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  max-width: 100%;
}

.diff-block {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  max-width: 100%;
}

.diff-content {
  padding: 8px;
  background: #2d2d2d;
  max-width: 100%;
  overflow: hidden;
}

.diff-text {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
  overflow-wrap: break-word;
  color: rgba(255, 255, 255, 0.9);
  max-width: 100%;
  overflow-x: auto;
}

.no-stash-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* 对话框样式 */
.dialog-overlay {
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

.dialog-content {
  background: #2d2d2d;
  border-radius: 8px;
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog-header-simple {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-header-simple h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.dialog-body {
  padding: 20px;
  background: #2d2d2d;
}

.dialog-body p {
  margin: 0 0 12px 0;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
}

.form-group {
  margin-bottom: 0;
  background: transparent;
}

.warning-text {
  color: #ffc107;
  background: rgba(255, 193, 7, 0.15);
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 13px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: #2d2d2d;
  border-radius: 0 0 8px 8px;
}

.cancel-btn-large, .confirm-btn-large, .delete-btn-large {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.cancel-btn-large {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.cancel-btn-large:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn-large {
  background: #667eea;
  color: white;
}

.confirm-btn-large:hover {
  background: #5a6fd6;
}

.delete-btn-large {
  background: #dc3545;
  color: white;
}

.delete-btn-large:hover {
  background: #c82333;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 150px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.context-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
}

.context-menu-item:hover {
  background: rgba(102, 126, 234, 0.2);
}

.context-menu-item.delete {
  color: #ff6b6b;
}

.context-menu-item.delete:hover {
  background: rgba(220, 53, 69, 0.2);
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 0 !important;
  font-weight: normal !important;
  color: rgba(255, 255, 255, 0.8);
}

.restore-checkbox {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 3px;
  background: transparent;
  position: relative;
}

.restore-checkbox:checked {
  background: #667eea;
  border-color: #667eea;
}

.restore-checkbox:checked::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 11px;
  font-weight: bold;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .stash-list-panel {
    width: 240px;
    min-width: 200px;
  }
}

@media (max-width: 768px) {
  .stash-list-content {
    flex-direction: column;
  }
  
  .stash-list-panel {
    width: 100%;
    min-width: unset;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    max-height: 300px;
  }
  
  .dialog-content {
    min-width: 320px;
    margin: 20px;
  }
}
</style>