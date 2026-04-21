<template>
  <div class="remote-repo-page">
    <!-- 左侧：GitLab 地址列表 -->
    <div class="config-sidebar">
      <div class="sidebar-header">
        <h2>远端仓库</h2>
      </div>
      <div class="sidebar-menu">
        <div 
          v-for="(config, index) in gitlabHistory" 
          :key="index"
          class="sidebar-item"
          :class="{ active: selectedGitlabIndex === index && !showAddConfig }"
          @click="selectGitlabConfig(index)"
        >
          <img 
            v-if="config.favicon && config.platform !== 'github' && config.platform !== 'gitee'" 
            :src="config.favicon" 
            class="config-favicon"
            @error="handleFaviconError($event, config)"
          />
          <span v-else-if="config.platform === 'github'" class="config-favicon-placeholder">🐙</span>
          <span v-else-if="config.platform === 'gitee'" class="config-favicon-placeholder">🔴</span>
          <span v-else class="config-favicon-placeholder">🦊</span>
          <span class="config-url">{{ extractDomain(config.url) }}</span>
          <button 
            class="delete-config-btn"
            @click.stop="deleteGitlabHistory(index)"
            title="删除此配置"
          >
            ✕
          </button>
        </div>
        <div v-if="gitlabHistory.length === 0" class="empty-sidebar">
          <span>暂无配置</span>
        </div>
      </div>
    </div>

    <!-- 右侧：内容区 -->
    <div class="config-content">
      <!-- 右侧 Header -->
      <div class="content-header">
        <h3>{{ currentGitlabTitle }}</h3>
        <div class="header-actions">
          <!-- 全局搜索项目 -->
          <div v-if="testResult && testResult.success && !showAddConfig" class="global-search-box">
            <div class="search-input-wrapper">
              <input 
                type="text" 
                v-model="globalSearchQuery"
                placeholder="搜索所有项目..."
                class="global-search-input"
                @keyup.enter="searchProjects"
              />
              <button 
                v-if="globalSearchQuery"
                @click="clearSearchResults"
                class="clear-input-btn"
                title="清除"
              >
                ✕
              </button>
            </div>
            <button 
              @click="searchProjects"
              :disabled="!globalSearchQuery.trim()"
              class="global-search-btn"
            >
              🔍
            </button>
          </div>
          <button 
            class="add-config-btn"
            @click="toggleAddConfig"
          >
            {{ showAddConfig ? '取消' : '新增配置' }}
          </button>
        </div>
      </div>

      <!-- 配置表单区域（新增配置或无配置时显示） -->
      <div v-if="showAddConfig || gitlabHistory.length === 0" class="config-form-area">
        <div class="config-form">
          <!-- 平台选择器 -->
          <div class="form-group">
            <label>平台类型</label>
            <div class="platform-selector">
              <button
                class="platform-btn"
                :class="{ active: form.platform === 'gitlab' }"
                @click="form.platform = 'gitlab'"
                :disabled="loading"
              >
                <span class="platform-icon">🦊</span>
                GitLab
              </button>
              <button
                class="platform-btn"
                :class="{ active: form.platform === 'github' }"
                @click="form.platform = 'github'"
                :disabled="loading"
              >
                <span class="platform-icon">🐙</span>
                GitHub
              </button>
              <button
                class="platform-btn"
                :class="{ active: form.platform === 'gitee' }"
                @click="form.platform = 'gitee'"
                :disabled="loading"
              >
                <span class="platform-icon">🔴</span>
                Gitee
              </button>
            </div>
          </div>

          <div class="form-group" v-if="form.platform === 'gitlab'">
            <label for="gitlabUrl">GitLab 地址</label>
            <input 
              id="gitlabUrl"
              v-model="form.gitlabUrl"
              type="url"
              placeholder="例如: https://gitlab.example.com"
              :disabled="loading"
            />
          </div>
          
          <div class="form-group">
            <label for="accessToken">访问令牌 (Token)</label>
            <input 
              id="accessToken"
              v-model="form.accessToken"
              type="password"
              :placeholder="form.platform === 'github' ? '输入您的GitHub Personal Access Token' : (form.platform === 'gitee' ? '输入您的Gitee私人令牌' : '输入您的GitLab访问令牌')"
              :disabled="loading"
            />
            <div class="help-text" v-if="form.platform === 'gitlab'">
              <p>💡 如何获取Token：</p>
              <ol>
                <li>登录您的GitLab账户</li>
                <li>进入 Settings → Access Tokens</li>
                <li>创建新的访问令牌，权限勾选 <strong class="permission-highlight">api</strong>（完整API访问）</li>
                <li>复制生成的令牌并粘贴到此处</li>
              </ol>
            </div>
            <div class="help-text" v-else-if="form.platform === 'github'">
              <p>💡 如何获取Token：</p>
              <ol>
                <li>登录您的GitHub账户</li>
                <li>进入 Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
                <li>点击 Generate new token (classic)</li>
                <li>勾选 <strong class="permission-highlight">repo</strong>（完整仓库访问）权限</li>
                <li>复制生成的令牌并粘贴到此处</li>
              </ol>
            </div>
            <div class="help-text" v-else>
              <p>💡 如何获取Token：</p>
              <ol>
                <li>登录您的Gitee账户</li>
                <li>进入 设置 → 私人令牌</li>
                <li>点击 生成新令牌</li>
                <li>勾选 <strong class="permission-highlight">projects</strong>（项目）和 <strong class="permission-highlight">user_info</strong>（用户信息）权限</li>
                <li>复制生成的令牌并粘贴到此处</li>
              </ol>
            </div>
            <!-- SSH Key 配置提醒 -->
            <div class="ssh-key-warning">
              <p>⚠️ <strong>重要提醒：</strong>克隆仓库前请确保已配置 SSH Key</p>
              <p>请先在本地生成 SSH Key 并添加到您的 {{ form.platform === 'github' ? 'GitHub' : (form.platform === 'gitee' ? 'Gitee' : 'GitLab') }} 账户中，否则克隆操作将会失败。</p>
            </div>
          </div>
          
          <div class="form-actions">
            <button 
              @click="testConnection"
              :disabled="!canTestConnection || loading"
              class="test-btn"
            >
              {{ loading ? '连接中...' : (form.platform === 'gitlab' ? '连接并查看Groups' : '连接并查看Organizations') }}
            </button>
          </div>
        </div>
        
        <!-- 错误信息 -->
        <div v-if="testResult && !testResult.success" class="test-result error">
          <h4>❌ {{ testResult.message }}</h4>
          <p v-if="testResult.details">{{ testResult.details }}</p>
        </div>
      </div>

      <!-- Groups 和项目列表区域 -->
      <div v-else class="groups-projects-area">
        <!-- 加载状态 -->
        <div v-if="loading && !testResult" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载配置...</p>
        </div>
        
        <div v-else class="two-column-layout">
      
      <!-- 第二列：GitLab Groups选择区域 -->
      <div v-if="testResult && testResult.success" class="column-2">
        <div class="groups-section">
          <div v-if="groups.length > 0" class="groups-list">
            <div 
              v-for="group in groups" 
              :key="group.id"
              class="group-item-container"
            >
              <div 
                class="group-item"
                :class="{ 'selected': selectedGroup?.id === group.id }"
                @click="selectGroup(group)"
              >
                <div class="group-main">
                  <div class="group-info">
                    <h4>{{ group.name }}</h4>
                  </div>
                </div>
                <div class="group-actions">
                  <button 
                    @click.stop="cloneGroup(group)"
                    :disabled="loading"
                    class="clone-group-btn"
                  >
                    开始克隆
                  </button>
                </div>

              </div>
              
              <!-- 展开的详情显示 - 一级group的子Groups默认显示，除非被收起 -->
              <div 
                v-if="groupDetails[group.id] && groupDetails[group.id].subgroups && groupDetails[group.id].subgroups.length > 0 && !collapsedGroupIds.has(group.id)"
                class="group-details"
              >
                <!-- 子Groups（支持递归展开） -->
                <div class="subgroups-header">
                  <span class="subgroups-title">子Groups ({{ groupDetails[group.id].subgroups.length }})</span>
                  <button
                    @click.stop="collapseGroup(group)"
                    class="collapse-text-btn"
                    title="收起"
                  >
                    收起
                  </button>
                </div>
                <div v-if="groupDetails[group.id].subgroups && groupDetails[group.id].subgroups.length > 0" class="subgroups">
                  <div class="subgroups-list">
                    <div 
                      v-for="subgroup in groupDetails[group.id].subgroups" 
                      :key="subgroup.id"
                      class="subgroup-item-container"
                    >
                      <div class="subgroup-item" 
                           @click="selectGroup(subgroup)"
                           :class="{ 'selected': selectedGroup?.id === subgroup.id }">
                        <div class="subgroup-main">
                          <div class="subgroup-info">
                            <h4>{{ subgroup.name }}</h4>
                          </div>
                        </div>
                        <div class="subgroup-actions">
                          <button 
                            @click.stop="cloneSubGroup(subgroup)"
                            :disabled="loading"
                            class="clone-subgroup-btn"
                          >
                            克隆子Group
                          </button>
                        </div>
                      </div>
                      
                      <!-- 递归显示子Groups的展开内容 - 只有当有子Groups时才显示，并且组处于展开状态 -->
                      <div 
                        v-if="groupDetails[subgroup.id] && groupDetails[subgroup.id].subgroups && groupDetails[subgroup.id].subgroups.length > 0 && expandedGroups.has(subgroup.id)"
                        class="nested-group-details"
                      >
                        <!-- 子Groups（递归展示） -->
                        <div class="subgroups-header">
                          <span class="subgroups-title">子Groups ({{ groupDetails[subgroup.id].subgroups.length }})</span>
                          <button
                            @click.stop="collapseSubGroup(subgroup)"
                            class="collapse-text-btn"
                            title="收起"
                          >
                            收起
                          </button>
                        </div>
                        <div v-if="groupDetails[subgroup.id].subgroups && groupDetails[subgroup.id].subgroups.length > 0" class="nested-subgroups">
                          <div class="nested-subgroups-list">
                            <div 
                              v-for="nestedSubgroup in groupDetails[subgroup.id].subgroups" 
                              :key="nestedSubgroup.id"
                              class="nested-subgroup-item"
                            >
                              <div class="nested-subgroup-content" @click="selectGroup(nestedSubgroup)">
                                <div class="nested-subgroup-name">{{ nestedSubgroup.name }}</div>
                                <div class="nested-subgroup-meta">
                                  <span class="nested-subgroup-path">{{ nestedSubgroup.full_path }}</span>
                                  <span class="nested-subgroup-count" v-if="nestedSubgroup.projects_count > 0">{{ nestedSubgroup.projects_count }} 项目</span>
                                </div>
                              </div>
                                <div class="nested-subgroup-actions">
                                <button 
                                  @click.stop="cloneSubGroup(nestedSubgroup)"
                                  :disabled="loading"
                                  class="clone-nested-subgroup-btn"
                                >
                                  克隆
                                </button>
                              </div>
                              
                              <!-- 递归显示更深层的子Groups - 只有当有子Groups时才显示，并且组处于展开状态 -->
                              <div 
                                v-if="groupDetails[nestedSubgroup.id] && groupDetails[nestedSubgroup.id].subgroups && groupDetails[nestedSubgroup.id].subgroups.length > 0 && expandedGroups.has(nestedSubgroup.id)"
                                class="deep-nested-group-details"
                              >
                                <!-- 更深层的子Groups -->
                                <div class="subgroups-header">
                                  <span class="subgroups-title">子Groups ({{ groupDetails[nestedSubgroup.id].subgroups.length }})</span>
                                  <button
                                    @click.stop="collapseSubGroup(nestedSubgroup)"
                                    class="collapse-text-btn"
                                    title="收起"
                                  >
                                    收起
                                  </button>
                                </div>
                                <div v-if="groupDetails[nestedSubgroup.id].subgroups && groupDetails[nestedSubgroup.id].subgroups.length > 0" class="deep-nested-subgroups">
                                  <div class="deep-nested-subgroups-list">
                                    <div 
                                      v-for="deepSubgroup in groupDetails[nestedSubgroup.id].subgroups" 
                                      :key="deepSubgroup.id"
                                      class="deep-nested-subgroup-item"
                                    >
                                      <div class="deep-nested-subgroup-content" @click="selectGroup(deepSubgroup)">
                                        <div class="deep-nested-subgroup-name">{{ deepSubgroup.name }}</div>
                                        <div class="deep-nested-subgroup-meta">
                                          <span class="deep-nested-subgroup-path">{{ deepSubgroup.full_path }}</span>
                                          <span class="deep-nested-subgroup-count" v-if="deepSubgroup.projects_count > 0">{{ deepSubgroup.projects_count }} 项目</span>
                                        </div>
                                      </div>
                                      <div class="deep-nested-subgroup-action">
                                        <button 
                                          @click.stop="cloneSubGroup(deepSubgroup)"
                                          :disabled="loading"
                                          class="clone-deep-nested-subgroup-btn"
                                        >
                                          克隆
                                        </button>
                                      </div>
                                    </div>
                                      </div>
                                    </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>


                  </div>
                </div>
                
                <!-- 占位图标显示（如果在加载中）） -->
                <div v-if="loading" class="loading-details">
                  <p>正在加载...</p>
                </div>
                
                <!-- 为空的情况 -->
                <div 
                  v-if="!loading && 
                        (!groupDetails[group.id].subgroups || groupDetails[group.id].subgroups.length === 0)"
                  class="empty-details"
                >
                  <p>该Group下没有子Groups</p>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="no-groups">
            <p>没有找到可访问的GitLab Groups</p>
          </div>
         </div>
      </div>
      

      <!-- 第三列：项目列表区域 -->
      <div v-if="testResult && testResult.success" class="column-3">
        <div class="projects-section">
          <div v-if="projectsForSelectedGroup.length > 0 || selectedProjects.size > 0" class="projects-toolbar">
            <div v-if="projectsForSelectedGroup.length > 0" class="search-box">
              <input 
                type="text" 
                v-model="projectSearchQuery"
                placeholder="搜索项目..."
                class="search-input"
              />
            </div>
            <div v-if="selectedProjects.size > 0" class="batch-actions">
              <span class="selected-count">已选择 {{ selectedProjects.size }} 项</span>
              <button 
                @click="cloneSelectedProjects"
                :disabled="loading"
                class="batch-clone-btn"
              >
                批量克隆
              </button>
            </div>
          </div>
          <!-- 搜索中状态 -->
          <div v-if="searchingProjects" class="loading-projects">
            <div class="loading-content">
              <div class="loading-spinner"></div>
              <p>正在搜索项目...</p>
            </div>
          </div>
          <!-- 搜索结果显示区域 -->
          <div v-else-if="showSearchResults" class="search-results-section">
            <div class="search-results-info">
              <span>🔍 搜索结果 ({{ searchResults.length }})</span>
            </div>
            <div v-if="searchResults.length > 0" class="projects-list">
              <div 
                v-for="project in searchResults" 
                :key="project.id"
                class="project-item"
                @click="selectProject(project)"
              >
                <div class="project-checkbox">
                  <input 
                    type="checkbox" 
                    :checked="selectedProjects.has(project.id)"
                    @click.stop="toggleProjectSelection(project.id)"
                  />
                </div>
                <div class="project-info">
                  <h5>{{ project.name }}</h5>
                  <p v-if="project.description">{{ project.description }}</p>
                  <div class="project-stats">
                    <span>{{ project.name_with_namespace || project.path_with_namespace }}</span>
                    <span v-if="project.default_branch" class="branch">分支: {{ project.default_branch }}</span>
                  </div>
                </div>
                <div class="project-actions">
                  <button 
                    @click.stop="openProjectInGitlab(project)"
                    class="gitlab-btn"
                    title="在远端仓库中打开"
                  >
                    🔗
                  </button>
                  <button 
                    @click.stop="cloneProject(project)"
                    :disabled="loading"
                    class="clone-project-btn"
                  >
                    克隆项目
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="no-projects">
              <p>没有找到匹配的项目</p>
            </div>
          </div>
          <!-- 正常的项目列表显示 -->
          <div v-else-if="!selectedGroupForProjects" class="no-project-selected">
            <p>请选择一个Group查看其项目列表</p>
          </div>
          <div v-else-if="loadingProjects" class="loading-projects">
            <div class="loading-content">
              <div class="loading-spinner"></div>
              <p>正在加载项目...</p>
            </div>
          </div>
          <div v-else-if="filteredProjects.length > 0" class="projects-list">
            <div 
              v-for="project in filteredProjects" 
              :key="project.id"
              class="project-item"
              @click="selectProject(project)"
            >
              <div class="project-checkbox">
                <input 
                  type="checkbox" 
                  :checked="selectedProjects.has(project.id)"
                  @click.stop="toggleProjectSelection(project.id)"
                />
              </div>
              <div class="project-info">
                <h5>{{ project.name }}</h5>
                <p v-if="project.description">{{ project.description }}</p>
                <div class="project-stats">
                  <span>{{ project.name_with_namespace }}</span>
                  <span v-if="project.default_branch" class="branch">分支: {{ project.default_branch }}</span>
                </div>
              </div>
              <div class="project-actions">
                <button 
                  @click.stop="openProjectInGitlab(project)"
                  class="gitlab-btn"
                  title="在 GitLab 中打开"
                >
                  🔗
                </button>
                <button 
                  @click.stop="cloneProject(project)"
                  :disabled="loading"
                  class="clone-project-btn"
                >
                  克隆项目
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="projectsForSelectedGroup.length > 0 && filteredProjects.length === 0" class="no-projects">
            <p>没有找到匹配的项目</p>
          </div>
          <div v-else class="no-projects">
            <p>该Group下没有项目</p>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>

    <!-- 克隆进度弹框 -->
    <CloneProgressDialog
      :show="cloneProgress.show"
      :current="cloneProgress.current"
      :total="cloneProgress.total"
      :completed="cloneProgress.completed"
      :git-output="gitOutput"
      @close="cancelClone"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import CloneProgressDialog from '../dialog/CloneProgressDialog.vue'
