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
    'restart_open_git',
    'dispatch_codex_project_task'
  ]
)

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
    executions.push(payload)
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
  sessionId: 'feishu:work:oc_api',
  threadId: 'thread-main',
  text: '看下 api-go，然后继续修复支付接口',
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
