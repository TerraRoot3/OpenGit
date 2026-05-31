function normalizeNotificationId(value = '') {
  return String(value || '').trim()
}

function createCodexNotificationBadgeState({ applyBadge } = {}) {
  const unreadIds = new Set()

  const syncBadge = () => {
    const count = unreadIds.size
    if (typeof applyBadge === 'function') {
      applyBadge(count)
    }
    return count
  }

  return {
    markUnread(notificationId) {
      const normalizedId = normalizeNotificationId(notificationId)
      if (!normalizedId) return syncBadge()
      unreadIds.add(normalizedId)
      return syncBadge()
    },
    markRead(notificationId) {
      const normalizedId = normalizeNotificationId(notificationId)
      if (!normalizedId) return syncBadge()
      unreadIds.delete(normalizedId)
      return syncBadge()
    },
    clear() {
      if (unreadIds.size === 0) {
        return syncBadge()
      }
      unreadIds.clear()
      return syncBadge()
    },
    getCount() {
      return unreadIds.size
    },
    has(notificationId) {
      const normalizedId = normalizeNotificationId(notificationId)
      return normalizedId ? unreadIds.has(normalizedId) : false
    }
  }
}

module.exports = {
  createCodexNotificationBadgeState
}
