<template>
  <div class="main-content">
    <!-- 项目详情 -->
    <div v-if="projectInfo" class="project-detail">
      <!-- 头部 -->
      <div class="header">
        <div class="project-info">
          <h1 :title="projectInfo.path">
            {{ projectInfo.name }}
            <span class="current-branch-inline" :class="{ 'detached-head': currentBranch.includes('HEAD detached') }">
              <GitBranch v-if="!currentBranch.includes('HEAD detached')" :size="16" />
              <Tag v-else :size="16" />
              {{ currentBranch }}
              <span v-if="branchStatus" class="header-branch-status">
                <span v-if="branchStatus.remoteAhead > 0" class="pull-indicator">↓{{ branchStatus.remoteAhead }}</span>
                <span v-if="branchStatus.localAhead > 0" class="push-indicator">↑{{ branchStatus.localAhead }}</span>
              </span>
              <span v-if="hasPendingFiles" class="pending-indicator" title="有待定文件">
                <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                  <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                </svg>
              </span>
              <RefreshCw v-if="statusLoading" :size="14" class="status-loading" />
            </span>
          </h1>
        </div>
        <div class="header-actions">
            <button class="pull-single-btn" @click="pullProject" :title="pullTitle">
              <GitPullRequest :size="14" /> 拉取
            </button>
            <button class="push-single-btn" @click="pushProject" :title="pushTitle">
              <ArrowUpCircle :size="14" /> 推送
            </button>
            <button class="mr-single-btn" @click="openMRDialog" title="创建 Merge Request">
              <GitMerge :size="14" /> MR
            </button>
            <button class="gitlab-open-btn" @click="openWithGitLab" title="打开 GitLab">
            <ExternalLink :size="14" /> GitLab
          </button>
          <button class="finder-open-btn" @click="openInFinder" title="在访达中打开">
            <FolderOpen :size="14" /> 访达
          </button>
          <button class="settings-btn" @click="openProjectSettings" title="项目设置">
            <Settings :size="14" /> 设置
            </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="project-main-area">
        <div class="content-wrapper">
          <!-- 左侧面板 -->
          <div class="branches-panel">
            <!-- 终端按钮 -->
            <div
              class="file-status-button"
              :class="{ active: currentView === 'terminal' }"
              @click="selectTerminal"
            >
              <TerminalIcon :size="16" />
              <span>终端</span>
            </div>

            <div
              class="file-status-button"
              :class="{ active: currentView === 'ai-sessions' }"
              @click="selectAiSessions"
            >
              <Bot :size="16" />
              <span>AI会话</span>
            </div>

            <!-- 文件状态按钮 -->
            <div
              class="file-status-button"
              :class="{ active: currentView === 'file-status' }"
              @click="selectFileStatus"
            >
              <FileText :size="16" />
              <span>文件状态</span>
              <span v-if="hasPendingFiles" class="pending-icon" title="有待定文件">
                <svg width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                  <path d="M526.41 117.029v58.514a7.314 7.314 0 0 1-7.315 7.314H219.429a36.571 36.571 0 0 0-35.987 29.989l-0.585 6.583V804.57a36.571 36.571 0 0 0 29.989 35.987l6.583 0.585H804.57a36.571 36.571 0 0 0 35.987-29.989l0.585-6.583v-317.44a7.314 7.314 0 0 1 7.314-7.314h58.514a7.314 7.314 0 0 1 7.315 7.314v317.44a109.714 109.714 0 0 1-99.182 109.203l-10.533 0.512H219.43a109.714 109.714 0 0 1-109.203-99.182l-0.512-10.533V219.43a109.714 109.714 0 0 1 99.182-109.203l10.533-0.512h299.666a7.314 7.314 0 0 1 7.314 7.315z m307.345 31.817l41.4 41.399a7.314 7.314 0 0 1 0 10.313L419.985 655.726a7.314 7.314 0 0 1-10.313 0l-41.399-41.4a7.314 7.314 0 0 1 0-10.312l455.168-455.168a7.314 7.314 0 0 1 10.313 0z"></path>
                </svg>
              </span>
            </div>

            <!-- 提交历史按钮 -->
            <div
              class="file-status-button"
              :class="{ active: currentView === 'commit-history' }"
              @click="selectCommitHistory"
            >
              <History :size="16" />
              <span>提交历史</span>
            </div>

            <!-- 暂存列表按钮 -->
            <div
              class="file-status-button"
              :class="{ active: currentView === 'stash-list' }"
              @click="selectStashList"
            >
              <Archive :size="16" />
              <span>暂存列表</span>
            </div>

            <!-- 本地分支 -->
            <div class="branch-section">
              <div class="branch-section-header" @click="toggleLocalBranches">
                <Folder :size="14" />
                <span>本地分支</span>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showLocalBranches }" />
              </div>
              <div v-if="showLocalBranches" class="branch-list">
                <div 
                  v-for="branch in allBranches" 
                  :key="branch"
                  class="branch-item"
                  :class="{ active: branch === currentBranch }"
                  @dblclick="switchBranch(branch)"
                  @contextmenu.prevent="showBranchContextMenu($event, branch, 'local')"
                >
                  <span class="branch-name">{{ branch }}</span>
                  <span v-if="getAllBranchStatus(branch)" class="branch-status-indicator">
                    <span v-if="getAllBranchStatus(branch).remoteAhead > 0" class="pull-indicator">
                      ↓{{ getAllBranchStatus(branch).remoteAhead }}
                    </span>
                    <span v-if="getAllBranchStatus(branch).localAhead > 0" class="push-indicator">
                      ↑{{ getAllBranchStatus(branch).localAhead }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 远程分支 -->
            <div class="branch-section">
              <div class="branch-section-header" @click="toggleRemoteBranches">
                <Globe :size="14" />
                <span>远程分支</span>
                <button 
                  class="refresh-btn" 
                  @click.stop="refreshRemoteBranches"
                  :class="{ refreshing: refreshing, success: refreshSuccess }"
                  title="刷新远程分支"
                >
                  <RefreshCw v-if="!refreshSuccess" :size="12" />
                  <Check v-else :size="12" />
                </button>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showRemoteBranches }" />
              </div>
              <div v-if="showRemoteBranches" class="branch-list">
                <div v-if="refreshing && remoteBranches.length === 0" class="empty-tags">加载中...</div>
                <div v-else-if="remoteBranches.length === 0" class="empty-tags">暂无远程分支</div>
                <div 
                  v-else
                  v-for="branch in remoteBranches" 
                  :key="branch"
                  class="branch-item remote-branch"
                  @dblclick="switchToRemoteBranch(branch.replace('origin/', ''))"
                  @contextmenu.prevent="showBranchContextMenu($event, branch, 'remote')"
                >
                  <span class="branch-name">{{ branch }}</span>
                </div>
              </div>
            </div>

            <!-- 标签 -->
            <div class="branch-section">
              <div class="branch-section-header" @click="toggleTags">
                <Tag :size="14" />
                <span>标签</span>
                <button
                  class="refresh-btn"
                  @click.stop="refreshTags"
                  :class="{ refreshing: tagsRefreshing, success: tagsRefreshSuccess }"
                  title="刷新标签"
                >
                  <RefreshCw v-if="!tagsRefreshSuccess" :size="12" />
                  <Check v-else :size="12" />
                </button>
                <ChevronRight :size="14" class="expand-arrow" :class="{ expanded: showTags }" />
              </div>
              <div v-if="showTags" class="branch-list">
                <div v-if="tagsLoading" class="empty-tags">加载中...</div>
                <div v-else-if="tags.length === 0" class="empty-tags">暂无标签</div>
                <div 
                  v-else
                  v-for="tag in tags" 
                  :key="tag.name"
                  class="tag-item"
                  @dblclick="checkoutTag(tag)"
                  @contextmenu.prevent="handleTagContextMenu($event, tag)"
                >
                  <span class="branch-name">{{ tag.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧内容区 -->
          <div class="right-panel">
            <!-- 文件状态 -->
            <ProjectFileStatus 
              v-show="currentView === 'file-status'"
              :project-path="path"
              :current-branch="currentBranch"
              :execute-command="executeCommand"
              :refresh-branch-status="loadBranchStatus"
              ref="fileStatusRef"
              @status-changed="handleFileStatusChanged"
              @pending-count-changed="handlePendingCountChanged"
            />

            <ProjectAiSessions
              v-if="currentView === 'ai-sessions'"
              :project-path="path"
              @resume-session="handleResumeAiSession"
            />

            <!-- 提交历史 -->
            <ProjectCommitHistory
              v-if="currentView === 'commit-history'"
              :project-path="path"
              :current-branch="currentBranch"
              :all-branches="allBranches"
              :refresh-token="commitHistoryRefreshToken"
              :execute-command="executeCommand"
              :refresh-branch-status="loadBranches"
              @switch-to-file-status="selectFileStatus"
            />

            <!-- 暂存列表 -->
            <ProjectStashList 
              v-if="currentView === 'stash-list'"
              :project-path="path"
              :execute-command="executeCommand"
              ref="stashListRef"
            />

            <!-- 终端 - 使用 v-show 保持存活，避免切换时重新创建 -->
            <TerminalPanel
              v-if="terminalMounted"
              v-show="currentView === 'terminal'"
              :default-cwd="terminalProjectPath"
              :is-active="isActive && currentView === 'terminal'"
              ref="terminalRef"
            />

          </div>
        </div>
      </div>
    </div>

    <!-- 操作进度对话框 -->
    <OperationDialog
      :show="showOperationDialog"
      :title="operationType"
      :output="operationOutput"
      :in-progress="operationInProgress"
      @cancel="cancelOperation"
    />

    <!-- 项目设置对话框 -->
    <ProjectSettingsDialog
      v-model:visible="showProjectSettings"
      :project-path="path"
      @confirm="onProjectSettingsConfirm"
    />

    <!-- 新建分支对话框 -->
    <div v-if="showCreateBranchDialog" class="dialog-overlay">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>新建分支</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>基于分支:</label>
            <CustomSelect v-model="baseBranch" :options="allBranches" placeholder="选择基于的分支" />
          </div>
          <div class="form-group">
            <label>分支名称:</label>
            <input v-model="newBranchName" type="text" placeholder="请输入分支名称" class="branch-input" @keyup.enter="createBranch" />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeCreateBranchDialog">取消</button>
          <button class="confirm-btn-large" @click="createBranch" :disabled="!newBranchName.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 删除分支对话框 -->
    <div v-if="showDeleteBranchDialog" class="dialog-overlay" @click="closeDeleteBranchDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>删除分支</h3></div>
        <div class="dialog-body">
          <p>确定要删除分支 <strong>{{ branchToDelete }}</strong> 吗？</p>
          <div class="form-group">
            <label><input type="checkbox" v-model="deleteRemoteBranch" /> 同时删除远程分支</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDeleteBranchDialog">取消</button>
          <button class="delete-btn-large" @click="confirmDeleteBranch">删除</button>
        </div>
      </div>
    </div>

    <!-- 合并分支对话框 -->
    <div v-if="showMergeBranchDialog" class="dialog-overlay" @click="closeMergeBranchDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>合并分支</h3></div>
        <div class="dialog-body">
          <p>将分支 <strong>{{ branchToMerge }}</strong> 合并到当前分支 <strong>{{ currentBranch }}</strong></p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeMergeBranchDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmMergeBranch">合并</button>
        </div>
      </div>
    </div>

    <!-- 创建标签对话框 -->
    <div v-if="showCreateTagDialog" class="dialog-overlay" @click="closeCreateTagDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>创建标签</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>标签名称：</label>
            <input ref="newTagNameInputRef" v-model="newTagName" type="text" placeholder="例如: v1.0.0" class="branch-input" @keyup.enter="confirmCreateTag" />
          </div>
          <div class="form-group">
            <label>标签信息（可选）：</label>
            <textarea v-model="newTagMessage" placeholder="标签描述信息" class="branch-input" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>基于提交（可选）：</label>
            <input v-model="tagCommit" type="text" placeholder="提交hash或分支名" class="branch-input" />
          </div>
          <div class="form-group">
            <label><input type="checkbox" v-model="pushTagAfterCreate" /> 创建后推送到远程</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeCreateTagDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmCreateTag" :disabled="!newTagName.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 删除标签对话框 -->
    <div v-if="showDeleteTagDialog" class="dialog-overlay" @click="closeDeleteTagDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>删除标签</h3></div>
        <div class="dialog-body">
          <p>确定要删除标签 <strong>{{ tagToDelete }}</strong> 吗？</p>
          <div class="form-group">
            <label><input type="checkbox" v-model="deleteRemoteTag" /> 同时删除远程标签</label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeDeleteTagDialog">取消</button>
          <button class="delete-btn-large" @click="confirmDeleteTag">删除</button>
        </div>
      </div>
    </div>

    <!-- 创建MR对话框 -->
    <div v-if="showCreateMRDialog" class="dialog-overlay">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple"><h3>创建 Merge Request</h3></div>
        <div class="dialog-body">
          <div class="form-group">
            <label>源分支：</label>
            <CustomSelect v-model="sourceBranchForMR" :options="mrBranchOptions" placeholder="选择源分支" />
          </div>
          <div class="form-group">
            <label>目标分支：</label>
            <CustomSelect v-model="targetBranchForMR" :options="mrBranchOptions" placeholder="选择目标分支" />
          </div>
          <div class="form-group">
            <label>MR标题：</label>
            <input v-model="mrTitle" type="text" placeholder="请输入MR标题" class="branch-input" />
          </div>
          <div class="form-group">
            <label>MR描述（可选）：</label>
            <textarea v-model="mrDescription" placeholder="请输入MR描述" class="mr-description" rows="3"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeMRDialog">取消</button>
          <button class="confirm-btn-large" @click="confirmCreateMR" :disabled="!sourceBranchForMR || !targetBranchForMR || !mrTitle.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 标签右键菜单 -->
    <div v-if="showTagContextMenu" class="context-menu" :style="{ left: tagContextMenuPosition.x + 'px', top: tagContextMenuPosition.y + 'px' }" @click.stop>
      <div class="context-menu-item" @click="copyTagName">复制标签名</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="checkoutTagAction">检出标签</div>
      <div class="context-menu-item" @click="createBranchFromTag">基于标签创建分支</div>
      <div class="context-menu-item" @click="pushTagAction">推送到远程</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="deleteTagAction">删除标签</div>
    </div>

    <!-- 分支右键菜单 -->
    <div v-if="showBranchContextMenuModal" class="context-menu" :style="{ top: branchContextMenuPosition.y + 'px', left: branchContextMenuPosition.x + 'px' }" @click.stop>
      <div class="context-menu-item" @click="copyBranchName">复制分支名</div>
      <div v-if="branchContextMenuType === 'local'" class="context-menu-item" @click="createBranchFromContext">创建分支</div>
      <div v-if="branchContextMenuType === 'remote'" class="context-menu-item" @click="createTagFromRemoteBranch">创建标签</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="checkoutBranchAction">检出分支 {{ branchContextMenuBranch }}</div>
      <div v-if="branchContextMenuType === 'local'" :class="['context-menu-item', { disabled: branchContextMenuBranch === currentBranch }]" @click="mergeBranchAction">
        合并分支 {{ branchContextMenuBranch }} 至 {{ currentBranch }}
      </div>
      <div v-if="branchContextMenuType === 'local'" :class="['context-menu-item', { disabled: branchContextMenuBranch === currentBranch }]" @click="deleteBranchAction">
        删除分支 {{ branchContextMenuBranch }}
      </div>
      <div v-if="branchContextMenuType === 'remote'" class="context-menu-item" @click="createMergeRequestFromBranch">
        Merge {{ branchContextMenuBranch }} 到目标分支
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  FolderOpen, GitBranch, Tag, GitPullRequest, ArrowUpCircle, GitMerge,
  Terminal as TerminalIcon, ExternalLink, FileText, History, Archive, Bot,
  Folder, Globe, RefreshCw, Check,   ChevronRight, Settings
} from 'lucide-vue-next'
import ProjectFileStatus from './ProjectFileStatus.vue'
import ProjectStashList from './ProjectStashList.vue'
import ProjectCommitHistory from './ProjectCommitHistory.vue'
import ProjectAiSessions from './ProjectAiSessions.vue'
import OperationDialog from '../dialog/OperationDialog.vue'
import ProjectSettingsDialog from '../dialog/ProjectSettingsDialog.vue'
import TerminalPanel from '../terminal/TerminalPanel.vue'
import CustomSelect from '../common/CustomSelect.vue'
import { useGitCommand } from '../../composables/useGitCommand'
import {
  buildProjectRefreshPlan,
  deriveBranchStatusState
} from './projectDetailRefresh.mjs'
import {
  useProjectStore,
  updateProjectDetail,
  updateBranchStatus as storeBranchStatus,
  updateAllBranchStatus as storeAllBranchStatus,
  getProjectDetail,
  getBranchStatus as getStoreBranchStatus
} from '../../stores/projectStore'

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

// 使用 Git 命令 composable
const {
  operationInProgress,
  operationCancelled,
  operationOutput,
  executeCommand,
  executeCommandWithProgress,
  cancelOperation: baseCancelOperation,
  startOperation,
  appendOutput
} = useGitCommand()

// ==================== Props ====================
const props = defineProps({
  path: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
})

// ==================== Emits ====================
const emit = defineEmits([
  'branchChanged',    // 分支切换时通知
  'statusUpdated',    // 状态更新时通知 (remoteAhead, localAhead)
  'navigate',         // 需要在新标签打开 URL
  'pendingStatusChanged' // 待定文件状态变化时通知（提交后刷新项目列表）
])

// ==================== Refs ====================
const fileStatusRef = ref(null)
const stashListRef = ref(null)
const terminalRef = ref(null)
const newTagNameInputRef = ref(null)

/** 传给嵌入式终端的项目根（解码 git: 路由里可能出现的 %20 等），保证主进程拿到真实绝对路径 */
const terminalProjectPath = computed(() => {
  const p = props.path
  if (!p || typeof p !== 'string') return ''
  try {
    return decodeURIComponent(p.trim())
  } catch {
    return p.trim()
  }
})

// ==================== 基础状态 ====================
const projectInfo = ref(null)
const currentBranch = ref('')
const allBranches = ref([])
const remoteBranches = ref([])
const tags = ref([])
const branchStatus = ref(null)
const allBranchStatus = ref({})
const statusLoading = ref(false)
const hasPendingFiles = ref(false) // 是否有待定文件

// ==================== UI 状态 ====================
// 从 localStorage 读取项目对应的视图状态，默认为 'terminal'
const getProjectViewKey = (path) => `projectView_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`
const getExpandStateKey = (path) => `expandState_${path?.replace(/[^a-zA-Z0-9]/g, '_') || 'default'}`

const getSavedCurrentView = (path) => {
  try {
    const saved = localStorage.getItem(getProjectViewKey(path))
    if (saved && ['file-status', 'commit-history', 'stash-list', 'terminal', 'ai-sessions'].includes(saved)) {
      return saved
    }
  } catch (e) {}
  return 'terminal'
}

// 保存展开状态到 localStorage
const saveExpandState = () => {
  try {
    if (props.path) {
      const state = {
        localBranches: showLocalBranches.value,
        remoteBranches: showRemoteBranches.value,
        tags: showTags.value
      }
      localStorage.setItem(getExpandStateKey(props.path), JSON.stringify(state))
    }
  } catch (e) {}
}

// 从 localStorage 读取展开状态
const restoreExpandState = (path) => {
  try {
    const saved = localStorage.getItem(getExpandStateKey(path))
    if (saved) {
      const state = JSON.parse(saved)
      showLocalBranches.value = state.localBranches ?? true
      showRemoteBranches.value = state.remoteBranches ?? false
      showTags.value = state.tags ?? false
    } else {
      // 默认值
      showLocalBranches.value = true
      showRemoteBranches.value = false
      showTags.value = false
    }
  } catch (e) {
    showLocalBranches.value = true
    showRemoteBranches.value = false
    showTags.value = false
  }
}

const currentView = ref('terminal')
const terminalMounted = ref(false)
const showLocalBranches = ref(true)
const showRemoteBranches = ref(false)
const showTags = ref(false)
const tagsLoading = ref(false)
const tagsRefreshing = ref(false)
const tagsRefreshSuccess = ref(false)
const commitHistoryRefreshToken = ref(0)
const refreshing = ref(false)
const refreshSuccess = ref(false)

// ==================== 操作对话框 ====================
const showOperationDialog = ref(false)
const operationType = ref('')

// ==================== 新建分支对话框 ====================
const showCreateBranchDialog = ref(false)
const baseBranch = ref('')
const newBranchName = ref('')

// ==================== 删除分支对话框 ====================
const showDeleteBranchDialog = ref(false)
const branchToDelete = ref('')
const deleteRemoteBranch = ref(false)

// ==================== 合并分支对话框 ====================
const showMergeBranchDialog = ref(false)
const branchToMerge = ref('')

// ==================== 创建标签对话框 ====================
const showCreateTagDialog = ref(false)
const newTagName = ref('')
const newTagMessage = ref('')
const tagCommit = ref('')
const pushTagAfterCreate = ref(true)

// ==================== 删除标签对话框 ====================
const showDeleteTagDialog = ref(false)
const tagToDelete = ref('')
const deleteRemoteTag = ref(false)

// ==================== 标签右键菜单 ====================
const showTagContextMenu = ref(false)
const tagContextMenuPosition = ref({ x: 0, y: 0 })
const tagContextMenuTag = ref(null)

// ==================== 分支右键菜单 ====================
const showBranchContextMenuModal = ref(false)
const branchContextMenuPosition = ref({ x: 0, y: 0 })
const branchContextMenuBranch = ref('')
const branchContextMenuType = ref('local')

// ==================== 创建MR对话框 ====================
const showCreateMRDialog = ref(false)
const sourceBranchForMR = ref('')
const targetBranchForMR = ref('')
const mrTitle = ref('')
const mrDescription = ref('')

// ==================== 项目设置对话框 ====================
const showProjectSettings = ref(false)

// ==================== 计算属性 ====================
const pullTitle = computed(() => {
  return branchStatus.value?.remoteAhead > 0 
    ? `拉取 ${branchStatus.value.remoteAhead} 个新提交` 
    : '拉取远程更新'
})

const pushTitle = computed(() => {
  return branchStatus.value?.localAhead > 0 
    ? `推送 ${branchStatus.value.localAhead} 个本地提交` 
    : '推送本地提交'
})

const mrBranchOptions = computed(() => {
  const branches = [...allBranches.value]
  const remote = remoteBranches.value.map(b => b.replace('origin/', ''))
  return [...new Set([...branches, ...remote])]
})

// ==================== 辅助方法 ====================
const getAllBranchStatus = (branch) => {
  return allBranchStatus.value?.[branch] || null
}

const emitBranchChanged = (projectPath, branch) => {
  if (!projectPath) return
  emit('branchChanged', { path: projectPath, branch })
}

const emitStatusUpdated = (projectPath, status = {}) => {
  if (!projectPath) return
  emit('statusUpdated', {
    path: projectPath,
    remoteAhead: status.remoteAhead || 0,
    localAhead: status.localAhead || 0
  })
}

const emitPendingStatusChanged = (projectPath, hasPending = hasPendingFiles.value) => {
  if (!projectPath) return
  emit('pendingStatusChanged', {
    path: projectPath,
    hasPendingFiles: !!hasPending
  })
}

const markRefreshSuccess = (target) => {
  target.value = true
  window.setTimeout(() => {
    target.value = false
  }, 1500)
}

const clearProjectBranchStatusCache = async (projectPath) => {
  if (!projectPath || !window.electronAPI?.clearBranchStatusCache) return
  try {
    await window.electronAPI.clearBranchStatusCache({ path: projectPath })
  } catch (error) {
    console.warn('清除分支状态缓存失败:', error)
  }
}

const openOperationDialog = (type, initialOutput = '') => {
  showOperationDialog.value = true
  operationType.value = type
  startOperation(initialOutput)
}

const appendProgressOutput = (output) => {
  appendOutput(output)
}

const finishOperation = ({ hideDialog = false } = {}) => {
  operationInProgress.value = false
  if (hideDialog) {
    showOperationDialog.value = false
  }
}

const bumpCommitHistoryRevision = () => {
  commitHistoryRefreshToken.value += 1
}

const queueProjectRefresh = ({
  reloadBranches = false,
  reloadBranchStatus = false,
  reloadFileStatus = false,
  preserveFileStatus = false,
  reloadTags = false,
  reloadCommitHistory = false
} = {}) => {
  const projectPath = props.path
  if (!projectPath) return

  const refreshPlan = buildProjectRefreshPlan({
    reloadBranches,
    reloadBranchStatus,
    reloadFileStatus,
    preserveFileStatus,
    reloadTags,
    reloadCommitHistory
  }, {
    showTags: showTags.value
  })

  ;(async () => {
    try {
      await clearProjectBranchStatusCache(projectPath)

      const tasks = []

      if (refreshPlan.reloadBranches) {
        tasks.push(loadBranches())
      } else if (refreshPlan.reloadBranchStatus) {
        tasks.push(loadBranchStatus())
      }

      if (refreshPlan.reloadTags) {
        tasks.push(loadTags())
      }

      if (tasks.length > 0) {
        const results = await Promise.allSettled(tasks)
        results
          .filter(result => result.status === 'rejected')
          .forEach(result => {
            console.error('刷新子任务失败:', result.reason)
          })
      }

      if (refreshPlan.reloadFileStatus) {
        fileStatusRef.value?.loadFileStatus?.(refreshPlan.preserveFileStatus)
      }

      if (refreshPlan.reloadCommitHistory) {
        bumpCommitHistoryRevision()
      }
    } catch (error) {
      console.error('刷新状态失败:', error)
    }
  })()
}

// ==================== 项目加载 ====================
const loadCurrentBranchQuick = async () => {
  if (!props.path) return

  const currentPath = props.path

  try {
    const branchResult = await executeCommand(
      `cd "${currentPath}" && git branch --show-current 2>/dev/null`
    )

    if (!isCurrentProjectPath(currentPath)) {
      debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
      return
    }

    let nextBranch = branchResult.success ? branchResult.output?.trim() || '' : ''

    if (!nextBranch) {
      const tagResult = await executeCommand(
        `cd "${currentPath}" && git describe --tags --exact-match HEAD 2>/dev/null`
      )

      if (!isCurrentProjectPath(currentPath)) {
        debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
        return
      }

      if (tagResult.success && tagResult.output?.trim()) {
        nextBranch = `HEAD detached at ${tagResult.output.trim()}`
      } else {
        const commitResult = await executeCommand(
          `cd "${currentPath}" && git rev-parse --short HEAD 2>/dev/null`
        )

        if (!isCurrentProjectPath(currentPath)) {
          debugLog('⚠️ [loadCurrentBranchQuick] 项目已切换，丢弃旧数据')
          return
        }

        nextBranch = commitResult.success && commitResult.output?.trim()
          ? `HEAD detached at ${commitResult.output.trim()}`
          : 'HEAD detached'
      }
    }

    if (nextBranch && currentBranch.value !== nextBranch) {
      currentBranch.value = nextBranch
      updateProjectDetail(currentPath, { currentBranch: nextBranch })
      emitBranchChanged(currentPath, nextBranch)
    }
  } catch (error) {
    console.error('快速加载当前分支失败:', error)
  }
}

const loadProjectInfo = ({
  forceRefreshRemoteBranches = false,
  forceRefreshTags = false,
  refreshBranchStatus = true
} = {}) => {
  if (!props.path) {
    projectInfo.value = null
    return
  }
  
  // 从路径提取项目名（同步操作，立即显示）
  const pathParts = props.path.split('/')
  const name = pathParts[pathParts.length - 1]
  
  projectInfo.value = {
    path: props.path,
    name: name
  }

  setTimeout(() => {
    loadCurrentBranchQuick().catch(err => console.error('快速加载当前分支失败:', err))
    loadLocalBranches().catch(err => console.error('加载本地分支失败:', err))

    if (refreshBranchStatus) {
      loadBranchStatus().catch(err => console.error('加载分支状态失败:', err))
    }

    if (
      showRemoteBranches.value &&
      (forceRefreshRemoteBranches || remoteBranches.value.length === 0) &&
      !refreshing.value
    ) {
      loadRemoteBranches().catch(err => console.error('加载远程分支失败:', err))
    }

    if (
      showTags.value &&
      (forceRefreshTags || tags.value.length === 0) &&
      !tagsLoading.value
    ) {
      loadTags().catch(err => console.error('加载标签失败:', err))
    }
  }, 0)
}

const isCurrentProjectPath = (path) => !!path && props.path === path

const fetchCurrentBranchListData = async (label) => {
  const currentPath = props.path
  if (!currentPath) return null

  const result = await window.electronAPI.getBranchList({ path: currentPath })
  if (!isCurrentProjectPath(currentPath)) {
    debugLog(`⚠️ [${label}] 项目已切换，丢弃旧数据`)
    return null
  }

  if (!result.success || !result.data) {
    return { currentPath, data: null }
  }

  return {
    currentPath,
    data: result.data
  }
}

const applyBranchListData = (currentPath, data, {
  includeLocal = false,
  includeRemote = false,
  triggerPendingCheck = false,
  triggerBranchStatusRefresh = false
} = {}) => {
  if (!currentPath || !data) return

  const localBranches = data.all || []
  const remoteBranchList = data.remote || []
  const activeBranch = data.current || 'unknown'
  const storePayload = {}

  if (includeLocal) {
    allBranches.value = localBranches
    currentBranch.value = activeBranch
    storePayload.localBranches = localBranches
    storePayload.currentBranch = data.current || ''
    emitBranchChanged(currentPath, currentBranch.value)
  }

  if (includeRemote) {
    remoteBranches.value = remoteBranchList
    storePayload.remoteBranches = remoteBranchList
  }

  if (Object.keys(storePayload).length > 0) {
    updateProjectDetail(currentPath, storePayload)
  }

  if (triggerPendingCheck) {
    checkPendingFiles()
  }

  if (triggerBranchStatusRefresh && allBranches.value.length > 0 && !currentBranch.value.includes('HEAD detached')) {
    loadBranchStatus()
  }
}

// 检查是否有待定文件
const checkPendingFiles = async () => {
  if (!props.path) return
  
  const currentPath = props.path // 保存当前路径，用于检查是否切换了项目
  
  try {
    const result = await executeCommand(`cd "${currentPath}" && git status --porcelain`)
    
    // 检查项目是否已切换，如果切换了则不更新数据
    if (props.path !== currentPath) {
      debugLog('⚠️ [checkPendingFiles] 项目已切换，丢弃旧数据')
      return
    }
    
    if (result.success) {
      const output = result.output?.trim() || ''
      hasPendingFiles.value = output.length > 0
    }
  } catch (error) {
    console.error('检查待定文件失败:', error)
  }
}

const loadLocalBranches = async () => {
  try {
    const snapshot = await fetchCurrentBranchListData('loadLocalBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeLocal: true,
      triggerPendingCheck: true
    })
  } catch (error) {
    console.error('加载本地分支列表失败:', error)
  }
}

