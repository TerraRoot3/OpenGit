<template>
  <div ref="componentRef" class="commit-history-section git-log">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <div class="toolbar-row">
        <div class="search-input-wrapper">
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="搜索提交信息、作者、哈希..."
            class="search-input"
            @input="handleSearch"
          />
          <button 
            v-if="searchQuery"
            class="clear-search-btn"
            @click="clearSearch"
            title="清除搜索"
          >
            ✕
          </button>
        </div>
        <div class="scope-controls">
          <label class="scope-field">
            <span>范围</span>
            <select v-model="historyScope" class="scope-select">
              <option :value="COMMIT_HISTORY_SCOPE.ALL">全部历史</option>
              <option
                v-if="props.currentBranch && !props.currentBranch.includes('HEAD detached')"
                :value="COMMIT_HISTORY_SCOPE.CURRENT"
              >
                当前分支
              </option>
              <option :value="COMMIT_HISTORY_SCOPE.BRANCH">指定本地分支</option>
            </select>
          </label>
          <label v-if="historyScope === COMMIT_HISTORY_SCOPE.BRANCH" class="scope-field branch-field">
            <span>分支</span>
            <select v-model="selectedLocalBranch" class="scope-select">
              <option
                v-for="option in localBranchOptions"
                :key="option"
                :value="option"
              >
                {{ option }}
              </option>
            </select>
          </label>
        </div>
      </div>
      <div class="search-filters">
        <label class="filter-checkbox">
          <input type="checkbox" v-model="searchInMessage" />
          提交信息
        </label>
        <label class="filter-checkbox">
          <input type="checkbox" v-model="searchInAuthor" />
          作者
        </label>
        <label class="filter-checkbox">
          <input type="checkbox" v-model="searchInHash" />
          哈希
        </label>
      </div>
    </div>
    
    <!-- 上半部分：提交列表 -->
    <div ref="scrollContainer" class="main" :style="{ flex: topHeight > 0 ? '0 0 ' + topHeight + 'px' : '1', height: topHeight > 0 ? topHeight + 'px' : 'auto' }">
      <!-- SVG Graph 容器 -->
      <div ref="graphContainer" class="graph"></div>
      
      <!-- 表格 -->
      <table>
        <thead>
          <tr>
            <th class="graph-col" ref="graphColRef" :style="{ width: `${graphColumnWidth}px`, minWidth: `${graphColumnWidth}px` }">
              <p>图形</p>
              <div class="resizer" @mousedown="startResize($event, 'graphColRef')"></div>
            </th>
            <th class="comments" ref="commentsColRef">
              <p>备注</p>
              <div class="resizer" @mousedown="startResize($event, 'commentsColRef')"></div>
            </th>
            <th class="commit" ref="commitColRef">
              <p>提交</p>
              <div class="resizer" @mousedown="startResize($event, 'commitColRef')"></div>
            </th>
            <th class="date" ref="dateColRef">
              <p>日期</p>
              <div class="resizer" @mousedown="startResize($event, 'dateColRef')"></div>
            </th>
            <th class="author" ref="authorColRef">
              <p>作者</p>
              <div class="resizer" @mousedown="startResize($event, 'authorColRef')"></div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredCommits.length === 0 && !loading && !searchQuery">
            <td colspan="5" style="text-align: center; padding: 40px;">
              <p>暂无提交记录</p>
            </td>
          </tr>
          <tr v-else-if="loading && commits.length === 0">
            <td colspan="5" style="text-align: center; padding: 40px;">
              <p>加载中...</p>
            </td>
          </tr>
          <tr v-else-if="filteredCommits.length === 0 && searchQuery">
            <td colspan="5" style="text-align: center; padding: 40px;">
              <p>未找到匹配的提交</p>
            </td>
          </tr>
          <tr
            v-for="(commit, index) in filteredCommits"
            :key="commit.hash"
            @click="selectCommitByFilteredIndex(index)"
            @contextmenu.prevent="showCommitContextMenu($event, commit)"
            :class="{ 'log-highlight': selectedCommit?.hash === commit.hash }"
          >
            <td class="graph-col" :style="{ width: `${graphColumnWidth}px`, minWidth: `${graphColumnWidth}px` }"><p>&nbsp;</p></td>
            <td class="comments">
              <div class="commit-content">
                <span v-if="commit.branches && commit.branches.length > 0" class="commit-refs">
                  <span class="commit-ref"
                        v-for="branch in commit.branches" :key="branch"
                        :class="getRefClass(branch)"
                        :style="getRefStyle(branch, commit.color)"
                        :title="branch">
                    {{ branch }}
                  </span>
                </span>
                <span v-if="commit.tags && commit.tags.length > 0" class="commit-refs">
                  <span class="commit-ref tag" 
                        v-for="tag in commit.tags" :key="tag"
                        :style="{ borderColor: commit.color || '#1f77b4', color: commit.color || '#1f77b4' }"
                        :title="tag">
                    {{ tag }}
                  </span>
                </span>
                <span class="commit-message">{{ commit.message }}</span>
              </div>
            </td>
            <td class="commit"><p>{{ commit.shortHash }}</p></td>
            <td class="date"><p>{{ commit.date }}</p></td>
            <td class="author"><p>{{ commit.author }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- 分隔线（可拖动调整高度） -->
    <div class="resizer-horizontal" @mousedown="startResizeHeight"></div>
    
    <!-- 下半部分：提交详情（固定高度，不随拖拽变化） -->
    <div class="detail-section">
      <div class="detail-left" :style="{ flex: '0 0 ' + leftWidth + '%' }">
        <!-- 文件列表 -->
        <div class="file-list-panel file-list-expanded">
          <div class="panel-header">
            <span>修改文件</span>
            <span class="file-count">{{ selectedCommitFiles.length }}</span>
          </div>
          <div class="file-list">
            <div 
              v-for="file in selectedCommitFiles" 
              :key="file.path"
              class="file-item"
              :class="{ active: selectedFile?.path === file.path }"
              @click="selectFile(file)"
            >
              <span class="file-icon" :class="file.iconClass">{{ file.icon }}</span>
              <span class="file-path">{{ file.path }}</span>
              <span class="file-stats">{{ file.stats }}</span>
            </div>
            <div v-if="selectedCommitFiles.length === 0" class="empty-state">
              暂无文件
            </div>
          </div>
        </div>
        
        <!-- 提交信息 -->
        <div class="commit-info-panel commit-info-compact">
          <div class="panel-header">
            <span>提交信息</span>
          </div>
          <div class="commit-info" v-if="selectedCommit">
            <div class="info-row">
              <span class="info-label">提交:</span>
              <span class="info-value">{{ selectedCommit.shortHash }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">作者:</span>
              <span class="info-value">{{ selectedCommit.author }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">日期:</span>
              <span class="info-value">{{ selectedCommit.date }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">消息:</span>
              <span class="info-value">{{ selectedCommit.message }}</span>
            </div>
          </div>
          <div v-else class="empty-state">
            请选择一个提交查看详情
          </div>
        </div>
      </div>
      
      <!-- 分隔线（左右调整宽度） -->
      <div class="resizer-vertical" @mousedown="startResizeWidth"></div>
      
      <!-- 文件详情 -->
      <div class="file-detail-panel">
        <div class="panel-header">
          <span v-if="selectedFile">{{ selectedFile.path }}</span>
          <span v-else>选择文件查看详情</span>
        </div>
        <div class="file-diff" v-if="fileDiff">
          <pre v-html="fileDiff"></pre>
        </div>
        <div v-else class="empty-state">
          请选择一个文件查看详情
        </div>
      </div>
    </div>
    
    <!-- 右键菜单 -->
    <div v-if="showContextMenu" class="context-menu" :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }" @click.stop>
      <div class="context-menu-item" @click="checkoutCommitAction">检出</div>
      <div class="context-menu-item" @click="revertCommitAction">提交回滚</div>
      <div class="context-menu-item" @click="cherryPickCommitAction">遴选</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="copyCommitHash">复制</div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import {
  COMMIT_HISTORY_SCOPE,
  buildBranchHeadMap,
  buildCommitHistoryCommand,
  buildOrthogonalRoundedPath,
  captureScrollAnchor,
  mergeCommitPages,
  normalizeLocalBranches,
  restoreScrollAnchor
} from './commitHistoryState.mjs'

const props = defineProps({
  projectPath: {
    type: String,
    required: true
  },
  executeCommand: {
    type: Function,
    required: true
  },
  currentBranch: {
    type: String,
    default: ''
  },
  allBranches: {
    type: Array,
    default: () => []
  },
  refreshBranchStatus: {
    type: Function,
    required: false
  }
})

const emit = defineEmits(['switchToFileStatus'])

// 组件已加载

interface Commit {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: string
  message: string
  parents: string[]
  column?: number
  row?: number
  color?: string
  branches?: string[]
  tags?: string[]
}

const normalizeDecoratedRefs = (decorateStr: string) => {
  const trimmed = decorateStr.trim().replace(/^\((.*)\)$/, '$1').trim()
  if (!trimmed) {
    return []
  }
  return trimmed.split(', ').map(ref => ref.trim()).filter(Boolean)
}

const getRefClass = (refName: string) => ({
  'is-head': refName.includes('HEAD ->'),
  'is-remote': refName.startsWith('origin/'),
  'is-local': !refName.includes('HEAD ->') && !refName.startsWith('origin/')
})

const getRefStyle = (refName: string, color = '#5b8def') => {
  if (refName.includes('HEAD ->')) {
    return {
      backgroundColor: color,
      color: '#ffffff'
    }
  }

  if (refName.startsWith('origin/')) {
    return {
      backgroundColor: `${color}cc`,
      color: '#ffffff',
      border: `1px solid ${color}`
    }
  }

  return {
    backgroundColor: color,
    color: '#ffffff',
    border: `1px solid ${color}`
  }
}

const commits = ref<Commit[]>([])
const selectedIndex = ref(-1)
const loading = ref(false)
const graphContainer = ref<HTMLDivElement | null>(null)
const scrollContainer = ref<HTMLDivElement | null>(null)
const hasMore = ref(true)
const historyScope = ref<string>(COMMIT_HISTORY_SCOPE.ALL)
const selectedLocalBranch = ref('')
const graphColumnWidth = ref(190)
let graphRerenderAfterWidthSync = false
let scrollLoadLockedUntil = 0
const graphLayoutBranches: (string | undefined)[] = []
const graphPalette = ['#5b8def', '#4cb7a5', '#d89b3c', '#d96c85', '#8b73d6', '#58b8c0', '#c97db0', '#98b857', '#d7845c', '#70a9e0']

// 🔧 组件卸载标志，防止异步回调访问已卸载的 refs
let isUnmounted = false

// 性能优化：缓存机制
const commitHistoryCache = ref<{
  data: Commit[]
  timestamp: number
  projectPath: string
  scope: string
  revision: string
} | null>(null)
const CACHE_DURATION = 5000 // 5秒缓存
const branchHashesCache = ref<{
  data: Record<string, string>
  timestamp: number
  projectPath: string
} | null>(null)
const BRANCH_CACHE_DURATION = 10000 // 10秒缓存

// 布局调整
const topHeight = ref(0) // 0表示使用flex比例，非0表示固定像素
const leftWidth = ref(50) // percentage

// 文件相关
const selectedFile = ref<any>(null)
const fileDiff = ref('')

// 搜索相关
const searchQuery = ref('')
const searchInMessage = ref(true)
const searchInAuthor = ref(true)
const searchInHash = ref(true)

// 右键菜单相关
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuCommit = ref<Commit | null>(null)

// 计算属性
const selectedCommit = computed(() => {
  return selectedIndex.value >= 0 ? commits.value[selectedIndex.value] : null
})

const selectedCommitFiles = ref<any[]>([])
const localBranchOptions = computed(() => normalizeLocalBranches(props.allBranches as string[]))
const activeRevision = computed(() => {
  if (historyScope.value === COMMIT_HISTORY_SCOPE.CURRENT) {
    if (props.currentBranch && !props.currentBranch.includes('HEAD detached')) {
      return props.currentBranch
    }
    return ''
  }

  if (historyScope.value === COMMIT_HISTORY_SCOPE.BRANCH) {
    return selectedLocalBranch.value
  }

  return ''
})

// 过滤后的提交列表
const filteredCommits = computed(() => {
  const sourceCommits = commits.value

  if (!searchQuery.value.trim()) {
    return sourceCommits
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  const filters = {
    message: searchInMessage.value,
    author: searchInAuthor.value,
    hash: searchInHash.value
  }
  
  return sourceCommits.filter(commit => {
    if (filters.message && commit.message.toLowerCase().includes(query)) {
      return true
    }
    if (filters.author && commit.author.toLowerCase().includes(query)) {
      return true
    }
    if (filters.hash && (commit.hash.toLowerCase().includes(query) || commit.shortHash.toLowerCase().includes(query))) {
      return true
    }
    return false
  })
})

const resetGraphLayoutState = () => {
  graphLayoutBranches.length = 0
}

const assignCommitLayout = (nextCommits: Commit[], existingCommits: Commit[], append: boolean) => {
  if (!append) {
    resetGraphLayoutState()
  }

  const getFreeColumn = () => {
    for (let index = 0; index < graphLayoutBranches.length; index += 1) {
      if (graphLayoutBranches[index] === undefined) {
        return index
      }
    }
    return graphLayoutBranches.length
  }

  const updateBranch = (hash: string, column: number) => {
    graphLayoutBranches[column] = hash
  }

  const createBranch = (commit: Commit) => {
    let myColumn = graphLayoutBranches.indexOf(commit.hash)
    if (myColumn === -1) {
      myColumn = getFreeColumn()
    }

    while (graphLayoutBranches.indexOf(commit.hash) > -1) {
      graphLayoutBranches[graphLayoutBranches.indexOf(commit.hash)] = undefined
    }

    for (let index = 0; index < commit.parents.length; index += 1) {
      const parentHash = commit.parents[index]
      const existingColumn = graphLayoutBranches.indexOf(parentHash)
      if (existingColumn > -1) {
        if (graphLayoutBranches[myColumn] === undefined) {
          updateBranch(parentHash, myColumn)
        }
      } else if (commit.parents.length === 1 || index === 0) {
        updateBranch(parentHash, myColumn)
      } else {
        updateBranch(parentHash, getFreeColumn())
      }
    }

    return myColumn
  }

  const rowOffset = append ? existingCommits.length : 0
  for (let index = 0; index < nextCommits.length; index += 1) {
    const commit = nextCommits[index]
    commit.column = createBranch(commit)
    commit.row = rowOffset + index
    commit.color = graphPalette[(commit.column || 0) % graphPalette.length]
  }

  const combinedCommits = [...existingCommits, ...nextCommits]
  const commitMap = new Map(combinedCommits.map(commit => [commit.hash, commit]))
  for (const commit of nextCommits) {
    if ((commit.message.includes('WIP on') || commit.message.includes('index on')) && commit.parents.length > 0) {
      const parentCommit = commitMap.get(commit.parents[0])
      if (parentCommit && typeof parentCommit.column === 'number') {
        commit.column = parentCommit.column
        commit.color = graphPalette[(commit.column || 0) % graphPalette.length]
      }
    }
  }
}

// 拖拽调整高度（只调整上方提交列表高度，下方详情区域固定）
let isResizingHeight = false
let startY = 0
let startTopHeight = 0
let resizeContainer: HTMLElement | null = null

const startResizeHeight = (e: MouseEvent) => {
  isResizingHeight = true
  startY = e.clientY
  
  const target = e.currentTarget as HTMLElement
  resizeContainer = target?.parentElement as HTMLElement
  
  // 获取上方区域的实际当前高度，确保拖拽跟随
  if (scrollContainer.value) {
    startTopHeight = scrollContainer.value.offsetHeight
    topHeight.value = startTopHeight
  } else if (topHeight.value > 0) {
    startTopHeight = topHeight.value
  } else {
    startTopHeight = 300
  }
  
  document.addEventListener('mousemove', doResizeHeight)
  document.addEventListener('mouseup', stopResizeHeight)
  e.preventDefault()
}

const doResizeHeight = (e: MouseEvent) => {
  if (!isResizingHeight || !resizeContainer) return
  
  const diff = e.clientY - startY
  const totalHeight = resizeContainer.offsetHeight - 5 // 减去分隔线高度
  
  // 只调整上方高度，下方详情区域使用 flex: 1 自动填充剩余空间
  // 最小高度150px，最大不超过总高度减去详情区域最小高度(200px)
  const newTopHeight = Math.max(150, Math.min(startTopHeight + diff, totalHeight - 200))
  
    topHeight.value = newTopHeight
}

const stopResizeHeight = () => {
  isResizingHeight = false
  document.removeEventListener('mousemove', doResizeHeight)
  document.removeEventListener('mouseup', stopResizeHeight)
}

// 拖拽调整宽度
let isResizingWidth = false
let startXWidth = 0
let startLeftWidth = 0
let resizeWidthContainer: HTMLElement | null = null

const startResizeWidth = (e: MouseEvent) => {
  isResizingWidth = true
  startXWidth = e.clientX
  startLeftWidth = leftWidth.value
  
  const target = e.currentTarget as HTMLElement
  resizeWidthContainer = target?.parentElement as HTMLElement
  
  document.addEventListener('mousemove', doResizeWidth)
  document.addEventListener('mouseup', stopResizeWidth)
  e.preventDefault()
}

const doResizeWidth = (e: MouseEvent) => {
  if (!isResizingWidth || !resizeWidthContainer) return
  
  const containerWidth = resizeWidthContainer.offsetWidth
  const diff = e.clientX - startXWidth
  const percentage = (diff / containerWidth) * 100
  const newWidth = Math.max(20, Math.min(startLeftWidth + percentage, 80))
  leftWidth.value = newWidth
}

const stopResizeWidth = () => {
  isResizingWidth = false
  document.removeEventListener('mousemove', doResizeWidth)
  document.removeEventListener('mouseup', stopResizeWidth)
}

// 选择文件
const selectFile = async (file: any) => {
  selectedFile.value = file
  // 获取文件详情
  await loadFileDiff(file.path, selectedCommit.value)
}

// 加载文件差异（显示该次提交对该文件的修改内容）
const loadFileDiff = async (filePath: string, commit: any) => {
  if (!commit || !filePath) {
    fileDiff.value = ''
    return
  }
  
  try {
    // 使用 git show 显示该提交对该文件的修改（diff格式）
    const result = await props.executeCommand(
      `cd "${props.projectPath}" && git show ${commit.hash} -- "${filePath}"`
    )
    // 确保 content 是字符串类型
    let content = ''
    if (typeof result === 'string') {
      content = result
    } else if (result && typeof result === 'object') {
      content = result.stdout || result.output || result.stderr || JSON.stringify(result) || ''
    } else {
      content = String(result || '')
    }
    
    // 确保 content 是字符串才能调用 split
    if (typeof content !== 'string') {
      console.error('❌ [CommitHistory] loadFileDiff: content 不是字符串类型', typeof content, content)
      content = String(content || '')
    }
    
    // 格式化 diff 内容，添加语法高亮（使用内联样式确保生效，与 FileStatus 一致）
    fileDiff.value = formatDiffOutput(content)
  } catch (error) {
    fileDiff.value = '无法加载文件差异'
  }
}

// 格式化diff输出，添加语法高亮（使用内联样式确保生效）
const formatDiffOutput = (diffText: string) => {
  if (!diffText) return ''
  
  const lines = diffText.split('\n')
  const formattedLines = lines.map(line => {
    // 先转义HTML，再添加样式标签
    const escapedLine = escapeHtml(line)
    
    // 添加行号标记和颜色（使用内联样式，无行间距，背景撑满 - 暗黑主题）
    if (line.startsWith('+++') || line.startsWith('---')) {
      return `<span style="color: #9ca3af !important; background-color: #374151 !important; font-weight: 500; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    } else if (line.startsWith('@@')) {
      return `<span style="color: #60a5fa !important; background-color: rgba(59, 130, 246, 0.2) !important; font-weight: 500; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      return `<span style="color: #4ade80 !important; background-color: rgba(34, 197, 94, 0.15) !important; display: block; padding: 2px 8px; border-left: 3px solid #22c55e; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      return `<span style="color: #f87171 !important; background-color: rgba(239, 68, 68, 0.15) !important; display: block; padding: 2px 8px; border-left: 3px solid #ef4444; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    } else if (line.startsWith('diff ') || line.startsWith('index ')) {
      return `<span style="color: #9ca3af !important; background-color: #374151 !important; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    } else {
      // 普通上下文行
      return `<span style="color: rgba(255, 255, 255, 0.8) !important; background-color: #1e1e1e !important; display: block; padding: 2px 8px; margin: 0; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 12px; line-height: 1.6;">${escapedLine}</span>`
    }
  })
  
  return formattedLines.join('')
}

const escapeHtml = (text: string) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 列宽调整
const graphColRef = ref<HTMLTableCellElement | null>(null)
const commentsColRef = ref<HTMLTableCellElement | null>(null)
const commitColRef = ref<HTMLTableCellElement | null>(null)
const dateColRef = ref<HTMLTableCellElement | null>(null)
const authorColRef = ref<HTMLTableCellElement | null>(null)

let isResizingColumn = false
let currentResizer: string | null = null
let startXColumn = 0
let startWidth = 0
let resizeElement: HTMLElement | null = null
let rafId: number | null = null

// 列最小宽度配置
const minWidths: Record<string, number> = {
  graphColRef: 50,
  commentsColRef: 50,
  commitColRef: 50,
  dateColRef: 50,
  authorColRef: 50
}

const startResize = (e: MouseEvent, colRef: string) => {
  isResizingColumn = true
  currentResizer = colRef
  startXColumn = e.clientX
  
  const refMap: Record<string, any> = {
    graphColRef: graphColRef.value,
    commentsColRef: commentsColRef.value,
    commitColRef: commitColRef.value,
    dateColRef: dateColRef.value,
    authorColRef: authorColRef.value
  }
  
  resizeElement = refMap[colRef]
  if (resizeElement) {
    startWidth = resizeElement.getBoundingClientRect().width
  }
  
  // 添加拖拽时的样式
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  
  document.addEventListener('mousemove', doResize)
  document.addEventListener('mouseup', stopResize)
  
  e.preventDefault()
}

const doResize = (e: MouseEvent) => {
  if (!isResizingColumn || !resizeElement || !currentResizer) return
  
  // 使用 requestAnimationFrame 优化性能
  if (rafId) {
    cancelAnimationFrame(rafId)
  }
  
  rafId = requestAnimationFrame(() => {
    const diff = e.clientX - startXColumn
    const minWidth = minWidths[currentResizer!] || 50
    const newWidth = Math.max(minWidth, startWidth + diff)
    
    // 更新 th 的宽度
    resizeElement!.style.width = `${newWidth}px`
    resizeElement!.style.maxWidth = `${newWidth}px`
    
    // 获取列的 class 名称并更新对应的所有 td
    const className = resizeElement!.classList[0] // 获取第一个 class，如 graph-col, comments 等
    if (className) {
      const table = resizeElement!.closest('table')
      if (table) {
        const cells = table.querySelectorAll(`td.${className}`)
        cells.forEach((cell: any) => {
          cell.style.width = `${newWidth}px`
          cell.style.maxWidth = `${newWidth}px`
        })
      }
    }
  })
}

const stopResize = () => {
  isResizingColumn = false
  currentResizer = null
  resizeElement = null
  
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  
  // 恢复样式
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  
  document.removeEventListener('mousemove', doResize)
  document.removeEventListener('mouseup', stopResize)
}

// 从 git-log-master 移植的 GitGraph 类
class GitGraph {
  private config: any
  private maxRow: number = 0
  private maxColumn: number = 0

  constructor(private container: HTMLElement, private data: Commit[], lineHeight: number, margin: number) {
    this.config = this.setConfig(lineHeight, margin)
    this.setPosition(data)
    this.render()
  }

    private setConfig(lineHeight: number, margin: number): any {
      const circleRadiusPercent = 20
      const branchSpacingPercent = 60
      
      const percentage = (percent: number) => (lineHeight * percent) / 100
      
      return {
        circle: {
          radius: percentage(circleRadiusPercent)
        },
        circleSpacing: lineHeight,  // 使用lineHeight作为间距，确保与表格行高一致
        branchSpacing: percentage(branchSpacingPercent) + 4,
        leftMargin: lineHeight / 2,
        topMargin: 0,  // 不从顶部偏移，直接对齐tobody第一行
        crossHeight: 40 / 100,
        colorList: [
          '#5b8def', '#4cb7a5', '#d89b3c', '#d96c85', '#8b73d6',
          '#58b8c0', '#c97db0', '#98b857', '#d7845c', '#70a9e0'
        ]
      }
    }

  private setPosition(data: Commit[]): void {
    if (data.every(commit => typeof commit.column === 'number' && typeof commit.row === 'number')) {
      this.maxColumn = data.reduce((maxColumn, commit) => Math.max(maxColumn, commit.column || 0), 0)
      this.maxRow = data.length
      return
    }

    const branches: (string | undefined)[] = []
    this.maxRow = 0
    const commitMap = new Map(data.map(commit => [commit.hash, commit]))
    const getFreeColumn = (): number => {
      for (let i = 0; i < branches.length; i++) {
        if (branches[i] === undefined) return i
      }
      return branches.length
    }

    const updateBranch = (hash: string, col: number): void => {
      branches[col] = hash
    }

    // 检测是否为stash条目（WIP on, index on）
    const isStashEntry = (commit: Commit): boolean => {
      return commit.message.includes('WIP on') || commit.message.includes('index on')
    }

    const createBranch = (commit: Commit): number => {
      let myCol = -1

      if (branches.indexOf(commit.hash) > -1) {
        myCol = branches.indexOf(commit.hash)
      } else {
        myCol = getFreeColumn()
      }

      while (branches.indexOf(commit.hash) > -1) {
        branches[branches.indexOf(commit.hash)] = undefined
      }

      for (let i = 0; i < commit.parents.length; i++) {
        const par = commit.parents[i]
        const index = branches.indexOf(par)

        if (index > -1) {
          if (branches[myCol] === undefined) {
            updateBranch(par, myCol)
          }
        } else {
          if (commit.parents.length === 1 || i === 0) {
            updateBranch(par, myCol)
          } else {
            const parCol = getFreeColumn()
            updateBranch(par, parCol)
          }
        }
      }

      return myCol
    }

    // 第一遍：为所有提交分配列
    data.forEach((commit, i) => {
      const position = {
        column: createBranch(commit),
        row: i
      }
      commit.column = position.column
      commit.row = position.row
      if (position.column > this.maxColumn) {
        this.maxColumn = position.column
      }
    })

    // 第二遍：修正stash条目，使其使用父commit的列（颜色会在lines方法中自动分配）
    data.forEach((commit) => {
      if (isStashEntry(commit) && commit.parents.length > 0) {
        const parentHash = commit.parents[0]
        const parentCommit = commitMap.get(parentHash)
        if (parentCommit && parentCommit.column !== undefined) {
          commit.column = parentCommit.column
        }
      }
    })

    this.maxRow = data.length
  }

  private lines(data: Commit[]): any[] {
    const height = this.config.crossHeight
    const colors = [...this.config.colorList]
    const lineArray: any[] = []
    const lineColor: (string | undefined)[] = []
    const commitMap = new Map(data.map(commit => [commit.hash, commit]))

    for (let i = 0; i < data.length; i++) {
      const commit = data[i]

        // 为每个commit的column分配颜色
        let clr = lineColor[commit.column!]
        if (clr == null) {
          clr = colors.shift()!
          colors.push(clr)
          lineColor[commit.column!] = clr
        }
        commit.color = clr

        for (let j = 0; j < commit.parents.length; j++) {
          const line: any[] = []
          const start: any = {}
          const end: any = {}

          const parent = commitMap.get(commit.parents[j])
          if (!parent) continue

          start.x = commit.column!
          start.y = commit.row!
          end.x = parent.column!
          end.y = parent.row!

          let mid: any = null

          // 分叉：创建新分支
          if (start.x < end.x) {
            mid = { x: end.x, y: start.y + height }
            // 为新列分配新颜色（如果还没有分配）
            if (!lineColor[end.x]) {
              const newClr = colors.shift()!
              colors.push(newClr)
              lineColor[end.x] = newClr
            }
            start.color = lineColor[end.x]
          }
          // 合并：回到左列
          else if (start.x > end.x) {
            mid = { x: start.x, y: end.y - height }
            lineColor[start.x] = undefined
            start.color = commit.color
          }
          // 同一列
          else {
            start.color = commit.color
          }

          line.push(start)
          if (mid) line.push(mid)
          line.push(end)
          lineArray.push(line)
        }
    }

    return lineArray
  }

  private render(): void {
    const lineArray = this.lines(this.data)

    const createLine = (d: any[]): string => {
      const points = d.map((point: any) => ({
        x: this.config.leftMargin + (point.x * this.config.branchSpacing),
        y: (point.y * this.config.circleSpacing) + (this.config.circleSpacing / 2)
      }))
      return buildOrthogonalRoundedPath(points, 5)
    }

    // 计算SVG高度
    const height = this.maxRow * this.config.circleSpacing

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    // SVG从绝对定位容器的0点开始，坐标内部计算header偏移
    const lineGroup = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    const circleGroup = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'))

    this.data.forEach(d => {
      const circle = circleGroup.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'))
      circle.setAttribute('cx', (this.config.leftMargin + (d.column! * this.config.branchSpacing)).toString())
      // y坐标：圆点在行中心 = row * 32 + 16px
      const cy = (d.row! * this.config.circleSpacing) + (this.config.circleSpacing / 2)
      circle.setAttribute('cy', cy.toString())
      circle.setAttribute('r', this.config.circle.radius.toString())
      circle.setAttribute('fill', d.color || '#1f77b4')
    })
    
    //

    lineGroup.setAttribute('stroke-width', '2')
    lineGroup.setAttribute('fill', 'none')

    lineArray.forEach(d => {
      const path = lineGroup.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'))
      path.setAttribute('d', createLine(d))
      const strokeColor = d[0].color || '#1f77b4'
      path.setAttribute('stroke', strokeColor)
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      path.setAttribute('opacity', '0.95')
    })

    this.container.innerHTML = ''
    this.container.appendChild(svg)
    
    const graphWidth = (this.maxColumn + 1) * this.config.branchSpacing + this.config.leftMargin * 2
    svg.setAttribute('width', graphWidth.toString())
    svg.setAttribute('height', height.toString())
    
    // 不强制设置 thead 宽度，避免影响表格布局导致对齐误差
  }
}

// 加载提交历史
const loadCommitHistory = async (forceRefresh = false, options: { append?: boolean } = {}) => {
  if (!props.projectPath) {
    return
  }
  const append = Boolean(options.append)
  
  // 性能优化：检查缓存
  const now = Date.now()
  if (!append && !forceRefresh && commitHistoryCache.value && 
      commitHistoryCache.value.projectPath === props.projectPath &&
      commitHistoryCache.value.scope === historyScope.value &&
      commitHistoryCache.value.revision === activeRevision.value &&
      now - commitHistoryCache.value.timestamp < CACHE_DURATION) {
    console.log('⏭️ [CommitHistory] 使用缓存数据，跳过刷新')
    commits.value = commitHistoryCache.value.data
    await nextTick()
    await renderGraph()
    // 确保滚动位置在顶部
    await nextTick()
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = 0
    }
    return
  }
  
  loading.value = true
  const scrollAnchor = append ? captureScrollAnchor(scrollContainer.value) : null

  try {
    // 性能优化：使用缓存的分支信息
    let branchHashes: Record<string, string> = {}
    const branchCacheValid = branchHashesCache.value && 
                             branchHashesCache.value.projectPath === props.projectPath &&
                             now - branchHashesCache.value.timestamp < BRANCH_CACHE_DURATION
    
    if (branchCacheValid && branchHashesCache.value) {
      console.log('⏭️ [CommitHistory] 使用缓存的分支信息')
      branchHashes = branchHashesCache.value.data
    } else {
      // 性能优化：使用单个命令获取所有分支的hash（减少Git命令数量）
      try {
        // 使用 git for-each-ref 一次性获取所有分支信息
        const branchRefsResult = await props.executeCommand(
          `cd "${props.projectPath}" && git for-each-ref --format="%(refname:short)|%(objectname)" refs/heads/`
        )
        if (branchRefsResult) {
          const branchRefsOutput = typeof branchRefsResult === 'string' ? branchRefsResult : (branchRefsResult.stdout || branchRefsResult.output || '')
          branchHashes = buildBranchHeadMap(branchRefsOutput)
        }
        
        // 缓存分支信息
        branchHashesCache.value = {
          data: branchHashes,
          timestamp: now,
          projectPath: props.projectPath
        }
      } catch (error) {
        console.error('获取分支信息失败，使用备用方法:', error)
        // 备用方法：如果 for-each-ref 失败，使用原来的方法
        try {
          const branchListResult = await props.executeCommand(
            `cd "${props.projectPath}" && git branch`
          )
          if (branchListResult) {
            const branchListOutput = typeof branchListResult === 'string' ? branchListResult : (branchListResult.stdout || branchListResult.output || '')
            const branches = branchListOutput.split('\n')
              .map(line => line.replace(/^\*\s*/, '').trim())
              .filter(line => line && !line.includes('->'))
            
            // 限制并发数量，避免过载
            const CONCURRENT_LIMIT = 5
            for (let i = 0; i < branches.length; i += CONCURRENT_LIMIT) {
              const batch = branches.slice(i, i + CONCURRENT_LIMIT)
              const hashPromises = batch.map(async (branch) => {
                try {
                  const branchHashResult = await props.executeCommand(
                    `cd "${props.projectPath}" && git rev-parse ${branch}`
                  )
                  if (branchHashResult) {
                    const hashOutput = typeof branchHashResult === 'string' ? branchHashResult : (branchHashResult.stdout || branchHashResult.output || '')
                    const hash = hashOutput.trim()
                    if (hash) {
                      branchHashes[hash] = branch
                    }
                  }
                } catch (error) {
                  // 静默失败
                }
              })
              await Promise.all(hashPromises)
            }
          }
        } catch (error) {
          // 静默失败
        }
      }
    }
    
    // 使用简单的 git log 来解析，添加--decorate来获取分支和tag信息
    const result = await props.executeCommand(buildCommitHistoryCommand({
      projectPath: props.projectPath,
      currentBranch: props.currentBranch,
      selectedScope: historyScope.value,
      selectedBranch: selectedLocalBranch.value,
      skip: append ? commits.value.length : 0
    }))
    
    // executeCommand 可能返回对象，需要提取 stdout
    const simpleLog = typeof result === 'string' ? result : (result.stdout || result.output || result || '')

    const lines = simpleLog.split('\n').filter(line => line.trim() && line.includes('|'))

    const commitList: Commit[] = []

    lines.forEach((line, index) => {
      const parts = line.split('|')
      if (parts.length >= 8) {
        const [hash, shortHash, author, authorEmail, date, message, parentsStr, decorateStr] = parts
        // 解析分支和tag信息
        const branches: string[] = []
        const tags: string[] = []
        if (decorateStr && decorateStr.trim()) {
          const refs = normalizeDecoratedRefs(decorateStr)
          refs.forEach(ref => {
            if (ref.startsWith('origin/')) {
              branches.push(ref)
            } else if (ref.includes('HEAD ->')) {
              branches.push(ref)
            } else if (ref.startsWith('tag: ')) {
              tags.push(ref.replace('tag: ', '').trim())
            } else {
              branches.push(ref)
            }
          })
        }
        
        // 如果这个提交的 hash 匹配任何本地分支的 hash，确保分支名在列表中
        if (branchHashes[hash]) {
          const branchName = branchHashes[hash]
          if (!branches.includes(branchName)) {
            branches.push(branchName)
          }
        }
        
        commitList.push({
          hash: hash,
          shortHash: shortHash,
          author: author,
          authorEmail: authorEmail,
          date: date,
          message: message || '(no message)',
          parents: parentsStr?.trim().split(' ').filter(p => p) || [],
          row: index,
          column: 0,
          color: '',
          branches: branches,
          tags: tags
        })
      }
    })

    // 更新hasMore状态
    hasMore.value = lines.length >= 500

    assignCommitLayout(commitList, append ? commits.value : [], append)

    // 替换现有列表 / 分页追加
    commits.value = mergeCommitPages(commits.value, commitList, append)

    // 性能优化：缓存数据
    commitHistoryCache.value = {
      data: commits.value,
      timestamp: now,
      projectPath: props.projectPath,
      scope: historyScope.value,
      revision: activeRevision.value
    }

    await nextTick()
    
    // 渲染图形
    await renderGraph()
    if (append) {
      scrollLoadLockedUntil = Date.now() + 180
    }
    restoreScrollAnchor(scrollContainer.value, scrollAnchor, append ? 'preserve-offset' : 'top')
    
    // 确保滚动位置在顶部（图形渲染后再次确认）
    await nextTick()
    if (!append && scrollContainer.value) {
      scrollContainer.value.scrollTop = 0
    }
  } catch (error) {
    console.error('加载提交历史失败:', error)
  } finally {
    loading.value = false
  }
}

// 性能优化：分离图形渲染逻辑，避免重复代码
const renderGraph = async () => {
  // 🔧 检查组件是否已卸载
  if (isUnmounted) {
    return
  }
  
  if (!graphContainer.value || filteredCommits.value.length === 0) {
    if (graphContainer.value) {
      graphContainer.value.innerHTML = ''
    }
    return
  }
  
  // 等待DOM更新
  await nextTick()
  
  // 计算锚点与行高，并初始化GitGraph
  const containerEl = graphContainer.value.parentElement as HTMLElement
  const tbodyEl = containerEl?.querySelector('tbody') as HTMLElement
  const tableRowsLocal = tbodyEl?.querySelectorAll('tr') || []
  if (containerEl && tbodyEl && tableRowsLocal.length > 0) {
    graphContainer.value.style.top = `${tbodyEl.offsetTop}px`

    // 使用远行差分获取平均行高，降低累积误差
    const farIndex = Math.min(60, tableRowsLocal.length - 1)
    const firstRect = (tableRowsLocal[0] as HTMLElement).getBoundingClientRect()
    const farRect = (tableRowsLocal[farIndex] as HTMLElement).getBoundingClientRect()
    const rowHeightPx = farIndex > 0 ? (farRect.top - firstRect.top) / farIndex : ((tableRowsLocal[0] as HTMLElement).getBoundingClientRect().height || 33)

    // 同步容器尺寸
    graphContainer.value.style.height = `${tbodyEl.offsetHeight}px`
    const graphCol = containerEl.querySelector('th.graph-col') as HTMLElement
    const measuredWidth = graphCol ? graphCol.getBoundingClientRect().width : graphColumnWidth.value
    graphContainer.value.style.width = `${measuredWidth}px`

    // 重绘
    graphContainer.value.innerHTML = ''
    new GitGraph(graphContainer.value, filteredCommits.value, rowHeightPx, 0)
    const svg = graphContainer.value.querySelector('svg')
    const svgWidth = svg ? Number(svg.getAttribute('width') || 0) : 0
    const requiredWidth = Math.max(190, Math.ceil(svgWidth) + 24)
    if (requiredWidth !== graphColumnWidth.value) {
      graphColumnWidth.value = requiredWidth
      graphContainer.value.style.width = `${requiredWidth}px`
      if (!graphRerenderAfterWidthSync) {
        graphRerenderAfterWidthSync = true
        await nextTick()
        graphRerenderAfterWidthSync = false
        await renderGraph()
      }
    }
  }
}

// 选择提交（通过原始索引）
const selectCommit = async (index: number) => {
  selectedIndex.value = index
  selectedFile.value = null
  fileDiff.value = ''
  
  const commit = commits.value[index]
  if (commit) {
    await loadCommitFiles(commit.hash)
  }
}

// 选择提交（通过过滤后的索引）
const selectCommitByFilteredIndex = async (filteredIndex: number) => {
  const commit = filteredCommits.value[filteredIndex]
  if (commit) {
    // 找到原始索引
    const originalIndex = commits.value.findIndex(c => c.hash === commit.hash)
    if (originalIndex >= 0) {
      await selectCommit(originalIndex)
    }
  }
}

// 处理搜索
const handleSearch = () => {
  // 搜索时自动触发，通过computed属性过滤
}

// 清除搜索
const clearSearch = () => {
  searchQuery.value = ''
}

// ==================== 右键菜单 ====================
const showCommitContextMenu = (event: MouseEvent, commit: Commit) => {
  contextMenuCommit.value = commit
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true

  const closeMenu = () => {
    showContextMenu.value = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => document.addEventListener('click', closeMenu), 100)
}

const checkoutCommitAction = async () => {
  showContextMenu.value = false
  const commit = contextMenuCommit.value
  if (!commit) return

  try {
    const result = await props.executeCommand(
      `cd "${props.projectPath}" && git checkout ${commit.hash}`
    )
    const output = typeof result === 'string' ? result : (result.stdout || result.output || result.stderr || '')
    console.log('checkout result:', output)
    // 刷新提交历史和分支状态
    commitHistoryCache.value = null
    branchHashesCache.value = null
    await loadCommitHistory(true)
    if (props.refreshBranchStatus) {
      await props.refreshBranchStatus()
    }
  } catch (error: any) {
    console.error('检出失败:', error)
  }
}

const revertCommitAction = async () => {
  showContextMenu.value = false
  const commit = contextMenuCommit.value
  if (!commit) return

  try {
    const result = await props.executeCommand(
      `cd "${props.projectPath}" && git revert ${commit.hash} --no-edit`
    )
    const output = typeof result === 'string' ? result : (result.stdout || result.output || result.stderr || '')
    console.log('revert result:', output)
    // 刷新提交历史
    commitHistoryCache.value = null
    branchHashesCache.value = null
    await loadCommitHistory(true)
    if (props.refreshBranchStatus) {
      await props.refreshBranchStatus()
    }
  } catch (error: any) {
    const errMsg = typeof error === 'string' ? error : (error?.stderr || error?.message || '')
    // 检测冲突
    if (errMsg.includes('CONFLICT') || errMsg.includes('conflict') || errMsg.includes('could not revert')) {
      console.log('revert 发生冲突，切换到文件状态页')
      emit('switchToFileStatus')
    } else {
      console.error('回滚失败:', error)
    }
  }
}

const cherryPickCommitAction = async () => {
  showContextMenu.value = false
  const commit = contextMenuCommit.value
  if (!commit) return

  try {
    const result = await props.executeCommand(
      `cd "${props.projectPath}" && git cherry-pick ${commit.hash}`
    )
    const output = typeof result === 'string' ? result : (result.stdout || result.output || result.stderr || '')
    console.log('cherry-pick result:', output)
    // 刷新提交历史
    commitHistoryCache.value = null
    branchHashesCache.value = null
    await loadCommitHistory(true)
    if (props.refreshBranchStatus) {
      await props.refreshBranchStatus()
    }
  } catch (error: any) {
    const errMsg = typeof error === 'string' ? error : (error?.stderr || error?.message || '')
    // 检测冲突
    if (errMsg.includes('CONFLICT') || errMsg.includes('conflict')) {
      console.log('cherry-pick 发生冲突，切换到文件状态页')
      emit('switchToFileStatus')
    } else {
      console.error('遴选失败:', error)
    }
  }
}

const copyCommitHash = async () => {
  showContextMenu.value = false
  const commit = contextMenuCommit.value
  if (!commit) return

  try {
    await navigator.clipboard.writeText(commit.hash)
    console.log('已复制 commit hash:', commit.hash)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

// 加载提交的文件列表
const loadCommitFiles = async (commitHash: string) => {
  try {
    const result = await props.executeCommand(
      `cd "${props.projectPath}" && git show --name-status --pretty="" ${commitHash}`
    )
    // 确保 output 是字符串类型
    let output = ''
    if (typeof result === 'string') {
      output = result
    } else if (result && typeof result === 'object') {
      output = result.stdout || result.output || result.stderr || JSON.stringify(result) || ''
    } else {
      output = String(result || '')
    }
    
    // 确保 output 是字符串才能调用 split
    if (typeof output !== 'string') {
      console.error('❌ [CommitHistory] loadCommitFiles: output 不是字符串类型', typeof output, output)
      output = String(output || '')
    }
    
    const lines = output.split('\n').filter(line => line.trim())
    
    const files: any[] = []
    lines.forEach(line => {
      const match = line.match(/^([AMD])\s+(.+)$/)
      if (match) {
        const [, status, path] = match
        files.push({
          path,
          status,
          icon: getStatusIcon(status),
          iconClass: getStatusClass(status),
          stats: getFileStats(status)
        })
      }
    })
    
    selectedCommitFiles.value = files
  } catch (error) {
    console.error('加载文件列表失败:', error)
    selectedCommitFiles.value = []
  }
}

const getStatusIcon = (status: string) => {
  const icons: Record<string, string> = {
    'A': '+',
    'M': 'M',
    'D': 'D'
  }
  return icons[status] || '?'
}

const getStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    'A': 'added',
    'M': 'modified',
    'D': 'deleted'
  }
  return classes[status] || ''
}

const getFileStats = (status: string) => {
  const stats: Record<string, string> = {
    'A': '新增',
    'M': '修改',
    'D': '删除'
  }
  return stats[status] || ''
}

// 加载更多数据
const loadMore = async () => {
  if (loading.value || !hasMore.value) return
  await loadCommitHistory(true, { append: true })
}

// 监听滚动事件
const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  if (!target) return
  if (Date.now() < scrollLoadLockedUntil) return
  
  const scrollTop = target.scrollTop
  const scrollHeight = target.scrollHeight
  const clientHeight = target.clientHeight
  
  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  
  // 提前加载：距离底部200px时就开始加载
  if (distanceToBottom < 200 && distanceToBottom > 0 && hasMore.value && !loading.value) {
    loadMore()
  }
}

// 选中指定分支的最新提交并滚动
const selectBranchLatestCommit = async (branchName: string) => {
  
  
  if (!branchName) {
    
    return
  }
  
  // 先获取该分支指向的 commit hash（最可靠的方式）
  // 优先获取本地分支的 hash，如果失败则尝试远程分支
  let branchHash = ''
  let remoteBranchHash = ''
  
  // 获取本地分支的 hash
  try {
    const branchHashResult = await props.executeCommand(
      `cd "${props.projectPath}" && git rev-parse ${branchName}`
    )
    if (branchHashResult) {
      const hashOutput = typeof branchHashResult === 'string' ? branchHashResult : (branchHashResult.stdout || branchHashResult.output || '')
      branchHash = hashOutput.trim()
    }
  } catch (error) {
    console.log(`⚠️ [CommitHistory] 获取本地分支 ${branchName} 的 hash 失败:`, error)
  }
  
  // 同时获取远程分支的 hash（如果有 pull 数量，远程分支可能更新）
  try {
    const remoteBranchHashResult = await props.executeCommand(
      `cd "${props.projectPath}" && git rev-parse origin/${branchName} 2>/dev/null || echo ""`
    )
    if (remoteBranchHashResult) {
      const hashOutput = typeof remoteBranchHashResult === 'string' ? remoteBranchHashResult : (remoteBranchHashResult.stdout || remoteBranchHashResult.output || '')
      remoteBranchHash = hashOutput.trim()
      if (remoteBranchHash) {
      }
    }
  } catch (error) {
    
  }
  
  // 使用远程分支的 hash 作为主要目标（如果有），否则使用本地分支的 hash
  const targetHash = remoteBranchHash || branchHash
  
  if (!targetHash) {
    
    return
  }
  
  // 如果提交列表为空，等待一下看是否正在加载
  if (commits.value.length === 0) {
    if (loading.value) {
      // 等待加载完成（最多等待 5 秒）
      let waitCount = 0
      while (loading.value && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }
      
    }
    
    if (commits.value.length === 0) {
      
      return
    }
  }
  
  // 通过 hash 查找该分支指向的提交（最可靠的方式）
  let targetIndex = -1
  
  // 尝试查找的循环，如果找不到就加载更多提交
  let maxLoadAttempts = 3 // 最多尝试加载 3 次
  let loadAttempts = 0
  
  while (targetIndex === -1 && loadAttempts < maxLoadAttempts) {
    // 在当前的提交列表中查找
    for (let i = 0; i < commits.value.length; i++) {
      const commit = commits.value[i]
      
      // 直接通过 hash 匹配（最可靠的方式）
      // 匹配目标 hash（优先远程，其次本地）
      if (commit.hash === targetHash || commit.hash === branchHash || commit.hash === remoteBranchHash) {
        targetIndex = i
        break
      }
      
      // 如果 hash 不匹配，再尝试通过分支名匹配（作为备选方案）
      if (commit.branches) {
        const branchMatch = commit.branches.some(b => {
          // 完全匹配分支名
          if (b === branchName) return true
          // 匹配 origin/分支名
          if (b === `origin/${branchName}`) return true
          // 匹配 refs/heads/分支名
          if (b === `refs/heads/${branchName}`) return true
          // 匹配以 /分支名 结尾的情况
          if (b.endsWith(`/${branchName}`)) return true
          // 如果分支数据是 origin/xxx 格式，但传入的是 xxx，也需要匹配
          if (b.startsWith('origin/') && b.substring(7) === branchName) return true
          // 提取分支名：如果 b 是 "origin/master" 这种格式，提取最后一部分 "master"
          const branchParts = b.split('/')
          const lastPart = branchParts[branchParts.length - 1]
          if (lastPart === branchName) return true
          return false
        })
        
        if (branchMatch) {
          targetIndex = i
          break
        }
      }
    }
    
    // 如果还没找到，且还有更多提交可以加载，就加载更多
    // 注意：这个判断应该在 for 循环外面
    if (targetIndex === -1 && hasMore.value && !loading.value) {
      loadAttempts++
      await loadMore()
      // 等待加载完成
      let waitCount = 0
      while (loading.value && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }
    } else {
      break // 找到了或者没有更多数据了
    }
  }
  
  if (targetIndex >= 0) {
    
    // 选中该提交
    await selectCommit(targetIndex)
    
    // 滚动到该提交
    await nextTick()
    await nextTick() // 再等待一次确保DOM完全更新
    const tableRows = scrollContainer.value?.querySelectorAll('tbody tr')
    if (tableRows && tableRows[targetIndex]) {
      const targetRow = tableRows[targetIndex] as HTMLElement
      const container = scrollContainer.value
      
      if (container) {
        const rowTop = targetRow.offsetTop
        const containerTop = container.scrollTop
        const containerHeight = container.clientHeight
        const rowHeight = targetRow.offsetHeight
        
        // 如果提交不在可见区域，滚动到它
        if (rowTop < containerTop || rowTop + rowHeight > containerTop + containerHeight) {
          // 滚动到行的中心位置
          const targetScrollTop = rowTop - containerHeight / 2 + rowHeight / 2
          container.scrollTop = targetScrollTop
        } else {
        }
      }
    } else {
    }
  } else {
  }
}

// 刷新提交历史（供外部调用）
const refresh = (force = false) => {
  selectedIndex.value = -1
  hasMore.value = true
  // 清除缓存，强制刷新
  if (force) {
    commitHistoryCache.value = null
    branchHashesCache.value = null
  }
  // 重置滚动位置到顶部
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
  loadCommitHistory(force)
}

// 监听项目路径变化
watch(() => props.projectPath, () => {
  selectedIndex.value = -1
  hasMore.value = true
  // 重置滚动位置到顶部
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
  loadCommitHistory()
}, { immediate: true })

watch(localBranchOptions, (branches) => {
  if (!branches.length) {
    selectedLocalBranch.value = ''
    if (historyScope.value === COMMIT_HISTORY_SCOPE.BRANCH) {
      historyScope.value = props.currentBranch ? COMMIT_HISTORY_SCOPE.CURRENT : COMMIT_HISTORY_SCOPE.ALL
    }
    return
  }

  if (!selectedLocalBranch.value || !branches.includes(selectedLocalBranch.value)) {
    selectedLocalBranch.value = branches.includes(props.currentBranch)
      ? props.currentBranch
      : branches[0]
  }
}, { immediate: true })

watch([historyScope, selectedLocalBranch], async () => {
  selectedIndex.value = -1
  hasMore.value = true
  commitHistoryCache.value = null
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
  await loadCommitHistory(true)
})

// 监听当前分支变化（分支切换后需要重新加载提交历史）
watch(() => props.currentBranch, async (newBranch, oldBranch) => {
  
  if (newBranch && newBranch !== oldBranch) {
    if (historyScope.value === COMMIT_HISTORY_SCOPE.CURRENT || !selectedLocalBranch.value) {
      selectedLocalBranch.value = newBranch
    }
    selectedIndex.value = -1
    hasMore.value = true
    // 重置滚动位置到顶部
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = 0
    }
    // 等待DOM更新后再加载提交历史
    await nextTick()
    loadCommitHistory()
  }
})

watch(
  [searchQuery, searchInMessage, searchInAuthor, searchInHash],
  async () => {
    await nextTick()
    await renderGraph()
  }
)

// 🔧 检查并重新渲染图形（用于窗口切回前台时）
const checkAndRenderGraph = async () => {
  // 🔧 检查组件是否已卸载
  if (isUnmounted) {
    return
  }
  
  if (!graphContainer.value || commits.value.length === 0) {
    return
  }
  
  // 检查图形容器是否有内容
  const hasGraphContent = graphContainer.value.querySelector('svg') !== null
  
  if (!hasGraphContent) {
    console.log('🔄 [CommitHistory] 检测到图形消失，重新渲染...')
    await renderGraph()
  }
}

// 注意：移除了 defineExpose，因为它在生产模式下可能导致 Vue 内部错误
// 父组件通过 props 变化或事件来触发刷新

// 🔧 IntersectionObserver 用于检测组件可见性变化
let visibilityObserver: IntersectionObserver | null = null
const componentRef = ref<HTMLElement | null>(null)

// 🔧 处理页面可见性变化（用于检测窗口从后台切回前台）
const handleVisibilityChange = async () => {
  // 🔧 检查组件是否已卸载
  if (isUnmounted) {
    return
  }
  
  if (document.visibilityState === 'visible') {
    // 延迟检查，确保DOM已更新
    setTimeout(() => {
      if (!isUnmounted) {
      checkAndRenderGraph()
      }
    }, 100)
  }
}

// 窗口大小变化时重置高度
const handleWindowResize = () => {
  // 重置 topHeight，让布局恢复默认的 flex 比例
  topHeight.value = 0
}

onMounted(() => {
  // 添加滚动监听
  if (scrollContainer.value) {
    scrollContainer.value.addEventListener('scroll', handleScroll)
  }
  
  // 🔧 监听页面可见性变化（通用方案）
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 监听窗口大小变化，重置高度
  window.addEventListener('resize', handleWindowResize)
  
  // 🔧 使用 IntersectionObserver 检测组件可见性变化（用于标签页切换时）
  if (componentRef.value) {
    visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // 🔧 检查组件是否已卸载
        if (isUnmounted) {
          return
        }
        if (entry.isIntersecting) {
          // 组件变为可见，检查并重新渲染图形
          console.log('🔄 [CommitHistory] 组件变为可见，检查图形...')
          setTimeout(() => {
            if (!isUnmounted) {
              checkAndRenderGraph()
            }
          }, 100)
        }
      })
    }, { threshold: 0.1 })
    
    visibilityObserver.observe(componentRef.value)
  }
})

onUnmounted(() => {
  // 🔧 设置卸载标志，防止异步回调访问已卸载的 refs
  isUnmounted = true
  
  // 移除滚动监听
  if (scrollContainer.value) {
    scrollContainer.value.removeEventListener('scroll', handleScroll)
  }
  
  // 🔧 移除页面可见性变化监听
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  
  // 移除窗口大小变化监听
  window.removeEventListener('resize', handleWindowResize)
  
  // 🔧 移除 IntersectionObserver
  if (visibilityObserver) {
    visibilityObserver.disconnect()
    visibilityObserver = null
  }
})
</script>

<style scoped>
.commit-history-section.git-log {
  display: flex;
  flex-direction: column;
  background-color: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
  flex: 1;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.git-log h2 {
  margin: 0;
  font-size: 1.1em;
}

.git-log p {
  margin: 0;
  padding: 0 1em;
}

.git-log .main {
  position: relative;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: auto;
  flex-shrink: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    #252526;
}

/* 
.git-log table {
  table-layout: fixed;
}

.git-log th, .git-log td {
  border: 0;
  padding: 1px;
  margin: 0;
}

.git-log td {
  overflow: hidden;
  text-overflow: ellipsis;
}
*/

.git-log thead p {
  font-size: 13px;
  font-weight: normal;
  padding: 4px 0;
  text-align: left;
  margin: 0;
}

.git-log .graph {
  position: absolute;
  z-index: 1;
  left: 0;
  pointer-events: none;
}

.git-log svg {
  margin: 0 1em;
  pointer-events: none;
}

.git-log table {
  width: max-content;
  border-collapse: collapse;
  table-layout: fixed;
  border-spacing: 0;
  background: transparent;
}

.git-log tbody {
  height: auto !important;
  background: #2d2d2d;
}

.git-log * {
  box-sizing: border-box;
}

.git-log tbody tr,
.git-log tbody tr > *,
.git-log tbody tr > * > * {
  height: 32px !important;
  max-height: 32px !important;
  line-height: 32px !important;
}

.git-log th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  position: sticky;
  top: 0;
  background-color: rgba(32, 33, 36, 0.96);
  backdrop-filter: blur(6px);
  z-index: 20;
  user-select: none;
  color: rgba(255, 255, 255, 0.8);
  box-sizing: border-box;
}

.git-log td {
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-log th {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-log th .resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: rgba(0, 123, 255, 0.1);
  z-index: 30;
  border-right: 2px solid #cbd5e0;
  transition: all 0.2s;
}

.git-log th .resizer:hover {
  border-right-color: #007bff;
  background: rgba(0, 123, 255, 0.2);
}

.git-log th p {
  text-align: left !important;
  padding-left: 0;
  margin: 0;
}

.git-log td {
  padding: 0 8px;
  border-bottom: none;
}

.git-log th.graph-col,
.git-log td.graph-col {
  width: 170px;
  min-width: 120px;
}

.git-log th.comments,
.git-log td.comments {
  width: 380px;
  min-width: 150px;
  max-width: 380px;
}

.git-log th.commit,
.git-log td.commit {
  width: 80px;
  min-width: 80px;
}

.git-log th.date,
.git-log td.date {
  width: 120px;
  min-width: 120px;
}

.git-log th.author,
.git-log td.author {
  width: 100px;
  min-width: 100px;
}

.git-log .log-highlight {
  background:
    linear-gradient(90deg, rgba(79, 140, 255, 0.2), rgba(79, 140, 255, 0.06));
}

.git-log tbody tr {
  cursor: pointer;
  height: 32px !important;
  max-height: 32px !important;
  min-height: 32px !important;
  box-sizing: border-box !important;
  border: none !important;
  border-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  font-size: 12px;
  overflow: hidden !important;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  transition: background-color 0.18s ease;
}

.git-log tbody tr:nth-child(even):not(.log-highlight) {
  background: rgba(255, 255, 255, 0.018);
}

.git-log tbody td {
  vertical-align: middle !important;
  padding: 0 6px !important;
  height: 32px !important;
  max-height: 32px !important;
  min-height: 32px !important;
  line-height: 32px !important;
  border: none !important;
  border-width: 0 !important;
  font-size: 12px;
  text-align: left;
  box-sizing: border-box !important;
  overflow: hidden !important;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
}

.git-log tbody td p {
  line-height: 32px !important;
  margin: 0 !important;
  padding: 0 !important;
  height: 32px !important;
  max-height: 32px !important;
  min-height: 32px !important;
  font-size: 12px;
  text-align: left;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}

.git-log tbody td div {
  height: 32px !important;
  max-height: 32px !important;
  min-height: 32px !important;
  line-height: 32px !important;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}

.git-log tbody tr:hover:not(.log-highlight) {
  background-color: rgba(255, 255, 255, 0.06);
}

/* 分隔线样式 */
.resizer-horizontal {
  height: 5px;
  min-height: 5px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.1);
  cursor: ns-resize;
  position: relative;
  transition: background 0.2s;
}

.resizer-horizontal:hover {
  background: #667eea;
}

.resizer-vertical {
  width: 5px;
  background: rgba(255, 255, 255, 0.1);
  cursor: ew-resize;
  position: relative;
  transition: background 0.2s;
}

.resizer-vertical:hover {
  background: #667eea;
}

/* 详情区域（固定高度，不随上方拖拽变化） */
.detail-section {
  display: flex;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #2d2d2d;
  flex: 1;
  min-height: 150px;
}

.detail-left {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 0;
  height: 100%;
}

.file-list-panel, .commit-info-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.file-list-expanded {
  flex: 1;
}

.commit-info-compact {
  flex-shrink: 0;
  min-height: 160px;
}

.file-list-panel:last-child, .commit-info-panel:last-child {
  border-bottom: none;
}

.panel-header {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.file-count {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.file-list, .commit-info {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
}

.file-item {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  border-radius: 4px;
  margin: 2px 0;
  color: rgba(255, 255, 255, 0.9);
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.file-item.active {
  background: rgba(102, 126, 234, 0.2);
}

.file-icon {
  width: 16px;
  text-align: center;
  font-weight: bold;
}

.file-icon.added {
  color: #28a745;
}

.file-icon.modified {
  color: #ffc107;
}

.file-icon.deleted {
  color: #dc3545;
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-stats {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-row {
  padding: 6px 12px;
  display: flex;
  font-size: 12px;
}

.info-label {
  min-width: 60px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
}

.info-value {
  flex: 1;
  word-break: break-all;
}

.file-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-bar {
  padding: 12px 16px;
  background:
    linear-gradient(180deg, rgba(79, 140, 255, 0.08), rgba(79, 140, 255, 0.02)),
    rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.search-input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.25);
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.clear-search-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.search-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
}

.scope-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.scope-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.scope-field span {
  white-space: nowrap;
}

.branch-field {
  min-width: 220px;
}

.scope-select {
  min-width: 128px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(20, 21, 24, 0.86);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}

.scope-select:focus {
  border-color: rgba(79, 140, 255, 0.75);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.18);
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
}

.filter-checkbox input[type="checkbox"] {
  cursor: pointer;
}

.file-diff {
  flex: 1;
  overflow: auto;
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: #2d2d2d;
  color: rgba(255, 255, 255, 0.9);
}

.file-diff pre {
  margin: 0;
  white-space: pre-wrap;
  padding: 0;
}

/* 分支和tag显示 */
.commit-content {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px;
  font-size: 12px;
  margin: 0 !important;
  padding: 0 !important;
  height: 32px !important;
  max-height: 32px !important;
  line-height: 32px !important;
  overflow: hidden;
  vertical-align: middle;
  box-sizing: border-box !important;
  width: 100%;
  max-width: 100%;
}

.commit-message {
  display: inline;
  line-height: 32px !important;
  margin: 0 !important;
  padding: 0 !important;
  color: rgba(255, 255, 255, 0.92);
}

.commit-refs {
  display: inline-flex !important;
  gap: 2px;
  align-items: center !important;
  height: 32px !important;
  max-height: 32px !important;
  line-height: 32px !important;
  vertical-align: middle !important;
}

.commit-ref {
  padding: 1px 8px;
  font-size: 10px;
  border-radius: 6px;
  color: white;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  opacity: 0.92;
  border-width: 0;
  line-height: 1;
  height: 18px;
  max-height: 18px;
  vertical-align: middle;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  gap: 4px;
}

.commit-ref.tag {
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid;
  padding: 2px 7px;
  font-size: 10px;
  border-radius: 999px;
  line-height: 1;
  height: 18px;
  max-height: 18px;
  vertical-align: middle;
}

.commit-ref::before {
  content: '';
  width: 10px;
  height: 10px;
  display: inline-block;
  flex: 0 0 10px;
  background-color: currentColor;
  opacity: 0.95;
}

.commit-ref.is-head::before,
.commit-ref.is-local::before,
.commit-ref.is-remote::before {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='4' cy='3' r='2' fill='black'/%3E%3Ccircle cx='4' cy='13' r='2' fill='black'/%3E%3Ccircle cx='12' cy='8' r='2' fill='black'/%3E%3Cpath d='M4 5v6M6 3h2.5A3.5 3.5 0 0 1 12 6.5V6M6 13h2.5A3.5 3.5 0 0 0 12 9.5V10' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.commit-ref.tag::before {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M7 2H3v4l6.2 6.2a1.5 1.5 0 0 0 2.1 0l1.9-1.9a1.5 1.5 0 0 0 0-2.1L7 2Z' fill='black'/%3E%3Ccircle cx='5' cy='5' r='1.2' fill='white'/%3E%3C/svg%3E");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.commit-ref.is-head {
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
}

.commit-ref.is-local:not(.is-head) {
  backdrop-filter: blur(4px);
}

.commit-ref.is-remote {
  font-weight: 500;
}

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

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}
</style>
