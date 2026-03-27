/**
 * 项目数据管理 Store
 * 统一管理所有项目的状态数据，避免重复请求，支持跨组件共享
 */
import { ref, reactive, computed } from 'vue'

// ==================== 单例状态 ====================
// 使用模块级变量确保全局单例

// 项目列表（按扫描路径分组）
const projectsByPath = reactive({})

// 项目详情缓存（key: projectPath）
const projectDetails = reactive({})

// 分支状态缓存（key: projectPath）
const branchStatusCache = reactive({})

// 当前选中的项目路径（按扫描路径分组）
const selectedProjectPaths = reactive({})

// 加载状态
const loadingStates = reactive({})

// ==================== 项目详情数据结构 ====================
/**
 * 创建项目详情对象
 * @param {string} path - 项目路径
 * @returns {Object} 项目详情对象
 */
const createProjectDetail = (path) => ({
  path,
  name: path.split('/').pop(),
  currentBranch: '',
  localBranches: [],
  remoteBranches: [],
  tags: [],
  branchStatus: null,        // { remoteAhead, localAhead, hasConflicts }
  allBranchStatus: {},       // 所有分支的状态
  pendingFiles: 0,
  gitlabUrl: '',
  lastUpdated: null,
  isLoading: false
})

// ==================== Store 方法 ====================

/**
 * 获取或创建项目详情
 */
const getProjectDetail = (projectPath) => {
  if (!projectDetails[projectPath]) {
    projectDetails[projectPath] = createProjectDetail(projectPath)
  }
  return projectDetails[projectPath]
}

/**
 * 更新项目详情
 */
const updateProjectDetail = (projectPath, updates) => {
  const detail = getProjectDetail(projectPath)
  Object.assign(detail, updates, { lastUpdated: Date.now() })
}

/**
 * 更新分支状态
 */
const updateBranchStatus = (projectPath, status) => {
  branchStatusCache[projectPath] = {
    ...status,
    lastUpdated: Date.now()
  }
  
  // 同时更新项目详情中的状态
  if (projectDetails[projectPath]) {
    projectDetails[projectPath].branchStatus = status
  }
}

/**
 * 更新所有分支状态
 */
const updateAllBranchStatus = (projectPath, allStatus) => {
  if (projectDetails[projectPath]) {
    projectDetails[projectPath].allBranchStatus = allStatus
  }
}

/**
 * 获取分支状态（带缓存时效检查）
 */
const getBranchStatus = (projectPath, maxAge = 30000) => {
  const cached = branchStatusCache[projectPath]
  if (cached && (Date.now() - cached.lastUpdated) < maxAge) {
    return cached
  }
  return null
}

/**
 * 设置项目列表
 */
const setProjects = (scanPath, projects) => {
  projectsByPath[scanPath] = projects
}

/**
 * 获取项目列表
 */
const getProjects = (scanPath) => {
  return projectsByPath[scanPath] || []
}

/**
 * 设置选中的项目
 */
const setSelectedProject = (scanPath, projectPath) => {
  selectedProjectPaths[scanPath] = projectPath
}

/**
 * 获取选中的项目
 */
const getSelectedProject = (scanPath) => {
  return selectedProjectPaths[scanPath]
}

/**
 * 清除项目缓存
 */
const clearProjectCache = (projectPath) => {
  delete projectDetails[projectPath]
  delete branchStatusCache[projectPath]
}

/**
 * 清除扫描路径下所有项目缓存
 */
const clearAllCache = (scanPath) => {
  const projects = projectsByPath[scanPath] || []
  projects.forEach(p => {
    delete projectDetails[p.path]
    delete branchStatusCache[p.path]
  })
  delete projectsByPath[scanPath]
  delete selectedProjectPaths[scanPath]
}

/**
 * 设置加载状态
 */
const setLoading = (key, loading) => {
  loadingStates[key] = loading
}

/**
 * 获取加载状态
 */
const isLoading = (key) => {
  return loadingStates[key] || false
}

// ==================== 异步操作封装 ====================

/**
 * 加载项目分支信息
 */
