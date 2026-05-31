import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const stateSourcePath = require.resolve('../electron/ipc/codex-session-state-source.js')
const monitorPath = require.resolve('../electron/ipc/codex-session-monitor.js')
const originalStateSourceExports = require(stateSourcePath)
const originalStateSourceModule = require.cache[stateSourcePath]

const PROJECT_PATH = '/tmp/opengit-codex-project'
const THREAD_ID = '019e4f07-0fb7-7083-96ca-f4e2155ebed5'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runCase({ expectedStatus, signalAt, reason }) {
  require.cache[stateSourcePath].exports = {
    createCodexSessionStateSource() {
      return {
        listActiveThreads: async () => [],
        getThread: async (threadId) => {
          if (threadId !== THREAD_ID) return null
          return {
            id: THREAD_ID,
            cwd: PROJECT_PATH,
            createdAt: signalAt - 5_000,
            updatedAt: signalAt,
            rolloutPath: '/tmp/fake-rollout.jsonl'
          }
        },
        resolveThreadStatus: async ({ threadId, rolloutPath }) => {
          if (threadId !== THREAD_ID || rolloutPath !== '/tmp/fake-rollout.jsonl') return null
          return {
            at: signalAt,
            status: expectedStatus,
            reason
          }
        }
      }
    }
  }

  delete require.cache[monitorPath]
  const { createCodexSessionMonitor } = require(monitorPath)
  const monitor = createCodexSessionMonitor()

  try {
    monitor.registerTerminal({
      terminalId: 'terminal-1',
      projectPath: PROJECT_PATH,
      mode: 'classic'
    })
    monitor.handleForegroundProcess('terminal-1', '/usr/local/bin/codex')
    monitor.handleTerminalOutput('terminal-1', [
      'OpenAI Codex (v0.135.0-alpha.1)',
      `Directory: ${PROJECT_PATH}`,
      `Session: ${THREAD_ID}`
    ].join('\n'))

    await wait(1700)

    const snapshot = monitor.getTerminalSnapshot('terminal-1')
    assert.equal(snapshot?.boundThreadId, THREAD_ID, 'status output should bind the visible terminal to the reported thread id')
    assert.equal(snapshot?.status, expectedStatus, 'thread status should still come from the resolved thread state')
  } finally {
    monitor.clear()
    delete require.cache[monitorPath]
    require.cache[stateSourcePath] = originalStateSourceModule
    require.cache[stateSourcePath].exports = originalStateSourceExports
  }
}

await runCase({
  expectedStatus: 'ended',
  signalAt: Date.now() - 10_000,
  reason: 'test.ended'
})

await runCase({
  expectedStatus: 'running',
  signalAt: Date.now() - 1_000,
  reason: 'test.running'
})

console.log('codex session monitor status snapshot assertions passed')
