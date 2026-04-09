import assert from 'node:assert/strict'
import {
  COMMIT_HISTORY_SCOPE,
  buildOrthogonalRoundedPath,
  buildRoundedPath,
  buildCommitHistoryCommand,
  createBranchScopeOptions,
  mergeCommitPages,
  captureScrollAnchor,
  restoreScrollAnchor
} from '../src/components/git/commitHistoryState.mjs'

const scopeOptions = createBranchScopeOptions({
  currentBranch: 'feature/timeline',
  allBranches: ['main', 'feature/timeline', 'release/1.0', 'main']
})

assert.deepEqual(
  scopeOptions.map((option) => option.label),
  [
    '全部历史',
    '当前分支 (feature/timeline)',
    'feature/timeline',
    'main',
    'release/1.0'
  ],
  'scope options should include current branch shortcut and unique sorted local branches'
)

const currentBranchCommand = buildCommitHistoryCommand({
  projectPath: '/tmp/repo',
  currentBranch: 'feature/timeline',
  selectedScope: COMMIT_HISTORY_SCOPE.CURRENT
})

assert.match(
  currentBranchCommand,
  /git log "feature\/timeline" --decorate/,
  'current branch scope should resolve to the active local branch'
)

const selectedBranchCommand = buildCommitHistoryCommand({
  projectPath: '/tmp/repo',
  selectedScope: COMMIT_HISTORY_SCOPE.BRANCH,
  selectedBranch: 'release/1.0',
  skip: 500
})

assert.match(
  selectedBranchCommand,
  /git log "release\/1\.0" --decorate.*--skip=500/,
  'selected branch scope should target the chosen local branch and keep pagination'
)

const mergedCommits = mergeCommitPages(
  [{ hash: 'a1' }, { hash: 'b2' }],
  [{ hash: 'b2' }, { hash: 'c3' }],
  true
)

assert.deepEqual(
  mergedCommits.map((commit) => commit.hash),
  ['a1', 'b2', 'c3'],
  'pagination merge should append only new commits'
)

const container = {
  scrollTop: 320,
  scrollHeight: 1400
}
const anchor = captureScrollAnchor(container)
container.scrollHeight = 1820
restoreScrollAnchor(container, anchor)

assert.equal(
  container.scrollTop,
  740,
  'restoring an append anchor should preserve the visible window after scrollHeight grows'
)

restoreScrollAnchor(container, anchor, 'top')

assert.equal(
  container.scrollTop,
  0,
  'top strategy should reset to the beginning for full refreshes'
)

const roundedPath = buildRoundedPath([
  { x: 10, y: 10 },
  { x: 10, y: 50 },
  { x: 60, y: 50 }
], 8)

assert.equal(
  roundedPath,
  'M10,10 L10,42 Q10,50 18,50 L60,50',
  'rounded path should create a single inward corner without protruding hooks'
)

const orthogonalPath = buildOrthogonalRoundedPath([
  { x: 10, y: 10 },
  { x: 10, y: 50 },
  { x: 60, y: 50 }
], 5)

assert.equal(
  orthogonalPath,
  'M10,10 L10,45 Q10,50 15,50 L60,50',
  'orthogonal rounded path should keep the original elbow shape with a small corner radius'
)

console.log('commit-history state assertions passed')
