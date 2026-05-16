# Project Sidebar Floating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the project sidebar default to a floating drawer with a persistent narrow rail, while supporting a pinned layout mode that occupies left-side space and keeps resize behavior.

**Architecture:** Replace the current collapsed-vs-pane binary layout with a two-axis state model: mode (`floating` vs `pinned`) and open state. `AppShell` owns the rail, floating drawer layer, and pinned pane shell; `ProjectSidebar` becomes a reusable body with explicit pin/close controls; the sidebar store persists the new mode and open state.

**Tech Stack:** Vue 3 Composition API, Pinia-style custom store, Electron persisted config, scoped CSS in Vue SFCs.

---

### Task 1: Upgrade sidebar persisted state model

**Files:**
- Modify: `src/stores/projectSidebarStore.js`

**Step 1: Add new store fields**

Add:
- `sidebarMode = ref('floating')`
- `sidebarOpen = ref(false)`

Keep:
- `sidebarWidth`
- `expandedRootPaths`
- `scanRoots`

**Step 2: Replace persisted payload**

Update payload read/write to store:
- `sidebarMode`
- `sidebarOpen`
- `sidebarWidth`
- `expandedRootPaths`
- `scanRoots`

Drop persisted use of `sidebarCollapsed`.

**Step 3: Add migration**

When old payload only has `sidebarCollapsed`, migrate to:
- `sidebarMode = 'floating'`
- `sidebarOpen = false`

**Step 4: Add explicit setters**

Expose:
- `setSidebarMode(mode)`
- `setSidebarOpen(value)`
- `openSidebar()`
- `closeSidebar()`
- `toggleSidebarOpen()`

**Step 5: Verify persistence**

Run: `npm run build`
Expected: PASS

### Task 2: Refactor AppShell layout into rail + floating layer + pinned pane

**Files:**
- Modify: `src/components/app/AppShell.vue`

**Step 1: Replace current sidebar branch**

Remove the current:
- `v-if="sidebarCollapsed"` collapsed rail
- `v-else` sidebar pane

Replace with:
- always-rendered rail
- conditional floating drawer layer
- conditional pinned pane

**Step 2: Add floating overlay behavior**

Implement:
- left drawer panel in floating mode
- backdrop overlay
- clicking overlay closes drawer

**Step 3: Keep pinned pane behavior**

Only show:
- sidebar pane
- resizer

when `sidebarMode === 'pinned'`.

**Step 4: Update Browser inset logic**

Compute `leadingTabInset` based on:
- floating mode: rail-only inset
- pinned mode: current sidebar-aware inset

**Step 5: Close floating drawer after navigation**

When opening a group or repository in floating mode:
- keep navigation logic
- also close drawer

### Task 3: Update ProjectSidebar controls for pin/close actions

**Files:**
- Modify: `src/components/project-sidebar/ProjectSidebar.vue`

**Step 1: Replace collapse prop/emits**

Stop using the old collapse-only control.

Add props:
- `mode`
- `floating`

Add emits:
- `pin-sidebar`
- `unpin-sidebar`
- `close-sidebar`

**Step 2: Update header action buttons**

Show:
- pin button in floating mode
- unpin button in pinned mode
- close button for drawer closing

**Step 3: Keep existing body behavior**

Do not change:
- search
- root list
- repo list
- context menu
- refresh actions

### Task 4: Hook interactions between AppShell and ProjectSidebar

**Files:**
- Modify: `src/components/app/AppShell.vue`
- Modify: `src/components/project-sidebar/ProjectSidebar.vue`

**Step 1: Wire pin action**

When sidebar emits pin action:
- set mode to `pinned`
- set open to `true`

**Step 2: Wire unpin action**

When sidebar emits unpin action:
- set mode to `floating`
- keep drawer open

**Step 3: Wire close action**

When sidebar emits close action:
- close drawer if floating

**Step 4: Wire rail button**

Rail project button should:
- toggle floating drawer when in floating mode
- remain visible in pinned mode without collapsing the pinned pane

### Task 5: Update styling and interaction polish

**Files:**
- Modify: `src/components/app/AppShell.vue`
- Modify: `src/components/project-sidebar/ProjectSidebar.vue`

**Step 1: Add floating drawer styles**

Implement:
- slide-in panel
- overlay backdrop
- shadow
- correct z-index

**Step 2: Preserve pinned pane visuals**

Keep current:
- sidebar background
- resizer
- internal scroll behavior

**Step 3: Ensure right-click menus remain visible**

Verify Teleport-based menus still sit above drawer and overlay.

### Task 6: Verify behavior end-to-end

**Files:**
- Modify only if needed after verification

**Step 1: Run build**

Run: `npm run build`
Expected: PASS

**Step 2: Manual verification checklist**

Confirm:
- app launches with rail visible and sidebar closed
- rail opens floating drawer
- clicking outside closes drawer
- floating click on project auto-closes drawer
- pinning switches to occupying layout mode
- pinned mode keeps resize working
- reopening app restores mode and width

**Step 3: Commit**

```bash
git add src/stores/projectSidebarStore.js src/components/app/AppShell.vue src/components/project-sidebar/ProjectSidebar.vue docs/plans/2026-05-16-project-sidebar-floating-design.md docs/plans/2026-05-16-project-sidebar-floating-implementation-plan.md
git commit -m "feat: add floating project sidebar mode"
```
