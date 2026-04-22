# Workspace Editor Background Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep workspace switching smooth while reducing background Monaco editor instance retention across project pages.

**Architecture:** Move workspace editor model and view state caches to module scope, keyed by project path, then make `WorkspaceTextEditor` dispose only the Monaco editor instance after a short inactive delay. On reactivation, recreate the editor and reattach cached model, view state, and diff decorations.

**Tech Stack:** Vue 3 `<script setup>`, Monaco Editor, module-scoped JS caches, existing diagnostics panel

---

### Task 1: Document the design

**Files:**
- Create: `docs/plans/2026-04-22-workspace-editor-background-release-design.md`
- Create: `docs/plans/2026-04-22-workspace-editor-background-release-implementation-plan.md`

**Step 1: Save the design**

Record the chosen approach: keep workspace state, share model/view-state infrastructure, delay-release only the editor instance.

**Step 2: Save the implementation plan**

Record the exact files to change and the verification command.

### Task 2: Introduce shared workspace editor sessions

**Files:**
- Modify: `src/components/git/WorkspaceTextEditor.vue`

**Step 1: Move model/view state caches to module scope**

Create a project-scoped session map so Monaco models and view states are no longer owned by a single component instance.

**Step 2: Add helper functions**

Implement helpers for:

- resolving a workspace session by `projectPath`
- reusing existing models
- saving/restoring view state
- disposing stale models without dropping active tab state

**Step 3: Add lightweight debug stats**

Expose live session count, live editor count, and model count for the diagnostics panel.

### Task 3: Delay-release inactive editor instances

**Files:**
- Modify: `src/components/git/WorkspaceTextEditor.vue`

**Step 1: Separate editor instance lifecycle from model lifecycle**

Create explicit `createEditorInstance`, `destroyEditorInstance`, and delayed-release helpers.

**Step 2: Dispose only the editor instance after background delay**

When `isActive` becomes false, start a short timer. If the editor stays inactive until timeout, dispose the editor instance and observer, but keep session caches.

**Step 3: Recreate the editor on return**

When `isActive` becomes true again, cancel the destroy timer, recreate the editor if needed, then restore the active file model, view state, and diff decorations.

### Task 4: Surface workspace stats in diagnostics

**Files:**
- Modify: `src/main.js`
- Modify: `src/components/HomePage.vue`

**Step 1: Add workspace editor stats to debug output**

Extend `window.__openGitDebug.getMemoryStats()` so renderer diagnostics include shared workspace editor session counts.

**Step 2: Show the stats in diagnostics UI**

Add cards for workspace editor sessions, live editors, and model count.

### Task 5: Verify behavior

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build.

**Step 2: Manual verification**

Open several project pages, switch between them, then check diagnostics:

- `Workspace mounted` can remain high
- live Monaco editor count should drop after background delay
- switching back to a recent project should preserve active file and restore cursor/scroll state
