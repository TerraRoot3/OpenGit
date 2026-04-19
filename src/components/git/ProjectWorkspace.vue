<template>
  <div class="project-workspace">
    <div class="workspace-split">
      <aside
        ref="treePaneRef"
        class="tree-pane"
        :class="{ 'tree-pane--modified': isModifiedFilterMode }"
        :style="{ width: `${treeWidthPx}px` }"
        tabindex="0"
        @keydown="handleTreeKeydown"
        @paste="handleTreePaste"
      >
          <div class="tree-toolbar">
            <div class="tree-toolbar__header">
              <span class="tree-toolbar__title">项目文件</span>
              <div class="tree-toolbar__actions">
                <button
                  v-if="!isModifiedFilterMode"
                  type="button"
                  class="tree-toolbar__action"
                  title="新建文件"
                  @click="startCreate('file')"
                >
                  <FilePlus2 :size="14" />
                </button>
                <button
                  v-if="!isModifiedFilterMode"
                  type="button"
                  class="tree-toolbar__action"
                  title="新建文件夹"
                  @click="startCreate('directory')"
                >
                  <FolderPlus :size="14" />
                </button>
                <button type="button" class="tree-toolbar__action" title="刷新" @click="refreshTree">
                  <RefreshCw :size="14" />
                </button>
              </div>
            </div>
            <div class="tree-toolbar__controls">
              <div class="tree-filter-wrap">
                <button
                  type="button"
                  class="tree-filter-button"
                  @click.stop="toggleFilterMenu"
                >
                  <span>{{ currentFilterLabel }}</span>
                  <ChevronDown :size="14" class="tree-filter-button__arrow" />
                </button>
                <div
                  v-if="filterMenuVisible"
                  ref="filterMenuRef"
                  class="tree-filter-menu"
                  @click.stop
                >
                  <button
                    type="button"
                    class="tree-filter-menu__item"
                    :class="{ active: treeFilterMode === 'modified' }"
                    @click="selectFilterMode('modified')"
                  >
                    <span>修改文件</span>
                    <span v-if="treeFilterMode === 'modified'">✓</span>
                  </button>
                  <button
                    type="button"
                    class="tree-filter-menu__item"
                    :class="{ active: treeFilterMode === 'all' }"
                    @click="selectFilterMode('all')"
                  >
                    <span>所有文件</span>
                    <span v-if="treeFilterMode === 'all'">✓</span>
                  </button>
                </div>
              </div>
              <div class="tree-search" :class="{ 'tree-search--invalid': Boolean(searchPatternError) }">
                <input
                  v-model="fileSearchQuery"
                  type="text"
                  class="tree-search__input"
                  placeholder="搜索文件名，支持 /regex/i"
                />
              </div>
            </div>
          </div>
          <div
            class="tree-scroll"
            @dragover="handleWorkspaceTreeDragOver"
            @drop="handleWorkspaceTreeScrollDrop"
          >
            <div v-if="isModifiedFilterMode" class="workspace-modified-list">
              <template v-if="filteredModifiedEntries.length">
                <div class="workspace-modified-list__header">
                  <label class="workspace-modified-check">
                    <input
                      type="checkbox"
                      :checked="isAllModifiedSelected"
                      @change="toggleSelectAllModified"
                    />
                    <span>已选 {{ selectedModifiedPaths.length }}/{{ filteredModifiedEntries.length }}</span>
                  </label>
                </div>
                <div v-for="entry in filteredModifiedEntries" :key="entry.path" class="workspace-modified-row-wrap">
                  <button
                    type="button"
                    class="workspace-modified-row"
                    :class="[
                      getModifiedEntryStatusClass(entry),
                      { selected: selectedKeys[0] === entry.path }
                    ]"
                    @click="handleModifiedEntryClick(entry)"
                    @contextmenu.prevent="openModifiedContextMenu($event, entry)"
                  >
                    <label class="workspace-modified-check" @click.stop>
                      <input
                        type="checkbox"
                        :checked="selectedModifiedPaths.includes(entry.path)"
                        @change="toggleModifiedSelection(entry.path)"
                      />
                    </label>
                    <component :is="getModifiedEntryIconComponent(entry)" :size="15" class="workspace-tree-row__icon" :class="getModifiedEntryIconClass(entry)" />
                    <span class="workspace-modified-row__name" :title="entry.relativePath">{{ basename(entry.relativePath) }}</span>
                    <span class="workspace-modified-row__path" :title="entry.relativePath">{{ entry.relativePath }}</span>
                    <span class="workspace-tree-row__status" :title="`Git 状态 ${entry.status}`">{{ entry.status }}</span>
                  </button>
                </div>
              </template>
              <div v-else class="workspace-modified-empty">
                {{ fileSearchQuery.trim() ? '没有匹配的修改文件' : '暂无修改文件' }}
              </div>
            </div>
            <div v-else class="workspace-tree-list">
              <template v-for="item in visibleTreeNodes" :key="item.key">
                <div
                  v-if="item.kind === 'draft'"
                  class="workspace-tree-row workspace-tree-row--draft"
                  :class="{ selected: true }"
                  @dragover="handleWorkspaceTreeDragOver"
                  @drop.stop.prevent="suppressWorkspaceTreeDraftDrop"
                >
                  <span class="workspace-tree-row__indent" :style="{ width: `${item.depth * 16}px` }"></span>
                  <span class="workspace-tree-row__toggle placeholder"></span>
                  <component :is="item.type === 'directory' ? FolderPlus : FilePlus2" :size="15" class="workspace-tree-row__icon" />
                  <input
                    v-model="draftName"
                    class="workspace-tree-row__input"
                    :placeholder="item.type === 'directory' ? '输入文件夹名称' : '输入文件名称'"
                    @keydown.enter.prevent="commitCreateDraft"
                    @keydown.esc.prevent="cancelCreateDraft"
                    @blur="handleDraftBlur"
                  />
                </div>
                <button
                  v-else
                  type="button"
                  class="workspace-tree-row"
                  :class="[
                    getNodeStatusClass(item.node),
                    {
                      selected: selectedKeys.includes(item.node.key),
                      'workspace-tree-row--drop-target': treeDragHoverKey === item.node.key
                    }
                  ]"
                  :draggable="!isRenamingNode(item.node)"
                  @click="handleTreeRowClick(item.node, $event)"
                  @dblclick="handleTreeRowDoubleClick(item.node)"
                  @contextmenu.prevent="openTreeContextMenu($event, item.node)"
                  @dragstart="handleTreeRowDragStart($event, item.node)"
                  @dragend="handleTreeRowDragEnd"
                  @dragover.stop="handleWorkspaceTreeRowDragOver($event, item.node)"
                  @dragleave="handleWorkspaceTreeRowDragLeave($event, item.node)"
                  @drop.stop.prevent="handleWorkspaceTreeRowDrop($event, item.node)"
                >
                  <span class="workspace-tree-row__indent" :style="{ width: `${item.depth * 16}px` }"></span>
                  <span
                    class="workspace-tree-row__toggle"
                    :class="{ placeholder: !item.node.isDirectory }"
                    @click.stop="item.node.isDirectory ? toggleDirectory(item.node) : null"
                  >
                    <component
                      :is="isExpanded(item.node.key) ? ChevronDown : ChevronRight"
                      v-if="item.node.isDirectory"
                      :size="14"
                    />
                  </span>
                  <component :is="getNodeIconComponent(item.node)" :size="15" class="workspace-tree-row__icon" :class="getNodeIconClass(item.node)" />
                  <input
                    v-if="isRenamingNode(item.node)"
                    v-model="renameName"
                    class="workspace-tree-row__input workspace-tree-row__rename-input"
                    @keydown.enter.prevent="commitRenameDraft"
                    @keydown.esc.prevent="cancelRenameDraft"
                    @blur="handleRenameBlur"
                  />
                  <span v-else class="workspace-tree-row__name" :title="item.node.label">{{ item.node.label }}</span>
                  <span v-if="!isRenamingNode(item.node) && getNodeStatus(item.node)" class="workspace-tree-row__status" :title="`Git 状态 ${getNodeStatus(item.node)}`">
                    {{ getNodeStatus(item.node) }}
                  </span>
                </button>
              </template>
            </div>
          </div>
          <div
            v-if="contextMenu.visible"
            ref="contextMenuRef"
            class="context-menu"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
            @click.stop
          >
            <template v-if="!isModifiedFilterMode">
              <div class="context-menu-item" @click="startCreateFromContext('file')">新建文件</div>
              <div class="context-menu-item" @click="startCreateFromContext('directory')">新建文件夹</div>
              <div class="context-menu-divider"></div>
            </template>
            <div class="context-menu-item" @click="openContextInFinder">{{ systemFileManagerLabel }}</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item delete" @click="deleteContextNode">删除</div>
          </div>
          <div v-if="isModifiedFilterMode" class="workspace-git-actions">
            <div class="workspace-git-actions__top">
              <button
                type="button"
                class="workspace-git-actions__btn workspace-git-actions__btn--stash"
                :disabled="gitActionLoading || actionableModifiedPaths.length === 0"
                @click="stashModifiedFiles"
              >
                暂存 ({{ actionableModifiedPaths.length }})
              </button>
              <button
                type="button"
                class="workspace-git-actions__btn workspace-git-actions__btn--discard"
                :disabled="gitActionLoading || actionableModifiedPaths.length === 0"
                @click="discardModifiedFiles"
              >
                放弃修改
              </button>
            </div>
            <textarea
              ref="commitMessageRef"
              v-model="commitMessage"
              class="workspace-git-actions__message"
              placeholder="输入提交信息..."
              :disabled="gitActionLoading"
            />
            <div class="workspace-git-actions__bottom">
              <button
                type="button"
                class="workspace-git-actions__btn workspace-git-actions__btn--commit"
                :disabled="gitActionLoading || actionableModifiedPaths.length === 0 || !commitMessage.trim()"
                @click="commitModifiedFiles"
              >
                {{ gitActionLoading ? '处理中...' : `提交 (${actionableModifiedPaths.length})` }}
              </button>
              <button
                type="button"
                class="workspace-git-actions__btn workspace-git-actions__btn--push"
                :disabled="gitActionLoading || actionableModifiedPaths.length === 0 || !commitMessage.trim()"
                @click="commitAndPushModifiedFiles"
              >
                {{ gitActionLoading ? '处理中...' : `提交并推送 (${actionableModifiedPaths.length})` }}
              </button>
            </div>
          </div>
      </aside>
      <div
        class="splitter"
        title="拖拽调整宽度"
        @pointerdown="onSplitterPointerDown"
      />
      <main class="editor-pane" :class="{ 'editor-pane--tabs': tabs.length > 0 }">
          <div v-if="tabs.length" ref="tabBarRef" class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="tab-item"
              :class="{ active: tab.id === activeTabId }"
              @click="activateTab(tab.id)"
              @contextmenu.prevent="openTabContextMenu($event, tab)"
            >
              <span class="tab-title" :title="tab.path">{{ tab.title }}</span>
              <span class="tab-close" @click.stop="closeTab(tab.id)">×</span>
            </button>
          </div>
          <div
            v-if="tabContextMenu.visible"
            ref="tabContextMenuRef"
            class="context-menu"
            :style="{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }"
            @click.stop
          >
            <div class="context-menu-item" @click="closeTabsToLeft">关闭左侧</div>
            <div class="context-menu-item" @click="closeTabsToRight">关闭右侧</div>
            <div class="context-menu-item" @click="closeOtherTabs">关闭其他</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item delete" @click="closeAllTabs">关闭所有</div>
          </div>
          <div class="preview-body">
            <WorkspaceTextEditor
              v-if="activeTab?.kind === 'text'"
              :project-path="projectPath"
              :tabs="tabs"
              :active-tab="activeTab"
              :modified-file-entries="modifiedFileEntries"
              :is-active="isActive"
            />
            <div v-if="!tabs.length" class="preview-empty">在左侧选择文件预览</div>
            <template v-else-if="activeTab">
              <div v-show="activeTab.kind === 'image'" class="image-preview-wrap">
                <img v-if="imageDataUrl" :src="imageDataUrl" alt="" class="image-preview" />
              </div>
              <div v-show="activeTab.kind === 'pdf'" class="pdf-preview-wrap">
                <iframe
                  v-if="pdfDataUrl"
                  :src="pdfDataUrl"
                  class="pdf-preview-frame"
                  title="PDF 预览"
                />
              </div>
              <div v-show="activeTab.kind === 'binary'" class="binary-hint">
                无法以文本预览该文件（可能为二进制或大文件）
              </div>
            </template>
          </div>
      </main>
    </div>
    <OperationDialog
      :show="showOperationDialog"
      :title="operationType"
      :output="operationOutput"
      :in-progress="operationInProgress"
      @cancel="cancelOperationDialog"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus2,
  RefreshCw
} from 'lucide-vue-next'
import OperationDialog from '../dialog/OperationDialog.vue'
import { useConfirm } from '../../composables/useConfirm'
const WorkspaceTextEditor = defineAsyncComponent(() => import('./WorkspaceTextEditor.vue'))

