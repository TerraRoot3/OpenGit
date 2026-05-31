import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const stateSourcePath = require.resolve('../electron/ipc/codex-session-state-source.js')
const monitorPath = require.resolve('../electron/ipc/codex-session-monitor.js')
const originalStateSourceExports = require(stateSourcePath)
const originalStateSourceModule = require.cache[stateSourcePath]

const PROJECT_PATH = '/tmp/opengit-codex-project'
const THREAD_ID = 'thread-status-command'
const ENDED_AT = Date.now() - 10_000

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  require.cache[stateSourcePath].exports = {
    createCodexSessionStateSource() {
      return {
        listActiveThreads: async () => [{
          id: THREAD_ID,
          cwd: PROJECT_PATH,
          createdAt: ENDED_AT - 5_000,
          updatedAt: ENDED_AT,
          rolloutPath: ''
        }],
        resolveThreadStatus: async () => ({
          at: ENDED_AT,
          status: 'ended',
          reason: 'test.ended'
        })
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

    await wait(1700)

    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.status,
      'ended',
      'initial thread signal should settle the terminal into ended'
    )
    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.lastSignalAt,
      ENDED_AT,
      'initial thread signal timestamp should be tracked from the thread state source'
    )

    monitor.handleTerminalInput('terminal-1', '/status\r')

    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.status,
      'ended',
      'status-only slash commands should not optimistically move the terminal into running'
    )
    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.lastSignalAt,
      ENDED_AT,
      'status-only slash commands should not overwrite the last thread signal timestamp'
    )

    monitor.handleTerminalInput('terminal-1', 'hello\r')

    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.status,
      'running',
      'non-slash input may optimistically move the terminal into running'
    )
    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.lastSignalAt,
      ENDED_AT,
      'optimistic running transitions should not overwrite the last thread signal timestamp'
    )

    await wait(1700)

    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.status,
      'ended',
      'polling should reconcile optimistic running transitions back to the last ended thread signal'
    )
    assert.equal(
      monitor.getTerminalSnapshot('terminal-1')?.lastSignalAt,
      ENDED_AT,
      'polling should preserve the last thread-derived signal timestamp when no newer signal exists'
    )
  } finally {
    monitor.clear()
    delete require.cache[monitorPath]
    require.cache[stateSourcePath] = originalStateSourceModule
    require.cache[stateSourcePath].exports = originalStateSourceExports
  }
}

await main()
console.log('codex session monitor status command assertions passed')
