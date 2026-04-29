const assert = require('assert')
const { getDefaultMcpConfig, saveMcpConfig } = require('../electron/mcp/config')
const { createTerminalBufferStore } = require('../electron/mcp/services/terminalBuffers')
const { createTerminalsService } = require('../electron/mcp/services/terminals')
const { createRemotesService } = require('../electron/mcp/services/remotes')

async function main() {
  const defaults = getDefaultMcpConfig()
  assert.strictEqual(defaults.capabilities.terminalsWrite, false, 'terminalsWrite default should be false')
  assert.strictEqual(defaults.capabilities.remotesWrite, false, 'remotesWrite default should be false')
  assert.strictEqual(defaults.capabilities.remotesRequest, false, 'remotesRequest default should be false')

  const fakeStore = {
    values: new Map(),
    get(key, fallback) {
      return this.values.has(key) ? this.values.get(key) : fallback
    },
    set(key, value) {
      this.values.set(key, value)
    }
  }

  const saved = saveMcpConfig(fakeStore, {
    capabilities: {
      terminalsWrite: true
    }
  })
  assert.strictEqual(saved.capabilities.terminalsWrite, true, 'saveMcpConfig should persist terminalsWrite')
  assert.strictEqual(saved.capabilities.remotesWrite, false, 'other phase2 flags should remain default false')

  const terminalBuffers = createTerminalBufferStore({ maxLines: 10, maxRawBytes: 4096 })
  terminalBuffers.ensureTerminal({
    terminalId: 't-1',
    projectPath: '/tmp/project',
    cwd: '/tmp/project',
    mode: 'classic'
  })
  terminalBuffers.appendOutput('t-1', 'line-1\nline-2\nline-3\n')

  const writes = []
  const terminals = createTerminalsService({
    terminalBuffers,
    writeTerminal: async (terminalId, data) => {
      writes.push({ terminalId, data })
      return { success: true, terminalId, bytesWritten: Buffer.byteLength(data) }
    }
  })

  assert.strictEqual(typeof terminals.tailTerminalOutput, 'function', 'tailTerminalOutput should exist')
  assert.strictEqual(typeof terminals.writeTerminal, 'function', 'writeTerminal should exist')

  const tailed = await terminals.tailTerminalOutput({ terminalId: 't-1', cursor: 1, maxLines: 10, includeAnsi: false })
  assert.deepStrictEqual(
    tailed.lines.map((line) => line.text),
    ['line-2', 'line-3'],
    'tailTerminalOutput should return lines after the cursor'
  )
  assert.strictEqual(tailed.nextCursor, 3, 'tailTerminalOutput should return nextCursor')

  const writeResult = await terminals.writeTerminal({ terminalId: 't-1', text: 'npm test', appendNewline: true })
  assert.strictEqual(writeResult.success, true, 'writeTerminal should report success')
  assert.strictEqual(writes.length, 1, 'writeTerminal should delegate to runtime writer')
  assert.strictEqual(writes[0].data, 'npm test\n', 'writeTerminal should append newline when requested')

  const fetchCalls = []
  const remotes = createRemotesService({
    store: {
      get(key, fallback) {
        if (key === 'gitlab-config') {
          return { url: 'https://gitlab.example.com', token: 'gitlab-token' }
        }
        if (key === 'gitlabHistory') return []
        return fallback
      }
    },
    executeGitCommand: async (command) => {
      if (command.join(' ') === 'git remote get-url origin') {
        return {
          success: true,
          stdout: 'git@gitlab.example.com:team/repo.git'
        }
      }
      return { success: false, stdout: '' }
    },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options })
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, url, method: options.method || 'GET' }),
        text: async () => JSON.stringify({ ok: true })
      }
    },
    getGitlabProjectId: async () => ({ success: true, projectId: 123 })
  })

  assert.strictEqual(typeof remotes.requestRemoteApi, 'function', 'requestRemoteApi should exist')
  assert.strictEqual(typeof remotes.createMergeRequest, 'function', 'createMergeRequest should exist')

  const remoteResult = await remotes.requestRemoteApi({
    projectPath: '/tmp/project',
    method: 'POST',
    path: 'projects/123/issues',
    headers: {
      Authorization: 'Bearer should-not-pass',
      'X-Custom': 'allowed'
    },
    body: {
      title: 'demo'
    }
  })

  assert.strictEqual(remoteResult.status, 200, 'requestRemoteApi should return response status')
  assert.strictEqual(fetchCalls.length, 1, 'requestRemoteApi should perform a fetch')
  assert.strictEqual(fetchCalls[0].options.headers.Authorization, 'Bearer gitlab-token', 'requestRemoteApi should use internal token')
  assert.strictEqual(fetchCalls[0].options.headers['X-Custom'], 'allowed', 'requestRemoteApi should allow safe custom headers')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
