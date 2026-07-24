export const OPEN_GIT_BACKUP_FORMAT = 'opengit-config-backup'
export const OPEN_GIT_BACKUP_VERSION = 2

export const BACKUP_CATEGORIES = Object.freeze([
  {
    id: 'projects',
    label: '项目与侧边栏',
    description: '扫描目录、侧边栏布局和已保存的仓库配置'
  },
  {
    id: 'remotes',
    label: '远端仓库配置',
    description: 'GitLab、GitHub、Gitee 连接信息，可能包含访问凭据',
    sensitive: true
  },
  {
    id: 'workspace',
    label: '项目工作区',
    description: '提交模板、项目视图、终端模式和工作区布局'
  },
  {
    id: 'appearance',
    label: '皮肤与终端偏好',
    description: '当前皮肤、终端回滚行数和全局终端模式'
  }
])

const EXACT_KEYS = Object.freeze({
  projects: new Set([
    'project-sidebar-state-v1',
    'savedConfigs',
    'repos-path',
    'scan-path'
  ]),
  remotes: new Set([
    'gitlabConfig',
    'gitlabHistory',
    'gitlab-config'
  ]),
  workspace: new Set([]),
  appearance: new Set([
    'opengit-theme',
    'appTerminalMode',
    'appTerminalModeApplyGlobally',
    'appTerminalScrollback'
  ])
})

const KEY_PREFIXES = Object.freeze({
  projects: [],
  remotes: [
    'gitlab-config-',
    'current-config-'
  ],
  workspace: [
    'commit-template-',
    'projectView_',
    'expandState_',
    'projectBranchesPanelWidth_',
    'projectBranchesPanelLastExpanded_',
    'projectTerminalMode_',
    'workspaceTreeWidth_',
    'workspace-state-'
  ],
  appearance: []
})

export const getBackupCategoryForKey = (key) => {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return ''

  for (const category of BACKUP_CATEGORIES) {
    if (EXACT_KEYS[category.id]?.has(normalizedKey)) {
      return category.id
    }
    if (KEY_PREFIXES[category.id]?.some((prefix) => normalizedKey.startsWith(prefix))) {
      return category.id
    }
  }
  return ''
}

const cloneJsonValue = (value) => {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

export const selectBackupConfigs = (allConfigs = {}, categoryIds = []) => {
  const selectedCategories = new Set(
    (Array.isArray(categoryIds) ? categoryIds : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )

  if (!allConfigs || typeof allConfigs !== 'object' || Array.isArray(allConfigs)) {
    return {}
  }

  const selected = {}
  for (const [key, value] of Object.entries(allConfigs)) {
    const category = getBackupCategoryForKey(key)
    if (!category || !selectedCategories.has(category)) continue
    const cloned = cloneJsonValue(value)
    if (cloned !== undefined) {
      selected[key] = cloned
    }
  }
  return selected
}

export const summarizeBackupConfigs = (configs = {}) => {
  const counts = Object.fromEntries(BACKUP_CATEGORIES.map((category) => [category.id, 0]))
  for (const key of Object.keys(configs || {})) {
    const category = getBackupCategoryForKey(key)
    if (category) counts[category] += 1
  }
  return counts
}

export const createBackupDocument = ({
  allConfigs = {},
  categoryIds = BACKUP_CATEGORIES.map((category) => category.id),
  createdAt = new Date().toISOString()
} = {}) => {
  const configs = selectBackupConfigs(allConfigs, categoryIds)
  return {
    format: OPEN_GIT_BACKUP_FORMAT,
    version: OPEN_GIT_BACKUP_VERSION,
    createdAt,
    categories: Array.from(new Set(
      Object.keys(configs)
        .map(getBackupCategoryForKey)
        .filter(Boolean)
    )),
    configs
  }
}

export const parseBackupDocument = (input) => {
  let parsed = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new Error('备份文件不是有效的 JSON')
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('备份文件结构无效')
  }
  if (parsed.format !== OPEN_GIT_BACKUP_FORMAT) {
    throw new Error('不是 OpenGit 配置备份文件')
  }
  if (parsed.version !== OPEN_GIT_BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${parsed.version ?? '未知'}`)
  }
  if (!parsed.configs || typeof parsed.configs !== 'object' || Array.isArray(parsed.configs)) {
    throw new Error('备份文件缺少配置内容')
  }

  const configs = selectBackupConfigs(
    parsed.configs,
    BACKUP_CATEGORIES.map((category) => category.id)
  )
  if (Object.keys(configs).length === 0) {
    throw new Error('备份文件中没有可恢复的配置')
  }

  return {
    format: OPEN_GIT_BACKUP_FORMAT,
    version: OPEN_GIT_BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    categories: Array.from(new Set(
      Object.keys(configs)
        .map(getBackupCategoryForKey)
        .filter(Boolean)
    )),
    configs
  }
}

export const selectRestoreConfigs = (backupDocument, categoryIds = []) => {
  return selectBackupConfigs(backupDocument?.configs, categoryIds)
}
