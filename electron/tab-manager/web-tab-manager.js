const { WebContentsView } = require('electron')
const { createWebTabLifecycleController } = require('./web-tab-lifecycle')

function createRecoverySnapshot(input = {}) {
  return {
    tabId: input.tabId || '',
    url: input.url || 'about:blank',
    title: input.title || '',
    favicon: input.favicon || '',
    partition: input.partition || 'persist:main',
    lifecyclePhase: input.lifecyclePhase || 'warm',
    isCrashed: Boolean(input.isCrashed)
  }
}

function shouldAutoRestoreDiscardedTab({ isActive = false, lifecyclePhase = '' } = {}) {
  return Boolean(isActive) && lifecyclePhase === 'discarded'
}

class WebTabManager {
  constructor({
    safeLog = () => {},
    safeError = () => {},
    lifecycleOptions = {},
    webTabPreloadPath = '',
    ViewClass = WebContentsView,
    /** 内置网页区域获得焦点时回调（用于关闭地址栏联想等浮层） */
    onBrowserWebContentsFocused = null
  } = {}) {
    this.safeLog = safeLog
    this.safeError = safeError
    this.ViewClass = ViewClass
    this.onBrowserWebContentsFocused =
      typeof onBrowserWebContentsFocused === 'function' ? onBrowserWebContentsFocused : null
    this.mainWindow = null
    this.renderer = null
    this.views = new Map()
    this.recoveryMeta = new Map()
    this.contentsToTab = new Map()
    this.activeTabId = null
    this.activeBounds = null
    this.lifecycle = createWebTabLifecycleController(lifecycleOptions)
    this.webTabPreloadPath = webTabPreloadPath || ''
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

  _ensureRecoveryMeta(tabId) {
    if (!tabId) return null
    if (!this.recoveryMeta.has(tabId)) {
      this.recoveryMeta.set(tabId, createRecoverySnapshot({ tabId }))
    }
    return this.recoveryMeta.get(tabId)
  }

  _setRecoveryMeta(tabId, patch = {}) {
    const current = this._ensureRecoveryMeta(tabId)
    if (!current) return null
    const next = createRecoverySnapshot({
      ...current,
      ...patch,
      tabId
    })
    this.recoveryMeta.set(tabId, next)
    return next
  }

  _emitLifecycleChanged(tabId) {
    if (!tabId) return
    const state = this.lifecycle.getState(tabId)
    if (!state) return
    this._setRecoveryMeta(tabId, { lifecyclePhase: state.phase })
    this._emit('web-tab-lifecycle-changed', {
      tabId,
      ...state
    })
  }

  _registerLifecycle(tabId, now = Date.now()) {
    this.lifecycle.registerTab(tabId, now)
    this._emitLifecycleChanged(tabId)
  }

  _activateLifecycle(tabId, now = Date.now()) {
    this.lifecycle.activateTab(tabId, now)
    this._emitLifecycleChanged(tabId)
  }

  _deactivateLifecycle(tabId, now = Date.now()) {
    this.lifecycle.deactivateTab(tabId, now)
    this._emitLifecycleChanged(tabId)
  }

  _bindViewEvents(tabId, view) {
    const wc = view.webContents
    const isAbortError = (errorCode, errorDescription = '') => {
      if (Number(errorCode) === -3) return true
      return String(errorDescription).toUpperCase().includes('ERR_ABORTED')
    }

    wc.on('page-title-updated', (event, title) => {
      this._setRecoveryMeta(tabId, { title: title || '' })
      this._emit('web-tab-title-updated', { tabId, title: title || '' })
    })

    wc.on('page-favicon-updated', (event, favicons = []) => {
      this._setRecoveryMeta(tabId, { favicon: favicons[0] || '' })
      this._emit('web-tab-favicon-updated', { tabId, favicon: favicons[0] || '' })
    })

    const emitState = () => {
      const url = wc.getURL()
      this._setRecoveryMeta(tabId, {
        url: url || 'about:blank',
        isCrashed: false
      })
      this._emit('web-tab-state-changed', {
        tabId,
        url,
        isLoading: wc.isLoading(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        isCrashed: false
      })
    }

    wc.on('did-start-loading', emitState)
    wc.on('did-stop-loading', emitState)
    wc.on('did-navigate', emitState)
    wc.on('did-navigate-in-page', emitState)

    wc.on('focus', () => {
      try {
        this.onBrowserWebContentsFocused?.()
      } catch (err) {
        this.safeError('[WebTabManager] onBrowserWebContentsFocused failed', err)
      }
    })

    wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (isAbortError(errorCode, errorDescription)) return
      if (validatedURL) {
        this._setRecoveryMeta(tabId, { url: validatedURL })
      }
      this._emit('web-tab-load-failed', {
        tabId,
        errorCode,
        errorDescription,
        url: validatedURL || ''
      })
    })

    wc.on('render-process-gone', (event, details) => {
      this.markTabCrashed(tabId)
      this._setRecoveryMeta(tabId, {
        url: wc.getURL() || 'about:blank',
        isCrashed: true
      })
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

  _createView(partition) {
    if (typeof this.ViewClass !== 'function') {
      throw new TypeError('WebContentsView is not available')
    }

    return new this.ViewClass({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.webTabPreloadPath || undefined
      }
    })
  }

  _restoreMissingView(tabId, url = '') {
    if (!tabId || !this.recoveryMeta.has(tabId)) {
      return null
    }

    const snapshot = this.createRecoverySnapshot(tabId)
    const restoreResult = this.restoreWebTab(tabId, url || snapshot.url || 'about:blank')
    if (!restoreResult?.success) {
      return null
    }

    return this._getView(tabId)
  }

  createWebTab(tabId, url = 'about:blank', options = {}) {
    if (!tabId) throw new Error('tabId is required')
    const partition = options.partition || 'persist:main'
    this._registerLifecycle(tabId)
    this._setRecoveryMeta(tabId, {
      url: url || 'about:blank',
      partition,
      isCrashed: false
    })

    if (this.views.has(tabId)) {
      const existingView = this.views.get(tabId)
      if (existingView?.webContents?.id) {
        this.contentsToTab.set(existingView.webContents.id, tabId)
      }
      return existingView
    }

    const view = this._createView(partition)

    this.views.set(tabId, view)
    this.contentsToTab.set(view.webContents.id, tabId)
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
    if (!view) {
      const hadLifecycleState = Boolean(this.lifecycle.getState(tabId))
      if (this.activeTabId === tabId) {
        this.activeTabId = null
      }
      this.lifecycle.unregisterTab(tabId)
      this.recoveryMeta.delete(tabId)
      return hadLifecycleState
    }
    const webContentsId = view.webContents?.id

    try {
      this.mainWindow?.contentView?.removeChildView(view)
    } catch {}

    try {
      view.webContents.close()
    } catch {}

    this.views.delete(tabId)
    if (webContentsId) {
      this.contentsToTab.delete(webContentsId)
    }
    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }
    this.lifecycle.unregisterTab(tabId)
    this.recoveryMeta.delete(tabId)
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
    const previousActiveTabId = this.activeTabId

    for (const [, view] of this.views) {
      try {
        this.mainWindow.contentView.removeChildView(view)
      } catch {}
    }

    this.activeTabId = null
    if (previousActiveTabId) {
      this._deactivateLifecycle(previousActiveTabId)
    }
    return true
  }

  activateWebTab(tabId, bounds = null) {
    const view = this._getView(tabId) || this._restoreMissingView(tabId)
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
      this._setRecoveryMeta(tabId, { isCrashed: false })
      this._activateLifecycle(tabId)
      return true
    } catch (error) {
      this.safeError(`[WebTabManager] activateWebTab failed for ${tabId}:`, error)
      return false
    }
  }