import { useConfirm } from '../../composables/useConfirm.js'

const router = useRouter()
const { confirm } = useConfirm()

// 定义事件
const emit = defineEmits(['navigate'])

// 表单数据
const form = ref({
  platform: 'gitlab', // 'gitlab' 或 'github'
  gitlabUrl: '',
  accessToken: '',
  localPath: '',
  cloneAll: true
})

// 状态管理
const loading = ref(false)
const loadingProjects = ref(false) // 项目列表加载状态
const testResult = ref(null)

// Group缓存相关状态
const groupCache = ref({}) // GitLab地址为key的缓存 {[gitlabUrl]: {groups, groupDetails}}
const groups = ref([])
const selectedGroup = ref(null)
const expandedGroups = ref(new Set()) // 展开的Group ID集合
const collapsedGroupIds = ref(new Set()) // 手动收起的一级Group ID集合
const groupDetails = ref({}) // Group详情缓存 {groupId: {subgroups, projects}}
const selectedGroupForProjects = ref(null) // 当前查看项目的Group
const projectsForSelectedGroup = ref([]) // 选中Group的项目列表
const selectedProject = ref(null) // 当前选中的项目
const selectedProjects = ref(new Set()) // 勾选的项目ID集合
const projectSearchQuery = ref('') // 项目搜索关键词
const globalSearchQuery = ref('') // 全局搜索关键词
const searchingProjects = ref(false) // 搜索进行中
const showSearchResults = ref(false) // 是否显示搜索结果
const searchResults = ref([]) // 搜索结果列表
const savedConfigs = ref([])
const gitlabHistory = ref([]) // 已保存的配置列表
const showHistoryDropdown = ref(false) // 控制历史下拉框显示
const showAddConfig = ref(false) // 是否显示新增配置表单
const selectedGitlabIndex = ref(-1) // 当前选中的 GitLab 配置索引
const cloneProgress = ref({
  show: false,
  current: 0,
  total: 0,
  completed: [],
  gitOutput: ''
})

// 计算属性 - 检查group是否有子groups
const hasSubGroups = (group) => {
  // 如果已经有缓存的详情，直接检查
  if (groupDetails.value[group.id]) {
    return groupDetails.value[group.id].subgroups && groupDetails.value[group.id].subgroups.length > 0
  }
  // 否则根据GitLab API返回的数据判断（如果projects_count > 0或name中包含'/'表示可能有子groups）
  return group.projects_count > 0 && group.name.includes('/')
}

// 克隆取消状态
const cloneCancelled = ref(false)

// 定时器管理
let autoCloseTimer = null
const cancelAutoCloseTimer = () => {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
    console.log('🕐 已取消自动关闭定时器')
  }
}

// Git命令输出
const gitOutput = ref('')

// 计算属性
const canTestConnection = computed(() => {
  if (form.value.platform === 'github' || form.value.platform === 'gitee') {
    return form.value.accessToken
  }
  return form.value.gitlabUrl && form.value.accessToken
})

// 当前选中的 GitLab 标题
const currentGitlabTitle = computed(() => {
  if (showAddConfig.value) {
    return '新增配置'
  }
  if (selectedGitlabIndex.value >= 0 && gitlabHistory.value[selectedGitlabIndex.value]) {
    return gitlabHistory.value[selectedGitlabIndex.value].url
  }
  return '选择或新增配置'
})

// 从 URL 提取域名
const extractDomain = (url) => {
  if (!url) return ''
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return url
  }
}

// 处理 favicon 加载失败
const handleFaviconError = (event, config) => {
  event.target.style.display = 'none'
  config.favicon = null
}

// 获取并保存 favicon
const fetchAndSaveFavicon = async (url) => {
  if (!url) return null
  try {
    const urlObj = new URL(url)
    const faviconUrl = `${urlObj.origin}/favicon.ico`
    
    // 尝试获取 favicon
    const response = await fetch(faviconUrl, { mode: 'no-cors' })
    if (response.ok || response.type === 'opaque') {
      return faviconUrl
    }
    return null
  } catch {
    return null
  }
}

// 切换新增配置显示
const previousSelectedIndex = ref(-1)  // 保存之前选中的索引

const toggleAddConfig = async () => {
  if (!showAddConfig.value) {
    // 进入新增模式，保存当前选中的索引
    previousSelectedIndex.value = selectedGitlabIndex.value
    showAddConfig.value = true
    // 清空表单
    form.value.gitlabUrl = ''
    form.value.accessToken = ''
    testResult.value = null
    groups.value = []
  } else {
    // 取消新增模式，恢复之前的选中状态
    showAddConfig.value = false
    if (previousSelectedIndex.value >= 0 && previousSelectedIndex.value < gitlabHistory.value.length) {
      // 恢复之前选中的配置
      await selectGitlabConfig(previousSelectedIndex.value)
    } else if (gitlabHistory.value.length > 0) {
      // 如果之前没有选中，选择第一个
      await selectGitlabConfig(0)
    }
  }
}

// 选择 GitLab/GitHub 配置
const selectGitlabConfig = async (index) => {
  if (index >= 0 && index < gitlabHistory.value.length) {
    selectedGitlabIndex.value = index
    showAddConfig.value = false
    const config = gitlabHistory.value[index]
    form.value.platform = config.platform || 'gitlab'
    form.value.gitlabUrl = config.url
    form.value.accessToken = config.token
    
    // 清空全局搜索状态
    globalSearchQuery.value = ''
    searchResults.value = []
    showSearchResults.value = false
    
    // 自动连接
    await testConnection()
  }
}

// 获取路径的最后一级文件夹名
const getFolderName = (path) => {
  if (!path) return ''
  const parts = path.split('/').filter(part => part.length > 0)
  return parts[parts.length - 1] || path
}

const canStartClone = computed(() => {
  return form.value.gitlabUrl && form.value.accessToken && form.value.localPath && testResult.value?.success
})

const nextProjectName = computed(() => {
  if (testResult.value?.projects && cloneProgress.value.current < testResult.value.projects.length) {
    return testResult.value.projects[cloneProgress.value.current].name_with_namespace
  }
  return ''
})

// 选择本地目录
const selectDirectory = async () => {
  try {
    // 在Electron环境中使用dialog选择目录
    if (window.electronAPI && window.electronAPI.showOpenDialog) {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择项目克隆目录'
      })
      
      if (result.canceled) {
        console.log('用户取消了目录选择')
        return null
      }
      
      const selectedPath = result.filePaths[0]
      form.value.localPath = selectedPath
      console.log('📁 用户选择的目录:', selectedPath)
      return selectedPath
    }
    
    // 降级方案：使用输入框
    const defaultPath = '/path/to/your/projects'
    const customPath = prompt(`请输入克隆目标目录路径:\n\n示例:\n${defaultPath}`, defaultPath)
    
    if (customPath) {
      // 验证路径格式
      if (customPath.startsWith('/') && customPath.length > 1) {
        form.value.localPath = customPath
        console.log('📁 用户选择的目录:', customPath)
        return customPath
      } else {
        alert('请输入明显的绝对路径（以 / 开头）')
        return null
      }
    }
    
    console.log('用户取消了目录选择')
    return null
    
      } catch (error) {
    console.error('选择目录失败:', error)
    alert('选择目录失败: ' + error.message)
        return null
  }
}

