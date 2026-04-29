const GITHUB_API_URL = 'https://api.github.com'
const GITEE_API_URL = 'https://gitee.com/api/v5'

function parseGitlabRemote(remoteUrl = '') {
  const normalized = String(remoteUrl || '').trim()
  if (!normalized) return null
  let match = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (match) {
    return { baseUrl: `https://${match[1]}`, projectPath: match[2].replace(/\.git$/, '') }
  }
  match = normalized.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/)
  if (match && /gitlab/i.test(match[1])) {
    return { baseUrl: match[1], projectPath: match[2].replace(/\.git$/, '') }
  }
  return null
}

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 10000

function parseGithubRemote(remoteUrl = '') {
  const normalized = String(remoteUrl || '').trim()
  if (!normalized) return null
  let match = normalized.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (!match) match = normalized.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (!match) return null
  const repoPath = match[1].replace(/\.git$/, '')
  const [owner, repo] = repoPath.split('/')
  if (!owner || !repo) return null
  return { baseUrl: 'https://github.com', projectPath: repoPath, owner, repo }
}

function parseGiteeRemote(remoteUrl = '') {
  const normalized = String(remoteUrl || '').trim()
  if (!normalized) return null
  let match = normalized.match(/^git@gitee\.com:(.+?)(?:\.git)?$/)
  if (!match) match = normalized.match(/^https:\/\/gitee\.com\/(.+?)(?:\.git)?$/)
  if (!match) return null
  const repoPath = match[1].replace(/\.git$/, '')
  const [owner, repo] = repoPath.split('/')
  if (!owner || !repo) return null
  return { baseUrl: 'https://gitee.com', projectPath: repoPath, owner, repo }
}

function buildGithubHeaders(token = '') {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'OpenGit/1.0'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function buildGiteeHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': 'OpenGit/1.0'
  }
}

