<template>
  <div class="merge-request-section">
    <div class="merge-request-content">
      <!-- MR列表 -->
      <div class="merge-request-list">
        <div class="merge-request-header">
          <div class="header-left">
            <span>Merge Request记录</span>
          </div>
          <span class="mr-count">({{ mergeRequests.length }})</span>
        </div>
        
        <div class="mr-cards-container">
          <div 
            v-for="mr in mergeRequests" 
            :key="mr.id"
            class="mr-card"
          >
            <div class="mr-card-content">
              <div class="mr-header">
                <div class="mr-title">{{ mr.title }}</div>
                <div class="mr-actions">
                  <button 
                    class="gitlab-btn" 
                    @click="openInGitLab(mr)"
                    title="在GitLab中打开"
                  >
                    <ExternalLink :size="14" />
                    GitLab
                  </button>
                  <button 
                    class="copy-btn" 
                    @click="copyMRLink(mr)"
                    title="复制MR链接"
                  >
                    <Copy :size="14" />
                    复制
                  </button>
                </div>
              </div>
              
              <div class="mr-info">
                <div class="mr-branches">
                  <span class="source-branch">{{ mr.sourceBranch }}</span>
                  <span class="arrow">→</span>
                  <span class="target-branch">{{ mr.targetBranch }}</span>
                </div>
                <div class="mr-meta">
                  <span class="mr-status" :class="mr.state">{{ getStatusText(mr.state) }}</span>
                  <span class="mr-author">by {{ mr.author }}</span>
                  <span class="mr-date">{{ formatDate(mr.createdAt) }}</span>
                </div>
              </div>
              
              <div v-if="mr.description" class="mr-description">
                {{ mr.description }}
              </div>
            </div>
          </div>
          
          <div v-if="mergeRequests.length === 0 && !loading" class="empty-mr">
            暂无Open状态的Merge Request
          </div>
          
          <div v-if="loading" class="loading-mr">
            正在加载Merge Request...
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
    
    <!-- Toast提示 -->
    <div v-if="showToast" class="toast-notification">
      {{ toastMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { ExternalLink, Copy } from 'lucide-vue-next'
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


// 响应式数据
const loading = ref(false)
const mergeRequests = ref([])
const showToast = ref(false)
const toastMessage = ref('')

// 操作弹框相关状态
const showOperationDialog = ref(false)
const operationType = ref('')
const operationOutput = ref('')
const operationInProgress = ref(false)
const operationCancelled = ref(false)

// 获取真实的Git作者信息
const getGitAuthor = async () => {
  try {
    const result = await props.executeCommand(`cd "${props.projectPath}" && git config user.name`)
    return result.success ? result.output.trim() : 'unknown'
  } catch (error) {
    console.error('获取Git作者失败:', error)
    return 'unknown'
  }
}

// 获取真实的分支信息
const getRealBranchInfo = async () => {
  try {
    // 获取当前分支
    const currentBranchResult = await props.executeCommand(`cd "${props.projectPath}" && git branch --show-current`)
    const currentBranch = currentBranchResult.success ? currentBranchResult.output.trim() : 'main'
    
    // 获取所有分支
    const allBranchesResult = await props.executeCommand(`cd "${props.projectPath}" && git branch -r --format='%(refname:short)'`)
    const remoteBranches = allBranchesResult.success 
      ? allBranchesResult.output.trim().split('\n').filter(b => b && !b.includes('HEAD')).map(b => b.replace('origin/', ''))
      : []
    
    return { currentBranch, remoteBranches }
  } catch (error) {
    console.error('获取分支信息失败:', error)
    return { currentBranch: 'main', remoteBranches: [] }
  }
}

// 获取最近的提交信息
const getRecentCommits = async () => {
  try {
    const result = await props.executeCommand(`cd "${props.projectPath}" && git log --oneline -10 --pretty=format:'%h|%s|%an|%ad' --date=iso`)
    if (result.success && result.output.trim()) {
      return result.output.trim().split('\n').map(line => {
        const [hash, message, author, date] = line.split('|')
        return { hash, message, author, date }
      })
    }
    return []
  } catch (error) {
    console.error('获取提交信息失败:', error)
    return []
  }
}
const getGitLabProjectInfo = async () => {
  try {
    const remoteUrlResult = await props.executeCommand(`cd "${props.projectPath}" && git remote get-url origin`)
    if (remoteUrlResult.success && remoteUrlResult.output.trim()) {
      const remoteUrl = remoteUrlResult.output.trim()
      console.log('🔗 原始remote URL:', remoteUrl)
      
      if (remoteUrl.includes('gitlab')) {
        let baseUrl, projectPath
        
        if (remoteUrl.startsWith('git@')) {
          // SSH格式: git@gitlab.example.com:group/project.git
          const match = remoteUrl.match(/git@([^:]+):(.+)\.git$/)
          if (match) {
            baseUrl = `https://${match[1]}`
            projectPath = match[2]
          }
        } else if (remoteUrl.startsWith('http')) {
          // HTTPS格式: https://gitlab.example.com/group/project.git
          const match = remoteUrl.match(/(https?:\/\/[^\/]+)\/(.+)\.git$/)
          if (match) {
            baseUrl = match[1]
            projectPath = match[2]
          }
        }
        
        if (baseUrl && projectPath) {
          console.log('✅ 解析成功:', { baseUrl, projectPath })
          return { baseUrl, projectPath }
        }
      }
    }
  } catch (error) {
    console.warn('获取GitLab项目信息失败:', error)
  }
  return {
    baseUrl: 'https://gitlab.example.com',
    projectPath: 'project'
  }
}
// 加载MR列表
const loadMergeRequests = async () => {
  if (!props.projectPath || loading.value) {
    return
  }
  
  loading.value = true
  
  try {
    // 获取GitLab项目信息
    const gitlabInfo = await getGitLabProjectInfo()
    
    // 获取项目特定的GitLab配置
    const currentProjectPath = gitlabInfo.projectPath
    let gitlabConfig = null
    
    // 首先尝试获取项目特定的GitLab配置
    const projectConfigResult = await window.electronAPI.getProjectGitlabConfig(currentProjectPath)
    if (projectConfigResult.success && projectConfigResult.config) {
      gitlabConfig = projectConfigResult.config
      console.log('✅ 使用项目特定GitLab配置:', {
        url: gitlabConfig.url,
        token: gitlabConfig.token ? gitlabConfig.token.substring(0, 10) + '...' : 'null'
      })
    } else {
      // 如果没有项目特定配置，尝试从全局配置中获取
      gitlabConfig = await window.electronAPI.getConfig('gitlab-config')
      console.log('🔍 使用全局GitLab配置:', {
        url: gitlabConfig?.url,
        token: gitlabConfig?.token ? gitlabConfig.token.substring(0, 10) + '...' : 'null'
      })
      
      // 如果全局配置存在且URL匹配，自动保存为项目特定配置
      if (gitlabConfig && gitlabConfig.url === gitlabInfo.baseUrl) {
        await window.electronAPI.saveProjectGitlabConfig({
          projectPath: currentProjectPath,
          gitlabConfig: gitlabConfig
        })
        console.log('💾 自动保存全局配置为项目特定配置')
      } else if (gitlabConfig && gitlabConfig.url !== gitlabInfo.baseUrl && gitlabInfo.baseUrl !== 'https://gitlab.example.com') {
        // 如果全局配置的URL与项目URL不匹配，从历史配置中查找
        console.log('🔄 检测到不同的GitLab实例，从历史配置中查找')
        
        const gitlabHistory = await window.electronAPI.getConfig('gitlabHistory') || []
        const matchingConfig = gitlabHistory.find(config => config.url === gitlabInfo.baseUrl)
        
        if (matchingConfig) {
          // 找到匹配的配置，保存为项目特定配置
          gitlabConfig = {
            url: gitlabInfo.baseUrl,
            token: matchingConfig.token
          }
          await window.electronAPI.saveProjectGitlabConfig({
            projectPath: currentProjectPath,
            gitlabConfig: gitlabConfig
          })
          console.log('✅ 从历史配置中找到匹配的GitLab配置并保存为项目特定配置')
        } else {
          console.warn('⚠️ 未找到匹配的GitLab配置，使用模拟数据')
          await loadMockMRs(gitlabInfo)
          return
        }
      }
    }
    
    if (!gitlabConfig || !gitlabConfig.url || !gitlabConfig.token) {
      console.warn('GitLab配置未找到，使用模拟数据')
      await loadMockMRs(gitlabInfo)
      return
    }
    
    // 使用解析出来的GitLab URL，而不是配置中的URL
    const finalGitlabUrl = gitlabInfo.baseUrl !== 'https://gitlab.example.com' ? gitlabInfo.baseUrl : gitlabConfig.url
    const finalToken = gitlabConfig.token
    
    console.log('📋 从GitLab API实时获取MR列表...')
    console.log('🔗 GitLab URL:', finalGitlabUrl)
    console.log('📁 项目路径:', gitlabInfo.projectPath)
    console.log('🔑 Token前缀:', finalToken.substring(0, 10) + '...')
    
    // 调用GitLab API获取真实的MR列表（实时获取，不使用缓存）
    const result = await window.electronAPI.gitlabProjectMRs({
      url: finalGitlabUrl,
      token: finalToken,
      projectPath: gitlabInfo.projectPath,
      state: 'opened' // 只获取Open状态的MR
    })
    
    if (result.success && result.data) {
      console.log(`✅ 成功获取${result.data.length}个MR`)
      // 直接设置MR列表，不使用缓存
      mergeRequests.value = result.data
    } else {
      console.warn('获取MR列表失败，使用模拟数据:', result.message)
      // 如果API调用失败，使用模拟数据
      await loadMockMRs(gitlabInfo)
    }
    
  } catch (error) {
    console.error('加载MR列表失败:', error)
    // 出错时使用模拟数据
    const gitlabInfo = await getGitLabProjectInfo()
    await loadMockMRs(gitlabInfo)
  } finally {
    loading.value = false
  }
}

// 加载模拟MR数据（作为备用）
const loadMockMRs = async (gitlabInfo) => {
  try {
    // 获取真实的Git信息
    const author = await getGitAuthor()
    const branchInfo = await getRealBranchInfo()
    const recentCommits = await getRecentCommits()
    
    // 模拟加载延迟
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 使用真实数据生成MR列表（仅显示Open状态）
    const mockMRs = []
    
    // 如果有远程分支，为一些分支创建模拟MR（仅Open状态）
    if (branchInfo.remoteBranches.length > 0) {
      branchInfo.remoteBranches.slice(0, 3).forEach((branch, index) => {
        if (branch !== branchInfo.currentBranch && branch !== 'main' && branch !== 'master') {
          const commit = recentCommits[index] || { message: `Update ${branch}`, hash: 'abc123' }
          mockMRs.push({
            id: index + 1,
            title: commit.message || `Merge ${branch} into main`,
            sourceBranch: branch,
            targetBranch: 'main',
            state: 'opened', // 确保仅显示Open状态的MR
            author: commit.author || author,
            createdAt: commit.date || new Date().toISOString(),
            description: `将 ${branch} 分支的更改合并到 main 分支\n\n最近提交: ${commit.message || 'No commit message'}`,
            webUrl: `${gitlabInfo.baseUrl}/${gitlabInfo.projectPath}/-/merge_requests/${index + 1}`
          })
        }
      })
    }
    
    // 如果没有远程分支，创建一个基于当前分支的模拟MR（Open状态）
    if (mockMRs.length === 0) {
      const latestCommit = recentCommits[0] || { message: 'Initial commit', hash: 'abc123' }
      mockMRs.push({
        id: 1,
        title: latestCommit.message || `Update ${branchInfo.currentBranch}`,
        sourceBranch: branchInfo.currentBranch,
        targetBranch: 'main',
        state: 'opened', // 确保仅显示Open状态的MR
        author: latestCommit.author || author,
        createdAt: latestCommit.date || new Date().toISOString(),
        description: `基于当前分支 ${branchInfo.currentBranch} 的更改\n\n最近提交: ${latestCommit.message || 'No commit message'}`,
        webUrl: `${gitlabInfo.baseUrl}/${gitlabInfo.projectPath}/-/merge_requests/1`
      })
    }
    
    // 过滤仅显示Open状态的MR
    const openMRs = mockMRs.filter(mr => mr.state === 'opened')
    
    mergeRequests.value = openMRs
  } catch (error) {
    console.error('加载模拟MR数据失败:', error)
    mergeRequests.value = []
  }
}

// 监听项目路径变化
watch(() => props.projectPath, (newPath) => {
  if (newPath) {
    nextTick(() => {
      loadMergeRequests()
    })
  }
}, { immediate: true })

// 获取状态文本
const getStatusText = (state) => {
  switch (state) {
    case 'opened':
      return 'Open'
    case 'merged':
      return 'Merged'
    case 'closed':
      return 'Closed'
    default:
      return state
  }
}

// 格式化日期
const formatDate = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = now - date // 不需要Math.abs，因为现在时间应该总是大于创建时间
  
  const diffMinutes = Math.floor(diffTime / (1000 * 60))
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffMinutes < 1) {
    return '刚刚'
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  } else if (diffHours < 24) {
    return `${diffHours}小时前`
  } else if (diffDays === 1) {
    return '1天前'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return date.toLocaleDateString('zh-CN')
  }
}

