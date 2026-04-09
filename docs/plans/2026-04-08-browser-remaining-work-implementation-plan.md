# Browser Remaining Work Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the remaining browser work after the `WebContentsView` shell migration and the default-session site permission baseline, so OpenGit closes the largest capability and stability gaps still called out in the browser design docs.

**Architecture:** Keep `Browser.vue` as the visible browser shell and `WebTabManager` as the main-process owner of webpage tabs, but move more browser-grade behavior into explicit main-process controllers: lifecycle, recovery, popup policy, session partitioning, and download/session metadata. Renderer work should stay thin: prompt bars, panels, and tab/session indicators should bind to explicit IPC state instead of inferring behavior from hidden views or legacy `<webview>` assumptions.

**Tech Stack:** Electron 38, Vue 3 (`<script setup>`), `WebContentsView`, existing `electron-store`, main-process IPC, Node assertion scripts, Vite

---

### Task 1: Add Explicit Web Tab Lifecycle State

**Files:**
- Create: `electron/tab-manager/web-tab-lifecycle.js`
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/browser/Browser.vue`
- Test: `scripts/test-web-tab-lifecycle.mjs`

**Step 1: Write the failing lifecycle-state test**

```js
import assert from 'node:assert/strict'
import { createWebTabLifecycleController } from '../electron/tab-manager/web-tab-lifecycle.js'

const lifecycle = createWebTabLifecycleController({
  freezeDelayMs: 1000,
  discardDelayMs: 5000
})

lifecycle.registerTab('browser-web-1')
assert.equal(lifecycle.getState('browser-web-1').phase, 'warm')

lifecycle.activateTab('browser-web-1', 0)
assert.equal(lifecycle.getState('browser-web-1').phase, 'active')

lifecycle.deactivateTab('browser-web-1', 100)
assert.equal(lifecycle.getState('browser-web-1').phase, 'warm')

assert.deepEqual(lifecycle.advance(1200), ['browser-web-1:frozen'])
assert.equal(lifecycle.getState('browser-web-1').phase, 'frozen')

assert.deepEqual(lifecycle.advance(5200), ['browser-web-1:discarded'])
assert.equal(lifecycle.getState('browser-web-1').phase, 'discarded')
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-web-tab-lifecycle.mjs`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `electron/tab-manager/web-tab-lifecycle.js` does not exist yet.

**Step 3: Write minimal lifecycle controller**

Create `electron/tab-manager/web-tab-lifecycle.js` with a small controller exposing:

- `registerTab(tabId)`
- `unregisterTab(tabId)`
- `activateTab(tabId, now)`
- `deactivateTab(tabId, now)`
- `advance(now)`
- `getState(tabId)`

State shape:

```js
{
  phase: 'active' | 'warm' | 'frozen' | 'discarded',
  lastActivatedAt: number,
  lastBackgroundedAt: number,
  frozenAt: number | null,
  discardedAt: number | null
}
```

Transition rules:

- New tab starts as `warm`
- Active tab becomes `active`
- Background tab becomes `warm`
- `advance(now)` moves `warm -> frozen` after `freezeDelayMs`
- `advance(now)` moves `frozen -> discarded` after `discardDelayMs`

**Step 4: Run test to verify it passes**

Run: `node scripts/test-web-tab-lifecycle.mjs`  
Expected: PASS and print a lifecycle success message.

**Step 5: Wire manager state emission**

In `electron/tab-manager/web-tab-manager.js`:

- instantiate the lifecycle controller
- register/unregister tabs on create/destroy
- mark active/inactive tabs on activation and hide
- emit `web-tab-lifecycle-changed` when a tab phase changes

In `electron/main.js`:

- add a periodic lifecycle tick using `setInterval`
- on `frozen` and `discarded`, apply the concrete manager behavior

Concrete behavior for this task:

- `frozen`: stop any manager-side active bookkeeping and mark state only
- `discarded`: destroy the underlying `WebContentsView`, keep tab metadata so it can be recreated later

In `electron/preload.js` and `Browser.vue`:

- expose and bind `onWebTabLifecycleChanged`
- persist `tab.lifecyclePhase`

**Step 6: Verify**

Run:

- `node scripts/test-web-tab-lifecycle.mjs`
- `node -c electron/main.js`
- `node -c electron/tab-manager/web-tab-manager.js`
- `npm run build`

Manual:

- open 3 normal web tabs
- leave one in background long enough to freeze
- leave one longer to discard
- switch back and confirm the shell still knows which tab exists

**Step 7: Commit**

```bash
git add electron/tab-manager/web-tab-lifecycle.js electron/tab-manager/web-tab-manager.js electron/main.js electron/preload.js src/components/browser/Browser.vue scripts/test-web-tab-lifecycle.mjs
git commit -m "feat: add web tab lifecycle states"
```

### Task 2: Restore Discarded Tabs and Add Crash Recovery

**Files:**
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/browser/Browser.vue`
- Test: `scripts/test-web-tab-recovery.mjs`

