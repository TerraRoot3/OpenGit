import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerScmHandlers } = require('../electron/ipc/scm.js')

const handlers = new Map()
const commandCalls = []
const fetchCalls = []
let gitlabProjectLookupCount = 0

const workflowRun = {
  id: 17345678901,
  run_number: 42,
  run_attempt: 2,
  status: 'completed',
  conclusion: 'success',
  head_branch: 'v1.5.2',
  head_sha: '0123456789abcdef',
  event: 'push',
  html_url: 'https://github.com/TerraRoot3/OpenGit/actions/runs/17345678901',
  created_at: '2026-07-24T08:00:00Z',
  updated_at: '2026-07-24T08:01:00Z',
  run_started_at: '2026-07-24T08:00:05Z',
  name: 'Release',
  display_title: 'Release v1.5.2'
}

const githubJob = {
  id: 987654321,
  name: 'build-macos',
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-07-24T08:00:10Z',
  completed_at: '2026-07-24T08:00:55Z',
  html_url: 'https://github.com/TerraRoot3/OpenGit/actions/runs/17345678901/job/987654321',
  runner_name: 'GitHub Actions 1'
}

const createResponse = (payload, status = 200, statusText = 'OK') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
})

const executeGitCommand = async (command, cwd) => {
  commandCalls.push({ command, cwd })
  if (command[0] === 'git' && command.slice(1).join(' ') === 'remote get-url origin') {
    return {
      success: true,
      stdout: 'ssh://git@github.com/TerraRoot3/OpenGit.git\n',
      stderr: ''
    }
  }
  if (String(command[0]).endsWith('/gh') && command.slice(1).join(' ') === 'auth token --hostname github.com') {
    return {
      success: true,
      stdout: 'gh-test-token\n',
      stderr: ''
    }
  }
  return {
    success: false,
    stdout: '',
    stderr: `unexpected command: ${command.join(' ')}`
  }
}

const fakeFetch = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), headers: options.headers || {} })
  if (String(url).endsWith('/actions/runs?per_page=8')) {
    return createResponse({ workflow_runs: [workflowRun] })
  }
  if (String(url).endsWith('/actions/runs/17345678901/jobs?per_page=100')) {
    return createResponse({ jobs: [githubJob] })
  }
  if (String(url).endsWith('/actions/runs/17345678901')) {
    return createResponse(workflowRun)
  }
  return createResponse({ message: 'Not Found' }, 404, 'Not Found')
}

registerScmHandlers({
  ipcMain: {
    handle: (channel, handler) => handlers.set(channel, handler)
  },
  BrowserWindow: {
    getAllWindows: () => []
  },
  fs: {
    promises: {},
    existsSync: (candidate) => candidate === '/opt/homebrew/bin/gh'
  },
  path,
  store: {
    get: (_key, fallback) => fallback
  },
  fetch: fakeFetch,
  executeGitCommand,
  executeGitCommandWithOutput: async () => ({ success: false }),
  checkAndFixRemoteUrl: async () => ({ success: true }),
  getGitlabProjectId: async () => {
    gitlabProjectLookupCount += 1
    return { success: false }
  },
  safeLog: () => {},
  safeError: () => {}
})

const projectPipelines = handlers.get('project-pipelines')
const pipelineDetail = handlers.get('pipeline-detail')
assert.equal(typeof projectPipelines, 'function')
assert.equal(typeof pipelineDetail, 'function')

const listResult = await projectPipelines(null, {
  projectPath: '/tmp/OpenGit',
  limit: 8
})

assert.equal(listResult.success, true)
assert.equal(listResult.data.provider, 'github')
assert.equal(listResult.data.providerLabel, 'GitHub Actions')
assert.equal(listResult.data.authSource, 'gh')
assert.equal(listResult.data.recentPipelines.length, 1)
assert.equal(listResult.data.activePipelines.length, 0)

const run = listResult.data.recentPipelines[0]
assert.equal(run.id, 17345678901)
assert.equal(run.iid, 42)
assert.equal(run.runNumber, 42)
assert.equal(run.runAttempt, 2)
assert.equal(run.workflowName, 'Release')
assert.equal(run.ref, 'v1.5.2')
assert.equal(run.isTag, true)
assert.equal(run.status, 'success')

assert.equal(
  commandCalls.some(({ command }) => command[0] === '/opt/homebrew/bin/gh'),
  true,
  'GitHub Actions should reuse the system gh authentication when no saved token exists'
)
assert.equal(
  gitlabProjectLookupCount,
  0,
  'a GitHub remote must not enter the GitLab project resolver'
)
assert.equal(
  fetchCalls[0].url,
  'https://api.github.com/repos/TerraRoot3/OpenGit/actions/runs?per_page=8'
)
assert.equal(fetchCalls[0].headers.Authorization, 'Bearer gh-test-token')
assert.equal(JSON.stringify(listResult).includes('gh-test-token'), false)

const detailResult = await pipelineDetail(null, {
  projectPath: '/tmp/OpenGit',
  pipelineId: 17345678901
})

assert.equal(detailResult.success, true)
assert.equal(detailResult.data.authSource, 'gh')
assert.equal(detailResult.data.pipeline.runNumber, 42)
assert.equal(detailResult.data.jobs.length, 1)
assert.equal(detailResult.data.jobs[0].name, 'build-macos')
assert.equal(detailResult.data.jobs[0].status, 'success')
assert.equal(detailResult.data.jobs[0].duration, 45)
assert.equal(detailResult.data.jobs[0].webUrl, githubJob.html_url)
assert.equal(detailResult.data.stages[0].stage, 'Jobs')
assert.equal(JSON.stringify(detailResult).includes('gh-test-token'), false)
assert.equal(
  commandCalls.filter(({ command }) => String(command[0]).endsWith('/gh')).length,
  1,
  'the gh token should be cached across list and detail requests'
)
assert.equal(
  fetchCalls.slice(1).every(({ headers }) => headers.Authorization === 'Bearer gh-test-token'),
  true
)

console.log('project pipelines assertions passed')
