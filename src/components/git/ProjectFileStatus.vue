<template>
  <div class="file-status-section">
    
    <div class="file-status-content">
      <!-- 左侧文件列表 -->
      <div class="file-list-panel">
        <!-- 待定文件 -->
        <div class="file-list-section">
          <div class="file-list-header">
            <div class="header-left">
              <input 
                type="checkbox" 
                :checked="isAllSelected"
                @change="toggleSelectAll"
                class="select-all-checkbox"
              />
              <span>待定文件</span>
            </div>
            <span class="file-count">({{ selectedFiles.length }}/{{ pendingFiles.length }})</span>
          </div>
          <div class="file-list">
            <div v-for="file in pendingFiles" :key="file.path" 
                 :class="['file-item', { active: selectedFile?.path === file.path, 'conflict-file': file.isConflict }]"
                 @click="selectFile(file)"
                 @contextmenu.prevent="showFileContextMenu($event, file)"
                 :title="file.path">
              <input 
                type="checkbox" 
                :checked="selectedFiles.includes(file.path)"
                @click.stop="toggleFileSelection(file)"
                class="stage-checkbox"
              />
              <span class="file-path">{{ getDisplayFileName(file.path) }}</span>
              <span v-if="file.isConflict" class="conflict-indicator">冲突</span>
              <span class="file-type-indicator" :class="getFileTypeClass(file)">
                {{ getFileTypeText(file) }}
              </span>
            </div>
            <div v-if="pendingFiles.length === 0" class="empty-files">
              暂无待定文件
            </div>
          </div>
        </div>
        
      </div>
      
      <!-- 右侧文件详情和提交区域 -->
      <div class="file-detail-panel">
        <!-- 文件对比区块 -->
        <div class="file-diff-section">
          <div class="file-diff-header">
            <span v-if="selectedFile">{{ selectedFile.path }}</span>
            <span v-else>选择文件查看详情</span>
            <div class="file-actions" v-if="selectedFile">
              <button
                v-if="selectedFile.isConflict"
                class="resolve-conflict-btn"
                @click="showConflictResolver"
                :disabled="commitLoading"
                title="解决冲突"
              >
                解决冲突
              </button>
              <button
                class="discard-changes-btn"
                @click="discardFileChanges"
                :disabled="commitLoading"
              >
                放弃修改
              </button>
            </div>
          </div>
          <div v-if="selectedFile" class="file-diff-content">
            <div class="diff-block">
              <div class="diff-content" v-if="!showConflictResolverDialog">
                <div class="diff-text" v-html="fileDiff"></div>
              </div>
              <!-- 冲突解决工具 -->
              <div v-if="showConflictResolverDialog && conflictContent" class="conflict-resolver">
                <div class="conflict-resolver-header">
                  <h4>解决冲突：{{ selectedFile.path }}</h4>
                  <button class="close-btn" @click="closeConflictResolver">✕</button>
                </div>
                <div class="conflict-sections">
                  <div 
                    v-for="(section, index) in conflictSections" 
                    :key="index"
                    class="conflict-section"
                  >
                    <div class="conflict-section-header">
                      <span class="conflict-marker">{{ section.marker }}</span>
                      <button 
                        class="use-version-btn"
                        @click="useConflictVersion(section)"
                      >
                        使用此版本
                      </button>
                    </div>
                    <pre class="conflict-content">{{ section.content }}</pre>
                  </div>
                </div>
                <div class="conflict-resolver-actions">
                  <button class="cancel-btn" @click="closeConflictResolver">取消</button>
                  <button class="confirm-btn" @click="resolveConflict">解决冲突</button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="no-file-selected">
            请选择一个文件查看详情
          </div>
        </div>
        
        <!-- 提交信息区域 -->
        <div class="commit-section">
          <div class="commit-header">
            <span>提交信息</span>
          </div>
          <div class="commit-content">
            <textarea 
              v-model="commitMessage" 
              placeholder="请输入提交信息..."
              class="commit-message"
              @keydown="handleCommitMessageKeydown"
            ></textarea>
            <div class="commit-actions">
              <div class="batch-actions">
                <button 
                  v-if="selectedFiles.length > 0"
                  class="discard-all-btn"
                  @click="showDiscardAllDialog"
                >
                  放弃全部
                </button>
                <button 
                  v-if="selectedFiles.length > 0"
                  class="stash-files-btn"
                  @click="showStashDialog"
                >
                  暂存文件
                </button>
              </div>
              <div class="commit-buttons">
              <button class="commit-btn" @click="commitChanges" :disabled="!commitMessage.trim() || commitLoading || selectedFiles.length === 0">
                {{ commitLoading ? '提交中...' : `提交 (${selectedFiles.length})` }}
              </button>
              <button class="commit-push-btn" @click="commitAndPush" :disabled="!commitMessage.trim() || commitLoading || selectedFiles.length === 0">
                {{ commitLoading ? '提交中...' : `提交并推送 (${selectedFiles.length})` }}
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

                <!-- 操作进度弹框 -->
                <OperationDialog
                  :show="showOperationDialog"
                  :title="operationType"
                  :output="operationOutput"
                  :in-progress="operationInProgress"
                  @cancel="cancelOperation"
                />

    <!-- 放弃全部确认对话框 -->
    <div v-if="showDiscardAllConfirm" class="dialog-overlay" @click="closeDiscardAllDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple">
          <h3>放弃全部修改</h3>
        </div>
        <div class="dialog-body">
          <p>确定要放弃对 <strong>{{ selectedFiles.length }}</strong> 个文件的修改吗？</p>
          <p class="warning-text">此操作不可撤销，所有选中文件的修改将会丢失。</p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDiscardAllDialog">取消</button>
          <button class="confirm-btn-large danger" @click="confirmDiscardAll">放弃全部</button>
        </div>
      </div>
    </div>

    <!-- 暂存文件对话框 -->
    <div v-if="showStashConfirm" class="dialog-overlay" @click="closeStashDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple">
          <h3>暂存文件</h3>
        </div>
        <div class="dialog-body">
          <p>将 <strong>{{ selectedFiles.length }}</strong> 个文件暂存到 Git Stash</p>
          <div class="form-group">
            <label for="stashMessage">暂存名称（可选）：</label>
            <input 
              id="stashMessage"
              v-model="stashMessage"
              type="text"
              placeholder="不输入名称就默认使用分支名+时间戳"
              class="stash-input"
              @keyup.enter="confirmStashFiles"
            />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeStashDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmStashFiles">暂存文件</button>
        </div>
      </div>
    </div>

    <!-- 文件右键菜单 -->
    <div 
      v-if="showFileContextMenuModal" 
      class="context-menu"
      :style="{ top: fileContextMenuPosition.y + 'px', left: fileContextMenuPosition.x + 'px' }"
      @click.stop
    >
      <!-- 基本操作 -->
      <div class="context-menu-item" @click="contextMenuResetFile">
        <span class="menu-icon">↩</span> 重置文件
      </div>
      <div class="context-menu-item" @click="contextMenuRemoveFile">
        <span class="menu-icon">🗑</span> 移除文件
      </div>
      
      <!-- 冲突解决选项（仅冲突文件显示） -->
      <template v-if="contextMenuFile?.isConflict">
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="contextMenuUseOurs">
          <span class="menu-icon">👤</span> 使用我的版本
        </div>
        <div class="context-menu-item" @click="contextMenuUseTheirs">
          <span class="menu-icon">👥</span> 使用他人版本
        </div>
        <div class="context-menu-item" @click="contextMenuMarkResolved">
          <span class="menu-icon">✓</span> 标记为已解决
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import OperationDialog from '../dialog/OperationDialog.vue'
import { useConfirm } from '../../composables/useConfirm.js'

const { confirm } = useConfirm()

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

const emit = defineEmits(['terminal-log', 'status-changed', 'pending-count-changed'])

// 响应式数据
const fileStatusLoading = ref(false)
const modifiedFiles = ref([])
const selectedFile = ref(null)
const fileDiff = ref('')
const commitMessage = ref('')
const commitLoading = ref(false)

// 🔧 独立的冲突信息缓存，按项目区分，不依赖Git状态
const conflictMessageStore = ref({})

// 缓存管理函数
const getCacheKey = (projectPath) => {
  return projectPath || 'default'
}

// 保存冲突信息到独立缓存（只在检测到冲突时保存一次）
const saveConflictMessageToStore = (projectPath, message) => {
  if (!projectPath) {
    console.log('❌ saveConflictMessageToStore: projectPath为空')
    return
  }
  const cacheKey = getCacheKey(projectPath)
  if (message && message.trim()) {
    conflictMessageStore.value[cacheKey] = message.trim()
    console.log('💾 保存冲突信息到独立缓存:', cacheKey, message.substring(0, 50) + '...')
    console.log('🔍 当前缓存状态:', Object.keys(conflictMessageStore.value))
  } else {
    console.log('❌ saveConflictMessageToStore: message为空或无效:', message)
  }
}

// 从独立缓存恢复冲突信息
const loadConflictMessageFromStore = (projectPath) => {
  if (!projectPath) {
    console.log('❌ loadConflictMessageFromStore: projectPath为空')
    return ''
  }
  const cacheKey = getCacheKey(projectPath)
  const cachedMessage = conflictMessageStore.value[cacheKey]
  console.log('🔍 尝试从缓存加载:', cacheKey, '缓存存在:', !!cachedMessage)
  console.log('🔍 当前所有缓存键:', Object.keys(conflictMessageStore.value))
  if (cachedMessage) {
    console.log('📖 从独立缓存恢复冲突信息:', cacheKey, cachedMessage.substring(0, 50) + '...')
    return cachedMessage
  }
  console.log('❌ 缓存中未找到项目:', cacheKey)
  return ''
}

// 清空冲突信息缓存（只在用户提交后清空）
const clearConflictMessageStore = (projectPath) => {
  if (!projectPath) {
    console.log('❌ clearConflictMessageStore: projectPath为空')
    return
  }
  const cacheKey = getCacheKey(projectPath)
  if (conflictMessageStore.value[cacheKey]) {
    delete conflictMessageStore.value[cacheKey]
    console.log('🧹 清空冲突信息缓存:', cacheKey)
    console.log('🔍 清空后缓存状态:', Object.keys(conflictMessageStore.value))
  } else {
    console.log('⚠️ clearConflictMessageStore: 缓存中不存在项目:', cacheKey)
  }
}

const hasConflicts = ref(false)
const selectedFiles = ref([])

// 冲突解决相关
const showConflictResolverDialog = ref(false)
const conflictContent = ref('')
const conflictSections = ref([])
const resolvedConflictContent = ref('')

// 计算属性：所有待定文件（包括暂存和未暂存的文件）
const pendingFiles = computed(() => {
  // 🔧 修复：简化过滤逻辑，显示所有有变化的文件（包括未暂存、已暂存、未跟踪）
  const files = modifiedFiles.value.filter(file => {
    const hasStaged = file.stagedStatus !== null && file.stagedStatus !== undefined
    const hasUnstaged = file.unstagedStatus !== null && file.unstagedStatus !== undefined
    const isUntracked = file.isUntracked === true
    const result = hasStaged || hasUnstaged || isUntracked
    
    console.log('🔍 [pendingFiles] 过滤文件:', {
      path: file.path,
      stagedStatus: file.stagedStatus,
      unstagedStatus: file.unstagedStatus,
      isUntracked: file.isUntracked,
      hasStaged,
      hasUnstaged,
      result
    })
    
    return result
  })
  
  console.log('🔍 [pendingFiles] 最终待定文件数量:', files.length)
  return files
})

// 计算属性：是否全选
const isAllSelected = computed(() => {
  return pendingFiles.value.length > 0 && selectedFiles.value.length === pendingFiles.value.length
})

