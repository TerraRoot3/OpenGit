const TAB_PROTOCOLS = new Set(['http:', 'https:', 'about:', 'git:'])

function parseProtocol(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  if (rawUrl.startsWith('about:')) return 'about:'
  if (rawUrl.startsWith('git:')) return 'git:'
  try {
    return new URL(rawUrl).protocol || ''
  } catch {
    return ''
  }
}

function decideWindowOpenAction({ url = '', frameName = '' } = {}) {
  const protocol = parseProtocol(url)
  if (!protocol) {
    return { action: 'external' }
  }

  // Reserved frame name for explicitly requested popup windows.
  if (frameName === 'opengit-popup-window') {
    return { action: 'window' }
  }

  if (TAB_PROTOCOLS.has(protocol)) {
    return { action: 'tab' }
  }

  return { action: 'external' }
}

module.exports = {
  decideWindowOpenAction
}