**Step 1: Write the failing recovery test**

```js
import assert from 'node:assert/strict'
import { createRecoverySnapshot, shouldAutoRestoreDiscardedTab } from '../electron/tab-manager/web-tab-manager.js'

const snapshot = createRecoverySnapshot({
  tabId: 'browser-web-4',
  url: 'https://example.com/dashboard',
  title: 'Dashboard',
  lifecyclePhase: 'discarded',
  isCrashed: false
})

assert.equal(snapshot.tabId, 'browser-web-4')
assert.equal(snapshot.url, 'https://example.com/dashboard')
assert.equal(shouldAutoRestoreDiscardedTab({ isActive: true, lifecyclePhase: 'discarded' }), true)
assert.equal(shouldAutoRestoreDiscardedTab({ isActive: false, lifecyclePhase: 'discarded' }), false)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-web-tab-recovery.mjs`  
Expected: FAIL because the helpers do not exist yet.

**Step 3: Add manager-side recovery helpers**

In `electron/tab-manager/web-tab-manager.js` add:

- `createRecoverySnapshot(tabId)` returning `{ tabId, url, title, favicon, lifecyclePhase, isCrashed }`
- `restoreWebTab(tabId, url)` that recreates the view when a tab was discarded or crashed
- `markTabCrashed(tabId)` on `render-process-gone`

Add exported pure helpers for the test:

```js
function createRecoverySnapshot(input) {
  return {
    tabId: input.tabId,
    url: input.url || 'about:blank',
    title: input.title || '',
    lifecyclePhase: input.lifecyclePhase || 'warm',
    isCrashed: Boolean(input.isCrashed)
  }
}

function shouldAutoRestoreDiscardedTab({ isActive = false, lifecyclePhase = '' } = {}) {
  return isActive && lifecyclePhase === 'discarded'
}
```

**Step 4: Wire crash + discard recovery into shell flow**

In `Browser.vue`:

- when the active tab is `discarded`, auto-request restore before first paint
- when `isCrashed === true`, show a dedicated recovery banner instead of a generic load failure message
- add `恢复标签页` action next to `重试`

In `electron/preload.js`:

- expose `webTabRestore`

In `electron/main.js`:

- add `ipcMain.handle('web-tab-restore', ...)`

**Step 5: Run test to verify it passes**

Run:

- `node scripts/test-web-tab-recovery.mjs`
- `npm run build`

Expected:

- recovery test passes
- build passes

**Step 6: Manual verification**

- discard a tab using the lifecycle path and switch back to it
- confirm the tab is recreated automatically
- force a renderer crash in a web tab
- confirm the browser shows a recover action and restore works

**Step 7: Commit**

```bash
git add electron/tab-manager/web-tab-manager.js electron/main.js electron/preload.js src/components/browser/Browser.vue scripts/test-web-tab-recovery.mjs
git commit -m "feat: add browser tab recovery flow"
```

### Task 3: Unify All New-Window Behavior

**Files:**
- Create: `electron/tab-manager/window-open-policy.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/browser/Browser.vue`
- Test: `scripts/test-window-open-policy.mjs`

**Step 1: Write the failing popup-policy test**

```js
import assert from 'node:assert/strict'
import { decideWindowOpenAction } from '../electron/tab-manager/window-open-policy.js'

assert.deepEqual(
  decideWindowOpenAction({ url: 'https://example.com', disposition: 'new-window' }),
  { action: 'tab' }
)

assert.deepEqual(
  decideWindowOpenAction({ url: 'about:blank', disposition: 'foreground-tab' }),
  { action: 'tab' }
)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-window-open-policy.mjs`  
Expected: FAIL because `window-open-policy.js` does not exist.

**Step 3: Write minimal policy module**

