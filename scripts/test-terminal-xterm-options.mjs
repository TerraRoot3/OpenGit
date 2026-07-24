import assert from 'node:assert/strict'
import {
  createXtermSearchOptions,
  TERMINAL_FONT_FAMILY,
  XTERM_OPTS
} from '../src/components/terminal/terminalXtermOptions.mjs'

assert.equal(
  XTERM_OPTS.rescaleOverlappingGlyphs,
  false,
  'terminal should stay on xterm default glyph scaling path to avoid custom rendering drift'
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

assert.doesNotMatch(
  TERMINAL_FONT_FAMILY,
  /PingFang SC/,
  'terminal font stack should avoid non-monospace CJK fallbacks that can overhang the last cell'
)

assert.match(
  TERMINAL_FONT_FAMILY,
  /SF Mono|Monaco|Menlo/,
  'terminal font stack should retain native monospace fonts first'
)

const searchOptions = createXtermSearchOptions()
assert.ok(searchOptions.decorations, 'terminal search options should expose themed decorations')
assert.ok(
  searchOptions.decorations.matchBackground,
  'terminal search matches should have a visible theme-aware background'
)
assert.ok(
  searchOptions.decorations.activeMatchBorder,
  'the active terminal search match should have a visible theme-aware border'
)

console.log('terminal xterm options assertions passed')
