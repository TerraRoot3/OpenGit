const { BrowserWindow } = require('electron')

function registerWindowUiHandlers({ ipcMain, safeLog, safeError }) {
  ipcMain.handle('log-to-frontend', async (event, message) => {
    safeLog(`🔍 前台调试: ${message}`)
    return true
  })

  ipcMain.handle('toggle-maximize', async () => {
    try {
      const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!window) {
        return { success: false, error: 'No window found' }
      }

      if (window.isMaximized()) {
        window.unmaximize()
        safeLog('🗗 窗口已还原')
        return { success: true, maximized: false }
      }

      window.maximize()
      safeLog('🗖 窗口已最大化')
      return { success: true, maximized: true }
    } catch (error) {
      safeError('❌ 切换窗口最大化失败:', error.message)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerWindowUiHandlers }
