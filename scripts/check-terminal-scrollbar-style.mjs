import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const pathFor = (relativePath) => join(root, relativePath)
const read = (relativePath) => readFileSync(pathFor(relativePath), 'utf8')

const failures = []

const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

const assertNoBareScrollbarSelectors = (relativePath) => {
  if (!existsSync(pathFor(relativePath))) return
  const source = read(relativePath)
  assert(
    !/^\s*::-(webkit-scrollbar|webkit-scrollbar-track|webkit-scrollbar-thumb|webkit-scrollbar-corner)\b/m.test(source),
    `${relativePath} should not declare bare ::-webkit-scrollbar selectors`
  )
}

const assertNoBroadScrollbarWildcard = (relativePath) => {
  if (!existsSync(pathFor(relativePath))) return
  const source = read(relativePath)
  assert(
    !/^\s*\*\s*\{[\s\S]*?scrollbar-width\s*:/m.test(source),
    `${relativePath} should not apply scrollbar-width from a wildcard selector`
  )
}

const terminalPanel = read('src/components/terminal/TerminalPanel.vue')
const terminalSplitNode = read('src/components/terminal/TerminalSplitNode.vue')

assertNoBareScrollbarSelectors('src/components/git/ProjectDetail.vue')
assertNoBroadScrollbarWildcard('src/components/git/ProjectDetail.vue')
assertNoBareScrollbarSelectors('src/components/git/GitProject.vue')
assertNoBroadScrollbarWildcard('src/components/git/GitProject.vue')

assert(
  !/\.terminal-body\s*:deep\(\.xterm-viewport\)/.test(terminalPanel),
  'TerminalPanel should not override xterm viewport scrollbar layout'
)
assert(
  /\.terminal-body\s*:deep\(\.xterm-rows\s*>\s*div\)\s*\{[\s\S]*?overflow:\s*visible\s*!important\s*;/.test(terminalPanel),
  'TerminalPanel should let xterm row glyphs overhang the last cell without clipping'
)

const singlePaneRule = terminalPanel.match(/\.terminal-single-pane\s*\{([\s\S]*?)\}/)
assert(Boolean(singlePaneRule), 'TerminalPanel should declare .terminal-single-pane styles')
assert(
  !singlePaneRule?.[1]?.includes('padding-right:'),
  'TerminalPanel single pane container should not add right padding that skews xterm fit width'
)

const paneContentRule = terminalPanel.match(/\.terminal-pane-content\s*\{([\s\S]*?)\}/)
assert(Boolean(paneContentRule), 'TerminalPanel should declare .terminal-pane-content styles')
assert(
  !paneContentRule?.[1]?.includes('padding-right:'),
  'TerminalPanel split pane content should not add right padding that skews xterm fit width'
)

assert(
  !/\.terminal-pane\s*\+\s*\.terminal-pane\s+\.terminal-pane-content\s*\{[\s\S]*?padding-left\s*:/m.test(terminalPanel),
  'TerminalPanel split pane content should not add left padding that changes xterm measurement width'
)

const splitPaneContentRule = terminalSplitNode.match(/\.terminal-pane-content\s*\{([\s\S]*?)\}/)
assert(Boolean(splitPaneContentRule), 'TerminalSplitNode should declare .terminal-pane-content styles')
assert(
  !splitPaneContentRule?.[1]?.includes('padding-right:'),
  'TerminalSplitNode split pane content should not add right padding that skews xterm fit width'
)

assert(
  !/\.terminal-body\s*:deep\(\.xterm-viewport\)::\-webkit-scrollbar/.test(terminalPanel),
  'TerminalPanel should not force a custom xterm viewport scrollbar width'
)

if (failures.length > 0) {
  console.error('Terminal scrollbar regression checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Terminal scrollbar regression checks passed.')
