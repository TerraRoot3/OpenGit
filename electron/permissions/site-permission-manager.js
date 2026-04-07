const STORAGE_KEY = 'sitePermissionRules'

const ASK_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'clipboard-read'
])

const DENY_PERMISSIONS = new Set([
  'pointerLock'
])

function createSitePermissionManager({ store }) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new Error('createSitePermissionManager requires a store with get/set methods')
  }

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

  return {
    normalizeOrigin,
    getDefaultDecision,
    getRememberedDecision,
    rememberDecision
  }
}

module.exports = {
  STORAGE_KEY,
  createSitePermissionManager
}
