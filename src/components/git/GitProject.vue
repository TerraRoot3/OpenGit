<template>
  <div class="container">
    <!-- 左侧项目列表 -->
    <div class="sidebar">
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="搜索项目..." 
          class="search-input"
        />
      </div>

      <!-- Tab和项目列表整体容器 -->
      <div class="project-tab-container">
        <!-- Tab导航 -->
        <div class="project-tabs" v-if="activeTab !== 'loading'">
          <button 
            :class="['tab-btn', { active: activeTab === 'all' }]"
            @click="switchTab('all')"
          >
            全部
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'bookmarked' }]"
            @click="switchTab('bookmarked')"
          >
            收藏 ({{ validBookmarkedCount }})
          </button>
        </div>
        <!-- Loading状态 -->
        <div class="project-tabs" v-else>
          <div class="tab-loading">正在加载...</div>
        </div>

        <div class="project-list-container" ref="projectListContainerRef">
        <div v-if="loading" class="loading">
          <span>正在扫描Git项目...</span>
        </div>

        <div v-else>
          <div v-for="group in filteredGroups" :key="group.name" class="project-group">
          <div class="group-title">{{ group.name }}</div>
          <div 
            v-for="project in group.projects" 
            :key="project.path"
            :class="['project-item', { 
              active: selectedProject?.path === project.path,
              bookmarked: isBookmarked(project.path)
            }]"
            @click="selectProject(project)"
            @contextmenu.prevent="showContextMenu($event, project)"
          >
            <div class="project-content">
              <div class="project-name-row">
                <div class="project-name">{{ project.name }}</div>
                <!-- 待定文件图标 -->
                <div 
                  v-if="project.hasPendingFiles" 
                  class="pending-files-icon"
                  title="有待定文件"
                >
                  <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                    <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                  </svg>
                </div>
                <div class="push-count">
                  <span 
                    v-if="statusLoading[project.path]" 
                    class="status-loading"
                    title="正在检查分支状态..."
                  >
                    ⟳
                  </span>
                  <template v-else>
                    <span 
                      v-if="(project.localAhead || 0) > 0" 
                      class="push-count-number"
                      :title="`本地领先 ${project.localAhead || 0} 个提交`"
                    >
                      ↑{{ project.localAhead || 0 }}
                    </span>
                  </template>
                </div>
              </div>
              <div class="branch-info">
                <GitBranch :size="14" />
                <span class="branch-name">{{ project.branch }}</span>
                <span 
                  v-if="branchStatus[project.path]?.remoteAhead > 0" 
                  class="pull-count"
                  :title="`远程领先 ${branchStatus[project.path]?.remoteAhead} 个提交`"
                >
                  ↓{{ branchStatus[project.path]?.remoteAhead }}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 右侧项目详情：每个项目独立实例，v-show 保持存活（终端等状态不丢失）-->
    <ProjectDetail
      v-for="projectPath in visitedProjectPaths"
      :key="projectPath"
      v-show="selectedProject?.path === projectPath"
      :path="projectPath"
      :is-active="props.isActive && selectedProject?.path === projectPath"
      @branch-changed="handleBranchChanged"
      @status-updated="handleStatusUpdated"
      @navigate="handleNavigate"
      @pending-status-changed="handlePendingStatusChanged"
    />

    <!-- 项目右键菜单 -->
    <div 
      v-if="showContextMenuModal"
      class="context-menu"
      :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="toggleBookmark">
        {{ contextMenuProject && isBookmarked(contextMenuProject.path) ? '取消收藏' : '收藏项目' }}
          </div>
        </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { GitBranch } from 'lucide-vue-next'
import ProjectDetail from './ProjectDetail.vue'
import { 
  useProjectStore,
  setProjects as storeSetProjects,
  setSelectedProject as storeSetSelectedProject,
  updateBranchStatus as storeUpdateBranchStatus,
  getProjects as storeGetProjects,
  getSelectedProject as storeGetSelectedProject
} from '../../stores/projectStore'

const router = useRouter()
const isDev = import.meta.env.DEV
const normalizeLogArg = (arg) => {
  if (arg == null) return arg
  const type = typeof arg
  if (type === 'string' || type === 'number' || type === 'boolean') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (Array.isArray(arg)) return `[Array(${arg.length})]`
  if (type === 'object') {
    try {
      const keys = Object.keys(arg)
      const preview = keys.slice(0, 8).join(', ')
      return `{${preview}${keys.length > 8 ? ', ...' : ''}}`
    } catch (e) {
      return '[Object]'
    }
  }
  return String(arg)
}
const debugLog = (...args) => {
  if (isDev) {
    try {
      console.log(...args.map(normalizeLogArg))
    } catch (error) {
      console.log('[debugLog]', '日志输出失败')
    }
  }
}

// 🚀 接收来自TabManager的props
const props = defineProps({
  path: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
})

// 定义 emit
const emit = defineEmits(['navigate'])

// 处理导航事件（从 ProjectDetail 子组件传来的 navigate 事件）
const handleNavigate = (url) => {
  debugLog('🔗 [GitProject] 收到导航请求:', url)
  emit('navigate', url)
}

// 处理分支变化事件
const handleBranchChanged = (payload) => {
  const projectPath = typeof payload === 'string' ? selectedProject.value?.path : payload?.path
  const branch = typeof payload === 'string' ? payload : payload?.branch

  if (!projectPath || !branch) return

  debugLog('🔄 [GitProject] 分支变化:', { projectPath, branch })
  updateProjectBranchInfo(projectPath, branch)
}

// 处理状态更新事件
const handleStatusUpdated = (payload) => {
  const projectPath = payload?.path || selectedProject.value?.path
  if (!projectPath) return

  const remoteAhead = payload?.remoteAhead || 0
  const localAhead = payload?.localAhead || 0

  debugLog('📊 [GitProject] 状态更新:', { projectPath, remoteAhead, localAhead })

  branchStatus.value[projectPath] = { remoteAhead, localAhead }

  const project = findProjectByPath(projectPath)
  if (project) {
    project.localAhead = localAhead
    if (selectedProject.value?.path === projectPath) {
      selectedProject.value = project
    }
  }
}

// 处理待定文件状态变化事件（提交后刷新项目列表）
const handlePendingStatusChanged = (payload) => {
  const projectPath = payload?.path || selectedProject.value?.path
  if (!projectPath) return

  debugLog('📝 [GitProject] 待定文件状态变化，刷新项目列表:', projectPath)

  RefreshManager.lastRefresh.pendingStatus[projectPath] = 0
  setTimeout(() => {
    RefreshManager.refreshPendingStatus(projectPath, true)
  }, 100)
}

const loading = ref(true)
const cachedSelectedProjectPath = ref(null) // 缓存的选中项目路径（用于快速恢复）
const searchQuery = ref('')
const projects = ref([])
const selectedProject = ref(null)
// 🚀 延迟初始化activeTab，等待preloadTabState设置
const activeTab = ref('loading') // 临时设置为loading状态
const bookmarkedProjects = ref([]) // 收藏的项目列表
const preloadedBookmarkedPaths = ref([]) // 预加载的收藏路径（在项目列表加载前就获取）
const currentBranch = ref('')
const branchStatus = ref({}) // 存储每个分支的状态信息
const allBranchStatus = ref({}) // 存储每个项目的所有分支状态
const statusLoading = ref({}) // 存储每个项目的状态加载状态
// 记录已访问的项目，为其创建独立实例
const projectListContainerRef = ref(null) // 项目列表容器引用
// 已访问过的项目路径集合，每个路径对应一个独立的 ProjectDetail 实例
const visitedProjectPaths = ref([])

// 每当 selectedProject 变化时，确保对应路径在 visitedProjectPaths 中
watch(selectedProject, (project) => {
  if (project?.path && !visitedProjectPaths.value.includes(project.path)) {
    visitedProjectPaths.value.push(project.path)
  }
})

// 检查元素是否在容器的可视区域内
const isElementInViewport = (el, container) => {
  if (!el || !container) return true
  
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  
  // 检查元素是否完全在容器的可视区域内
  return (
    elRect.top >= containerRect.top &&
    elRect.bottom <= containerRect.bottom
  )
}