const props = defineProps({
  projectPath: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  gitSignature: { type: String, default: '' }
})
const emit = defineEmits(['status-changed', 'pending-count-changed'])

const treeWidthPx = ref(280)
const treeData = ref([])
const expandedKeys = ref([])
const selectedKeys = ref([])
const treePaneRef = ref(null)
const tabBarRef = ref(null)
const commitMessageRef = ref(null)
const contextMenuRef = ref(null)
const tabContextMenuRef = ref(null)
const filterMenuRef = ref(null)
const gitStatusByPath = ref({})
const modifiedFileEntries = ref([])
const selectedModifiedPaths = ref([])
const createDraft = ref(null)
const draftName = ref('')
const renameDraft = ref(null)
const renameName = ref('')
const internalClipboard = ref({ mode: null, paths: [] })
const treeDragState = ref({ internal: false, paths: [] })
const treeDragHoverKey = ref('')
let treeDragPreviewEl = null
const treeFilterMode = ref('modified')
const fileSearchQuery = ref('')
const searchPatternError = ref('')
const commitMessage = ref('')
const gitActionLoading = ref(false)
const showOperationDialog = ref(false)
const operationType = ref('')
const operationOutput = ref('')
const operationInProgress = ref(false)
const filterMenuVisible = ref(false)
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  node: null
})
const tabContextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tabId: null
})
const { confirm } = useConfirm()

const tabs = ref([])
const activeTabId = ref(null)
const imageDataUrl = ref('')

const WORKSPACE_HEADER_HEIGHT = '37px'
const STATUS_PRIORITY = ['U', 'D', 'R', 'C', 'T', 'A', 'M', '?']
const IMAGE_FILE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])
const JSON_FILE_EXT = new Set(['json', 'jsonc'])
const SPREADSHEET_FILE_EXT = new Set(['csv', 'tsv', 'xlsx', 'xls'])
const ARCHIVE_FILE_EXT = new Set(['zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz'])
const TERMINAL_FILE_EXT = new Set(['sh', 'bash', 'zsh', 'fish'])
const TEXT_FILE_EXT = new Set(['md', 'txt', 'log', 'yml', 'yaml', 'toml', 'ini', 'conf'])
const platform = window.electronAPI?.platform || 'darwin'
const isRestoringWorkspaceState = ref(false)
const isWorkspaceStatePersistenceSuspended = ref(false)
const lastAppliedGitSignature = ref('')

const systemFileManagerLabel = computed(() => {
  if (platform === 'win32') return '资源管理器'
  if (platform === 'darwin') return '访达'
  return '文件管理器'
})

const currentFilterLabel = computed(() => (treeFilterMode.value === 'modified' ? '修改文件' : '所有文件'))

