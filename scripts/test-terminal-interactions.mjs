import assert from 'node:assert/strict'
import { escapeShellPath, buildDropPayload } from '../src/components/terminal/terminalInteractions.mjs'

assert.equal(typeof escapeShellPath, 'function', 'escapeShellPath should be exported')
assert.equal(typeof buildDropPayload, 'function', 'buildDropPayload should be exported')

assert.equal(
  escapeShellPath('/tmp/a b/c.txt'),
  '/tmp/a\\ b/c.txt',
  'path with spaces should be escaped with backslashes'
)

assert.equal(
  escapeShellPath("/tmp/it's.txt"),
  "/tmp/it\\'s.txt",
  'single quotes in path should be escaped with backslashes'
)

assert.equal(
  buildDropPayload(['/tmp/a b.txt', "/tmp/it's.txt"]),
  "/tmp/a\\ b.txt /tmp/it\\'s.txt",
  'drop payload should join escaped paths with spaces'
)

console.log('terminal interactions assertions passed')