// 滚动选中的项目到可视区域（简化版本，使用 CSS 选择器）
const scrollSelectedProjectIntoView = () => {
  nextTick(() => {
    const container = projectListContainerRef.value
    if (container) {
      const activeEl = container.querySelector('.project-item.active')
      if (activeEl && !isElementInViewport(activeEl, container)) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  })
}

const showContextMenuModal = ref(false) // 是否显示右键菜单
const contextMenuPosition = ref({ x: 0, y: 0 }) // 右键菜单位置
const contextMenuProject = ref(null) // 右键菜单对应的项目

// 计算有效的收藏项目数量（只计算实际存在的项目）
const validBookmarkedCount = computed(() => {
  const projectPaths = new Set(projects.value.map(p => p.path))
  return bookmarkedProjects.value.filter(bookmarkedPath =>
    projectPaths.has(bookmarkedPath)
  ).length
})

// 按目录分组项目
const groupedProjects = computed(() => {
  const groups = {}

  // 根据当前tab决定要处理的项目列表
  let projectsToShow = []
  if (activeTab.value === 'bookmarked') {
    // 🚀 性能优化：用 Map 替代 .find()，O(n) 替代 O(n*m)
    const projectMap = new Map(projects.value.map(p => [p.path, p]))
    projectsToShow = bookmarkedProjects.value
      .map(bookmarkedPath => projectMap.get(bookmarkedPath))
      .filter(Boolean)
  } else {
    // 显示所有项目
    projectsToShow = projects.value
  }

  projectsToShow.forEach(project => {
    // 根据相对路径进行分组
    const pathParts = (project.relativePath || project.path || '').split('/')
    const groupName = pathParts[0] || '其他'

    if (!groups[groupName]) {
      groups[groupName] = []
    }
    groups[groupName].push(project)
  })

  return Object.entries(groups).map(([name, projects]) => ({
    name,
    projects: projects.sort((a, b) => a.name.localeCompare(b.name))
  }))
})

// 过滤项目
const filteredGroups = computed(() => {
  if (!searchQuery.value) {
    return groupedProjects.value
  }
  
  const query = searchQuery.value.toLowerCase()
  return groupedProjects.value.map(group => ({
    ...group,
    projects: group.projects.filter(project => 
      project.name.toLowerCase().includes(query) ||
      project.path.toLowerCase().includes(query)
    )
  })).filter(group => group.projects.length > 0)
})

// 获取当前项目的合并冲突信息


// 选择项目
const selectProject = async (project) => {
  debugLog('🔄 [selectProject] 切换项目:', project.name, project.path)

  // 立即更新选中状态
  selectedProject.value = project
  currentBranch.value = project.branch || 'unknown'
  
  // 同步到 store
  if (props.path) {
    storeSetSelectedProject(props.path, project.path)
  }
  
  // 🚀 异步保存（不阻塞）
  saveSelectedProject(project.path).catch(() => {})
  
  // 同步刷新当前分支名和 ahead/behind，避免切换项目后沿用旧缓存展示
  refreshProjectSummary(project.path, project.branch || 'unknown').catch(error => {
    console.error('❌ [selectProject] 获取分支状态失败:', error)
  })
}

// 获取分支列表（快速）
const getBranchList = async (projectPath) => {
  try {
    const result = await window.electronAPI.getBranchList({
      path: projectPath
    })
    
    if (result.success) {
      return result.data
    } else {
      console.error('获取分支列表失败:', result.error)
      return {
        current: 'unknown',
        all: [],
        remote: []
      }
    }
  } catch (error) {
    console.error('获取分支列表失败:', error)
    return {
      current: 'unknown',
      all: [],
      remote: []
    }
  }
}

// 获取分支状态（异步）
const getBranchStatus = async (projectPath, branch) => {
  try {
    const result = await window.electronAPI.getBranchStatus({
      path: projectPath
    })
    
    if (result.success) {
      const data = result.data
      
      // 更新所有分支状态
      allBranchStatus.value[projectPath] = data.allBranchStatus || {}
      
      // 检查并缓存文件冲突信息（基于git status中的冲突文件）
      debugLog('🔍 getBranchStatus 调试信息:', {
        projectPath,
        hasConflictFiles: data.hasConflictFiles,
        conflictMessage: data.conflictMessage,
        conflictFiles: data.conflictFiles,
        currentBranch: data.currentBranch,
        fromCache: result.fromCache || false
      })
      
      // 🔧 如果来自缓存，记录日志
      if (result.fromCache) {
        debugLog(`✅ [getBranchStatus] 使用缓存数据: ${projectPath} (${data.currentBranch})`)
      }
      
      return data
    } else {
      console.error('获取分支状态失败:', result.error)
      allBranchStatus.value[projectPath] = {}
      return { allBranchStatus: {}, currentBranchStatus: {} }
    }
  } catch (error) {
    console.error('获取分支状态失败:', error)
    allBranchStatus.value[projectPath] = {}
    return { allBranchStatus: {}, currentBranchStatus: {} }
  }
}

const refreshProjectSummary = async (projectPath, fallbackBranch = null) => {
  const statusPromise = getBranchStatus(projectPath, fallbackBranch)
  const branchListPromise = getBranchList(projectPath)

  branchListPromise.then(branchList => {
    if (branchList?.current) {
      updateProjectBranchInfo(projectPath, branchList.current)
    }
  }).catch(error => {
    console.error('❌ [refreshProjectSummary] 获取分支列表失败:', error)
  })

  const [statusData, branchList] = await Promise.all([
    statusPromise,
    branchListPromise
  ])

  if (statusData.allBranchStatus) {
    allBranchStatus.value[projectPath] = statusData.allBranchStatus
  }
  if (statusData.currentBranchStatus) {
    branchStatus.value[projectPath] = statusData.currentBranchStatus
    const project = findProjectByPath(projectPath)
    if (project) {
      project.localAhead = statusData.currentBranchStatus.localAhead || 0
    }
  }
  if (branchList?.current) {
    updateProjectBranchInfo(projectPath, branchList.current)
  } else if (statusData?.currentBranch) {
    updateProjectBranchInfo(projectPath, statusData.currentBranch)
  }

  return { statusData, branchList }
}

// 🔧 处理分支状态缓存更新事件
const handleBranchStatusCacheUpdated = (event, { projectPath, branchName, data }) => {
  debugLog(`🔄 [缓存更新] 收到分支状态缓存更新: ${projectPath} (${branchName})`)
  
  // 更新分支状态
  if (data.currentBranchStatus) {
    branchStatus.value[projectPath] = data.currentBranchStatus
    
    // 更新项目列表中的 push/pull 数量显示
    const projectIndex = projects.value.findIndex(p => p.path === projectPath)
    if (projectIndex !== -1) {
      projects.value[projectIndex].localAhead = data.currentBranchStatus.localAhead || 0
      debugLog(`✅ [缓存更新] 已更新项目列表: ${projects.value[projectIndex].name}, remoteAhead=${data.currentBranchStatus.remoteAhead}, localAhead=${data.currentBranchStatus.localAhead}`)
    }
  }

  // 更新所有分支状态
  if (data.allBranchStatus) {
    allBranchStatus.value[projectPath] = data.allBranchStatus
  }

  if (data.currentBranch) {
    updateProjectBranchInfo(projectPath, data.currentBranch)
  }
}

// 🔧 处理项目列表更新事件（后台扫描完成后通知）
const handleProjectsUpdated = (event, { path, projects: newProjects }) => {
  // 检查是否是当前加载的路径
  if (path !== props.path) {
    debugLog(`⏭️ [项目更新] 路径不匹配，跳过: ${path} !== ${props.path}`)
    return
  }
  
  debugLog(`🔄 [项目更新] 收到后台扫描结果，${newProjects.length} 个项目`)
  
  // 增量更新项目列表
  updateProjectsIncremental(newProjects)

  if (selectedProject.value?.path) {
    const updatedProject = findProjectByPath(selectedProject.value.path)
    if (updatedProject) {
      selectedProject.value = updatedProject
    }
  }
}

// 更新左侧项目列表中的分支信息
const updateProjectBranchInfo = (projectPath, newBranch) => {
  const project = findProjectByPath(projectPath)
  if (!project) return

  project.branch = newBranch

  const allBranchStatusForProject = allBranchStatus.value[projectPath]
  if (allBranchStatusForProject && allBranchStatusForProject[newBranch]) {
    const status = allBranchStatusForProject[newBranch]
    project.localAhead = status.localAhead || 0
    branchStatus.value[projectPath] = {
      remoteAhead: status.remoteAhead || 0,
      localAhead: status.localAhead || 0,
      hasNewCommits: status.hasNewCommits || false
    }
    debugLog(`立即更新项目 ${project.name} 的分支状态: ${newBranch}, push=${status.localAhead}, pull=${status.remoteAhead}`)
  } else {
    debugLog(`分支状态数据未找到，跳过更新: ${project.name} - ${newBranch}`)
  }

  if (selectedProject.value?.path === projectPath) {
    selectedProject.value = project
    currentBranch.value = newBranch
  }

  debugLog(`更新项目 ${project.name} 的分支信息: ${newBranch}`)
}

// 根据路径查找项目
const findProjectByPath = (projectPath) => {
  return projects.value.find(project => project.path === projectPath) || null
}


// 🔧 增量更新项目列表（保留现有项目，只更新信息）
const updateProjectsIncremental = async (newProjects) => {
  if (!newProjects || newProjects.length === 0) {
    return
  }
  
  // 创建路径到项目的映射，便于快速查找
  const newProjectsMap = new Map()
  newProjects.forEach(project => {
    newProjectsMap.set(project.path, project)
  })
  
  // 更新现有项目的信息，保留额外的状态（如 hasPendingFiles）
  projects.value.forEach((existingProject, index) => {
    const newProject = newProjectsMap.get(existingProject.path)
    if (newProject) {
      const currentStatus = branchStatus.value[existingProject.path]
      // 保留现有项目的额外状态
      projects.value[index] = {
        ...newProject,
        hasPendingFiles: existingProject.hasPendingFiles, // 保留待定文件状态
        localAhead: typeof currentStatus?.localAhead === 'number'
          ? currentStatus.localAhead
          : (typeof existingProject.localAhead === 'number' ? existingProject.localAhead : 0),
      }
      newProjectsMap.delete(existingProject.path) // 标记为已处理
    }
  })
  
  // 添加新项目（如果后端扫描到了新项目）
  newProjectsMap.forEach((newProject) => {
    projects.value.push(newProject)
  })
  
  // 移除已不存在的项目（如果后端扫描发现项目被删除）
  const existingPaths = new Set(newProjects.map(p => p.path))
  projects.value = projects.value.filter(project => existingPaths.has(project.path))

  if (selectedProject.value?.path) {
    const updatedProject = findProjectByPath(selectedProject.value.path)
    if (updatedProject) {
      selectedProject.value = updatedProject
    }
  }
}

// ==================== 刷新管理器 ====================
// 统一的刷新管理，避免重复刷新，提高性能
const RefreshManager = {
  // 刷新缓存（记录最后一次刷新时间）
  lastRefresh: {
    branchInfo: {},
    pendingStatus: {},
    fileStatus: 0,
    stashList: 0,
    commitHistory: 0,
    mergeRequests: 0
  },
  
  // 防抖计时器
  debounceTimer: null,
  
  // 正在刷新中
  isRefreshing: false,
  
  /**
   * 刷新当前项目的所有数据
   * @param {Object} options - 刷新选项
   * @param {boolean} options.force - 强制刷新，忽略缓存
   * @param {Array} options.scopes - 指定刷新范围 ['branch', 'files', 'history', 'all']
   */
  async refreshCurrentProject(options = {}) {
    if (!selectedProject.value) return
    
    const scopes = options.scopes || ['all']
    const force = options.force || false
    
    debugLog('🔄 [RefreshManager] 开始刷新当前项目:', selectedProject.value.name, 'scopes:', scopes)
    
    try {
      const projectPath = selectedProject.value.path
      const promises = []
      
      // 1. 刷新分支信息（包括push/pull数量）
      if (scopes.includes('all') || scopes.includes('branch')) {
        promises.push(this.refreshBranchInfo(projectPath, force))
      }
      
      // 2. 刷新待定文件状态
      if (scopes.includes('all') || scopes.includes('pending')) {
        promises.push(this.refreshPendingStatus(projectPath, force))
      }
      
      await Promise.all(promises)
      debugLog('✅ [RefreshManager] 当前项目刷新完成')
    } catch (error) {
      console.error('❌ [RefreshManager] 刷新失败:', error)
    }
  },
  
  /**
   * 刷新分支信息
   * 性能优化：增加缓存时间，减少不必要的刷新
   */
  async refreshBranchInfo(projectPath, force = false) {
    const now = Date.now()
    // 性能优化：如果不是强制刷新，且距离上次刷新不足10秒，跳过（从5秒增加到10秒）
    if (!force && this.lastRefresh.branchInfo[projectPath] && now - this.lastRefresh.branchInfo[projectPath] < 10000) {
      debugLog('⏭️ [RefreshManager] 分支信息跳过（最近已刷新）')
      return
    }
    
    try {
      debugLog('🔄 [RefreshManager] 刷新分支信息:', projectPath)
      
      // 🔧 先尝试从缓存读取（完全同步，立即返回，不等待任何 Git 命令）
      // 注意：这里不 await，立即返回，让 UI 先显示缓存数据
      if (!window.electronAPI || !window.electronAPI.getBranchStatusCache) {
        console.warn('⚠️ [RefreshManager.refreshBranchInfo] electronAPI.getBranchStatusCache 不可用')
        return
      }
      window.electronAPI.getBranchStatusCache({ path: projectPath }).then(cacheResult => {
        if (cacheResult.success && cacheResult.data) {
          const cachedData = cacheResult.data
          
          // 从缓存中获取当前分支的状态
          let currentBranchStatus = cachedData.currentBranchStatus
          
          // 如果缓存中有分支名，尝试从 allBranchStatus 中获取
          if (!currentBranchStatus && cachedData.currentBranch && cachedData.allBranchStatus) {
            currentBranchStatus = cachedData.allBranchStatus[cachedData.currentBranch]
          }
          
          // 如果还是没有，尝试从 allBranchStatus 中获取第一个分支的状态
          if (!currentBranchStatus && cachedData.allBranchStatus) {
            const firstBranch = Object.keys(cachedData.allBranchStatus)[0]
            if (firstBranch) {
              currentBranchStatus = cachedData.allBranchStatus[firstBranch]
            }
          }
          
          if (currentBranchStatus) {
            debugLog(`✅ [RefreshManager.refreshBranchInfo] 使用缓存数据:`, {
              projectPath,
              remoteAhead: currentBranchStatus.remoteAhead,
              localAhead: currentBranchStatus.localAhead,
              cacheExpired: cacheResult.cacheExpired || false
            })
            
            // 🔧 直接更新，Vue 3 的 ref 会自动处理响应式
            branchStatus.value[projectPath] = currentBranchStatus
            
            // 更新项目列表
            const projectIndex = projects.value.findIndex(p => p.path === projectPath)
            if (projectIndex !== -1) {
              projects.value[projectIndex].localAhead = currentBranchStatus.localAhead || 0
            }
          }
        }
      }).catch(cacheError => {
        console.warn(`⚠️ [RefreshManager.refreshBranchInfo] 读取缓存失败:`, cacheError)
      })
      
      // 🔧 然后异步刷新最新数据（不阻塞）
      // 使用 getBranchStatus 而不是 getBranchInfo，因为 getBranchStatus 的计算逻辑是正确的
      // 切换项目时使用的是 getBranchStatus，返回的是正确的值（1973），而 getBranchInfo 返回的是错误的值（3307）
      const statusPromise = getBranchStatus(projectPath, null)
      const branchListPromise = getBranchList(projectPath)

      branchListPromise.then(branchList => {
        if (branchList?.current) {
          updateProjectBranchInfo(projectPath, branchList.current)
        }
      }).catch(error => {
        console.error(`❌ [RefreshManager.refreshBranchInfo] 获取分支列表失败:`, error)
      })

      Promise.all([statusPromise, branchListPromise]).then(([statusData, branchList]) => {
        const currentBranch = branchList?.current || statusData?.currentBranch
        
        // 更新分支状态（包含push/pull数量）
        if (currentBranch && statusData.allBranchStatus && statusData.allBranchStatus[currentBranch]) {
          const currentBranchStatus = statusData.allBranchStatus[currentBranch]
          debugLog(`✅ [RefreshManager.refreshBranchInfo] 刷新完成，更新分支状态:`, {
            projectPath,
            currentBranch,
            remoteAhead: currentBranchStatus.remoteAhead,
            localAhead: currentBranchStatus.localAhead
          })
          
          branchStatus.value[projectPath] = currentBranchStatus
          
          // 🔧 更新项目列表中的 push/pull 数量显示
          const projectIndex = projects.value.findIndex(p => p.path === projectPath)
          if (projectIndex !== -1) {
            projects.value[projectIndex].localAhead = currentBranchStatus.localAhead || 0
            // remoteAhead 已经在 branchStatus 中，UI 会从那里读取
            debugLog(`✅ [RefreshManager.refreshBranchInfo] 更新项目列表:`, {
              projectName: projects.value[projectIndex].name,
              localAhead: projects.value[projectIndex].localAhead,
              branchStatusRemoteAhead: branchStatus.value[projectPath]?.remoteAhead
            })
          }
          
          // 更新分支信息（这会更新 allBranchStatus，但不会覆盖 branchStatus）
          updateProjectBranchInfo(projectPath, currentBranch)
        }
      }).catch(error => {
        console.error(`❌ [RefreshManager.refreshBranchInfo] 刷新失败:`, error)
      })
      
      this.lastRefresh.branchInfo[projectPath] = Date.now()
    } catch (error) {
      console.error('❌ [RefreshManager] 刷新分支信息失败:', error)
    }
  },
  
  /**
   * 刷新待定文件状态
   * 性能优化：增加缓存时间，减少不必要的刷新
   */
  async refreshPendingStatus(projectPath, force = false) {
    const now = Date.now()
    // 性能优化：如果不是强制刷新，且距离上次刷新不足5秒，跳过（从2秒增加到5秒）
    if (!force && this.lastRefresh.pendingStatus[projectPath] && now - this.lastRefresh.pendingStatus[projectPath] < 5000) {
      debugLog('⏭️ [RefreshManager] 待定文件状态跳过（最近已刷新）')
      return
    }
    
    try {
      debugLog('🔄 [RefreshManager] 刷新待定文件状态:', projectPath)
      
      // 检查Git状态 - 使用 cwd 而不是 path
      const statusResult = await window.electronAPI.executeCommand({
        command: 'git status --porcelain',
        cwd: projectPath
      })
      
      let hasPendingFiles = false
      if (statusResult.success && statusResult.output) {
        const statusLines = statusResult.output.trim().split('\n').filter(line => line.length > 0)
        hasPendingFiles = statusLines.length > 0  // 简化判断：有任何输出就表示有待定文件
      }
      
      // 更新projects数组中对应项目的hasPendingFiles状态
      const projectIndex = projects.value.findIndex(p => p.path === projectPath)
      if (projectIndex !== -1) {
        projects.value[projectIndex].hasPendingFiles = hasPendingFiles
        debugLog(`✅ [RefreshManager] 项目待定文件状态已更新:`, projectPath.split('/').pop(), hasPendingFiles)
      }
      
      this.lastRefresh.pendingStatus[projectPath] = Date.now()
    } catch (error) {
      console.error('❌ [RefreshManager] 刷新待定文件状态失败:', error)
    }
  },
  
  /**
   * 防抖刷新（用于频繁触发的场景，如窗口焦点）
   * 性能优化：增加防抖时间，减少刷新频率
   */
  debouncedRefresh(options = {}) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    
    // 性能优化：增加防抖时间到1秒，减少刷新频率
    this.debounceTimer = setTimeout(() => {
      this.refreshCurrentProject(options)
    }, 1000)
  }
}

