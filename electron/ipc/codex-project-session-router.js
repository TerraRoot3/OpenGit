const fs = require('fs')
const path = require('path')
const {
  createCodexSessionStateSource
} = require('./codex-session-state-source')

const THREAD_PAGE_LIMIT = 100
const MAX_THREAD_PAGES = 20
const DEFAULT_RESULT_LIMIT = 8
const MAX_RESULT_LIMIT = 20
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
    name: 'get_open_git_task_status',
    description: [
      '查询当前 OpenGit 或飞书会话中正在执行、分发或排队的任务状态。',
      '用户问“当前任务状态”“刚才任务到哪了”“还在执行或排队吗”时调用。',
      '这是主会话协调查询，不得改用 dispatch_codex_project_task，也不会向项目会话发送新消息。'
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'list_running_codex_tasks',
    description: [
      '查询这台电脑上所有正在执行的 Codex 任务，不限于当前 OpenGit 或飞书会话。',
      '用户问“所有进行中的 Codex 任务”“有哪些任务正在跑”“全局任务状态”时调用。',
      '该工具会合并 OpenGit 内部任务与 Codex 原生未结束 turn；不得用当前会话任务为 0 推断全局任务为 0。',
      '这是只读查询，不会恢复、终止或向其他会话发送消息。'
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'restart_open_git',
    description: [
      '仅当用户明确要求重启整个 OpenGit 桌面应用时调用。',
      '不要把重启 Codex server、飞书连接、终端或项目任务理解为重启 OpenGit。',
      '调用后会等待当前回复完成，再停止 OpenGit 内的后台服务并重新启动应用；其他正在运行的 OpenGit 任务会被中断。'
    ].join(''),
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
      '把项目任务路由到该项目未归档的 Codex 会话；这是飞书项目执行请求的必经入口。',
      '仅用于需要读取、分析、修改、测试、构建、提交、发布或继续处理项目工作的指令。',
      '当前任务状态、执行进度、排队情况、会话状态、项目绑定、监控或 OpenGit/飞书控制查询都不是项目任务，禁止调用本工具。',
      '会话绑定只提供项目任务的默认目标，不代表每条消息都应路由到项目。',
      '同等项目匹配度下优先选择正在执行的会话并自动排队，空闲后继续使用同一个会话；没有执行中会话时才使用最近的旧会话。',
      '只要项目存在旧会话，就绝不新开项目会话、steer 或在 OpenGit 路由会话里代执行。',
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

function normalizeIntentText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[？?。.!！,，、:：;；"'“”‘’（）()【】]/g, '')
}

function isCoordinatorStatusQuery(value = '') {
  const text = normalizeIntentText(value)
  if (!text) return false

  const patterns = [
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询)?(?:现在|当前)?(?:还)?(?:有|还有)(?:什么|哪些)(?:在|正|正在)?(?:跑|执行|进行|运行|处理|排队|等待)(?:中)?(?:吗|呢)?$/,
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询)?(?:现在|当前)?(?:还)?(?:有|还有)(?:什么|哪些)?(?:codex)?(?:任务|会话)(?:在|正|正在)?(?:跑|执行|进行|运行|处理|排队|等待)(?:中)?(?:吗|呢)?$/,
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询)?(?:现在|当前)?(?:还)?(?:有|还有)(?:什么|哪些)?(?:在|正|正在)?(?:跑|执行|进行|运行|处理|排队|等待)(?:中)?(?:的)?(?:codex)?(?:任务|会话)(?:吗|呢)?$/,
    /^(?:当前|现在|刚才|上个|上一个|这个)?(?:codex)?(?:任务|会话)(?:呢|怎么样|怎么样了)$/,
    /^(?:刚才|上个|上一个|之前)(?:那个)?(?:任务|指令|会话)?呢$/,
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询|告诉我)?(?:有|还有|有哪些|哪些|所有|全部|全局)?(?:正在|还在)?(?:执行|进行|运行|处理|排队|等待)(?:中)?的?(?:codex)?(?:任务|会话)(?:状态|进度|情况)?$/,
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询)?(?:所有|全部|全局)(?:正在|还在)?(?:执行|进行|运行|处理|排队|等待)(?:中)?的?(?:codex)?(?:任务|会话)(?:状态|进度|情况)?$/,
    /^(?:帮我|请|麻烦)?(?:看下|看看|查看|查询|告诉我|问下)?(?:当前|现在|刚才|上一个|上个|这个)?(?:任务|指令)(?:的)?(?:状态|进度|进展|情况)(?:怎么样|怎么样了|如何|呢)?$/,
    /(?:当前|现在|刚才|上一个|上个|这个)?(?:任务|指令)(?:的)?(?:状态|进度|进展|情况)(?:怎么样|怎么样了|如何|呢)?$/,
    /^(?:当前|现在|刚才|上一个|上个|这个)?(?:任务|指令)(?:怎么样|怎么样了|完成了吗|结束了吗)$/,
    /^(?:当前|现在|刚才|这个|上个)?(?:任务|指令)?(?:执行|处理)(?:到哪|到哪了|得怎么样|情况如何|进度如何)(?:了|呢)?$/,
    /^(?:当前|现在|这个|刚才|上个)?(?:任务|指令)?(?:还)?(?:在)?(?:执行|运行|处理|排队|等待)(?:中)?(?:吗|呢)?$/,
    /^(?:当前|现在)?(?:队列|排队)(?:状态|情况|进度)?(?:怎么样|如何|呢)?$/,
    /^(?:还有|有)?(?:多少个)?(?:任务|指令)(?:在)?(?:执行|运行|处理|排队|等待)(?:中)?(?:吗|呢)?$/,
    /^(?:what(?:is|s))?(?:the)?currenttaskstatus$/,
    /^(?:is)?the(?:current)?task(?:still)?(?:running|queued|waiting)$/
  ]
  return patterns.some((pattern) => pattern.test(text))
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

