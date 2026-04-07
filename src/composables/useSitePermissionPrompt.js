import { computed, shallowRef } from 'vue'
import { createSitePermissionPromptStore } from './sitePermissionPromptState.mjs'

const promptStore = createSitePermissionPromptStore()
const currentPrompt = shallowRef(null)
const queuedPromptCount = shallowRef(0)

function syncPromptRefs() {
  const snapshot = promptStore.getSnapshot()
  currentPrompt.value = snapshot.currentPrompt
  queuedPromptCount.value = snapshot.queue.length
}

syncPromptRefs()

export function createSitePermissionPromptState() {
  const store = createSitePermissionPromptStore()

  return {
    enqueue(prompt) {
      return store.enqueuePrompt(prompt)
    },
    current() {
      return store.getSnapshot().currentPrompt
    },
    resolveCurrent() {
      const current = store.getSnapshot().currentPrompt
      if (!current?.requestId) {
        return null
      }

      return store.resolvePrompt(current.requestId)
    },
    clear() {
      return store.clearPrompts()
    }
  }
}

export function useSitePermissionPrompt() {
  const enqueuePermissionPrompt = (prompt) => {
    const enqueued = promptStore.enqueuePrompt(prompt)
    syncPromptRefs()
    return enqueued
  }

  const resolvePermissionPrompt = (requestId) => {
    const removedPrompt = promptStore.resolvePrompt(requestId)
    syncPromptRefs()
    return removedPrompt
  }

  const syncPermissionPromptActiveTab = (tabId) => {
    const removedPrompts = promptStore.syncActiveTab(tabId)
    syncPromptRefs()
    return removedPrompts
  }

  const clearPermissionPrompts = () => {
    const removedPrompts = promptStore.clearPrompts()
    syncPromptRefs()
    return removedPrompts
  }

  return {
    currentPermissionPrompt: computed(() => currentPrompt.value),
    hasPermissionPrompt: computed(() => Boolean(currentPrompt.value)),
    queuedPermissionPromptCount: computed(() => queuedPromptCount.value),
    enqueuePermissionPrompt,
    resolvePermissionPrompt,
    syncPermissionPromptActiveTab,
    clearPermissionPrompts
  }
}