Create `electron/tab-manager/window-open-policy.js` with:

- `decideWindowOpenAction({ url, disposition, frameName })`

Default first-round policy:

- normal http/https/about/git URLs => `{ action: 'tab' }`
- unsupported URLs => `{ action: 'external' }`
- explicit allowlisted special popup cases => `{ action: 'window' }`

**Step 4: Replace dual handlers with one policy path**

In `electron/main.js`:

- remove the ad hoc `mainWindow.webContents.setWindowOpenHandler` branch that creates another `BrowserWindow`
- reuse `decideWindowOpenAction` for both:
  - `mainWindow.webContents.setWindowOpenHandler`
  - `app.on('web-contents-created', ...)`

Renderer contract:

- `tab` => send `open-url-in-new-tab`
- `external` => `shell.openExternal(url)`
- `window` => create a new `BrowserWindow` only through one explicit helper

**Step 5: Run test to verify it passes**

Run:

- `node scripts/test-window-open-policy.mjs`
- `node -c electron/main.js`
- `npm run build`

Expected: all pass.

**Step 6: Manual verification**

- click a regular `_blank` link
- trigger `window.open`
- confirm both go to a browser tab by default
- confirm unsupported schemes still leave the app safely

**Step 7: Commit**

```bash
git add electron/tab-manager/window-open-policy.js electron/main.js electron/preload.js src/components/browser/Browser.vue scripts/test-window-open-policy.mjs
git commit -m "feat: unify browser popup policy"
```

### Task 4: Finish Download Management as a Real Browser Feature

**Files:**
- Create: `src/components/browser/DownloadPanel.vue`
- Create: `src/composables/useDownloadManager.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Test: `scripts/test-download-manager-state.mjs`

**Step 1: Write the failing download-state test**

```js
import assert from 'node:assert/strict'
import { createDownloadManagerState } from '../src/composables/downloadManagerState.mjs'

const downloads = createDownloadManagerState()

downloads.upsert({ id: 'dl_1', state: 'started', fileName: 'archive.zip', totalBytes: 100, receivedBytes: 10 })
downloads.upsert({ id: 'dl_1', state: 'progressing', receivedBytes: 60 })

assert.equal(downloads.list()[0].progress, 60)
assert.equal(downloads.list()[0].state, 'progressing')
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-download-manager-state.mjs`  
Expected: FAIL because the pure state module does not exist yet.

**Step 3: Add pure state + Vue wrapper**

Create:

- `src/composables/downloadManagerState.mjs`
- `src/composables/useDownloadManager.js`

Required actions:

- `upsert`
- `remove`
- `clearCompleted`
- `list`
- `markRetryable`

**Step 4: Replace the inline mini-panel**

In `Browser.vue`:

- replace the current inline download summary with a dedicated `<DownloadPanel />`
- keep the compact header entry count in the menu

In `DownloadPanel.vue` show:

- file name
- state
- percent
- open folder
- retry when interrupted
- clear completed

**Step 5: Extend main-process download IPC**

In `electron/main.js` and `electron/preload.js`:

- add explicit actions for:
  - `browser-open-download-folder`
  - `browser-retry-download`
  - `browser-clear-download-history`

If retry cannot reuse the exact partial file reliably, the first version may restart using the saved source URL.

**Step 6: Run test to verify it passes**

Run:

- `node scripts/test-download-manager-state.mjs`
- `npm run build`

Expected: PASS.

**Step 7: Manual verification**

- download a file
- confirm progress updates in the panel
- confirm open-folder works
- confirm an interrupted download can be retried

**Step 8: Commit**

```bash
git add src/components/browser/DownloadPanel.vue src/composables/downloadManagerState.mjs src/composables/useDownloadManager.js src/components/browser/Browser.vue electron/main.js electron/preload.js scripts/test-download-manager-state.mjs
git commit -m "feat: finish browser download panel"
```

### Task 5: Add Private Session Tabs

**Files:**
- Create: `electron/tab-manager/session-partition-manager.js`
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Test: `scripts/test-session-partition-manager.mjs`

**Step 1: Write the failing session-partition test**

```js
import assert from 'node:assert/strict'
import { createSessionPartitionManager } from '../electron/tab-manager/session-partition-manager.js'

const manager = createSessionPartitionManager()

const mainPartition = manager.getPartition({ isPrivate: false, tabId: 'browser-web-1' })
const privatePartition = manager.getPartition({ isPrivate: true, tabId: 'browser-web-9' })

