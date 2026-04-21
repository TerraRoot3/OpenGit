<template>
  <div class="ai-sessions-section">
    <div class="ai-sessions-content">
      <div class="provider-panel">
        <div class="provider-header">
          <div class="header-left">
            <span>AI 提供方</span>
          </div>
          <span class="panel-count">({{ providerSections.length }})</span>
        </div>

        <div class="provider-list">
          <button
            v-for="provider in providerSections"
            :key="provider.key"
            :class="['provider-item', { active: selectedProvider === provider.key }]"
            @click="selectProvider(provider.key)"
          >
            <div class="provider-item-main">
              <span class="provider-name">{{ provider.label }}</span>
              <span class="provider-count">{{ provider.sessions.length }}</span>
            </div>
            <div class="provider-subtitle">{{ provider.subtitle }}</div>
          </button>
        </div>
      </div>

      <div class="session-panel">
        <div class="session-header">
          <div class="header-left">
            <span>{{ selectedProviderLabel }} 会话</span>
            <span class="panel-count">({{ selectedProviderSessions.length }})</span>
          </div>
          <button class="refresh-btn" :disabled="loading" @click="loadSessions">
            {{ loading ? '刷新中...' : '刷新' }}
          </button>
        </div>

        <div class="session-list">
          <div v-if="errorMessage" class="session-tip error">{{ errorMessage }}</div>
          <div v-else-if="selectedProviderSessions.length === 0" class="session-tip">
            当前项目下暂无 {{ selectedProviderLabel }} 会话
          </div>

          <div
            v-for="session in selectedProviderSessions"
            :key="session.sessionId"
            :class="['session-item', { active: selectedSessionId === session.sessionId }]"
            @click="openSummaryDialog(session)"
            role="button"
            tabindex="0"
            @keydown.enter="openSummaryDialog(session)"
            @keydown.space.prevent="openSummaryDialog(session)"
          >
            <div class="session-row top">
              <div class="session-title">{{ getSessionTitle(session) }}</div>
              <div class="session-time">{{ formatTime(session.updatedAt) }}</div>
            </div>

            <div :class="['session-summary', { empty: !hasSessionSummary(session) }]">
              {{ getSessionSummary(session) }}
            </div>

            <div class="session-row bottom">
              <div v-if="shouldShowSessionPath(session)" class="session-path">
                {{ formatPath(session.cwd) }}
              </div>
              <div v-else class="session-meta-spacer"></div>
              <div class="session-actions">
                <button class="resume-btn" @click.stop="resumeSession(session)">恢复</button>
                <button class="delete-btn-inline" @click.stop="promptDeleteSession(session)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="summaryDialogSession" class="dialog-overlay" @click="closeSummaryDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header-simple">
          <h3>{{ getSessionTitle(summaryDialogSession) }}</h3>
        </div>

        <div class="dialog-body">
          <div class="summary-meta-row">
            <span class="summary-meta-label">提供方</span>
            <span class="summary-meta-value">{{ getProviderLabel(summaryDialogSession.provider) }}</span>
          </div>
          <div class="summary-meta-row">
            <span class="summary-meta-label">时间</span>
            <span class="summary-meta-value">{{ formatTime(summaryDialogSession.updatedAt) }}</span>
          </div>
          <div class="summary-meta-row">
            <span class="summary-meta-label">目录</span>
            <span class="summary-meta-value">{{ formatPath(summaryDialogSession.cwd) }}</span>
          </div>
          <div class="summary-meta-row">
            <span class="summary-meta-label">会话 ID</span>
            <span class="summary-meta-value summary-id">{{ summaryDialogSession.sessionId }}</span>
          </div>

          <div class="summary-block transcript-block">
            <div class="summary-block-title">对话记录</div>
            <div v-if="detailLoading" class="summary-block-placeholder">正在读取会话记录...</div>
            <div v-else-if="detailError" class="summary-block-placeholder error">{{ detailError }}</div>
            <div v-else-if="displayDialogMessages.length === 0" class="summary-block-placeholder">
              暂无可展示的对话记录
            </div>
            <div v-else class="transcript-list">
              <div
                v-for="(message, index) in displayDialogMessages"
                :key="`${message.timestamp || 'message'}-${index}`"
                :class="['transcript-item', message.role]"
              >
                <div class="transcript-item-header">
                  <span class="transcript-role">{{ message.role === 'user' ? '用户' : '助手' }}</span>
                  <span v-if="message.timestamp" class="transcript-time">{{ formatTime(message.timestamp) }}</span>
                </div>
                <div class="transcript-text">{{ message.text }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="cancel-btn-large" @click="closeSummaryDialog">关闭</button>
          <button class="confirm-btn-large" @click="resumeFromDialog">恢复会话</button>
          <button class="delete-btn-large" :disabled="deleteLoading" @click="promptDeleteSession()">
            {{ deleteLoading ? '删除中...' : '删除会话' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showDeleteConfirm && deleteTargetSession" class="dialog-overlay" @click="closeDeleteConfirm">
      <div class="dialog-content delete-dialog" @click.stop>
        <div class="dialog-header-simple">
          <h3>删除会话</h3>
        </div>
        <div class="dialog-body">
          <p>确定要删除会话 “<strong>{{ getSessionTitle(deleteTargetSession) }}</strong>” 吗？</p>
          <div class="delete-session-summary">
            {{ getSessionSummary(deleteTargetSession) }}
          </div>
          <p class="warning-text">此操作会删除本地会话记录文件，删除后无法恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn-large" :disabled="deleteLoading" @click="closeDeleteConfirm">取消</button>
          <button class="delete-btn-large" :disabled="deleteLoading" @click="confirmDeleteSession">
            {{ deleteLoading ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { sortMessagesNewestFirst } from './projectAiSessionMessages.mjs'

const props = defineProps({
  projectPath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['resume-session'])

const loading = ref(false)
const errorMessage = ref('')
const selectedProvider = ref('codex')
const selectedSessionId = ref('')
const summaryDialogSession = ref(null)
const deleteTargetSession = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)
const dialogMessages = ref([])
const sessions = ref({
  claude: [],
  codex: []
})
let silentReloadTimer = null
let silentReloadAttempts = 0

const clearSilentReload = () => {
  if (silentReloadTimer == null || typeof window === 'undefined') return
  window.clearTimeout(silentReloadTimer)
  silentReloadTimer = null
}

const scheduleSilentReload = (delay = 450) => {
  if (typeof window === 'undefined') return
  clearSilentReload()
  silentReloadTimer = window.setTimeout(() => {
    silentReloadTimer = null
    loadSessions({ silent: true })
  }, delay)
}

const normalizePath = (input) => {
  if (!input || typeof input !== 'string') return ''
  return input.replace(/[\\/]+$/, '')
}

const providerSections = computed(() => ([
  {
    key: 'codex',
    label: 'Codex',
    subtitle: 'Codex CLI 历史会话',
    sessions: sessions.value.codex || []
  },
  {
    key: 'claude',
    label: 'Claude Code',
    subtitle: 'Claude CLI 历史会话',
    sessions: sessions.value.claude || []
  }
]))

const selectedProviderSessions = computed(() => {
  const provider = providerSections.value.find((item) => item.key === selectedProvider.value)
  return provider?.sessions || []
})

const displayDialogMessages = computed(() => sortMessagesNewestFirst(dialogMessages.value))

const selectedProviderLabel = computed(() => {
  const provider = providerSections.value.find((item) => item.key === selectedProvider.value)
  return provider?.label || 'AI'
})

const getProviderLabel = (providerKey) => {
  const provider = providerSections.value.find((item) => item.key === providerKey)
  return provider?.label || 'AI'
}

const getSessionTitle = (session) => {
  const title = typeof session?.title === 'string' ? session.title.trim() : ''
  return title || '未命名会话'
}

const getSessionSummary = (session) => {
  const summary = typeof session?.summary === 'string' ? session.summary.trim() : ''
  return summary || '暂无摘要内容'
}

const hasSessionSummary = (session) => {
  return typeof session?.summary === 'string' && session.summary.trim().length > 0
}

const getResumeCommand = (session) => {
  if (!session?.sessionId) return ''
  return session.provider === 'claude'
    ? `claude --resume ${session.sessionId}`
    : `codex resume ${session.sessionId}`
}

const formatPath = (sessionPath) => {
  const normalizedProjectPath = normalizePath(props.projectPath)
  const normalizedSessionPath = normalizePath(sessionPath)
  if (!normalizedProjectPath || !normalizedSessionPath) return '未知目录'
  if (normalizedSessionPath === normalizedProjectPath) return '项目根目录'
  if (normalizedSessionPath.startsWith(`${normalizedProjectPath}/`)) {
    return normalizedSessionPath.slice(normalizedProjectPath.length + 1)
  }
  return normalizedSessionPath
}

const shouldShowSessionPath = (session) => {
  const label = formatPath(session?.cwd)
  return label && label !== '项目根目录' && label !== '未知目录'
}

const formatTime = (value) => {
  if (!value) return '未知时间'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

const syncSelectedProvider = () => {
  const hasSelected = providerSections.value.some((provider) => provider.key === selectedProvider.value)
  if (!hasSelected) {
    selectedProvider.value = providerSections.value[0]?.key || 'codex'
    return
  }

  const current = providerSections.value.find((provider) => provider.key === selectedProvider.value)
  if (current?.sessions?.length) return

  const firstWithSessions = providerSections.value.find((provider) => provider.sessions.length > 0)
  if (firstWithSessions) {
    selectedProvider.value = firstWithSessions.key
  }
}

const syncSelectedSession = () => {
  const hasSelected = selectedProviderSessions.value.some((session) => session.sessionId === selectedSessionId.value)
  if (hasSelected) return
  selectedSessionId.value = selectedProviderSessions.value[0]?.sessionId || ''
}

const loadSessions = async ({ silent = false } = {}) => {
  if (!props.projectPath || !window.electronAPI?.getProjectAiSessions) {
    sessions.value = { claude: [], codex: [] }
    clearSilentReload()
    silentReloadAttempts = 0
    return
  }

  if (!silent) {
    loading.value = true
    errorMessage.value = ''
  }

  try {
    const result = await window.electronAPI.getProjectAiSessions({ projectPath: props.projectPath })
    if (!result?.success) {
      if (!silent) {
        errorMessage.value = result?.error || '读取会话失败'
        sessions.value = { claude: [], codex: [] }
        selectedSessionId.value = ''
      }
      clearSilentReload()
      silentReloadAttempts = 0
      return
    }

    sessions.value = {
      claude: result.data?.sessions?.claude || [],
      codex: result.data?.sessions?.codex || []
    }
    syncSelectedProvider()
    syncSelectedSession()
    errorMessage.value = ''

    if (result.data?.hasPendingSummaryRefresh) {
      silentReloadAttempts += 1
      scheduleSilentReload(Math.min(350 + (silentReloadAttempts * 150), 1500))
    } else {
      clearSilentReload()
      silentReloadAttempts = 0
    }
  } catch (error) {
    if (!silent) {
      errorMessage.value = error?.message || '读取会话失败'
      sessions.value = { claude: [], codex: [] }
      selectedSessionId.value = ''
    }
    clearSilentReload()
    silentReloadAttempts = 0
  } finally {
    if (!silent) {
      loading.value = false
    }
  }
}

const selectProvider = (provider) => {
  selectedProvider.value = provider
  syncSelectedSession()
}

const openSummaryDialog = (session) => {
  detailLoading.value = true
  detailError.value = ''
  dialogMessages.value = []
  selectedSessionId.value = session.sessionId
  summaryDialogSession.value = session
  loadSessionDetail(session)
}

const closeSummaryDialog = () => {
  summaryDialogSession.value = null
  detailLoading.value = false
  detailError.value = ''
  dialogMessages.value = []
}

const resumeSession = (session) => {
  selectedSessionId.value = session.sessionId
  emit('resume-session', {
    ...session,
    command: getResumeCommand(session)
  })
}

const resumeFromDialog = () => {
  const session = summaryDialogSession.value
  if (!session) return
  closeSummaryDialog()
  resumeSession(session)
}

const promptDeleteSession = (session = summaryDialogSession.value) => {
  if (!session || deleteLoading.value) return
  deleteTargetSession.value = session
  showDeleteConfirm.value = true
}

const resetDeleteConfirmState = () => {
  showDeleteConfirm.value = false
  deleteTargetSession.value = null
}

const closeDeleteConfirm = () => {
  if (deleteLoading.value) return
  resetDeleteConfirmState()
}

const confirmDeleteSession = async () => {
  const session = deleteTargetSession.value
  if (!session?.sourcePath || !window.electronAPI?.deleteProjectAiSession || deleteLoading.value) return

  deleteLoading.value = true

  try {
    const result = await window.electronAPI.deleteProjectAiSession({
      provider: session.provider,
      sourcePath: session.sourcePath
    })

    if (!result?.success) {
      detailError.value = result?.error || '删除会话失败'
      return
    }

    await loadSessions()

    if (summaryDialogSession.value?.sessionId === session.sessionId) {
      closeSummaryDialog()
    }

    resetDeleteConfirmState()
  } catch (error) {
    detailError.value = error?.message || '删除会话失败'
  } finally {
    deleteLoading.value = false
  }
}

const loadSessionDetail = async (session) => {
  if (!window.electronAPI?.getProjectAiSessionDetail || !session?.sourcePath) {
    detailLoading.value = false
    detailError.value = '当前环境不支持读取会话详情'
    return
  }

  try {
    const result = await window.electronAPI.getProjectAiSessionDetail({
      provider: session.provider,
      sourcePath: session.sourcePath,
      projectPath: props.projectPath
    })

    if (summaryDialogSession.value?.sessionId !== session.sessionId) return

    if (!result?.success) {
      detailError.value = result?.error || '读取会话记录失败'
      dialogMessages.value = []
      return
    }

    detailError.value = ''
    dialogMessages.value = Array.isArray(result.data?.messages) ? result.data.messages : []
  } catch (error) {
    if (summaryDialogSession.value?.sessionId !== session.sessionId) return
    detailError.value = error?.message || '读取会话记录失败'
    dialogMessages.value = []
  } finally {
    if (summaryDialogSession.value?.sessionId === session.sessionId) {
      detailLoading.value = false
    }
  }
}

watch(() => props.projectPath, () => {
  clearSilentReload()
  silentReloadAttempts = 0
  closeSummaryDialog()
  loadSessions()
}, { immediate: true })

onUnmounted(() => {
  clearSilentReload()
})
</script>

<style scoped>
.ai-sessions-section {
  flex: 1;
  background: var(--theme-sem-bg-project);
  border: none;
  border-radius: var(--theme-comp-radius-selected);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-sessions-content {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--theme-sem-bg-project);
}

.provider-panel {
  width: 260px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--theme-sem-bg-project);
}

.provider-header,
.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--theme-comp-child-header-bg);
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  font-weight: 500;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-count {
  font-size: 12px;
  color: var(--theme-sem-text-muted);
  font-weight: normal;
}

.provider-list,
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.provider-list {
  padding: 0 0 8px;
}

.provider-item,
.session-item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 10px;
  margin-bottom: 4px;
}

.provider-list > :first-child,
.session-list > :first-child {
  margin-top: 0 !important;
}

.provider-item:hover,
.session-item:hover {
  background: var(--theme-sem-hover);
}

.provider-item.active {
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.session-item.active {
  background: var(--theme-comp-sidebar-item-active-bg);
  box-shadow: inset 0 0 0 1px var(--theme-comp-sidebar-item-active-border);
}

.provider-item-main,
.session-row,
.session-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.provider-name,
.session-title {
  font-size: 12px;
  color: var(--theme-sem-text-primary);
  font-weight: 500;
  line-height: 1.4;
}

.provider-subtitle {
  margin-top: 4px;
  font-size: 11px;
  color: var(--theme-sem-text-muted);
}

.provider-count {
  flex-shrink: 0;
  min-width: 22px;
  padding: 1px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-hover) 82%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
  text-align: center;
}

.session-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
  background: var(--theme-sem-bg-project);
}

.session-tip {
  padding: 16px;
  text-align: center;
  color: var(--theme-sem-text-muted);
  font-size: 12px;
}

.session-tip.error {
  color: #ff9aa5;
}

.session-time,
.session-path,
.session-summary {
  font-size: 11px;
  color: var(--theme-sem-text-muted);
}

.session-time {
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  min-width: 0;
}

.session-summary {
  margin-top: 4px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-summary.empty {
  color: var(--theme-sem-text-muted);
}

.session-row.bottom,
.session-footer {
  margin-top: 8px;
}

.session-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta-spacer {
  flex: 1;
  min-width: 0;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resume-btn,
.refresh-btn,
.delete-btn-inline {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-hover) 76%, transparent);
  color: var(--theme-sem-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.resume-btn:hover,
.refresh-btn:hover:not(:disabled),
.delete-btn-inline:hover {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.delete-btn-inline {
  color: var(--theme-sem-text-secondary);
  border-color: var(--theme-sem-border-default);
  background: color-mix(in srgb, var(--theme-sem-hover) 76%, transparent);
}

.delete-btn-inline:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 92%, transparent);
  color: var(--theme-sem-text-primary);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--theme-sem-bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--theme-sem-bg-dialog);
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 14px;
  min-width: 420px;
  max-width: 720px;
  width: min(720px, calc(100vw - 32px));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog-header-simple {
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.dialog-header-simple h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-sem-text-primary);
}

.dialog-body {
  padding: 20px;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-body p {
  margin: 0;
  color: var(--theme-sem-text-primary);
  line-height: 1.5;
}

.summary-meta-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.summary-meta-label {
  width: 56px;
  flex-shrink: 0;
  color: var(--theme-sem-text-muted);
  font-size: 12px;
}

.summary-meta-value {
  color: var(--theme-sem-text-primary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.summary-id {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: var(--theme-sem-text-secondary);
}

.summary-block {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  overflow: hidden;
  margin-top: 4px;
  background: color-mix(in srgb, var(--theme-sem-hover) 32%, transparent);
}

.summary-block-title {
  padding: 8px 12px;
  background: color-mix(in srgb, var(--theme-sem-hover) 38%, transparent);
  border-bottom: 1px solid var(--theme-sem-border-default);
  font-size: 12px;
  color: var(--theme-sem-text-secondary);
  font-weight: 500;
}

.summary-block-content {
  padding: 12px;
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}

.transcript-block {
  display: flex;
  flex-direction: column;
}

.summary-block-placeholder {
  padding: 16px 12px;
  color: var(--theme-sem-text-muted);
  font-size: 13px;
}

.summary-block-placeholder.error {
  color: #ff9aa5;
}

.transcript-list {
  max-height: 360px;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transcript-item {
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--theme-sem-hover) 42%, transparent);
}

.transcript-item.user {
  border-color: var(--theme-sem-border-strong);
  background: color-mix(in srgb, var(--theme-sem-hover) 72%, transparent);
}

.transcript-item.assistant {
  border-color: var(--theme-sem-border-strong);
}

.transcript-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.transcript-role,
.transcript-time {
  font-size: 11px;
}

.transcript-role {
  color: var(--theme-sem-text-secondary);
  font-weight: 600;
}

.transcript-time {
  color: var(--theme-sem-text-muted);
  flex-shrink: 0;
}

.transcript-text {
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--theme-sem-border-default);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: transparent;
  border-radius: 0 0 14px 14px;
}

.cancel-btn-large,
.confirm-btn-large,
.delete-btn-large {
  padding: 8px 16px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.cancel-btn-large {
  background: color-mix(in srgb, var(--theme-sem-hover) 76%, transparent);
  color: var(--theme-sem-text-secondary);
}

.cancel-btn-large:hover {
  background: var(--theme-sem-hover);
}

.confirm-btn-large {
  background: color-mix(in srgb, var(--theme-sem-hover) 96%, transparent);
  color: var(--theme-sem-text-primary);
}

.confirm-btn-large:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 96%, transparent);
}

.delete-btn-large {
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.delete-btn-large:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-sem-hover) 96%, transparent);
}

