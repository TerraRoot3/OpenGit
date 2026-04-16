# ProjectDetail Git Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight Git monitor for the active `ProjectDetail` so branch, ahead/behind, file-status summary, and merge/rebase changes are detected from terminal-side Git activity without heavy constant refreshes.

**Architecture:** Add a lightweight main-process Git snapshot IPC built from `git status --porcelain=v2 --branch` plus Git-dir operation-state checks. In `ProjectDetail`, poll only while the detail tab is active and the document is visible; when the snapshot signature changes, derive a minimal refresh plan and call the existing `queueProjectRefresh(...)` path.

**Tech Stack:** Electron IPC, Node.js child-process Git calls, Vue 3 Composition API, Vite

---

### Task 1: Extract lightweight snapshot helpers

**Files:**
- Create: `electron/ipc/project-git-monitor.js`
- Test: `scripts/test-project-git-monitor.mjs`

**Step 1: Write the failing test**

Add assertions for:
- parsing `git status --porcelain=v2 --branch` into branch and ahead/behind
- counting changed/staged/untracked/conflicted files from porcelain lines
- generating a stable `signature`

**Step 2: Run test to verify it fails**

Run: `node scripts/test-project-git-monitor.mjs`
Expected: FAIL because helper module does not exist yet.

**Step 3: Write minimal implementation**

Create pure helpers in `electron/ipc/project-git-monitor.js`:
- `parseProjectGitMonitorPorcelain(stdout)`
- `buildProjectGitMonitorSnapshot(input)`

Keep parsing scoped to fields needed by the design only.

**Step 4: Run test to verify it passes**

Run: `node scripts/test-project-git-monitor.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ipc/project-git-monitor.js scripts/test-project-git-monitor.mjs
git commit -m "test: add project git monitor helpers"
```

### Task 2: Expose snapshot IPC to renderer

**Files:**
- Modify: `electron/ipc/branch.js`
- Modify: `electron/preload.js`
- Test: `scripts/test-project-git-monitor.mjs`

**Step 1: Write the failing test**

Extend the test to cover:
- merge/rebase flags folded into snapshot builder
- final snapshot shape suitable for preload/renderer consumption

**Step 2: Run test to verify it fails**

Run: `node scripts/test-project-git-monitor.mjs`
Expected: FAIL on missing operation-state handling.

**Step 3: Write minimal implementation**

In `electron/ipc/branch.js`:
- register `get-project-git-monitor-snapshot`
- run lightweight Git commands only
- detect merge/rebase state from Git directory
- return `{ success, data }`

In `electron/preload.js`:
- expose `getProjectGitMonitorSnapshot`

**Step 4: Run test to verify it passes**

Run: `node scripts/test-project-git-monitor.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ipc/branch.js electron/preload.js scripts/test-project-git-monitor.mjs
git commit -m "feat: expose project git monitor snapshot"
```

### Task 3: Add frontend refresh decision helpers

**Files:**
- Create: `src/components/git/projectDetailGitMonitor.mjs`
- Test: `scripts/test-project-detail-git-monitor.mjs`

**Step 1: Write the failing test**

Cover:
- no previous snapshot -> no refresh request, only state baseline
- branch change -> branches + branch status + file status + commit history
- ahead/behind change -> branch status + commit history
- file summary change -> file status only
- merge/rebase state change -> branch status + file status

**Step 2: Run test to verify it fails**

Run: `node scripts/test-project-detail-git-monitor.mjs`
Expected: FAIL because helper module does not exist.

**Step 3: Write minimal implementation**

Create helpers:
- `shouldRunProjectGitMonitor({ isActive, isVisible, path })`
- `deriveProjectGitMonitorRefreshRequest(previousSnapshot, nextSnapshot)`

Keep output aligned with `queueProjectRefresh(...)` inputs.

**Step 4: Run test to verify it passes**

Run: `node scripts/test-project-detail-git-monitor.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/git/projectDetailGitMonitor.mjs scripts/test-project-detail-git-monitor.mjs
git commit -m "test: add project detail git monitor refresh rules"
```

### Task 4: Integrate polling into ProjectDetail

**Files:**
- Modify: `src/components/git/ProjectDetail.vue`
- Modify: `src/components/git/projectDetailRefresh.mjs`
- Test: `scripts/test-project-detail-git-monitor.mjs`

**Step 1: Write the failing test**

Extend the frontend helper test with:
- monitor starts only when active and visible
- signature changes map to correct refresh request
- signature unchanged does not request refresh

**Step 2: Run test to verify it fails**

Run: `node scripts/test-project-detail-git-monitor.mjs`
Expected: FAIL on missing lifecycle or refresh mapping.

**Step 3: Write minimal implementation**

In `ProjectDetail.vue`:
- track last monitor snapshot
- start/stop polling based on `props.isActive` and document visibility
- call `window.electronAPI.getProjectGitMonitorSnapshot({ path })`
- when snapshot signature changes, call `queueProjectRefresh(...)`

Keep polling local to this component. Do not introduce global timers.

**Step 4: Run test to verify it passes**

Run: `node scripts/test-project-detail-git-monitor.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/git/ProjectDetail.vue src/components/git/projectDetailRefresh.mjs scripts/test-project-detail-git-monitor.mjs
git commit -m "feat: poll git monitor for active project detail"
```

### Task 5: Verify end-to-end behavior

**Files:**
- Modify: none unless fixes are needed

**Step 1: Run targeted tests**

Run:
```bash
node scripts/test-project-git-monitor.mjs
node scripts/test-project-detail-git-monitor.mjs
```

Expected: both PASS

**Step 2: Run build verification**

Run:
```bash
npm run build
```

Expected: build succeeds without new errors

**Step 3: Manual verification**

In a project detail page:
- use terminal to run `git checkout <other-branch>`
- use terminal to create/modify/stage a file
- use terminal to run `git commit`, `git pull`, or `git push`

Confirm within about 2 seconds:
- current branch updates
- ahead/behind updates
- file status updates
- commit history refreshes when expected

**Step 4: Commit**

```bash
git add .
git commit -m "feat: monitor git state for active project detail"
```
