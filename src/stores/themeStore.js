import { ref } from 'vue'
import { DEFAULT_THEME, SUPPORTED_THEMES, THEME_DEFINITIONS } from '../theme/themes.js'

const THEME_KEY = 'opengit-theme'
const SUPPORTED_THEME_SET = new Set(SUPPORTED_THEMES)

const currentTheme = ref(DEFAULT_THEME)

const applyTheme = (themeName) => {
  if (typeof document === 'undefined') return
  const nextTheme = SUPPORTED_THEME_SET.has(themeName) ? themeName : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', nextTheme)
}

export function useThemeStore() {
  const setTheme = (themeName) => {
    const nextTheme = SUPPORTED_THEME_SET.has(themeName) ? themeName : DEFAULT_THEME
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
    supportedThemes: SUPPORTED_THEMES,
    themeDefinitions: THEME_DEFINITIONS
  }
}