assert.equal(mainPartition, 'persist:main')
assert.equal(privatePartition, 'temp:browser-web-9')
assert.equal(manager.isPrivatePartition(privatePartition), true)
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-session-partition-manager.mjs`  
Expected: FAIL because the manager does not exist yet.

**Step 3: Add partition manager**

Create `electron/tab-manager/session-partition-manager.js`:

```js
function createSessionPartitionManager() {
  return {
    getPartition({ isPrivate = false, tabId = '' } = {}) {
      return isPrivate && tabId ? `temp:${tabId}` : 'persist:main'
    },
    isPrivatePartition(partition = '') {
      return partition.startsWith('temp:')
    }
  }
}
```

**Step 4: Thread private-session metadata through tabs**

In `Browser.vue` tab objects add:

- `isPrivate`
- `sessionPartition`

Add a visible entry point:

- `新建隐私标签页`

In `web-tab-manager.js`:

- use the per-tab partition when creating the view instead of hardcoding `persist:main`

In `main.js`:

- register permission handlers for both persisted and temporary partitions
- on private tab destroy, clear storage data for that temp partition

**Step 5: Run test to verify it passes**

Run:

- `node scripts/test-session-partition-manager.mjs`
- `node -c electron/main.js`
- `npm run build`

Expected: PASS.

**Step 6: Manual verification**

- open one normal tab and one private tab on the same site
- confirm login/cookie state does not leak between them
- close the private tab
- confirm the partition storage is cleared

**Step 7: Commit**

```bash
git add electron/tab-manager/session-partition-manager.js electron/tab-manager/web-tab-manager.js electron/main.js electron/preload.js src/components/browser/Browser.vue src/components/browser/NewTabPage.vue scripts/test-session-partition-manager.mjs
git commit -m "feat: add private browser tabs"
```

### Task 6: Add Site Info and Permission Management Panel

**Files:**
- Create: `src/components/browser/SitePermissionPanel.vue`
- Create: `src/composables/useSitePermissionPanel.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/permissions/site-permission-manager.js`
- Test: `scripts/test-site-permission-panel-state.mjs`

**Step 1: Write the failing permission-panel state test**

```js
import assert from 'node:assert/strict'
import { createSitePermissionPanelState } from '../src/composables/sitePermissionPanelState.mjs'

const state = createSitePermissionPanelState()

state.open({ origin: 'https://example.com', permissions: { media: 'allow', notifications: 'unset' } })
assert.equal(state.snapshot().isOpen, true)
assert.equal(state.snapshot().permissions.media, 'allow')

state.resetPermission('media')
assert.equal(state.snapshot().permissions.media, 'unset')
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-site-permission-panel-state.mjs`  
Expected: FAIL because the state module does not exist yet.

**Step 3: Add manager APIs for querying and resetting remembered rules**

In `electron/permissions/site-permission-manager.js` add:

- `listPermissionsForOrigin({ partition, origin })`
- `resetPermission({ partition, origin, permission })`
- `resetAllPermissionsForOrigin({ partition, origin })`

**Step 4: Add renderer panel**

Create:

- `src/composables/sitePermissionPanelState.mjs`
- `src/composables/useSitePermissionPanel.js`
- `src/components/browser/SitePermissionPanel.vue`

Panel content:

- current origin
- current permission decisions for managed permission types
- `重置` action per permission
- `全部重置`
- lightweight site information:
  - origin
  - active partition type (`默认` / `隐私`)

Add a toolbar/site-info trigger in `Browser.vue`.

**Step 5: Add IPC contract**

In `electron/main.js` and `electron/preload.js` add:

- `browser-get-site-permissions`
- `browser-reset-site-permission`
- `browser-reset-all-site-permissions`

**Step 6: Run test to verify it passes**

Run:

- `node scripts/test-site-permission-panel-state.mjs`
- `npm run build`

Expected: PASS.

**Step 7: Manual verification**

- allow a site permission
- open the site info panel
- confirm the stored decision is visible
- reset it
- confirm the next permission request prompts again

**Step 8: Commit**

```bash
git add src/composables/sitePermissionPanelState.mjs src/composables/useSitePermissionPanel.js src/components/browser/SitePermissionPanel.vue src/components/browser/Browser.vue electron/main.js electron/preload.js electron/permissions/site-permission-manager.js scripts/test-site-permission-panel-state.mjs
git commit -m "feat: add site permission management panel"
```

### Task 7: Complete the Browser Shortcut Matrix

**Files:**
- Create: `src/composables/useBrowserShortcuts.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/main.js`
- Test: `scripts/test-browser-shortcuts.mjs`

**Step 1: Write the failing shortcut test**

```js
import assert from 'node:assert/strict'
import { resolveBrowserShortcut } from '../src/composables/browserShortcuts.mjs'

