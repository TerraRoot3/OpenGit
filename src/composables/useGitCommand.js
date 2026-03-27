import { ref } from 'vue'

/**
 * Git 命令执行 composable
 * 提供统一的命令执行接口，支持普通执行和带进度的实时执行
 */
export function useGitCommand() {
  // 操作状态
  const operationInProgress = ref(false)
  const operationCancelled = ref(false)
  const operationOutput = ref('')

  // 当前运行的进程 ID（用于取消操作时杀掉进程）
  let _currentProcessId = null

  /**
   * 执行普通 Git 命令
   * @param {string} command - 要执行的命令，支持 cd "path" && 格式
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  const executeCommand = async (command) => {
    try {
      const cdMatch = command.match(/^cd\s+"([^"]+)"\s+&&\s+/)
      const cwd = cdMatch ? cdMatch[1] : undefined
      const cleanCommand = cdMatch ? command.replace(cdMatch[0], '') : command

      const result = await window.electronAPI.executeCommand({ command: cleanCommand, cwd })
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 带进度的命令执行（实时输出）
   * @param {string} command - 要执行的命令
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<{success: boolean, output?: string, error?: string, exitCode?: number}>}
   */
  const executeCommandWithProgress = async (command, onProgress) => {
    try {
      if (operationCancelled.value) {
        return { success: false, error: '操作已取消' }
      }

      return new Promise((resolve) => {
        let fullOutput = ''
        let fullStderr = ''

        // 监听进程 ID（用于取消）
        const handleProcessId = (data) => {
          _currentProcessId = data.processId
        }
        window.electronAPI.onCommandProcessId(handleProcessId)

        const handleRealtimeOutput = (event, data) => {
          if (operationCancelled.value) return

          switch (data.type) {
            case 'stdout':
              if (data.data && !fullOutput.includes(data.data.trim())) {
                fullOutput += data.data
              }
              if (onProgress) onProgress(data.data)
              break
            case 'stderr':
              if (data.data && !fullStderr.includes(data.data.trim())) {
                fullStderr += data.data
              }
              if (onProgress) onProgress(data.data)
              break
            case 'complete':
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              window.electronAPI.removeCommandProcessIdListener()
              _currentProcessId = null
              resolve({
                success: data.code === 0,
                output: fullOutput + (fullStderr ? '\n' + fullStderr : ''),
                exitCode: data.code
              })
              break
            case 'error':
              window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
              window.electronAPI.removeCommandProcessIdListener()
              _currentProcessId = null
              resolve({ success: false, error: data.error, output: fullStderr || data.error })
              break
          }
        }

        setTimeout(() => {
          window.electronAPI.onRealtimeCommandOutput(handleRealtimeOutput)
        }, 10)

        window.electronAPI.executeCommandRealtime({ command }).then(result => {
          if (result && !result.success) {
            window.electronAPI.removeRealtimeCommandOutputListener(handleRealtimeOutput)
            window.electronAPI.removeCommandProcessIdListener()
            _currentProcessId = null
            resolve(result)
          }
        })
      })
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 取消当前操作（同时杀掉正在运行的子进程）
   */
  const cancelOperation = () => {
    operationCancelled.value = true
    operationInProgress.value = false
    // 杀掉正在运行的子进程
    if (_currentProcessId != null) {
      window.electronAPI.killCommandProcess(_currentProcessId).catch(() => {})
      _currentProcessId = null
    }
  }

  /**
   * 重置操作状态
   */
  const resetOperation = () => {
    operationInProgress.value = false
    operationCancelled.value = false
    operationOutput.value = ''
  }

  /**
   * 开始操作
   * @param {string} initialMessage - 初始输出消息
   */
  const startOperation = (initialMessage = '') => {
    operationOutput.value = initialMessage
    operationInProgress.value = true
    operationCancelled.value = false
  }

  /**
   * 追加输出
   * @param {string} text - 要追加的文本
   */
  const appendOutput = (text) => {
    if (text && !operationOutput.value.endsWith(text)) {
      operationOutput.value += text
    }
  }

  return {
    // 状态
    operationInProgress,
    operationCancelled,
    operationOutput,
    // 方法
    executeCommand,
    executeCommandWithProgress,
    cancelOperation,
    resetOperation,
    startOperation,
    appendOutput
  }
}

// 导出一个独立的 executeCommand 函数，供不需要状态管理的场景使用
export const executeCommand = async (command) => {
  try {
    const cdMatch = command.match(/^cd\s+"([^"]+)"\s+&&\s+/)
    const cwd = cdMatch ? cdMatch[1] : undefined
    const cleanCommand = cdMatch ? command.replace(cdMatch[0], '') : command

    const result = await window.electronAPI.executeCommand({ command: cleanCommand, cwd })
    return result
  } catch (error) {
    return { success: false, error: error.message }
  }
}
