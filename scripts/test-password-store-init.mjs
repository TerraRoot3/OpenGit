import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

const sourcePath = path.resolve('src/composables/usePasswords.js')
const source = await fs.readFile(sourcePath, 'utf8')

const transformedSource = source
  .replace("import { ref } from 'vue'\n", '')
  .replace('export function usePasswords() {', 'function usePasswords() {')

const script = new vm.Script(`
const module = { exports: {} }
const exports = module.exports
${transformedSource}
module.exports = { usePasswords }
module.exports
`)

const createStoreModule = (electronAPI) => {
  const context = {
    console,
    ref: (value) => ({ value }),
    window: { electronAPI }
  }

  return script.runInNewContext(context)
}

let getBrowserPasswordsCallCount = 0
let saveBrowserPasswordCallCount = 0

const { usePasswords } = createStoreModule({
  async getBrowserPasswords() {
    getBrowserPasswordsCallCount += 1
    return {
      success: true,
      passwords: [
        { id: 1, username: 'alice', password: 'secret', domain: 'example.com' }
      ]
    }
  },
  async saveBrowserPassword() {
    saveBrowserPasswordCallCount += 1
    return { success: true }
  }
})

const firstStore = usePasswords()
await new Promise(resolve => setTimeout(resolve, 0))

assert.equal(
  getBrowserPasswordsCallCount,
  1,
  'usePasswords() should eagerly load saved passwords on first use'
)
assert.equal(firstStore.savedPasswords.value.length, 1)
assert.equal(firstStore.savedPasswords.value[0].username, 'alice')

const secondStore = usePasswords()
await new Promise(resolve => setTimeout(resolve, 0))

assert.equal(
  getBrowserPasswordsCallCount,
  1,
  'subsequent usePasswords() calls should reuse the loaded password cache'
)
assert.equal(secondStore.savedPasswords.value.length, 1)

await firstStore.savePassword('bob', 'updated', 'example.com')

assert.equal(saveBrowserPasswordCallCount, 1)
assert.equal(
  getBrowserPasswordsCallCount,
  2,
  'savePassword() should refresh the cached password list after saving'
)

let pendingGetBrowserPasswordsCallCount = 0
let pendingSaveBrowserPasswordCallCount = 0
let resolveInitialLoad = null

const { usePasswords: usePendingPasswords } = createStoreModule({
  async getBrowserPasswords() {
    pendingGetBrowserPasswordsCallCount += 1

    if (pendingGetBrowserPasswordsCallCount === 1) {
      return await new Promise(resolve => {
        resolveInitialLoad = () => {
          resolve({
            success: true,
            passwords: [
              { id: 1, username: 'alice', password: 'old-secret', domain: 'example.com' }
            ]
          })
        }
      })
    }

    return {
      success: true,
      passwords: [
        { id: 2, username: 'bob', password: 'new-secret', domain: 'example.com' }
      ]
    }
  },
  async saveBrowserPassword() {
    pendingSaveBrowserPasswordCallCount += 1
    return { success: true }
  }
})

const pendingStore = usePendingPasswords()
await new Promise(resolve => setTimeout(resolve, 0))

assert.equal(pendingGetBrowserPasswordsCallCount, 1)

const pendingSavePromise = pendingStore.savePassword('bob', 'new-secret', 'example.com')
await new Promise(resolve => setTimeout(resolve, 0))

resolveInitialLoad()
await pendingSavePromise

assert.equal(pendingSaveBrowserPasswordCallCount, 1)
assert.equal(
  pendingGetBrowserPasswordsCallCount,
  2,
  'savePassword() should force a fresh reload even if the initial load is still pending'
)
assert.equal(pendingStore.savedPasswords.value[0].username, 'bob')

console.log('password store init test passed')