function treeWidthStorageKey () {
  const p = props.projectPath || ''
  return `workspaceTreeWidth_${p.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function workspaceStateStorageKey () {
  const p = props.projectPath || ''
  return `workspaceState_${p.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function workspaceStateConfigKey () {
  const p = props.projectPath || ''
  return `workspace-state-${p.replace(/[^a-zA-Z0-9]/g, '_')}`
}

async function loadTreeWidth () {
  try {
    const raw = await window.electronAPI?.getConfig?.(treeWidthStorageKey())
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 200 && n <= 520) {
      treeWidthPx.value = n
    }
  } catch (e) {}
}

function saveTreeWidth () {
  try {
    window.electronAPI?.setConfig?.(treeWidthStorageKey(), treeWidthPx.value)
  } catch (e) {}
}

async function loadWorkspaceState() {
  try {
    const parsed = await window.electronAPI?.getConfig?.(workspaceStateConfigKey())
    if (!parsed) return null
    return {
      treeWidth: Number.isFinite(Number(parsed?.treeWidth)) ? Number(parsed.treeWidth) : null,
      expandedKeys: Array.isArray(parsed?.expandedKeys) ? parsed.expandedKeys : [],
      openTabs: Array.isArray(parsed?.openTabs) ? parsed.openTabs : [],
      activePath: typeof parsed?.activePath === 'string' ? parsed.activePath : ''
    }
  } catch (e) {
    return null
  }
}

async function loadCommitTemplate(projectPath) {
  if (!projectPath) return
  try {
    const projectKey = `commit-template-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
    const projectTemplate = await window.electronAPI?.getConfig?.(projectKey)
    if (projectTemplate) {
      commitMessage.value = projectTemplate
      return
    }
    const globalTemplate = await window.electronAPI?.getConfig?.('commit-template-global')
    if (globalTemplate) {
      commitMessage.value = globalTemplate
    }
  } catch (error) {
    console.error('加载提交模板失败:', error)
  }
}

function saveWorkspaceState() {
  if (isRestoringWorkspaceState.value || isWorkspaceStatePersistenceSuspended.value || !props.projectPath) return
  try {
    const activeTab = tabs.value.find((tab) => tab.id === activeTabId.value) || null
    const payload = {
      treeWidth: treeWidthPx.value,
      expandedKeys: expandedKeys.value.filter((key) => key && key !== props.projectPath),
      openTabs: tabs.value.map((tab) => tab.path),
      activePath: activeTab?.path || ''
    }
    window.electronAPI?.setConfig?.(workspaceStateConfigKey(), payload)
  } catch (e) {}
}

function basename (p) {
  const s = String(p).replace(/\\/g, '/')
  const parts = s.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

function normalizePath (p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function joinProjectPath (relativePath) {
  const base = normalizePath(props.projectPath)
  const rel = String(relativePath || '').replace(/^\.?\//, '')
  if (!rel) return base
  return `${base}/${rel}`.replace(/\/+/g, '/')
}

function relativeToProjectPath(targetPath) {
  const base = normalizePath(props.projectPath)
  const target = normalizePath(targetPath)
  if (!target || target === base) return ''
  return target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg'])
const PDF_EXT = new Set(['.pdf'])
const LANGUAGE_ICON_MAP = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'html',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  sql: 'sql',
  md: 'markdown'
}

function extname (p) {
  const base = basename(p)
  const i = base.lastIndexOf('.')
  if (i <= 0) return ''
  return base.slice(i).toLowerCase()
}

function isImagePath (p) {
  return IMAGE_EXT.has(extname(p))
}

function isPdfPath (p) {
  return PDF_EXT.has(extname(p))
}

function languageForPath (p) {
  const ext = extname(p).slice(1)
  return LANGUAGE_ICON_MAP[ext] || 'plaintext'
}

function fileIconForPath (filePath) {
  const ext = extname(filePath).slice(1)
  if (IMAGE_FILE_EXT.has(ext)) return FileImage
  if (JSON_FILE_EXT.has(ext)) return FileJson
  if (SPREADSHEET_FILE_EXT.has(ext)) return FileSpreadsheet
  if (ARCHIVE_FILE_EXT.has(ext)) return FileArchive
  if (TERMINAL_FILE_EXT.has(ext)) return FileTerminal
  if (TEXT_FILE_EXT.has(ext)) return FileText
  if (LANGUAGE_ICON_MAP[ext]) return FileCode
  return File
}

function mapFileToTreeNode (f) {
  const isDir = !!f.isDirectory
  return {
    key: f.path,
    label: f.name,
    isLeaf: !isDir,
    isDirectory: isDir
  }
}

const CONFLICT_STATUS_PAIR_SET = new Set([
  'DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'
])

function isConflictStatusPair (stagedStatus, unstagedStatus) {
  return CONFLICT_STATUS_PAIR_SET.has(`${stagedStatus}${unstagedStatus}`)
}

function normalizeGitStatusFlag (flag) {
  if (!flag || flag === ' ') return ''
  if (flag === '?') return '?'
  if (flag === '!') return ''
  return flag
}

function resolveStatusLetter (stagedStatus, unstagedStatus) {
  if (isConflictStatusPair(stagedStatus, unstagedStatus)) {
    return 'U'
  }

  const staged = normalizeGitStatusFlag(stagedStatus)
  const unstaged = normalizeGitStatusFlag(unstagedStatus)

  if (!staged && !unstaged) return ''
  if (!staged) return unstaged
  if (!unstaged) return staged

  return pickHigherPriorityStatus(staged, unstaged)
}

function decodeStatusPath (line) {
  let pathStart = 2
  while (pathStart < line.length && /\s/.test(line.charAt(pathStart))) {
    pathStart++
  }
  let filePath = line.substring(pathStart).trim()
  if ((filePath.startsWith('"') && filePath.endsWith('"')) || (filePath.startsWith("'") && filePath.endsWith("'"))) {
    filePath = filePath.slice(1, -1)
  }
  if (filePath.includes('\\')) {
    try {
      filePath = filePath.replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      filePath = filePath.replace(/\\"/g, '"').replace(/\\'/g, "'")
    } catch (e) {}
  }
  if (filePath.includes(' -> ')) {
    filePath = filePath.split(' -> ').pop()?.trim() || filePath
  }
  return filePath
}

function pickHigherPriorityStatus (current, next) {
  if (!current) return next
  if (!next) return current
  const currentIndex = STATUS_PRIORITY.indexOf(current)
  const nextIndex = STATUS_PRIORITY.indexOf(next)
  if (currentIndex === -1) return next
  if (nextIndex === -1) return current
  return nextIndex < currentIndex ? next : current
}

function parseGitStatusMap (output) {
  const nextMap = {}
  const entryByKey = new Map()
  const lines = String(output || '').trim().split('\n').filter(line => line.trim())

  const porcelainStagedFlag = (stagedStatus) =>
    stagedStatus !== ' ' && stagedStatus !== '?' ? stagedStatus : null
  const porcelainUnstagedFlag = (unstagedStatus) =>
    unstagedStatus !== ' ' && unstagedStatus !== '?' ? unstagedStatus : null

  for (const line of lines) {
    if (line.length < 3) continue
    const stagedStatus = line.charAt(0)
    const unstagedStatus = line.charAt(1)
    if (stagedStatus === '!' || unstagedStatus === '!') continue

    const status = resolveStatusLetter(stagedStatus, unstagedStatus)
    if (!status || status === ' ' || status === '!') continue

    const relativePath = decodeStatusPath(line)
    if (!relativePath) continue

    const canonicalKey = normalizePath(joinProjectPath(relativePath))
    const aggregatedStatus = pickHigherPriorityStatus(nextMap[canonicalKey], status)
    nextMap[canonicalKey] = aggregatedStatus

    const stagedF = porcelainStagedFlag(stagedStatus)
    const unstagedF = porcelainUnstagedFlag(unstagedStatus)
    const lineConflict = isConflictStatusPair(stagedStatus, unstagedStatus)
    const lineUntracked = stagedStatus === '?' && unstagedStatus === '?'

    const existing = entryByKey.get(canonicalKey)
    if (existing) {
      existing.status = nextMap[canonicalKey]
      existing.stagedStatus = existing.stagedStatus || stagedF
      existing.unstagedStatus = existing.unstagedStatus || unstagedF
      existing.isConflict = existing.isConflict || lineConflict
      existing.isUntracked = existing.isUntracked || lineUntracked
    } else {
      entryByKey.set(canonicalKey, {
        path: canonicalKey,
        relativePath: normalizePath(relativePath),
        stagedStatus: stagedF,
        unstagedStatus: unstagedF,
        status: aggregatedStatus,
        isConflict: lineConflict,
        isUntracked: lineUntracked
      })
    }

    const segments = normalizePath(relativePath).split('/').filter(Boolean)
    segments.pop()

    let currentDir = ''
    for (const segment of segments) {
      currentDir = currentDir ? `${currentDir}/${segment}` : segment
      const dirKey = normalizePath(joinProjectPath(currentDir))
      nextMap[dirKey] = pickHigherPriorityStatus(nextMap[dirKey], status)
    }
  }

  return { statusMap: nextMap, entries: Array.from(entryByKey.values()) }
}

async function refreshGitStatuses () {
  if (!props.projectPath || !window.electronAPI?.executeCommand) return
  const result = await window.electronAPI.executeCommand({
    command: 'git -c core.quotePath=false status --porcelain -uall',
    cwd: props.projectPath
  })
  if (!result?.success) {
    if (Object.keys(gitStatusByPath.value).length) {
      gitStatusByPath.value = {}
    }
    if (modifiedFileEntries.value.length) {
      modifiedFileEntries.value = []
    }
    return
  }
  const { statusMap: nextMap, entries: nextEntries } = parseGitStatusMap(result.output || result.stdout || '')
  if (!sameStatusMap(gitStatusByPath.value, nextMap)) {
    gitStatusByPath.value = nextMap
  }
  modifiedFileEntries.value = nextEntries
}

function sameStatusMap (left, right) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

async function loadTreeNodeChildren (node) {
  if (!window.electronAPI?.getFileTree) return
  const res = await window.electronAPI.getFileTree({ repoPath: node.key })
  if (!res?.success) {
    node.children = []
    node.childrenLoaded = true
    node.loading = false
    return
  }
  const list = (res.files || []).map(mapFileToTreeNode).map(child => ({
    ...child,
    children: [],
    childrenLoaded: false,
    loading: false
  }))
  node.children = list
  node.childrenLoaded = true
  node.loading = false
}

async function ensureDirectoryChildren (node) {
  if (!node?.isDirectory || node.childrenLoaded || node.loading) return
  node.loading = true
  await loadTreeNodeChildren(node)
}

function resetTree () {
  treeData.value = [
    {
      key: props.projectPath,
      label: basename(props.projectPath),
      isLeaf: false,
      isDirectory: true,
      children: [],
      childrenLoaded: false,
      loading: false
    }
  ]
  selectedKeys.value = []
  expandedKeys.value = props.projectPath ? [props.projectPath] : []
  resetRenameDraftState()
}

const visibleTreeNodes = computed(() => {
  const output = []
  const expandedSet = new Set(expandedKeys.value)
  const nodes = filteredTreeRoots.value
  const shouldExpandAll = Boolean(fileSearchQuery.value.trim())

  const appendNodes = (nodes, depth) => {
    for (const node of nodes) {
      output.push({ kind: 'node', key: node.key, node, depth })
      if (
        !isModifiedFilterMode.value &&
        createDraft.value &&
        createDraft.value.parentKey === node.key &&
        node.isDirectory &&
        expandedSet.has(node.key)
      ) {
        output.push({
          kind: 'draft',
          key: `draft:${node.key}:${createDraft.value.type}`,
          parentKey: node.key,
          depth: depth + 1,
          type: createDraft.value.type
        })
      }
      if (
        node.isDirectory &&
        (shouldExpandAll || expandedSet.has(node.key)) &&
        Array.isArray(node.children) &&
        node.children.length
      ) {
        appendNodes(node.children, depth + 1)
      }
    }
  }

  appendNodes(nodes, 0)
  return output
})

const isModifiedFilterMode = computed(() => treeFilterMode.value === 'modified')

const modifiedTreeData = computed(() => {
  const root = {
    key: props.projectPath,
    label: basename(props.projectPath),
    isLeaf: false,
    isDirectory: true,
    children: [],
    childrenLoaded: true,
    loading: false
  }
  const nodeMap = new Map([[normalizePath(props.projectPath), root]])

  const sortedEntries = [...modifiedFileEntries.value].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  for (const entry of sortedEntries) {
    const segments = entry.relativePath.split('/').filter(Boolean)
    let parentKey = normalizePath(props.projectPath)
    let parentNode = nodeMap.get(parentKey)
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]
      const isLast = index === segments.length - 1
      const nodeKey = normalizePath(`${parentKey}/${segment}`)
      let node = nodeMap.get(nodeKey)
      if (!node) {
        node = {
          key: nodeKey,
          label: segment,
          isLeaf: isLast,
          isDirectory: !isLast,
          children: [],
          childrenLoaded: true,
          loading: false
        }
        parentNode.children.push(node)
        nodeMap.set(nodeKey, node)
      }
      parentKey = nodeKey
      parentNode = node
    }
  }

  return [root]
})

const searchState = computed(() => {
  const raw = fileSearchQuery.value.trim()
  if (!raw) return { matcher: null, error: '' }
  const regexMatch = raw.match(/^\/(.+)\/([dgimsuvy]*)$/)
  if (regexMatch) {
    try {
      const regex = new RegExp(regexMatch[1], regexMatch[2])
      return {
        matcher: (value) => regex.test(value),
        error: ''
      }
    } catch (error) {
      return {
        matcher: () => false,
        error: '正则无效'
      }
    }
  }
  const needle = raw.toLowerCase()
  return {
    matcher: (value) => String(value || '').toLowerCase().includes(needle),
    error: ''
  }
})

watch(
  searchState,
  (state) => {
    searchPatternError.value = state.error
  },
  { immediate: true }
)

function filterTreeByName(nodes, matcher) {
  if (!matcher) return nodes
  const nextNodes = []
  for (const node of nodes) {
    const filteredChildren = Array.isArray(node.children) ? filterTreeByName(node.children, matcher) : []
    const matches = matcher(node.label)
    if (matches || filteredChildren.length) {
      nextNodes.push({
        ...node,
        children: filteredChildren
      })
    }
  }
  return nextNodes
}

const filteredTreeRoots = computed(() => {
  const roots = isModifiedFilterMode.value ? modifiedTreeData.value : treeData.value
  const matcher = searchState.value.matcher
  if (!matcher) return roots
  return filterTreeByName(roots, matcher)
})

const filteredModifiedEntries = computed(() => {
  const matcher = searchState.value.matcher
  return modifiedFileEntries.value
    .filter((entry) => {
      if (!matcher) return true
      return matcher(basename(entry.relativePath)) || matcher(entry.relativePath)
    })
})

const actionableModifiedPaths = computed(() => (
  selectedModifiedPaths.value.filter((path) => filteredModifiedEntries.value.some((entry) => entry.path === path))
))

const isAllModifiedSelected = computed(() => (
  filteredModifiedEntries.value.length > 0 &&
  filteredModifiedEntries.value.every((entry) => selectedModifiedPaths.value.includes(entry.path))
))

function findTreeNodeByKey(nodes, key) {
  for (const node of nodes) {
    if (node.key === key) return node
    if (Array.isArray(node.children) && node.children.length) {
      const found = findTreeNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

function findParentDirectoryKey(targetKey) {
  const normalizedTargetKey = normalizePath(targetKey)
  const rootKey = normalizePath(props.projectPath)
  if (!normalizedTargetKey || normalizedTargetKey === rootKey) return rootKey
  const node = findTreeNodeByKey(treeData.value, normalizedTargetKey)
  if (node?.isDirectory) return normalizedTargetKey
  const parentPath = normalizePath(normalizedTargetKey.split('/').slice(0, -1).join('/'))
  return parentPath || rootKey
}

function isSamePathOrChildPath(targetPath, parentPath) {
  const normalizedTarget = normalizePath(targetPath)
  const normalizedParent = normalizePath(parentPath)
  if (!normalizedTarget || !normalizedParent) return false
  return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}/`)
}

async function ensureNodeReady(key) {
  const node = findTreeNodeByKey(treeData.value, key)
  if (node?.isDirectory) {
    if (!isExpanded(key)) {
      toggleExpandedKey(key)
    }
    await ensureDirectoryChildren(node)
  }
  return node
}

async function ensurePathChainReady(targetPath, options = {}) {
  const { expandTarget = false } = options
  const normalizedTargetPath = normalizePath(targetPath)
  const rootPath = normalizePath(props.projectPath)
  if (!normalizedTargetPath || !rootPath || !normalizedTargetPath.startsWith(rootPath)) {
    return null
  }

  let currentNode = treeData.value[0] || null
  if (!currentNode) return null

  await ensureDirectoryChildren(currentNode)

  const relativePath = relativeToProjectPath(normalizedTargetPath)
  const segments = relativePath.split('/').filter(Boolean)

  let currentPath = rootPath
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    currentPath = `${currentPath}/${segment}`.replace(/\/+/g, '/')
    const isLastSegment = index === segments.length - 1

    if (currentNode?.isDirectory) {
      await ensureDirectoryChildren(currentNode)
      if (!isExpanded(currentNode.key)) {
        toggleExpandedKey(currentNode.key)
      }
    }

    const nextNode = findTreeNodeByKey(treeData.value, currentPath)
    if (!nextNode) return null

    if (nextNode.isDirectory && (!isLastSegment || expandTarget)) {
      await ensureDirectoryChildren(nextNode)
      if (!isExpanded(nextNode.key)) {
        toggleExpandedKey(nextNode.key)
      }
    }

    currentNode = nextNode
  }

  return currentNode
}

