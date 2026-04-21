<template>
  <div v-if="visible" class="settings-dialog-overlay">
    <div class="settings-dialog">
      <!-- 标题 -->
      <div class="dialog-header">
        <h3>项目设置</h3>
      </div>

      <!-- 内容区域 -->
      <div class="dialog-body">
        <!-- 提交模板 -->
        <div class="settings-section">
          <div class="section-header">
            <span class="section-title">提交模板</span>
          </div>
          <div class="section-content">
            <textarea
              v-model="commitTemplate"
              class="template-input"
              placeholder="输入提交模板，例如：&#10;feat: 新功能&#10;fix: 修复问题&#10;docs: 文档更新"
              rows="4"
            ></textarea>
            <div class="template-scope">
              <label class="scope-option">
                <input
                  type="radio"
                  v-model="templateScope"
                  value="project"
                />
                <span>仅当前项目</span>
              </label>
              <label class="scope-option">
                <input
                  type="radio"
                  v-model="templateScope"
                  value="global"
                />
                <span>应用全局</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 远程仓库地址管理 -->
        <div class="settings-section">
          <div class="section-header">
            <span class="section-title">远程仓库地址</span>
            <button class="add-remote-btn" @click="addRemote">
              <Plus :size="14" /> 添加
            </button>
          </div>
          <div class="section-content">
            <div v-if="remotes.length === 0" class="empty-remotes">
              暂无远程仓库地址
            </div>
            <div v-else class="remotes-list">
              <div v-for="(remote, index) in remotes" :key="index" class="remote-item">
                <div v-if="editingIndex === index" class="remote-edit">
                  <input
                    v-model="editingName"
                    class="remote-name-input"
                    placeholder="名称 (如 origin)"
                  />
                  <input
                    v-model="editingUrl"
                    class="remote-url-input"
                    placeholder="URL"
                  />
                  <div class="edit-actions">
                    <button class="save-btn" @click="saveRemote(index)">
                      <Check :size="14" />
                    </button>
                    <button class="cancel-edit-btn" @click="cancelEdit">
                      <X :size="14" />
                    </button>
                  </div>
                </div>
                <div v-else class="remote-view">
                  <span class="remote-name">{{ remote.name }}</span>
                  <span class="remote-url">{{ remote.url }}</span>
                  <div class="remote-actions">
                    <button class="edit-btn" @click="editRemote(index)">
                      <Pencil :size="14" />
                    </button>
                    <button class="delete-btn" @click="deleteRemote(index)">
                      <Trash2 :size="14" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 终端模式 -->
        <div class="settings-section">
          <div class="section-header">
            <span class="section-title">终端模式</span>
          </div>
          <div class="section-content">
            <div class="template-scope">
              <label class="scope-option">
                <input
                  type="radio"
                  v-model="terminalMode"
                  value="split"
                />
                <span>分屏终端</span>
              </label>
              <label class="scope-option">
                <input
                  type="radio"
                  v-model="terminalMode"
                  value="liquid"
                />
                <span>灵动终端</span>
              </label>
            </div>
            <label class="terminal-mode-global-option">
              <input
                type="checkbox"
                v-model="applyTerminalModeGlobally"
              />
              <span>应用全局生效</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="dialog-footer">
        <button class="cancel-btn" @click="cancel">取消</button>
        <button class="confirm-btn" @click="confirm">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-vue-next'
import { useConfirm } from '../../composables/useConfirm'

const { confirm: showConfirm } = useConfirm()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  projectPath: {
    type: String,
    default: ''
  },
  terminalMode: {
    type: String,
    default: 'split'
  },
  terminalModeApplyGlobally: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:visible', 'confirm'])

// 提交模板
const commitTemplate = ref('')
const templateScope = ref('project') // 'project' | 'global'

// 远程仓库
const remotes = ref([])
const editingIndex = ref(-1)
const editingName = ref('')
const editingUrl = ref('')
const terminalMode = ref('split')
const applyTerminalModeGlobally = ref(true)