// 测试连接并获取Groups/Organizations
const testConnection = async () => {
  if (!canTestConnection.value) return
  
  loading.value = true
  testResult.value = null
  groups.value = []
  
  // 清空项目列表和选择状态
  projectsForSelectedGroup.value = []
  selectedGroup.value = null
  selectedGroupForProjects.value = null
  selectedProject.value = null
  selectedProjects.value.clear()
  groupDetails.value = {}
  expandedGroups.value.clear()
  
  try {
    // GitHub 平台处理
    if (form.value.platform === 'github') {
      // 设置 GitHub URL 用于后续使用
      form.value.gitlabUrl = 'https://github.com'
      
      // 测试 GitHub 连接
      const testData = await window.electronAPI.githubTest({
        token: form.value.accessToken
      })
      
      if (testData.success) {
        // 连接成功，获取 Organizations
        const orgsData = await window.electronAPI.githubOrgs({
          token: form.value.accessToken
        })
        
        groups.value = orgsData.groups || []
        
        testResult.value = {
          success: true,
          message: `GitHub连接成功，找到${groups.value.length}个Organizations（包含个人仓库）`,
          groups: groups.value,
          platform: 'github'
        }
        
        console.log(`✅ GitHub连接成功: ${groups.value.length} 个Organizations`)
        
        // 连接成功后隐藏表单，显示列表
        showAddConfig.value = false
        
        // 保存配置历史
        await saveGitlabHistory()
        
        // 保存后更新左侧选中状态
        const configIndex = gitlabHistory.value.findIndex(c => c.url === form.value.gitlabUrl && c.platform === 'github')
        if (configIndex >= 0) {
          selectedGitlabIndex.value = configIndex
        } else {
          selectedGitlabIndex.value = 0
        }
        
        // 保存配置到 electron-store
        if (window.electronAPI?.setConfig) {
          await window.electronAPI.setConfig('gitlab-config', {
          url: form.value.gitlabUrl,
          token: form.value.accessToken,
          platform: 'github'
          })
        }
      } else {
        testResult.value = testData
      }
    } else if (form.value.platform === 'gitee') {
      // Gitee 平台处理
      form.value.gitlabUrl = 'https://gitee.com'
      
      // 测试 Gitee 连接
      const testData = await window.electronAPI.giteeTest({
        token: form.value.accessToken
      })
      
      if (testData.success) {
        // 连接成功，获取 Organizations
        const orgsData = await window.electronAPI.giteeOrgs({
          token: form.value.accessToken
        })
        
        groups.value = orgsData.groups || []
        
        testResult.value = {
          success: true,
          message: `Gitee连接成功，找到${groups.value.length}个组织（包含个人仓库）`,
          groups: groups.value,
          platform: 'gitee'
        }
        
        console.log(`✅ Gitee连接成功: ${groups.value.length} 个Organizations`)
        
        // 连接成功后隐藏表单，显示列表
        showAddConfig.value = false
        
        // 保存配置历史
        await saveGitlabHistory()
        
        // 保存后更新左侧选中状态
        const configIndex = gitlabHistory.value.findIndex(c => c.url === form.value.gitlabUrl && c.platform === 'gitee')
        if (configIndex >= 0) {
          selectedGitlabIndex.value = configIndex
        } else {
          selectedGitlabIndex.value = 0
        }
        
        // 保存配置到 electron-store
        if (window.electronAPI?.setConfig) {
          await window.electronAPI.setConfig('gitlab-config', {
          url: form.value.gitlabUrl,
          token: form.value.accessToken,
          platform: 'gitee'
          })
        }
      } else {
        testResult.value = testData
      }
    } else {
      // GitLab 平台处理（原有逻辑）
      // 先尝试从缓存加载Groups数据（提升用户体验）
      const cacheKey = form.value.gitlabUrl
      if (groupCache.value[cacheKey] && groupCache.value[cacheKey].groups) {
        groups.value = groupCache.value[cacheKey].groups
        groupDetails.value = groupCache.value[cacheKey].groupDetails || {}
        console.log('✅ 从缓存加载Groups:', groups.value.length)
        
        // 显示缓存的数据，告知用户正在更新
        testResult.value = {
          success: true,
          message: `连接成功，找到${groups.value.length}个Groups（缓存数据，正在更新...）`,
          groups: groups.value
        }
      }
      
      // 测试GitLab连接（验证连接仍然有效）
      const testData = await window.electronAPI.gitlabTest({
          url: form.value.gitlabUrl,
          token: form.value.accessToken
      })
      
      if (testData.success) {
        // 连接成功，获取最新的groups数据
        const groupsData = await window.electronAPI.gitlabGroups({
            url: form.value.gitlabUrl,
            token: form.value.accessToken
        })
        
        groups.value = groupsData.groups || []
        
        // 更新缓存
        if (!groupCache.value[cacheKey]) {
          groupCache.value[cacheKey] = {}
        }
        groupCache.value[cacheKey].groups = groups.value
        if (!groupCache.value[cacheKey].groupDetails) {
          groupCache.value[cacheKey].groupDetails = {}
        }
        
        testResult.value = {
          success: true,
          message: `连接成功，找到${groups.value.length}个Groups`,
          groups: groups.value
        }
        
        console.log(`✅ 从API获取并更新缓存: ${groups.value.length} 个Groups`)
        
        // 连接成功后隐藏表单，显示 Groups 列表
        showAddConfig.value = false
        
        // 连接成功后保存GitLab配置历史
        await saveGitlabHistory()
        
        // 保存后更新左侧选中状态
        const configIndex = gitlabHistory.value.findIndex(c => c.url === form.value.gitlabUrl)
        if (configIndex >= 0) {
          selectedGitlabIndex.value = configIndex
        } else {
          selectedGitlabIndex.value = 0
        }
        
        // 保存GitLab配置到 electron-store
        if (window.electronAPI?.setConfig) {
          await window.electronAPI.setConfig('gitlab-config', {
          url: form.value.gitlabUrl,
            token: form.value.accessToken,
            platform: 'gitlab'
          })
        }
        
        // 保存新的配置记录（如果还没保存的话）
        await saveConfigIfNew()
      } else {
        testResult.value = testData
      }
    }
    
  } catch (error) {
    testResult.value = {
      success: false,
      message: '网络请求失败: ' + error.message,
      details: error.message
    }
  } finally {
    loading.value = false
  }
}

// 全局搜索项目
const searchProjects = async () => {
  const query = globalSearchQuery.value.trim()
  if (!query || query.length < 2) {
    console.log('⚠️ 搜索关键词太短，至少需要2个字符')
    return
  }
  
  searchingProjects.value = true
  searchResults.value = []
  
  try {
    const config = gitlabHistory.value[selectedGitlabIndex.value]
    if (!config) {
      console.error('❌ 没有选中的配置')
      return
    }
    
    console.log('🔍 开始全局搜索项目:', query, '平台:', config.platform)
    
    let result
    if (config.platform === 'github') {
      // GitHub 搜索
      result = await window.electronAPI.githubSearchRepos({
        token: config.token,
        query: query,
        org: selectedGroup.value?.login || null
      })
    } else if (config.platform === 'gitee') {
      // Gitee 搜索
      result = await window.electronAPI.giteeSearchRepos({
        token: config.token,
        query: query,
        org: selectedGroup.value?.login || selectedGroup.value?.path || null
      })
    } else {
      // GitLab 搜索
      result = await window.electronAPI.gitlabSearchProjects({
        url: config.url,
        token: config.token,
        query: query
      })
    }
    
    if (result.success) {
      searchResults.value = result.projects || []
      showSearchResults.value = true
      // 切换到显示搜索结果（清空当前选中的 Group）
      selectedGroup.value = null
      selectedGroupForProjects.value = null
      projectsForSelectedGroup.value = []
      console.log(`✅ 搜索完成，找到 ${searchResults.value.length} 个项目`)
    } else {
      console.error('❌ 搜索失败:', result.message)
    }
  } catch (error) {
    console.error('❌ 搜索异常:', error.message)
  } finally {
    searchingProjects.value = false
  }
}

// 清除搜索结果
const clearSearchResults = () => {
  globalSearchQuery.value = ''
  searchResults.value = []
  showSearchResults.value = false
  console.log('🧹 已清除搜索结果')
}

// 选择Group
const selectGroup = async (group) => {
  console.log('🎯 selectGroup 被调用，Group:', group.name, 'ID:', group.id)

  selectedGroup.value = group
  selectedGroupForProjects.value = group

  // 清空项目搜索框
  projectSearchQuery.value = ''
  console.log('✅ 已清空项目搜索框')
  
  // 清空全局搜索状态
  globalSearchQuery.value = ''
  searchResults.value = []
  showSearchResults.value = false
  console.log('✅ 已清空全局搜索状态')
  
  // 立即检查并展开子groups（如果有缓存数据）
  if (groupDetails.value[group.id] && groupDetails.value[group.id].subgroups && groupDetails.value[group.id].subgroups.length > 0) {
    expandedGroups.value.add(group.id)
    // 如果group被收起了，重新展开它
    collapsedGroupIds.value.delete(group.id)
    console.log('✅ 从缓存立即展开子Groups')
  }
  
  // 设置项目加载状态
  loadingProjects.value = true
  
  console.log('✅ 设置selectedGroup完毕')
  
  try {
    // 同时加载项目列表和Group详情（子Groups）
    console.log('📡 开始同时加载项目列表和Group详情...')
    await Promise.all([
      loadProjectsForGroup(group),
      loadGroupDetails(group)
    ])
    console.log('✅ 项目和Group详情加载完毕')
    
         // 如果之前没有缓存数据，现在有了，也展开Group以显示子Groups
         if (groupDetails.value[group.id] && groupDetails.value[group.id].subgroups && groupDetails.value[group.id].subgroups.length > 0) {
           expandedGroups.value.add(group.id)
           collapsedGroupIds.value.delete(group.id)
           console.log('✅ Group新加载数据后展开子Groups')
         }
  } finally {
    // 无论成功或失败都关闭loading状态
    loadingProjects.value = false
  }
}

// 加载指定Group的项目列表
const loadProjectsForGroup = async (group) => {
  console.log('📄 加载Group项目列表:', group.name, '平台:', form.value.platform)
  
  try {
    let data
    
    // 根据平台类型调用不同的 API
    if (form.value.platform === 'github') {
      // GitHub 平台
      if (group._isPersonal) {
        // 获取个人仓库
        data = await window.electronAPI.githubUserRepos({
          token: form.value.accessToken
        })
      } else {
        // 获取组织仓库
        data = await window.electronAPI.githubOrgRepos({
          token: form.value.accessToken,
          orgName: group.name
        })
      }
    } else if (form.value.platform === 'gitee') {
      // Gitee 平台
      if (group._isPersonal) {
        // 获取个人仓库
        data = await window.electronAPI.giteeUserRepos({
          token: form.value.accessToken
        })
      } else {
        // 获取组织仓库
        data = await window.electronAPI.giteeOrgRepos({
          token: form.value.accessToken,
          orgName: group.name
        })
      }
    } else {
      // GitLab 平台
      data = await window.electronAPI.gitlabGroupProjects({
          url: form.value.gitlabUrl,
          token: form.value.accessToken,
          groupId: group.id,
          include_subgroups: true // 包含子Group项目
      })
    }
    
    if (!data.success) {
      throw new Error(data.message || '获取Group项目失败')
    }
    
    console.log('🔄 IPC返回的原始数据:', data)
    console.log('📋 项目数组:', data.projects)
    console.log('📊 项目数组长度:', data.projects ? data.projects.length : 'undefined')
    
    // 强制更新项目数组并触发响应式
    if (data.projects && Array.isArray(data.projects)) {
      console.log('🔄 开始强制更新响应式数组...')
      
      // 先清空触发一次更新
      projectsForSelectedGroup.value = []
      
      // 使用nextTick确保DOM更新
      await nextTick()
      
      // 再设置实际数据
      projectsForSelectedGroup.value = [...data.projects]
      
      console.log('✅ 强制更新projectsForSelectedGroup:', projectsForSelectedGroup.value.length)
      
      // 强制再次触发响应式
      await nextTick()
    console.log('📱 DOM更新后projectsForSelectedGroup长度:', projectsForSelectedGroup.value.length)
    
    // 强制更新DOM中的标题
    setTimeout(() => {
      // 标题已移除，无需更新
      console.log('📄 项目数量:', projectsForSelectedGroup.value.length)
    }, 100)
    
    } else {
      projectsForSelectedGroup.value = []
      console.log('⚠️ data.projects 无效，设置为空数组')
    }
    
    selectedProject.value = null // 重置选中的项目
    
    console.log(`✅ Group ${group.name} 项目已加载: ${projectsForSelectedGroup.value.length} 个项目`)
    console.log('🎯 最终projectsForSelectedGroup.value length:', projectsForSelectedGroup.value.length)
    
    // 测试直接设置一个数字
    setTimeout(() => {
      console.log('⏰ 延迟检查projectsForSelectedGroup:', projectsForSelectedGroup.value.length)
    }, 1000)
    
  } catch (error) {
    console.error('加载Group项目失败:', error)
    alert('加载Group项目失败: ' + error.message)
    projectsForSelectedGroup.value = []
  }
}

// 选择项目
const selectProject = (project) => {
  selectedProject.value = project
  console.log('选中项目:', project.name)
}

// 在 GitLab 中打开项目
const openProjectInGitlab = (project) => {
  if (!project) return
  
  // 优先使用 web_url，其次从 http_url_to_repo 提取
  let gitlabUrl = project.web_url
  if (!gitlabUrl && project.http_url_to_repo) {
    // 从 http_url_to_repo 移除 .git 后缀
    gitlabUrl = project.http_url_to_repo.replace(/\.git$/, '')
  }
  
  if (gitlabUrl) {
    console.log('🔗 在新标签页打开 GitLab:', gitlabUrl)
    if (window.electronAPI?.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(gitlabUrl)
    } else {
      // 降级方案：使用系统浏览器打开
      window.electronAPI?.openExternal?.(gitlabUrl)
    }
  } else {
    console.error('❌ 无法获取项目的 GitLab URL')
  }
}

// 切换项目勾选状态
const toggleProjectSelection = (projectId) => {
  if (selectedProjects.value.has(projectId)) {
    selectedProjects.value.delete(projectId)
  } else {
    selectedProjects.value.add(projectId)
  }
  console.log('📄 项目勾选状态已更新，当前选中:', selectedProjects.value.size, '项')
}

// 过滤项目列表
const filteredProjects = computed(() => {
  if (!projectSearchQuery.value.trim()) {
    return projectsForSelectedGroup.value
  }
  
  const query = projectSearchQuery.value.toLowerCase().trim()
  return projectsForSelectedGroup.value.filter(project => 
    project.name.toLowerCase().includes(query) ||
    project.name_with_namespace.toLowerCase().includes(query) ||
    (project.description && project.description.toLowerCase().includes(query))
  )
})