.delete-btn-large:disabled,
.confirm-btn-large:disabled,
.cancel-btn-large:disabled {
  opacity: 0.65;
  cursor: default;
}

.delete-dialog {
  max-width: 520px;
}

.delete-session-summary {
  color: var(--theme-sem-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-hover) 48%, transparent);
  border: 1px solid var(--theme-sem-border-default);
}

.warning-text {
  color: var(--theme-sem-accent-warning) !important;
  background: var(--theme-sem-warning-bg);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--theme-sem-warning-border);
  font-size: 13px;
}

.provider-list::-webkit-scrollbar,
.session-list::-webkit-scrollbar,
.summary-block-content::-webkit-scrollbar {
  width: 6px;
}

.provider-list::-webkit-scrollbar-track,
.session-list::-webkit-scrollbar-track,
.summary-block-content::-webkit-scrollbar-track {
  background: transparent;
}

.provider-list::-webkit-scrollbar-thumb,
.session-list::-webkit-scrollbar-thumb,
.summary-block-content::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-sem-hover) 100%, transparent);
  border-radius: 3px;
}

@media (max-width: 960px) {
  .ai-sessions-content {
    flex-direction: column;
  }

  .provider-panel {
    width: 100%;
    min-width: 0;
    max-height: 220px;
    border-right: none;
    border-bottom: 1px solid var(--theme-sem-border-default);
  }

  .session-row,
  .session-footer,
  .summary-meta-row,
  .session-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
