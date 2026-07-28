const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const THREAD_PAGE_LIMIT = 100
const MAX_THREAD_PAGES = 20
const DEFAULT_RESULT_LIMIT = 8
const MAX_RESULT_LIMIT = 20
const CONFIRMATION_TTL_MS = 10 * 60 * 1000
const SOURCE_KINDS = Object.freeze([
  'cli',
  'vscode',
  'exec',
  'appServer'
])

const CODEX_PROJECT_DYNAMIC_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'find_codex_project_sessions',
    description: [
      '查询某个项目尚未归档、尚未删除的 Codex 会话。',
      '用户只想查看项目会话，或执行任务前需要确认候选会话时调用。',
      'projectQuery 应只填写项目名或绝对路径，不要填写完整任务描述；省略时查询当前会话绑定的默认项目。'
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        projectQuery: {
          type: 'string',
          description: '项目名、目录名或绝对路径，例如 api-go。'
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_RESULT_LIMIT
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'bind_codex_project',
    description: [
      '把项目绑定为当前 OpenGit 或飞书会话的默认项目。',
      '后续用户未明确点名项目的项目任务会默认路由到该项目。',
      '优先按 projectQuery 查找已有 Codex 项目会话；没有旧会话时必须提供存在的项目绝对路径。'
    ].join(''),
    inputSchema: {
      type: 'object',
      required: ['projectQuery'],
      properties: {
        projectQuery: {
          type: 'string',
          description: '要绑定的项目名、目录名或绝对路径，例如 content_studio。'
        },
        cwd: {
          type: 'string',
          description: '可选；未找到旧会话时用于绑定的项目绝对路径。'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_codex_project_binding',
    description: '查询当前 OpenGit 或飞书会话绑定的默认项目。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'unbind_codex_project',
    description: '解除当前 OpenGit 或飞书会话的默认项目绑定。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'dispatch_codex_project_task',
    description: [
      '把项目任务路由到该项目最近的未归档 Codex 会话；这是飞书项目执行请求的必经入口。',
      '最近会话空闲时会恢复它并开始新一轮；最近会话正在执行时只返回确认问题，绝不排队、steer 或在 OpenGit 主会话里代执行。',
      'projectQuery 省略时使用当前会话绑定的默认项目；用户明确点名其他项目时传入该项目，不会改变原绑定。',
      '如果项目没有旧会话，只有提供可用的绝对 cwd 后才会新建独立项目会话。'
    ].join(''),
    inputSchema: {
      type: 'object',
      required: ['task'],
      properties: {
        projectQuery: {
          type: 'string',
          description: '项目名、目录名或绝对路径，例如 api-go。'
        },
        task: {
          type: 'string',
          description: '要交给目标项目 Codex 会话执行的完整任务。'
        },
        cwd: {
          type: 'string',
          description: '没有旧会话时用于新建任务的项目绝对路径。'
        },
        threadId: {
          type: 'string',
          description: '可选；用户明确选择候选会话后指定其 threadId。'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'start_new_codex_project_task',
    description: [
      '仅在 dispatch_codex_project_task 因目标会话正在执行而要求确认后调用。',
      '只有同一个飞书会话中的用户明确同意新开任务，且确认未过期时才会创建独立项目会话。',
      '不要把普通的“继续”当成新开任务授权。'
    ].join(''),
    inputSchema: {
      type: 'object',
      required: ['confirmationToken'],
      properties: {
        confirmationToken: {
          type: 'string',
          description: 'dispatch_codex_project_task 返回的确认令牌。'
        }
      },
      additionalProperties: false
    }
  }
])

function compactText(value, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const limit = Math.max(20, Number(maxLength) || 120)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/]+$/, '')
}

function normalizeProjectQuery(value = '') {
  return normalizeSearchText(value)
    .replace(/(?:这个|那个)?项目$/u, '')
    .trim()
}

function normalizeLimit(value, fallback = DEFAULT_RESULT_LIMIT) {
  return Math.min(
    MAX_RESULT_LIMIT,
    Math.max(1, Math.round(Number(value) || fallback))
  )
}

function toTimestampMs(value) {
  const numeric = Number(value) || 0
  if (!numeric) return 0
  return numeric < 1e11 ? numeric * 1000 : numeric
}

function normalizeThreadStatus(status = {}) {
  const type = String(status?.type || '').trim()
  if (type === 'active') return 'running'
  if (type === 'systemError') return 'error'
  return 'idle'
}

function scoreProjectThread(thread = {}, projectQuery = '') {
  const query = normalizeProjectQuery(projectQuery)
  if (!query) return 0
  const cwd = normalizeSearchText(thread.cwd)
  const basename = normalizeSearchText(cwd ? path.basename(cwd) : '')
  const name = normalizeSearchText(thread.name)
  const preview = normalizeSearchText(thread.preview)
  const threadId = normalizeSearchText(thread.id)

  if (cwd === query) return 120
  if (basename === query) return 110
  if (name === query) return 105
  if (threadId === query) return 100
  if (basename && basename.includes(query)) return 90
  if (name && name.includes(query)) return 85
  if (cwd && cwd.includes(query)) return 80
  if (preview && preview.includes(query)) return 60
  if (threadId && threadId.includes(query)) return 50
  return 0
}

function normalizeCandidate(thread = {}, score = 0) {
  const cwd = String(thread.cwd || '').trim()
  const title = compactText(
    thread.name
      || thread.preview
      || (cwd ? path.basename(cwd) : '')
      || `Codex ${String(thread.id || '').slice(-8)}`,
    100
  )
  return {
    threadId: String(thread.id || '').trim(),
    title,
    preview: compactText(thread.preview, 160),
    cwd,
    status: normalizeThreadStatus(thread.status),
    activeFlags: Array.isArray(thread?.status?.activeFlags)
      ? [...thread.status.activeFlags]
      : [],
    updatedAt: toTimestampMs(
      thread.recencyAt || thread.updatedAt || thread.createdAt
    ),
    source: String(thread?.source?.type || thread?.source || '').trim(),
    score
  }
}

function toolResponse(value, success = true) {
  return {
    success,
    contentItems: [{
      type: 'inputText',
      text: typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2)
    }]
  }
}

function normalizeConfirmationText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,、。.!！?？;；:：~～]/g, '')
}

