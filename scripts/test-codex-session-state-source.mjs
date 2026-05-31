import assert from 'node:assert/strict'
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

console.log('codex session state source assertions passed')
