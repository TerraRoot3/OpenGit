<template>
  <div class="codex-main-session">
    <div class="codex-page-body">
      <aside class="session-sidebar">
        <div class="codex-brand">
          <span class="codex-brand-mark">
            <Bot :size="20" aria-hidden="true" />
          </span>
          <span>
            <strong>Codex</strong>
            <small>{{ accountLabel }}</small>
          </span>
        </div>

        <button class="new-session-action" type="button" @click="createNewSession">
          <Plus :size="16" aria-hidden="true" />
          <span>新建会话</span>
        </button>

        <div class="session-list-heading">
          <span>最近会话</span>
          <span>{{ state.sessions.length }}</span>
        </div>

        <div class="session-list">
          <div
            v-for="session in state.sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === state.activeSessionId }"
          >
            <button
              class="session-select-action"
              type="button"
              @click="switchSession(session.id)"
            >
              <span class="session-item-icon" :class="{ feishu: session.source === 'feishu' }">
                <Link2 v-if="session.source === 'feishu'" :size="14" aria-hidden="true" />
                <MessageSquare v-else :size="14" aria-hidden="true" />
              </span>
              <span class="session-item-copy">
                <span class="session-item-title">
                  <strong :title="session.title">{{ session.title }}</strong>
                  <Loader2
                    v-if="session.turnStatus === 'running'"
                    :size="12"
                    class="spinning"
                    aria-hidden="true"
                  />
                  <span v-else-if="session.queueLength > 0" class="session-queue-badge">
                    {{ session.queueLength }}
                  </span>
                </span>
                <small :title="session.lastMessage || session.chatId">
                  {{ session.lastMessage || sessionMetaLabel(session) }}
                </small>
              </span>
              <time>{{ formatSessionTime(session.updatedAt) }}</time>
            </button>
            <button
              class="session-delete-action"
              type="button"
              :aria-label="session.id === 'main' ? '清空主会话' : `删除会话 ${session.title}`"
              :title="session.turnStatus === 'running' || session.queueLength > 0
                ? '会话有任务执行中，暂时不能删除'
                : (session.id === 'main' ? '清空主会话' : '删除会话')"
              :disabled="
                deletingSessionId === session.id
                || session.turnStatus === 'running'
                || session.queueLength > 0
              "
              @click="deleteSession(session)"
            >
              <Loader2
                v-if="deletingSessionId === session.id"
                :size="13"
                class="spinning"
                aria-hidden="true"
              />
              <Trash2 v-else :size="13" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="session-sidebar-footer">
          <div class="account-summary" :class="{ disconnected: !state.account }">
            <span class="account-avatar">
              <UserRound :size="15" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ state.account ? accountLabel : 'Codex 未登录' }}</strong>
              <small>{{ state.account?.email || '请先完成 codex login' }}</small>
            </span>
          </div>
          <button
            class="sidebar-settings-action"
            type="button"
            :aria-expanded="showSettings"
            aria-label="打开 Codex 设置"
            @click="showSettings = true"
          >
            <Settings2 :size="16" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main class="conversation-panel">
        <header class="conversation-header">
          <div class="conversation-title">
            <span class="conversation-source-icon" :class="{ feishu: activeSession?.source === 'feishu' }">
              <Link2 v-if="activeSession?.source === 'feishu'" :size="16" aria-hidden="true" />
              <MessageSquare v-else :size="16" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ activeSession?.title || '主会话' }}</strong>
              <small>{{ activeSessionSubtitle }}</small>
            </span>
          </div>

          <div class="conversation-actions">
            <span class="status-chip" :class="serverStatusClass">
              <i aria-hidden="true"></i>
              {{ serverStatusLabel }}
            </span>
            <button
              class="icon-action"
              type="button"
              aria-label="刷新 Codex 账户"
              :disabled="isRefreshingAccount"
              @click="refreshAccount"
            >
              <RefreshCw
                :size="16"
                :class="{ spinning: isRefreshingAccount }"
                aria-hidden="true"
              />
            </button>
            <button
              class="icon-action"
              type="button"
              aria-label="重启 Codex Server"
              :disabled="isAnyBusy || isRestarting"
              @click="restartServer"
            >
              <Power :size="16" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div v-if="pageError" class="page-alert error" role="alert">
          <AlertCircle :size="16" aria-hidden="true" />
          <span>{{ pageError }}</span>
          <button type="button" @click="pageError = ''">关闭</button>
        </div>

        <div
          v-if="!state.account && state.serverStatus === 'ready'"
          class="page-alert warning"
          role="status"
        >
          <AlertCircle :size="16" aria-hidden="true" />
          <span>尚未读取到 Codex 登录账户，请先在系统终端完成 <code>codex login</code>。</span>
        </div>

        <div
          ref="messageScroller"
          class="message-scroller"
          @scroll="updateStickiness"
        >
          <div v-if="isLoadingHistory" class="conversation-loading">
            <Loader2 :size="20" class="spinning" aria-hidden="true" />
            <span>正在恢复会话…</span>
          </div>

          <div v-else-if="messages.length === 0" class="conversation-empty">
            <span class="conversation-empty-icon">
              <Bot :size="28" aria-hidden="true" />
            </span>
            <strong>准备好开始工作</strong>
            <p>{{ emptyDescription }}</p>
            <span class="empty-directory" :title="state.workingDirectory">
              <FolderOpen :size="13" aria-hidden="true" />
              {{ state.workingDirectory || '用户目录' }}
            </span>
          </div>

          <div v-else class="message-list">
            <article
              v-for="message in messages"
              :key="message.id"
              class="message-row"
              :class="[message.role, message.status]"
            >
              <div class="message-avatar">
                <UserRound v-if="message.role === 'user'" :size="15" aria-hidden="true" />
                <Bot v-else :size="15" aria-hidden="true" />
              </div>
              <div class="message-content">
                <div class="message-meta">
                  <strong>{{ message.role === 'user' ? '你' : 'Codex' }}</strong>
                  <span v-if="message.source === 'feishu'" class="source-badge">飞书</span>
                  <span>{{ formatTime(message.createdAt) }}</span>
                </div>
                <div class="message-text">{{ displayMessageText(message) }}</div>
                <div v-if="message.status === 'streaming'" class="typing-indicator">
                  <i></i><i></i><i></i>
                </div>
              </div>
            </article>
          </div>
        </div>

        <footer class="composer-wrap">
          <div v-if="isBusy || state.queueLength > 0" class="queue-status">
            <Loader2 v-if="isBusy" :size="14" class="spinning" aria-hidden="true" />
            <span v-if="isBusy">Codex 正在执行</span>
            <span v-if="state.queueLength > 0">队列中 {{ state.queueLength }} 个任务</span>
            <button
              v-if="isBusy"
              type="button"
              @click="interruptTurn"
            >
              <Square :size="11" fill="currentColor" aria-hidden="true" />
              中断
            </button>
          </div>

          <div class="composer" :class="{ busy: isBusy }">
            <textarea
              ref="composerInput"
              v-model="draft"
              name="codex-instruction"
              rows="1"
              autocomplete="off"
              placeholder="给 Codex 下达任务…"
              :disabled="state.serverStatus === 'starting'"
              aria-label="Codex 任务内容"
              @keydown.enter.exact.prevent="sendMessage"
              @input="resizeComposer"
            ></textarea>
            <button
              class="send-action"
              type="button"
              aria-label="发送任务"
              :disabled="!draft.trim() || isSending"
              @click="sendMessage"
            >
              <Send :size="17" aria-hidden="true" />
            </button>
          </div>
          <div class="composer-footer">
            <span :title="state.workingDirectory">
              <FolderOpen :size="11" aria-hidden="true" />
              {{ state.workingDirectory || '用户目录' }}
            </span>
            <span>Enter 发送 · Shift + Enter 换行</span>
          </div>
        </footer>
      </main>

      <button
        v-if="showSettings"
        class="settings-backdrop"
        type="button"
        aria-label="关闭 Codex 设置"
        @click="showSettings = false"
      ></button>

      <aside
        v-if="showSettings"
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="codex-settings-title"
      >
        <div class="settings-heading">
          <div>
            <strong id="codex-settings-title">Codex 设置</strong>
            <span>配置保存在本机，保存后立即应用。</span>
          </div>
          <button
            class="icon-action"
            type="button"
            aria-label="关闭 Codex 设置"
            @click="showSettings = false"
          >
            <X :size="16" aria-hidden="true" />
          </button>
        </div>

        <div class="settings-scroll">
          <section class="settings-section">
            <div class="section-title">
              <span class="section-title-icon">
                <Bot :size="15" aria-hidden="true" />
              </span>
              <span>
                <strong>运行环境</strong>
                <small>复用本机 Codex 登录与订阅</small>
              </span>
            </div>

            <label class="field-label">
              <span>工作目录</span>
              <div class="path-field">
                <input
                  v-model="form.workingDirectory"
                  name="codex-working-directory"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="留空时使用用户目录…"
                />
                <button
                  type="button"
                  aria-label="选择 Codex 工作目录"
                  @click="chooseWorkingDirectory"
                >
                  <FolderOpen :size="15" aria-hidden="true" />
                </button>
              </div>
            </label>

            <div class="field-grid">
              <label class="field-label">
                <span>沙箱权限</span>
                <select v-model="form.sandboxMode" name="codex-sandbox-mode">
                  <option value="danger-full-access">完整访问</option>
                  <option value="workspace-write">仅工作区写入</option>
                  <option value="read-only">只读</option>
                </select>
              </label>
              <label class="field-label">
                <span>确认策略</span>
                <select v-model="form.approvalPolicy" name="codex-approval-policy">
                  <option value="never">不询问</option>
                  <option value="on-request">需要时询问</option>
                  <option value="untrusted">不可信命令询问</option>
                </select>
              </label>
            </div>

            <label class="field-label">
              <span>推理强度</span>
              <select v-model="form.reasoningEffort" name="codex-reasoning-effort">
                <option value="">沿用 Codex 默认设置</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="xhigh">超高</option>
              </select>
            </label>

            <div class="account-card" :class="{ disconnected: !state.account }">
              <div>
                <span>当前账户</span>
                <strong>{{ accountDetail }}</strong>
              </div>
              <CheckCircle2 v-if="state.account" :size="18" aria-hidden="true" />
              <AlertCircle v-else :size="18" aria-hidden="true" />
            </div>
          </section>

          <section class="settings-section">
            <div class="section-title with-action">
              <span class="section-title-icon feishu">
                <Link2 :size="15" aria-hidden="true" />
              </span>
              <span>
                <strong>飞书机器人</strong>
                <small>管理多个独立长连接</small>
              </span>
              <button type="button" @click="addFeishuConnection">
                <Plus :size="13" aria-hidden="true" />
                添加机器人
              </button>
            </div>

            <div class="auto-monitor-card">
              <label class="connection-toggle">
                <span>
                  <strong>自动监控</strong>
                  <small>锁屏后自动开始，解锁或亮屏恢复后暂停</small>
                </span>
                <input
                  v-model="form.feishu.autoMonitor.enabled"
                  name="feishu-auto-monitor-enabled"
                  type="checkbox"
                />
              </label>

              <template v-if="form.feishu.autoMonitor.enabled">
                <label class="field-label">
                  <span>通知单聊</span>
                  <select
                    v-model="form.feishu.autoMonitor.targetSessionId"
                    name="feishu-auto-monitor-target"
                  >
                    <option value="">仅在唯一 P2P 单聊绑定时自动选择</option>
                    <option
                      v-for="session in p2pMonitorSessions"
                      :key="session.id"
                      :value="session.id"
                    >
                      {{ monitorSessionLabel(session) }}
                    </option>
                  </select>
                </label>

                <label class="field-label">
                  <span>停滞提醒（分钟）</span>
                  <input
                    v-model.number="form.feishu.autoMonitor.stallMinutes"
                    name="feishu-auto-monitor-stall"
                    type="number"
                    min="5"
                    max="1440"
                    step="5"
                  />
                </label>
              </template>

              <p
                class="auto-monitor-status"
                :class="state.feishu.autoMonitor?.status || 'disabled'"
                aria-live="polite"
              >
                {{ autoMonitorStatusReason }}
              </p>
            </div>

            <p v-if="form.feishu.connections.length === 0" class="connection-empty">
              还没有飞书配置。添加后，每个机器人会保持自己的长连接。
            </p>

            <article
              v-for="(connection, index) in form.feishu.connections"
              :key="connection.id"
              class="feishu-connection-card"
            >
              <div class="connection-card-heading">
                <button
                  class="connection-expand-action"
                  type="button"
                  :aria-expanded="expandedFeishuConnectionId === connection.id"
                  @click="toggleFeishuConnection(connection.id)"
                >
                  <span class="connection-index">{{ index + 1 }}</span>
                  <span>
                    <strong>{{ connection.name || `飞书 ${index + 1}` }}</strong>
                    <small>{{ feishuStatusLabel(connection) }}</small>
                  </span>
                  <ChevronDown
                    :size="15"
                    :class="{ expanded: expandedFeishuConnectionId === connection.id }"
                    aria-hidden="true"
                  />
                </button>
                <button
                  class="icon-action danger"
                  type="button"
                  :aria-label="`删除 ${connection.name || `飞书 ${index + 1}`}`"
                  @click="removeFeishuConnection(connection.id)"
                >
                  <Trash2 :size="14" aria-hidden="true" />
                </button>
              </div>

              <div
                v-if="expandedFeishuConnectionId === connection.id"
                class="connection-fields"
              >
                <label class="connection-toggle">
                  <span>
                    <strong>启用长连接</strong>
                    <small>保存后自动连接并保持在线</small>
                  </span>
                  <input
                    v-model="connection.enabled"
                    :name="`feishu-enabled-${connection.id}`"
                    type="checkbox"
                  />
                </label>

                <label class="field-label">
                  <span>别名</span>
                  <input
                    v-model="connection.name"
                    :name="`feishu-name-${connection.id}`"
                    type="text"
                    autocomplete="off"
                    placeholder="例如：工作飞书…"
                  />
                </label>

                <label class="field-label">
                  <span>App ID</span>
                  <input
                    v-model="connection.appId"
                    :name="`feishu-app-id-${connection.id}`"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="cli_xxxxxxxxxxxxxxxx…"
                  />
                </label>

                <label class="field-label">
                  <span>App Secret</span>
                  <input
                    v-model="connection.appSecret"
                    :name="`feishu-app-secret-${connection.id}`"
                    type="password"
                    autocomplete="new-password"
                    spellcheck="false"
                    :placeholder="connection.hasAppSecret ? '已配置，留空保持不变…' : '输入 App Secret…'"
                  />
                </label>

                <label class="field-label">
                  <span>允许的会话 ID</span>
                  <textarea
                    v-model="connection.allowedChatIdsText"
                    :name="`feishu-chat-ids-${connection.id}`"
                    rows="2"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="可选，每行一个 chat_id；留空允许全部…"
                  ></textarea>
                </label>

                <label class="field-label">
                  <span>允许的发送者 ID</span>
                  <textarea
                    v-model="connection.allowedSenderIdsText"
                    :name="`feishu-sender-ids-${connection.id}`"
                    rows="2"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="可选，每行一个 open_id / user_id / union_id…"
                  ></textarea>
                </label>
              </div>
            </article>

            <p class="settings-note">
              自动监控默认关闭，只向明确绑定的飞书 P2P 单聊推送关键进展、完成、失败、停滞和待处理状态；不会向群聊发送，也不会猜测目标。群聊中的普通消息默认进入队列；明确 @ 机器人时，仅被点名的机器人响应。
            </p>
          </section>
        </div>

        <div class="settings-footer">
          <span
            v-if="settingsMessage"
            :class="settingsMessageType"
            aria-live="polite"
          >
            {{ settingsMessage }}
          </span>
          <button
            class="primary-action"
            type="button"
            :disabled="isSavingSettings"
            @click="saveSettings"
          >
            <Save :size="15" aria-hidden="true" />
            {{ isSavingSettings ? '保存中…' : '保存设置' }}
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref
} from 'vue'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  CheckCircle2,
  FolderOpen,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Square,
  Trash2,
  UserRound,
  X
} from 'lucide-vue-next'
import { useConfirm } from '../../composables/useConfirm.js'

