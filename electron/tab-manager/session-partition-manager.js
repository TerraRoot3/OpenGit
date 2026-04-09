function createSessionPartitionManager() {
  return {
    getPartition({ isPrivate = false, tabId = '' } = {}) {
      return isPrivate && tabId ? `temp:${tabId}` : 'persist:main'
    },
    isPrivatePartition(partition = '') {
      return typeof partition === 'string' && partition.startsWith('temp:')
    }
  }
}

module.exports = {
  createSessionPartitionManager
}
