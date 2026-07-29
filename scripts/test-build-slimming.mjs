import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)
const devDependencies = packageJson.devDependencies || {}
const buildFiles = packageJson.build?.files || []

for (const dependency of [
  '@electron/get',
  'unplugin-auto-import',
  'unplugin-vue-components',
  'vite-plugin-monaco-editor',
  'wait-on'
]) {
  assert.equal(
    dependency in devDependencies,
    false,
    `${dependency} should not return after the build cleanup`
  )
}

assert.deepEqual(
  packageJson.build?.asarUnpack,
  ['node_modules/node-pty/build/Release/**/*'],
  'only node-pty runtime binaries should be unpacked'
)
assert.equal(
  buildFiles.includes('!node_modules/@larksuiteoapi/node-sdk/es/**/*'),
  true,
  'the duplicate Feishu ESM bundle should be excluded from packaged apps'
)
assert.equal(
  fs.existsSync(
    new URL('../src/components/terminal/StandaloneTerminal.vue', import.meta.url)
  ),
  false,
  'the unreachable legacy standalone terminal wrapper should stay removed'
)

const monacoSetup = fs.readFileSync(
  new URL('../src/components/git/monacoSetup.mjs', import.meta.url),
  'utf8'
)
assert.match(
  monacoSetup,
  /MonacoEnvironment\s*=\s*\{/,
  'Monaco should retain a worker factory after removing the legacy Vite plugin'
)
for (const worker of ['editor.worker', 'css.worker', 'html.worker', 'json.worker', 'ts.worker']) {
  assert.equal(
    monacoSetup.includes(`${worker}?worker`),
    true,
    `${worker} should be bundled through Vite's native worker support`
  )
}

console.log('build slimming assertions passed')
