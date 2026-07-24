import assert from 'node:assert/strict'
import {
  BACKUP_CATEGORIES,
  createBackupDocument,
  getBackupCategoryForKey,
  parseBackupDocument,
  selectRestoreConfigs,
  summarizeBackupConfigs
} from '../src/components/app/backupConfig.mjs'

assert.equal(getBackupCategoryForKey('project-sidebar-state-v1'), 'projects')
assert.equal(getBackupCategoryForKey('gitlab-config-/tmp/example'), 'remotes')
assert.equal(getBackupCategoryForKey('commit-template-_tmp_example'), 'workspace')
assert.equal(getBackupCategoryForKey('opengit-theme'), 'appearance')
assert.equal(getBackupCategoryForKey('browserPasswords'), '')
assert.equal(getBackupCategoryForKey('browserFavorites'), '')
assert.equal(getBackupCategoryForKey('browsingHistory'), '')
assert.equal(getBackupCategoryForKey('mcpConfig'), '')

const document = createBackupDocument({
  allConfigs: {
    'project-sidebar-state-v1': { scanRoots: [{ path: '/tmp/example' }] },
    gitlabHistory: [{ url: 'https://gitlab.example.com', token: 'secret' }],
    'commit-template-global': 'feat: ',
    'opengit-theme': 'abyss-blue',
    browserPasswords: [{ password: 'must-not-export' }],
    browserFavorites: [{ url: 'https://example.com' }],
    browsingHistory: [{ url: 'https://example.com' }],
    mcpConfig: { enabled: true }
  },
  categoryIds: BACKUP_CATEGORIES.map((category) => category.id),
  createdAt: '2026-07-24T12:00:00.000Z'
})

assert.deepEqual(Object.keys(document.configs).sort(), [
  'commit-template-global',
  'gitlabHistory',
  'opengit-theme',
  'project-sidebar-state-v1'
])

const parsed = parseBackupDocument(JSON.stringify(document))
assert.equal(parsed.createdAt, '2026-07-24T12:00:00.000Z')
assert.deepEqual(summarizeBackupConfigs(parsed.configs), {
  projects: 1,
  remotes: 1,
  workspace: 1,
  appearance: 1
})

assert.deepEqual(selectRestoreConfigs(parsed, ['appearance']), {
  'opengit-theme': 'abyss-blue'
})

assert.throws(
  () => parseBackupDocument(JSON.stringify({
    format: 'opengit-config-backup',
    version: 2,
    configs: {
      browserPasswords: [{ password: 'must-not-import' }]
    }
  })),
  /没有可恢复的配置/
)

console.log('backup config assertions passed')