// 批量克隆选中的项目
const cloneSelectedProjects = async () => {
  if (selectedProjects.value.size === 0) {
    alert('请先选择要克隆的项目')
    return
  }
  
  // 获取所有已勾选的项目（基于全局项目列表，不受搜索过滤影响）
  const allProjects = projectsForSelectedGroup.value
  const selectedProjectsList = allProjects.filter(project => 
    selectedProjects.value.has(project.id)
  )
  
  // 调试信息：打印详细的勾选状态
  console.log('🔍 批量克隆调试信息:')
  console.log('- 所有勾选的项目ID:', Array.from(selectedProjects.value))
  console.log('- 全局项目总数:', allProjects.length)
  console.log('- 搜索关键词:', projectSearchQuery.value)
  console.log('- 最终克隆项目:', selectedProjectsList.length, '个')
  console.log('- 项目详情:', selectedProjectsList.map(p => ({id: p.id, name: p.name})))
  
  if (selectedProjectsList.length === 0) {
    alert('没有已勾选的项目，请先勾选要克隆的项目')
    return
  }
  
  console.log('🔄 开始批量克隆项目:', selectedProjectsList.length, '个')
  
  // 重置取消状态
  cloneCancelled.value = false
  
  // 直接开始批量克隆，不需要确认
  
  loading.value = true
  
  try {
    // 选择克隆目录
    const cloneDir = await selectDirectory()
    
    if (!cloneDir) {
      console.log('用户取消了目录选择')
      return
    }
    
    console.log('📁 选择的克隆目录:', cloneDir)
    
    // 开始批量克隆: '🚀 开始批量克隆 ${selectedProjectsList.length} 个项目...\n'
    gitOutput.value = `🚀 开始批量克隆 ${selectedProjectsList.length} 个项目...\n`
    cloneProgress.value = {
      show: true,
      current: 0,
      total: selectedProjectsList.length,
      completed: []
    }
    
    // 🔍 强制调试输出 - 显示进度对话框
    console.log('🎯 进度对话框已设置:', {
      show: cloneProgress.value.show,
      total: cloneProgress.value.total,
      completed: cloneProgress.value.completed.length
    })
    
    // 🔍 发送到终端显示
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.logToFrontend) {
      window.electronAPI.logToFrontend(`🎯 Initialization: 设置进度对话框 show=${cloneProgress.value.show}, total=${cloneProgress.value.total}`)
    }
    
    // 全局监听器已在onMounted中注册，不需要在这里重复注册
    
    // 逐个顺序克隆项目
    try {
      console.log(`🚀 开始顺序批量克隆: ${selectedProjectsList.length} 个项目`)
      gitOutput.value += `📡 开始批量克隆 ${selectedProjectsList.length} 个项目...\n\n`
      
      const results = []
      
      // 逐个处理项目
      for (let i = 0; i < selectedProjectsList.length; i++) {
        const project = selectedProjectsList[i]
        
        // 检查是否已取消
        if (cloneCancelled.value) {
          gitOutput.value += '\n🚫 操作已取消\n'
          return
        }
        
        // 更新进度
        cloneProgress.value.current = i + 1
        
        // 立即将当前项目添加到进度数组中，显示为正在克隆状态
        const cloningItem = {
          name: project.name,
          path: '',
          status: 'cloning' // 正在克隆状态
        }
        cloneProgress.value.completed = [...cloneProgress.value.completed, cloningItem]
        await nextTick() // 强制UI更新
        
        gitOutput.value += `\n📦 [${i + 1}/${selectedProjectsList.length}] 开始克隆: ${project.name}\n`
        console.log(`🔄 [${i + 1}/${selectedProjectsList.length}] 处理项目: ${project.name}`)
        
        // 创建可序列化的项目对象
        const serializableProject = {
          id: project.id,
          name: project.name,
          path_with_namespace: project.path_with_namespace,
          http_url_to_repo: project.http_url_to_repo,
          ssh_url_to_repo: project.ssh_url_to_repo,
          namespace: project.namespace ? {
            id: project.namespace.id,
            name: project.namespace.name,
            path: project.namespace.path
          } : null,
          description: project.description,
          last_activity_at: project.last_activity_at
        }
        
        // 单个项目克隆（根据平台类型调用不同的 API）
        const cloneAPI = form.value.platform === 'github' 
          ? window.electronAPI.githubClone 
          : (form.value.platform === 'gitee' ? window.electronAPI.giteeClone : window.electronAPI.gitlabClone)
        const cloneResponse = await cloneAPI({
          url: form.value.gitlabUrl,
          token: form.value.accessToken,
          localPath: cloneDir,
          projects: [serializableProject], // 只传递一个项目
          groupName: 'Selected Projects'
        })
        
        // 处理单个项目克隆结果
        if (!cloneResponse.success) {
          console.error(`❌ 项目 ${project.name} 克隆失败: ${cloneResponse.message}`)
          
          // 找到并更新已有的cloning项目状态
          const index = cloneProgress.value.completed.findIndex(item => 
            item.name === project.name && item.status === 'cloning'
          )
          
          if (index !== -1) {
            // 更新现有项目的状态为错误
            cloneProgress.value.completed[index] = {
              name: project.name,
              path: '',
              status: 'error',
              error: cloneResponse.message
            }
            // 强制响应式更新
            cloneProgress.value.completed = [...cloneProgress.value.completed]
          } else {
            // 如果没有找到，添加新项目
            const errorItem = {
              name: project.name,
              path: '',
              status: 'error',
              error: cloneResponse.message
            }
            cloneProgress.value.completed = [...cloneProgress.value.completed, errorItem]
          }
          
          // 强制UI更新
          await nextTick()
          
          gitOutput.value += `❌ 项目 ${project.name} 克隆失败: ${cloneResponse.message}\n`
          results.push({
            projectName: project.name,
            path: '',
            status: 'error',
            error: cloneResponse.message
          })
          continue // 继续下一个项目
        }
        
        // 成功处理
        const cloneResult = cloneResponse.results?.[0] || cloneResponse
        console.log(`✅ 项目 ${project.name} 完成: ${cloneResult.message || '成功'}`)
        
        // 找到并更新已有的cloning项目状态
        const index = cloneProgress.value.completed.findIndex(item => 
          item.name === project.name && item.status === 'cloning'
        )
        
        if (index !== -1) {
          // 更新现有项目的状态
          cloneProgress.value.completed[index] = {
            name: project.name,
            path: cloneResult.path || `${cloneDir}/${project.path_with_namespace}`,
            status: 'success'
          }
          // 强制响应式更新
          cloneProgress.value.completed = [...cloneProgress.value.completed]
        } else {
          // 如果没有找到，添加新项目
          const completedItem = {
            name: project.name,
            path: cloneResult.path || `${cloneDir}/${project.path_with_namespace}`,
            status: 'success'
          }
          cloneProgress.value.completed = [...cloneProgress.value.completed, completedItem]
        }
        
        // 强制UI更新
        await nextTick()
        
        gitOutput.value += `✅ 项目 ${project.name} 克隆成功: ${cloneResult.message || '完成'}\n`
        
        if (cloneResult.output) {
          gitOutput.value += `📋 Git输出: ${cloneResult.output}\n`
        }
        
        results.push({
          projectName: project.name,
          path: cloneResult.path || `${cloneDir}/${project.path_with_namespace}`,
          status: 'success',
          message: cloneResult.message || '完成'
        })
        
        // 添加小延迟以便用户看到进度
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      console.log(`✅ 批量克隆完成！成功: ${results.filter(r => r.status === 'success').length} 个，失败: ${results.filter(r => r.status === 'error').length} 个`)
      gitOutput.value += `\n✅ 批量克隆完成！成功: ${results.filter(r => r.status === 'success').length} 个，失败: ${results.filter(r => r.status === 'error').length} 个\n`
      
      
      // 保存配置并刷新目录列表
      await saveConfigIfNew()
      await refreshClonedDirectories()
      
      // 延时关闭弹框
      const failCount = results.filter(r => r.status === 'error').length
      if (failCount === 0) {
        gitOutput.value += `\n⏰ 3秒后自动关闭弹框...\n`
        // 取消之前的定时器
        cancelAutoCloseTimer()
        // 设置新的自动关闭定时器
        autoCloseTimer = setTimeout(() => {
          if (!cloneCancelled.value) {
            cloneProgress.value.show = false
            console.log('✅ 克隆弹框已自动关闭')
            autoCloseTimer = null
          }
        }, 3000)
      }
      
      // 删除选择
      selectedProjects.value.clear()
      
    } catch (error) {
      console.error('批量克隆失败:', error)
      gitOutput.value += `\n❌ 批量克隆失败: ${error.message}\n`
    } finally {
      loading.value = false
    }
  } catch (error) {
    console.error('克隆操作失败:', error)
    gitOutput.value += `\n❌ 克隆操作失败: ${error.message}\n`
  } finally {
    loading.value = false
  }
}

// 克隆单个项目
const cloneProject = async (project) => {
  if (!project) return
  
  selectedProject.value = project
  
  console.log('🚀 开始克隆项目:', project.name)
  
  // 直接选择本地目录
  console.log('📁 选择本地存储目录...')
  const selectedPath = await selectDirectory()
  
  if (!selectedPath) {
    console.log('用户取消了目录选择')
    return
  }
  
  console.log('✅ 目录选择成功:', selectedPath)
  
  // 重置取消状态
  cloneCancelled.value = false
  
  loading.value = true
  
  try {
    // 开始克隆进度
    gitOutput.value = '' // 清空输出
    cloneProgress.value = {
      show: true,
      current: 0,
      total: 1,
      completed: []
    }
    
    // 全局监听器已在onMounted中注册，不需要在这里重复注册
    
    // 克隆项目
    gitOutput.value += `📡 开始克隆项目: ${project.name}\n`
    
    // 立即将当前项目添加到进度数组中，显示为正在克隆状态（单个项目克隆）
    const cloningItem = {
      name: project.name,
      path: '',
      status: 'cloning' // 正在克隆状态
    }
    cloneProgress.value.completed = [...cloneProgress.value.completed, cloningItem]
    await nextTick() // 强制UI更新
    
    // 创建可序列化的项目对象副本
    const serializableProject = {
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      http_url_to_repo: project.http_url_to_repo,
      ssh_url_to_repo: project.ssh_url_to_repo,
      namespace: project.namespace ? {
        id: project.namespace.id,
        name: project.namespace.name,
        path: project.namespace.path
      } : null,
      description: project.description,
      last_activity_at: project.last_activity_at
    }
    
    // 根据平台类型调用不同的克隆 API
    const cloneAPI = form.value.platform === 'github' 
      ? window.electronAPI.githubClone 
      : (form.value.platform === 'gitee' ? window.electronAPI.giteeClone : window.electronAPI.gitlabClone)
    const cloneResponse = await cloneAPI({
      url: form.value.gitlabUrl,
      token: form.value.accessToken,
      localPath: selectedPath,
      projects: [serializableProject],
      groupName: project.namespace?.name || 'Single Project'
    })
    
    if (!cloneResponse.success) {
      throw new Error(`克隆请求失败: ${cloneResponse.message}`)
    }
    
    gitOutput.value += `✅ 收到克隆结果\n`
    
    // 处理克隆结果
    console.log('🔄 处理克隆响应:', cloneResponse)
    
    // 检查不同可能的响应结构
    let actualResults = []
    if (cloneResponse.results && Array.isArray(cloneResponse.results)) {
      actualResults = cloneResponse.results
    } else if (cloneResponse.success !== undefined) {
      // 直接响应单个项目的结果
      actualResults = [{
        project: project.name,
        success: cloneResponse.success,
        message: cloneResponse.message || (cloneResponse.success ? '克隆成功' : '克隆失败'),
        output: cloneResponse.output || '',
        path: cloneResponse.path || ''
      }]
    } else {
      // 兼容其他可能的结构 - 尝试处理
      actualResults = Array.isArray(cloneResponse) ? cloneResponse : [cloneResponse]
    }
    
    console.log('🔍 实际处理的结果:', actualResults)
    
    let result = { success: false }
    
    for (const cloneResult of actualResults) {
      cloneProgress.value.current++
      
      console.log('🔍 处理单个项目结果:', cloneResult)
      
      // 改进成功判断逻辑
      const isSuccess = cloneResult.success === true || 
                        cloneResult.success === 'true' ||
                        (cloneResult.success !== false && 
                         cloneResult.message && 
                         !cloneResult.message.includes('失败') &&
                         !cloneResult.message.includes('错误')) ||
                        (cloneResult.success === undefined && 
                         !cloneResult.error && 
                         !cloneResult.message?.includes('失败'))
      
      console.log('🔍 项目克隆结果判定:', { 
        success: isSuccess, 
        rawSuccess: cloneResult.success, 
        message: cloneResult.message,
        error: cloneResult.error
      })
      
      if (isSuccess) {
        // 找到并更新已有的cloning项目状态（单个项目克隆）
        const index = cloneProgress.value.completed.findIndex(item => 
          item.name === project.name && item.status === 'cloning'
        )
        
        if (index !== -1) {
          // 更新现有项目的状态
          cloneProgress.value.completed[index] = {
            name: cloneResult.project || project.name,
            path: cloneResult.path || `${selectedPath}/${project.path_with_namespace}`,
            status: 'success'
          }
          // 自由响应式更新
          cloneProgress.value.completed = [...cloneProgress.value.completed]
        } else {
          cloneProgress.value.completed.push({
            name: cloneResult.project || project.name,
            path: cloneResult.path || `${selectedPath}/${project.path_with_namespace}`,
            status: 'success'
          })
        }
        
        console.log(`✅ 项目完成: ${cloneResult.project || project.name}`)
        gitOutput.value += `✅ 项目 ${cloneResult.project || project.name} 克隆成功: ${cloneResult.message || '完成'}\n`
        result = { 
          success: true, 
          message: cloneResult.message || '克隆成功',
          path: cloneResult.path || `${selectedPath}/${project.path_with_namespace}`,
          ...cloneResult
        }
      } else {
        // 找到并更新已有的cloning项目状态为错误（单个项目克隆）
        const index = cloneProgress.value.completed.findIndex(item => 
          item.name === project.name && item.status === 'cloning'
        )
        
        if (index !== -1) {
          cloneProgress.value.completed[index] = {
            name: cloneResult.project || project.name,
            path: cloneResult.path || `${selectedPath}/${project.path_with_namespace}`,
            status: 'error',
            error: cloneResult.error || cloneResult.message || '未知错误'
          }
          // 强制响应式更新
          cloneProgress.value.completed = [...cloneProgress.value.completed]
        } else {
          cloneProgress.value.completed.push({
            name: cloneResult.project || project.name,
            path: cloneResult.path || `${selectedPath}/${project.path_with_namespace}`,
            status: 'error',
            error: cloneResult.error || cloneResult.message || '未知错误'
          })
        }
        
        console.error(`❌ 项目错误: ${cloneResult.project || project.name} - ${cloneResult.error || cloneResult.message || '未知错误'}`)
        gitOutput.value += `❌ 项目 ${cloneResult.project || project.name} 克隆失败: ${cloneResult.error || cloneResult.message || '未知错误'}\n`
        
        // 设置result为失败状态（单个项目克隆）
        result = { 
          success: false, 
          error: cloneResult.error || cloneResult.message || '未知错误',
          ...cloneResult
        }
      }
      
      if (cloneResult.output) {
        gitOutput.value += `📋 Git输出: ${cloneResult.output}\n`
      }
    }
    
    // 强制UI更新
    await nextTick()
    
    if (result.success) {
      console.log(`✅ 项目 ${project.name} 克隆成功`)
      // 保存配置
      await saveConfigIfNew()
      // 刷新已克隆的目录列表
      await loadSavedConfigs(false)
    } else {
      console.error(`❌ 项目 ${project.name} 克隆失败:`, result.error)
    }
    
    // 克隆完成，延时关闭弹框（仅在成功时）
    if (result.success) {
      console.log(`✅ 项目 "${project.name}" 克隆成功！存储路径: ${result.path || selectedPath}`)
      gitOutput.value += `\n⏰ 3秒后自动关闭弹框...\n`
      // 取消之前的定时器
      cancelAutoCloseTimer()
      // 设置新的自动关闭定时器
      autoCloseTimer = setTimeout(() => {
        if (!cloneCancelled.value) {
          cloneProgress.value.show = false
          console.log('✅ 克隆弹框已自动关闭')
          autoCloseTimer = null
        }
      }, 3000)
    } else {
      console.error(`❌ 项目 "${project.name}" 克隆失败！错误信息: ${result.error || '未知错误'}`)
    }
    
  } catch (error) {
    console.error('克隆失败:', error)
    // 不自动关闭弹框，让用户手动关闭
  } finally {
    loading.value = false
  }
}

