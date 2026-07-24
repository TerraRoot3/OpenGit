<template>
  <div class="workspace-text-editor">
    <div class="editor-save-bar">
      <span class="editor-save-bar__status" :class="{ dirty: isDirty }">
        {{ isDirty ? '未保存' : '已保存' }}
      </span>
      <button
        type="button"
        class="editor-save-bar__btn"
        :disabled="!isDirty || isSaving"
        @click="emitSaveRequest"
      >
        {{ isSaving ? '保存中...' : '保存' }}
      </button>
    </div>
    <div v-if="changeNavigationLines.length" class="editor-change-nav">
      <button type="button" class="editor-change-nav__btn" @click="goToPreviousChange">上一个</button>
      <span class="editor-change-nav__meta">{{ currentChangeIndexLabel }}</span>
      <button type="button" class="editor-change-nav__btn" @click="goToNextChange">下一个</button>
    </div>
    <div ref="editorContainerRef" class="monaco-container" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import monaco from './monacoSetup.mjs'
import { useThemeStore } from '../../stores/themeStore.js'
import {
  WORKSPACE_EDITOR_RELEASE_DELAY_MS,
  getWorkspaceEditorSession
} from './workspaceEditorSession.mjs'

const props = defineProps({
  projectPath: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: Object, default: null },
  modifiedFileEntries: { type: Array, default: () => [] },
  isActive: { type: Boolean, default: true },
  isDirty: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  revealTarget: { type: Object, default: null }
})
const emit = defineEmits(['change-content', 'save-request'])

const editorContainerRef = ref(null)
const changeNavigationLines = ref([])
const currentChangeLine = ref(null)

let editor = null
let layoutObserver = null
let gitDiffDecorationIds = []
let currentModelPath = ''
let releaseEditorTimer = null
let suppressContentChangeEvent = false
const themeStore = useThemeStore()
const workspaceSession = computed(() => getWorkspaceEditorSession(props.projectPath))

const DEFAULT_WORKSPACE_EDITOR_BACKGROUND = '#161b22'

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

function basename (p) {
  const s = String(p || '').replace(/\\/g, '/')
  const parts = s.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : s
}

function normalizePath (p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

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

function relativeToProjectPath (targetPath) {
  const base = normalizePath(props.projectPath)
  const target = normalizePath(targetPath)
  if (!target || target === base) return ''
  return target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target
}

function uriForPath (filePath) {
  return monaco.Uri.file(filePath)
}

function resolveWorkspaceEditorBackground () {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return DEFAULT_WORKSPACE_EDITOR_BACKGROUND
  }
  const computed = window.getComputedStyle(document.documentElement)
  const background = computed.getPropertyValue('--theme-sem-bg-project').trim()
  return background || DEFAULT_WORKSPACE_EDITOR_BACKGROUND
}

function resolveWorkspaceEditorForeground () {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return '#d4d4d4'
  }
  const computed = window.getComputedStyle(document.documentElement)
  const foreground = computed.getPropertyValue('--theme-sem-text-primary').trim()
  return normalizeMonacoColor(foreground, '#d4d4d4')
}

function resolveWorkspaceEditorLineNumber () {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return '#858585'
  }
  const computed = window.getComputedStyle(document.documentElement)
  const muted = computed.getPropertyValue('--theme-sem-text-muted').trim()
  return normalizeMonacoColor(muted, '#858585')
}

function resolveWorkspaceThemeColor (name, fallback) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function normalizeMonacoColor (value, fallback) {
  const normalized = String(value || '').trim()
  if (!normalized) return fallback
  if (normalized.startsWith('#')) return normalized

  const rgbaMatch = normalized.match(/^rgba?\(([^)]+)\)$/i)
  if (!rgbaMatch) return fallback

  const parts = rgbaMatch[1].split(',').map(part => part.trim())
  if (parts.length < 3) return fallback

  const [r, g, b] = parts.slice(0, 3).map(part => {
    const numeric = Number.parseFloat(part)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, Math.min(255, Math.round(numeric)))
  })

  const toHex = (channel) => channel.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function applyWorkspaceEditorTheme () {
  monaco.editor.defineTheme('workspace-dark', {
    base: window.getComputedStyle(document.documentElement).colorScheme.includes('light') ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': resolveWorkspaceEditorBackground(),
      'editor.foreground': resolveWorkspaceEditorForeground(),
      'editorLineNumber.foreground': resolveWorkspaceEditorLineNumber(),
      'editorLineNumber.activeForeground': resolveWorkspaceEditorForeground()
    }
  })
  monaco.editor.setTheme('workspace-dark')
}