// 注意：移除 defineExpose，避免生产构建中的 refs 访问问题
// 刷新功能通过 IPC refresh-on-focus 事件触发

// 标记是否已根据当前 path 加载过
const loadedPath = ref(null)
// 标记是否正在加载项目（用于避免重复加载）
const isLoadingProjects = ref(false)

// 异步刷新所有项目的待定文件状态（带防抖，避免频繁触发）
let _pendingRefreshTimer = null
const refreshAllPendingStatus = () => {
  if (_pendingRefreshTimer) clearTimeout(_pendingRefreshTimer)
  _pendingRefreshTimer = setTimeout(async () => {
    _pendingRefreshTimer = null
    debugLog('🔄 [GitProject] 开始刷新所有项目的待定文件状态')

    // 🚀 性能优化：并行执行（5个一批），替代串行 for 循环
    const projectList = [...projects.value]
    const BATCH_SIZE = 5
    for (let i = 0; i < projectList.length; i += BATCH_SIZE) {
      const batch = projectList.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (project) => {
        try {
          const statusResult = await window.electronAPI.executeCommand({
            command: 'git status --porcelain',
            cwd: project.path
          })

          let hasPendingFiles = false
          if (statusResult.success && statusResult.output) {
            const statusLines = statusResult.output.trim().split('\n').filter(line => line.length > 0)
            hasPendingFiles = statusLines.length > 0
          }

          const projectIndex = projects.value.findIndex(p => p.path === project.path)
          if (projectIndex !== -1) {
            projects.value[projectIndex].hasPendingFiles = hasPendingFiles
          }
        } catch (error) {
          console.warn(`⚠️ 检查项目 ${project.name} 待定文件状态失败:`, error)
        }
      }))
    }
    debugLog('✅ [GitProject] 所有项目待定文件状态刷新完成')
  }, 500) // 500ms 防抖
}