// 移除了展开相关的函数

// 选择目录对话框
const showDirectoryDialog = () => {
  // 触发目录选择
  selectDirectory()
}

// 收起一级Group（移除子Groups显示）
const collapseGroup = (group) => {
  console.log('🔄 收起Group:', group.name)
  console.log('🔄 执行收起前的状态:', expandedGroups.value)
  console.log('🔄 执行收起前的collapsedGroupIds:', collapsedGroupIds.value)
  
  // 添加到一级group的收起状态
  collapsedGroupIds.value.add(group.id)
    expandedGroups.value.delete(group.id)
  
  console.log('🔄 执行收起后的状态:', expandedGroups.value)
  console.log('🔄 执行收起后的collapsedGroupIds:', collapsedGroupIds.value)
}

// 收起子Group（移除子Groups显示）
const collapseSubGroup = (subgroup) => {
  console.log('🔄 收起子Group:', subgroup.name)
    expandedGroups.value.delete(subgroup.id)
}


// 加载Group详情（子Groups和项目）
const loadGroupDetails = async (group) => {
  console.log('📁 加载Group详情:', group.name, '平台:', form.value.platform)

  // GitHub/Gitee 平台不需要加载子 Groups（没有这个概念）
  if (form.value.platform === 'github' || form.value.platform === 'gitee') {
    console.log(`📁 ${form.value.platform}平台，跳过加载子Groups`)
    groupDetails.value[group.id] = {
      subgroups: [],
      projects: []
    }
    return
  }

  try {
    // 检查本地缓存
    const cacheKey = form.value.gitlabUrl
    if (groupCache.value[cacheKey]?.groupDetails?.[group.id]) {
      // 直接从缓存加载
      groupDetails.value[group.id] = groupCache.value[cacheKey].groupDetails[group.id]
      console.log('✅ 从缓存加载Group详情:', group.name)
      return
    }

    // 从API加载
    const data = await window.electronAPI.gitlabGroupDetails({
        url: form.value.gitlabUrl,
        token: form.value.accessToken,
        groupId: group.id
    })

    if (!data.success) {
      throw new Error(data.message || '获取Group详情失败')
    }

    // 保存到本地缓存和全局缓存
    const groupData = {
      subgroups: data.subgroups || [],
      projects: data.projects || []
    }
    
    groupDetails.value[group.id] = groupData
    
    // 更新全局缓存
    if (!groupCache.value[cacheKey]) {
      groupCache.value[cacheKey] = {}
    }
    if (!groupCache.value[cacheKey].groupDetails) {
      groupCache.value[cacheKey].groupDetails = {}
    }
    groupCache.value[cacheKey].groupDetails[group.id] = groupData
    
    console.log(`✅ Group ${group.name} 详情已加载并缓存:`)
    console.log(`   - 子Groups: ${data.subgroups?.length || 0}`)
    console.log(`   - 项目: ${data.projects?.length || 0}`)
    
  } catch (error) {
    console.error('加载Group详情失败:', error)
    alert('加载Group详情失败: ' + error.message)
  }
}

// 克隆子Group
const cloneSubGroup = async (subgroup) => {
  if (!subgroup) return
  
  selectedGroup.value = subgroup
  
  console.log('🚀 开始克隆子Group:', subgroup.name)
  
  // 选择本地目录
  console.log('📁 选择本地存储目录...')
  const selectedPath = await selectDirectory()
  
  if (!selectedPath) {
    console.log('用户取消了目录选择')
    return
  }
  
  // 保存选择的路径到表单
  form.value.localPath = selectedPath
  
  console.log('✅ 目录选择成功:', selectedPath)
  
  loading.value = true
  console.log('🔄 开始获取子Group项目列表...')
  
  try {
    // 获取该子Group下的所有项目
    const projectsData = await window.electronAPI.gitlabGroupProjects({
        url: form.value.gitlabUrl,
        token: form.value.accessToken,
      groupId: subgroup.id,
      include_subgroups: true
    })
    
    if (!projectsData.success) {
      throw new Error(projectsData.message || '获取子Group项目失败')
    }
    
    const projects = projectsData.projects || []
    
    if (projects.length === 0) {
      alert('该子Group下没有项目')
      loading.value = false
      return
    }
    
    await startCloneProcess(projects, subgroup.name)
    
  } catch (error) {
    console.error('克隆失败:', error)
    alert('克隆失败: ' + error.message)
    loading.value = false
  }
}

// 克隆指定Group
const cloneGroup = async (group) => {
  if (!group) return
  
  selectedGroup.value = group
  
  console.log('🚀 开始克隆Group:', group.name)
  
  // 选择本地目录
  console.log('📁 选择本地存储目录...')
  const selectedPath = await selectDirectory()
  
  if (!selectedPath) {
    console.log('用户取消了目录选择')
    return
  }
  
  console.log('✅ 目录选择成功:', selectedPath)
  
  // 保存选择的路径到表单
  form.value.localPath = selectedPath
  
  loading.value = true
  console.log('🔄 开始获取Group项目列表...')
  
  try {
    // 获取该Group下的所有项目
    const projectsData = await window.electronAPI.gitlabGroupProjects({
        url: form.value.gitlabUrl,
        token: form.value.accessToken,
      groupId: group.id,
      include_subgroups: true
    })
    
    if (!projectsData.success) {
      throw new Error(projectsData.message || '获取Group项目失败')
    }
    
    const projects = projectsData.projects || []
    
    if (projects.length === 0) {
      alert('该Group下没有项目')
      loading.value = false
      return
    }
    
    // 使用组名作为一级目录名
    await startCloneProcess(projects, group.name)
    
  } catch (error) {
    console.error('克隆失败:', error)
    alert('克隆失败: ' + error.message)
    loading.value = false
  }
}

// 移除了子Group克隆功能

// 取消克隆
const cancelClone = () => {
  cloneCancelled.value = true
  cloneProgress.value.show = false
  gitOutput.value += '\n🚫 用户取消克隆操作\n'
  console.log('🚫 用户取消克隆操作')
  
  // 停止任何正在进行的延时关闭
  loading.value = false
  // 清理自动关闭定时器
  cancelAutoCloseTimer()
}

// 清空Git输出
const clearGitOutput = () => {
  gitOutput.value = ''
}

// 刷新已克隆的目录列表
const refreshClonedDirectories = async () => {
  try {
    console.log('🔄 刷新已克隆的目录列表...')
    await loadSavedConfigs(false) // 不触发自动测试连接
    console.log('✅ 已克隆的目录列表已刷新')
  } catch (error) {
    console.error('❌ 刷新已克隆的目录列表失败:', error)
  }
}

// 执行克隆过程的公共方法
const startCloneProcess = async (projects, groupName) => {
  try {
    // 重置取消状态
    cloneCancelled.value = false
    
    // 清空Git输出
    gitOutput.value = ''
    
    // 保存本地目录配置到 electron-store
    if (window.electronAPI?.setConfig) {
      await window.electronAPI.setConfig('repos-path', form.value.localPath)
    }
    
    // 设置克隆进度
    cloneProgress.value = {
      show: true,
      current: 0,
      total: projects.length,
      completed: []
    }
    
    console.log(`🚀 开始克隆Group: ${groupName}, ${projects.length} 个项目`)
    gitOutput.value += `🚀 开始克隆Group: ${groupName}\n📡 开始批量克隆 ${projects.length} 个项目...\n\n`
    
    // 逐个顺序克隆项目
    const results = []
    
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i]
      
      // 检查是否已取消
      if (cloneCancelled.value) {
        gitOutput.value += '\n🚫 操作已取消\n'
        return
      }
      
      // 更新进度
      cloneProgress.value.current = i + 1
      
      // 立即将当前项目添加到进度数组中，显示为正在克隆状态
      const cloningItem = {
        name: project.name,
        path: '',
        status: 'cloning' // 正在克隆状态
      }
      cloneProgress.value.completed = [...cloneProgress.value.completed, cloningItem]
      await nextTick() // 强制UI更新
      
      gitOutput.value += `\n📦 [${i + 1}/${projects.length}] 开始克隆: ${project.name}\n`
      console.log(`🔄 [${i + 1}/${projects.length}] 处理项目: ${project.name}`)
      
      // 创建可序列化的项目对象
      const serializableProject = {
        id: project.id,
        name: project.name,
        path_with_namespace: project.path_with_namespace,
        http_url_to_repo: project.http_url_to_repo,
        ssh_url_to_repo: project.ssh_url_to_repo,
        namespace: project.namespace ? {
          id: project.namespace.id,
          name: project.namespace.name,
          path: project.namespace.path
        } : null,
        description: project.description,
        last_activity_at: project.last_activity_at
      }
      
      // 单个项目克隆（根据平台类型调用不同的 API）
      const cloneAPI = form.value.platform === 'github' 
        ? window.electronAPI.githubClone 
        : (form.value.platform === 'gitee' ? window.electronAPI.giteeClone : window.electronAPI.gitlabClone)
      const cloneResponse = await cloneAPI({
        url: form.value.gitlabUrl,
        token: form.value.accessToken,
        localPath: form.value.localPath,
        projects: [serializableProject], // 只传递一个项目
        groupName: groupName
      })
      
      // 处理单个项目克隆结果
      if (!cloneResponse.success) {
        console.error(`❌ 项目 ${project.name} 克隆失败: ${cloneResponse.message}`)
        
        // 找到并更新已有的cloning项目状态
        const index = cloneProgress.value.completed.findIndex(item => 
          item.name === project.name && item.status === 'cloning'
        )
        
        if (index !== -1) {
          cloneProgress.value.completed[index] = {
            name: project.name,
            path: cloneResponse.path || `${form.value.localPath}/${project.path_with_namespace}`,
            status: 'error'
          }
          // 强制响应式更新
          cloneProgress.value.completed = [...cloneProgress.value.completed]
                  } else {
          // 如果没有找到，添加新项目
          cloneProgress.value.completed = [...cloneProgress.value.completed, {
            name: project.name,
            path: cloneResponse.path || `${form.value.localPath}/${project.path_with_namespace}`,
            status: 'error'
          }]
        }
        
        gitOutput.value += `❌ [${i + 1}/${projects.length}] 克隆失败: ${project.name} - ${cloneResponse.message}\n`
        results.push({
          project: project.name,
          status: 'error',
          message: cloneResponse.message
        })
      } else {
        // 成功处理
        const cloneResult = cloneResponse
        console.log(`✅ 项目 ${project.name} 完成: ${cloneResult.message || '成功'}`)
        
        // 找到并更新已有的cloning项目状态
        const index = cloneProgress.value.completed.findIndex(item => 
          item.name === project.name && item.status === 'cloning'
        )
        
        if (index !== -1) {
          // 更新现有项
          cloneProgress.value.completed[index] = {
            name: project.name,
            path: cloneResult.path || `${form.value.localPath}/${project.path_with_namespace}`,
            status: 'success'
          }
          // 强制响应式更新
          cloneProgress.value.completed = [...cloneProgress.value.completed]
        } else {
          // 如果没有找到，添加新项目
          cloneProgress.value.completed = [...cloneProgress.value.completed, {
            name: project.name,
            path: cloneResult.path || `${form.value.localPath}/${project.path_with_namespace}`,
            status: 'success'
          }]
        }
        
        gitOutput.value += `✅ [${i + 1}/${projects.length}] 克隆成功: ${project.name}\n`
        results.push({
          project: project.name,
          status: 'success',
          path: cloneResult.path
        })
      }
      
      // 强制UI更新的小延迟
      await nextTick()
    }
    
    console.log(`✅ 批量克隆完成！成功: ${results.filter(r => r.status === 'success').length} 个，失败: ${results.filter(r => r.status === 'error').length} 个`)
    gitOutput.value += `\n✅ 批量克隆完成！成功: ${results.filter(r => r.status === 'success').length} 个，失败: ${results.filter(r => r.status === 'error').length} 个\n`
    
    // 保存配置并刷新目录列表
    await saveConfigIfNew()
    await refreshClonedDirectories()
    
    // 延时关闭弹框
    const failCount = results.filter(r => r.status === 'error').length
    if (failCount === 0) {
      gitOutput.value += `\n⏰ 3秒后自动关闭弹框...\n`
      // 取消之前的定时器
      cancelAutoCloseTimer()
      // 设置新的自动关闭定时器
      autoCloseTimer = setTimeout(() => {
        if (!cloneCancelled.value) {
          cloneProgress.value.show = false
          loading.value = false
        }
      }, 3000)
    } else {
      gitOutput.value += `\n⚠️ 有 ${failCount} 个项目克隆失败，请手动关闭弹框\n`
    }
    
  } catch (error) {
    console.error('克隆过程失败:', error)
    gitOutput.value += `\n❌ 克隆过程失败: ${error.message}\n`
  } finally {
    loading.value = false
  
}
}