const loadRemoteBranches = async () => {
  if (!props.path || refreshing.value) return
  refreshing.value = true
  
  try {
    const snapshot = await fetchCurrentBranchListData('loadRemoteBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeRemote: true
    })
  } catch (error) {
    console.error('加载远程分支列表失败:', error)
  } finally {
    refreshing.value = false
  }
}

const loadBranches = async () => {
  try {
    const snapshot = await fetchCurrentBranchListData('loadBranches')
    if (!snapshot?.data) return

    applyBranchListData(snapshot.currentPath, snapshot.data, {
      includeLocal: true,
      includeRemote: true,
      triggerBranchStatusRefresh: true
    })
  } catch (error) {
    console.error('加载分支列表失败:', error)
  }
}

const loadBranchStatus = async () => {
  if (!props.path) return

  const currentPath = props.path // 保存当前路径，用于检查是否切换了项目
  statusLoading.value = true

  try {
    const result = await window.electronAPI.getBranchStatus({ path: currentPath })

    // 检查项目是否已切换，如果切换了则不更新数据
    if (props.path !== currentPath) {
      debugLog('⚠️ [loadBranchStatus] 项目已切换，丢弃旧数据')
      return
    }

    if (result.success && result.data) {
      const nextState = deriveBranchStatusState({
        existingCurrentBranch: currentBranch.value,
        statusPayload: result.data
      })

      branchStatus.value = nextState.branchStatus
      allBranchStatus.value = nextState.allBranchStatus

      if (nextState.currentBranch && currentBranch.value !== nextState.currentBranch) {
        currentBranch.value = nextState.currentBranch
        updateProjectDetail(currentPath, { currentBranch: nextState.currentBranch })
        emitBranchChanged(currentPath, nextState.currentBranch)
      }
      
      // 同步到 store
      if (branchStatus.value) {
        storeBranchStatus(currentPath, branchStatus.value)
      }
      if (Object.keys(nextState.allBranchStatus).length > 0) {
        storeAllBranchStatus(currentPath, nextState.allBranchStatus)
      }
      
      // 通知父组件状态更新
      if (branchStatus.value) {
        emitStatusUpdated(currentPath, branchStatus.value)
      }
    }
  } catch (error) {
    console.error('加载分支状态失败:', error)
  } finally {
    statusLoading.value = false
  }
}

