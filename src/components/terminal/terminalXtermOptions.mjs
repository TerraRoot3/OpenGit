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

export function resolveTerminalThemeBackground() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return DEFAULT_XTERM_BACKGROUND
  }

  const computed = window.getComputedStyle(document.documentElement)
  const background = computed.getPropertyValue('--theme-sem-bg-project').trim()
  return background || DEFAULT_XTERM_BACKGROUND
}

export function createXtermTheme() {
  const background = resolveTerminalThemeBackground()

  return {
    background,
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: background,
    selectionBackground: 'rgba(255, 255, 255, 0.3)',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
  }
}
