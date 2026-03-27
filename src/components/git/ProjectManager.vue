<template>
  <div class="repo-manager-page">
    <!-- 左侧分类面板 -->
    <div class="category-panel">
      <div class="category-header">
        <h3>仓库管理</h3>
      </div>
      <div class="category-list">
        <div 
          class="category-item"
          :class="{ active: currentCategory === 'all' }"
          @click="currentCategory = 'all'"
        >
          <span class="category-icon">📁</span>
          <span class="category-name">全部</span>
          <span class="category-count">{{ savedConfigs.length }}</span>
        </div>
        <div 
          class="category-item"
          :class="{ active: currentCategory === 'local' }"
          @click="currentCategory = 'local'"
        >
          <span class="category-icon">💻</span>
          <span class="category-name">本地仓库</span>
          <span class="category-count">{{ localRepos.length }}</span>
        </div>
        <div 
          class="category-item"
          :class="{ active: currentCategory === 'remote' }"
          @click="currentCategory = 'remote'"
        >
          <span class="category-icon">🌐</span>
          <span class="category-name">远程仓库</span>
          <span class="category-count">{{ remoteRepos.length }}</span>
        </div>
      </div>
    </div>
    
    <!-- 右侧仓库列表 -->
    <div class="repo-list-panel">
      <div class="repo-header">
        <h2>{{ categoryTitle }}</h2>
        <button 
          class="add-local-btn"
          @click="addLocalRepository"
          title="添加本地 Git 仓库"
        >
添加本地仓库
        </button>
      </div>
      
      <div class="repo-list" v-if="filteredConfigs.length > 0">
        <div 
          v-for="config in filteredConfigs" 
          :key="config.path"
          class="repo-item"
          :class="{ 'path-missing': pathExistsMap[config.path] === false }"
        >
          <div class="repo-icon">
            <span v-if="pathExistsMap[config.path] === false">⚠️</span>
            <span v-else-if="config.isLocal || config.gitlabUrl === '本地仓库'">💻</span>
            <span v-else>🌐</span>
          </div>
          <div class="repo-info" @click="openSavedConfig(config)">
            <div class="repo-name">
              {{ getFolderName(config.path) }}
              <span v-if="pathExistsMap[config.path] === false" class="missing-badge">目录不存在</span>
            </div>
            <div class="repo-path" :title="config.path">{{ config.path }}</div>
            <div class="repo-meta">
              <span class="repo-type">{{ config.isLocal || config.gitlabUrl === '本地仓库' ? '本地仓库' : config.gitlabUrl }}</span>
              <span class="repo-time">{{ formatTime(config.lastUsed) }}</span>
            </div>
          </div>
          <div class="repo-actions">
            <button 
              @click.stop="deleteConfig(config)"
              class="delete-btn"
              title="删除此配置"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
      
      <div class="empty-state" v-else>
        <div class="empty-icon">📂</div>
        <div class="empty-text">{{ emptyText }}</div>
        <div class="empty-hint">点击"添加本地仓库"按钮添加 Git 仓库</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useConfirm } from '../../composables/useConfirm.js'

const { confirm } = useConfirm()
const savedConfigs = ref([])
const currentCategory = ref('all')
const pathExistsMap = ref({})  // 存储每个路径是否存在的状态

// 计算属性 - 本地仓库
const localRepos = computed(() => {
  return savedConfigs.value.filter(config => 
    config.isLocal || config.gitlabUrl === '本地仓库'
  )
})

// 计算属性 - 远程仓库
const remoteRepos = computed(() => {
  return savedConfigs.value.filter(config => 
    !config.isLocal && config.gitlabUrl !== '本地仓库'
  )
})

// 计算属性 - 根据分类过滤
const filteredConfigs = computed(() => {
  switch (currentCategory.value) {
    case 'local':
      return localRepos.value
    case 'remote':
      return remoteRepos.value
    default:
      return savedConfigs.value
  }
})

// 计算属性 - 分类标题
const categoryTitle = computed(() => {
  switch (currentCategory.value) {
    case 'local':
      return '本地仓库'
    case 'remote':
      return '远程仓库'
    default:
      return '全部'
  }
})

// 计算属性 - 空状态文本
const emptyText = computed(() => {
  switch (currentCategory.value) {
    case 'local':
      return '暂无本地仓库'
    case 'remote':
      return '暂无远程仓库'
    default:
      return '暂无已保存的仓库'
  }
})

// 获取文件夹名称
const getFolderName = (path) => {
  if (!path) return ''
  const parts = path.split('/').filter(part => part.length > 0)
  return parts[parts.length - 1] || path
}