// 操作弹框相关状态
const showOperationDialog = ref(false)
const operationType = ref('')
const operationOutput = ref('')
const operationInProgress = ref(false)
const operationCancelled = ref(false)

// 批量操作对话框状态
const showDiscardAllConfirm = ref(false)
const showStashConfirm = ref(false)
const stashMessage = ref('')

// 文件右键菜单状态
const showFileContextMenuModal = ref(false)
const fileContextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuFile = ref(null)

// 显示放弃全部对话框
const showDiscardAllDialog = () => {
  showDiscardAllConfirm.value = true
}

// 显示暂存对话框
const showStashDialog = () => {
  stashMessage.value = ''
  showStashConfirm.value = true
}

// 关闭放弃全部对话框
const closeDiscardAllDialog = () => {
  showDiscardAllConfirm.value = false
}

// 关闭暂存对话框
const closeStashDialog = () => {
  showStashConfirm.value = false
  stashMessage.value = ''
}

// ==================== 文件右键菜单功能 ====================
// 显示文件右键菜单
const showFileContextMenu = (event, file) => {
  contextMenuFile.value = file
  fileContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showFileContextMenuModal.value = true
  
  // 点击其他地方关闭菜单
  const closeMenu = () => {
    showFileContextMenuModal.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

// 右键菜单：重置文件（还原到最近提交状态）
const contextMenuResetFile = async () => {
  showFileContextMenuModal.value = false
  if (!contextMenuFile.value || !props.projectPath) return
  
  const file = contextMenuFile.value
  const fileName = file.path
  const safeFilePath = fileName.replace(/'/g, "'\\''")
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '重置文件'
  operationOutput.value = `正在重置文件 "${fileName}"...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    let result = null
    
    if (file.isUntracked) {
      // 未跟踪的文件：删除
      operationOutput.value += '文件类型: 未跟踪（新增文件），将删除此文件\n'
      const command = `cd "${props.projectPath}" && rm -f '${safeFilePath}'`
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    } else {
      // 已跟踪的文件：先取消暂存，再还原
      if (file.stagedStatus && file.stagedStatus !== ' ') {
        operationOutput.value += '取消暂存...\n'
        await props.executeCommand(`cd "${props.projectPath}" && git reset HEAD '${safeFilePath}'`)
      }
      operationOutput.value += '还原文件...\n'
      const command = `cd "${props.projectPath}" && git checkout HEAD -- '${safeFilePath}'`
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    }
    
    if (result && result.success) {
      operationInProgress.value = false
      showOperationDialog.value = false
      loadFileStatus(true).catch(() => {})
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 重置失败: ' + (result?.error || '')
    }
  } catch (error) {
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 重置失败: ${error.message}`
  }
}

// 右键菜单：移除文件（从Git索引中移除）
const contextMenuRemoveFile = async () => {
  showFileContextMenuModal.value = false
  if (!contextMenuFile.value || !props.projectPath) return
  
  const file = contextMenuFile.value
  const fileName = file.path
  const safeFilePath = fileName.replace(/'/g, "'\\''")
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '移除文件'
  operationOutput.value = `正在移除文件 "${fileName}"...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    let result = null
    
    if (file.isUntracked) {
      // 未跟踪的文件：直接删除
      operationOutput.value += '文件类型: 未跟踪，将删除此文件\n'
      const command = `cd "${props.projectPath}" && rm -f '${safeFilePath}'`
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    } else {
      // 已跟踪的文件：使用 git rm --cached 移除（保留本地文件）
      operationOutput.value += '从Git索引中移除（保留本地文件）...\n'
      const command = `cd "${props.projectPath}" && git rm --cached '${safeFilePath}'`
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    }
    
    if (result && result.success) {
      operationInProgress.value = false
      showOperationDialog.value = false
      loadFileStatus(true).catch(() => {})
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 移除失败: ' + (result?.error || '')
    }
  } catch (error) {
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 移除失败: ${error.message}`
  }
}

// 右键菜单：使用我的版本（解决冲突）
const contextMenuUseOurs = async () => {
  showFileContextMenuModal.value = false
  if (!contextMenuFile.value || !props.projectPath) return
  
  const file = contextMenuFile.value
  const fileName = file.path
  const safeFilePath = fileName.replace(/'/g, "'\\''")
  
  showOperationDialog.value = true
  operationType.value = '解决冲突 - 使用我的版本'
  operationOutput.value = `正在使用我的版本解决冲突: "${fileName}"\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 使用 --ours 选项检出我们的版本
    const command = `cd "${props.projectPath}" && git checkout --ours '${safeFilePath}' && git add '${safeFilePath}'`
    const result = await executeCommandWithProgress(command, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (result && result.success) {
      operationInProgress.value = false
      showOperationDialog.value = false
      loadFileStatus(true).catch(() => {})
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 解决冲突失败: ' + (result?.error || '')
    }
  } catch (error) {
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 解决冲突失败: ${error.message}`
  }
}

// 右键菜单：使用他人版本（解决冲突）
const contextMenuUseTheirs = async () => {
  showFileContextMenuModal.value = false
  if (!contextMenuFile.value || !props.projectPath) return
  
  const file = contextMenuFile.value
  const fileName = file.path
  const safeFilePath = fileName.replace(/'/g, "'\\''")
  
  showOperationDialog.value = true
  operationType.value = '解决冲突 - 使用他人版本'
  operationOutput.value = `正在使用他人版本解决冲突: "${fileName}"\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 使用 --theirs 选项检出他人的版本
    const command = `cd "${props.projectPath}" && git checkout --theirs '${safeFilePath}' && git add '${safeFilePath}'`
    const result = await executeCommandWithProgress(command, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (result && result.success) {
      operationInProgress.value = false
      showOperationDialog.value = false
      loadFileStatus(true).catch(() => {})
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 解决冲突失败: ' + (result?.error || '')
    }
  } catch (error) {
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 解决冲突失败: ${error.message}`
  }
}

// 右键菜单：标记冲突为已解决
const contextMenuMarkResolved = async () => {
  showFileContextMenuModal.value = false
  if (!contextMenuFile.value || !props.projectPath) return
  
  const file = contextMenuFile.value
  const fileName = file.path
  const safeFilePath = fileName.replace(/'/g, "'\\''")
  
  showOperationDialog.value = true
  operationType.value = '标记冲突已解决'
  operationOutput.value = `正在标记冲突为已解决: "${fileName}"\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 使用 git add 标记冲突已解决
    const command = `cd "${props.projectPath}" && git add '${safeFilePath}'`
    const result = await executeCommandWithProgress(command, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (result && result.success) {
      operationInProgress.value = false
      showOperationDialog.value = false
      loadFileStatus(true).catch(() => {})
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 标记失败: ' + (result?.error || '')
    }
  } catch (error) {
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 标记失败: ${error.message}`
  }
}

// 确认放弃全部
const confirmDiscardAll = async () => {
  if (selectedFiles.value.length === 0) return
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '放弃全部修改'
  operationOutput.value = `正在放弃 ${selectedFiles.value.length} 个文件的修改...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 🔧 分类处理不同类型的文件
    const untrackedFiles = [] // 未跟踪的文件（需要删除）
    const stagedFiles = []    // 已暂存的文件（需要 reset + checkout）
    const modifiedFiles = []  // 未暂存的修改（需要 checkout）
    
    // 根据文件状态分类
    for (const filePath of selectedFiles.value) {
      const file = pendingFiles.value.find(f => f.path === filePath)
      if (!file) continue
      
      if (file.isUntracked) {
        untrackedFiles.push(filePath)
      } else if (file.stagedStatus && file.stagedStatus !== ' ') {
        stagedFiles.push(filePath)
      } else {
        modifiedFiles.push(filePath)
      }
    }
    
    let hasError = false
    
    // 1. 处理未跟踪的文件（直接删除）
    if (untrackedFiles.length > 0) {
      operationOutput.value += `\n📁 删除 ${untrackedFiles.length} 个未跟踪文件...\n`
      const safeFiles = untrackedFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
      const command = `cd "${props.projectPath}" && rm -f ${safeFiles}`
      console.log('🚀 删除未跟踪文件:', command)
      const result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      if (!result.success) {
        operationOutput.value += `\n⚠️ 删除部分未跟踪文件失败: ${result.error || ''}\n`
        hasError = true
      }
    }
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 2. 处理已暂存的文件（先取消暂存）
    if (stagedFiles.length > 0) {
      operationOutput.value += `\n📁 取消暂存 ${stagedFiles.length} 个文件...\n`
      const safeFiles = stagedFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
      const resetCommand = `cd "${props.projectPath}" && git reset HEAD ${safeFiles}`
      console.log('🚀 取消暂存:', resetCommand)
      const resetResult = await executeCommandWithProgress(resetCommand, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      
      if (resetResult.success || resetResult.output?.includes('Unstaged')) {
        // 然后还原这些文件
        operationOutput.value += `\n📁 还原 ${stagedFiles.length} 个暂存文件...\n`
        const checkoutCommand = `cd "${props.projectPath}" && git checkout -- ${safeFiles}`
        console.log('🚀 还原暂存文件:', checkoutCommand)
        const checkoutResult = await executeCommandWithProgress(checkoutCommand, (output) => {
          if (output && !operationOutput.value.endsWith(output)) {
            operationOutput.value += output
          }
        })
        if (!checkoutResult.success) {
          operationOutput.value += `\n⚠️ 还原部分暂存文件失败: ${checkoutResult.error || ''}\n`
          hasError = true
        }
      } else {
        operationOutput.value += `\n⚠️ 取消暂存失败: ${resetResult.error || ''}\n`
        hasError = true
      }
    }
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 3. 处理未暂存的修改
    if (modifiedFiles.length > 0) {
      operationOutput.value += `\n📁 还原 ${modifiedFiles.length} 个修改的文件...\n`
      const safeFiles = modifiedFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ')
      const command = `cd "${props.projectPath}" && git checkout -- ${safeFiles}`
      console.log('🚀 还原修改的文件:', command)
      const result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      if (!result.success) {
        operationOutput.value += `\n⚠️ 还原部分修改文件失败: ${result.error || ''}\n`
        hasError = true
      }
    }
    
    // 放弃成功后重新加载文件状态
    await loadFileStatus(true)
    // 清空选中的文件列表
    selectedFiles.value = []
    
    // 刷新分支状态
    if (props.refreshBranchStatus) {
      await props.refreshBranchStatus()
    }
    
    operationInProgress.value = false
    if (hasError) {
      operationOutput.value += '\n\n⚠️ 放弃修改完成（部分文件可能失败）'
    } else {
      operationOutput.value += '\n\n✅ 放弃全部修改完成'
    }
    
    // 关闭对话框并自动关闭操作弹框
    closeDiscardAllDialog()
    setTimeout(() => {
      showOperationDialog.value = false
    }, 300)
  } catch (error) {
    console.error('放弃全部修改失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 放弃修改失败: ${error.message}`
  }
}

// 确认暂存文件
const confirmStashFiles = async () => {
  if (selectedFiles.value.length === 0) return
  
  // 生成暂存信息
  let message = stashMessage.value.trim()
  if (!message) {
    // 默认使用分支名 + 时间戳
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    // 获取当前分支名需要通过git命令
    try {
      const branchResult = await props.executeCommand(`cd "${props.projectPath}" && git branch --show-current`)
      const branchName = branchResult.success ? branchResult.output.trim() : 'unknown'
      message = `${branchName}-${timestamp}`
    } catch (error) {
      message = `stash-${timestamp}`
    }
  }
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '暂存文件'
  operationOutput.value = `正在暂存 ${selectedFiles.value.length} 个文件...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 🔧 分类文件：检查是否有未跟踪的文件
    const hasUntrackedFiles = selectedFiles.value.some(filePath => {
      const file = pendingFiles.value.find(f => f.path === filePath)
      return file?.isUntracked
    })
    
    // 🔧 使用单引号包裹文件路径，正确处理特殊字符
    const safeFiles = selectedFiles.value.map(file => `'${file.replace(/'/g, "'\\''")}'`).join(' ')
    
    // 🔧 修复: 使用正确的 stash 命令
    // -u: 包含未跟踪的文件
    // --: 表示后面是文件路径
    let stashCommand = ''
    
    if (hasUntrackedFiles) {
      // 如果有未跟踪文件，需要使用 -u 选项
      // 但是 git stash push -u 不支持指定特定文件，需要先 add 再 stash
      operationOutput.value += '检测到未跟踪文件，使用特殊处理...\n'
      
      // 先添加到暂存区
      const addCommand = `cd "${props.projectPath}" && git add ${safeFiles}`
      operationOutput.value += '添加文件到暂存区...\n'
      const addResult = await executeCommandWithProgress(addCommand, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      
      if (operationCancelled.value) {
        operationOutput.value += '\n\n❌ 操作已取消'
        operationInProgress.value = false
        return
      }
      
      if (!addResult.success) {
        throw new Error('添加文件失败: ' + (addResult.error || '未知错误'))
      }
      
      // 使用 --staged 选项只暂存已暂存的文件
      stashCommand = `cd "${props.projectPath}" && git stash push --staged -m "${message}"`
    } else {
      // 没有未跟踪文件，可以直接 stash 指定的文件
      stashCommand = `cd "${props.projectPath}" && git stash push -m "${message}" -- ${safeFiles}`
    }
    
    operationOutput.value += '执行暂存操作...\n'
    const stashResult = await executeCommandWithProgress(stashCommand, (output) => {
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    if (stashResult.success) {
      if (stashResult.output && !operationOutput.value.includes(stashResult.output)) {
        operationOutput.value += stashResult.output
      }
      
      operationInProgress.value = false

      // 关闭对话框
      closeStashDialog()
      showOperationDialog.value = false

      // 异步刷新状态
      selectedFiles.value = []
      loadFileStatus(true).catch(() => {})
      if (props.refreshBranchStatus) {
        props.refreshBranchStatus().catch(() => {})
      }
    } else {
      if (stashResult.output && !operationOutput.value.includes(stashResult.output)) {
        operationOutput.value += stashResult.output
      }
      if (stashResult.error && !operationOutput.value.includes(stashResult.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + stashResult.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 暂存文件失败'
    }
  } catch (error) {
    console.error('暂存文件失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 暂存文件失败: ${error.message}`
    operationOutput.value += '\n\n❌ 暂存文件失败'
  }
}

// 加载文件状态的函数
const loadFileStatus = async (preserveSelection = false) => {
  console.log('🔄 loadFileStatus 被调用，项目路径:', props.projectPath, 'preserveSelection:', preserveSelection)
  console.log('🔄 loadFileStatus: fileStatusLoading.value =', fileStatusLoading.value)
  if (!props.projectPath || fileStatusLoading.value) {
    console.log('❌ loadFileStatus: projectPath为空或正在加载中')
    return
  }

  // 保存当前选中的文件路径和状态（如果保留选择）
  const previousSelectedFilePath = preserveSelection && selectedFile.value ? selectedFile.value.path : null
  const previousSelectedFiles = preserveSelection ? [...selectedFiles.value] : []

  // 重置状态（保留提交信息）
  // 🔧 优化：如果保留选择，不要先清空文件列表，避免闪烁
  if (!preserveSelection) {
    modifiedFiles.value = []
    selectedFile.value = null
    fileDiff.value = ''
    selectedFiles.value = []
  }
  hasConflicts.value = false
  
  fileStatusLoading.value = true
  
  try {
    // 🔧 使用 -c core.quotePath=false 禁用路径转义，正确显示中文文件名
    // 🔧 使用 -uall 显示所有未跟踪的文件（包括目录内的文件）
    const command = `cd "${props.projectPath}" && git -c core.quotePath=false status --porcelain -uall`
    console.log('🔍 执行命令:', command)
    const result = await props.executeCommand(command)
    console.log('🔍 git status --porcelain 结果:', result)
    
    if (result.success) {
      const output = result.output || result.stdout || ''
      console.log('🔍 git status 原始输出:', output)
      const lines = output.trim().split('\n').filter(line => line.trim())
      console.log('🔍 解析行数:', lines.length, '内容:', lines)
      const modified = []
      
      for (const line of lines) {
        if (line.length < 3) continue
        
        // git status --porcelain 格式：XY filename 或 XY\tfilename 或 XY  filename
        // X = 暂存区状态，Y = 工作区状态
        // 前两个字符是状态码，然后可能是空格或制表符，再是文件名
        const stagedStatus = line.charAt(0)
        const unstagedStatus = line.charAt(1)
        
        // 🔧 修复：使用索引查找真正的路径开始位置（跳过空白字符）
        let pathStart = 2
        // 跳过状态码后的所有空白字符（空格、制表符等）
        while (pathStart < line.length && /\s/.test(line.charAt(pathStart))) {
          pathStart++
        }
        let path = line.substring(pathStart).trim() // 提取路径并去除首尾空白
        
        // 🔧 修复：如果路径被引号包裹，去除引号
        if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
          path = path.slice(1, -1)
        }
        
        // 🔧 修复：处理转义的八进制字符（中文文件名可能被 Git 转义为 \xxx\xxx 格式）
        if (path.includes('\\')) {
          try {
            // 尝试解码转义的八进制字符
            path = path.replace(/\\([0-7]{3})/g, (match, oct) => {
              return String.fromCharCode(parseInt(oct, 8))
            })
            // 如果还包含转义的引号，也处理一下
            path = path.replace(/\\"/g, '"').replace(/\\'/g, "'")
          } catch (e) {
            console.warn('解码文件路径失败:', e)
          }
        }
        
        // 🔧 修复：如果路径为空，跳过这行
        if (!path) {
          console.warn('🔍 [FileStatus] 跳过空路径行:', line)
          continue
        }
        
        console.log('🔍 [FileStatus] 解析文件状态:', { 
          line, 
          rawLine: JSON.stringify(line),
          stagedStatus: JSON.stringify(stagedStatus), 
          unstagedStatus: JSON.stringify(unstagedStatus), 
          path 
        })
        
        // 收集所有有变化的文件（包括暂存、未暂存、未跟踪、冲突）
        // 注意：'??' 表示未跟踪文件，第一个和第二个字符都是 '?'
        if (stagedStatus !== ' ' || unstagedStatus !== ' ') {
          // 🔧 修复冲突检测逻辑，与后端保持一致
          const isConflict = (stagedStatus === 'U' && unstagedStatus === 'U') || // UU: 未合并，双方修改
                           (stagedStatus === 'A' && unstagedStatus === 'A') || // AA: 未合并，双方添加
                           (stagedStatus === 'D' && unstagedStatus === 'D')    // DD: 未合并，双方删除
          
          if (isConflict) {
            console.log('🚨 [FileStatus] 检测到冲突文件:', path, '状态:', stagedStatus + unstagedStatus)
          }
          
          const fileObj = {
            path,
            stagedStatus: stagedStatus !== ' ' && stagedStatus !== '?' ? stagedStatus : null,
            unstagedStatus: unstagedStatus !== ' ' && unstagedStatus !== '?' ? unstagedStatus : null,
            status: stagedStatus !== ' ' ? stagedStatus : unstagedStatus,
            isConflict,
            isUntracked: stagedStatus === '?' && unstagedStatus === '?'
          }
          
          console.log('🔍 [FileStatus] 添加文件对象:', fileObj)
          modified.push(fileObj)
        }
      }
      
      console.log('解析结果:', { modified })
      
      // 检查是否有冲突文件
      hasConflicts.value = modified.some(file => file.isConflict)
      
      // 🔧 优化：如果保留选择，直接更新文件列表，保持UI连续性
      // 直接赋值，Vue会智能地只更新变化的项，不会导致整个列表重新渲染
      modifiedFiles.value = modified
      
      // 如果保留选择，尝试恢复之前选中的文件
      if (preserveSelection && previousSelectedFilePath) {
        const foundFile = modified.find(f => f.path === previousSelectedFilePath)
        if (foundFile) {
          selectedFile.value = foundFile

          await loadFileDiff(foundFile)
          // 恢复选中的文件列表
          selectedFiles.value = previousSelectedFiles.filter(path => 
            modified.some(f => f.path === path)
          )
        } else {
          // 文件不存在了（被删除或还原），选择第一个文件
          if (modified.length > 0) {
            selectedFile.value = modified[0]
            await loadFileDiff(modified[0])
          } else {
            selectedFile.value = null
            fileDiff.value = ''
          }
          // 清空选中的文件列表
          selectedFiles.value = []
        }
      } else if (!preserveSelection && modified.length > 0 && !selectedFile.value) {
        // 🔧 新增：如果不保留选择且没有选中文件，自动选中第一个文件
        selectedFile.value = modified[0]
        await loadFileDiff(modified[0])
      }
    } else {
      // 🔧 优化：如果保留选择且之前有文件，保持列表显示直到确认没有文件
      if (preserveSelection && modifiedFiles.value.length > 0) {
        // 如果之前有文件但现在没有了，才清空
        modifiedFiles.value = []
        if (previousSelectedFilePath) {
          selectedFile.value = null
          fileDiff.value = ''
          selectedFiles.value = []
        }
      } else {
        modifiedFiles.value = []
        if (preserveSelection && previousSelectedFilePath) {
          // 没有文件了，清空选择
          selectedFile.value = null
          fileDiff.value = ''
          selectedFiles.value = []
        }
      }
    }
    
    // 🔧 简化逻辑：有缓存就展示，检测到冲突就保存缓存
    console.log('🔍 loadFileStatus: 开始检查独立缓存，项目路径:', props.projectPath)
    console.log('🔍 loadFileStatus: hasConflicts.value =', hasConflicts.value)
    
    const cachedMessage = loadConflictMessageFromStore(props.projectPath)
    console.log('🔍 检查独立缓存:', props.projectPath, '缓存内容:', cachedMessage ? cachedMessage.substring(0, 50) + '...' : '无')
    
    if (cachedMessage) {
      // 有缓存就展示
      commitMessage.value = cachedMessage
      console.log('🔄 从独立缓存恢复冲突信息（优先使用缓存）')
    } else if (hasConflicts.value) {
      // 没有缓存但检测到冲突，生成并保存缓存
      console.log('🆕 检测到新冲突，生成冲突提交信息并保存到缓存')
      await generateConflictMessage()
    } else {
      console.log('ℹ️ 没有缓存且没有检测到冲突，保持当前状态')
    }
  } catch (error) {
    console.error('加载文件状态失败:', error)
    modifiedFiles.value = []
  } finally {
    fileStatusLoading.value = false
  }
}

// 加载提交模板
const loadCommitTemplate = async (projectPath) => {
  if (!projectPath) return
  
  try {
    // 先检查项目级别的模板
    const projectKey = `commit-template-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
    const projectTemplate = await window.electronAPI?.getConfig(projectKey)
    
    if (projectTemplate) {
      commitMessage.value = projectTemplate
      return
    }
    
    // 再检查全局模板
    const globalTemplate = await window.electronAPI?.getConfig('commit-template-global')
    if (globalTemplate) {
      commitMessage.value = globalTemplate
    }
  } catch (error) {
    console.error('加载提交模板失败:', error)
  }
}

// 监听项目路径变化，重新加载文件状态
watch(() => props.projectPath, (newPath, oldPath) => {
  console.log('🔄 项目路径变化:', { oldPath, newPath })
  // 如果项目路径发生变化，完全重置状态
  if (newPath !== oldPath) {
    // 重置所有数据
    modifiedFiles.value = []
    selectedFile.value = null
    fileDiff.value = ''
    selectedFiles.value = []
    commitMessage.value = '' // 切换项目时清空提交信息
    // 🔧 切换项目时不清空独立缓存，只清空当前显示
    hasConflicts.value = false
    fileStatusLoading.value = false
    commitLoading.value = false
  }
  
  if (newPath) {
    console.log('🔄 准备调用 loadFileStatus，项目路径:', newPath)
    // 延迟执行，确保组件完全初始化
    nextTick(() => {
      console.log('🔄 nextTick 中调用 loadFileStatus')
      loadFileStatus(false) // 项目切换时不保留选择
      // 加载提交模板
      loadCommitTemplate(newPath)
    })
  }
}, { immediate: true })

// 监听待定文件数量变化，通知父组件
watch(() => pendingFiles.value.length, (newCount) => {
  emit('pending-count-changed', newCount)
}, { immediate: true })

// 获取显示的文件名（优先显示文件名，省略路径）
const getDisplayFileName = (filePath) => {
  if (!filePath) return ''

  // 去除末尾的斜杠，然后获取文件名
  const cleanPath = filePath.replace(/\/+$/, '')
  const fileName = cleanPath.split('/').pop() || cleanPath

  // 如果文件名长度超过 30 个字符，显示前 27 个字符 + "..."
  if (fileName && fileName.length > 30) {
    return fileName.substring(0, 27) + '...'
  }

  return fileName || filePath
}

// 选择文件
const selectFile = async (file) => {
  selectedFile.value = file
  await loadFileDiff(file)
}

// 从Git历史中恢复提交信息（简化版）
const restoreCommitMessageFromGit = async () => {
  if (!props.projectPath) return
  
  try {
    // 简化逻辑：只检查独立缓存
    const cachedMessage = loadConflictMessageFromStore(props.projectPath)
    if (cachedMessage) {
      commitMessage.value = cachedMessage
      console.log('🔄 从独立缓存恢复冲突信息')
    }
  } catch (error) {
    console.error('恢复提交信息失败:', error)
  }
}

// 恢复暂存的合并提交信息（简化版）
const restoreStagedMergeMessage = async () => {
  if (!props.projectPath) return
  
  try {
    // 简化逻辑：只检查独立缓存
    const cachedMessage = loadConflictMessageFromStore(props.projectPath)
    if (cachedMessage) {
      commitMessage.value = cachedMessage
      console.log('🔄 从独立缓存恢复冲突信息')
    }
  } catch (error) {
    console.error('恢复暂存合并提交信息失败:', error)
  }
}


// 生成冲突提交信息
const generateConflictMessage = async () => {
  console.log('🆕 generateConflictMessage 被调用，项目路径:', props.projectPath)
  if (!props.projectPath) {
    console.log('❌ generateConflictMessage: projectPath为空')
    return
  }
  
  try {
    // 🔧 直接使用Git的MERGE_MSG文件内容，而不是手动拼接
    const mergeMsgCommand = `cd "${props.projectPath}" && cat .git/MERGE_MSG`
    console.log('🔍 执行命令:', mergeMsgCommand)
    const mergeMsgResult = await props.executeCommand(mergeMsgCommand)
    
    console.log('🔍 MERGE_MSG结果:', mergeMsgResult)
    
    if (mergeMsgResult.success && mergeMsgResult.output.trim()) {
      // 使用Git自动生成的合并信息
      commitMessage.value = mergeMsgResult.output.trim()
      console.log('✅ 使用Git自动生成的合并信息:', commitMessage.value.substring(0, 100) + '...')
      // 🔧 保存到独立缓存（只在检测到冲突时保存一次）
      console.log('💾 准备保存到缓存，项目路径:', props.projectPath)
      saveConflictMessageToStore(props.projectPath, commitMessage.value)
    } else {
      console.error('❌ 无法获取Git合并信息，回退到手动生成')
      // 回退到手动生成的方式
      await generateConflictMessageFallback()
    }
    
  } catch (error) {
    console.error('生成冲突提交信息失败:', error)
    // 出错时也回退到手动生成
    await generateConflictMessageFallback()
  }
}

// 回退方案：手动生成冲突提交信息
const generateConflictMessageFallback = async () => {
  if (!props.projectPath) return
  
  try {
    // 获取当前分支名
    const currentBranchCommand = `cd "${props.projectPath}" && git branch --show-current`
    const currentBranchResult = await props.executeCommand(currentBranchCommand)
    
    if (!currentBranchResult.success) {
      console.error('获取当前分支失败')
      return
    }
    
    const currentBranch = currentBranchResult.output.trim()
    
    // 获取远程仓库URL
    const remoteUrlCommand = `cd "${props.projectPath}" && git remote get-url origin`
    const remoteUrlResult = await props.executeCommand(remoteUrlCommand)
    
    let remoteUrl = 'origin'
    if (remoteUrlResult.success) {
      remoteUrl = remoteUrlResult.output.trim()
    }
    
    // 获取冲突文件列表
    const conflictFilesCommand = `cd "${props.projectPath}" && git diff --name-only --diff-filter=U`
    const conflictFilesResult = await props.executeCommand(conflictFilesCommand)
    
    let conflictPaths = ''
    if (conflictFilesResult.success && conflictFilesResult.output.trim()) {
      const files = conflictFilesResult.output.trim().split('\n')
      conflictPaths = files.map(file => `#\t${file}`).join('\n')
    }
    
    // 生成标准的冲突提交信息
    commitMessage.value = `Merge branch '${currentBranch}' of ${remoteUrl} into ${currentBranch}

# Conflicts:
${conflictPaths}`
    
    // 🔧 保存到独立缓存
    saveConflictMessageToStore(props.projectPath, commitMessage.value)
    
  } catch (error) {
    console.error('回退方案生成冲突提交信息失败:', error)
  }
}

// 处理提交信息输入框的键盘事件
const handleCommitMessageKeydown = (event) => {
  // 处理 Command+A (Mac) 或 Ctrl+A (Windows/Linux) 全选
  if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
    event.preventDefault()
    // textarea 使用 setSelectionRange 选中整个文本
    const textarea = event.target
    textarea.setSelectionRange(0, textarea.value.length)
  }
}

// 加载文件差异
const loadFileDiff = async (file) => {
  if (!props.projectPath || !file) return
  
  try {
    // 🔧 安全的文件路径处理：使用单引号包裹，并转义其中的单引号
    const safeFilePath = file.path.replace(/'/g, "'\\''")
    
    // 先尝试获取暂存区的差异
    let command = `cd "${props.projectPath}" && git -c core.quotePath=false diff --cached --color=never '${safeFilePath}'`
    console.log('🔍 执行暂存区差异命令:', command)
    let result = await props.executeCommand(command)
    
    // 如果暂存区没有差异，则获取工作区差异
    if (!result.success || !result.output.trim()) {
      command = `cd "${props.projectPath}" && git -c core.quotePath=false diff --color=never '${safeFilePath}'`
      console.log('🔍 执行工作区差异命令:', command)
      result = await props.executeCommand(command)
    }
    
    console.log('📋 差异命令结果:', result)
    
    if (result.success && result.output.trim()) {
      // 优化diff显示：添加语法高亮和更好的格式化
      const formatted = formatDiffOutput(result.output)
      fileDiff.value = formatted
      console.log('✅ 文件差异内容已格式化')
      console.log('📋 格式化后的HTML预览（前500字符）:', formatted.substring(0, 500))
    } else {
      // 如果都没有差异，尝试获取文件内容
      // 先检查是否是目录
      const isDir = file.path.endsWith('/') || file.isUntracked
      
      if (isDir && file.path.endsWith('/')) {
        // 如果是目录，显示目录下的文件列表
        const lsCommand = `cd "${props.projectPath}" && ls -la '${safeFilePath}' 2>/dev/null || echo '目录为空'`
        console.log('🔍 尝试获取目录内容:', lsCommand)
        const lsResult = await props.executeCommand(lsCommand)
        if (lsResult.success && lsResult.output.trim()) {
          fileDiff.value = formatFileContent(`目录: ${file.path}\n\n${lsResult.output}`, file.path)
          console.log('✅ 显示目录内容')
        } else {
          fileDiff.value = `新增目录: ${file.path}`
        }
      } else {
        // 如果是文件，获取文件内容
        const contentCommand = `cd "${props.projectPath}" && cat '${safeFilePath}' 2>/dev/null`
        console.log('🔍 尝试获取文件内容:', contentCommand)
        const contentResult = await props.executeCommand(contentCommand)

        if (contentResult.success && contentResult.output.trim()) {
          fileDiff.value = formatFileContent(contentResult.output, file.path)
          console.log('✅ 显示文件内容')
        } else {
          // 再尝试一次，可能是新文件
          fileDiff.value = `新增文件: ${file.path}\n\n（文件内容为空或无法读取）`
          console.log('❌ 无法获取文件内容')
        }
      }
    }
  } catch (error) {
    console.error('加载文件差异失败:', error)
    fileDiff.value = '加载文件差异失败'
  }
}

// 格式化diff输出，添加语法高亮（使用内联样式确保生效）
const formatDiffOutput = (diffText) => {
  if (!diffText) return ''
  
  const lines = diffText.split('\n')
  const formattedLines = lines.map(line => {
    // 先转义HTML，再添加样式标签
    const escapedLine = escapeHtml(line)
    
    // 添加行号标记和颜色（使用内联样式，无行间距，背景撑满 - 暗黑主题）
    if (line.startsWith('+++') || line.startsWith('---')) {
      return `<span class="diff-header-line" style="color: #9ca3af !important; background-color: #374151 !important; font-weight: 500; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else if (line.startsWith('@@')) {
      return `<span class="diff-hunk-line" style="color: #60a5fa !important; background-color: rgba(59, 130, 246, 0.2) !important; font-weight: 500; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      return `<span class="diff-added-line" style="color: #4ade80 !important; background-color: rgba(34, 197, 94, 0.15) !important; display: block; padding: 2px 8px; border-left: 3px solid #22c55e; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      return `<span class="diff-removed-line" style="color: #f87171 !important; background-color: rgba(239, 68, 68, 0.15) !important; display: block; padding: 2px 8px; border-left: 3px solid #ef4444; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else if (line.startsWith('\\')) {
      return `<span class="diff-context-line" style="color: #9ca3af !important; background-color: #2d2d2d !important; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else if (line.trim() === '') {
      // 空行也使用上下文样式
      return `<span class="diff-context-line" style="color: #9ca3af !important; background-color: #2d2d2d !important; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    } else {
      return `<span class="diff-context-line" style="color: #9ca3af !important; background-color: #2d2d2d !important; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1em;">${escapedLine}</span>`
    }
  })
  
  // 不使用 <br>，直接连接，让背景色完全连续
  // 每行已经是 block 元素，会自动换行
  return formattedLines.join('')
}

// 格式化文件内容（支持 Markdown 语法高亮）
const formatFileContent = (content, filePath = '') => {
  if (!content) return ''
  
  const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown')
  
  if (isMarkdown) {
    return formatMarkdownContent(content)
  }
  
  // 普通文件：按行显示，带行号
  const lines = content.split('\n')
  const formattedLines = lines.map((line, index) => {
    const lineNum = String(index + 1).padStart(4, ' ')
    const escapedLine = escapeHtml(line)
    return `<span style="color: #6b7280; user-select: none;">${lineNum}</span>  <span style="color: #e5e7eb;">${escapedLine}</span>`
  })
  return `<pre style="margin: 0; padding: 12px; background: #1e1e1e; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.5; overflow-x: auto;">${formattedLines.join('\n')}</pre>`
}

// 格式化 Markdown 内容
const formatMarkdownContent = (content) => {
  const lines = content.split('\n')
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeLines = []
  const result = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 代码块开始/结束
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
        codeLines = []
      } else {
        inCodeBlock = false
        const codeContent = escapeHtml(codeLines.join('\n'))
        result.push(`<div style="background: #1e1e1e; border-radius: 6px; margin: 8px 0; overflow: hidden;">
          <div style="background: #374151; color: #9ca3af; padding: 4px 12px; font-size: 11px;">${codeBlockLang || 'code'}</div>
          <pre style="margin: 0; padding: 12px; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; line-height: 1.4; color: #e5e7eb; overflow-x: auto;">${codeContent}</pre>
        </div>`)
      }
      continue
    }
    
    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }
    
    let formatted = escapeHtml(line)
    
    // 标题
    if (line.startsWith('# ')) {
      result.push(`<h1 style="color: #f3f4f6; font-size: 20px; font-weight: 600; margin: 16px 0 8px 0; padding-bottom: 8px; border-bottom: 1px solid #374151;">${escapeHtml(line.slice(2))}</h1>`)
      continue
    } else if (line.startsWith('## ')) {
      result.push(`<h2 style="color: #e5e7eb; font-size: 16px; font-weight: 600; margin: 14px 0 6px 0;">${escapeHtml(line.slice(3))}</h2>`)
      continue
    } else if (line.startsWith('### ')) {
      result.push(`<h3 style="color: #d1d5db; font-size: 14px; font-weight: 600; margin: 12px 0 4px 0;">${escapeHtml(line.slice(4))}</h3>`)
      continue
    }
    
    // 分隔线
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
      result.push(`<hr style="border: none; border-top: 1px solid #374151; margin: 12px 0;">`)
      continue
    }
    
    // 列表项
    if (line.match(/^[\-\*]\s/)) {
      formatted = `<span style="color: #60a5fa;">•</span> ${escapeHtml(line.slice(2))}`
    } else if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1]
      formatted = `<span style="color: #60a5fa;">${num}.</span> ${escapeHtml(line.slice(num.length + 2))}`
    }
    
    // 内联代码
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #374151; color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-size: 12px;">$1</code>')
    
    // 粗体
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: #f3f4f6; font-weight: 600;">$1</strong>')
    
    // 斜体
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em style="color: #d1d5db;">$1</em>')
    
    // 链接
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #60a5fa; text-decoration: none;">$1</a>')
    
    // 引用块
    if (line.startsWith('> ')) {
      result.push(`<div style="border-left: 3px solid #60a5fa; padding-left: 12px; color: #9ca3af; margin: 4px 0;">${escapeHtml(line.slice(2))}</div>`)
      continue
    }
    
    // 空行
    if (line.trim() === '') {
      result.push('<div style="height: 8px;"></div>')
      continue
    }
    
    result.push(`<div style="color: #d1d5db; line-height: 1.6; margin: 2px 0;">${formatted}</div>`)
  }
  
  return `<div style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">${result.join('')}</div>`
}