const loadTags = async () => {
  if (!props.path || tagsLoading.value) return

  const currentPath = props.path
  
  tagsLoading.value = true
  
  try {
    const localResult = await executeCommand(`cd "${currentPath}" && git tag -l`)
    const localTags = localResult.success && localResult.output?.trim() 
      ? localResult.output.trim().split('\n').filter(t => t)
      : []
    
    const remoteResult = await executeCommand(`cd "${currentPath}" && git ls-remote --tags origin 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' | sed 's/\\^{}//' | sort -u`)
    const remoteTags = remoteResult.success && remoteResult.output?.trim()
      ? remoteResult.output.trim().split('\n').filter(t => t)
      : []

    if (!isCurrentProjectPath(currentPath)) {
      debugLog('⚠️ [loadTags] 项目已切换，丢弃旧数据')
      return
    }
    
    tags.value = [...new Set([...localTags, ...remoteTags])].map(name => ({
      name,
      isRemote: remoteTags.includes(name),
      isLocal: localTags.includes(name)
    })).sort((a, b) => a.name.localeCompare(b.name))
    
    // 同步到 store
    updateProjectDetail(currentPath, { tags: tags.value })
  } catch (error) {
    console.error('加载标签失败:', error)
    if (isCurrentProjectPath(currentPath)) {
      tags.value = []
    }
    throw error
  } finally {
    if (isCurrentProjectPath(currentPath)) {
      tagsLoading.value = false
    }
  }
}

