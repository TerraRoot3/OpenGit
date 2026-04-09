export function useBrowserPersistence({
  browserTabs,
  activeBrowserTabId,
  tabOrder,
  isRestoringTabs,
  electronAPI,
  createBrowserTab,
  switchBrowserTab,
  routeConfig,
  resolveSessionPartition
}) {
  const saveBrowserTabs = async () => {
    try {
      if (isRestoringTabs.value) return
      if (!electronAPI || !electronAPI.setConfig) return

      const tabsToSave = browserTabs.value
        .filter(tab => tab.url && tab.url !== '' && tab.url !== 'about:blank')
        .map(tab => {
          const savedTab = {
            url: tab.url,
            title: tab.title || ''
          }
          if (tab.lifecyclePhase) savedTab.lifecyclePhase = tab.lifecyclePhase
          if (tab.isPrivate) savedTab.isPrivate = true
          if (tab.sessionPartition) savedTab.sessionPartition = tab.sessionPartition
          if (tab.routeType && tab.routeType !== 'webview') {
            savedTab.type = tab.routeType
          }
          if (tab.routeType === 'clone-directory' && tab.routeProps.path) {
            savedTab.clonePath = tab.routeProps.path
          }
          return savedTab
        })

      if (tabsToSave.length === 0) {
        await electronAPI.setConfig('browserTabs', [])
        await electronAPI.setConfig('browserActiveTabIndex', -1)
        return
      }

      const currentTab = browserTabs.value.find(tab => tab.id === activeBrowserTabId.value)
      let activeTabIndex = -1
      if (currentTab && currentTab.url && currentTab.url !== '' && currentTab.url !== 'about:blank') {
        if (currentTab.routeType === 'clone-directory' && currentTab.routeProps.path) {
          activeTabIndex = tabsToSave.findIndex(savedTab =>
            savedTab.url === currentTab.url && savedTab.type === 'clone-directory' && savedTab.clonePath === currentTab.routeProps.path
          )
        } else if (currentTab.routeType === 'remote-repo') {
          activeTabIndex = tabsToSave.findIndex(savedTab =>
            savedTab.url === currentTab.url && savedTab.type === 'remote-repo'
          )
        } else {
          activeTabIndex = tabsToSave.findIndex(savedTab => savedTab.url === currentTab.url && !savedTab.type)
        }
      } else {
        activeTabIndex = tabsToSave.length - 1
      }

      await electronAPI.setConfig('browserTabs', tabsToSave)
      await electronAPI.setConfig('browserActiveTabIndex', activeTabIndex)

      const orderToSave = {}
      browserTabs.value.forEach(tab => {
        if (tab.url && tabOrder.value[tab.id] !== undefined) {
          orderToSave[tab.url] = tabOrder.value[tab.id]
        }
      })
      await electronAPI.setConfig('browserTabOrder', orderToSave)
    } catch (error) {
      console.error('❌ 保存浏览器标签页失败:', error)
    }
  }

  const restoreBrowserTabs = async () => {
    try {
      if (!electronAPI || !electronAPI.getConfig) return false

      isRestoringTabs.value = true
      const savedTabs = await electronAPI.getConfig('browserTabs') || []
      const savedActiveTabIndex = await electronAPI.getConfig('browserActiveTabIndex') ?? -1

      if (savedTabs.length === 0) {
        isRestoringTabs.value = false
        return false
      }

      for (const savedTab of savedTabs) {
        if (!savedTab.url || savedTab.url === 'about:blank') continue
        const tab = createBrowserTab(savedTab.url, savedTab.title || '', { isPrivate: Boolean(savedTab.isPrivate) })
        tab.lifecyclePhase = savedTab.lifecyclePhase || tab.lifecyclePhase || 'warm'
        tab.isCrashed = false
        tab.isPrivate = Boolean(savedTab.isPrivate)
        tab.sessionPartition = savedTab.sessionPartition || resolveSessionPartition({ tabId: tab.id, isPrivate: tab.isPrivate })
        if (savedTab.type && savedTab.type !== tab.routeType) {
          if (savedTab.type === 'clone-directory' && savedTab.clonePath) {
            tab.routeType = 'clone-directory'
            tab.routeProps = { path: savedTab.clonePath }
            tab.routeConfig = routeConfig['clone-directory']
          } else if (savedTab.type === 'remote-repo') {
            tab.routeType = 'remote-repo'
            tab.routeConfig = routeConfig['remote-repo']
          }
          tab.contentKind = tab.routeConfig.showWebview ? 'web' : 'builtin'
          tab.contentHost = tab.routeConfig.showWebview ? 'webcontentsview' : 'builtin'
        }
      }

      if (browserTabs.value.length > 0) {
        const activeIndex = (savedActiveTabIndex >= 0 && savedActiveTabIndex < browserTabs.value.length)
          ? savedActiveTabIndex
          : browserTabs.value.length - 1
        await switchBrowserTab(browserTabs.value[activeIndex].id)
      }

      const savedOrder = await electronAPI.getConfig('browserTabOrder') || {}
      if (Object.keys(savedOrder).length > 0) {
        const nextOrder = {}
        browserTabs.value.forEach((tab, index) => {
          if (tab.url && savedOrder[tab.url] !== undefined) {
            nextOrder[tab.id] = savedOrder[tab.url]
          } else {
            nextOrder[tab.id] = index
          }
        })
        tabOrder.value = nextOrder
      }

      isRestoringTabs.value = false
      return browserTabs.value.length > 0
    } catch (error) {
      console.error('❌ 恢复浏览器标签页失败:', error)
      isRestoringTabs.value = false
      return false
    }
  }

  return {
    saveBrowserTabs,
    restoreBrowserTabs
  }
}