// 切换文件选择状态
const toggleFileSelection = (file) => {
  const index = selectedFiles.value.indexOf(file.path)
  if (index > -1) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(file.path)
  }
}

// 全选/取消全选
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // 取消全选
    selectedFiles.value = []
  } else {
    // 全选
    selectedFiles.value = pendingFiles.value.map(file => file.path)
  }
}

// 获取文件类型样式类
const getFileTypeClass = (file) => {
  // 🔧 优先使用未暂存状态，因为更能反映当前工作区的状态
  const status = file.unstagedStatus || file.stagedStatus || file.status
  
  if (file.isUntracked || status === '?') {
    return 'added'  // 未跟踪文件显示为新增样式
  } else if (status === 'D') {
    return 'deleted'
  } else if (status === 'A') {
    return 'added'
  } else if (status === 'M' || status === 'R' || status === 'C') {
    return 'modified'
  }
  return 'unknown'
}

// 获取文件类型文本
const getFileTypeText = (file) => {
  // 🔧 优先使用未暂存状态，因为更能反映当前工作区的状态
  const status = file.unstagedStatus || file.stagedStatus || file.status
  
  if (file.isUntracked || status === '?') {
    return '未跟踪'
  } else if (status === 'D') {
    return '删除'
  } else if (status === 'A') {
    return '新增'
  } else if (status === 'M' || status === 'R' || status === 'C') {
    return '修改'
  }
  return '未知'
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





// 🔧 优化：安全的文件名转义函数（使用单引号包裹，更好地支持中文）
const escapeFilePath = (filePath) => {
  if (!filePath) return ''
  
  // 使用单引号包裹路径，只需要转义单引号本身
  // 在 shell 中，单引号内的所有字符都按字面意义处理（包括中文）
  // 唯一的例外是单引号本身，需要用 '\'' 来转义
  return filePath.replace(/'/g, "'\\''")
}

// 双重转义：转义路径中的单引号，同时在外层用双引号包裹（用于bash -c）
const escapeForBashCommand = (filePath) => {
  if (!filePath) return ''
  // 在双引号内，需要转义的字符包括: $ ` " \ 和换行符
  // 对于双引号本身，需要用 \" 转义
  return filePath.replace(/[$\`"\\]/g, '\\$&')
}

// 🔧 优化：构建安全的Git命令（添加 core.quotePath=false 支持中文）
const buildSafeGitCommand = (baseCommand, filePaths) => {
  // 不使用引号，直接转义路径中的特殊字符
  // git 会自动处理这些路径
  const escapedFiles = filePaths.map(filePath => {
    // 转义所有可能被 shell 解析的特殊字符
    return filePath.replace(/["\\$` ()<>|&;!]/g, '\\$&')
  })
  // 添加 -c core.quotePath=false 确保 git 不转义中文路径
  const gitCommand = baseCommand.replace(/^git\s/, 'git -c core.quotePath=false ')
  return `${gitCommand} ${escapedFiles.join(' ')}`
}