const refreshTags = async () => {
  if (!props.path || tagsRefreshing.value || tagsLoading.value) return

  tagsRefreshing.value = true
  tagsRefreshSuccess.value = false

  try {
    await loadTags()
    markRefreshSuccess(tagsRefreshSuccess)
  } catch (error) {
    console.error('刷新标签失败:', error)
  } finally {
    tagsRefreshing.value = false
  }
}

// ==================== 视图切换 ====================
// 保存项目的视图状态到 localStorage
const saveCurrentView = (view) => {
  try {
    if (props.path) {
      localStorage.setItem(getProjectViewKey(props.path), view)
    }
  } catch (e) {}
}

const selectFileStatus = () => {
  currentView.value = 'file-status'
  saveCurrentView('file-status')
  if (fileStatusRef.value) {
    fileStatusRef.value.loadFileStatus?.(true)
  }
}

const selectAiSessions = () => {
  currentView.value = 'ai-sessions'
  saveCurrentView('ai-sessions')
}

// 处理文件状态变化（提交后）
const handleFileStatusChanged = async () => {
  debugLog('🔄 [ProjectDetailNew] 文件状态变化')
  
  // 检查是否有远程仓库
  let hasRemote = false
  try {
    const checkRemoteResult = await window.electronAPI.executeCommand({
      command: 'git remote',
      cwd: props.path
    })
    hasRemote = checkRemoteResult.success && checkRemoteResult.output?.trim()
  } catch (e) {
    debugLog('检查远程仓库失败:', e)
  }
  
  // 只有有远程仓库时才增加 localAhead
  if (hasRemote) {
    debugLog('🔄 [ProjectDetailNew] 有远程仓库，localAhead + 1')
  const newLocalAhead = (branchStatus.value?.localAhead || 0) + 1
  if (branchStatus.value) {
    branchStatus.value.localAhead = newLocalAhead
  }
  // 更新 allBranchStatus 中当前分支的状态
  if (allBranchStatus.value && currentBranch.value && allBranchStatus.value[currentBranch.value]) {
    allBranchStatus.value[currentBranch.value].localAhead = newLocalAhead
  }
  // 通知 GitProject 更新项目列表
  emitStatusUpdated(props.path, {
    remoteAhead: branchStatus.value?.remoteAhead || 0,
    localAhead: newLocalAhead
  })
  } else {
    debugLog('🔄 [ProjectDetailNew] 本地仓库，不增加 localAhead')
  }
  
  bumpCommitHistoryRevision()
  emitPendingStatusChanged(props.path)
}

