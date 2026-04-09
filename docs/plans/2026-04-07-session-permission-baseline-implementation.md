# Session Permission Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the browser’s current “allow everything” permission behavior with a conservative site-permission baseline for the default persisted session.

**Architecture:** Keep `persist:main` as the only active browser session, but move permission decisions into a dedicated main-process policy module. Use a small renderer prompt in `Browser.vue` for `ask` permissions, while the main process owns remembered decisions, timeout handling, and fail-closed behavior.

**Tech Stack:** Electron 38, Vue 3, Vite, `electron-store`, Node assertion scripts

---

### Task 1: Create the Main-Process Site Permission Policy Core

**Files:**
- Create: `electron/permissions/site-permission-manager.js`
- Create: `scripts/test-site-permission-manager.mjs`

**Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import { createSitePermissionManager } from '../electron/permissions/site-permission-manager.js'

const fakeStore = {
  data: {},
  get(key, fallback) { return key in this.data ? this.data[key] : fallback },
  set(key, value) { this.data[key] = value }
}

const manager = createSitePermissionManager({ store: fakeStore })

assert.equal(manager.normalizeOrigin('https://example.com/a?b=1'), 'https://example.com')
assert.equal(manager.getDefaultDecision('media'), 'ask')
assert.equal(manager.getDefaultDecision('pointerLock'), 'deny')
assert.equal(manager.getDefaultDecision('unknown-permission'), 'deny')

manager.rememberDecision({
  partition: 'persist:main',
  origin: 'https://example.com',
  permission: 'media',
  decision: 'allow'
})

assert.equal(
  manager.getRememberedDecision({
    partition: 'persist:main',
    origin: 'https://example.com',
    permission: 'media'
  }),
  'allow'
)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `electron/permissions/site-permission-manager.js` does not exist yet.

**Step 3: Write minimal implementation**

```js
const STORAGE_KEY = 'site-permission-rules'

export function createSitePermissionManager({ store }) {
  const getRules = () => store.get(STORAGE_KEY, {})
  const setRules = (rules) => store.set(STORAGE_KEY, rules)

  const normalizeOrigin = (rawUrl = '') => {
    const url = new URL(rawUrl)
    return url.origin
  }

  const getDefaultDecision = (permission) => {
    switch (permission) {
      case 'media':
      case 'geolocation':
      case 'notifications':
      case 'clipboard-read':
        return 'ask'
      case 'pointerLock':
        return 'deny'
      default:
        return 'deny'
    }
  }

  const getRememberedDecision = ({ partition, origin, permission }) => {
    const rules = getRules()
    return rules?.[partition]?.[origin]?.[permission] || 'unset'
  }

  const rememberDecision = ({ partition, origin, permission, decision }) => {
    const rules = getRules()
    rules[partition] ??= {}
    rules[partition][origin] ??= {}
    rules[partition][origin][permission] = decision
    setRules(rules)
  }

  return {
    normalizeOrigin,
    getDefaultDecision,
    getRememberedDecision,
    rememberDecision
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: PASS and print a success message.

**Step 5: Commit**

```bash
git add electron/permissions/site-permission-manager.js scripts/test-site-permission-manager.mjs
git commit -m "feat: add site permission policy core"
```

### Task 2: Add Pending Ask-Request Queue and Timeout Handling

**Files:**
- Modify: `electron/permissions/site-permission-manager.js`
- Modify: `scripts/test-site-permission-manager.mjs`

**Step 1: Extend the failing test**

```js
const pending = manager.createPendingRequest({
  requestId: 'req_1',
  partition: 'persist:main',
  origin: 'https://example.com',
  permission: 'media',
  tabId: 'browser-web-1'
})

assert.equal(pending.status, 'pending')
assert.equal(manager.getPendingRequest('req_1').origin, 'https://example.com')

manager.resolvePendingRequest({ requestId: 'req_1', decision: 'deny' })
assert.equal(manager.getPendingRequest('req_1'), null)
```

Then add a timeout case:

```js
const expiring = manager.createPendingRequest({
  requestId: 'req_2',
  partition: 'persist:main',
  origin: 'https://stale.example.com',
  permission: 'notifications',
  tabId: 'browser-web-2',
  expiresAt: 100
})

assert.equal(expiring.status, 'pending')
assert.deepEqual(manager.expireRequests(101), ['req_2'])
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: FAIL because the queue methods do not exist yet.

**Step 3: Write minimal implementation**

```js
const pendingRequests = new Map()

const createPendingRequest = (request) => {
  const payload = { ...request, status: 'pending' }
  pendingRequests.set(request.requestId, payload)
  return payload
}

const getPendingRequest = (requestId) => pendingRequests.get(requestId) || null

const resolvePendingRequest = ({ requestId, decision }) => {
  const request = pendingRequests.get(requestId)
  if (!request) return null
  pendingRequests.delete(requestId)
  return { ...request, decision, status: 'resolved' }
}

const expireRequests = (now = Date.now()) => {
  const expired = []
  for (const [requestId, request] of pendingRequests.entries()) {
    if ((request.expiresAt || 0) <= now) {
      expired.push(requestId)
      pendingRequests.delete(requestId)
    }
  }
  return expired
}
```

**Step 4: Run test to verify it passes**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: PASS and confirm queue + timeout behavior.

**Step 5: Commit**

