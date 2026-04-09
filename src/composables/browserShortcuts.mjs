function normalizedKey(event = {}) {
  return String(event.key || '').toLowerCase()
}

function resolveBrowserShortcut(event = {}) {
  const key = normalizedKey(event)
  const command = Boolean(event.metaKey || event.ctrlKey)

  if (command && key === 't' && event.shiftKey) return 'restore-closed-tab'
  if (command && key === 't') return 'new-tab'
  if (command && key === 'w') return 'close-tab'
  if (command && key === 'l') return 'focus-address-bar'
  if (command && event.shiftKey && key === 'r') return 'force-reload-tab'
  if (command && key === 'r') return 'reload-tab'
  if (command && key === '[') return 'go-back'
  if (command && key === ']') return 'go-forward'
  if (event.altKey && key === 'arrowleft') return 'go-back'
  if (event.altKey && key === 'arrowright') return 'go-forward'
  if (key === 'f5' && event.shiftKey) return 'force-reload-tab'
  if (key === 'f5') return 'reload-tab'
  return ''
}

export {
  resolveBrowserShortcut
}
