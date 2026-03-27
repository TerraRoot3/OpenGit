const fs = require('fs')
const path = require('path')
const { dialog } = require('electron')

function registerFilesystemHandlers({
  ipcMain,
  getMainWindow,
  executeGitCommand,
  safeLog,
  safeError
}) {
  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(getMainWindow(), options)
      safeLog('📁 打开对话框:', result.canceled ? '已取消' : `${result.filePaths.length}个路径`)
      return result
    } catch (error) {
      safeError('❌ 打开对话框失败:', error.message)
      return { canceled: true, filePaths: [] }
    }
  })

  ipcMain.handle('read-image-as-base64', async (event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      }
      const mimeType = mimeTypes[ext] || 'image/jpeg'
      const imageBuffer = fs.readFileSync(filePath)
      const base64 = imageBuffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64}`
      safeLog(`🖼️ 读取图片成功: ${filePath} (${(imageBuffer.length / 1024).toFixed(1)}KB)`)
      return { success: true, dataUrl }
    } catch (error) {
      safeError('❌ 读取图片失败:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      const result = await dialog.showSaveDialog(getMainWindow(), {
        title: options.title || '保存文件',
        defaultPath: options.defaultPath,
        filters: options.filters || [{ name: '所有文件', extensions: ['*'] }]
      })
      return result
    } catch (error) {
      safeError('显示保存对话框失败:', error)
      return { canceled: true, error: error.message }
    }
  })

  ipcMain.handle('save-file', async (event, data) => {
    try {
      fs.writeFileSync(data.filePath, data.content, 'utf-8')
      safeLog(`💾 文件保存成功: ${data.filePath}`)
      return { success: true }
    } catch (error) {
      safeError('保存文件失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      safeLog(`📖 文件读取成功: ${filePath}`)
      return content
    } catch (error) {
      safeError('读取文件失败:', error)
      throw error
    }
  })

  ipcMain.handle('scan-projects', async (event, data) => {
    try {
      safeLog(`🔍 扫描项目: ${data.path}`)

      const scanDirectory = async (dir, maxDepth = 2, currentDepth = 0) => {
        if (currentDepth >= maxDepth) return []
        if (!fs.existsSync(dir)) return []

        const items = []
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
              if (entry.name === '.git') {
                let hasPendingFiles = false
                try {
                  const statusResult = await executeGitCommand(['git', 'status', '--porcelain'], path.dirname(fullPath))
                  if (statusResult.success && statusResult.stdout) {
                    const statusLines = statusResult.stdout.trim().split('\n').filter(line => line.length > 0)
                    hasPendingFiles = statusLines.some(line => {
                      const hasChanges = line[0] === ' ' && (line[1] === 'M' || line[1] === 'A' || line[1] === 'D' || line[1] === 'R') ||
                        line[0] === '?' ||
                        line[0] === '!' ||
                        (line[0] !== '?' && line[0] !== '!' && line[0] !== '#')
                      return hasChanges
                    })
                  }
                } catch (error) {
                  safeError(`检查待定文件状态失败 ${path.dirname(fullPath)}:`, error.message)
                }

                items.push({
                  name: path.basename(path.dirname(fullPath)),
                  path: path.dirname(fullPath),
                  type: 'git',
                  hasPendingFiles
                })
              } else if (!entry.name.startsWith('.')) {
                const subItems = await scanDirectory(fullPath, maxDepth, currentDepth + 1)
                items.push(...subItems)
              }
            }
          }
        } catch (error) {
          safeError(`扫描目录失败 ${dir}:`, error.message)
        }

        return items
      }

      const projects = await scanDirectory(data.path)
      safeLog(`📁 发现 ${projects.length} 个项目`)
      return { success: true, projects }
    } catch (error) {
      safeError('❌ 扫描项目失败:', error.message)
      return { success: false, message: `扫描失败: ${error.message}`, projects: [] }
    }
  })
}

module.exports = { registerFilesystemHandlers }
