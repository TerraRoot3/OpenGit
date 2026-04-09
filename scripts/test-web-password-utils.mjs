import assert from 'node:assert/strict'
import {
  findBestMatchingPassword,
  buildPasswordSaveDecision,
  isLoginLikeUrl
} from '../src/composables/webPasswordUtils.mjs'

const passwords = [
  { username: 'alice', password: 'p1', domain: 'https://example.com' },
  { username: 'bob', password: 'p2', domain: 'https://www.github.com/login' },
  { username: 'charlie', password: 'p3', domain: 'gitlab.com' }
]

const match1 = findBestMatchingPassword(passwords, 'https://example.com/dashboard')
assert.equal(match1?.username, 'alice')

const match2 = findBestMatchingPassword(passwords, 'https://github.com/settings')
assert.equal(match2?.username, 'bob')

const match3 = findBestMatchingPassword(passwords, 'https://sub.gitlab.com/login')
assert.equal(match3?.username, 'charlie')

const noMatch = findBestMatchingPassword(passwords, 'https://foo.bar')
assert.equal(noMatch, null)

assert.equal(isLoginLikeUrl('https://example.com/login'), true)
assert.equal(isLoginLikeUrl('https://example.com/signin'), true)
assert.equal(isLoginLikeUrl('https://example.com/home'), false)

assert.deepEqual(
  buildPasswordSaveDecision({
    captured: { username: 'u1', password: 'p1', domain: 'example.com' },
    existing: { id: 1, username: 'u1', password: 'p1', domain: 'example.com' },
    filled: null
  }),
  { shouldPrompt: false, reason: 'existing-same-password', isUpdate: false, existingId: 1 }
)

assert.deepEqual(
  buildPasswordSaveDecision({
    captured: { username: 'u1', password: 'p2', domain: 'example.com' },
    existing: { id: 1, username: 'u1', password: 'p1', domain: 'example.com' },
    filled: null
  }),
  { shouldPrompt: true, reason: 'existing-different-password', isUpdate: true, existingId: 1 }
)

assert.deepEqual(
  buildPasswordSaveDecision({
    captured: { username: 'u1', password: 'p3', domain: 'example.com' },
    existing: null,
    filled: { username: 'u1', password: 'p1', domain: 'example.com' }
  }),
  { shouldPrompt: true, reason: 'filled-changed', isUpdate: true, existingId: null }
)

console.log('web-password utils test passed')
