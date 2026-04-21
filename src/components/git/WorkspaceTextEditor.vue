<template>
  <div class="workspace-text-editor">
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
import * as monaco from 'monaco-editor'

const props = defineProps({
  projectPath: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: Object, default: null },
  modifiedFileEntries: { type: Array, default: () => [] },
  isActive: { type: Boolean, default: true }
})

const editorContainerRef = ref(null)
const changeNavigationLines = ref([])
const currentChangeLine = ref(null)

let editor = null
let layoutObserver = null
let themeObserver = null
let gitDiffDecorationIds = []
/** @type {Map<string, import('monaco-editor').editor.ITextModel>} */
const pathToModel = new Map()
/** @type {Map<string, import('monaco-editor').editor.ICodeEditorViewState | null>} */
const pathToViewState = new Map()
let currentModelPath = ''

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

function applyWorkspaceEditorTheme () {
  monaco.editor.defineTheme('workspace-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': resolveWorkspaceEditorBackground()
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

function saveCurrentViewState() {
  if (!editor || !currentModelPath) return
  pathToViewState.set(currentModelPath, editor.saveViewState())
}

function restoreViewState(filePath) {
  if (!editor || !filePath) return
  const state = pathToViewState.get(filePath)
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
              color: 'rgba(72, 177, 112, 0.95)',
              position: monaco.editor.OverviewRulerLane.Right
            },
            minimap: {
              color: 'rgba(72, 177, 112, 0.8)',
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
      const lineColor = oldCount === 0 ? 'rgba(72, 177, 112, 0.95)' : 'rgba(214, 180, 67, 0.95)'
      const minimapColor = oldCount === 0 ? 'rgba(72, 177, 112, 0.8)' : 'rgba(214, 180, 67, 0.8)'
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
            color: 'rgba(222, 109, 115, 0.95)',
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

function disposeStaleModels () {
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
  let model = pathToModel.get(tab.path) || monaco.editor.getModel(uri)

  if (model) {
    if (typeof tab.content === 'string' && model.getValue() !== tab.content) {
      const existingViewState = currentModelPath === tab.path ? editor.saveViewState() : pathToViewState.get(tab.path) || null
      model.setValue(tab.content)
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
}

function disposeAllModels () {
  pathToViewState.clear()
  for (const model of pathToModel.values()) {
    model.dispose()
  }
  pathToModel.clear()
}

onMounted(async () => {
  if (!editorContainerRef.value) return
  applyWorkspaceEditorTheme()
  editor = monaco.editor.create(editorContainerRef.value, {
    readOnly: true,
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

  layoutObserver = new ResizeObserver(() => {
    editor?.layout()
  })
  layoutObserver.observe(editorContainerRef.value)

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      applyWorkspaceEditorTheme()
      editor?.layout()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
  }

  await nextTick()
  await syncEditorContent()
})

onBeforeUnmount(() => {
  layoutObserver?.disconnect()
  layoutObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  disposeAllModels()
  if (editor) {
    clearGitDiffDecorations()
    editor.dispose()
    editor = null
  }
})

watch(
  () => [props.activeTab?.path || '', props.activeTab?.content || '', props.isActive],
  async () => {
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
    const model = pathToModel.get(props.activeTab.path) || monaco.editor.getModel(uriForPath(props.activeTab.path))
    await loadFileDiffMetadata(props.activeTab.path, model)
  },
  { deep: true }
)

watch(
  () => props.tabs.map((tab) => `${tab.id}:${tab.path}:${tab.kind}`).join('|'),
  () => {
    disposeStaleModels()
  }
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

.editor-change-nav {
  position: absolute;
  top: 10px;
  right: 112px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 124px);
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-bg-project) 90%, black 10%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.editor-change-nav__btn {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.86);
  font-size: 12px;
  cursor: pointer;
}

.editor-change-nav__btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.editor-change-nav__meta {
  min-width: 34px;
  text-align: center;
  color: rgba(255, 255, 255, 0.52);
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
  background: rgba(72, 177, 112, 0.16);
}

.monaco-container :deep(.workspace-diff-line--modified) {
  background: rgba(214, 180, 67, 0.14);
}

.monaco-container :deep(.workspace-diff-gutter) {
  width: 4px !important;
  margin-left: 6px;
  border-radius: 999px;
}

.monaco-container :deep(.workspace-diff-gutter--added) {
  background: #48b170;
}

.monaco-container :deep(.workspace-diff-gutter--modified) {
  background: #d6b443;
}

.monaco-container :deep(.workspace-diff-gutter--deleted) {
  background: #de6d73;
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
  background: rgba(222, 109, 115, 0.18);
  color: #ffb1b4;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
</style>