function isExplicitNewTaskConfirmation(value = '') {
  const text = normalizeConfirmationText(value)
  if (!text || text.length > 24) return false
  if (/(?:不|不要|不用|别)(?:再)?(?:新开|新建|创建|开启|开)/.test(text)) {
    return false
  }
  if ([
    '是',
    '是的',
    '要',
    '需要',
    '可以',
    '好',
    '好的',
    '确认',
    '同意',
    '确认新开',
    '同意新开',
    '新开',
    '新开吧',
    '开新的',
    '开一个新的',
    '新开任务',
    '新开一个任务',
    '创建新任务',
    '开启新任务'
  ].includes(text)) return true
  return (
    /^(?:那就|就|请|帮我|嗯|好)?(?:新开|开|创建|开启)(?:一个)?(?:新的?)?(?:任务|会话)?(?:吧)?$/.test(text)
    || /(?:新开|新建)(?:一个|个)?(?:新的?)?(?:任务|会话)?/.test(text)
    || /(?:创建|开启|开)(?:一个|个)?(?:新的?|新)(?:任务|会话)/.test(text)
  )
}

function resolveExistingDirectory(value = '') {
  const requested = String(value || '').trim()
  if (!requested || !path.isAbsolute(requested)) return ''
  try {
    return fs.statSync(requested).isDirectory()
      ? path.resolve(requested)
      : ''
  } catch {
    return ''
  }
}

class CodexProjectSessionRouter {
  constructor({
    service,
    now = () => Date.now(),
    confirmationTtlMs = CONFIRMATION_TTL_MS
  } = {}) {
    this.service = service
    this.now = now
    this.confirmationTtlMs = Math.max(
      60 * 1000,
      Number(confirmationTtlMs) || CONFIRMATION_TTL_MS
    )
    this.confirmations = new Map()
  }

  getManagedMainThreadIds() {
    return new Set(
      Array.from(this.service?.sessions?.values?.() || [])
        .map((session) => String(session?.threadId || '').trim())
        .filter(Boolean)
    )
  }

  getOrigin(activeTask = {}) {
    const sessionId = String(activeTask.sessionId || '').trim()
    const connectionId = String(activeTask?.metadata?.connectionId || '').trim()
    const chatId = String(activeTask?.metadata?.chatId || '').trim()
    return {
      sessionId,
      connectionId,
      chatId,
      key: connectionId && chatId
        ? `feishu:${connectionId}:${chatId}`
        : `session:${sessionId}`
    }
  }

  getOriginSession(activeTask = {}) {
    return this.service?.getSession?.(
      String(activeTask.sessionId || '').trim()
    ) || null
  }

