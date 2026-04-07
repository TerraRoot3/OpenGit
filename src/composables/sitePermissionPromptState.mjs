function normalizePrompt(prompt = {}) {
  const requestId = typeof prompt.requestId === 'string' ? prompt.requestId : ''
  const origin = typeof prompt.origin === 'string' ? prompt.origin : ''
  let host = typeof prompt.host === 'string' ? prompt.host : ''
  const permission = typeof prompt.permission === 'string' ? prompt.permission : ''
  const tabId = typeof prompt.tabId === 'string' ? prompt.tabId : ''

  if (!host && origin) {
    try {
      host = new URL(origin).host
    } catch {
      host = ''
    }
  }

  if (!requestId || !origin || !host || !permission || !tabId) {
    return null
  }

  return {
    requestId,
    origin,
    host,
    permission,
    tabId
  }
}

export function createSitePermissionPromptStore() {
  let currentPrompt = null
  let queue = []

  const getSnapshot = () => ({
    currentPrompt,
    queue: queue.slice()
  })

  const isDuplicateRequest = (requestId) => {
    if (!requestId) {
      return false
    }

    if (currentPrompt?.requestId === requestId) {
      return true
    }

    return queue.some((item) => item.requestId === requestId)
  }

  const promoteNextPrompt = () => {
    if (!currentPrompt) {
      currentPrompt = queue.shift() || null
    }
    return currentPrompt
  }

  const enqueuePrompt = (prompt = {}) => {
    const normalizedPrompt = normalizePrompt(prompt)
    if (!normalizedPrompt || isDuplicateRequest(normalizedPrompt.requestId)) {
      return false
    }

    if (!currentPrompt) {
      currentPrompt = normalizedPrompt
      return true
    }

    queue = [...queue, normalizedPrompt]
    return true
  }

  const resolvePrompt = (requestId = '') => {
    if (!requestId) {
      return null
    }

    if (currentPrompt?.requestId === requestId) {
      const resolvedPrompt = currentPrompt
      currentPrompt = null
      promoteNextPrompt()
      return resolvedPrompt
    }

    const index = queue.findIndex((item) => item.requestId === requestId)
    if (index === -1) {
      return null
    }

    const [removedPrompt] = queue.splice(index, 1)
    queue = queue.slice()
    return removedPrompt || null
  }

  const syncActiveTab = (activeTabId = '') => {
    const removedPrompts = []

    if (currentPrompt && currentPrompt.tabId !== activeTabId) {
      removedPrompts.push(currentPrompt)
      currentPrompt = null
    }

    const nextQueue = []
    for (const prompt of queue) {
      if (prompt.tabId === activeTabId) {
        nextQueue.push(prompt)
      } else {
        removedPrompts.push(prompt)
      }
    }
    queue = nextQueue

    promoteNextPrompt()
    return removedPrompts
  }

  const clearPrompts = () => {
    const removedPrompts = []

    if (currentPrompt) {
      removedPrompts.push(currentPrompt)
      currentPrompt = null
    }

    if (queue.length > 0) {
      removedPrompts.push(...queue)
      queue = []
    }

    return removedPrompts
  }

  return {
    getSnapshot,
    enqueuePrompt,
    resolvePrompt,
    syncActiveTab,
    clearPrompts
  }
}
