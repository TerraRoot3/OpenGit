import { resolveBrowserShortcut } from './browserShortcuts.mjs'

export function useBrowserShortcuts(actions = {}) {
  const handler = (event) => {
    const action = resolveBrowserShortcut(event)
    if (!action) return
    const fn = actions[action]
    if (typeof fn !== 'function') return
    event.preventDefault()
    event.stopPropagation()
    fn(event)
  }

  const mount = () => {
    window.addEventListener('keydown', handler)
  }

  const unmount = () => {
    window.removeEventListener('keydown', handler)
  }

  return {
    mount,
    unmount
  }
}
