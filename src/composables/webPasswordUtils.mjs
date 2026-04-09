function parseHostname(input = '') {
  if (!input || typeof input !== 'string') return ''
  try {
    const candidate = input.startsWith('http://') || input.startsWith('https://')
      ? input
      : `https://${input}`
    return (new URL(candidate).hostname || '').toLowerCase().replace(/^www\./, '')
  } catch {
    return input.toLowerCase().replace(/^www\./, '').trim()
  }
}

function hostnameMatches(stored = '', target = '') {
  if (!stored || !target) return false
  if (stored === target) return true
  return stored.endsWith(`.${target}`) || target.endsWith(`.${stored}`)
}

function findBestMatchingPassword(savedPasswords = [], currentUrl = '') {
  const currentHost = parseHostname(currentUrl)
  if (!currentHost || !Array.isArray(savedPasswords) || savedPasswords.length === 0) {
    return null
  }

  for (const item of savedPasswords) {
    const savedHost = parseHostname(item?.domain || '')
    if (hostnameMatches(savedHost, currentHost)) {
      return item
    }
  }
  return null
}

function isLoginLikeUrl(url = '') {
  if (!url || typeof url !== 'string') return false
  const lower = url.toLowerCase()
  return lower.includes('login')
    || lower.includes('signin')
    || lower.includes('sign_in')
    || lower.includes('authenticate')
}

function buildPasswordSaveDecision({ captured = null, existing = null, filled = null } = {}) {
  if (!captured?.username || !captured?.password || !captured?.domain) {
    return { shouldPrompt: false, reason: 'invalid-captured', isUpdate: false, existingId: null }
  }

  if (existing && existing.password === captured.password) {
    return { shouldPrompt: false, reason: 'existing-same-password', isUpdate: false, existingId: existing.id || null }
  }

  if (filled && filled.domain === captured.domain) {
    const usernameChanged = filled.username !== captured.username
    const passwordChanged = filled.password !== captured.password
    if (usernameChanged || passwordChanged) {
      return { shouldPrompt: true, reason: 'filled-changed', isUpdate: true, existingId: existing?.id || null }
    }
  }

  if (existing) {
    return { shouldPrompt: true, reason: 'existing-different-password', isUpdate: true, existingId: existing.id || null }
  }

  return { shouldPrompt: true, reason: 'new-password', isUpdate: false, existingId: null }
}

export {
  parseHostname,
  findBestMatchingPassword,
  isLoginLikeUrl,
  buildPasswordSaveDecision
}
