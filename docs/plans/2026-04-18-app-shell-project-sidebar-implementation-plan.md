# App Shell Project Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new app-level shell with a global, resizable, collapsible project sidebar on the left and keep the current Browser intact on the right.

**Architecture:** Introduce a new `AppShell` above `Browser`, create a dedicated sidebar store for scan roots and UI state, add Electron IPC for scan-root repository discovery with depth limit 3, and route sidebar clicks into Browser tabs using a centralized reuse-by-path rule.

**Tech Stack:** Vue 3, Composition API, Electron IPC, existing Browser/NewTabPage route types, localStorage persistence

---

### Task 1: Add the application shell skeleton

**Files:**
- Create: `src/components/app/AppShell.vue`
- Modify: `src/App.vue`

**Step 1: Create the shell component**

- Render a left sidebar slot/column and a right Browser column.
- Keep the initial layout static before resize/collapse logic is added.

**Step 2: Update the root app**

- Replace direct `Browser` mounting in `src/App.vue` with `AppShell`.
- Keep the global confirm dialog wiring unchanged.

**Step 3: Verify the app still boots**

Run: `npm run build`
Expected: build succeeds with the new shell component compiled

**Step 4: Commit**

```bash
git add src/App.vue src/components/app/AppShell.vue
git commit -m "feat: add app shell layout"
```

### Task 2: Add a dedicated project sidebar store

**Files:**
- Create: `src/stores/projectSidebarStore.js`

**Step 1: Define the store state**

- Add state for:
  - `scanRoots`
  - `sidebarWidth`
  - `sidebarCollapsed`
  - `searchQuery`
  - `expandedRootPaths`

**Step 2: Add persistence helpers**

- Restore from localStorage on init.
- Persist changes when state mutates.

**Step 3: Add actions**

- `addScanRoot(path)`
- `removeScanRoot(path)`
- `setSidebarWidth(width)`
- `setSidebarCollapsed(boolean)`
- `toggleRootExpanded(path)`
- `expandAllRoots()`
- `collapseAllRoots()`
- `setScanResults(path, result)`

**Step 4: Verify store import safety**

Run: `npm run build`
Expected: build succeeds with no module import errors

**Step 5: Commit**

```bash
git add src/stores/projectSidebarStore.js
git commit -m "feat: add project sidebar store"
```

### Task 3: Add Electron IPC for scan-root discovery

**Files:**
- Modify: `electron/ipc/projects.js`
- Modify: `electron/preload.js`

**Step 1: Add a new IPC handler**

- Add a handler like `getScanRootRepositories`.
- Input: `{ path }`
- Output:
  - root metadata
  - child repositories discovered within depth 3

**Step 2: Implement root detection**

- Check whether the root itself is a Git repo.
- Include root metadata in the response.

**Step 3: Implement bounded child scanning**

- Traverse child directories only to depth 3.
- Collect Git repositories only once per absolute path.
- Return stable ordering.

**Step 4: Expose the API in preload**

- Add `window.electronAPI.getScanRootRepositories`.

**Step 5: Verify the backend still builds through the app build**

Run: `npm run build`
Expected: preload and renderer compile, no IPC registration errors

**Step 6: Commit**

```bash
git add electron/ipc/projects.js electron/preload.js
git commit -m "feat: add scan root repository discovery"
```

### Task 4: Build the sidebar UI

**Files:**
- Create: `src/components/project-sidebar/ProjectSidebar.vue`
- Create: `src/components/project-sidebar/ProjectSidebarRootItem.vue`
- Modify: `src/components/app/AppShell.vue`

**Step 1: Render the sidebar header**

- Add buttons for:
  - add directory
  - expand all
  - collapse all
  - collapse sidebar
- Add search input.

**Step 2: Render scan roots**

- Render each root item with:
  - root name
  - root path
  - git/non-git marker
  - expand toggle

**Step 3: Render child repositories**

- Show child Git repositories under each root.
- Use the persisted expansion state.

**Step 4: Wire directory chooser**

- Use `window.electronAPI.showOpenDialog` with directory selection.
- On success, add the root and trigger scan.

**Step 5: Verify the shell renders and basic interactions work**

Run: `npm run build`
Expected: sidebar components compile cleanly

**Step 6: Commit**

```bash
git add src/components/app/AppShell.vue src/components/project-sidebar/ProjectSidebar.vue src/components/project-sidebar/ProjectSidebarRootItem.vue
git commit -m "feat: add global project sidebar"
```

### Task 5: Add scan orchestration and restore behavior