function quoteShellPath (value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

async function executeWorkspaceCommand (command) {
  return window.electronAPI?.executeCommand?.({
    command,
    cwd: props.projectPath
  })
}

function getModifiedEntryByPath (filePath) {
  return props.modifiedFileEntries.find((entry) => normalizePath(entry.path) === normalizePath(filePath)) || null
}

function clearGitDiffDecorations () {
  if (editor) {
    gitDiffDecorationIds = editor.deltaDecorations(gitDiffDecorationIds, [])
  } else {
    gitDiffDecorationIds = []
  }
  changeNavigationLines.value = []
  currentChangeLine.value = null
}

function getSessionModels () {
  return workspaceSession.value.pathToModel
}

function getSessionViewStates () {
  return workspaceSession.value.pathToViewState
}

function saveCurrentViewState() {
  if (!editor || !currentModelPath) return
  getSessionViewStates().set(currentModelPath, editor.saveViewState())
}

function restoreViewState(filePath) {
  if (!editor || !filePath) return
  const state = getSessionViewStates().get(filePath)
  if (state) {
    editor.restoreViewState(state)
  }
}

function parseDiffRange (fragment) {
  if (!fragment) return { start: 0, count: 1 }
  const [startText, countText] = fragment.split(',')
  const start = Number(startText)
  const count = countText == null ? 1 : Number(countText)
  return {
    start: Number.isFinite(start) ? start : 0,
    count: Number.isFinite(count) ? count : 1
  }
}

function parseUnifiedDiffHunks (diffText) {
  const lines = String(diffText || '').split('\n')
  const hunks = []
  let currentHunk = null

  for (const line of lines) {
    const headerMatch = line.match(/^@@ -(\d+(?:,\d+)?) \+(\d+(?:,\d+)?) @@/)
    if (headerMatch) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        oldRange: parseDiffRange(headerMatch[1]),
        newRange: parseDiffRange(headerMatch[2]),
        removedLines: [],
        addedLines: []
      }
      continue
    }
    if (!currentHunk) continue
    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removedLines.push(line.slice(1))
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLines.push(line.slice(1))
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }
  return hunks
}