const { confirm: showConfirm } = useConfirm()
const codexApi = window.electronAPI?.codexMainSession
const messageScroller = ref(null)
const composerInput = ref(null)
const draft = ref('')
const messages = ref([])
const showSettings = ref(false)
const expandedFeishuConnectionId = ref('')
const pageError = ref('')
const settingsMessage = ref('')
const settingsMessageType = ref('success')
const isLoadingHistory = ref(true)
const isSending = ref(false)
const isRestarting = ref(false)
const isRefreshingAccount = ref(false)
const isSavingSettings = ref(false)
const deletingSessionId = ref('')
let shouldStickToBottom = true
let removeEventListener = null
let historyLoadSequence = 0
const messageCache = new Map()
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric'
})

const state = reactive({
  serverStatus: 'stopped',
  serverError: '',
  account: null,
  requiresOpenaiAuth: true,
  sessions: [],
  activeSessionId: '',
  threadId: '',
  turnStatus: 'idle',
  activeTurnId: '',
  queueLength: 0,
  activeTaskCount: 0,
  totalQueueLength: 0,
  workingDirectory: '',
  sandboxMode: 'danger-full-access',
  feishu: {
    enabled: false,
    running: false,
    status: 'disabled',
    error: '',
    connections: [],
    autoMonitor: {
      enabled: false,
      running: false,
      screenState: 'unlocked',
      status: 'disabled',
      reason: '自动监控已关闭。',
      targetSessionId: '',
      eligibleSessionIds: []
    }
  }
})