**Files:**
- Modify: `src/stores/projectSidebarStore.js`
- Modify: `src/components/app/AppShell.vue`
- Modify: `src/components/project-sidebar/ProjectSidebar.vue`

**Step 1: Trigger scans when roots are added**

- After `addScanRoot`, call `getScanRootRepositories`.
- Store result under the root entry.

**Step 2: Restore scans on app start**

- On shell mount, load persisted roots.
- Re-run scans in the background.

**Step 3: Keep UI responsive during refresh**

- Preserve existing root rows while refreshing.
- Update scan results in place when async results arrive.

**Step 4: Verify state restore and refresh do not break build**

Run: `npm run build`
Expected: build succeeds and no undefined API references remain

**Step 5: Commit**

```bash
git add src/stores/projectSidebarStore.js src/components/app/AppShell.vue src/components/project-sidebar/ProjectSidebar.vue
git commit -m "feat: restore and refresh sidebar scan roots"
```

### Task 6: Centralize project tab open/reuse logic

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/app/AppShell.vue`
- Modify: `src/components/browser/NewTabPage.vue`

**Step 1: Add a Browser-level open-by-path API**

- Expose or route a method that accepts:
  - `path`
  - `type` (`single-project` or `clone-directory`)

**Step 2: Implement reuse-by-path**

- Search existing browser tabs for same route type + same absolute path.
- If found, activate it.
- Otherwise create a new tab.

**Step 3: Call the new API from the sidebar**

- Root click:
  - git root -> `single-project`
  - non-git root -> `clone-directory`
- child repo click -> `single-project`

**Step 4: Verify existing Browser interactions still compile**

Run: `npm run build`
Expected: build succeeds and route props stay valid

**Step 5: Commit**

```bash
git add src/components/app/AppShell.vue src/components/browser/Browser.vue src/components/browser/NewTabPage.vue
git commit -m "feat: reuse project tabs by absolute path"
```

### Task 7: Convert GitProject into a right-pane directory page

**Files:**
- Modify: `src/components/git/GitProject.vue`

**Step 1: Remove the embedded left project list from the redesigned shell path**

- Keep `GitProject` focused on directory-content behavior.
- Avoid nested sidebars inside the new app layout.

**Step 2: Preserve existing project detail navigation**

- Keep emitting navigation events as needed for right-side content behavior.

**Step 3: Guard compatibility**

- If necessary, support a compatibility mode while the new shell is active.

**Step 4: Verify the component still builds**

Run: `npm run build`
Expected: no template or prop regressions

**Step 5: Commit**

```bash
git add src/components/git/GitProject.vue
git commit -m "refactor: simplify git project page for app shell"
```

### Task 8: Add sidebar resize and collapse behavior

**Files:**
- Modify: `src/components/app/AppShell.vue`
- Modify: `src/stores/projectSidebarStore.js`

**Step 1: Add drag-resize interaction**

- Constrain width to reasonable min/max values.
- Persist width changes.

**Step 2: Add collapse behavior**

- Support explicit collapse/expand.
- Preserve last expanded width.

**Step 3: Verify shell layout remains stable**

Run: `npm run build`
Expected: build succeeds and no event handler issues remain

**Step 4: Commit**

```bash
git add src/components/app/AppShell.vue src/stores/projectSidebarStore.js
git commit -m "feat: add sidebar resize and collapse"
```

### Task 9: Add search and expand/collapse-all behavior

**Files:**
- Modify: `src/components/project-sidebar/ProjectSidebar.vue`
- Modify: `src/stores/projectSidebarStore.js`

**Step 1: Implement filtered rendering**

- Filter by root name/path and child repo name/path.
- Preserve persisted expansion state outside filtered mode.

**Step 2: Add expand-all / collapse-all**

- Apply actions across all roots.

**Step 3: Verify filtering does not break rendering**

Run: `npm run build`
Expected: build succeeds and computed filtering remains stable

**Step 4: Commit**

```bash
git add src/components/project-sidebar/ProjectSidebar.vue src/stores/projectSidebarStore.js
git commit -m "feat: add sidebar search and expansion controls"
```

### Task 10: Final verification and cleanup

**Files:**
- Modify: any touched files as needed

**Step 1: Run full verification**

Run: `npm run build`
Expected: successful production build

**Step 2: Review for stale code paths**

- Remove dead imports.
- Remove obsolete shell-specific duplication.

**Step 3: Update docs if the new layout needs usage notes**

- Add short README note only if behavior changed materially for users.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: redesign app shell with global project sidebar"
```
