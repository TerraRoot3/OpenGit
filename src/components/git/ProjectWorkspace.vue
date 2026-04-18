<template>
  <div class="project-workspace">
    <n-config-provider
      class="workspace-provider"
      :theme="darkTheme"
      :theme-overrides="themeOverrides"
    >
      <div class="workspace-split">
        <aside
          ref="treePaneRef"
          class="tree-pane"
          :style="{ width: `${treeWidthPx}px` }"
          tabindex="0"
          @keydown="handleTreeKeydown"
          @paste="handleTreePaste"
        >
          <div class="tree-toolbar">
            <span class="tree-toolbar__title">项目文件</span>
            <div class="tree-toolbar__actions">
              <button type="button" class="tree-toolbar__action" title="新建文件" @click="startCreate('file')">
                <FilePlus2 :size="14" />
              </button>
              <button type="button" class="tree-toolbar__action" title="新建文件夹" @click="startCreate('directory')">
                <FolderPlus :size="14" />
              </button>
              <button type="button" class="tree-toolbar__action" title="刷新" @click="refreshTree">
                <RefreshCw :size="14" />
              </button>
            </div>
          </div>
          <div ref="treeScrollRef" class="tree-scroll">
            <div class="workspace-tree-list">
              <template v-for="item in visibleTreeNodes" :key="item.key">
                <div
                  v-if="item.kind === 'draft'"
                  class="workspace-tree-row workspace-tree-row--draft"
                  :class="{ selected: true }"
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
                    { selected: selectedKeys[0] === item.node.key }
                  ]"
                  @click="handleTreeRowClick(item.node)"
                  @dblclick="handleTreeRowDoubleClick(item.node)"
                  @contextmenu.prevent="openTreeContextMenu($event, item.node)"
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
                  <span class="workspace-tree-row__name" :title="item.node.label">{{ item.node.label }}</span>
                  <span v-if="getNodeStatus(item.node)" class="workspace-tree-row__status" :title="`Git 状态 ${getNodeStatus(item.node)}`">
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
            <div class="context-menu-item" @click="startCreateFromContext('file')">新建文件</div>
            <div class="context-menu-item" @click="startCreateFromContext('directory')">新建文件夹</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" @click="openContextInFinder">{{ systemFileManagerLabel }}</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item delete" @click="deleteContextNode">删除</div>
          </div>
        </aside>
        <div
          class="splitter"
          title="拖拽调整宽度"
          @pointerdown="onSplitterPointerDown"
        />
        <main class="editor-pane" :class="{ 'editor-pane--tabs': tabs.length > 0 }">
          <div v-if="tabs.length" class="tab-bar">
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
          <div ref="previewBodyRef" class="preview-body">
            <div
              ref="editorContainerRef"
              class="monaco-container"
              v-show="tabs.length > 0 && activeTab?.kind === 'text'"
            />
            <div v-if="!tabs.length" class="preview-empty">在左侧选择文件预览</div>
            <template v-else-if="activeTab">
              <div v-show="activeTab.kind === 'image'" class="image-preview-wrap">
                <img v-if="imageDataUrl" :src="imageDataUrl" alt="" class="image-preview" />
              </div>
              <div v-show="activeTab.kind === 'binary'" class="binary-hint">
                无法以文本预览该文件（可能为二进制或大文件）
              </div>
            </template>
          </div>
        </main>
      </div>
    </n-config-provider>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { NConfigProvider, darkTheme } from 'naive-ui'
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
import * as monaco from 'monaco-editor'
import { useConfirm } from '../../composables/useConfirm'

const props = defineProps({
  projectPath: { type: String, required: true },
  isActive: { type: Boolean, default: true }
})

const treeWidthPx = ref(280)
const treeData = ref([])
const expandedKeys = ref([])
const selectedKeys = ref([])
const treePaneRef = ref(null)
const treeScrollRef = ref(null)
const previewBodyRef = ref(null)
const contextMenuRef = ref(null)
const tabContextMenuRef = ref(null)
const gitStatusByPath = ref({})
const createDraft = ref(null)
const draftName = ref('')
const internalClipboard = ref({ mode: null, paths: [] })
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
let layoutObserver = null
let gitStatusTimer = null
const { confirm } = useConfirm()

const tabs = ref([])
const activeTabId = ref(null)
const editorContainerRef = ref(null)
const imageDataUrl = ref('')

let editor = null
/** @type {Map<string, import('monaco-editor').editor.ITextModel>} */
const pathToModel = new Map()

