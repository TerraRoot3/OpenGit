import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseProjectGitMonitorPorcelain,
  buildProjectGitMonitorSnapshot
} = require('../electron/ipc/projectGitMonitor.js')

const porcelain = [
  '# branch.oid 3b6f6a2f4d5c',
  '# branch.head feature/git-monitor',
  '# branch.upstream origin/feature/git-monitor',
  '# branch.ab +2 -3',
  '1 M. N... 100644 100644 100644 1234567 1234567 src/a.js',
  '1 .M N... 100644 100644 100644 1234567 1234567 src/b.js',
  '2 RM N... 100644 100644 100644 1234567 1234567 R100 src/c-old.js\tsrc/c-new.js',
  'u UU N... 100644 100644 100644 100644 1234567 1234567 1234567 src/conflict.js',
  '? src/new-file.js'
].join('\n')

const parsed = parseProjectGitMonitorPorcelain(porcelain)

assert.deepEqual(parsed, {
  currentBranch: 'feature/git-monitor',
  upstream: 'origin/feature/git-monitor',
  localAhead: 2,
  remoteAhead: 3,
  changedCount: 2,
  stagedCount: 2,
  untrackedCount: 1,
  conflictedCount: 1
})

const snapshot = buildProjectGitMonitorSnapshot({
  porcelain,
  isMerging: true,
  isRebasing: false
})

assert.equal(snapshot.currentBranch, 'feature/git-monitor')
assert.equal(snapshot.localAhead, 2)
assert.equal(snapshot.remoteAhead, 3)
assert.equal(snapshot.changedCount, 2)
assert.equal(snapshot.stagedCount, 2)
assert.equal(snapshot.untrackedCount, 1)
assert.equal(snapshot.conflictedCount, 1)
assert.equal(snapshot.isMerging, true)
assert.equal(snapshot.isRebasing, false)
assert.equal(
  snapshot.signature,
  'feature/git-monitor|2|3|2|2|1|1|1|0',
  'signature should reflect branch, ahead/behind, file summary, and operation state'
)

const detachedSnapshot = buildProjectGitMonitorSnapshot({
  porcelain: [
    '# branch.oid 3b6f6a2f4d5c',
    '# branch.head (detached)',
    '1 .M N... 100644 100644 100644 1234567 1234567 src/only-worktree.js'
  ].join('\n'),
  isMerging: false,
  isRebasing: true
})

assert.deepEqual(detachedSnapshot, {
  currentBranch: '(detached)',
  upstream: '',
  localAhead: 0,
  remoteAhead: 0,
  changedCount: 1,
  stagedCount: 0,
  untrackedCount: 0,
  conflictedCount: 0,
  isMerging: false,
  isRebasing: true,
  signature: '(detached)|0|0|1|0|0|0|0|1'
})

console.log('project git monitor assertions passed')
