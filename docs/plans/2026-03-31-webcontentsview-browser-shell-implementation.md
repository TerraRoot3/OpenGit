# WebContentsView Browser Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the existing OpenGit browser interaction model while replacing primary webpage rendering with `WebContentsView`.

**Architecture:** Preserve `Browser.vue` as the single browser shell and unified tab controller. Split tab content into `web` tabs managed by a main-process `WebContentsView` manager and `builtin` tabs rendered by existing Vue pages, with an internal adapter layer replacing direct DOM `webview` control.

**Tech Stack:** Vue 3, Electron 38, `WebContentsView`, IPC, Vite

---

### Task 1: Document Current Browser Shell Assumptions

**Files:**
- Modify: `docs/plans/2026-03-31-webcontentsview-browser-shell-design.md`
- Inspect: `src/components/browser/Browser.vue`
- Inspect: `src/components/browser/NewTabPage.vue`
- Inspect: `src/components/webview/WebView.vue`

**Step 1: Enumerate current tab fields and route types**

Capture the exact tab properties and route types currently used by `Browser.vue`.

**Step 2: Record direct `webview` touch points**

List every place `Browser.vue` calls `reload`, `goBack`, `goForward`, reads `src`, reads navigation state, or stores a `webview` reference.

**Step 3: Verify**

Run: `rg -n "webview|goBack|goForward|reload|webviewReady|webviewSrc" src/components/browser/Browser.vue src/components/webview/WebView.vue`

Expected:
- All direct `webview` dependencies are identified before refactoring

### Task 2: Introduce a Browser Content Adapter

**Files:**
- Create: `src/components/browser/browserContentAdapter.js`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Define adapter interface**

Add an adapter module exposing operations used by the shell:

- `activateTabContent(tab, bounds)`
- `hideWebContent()`
- `navigate(tab, url)`
- `reload(tab)`
- `goBack(tab)`
- `goForward(tab)`
- `syncWebState(tabId, patch)`

**Step 2: Wrap existing `webview` path**

Initially implement the adapter on top of the existing `webview` behavior so UI stays unchanged.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- `Browser.vue` no longer calls raw `webview` methods directly outside the adapter boundary

### Task 3: Add WebContentsView Manager Skeleton

**Files:**
- Create: `electron/tab-manager/web-tab-manager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

**Step 1: Add manager class**

Create a manager responsible for:

- `createWebTab(tabId, url)`
- `destroyWebTab(tabId)`
- `activateWebTab(tabId, bounds)`
- `hideAllWebTabs()`
- `navigateWebTab(tabId, url)`
- `reloadWebTab(tabId)`
- `goBack(tabId)`
- `goForward(tabId)`

**Step 2: Add IPC contract**

Expose matching IPC methods plus events for:

- state changed
- title updated
- favicon updated
- load failed

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Main/preload modules compile with the new IPC surface

### Task 4: Add Shell Bounds Synchronization

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/tab-manager/web-tab-manager.js`

**Step 1: Measure browser content bounds**

Compute the active content viewport in `Browser.vue` and send bounds updates to the main process.

**Step 2: Keep active view aligned**

Update the manager so the active `WebContentsView` always tracks the renderer content bounds.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Bounds sync code is in place for later activation work

### Task 5: Run One Web Tab Through WebContentsView

**Files:**
- Modify: `src/components/browser/browserContentAdapter.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `src/components/webview/WebView.vue`

**Step 1: Classify tabs internally**

Add internal `contentKind` or equivalent metadata so the shell can distinguish builtin tabs from normal webpage tabs without changing the visible interaction.

**Step 2: Route one normal webpage tab through the manager**

For standard URL tabs:

- create a `WebContentsView`
- activate it when the tab becomes active
- keep builtin tabs on the renderer path

**Step 3: Preserve existing UI**

Do not change tab bar behavior, toolbar layout, or builtin route flow.

**Step 4: Verify**

Run: `npm run build`

Manual:
- Open one normal webpage tab
- Confirm the page is visible
- Confirm switching back to a builtin page still works

### Task 6: Sync Browser Toolbar State from Main Process

**Files:**
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Emit live navigation state**

Push URL, title, favicon, loading state, `canGoBack`, and `canGoForward` for active `web` tabs.

**Step 2: Update shell state**

Bind toolbar state and tab metadata to the main-process events instead of DOM `webview` reads.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Navigate across several pages in one web tab
- Confirm title, URL, favicon, and buttons stay correct

### Task 7: Switch All Web Tabs to WebContentsView

**Files:**
- Modify: `src/components/browser/browserContentAdapter.js`
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `src/components/webview/WebView.vue`

**Step 1: Move normal webpage tabs off `<webview>`**

All standard web tabs should use `WebContentsView`.

**Step 2: Keep builtin pages unchanged**

Route types like Git pages, favorites, history, passwords, backup, and terminal remain Vue-rendered builtin content.

**Step 3: Keep hidden compatibility only if needed**

Allow temporary compatibility code while the migration is incomplete, but remove `<webview>` from the primary tab path.

**Step 4: Verify**

Run: `npm run build`

Manual:
- Open multiple web tabs and builtin tabs
- Switch among them
- Close active and inactive tabs

### Task 8: Migrate Browser Actions onto the Adapter

**Files:**
- Modify: `src/components/browser/browserContentAdapter.js`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Move navigation commands**

Use the adapter for:

- address bar open
- reload
- go back
- go forward
- retry load

**Step 2: Remove direct `webview` assumptions**

Delete shell logic that depends on querying DOM `webview` elements for primary browsing behavior.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Shell actions work through adapter only

### Task 9: Add Browser-Grade Main-Process Policies

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/tab-manager/web-tab-manager.js`

