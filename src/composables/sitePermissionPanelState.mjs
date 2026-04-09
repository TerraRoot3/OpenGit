function createSitePermissionPanelState() {
  let snapshotValue = {
    isOpen: false,
    origin: '',
    partition: 'persist:main',
    permissions: {}
  }

  const open = ({ origin = '', partition = 'persist:main', permissions = {} } = {}) => {
    snapshotValue = {
      isOpen: true,
      origin,
      partition,
      permissions: { ...permissions }
    }
    return snapshotValue
  }

  const close = () => {
    snapshotValue = {
      ...snapshotValue,
      isOpen: false
    }
    return snapshotValue
  }

  const resetPermission = (permission = '') => {
    if (!permission) return snapshotValue
    snapshotValue = {
      ...snapshotValue,
      permissions: {
        ...snapshotValue.permissions,
        [permission]: 'unset'
      }
    }
    return snapshotValue
  }

  const setPermissions = (permissions = {}) => {
    snapshotValue = {
      ...snapshotValue,
      permissions: { ...permissions }
    }
    return snapshotValue
  }

  const snapshot = () => ({ ...snapshotValue, permissions: { ...snapshotValue.permissions } })

  return {
    open,
    close,
    resetPermission,
    setPermissions,
    snapshot
  }
}

export {
  createSitePermissionPanelState
}