async function loadFileDiffMetadata (filePath, model) {
  const entry = getModifiedEntryByPath(filePath)
  if (!editor || !model || !entry) {
    clearGitDiffDecorations()
    return
  }

  if (entry.isUntracked) {
    const lineCount = model.getLineCount()
    const decorations = lineCount > 0
      ? [{
          range: new monaco.Range(1, 1, lineCount, model.getLineMaxColumn(lineCount)),
          options: {
            isWholeLine: true,
            className: 'workspace-diff-line workspace-diff-line--added',
            linesDecorationsClassName: 'workspace-diff-gutter workspace-diff-gutter--added',
            overviewRuler: {
              color: resolveWorkspaceThemeColor('--theme-sem-file-added', '#48b170'),
              position: monaco.editor.OverviewRulerLane.Right
            },
            minimap: {
              color: resolveWorkspaceThemeColor('--theme-sem-file-added', '#48b170'),
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        }]
      : []
    changeNavigationLines.value = lineCount > 0 ? [1] : []
    currentChangeLine.value = changeNavigationLines.value[0] || null
    gitDiffDecorationIds = editor.deltaDecorations(gitDiffDecorationIds, decorations)
    return
  }

  const relativePath = relativeToProjectPath(filePath) || basename(filePath)
  const tryCommands = [
    `git diff --no-ext-diff --unified=0 HEAD -- ${quoteShellPath(relativePath)}`,
    `git diff --no-ext-diff --unified=0 -- ${quoteShellPath(relativePath)}`
  ]

  let diffOutput = ''
  for (const command of tryCommands) {
    const result = await executeWorkspaceCommand(command)
    if (result?.success || result?.output || result?.stdout) {
      diffOutput = result?.output || result?.stdout || ''
      break
    }
  }

  const hunks = parseUnifiedDiffHunks(diffOutput)
  const decorations = []
  const nextChangeLines = new Set()
  const lineCount = model.getLineCount()

  for (const hunk of hunks) {
    const oldCount = hunk.oldRange.count
    const newCount = hunk.newRange.count
    if (newCount > 0) {
      const startLine = Math.max(1, Math.min(hunk.newRange.start, lineCount))
      const endLine = Math.max(startLine, Math.min(hunk.newRange.start + newCount - 1, lineCount))
      const className = oldCount === 0
        ? 'workspace-diff-line workspace-diff-line--added'
        : 'workspace-diff-line workspace-diff-line--modified'
      const gutterClass = oldCount === 0
        ? 'workspace-diff-gutter workspace-diff-gutter--added'
        : 'workspace-diff-gutter workspace-diff-gutter--modified'
      const lineColor = oldCount === 0
        ? resolveWorkspaceThemeColor('--theme-sem-file-added', '#48b170')
        : resolveWorkspaceThemeColor('--theme-sem-file-modified', '#d6b443')
      const minimapColor = lineColor
      nextChangeLines.add(startLine)
      decorations.push({
        range: new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)),
        options: {
          isWholeLine: true,
          className,
          linesDecorationsClassName: gutterClass,
          overviewRuler: {
            color: lineColor,
            position: monaco.editor.OverviewRulerLane.Right
          },
          minimap: {
            color: minimapColor,
            position: monaco.editor.MinimapPosition.Inline
          }
        }
      })
    }

    if (oldCount > 0 && newCount === 0) {
      const anchorLine = Math.min(Math.max(1, hunk.newRange.start), lineCount)
      nextChangeLines.add(anchorLine)
      decorations.push({
        range: new monaco.Range(anchorLine, 1, anchorLine, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'workspace-diff-gutter workspace-diff-gutter--deleted',
          glyphMarginClassName: 'workspace-diff-glyph workspace-diff-glyph--deleted',
          glyphMarginHoverMessage: [{ value: `此处删除了 ${oldCount} 行` }],
          overviewRuler: {
            color: resolveWorkspaceThemeColor('--theme-sem-file-deleted', '#de6d73'),
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      })
    }
  }

  changeNavigationLines.value = Array.from(nextChangeLines).sort((a, b) => a - b)
  currentChangeLine.value = changeNavigationLines.value[0] || null
  gitDiffDecorationIds = editor.deltaDecorations(gitDiffDecorationIds, decorations)
}

function revealChangeLine (lineNumber) {
  if (!editor || !lineNumber) return
  currentChangeLine.value = lineNumber
  editor.revealLineInCenter(lineNumber)
  editor.setPosition({ lineNumber, column: 1 })
}

function goToPreviousChange () {
  const lines = changeNavigationLines.value
  if (!lines.length) return
  const current = currentChangeLine.value ?? lines[0]
  const currentIndex = lines.findIndex((line) => line >= current)
  const nextIndex = currentIndex <= 0 ? lines.length - 1 : currentIndex - 1
  revealChangeLine(lines[nextIndex])
}

function goToNextChange () {
  const lines = changeNavigationLines.value
  if (!lines.length) return
  const current = currentChangeLine.value ?? lines[0]
  const currentIndex = lines.findIndex((line) => line > current)
  const nextIndex = currentIndex === -1 ? 0 : currentIndex
  revealChangeLine(lines[nextIndex])
}

const currentChangeIndexLabel = computed(() => {
  const lines = changeNavigationLines.value
  if (!lines.length) return ''
  const current = currentChangeLine.value ?? lines[0]
  const index = Math.max(0, lines.findIndex((line) => line === current))
  return `${index + 1}/${lines.length}`
})

function emitSaveRequest () {
  if (!props.activeTab?.path) return
  emit('save-request', props.activeTab.path)
}

function revealSearchTarget () {
  const target = props.revealTarget
  if (!editor || !target?.path || normalizePath(target.path) !== normalizePath(props.activeTab?.path)) return
  const model = editor.getModel()
  if (!model) return

  const lineNumber = Math.max(1, Math.min(Number(target.lineNumber) || 1, model.getLineCount()))
  const maxColumn = model.getLineMaxColumn(lineNumber)
  const startColumn = Math.max(1, Math.min(Number(target.column) || 1, maxColumn))
  const length = Math.max(Number(target.length) || 1, 1)
  const endColumn = Math.max(startColumn + length, startColumn + 1)
  const safeEndColumn = Math.min(endColumn, Math.max(maxColumn, startColumn + 1))
  const range = new monaco.Range(lineNumber, startColumn, lineNumber, safeEndColumn)

  editor.setSelection(range)
  editor.revealRangeInCenter(range)
  editor.focus()
}

function disposeStaleModels () {
  const pathToModel = getSessionModels()
  const pathToViewState = getSessionViewStates()
  const activePaths = new Set(
    props.tabs
      .filter((tab) => tab?.kind === 'text' && tab?.path)
      .map((tab) => tab.path)
  )
  for (const [filePath, model] of pathToModel.entries()) {
    if (activePaths.has(filePath)) continue
    pathToViewState.delete(filePath)
    model.dispose()
    pathToModel.delete(filePath)
  }
}

async function syncEditorContent () {
  if (!editor) return
  saveCurrentViewState()
  const tab = props.activeTab
  if (!tab || tab.kind !== 'text') {
    editor.setModel(null)
    currentModelPath = ''
    clearGitDiffDecorations()
    return
  }

  const uri = uriForPath(tab.path)
  const lang = languageForPath(tab.path)
  const pathToModel = getSessionModels()
  const pathToViewState = getSessionViewStates()
  let model = pathToModel.get(tab.path) || monaco.editor.getModel(uri)

  if (model) {
    if (typeof tab.content === 'string' && model.getValue() !== tab.content) {
      const existingViewState = currentModelPath === tab.path ? editor.saveViewState() : pathToViewState.get(tab.path) || null
      suppressContentChangeEvent = true
      model.setValue(tab.content)
      suppressContentChangeEvent = false
      pathToViewState.set(tab.path, existingViewState)
    }
    monaco.editor.setModelLanguage(model, lang)
  } else {
    model = monaco.editor.createModel(typeof tab.content === 'string' ? tab.content : '', lang, uri)
    pathToModel.set(tab.path, model)
  }

  editor.setModel(model)
  currentModelPath = tab.path
  restoreViewState(tab.path)
  editor.layout()
  await loadFileDiffMetadata(tab.path, model)
  revealSearchTarget()
}

function clearReleaseEditorTimer () {
  if (releaseEditorTimer == null || typeof window === 'undefined') return
  window.clearTimeout(releaseEditorTimer)
  releaseEditorTimer = null
}

function destroyEditorInstance () {
  clearReleaseEditorTimer()
  saveCurrentViewState()
  layoutObserver?.disconnect()
  layoutObserver = null
  if (editor) {
    clearGitDiffDecorations()
    editor.dispose()
    editor = null
  }
}

function scheduleEditorRelease () {
  if (typeof window === 'undefined' || !editor || releaseEditorTimer != null) return
  releaseEditorTimer = window.setTimeout(() => {
    releaseEditorTimer = null
    destroyEditorInstance()
  }, WORKSPACE_EDITOR_RELEASE_DELAY_MS)
}

async function createEditorInstance () {
  clearReleaseEditorTimer()
  if (editor || !editorContainerRef.value) return

  applyWorkspaceEditorTheme()
  editor = monaco.editor.create(editorContainerRef.value, {
    readOnly: false,
    theme: 'workspace-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 13,
    lineNumbersMinChars: 1,
    lineDecorationsWidth: 8,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    glyphMargin: true
  })

  editor.onDidScrollChange(() => {
    saveCurrentViewState()
  })

  editor.onDidChangeCursorPosition(() => {
    saveCurrentViewState()
  })

  editor.onDidChangeModelContent(() => {
    if (suppressContentChangeEvent) return
    const model = editor?.getModel()
    if (!model || !props.activeTab?.path) return
    emit('change-content', {
      path: props.activeTab.path,
      content: model.getValue()
    })
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emitSaveRequest()
  })

  layoutObserver = new ResizeObserver(() => {
    editor?.layout()
  })
  layoutObserver.observe(editorContainerRef.value)

  await nextTick()
  await syncEditorContent()
}

onMounted(async () => {
  if (!editorContainerRef.value) return
  if (props.isActive) {
    await createEditorInstance()
  }
})

onBeforeUnmount(() => {
  destroyEditorInstance()
  disposeStaleModels()
})

watch(
  () => themeStore.resolvedTheme.value,
  async () => {
    if (!editor) return
    applyWorkspaceEditorTheme()
    await nextTick()
    const model = editor.getModel()
    if (model && props.activeTab?.path) {
      await loadFileDiffMetadata(props.activeTab.path, model)
    }
    editor?.layout()
  }
)

watch(
  () => [props.activeTab?.path || '', props.activeTab?.savedContent || '', props.isActive],
  async () => {
    if (!editor && props.isActive) {
      await createEditorInstance()
    }
    if (!editor) return
    await syncEditorContent()
    if (props.isActive) {
      nextTick(() => editor?.layout())
    }
  },
  { deep: false }
)

watch(
  () => props.modifiedFileEntries,
  async () => {
    if (!editor || !props.activeTab?.path) return
    const model = getSessionModels().get(props.activeTab.path) || monaco.editor.getModel(uriForPath(props.activeTab.path))
    await loadFileDiffMetadata(props.activeTab.path, model)
  },
  { deep: true }
)

watch(
  () => props.revealTarget?.token,
  async () => {
    if (!props.revealTarget?.token) return
    if (!editor && props.isActive) {
      await createEditorInstance()
    }
    await nextTick()
    revealSearchTarget()
  }
)

watch(
  () => props.tabs.map((tab) => `${tab.id}:${tab.path}:${tab.kind}`).join('|'),
  () => {
    disposeStaleModels()
  }
)

watch(
  () => props.isActive,
  async (active) => {
    if (active) {
      await createEditorInstance()
      await syncEditorContent()
      await nextTick()
      editor?.layout()
      return
    }
    scheduleEditorRelease()
  },
  { immediate: false }
)
</script>

<style scoped>
.workspace-text-editor {
  position: absolute;
  inset: 0;
  min-height: 0;
  min-width: 0;
  background: var(--theme-sem-bg-project);
}

.editor-save-bar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 9;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-project) 90%, var(--theme-sem-surface-2) 10%);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-sem-bg-overlay) 68%, transparent);
}