const saveGitlabHistory = async () => {
  // 跳过占位符和测试数据
  if (!form.value.gitlabUrl || 
      !form.value.accessToken ||
      form.value.gitlabUrl.includes('gitlab.example.com') ||
      form.value.accessToken.includes('test-token')) {
    console.log('💾 跳过GitLab历史保存：占位数据')
    return
  }
  
  try {
    if (window.electronAPI) {
      // 使用 electron-store
      const currentHistory = await window.electronAPI.getConfig('gitlabHistory') || []
      
      // 检查是否已存在相同的配置
      const existingIndex = currentHistory.findIndex(item => 
        item.url === form.value.gitlabUrl && item.token === form.value.accessToken
      )
      
      // 获取 favicon
      let favicon = null
      try {
        const urlObj = new URL(form.value.gitlabUrl)
        favicon = `${urlObj.origin}/favicon.ico`
      } catch (e) {
        console.log('获取 favicon 失败:', e)
      }
      
      const newHistoryItem = {
        url: form.value.gitlabUrl,
        token: form.value.accessToken,
        platform: form.value.platform || 'gitlab',
        lastUsed: new Date().toISOString(),
        favicon: favicon
      }
      
      let updatedHistory
      if (existingIndex >= 0) {
        // 更新现有配置的时间，保留原有的 favicon（如果没有则使用新的）
        updatedHistory = [...currentHistory]
        updatedHistory[existingIndex] = {
          ...newHistoryItem,
          favicon: currentHistory[existingIndex].favicon || favicon
        }
    } else {
      // 添加新配置
        updatedHistory = [newHistoryItem, ...currentHistory]
      }
      
      // 保留最新的10个（不排序）
      updatedHistory = updatedHistory.slice(0, 10)
      
      await window.electronAPI.setConfig('gitlabHistory', updatedHistory)
      console.log('✅ GitLab历史已保存到 electron-store')
      
      // 重新加载GitLab历史列表到界面
      await loadGitlabHistory()
      console.log('✅ GitLab历史界面已更新')
    } else {
      // 浏览器环境，重新加载GitLab历史（从已保存配置中获取）
      await loadGitlabHistory()
      console.log('✅ GitLab历史已更新')
    }
  } catch (error) {
    console.error('保存GitLab配置历史时出错:', error)
  }
}

// 保存本地目录配置相关功能
const saveConfigIfNew = async () => {
  console.log('💾 saveConfigIfNew 被调用')
  console.log('💾 form.value.localPath:', form.value.localPath)
  console.log('💾 form.value.gitlabUrl:', form.value.gitlabUrl)
  
  // 跳过占位符和测试数据
  if (!form.value.localPath || 
      form.value.gitlabUrl?.includes('gitlab.example.com') ||
      form.value.accessToken?.includes('test-token')) {
    console.log('💾 跳过滤占位数据或测试数据')
    return
  }
  
  try {
    if (window.electronAPI) {
      // 使用 electron-store
      const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
      console.log('💾 当前已保存的配置数量:', savedConfigsData.length)
    
    // 检查是否已存在相同路径的配置
    const existingConfig = savedConfigsData.find(config => config.path === form.value.localPath)
      console.log('💾 是否已存在相同路径的配置:', !!existingConfig)
    
    let updatedData

    if (!existingConfig) {
      // 创建新配置
      const newConfig = {
        path: form.value.localPath,
        gitlabUrl: form.value.gitlabUrl,
        token: form.value.accessToken,
        lastUsed: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
      
      updatedData = [...savedConfigsData, newConfig]
        console.log('💾 保存新配置到 electron-store:', newConfig.path)
        console.log('💾 新配置详情:', newConfig)
    } else {
      // 更新已存在配置的最后使用时间
      existingConfig.lastUsed = new Date().toISOString()
      existingConfig.gitlabUrl = form.value.gitlabUrl
      existingConfig.token = form.value.accessToken
      
      updatedData = savedConfigsData
        console.log('🔄 更新配置到 electron-store:', existingConfig.path)
      }
      
      // 保存到 electron-store
      await window.electronAPI.setConfig('savedConfigs', updatedData)
      console.log('💾 配置已保存到 electron-store，总数:', updatedData.length)
      
      // 更新显示的配置列表
      await loadSavedConfigs(false)
      console.log('✅ 配置已保存到 electron-store')
    } else {
      // 浏览器环境，使用 API
      const result = await window.electronAPI.getSavedConfigs()
      const savedConfigsData = result.success ? result.configs : []
      
      // 检查是否已存在相同路径的配置
      const existingConfig = savedConfigsData.find(config => config.path === form.value.localPath)
      
      let updatedData

      if (!existingConfig) {
        // 创建新配置
        const newConfig = {
          path: form.value.localPath,
          gitlabUrl: form.value.gitlabUrl,
          token: form.value.accessToken,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
        
        updatedData = [...savedConfigsData, newConfig]
        console.log('💾 保存新配置到 API:', newConfig.path)
      } else {
        // 更新已存在配置的最后使用时间
        existingConfig.lastUsed = new Date().toISOString()
        existingConfig.gitlabUrl = form.value.gitlabUrl
        existingConfig.token = form.value.accessToken
        
        updatedData = savedConfigsData
        console.log('🔄 更新配置到 API:', existingConfig.path)
    }
    
    // 保存到文件
      const saveResponse = await window.electronAPI.saveSavedConfigs({
        configs: updatedData
      })
      
      if (saveResponse.success) {
      // 更新显示的配置列表
        await loadSavedConfigs(false)
      console.log('✅ 配置已保存到文件')
    } else {
      console.error('❌ 保存配置到文件失败')
      }
    }
  } catch (error) {
    console.error('保存配置时出错:', error)
  }
}

const loadSavedConfigs = async (isInitialLoad = false) => {
  try {
    console.log('📋 准备加载已保存的配置...')
    
    if (window.electronAPI) {
      // 使用 electron-store
      const configs = await window.electronAPI.getConfig('savedConfigs') || []
      
      if (configs.length > 0) {
        // 按最后使用时间排序，最新的在前
        const sortedConfigs = configs.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
        
        // 找到最新的 GitLab 配置（过滤掉本地仓库）
        const latestGitlabConfig = sortedConfigs.find(config => 
          config.gitlabUrl && config.gitlabUrl !== '本地仓库' && !config.isLocal
        )
        
        if (latestGitlabConfig) {
          // 只加载配置到表单，不自动连接
          console.log('📁 发现 GitLab 配置:', latestGitlabConfig.gitlabUrl)
        } else {
          console.log('📁 没有 GitLab 配置（只有本地仓库）')
        }
        
        savedConfigs.value = sortedConfigs
        console.log('📁 从 electron-store 加载已保存配置:', savedConfigs.value.length, '个')
    } else {
        form.value.gitlabUrl = ''
        form.value.accessToken = ''
      savedConfigs.value = []
        console.log('📁 没有已保存的配置')
      }
    } else {
      // 浏览器环境处理
      console.log('📋 浏览器环境：清空配置')
      form.value.gitlabUrl = ''
      form.value.accessToken = ''
      savedConfigs.value = []
    }
    
    console.log('✅ 配置加载完成')
    
  } catch (error) {
    console.error('❌ 加载配置异常:', error)
    form.value.gitlabUrl = ''
    form.value.accessToken = ''
    savedConfigs.value = []
  }
}

const loadGitlabHistory = async () => {
  try {
    if (window.electronAPI) {
      // 使用 electron-store
      const configs = await window.electronAPI.getConfig('gitlabHistory') || []
      // 过滤掉本地仓库
      const filteredConfigs = configs.filter(config => 
        config.url && config.url !== '本地仓库' && !config.isLocal
      )
      gitlabHistory.value = filteredConfigs
      console.log('📋 从 electron-store 加载GitLab历史:', gitlabHistory.value.length, '个')
    } else {
      // 浏览器环境，从已保存的配置中提取GitLab历史
      const result = await window.electronAPI.getSavedConfigs()
      
      if (result.success) {
        const savedConfigsData = result.configs || []
        
        // 从已保存配置中提取唯一的GitLab配置（过滤掉本地仓库）
        const uniqueGitlabConfigs = []
        const seenUrls = new Set()
        
        savedConfigsData.forEach(config => {
          // 过滤掉本地仓库
          if (config.gitlabUrl && config.gitlabUrl !== '本地仓库' && !config.isLocal && 
              config.token && !seenUrls.has(config.gitlabUrl)) {
            seenUrls.add(config.gitlabUrl)
            uniqueGitlabConfigs.push({
              url: config.gitlabUrl,
              token: config.token,
              lastUsed: config.lastUsed
            })
          }
        })
        
        gitlabHistory.value = uniqueGitlabConfigs
        console.log('📝 从已保存配置加载GitLab历史:', gitlabHistory.value.length, '个')
      } else {
        console.error('加载GitLab历史时出错:', result.error)
        gitlabHistory.value = []
      }
    }
  } catch (error) {
    console.error('加载GitLab历史时出错:', error)
    gitlabHistory.value = []
  }
}

// 选择GitLab历史配置（新版按钮形式）
const selectGitlabHistoryByIndex = async (index) => {
  if (index >= 0 && index < gitlabHistory.value.length) {
    const selectedConfig = gitlabHistory.value[index]
    form.value.gitlabUrl = selectedConfig.url
    form.value.accessToken = selectedConfig.token
    
    // 关闭下拉框
    showHistoryDropdown.value = false
    
    console.log('✅ 选择了GitLab配置:', selectedConfig.url)
    
    // 自动测试连接并刷新项目列表
    setTimeout(() => {
      testConnection()
    }, 300)
  }
}

// 选择GitLab历史配置（旧版下拉框形式，保留以防万一）
const selectGitlabHistory = (event) => {
  const selectedIndex = parseInt(event.target.value)
  selectGitlabHistoryByIndex(selectedIndex)
}

// 删除GitLab历史配置
const deleteGitlabHistory = async (index) => {
  try {
    const config = gitlabHistory.value[index]
    if (!config) {
      alert('无效的配置索引')
      return
    }
    
    const confirmed = await confirm({
      title: '删除 Git 配置',
      message: '确定要删除此 Git 配置吗？',
      detail: config.url,
      type: 'danger',
      confirmText: '删除'
    })
    if (confirmed) {
      const result = await window.electronAPI.deleteGitlabHistory(index)
      if (result.success) {
        console.log('✅ GitLab历史配置删除成功')
        // 重新加载GitLab历史
        await loadGitlabHistory()
        
        // 关闭下拉菜单
        showHistoryDropdown.value = false
      } else {
        console.error('❌ 删除GitLab历史配置失败:', result.message)
        alert(`删除失败: ${result.message}`)
      }
    }
  } catch (error) {
    console.error('❌ 删除GitLab历史配置异常:', error)
    alert(`删除失败: ${error.message}`)
  }
}

// 删除已保存配置（通过索引）
const deleteSavedConfigByIndex = async (index) => {
  try {
    const config = savedConfigs.value[index]
    if (!config) {
      alert('无效的配置索引')
      return
    }
    
    const confirmed = await confirm({
      title: '删除配置',
      message: '确定要删除此配置吗？',
      detail: config.path,
      type: 'danger',
      confirmText: '删除'
    })
    if (confirmed) {
      const result = await window.electronAPI.deleteSavedConfig(index)
      if (result.success) {
        console.log('✅ 保存配置删除成功')
        // 重新加载已保存配置
        await loadSavedConfigs()
      } else {
        console.error('❌ 删除保存配置失败:', result.message)
        alert(`删除失败: ${result.message}`)
      }
    }
  } catch (error) {
    console.error('❌ 删除保存配置异常:', error)
    alert(`删除失败: ${error.message}`)
  }
}

const openSavedConfig = async (config) => {
  console.log('🚀 打开已保存配置:', config.path)
  console.log('🚀 完整配置信息:', config)
  
  try {
    // 保存GitLab配置到文件
    const gitlabConfigData = {
      url: config.gitlabUrl,
      token: config.token
    }
    
    const saveGitlabResponse = await window.electronAPI.saveGitlabConfig({
      data: gitlabConfigData
    })
    
    if (saveGitlabResponse.success) {
      console.log('✅ GitLab配置已保存到文件')
    }
    
    // 保存路径到 electron-store（用于主页读取）
    await window.electronAPI.setConfig('scan-path', { path: config.path })
    await window.electronAPI.setCurrentConfig({
      path: '',
      config: { path: config.path }
    })
    console.log('💾 已保存扫描路径到配置:', config.path)
    
    // 更新配置的最后使用时间
    if (window.electronAPI) {
      // 使用 electron-store
      const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
      const existingConfig = savedConfigsData.find(c => c.path === config.path)
      
      if (existingConfig) {
        existingConfig.lastUsed = new Date().toISOString()
        await window.electronAPI.setConfig('savedConfigs', savedConfigsData)
        await loadSavedConfigs(false)
        console.log('✅ 已更新配置的最后使用时间 (electron-store)')
      }
    } else {
      // 浏览器环境，使用 API
      const result = await window.electronAPI.getSavedConfigs()
      const savedConfigsData = result.success ? result.configs : []
    
    const existingConfig = savedConfigsData.find(c => c.path === config.path)
    if (existingConfig) {
      existingConfig.lastUsed = new Date().toISOString()
      
      // 保存更新后的配置到文件
        const saveResponse = await window.electronAPI.saveSavedConfigs({
          configs: savedConfigsData
        })
        
        if (saveResponse.success) {
          await loadSavedConfigs(false)
          console.log('✅ 已更新配置的最后使用时间 (API)')
        }
      }
    }
    
    // 获取目录名称作为标签页标题
    const pathParts = config.path.split('/')
    const dirName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '未知目录'
    
    console.log('🌐 目录名称:', dirName)
    console.log('🚀 准备打开新标签页...')
    
    // 使用全局 IPC 在新标签页打开克隆目录
    const cloneUrl = `git:clone:${config.path}`
    if (window.electronAPI && window.electronAPI.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(cloneUrl)
      console.log('✅ 新标签页已打开:', cloneUrl)
    } else {
      console.error('❌ electronAPI.openUrlInNewTab 不可用')
    }
    
  } catch (error) {
    console.error('❌ 打开配置时出错:', error)
    alert('打开配置时出错: ' + error.message)
  }
}

const deleteSavedConfig = async (path) => {
  const confirmed = await confirm({
    title: '删除配置',
    message: '确认删除此配置？',
    detail: path,
    type: 'danger',
    confirmText: '删除'
  })
  if (confirmed) {
    try {
      if (window.electronAPI) {
        // 使用 electron-store
        const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
        const updatedConfigs = savedConfigsData.filter(config => config.path !== path)
        await window.electronAPI.setConfig('savedConfigs', updatedConfigs)
        console.log('🗑️ 从 electron-store 删除配置:', path)
      } else {
        // 浏览器环境，使用 localStorage
    const savedConfigsData = JSON.parse(localStorage.getItem('saved-configs') || '[]')
    const updatedConfigs = savedConfigsData.filter(config => config.path !== path)
    localStorage.setItem('saved-configs', JSON.stringify(updatedConfigs))
        console.log('🗑️ 从 localStorage 删除配置:', path)
      }
      
      await loadSavedConfigs(false)
    } catch (error) {
      console.error('删除配置时出错:', error)
    }
  }
}

const formatTime = (timeString) => {
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
    
    // 检查选择的目录是否是 Git 仓库（使用正确的命令格式）
    const checkGitResult = await window.electronAPI.executeCommand({
      command: 'git rev-parse --git-dir 2>&1',
      cwd: selectedPath
    })
    const checkGitDir = await window.electronAPI.executeCommand({
      command: 'test -d ".git" && echo "yes" || echo "no"',
      cwd: selectedPath
    })
    
    // 如果有 .git 目录，或者 git rev-parse 成功返回
    const hasGitDir = checkGitDir.output?.trim() === 'yes'
    const gitParseOk = checkGitResult.success && (checkGitResult.output?.trim() === '.git' || checkGitResult.output?.includes('.git'))
    const isGitRepo = hasGitDir || gitParseOk
    
    console.log('📁 检测 Git 仓库结果:', { 
      isGitRepo, 
      hasGitDir,
      gitParseOk,
      checkGitResult: checkGitResult.output, 
      checkGitDir: checkGitDir.output,
      success: checkGitResult.success 
    })
    
    if (isGitRepo) {
      // 单个 Git 仓库，直接打开
      console.log('📁 检测到单个 Git 仓库，直接打开')
      await saveAndOpenLocalRepo(selectedPath, true)
    } else {
      // 检查是否包含 Git 仓库（增加搜索深度到 3 层）
      const findGitResult = await window.electronAPI.executeCommand({
        command: `find . -maxdepth 3 -name ".git" -type d 2>/dev/null | head -50`,
        cwd: selectedPath
      })
      console.log('📁 搜索子目录 Git 仓库结果:', findGitResult)
      
      const gitDirs = findGitResult.success && findGitResult.output?.trim() 
        ? findGitResult.output.trim().split('\n').filter(line => line.trim()).map(dir => {
            // 将相对路径转换为绝对路径
            if (dir.startsWith('./')) {
              return selectedPath + dir.substring(1)
            }
            return dir
          })
        : []
      
      console.log('📁 找到的 Git 目录:', gitDirs)
      
      if (gitDirs.length === 0) {
        // 再尝试检查是否有 .git 文件（可能是 submodule）
        const checkGitFile = await window.electronAPI.executeCommand({
          command: 'ls -la .git 2>/dev/null',
          cwd: selectedPath
        })
        if (checkGitFile.success && checkGitFile.output?.trim()) {
          console.log('📁 检测到 .git 文件（可能是 submodule），作为单个仓库打开')
          await saveAndOpenLocalRepo(selectedPath, true)
          return
        }
        
        alert('所选目录不是 Git 仓库，也不包含任何 Git 仓库。\n\n请选择：\n1. 一个包含 .git 目录的 Git 仓库\n2. 或者一个包含多个 Git 仓库的父目录')
        return
      } else if (gitDirs.length === 1) {
        // 只有一个子仓库，打开那个仓库
        const repoPath = gitDirs[0].replace(/\/.git$/, '')
        console.log('📁 检测到一个子仓库:', repoPath)
        await saveAndOpenLocalRepo(repoPath, true)
      } else {
        // 多个仓库，保存目录并用 GitProject 打开
        console.log('📁 检测到多个 Git 仓库:', gitDirs.length, '个')
        await saveAndOpenLocalRepo(selectedPath, false)
      }
    }
  } catch (error) {
    console.error('❌ 添加本地仓库失败:', error)
    alert('添加本地仓库失败: ' + error.message)
  }
}

// 保存并打开本地仓库
const saveAndOpenLocalRepo = async (path, isSingleRepo) => {
  try {
    // 保存到配置
    const newConfig = {
      path: path,
      gitlabUrl: '本地仓库',
      token: '',
      lastUsed: new Date().toISOString(),
      isLocal: true,
      isSingleRepo: isSingleRepo
    }
    
    // 检查是否已存在
    const savedConfigsData = await window.electronAPI.getConfig('savedConfigs') || []
    const existingIndex = savedConfigsData.findIndex(c => c.path === path)
    
    if (existingIndex >= 0) {
      // 更新已存在的配置
      savedConfigsData[existingIndex] = { ...savedConfigsData[existingIndex], ...newConfig }
    } else {
      // 添加新配置
      savedConfigsData.push(newConfig)
    }
    
    await window.electronAPI.setConfig('savedConfigs', savedConfigsData)
    console.log('💾 本地仓库配置已保存:', path)
    
    // 刷新列表
    await loadSavedConfigs(false)
    
    // 保存路径到 scan-path 配置
    await window.electronAPI.setConfig('scan-path', { path: path })
    
    // 打开仓库
    if (isSingleRepo) {
      // 单个仓库，使用 ProjectDetailNew 打开
      const cloneUrl = `git:project:${path}`
      if (window.electronAPI && window.electronAPI.openUrlInNewTab) {
        window.electronAPI.openUrlInNewTab(cloneUrl)
        console.log('✅ 单个仓库已在新标签页打开:', cloneUrl)
      }
    } else {
      // 多个仓库，使用 GitProject 打开
      const cloneUrl = `git:clone:${path}`
      if (window.electronAPI && window.electronAPI.openUrlInNewTab) {
        window.electronAPI.openUrlInNewTab(cloneUrl)
        console.log('✅ 多仓库目录已在新标签页打开:', cloneUrl)
      }
    }
  } catch (error) {
    console.error('❌ 保存本地仓库配置失败:', error)
    throw error
  }
}

// 自动连接最后一次使用的GitLab配置
const autoConnectLastGitlab = () => {
  if (gitlabHistory.value.length > 0) {
    const lastConfig = gitlabHistory.value[0] // 已按最后使用时间排序，第一个就是最新的
    form.value.gitlabUrl = lastConfig.url
    form.value.accessToken = lastConfig.token
    
    console.log('🔄 自动连接最后一次使用的GitLab:', lastConfig.url)
    
    // 自动测试连接
    setTimeout(() => {
      testConnection()
    }, 500)
  }
}

// 清理测试配置数据
const cleanupTestConfigs = async () => {
  if (window.electronAPI) {
    const configs = await window.electronAPI.getConfig('savedConfigs') || []
    // 过滤掉测试配置
    const cleanConfigs = configs.filter(config => 
      !config.gitlabUrl?.includes('gitlab.example.com') && 
      !config.path?.includes('/tmp/test') &&
      !config.token?.includes('test-token')
    )
    
    if (cleanConfigs.length !== configs.length) {
      await window.electronAPI.setConfig('savedConfigs', cleanConfigs)
      console.log('🧹 已清理测试配置, 移除', configs.length - cleanConfigs.length, '个')
      
      // 同时清理 gitlabHistory
      const gitlabConfigs = await window.electronAPI.getConfig('gitlabHistory') || []
      const cleanGitlabConfigs = gitlabConfigs.filter(config => 
        !config.url?.includes('gitlab.example.com')
      )
      
      if (cleanGitlabConfigs.length !== gitlabConfigs.length) {
        await window.electronAPI.setConfig('gitlabHistory', cleanGitlabConfigs)
        console.log('🧹 已清理GitLab历史测试配置, 移除', gitlabConfigs.length - cleanGitlabConfigs.length, '个')
      }
    }
  }
}

// 组件加载时加载已保存的配置
// 全局的Git输出监听器处理函数
const handleGlobalGitOutput = (event, data) => {
  console.log('🌐 全局Git输出监听器收到事件:', data)
  if (data && data.output) {
    // 移除任何emoji前缀
    const cleanOutput = data.output.replace(/^[🔄⚠️📋]\s*/, '')
    gitOutput.value += `${cleanOutput}\n`
    console.log('✅ Git输出已添加到界面:', cleanOutput)
    // CloneProgressDialog组件内部已有自动滚动功能，无需手动调用
  }
}

onMounted(async () => {
  // 先清理测试配置
  await cleanupTestConfigs()

  // 然后加载配置 - 初始化时设为true
  await loadSavedConfigs(true)
  await loadGitlabHistory()

  // 默认显示表单页面，不自动连接
  showAddConfig.value = true

  // 注册全局的实时Git输出监听器
  console.log('🎧 在onMounted中注册全局实时Git输出监听器')
  if (window.electronAPI && window.electronAPI.onGitOutputUpdate) {
    window.electronAPI.onGitOutputUpdate(handleGlobalGitOutput)
    console.log('✅ 全局实时Git输出监听器注册成功')
  } else {
    console.error('❌ 无法注册全局实时Git输出监听器，electronAPI.onGitOutputUpdate 不存在')
  }
  
  // 添加点击外部关闭下拉框的事件监听
  document.addEventListener('click', (event) => {
    const target = event.target
    const isInHistory = target.closest('.input-with-history')
    if (!isInHistory) {
      showHistoryDropdown.value = false
    }
  })
})

// 组件卸载时清理监听器
onUnmounted(() => {
  console.log('🧹 组件卸载，清理全局实时Git输出监听器')
  if (window.electronAPI && window.electronAPI.removeGitOutputUpdateListener) {
    window.electronAPI.removeGitOutputUpdateListener(handleGlobalGitOutput)
    console.log('✅ 全局实时Git输出监听器已清理')
  }
  
  // 清理自动关闭定时器
  cancelAutoCloseTimer()
})

// 注意：移除 defineExpose，避免生产构建中的 refs 访问问题
// 刷新功能通过 IPC refresh-on-focus 事件触发

// 临时测试：手动添加一个测试配置（可以稍后删除）
console.log('🔍 当前savedConfigs:', savedConfigs.value.length)
</script>

<style scoped>
/* 新版左右布局 */
.remote-repo-page {
  height: 100%;
  background: #1e1e1e;
  display: flex;
  overflow: hidden;
}

/* 左侧边栏 */
.config-sidebar {
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
  color: #fff;
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
  color: rgba(255, 255, 255, 0.9) !important;
  transition: background 0.2s, color 0.2s;
  font-size: 14px !important;
  font-weight: 400;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sidebar-item.active {
  background: #667eea;
  color: #fff;
}

.config-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
}

.config-favicon-placeholder {
  font-size: 16px;
  flex-shrink: 0;
}

.config-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: inherit;
}

