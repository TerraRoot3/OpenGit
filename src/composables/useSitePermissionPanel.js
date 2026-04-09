import { computed, ref } from 'vue'
import { createSitePermissionPanelState } from './sitePermissionPanelState.mjs'

export function useSitePermissionPanel() {
  const version = ref(0)
  const state = createSitePermissionPanelState()

  const bump = () => {
    version.value += 1
  }

  const open = (payload = {}) => {
    state.open(payload)
    bump()
  }

  const close = () => {
    state.close()
    bump()
  }

  const resetPermission = (permission = '') => {
    state.resetPermission(permission)
    bump()
  }

  const setPermissions = (permissions = {}) => {
    state.setPermissions(permissions)
    bump()
  }

  const snapshot = computed(() => {
    version.value
    return state.snapshot()
  })

  return {
    snapshot,
    open,
    close,
    resetPermission,
    setPermissions
  }
}
