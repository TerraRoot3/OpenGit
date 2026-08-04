import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { __testables } = require('../electron/ipc/codex-session-state-source.js')

const startedAt = Date.parse('2026-05-31T09:00:00.000Z')
const endedAtMillis = Date.parse('2026-05-31T09:00:10.000Z')
const endedAtSeconds = Math.floor(endedAtMillis / 1000)
const runningAtMillis = Date.parse('2026-05-31T09:00:20.000Z')
const runningAtSeconds = Math.floor(runningAtMillis / 1000)

assert.equal(
  __testables.parseMillis(String(endedAtSeconds)),
  endedAtMillis,
  'second-based sqlite timestamps should normalize to milliseconds'
)

assert.equal(
  __testables.parseMillis(String(endedAtMillis)),
  endedAtMillis,
  'millisecond timestamps should stay unchanged'
)

const signal = __testables.resolveThreadStatusSignals(
  {
    startedAt,
    completedAt: 0,
    abortedAt: 0
  },
  __testables.parseLogSignals([
    {
      ts: String(endedAtSeconds),
      body: 'session_loop{thread_id=test}: Agent loop exited'
    }
  ])
)

assert.deepEqual(
  signal,
  {
    at: endedAtMillis,
    status: 'ended',
    reason: 'logs.agent_loop_exited'
  },
  'log-only end markers should beat earlier rollout started markers'
)

const runningSignal = __testables.resolveThreadStatusSignals(
  {
    startedAt,
    completedAt: endedAtMillis,
    abortedAt: 0
  },
  __testables.parseLogSignals([
    {
      ts: String(runningAtSeconds),
      body: 'session_loop{thread_id=test}: event.kind=response.output_text.delta'
    }
  ])
)

assert.deepEqual(
  runningSignal,
  {
    at: runningAtMillis,
    status: 'running',
    reason: 'logs.response_output'
  },
  'recent response output logs should override older rollout completed markers'
)

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'opengit-rollout-state-')
)
try {
  const longRunningRollout = path.join(tempDir, 'long-running.jsonl')
  fs.writeFileSync(longRunningRollout, [
    JSON.stringify({
      timestamp: '2026-05-31T09:01:00.000Z',
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: 'turn-medical' }
    }),
    JSON.stringify({
      timestamp: '2026-05-31T09:01:01.000Z',
      type: 'response_item',
      payload: { type: 'message', text: 'x'.repeat(300 * 1024) }
    })
  ].join('\n'))
  assert.deepEqual(
    __testables.readLatestRolloutLifecycleEvent(longRunningRollout),
    {
      at: Date.parse('2026-05-31T09:01:00.000Z'),
      status: 'running',
      reason: 'rollout.task_started',
      turnId: 'turn-medical'
    },
    'a running marker farther than the old 256 KB tail must still be found'
  )

  const completedRollout = path.join(tempDir, 'completed.jsonl')
  fs.writeFileSync(completedRollout, [
    JSON.stringify({
      timestamp: '2026-05-31T09:02:00.000Z',
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: 'turn-completed' }
    }),
    JSON.stringify({
      timestamp: '2026-05-31T09:02:01.000Z',
      type: 'response_item',
      payload: { type: 'message', text: 'x'.repeat(300 * 1024) }
    }),
    JSON.stringify({
      timestamp: '2026-05-31T09:02:10.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete', turn_id: 'turn-completed' }
    })
  ].join('\n'))
  assert.deepEqual(
    __testables.readLatestRolloutLifecycleEvent(completedRollout),
    {
      at: Date.parse('2026-05-31T09:02:10.000Z'),
      status: 'ended',
      reason: 'rollout.task_complete',
      turnId: 'turn-completed'
    },
    'the latest authoritative lifecycle marker must win'
  )
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

const openRolloutPath = path.join(
  os.homedir(),
  '.codex',
  'sessions',
  '2026',
  '05',
  '31',
  'rollout-test.jsonl'
)
assert.deepEqual(
  __testables.parseOpenRolloutPaths([
    'p123',
    'ccodex',
    `n${openRolloutPath}`,
    `n${openRolloutPath}`,
    'n/tmp/not-a-codex-rollout.jsonl'
  ].join('\n')),
  [openRolloutPath],
  'only unique open rollout files under CODEX_HOME should be accepted'
)

console.log('codex session state source assertions passed')