**Step 1: New-window and popup policy**

Handle `window.open`, target blank links, and popup requests in the main process and map them to the existing unified tab behavior.

**Step 2: Download policy**

Track downloads in the main process and expose progress/state to the renderer.

**Step 3: Permission policy**

Add explicit permission handling for media, notifications, clipboard, and similar browser capabilities.

**Step 4: Verify**

Run: `npm run build`

Manual:
- Trigger a download
- Open a popup or target blank link
- Trigger at least one site permission request

### Task 10: Add Crash Recovery and Error UX

**Files:**
- Modify: `electron/tab-manager/web-tab-manager.js`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Detect process crashes and render failures**

Emit crash/failure events for affected web tabs.

**Step 2: Add recovery UI**

Show a banner or inline action allowing reload/recreate of the failed tab without changing the broader interaction model.

**Step 3: Verify**

Run: `npm run build`

Expected:
- Build succeeds
- Error state can be surfaced through the existing browser shell

### Task 11: Persist and Restore WebContentsView Tab Metadata

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/tab-manager/web-tab-manager.js`

**Step 1: Persist metadata only**

Persist:

- tab order
- active tab
- route type
- URL
- builtin route props

Do not persist:

- live `WebContentsView` instances
- transient load state
- crash flags

**Step 2: Restore tabs lazily**

Recreate active web tabs first and background web tabs on demand.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Open several tabs
- Restart app
- Confirm tab order and active tab restore correctly

### Task 12: Remove the Old WebView Primary Path

**Files:**
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/NewTabPage.vue`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Decommission primary DOM webview browsing**

Keep `WebView.vue` only for transitional or developer-only use if absolutely needed.

**Step 2: Remove dead shell code**

Delete obsolete `webview`-specific state, refs, and DOM queries that are no longer part of the primary path.

**Step 3: Verify**

Run: `npm run build`

Manual:
- Confirm normal browsing no longer depends on DOM `<webview>`
- Confirm builtin pages still use the unified tab shell

## Verification Strategy

- Every task ends with `npm run build`
- Browser-behavior tasks require manual validation because there is no Electron UI test harness
- Do not claim migration success until:
  - build passes
  - the listed manual flows are exercised

## Recommended Execution Batches

1. Batch 1:
   - Task 1
   - Task 2
   - Task 3
   - Task 4

2. Batch 2:
   - Task 5
   - Task 6
   - Task 7

3. Batch 3:
   - Task 8
   - Task 9
   - Task 10

4. Batch 4:
   - Task 11
   - Task 12

## Execution Status (2026-04-09)

- [x] Task 1-8: Browser shell 已切到 `WebContentsView` 主路径，适配层与 IPC 状态同步完成
- [x] Task 9: 主进程策略已补齐（新窗口策略、下载状态、权限请求策略）
- [x] Task 10: 崩溃/失败恢复交互已接入（含恢复动作与错误态区分）
- [x] Task 11: 标签元数据持久化与恢复已落地（含 private partition/lifecycle 元数据）
- [x] Task 12: DOM `<webview>` 已从主浏览路径移除，仅保留兼容用途（`contentHost !== 'webcontentsview'`）

## Remaining Follow-ups

- Passkey / WebAuthn: 当前已完成诊断与基线记录，仍需针对目标站点完成兼容性补丁验证
- Manual regression matrix: 需要按最新剩余计划执行端到端人工回归
