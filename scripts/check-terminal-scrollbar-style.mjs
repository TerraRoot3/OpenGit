import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8')

const failures = []

const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

const assertNoBareScrollbarSelectors = (relativePath) => {
  const source = read(relativePath)
  assert(
    !/^\s*::-(webkit-scrollbar|webkit-scrollbar-track|webkit-scrollbar-thumb|webkit-scrollbar-corner)\b/m.test(source),
    `${relativePath} should not declare bare ::-webkit-scrollbar selectors`
  )
}

const assertNoBroadScrollbarWildcard = (relativePath) => {
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

const viewportRule = terminalPanel.match(/\.terminal-body\s*:deep\(\.xterm-viewport\)\s*\{([\s\S]*?)\}/)
assert(Boolean(viewportRule), 'TerminalPanel should style .xterm-viewport')
assert(
  viewportRule?.[1]?.includes('overflow-y: scroll !important;'),
  'TerminalPanel should keep xterm viewport on overflow-y: scroll to avoid width changes when scrollback appears'
)
assert(
  viewportRule?.[1]?.includes('scrollbar-gutter: stable;'),
  'TerminalPanel should reserve a stable scrollbar gutter for xterm viewport'
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

const scrollbarWidthRule = terminalPanel.match(
  /\.terminal-body\s*:deep\(\.xterm-viewport\)::\-webkit-scrollbar\s*\{([\s\S]*?)\}/
)
assert(Boolean(scrollbarWidthRule), 'TerminalPanel should style xterm viewport scrollbar width')

const widthMatch = scrollbarWidthRule?.[1]?.match(/width:\s*(\d+)px\s*;/)
assert(Boolean(widthMatch), 'TerminalPanel scrollbar width should be declared in px')
assert(
  Number(widthMatch?.[1] || 0) <= 4,
  'TerminalPanel scrollbar width should stay at 4px or below to avoid covering the last terminal column'
)

if (failures.length > 0) {
  console.error('Terminal scrollbar regression checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Terminal scrollbar regression checks passed.')