// 处理待定文件数量变化
const handlePendingCountChanged = (count) => {
  const changed = hasPendingFiles.value !== (count > 0)
  hasPendingFiles.value = count > 0
  // 状态变化时通知父组件刷新项目列表的待定文件图标
  if (changed) {
    emitPendingStatusChanged(props.path, count > 0)
  }
}

const selectCommitHistory = () => {
  currentView.value = 'commit-history'
  saveCurrentView('commit-history')
}

const selectStashList = () => {
  currentView.value = 'stash-list'
  saveCurrentView('stash-list')
  if (stashListRef.value) {
    stashListRef.value.loadStashList?.()
  }
}

const selectTerminal = () => {
  terminalMounted.value = true
  currentView.value = 'terminal'
  saveCurrentView('terminal')
  if (props.isActive) {
    nextTick(() => {
      terminalRef.value?.ensureDefaultTerminal?.(terminalProjectPath.value)
    })
  }
}

const handleResumeAiSession = async (session) => {
  const command = typeof session?.command === 'string' ? session.command.trim() : ''
  if (!command) return

  terminalMounted.value = true
  currentView.value = 'terminal'
  saveCurrentView('terminal')

  await nextTick()

  if (props.isActive) {
    await terminalRef.value?.runCommand?.(command, {
      cwd: session.cwd || terminalProjectPath.value
    })
  }
}

// 展开/折叠本地分支
const toggleLocalBranches = () => {
  showLocalBranches.value = !showLocalBranches.value
  saveExpandState()
}

const toggleTags = () => {
  showTags.value = !showTags.value
  saveExpandState()
  // 展开时，如果没有缓存且不在加载中，则加载标签
  if (showTags.value && tags.value.length === 0 && !tagsLoading.value) {
    loadTags()
  }
}

// 展开/折叠远程分支
const toggleRemoteBranches = () => {
  showRemoteBranches.value = !showRemoteBranches.value
  saveExpandState()
  // 展开时，如果没有缓存且不在加载中，则加载远程分支
  if (showRemoteBranches.value && remoteBranches.value.length === 0 && !refreshing.value) {
    loadRemoteBranches()
  }
}

// ==================== 分支操作 ====================
const switchBranch = async (branchName) => {
  if (!props.path || branchName === currentBranch.value) return
  
  openOperationDialog('切换分支', `正在切换到分支 "${branchName}"...\n`)
  
  try {
    const command = `cd "${props.path}" && git checkout "${branchName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支切换失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 切换分支失败: ${error.message}`
  }
}

const switchToRemoteBranch = async (branchName) => {
  if (!props.path) return
  
  openOperationDialog('切换远程分支', `正在切换到远程分支 "${branchName}"...\n`)
  
  // 检查本地分支是否存在
  const checkResult = await executeCommand(`cd "${props.path}" && git show-ref --verify --quiet refs/heads/"${branchName}"`)
  
  if (checkResult.success) {
    finishOperation()
    operationOutput.value = `❌ 本地分支 "${branchName}" 已存在\n请双击本地分支列表中的 "${branchName}" 来切换`
    return
  }
  
  try {
    const command = `cd "${props.path}" && git checkout -b "${branchName}" origin/"${branchName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 远程分支切换失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 切换远程分支失败: ${error.message}`
  }
}