// 格式化时间
const formatTime = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 检查目录是否存在
const checkPathExists = async (path) => {
  try {
    const result = await window.electronAPI.executeCommand({
      command: `test -d "${path}" && echo "exists" || echo "not_exists"`
    })
    return result?.success && result.output?.trim() === 'exists'
  } catch (e) {
    return false
  }
}

// 加载已保存的配置
const loadSavedConfigs = async () => {
  try {
    console.log('📋 准备加载已保存的配置...')
    
    if (window.electronAPI) {
      const configs = await window.electronAPI.getConfig('savedConfigs') || []
      
      if (configs.length > 0) {
        // 按名称排序
        savedConfigs.value = configs.sort((a, b) => {
          const nameA = getFolderName(a.path).toLowerCase()
          const nameB = getFolderName(b.path).toLowerCase()
          return nameA.localeCompare(nameB)
        })
        console.log('📁 加载已保存配置:', savedConfigs.value.length, '个')
        
        // 异步检查每个目录是否存在
        checkAllPaths()
      } else {
        savedConfigs.value = []
        pathExistsMap.value = {}
        console.log('📁 没有已保存的配置')
      }
    }
  } catch (error) {
    console.error('❌ 加载配置异常:', error)
    savedConfigs.value = []
    pathExistsMap.value = {}
  }
}

// 检查所有路径是否存在
const checkAllPaths = async () => {
  // 🚀 性能优化：并行检查所有路径，替代串行 for 循环
  const results = await Promise.all(
    savedConfigs.value.map(async (config) => {
      const exists = await checkPathExists(config.path)
      if (!exists) {
        console.log('⚠️ 目录不存在:', config.path)
      }
      return { path: config.path, exists }
    })
  )
  const newMap = {}
  for (const { path, exists } of results) {
    newMap[path] = exists
  }
  pathExistsMap.value = newMap
}

// 打开已保存的配置
const openSavedConfig = async (config) => {
  console.log('🚀 打开已保存配置:', config.path)

  try {
    // 🚀 性能优化：并行执行不相互依赖的配置保存操作
    const savePromises = [
      window.electronAPI.setConfig('scan-path', { path: config.path }),
      window.electronAPI.setCurrentConfig({ path: '', config: { path: config.path } })
    ]

    // 保存GitLab配置到文件（如果有的话）
    if (config.gitlabUrl && config.gitlabUrl !== '本地仓库') {
      savePromises.push(window.electronAPI.saveGitlabConfig({
        data: { url: config.gitlabUrl, token: config.token }
      }))
    }

    await Promise.all(savePromises)

    // 更新配置的最后使用时间（依赖前面的操作完成）
    const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
    const existingConfig = savedConfigsData.find(c => c.path === config.path)

    if (existingConfig) {
      existingConfig.lastUsed = new Date().toISOString()
      // 并行：保存配置 + 刷新列表
      await Promise.all([
        window.electronAPI.setConfig('savedConfigs', savedConfigsData),
        loadSavedConfigs()
      ])
    }
    
    // 根据配置类型打开
    let cloneUrl
    if (config.isSingleRepo) {
      cloneUrl = `git:project:${config.path}`
    } else {
      cloneUrl = `git:clone:${config.path}`
    }
    
    if (window.electronAPI && window.electronAPI.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(cloneUrl)
      console.log('✅ 新标签页已打开:', cloneUrl)
    }
    
  } catch (error) {
    console.error('❌ 打开配置时出错:', error)
    alert('打开配置时出错: ' + error.message)
  }
}

// 删除配置
const deleteConfig = async (config) => {
  try {
    const confirmed = await confirm({
      title: '删除配置',
      message: '确定要删除此配置吗？',
      detail: config.path,
      type: 'danger',
      confirmText: '删除'
    })
    if (confirmed) {
      const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
      const updatedConfigs = savedConfigsData.filter(c => c.path !== config.path)
      await window.electronAPI.setConfig('savedConfigs', updatedConfigs)
      await loadSavedConfigs()
      console.log('✅ 配置已删除')
    }
  } catch (error) {
    console.error('❌ 删除保存配置异常:', error)
    alert(`删除失败: ${error.message}`)
  }
}

