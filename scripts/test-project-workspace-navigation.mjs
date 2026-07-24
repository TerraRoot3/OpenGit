import assert from 'node:assert/strict'
import {
  buildProjectWorkspaceRoute,
  createBackupWorkspaceTab,
  createCodexWorkspaceTab,
  createProjectTerminalFocusRequest,
  createProjectWorkspaceTab,
  createRemoteWorkspaceTab,
  createStandaloneTerminalTab,
  createThemeWorkspaceTab,
  migrateLegacyBrowserTabs,
  normalizeProjectWorkspacePath,
  parseProjectWorkspaceRoute,
  resolveNextWorkspaceTabId,
  restoreWorkspaceTabs,
  serializeWorkspaceTabs
} from '../src/components/app/projectWorkspaceNavigation.mjs'

assert.equal(
  normalizeProjectWorkspacePath('/tmp/foo%20bar'),
  '/tmp/foo bar',
  'workspace paths should decode encoded project paths'
)

assert.deepEqual(
  parseProjectWorkspaceRoute('git:project:/tmp/demo'),
  { path: '/tmp/demo', routeType: 'single-project' },
  'project routes should resolve to the single active workspace'
)

assert.deepEqual(
  parseProjectWorkspaceRoute('git:clone:/tmp/group'),
  { path: '/tmp/group', routeType: 'clone-directory' },
  'directory routes should preserve directory mode'
)

assert.equal(
  parseProjectWorkspaceRoute('https://example.com'),
  null,
  'web URLs must not become internal workspace routes'
)

assert.equal(
  buildProjectWorkspaceRoute('/tmp/demo', 'single-project'),
  'git:project:/tmp/demo',
  'single-project routes should remain compatible with sidebar navigation'
)

const focusRequest = createProjectTerminalFocusRequest('/tmp/demo%20repo')
assert.equal(focusRequest?.path, '/tmp/demo repo')
assert.ok(Number.isFinite(Number(focusRequest?.nonce)))

const firstProjectTab = createProjectWorkspaceTab('git:project:/tmp/first')
const secondProjectTab = createProjectWorkspaceTab('git:project:/tmp/second')
const remoteTab = createRemoteWorkspaceTab()
const backupTab = createBackupWorkspaceTab()
const themeTab = createThemeWorkspaceTab()
const codexTab = createCodexWorkspaceTab()
const terminalTab = createStandaloneTerminalTab({
  id: 'standalone-terminal:test',
  title: '灵动终端',
  mode: 'focus'
})
const splitTerminalTab = createStandaloneTerminalTab({
  id: 'standalone-terminal-split:test',
  mode: 'split'
})
assert.equal(terminalTab.routeType, 'standalone-terminal-focus')
assert.equal(splitTerminalTab.routeType, 'standalone-terminal-split')

assert.notEqual(
  firstProjectTab.id,
  secondProjectTab.id,
  'different sidebar projects must create different workspace tabs'
)

assert.equal(
  resolveNextWorkspaceTabId({
    tabs: [firstProjectTab, secondProjectTab, remoteTab],
    closingId: secondProjectTab.id,
    activeId: secondProjectTab.id
  }),
  remoteTab.id,
  'closing the active tab should activate the tab to its right when possible'
)

const persisted = serializeWorkspaceTabs(
  [firstProjectTab, secondProjectTab, remoteTab, terminalTab, splitTerminalTab, backupTab, themeTab, codexTab],
  codexTab.id
)
assert.equal(
  persisted.tabs.filter((tab) => tab.routeType.startsWith('standalone-terminal-')).length,
  2,
  'both standalone terminal page types should be restored with fresh PTYs after restart'
)
assert.deepEqual(
  restoreWorkspaceTabs(persisted).tabs.map((tab) => tab.id),
  [
    firstProjectTab.id,
    secondProjectTab.id,
    remoteTab.id,
    terminalTab.id,
    splitTerminalTab.id,
    backupTab.id,
    themeTab.id,
    codexTab.id
  ],
  'project and native utility tabs should restore without browser tabs'
)
assert.equal(
  restoreWorkspaceTabs(persisted).activeTabId,
  codexTab.id,
  'the last active workspace page should be restored'
)
const persistedActiveTerminal = serializeWorkspaceTabs(
  [firstProjectTab, terminalTab],
  terminalTab.id
)
assert.equal(
  restoreWorkspaceTabs(persistedActiveTerminal).activeTabId,
  terminalTab.id,
  'an active standalone terminal page should reopen as the active page'
)

const migratedLegacyState = migrateLegacyBrowserTabs({
  savedTabs: [
    { url: 'https://example.com', title: 'removed web page' },
    { url: 'git:project:/tmp/legacy-first', title: 'legacy-first', type: 'single-project' },
    { url: 'about:favorites', title: 'removed favorites', type: 'favorites-manager' },
    { url: 'about:terminal-focus', title: '灵动终端', type: 'standalone-terminal-focus' },
    { url: 'about:terminal-split', title: '分屏终端', type: 'standalone-terminal-split' },
    { url: 'git:remote', title: '远端仓库', type: 'remote-repo' },
    { url: 'about:backup', title: '备份管理', type: 'backup-manager' },
    { url: 'about:codex', title: 'Codex', type: 'codex-main-session' },
    { url: 'git:clone:/tmp/legacy-group', title: 'legacy-group', type: 'clone-directory' }
  ],
  savedActiveTabIndex: 3,
  savedOrder: {
    'git:remote': 0,
    'git:project:/tmp/legacy-first': 1,
    'about:terminal-focus': 2,
    'about:terminal-split': 3,
    'about:backup': 4,
    'about:codex': 5,
    'git:clone:/tmp/legacy-group': 6
  }
})
assert.deepEqual(
  migratedLegacyState.tabs.map((tab) => tab.kind),
  ['remote', 'project', 'terminal', 'terminal', 'backup', 'codex', 'project'],
  'legacy migration should keep native pages in their saved visual order'
)
assert.deepEqual(
  migratedLegacyState.tabs
    .filter((tab) => tab.kind === 'terminal')
    .map((tab) => tab.routeType),
  ['standalone-terminal-focus', 'standalone-terminal-split'],
  'legacy migration should preserve both terminal page modes'
)
assert.equal(
  migratedLegacyState.activeTabId,
  'standalone-terminal:legacy:3',
  'legacy migration should preserve the last active supported page'
)
assert.equal(
  migratedLegacyState.tabs.some((tab) => tab.route === 'https://example.com'),
  false,
  'legacy migration must discard removed web pages'
)

console.log('project workspace navigation assertions passed')
