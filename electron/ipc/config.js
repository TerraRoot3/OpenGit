function registerConfigHandlers({ ipcMain, store, safeLog, safeError }) {
  ipcMain.handle('get-config', async (event, key) => {
    try {
      const value = store.get(key, null)
      safeLog(`📖 读取配置 ${key}:`, value ? `${typeof value} - ${Array.isArray(value) ? value.length : 'value'}` : 'null')
      return value
    } catch (error) {
      safeError(`❌ 读取配置失败 ${key}:`, error.message)
      return null
    }
  })

  ipcMain.handle('set-config', async (event, key, value) => {
    try {
      store.set(key, value)
      safeLog(`💾 保存配置 ${key}:`, typeof value === 'object' && value ? Object.keys(value).length : 'value')
      return true
    } catch (error) {
      safeError(`❌ 保存配置失败 ${key}:`, error.message)
      return false
    }
  })

  ipcMain.handle('get-all-configs', async () => {
    try {
      const allConfigs = store.store
      safeLog(`📋 获取所有配置:`, Object.keys(allConfigs).length, '个键')
      return allConfigs
    } catch (error) {
      safeError(`❌ 获取所有配置失败:`, error.message)
      return {}
    }
  })

  ipcMain.handle('save-config', async (event, { key, value }) => {
    try {
      store.set(key, value)
      safeLog(`💾 通过save-config保存 ${key}:`, typeof value === 'object' && value ? Object.keys(value).length : 'value')
      return true
    } catch (error) {
      safeError(`❌ 通过save-config保存失败 ${key}:`, error.message)
      return false
    }
  })

  ipcMain.handle('save-saved-configs', async (event, data) => {
    try {
      store.set('savedConfigs', data.configs || data)
      safeLog(`💾 保存已保存配置:`, Array.isArray(data.configs || data) ? (data.configs || data).length : 'value')
      return { success: true, message: '保存成功' }
    } catch (error) {
      safeError(`❌ 保存已保存配置失败:`, error.message)
      return { success: false, message: `保存失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-saved-configs', async () => {
    try {
      const configs = store.get('savedConfigs', [])
      safeLog(`📖 获取已保存配置:`, Array.isArray(configs) ? configs.length : 'value')
      return { success: true, configs }
    } catch (error) {
      safeError(`❌ 获取已保存配置失败:`, error.message)
      return { success: false, message: `获取失败: ${error.message}`, configs: [] }
    }
  })

  ipcMain.handle('save-gitlab-config', async (event, data) => {
    try {
      store.set('gitlab-config', data.data || data)
      safeLog(`💾 保存GitLab配置:`, Object.keys(data.data || data))
      return { success: true, message: '保存成功' }
    } catch (error) {
      safeError(`❌ 保存GitLab配置失败:`, error.message)
      return { success: false, message: `保存失败: ${error.message}` }
    }
  })

  ipcMain.handle('save-project-gitlab-config', async (event, { projectPath, gitlabConfig }) => {
    try {
      if (!projectPath || !gitlabConfig) {
        throw new Error('缺少必需参数: projectPath 和 gitlabConfig')
      }

      const configKey = `gitlab-config-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
      store.set(configKey, gitlabConfig)

      safeLog(`💾 保存项目特定GitLab配置: ${configKey}`, {
        url: gitlabConfig.url,
        token: gitlabConfig.token ? gitlabConfig.token.substring(0, 10) + '...' : 'null'
      })

      return { success: true, message: '项目特定GitLab配置保存成功', configKey }
    } catch (error) {
      safeError(`❌ 保存项目特定GitLab配置失败:`, error.message)
      return { success: false, message: `保存失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-project-gitlab-config', async (event, projectPath) => {
    try {
      if (!projectPath) {
        throw new Error('缺少必需参数: projectPath')
      }

      const configKey = `gitlab-config-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}`
      const config = store.get(configKey, null)
      safeLog(`📖 读取项目特定GitLab配置: ${configKey}`, config ? '已存在' : 'null')
      return { success: true, config }
    } catch (error) {
      safeError(`❌ 读取项目特定GitLab配置失败:`, error.message)
      return { success: false, message: `读取失败: ${error.message}`, config: null }
    }
  })

  ipcMain.handle('delete-gitlab-history', async (event, index) => {
    try {
      const gitlabHistory = store.get('gitlabHistory', [])
      if (index >= 0 && index < gitlabHistory.length) {
        const deletedConfig = gitlabHistory[index]
        gitlabHistory.splice(index, 1)
        store.set('gitlabHistory', gitlabHistory)
        safeLog(`✅ 已删除GitLab历史配置: ${deletedConfig.url}`)
        return { success: true, message: '删除成功' }
      }

      safeError('❌ 无效的GitLab历史配置索引:', index)
      return { success: false, message: '无效的索引' }
    } catch (error) {
      safeError('❌ 删除GitLab历史配置失败:', error.message)
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })

  ipcMain.handle('delete-saved-config', async (event, index) => {
    try {
      const savedConfigs = store.get('savedConfigs', [])
      if (index >= 0 && index < savedConfigs.length) {
        const deletedConfig = savedConfigs[index]
        savedConfigs.splice(index, 1)
        store.set('savedConfigs', savedConfigs)
        safeLog(`✅ 已删除保存配置: ${deletedConfig.path}`)
        return { success: true, message: '删除成功' }
      }

      safeError('❌ 无效的保存配置索引:', index)
      return { success: false, message: '无效的索引' }
    } catch (error) {
      safeError('❌ 删除保存配置失败:', error.message)
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })

  ipcMain.handle('get-current-config', async (event, data) => {
    try {
      const configKey = data && data.path ? data.path : 'default'
      const currentConfig = store.get(`current-config-${configKey}`, null)
      safeLog(`📖 获取当前配置${configKey}:`, currentConfig ? '已存在' : 'null')
      return { success: true, config: currentConfig }
    } catch (error) {
      safeError(`❌ 获取当前配置失败:`, error.message)
      return { success: false, message: `获取失败: ${error.message}`, config: null }
    }
  })

  ipcMain.handle('set-current-config', async (event, data) => {
    try {
      const configKey = data.path || 'default'
      store.set(`current-config-${configKey}`, data.config)
      safeLog(`💾 保存当前配置${configKey}:`, data.config)
      return { success: true }
    } catch (error) {
      safeError(`❌ 保存当前配置失败:`, error.message)
      return { success: false, message: `保存失败: ${error.message}` }
    }
  })
}

module.exports = { registerConfigHandlers }