// ==================== Pull/Push ====================
const pullProject = async () => {
  if (!props.path) return
  
  openOperationDialog('拉取代码', '正在拉取代码...\n')
  
  try {
    // 🔧 步骤1：检查是否设置了上游分支
    operationOutput.value += '检查上游分支设置...\n'
    const upstreamCheck = await executeCommand(`cd "${props.path}" && git rev-parse --abbrev-ref @{upstream} 2>/dev/null`)
    
    if (!upstreamCheck.success || !upstreamCheck.output?.trim()) {
      // 没有设置上游分支，尝试自动设置
      operationOutput.value += '⚠️ 未设置上游分支，尝试自动设置...\n'
      const branch = currentBranch.value
      const setUpstreamCmd = `cd "${props.path}" && git branch --set-upstream-to=origin/${branch} ${branch} 2>/dev/null || git push -u origin ${branch} 2>/dev/null`
      const setResult = await executeCommandWithProgress(setUpstreamCmd, appendProgressOutput)
      
      if (!setResult.success) {
        operationOutput.value += '\n⚠️ 无法自动设置上游分支，尝试直接拉取...\n'
      }
    }
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 🔧 步骤2：先执行 fetch 获取最新远程状态
    operationOutput.value += '\n获取远程更新...\n'
    await executeCommandWithProgress(`cd "${props.path}" && git fetch origin`, appendProgressOutput)
    
    if (operationCancelled.value) {
      operationOutput.value += '\n\n❌ 操作已取消'
      operationInProgress.value = false
      return
    }
    
    // 🔧 步骤3：执行拉取
    operationOutput.value += '\n拉取远程更改...\n'
    const command = `cd "${props.path}" && git pull --no-rebase`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    // 🔧 步骤4：检查是否有冲突
    const conflictCheck = await executeCommand(`cd "${props.path}" && git diff --name-only --diff-filter=U`)
    const hasConflicts = conflictCheck.success && conflictCheck.output?.trim()

    finishOperation()

    if (hasConflicts) {
      operationOutput.value += '\n\n⚠️ 拉取完成，但存在合并冲突！\n'
      operationOutput.value += '请在"文件状态"中解决冲突后提交。\n'
      operationOutput.value += '冲突文件:\n' + conflictCheck.output
    } else if (result.success) {
      showOperationDialog.value = false
    } else {
      // 分析错误类型给出更友好的提示
      const errorMsg = result.error || result.output || ''
      if (errorMsg.includes('no tracking information') || errorMsg.includes('no upstream')) {
        operationOutput.value += '\n\n❌ 拉取失败: 当前分支没有关联远程分支\n'
        operationOutput.value += `尝试运行: git push -u origin ${currentBranch.value}`
      } else if (errorMsg.includes('local changes')) {
        operationOutput.value += '\n\n❌ 拉取失败: 存在未提交的本地更改\n'
        operationOutput.value += '请先提交或暂存本地更改后再拉取。'
      } else if (errorMsg.includes('CONFLICT') || errorMsg.includes('conflict')) {
        operationOutput.value += '\n\n⚠️ 拉取时发生冲突\n'
        operationOutput.value += '请在"文件状态"中解决冲突。'
      } else {
        operationOutput.value += '\n\n❌ 拉取失败: ' + errorMsg
      }
    }
    queueProjectRefresh({ reloadBranchStatus: true, reloadFileStatus: true, preserveFileStatus: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 拉取失败: ${error.message}`
  }
}

const pushProject = async () => {
  if (!props.path) return
  
  openOperationDialog('推送代码', '正在推送代码...\n')
  
  try {
    // 🔧 检查是否设置了上游分支
    const upstreamCheck = await executeCommand(`cd "${props.path}" && git rev-parse --abbrev-ref @{upstream} 2>/dev/null`)
    
    let command = ''
    if (!upstreamCheck.success || !upstreamCheck.output?.trim()) {
      // 没有设置上游分支，使用 -u 参数
      operationOutput.value += '设置上游分支并推送...\n'
      command = `cd "${props.path}" && git push -u origin ${currentBranch.value}`
    } else {
      command = `cd "${props.path}" && git push`
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranchStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      // 分析错误类型给出更友好的提示
      const errorMsg = result.error || result.output || ''
      if (errorMsg.includes('rejected') && (errorMsg.includes('non-fast-forward') || errorMsg.includes('fetch first'))) {
        operationOutput.value += '\n\n❌ 推送失败: 远程有新的提交\n'
        operationOutput.value += '请先拉取远程更新后再推送。'
      } else if (errorMsg.includes('no upstream') || errorMsg.includes('no tracking')) {
        operationOutput.value += '\n\n❌ 推送失败: 当前分支没有关联远程分支\n'
        operationOutput.value += `正在尝试设置上游分支...`
        // 尝试自动设置并推送
        const retryResult = await executeCommandWithProgress(`cd "${props.path}" && git push -u origin ${currentBranch.value}`, appendProgressOutput)
        if (retryResult.success) {
          // 推送成功后，直接将 localAhead 设为 0
          if (branchStatus.value) {
            branchStatus.value.localAhead = 0
          }
          if (allBranchStatus.value && currentBranch.value && allBranchStatus.value[currentBranch.value]) {
            allBranchStatus.value[currentBranch.value].localAhead = 0
          }
          // 通知 GitProject 更新项目列表
          emitStatusUpdated(props.path, {
            remoteAhead: branchStatus.value?.remoteAhead || 0,
            localAhead: 0
          })
          operationOutput.value += '\n\n✅ 推送完成'
          showOperationDialog.value = false
          queueProjectRefresh({ reloadBranchStatus: true, reloadCommitHistory: true })
          return
        }
        operationOutput.value += '\n\n❌ 推送失败'
      } else if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
        operationOutput.value += '\n\n❌ 推送失败: 权限不足\n'
        operationOutput.value += '请检查您的 Git 凭据设置。'
      } else {
        operationOutput.value += '\n\n❌ 推送失败: ' + errorMsg
      }
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 推送失败: ${error.message}`
  }
}

// ==================== 刷新远程分支 ====================
const refreshRemoteBranches = async () => {
  if (!props.path || refreshing.value) return
  
  refreshing.value = true
  refreshSuccess.value = false
  
  try {
    const result = await window.electronAPI.refreshRemote({ path: props.path })
    
    if (result.success) {
      if (result.data?.remote) {
        remoteBranches.value = result.data.remote
        updateProjectDetail(props.path, { remoteBranches: result.data.remote })
      }
      if (result.data?.currentBranchStatus) {
        branchStatus.value = result.data.currentBranchStatus
        storeBranchStatus(props.path, result.data.currentBranchStatus)
        emitStatusUpdated(props.path, branchStatus.value)
      }
      if (result.data?.allBranchStatus) {
        allBranchStatus.value = result.data.allBranchStatus
        storeAllBranchStatus(props.path, result.data.allBranchStatus)
      }
      bumpCommitHistoryRevision()
      markRefreshSuccess(refreshSuccess)
    }
  } catch (error) {
    console.error('刷新远程分支失败:', error)
  } finally {
    refreshing.value = false
  }
}

// ==================== 新建分支 ====================
const openCreateBranchDialog = () => {
  baseBranch.value = currentBranch.value
  newBranchName.value = ''
  showCreateBranchDialog.value = true
}

const closeCreateBranchDialog = () => {
  showCreateBranchDialog.value = false
  newBranchName.value = ''
  baseBranch.value = ''
}

const createBranch = async () => {
  if (!props.path || !newBranchName.value.trim()) return
  
  const branchName = newBranchName.value.trim()
  const fromBranch = baseBranch.value || currentBranch.value
  
  showCreateBranchDialog.value = false
  openOperationDialog('创建分支', `正在创建分支 "${branchName}" 基于 "${fromBranch}"...\n`)
  
  try {
    let command = ''
    if (fromBranch !== currentBranch.value) {
      command = `cd "${props.path}" && git checkout "${fromBranch}" && git checkout -b "${branchName}"`
    } else {
      command = `cd "${props.path}" && git checkout -b "${branchName}"`
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支创建失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建分支失败: ${error.message}`
  }
}

// ==================== 分支右键菜单 ====================
const showBranchContextMenu = (event, branch, type) => {
  branchContextMenuBranch.value = type === 'remote' ? branch.replace('origin/', '') : branch
  branchContextMenuType.value = type
  branchContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showBranchContextMenuModal.value = true
  
  const closeMenu = () => {
    showBranchContextMenuModal.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

const checkoutBranchAction = () => {
  showBranchContextMenuModal.value = false
  if (branchContextMenuType.value === 'local') {
    switchBranch(branchContextMenuBranch.value)
  } else {
    switchToRemoteBranch(branchContextMenuBranch.value)
  }
}

const createBranchFromContext = () => {
  showBranchContextMenuModal.value = false
  baseBranch.value = branchContextMenuBranch.value
  newBranchName.value = ''
  showCreateBranchDialog.value = true
}

const createTagFromRemoteBranch = () => {
  if (!branchContextMenuBranch.value) return
  showBranchContextMenuModal.value = false
  newTagName.value = ''
  newTagMessage.value = ''
  tagCommit.value = `origin/${branchContextMenuBranch.value}`
  pushTagAfterCreate.value = true
  showCreateTagDialog.value = true
}

const mergeBranchAction = () => {
  if (branchContextMenuBranch.value === currentBranch.value) return
  showBranchContextMenuModal.value = false
  branchToMerge.value = branchContextMenuBranch.value
  showMergeBranchDialog.value = true
}

const copyBranchName = async () => {
  showBranchContextMenuModal.value = false
  if (branchContextMenuBranch.value) {
    try {
      await navigator.clipboard.writeText(branchContextMenuBranch.value)
      debugLog('✅ 分支名已复制:', branchContextMenuBranch.value)
    } catch (error) {
      console.error('复制分支名失败:', error)
    }
  }
}

const deleteBranchAction = () => {
  if (branchContextMenuBranch.value === currentBranch.value) return
  showBranchContextMenuModal.value = false
  branchToDelete.value = branchContextMenuBranch.value
  deleteRemoteBranch.value = false
  showDeleteBranchDialog.value = true
}

const createMergeRequestFromBranch = () => {
  showBranchContextMenuModal.value = false
  sourceBranchForMR.value = branchContextMenuBranch.value
  targetBranchForMR.value = ''
  mrTitle.value = ''
  mrDescription.value = ''
  showCreateMRDialog.value = true
}

// ==================== 删除分支 ====================
const closeDeleteBranchDialog = () => {
  showDeleteBranchDialog.value = false
  branchToDelete.value = ''
  deleteRemoteBranch.value = false
}

const confirmDeleteBranch = async () => {
  if (!props.path || !branchToDelete.value) return
  
  const branch = branchToDelete.value
  const deleteRemote = deleteRemoteBranch.value
  
  showDeleteBranchDialog.value = false
  openOperationDialog('删除分支', `正在删除分支 "${branch}"${deleteRemote ? ' (包括远程分支)' : ''}...\n`)
  
  try {
    // 删除本地分支
    let command = `cd "${props.path}" && git branch -D "${branch}"`
    await executeCommandWithProgress(command, appendProgressOutput)
    
    // 删除远程分支
    if (deleteRemote) {
      operationOutput.value += '\n正在删除远程分支...\n'
      const remoteCommand = `cd "${props.path}" && git push origin --delete "${branch}"`
      await executeCommandWithProgress(remoteCommand, appendProgressOutput)
    }
    
    finishOperation({ hideDialog: true })
    queueProjectRefresh({ reloadBranches: true, reloadBranchStatus: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 删除分支失败: ${error.message}`
  }
}

// ==================== 合并分支 ====================
const closeMergeBranchDialog = () => {
  showMergeBranchDialog.value = false
  branchToMerge.value = ''
}

const confirmMergeBranch = async () => {
  if (!props.path || !branchToMerge.value) return
  
  const branch = branchToMerge.value
  
  showMergeBranchDialog.value = false
  openOperationDialog('合并分支', `正在将分支 "${branch}" 合并到 "${currentBranch.value}"...\n`)
  
  try {
    const command = `cd "${props.path}" && git merge "${branch}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 分支合并失败: ' + (result.error || '')
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 合并分支失败: ${error.message}`
  }
}

// ==================== 标签操作 ====================
const checkoutTag = async (tag) => {
  if (!props.path || !tag) return
  
  openOperationDialog('检出标签', `正在检出标签 "${tag.name}"...\n注意: 这将进入detached HEAD状态\n`)
  
  try {
    const command = `cd "${props.path}" && git checkout "${tag.name}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      // detached HEAD 状态下没有远程跟踪分支，清除 push/pull 计数
      branchStatus.value = null
      emitStatusUpdated(props.path, { remoteAhead: 0, localAhead: 0 })
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadBranches: true, reloadFileStatus: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 检出标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 检出标签失败: ${error.message}`
  }
}

const handleTagContextMenu = (event, tag) => {
  event.preventDefault()
  tagContextMenuTag.value = tag
  tagContextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showTagContextMenu.value = true
  
  const closeMenu = () => {
    showTagContextMenu.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

const copyTagName = async () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    try {
      await navigator.clipboard.writeText(tagContextMenuTag.value.name)
      debugLog('✅ 标签名已复制:', tagContextMenuTag.value.name)
    } catch (error) {
      console.error('复制标签名失败:', error)
    }
  }
}

const checkoutTagAction = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    checkoutTag(tagContextMenuTag.value)
  }
}

const createBranchFromTag = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    baseBranch.value = tagContextMenuTag.value.name
    newBranchName.value = ''
    showCreateBranchDialog.value = true
  }
}