async function preloadExpandedDirectories(expandedKeysSnapshot) {
  const expandedSet = new Set(
    [props.projectPath, ...expandedKeysSnapshot]
      .map((key) => normalizePath(key))
      .filter(Boolean)
  )

  const visit = async (node) => {
    if (!node?.isDirectory) return
    if (!expandedSet.has(normalizePath(node.key))) return
    await ensureDirectoryChildren(node)
    if (!isExpanded(node.key)) {
      toggleExpandedKey(node.key)
    }
    for (const child of node.children || []) {
      await visit(child)
    }
  }

  const rootNode = treeData.value[0]
  if (rootNode) {
    await visit(rootNode)
  }
}

function resetCreateDraftState() {
  createDraft.value = null
  draftName.value = ''
}

function resetRenameDraftState() {
  renameDraft.value = null
  renameName.value = ''
}

function closeContextMenu() {
  contextMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    node: null
  }
}

function closeTabContextMenu() {
  tabContextMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    tabId: null
  }
}

function closeFilterMenu() {
  filterMenuVisible.value = false
}

function toggleFilterMenu() {
  filterMenuVisible.value = !filterMenuVisible.value
}

function selectFilterMode(mode) {
  treeFilterMode.value = mode
  closeFilterMenu()
}

async function focusDraftInput() {
  await nextTick()
  const input = treePaneRef.value?.querySelector?.('.workspace-tree-row__input')
  if (input && typeof input.focus === 'function') {
    input.focus()
    input.select?.()
  }
}

async function focusRenameInput() {
  await nextTick()
  const input = treePaneRef.value?.querySelector?.('.workspace-tree-row__rename-input')
  if (input && typeof input.focus === 'function') {
    input.focus()
    input.select?.()
  }
}

async function startCreate(type) {
  if (isModifiedFilterMode.value) return
  if (renameDraft.value) return
  closeContextMenu()
  closeTabContextMenu()
  const selectedKey = selectedKeys.value[0] || props.projectPath
  const parentKey = findParentDirectoryKey(selectedKey)
  await ensureNodeReady(parentKey)
  createDraft.value = { type, parentKey }
  draftName.value = ''
  await focusDraftInput()
}

function cancelCreateDraft() {
  resetCreateDraftState()
}

function isRenamingNode(node) {
  return Boolean(renameDraft.value?.key && node?.key === renameDraft.value.key)
}

async function startRenameSelectedNode() {
  if (isModifiedFilterMode.value || createDraft.value) return
  const selectedKey = selectedKeys.value[0]
  if (!selectedKey) return
  const node = findTreeNodeByKey(treeData.value, selectedKey)
  if (!node) return
  renameDraft.value = {
    key: node.key,
    originalName: node.label
  }
  renameName.value = node.label
  await focusRenameInput()
}

function cancelRenameDraft() {
  resetRenameDraftState()
}

async function commitRenameDraft() {
  if (!renameDraft.value?.key) return
  const sourcePath = renameDraft.value.key
  const nextName = renameName.value.trim()
  if (!nextName || nextName === renameDraft.value.originalName) {
    cancelRenameDraft()
    return
  }
  const result = await window.electronAPI?.renameFilesystemItem({
    sourcePath,
    targetName: nextName
  })
  if (!result?.success) {
    console.warn('重命名失败:', result?.error)
    return
  }
  const renamedPath = normalizePath(result.path || '')
  cancelRenameDraft()
  await refreshTree()
  if (renamedPath) {
    selectedKeys.value = [renamedPath]
    const node = findTreeNodeByKey(treeData.value, renamedPath)
    if (node && !node.isDirectory) {
      await openFile(renamedPath)
    }
  }
  saveWorkspaceState()
}

async function handleRenameBlur() {
  if (!renameDraft.value) return
  if (!renameName.value.trim()) {
    cancelRenameDraft()
    return
  }
  await commitRenameDraft()
}

async function commitCreateDraft() {
  if (!createDraft.value) return
  const name = draftName.value.trim()
  if (!name) {
    cancelCreateDraft()
    return
  }
  const draftType = createDraft.value.type
  const parentKey = createDraft.value.parentKey
  const parentRelativePath = relativeToProjectPath(parentKey)
  const targetPath = joinProjectPath(parentRelativePath ? `${parentRelativePath}/${name}` : name)

  const result = draftType === 'directory'
    ? await window.electronAPI?.createDirectory({ dirPath: targetPath })
    : await window.electronAPI?.createFile({ filePath: targetPath, content: '' })

  if (!result?.success) {
    console.warn('创建失败:', result?.error)
    return
  }

  resetCreateDraftState()
  await refreshTree()
  selectedKeys.value = [targetPath]
  if (draftType === 'directory') {
    const node = findTreeNodeByKey(treeData.value, targetPath)
    if (node?.isDirectory && !isExpanded(targetPath)) {
      toggleExpandedKey(targetPath)
    }
  } else {
    await openFile(targetPath)
  }
  saveWorkspaceState()
}

async function handleDraftBlur() {
  if (!createDraft.value) return
  if (!draftName.value.trim()) {
    cancelCreateDraft()
    return
  }
  await commitCreateDraft()
}

function handleDocumentPointerDown(event) {
  const target = event.target
  if (filterMenuVisible.value) {
    const menu = filterMenuRef.value
    const trigger = treePaneRef.value?.querySelector?.('.tree-filter-button')
    if (
      !(target instanceof Node) ||
      ((!menu || !menu.contains(target)) && (!trigger || !trigger.contains(target)))
    ) {
      closeFilterMenu()
    }
  }
  if (contextMenu.value.visible) {
    const menu = treePaneRef.value?.querySelector?.('.context-menu')
    if (!(target instanceof Node) || !menu || !menu.contains(target)) {
      closeContextMenu()
    }
  }
  if (tabContextMenu.value.visible) {
    const menu = tabContextMenuRef.value
    if (!(target instanceof Node) || !menu || !menu.contains(target)) {
      closeTabContextMenu()
    }
  }
  if (createDraft.value) {
    const draftRow = treePaneRef.value?.querySelector?.('.workspace-tree-row--draft')
    if (!draftRow) {
      cancelCreateDraft()
      return
    }
    if (target instanceof Node && draftRow.contains(target)) {
      return
    }
    const input = draftRow.querySelector('.workspace-tree-row__input')
    if (input && typeof input.blur === 'function') {
      input.blur()
      return
    }
    cancelCreateDraft()
  }
}

function getPrimarySelectedKey() {
  return selectedKeys.value[0] || ''
}

function getSelectedTreePaths() {
  return selectedKeys.value.filter(Boolean)
}

function getPasteTargetDirectory() {
  return findParentDirectoryKey(getPrimarySelectedKey() || props.projectPath)
}

async function refreshTree() {
  closeContextMenu()
  closeTabContextMenu()
  const previousExpandedKeys = [...expandedKeys.value]
  const previousSelectedKey = selectedKeys.value[0] || null
  resetCreateDraftState()
  resetRenameDraftState()
  resetTree()
  expandedKeys.value = Array.from(new Set([props.projectPath, ...previousExpandedKeys.filter(Boolean)]))
  await preloadExpandedDirectories(previousExpandedKeys.filter(key => key !== props.projectPath))
  if (previousSelectedKey) {
    selectedKeys.value = [previousSelectedKey]
  }
  saveWorkspaceState()
}

async function restoreWorkspaceState() {
  const state = await loadWorkspaceState()
  if (!state) return
  isRestoringWorkspaceState.value = true
  try {
    if (Number.isFinite(state.treeWidth) && state.treeWidth >= 200 && state.treeWidth <= 520) {
      treeWidthPx.value = state.treeWidth
    }

    for (const key of state.expandedKeys) {
      if (!key || key === props.projectPath) continue
      await ensurePathChainReady(key, { expandTarget: true })
    }

    const restoredPaths = []
    for (const filePath of state.openTabs) {
      if (!filePath) continue
      try {
        const node = await ensurePathChainReady(filePath, { expandTarget: false })
        if (!node || node.isDirectory) {
          continue
        }
        await openFile(filePath)
        restoredPaths.push(filePath)
      } catch (error) {
        console.warn('恢复工作区文件失败:', filePath, error)
      }
    }

    if (state.activePath) {
      const activeTab = tabs.value.find((tab) => tab.path === state.activePath)
      if (activeTab) {
        activeTabId.value = activeTab.id
      }
    }

    if (!state.activePath && restoredPaths.length) {
      const lastTab = tabs.value[tabs.value.length - 1]
      activeTabId.value = lastTab?.id || null
    }
  } finally {
    isRestoringWorkspaceState.value = false
    saveWorkspaceState()
  }
}

function storeInternalClipboard(mode) {
  const selected = getSelectedTreePaths().filter(Boolean)
  if (!selected.length) return
  internalClipboard.value = { mode, paths: selected }
}

function collectInternalWorkspaceDropPaths (event) {
  const dt = event?.dataTransfer
  if (!dt) return []

  const payload = dt.getData('application/x-opengit-tree-paths') || ''
  if (!payload.trim()) return []

  try {
    const parsed = JSON.parse(payload)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((p) => normalizePath(String(p || '').trim())).filter(Boolean))]
  } catch (error) {
    return []
  }
}