// 加载项目列表
const loadProjects = async () => {
  try {
    debugLog('🔄 从后端API获取项目列表...')
    
    // 🚀 直接使用 props.path（来自TabManager传递的当前tab路径）
    // 不再异步获取配置，减少阻塞
    const reposPath = props.path || DEFAULT_SCAN_PATH
    debugLog('📁 使用扫描路径:', reposPath)
    
    // 🚀 异步保存扫描路径到配置（不阻塞）
    window.electronAPI.setConfig('scan-path', { path: reposPath }).catch(() => {})
    window.electronAPI.setCurrentConfig({ path: '', config: { path: reposPath } }).catch(() => {})
    
          debugLog(`🔍 前端调用 getProjects 尝试扫描路径: ${reposPath}`)
          
          const result = await window.electronAPI.getProjects({
            path: reposPath
          })
    
    if (result.success) {
      // 🔧 优化：如果是首次加载（projects为空），直接赋值；否则增量更新
      if (projects.value.length === 0) {
        // 首次加载，直接赋值
        projects.value = result.projects
        debugLog(`✅ 首次加载，获取到 ${result.projects.length} 个项目`)
      } else {
        // 刷新时，增量更新项目列表（保留现有状态）
        debugLog(`🔄 刷新模式，增量更新项目列表（当前 ${projects.value.length} 个，新扫描到 ${result.projects.length} 个）`)
        await updateProjectsIncremental(result.projects)
        debugLog(`✅ 增量更新完成，当前项目数: ${projects.value.length}`)
      }
      
      // 同步项目列表到 store
      storeSetProjects(reposPath, projects.value)
      
      // 如果当前有选中的项目，更新其分支信息
      if (selectedProject.value) {
        // 从更新后的项目列表中找到对应的项目
        const updatedProject = findProjectByPath(selectedProject.value.path)
        if (updatedProject) {
          selectedProject.value = updatedProject
          currentBranch.value = updatedProject.branch || 'unknown'
        }
      }
      
      // 🔧 先为所有项目读取缓存并显示（完全同步，立即显示，不等待任何 Git 命令）
      // 注意：这里不 await，立即返回，让 UI 先显示缓存数据
      const projectsToLoad = projects.value.length > 0 ? projects.value : result.projects
      debugLog(`🔍 [loadProjects] 开始读取 ${projectsToLoad.length} 个项目的缓存`)
      
      // 并行读取所有项目的缓存（不阻塞，立即执行）
      if (!window.electronAPI || !window.electronAPI.getBranchStatusCache) {
        console.warn('⚠️ [loadProjects] electronAPI.getBranchStatusCache 不可用')
        return
      }
      projectsToLoad.forEach((project) => {
        // 不 await，立即执行，不阻塞 UI
        window.electronAPI.getBranchStatusCache({ path: project.path }).then(cacheResult => {
          if (cacheResult.success && cacheResult.data) {
            const cachedData = cacheResult.data
            
            // 从缓存中获取当前分支的状态（如果缓存中有分支信息）
            // 优先使用 currentBranchStatus，如果没有则尝试从 allBranchStatus 中获取
            let currentBranchStatus = cachedData.currentBranchStatus
            
            // 如果缓存中有分支名，尝试从 allBranchStatus 中获取
            if (!currentBranchStatus && cachedData.currentBranch && cachedData.allBranchStatus) {
              currentBranchStatus = cachedData.allBranchStatus[cachedData.currentBranch]
            }
            
            // 如果还是没有，尝试从 allBranchStatus 中获取第一个分支的状态
            if (!currentBranchStatus && cachedData.allBranchStatus) {
              const firstBranch = Object.keys(cachedData.allBranchStatus)[0]
              if (firstBranch) {
                currentBranchStatus = cachedData.allBranchStatus[firstBranch]
              }
            }
            
            if (currentBranchStatus) {
              // 🔧 直接更新，Vue 3 的 ref 会自动处理响应式
              branchStatus.value[project.path] = currentBranchStatus
              
              // 更新项目列表中的 localAhead
              const projectIndex = projects.value.findIndex(p => p.path === project.path)
              if (projectIndex !== -1) {
                projects.value[projectIndex].localAhead = currentBranchStatus.localAhead || 0
              }
              
              debugLog(`✅ [loadProjects] 从缓存加载项目状态: ${project.name}, remoteAhead=${currentBranchStatus.remoteAhead}, localAhead=${currentBranchStatus.localAhead}`)
            } else {
              debugLog(`⚠️ [loadProjects] 缓存中没有找到分支状态: ${project.name}`, cachedData)
            }
          } else {
            debugLog(`ℹ️ [loadProjects] 项目 ${project.name} 无缓存数据`)
          }
        }).catch(cacheError => {
          console.warn(`⚠️ [loadProjects] 读取项目 ${project.name} 缓存失败:`, cacheError)
        })
      })
      
      debugLog(`✅ [loadProjects] 已启动所有项目的缓存读取（异步执行）`)
      
      // 🚀 不再在这里刷新分支状态（会触发 git fetch 阻塞 UI）
      // 分支状态刷新移到 ProjectDetailNew 组件中延迟执行
      
      // 项目列表加载完成后，异步加载收藏列表（不阻塞）
      loadBookmarkedProjects()
    } else {
      throw new Error(result.error || '获取项目列表失败')
    }
  } catch (error) {
    console.error('获取项目列表失败:', error)
    // 🔧 优化：刷新失败时不清空列表，保留现有项目
    if (projects.value.length === 0) {
      // 只有在首次加载失败时才清空
      projects.value = []
    }
  }
}

const DEFAULT_SCAN_PATH = '/path/to/your/projects'

const getCurrentScanPathKey = (scanPath) => {
  return `bookmarkedProjects_${scanPath.replace(/[/\\]/g, '_')}`
}

const buildScanStorageKeys = (scanPath) => {
  const normalizedScanPath = scanPath || DEFAULT_SCAN_PATH
  const configKey = getCurrentScanPathKey(normalizedScanPath)
  return {
    scanPath: normalizedScanPath,
    configKey,
    tabStateKey: `${configKey}_activeTab`,
    selectedProjectKey: `${configKey}_selectedProject`
  }
}

const resolveStoredScanPath = async () => {
  try {
    const scanPathConfig = await window.electronAPI.getConfig('scan-path')
    return scanPathConfig?.path || ''
  } catch (error) {
    return ''
  }
}

const resolveScanStorageKeys = async () => {
  const scanPath = props.path || await resolveStoredScanPath() || DEFAULT_SCAN_PATH
  return buildScanStorageKeys(scanPath)
}

const preloadSelectedProjectPath = (scanPath) => {
  const { selectedProjectKey } = buildScanStorageKeys(scanPath)
  window.electronAPI.getConfig(selectedProjectKey).then(path => {
    if (path) {
      cachedSelectedProjectPath.value = path
    }
  }).catch(() => {})
}

const runDeferredProjectsLoad = ({ pathLabel = null } = {}) => {
  setTimeout(async () => {
    await loadProjects()
    loading.value = false

    if (cachedSelectedProjectPath.value) {
      restoreProjectByPath(cachedSelectedProjectPath.value)
    }

    loadBookmarkedProjects()
    refreshAllPendingStatus()
    isLoadingProjects.value = false

    if (pathLabel) {
      debugLog('✅ GitProject 重新加载完成，path:', pathLabel)
    }
  }, 50)
}