assert.equal(resolveBrowserShortcut({ metaKey: true, key: 't' }), 'new-tab')
assert.equal(resolveBrowserShortcut({ metaKey: true, shiftKey: true, key: 't' }), 'restore-closed-tab')
assert.equal(resolveBrowserShortcut({ metaKey: true, key: 'w' }), 'close-tab')
```

**Step 2: Run test to verify it fails**

Run: `node scripts/test-browser-shortcuts.mjs`  
Expected: FAIL because the helper does not exist yet.

**Step 3: Add shortcut resolver**

Create:

- `src/composables/browserShortcuts.mjs`
- `src/composables/useBrowserShortcuts.js`

Required actions:

- `new-tab`
- `close-tab`
- `restore-closed-tab`
- `focus-address-bar`
- `reload-tab`
- `force-reload-tab`
- `go-back`
- `go-forward`

**Step 4: Remove reliance on window-role defaults for browser tab actions**

In `Browser.vue`:

- bind the renderer shortcuts to browser-tab behavior
- add `restoreClosedBrowserTab()`

In `electron/main.js`:

- keep window close/minimize menu roles
- remove any browser-tab semantic mismatch from the application menu

**Step 5: Run test to verify it passes**

Run:

- `node scripts/test-browser-shortcuts.mjs`
- `npm run build`

Expected: PASS.

**Step 6: Manual verification**

- `Cmd/Ctrl+T` opens a browser tab
- `Cmd/Ctrl+W` closes only the active browser tab
- `Shift+Cmd/Ctrl+T` restores the last closed browser tab

**Step 7: Commit**

```bash
git add src/composables/browserShortcuts.mjs src/composables/useBrowserShortcuts.js src/components/browser/Browser.vue electron/main.js scripts/test-browser-shortcuts.mjs
git commit -m "feat: complete browser shortcut matrix"
```

### Task 8: Investigate and Patch Passkey / WebAuthn Behavior

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/browserContentAdapter.js`
- Modify: `src/components/webview/WebView.vue`
- Create: `docs/plans/2026-04-08-passkey-investigation-notes.md`
- Test: manual verification on at least one real passkey-enabled site

**Step 1: Establish the true capability baseline**

Record in `docs/plans/2026-04-08-passkey-investigation-notes.md`:

- Electron version
- Chromium version
- platform
- whether `navigator.credentials`, `PublicKeyCredential`, and conditional mediation are available
- exact site and exact observed error string

**Step 2: Add a diagnostic bridge**

In `browserContentAdapter.js` or the active web tab path:

- add a diagnostic action that evaluates:

```js
({
  hasCredentials: typeof navigator.credentials !== 'undefined',
  hasPublicKeyCredential: typeof window.PublicKeyCredential !== 'undefined',
  hasCreate: typeof navigator.credentials?.create === 'function',
  hasGet: typeof navigator.credentials?.get === 'function',
  conditionalMediation: typeof PublicKeyCredential?.isConditionalMediationAvailable === 'function'
})
```

**Step 3: Surface browser diagnostics in the shell**

In `Browser.vue`:

- add a hidden or developer-only diagnostics section for the active tab
- show “unsupported / partial / available” instead of silently failing

**Step 4: Patch only the concrete missing capability**

Depending on the audit result:

- if the problem is a missing main-process/session capability, fix it there
- if Electron 38 cannot fully support the target flow, document the boundary clearly instead of shipping guesswork

Do not invent a fake compatibility layer that only changes the message but not the actual auth path.

**Step 5: Verify**

Run: `npm run build`

Manual:

- test at least one real passkey login page
- capture exact outcome in the investigation notes

Expected:

- either the flow works
- or the unsupported boundary is documented precisely with no ambiguity

**Step 6: Commit**