function collectWorkspaceDropPaths (event) {
  const internalPaths = collectInternalWorkspaceDropPaths(event)
  if (internalPaths.length) return internalPaths

  const dt = event?.dataTransfer
  if (!dt) return []

  const fromItems = Array.from(dt.items || [])
    .map((item) => {
      if (!item || item.kind !== 'file') return ''
      const file = item.getAsFile?.()
      if (!file) return ''
      if (window.electronAPI?.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || ''
      }
      return file?.path || ''
    })
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim())

  if (fromItems.length) {
    return [...new Set(fromItems)]
  }

  const fromFiles = Array.from(dt.files || [])
    .map((file) => {
      if (!file) return ''
      if (window.electronAPI?.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || ''
      }
      return file?.path || ''
    })
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => p.trim())

  if (fromFiles.length) {
    return [...new Set(fromFiles)]
  }

  const uriList = dt.getData('text/uri-list') || ''
  if (uriList.trim()) {
    const fromUri = uriList
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        if (!/^file:\/\//i.test(line)) return ''
        try {
          const url = new URL(line)
          return decodeURIComponent(url.pathname || '')
        } catch {
          return ''
        }
      })
      .filter(Boolean)
      .map((p) => p.trim())
    if (fromUri.length) {
      return [...new Set(fromUri)]
    }
  }

  const plain = dt.getData('text/plain') || ''
  if (!plain.trim()) return []

  const fromPlain = plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^file:\/\//i.test(line)) {
        try {
          const url = new URL(line)
          return decodeURIComponent(url.pathname || '').trim()
        } catch {
          return ''
        }
      }
      if (line.startsWith('/')) return line
      return ''
    })
    .filter(Boolean)

  return [...new Set(fromPlain)]
}

async function ensurePasteOverwriteForSources (sources, targetDirectory) {
  if (!sources?.length || !targetDirectory) {
    return { proceed: false, overwrite: false }
  }
  const checkApi = window.electronAPI?.getFilesystemPasteConflicts
  if (typeof checkApi !== 'function') {
    return { proceed: true, overwrite: false }
  }
  const check = await checkApi({ sources, targetDirectory })
  if (!check?.success) {
    return { proceed: true, overwrite: false }
  }
  const names = check.conflictNames || []
  if (!names.length) {
    return { proceed: true, overwrite: false }
  }
  const message = names.length === 1
    ? '目标文件夹中已存在同名文件或文件夹。'
    : `目标文件夹中已存在 ${names.length} 个同名文件或文件夹。`
  const detail = names.length <= 12
    ? names.map((n) => `· ${n}`).join('\n')
    : `${names.slice(0, 12).map((n) => `· ${n}`).join('\n')}\n…`
  const confirmed = await confirm({
    title: '确认覆盖',
    message,
    detail: `覆盖后将替换原有内容：\n${detail}`,
    type: 'warning',
    confirmText: '覆盖',
    cancelText: '取消'
  })
  return confirmed ? { proceed: true, overwrite: true } : { proceed: false, overwrite: false }
}

async function transferPathsToDirectory (paths, targetDirectory, mode = 'copy') {
  if (!paths?.length || !targetDirectory) return
  const { proceed, overwrite } = await ensurePasteOverwriteForSources(paths, targetDirectory)
  if (!proceed) return
  const action = mode === 'move'
    ? window.electronAPI?.moveFilesystemItems
    : window.electronAPI?.copyFilesystemItems
  const result = await action?.({ sources: paths, targetDirectory, overwrite })
  if (!result?.success) {
    console.warn(mode === 'move' ? '移动失败:' : '复制失败:', result?.error)
    return
  }
  await refreshTree()
}

async function pasteInternalClipboard() {
  const { mode, paths } = internalClipboard.value
  if (!mode || !paths.length) return false
  const targetDirectory = getPasteTargetDirectory()
  await transferPathsToDirectory(paths, targetDirectory, mode === 'cut' ? 'move' : 'copy')
  if (mode === 'cut') {
    internalClipboard.value = { mode: null, paths: [] }
  }
  return true
}

async function pasteExternalFiles(fileList) {
  const paths = Array.from(fileList || [])
    .map(file => window.electronAPI?.getPathForFile?.(file))
    .filter(Boolean)
  if (!paths.length) return false
  await transferPathsToDirectory(paths, getPasteTargetDirectory(), 'copy')
  return true
}

function handleWorkspaceTreeDragOver (event) {
  if (isModifiedFilterMode.value || !props.projectPath) return
  event.preventDefault()
  treeDragHoverKey.value = ''
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = treeDragState.value.internal && !event.altKey ? 'move' : 'copy'
  }
}

function suppressWorkspaceTreeDraftDrop () {
  treeDragHoverKey.value = ''
  /* 新建名称草稿行不导入文件，仅吞掉 drop 避免冒泡到 tree-scroll */
}

function resolveDropTargetDirectoryKey(node) {
  if (!node?.key) return ''
  return node.isDirectory ? normalizePath(node.key) : ''
}

function createTreeDragPreview(text) {
  if (typeof document === 'undefined') return null
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    padding: '4px 8px',
    borderRadius: '8px',
    background: 'rgba(40, 47, 63, 0.72)',
    border: '1px solid rgba(120, 156, 255, 0.38)',
    color: 'rgba(245, 248, 255, 0.9)',
    fontSize: '11px',
    fontWeight: '500',
    lineHeight: '1.2',
    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.32)',
    pointerEvents: 'none',
    zIndex: '99999',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  })
  document.body.appendChild(el)
  return el
}

function handleTreeRowDragStart (event, node) {
  if (isModifiedFilterMode.value || !node?.key || !event?.dataTransfer) return
  closeContextMenu()
  closeTabContextMenu()
  treeDragHoverKey.value = ''

  const alreadySelected = selectedKeys.value.includes(node.key)
  if (!alreadySelected) {
    selectedKeys.value = [node.key]
  }

  const paths = getSelectedTreePaths()
  treeDragState.value = { internal: true, paths }
  const previewLabel = paths.length > 1 ? `${paths.length} 个项目` : basename(paths[0] || node.key)
  treeDragPreviewEl = createTreeDragPreview(previewLabel)
  event.dataTransfer.effectAllowed = 'copyMove'
  if (treeDragPreviewEl && typeof event.dataTransfer.setDragImage === 'function') {
    event.dataTransfer.setDragImage(treeDragPreviewEl, 12, 10)
  }
  event.dataTransfer.setData('application/x-opengit-tree-paths', JSON.stringify(paths))
  event.dataTransfer.setData('text/plain', paths.join('\n'))
}

function handleTreeRowDragEnd () {
  treeDragState.value = { internal: false, paths: [] }
  treeDragHoverKey.value = ''
  if (treeDragPreviewEl?.parentNode) {
    treeDragPreviewEl.parentNode.removeChild(treeDragPreviewEl)
  }
  treeDragPreviewEl = null
}

function handleWorkspaceTreeRowDragOver(event, node) {
  handleWorkspaceTreeDragOver(event)
  treeDragHoverKey.value = resolveDropTargetDirectoryKey(node)
}

function handleWorkspaceTreeRowDragLeave(event, node) {
  const nextTarget = event?.relatedTarget
  if (event?.currentTarget instanceof Node && nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
    return
  }
  const dropKey = resolveDropTargetDirectoryKey(node)
  if (dropKey && treeDragHoverKey.value === dropKey) {
    treeDragHoverKey.value = ''
  }
}

async function handleWorkspaceTreeRowDrop (event, node) {
  event.stopPropagation()
  if (isModifiedFilterMode.value || !props.projectPath) return
  const paths = collectWorkspaceDropPaths(event)
  if (!paths.length) return
  event.preventDefault()
  const targetDirectory = node.isDirectory
    ? normalizePath(node.key)
    : findParentDirectoryKey(node.key)
  treeDragHoverKey.value = ''
  const mode = treeDragState.value.internal ? (event.altKey ? 'copy' : 'move') : 'copy'
  await transferPathsToDirectory(paths, targetDirectory, mode)
}

async function handleWorkspaceTreeScrollDrop (event) {
  if (isModifiedFilterMode.value || !props.projectPath) return
  treeDragHoverKey.value = ''
  if (event.target?.closest?.('.workspace-tree-row--draft')) {
    event.preventDefault()
    return
  }
  if (event.target?.closest?.('.workspace-tree-row')) return
  const paths = collectWorkspaceDropPaths(event)
  if (!paths.length) return
  event.preventDefault()
  const mode = treeDragState.value.internal ? (event.altKey ? 'copy' : 'move') : 'copy'
  await transferPathsToDirectory(paths, getPasteTargetDirectory(), mode)
}

async function handleTreePaste(event) {
  if (isModifiedFilterMode.value) return
  if (await pasteInternalClipboard()) {
    event.preventDefault()
    return
  }
  const pasted = await pasteExternalFiles(event.clipboardData?.files)
  if (pasted) {
    event.preventDefault()
  }
}

async function handleTreeKeydown(event) {
  if (renameDraft.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelRenameDraft()
    }
    return
  }

  if (isModifiedFilterMode.value) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
      event.preventDefault()
      await refreshTree()
    }
    return
  }

  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    await startRenameSelectedNode()
    return
  }

  const isMetaKey = event.metaKey || event.ctrlKey
  if (!isMetaKey) return
  if (event.key.toLowerCase() === 'c') {
    event.preventDefault()
    storeInternalClipboard('copy')
    return
  }
  if (event.key.toLowerCase() === 'x') {
    event.preventDefault()
    storeInternalClipboard('cut')
    return
  }
  if (event.key.toLowerCase() === 'v') {
    if (await pasteInternalClipboard()) {
      event.preventDefault()
    }
    return
  }
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    await refreshTree()
  }
}

watch(
  () => props.projectPath,
  async (p) => {
    if (!p) return
    isWorkspaceStatePersistenceSuspended.value = true
    try {
      commitMessage.value = ''
      await loadTreeWidth()
      resetTree()
      tabs.value = []
      activeTabId.value = null
      imageDataUrl.value = ''
      gitStatusByPath.value = {}
      selectedModifiedPaths.value = []
      await loadCommitTemplate(p)
      await ensureDirectoryChildren(treeData.value[0])
      await restoreWorkspaceState()
      if (props.isActive) {
        await refreshGitStatuses()
        lastAppliedGitSignature.value = props.gitSignature || ''
      }
    } finally {
      isWorkspaceStatePersistenceSuspended.value = false
      saveWorkspaceState()
    }
  },
  { immediate: true }
)

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) || null)
const pdfDataUrl = ref('')

async function ensureActiveTabVisible() {
  if (!activeTabId.value) return
  await nextTick()
  const tabBar = tabBarRef.value
  if (!tabBar) return
  const active = tabBar.querySelector('.tab-item.active')
  if (active && typeof active.scrollIntoView === 'function') {
    active.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto'
    })
  }
}

