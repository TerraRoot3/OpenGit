const fs = require('fs')
const path = require('path')
const { dialog } = require('electron')
const fsp = fs.promises

function sameFilesystemPath (a, b) {
  return path.normalize(a) === path.normalize(b)
}

async function copyEntry (sourcePath, targetPath, overwrite = false) {
  const stats = await fsp.stat(sourcePath)
  if (fs.existsSync(targetPath)) {
    if (!overwrite) {
      const err = new Error(`目标已存在: ${path.basename(targetPath)}`)
      err.code = 'EEXIST'
      throw err
    }
    await fsp.rm(targetPath, { recursive: true, force: true })
  }
  if (stats.isDirectory()) {
    await fsp.cp(sourcePath, targetPath, { recursive: true })
    return
  }
  await fsp.copyFile(sourcePath, targetPath)
}

async function moveEntry (sourcePath, targetPath, overwrite = false) {
  if (sameFilesystemPath(sourcePath, targetPath)) return
  if (fs.existsSync(targetPath)) {
    if (!overwrite) {
      const err = new Error(`目标已存在: ${path.basename(targetPath)}`)
      err.code = 'EEXIST'
      throw err
    }
    await fsp.rm(targetPath, { recursive: true, force: true })
  }
  try {
    await fsp.rename(sourcePath, targetPath)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    await copyEntry(sourcePath, targetPath, false)
    await fsp.rm(sourcePath, { recursive: true, force: true })
  }
}

function registerFilesystemHandlers({
  ipcMain,
  getMainWindow,
  executeGitCommand,
  shell,
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

  ipcMain.handle('create-file', async (event, { filePath, content = '' }) => {
    try {
      if (!filePath) {
        return { success: false, error: '缺少 filePath 参数' }
      }
      if (fs.existsSync(filePath)) {
        return { success: false, error: '文件已存在' }
      }
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, content, 'utf-8')
      return { success: true, path: filePath }
    } catch (error) {
      safeError('创建文件失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('create-directory', async (event, { dirPath }) => {
    try {
      if (!dirPath) {
        return { success: false, error: '缺少 dirPath 参数' }
      }
      if (fs.existsSync(dirPath)) {
        return { success: false, error: '文件夹已存在' }
      }
      await fsp.mkdir(dirPath, { recursive: false })
      return { success: true, path: dirPath }
    } catch (error) {
      safeError('创建文件夹失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rename-filesystem-item', async (event, { sourcePath, targetName }) => {
    try {
      if (!sourcePath || !targetName) {
        return { success: false, error: '缺少 sourcePath 或 targetName 参数' }
      }
      const trimmedTargetName = String(targetName).trim()
      if (!trimmedTargetName) {
        return { success: false, error: '目标名称不能为空' }
      }
      if (trimmedTargetName.includes('/') || trimmedTargetName.includes('\\')) {
        return { success: false, error: '目标名称不能包含路径分隔符' }
      }
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: '源文件或文件夹不存在' }
      }

      const targetPath = path.join(path.dirname(sourcePath), trimmedTargetName)
      if (sameFilesystemPath(sourcePath, targetPath)) {
        return { success: true, path: sourcePath }
      }
      if (fs.existsSync(targetPath)) {
        return { success: false, error: '同名文件或文件夹已存在' }
      }

      await fsp.rename(sourcePath, targetPath)
      return { success: true, path: targetPath }
    } catch (error) {
      safeError('重命名文件系统条目失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('get-filesystem-paste-conflicts', async (event, { sources, targetDirectory }) => {
    try {
      if (!Array.isArray(sources) || !sources.length || !targetDirectory) {
        return { success: false, conflictNames: [], error: '缺少 sources 或 targetDirectory 参数' }
      }
      const conflictNames = []
      const seen = new Set()
      for (const sourcePath of sources) {
        const targetPath = path.join(targetDirectory, path.basename(sourcePath))
        if (sameFilesystemPath(sourcePath, targetPath)) continue
        if (fs.existsSync(targetPath)) {
          const base = path.basename(sourcePath)
          if (seen.has(base)) continue
          seen.add(base)
          conflictNames.push(base)
        }
      }
      return { success: true, conflictNames }
    } catch (error) {
      safeError('检测粘贴冲突失败:', error)
      return { success: false, conflictNames: [], error: error.message }
    }
  })

  ipcMain.handle('copy-filesystem-items', async (event, { sources, targetDirectory, overwrite = false }) => {
    try {
      if (!Array.isArray(sources) || !sources.length || !targetDirectory) {
        return { success: false, error: '缺少 sources 或 targetDirectory 参数' }
      }
      const results = []
      for (const sourcePath of sources) {
        const targetPath = path.join(targetDirectory, path.basename(sourcePath))
        if (targetPath.startsWith(`${sourcePath}${path.sep}`)) {
          return { success: false, error: `不能复制到自身子目录: ${path.basename(sourcePath)}` }
        }
        if (sameFilesystemPath(sourcePath, targetPath)) {
          results.push(targetPath)
          continue
        }
        await copyEntry(sourcePath, targetPath, overwrite)
        results.push(targetPath)
      }
      return { success: true, paths: results }
    } catch (error) {
      safeError('复制文件系统条目失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('move-filesystem-items', async (event, { sources, targetDirectory, overwrite = false }) => {
    try {
      if (!Array.isArray(sources) || !sources.length || !targetDirectory) {
        return { success: false, error: '缺少 sources 或 targetDirectory 参数' }
      }
      const results = []
      for (const sourcePath of sources) {
        const targetPath = path.join(targetDirectory, path.basename(sourcePath))
        if (targetPath.startsWith(`${sourcePath}${path.sep}`)) {
          return { success: false, error: `不能移动到自身子目录: ${path.basename(sourcePath)}` }
        }
        if (sameFilesystemPath(sourcePath, targetPath)) {
          results.push(targetPath)
          continue
        }
        await moveEntry(sourcePath, targetPath, overwrite)
        results.push(targetPath)
      }
      return { success: true, paths: results }
    } catch (error) {
      safeError('移动文件系统条目失败:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('delete-filesystem-items', async (event, { paths }) => {
    try {
      if (!Array.isArray(paths) || !paths.length) {
        return { success: false, error: '缺少 paths 参数' }
      }
      for (const targetPath of paths) {
        await shell.trashItem(targetPath)
      }
      return { success: true }
    } catch (error) {
      safeError('删除文件系统条目失败:', error)
      return { success: false, error: error.message }
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