.delete-config-btn {
  opacity: 0;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.2s;
}

.sidebar-item:hover .delete-config-btn {
  opacity: 1;
}

.delete-config-btn:hover {
  color: #ef4444;
}

.empty-sidebar {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* 右侧内容区 */
.config-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 70px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.content-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #fff;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Header右侧操作区 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 全局搜索框 */
.global-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.global-search-input {
  width: 200px;
  padding: 8px 30px 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, background-color 0.2s;
}

.global-search-input:focus {
  border-color: #667eea;
  background: rgba(255, 255, 255, 0.15);
}

.global-search-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.clear-input-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border: none;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
  line-height: 1;
}

.clear-input-btn:hover {
  color: #fff;
}

.global-search-btn {
  padding: 8px 12px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.global-search-btn:hover:not(:disabled) {
  background: #5a6fd6;
}

.global-search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 搜索结果区域 */
.search-results-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-results-info {
  padding: 10px 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.add-config-btn {
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

.add-config-btn:hover {
  background: #5a6fd6;
}

/* 配置表单区域 */
.config-form-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.config-form {
  max-width: 600px;
}

/* Groups 和项目列表区域 */
.groups-projects-area {
  flex: 1;
  overflow: hidden;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
}

.loading-state p {
  margin-top: 16px;
  font-size: 14px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.two-column-layout {
  display: flex;
  height: 100%;
}

/* 旧版样式兼容 - 隐藏 */
.initialization-page {
  display: none;
}

.container {
  max-width: 1800px;
  width: 100%;
  height: 100%;
  margin: 0 auto;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  overflow: hidden;
  flex: 1;
}

/* 第一列：GitLab配置和已克隆的目录 - 隐藏 */
.column-1 {
  display: none;
}

/* 第二列：GitLab Groups选择 */
.column-2 {
  width: 350px;
  min-width: 300px;
  padding: 10px;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

/* 第三列：项目列表 */
.column-3 {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

/* 滚动条样式 - 最小化 */
.remote-repo-page * {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.remote-repo-page ::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

.remote-repo-page ::-webkit-scrollbar-track {
  background: transparent;
}

.remote-repo-page ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1.5px;
}

.remote-repo-page ::-webkit-scrollbar-corner {
  background: transparent;
}


.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  color: #fff;
  margin: 0 0 10px 0;
  font-size: 2em;
}

.header p {
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  font-size: 1em;
}

.setup-form {
  flex-shrink: 0;
}

/* 项目列表标题样式 */
/* 项目工具栏 */
.projects-toolbar {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  min-height: 50px;
  height: 50px;
  padding: 0 4px 0 0;
  margin: 0;
  gap: 10px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.projects-toolbar .search-box,
.projects-toolbar .batch-actions {
  display: flex;
  align-items: center;
  height: 32px;
}

.projects-header {
  display: none;
  z-index: 10;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  height: 100%;
}

.projects-header h3 {
  color: #fff;
  margin: 0;
  padding: 0;
  border: none;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-box {
  flex: 1;
  max-width: 200px;
}

.search-input {
  width: 100%;
  padding: 0 10px !important;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 13px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease;
  height: 32px !important;
  box-sizing: border-box;
  margin: 0 !important;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  background: #3d3d3d;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
  font-size: 10px;
}

.batch-actions {
  gap: 12px;
}

.selected-count {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.batch-clone-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 0 14px;
  height: 32px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.batch-clone-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

.batch-clone-btn:disabled {
  background: rgba(255, 255, 255, 0.16);
  cursor: not-allowed;
}

/* 统一标题样式 - 调大高度，内容居左 */
.form-section h3,
.saved-configs h3,
.groups-section h3 {
  display: none;
  justify-content: flex-start;
  gap: 8px;
  position: sticky;
  top: 0;
  background: #1e1e1e;
  z-index: 10;
  flex-shrink: 0;
}

/* 区域标题头部样式 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 10px 0;
  padding: 12px 0 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  height: 48px;
  background: #1e1e1e;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.section-header h3 {
  color: #fff;
  margin: 0;
  padding: 0;
  border: none;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  height: auto;
  display: flex;
  align-items: center;
  background: transparent;
  position: static;
  z-index: auto;
  justify-content: flex-start;
  gap: 8px;
}

.add-local-btn {
  padding: 6px 12px;
  background: var(--theme-sem-accent-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.add-local-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 82%, black 18%);
}


/* 确保图标大小一致 */
.form-section h3::before,
.saved-configs h3::before,
.groups-section h3::before,
.projects-section h3::before {
  font-size: 16px;
  line-height: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.3s ease;
  box-sizing: border-box;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
  background: #3d3d3d;
}

.form-group input:disabled,
.form-group select:disabled {
  background-color: #252525;
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}

.help-text {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

/* 平台选择器样式 */
.platform-selector {
  display: flex;
  gap: 12px;
}

.platform-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.platform-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  background: #3d3d3d;
}

.platform-btn.active {
  border-color: var(--theme-sem-accent-primary);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 15%, transparent);
  color: var(--theme-sem-accent-primary);
}

.platform-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.platform-icon {
  font-size: 18px;
}

.help-text p {
  margin: 8px 0 4px 0;
  font-weight: 500;
}

.help-text ol {
  margin: 4px 0;
  padding-left: 20px;
}

.help-text li {
  margin-bottom: 4px;
  line-height: 1.4;
}

.permission-highlight {
  color: var(--theme-sem-accent-primary);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 18%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

.ssh-key-warning {
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 8px;
  color: var(--theme-sem-accent-danger);
  font-size: 13px;
}

.ssh-key-warning p {
  margin: 0;
  line-height: 1.5;
}

.ssh-key-warning p:first-child {
  margin-bottom: 6px;
}

.ssh-key-warning strong {
  color: var(--theme-sem-accent-danger-strong);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 30px;
}

.test-btn {
  flex: 1;
  padding: 12px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.test-btn:hover:not(:disabled) {
  background: #5a67d8;
}

.test-btn:disabled {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}

.test-result {
  padding: 16px;
  border-radius: 8px;
  margin-top: 20px;
}

.test-result.success {
  border: 1px solid #34d399;
  background: rgba(52, 211, 153, 0.1);
}

.test-result.error {
  border: 1px solid #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.test-result h4 {
  margin: 0 0 8px 0;
  color: #fff;
}

.test-result.error h4 {
  color: #f87171;
}

.test-result p {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  line-height: 1.4;
}

.clone-progress {
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
}

.clone-progress h4 {
  margin: 0 0 15px 0;
  color: #fff;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.progress-bar {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  height: 8px;
  margin-bottom: 15px;
  overflow: hidden;
}

.progress-fill {
  background: linear-gradient(90deg, #667eea, #764ba2);
  height: 100%;
  transition: width 0.3s ease;
}

.current-project {
  margin-bottom: 15px;
  font-weight: 600;
  color: #667eea;
}

.completed-projects h5 {
  margin: 0 0 10px 0;
  color: #fff;
}

.completed-list {
  max-height: 120px;
  overflow-y: auto;
}


/* Groups 样式 */
.groups-section {
  height: 100%;
  overflow-y: auto;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-item-container {
  margin-bottom: 4px;
  margin-right: 4px;
}

.group-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 8px 10px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  transition: background 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
  min-height: auto;
  box-shadow: none;
  gap: 8px;
}

.group-item:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.group-item.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

/* 子Group样式 */
.subgroup-item-container {
  margin-bottom: 4px;
}

.subgroup-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 8px 10px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  gap: 12px;
}

.subgroup-item:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.subgroup-main {
  flex: 1;
  min-width: 0;
}

.subgroup-info h4 {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px 0;
  line-height: 1.3;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.subgroup-info p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 6px 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.subgroup-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subgroup-stats span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
}


.subgroup-action {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 嵌套子Group样式 */
.nested-group-details {
  margin-top: 8px;
  padding-left: 20px;
  border-left: 2px solid rgba(255, 255, 255, 0.1);
}

.nested-subgroups {
  margin-bottom: 12px;
}

.nested-subgroups h6 {
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.7);
  margin: 8px 0 4px 0;
}

.nested-subgroups-list {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.nested-subgroup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #2d2d2d;
  border-radius: 4px;
  margin-bottom: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.nested-subgroup-content {
  flex: 1;
  cursor: pointer;
}

.nested-subgroup-name {
  font-size: 0.85em;
  font-weight: bold;
  color: #fff;
  margin-bottom: 2px;
  line-height: 1.2;
}

.nested-subgroup-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nested-subgroup-path {
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

.nested-subgroup-count {
  font-size: 0.75em;
  color: #667eea;
  background: rgba(102, 126, 234, 0.2);
  padding: 1px 4px;
  border-radius: 8px;
}

.nested-subgroup-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* 更深层级的子Group样式 */
.deep-nested-group-details {
  margin-top: 8px;
  padding-left: 20px;
  border-left: 2px solid rgba(255, 255, 255, 0.08);
}

.deep-nested-subgroups {
  margin-bottom: 12px;
}

.deep-nested-subgroups h6 {
  font-size: 0.8em;
  color: rgba(255, 255, 255, 0.6);
  margin: 8px 0 4px 0;
}

.deep-nested-subgroups-list {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.deep-nested-subgroup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #2d2d2d;
  border-radius: 4px;
  margin-bottom: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.deep-nested-subgroup-content {
  flex: 1;
  cursor: pointer;
}

.deep-nested-subgroup-name {
  font-size: 0.8em;
  font-weight: bold;
  color: #fff;
  margin-bottom: 2px;
  line-height: 1.2;
}

.deep-nested-subgroup-meta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.deep-nested-subgroup-path {
  font-size: 0.7em;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
}

.deep-nested-subgroup-count {
  font-size: 0.7em;
  color: #667eea;
  background: rgba(102, 126, 234, 0.2);
  padding: 1px 3px;
  border-radius: 6px;
}

.deep-nested-subgroup-action {
  display: flex;
  align-items: center;
  justify-content: center;
}

.deep-nested-projects {
  margin-bottom: 12px;
}

.deep-nested-projects h6 {
  font-size: 0.8em;
  color: rgba(255, 255, 255, 0.6);
  margin: 8px 0 4px 0;
}

.deep-nested-projects-list {
  background: rgba(102, 126, 234, 0.05);
  padding: 6px;
  border-radius: 4px;
}

.clone-deep-nested-subgroup-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 0.7em;
  cursor: pointer;
}

.clone-deep-nested-subgroup-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}


.nested-projects {
  margin-bottom: 12px;
}

.nested-projects h6 {
  font-size: 0.85em;
  color: #555;
  margin: 8px 0 4px 0;
}

.nested-projects-list {
  background: rgba(102, 126, 234, 0.1);
  padding: 8px;
  border-radius: 4px;
}

.clone-nested-subgroup-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75em;
  cursor: pointer;
}

.clone-nested-subgroup-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

/* 项目列表样式 */
.projects-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}


.no-project-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 2px dashed rgba(255, 255, 255, 0.1);
}

.no-projects {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 2px dashed rgba(255, 255, 255, 0.1);
}

.projects-list {
  flex: 1;
  overflow-y: auto;
}

.project-item {
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 4px;
  margin-right: 4px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  display: flex;
  flex-direction: row;
  align-items: center;
  box-shadow: none;
  gap: 8px;
}

.project-checkbox {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.project-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--theme-sem-accent-primary);
}

.project-item:hover {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent);
}


.project-info {
  flex: 1;
  min-width: 0;
}

.project-info h5 {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px 0;
  line-height: 1.3;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-info p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 6px 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-stats {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}

.project-stats .branch {
  margin-left: 8px;
  color: var(--theme-sem-accent-primary);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 18%, transparent);
  padding: 1px 6px;
  border-radius: 8px;
  font-family: monospace;
}

.project-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.gitlab-btn {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gitlab-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 24%, transparent);
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
}

.clone-project-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  min-width: 80px;
  align-self: center;
}

.clone-project-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

.clone-project-btn:disabled {
  background: rgba(255, 255, 255, 0.16);
  cursor: not-allowed;
}

.group-main {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.group-info h4 {
  margin: 0 0 6px 0;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.group-info p {
  margin: 0 0 8px 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.group-stats {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.group-stats span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  white-space: nowrap;
}

.group-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.group-item:hover .group-actions {
  opacity: 1;
}

.expand-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #667eea;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.expand-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.expand-btn.expanded {
  background: var(--theme-sem-accent-primary);
  color: white;
}

.expand-btn:disabled {
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}

.clone-group-btn {
  padding: 6px 12px;
  background: var(--theme-sem-accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  min-width: 80px;
}

.clone-group-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 82%, black 18%);
}

.clone-group-btn:disabled {
  background: rgba(255, 255, 255, 0.16);
  cursor: not-allowed;
}

/* 展开的详情样式 */
.group-details {
  padding: 8px 10px;
  background: transparent;
  border-top: none;
}

.group-details h5 {
  margin: 0 0 8px 0;
  color: #fff;
  font-size: 1em;
  font-weight: 600;
}

.subgroups-list,
.projects-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 0;
}

.subgroup-item:hover {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent);
}

.subgroup-main {
  flex: 1;
  cursor: pointer;
}

.project-item:hover {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent);
}

.subgroup-info {
  flex: 1;
  min-width: 0;
}

.subgroup-info h5 {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px 0;
  line-height: 1.3;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.subgroup-info p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 6px 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-info {
  flex: 1;
  min-width: 0;
}

.subgroup-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.subgroup-item:hover .subgroup-actions {
  opacity: 1;
}

.clone-subgroup-btn {
  padding: 6px 12px;
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  min-width: 80px;
}

.clone-subgroup-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

.clone-subgroup-btn:disabled {
  background: rgba(255, 255, 255, 0.16);
  cursor: not-allowed;
}

.subgroup-path,
.project-path {
  font-size: 0.85em;
  color: #666;
  font-family: monospace;
}


.loading-projects {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.loading-content {
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  margin: 0 auto 16px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top: 3px solid var(--theme-sem-accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 展开/收起按钮样式 */
.expand-btn, .collapse-btn, .expand-subgroup-btn {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  margin-right: 8px;
  transition: all 0.2s ease;
  min-width: 24px;
  text-align: center;
  color: var(--theme-sem-accent-primary);
}

.expand-btn:hover, .collapse-btn:hover, .expand-subgroup-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 20%, transparent);
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
}

.expand-btn:active, .collapse-btn:active, .expand-subgroup-btn:active {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 28%, transparent);
}

/* 新增的文字收起按钮样式 */
.collapse-text-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 8px;
  transition: all 0.2s ease;
}

.collapse-text-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.3);
}