const themeOverrides = {
  common: {
    fontSize: '13px',
    borderRadius: '8px'
  },
  Tree: {
    nodeColorHover: 'rgba(255, 255, 255, 0.06)',
    nodeColorPressed: 'rgba(255, 255, 255, 0.08)',
    nodeColorActive: 'rgba(255, 255, 255, 0.1)'
  }
}

const WORKSPACE_HEADER_HEIGHT = '37px'
const GIT_STATUS_POLL_MS = 5000
const STATUS_PRIORITY = ['U', 'D', 'R', 'A', 'M', '?']
const IMAGE_FILE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])
const JSON_FILE_EXT = new Set(['json', 'jsonc'])
const SPREADSHEET_FILE_EXT = new Set(['csv', 'tsv', 'xlsx', 'xls'])
const ARCHIVE_FILE_EXT = new Set(['zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz'])
const TERMINAL_FILE_EXT = new Set(['sh', 'bash', 'zsh', 'fish'])
const TEXT_FILE_EXT = new Set(['md', 'txt', 'log', 'yml', 'yaml', 'toml', 'ini', 'conf'])
const platform = window.electronAPI?.platform || 'darwin'
const isRestoringWorkspaceState = ref(false)
const isWorkspaceStatePersistenceSuspended = ref(false)

const systemFileManagerLabel = computed(() => {
  if (platform === 'win32') return '资源管理器'
  if (platform === 'darwin') return '访达'
  return '文件管理器'
})

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

const LANG_MAP = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'html',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  toml: 'ini',
  ini: 'ini',
  gitignore: 'plaintext',
  env: 'plaintext'
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg'])

function extname (p) {
  const base = basename(p)
  const i = base.lastIndexOf('.')
  if (i <= 0) return ''
  return base.slice(i).toLowerCase()
}

function languageForPath (p) {
  const ext = extname(p).slice(1)
  return LANG_MAP[ext] || 'plaintext'
}

function isImagePath (p) {
  return IMAGE_EXT.has(extname(p))
}

function fileIconForPath (filePath) {
  const ext = extname(filePath).slice(1)
  if (IMAGE_FILE_EXT.has(ext)) return FileImage
  if (JSON_FILE_EXT.has(ext)) return FileJson
  if (SPREADSHEET_FILE_EXT.has(ext)) return FileSpreadsheet
  if (ARCHIVE_FILE_EXT.has(ext)) return FileArchive
  if (TERMINAL_FILE_EXT.has(ext)) return FileTerminal
  if (TEXT_FILE_EXT.has(ext)) return FileText
  if (LANG_MAP[ext]) return FileCode
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

function resolveStatusLetter (stagedStatus, unstagedStatus) {
  if (
    (stagedStatus === 'U' && unstagedStatus === 'U') ||
    (stagedStatus === 'A' && unstagedStatus === 'A') ||
    (stagedStatus === 'D' && unstagedStatus === 'D')
  ) {
    return 'U'
  }
  if (stagedStatus === '?' && unstagedStatus === '?') {
    return '?'
  }
  return stagedStatus !== ' ' && stagedStatus !== '?' ? stagedStatus : unstagedStatus
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
  const lines = String(output || '').trim().split('\n').filter(line => line.trim())

  for (const line of lines) {
    if (line.length < 3) continue
    const stagedStatus = line.charAt(0)
    const unstagedStatus = line.charAt(1)
    const status = resolveStatusLetter(stagedStatus, unstagedStatus)
    if (!status || status === ' ') continue

    const relativePath = decodeStatusPath(line)
    if (!relativePath) continue

    const absoluteFilePath = joinProjectPath(relativePath)
    nextMap[absoluteFilePath] = pickHigherPriorityStatus(nextMap[absoluteFilePath], status)

    const segments = normalizePath(relativePath).split('/').filter(Boolean)
    segments.pop()

    let currentDir = ''
    for (const segment of segments) {
      currentDir = currentDir ? `${currentDir}/${segment}` : segment
      const absoluteDirPath = joinProjectPath(currentDir)
      nextMap[absoluteDirPath] = pickHigherPriorityStatus(nextMap[absoluteDirPath], status)
    }
  }

  return nextMap
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
    return
  }
  const nextMap = parseGitStatusMap(result.output || result.stdout || '')
  if (!sameStatusMap(gitStatusByPath.value, nextMap)) {
    gitStatusByPath.value = nextMap
  }
}

function startGitStatusPolling () {
  stopGitStatusPolling()
  void refreshGitStatuses()
  gitStatusTimer = window.setInterval(() => {
    void refreshGitStatuses()
  }, GIT_STATUS_POLL_MS)
}

function stopGitStatusPolling () {
  if (gitStatusTimer != null) {
    window.clearInterval(gitStatusTimer)
    gitStatusTimer = null
  }
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
}