  navigateWebTab(tabId, url) {
    let view = this._getView(tabId)
    let restored = false
    if (!view) {
      view = this._restoreMissingView(tabId, url)
      restored = Boolean(view)
    }
    if (!view) return false
    this._setRecoveryMeta(tabId, {
      url: url || 'about:blank',
      isCrashed: false
    })

    if (restored && (!this.activeTabId || this.activeTabId === tabId)) {
      const activated = this.activateWebTab(tabId, this.activeBounds)
      if (!activated) return false
      view = this._getView(tabId)
      if (!view) return false
    }

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
    let view = this._getView(tabId)
    let restored = false
    if (!view) {
      view = this._restoreMissingView(tabId)
      restored = Boolean(view)
    }
    if (!view) return false

    if (restored && (!this.activeTabId || this.activeTabId === tabId)) {
      const activated = this.activateWebTab(tabId, this.activeBounds)
      if (!activated) return false
      view = this._getView(tabId)
      if (!view) return false
    }

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

  getTabIdByWebContentsId(webContentsId) {
    if (!webContentsId) return ''
    return this.contentsToTab.get(webContentsId) || ''
  }

  isActiveTab(tabId) {
    return Boolean(tabId) && this.activeTabId === tabId
  }

  advanceLifecycle(now = Date.now()) {
    const transitions = this.lifecycle.advance(now)
    for (const transition of transitions) {
      const [tabId] = String(transition).split(':')
      this._emitLifecycleChanged(tabId)
    }
    return transitions
  }

  discardWebTab(tabId) {
    if (!tabId) return false
    const view = this._getView(tabId)
    if (!view) return false
    const webContentsId = view.webContents?.id

    try {
      this.mainWindow?.contentView?.removeChildView(view)
    } catch {}

    try {
      view.webContents.close()
    } catch {}

    this.views.delete(tabId)
    if (webContentsId) {
      this.contentsToTab.delete(webContentsId)
    }
    if (this.activeTabId === tabId) {
      this.activeTabId = null
    }
    this._setRecoveryMeta(tabId, { lifecyclePhase: 'discarded' })
    return true
  }

  getLifecycleState(tabId) {
    return this.lifecycle.getState(tabId)
  }

  createRecoverySnapshot(tabId) {
    if (!tabId) return createRecoverySnapshot({})
    return createRecoverySnapshot(this.recoveryMeta.get(tabId) || { tabId })
  }

  markTabCrashed(tabId) {
    if (!tabId) return null
    return this._setRecoveryMeta(tabId, { isCrashed: true })
  }

  restoreWebTab(tabId, url = '') {
    if (!tabId) return { success: false, error: 'tabId is required' }
    if (this._getView(tabId)) {
      if (url) {
        this.navigateWebTab(tabId, url)
      }
      this._setRecoveryMeta(tabId, { isCrashed: false })
      return { success: true, restored: false }
    }

    const snapshot = this.createRecoverySnapshot(tabId)
    const restoreUrl = url || snapshot.url || 'about:blank'
    this.createWebTab(tabId, restoreUrl, { partition: snapshot.partition || 'persist:main' })
    this._setRecoveryMeta(tabId, {
      url: restoreUrl,
      isCrashed: false
    })
    this._deactivateLifecycle(tabId)
    return { success: true, restored: true }
  }

  cleanup() {
    for (const tabId of this.views.keys()) {
      this.destroyWebTab(tabId)
    }
    this.views.clear()
    this.recoveryMeta.clear()
    this.contentsToTab.clear()
    this.activeTabId = null
    this.activeBounds = null
  }

  getTabPartition(tabId) {
    return this.createRecoverySnapshot(tabId).partition || 'persist:main'
  }

  async evaluateWebTab(tabId, script = '') {
    const view = this._getView(tabId)
    if (!view || !script) {
      return { success: false, error: 'tab or script is missing' }
    }
    try {
      const result = await view.webContents.executeJavaScript(script, true)
      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

module.exports = {
  WebTabManager,
  createRecoverySnapshot,
  shouldAutoRestoreDiscardedTab
}