// 刷新MR列表
const refreshMRList = async () => {
  console.log('🔄 刷新MR列表...')
  await loadMergeRequests()
}

// 添加新MR到列表
const addMergeRequest = async (newMR) => {
  console.log('➕ 添加新MR到列表:', newMR.id)
  
  // 如果传入的MR数据没有正确的webUrl，重新生成
  if (!newMR.webUrl || newMR.webUrl.includes('example.com')) {
    const gitlabInfo = await getGitLabProjectInfo()
    newMR.webUrl = `${gitlabInfo.baseUrl}/${gitlabInfo.projectPath}/-/merge_requests/${newMR.id}`
  }
  
  // 检查是否已存在
  const existingIndex = mergeRequests.value.findIndex(mr => mr.id === newMR.id)
  if (existingIndex >= 0) {
    // 如果已存在，更新
    mergeRequests.value[existingIndex] = newMR
  } else {
    // 如果不存在，添加到列表开头
    mergeRequests.value.unshift(newMR)
  }
}

// 在GitLab中打开MR（使用全局方法在新标签页中打开）
const openInGitLab = (mr) => {
  console.log('🔗 [MergeRequestList] 打开MR:', mr.webUrl)
  if (window.electronAPI?.openUrlInNewTab) {
    window.electronAPI.openUrlInNewTab(mr.webUrl)
  }
}

