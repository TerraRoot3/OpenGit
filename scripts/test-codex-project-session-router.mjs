import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  CodexProjectSessionRouter,
  CODEX_PROJECT_DYNAMIC_TOOLS,
  __testables
} = require('../electron/ipc/codex-project-session-router.js')

assert.deepEqual(
  CODEX_PROJECT_DYNAMIC_TOOLS.map((tool) => tool.name),
  [
    'find_codex_project_sessions',
    'bind_codex_project',
    'get_codex_project_binding',
    'unbind_codex_project',
    'get_open_git_task_status',
    'list_running_codex_tasks',
    'restart_open_git',
    'dispatch_codex_project_task'
  ]
)

for (const text of [
  '当前任务状态',
  '刚才任务执行到哪了？',
  '这个任务还在排队吗',
  'api-go 当前任务进展怎么样',
  '看下所有进行中的codex任务',
  '有哪些正在运行的 Codex 会话？',
  '现在还有什么在跑',
  '现在有什么任务在跑',
  '还有哪些任务在执行',
  '任务呢',
  '刚才那个呢',
  'current task status'
]) {
  assert.equal(
    __testables.isCoordinatorStatusQuery(text),
    true,
    `coordinator status query should stay in the main session: ${text}`
  )
}
for (const text of [
  '检查 api-go 当前代码状态并修复测试',
  '查看仓库日志并分析报错',
  '继续处理绑定项目里的构建失败',
  '修改代码里的任务状态字段'
]) {
  assert.equal(
    __testables.isCoordinatorStatusQuery(text),
    false,
    `project work should remain dispatchable: ${text}`
  )
}

const mainThread = {
  id: 'thread-main',
  name: 'OpenGit 飞书主会话',
  preview: '协调任务',
  cwd: '/tmp/OpenGit',
  ephemeral: false,
  parentThreadId: null,
  recencyAt: 500,
  status: { type: 'idle' },
  source: 'appServer'
}
const runningApiThread = {
  id: 'thread-api-running',
  name: 'api-go 接口修复',
  preview: '检查支付接口',
  cwd: '/tmp/api-go',
  ephemeral: false,
  parentThreadId: null,
  recencyAt: 400,
  status: {
    type: 'active',
    activeFlags: []
  },
  source: 'vscode'
}
const idleApiThread = {
  id: 'thread-api-idle',
  name: 'api-go 旧任务',
  preview: '历史任务',
  cwd: '/tmp/api-go',
  ephemeral: false,
  parentThreadId: null,
  recencyAt: 300,
  status: { type: 'notLoaded' },
  source: 'cli'
}
const subagentThread = {
  id: 'thread-api-subagent',
  name: 'api-go 子任务',
  preview: '子任务',
  cwd: '/tmp/api-go',
  ephemeral: false,
  parentThreadId: 'thread-api-running',
  recencyAt: 450,
  status: { type: 'idle' },
  source: { subAgent: { thread_spawn: true } }
}
const pophieThread = {
  id: 'thread-pophie',
  name: 'Pophie 页面',
  preview: '调整 UI',
  cwd: '/tmp/pophie',
  ephemeral: false,
  parentThreadId: null,
  recencyAt: 200,
  status: { type: 'idle' },
  source: 'vscode'
}

