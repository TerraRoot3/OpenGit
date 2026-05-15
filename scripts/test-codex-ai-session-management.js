const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { __testables } = require('../electron/ipc/ai-sessions')

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

function run() {
  assert.strictEqual(typeof __testables.renameCodexSession, 'function', 'renameCodexSession should exist')
  assert.strictEqual(typeof __testables.archiveCodexSessionSource, 'function', 'archiveCodexSessionSource should exist')

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-test-'))
  const sessionId = '019f-test-session'
  const fallbackSessionId = '019f-fallback-session'
  const sessionFile = path.join(homeDir, '.codex', 'sessions', '2026', '05', '15', `rollout-${sessionId}.jsonl`)
  const fallbackSessionFile = path.join(homeDir, '.codex', 'sessions', '2026', '05', '15', `rollout-${fallbackSessionId}.jsonl`)
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

  __testables.renameCodexSession({
    homeDir,
    sourcePath: sessionFile,
    sessionId,
    title: 'Renamed Title'
  })

  __testables.resetSessionCaches()
  result = __testables.loadCodexSessions(homeDir)
  assert.strictEqual(
    result.sessions.find((item) => item.sessionId === sessionId).title,
    'Renamed Title',
    'renamed title should be visible after reload'
  )

  const archiveResult = __testables.archiveCodexSessionSource({
    homeDir,
    sourcePath: sessionFile
  })

  assert.strictEqual(archiveResult.archived, true, 'archive should report success')
  assert.ok(archiveResult.archivedPath.includes(path.join('.codex', 'archived_sessions')), 'archive path should use archived_sessions')
  assert.strictEqual(fs.existsSync(sessionFile), false, 'original session file should be moved away')
  assert.strictEqual(fs.existsSync(archiveResult.archivedPath), true, 'archived session file should exist')

  __testables.resetSessionCaches()
  result = __testables.loadCodexSessions(homeDir)
  assert.strictEqual(result.sessions.length, 1, 'only the non-archived session should remain listed')
  assert.strictEqual(result.sessions[0].sessionId, fallbackSessionId, 'archived session should no longer be listed')
}

run()
console.log('ok')
