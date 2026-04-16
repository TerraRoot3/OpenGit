import assert from 'node:assert/strict'
import {
  TERMINAL_FONT_FAMILY,
  XTERM_OPTS
} from '../src/components/terminal/terminalXtermOptions.mjs'

assert.equal(
  XTERM_OPTS.rescaleOverlappingGlyphs,
  true,
  'xterm should rescale overlapping glyphs to avoid right-edge clipping for ambiguous-width characters'
)

assert.equal(
  XTERM_OPTS.fontFamily,
  TERMINAL_FONT_FAMILY,
  'xterm options should use the shared terminal font stack'
)

assert.match(
  TERMINAL_FONT_FAMILY,
  /Sarasa Mono SC|Noto Sans Mono CJK SC|Source Han Mono SC/,
  'terminal font stack should include a CJK-oriented mono fallback for Codex output'
)

assert.match(
  TERMINAL_FONT_FAMILY,
  /SF Mono|Monaco|Menlo/,
  'terminal font stack should retain native monospace fonts first'
)

console.log('terminal xterm options assertions passed')
