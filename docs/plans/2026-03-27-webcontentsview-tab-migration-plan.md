# WebContentsView Tab Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the nested browser-tab plus `<webview>` architecture with a single app-level tab model where web tabs are backed by `WebContentsView` and builtin pages remain Vue-based and kept alive.

**Architecture:** Introduce a unified `AppTab` registry in the renderer, a main-process `WebTabManager` that owns `WebContentsView` instances, and a thin shell that switches between main-process web content and renderer-hosted builtin pages. Deliver this in phases, starting with a minimal spike that proves the architecture before migrating existing browser features.

**Tech Stack:** Vue 3 (`<script setup>`), Electron 38, `WebContentsView`, IPC, Vite

---

### Task 1: Create the Unified AppTab Store

**Files:**
- Create: `src/stores/appTabs.js`
- Modify: `src/components/browser/TabManager.vue`

**Step 1: Define the tab model**

Implement a single store that owns:

- `tabs`
- `activeTabId`
- tab creation helpers for `web` and `builtin`
- activation, close, and reorder operations

Required tab shape:

```js
{
  tabId: 'tab_1',
  kind: 'web',
  key: 'tab:tab_1',
  title: 'New Tab',
  icon: null,
  closable: true,
  pinned: false,
  lifecycle: 'active',
  persistPolicy: 'keep-alive'
}
```

**Step 2: Replace fixed browser-tab assumptions**

Remove the assumption in `TabManager.vue` that there is always one special browser container tab. `TabManager` should become the single top-level tab bar and content switcher.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- No remaining direct dependency on “browser tab inside app tab” assumptions in the touched code

### Task 2: Add the Main-Process WebTabManager Skeleton

**Files:**
- Create: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`

**Step 1: Create a manager class**

Add a manager responsible for:

- creating `WebContentsView`
- destroying `WebContentsView`
- storing `tabId -> view`
- activating one view at a time
- hiding all views
- updating bounds for the active view

Minimal API:

```js
createWebTab(tabId, url)
destroyWebTab(tabId)
activateWebTab(tabId, bounds)
hideAllWebTabs()
navigateWebTab(tabId, url)
```

**Step 2: Wire it into `main.js`**

Instantiate the manager after the main window exists. Ensure all web tabs are attached to the same main window content area.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Main process starts with no module resolution errors

### Task 3: Add WebTab IPC Contracts

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

**Step 1: Define the create/destroy/activate IPCs**

Expose:

- `webTabCreate`
- `webTabDestroy`
- `webTabActivate`
- `webTabNavigate`
- `webTabHideAll`
- `webTabSetBounds`

**Step 2: Define event channels back to renderer**

Expose listeners for:

- state changed
- title updated
- favicon updated
- load failed

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Preload exports compile correctly

### Task 4: Build the Minimal Browser Shell

**Files:**
- Create: `src/components/shell/BrowserToolbar.vue`
- Create: `src/components/shell/BuiltinPageHost.vue`
- Modify: `src/components/browser/TabManager.vue`

**Step 1: Extract shell responsibilities**

Move address bar and browser navigation controls into `BrowserToolbar.vue`.

`BuiltinPageHost.vue` should render builtin tabs only.

**Step 2: Show one active content model**

When active tab is `builtin`, show `BuiltinPageHost`.

When active tab is `web`, renderer content area should reserve the viewport while the main process shows the matching `WebContentsView`.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- UI renders one top-level tab bar and one toolbar

### Task 5: Implement the Spike Builtin New Tab Page

**Files:**
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `src/components/shell/BuiltinPageHost.vue`

**Step 1: Re-scope `NewTabPage.vue`**

Make `NewTabPage.vue` behave as a normal builtin page keyed as `browser:new-tab`.

It should no longer act as a universal router for web and builtin content.

**Step 2: Route builtin new-tab through the new store**

Opening a new tab should create either:

- a builtin `browser:new-tab`, or
- a web tab if a URL is provided

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open the app
- Confirm one top-level new-tab page appears without the old nested browser model

### Task 6: Make a Single Web Tab Work Through WebContentsView

**Files:**
- Modify: `src/components/shell/BrowserToolbar.vue`
- Modify: `src/stores/appTabs.js`
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`

**Step 1: Create a web tab from the toolbar**

Typing a URL and pressing Enter in the toolbar should:

