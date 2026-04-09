import { ref } from 'vue'

export function useBrowserTabs({ limit = 50 } = {}) {
  const closedBrowserTabs = ref([])

  const pushClosedTab = (tabSnapshot) => {
    if (!tabSnapshot) return
    closedBrowserTabs.value.push(tabSnapshot)
    if (closedBrowserTabs.value.length > limit) {
      closedBrowserTabs.value.shift()
    }
  }

  const popClosedTab = () => {
    return closedBrowserTabs.value.pop() || null
  }

  return {
    closedBrowserTabs,
    pushClosedTab,
    popClosedTab
  }
}
