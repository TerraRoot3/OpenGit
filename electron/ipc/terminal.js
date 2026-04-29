function registerTerminalHandlers({
  ipcMain,
  BrowserWindow,
  app,
  pty,
  fs,
  path,
  fileURLToPath,
  buildTerminalLaunchOptions,
  safeLog,
  getMainWindow
}) {
  const { terminalBuffers, normalizeTerminalMode } = require('../mcp/services/terminalBuffers')
  const {
    registerTerminalSession,
    getTerminalSession,
    removeTerminalSession,
    clearTerminalSessions,
    listTerminalSessions,
    writeTerminalSession
  } = require('./terminal-runtime')
  const { execFile } = require('child_process')

  const resolveProcessCwd = (pid) => {
    if (!pid) return Promise.resolve('')

    return new Promise((resolve) => {
      if (process.platform === 'linux') {
        try {
          resolve(fs.realpathSync(`/proc/${pid}/cwd`))
        } catch {
          resolve('')
        }
        return
      }

      if (process.platform === 'darwin') {
        execFile(
          'lsof',
          ['-a', '-p', String(pid), '-d', 'cwd', '-F', 'n'],
          { timeout: 600 },
          (error, stdout) => {
            if (error || !stdout) {
              resolve('')
              return
            }
            const line = stdout.split('\n').find((item) => item.startsWith('n'))
            if (!line) {
              resolve('')
              return
            }
            resolve(line.slice(1).trim())
          }
        )
        return
      }

      resolve('')
    })
  }

  const resolveSessionCwd = async (terminalId) => {
    const session = getTerminalSession(terminalId)
    if (!session?.ptyProcess) return ''
    try {
      const pid = session.ptyProcess.pid
      const resolved = pid ? await resolveProcessCwd(pid) : ''
      if (resolved) {
        session.projectPath = resolved
        return resolved
      }
    } catch {}
    return session.projectPath || ''
  }

  ipcMain.handle('terminal-create', async (event, payload) => {
    try {
      const raw = payload && typeof payload === 'object' ? payload : {}
      let cwd = raw.cwd
      if (cwd != null && typeof cwd !== 'string') cwd = String(cwd)
      const id = raw.id
      const mode = normalizeTerminalMode(raw.mode || raw.terminalMode || raw.routeType || raw.kind || '')

      const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
      const homeDir = app.getPath('home')

      const resolvePtyCwd = (cwdRaw) => {
        if (cwdRaw == null || typeof cwdRaw !== 'string' || !cwdRaw.trim()) return homeDir
        let s = cwdRaw.trim()
        try {
          s = decodeURIComponent(s)
        } catch {}
        if (/^file:\/\//i.test(s)) {
          try {
            s = fileURLToPath(s)
          } catch {
            try {
              s = fileURLToPath(new URL(s))
            } catch {
              return homeDir
            }
          }
        }
        s = path.normalize(s)
        if (!path.isAbsolute(s)) return homeDir
        try {
          return fs.realpathSync(s)
        } catch {
          return s
        }
      }

      let resolvedCwd = resolvePtyCwd(cwd)
      const hadExplicitCwd = typeof cwd === 'string' && !!cwd.trim()
      try {
        if (!fs.statSync(resolvedCwd).isDirectory()) {
          if (!hadExplicitCwd || resolvedCwd === homeDir) {
            resolvedCwd = homeDir
          }
        }
      } catch {
        if (!hadExplicitCwd || resolvedCwd === homeDir) {
          resolvedCwd = homeDir
        }
      }

      const { shellArgs, env: launchEnv } = buildTerminalLaunchOptions({ shell, resolvedCwd, homeDir })
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env: launchEnv
      })

      const terminalId = id || `terminal-${Date.now()}`
      const terminalSession = {
        ptyProcess,
        projectPath: resolvedCwd,
        mode,
        skipInitialRefresh: true,
        hasUserInput: false
      }
      registerTerminalSession(terminalId, terminalSession)
      terminalBuffers.ensureTerminal({
        terminalId,
        projectPath: resolvedCwd,
        cwd: resolvedCwd,
        mode
      })

      const senderContents = event.sender
      const getSenderWindow = () => {
        try {
          if (!senderContents.isDestroyed()) return senderContents
        } catch {}
        const windows = BrowserWindow.getAllWindows()
        const win = windows.find(w => !w.isDestroyed())
        return win ? win.webContents : null
      }

      const RUNTIMES = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'java', 'deno', 'bun'])
      const resolveTitleAsync = (rawName) => {
        return new Promise((resolve) => {
          const baseName = rawName ? rawName.split('/').pop() : ''
          if (!baseName || !RUNTIMES.has(baseName)) {
            resolve(baseName)
            return
          }

          execFile(
            'sh',
            ['-c', `pgrep -P ${ptyProcess.pid} | head -1 | xargs -I{} ps -o args= -p {} 2>/dev/null`],
            { timeout: 500 },
            (err, stdout) => {
              if (err || !stdout) {
                resolve(baseName)
                return
              }
              const args = stdout.trim()
              if (args) {
                for (const part of args.split(/\s+/)) {
                  if (part.startsWith('-')) continue
                  const seg = part.split('/').pop()
                  if (RUNTIMES.has(seg)) continue
                  const name = seg.replace(/\.(js|ts|mjs|cjs|py|rb|pl|jar)$/, '')
                  if (name) {
                    resolve(name)
                    return
                  }
                }
              }
              resolve(baseName)
            }
          )
        })
      }

      let lastTitle = ''
      let titleResolving = false
      const titleTimer = setInterval(async () => {
        if (titleResolving) return
        try {
          const procName = ptyProcess.process
          if (!procName) return
          titleResolving = true
          const title = await resolveTitleAsync(procName)
          titleResolving = false
          if (title && title !== lastTitle) {
            lastTitle = title
            const wc = getSenderWindow()
            if (wc) wc.send('terminal-title', { id: terminalId, title })
          }

          const sessionInfo = getTerminalSession(terminalId)
          if (sessionInfo) {
            const cwd = await resolveProcessCwd(ptyProcess.pid)
            if (cwd && cwd !== sessionInfo.projectPath) {
              sessionInfo.projectPath = cwd
              terminalBuffers.updateTerminal(terminalId, {
                projectPath: cwd,
                cwd
              })
              const wc = getSenderWindow()
              if (wc) wc.send('terminal-cwd', { id: terminalId, cwd })
            }
          }
        } catch {
          titleResolving = false
        }
      }, 800)

      let refreshDebounce = null
      ptyProcess.onData((data) => {
        terminalBuffers.appendOutput(terminalId, data)
        const wc = getSenderWindow()
        if (wc) wc.send('terminal-output', { id: terminalId, data })
        if (refreshDebounce) clearTimeout(refreshDebounce)
        refreshDebounce = setTimeout(() => {
          refreshDebounce = null
        const sessionInfo = getTerminalSession(terminalId)
        if (!sessionInfo) return
          if (sessionInfo.skipInitialRefresh && !sessionInfo.hasUserInput) {
            sessionInfo.skipInitialRefresh = false
            return
          }
          sessionInfo.skipInitialRefresh = false
          const mainWindow = getMainWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('refresh-on-focus', {
              source: 'terminal',
              terminalId,
              projectPath: sessionInfo.projectPath
            })
          }
        }, 1000)
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        clearInterval(titleTimer)
        if (refreshDebounce) {
          clearTimeout(refreshDebounce)
          refreshDebounce = null
        }
        terminalBuffers.removeTerminal(terminalId)
        removeTerminalSession(terminalId)
        const wc = getSenderWindow()
        if (wc) wc.send('terminal-exit', { id: terminalId, exitCode, signal })
      })

      safeLog(`✅ 终端创建: ${terminalId}, shell: ${shell}, cwd: ${resolvedCwd}`)
      return { success: true, id: terminalId, resolvedCwd }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.on('terminal-write', (event, { id, data }) => {
    void writeTerminalSession(id, data).catch(() => {})
  })

  ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
    const session = getTerminalSession(id)
    if (session?.ptyProcess) {
      try {
        session.ptyProcess.resize(cols, rows)
      } catch {}
    }
  })

  ipcMain.handle('terminal-get-cwd', async (event, payload) => {
    const terminalId = payload && payload.id
    if (!terminalId) {
      return { success: false, error: 'terminal id required' }
    }
    try {
      const cwd = await resolveSessionCwd(terminalId)
      if (!cwd) {
        return { success: false, error: 'cwd unavailable' }
      }
      terminalBuffers.updateTerminal(terminalId, {
        projectPath: cwd,
        cwd
      })
      return { success: true, id: terminalId, cwd, projectPath: cwd }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('terminal-destroy', async (event, { id }) => {
    const session = getTerminalSession(id)
    if (session?.ptyProcess) {
      try {
        session.ptyProcess.kill()
        terminalBuffers.removeTerminal(id)
        removeTerminalSession(id)
        return { success: true }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
    return { success: false, error: '终端不存在' }
  })

  const cleanup = () => {
    for (const { terminalId } of listTerminalSessions()) {
      const session = getTerminalSession(terminalId)
      if (!session) continue
      try {
        session.ptyProcess.kill()
      } catch {}
      terminalBuffers.removeTerminal(terminalId)
    }
    clearTerminalSessions()
  }

  return { cleanup }
}

module.exports = { registerTerminalHandlers }
