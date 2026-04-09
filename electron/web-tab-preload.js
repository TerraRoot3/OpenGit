const { ipcRenderer } = require('electron')

if (!window.__openGitWebTabPasswordCaptureInstalled) {
  window.__openGitWebTabPasswordCaptureInstalled = true
  let lastSignature = ''
  let lastSentAt = 0

  const emitPasswordCaptured = (payload = {}) => {
    const username = String(payload.username || '').trim()
    const password = String(payload.password || '')
    const domain = String(payload.domain || '').trim()
    if (!username || !password || !domain) return

    const now = Date.now()
    const signature = `${domain}::${username}::${password}`
    if (signature === lastSignature && now - lastSentAt < 3000) {
      return
    }
    lastSignature = signature
    lastSentAt = now

    ipcRenderer.send('web-tab-password-captured', {
      username,
      password,
      domain,
      url: window.location.href || '',
      capturedAt: now
    })
  }

  const pickVisibleInput = (inputs = []) => {
    for (const input of inputs) {
      if (!input || input.disabled) continue
      if (input.offsetParent === null) continue
      return input
    }
    return null
  }

  const collectPasswordData = (eventTarget = null) => {
    const form = eventTarget?.form || eventTarget?.closest?.('form') || null
    const scope = form || document
    const passwordInputs = Array.from(scope.querySelectorAll('input[type="password"]'))
    const passwordInput = pickVisibleInput(passwordInputs) || passwordInputs[0] || null
    if (!passwordInput) return null

    const usernameInput = scope.querySelector(
      'input[type="email"],input[name*="user" i],input[name*="login" i],input[id*="user" i],input[id*="login" i],input[type="text"]'
    )

    const username = (usernameInput?.value || '').trim()
    const password = passwordInput.value || ''
    if (!username || !password) return null

    return {
      username,
      password,
      domain: window.location.hostname || ''
    }
  }

  const tryCapture = (target = null) => {
    const data = collectPasswordData(target)
    if (data) emitPasswordCaptured(data)
  }

  document.addEventListener('submit', (event) => {
    tryCapture(event?.target || null)
  }, true)

  document.addEventListener('click', (event) => {
    const target = event?.target
    if (!target || !target.matches) return
    if (target.matches('button[type="submit"],input[type="submit"],button[id*="login" i],button[name*="login" i]')) {
      tryCapture(target)
    }
  }, true)
}
