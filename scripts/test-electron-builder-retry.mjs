import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const wrapperPath = path.join(rootDir, 'scripts/run-electron-builder.sh')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opengit-builder-retry-'))

try {
  const fakeBinDir = path.join(tempDir, 'bin')
  const countFile = path.join(tempDir, 'count')
  fs.mkdirSync(fakeBinDir)
  const fakeNpxPath = path.join(fakeBinDir, 'npx')
  fs.writeFileSync(fakeNpxPath, `#!/usr/bin/env bash
count=0
if [[ -f "$OPENGIT_TEST_COUNT_FILE" ]]; then
  count="$(<"$OPENGIT_TEST_COUNT_FILE")"
fi
count=$((count + 1))
printf '%s' "$count" > "$OPENGIT_TEST_COUNT_FILE"
if [[ "$OPENGIT_TEST_MODE" == "detach" && "$count" -eq 1 ]]; then
  echo '  ⨯ unable to execute hdiutil  args=["detach","-quiet","/Volumes/OpenGit 1.5.6-arm64"] code=undefined error=Exit code: 16.'
  exit 1
fi
if [[ "$OPENGIT_TEST_MODE" == "other" ]]; then
  echo 'unrelated builder failure'
  exit 7
fi
echo 'fake electron-builder success'
`)
  fs.chmodSync(fakeNpxPath, 0o755)

  const baseEnv = {
    ...process.env,
    PATH: `${fakeBinDir}:${process.env.PATH}`,
    OPENGIT_TEST_COUNT_FILE: countFile,
    OPENGIT_BUILDER_RETRY_DELAY_SECONDS: '0'
  }
  const retryResult = spawnSync('bash', [wrapperPath, '--mac', 'dmg'], {
    cwd: rootDir,
    env: { ...baseEnv, OPENGIT_TEST_MODE: 'detach' },
    encoding: 'utf8'
  })
  assert.equal(retryResult.status, 0, retryResult.stderr)
  assert.equal(fs.readFileSync(countFile, 'utf8'), '2')
  assert.match(retryResult.stdout, /清理后重试一次/)
  assert.match(retryResult.stdout, /fake electron-builder success/)

  fs.rmSync(countFile)
  const unrelatedResult = spawnSync('bash', [wrapperPath, '--mac'], {
    cwd: rootDir,
    env: { ...baseEnv, OPENGIT_TEST_MODE: 'other' },
    encoding: 'utf8'
  })
  assert.equal(unrelatedResult.status, 7)
  assert.equal(fs.readFileSync(countFile, 'utf8'), '1')
  assert.doesNotMatch(unrelatedResult.stdout, /清理后重试一次/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('electron builder DMG retry assertions passed')