const form = reactive({
  workingDirectory: '',
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
  reasoningEffort: '',
  feishu: {
    autoMonitor: {
      enabled: false,
      targetSessionId: '',
      stallMinutes: 20
    },
    connections: []
  }
})

const activeSession = computed(() => (
  state.sessions.find((session) => session.id === state.activeSessionId) || null
))
const isBusy = computed(() => state.turnStatus === 'running')
const isAnyBusy = computed(() => (
  state.activeTaskCount > 0 || state.totalQueueLength > 0
))
const p2pMonitorSessions = computed(() => (
  state.sessions.filter((session) => (
    session.source === 'feishu'
    && session.chatType === 'p2p'
    && session.chatId
    && form.feishu.connections.some((connection) => (
      connection.id === session.connectionId
      && connection.enabled
    ))
  ))
))
const autoMonitorStatusReason = computed(() => (
  state.feishu.autoMonitor?.reason
  || '保存设置后会显示自动监控状态。'
))
const monitorSessionLabel = (session = {}) => {
  const connection = form.feishu.connections.find(
    (item) => item.id === session.connectionId
  )
  const suffix = String(session.chatId || '').slice(-8)
  return [
    connection?.name || session.connectionName || '飞书单聊',
    suffix
  ].filter(Boolean).join(' · ')
}
const activeSessionSubtitle = computed(() => {
  const session = activeSession.value
  if (!session) return '持久 Codex 会话'
  if (session.source === 'feishu') {
    const sourceLabel = session.chatType === 'group'
      ? '飞书群聊 · 独立持久上下文'
      : '飞书私聊 · 独立持久上下文'
    return session.connectionName
      ? `${session.connectionName} · ${sourceLabel}`
      : sourceLabel
  }
  return session.id === 'main'
    ? '默认页面会话 · 独立持久上下文'
    : '页面会话 · 独立持久上下文'
})
const emptyDescription = computed(() => (
  activeSession.value?.source === 'feishu'
    ? '这个飞书会话拥有独立上下文。群聊或私聊中的后续指令都会回到这里。'
    : '任务会在当前工作目录执行，并只保留在这个页面会话的上下文中。'
))
const serverStatusClass = computed(() => {
  if (state.serverStatus === 'ready') return 'success'
  if (state.serverStatus === 'starting') return 'pending'
  if (state.serverStatus === 'error') return 'error'
  return 'muted'
})
const serverStatusLabel = computed(() => {
  if (state.serverStatus === 'ready') return 'Server 已连接'
  if (state.serverStatus === 'starting') return 'Server 启动中'
  if (state.serverStatus === 'error') return 'Server 异常'
  return 'Server 已停止'
})
const accountLabel = computed(() => {
  const plan = String(state.account?.planType || '').trim()
  return plan ? `ChatGPT ${plan.toUpperCase()}` : 'Codex 账户'
})
const accountDetail = computed(() => {
  if (!state.account) return '未登录'
  const identity = state.account.email || (
    state.account.type === 'apiKey' ? 'API Key' : 'ChatGPT'
  )
  return `${identity}${state.account.planType ? ` · ${state.account.planType}` : ''}`
})
const feishuStatusLabel = (connection = {}) => {
  if (!connection.enabled) return '未启用'
  const status = (state.feishu?.connections || [])
    .find((item) => item.id === connection.id)
  if (status?.status === 'connected') return '长连接已建立'
  if (status?.status === 'connecting') return '正在连接'
  if (status?.status === 'reconnecting') return '正在重连'
  if (status?.error) return status.error
  return status?.running ? '长连接运行中' : '保存后启动'
}

const applyState = (nextState = {}) => {
  if (!nextState || typeof nextState !== 'object') return
  Object.assign(state, nextState)
  state.sessions = Array.isArray(nextState.sessions)
    ? nextState.sessions
    : (Array.isArray(state.sessions) ? state.sessions : [])
  state.feishu = {
    enabled: false,
    running: false,
    status: 'disabled',
    error: '',
    connections: [],
    autoMonitor: {
      enabled: false,
      running: false,
      screenState: 'unlocked',
      status: 'disabled',
      reason: '自动监控已关闭。',
      targetSessionId: '',
      eligibleSessionIds: []
    },
    ...(nextState.feishu || state.feishu || {})
  }
  if (state.serverError) pageError.value = state.serverError
}

const applyConfig = (config = {}) => {
  form.workingDirectory = String(config.workingDirectory || '')
  form.sandboxMode = config.sandboxMode || 'danger-full-access'
  form.approvalPolicy = config.approvalPolicy || 'never'
  form.reasoningEffort = String(config.reasoningEffort || '')
  form.feishu.autoMonitor.enabled = config.feishu?.autoMonitor?.enabled === true
  form.feishu.autoMonitor.targetSessionId = String(
    config.feishu?.autoMonitor?.targetSessionId || ''
  )
  form.feishu.autoMonitor.stallMinutes = Number(
    config.feishu?.autoMonitor?.stallMinutes
  ) || 20
  form.feishu.connections = (config.feishu?.connections || []).map((connection) => ({
    id: String(connection.id || ''),
    name: String(connection.name || ''),
    enabled: connection.enabled === true,
    appId: String(connection.appId || ''),
    appSecret: '',
    hasAppSecret: connection.hasAppSecret === true,
    allowedChatIdsText: (connection.allowedChatIds || []).join('\n'),
    allowedSenderIdsText: (connection.allowedSenderIds || []).join('\n')
  }))
  if (
    expandedFeishuConnectionId.value
    && !form.feishu.connections.some(
      (connection) => connection.id === expandedFeishuConnectionId.value
    )
  ) {
    expandedFeishuConnectionId.value = ''
  }
}

