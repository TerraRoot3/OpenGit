import { ref } from 'vue'

const THEME_KEY = 'opengit-theme'
const DEFAULT_THEME = 'slate-dual'
const SUPPORTED_THEMES = new Set([DEFAULT_THEME])

const currentTheme = ref(DEFAULT_THEME)

const applyTheme = (themeName) => {
  if (typeof document === 'undefined') return
  const nextTheme = SUPPORTED_THEMES.has(themeName) ? themeName : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', nextTheme)
}

export function useThemeStore() {
  const setTheme = (themeName) => {
    const nextTheme = SUPPORTED_THEMES.has(themeName) ? themeName : DEFAULT_THEME
    currentTheme.value = nextTheme
    applyTheme(nextTheme)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_KEY, nextTheme)
    }
  }

  const hydrate = () => {
    let savedTheme = DEFAULT_THEME
    if (typeof window !== 'undefined' && window.localStorage) {
      savedTheme = window.localStorage.getItem(THEME_KEY) || DEFAULT_THEME
    }
    setTheme(savedTheme)
  }

  return {
    currentTheme,
    setTheme,
    hydrate,
    supportedThemes: Array.from(SUPPORTED_THEMES)
  }
}