const rpcCalls = []
const executions = []
const restartRequests = []
const queueNotices = []
let listedThreads = [
  mainThread,
  runningApiThread,
  idleApiThread,
  subagentThread,
  pophieThread
]
const service = {
  sessions: new Map([
    ['feishu:work:oc_api', {
      id: 'feishu:work:oc_api',
      threadId: 'thread-main'
    }]
  ]),
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null
  },
  activeTasksByThreadId: new Map(),
  requestApplicationRestart: (activeTask) => {
    restartRequests.push(activeTask)
    return {
      status: 'restart_pending',
      message: 'OpenGit 将在本条回复完成后重启。'
    }
  },
  request: async (method, params) => {
    rpcCalls.push({ method, params })
    assert.equal(method, 'thread/list')
    return {
      data: listedThreads,
      nextCursor: null
    }
  },
  enqueueCodexProjectTask: async (payload) => {
    executions.push({
      threadId: payload.threadId,
      cwd: payload.cwd,
      task: payload.task
    })
    if (payload.knownActive) {
      await payload.onQueued?.({
        threadId: payload.threadId,
        reason: 'known-active-thread',
        queueLength: 1
      })
    }
    await payload.onStarted?.({ threadId: payload.threadId })
    return {
      threadId: payload.threadId,
      turnId: `turn-${executions.length}`,
      status: 'completed',
      text: `已执行：${payload.task}`,
      messages: [`已执行：${payload.task}`],
      queuedForActiveThread: (
        listedThreads.find((thread) => thread.id === payload.threadId)
          ?.status?.type === 'active'
      )
    }
  },
  executeCodexProjectTask: async (payload) => {
    executions.push(payload)
    return {
      threadId: payload.threadId || `new:${path.basename(payload.cwd)}`,
      turnId: `turn-${executions.length}`,
      status: 'completed',
      text: `已执行：${payload.task}`,
      messages: [`已执行：${payload.task}`],
      createdNewSession: payload.createNew === true
    }
  }
}
let now = 1_000_000
const router = new CodexProjectSessionRouter({
  service,
  now: () => now
})
const activeTask = {
  jobId: 'job-main-route',
  sessionId: 'feishu:work:oc_api',
  threadId: 'thread-main',
  text: '看下 api-go，然后继续修复支付接口',
  source: 'feishu',
  onAgentMessage: async (message) => {
    queueNotices.push(message)
  },
  metadata: {
    connectionId: 'work',
    chatId: 'oc_api'
  }
}
service.activeTasksByThreadId.set('thread-main', activeTask)

const apiCandidates = await router.findProjectSessions({
  projectQuery: 'api-go'
})
assert.deepEqual(
  apiCandidates.map((candidate) => candidate.threadId),
  ['thread-api-running', 'thread-api-idle'],
  'main sessions and subagents must not be selected as project sessions'
)
assert.equal(apiCandidates[0].status, 'running')
assert.equal(rpcCalls[0].params.archived, false)
assert.equal(rpcCalls[0].params.useStateDbOnly, true)
assert.deepEqual(
  rpcCalls[0].params.sourceKinds,
  ['cli', 'vscode', 'exec', 'appServer']
)

idleApiThread.recencyAt = 600
const queued = await router.dispatchProjectTask({
  projectQuery: 'api-go',
  task: '继续修复支付接口',
  activeTask
})
assert.equal(queued.status, 'completed')
assert.equal(queued.reusedExistingSession, true)
assert.equal(queued.queuedForActiveThread, true)
assert.equal(queueNotices.length, 1)
assert.match(queueNotices[0].text, /当前任务已排队/)
assert.deepEqual(executions[0], {
  threadId: 'thread-api-running',
  cwd: '/tmp/api-go',
  task: '继续修复支付接口'
})

idleApiThread.recencyAt = 300
runningApiThread.status = { type: 'idle' }
activeTask.text = '继续修复测试'
const reused = await router.dispatchProjectTask({
  projectQuery: 'api-go',
  task: '继续修复测试',
  activeTask
})
assert.equal(reused.status, 'completed')
assert.equal(reused.reusedExistingSession, true)
assert.deepEqual(executions[1], {
  threadId: 'thread-api-running',
  cwd: '/tmp/api-go',
  task: '继续修复测试'
})

listedThreads = []
const projectDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'opengit-project-router-')
)
try {
  const created = await router.dispatchProjectTask({
    projectQuery: 'brand-new-project',
    task: '初始化项目',
    cwd: projectDir,
    activeTask
  })
  assert.equal(created.status, 'completed')
  assert.equal(created.createdNewSession, true)
  assert.deepEqual(executions[2], {
    cwd: projectDir,
    task: '初始化项目',
    createNew: true
  })
} finally {
  fs.rmSync(projectDir, { recursive: true, force: true })
}

const pathRequired = await router.dispatchProjectTask({
  projectQuery: 'missing-project',
  task: '检查项目',
  activeTask
})
assert.equal(pathRequired.status, 'project_path_required')
assert.equal(executions.length, 3)

listedThreads = [idleApiThread]
activeTask.text = '只查询会话'
const toolResult = await router.handleToolCall({
  threadId: 'thread-main',
  tool: 'find_codex_project_sessions',
  arguments: {
    projectQuery: 'api-go'
  }
})
assert.equal(toolResult.success, true)
assert.equal(
  JSON.parse(toolResult.contentItems[0].text).sessions[0].threadId,
  'thread-api-idle'
)

