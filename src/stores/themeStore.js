import { ref } from 'vue'
import {
  DEFAULT_THEME,
  SUPPORTED_THEMES,
  THEME_DEFINITIONS,
  SYSTEM_THEME,
  SYSTEM_DARK_THEME,
  SYSTEM_LIGHT_THEME
} from '../theme/themes.js'

const THEME_KEY = 'opengit-theme'
const SUPPORTED_THEME_SET = new Set(SUPPORTED_THEMES)

const currentTheme = ref(DEFAULT_THEME)
const resolvedTheme = ref(DEFAULT_THEME)
let hydratePromise = null
let mediaQueryList = null
let mediaQueryListener = null

const resolveSystemTheme = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return SYSTEM_DARK_THEME
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME
}

const resolveTheme = (themeName) => {
  if (themeName === SYSTEM_THEME) return resolveSystemTheme()
  return SUPPORTED_THEME_SET.has(themeName) ? themeName : DEFAULT_THEME
}

const applyTheme = (themeName) => {
  if (typeof document === 'undefined') return
  const nextTheme = resolveTheme(themeName)
  document.documentElement.setAttribute('data-theme', nextTheme)
  resolvedTheme.value = nextTheme
}

const normalizeTheme = (themeName) => (
  themeName === SYSTEM_THEME || SUPPORTED_THEME_SET.has(themeName) ? themeName : DEFAULT_THEME
)

const readLocalTheme = () => {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_THEME
  return normalizeTheme(window.localStorage.getItem(THEME_KEY) || DEFAULT_THEME)
}

const writeLocalTheme = (themeName) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(THEME_KEY, themeName)
}

const attachSystemThemeListener = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || mediaQueryListener) return
  mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQueryListener = () => {
    if (currentTheme.value !== SYSTEM_THEME) return
    applyTheme(SYSTEM_THEME)
  }
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', mediaQueryListener)
  } else if (typeof mediaQueryList.addListener === 'function') {
    mediaQueryList.addListener(mediaQueryListener)
  }
}

export function useThemeStore() {
  const setTheme = async (themeName) => {
    const nextTheme = normalizeTheme(themeName)
    currentTheme.value = nextTheme
    applyTheme(nextTheme)

    writeLocalTheme(nextTheme)

    if (typeof window !== 'undefined' && window.electronAPI?.saveConfig) {
      try {
        await window.electronAPI.saveConfig({
          key: THEME_KEY,
          value: nextTheme
        })
      } catch (error) {
        console.warn('保存主题设置到 electron-store 失败:', error)
      }
    }
  }

  const hydrate = async () => {
    applyTheme(currentTheme.value)
    attachSystemThemeListener()

    if (hydratePromise) {
      return hydratePromise
    }

    hydratePromise = (async () => {
      let savedTheme = readLocalTheme()

      if (typeof window !== 'undefined' && window.electronAPI?.getConfig) {
        try {
          const storedTheme = await window.electronAPI.getConfig(THEME_KEY)
          if (typeof storedTheme === 'string' && storedTheme) {
            savedTheme = normalizeTheme(storedTheme)
          } else if (savedTheme !== DEFAULT_THEME && window.electronAPI?.saveConfig) {
            await window.electronAPI.saveConfig({
              key: THEME_KEY,
              value: savedTheme
            })
          }
        } catch (error) {
          console.warn('从 electron-store 恢复主题设置失败:', error)
        }
      }

      currentTheme.value = savedTheme
      applyTheme(savedTheme)
      writeLocalTheme(savedTheme)
    })()

    return hydratePromise
  }

  return {
    currentTheme,
    resolvedTheme,
    setTheme,
    hydrate,
    supportedThemes: SUPPORTED_THEMES,
    themeDefinitions: THEME_DEFINITIONS,
    systemTheme: SYSTEM_THEME
  }
}
