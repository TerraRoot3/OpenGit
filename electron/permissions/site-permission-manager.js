const STORAGE_KEY = 'sitePermissionRules'

const ASK_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'clipboard-read',
  'publickey-credentials-create',
  'publickey-credentials-get'
])

const DENY_PERMISSIONS = new Set([
  'pointerLock'
])
const MANAGED_PERMISSIONS = Array.from(new Set([
  ...ASK_PERMISSIONS,
  ...DENY_PERMISSIONS
]))

function createSitePermissionManager({ store }) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new Error('createSitePermissionManager requires a store with get/set methods')
  }

  const pendingRequests = new Map()

  const getRules = () => store.get(STORAGE_KEY, {})

  const setRules = (rules) => {
    store.set(STORAGE_KEY, rules)
  }

  const normalizeOrigin = (rawUrl = '') => {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return ''
    }

    try {
      const origin = new URL(rawUrl).origin
      return origin === 'null' ? '' : origin
    } catch {
      return ''
    }
  }

  const getDefaultDecision = (permission = '') => {
    if (ASK_PERMISSIONS.has(permission)) {
      return 'ask'
    }

    if (DENY_PERMISSIONS.has(permission)) {
      return 'deny'
    }

    return 'deny'
  }

  const getCheckDecision = ({ permission = '', rememberedDecision = 'unset' } = {}) => {
    if (rememberedDecision === 'allow') {
      return true
    }
    if (rememberedDecision === 'deny') {
      return false
    }
    return getDefaultDecision(permission) !== 'deny'
  }

  const getRememberedDecision = ({ partition = '', origin = '', permission = '' } = {}) => {
    if (!partition || !origin || !permission) {
      return 'unset'
    }

    const rules = getRules()
    return rules?.[partition]?.[origin]?.[permission] || 'unset'
  }

  const rememberDecision = ({ partition = '', origin = '', permission = '', decision = 'unset' } = {}) => {
    if (!partition || !origin || !permission) {
      return
    }

    const rules = getRules()
    const nextRules = {
      ...rules,
      [partition]: {
        ...(rules[partition] || {}),
        [origin]: {
          ...((rules[partition] && rules[partition][origin]) || {}),
          [permission]: decision
        }
      }
    }

    setRules(nextRules)
  }

  const createPendingRequest = (request = {}) => {
    if (!request.requestId) {
      throw new Error('createPendingRequest requires requestId')
    }

    const payload = {
      ...request,
      status: 'pending'
    }

    pendingRequests.set(request.requestId, payload)
    return payload
  }

  const getPendingRequest = (requestId) => {
    return pendingRequests.get(requestId) || null
  }

  const resolvePendingRequest = ({ requestId, decision = 'deny' } = {}) => {
    if (!requestId) {
      return null
    }

    const request = pendingRequests.get(requestId)
    if (!request) {
      return null
    }

    pendingRequests.delete(requestId)
    return {
      ...request,
      decision,
      status: 'resolved'
    }
  }

  const expireRequests = (now = Date.now()) => {
    const expiredRequestIds = []

    for (const [requestId, request] of pendingRequests.entries()) {
      if ((request.expiresAt || 0) <= now) {
        pendingRequests.delete(requestId)
        expiredRequestIds.push(requestId)
      }
    }

    return expiredRequestIds
  }

  const buildPromptPayload = ({
    requestId = '',
    partition = '',
    origin = '',
    permission = '',
    tabId = ''
  } = {}) => {
    const normalizedOrigin = normalizeOrigin(origin)
    if (!requestId || !partition || !normalizedOrigin || !permission || !tabId) {
      return null
    }

    let host = ''
    try {
      host = new URL(normalizedOrigin).host
    } catch {
      host = ''
    }

    return {
      requestId,
      partition,
      origin: normalizedOrigin,
      host,
      permission,
      tabId
    }
  }

  const shouldPromptRenderer = ({ tabId = '', defaultDecision = '' } = {}) => {
    if (defaultDecision !== 'ask') {
      return false
    }

    return Boolean(tabId)
  }

  const listPermissionsForOrigin = ({ partition = '', origin = '' } = {}) => {
    if (!partition || !origin) {
      return {}
    }
    const rules = getRules()
    const current = rules?.[partition]?.[origin] || {}
    const result = {}
    for (const permission of MANAGED_PERMISSIONS) {
      result[permission] = current[permission] || 'unset'
    }
    return result
  }

  const resetPermission = ({ partition = '', origin = '', permission = '' } = {}) => {
    if (!partition || !origin || !permission) {
      return false
    }
    const rules = getRules()
    const existing = rules?.[partition]?.[origin]
    if (!existing || !(permission in existing)) {
      return false
    }

    const nextOriginRules = { ...existing }
    delete nextOriginRules[permission]

    const nextPartitionRules = {
      ...(rules[partition] || {}),
      [origin]: nextOriginRules
    }

    if (Object.keys(nextOriginRules).length === 0) {
      delete nextPartitionRules[origin]
    }

    const nextRules = {
      ...rules,
      [partition]: nextPartitionRules
    }

    if (Object.keys(nextPartitionRules).length === 0) {
      delete nextRules[partition]
    }

    setRules(nextRules)
    return true
  }

  const resetAllPermissionsForOrigin = ({ partition = '', origin = '' } = {}) => {
    if (!partition || !origin) {
      return false
    }
    const rules = getRules()
    if (!rules?.[partition]?.[origin]) {
      return false
    }

    const nextPartitionRules = { ...(rules[partition] || {}) }
    delete nextPartitionRules[origin]

    const nextRules = {
      ...rules,
      [partition]: nextPartitionRules
    }
    if (Object.keys(nextPartitionRules).length === 0) {
      delete nextRules[partition]
    }

    setRules(nextRules)
    return true
  }

  return {
    normalizeOrigin,
    getDefaultDecision,
    getCheckDecision,
    getRememberedDecision,
    rememberDecision,
    createPendingRequest,
    getPendingRequest,
    resolvePendingRequest,
    expireRequests,
    buildPromptPayload,
    shouldPromptRenderer,
    listPermissionsForOrigin,
    resetPermission,
    resetAllPermissionsForOrigin
  }
}

module.exports = {
  STORAGE_KEY,
  ASK_PERMISSIONS,
  DENY_PERMISSIONS,
  createSitePermissionManager
}
