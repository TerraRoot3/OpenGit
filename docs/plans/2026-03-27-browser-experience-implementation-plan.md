# Browser Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Incrementally close key browser UX gaps in OpenGit with user-visible improvements first, then structural stabilization.

**Architecture:** Keep `Browser.vue` as orchestrator, reduce WebView-side implicit behaviors, and add explicit UI feedback + keyboard behavior. Implement in isolated, reversible tasks with build verification after each task.

**Tech Stack:** Vue 3 (`<script setup>`), Electron webview, Vite

---

### Task 1: Global Loading Progress Bar

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Test: manual verification in Browser tab

**Step 1: Add progress state per active tab load session**
- Add `loadingProgress` and `loadingProgressVisible` in `Browser.vue`
- Create timer-driven progress helper (`startLoadingProgress`, `finishLoadingProgress`, `resetLoadingProgress`)

**Step 2: Bind progress UI in toolbar area**
- Add top-level progress bar element in browser container
- Show bar during webview loading and hide after completion

**Step 3: Wire events**
- In `onLoadStart`, call `startLoadingProgress`
- In `onLoadStop` and `onLoadFail`, call `finishLoadingProgress`
- On tab switch, sync with active tab loading state

**Step 4: Verify**
- Run: `npm run build`
- Manual: open slow site, confirm progress starts/advances/completes smoothly

### Task 2: Address Bar Keyboard Behavior

**Files:**
- Modify: `src/components/browser/Browser.vue`

**Step 1: Add global shortcuts**
- `Cmd/Ctrl+L`: focus/select URL input
- `Cmd/Ctrl+R`: refresh active tab

**Step 2: Enhance input submit behavior**
- `Alt+Enter`: open input URL in new tab
- `Enter`: keep current behavior
- `Esc`: close suggestions and keep input state stable

**Step 3: Verify**
- Run: `npm run build`
- Manual: test key combos on Mac/Windows style mappings

### Task 3: Error Feedback and Retry

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/webview/WebView.vue`

**Step 1: Capture and store load failure state by tab**
- Persist `errorCode/errorDescription/failedUrl` on tab object

**Step 2: Add non-intrusive error toast/panel in browser content area**
- Show only for active tab with failure state
- Provide `Retry` action invoking current tab reload

**Step 3: Verify**
- Run: `npm run build`
- Manual: open invalid URL / disconnect network and validate retry path

### Task 4: WebView Password Monitoring Cost Control

**Files:**
- Modify: `src/components/webview/WebView.vue`

**Step 1: Replace broad polling with scoped lifecycle**
- Start monitoring only on detected login-like pages
- Stop monitoring immediately on navigation away or tab inactive

**Step 2: Remove duplicate listener injection paths**
- Keep one injection strategy with guard flag

**Step 3: Verify**
- Run: `npm run build`
- Manual: login flow still captures save/update scenarios

### Task 5: Progress Documentation Update

**Files:**
- Modify: `docs/plans/2026-03-27-browser-experience-design.md`
- Modify: `README.md` (optional short changelog section)

**Step 1: Mark completed steps**
- Update checklist in design doc after each merged task

**Step 2: Summarize user-visible changes**
- Keep concise release-note style entries

**Step 3: Verify**
- Ensure docs match actual shipped behavior

### Task 6: Passkey / WebAuthn Capability Investigation

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/Browser.vue`
- Test: manual verification on passkey-enabled login pages

**Step 1: Establish current capability baseline**
- Confirm Electron version and embedded Chromium capability against target passkey flows
- Identify whether current failure is API exposure, mediation UI, session policy, or platform authenticator integration

**Step 2: Normalize passkey-related browser behavior**
- Add explicit detection for WebAuthn availability in active webview
- Surface unsupported / partially supported state in Browser diagnostics UI instead of silent failure

**Step 3: Verify**
- Manual: test `navigator.credentials` / WebAuthn flow on at least one real 2FA passkey page
- Record whether behavior is full support, partial support, or blocked by Electron version

### Task 7: Download Manager Foundation

**Files:**
- Modify: `electron/main.js`
- Create: `src/components/browser/DownloadPanel.vue`
- Modify: `src/components/browser/Browser.vue`
- Modify: `electron/preload.js`

**Step 1: Capture download events in Electron**
- Use session download hooks to track start/progress/success/failure
- Expose download state to renderer through IPC

**Step 2: Add minimal in-app download UI**
- Show current download list, progress, retry/open-in-folder actions

**Step 3: Verify**
- Manual: download a file, confirm progress and saved-path behavior

### Task 8: Session and Permission Model

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/browser/Browser.vue`
- Create: `src/components/browser/SitePermissionPanel.vue`

**Step 1: Stop blanket allow-all permission behavior**
- Replace unconditional `callback(true)` / `return true` with policy-based handling

**Step 2: Introduce session modes**
- Support at least `persist:main` and one privacy session partition

**Step 3: Verify**
- Manual: test media/location/clipboard-style permissions on representative sites

### Task 9: Crash Recovery and Window Open Consistency

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/Browser.vue`

**Step 1: Add crash/unresponsive handlers**
- Capture renderer crash and webview process failure events
- Show recover / reload actions

**Step 2: Unify new-window strategy**
- Converge site popup handling to one predictable rule set

**Step 3: Verify**
- Manual: force crash or unavailable page case and validate recovery path

### Task 10: Browser Architecture Stabilization

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/webview/WebView.vue`
- Create: `src/components/browser/composables/` or equivalent extracted modules

**Step 1: Split Browser orchestration responsibilities**
- Extract address bar controller, tab persistence, and navigation state management

**Step 2: Split WebView feature layers**
- Separate favicon, password, and context-menu logic from base webview lifecycle

**Step 3: Verify**
- Run: `npm run build`
- Manual: confirm no regression in tab switching, loading, password flow, and navigation

## Recommended Execution Order

1. First complete the `WebContentsView` unified-tab migration spike documented in `docs/plans/2026-03-27-webcontentsview-tab-migration-plan.md`
2. Then resume Task 6: Passkey / WebAuthn Capability Investigation on the new architecture
3. Then Task 7: Download Manager Foundation
4. Then Task 8: Session and Permission Model
5. Then Task 9 and Task 10 on top of the new shell