// 🚀 预先加载tab状态和收藏列表（在组件初始化前，不需要等待项目列表）
const preloadTabState = async () => {
  try {
    const { scanPath, configKey, tabStateKey } = await resolveScanStorageKeys()
    
    // 🚀 并行加载 tab 状态和收藏列表（加快加载速度）
    const [savedTabState, savedBookmarked] = await Promise.all([
      window.electronAPI.getConfig(tabStateKey),
      window.electronAPI.getConfig(configKey)
    ])
    
    // 🚀 立即设置预加载的收藏路径（这样在项目列表加载后可以快速匹配）
    preloadedBookmarkedPaths.value = savedBookmarked || []
    // 🚀 立即设置收藏列表（即使项目还没加载，也先显示路径）
    bookmarkedProjects.value = preloadedBookmarkedPaths.value
    debugLog('🚀 预加载收藏路径:', preloadedBookmarkedPaths.value.length, '个')
    
    // 🚀 简化逻辑：如果有保存的状态就用保存的，没有就默认'全部'
    if (savedTabState && (savedTabState === 'all' || savedTabState === 'bookmarked')) {
      activeTab.value = savedTabState
      debugLog('🚀 恢复上次选择的tab:', savedTabState)
    } else {
      activeTab.value = 'all'  // 默认选择全部
      debugLog('🚀 首次访问，默认选择全部tab')
    }
  } catch (error) {
    console.error('❌ 预先加载tab状态失败:', error)
    activeTab.value = 'all'  // 出错时默认选择全部
  }
}

// 🚀 保存当前选中的项目
const saveSelectedProject = async (projectPath) => {
  try {
    const { selectedProjectKey } = await resolveScanStorageKeys()
    
    await window.electronAPI.setConfig(selectedProjectKey, projectPath)
    debugLog('💾 已保存选中项目:', projectPath, 'key:', selectedProjectKey)
  } catch (error) {
    console.error('❌ 保存选中项目失败:', error)
  }
}

// 🚀 恢复选中的项目
const restoreSelectedProject = () => {
    // 确保项目列表已加载
    if (projects.value.length === 0) {
      debugLog('⚠️ restoreSelectedProject: 项目列表为空，跳过恢复')
      return false
    }
    
  // 🚀 直接使用 props.path
  const { selectedProjectKey } = buildScanStorageKeys(props.path || DEFAULT_SCAN_PATH)
  
  // 🚀 异步获取配置，不阻塞
  window.electronAPI.getConfig(selectedProjectKey).then(savedProjectPath => {
    if (!savedProjectPath) {
      debugLog('⚠️ restoreSelectedProject: 没有找到保存的项目路径')
      return
    }
    
    restoreProjectByPath(savedProjectPath)
  }).catch(e => {
    debugLog('⚠️ 获取保存的项目路径失败:', e)
  })
  
  return true
}

// 🚀 根据路径恢复项目（同步执行，不阻塞）
const restoreProjectByPath = (savedProjectPath) => {
  debugLog('🔄 从配置恢复选中的项目:', savedProjectPath)
  
  // 在项目列表中查找保存的项目
  const savedProject = findProjectByPath(savedProjectPath)
  if (!savedProject) {
    debugLog('⚠️ 保存的项目路径在项目列表中不存在:', savedProjectPath)
    return false
  }
  
  debugLog('✅ 找到保存的项目，开始恢复:', savedProject.name, savedProject.path)
  
  // 直接选择项目
  selectedProject.value = savedProject
  currentBranch.value = savedProject.branch || 'unknown'
  
  // 🚀 立即滚动到选中的项目
  scrollSelectedProjectIntoView()
  debugLog('✅ 已恢复选中项目:', savedProject.name, savedProject.path)
  
  refreshProjectSummary(savedProject.path, savedProject.branch || 'unknown').catch(error => {
    console.error('❌ 恢复项目时获取分支状态失败:', error)
  })
  
  return true
}

// 🚀 保存当前tab状态
const saveTabState = async (tabState) => {
  try {
    const { tabStateKey } = await resolveScanStorageKeys()
    
    await window.electronAPI.setConfig(tabStateKey, tabState)
    debugLog('💾 已保存tab状态:', tabState, 'key:', tabStateKey)
  } catch (error) {
    console.error('❌ 保存tab状态失败:', error)
  }
}

// 加载收藏项目列表
const loadBookmarkedProjects = async () => {
  try {
    const { scanPath, configKey } = await resolveScanStorageKeys()
    
    // 🚀 使用预加载的收藏路径（如果有），否则从配置中获取
    let bookmarked
    if (preloadedBookmarkedPaths.value.length > 0) {
      bookmarked = preloadedBookmarkedPaths.value
      debugLog('📌 使用预加载的收藏路径:', bookmarked.length, '个')
    } else {
      // 根据当前扫描路径获取对应的收藏列表
      const result = await window.electronAPI.getConfig(configKey)
      bookmarked = result || []
    }
    
    // 🔧 过滤掉已删除的项目：只保留实际存在的项目路径
    const validBookmarked = bookmarked.filter(bookmarkedPath => 
      projects.value.some(project => project.path === bookmarkedPath)
    )
    
    // 如果过滤后的收藏列表与原始列表不同，说明有项目被删除了，需要保存更新后的列表
    if (validBookmarked.length !== bookmarked.length) {
      debugLog(`🔧 检测到已删除的项目，更新收藏列表: ${bookmarked.length} -> ${validBookmarked.length}`)
      bookmarkedProjects.value = validBookmarked
      // 保存更新后的收藏列表
      await saveBookmarkedProjects()
    } else {
      bookmarkedProjects.value = bookmarked
    }
    
    debugLog('📌 加载收藏项目:', validBookmarked.length, '个 (目录:', scanPath, ')')
    
    // 🔧 如果当前是收藏tab，确保选中的项目在收藏列表中
    if (activeTab.value === 'bookmarked' && bookmarkedProjects.value.length > 0) {
      // 检查当前选中的项目是否在收藏列表中
      const currentSelectedInBookmarked = selectedProject.value && 
        bookmarkedProjects.value.includes(selectedProject.value.path)
      
      if (!currentSelectedInBookmarked) {
        // 当前选中的项目不在收藏列表中，需要自动选中收藏列表中的项目
        const firstBookmarkedPath = bookmarkedProjects.value[0]
        const firstBookmarkedProject = projects.value.find(p => p.path === firstBookmarkedPath)
        if (firstBookmarkedProject) {
          debugLog('📌 [收藏加载完成] 当前项目不在收藏列表，自动选中:', firstBookmarkedProject.name)
          selectedProject.value = firstBookmarkedProject
          currentBranch.value = firstBookmarkedProject.branch || 'unknown'
          
          // 保存选中状态
          if (props.path) {
            storeSetSelectedProject(props.path, firstBookmarkedProject.path)
          }
          
          // 滚动到选中项目
          scrollSelectedProjectIntoView()
        }
      } else {
        debugLog('📌 [收藏加载完成] 当前选中项目在收藏列表中:', selectedProject.value.name)
      }
    } else if (activeTab.value === 'bookmarked' && bookmarkedProjects.value.length === 0) {
      debugLog('📌 [收藏加载完成] 收藏列表为空')
    }
    
  } catch (error) {
    console.error('❌ 加载收藏项目失败:', error)
    bookmarkedProjects.value = []
  }
}

// 保存收藏项目列表
const saveBookmarkedProjects = async () => {
  try {
    const { scanPath, configKey } = await resolveScanStorageKeys()
    
    // 将响应式数组转换为普通数组进行序列化
    const projectsToSave = Array.from(bookmarkedProjects.value)
    
    // 根据当前扫描路径保存对应的收藏列表
    await window.electronAPI.setConfig(configKey, projectsToSave)
    debugLog('💾 保存收藏项目:', projectsToSave.length, '个 (目录:', scanPath, ')')
  } catch (error) {
    console.error('❌ 保存收藏项目失败:', error)
  }
}

// 切换tab
const switchTab = async (tabName) => {
  activeTab.value = tabName
  // tab切换时清空搜索
  searchQuery.value = ''
  // 🚀 保存tab状态
  await saveTabState(tabName)
  
  // 🔧 切换tab后检查当前选中的项目是否在新tab的列表中
  if (tabName === 'bookmarked') {
    // 切换到收藏tab
    if (selectedProject.value) {
      // 检查当前选中的项目是否在收藏列表中
      const isInBookmarked = bookmarkedProjects.value.includes(selectedProject.value.path)
      if (!isInBookmarked && bookmarkedProjects.value.length > 0) {
        // 当前选中的项目不在收藏列表中，自动选中收藏列表的第一个项目
        const firstBookmarkedPath = bookmarkedProjects.value[0]
        const firstBookmarkedProject = projects.value.find(p => p.path === firstBookmarkedPath)
        if (firstBookmarkedProject) {
          debugLog('📌 [切换到收藏Tab] 自动选中收藏列表第一个项目:', firstBookmarkedProject.name)
          await selectProject(firstBookmarkedProject)
          return // selectProject 已经处理了刷新
        }
      }
    } else if (bookmarkedProjects.value.length > 0) {
      // 没有选中项目，自动选中收藏列表的第一个
      const firstBookmarkedPath = bookmarkedProjects.value[0]
      const firstBookmarkedProject = projects.value.find(p => p.path === firstBookmarkedPath)
      if (firstBookmarkedProject) {
        debugLog('📌 [切换到收藏Tab] 没有选中项目，自动选中第一个:', firstBookmarkedProject.name)
        await selectProject(firstBookmarkedProject)
        return
      }
    }
  } else if (tabName === 'all') {
    // 切换到全部tab，如果当前选中的项目不在可见列表，选中第一个
    if (!selectedProject.value && projects.value.length > 0) {
      debugLog('📋 [切换到全部Tab] 没有选中项目，自动选中第一个')
      await selectProject(projects.value[0])
      return
    }
  }
  
  // 🔧 切换tab后只刷新当前tab页面的内容
  try {
    // 刷新当前项目的详细内容
    if (selectedProject.value) {
      await RefreshManager.refreshCurrentProject({ 
        scopes: ['branch', 'pending'], 
        force: false  // 不强制刷新，使用缓存
      })
    }
    debugLog('✅ [切换Tab] 已刷新当前tab页面的内容')
  } catch (error) {
    console.error('❌ [切换Tab] 刷新失败:', error)
  }
}