```bash
git add electron/main.js src/components/browser/Browser.vue src/components/browser/browserContentAdapter.js src/components/webview/WebView.vue docs/plans/2026-04-08-passkey-investigation-notes.md
git commit -m "feat: audit browser passkey support"
```

### Task 9: Split Browser Shell Responsibilities

**Files:**
- Create: `src/composables/useBrowserTabs.js`
- Create: `src/composables/useBrowserNavigationState.js`
- Create: `src/composables/useBrowserPersistence.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/browserContentAdapter.js`
- Test: `npm run build`

**Step 1: Extract tab collection operations**

Move from `Browser.vue` into `useBrowserTabs.js`:

- create tab
- close tab
- restore closed tab
- reorder tab
- resolve active tab

**Step 2: Extract navigation state**

Move into `useBrowserNavigationState.js`:

- current URL
- address bar input
- back/forward capability
- load error helpers
- loading progress helpers

**Step 3: Extract persistence**

Move into `useBrowserPersistence.js`:

- save browser tabs
- restore browser tabs
- closed-tab history if introduced by Task 7

**Step 4: Keep `Browser.vue` orchestration-only**

After extraction, `Browser.vue` should mostly:

- bind the template
- compose the extracted hooks
- wire IPC events to those hooks

Do not move main-process-owned decisions back into the renderer.

**Step 5: Verify**

Run:

- `npm run build`

Manual:

- open builtin tabs
- open web tabs
- close and restore tabs
- restart and confirm restore still works

**Step 6: Commit**

```bash
git add src/composables/useBrowserTabs.js src/composables/useBrowserNavigationState.js src/composables/useBrowserPersistence.js src/components/browser/Browser.vue src/components/browser/browserContentAdapter.js
git commit -m "refactor: split browser shell state"
```

### Task 10: Reduce Legacy `<webview>` Dependence and Update Docs

**Files:**
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `docs/plans/2026-03-27-browser-experience-design.md`
- Modify: `docs/plans/2026-03-31-webcontentsview-browser-shell-implementation.md`
- Modify: `README.md` (optional short status summary)

**Step 1: Document what still legitimately requires `<webview>`**

If nothing on the main browser path still requires it, mark the file as compatibility-only and remove stale assumptions from docs.

**Step 2: Remove or isolate legacy-only hooks**

In `WebView.vue`:

- keep only compatibility behavior needed for non-primary paths
- remove leftover primary-path assumptions that conflict with `WebContentsView`

**Step 3: Update execution status docs**

Mark what is now complete versus still deferred:

- lifecycle
- crash recovery
- popup policy
- downloads
- private tabs
- site info
- shortcuts
- passkey audit result
- shell split

**Step 4: Verify**

Run: `npm run build`

Expected: PASS and docs match actual code state.

**Step 5: Commit**

```bash
git add src/components/webview/WebView.vue src/components/browser/NewTabPage.vue docs/plans/2026-03-27-browser-experience-design.md docs/plans/2026-03-31-webcontentsview-browser-shell-implementation.md README.md
git commit -m "docs: update browser completion status"
```

## Recommended Execution Order

1. Task 1: Web tab lifecycle states
2. Task 2: Recovery for discarded/crashed tabs
3. Task 3: Unified popup/new-window policy
4. Task 4: Full download panel
5. Task 5: Private session tabs
6. Task 6: Site info and permission management panel
7. Task 7: Browser shortcut matrix
8. Task 8: Passkey / WebAuthn audit and targeted patch
9. Task 9: Browser shell extraction
10. Task 10: Legacy cleanup and docs

## Manual Verification Matrix

At the end of the full plan, run this browser regression pass:

1. Open at least three normal web tabs and two builtin tabs.
2. Confirm background tabs move through `warm -> frozen -> discarded`.
3. Switch back to a discarded tab and confirm it restores.
4. Force a crash and confirm the recover action works.
5. Trigger `_blank` and `window.open` flows and confirm they follow one policy.
6. Download a file, open its folder, and retry an interrupted download.
7. Open one normal tab and one private tab on the same site and confirm session isolation.
8. Allow a site permission, open the site panel, reset it, and confirm the prompt reappears.
9. Verify `Cmd/Ctrl+T`, `Cmd/Ctrl+W`, `Shift+Cmd/Ctrl+T`, `Cmd/Ctrl+L`, refresh, back, and forward.
10. Run a real passkey-enabled site and record the exact result.
11. Run `npm run build` as the final compile verification.