async function openFile (filePath) {
  if (!window.electronAPI) return

  if (isImagePath(filePath)) {
    const existing = tabs.value.find((t) => t.path === filePath)
    const id = existing ? existing.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    if (!existing) {
      tabs.value = [
        ...tabs.value,
        {
          id,
          path: filePath,
          title: basename(filePath),
          kind: 'image'
        }
      ]
    }
    activeTabId.value = id
    const img = await window.electronAPI.readImageAsBase64(filePath)
    imageDataUrl.value = img?.success ? img.dataUrl : ''
    saveWorkspaceState()
    await nextTick()
    return
  }

  if (isPdfPath(filePath)) {
    const existing = tabs.value.find((t) => t.path === filePath)
    const id = existing ? existing.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    if (!existing) {
      tabs.value = [
        ...tabs.value,
        {
          id,
          path: filePath,
          title: basename(filePath),
          kind: 'pdf'
        }
      ]
    }
    activeTabId.value = id
    saveWorkspaceState()
    await nextTick()
    return
  }

  let content
  try {
    content = await window.electronAPI.readFile(filePath)
  } catch (e) {
    const id = `t-${Date.now()}`
    tabs.value = [
      ...tabs.value,
      {
        id,
        path: filePath,
        title: basename(filePath),
        kind: 'binary'
      }
    ]
    activeTabId.value = id
    return
  }

  const existing = tabs.value.find((t) => t.path === filePath)
  const id = existing ? existing.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (!existing) {
    tabs.value = [
      ...tabs.value,
      {
        id,
        path: filePath,
        title: basename(filePath),
        kind: 'text',
        content
      }
    ]
  } else {
    tabs.value = tabs.value.map((tab) => (
      tab.id === existing.id
        ? { ...tab, content }
        : tab
    ))
  }
  activeTabId.value = id
  saveWorkspaceState()
}

function toggleExpandedKey (key) {
  if (!key) return
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = Array.from(next)
  saveWorkspaceState()
}

function isExpanded (key) {
  return expandedKeys.value.includes(key)
}

function getNodeStatus (node) {
  return gitStatusByPath.value[normalizePath(node?.key)] || ''
}

function getNodeStatusClass (node) {
  switch (getNodeStatus(node)) {
    case 'U': return 'workspace-tree-row--conflict'
    case 'D': return 'workspace-tree-row--deleted'
    case 'R':
    case 'C': return 'workspace-tree-row--renamed'
    case 'T': return 'workspace-tree-row--modified'
    case 'A': return 'workspace-tree-row--added'
    case 'M': return 'workspace-tree-row--modified'
    case '?': return 'workspace-tree-row--untracked'
    default: return ''
  }
}

function getNodeIconComponent (node) {
  if (node?.isDirectory) {
    return isExpanded(node.key) ? FolderOpen : Folder
  }
  return fileIconForPath(node?.key || node?.label || '')
}

function getNodeIconClass (node) {
  if (node?.isDirectory) {
    return isExpanded(node.key) ? 'workspace-tree-row__icon--folder-open' : 'workspace-tree-row__icon--folder'
  }

  const ext = extname(node?.key || '').slice(1)
  if (IMAGE_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--image'
  if (JSON_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--json'
  if (SPREADSHEET_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--sheet'
  if (ARCHIVE_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--archive'
  if (TERMINAL_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--terminal'
  if (TEXT_FILE_EXT.has(ext)) return 'workspace-tree-row__icon--text'

  switch (languageForPath(node?.key || '')) {
    case 'javascript':
    case 'typescript':
      return 'workspace-tree-row__icon--script'
    case 'html':
    case 'css':
    case 'scss':
    case 'less':
      return 'workspace-tree-row__icon--web'
    case 'python':
      return 'workspace-tree-row__icon--python'
    case 'go':
      return 'workspace-tree-row__icon--go'
    case 'rust':
      return 'workspace-tree-row__icon--rust'
    case 'java':
    case 'kotlin':
      return 'workspace-tree-row__icon--java'
    case 'swift':
      return 'workspace-tree-row__icon--swift'
    case 'cpp':
    case 'csharp':
      return 'workspace-tree-row__icon--native'
    case 'sql':
      return 'workspace-tree-row__icon--sql'
    case 'markdown':
      return 'workspace-tree-row__icon--markdown'
    default:
      return 'workspace-tree-row__icon--file'
  }
}

function getModifiedEntryStatusClass(entry) {
  switch (entry?.status) {
    case 'U': return 'workspace-tree-row--conflict'
    case 'D': return 'workspace-tree-row--deleted'
    case 'R':
    case 'C': return 'workspace-tree-row--renamed'
    case 'T': return 'workspace-tree-row--modified'
    case 'A': return 'workspace-tree-row--added'
    case 'M': return 'workspace-tree-row--modified'
    case '?': return 'workspace-tree-row--untracked'
    default: return ''
  }
}

function getModifiedEntryIconComponent(entry) {
  return fileIconForPath(entry?.path || entry?.relativePath || '')
}

function getModifiedEntryIconClass(entry) {
  return getNodeIconClass({ key: entry?.path || '' })
}

function focusCommitMessageInput() {
  window.requestAnimationFrame(() => {
    commitMessageRef.value?.focus?.()
  })
}

function toggleModifiedSelection(path) {
  const next = new Set(selectedModifiedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  selectedModifiedPaths.value = Array.from(next)
}

function toggleSelectAllModified() {
  if (isAllModifiedSelected.value) {
    selectedModifiedPaths.value = []
    return
  }
  selectedModifiedPaths.value = filteredModifiedEntries.value.map((entry) => entry.path)
}

async function handleModifiedEntryClick(entry) {
  closeContextMenu()
  closeTabContextMenu()
  selectedKeys.value = [entry.path]
  await openFile(entry.path)
  focusCommitMessageInput()
}

async function openModifiedContextMenu(event, entry) {
  openTreeContextMenu(event, {
    key: entry.path,
    label: basename(entry.relativePath),
    isDirectory: false
  })
}

async function toggleDirectory (node) {
  if (!node?.isDirectory) return
  if (!isExpanded(node.key)) {
    await ensureDirectoryChildren(node)
  }
  toggleExpandedKey(node.key)
}

async function handleTreeRowClick (node, event) {
  if (renameDraft.value && !isRenamingNode(node)) {
    cancelRenameDraft()
  }
  closeContextMenu()
  closeTabContextMenu()
  treePaneRef.value?.focus?.()
  const isMultiSelectToggle = Boolean(event?.ctrlKey || event?.metaKey)
  if (isMultiSelectToggle) {
    if (selectedKeys.value.includes(node.key)) {
      selectedKeys.value = selectedKeys.value.filter((key) => key !== node.key)
    } else {
      selectedKeys.value = [node.key, ...selectedKeys.value.filter((key) => key !== node.key)]
    }
    return
  }

  selectedKeys.value = [node.key]
  if (!node?.isDirectory) {
    await openFile(node.key)
  }
}

async function handleTreeRowDoubleClick (node) {
  if (node?.isDirectory) {
    await toggleDirectory(node)
    return
  }
  await handleTreeRowClick(node, null)
}

async function openTreeContextMenu(event, node) {
  closeTabContextMenu()
  selectedKeys.value = [node.key]
  treePaneRef.value?.focus?.()
  const viewportPadding = 8
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    node
  }
  await nextTick()
  const menuEl = contextMenuRef.value
  if (!menuEl) return
  const menuWidth = menuEl.offsetWidth || 0
  const menuHeight = menuEl.offsetHeight || 0
  const maxX = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
  const maxY = Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, maxX),
    y: Math.min(event.clientY, maxY),
    node
  }
}

async function openTabContextMenu(event, tab) {
  closeContextMenu()
  const viewportPadding = 8
  tabContextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    tabId: tab.id
  }
  await nextTick()
  const menuEl = tabContextMenuRef.value
  if (!menuEl) return
  const menuWidth = menuEl.offsetWidth || 0
  const menuHeight = menuEl.offsetHeight || 0
  const maxX = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
  const maxY = Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
  tabContextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, maxX),
    y: Math.min(event.clientY, maxY),
    tabId: tab.id
  }
}

async function startCreateFromContext(type) {
  const node = contextMenu.value.node
  closeContextMenu()
  if (node) {
    selectedKeys.value = [node.key]
  }
  await startCreate(type)
}

async function openContextInFinder() {
  const node = contextMenu.value.node
  closeContextMenu()
  if (!node) return
  await window.electronAPI?.openInFinder({ path: node.key })
}

async function deleteContextNode() {
  const node = contextMenu.value.node
  closeContextMenu()
  if (!node) return
  const confirmed = await confirm({
    title: '确认删除',
    message: `确认将${node.isDirectory ? '文件夹' : '文件'}移到废纸篓？`,
    detail: node.label,
    type: 'danger',
    confirmText: '删除'
  })
  if (!confirmed) return
  const result = await window.electronAPI?.deleteFilesystemItems({ paths: [node.key] })
  if (!result?.success) {
    console.warn('删除失败:', result?.error)
    return
  }
  if (selectedKeys.value[0] === node.key) {
    selectedKeys.value = []
  }
  const deletedPath = normalizePath(node.key)
  tabs.value = tabs.value.filter((tab) => !isSamePathOrChildPath(tab.path, deletedPath))
  if (selectedKeys.value[0] && isSamePathOrChildPath(selectedKeys.value[0], deletedPath)) {
    selectedKeys.value = []
  }
  if (activeTabId.value && !tabs.value.some((tab) => tab.id === activeTabId.value)) {
    activeTabId.value = tabs.value.length ? tabs.value[tabs.value.length - 1].id : null
  }
  await refreshGitStatuses()
  emit('status-changed')
  await refreshTree()
}

function activateTab (id) {
  closeTabContextMenu()
  activeTabId.value = id
  saveWorkspaceState()
}

function closeTab (id) {
  tabs.value = tabs.value.filter((t) => t.id !== id)
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value.length ? tabs.value[tabs.value.length - 1].id : null
  }
  saveWorkspaceState()
}

function closeTabsByIds(ids) {
  const uniqueIds = Array.from(new Set(ids))
  for (const id of uniqueIds) {
    closeTab(id)
  }
}

function closeTabsToLeft() {
  const targetId = tabContextMenu.value.tabId
  const targetIndex = tabs.value.findIndex((tab) => tab.id === targetId)
  closeTabContextMenu()
  if (targetIndex <= 0) return
  closeTabsByIds(tabs.value.slice(0, targetIndex).map((tab) => tab.id))
}

function closeTabsToRight() {
  const targetId = tabContextMenu.value.tabId
  const targetIndex = tabs.value.findIndex((tab) => tab.id === targetId)
  closeTabContextMenu()
  if (targetIndex === -1 || targetIndex >= tabs.value.length - 1) return
  closeTabsByIds(tabs.value.slice(targetIndex + 1).map((tab) => tab.id))
}

function closeOtherTabs() {
  const targetId = tabContextMenu.value.tabId
  closeTabContextMenu()
  if (!targetId) return
  closeTabsByIds(tabs.value.filter((tab) => tab.id !== targetId).map((tab) => tab.id))
}

function closeAllTabs() {
  closeTabContextMenu()
  closeTabsByIds(tabs.value.map((tab) => tab.id))
}