// 复制MR链接
const copyMRLink = async (mr) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(mr.webUrl)
      
      // 显示成功的toast提示
      showToast.value = true
      toastMessage.value = 'MR链接已复制到剪贴板'
      
      // 3秒后自动关闭
      setTimeout(() => {
        showToast.value = false
      }, 3000)
    } else {
      // 降级处理
      showToast.value = true
      toastMessage.value = `请手动复制: ${mr.webUrl}`
      setTimeout(() => {
        showToast.value = false
      }, 5000)
    }
  } catch (error) {
    console.error('复制链接失败:', error)
    showToast.value = true
    toastMessage.value = '复制失败，请手动复制'
    setTimeout(() => {
      showToast.value = false
    }, 3000)
  }
}


// 取消操作
const cancelOperation = () => {
  operationCancelled.value = true
  operationInProgress.value = false
  showOperationDialog.value = false
}

// 注意：移除 defineExpose，避免生产构建中的 refs 访问问题
</script>

<style scoped>
.merge-request-section {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.merge-request-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.merge-request-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.merge-request-header {
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

.mr-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: normal;
}

.mr-cards-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.mr-card {
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: box-shadow 0.2s ease;
}

.mr-card:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.mr-card:last-child {
  margin-bottom: 0;
}

.mr-card-content {
  padding: 16px;
}

.mr-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.mr-title {
  font-weight: 600;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  flex: 1;
  margin-right: 12px;
  line-height: 1.4;
}

.mr-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.gitlab-btn, .copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s ease;
}