const handleWindowFocusRefresh = async (payload = {}) => {
  // 只有当前标签激活时才刷新
  if (!props.isActive) {
    debugLog('⏭️ [前端] 窗口获得焦点，但当前标签未激活，跳过刷新')
    return
  }

  const source = payload?.source || 'window-focus'

  if (source === 'terminal') {
    if (!selectedProject.value) {
      return
    }

    if (payload?.projectPath && payload.projectPath !== selectedProject.value.path) {
      debugLog('⏭️ [前端] 终端事件来自其他项目，跳过刷新:', payload.projectPath)
      return
    }

    debugLog('🔄 [前端] 终端命令完成，刷新当前项目详情:', selectedProject.value.name)

    try {
      RefreshManager.debouncedRefresh({
        scopes: ['branch', 'pending'],
        force: true
      })
      if (window.electronAPI && window.electronAPI.notifyRefreshComplete) {
        window.electronAPI.notifyRefreshComplete()
      }
    } catch (error) {
      console.error('❌ [终端刷新] 刷新失败:', error)
      if (window.electronAPI && window.electronAPI.notifyRefreshComplete) {
        window.electronAPI.notifyRefreshComplete()
      }
    }
    return
  }

  debugLog('🔄 [前端] 窗口获得焦点，开始轻量刷新...')
  
  // 🔧 优化：窗口焦点回来时只刷新当前项目状态，不重新加载整个项目列表
  // 这样可以避免 loading 状态和 UI 卡顿
  try {
    // 1. 只刷新当前选中项目的详情（不刷新项目列表）
    if (selectedProject.value) {
      debugLog('🔄 [刷新] 刷新当前项目详情:', selectedProject.value.name)
      RefreshManager.debouncedRefresh({ 
        scopes: ['branch', 'pending'], 
        force: true  // 强制刷新，忽略缓存
      })
    }
    
    // 2. 异步刷新所有项目的待定状态（后台执行，不阻塞 UI）
    refreshAllPendingStatus()
    
    // 3. 通知刷新完成（用于恢复 tab 图标）
    if (window.electronAPI && window.electronAPI.notifyRefreshComplete) {
      window.electronAPI.notifyRefreshComplete()
    }
  } catch (error) {
    console.error('❌ [刷新] 刷新失败:', error)
    // 即使失败也要通知刷新完成，恢复图标
    if (window.electronAPI && window.electronAPI.notifyRefreshComplete) {
      window.electronAPI.notifyRefreshComplete()
    }
  }
}

// 处理窗口失去焦点事件
const handleWindowBlur = () => {
  debugLog('🔄 [前端] 窗口失去焦点')
}

// 检查项目是否被收藏
const isBookmarked = (projectPath) => {
  return bookmarkedProjects.value.includes(projectPath)
}

// 切换收藏状态
const toggleBookmark = async () => {
  if (!contextMenuProject.value) return
  
  const projectPath = contextMenuProject.value.path
  const bookmarkedIndex = bookmarkedProjects.value.indexOf(projectPath)
  
  if (bookmarkedIndex > -1) {
    // 取消收藏
    bookmarkedProjects.value.splice(bookmarkedIndex, 1)
    debugLog('📌 取消收藏项目:', projectPath)
  } else {
    // 添加收藏
    bookmarkedProjects.value.push(projectPath)
    debugLog('📌 收藏项目:', projectPath)
  }
  
  // 保存到存储
  await saveBookmarkedProjects()
  
  // 🚀 简化的逻辑：不自动切换tab，让用户自己选择
  // 只更新收藏数据和保存当前tab状态
  
  // 关闭右键菜单
  hideContextMenu()
}

// 显示右键菜单
const showContextMenu = (event, project) => {
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuProject.value = project
  showContextMenuModal.value = true
}

// 隐藏右键菜单
const hideContextMenu = () => {
  showContextMenuModal.value = false
  contextMenuProject.value = null
}




// 监听 path prop 变化，重新加载项目（必须在 loadProjects 等函数定义之后）
watch(() => props.path, (newPath, oldPath) => {
  debugLog('🔄 GitProject watch path 触发:', { 
    oldPath, 
    newPath, 
    loadedPath: loadedPath.value,
    propsPath: props.path,
    willLoad: newPath && newPath !== loadedPath.value
  })
  
  // 如果 path 从 null/undefined 变为有效值，或者 path 发生变化，都需要重新加载
  if (newPath && newPath !== loadedPath.value && !isLoadingProjects.value) {
    debugLog('✅ GitProject path 变化，开始重新加载项目:', { oldPath, newPath, loadedPath: loadedPath.value })
    // 更新已加载的路径标记
    loadedPath.value = newPath
    // 标记正在加载
    isLoadingProjects.value = true
    
    // 🚀 先从 store 读取缓存的项目列表（立即显示）
    const cachedProjects = storeGetProjects(newPath)
    if (cachedProjects && cachedProjects.length > 0) {
      projects.value = cachedProjects
      loading.value = false
      debugLog('📦 [Store缓存] 从 store 读取 ${cachedProjects.length} 个项目')
      
      // 恢复选中的项目
      const cachedSelected = storeGetSelectedProject(newPath)
      if (cachedSelected) {
        const project = cachedProjects.find(p => p.path === cachedSelected)
        if (project) {
          selectedProject.value = project
          currentBranch.value = project.branch || 'unknown'
        }
      }
    } else {
      // 没有缓存，显示加载状态
    projects.value = []
    selectedProject.value = null
    loading.value = true
    }
    
    // 🚀 先预加载选中项目路径（不阻塞）
    preloadSelectedProjectPath(newPath || DEFAULT_SCAN_PATH)
    
    // 🚀 使用 setTimeout 延迟加载，让浏览器先完成 UI 渲染
    runDeferredProjectsLoad({ pathLabel: newPath })
  } else if (!newPath) {
    // 如果 path 变为 null，重置已加载标记
    debugLog('⚠️ GitProject path 变为 null，重置已加载标记')
    loadedPath.value = null
  } else {
    debugLog('⏭️ GitProject path 未变化，跳过加载:', { newPath, loadedPath: loadedPath.value })
  }
}, { immediate: true, flush: 'post' })

// 监听标签激活状态，切换标签时异步刷新
watch(() => props.isActive, (newActive, oldActive) => {
  if (newActive && !oldActive && props.path && selectedProject.value) {
    debugLog('🔄 [GitProject] 标签激活，异步刷新分支状态...')
    RefreshManager.debouncedRefresh({ scopes: ['branch', 'pending'], force: false })
  }
})

// 🔧 监听 activeTab 变化，当从 loading 变为 bookmarked 时，自动选中收藏列表中的项目
watch(activeTab, (newTab, oldTab) => {
  if (oldTab === 'loading' && newTab === 'bookmarked' && projects.value.length > 0) {
    debugLog('📌 [Tab初始化] 检测到收藏tab，检查是否需要自动选中')
    autoSelectBookmarkedProject()
  }
})

// 🔧 监听项目列表变化，当项目加载完成且当前是收藏 tab 时，自动选中
watch(() => projects.value.length, (newLength, oldLength) => {
  if (newLength > 0 && oldLength === 0 && activeTab.value === 'bookmarked') {
    debugLog('📌 [项目加载完成] 检测到收藏tab，检查是否需要自动选中')
    autoSelectBookmarkedProject()
  }
})

// 🔧 自动选中收藏列表中的项目
const autoSelectBookmarkedProject = () => {
  // 检查当前选中的项目是否在收藏列表中
  const currentSelectedInBookmarked = selectedProject.value && 
    preloadedBookmarkedPaths.value.includes(selectedProject.value.path)
  
  if (!currentSelectedInBookmarked && preloadedBookmarkedPaths.value.length > 0) {
    const firstBookmarkedPath = preloadedBookmarkedPaths.value[0]
    const firstProject = projects.value.find(p => p.path === firstBookmarkedPath)
    if (firstProject) {
      debugLog('📌 [自动选中] 收藏列表第一个项目:', firstProject.name)
      selectedProject.value = firstProject
      currentBranch.value = firstProject.branch || 'unknown'
      scrollSelectedProjectIntoView()
    }
  }
}