// 执行命令并显示进度（支持实时输出）
const executeCommandWithProgress = async (command, onProgress) => {
  console.log('🚀 开始执行命令:', command)
  console.log('🔧 command类型:', typeof command, '值是:', command)
  console.log('🔧 props.projectPath:', props.projectPath)
  
  // 如果操作被取消，直接返回
  if (operationCancelled.value) {
    console.log('❌ 操作被取消:', command)
    return { success: false, error: '操作已取消' }
  }

  try {
    console.log('📡 使用Electron IPC实时执行命令')
    
    // 准备实时输出监听器
    const setupRealtimeListener = () => {
      return new Promise((resolve) => {
        let finalResult = null
        
        const handleRealtimeOutput = (event, data) => {
          console.log('📨 收到实时输出:', data.type, data.data)
          
          if (operationCancelled.value) {
            console.log('❌ 操作被取消，停止接收输出')
            return
          }
          
          switch (data.type) {
            case 'stdout':
            case 'stderr':
              // 实时显示输出
              if (onProgress) {
                onProgress(data.data)
              }
              break
              
            case 'complete':
              // 命令完成
              finalResult = {
                success: data.code === 0,
                output: data.output || '命令执行完成',
                stdout: data.stdout || '',
                stderr: data.stderr || '',
                exitCode: data.code
              }
              // 清理监听器
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              resolve(finalResult)
              break
              
            case 'error':
              // 命令执行出错
              console.error('❌ 实时命令执行错误:', data.error)
              finalResult = {
                success: false,
                output: data.error || '命令执行失败',
                error: data.error,
                exitCode: -1
              }
              // 清理监听器
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              resolve(finalResult)
              break
          }
        }
        
        // 注册监听器（延迟一下以确保监听器注册完成）
        setTimeout(() => {
          window.electronAPI.onRealtimeCommandOutput(handleRealtimeOutput)
        }, 10)
      })
    }
    
    // 设置实时输出监听
    const realtimeListenerPromise = setupRealtimeListener()
    
    // 发送实时执行命令
    const dataToSend = { 
      command: command,
      path: props.projectPath || process.cwd()
    }
    console.log('📋 发送给IPC的数据:', dataToSend)
    
    // 同时启动命令执行和监听器
    const executePromise = window.electronAPI.executeCommandRealtime(dataToSend)
    const result = await Promise.race([
      executePromise,
      realtimeListenerPromise
    ])
    
    console.log('📨 收到IPC响应:', result)
    
    // 如果操作在执行过程中被取消
    if (operationCancelled.value) {
      console.log('❌ 操作被取消:', command)
      return { success: false, error: '操作已取消' }
    }

    if (result.success) {
      console.log('✅ 命令执行成功')
      return { 
        success: true, 
        output: result.output || '命令执行完成' 
      }
    } else {
      console.error('❌ 命令执行失败:', result.stderr || result.error || '退出码非0')
      return { success: false, error: result.stderr || result.error || '命令执行失败' }
    }
  } catch (error) {
    console.error('❌ IPC调用失败:', error)
    const errorMsg = error.message || 'IPC调用失败'
    if (onProgress) {
      onProgress(errorMsg)
    }
    return { success: false, error: errorMsg }
  }
}