const sortMessages = (items = []) => {
  items.sort((left, right) => (
    Number(left.createdAt || 0) - Number(right.createdAt || 0)
  ))
  return items
}

const upsertMessage = (message, sessionId = state.activeSessionId) => {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId || !message?.id) return
  const cachedMessages = messageCache.get(normalizedSessionId) || []
  const index = cachedMessages.findIndex((item) => item.id === message.id)
  if (index >= 0) {
    cachedMessages[index] = { ...cachedMessages[index], ...message }
  } else {
    cachedMessages.push(message)
  }
  sortMessages(cachedMessages)
  messageCache.set(normalizedSessionId, cachedMessages)
  if (normalizedSessionId === state.activeSessionId) {
    messages.value = [...cachedMessages]
  }
}

const replaceHistoryMessages = (sessionId, items = []) => {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return
  const historyMessages = Array.isArray(items) ? [...items] : []
  const transientMessages = (messageCache.get(normalizedSessionId) || [])
    .filter((message) => (
      message.status === 'streaming'
      || message.status === 'error'
      || (
        String(message.id || '').startsWith('user:')
        && !historyMessages.some((historyMessage) => (
          historyMessage.role === 'user'
          && String(historyMessage.text || '').trim() === String(message.text || '').trim()
        ))
      )
    ))
  const merged = sortMessages([
    ...historyMessages,
    ...transientMessages.filter((message) => (
      !historyMessages.some((historyMessage) => historyMessage.id === message.id)
    ))
  ])
  messageCache.set(normalizedSessionId, merged)
  if (normalizedSessionId === state.activeSessionId) {
    messages.value = [...merged]
  }
}

const isAtBottom = () => {
  const element = messageScroller.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < 72
}

const updateStickiness = () => {
  shouldStickToBottom = isAtBottom()
}

const scrollToBottom = async (force = false) => {
  await nextTick()
  const element = messageScroller.value
  if (!element || (!force && !shouldStickToBottom)) return
  element.scrollTop = element.scrollHeight
}

const loadHistory = async (sessionId, forceScroll = true) => {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!codexApi || !normalizedSessionId) {
    isLoadingHistory.value = false
    return
  }
  const sequence = ++historyLoadSequence
  isLoadingHistory.value = true
  messages.value = [...(messageCache.get(normalizedSessionId) || [])]
  try {
    const result = await codexApi.getHistory({ sessionId: normalizedSessionId })
    if (sequence !== historyLoadSequence) return
    if (!result?.success) throw new Error(result?.error || '会话历史加载失败')
    replaceHistoryMessages(normalizedSessionId, result.messages)
    pageError.value = ''
  } catch (error) {
    if (sequence === historyLoadSequence) {
      pageError.value = error?.message || '会话历史加载失败'
    }
  } finally {
    if (sequence === historyLoadSequence) {
      isLoadingHistory.value = false
      shouldStickToBottom = true
      if (forceScroll) void scrollToBottom(true)
    }
  }
}

const handleSessionEvent = (event = {}) => {
  if (event.type === 'state') {
    applyState(event.state)
    return
  }
  if (event.type === 'history-reset') {
    const sessionId = String(event.sessionId || state.activeSessionId || '').trim()
    if (sessionId) messageCache.set(sessionId, [])
    if (sessionId === state.activeSessionId) {
      messages.value = []
      void scrollToBottom(true)
    }
    return
  }
  if (event.type === 'message' && event.message) {
    const sessionId = String(event.sessionId || state.activeSessionId || '').trim()
    const isActiveSession = sessionId === state.activeSessionId
    if (isActiveSession) shouldStickToBottom = isAtBottom()
    upsertMessage(event.message, sessionId)
    if (isActiveSession) void scrollToBottom()
  }
}

const loadSession = async () => {
  if (!codexApi) {
    isLoadingHistory.value = false
    pageError.value = '当前环境不支持 Codex 主会话'
    return
  }
  try {
    const [stateResult, configResult] = await Promise.all([
      codexApi.getState(),
      codexApi.getConfig()
    ])
    if (stateResult?.state) applyState(stateResult.state)
    if (!stateResult?.success && stateResult?.error) {
      pageError.value = stateResult.error
    }
    if (configResult?.success) applyConfig(configResult.config)
    await loadHistory(state.activeSessionId)
  } catch (error) {
    pageError.value = error?.message || 'Codex 会话加载失败'
  } finally {
    if (!state.activeSessionId) isLoadingHistory.value = false
  }
}