- create a `web` tab
- call the main-process `createWebTab`
- activate it

**Step 2: Load and show the page**

The main process should create a `WebContentsView`, load the URL, attach it to the main window, and size it to the active content bounds.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open one web tab
- Confirm the page loads and is visible

### Task 7: Sync Title and Navigation State Back to the Renderer

**Files:**
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `src/stores/appTabs.js`
- Modify: `src/components/shell/BrowserToolbar.vue`

**Step 1: Emit web contents state**

Send renderer events for:

- title changes
- URL changes
- `canGoBack`
- `canGoForward`
- loading state

**Step 2: Update the active toolbar state**

The toolbar should always reflect the active web tab’s live navigation state.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Navigate across 2-3 pages in one web tab
- Confirm title and back/forward buttons update correctly

### Task 8: Add Web Tab Switching and Closing

**Files:**
- Modify: `src/stores/appTabs.js`
- Modify: `src/components/browser/TabManager.vue`
- Modify: `electron/tab-manager/web-tab-manager.js`

**Step 1: Activate the selected web tab**

Switching between web tabs must call `webTabActivate(tabId, bounds)`.

**Step 2: Hide views when switching to builtin tabs**

Switching to a builtin tab must hide all `WebContentsView` instances.

**Step 3: Destroy web views on close**

Closing a web tab must destroy its corresponding `WebContentsView`.

**Step 4: Verify**

Run: `npm run build`

Manual:
- Open two web tabs and one builtin tab
- Switch among them
- Close the active and inactive web tabs

### Task 9: Add Refresh, Back, Forward for the Spike

**Files:**
- Modify: `src/components/shell/BrowserToolbar.vue`
- Modify: `electron/main.js`
- Modify: `electron/tab-manager/web-tab-manager.js`

**Step 1: Add IPC commands**

Support:

- reload
- go back
- go forward

**Step 2: Connect toolbar buttons and shortcuts**

Minimal support:

- Enter
- `Cmd/Ctrl+L`
- `Cmd/Ctrl+R`
- `Alt+Left`
- `Alt+Right`

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open a web page
- Navigate within that tab
- Confirm back, forward, and refresh work

### Task 10: Persist and Restore Tab Metadata

**Files:**
- Modify: `src/stores/appTabs.js`
- Modify: `electron/preload.js`
- Modify: `electron/main.js`

**Step 1: Persist metadata only**

Save:

- tab order
- active tab
- `web` tab URL/session mode
- `builtin` tab key/props

Do not save:

- `WebContentsView` instances
- transient errors
- live load states

**Step 2: Restore lazily**

On startup:

- restore tab metadata
- immediately recreate the active web tab only
- delay recreation of background web tabs

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open several tabs
- Restart app
- Confirm active tab and order restore correctly

### Task 11: Migrate Builtin Git Pages into the Unified Tab Model

**Files:**
- Modify: `src/components/browser/TabManager.vue`
- Modify: `src/components/shell/BuiltinPageHost.vue`
- Modify: existing Git page open-navigation entry points

**Step 1: Register builtin page keys**

Support at minimum:

- `git:remote`
- `git:project:/abs/path`

**Step 2: Keep builtin pages alive**

Use a deterministic `cacheKey` per builtin tab.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open remote repo page
- Open one project detail page
- Switch away and back
- Confirm state remains

### Task 12: Remove the Old `<webview>` Main Path

**Files:**
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `src/components/browser/TabManager.vue`

**Step 1: Remove old browser-subtab routing**

Delete the old nested browser tab path once the new spike and migrated paths are stable.

**Step 2: Decommission `WebView.vue` from the main route**

Keep only temporary compatibility code if absolutely necessary.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Confirm the app no longer depends on `<webview>` for primary web browsing

## Verification Strategy

- Every task must end with `npm run build`
- Spike tasks require manual validation because the project currently does not include an automated Electron UI test harness
- Do not claim the migration works unless:
  - the build passes
  - the specified manual path was exercised

## Recommended Execution Batches

1. Batch 1:
   - Task 1
   - Task 2
   - Task 3

2. Batch 2:
   - Task 4
   - Task 5
   - Task 6

3. Batch 3:
   - Task 7
   - Task 8
   - Task 9

4. Batch 4:
   - Task 10
   - Task 11
   - Task 12