// 关闭操作弹框
const closeOperationDialog = () => {
  showOperationDialog.value = false
  operationType.value = ''
  operationOutput.value = ''
  operationInProgress.value = false
  operationCancelled.value = false
}

// 取消操作
const cancelOperation = async () => {
  operationCancelled.value = true
  operationInProgress.value = false
  showOperationDialog.value = false
  
  // 🔧 手动关闭弹框时也要刷新文件状态（保留选择）
  try {
    console.log('🔄 手动关闭弹框，刷新文件状态')
    await loadFileStatus(true)
    
    // 刷新分支状态
    if (props.refreshBranchStatus) {
      console.log('🔄 手动关闭弹框后刷新分支状态')
      await props.refreshBranchStatus()
    }
  } catch (error) {
    console.error('❌ 手动关闭弹框后刷新状态失败:', error)
  }
}

// 提交更改
const commitChanges = async () => {
  console.log('🔧 commitChanges开始 - props.projectPath:', props.projectPath)
  console.log('🔧 commitChanges开始 - commitMessage.value:', commitMessage.value)
  console.log('🔧 commitChanges开始 - selectedFiles.value:', selectedFiles.value)
  if (!props.projectPath || !commitMessage.value.trim() || selectedFiles.value.length === 0) return
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '提交更改'
  operationOutput.value = `正在提交 ${selectedFiles.value.length} 个文件...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 先暂存选中的文件
    console.log('🔧 props.projectPath 在commitChanges:', props.projectPath)
    console.log('🔧 selectedFiles.value:', selectedFiles.value)
    console.log('🔧 selectedFiles.value 长度:', selectedFiles.value.length)
    console.log('🔧 selectedFiles.value[0]:', selectedFiles.value[0])
    
    // 🔧 优化：使用安全的命令构建函数
    const addCommand = `cd "${props.projectPath}" && ${buildSafeGitCommand('git add', selectedFiles.value)}`
    console.log('🔧 构建的addCommand:', addCommand)
    console.log('🔧 addCommand 长度:', addCommand.length)
    console.log('🔧 addCommand 前100个字符:', addCommand.substring(0, 100))
    const addResult = await executeCommandWithProgress(addCommand, (output) => {
      // 避免重复添加相同的输出
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // Git add命令检查：即使退出码非0，如果只是gitignore警告也不视为失败
    if (!addResult.success) {
      const errorMessage = addResult.error || ''
      const outputMessage = addResult.output || ''
      
      console.log('🔍 暂存文件详细错误信息:', {
        error: errorMessage,
        output: outputMessage,
        selectedFiles: selectedFiles.value,
        projectPath: props.projectPath
      })
      
      // 🔧 优化：更详细的错误诊断
      if (errorMessage.includes('pathspec') && errorMessage.includes('did not match any files')) {
        // 文件名匹配失败的错误
        operationOutput.value += `\n\n❌ 文件名匹配失败: ${errorMessage}\n`
        operationOutput.value += `🔍 诊断信息:\n`
        operationOutput.value += `- 项目路径: ${props.projectPath}\n`
        operationOutput.value += `- 尝试添加的文件: ${selectedFiles.value.join(', ')}\n`
        operationOutput.value += `- 建议: 检查文件名是否包含特殊字符或中文编码问题\n`
        operationInProgress.value = false
        operationOutput.value += '\n\n❌ 暂存文件失败，请检查文件名是否正确'
        return
      } else if (errorMessage.includes('ignored by one of your .gitignore files') || 
                 errorMessage.includes('advice.addIgnoredFile')) {
        console.log('ℹ️ 部分文件被gitignore忽略，继续提交其他文件')
        if (addResult.output) {
          operationOutput.value += addResult.output + '\n'
        }
      } else {
        console.error('暂存文件失败:', addResult.error)
        // 确保显示完整的错误信息
        if (addResult.output && !operationOutput.value.includes(addResult.output)) {
          operationOutput.value += addResult.output
        }
        if (addResult.error && !operationOutput.value.includes(addResult.error)) {
          operationOutput.value += '\n\n❌ 错误: ' + addResult.error
        }
        operationInProgress.value = false
        operationOutput.value += '\n\n❌ 暂存文件失败'
        return
      }
    }
    
    // 然后提交（转义 commit message 防止命令注入）
    const safeMessage = escapeForBashCommand(commitMessage.value)
    const commitCommand = `cd "${props.projectPath}" && git commit -m "${safeMessage}"`
    const commitResult = await executeCommandWithProgress(commitCommand, (output) => {
      // 避免重复添加相同的输出
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })

    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }

    if (commitResult.success) {
      console.log('✅ 提交成功')
      // 确保显示完整的输出
      if (commitResult.output && !operationOutput.value.includes(commitResult.output)) {
        operationOutput.value += commitResult.output
      }
      
      operationOutput.value += '\n\n✅ 提交完成'
      
      operationInProgress.value = false

      // 立即关闭弹框
      closeOperationDialog()

      // 异步刷新状态（不阻塞弹框关闭）
      commitMessage.value = ''
      clearConflictMessageStore(props.projectPath)
      selectedFiles.value = []
      loadFileStatus(true).catch(() => {})
      loadCommitTemplate(props.projectPath)
      emit('status-changed')
    } else {
      console.error('提交失败:', commitResult.error)
      // 确保显示完整的错误信息
      if (commitResult.output && !operationOutput.value.includes(commitResult.output)) {
        operationOutput.value += commitResult.output
      }
      if (commitResult.error && !operationOutput.value.includes(commitResult.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + commitResult.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 提交失败'
      
      // 🔧 失败时也要刷新状态（可能部分操作成功了）
      try {
        console.log('🔄 提交失败，刷新文件状态')
        await loadFileStatus(true)
        if (props.refreshBranchStatus) {
          await props.refreshBranchStatus()
        }
      } catch (error) {
        console.error('❌ 失败后刷新状态失败:', error)
      }
    }
  } catch (error) {
    console.error('提交失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 提交失败: ${error.message}`
    
    // 🔧 异常时也要刷新状态
    try {
      console.log('🔄 提交异常，刷新文件状态')
      await loadFileStatus(true)
      if (props.refreshBranchStatus) {
        await props.refreshBranchStatus()
      }
    } catch (refreshError) {
      console.error('❌ 异常后刷新状态失败:', refreshError)
    }
  }
}

