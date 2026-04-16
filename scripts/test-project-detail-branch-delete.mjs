import assert from 'node:assert/strict'
import {
  buildBranchDeleteCommands,
  buildBranchDeleteDialogPlan
} from '../src/components/git/projectDetailBranchDelete.mjs'

assert.deepEqual(
  buildBranchDeleteDialogPlan({
    branch: 'feature/demo',
    contextType: 'local',
    currentBranch: 'main'
  }),
  {
    branch: 'feature/demo',
    deleteLocal: true,
    deleteRemote: false,
    showRemoteToggle: true,
    message: '确定要删除分支 feature/demo 吗？',
    operationText: '正在删除分支 "feature/demo"...\n'
  },
  'local branch deletion should default to local-only with a remote toggle'
)

assert.deepEqual(
  buildBranchDeleteDialogPlan({
    branch: 'feature/demo',
    contextType: 'remote',
    currentBranch: 'main'
  }),
  {
    branch: 'feature/demo',
    deleteLocal: false,
    deleteRemote: true,
    showRemoteToggle: false,
    message: '确定要删除远程分支 feature/demo 吗？',
    operationText: '正在删除远程分支 "feature/demo"...\n'
  },
  'remote branch deletion should be remote-only and keep the second confirmation'
)

assert.equal(
  buildBranchDeleteDialogPlan({
    branch: 'main',
    contextType: 'local',
    currentBranch: 'main'
  }),
  null,
  'current local branch should not produce a delete plan'
)

assert.deepEqual(
  buildBranchDeleteCommands({
    projectPath: '/tmp/repo',
    branch: 'feature/demo',
    deleteLocal: true,
    deleteRemote: false
  }),
  ['cd "/tmp/repo" && git branch -D "feature/demo"'],
  'local delete should only delete the local branch by default'
)

assert.deepEqual(
  buildBranchDeleteCommands({
    projectPath: '/tmp/repo',
    branch: 'feature/demo',
    deleteLocal: true,
    deleteRemote: true
  }),
  [
    'cd "/tmp/repo" && git branch -D "feature/demo"',
    'cd "/tmp/repo" && git push origin --delete "feature/demo"'
  ],
  'local delete with remote toggle should execute both commands'
)

assert.deepEqual(
  buildBranchDeleteCommands({
    projectPath: '/tmp/repo',
    branch: 'feature/demo',
    deleteLocal: false,
    deleteRemote: true
  }),
  ['cd "/tmp/repo" && git push origin --delete "feature/demo"'],
  'remote-only delete should only delete the remote branch'
)

console.log('project detail branch delete assertions passed')
