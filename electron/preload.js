const { contextBridge, ipcRenderer, webUtils } = require('electron')

const codexProjectStatusHandlers = new WeakMap()
const codexTerminalStatusHandlers = new WeakMap()
const codexMainSessionEventHandlers = new WeakMap()
const windowGeometryChangeHandlers = new WeakMap()
const focusProjectTerminalSubscribers = new Set()
const pendingFocusProjectTerminalPayloads = []
const MAX_PENDING_FOCUS_PROJECT_TERMINAL_PAYLOADS = 16

const deliverFocusProjectTerminalPayload = (payload) => {
  if (focusProjectTerminalSubscribers.size === 0) {
    pendingFocusProjectTerminalPayloads.push(payload)
    if (pendingFocusProjectTerminalPayloads.length > MAX_PENDING_FOCUS_PROJECT_TERMINAL_PAYLOADS) {
      pendingFocusProjectTerminalPayloads.splice(
        0,
        pendingFocusProjectTerminalPayloads.length - MAX_PENDING_FOCUS_PROJECT_TERMINAL_PAYLOADS
      )
    }
    return
  }

  for (const callback of Array.from(focusProjectTerminalSubscribers)) {
    try {
      callback(payload)
    } catch (error) {
      console.error('focus-project-terminal listener failed:', error)
    }
  }
}

