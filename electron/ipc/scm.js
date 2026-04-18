function registerScmHandlers({ ipcMain, BrowserWindow, fs, path, store, fetch, executeGitCommand, executeGitCommandWithOutput, checkAndFixRemoteUrl, getGitlabProjectId, safeLog, safeError }) {
  const fsp = fs.promises
  const ACTIVE_PIPELINE_STATUSES = new Set(['running', 'pending', 'preparing', 'waiting_for_resource', 'created'])
  const getMainWindow = () => {
    const windows = BrowserWindow.getAllWindows()
    return windows.find(w => w.webContents.getURL().includes('localhost:5173')) || windows[0]
  }

  const sendGitOutput = (mainWindow, projectName, output, type) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('git-output-update', {
      projectName,
      output,
      type
    })
  }

  const parseGitlabRemote = (remoteUrl = '') => {
    const normalized = typeof remoteUrl === 'string' ? remoteUrl.trim() : ''
    if (!normalized) return null

    let match = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
    if (match) {
      return {
        baseUrl: `https://${match[1]}`,
        projectPath: match[2].replace(/\.git$/, '')
      }
    }

    match = normalized.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/)
    if (match) {
      return {
        baseUrl: match[1],
        projectPath: match[2].replace(/\.git$/, '')
      }
    }

    return null
  }

  const findMatchingGitlabConfig = ({ baseUrl = '', repoPath = '' } = {}) => {
    if (!baseUrl) return null
    const projectConfigKey = `gitlab-config-${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}`
    const projectConfig = store.get(projectConfigKey, null)
    if (projectConfig?.url === baseUrl && projectConfig?.token) {
      return projectConfig
    }

    const currentGitlabConfig = store.get('gitlab-config', null)
    if (currentGitlabConfig?.url === baseUrl && currentGitlabConfig?.token) {
      return currentGitlabConfig
    }

    const gitlabHistory = store.get('gitlabHistory', [])
    return gitlabHistory.find(config => config?.url === baseUrl && config?.token) || null
  }

  const resolveGitlabRepoContext = async (repoPath) => {
    if (!repoPath) {
      return { success: false, message: '缺少项目路径' }
    }

    const remoteResult = await executeGitCommand(['git', 'remote', 'get-url', 'origin'], repoPath)
    if (!remoteResult.success || !remoteResult.stdout?.trim()) {
      return { success: false, message: '未检测到 origin remote' }
    }

    const parsedRemote = parseGitlabRemote(remoteResult.stdout.trim())
    if (!parsedRemote?.baseUrl || !parsedRemote?.projectPath) {
      return { success: false, message: '无法解析 GitLab remote' }
    }

    const matchedConfig = findMatchingGitlabConfig({
      baseUrl: parsedRemote.baseUrl,
      repoPath
    })

    if (!matchedConfig?.token) {
      return { success: false, message: '未找到匹配的 GitLab 配置或 Token' }
    }

    const projectResult = await getGitlabProjectId(parsedRemote.baseUrl, matchedConfig.token, parsedRemote.projectPath)
    if (!projectResult.success) {
      return {
        success: false,
        message: projectResult.message || '无法获取 GitLab 项目 ID'
      }
    }

    return {
      success: true,
      baseUrl: parsedRemote.baseUrl,
      repoPath,
      remoteUrl: remoteResult.stdout.trim(),
      projectPath: parsedRemote.projectPath,
      projectId: projectResult.projectId,
      token: matchedConfig.token
    }
  }

  const formatPipeline = (pipeline = {}) => ({
    id: pipeline.id,
    iid: pipeline.iid,
    status: pipeline.status || 'unknown',
    ref: pipeline.ref || '',
    sha: pipeline.sha || '',
    source: pipeline.source || '',
    webUrl: pipeline.web_url || '',
    createdAt: pipeline.created_at || '',
    updatedAt: pipeline.updated_at || '',
    startedAt: pipeline.started_at || '',
    finishedAt: pipeline.finished_at || '',
    name: pipeline.name || '',
    isTag: Boolean(pipeline.tag),
    coverage: pipeline.coverage ?? null
  })

  const formatJob = (job = {}) => ({
    id: job.id,
    name: job.name || '',
    stage: job.stage || 'default',
    status: job.status || 'unknown',
    allowFailure: Boolean(job.allow_failure),
    createdAt: job.created_at || '',
    startedAt: job.started_at || '',
    finishedAt: job.finished_at || '',
    duration: typeof job.duration === 'number' ? job.duration : null,
    queuedDuration: typeof job.queued_duration === 'number' ? job.queued_duration : null,
    webUrl: job.web_url || '',
    user: job.user?.name || '',
    runner: job.runner?.description || ''
  })

  const groupJobsByStage = (jobs = []) => {
    const stageMap = new Map()
    for (const job of jobs) {
      if (!stageMap.has(job.stage)) {
        stageMap.set(job.stage, [])
      }
      stageMap.get(job.stage).push(job)
    }

    return Array.from(stageMap.entries()).map(([stage, stageJobs]) => ({
      stage,
      jobs: stageJobs,
      statusSummary: {
        running: stageJobs.filter(job => ACTIVE_PIPELINE_STATUSES.has(job.status)).length,
        success: stageJobs.filter(job => job.status === 'success').length,
        failed: stageJobs.filter(job => ['failed', 'canceled'].includes(job.status)).length
      }
    }))
  }

  // Git 操作 IPC 处理器
  ipcMain.handle('git-clone', async (event, { url, targetPath }) => {
    return await executeGitCommand(['git', 'clone', '--progress', url, targetPath], path.dirname(targetPath))
  })
  
  ipcMain.handle('git-status', async (event, { repoPath }) => {
    return await executeGitCommand(['git', 'status', '--porcelain'], repoPath)
  })
  
  ipcMain.handle('git-branch', async (event, { repoPath }) => {
    return await executeGitCommand(['git', 'branch', '-a'], repoPath)
  })
  
  ipcMain.handle('git-commit', async (event, { repoPath, message }) => {
    const addResult = await executeGitCommand(['git', 'add', '.'], repoPath)
    if (!addResult.success) return addResult
    return await executeGitCommand(['git', 'commit', '-m', message], repoPath)
  })
  
  ipcMain.handle('git-pull', async (event, { repoPath }) => {
    return await executeGitCommand(['git', 'pull'], repoPath)
  })
  
  ipcMain.handle('git-push', async (event, { repoPath }) => {
    return await executeGitCommand(['git', 'push'], repoPath)
  })
  
  // GitLab API 操作 IPC 处理器
  ipcMain.handle('gitlab-test', async (event, { url, token }) => {
    try {
      safeLog('🔍 测试GitLab连接:', url)
      safeLog('🔑 Token:', token ? `${token.substring(0, 8)}...` : '未提供')
      safeLog('🔧 Fetch 类型:', typeof fetch)
      safeLog('🔧 Global fetch 类型:', typeof global.fetch)
      
      // 使用 fetch
      const response = await fetch(`${url}/api/v4/user`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      safeLog('📡 响应状态:', response.status)
      
      if (response.ok) {
        const user = await response.json()
        safeLog('✅ 连接成功，用户:', user.username)
        return { success: true, user }
      } else {
        safeLog('❌ 连接失败:', response.status)
        return { success: false, message: `连接失败: ${response.status}` }
      }
    } catch (error) {
      safeError('❌ 连接异常:', error.message)
      return { success: false, message: `连接失败: ${error.message}` }
    }
  })
  
  ipcMain.handle('gitlab-groups', async (event, { url, token }) => {
    try {
      safeLog('🔍 获取顶级Groups:', url)
      const response = await fetch(`${url}/api/v4/groups?top_level_only=true&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const groups = await response.json()
        safeLog(`✅ 获取到 ${groups.length} 个顶级Groups`)
        return { success: true, groups }
      } else {
        safeError(`❌ 获取顶级Groups失败: ${response.status}`)
        return { success: false, message: `获取Groups失败: ${response.status}` }
      }
    } catch (error) {
      safeError(`❌ 获取顶级Groups失败: ${error.message}`)
      return { success: false, message: `获取Groups失败: ${error.message}` }
    }
  })
  
  // GitLab 创建Merge Request IPC处理器
  ipcMain.handle('gitlab-create-mr', async (event, { url, token, projectPath, sourceBranch, targetBranch, title, description }) => {
    try {
      safeLog('🔀 创建Merge Request:', { projectPath, sourceBranch, targetBranch, title })
      
      if (!url || !token || !projectPath || !sourceBranch || !targetBranch || !title) {
        return {
          success: false,
          message: 'GitLab URL、Token、项目路径、源分支、目标分支和标题都是必需的'
        }
      }
      
      // 清理URL格式
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
  
      // 获取项目ID（使用缓存）
      const projectResult = await getGitlabProjectId(cleanUrl, token, projectPath)
      if (!projectResult.success) {
        return projectResult
      }
      const projectId = projectResult.projectId
  
      safeLog('📁 项目ID:', projectId)
  
      // 创建Merge Request
      const createMrApiUrl = `${cleanUrl}/api/v4/projects/${projectId}/merge_requests`
      
      const mrData = {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: title,
        description: description || `Merge ${sourceBranch} into ${targetBranch}`,
        remove_source_branch: false
      }
      
      safeLog('📝 MR数据:', mrData)
      
      const mrResponse = await fetch(createMrApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Git-Project-Viewer/1.0'
        },
        body: JSON.stringify(mrData)
      })
      
      safeLog('📡 MR创建响应状态:', mrResponse.status)
      
      if (!mrResponse.ok) {
        const errorData = await mrResponse.json().catch(() => ({}))
        safeLog('❌ 创建MR失败:', errorData)
        
        let errorMessage = `创建MR失败: ${mrResponse.status} ${mrResponse.statusText}`
        if (errorData.message) {
          errorMessage += ` - ${errorData.message}`
        }
        if (errorData.error) {
          errorMessage += ` - ${errorData.error}`
        }
        
        return {
          success: false,
          message: errorMessage
        }
      }
      
      const mr = await mrResponse.json()
      safeLog('✅ MR创建成功:', mr.id)
      
      return {
        success: true,
        data: {
          id: mr.id,
          title: mr.title,
          sourceBranch: mr.source_branch,
          targetBranch: mr.target_branch,
          state: mr.state,
          author: mr.author?.name || 'Unknown',
          createdAt: mr.created_at,
          description: mr.description,
          webUrl: mr.web_url
        }
      }
      
    } catch (error) {
      safeError('❌ 创建MR异常:', error)
      return {
        success: false,
        message: `创建MR失败: ${error.message}`
      }
    }
  })
  
  // GitLab 获取项目Merge Requests IPC处理器
  ipcMain.handle('gitlab-project-mrs', async (event, { url, token, projectPath, state = 'opened' }) => {
    try {
      safeLog('📋 获取项目MR列表:', { projectPath, state })
      
      if (!url || !token || !projectPath) {
        return {
          success: false,
          message: 'GitLab URL、Token和项目路径都是必需的'
        }
      }
      
      // 清理URL格式
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
  
      // 获取项目ID（使用缓存）
      const projectResult = await getGitlabProjectId(cleanUrl, token, projectPath)
      if (!projectResult.success) {
        return projectResult
      }
      const projectId = projectResult.projectId
  
      // 获取Merge Requests
      const mrsApiUrl = `${cleanUrl}/api/v4/projects/${projectId}/merge_requests?state=${state}&per_page=100`
      
      const mrsResponse = await fetch(mrsApiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      if (!mrsResponse.ok) {
        const errorData = await mrsResponse.json().catch(() => ({}))
        safeLog('❌ 获取MR列表失败:', errorData)
        
        return {
          success: false,
          message: `获取MR列表失败: ${mrsResponse.status} ${mrsResponse.statusText}`
        }
      }
      
      const mrs = await mrsResponse.json()
      safeLog(`✅ 获取到${mrs.length}个MR`)
      
      // 格式化MR数据
      const formattedMRs = mrs.map(mr => ({
        id: mr.id,
        title: mr.title,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        state: mr.state,
        author: mr.author?.name || 'Unknown',
        createdAt: mr.created_at,
        description: mr.description || '',
        webUrl: mr.web_url
      }))
      
      return {
        success: true,
        data: formattedMRs
      }
      
    } catch (error) {
      safeError('❌ 获取MR列表异常:', error)
      return {
        success: false,
        message: `获取MR列表失败: ${error.message}`
      }
    }
  })

  ipcMain.handle('gitlab-project-pipelines', async (event, { projectPath, limit = 12 } = {}) => {
    try {
      const context = await resolveGitlabRepoContext(projectPath)
      if (!context.success) {
        return context
      }

      const pipelinesUrl = `${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines?per_page=${Math.max(1, Math.min(limit, 30))}&order_by=updated_at&sort=desc`
      const response = await fetch(pipelinesUrl, {
        headers: {
          'Authorization': `Bearer ${context.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'OpenGit/1.0'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        safeError('❌ 获取 GitLab pipelines 失败:', response.status, errorText)
        return {
          success: false,
          message: `获取 GitLab pipelines 失败: ${response.status} ${response.statusText}`
        }
      }

      const pipelines = (await response.json()).map(formatPipeline)
      const activePipelines = pipelines.filter(pipeline => ACTIVE_PIPELINE_STATUSES.has(pipeline.status))
      const recentPipelines = pipelines.filter(pipeline => !ACTIVE_PIPELINE_STATUSES.has(pipeline.status))

      return {
        success: true,
        data: {
          context: {
            baseUrl: context.baseUrl,
            projectPath: context.projectPath,
            projectId: context.projectId
          },
          activePipelines,
          recentPipelines,
          currentRunning: activePipelines[0] || null
        }
      }
    } catch (error) {
      safeError('❌ 获取 GitLab pipelines 异常:', error)
      return {
        success: false,
        message: `获取 GitLab pipelines 失败: ${error.message}`
      }
    }
  })

  ipcMain.handle('gitlab-pipeline-detail', async (event, { projectPath, pipelineId } = {}) => {
    try {
      if (!pipelineId) {
        return { success: false, message: '缺少 pipelineId' }
      }

      const context = await resolveGitlabRepoContext(projectPath)
      if (!context.success) {
        return context
      }

      const detailUrl = `${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines/${pipelineId}`
      const jobsUrl = `${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true`
      const [detailResponse, jobsResponse] = await Promise.all([
        fetch(detailUrl, {
          headers: {
            'Authorization': `Bearer ${context.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'OpenGit/1.0'
          }
        }),
        fetch(jobsUrl, {
          headers: {
            'Authorization': `Bearer ${context.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'OpenGit/1.0'
          }
        })
      ])

      if (!detailResponse.ok) {
        const errorText = await detailResponse.text()
        safeError('❌ 获取 GitLab pipeline 详情失败:', detailResponse.status, errorText)
        return {
          success: false,
          message: `获取 GitLab pipeline 详情失败: ${detailResponse.status} ${detailResponse.statusText}`
        }
      }

      if (!jobsResponse.ok) {
        const errorText = await jobsResponse.text()
        safeError('❌ 获取 GitLab pipeline jobs 失败:', jobsResponse.status, errorText)
        return {
          success: false,
          message: `获取 GitLab pipeline jobs 失败: ${jobsResponse.status} ${jobsResponse.statusText}`
        }
      }

      const pipeline = formatPipeline(await detailResponse.json())
      const jobs = (await jobsResponse.json()).map(formatJob)

      return {
        success: true,
        data: {
          context: {
            baseUrl: context.baseUrl,
            projectPath: context.projectPath,
            projectId: context.projectId
          },
          pipeline,
          jobs,
          stages: groupJobsByStage(jobs)
        }
      }
    } catch (error) {
      safeError('❌ 获取 GitLab pipeline 详情异常:', error)
      return {
        success: false,
        message: `获取 GitLab pipeline 详情失败: ${error.message}`
      }
    }
  })
  
  // 获取文件树IPC处理器
  ipcMain.handle('get-file-tree', async (event, { repoPath }) => {
    try {
      safeLog('🔍 获取文件树请求:', repoPath)
      if (!repoPath) {
        return { success: false, error: '缺少repoPath参数' }
      }
      if (!fs.existsSync(repoPath)) {
        return { success: false, error: `目录不存在: ${repoPath}` }
      }

      const entries = await fsp.readdir(repoPath)
      const visibleEntries = entries.filter(entry => entry !== '.git')
      const files = await Promise.all(visibleEntries.map(async (entry) => {
        const fullPath = path.join(repoPath, entry)
        const stats = await fsp.stat(fullPath)
        return {
          name: entry,
          path: fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.isFile() ? stats.size : undefined,
          level: 0,
          modified: stats.mtime.toISOString()
        }
      }))

      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      safeLog(`✅ 成功获取文件树: ${files.length} 个条目`)
      return { success: true, files, repoPath }
    } catch (error) {
      safeError('获取文件树失败:', error)
      return { success: false, error: error.message }
    }
  })
  
  ipcMain.handle('gitlab-group-details', async (event, { url, token, groupId }) => {
    try {
      const [subgroupsResponse, projectsResponse] = await Promise.all([
        fetch(`${url}/api/v4/groups/${groupId}/subgroups?per_page=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${url}/api/v4/groups/${groupId}/projects?per_page=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])
      
      const subgroups = subgroupsResponse.ok ? await subgroupsResponse.json() : []
      const projects = projectsResponse.ok ? await projectsResponse.json() : []
      
      return { success: true, subgroups, projects }
    } catch (error) {
      return { success: false, message: `获取Group详情失败: ${error.message}` }
    }
  })
  
  ipcMain.handle('gitlab-group-projects', async (event, { url, token, groupId }) => {
    try {
      safeLog('🔍 获取Group项目:', groupId)
      
      // 获取所有项目（支持分页）
      let allProjects = []
      let page = 1
      const perPage = 100
      
      while (true) {
        const projectsApiUrl = `${url}/api/v4/groups/${groupId}/projects?include_subgroups=true&per_page=${perPage}&page=${page}`
        
        try {
          const response = await fetch(projectsApiUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Git-Project-Viewer/1.0'
            }
          })
          
          if (!response.ok) {
            safeError(`❌ 获取Group项目失败: ${response.status}`)
            return { success: false, message: `获取项目失败: ${response.status}` }
          }
          
          const projects = await response.json()
          safeLog(`📄 第${page}页获取到${projects.length}个项目`)
          
          if (projects.length === 0) {
            // 没有更多项目了
            break
          }
          
          allProjects.push(...projects)
          
          // 如果返回的项目数少于每页数量，说明已经是最后一页
          if (projects.length < perPage) {
            break
          }
          
          page++
          
          // 防止无限循环，最多获取1000个项目
          if (page > 10) {
            safeLog('⚠️ 达到Group项目分页限制 (1000个项目)')
            break
          }
        } catch (pageError) {
          safeError(`❌ 获取第${page}页Group项目失败:`, pageError.message)
          break
        }
      }
      
      const projects = allProjects
      safeLog(`✅ Group ${groupId} 项目: ${projects.length} 个`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ 获取Group项目失败: ${error.message}`)
      return { success: false, message: `获取项目失败: ${error.message}` }
    }
  })
  
  // GitLab 搜索项目 API
  ipcMain.handle('gitlab-search-projects', async (event, { url, token, query }) => {
    try {
      safeLog('🔍 GitLab搜索项目:', query)
      
      if (!query || query.trim().length < 2) {
        return { success: false, message: '搜索关键词至少需要2个字符' }
      }
      
      const searchQuery = encodeURIComponent(query.trim())
      const searchUrl = `${url}/api/v4/projects?search=${searchQuery}&per_page=50&order_by=updated_at`
      
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      if (!response.ok) {
        safeError(`❌ GitLab搜索失败: ${response.status}`)
        return { success: false, message: `搜索失败: ${response.status}` }
      }
      
      const projects = await response.json()
      safeLog(`✅ GitLab搜索到 ${projects.length} 个项目`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ GitLab搜索失败: ${error.message}`)
      return { success: false, message: `搜索失败: ${error.message}` }
    }
  })
  
  // GitHub 搜索仓库 API
  ipcMain.handle('github-search-repos', async (event, { token, query, org }) => {
    try {
      safeLog('🔍 GitHub搜索仓库:', query, org ? `(组织: ${org})` : '(用户仓库)')
  
      if (!query || query.trim().length < 2) {
        return { success: false, message: '搜索关键词至少需要2个字符' }
      }
  
      // 获取用户所有仓库，然后在本地过滤
      let allRepos = []
      let page = 1
      const perPage = 100
      const searchTerm = query.trim().toLowerCase()
  
      while (true) {
        const reposUrl = org 
          ? `${GITHUB_API_URL}/orgs/${org}/repos?per_page=${perPage}&page=${page}&sort=updated`
          : `${GITHUB_API_URL}/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
  
        const response = await fetch(reposUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
  
        if (!response.ok) {
          safeError(`❌ GitHub获取仓库失败: ${response.status}`)
          return { success: false, message: `搜索失败: ${response.status}` }
        }
  
        const repos = await response.json()
        if (repos.length === 0) break
  
        allRepos.push(...repos)
        if (repos.length < perPage) break
        page++
        if (page > 10) break // 最多获取1000个仓库
      }
  
      // 在本地过滤匹配的仓库
      const repos = allRepos.filter(repo => 
        repo.name.toLowerCase().includes(searchTerm) ||
        (repo.description && repo.description.toLowerCase().includes(searchTerm)) ||
        repo.full_name.toLowerCase().includes(searchTerm)
      )
      safeLog(`✅ GitHub搜索到 ${repos.length} 个仓库（共 ${allRepos.length} 个）`)
      
      // 转换为与现有格式兼容的结构
      const projects = repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        name_with_namespace: repo.full_name,
        path_with_namespace: repo.full_name,
        default_branch: repo.default_branch,
        web_url: repo.html_url,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.clone_url
      }))
      
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ GitHub搜索失败: ${error.message}`)
      return { success: false, message: `搜索失败: ${error.message}` }
    }
  })
  
  // Gitee 搜索仓库 API
  ipcMain.handle('gitee-search-repos', async (event, { token, query, org }) => {
    try {
      safeLog('🔍 Gitee搜索仓库:', query, org ? `(组织: ${org})` : '(用户仓库)')
  
      if (!query || query.trim().length < 2) {
        return { success: false, message: '搜索关键词至少需要2个字符' }
      }
  
      // 获取用户所有仓库，然后在本地过滤
      let allRepos = []
      let page = 1
      const perPage = 100
      const searchTerm = query.trim().toLowerCase()
  
      while (true) {
        const reposUrl = org
          ? `${GITEE_API_URL}/orgs/${org}/repos?access_token=${token}&per_page=${perPage}&page=${page}`
          : `${GITEE_API_URL}/user/repos?access_token=${token}&per_page=${perPage}&page=${page}&sort=updated`
  
        const response = await fetch(reposUrl, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
  
        if (!response.ok) {
          safeError(`❌ Gitee获取仓库失败: ${response.status}`)
          return { success: false, message: `搜索失败: ${response.status}` }
        }
  
        const repos = await response.json()
        if (repos.length === 0) break
  
        allRepos.push(...repos)
        if (repos.length < perPage) break
        page++
        if (page > 10) break // 最多获取1000个仓库
      }
  
      // 在本地过滤匹配的仓库
      const filteredRepos = allRepos.filter(repo =>
        repo.name.toLowerCase().includes(searchTerm) ||
        (repo.description && repo.description.toLowerCase().includes(searchTerm)) ||
        repo.full_name.toLowerCase().includes(searchTerm)
      )
      safeLog(`✅ Gitee搜索到 ${filteredRepos.length} 个仓库（共 ${allRepos.length} 个）`)
  
      // 转换为与现有格式兼容的结构
      const projects = filteredRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        name_with_namespace: repo.full_name,
        path_with_namespace: repo.full_name,
        default_branch: repo.default_branch,
        web_url: repo.html_url,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.html_url + '.git'
      }))
  
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ Gitee搜索失败: ${error.message}`)
      return { success: false, message: `搜索失败: ${error.message}` }
    }
  })
  
  ipcMain.handle('gitlab-clone', async (event, { url, token, localPath, projects, groupName }) => {
    try {
      // 现在只处理单个项目
      safeLog(`🔍 接收到的克隆请求: projects数量=${projects ? projects.length : 'null'}`)
      if (!projects || projects.length !== 1) {
        safeLog(`❌ 项目数量错误: 期望1个，实际${projects ? projects.length : 'null'}个`)
        return { success: false, message: `此API只支持单个项目克隆，但接收到${projects ? projects.length : 0}个项目` }
      }
      
      const project = projects[0]
      safeLog(`🔄 开始克隆单个项目: ${project.name}`)
      
      // 创建目录结构
      let projectPath, projectDirName
      if (project.path_with_namespace) {
        projectDirName = path.basename(project.path_with_namespace)
        const namespacePath = project.path_with_namespace.split('/').slice(0, -1)
        
        if (namespacePath.length > 0) {
          const fullNamespacePath = path.join(localPath, ...namespacePath)
          if (!fs.existsSync(fullNamespacePath)) {
            fs.mkdirSync(fullNamespacePath, { recursive: true })
          }
          projectPath = path.join(fullNamespacePath, projectDirName)
        } else {
          projectPath = path.join(localPath, projectDirName)
        }
      } else {
        projectDirName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        projectPath = path.join(localPath, projectDirName)
      }
      
      safeLog(`📂 目标路径: ${projectPath}`)
      
      // 检查目录是否已存在
      if (fs.existsSync(projectPath)) {
        const gitPath = path.join(projectPath, '.git')
        const isValidGitRepo = fs.existsSync(gitPath)
        
        if (isValidGitRepo) {
          // 检查 Git 仓库是否完整（通过检查 .git 目录是否有基本文件）
          const gitHeadPath = path.join(gitPath, 'HEAD')
          const gitConfigPath = path.join(gitPath, 'config')
          const isCompleteRepo = fs.existsSync(gitHeadPath) && fs.existsSync(gitConfigPath)
          
          if (isCompleteRepo) {
            safeLog(`✅ 项目已存在且为有效Git仓库: ${project.name}`)
            
            // 检查和修正已有仓库的remote地址
            const correctCloneUrl = project.ssh_url_to_repo
            if (correctCloneUrl) {
              safeLog(`🔍 要修正的remote地址: ${correctCloneUrl}`)
              const remoteFixResult = await checkAndFixRemoteUrl(projectPath, correctCloneUrl, project.name)
              
              return {
                success: true,
                message: '项目已存在',
                path: projectPath,
                projectName: project.name,
                output: `项目目录已存在且为有效Git仓库: ${projectPath}${remoteFixResult.message !== '' ? '\n' + remoteFixResult.message : ''}`
              }
            } else {
              return {
                success: true,
                message: '项目已存在',
                path: projectPath,
                projectName: project.name,
                output: `项目目录已存在且为有效Git仓库: ${projectPath}`
              }
            }
          } else {
            safeLog(`⚠️ Git仓库不完整，删除并重新克隆: ${project.name}`)
            // Git 仓库不完整，删除目录
            fs.rmSync(projectPath, { recursive: true, force: true })
            safeLog(`🗑️ 已删除不完整的仓库目录: ${projectPath}`)
          }
        } else {
          // 检查目录是否为空
          const files = fs.readdirSync(projectPath)
          if (files.length === 0) {
            safeLog(`📁 目录为空，删除并继续克隆: ${project.name}`)
            fs.rmdirSync(projectPath)
          } else {
            safeLog(`❌ 目录存在但不是Git仓库: ${project.name}`)
            return {
              success: false,
              message: '目录已存在但不是Git仓库',
              path: projectPath,
              projectName: project.name,
              output: '目录中有文件但不是Git仓库，请手动删除目录后重新克隆'
            }
          }
        }
      }
      
      // 执行克隆 - 使用原始SSH URL
      const cloneUrl = project.ssh_url_to_repo
      
      if (!cloneUrl) {
        return {
          success: false,
          message: '项目没有SSH URL',
          path: projectPath,
          projectName: project.name,
          output: '此项目没有提供SSH克隆URL'
        }
      }
      
      safeLog(`📥 开始克隆: ${cloneUrl} -> ${projectPath}`)
      safeLog(`🔗 使用GitLab提供的SSH URL: ${cloneUrl}`)
      const mainWindow = getMainWindow()
      
      // 使用实时输出执行克隆
      const result = await executeGitCommandWithOutput(
        ['git', 'clone', '--progress', cloneUrl, projectPath],
        path.dirname(projectPath),
        (output, type) => {
          sendGitOutput(mainWindow, project.name, output, type)
        }
      )
      
      if (result.success) {
        safeLog(`✅ 项目克隆成功: ${project.name}`)
        
        // 克隆成功后检查和修正remote地址
        safeLog(`🔍 克隆成功后要检查的remote地址: ${cloneUrl}`)
        const remoteFixResult = await checkAndFixRemoteUrl(projectPath, cloneUrl, project.name)
        
        // 克隆成功后自动保存项目特定的GitLab配置
        try {
          // 从克隆URL中提取GitLab信息
          let gitlabBaseUrl = ''
          if (cloneUrl.includes('gitlab')) {
            if (cloneUrl.startsWith('git@')) {
              // SSH格式: git@gitlab.example.com:group/project.git
              const match = cloneUrl.match(/git@([^:]+):(.+)\.git$/)
              if (match) {
                gitlabBaseUrl = `https://${match[1]}`
              }
            } else if (cloneUrl.startsWith('http')) {
              // HTTPS格式: https://gitlab.example.com/group/project.git
              const match = cloneUrl.match(/(https?:\/\/[^\/]+)\/(.+)\.git$/)
              if (match) {
                gitlabBaseUrl = match[1]
              }
            }
          }
          
          if (gitlabBaseUrl) {
            // 获取当前的GitLab配置
            const currentGitlabConfig = store.get('gitlab-config', null)
            
            if (currentGitlabConfig && currentGitlabConfig.url === gitlabBaseUrl) {
              // 如果当前配置的URL与项目URL匹配，保存为项目特定配置
              const projectConfigKey = `gitlab-config-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
              store.set(projectConfigKey, currentGitlabConfig)
              safeLog(`💾 自动保存项目特定GitLab配置: ${projectConfigKey}`, {
                url: currentGitlabConfig.url,
                token: currentGitlabConfig.token ? currentGitlabConfig.token.substring(0, 10) + '...' : 'null'
              })
            } else {
              // 从GitLab历史配置中查找匹配的配置
              const gitlabHistory = store.get('gitlabHistory', [])
              const matchingConfig = gitlabHistory.find(config => config.url === gitlabBaseUrl)
              
              if (matchingConfig) {
                const projectConfigKey = `gitlab-config-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
                const projectConfig = {
                  url: gitlabBaseUrl,
                  token: matchingConfig.token
                }
                store.set(projectConfigKey, projectConfig)
                safeLog(`💾 从历史配置中自动保存项目特定GitLab配置: ${projectConfigKey}`, {
                  url: projectConfig.url,
                  token: projectConfig.token ? projectConfig.token.substring(0, 10) + '...' : 'null'
                })
              } else {
                safeLog(`⚠️ 未找到匹配的GitLab配置: ${gitlabBaseUrl}`)
              }
            }
          }
        } catch (error) {
          safeError(`❌ 保存项目特定GitLab配置失败:`, error.message)
        }
        
        return {
          success: true,
          message: '克隆成功',
          path: projectPath,
          projectName: project.name,
          output: `项目克隆成功: ${projectPath}${remoteFixResult.message !== '' ? '\n' + remoteFixResult.message : ''}`
        }
      } else {
        safeLog(`❌ 项目克隆失败: ${project.name}`)
        return {
          success: false,
          message: '克隆失败',
          path: projectPath,
          projectName: project.name,
          output: '克隆过程中出现错误'
        }
      }
      
    } catch (error) {
      safeError(`❌ 克隆异常: ${error.message}`)
      return { success: false, message: `克隆失败: ${error.message}` }
    }
  })
  
  // ==================== GitHub API 操作 IPC 处理器 ====================
  
  // GitHub API 基础URL
  const GITHUB_API_URL = 'https://api.github.com'
  
  // GitHub 测试连接
  ipcMain.handle('github-test', async (event, { token }) => {
    try {
      safeLog('🔍 测试GitHub连接')
      safeLog('🔑 Token:', token ? `${token.substring(0, 8)}...` : '未提供')
      
      const response = await fetch(`${GITHUB_API_URL}/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      safeLog('📡 响应状态:', response.status)
      
      if (response.ok) {
        const user = await response.json()
        safeLog('✅ GitHub连接成功，用户:', user.login)
        return { 
          success: true, 
          user: {
            username: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            id: user.id
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        safeLog('❌ GitHub连接失败:', response.status, errorData.message)
        return { success: false, message: `连接失败: ${response.status} - ${errorData.message || '未知错误'}` }
      }
    } catch (error) {
      safeError('❌ GitHub连接异常:', error.message)
      return { success: false, message: `连接失败: ${error.message}` }
    }
  })
  
  // GitHub 获取用户组织列表
  ipcMain.handle('github-orgs', async (event, { token }) => {
    try {
      safeLog('🔍 获取GitHub Organizations')
      const response = await fetch(`${GITHUB_API_URL}/user/orgs?per_page=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      if (response.ok) {
        const orgs = await response.json()
        safeLog(`✅ 获取到 ${orgs.length} 个Organizations`)
        
        // 将 GitHub Organizations 映射为与 GitLab Groups 兼容的格式
        const groups = orgs.map(org => ({
          id: org.id,
          name: org.login,
          description: org.description,
          avatar_url: org.avatar_url,
          web_url: `https://github.com/${org.login}`,
          // 添加一个特殊标记表示这是用户个人仓库的占位
          _isOrg: true
        }))
        
        // 添加用户个人仓库作为第一个选项
        groups.unshift({
          id: 'personal',
          name: '我的仓库 (Personal)',
          description: '您的个人仓库',
          _isPersonal: true
        })
        
        return { success: true, groups }
      } else {
        safeError(`❌ 获取Organizations失败: ${response.status}`)
        return { success: false, message: `获取Organizations失败: ${response.status}` }
      }
    } catch (error) {
      safeError(`❌ 获取Organizations失败: ${error.message}`)
      return { success: false, message: `获取Organizations失败: ${error.message}` }
    }
  })
  
  // GitHub 获取用户个人仓库
  ipcMain.handle('github-user-repos', async (event, { token }) => {
    try {
      safeLog('🔍 获取GitHub用户个人仓库')
      
      let allRepos = []
      let page = 1
      const perPage = 100
      
      while (true) {
        const response = await fetch(`${GITHUB_API_URL}/user/repos?per_page=${perPage}&page=${page}&sort=updated`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
        
        if (!response.ok) {
          safeError(`❌ 获取用户仓库失败: ${response.status}`)
          return { success: false, message: `获取仓库失败: ${response.status}` }
        }
        
        const repos = await response.json()
        safeLog(`📄 第${page}页获取到${repos.length}个仓库`)
        
        if (repos.length === 0) break
        
        allRepos.push(...repos)
        
        if (repos.length < perPage) break
        page++
        if (page > 10) {
          safeLog('⚠️ 达到仓库分页限制')
          break
        }
      }
      
      // 将 GitHub Repos 映射为与 GitLab Projects 兼容的格式
      const projects = allRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        path: repo.name,
        path_with_namespace: repo.full_name,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.clone_url,
        web_url: repo.html_url,
        default_branch: repo.default_branch,
        visibility: repo.private ? 'private' : 'public',
        namespace: {
          name: repo.owner.login,
          path: repo.owner.login
        },
        _platform: 'github'
      }))
      
      safeLog(`✅ 获取到 ${projects.length} 个个人仓库`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ 获取用户仓库失败: ${error.message}`)
      return { success: false, message: `获取仓库失败: ${error.message}` }
    }
  })
  
  // GitHub 获取组织仓库
  ipcMain.handle('github-org-repos', async (event, { token, orgName }) => {
    try {
      safeLog('🔍 获取GitHub组织仓库:', orgName)
      
      let allRepos = []
      let page = 1
      const perPage = 100
      
      while (true) {
        const response = await fetch(`${GITHUB_API_URL}/orgs/${orgName}/repos?per_page=${perPage}&page=${page}&sort=updated`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
        
        if (!response.ok) {
          safeError(`❌ 获取组织仓库失败: ${response.status}`)
          return { success: false, message: `获取仓库失败: ${response.status}` }
        }
        
        const repos = await response.json()
        safeLog(`📄 第${page}页获取到${repos.length}个仓库`)
        
        if (repos.length === 0) break
        
        allRepos.push(...repos)
        
        if (repos.length < perPage) break
        page++
        if (page > 10) {
          safeLog('⚠️ 达到仓库分页限制')
          break
        }
      }
      
      // 将 GitHub Repos 映射为与 GitLab Projects 兼容的格式
      const projects = allRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        path: repo.name,
        path_with_namespace: repo.full_name,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.clone_url,
        web_url: repo.html_url,
        default_branch: repo.default_branch,
        visibility: repo.private ? 'private' : 'public',
        namespace: {
          name: orgName,
          path: orgName
        },
        _platform: 'github'
      }))
      
      safeLog(`✅ 获取到组织 ${orgName} 的 ${projects.length} 个仓库`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ 获取组织仓库失败: ${error.message}`)
      return { success: false, message: `获取仓库失败: ${error.message}` }
    }
  })
  
  // GitHub 克隆项目
  ipcMain.handle('github-clone', async (event, { token, localPath, projects, groupName }) => {
    try {
      safeLog(`🔍 GitHub克隆请求: projects数量=${projects ? projects.length : 'null'}`)
      if (!projects || projects.length !== 1) {
        return { success: false, message: `此API只支持单个项目克隆，但接收到${projects ? projects.length : 0}个项目` }
      }
      
      const project = projects[0]
      safeLog(`🔄 开始克隆GitHub项目: ${project.name}`)
      
      // 创建目录结构
      let projectPath, projectDirName
      if (project.path_with_namespace) {
        projectDirName = path.basename(project.path_with_namespace)
        const namespacePath = project.path_with_namespace.split('/').slice(0, -1)
        
        if (namespacePath.length > 0) {
          const fullNamespacePath = path.join(localPath, ...namespacePath)
          if (!fs.existsSync(fullNamespacePath)) {
            fs.mkdirSync(fullNamespacePath, { recursive: true })
          }
          projectPath = path.join(fullNamespacePath, projectDirName)
        } else {
          projectPath = path.join(localPath, projectDirName)
        }
      } else {
        projectDirName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        projectPath = path.join(localPath, projectDirName)
      }
      
      safeLog(`📂 目标路径: ${projectPath}`)
      
      // 检查目录是否已存在
      if (fs.existsSync(projectPath)) {
        const gitPath = path.join(projectPath, '.git')
        const isValidGitRepo = fs.existsSync(gitPath)
        
        if (isValidGitRepo) {
          const gitHeadPath = path.join(gitPath, 'HEAD')
          const gitConfigPath = path.join(gitPath, 'config')
          const isCompleteRepo = fs.existsSync(gitHeadPath) && fs.existsSync(gitConfigPath)
          
          if (isCompleteRepo) {
            safeLog(`✅ 项目已存在且为有效Git仓库: ${project.name}`)
            return {
              success: true,
              message: '项目已存在',
              path: projectPath,
              projectName: project.name,
              output: `项目目录已存在且为有效Git仓库: ${projectPath}`
            }
          }
        }
        
        // 目录存在但不是有效Git仓库，删除重新克隆
        safeLog(`⚠️ 目录存在但不是有效Git仓库，将删除重新克隆: ${projectPath}`)
        fs.rmSync(projectPath, { recursive: true, force: true })
      }
      
      // 使用 SSH URL 克隆
      const cloneUrl = project.ssh_url_to_repo || project.http_url_to_repo
      safeLog(`🔗 克隆URL: ${cloneUrl}`)
      const mainWindow = getMainWindow()
      
      // 使用实时输出执行克隆
      const result = await executeGitCommandWithOutput(
        ['git', 'clone', '--progress', cloneUrl, projectPath],
        path.dirname(projectPath),
        (output, type) => {
          sendGitOutput(mainWindow, project.name, output, type)
        }
      )
      
      if (result.success) {
        safeLog(`✅ GitHub项目克隆成功: ${project.name}`)
        return {
          success: true,
          message: '克隆成功',
          path: projectPath,
          projectName: project.name,
          output: `项目克隆成功: ${projectPath}`
        }
      } else {
        safeLog(`❌ GitHub项目克隆失败: ${project.name}`)
        return {
          success: false,
          message: '克隆失败',
          path: projectPath,
          projectName: project.name,
          output: '克隆过程中出现错误'
        }
      }
      
    } catch (error) {
      safeError(`❌ GitHub克隆异常: ${error.message}`)
      return { success: false, message: `克隆失败: ${error.message}` }
    }
  })
  
  // ==================== Gitee API 操作 IPC 处理器 ====================
  
  // Gitee API 基础URL
  const GITEE_API_URL = 'https://gitee.com/api/v5'
  
  // Gitee 测试连接
  ipcMain.handle('gitee-test', async (event, { token }) => {
    try {
      safeLog('🔍 测试Gitee连接')
      safeLog('🔑 Token:', token ? `${token.substring(0, 8)}...` : '未提供')
      
      const response = await fetch(`${GITEE_API_URL}/user?access_token=${token}`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      safeLog('📡 响应状态:', response.status)
      
      if (response.ok) {
        const user = await response.json()
        safeLog('✅ Gitee连接成功，用户:', user.login)
        return { 
          success: true, 
          user: {
            username: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            id: user.id
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        safeLog('❌ Gitee连接失败:', response.status, errorData.message)
        return { success: false, message: `连接失败: ${response.status} - ${errorData.message || '未知错误'}` }
      }
    } catch (error) {
      safeError('❌ Gitee连接异常:', error.message)
      return { success: false, message: `连接失败: ${error.message}` }
    }
  })
  
  // Gitee 获取用户组织列表
  ipcMain.handle('gitee-orgs', async (event, { token }) => {
    try {
      safeLog('🔍 获取Gitee Organizations')
      const response = await fetch(`${GITEE_API_URL}/user/orgs?access_token=${token}&per_page=100`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Git-Project-Viewer/1.0'
        }
      })
      
      if (response.ok) {
        const orgs = await response.json()
        safeLog(`✅ 获取到 ${orgs.length} 个Organizations`)
        
        // 将 Gitee Organizations 映射为兼容格式
        const groups = orgs.map(org => ({
          id: org.id,
          name: org.login || org.name,
          description: org.description,
          avatar_url: org.avatar_url,
          web_url: org.url || `https://gitee.com/${org.login}`,
          _isOrg: true
        }))
        
        // 添加用户个人仓库作为第一个选项
        groups.unshift({
          id: 'personal',
          name: '我的仓库 (Personal)',
          description: '您的个人仓库',
          _isPersonal: true
        })
        
        return { success: true, groups }
      } else {
        safeError(`❌ 获取Organizations失败: ${response.status}`)
        return { success: false, message: `获取Organizations失败: ${response.status}` }
      }
    } catch (error) {
      safeError(`❌ 获取Organizations失败: ${error.message}`)
      return { success: false, message: `获取Organizations失败: ${error.message}` }
    }
  })
  
  // Gitee 获取用户个人仓库
  ipcMain.handle('gitee-user-repos', async (event, { token }) => {
    try {
      safeLog('🔍 获取Gitee用户个人仓库')
      
      let allRepos = []
      let page = 1
      const perPage = 100
      
      while (true) {
        const response = await fetch(`${GITEE_API_URL}/user/repos?access_token=${token}&per_page=${perPage}&page=${page}&sort=updated`, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
        
        if (!response.ok) {
          safeError(`❌ 获取用户仓库失败: ${response.status}`)
          return { success: false, message: `获取仓库失败: ${response.status}` }
        }
        
        const repos = await response.json()
        safeLog(`📄 第${page}页获取到${repos.length}个仓库`)
        
        if (repos.length === 0) break
        
        allRepos.push(...repos)
        
        if (repos.length < perPage) break
        page++
        if (page > 10) {
          safeLog('⚠️ 达到仓库分页限制')
          break
        }
      }
      
      // 将 Gitee Repos 映射为兼容格式
      const projects = allRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        path: repo.path,
        path_with_namespace: repo.full_name,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.html_url,
        web_url: repo.html_url,
        default_branch: repo.default_branch,
        visibility: repo.private ? 'private' : (repo.internal ? 'internal' : 'public'),
        namespace: {
          name: repo.owner?.login || repo.owner?.name,
          path: repo.owner?.login
        },
        _platform: 'gitee'
      }))
      
      safeLog(`✅ 获取到 ${projects.length} 个个人仓库`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ 获取用户仓库失败: ${error.message}`)
      return { success: false, message: `获取仓库失败: ${error.message}` }
    }
  })
  
  // Gitee 获取组织仓库
  ipcMain.handle('gitee-org-repos', async (event, { token, orgName }) => {
    try {
      safeLog('🔍 获取Gitee组织仓库:', orgName)
      
      let allRepos = []
      let page = 1
      const perPage = 100
      
      while (true) {
        const response = await fetch(`${GITEE_API_URL}/orgs/${orgName}/repos?access_token=${token}&per_page=${perPage}&page=${page}`, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Git-Project-Viewer/1.0'
          }
        })
        
        if (!response.ok) {
          safeError(`❌ 获取组织仓库失败: ${response.status}`)
          return { success: false, message: `获取仓库失败: ${response.status}` }
        }
        
        const repos = await response.json()
        safeLog(`📄 第${page}页获取到${repos.length}个仓库`)
        
        if (repos.length === 0) break
        
        allRepos.push(...repos)
        
        if (repos.length < perPage) break
        page++
        if (page > 10) {
          safeLog('⚠️ 达到仓库分页限制')
          break
        }
      }
      
      // 将 Gitee Repos 映射为兼容格式
      const projects = allRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        path: repo.path,
        path_with_namespace: repo.full_name,
        ssh_url_to_repo: repo.ssh_url,
        http_url_to_repo: repo.html_url,
        web_url: repo.html_url,
        default_branch: repo.default_branch,
        visibility: repo.private ? 'private' : (repo.internal ? 'internal' : 'public'),
        namespace: {
          name: orgName,
          path: orgName
        },
        _platform: 'gitee'
      }))
      
      safeLog(`✅ 获取到组织 ${orgName} 的 ${projects.length} 个仓库`)
      return { success: true, projects }
    } catch (error) {
      safeError(`❌ 获取组织仓库失败: ${error.message}`)
      return { success: false, message: `获取仓库失败: ${error.message}` }
    }
  })
  
  // Gitee 克隆项目
  ipcMain.handle('gitee-clone', async (event, { token, localPath, projects, groupName }) => {
    try {
      safeLog(`🔍 Gitee克隆请求: projects数量=${projects ? projects.length : 'null'}`)
      if (!projects || projects.length !== 1) {
        return { success: false, message: `此API只支持单个项目克隆，但接收到${projects ? projects.length : 0}个项目` }
      }
      
      const project = projects[0]
      safeLog(`🔄 开始克隆Gitee项目: ${project.name}`)
      
      // 创建目录结构
      let projectPath, projectDirName
      if (project.path_with_namespace) {
        projectDirName = path.basename(project.path_with_namespace)
        const namespacePath = project.path_with_namespace.split('/').slice(0, -1)
        
        if (namespacePath.length > 0) {
          const fullNamespacePath = path.join(localPath, ...namespacePath)
          if (!fs.existsSync(fullNamespacePath)) {
            fs.mkdirSync(fullNamespacePath, { recursive: true })
          }
          projectPath = path.join(fullNamespacePath, projectDirName)
        } else {
          projectPath = path.join(localPath, projectDirName)
        }
      } else {
        projectDirName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        projectPath = path.join(localPath, projectDirName)
      }
      
      safeLog(`📂 目标路径: ${projectPath}`)
      
      // 检查目录是否已存在
      if (fs.existsSync(projectPath)) {
        const gitPath = path.join(projectPath, '.git')
        const isValidGitRepo = fs.existsSync(gitPath)
        
        if (isValidGitRepo) {
          const gitHeadPath = path.join(gitPath, 'HEAD')
          const gitConfigPath = path.join(gitPath, 'config')
          const isCompleteRepo = fs.existsSync(gitHeadPath) && fs.existsSync(gitConfigPath)
          
          if (isCompleteRepo) {
            safeLog(`✅ 项目已存在且为有效Git仓库: ${project.name}`)
            return {
              success: true,
              message: '项目已存在',
              path: projectPath,
              projectName: project.name,
              output: `项目目录已存在且为有效Git仓库: ${projectPath}`
            }
          }
        }
        
        // 目录存在但不是有效Git仓库，删除重新克隆
        safeLog(`⚠️ 目录存在但不是有效Git仓库，将删除重新克隆: ${projectPath}`)
        fs.rmSync(projectPath, { recursive: true, force: true })
      }
      
      // 使用 SSH URL 克隆
      const cloneUrl = project.ssh_url_to_repo || project.http_url_to_repo
      safeLog(`🔗 克隆URL: ${cloneUrl}`)
      const mainWindow = getMainWindow()
      
      // 使用实时输出执行克隆
      const result = await executeGitCommandWithOutput(
        ['git', 'clone', '--progress', cloneUrl, projectPath],
        path.dirname(projectPath),
        (output, type) => {
          sendGitOutput(mainWindow, project.name, output, type)
        }
      )
      
      if (result.success) {
        safeLog(`✅ Gitee项目克隆成功: ${project.name}`)
        return {
          success: true,
          message: '克隆成功',
          path: projectPath,
          projectName: project.name,
          output: `项目克隆成功: ${projectPath}`
        }
      } else {
        safeLog(`❌ Gitee项目克隆失败: ${project.name}`)
        return {
          success: false,
          message: '克隆失败',
          path: projectPath,
          projectName: project.name,
          output: '克隆过程中出现错误'
        }
      }
      
    } catch (error) {
      safeError(`❌ Gitee克隆异常: ${error.message}`)
      return { success: false, message: `克隆失败: ${error.message}` }
    }
  })
  
}

module.exports = { registerScmHandlers }
