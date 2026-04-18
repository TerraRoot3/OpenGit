const fs = require('node:fs')
const path = require('node:path')
const { buildProjectGitMonitorSnapshot } = require('./projectGitMonitor')

function registerBranchHandlers({
  ipcMain,
  store,
  executeGitCommand,
  cachedGitStatus,
  deduplicatedFetch,
  getMainWindow,
  safeLog,
  safeError
}) {
  const parsePorcelainV2Branch = (stdout = '') => {
    const result = {
      currentBranch: '',
      upstream: '',
      ahead: 0,
      behind: 0
    }
    const lines = stdout.split('\n')
    for (const line of lines) {
      if (line.startsWith('# branch.head ')) {
        result.currentBranch = line.replace('# branch.head ', '').trim()
      } else if (line.startsWith('# branch.upstream ')) {
        result.upstream = line.replace('# branch.upstream ', '').trim()
      } else if (line.startsWith('# branch.ab ')) {
        const m = line.match(/# branch\.ab \+(\d+) -(\d+)/)
        if (m) {
          result.ahead = parseInt(m[1], 10) || 0
          result.behind = parseInt(m[2], 10) || 0
        }
      }
    }
    return result
  }
  const parseTrackInfo = (track = '') => {
    const text = (track || '').replace(/^\[|\]$/g, '')
    const aheadMatch = text.match(/ahead\s+(\d+)/)
    const behindMatch = text.match(/behind\s+(\d+)/)
    return {
      localAhead: aheadMatch ? parseInt(aheadMatch[1], 10) || 0 : 0,
      remoteAhead: behindMatch ? parseInt(behindMatch[1], 10) || 0 : 0
    }
  }

  async function refreshBranchStatusInBackground(projectPath, branchName, cacheKey, cacheTimestampKey) {
    try {
      safeLog(`🔄 [后台刷新] 开始刷新分支状态: ${projectPath} (${branchName})`)

      const [statusResult, currentBranchResult, porcelainResult] = await Promise.all([
        executeGitCommand(['git', 'status', '--porcelain'], projectPath),
        executeGitCommand(['git', 'branch', '--show-current'], projectPath),
        executeGitCommand(['git', 'status', '--porcelain=v2', '--branch'], projectPath)
      ])

      const currentBranch = currentBranchResult.success && currentBranchResult.stdout ? currentBranchResult.stdout.trim() : 'unknown'
      if (currentBranch !== branchName) {
        safeLog(`⚠️ [后台刷新] 分支已切换，跳过刷新: ${branchName} -> ${currentBranch}`)
        return
      }

      await deduplicatedFetch(projectPath)

      const hasPendingFiles = statusResult.success && statusResult.stdout ? statusResult.stdout.trim().length > 0 : false
      let remoteAhead = 0
      let localAhead = 0
      const porcelain = porcelainResult.success ? parsePorcelainV2Branch(porcelainResult.stdout || '') : null
      if (porcelain && porcelain.currentBranch === currentBranch && porcelain.upstream) {
        remoteAhead = porcelain.behind
        localAhead = porcelain.ahead
      } else {
        const remoteExistsResult = await executeGitCommand(['git', 'rev-parse', '--verify', `origin/${currentBranch}`], projectPath)
        if (remoteExistsResult.success) {
          const [remoteAheadResult, localAheadResult] = await Promise.all([
            executeGitCommand(['git', 'rev-list', '--count', `${currentBranch}..origin/${currentBranch}`], projectPath),
            executeGitCommand(['git', 'rev-list', '--count', `origin/${currentBranch}..${currentBranch}`], projectPath)
          ])
          remoteAhead = remoteAheadResult.success && remoteAheadResult.stdout ? parseInt(remoteAheadResult.stdout.trim()) || 0 : 0
          localAhead = localAheadResult.success && localAheadResult.stdout ? parseInt(localAheadResult.stdout.trim()) || 0 : 0
        }
      }

      const currentBranchStatus = { hasNewCommits: hasPendingFiles, remoteAhead, localAhead }
      const existingCache = store.get(cacheKey, null)
      const allBranchStatus = existingCache && existingCache.allBranchStatus ? { ...existingCache.allBranchStatus } : {}
      allBranchStatus[currentBranch] = currentBranchStatus

      const resultData = {
        hasPendingFiles,
        currentBranchStatus,
        allBranchStatus,
        pushStatus: currentBranchStatus,
        pullStatus: currentBranchStatus,
        hasConflictFiles: false,
        conflictMessage: 'no_conflict',
        conflictFiles: [],
        currentBranch
      }

      store.set(cacheKey, resultData)
      store.set(cacheTimestampKey, Date.now())
      safeLog(`✅ [后台刷新] 已更新缓存: ${projectPath} (${currentBranch}), remoteAhead=${remoteAhead}, localAhead=${localAhead}`)

      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('branch-status-cache-updated', {
          projectPath,
          branchName: currentBranch,
          data: resultData
        })
      }
    } catch (error) {
      safeError('❌ [后台刷新] 刷新失败:', error.message)
    }
  }

  async function getBranchInfoFromPath(repoPath) {
    try {
      await deduplicatedFetch(repoPath)
    } catch (error) {
      console.warn(`⚠️ fetch 失败（继续执行）: ${error.message}`)
    }

    const currentResult = await executeGitCommand(['git', 'branch', '--show-current'], repoPath)
    let currentBranch = currentResult.success && currentResult.stdout ? currentResult.stdout.trim() : ''
    safeLog(`🔍 [getBranchInfoFromPath] 获取到的当前分支: "${currentBranch}"`)

    if (!currentBranch || currentBranch === '') {
      const tagResult = await executeGitCommand(['git', 'describe', '--tags', '--exact-match', 'HEAD'], repoPath)
      if (tagResult.success && tagResult.stdout && tagResult.stdout.trim()) {
        currentBranch = `HEAD detached at ${tagResult.stdout.trim()}`
      } else {
        const commitResult = await executeGitCommand(['git', 'rev-parse', '--short', 'HEAD'], repoPath)
        currentBranch = commitResult.success && commitResult.stdout && commitResult.stdout.trim()
          ? `HEAD detached at ${commitResult.stdout.trim()}`
          : 'HEAD detached'
      }
    }

    let allBranches = []
    let allBranchesWithStatus = {}

    const forEachRefResult = await executeGitCommand(
      ['git', 'for-each-ref', '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)', 'refs/heads'],
      repoPath
    )
    if (forEachRefResult.success && forEachRefResult.stdout) {
      const lines = forEachRefResult.stdout.trim().split('\n').filter(line => line.trim())
      for (const line of lines) {
        const [branchName = '', upstream = '', track = ''] = line.split('\t')
        if (!branchName) continue
        const { localAhead, remoteAhead } = parseTrackInfo(track)
        allBranches.push(branchName)
        allBranchesWithStatus[branchName] = {
          localAhead,
          remoteAhead,
          hasNewCommits: localAhead > 0 || remoteAhead > 0,
          isLocalOnly: !upstream
        }
      }
    } else {
      const localBranchResult = await executeGitCommand(['git', 'branch'], repoPath)
      if (localBranchResult.success && localBranchResult.stdout) {
        allBranches = localBranchResult.stdout
          .split('\n')
          .map(line => line.replace(/^\s*\*?\s*/, '').trim())
          .filter(line => line.length > 0 && !line.includes('->'))
        for (const branchName of allBranches) {
          allBranchesWithStatus[branchName] = {
            localAhead: 0,
            remoteAhead: 0,
            hasNewCommits: false,
            isLocalOnly: true
          }
        }
      }
    }

    const remoteBranchResult = await executeGitCommand(['git', 'branch', '-r'], repoPath)
    const remoteBranches = []
    if (remoteBranchResult.success && remoteBranchResult.stdout) {
      const branches = remoteBranchResult.stdout
        .split('\n')
        .map(line => line.replace(/^\s*origin\//, '').trim())
        .filter(line => line.length > 0 && !line.includes('->') && line !== 'HEAD')
      remoteBranches.push(...branches)
    }

    let currentBranchStatus = { localAhead: 0, remoteAhead: 0, hasNewCommits: false }
    if (currentBranch && !currentBranch.includes('HEAD detached')) {
      if (allBranchesWithStatus[currentBranch]) {
        currentBranchStatus = { ...allBranchesWithStatus[currentBranch] }
      }
    } else {
      safeLog('⚠️ [getBranchInfoFromPath] 当前分支为空或是 detached HEAD，跳过计算')
    }

    const statusResult = await executeGitCommand(['git', 'status', '--porcelain'], repoPath)
    const conflictFiles = []
    if (statusResult.success && statusResult.stdout) {
      const lines = statusResult.stdout.trim().split('\n')
      for (const line of lines) {
        if (line.length >= 2) {
          const status = line.substring(0, 2)
          const filename = line.substring(3)
          if (status.includes('U') || status.includes('A') || status.includes('D')) {
            conflictFiles.push({ status, filename })
          }
        }
      }
    }

    const hasConflictFiles = conflictFiles.length > 0
    const conflictMessage = hasConflictFiles ? `发现 ${conflictFiles.length} 个冲突文件: ${conflictFiles.map(f => f.filename).join(', ')}` : 'no_conflict'
    const hasPendingFiles = statusResult.success && statusResult.stdout ? statusResult.stdout.trim().length > 0 : false
    if (currentBranch && !currentBranch.includes('HEAD detached')) {
      currentBranchStatus = {
        ...currentBranchStatus,
        hasNewCommits: currentBranchStatus.hasNewCommits || hasPendingFiles
      }
      allBranchesWithStatus[currentBranch] = {
        ...(allBranchesWithStatus[currentBranch] || { localAhead: 0, remoteAhead: 0, isLocalOnly: true }),
        hasNewCommits: currentBranchStatus.hasNewCommits
      }
    }

    safeLog('🔍 后端 getBranchInfoFromPath 调试信息:', {
      path: repoPath,
      currentBranch,
      hasConflictFiles,
      conflictFiles: conflictFiles.map(f => `${f.status} ${f.filename}`),
      conflictMessage: conflictMessage.substring(0, 100) + (conflictMessage.length > 100 ? '...' : '')
    })

    return {
      current: currentBranch,
      all: allBranches,
      remote: remoteBranches,
      allBranchStatus: allBranchesWithStatus,
      currentBranchStatus,
      hasConflictFiles,
      conflictMessage,
      conflictFiles
    }
  }

  async function getProjectGitMonitorSnapshot(projectPath) {
    const porcelainResult = await executeGitCommand(
      ['git', 'status', '--porcelain=v2', '--branch'],
      projectPath
    )

    if (!porcelainResult.success) {
      throw new Error(porcelainResult.error || '获取 Git 快照失败')
    }

    let isMerging = false
    let isRebasing = false

    const gitDirResult = await executeGitCommand(
      ['git', 'rev-parse', '--git-dir'],
      projectPath
    )

    if (gitDirResult.success && gitDirResult.stdout?.trim()) {
      const rawGitDir = gitDirResult.stdout.trim()
      const gitDirPath = path.isAbsolute(rawGitDir)
        ? rawGitDir
        : path.join(projectPath, rawGitDir)

      isMerging = fs.existsSync(path.join(gitDirPath, 'MERGE_HEAD'))
      isRebasing = (
        fs.existsSync(path.join(gitDirPath, 'rebase-merge')) ||
        fs.existsSync(path.join(gitDirPath, 'rebase-apply'))
      )
    }

    return buildProjectGitMonitorSnapshot({
      porcelain: porcelainResult.stdout || '',
      isMerging,
      isRebasing
    })
  }

  async function getProjectGitWatchSignature(projectPath) {
    const gitDirResult = await executeGitCommand(
      ['git', 'rev-parse', '--git-dir'],
      projectPath
    )

    if (!gitDirResult.success || !gitDirResult.stdout?.trim()) {
      throw new Error(gitDirResult.error || '获取 git 目录失败')
    }

    const rawGitDir = gitDirResult.stdout.trim()
    const gitDirPath = path.isAbsolute(rawGitDir)
      ? rawGitDir
      : path.join(projectPath, rawGitDir)

    const statParts = []
    const appendStat = (label, targetPath) => {
      try {
        const stat = fs.statSync(targetPath)
        statParts.push(`${label}:${Math.trunc(stat.mtimeMs)}`)
      } catch (error) {
        statParts.push(`${label}:0`)
      }
    }

    appendStat('HEAD', path.join(gitDirPath, 'HEAD'))
    appendStat('index', path.join(gitDirPath, 'index'))
    appendStat('FETCH_HEAD', path.join(gitDirPath, 'FETCH_HEAD'))
    appendStat('packed-refs', path.join(gitDirPath, 'packed-refs'))
    appendStat('MERGE_HEAD', path.join(gitDirPath, 'MERGE_HEAD'))
    appendStat('rebase-merge', path.join(gitDirPath, 'rebase-merge'))
    appendStat('rebase-apply', path.join(gitDirPath, 'rebase-apply'))

    try {
      const headsDir = path.join(gitDirPath, 'refs', 'heads')
      if (fs.existsSync(headsDir)) {
        const entries = fs.readdirSync(headsDir)
        for (const entry of entries) {
          appendStat(`refs/heads/${entry}`, path.join(headsDir, entry))
        }
      }
    } catch (error) {
      // ignore
    }

    return {
      gitDirPath,
      signature: statParts.join('|')
    }
  }

  ipcMain.handle('get-branch-list', async (event, data) => {
    try {
      safeLog(`🌿 获取分支列表: ${data.path}`)
      const result = await executeGitCommand(['git', 'branch', '-a'], data.path)
      if (result.success && result.stdout) {
        const branches = result.stdout.trim().split('\n')
        const localBranches = branches
          .filter(branch => !branch.includes('->') && !branch.includes('remotes/origin'))
          .map(branch => branch.replace(/^\*\s*/, '').trim())
          .filter(Boolean)
        const remoteBranches = branches
          .filter(branch => branch.includes('remotes/origin') && !branch.includes('HEAD'))
          .map(branch => branch.replace(/remotes\/origin\//, '').trim())
          .filter(Boolean)
        let currentBranch = branches.find(branch => branch.startsWith('*'))?.replace(/^\*\s*/, '').trim() || ''

        if (!currentBranch || currentBranch === '') {
          const tagResult = await executeGitCommand(['git', 'describe', '--tags', '--exact-match', 'HEAD'], data.path)
          if (tagResult.success && tagResult.stdout && tagResult.stdout.trim()) {
            currentBranch = `HEAD detached at ${tagResult.stdout.trim()}`
          } else {
            const commitResult = await executeGitCommand(['git', 'rev-parse', '--short', 'HEAD'], data.path)
            currentBranch = commitResult.success && commitResult.stdout && commitResult.stdout.trim()
              ? `HEAD detached at ${commitResult.stdout.trim()}`
              : 'HEAD detached'
          }
        }

        return {
          success: true,
          data: { current: currentBranch, all: localBranches, remote: remoteBranches }
        }
      }
      return result
    } catch (error) {
      safeError('❌ 获取分支列表失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-project-git-watch-signature', async (event, data) => {
    try {
      const result = await getProjectGitWatchSignature(data.path)
      return { success: true, data: result }
    } catch (error) {
      safeError('❌ 获取项目 Git watch 签名失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}`, data: null }
    }
  })

  ipcMain.handle('get-branch-status-cache', async (event, data) => {
    try {
      const cacheKey = `branch-status-${data.path}`
      const cacheTimestampKey = `branch-status-timestamp-${data.path}`
      const cachedData = store.get(cacheKey, null)
      const cacheTimestamp = store.get(cacheTimestampKey, 0)
      if (cachedData) {
        return {
          success: true,
          data: cachedData,
          fromCache: true,
          cacheAge: Date.now() - cacheTimestamp
        }
      }
      return { success: false, message: '无缓存数据', data: null }
    } catch (error) {
      safeError('❌ 读取分支状态缓存失败:', error.message)
      return { success: false, message: `读取缓存失败: ${error.message}`, data: null }
    }
  })

  ipcMain.handle('clear-branch-status-cache', async (event, data) => {
    try {
      const cacheKey = `branch-status-${data.path}`
      const cacheTimestampKey = `branch-status-timestamp-${data.path}`
      store.delete(cacheKey)
      store.delete(cacheTimestampKey)
      safeLog(`🗑️ [clear-branch-status-cache] 已清除缓存: ${data.path}`)
      return { success: true, message: '缓存已清除' }
    } catch (error) {
      safeError('❌ 清除分支状态缓存失败:', error.message)
      return { success: false, message: `清除缓存失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-branch-status', async (event, data) => {
    try {
      safeLog(`📊 获取分支状态: ${data.path}`)
      const [statusResult, currentBranchResult, porcelainResult] = await Promise.all([
        cachedGitStatus(data.path),
        executeGitCommand(['git', 'branch', '--show-current'], data.path),
        executeGitCommand(['git', 'status', '--porcelain=v2', '--branch'], data.path)
      ])
      const currentBranch = currentBranchResult.success && currentBranchResult.stdout ? currentBranchResult.stdout.trim() : 'unknown'
      const cacheKey = `branch-status-${data.path}`
      const cacheTimestampKey = `branch-status-timestamp-${data.path}`
      const CACHE_DURATION = 5 * 60 * 1000
      const cachedData = store.get(cacheKey, null)
      const cacheTimestamp = store.get(cacheTimestampKey, 0)
      const now = Date.now()
      const isCacheValid = cachedData && (now - cacheTimestamp < CACHE_DURATION)

      if (isCacheValid) {
        safeLog(`✅ [get-branch-status] 使用缓存数据: ${data.path} (${currentBranch})`)
        refreshBranchStatusInBackground(data.path, currentBranch, cacheKey, cacheTimestampKey)
        return { success: true, data: cachedData, fromCache: true }
      }

      await deduplicatedFetch(data.path)
      const hasPendingFiles = statusResult.success && statusResult.stdout ? statusResult.stdout.trim().length > 0 : false
      let remoteAhead = 0
      let localAhead = 0

      const porcelain = porcelainResult.success ? parsePorcelainV2Branch(porcelainResult.stdout || '') : null
      if (porcelain && porcelain.currentBranch === currentBranch && porcelain.upstream) {
        remoteAhead = porcelain.behind
        localAhead = porcelain.ahead
      } else {
        const remoteExistsResult = await executeGitCommand(['git', 'rev-parse', '--verify', `origin/${currentBranch}`], data.path)
        if (remoteExistsResult.success) {
          const [remoteAheadResult, localAheadResult] = await Promise.all([
            executeGitCommand(['git', 'rev-list', '--count', `${currentBranch}..origin/${currentBranch}`], data.path),
            executeGitCommand(['git', 'rev-list', '--count', `origin/${currentBranch}..${currentBranch}`], data.path)
          ])
          if (!remoteAheadResult.success) safeError(`❌ [get-branch-status] 计算当前分支 ${currentBranch} 的 remoteAhead 失败:`, remoteAheadResult.error, remoteAheadResult.stderr)
          if (!localAheadResult.success) safeError(`❌ [get-branch-status] 计算当前分支 ${currentBranch} 的 localAhead 失败:`, localAheadResult.error, localAheadResult.stderr)
          remoteAhead = remoteAheadResult.success && remoteAheadResult.stdout ? parseInt(remoteAheadResult.stdout.trim()) || 0 : 0
          localAhead = localAheadResult.success && localAheadResult.stdout ? parseInt(localAheadResult.stdout.trim()) || 0 : 0
        } else {
          try {
            const upstreamResult = await executeGitCommand(['git', 'rev-parse', '--verify', '@{upstream}'], data.path)
            if (upstreamResult.success) {
              const aheadResult = await executeGitCommand(['git', 'rev-list', '--count', '@{upstream}..HEAD'], data.path)
              localAhead = aheadResult.success && aheadResult.stdout ? parseInt(aheadResult.stdout.trim()) || 0 : 0
            }
          } catch (error) {
            localAhead = 0
          }
        }
      }

      const currentBranchStatus = { hasNewCommits: hasPendingFiles, remoteAhead, localAhead }
      safeLog(`✅ [get-branch-status] 当前分支 ${currentBranch} 状态: remoteAhead=${remoteAhead}, localAhead=${localAhead}`)

      const allBranchStatus = {}
      const forEachRefResult = await executeGitCommand(
        ['git', 'for-each-ref', '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)', 'refs/heads'],
        data.path
      )
      if (forEachRefResult.success && forEachRefResult.stdout) {
        const lines = forEachRefResult.stdout.trim().split('\n').filter(l => l.trim())
        for (const line of lines) {
          const [branchName = '', upstream = '', track = ''] = line.split('\t')
          if (!branchName) continue
          if (!upstream) {
            allBranchStatus[branchName] = {
              hasNewCommits: branchName === currentBranch && hasPendingFiles,
              remoteAhead: 0,
              localAhead: 0,
              isLocalOnly: true
            }
            continue
          }
          const counts = parseTrackInfo(track)
          allBranchStatus[branchName] = {
            hasNewCommits: branchName === currentBranch && hasPendingFiles,
            remoteAhead: counts.remoteAhead,
            localAhead: counts.localAhead,
            isLocalOnly: false
          }
        }
      }

      allBranchStatus[currentBranch] = {
        hasNewCommits: currentBranchStatus.hasNewCommits,
        remoteAhead: currentBranchStatus.remoteAhead,
        localAhead: currentBranchStatus.localAhead,
        isLocalOnly: false
      }
      safeLog(`✅ [get-branch-status] 最终 allBranchStatus[${currentBranch}]:`, allBranchStatus[currentBranch])

      const conflictFiles = []
      if (statusResult.success && statusResult.stdout) {
        const lines = statusResult.stdout.trim().split('\n')
        for (const line of lines) {
          if (line.length >= 2) {
            const status = line.substring(0, 2)
            const filename = line.substring(3)
            if (status.includes('U') || status.includes('A') || status.includes('D')) {
              conflictFiles.push({ status, filename })
            }
          }
        }
      }
      const hasConflictFiles = conflictFiles.length > 0
      const conflictMessage = hasConflictFiles ? `发现 ${conflictFiles.length} 个冲突文件: ${conflictFiles.map(f => f.filename).join(', ')}` : 'no_conflict'
      safeLog('🔍 后端 getBranchStatus 调试信息:', {
        path: data.path,
        currentBranch,
        hasConflictFiles,
        conflictFiles: conflictFiles.map(f => `${f.status} ${f.filename}`),
        conflictMessage: conflictMessage.substring(0, 100) + (conflictMessage.length > 100 ? '...' : '')
      })

      const resultData = {
        hasPendingFiles,
        currentBranchStatus,
        allBranchStatus,
        pushStatus: currentBranchStatus,
        pullStatus: currentBranchStatus,
        hasConflictFiles,
        conflictMessage,
        conflictFiles,
        currentBranch
      }

      store.set(cacheKey, resultData)
      store.set(cacheTimestampKey, now)
      safeLog(`💾 [get-branch-status] 已保存到缓存: ${data.path} (${currentBranch})`)
      return { success: true, data: resultData, fromCache: false }
    } catch (error) {
      safeError('❌ 获取分支状态失败:', error.message)
      try {
        const cacheKey = `branch-status-${data.path}`
        const cachedData = store.get(cacheKey, null)
        if (cachedData) {
          safeLog(`⚠️ [get-branch-status] 刷新失败，使用过期缓存: ${data.path}`)
          return { success: true, data: cachedData, fromCache: true, cacheExpired: true }
        }
      } catch (cacheError) {
        // ignore
      }
      return {
        success: false,
        message: `获取失败: ${error.message}`,
        data: {
          hasPendingFiles: false,
          currentBranchStatus: { hasNewCommits: false, remoteAhead: 0, localAhead: 0 },
          allBranchStatus: {},
          pushStatus: {},
          pullStatus: {},
          hasConflictFiles: false,
          conflictMessage: 'no_conflict',
          conflictFiles: [],
          currentBranch: 'unknown'
        }
      }
    }
  })

  ipcMain.handle('get-branch-info', async (event, data) => {
    try {
      safeLog(`ℹ️ 获取分支信息: ${data.path}`)
      const branchResult = await getBranchInfoFromPath(data.path)
      return { success: true, data: branchResult }
    } catch (error) {
      safeError('❌ 获取分支信息失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}` }
    }
  })

  ipcMain.handle('refresh-remote', async (event, data) => {
    try {
      safeLog(`🔄 刷新远程: ${data.path}`)
      const fetchResult = await executeGitCommand(['git', 'remote', 'update'], data.path)
      if (!fetchResult.success) {
        return { success: false, error: fetchResult.error }
      }
      const branchResult = await getBranchInfoFromPath(data.path)
      return {
        success: true,
        data: {
          pushStatus: {},
          allBranchStatus: branchResult.allBranchStatus || {},
          currentBranchStatus: branchResult.currentBranchStatus,
          remote: branchResult.remote || []
        }
      }
    } catch (error) {
      safeError('❌ 刷新远程失败:', error.message)
      return { success: false, error: `刷新失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-project-git-monitor-snapshot', async (event, data) => {
    try {
      const projectPath = data?.path || ''
      if (!projectPath) {
        return { success: false, message: '项目路径不能为空' }
      }

      const snapshot = await getProjectGitMonitorSnapshot(projectPath)
      return { success: true, data: snapshot }
    } catch (error) {
      safeError('❌ 获取项目 Git 监控快照失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}` }
    }
  })
}

module.exports = { registerBranchHandlers }