  getProjectBinding(activeTask = {}) {
    const session = this.getOriginSession(activeTask)
    const binding = session?.projectBinding
    if (!binding || typeof binding !== 'object') return null
    const projectQuery = String(binding.projectQuery || '').trim()
    const cwd = String(binding.cwd || '').trim()
    if (!projectQuery && !cwd) return null
    return {
      projectQuery: projectQuery || path.basename(cwd),
      cwd,
      title: String(
        binding.title || (cwd ? path.basename(cwd) : projectQuery)
      ).trim(),
      boundAt: Number(binding.boundAt) || 0
    }
  }

  resolveProjectTarget({
    projectQuery,
    cwd,
    activeTask
  } = {}) {
    const explicitProjectQuery = String(projectQuery || '').trim()
    const explicitCwd = String(cwd || '').trim()
    if (explicitProjectQuery) {
      return {
        projectQuery: explicitProjectQuery,
        cwd: explicitCwd,
        usedProjectBinding: false,
        projectBinding: this.getProjectBinding(activeTask)
      }
    }
    const projectBinding = this.getProjectBinding(activeTask)
    if (!projectBinding) {
      return {
        projectQuery: '',
        cwd: explicitCwd,
        usedProjectBinding: false,
        projectBinding: null
      }
    }
    return {
      projectQuery: projectBinding.cwd || projectBinding.projectQuery,
      cwd: explicitCwd || projectBinding.cwd,
      usedProjectBinding: true,
      projectBinding
    }
  }

  pruneConfirmations() {
    const timestamp = this.now()
    for (const [token, confirmation] of this.confirmations.entries()) {
      if (Number(confirmation.expiresAt || 0) <= timestamp) {
        this.confirmations.delete(token)
      }
    }
  }

  async listThreads() {
    const threads = []
    let cursor = null
    for (let page = 0; page < MAX_THREAD_PAGES; page += 1) {
      const result = await this.service.request('thread/list', {
        cursor,
        limit: THREAD_PAGE_LIMIT,
        sortKey: 'recency_at',
        sortDirection: 'desc',
        archived: false,
        useStateDbOnly: true,
        sourceKinds: SOURCE_KINDS
      }, 60 * 1000)
      threads.push(...(
        Array.isArray(result?.data) ? result.data : []
      ))
      cursor = result?.nextCursor || null
      if (!cursor) break
    }
    return threads
  }

  async findProjectSessions({
    projectQuery,
    limit = DEFAULT_RESULT_LIMIT
  } = {}) {
    const query = normalizeProjectQuery(projectQuery)
    if (!query) throw new Error('请提供项目名或项目绝对路径')
    const excludedThreadIds = this.getManagedMainThreadIds()
    const candidates = []
    for (const thread of await this.listThreads()) {
      const threadId = String(thread?.id || '').trim()
      if (
        !threadId
        || excludedThreadIds.has(threadId)
        || thread?.ephemeral === true
        || String(thread?.parentThreadId || '').trim()
      ) continue
      const score = scoreProjectThread(thread, query)
      if (!score) continue
      candidates.push(normalizeCandidate(thread, score))
    }
    return candidates
      .sort((left, right) => (
        right.score - left.score
        || right.updatedAt - left.updatedAt
        || left.threadId.localeCompare(right.threadId)
      ))
      .slice(0, normalizeLimit(limit))
  }

  async bindProject({
    projectQuery,
    cwd = '',
    activeTask
  } = {}) {
    const session = this.getOriginSession(activeTask)
    if (!session) throw new Error('找不到要绑定项目的 OpenGit 会话')
    const normalizedQuery = String(projectQuery || '').trim()
    if (!normalizedQuery) throw new Error('请提供要绑定的项目名或绝对路径')

    const explicitCwd = resolveExistingDirectory(cwd)
      || resolveExistingDirectory(normalizedQuery)
    const searchQuery = explicitCwd || normalizedQuery
    const candidates = await this.findProjectSessions({
      projectQuery: searchQuery,
      limit: MAX_RESULT_LIMIT
    })
    const selectedSession = candidates[0] || null
    const projectCwd = explicitCwd
      || resolveExistingDirectory(selectedSession?.cwd)
    if (!projectCwd) {
      return {
        status: 'project_path_required',
        projectQuery: normalizedQuery,
        message: '没有找到该项目的未归档旧会话；请提供项目绝对路径后再绑定。'
      }
    }

    const projectBinding = this.service.setProjectBinding(session.id, {
      projectQuery: path.basename(projectCwd) || normalizedQuery,
      cwd: projectCwd,
      title: selectedSession?.title || path.basename(projectCwd),
      boundAt: this.now()
    })
    return {
      status: 'bound',
      projectBinding,
      selectedSession,
      matchedSessionCount: candidates.length,
      message: `已将当前会话绑定到项目 ${projectBinding.projectQuery}。`
    }
  }