// 提交并推送
const commitAndPush = async () => {
  if (!props.projectPath || !commitMessage.value.trim() || selectedFiles.value.length === 0) return
  
  // 显示操作弹框
  showOperationDialog.value = true
  operationType.value = '提交并推送'
  operationOutput.value = `正在提交 ${selectedFiles.value.length} 个文件并推送到远程仓库...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    // 🔧 优化：先检查远程是否有更新
    operationOutput.value += '\n📡 检查远程仓库状态...\n'
    
    // 先 fetch 获取远程更新信息
    const fetchResult = await window.electronAPI.executeCommand({
      command: 'git fetch',
      cwd: props.projectPath
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 检查本地是否落后远程
    const statusResult = await window.electronAPI.executeCommand({
      command: 'git status -uno',
      cwd: props.projectPath
    })
    
    const behindRemote = statusResult.output?.includes('Your branch is behind')
    const diverged = statusResult.output?.includes('have diverged')
    
    if (behindRemote || diverged) {
      operationOutput.value += '\n⚠️ 检测到远程有更新，将先拉取再推送...\n'
      
      // 先 pull 获取远程更新
      const pullFirstResult = await executeCommandWithProgress(`cd "${props.projectPath}" && git pull --no-rebase`, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      
      if (operationCancelled.value) {
        operationOutput.value += '\n\n❌ 操作已取消'
        operationInProgress.value = false
        return
      }
      
      // 检查 pull 是否有冲突
      if (!pullFirstResult.success) {
        if (pullFirstResult.output?.includes('CONFLICT') || pullFirstResult.output?.includes('冲突')) {
          operationOutput.value += '\n\n❌ 拉取远程更新时发生冲突，请先解决冲突后再提交'
          operationInProgress.value = false
          return
        }
        // 如果是其他错误（如没有上游分支），继续执行
        if (!pullFirstResult.output?.includes('no tracking information')) {
          operationOutput.value += '\n\n⚠️ 拉取远程更新失败，继续尝试提交...'
        }
      } else {
        operationOutput.value += '\n✅ 远程更新已拉取\n'
      }
    } else {
      operationOutput.value += '✅ 远程无新更新\n'
    }
    
    // 暂存选中的文件
    // 🔧 优化：使用安全的命令构建函数
    const addCommand = `cd "${props.projectPath}" && ${buildSafeGitCommand('git add', selectedFiles.value)}`
    const addResult = await executeCommandWithProgress(addCommand, (output) => {
      // 避免重复添加相同的输出
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    if (!addResult.success) {
      console.error('暂存文件失败:', addResult.output)
      // 确保显示完整的错误信息
      if (addResult.output && !operationOutput.value.includes(addResult.output)) {
        operationOutput.value += addResult.output
      }
      if (addResult.error && !operationOutput.value.includes(addResult.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + addResult.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 暂存文件失败'
      return
    }
    
    // 然后提交（转义 commit message 防止命令注入）
    const safeMessage = escapeForBashCommand(commitMessage.value)
    const commitCommand = `cd "${props.projectPath}" && git commit -m "${safeMessage}"`
    const commitResult = await executeCommandWithProgress(commitCommand, (output) => {
      // 避免重复添加相同的输出
      if (output && !operationOutput.value.endsWith(output)) {
        operationOutput.value += output
      }
    })

    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }

    if (commitResult.success) {
      // 检查是否有远程仓库
      const checkRemoteCommand = `cd "${props.projectPath}" && git remote -v`
      const checkRemoteResult = await window.electronAPI.executeCommand({
        command: 'git remote -v',
        cwd: props.projectPath
      })
      
      const hasRemote = checkRemoteResult.success && checkRemoteResult.output?.trim()
      
      if (!hasRemote) {
        // 没有远程仓库，只提交不推送
        console.log('✅ 本地仓库提交成功（无远程仓库）')
        operationOutput.value += '\n\n✅ 提交完成（本地仓库，无需推送）'
        operationOutput.value += '\n\n💡 提示：此仓库没有配置远程仓库，如需推送请先添加远程仓库：'
        operationOutput.value += '\n   git remote add origin <远程仓库地址>'
        
        // 清空提交信息和选中的文件
        commitMessage.value = ''
        selectedFiles.value = []

        operationInProgress.value = false

        // 立即关闭弹框
        closeOperationDialog()

        // 异步刷新文件状态
        loadFileStatus().catch(() => {})
        emit('status-changed')

        return
      }
      
      // 有远程仓库，直接推送（已在提交前完成 pull）
      // 先尝试直接推送
      operationOutput.value += '\n📤 正在推送到远程仓库...\n'
      const pushCommand = `cd "${props.projectPath}" && git push`
      let pushResult = await executeCommandWithProgress(pushCommand, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      
      if (operationCancelled.value) {
        operationOutput.value += '\n\n❌ 操作已取消'
        operationInProgress.value = false
        return
      }
      
      // 检查推送是否因为没有上游分支而失败
      if (!pushResult.success && (pushResult.output?.includes('no upstream branch') || pushResult.output?.includes('no tracking information') || pushResult.error?.includes('no upstream'))) {
        // 尝试设置上游并推送
        operationOutput.value += '\n⚠️ 当前分支没有上游跟踪，尝试设置并推送...\n'
        
        // 获取当前分支名
        const branchResult = await window.electronAPI.executeCommand({
          command: 'git branch --show-current',
          cwd: props.projectPath
        })
        const currentBranchName = branchResult.output?.trim() || 'main'
        
        // 使用 -u 设置上游并推送
        const pushWithUpstreamCommand = `cd "${props.projectPath}" && git push -u origin ${currentBranchName}`
        pushResult = await executeCommandWithProgress(pushWithUpstreamCommand, (output) => {
          if (output && !operationOutput.value.endsWith(output)) {
            operationOutput.value += output
          }
        })
        
        if (pushResult.success) {
          console.log('✅ 提交并推送成功（已设置上游）')
          operationOutput.value += '\n\n✅ 提交并推送完成（已设置上游分支）'

          commitMessage.value = ''
          selectedFiles.value = []

          operationInProgress.value = false

          // 立即关闭弹框
          closeOperationDialog()

          // 异步刷新状态
          loadFileStatus().catch(() => {})
          ;(async () => {
            try {
              if (window.electronAPI.clearBranchStatusCache) {
                await window.electronAPI.clearBranchStatusCache({ path: props.projectPath })
              }
              if (props.refreshBranchStatus) {
                await props.refreshBranchStatus()
              }
            } catch (e) {
              console.error('❌ 刷新分支状态失败:', e)
            }
          })()
        } else {
          operationOutput.value += '\n\n❌ 推送失败: ' + (pushResult.output || pushResult.error || '未知错误')
          operationInProgress.value = false
        }

        return
      }
      
      // 检查是否因为远程有新提交而被拒绝
      if (!pushResult.success && (pushResult.output?.includes('rejected') || pushResult.error?.includes('rejected'))) {
        operationOutput.value += '\n⚠️ 推送被拒绝，远程有新更新，正在拉取并重试...\n'
        
        // 拉取远程更新
        const pullRetryResult = await executeCommandWithProgress(`cd "${props.projectPath}" && git pull --no-rebase`, (output) => {
          if (output && !operationOutput.value.endsWith(output)) {
            operationOutput.value += output
          }
        })
        
        if (!pullRetryResult.success) {
          if (pullRetryResult.output?.includes('CONFLICT')) {
            operationOutput.value += '\n\n❌ 拉取时发生冲突，请手动解决冲突后重新推送'
          } else {
            operationOutput.value += '\n\n❌ 拉取失败: ' + (pullRetryResult.output || pullRetryResult.error || '未知错误')
          }
          operationInProgress.value = false
          return
        }
        
        // 重试推送
        pushResult = await executeCommandWithProgress(pushCommand, (output) => {
          if (output && !operationOutput.value.endsWith(output)) {
            operationOutput.value += output
          }
        })
      }
      
      if (pushResult.success) {
        // 推送成功
        console.log('✅ 提交并推送成功')
        operationOutput.value += '\n\n✅ 提交并推送完成'

        operationInProgress.value = false

        // 立即关闭弹框
        closeOperationDialog()

        // 异步刷新状态（不阻塞弹框关闭）
        commitMessage.value = ''
        clearConflictMessageStore(props.projectPath)
        selectedFiles.value = []
        loadFileStatus(true).catch(() => {})
        loadCommitTemplate(props.projectPath)

        // 异步清除分支状态缓存并刷新
        ;(async () => {
          try {
            if (window.electronAPI.clearBranchStatusCache) {
              await window.electronAPI.clearBranchStatusCache({ path: props.projectPath })
            }
            if (props.refreshBranchStatus) {
              await props.refreshBranchStatus()
            }
          } catch (e) {
            console.error('❌ 刷新分支状态失败:', e)
          }
        })()
      } else {
        console.error('推送失败:', pushResult.output)
        // 确保显示完整的错误信息
        if (pushResult.output && !operationOutput.value.includes(pushResult.output)) {
          operationOutput.value += pushResult.output
        }
        if (pushResult.error && !operationOutput.value.includes(pushResult.error)) {
          operationOutput.value += '\n\n❌ 错误: ' + pushResult.error
        }
        operationInProgress.value = false
        operationOutput.value += '\n\n❌ 推送失败'
        
        // 🔧 失败时也要刷新状态
        try {
          console.log('🔄 推送失败，刷新文件状态')
          await loadFileStatus(true)
          if (props.refreshBranchStatus) {
            await props.refreshBranchStatus()
          }
        } catch (error) {
          console.error('❌ 失败后刷新状态失败:', error)
        }
      }
    } else {
      console.error('提交失败:', commitResult.output)
      // 确保显示完整的错误信息
      if (commitResult.output && !operationOutput.value.includes(commitResult.output)) {
        operationOutput.value += commitResult.output
      }
      if (commitResult.error && !operationOutput.value.includes(commitResult.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + commitResult.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 提交失败'
      
      // 🔧 失败时也要刷新状态
      try {
        console.log('🔄 提交失败，刷新文件状态')
        await loadFileStatus(true)
        if (props.refreshBranchStatus) {
          await props.refreshBranchStatus()
        }
      } catch (error) {
        console.error('❌ 失败后刷新状态失败:', error)
      }
    }
  } catch (error) {
    console.error('提交并推送失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 提交并推送失败: ${error.message}`
  }
}


// 放弃文件修改
const discardFileChanges = async () => {
  if (!props.projectPath || !selectedFile.value) return
  
  const file = selectedFile.value
  const fileName = file.path
  
  // 确认对话框
  const confirmed = await confirm({
    title: '放弃修改',
    message: `确定要放弃对文件的修改吗？此操作不可撤销。`,
    detail: fileName,
    type: 'danger',
    confirmText: '放弃修改'
  })
  if (!confirmed) {
    return
  }
  
  try {
    // 显示操作弹框
    showOperationDialog.value = true
    operationType.value = '放弃修改'
    operationOutput.value = `正在放弃对文件 "${fileName}" 的修改...\n`
    operationInProgress.value = true
    operationCancelled.value = false
    
    // 🔧 使用安全的文件路径
    const safeFilePath = fileName.replace(/'/g, "'\\''")
    let commands = []
    let result = null
    
    // 🔧 根据文件状态决定使用什么命令
    if (file.isUntracked) {
      // 未跟踪的文件（新增文件）：直接删除文件
      operationOutput.value += `文件类型: 未跟踪（新增文件），将删除此文件\n`
      const command = `cd "${props.projectPath}" && rm -f '${safeFilePath}'`
      console.log('🚀 执行删除未跟踪文件命令:', command)
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    } else if (file.stagedStatus && file.stagedStatus !== ' ') {
      // 已暂存的文件：先取消暂存，再还原内容
      operationOutput.value += `文件类型: 已暂存，将取消暂存并还原\n`
      
      // 步骤1：取消暂存
      const resetCommand = `cd "${props.projectPath}" && git reset HEAD '${safeFilePath}'`
      console.log('🚀 步骤1 - 取消暂存:', resetCommand)
      const resetResult = await executeCommandWithProgress(resetCommand, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
      
      if (resetResult.success || resetResult.output?.includes('Unstaged')) {
        // 步骤2：还原文件内容
        const checkoutCommand = `cd "${props.projectPath}" && git checkout -- '${safeFilePath}'`
        console.log('🚀 步骤2 - 还原文件:', checkoutCommand)
        result = await executeCommandWithProgress(checkoutCommand, (output) => {
          if (output && !operationOutput.value.endsWith(output)) {
            operationOutput.value += output
          }
        })
      } else {
        result = resetResult
      }
    } else {
      // 未暂存的修改：直接使用 git checkout 还原
      operationOutput.value += `文件类型: 未暂存的修改，将还原到最近提交状态\n`
      const command = `cd "${props.projectPath}" && git checkout -- '${safeFilePath}'`
      console.log('🚀 执行还原文件命令:', command)
      result = await executeCommandWithProgress(command, (output) => {
        if (output && !operationOutput.value.endsWith(output)) {
          operationOutput.value += output
        }
      })
    }
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    if (result && result.success) {
      console.log('✅ 放弃文件修改成功')
      if (result.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }

      operationInProgress.value = false

      // 立即关闭弹框
      closeOperationDialog()

      // 异步刷新状态
      loadFileStatus(true).catch(() => {})
      if (props.refreshBranchStatus) {
        props.refreshBranchStatus().catch(() => {})
      }
    } else {
      console.error('放弃文件修改失败:', result?.output)
      if (result?.output && !operationOutput.value.includes(result.output)) {
        operationOutput.value += result.output
      }
      if (result?.error && !operationOutput.value.includes(result.error)) {
        operationOutput.value += '\n\n❌ 错误: ' + result.error
      }
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 放弃修改失败'
      
      try {
        console.log('🔄 放弃修改失败，刷新文件状态')
        await loadFileStatus(true)
        if (props.refreshBranchStatus) {
          await props.refreshBranchStatus()
        }
      } catch (error) {
        console.error('❌ 失败后刷新状态失败:', error)
      }
    }
  } catch (error) {
    console.error('放弃文件修改异常:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 放弃修改失败: ${error.message}`
    
    try {
      console.log('🔄 放弃修改异常，刷新文件状态')
      await loadFileStatus(true)
      if (props.refreshBranchStatus) {
        await props.refreshBranchStatus()
      }
    } catch (refreshError) {
      console.error('❌ 异常后刷新状态失败:', refreshError)
    }
  }
}

// 冲突解决功能
const showConflictResolver = async () => {
  if (!selectedFile.value || !props.projectPath) return
  
  showConflictResolverDialog.value = true
  
  try {
    // 读取冲突文件内容
    const safeFilePath = selectedFile.value.path.replace(/'/g, "'\\''")
    const command = `cd "${props.projectPath}" && cat '${safeFilePath}'`
    const result = await props.executeCommand(command)
    
    if (result.success && result.output) {
      conflictContent.value = result.output
      parseConflictContent(result.output)
    }
  } catch (error) {
    console.error('加载冲突文件失败:', error)
  }
}

const parseConflictContent = (content) => {
  // 解析冲突标记：<<<<<<< HEAD, =======, >>>>>>> branch
  const lines = content.split('\n')
  const sections = []
  let currentSection = null
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (line.startsWith('<<<<<<<')) {
      // 开始新的冲突区域
      currentSection = {
        marker: line,
        content: '',
        startIndex: i,
        type: 'ours',
        selected: false
      }
    } else if (line === '=======') {
      if (currentSection) {
        sections.push(currentSection)
        currentSection = {
          marker: '=======',
          content: '',
          startIndex: i,
          type: 'separator',
          selected: false
        }
      }
    } else if (line.startsWith('>>>>>>>')) {
      if (currentSection) {
        sections.push(currentSection)
        currentSection = {
          marker: line,
          content: '',
          startIndex: i,
          type: 'theirs',
          selected: false
        }
        sections.push(currentSection)
        currentSection = null
      }
    } else if (currentSection) {
      currentSection.content += line + '\n'
    }
  }
  
  conflictSections.value = sections.filter(s => s.type !== 'separator')
}

const useConflictVersion = (section) => {
  // 标记使用此版本
  section.selected = true
  // 取消选择同类型的其他版本
  conflictSections.value.forEach(s => {
    if (s !== section && s.type === section.type) {
      s.selected = false
    }
  })
}

const closeConflictResolver = () => {
  showConflictResolverDialog.value = false
  conflictContent.value = ''
  conflictSections.value = []
  resolvedConflictContent.value = ''
}

const resolveConflict = async () => {
  if (!selectedFile.value || !props.projectPath) return
  
  // 构建解决后的内容
  const lines = conflictContent.value.split('\n')
  let resolvedLines = []
  let inConflict = false
  let currentConflictSection = null
  let useOurs = false
  let useTheirs = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (line.startsWith('<<<<<<<')) {
      inConflict = true
      currentConflictSection = conflictSections.value.find(s => s.startIndex === i && s.type === 'ours')
      useOurs = currentConflictSection?.selected || false
    } else if (line === '=======') {
      // 分隔符，跳过
    } else if (line.startsWith('>>>>>>>')) {
      currentConflictSection = conflictSections.value.find(s => s.startIndex === i && s.type === 'theirs')
      useTheirs = currentConflictSection?.selected || false
      
      // 如果选择了某个版本，添加其内容
      if (useOurs) {
        const oursSection = conflictSections.value.find(s => s.startIndex <= i && s.type === 'ours')
        if (oursSection && oursSection.content) {
          resolvedLines.push(...oursSection.content.trim().split('\n'))
        }
      } else if (useTheirs) {
        const theirsSection = conflictSections.value.find(s => s.startIndex === i && s.type === 'theirs')
        if (theirsSection && theirsSection.content) {
          resolvedLines.push(...theirsSection.content.trim().split('\n'))
        }
      }
      
      inConflict = false
      currentConflictSection = null
      useOurs = false
      useTheirs = false
    } else if (!inConflict) {
      resolvedLines.push(line)
    }
  }
  
  resolvedConflictContent.value = resolvedLines.join('\n')
  
  // 保存解决后的内容
  showOperationDialog.value = true
  operationType.value = '解决冲突'
  operationOutput.value = `正在保存解决后的文件内容...\n`
  operationInProgress.value = true
  operationCancelled.value = false
  
  try {
    const safeFilePath = selectedFile.value.path.replace(/'/g, "'\\''")
    // 将解决后的内容写入文件
    const escapedContent = resolvedConflictContent.value.replace(/'/g, "'\\''")
    const command = `cd "${props.projectPath}" && cat > '${safeFilePath}' << 'EOF'\n${resolvedConflictContent.value}\nEOF`
    
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
      // 标记冲突已解决
      const markResolvedCommand = `cd "${props.projectPath}" && git add "${selectedFile.value.path}"`
      await props.executeCommand(markResolvedCommand)
      
      // 刷新文件状态（保留选择）
      await loadFileStatus(true)
      
      // 刷新分支状态
      if (props.refreshBranchStatus) {
        await props.refreshBranchStatus()
      }
      
      closeConflictResolver()
      operationInProgress.value = false
      operationOutput.value += '\n\n✅ 冲突已解决'
      
      setTimeout(() => {
        showOperationDialog.value = false
      }, 300)
    } else {
      operationInProgress.value = false
      operationOutput.value += '\n\n❌ 解决冲突失败'
    }
  } catch (error) {
    console.error('解决冲突失败:', error)
    operationInProgress.value = false
    operationOutput.value += `\n\n❌ 解决冲突失败: ${error.message}`
  }
}

// 重置状态
const resetState = () => {
  modifiedFiles.value = []
  selectedFile.value = null
  fileDiff.value = ''
  selectedFiles.value = []
  commitMessage.value = ''
  // 🔧 重置状态时不清空独立缓存，只清空当前显示
  fileStatusLoading.value = false
  commitLoading.value = false
}



// 暴露给父组件
defineExpose({
  loadFileStatus
})
</script>

<style scoped>
/* 文件状态面板 */
.file-status-section {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}


.file-status-content {
  flex: 1;
  display: flex;
  min-height: 0;
}

.file-list-panel {
  width: 260px;
  min-width: 220px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #2d2d2d;
}

.file-list-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-list-section:first-child {
  flex: 1;
}

.file-list-section:last-child {
  flex: 1;
}

.file-list-header {
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

.select-all-checkbox {
  margin-right: 4px;
  cursor: pointer;
}

.file-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: normal;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  background: #2d2d2d;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.file-item:hover {
  background: rgba(102, 126, 234, 0.15);
}

.file-item.active {
  background: rgba(102, 126, 234, 0.25);
  font-weight: 500;
}

.file-path {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  flex: 1;
  word-break: break-word;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}


.empty-files {
  padding: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.file-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
  height: 100%;
}

.file-diff-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.file-diff-header {
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 40px;
  line-height: 1.4;
}

.file-diff-header span {
  flex: 1;
  word-break: break-all;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  margin-right: 12px;
}

.file-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.resolve-conflict-btn {
  background: #ff9800;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.resolve-conflict-btn:hover:not(:disabled) {
  background: #e68900;
}

.resolve-conflict-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.discard-changes-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.discard-changes-btn:hover:not(:disabled) {
  background: #c82333;
}

.discard-changes-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.conflict-resolver {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #2d2d2d;
}

.conflict-resolver-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(251, 191, 36, 0.2);
}

.conflict-resolver-header h4 {
  margin: 0;
  font-size: 14px;
  color: #fbbf24;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #fbbf24;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.close-btn:hover {
  background: rgba(251, 191, 36, 0.3);
}

.conflict-sections {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.conflict-section {
  margin-bottom: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.conflict-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.conflict-marker {
  font-family: monospace;
  font-size: 12px;
  color: #fbbf24;
  font-weight: 500;
}

.use-version-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.use-version-btn:hover {
  background: #218838;
}

.conflict-section.selected {
  border-color: #28a745;
  border-width: 2px;
}

.conflict-content {
  padding: 12px;
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  max-height: 300px;
  overflow-y: auto;
}

.conflict-resolver-actions {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: #2d2d2d;
}

.conflict-resolver-actions .cancel-btn,
.conflict-resolver-actions .confirm-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.conflict-resolver-actions .cancel-btn {
  background: #6c757d;
  color: white;
}

.conflict-resolver-actions .cancel-btn:hover {
  background: #545b62;
}

.conflict-resolver-actions .confirm-btn {
  background: #007bff;
  color: white;
}

.conflict-resolver-actions .confirm-btn:hover {
  background: #0056b3;
}

.file-diff-content {
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

.diff-header {
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.diff-content {
  padding: 0;
  background: #2d2d2d;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: auto;
}

.diff-content pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
  overflow-wrap: break-word;
  max-width: 100%;
  overflow-x: auto;
}

/* 移除这个规则，因为它会覆盖子元素的样式 */

/* 文件内容样式 */
.diff-text {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1em;
  max-width: 100%;
  overflow-x: auto;
  padding: 0;
  background: #2d2d2d;
}

/* 确保span之间没有间隙，背景撑满整行 */
.diff-text span {
  margin: 0 !important;
  display: block !important;
  line-height: 1em !important;
  vertical-align: top !important;
}

/* 移除br标签的间距，但保留换行功能 */
.diff-text br {
  margin: 0 !important;
  padding: 0 !important;
  line-height: 0 !important;
  height: 0 !important;
  display: none !important;
  content: "" !important;
  font-size: 0 !important;
}

/* Diff 行样式 - 使用内联样式级别的优先级 - 暗黑主题 */
.diff-text .diff-header-line,
.diff-content .diff-text .diff-header-line,
div.diff-text .diff-header-line,
div.diff-content div.diff-text .diff-header-line {
  color: #9ca3af !important;
  font-weight: 500 !important;
  background-color: #374151 !important;
  background: #374151 !important;
  display: block !important;
  padding: 2px 8px !important;
  margin: 0 !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.diff-text .diff-hunk-line,
.diff-content .diff-text .diff-hunk-line,
div.diff-text .diff-hunk-line,
div.diff-content div.diff-text .diff-hunk-line {
  color: #60a5fa !important;
  font-weight: 500 !important;
  background-color: rgba(59, 130, 246, 0.2) !important;
  background: rgba(59, 130, 246, 0.2) !important;
  display: block !important;
  padding: 2px 8px !important;
  margin: 0 !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.diff-text .diff-added-line,
.diff-content .diff-text .diff-added-line,
div.diff-text .diff-added-line,
div.diff-content div.diff-text .diff-added-line {
  color: #4ade80 !important;
  background-color: rgba(34, 197, 94, 0.15) !important;
  background: rgba(34, 197, 94, 0.15) !important;
  display: block !important;
  padding: 2px 8px !important;
  border-left: 3px solid #22c55e !important;
  margin: 0 !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.diff-text .diff-removed-line,
.diff-content .diff-text .diff-removed-line,
div.diff-text .diff-removed-line,
div.diff-content div.diff-text .diff-removed-line {
  color: #f87171 !important;
  background-color: rgba(239, 68, 68, 0.15) !important;
  background: rgba(239, 68, 68, 0.15) !important;
  display: block !important;
  padding: 2px 8px !important;
  border-left: 3px solid #ef4444 !important;
  margin: 0 !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.diff-text .diff-context-line,
.diff-content .diff-text .diff-context-line,
div.diff-text .diff-context-line,
div.diff-content div.diff-text .diff-context-line {
  color: #9ca3af !important;
  background-color: #2d2d2d !important;
  background: #1e1e1e !important;
  display: block !important;
  padding: 2px 8px !important;
  margin: 0 !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.file-content {
  color: rgba(255, 255, 255, 0.8);
  display: block;
}

.diff-actions {
  padding: 8px 12px;
  background: #2d2d2d;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
}

.stage-block-btn, .discard-block-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background-color 0.2s ease;
}

.stage-block-btn {
  background: #007bff;
  color: white;
}

.stage-block-btn:hover {
  background: #0056b3;
}

.discard-block-btn {
  background: #dc3545;
  color: white;
}

.discard-block-btn:hover {
  background: #c82333;
}

.no-file-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
  font-size: 14px;
}

/* 暂存相关样式 */
.stage-checkbox {
  margin-right: 8px;
  cursor: pointer;
}


.commit-section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 160px;
  flex-shrink: 0;
  background: #2d2d2d;
}

.commit-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.commit-content {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}


.commit-message {
  flex: 1;
  min-height: 80px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  resize: vertical;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.commit-message:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

.commit-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.commit-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #495057;
  cursor: pointer;
}

.commit-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.commit-buttons {
  display: flex;
  gap: 8px;
}

.commit-btn, .commit-push-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease;
}

.commit-btn {
  background: #4a5568;
  color: white;
}

.commit-btn:hover:not(:disabled) {
  background: #2d3748;
}

.commit-btn:disabled {
  background: #4a5568;
  opacity: 0.5;
  cursor: not-allowed;
}

.commit-push-btn {
  background: #667eea;
  color: white;
}

.commit-push-btn:hover:not(:disabled) {
  background: #5a67d8;
}

.commit-push-btn:disabled {
  background: #667eea;
  opacity: 0.5;
  cursor: not-allowed;
}

/* 冲突文件样式 */
.conflict-file {
  background-color: rgba(239, 68, 68, 0.2) !important;
  border-left: 3px solid #ef4444 !important;
}

.conflict-file:hover {
  background-color: rgba(239, 68, 68, 0.3) !important;
}

.conflict-indicator {
  background: #dc3545;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
}

.file-type-indicator {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
}

.file-type-indicator.added {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.file-type-indicator.modified {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.file-type-indicator.deleted {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.file-type-indicator.unknown {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}

/* 批量操作按钮 */
.batch-actions {
  display: flex;
  gap: 8px;
}

.discard-all-btn, .stash-files-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.discard-all-btn {
  background: #dc3545;
  color: white;
}

.discard-all-btn:hover {
  background: #c82333;
}

.stash-files-btn {
  background: #007bff;
  color: white;
}

.stash-files-btn:hover {
  background: #0056b3;
}

/* 对话框样式 */
.dialog-overlay {
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
}

.dialog-content {
  background: #2d2d2d !important;
  border-radius: 8px;
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.9);
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
}

.dialog-body p {
  margin: 0 0 12px 0;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
}

.warning-text {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid rgba(251, 191, 36, 0.3);
  font-size: 13px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.stash-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.stash-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

.stash-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn-large, .confirm-btn-large {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.cancel-btn-large {
  background: #6c757d;
  color: white;
}

.cancel-btn-large:hover {
  background: #545b62;
}

.confirm-btn-large {
  background: #007bff;
  color: white;
}

.confirm-btn-large:hover {
  background: #0056b3;
}

.confirm-btn-large.danger {
  background: #dc3545;
}

.confirm-btn-large.danger:hover {
  background: #c82333;
}

/* 响应式设计 - 小屏幕优化 */
@media (max-width: 1200px) {
  .file-list-panel {
    width: 260px;
    min-width: 200px;
  }
  
  .file-list-header {
    padding: 4px 12px;
    min-height: 36px;
  }
  
  .file-item {
    padding: 4px 12px;
  }
  
  .file-diff-header {
    padding: 4px 12px;
    min-height: 36px;
    font-size: 12px;
  }
  
  .file-diff-content {
    padding: 6px;
  }
  
  .diff-content {
    padding: 6px;
  }
  
  .commit-section {
    min-height: 140px;
  }
  
  .commit-content {
    padding: 8px;
  }
  
  .commit-message {
    min-height: 60px;
    padding: 6px;
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  .file-status-content {
    flex-direction: column;
  }
  
  .file-list-panel {
    width: 100%;
    min-width: unset;
    border-right: none;
    border-bottom: 1px solid #dee2e6;
    max-height: 300px;
  }
  
  .file-detail-panel {
    flex: 1;
  }
  
  .file-list-header {
    padding: 3px 8px;
    min-height: 32px;
    font-size: 13px;
  }
  
  .file-item {
    padding: 3px 8px;
    font-size: 13px;
  }
  
  .file-diff-header {
    padding: 3px 8px;
    min-height: 32px;
    font-size: 11px;
  }
  
  .file-diff-content {
    padding: 4px;
  }
  
  .diff-content {
    padding: 4px;
  }
  
  .commit-section {
    min-height: 120px;
  }
  
  .commit-content {
    padding: 6px;
    gap: 6px;
  }
  
  .commit-message {
    min-height: 50px;
    padding: 4px;
    font-size: 11px;
  }
  
  .commit-actions {
    flex-direction: column;
    gap: 4px;
  }
  
  .commit-btn, .commit-push-btn {
    width: 100%;
    padding: 4px 8px;
    font-size: 11px;
  }
}

/* 文件右键菜单样式 */
.context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.context-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu-item:hover {
  background: rgba(102, 126, 234, 0.2);
}

.context-menu-item .menu-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

</style>