const visibleTreeNodes = computed(() => {
  const output = []
  const expandedSet = new Set(expandedKeys.value)

  const appendNodes = (nodes, depth) => {
    for (const node of nodes) {
      output.push({ kind: 'node', key: node.key, node, depth })
      if (createDraft.value && createDraft.value.parentKey === node.key && node.isDirectory && expandedSet.has(node.key)) {
        output.push({
          kind: 'draft',
          key: `draft:${node.key}:${createDraft.value.type}`,
          parentKey: node.key,
          depth: depth + 1,
          type: createDraft.value.type
        })
      }
      if (node.isDirectory && expandedSet.has(node.key) && Array.isArray(node.children) && node.children.length) {
        appendNodes(node.children, depth + 1)
      }
    }
  }

  appendNodes(treeData.value, 0)
  return output
})

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

async function focusDraftInput() {
  await nextTick()
  const input = treePaneRef.value?.querySelector?.('.workspace-tree-row__input')
  if (input && typeof input.focus === 'function') {
    input.focus()
    input.select?.()
  }
}

async function startCreate(type) {
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

function getPasteTargetDirectory() {
  return findParentDirectoryKey(selectedKeys.value[0] || props.projectPath)
}

async function refreshTree() {
  closeContextMenu()
  closeTabContextMenu()
  const previousExpandedKeys = [...expandedKeys.value]
  const previousSelectedKey = selectedKeys.value[0] || null
  resetCreateDraftState()
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
  const selectedKey = selectedKeys.value[0]
  if (!selectedKey) return
  internalClipboard.value = { mode, paths: [selectedKey] }
}

async function pasteInternalClipboard() {
  const { mode, paths } = internalClipboard.value
  if (!mode || !paths.length) return false
  const targetDirectory = getPasteTargetDirectory()
  const action = mode === 'cut' ? window.electronAPI?.moveFilesystemItems : window.electronAPI?.copyFilesystemItems
  const result = await action?.({ sources: paths, targetDirectory })
  if (!result?.success) {
    console.warn('粘贴失败:', result?.error)
    return true
  }
  if (mode === 'cut') {
    internalClipboard.value = { mode: null, paths: [] }
  }
  await refreshTree()
  return true
}

async function pasteExternalFiles(fileList) {
  const paths = Array.from(fileList || [])
    .map(file => window.electronAPI?.getPathForFile?.(file))
    .filter(Boolean)
  if (!paths.length) return false
  const targetDirectory = getPasteTargetDirectory()
  const result = await window.electronAPI?.copyFilesystemItems({ sources: paths, targetDirectory })
  if (!result?.success) {
    console.warn('粘贴系统文件失败:', result?.error)
    return true
  }
  await refreshTree()
  return true
}

async function handleTreePaste(event) {
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
      await loadTreeWidth()
      resetTree()
      tabs.value = []
      activeTabId.value = null
      imageDataUrl.value = ''
      gitStatusByPath.value = {}
      disposeAllModels()
      if (editor) {
        editor.setModel(null)
      }
      await ensureDirectoryChildren(treeData.value[0])
      await restoreWorkspaceState()
      if (props.isActive) {
        startGitStatusPolling()
      }
    } finally {
      isWorkspaceStatePersistenceSuspended.value = false
      saveWorkspaceState()
    }
  },
  { immediate: true }
)

const activeTab = shallowRef(null)

watch(
  [tabs, activeTabId],
  () => {
    syncActiveTabContent()
  },
  { immediate: true, deep: true }
)

function disposeAllModels () {
  for (const m of pathToModel.values()) {
    m.dispose()
  }
  pathToModel.clear()
}

function uriForPath (filePath) {
  return monaco.Uri.file(filePath)
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

  const lang = languageForPath(filePath)
  const uri = uriForPath(filePath)
  let model = monaco.editor.getModel(uri)
  if (model) {
    model.setValue(content)
    monaco.editor.setModelLanguage(model, lang)
  } else {
    model = monaco.editor.createModel(content, lang, uri)
    pathToModel.set(filePath, model)
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
        kind: 'text'
      }
    ]
  }
  activeTabId.value = id
  saveWorkspaceState()

  await nextTick()
  if (editor && model) {
    editor.setModel(model)
    layoutEditor()
  }
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
    case 'R': return 'workspace-tree-row--renamed'
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

async function toggleDirectory (node) {
  if (!node?.isDirectory) return
  if (!isExpanded(node.key)) {
    await ensureDirectoryChildren(node)
  }
  toggleExpandedKey(node.key)
}