function onSplitterPointerDown (e) {
  if (e.button !== 0) return
  e.preventDefault()
  const startX = e.clientX
  const startW = treeWidthPx.value

  const onMove = (ev) => {
    const dx = ev.clientX - startX
    const next = Math.min(520, Math.max(200, startW + dx))
    treeWidthPx.value = next
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    saveTreeWidth()
    saveWorkspaceState()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function escapeForBashCommand(value) {
  return String(value ?? '').replace(/["\\$`]/g, '\\$&')
}

function quoteShellPath(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function buildSafeGitCommand(baseCommand, filePaths) {
  const safeFiles = filePaths.map(quoteShellPath).join(' ')
  return safeFiles ? `${baseCommand} -- ${safeFiles}` : baseCommand
}

async function executeWorkspaceCommand(command) {
  return window.electronAPI?.executeCommand?.({
    command,
    cwd: props.projectPath
  })
}

function closeOperationDialog() {
  showOperationDialog.value = false
  operationType.value = ''
  operationOutput.value = ''
  operationInProgress.value = false
}

function cancelOperationDialog() {
  if (operationInProgress.value) return
  closeOperationDialog()
}

async function runGitAction(title, executor) {
  showOperationDialog.value = true
  operationType.value = title
  operationOutput.value = ''
  operationInProgress.value = true
  gitActionLoading.value = true
  try {
    await executor()
  } finally {
    operationInProgress.value = false
    gitActionLoading.value = false
  }
}

async function refreshAfterGitAction({ clearCommit = false } = {}) {
  if (clearCommit) {
    commitMessage.value = ''
    await loadCommitTemplate(props.projectPath)
  }
  await refreshGitStatuses()
  await refreshTree()
  emit('status-changed')
}

async function discardModifiedFiles() {
  const targetPaths = actionableModifiedPaths.value
  if (!targetPaths.length || !props.projectPath) return
  const confirmed = await confirm({
    title: '确认放弃修改',
    message: `确认放弃当前筛选结果中的 ${targetPaths.length} 个文件修改？`,
    detail: fileSearchQuery.value.trim() ? '当前搜索结果范围内的修改会被还原。' : '当前所有修改会被还原。',
    type: 'danger',
    confirmText: '放弃修改'
  })
  if (!confirmed) return

  const targetEntries = modifiedFileEntries.value.filter((entry) => targetPaths.includes(entry.path))
  await runGitAction('放弃修改', async () => {
    const untrackedFiles = targetEntries.filter((entry) => entry.isUntracked).map((entry) => entry.relativePath)
    const stagedFiles = targetEntries.filter((entry) => entry.stagedStatus).map((entry) => entry.relativePath)
    const modifiedFiles = targetEntries
      .filter((entry) => !entry.isUntracked && !entry.stagedStatus && entry.unstagedStatus)
      .map((entry) => entry.relativePath)

    if (untrackedFiles.length) {
      operationOutput.value += `删除 ${untrackedFiles.length} 个未跟踪文件...\n`
      const result = await executeWorkspaceCommand(`rm -f ${untrackedFiles.map(quoteShellPath).join(' ')}`)
      if (!result?.success) {
        throw new Error(result?.error || result?.output || '删除未跟踪文件失败')
      }
    }

    if (stagedFiles.length) {
      operationOutput.value += `取消暂存 ${stagedFiles.length} 个文件...\n`
      const resetResult = await executeWorkspaceCommand(buildSafeGitCommand('git reset HEAD', stagedFiles))
      if (!resetResult?.success && !String(resetResult?.output || '').includes('Unstaged')) {
        throw new Error(resetResult?.error || resetResult?.output || '取消暂存失败')
      }
      operationOutput.value += `还原 ${stagedFiles.length} 个暂存文件...\n`
      const checkoutResult = await executeWorkspaceCommand(buildSafeGitCommand('git checkout', stagedFiles))
      if (!checkoutResult?.success) {
        throw new Error(checkoutResult?.error || checkoutResult?.output || '还原暂存文件失败')
      }
    }

    if (modifiedFiles.length) {
      operationOutput.value += `还原 ${modifiedFiles.length} 个修改文件...\n`
      const result = await executeWorkspaceCommand(buildSafeGitCommand('git checkout', modifiedFiles))
      if (!result?.success) {
        throw new Error(result?.error || result?.output || '还原文件失败')
      }
    }

    operationOutput.value += '\n✅ 放弃修改完成'
    await refreshAfterGitAction()
    window.setTimeout(closeOperationDialog, 300)
  }).catch((error) => {
    operationOutput.value += `\n\n❌ ${error.message}`
  })
}

async function stashModifiedFiles() {
  const targetPaths = actionableModifiedPaths.value
  if (!targetPaths.length || !props.projectPath) return
  const branchResult = await executeWorkspaceCommand('git branch --show-current')
  const branchName = branchResult?.success ? (branchResult.output || '').trim() || 'stash' : 'stash'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const stashMessage = `${branchName}-${timestamp}`
  const targetEntries = modifiedFileEntries.value.filter((entry) => targetPaths.includes(entry.path))

  await runGitAction('暂存文件', async () => {
    const hasUntrackedFiles = targetEntries.some((entry) => entry.isUntracked)
    const safeRelativePaths = targetEntries.map((entry) => entry.relativePath)
    let stashCommand = ''

    if (hasUntrackedFiles) {
      operationOutput.value += '检测到未跟踪文件，先加入暂存区...\n'
      const addResult = await executeWorkspaceCommand(buildSafeGitCommand('git add', safeRelativePaths))
      if (!addResult?.success) {
        throw new Error(addResult?.error || addResult?.output || '添加文件失败')
      }
      stashCommand = `git stash push --staged -m "${escapeForBashCommand(stashMessage)}"`
    } else {
      stashCommand = `${buildSafeGitCommand(`git stash push -m "${escapeForBashCommand(stashMessage)}"`, safeRelativePaths)}`
    }

    operationOutput.value += `暂存 ${safeRelativePaths.length} 个文件...\n`
    const stashResult = await executeWorkspaceCommand(stashCommand)
    if (!stashResult?.success) {
      throw new Error(stashResult?.error || stashResult?.output || '暂存失败')
    }
    operationOutput.value += `${stashResult.output || ''}\n\n✅ 暂存完成`
    await refreshAfterGitAction()
    window.setTimeout(closeOperationDialog, 300)
  }).catch((error) => {
    operationOutput.value += `\n\n❌ ${error.message}`
  })
}

async function commitModifiedFiles() {
  const targetPaths = actionableModifiedPaths.value
  if (!targetPaths.length || !commitMessage.value.trim() || !props.projectPath) return
  const safeRelativePaths = modifiedFileEntries.value
    .filter((entry) => targetPaths.includes(entry.path))
    .map((entry) => entry.relativePath)

  await runGitAction('提交更改', async () => {
    operationOutput.value += `暂存 ${safeRelativePaths.length} 个文件...\n`
    const addResult = await executeWorkspaceCommand(buildSafeGitCommand('git add', safeRelativePaths))
    if (!addResult?.success) {
      throw new Error(addResult?.error || addResult?.output || '暂存文件失败')
    }
    operationOutput.value += '创建提交...\n'
    const commitResult = await executeWorkspaceCommand(`git commit -m "${escapeForBashCommand(commitMessage.value.trim())}"`)
    if (!commitResult?.success) {
      throw new Error(commitResult?.error || commitResult?.output || '提交失败')
    }
    operationOutput.value += `${commitResult.output || ''}\n\n✅ 提交完成`
    await refreshAfterGitAction({ clearCommit: true })
    window.setTimeout(closeOperationDialog, 300)
  }).catch((error) => {
    operationOutput.value += `\n\n❌ ${error.message}`
  })
}

async function commitAndPushModifiedFiles() {
  const targetPaths = actionableModifiedPaths.value
  if (!targetPaths.length || !commitMessage.value.trim() || !props.projectPath) return
  const safeRelativePaths = modifiedFileEntries.value
    .filter((entry) => targetPaths.includes(entry.path))
    .map((entry) => entry.relativePath)

  await runGitAction('提交并推送', async () => {
    operationOutput.value += '检查远程状态...\n'
    await executeWorkspaceCommand('git fetch')
    const statusResult = await executeWorkspaceCommand('git status -uno')
    const statusOutput = String(statusResult?.output || '')
    if (statusOutput.includes('Your branch is behind') || statusOutput.includes('have diverged')) {
      operationOutput.value += '检测到远程有更新，先拉取...\n'
      const pullResult = await executeWorkspaceCommand('git pull --no-rebase')
      if (!pullResult?.success && /CONFLICT|冲突/.test(`${pullResult?.output || ''}${pullResult?.error || ''}`)) {
        throw new Error('拉取远程更新时发生冲突，请先解决冲突')
      }
    }

    operationOutput.value += `暂存 ${safeRelativePaths.length} 个文件...\n`
    const addResult = await executeWorkspaceCommand(buildSafeGitCommand('git add', safeRelativePaths))
    if (!addResult?.success) {
      throw new Error(addResult?.error || addResult?.output || '暂存文件失败')
    }

    const commitResult = await executeWorkspaceCommand(`git commit -m "${escapeForBashCommand(commitMessage.value.trim())}"`)
    if (!commitResult?.success) {
      throw new Error(commitResult?.error || commitResult?.output || '提交失败')
    }
    operationOutput.value += `${commitResult.output || ''}\n`

    const remoteResult = await executeWorkspaceCommand('git remote -v')
    if (remoteResult?.success && String(remoteResult.output || '').trim()) {
      operationOutput.value += '推送到远程仓库...\n'
      const pushResult = await executeWorkspaceCommand('git push')
      if (!pushResult?.success) {
        throw new Error(pushResult?.error || pushResult?.output || '推送失败')
      }
      operationOutput.value += `${pushResult.output || ''}\n`
    }

    operationOutput.value += '\n✅ 提交并推送完成'
    await refreshAfterGitAction({ clearCommit: true })
    window.setTimeout(closeOperationDialog, 300)
  }).catch((error) => {
    operationOutput.value += `\n\n❌ ${error.message}`
  })
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  await loadTreeWidth()
  if (props.isActive) {
    await refreshGitStatuses()
    lastAppliedGitSignature.value = props.gitSignature || ''
  }
})

onBeforeUnmount(() => {
  saveWorkspaceState()
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
})

watch(
  () => props.isActive,
  async (active) => {
    if (active) {
      await refreshGitStatuses()
      lastAppliedGitSignature.value = props.gitSignature || ''
      void ensureActiveTabVisible()
    }
  }
)

watch(
  () => props.gitSignature,
  async (signature) => {
    if (!props.isActive || !props.projectPath) return
    const normalizedSignature = String(signature || '')
    if (!normalizedSignature || normalizedSignature === lastAppliedGitSignature.value) return
    await refreshGitStatuses()
    lastAppliedGitSignature.value = normalizedSignature
  }
)

watch(
  filteredModifiedEntries,
  (entries) => {
    const allowed = new Set(entries.map((entry) => entry.path))
    selectedModifiedPaths.value = selectedModifiedPaths.value.filter((path) => allowed.has(path))
  },
  { immediate: true }
)

watch(
  () => selectedModifiedPaths.value.length,
  (count, previousCount) => {
    if (!isModifiedFilterMode.value) return
    if (count > 0 && count !== previousCount) {
      focusCommitMessageInput()
    }
  }
)

watch(
  () => modifiedFileEntries.value.length,
  (count) => {
    emit('pending-count-changed', count)
  },
  { immediate: true }
)

watch(
  () => ({
    expandedKeys: [...expandedKeys.value],
    tabPaths: tabs.value.map((tab) => tab.path),
    activeTabId: activeTabId.value
  }),
  () => {
    saveWorkspaceState()
  },
  { deep: true }
)

watch(
  () => tabs.value.length,
  (n) => {
    if (n === 0) {
      imageDataUrl.value = ''
      pdfDataUrl.value = ''
      return
    }
    if (activeTabId.value) {
      void ensureActiveTabVisible()
    }
  }
)

watch(
  () => activeTabId.value,
  () => {
    void ensureActiveTabVisible()
  }
)

watch(
  activeTab,
  (tab) => {
    if (!tab) {
      imageDataUrl.value = ''
      pdfDataUrl.value = ''
      return
    }
    if (tab.kind === 'image') {
      pdfDataUrl.value = ''
      void window.electronAPI?.readImageAsBase64(tab.path).then((img) => {
        if (activeTabId.value === tab.id) {
          imageDataUrl.value = img?.success ? img.dataUrl : ''
        }
      })
      return
    }
    if (tab.kind === 'pdf') {
      imageDataUrl.value = ''
      void window.electronAPI?.readFileAsBase64?.(tab.path).then((fileResult) => {
        if (activeTabId.value === tab.id) {
          pdfDataUrl.value = fileResult?.success ? fileResult.dataUrl : ''
        }
      })
      return
    }
    imageDataUrl.value = ''
    pdfDataUrl.value = ''
  },
  { immediate: true, deep: true }
)
</script>

<style scoped>
.project-workspace {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #1b1c1f;
  color: rgba(255, 255, 255, 0.88);
  border-radius: 11px;
  overflow: hidden;
  box-sizing: border-box;
  /* 仅左右留白，避免 margin 纵向吃掉 flex 可用高度 */
  margin: 0 10px 0 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.workspace-split {
  display: flex;
  align-items: stretch;
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
}

.tree-pane {
  flex-shrink: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 200px;
  max-width: 520px;
  min-height: 0;
  align-self: stretch;
  background: rgba(0, 0, 0, 0.15);
  overflow: hidden;
  outline: none;
}

.tree-pane--modified {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.tree-toolbar {
  padding: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tree-toolbar__header {
  height: v-bind(WORKSPACE_HEADER_HEIGHT);
  min-height: v-bind(WORKSPACE_HEADER_HEIGHT);
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tree-toolbar__controls {
  position: relative;
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: 8px;
  padding: 0 12px 10px;
}

.tree-toolbar__title {
  min-width: 0;
}

.tree-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tree-toolbar__action {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.48);
  cursor: pointer;
}

.tree-toolbar__action:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.84);
}

.tree-filter-wrap {
  position: relative;
  min-width: 0;
}

.tree-filter-button {
  width: 100%;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  cursor: pointer;
}

.tree-filter-button__arrow {
  color: rgba(255, 255, 255, 0.5);
}

.tree-filter-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  min-width: 148px;
  padding: 8px 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: #2d2d30;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  z-index: 20;
}

.tree-filter-menu__item {
  width: 100%;
  height: 38px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  cursor: pointer;
}

.tree-filter-menu__item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.tree-filter-menu__item.active {
  color: #fff;
}

.tree-search {
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.tree-search--invalid {
  border-color: rgba(255, 123, 123, 0.7);
}

.tree-search__input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  outline: none;
}

.tree-search__input::placeholder {
  color: rgba(255, 255, 255, 0.32);
}

.tree-scroll {
  min-height: 0;
  min-width: 0;
  padding: 6px 0 12px;
  box-sizing: border-box;
  overflow: auto;
  overflow-y: auto;
  overflow-x: auto;
}

.workspace-tree-list {
  display: flex;
  flex-direction: column;
  min-width: max-content;
}

.workspace-modified-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace-modified-list__header {
  padding: 0 10px 8px;
}

.workspace-modified-row-wrap {
  min-width: 0;
}

.workspace-modified-row {
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: 20px 16px minmax(0, auto) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.76);
  text-align: left;
  cursor: pointer;
}

.workspace-modified-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.workspace-modified-row.selected {
  background: rgba(77, 135, 255, 0.14);
}

.workspace-modified-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.workspace-modified-check input {
  margin: 0;
}

.workspace-modified-row__name {
  min-width: 0;
  white-space: nowrap;
}

.workspace-modified-row__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.36);
  font-size: 11px;
}

.workspace-modified-empty {
  padding: 16px 12px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
}

.workspace-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  min-width: 100%;
  min-height: 28px;
  padding: 0 10px 0 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.workspace-tree-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.workspace-tree-row.selected {
  background: rgba(77, 135, 255, 0.14);
}

.workspace-tree-row--drop-target {
  background: rgba(95, 146, 255, 0.2);
  box-shadow: inset 0 0 0 1px rgba(120, 170, 255, 0.55);
}

.workspace-tree-row__indent {
  flex: 0 0 auto;
  align-self: stretch;
}

.workspace-tree-row__toggle {
  width: 16px;
  min-width: 16px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.42);
}