const resizeComposer = () => {
  const element = composerInput.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(180, Math.max(40, element.scrollHeight))}px`
}

const switchSession = async (sessionId) => {
  const normalizedSessionId = String(sessionId || '').trim()
  if (
    !codexApi
    || !normalizedSessionId
    || normalizedSessionId === state.activeSessionId
  ) return
  pageError.value = ''
  try {
    const result = await codexApi.selectSession({ sessionId: normalizedSessionId })
    if (result?.state) applyState(result.state)
    if (!result?.success) throw new Error(result?.error || '会话切换失败')
    shouldStickToBottom = true
    await loadHistory(normalizedSessionId)
  } catch (error) {
    pageError.value = error?.message || '会话切换失败'
  }
}

const sendMessage = async () => {
  const text = draft.value.trim()
  const sessionId = state.activeSessionId
  if (!text || !sessionId || isSending.value || !codexApi) return
  isSending.value = true
  pageError.value = ''
  try {
    const result = await codexApi.send({ text, sessionId })
    if (!result?.success) throw new Error(result?.error || '任务发送失败')
    draft.value = ''
    await nextTick()
    resizeComposer()
    shouldStickToBottom = true
    void scrollToBottom(true)
  } catch (error) {
    pageError.value = error?.message || '任务发送失败'
  } finally {
    isSending.value = false
  }
}

const interruptTurn = async () => {
  if (!codexApi) return
  try {
    const result = await codexApi.interrupt({
      sessionId: state.activeSessionId
    })
    if (!result?.success) throw new Error(result?.error || '中断失败')
  } catch (error) {
    pageError.value = error?.message || '中断失败'
  }
}

const createNewSession = async () => {
  if (!codexApi) return
  try {
    const result = await codexApi.newSession()
    if (!result?.success) throw new Error(result?.error || '新建会话失败')
    if (result.state) applyState(result.state)
    const sessionId = result.session?.id || state.activeSessionId
    messageCache.set(sessionId, [])
    messages.value = []
    pageError.value = ''
    draft.value = ''
    await nextTick()
    resizeComposer()
  } catch (error) {
    pageError.value = error?.message || '新建会话失败'
  }
}

const deleteSession = async (session) => {
  const sessionId = String(session?.id || '').trim()
  if (!codexApi || !sessionId || deletingSessionId.value) return
  const isMainSession = sessionId === 'main'
  const confirmed = await showConfirm({
    title: isMainSession ? '清空主会话' : '删除会话',
    message: isMainSession
      ? '确定清空主会话吗？对应的 Codex 会话记录和全部上下文都会被永久删除。'
      : `确定删除“${session.title || '未命名会话'}”吗？对应的 Codex 会话记录和全部上下文都会被永久删除。`,
    type: 'warning',
    confirmText: isMainSession ? '清空会话' : '删除会话',
    cancelText: '取消'
  })
  if (!confirmed) return

  const wasActive = state.activeSessionId === sessionId
  deletingSessionId.value = sessionId
  pageError.value = ''
  try {
    const result = await codexApi.deleteSession({ sessionId })
    if (result?.state) applyState(result.state)
    if (!result?.success) throw new Error(result?.error || '会话删除失败')
    historyLoadSequence += 1
    messageCache.delete(sessionId)
    if (wasActive) {
      messages.value = []
      shouldStickToBottom = true
      if (!result.reset && state.activeSessionId) {
        await loadHistory(state.activeSessionId)
      } else {
        isLoadingHistory.value = false
        await scrollToBottom(true)
      }
    }
  } catch (error) {
    pageError.value = error?.message || '会话删除失败'
  } finally {
    deletingSessionId.value = ''
  }
}

const restartServer = async () => {
  if (!codexApi || isRestarting.value || isAnyBusy.value) return
  isRestarting.value = true
  pageError.value = ''
  try {
    const result = await codexApi.restart()
    if (result?.state) applyState(result.state)
    if (!result?.success) throw new Error(result?.error || 'Server 重启失败')
  } catch (error) {
    pageError.value = error?.message || 'Server 重启失败'
  } finally {
    isRestarting.value = false
  }
}

const refreshAccount = async () => {
  if (!codexApi || isRefreshingAccount.value) return
  isRefreshingAccount.value = true
  try {
    const result = await codexApi.refreshAccount()
    if (result?.state) applyState(result.state)
    if (!result?.success) throw new Error(result?.error || '账户信息读取失败')
    pageError.value = ''
  } catch (error) {
    pageError.value = error?.message || '账户信息读取失败'
  } finally {
    isRefreshingAccount.value = false
  }
}

const chooseWorkingDirectory = async () => {
  const result = await window.electronAPI?.showOpenDialog?.({
    title: '选择 Codex 工作目录',
    properties: ['openDirectory']
  })
  const selectedPath = result?.filePaths?.[0]
  if (!result?.canceled && selectedPath) {
    form.workingDirectory = selectedPath
  }
}

const splitIdList = (value) => (
  Array.from(new Set(
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ))
)

const addFeishuConnection = () => {
  const generatedId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  form.feishu.connections.push({
    id: `feishu-${generatedId}`,
    name: `飞书 ${form.feishu.connections.length + 1}`,
    enabled: false,
    appId: '',
    appSecret: '',
    hasAppSecret: false,
    allowedChatIdsText: '',
    allowedSenderIdsText: ''
  })
  expandedFeishuConnectionId.value = `feishu-${generatedId}`
}

const toggleFeishuConnection = (connectionId) => {
  expandedFeishuConnectionId.value = expandedFeishuConnectionId.value === connectionId
    ? ''
    : connectionId
}

const removeFeishuConnection = async (connectionId) => {
  const index = form.feishu.connections
    .findIndex((connection) => connection.id === connectionId)
  if (index < 0) return
  const connection = form.feishu.connections[index]
  const confirmed = await showConfirm({
    title: '删除飞书机器人',
    message: `确定删除“${connection.name || '未命名飞书'}”吗？保存设置后，这个长连接将停止。`,
    type: 'warning',
    confirmText: '删除机器人',
    cancelText: '取消'
  })
  if (!confirmed) return
  form.feishu.connections.splice(index, 1)
  if (expandedFeishuConnectionId.value === connectionId) {
    expandedFeishuConnectionId.value = ''
  }
}

const saveSettings = async () => {
  if (!codexApi || isSavingSettings.value) return
  isSavingSettings.value = true
  settingsMessage.value = ''
  try {
    const result = await codexApi.saveConfig({
      workingDirectory: form.workingDirectory,
      sandboxMode: form.sandboxMode,
      approvalPolicy: form.approvalPolicy,
      reasoningEffort: form.reasoningEffort,
      feishu: {
        autoMonitor: {
          enabled: form.feishu.autoMonitor.enabled,
          targetSessionId: form.feishu.autoMonitor.targetSessionId,
          stallMinutes: Number(form.feishu.autoMonitor.stallMinutes) || 20
        },
        connections: form.feishu.connections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          enabled: connection.enabled,
          appId: connection.appId,
          appSecret: connection.appSecret,
          allowedChatIds: splitIdList(connection.allowedChatIdsText),
          allowedSenderIds: splitIdList(connection.allowedSenderIdsText)
        }))
      }
    })
    if (!result?.success) throw new Error(result?.error || '设置保存失败')
    applyConfig(result.config)
    settingsMessageType.value = 'success'
    settingsMessage.value = '设置已保存并应用'
  } catch (error) {
    settingsMessageType.value = 'error'
    settingsMessage.value = error?.message || '设置保存失败'
  } finally {
    isSavingSettings.value = false
  }
}

const displayMessageText = (message = {}) => {
  const text = String(message.text || '')
  return message.source === 'feishu'
    ? text.replace(/^\[来自飞书的指令\]\s*/u, '')
    : text
}

const sessionMetaLabel = (session = {}) => {
  if (session.source === 'feishu') {
    const chatLabel = session.chatType === 'group' ? '群聊' : '私聊'
    return session.connectionName
      ? `${session.connectionName} · ${chatLabel}`
      : `飞书${chatLabel}`
  }
  return session.id === 'main' ? '默认页面会话' : '页面会话'
}

const formatSessionTime = (value) => {
  const date = new Date(Number(value) || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return timeFormatter.format(date)
  }
  return shortDateFormatter.format(date)
}

const formatTime = (value) => {
  const date = new Date(Number(value) || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  return timeFormatter.format(date)
}

onMounted(() => {
  removeEventListener = codexApi?.onEvent?.(handleSessionEvent) || null
  void loadSession()
})

onBeforeUnmount(() => {
  removeEventListener?.()
})
</script>

<style scoped>
.codex-main-session {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--theme-sem-bg-workspace);
  color: var(--theme-sem-text-primary);
}

.codex-page-header {
  display: flex;
  min-height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 18px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  background: var(--theme-sem-surface-1);
}

.codex-title,
.codex-title > span:last-child,
.section-title,
.section-title > span,
.toggle-row > span,
.settings-heading > div {
  display: flex;
  min-width: 0;
}

.codex-title {
  align-items: center;
  gap: 10px;
}

.codex-title > span:last-child,
.section-title > span,
.toggle-row > span,
.settings-heading > div {
  flex-direction: column;
  gap: 3px;
}

.codex-title strong {
  font-size: 15px;
  font-weight: 680;
}

.codex-title small,
.section-title small,
.toggle-row small,
.settings-heading span {
  color: var(--theme-sem-text-muted);
  font-size: 11px;
}

.codex-title-icon,
.conversation-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--theme-sem-accent-primary) 35%, var(--theme-sem-border-default));
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 13%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-primary-strong);
}

.codex-title-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.codex-header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-chip {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 999px;
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
}

.status-chip i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--theme-sem-text-muted);
}

.status-chip.success i {
  background: var(--theme-sem-accent-success-strong);
}

.status-chip.pending i {
  background: var(--theme-sem-accent-warning-strong);
}

.status-chip.error i {
  background: var(--theme-sem-accent-danger-strong);
}

.status-chip.account {
  color: var(--theme-sem-text-primary);
}

.icon-action,
.header-action,
.composer-footer button,
.queue-status button,
.settings-footer button,
.path-field button,
.page-alert button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--theme-sem-border-default);
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-secondary);
  font: inherit;
  cursor: pointer;
}

.icon-action {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
}

.header-action {
  height: 30px;
  gap: 6px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
}

.icon-action:hover:not(:disabled),
.header-action:hover:not(:disabled),
.header-action.active,
.composer-footer button:hover:not(:disabled),
.queue-status button:hover:not(:disabled),
.path-field button:hover:not(:disabled) {
  border-color: var(--theme-sem-border-strong);
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.page-alert {
  display: flex;
  min-height: 38px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid;
  font-size: 12px;
}

.page-alert.error {
  border-color: color-mix(in srgb, var(--theme-sem-accent-danger) 36%, var(--theme-sem-border-default));
  background: var(--theme-sem-danger-bg);
  color: var(--theme-sem-accent-danger-strong);
}

.page-alert.warning {
  border-color: var(--theme-sem-warning-border);
  background: var(--theme-sem-warning-bg);
  color: var(--theme-sem-text-secondary);
}

.page-alert span {
  min-width: 0;
  flex: 1;
}

.page-alert code {
  font-size: 11px;
}

.page-alert button {
  padding: 4px 8px;
  border: 0;
  background: transparent;
  font-size: 11px;
}

.codex-page-body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.session-sidebar {
  display: flex;
  width: 238px;
  min-width: 238px;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--theme-sem-border-default);
  background: var(--theme-sem-surface-1);
}

.session-sidebar-heading {
  display: flex;
  min-height: 55px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.session-sidebar-heading > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.session-sidebar-heading strong {
  font-size: 13px;
}

.session-sidebar-heading small {
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.session-list {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 26px;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-sem-text-secondary);
}

.session-item + .session-item {
  margin-top: 3px;
}

.session-item:hover {
  background: var(--theme-sem-hover);
}

.session-item.active {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 28%, var(--theme-sem-border-default));
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 11%, var(--theme-sem-surface-2));
  color: var(--theme-sem-text-primary);
}

.session-select-action {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.session-delete-action {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--theme-sem-text-muted);
  opacity: 0.58;
  cursor: pointer;
}

.session-item:hover .session-delete-action,
.session-delete-action:focus-visible {
  color: var(--theme-sem-accent-danger);
  opacity: 1;
}

.session-delete-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-sem-accent-danger) 12%, transparent);
}

.session-delete-action:disabled {
  color: var(--theme-sem-text-muted);
  cursor: not-allowed;
  opacity: 0.36;
}

.session-item-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 8px;
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-muted);
}

.session-item-icon.feishu {
  border-color: color-mix(in srgb, var(--theme-sem-accent-info) 28%, var(--theme-sem-border-default));
  color: var(--theme-sem-accent-info);
}

.session-item-copy,
.session-item-title {
  display: flex;
  min-width: 0;
}

.session-item-copy {
  flex-direction: column;
  gap: 4px;
}

.session-item-title {
  align-items: center;
  gap: 5px;
}

.session-item-title strong,
.session-item-copy small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item-title strong {
  font-size: 11px;
  font-weight: 620;
}

.session-item-copy small,
.session-item time {
  color: var(--theme-sem-text-muted);
  font-size: 9px;
}

.session-item time {
  align-self: start;
  padding-top: 2px;
}

.session-queue-badge {
  display: inline-flex;
  min-width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-on-accent);
  font-size: 9px;
}

.conversation-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.message-scroller {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 22px clamp(18px, 4vw, 72px);
  scroll-behavior: smooth;
}

.conversation-loading,
.conversation-empty {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  color: var(--theme-sem-text-muted);
}

.conversation-loading {
  gap: 8px;
  font-size: 12px;
}

.conversation-empty {
  flex-direction: column;
  text-align: center;
}

.conversation-empty-icon {
  width: 50px;
  height: 50px;
  margin-bottom: 14px;
  border-radius: 16px;
}

.conversation-empty strong {
  color: var(--theme-sem-text-primary);
  font-size: 16px;
}

.conversation-empty p {
  width: min(100%, 460px);
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
}

.message-list {
  display: flex;
  width: min(100%, 900px);
  min-height: 100%;
  flex-direction: column;
  gap: 18px;
  margin: 0 auto;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.message-row.user {
  flex-direction: row-reverse;
}

.message-avatar {
  display: flex;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 9px;
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-secondary);
}

.message-row.assistant .message-avatar {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 28%, var(--theme-sem-border-default));
  color: var(--theme-sem-accent-primary-strong);
}

.message-content {
  min-width: 0;
  max-width: min(82%, 760px);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 4px 6px;
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.message-row.user .message-meta {
  justify-content: flex-end;
}

.message-meta strong {
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
  font-weight: 620;
}

.source-badge {
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-sem-accent-info) 15%, transparent);
  color: var(--theme-sem-accent-info);
}

.message-text {
  padding: 11px 13px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 5px 14px 14px 14px;
  background: var(--theme-sem-surface-1);
  color: var(--theme-sem-text-primary);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.message-row.user .message-text {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 34%, var(--theme-sem-border-default));
  border-radius: 14px 5px 14px 14px;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 13%, var(--theme-sem-surface-1));
}

.message-row.error .message-text {
  border-color: color-mix(in srgb, var(--theme-sem-accent-danger) 42%, var(--theme-sem-border-default));
  background: var(--theme-sem-danger-bg);
}

.typing-indicator {
  display: flex;
  gap: 3px;
  padding: 7px 4px 0;
}

.typing-indicator i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--theme-sem-text-muted);
  animation: typing-pulse 1.1s infinite ease-in-out;
}

.typing-indicator i:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-indicator i:nth-child(3) {
  animation-delay: 0.3s;
}

.composer-wrap {
  flex: 0 0 auto;
  padding: 10px clamp(18px, 4vw, 72px) 12px;
  border-top: 1px solid var(--theme-sem-border-default);
  background: var(--theme-sem-surface-1);
}

.queue-status,
.composer,
.composer-footer {
  width: min(100%, 900px);
  margin-right: auto;
  margin-left: auto;
}

.queue-status {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
  color: var(--theme-sem-text-muted);
  font-size: 11px;
}

.queue-status button {
  height: 24px;
  gap: 5px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 7px;
  color: var(--theme-sem-accent-danger-strong);
  font-size: 11px;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 7px;
  border: 1px solid var(--theme-sem-border-strong);
  border-radius: 14px;
  background: var(--theme-sem-bg-workspace);
  box-shadow: 0 6px 22px color-mix(in srgb, black 9%, transparent);
}

.composer:focus-within {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 72%, var(--theme-sem-border-strong));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-sem-accent-primary) 14%, transparent);
}

.composer textarea {
  min-height: 40px;
  max-height: 180px;
  flex: 1;
  box-sizing: border-box;
  resize: none;
  padding: 10px 9px;
  overflow: auto;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--theme-sem-text-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.composer textarea::placeholder,
.field-label input::placeholder,
.field-label textarea::placeholder {
  color: var(--theme-sem-text-muted);
}

.send-action {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-on-accent);
  cursor: pointer;
}

.send-action:hover:not(:disabled) {
  background: var(--theme-sem-accent-primary-strong);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.composer-footer > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-footer button {
  height: 24px;
  flex: 0 0 auto;
  gap: 4px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 10px;
}

.settings-panel {
  display: flex;
  width: 360px;
  min-width: 360px;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid var(--theme-sem-border-default);
  background: var(--theme-sem-surface-1);
}

.settings-heading {
  display: flex;
  min-height: 55px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.settings-heading strong {
  font-size: 13px;
}

.settings-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 14px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 12px;
  background: var(--theme-sem-surface-2);
}

.settings-section + .settings-section {
  margin-top: 12px;
}

.section-title {
  align-items: center;
  gap: 9px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  color: var(--theme-sem-text-secondary);
}

.section-title strong {
  color: var(--theme-sem-text-primary);
  font-size: 12px;
}

.section-title.with-action > span {
  flex: 1;
}

.section-title.with-action > button {
  display: inline-flex;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 7px;
  background: var(--theme-sem-bg-workspace);
  color: var(--theme-sem-text-secondary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.section-title.with-action > button:hover {
  border-color: var(--theme-sem-border-strong);
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.connection-empty {
  margin: 0;
  padding: 16px 10px;
  border: 1px dashed var(--theme-sem-border-default);
  border-radius: 9px;
  color: var(--theme-sem-text-muted);
  font-size: 10px;
  line-height: 1.6;
  text-align: center;
}

.feishu-connection-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: var(--theme-sem-bg-workspace);
}

.connection-card-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--theme-sem-border-default);
}

.connection-card-heading > span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.connection-card-heading > span strong,
.connection-card-heading > span small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-card-heading > span strong {
  font-size: 11px;
}

.connection-card-heading > span small {
  color: var(--theme-sem-text-muted);
  font-size: 9px;
}

.connection-card-heading > label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-sem-text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.connection-card-heading > label input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--theme-sem-accent-primary);
}

.connection-card-heading .icon-action.danger {
  width: 26px;
  height: 26px;
  color: var(--theme-sem-accent-danger-strong);
}

.field-label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.field-label > span {
  color: var(--theme-sem-text-secondary);
  font-size: 11px;
  font-weight: 580;
}

.field-label input,
.field-label select,
.field-label textarea,
.path-field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 8px;
  background: var(--theme-sem-bg-workspace);
  color: var(--theme-sem-text-primary);
  font: inherit;
  font-size: 11px;
}

.field-label input,
.field-label select {
  height: 34px;
  padding: 0 9px;
}

.field-label textarea {
  min-height: 66px;
  resize: vertical;
  padding: 8px 9px;
  line-height: 1.45;
}

.field-label input:focus,
.field-label select:focus,
.field-label textarea:focus,
.path-field:focus-within {
  border-color: var(--theme-sem-accent-primary);
  outline: 0;
}

.path-field {
  display: flex;
  overflow: hidden;
}

.path-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.path-field button {
  width: 34px;
  flex: 0 0 34px;
  padding: 0;
  border-width: 0 0 0 1px;
  border-radius: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.account-card,
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 9px;
  background: var(--theme-sem-bg-workspace);
}

.account-card > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.account-card span {
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.account-card strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-card svg {
  flex: 0 0 auto;
  color: var(--theme-sem-accent-success-strong);
}

.account-card.disconnected svg {
  color: var(--theme-sem-accent-warning-strong);
}

.toggle-row {
  cursor: pointer;
}

.toggle-row strong {
  font-size: 11px;
}

.toggle-row input {
  width: 16px;
  height: 16px;
  accent-color: var(--theme-sem-accent-primary);
}

.settings-note {
  margin: 0;
  padding: 9px;
  border-radius: 8px;
  background: var(--theme-sem-info-bg);
  color: var(--theme-sem-text-secondary);
  font-size: 10px;
  line-height: 1.6;
}

.settings-footer {
  display: flex;
  min-height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 14px;
  border-top: 1px solid var(--theme-sem-border-default);
}

.settings-footer > span {
  min-width: 0;
  flex: 1;
  font-size: 10px;
}

.settings-footer > span.success {
  color: var(--theme-sem-accent-success-strong);
}

.settings-footer > span.error {
  color: var(--theme-sem-accent-danger-strong);
}

.settings-footer .primary-action {
  height: 32px;
  gap: 6px;
  padding: 0 11px;
  border-color: var(--theme-sem-accent-primary);
  border-radius: 8px;
  background: var(--theme-sem-accent-primary);
  color: var(--theme-sem-text-on-accent);
  font-size: 11px;
}

/* Polished Codex workspace */
.codex-main-session {
  background:
    radial-gradient(
      circle at 72% 8%,
      color-mix(in srgb, var(--theme-sem-accent-primary) 5%, transparent),
      transparent 34%
    ),
    var(--theme-sem-bg-workspace);
}

.codex-page-body {
  position: relative;
}

.session-sidebar {
  width: 252px;
  min-width: 252px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-sem-surface-1) 94%, var(--theme-sem-accent-primary) 6%),
      var(--theme-sem-surface-1) 34%
    );
}

.codex-brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 17px 16px 13px;
}

.codex-brand-mark {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--theme-sem-accent-primary) 32%, var(--theme-sem-border-default));
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 14%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-primary-strong);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--theme-sem-accent-primary) 10%, transparent);
}

.codex-brand > span:last-child,
.conversation-title > span:last-child,
.account-summary > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.codex-brand > span:last-child {
  gap: 3px;
}

.codex-brand strong {
  font-size: 15px;
  font-weight: 720;
  letter-spacing: -0.01em;
}

.codex-brand small {
  overflow: hidden;
  color: var(--theme-sem-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-session-action {
  display: flex;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 1px 12px 15px;
  border: 1px solid color-mix(in srgb, var(--theme-sem-accent-primary) 55%, var(--theme-sem-border-default));
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-primary-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.new-session-action:hover {
  border-color: var(--theme-sem-accent-primary);
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 18%, var(--theme-sem-surface-2));
}

.session-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 7px;
  color: var(--theme-sem-text-muted);
  font-size: 10px;
  font-weight: 620;
}

.session-list-heading > span:last-child {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--theme-sem-surface-2);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.session-list {
  padding: 0 8px 10px;
}

.session-item {
  min-height: 52px;
  grid-template-columns: minmax(0, 1fr) 26px;
  gap: 3px;
  padding: 4px;
  border-radius: 11px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
  touch-action: manipulation;
}

.session-item:hover {
  background: color-mix(in srgb, var(--theme-sem-hover) 80%, transparent);
}

.session-item.active {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 24%, var(--theme-sem-border-default));
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 10%, var(--theme-sem-surface-2));
  box-shadow: inset 3px 0 0 var(--theme-sem-accent-primary);
}

.session-select-action {
  min-height: 42px;
  gap: 9px;
  padding: 4px;
}

.session-item-icon {
  border: 0;
  border-radius: 9px;
  background: var(--theme-sem-surface-2);
}

.session-item.active .session-item-icon {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 14%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-primary-strong);
}

.session-item-copy {
  gap: 3px;
}

.session-item-title strong {
  font-size: 11px;
  font-weight: 640;
}

.session-item-copy small,
.session-item time {
  font-size: 9px;
}

.session-item time {
  padding-top: 1px;
  font-variant-numeric: tabular-nums;
}

.session-sidebar-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--theme-sem-border-default);
  background: color-mix(in srgb, var(--theme-sem-surface-1) 92%, transparent);
}

.account-summary {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
}

.account-avatar {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-sem-accent-success) 14%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-success-strong);
}

.account-summary.disconnected .account-avatar {
  background: var(--theme-sem-warning-bg);
  color: var(--theme-sem-accent-warning-strong);
}

.account-summary > span:last-child {
  gap: 2px;
}

.account-summary strong,
.account-summary small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-summary strong {
  font-size: 10px;
}

.account-summary small {
  color: var(--theme-sem-text-muted);
  font-size: 9px;
}

.sidebar-settings-action {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-sem-text-muted);
  cursor: pointer;
}

.sidebar-settings-action:hover {
  border-color: var(--theme-sem-border-default);
  background: var(--theme-sem-hover);
  color: var(--theme-sem-text-primary);
}

.conversation-header {
  display: flex;
  min-height: 64px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px;
  border-bottom: 1px solid var(--theme-sem-border-default);
  background: color-mix(in srgb, var(--theme-sem-surface-1) 92%, transparent);
  backdrop-filter: blur(14px);
}

.conversation-title,
.conversation-actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.conversation-title {
  gap: 10px;
}

.conversation-title > span:last-child {
  gap: 3px;
}

.conversation-title strong,
.conversation-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-title strong {
  font-size: 13px;
  font-weight: 670;
}

.conversation-title small {
  color: var(--theme-sem-text-muted);
  font-size: 10px;
}

.conversation-source-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-secondary);
}

.conversation-source-icon.feishu {
  background: color-mix(in srgb, var(--theme-sem-accent-info) 13%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-info);
}

.conversation-actions {
  flex: 0 0 auto;
  gap: 7px;
}

.conversation-actions .status-chip {
  height: 26px;
  padding: 0 8px;
  background: transparent;
  font-size: 10px;
}

.message-scroller {
  padding-top: 30px;
  padding-bottom: 34px;
  overscroll-behavior: contain;
}

.conversation-empty {
  min-height: 100%;
}

.conversation-empty-icon {
  width: 58px;
  height: 58px;
  margin-bottom: 18px;
  border: 0;
  border-radius: 18px;
  box-shadow:
    0 14px 34px color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--theme-sem-accent-primary) 24%, transparent);
}

.conversation-empty strong {
  font-size: 18px;
  font-weight: 680;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.conversation-empty p {
  max-width: 430px;
  color: var(--theme-sem-text-secondary);
  text-wrap: pretty;
}

.empty-directory {
  display: inline-flex;
  max-width: min(100%, 420px);
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 6px 10px;
  overflow: hidden;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 999px;
  background: var(--theme-sem-surface-1);
  color: var(--theme-sem-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-list {
  width: min(100%, 860px);
  gap: 24px;
}

.message-row {
  gap: 12px;
}

.message-avatar {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
  border: 0;
  border-radius: 10px;
}

.message-row.assistant .message-avatar {
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 11%, var(--theme-sem-surface-2));
}

.message-content {
  max-width: min(84%, 740px);
}

.message-row.assistant .message-text {
  padding: 1px 2px;
  border: 0;
  background: transparent;
  line-height: 1.72;
}

.message-row.user .message-text {
  border-color: transparent;
  border-radius: 15px 5px 15px 15px;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, var(--theme-sem-surface-1));
}

.composer-wrap {
  padding-top: 12px;
  padding-bottom: 13px;
  border-top: 0;
  background:
    linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--theme-sem-surface-1) 72%, transparent) 18%,
      var(--theme-sem-surface-1) 52%
    );
}

.queue-status,
.composer,
.composer-footer {
  width: min(100%, 860px);
}

.queue-status {
  width: fit-content;
  max-width: min(100%, 860px);
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--theme-sem-surface-2);
}

.composer {
  border-color: color-mix(in srgb, var(--theme-sem-border-strong) 86%, transparent);
  border-radius: 16px;
  background: var(--theme-sem-bg-workspace);
  box-shadow:
    0 12px 30px color-mix(in srgb, black 10%, transparent),
    0 1px 0 color-mix(in srgb, white 4%, transparent) inset;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.composer:focus-within {
  border-color: color-mix(in srgb, var(--theme-sem-accent-primary) 70%, var(--theme-sem-border-strong));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--theme-sem-accent-primary) 12%, transparent),
    0 14px 34px color-mix(in srgb, black 11%, transparent);
}

.composer textarea {
  min-height: 42px;
  padding: 10px 9px 9px;
  font-size: 13px;
}

.send-action {
  border-radius: 11px;
  box-shadow: 0 6px 14px color-mix(in srgb, var(--theme-sem-accent-primary) 20%, transparent);
}

.composer-footer > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.settings-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, black 22%, transparent);
  cursor: default;
}

.settings-panel {
  position: absolute;
  z-index: 21;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, calc(100% - 44px));
  min-width: 0;
  border-left: 1px solid var(--theme-sem-border-strong);
  background: var(--theme-sem-surface-1);
  box-shadow: -18px 0 44px color-mix(in srgb, black 16%, transparent);
  overscroll-behavior: contain;
}

.settings-heading {
  min-height: 64px;
  padding: 0 18px;
}

.settings-heading strong {
  font-size: 14px;
}

.settings-scroll {
  padding: 16px;
}

.settings-section {
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-sem-surface-2) 72%, transparent);
}

.section-title {
  gap: 10px;
  padding-bottom: 12px;
}

.section-title-icon {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-sem-accent-primary) 12%, var(--theme-sem-bg-workspace));
  color: var(--theme-sem-accent-primary-strong);
}

.section-title-icon.feishu {
  background: color-mix(in srgb, var(--theme-sem-accent-info) 12%, var(--theme-sem-bg-workspace));
  color: var(--theme-sem-accent-info);
}

.field-label {
  gap: 7px;
}

.field-label input,
.field-label select {
  height: 38px;
}

.field-label input,
.field-label select,
.field-label textarea,
.path-field {
  border-radius: 9px;
  background: var(--theme-sem-bg-workspace);
}

.field-label input:focus-visible,
.field-label select:focus-visible,
.field-label textarea:focus-visible,
.path-field:focus-within {
  border-color: var(--theme-sem-accent-primary);
  outline: 0;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-sem-accent-primary) 11%, transparent);
}

.account-card {
  border: 0;
  background: color-mix(in srgb, var(--theme-sem-accent-success) 8%, var(--theme-sem-bg-workspace));
}

.feishu-connection-card {
  gap: 0;
  padding: 0;
  overflow: hidden;
  border-radius: 11px;
}

.connection-card-heading {
  gap: 4px;
  padding: 5px;
  border-bottom: 0;
}

.connection-expand-action {
  display: flex;
  min-width: 0;
  min-height: 48px;
  flex: 1;
  align-items: center;
  gap: 9px;
  padding: 5px 7px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-sem-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.connection-expand-action:hover {
  background: var(--theme-sem-hover);
}

.connection-expand-action > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.connection-expand-action strong,
.connection-expand-action small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-expand-action strong {
  font-size: 11px;
}

.connection-expand-action small {
  color: var(--theme-sem-text-muted);
  font-size: 9px;
}

.connection-index {
  display: inline-flex;
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-sem-accent-info) 11%, var(--theme-sem-surface-2));
  color: var(--theme-sem-accent-info);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.connection-expand-action > svg {
  flex: 0 0 auto;
  color: var(--theme-sem-text-muted);
  transition: transform 160ms ease;
}

.connection-expand-action > svg.expanded {
  transform: rotate(180deg);
}

.connection-card-heading .icon-action.danger {
  align-self: center;
  margin-right: 4px;
}

.connection-fields {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 4px 12px 13px;
  border-top: 1px solid var(--theme-sem-border-default);
}

.auto-monitor-card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 11px;
  border: 1px solid var(--theme-sem-border-default);
  border-radius: 10px;
  background: var(--theme-sem-bg-workspace);
}

.auto-monitor-status {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--theme-sem-surface-2);
  color: var(--theme-sem-text-muted);
  font-size: 9px;
  line-height: 1.55;
}

.auto-monitor-status.monitoring {
  color: var(--theme-sem-accent-success);
}

.auto-monitor-status.no-target {
  color: var(--theme-sem-accent-warning);
}

.connection-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border-radius: 9px;
  background: var(--theme-sem-surface-2);
  cursor: pointer;
}

.connection-toggle > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.connection-toggle strong {
  font-size: 11px;
}

.connection-toggle small {
  color: var(--theme-sem-text-muted);
  font-size: 9px;
}

.connection-toggle input {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  accent-color: var(--theme-sem-accent-primary);
}

.settings-note {
  border: 1px solid color-mix(in srgb, var(--theme-sem-accent-info) 18%, transparent);
}

.settings-footer {
  min-height: 64px;
  padding: 0 18px;
}

.settings-footer .primary-action {
  height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  font-weight: 620;
}

button,
select,
input,
textarea {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,
select:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--theme-sem-accent-primary);
  outline-offset: 2px;
}

.composer textarea:focus-visible {
  outline: 0;
}

.spinning {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes typing-pulse {
  0%, 70%, 100% { opacity: 0.35; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .spinning,
  .typing-indicator i {
    animation: none;
  }

  .session-item,
  .composer,
  .connection-expand-action > svg {
    transition: none;
  }
}

@media (max-width: 1120px) {
  .session-sidebar {
    width: 224px;
    min-width: 224px;
  }

  .settings-panel {
    width: min(400px, calc(100% - 36px));
    min-width: 0;
  }
}
</style>