async function handleTreeRowClick (node) {
  closeContextMenu()
  closeTabContextMenu()
  treePaneRef.value?.focus?.()
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
  await handleTreeRowClick(node)
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
  const removedTabs = tabs.value.filter((tab) => isSamePathOrChildPath(tab.path, deletedPath))
  for (const tab of removedTabs) {
    if (tab.kind === 'text' && pathToModel.has(tab.path)) {
      const model = pathToModel.get(tab.path)
      model?.dispose()
      pathToModel.delete(tab.path)
    }
  }
  tabs.value = tabs.value.filter((tab) => !isSamePathOrChildPath(tab.path, deletedPath))
  if (selectedKeys.value[0] && isSamePathOrChildPath(selectedKeys.value[0], deletedPath)) {
    selectedKeys.value = []
  }
  if (activeTabId.value && !tabs.value.some((tab) => tab.id === activeTabId.value)) {
    activeTabId.value = tabs.value.length ? tabs.value[tabs.value.length - 1].id : null
  }
  syncActiveTabContent()
  await refreshTree()
}

function syncActiveTabContent () {
  const tab = tabs.value.find((t) => t.id === activeTabId.value) || null
  activeTab.value = tab

  if (!tab) {
    imageDataUrl.value = ''
    if (editor) {
      editor.setModel(null)
      layoutEditor()
    }
    return
  }

  if (tab.kind === 'text') {
    imageDataUrl.value = ''
    nextTick(() => {
      const model = pathToModel.get(tab.path) || monaco.editor.getModel(uriForPath(tab.path))
      if (editor && model) {
        editor.setModel(model)
        layoutEditor()
      }
    })
    return
  }

  if (editor) {
    editor.setModel(null)
    layoutEditor()
  }

  if (tab.kind === 'image') {
    void window.electronAPI?.readImageAsBase64(tab.path).then((img) => {
      if (activeTabId.value === tab.id) {
        imageDataUrl.value = img?.success ? img.dataUrl : ''
      }
    })
    return
  }

  imageDataUrl.value = ''
}

function activateTab (id) {
  closeTabContextMenu()
  activeTabId.value = id
  saveWorkspaceState()
  syncActiveTabContent()
}

function closeTab (id) {
  const tab = tabs.value.find((t) => t.id === id)
  if (tab && tab.kind === 'text' && pathToModel.has(tab.path)) {
    const m = pathToModel.get(tab.path)
    m.dispose()
    pathToModel.delete(tab.path)
  }
  tabs.value = tabs.value.filter((t) => t.id !== id)
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value.length ? tabs.value[tabs.value.length - 1].id : null
  }
  saveWorkspaceState()
  syncActiveTabContent()
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
    requestAnimationFrame(() => layoutEditor())
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

function layoutEditor () {
  if (editor) {
    editor.layout()
  }
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  await loadTreeWidth()
  if (props.isActive) {
    startGitStatusPolling()
  }
  await nextTick()
  layoutObserver = new ResizeObserver(() => {
    layoutEditor()
  })
  await nextTick()
  if (previewBodyRef.value) {
    layoutObserver.observe(previewBodyRef.value)
  }
  if (treeScrollRef.value) {
    layoutObserver.observe(treeScrollRef.value)
  }
  if (!editorContainerRef.value) return
  editor = monaco.editor.create(editorContainerRef.value, {
    readOnly: true,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 13,
    scrollBeyondLastLine: false,
    wordWrap: 'on'
  })
  layoutEditor()
})

onBeforeUnmount(() => {
  saveWorkspaceState()
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  stopGitStatusPolling()
  layoutObserver?.disconnect()
  layoutObserver = null
  disposeAllModels()
  if (editor) {
    editor.dispose()
    editor = null
  }
})

watch(
  () => props.isActive,
  (active) => {
    if (active) {
      startGitStatusPolling()
      if (editor) {
        nextTick(() => layoutEditor())
      }
    } else {
      stopGitStatusPolling()
    }
  }
)

watch(
  () => [tabs.value.length, activeTabId.value],
  () => {
    nextTick(() => layoutEditor())
  }
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
    }
  }
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

.workspace-provider {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
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

.tree-toolbar {
  padding: 0 12px;
  height: v-bind(WORKSPACE_HEADER_HEIGHT);
  min-height: v-bind(WORKSPACE_HEADER_HEIGHT);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  justify-content: space-between;
  gap: 10px;
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

.monaco-container {
  position: absolute;
  inset: 0;
  min-height: 0;
  min-width: 0;
}

.monaco-container :deep(.monaco-editor),
.monaco-container :deep(.monaco-editor .overflow-guard) {
  min-height: 100%;
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
