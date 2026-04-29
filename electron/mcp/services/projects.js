const path = require('path')

function normalizePath(value = '') {
  return String(value || '').trim().replace(/[\\/]+$/, '')
}

function getSidebarState(store) {
  const payload = store.get('project-sidebar-state-v1', null)
  if (!payload || typeof payload !== 'object') {
    return { scanRoots: [] }
  }
  return payload
}

function getBrowserFavorites(store) {
  const favorites = store.get('browserFavorites', [])
  return Array.isArray(favorites) ? favorites : []
}

function extractProjectPathFromFavoriteUrl(url = '') {
  const raw = String(url || '').trim()
  if (raw.startsWith('git:project:')) return normalizePath(raw.slice('git:project:'.length))
  if (raw.startsWith('git:clone:')) return normalizePath(raw.slice('git:clone:'.length))
  return ''
}

function buildFavoritePathSet(store) {
  const out = new Set()
  for (const favorite of getBrowserFavorites(store)) {
    const projectPath = extractProjectPathFromFavoriteUrl(favorite?.url)
    if (projectPath) out.add(projectPath)
  }
  return out
}

function flattenSidebarEntries(store) {
  const sidebarState = getSidebarState(store)
  const roots = Array.isArray(sidebarState.scanRoots) ? sidebarState.scanRoots : []
  const rows = []

  for (const root of roots) {
    const rootPath = normalizePath(root?.path)
    if (!rootPath) continue
    rows.push({
      path: rootPath,
      name: root?.name || path.basename(rootPath) || '未命名目录',
      type: root?.isGitRepo ? 'git-repo' : 'directory',
      scanRoot: rootPath
    })

    const children = Array.isArray(root?.children) ? root.children : []
    for (const child of children) {
      const childPath = normalizePath(child?.path)
      if (!childPath) continue
      rows.push({
        path: childPath,
        name: child?.name || path.basename(childPath) || '未命名项目',
        type: child?.isGitRepo || child?.kind === 'repository' ? 'git-repo' : 'directory',
        scanRoot: rootPath
      })
    }
  }

  return rows
}

function createProjectsService({
  store,
  executeGitCommand,
  getRuntimeState
}) {
  const getProjectGitMeta = async (projectPath, type = 'directory') => {
    if (!projectPath || type !== 'git-repo' || typeof executeGitCommand !== 'function') {
      return {
        currentBranch: '',
        originUrl: '',
        remoteProvider: ''
      }
    }

    const [branchResult, remoteResult] = await Promise.all([
      executeGitCommand(['git', 'branch', '--show-current'], projectPath),
      executeGitCommand(['git', 'remote', 'get-url', 'origin'], projectPath)
    ])

    const originUrl = remoteResult?.success ? String(remoteResult.stdout || '').trim() : ''
    let remoteProvider = ''
    if (/github\.com[:/]/i.test(originUrl)) remoteProvider = 'github'
    else if (/gitlab/i.test(originUrl)) remoteProvider = 'gitlab'
    else if (/gitee\.com[:/]/i.test(originUrl)) remoteProvider = 'gitee'

    return {
      currentBranch: branchResult?.success ? String(branchResult.stdout || '').trim() : '',
      originUrl,
      remoteProvider
    }
  }

  const listProjects = async () => {
    const runtimeState = typeof getRuntimeState === 'function' ? getRuntimeState() : {}
    const browserState = runtimeState.browser || {}
    const openPathSet = new Set(
      (Array.isArray(browserState.openProjectTabs) ? browserState.openProjectTabs : [])
        .map((tab) => normalizePath(tab?.path))
        .filter(Boolean)
    )
    const activeProjectPath = normalizePath(browserState.activeProject?.path || '')
    const favoritePathSet = buildFavoritePathSet(store)
    const rows = flattenSidebarEntries(store)

    const deduped = new Map()
    for (const row of rows) {
      const current = deduped.get(row.path)
      if (!current || (current.type === 'directory' && row.type === 'git-repo')) {
        deduped.set(row.path, row)
      }
    }

    return Array.from(deduped.values()).map((row) => ({
      id: row.path,
      name: row.name,
      path: row.path,
      type: row.type,
      scanRoot: row.scanRoot,
      isFavorite: favoritePathSet.has(row.path),
      isOpen: openPathSet.has(row.path),
      isActive: activeProjectPath === row.path
    }))
  }

  const findProjects = async (query = '') => {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    if (!normalizedQuery) return []
    const items = await listProjects()
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.path.toLowerCase().includes(normalizedQuery) ||
        item.scanRoot.toLowerCase().includes(normalizedQuery)
      )
    })
  }

  const getProject = async (projectPath = '') => {
    const targetPath = normalizePath(projectPath)
    if (!targetPath) return null
    const items = await listProjects()
    const found = items.find((item) => item.path === targetPath)
    if (!found) return null
    const gitMeta = await getProjectGitMeta(found.path, found.type)
    return {
      ...found,
      ...gitMeta
    }
  }

  const getActiveProject = async () => {
    const runtimeState = typeof getRuntimeState === 'function' ? getRuntimeState() : {}
    const activePath = normalizePath(runtimeState.browser?.activeProject?.path || '')
    if (!activePath) return null
    return getProject(activePath)
  }

  const getOpenProjectTabs = async () => {
    const runtimeState = typeof getRuntimeState === 'function' ? getRuntimeState() : {}
    const browserState = runtimeState.browser || {}
    const tabs = Array.isArray(browserState.openProjectTabs) ? browserState.openProjectTabs : []
    return tabs
      .map((tab) => ({
        id: tab?.id ?? null,
        routeType: String(tab?.routeType || ''),
        path: normalizePath(tab?.path),
        title: String(tab?.title || '').trim(),
        isActive: normalizePath(tab?.path) === normalizePath(browserState.activeProject?.path || '')
      }))
      .filter((tab) => tab.path)
  }

  return {
    listProjects,
    findProjects,
    getProject,
    getActiveProject,
    getOpenProjectTabs
  }
}

module.exports = {
  createProjectsService,
  normalizePath
}
