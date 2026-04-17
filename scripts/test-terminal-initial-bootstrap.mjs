import assert from 'node:assert/strict'
import { shouldCreateInitialTerminal } from '../src/components/terminal/terminalInitialBootstrap.mjs'

assert.equal(
  shouldCreateInitialTerminal({
    terminalCount: 0,
    restoredSnapshot: true,
    projectRoot: '/tmp/repo',
    allowFirstTerminalWithoutCwd: false
  }),
  false,
  'restored snapshots should prevent creating an extra default terminal'
)

assert.equal(
  shouldCreateInitialTerminal({
    terminalCount: 0,
    restoredSnapshot: false,
    projectRoot: '/tmp/repo',
    allowFirstTerminalWithoutCwd: false
  }),
  true,
  'project terminals should create the first terminal when restore misses'
)

assert.equal(
  shouldCreateInitialTerminal({
    terminalCount: 0,
    restoredSnapshot: false,
    projectRoot: '',
    allowFirstTerminalWithoutCwd: true
  }),
  true,
  'standalone terminals may create the first terminal without a cwd'
)

assert.equal(
  shouldCreateInitialTerminal({
    terminalCount: 1,
    restoredSnapshot: false,
    projectRoot: '/tmp/repo',
    allowFirstTerminalWithoutCwd: false
  }),
  false,
  'existing terminals should skip default terminal creation'
)

console.log('terminal initial bootstrap assertions passed')
