import assert from 'node:assert/strict'
import {
  buildBranchListFromGitBranchAllOutput,
  getRemoteBranchLocalName,
  parseRemoteBranchRef
} from '../src/components/git/projectDetailBranchRefs.mjs'
import { buildBranchDeleteCommands } from '../src/components/git/projectDetailBranchDelete.mjs'

assert.deepEqual(
  parseRemoteBranchRef('origin/feature/demo'),
  {
    remoteName: 'origin',
    branchName: 'feature/demo',
    remoteRef: 'origin/feature/demo'
  },
  'should parse origin remote refs'
)

assert.deepEqual(
  parseRemoteBranchRef('remotes/fore-repo/162-fix'),
  {
    remoteName: 'fore-repo',
    branchName: '162-fix',
    remoteRef: 'fore-repo/162-fix'
  },
  'should parse non-origin remote refs from git branch -a output'
)

assert.equal(
  getRemoteBranchLocalName('fore-repo/162-fix'),
  '162-fix',
  'local branch name should drop the remote name prefix'
)

assert.deepEqual(
  buildBranchListFromGitBranchAllOutput(`
    65-feature-message-history-restore
  * master
    release
    remotes/fore-repo/162-fix
    remotes/fore-repo/dev
    remotes/origin/65-feature-message-history-restore
    remotes/origin/HEAD -> remotes/origin/master
    remotes/origin/master
  `),
  {
    currentBranch: 'master',
    localBranches: [
      '65-feature-message-history-restore',
      'master',
      'release'
    ],
    remoteBranches: [
      'fore-repo/162-fix',
      'fore-repo/dev',
      'origin/65-feature-message-history-restore',
      'origin/master'
    ]
  },
  'git branch -a output should keep every remotes/* entry out of the local branch list'
)

assert.deepEqual(
  buildBranchDeleteCommands({
    projectPath: '/tmp/repo',
    branch: '162-fix',
    deleteLocal: false,
    deleteRemote: true,
    remoteBranchRef: 'fore-repo/162-fix'
  }),
  ['cd "/tmp/repo" && git push fore-repo --delete "162-fix"'],
  'remote deletion should target the actual remote name instead of always using origin'
)

console.log('project detail branch refs assertions passed')