// 添加本地 Git 仓库
const addLocalRepository = async () => {
  try {
    // 打开文件夹选择对话框
    const result = await window.electronAPI.showOpenDialog({
      title: '选择本地 Git 仓库或包含多个仓库的目录',
      properties: ['openDirectory'],
      message: '请选择一个 Git 仓库目录，或者包含多个 Git 仓库的父目录'
    })
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      console.log('📁 用户取消选择')
      return
    }
    
    const selectedPath = result.filePaths[0]
    console.log('📁 选择的目录:', selectedPath)
    
    // 检查选择的目录是否是 Git 仓库
    const checkGitResult = await window.electronAPI.executeCommand({
      command: 'git rev-parse --git-dir 2>&1',
      cwd: selectedPath
    })
    const checkGitDir = await window.electronAPI.executeCommand({
      command: 'test -d ".git" && echo "yes" || echo "no"',
      cwd: selectedPath
    })
    
    const hasGitDir = checkGitDir.output?.trim() === 'yes'
    const gitParseOk = checkGitResult.success && (checkGitResult.output?.trim() === '.git' || checkGitResult.output?.includes('.git'))
    const isGitRepo = hasGitDir || gitParseOk
    
    console.log('📁 检测 Git 仓库结果:', { isGitRepo, hasGitDir, gitParseOk })
    
    if (isGitRepo) {
      // 单个 Git 仓库，直接打开
      console.log('📁 检测到单个 Git 仓库，直接打开')
      await saveAndOpenLocalRepo(selectedPath, true)
    } else {
      // 检查是否包含 Git 仓库
      const findGitResult = await window.electronAPI.executeCommand({
        command: `find . -maxdepth 3 -name ".git" -type d 2>/dev/null | head -50`,
        cwd: selectedPath
      })
      
      const gitDirs = findGitResult.success && findGitResult.output?.trim() 
        ? findGitResult.output.trim().split('\n').filter(line => line.trim()).map(dir => {
            if (dir.startsWith('./')) {
              return selectedPath + dir.substring(1)
            }
            return dir
          })
        : []
      
      console.log('📁 找到的 Git 目录:', gitDirs)
      
      if (gitDirs.length === 0) {
        // 再尝试检查是否有 .git 文件
        const checkGitFile = await window.electronAPI.executeCommand({
          command: 'ls -la .git 2>/dev/null',
          cwd: selectedPath
        })
        if (checkGitFile.success && checkGitFile.output?.trim()) {
          await saveAndOpenLocalRepo(selectedPath, true)
          return
        }
        
        alert('所选目录不是 Git 仓库，也不包含任何 Git 仓库。\n\n请选择：\n1. 一个包含 .git 目录的 Git 仓库\n2. 或者一个包含多个 Git 仓库的父目录')
        return
      } else if (gitDirs.length === 1) {
        const repoPath = gitDirs[0].replace(/\/.git$/, '')
        console.log('📁 检测到一个子仓库:', repoPath)
        await saveAndOpenLocalRepo(repoPath, true)
      } else {
        console.log('📁 检测到多个 Git 仓库:', gitDirs.length, '个')
        await saveAndOpenLocalRepo(selectedPath, false)
      }
    }
  } catch (error) {
    console.error('❌ 添加本地仓库失败:', error)
    alert('添加本地仓库失败: ' + error.message)
  }
}

// 获取目录下的 remote URL
const getRemoteUrlForPath = async (path, isSingleRepo) => {
  try {
    if (isSingleRepo) {
      // 单个仓库，直接获取 remote URL
      const result = await window.electronAPI.executeCommand({
        command: 'git remote get-url origin 2>/dev/null',
        cwd: path
      })
      if (result.success && result.output?.trim()) {
        return result.output.trim()
      }
    } else {
      // 多仓库目录，查找第一个有 remote URL 的仓库
      const findGitResult = await window.electronAPI.executeCommand({
        command: `find . -maxdepth 3 -name ".git" -type d 2>/dev/null | head -20`,
        cwd: path
      })
      
      if (findGitResult.success && findGitResult.output?.trim()) {
        const gitDirs = findGitResult.output.trim().split('\n').filter(line => line.trim())
        
        for (const gitDir of gitDirs) {
          const repoPath = gitDir.startsWith('./')
            ? path + gitDir.substring(1).replace(/\/.git$/, '')
            : gitDir.replace(/\/.git$/, '')
          
          const result = await window.electronAPI.executeCommand({
            command: 'git remote get-url origin 2>/dev/null',
            cwd: repoPath
          })
          
          if (result.success && result.output?.trim()) {
            console.log('📁 找到有 remote 的仓库:', repoPath, result.output.trim())
            return result.output.trim()
          }
        }
      }
    }
  } catch (e) {
    console.log('📁 获取 remote URL 失败:', e)
  }
  return null
}

