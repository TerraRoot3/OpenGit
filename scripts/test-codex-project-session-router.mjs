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
    'dispatch_codex_project_task',
    'start_new_codex_project_task'
  ]
)
assert.equal(__testables.isExplicitNewTaskConfirmation('新开一个任务'), true)
assert.equal(__testables.isExplicitNewTaskConfirmation('那就新开吧'), true)
assert.equal(__testables.isExplicitNewTaskConfirmation('是的，帮我新开一个任务'), true)
assert.equal(__testables.isExplicitNewTaskConfirmation('不要新开'), false)
assert.equal(__testables.isExplicitNewTaskConfirmation('继续'), false)
assert.equal(__testables.isExplicitNewTaskConfirmation('继续执行原任务'), false)

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
  request: async (method, params) => {
    rpcCalls.push({ method, params })
    assert.equal(method, 'thread/list')
    return {
      data: listedThreads,
      nextCursor: null
    }
  },
  executeCodexProjectTask: async (payload) => {
    executions.push(payload)
    return {
      threadId: payload.threadId || `new:${path.basename(payload.cwd)}`,
      turnId: `turn-${executions.length}`,
      status: 'completed',
      text: `已执行：${payload.task}`,
      messages: [`已执行：${payload.task}`]
    }
  }
}
let now = 1_000_000
const router = new CodexProjectSessionRouter({
  service,
  now: () => now,
  confirmationTtlMs: 60 * 1000
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

const blocked = await router.dispatchProjectTask({
  projectQuery: 'api-go',
  task: '继续修复支付接口',
  activeTask
})
assert.equal(blocked.status, 'confirmation_required')
assert.match(blocked.question, /正在执行/)
assert.equal(executions.length, 0)

activeTask.text = '继续'
const notConfirmed = await router.startConfirmedNewTask({
  confirmationToken: blocked.confirmationToken,
  activeTask
})
assert.equal(notConfirmed.status, 'explicit_confirmation_required')
assert.equal(executions.length, 0)

const otherTask = {
  ...activeTask,
  text: '新开任务',
  metadata: {
    connectionId: 'personal',
    chatId: 'oc_api'
  }
}
const wrongOrigin = await router.startConfirmedNewTask({
  confirmationToken: blocked.confirmationToken,
  activeTask: otherTask
})
assert.equal(wrongOrigin.status, 'confirmation_origin_mismatch')
assert.equal(executions.length, 0)

activeTask.text = '新开一个任务'
const confirmed = await router.startConfirmedNewTask({
  confirmationToken: blocked.confirmationToken,
  activeTask
})
assert.equal(confirmed.status, 'completed')
assert.equal(confirmed.createdNewSession, true)
assert.deepEqual(executions[0], {
  cwd: '/tmp/api-go',
  task: '继续修复支付接口',
  createNew: true
})

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
  task: '继续修复测试',
  createNew: false
})

runningApiThread.status = { type: 'active', activeFlags: [] }
const expiring = await router.dispatchProjectTask({
  projectQuery: 'api-go',
  task: '检查超时确认',
  activeTask
})
now += 61 * 1000
activeTask.text = '新开任务'
const expired = await router.startConfirmedNewTask({
  confirmationToken: expiring.confirmationToken,
  activeTask
})
assert.equal(expired.status, 'confirmation_expired')
assert.equal(executions.length, 2)

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

router.cleanup()
console.log('codex project session router assertions passed')