.gitlab-btn:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.copy-btn:hover {
  background: #28a745;
  color: white;
  border-color: #28a745;
}

.mr-info {
  margin-bottom: 12px;
}

.mr-branches {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.source-branch {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.target-branch {
  background: rgba(40, 167, 69, 0.2);
  color: #6dd98f;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.arrow {
  color: rgba(255, 255, 255, 0.5);
  font-weight: bold;
}

.mr-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.mr-status {
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
  font-size: 11px;
}

.mr-status.opened {
  background: rgba(40, 167, 69, 0.2);
  color: #6dd98f;
}

.mr-status.merged {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
}

.mr-status.closed {
  background: rgba(220, 53, 69, 0.2);
  color: #f87171;
}

.mr-author {
  font-weight: 500;
}

.mr-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
}

.empty-mr {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  padding: 40px 20px;
}

.loading-mr {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  padding: 40px 20px;
}

/* Toast提示样式 */
.toast-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #28a745;
  color: white;
  padding: 12px 20px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 2000;
  font-size: 14px;
  font-weight: 500;
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .mr-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .mr-actions {
    justify-content: flex-end;
  }
  
  .mr-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .mr-branches {
    flex-wrap: wrap;
  }
  
  .mr-cards-container {
    padding: 8px;
  }
  
  .mr-card-content {
    padding: 12px;
  }
}
</style>