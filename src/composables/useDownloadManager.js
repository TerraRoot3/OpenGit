import { computed, ref } from 'vue'
import { createDownloadManagerState } from './downloadManagerState.mjs'

export function useDownloadManager() {
  const version = ref(0)
  const state = createDownloadManagerState()

  const bump = () => {
    version.value += 1
  }

  const upsert = (item = {}) => {
    const result = state.upsert(item)
    if (result) bump()
    return result
  }

  const remove = (id = '') => {
    const removed = state.remove(id)
    if (removed) bump()
    return removed
  }

  const clearCompleted = () => {
    state.clearCompleted()
    bump()
  }

  const markRetryable = (id = '', retryable = true) => {
    const result = state.markRetryable(id, retryable)
    if (result) bump()
    return result
  }

  const items = computed(() => {
    // Ensure Vue tracks state changes.
    version.value
    return state.list()
  })

  return {
    items,
    upsert,
    remove,
    clearCompleted,
    markRetryable
  }
}