// 初始化
onMounted(() => {
  debugLog('🏠 GitProject onMounted, props.path:', props.path, 'loadedPath:', loadedPath.value, 'isLoadingProjects:', isLoadingProjects.value)
  
  // 🚀 异步预加载tab状态（不阻塞 UI）
  preloadTabState()
  
  // 如果 props.path 存在且 watch 还没有加载过，则手动加载
  if (props.path && props.path !== loadedPath.value && !isLoadingProjects.value) {
    debugLog('🏠 onMounted: props.path 存在但未加载，手动加载:', props.path)
    loadedPath.value = props.path
    isLoadingProjects.value = true
    
    // 🚀 先从 store 读取缓存的项目列表（立即显示）
    const cachedProjects = storeGetProjects(props.path)
    if (cachedProjects && cachedProjects.length > 0) {
      projects.value = cachedProjects
    loading.value = false
      debugLog(`📦 [Store缓存] onMounted 从 store 读取 ${cachedProjects.length} 个项目`)
      
      // 🔧 延迟恢复选中的项目，等待 preloadTabState 完成
      setTimeout(() => {
        // 如果是收藏 tab，需要选中收藏列表中的项目
        if (activeTab.value === 'bookmarked' && preloadedBookmarkedPaths.value.length > 0) {
          // 找到第一个在收藏列表中的项目
          const firstBookmarkedPath = preloadedBookmarkedPaths.value[0]
          const project = cachedProjects.find(p => p.path === firstBookmarkedPath)
          if (project) {
            selectedProject.value = project
            currentBranch.value = project.branch || 'unknown'
            debugLog('📌 [Store缓存] 收藏tab，自动选中:', project.name)
          }
        } else {
          // 恢复之前选中的项目
          const cachedSelected = storeGetSelectedProject(props.path)
          if (cachedSelected) {
            const project = cachedProjects.find(p => p.path === cachedSelected)
            if (project) {
              selectedProject.value = project
              currentBranch.value = project.branch || 'unknown'
            }
          }
        }
      }, 10) // 短暂延迟，等待 preloadTabState 设置 activeTab
    }
    
    // 🚀 先预加载选中项目路径
    preloadSelectedProjectPath(props.path || DEFAULT_SCAN_PATH)
    
    // 🚀 使用 setTimeout 延迟加载，让 UI 先渲染
    runDeferredProjectsLoad({ pathLabel: props.path })
  } else if (!props.path && !isLoadingProjects.value) {
    debugLog('🏠 onMounted: 没有 props.path，使用默认逻辑加载')
    isLoadingProjects.value = true
    
    // 🚀 使用 setTimeout 延迟加载，让 UI 先渲染
    runDeferredProjectsLoad()
  } else {
    debugLog('🏠 onMounted: watch 已处理加载，等待完成')
    loading.value = false
    
    if (!isLoadingProjects.value && projects.value.length > 0) {
      debugLog('🏠 onMounted: watch 已完成加载，尝试恢复项目')
      restoreSelectedProject()
    }
  }
  
  // 🚀 备选方案：从URL参数恢复选中的项目（如果还没有选中的项目）
  // 延迟执行，让其他恢复逻辑先执行
  setTimeout(() => {
    if (!selectedProject.value) {
      const projectParam = router.currentRoute.value.query.project
      if (projectParam) {
        const projectPath = decodeURIComponent(projectParam)
        const savedProject = findProjectByPath(projectPath)
        if (savedProject) {
          debugLog('🔄 从URL参数恢复选中的项目:', savedProject.name)
          selectedProject.value = savedProject
          currentBranch.value = savedProject.branch || 'unknown'
          scrollSelectedProjectIntoView()
          
          refreshProjectSummary(savedProject.path, savedProject.branch || 'unknown').catch(error => {
            console.error('❌ URL恢复项目时获取分支状态失败:', error)
          })
        } else {
          // 如果URL中的项目路径不存在，清除URL参数
          router.replace({ 
            path: '/', 
            query: { 
              ...router.currentRoute.value.query, 
              project: undefined 
            } 
          })
        }
      }
    }
  }, 500)
  
  // 添加右键菜单的全局点击监听
  document.addEventListener('click', hideContextMenu)
  
  // 🔄 添加窗口焦点事件监听器（用于自动刷新待定文件检查）
  if (window.electronAPI && window.electronAPI.onRefreshOnFocus) {
    window.electronAPI.onRefreshOnFocus(handleWindowFocusRefresh)
    debugLog('✅ [前端] 已注册窗口焦点刷新监听器')
    debugLog('🔍 [前端] 当前 selectedProject:', selectedProject.value ? `${selectedProject.value.name}` : 'null')
  } else {
    debugLog('⚠️ [前端] 无法注册窗口焦点刷新监听器')
  }
  
  // 🔧 注册分支状态缓存更新监听器
  if (window.electronAPI && window.electronAPI.onBranchStatusCacheUpdated) {
    window.electronAPI.onBranchStatusCacheUpdated(handleBranchStatusCacheUpdated)
    debugLog('✅ [前端] 已注册分支状态缓存更新监听器')
  } else {
    debugLog('⚠️ [前端] 无法注册分支状态缓存更新监听器')
  }
  
  // 🔧 注册项目列表更新监听器（后台扫描完成后更新）
  if (window.electronAPI && window.electronAPI.onProjectsUpdated) {
    window.electronAPI.onProjectsUpdated(handleProjectsUpdated)
    debugLog('✅ [前端] 已注册项目列表更新监听器')
  }
  
  // 🔄 添加窗口失去焦点事件监听器（用于清空冲突缓存）
  window.addEventListener('blur', handleWindowBlur)
  debugLog('✅ [前端] 已注册窗口失去焦点监听器')
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
  
  // 🔄 移除窗口焦点事件监听器
  if (window.electronAPI && window.electronAPI.removeRefreshOnFocusListener) {
    window.electronAPI.removeRefreshOnFocusListener(handleWindowFocusRefresh)
    debugLog('✅ 已移除窗口焦点刷新监听器')
  }
  
  // 🔧 移除分支状态缓存更新监听器
  if (window.electronAPI && window.electronAPI.removeBranchStatusCacheUpdatedListener) {
    window.electronAPI.removeBranchStatusCacheUpdatedListener(handleBranchStatusCacheUpdated)
    debugLog('✅ 已移除分支状态缓存更新监听器')
  }
  
  // 🔧 移除项目列表更新监听器
  if (window.electronAPI && window.electronAPI.removeProjectsUpdatedListener) {
    window.electronAPI.removeProjectsUpdatedListener(handleProjectsUpdated)
    debugLog('✅ 已移除项目列表更新监听器')
  }
  
  // 🔄 移除窗口失去焦点事件监听器
  window.removeEventListener('blur', handleWindowBlur)
  debugLog('✅ 已移除窗口失去焦点监听器')
})

</script>

<style scoped>
/* 项目详情容器 */
.project-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: #2d2d2d;
}

/* 头部区域 */
.header {
  flex-shrink: 0;
  padding: 12px 20px;
  background: #2d2d2d;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px 8px 0 0;
  min-height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 搜索框样式 */
.search-box {
  flex-shrink: 0;
  padding: 12px 20px;
  background: #2d2d2d;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  min-height: 60px;
  display: flex;
  align-items: center;
}

/* Tab和项目列表整体容器 */
.project-tab-container {
  flex: 1;
  margin-top: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #2d2d2d;
}

/* Tab导航样式 */
.project-tabs {
  flex-shrink: 0;
  display: flex;
  background: #2d2d2d;
  padding: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tab-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.tab-btn {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:last-child {
  border-right: none;
}

.tab-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

.tab-btn.active {
  color: #667eea;
  font-weight: 600;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
  margin: 0;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.25);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

/* 项目列表容器 */
.project-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  background: #2d2d2d;
}

/* 加载状态样式 */
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* 分支信息区域样式 */
.branch-info-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: 20px;
}

.current-branch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.current-branch-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.current-branch-inline.detached-head {
  color: #ff9800;
  font-weight: 500;
  font-style: italic;
}


/* 项目主要内容区域 */
.project-main-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  background: #2d2d2d;
}

/* 左右分栏容器 */
.content-wrapper {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  background: #2d2d2d;
}

/* 左侧分支面板 */
.branches-panel {
  width: 260px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
  height: 100%;
}

.branch-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #2d2d2d;
}

.branch-section:last-child {
  border-bottom: none;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}


.branch-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 40px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  line-height: 1.3;
}

.branch-section-header:hover {
  background: rgba(102, 126, 234, 0.15);
}