ipcRenderer.on('focus-project-terminal', (event, payload) => {
  deliverFocusProjectTerminalPayload(payload)
})

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  codexMainSession: {
    getState: () => ipcRenderer.invoke('codex-main-get-state'),
    getHistory: (data) => ipcRenderer.invoke('codex-main-get-history', data),
    selectSession: (data) => ipcRenderer.invoke('codex-main-select-session', data),
    send: (data) => ipcRenderer.invoke('codex-main-send', data),
    interrupt: (data) => ipcRenderer.invoke('codex-main-interrupt', data),
    newSession: () => ipcRenderer.invoke('codex-main-new-session'),
    deleteSession: (data) => ipcRenderer.invoke('codex-main-delete-session', data),
    restart: () => ipcRenderer.invoke('codex-main-restart'),
    getConfig: () => ipcRenderer.invoke('codex-main-get-config'),
    saveConfig: (data) => ipcRenderer.invoke('codex-main-save-config', data),
    refreshAccount: () => ipcRenderer.invoke('codex-main-refresh-account'),
    onEvent: (callback) => {
      if (typeof callback !== 'function') return () => {}
      const handler = (event, data) => callback(data)
      codexMainSessionEventHandlers.set(callback, handler)
      ipcRenderer.on('codex-main-session-event', handler)
      return () => {
        ipcRenderer.removeListener('codex-main-session-event', handler)
        codexMainSessionEventHandlers.delete(callback)
      }
    },
    removeEventListener: (callback) => {
      if (typeof callback === 'function') {
        const handler = codexMainSessionEventHandlers.get(callback) || callback
        ipcRenderer.removeListener('codex-main-session-event', handler)
        codexMainSessionEventHandlers.delete(callback)
        return
      }
      ipcRenderer.removeAllListeners('codex-main-session-event')
    }
  },

  // Git 操作
  gitClone: (data) => ipcRenderer.invoke('git-clone', data),
  gitStatus: (data) => ipcRenderer.invoke('git-status', data),
  gitBranch: (data) => ipcRenderer.invoke('git-branch', data),
  gitCommit: (data) => ipcRenderer.invoke('git-commit', data),
  gitPull: (data) => ipcRenderer.invoke('git-pull', data),
  gitPush: (data) => ipcRenderer.invoke('git-push', data),
  
  // 文件操作
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // 配置存储
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  getAllConfigs: () => ipcRenderer.invoke('get-all-configs'),
  reportWorkspaceRuntimeState: (payload) => ipcRenderer.send('workspace-runtime-state-update', payload),
  
  // GitLab API 操作
  gitlabTest: (data) => ipcRenderer.invoke('gitlab-test', data),
  gitlabGroups: (data) => ipcRenderer.invoke('gitlab-groups', data),
  gitlabGroupDetails: (data) => ipcRenderer.invoke('gitlab-group-details', data),
  gitlabGroupProjects: (data) => ipcRenderer.invoke('gitlab-group-projects', data),
  gitlabClone: (data) => ipcRenderer.invoke('gitlab-clone', data),
  gitlabCreateMR: (data) => ipcRenderer.invoke('gitlab-create-mr', data),
  gitlabProjectMRs: (data) => ipcRenderer.invoke('gitlab-project-mrs', data),
  gitlabSearchProjects: (data) => ipcRenderer.invoke('gitlab-search-projects', data),
  gitlabProjectPipelines: (data) => ipcRenderer.invoke('gitlab-project-pipelines', data),
  gitlabPipelineDetail: (data) => ipcRenderer.invoke('gitlab-pipeline-detail', data),
  projectPipelines: (data) => ipcRenderer.invoke('project-pipelines', data),
  pipelineDetail: (data) => ipcRenderer.invoke('pipeline-detail', data),
  
  // GitHub API 操作
  githubTest: (data) => ipcRenderer.invoke('github-test', data),
  githubOrgs: (data) => ipcRenderer.invoke('github-orgs', data),
  githubUserRepos: (data) => ipcRenderer.invoke('github-user-repos', data),
  githubOrgRepos: (data) => ipcRenderer.invoke('github-org-repos', data),
  githubClone: (data) => ipcRenderer.invoke('github-clone', data),
  githubSearchRepos: (data) => ipcRenderer.invoke('github-search-repos', data),
  
  // Gitee API 操作
  giteeTest: (data) => ipcRenderer.invoke('gitee-test', data),
  giteeOrgs: (data) => ipcRenderer.invoke('gitee-orgs', data),
  giteeUserRepos: (data) => ipcRenderer.invoke('gitee-user-repos', data),
  giteeOrgRepos: (data) => ipcRenderer.invoke('gitee-org-repos', data),
  giteeClone: (data) => ipcRenderer.invoke('gitee-clone', data),
  giteeSearchRepos: (data) => ipcRenderer.invoke('gitee-search-repos', data),
  
  // 文件系统操作
  getFileTree: (data) => ipcRenderer.invoke('get-file-tree', data),
  scanProjects: (data) => ipcRenderer.invoke('scan-projects', data),
  executeCommand: (data) => ipcRenderer.invoke('execute-command', data),
  executeCommandRealtime: (data) => ipcRenderer.invoke('execute-command-realtime', data),
  killCommandProcess: (processId) => ipcRenderer.invoke('kill-command-process', { processId }),
  onCommandProcessId: (callback) => {
    ipcRenderer.on('command-process-id', (event, data) => callback(data))
  },
  removeCommandProcessIdListener: () => {
    ipcRenderer.removeAllListeners('command-process-id')
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInFinder: (data) => ipcRenderer.invoke('open-in-finder', data),
  
  // 分支操作
  getBranchList: (data) => ipcRenderer.invoke('get-branch-list', data),
  getBranchStatus: (data) => ipcRenderer.invoke('get-branch-status', data),
  getBranchStatusCache: (data) => ipcRenderer.invoke('get-branch-status-cache', data),
  clearBranchStatusCache: (data) => ipcRenderer.invoke('clear-branch-status-cache', data),
  getBranchInfo: (data) => ipcRenderer.invoke('get-branch-info', data),
  getProjectGitMonitorSnapshot: (data) => ipcRenderer.invoke('get-project-git-monitor-snapshot', data),
  getProjectGitWatchSignature: (data) => ipcRenderer.invoke('get-project-git-watch-signature', data),
  refreshRemote: (data) => ipcRenderer.invoke('refresh-remote', data),
  
  // 项目操作
  getProjects: (data) => ipcRenderer.invoke('get-projects', data),
  getScanRootRepositories: (data) => ipcRenderer.invoke('get-scan-root-repositories', data),
  detectGitRepository: (data) => ipcRenderer.invoke('detect-git-repository', data),
  getProjectAiSessions: (data) => ipcRenderer.invoke('get-project-ai-sessions', data),
  getProjectAiSessionDetail: (data) => ipcRenderer.invoke('get-project-ai-session-detail', data),
  renameProjectAiSession: (data) => ipcRenderer.invoke('rename-project-ai-session', data),
  archiveProjectAiSession: (data) => ipcRenderer.invoke('archive-project-ai-session', data),
  deleteProjectAiSession: (data) => ipcRenderer.invoke('delete-project-ai-session', data),
  
  // 配置管理
  getCurrentConfig: (data) => ipcRenderer.invoke('get-current-config', data),
  setCurrentConfig: (data) => ipcRenderer.invoke('set-current-config', data),
  saveSavedConfigs: (data) => ipcRenderer.invoke('save-saved-configs', data),
  getSavedConfigs: () => ipcRenderer.invoke('get-saved-configs'),
  saveGitlabConfig: (data) => ipcRenderer.invoke('save-gitlab-config', data),
  saveProjectGitlabConfig: (data) => ipcRenderer.invoke('save-project-gitlab-config', data),
  getProjectGitlabConfig: (projectPath) => ipcRenderer.invoke('get-project-gitlab-config', projectPath),
  deleteGitlabHistory: (index) => ipcRenderer.invoke('delete-gitlab-history', index),
  deleteSavedConfig: (index) => ipcRenderer.invoke('delete-saved-config', index),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  
  onFocusProjectTerminal: (callback) => {
    if (typeof callback !== 'function') return () => {}

    focusProjectTerminalSubscribers.add(callback)
    if (pendingFocusProjectTerminalPayloads.length > 0) {
      const queuedPayloads = pendingFocusProjectTerminalPayloads.splice(0, pendingFocusProjectTerminalPayloads.length)
      for (const payload of queuedPayloads) {
        try {
          callback(payload)
        } catch (error) {
          console.error('focus-project-terminal queued listener failed:', error)
        }
      }
    }

    return () => {
      focusProjectTerminalSubscribers.delete(callback)
    }
  },
  ackFocusProjectTerminal: (payload) => {
    ipcRenderer.send('focus-project-terminal-ack', payload)
  },
  removeFocusProjectTerminalListener: (callback) => {
    if (typeof callback === 'function') {
      focusProjectTerminalSubscribers.delete(callback)
      return
    }
    focusProjectTerminalSubscribers.clear()
  },
  // 实时Git输出监听
  onGitOutputUpdate: (callback) => {
    ipcRenderer.on('git-output-update', callback)
  },
  removeGitOutputUpdateListener: (callback) => {
    ipcRenderer.removeListener('git-output-update', callback)
  },
  
  // 窗口焦点事件监听（用于刷新待定文件检查）
  onRefreshOnFocus: (callback) => {
    ipcRenderer.on('refresh-on-focus', callback)
  },
  removeRefreshOnFocusListener: (callback) => {
    ipcRenderer.removeListener('refresh-on-focus', callback)
  },
  // 主动发送刷新请求（地址栏刷新按钮或 Command+R）
  sendRefreshOnFocus: () => {
    ipcRenderer.invoke('send-refresh-on-focus')
  },
  // 刷新完成通知监听
  onRefreshComplete: (callback) => {
    ipcRenderer.on('refresh-complete', callback)
  },
  removeRefreshCompleteListener: (callback) => {
    ipcRenderer.removeListener('refresh-complete', callback)
  },
  // 通知刷新完成
  notifyRefreshComplete: () => {
    ipcRenderer.invoke('notify-refresh-complete')
  },
  onWindowGeometryChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (event, data) => callback(data)
    windowGeometryChangeHandlers.set(callback, handler)
    ipcRenderer.on('window-geometry-changed', handler)
    return () => {
      ipcRenderer.removeListener('window-geometry-changed', handler)
      windowGeometryChangeHandlers.delete(callback)
    }
  },
  removeWindowGeometryChangedListener: (callback) => {
    if (typeof callback === 'function') {
      const handler = windowGeometryChangeHandlers.get(callback) || callback
      ipcRenderer.removeListener('window-geometry-changed', handler)
      windowGeometryChangeHandlers.delete(callback)
      return
    }
    ipcRenderer.removeAllListeners('window-geometry-changed')
  },
  
  // 实时命令输出监听
  onRealtimeCommandOutput: (callback) => {
    ipcRenderer.on('realtime-command-output', callback)
  },
  removeRealtimeCommandOutputListener: (callback) => {
    ipcRenderer.removeListener('realtime-command-output', callback)
  },
  
  // 分支状态缓存更新监听
  onBranchStatusCacheUpdated: (callback) => {
    ipcRenderer.on('branch-status-cache-updated', callback)
  },
  removeBranchStatusCacheUpdatedListener: (callback) => {
    ipcRenderer.removeListener('branch-status-cache-updated', callback)
  },

  // 项目列表更新监听（后台扫描完成后通知）
  onProjectsUpdated: (callback) => {
    ipcRenderer.on('projects-updated', callback)
  },
  removeProjectsUpdatedListener: (callback) => {
    ipcRenderer.removeListener('projects-updated', callback)
  },

  // 前端调试日志
  logToFrontend: (message) => ipcRenderer.invoke('log-to-frontend', message),
  
  // 窗口操作
  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),
  
  // 读取图片文件并返回 base64
  readImageAsBase64: (filePath) => ipcRenderer.invoke('read-image-as-base64', filePath),
  readFileAsBase64: (filePath) => ipcRenderer.invoke('read-file-as-base64', filePath),

  // Electron 32+ 不再支持 renderer 直接读取 File.path，改用 webUtils
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch (error) {
      return ''
    }
  },

  // 文件保存对话框
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // 保存文件
  saveFile: (data) => ipcRenderer.invoke('save-file', data),

  // 读取文件
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  searchProjectFiles: (data) => ipcRenderer.invoke('search-project-files', data),
  createFile: (data) => ipcRenderer.invoke('create-file', data),
  createDirectory: (data) => ipcRenderer.invoke('create-directory', data),
  renameFilesystemItem: (data) => ipcRenderer.invoke('rename-filesystem-item', data),
  copyFilesystemItems: (data) => ipcRenderer.invoke('copy-filesystem-items', data),
  moveFilesystemItems: (data) => ipcRenderer.invoke('move-filesystem-items', data),
  getFilesystemPasteConflicts: (data) => ipcRenderer.invoke('get-filesystem-paste-conflicts', data),
  deleteFilesystemItems: (data) => ipcRenderer.invoke('delete-filesystem-items', data),
  
  // ==================== 终端 ====================
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal-create', options),
    getCwd: (data) => ipcRenderer.invoke('terminal-get-cwd', data),
    write: (data) => ipcRenderer.send('terminal-write', data),
    resize: (data) => ipcRenderer.send('terminal-resize', data),
    destroy: (data) => ipcRenderer.invoke('terminal-destroy', data),
    onOutput: (callback) => {
      ipcRenderer.on('terminal-output', (event, data) => callback(data))
    },
    removeOutputListener: () => {
      ipcRenderer.removeAllListeners('terminal-output')
    },
    onExit: (callback) => {
      ipcRenderer.on('terminal-exit', (event, data) => callback(data))
    },
    removeExitListener: () => {
      ipcRenderer.removeAllListeners('terminal-exit')
    },
    onTitleChange: (callback) => {
      ipcRenderer.on('terminal-title', (event, data) => callback(data))
    },
    removeTitleChangeListener: () => {
      ipcRenderer.removeAllListeners('terminal-title')
    },
    onCwdChange: (callback) => {
      ipcRenderer.on('terminal-cwd', (event, data) => callback(data))
    },
    removeCwdChangeListener: () => {
      ipcRenderer.removeAllListeners('terminal-cwd')
    }
  },

  codexSessionMonitor: {
    getSnapshot: () => ipcRenderer.invoke('codex-session-monitor-get-snapshot'),
    getTerminal: (data) => ipcRenderer.invoke('codex-session-monitor-get-terminal', data),
    getProject: (data) => ipcRenderer.invoke('codex-session-monitor-get-project', data),
    onTerminalStatusChanged: (callback) => {
      const handler = (event, data) => callback(data)
      codexTerminalStatusHandlers.set(callback, handler)
      ipcRenderer.on('codex-session-terminal-status-changed', handler)
      return () => {
        ipcRenderer.removeListener('codex-session-terminal-status-changed', handler)
        codexTerminalStatusHandlers.delete(callback)
      }
    },
    removeTerminalStatusChangedListener: (callback) => {
      if (typeof callback === 'function') {
        const handler = codexTerminalStatusHandlers.get(callback) || callback
        ipcRenderer.removeListener('codex-session-terminal-status-changed', handler)
        codexTerminalStatusHandlers.delete(callback)
        return
      }
      ipcRenderer.removeAllListeners('codex-session-terminal-status-changed')
    },
    onProjectStatusChanged: (callback) => {
      const handler = (event, data) => callback(data)
      codexProjectStatusHandlers.set(callback, handler)
      ipcRenderer.on('codex-session-project-status-changed', handler)
      return () => {
        ipcRenderer.removeListener('codex-session-project-status-changed', handler)
        codexProjectStatusHandlers.delete(callback)
      }
    },
    removeProjectStatusChangedListener: (callback) => {
      if (typeof callback === 'function') {
        const handler = codexProjectStatusHandlers.get(callback) || callback
        ipcRenderer.removeListener('codex-session-project-status-changed', handler)
        codexProjectStatusHandlers.delete(callback)
        return
      }
      ipcRenderer.removeAllListeners('codex-session-project-status-changed')
    }
  },
  getCodexProjectStatusSnapshot: async () => {
    const result = await ipcRenderer.invoke('codex-session-monitor-get-snapshot')
    return result?.snapshot?.projects || []
  },
  onCodexProjectStatusChanged: (callback) => {
    const handler = (event, data) => callback(data)
    codexProjectStatusHandlers.set(callback, handler)
    ipcRenderer.on('codex-session-project-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('codex-session-project-status-changed', handler)
      codexProjectStatusHandlers.delete(callback)
    }
  },
  removeCodexProjectStatusListener: (callback) => {
    if (typeof callback === 'function') {
      const handler = codexProjectStatusHandlers.get(callback) || callback
      ipcRenderer.removeListener('codex-session-project-status-changed', handler)
      codexProjectStatusHandlers.delete(callback)
      return
    }
    ipcRenderer.removeAllListeners('codex-session-project-status-changed')
  }
})