/* subgroups-header 样式 */
.subgroups-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 4px 0;
  padding: 0;
}

.subgroups-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

/* 嵌套subgroup actions */
.nested-subgroup-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.nested-subgroup-item:hover .nested-subgroup-actions {
  opacity: 1;
}

.loading-details,
.empty-details {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.no-groups {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

/* 桌面端优化 */
.group-info {
  flex: 1;
  min-width: 0;
}

/* 已保存配置样式 */
.saved-configs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.config-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.config-item {
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  transition: all 0.2s ease;
  cursor: pointer;
  min-height: 60px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.config-item:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 45%, transparent);
}

.config-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.config-name {
  font-weight: bold;
  color: #fff;
  font-size: 1em;
  margin-bottom: 2px;
}

.config-path {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8em;
  margin-bottom: 4px;
  word-break: break-all;
  line-height: 1.4;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  white-space: pre-wrap;
  max-width: 100%;
}

/* 旧版历史下拉框的 URL 样式（已废弃）
.config-url-old {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8em;
  margin-bottom: 2px;
}
*/

.config-time {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.75em;
}

.config-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 50px;
}


.history-selector {
  margin-bottom: 12px;
}

.history-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.history-select:focus {
  outline: none;
  border-color: var(--theme-sem-accent-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-sem-accent-primary) 22%, transparent);
}

.history-select:disabled {
  background: #252525;
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}

.open-btn {
  background: var(--theme-sem-accent-success-strong);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.open-btn:hover {
  background: color-mix(in srgb, var(--theme-sem-accent-success-strong) 82%, black 18%);
}

.delete-btn {
  background: none;
  border: none;
  color: #f87171;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 8px;
}

.delete-btn:hover {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
}

.divider {
  border: none;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 20px 0;
}

/* 克隆进度弹框样式已移至 CloneProgressDialog.vue 组件中 */

/* 历史配置按钮样式 */
.input-with-history {
  position: relative;
  display: flex;
  align-items: center;
}

.form-group .input-with-history input {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.history-btn {
  background: #667eea !important;
  color: white !important;
  border: 1px solid #667eea !important;
  border-left: none !important;
  border-top-right-radius: 8px !important;
  border-bottom-right-radius: 8px !important;
  padding: 10px 12px !important;
  cursor: pointer !important;
  font-size: 14px !important;
  transition: all 0.2s ease !important;
  white-space: nowrap !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  width: auto !important;
  height: auto !important;
}

.history-btn:hover {
  background: #5a6fd8;
}

.history-btn.active {
  background: #4c63d2;
}

.history-btn:disabled {
  background: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

/* 历史下拉框样式 */
.history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  max-height: 250px;
  overflow-y: auto;
  margin-top: 4px;
}

.history-header {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.history-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background-color 0.2s ease;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.history-item:last-child {
  border-bottom: none;
}

.history-url {
  font-weight: 500;
  color: #fff;
  font-size: 14px;
  margin-bottom: 4px;
}

.history-time {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.history-empty {
  padding: 20px 12px;
  text-align: center;
}

.empty-message {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

/* 删除按钮样式 */
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.history-info {
  flex: 1;
}

.history-delete-btn {
  background: none;
  border: none;
  color: #f87171;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 8px;
}

.history-delete-btn:hover {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.config-info {
  flex: 1;
}
</style>
