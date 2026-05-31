import assert from 'node:assert/strict'
import {
  buildProjectTerminalRouteUrl,
  createProjectTerminalFocusRequest,
  normalizeProjectTabPath,
  resolveProjectTerminalTargetTab
} from '../src/components/browser/projectTerminalNavigation.mjs'

assert.equal(
  normalizeProjectTabPath('/tmp/foo%20bar'),
  '/tmp/foo bar',
  'project terminal navigation should decode encoded project paths'
)

assert.equal(
  buildProjectTerminalRouteUrl('/tmp/demo', 'clone-directory'),
  'git:clone:/tmp/demo',
  'clone-directory terminal focus should reuse the clone route'
)

assert.equal(
  buildProjectTerminalRouteUrl('/tmp/demo', 'single-project'),
  'git:project:/tmp/demo',
  'single-project terminal focus should reuse the project route'
)

const focusRequest = createProjectTerminalFocusRequest('/tmp/demo%20repo')
assert.equal(
  focusRequest?.path,
  '/tmp/demo repo',
  'terminal focus requests should normalize project paths before dispatch'
)
assert.ok(
  Number.isFinite(Number(focusRequest?.nonce)),
  'terminal focus requests should include a nonce so repeated focus can be handled'
)

const tabs = [
  { id: 1, routeType: 'clone-directory', routeProps: { path: '/tmp/demo' } },
  { id: 2, routeType: 'single-project', routeProps: { path: '/tmp/demo' } },
  { id: 3, routeType: 'single-project', routeProps: { path: '/tmp/other' } }
]

assert.equal(
  resolveProjectTerminalTargetTab(tabs, {
    projectPath: '/tmp/demo',
    routeType: 'single-project'
  })?.id,
  2,
  'terminal notification navigation should prefer the requested project route type when duplicates exist'
)

assert.equal(
  resolveProjectTerminalTargetTab(tabs, {
    projectPath: '/tmp/demo',
    routeType: 'clone-directory',
    activeTabId: 2
  })?.id,
  2,
  'the active matching project tab should win over a stale preferred route type'
)

assert.equal(
  resolveProjectTerminalTargetTab(tabs, {
    projectPath: '/tmp/missing',
    routeType: 'single-project'
  }),
  null,
  'missing projects should not resolve to an unrelated tab'
)

console.log('project terminal navigation assertions passed')