  getBindingStatus(activeTask = {}) {
    const projectBinding = this.getProjectBinding(activeTask)
    return projectBinding
      ? {
          status: 'bound',
          projectBinding,
          message: `当前会话已绑定项目 ${projectBinding.projectQuery}。`
        }
      : {
          status: 'unbound',
          projectBinding: null,
          message: '当前会话尚未绑定默认项目。'
        }
  }

  unbindProject(activeTask = {}) {
    const session = this.getOriginSession(activeTask)
    if (!session) throw new Error('找不到要解除项目绑定的 OpenGit 会话')
    const previousBinding = this.service.clearProjectBinding(session.id)
    return previousBinding
      ? {
          status: 'unbound',
          previousBinding,
          message: `已解除项目 ${previousBinding.projectQuery} 的会话绑定。`
        }
      : {
          status: 'unbound',
          previousBinding: null,
          message: '当前会话原本就没有绑定默认项目。'
        }
  }

  createRunningConfirmation({
    candidate,
    projectQuery,
    task,
    origin
  }) {
    this.pruneConfirmations()
    for (const [token, confirmation] of this.confirmations.entries()) {
      if (confirmation.originKey === origin.key) {
        this.confirmations.delete(token)
      }
    }
    const token = randomUUID()
    const createdAt = this.now()
    const confirmation = {
      token,
      originKey: origin.key,
      sessionId: origin.sessionId,
      connectionId: origin.connectionId,
      chatId: origin.chatId,
      projectQuery: String(projectQuery || '').trim(),
      task: String(task || '').trim(),
      cwd: candidate.cwd,
      runningThreadId: candidate.threadId,
      runningTitle: candidate.title,
      createdAt,
      expiresAt: createdAt + this.confirmationTtlMs
    }
    this.confirmations.set(token, confirmation)
    return {
      status: 'confirmation_required',
      confirmationToken: token,
      expiresAt: confirmation.expiresAt,
      selectedSession: candidate,
      question: `项目 ${path.basename(candidate.cwd) || projectQuery} 最近的 Codex 会话“${candidate.title}”正在执行。是否新开一个独立的 Codex 任务？`
    }
  }

  async dispatchProjectTask({
    projectQuery,
    task,
    cwd = '',
    threadId = '',
    activeTask
  } = {}) {
    const normalizedTask = String(task || '').trim()
    if (!normalizedTask) throw new Error('项目任务不能为空')
    const target = this.resolveProjectTarget({
      projectQuery,
      cwd,
      activeTask
    })
    if (!target.projectQuery) {
      return {
        status: 'project_required',
        message: '当前会话尚未绑定默认项目，请先指定项目或绑定一个项目。'
      }
    }
    const candidates = await this.findProjectSessions({
      projectQuery: target.projectQuery,
      limit: MAX_RESULT_LIMIT
    })
    const requestedThreadId = String(threadId || '').trim()
    const candidate = requestedThreadId
      ? candidates.find((item) => item.threadId === requestedThreadId)
      : candidates[0]
    if (requestedThreadId && !candidate) {
      return {
        status: 'session_not_found',
        projectQuery: target.projectQuery,
        message: '指定会话不属于该项目、已归档或已删除，请重新查询。'
      }
    }

    if (candidate?.status === 'running') {
      return this.createRunningConfirmation({
        candidate,
        projectQuery: target.projectQuery,
        task: normalizedTask,
        origin: this.getOrigin(activeTask)
      })
    }

    if (candidate) {
      try {
        const result = await this.service.executeCodexProjectTask({
          threadId: candidate.threadId,
          cwd: candidate.cwd,
          task: normalizedTask,
          createNew: false
        })
        return {
          status: 'completed',
          usedProjectBinding: target.usedProjectBinding,
          projectBinding: target.projectBinding,
          reusedExistingSession: true,
          selectedSession: candidate,
          result
        }
      } catch (error) {
        if (error?.code !== 'CODEX_PROJECT_THREAD_ACTIVE') throw error
        return this.createRunningConfirmation({
          candidate: {
            ...candidate,
            status: 'running'
          },
          projectQuery: target.projectQuery,
          task: normalizedTask,
          origin: this.getOrigin(activeTask)
        })
      }
    }

    const projectCwd = resolveExistingDirectory(target.cwd)
      || resolveExistingDirectory(target.projectQuery)
    if (!projectCwd) {
      return {
        status: 'project_path_required',
        projectQuery: target.projectQuery,
        message: '没有找到该项目的未归档旧会话；请提供项目绝对路径后再新建独立任务。'
      }
    }
    const result = await this.service.executeCodexProjectTask({
      cwd: projectCwd,
      task: normalizedTask,
      createNew: true
    })
    return {
      status: 'completed',
      usedProjectBinding: target.usedProjectBinding,
      projectBinding: target.projectBinding,
      reusedExistingSession: false,
      createdNewSession: true,
      projectCwd,
      result
    }
  }

