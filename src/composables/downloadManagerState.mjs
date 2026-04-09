function normalizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function computeProgress(totalBytes, receivedBytes) {
  const total = Math.max(0, normalizeNumber(totalBytes))
  const received = Math.max(0, normalizeNumber(receivedBytes))
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)))
}

function isTerminalState(state = '') {
  return state === 'completed' || state === 'cancelled' || state === 'interrupted'
}

function createDownloadManagerState(seed = []) {
  const records = new Map()

  const upsert = (item = {}) => {
    if (!item.id) return null
    const prev = records.get(item.id) || {
      id: item.id,
      fileName: '',
      state: 'started',
      url: '',
      savePath: '',
      totalBytes: 0,
      receivedBytes: 0,
      retryable: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0
    }

    const next = {
      ...prev,
      ...item,
      totalBytes: normalizeNumber(item.totalBytes, prev.totalBytes),
      receivedBytes: normalizeNumber(item.receivedBytes, prev.receivedBytes),
      updatedAt: Date.now()
    }
    next.progress = computeProgress(next.totalBytes, next.receivedBytes)
    if (typeof item.retryable !== 'boolean' && isTerminalState(next.state)) {
      next.retryable = next.state === 'interrupted'
    }

    records.set(item.id, next)
    return next
  }

  const remove = (id = '') => {
    if (!id) return false
    return records.delete(id)
  }

  const clearCompleted = () => {
    for (const [id, item] of records.entries()) {
      if (isTerminalState(item.state)) {
        records.delete(id)
      }
    }
  }

  const markRetryable = (id = '', retryable = true) => {
    if (!id || !records.has(id)) return null
    const current = records.get(id)
    const next = {
      ...current,
      retryable: Boolean(retryable),
      updatedAt: Date.now()
    }
    records.set(id, next)
    return next
  }

  const list = () => {
    return Array.from(records.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  if (Array.isArray(seed)) {
    for (const item of seed) {
      upsert(item)
    }
  }

  return {
    upsert,
    remove,
    clearCompleted,
    markRetryable,
    list
  }
}

export {
  createDownloadManagerState
}