.workspace-tree-row__toggle.placeholder {
  pointer-events: none;
}

.workspace-tree-row__icon {
  flex: 0 0 auto;
  opacity: 0.9;
}

.workspace-tree-row__icon--folder {
  color: #d8b15c;
}

.workspace-tree-row__icon--folder-open {
  color: #f0c96a;
}

.workspace-tree-row__icon--image {
  color: #db7ef2;
}

.workspace-tree-row__icon--json {
  color: #7ed9a6;
}

.workspace-tree-row__icon--sheet {
  color: #63d18b;
}

.workspace-tree-row__icon--archive {
  color: #d9a564;
}

.workspace-tree-row__icon--terminal {
  color: #65c4ff;
}

.workspace-tree-row__icon--text {
  color: #b8c0cf;
}

.workspace-tree-row__icon--script {
  color: #f2d06b;
}

.workspace-tree-row__icon--web {
  color: #72c3ff;
}

.workspace-tree-row__icon--python {
  color: #7cc7ff;
}

.workspace-tree-row__icon--go {
  color: #6ed3d8;
}

.workspace-tree-row__icon--rust {
  color: #d48c62;
}

.workspace-tree-row__icon--java {
  color: #ff9b7a;
}

.workspace-tree-row__icon--swift {
  color: #ff9968;
}

.workspace-tree-row__icon--native {
  color: #8eb1ff;
}

.workspace-tree-row__icon--sql {
  color: #79b8ff;
}

.workspace-tree-row__icon--markdown {
  color: #8fb7ff;
}

.workspace-tree-row__icon--file {
  color: rgba(255, 255, 255, 0.72);
}

.workspace-tree-row__name {
  flex: 0 0 auto;
  min-width: max-content;
  white-space: nowrap;
}

.workspace-tree-row__status {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.04em;
  opacity: 0.9;
}

.workspace-tree-row--draft {
  padding-right: 10px;
}

.workspace-tree-row__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  outline: none;
}

.workspace-tree-row__input:focus {
  border-color: rgba(77, 135, 255, 0.75);
}

.workspace-git-actions {
  padding: 10px 12px 12px;
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 8px;
  background: rgba(0, 0, 0, 0.22);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.workspace-git-actions__top,
.workspace-git-actions__bottom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-git-actions__message {
  min-height: 56px;
  max-height: 88px;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  line-height: 1.5;
  outline: none;
}

.workspace-git-actions__message::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.workspace-git-actions__btn {
  height: 30px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, filter 0.15s ease;
}

.workspace-git-actions__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.workspace-git-actions__btn--stash {
  background: rgba(106, 141, 255, 0.18);
  color: #adc2ff;
}

.workspace-git-actions__btn--discard {
  background: rgba(255, 116, 116, 0.15);
  color: #ffb0b0;
}

.workspace-git-actions__btn--commit {
  background: #5c8dff;
  color: #fff;
}

.workspace-git-actions__btn--push {
  background: rgba(101, 205, 150, 0.18);
  color: #b7f0cb;
}

.workspace-git-actions__btn:not(:disabled):hover {
  filter: brightness(1.08);
}

.context-menu {
  position: fixed;
  min-width: 132px;
  padding: 6px 0;
  border-radius: 8px;
  background: #25262b;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 3000;
}

.context-menu-item {
  padding: 9px 14px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  white-space: nowrap;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.context-menu-item.delete {
  color: #ff8d8d;
}

.context-menu-item.delete:hover {
  background: rgba(255, 108, 108, 0.12);
}

.context-menu-divider {
  height: 1px;
  margin: 6px 0;
  background: rgba(255, 255, 255, 0.08);
}

.workspace-tree-row--conflict {
  color: #ffb86b;
}

.workspace-tree-row--deleted {
  color: #ff7f87;
}

.workspace-tree-row--renamed {
  color: #79c0ff;
}

.workspace-tree-row--added {
  color: #6bd39f;
}

.workspace-tree-row--modified {
  color: #f2d06b;
}

.workspace-tree-row--untracked {
  color: #b8b8c2;
}

.splitter {
  width: 1px;
  flex-shrink: 0;
  cursor: col-resize;
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  z-index: 2;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.splitter::before {
  content: '';
  position: absolute;
  top: 0;
  left: -4px;
  width: 9px;
  height: 100%;
}

.splitter:hover {
  background: rgba(77, 135, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(77, 135, 255, 0.25);
}

.editor-pane {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  display: grid;
  align-self: stretch;
  /* 无 Tab 时单行占满；有 Tab 时首行 auto、预览区 minmax 可滚 */
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  background: #1e1e1e;
}

.editor-pane--tabs {
  grid-template-rows: auto minmax(0, 1fr);
}

.tab-bar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 0 8px 0 0;
  height: v-bind(WORKSPACE_HEADER_HEIGHT);
  min-height: v-bind(WORKSPACE_HEADER_HEIGHT);
  box-sizing: border-box;
  background: #252526;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  max-width: 200px;
  padding: 0 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  cursor: pointer;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
}

.tab-item.active {
  background: #1e1e1e;
  color: rgba(255, 255, 255, 0.92);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  flex-shrink: 0;
  opacity: 0.65;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.tab-close:hover {
  opacity: 1;
  color: #fff;
}

.preview-body {
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 13px;
}

.image-preview-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
  overflow-x: hidden;
  padding: 12px;
  box-sizing: border-box;
}

.image-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.pdf-preview-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  background: #1e1e1e;
}

.pdf-preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #1e1e1e;
}

.binary-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}
</style>
