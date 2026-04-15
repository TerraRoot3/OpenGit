const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
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
  
  // GitLab API 操作
  gitlabTest: (data) => ipcRenderer.invoke('gitlab-test', data),
  gitlabGroups: (data) => ipcRenderer.invoke('gitlab-groups', data),
  gitlabGroupDetails: (data) => ipcRenderer.invoke('gitlab-group-details', data),
  gitlabGroupProjects: (data) => ipcRenderer.invoke('gitlab-group-projects', data),
  gitlabClone: (data) => ipcRenderer.invoke('gitlab-clone', data),
  gitlabCreateMR: (data) => ipcRenderer.invoke('gitlab-create-mr', data),
  gitlabProjectMRs: (data) => ipcRenderer.invoke('gitlab-project-mrs', data),
  gitlabSearchProjects: (data) => ipcRenderer.invoke('gitlab-search-projects', data),
  
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
  refreshRemote: (data) => ipcRenderer.invoke('refresh-remote', data),
  
  // 项目操作
  getProjects: (data) => ipcRenderer.invoke('get-projects', data),
  getProjectAiSessions: (data) => ipcRenderer.invoke('get-project-ai-sessions', data),
  getProjectAiSessionDetail: (data) => ipcRenderer.invoke('get-project-ai-session-detail', data),
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
  
  // 标签页管理
  onRefreshCurrentTab: (callback) => {
    ipcRenderer.on('refresh-current-tab', callback)
  },
  removeRefreshCurrentTabListener: (callback) => {
    ipcRenderer.removeListener('refresh-current-tab', callback)
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
  
  // 浏览器功能
  getBrowserFavorites: () => ipcRenderer.invoke('get-browser-favorites'),
  addBrowserFavorite: (data) => ipcRenderer.invoke('add-browser-favorite', data),
  removeBrowserFavorite: (data) => ipcRenderer.invoke('remove-browser-favorite', data),
  updateBrowserFavorite: (data) => ipcRenderer.invoke('update-browser-favorite', data),
  saveBrowserFavoritesOrder: (orderedIds) => ipcRenderer.invoke('save-browser-favorites-order', orderedIds),
  exportBrowserFavorites: () => ipcRenderer.invoke('export-browser-favorites'),
  importBrowserFavorites: () => ipcRenderer.invoke('import-browser-favorites'),
  getBrowserPasswords: () => ipcRenderer.invoke('get-browser-passwords'),
  saveBrowserPassword: (data) => ipcRenderer.invoke('save-browser-password', data),
  getBrowserPassword: (data) => ipcRenderer.invoke('get-browser-password', data),
  updateBrowserPasswordUsed: (data) => ipcRenderer.invoke('update-browser-password-used', data),
  clearBrowserPasswords: () => ipcRenderer.invoke('clear-browser-passwords'),
  deleteBrowserPassword: (data) => ipcRenderer.invoke('delete-browser-password', data),
  deleteBrowserPasswordByDomain: (data) => ipcRenderer.invoke('delete-browser-password-by-domain', data),
  
  // 收藏导入导出事件监听
  onExportFavorites: (callback) => {
    ipcRenderer.on('export-favorites', callback)
  },
  removeExportFavoritesListener: (callback) => {
    ipcRenderer.removeListener('export-favorites', callback)
  },
  onImportFavorites: (callback) => {
    ipcRenderer.on('import-favorites', callback)
  },
  removeImportFavoritesListener: (callback) => {
    ipcRenderer.removeListener('import-favorites', callback)
  },
  
  // 监听主进程发来的新标签页打开请求
  onOpenUrlInNewTab: (callback) => {
    ipcRenderer.on('open-url-in-new-tab', (event, url) => callback(url))
  },
  removeOpenUrlInNewTabListener: () => {
    ipcRenderer.removeAllListeners('open-url-in-new-tab')
  },
  
  // 全局方法：在新标签页中打开 URL
  openUrlInNewTab: (url) => {
    ipcRenderer.send('request-open-url-in-new-tab', url)
  },
  
  // 读取图片文件并返回 base64
  readImageAsBase64: (filePath) => ipcRenderer.invoke('read-image-as-base64', filePath),

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
  
  // 监听打开 webview DevTools 请求
  onOpenWebviewDevTools: (callback) => {
    ipcRenderer.on('open-webview-devtools', callback)
  },
  removeOpenWebviewDevToolsListener: () => {
    ipcRenderer.removeAllListeners('open-webview-devtools')
  },

  // WebContentsView tabs
  webTabCreate: (data) => ipcRenderer.invoke('web-tab-create', data),
  webTabDestroy: (data) => ipcRenderer.invoke('web-tab-destroy', data),
  webTabActivate: (data) => ipcRenderer.invoke('web-tab-activate', data),
  webTabNavigate: (data) => ipcRenderer.invoke('web-tab-navigate', data),
  webTabHideAll: () => ipcRenderer.invoke('web-tab-hide-all'),
  webTabSetBounds: (data) => ipcRenderer.invoke('web-tab-set-bounds', data),
  webTabReload: (data) => ipcRenderer.invoke('web-tab-reload', data),
  webTabGoBack: (data) => ipcRenderer.invoke('web-tab-go-back', data),
  webTabGoForward: (data) => ipcRenderer.invoke('web-tab-go-forward', data),
  webTabEvaluate: (data) => ipcRenderer.invoke('web-tab-evaluate', data),
  webTabRestore: (data) => ipcRenderer.invoke('web-tab-restore', data),
  showBrowserFloatingMenu: (data) => ipcRenderer.invoke('browser-show-floating-menu', data),
  showBrowserNativeMenu: () => ipcRenderer.invoke('browser-show-native-menu'),
  onWebTabStateChanged: (callback) => {
    ipcRenderer.on('web-tab-state-changed', (event, data) => callback(data))
  },
  removeWebTabStateChangedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-state-changed')
  },
  onWebTabTitleUpdated: (callback) => {
    ipcRenderer.on('web-tab-title-updated', (event, data) => callback(data))
  },
  removeWebTabTitleUpdatedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-title-updated')
  },
  onWebTabFaviconUpdated: (callback) => {
    ipcRenderer.on('web-tab-favicon-updated', (event, data) => callback(data))
  },
  removeWebTabFaviconUpdatedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-favicon-updated')
  },
  onWebTabLoadFailed: (callback) => {
    ipcRenderer.on('web-tab-load-failed', (event, data) => callback(data))
  },
  removeWebTabLoadFailedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-load-failed')
  },
  onWebTabPasswordCaptured: (callback) => {
    ipcRenderer.on('web-tab-password-captured', (event, data) => callback(data))
  },
  removeWebTabPasswordCapturedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-password-captured')
  },
  onWebTabLifecycleChanged: (callback) => {
    ipcRenderer.on('web-tab-lifecycle-changed', (event, data) => callback(data))
  },
  removeWebTabLifecycleChangedListener: () => {
    ipcRenderer.removeAllListeners('web-tab-lifecycle-changed')
  },
  onWebDownloadStateChanged: (callback) => {
    ipcRenderer.on('web-download-state-changed', (event, data) => callback(data))
  },
  removeWebDownloadStateChangedListener: () => {
    ipcRenderer.removeAllListeners('web-download-state-changed')
  },
  browserOpenDownloadFolder: (data) => ipcRenderer.invoke('browser-open-download-folder', data),
  browserRetryDownload: (data) => ipcRenderer.invoke('browser-retry-download', data),
  browserClearDownloadHistory: () => ipcRenderer.invoke('browser-clear-download-history'),
  browserGetSitePermissions: (data) => ipcRenderer.invoke('browser-get-site-permissions', data),
  browserResetSitePermission: (data) => ipcRenderer.invoke('browser-reset-site-permission', data),
  browserResetAllSitePermissions: (data) => ipcRenderer.invoke('browser-reset-all-site-permissions', data),
  onBrowserPermissionRequested: (callback) => {
    ipcRenderer.on('browser-permission-requested', (event, data) => callback(data))
  },
  removeBrowserPermissionRequestedListener: () => {
    ipcRenderer.removeAllListeners('browser-permission-requested')
  },
  browserRespondToPermissionRequest: (data) => ipcRenderer.invoke('browser-permission-respond', data),
  
  // ==================== 终端 ====================
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal-create', options),
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
    }
  },

  // Chrome 扩展管理
  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  loadExtensionFromFolder: () => ipcRenderer.invoke('load-extension-from-folder'),
  loadExtensionFromCrx: () => ipcRenderer.invoke('load-extension-from-crx'),
  loadExtensionFromChrome: () => ipcRenderer.invoke('load-extension-from-chrome'),
  loadExtensionById: (extensionId) => ipcRenderer.invoke('load-extension-by-id', extensionId),
  toggleExtension: (extensionId, enabled) => ipcRenderer.invoke('toggle-extension', extensionId, enabled),
  removeExtension: (extensionId) => ipcRenderer.invoke('remove-extension', extensionId)
})
