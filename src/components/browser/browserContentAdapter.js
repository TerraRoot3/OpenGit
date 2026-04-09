const getTabContentKind = (tab) => {
  if (!tab) return 'builtin'
  return tab.routeConfig?.showWebview ? 'web' : 'builtin'
}

const toWebContentsViewTabId = (tab) => `browser-web-${tab.id}`

const getTabContentHost = (tab) => {
  if (!tab) return 'builtin'
  if (getTabContentKind(tab) !== 'web') return 'builtin'
  return tab.contentHost || 'webcontentsview'
}

export function createBrowserContentAdapter({
  getCurrentTab,
  getTabById,
  getCurrentWebview,
  getWebviewForTab,
  navigateToUrlForTab
}) {
  const captureWebTabState = (tab) => {
    if (!tab || getTabContentKind(tab) !== 'web') return null
    if (getTabContentHost(tab) !== 'webview') {
      return {
        url: tab.url || '',
        canGoBack: !!tab.canGoBack,
        canGoForward: !!tab.canGoForward
      }
    }

    const webview = getWebviewForTab(tab.id)
    if (!webview) return null

    try {
      const actualSrc = webview.src
      return {
        url: actualSrc && actualSrc !== 'about:blank#blocked' ? actualSrc : (tab.url || ''),
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward()
      }
    } catch (error) {
      console.warn('captureWebTabState failed:', error)
      return null
    }
  }

  const reload = (tab = getCurrentTab()) => {
    if (!tab) return false
    if (getTabContentKind(tab) !== 'web') return false

    if (getTabContentHost(tab) === 'webcontentsview') {
      if (window.electronAPI?.webTabReload) {
        window.electronAPI.webTabReload({ tabId: toWebContentsViewTabId(tab) })
        return true
      }
      if (tab.url) {
        navigateToUrlForTab(tab, tab.url)
        return true
      }
      return false
    }

    if (getTabContentHost(tab) === 'webview') {
      const webview = getWebviewForTab(tab.id)
      if (webview && typeof webview.reload === 'function') {
        webview.reload()
        return true
      }
    }

    if (tab.url) {
      navigateToUrlForTab(tab, tab.url)
      return true
    }

    return false
  }

  const goBack = (tab = getCurrentTab()) => {
    if (!tab) return false
    if (getTabContentKind(tab) !== 'web') return false

    if (getTabContentHost(tab) === 'webcontentsview') {
      if (window.electronAPI?.webTabGoBack) {
        window.electronAPI.webTabGoBack({ tabId: toWebContentsViewTabId(tab) })
        return true
      }
      return false
    }

    if (getTabContentHost(tab) === 'webview') {
      const webview = getWebviewForTab(tab.id)
      if (webview && typeof webview.goBack === 'function' && tab.canGoBack) {
        webview.goBack()
        return true
      }
    }

    return false
  }

  const goForward = (tab = getCurrentTab()) => {
    if (!tab) return false
    if (getTabContentKind(tab) !== 'web') return false

    if (getTabContentHost(tab) === 'webcontentsview') {
      if (window.electronAPI?.webTabGoForward) {
        window.electronAPI.webTabGoForward({ tabId: toWebContentsViewTabId(tab) })
        return true
      }
      return false
    }

    if (getTabContentHost(tab) === 'webview') {
      const webview = getWebviewForTab(tab.id)
      if (webview && typeof webview.goForward === 'function' && tab.canGoForward) {
        webview.goForward()
        return true
      }
    }

    return false
  }

  const syncNavigationState = (tab = getCurrentTab()) => {
    if (!tab || getTabContentKind(tab) !== 'web') return false

    if (getTabContentHost(tab) === 'webview') {
      const webview = getCurrentWebview()
      if (!webview) return false
      try {
        tab.canGoBack = webview.canGoBack()
        tab.canGoForward = webview.canGoForward()
        return true
      } catch (error) {
        console.warn('syncNavigationState failed:', error)
      }
    }

    return false
  }

  const getWebAuthnDiagnostics = async (tab = getCurrentTab()) => {
    if (!tab || getTabContentKind(tab) !== 'web') return null
    const script = `(() => ({
      hasCredentials: typeof navigator.credentials !== 'undefined',
      hasPublicKeyCredential: typeof window.PublicKeyCredential !== 'undefined',
      hasCreate: typeof navigator.credentials?.create === 'function',
      hasGet: typeof navigator.credentials?.get === 'function',
      conditionalMediation: typeof PublicKeyCredential?.isConditionalMediationAvailable === 'function'
    }))()`

    if (getTabContentHost(tab) === 'webcontentsview' && window.electronAPI?.webTabEvaluate) {
      const result = await window.electronAPI.webTabEvaluate({
        tabId: toWebContentsViewTabId(tab),
        script
      })
      return result?.success ? result.result : null
    }

    if (getTabContentHost(tab) === 'webview') {
      const webview = getWebviewForTab(tab.id)
      if (!webview || typeof webview.executeJavaScript !== 'function') return null
      return webview.executeJavaScript(script)
    }

    return null
  }

  return {
    getTabContentKind,
    getTabContentHost,
    captureWebTabState,
    reload,
    goBack,
    goForward,
    syncNavigationState,
    getWebAuthnDiagnostics,
    getTabById
  }
}

export { getTabContentKind, getTabContentHost }
