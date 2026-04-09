import assert from 'node:assert/strict'
import projectHandlersModule from '../electron/ipc/projects.js'

const { shouldNotifyProjectsUpdated } = projectHandlersModule

assert.equal(
  typeof shouldNotifyProjectsUpdated,
  'function',
  'should export shouldNotifyProjectsUpdated for change detection'
)

const baseProjects = [
  {
    name: 'alpha',
    path: '/tmp/alpha',
    relativePath: 'alpha',
    type: 'git',
    branch: 'main',
    hasPendingFiles: false
  }
]

assert.equal(
  shouldNotifyProjectsUpdated(baseProjects, baseProjects),
  false,
  'should not notify when project snapshots are identical'
)

assert.equal(
  shouldNotifyProjectsUpdated(baseProjects, [
    { ...baseProjects[0], branch: 'feature/new-ui' }
  ]),
  true,
  'should notify when branch changes even if project count stays the same'
)

assert.equal(
  shouldNotifyProjectsUpdated(baseProjects, [
    { ...baseProjects[0], hasPendingFiles: true }
  ]),
  true,
  'should notify when pending-file flag changes'
)

assert.equal(
  shouldNotifyProjectsUpdated(baseProjects, []),
  true,
  'should notify when projects are removed'
)

console.log('projects update notify assertions passed')