```bash
git add electron/permissions/site-permission-manager.js scripts/test-site-permission-manager.mjs
git commit -m "feat: add site permission request queue"
```

### Task 3: Wire Main-Process Session Handlers and Permission IPC

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `scripts/test-site-permission-manager.mjs`

**Step 1: Add a failing normalization test for renderer prompt payloads**

```js
const promptPayload = manager.buildPromptPayload({
  requestId: 'req_3',
  partition: 'persist:main',
  origin: 'https://maps.example.com',
  permission: 'geolocation',
  tabId: 'browser-web-3'
})

assert.deepEqual(promptPayload, {
  requestId: 'req_3',
  partition: 'persist:main',
  origin: 'https://maps.example.com',
  permission: 'geolocation',
  tabId: 'browser-web-3'
})
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: FAIL because `buildPromptPayload` does not exist yet.

**Step 3: Write minimal implementation and wire the runtime**

In `electron/permissions/site-permission-manager.js`:

```js
const buildPromptPayload = ({ requestId, partition, origin, permission, tabId }) => ({
  requestId,
  partition,
  origin,
  permission,
  tabId
})
```

In `electron/tab-manager/web-tab-manager.js`, track `webContents.id -> tabId`:

```js
this.contentsToTab = new Map()
this.contentsToTab.set(view.webContents.id, tabId)
```

In `electron/main.js`:

- instantiate the permission manager after the shared store exists
- replace unconditional permission allow logic with delegated policy handling
- emit renderer prompt events for `ask`
- add an IPC such as `browser-permission-respond`

In `electron/preload.js`:

```js
onBrowserPermissionRequested: (callback) => {
  ipcRenderer.on('browser-permission-requested', (event, data) => callback(data))
},
browserRespondToPermissionRequest: (data) => ipcRenderer.invoke('browser-permission-respond', data)
```

**Step 4: Run verification**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/main.js electron/preload.js electron/tab-manager/web-tab-manager.js electron/permissions/site-permission-manager.js scripts/test-site-permission-manager.mjs
git commit -m "feat: wire site permission main-process flow"
```

### Task 4: Add the Renderer Permission Prompt Queue

**Files:**
- Create: `src/composables/useSitePermissionPrompt.js`
- Create: `scripts/test-site-permission-prompt-state.mjs`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Write the failing prompt-state test**

```js
import assert from 'node:assert/strict'
import { createSitePermissionPromptState } from '../src/composables/useSitePermissionPrompt.js'

const promptState = createSitePermissionPromptState()

promptState.enqueue({ requestId: 'req_1', permission: 'media' })
promptState.enqueue({ requestId: 'req_2', permission: 'notifications' })

assert.equal(promptState.current().requestId, 'req_1')
promptState.resolveCurrent()
assert.equal(promptState.current().requestId, 'req_2')
promptState.clear()
assert.equal(promptState.current(), null)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-prompt-state.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

**Step 3: Write minimal implementation**

In `src/composables/useSitePermissionPrompt.js`:

```js
export function createSitePermissionPromptState() {
  const queue = []

  return {
    enqueue(item) { queue.push(item) },
    current() { return queue[0] || null },
    resolveCurrent() { queue.shift() },
    clear() { queue.splice(0, queue.length) }
  }
}
```

In `src/components/browser/Browser.vue`:

- listen for `onBrowserPermissionRequested`
- only enqueue requests for the active mapped web tab
- render a small banner with:
  - `允许一次`
  - `总是允许此站点`
  - `拒绝`
- reply through `browserRespondToPermissionRequest`

**Step 4: Run verification**

Run: `node scripts/test-site-permission-prompt-state.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/composables/useSitePermissionPrompt.js src/components/browser/Browser.vue scripts/test-site-permission-prompt-state.mjs
git commit -m "feat: add browser site permission prompt"
```

### Task 5: Verify Runtime Behavior and Harden Fail-Closed Paths

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/permissions/site-permission-manager.js`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Add the last failing test cases**

Extend `scripts/test-site-permission-manager.mjs` with:

```js
assert.equal(
  manager.shouldPromptRenderer({
    tabId: '',
    defaultDecision: 'ask'
  }),
  false
)

assert.equal(
  manager.shouldPromptRenderer({
    tabId: 'browser-web-9',
    defaultDecision: 'ask'
  }),
  true
)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: FAIL because the final guard helper does not exist yet.

**Step 3: Write minimal implementation**

```js
const shouldPromptRenderer = ({ tabId, defaultDecision }) => {
  if (defaultDecision !== 'ask') return false
  return Boolean(tabId)
}
```

Then make the runtime match:

- unmapped requests -> `deny`
- expired requests -> `deny`
- late renderer responses -> ignore
- renderer teardown / tab switch -> clear stale visible prompt

**Step 4: Run verification**

Run: `node scripts/test-site-permission-manager.mjs`
Expected: PASS

Run: `node scripts/test-site-permission-prompt-state.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

Manual:
- trigger a first permission request on an active site and confirm the banner appears
- click `允许一次` and confirm the next request asks again
- click `总是允许此站点` and confirm the same origin + permission no longer prompts
- confirm a background or unmapped request is denied

**Step 5: Commit**

```bash
git add electron/main.js electron/permissions/site-permission-manager.js src/components/browser/Browser.vue scripts/test-site-permission-manager.mjs scripts/test-site-permission-prompt-state.mjs
git commit -m "feat: harden site permission baseline"
```