const pushTagAction = async () => {
  if (!tagContextMenuTag.value || !props.path) return
  
  const tagName = tagContextMenuTag.value.name
  showTagContextMenu.value = false
  
  openOperationDialog('推送标签', `正在推送标签 "${tagName}" 到远程...\n`)
  
  try {
    const command = `cd "${props.path}" && git push origin "${tagName}"`
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 推送标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 推送标签失败: ${error.message}`
  }
}

const deleteTagAction = () => {
  showTagContextMenu.value = false
  if (tagContextMenuTag.value) {
    tagToDelete.value = tagContextMenuTag.value.name
    deleteRemoteTag.value = false
    showDeleteTagDialog.value = true
  }
}

// ==================== 创建标签 ====================
const openCreateTagDialog = () => {
  newTagName.value = ''
  newTagMessage.value = ''
  tagCommit.value = ''
  pushTagAfterCreate.value = true
  showCreateTagDialog.value = true
}

const closeCreateTagDialog = () => {
  showCreateTagDialog.value = false
}

const confirmCreateTag = async () => {
  if (!props.path || !newTagName.value.trim()) return
  
  const tagName = newTagName.value.trim()
  
  showCreateTagDialog.value = false
  openOperationDialog('创建标签', `正在创建标签 "${tagName}"...\n`)
  
  try {
    let command = ''
    if (tagCommit.value.trim()) {
      if (newTagMessage.value.trim()) {
        command = `cd "${props.path}" && git tag -a "${tagName}" -m "${newTagMessage.value.trim()}" "${tagCommit.value.trim()}"`
      } else {
        command = `cd "${props.path}" && git tag "${tagName}" "${tagCommit.value.trim()}"`
      }
    } else {
      if (newTagMessage.value.trim()) {
        command = `cd "${props.path}" && git tag -a "${tagName}" -m "${newTagMessage.value.trim()}"`
      } else {
        command = `cd "${props.path}" && git tag "${tagName}"`
      }
    }
    
    const result = await executeCommandWithProgress(command, appendProgressOutput)
    
    if (result.success) {
      if (pushTagAfterCreate.value) {
        operationOutput.value += '\n正在推送到远程...\n'
        const pushCommand = `cd "${props.path}" && git push origin "${tagName}"`
        await executeCommandWithProgress(pushCommand, appendProgressOutput)
      }
      
      finishOperation({ hideDialog: true })
      queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
    } else {
      finishOperation()
      operationOutput.value += '\n\n❌ 创建标签失败'
    }
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建标签失败: ${error.message}`
  }
}

// ==================== 删除标签 ====================
const closeDeleteTagDialog = () => {
  showDeleteTagDialog.value = false
  tagToDelete.value = ''
  deleteRemoteTag.value = false
}

const confirmDeleteTag = async () => {
  if (!props.path || !tagToDelete.value) return
  
  const tagName = tagToDelete.value
  const deleteRemote = deleteRemoteTag.value
  
  showDeleteTagDialog.value = false
  openOperationDialog('删除标签', `正在删除标签 "${tagName}"${deleteRemote ? ' (包括远程标签)' : ''}...\n`)
  
  try {
    const command = `cd "${props.path}" && git tag -d "${tagName}"`
    await executeCommandWithProgress(command, appendProgressOutput)
    
    if (deleteRemote) {
      operationOutput.value += '\n正在删除远程标签...\n'
      const remoteCommand = `cd "${props.path}" && git push origin :refs/tags/${tagName}`
      await executeCommandWithProgress(remoteCommand, appendProgressOutput)
    }
    
    finishOperation({ hideDialog: true })
    queueProjectRefresh({ reloadTags: true, reloadCommitHistory: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 删除标签失败: ${error.message}`
  }
}

// ==================== 创建 MR ====================
const openMRDialog = () => {
  sourceBranchForMR.value = currentBranch.value
  targetBranchForMR.value = ''
  mrTitle.value = ''
  mrDescription.value = ''
  showCreateMRDialog.value = true
}

const closeMRDialog = () => {
  showCreateMRDialog.value = false
}

const confirmCreateMR = async () => {
  if (!props.path || !sourceBranchForMR.value || !targetBranchForMR.value || !mrTitle.value.trim()) return
  
  showCreateMRDialog.value = false
  openOperationDialog('创建 Merge Request', `正在创建 MR: ${sourceBranchForMR.value} -> ${targetBranchForMR.value}\n标题: ${mrTitle.value}\n`)
  
  try {
    // 获取 GitLab URL
    const urlResult = await executeCommand(`cd "${props.path}" && git remote get-url origin`)
    if (!urlResult.success || !urlResult.output?.trim()) {
      throw new Error('无法获取 Git remote URL')
    }
    
    let gitlabUrl = urlResult.output.trim()
    if (gitlabUrl.startsWith('git@')) {
      const match = gitlabUrl.match(/git@(.+?):(.+?)\.git$/)
      if (match) {
        gitlabUrl = `https://${match[1]}/${match[2]}`
      }
    } else {
      gitlabUrl = gitlabUrl.replace(/\.git$/, '')
    }
    
    // 构建 MR URL
    const mrUrl = `${gitlabUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(sourceBranchForMR.value)}&merge_request[target_branch]=${encodeURIComponent(targetBranchForMR.value)}&merge_request[title]=${encodeURIComponent(mrTitle.value)}&merge_request[description]=${encodeURIComponent(mrDescription.value)}`
    
    operationOutput.value += `\n正在打开 GitLab MR 页面...\n`
    emit('navigate', mrUrl)
    
    finishOperation({ hideDialog: true })
  } catch (error) {
    finishOperation()
    operationOutput.value += `\n\n❌ 创建 MR 失败: ${error.message}`
  }
}

// ==================== 外部应用 ====================
const openWithGitLab = async () => {
  if (!props.path) return
  try {
    const result = await executeCommand(`cd "${props.path}" && git remote get-url origin`)
    if (!result.success || !result.output?.trim()) {
      throw new Error('无法获取 Git remote URL')
    }
    
    let gitlabUrl = result.output.trim()
    if (gitlabUrl.startsWith('git@')) {
      const match = gitlabUrl.match(/git@(.+?):(.+?)\.git$/)
      if (match) {
        gitlabUrl = `https://${match[1]}/${match[2]}`
      }
    } else {
      gitlabUrl = gitlabUrl.replace(/\.git$/, '')
    }
    
    debugLog('🔗 [ProjectDetailNew] 打开 GitLab:', gitlabUrl)
    if (window.electronAPI?.openUrlInNewTab) {
      window.electronAPI.openUrlInNewTab(gitlabUrl)
    }
  } catch (error) {
    console.error('打开 GitLab 失败:', error)
  }
}

const openInFinder = async () => {
  if (!props.path) return
  try {
    await window.electronAPI.openInFinder({ path: props.path })
  } catch (error) {
    console.error('打开访达失败:', error)
  }
}

// ==================== 项目设置 ====================
const openProjectSettings = () => {
  showProjectSettings.value = true
}

const onProjectSettingsConfirm = () => {
  debugLog('✅ 项目设置已保存')
  // 刷新远程分支列表
  refreshRemoteBranches()
}

// ==================== 取消操作 ====================
const cancelOperation = () => {
  baseCancelOperation()
  showOperationDialog.value = false
  
  // 刷新状态（保留勾选状态）
  if (fileStatusRef.value) {
    fileStatusRef.value.loadFileStatus?.(true)
  }
  loadBranchStatus()
}

// ==================== 生命周期 ====================
watch(() => props.path, (newPath, oldPath) => {
  if (newPath) {
    // 恢复该项目保存的视图状态和展开状态
    currentView.value = getSavedCurrentView(newPath)
    if (currentView.value === 'terminal') {
      terminalMounted.value = true
    }
    restoreExpandState(newPath)
    
    // 切换项目时先清空所有数据，防止显示旧项目的数据
    branchStatus.value = null
    allBranchStatus.value = {}
    allBranches.value = []
    remoteBranches.value = []
    tags.value = []
    currentBranch.value = ''
    hasPendingFiles.value = false
    tagsLoading.value = false
    tagsRefreshing.value = false
    tagsRefreshSuccess.value = false
    refreshing.value = false
    refreshSuccess.value = false
    statusLoading.value = false

    // 再从 store 读取缓存数据立即显示
    const cachedDetail = getProjectDetail(newPath)
    if (cachedDetail) {
      // 立即应用缓存的分支数据
      if (cachedDetail.localBranches?.length > 0) {
        allBranches.value = cachedDetail.localBranches
      }
      if (cachedDetail.remoteBranches?.length > 0) {
        remoteBranches.value = cachedDetail.remoteBranches
      }
      if (cachedDetail.currentBranch) {
        currentBranch.value = cachedDetail.currentBranch
      }
      if (cachedDetail.branchStatus) {
        branchStatus.value = cachedDetail.branchStatus
      }
      if (cachedDetail.allBranchStatus && Object.keys(cachedDetail.allBranchStatus).length > 0) {
        allBranchStatus.value = cachedDetail.allBranchStatus
      }
      if (cachedDetail.tags?.length > 0) {
        tags.value = cachedDetail.tags
      }
      debugLog('📦 [ProjectDetailNew] 从 store 读取缓存数据:', newPath)
    }
    
    // 选中项目时清理分支状态缓存，确保分支名和 ahead/behind 都按当前仓库状态重算
    clearProjectBranchStatusCache(newPath).finally(() => {
      loadProjectInfo()
    })
  } else {
    projectInfo.value = null
    // 切换项目时重置状态
    branchStatus.value = null
    allBranchStatus.value = {}
    allBranches.value = []
    remoteBranches.value = []
    tags.value = []
    tagsLoading.value = false
    tagsRefreshing.value = false
    tagsRefreshSuccess.value = false
    refreshing.value = false
    refreshSuccess.value = false
    statusLoading.value = false
  }
}, { immediate: true })

