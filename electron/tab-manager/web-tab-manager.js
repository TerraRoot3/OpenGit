const { WebContentsView } = require('electron')

class WebTabManager {
  constructor({ safeLog = () => {}, safeError = () => {} } = {}) {
    this.safeLog = safeLog
    this.safeError = safeError
    this.mainWindow = null
    this.renderer = null
    this.views = new Map()
    this.activeTabId = null
    this.activeBounds = null
  }

  attachWindow(mainWindow) {
    this.mainWindow = mainWindow
    this.renderer = mainWindow?.webContents || null
  }

  _emit(channel, payload = {}) {
    try {
      if (this.renderer && !this.renderer.isDestroyed()) {
        this.renderer.send(channel, payload)
      }
    } catch (error) {
      this.safeError(`[WebTabManager] emit failed: ${channel}`, error)
    }
  }

  _getView(tabId) {
    return this.views.get(tabId) || null
  }

  _bindViewEvents(tabId, view) {
    const wc = view.webContents
    const isAbortError = (errorCode, errorDescription = '') => {
      if (Number(errorCode) === -3) return true
      return String(errorDescription).toUpperCase().includes('ERR_ABORTED')
    }

    wc.on('page-title-updated', (event, title) => {
      this._emit('web-tab-title-updated', { tabId, title: title || '' })
    })

    wc.on('page-favicon-updated', (event, favicons = []) => {
      this._emit('web-tab-favicon-updated', { tabId, favicon: favicons[0] || '' })
    })

    const emitState = () => {
      this._emit('web-tab-state-changed', {
        tabId,
        url: wc.getURL(),
        isLoading: wc.isLoading(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      })
    }

    wc.on('did-start-loading', emitState)
    wc.on('did-stop-loading', emitState)
    wc.on('did-navigate', emitState)
    wc.on('did-navigate-in-page', emitState)

    wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (isAbortError(errorCode, errorDescription)) return
      this._emit('web-tab-load-failed', {
        tabId,
        errorCode,
        errorDescription,
        url: validatedURL || ''
      })
    })

    wc.on('render-process-gone', (event, details) => {
      this._emit('web-tab-load-failed', {
        tabId,
        errorCode: -32001,
        errorDescription: `renderer process gone: ${details?.reason || 'unknown'}`,
        url: wc.getURL() || ''
      })
      this._emit('web-tab-state-changed', {
        tabId,
        isLoading: false,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        url: wc.getURL() || '',
        isCrashed: true
      })
    })
  }

  createWebTab(tabId, url = 'about:blank') {
    if (!tabId) throw new Error('tabId is required')
    if (this.views.has(tabId)) return this.views.get(tabId)

    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:main',
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.views.set(tabId, view)
    this._bindViewEvents(tabId, view)

    view.webContents.loadURL(url).catch((error) => {
      if (String(error?.message || '').toUpperCase().includes('ERR_ABORTED')) return
      this.safeError(`[WebTabManager] loadURL failed for ${tabId}:`, error)
      this._emit('web-tab-load-failed', {
        tabId,
        errorCode: -1,
        errorDescription: error.message,
        url
      })
    })

    return view
  }

  destroyWebTab(tabId) {
    const view = this._getView(tabId)
    if (!view) return false

    try {
      this.mainWindow?.contentView?.removeChildView(view)
    } catch {}

    try {
      view.webContents.close()
    } catch {}

    this.views.delete(tabId)
    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }
    return true
  }

  setActiveBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return false

    this.activeBounds = {
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width: Math.max(0, Number(bounds.width) || 0),
      height: Math.max(0, Number(bounds.height) || 0)
    }

    if (this.activeTabId) {
      const view = this._getView(this.activeTabId)
      if (view) {
        try {
          view.setBounds(this.activeBounds)
          view.setAutoResize({ width: true, height: true })
        } catch (error) {
          this.safeError('[WebTabManager] setActiveBounds failed:', error)
        }
      }
    }

    return true
  }

  hideAllWebTabs() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false

    for (const [, view] of this.views) {
      try {
        this.mainWindow.contentView.removeChildView(view)
      } catch {}
    }

    this.activeTabId = null
    return true
  }

  activateWebTab(tabId, bounds = null) {
    const view = this._getView(tabId)
    if (!view || !this.mainWindow || this.mainWindow.isDestroyed()) return false

    this.hideAllWebTabs()

    try {
      this.mainWindow.contentView.addChildView(view)
      if (bounds) {
        this.setActiveBounds(bounds)
      }
      if (this.activeBounds) {
        view.setBounds(this.activeBounds)
        view.setAutoResize({ width: true, height: true })
      }
      this.activeTabId = tabId
      return true
    } catch (error) {
      this.safeError(`[WebTabManager] activateWebTab failed for ${tabId}:`, error)
      return false
    }
  }

  navigateWebTab(tabId, url) {
    const view = this._getView(tabId)
    if (!view) return false

    view.webContents.loadURL(url).catch((error) => {
      if (String(error?.message || '').toUpperCase().includes('ERR_ABORTED')) return
      this.safeError(`[WebTabManager] navigateWebTab failed for ${tabId}:`, error)
      this._emit('web-tab-load-failed', {
        tabId,
        errorCode: -1,
        errorDescription: error.message,
        url
      })
    })

    return true
  }

  reloadWebTab(tabId) {
    const view = this._getView(tabId)
    if (!view) return false
    view.webContents.reload()
    return true
  }

  goBack(tabId) {
    const view = this._getView(tabId)
    if (!view) return false
    if (view.webContents.canGoBack()) {
      view.webContents.goBack()
    }
    return true
  }

  goForward(tabId) {
    const view = this._getView(tabId)
    if (!view) return false
    if (view.webContents.canGoForward()) {
      view.webContents.goForward()
    }
    return true
  }

  cleanup() {
    for (const tabId of this.views.keys()) {
      this.destroyWebTab(tabId)
    }
    this.views.clear()
    this.activeTabId = null
    this.activeBounds = null
  }
}

module.exports = { WebTabManager }
