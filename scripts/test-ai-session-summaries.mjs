import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import aiSessionsModule from '../electron/ipc/ai-sessions.js'

const { __testables } = aiSessionsModule

if (!__testables) {
  throw new Error('Missing ai session test helpers')
}

const {
  configureSummaryCache,
  flushSummaryCache,
  getSessionSummaryCacheState,
  readSessionSummaryCache,
  writeSessionSummaryCache,
  deleteSessionSummaryCache,
  deleteAiSessionSource,
  normalizeSessionText,
  extractCodexSummary,
  extractCodexTranscript,
  extractClaudeSummary,
  extractClaudeTranscript
} = __testables

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-session-summary-'))

try {
  assert.equal(
    normalizeSessionText('<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>'),
    '',
    'environment context should not be treated as summary'
  )

  const codexFile = path.join(tempDir, 'codex.jsonl')
  fs.writeFileSync(codexFile, [
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>' }]
      }
    }),
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '浏览器标签切回去会重新加载，帮我查一下原因' }]
      }
    })
  ].join('\n'))

  assert.equal(
    extractCodexSummary(codexFile),
    '浏览器标签切回去会重新加载，帮我查一下原因',
    'codex summary should skip environment context and keep the first real user message'
  )

  assert.deepEqual(
    extractCodexTranscript(codexFile).map((item) => ({ role: item.role, text: item.text })),
    [
      { role: 'user', text: '浏览器标签切回去会重新加载，帮我查一下原因' }
    ],
    'codex transcript should only keep real readable conversation messages'
  )

  const claudeFile = path.join(tempDir, 'claude.jsonl')
  fs.writeFileSync(claudeFile, [
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: '检查一下项目里的代理配置为什么没有生效'
      }
    })
  ].join('\n'))

  assert.equal(
    extractClaudeSummary(claudeFile),
    '检查一下项目里的代理配置为什么没有生效',
    'claude summary should support plain string content'
  )

  const summaryCacheFile = path.join(tempDir, 'ai-session-summary-cache.json')
  configureSummaryCache(summaryCacheFile)

  const cacheSourceFile = path.join(tempDir, 'cached-session.jsonl')
  fs.writeFileSync(cacheSourceFile, 'cached')
  const cacheSourceMtimeMs = fs.statSync(cacheSourceFile).mtimeMs

  assert.deepEqual(
    readSessionSummaryCache({
      provider: 'codex',
      sessionId: 'session-1',
      sourcePath: cacheSourceFile,
      sourceMtimeMs: cacheSourceMtimeMs
    }),
    { hit: false, summary: '' },
    'summary cache should miss before any entry is written'
  )

  writeSessionSummaryCache({
    provider: 'codex',
    sessionId: 'session-1',
    sourcePath: cacheSourceFile,
    sourceMtimeMs: cacheSourceMtimeMs,
    summary: '缓存首条消息'
  })
  flushSummaryCache()

  configureSummaryCache(path.join(tempDir, 'other-cache.json'))
  configureSummaryCache(summaryCacheFile)

  assert.deepEqual(
    readSessionSummaryCache({
      provider: 'codex',
      sessionId: 'session-1',
      sourcePath: cacheSourceFile,
      sourceMtimeMs: cacheSourceMtimeMs
    }),
    { hit: true, summary: '缓存首条消息' },
    'summary cache should persist entries by provider and session id'
  )

  const nextMtime = new Date(cacheSourceMtimeMs + 2000)
  fs.utimesSync(cacheSourceFile, nextMtime, nextMtime)
  const updatedMtimeMs = fs.statSync(cacheSourceFile).mtimeMs

  assert.deepEqual(
    readSessionSummaryCache({
      provider: 'codex',
      sessionId: 'session-1',
      sourcePath: cacheSourceFile,
      sourceMtimeMs: updatedMtimeMs
    }),
    { hit: false, summary: '' },
    'summary cache should invalidate when the source file changes'
  )

  assert.deepEqual(
    getSessionSummaryCacheState({
      provider: 'codex',
      sessionId: 'session-1',
      sourcePath: cacheSourceFile,
      sourceMtimeMs: updatedMtimeMs
    }),
    { status: 'stale', summary: '缓存首条消息' },
    'stale summary cache state should preserve the previous summary for async refresh'
  )

  writeSessionSummaryCache({
    provider: 'codex',
    sessionId: 'session-1',
    sourcePath: cacheSourceFile,
    sourceMtimeMs: updatedMtimeMs,
    summary: '新的缓存摘要'
  })
  deleteSessionSummaryCache({
    provider: 'codex',
    sessionId: 'session-1',
    sourcePath: cacheSourceFile
  })

  assert.deepEqual(
    readSessionSummaryCache({
      provider: 'codex',
      sessionId: 'session-1',
      sourcePath: cacheSourceFile,
      sourceMtimeMs: updatedMtimeMs
    }),
    { hit: false, summary: '' },
    'summary cache delete should remove matching entries'
  )

  assert.deepEqual(
    extractClaudeTranscript(claudeFile).map((item) => ({ role: item.role, text: item.text })),
    [
      { role: 'user', text: '检查一下项目里的代理配置为什么没有生效' }
    ],
    'claude transcript should support plain string user messages'
  )

  const fakeHomeDir = fs.mkdtempSync(path.join(tempDir, 'home-'))
  const codexSessionDir = path.join(fakeHomeDir, '.codex', 'sessions', '2026', '04', '15')
  fs.mkdirSync(codexSessionDir, { recursive: true })
  const codexDeleteFile = path.join(codexSessionDir, 'delete-me.jsonl')
  fs.writeFileSync(codexDeleteFile, 'test')

  const originalHomedir = os.homedir
  os.homedir = () => fakeHomeDir

  try {
    const deleteResult = deleteAiSessionSource({
      provider: 'codex',
      sourcePath: codexDeleteFile
    })

    assert.equal(deleteResult.deleted, true, 'delete handler should report deleted session files')
    assert.equal(fs.existsSync(codexDeleteFile), false, 'delete handler should remove the session file')
  } finally {
    os.homedir = originalHomedir
  }

  console.log('ai session summary tests passed')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