activeTask.text = '当前任务状态'
const executionCountBeforeStatusQuery = executions.length
const blockedStatusDispatch = await router.handleToolCall({
  threadId: 'thread-main',
  tool: 'dispatch_codex_project_task',
  arguments: {
    projectQuery: 'api-go',
    task: '查询当前任务状态'
  }
})
assert.equal(blockedStatusDispatch.success, true)
assert.equal(
  JSON.parse(blockedStatusDispatch.contentItems[0].text).status,
  'coordinator_status_query'
)
assert.equal(
  executions.length,
  executionCountBeforeStatusQuery,
  'a current-task status query must never enter a project session'
)
service.getActiveTasksForSession = () => [
  activeTask,
  {
    jobId: 'job-project-waiting',
    sessionId: activeTask.sessionId,
    text: '继续修复 api-go 支付接口',
    createdAt: 900,
    projectRoute: {
      projectQuery: 'api-go',
      threadId: 'thread-api-running',
      title: 'api-go 接口修复',
      status: 'queued',
      queued: true
    }
  }
]
const coordinatorStatusResult = await router.handleToolCall({
  threadId: 'thread-main',
  tool: 'get_open_git_task_status',
  arguments: {}
})
assert.equal(coordinatorStatusResult.success, true)
assert.equal(
  JSON.parse(coordinatorStatusResult.contentItems[0].text).status,
  'busy'
)
assert.equal(
  JSON.parse(coordinatorStatusResult.contentItems[0].text)
    .tasks[0].projectRoute.status,
  'queued'
)

const globalStatusCalls = []
let globalThreadListCount = 0
const globalCallerTask = {
  jobId: 'job-global-query',
  sessionId: 'feishu:work:oc_global',
  threadId: 'thread-global-worker',
  text: '看下所有进行中的 Codex 任务'
}
const globalService = {
  sessions: new Map([
    ['feishu:work:oc_global', {
      id: 'feishu:work:oc_global',
      threadId: 'thread-global-main',
      title: '全局状态查询'
    }],
    ['feishu:work:oc_project', {
      id: 'feishu:work:oc_project',
      threadId: 'thread-project-main',
      title: '项目群'
    }]
  ]),
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null
  },
  activeTasks: new Map([
    [globalCallerTask.jobId, globalCallerTask],
    ['job-open-git-project', {
      jobId: 'job-open-git-project',
      sessionId: 'feishu:work:oc_project',
      threadId: 'thread-project-worker',
      text: '继续修复 api-go',
      createdAt: 700,
      projectRoute: {
        projectQuery: 'api-go',
        threadId: 'thread-project-target',
        title: 'api-go 修复',
        status: 'running',
        updatedAt: 900
      }
    }]
  ]),
  activeTasksByThreadId: new Map([
    [globalCallerTask.threadId, globalCallerTask]
  ]),
  sessionQueues: new Map([
    ['feishu:work:oc_project', [{
      jobId: 'job-open-git-queued',
      sessionId: 'feishu:work:oc_project',
      text: '随后执行回归测试',
      createdAt: 800
    }]]
  ]),
  request: async (method, params) => {
    globalStatusCalls.push({ method, params })
    if (method === 'thread/list') {
      globalThreadListCount += 1
      return {
        data: [
          {
            id: 'thread-global-main',
            name: 'OpenGit 主会话',
            cwd: '/tmp',
            updatedAt: 999,
            recencyAt: 990,
            status: { type: 'notLoaded' }
          },
          {
            id: 'thread-codex-running',
            name: 'content_studio',
            cwd: '/tmp/content_studio',
            updatedAt: globalThreadListCount > 1 ? 997 : 995,
            recencyAt: 900,
            status: { type: 'notLoaded' }
          },
          {
            id: 'thread-codex-stopped',
            name: 'manually stopped',
            cwd: '/tmp/stopped',
            updatedAt: 993,
            recencyAt: 919,
            status: { type: 'notLoaded' }
          },
          {
            id: 'thread-codex-completed',
            name: 'recently completed',
            cwd: '/tmp/completed',
            updatedAt: 994,
            recencyAt: 920,
            status: { type: 'notLoaded' }
          },
          {
            id: 'thread-codex-stale',
            name: 'stale interrupted',
            cwd: '/tmp/stale',
            updatedAt: 100,
            recencyAt: 90,
            status: { type: 'notLoaded' }
          },
          {
            id: 'thread-codex-subagent',
            name: 'subagent',
            cwd: '/tmp/content_studio',
            updatedAt: 996,
            recencyAt: 910,
            parentThreadId: 'thread-codex-running',
            status: { type: 'notLoaded' }
          }
        ],
        nextCursor: null
      }
    }
    if (method === 'thread/turns/list') {
      if (params.threadId === 'thread-codex-running') {
        return {
          data: [{
            id: 'turn-codex-running',
            status: 'interrupted',
            startedAt: 900,
            completedAt: null
          }]
        }
      }
      if (params.threadId === 'thread-codex-stopped') {
        return {
          data: [{
            id: 'turn-codex-stopped',
            status: 'interrupted',
            startedAt: 919,
            completedAt: null
          }]
        }
      }
      return {
        data: [{
          id: 'turn-codex-completed',
          status: 'completed',
          startedAt: 920,
          completedAt: 994
        }]
      }
    }
    throw new Error(`unexpected method: ${method}`)
  }
}
const globalRouter = new CodexProjectSessionRouter({
  service: globalService,
  now: () => 1_000_000,
  globalTaskConfirmationDelayMs: 0
})
const globalStatusResult = await globalRouter.handleToolCall({
  threadId: globalCallerTask.threadId,
  tool: 'list_running_codex_tasks',
  arguments: {}
})
assert.equal(globalStatusResult.success, true)
const globalStatus = JSON.parse(globalStatusResult.contentItems[0].text)
assert.equal(globalStatus.status, 'busy')
assert.equal(globalStatus.runningTaskCount, 2)
assert.equal(globalStatus.queuedTaskCount, 1)
assert.equal(globalStatus.openGitTaskCount, 2)
assert.equal(globalStatus.nativeTaskCount, 1)
assert.deepEqual(
  globalStatus.tasks.map((task) => task.title),
  ['api-go 修复', '项目群', 'content_studio']
)
assert.equal(
  globalStatusCalls.some(({ method, params }) => (
    method === 'thread/turns/list'
    && params.threadId === 'thread-codex-running'
    && params.limit === 1
  )),
  true,
  'global status should inspect the latest native turn'
)
assert.equal(
  globalStatusCalls.some(({ method, params }) => (
    method === 'thread/turns/list'
    && params.threadId === 'thread-codex-stale'
  )),
  false,
  'stale interrupted sessions must not be reported as running'
)
assert.equal(
  globalStatus.tasks.some((task) => task.threadId === 'thread-codex-stopped'),
  false,
  'an interrupted turn without a continuing activity heartbeat must not be reported as running'
)