const loadProjectBranches = async (projectPath) => {
  if (!window.electronAPI) return null
  
  const loadingKey = `branches_${projectPath}`
  if (loadingStates[loadingKey]) return null
  
  setLoading(loadingKey, true)
  
  try {
    const result = await window.electronAPI.getBranchList({ path: projectPath })
    
    if (result.success) {
      updateProjectDetail(projectPath, {
        localBranches: result.data?.local || [],
        remoteBranches: result.data?.remote || [],
        currentBranch: result.data?.current || ''
      })
      return result.data
    }
  } catch (error) {
    console.error('加载分支信息失败:', error)
  } finally {
    setLoading(loadingKey, false)
  }
  
  return null
}

/**
 * 加载项目分支状态（ahead/behind）
 */
const loadBranchStatus = async (projectPath) => {
  if (!window.electronAPI) return null
  
  const loadingKey = `status_${projectPath}`
  if (loadingStates[loadingKey]) return null
  
  setLoading(loadingKey, true)
  
  try {
    const result = await window.electronAPI.getBranchInfo({ path: projectPath })
    
    if (result.success && result.data) {
      const status = {
        remoteAhead: result.data.remoteAhead || 0,
        localAhead: result.data.localAhead || 0,
        hasConflicts: result.data.hasConflicts || false
      }
      
      updateBranchStatus(projectPath, status)
      
      if (result.data.allBranchStatus) {
        updateAllBranchStatus(projectPath, result.data.allBranchStatus)
      }
      
      return status
    }
  } catch (error) {
    console.error('加载分支状态失败:', error)
  } finally {
    setLoading(loadingKey, false)
  }
  
  return null
}

/**
 * 加载项目标签
 */
const loadProjectTags = async (projectPath) => {
  if (!window.electronAPI) return null
  
  try {
    const result = await window.electronAPI.getTagList({ path: projectPath })
    
    if (result.success) {
      updateProjectDetail(projectPath, {
        tags: result.data || []
      })
      return result.data
    }
  } catch (error) {
    console.error('加载标签失败:', error)
  }
  
  return null
}

/**
 * 刷新项目完整状态（分支 + 状态）
 */
const refreshProject = async (projectPath) => {
  const [branches, status] = await Promise.all([
    loadProjectBranches(projectPath),
    loadBranchStatus(projectPath)
  ])
  
  return { branches, status }
}

// ==================== Composable Hook ====================

/**
 * 使用项目 Store 的 composable
 * @param {string} scanPath - 可选，当前扫描路径
 */
export function useProjectStore(scanPath = null) {
  // 当前扫描路径下的项目列表
  const projects = computed(() => scanPath ? getProjects(scanPath) : [])
  
  // 当前选中的项目路径
  const selectedPath = computed(() => scanPath ? getSelectedProject(scanPath) : null)
  
  // 当前选中的项目详情
  const selectedDetail = computed(() => {
    const path = selectedPath.value
    return path ? getProjectDetail(path) : null
  })
  
  return {
    // 状态
    projects,
    selectedPath,
    selectedDetail,
    projectsByPath,
    projectDetails,
    branchStatusCache,
    
    // 方法
    getProjectDetail,
    updateProjectDetail,
    updateBranchStatus,
    updateAllBranchStatus,
    getBranchStatus,
    setProjects,
    getProjects,
    setSelectedProject,
    getSelectedProject,
    clearProjectCache,
    clearAllCache,
    setLoading,
    isLoading,
    
    // 异步操作
    loadProjectBranches,
    loadBranchStatus,
    loadProjectTags,
    refreshProject
  }
}

// 导出单例方法供直接使用
export {
  getProjectDetail,
  updateProjectDetail,
  updateBranchStatus,
  updateAllBranchStatus,
  getBranchStatus,
  setProjects,
  getProjects,
  setSelectedProject,
  getSelectedProject,
  clearProjectCache,
  clearAllCache,
  loadProjectBranches,
  loadBranchStatus,
  loadProjectTags,
  refreshProject,
  projectsByPath,
  projectDetails,
  branchStatusCache
}