// 从 remote URL 提取平台信息
const extractPlatformFromUrl = (remoteUrl) => {
  if (!remoteUrl) return { platform: 'local', url: '' }
  
  try {
    let hostname = ''
    if (remoteUrl.startsWith('git@')) {
      // git@github.com:user/repo.git
      hostname = remoteUrl.split('@')[1].split(':')[0]
    } else if (remoteUrl.includes('://')) {
      // https://github.com/user/repo.git
      hostname = new URL(remoteUrl).hostname
    }
    
    if (hostname.includes('github.com')) {
      return { platform: 'github', url: 'https://github.com' }
    } else if (hostname.includes('gitee.com')) {
      return { platform: 'gitee', url: 'https://gitee.com' }
    } else if (hostname.includes('gitlab')) {
      return { platform: 'gitlab', url: `https://${hostname}` }
    } else if (hostname) {
      // 其他 Git 服务
      return { platform: 'remote', url: `https://${hostname}` }
    }
  } catch (e) {
    console.log('📁 解析 remote URL 失败:', e)
  }
  
  return { platform: 'local', url: '' }
}

// 保存并打开本地仓库
const saveAndOpenLocalRepo = async (path, isSingleRepo) => {
  try {
    // 检查是否有 remote URL
    const remoteUrl = await getRemoteUrlForPath(path, isSingleRepo)
    const { platform, url: platformUrl } = extractPlatformFromUrl(remoteUrl)
    
    const isLocal = !remoteUrl
    console.log('📁 仓库类型检测:', { path, remoteUrl, platform, isLocal })
    
    const newConfig = {
      path: path,
      gitlabUrl: isLocal ? '本地仓库' : platformUrl,
      token: '',
      lastUsed: new Date().toISOString(),
      isLocal: isLocal,
      isSingleRepo: isSingleRepo,
      platform: platform
    }
    
    const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
    const existingIndex = savedConfigsData.findIndex(c => c.path === path)
    
    if (existingIndex >= 0) {
      savedConfigsData[existingIndex] = { ...savedConfigsData[existingIndex], ...newConfig }
    } else {
      savedConfigsData.push(newConfig)
    }
    
    await window.electronAPI.setConfig('savedConfigs', savedConfigsData)
    console.log('💾 本地仓库配置已保存:', path)
    
    await loadSavedConfigs()
    
    await window.electronAPI.setConfig('scan-path', { path: path })
    
    // 打开仓库
    let cloneUrl
    if (isSingleRepo) {
      cloneUrl = `git:project:${path}`
    } else {
      cloneUrl = `git:clone:${path}`
    }
    
    if (window.electronAPI && window.electronAPI.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(cloneUrl)
      console.log('✅ 仓库已在新标签页打开:', cloneUrl)
    }
  } catch (error) {
    console.error('❌ 保存本地仓库配置失败:', error)
    throw error
  }
}

onMounted(() => {
  loadSavedConfigs()
})
</script>

<style scoped>
.repo-manager-page {
  display: flex;
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  color: #fff;
  overflow: hidden;
}

/* 左侧分类面板 */
.category-panel {
  width: 220px;
  min-width: 220px;
  background: #252526;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.category-header {
  display: flex;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.category-header h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  line-height: 1;
}

.category-list {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.category-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.category-item.active {
  background: #667eea;
  color: #fff;
}

.category-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.category-name {
  flex: 1;
}

.category-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.category-item.active .category-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* 右侧仓库列表面板 */
.repo-list-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.repo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.repo-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  line-height: 1;
}

.add-local-btn {
  padding: 8px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.add-local-btn:hover {
  background: #5a6fd6;
}

.repo-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.repo-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  margin-bottom: 10px;
  background: #2d2d2d;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}

.repo-item:hover {
  background: #3d3d3d;
  border-color: rgba(102, 126, 234, 0.5);
}

.repo-icon {
  font-size: 24px;
  margin-right: 14px;
  opacity: 0.8;
}

.repo-info {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.repo-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.repo-path {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.repo-type {
  color: #667eea;
}

.repo-time {
  color: rgba(255, 255, 255, 0.4);
}

.repo-actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.delete-btn {
  padding: 8px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-text {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
}

.empty-hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

/* 目录不存在的样式 */
.repo-item.path-missing {
  background: rgba(220, 53, 69, 0.1);
  border-color: rgba(220, 53, 69, 0.3);
}

.repo-item.path-missing .repo-name {
  color: #dc3545;
}

.repo-item.path-missing .repo-path {
  color: rgba(220, 53, 69, 0.7);
  text-decoration: line-through;
}

.missing-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  background: #dc3545;
  color: white;
  border-radius: 4px;
}
</style>