const truncatedThreads = Array.from({ length: 25 }, (_, index) => ({
  id: `thread-truncated-${index}`,
  name: `running ${index}`,
  cwd: `/tmp/running-${index}`,
  updatedAt: 995 - index,
  recencyAt: 995 - index,
  status: { type: 'active' }
}))
const truncatedRouter = new CodexProjectSessionRouter({
  service: {
    sessions: new Map(),
    activeTasks: new Map([[globalCallerTask.jobId, globalCallerTask]]),
    sessionQueues: new Map(),
    getSession: () => null,
    request: async (method) => {
      if (method === 'thread/list') {
        return { data: truncatedThreads, nextCursor: null }
      }
      if (method === 'thread/turns/list') return { data: [] }
      throw new Error(`unexpected method: ${method}`)
    }
  },
  now: () => 1_000_000,
  globalTaskConfirmationDelayMs: 0
})
const truncatedStatus = await truncatedRouter.listRunningCodexTasks(
  globalCallerTask
)
assert.equal(truncatedStatus.status, 'partial')
assert.equal(truncatedStatus.globalScan.truncated, true)
assert.equal(truncatedStatus.globalScan.totalCandidateCount, 25)
assert.equal(truncatedStatus.globalScan.checkedCandidateCount, 24)
assert.match(truncatedStatus.message, /只检查了 24 个/)

const unavailableRouter = new CodexProjectSessionRouter({
  service: {
    sessions: new Map(),
    activeTasks: new Map([[globalCallerTask.jobId, globalCallerTask]]),
    sessionQueues: new Map(),
    getSession: () => null,
    request: async () => {
      throw new Error('native status unavailable')
    }
  },
  now: () => 1_000_000
})
const unavailableStatus = await unavailableRouter.listRunningCodexTasks(
  globalCallerTask
)
assert.equal(unavailableStatus.status, 'unavailable')
assert.match(unavailableStatus.message, /不能据此判断/)

const restartToolResult = await router.handleToolCall({
  threadId: 'thread-main',
  tool: 'restart_open_git',
  arguments: {}
})
assert.equal(restartToolResult.success, true)
assert.equal(
  JSON.parse(restartToolResult.contentItems[0].text).status,
  'restart_pending'
)
assert.deepEqual(restartRequests, [activeTask])

router.cleanup()
console.log('codex project session router assertions passed')
