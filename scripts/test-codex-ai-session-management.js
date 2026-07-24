const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { __testables } = require('../electron/ipc/ai-sessions')

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

async function run() {
  assert.strictEqual(typeof __testables.renameCodexSession, 'function', 'renameCodexSession should exist')
  assert.strictEqual(typeof __testables.archiveCodexSessionSource, 'function', 'archiveCodexSessionSource should exist')
  assert.strictEqual(typeof __testables.deleteAiSessionSource, 'function', 'deleteAiSessionSource should exist')
  assert.strictEqual(typeof __testables.readCodexThreadFromAppServer, 'function', 'Codex thread reader should exist')
  assert.strictEqual(typeof __testables.extractCodexAppServerTranscript, 'function', 'Codex transcript mapper should exist')
  assert.strictEqual(typeof __testables.loadCodexSessionsLatest, 'function', 'latest Codex loader should exist')

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-test-'))
  const sessionId = '019f-test-session'
  const fallbackSessionId = '019f-fallback-session'
  const staleSessionId = '019f-stale-deleted-session'
  const sessionFile = path.join(homeDir, '.codex', 'sessions', '2026', '05', '15', `rollout-${sessionId}.jsonl`)
  const fallbackSessionFile = path.join(homeDir, '.codex', 'sessions', '2026', '05', '15', `rollout-${fallbackSessionId}.jsonl`)
  const staleSessionFile = path.join(homeDir, '.codex', 'sessions', '2026', '05', '15', `rollout-${staleSessionId}.jsonl`)
  const sessionIndexPath = path.join(homeDir, '.codex', 'session_index.jsonl')
  const fallbackFirstMessage = 'The very first user request should become the fallback Codex title'

  writeJsonl(sessionFile, [
    {
      timestamp: '2026-05-15T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: '2026-05-15T10:00:00.000Z',
        cwd: '/tmp/project'
      }
    },
    {
      timestamp: '2026-05-15T10:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'hello'
      }
    }
  ])

  writeJsonl(fallbackSessionFile, [
    {
      timestamp: '2026-05-15T11:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: fallbackSessionId,
        timestamp: '2026-05-15T11:00:00.000Z',
        cwd: '/tmp/fallback-project'
      }
    },
    {
      timestamp: '2026-05-15T11:00:01.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: fallbackFirstMessage
          }
        ]
      }
    }
  ])

  writeJsonl(sessionIndexPath, [
    {
      id: sessionId,
      thread_name: 'Original Title',
      updated_at: '2026-05-15T10:01:00.000Z'
    }
  ])

  __testables.resetSessionCaches()
  let result = __testables.loadCodexSessions(homeDir)
  assert.strictEqual(result.sessions.length, 2, 'two Codex sessions should load')
  const indexedSession = result.sessions.find((item) => item.sessionId === sessionId)
  const fallbackSession = result.sessions.find((item) => item.sessionId === fallbackSessionId)
  assert.ok(indexedSession, 'indexed session should exist')
  assert.ok(fallbackSession, 'fallback session should exist')
  assert.strictEqual(indexedSession.title, 'Original Title', 'original title should load from session index')
  assert.strictEqual(fallbackSession.title, fallbackFirstMessage, 'fallback title should use the first user message')

  const rpcRequests = []
  const rpcCall = async (request) => {
    rpcRequests.push(request)
    return {}
  }

  const renameResult = await __testables.renameCodexSession({
    homeDir,
    sessionId,
    title: 'Renamed Title',
    rpcCall
  })
  assert.deepStrictEqual(renameResult, {
    renamed: true,
    title: 'Renamed Title'
  }, 'rename should report the app-server mutation')
  assert.deepStrictEqual(
    {
      method: rpcRequests[0].method,
      params: rpcRequests[0].params
    },
    {
      method: 'thread/name/set',
      params: {
        threadId: sessionId,
        name: 'Renamed Title'
      }
    },
    'rename should use the current thread/name/set request'
  )

  const archiveResult = await __testables.archiveCodexSessionSource({
    homeDir,
    sessionId,
    rpcCall
  })
  assert.strictEqual(archiveResult.archived, true, 'archive should report success')
  assert.deepStrictEqual(
    {
      method: rpcRequests[1].method,
      params: rpcRequests[1].params
    },
    {
      method: 'thread/archive',
      params: {
        threadId: sessionId
      }
    },
    'archive should use the current thread/archive request'
  )

  const deleteResult = await __testables.deleteAiSessionSource({
    provider: 'codex',
    homeDir,
    sourcePath: sessionFile,
    sessionId,
    rpcCall
  })
  assert.strictEqual(deleteResult.deleted, true, 'Codex delete should report success')
  assert.deepStrictEqual(
    {
      method: rpcRequests[2].method,
      params: rpcRequests[2].params
    },
    {
      method: 'thread/delete',
      params: {
        threadId: sessionId
      }
    },
    'delete should use the current thread/delete request'
  )
  assert.strictEqual(
    fs.existsSync(sessionFile),
    true,
    'OpenGit should not directly delete the rollout after handing deletion to Codex'
  )

  const archivedSessionFile = path.join(homeDir, '.codex', 'archived_sessions', path.basename(sessionFile))
  fs.mkdirSync(path.dirname(archivedSessionFile), { recursive: true })
  fs.renameSync(sessionFile, archivedSessionFile)

  __testables.resetSessionCaches()
  result = __testables.loadCodexSessions(homeDir)
  assert.strictEqual(result.sessions.length, 1, 'only the non-archived session should remain listed')
  assert.strictEqual(result.sessions[0].sessionId, fallbackSessionId, 'archived session should no longer be listed')

  writeJsonl(staleSessionFile, [
    {
      timestamp: '2026-05-15T12:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: staleSessionId,
        timestamp: '2026-05-15T12:00:00.000Z',
        cwd: '/tmp/fallback-project'
      }
    },
    {
      timestamp: '2026-05-15T12:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'This stale file must not be resurrected'
      }
    }
  ])

  __testables.resetSessionCaches()
  const latestResult = await __testables.loadCodexSessionsLatest(homeDir, {
    listThreads: async () => [{
      id: fallbackSessionId,
      name: 'Authoritative App Server Title',
      preview: fallbackFirstMessage,
      cwd: '/tmp/fallback-project',
      path: fallbackSessionFile,
      createdAt: 1780000000,
      updatedAt: 1780000100,
      recencyAt: 1780000200
    }]
  })

  assert.strictEqual(latestResult.sessions.length, 1, 'latest loader should trust the app-server inventory')
  assert.strictEqual(
    latestResult.sessions[0].sessionId,
    fallbackSessionId,
    'a stale rollout omitted by app-server must not be resurrected'
  )
  assert.strictEqual(
    latestResult.sessions[0].title,
    'Authoritative App Server Title',
    'latest Codex title should come from app-server'
  )
  assert.strictEqual(
    latestResult.sessions[0].updatedAt,
    new Date(1780000200 * 1000).toISOString(),
    'app-server second timestamps should normalize to milliseconds'
  )

  const thread = {
    id: fallbackSessionId,
    cwd: '/tmp/fallback-project',
    turns: [{
      startedAt: 1780000200,
      completedAt: 1780000210,
      items: [
        {
          type: 'userMessage',
          content: [
            { type: 'text', text: 'Inspect the latest Codex protocol' },
            { type: 'image', url: 'https://example.invalid/image.png' }
          ]
        },
        {
          type: 'agentMessage',
          text: 'The protocol is current.'
        },
        {
          type: 'commandExecution',
          command: 'pwd'
        }
      ]
    }]
  }
  const readRequests = []
  const readThread = await __testables.readCodexThreadFromAppServer({
    homeDir,
    sessionId: fallbackSessionId,
    rpcCall: async (request) => {
      readRequests.push(request)
      return { thread }
    }
  })
  assert.strictEqual(readThread, thread, 'thread/read should return the app-server thread')
  assert.deepStrictEqual(
    {
      method: readRequests[0].method,
      params: readRequests[0].params
    },
    {
      method: 'thread/read',
      params: {
        threadId: fallbackSessionId,
        includeTurns: true
      }
    },
    'detail should use thread/read with turns enabled'
  )
  assert.deepStrictEqual(
    __testables.extractCodexAppServerTranscript(readThread),
    [
      {
        role: 'user',
        text: 'Inspect the latest Codex protocol',
        timestamp: new Date(1780000200 * 1000).toISOString()
      },
      {
        role: 'assistant',
        text: 'The protocol is current.',
        timestamp: new Date(1780000210 * 1000).toISOString()
      }
    ],
    'thread/read turns should map current userMessage and agentMessage items'
  )
}

run()
  .then(() => console.log('ok'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
