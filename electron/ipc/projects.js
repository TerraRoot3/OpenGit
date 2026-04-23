const fs = require('fs')
const path = require('path')
const fsp = fs.promises

function shouldNotifyProjectsUpdated(previousProjects = [], nextProjects = []) {
  if (previousProjects.length !== nextProjects.length) return true

  const previousMap = new Map(previousProjects.map(project => [project.path, project]))

  for (const project of nextProjects) {
    const previous = previousMap.get(project.path)
    if (!previous) return true

    if (
      previous.name !== project.name ||
      previous.relativePath !== project.relativePath ||
      previous.type !== project.type ||
      previous.branch !== project.branch ||
      Boolean(previous.hasPendingFiles) !== Boolean(project.hasPendingFiles)
    ) {
      return true
    }
  }

  return false
}

function registerProjectHandlers({
  ipcMain,
  store,
  executeGitCommand,
  promiseAllWithLimit,
  notifyProjectsUpdated,
  safeLog,
  safeError
}) {
  ipcMain.handle('get-projects', async (event, data) => {
    try {
      safeLog(`📁 获取项目列表: ${data.path}`)
      const cacheKey = `projects_cache_${data.path.replace(/[/\\]/g, '_')}`
      const cachedData = store.get(cacheKey)
      const hasCachedData = cachedData && cachedData.projects && cachedData.projects.length > 0

      if (hasCachedData) {
        safeLog(`📦 [缓存命中] 从缓存返回 ${cachedData.projects.length} 个项目，后台异步更新`)
      }

      const findGitProjects = async (dir) => {
        const gitProjects = []
        if (!fs.existsSync(dir)) return gitProjects

        try {
          const entries = await fsp.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory() && entry.name === '.git') {
              const projectPath = path.dirname(fullPath)
              const relativePath = path.relative(data.path, projectPath)
              gitProjects.push({
                name: path.basename(projectPath),
                path: projectPath,
                relativePath,
                type: 'git'
              })
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const subProjects = await findGitProjects(fullPath)
              gitProjects.push(...subProjects)
            }
          }
        } catch (error) {
          safeError(`查找项目失败 ${dir}:`, error.message)
        }

        return gitProjects
      }

      const getProjectGitInfo = async (project) => {
        try {
          const [currentResult, statusResult] = await Promise.allSettled([
            executeGitCommand(['git', 'branch', '--show-current'], project.path),
            executeGitCommand(['git', 'status', '--porcelain'], project.path)
          ])

          const currentBranch = currentResult.status === 'fulfilled' && currentResult.value.success && currentResult.value.stdout
            ? currentResult.value.stdout.trim() : 'unknown'

          let hasPendingFiles = false
          if (statusResult.status === 'fulfilled' && statusResult.value.success && statusResult.value.stdout) {
            const statusLines = statusResult.value.stdout.trim().split('\n').filter(line => line.length > 0)
            hasPendingFiles = statusLines.some(line => {
              const hasChanges = line[0] === ' ' && (line[1] === 'M' || line[1] === 'A' || line[1] === 'D' || line[1] === 'R') ||
                line[0] === '?' ||
                line[0] === '!' ||
                (line[0] !== '?' && line[0] !== '!' && line[0] !== '#')
              return hasChanges
            })
          }

          return {
            ...project,
            branch: currentBranch,
            localAhead: 0,
            hasPendingFiles
          }
        } catch (error) {
          safeError(`获取项目Git信息失败 ${project.path}:`, error.message)
          return {
            ...project,
            branch: 'unknown',
            localAhead: 0,
            hasPendingFiles: false
          }
        }
      }

      if (hasCachedData) {
        setImmediate(async () => {
          try {
            const gitProjects = await findGitProjects(data.path)
            const tasks = gitProjects.map(p => () => getProjectGitInfo(p))
            const projects = await promiseAllWithLimit(tasks, 8)

            const hasChanges = shouldNotifyProjectsUpdated(cachedData.projects, projects)

            store.set(cacheKey, { projects, timestamp: Date.now() })

            if (hasChanges) {
              safeLog('📦 [缓存更新] 检测到项目变化，通知前端更新')
              notifyProjectsUpdated(data.path, projects)
            } else {
              safeLog('📦 [缓存更新] 项目列表无变化')
            }
          } catch (error) {
            safeError('📦 [缓存更新] 后台更新失败:', error.message)
          }
        })

        return { success: true, projects: cachedData.projects, fromCache: true }
      }

      safeLog(`📂 [首次扫描] 开始扫描: ${data.path}`)
      const gitProjects = await findGitProjects(data.path)
      safeLog(`📁 找到 ${gitProjects.length} 个Git项目`)

      if (gitProjects.length > 0) {
        const basicProjects = gitProjects.map(p => ({
          ...p,
          branch: 'loading...',
          localAhead: 0,
          hasPendingFiles: false
        }))

        setImmediate(async () => {
          try {
            const tasks = gitProjects.map(p => () => getProjectGitInfo(p))
            const projects = await promiseAllWithLimit(tasks, 8)
            store.set(cacheKey, { projects, timestamp: Date.now() })
            safeLog(`📦 [缓存保存] 已保存 ${projects.length} 个项目到缓存（含 git 信息）`)
            notifyProjectsUpdated(data.path, projects)
          } catch (error) {
            safeError('📦 [后台扫描] git 信息获取失败:', error.message)
          }
        })

        return { success: true, projects: basicProjects, fromCache: false, partial: true }
      }

      return { success: true, projects: [] }
    } catch (error) {
      safeError('❌ 获取项目失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}`, projects: [] }
    }
  })

  ipcMain.handle('get-scan-root-repositories', async (event, data) => {
    try {
      const rootPath = path.resolve(String(data?.path || ''))
      if (!rootPath || !fs.existsSync(rootPath)) {
        return { success: false, message: '目录不存在', root: null, children: [] }
      }

      const ignoredNames = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.nuxt'])

      const isGitRepo = async (targetPath) => {
        try {
          const gitDir = path.join(targetPath, '.git')
          const stat = await fsp.stat(gitDir)
          return stat.isDirectory() || stat.isFile()
        } catch (error) {
          return false
        }
      }

      const children = []
      const seenPaths = new Set()

      const walk = async (currentPath, depth) => {
        if (depth > 3) return

        let entries = []
        try {
          entries = await fsp.readdir(currentPath, { withFileTypes: true })
        } catch (error) {
          safeError(`扫描目录失败 ${currentPath}:`, error.message)
          return
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          if (entry.name.startsWith('.') || ignoredNames.has(entry.name)) continue

          const fullPath = path.join(currentPath, entry.name)
          const repoDetected = await isGitRepo(fullPath)

          const normalizedPath = path.resolve(fullPath)
          if (!seenPaths.has(normalizedPath)) {
            seenPaths.add(normalizedPath)
            children.push({
              path: normalizedPath,
              name: path.basename(normalizedPath),
              relativePath: path.relative(rootPath, normalizedPath),
              depth,
              kind: repoDetected ? 'repository' : 'directory',
              isGitRepo: repoDetected
            })
          }

          if (depth < 3) {
            await walk(fullPath, depth + 1)
          }
        }
      }

      const rootIsGitRepo = await isGitRepo(rootPath)
      await walk(rootPath, 1)

      children.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
        return a.path.localeCompare(b.path)
      })

      return {
        success: true,
        root: {
          path: rootPath,
          name: path.basename(rootPath),
          isGitRepo: rootIsGitRepo
        },
        children
      }
    } catch (error) {
      safeError('❌ 获取扫描根仓库失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}`, root: null, children: [] }
    }
  })

  ipcMain.handle('detect-git-repository', async (event, data) => {
    try {
      const targetPath = path.resolve(String(data?.path || ''))
      if (!targetPath || !fs.existsSync(targetPath)) {
        return { success: true, isGitRepo: false }
      }

      const gitPath = path.join(targetPath, '.git')
      try {
        const stat = await fsp.stat(gitPath)
        return { success: true, isGitRepo: stat.isDirectory() || stat.isFile() }
      } catch {
        return { success: true, isGitRepo: false }
      }
    } catch (error) {
      return { success: false, isGitRepo: false, message: error.message }
    }
  })
}

module.exports = {
  registerProjectHandlers,
  shouldNotifyProjectsUpdated
}
