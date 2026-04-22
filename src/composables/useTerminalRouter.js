// 全局终端 IPC 路由器
// 解决多个 TerminalPanel 实例共存时，IPC 监听冲突的问题
// 每个 TerminalPanel mount 时 register，unmount 时 unregister

const handlers = new Set()
let initialized = false

export function getTerminalRouterDebugStats() {
  return {
    handlerCount: handlers.size,
    initialized
  }
}

export function useTerminalRouter() {
  const register = (handler) => {
    handlers.add(handler)
    if (!initialized) {
      initialized = true
      window.electronAPI.terminal.onOutput((data) => {
        for (const h of handlers) h.onOutput(data)
      })
      window.electronAPI.terminal.onExit((data) => {
        for (const h of handlers) h.onExit(data)
      })
      window.electronAPI.terminal.onTitleChange((data) => {
        for (const h of handlers) {
          if (h.onTitleChange) h.onTitleChange(data)
        }
      })

      window.electronAPI.terminal.onCwdChange((data) => {
        for (const h of handlers) {
          if (h.onCwdChange) h.onCwdChange(data)
        }
      })
    }
  }

  const unregister = (handler) => {
    handlers.delete(handler)
  }

  return { register, unregister }
}