.editor-save-bar__status {
  color: var(--theme-sem-text-muted);
  font-size: 12px;
}

.editor-save-bar__status.dirty {
  color: var(--theme-sem-accent-warning);
}

.editor-save-bar__btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-sem-hover) 82%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.editor-save-bar__btn:hover:not(:disabled) {
  background: var(--theme-sem-hover);
}

.editor-save-bar__btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.editor-change-nav {
  position: absolute;
  top: 10px;
  right: 124px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 124px);
  padding: 6px 8px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-project) 90%, var(--theme-sem-surface-2) 10%);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-sem-bg-overlay) 68%, transparent);
}

.editor-change-nav__btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-sem-hover) 82%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.editor-change-nav__btn:hover {
  background: var(--theme-sem-hover);
}

.editor-change-nav__meta {
  min-width: 34px;
  text-align: center;
  color: var(--theme-sem-text-muted);
  font-size: 12px;
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

.monaco-container :deep(.workspace-diff-line--added) {
  background: var(--theme-sem-success-bg);
}

.monaco-container :deep(.workspace-diff-line--modified) {
  background: var(--theme-sem-warning-bg);
}

.monaco-container :deep(.workspace-diff-gutter) {
  width: 4px !important;
  margin-left: 6px;
  border-radius: 999px;
}

.monaco-container :deep(.workspace-diff-gutter--added) {
  background: var(--theme-sem-file-added);
}

.monaco-container :deep(.workspace-diff-gutter--modified) {
  background: var(--theme-sem-file-modified);
}

.monaco-container :deep(.workspace-diff-gutter--deleted) {
  background: var(--theme-sem-file-deleted);
}

.monaco-container :deep(.workspace-diff-glyph--deleted::before) {
  content: '−';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 999px;
  background: var(--theme-sem-danger-bg);
  color: var(--theme-sem-file-deleted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
</style>