function buildGitlabHeaders(token = '') {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'OpenGit/1.0'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function findMatchingGitlabConfig(store, { baseUrl = '', repoPath = '' } = {}) {
  if (!baseUrl) return null
  const projectConfigKey = `gitlab-config-${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}`
  const projectConfig = store.get(projectConfigKey, null)
  if (projectConfig?.url === baseUrl && projectConfig?.token) return projectConfig
  const currentConfig = store.get('gitlab-config', null)
  if (currentConfig?.url === baseUrl && currentConfig?.token) return currentConfig
  const history = store.get('gitlabHistory', [])
  return Array.isArray(history) ? history.find((item) => item?.url === baseUrl && item?.token) || null : null
}

function findMatchingGithubConfig(store) {
  const current = store.get('gitlab-config', null)
  if (current?.platform === 'github' && current?.token) return current
  const history = store.get('gitlabHistory', [])
  return Array.isArray(history) ? history.find((item) => item?.platform === 'github' && item?.token) || null : null
}

function findMatchingGiteeConfig(store) {
  const current = store.get('gitlab-config', null)
  if (current?.platform === 'gitee' && current?.token) return current
  const history = store.get('gitlabHistory', [])
  return Array.isArray(history) ? history.find((item) => item?.platform === 'gitee' && item?.token) || null : null
}

function normalizeGithubStatus({ status = '', conclusion = '' } = {}) {
  const normalizedStatus = String(status || '').toLowerCase()
  const normalizedConclusion = String(conclusion || '').toLowerCase()
  if (['queued', 'requested', 'waiting', 'pending'].includes(normalizedStatus)) return 'pending'
  if (normalizedStatus === 'in_progress') return 'running'
  if (normalizedStatus !== 'completed') return normalizedStatus || 'unknown'
  if (normalizedConclusion === 'success') return 'success'
  if (['failure', 'timed_out', 'startup_failure'].includes(normalizedConclusion)) return 'failed'
  if (normalizedConclusion === 'cancelled') return 'canceled'
  if (['skipped', 'neutral', 'action_required', 'stale'].includes(normalizedConclusion)) return 'skipped'
  return normalizedConclusion || 'unknown'
}

function formatPipeline(pipeline = {}) {
  return {
    id: pipeline.id,
    iid: pipeline.iid,
    status: pipeline.status || 'unknown',
    ref: pipeline.ref || '',
    sha: pipeline.sha || '',
    source: pipeline.source || '',
    webUrl: pipeline.web_url || pipeline.webUrl || '',
    createdAt: pipeline.created_at || pipeline.createdAt || '',
    updatedAt: pipeline.updated_at || pipeline.updatedAt || '',
    startedAt: pipeline.started_at || pipeline.startedAt || '',
    finishedAt: pipeline.finished_at || pipeline.finishedAt || '',
    name: pipeline.name || '',
    provider: pipeline.provider || 'gitlab',
    providerLabel: pipeline.providerLabel || 'GitLab'
  }
}

function formatGithubRun(run = {}) {
  return {
    id: run.id,
    iid: run.run_number,
    status: normalizeGithubStatus({ status: run.status, conclusion: run.conclusion }),
    ref: run.head_branch || '',
    sha: run.head_sha || '',
    source: run.event || '',
    webUrl: run.html_url || '',
    createdAt: run.created_at || '',
    updatedAt: run.updated_at || '',
    startedAt: run.run_started_at || run.created_at || '',
    finishedAt: run.status === 'completed' ? (run.updated_at || '') : '',
    name: run.name || run.display_title || '',
    provider: 'github',
    providerLabel: 'GitHub'
  }
}

function formatJob(job = {}) {
  return {
    id: job.id,
    name: job.name || '',
    stage: job.stage || 'default',
    status: job.status || 'unknown',
    createdAt: job.created_at || '',
    startedAt: job.started_at || '',
    finishedAt: job.finished_at || '',
    webUrl: job.web_url || '',
    provider: job.provider || 'gitlab'
  }
}

function normalizeToolResponse(payload = {}, provider = 'unknown') {
  return {
    provider,
    id: payload.id ?? null,
    iid: payload.iid ?? payload.number ?? null,
    number: payload.number ?? payload.iid ?? null,
    state: payload.state || payload.status || payload.conclusion || '',
    webUrl: payload.webUrl || payload.web_url || payload.html_url || '',
    title: payload.title || payload.name || '',
    raw: payload
  }
}

function normalizeResponseHeaders(headers) {
  if (!headers) return {}
  if (typeof headers.forEach === 'function') {
    const out = {}
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = value
    })
    return out
  }
  if (headers instanceof Map) {
    return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [String(key).toLowerCase(), value]))
  }
  if (typeof headers === 'object') {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]))
  }
  return {}
}

function sanitizeRequestHeaders(headers = {}) {
  const out = {}
  const allowlist = new Set(['accept', 'content-type'])
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = String(rawKey || '').trim()
    if (!key) continue
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'authorization' || lowerKey === 'cookie' || lowerKey === 'host') continue
    if (!allowlist.has(lowerKey) && !lowerKey.startsWith('x-')) continue
    out[key] = String(rawValue)
  }
  return out
}

