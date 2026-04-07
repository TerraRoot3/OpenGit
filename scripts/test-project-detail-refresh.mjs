import assert from 'node:assert/strict'
import {
  buildProjectRefreshPlan,
  deriveBranchStatusState
} from '../src/components/git/projectDetailRefresh.mjs'

const visibleTagsPlan = buildProjectRefreshPlan({
  reloadBranches: true,
  reloadFileStatus: true
}, {
  showTags: true
})

assert.equal(
  visibleTagsPlan.reloadTags,
  true,
  'visible tags should be included in project refresh'
)

const hiddenTagsPlan = buildProjectRefreshPlan({
  reloadBranches: true
}, {
  showTags: false
})

assert.equal(
  hiddenTagsPlan.reloadTags,
  false,
  'hidden tags should not force a refresh'
)

const explicitTagsPlan = buildProjectRefreshPlan({}, {
  showTags: false
}, {
  reloadTags: true
})

assert.equal(
  explicitTagsPlan.reloadTags,
  true,
  'manual tag refresh should work even when the section is collapsed'
)

const branchState = deriveBranchStatusState({
  existingCurrentBranch: 'stale-branch',
  statusPayload: {
    currentBranch: 'feature/faster-refresh',
    currentBranchStatus: {
      localAhead: 2,
      remoteAhead: 1
    },
    allBranchStatus: {
      'feature/faster-refresh': {
        localAhead: 2,
        remoteAhead: 1
      }
    }
  }
})

assert.equal(
  branchState.currentBranch,
  'feature/faster-refresh',
  'branch status payload should update the current branch immediately'
)

assert.deepEqual(branchState.branchStatus, {
  localAhead: 2,
  remoteAhead: 1
})

console.log('project-detail refresh assertions passed')