  async startConfirmedNewTask({
    confirmationToken,
    activeTask
  } = {}) {
    this.pruneConfirmations()
    const token = String(confirmationToken || '').trim()
    const confirmation = this.confirmations.get(token)
    if (!confirmation) {
      return {
        status: 'confirmation_expired',
        message: '新开任务确认已失效，请重新发起项目任务。'
      }
    }
    const origin = this.getOrigin(activeTask)
    if (origin.key !== confirmation.originKey) {
      return {
        status: 'confirmation_origin_mismatch',
        message: '该确认不属于当前飞书会话，不能使用。'
      }
    }
    if (!isExplicitNewTaskConfirmation(activeTask?.text)) {
      return {
        status: 'explicit_confirmation_required',
        message: '用户尚未明确同意“新开任务”；请继续询问，不要创建会话。'
      }
    }
    this.confirmations.delete(token)
    const result = await this.service.executeCodexProjectTask({
      cwd: confirmation.cwd,
      task: confirmation.task,
      createNew: true
    })
    return {
      status: 'completed',
      createdNewSession: true,
      projectCwd: confirmation.cwd,
      replacedRunningSession: {
        threadId: confirmation.runningThreadId,
        title: confirmation.runningTitle
      },
      result
    }
  }

  async handleToolCall(params = {}) {
    const tool = String(params.tool || '').trim()
    let args = params.arguments && typeof params.arguments === 'object'
      ? params.arguments
      : {}
    if (typeof params.arguments === 'string') {
      try {
        args = JSON.parse(params.arguments)
      } catch {
        return toolResponse('动态工具参数不是有效 JSON。', false)
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) args = {}
    const activeTask = this.service?.activeTasksByThreadId?.get(
      String(params.threadId || '').trim()
    )
    if (!activeTask) {
      return toolResponse('找不到发起项目路由的 OpenGit 主会话。', false)
    }

    try {
      if (tool === 'find_codex_project_sessions') {
        const target = this.resolveProjectTarget({
          projectQuery: args.projectQuery,
          activeTask
        })
        if (!target.projectQuery) {
          return toolResponse({
            status: 'project_required',
            message: '当前会话尚未绑定默认项目，请提供要查询的项目名。'
          })
        }
        const sessions = await this.findProjectSessions({
          projectQuery: target.projectQuery,
          limit: args.limit
        })
        return toolResponse({
          projectQuery: target.projectQuery,
          usedProjectBinding: target.usedProjectBinding,
          projectBinding: target.projectBinding,
          count: sessions.length,
          sessions
        })
      }
      if (tool === 'bind_codex_project') {
        return toolResponse(await this.bindProject({
          projectQuery: args.projectQuery,
          cwd: args.cwd,
          activeTask
        }))
      }
      if (tool === 'get_codex_project_binding') {
        return toolResponse(this.getBindingStatus(activeTask))
      }
      if (tool === 'unbind_codex_project') {
        return toolResponse(this.unbindProject(activeTask))
      }
      if (tool === 'dispatch_codex_project_task') {
        return toolResponse(await this.dispatchProjectTask({
          projectQuery: args.projectQuery,
          task: args.task,
          cwd: args.cwd,
          threadId: args.threadId,
          activeTask
        }))
      }
      if (tool === 'start_new_codex_project_task') {
        return toolResponse(await this.startConfirmedNewTask({
          confirmationToken: args.confirmationToken,
          activeTask
        }))
      }
      return toolResponse(`OpenGit 不支持动态工具：${tool}`, false)
    } catch (error) {
      return toolResponse(error?.message || String(error), false)
    }
  }

  cleanup() {
    this.confirmations.clear()
  }
}

module.exports = {
  CodexProjectSessionRouter,
  CODEX_PROJECT_DYNAMIC_TOOLS,
  CONFIRMATION_TTL_MS,
  __testables: {
    compactText,
    normalizeProjectQuery,
    normalizeLimit,
    normalizeThreadStatus,
    scoreProjectThread,
    normalizeCandidate,
    isExplicitNewTaskConfirmation,
    resolveExistingDirectory,
    toolResponse
  }
}