function normalizeGlobalCodexTask(thread = {}, lifecycle = {}) {
  const cwd = String(thread.cwd || '').trim()
  return {
    threadId: String(thread.id || '').trim(),
    turnId: String(lifecycle?.turnId || '').trim(),
    title: compactText(
      thread.name
        || thread.title
        || thread.preview
        || (cwd ? path.basename(cwd) : '')
        || `Codex ${String(thread.id || '').slice(-8)}`,
      100
    ),
    cwd,
    state: 'running',
    source: 'codex',
    startedAt: toTimestampMs(
      lifecycle?.at || thread.recencyAt || thread.createdAt
    ),
    updatedAt: toTimestampMs(thread.updatedAt || thread.recencyAt),
    threadStatus: String(thread?.status?.type || '').trim(),
    turnStatus: lifecycle?.status === 'running' ? 'inProgress' : ''
  }
}

function selectProjectCandidate(candidates = [], requestedThreadId = '') {
  const requestedId = String(requestedThreadId || '').trim()
  if (requestedId) {
    return candidates.find((item) => item.threadId === requestedId) || null
  }
  const firstCandidate = candidates[0] || null
  if (!firstCandidate) return null
  return candidates.find((item) => (
    item.score === firstCandidate.score
    && item.status === 'running'
  )) || firstCandidate
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
    sessionStateSource = null
  } = {}) {
    this.service = service
    this.now = now
    this.sessionStateSource = sessionStateSource
      || createCodexSessionStateSource({
        safeLog: (...args) => this.service?.safeLog?.(...args),
        safeError: (...args) => this.service?.safeError?.(...args)
      })
  }

  getManagedMainThreadIds() {
    return new Set(
      Array.from(this.service?.sessions?.values?.() || [])
        .map((session) => String(session?.threadId || '').trim())
        .filter(Boolean)
    )
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

  getOpenGitTaskStatus(activeTask = {}) {
    const session = this.getOriginSession(activeTask)
    if (!session) {
      return {
        status: 'session_not_found',
        message: '找不到当前 OpenGit 或飞书会话。'
      }
    }
    const activeTasks = (
      this.service?.getActiveTasksForSession?.(session.id) || []
    ).filter((task) => task?.jobId !== activeTask?.jobId)
    const queuedTasks = Array.from(
      this.service?.sessionQueues?.get?.(session.id) || []
    ).filter((task) => task?.jobId !== activeTask?.jobId)
    const tasks = [
      ...activeTasks.map((task) => ({
        jobId: String(task?.jobId || '').trim(),
        text: compactText(task?.text, 160),
        state: String(task?.projectRoute?.status || 'running').trim(),
        projectRoute: task?.projectRoute
          ? {
              projectQuery: String(
                task.projectRoute.projectQuery || ''
              ).trim(),
              threadId: String(task.projectRoute.threadId || '').trim(),
              title: String(task.projectRoute.title || '').trim(),
              status: String(task.projectRoute.status || '').trim(),
              queued: task.projectRoute.queued === true
            }
          : null,
        createdAt: Number(task?.createdAt) || 0
      })),
      ...queuedTasks.map((task) => ({
        jobId: String(task?.jobId || '').trim(),
        text: compactText(task?.text, 160),
        state: 'queued',
        projectRoute: null,
        createdAt: Number(task?.createdAt) || 0
      }))
    ].sort((left, right) => left.createdAt - right.createdAt)
    return {
      status: tasks.length > 0 ? 'busy' : 'idle',
      activeTaskCount: activeTasks.length,
      queuedTaskCount: queuedTasks.length,
      tasks,
      message: tasks.length > 0
        ? `当前会话有 ${activeTasks.length} 个执行中任务、${queuedTasks.length} 个主会话排队任务。`
        : '当前会话没有其他正在执行或排队中的任务。'
    }
  }

  async listRunningCodexTasks(activeTask = {}) {
    const currentJobId = String(activeTask?.jobId || '').trim()
    const allActiveTasks = Array.from(
      this.service?.activeTasks?.values?.() || []
    ).filter((task) => String(task?.jobId || '').trim() !== currentJobId)
    const allQueuedTasks = Array.from(
      this.service?.sessionQueues?.values?.() || []
    ).flatMap((queue) => Array.from(queue || []))
      .filter((task) => String(task?.jobId || '').trim() !== currentJobId)
    const openGitTasks = [
      ...allActiveTasks.map((task) => {
        const session = this.service?.getSession?.(task?.sessionId)
        const routeStatus = String(
          task?.projectRoute?.status || ''
        ).trim()
        return {
          jobId: String(task?.jobId || '').trim(),
          threadId: String(task?.projectRoute?.threadId || '').trim(),
          title: compactText(
            task?.projectRoute?.title || session?.title || task?.text,
            100
          ),
          text: compactText(task?.text, 160),
          state: routeStatus === 'queued' ? 'queued' : 'running',
          phase: routeStatus || 'running',
          source: 'open_git',
          projectQuery: String(
            task?.projectRoute?.projectQuery || ''
          ).trim(),
          createdAt: Number(task?.createdAt) || 0,
          updatedAt: Number(task?.projectRoute?.updatedAt) || 0
        }
      }),
      ...allQueuedTasks.map((task) => {
        const session = this.service?.getSession?.(task?.sessionId)
        return {
          jobId: String(task?.jobId || '').trim(),
          threadId: '',
          title: compactText(session?.title || task?.text, 100),
          text: compactText(task?.text, 160),
          state: 'queued',
          source: 'open_git',
          projectQuery: '',
          createdAt: Number(task?.createdAt) || 0,
          updatedAt: 0
        }
      })
    ]
    const trackedProjectThreadIds = new Set(
      openGitTasks.map((task) => task.threadId).filter(Boolean)
    )
    const excludedThreadIds = this.getManagedMainThreadIds()
    const currentThreadId = String(activeTask?.threadId || '').trim()
    if (currentThreadId) excludedThreadIds.add(currentThreadId)
    for (const task of allActiveTasks) {
      const threadId = String(task?.threadId || '').trim()
      if (threadId) excludedThreadIds.add(threadId)
    }

    let globalScanError = ''
    const scanErrors = []
    let totalCandidateCount = 0
    let checkedCandidateCount = 0
    let nativeTasks = []
    const [threadListResult, processStateResult] = await Promise.allSettled([
      this.listThreads(),
      this.sessionStateSource.listRunningThreads()
    ])
    const nativeTaskByThreadId = new Map()

    if (threadListResult.status === 'fulfilled') {
      for (const thread of threadListResult.value) {
        const threadId = String(thread?.id || '').trim()
        if (
          !threadId
          || excludedThreadIds.has(threadId)
          || trackedProjectThreadIds.has(threadId)
          || thread?.ephemeral === true
          || String(thread?.parentThreadId || '').trim()
          || String(thread?.status?.type || '') !== 'active'
        ) continue
        nativeTaskByThreadId.set(
          threadId,
          normalizeGlobalCodexTask(thread)
        )
      }
    }

    if (processStateResult.status === 'fulfilled') {
      const snapshot = processStateResult.value || {}
      totalCandidateCount = Number(snapshot.openRolloutCount) || 0
      checkedCandidateCount = Number(snapshot.inspectedThreadCount) || 0
      if (snapshot.available !== true) {
        globalScanError = Array.isArray(snapshot.errors)
          ? snapshot.errors.join('; ')
          : 'Codex process state is unavailable'
      } else {
        scanErrors.push(...(
          Array.isArray(snapshot.errors) ? snapshot.errors : []
        ))
        for (const thread of snapshot.threads || []) {
          const threadId = String(thread?.id || '').trim()
          if (
            !threadId
            || excludedThreadIds.has(threadId)
            || trackedProjectThreadIds.has(threadId)
          ) continue
          nativeTaskByThreadId.set(
            threadId,
            normalizeGlobalCodexTask(thread, thread.lifecycle)
          )
        }
      }
    } else {
      globalScanError = processStateResult.reason?.message
        || String(processStateResult.reason || 'Codex process state is unavailable')
    }
    nativeTasks = Array.from(nativeTaskByThreadId.values())

    const tasks = [...openGitTasks, ...nativeTasks]
      .sort((left, right) => (
        Number(left.createdAt || left.startedAt || 0)
        - Number(right.createdAt || right.startedAt || 0)
      ))
    const runningTaskCount = tasks.filter((task) => task.state !== 'queued').length
    const queuedTaskCount = tasks.filter((task) => task.state === 'queued').length
    const scanIncomplete = Boolean(
      globalScanError || scanErrors.length > 0
    )
    let status = tasks.length > 0 ? 'busy' : 'idle'
    if (scanIncomplete) status = tasks.length > 0 ? 'partial' : 'unavailable'
    let message
    if (status === 'unavailable') {
      message = '全局 Codex 会话状态暂时无法读取，不能据此判断当前没有运行中任务。'
    } else if (status === 'partial') {
      message = `已确认 ${runningTaskCount} 个执行中任务、${queuedTaskCount} 个排队任务；部分全局会话状态读取失败。`
    } else if (tasks.length > 0) {
      message = `当前共有 ${runningTaskCount} 个执行中任务、${queuedTaskCount} 个排队任务。`
    } else {
      message = '当前未发现正在执行或排队中的 Codex 任务。'
    }
    return {
      status,
      runningTaskCount,
      queuedTaskCount,
      openGitTaskCount: openGitTasks.length,
      nativeTaskCount: nativeTasks.length,
      tasks,
      globalScan: {
        totalCandidateCount,
        checkedCandidateCount,
        truncated: false,
        failureCount: scanErrors.length,
        error: globalScanError
      },
      message
    }
  }

  setProjectRouteState(activeTask = {}, changes = {}) {
    if (!activeTask || typeof activeTask !== 'object') return null
    activeTask.projectRoute = {
      ...(activeTask.projectRoute || {}),
      ...changes,
      updatedAt: this.now()
    }
    this.service?.broadcastState?.()
    return activeTask.projectRoute
  }

  notifyProjectTaskQueued({
    activeTask,
    candidate,
    projectQuery,
    queueLength = 0,
    reason = 'project-thread-busy'
  } = {}) {
    if (!activeTask || !candidate?.threadId) return null
    const noticeId = [
      'project-queue',
      String(activeTask.jobId || activeTask.threadId || 'task').trim(),
      String(candidate.threadId).trim()
    ].join(':')
    activeTask.projectQueueNoticeIds ||= new Set()
    if (activeTask.projectQueueNoticeIds.has(noticeId)) return null
    activeTask.projectQueueNoticeIds.add(noticeId)

    const projectTitle = String(
      candidate.title
      || (candidate.cwd ? path.basename(candidate.cwd) : '')
      || projectQuery
      || '目标项目'
    ).trim()
    const text = `项目 ${projectTitle} 的 Codex 会话当前正忙，当前任务已排队，会在前序任务完成后自动继续。`
    this.setProjectRouteState(activeTask, {
      projectQuery: String(projectQuery || '').trim(),
      threadId: String(candidate.threadId || '').trim(),
      title: projectTitle,
      status: 'queued',
      queued: true,
      queueLength: Number(queueLength) || 0,
      queueReason: String(reason || '').trim()
    })
    const message = {
      id: noticeId,
      role: 'assistant',
      text,
      status: 'completed',
      source: 'codex',
      createdAt: this.now()
    }
    this.service?.broadcast?.('message', {
      sessionId: activeTask.sessionId,
      message
    })
    if (activeTask.source === 'feishu') {
      this.service?.appendWorkerHistory?.(activeTask.sessionId, [message])
    }
    if (typeof activeTask.onAgentMessage === 'function') {
      try {
        Promise.resolve(activeTask.onAgentMessage({
          id: noticeId,
          text
        })).catch((error) => {
          this.service?.safeError?.(
            '[Codex Project Router] 排队提示回传失败:',
            error?.message || String(error)
          )
        })
      } catch (error) {
        this.service?.safeError?.(
          '[Codex Project Router] 排队提示回传失败:',
          error?.message || String(error)
        )
      }
    }
    return message
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
    const candidate = selectProjectCandidate(candidates, requestedThreadId)
    if (requestedThreadId && !candidate) {
      return {
        status: 'session_not_found',
        projectQuery: target.projectQuery,
        message: '指定会话不属于该项目、已归档或已删除，请重新查询。'
      }
    }

    if (candidate) {
      this.setProjectRouteState(activeTask, {
        projectQuery: target.projectQuery,
        threadId: candidate.threadId,
        title: candidate.title,
        status: candidate.status === 'running' ? 'queued' : 'dispatching',
        queued: candidate.status === 'running'
      })
      let result
      try {
        result = await this.service.enqueueCodexProjectTask({
          threadId: candidate.threadId,
          cwd: candidate.cwd,
          task: normalizedTask,
          knownActive: candidate.status === 'running',
          onQueued: (details = {}) => this.notifyProjectTaskQueued({
            activeTask,
            candidate,
            projectQuery: target.projectQuery,
            queueLength: details.queueLength,
            reason: details.reason
          }),
          onStarted: () => this.setProjectRouteState(activeTask, {
            status: 'running'
          })
        })
        this.setProjectRouteState(activeTask, {
          status: 'completed',
          queued: result.queuedForActiveThread === true
        })
      } catch (error) {
        this.setProjectRouteState(activeTask, {
          status: 'error',
          error: error?.message || String(error)
        })
        throw error
      }
      return {
        status: 'completed',
        usedProjectBinding: target.usedProjectBinding,
        projectBinding: target.projectBinding,
        reusedExistingSession: true,
        queuedForActiveThread: result.queuedForActiveThread === true,
        selectedSession: candidate,
        result
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
    this.setProjectRouteState(activeTask, {
      projectQuery: target.projectQuery,
      threadId: '',
      title: path.basename(projectCwd),
      status: 'running',
      queued: false
    })
    let result
    try {
      result = await this.service.executeCodexProjectTask({
        cwd: projectCwd,
        task: normalizedTask,
        createNew: true
      })
      this.setProjectRouteState(activeTask, {
        threadId: String(result?.threadId || '').trim(),
        status: 'completed'
      })
    } catch (error) {
      this.setProjectRouteState(activeTask, {
        status: 'error',
        error: error?.message || String(error)
      })
      throw error
    }
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
      if (tool === 'get_open_git_task_status') {
        return toolResponse(this.getOpenGitTaskStatus(activeTask))
      }
      if (tool === 'list_running_codex_tasks') {
        return toolResponse(await this.listRunningCodexTasks(activeTask))
      }
      if (tool === 'restart_open_git') {
        return toolResponse(
          this.service.requestApplicationRestart(activeTask)
        )
      }
      if (tool === 'dispatch_codex_project_task') {
        if (isCoordinatorStatusQuery(activeTask.text)) {
          const globalQuery = /(?:所有|全部|全局|有哪些|哪些).*?(?:codex)?(?:任务|会话)|(?:正在|进行中|执行中|运行中).*?(?:codex)?(?:任务|会话)/i.test(
            String(activeTask.text || '')
          )
          return toolResponse({
            status: 'coordinator_status_query',
            message: globalQuery
              ? '这是全局 Codex 任务状态查询，不应分发到项目会话；请调用 list_running_codex_tasks。'
              : '这是当前 OpenGit 会话的任务状态查询，不应分发到项目会话；请调用 get_open_git_task_status。'
          })
        }
        return toolResponse(await this.dispatchProjectTask({
          projectQuery: args.projectQuery,
          task: args.task,
          cwd: args.cwd,
          threadId: args.threadId,
          activeTask
        }))
      }
      return toolResponse(`OpenGit 不支持动态工具：${tool}`, false)
    } catch (error) {
      return toolResponse(error?.message || String(error), false)
    }
  }

  cleanup() {}
}

module.exports = {
  CodexProjectSessionRouter,
  CODEX_PROJECT_DYNAMIC_TOOLS,
  __testables: {
    compactText,
    normalizeProjectQuery,
    normalizeIntentText,
    isCoordinatorStatusQuery,
    normalizeLimit,
    normalizeThreadStatus,
    scoreProjectThread,
    normalizeCandidate,
    normalizeGlobalCodexTask,
    selectProjectCandidate,
    resolveExistingDirectory,
    toolResponse
  }
}
