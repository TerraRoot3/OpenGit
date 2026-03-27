<template>
  <div class="backup-manager">
    <!-- 左侧边栏 -->
    <div class="backup-sidebar">
      <div class="sidebar-header">
      <h2>备份管理</h2>
      </div>
      <div class="sidebar-menu">
        <div 
          class="sidebar-item" 
          :class="{ active: activeTab === 'backup' }"
          @click="activeTab = 'backup'"
        >
          <Upload :size="16" />
          <span>创建备份</span>
        </div>
        <div 
          class="sidebar-item" 
          :class="{ active: activeTab === 'restore' }"
          @click="activeTab = 'restore'"
        >
          <Download :size="16" />
          <span>恢复备份</span>
        </div>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div class="backup-content">
      <!-- 创建备份 -->
      <div v-if="activeTab === 'backup'" class="backup-panel">
        <div class="panel-header">
          <h3>创建备份</h3>
        </div>
        <div class="panel-body">
          <p class="panel-desc">选择需要备份的数据项</p>
        <div class="backup-items">
          <!-- Git 一级选项 -->
          <div class="backup-group">
            <div class="backup-item level-1">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  :checked="isGitAllSelected"
                  :indeterminate="isGitIndeterminate"
                  @change="toggleGitAll"
                />
                <GitBranch :size="18" />
                <span>Git</span>
              </label>
            </div>
            <div class="backup-children">
              <div class="backup-item level-2">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="backupOptions.gitConfig"
                  />
                  <Settings :size="16" />
                  <span>远端仓库配置（地址和访问令牌历史）</span>
                </label>
              </div>
              <div class="backup-item level-2">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="backupOptions.gitProjects"
                  />
                  <FolderOpen :size="16" />
                  <span>已保存的项目列表（支持恢复时克隆）</span>
                </label>
              </div>
              <div class="backup-item level-2">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="backupOptions.repoConfigs"
                  />
                  <Folder :size="16" />
                  <span>仓库管理配置（直接恢复目录列表）</span>
                </label>
              </div>
              <div class="backup-item level-2">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="backupOptions.commitTemplates"
                  />
                  <FileCode :size="16" />
                  <span>提交模板</span>
                </label>
              </div>
            </div>
          </div>

          <!-- 密码 一级选项 -->
          <div class="backup-group">
            <div class="backup-item level-1">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="backupOptions.passwords"
                />
                <Key :size="18" />
                <span>密码</span>
              </label>
            </div>
          </div>

          <!-- 收藏 一级选项 -->
          <div class="backup-group">
            <div class="backup-item level-1">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="backupOptions.favorites"
                />
                <Bookmark :size="18" />
                <span>收藏</span>
              </label>
            </div>
          </div>

          <!-- 历史记录 一级选项 -->
          <div class="backup-group">
            <div class="backup-item level-1">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="backupOptions.history"
                />
                <History :size="18" />
                <span>历史记录</span>
              </label>
            </div>
          </div>

          <!-- 首页背景 一级选项 -->
          <div class="backup-group">
            <div class="backup-item level-1">
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  v-model="backupOptions.background"
                />
                <Image :size="18" />
                <span>首页背景</span>
              </label>
            </div>
          </div>
        </div>

        <div class="backup-actions">
          <button 
            class="btn-primary" 
            @click="createBackup"
            :disabled="!hasAnySelected || isBackingUp"
          >
            <Save :size="16" />
            <span>{{ isBackingUp ? '备份中...' : '创建备份' }}</span>
          </button>
          </div>
        </div>
      </div>

      <!-- 恢复备份 -->
      <div v-if="activeTab === 'restore'" class="restore-panel">
        <div class="panel-header">
          <h3>恢复备份</h3>
        </div>
        <div class="panel-body">
          <p class="panel-desc">选择备份文件并恢复数据</p>

        <div v-if="!selectedBackupFile" class="select-file-area">
          <div class="file-drop-zone" @click="selectBackupFile">
            <FolderOpen :size="48" />
            <p>点击选择备份文件</p>
            <span class="file-hint">支持 .json 格式的备份文件</span>
          </div>
        </div>

        <div v-else class="restore-content">
          <div class="selected-file-info">
            <FileText :size="20" />
            <div class="file-details">
              <span class="file-name">{{ selectedBackupFile.name }}</span>
              <span class="file-meta">
                备份时间: {{ formatBackupTime(backupData?.backupTime) }}
              </span>
            </div>
            <button class="btn-text" @click="clearSelectedFile">
              <X :size="16" />
            </button>
          </div>

          <div v-if="backupData" class="restore-items">
            <h4>选择要恢复的数据</h4>
            
            <!-- Git 恢复选项 -->
            <div v-if="backupData.gitConfig || backupData.gitProjects || backupData.repoConfigs" class="backup-group">
              <div class="backup-item level-1">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    :checked="isRestoreGitAllSelected"
                    :indeterminate="isRestoreGitIndeterminate"
                    @change="toggleRestoreGitAll"
                  />
                  <GitBranch :size="18" />
                  <span>Git</span>
                </label>
              </div>
              <div class="backup-children">
                <div v-if="backupData.gitConfig" class="backup-item level-2">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      v-model="restoreOptions.gitConfig"
                    />
                    <Settings :size="16" />
                    <span>远端仓库配置 ({{ backupData.gitConfig.length || 0 }} 条)</span>
                  </label>
                </div>
                <div v-if="backupData.gitProjects" class="backup-item level-2">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      v-model="restoreOptions.gitProjects"
                    />
                    <FolderOpen :size="16" />
                    <span>项目列表 ({{ backupData.gitProjects.length }} 个项目，可选择克隆)</span>
                  </label>
                </div>
                <div v-if="backupData.repoConfigs" class="backup-item level-2">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      v-model="restoreOptions.repoConfigs"
                    />
                    <Folder :size="16" />
                    <span>仓库管理配置 ({{ backupData.repoConfigs.length }} 个目录)</span>
                  </label>
                </div>
                <div v-if="backupData.commitTemplates" class="backup-item level-2">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      v-model="restoreOptions.commitTemplates"
                    />
                    <FileCode :size="16" />
                    <span>提交模板 ({{ backupData.commitTemplates.length }} 个)</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 密码恢复选项 -->
            <div v-if="backupData.passwords" class="backup-group">
              <div class="backup-item level-1">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="restoreOptions.passwords"
                  />
                  <Key :size="18" />
                  <span>密码 ({{ backupData.passwords.length || 0 }} 条)</span>
                </label>
              </div>
            </div>

            <!-- 收藏恢复选项 -->
            <div v-if="backupData.favorites" class="backup-group">
              <div class="backup-item level-1">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="restoreOptions.favorites"
                  />
                  <Bookmark :size="18" />
                  <span>收藏 ({{ backupData.favorites.length || 0 }} 条)</span>
                </label>
              </div>
            </div>

            <!-- 历史记录恢复选项 -->
            <div v-if="backupData.history" class="backup-group">
              <div class="backup-item level-1">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    v-model="restoreOptions.history"
                  />
                  <History :size="18" />
                  <span>历史记录 ({{ backupData.history.length || 0 }} 条)</span>
                </label>
              </div>
            </div>

            <div v-if="backupData.background" class="backup-group">
              <div class="backup-item level-1">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    v-model="restoreOptions.background"
                  />
                  <Image :size="18" />
                  <span>首页背景</span>
                </label>
              </div>
            </div>
          </div>

          <div class="restore-actions">
            <button 
              class="btn-primary" 
              @click="restoreBackup"
              :disabled="!hasAnyRestoreSelected || isRestoring"
            >
              <Download :size="16" />
              <span>{{ isRestoring ? '恢复中...' : '恢复数据' }}</span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 结果提示 -->
    <div v-if="resultMessage" class="result-toast" :class="resultType">
      <CheckCircle v-if="resultType === 'success'" :size="20" />
      <AlertCircle v-else :size="20" />
      <span>{{ resultMessage }}</span>
    </div>

    <!-- 克隆项目对话框 -->
    <div v-if="showCloneDialog" class="clone-dialog-overlay">
      <div class="clone-dialog">
        <div class="clone-dialog-header">
          <h3>发现缺失的项目</h3>
          <button class="close-btn" @click="closeCloneDialog">
            <X :size="20" />
          </button>
        </div>
        
        <div class="clone-dialog-body">
          <p class="clone-desc">以下项目在本地不存在，请选择需要克隆的项目：</p>
          
          <!-- 克隆目标路径 -->
          <div class="clone-path-section">
            <label>克隆到目录：</label>
            <div class="path-input-wrapper">
              <input 
                type="text" 
                v-model="cloneTargetPath" 
                placeholder="选择克隆目标目录..."
                readonly
              />
              <button class="browse-btn" @click="selectClonePath">
                <FolderOpen :size="16" />
                <span>浏览</span>
              </button>
            </div>
          </div>
          
          <!-- 项目列表 -->
          <div class="clone-projects-header">
            <label class="checkbox-label" @click="toggleAllCloneProjects">
              <input 
                type="checkbox" 
                :checked="selectedCloneProjects.length === missingProjects.length"
                :indeterminate="selectedCloneProjects.length > 0 && selectedCloneProjects.length < missingProjects.length"
              />
              <span>全选 ({{ selectedCloneProjects.length }}/{{ missingProjects.length }})</span>
            </label>
          </div>
          
          <div class="clone-projects-list">
            <div 
              v-for="project in missingProjects" 
              :key="getProjectId(project)"
              class="clone-project-item"
              :class="{ 
                selected: selectedCloneProjects.includes(getProjectId(project)),
                success: cloneProgress[getProjectId(project)]?.status === 'success',
                error: cloneProgress[getProjectId(project)]?.status === 'error',
                cloning: cloneProgress[getProjectId(project)]?.status === 'cloning'
              }"
            >
              <label class="checkbox-label">
                <input 
                  type="checkbox" 
                  :checked="selectedCloneProjects.includes(getProjectId(project))"
                  @change="toggleCloneProject(getProjectId(project))"
                  :disabled="isCloning"
                />
                <div class="project-info">
                  <span class="project-name">{{ project.name }}</span>
                  <span class="project-path" v-if="project.relativePath">📁 {{ project.basePath ? project.basePath + '/' : '' }}{{ project.relativePath }}</span>
                  <span class="project-url">{{ project.remoteUrl }}</span>
                </div>
              </label>
              <div v-if="cloneProgress[getProjectId(project)]" class="clone-status">
                <span v-if="cloneProgress[getProjectId(project)].status === 'cloning'" class="status-cloning">
                  ⏳ {{ cloneProgress[getProjectId(project)].message }}
                </span>
                <span v-else-if="cloneProgress[getProjectId(project)].status === 'success'" class="status-success">
                  ✅ {{ cloneProgress[getProjectId(project)].message }}
                </span>
                <span v-else-if="cloneProgress[getProjectId(project)].status === 'error'" class="status-error">
                  ❌ {{ cloneProgress[getProjectId(project)].message }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="clone-dialog-footer">
          <button class="btn-secondary" @click="closeCloneDialog" :disabled="isCloning">
            {{ isCloning ? '克隆中...' : '跳过' }}
          </button>
          <button 
            class="btn-primary" 
            @click="startCloning"
            :disabled="selectedCloneProjects.length === 0 || !cloneTargetPath || isCloning"
          >
            <Download :size="16" />
            <span>{{ isCloning ? '克隆中...' : `克隆 ${selectedCloneProjects.length} 个项目` }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  Upload, Download, GitBranch, Settings, Key, Bookmark, History,
  Save, FolderOpen, FileText, X, CheckCircle, AlertCircle, Image, Folder, FileCode
} from 'lucide-vue-next'

const emit = defineEmits(['navigate'])

// 找出多个路径的公共基础路径
const findCommonBasePath = (paths) => {
  if (!paths || paths.length === 0) return ''
  if (paths.length === 1) {
    // 单个路径，返回其父目录
    const parts = paths[0].split('/')
    parts.pop()
    return parts.join('/')
  }
  
  // 分割所有路径
  const splitPaths = paths.map(p => p.split('/'))
  const minLength = Math.min(...splitPaths.map(p => p.length))
  
  // 找出公共前缀
  let commonParts = []
  for (let i = 0; i < minLength; i++) {
    const part = splitPaths[0][i]
    if (splitPaths.every(p => p[i] === part)) {
      commonParts.push(part)
    } else {
      break
    }
  }
  
  return commonParts.join('/')
}

// 标准化 git URL（与 ProjectBuildConfig.vue 保持一致）
const normalizeGitUrl = (url) => {
  if (!url) return null
  // 去掉 .git 后缀
  let normalized = url.replace(/\.git$/, '')
  // 将 git@host:path 转换为 host/path 格式
  if (normalized.startsWith('git@')) {
    const match = normalized.match(/git@(.+?):(.+)$/)
    if (match) {
      normalized = `${match[1]}/${match[2]}`
    }
  }
  // 去掉协议前缀
  normalized = normalized.replace(/^https?:\/\//, '')
  return normalized.toLowerCase()
}

// 当前标签页
const activeTab = ref('backup')

// 备份选项
const backupOptions = ref({
  gitConfig: true,
  gitProjects: true,  // 已克隆的项目列表（支持克隆）
  repoConfigs: true,  // 仓库管理配置（直接恢复）
  commitTemplates: true, // 提交模板
  passwords: true,
  favorites: true,
  history: true,
  background: true,
})

// 恢复选项
const restoreOptions = ref({
  gitConfig: false,
  gitProjects: false,  // 已克隆的项目列表
  repoConfigs: false,  // 仓库管理配置
  commitTemplates: false, // 提交模板
  passwords: false,
  favorites: false,
  history: false,
  background: false,
})

// 克隆对话框状态
const showCloneDialog = ref(false)
const missingProjects = ref([])  // 本地不存在的项目列表
const selectedCloneProjects = ref([])  // 用户选择要克隆的项目
const cloneProgress = ref({})  // 克隆进度
const isCloning = ref(false)
const cloneTargetPath = ref('')  // 克隆目标路径

// 状态
const isBackingUp = ref(false)
const isRestoring = ref(false)
const selectedBackupFile = ref(null)
const backupData = ref(null)
const resultMessage = ref('')
const resultType = ref('success')

// Git 全选状态
const isGitAllSelected = computed(() => {
  return backupOptions.value.gitConfig && backupOptions.value.gitProjects && backupOptions.value.repoConfigs && backupOptions.value.commitTemplates
})

const isGitIndeterminate = computed(() => {
  const selected = [backupOptions.value.gitConfig, backupOptions.value.gitProjects, backupOptions.value.repoConfigs, backupOptions.value.commitTemplates]
  const someSelected = selected.some(v => v)
  const allSelected = selected.every(v => v)
  return someSelected && !allSelected
})

const toggleGitAll = () => {
  const newValue = !isGitAllSelected.value
  backupOptions.value.gitConfig = newValue
  backupOptions.value.gitProjects = newValue
  backupOptions.value.repoConfigs = newValue
  backupOptions.value.commitTemplates = newValue
}

// 恢复 Git 全选状态
const isRestoreGitAllSelected = computed(() => {
  return restoreOptions.value.gitConfig && restoreOptions.value.gitProjects && restoreOptions.value.repoConfigs && restoreOptions.value.commitTemplates
})

const isRestoreGitIndeterminate = computed(() => {
  const selected = [restoreOptions.value.gitConfig, restoreOptions.value.gitProjects, restoreOptions.value.repoConfigs, restoreOptions.value.commitTemplates]
  const someSelected = selected.some(v => v)
  const allSelected = selected.every(v => v)
  return someSelected && !allSelected
})

const toggleRestoreGitAll = () => {
  const newValue = !isRestoreGitAllSelected.value
  restoreOptions.value.gitConfig = newValue
  restoreOptions.value.gitProjects = newValue
  restoreOptions.value.repoConfigs = newValue
  restoreOptions.value.commitTemplates = newValue
}

// 是否有选中项
const hasAnySelected = computed(() => {
  return Object.values(backupOptions.value).some(v => v)
})

const hasAnyRestoreSelected = computed(() => {
  return Object.values(restoreOptions.value).some(v => v)
})

// 显示结果消息
const showResult = (message, type = 'success') => {
  resultMessage.value = message
  resultType.value = type
  setTimeout(() => {
    resultMessage.value = ''
  }, 3000)
}

// 格式化备份时间
const formatBackupTime = (timestamp) => {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 生成项目唯一ID（使用 remoteUrl + relativePath 组合）
const getProjectId = (project) => {
  // 使用 remoteUrl 和 relativePath（或 path）组合作为唯一标识
  const url = project.remoteUrl || ''
  const path = project.relativePath || project.path || ''
  return `${url}::${path}`
}

// 创建备份
const createBackup = async () => {
  if (!hasAnySelected.value) return

  isBackingUp.value = true
  try {
    const backup = {
      version: '1.0',
      backupTime: new Date().toISOString(),
      appName: 'OpenGit'
    }

    // 收集备份数据
    if (backupOptions.value.gitConfig) {
      const gitHistory = await window.electronAPI.getConfig('gitlabHistory')
      backup.gitConfig = gitHistory || []
    }

    if (backupOptions.value.gitProjects) {
      const projects = []
      
      // 直接从 savedConfigs 获取所有扫描路径配置
      // savedConfigs 保存的就是仓库管理中的所有配置
      const savedConfigs = await window.electronAPI.getConfig('savedConfigs') || []
      
      // 构建扫描路径信息
      const scanPathsInfo = savedConfigs.map(config => ({
        basePath: config.path,
        platform: config.isLocal ? 'local' : 'remote',
        url: config.gitlabUrl || '',
        isSingleRepo: config.isSingleRepo || false
      }))
      
      const processedProjects = new Set()  // 避免重复
      
      // 扫描每个路径获取项目列表
      for (const scanInfo of scanPathsInfo) {
        try {
          // 如果是单个仓库，直接处理
          if (scanInfo.isSingleRepo) {
            let remoteUrl = ''
            try {
              const urlResult = await window.electronAPI.executeCommand({
                command: `cd "${scanInfo.basePath}" && git remote get-url origin 2>/dev/null`
              })
              if (urlResult?.success && urlResult.output?.trim()) {
                remoteUrl = urlResult.output.trim()
              }
            } catch (e) {}
            
            if (remoteUrl && !processedProjects.has(scanInfo.basePath)) {
              processedProjects.add(scanInfo.basePath)
              const projectName = scanInfo.basePath.split('/').pop()
              projects.push({
                name: projectName,
                path: scanInfo.basePath,
                relativePath: projectName,
                basePath: scanInfo.basePath.substring(0, scanInfo.basePath.lastIndexOf('/')),
                remoteUrl,
                platform: scanInfo.platform
              })
            }
          } else {
            // 扫描目录获取项目列表
            const result = await window.electronAPI.getProjects({ path: scanInfo.basePath })
            if (result?.success && result.projects) {
              for (const project of result.projects) {
                if (processedProjects.has(project.path)) continue
                processedProjects.add(project.path)
                
                let remoteUrl = ''
                try {
                  const urlResult = await window.electronAPI.executeCommand({
                    command: `cd "${project.path}" && git remote get-url origin 2>/dev/null`
                  })
                  if (urlResult?.success && urlResult.output?.trim()) {
                    remoteUrl = urlResult.output.trim()
                  }
                } catch (e) {}
                
                if (remoteUrl) {
                  const relativePath = project.path.replace(scanInfo.basePath, '').replace(/^\//, '')
                  const projectName = project.path.split('/').pop()
                  
                  projects.push({
                    name: projectName,
                    path: project.path,
                    relativePath,
                    basePath: scanInfo.basePath,
                    remoteUrl,
                    platform: scanInfo.platform
                  })
                }
              }
            }
          }
        } catch (e) {
          console.log(`⚠️ [Backup] 扫描路径失败: ${scanInfo.basePath}`, e)
        }
      }
      
      backup.gitProjects = projects
      backup.gitProjectsScanPaths = scanPathsInfo
    }

    // 备份仓库管理配置（直接备份 savedConfigs）
    if (backupOptions.value.repoConfigs) {
      const savedConfigs = await window.electronAPI.getConfig('savedConfigs') || []
      backup.repoConfigs = savedConfigs
      console.log(`📁 [Backup] 仓库管理配置: ${savedConfigs.length} 个`)
    }

    // 备份提交模板
    if (backupOptions.value.commitTemplates) {
      const templates = []
      // 获取所有配置，筛选 commit-template- 开头的
      const allConfigs = await window.electronAPI.getAllConfigs() || {}
      for (const [key, value] of Object.entries(allConfigs)) {
        if (key.startsWith('commit-template-') && value) {
          templates.push({ key, value })
        }
      }
      backup.commitTemplates = templates
      console.log(`📝 [Backup] 提交模板: ${templates.length} 个`)
    }

    if (backupOptions.value.passwords) {
      const passwords = await window.electronAPI.getConfig('browserPasswords')
      backup.passwords = passwords || []
    }

    if (backupOptions.value.favorites) {
      const favorites = await window.electronAPI.getConfig('browserFavorites')
      backup.favorites = favorites || []
    }

    if (backupOptions.value.history) {
      const history = await window.electronAPI.getConfig('browsingHistory')
      backup.history = history || []
    }

    if (backupOptions.value.background) {
      const background = await window.electronAPI.getConfig('homePageBackground')
      backup.background = background || null
    }

    // 保存备份文件
    const fileName = `gitmanager-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
    const result = await window.electronAPI.showSaveDialog({
      title: '保存备份文件',
      defaultPath: fileName,
      filters: [{ name: 'JSON文件', extensions: ['json'] }]
    })

    if (!result.canceled && result.filePath) {
      const fs = window.require ? window.require('fs') : null
      if (fs) {
        fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf-8')
        showResult('备份创建成功！')
      } else {
        // 使用 IPC 保存文件
        await window.electronAPI.saveFile({
          filePath: result.filePath,
          content: JSON.stringify(backup, null, 2)
        })
        showResult('备份创建成功！')
      }
    }
  } catch (error) {
    console.error('创建备份失败:', error)
    showResult('创建备份失败: ' + error.message, 'error')
  } finally {
    isBackingUp.value = false
  }
}

// 选择备份文件
const selectBackupFile = async () => {
  try {
    const result = await window.electronAPI.showOpenDialog({
      title: '选择备份文件',
      filters: [{ name: 'JSON文件', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      const fileName = filePath.split('/').pop()
      
      // 读取文件内容
      const content = await window.electronAPI.readFile(filePath)
      const data = JSON.parse(content)
      
      // 验证备份文件格式
      if (!data.version || !data.backupTime) {
        showResult('无效的备份文件格式', 'error')
        return
      }

      selectedBackupFile.value = { name: fileName, path: filePath }
      backupData.value = data

      // 根据备份内容设置默认恢复选项
      restoreOptions.value = {
        gitConfig: !!data.gitConfig,
        gitProjects: !!data.gitProjects,
        repoConfigs: !!data.repoConfigs,
        commitTemplates: !!data.commitTemplates,
        passwords: !!data.passwords,
        favorites: !!data.favorites,
        history: !!data.history,
        background: !!data.background,
      }
    }
  } catch (error) {
    console.error('读取备份文件失败:', error)
    showResult('读取备份文件失败: ' + error.message, 'error')
  }
}

// 清除选中的文件
const clearSelectedFile = () => {
  selectedBackupFile.value = null
  backupData.value = null
  restoreOptions.value = {
    gitConfig: false,
    gitProjects: false,
    repoConfigs: false,
    commitTemplates: false,
    passwords: false,
    favorites: false,
    history: false,
    background: false,
  }
}

// 恢复备份
const restoreBackup = async () => {
  if (!hasAnyRestoreSelected.value || !backupData.value) return

  isRestoring.value = true
  try {
    let restoredCount = 0
    
    // 序列化数据，避免 Vue Proxy 对象无法被 IPC 克隆
    const data = JSON.parse(JSON.stringify(backupData.value))

    if (restoreOptions.value.gitConfig && data.gitConfig) {
      await window.electronAPI.setConfig('gitlabHistory', data.gitConfig)
      restoredCount++
    }

    if (restoreOptions.value.passwords && data.passwords) {
      await window.electronAPI.setConfig('browserPasswords', data.passwords)
      restoredCount++
    }

    if (restoreOptions.value.favorites && data.favorites) {
      await window.electronAPI.setConfig('browserFavorites', data.favorites)
      restoredCount++
    }

    if (restoreOptions.value.history && data.history) {
      await window.electronAPI.setConfig('browsingHistory', data.history)
      restoredCount++
    }

    if (restoreOptions.value.background && data.background) {
      await window.electronAPI.setConfig('homePageBackground', data.background)
      // 同时更新 localStorage 缓存，确保首页立即生效
      try {
        localStorage.setItem('homePageBackgroundCache', JSON.stringify(data.background))
      } catch (e) {}
      restoredCount++
    }

    // 恢复仓库管理配置（直接覆盖 savedConfigs）
    if (restoreOptions.value.repoConfigs && data.repoConfigs) {
      await window.electronAPI.setConfig('savedConfigs', data.repoConfigs)
      console.log(`📁 [Restore] 仓库管理配置已恢复: ${data.repoConfigs.length} 个`)
      restoredCount++
    }

    // 恢复提交模板
    if (restoreOptions.value.commitTemplates && data.commitTemplates) {
      for (const template of data.commitTemplates) {
        await window.electronAPI.setConfig(template.key, template.value)
      }
      console.log(`📝 [Restore] 提交模板已恢复: ${data.commitTemplates.length} 个`)
      restoredCount++
    }

    // 恢复项目列表，检查哪些项目需要克隆
    if (restoreOptions.value.gitProjects && data.gitProjects) {
      const missing = []
      const existing = []
      
      // 检查每个项目是否存在
      for (const project of data.gitProjects) {
        if (!project.remoteUrl) continue  // 没有 remote URL 的跳过
        
        let found = false
        
        // 检查备份中的项目路径是否存在且是同一个仓库
        // 不再扫描其他目录，因为同一个 remoteUrl 可能存在于不同目录
        if (project.path) {
          try {
            const result = await window.electronAPI.executeCommand({
              command: `cd "${project.path}" && git remote get-url origin 2>/dev/null`
            })
            if (result?.success && result.output?.trim()) {
              const localUrl = normalizeGitUrl(result.output.trim())
              const backupUrl = normalizeGitUrl(project.remoteUrl)
              if (localUrl === backupUrl) {
                found = true
                existing.push({ ...project, localPath: project.path })
              }
            }
          } catch (e) {
            // 路径不存在或不是 git 仓库
          }
        }
        
        if (!found) {
          missing.push(project)
        }
      }
      
      // 如果有缺失的项目，显示克隆对话框
      if (missing.length > 0) {
        missingProjects.value = missing
        selectedCloneProjects.value = missing.map(p => getProjectId(p))  // 默认全选
        showCloneDialog.value = true
        // 暂时不增加 restoredCount，等克隆完成后再处理
      } else {
        restoredCount++
      }
    }

    showResult(`成功恢复 ${restoredCount} 项数据！`)
    clearSelectedFile()
  } catch (error) {
    console.error('恢复备份失败:', error)
    showResult('恢复备份失败: ' + error.message, 'error')
  } finally {
    isRestoring.value = false
  }
}

// 切换克隆项目选择
const toggleCloneProject = (projectId) => {
  const index = selectedCloneProjects.value.indexOf(projectId)
  if (index > -1) {
    selectedCloneProjects.value.splice(index, 1)
  } else {
    selectedCloneProjects.value.push(projectId)
  }
}

// 全选/取消全选克隆项目
const toggleAllCloneProjects = () => {
  if (selectedCloneProjects.value.length === missingProjects.value.length) {
    selectedCloneProjects.value = []
  } else {
    selectedCloneProjects.value = missingProjects.value.map(p => getProjectId(p))
  }
}

// 选择克隆目标路径
const selectClonePath = async () => {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择克隆目标目录'
  })
  if (!result.canceled && result.filePaths?.[0]) {
    cloneTargetPath.value = result.filePaths[0]
  }
}

// 开始克隆选中的项目
const startCloning = async () => {
  if (selectedCloneProjects.value.length === 0) {
    showResult('请选择要克隆的项目', 'error')
    return
  }
  
  if (!cloneTargetPath.value) {
    showResult('请选择克隆目标目录', 'error')
    return
  }
  
  isCloning.value = true
  cloneProgress.value = {}
  
  const projectsToClone = missingProjects.value.filter(p => 
    selectedCloneProjects.value.includes(getProjectId(p))
  )
  
  let successCount = 0
  let failCount = 0
  
  for (const project of projectsToClone) {
    const projectName = project.name || project.remoteUrl.split('/').pop().replace('.git', '')
    // 使用 basePath 的最后一级目录 + relativePath 保持完整目录结构
    // 例如: basePath=/Users/xxx/workspace/jianpian, relativePath=mobile/projects/app
    // 克隆到: cloneTargetPath/jianpian/mobile/projects/app
    let relativePath = projectName
    if (project.basePath && project.relativePath) {
      const baseDir = project.basePath.split('/').filter(Boolean).pop() // 获取 basePath 最后一级目录名
      relativePath = `${baseDir}/${project.relativePath}`
    } else if (project.relativePath) {
      relativePath = project.relativePath
    }
    const targetPath = `${cloneTargetPath.value}/${relativePath}`
    
    // 确保父目录存在
    const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'))
    
    const projectId = getProjectId(project)
    cloneProgress.value[projectId] = { status: 'cloning', message: '准备克隆...' }
    
    try {
      // 先创建父目录
      await window.electronAPI.executeCommand({
        command: `mkdir -p "${parentDir}"`
      })
      
      // 设置实时输出监听器来更新进度
      const currentProjectId = projectId
      const outputHandler = (event, data) => {
        // 如果该项目已经完成（成功或失败），不再更新进度
        const currentStatus = cloneProgress.value[currentProjectId]?.status
        if (currentStatus === 'success' || currentStatus === 'error') {
          return
        }
        
        if (data?.data) {
          // 解析 git clone 进度输出
          const output = data.data
          // 匹配类似 "Receiving objects:  23% (100/435)" 或 "Cloning into..." 的输出
          const progressMatch = output.match(/(\d+)%/)
          const receivingMatch = output.match(/Receiving objects:\s*(\d+)%/)
          const resolvingMatch = output.match(/Resolving deltas:\s*(\d+)%/)
          const countingMatch = output.match(/Counting objects/)
          const compressingMatch = output.match(/Compressing objects:\s*(\d+)%/)
          
          let message = '正在克隆...'
          if (receivingMatch) {
            message = `接收对象: ${receivingMatch[1]}%`
          } else if (resolvingMatch) {
            message = `解析增量: ${resolvingMatch[1]}%`
          } else if (compressingMatch) {
            message = `压缩对象: ${compressingMatch[1]}%`
          } else if (countingMatch) {
            message = '统计对象中...'
          } else if (progressMatch) {
            message = `克隆中: ${progressMatch[1]}%`
          }
          
          cloneProgress.value[currentProjectId] = { status: 'cloning', message }
        }
      }
      
      // 添加监听器
      window.electronAPI.onRealtimeCommandOutput(outputHandler)
      
      let result
      try {
        // 使用 --progress 参数确保输出进度信息
        result = await window.electronAPI.executeCommandRealtime({
          command: `git clone --progress "${project.remoteUrl}" "${targetPath}"`,
          timeout: 300000  // 5分钟超时
        })
      } finally {
        // 确保监听器总是被移除
        window.electronAPI.removeRealtimeCommandOutputListener(outputHandler)
      }
      
      if (result?.success) {
        cloneProgress.value[projectId] = { status: 'success', message: '克隆成功' }
        successCount++
        // 不再单独添加每个项目到 savedConfigs，稍后统一添加扫描路径
      } else {
        cloneProgress.value[projectId] = { 
          status: 'error', 
          message: result?.error || '克隆失败' 
        }
        failCount++
      }
    } catch (error) {
      cloneProgress.value[projectId] = { 
        status: 'error', 
        message: error.message || '克隆失败' 
      }
      failCount++
    }
  }
  
  isCloning.value = false
  
  // 克隆完成后，恢复扫描路径配置（而不是单个项目）
  if (successCount > 0 && backupData.value?.gitProjectsScanPaths) {
    const savedConfigs = await window.electronAPI.getConfig('savedConfigs') || []
    const addedPaths = new Set()  // 避免重复添加
    
    for (const scanPath of backupData.value.gitProjectsScanPaths) {
      if (scanPath.isSingleRepo) {
        // 单个仓库：直接使用项目名作为路径
        // scanPath.basePath 是项目的完整路径
        const projectName = scanPath.basePath.split('/').filter(Boolean).pop()
        const newPath = `${cloneTargetPath.value}/${projectName}`
        
        // 检查该项目是否成功克隆
        const wasCloned = projectsToClone.some(p => {
          // 对于单个仓库，项目名应该匹配
          return p.name === projectName && 
                 cloneProgress.value[getProjectId(p)]?.status === 'success'
        })
        
        if (wasCloned && !addedPaths.has(newPath)) {
          addedPaths.add(newPath)
          
          if (!savedConfigs.find(c => c.path === newPath)) {
            savedConfigs.push({
              name: projectName,
              path: newPath,
              gitlabUrl: scanPath.url || '',
              isLocal: scanPath.platform === 'local',
              isSingleRepo: true  // 标记为单个仓库
            })
          }
        }
      } else {
        // 多项目目录：使用 basePath 的最后一级目录名
        // 例如: cloneTargetPath=/Users/newuser/workspace, basePath=/Users/olduser/workspace/jianpian
        // 新路径: /Users/newuser/workspace/jianpian
        const baseDir = scanPath.basePath.split('/').filter(Boolean).pop()
        const newPath = `${cloneTargetPath.value}/${baseDir}`
        
        // 检查该路径下是否有成功克隆的项目
        const hasClonedProjects = projectsToClone.some(p => {
          const projectBaseDir = p.basePath?.split('/').filter(Boolean).pop()
          return projectBaseDir === baseDir && 
                 cloneProgress.value[getProjectId(p)]?.status === 'success'
        })
        
        if (hasClonedProjects && !addedPaths.has(newPath)) {
          addedPaths.add(newPath)
          
          if (!savedConfigs.find(c => c.path === newPath)) {
            savedConfigs.push({
              name: baseDir,
              path: newPath,
              gitlabUrl: scanPath.url || '',
              isLocal: scanPath.platform === 'local',
              isSingleRepo: false
            })
          }
        }
      }
    }
    
    await window.electronAPI.setConfig('savedConfigs', savedConfigs)
  }
  
  if (successCount > 0) {
    showResult(`成功克隆 ${successCount} 个项目${failCount > 0 ? `，${failCount} 个失败` : ''}`)
  } else if (failCount > 0) {
    showResult(`克隆失败 ${failCount} 个项目`, 'error')
  }
}

// 关闭克隆对话框
const closeCloneDialog = () => {
  showCloneDialog.value = false
  missingProjects.value = []
  selectedCloneProjects.value = []
  cloneProgress.value = {}
  cloneTargetPath.value = ''
}
</script>

<style scoped>
.backup-manager {
  display: flex;
  height: 100%;
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.9);
  position: relative;
}

/* 左侧边栏 */
.backup-sidebar {
  width: 220px;
  min-width: 220px;
  background: #252526;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.sidebar-header h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}

.sidebar-menu {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.2s;
  font-size: 14px;
}

.sidebar-item svg {
  flex-shrink: 0;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sidebar-item.active {
  background: #667eea;
  color: #fff;
}

/* 右侧内容区 */
.backup-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
  flex-shrink: 0;
}

.panel-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}

.panel-desc {
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 16px 0;
  font-size: 14px;
}

.panel-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.backup-panel,
.restore-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 备份项目 */
.backup-items, .restore-items {
  margin-bottom: 24px;
}

.restore-items h4 {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 16px 0;
}

.backup-group {
  margin-bottom: 8px;
}

.backup-item {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  transition: background 0.2s;
}

.backup-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.backup-item.level-1 {
  background: rgba(255, 255, 255, 0.05);
}

.backup-item.level-2 {
  background: rgba(255, 255, 255, 0.03);
  margin-left: 24px;
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #667eea;
  cursor: pointer;
}

.backup-children {
  margin-top: 4px;
}

/* 按钮 */
.backup-actions, .restore-actions {
  margin-top: 24px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #5568d3;
}

.btn-primary:disabled {
  background: rgba(102, 126, 234, 0.4);
  cursor: not-allowed;
}

.btn-text {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-text:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
}

/* 文件选择区域 */
.select-file-area {
  margin-bottom: 24px;
}

.file-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.5);
}

.file-drop-zone:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
  color: rgba(255, 255, 255, 0.7);
}

.file-drop-zone p {
  margin: 16px 0 8px 0;
  font-size: 16px;
}

.file-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

/* 已选文件信息 */
.selected-file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 24px;
}

.file-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-name {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.file-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* 结果提示 */
.result-toast {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  animation: slideUp 0.3s ease;
}

.result-toast.success {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.result-toast.error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 克隆对话框样式 */
.clone-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.clone-dialog {
  background: #2d2d2d;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.clone-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.clone-dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.clone-dialog-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.clone-desc {
  margin: 0 0 16px 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

.clone-path-section {
  margin-bottom: 20px;
}

.clone-path-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.path-input-wrapper {
  display: flex;
  gap: 10px;
}

.path-input-wrapper input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.browse-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(102, 126, 234, 0.2);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 6px;
  color: #667eea;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.browse-btn:hover {
  background: rgba(102, 126, 234, 0.3);
}

.clone-projects-header {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 10px;
}

.clone-projects-list {
  max-height: 300px;
  overflow-y: auto;
}

.clone-project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  transition: all 0.2s;
}

.clone-project-item.selected {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.3);
}

.clone-project-item.success {
  background: rgba(52, 211, 153, 0.1);
  border-color: rgba(52, 211, 153, 0.3);
}

.clone-project-item.error {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

.clone-project-item.cloning {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}

.clone-project-item .checkbox-label {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.project-path {
  font-size: 12px;
  color: #667eea;
  font-family: monospace;
}

.project-url {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  word-break: break-all;
}

.clone-status {
  font-size: 12px;
  white-space: nowrap;
  margin-left: 10px;
}

.status-cloning {
  color: #fbbf24;
}

.status-success {
  color: #34d399;
}

.status-error {
  color: #ef4444;
}

.clone-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
