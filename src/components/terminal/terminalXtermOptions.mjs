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

export const XTERM_OPTS = {
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: 13,
  fontFamily: TERMINAL_FONT_FAMILY,
  rescaleOverlappingGlyphs: true,
  theme: {
    background: '#1b1c1f',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1b1c1f',
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
  },
  allowProposedApi: true,
  scrollback: 10000
}