.branch-section-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.branch-section-title {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.toggle-icon {
  transition: transform 0.2s ease;
  color: rgba(255, 255, 255, 0.5);
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.branch-list {
  padding: 0 0 0px 0;
  background: #2d2d2d;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  min-height: 32px;
  color: rgba(255, 255, 255, 0.9) !important;
  background: #2d2d2d !important;
}

.branch-item:hover {
  background: rgba(102, 126, 234, 0.15) !important;
}

.branch-item.active {
  background: rgba(102, 126, 234, 0.25) !important;
  font-weight: 500;
}

.branch-item.selected {
  background: rgba(102, 126, 234, 0.2) !important;
  font-weight: 500;
}

/* 未选中的分支使用深色背景 */
.branch-item:not(.active):not(.selected) {
  background: #2d2d2d !important;
}

.branch-item:not(.active):not(.selected):hover {
  background: rgba(102, 126, 234, 0.15) !important;
}

.branch-item.remote-branch {
  color: rgba(255, 255, 255, 0.6);
}

.branch-name {
  flex: 1;
  word-wrap: break-word;
  word-break: break-all;
  white-space: normal;
  overflow-wrap: break-word;
  display: flex;
  align-items: center;
}


.push-indicator {
  background: #17a2b8;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
}

.pull-indicator {
  background: #ffc107;
  color: #000;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
}

.push-count-badge {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
  white-space: nowrap;
  pointer-events: none; /* 让点击事件穿透到父元素 */
}

.pull-count-badge {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.current-branch-status {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.branch-status-indicator {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.local-branch-tag {
  background: rgba(102, 126, 234, 0.3);
  color: #a5b4fc;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 4px;
  flex-shrink: 0;
  white-space: nowrap;
  pointer-events: none; /* 让点击事件穿透到父元素 */
}

.remote-indicator {
  font-size: 10px;
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
}

/* 右侧面板 */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #9ca3af;
  font-size: 13px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 文件树面板 */
.file-tree-section {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}


.file-status-button {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  min-height: 40px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  line-height: 1.3;
}

.file-status-button:hover {
  background: rgba(102, 126, 234, 0.15);
}

.file-status-button.active {
  background: rgba(102, 126, 234, 0.25);
  font-weight: 600;
}

.file-status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-status-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
}

/* 待定文件图标样式 */
.pending-files-icon-small {
  margin-left: 6px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
}

.pending-files-icon-inline {
  margin-left: 4px;
  color: rgba(255, 255, 255, 0.5);
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.header-top {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}

/* 项目名称样式 */
.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: color 0.1s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header h1:hover {
  color: #667eea;
}


/* 远程分支按钮样式 */
.remote-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease;
}

/* 分支区域操作按钮样式 */
.branch-section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.refresh-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

.refresh-btn:disabled {
  background: rgba(255, 255, 255, 0.16);
  cursor: not-allowed;
  opacity: 0.7;
}

.refresh-btn.refreshing {
  background: rgba(255, 255, 255, 0.16);
}

.refresh-btn.success {
  background: var(--theme-sem-accent-success-strong);
  transition: background-color 0.3s ease;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.remote-btn:hover {
  background: #0056b3;
}

.remote-btn:disabled {
  background: #adb5bd;
  cursor: not-allowed;
}

/* 分支列表样式增强 */
.branch-section-title {
  font-weight: bold;
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 远程分支样式 - 不使用左侧边框 */
.remote-branch {
  background: #2d2d2d !important;
}

/* 标签样式 - 不使用左侧边框 */
.tag-item {
  background: #2d2d2d !important;
}

.tag-item:hover {
  background: rgba(102, 126, 234, 0.15) !important;
}

.remote-tag-indicator {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  margin-left: auto;
}

.empty-tags {
  padding: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  font-style: italic;
  background: #2d2d2d;
}

.detached-head-item {
  border-left: 3px solid #ff9800;
  background: rgba(255, 152, 0, 0.15) !important;
}

.detached-head-item:hover {
  background: rgba(255, 152, 0, 0.25) !important;
}

.detached-head-item.active {
  background: rgba(255, 152, 0, 0.35) !important;
  font-weight: 500;
}

.detached-head-badge {
  background: #ff9800;
  color: #1e1e1e;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 9px;
  font-weight: 500;
  margin-left: auto;
  text-transform: uppercase;
}

.remote-indicator {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 9px;
  font-weight: 500;
  margin-left: auto;
}

/* 分支选择框样式 */
.branch-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: border-color 0.2s ease;
  margin-bottom: 12px;
}

.branch-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

/* 状态加载指示器样式 */
.status-loading {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin-left: 4px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 头部操作按钮样式 */
.header-actions {
  display: flex;
  gap: 4px;
}

.gitlab-open-btn {
  background: #fc6d26;
  color: white;
  border-color: #fc6d26;
}

.gitlab-open-btn:hover {
  background: #e55b1f;
  border-color: #e55b1f;
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
  background: #2d2d2d;
  border-radius: 12px;
  padding: 0;
  min-width: 450px;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.dialog-header-simple {
  padding: 24px 24px 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.dialog-header-simple h3 {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}

.dialog-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

.branch-select {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.branch-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.branch-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease;
}

.branch-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.mr-description {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  resize: vertical;
  min-height: 60px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.mr-description:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

/* Combobox样式 */
.combobox-container {
  position: relative;
  width: 100%;
}

.combobox-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease;
  cursor: text;
}

.combobox-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.combobox-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-top: none;
  border-radius: 0 0 8px 8px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.combobox-option {
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
}

.combobox-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.combobox-option.highlighted {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
}

.combobox-option:last-child {
  border-bottom: none;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 20px 24px 24px 24px;
  background: rgba(255, 255, 255, 0.05);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn-large {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 500;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.cancel-btn-large:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.confirm-btn-large {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 500;
  border: none;
  background: #007bff;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  min-width: 100px;
}

.confirm-btn-large:hover:not(:disabled) {
  background: #0056b3;
}

.confirm-btn-large:disabled {
  background: #adb5bd;
  cursor: not-allowed;
}

.delete-btn-large {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 500;
  border: none;
  background: #dc3545;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  min-width: 100px;
}

.delete-btn-large:hover {
  background: #c82333;
}

.delete-branch-info p {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
}

.merge-branch-info p {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
}


@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 容器布局 */
.container {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  flex: 1 1 0%;
  background: #2d2d2d;
}

/* 左侧项目列表样式 */
.sidebar {
  width: 280px;
  min-width: 250px;
  background: #2d2d2d;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}

/* 右侧主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding-left: 12px; /* 距离左侧tab 12px */
  box-sizing: border-box;
  background: #2d2d2d;
}

/* 项目列表样式 */
.project-group {
  margin-bottom: 0px;
}

.group-title {
  font-size: 14px;
  font-weight: 700;
  color: #667eea;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 12px 12px 8px;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
}

.project-item {
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  min-height: 32px;
  border: none;
  border-radius: 0;
  margin: 0;
  background: #2d2d2d;
}

.project-item:hover {
  background: rgba(102, 126, 234, 0.15);
  transform: none;
  box-shadow: none;
}

.project-item.active {
  background: rgba(102, 126, 234, 0.25);
  font-weight: 500;
  transform: none;
  box-shadow: none;
}

/* 确保选中项目的分支信息保持原有颜色 */
.project-item.active .branch-info,
.project-item.active .branch-name {
  color: rgba(255, 255, 255, 0.6) !important;
}

.project-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

.project-name {
  font-weight: 600;
  color: #fff;
  font-size: 15px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-files-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
  flex-shrink: 0;
  margin-right: 4px;
  transition: all 0.2s ease;
}

.pending-files-icon:hover {
  color: rgba(255, 255, 255, 0.7);
}

.push-count {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.push-count-number {
  color: var(--theme-sem-accent-success);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.branch-name {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.pull-count {
  color: var(--theme-sem-accent-warning);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 4px;
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  background: var(--theme-sem-bg-menu);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  min-width: 120px;
  overflow: hidden;
  padding: 6px 0;
}

.context-menu-item {
  margin: 0 6px;
  padding: 9px 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  transition: background-color 0.2s ease;
  user-select: none;
  border-radius: 8px;
}

.context-menu-item:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.context-menu-item.disabled {
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
  opacity: 0.6;
}

.context-menu-item.disabled:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
}

/* 统一按钮样式 */
.create-btn,
.pull-single-btn,
.push-single-btn,
.mr-single-btn,
.gitlab-open-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  height: 32px;
  box-sizing: border-box;
}

/* 分支操作按钮容器样式 */
.branch-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.create-btn:hover {
  background: var(--theme-sem-hover);
  border-color: rgba(255, 255, 255, 0.2);
}

.pull-single-btn {
  background: var(--theme-sem-warning-bg);
  color: var(--theme-sem-accent-warning);
  border-color: transparent;
}

.pull-single-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-warning-bg) 82%, white 18%);
  border-color: transparent;
}

.push-single-btn {
  background: var(--theme-sem-success-bg);
  color: white;
  border-color: transparent;
}

.push-single-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-success-bg) 82%, white 18%);
  border-color: transparent;
}

/* 按钮内的计数徽标 */
.pull-count-badge,
.push-count-badge {
  background: #6c757d;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  margin-left: 4px;
}

.pull-single-btn .pull-count-badge {
  background: rgba(0, 0, 0, 0.1);
  color: #000;
}

/* MR按钮颜色 */
.mr-single-btn {
  background: #6f42c1;
  color: white;
  border-color: #6f42c1;
}

.mr-single-btn:hover {
  background: #5a32a3;
  border-color: #5a32a3;
}

/* 滚动条样式 - 最小化 */
.project-list-container,
.branches-panel,
.combobox-dropdown {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.project-list-container::-webkit-scrollbar,
.branches-panel::-webkit-scrollbar,
.combobox-dropdown::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

.project-list-container::-webkit-scrollbar-track,
.branches-panel::-webkit-scrollbar-track,
.combobox-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.project-list-container::-webkit-scrollbar-thumb,
.branches-panel::-webkit-scrollbar-thumb,
.combobox-dropdown::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1.5px;
}

.project-list-container::-webkit-scrollbar-corner,
.branches-panel::-webkit-scrollbar-corner,
.combobox-dropdown::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
