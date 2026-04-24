function registerCommandHandlers({
  ipcMain,
  isGitWriteCommand,
  checkAndRemoveGitLock,
  safeLog,
  safeError
}) {
  const runningProcesses = new Map()
  let processIdCounter = 0
  const terminateChildProcess = (child, signal = 'SIGTERM') => {
    if (!child?.pid) return
    try {
      if (process.platform !== 'win32') {
        process.kill(-child.pid, signal)
        return
      }
    } catch (error) {
      safeError(`⚠️ 终止进程组失败(${signal}):`, error.message)
    }

    try {
      child.kill(signal)
    } catch (error) {
      safeError(`⚠️ 终止进程失败(${signal}):`, error.message)
    }
  }

  const sendToRenderer = (sender, channel, payload) => {
    if (sender && !sender.isDestroyed()) {
      sender.send(channel, payload)
    }
  }

  ipcMain.handle('execute-command', async (event, data) => {
    try {
      const cwd = data.cwd || data.path || process.cwd()
      safeLog(`⚡ 执行命令: ${data.command} 在 ${cwd}`)

      if (isGitWriteCommand(data.command)) {
        const lockResult = await checkAndRemoveGitLock(cwd)
        if (lockResult.removed) {
          safeLog(`✅ Git 锁文件已处理: ${lockResult.reason}`)
        }
      }

      const { spawn } = require('child_process')
      const processId = ++processIdCounter

      return new Promise((resolve) => {
        const child = spawn('bash', ['-c', data.command], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32'
        })

        runningProcesses.set(processId, child)
        sendToRenderer(event.sender, 'command-process-id', { processId })

        let stdout = ''
        let stderr = ''
        let resolved = false

        const cleanup = () => {
          runningProcesses.delete(processId)
        }

        const isNetworkCmd = data.command && (
          data.command.includes('git push') || data.command.includes('git pull') ||
          data.command.includes('git fetch') || data.command.includes('git clone')
        )
        const timeoutMs = data.timeout || (isNetworkCmd ? 300000 : 120000)
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            safeError(`⏰ 命令执行超时 (${timeoutMs / 1000}s): ${data.command}`)
            terminateChildProcess(child, 'SIGTERM')
            setTimeout(() => terminateChildProcess(child, 'SIGKILL'), 5000)
            resolve({
              success: false,
              output: stdout.trim(),
              stdout: stdout.trim(),
              stderr: `命令执行超时 (${timeoutMs / 1000}秒)`,
              exitCode: -1,
              timeout: true
            })
          }
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })

        child.on('close', (code) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            safeLog(`✅ 命令执行完成，退出码: ${code}`)
            resolve({
              success: code === 0,
              output: stdout.trim(),
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code
            })
          }
        })

        child.on('error', (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            safeError('❌ 命令执行失败:', error.message)
            resolve({
              success: false,
              output: '',
              stdout: stdout.trim(),
              stderr: error.message,
              exitCode: -1
            })
          }
        })
      })
    } catch (error) {
      safeError('❌ 执行命令异常:', error.message)
      return { success: false, message: `执行失败: ${error.message}` }
    }
  })

  ipcMain.handle('execute-command-realtime', async (event, data) => {
    try {
      const cwd = data.cwd || data.path || process.cwd()
      safeLog(`⚡ 实时执行命令: ${data.command} 在 ${cwd}`)

      if (isGitWriteCommand(data.command)) {
        const lockResult = await checkAndRemoveGitLock(cwd)
        if (lockResult.removed) {
          safeLog(`✅ Git 锁文件已处理: ${lockResult.reason}`)
          sendToRenderer(event.sender, 'realtime-command-output', {
            type: 'stdout',
            data: '⚠️ 检测到 Git 锁文件，已自动处理\n'
          })
        }
      }

      const { spawn } = require('child_process')
      const processId = ++processIdCounter

      return new Promise((resolve) => {
        const child = spawn('bash', ['-c', data.command], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32'
        })

        runningProcesses.set(processId, child)
        sendToRenderer(event.sender, 'command-process-id', { processId })

        let stdout = ''
        let stderr = ''
        let allOutput = ''
        let resolved = false

        const cleanup = () => {
          runningProcesses.delete(processId)
        }

        const isNetworkCmd = data.command && (
          data.command.includes('git push') || data.command.includes('git pull') ||
          data.command.includes('git fetch') || data.command.includes('git clone')
        )
        const timeoutMs = data.timeout || (isNetworkCmd ? 300000 : 120000)
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            cleanup()
            safeError(`⏰ 实时命令执行超时 (${timeoutMs / 1000}s): ${data.command}`)
            terminateChildProcess(child, 'SIGTERM')
            setTimeout(() => terminateChildProcess(child, 'SIGKILL'), 5000)
            sendToRenderer(event.sender, 'realtime-command-output', {
              type: 'complete',
              code: -1,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: `命令执行超时 (${timeoutMs / 1000}秒)`
            })
            resolve({
              success: false,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: `命令执行超时 (${timeoutMs / 1000}秒)`,
              exitCode: -1,
              timeout: true
            })
          }
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
          const output = chunk.toString()
          stdout += output
          allOutput += output
          sendToRenderer(event.sender, 'realtime-command-output', {
            type: 'stdout',
            data: output
          })
        })

        child.stderr.on('data', (chunk) => {
          const output = chunk.toString()
          stderr += output
          allOutput += output
          sendToRenderer(event.sender, 'realtime-command-output', {
            type: 'stderr',
            data: output
          })
        })

        child.on('close', (code) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            safeLog(`✅ 实时命令执行完成，退出码: ${code}`)
            sendToRenderer(event.sender, 'realtime-command-output', {
              type: 'complete',
              code,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: stderr.trim()
            })
            resolve({
              success: code === 0,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code
            })
          }
        })

        child.on('error', (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            safeError('❌ 实时命令执行失败:', error.message)
            sendToRenderer(event.sender, 'realtime-command-output', {
              type: 'error',
              error: error.message
            })
            resolve({
              success: false,
              output: '',
              stdout: stdout.trim(),
              stderr: error.message,
              exitCode: -1
            })
          }
        })
      })
    } catch (error) {
      safeError('❌ 实时命令执行异常:', error.message)
      return { success: false, message: `执行失败: ${error.message}` }
    }
  })

  ipcMain.handle('kill-command-process', async (event, { processId }) => {
    try {
      const child = runningProcesses.get(processId)
      if (child) {
        safeLog(`🛑 取消命令进程: ${processId}`)
        terminateChildProcess(child, 'SIGTERM')
        setTimeout(() => {
          terminateChildProcess(child, 'SIGKILL')
        }, 5000)
        runningProcesses.delete(processId)
        return { success: true }
      }
      return { success: false, message: '进程不存在或已结束' }
    } catch (error) {
      return { success: false, message: error.message }
    }
  })

  const cleanup = () => {
    for (const [, child] of runningProcesses) {
      terminateChildProcess(child, 'SIGTERM')
      setTimeout(() => {
        terminateChildProcess(child, 'SIGKILL')
      }, 5000)
    }
    runningProcesses.clear()
  }

  return { cleanup }
}

module.exports = { registerCommandHandlers }
