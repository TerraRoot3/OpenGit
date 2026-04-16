import assert from 'node:assert/strict'
import {
  deriveProjectGitMonitorRefreshRequest,
  shouldRunProjectGitMonitor
} from '../src/components/git/projectDetailGitMonitor.mjs'

assert.equal(
  shouldRunProjectGitMonitor({
    path: '/tmp/repo',
    isActive: true,
    isVisible: true
  }),
  true,
  'monitor should run only when the detail page has a path, is active, and is visible'
)

assert.equal(
  shouldRunProjectGitMonitor({
    path: '/tmp/repo',
    isActive: false,
    isVisible: true
  }),
  false,
  'inactive project detail should not poll'
)

assert.equal(
  deriveProjectGitMonitorRefreshRequest(null, {
    signature: 'baseline',
    currentBranch: 'main',
    localAhead: 0,
    remoteAhead: 0,
    changedCount: 0,
    stagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
    isMerging: false,
    isRebasing: false
  }),
  null,
  'first snapshot should establish baseline without forcing a refresh'
)

assert.equal(
  deriveProjectGitMonitorRefreshRequest(
    { signature: 'same' },
    { signature: 'same' }
  ),
  null,
  'unchanged signatures should not refresh anything'
)

assert.deepEqual(
  deriveProjectGitMonitorRefreshRequest(
    {
      signature: 'main|0|0|0|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    },
    {
      signature: 'feature|0|0|0|0|0|0|0|0',
      currentBranch: 'feature/git-monitor',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    }
  ),
  {
    reloadBranches: true,
    reloadBranchStatus: true,
    reloadFileStatus: true,
    reloadCommitHistory: true
  },
  'branch changes should refresh branches, branch status, file status, and commit history'
)

assert.deepEqual(
  deriveProjectGitMonitorRefreshRequest(
    {
      signature: 'main|0|0|0|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    },
    {
      signature: 'main|1|0|0|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 1,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    }
  ),
  {
    reloadBranchStatus: true,
    reloadCommitHistory: true
  },
  'ahead/behind changes should refresh branch status and commit history'
)

assert.deepEqual(
  deriveProjectGitMonitorRefreshRequest(
    {
      signature: 'main|0|0|0|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    },
    {
      signature: 'main|0|0|1|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 1,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    }
  ),
  {
    reloadFileStatus: true
  },
  'file summary changes should refresh file status only'
)

assert.deepEqual(
  deriveProjectGitMonitorRefreshRequest(
    {
      signature: 'main|0|0|0|0|0|0|0|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: false,
      isRebasing: false
    },
    {
      signature: 'main|0|0|0|0|0|0|1|0',
      currentBranch: 'main',
      localAhead: 0,
      remoteAhead: 0,
      changedCount: 0,
      stagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      isMerging: true,
      isRebasing: false
    }
  ),
  {
    reloadBranchStatus: true,
    reloadFileStatus: true
  },
  'merge/rebase state changes should refresh branch status and file status'
)

console.log('project detail git monitor assertions passed')