watch(currentView, (view) => {
  if (view === 'terminal' && props.isActive) {
    terminalMounted.value = true
    nextTick(() => {
      terminalRef.value?.ensureDefaultTerminal?.(terminalProjectPath.value)
    })
  }
}, { immediate: true })

watch(() => props.isActive, (active) => {
  if (active && currentView.value === 'terminal') {
    terminalMounted.value = true
    nextTick(() => {
      terminalRef.value?.ensureDefaultTerminal?.(terminalProjectPath.value)
    })
  }
})

// 刷新当前项目状态（供外部调用，如标签切换时）
const refreshCurrentProject = async () => {
  if (!props.path) return

  debugLog('🔄 [ProjectDetailNew] 刷新当前项目状态...')

  await clearProjectBranchStatusCache(props.path)
  bumpCommitHistoryRevision()

  // 异步刷新文件状态（保留勾选状态）
  if (fileStatusRef.value?.loadFileStatus) {
    fileStatusRef.value.loadFileStatus(true)
  }

  // 重新读取当前分支、分支列表和 ahead/behind，并在展开标签区时一并刷新标签
  loadProjectInfo({
    forceRefreshRemoteBranches: showRemoteBranches.value,
    forceRefreshTags: showTags.value,
    refreshBranchStatus: true
  })
}

// 窗口获得焦点时刷新状态（只有当前标签激活时才刷新）
const handleWindowFocus = async () => {
  if (!props.path || !props.isActive) return
  
  debugLog('🔄 [ProjectDetailNew] 窗口获得焦点，刷新状态...')
  refreshCurrentProject()
}

// 窗口焦点变化处理
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && props.isActive) {
    handleWindowFocus()
  }
}

onMounted(() => {
  if (props.path) {
    loadProjectInfo()
  }
  
  // 监听窗口焦点事件
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 监听 Electron 的窗口焦点事件
  if (window.electronAPI?.onWindowFocus) {
    window.electronAPI.onWindowFocus(handleWindowFocus)
  }
})

onUnmounted(() => {
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (window.electronAPI?.removeWindowFocusListener) {
    window.electronAPI.removeWindowFocusListener(handleWindowFocus)
  }
})

// 监听标签激活状态变化，切换到当前标签时刷新
watch(() => props.isActive, (newIsActive, oldIsActive) => {
  if (newIsActive && !oldIsActive && props.path) {
    debugLog('🔄 [ProjectDetailNew] 标签激活，刷新状态...')
    refreshCurrentProject()
  }
})

watch(showCreateTagDialog, async (visible) => {
  if (!visible) return
  await nextTick()
  newTagNameInputRef.value?.focus?.()
  newTagNameInputRef.value?.select?.()
})

// ==================== 暴露给父组件 ====================
defineExpose({
  fileStatusRef,
  loadBranches,
  loadBranchStatus,
  refreshRemoteBranches,
  refreshCurrentProject
})
</script>

<style scoped>
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding-left: 12px;
  box-sizing: border-box;
  background: #2d2d2d;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.5);
}

.empty-state-icon { opacity: 0.3; margin-bottom: 16px; }
.empty-state h3 { margin: 0 0 8px 0; font-size: 18px; color: rgba(255, 255, 255, 0.7); }
.empty-state p { margin: 0; font-size: 14px; }

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
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

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(30, 30, 30, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.project-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.header {
  padding: 12px 0 12px 8px;
  background: #2d2d2d;
  border-bottom: 1px solid;
  border-image: linear-gradient(to right, transparent 8px, rgba(255, 255, 255, 0.1) 8px) 1;
  border-radius: 8px 8px 0 0;
  min-height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 8px;
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

.status-loading {
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  margin-left: 8px;
  animation: spin 1s linear infinite;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.create-btn, .pull-single-btn, .push-single-btn, .mr-single-btn,
.gitlab-open-btn, .finder-open-btn, .settings-btn {
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

.create-btn { background: #6c757d; color: white; }
.create-btn:hover { background: #5a6268; }

.pull-single-btn { background: #28a745; color: white; }
.pull-single-btn:hover { background: #218838; }

.push-single-btn { background: #007bff; color: white; }
.push-single-btn:hover { background: #0056b3; }

.mr-single-btn { background: #17a2b8; color: white; }
.mr-single-btn:hover { background: #138496; }

.gitlab-open-btn {
  background: #fc6d26;
  color: white;
}
.gitlab-open-btn:hover { background: #e24329; }

.finder-open-btn {
  background: #007AFF;
  color: white;
}
.finder-open-btn:hover { background: #0063CC; }

.settings-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 8px;
}
.settings-btn:hover { 
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.pull-count-badge, .push-count-badge {
  background: rgba(100, 100, 100, 0.8);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  min-width: 16px;
  text-align: center;
}

.project-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.content-wrapper {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  gap: 8px;
  padding-left: 8px;
  background: #2d2d2d;
}

.branches-panel {
  width: 240px;
  min-width: 220px;
  background: #2d2d2d;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.file-status-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
  user-select: none;
}

.file-status-button:hover { background: rgba(255, 255, 255, 0.05); }
.file-status-button.active {
  background: rgba(102, 126, 234, 0.2);
  color: #8b9eff;
  font-weight: 500;
}

.branch-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.branch-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  user-select: none;
}

.branch-section-header:hover { background: rgba(255, 255, 255, 0.05); }

.expand-arrow {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.expand-arrow.expanded {
  transform: rotate(90deg);
}

.branch-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.refresh-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-btn:hover { background: rgba(255, 255, 255, 0.1); color: white; }
.refresh-btn.refreshing { animation: spin 1s linear infinite; }
.refresh-btn.success { color: #28a745; }

.branch-list {
  padding: 4px 0;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  user-select: none;
}

.branch-item:hover { background: rgba(255, 255, 255, 0.05); }
.branch-item.active {
  background: rgba(102, 126, 234, 0.15);
  color: #8b9eff;
}

.branch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }

.branch-status-indicator {
  display: flex;
  gap: 4px;
  font-size: 10px;
  flex-shrink: 0;
}

.pull-indicator { color: #ffc107; font-size: 11px; }
.push-indicator { color: #28a745; font-size: 11px; }

.pending-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 6px;
}

.pending-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.header-branch-status {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}

.remote-branch { 
  color: rgba(255, 255, 255, 0.6); 
}

.tag-item {
  display: flex;
  align-items: center;
  padding: 5px 8px 5px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
}

.tag-item:hover { background: rgba(255, 255, 255, 0.05); }

.empty-tags {
  padding: 8px 16px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: #2d2d2d;
}

/* 弹框样式 */
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
  background: #1e1e1e;
  border-radius: 12px;
  padding: 0;
  min-width: 450px;
  max-width: 600px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.dialog-header-simple {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-header-simple h3 {
  margin: 0;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.dialog-body {
  padding: 16px 20px;
  min-height: 120px;
}

.dialog-body p {
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.8);
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #fff;
  font-size: 14px;
}

.branch-select, .branch-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #2a2a2a;
  color: #fff;
  box-sizing: border-box;
}

.branch-select {
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.branch-select option {
  background: #2a2a2a;
  color: #fff;
  padding: 8px 12px;
}

.branch-select:focus, .branch-input:focus {
  outline: none;
  border-color: #0066ff;
}

.mr-description {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
  background: #2a2a2a;
  color: #fff;
  box-sizing: border-box;
  font-family: inherit;
}

.mr-description:focus {
  outline: none;
  border-color: #0066ff;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn-large:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: #0066ff;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn-large:hover:not(:disabled) { background: #0055dd; }
.confirm-btn-large:disabled { opacity: 0.5; cursor: not-allowed; }

.delete-btn-large {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: #dc3545;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-btn-large:hover { background: #c82333; }

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 160px;
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

.context-menu-item:hover { background: rgba(102, 126, 234, 0.2); }
.context-menu-item.disabled { opacity: 0.5; cursor: not-allowed; }

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

/* 滚动条样式 - 最小化 */
.branches-panel {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.branches-panel::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

.branches-panel::-webkit-scrollbar-track {
  background: transparent;
}

.branches-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1.5px;
}

.branches-panel::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
