export const TERMINAL_FONT_FAMILY = [
  "'SF Mono'",
  "'Monaco'",
  "'Menlo'",
  "'Consolas'",
  "'Ubuntu Mono'",
  "'Cascadia Mono'",
  "'Sarasa Mono SC'",
  "'Noto Sans Mono CJK SC'",
  "'Source Han Mono SC'",
  "'Microsoft YaHei Mono'",
  "'PingFang SC'",
  'monospace'
].join(', ')

export const DEFAULT_TERMINAL_SCROLLBACK = 1500
export const MIN_TERMINAL_SCROLLBACK = 200
export const MAX_TERMINAL_SCROLLBACK = 10000
export const TERMINAL_SCROLLBACK_CONFIG_KEY = 'appTerminalScrollback'

export function sanitizeTerminalScrollback(value) {
  if (value == null || value === '') return DEFAULT_TERMINAL_SCROLLBACK
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_TERMINAL_SCROLLBACK
  const normalized = Math.round(numeric)
  return Math.min(MAX_TERMINAL_SCROLLBACK, Math.max(MIN_TERMINAL_SCROLLBACK, normalized))
}

export const XTERM_OPTS = {
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: 13,
  fontFamily: TERMINAL_FONT_FAMILY,
  rescaleOverlappingGlyphs: true,
  theme: null,
  allowProposedApi: true,
  // Codex / Claude 这类长对话会迅速放大 xterm buffer 的内存占用。
  // 默认控制在 1500 行，用户可在项目设置中调整。
  scrollback: DEFAULT_TERMINAL_SCROLLBACK
}

const DEFAULT_XTERM_BACKGROUND = '#161b22'
const DEFAULT_XTERM_FOREGROUND = '#d4d4d4'

function readThemeCssVar(name) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return ''
  }

  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function resolveTerminalThemeBackground() {
  const background = readThemeCssVar('--theme-sem-bg-project')
  return background || DEFAULT_XTERM_BACKGROUND
}

export function createXtermTheme() {
  const background = resolveTerminalThemeBackground()
  const foreground = readThemeCssVar('--theme-sem-text-primary') || DEFAULT_XTERM_FOREGROUND
  const secondary = readThemeCssVar('--theme-sem-text-secondary') || foreground
  const muted = readThemeCssVar('--theme-sem-text-muted') || secondary
  const accentPrimary = readThemeCssVar('--theme-sem-accent-primary') || '#2472c8'
  const accentInfo = readThemeCssVar('--theme-sem-accent-info') || '#2472c8'
  const accentWarning = readThemeCssVar('--theme-sem-accent-warning') || '#e5e510'
  const accentSuccess = readThemeCssVar('--theme-sem-accent-success') || '#0dbc79'
  const accentDanger = readThemeCssVar('--theme-sem-accent-danger') || '#cd3131'
  const fileAdded = readThemeCssVar('--theme-sem-file-added') || accentSuccess
  const fileDeleted = readThemeCssVar('--theme-sem-file-deleted') || accentDanger
  const borderStrong = readThemeCssVar('--theme-sem-border-strong')
  const colorScheme = typeof window !== 'undefined' && typeof document !== 'undefined'
    ? window.getComputedStyle(document.documentElement).colorScheme
    : 'dark'
  const isLight = String(colorScheme).includes('light')

  return {
    background,
    foreground,
    cursor: accentPrimary,
    cursorAccent: background,
    selectionBackground: isLight ? 'rgba(92, 122, 170, 0.22)' : 'rgba(255, 255, 255, 0.3)',
    black: isLight ? '#2d3746' : '#000000',
    red: accentDanger,
    green: accentSuccess,
    yellow: accentWarning,
    blue: accentInfo,
    magenta: isLight ? '#8b6fd8' : '#bc3fbc',
    cyan: accentPrimary,
    white: secondary,
    brightBlack: muted,
    brightRed: fileDeleted,
    brightGreen: fileAdded,
    brightYellow: isLight ? '#9f7728' : '#f5f543',
    brightBlue: isLight ? '#3d6fb7' : '#3b8eea',
    brightMagenta: isLight ? '#a084df' : '#d670d6',
    brightCyan: isLight ? '#2d8192' : '#29b8db',
    brightWhite: foreground,
    scrollbarSliderBackground: borderStrong || undefined,
    scrollbarSliderHoverBackground: borderStrong || undefined
  }
}