function createRemotesService({ store, executeGitCommand, fetch, getGitlabProjectId, requestTimeoutMs = DEFAULT_REMOTE_REQUEST_TIMEOUT_MS }) {
  const fetchWithTimeout = async (url, options = {}) => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    let timeoutId = null
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        if (controller) {
          try {
            controller.abort()
          } catch {}
        }
        reject(new Error(`Remote request timed out after ${requestTimeoutMs}ms`))
      }, requestTimeoutMs)
    })

    const fetchPromise = fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {})
    })

    try {
      return await Promise.race([fetchPromise, timeoutPromise])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  const resolveProviderContext = async (repoPath) => {
    const remoteResult = await executeGitCommand(['git', 'remote', 'get-url', 'origin'], repoPath)
    const remoteUrl = remoteResult?.success ? String(remoteResult.stdout || '').trim() : ''
    if (!remoteUrl) return { provider: 'unknown', context: null }

    const githubRemote = parseGithubRemote(remoteUrl)
    if (githubRemote) {
      const matchedConfig = findMatchingGithubConfig(store)
      return {
        provider: 'github',
        context: {
          ...githubRemote,
          repoPath,
          remoteUrl,
          token: matchedConfig?.token || ''
        }
      }
    }

    const giteeRemote = parseGiteeRemote(remoteUrl)
    if (giteeRemote) {
      const matchedConfig = findMatchingGiteeConfig(store)
      return {
        provider: 'gitee',
        context: {
          ...giteeRemote,
          repoPath,
          remoteUrl,
          token: matchedConfig?.token || ''
        }
      }
    }

    const gitlabRemote = parseGitlabRemote(remoteUrl)
    if (gitlabRemote) {
      const matchedConfig = findMatchingGitlabConfig(store, { baseUrl: gitlabRemote.baseUrl, repoPath })
      if (matchedConfig?.token) {
        const projectResult = await getGitlabProjectId(gitlabRemote.baseUrl, matchedConfig.token, gitlabRemote.projectPath)
        if (projectResult?.success) {
          return {
            provider: 'gitlab',
            context: {
              ...gitlabRemote,
              repoPath,
              remoteUrl,
              projectId: projectResult.projectId,
              token: matchedConfig.token
            }
          }
        }
      }
    }

    return { provider: 'unknown', context: null }
  }

  const buildProviderRequestContext = async (projectPath, explicitProvider = '') => {
    const { provider, context } = await resolveProviderContext(projectPath)
    if (!context || provider === 'unknown') {
      throw new Error('Unsupported or unresolved remote provider')
    }
    const normalizedExplicit = String(explicitProvider || '').trim().toLowerCase()
    if (normalizedExplicit && normalizedExplicit !== provider) {
      throw new Error(`Provider mismatch: expected ${provider}, got ${normalizedExplicit}`)
    }
    return { provider, context }
  }

  const buildProviderApiUrl = ({ provider, context, relativePath = '', query = {} }) => {
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
    if (!normalizedPath) {
      throw new Error('Relative API path is required')
    }

    let baseUrl = ''
    if (provider === 'gitlab') baseUrl = `${context.baseUrl}/api/v4`
    else if (provider === 'github') baseUrl = GITHUB_API_URL
    else if (provider === 'gitee') baseUrl = GITEE_API_URL
    else throw new Error(`Unsupported provider: ${provider}`)

    const url = new URL(`${baseUrl}/${normalizedPath}`)
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value == null || value === '') return
      url.searchParams.set(key, String(value))
    })
    if (provider === 'gitee' && context.token) {
      url.searchParams.set('access_token', context.token)
    }
    return url.toString()
  }

  const buildProviderHeaders = ({ provider, context, extraHeaders = {}, hasBody = false }) => {
    const sanitized = sanitizeRequestHeaders(extraHeaders)
    let headers = {}
    if (provider === 'gitlab') headers = buildGitlabHeaders(context.token)
    else if (provider === 'github') headers = buildGithubHeaders(context.token)
    else if (provider === 'gitee') headers = buildGiteeHeaders()
    if (hasBody && !Object.keys(sanitized).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json'
    }
    return {
      ...headers,
      ...sanitized
    }
  }

  const parseResponsePayload = async (response) => {
    const headers = normalizeResponseHeaders(response.headers)
    const contentType = String(headers['content-type'] || '')
    if (contentType.includes('application/json')) {
      return response.json()
    }
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  const requestRemoteApi = async ({
    projectPath = '',
    provider = '',
    method = 'GET',
    path: relativePath = '',
    query = {},
    body = undefined,
    headers = {}
  } = {}) => {
    const normalizedMethod = String(method || 'GET').trim().toUpperCase()
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      throw new Error(`Unsupported method: ${normalizedMethod}`)
    }

    const { provider: resolvedProvider, context } = await buildProviderRequestContext(projectPath, provider)
    const url = buildProviderApiUrl({
      provider: resolvedProvider,
      context,
      relativePath,
      query
    })
    const hasBody = body !== undefined && body !== null && normalizedMethod !== 'GET'
    const response = await fetchWithTimeout(url, {
      method: normalizedMethod,
      headers: buildProviderHeaders({
        provider: resolvedProvider,
        context,
        extraHeaders: headers,
        hasBody
      }),
      ...(hasBody ? { body: JSON.stringify(body) } : {})
    })

    const data = await parseResponsePayload(response)
    return {
      provider: resolvedProvider,
      status: response.status,
      headers: normalizeResponseHeaders(response.headers),
      data
    }
  }

  return {
    async detectProvider(projectPath) {
      const result = await resolveProviderContext(projectPath)
      return { provider: result.provider, supported: result.provider !== 'unknown' }
    },
    async getRepo(projectPath) {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (!context) return null
      return {
        provider,
        baseUrl: context.baseUrl,
        projectPath: context.projectPath,
        webUrl: `${context.baseUrl}/${context.projectPath}`,
        owner: context.owner || context.projectPath.split('/').slice(0, -1).join('/'),
        repo: context.repo || context.projectPath.split('/').pop(),
        remoteUrl: context.remoteUrl || ''
      }
    },
    async listBranches(projectPath) {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (!context) return []
      if (provider === 'gitlab') {
        const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/repository/branches?per_page=100`, {
          headers: { Authorization: `Bearer ${context.token}` }
        })
        if (!response.ok) throw new Error(`GitLab branches request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => ({ name: item.name, webUrl: item.web_url || '' })) : []
      }
      if (provider === 'github') {
        const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/branches?per_page=100`, {
          headers: buildGithubHeaders(context.token)
        })
        if (!response.ok) throw new Error(`GitHub branches request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => ({ name: item.name, webUrl: `https://github.com/${context.owner}/${context.repo}/tree/${item.name}` })) : []
      }
      if (provider === 'gitee') {
        const response = await fetchWithTimeout(`${GITEE_API_URL}/repos/${context.owner}/${context.repo}/branches?access_token=${encodeURIComponent(context.token || '')}&per_page=100`, {
          headers: buildGiteeHeaders()
        })
        if (!response.ok) throw new Error(`Gitee branches request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => ({ name: item.name, webUrl: `https://gitee.com/${context.owner}/${context.repo}/tree/${item.name}` })) : []
      }
      return []
    },
    async listMergeRequests(projectPath, state = 'opened') {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (provider === 'gitlab' && context) {
        const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/merge_requests?state=${encodeURIComponent(state)}&per_page=50`, {
          headers: { Authorization: `Bearer ${context.token}` }
        })
        if (!response.ok) throw new Error(`GitLab merge requests request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => ({
          id: item.id, iid: item.iid, title: item.title || '', state: item.state || '', webUrl: item.web_url || '',
          sourceBranch: item.source_branch || '', targetBranch: item.target_branch || '', updatedAt: item.updated_at || '', author: item.author?.name || ''
        })) : []
      }
      if (provider === 'gitee' && context) {
        const response = await fetchWithTimeout(`${GITEE_API_URL}/repos/${context.owner}/${context.repo}/pulls?state=${encodeURIComponent(state)}&access_token=${encodeURIComponent(context.token || '')}&per_page=50`, {
          headers: buildGiteeHeaders()
        })
        if (!response.ok) throw new Error(`Gitee pulls request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => ({
          id: item.id, iid: item.number, title: item.title || '', state: item.state || '', webUrl: item.html_url || '',
          sourceBranch: item.head?.ref || '', targetBranch: item.base?.ref || '', updatedAt: item.updated_at || '', author: item.user?.name || item.user?.login || ''
        })) : []
      }
      return []
    },
    async listPullRequests(projectPath, state = 'open') {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (provider !== 'github' || !context) return []
      const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/pulls?state=${encodeURIComponent(state)}&per_page=50`, {
        headers: buildGithubHeaders(context.token)
      })
      if (!response.ok) throw new Error(`GitHub pulls request failed: ${response.status}`)
      const data = await response.json()
      return Array.isArray(data) ? data.map((item) => ({
        id: item.id, iid: item.number, title: item.title || '', state: item.state || '', webUrl: item.html_url || '',
        sourceBranch: item.head?.ref || '', targetBranch: item.base?.ref || '', updatedAt: item.updated_at || '', author: item.user?.login || ''
      })) : []
    },
    async listPipelines(projectPath, limit = 12) {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (!context) return []
      if (provider === 'gitlab') {
        const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines?per_page=${Math.max(1, Math.min(limit, 30))}&order_by=updated_at&sort=desc`, {
          headers: { Authorization: `Bearer ${context.token}` }
        })
        if (!response.ok) throw new Error(`GitLab pipelines request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data) ? data.map((item) => formatPipeline({ ...item, provider: 'gitlab', providerLabel: 'GitLab' })) : []
      }
      if (provider === 'github') {
        const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/actions/runs?per_page=${Math.max(1, Math.min(limit, 30))}`, {
          headers: buildGithubHeaders(context.token)
        })
        if (!response.ok) throw new Error(`GitHub workflow runs request failed: ${response.status}`)
        const data = await response.json()
        return Array.isArray(data?.workflow_runs) ? data.workflow_runs.map((item) => formatGithubRun(item)) : []
      }
      return []
    },
    async getPipeline(projectPath, pipelineId) {
      const { provider, context } = await resolveProviderContext(projectPath)
      if (!context || !pipelineId) return null
      if (provider === 'gitlab') {
        const [detailResponse, jobsResponse] = await Promise.all([
          fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines/${pipelineId}`, { headers: { Authorization: `Bearer ${context.token}` } }),
          fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true`, { headers: { Authorization: `Bearer ${context.token}` } })
        ])
        if (!detailResponse.ok) throw new Error(`GitLab pipeline detail request failed: ${detailResponse.status}`)
        if (!jobsResponse.ok) throw new Error(`GitLab pipeline jobs request failed: ${jobsResponse.status}`)
        const detail = await detailResponse.json()
        const jobs = await jobsResponse.json()
        return {
          provider,
          pipeline: formatPipeline({ ...detail, provider: 'gitlab', providerLabel: 'GitLab' }),
          jobs: Array.isArray(jobs) ? jobs.map((item) => formatJob({ ...item, provider: 'gitlab' })) : []
        }
      }
      if (provider === 'github') {
        const [detailResponse, jobsResponse] = await Promise.all([
          fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/actions/runs/${pipelineId}`, { headers: buildGithubHeaders(context.token) }),
          fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/actions/runs/${pipelineId}/jobs?per_page=100`, { headers: buildGithubHeaders(context.token) })
        ])
        if (!detailResponse.ok) throw new Error(`GitHub run detail request failed: ${detailResponse.status}`)
        if (!jobsResponse.ok) throw new Error(`GitHub run jobs request failed: ${jobsResponse.status}`)
        const detail = await detailResponse.json()
        const jobs = await jobsResponse.json()
        return {
          provider,
          pipeline: formatGithubRun(detail),
          jobs: Array.isArray(jobs?.jobs) ? jobs.jobs.map((item) => ({
            id: item.id, name: item.name || '', stage: item.steps?.[0]?.name || 'job', status: item.conclusion || item.status || 'unknown',
            createdAt: item.started_at || '', startedAt: item.started_at || '', finishedAt: item.completed_at || '', webUrl: item.html_url || '', provider: 'github'
          })) : []
        }
      }
      return null
    },
    async createMergeRequest({ projectPath = '', sourceBranch = '', targetBranch = '', title = '', description = '', removeSourceBranch = false, draft = false } = {}) {
      const { provider, context } = await buildProviderRequestContext(projectPath, 'gitlab')
      const payload = {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: draft ? `Draft: ${title}` : title,
        description: description || '',
        remove_source_branch: !!removeSourceBranch
      }
      const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/merge_requests`, {
        method: 'POST',
        headers: buildProviderHeaders({ provider, context, hasBody: true }),
        body: JSON.stringify(payload)
      })
      const data = await parseResponsePayload(response)
      if (!response.ok) throw new Error(`GitLab create merge request failed: ${response.status}`)
      return normalizeToolResponse(data, provider)
    },
    async createPullRequest({ projectPath = '', sourceBranch = '', targetBranch = '', title = '', description = '', draft = false } = {}) {
      const { provider, context } = await buildProviderRequestContext(projectPath)
      if (provider === 'github') {
        const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/pulls`, {
          method: 'POST',
          headers: buildProviderHeaders({ provider, context, hasBody: true }),
          body: JSON.stringify({
            title,
            body: description || '',
            head: sourceBranch,
            base: targetBranch,
            draft: !!draft
          })
        })
        const data = await parseResponsePayload(response)
        if (!response.ok) throw new Error(`GitHub create pull request failed: ${response.status}`)
        return normalizeToolResponse(data, provider)
      }
      if (provider === 'gitee') {
        const url = buildProviderApiUrl({
          provider,
          context,
          relativePath: `repos/${context.owner}/${context.repo}/pulls`
        })
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: buildProviderHeaders({ provider, context, hasBody: true }),
          body: JSON.stringify({
            title,
            body: description || '',
            head: sourceBranch,
            base: targetBranch,
            prune_source_branch: false
          })
        })
        const data = await parseResponsePayload(response)
        if (!response.ok) throw new Error(`Gitee create pull request failed: ${response.status}`)
        return normalizeToolResponse(data, provider)
      }
      throw new Error(`Provider does not support pull requests: ${provider}`)
    },
    async commentMergeRequest({ projectPath = '', mergeRequestIid, body = '' } = {}) {
      const { provider, context } = await buildProviderRequestContext(projectPath, 'gitlab')
      const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/merge_requests/${mergeRequestIid}/notes`, {
        method: 'POST',
        headers: buildProviderHeaders({ provider, context, hasBody: true }),
        body: JSON.stringify({ body })
      })
      const data = await parseResponsePayload(response)
      if (!response.ok) throw new Error(`GitLab comment merge request failed: ${response.status}`)
      return normalizeToolResponse(data, provider)
    },
    async commentPullRequest({ projectPath = '', pullRequestNumber, body = '' } = {}) {
      const { provider, context } = await buildProviderRequestContext(projectPath)
      if (provider === 'github') {
        const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/issues/${pullRequestNumber}/comments`, {
          method: 'POST',
          headers: buildProviderHeaders({ provider, context, hasBody: true }),
          body: JSON.stringify({ body })
        })
        const data = await parseResponsePayload(response)
        if (!response.ok) throw new Error(`GitHub comment pull request failed: ${response.status}`)
        return normalizeToolResponse(data, provider)
      }
      if (provider === 'gitee') {
        const url = buildProviderApiUrl({
          provider,
          context,
          relativePath: `repos/${context.owner}/${context.repo}/pulls/${pullRequestNumber}/comments`
        })
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: buildProviderHeaders({ provider, context, hasBody: true }),
          body: JSON.stringify({ body })
        })
        const data = await parseResponsePayload(response)
        if (!response.ok) throw new Error(`Gitee comment pull request failed: ${response.status}`)
        return normalizeToolResponse(data, provider)
      }
      throw new Error(`Provider does not support pull request comments: ${provider}`)
    },
    async rerunPipeline({ projectPath = '', pipelineId, failedJobsOnly = false } = {}) {
      const { provider, context } = await buildProviderRequestContext(projectPath)
      if (provider === 'gitlab') {
        const action = failedJobsOnly ? 'retry' : 'retry'
        const response = await fetchWithTimeout(`${context.baseUrl}/api/v4/projects/${context.projectId}/pipelines/${pipelineId}/${action}`, {
          method: 'POST',
          headers: buildGitlabHeaders(context.token)
        })
        const data = await parseResponsePayload(response)
        if (!response.ok) throw new Error(`GitLab rerun pipeline failed: ${response.status}`)
        return normalizeToolResponse(data, provider)
      }
      if (provider === 'github') {
        const response = await fetchWithTimeout(`${GITHUB_API_URL}/repos/${context.owner}/${context.repo}/actions/runs/${pipelineId}/rerun${failedJobsOnly ? '-failed-jobs' : ''}`, {
          method: 'POST',
          headers: buildGithubHeaders(context.token)
        })
        if (!response.ok) throw new Error(`GitHub rerun pipeline failed: ${response.status}`)
        return {
          provider,
          pipelineId,
          rerunAccepted: true,
          failedJobsOnly
        }
      }
      throw new Error(`Provider does not support rerun pipeline: ${provider}`)
    },
    requestRemoteApi
  }
}

module.exports = {
  createRemotesService
}
