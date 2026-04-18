<template>
  <div class="project-workspace">
    <n-config-provider
      class="workspace-provider"
      :theme="darkTheme"
      :theme-overrides="themeOverrides"
    >
      <div class="workspace-split">
        <aside class="tree-pane" :style="{ width: `${treeWidthPx}px` }">
          <div class="tree-toolbar">项目文件</div>
          <div ref="treeScrollRef" class="tree-scroll">
            <div class="workspace-tree-list">
              <button
                v-for="item in visibleTreeNodes"
                :key="item.node.key"
                type="button"
                class="workspace-tree-row"
                :class="[
                  getNodeStatusClass(item.node),
                  { selected: selectedKeys[0] === item.node.key }
                ]"
                @click="handleTreeRowClick(item.node)"
                @dblclick="handleTreeRowDoubleClick(item.node)"
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
                <component :is="getNodeIconComponent(item.node)" :size="15" class="workspace-tree-row__icon" />
                <span class="workspace-tree-row__name" :title="item.node.label">{{ item.node.label }}</span>
                <span v-if="getNodeStatus(item.node)" class="workspace-tree-row__status" :title="`Git 状态 ${getNodeStatus(item.node)}`">
                  {{ getNodeStatus(item.node) }}
                </span>
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
          <div v-if="tabs.length" class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="tab-item"
              :class="{ active: tab.id === activeTabId }"
              @click="activateTab(tab.id)"
            >
              <span class="tab-title" :title="tab.path">{{ tab.title }}</span>
              <span class="tab-close" @click.stop="closeTab(tab.id)">×</span>
            </button>
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
  FolderOpen
} from 'lucide-vue-next'
import * as monaco from 'monaco-editor'

const props = defineProps({
  projectPath: { type: String, required: true },
  isActive: { type: Boolean, default: true }
})

const treeWidthPx = ref(280)
const treeData = ref([])
const expandedKeys = ref([])
const selectedKeys = ref([])
const treeScrollRef = ref(null)
const previewBodyRef = ref(null)
const gitStatusByPath = ref({})
let layoutObserver = null
let gitStatusTimer = null

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

function treeWidthStorageKey () {
  const p = props.projectPath || ''
  return `workspaceTreeWidth_${p.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function loadTreeWidth () {
  try {
    const raw = localStorage.getItem(treeWidthStorageKey())
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 200 && n <= 520) {
      treeWidthPx.value = n
    }
  } catch (e) {}
}

function saveTreeWidth () {
  try {
    localStorage.setItem(treeWidthStorageKey(), String(treeWidthPx.value))
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
      output.push({ node, depth })
      if (node.isDirectory && expandedSet.has(node.key) && Array.isArray(node.children) && node.children.length) {
        appendNodes(node.children, depth + 1)
      }
    }
  }

  appendNodes(treeData.value, 0)
  return output
})

watch(
  () => props.projectPath,
  (p) => {
    if (!p) return
    loadTreeWidth()
    resetTree()
    void ensureDirectoryChildren(treeData.value[0])
    tabs.value = []
    activeTabId.value = null
    imageDataUrl.value = ''
    gitStatusByPath.value = {}
    disposeAllModels()
    if (editor) {
      editor.setModel(null)
    }
    if (props.isActive) {
      startGitStatusPolling()
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

async function toggleDirectory (node) {
  if (!node?.isDirectory) return
  if (!isExpanded(node.key)) {
    await ensureDirectoryChildren(node)
  }
  toggleExpandedKey(node.key)
}

async function handleTreeRowClick (node) {
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
  activeTabId.value = id
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
  syncActiveTabContent()
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
  loadTreeWidth()
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
}

.tree-scroll {
  min-height: 0;
  min-width: 0;
  padding: 6px 0 12px;
  box-sizing: border-box;
  overflow: auto;
}

.workspace-tree-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
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

.workspace-tree-row__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
