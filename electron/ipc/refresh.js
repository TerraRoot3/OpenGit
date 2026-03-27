function registerRefreshHandlers({ ipcMain, getMainWindow, safeLog, safeError }) {
  ipcMain.handle('send-refresh-on-focus', async () => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('refresh-on-focus')
        safeLog('📡 [主进程] 手动触发 refresh-on-focus 事件')
      }
      return true
    } catch (error) {
      safeError('❌ 发送刷新事件失败:', error.message)
      return false
    }
  })

  ipcMain.handle('notify-refresh-complete', async () => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('refresh-complete')
        safeLog('📡 [主进程] 发送 refresh-complete 事件')
      }
      return true
    } catch (error) {
      safeError('❌ 发送刷新完成事件失败:', error.message)
      return false
    }
  })
}

module.exports = { registerRefreshHandlers }