// 加载设置
const loadSettings = async () => {
  if (!props.projectPath) return

  try {
    // 加载提交模板
    const projectKey = `commit-template-${props.projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
    const globalTemplate = await window.electronAPI?.getConfig('commit-template-global')
    const projectTemplate = await window.electronAPI?.getConfig(projectKey)
    
    if (projectTemplate) {
      commitTemplate.value = projectTemplate
      templateScope.value = 'project'
    } else if (globalTemplate) {
      commitTemplate.value = globalTemplate
      templateScope.value = 'global'
    }

    // 加载远程仓库列表
    const result = await window.electronAPI?.executeCommand({
      command: 'git remote -v',
      cwd: props.projectPath
    })

    if (result?.success && result.output) {
      const lines = result.output.trim().split('\n')
      const remoteMap = new Map()
      
      for (const line of lines) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
        if (match) {
          const [, name, url] = match
          if (!remoteMap.has(name)) {
            remoteMap.set(name, { name, url })
          }
        }
      }
      
      remotes.value = Array.from(remoteMap.values())
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 监听 visible 变化，加载设置
watch(() => props.visible, (newVal) => {
  if (newVal) {
    terminalMode.value = props.terminalMode === 'liquid' ? 'liquid' : 'split'
    applyTerminalModeGlobally.value = props.terminalModeApplyGlobally !== false
    loadSettings()
  }
})

// 添加远程仓库
const addRemote = () => {
  remotes.value.push({ name: '', url: '', isNew: true })
  editingIndex.value = remotes.value.length - 1
  editingName.value = ''
  editingUrl.value = ''
}

// 编辑远程仓库
const editRemote = (index) => {
  editingIndex.value = index
  editingName.value = remotes.value[index].name
  editingUrl.value = remotes.value[index].url
}

// 保存远程仓库编辑
const saveRemote = (index) => {
  if (!editingName.value.trim() || !editingUrl.value.trim()) return
  
  remotes.value[index] = {
    name: editingName.value.trim(),
    url: editingUrl.value.trim(),
    originalName: remotes.value[index].originalName || remotes.value[index].name,
    isNew: remotes.value[index].isNew,
    isModified: !remotes.value[index].isNew
  }
  editingIndex.value = -1
  editingName.value = ''
  editingUrl.value = ''
}

// 取消编辑
const cancelEdit = () => {
  // 如果是新增的空项，删除它
  if (remotes.value[editingIndex.value]?.isNew && !remotes.value[editingIndex.value].name) {
    remotes.value.splice(editingIndex.value, 1)
  }
  editingIndex.value = -1
  editingName.value = ''
  editingUrl.value = ''
}

// 删除远程仓库
const deleteRemote = async (index) => {
  const remote = remotes.value[index]
  
  // 如果是新增的空项，直接删除
  if (remote.isNew) {
    remotes.value.splice(index, 1)
    return
  }
  
  // 已存在的远程仓库需要二次确认
  const confirmed = await showConfirm({
    title: '删除远程仓库',
    message: `确定要删除远程仓库 "${remote.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  })
  
  if (confirmed) {
    remote.isDeleted = true
  }
}

// 取消
const cancel = () => {
  emit('update:visible', false)
}

// 确认保存
const confirm = async () => {
  try {
    // 保存提交模板
    if (commitTemplate.value.trim()) {
      if (templateScope.value === 'global') {
        await window.electronAPI?.setConfig('commit-template-global', commitTemplate.value)
      } else {
        const projectKey = `commit-template-${props.projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
        await window.electronAPI?.setConfig(projectKey, commitTemplate.value)
      }
    }

    // 处理远程仓库变更
    for (const remote of remotes.value) {
      if (remote.isDeleted && remote.originalName) {
        // 删除远程仓库
        await window.electronAPI?.executeCommand({
          command: `git remote remove ${remote.originalName}`,
          cwd: props.projectPath
        })
      } else if (remote.isNew && remote.name && remote.url) {
        // 添加新远程仓库
        await window.electronAPI?.executeCommand({
          command: `git remote add ${remote.name} ${remote.url}`,
          cwd: props.projectPath
        })
      } else if (remote.isModified && remote.originalName) {
        // 修改远程仓库
        if (remote.originalName !== remote.name) {
          await window.electronAPI?.executeCommand({
            command: `git remote rename ${remote.originalName} ${remote.name}`,
            cwd: props.projectPath
          })
        }
        await window.electronAPI?.executeCommand({
          command: `git remote set-url ${remote.name} ${remote.url}`,
          cwd: props.projectPath
        })
      }
    }

    emit('confirm', {
      terminalMode: terminalMode.value === 'liquid' ? 'liquid' : 'split',
      terminalModeApplyGlobally: applyTerminalModeGlobally.value !== false
    })
    emit('update:visible', false)
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}
</script>

<style scoped>
.settings-dialog-overlay {
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

.settings-dialog {
  background: #1e1e1e;
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.add-remote-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #0066ff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-remote-btn:hover {
  background: #0055dd;
}

.section-content {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 12px;
}

.template-input {
  width: 100%;
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px;
  color: #fff;
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', monospace;
  resize: vertical;
  min-height: 80px;
}

.template-input:focus {
  outline: none;
  border-color: #0066ff;
}

.template-scope {
  display: flex;
  gap: 16px;
  margin-top: 10px;
}

.scope-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.scope-option input[type="radio"] {
  accent-color: #0066ff;
}

.terminal-mode-global-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
}

.terminal-mode-global-option input[type="checkbox"] {
  accent-color: #0066ff;
}

.empty-remotes {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  text-align: center;
  padding: 16px;
}

.remotes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.remote-item {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 10px 12px;
}

.remote-view {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remote-name {
  font-weight: 500;
  color: #0099ff;
  min-width: 60px;
}

.remote-url {
  flex: 1;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-actions {
  display: flex;
  gap: 4px;
}

.edit-btn, .delete-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s;
}

.edit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #0099ff;
}

.delete-btn:hover {
  background: rgba(255, 100, 100, 0.2);
  color: #ff6b6b;
}

.remote-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.remote-name-input {
  width: 80px;
  padding: 6px 8px;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.remote-url-input {
  flex: 1;
  min-width: 150px;
  padding: 6px 8px;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.remote-name-input:focus,
.remote-url-input:focus {
  outline: none;
  border-color: #0066ff;
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.save-btn, .cancel-edit-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn {
  background: #22c55e;
  color: #fff;
}

.save-btn:hover {
  background: #16a34a;
}

.cancel-edit-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.cancel-edit-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.cancel-btn, .confirm-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn {
  background: #0066ff;
  color: #fff;
}

.confirm-btn:hover {
  background: #0055dd;
}
</style>
