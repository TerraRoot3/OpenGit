import { ref } from 'vue'

export function useBrowserNavigationState() {
  const currentUrl = ref('')
  const urlInput = ref('')
  const loadingProgress = ref(0)
  const loadingProgressVisible = ref(false)
  let loadingProgressTimer = null
  let loadingProgressHideTimer = null

  const clearLoadingProgressTimers = () => {
    if (loadingProgressTimer) {
      clearInterval(loadingProgressTimer)
      loadingProgressTimer = null
    }
    if (loadingProgressHideTimer) {
      clearTimeout(loadingProgressHideTimer)
      loadingProgressHideTimer = null
    }
  }

  const startLoadingProgress = () => {
    clearLoadingProgressTimers()
    loadingProgressVisible.value = true
    loadingProgress.value = Math.max(loadingProgress.value, 8)

    loadingProgressTimer = setInterval(() => {
      if (loadingProgress.value >= 85) return
      const remain = 85 - loadingProgress.value
      const step = Math.max(1, Math.round(remain * 0.18))
      loadingProgress.value = Math.min(85, loadingProgress.value + step)
    }, 120)
  }

  const finishLoadingProgress = () => {
    clearLoadingProgressTimers()
    loadingProgressVisible.value = true
    loadingProgress.value = 100
    loadingProgressHideTimer = setTimeout(() => {
      loadingProgressVisible.value = false
      loadingProgress.value = 0
      loadingProgressHideTimer = null
    }, 220)
  }

  return {
    currentUrl,
    urlInput,
    loadingProgress,
    loadingProgressVisible,
    clearLoadingProgressTimers,
    startLoadingProgress,
    finishLoadingProgress
  }
}
