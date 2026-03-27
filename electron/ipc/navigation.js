const path = require('path')
const os = require('os')
const { URL } = require('url')

function registerNavigationHandlers({ ipcMain, shell, getMainWindow, safeLog, safeError }) {
  ipcMain.handle('open-in-finder', async (event, data) => {
    try {
      let filePath = data.path
      if (filePath && filePath.startsWith('local-resource://')) {
        const url = new URL(filePath)
        const relPath = decodeURIComponent((url.host || '') + url.pathname)
        filePath = path.resolve(os.homedir(), '.gitManager', relPath)
      }
      safeLog(`📂 在访达中打开: ${filePath}`)
      await shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      safeError('❌ 打开访达失败:', error.message)
      return { success: false, message: `打开失败: ${error.message}` }
    }
  })

  ipcMain.handle('open-external', async (event, url) => {
    try {
      safeLog(`🌐 打开外部链接: ${url}`)
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      safeError('❌ 打开外部链接失败:', error.message)
      return { success: false, message: `打开失败: ${error.message}` }
    }
  })

  ipcMain.on('request-open-url-in-new-tab', (event, url) => {
    safeLog(`🔗 收到新标签页打开请求: ${url}`)
    const mainWindow = getMainWindow()
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('open-url-in-new-tab', url)
    }
  })
}

module.exports = { registerNavigationHandlers }
