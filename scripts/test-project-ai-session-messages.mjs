import assert from 'node:assert/strict'
import { sortMessagesNewestFirst } from '../src/components/git/projectAiSessionMessages.mjs'

const sourceMessages = [
  { role: 'user', text: 'first', timestamp: '2026-04-16T10:00:00.000Z' },
  { role: 'assistant', text: 'second', timestamp: '2026-04-16T10:01:00.000Z' },
  { role: 'user', text: 'third', timestamp: '2026-04-16T10:02:00.000Z' }
]

const orderedMessages = sortMessagesNewestFirst(sourceMessages)

assert.deepEqual(
  orderedMessages.map((message) => message.text),
  ['third', 'second', 'first'],
  'dialog messages should be shown from newest to oldest'
)

assert.deepEqual(
  sourceMessages.map((message) => message.text),
  ['first', 'second', 'third'],
  'sorting for display should not mutate the original messages array'
)

assert.deepEqual(
  sortMessagesNewestFirst(null),
  [],
  'non-array values should produce an empty list'
)

console.log('project ai session messages assertions passed')
