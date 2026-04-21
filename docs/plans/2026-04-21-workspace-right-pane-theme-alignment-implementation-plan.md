# Workspace Right Pane Theme Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the ProjectWorkspace right pane with the ProjectDetail theme variables so editor and preview surfaces no longer rely on hard-coded dark backgrounds.

**Architecture:** Replace hard-coded right-pane background colors in `ProjectWorkspace.vue` and `WorkspaceTextEditor.vue` with `--app-project-bg`-driven surfaces. Keep overlays and diff decorations unchanged while making Monaco resolve its canvas background from the same theme variable.

**Tech Stack:** Vue 3 SFC, Monaco Editor theme config, scoped CSS

---

### Task 1: Align workspace right-pane containers

**Files:**
- Modify: `src/components/git/ProjectWorkspace.vue`

**Step 1: Replace hard-coded right-pane surfaces**

Update the editor pane, preview body, image preview, PDF preview, and binary hint backgrounds to use `var(--app-project-bg)` rather than `#17181a`.

**Step 2: Keep tab strip semantics**

Leave the tab bar and selection states intact so only the base pane background changes.

### Task 2: Align Monaco editor background

**Files:**
- Modify: `src/components/git/WorkspaceTextEditor.vue`

**Step 1: Resolve editor background from app variables**

Add a helper that reads `--app-project-bg` from computed styles with a stable fallback and use it for the Monaco theme definition.

**Step 2: Update editor wrapper background**

Replace the editor wrapper hard-coded background with `var(--app-project-bg)` so the Monaco canvas and outer container stay visually aligned.

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run build**

Run: `npm run build`
Expected: PASS
